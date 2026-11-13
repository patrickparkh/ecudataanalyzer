/* 계산 규칙 고정 — node test/logic.test.js
 * 그래프가 아니라 숫자가 틀리면 안 되는 도구다. 구간 경계·지표·탐색 위치·판정을 손으로 센 값과 대조한다. */
'use strict';
var E = require('../js/engine.js');
var passed = 0, failed = 0;
function ok(c, label, detail) { if (c) passed++; else { failed++; console.log('  X ' + label + (detail ? '\n      ' + detail : '')); } }
function eq(g, w, label) { ok(JSON.stringify(g) === JSON.stringify(w), label, '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g)); }
function near(g, w, tol, label) { ok(g != null && Math.abs(g - w) <= tol, label, '기대: ' + w + ' ± ' + tol + '  실제: ' + g); }
function series(rows, heads) { var tb = E.tableFromAoa([heads || ['시간', '차속', '페달', '부하율', '회전수', '연료유량']].concat(rows)); return E.build(tb, E.guessMap(tb.headers)); }

// 열 이름 매핑
eq(E.key('차속(km/h)'), '차속', '괄호 단위를 지운다');
eq(E.key('H2_Flow'), 'h2flow', '밑줄을 지운다');
eq(E.guessMap(['시간(s)', '차속(km/h)', '페달(%)', '부하율(%)', '엔진회전수(rpm)', '수소유량(kg/h)']),
  { time: 0, speed: 1, pedal: 2, load: 3, rpm: 4, fuel: 5 }, '한글 머리글');
eq(E.guessMap(['Time', 'VehSpd', 'APP', 'EngLoad', 'EngSpd', 'H2_Flow', 'CoolantTemp']),
  { time: 0, speed: 1, pedal: 2, load: 3, rpm: 4, fuel: 5 }, '영문 약어 머리글 · 남는 열은 무시');
var m2 = E.guessMap(['Engine Speed [rpm]', 'Vehicle Speed CAN', 'time_s']);
eq([m2.rpm, m2.speed, m2.time], [0, 1, 2], 'Engine Speed 는 차속이 아니라 회전수');
eq(E.guessMap(['메모', '비고']).time, -1, '못 찾은 채널은 -1');

// 값 읽기
eq(E.toNum('1,5'), 1.5, '소수점 쉼표');
eq(E.toNum('1,234.5'), 1234.5, '천 단위 쉼표');
ok(isNaN(E.toNum('abc')) && isNaN(E.toNum('')), '숫자 아님 = NaN');
eq(E.parseTime('00:01:02.5'), 62.5, 'hh:mm:ss.s');
eq(E.parseTime('2:03'), 123, 'mm:ss');

// CSV
eq(E.parseCSV('a,b\n"1,5",2\n'), [['a', 'b'], ['1,5', '2']], '따옴표 안 쉼표');
eq(E.parseCSV('a;b\r\n1;2'), [['a', 'b'], ['1', '2']], '세미콜론 구분 · CRLF');
eq(E.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']], '탭 구분');

// 표 — 제목 줄 · 단위 줄
var tb = E.tableFromAoa([['시험 기록'], ['시간', '차속'], ['s', 'km/h'], [0, 0], [1, 2]]);
eq([tb.headers, tb.units, tb.rows.length], [['시간', '차속'], ['s', 'km/h'], 2], '제목 줄 건너뛰고 단위 줄 읽기');
ok(tb.issues.length === 2, '건너뛴 줄을 알린다', JSON.stringify(tb.issues));

// 시계열 정리 — 틀린 줄은 버리되 알린다
var bad = series([[0, 0, 0, 0, 800, 0], ['?', 1, 0, 0, 800, 0], [1, '', 0, 0, 800, 0], [1, 5, 0, 0, 800, 0], [2, 4, 0, 0, 800, 0], [0.5, 9, 0, 0, 800, 0]]);
eq(bad.t, [0, 1, 2], '시간 오류·역순 줄 제외');
eq(bad.ch.speed, [0, 2, 4], '빈 차속은 앞뒤로 보간');
ok(bad.issues.length === 3, '경고 3건(시간 오류·역순·보간)', JSON.stringify(bad.issues));
var ms = E.build(E.tableFromAoa([['time(ms)', 'speed'], [0, 0], [500, 1]]), { time: 0, speed: 1, pedal: -1, load: -1, rpm: -1, fuel: -1 });
eq(ms.t, [0, 0.5], 'ms 단위는 초로');
var gs = E.build(E.tableFromAoa([['t', 'fuel'], [0, 1], [1, 1]]), { time: 0, speed: -1, pedal: -1, load: -1, rpm: -1, fuel: 1 }, { fuelUnit: 'g/s' });
eq(gs.ch.fuel, [3.6, 3.6], 'g/s 는 kg/h 로(×3.6)');
eq(E.build({ headers: ['x'], units: [''], rows: [[1]] }, { time: -1 }).ok, false, '시간 열이 없으면 거절');

// 구간 추출: 차속 = 5t km/h (1초 간격), 페달 50 고정
var lin = series([0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (t) { return [t, 5 * t, 50, 40 + t, 800 + 100 * t, 2]; }));
var sg = E.findSegments(lin, { type: 'speed', from: 0, to: 30 });
eq(sg.length, 1, '0→30 가속 1구간');
near(sg[0].t0, 0.1, 1e-9, '시작 = 0.5 km/h 를 지나는 순간(보간)');
near(sg[0].t1, 6, 1e-9, '끝 = 30 km/h 에 닿는 순간');
var mt = E.metrics(lin, sg[0].t0, sg[0].t1);
near(mt.dur, 5.9, 1e-9, '가속 시간 5.9초');
near(mt.pedalAvg, 50, 1e-9, '평균 페달');
near(mt.loadAvg, 40 + 3.05, 1e-9, '평균 부하율(시간 가중) = 중간 시각의 값');
near(mt.dist, 2.5 * (36 - 0.01) / 3600, 1e-12, '거리 = ∫차속dt/3600');
near(mt.accel, (30 - 0.5) / 3.6 / 5.9, 1e-9, '평균 가속도 m/s²');
var sg2 = E.findSegments(lin, { type: 'speed', from: 10, to: 20 });
near(sg2[0].t0, 2, 1e-9, '10→20 시작 = 2초'); near(sg2[0].t1, 4, 1e-9, '10→20 끝 = 4초');

var stop = series([[0, 0], [1, 10], [2, 0.2], [3, 10], [4, 20], [5, 31]].map(function (r) { return r.concat([0, 0, 800, 0]); }));
var ss = E.findSegments(stop, { type: 'speed', from: 0, to: 30 });
eq(ss.length, 1, '가다 멈춘 시도는 버린다');
near(ss[0].t0, 2 + 0.3 / 9.8, 1e-9, '다시 출발한 순간부터 센다');
var dec = series([[0, 40], [1, 30], [2, 20], [3, 10], [4, 0]].map(function (r) { return r.concat([0, 0, 800, 0]); }));
var ds = E.findSegments(dec, { type: 'speed', from: 30, to: 0 });
near(ds[0].t0, 1, 1e-9, '감속 시작 30'); near(ds[0].t1, 3.95, 1e-9, '감속 끝 0.5 km/h');
var cond = E.findSegments(series([0, 1, 2, 3, 4, 5, 6].map(function (t) { return [t, 0, [0, 70, 80, 75, 10, 90, 0][t], 0, 800, 0]; })),
  { type: 'cond', channel: 'pedal', op: '>=', value: 60, minDur: 1 });
eq(cond, [{ t0: 1, t1: 3 }], '페달 ≥60 이 1초 이상 이어진 구간만');

// 연비: 36 km/h 로 1시간, 수소 2 kg/h → 36 km ÷ 2 kg = 18 km/kg
var eco = series([[0, 36, 0, 0, 800, 2], [3600, 36, 0, 0, 800, 2]]);
var me = E.metrics(eco, 0, 3600);
near(me.fuelUsed, 2, 1e-9, '연료량 2 kg'); near(me.economy, 18, 1e-9, '연비 18 km/kg');
var uneven = series([[0, 0, 0, 0, 800, 0], [1, 0, 0, 0, 800, 0], [10, 0, 0, 90, 800, 0]]);
near(E.metrics(uneven, 0, 10).loadAvg, 40.5, 1e-9, '간격이 고르지 않아도 시간 가중 평균');

// 유사 구간 탐색 — 잡음 위에 레퍼런스 모양을 37초에 심어 두고 찾는다
var R = function (s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }(7);
var shape = function (u) { return { pedal: u < 1 ? 70 * u : 70, load: u < 1 ? 60 * u + 10 : 70 - 2 * u, rpm: 800 + 300 * u }; };
var refRows = [], tgtRows = [];
for (var i = 0; i <= 50; i++) { var u = i / 10, sh = shape(u); refRows.push([u, 3 * u, sh.pedal, sh.load, sh.rpm, 1]); }
for (var k = 0; k <= 1000; k++) {
  var t = k / 10, v = t >= 37 && t <= 42 ? shape(t - 37) : { pedal: 20 + 15 * R(), load: 30 + 20 * R(), rpm: 1000 + 400 * R() };
  tgtRows.push([t, 10, v.pedal, v.load, v.rpm, 1]);
}
var refS = series(refRows), tgtS = series(tgtRows);
var found = E.search(refS, 0, 5, tgtS, { dt: 0.1 });
near(found.cands[0].t0, 37, 1e-9, '심어 둔 37초를 1순위로 찾는다');
ok(found.cands[0].dist < 1e-9, '같은 모양이면 거리 0', found.cands[0].dist);
ok(found.cands.every(function (c, j) { return found.cands.every(function (d, l) { return j === l || Math.abs(c.t0 - d.t0) >= 2.5; }); }), '후보끼리 절반 이상 겹치지 않는다');
eq(E.search(tgtS, 0, 100, refS, {}).cands, [], '대상이 더 짧으면 후보 없음');

// 비교·판정
var same = E.compareWindows(refS, 0, 5, tgtS, 37, 0.1);
near(same.chans.load.r, 1, 1e-9, '같은 창 상관계수 1');
near(same.binStats.maxAbs, 0, 1e-9, '같은 창 회전수 구간별 부하율 차이 0');
eq(same.verdict, 'similar', '같은 창 = 유사');
ok(/이내로 수렴/.test(same.sentence), '판정 문장에 수렴 표현', same.sentence);
var up = series(refRows.map(function (r) { return [r[0], r[1], r[2], r[3] + 9, r[4], r[5]]; }));
var off = E.compareWindows(refS, 0, 5, up, 0, 0.1);
near(off.binStats.maxAbs, 9, 1e-9, '부하율 +9%p 면 구간 차이 9');
near(off.chans.load.r, 1, 1e-9, '모양은 같아 상관계수는 1');
eq(off.verdict, 'different', '상관이 높아도 부하율 차이가 허용을 넘으면 유사 아님');
ok(/벗어난 항목/.test(off.sentence), '벗어난 항목을 문장으로 알린다');
eq(E.compareWindows(refS, 0, 5, up, 0, 0.1, { tol: 10 }).verdict, 'similar', '허용 ±10%p 로 넓히면 유사');
var few = E.compare({ ch: { rpm: [1000, 1000, 1500], load: [10, 10, 50] } }, { ch: { rpm: [1000, 1000, 1500], load: [10, 10, 50] } }, { minN: 2 });
eq(few.bins.map(function (b) { return b.used; }), [true, false], '표본이 minN 미만인 구간은 판정에서 뺀다');
eq(E.pearson([1, 1, 1], [1, 2, 3]), null, '상수 채널은 상관계수 없음');
eq(E.compare({ ch: { pedal: [1, 2, 3] } }, { ch: { pedal: [1, 2, 3] } }).verdict, 'unknown', '부하율·회전수가 없으면 판정 불가');

// 사용자 확인 전에는 보고서를 만들지 않는다
eq(E.reportGate([], {}).ok, false, '비교가 없으면 보고서 불가');
var gate = E.reportGate(['B', 'C'], { B: 'similar' });
eq([gate.ok, gate.pending], [false, ['C']], '한 건이라도 확인 전이면 불가');
var gate2 = E.reportGate(['B', 'C'], { B: 'similar', C: 'different' });
eq([gate2.ok, gate2.similar, gate2.different], [true, ['B'], ['C']], '모두 확인하면 가능');
ok(/자동 판정과 다름/.test(E.decisionNote('different', 'similar')), '자동 판정과 다른 사용자 판단은 표시');

// AI 보조 문장에는 원본 데이터가 들어가지 않는다
var pr = E.aiPrompt({ criteria: '차속 0→30', ref: 'A 1구간', items: [{ name: 'B', verdict: 'similar', decision: 'similar', sentence: same.sentence }] });
ok(/유사함/.test(pr) && pr.length < 1500, '요약 수치만 보낸다', pr.length);

// 예제 데이터 — 시연이 되려면 B 는 유사, C 는 유사하지 않아야 한다
var files = E.sample().map(function (f) { var t2 = E.tableFromAoa(f.aoa); return E.build(t2, E.guessMap(t2.headers)); });
ok(files.every(function (s) { return s.ok && !s.issues.length; }), '예제 3개 경고 없이 읽힘');
ok(files.every(function (s) { return E.findSegments(s, { type: 'speed', from: 0, to: 30 }).length === 2; }), '예제마다 0→30 가속 2회');
var g0 = E.findSegments(files[0], { type: 'speed', from: 0, to: 30 })[0];
var vs = [1, 2].map(function (j) {
  var sr = E.search(files[0], g0.t0, g0.t1, files[j], { dt: 0.1 });
  return E.compareWindows(files[0], g0.t0, g0.t1, files[j], sr.cands[0].t0, 0.1).verdict;
});
eq(vs, ['similar', 'different'], '예제: B 유사 · C 유사하지 않음');

console.log('\n통과 ' + passed + ' · 실패 ' + failed);
process.exit(failed ? 1 : 0);
