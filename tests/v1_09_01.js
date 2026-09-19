/* Смоук v1.09.01: справочник «Трекеры Bouncie» в демо-режиме — вкладка,
   счётчики и фильтр, сверка (кнопкой и автоматически при открытии),
   пропавший трекер → «неактивен» без удаления, вернувшийся → активен,
   выбор трекера в карточке машины (занятые недоступны, неактивные не
   предлагаются, VIN/марка подставляются), сохранение и строка машины.
   Leaflet заменён локальной DOM-заглушкой (CDN недоступен).
   Запуск: node tests/v1_09_01.js <порт>  (сервер поднимается снаружи) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8123;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  console.log('— вкладка «Трекеры Bouncie» —');
  const open = await p.evaluate(async () => {
    window.App.go('dirs'); await new Promise(r => setTimeout(r, 300));
    const tabs = [...document.querySelectorAll('#dir-tabs .tabbtn')].map(b => b.textContent.trim());
    const tab = [...document.querySelectorAll('#dir-tabs .tabbtn')].find(b => /Трекеры Bouncie|Bouncie trackers/i.test(b.textContent));
    if (tab) tab.click(); await new Promise(r => setTimeout(r, 700));   // + автосверка при открытии
    const seg = [...document.querySelectorAll('.trk-seg button')].map(b => b.textContent.trim());
    return { tabs, tab: !!tab, seg, rows: document.querySelectorAll('.trk-row').length,
      off: document.querySelectorAll('.trk-row.off').length,
      firstOn: !!(document.querySelector('.trk-row') && !document.querySelector('.trk-row').classList.contains('off')),
      lastOff: !!(document.querySelector('.trk-row:last-child') && document.querySelector('.trk-row:last-child').classList.contains('off')),
      sync: !!document.querySelector('#trk-sync'), hint: /Синхронизировать|Sync with Bouncie/.test(document.body.innerText),
      spare: /Spare/.test(document.body.innerText), old: /Old unit/.test(document.body.innerText),
      checked: (document.querySelector('#trk-sync') || {}).nextElementSibling ? document.querySelector('#trk-sync').nextElementSibling.textContent : '' };
  });
  t('вкладка после «Автомобили», открывается', open.tab && open.tabs.indexOf('ТРЕКЕРЫ BOUNCIE') === open.tabs.indexOf('АВТОМОБИЛИ') + 1
    || open.tab && open.tabs.findIndex(x => /Трекеры Bouncie/i.test(x)) === open.tabs.findIndex(x => /Автомобили/i.test(x)) + 1, JSON.stringify(open.tabs));
  t('5 трекеров: 4 активных и 1 неактивный, активные первыми, неактивный последним', open.rows === 5 && open.off === 1 && open.firstOn && open.lastOff, JSON.stringify(open));
  t('сегмент «Все · 5 / Активные · 4 / Неактивные · 1»', /5$/.test(open.seg[0]) && /4$/.test(open.seg[1]) && /1$/.test(open.seg[2]), open.seg.join(' | '));
  t('свободный «Spare» и пропавший «Old unit» в списке, кнопка сверки есть', open.spare && open.old && open.sync);
  t('автосверка при открытии проставила время последней сверки', !/ещё не сверялся|not synced yet/.test(open.checked) && /\d\d:\d\d/.test(open.checked), open.checked);

  const filt = await p.evaluate(async () => {
    window.App.trkFilter('inactive'); await new Promise(r => setTimeout(r, 200));
    const off = { rows: document.querySelectorAll('.trk-row').length, txt: (document.querySelector('.trk-row .grow') || {}).textContent || '' };
    window.App.trkFilter('active'); await new Promise(r => setTimeout(r, 200));
    const on = { rows: document.querySelectorAll('.trk-row').length, off: document.querySelectorAll('.trk-row.off').length };
    window.App.trkFilter('all'); await new Promise(r => setTimeout(r, 200));
    return { off, on, all: document.querySelectorAll('.trk-row').length };
  });
  t('фильтр «Неактивные» → 1 строка (Old unit, «пропал из Bouncie»), «Активные» → 4, «Все» → 5',
    filt.off.rows === 1 && /Old unit/.test(filt.off.txt) && /пропал из Bouncie|gone from Bouncie/.test(filt.off.txt) && filt.on.rows === 4 && filt.on.off === 0 && filt.all === 5, JSON.stringify(filt));

  console.log('— сверка: пропал → неактивен, вернулся → активен —');
  const gone = await p.evaluate(async () => {
    /* список Bouncie без Spare: он должен стать «неактивен», строка остаться */
    const list = window.App._bnDemoList().filter(x => x.imei !== '350000000000005');
    const r = await window.App._bnDevSync(false, list);
    await new Promise(r2 => setTimeout(r2, 300));
    const row = [...document.querySelectorAll('.trk-row')].find(x => /Spare/.test(x.textContent));
    return { r, rows: document.querySelectorAll('.trk-row').length, off: document.querySelectorAll('.trk-row.off').length,
      spareOff: !!(row && row.classList.contains('off')), spareGone: row ? /пропал из Bouncie|gone from Bouncie/.test(row.textContent) : false,
      toast: [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ') };
  });
  t('сверка: off 1, added 0; Spare стал неактивным с датой ухода, строка не удалена (всего по-прежнему 5)',
    gone.r && gone.r.off === 1 && gone.r.added === 0 && gone.rows === 5 && gone.off === 2 && gone.spareOff && gone.spareGone, JSON.stringify(gone));
  t('тост сверки: «новых 0 · вернулись 0 · стали неактивными 1»', /0.*0.*1/.test(gone.toast) && /Сверка выполнена|Sync complete/.test(gone.toast), gone.toast);

  const back = await p.evaluate(async () => {
    const list = window.App._bnDemoList().concat([{ imei: '350000000000005', vin: '1N6BF0KM5KN800005', nickName: 'Spare',
      model: { make: 'Nissan', name: 'NV200', year: 2019 }, stats: { lastUpdated: new Date().toISOString(), odometer: 61300, location: { lat: 33.9, lon: -84.3 } } }]);
    const r = await window.App._bnDevSync(false, list);
    await new Promise(r2 => setTimeout(r2, 300));
    const row = [...document.querySelectorAll('.trk-row')].find(x => /Spare/.test(x.textContent));
    return { r, off: document.querySelectorAll('.trk-row.off').length, spareOn: !!(row && !row.classList.contains('off')) };
  });
  t('вернувшийся Spare — back 1, снова активен', back.r && back.r.back === 1 && back.r.off === 0 && back.off === 1 && back.spareOn, JSON.stringify(back));
  const empty = await p.evaluate(async () => {
    const r = await window.App._bnDevSync(false, []);
    await new Promise(r2 => setTimeout(r2, 300));
    return { r, off: document.querySelectorAll('.trk-row.off').length, toast: [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ') };
  });
  t('пустой список Bouncie — статусы не тронуты (неактивный один), предупреждение в тосте', empty.r && empty.r.empty && empty.off === 1 && /пустой список|empty list/.test(empty.toast), JSON.stringify(empty));
  await p.screenshot({ path: '/tmp/pw/trackers.png' });

  console.log('— карточка машины: выбор трекера —');
  const modal = await p.evaluate(async () => {
    window.App.vehModal(); await new Promise(r => setTimeout(r, 200));
    const sel = document.querySelector('#veh-imei');
    const opts = sel ? [...sel.options].map(o => ({ v: o.value, l: o.textContent, d: o.disabled, s: o.selected })) : [];
    const noInput = !document.querySelector('input#veh-imei');
    /* выбрать свободный Spare — VIN и марка подставляются */
    const spare = opts.find(o => /Spare/.test(o.l));
    if (spare){ sel.value = spare.v; sel.dispatchEvent(new Event('change')); }
    await new Promise(r => setTimeout(r, 100));
    const vin = (document.querySelector('#veh-vin') || {}).value, make = (document.querySelector('#veh-make') || {}).value;
    return { opts, noInput, vin, make, no: (document.querySelector('#veh-no') || {}).value };
  });
  t('вместо поля IMEI — список: «без трекера» + 4 активных, неактивного Old unit нет', modal.noInput && modal.opts.length === 5 && !modal.opts.some(o => /Old unit/.test(o.l)), JSON.stringify(modal.opts));
  t('занятые Van 1/2/3 недоступны с № машины, свободный Spare доступен',
    modal.opts.filter(o => /Van [123]/.test(o.l)).every(o => o.d && /№\d/.test(o.l)) && modal.opts.some(o => /Spare/.test(o.l) && !o.d), JSON.stringify(modal.opts));
  t('выбор Spare подставил VIN и марку из трекера', modal.vin === '1N6BF0KM5KN800005' && modal.make === 'Nissan NV200 2019', modal.vin + ' / ' + modal.make);

  const saved = await p.evaluate(async () => {
    await window.App.vehSave(''); await new Promise(r => setTimeout(r, 400));
    const v = window.App._vehicles().find(x => x.imei === '350000000000005');
    window.App.dirTab('vehicles'); await new Promise(r => setTimeout(r, 300));
    const row = [...document.querySelectorAll('.rowline')].find(x => /Nissan NV200/.test(x.textContent));
    window.App.dirTab('trackers'); await new Promise(r => setTimeout(r, 300));
    const trow = [...document.querySelectorAll('.trk-row')].find(x => /Spare/.test(x.textContent));
    return { v: !!v, no: v && v.car_no, rowTxt: row ? row.textContent : '', trk: trow ? trow.textContent : '' };
  });
  t('машина сохранена с трекером Spare и свободным №4; в списке машин — «Spare (IMEI …005)»', saved.v && saved.no === 4 && /Spare \(IMEI 350000000000005\)/.test(saved.rowTxt), JSON.stringify(saved).slice(0, 200));
  t('в справочнике трекеров у Spare появилась машина №4', /Nissan NV200/.test(saved.trk) && !/не привязан|not assigned/.test(saved.trk), saved.trk.slice(0, 120));

  const taken = await p.evaluate(async () => {
    /* новая машина: Spare теперь занят — disabled; попытка сохранить с ним — отказ */
    window.App.vehModal(); await new Promise(r => setTimeout(r, 200));
    const sel = document.querySelector('#veh-imei');
    const spare = [...sel.options].find(o => /Spare/.test(o.textContent));
    const dis = spare && spare.disabled;
    spare.disabled = false; sel.value = spare.value;
    document.querySelector('#veh-make').value = 'Dup';
    const n0 = window.App._vehicles().length;
    await window.App.vehSave(''); await new Promise(r => setTimeout(r, 300));
    const n1 = window.App._vehicles().length;
    const toast = [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ');
    const stillOpen = !!document.querySelector('#veh-imei');
    window.App.closeModal();
    return { dis, n0, n1, toast, stillOpen };
  });
  t('занятый трекер: пункт disabled, сохранение отклонено (машина не создана, модалка открыта, тост «уже стоит на другой машине»)',
    taken.dis && taken.n0 === taken.n1 && taken.stillOpen && /другой машине|another vehicle/.test(taken.toast), JSON.stringify(taken).slice(0, 200));

  const inactiveOwn = await p.evaluate(async () => {
    /* трекер машины №4 пропал из Bouncie — машина помечена ⚠, правка марки не блокируется */
    const list = window.App._bnDemoList().filter(x => x.imei !== '350000000000005');
    await window.App._bnDevSync(false, list);
    await new Promise(r => setTimeout(r, 300));
    const trow = [...document.querySelectorAll('.trk-row')].find(x => /Spare/.test(x.textContent));
    const warnTrk = !!(trow && trow.querySelector('.chip.warn'));
    window.App.dirTab('vehicles'); await new Promise(r => setTimeout(r, 300));
    const row = [...document.querySelectorAll('.rowline')].find(x => /Nissan NV200/.test(x.textContent));
    const warnCar = !!(row && row.querySelector('.chip.bad'));
    const v = window.App._vehicles().find(x => x.imei === '350000000000005');
    window.App.vehModal(v.id); await new Promise(r => setTimeout(r, 200));
    const sel = document.querySelector('#veh-imei');
    const own = [...sel.options].find(o => o.value === '350000000000005');
    document.querySelector('#veh-make').value = 'Nissan NV200 2019 (white)';
    await window.App.vehSave(v.id); await new Promise(r => setTimeout(r, 300));
    const v2 = window.App._vehicles().find(x => x.id === v.id);
    return { warnTrk, warnCar, ownSel: !!(own && own.selected && !own.disabled), ownTxt: own ? own.textContent : '',
      make: v2.make, imei: v2.imei, closed: !document.querySelector('#veh-imei') };
  });
  t('трекер машины пропал: ⚠ у трекера (с машиной) и чип «неактивен» у машины', inactiveOwn.warnTrk && inactiveOwn.warnCar, JSON.stringify(inactiveOwn).slice(0, 200));
  t('свой неактивный трекер виден в списке с пометкой и не мешает правке марки (трекер остался)',
    inactiveOwn.ownSel && /неактивен|inactive/.test(inactiveOwn.ownTxt) && inactiveOwn.make === 'Nissan NV200 2019 (white)' && inactiveOwn.imei === '350000000000005' && inactiveOwn.closed, JSON.stringify(inactiveOwn).slice(0, 250));

  console.log('— карта: машина видна по выбранному трекеру; менеджер вкладки не видит —');
  const map = await p.evaluate(async () => {
    window.App.go('map'); await new Promise(r => setTimeout(r, 900));
    return { cars: document.querySelectorAll('.map-car').length, chips: document.querySelectorAll('.bn-chip').length };
  });
  t('карта: 3 машины с активными трекерами (у №4 трекер неактивен — Bouncie её не отдаёт), чипы «Все» + 4 машины', map.cars === 3 && map.chips === 5, JSON.stringify(map));
  const mgr = await p.evaluate(async () => {
    localStorage.setItem('techlog_session_v1', 'demo-manager'); location.reload(); return true;
  });
  await p.waitForTimeout(900);
  const mgrTabs = await p.evaluate(async () => {
    window.App.go('dirs'); await new Promise(r => setTimeout(r, 300));
    return [...document.querySelectorAll('#dir-tabs .tabbtn')].map(b => b.textContent.trim());
  });
  t('менеджер: вкладок «Автомобили» и «Трекеры Bouncie» нет', !mgrTabs.some(x => /Трекеры|trackers|Автомобили|Vehicles/i.test(x)), mgrTabs.join(' | '));

  console.log('— справка —');
  const faq = await p.evaluate(async () => {
    localStorage.setItem('techlog_session_v1', 'demo-admin'); return true;
  });
  await p.reload(); await p.waitForTimeout(900);
  const help = await p.evaluate(async () => {
    window.App.go('dirs'); await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelector('.section-title .faq-i');
    if (btn) btn.click(); else window.App.sectionFaq('dirs');
    await new Promise(r => setTimeout(r, 300));
    const txt = document.body.innerText;
    const has = /Трекеры Bouncie|Bouncie trackers/.test(txt) && /1\.09\.01/.test(txt) && /неактивен|inactive/.test(txt);
    window.App.closeModal();
    return has;
  });
  t('справка «Справочник» рассказывает про трекеры (v1.09.01)', help);

  await br.close();
  console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔', e.message); process.exit(1); });
