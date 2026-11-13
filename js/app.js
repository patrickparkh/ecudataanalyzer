/* 화면 — 판정하지 않는다. 계산·판정은 js/engine.js(Eng) 가 한다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var f = function (x, d) { return x == null || isNaN(x) ? '—' : (+x).toFixed(d == null ? 1 : d); };
  var CALC = '<span class="calc">계산</span>';
  var state = { files: [], seq: 0, segs: {}, comps: [], decisions: {}, ai: '', sample: false, reportOn: false };

  /* ---------- 파일 ---------- */
  function decode(buf) {
    // 사내 장비 CSV 는 EUC-KR(CP949)인 경우가 많다. UTF-8 로 안 읽히면 EUC-KR 로 다시 읽는다.
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('euc-kr').decode(buf); }
  }
  function readFiles(list) {
    Array.prototype.forEach.call(list, function (file) {
      var rd = new FileReader();
      rd.onload = function (e) {
        var aoa;
        try {
          if (/\.(xlsx|xls)$/i.test(file.name)) {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
          } else aoa = Eng.parseCSV(decode(e.target.result));
        } catch (err) { $('files').insertAdjacentHTML('beforeend', '<div class="warn">' + esc(file.name) + ': 파일을 읽지 못했습니다 — ' + esc(err.message) + '</div>'); return; }
        state.sample = false; addFile(file.name, aoa);
      };
      rd.readAsArrayBuffer(file);
    });
  }
  function addFile(name, aoa) {
    var table = Eng.tableFromAoa(aoa), map = Eng.guessMap(table.headers), how = {};
    Eng.CH.forEach(function (c) { how[c] = map[c] >= 0 ? 'auto' : 'none'; });
    state.files.push({ id: 'f' + (++state.seq), name: name, table: table, map: map, how: how });
    rebuild();
  }
  function rebuild() {
    state.files.forEach(function (F) { F.s = F.table.headers.length ? Eng.build(F.table, F.map, { fuelUnit: $('fuel-unit').value }) : { ok: false, issues: [] }; });
    renderFiles(); resetCompare(); renderSegs(); fillRef();
    var any = state.files.some(function (F) { return F.s.ok; });
    $('s-seg').hidden = $('s-ref').hidden = $('s-report').hidden = !any;
  }
  function renderFiles() {
    $('files').innerHTML = state.files.map(function (F, i) {
      var s = F.s, tb = F.table;
      var h = '<div class="file" data-id="' + F.id + '"><div class="file-h"><b>' + esc(F.name) + '</b>';
      if (s.ok) h += '<span>' + s.t.length + '줄 · ' + f(s.t[s.t.length - 1] - s.t[0], 1) + '초 · 샘플 간격 ' + f(s.dt, 3) + '초</span>';
      h += '<button class="x" data-rm="' + F.id + '">빼기</button></div>';
      var iss = tb.issues.concat(s.issues || []);
      if (!s.ok) h += '<div class="warn">이 파일은 아직 쓸 수 없습니다. ' + esc(iss.join(' ')) + '</div>';
      else if (iss.length) h += '<div class="note"><ul>' + iss.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      h += '<details' + (s.ok ? '' : ' open') + '><summary>열 매핑 확인 · 바꾸기</summary><div class="tablewrap"><table class="map"><thead><tr><th>채널</th><th>원본 열</th><th>정한 방법</th><th>첫 값</th></tr></thead><tbody>';
      Eng.CH.forEach(function (c) {
        var idx = F.map[c];
        h += '<tr><td>' + Eng.LABEL[c] + ' <small>(' + (c === 'fuel' ? $('fuel-unit').value : Eng.UNIT[c]) + ')</small></td><td><select data-map="' + c + '"><option value="-1">— 없음 —</option>' +
          tb.headers.map(function (hd, j) { return '<option value="' + j + '"' + (j === idx ? ' selected' : '') + '>' + esc(hd || '(열 ' + (j + 1) + ')') + (tb.units[j] && hd.indexOf(tb.units[j]) < 0 ? ' [' + esc(tb.units[j]) + ']' : '') + '</option>'; }).join('') +
          '</select></td><td><span class="tag ' + F.how[c] + '">' + { auto: '자동 추정', user: '직접 지정', none: '없음' }[F.how[c]] + '</span></td><td class="num">' +
          (idx >= 0 && tb.rows[0] ? esc(tb.rows[0][idx]) : '') + '</td></tr>';
      });
      return h + '</tbody></table></div></details></div>';
    }).join('');
    $('ov-file').innerHTML = okFiles().map(function (F) { return '<option value="' + F.id + '">' + esc(F.name) + '</option>'; }).join('');
  }
  function okFiles() { return state.files.filter(function (F) { return F.s && F.s.ok; }); }
  function byId(id) { return state.files.filter(function (F) { return F.id === id; })[0]; }

  /* ---------- 구간 ---------- */
  function crit() {
    var t = $('c-type').value;
    return t === 'speed' ? { type: 'speed', from: +$('c-from').value, to: +$('c-to').value, eps: +$('c-eps').value }
      : { type: 'cond', channel: $('c-ch').value, op: $('c-op').value, value: +$('c-val').value, minDur: +$('c-min').value };
  }
  function syncCrit() {
    var t = $('c-type').value;
    document.querySelectorAll('.f-speed').forEach(function (e) { e.hidden = t !== 'speed'; });
    document.querySelectorAll('.f-cond').forEach(function (e) { e.hidden = t !== 'cond'; });
  }
  function renderSegs() {
    var c = crit(), rows = [], total = 0;
    state.segs = {};
    okFiles().forEach(function (F) {
      var sg = Eng.findSegments(F.s, c).map(function (g) { return Eng.metrics(F.s, g.t0, g.t1); });
      state.segs[F.id] = sg; total += sg.length;
      sg.forEach(function (m, i) { rows.push({ F: F, i: i, m: m }); });
    });
    var base = okFiles()[0] ? okFiles()[0].s.fuelBase : 'kg';
    $('seg-sum').innerHTML = '<div class="stats"><div class="stat"><b>' + total + '</b>구간 · ' + esc(Eng.describeCrit(c)) + '</div>' +
      okFiles().map(function (F) { return '<div class="stat' + (state.segs[F.id].length ? '' : ' bad') + '"><b>' + state.segs[F.id].length + '</b>' + esc(F.name) + '</div>'; }).join('') + '</div>';
    $('seg-table').innerHTML = rows.length ? '<table><thead><tr><th>파일</th><th>#</th><th>시작(s)</th><th>끝(s)</th><th>구간 시간(s)' + CALC + '</th><th>차속 시작→끝</th><th>평균 가속도(m/s²)' + CALC + '</th><th>평균 페달(%)' + CALC + '</th><th>평균 부하율(%)' + CALC + '</th><th>최대 부하율(%)</th><th>평균 회전수' + CALC + '</th><th>거리(m)' + CALC + '</th><th>연료량(g)' + CALC + '</th><th>연비(km/' + base + ')' + CALC + '</th></tr></thead><tbody>' +
      rows.map(function (r) { var m = r.m; return '<tr><td>' + esc(r.F.name) + '</td><td>' + (r.i + 1) + '</td><td class="num">' + f(m.t0, 2) + '</td><td class="num">' + f(m.t1, 2) + '</td><td class="num"><b>' + f(m.dur, 2) + '</b></td><td class="num">' + f(m.vStart, 1) + '→' + f(m.vEnd, 1) + '</td><td class="num">' + f(m.accel, 2) + '</td><td class="num">' + f(m.pedalAvg) + '</td><td class="num">' + f(m.loadAvg) + '</td><td class="num">' + f(m.loadMax) + '</td><td class="num">' + f(m.rpmAvg, 0) + '</td><td class="num">' + f(m.dist == null ? null : m.dist * 1000, 1) + '</td><td class="num">' + f(m.fuelUsed == null ? null : m.fuelUsed * 1000, 2) + '</td><td class="num">' + f(m.economy, 2) + '</td></tr>'; }).join('') + '</tbody></table>'
      : '<p class="sub" style="padding:12px">조건에 맞는 구간이 없습니다. 조건이나 열 매핑(차속)을 확인하세요.</p>';
    renderOverview();
  }
  function renderOverview() {
    var F = byId($('ov-file').value) || okFiles()[0]; if (!F || !F.s.ch.speed) { $('overview').innerHTML = ''; return; }
    var boxes = (state.segs[F.id] || []).map(function (m) { return { t0: m.t0, t1: m.t1, cls: 'segbox' }; });
    var r = refWin(); if (r && r.F === F) boxes.push({ t0: r.t0, t1: r.t1, cls: 'refbox' });
    $('overview').innerHTML = lineChart(F.s.t, [{ vals: F.s.ch.speed, cls: 'l-spd', name: '차속' }], { title: F.name + ' — 차속(km/h)', boxes: boxes, w: 1000, h: 220 }) +
      '<div class="lgd"><span>차속</span><span class="segl">노란 띠 = 조건 구간</span><span class="refl">파란 띠 = 레퍼런스</span></div>';
  }

  /* ---------- 레퍼런스·탐색 ---------- */
  function fillRef() {
    var keep = $('r-file').value;
    $('r-file').innerHTML = okFiles().map(function (F) { return '<option value="' + F.id + '">' + esc(F.name) + '</option>'; }).join('');
    if (byId(keep) && byId(keep).s.ok) $('r-file').value = keep;
    fillRefSeg();
  }
  function fillRefSeg() {
    var sg = state.segs[$('r-file').value] || [];
    $('r-seg').innerHTML = sg.map(function (m, i) { return '<option value="' + i + '">' + (i + 1) + '번 · ' + f(m.t0, 1) + '~' + f(m.t1, 1) + '초</option>'; }).join('') + '<option value="manual">직접 지정</option>';
    pickRefSeg();
  }
  function pickRefSeg() {
    var v = $('r-seg').value, sg = state.segs[$('r-file').value] || [];
    if (v !== 'manual' && sg[+v]) { $('r-t0').value = f(sg[+v].t0, 2); $('r-t1').value = f(sg[+v].t1, 2); }
    resetCompare(); renderOverview();
  }
  function refWin() {
    var F = byId($('r-file').value), t0 = +$('r-t0').value, t1 = +$('r-t1').value;
    if (!F || !(t1 > t0)) return null; return { F: F, t0: t0, t1: t1 };
  }
  function chans() { return Array.prototype.map.call(document.querySelectorAll('.chans input:checked'), function (e) { return e.value; }); }
  function opts() { return { tol: $('o-tol').value, rMin: $('o-r').value, covMin: $('o-cov').value, binW: $('o-bin').value }; }
  function resetCompare() { state.comps = []; state.decisions = {}; state.ai = ''; state.reportOn = false; $('cmp').innerHTML = ''; renderGate(); }

  function runSearch() {
    var r = refWin();
    if (!r) { $('cmp').innerHTML = '<div class="warn">레퍼런스 구간의 시작·끝을 확인하세요.</div>'; return; }
    var others = okFiles().filter(function (F) { return F !== r.F; });
    if (!others.length) { $('cmp').innerHTML = '<div class="warn">레퍼런스 말고 비교할 파일이 하나 더 있어야 합니다.</div>'; return; }
    state.decisions = {}; state.ai = ''; state.reportOn = false;
    state.comps = others.map(function (F) {
      var sr = Eng.search(r.F.s, r.t0, r.t1, F.s, { dt: 0.1, chans: chans(), topK: 3 });
      return { id: F.id, F: F, sr: sr, pick: 0, res: sr.cands.length ? Eng.compareWindows(r.F.s, r.t0, r.t1, F.s, sr.cands[0].t0, sr.dt, opts()) : null };
    });
    renderCompare(); renderGate();
  }
  function renderCompare() {
    var r = refWin();
    $('cmp').innerHTML = state.comps.map(function (C) {
      if (!C.res) return '<div class="cmp v-unknown"><h3>' + esc(C.F.name) + '</h3><div class="warn">' + esc(C.sr.reason || '후보가 없습니다.') + '</div></div>';
      var res = C.res, cd = C.sr.cands[C.pick], dec = state.decisions[C.id];
      var h = '<div class="cmp v-' + res.verdict + '" data-c="' + C.id + '"><div class="cmp-h"><h3>' + esc(C.F.name) + '</h3><span class="verdict ' + res.verdict + '">자동 판정 · ' + Eng.VERD[res.verdict] + '</span>' +
        '<label class="inline">후보 <select data-pick="' + C.id + '">' + C.sr.cands.map(function (c, i) { return '<option value="' + i + '"' + (i === C.pick ? ' selected' : '') + '>' + c.rank + '순위 · ' + f(c.t0, 1) + '~' + f(c.t1, 1) + '초 · 형상 거리 ' + f(c.dist, 3) + '</option>'; }).join('') + '</select></label></div>';
      h += '<p style="margin-top:10px">' + esc(res.sentence) + '</p>';
      h += checksHtml(res) + statTable(res) + chartsHtml(res, r, cd);
      h += '<div class="decide"><b>두 데이터가 유사합니까?</b><button class="btn yes' + (dec === 'similar' ? ' on' : '') + '" data-dec="similar" data-id="' + C.id + '">유사함</button>' +
        '<button class="btn no' + (dec === 'different' ? ' on' : '') + '" data-dec="different" data-id="' + C.id + '">유사하지 않음</button><span class="st">' + esc(Eng.decisionNote(res.verdict, dec)) + '</span></div></div>';
      return h;
    }).join('');
  }
  function checksHtml(res) {
    return '<ul class="checks">' + res.checks.map(function (c) {
      var v = c.value == null ? '—' : c.id === 'cov' ? Math.round(c.value * 100) + '%' : c.id === 'r' ? c.value.toFixed(3) : f(c.value, 1) + c.unit;
      var lim = c.id === 'cov' ? Math.round(c.limit * 100) + '%' : c.limit + c.unit;
      return '<li><span class="' + (c.pass ? 'p' : 'f') + '">' + (c.pass ? '만족' : '벗어남') + '</span> · ' + esc(c.name) + ' ' + v + ' (기준 ' + c.cmp + ' ' + lim + ')</li>';
    }).join('') + '</ul>';
  }
  function statTable(res) {
    var rows = Object.keys(res.chans).map(function (c) { var s = res.chans[c]; var d = c === 'rpm' ? 0 : 1;
      return '<tr><td>' + Eng.LABEL[c] + '</td><td class="num">' + f(s.meanA, d) + '</td><td class="num">' + f(s.meanB, d) + '</td><td class="num">' + (s.r == null ? '—' : s.r.toFixed(3)) + '</td><td class="num">' + f(s.rmse, d) + '</td><td class="num">' + f(s.meanAbs, d) + '</td><td class="num">' + f(s.maxAbs, d) + '</td></tr>'; }).join('');
    var bins = res.bins.filter(function (b) { return b.nA || b.nB; }).map(function (b) {
      return '<tr><td>' + b.lo + '~' + b.hi + '</td><td class="num">' + b.nA + ' / ' + b.nB + '</td><td class="num">' + f(b.meanA) + '</td><td class="num">' + f(b.meanB) + '</td><td class="num ' + (b.used ? (b.within ? 'ok-c' : 'bad-c') : '') + '">' + (b.used ? (b.diff > 0 ? '+' : '') + f(b.diff) : '표본 부족') + '</td></tr>'; }).join('');
    return '<div class="grid2"><div class="tablewrap"><table><thead><tr><th>채널</th><th>레퍼런스 평균</th><th>비교 평균</th><th>상관계수' + CALC + '</th><th>RMSE</th><th>평균 차</th><th>최대 차</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="tablewrap"><table><thead><tr><th>회전수 구간(rpm)</th><th>표본 수(레퍼런스/비교)</th><th>레퍼런스 부하율</th><th>비교 부하율</th><th>차이(%p)' + CALC + '</th></tr></thead><tbody>' + bins + '</tbody></table></div></div>';
  }
  function chartsHtml(res, r, cd) {
    var rel = res.A.t.map(function (t) { return t - res.A.t[0]; });
    var h = '<div class="charts">';
    ['pedal', 'load', 'rpm'].forEach(function (c) {
      if (!res.A.ch[c] || !res.B.ch[c]) return;
      h += '<div class="chart">' + lineChart(rel, [{ vals: res.A.ch[c], cls: 'l-ref' }, { vals: res.B.ch[c], cls: 'l-cand' }], { title: Eng.LABEL[c] + ' (' + Eng.UNIT[c] + ') — 구간 시작부터 초', w: 420, h: 220 }) + '</div>';
    });
    h += '<div class="chart">' + binChart(res) + '</div></div>';
    h += '<div class="lgd"><span class="ref">레퍼런스 ' + esc(r ? r.F.name + ' ' + f(r.t0, 1) + '~' + f(r.t1, 1) + '초' : '') + '</span><span>비교 ' + (cd ? f(cd.t0, 1) + '~' + f(cd.t1, 1) + '초' : '') + '</span><span class="band">레퍼런스 ±' + res.opts.tol + '%p</span></div>';
    return h;
  }

  /* ---------- SVG ---------- */
  function lineChart(xs, series, o) {
    var W = o.w || 420, H = o.h || 220, L = 46, R = 12, T = 26, B = 28;
    var all = []; series.forEach(function (s) { all = all.concat(s.vals.filter(function (v) { return !isNaN(v); })); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08, pos = lo >= 0; lo -= pad; hi += pad; if (pos && lo < 0) lo = 0;   // 음수가 없는 채널에 음수 눈금을 그리지 않는다
    var x0 = xs[0], x1 = xs[xs.length - 1];
    var x = function (v) { return L + (W - L - R) * (v - x0) / (x1 - x0 || 1); }, y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title) + '"><text class="ttl" x="' + L + '" y="16">' + esc(o.title) + '</text>';
    (o.boxes || []).forEach(function (b) { g += '<rect class="' + b.cls + '" x="' + x(b.t0) + '" y="' + T + '" width="' + Math.max(1, x(b.t1) - x(b.t0)) + '" height="' + (H - T - B) + '"/>'; });
    for (var k = 0; k <= 4; k++) { var v = lo + (hi - lo) * k / 4; g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + tick(v) + '</text>'; }
    for (var q = 0; q <= 5; q++) { var tv = x0 + (x1 - x0) * q / 5; g += '<text class="ax" x="' + x(tv) + '" y="' + (H - 9) + '" text-anchor="middle">' + tick(tv) + '</text>'; }
    var step = Math.max(1, Math.floor(xs.length / 900));
    series.forEach(function (s) { var p = []; for (var i = 0; i < xs.length; i += step) p.push(x(xs[i]).toFixed(1) + ',' + y(s.vals[i]).toFixed(1)); g += '<polyline class="' + s.cls + '" points="' + p.join(' ') + '"/>'; });
    return g + '</svg>';
  }
  function tick(v) { var a = Math.abs(v); return a >= 100 ? Math.round(v) : a >= 10 ? v.toFixed(0) : v.toFixed(1); }
  function binChart(res) {
    var bs = res.bins.filter(function (b) { return b.meanA != null || b.meanB != null; });
    var W = 420, H = 220, L = 46, R = 12, T = 26, B = 28, tol = res.opts.tol;
    if (!bs.length) return '';
    var vals = []; bs.forEach(function (b) { if (b.meanA != null) vals.push(b.meanA + tol, b.meanA - tol); if (b.meanB != null) vals.push(b.meanB); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), x0 = bs[0].lo, x1 = bs[bs.length - 1].hi;
    var x = function (v) { return L + (W - L - R) * (v - x0) / (x1 - x0); }, y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1)); };
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="회전수 구간별 부하율"><text class="ttl" x="' + L + '" y="16">회전수 구간별 평균 부하율(%)</text>';
    var ref = bs.filter(function (b) { return b.meanA != null && b.nA >= res.opts.minN; });
    if (ref.length) {
      var up = ref.map(function (b) { return x((b.lo + b.hi) / 2) + ',' + y(b.meanA + tol); }), dn = ref.slice().reverse().map(function (b) { return x((b.lo + b.hi) / 2) + ',' + y(b.meanA - tol); });
      g += '<polygon class="band" points="' + up.concat(dn).join(' ') + '"/>';
    }
    for (var k = 0; k <= 4; k++) { var v = lo + (hi - lo) * k / 4; g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + tick(v) + '</text>'; }
    bs.forEach(function (b, i) { if (i % Math.ceil(bs.length / 6) === 0) g += '<text class="ax" x="' + x(b.lo) + '" y="' + (H - 9) + '" text-anchor="middle">' + b.lo + '</text>'; });
    g += '<polyline class="l-ref" points="' + ref.map(function (b) { return x((b.lo + b.hi) / 2) + ',' + y(b.meanA); }).join(' ') + '"/>';
    var cand = bs.filter(function (b) { return b.meanB != null && b.nB >= res.opts.minN; });
    g += '<polyline class="l-cand" points="' + cand.map(function (b) { return x((b.lo + b.hi) / 2) + ',' + y(b.meanB); }).join(' ') + '"/>';
    bs.filter(function (b) { return b.used; }).forEach(function (b) { g += '<circle class="' + (b.within ? 'pt-ok' : 'pt-bad') + '" r="3.5" cx="' + x((b.lo + b.hi) / 2) + '" cy="' + y(b.meanB) + '"/>'; });
    return g + '</svg>';
  }

  /* ---------- 확인·보고서 ---------- */
  function gate() { return Eng.reportGate(state.comps.filter(function (C) { return C.res; }).map(function (C) { return C.id; }), state.decisions); }
  function renderGate() {
    var g = gate();
    $('gate').innerHTML = g.ok ? '<div class="ok">모든 비교를 확인했습니다 — 유사함 ' + g.similar.length + '건 · 유사하지 않음 ' + g.different.length + '건. 보고서를 만들 수 있습니다.</div>'
      : '<div class="note">' + esc(g.reason) + '</div>';
    $('btn-report').disabled = !g.ok;
    $('btn-xlsx').disabled = $('btn-print').disabled = !(g.ok && state.reportOn);
    $('btn-ai').disabled = !(g.ok && state.reportOn);
    if (!g.ok) $('report').innerHTML = '';
  }
  function model() {
    var r = refWin();
    return { criteria: Eng.describeCrit(crit()), ref: r.F.name + ' ' + f(r.t0, 2) + '~' + f(r.t1, 2) + '초',
      items: state.comps.filter(function (C) { return C.res; }).map(function (C) {
        return { name: C.F.name, verdict: C.res.verdict, decision: state.decisions[C.id], sentence: C.res.sentence }; }) };
  }
  function renderReport() {
    if (!gate().ok) return;
    state.reportOn = true;
    var r = refWin(), md = model(), base = r.F.s.fuelBase;
    var h = '<div class="rep"><h2>시험 데이터 비교 보고서</h2><p class="meta">작성 ' + new Date().toLocaleString('ko-KR') + ' · 구간 조건 ' + esc(md.criteria) + ' · 레퍼런스 ' + esc(md.ref) +
      (state.sample ? '<br>예제 데이터는 실제 사내 데이터가 아닙니다(가짜 수소엔진 차량 가속 시험).' : '') + '</p>';
    h += '<p class="sub">표의 지표는 원본 측정값에서 이 도구가 계산한 값입니다. 유사 여부는 사용자가 확인한 결과이며, 자동 판정은 참고로 함께 적습니다.</p>';
    h += '<h3>1. 조건 구간 지표</h3><div class="tablewrap">' + $('seg-table').innerHTML + '</div>';
    h += '<h3>2. 레퍼런스 대비 비교</h3>';
    state.comps.filter(function (C) { return C.res; }).forEach(function (C, i) {
      var cd = C.sr.cands[C.pick], mA = Eng.metrics(r.F.s, r.t0, r.t1), mB = Eng.metrics(C.F.s, cd.t0, cd.t0 + (r.t1 - r.t0));
      var row = function (k, lab, d, mul) { mul = mul || 1; return '<tr><td>' + lab + '</td><td class="num">' + f(mA[k] == null ? null : mA[k] * mul, d) + '</td><td class="num">' + f(mB[k] == null ? null : mB[k] * mul, d) + '</td></tr>'; };
      h += '<div class="item"><h4>2-' + (i + 1) + '. ' + esc(C.F.name) + ' — ' + esc(Eng.decisionNote(C.res.verdict, state.decisions[C.id])) + '</h4>';
      h += '<p>비교 창 ' + f(cd.t0, 2) + '~' + f(cd.t0 + (r.t1 - r.t0), 2) + '초(' + cd.rank + '순위 후보, 형상 거리 ' + f(cd.dist, 3) + '). ' + esc(C.res.sentence) + '</p>';
      h += checksHtml(C.res);
      h += '<div class="grid2"><div class="tablewrap"><table><thead><tr><th>창 지표' + CALC + '</th><th>레퍼런스</th><th>비교</th></tr></thead><tbody>' +
        row('vStart', '시작 차속(km/h)', 1) + row('vEnd', '끝 차속(km/h)', 1) + row('pedalAvg', '평균 페달(%)', 1) + row('loadAvg', '평균 부하율(%)', 1) + row('rpmAvg', '평균 회전수', 0) +
        row('fuelUsed', '연료량(g)', 2, 1000) + row('economy', '연비(km/' + base + ')', 2) + '</tbody></table></div></div>';
      h += statTable(C.res) + chartsHtml(C.res, r, cd) + '</div>';
    });
    if (state.ai) h += '<div class="aibox"><b>AI 초안 — 검토 필요</b>' + esc(state.ai) + '</div>';
    h += '<p class="sub" style="margin-top:18px">생성: 시험 데이터 비교 보고서(build-2611-05) · 파일은 브라우저 안에서만 처리했습니다.</p></div>';
    $('report').innerHTML = h;
    renderGate();
  }

  /* ---------- 엑셀 ---------- */
  function exportXlsx() {
    var wb = XLSX.utils.book_new(), r = refWin(), c = crit();
    var seg = [['파일', '#', '시작(s)', '끝(s)', '구간시간(s)', '시작차속', '끝차속', '평균가속도(m/s2)', '평균페달(%)', '최대페달(%)', '평균부하율(%)', '최대부하율(%)', '평균회전수', '최대회전수', '거리(km)', '연료량', '평균유량', '연비']];
    okFiles().forEach(function (F) { (state.segs[F.id] || []).forEach(function (m, i) {
      seg.push([F.name, i + 1, m.t0, m.t1, m.dur, m.vStart, m.vEnd, m.accel, m.pedalAvg, m.pedalMax, m.loadAvg, m.loadMax, m.rpmAvg, m.rpmMax, m.dist, m.fuelUsed, m.fuelRate, m.economy]); }); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['구간 조건', Eng.describeCrit(c)], ['값', '원본 측정값에서 계산'], []].concat(seg)), '구간지표');
    var sim = [['비교 대상', '비교 창 시작(s)', '형상 거리', '자동 판정', '사용자 확인', '부하율 차이 평균(%p)', '부하율 차이 최대(%p)', '±허용 이내 비율', '구간 겹침', '최소 상관계수', '판정 문장']];
    var bins = [['비교 대상', '회전수 하한', '회전수 상한', '표본(레퍼런스)', '표본(비교)', '레퍼런스 부하율', '비교 부하율', '차이(%p)', '허용 이내']];
    state.comps.filter(function (C) { return C.res; }).forEach(function (C) {
      var res = C.res, cd = C.sr.cands[C.pick], b = res.binStats;
      sim.push([C.F.name, cd.t0, cd.dist, Eng.VERD[res.verdict], state.decisions[C.id] === 'similar' ? '유사함' : '유사하지 않음', b.meanAbs, b.maxAbs, b.withinShare, b.coverage, res.checks[1].value, res.sentence]);
      res.bins.forEach(function (x) { bins.push([C.F.name, x.lo, x.hi, x.nA, x.nB, x.meanA, x.meanB, x.diff, x.used ? (x.within ? '예' : '아니오') : '표본 부족']); });
      var al = [['레퍼런스 경과(s)', '레퍼런스 페달', '비교 페달', '레퍼런스 부하율', '비교 부하율', '레퍼런스 회전수', '비교 회전수', '레퍼런스 차속', '비교 차속']];
      res.A.t.forEach(function (t, i) { al.push([Math.round((t - res.A.t[0]) * 1000) / 1000].concat(['pedal', 'load', 'rpm', 'speed'].reduce(function (a, k) { return a.concat([res.A.ch[k] ? res.A.ch[k][i] : '', res.B.ch[k] ? res.B.ch[k][i] : '']); }, []))); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(al), ('정렬_' + C.F.name.replace(/\.[^.]+$/, '')).replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['레퍼런스', r.F.name, r.t0, r.t1], []].concat(sim)), '유사도판정');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bins), '회전수구간_부하율');
    XLSX.writeFile(wb, '시험데이터_비교보고서_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }
  function downloadText(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function csvOf(aoa) { return aoa.map(function (r) { return r.map(function (x) { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(','); }).join('\n'); }

  /* ---------- AI(선택) ---------- */
  function callAI() {
    var key = $('ai-key').value.trim(), prov = $('ai-prov').value;
    if (!key) { alert('API 키를 넣어 주세요. 키가 없어도 보고서는 그대로 쓸 수 있습니다.'); return; }
    if (!confirm('판정 문장과 요약 수치를 외부 AI(' + (prov === 'openai' ? 'OpenAI' : 'Anthropic') + ')로 보냅니다. 원본 시험 데이터는 보내지 않습니다.\n사내 자료를 외부로 보내도 되는지 확인하셨습니까?')) return;
    var prompt = Eng.aiPrompt(model()), btn = $('btn-ai'); btn.disabled = true; btn.textContent = '받는 중…';
    var req = prov === 'openai'
      ? fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }) })
      : fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }) });
    req.then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || r.status); return j; }); })
      .then(function (j) { state.ai = prov === 'openai' ? j.choices[0].message.content : j.content.map(function (c) { return c.text || ''; }).join(''); renderReport(); })
      .catch(function (e) { alert('AI 호출 실패: ' + e.message); })
      .then(function () { btn.textContent = 'AI 소견 초안 받기'; renderGate(); });
  }

  /* ---------- 연결 ---------- */
  $('file').addEventListener('change', function (e) { readFiles(e.target.files); e.target.value = ''; });
  var drop = $('drop');
  ['dragover', 'dragenter'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); readFiles(e.dataTransfer.files); });
  $('btn-sample').addEventListener('click', function () {
    state.files = []; Eng.sample().forEach(function (s) { var t = Eng.tableFromAoa(s.aoa), m = Eng.guessMap(t.headers), how = {};
      Eng.CH.forEach(function (c) { how[c] = m[c] >= 0 ? 'auto' : 'none'; }); state.files.push({ id: 'f' + (++state.seq), name: s.name, table: t, map: m, how: how }); });
    state.sample = true; rebuild();
  });
  $('btn-template').addEventListener('click', function () { downloadText('시험데이터_양식.csv', csvOf([['시간(s)', '차속(km/h)', '페달(%)', '부하율(%)', '엔진회전수(rpm)', '연료유량(kg/h)'], [0, 0, 0, 8, 750, 0.2]])); });
  $('btn-sample-dl').addEventListener('click', function () { Eng.sample().forEach(function (s) { downloadText(s.name, csvOf(s.aoa)); }); });
  $('fuel-unit').addEventListener('change', rebuild);
  $('files').addEventListener('change', function (e) {
    var sel = e.target.closest('select[data-map]'); if (!sel) return;
    var F = byId(sel.closest('.file').dataset.id), ch = sel.dataset.map;
    F.map[ch] = +sel.value; F.how[ch] = +sel.value < 0 ? 'none' : 'user'; rebuild();
  });
  $('files').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rm]'); if (!b) return;
    state.files = state.files.filter(function (F) { return F.id !== b.dataset.rm; }); rebuild();
  });
  ['c-type', 'c-from', 'c-to', 'c-eps', 'c-ch', 'c-op', 'c-val', 'c-min'].forEach(function (id) {
    $(id).addEventListener('change', function () { syncCrit(); renderSegs(); fillRefSeg(); });
  });
  $('ov-file').addEventListener('change', renderOverview);
  $('r-file').addEventListener('change', fillRefSeg);
  $('r-seg').addEventListener('change', pickRefSeg);
  ['r-t0', 'r-t1'].forEach(function (id) { $(id).addEventListener('change', function () { $('r-seg').value = 'manual'; resetCompare(); renderOverview(); }); });
  ['o-tol', 'o-r', 'o-cov', 'o-bin'].forEach(function (id) { $(id).addEventListener('change', function () { if (state.comps.length) runSearch(); }); });
  document.querySelector('.chans').addEventListener('change', function () { if (state.comps.length) runSearch(); });
  $('btn-search').addEventListener('click', runSearch);
  $('cmp').addEventListener('change', function (e) {
    var sel = e.target.closest('select[data-pick]'); if (!sel) return;
    var C = state.comps.filter(function (x) { return x.id === sel.dataset.pick; })[0], r = refWin();
    C.pick = +sel.value; C.res = Eng.compareWindows(r.F.s, r.t0, r.t1, C.F.s, C.sr.cands[C.pick].t0, C.sr.dt, opts());
    delete state.decisions[C.id]; state.reportOn = false; renderCompare(); renderGate();   // 창이 바뀌면 다시 확인받는다
  });
  $('cmp').addEventListener('click', function (e) {
    var b = e.target.closest('[data-dec]'); if (!b) return;
    state.decisions[b.dataset.id] = b.dataset.dec; state.reportOn = false; $('report').innerHTML = '';
    renderCompare(); renderGate();
  });
  $('btn-report').addEventListener('click', renderReport);
  $('btn-xlsx').addEventListener('click', exportXlsx);
  $('btn-print').addEventListener('click', function () { window.print(); });
  $('btn-ai').addEventListener('click', callAI);
  $('ai-key').value = localStorage.getItem('b05-ai-key') || '';
  $('ai-prov').value = localStorage.getItem('b05-ai-prov') || 'anthropic';
  $('ai-key').addEventListener('change', function () { localStorage.setItem('b05-ai-key', $('ai-key').value.trim()); });
  $('ai-prov').addEventListener('change', function () { localStorage.setItem('b05-ai-prov', $('ai-prov').value); });
  syncCrit();
  window.__app = { state: state };       // 연기 테스트용
})();
