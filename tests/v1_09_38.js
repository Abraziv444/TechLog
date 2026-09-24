/* v1.09.38 — по замечаниям 22.09: пояс фирмы, рабочее время пушей, ТО и заметки, «Моя машина», машина из трекера,
   логотип, подгонка меню-колонки, два ряда после узкого окна, чат, прокрутка не прыгает, «Скрыть статистику связи»,
   значок пушей, без раздела 8. Демо-режим. Запуск: node tests/v1_09_38.js [порт]. Серверная часть — tests/v1_09_38.sql. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 600) : '')); } }
(async () => {
  const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  t('пуши: badge — одноцветный badge-96.png полным адресом, файл в кэше воркера', /TL_BADGE = new URL\('\.\/icons\/badge-96\.png', self\.registration\.scope\)/.test(sw) && sw.includes("badge: TL_BADGE") && sw.includes("'./icons/badge-96.png'") && fs.existsSync(ROOT + '/icons/badge-96.png'));
  const png = fs.readFileSync(ROOT + '/icons/badge-96.png');
  t('badge-96.png: PNG с альфа-каналом (RGBA)', png.slice(1, 4).toString() === 'PNG' && png[25] === 6);
  const idx = JSON.parse(fs.readFileSync(ROOT + '/dictionary/index.json', 'utf8'));
  t('раздел 8 «Материалы» убран из каталога и из сборки', idx.sections.length === 7 && !idx.sections.some(s => s.id === 8) && !fs.existsSync(ROOT + '/dictionary/books/section-8.html'));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const boot = async (who, vm) => { await p.evaluate(([w, v]) => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); localStorage.setItem('techlog_view_mode', v); }, [who, vm]);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(900); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.evaluate(() => localStorage.clear());
  await boot('demo-admin', 'desktop');

  /* логотип */
  /* v1.09.47: квадратик с иконкой из шапки убран по просьбе — название, версия и остальное на месте */
  const logo = await p.evaluate(() => ({ square: !!document.querySelector('.topbar .logo, .topbar .logo-wrap'), name: ((document.querySelector('.topbar .brand .name') || {}).textContent || '').trim() }));
  t('в шапке нет квадратика с иконкой, название программы на месте', !logo.square && /TechLog/.test(logo.name), logo);

  /* пояс */
  const tz = await p.evaluate(() => { const r = {}; r.def = appTZ(); r.today = todayISO() === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    state.data.org_settings.tz = 'Pacific/Honolulu'; r.hon = todayISO() === new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu' }).format(new Date());
    r.hm = fmtHM('2026-09-22T12:05:00Z'); r.day = tsISO('2026-09-23T03:30:00Z'); state.data.org_settings.tz = 'America/New_York'; r.hmNY = fmtHM('2026-09-22T12:05:00Z'); r.dayNY = tsISO('2026-09-23T03:30:00Z');
    r.bad = (state.data.org_settings.tz = 'Mars/Base', appTZ()); state.data.org_settings.tz = 'America/New_York'; return r; });
  t('пояс по умолчанию Нью-Йорк; «сегодня» — по поясу фирмы, не по телефону', tz.def === 'America/New_York' && tz.today && tz.hon, tz);
  t('время и дата метки — по поясу фирмы (12:05Z = 02:05 Гонолулу / 08:05 Нью-Йорк; 03:30Z 23-го = 22-е в Нью-Йорке)', tz.hm === '02:05' && tz.hmNY === '08:05' && tz.dayNY === '2026-09-22' && tz.day === '2026-09-22', tz);
  t('неверный пояс в настройках — берётся Нью-Йорк', tz.bad === 'America/New_York');
  await p.evaluate(() => { foldSet('misc', true); App.go('settings'); }); await p.waitForTimeout(400);
  const tzc = await p.evaluate(() => { const s = document.querySelector('#tz-card select'); return s ? { n: s.options.length, v: s.value } : null; });
  t('админ: «Часовой пояс фирмы» первой карточкой в «Прочих функциях», выбор из списка', tzc && tzc.n >= 7 && tzc.v === 'America/New_York', tzc);
  await p.evaluate(() => App.tzSet('America/Chicago')); await p.waitForTimeout(300);
  t('смена пояса сохраняется в настройках фирмы (и снимок остатков — в том же поясе)', await p.evaluate(() => state.data.org_settings.tz === 'America/Chicago' && appTZ() === 'America/Chicago'));
  await p.evaluate(() => App.tzSet('America/New_York'));

  /* рабочее время */
  await p.evaluate(() => { foldSet('push', true); render(); }); await p.waitForTimeout(300);
  t('Настройки → Push: карточка «Рабочее время для уведомлений», по умолчанию выключена', await p.evaluate(() => !!document.querySelector('#wk-card') && !document.querySelector('#wk-on').checked && document.querySelector('.wk-box').classList.contains('off')));
  await p.click('#wk-on'); await p.waitForTimeout(300);
  await p.fill('#wk-from', '09:00'); await p.dispatchEvent('#wk-from', 'change'); await p.waitForTimeout(250);
  await p.evaluate(() => App.wkDay(5)); await p.waitForTimeout(250);
  const wk = await p.evaluate(() => state.user.push_prefs.work);
  t('включение, начало 09:00, пятница снята — в профиле (push_prefs.work)', wk && wk.on === true && wk.from === '09:00' && wk.to === '18:00' && JSON.stringify(wk.days) === '[1,2,3,4]', wk);
  const wn = await p.evaluate(() => { const w = { on: true, days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }; const f = d => d ? isoOf(d) + ' ' + d.getHours() + ':' + d.getMinutes() : null;
    return { in: f(wkNext(w, '2026-09-22T14:00:00Z')), eve: f(wkNext(w, '2026-09-22T23:30:00Z')), fri: f(wkNext(w, '2026-09-25T22:00:00Z')), off: wkNext({ ...w, on: false }, '2026-09-22T23:30:00Z') }; });
  t('подсказка «когда придут» — та же математика, что в базе (вт 19:30 → ср 08:00, пт 18:00 → пн 08:00)', wn.in === null && wn.eve === '2026-09-23 8:0' && wn.fri === '2026-09-28 8:0' && wn.off === null, wn);
  await p.evaluate(() => { document.querySelector('#wk-to').value = '09:00'; App.wkSet({ to: '09:00' }); }); await p.waitForTimeout(250);
  t('начало = конец — отказ, настройка не испорчена', await p.evaluate(() => state.user.push_prefs.work.to === '18:00'));

  /* машина из трекера */
  await p.evaluate(async () => { await bnDevSync(false); const vs = bnVehicles(); const a = state.data.bn_devices;
    a.push({ id: uid(), imei: '350000000000901', vin: vs[0].vin, make: 'Ford', model: 'Transit', year: 2021, status: 'active', odometer: 1 });
    a.push({ id: uid(), imei: '350000000000902', vin: '1HGBH41JXMN109186', make: 'Honda', model: 'Odyssey', year: 2022, status: 'active', odometer: 12000 });
    App.go('dirs'); App.dirTab('trackers'); });
  await p.waitForTimeout(500);
  const trk = await p.evaluate(() => { const row = i => document.querySelector(`.trk-row[data-imei="${i}"] .trk-mk`); const a = row('350000000000901'), b = row('350000000000902');
    return { a: a && a.classList.contains('dis'), b: b && !b.classList.contains('dis'), linked: !document.querySelector('.trk-row[data-imei="350000000000001"] .trk-mk') }; });
  t('«Создать машину» у свободного трекера; у трекера с VIN существующей машины — блёклая; у привязанного — нет', trk.a && trk.b && trk.linked, trk);
  await p.click('.trk-row[data-imei="350000000000901"] .trk-mk', { force: true });   // aria-disabled: Playwright иначе не жмёт await p.waitForTimeout(300);
  const tip = await p.evaluate(() => [...document.querySelectorAll('#toasts > *')].map(x => x.textContent).join(' | '));
  t('нажатие на блёклую — поповер «машина с таким VIN уже есть: №…», окно не открылось', /уже есть: №1/.test(tip) && !(await p.evaluate(() => !!document.querySelector('#overlay'))), tip);
  await p.click('.trk-row[data-imei="350000000000902"] .trk-mk'); await p.waitForTimeout(300);
  const pre = await p.evaluate(() => ({ vin: $('#veh-vin').value, make: $('#veh-make').value, imei: $('#veh-imei').value, no: $('#veh-no').value }));
  t('свободный трекер → карточка новой машины: VIN, марка, трекер и свободный номер подставлены', pre.vin === '1HGBH41JXMN109186' && /Honda Odyssey 2022/.test(pre.make) && pre.imei === '350000000000902' && +pre.no === 4, pre);
  await p.evaluate(() => App.vehSave('')); await p.waitForTimeout(400);
  t('сохранено: машина с этим трекером, кнопка у трекера пропала', await p.evaluate(() => bnVehicles().some(v => v.imei === '350000000000902' && v.vin === '1HGBH41JXMN109186') && !document.querySelector('.trk-row[data-imei="350000000000902"] .trk-mk')));

  /* виды ТО и ТО машины */
  await p.evaluate(() => { state.dirTab = 'maint'; render(); }); await p.waitForTimeout(300);
  t('справочник «Виды ТО» у админа (в демо — два вида)', await p.evaluate(() => [...document.querySelectorAll('#dir-tabs .tabbtn')].some(b => b.textContent.trim() === 'Виды ТО') && document.querySelectorAll('.card .rowline').length === 2));
  await p.evaluate(() => App.mtModal()); await p.waitForTimeout(200);
  await p.fill('#mt-name', 'Тормозные колодки'); await p.fill('#mt-int', '20000'); await p.fill('#mt-rem', '1000');
  await p.evaluate(() => App.mtSave('')); await p.waitForTimeout(300);
  t('новый вид ТО добавлен', await p.evaluate(() => mtTypes().some(x => x.name === 'Тормозные колодки' && x.interval_mi === 20000 && x.remind_mi === 1000)));
  await p.evaluate(() => App.mtModal()); await p.fill('#mt-name', 'X'); await p.fill('#mt-int', '5'); await p.evaluate(() => App.mtSave('')); await p.waitForTimeout(200);
  t('интервал меньше 100 mi — отказ', await p.evaluate(() => !mtTypes(true).some(x => x.name === 'X')));
  await p.evaluate(() => closeModal());
  const vid = await p.evaluate(() => bnVehicles().find(v => v.driver_id === 'demo-tech').id);
  await p.evaluate(v => { const x = bnVehicles().find(y => y.id === v); x.last_odo = 45678; App.vehModal(v); }, vid); await p.waitForTimeout(300);
  const mt0 = await p.evaluate(() => ({ rows: document.querySelectorAll('.overlay .mt-row').length, oldSvc: !!document.querySelector('#veh-svc'), notes: !!document.querySelector('.overlay .vn-sec') }));
  t('карточка машины: раздел ТО со всеми видами, старого поля «ТО на пробеге» нет, есть заметки', mt0.rows === 3 && !mt0.oldSvc && mt0.notes, mt0);
  await p.evaluate(() => { const r = document.querySelector('.overlay .mt-row[data-t]:last-child'); r.querySelector('.mt-last').value = '30000'; r.querySelector('.mt-own-chk').click(); r.querySelector('.mt-own-mi').value = '16000'; });
  const ownVis = await p.evaluate(() => getComputedStyle(document.querySelector('.overlay .mt-row[data-t]:last-child .mt-ownw')).display !== 'none');
  t('галочка «Свой интервал» показывает поле интервала', ownVis);
  await p.evaluate(v => App.vehSave(v), vid); await p.waitForTimeout(400);
  const mt1 = await p.evaluate(v => { const ty = mtTypes().find(x => x.name === 'Тормозные колодки'); const r = vmRow(v, ty.id); const c = mtCalc(bnVehicles().find(x => x.id === v), ty, r); return { r, c }; }, vid);
  t('ТО записано: последнее 30000, свой интервал 16000 → следующее 46000, осталось 322 mi — «скоро»', mt1.r && +mt1.r.last_mi === 30000 && mt1.r.own_on && mt1.c.next === 46000 && mt1.c.left === 322 && mt1.c.st === 'soon', mt1);
  t('в списке «Автомобили» у машины строка ближайшего ТО', await p.evaluate(() => { state.dirTab = 'vehicles'; render(); return /🔧[^<]*(осталось|просрочено)/.test(document.querySelector('#app').innerHTML); }));

  /* заметки и «Моя машина»: водитель */
  await boot('demo-tech', 'mobile');
  await p.evaluate(() => { foldSet('mycar', true); App.go('settings'); }); await p.waitForTimeout(400);
  const mc = await p.evaluate(() => ({ card: !!document.querySelector('#mc-card'), ro: !document.querySelector('#mc-card input:not([type=checkbox]), #mc-card select'), menuOff: !document.querySelector('#mc-menu').checked,
    mt: document.querySelectorAll('.mc-mt').length, nav: !!document.querySelector('#set-nav .set-nav-b[data-k="mycar"]'), tab: !!document.querySelector('.tabbar [onclick="App.go(\'mycar\')"]') }));
  t('водитель: «Моя машина» в Настройках — данные только для чтения, ТО машины; пункта меню по умолчанию нет', mc.card && mc.ro && mc.menuOff && mc.mt === 3 && mc.nav && !mc.tab, mc);
  await p.fill('#vn-in', 'Стук в передней подвеске'); await p.evaluate(v => App.vnAdd(v), vid); await p.waitForTimeout(400);
  t('водитель добавил заметку по своей машине (с пробегом)', await p.evaluate(() => vnAll().some(n => n.author_id === 'demo-tech' && n.body === 'Стук в передней подвеске' && n.odo != null)));
  await p.click('#mc-menu'); await p.waitForTimeout(400);
  t('галочка «Показывать в меню» — пункт «Моя машина» появился, экран открывается', await p.evaluate(async () => { const b = document.querySelector('.tabbar [onclick="App.go(\'mycar\')"]'); if (!b) return false; b.click(); await new Promise(r => setTimeout(r, 300));
    return state.screen === 'mycar' && !!document.querySelector('#mc-card'); }));
  await p.evaluate(() => { vnAll().push({ id: 'n-other', vehicle_id: bnVehicles().find(v => v.driver_id === 'demo-tech').id, author_id: 'demo-manager', body: 'Менеджер: проверить шины', created_at: new Date().toISOString() }); saveLocalNow(); render(); });
  t('сотрудник видит только свои заметки', await p.evaluate(() => { const h = document.querySelector('#app').innerHTML; return h.includes('Стук в передней подвеске') && !h.includes('проверить шины'); }));
  t('добавить заметку к чужой машине сотрудник не может', await p.evaluate(async () => { const other = bnVehicles().find(v => v.driver_id === 'demo-manager'); const n = vnAll().length; await vnAdd(other.id); return vnAll().length === n && !vnCanAdd(other); }));
  await boot('demo-manager', 'mobile');
  await p.evaluate(v => { state.mcSel = v; App.go('mycar'); }, vid); await p.waitForTimeout(400);
  t('менеджер: выбор любой машины и все заметки по ней с авторами', await p.evaluate(() => { const h = document.querySelector('#app').innerHTML; return !!document.querySelector('#mc-sel') && h.includes('Стук в передней подвеске') && h.includes('проверить шины') && h.includes('Sergey V.'); }));

  /* «Скрыть статистику связи» */
  await p.evaluate(() => App.netHideSet(true)); await p.waitForTimeout(300);
  const nh = await p.evaluate(() => { const b = document.querySelector('.topbar .net-pill'); return b ? { hidden: b.hidden, disp: getComputedStyle(b).display, st: netState() } : null; });
  t('«Скрыть статистику связи» при нормальной связи действительно прячет бейдж', nh && (nh.st !== 'on' || (nh.hidden && nh.disp === 'none')), nh);
  await p.evaluate(() => App.netHideSet(false));

  /* прокрутка не прыгает: главная с ленты дней ниже экрана, справочник сотрудников */
  await boot('demo-admin', 'mobile');
  const sc = await p.evaluate(async () => { const host = document.getElementById('app'); const H = () => (host.scrollHeight > host.clientHeight + 5 ? host.scrollTop : window.scrollY);
    const go = y => { if (host.scrollHeight > host.clientHeight + 5) host.scrollTop = y; else window.scrollTo(0, y); };
    const stl = document.createElement('style'); stl.textContent = '#app::after{content:"";display:block;height:2400px}'; document.head.appendChild(stl); const pad = document.createElement('i');   /* длинная страница и после перерисовки */
    const r = {}; App.go('home'); await new Promise(x => setTimeout(x, 200)); document.querySelector('#app').appendChild(pad); go(900); await new Promise(x => setTimeout(x, 100)); const y0 = H(); render(); document.querySelector('#app').appendChild(pad); await new Promise(x => setTimeout(x, 150)); r.home = [y0, H()];
    state.dirTab = 'staff'; App.go('dirs'); await new Promise(x => setTimeout(x, 200)); document.querySelector('#app').appendChild(pad); go(700); await new Promise(x => setTimeout(x, 100)); const y1 = H();
    await setRole('demo-tech', 'manager'); document.querySelector('#app').appendChild(pad); await new Promise(x => setTimeout(x, 200)); r.dirs = [y1, H()]; await setRole('demo-tech', 'tech'); return r; });
  t('перерисовка главной не уводит экран наверх (раньше scrollIntoView ленты дней)', sc.home[0] > 300 && Math.abs(sc.home[1] - sc.home[0]) < 5, sc.home);
  t('смена роли в справочнике не уводит экран наверх', sc.dirs[0] > 300 && Math.abs(sc.dirs[1] - sc.dirs[0]) < 5, sc.dirs);

  /* учёба: 7 разделов */
  t('учёба: 7 чипов разделов, «Материалы» нет', await p.evaluate(async () => { state.data.org_settings.study_on = true; App.go('study'); await new Promise(r => setTimeout(r, 900));
    const c = [...document.querySelectorAll('.st-chips .st-chip, .st-chips button')].map(b => b.textContent.trim()); return c.length === 7 && !c.some(x => /Материалы/.test(x)); }));

  /* чат: открытая переписка на телефоне без заголовка раздела; кнопки шапки у правого края */
  await p.evaluate(() => { App.go('chat'); App.chOpen('all'); }); await p.waitForTimeout(400);
  const ch = await p.evaluate(() => { const st = document.querySelector('#app > .section-title'); const head = document.querySelector('.ch-head'), bell = document.querySelector('#ch-mute');
    return { title: st ? getComputedStyle(st).display : 'none', right: head && bell ? Math.round(head.getBoundingClientRect().right - bell.getBoundingClientRect().right) : -1 }; });
  t('чат на телефоне: заголовок «Сообщения» спрятан, колокольчик у правого края шапки', ch.title === 'none' && ch.right >= 0 && ch.right < 20, ch);
  await p.setViewportSize({ width: 1400, height: 900 }); await boot('demo-admin', 'desktop');
  await p.evaluate(() => { App.go('chat'); App.chOpen('all'); }); await p.waitForTimeout(400);
  const ch2 = await p.evaluate(() => { const head = document.querySelector('.ch-head'), bell = document.querySelector('#ch-mute'); return Math.round(head.getBoundingClientRect().right - bell.getBoundingClientRect().right); });
  t('чат на ПК: колокольчик у правого края шапки переписки (был сразу за названием)', ch2 >= 0 && ch2 < 20, ch2);

  /* меню-колонка */
  const fit = async (h) => { await p.setViewportSize({ width: 1400, height: h }); await p.waitForTimeout(400); await p.evaluate(() => render()); await p.waitForTimeout(200);
    return p.evaluate(() => { const b = document.querySelector('.tabbar'); const sp = b.querySelector('.tab span'); return { tbf: b.classList.contains('tbf'), nolab: b.classList.contains('tbf-nolab'), scroll: b.classList.contains('tbf-scroll'),
      fits: b.scrollHeight <= b.clientHeight + 1, lab: sp ? getComputedStyle(sp).display : '', ic: Math.round(b.querySelector('.tab svg').getBoundingClientRect().height) }; }); };
  const fHi = await fit(1400), f900 = await fit(960), f560 = await fit(620), f380 = await fit(380);
  t('высокое окно — меню как было', !fHi.tbf && fHi.fits, fHi);
  t('пониже — ужато до 80 %, подписи на месте, всё влезает', f900.fits && !f900.scroll && f900.tbf && !f900.nolab && f900.lab !== 'none', f900);
  t('ещё ниже — без подписей, значки не меньше 16 px, влезает без прокрутки', f560.fits && !f560.scroll && f560.nolab && f560.ic >= 16, f560);
  t('совсем низко — смысла ужимать нет: прокрутка, значки 16 px', f380.scroll && f380.ic >= 16 && f380.nolab, f380);
  await p.evaluate(() => menuLabelsSet('on')); await p.waitForTimeout(300);
  const fOn = await fit(620);
  t('подписи «Показать» выбраны вручную — их не прячем, ужимаем значки', !fOn.nolab && fOn.lab !== 'none', fOn);
  await p.evaluate(() => menuLabelsSet('auto'));

  /* два ряда после узкого окна */
  await p.setViewportSize({ width: 460, height: 900 }); await p.waitForTimeout(500);
  const narrow = await p.evaluate(() => document.querySelector('.tabbar').classList.contains('tb-multi'));
  await p.setViewportSize({ width: 1400, height: 900 }); await p.waitForTimeout(600);
  const wide = await p.evaluate(() => { const b = document.querySelector('.tabbar'); return { multi: b.classList.contains('tb-multi'), wrap: getComputedStyle(b).flexWrap, dir: getComputedStyle(b).flexDirection }; });
  t('узкое окно — меню внизу в два ряда; снова широкое — колонка слева без рядов', narrow && !wide.multi && wide.dir === 'column' && wide.wrap === 'nowrap', { narrow, wide });

  /* инвойс на Диске: решение по смене статуса */
  const plan = await p.evaluate(() => { const P = (a, b, act, drv) => invDrvPlan(a, b, act, drv);
    return [P({ status: 'draft' }, { status: 'done', total: 100 }, false, null), P({ status: 'draft' }, { status: 'done', total: 100 }, true, null),
      P({ status: 'done' }, { status: 'draft' }, true, null), P({ status: 'approved', approved_total: 100 }, { status: 'draft' }, true, null),
      P({ status: 'done' }, { status: 'approved', approved_total: 120, total: 120 }, true, { total: 100 }), P({ status: 'done' }, { status: 'approved', approved_total: 100, total: 100 }, true, { total: 100 }),
      P({ status: 'draft' }, { status: 'approved', approved_total: 90, total: 90 }, false, null), P({ status: 'draft' }, { status: 'draft' }, true, null), P({ status: 'done' }, { status: 'done' }, true, null)]; });
  t('Диск: передан на апрув → PDF на Диск (если его там нет); в черновик → в архив; апрув с другой суммой → замена; сумма та же — ничего', JSON.stringify(plan) === JSON.stringify(['upload', null, 'archive', 'archive', 'replace', null, 'upload', null, null]), plan);
  const src = fs.readFileSync(ROOT + '/supabase/functions/media-delete/index.ts', 'utf8');
  t('media-delete: режим inv_archive — в «Архив TechLog / Invoices / ГГГГ-ММ», право админ/менеджер/исполнитель, строки media с archived_at',
    src.includes('mode === "inv_archive"') && src.includes('monthFolder(t, await monthFolder(t, await monthFolder(t, cfg.gd_folder_id, ARCHIVE_DIR), INVOICES_DIR), ym)') && src.includes('.is("archived_at", null)') && src.indexOf('const s = svc();') < src.indexOf('if (repair_id)'));

  /* этапы водителя: ТВ (проверка на своём экране) и доска */
  await p.evaluate(() => { state.data.org_settings.office_lat = 33.95; state.data.org_settings.office_lng = -84.30; state.data.org_settings.office_addr = 'Office'; saveLocalNow(); });
  await p.evaluate(() => { foldSet('tvc', true); App.go('settings'); }); await p.waitForTimeout(300);
  t('офис — в «Режиме телевизора» у админа: адрес, «Найти», координаты', await p.evaluate(() => !!document.querySelector('#office-card #office-in') && /33\.95000, -84\.30000/.test(document.querySelector('#office-st').textContent)));
  await p.evaluate(() => tvTest()); await p.waitForTimeout(900);
  const stg = await p.evaluate(async () => {
    const who = tvWorkersAll().find(w => tvStops(w.id).some(s => s.cx && s.cx.lat != null)); if (!who) return { none: true };
    const s0 = tvStops(who.id).find(s => s.cx && s.cx.lat != null);
    TV.bn = (TV.bn || []).filter(c => c.driver_id !== who.id).concat({ car_no: who.car_no, driver_id: who.id, run: false, lat: +s0.cx.lat, lng: +s0.cx.lng, heading: 0 });
    tvRepaint(); await new Promise(r => setTimeout(r, 300));
    const st1 = tvStops(who.id).find(s => s.cxId === s0.cxId).st;
    const card = document.querySelector('.twg-route .tvr-s.stg-here'), pin = document.querySelector('#tv-map .tvpin.stg-here');
    TV.bn = TV.bn.map(c => c.driver_id === who.id ? { ...c, lat: c.lat + 0.08, run: true } : c);
    TV.feed.site_day = (TV.feed.site_day || []).concat({ driver_id: who.id, complex_id: s0.cxId, arrived_at: new Date().toISOString(), left_at: new Date().toISOString() });
    tvRepaint(); await new Promise(r => setTimeout(r, 200));
    const st3 = tvStops(who.id).find(s => s.cxId === s0.cxId).st, faded = !!document.querySelector('.twg-route .tvr-s.stg-done');
    TV.bn = TV.bn.map(c => c.driver_id === who.id ? { ...c, lat: +s0.cx.lat, lng: +s0.cx.lng, run: false } : c); const st4 = tvStops(who.id).find(s => s.cxId === s0.cxId).st;
    const layers = TV.routeLayer ? TV.routeLayer.getLayers().length : -1;
    return { st1, card: !!card, pin: !!pin, st3, faded, st4, layers, osrmTried: !!TV.osrm && Object.keys(TV.osrm).length > 0 }; });
  t('ТВ: машина стоит у точки — точка «на точке»: светится и на карте, и в карточке маршрута', stg.st1 === 'here' && stg.card && stg.pin, stg);
  t('ТВ: уехал (был визит) — точка блёклая; вернулся — снова светится', stg.st3 === 'done' && stg.faded && stg.st4 === 'here', stg);
  t('ТВ: маршрут офис → точки (сервер маршрутов недоступен — прямые линии) и значок офиса', stg.layers >= 2 && stg.osrmTried, stg);
  await p.evaluate(() => tvTestStop()); await p.waitForTimeout(300);
  await boot('demo-manager', 'desktop');
  const brd = await p.evaluate(async () => { const j = state.data.jobs.find(x => x.date === todayISO() && x.technician_id && cxById(x.complex_id) && cxById(x.complex_id).lat != null && !x.archived_at && x.status !== 'done' && x.status !== 'approved');
    if (!j) return { none: true }; const cx = cxById(j.complex_id);
    BN.live[j.technician_id] = { pos: { lat: +cx.lat, lng: +cx.lng }, run: false };
    App.go('board'); await new Promise(r => setTimeout(r, 400));
    const here = document.querySelectorAll('.bjob.stg-here').length;
    BN.live[j.technician_id] = { pos: { lat: +cx.lat + 0.1, lng: +cx.lng }, run: true };
    state.data.site_visits.push({ id: 'v-x', driver_id: j.technician_id, complex_id: j.complex_id, arrived_at: new Date().toISOString(), left_at: new Date().toISOString(), date: todayISO() });
    render(); await new Promise(r => setTimeout(r, 300));
    return { here, done: document.querySelectorAll('.bjob.stg-done').length }; });
  t('доска менеджера: задача, у которой стоит машина, светится; после отъезда — блёклая', brd.here >= 1 && brd.done >= 1, brd);

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
