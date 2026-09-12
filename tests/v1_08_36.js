/* Смоук v1.08.36: имена трёх корневых папок Google Диска напротив полей
   ввода — пустые подписи скрыты, gdNamesApply пишет имена в DOM и кэш,
   «своя, но недоступная» папка помечается ⚠, кэш переживает перерисовку.
   Демо-режим (внешних запросов нет — проверяем механику подписей).
   Запуск: node tests/v1_08_36.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8146;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await br.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript',
      body: 'window.L={};' });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => {
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'desktop');
    localStorage.removeItem('tl_gd_names');
  });
  await p.reload(); await p.waitForTimeout(900);

  console.log('— карточка Диска: подписи-имена —');
  await p.evaluate(() => window.App.go('settings'));
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.fold-h')]
      .find(x => /Google Drive/.test(x.textContent || ''));
    if (b) b.click();
  });
  await p.waitForTimeout(300);

  const init = await p.evaluate(() => {
    const ids = ['gd-nm-photo', 'gd-nm-inv', 'gd-nm-files'];
    return {
      present: ids.every(i => !!document.getElementById(i)),
      inRow: ids.every(i => document.getElementById(i)?.closest('.gd-val')
        && document.getElementById(i)?.closest('.gd-val').querySelector('input')),
      hidden: ids.every(i => getComputedStyle(document.getElementById(i)).display === 'none'),
    };
  });
  t('три подписи-имени существуют', init.present, JSON.stringify(init));
  t('каждая — в одной строке со своим полем ввода', init.inRow);
  t('пустые подписи скрыты (:empty)', init.hidden);

  /* заполняем как это сделал бы ответ media-health?names=1 */
  await p.evaluate(() => window.App.gdNamesApply({
    root:    { id: 'r', name: 'TechLog Archive' },
    photo:   { id: 'p', name: 'APC Фото и видео', own: true },
    invoice: { id: '',  name: 'TechLog Archive / Invoices', own: false },
    file:    { id: 'f', name: '', own: true },
  }));
  await p.waitForTimeout(150);
  const after = await p.evaluate(() => ({
    photo: document.getElementById('gd-nm-photo').textContent.trim(),
    inv:   document.getElementById('gd-nm-inv').textContent.trim(),
    files: document.getElementById('gd-nm-files').textContent.trim(),
    photoShown: getComputedStyle(document.getElementById('gd-nm-photo')).display !== 'none',
    ls: localStorage.getItem('tl_gd_names'),
  }));
  t('фото: имя своей папки показано', after.photo === 'APC Фото и видео' && after.photoShown, after.photo);
  t('инвойсы: фолбэк «архив / Invoices» показан', /TechLog Archive \/ Invoices/.test(after.inv), after.inv);
  t('вложения: своя, но недоступная — помечена ⚠', /⚠/.test(after.files) && /недоступна/.test(after.files), after.files);
  t('пометка ⚠ — жёлтая (класс bad)', await p.evaluate(() =>
    document.getElementById('gd-nm-files').classList.contains('bad')));
  t('имена закэшированы в localStorage', !!after.ls && /APC Фото и видео/.test(after.ls));

  /* кэш переживает перерисовку: уходим и возвращаемся */
  await p.evaluate(() => window.App.go('home'));
  await p.waitForTimeout(300);
  await p.evaluate(() => window.App.go('settings'));
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const f = [...document.querySelectorAll('.fold-h')]
      .find(x => /Google Drive/.test(x.textContent || ''));
    const open = f && f.closest('.fold') && f.closest('.fold').classList.contains('on');
    if (f && !open) f.click();
  });
  await p.waitForTimeout(300);
  const cached = await p.evaluate(() => ({
    photo: document.getElementById('gd-nm-photo')?.textContent.trim(),
    files: document.getElementById('gd-nm-files')?.textContent.trim(),
  }));
  t('после перерисовки имена берутся из кэша', cached.photo === 'APC Фото и видео', JSON.stringify(cached));
  t('пометка ⚠ тоже переживает перерисовку', /недоступна/.test(cached.files || ''), cached.files);

  await p.screenshot({ path: '/tmp/pw/36-gd-names.png' });
  await br.close();
  console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
