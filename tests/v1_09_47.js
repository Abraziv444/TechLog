/* v1.09.47 — проверка перед каждым тестом приложения (миграции, Edge Functions, Google Диск, Bouncie), нарисованные
   тестом картинки не вызывают «мелкий кадр» / «смазано» на ПК, в шапке нет квадратика с иконкой. Демо-режим.
   Запуск: node tests/v1_09_47.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })).newPage();   // ПК, камеры нет
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(600);

  /* шапка */
  const hdr = await p.evaluate(() => ({ square: !!document.querySelector('.topbar .logo, .topbar .logo-wrap, .topbar img.logo-img'),
    name: ((document.querySelector('.topbar .brand .name') || {}).textContent || '').trim(), sub: ((document.querySelector('.topbar .brand .sub') || {}).textContent || '').trim() }));
  t('шапка: квадратика с иконкой нет, название и версия на месте', !hdr.square && /TechLog/.test(hdr.name) && /v1\.09\./.test(hdr.sub), hdr);

  /* проверка перед тестом */
  const pf = await p.evaluate(async () => { const r = await testPreflight(); const g = await testPreflightGate('regress');
    tlogStart('regress', 'x'); const lines = TLOG.cur.lines.map(l => l.text); tlogEnd(true, 0); return { r, g, lines }; });
  t('демо: проверка перед тестом не мешает (сервер не проверяется, тест стартует)', pf.g === true && pf.r.bad === 0 && /Демо/.test(pf.r.lines.join(' ')), pf);
  t('строки проверки — первыми в отчёте теста', pf.lines[0] && /Проверка перед тестом/.test(pf.lines[0]) && /Демо/.test(pf.lines[1] || ''), pf.lines.slice(0, 3));
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const gates = ['regress', 'docflow', 'camtest', 'camtest2', 'drive'].filter(k => src.includes(`testPreflightGate('${k}')`));
  t('проверка стоит перед каждым тестом: регресс, документооборот, съёмка (оба), Google Диск', gates.length === 5, gates);
  t('проверка смотрит миграции (колонки и функции), Edge Functions, Google Диск (media-health) и Bouncie', /DB_NEED_COLS\.map/.test(src) && /DB_NEED_RPCS\.map/.test(src) && /fnProbeAll\(\)/.test(src.slice(src.indexOf('async function testPreflight'))) && /media-health/.test(src.slice(src.indexOf('async function testPreflight'), src.indexOf('async function testPreflightGate'))) && /bnFetch\('\?cfg=1'\)/.test(src.slice(src.indexOf('async function testPreflight'), src.indexOf('async function testPreflightGate'))));
  const gateBad = await p.evaluate(async () => { window.__tlAskModal = true; const tp = window.testPreflight;
    window.testPreflight = async () => ({ lines: ['⛔ База отстаёт от приложения: не хватает 1 (media.upload_id)', '✅ Edge Functions: все 11'], bad: 1, at: Date.now() });
    const pr = testPreflightGate('regress'); await new Promise(r => setTimeout(r, 120));
    const shown = !!document.getElementById('ask-ov'), txt = (document.querySelector('#ask-ov .ask-text') || {}).textContent || '';
    document.getElementById('ask-no').click(); const go = await pr; window.testPreflight = tp; window.__tlAskModal = false; return { shown, txt, go }; });
  t('есть проблема — окно «Запустить всё равно / Отмена» со списком; «Отмена» — тест не стартует', gateBad.shown && /upload_id/.test(gateBad.txt) && gateBad.go === false, gateBad);

  /* нарисованная тестом картинка на ПК — без «мелкого кадра» и «смазано» */
  const pic = await p.evaluate(async () => {
    const seen = []; const t0 = window.toast; window.toast = (m, k, d) => { seen.push(String(m)); return t0(m, k, d); };
    const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#58CC02'; g.fillRect(0, 0, 800, 600);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
    const j = liveJobs()[0];
    await mediaEnqueueFile(j.id, new File([b], 'regress-photo.jpg', { type: 'image/jpeg' }), 'photo', 'job', { selftest: true });
    const self = seen.slice(); seen.length = 0;
    await mediaEnqueueFile(j.id, new File([b], 'pc-file.jpg', { type: 'image/jpeg' }), 'photo');     // файл с диска ПК
    const pcFile = seen.slice(); window.toast = t0;
    return { self, pcFile };
  });
  t('регресс / тест Диска: своя нарисованная картинка не даёт «мелкий кадр» и «смазано»', !pic.self.some(s => /мелкий кадр|смазан/i.test(s)), pic.self);
  t('на ПК файл с диска тоже не называется «кадром телефона»', !pic.pcFile.some(s => /мелкий кадр/i.test(s)), pic.pcFile);
  t('регресс и тест Диска помечают свои картинки selftest', (src.match(/'photo', 'job', \{ selftest: true \}/g) || []).length >= 2 && (src.match(/'video', 'job', \{ selftest: true \}/g) || []).length >= 2);

  t('системных окон браузера не было', dialogs === 0, dialogs);
  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
