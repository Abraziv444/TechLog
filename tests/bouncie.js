/* Смоук v1.08.32: машины Bouncie в демо-режиме — точки на карточках,
   чипы и панель пробега на карте, справочник «Автомобили», карточка
   настроек. Leaflet заменён локальной DOM-заглушкой (CDN недоступен).
   Запуск: node tests/bouncie.js <порт>  (сервер поднимается снаружи) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8123;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript',
      body: require('fs').readFileSync('/tmp/pw/leaflet-stub.js', 'utf8') });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await p.reload(); await p.waitForTimeout(900);

  console.log('— главная: точки статусов —');
  await p.waitForSelector('.bn-dot.site, .bn-dot.go', { timeout: 5000 }).catch(() => {});
  const home = await p.evaluate(() => ({
    site: document.querySelectorAll('.bn-dot.site').length,
    go: document.querySelectorAll('.bn-dot.go').length,
    title: (document.querySelector('.bn-dot.site') || document.querySelector('.bn-dot.go') || {}).title || ''
  }));
  t('на главной есть сплошная точка (админ на месте пикапа)', home.site >= 1, JSON.stringify(home));
  t('подсказка точки называет сотрудника', /Ivan|Sergey|Alexey/.test(home.title), home.title);

  console.log('— доска: мигающая точка у воркера —');
  await p.click('[data-screen="board"], [onclick*="\'board\'"]', { timeout: 3000 }).catch(async () => {
    await p.evaluate(() => { window.App.go('board'); });
  });
  await p.waitForTimeout(700);
  const board = await p.evaluate(() => {
    const go = document.querySelector('.bjob .bn-dot.go, .bpk .bn-dot.go');
    if (!go) return { found: false };
    const r = go.getBoundingClientRect(), c = go.closest('.bcol').getBoundingClientRect();
    const anim = getComputedStyle(go).animationName;
    return { found: true, anim, inCol: r.right <= c.right + 8 && r.top >= c.top - 8,
      col: go.closest('.bcol').querySelector('.bcol-h').textContent.trim().slice(0, 20) };
  });
  t('мигающая точка на карточке доски', board.found && board.anim === 'bn-blink', JSON.stringify(board));
  t('точка в колонке воркера и не обрезана', board.found && /Sergey/.test(board.col) && board.inCol, JSON.stringify(board));
  await p.screenshot({ path: '/tmp/pw/board.png' });

  console.log('— карта: чипы, машины, панель пробега —');
  await p.evaluate(() => { window.App.go('map'); });
  await p.waitForTimeout(900);
  const map = await p.evaluate(() => ({
    chips: document.querySelectorAll('.bn-chip').length,
    on: document.querySelectorAll('.bn-chip.on').length,
    cars: document.querySelectorAll('.map-car').length,
    run: document.querySelectorAll('.map-car.run').length,
    dash: document.querySelectorAll('.pw-line.dash').length,
    rows: document.querySelectorAll('#bn-stats .bn-srow').length,
    tot: (document.querySelector('.bn-stot') || {}).textContent || '',
    pop: (document.querySelector('.map-car.run') || { closest: () => null }).closest
      ? ((document.querySelector('.map-car.run').closest('.pw-marker') || {}).getAttribute || (() => ''))
        .call(document.querySelector('.map-car.run').closest('.pw-marker'), 'data-pop') || '' : ''
  }));
  t('чипы: «Все» + 3 машины', map.chips === 4, map.chips);
  t('режим «все»: подсвечены все чипы', map.on === 4, map.on);
  t('на карте 3 машины, одна в движении', map.cars === 3 && map.run === 1, JSON.stringify(map));
  t('пунктирный маршрут к цели нарисован', map.dash >= 1, map.dash);
  t('панель пробега: 3 строки и итог', map.rows === 3 && /Итого|Total/i.test(map.tot), map.rows + ' | ' + map.tot);
  t('попап машины: цель и проценты', /→/.test(map.pop) && /%/.test(map.pop), map.pop.slice(0, 80));
  await p.screenshot({ path: '/tmp/pw/map.png' });

  const iso = await p.evaluate(() => {
    window.App.bnToggleCar('350000000000002');
    return { on: document.querySelectorAll('.bn-chip.on').length,
             dim: document.querySelectorAll('.map-car.dim').length };
  });
  t('клик по чипу изолирует одну машину', iso.on === 1 && iso.dim === 2, JSON.stringify(iso));
  await p.evaluate(() => window.App.bnCarsAll());

  console.log('— справочник и настройки —');
  const dirs = await p.evaluate(async () => {
    window.App.go('dirs'); await new Promise(r => setTimeout(r, 300));
    const tab = [...document.querySelectorAll('button, .tab')].find(b => /Автомобили|Vehicles/i.test(b.textContent));
    if (tab) tab.click(); await new Promise(r => setTimeout(r, 300));
    return { tab: !!tab, rows: document.querySelectorAll('.rowline').length,
             ford: /Ford Transit/.test(document.body.innerHTML),
             imp: /Импорт из Bouncie|Import from Bouncie/i.test(document.body.innerHTML) };
  });
  t('вкладка «Автомобили»: 3 машины, Ford в списке', dirs.tab && dirs.rows >= 3 && dirs.ford, JSON.stringify(dirs));
  t('кнопки импорта нет в демо (только с Supabase)', !dirs.imp);
  const modal = await p.evaluate(async () => {
    window.App.vehModal(); await new Promise(r => setTimeout(r, 200));
    const no = document.querySelector('#veh-no');
    const val = no ? no.value : '';
    window.App.closeModal();
    return { open: !!no, free: val };
  });
  t('модалка машины: свободный № подставлен (4)', modal.open && modal.free === '4', JSON.stringify(modal));

  const set = await p.evaluate(async () => {
    window.App.go('settings'); await new Promise(r => setTimeout(r, 300));
    return { card: /GPS-трекинг Bouncie|Bouncie GPS tracking/.test(document.body.innerHTML) };
  });
  t('карточка Bouncie в настройках админа', set.card);

  await br.close();
  console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔', e.message); process.exit(1); });
