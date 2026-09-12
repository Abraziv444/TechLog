/* Смоук v1.08.42: блок «Корневые папки» (фото · инвойсы · вложения) виден в
   карточке Диска — заголовок, три поля, три плашки имён; применение имён
   работает. Режим просмотра (ключи заведены) покрыт jsdom-тестами unit.js —
   здесь демо открывает форму, проверяем общий блок и механику.
   Запуск: node tests/v1_08_42.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8151;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await br.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r =>
    /\.css/.test(r.request().url())
      ? r.fulfill({ contentType: 'text/css', body: '' }) : r.abort());

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => {
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'desktop');
    localStorage.removeItem('tl_gd_names');
  });
  await p.reload(); await p.waitForTimeout(900);

  console.log('— блок корневых каталогов —');
  await p.evaluate(() => window.App.go('settings'));
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.fold-h')]
      .find(x => /Google Drive/.test(x.textContent || ''));
    if (b) b.click();
  });
  await p.waitForTimeout(300);

  const card = await p.evaluate(() => ({
    header: document.querySelector('.gd-roots-t')?.textContent || '',
    inputs: ['gd-photo', 'gd-inv', 'gd-files'].every(i => !!document.getElementById(i)),
    names:  ['gd-nm-photo', 'gd-nm-inv', 'gd-nm-files'].every(i => !!document.getElementById(i)),
    afterHeader: (() => {
      const h = document.querySelector('.gd-roots-t'); if (!h) return false;
      let n = h.nextElementSibling;
      return !!(n && n.querySelector && n.querySelector('#gd-photo'));
    })(),
  }));
  t('заголовок блока на месте', /Корневые папки/.test(card.header), card.header);
  t('три поля каталогов на месте', card.inputs);
  t('три плашки имён на месте', card.names);
  t('первая строка идёт сразу под заголовком', card.afterHeader);

  await p.evaluate(() => window.App.gdNamesApply({
    root: { id: 'r', name: 'TechLog Archive' },
    photo: { id: 'p', name: 'APC Фото', own: true },
    invoice: { id: '', name: 'TechLog Archive / Invoices', own: false },
    file: { id: 'f', name: 'APC Files', own: true },
  }));
  await p.waitForTimeout(150);
  t('плашки заполняются именами', await p.evaluate(() =>
    document.getElementById('gd-nm-photo').textContent.trim() === 'APC Фото'
    && /Invoices/.test(document.getElementById('gd-nm-inv').textContent)));

  await p.evaluate(() => document.querySelector('.gd-roots-t').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(150);
  await p.screenshot({ path: '/tmp/pw/42-roots.png' });
  await br.close();
  console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
