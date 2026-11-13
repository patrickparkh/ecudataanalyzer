/* 시험 데이터 비교 보고서 — 계산 엔진
 *
 * 화면(app.js)은 판정하지 않는다. 파일 읽기·열 매핑·구간 추출·지표·유사 구간 탐색·유사성 판정·
 * 보고서 생성 조건은 전부 여기서 계산하고 test/logic.test.js 로 고정한다. 브라우저와 node 양쪽에서 읽힌다.
 *
 * 채널 여섯 가지 (열 매핑 화면에서 원본 열을 고른다)
 *   time 시간(s) · speed 차속(km/h) · pedal 페달(%) · load 부하율(%) · rpm 엔진회전수 · fuel 연료유량
 *
 * 흐름
 *   aoa(엑셀·CSV 의 행 배열) → tableFromAoa → guessMap → build(series)
 *   → findSegments(criteria) → metrics          : 구간 지표(가속 시간·평균 부하율·연비 …)
 *   → search(레퍼런스 창, 대상 series)            : 페달·부하율·회전수 패턴이 닮은 창 찾기
 *   → compare(정렬한 두 창)                       : 상관계수·회전수 구간별 부하율 차이·판정 문장
 *   → reportGate(사용자 확인)                     : 모든 비교를 사용자가 확인해야 보고서를 만든다
 */
(function (root) {
  'use strict';

  var CH = ['time', 'speed', 'pedal', 'load', 'rpm', 'fuel'];
  var LABEL = { time: '시간', speed: '차속', pedal: '페달', load: '부하율', rpm: '엔진회전수', fuel: '연료유량' };
  var UNIT = { time: 's', speed: 'km/h', pedal: '%', load: '%', rpm: 'rpm', fuel: 'kg/h' };

  /* ---------- 열 이름 ---------- */
  // 열 이름이 조금 달라도 읽는다. 늘릴 때는 코드가 아니라 이 표를 늘린다.
  var ALIASES = {
    time: ['시간', '경과시간', '측정시간', 'time', 't', 'sec', 'second', 'seconds', 'timestamp', 'elapsed', 'elapsedtime'],
    speed: ['차속', '속도', '차량속도', '주행속도', 'vehiclespeed', 'vehspd', 'vspd', 'speed', 'vs', 'kph', 'spd'],
    pedal: ['페달', '가속페달', '페달개도', '악셀', '엑셀', 'accelpedal', 'acceleratorpedal', 'pedalposition', 'app', 'aps', 'pedal', 'accped'],
    load: ['부하율', '부하', '엔진부하', '엔진부하율', 'engineload', 'engload', 'load', 'calcload'],
    rpm: ['엔진회전수', '회전수', '엔진속도', '엔진rpm', 'rpm', 'enginespeed', 'engspd', 'engrpm', 'ne'],
    fuel: ['연료유량', '연료', '연료소모량', '수소유량', '수소소모량', '수소', 'fuelflow', 'fuelrate', 'fuel', 'h2flow', 'h2rate', 'h2']
  };
  // 괄호 속 단위·공백·기호를 지우고 소문자로 맞춘다. "차속(km/h)" → "차속", "H2_Flow" → "h2flow"
  function key(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, '').replace(/[\s_\-.:/#]/g, '');
  }
  function unitOf(s) { var m = String(s == null ? '' : s).match(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/); return m ? m[1].trim() : ''; }

  // 머리글마다 가장 잘 맞는 채널을 고른다. 정확히 같으면 1000점+길이, 포함이면 길이(3글자 이상 별칭만).
  // "EngineSpeed" 는 'speed'(5) 보다 'enginespeed'(11) 가 길어 회전수로 간다.
  function guessMap(headers) {
    var best = {};                        // ch -> { idx, score }
    headers.forEach(function (h, idx) {
      var k = key(h); if (!k) return;
      var top = null;
      CH.forEach(function (ch) {
        ALIASES[ch].forEach(function (a) {
          var sc = k === a ? 1000 + a.length : (a.length >= 3 && k.indexOf(a) >= 0 ? a.length : 0);
          if (sc && (!top || sc > top.score)) top = { ch: ch, score: sc };
        });
      });
      if (top && (!best[top.ch] || top.score > best[top.ch].score)) best[top.ch] = { idx: idx, score: top.score };
    });
    var map = {};
    CH.forEach(function (ch) { map[ch] = best[ch] ? best[ch].idx : -1; });
    return map;
  }

  /* ---------- 값 ---------- */
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v == null) return NaN;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');          // 소수점 쉼표 1,5
    else s = s.replace(/,/g, '');                                 // 천 단위 쉼표 1,234.5
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return +s;
  }
  // 초 · "mm:ss.s" · "hh:mm:ss.s" 를 초로 바꾼다.
  function parseTime(v) {
    if (typeof v === 'string') {
      var m = v.trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/);
      if (m) return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
      var m2 = v.trim().match(/^(\d+):(\d{1,2}\.\d+)$/);
      if (m2) return +m2[1] * 60 + +m2[2];
    }
    return toNum(v);
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var cnt = function (c) { return first.split(c).length - 1; };
    var del = [',', ';', '\t'].sort(function (a, b) { return cnt(b) - cnt(a); })[0];
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === del) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  /* ---------- 표 ---------- */
  function isNumCell(x) { return !isNaN(parseTime(x)); }
  function filled(r) { return r.filter(function (x) { return String(x == null ? '' : x).trim() !== ''; }); }
  // 위쪽 제목 줄을 건너뛰고 머리글을 찾는다 — 칸 2개 이상, 절반 넘게 글자.
  // 머리글 바로 아래 줄이 대부분 글자면 단위 줄로 본다(시험 장비가 흔히 그렇게 내보낸다).
  function tableFromAoa(aoa) {
    var issues = [], hi = -1;
    for (var i = 0; i < Math.min(aoa.length, 30); i++) {
      var f = filled(aoa[i] || []);
      if (f.length >= 2 && f.filter(function (x) { return !isNumCell(x); }).length > f.length / 2) { hi = i; break; }
    }
    if (hi < 0) return { headers: [], units: [], rows: [], issues: ['머리글 줄을 찾지 못했습니다. 첫 줄에 열 이름이 있어야 합니다.'] };
    if (hi > 0) issues.push('위쪽 ' + hi + '줄은 제목으로 보고 건너뛰었습니다.');
    var headers = aoa[hi].map(function (h) { return String(h == null ? '' : h).trim(); });
    var units = headers.map(unitOf), start = hi + 1;
    var nx = aoa[start] || [], nf = filled(nx);
    if (nf.length && nf.filter(function (x) { return !isNumCell(x); }).length > nf.length / 2) {
      nx.forEach(function (u, j) { if (String(u).trim() && !units[j]) units[j] = String(u).trim(); });
      start++; issues.push('머리글 아래 줄은 단위로 읽었습니다.');
    }
    var rows = aoa.slice(start).filter(function (r) { return r && filled(r).length; });
    return { headers: headers, units: units, rows: rows, issues: issues };
  }

  /* ---------- 시계열 ---------- */
  // opts.timeScale: 시간 열에 곱할 값(ms 면 0.001). 생략하면 열 이름·단위로 짐작한다.
  // opts.fuelUnit: 'kg/h' | 'L/h' | 'g/s'. g/s 는 kg/h 로 바꿔 둔다(×3.6).
  function build(table, map, opts) {
    opts = opts || {};
    var issues = [], hasCh = {};
    if (map.time < 0) return { ok: false, issues: ['시간 열을 지정해야 합니다.'] };
    var tu = (table.units[map.time] || '') + ' ' + (table.headers[map.time] || '');
    var ts = opts.timeScale || (/\bms\b|msec|밀리/i.test(tu) ? 0.001 : 1);
    var fu = opts.fuelUnit || 'kg/h';
    var t = [], ch = {}, bad = 0, back = 0, miss = {};
    CH.slice(1).forEach(function (c) { if (map[c] >= 0) { ch[c] = []; miss[c] = 0; } });
    table.rows.forEach(function (r) {
      var tv = parseTime(r[map.time]);
      if (isNaN(tv)) { bad++; return; }
      tv *= ts;
      if (t.length && tv <= t[t.length - 1]) { back++; return; }
      t.push(tv);
      Object.keys(ch).forEach(function (c) {
        var v = toNum(r[map[c]]);
        if (!isNaN(v) && c === 'fuel' && fu === 'g/s') v *= 3.6;
        if (isNaN(v)) miss[c]++;
        ch[c].push(v);
      });
    });
    if (bad) issues.push('시간을 읽지 못한 ' + bad + '줄은 뺐습니다.');
    if (back) issues.push('시간이 앞으로 가지 않는 ' + back + '줄(중복·역순)은 뺐습니다.');
    Object.keys(ch).forEach(function (c) {
      if (miss[c] === t.length) { issues.push(LABEL[c] + ' 열에 숫자가 없어 쓰지 않습니다.'); delete ch[c]; return; }
      if (miss[c]) { fillGaps(t, ch[c]); issues.push(LABEL[c] + ' 빈 값 ' + miss[c] + '개는 앞뒤 값으로 보간했습니다.'); }
      hasCh[c] = true;
    });
    if (t.length < 2) return { ok: false, issues: issues.concat(['쓸 수 있는 줄이 2줄 미만입니다.']) };
    if (!hasCh.speed) issues.push('차속 열이 없어 가속·감속 조건을 쓸 수 없습니다.');
    return { ok: true, t: t, ch: ch, has: hasCh, fuelBase: fu === 'L/h' ? 'L' : 'kg', timeScale: ts, issues: issues,
      dt: medianDt(t) };
  }
  function fillGaps(t, y) {
    var n = y.length, i, prev = -1;
    for (i = 0; i < n; i++) {
      if (!isNaN(y[i])) {
        if (prev < 0) for (var a = 0; a < i; a++) y[a] = y[i];
        else for (var b = prev + 1; b < i; b++) y[b] = y[prev] + (y[i] - y[prev]) * (t[b] - t[prev]) / (t[i] - t[prev]);
        prev = i;
      }
    }
    for (i = prev + 1; i < n; i++) y[i] = y[prev];
  }
  function medianDt(t) {
    var d = []; for (var i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
    d.sort(function (a, b) { return a - b; }); return d[Math.floor(d.length / 2)];
  }

  /* ---------- 보간·적분 ---------- */
  function lowerIdx(t, x) { var lo = 0, hi = t.length - 1; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; } return lo; }
  function at(t, y, x) {
    var n = t.length; if (x <= t[0]) return y[0]; if (x >= t[n - 1]) return y[n - 1];
    var i = lowerIdx(t, x); return y[i] + (y[i + 1] - y[i]) * (x - t[i]) / (t[i + 1] - t[i]);
  }
  function trapz(t, y) { var s = 0; for (var i = 1; i < t.length; i++) s += (t[i] - t[i - 1]) * (y[i] + y[i - 1]) / 2; return s; }
  // [t0, t1] 안의 샘플 + 양 끝 보간점
  function cut(s, t0, t1) {
    var out = { t: [t0], ch: {} }, idx = [];
    for (var i = lowerIdx(s.t, t0); i < s.t.length && s.t[i] < t1; i++) if (s.t[i] > t0) idx.push(i);
    idx.forEach(function (i) { out.t.push(s.t[i]); }); out.t.push(t1);
    Object.keys(s.ch).forEach(function (c) {
      var y = s.ch[c]; out.ch[c] = [at(s.t, y, t0)].concat(idx.map(function (i) { return y[i]; })).concat([at(s.t, y, t1)]);
    });
    return out;
  }

  /* ---------- 구간 추출 ---------- */
  // 가속·감속: { type:'speed', from:0, to:30, eps:0.5 }
  //   시작 = 차속이 from 을 지나는 순간(from 이 0 이면 eps — 정지 상태 잡음 때문에 0 은 '지나는' 순간이 없다)
  //   끝   = to 에 처음 닿는 순간. 둘 다 샘플 사이를 직선 보간한다.
  //   to 에 닿기 전에 다시 from 아래로 내려가면 그 시도는 버린다(가다 멈춘 것은 가속 구간이 아니다).
  // 채널 조건: { type:'cond', channel:'pedal', op:'>=', value:60, minDur:1 } — 조건이 이어진 동안
  function findSegments(s, crit) {
    var segs = [];
    if (crit.type === 'speed') {
      if (!s.ch.speed) return segs;
      var eps = crit.eps == null ? 0.5 : crit.eps;
      var a = +crit.from === 0 ? eps : +crit.from, b = +crit.to === 0 ? eps : +crit.to;
      if (a === b) return segs;
      var dir = b > a ? 1 : -1, v = s.ch.speed, t = s.t, st = null;
      var cross = function (i, th) { return t[i - 1] + (t[i] - t[i - 1]) * (th - v[i - 1]) / (v[i] - v[i - 1]); };
      for (var i = 1; i < t.length; i++) {
        var p = dir * v[i - 1], q = dir * v[i];
        if (st === null) {
          if (p < dir * a && q >= dir * a) st = cross(i, a);
          if (st !== null && p < dir * b && q >= dir * b) { segs.push(seg(st, cross(i, b))); st = null; }
        } else {
          if (q < dir * a) { st = null; continue; }
          if (p < dir * b && q >= dir * b) { segs.push(seg(st, cross(i, b))); st = null; }
        }
      }
      if (crit.maxDur) segs = segs.filter(function (x) { return x.t1 - x.t0 <= crit.maxDur; });
    } else if (crit.type === 'cond') {
      var y = s.ch[crit.channel]; if (!y) return segs;
      var test = OPS[crit.op] || OPS['>='], val = +crit.value, s0 = -1;
      for (var j = 0; j <= s.t.length; j++) {
        var on = j < s.t.length && test(y[j], val);
        if (on && s0 < 0) s0 = j;
        if (!on && s0 >= 0) {
          var x0 = s.t[s0], x1 = s.t[j - 1];
          if (x1 - x0 >= (+crit.minDur || 0) && x1 > x0) segs.push(seg(x0, x1));
          s0 = -1;
        }
      }
    }
    return segs;
  }
  var OPS = { '>=': function (a, b) { return a >= b; }, '<=': function (a, b) { return a <= b; },
    '>': function (a, b) { return a > b; }, '<': function (a, b) { return a < b; } };
  function seg(t0, t1) { return { t0: t0, t1: t1 }; }
  function describeCrit(c) {
    if (c.type === 'speed') return '차속 ' + c.from + '→' + c.to + ' km/h ' + (+c.to > +c.from ? '가속' : '감속');
    return LABEL[c.channel] + ' ' + c.op + ' ' + c.value + (c.minDur ? ' (' + c.minDur + '초 이상 지속)' : '');
  }

  /* ---------- 지표 ---------- */
  // 평균은 시간 가중(사다리꼴 적분 ÷ 구간 길이) — 샘플 간격이 고르지 않아도 맞다.
  // 연료량 = ∫유량 dt / 3600, 거리 = ∫차속 dt / 3600 (km), 연비 = 거리 ÷ 연료량.
  function metrics(s, t0, t1) {
    var w = cut(s, t0, t1), dur = t1 - t0, m = { t0: t0, t1: t1, dur: dur };
    var avg = function (c) { return w.ch[c] ? trapz(w.t, w.ch[c]) / dur : null; };
    var max = function (c) { return w.ch[c] ? Math.max.apply(null, w.ch[c]) : null; };
    if (w.ch.speed) {
      var vs = w.ch.speed;
      m.vStart = vs[0]; m.vEnd = vs[vs.length - 1];
      m.accel = (m.vEnd - m.vStart) / 3.6 / dur;
      m.dist = trapz(w.t, vs) / 3600;
    } else { m.vStart = m.vEnd = m.accel = m.dist = null; }
    ['pedal', 'load', 'rpm'].forEach(function (c) { m[c + 'Avg'] = avg(c); m[c + 'Max'] = max(c); });
    if (w.ch.fuel) {
      m.fuelUsed = trapz(w.t, w.ch.fuel) / 3600;
      m.fuelRate = m.fuelUsed * 3600 / dur;
      m.economy = m.dist != null && m.fuelUsed > 0 ? m.dist / m.fuelUsed : null;
    } else m.fuelUsed = m.fuelRate = m.economy = null;
    return m;
  }

  /* ---------- 다시 표본화 ---------- */
  function resample(s, t0, t1, dt, chans) {
    var n = Math.floor((t1 - t0) / dt + 1e-9) + 1, out = { t: [], ch: {} };
    for (var i = 0; i < n; i++) out.t.push(t0 + i * dt);
    chans.forEach(function (c) { if (s.ch[c]) out.ch[c] = out.t.map(function (x) { return at(s.t, s.ch[c], x); }); });
    return out;
  }

  /* ---------- 유사 구간 탐색 ---------- */
  // 정규화는 레퍼런스 창의 최소~최대로 한다(창마다 z-정규화를 하면 부하율이 통째로 9%p 높은 것도 '같은 모양'이 된다
  // — 그 차이가 바로 보고 싶은 것이다). 범위가 너무 좁으면 FLOOR 를 쓴다.
  var FLOOR = { pedal: 10, load: 10, rpm: 200, speed: 5, fuel: 0.2 };
  function search(refS, r0, r1, tgtS, opts) {
    opts = opts || {};
    var dt = opts.dt || 0.1, chans = (opts.chans || ['pedal', 'load', 'rpm']).filter(function (c) { return refS.ch[c] && tgtS.ch[c]; });
    var topK = opts.topK || 3;
    if (!chans.length) return { cands: [], chans: chans, reason: '두 데이터에 함께 있는 비교 채널이 없습니다.' };
    var R = resample(refS, r0, r1, dt, chans), N = R.t.length;
    var T = resample(tgtS, tgtS.t[0], tgtS.t[tgtS.t.length - 1], dt, chans), M = T.t.length;
    if (M < N) return { cands: [], chans: chans, reason: '대상 데이터가 레퍼런스 구간보다 짧습니다.' };
    var sc = {};
    chans.forEach(function (c) {
      var lo = Math.min.apply(null, R.ch[c]), hi = Math.max.apply(null, R.ch[c]);
      sc[c] = { lo: lo, span: Math.max(hi - lo, FLOOR[c] || 1) };
    });
    var dist = new Float64Array(M - N + 1);
    for (var k = 0; k <= M - N; k++) {
      var tot = 0;
      for (var ci = 0; ci < chans.length; ci++) {
        var c = chans[ci], a = R.ch[c], b = T.ch[c], sp = sc[c].span, ss = 0;
        for (var j = 0; j < N; j++) { var d = (b[k + j] - a[j]) / sp; ss += d * d; }
        tot += Math.sqrt(ss / N);
      }
      dist[k] = tot / chans.length;
    }
    var order = Array.prototype.slice.call(dist).map(function (d, i) { return i; }).sort(function (x, y) { return dist[x] - dist[y]; });
    var picked = [];
    for (var o = 0; o < order.length && picked.length < topK; o++) {
      var kk = order[o];
      if (picked.every(function (p) { return Math.abs(p - kk) >= N / 2; })) picked.push(kk);
    }
    return { chans: chans, dt: dt, n: N, cands: picked.map(function (kk, rank) {
      return { rank: rank + 1, t0: T.t[kk], t1: T.t[kk + N - 1], dist: dist[kk] };
    }) };
  }

  /* ---------- 비교 ---------- */
  function pearson(a, b) {
    var n = a.length, ma = 0, mb = 0, i; for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    var sab = 0, saa = 0, sbb = 0;
    for (i = 0; i < n; i++) { var x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    if (saa < 1e-12 || sbb < 1e-12) return null;      // 한쪽이 상수면 상관계수가 없다
    return sab / Math.sqrt(saa * sbb);
  }
  var DEF = { tol: 5, rMin: 0.9, covMin: 0.8, binW: 200, minN: 3 };
  function opt(o) { var r = {}; Object.keys(DEF).forEach(function (k) { r[k] = o && o[k] != null && o[k] !== '' && !isNaN(+o[k]) ? +o[k] : DEF[k]; }); return r; }

  // A·B 는 같은 간격·같은 길이로 다시 표본화한 두 창 { t, ch }.
  function compare(A, B, o) {
    o = opt(o);
    var out = { chans: {}, bins: [], opts: o };
    ['pedal', 'load', 'rpm', 'speed'].forEach(function (c) {
      if (!A.ch[c] || !B.ch[c]) return;
      var a = A.ch[c], b = B.ch[c], n = Math.min(a.length, b.length), se = 0, sa = 0, mx = 0;
      for (var i = 0; i < n; i++) { var d = b[i] - a[i]; se += d * d; sa += Math.abs(d); if (Math.abs(d) > mx) mx = Math.abs(d); }
      out.chans[c] = { r: pearson(a.slice(0, n), b.slice(0, n)), rmse: Math.sqrt(se / n), meanAbs: sa / n, maxAbs: mx,
        meanA: mean(a), meanB: mean(b) };
    });
    // 회전수 구간별 부하율 — 시각을 맞추지 않고 각자의 '회전수 → 부하율' 관계를 구간 평균으로 비교한다.
    if (A.ch.rpm && A.ch.load && B.ch.rpm && B.ch.load) {
      var g = {};
      var put = function (S, side) { S.ch.rpm.forEach(function (r, i) {
        var bi = Math.floor(r / o.binW); g[bi] = g[bi] || { a: [], b: [] }; g[bi][side].push(S.ch.load[i]); }); };
      put(A, 'a'); put(B, 'b');
      Object.keys(g).map(Number).sort(function (x, y) { return x - y; }).forEach(function (bi) {
        var e = g[bi], ok = e.a.length >= o.minN && e.b.length >= o.minN;
        out.bins.push({ lo: bi * o.binW, hi: (bi + 1) * o.binW, nA: e.a.length, nB: e.b.length,
          meanA: e.a.length ? mean(e.a) : null, meanB: e.b.length ? mean(e.b) : null,
          diff: ok ? mean(e.b) - mean(e.a) : null, used: ok,
          within: ok ? Math.abs(mean(e.b) - mean(e.a)) <= o.tol : null });
      });
    }
    var used = out.bins.filter(function (b) { return b.used; });
    var refBins = out.bins.filter(function (b) { return b.nA >= o.minN; });
    var bs = out.binStats = {
      n: used.length, refN: refBins.length,
      meanAbs: used.length ? mean(used.map(function (b) { return Math.abs(b.diff); })) : null,
      maxAbs: used.length ? Math.max.apply(null, used.map(function (b) { return Math.abs(b.diff); })) : null,
      withinShare: used.length ? used.filter(function (b) { return b.within; }).length / used.length : null,
      coverage: refBins.length ? used.length / refBins.length : null
    };
    var rs = Object.keys(out.chans).filter(function (c) { return c !== 'speed' && out.chans[c].r != null; });
    var minR = rs.length ? Math.min.apply(null, rs.map(function (c) { return out.chans[c].r; })) : null;
    var minRch = rs.filter(function (c) { return out.chans[c].r === minR; })[0];
    out.checks = [
      { id: 'bin', name: '회전수 구간별 부하율 차이(최대)', value: bs.maxAbs, limit: o.tol, unit: '%p', cmp: '≤', pass: bs.maxAbs != null && bs.maxAbs <= o.tol },
      { id: 'r', name: '상관계수(가장 낮은 채널' + (minRch ? ' · ' + LABEL[minRch] : '') + ')', value: minR, limit: o.rMin, unit: '', cmp: '≥', pass: minR != null && minR >= o.rMin },
      { id: 'cov', name: '회전수 구간 겹침', value: bs.coverage, limit: o.covMin, unit: '', cmp: '≥', pass: bs.coverage != null && bs.coverage >= o.covMin }
    ];
    out.verdict = !used.length || minR == null ? 'unknown' : out.checks.every(function (c) { return c.pass; }) ? 'similar' : 'different';
    out.sentence = sentence(out);
    return out;
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : null; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function sentence(c) {
    var b = c.binStats, o = c.opts;
    if (c.verdict === 'unknown') return '부하율·엔진회전수 채널이 두 데이터에 모두 있어야 판정할 수 있습니다.';
    var s = '엔진 회전수 구간(' + o.binW + ' rpm 단위) ' + b.n + '개에서 부하율 차이는 평균 ' + r1(b.meanAbs) + '%p, 최대 ' + r1(b.maxAbs) + '%p 입니다. ';
    s += '구간 ' + pct(b.withinShare) + '가 ±' + o.tol + '%p 이내로 수렴합니다. ';
    var r = c.checks[1];
    s += '페달·부하율·회전수 상관계수는 최소 ' + r.value.toFixed(3) + ' 입니다. ';
    if (c.verdict === 'similar') s += '세 기준을 모두 만족하므로 두 데이터는 유사하다고 볼 근거가 있습니다.';
    else s += '기준을 벗어난 항목이 있습니다 — ' + c.checks.filter(function (x) { return !x.pass; }).map(function (x) { return x.name; }).join(', ') + '. 유사하지 않을 수 있으니 그래프로 확인하세요.';
    return s;
  }

  // 레퍼런스 창과 대상의 후보 창을 같은 격자로 맞춰 비교한다.
  function compareWindows(refS, r0, r1, tgtS, c0, dt, o) {
    var N = Math.floor((r1 - r0) / dt + 1e-9);
    var all = ['speed', 'pedal', 'load', 'rpm', 'fuel'];
    var A = resample(refS, r0, r0 + N * dt, dt, all), B = resample(tgtS, c0, c0 + N * dt, dt, all);
    var res = compare(A, B, o); res.A = A; res.B = B;
    return res;
  }

  /* ---------- 사용자 확인 ---------- */
  // decisions: { 비교id: 'similar' | 'different' }. 비교가 하나라도 남아 있으면 보고서를 만들지 않는다.
  function reportGate(ids, decisions) {
    decisions = decisions || {};
    var pending = ids.filter(function (id) { return decisions[id] !== 'similar' && decisions[id] !== 'different'; });
    return { ok: ids.length > 0 && !pending.length, pending: pending,
      similar: ids.filter(function (id) { return decisions[id] === 'similar'; }),
      different: ids.filter(function (id) { return decisions[id] === 'different'; }),
      reason: !ids.length ? '먼저 레퍼런스와 비교할 데이터를 고르고 유사 구간을 찾으세요.'
        : pending.length ? '유사 여부를 확인하지 않은 비교가 ' + pending.length + '건 있습니다.' : '' };
  }
  // 사용자 판단이 자동 판정과 다르면 보고서에 그 사실을 적는다.
  function decisionNote(verdict, decision) {
    if (!decision) return '확인 전';
    var lab = decision === 'similar' ? '유사함' : '유사하지 않음';
    if (verdict === 'unknown') return '사용자 판단: ' + lab + ' (자동 판정 불가)';
    return verdict === decision ? '사용자 판단: ' + lab + ' (자동 판정과 같음)' : '사용자 판단: ' + lab + ' — 자동 판정과 다름';
  }

  /* ---------- AI 보조(선택) ---------- */
  // 원본 시험 데이터는 넣지 않는다. 요약 수치만 문장으로 보낸다.
  function aiPrompt(model) {
    var L = ['차량 시험 데이터 비교 결과입니다. 엔지니어가 보고서에 쓸 소견을 한국어 3~5문장으로 써 주세요.',
      '수치를 바꾸거나 새 수치를 만들지 말고, 아래 값만 근거로 쓰세요. 단정이 어려운 부분은 확인이 필요하다고 써 주세요.',
      '구간 조건: ' + model.criteria, '레퍼런스: ' + model.ref];
    model.items.forEach(function (it) {
      L.push('- 비교 대상 ' + it.name + ': 자동 판정 ' + VERD[it.verdict] + ', 사용자 확인 ' + (it.decision === 'similar' ? '유사함' : '유사하지 않음') + '. ' + it.sentence);
    });
    return L.join('\n');
  }
  var VERD = { similar: '유사', different: '유사하지 않을 수 있음', unknown: '판정 불가' };

  /* ---------- 예제(가짜 수소엔진 차량 가속 시험) ---------- */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function simulate(p) {
    var R = rng(p.seed), dt = 0.1, v = 0, g = 0, ratio = [100, 60, 40, 30, 24], rows = [];
    var nz = function (a) { return (R() + R() + R() - 1.5) * a; };
    for (var i = 0; i * dt <= p.dur + 1e-9; i++) {
      var t = Math.round(i * dt * 10) / 10, ped = 0, brake = 0;
      p.plan.forEach(function (e) {
        if (t >= e.at && t < e.at + e.len) {
          if (e.pedal != null) ped = Math.min(e.pedal, e.pedal * (t - e.at) / 0.8);
          if (e.brake) brake = e.brake;
        }
      });
      var acc = p.gain * ped / 100 - 0.03 * v - (v > 0 ? brake : 0);
      v = Math.max(0, v + acc * dt);
      var kph = v * 3.6;
      var rpm = Math.max(750, kph * ratio[g]);
      if (rpm > 2300 && g < ratio.length - 1) { g++; rpm = Math.max(750, kph * ratio[g]); }
      if (rpm < 1000 && g > 0 && kph * ratio[g - 1] < 2200) { g--; rpm = Math.max(750, kph * ratio[g]); }
      rpm += nz(12);
      var load = 8 + 0.85 * ped + 4 * (rpm - 750) / 1500 + p.offset(rpm) + nz(1.2);
      load = Math.max(0, Math.min(100, load));
      var fuel = 0.15 + 0.012 * load * rpm / 1000 + nz(0.02);
      rows.push([t, r2(kph + (kph > 0.3 ? nz(0.15) : 0)), r2(Math.max(0, ped + (ped > 0 ? nz(0.4) : 0))), r2(load), Math.round(rpm), Math.round(fuel * 1000) / 1000]);
    }
    return rows;
  }
  function r2(x) { return Math.round(Math.max(0, x) * 100) / 100; }
  function sample() {
    var plan = function (a, b) {
      return [{ at: a, len: 14, pedal: 70 }, { at: a + 14, len: 10, pedal: 25 }, { at: a + 24, len: 12, brake: 1.3 },
        { at: b, len: 12, pedal: 62 }, { at: b + 12, len: 12, brake: 1.4 }];
    };
    var A = simulate({ seed: 11, dur: 90, gain: 1.5, plan: plan(5, 52), offset: function () { return 0; } });
    var B = simulate({ seed: 23, dur: 100, gain: 1.48, plan: plan(12, 60), offset: function () { return 1.0; } });
    var C = simulate({ seed: 37, dur: 95, gain: 1.38, plan: plan(8, 56),
      offset: function (r) { return r > 1300 && r < 2100 ? 9 : 2; } });
    var aoaA = [['수소엔진 차량 가속 시험 · H2-A 기준 캘리브레이션 (가짜 예제 데이터)'],
      ['시간(s)', '차속(km/h)', '페달(%)', '부하율(%)', '엔진회전수(rpm)', '수소유량(kg/h)']].concat(A);
    var aoaB = [['시간', '차속', '가속페달', '엔진부하', '회전수', '수소소모량'], ['s', 'km/h', '%', '%', 'rpm', 'kg/h']].concat(B);
    var aoaC = [['Time', 'VehSpd', 'APP', 'EngLoad', 'EngSpd', 'H2_Flow', 'CoolantTemp']].concat(C.map(function (r, i) { return r.concat([Math.round((82 + i * 0.004) * 10) / 10]); }));
    return [{ name: 'H2-A_기준.csv', aoa: aoaA }, { name: 'H2-B_재시험.csv', aoa: aoaB }, { name: 'H2-C_맵변경.csv', aoa: aoaC }];
  }

  var api = { CH: CH, LABEL: LABEL, UNIT: UNIT, ALIASES: ALIASES, DEFAULTS: DEF, VERD: VERD,
    key: key, unitOf: unitOf, guessMap: guessMap, toNum: toNum, parseTime: parseTime, parseCSV: parseCSV,
    tableFromAoa: tableFromAoa, build: build, at: at, trapz: trapz, cut: cut,
    findSegments: findSegments, describeCrit: describeCrit, metrics: metrics, resample: resample,
    search: search, pearson: pearson, compare: compare, compareWindows: compareWindows,
    reportGate: reportGate, decisionNote: decisionNote, aiPrompt: aiPrompt, sample: sample };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Eng = api;
})(this);
