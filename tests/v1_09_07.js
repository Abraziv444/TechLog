/* v1.09.07 — пачка по замечаниям:
     1) петля наблюдателя в desktop.js (авто-уплотнение доски) и моргание предпросмотра PDF:
        в простое — 0 мутаций class на <html> и 0 пересборок бланка, одна правка — одна пересборка;
     2) крестики очистки у «Контрагент» / «Апарт-комплекс» / «Юнит №», стёртый руками текст
        сбрасывает скрытый id, недописанный текст возвращается к выбранному значению;
     3) «Менеджер видит сессии»: свой тултип, вкладка «Сотрудники» у менеджера только для чтения;
     4) «Резкость как у родной камеры» ставит Способ 2 + «Оригинал», дальше — отметка вместо кнопки;
     5) степпер номера машины, кружок 48 px в «Автомобилях», «?» по центру заголовка;
     6) учёба: нет надписи под учебником, время видит только админ;
     7) заметка на карточке — одна строка (обычная и компактная плотность, телефон и ПК),
        в окне пикапов — не больше двух.
   jsPDF для предпросмотра: JSPDF_UMD=/path/jspdf.umd.min.js (по умолчанию
   /tmp/vmtest/node_modules/jspdf/dist/jspdf.umd.min.js — npm i jspdf@2.5.1 в /tmp/vmtest);
   без файла блок предпросмотра пропускается, остальное проверяется.
   Запуск: node tests/v1_09_07.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const PORT = process.argv[2] || 8907;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UMD = process.env.JSPDF_UMD || '/tmp/vmtest/node_modules/jspdf/dist/jspdf.umd.min.js';
const jspdfUmd = fs.existsSync(UMD) ? fs.readFileSync(UMD, 'utf8') : null;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
const LONG = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque eleifend, nisi vel sodales euismod, lectus sem malesuada lacus. '.repeat(8);

async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    if (jspdfUmd && /jspdf/.test(r.request().url())) return r.fulfill({ contentType: 'application/javascript', body: jspdfUmd });
    return r.abort();
  });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.evaluate(([who, mode]) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('techlog_session_v1', who); localStorage.setItem('techlog_view_mode', mode); }, [o.who || 'demo-admin', o.mode || 'mobile']);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 });
  await p.waitForTimeout(800);
  if (o.seed){
    await p.waitForTimeout(1700);                       // saveLocal() — с задержкой
    await p.evaluate(o.seed, o.seedArg);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 });
    await p.waitForTimeout(800);
  }
  return p;
}
const heights = (p, sel) => p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().height)), sel);

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* ---------- 1. петля наблюдателя и предпросмотр ---------- */
  console.log('1. Петля в desktop.js и живой предпросмотр PDF');
  let p = await boot(br, { w: 2000, h: 1200, mode: 'desktop' });
  await p.evaluate(() => { window.__n = 0; new MutationObserver(ms => { window.__n += ms.length; }).observe(document.documentElement, { attributes: true }); });
  await p.waitForTimeout(2500);
  t('главная (ПК): за 2,5 с простоя атрибуты <html> не трогаются', await p.evaluate(() => window.__n) === 0, await p.evaluate(() => window.__n));
  if (jspdfUmd){
    const id = await p.evaluate(() => state.data.jobs[0].id);
    await p.evaluate(id => App.openJob(id), id); await p.waitForTimeout(3500);
    t('сплит предпросмотра включился', await p.evaluate(() => document.documentElement.classList.contains('tl-pdfprev') && document.querySelectorAll('iframe.dpp-f').length === 2));
    t('бланк показан', await p.evaluate(() => [...document.querySelectorAll('iframe.dpp-f')].filter(f => f.src && !f.classList.contains('hid')).length === 1));
    await p.evaluate(() => { window.__src = 0; window.__n = 0;
      document.querySelectorAll('iframe.dpp-f').forEach(f => new MutationObserver(ms => ms.forEach(m => { if (m.attributeName === 'src') window.__src++; })).observe(f, { attributes: true })); });
    await p.waitForTimeout(6000);
    t('простой 6 с: бланк не пересобирается', await p.evaluate(() => window.__src) === 0, await p.evaluate(() => window.__src));
    t('простой 6 с: <html> не трогается', await p.evaluate(() => window.__n) === 0, await p.evaluate(() => window.__n));
    await p.click('[data-s="steam"][data-k="deep_scrub"]'); await p.waitForTimeout(3000);
    t('одна галочка — одна пересборка', await p.evaluate(() => window.__src) === 1, await p.evaluate(() => window.__src));
    await p.fill('#jb-note', 'preview check'); await p.waitForTimeout(3000);
    t('правка заметки — ещё одна пересборка', await p.evaluate(() => window.__src) === 2, await p.evaluate(() => window.__src));
    t('App.pdfPreviewKey меняется вместе с данными', await p.evaluate(() => { const a = App.pdfPreviewKey(); jobDraft.unit_number = 'ZZ9'; const b = App.pdfPreviewKey(); return !!a && a !== b; }));
  } else console.log('  · jsPDF не найден (' + UMD + ') — блок предпросмотра пропущен');
  await p.context().close();

  /* авто-уплотнение доски по-прежнему работает и тоже молчит в простое */
  p = await boot(br, { w: 1100, h: 1000, mode: 'desktop', seed: () => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1')); const base = d.profiles.find(x => x.role === 'tech');
    for (let i = 0; i < 8; i++){ const c = JSON.parse(JSON.stringify(base)); c.id = 'tu' + i; c.login = 'tu' + i; c.display_name = 'TestUser' + i; c.car_no = null; d.profiles.push(c); }
    localStorage.setItem('techlog_state_v1', JSON.stringify(d)); } });
  await p.evaluate(() => App.go('board')); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__n = 0; new MutationObserver(ms => { window.__n += ms.length; }).observe(document.documentElement, { attributes: true }); });
  await p.waitForTimeout(2000);
  t('доска на 11 колонок: tl-fit включён, ширина задана', await p.evaluate(() => document.documentElement.classList.contains('tl-fit') && /px$/.test(document.documentElement.style.getPropertyValue('--dsk-fit'))));
  t('доска: в простое <html> не трогается', await p.evaluate(() => window.__n) === 0, await p.evaluate(() => window.__n));
  await p.evaluate(() => App.go('home')); await p.waitForTimeout(800);
  t('уход с доски снимает tl-fit и переменную', await p.evaluate(() => !document.documentElement.classList.contains('tl-fit') && !document.documentElement.style.getPropertyValue('--dsk-fit')));
  await p.context().close();

  /* ---------- 2. крестики очистки ---------- */
  for (const mode of ['mobile', 'desktop']){
    console.log('2. Крестики очистки — ' + mode);
    p = await boot(br, mode === 'desktop' ? { w: 1400, h: 1000, mode } : { w: 412, h: 915, mode, touch: true });
    await p.evaluate(() => App.addTask ? App.addTask() : addTaskModal()); await p.waitForTimeout(400);
    const vis = () => p.evaluate(() => [...document.querySelectorAll('#overlay .inpx-x')].map(b => getComputedStyle(b).display !== 'none'));
    t('в форме три крестика, в пустой форме скрыты', JSON.stringify(await vis()) === '[false,false,false]', await vis());
    await p.evaluate(() => App.comboPick('cx', state.data.complexes[0].id)); await p.fill('#nt-unit', '12B'); await p.waitForTimeout(200);
    t('выбор комплекса подставил контрагента, все три крестика видны', JSON.stringify(await vis()) === '[true,true,true]', await vis());
    t('крестик лежит внутри поля и по центру', await p.evaluate(() => [...document.querySelectorAll('#overlay .inpx-x')].every(b => { const i = b.previousElementSibling.getBoundingClientRect(), r = b.getBoundingClientRect(); return r.left >= i.left && r.right <= i.right && Math.abs((r.top + r.height / 2) - (i.top + i.height / 2)) <= 1; })));
    await p.locator('#cb-cx .inpx-x').click(); await p.waitForTimeout(200);
    t('× у комплекса: комплекс пуст, контрагент остался', await p.evaluate(() => !!document.querySelector('#nt-cp').value && !document.querySelector('#nt-cx').value && !document.querySelector('#cb-cx .combo-in').value));
    t('после × список не выпрыгнул поверх формы', await p.evaluate(() => [...document.querySelectorAll('#overlay .combo-list')].every(l => l.style.display !== 'block')));
    await p.evaluate(() => App.comboPick('cx', state.data.complexes[0].id));
    await p.locator('#cb-cp .inpx-x').click(); await p.waitForTimeout(200);
    t('× у контрагента снимает и комплекс', await p.evaluate(() => !document.querySelector('#nt-cp').value && !document.querySelector('#nt-cx').value && !document.querySelector('#cb-cp .combo-in').value && !document.querySelector('#cb-cx .combo-in').value));
    await p.locator('#nt-unit + .inpx-x').click(); await p.waitForTimeout(150);
    t('× у юнита очищает поле', await p.evaluate(() => document.querySelector('#nt-unit').value === ''));
    await p.evaluate(() => { App.comboPick('cx', state.data.complexes[0].id); document.querySelector('#nt-wt .opt').click(); });
    await p.fill('#cb-cp .combo-in', ''); await p.waitForTimeout(200);
    t('контрагент стёрт руками → скрытые id сброшены', await p.evaluate(() => !document.querySelector('#nt-cp').value && !document.querySelector('#nt-cx').value));
    const n0 = await p.evaluate(() => state.data.jobs.length);
    await p.evaluate(() => App.createTask()); await p.waitForTimeout(500);
    t('«Создать» со стёртым контрагентом задачу не создаёт', await p.evaluate(n => state.data.jobs.length === n && !!document.querySelector('#overlay'), n0));
    await p.evaluate(() => App.comboPick('cx', state.data.complexes[0].id));
    const lbl = await p.evaluate(() => document.querySelector('#cb-cx .combo-in').value);
    await p.fill('#cb-cx .combo-in', lbl.slice(0, 3)); await p.locator('#overlay .modal').click({ position: { x: 5, y: 5 } }); await p.waitForTimeout(500);
    t('недописанный текст при уходе возвращается к выбранному', await p.evaluate(l => document.querySelector('#cb-cx .combo-in').value === l, lbl));
    await p.evaluate(() => App.closeModal());
    await p.context().close();
  }

  /* ---------- 3–5. настройки и справочники ---------- */
  for (const mode of ['desktop', 'mobile']){
    console.log('3–5. Настройки и справочники — ' + mode);
    p = await boot(br, mode === 'desktop' ? { w: 1400, h: 1000, mode } : { w: 412, h: 915, mode, touch: true });
    await p.evaluate(() => { App.go('dirs'); App.dirTab('staff'); }); await p.waitForTimeout(500);
    t('номер машины — степпер, а не input[type=number]', await p.evaluate(() => { const e = document.querySelector('.car-step'); return !!e && e.querySelectorAll('button').length === 2 && e.querySelector('input').type === 'text' && !document.querySelector('input.car-inp[type="number"]'); }));
    const uid = await p.evaluate(() => (state.data.profiles.find(x => x.car_no == null) || {}).id);
    if (uid){
      const free = await p.evaluate(u => { const used = new Set(state.data.profiles.filter(x => x.id !== u && x.car_no != null).map(x => +x.car_no)); let n = 1; while (used.has(n)) n++; return n; }, uid);
      await p.evaluate(u => App.carNoStep(u, 1), uid); await p.waitForTimeout(1100);
      t('«+» с пустого ставит первый свободный номер (' + free + ')', await p.evaluate(u => state.data.profiles.find(x => x.id === u).car_no, uid) === free);
      await p.evaluate(([u, n]) => { for (let i = 0; i < n; i++) App.carNoStep(u, -1); }, [uid, free]); await p.waitForTimeout(1100);
      t('«−» с единицы очищает номер', await p.evaluate(u => state.data.profiles.find(x => x.id === u).car_no, uid) == null);
    }
    await p.evaluate(() => App.staffCfg(state.data.profiles.find(x => x.role === 'manager').id)); await p.waitForTimeout(500);
    const dy = await p.evaluate(() => [...document.querySelectorAll('#overlay .tipq')].map(e => { const b = e.getBoundingClientRect(); let n = e.previousSibling; while (n && !(n.nodeType === 3 && n.textContent.trim())) n = n.previousSibling;
      if (!n) return 0; const r = document.createRange(); r.selectNodeContents(n); const tr = r.getClientRects()[0]; return Math.abs((b.top + b.height / 2) - (tr.top + tr.height / 2)); }));
    t('«?» в карточке сотрудника по центру заголовка (≤ 1,5 px)', dy.length >= 3 && dy.every(x => x <= 1.5), dy);
    await p.evaluate(() => App.closeModal());
    await p.evaluate(() => App.dirTab('vehicles')); await p.waitForTimeout(400);
    t('кружок номера в «Автомобилях» 48×48', await p.evaluate(() => { const e = document.querySelector('.carno-dot'); if (!e) return false; const b = e.getBoundingClientRect(); return Math.round(b.width) === 48 && Math.round(b.height) === 48; }));
    await p.evaluate(() => App.go('settings')); await p.waitForTimeout(400);
    await p.evaluate(() => { ['misc', 'cam'].forEach(k => { if (!foldOpen(k)) App.foldToggle(k); }); }); await p.waitForTimeout(500);
    t('у «Менеджер видит сессии» свой тултип', await p.evaluate(() => { const l = [...document.querySelectorAll('#feat-card .chk-line')].find(x => /сесси|session/i.test(x.textContent)); return !!l && /sess_mgr_tip/.test(l.querySelector('.tipq').getAttribute('onclick')); }));
    t('кнопка камеры — обычная (не зелёная заливка)', await p.evaluate(() => { const b = [...document.querySelectorAll('#app button')].find(x => /camNative/.test(x.getAttribute('onclick') || '')); return !!b && !b.classList.contains('btn-green'); }));
    await p.evaluate(() => App.camNative()); await p.waitForTimeout(600);
    t('нажатие ставит Способ 2 + «Оригинал»', await p.evaluate(() => camWay() === 'phone' && camQual() === 'orig' && camMode() === 'full'));
    t('дальше вместо кнопки — отметка «включено»', await p.evaluate(() => !!document.querySelector('.cam-native-on') && ![...document.querySelectorAll('#app button')].find(x => /camNative/.test(x.getAttribute('onclick') || ''))));
    await p.evaluate(() => App.camWay ? 0 : 0);
    await p.context().close();
  }
  console.log('3. Менеджер и вкладка «Сотрудники»');
  p = await boot(br, { w: 1400, h: 1000, mode: 'desktop', who: 'demo-manager' });
  await p.evaluate(() => App.go('dirs')); await p.waitForTimeout(400);
  t('галочка снята — вкладки «Сотрудники» у менеджера нет', await p.evaluate(() => ![...document.querySelectorAll('#dir-tabs .tabbtn')].some(b => /сотрудники/i.test(b.innerText))));
  await p.evaluate(() => { state.data.org_settings.sess_mgr = true; App.go('dirs'); App.dirTab('staff'); }); await p.waitForTimeout(400);
  t('галочка стоит — вкладка появилась', await p.evaluate(() => [...document.querySelectorAll('#dir-tabs .tabbtn')].some(b => /сотрудники/i.test(b.innerText)) && !!document.querySelector('.staff-row')));
  t('только чтение: нет степпера, роли-списка, пароля, блокировки и «Добавить»', await p.evaluate(() => { const a = document.querySelector('#app');
    return !a.querySelector('.car-step') && !a.querySelector('.staff-row select') && !a.querySelector('.key-btn') && !a.querySelector('.ban-btn') && ![...a.querySelectorAll('button')].some(b => /staffAddModal/.test(b.getAttribute('onclick') || '')); }));
  t('шестерёнка и роль-ярлык на месте', await p.evaluate(() => { const r = document.querySelector('.staff-row'); return !!r.querySelector('.icon-btn') && !!r.querySelector('.role-tag'); }));
  await p.context().close();

  /* ---------- 6. учёба ---------- */
  console.log('6. Учёба: время видит только админ');
  const studySeed = (who) => { const d = JSON.parse(localStorage.getItem('techlog_state_v1')); d.study_sessions = d.study_sessions || []; const now = new Date().toISOString();
    d.study_sessions.push({ id: 'ss1', user_id: who, section: 1, kind: 'test', mode: 'learn', total: 20, answered: 20, correct: 16, score_pct: 80, passed: true, duration_ms: 615000, started_at: now, finished_at: now, answers: [] });
    d.study_sessions.push({ id: 'ss2', user_id: who, section: 1, kind: 'read', duration_ms: 1230000, started_at: now, finished_at: now });
    localStorage.setItem('techlog_state_v1', JSON.stringify(d)); };
  for (const who of ['demo-tech', 'demo-admin']){
    p = await boot(br, { w: 412, h: 915, mode: 'mobile', touch: true, who, seed: studySeed, seedArg: who });
    await p.evaluate(() => App.go('study')); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => ({ kpi: [...document.querySelectorAll('#app .st-kpi span')].map(x => x.innerText.toLowerCase()), rows: [...document.querySelectorAll('#app .st-srow .tiny')].map(x => x.innerText) }));
    const timeKpi = r.kpi.filter(x => /время/.test(x)).length, readRows = r.rows.filter(x => /чтение/.test(x)).length, durRows = r.rows.filter(x => /10 мин/.test(x)).length;
    if (who === 'demo-tech'){
      t('сотрудник: плиток времени нет', timeKpi === 0, r.kpi);
      t('сотрудник: строк чтения и длительности нет, результат теста есть', readRows === 0 && durRows === 0 && r.rows.some(x => /16\/20/.test(x)), r.rows);
    } else {
      t('админ: плитки времени на месте', timeKpi >= 4, r.kpi);
      t('админ: строки чтения и длительность видны', readRows >= 1 && durRows >= 1, r.rows);
    }
    await p.context().close();
  }
  t('надписи под учебником в коде экрана больше нет', !/st_read_hint'\)\}<\/div>\s*<\/div>`;/.test(fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8')));

  /* ---------- 7. заметка на карточках ---------- */
  console.log('7. Длинная заметка не раздувает карточку');
  const cardSeed = ([LONG, dens]) => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
    const dt = new Date(), tISO = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const pend = d.placements.filter(x => !x.picked_up); pend.forEach(x => { x.pickup_date = tISO; x.due_date = tISO; });
    const j = d.jobs.find(x => x.id === pend[0].job_id); j.note = LONG; j.note_en = LONG;
    const j2 = JSON.parse(JSON.stringify(j)); j2.id = 'cmp-job'; j2.unit_number = '111'; j2.note = 'short'; j2.note_en = 'short'; d.jobs.push(j2);
    pend.forEach((x, i) => { const c = JSON.parse(JSON.stringify(x)); c.id = 'cmp-pl' + i; c.job_id = 'cmp-job'; c.unit_number = '111'; d.placements.push(c); });
    const me = d.profiles.find(x => x.id === 'demo-admin'); me.push_prefs = Object.assign({}, me.push_prefs, { density: dens, density_pc: dens });
    localStorage.setItem('techlog_state_v1', JSON.stringify(d)); };
  for (const [mode, dens] of [['desktop', 'cozy'], ['desktop', 'compact'], ['mobile', 'cozy'], ['mobile', 'compact']]){
    p = await boot(br, Object.assign(mode === 'desktop' ? { w: 1600, h: 1200, mode } : { w: 412, h: 915, mode, touch: true }, { seed: cardSeed, seedArg: [LONG, dens] }));
    const hs = await heights(p, '#app .item');
    t(`${mode}/${dens}: карточка с длинной заметкой той же высоты, что с короткой`, hs.length >= 2 && Math.max(...hs) - Math.min(...hs) <= 24 && Math.max(...hs) < 260, hs);
    await p.evaluate(() => App.pkDueModal()); await p.waitForTimeout(500);
    const ms = await heights(p, '#overlay .pkm-card');
    t(`${mode}/${dens}: окно пикапов — заметка не больше двух строк`, ms.length >= 2 && Math.max(...ms) < 260 && Math.max(...ms) - Math.min(...ms) <= 40, ms);
    await p.context().close();
  }

  await br.close();
  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
