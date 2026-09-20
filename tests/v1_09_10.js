/* v1.09.10:
     1) Карта → вкладка «Треки»: есть у админа, нет у сотрудника без права «Трек дня»;
        день / неделя (неделя — с понедельника), стрелки календаря, в будущее не уходит;
        выбор машин — все / одна / несколько; список под картой и итог; линии на карте
        рисуются по выбранным машинам; возврат на общую карту убирает панель;
        старый значок «трек дня» у машины открывает вкладку с этой машиной;
     2) блокировка сотрудника в демо не трогает Диск и не падает.
   Демо-режим (config.js = {}), CDN режутся, Leaflet — заглушка, считающая линии.
   Запуск: node tests/v1_09_10.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8910;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
/* заглушка Leaflet: цепочки вызовов ничего не делают, но polyline() считает нарисованные линии */
const LEAFLET_STUB = `(function(){
  window.__pl = [];
  function chain(){ var f = function(){ return p; }; var p = new Proxy(f, { get: function(t, k){ if (k === 'then') return undefined; if (k === Symbol.toPrimitive) return function(){ return ''; };
      if (k === 'polyline') return function(pts, o){ window.__pl.push({ n: (pts || []).length, c: (o || {}).color, w: (o || {}).weight }); return p; };
      return p; }, apply: function(){ return p; }, construct: function(){ return p; } }); return p; }
  window.L = chain();
})();`;
async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => /leaflet.*\.js/.test(r.request().url())
    ? r.fulfill({ contentType: 'application/javascript', body: LEAFLET_STUB }) : r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.evaluate(([who, mode]) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('techlog_session_v1', who); localStorage.setItem('techlog_view_mode', mode); }, [o.who || 'demo-admin', o.mode || 'mobile']);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(800);
  return p;
}
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  for (const o of [{ w: 1400, h: 1000, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('1. Карта → «Треки» — ' + o.mode);
    const p = await boot(br, o);
    await p.evaluate(() => App.go('map')); await p.waitForTimeout(700);
    t('у админа три вкладки карты, третья — «Треки»', await p.evaluate(() => { const b = [...document.querySelectorAll('#app .map-tabs .tabbtn')].map(x => x.innerText.trim()); return b.length === 3 && /трек/i.test(b[2]); }));
    t('вкладки помещаются в ширину экрана', await p.evaluate(() => [...document.querySelectorAll('#app .map-tabs .tabbtn')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })));
    await p.evaluate(() => App.trkMode()); await p.waitForTimeout(1000);
    await p.evaluate(() => { window.__pl = []; App.go('map'); }); await p.waitForTimeout(600);   // одна чистая перерисовка — считаем линии только с неё
    const cars = await p.evaluate(() => trkCars().length);
    const day = await p.evaluate(() => ({ trips: TRKH.trips.length, chips: document.querySelectorAll('.trk-chip').length, rows: document.querySelectorAll('.trk-row').length, lines: (window.__pl || []).filter(x => x.w === 7).length, bnChips: !!document.querySelector('.bn-chips'), date: TRKH.date }));
    t(`день: поездки есть, чипов машин ${cars} + «все», строк в списке ${cars} + итог`, day.trips > 0 && day.chips === cars + 1 && day.rows === cars + 1, day);
    t('на карте у каждой поездки своя линия (считаем подложки; карта перерисована один раз)', day.lines === day.trips, day);
    t('чипы живых машин и сводка «Пробег за сегодня» во вкладке скрыты', await p.evaluate(() => !document.querySelector('#app .bn-stats') && ![...document.querySelectorAll('#app .map-controls .tiny')].some(x => /пунктир/.test(x.innerText))));
    /* неделя */
    await p.evaluate(() => App.trkSetMode('week')); await p.waitForTimeout(1000);
    const wk = await p.evaluate(() => ({ r: trkRange(), trips: TRKH.trips.length, days: document.querySelectorAll('.trk-day').length }));
    const mon = new Date(wk.r.from + 'T12:00:00').getDay(), sun = new Date(wk.r.to + 'T12:00:00').getDay();
    t('неделя — с понедельника по воскресенье, в списке разбивка по дням', mon === 1 && sun === 0 && wk.trips > day.trips && wk.days > 0, wk);
    t('стрелка «вперёд» на текущей неделе выключена, в будущее дата не уходит', await p.evaluate(() => { const b = [...document.querySelectorAll('.trk-date .icon-btn')].pop(); App.trkSetDate('2099-01-01'); return b.disabled && TRKH.date === todayISO(); }));
    await p.evaluate(() => App.trkShift(-1)); await p.waitForTimeout(1000);
    const prev = await p.evaluate(() => trkRange());
    t('стрелка «назад» — предыдущая неделя целиком', prev.to < wk.r.from && (Date.parse(wk.r.from) - Date.parse(prev.from)) === 7 * 864e5, prev);
    /* выбор машин */
    const first = await p.evaluate(() => String(trkCars()[0].imei));
    await p.evaluate(() => { window.__pl = []; }); await p.evaluate(i => App.trkCar(i), first); await p.waitForTimeout(500);
    const one = await p.evaluate(i => ({ sel: TRKH.sel ? [...TRKH.sel] : null, rows: document.querySelectorAll('.trk-row').length, lines: window.__pl.filter(x => x.w === 7).length, left: TRKH.trips.filter(x => x.imei !== i).length }), first);
    t('снятая машина уходит из списка и с карты', !!one.sel && !one.sel.includes(first) && one.rows === cars && one.lines === one.left, one);
    await p.evaluate(() => App.trkAll(false)); await p.waitForTimeout(400);
    t('«снять все» — пусто и понятная подпись', await p.evaluate(() => TRKH.sel && TRKH.sel.size === 0 && !!document.querySelector('#app .list-empty')));
    await p.evaluate(() => App.trkAll(true)); await p.waitForTimeout(400);
    t('«все машины» — выбор сброшен', await p.evaluate(() => TRKH.sel === null && document.querySelectorAll('.trk-row').length > 1));
    /* возврат */
    await p.evaluate(() => App.mapMode(false)); await p.waitForTimeout(500);
    t('общая карта: панель треков убрана, чипы машин вернулись', await p.evaluate(() => !state.mapTrk && !document.querySelector('.trk-ctl')));
    /* старый значок «трек дня» */
    await p.evaluate(() => App.go('home')); await p.evaluate(i => App.bnTrack(i), first); await p.waitForTimeout(1000);
    t('«трек дня» у машины открывает вкладку с одной этой машиной, режим «день», сегодня', await p.evaluate(i => state.screen === 'map' && state.mapTrk && TRKH.mode === 'day' && TRKH.date === todayISO() && TRKH.sel && TRKH.sel.size === 1 && TRKH.sel.has(i), first));
    await p.context().close();
  }

  { console.log('1. Права');
    const p = await boot(br, { w: 412, h: 915, mode: 'mobile', touch: true, who: 'demo-tech' });
    await p.evaluate(() => App.go('map')); await p.waitForTimeout(600);
    t('сотрудник без права «Трек дня» вкладки не видит', await p.evaluate(() => [...document.querySelectorAll('#app .map-tabs .tabbtn')].length === 2));
    await p.evaluate(() => App.trkMode()); await p.waitForTimeout(400);
    t('и вызовом App.trkMode() её не открыть', await p.evaluate(() => !state.mapTrk));
    await p.evaluate(() => { state.user.bn_track = true; App.go('map'); }); await p.waitForTimeout(500);
    t('с правом «Трек дня» вкладка появляется', await p.evaluate(() => [...document.querySelectorAll('#app .map-tabs .tabbtn')].length === 3));
    await p.context().close(); }

  { console.log('2. Блокировка сотрудника в демо');
    const p = await boot(br, { w: 1400, h: 1000, mode: 'desktop' });
    const uid = await p.evaluate(() => state.data.profiles.find(x => x.role === 'tech').id);
    await p.evaluate(u => App.staffBlock(u), uid); await p.waitForTimeout(800);
    t('сотрудник заблокирован, ошибок нет', await p.evaluate(u => state.data.profiles.find(x => x.id === u).blocked === true, uid));
    await p.evaluate(u => App.staffBlock(u), uid); await p.waitForTimeout(800);
    t('и разблокирован обратно', await p.evaluate(u => state.data.profiles.find(x => x.id === u).blocked === false, uid));
    await p.context().close(); }

  await br.close();
  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
