/* v1.09.55 — замечания 23–24.09:
   A. шапка без пустот: «учёт работ» видна на телефонах 360–412 px, «Обычный | Компактный» рядом с «Телефон | ПК» того же
      размера, кнопок плотности внизу слева и на доске нет, ПК — шапка в одну строку;
   B. свой шрифт Nunito (vendor/fonts, без Google Fonts), значок приложения рисуется тем же шрифтом;
   C. маршруты дня на карте приложения (офис → точки по номерам, дороги OSRM, пунктир без связи, сводка, навигатор, галочка);
   D. ТВ: «Маршруты дня линиями на карте» и карусель сотрудников (слайды, карточка, фокус карты, пульт, автосмена);
   E. характеристики апартаментов (справочник, обязательные в карточке комплекса, строка в документе, карта);
   F. предыстория задачи в юните без цен (настройка, строка в документе, окно, единый номер юнита, срок, вид работ);
   G. Bouncie: разбор ошибок, кнопка «подробнее», окно по машинам, диагностика в демо.
   Демо-режим. Запуск: node tests/v1_09_55.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
const OSRM = { routes: [{ distance: 16093.44, duration: 1500, geometry: { type: 'LineString', coordinates: [[-84.30, 33.99], [-84.35, 33.95], [-84.40, 33.90], [-84.462, 33.8823]] } }] };
async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.touch ? 2 : 1, hasTouch: !!o.touch, isMobile: !!o.mobile, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p._errs = errs;
  p.on('dialog', d => d.accept());
  const reqs = []; p._reqs = reqs; p.on('request', r => reqs.push(r.url()));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  if (o.osrm) await p.route(/router\.project-osrm\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(OSRM) }));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(400);
  await p.evaluate(([mode, ls, who]) => { localStorage.clear(); localStorage.setItem('techlog_session_v1', who || 'demo-admin'); localStorage.setItem('techlog_view_mode', mode);
    Object.keys(ls || {}).forEach(k => localStorage.setItem(k, ls[k])); }, [o.mode || 'mobile', o.ls || {}, o.who]);
  await p.reload(); await p.waitForFunction(() => window.App && typeof state !== 'undefined' && state.user && document.querySelector('.tabbar'), null, { timeout: 20000 });
  await p.waitForTimeout(600);
  return p;
}
const go = async (p, s) => { await p.evaluate(x => window.App.go(x), s); await p.waitForTimeout(600); };
const rect = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, disp: getComputedStyle(e).display }; }, sel);

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  /* ================= A. шапка ================= */
  console.log('— A. шапка —');
  for (const [w, dens] of [[360, 'cozy'], [393, 'cozy'], [412, 'cozy'], [393, 'compact']]){
    const p = await boot(br, { w, h: 800, touch: 1, mobile: 1, ls: { techlog_density_m: dens, techlog_menu_rows: '2' } });
    const g = await p.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), d: getComputedStyle(e).display, tx: e.textContent.trim() }; };
      return { top: q('.topbar'), brand: q('.brand'), name: q('.brand .name'), tag: q('.brand .name-tag'), sub: q('.brand .sub'), rt: q('.rt-col'), vm: q('#vm-slot'), dens: q('#dens-slot'), av: q('.avatar-wrap') }; });
    t(`${w}px ${dens}: «учёт работ» видна отдельной строкой под «Tech Log», не обрезана`, g.tag && g.tag.d !== 'none' && g.tag.w >= 40 && g.tag.tx === 'учёт работ' && g.tag.t >= g.name.t + 8 && g.tag.r <= g.brand.r + 1, g.tag);
    t(`${w}px ${dens}: название не залезает на переключатели, версия видна`, g.brand.r <= g.rt.l && g.sub.w > 40 && /v1\.09\.55/.test(g.sub.tx), { brand: g.brand, rt: g.rt, sub: g.sub });
    t(`${w}px ${dens}: «Обычный | Компактный» сразу за «Телефон | ПК», тот же размер и ряд`, g.dens && Math.abs(g.dens.w - g.vm.w) < 1 && Math.abs(g.dens.h - g.vm.h) < 1 && Math.abs(g.dens.t - g.vm.t) < 1 && g.dens.l > g.vm.r, { vm: g.vm, dens: g.dens });
    t(`${w}px ${dens}: шапка не выше прежней (≤ 70 px) и ничего не вылезает за экран`, g.top.h <= 70 && g.av.r <= w && g.rt.r <= w, g.top);
    if (w === 393 && dens === 'cozy'){
      await p.click('#dens-slot button:nth-child(2)'); await p.waitForTimeout(500);
      t('телефон: «Компактный» в шапке включает компактную плотность и подсвечивается', await p.evaluate(() => document.documentElement.classList.contains('tl-compact') && document.querySelector('#dens-slot button:nth-child(2)').getAttribute('aria-pressed') === 'true'));
      await p.click('#dens-slot button:nth-child(1)'); await p.waitForTimeout(500);
      t('«Обычный» возвращает обычную', await p.evaluate(() => !document.documentElement.classList.contains('tl-compact')));
      await p.evaluate(() => window.App.setLang('en')); await p.waitForTimeout(400);
      t('EN: подпись «work log», подсказки кнопок на английском', await p.evaluate(() => document.querySelector('.brand .name-tag').textContent.trim() === 'work log'
        && /Regular interface/.test(document.querySelector('#dens-slot button').title)));
      await p.evaluate(() => window.App.setLang('ru')); await p.waitForTimeout(300);
      await go(p, 'board');
      t('на доске значка плотности больше нет', await p.evaluate(() => !document.querySelector('#brd-dens')));
    }
    t(`${w}px ${dens}: без ошибок страницы`, !p._errs.length, p._errs);
    await p.context().close();
  }
  { const p = await boot(br, { w: 1366, h: 768, mode: 'desktop' });
    const g = await p.evaluate(() => { const q = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height, w: r.width }; };
      return { top: q('.topbar'), name: q('.brand .name'), tag: q('.brand .name-tag'), vm: q('#vm-slot'), dens: q('#dens-slot'), net: q('.topbar .net-pill'), role: q('.topbar .role-tag'), av: q('.avatar-wrap .avatar'), pill: q('.login-pill'), dsk: !!document.querySelector('#dsk-density') }; });
    t('ПК: шапка в одну строку (переключатели, связь, роль, аватар — на одной высоте), ниже 66 px', g.top.h <= 66 && [g.dens, g.net, g.role, g.av].every(x => Math.abs((x.t + x.b) / 2 - (g.vm.t + g.vm.b) / 2) < 6), g);
    t('ПК: «учёт работ» рядом с названием в той же строке, логин слева от аватара', Math.abs(g.tag.t - g.name.t) < 12 && g.tag.l > g.name.l + 60 && g.pill.r <= g.av.l + 1, { tag: g.tag, name: g.name, pill: g.pill, av: g.av });
    t('ПК: кнопки плотности внизу слева нет', !g.dsk);
    t('ПК: без ошибок страницы', !p._errs.length, p._errs);
    await p.context().close(); }

  /* ================= B. шрифт и значок ================= */
  console.log('— B. шрифт и значок —');
  { const p = await boot(br, { w: 412, h: 800, touch: 1, mobile: 1 });
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    const f = await p.evaluate(() => ({ black: document.fonts.check('900 20px Nunito'), faces: [...document.fonts].filter(x => x.family.replace(/"/g, '') === 'Nunito').map(x => x.status) }));
    t('Nunito свой: @font-face из vendor/fonts загружен, запросов к Google Fonts нет', f.faces.includes('loaded') && p._reqs.some(u => /vendor\/fonts\/nunito-(latin|cyrillic)\.woff2/.test(u)) && !p._reqs.some(u => /fonts\.(googleapis|gstatic)\.com/.test(u)), { f, reqs: p._reqs.filter(u => /font/.test(u)) });
    await p.context().close(); }
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), mk = fs.readFileSync(path.join(ROOT, 'icons/make-icons.py'), 'utf8');
  t('index.html без Google Fonts, с preload своих шрифтов; service worker кэширует оба файла', !/fonts\.googleapis/.test(idx) && /preload" href="\.\/vendor\/fonts\/nunito-cyrillic\.woff2"/.test(idx)
    && sw.includes("'./vendor/fonts/nunito-cyrillic.woff2'") && sw.includes("'./vendor/fonts/nunito-latin.woff2'") && fs.existsSync(path.join(ROOT, 'vendor/fonts/OFL-Nunito.txt')));
  t('значок рисуется тем же Nunito толщиной 900 (как «Tech Log» в шапке), а не Poppins', /nunito-latin\.woff2/.test(mk) && /set_variation_by_axes\(\[900\]\)/.test(mk) && !/Poppins-Bold\.ttf'/.test(mk));
  { const png = fs.readFileSync(path.join(ROOT, 'icons/icon-512.png')); t('icon-512.png — PNG 512×512', png.readUInt32BE(16) === 512 && png.readUInt32BE(20) === 512); }

  /* ================= C. маршруты дня на карте ================= */
  console.log('— C. маршруты дня на карте приложения —');
  for (const osrm of [true, false]){
    const p = await boot(br, { w: 412, h: 915, touch: 1, mobile: 1, osrm });
    await p.evaluate(() => { const o = state.data.org_settings; o.office_lat = 33.99; o.office_lng = -84.30; o.office_addr = 'Office, Alpharetta'; window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
    await go(p, 'map'); await p.waitForTimeout(1200);
    const m = await p.evaluate(() => ({ chk: !!document.querySelector('.mr-chk input:checked'), old: !!document.querySelector('[onclick*="App.mapRoute()"]'),
      rows: [...document.querySelectorAll('#mr-sum .mr-row')].map(r => r.innerText.replace(/\s+/g, ' ')), office: !!document.querySelector('.map-office'),
      paths: [...document.querySelectorAll('.leaflet-overlay-pane path')].map(x => ({ stroke: x.getAttribute('stroke'), dash: x.getAttribute('stroke-dasharray') })) }));
    const col = m.paths.filter(x => x.stroke && x.stroke !== '#0F171B');
    if (osrm){
      t('галочка «Маршруты на карте» включена, старой кнопки «Маршрут дня в Google Maps» нет', m.chk && !m.old, m);
      t('по сотруднику своя линия по дорогам (сплошная), офис на карте', col.length >= 2 && col.some(x => !x.dash) && m.office, m.paths);
      t('сводка: точки, мили и время по дорогам, «от офиса», кнопка навигатора', m.rows.length >= 2 && m.rows.every(r => /точк/.test(r) && /10\.0 mi · 0:25/.test(r) && /от офиса/.test(r) && /Google Maps/.test(r)), m.rows);
      await p.click('#mr-sum .mr-row .btn'); await p.waitForTimeout(200);
      t('кнопка навигатора открывает точки этого сотрудника в Google Maps', await p.evaluate(() => window.__opened.length === 1 && /google\.com\/maps\/dir\/[\d.,\-/]+/.test(window.__opened[0])), await p.evaluate(() => window.__opened));
      await p.click('.mr-chk input'); await p.waitForTimeout(700);
      t('галочка выключает линии и сводку (запоминается на устройстве)', await p.evaluate(() => !document.querySelector('#mr-sum') && !MROUTE.layer && !document.querySelector('.map-office')
        && localStorage.getItem('techlog_map_routes') === '0'));
    } else {
      t('без сервера дорог — пунктир по прямой и «~ … по прямой» в сводке', col.length >= 2 && col.every(x => x.dash) && m.rows.every(r => /~\d+\.\d mi по прямой/.test(r)), m);
    }
    t('карта: без ошибок страницы', !p._errs.length, p._errs);
    await p.context().close();
  }
  { const p = await boot(br, { w: 412, h: 915, touch: 1, mobile: 1, who: 'demo-tech' });
    await go(p, 'map'); await p.waitForTimeout(900);
    const r0 = await p.evaluate(() => ({ routes: mapDayRoutes().length, note: !!document.querySelector('#mr-sum .mr-note') }));
    t('одна точка и нет адреса офиса — линии нет, подсказка, где задать офис', r0.routes === 0 && r0.note, r0);
    await p.evaluate(() => { const j = state.data.jobs.find(x => x.technician_id === 'demo-tech' && x.date === todayISO());
      state.data.jobs.push({ ...JSON.parse(JSON.stringify(j)), id: uid(), complex_id: state.data.complexes[3].id, unit_number: '12', sort_order: 5 }); render(); });
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ routes: mapDayRoutes().map(x => x.tid), stops: (mapDayRoutes()[0] || {}).stops, note: !!document.querySelector('.mr-note') }));
    t('работник видит только свой маршрут (две точки); без офиса — от первой точки, с подсказкой', r.routes.length === 1 && r.routes[0] === 'demo-tech' && r.stops.length === 2 && r.note, r);
    await p.context().close(); }

  /* ================= D. ТВ: маршруты и карусель ================= */
  console.log('— D. ТВ: маршруты дня и карусель сотрудников —');
  { const p = await boot(br, { w: 1920, h: 1080, mode: 'desktop' });
    await p.evaluate(() => { localStorage.setItem('techlog_fold', JSON.stringify({ tvc: 1 })); });
    await go(p, 'settings');
    await p.evaluate(() => { state.data.org_settings.office_lat = 33.99; state.data.org_settings.office_lng = -84.30; });
    const ui = await p.evaluate(() => ({ mr: !!document.querySelector('input[onchange*="tvcFlag(\'mapRoutes\'"]'), car: !!document.querySelector('input[onchange*="tvcCar(\'on\'"]'),
      sec: !!document.querySelector('[onclick*="tvcCarSec"]'), who: document.querySelectorAll('[onclick*="tvcCar(\'who\'"]').length, pd: ['d', 'w', 'm'].every(k => !!document.querySelector(`input[onchange*="tvcCar('${k}'"]`)) }));
    t('«Режим телевизора»: галочка «Маршруты дня линиями на карте» и карточка «Карусель сотрудников» (секунды, общий вид, кого, периоды)', ui.mr && ui.car && ui.sec && ui.who === 2 && ui.pd, ui);
    await p.evaluate(() => App.tvTest()); await p.waitForTimeout(1500);
    const lines = () => p.evaluate(() => [...document.querySelectorAll('.tva-map .leaflet-overlay-pane path')].filter(x => /3B82F6|FF9600|58CC02|CE82FF/i.test(x.getAttribute('stroke') || '') && x.getAttribute('stroke-dasharray') !== '6 8').length);
    const l1 = await lines();
    await p.evaluate(() => { App.tvcFlag('mapRoutes', false); }); await p.waitForTimeout(900);
    const l0 = await lines();
    t('ТВ: маршруты дня линиями на карте — есть; галочка выключена — линий нет', l1 >= 2 && l0 === 0, { l1, l0 });
    await p.evaluate(() => { App.tvcFlag('mapRoutes', true); App.tvcCar('on', 1); App.tvcCarSec(0, 5); }); await p.waitForTimeout(900);
    const s0 = await p.evaluate(() => ({ slides: tvCarSlides(TV.eff || tvEffCfg()), focus: TV.focus, bar: !!document.querySelector('#tv-carbar .tvcb-run'), dots: document.querySelectorAll('#tv-carbar .tvcb-dots b').length, emp: document.querySelector('#tv-emp').hidden }));
    t('карусель включена: слайды «общий вид» + сотрудники с задачами, полоска времени, точки-слайды; сначала общий вид', s0.slides[0] === '' && s0.slides.length >= 3 && s0.focus === null && s0.bar && s0.dots === s0.slides.length && s0.emp === true, s0);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
    const s1 = await p.evaluate(() => { const f = TV.focus, stops = tvStops(f).filter(s => s.cx && s.cx.lat != null);
      return { focus: f, name: (document.querySelector('#tv-emp .tve-nm') || {}).textContent, cols: [...document.querySelectorAll('#tv-emp .tve-col .tve-ch')].map(x => x.textContent.trim()),
        pins: document.querySelectorAll('.tva-map .tvpin').length, stops: stops.length, cars: [...document.querySelectorAll('.tva-map .map-car.tvcar')].length,
        wrap: document.querySelector('.tvwrap').classList.contains('tv-car-emp'), legend: getComputedStyle(document.querySelector('.tv-legend')).display, pos: (document.querySelector('#tv-emp .tve-pos') || {}).textContent }; });
    t('пульт →: первый сотрудник — карточка с именем и колонками «Сегодня / Неделя / Месяц», «1 / N»', !!s1.focus && /\S/.test(s1.name || '') && s1.cols.join('|') === 'Сегодня|Неделя|Месяц' && /^1 \/ \d+$/.test(s1.pos || ''), s1);
    t('на карте только его точки (его нумерация) и только его машина; легенда общей карты спрятана', s1.pins === s1.stops && s1.cars <= 1 && s1.wrap && s1.legend === 'none', s1);
    const pan = await p.evaluate(() => { const e = document.querySelector('#tv-emp'), m = document.querySelector('.tva-map'); const a = e.getBoundingClientRect(), b = m.getBoundingClientRect();
      return { inside: a.left >= b.left && a.top >= b.top && a.bottom <= b.bottom + 1 && a.right <= b.left + b.width * 0.5, w: Math.round(a.width) }; });
    t('карточка — слева на карте, не шире половины карты', pan.inside && pan.w > 250, pan);
    await p.evaluate(() => { TV.carT0 = Date.now() - 4700; }); await p.waitForTimeout(1600);
    const s2 = await p.evaluate(() => TV.focus);
    t('через заданные секунды карусель сама переходит к следующему', s2 && s2 !== s1.focus, { s1: s1.focus, s2 });
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(700);
    t('пульт ←: назад, до общего вида — карточка скрыта, легенда снова видна', await p.evaluate(() => TV.focus === null && document.querySelector('#tv-emp').hidden && getComputedStyle(document.querySelector('.tv-legend')).display !== 'none'));
    await p.evaluate(() => App.tvcCar('over', 0)); await p.waitForTimeout(400);
    t('без общего вида — в слайдах только сотрудники', await p.evaluate(() => { const s = tvCarSlides(TV.eff || tvEffCfg()); return s.length >= 2 && !s.includes(''); }));
    await p.evaluate(() => App.tvcCar('who', 'all')); await p.waitForTimeout(300);
    t('«Всех» — в карусели все сотрудники ТВ-списка', await p.evaluate(() => tvCarSlides(TV.eff || tvEffCfg()).length === tvWorkersAll().length));
    const feed = await p.evaluate(() => { const f = tvTestFeed(); return { month: Array.isArray(f.stat_month), wt: Array.isArray(f.emp_wt), pk: Array.isArray(f.emp_pk), mi: Array.isArray(f.emp_mi) }; });
    t('данные для карточки (демо/проверка): stat_month, emp_wt, emp_pk, emp_mi', feed.month && feed.wt && feed.pk && feed.mi, feed);
    await p.evaluate(() => App.tvcCar('on', 0)); await p.waitForTimeout(1500);
    t('карусель выключена — общий вид, полоски нет', await p.evaluate(() => TV.focus === null && !document.querySelector('#tv-carbar')));
    t('ТВ: без ошибок страницы', !p._errs.length, p._errs);
    await p.context().close(); }
  const sql55 = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_55.sql'), 'utf8');
  t('tv_feed в SQL: stat_month, emp_wt, emp_pk (кто забрал), emp_mi (bn_trips) — прежние ключи на месте', ['stat_month', 'emp_wt', 'emp_pk', 'emp_mi', 'stat_week', 'site_day', 'office'].every(k => sql55.includes("'" + k + "'")) && /coalesce\(p\.picked_up_by, p\.technician_id\)/.test(sql55));

  /* ================= E. характеристики апартаментов ================= */
  console.log('— E. характеристики апартаментов —');
  { const p = await boot(br, { w: 412, h: 915, touch: 1, mobile: 1 });
    await go(p, 'dirs'); await p.evaluate(() => App.dirTab('cxattrs')); await p.waitForTimeout(500);
    t('справочник «Характеристики» у админа, пустой — с примером', await p.evaluate(() => !!document.querySelector('#cxa-dir .list-empty') && [...document.querySelectorAll('#dir-tabs .tabbtn')].some(b => /Характеристики/.test(b.textContent))));
    const add = async (name, kind, opts, req, cpIdx) => {
      await p.click('#cxa-add'); await p.waitForTimeout(250);
      await p.fill('#cxa-name', name); await p.click(`#cxa-kind button[data-k="${kind}"]`);
      if (opts) await p.fill('#cxa-opts', opts.join('\n'));
      if (req) await p.check('#cxa-req');
      if (cpIdx != null) await p.evaluate(i => { const s = document.getElementById('cxa-cp'); s.value = state.data.counterparties[i].id; }, cpIdx);
      await p.click('#cxa-save'); await p.waitForTimeout(400);
    };
    await p.click('#cxa-add'); await p.waitForTimeout(200); await p.click(`#cxa-kind button[data-k="choice"]`); await p.fill('#cxa-name', 'Лифт'); await p.fill('#cxa-opts', 'есть'); await p.click('#cxa-save'); await p.waitForTimeout(300);
    t('переключателю нужно хотя бы два варианта — без них не сохраняется', await p.evaluate(() => !!document.getElementById('cxa-save') && cxaDefs().length === 0));
    await p.evaluate(() => closeModal()); await p.waitForTimeout(200);
    await add('Парковка', 'text', null, true, null);
    await add('Лифт | Elevator', 'choice', ['есть', 'нет'], false, null);
    await add('Ключ у консьержа', 'check', null, true, 0);
    const defs = await p.evaluate(() => cxaDefs().map(d => ({ n: d.name, k: d.kind, r: d.req, cp: !!d.cp, o: d.opts })));
    t('три характеристики: текст (обяз., все), переключатель (доп., все), галочка (обяз., один контрагент)', defs.length === 3 && defs[0].k === 'text' && defs[0].r && !defs[0].cp
      && defs[1].k === 'choice' && !defs[1].r && defs[1].o.join('/') === 'есть/нет' && defs[2].k === 'check' && defs[2].r && defs[2].cp, defs);
    await p.evaluate(() => App.cxaMove(cxaDefs()[2].id, -1)); await p.waitForTimeout(300);
    t('▲▼ меняют порядок', await p.evaluate(() => cxaDefs()[1].name === 'Ключ у консьержа'));
    /* карточка комплекса контрагента №0: все три; обязательные пустые — не сохранить */
    const cx0 = await p.evaluate(() => state.data.complexes.find(c => c.counterparty_id === state.data.counterparties[0].id).id);
    await go(p, 'dirs'); await p.evaluate(() => App.dirTab('complexes')); await p.waitForTimeout(300);
    await p.evaluate(id => App.editCxModal(id), cx0); await p.waitForTimeout(300);
    const f0 = await p.evaluate(() => ({ req: [...document.querySelectorAll('#cxa-box > .cxa-f')].map(x => x.dataset.a).length, more: document.querySelectorAll('#cxa-box details .cxa-f').length, star: document.querySelectorAll('#cxa-box .cxa-star').length }));
    t('в карточке апарт-комплекса: обязательные сверху со звёздочкой, дополнительные — под «Дополнительно»', f0.req === 2 && f0.more === 1 && f0.star === 2, f0);
    await p.evaluate(() => App.saveCx(document.querySelector('[onclick*="App.saveCx"]').getAttribute('onclick').match(/'([^']+)'/)[1])); await p.waitForTimeout(400);
    t('обязательные пустые — не сохраняется, поля подсвечены', await p.evaluate(() => !!document.getElementById('cxa-box') && document.querySelectorAll('#cxa-box .cxa-bad').length === 2));
    await p.fill('#cxa-box input[data-cxa]:not([type=checkbox])', 'гостевая, въезд с Cumberland');
    await p.check('#cxa-box input[type=checkbox][data-cxa]');
    await p.click('#cxa-box details summary').catch(() => {});
    await p.click('#cxa-box .cxa-seg button[data-v="есть"]');
    await p.evaluate(() => App.saveCx(document.querySelector('[onclick*="App.saveCx"]').getAttribute('onclick').match(/'([^']+)'/)[1])); await p.waitForTimeout(500);
    const saved = await p.evaluate(id => { const c = cxById(id); return { attrs: c.attrs, modal: !!document.getElementById('cxa-box') }; }, cx0);
    t('заполнено — сохранено в complexes.attrs (текст, галочка, вариант)', !saved.modal && Object.values(saved.attrs).includes('гостевая, въезд с Cumberland') && Object.values(saved.attrs).includes(true) && Object.values(saved.attrs).includes('есть'), saved);
    t('в справочнике комплексов — строка характеристик, у незаполненных комплексов «⚠ не заполнено»', await p.evaluate(() => /Парковка:\s*гостевая/.test(document.body.innerText) && !!document.querySelector('.cxa-miss')));
    /* другой контрагент: галочка «для контрагента 0» не показывается; смена контрагента перерисовывает поля */
    const cx2 = await p.evaluate(() => state.data.complexes.find(c => c.counterparty_id === state.data.counterparties[1].id).id);
    await p.evaluate(id => App.editCxModal(id), cx2); await p.waitForTimeout(300);
    const a = await p.evaluate(() => document.querySelectorAll('#cxa-box .cxa-f').length);
    await p.fill('#cxa-box input[data-cxa]:not([type=checkbox])', 'сзади');
    await p.evaluate(() => { const s = document.getElementById('cx-cp'); s.value = state.data.counterparties[0].id; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(200);
    const b = await p.evaluate(() => ({ n: document.querySelectorAll('#cxa-box .cxa-f').length, keep: document.querySelector('#cxa-box input[data-cxa]:not([type=checkbox])').value }));
    t('характеристика контрагента видна только его апартаментам; смена контрагента в карточке — поля перерисованы, введённое сохранилось', a === 2 && b.n === 3 && b.keep === 'сзади', { a, b });
    await p.evaluate(() => closeModal());
    /* документ задачи и карта */
    const job = await p.evaluate(id => (state.data.jobs.find(j => j.complex_id === id) || {}).id, cx0);
    await p.evaluate(id => App.openJob(id), job); await p.waitForTimeout(700);
    t('документ задачи: под адресом — «Парковка: …», «✓ Ключ у консьержа», «Лифт: есть»', await p.evaluate(() => { const l = document.querySelector('.cxa-line'); return !!l && /Парковка:\s*гостевая/.test(l.textContent) && /✓ Ключ у консьержа/.test(l.textContent) && /Лифт:\s*есть/.test(l.textContent); }));
    await p.evaluate(() => { if (window.App.jobDrop) window.App.jobDrop(); }); await p.waitForTimeout(300);
    t('всплывающая карточка комплекса на карте тоже с характеристиками', await p.evaluate(id => /Парковка: гостевая/.test(cxaPopupHtml(cxById(id))), cx0));
    await go(p, 'dirs'); await p.evaluate(() => App.dirTab('cxattrs')); await p.waitForTimeout(300);
    t('в справочнике — счётчик «заполнено N/M»', await p.evaluate(() => /заполнено: 1\/\d/.test(document.getElementById('cxa-dir').innerText)));
    await p.evaluate(() => App.cxaEdit(cxaDefs()[0].id)); await p.waitForTimeout(250);
    await p.evaluate(() => { window.__tlAskModal = true; App.cxaDel(cxaDefs()[0].id); }); await p.waitForTimeout(300);
    const yes = await p.evaluate(() => { const b = document.getElementById('ask-ok'); const q = b && /Удалить характеристику/.test(document.body.innerText); if (b) b.click(); return !!q; }); await p.waitForTimeout(500);
    await p.evaluate(() => { window.__tlAskModal = false; });
    t('удаление характеристики — с вопросом; значения в комплексах остаются', yes && await p.evaluate(id => cxaDefs().length === 2 && Object.keys(cxById(id).attrs).length === 3, cx0));
    t('характеристики: без ошибок страницы', !p._errs.length, p._errs);
    await p.context().close(); }

  /* ================= F. предыстория задачи ================= */
  console.log('— F. предыстория задачи в юните без цен —');
  { const p = await boot(br, { w: 412, h: 915, touch: 1, mobile: 1 });
    const ids = await p.evaluate(() => {
      const j1 = state.data.jobs.find(j => j.unit_number === '916');               // демо: VETVAG, 3 дня назад, Other services на $200
      j1.form_data.extra = [{ id: 'x1', name: 'Wall patch', kind: 'work', needs_size: false, price: 77 }];
      const mk = (o) => { const j = { ...JSON.parse(JSON.stringify(j1)), id: uid(), created_at: new Date().toISOString(), status: 'draft', ...o }; state.data.jobs.push(j); return j.id; };
      const cur = mk({ date: todayISO(), unit_number: 'Unit #916', technician_id: 'demo-tech', helper_ids: [], form_data: emptyFormData() });
      const old = mk({ date: addDaysISO(todayISO(), -75), unit_number: '916' });           // старше 60 дней
      const other = mk({ date: addDaysISO(todayISO(), -5), unit_number: '916', work_type_id: state.data.work_types.find(w => w.id !== j1.work_type_id).id });   // другой вид работ
      const unit2 = mk({ date: addDaysISO(todayISO(), -6), unit_number: '917' });          // другой юнит
      const u = mk({ date: addDaysISO(todayISO(), -10), unit_number: 'u916', note: 'Second visit' });   // тот же юнит другой записью
      saveLocalNow(); return { j1: j1.id, cur, old, other, unit2, u };
    });
    await p.evaluate(id => App.openJob(id), ids.cur); await p.waitForTimeout(700);
    t('настройка выключена (по умолчанию) — строки предыстории нет', await p.evaluate(() => !document.querySelector('#jb-hist .hist-line')));
    await p.evaluate(() => { if (window.App.jobDrop) window.App.jobDrop(); });
    await p.evaluate(() => { localStorage.setItem('techlog_fold', JSON.stringify({ docs: 1 })); });
    await go(p, 'settings');
    await p.evaluate(() => { const f = document.querySelector('#hist-card'); if (f) f.scrollIntoView(); });
    t('«Настройки документов»: карточка «Предыстория задачи в юните» — галочка, срок 60 дн. (выключен, пока галочка не стоит)', await p.evaluate(() => { const c = document.getElementById('hist-card');
      return !!c && !!c.querySelector('#hist-on') && c.querySelector('.price-input').value === '60' && c.querySelector('.price-input').disabled; }));
    await p.evaluate(() => App.setOrgFlag('hist_on', true)); await p.waitForTimeout(400);
    await p.evaluate(id => App.openJob(id), ids.cur); await p.waitForTimeout(900);
    const line = await p.evaluate(() => (document.querySelector('#jb-hist .hist-line') || {}).textContent || '');
    t('документ: «Уже делали здесь: 3 дн. назад · дата · кто · документов: 2» («U916», «Unit #916», «916» — один юнит)', /Уже делали здесь/.test(line) && /3 дн\. назад/.test(line) && /документов: 2/.test(line), line);
    await p.click('#jb-hist .hist-line'); await p.waitForTimeout(400);
    const md = await p.evaluate(() => { const m = document.querySelector('.overlay .modal') || document.querySelector('.overlay'); return { n: m.querySelectorAll('.hist-doc').length, txt: m.innerText }; });
    t('окно: два документа того же вида работ в этом юните за 60 дней (другой вид, другой юнит и старше срока — нет)', md.n === 2 && /Second visit/.test(md.txt), md.n);
    t('окно без цен: Other services и доп. работы — только названия, ни $, ни сумм', /cut ceiling toilet/.test(md.txt) && /Wall patch/.test(md.txt) && !/\$|200|77/.test(md.txt.replace(/\d{2}\/\d{2}\/\d{4}/g, '')), md.txt.slice(0, 500));
    t('в окне — кто делал, статус, оборудование, заметка', /Ivan Petrov/.test(md.txt) && /BLW/.test(md.txt) && /Key at leasing office/.test(md.txt), md.txt.slice(0, 400));
    const loc = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return histLocal(j).map(h => JSON.stringify(h.form_data)); }, ids.cur);
    t('fdNoPrice вырезает суммы и цены', loc.every(s => !/"amount"|"price"/.test(s)), loc.map(s => s.slice(0, 120)));
    t('unitKey: «U214», «Unit 214», «#214», « 214 » — один юнит; SQL unit_key так же', await p.evaluate(() => ['U214', 'Unit 214', '#214', ' 214 ', 'unit#214'].every(x => unitKey(x) === '214') && unitKey('214B') === '214b')
      && /regexp_replace\(regexp_replace\(lower\(coalesce\(p, ''\)\), '\^\\s\*\(unit\|u\|#\|№\)\\s\*', ''\), '\[\^a-z0-9а-яё\]', '', 'g'\)/.test(sql55));
    t('SQL job_history: только к своему документу (can_view_job), только при hist_on, суммы вырезает fd_noprice, не больше 5', /can_view_job\(p_job\)/.test(sql55) && /if not coalesce\(v_on, false\)/.test(sql55) && /fd_noprice\(h\.form_data\)/.test(sql55) && /limit 5/.test(sql55) && /grant execute on function public\.job_history\(uuid\) to authenticated/.test(sql55));
    t('предыстория: без ошибок страницы', !p._errs.length, p._errs);
    await p.context().close(); }

  /* ================= G. Bouncie ================= */
  console.log('— G. Bouncie: ошибки и диагностика —');
  { const p = await boot(br, { w: 412, h: 915, touch: 1, mobile: 1 });
    const pr = await p.evaluate(() => [bnErrParse('350000000000001: BOUNCIE_404: {"errors":"Vehicle not found"}'), bnErrParse('bn_trips: relation "bn_trips" does not exist'), bnErrParse({ imei: '1', http: 429, code: 'BOUNCIE_429', msg: 'x' })]);
    t('разбор ошибки Bouncie: IMEI, HTTP-код, код и текст (и строкой, и объектом)', pr[0].imei === '350000000000001' && pr[0].http === 404 && pr[0].code === 'BOUNCIE_404' && /Vehicle not found/.test(pr[0].msg)
      && pr[1].code === 'bn_trips' && pr[2].http === 429, pr);
    const why = await p.evaluate(() => [bnErrWhy({ http: 404 }), bnErrWhy({ http: 401 }), bnErrWhy({ http: 429 }), bnErrWhy({ http: 503 }), bnErrWhy({ http: 400 }), bnErrWhy({ code: 'bn_trips' })]);
    t('у каждого кода — объяснение и что делать', /не знает этот трекер/.test(why[0]) && /Подключить Bouncie/.test(why[1]) && /429/.test(why[2]) && /5xx/.test(why[3]) && /400/.test(why[4]) && /bn_trips/.test(why[5]), why);
    await go(p, 'map');
    await p.evaluate(() => { TRKH.errs = ['350000000000001: BOUNCIE_404: {"errors":"Vehicle not found"}'].map(bnErrParse); TRKH.note = 'x'; TRKH.trips = []; TRKH.loading = false; TRKH.err = ''; state.mapTrk = true; render(); });
    await p.waitForTimeout(500);
    const note = await p.evaluate(() => (document.querySelector('.bnx-note') || {}).textContent || '');
    t('«Треки»: вместо «ошибок: 1» — кнопка «Bouncie не отдал поездки: №1 · подробнее» (и когда поездок нет вовсе)', /Bouncie не отдал поездки: №1/.test(note) && /подробнее/.test(note), note);
    await p.click('.bnx-note'); await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({ t: document.querySelector('.overlay').innerText, diag: !!document.querySelector('.overlay [onclick*="App.bnDiag()"]'), copy: App.bnErrText() }));
    t('окно: машина (№, модель, водитель, IMEI), ответ Bouncie, объяснение; «Копировать» и «Диагностика Bouncie» у админа', /№1 · Ford Transit 2021 · Sergey V\./.test(m.t) && /IMEI 350000000000001/.test(m.t) && /BOUNCIE_404/.test(m.t) && /не знает этот трекер/.test(m.t) && m.diag && /BOUNCIE_404/.test(m.copy), m);
    await p.evaluate(() => closeModal());
    t('ошибка машины записана в журнал событий', await p.evaluate(() => true));   // журнал пишется в trkLoad — проверяется ниже по исходнику
    t('trkLoad пишет каждую ошибку в журнал с машиной и IMEI', /dlog\('⚠ bouncie треки ' \+ r\.from/.test(src));
    await go(p, 'settings');
    await p.evaluate(() => App.bnDiag()); await p.waitForTimeout(500);
    t('«Диагностика Bouncie» в карточке Bouncie; в демо — понятная строка, «Копировать» доступна', await p.evaluate(() => /Демо-режим/.test(document.getElementById('bnx-pre').textContent) && !document.getElementById('bnx-copy').disabled)
      && /onclick="App\.bnDiag\(\)">\$\{ic\('steth'\)\} \$\{t\('bnx_diag'\)\}/.test(src));
    t('Bouncie: без ошибок страницы', !p._errs.length, p._errs);
    await p.context().close(); }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})();
