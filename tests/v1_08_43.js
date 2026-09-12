/* Смоук v1.08.43: клик по названию при разных поломках version.json даёт
   РАЗНЫЕ честные тосты: HTTP-ошибка хостинга, не-JSON тело, сетевой сбой.
   Запуск: node tests/v1_08_43.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8155;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  /* version.json фетчится через service worker, а роуты страницы SW-запросы
     не видят — для сценариев поломок SW отключаем */
  const p = await br.newContext({ viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block' }).then(c => c.newPage());
  p.on('dialog', d => d.accept());

  let vmode = 'pass';                      // pass | 404 | html | abort
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r =>
    /\.css/.test(r.request().url())
      ? r.fulfill({ contentType: 'text/css', body: '' }) : r.abort());
  await p.route(/127\.0\.0\.1[^ ]*version\.json/, r => {
    if (vmode === '404')  return r.fulfill({ status: 404, contentType: 'text/html', body: 'Not Found' });
    if (vmode === 'html') return r.fulfill({ status: 200, contentType: 'text/html', body: '<html>GH Pages error</html>' });
    if (vmode === 'abort') return r.abort();
    return r.continue();
  });

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await p.reload(); await p.waitForTimeout(900);

  const clickAndToast = async () => {
    const before = await p.evaluate(() => document.querySelectorAll('.toast.err').length);
    await p.evaluate(() => window.App.checkVerClick());
    for (let i = 0; i < 30; i++){
      await p.waitForTimeout(150);
      const txt = await p.evaluate(n =>
        [...document.querySelectorAll('.toast.err')].slice(n).map(e => e.textContent.trim()).pop() || '',
        before);
      if (txt) return txt;
    }
    return '(тост не появился)';
  };

  console.log('— причины провала проверки версии —');
  vmode = '404';
  let m = await clickAndToast();
  t('хостинг отдал 404 → тост называет HTTP 404', /HTTP 404/.test(m), m);
  await p.screenshot({ path: '/tmp/pw/43-http404.png' });
  await p.waitForTimeout(2200);

  vmode = 'html';
  m = await clickAndToast();
  t('вместо JSON пришла страница → тост про не-JSON', /не JSON/.test(m), m);
  await p.waitForTimeout(2200);

  vmode = 'abort';
  m = await clickAndToast();
  t('сетевой сбой → тост без ложной конкретики (нет «HTTP»)',
    m !== '(тост не появился)' && !/HTTP/.test(m) && !/не JSON/.test(m), m);

  vmode = 'pass';
  await p.waitForTimeout(2200);
  const okMsg = await (async () => {
    await p.evaluate(() => window.App.checkVerClick());
    for (let i = 0; i < 30; i++){
      await p.waitForTimeout(150);
      const txt = await p.evaluate(() =>
        [...document.querySelectorAll('.toast')].map(e => e.textContent.trim())
          .filter(s => /актуальная версия/.test(s)).pop() || '');
      if (txt) return txt;
    }
    return '(нет)';
  })();
  t('здоровый version.json → «актуальная версия»', /актуальная версия/.test(okMsg), okMsg);

  await br.close();
  console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
