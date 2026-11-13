/* 브라우저에 실제로 띄워 화면이 그려지는지 본다 — node test/smoke.browser.js
 * 규칙 테스트가 다 통과해도 app.js 오타 하나면 빈 화면이 된다. playwright 가 없으면 건너뛴다. */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var chromium;
try { chromium = require('playwright').chromium; }
catch (e) { console.log('playwright 가 없어 화면 연기 테스트를 건너뜁니다.'); process.exit(0); }
var ROOT = path.join(__dirname, '..');
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
var srv = http.createServer(function (q, s) {
  var p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, function (e, b) { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); });
});
var passed = 0, failed = 0;
function ok(c, label, d) { if (c) passed++; else { failed++; console.log('  X ' + label + (d != null ? '  ' + d : '')); } }
// 가로 넘침 픽셀과 범인 요소. overflow-x 가 auto/scroll 인 상자 안쪽은 의도된 내부 스크롤이라 뺀다.
function overflow(pg) {
  return pg.evaluate(function () {
    var W = document.documentElement.clientWidth, who = [];
    document.querySelectorAll('body *').forEach(function (e) {
      var b = e.getBoundingClientRect(); if (!b.width || b.right <= W + 0.5) return;
      for (var p = e.parentElement; p; p = p.parentElement) { var ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return; }
      var cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '';
      who.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls + '(' + Math.round(b.right - W) + 'px)');
    });
    return { px: document.documentElement.scrollWidth - W, who: who.slice(0, 8) };
  });
}
srv.listen(0, async function () {
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var br = await chromium.launch(); var pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  var errs = []; pg.on('pageerror', function (e) { errs.push(e.message); });
  pg.on('dialog', function (d) { d.dismiss(); });
  try {
    await pg.goto(base);
    await pg.click('#btn-sample');
    await pg.waitForSelector('#seg-table tbody tr', { timeout: 5000 });
    ok(await pg.isVisible('#s-seg'), '구간 지표 영역이 열린다');
    ok(await pg.$$eval('.file', function (t) { return t.length; }) === 3, '예제 파일 3개');
    ok(await pg.$$eval('.tag.auto', function (t) { return t.length; }) === 18, '열 18개 자동 매핑', await pg.$$eval('.tag.auto', function (t) { return t.length; }));
    ok(await pg.$$eval('#seg-table tbody tr', function (t) { return t.length; }) === 6, '0→30 가속 6구간');
    ok(await pg.$$eval('#overview polyline', function (t) { return t.length; }) === 1, '차속 개요 그래프');
    ok(await pg.isDisabled('#btn-report'), '찾기 전에는 보고서 버튼이 잠겨 있다');
    await pg.click('#btn-search');
    await pg.waitForSelector('.cmp', { timeout: 5000 });
    var v = await pg.$$eval('.cmp .verdict', function (t) { return t.map(function (x) { return x.className; }); });
    ok(v.length === 2 && /similar/.test(v[0]) && /different/.test(v[1]), 'B 유사 · C 유사하지 않음', JSON.stringify(v));
    ok(/이내로 수렴/.test(await pg.textContent('.cmp')), '판정 문장');
    ok(await pg.$$eval('.cmp svg', function (t) { return t.length; }) === 8, '비교 그래프 8개(2건 × 4)');
    ok(await pg.isDisabled('#btn-report'), '확인 전에는 보고서 버튼이 잠겨 있다');
    await pg.click('.cmp >> nth=0 >> [data-dec=similar]');
    ok(await pg.isDisabled('#btn-report'), '한 건만 확인하면 아직 잠겨 있다');
    await pg.click('.cmp >> nth=1 >> [data-dec=different]');
    ok(await pg.isEnabled('#btn-report'), '모두 확인하면 보고서 버튼이 열린다');
    await pg.click('#btn-report');
    await pg.waitForSelector('#report .rep', { timeout: 5000 });
    var rep = await pg.textContent('#report');
    ok(/유사함/.test(rep) && /유사하지 않음/.test(rep), '보고서에 사용자 확인이 남는다');
    ok(/실제 사내 데이터가 아닙니다/.test(rep), '예제 표기');
    ok(await pg.$$eval('#report svg', function (t) { return t.length; }) === 8, '보고서 그래프');
    ok(await pg.isEnabled('#btn-xlsx'), '엑셀 버튼이 열린다');
    var dl = pg.waitForEvent('download', { timeout: 5000 });
    await pg.click('#btn-xlsx');
    ok(/\.xlsx$/.test((await dl).suggestedFilename()), '엑셀 내려받기');
    // 후보를 바꾸면 확인을 다시 받는다
    await pg.selectOption('select[data-pick] >> nth=0', '1');
    ok(await pg.isDisabled('#btn-report'), '후보를 바꾸면 다시 확인해야 한다');
    // 좁은 화면 가로 넘침
    await pg.setViewportSize({ width: 360, height: 800 });
    var o1 = await overflow(pg);
    ok(o1.px <= 0, '360px 가로 넘침 없음', o1.px + 'px · ' + o1.who.join(', '));
    // CI(우분투)는 글꼴이 맥보다 넓다. 넓은 글꼴을 흉내 내 한 번 더 잰다.
    await pg.addStyleTag({ content: '*{font-family:Verdana,"DejaVu Sans",sans-serif !important; letter-spacing:.04em !important}' });
    var o2 = await overflow(pg);
    ok(o2.px <= 0, '360px 넓은 글꼴에서도 가로 넘침 없음', o2.px + 'px · ' + o2.who.join(', '));
    await pg.goto(base + 'guide.html');
    ok(/회전수 구간/.test(await pg.textContent('main')), '사용법 페이지');
  } catch (e) { failed++; console.log('  X 예외: ' + e.message); }
  ok(!errs.length, '페이지 오류 없음', errs.join(' | '));
  await br.close(); srv.close();
  console.log('\n화면 통과 ' + passed + ' · 실패 ' + failed);
  process.exit(failed ? 1 : 0);
});
