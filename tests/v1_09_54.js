/* v1.09.54 — третий встроенный тест «Тест документооборота + ремонт + интерфейс» (Настройки → Диагностика). Прогон тот же, что у
   «Теста документооборота + ремонт» (все роли, статусы и цепочки ремонта, своя роль — кнопками), а по ходу — проверка интерфейса
   на каждом экране и в каждом окне, куда заходит тест (uidiag.js, UIDiag.quick): кнопки наезжают друг на друга, уходят за рамку
   экрана, вылезают из своего блока, перекрыты; блоки налезают, текст обрезан, элемент под шапкой или нижней панелью.
   После прогона — три отдельных лога: весь, критические ошибки и интерфейс.
   Здесь: карточка и её видимость, справка (RU/EN), запуск кнопкой на ПК («только ремонт») и на телефоне (весь тест), три лога
   (кнопки в панели и в карточке, имена и содержимое файлов), «Пошагово» + «Остановить», движок проверки на искусственном экране
   (ловит наезд, «за рамкой», вылет из блока, перекрытие, окно без прокрутки — и не ловит приёмы вёрстки: крестик в поле, карусель,
   выезжающее меню, открытый список, панель теста, липкое меню у конца страницы) и исправления вёрстки, найденные проверкой:
   шапка документа на телефоне, вид задачи под кодом доступа, табличка очереди на ПК, цепочка документов на телефоне, меню настроек.
   Запуск: node tests/v1_09_54.js [порт] (демо-копия, как в README; ~6 минут; T54_QUICK=1 — на телефоне «только ремонт»). */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8954;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const QUICK = !!process.env.T54_QUICK;
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 1200) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const src = rd('app.js'), ud = rd('uidiag.js'), css = rd('styles.css'), dcss = rd('desktop.css');
  console.log('— исходники —');
  const V = (src.match(/const APP_VERSION = '([\d.]+)';/) || [])[1] || '', vge = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return true; };
  t('версии: app = sw = version.json (не ниже 1.09.54); база в 1.09.54 не менялась — файл базы full-install-1_09_53.sql или новее', vge(V, '1.09.54') && rd('sw.js').includes(`VERSION = '${V}'`)
    && JSON.parse(rd('version.json')).version === V && /const DB_SQL_FILE = 'full-install-1_(09_(5[3-9]|[6-9]\d)|1\d_\d\d)\.sql';/.test(src), V);
  t('тест в приложении: режимы ui / ui_rep, третья карточка, отчёт «docflow_ui», проверка экрана после нажатия, ввода, галочки и в конце шага, лог «Интерфейс»',
    src.includes("const UI = mode === 'ui' || mode === 'ui_rep'") && src.includes("fold('dftu', t('dftu_card'), 'layers', dftuCardHtml(), true)") && src.includes("testPreflightGate('docflow_ui')")
    && src.includes("tlogStart('docflow_ui'") && src.includes("await dftUiProbe('∎')") && src.includes("await u0.click.call(U, sel, what); await dftUiProbe('☛');") && src.includes("await u0.type.call(U, sel, val, what); await dftUiProbe('⌨');")
    && src.includes("onclick=\"App.dftRun(DFT.uiRepOnly ? 'ui_rep' : 'ui')\"") && src.includes("+ '-interface.txt'") && src.includes('dftUiSave,') && src.includes("c && c.kind === 'docflow_ui' ? dftUiBtnsHtml(c) : ''"));
  t('uidiag.js: быстрый набор quick / quickJson; наезд, «за рамкой экрана», «вылезла из блока» — и в полной «Диагностике интерфейса»; панель теста прячется на время проверки',
    ud.includes('function quick(label)') && ud.includes('quickJson: function (label)') && ud.includes('function checkTouch()') && ud.includes('function checkOffscreen()') && ud.includes('function checkEscape()')
    && ud.includes('var sync = [checkCover, checkTouch, checkFlow, checkOverflow, checkOffscreen, checkEscape, checkClip,') && ud.includes("var QUIET = '#dft-panel,#toasts,#uidiag-fab';")
    && ud.includes('function stuck(n2, cs)') && ud.includes("var POPS = '#toasts,.mq-pop,.overlay,.modal,.combo-list,.tl-dd,#dsk-cal,#tl-tip-pop';"));
  t('исправления вёрстки в стилях: шапка документа ≤560px, вид задачи над кодом доступа, стрелки цепочки, табличка очереди на ПК, меню настроек под шапкой',
    css.includes('html:not(.tl-desktop) .docbar .db-back span, html:not(.tl-desktop) .docbar .db-save span{ display:none }') && css.includes('.wt-change{ position:relative }')
    && css.includes('.chain-arr{ transform:none; align-self:center; justify-content:center }') && css.includes('.chain-arr svg{ transform:rotate(90deg) }')
    && dcss.includes('html.tl-desktop #tl-net{ left:124px; bottom:16px; }') && dcss.includes('html.tl-desktop .set-nav{ z-index:30; }') && src.includes("t('status_' + (o.status || 'draft'))   // v1.09.54"));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const mkPage = async (vp, mobile) => {
    const ctx = await br.newContext({ viewport: vp, serviceWorkers: 'block', permissions: ['camera', 'microphone'], acceptDownloads: true, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 300)); }); p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); return p;
  };
  const boot = async (p, who, vm) => {
    await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
    await p.evaluate(([w, v]) => { localStorage.clear(); localStorage.setItem('techlog_session_v1', w); localStorage.setItem('techlog_view_mode', v); }, [who, vm]);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1000);
    await p.evaluate(() => { const ps = state.data.profiles; ps.push({ id: 'demo-tech2', login: 'oleg', display_name: 'Oleg Ivanov', role: 'tech', car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' },
      { id: 'demo-appr', login: 'maria', display_name: 'Maria Approver', role: 'manager', can_approve: true, car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' }); ps.find(x => x.id === 'demo-manager').can_approve = false; saveLocalNow(); });
  };
  const login = async (p, who) => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1000); };
  const openCard = async p => { await p.evaluate(() => { try{ App.closeModal(); }catch(e){} const pn = document.getElementById('dft-panel'); if (pn) pn.remove(); foldSet('dgs', true); foldSet('dftu', true); _foldForce = true; App.go('settings'); }); await p.waitForTimeout(600); };
  /* файл, который отдала кнопка: имя и текст */
  const grab = async (p, sel) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click(sel)]); const f = await dl.path(); return { name: dl.suggestedFilename(), txt: fs.readFileSync(f, 'utf8') }; };

  /* ---- карточка ---- */
  const p = await mkPage({ width: 1400, height: 900 });
  await boot(p, 'demo-tech', 'desktop');
  console.log('— карточка «Тест документооборота + ремонт + интерфейс» —');
  await openCard(p);
  t('режим выключен: работник третьей карточки не видит, запустить тест не может', await p.evaluate(async () => { const c = !document.getElementById('dftu-card'); await App.dftRun('ui'); await App.dftRun('ui_rep'); return c && !DFT.running && !document.getElementById('dft-panel'); }));
  await login(p, 'demo-admin'); await p.waitForTimeout(800); await openCard(p);
  const c0 = await p.evaluate(() => ({ card: !!document.getElementById('dftu-card'), off: !!document.getElementById('dftu-off'), run: !!document.getElementById('dftu-run'),
    ttl: ((document.querySelector('#dftu-card') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 500), three: ['fold-dft', 'fold-dftr', 'fold-dftu'].every(id => !!document.getElementById(id)) }));
  t('админ видит карточку и при выключенном режиме: плашка «режим выключен», кнопки запуска нет; рядом — обе прежние карточки теста', c0.card && c0.off && !c0.run && /наезжают друг на друга/.test(c0.ttl) && c0.three, c0);
  await p.evaluate(() => App.dftSetMode(true, 4)); await p.waitForTimeout(500); await openCard(p);
  const c1 = await p.evaluate(() => ({ run: !!document.getElementById('dftu-run'), only: !!document.getElementById('dftu-only'), worker: [...document.querySelectorAll('#dftu-worker option')].map(o => o.value),
    step: !!document.getElementById('dftu-stepmode'), media: !!document.getElementById('dftu-media'), wide: !!document.getElementById('dftu-wide'), off: !!document.getElementById('dftu-off'), nomod: !!document.getElementById('dftu-nomod'),
    logs: /три файла \.txt/.test((document.querySelector('#dftu-card') || {}).textContent || ''), btn: ((document.getElementById('dftu-run') || {}).textContent || '').trim() }));
  t('режим включён: выбор работника, «Только ремонт», «Пошагово», «Всем участникам», «Фото…», подсказка про три лога, кнопка «Запустить тест с проверкой интерфейса»',
    c1.run && c1.only && c1.worker.includes('demo-tech') && c1.worker.includes('demo-tech2') && c1.step && c1.media && c1.wide && !c1.off && !c1.nomod && c1.logs && /проверкой интерфейса/.test(c1.btn), c1);
  await p.evaluate(() => { const b = document.querySelector('#dftu-card .faq-i'); if (b) b.click(); }); await p.waitForTimeout(400);
  const hp = await p.evaluate(() => { const o = document.getElementById('overlay'); const tx = (o || {}).textContent || ''; const li = o ? o.querySelectorAll('li').length : 0; try{ App.closeModal(); }catch(e){} return { tx: tx.slice(0, 300), li }; });
  t('справка «?» карточки: что это, что ищет, когда проверяет, три лога, итог шагов (5 пунктов)', hp.li === 5 && /Тест документооборота \+ ремонт \+ интерфейс/.test(hp.tx), hp);
  const hen = await p.evaluate(() => { const l0 = state.lang; state.lang = 'en'; const h = sectionFaqHtml('dftu'); state.lang = l0;
    const ks = Object.keys(I18N.ru).filter(k => /^(dfu_|dftu_|tab_dftu$)/.test(k)), miss = ks.filter(k => !(k in I18N.en)), cyr = ks.filter(k => /[Ѐ-ӿ]/.test(I18N.en[k] || ''));
    return { cyr: /[Ѐ-ӿ]/.test(h), li: (h.match(/<li\b/g) || []).length, n: ks.length, miss, cyrK: cyr }; });
  t('по-английски: справка без кириллицы и пунктов поровну; все ключи теста интерфейса есть в обоих языках', !hen.cyr && hen.li === 5 && hen.n >= 35 && !hen.miss.length && !hen.cyrK.length, hen);
  const nm = await p.evaluate(async () => { const q = window.UIDiag.quick; delete window.UIDiag.quick; render(); await new Promise(r => setTimeout(r, 100)); const b = !!document.getElementById('dftu-nomod'); window.UIDiag.quick = q; render(); await new Promise(r => setTimeout(r, 100)); return { b, back: !document.getElementById('dftu-nomod') }; });
  t('модуль диагностики не загрузился — в карточке предупреждение (прогон идёт без проверки интерфейса)', nm.b && nm.back, nm);

  /* ---- прогоны ---- */
  const runUi = async (pg, who, worker, repOnly, ms) => {
    await login(pg, who); await pg.waitForTimeout(who === 'demo-admin' ? 1800 : 300); await openCard(pg);
    await pg.evaluate(() => { DFT.stepMode = false; DFT.uiRepOnly = false; trApi = async ru => 'EN: ' + String(ru).length; });   /* сеть в тесте закрыта — переводчик подменён */
    await pg.evaluate(() => { _foldForce = true; render(); }); await pg.waitForTimeout(300);
    if (worker) await pg.selectOption('#dftu-worker', worker);
    if (repOnly) await pg.click('#dftu-only');
    const before = await pg.evaluate(() => ({ jobs: state.data.jobs.length, pl: state.data.placements.length, pr: state.data.proposals.length, rep: (state.data.repairs || []).length, worker: DFT.worker, only: DFT.uiRepOnly }));
    const t0 = Date.now();
    await pg.click('#dftu-run');
    await pg.waitForFunction(() => !DFT.running && !!document.getElementById('dft-sum'), null, { timeout: ms, polling: 1000 });
    const res = await pg.evaluate(() => { const c = tlogGet(), rs = DFT.rs || {}, rids = [rs.R1, rs.R2, rs.R3, rs.R5, rs.RD, rs.RD2].filter(Boolean);
      return { ok: c.ok, total: c.total, kind: c.kind, title: c.title, fname: tlogFileName(c), steps: c.steps.map(s => ({ n: s.name, ok: s.ok, x: s.extra })), txt: c.txt || tlogText(c),
        issues: (c.issues || []).map(i => ({ sev: i.sev, text: i.text, n: i.n })), ui: c.ui ? { scans: c.ui.scans, err: c.ui.err, warn: c.ui.warn, env: c.ui.env, capped: c.ui.capped,
          where: c.ui.states.map(s => s.where), defects: c.ui.defects.map(d => d.level + ' [' + d.title + '] ' + d.msg.slice(0, 200) + ' @ ' + d.where) } : null,
        left: state.data.jobs.filter(j => j.is_test).length + state.data.placements.filter(x => x.is_test).length + state.data.proposals.filter(x => x.is_test).length + (state.data.repairs || []).filter(x => x.is_test).length,
        leftRep: (state.data.repairs || []).filter(r => rids.includes(r.id) || /^DFTEST/.test(r.unit_number || '')).length, rids: rids.length,
        jobs: state.data.jobs.length, pl: state.data.placements.length, pr: state.data.proposals.length, rep: (state.data.repairs || []).length, scr: state.screen,
        sum: document.getElementById('dft-sum').textContent, head: ((document.querySelector('#dft-panel .dft-ph') || {}).textContent || '').trim(),
        btns: ['dfu-log', 'dfu-crit', 'dfu-ui', 'dfi-crit', 'dfi-all'].filter(id => !!document.querySelector('#dft-panel #' + id)),
        drv: { on: DFTU.on, click: String(U.click).includes('dftUiProbe'), type: String(U.type).includes('dftUiProbe'), check: String(U.check).includes('dftUiProbe') } }; });
    res.before = before; res.sec = Math.round((Date.now() - t0) / 1000); return res;
  };
  const check = (label, r, repOnly, minSteps, env) => {
    const failed = r.steps.filter(s => s.ok === false), skipped = r.steps.filter(s => s.ok === null);
    t(`${label}: сценарий прошёл без провалов (${r.ok} / ${r.total}, пропущено ${skipped.length}, ${r.sec} с)`, failed.length === 0 && r.ok === r.total && r.total >= minSteps, { failed: failed.slice(0, 5), sum: r.sum });
    t(`${label}: запуск кнопкой карточки — выбранный работник и «Только ремонт» дошли до прогона`, r.before.only === repOnly && !!r.before.worker, r.before);
    t(`${label}: после теста ничего тестового не осталось, рабочие данные те же, экран прежний; драйвер кнопок — снова обычный`,
      r.left === 0 && r.leftRep === 0 && r.rids >= 4 && r.jobs === r.before.jobs && r.pl === r.before.pl && r.pr === r.before.pr && r.rep === r.before.rep && r.scr === 'settings' && !r.drv.on && !r.drv.click && !r.drv.type && !r.drv.check,
      { left: r.left, leftRep: r.leftRep, rids: r.rids, jobs: [r.before.jobs, r.jobs], rep: [r.before.rep, r.rep], scr: r.scr, drv: r.drv });
    const groups = ['R0', 'RA', 'RB', 'RC', 'RD', 'RF', 'RE'].filter(g => !r.txt.includes('=== ' + g + ' · '));
    t(`${label}: отчёт — вид «docflow_ui», заголовок и режим, группы ремонта, в конце общего лога — выжимка «Проверка интерфейса»`,
      r.kind === 'docflow_ui' && /^techlog-docflow_ui-/.test(r.fname) && /Тест документооборота \+ ремонт \+ интерфейс/.test(r.title) && /Тест документооборота \+ ремонт \+ интерфейс/.test(r.head) && !groups.length
      && (repOnly ? /только ремонт/.test(r.title) && !r.txt.includes('=== A · ') : r.txt.includes('=== A · ') && r.txt.includes('=== R · ')) && /ИТОГ: ✓/.test(r.txt)
      && /--- Проверка интерфейса ---\n/.test(r.txt) && /Проверено состояний экрана: \d+/.test(r.txt) && /▦ интерфейс: /.test(r.txt), { groups, kind: r.kind, fname: r.fname, title: r.title });
    t(`${label}: проверено ${r.ui && r.ui.scans} состояний экрана (${env}), ошибок интерфейса нет${r.ui && r.ui.warn ? ', предупреждений ' + r.ui.warn : ''}`,
      !!r.ui && r.ui.scans >= (repOnly ? 12 : 20) && r.ui.err === 0 && !r.ui.capped && r.ui.env.includes(env), r.ui && { err: r.ui.defects, env: r.ui.env, scans: r.ui.scans });
    if (r.ui && r.ui.defects.length) r.ui.defects.slice(0, 6).forEach(d => console.log('      ▦ ' + d));   /* предупреждения интерфейса — для сведения */
    t(`${label}: проверены документ ремонта в разных статусах, окна и списки — не только стартовый экран`,
      !!r.ui && ['REP · Черновик', 'REP · Отправлен', 'REP · Одобрен', 'Настройки'].every(k => r.ui.where.some(w => w.startsWith(k))) && r.ui.where.some(w => / · ▣ /.test(w)) && r.ui.where.some(w => /^WORK · /.test(w)),
      r.ui && r.ui.where.slice(0, 40));
    t(`${label}: в панели теста — три лога («Весь лог», «Критические», «Интерфейс») и прежние кнопки проблем; в итоге — число дефектов интерфейса`,
      ['dfu-log', 'dfu-crit', 'dfu-ui', 'dfi-crit', 'dfi-all'].every(k => r.btns.includes(k)) && /▦ \d+/.test(r.sum) && !r.issues.some(i => i.sev === 'crit'), { btns: r.btns, sum: r.sum, crit: r.issues.filter(i => i.sev === 'crit').slice(0, 3) });
  };
  const logs = async (label, pg, r, repOnly) => {
    const a = await grab(pg, '#dft-panel #dfu-log'), c = await grab(pg, '#dft-panel #dfu-crit'), u = await grab(pg, '#dft-panel #dfu-ui');
    const stem = r.fname.replace(/\.txt$/, '');
    t(`${label}: «Весь лог» — файл ${a.name}: весь журнал прогона с выжимкой по интерфейсу`, a.name === r.fname && /^techlog-docflow_ui-\d{4}-\d\d-\d\d_\d\d-\d\d\.txt$/.test(a.name) && a.txt.includes('=== R0 · ') && /ИТОГ: ✓/.test(a.txt)
      && a.txt.includes('--- Проверка интерфейса ---') && (a.txt.match(/☛ /g) || []).length > 50, { name: a.name, len: a.txt.length });
    t(`${label}: «Критические» — отдельный файл ${c.name}: только критические ошибки (их нет)`, c.name === stem + '-critical.txt' && /⛔ КРИТИЧЕСКИЕ — нет/.test(c.txt) && !c.txt.includes('=== R0 · ') && c.txt.length < 2000, { name: c.name, txt: c.txt.slice(0, 400) });
    t(`${label}: «Интерфейс» — отдельный файл ${u.name}: устройство, число состояний, список проверок, дефекты, все проверенные состояния по шагам`,
      u.name === stem + '-interface.txt' && u.txt.startsWith('TechLog 1.09.54 — Тест документооборота + ремонт + интерфейс' + (repOnly ? ' · только ремонт' : '') + ' · Проверка интерфейса')
      && /\nУстройство: .*\d+×\d+/.test(u.txt) && /\nПроверено состояний экрана: \d+ · время проверки [\d.]+ s · дефектов: \d+ — ⛔ ошибок 0/.test(u.txt) && u.txt.includes('Проверки: наезд кнопок друг на друга, перекрытие элементов')
      && u.txt.includes('кнопки за рамкой экрана') && u.txt.includes('кнопка вылезла из своего блока') && /--- Состояния экрана \(\d+\) ---/.test(u.txt) && (u.txt.match(/ · шаг «/g) || []).length >= 10 && !u.txt.includes('=== R0 · '),
      { name: u.name, head: u.txt.slice(0, 700) });
    return { a, c, u };
  };

  console.log('— ПК: админ, «только ремонт» с проверкой интерфейса —');
  const ra = await runUi(p, 'demo-admin', 'demo-tech', true, 360000);
  check('ПК · админ', ra, true, 45, 'режим ПК');
  await logs('ПК · админ', p, ra, true);
  await p.evaluate(() => { const b = document.getElementById('dft-close'); if (b) b.click(); }); await openCard(p);
  const cc = await p.evaluate(() => ({ panel: !!document.getElementById('dft-panel'), in: ['dfu-log', 'dfu-crit', 'dfu-ui'].filter(id => !!document.querySelector('#dftu-card #' + id)), cnt: ((document.querySelector('#dftu-card #dfu-ui') || {}).textContent || '').trim() }));
  t('панель закрыта — три лога остаются в карточке до следующего теста (у «Интерфейса» — число дефектов)', !cc.panel && cc.in.length === 3 && /Интерфейс \(\d+\)/.test(cc.cnt), cc);
  const cu = await grab(p, '#dftu-card #dfu-ui');
  t('кнопка «Интерфейс» в карточке отдаёт тот же лог', cu.name.endsWith('-interface.txt') && cu.txt.includes('--- Состояния экрана ('), cu.name);

  /* ---- «Пошагово» и «Остановить» ---- */
  console.log('— «Пошагово» и «Остановить» —');
  await openCard(p);
  await p.evaluate(() => { DFT.stepMode = true; App.dftRun('ui_rep'); }); await p.waitForFunction(() => !!DFT.next, null, { timeout: 30000 });
  for (let i = 0; i < 5; i++){ await p.evaluate(() => App.dftNext()); await p.waitForFunction(() => !!DFT.next || !DFT.running, null, { timeout: 60000 }); }
  const mid = await p.evaluate(() => ({ on: DFTU.on, click: String(U.click).includes('dftUiProbe'), scans: DFTU.scans, reps: (state.data.repairs || []).filter(r => r.is_test).length }));
  await p.evaluate(() => App.dftStop()); await p.waitForFunction(() => !DFT.running, null, { timeout: 90000 });
  const st = await p.evaluate(() => { const c = tlogGet(); return { reps: (state.data.repairs || []).filter(r => r.is_test || /^DFTEST/.test(r.unit_number || '')).length, jobs: state.data.jobs.filter(j => j.is_test).length,
    stopped: /остановлен/.test(tlogText(c)), ui: !!(c.ui && c.ui.scans >= 1), on: DFTU.on, click: String(U.click).includes('dftUiProbe'), btn: !!document.querySelector('#dft-panel #dfu-ui') }; });
  t('«Пошагово» + «Остановить»: проверка интерфейса шла по ходу, после остановки — уборка, отчёт интерфейса и три лога, драйвер кнопок вернулся к обычному',
    mid.on && mid.click && mid.scans >= 2 && st.reps === 0 && st.jobs === 0 && st.stopped && st.ui && !st.on && !st.click && st.btn, { mid, st });
  await p.evaluate(() => { DFT.stepMode = false; try{ App.closeModal(); }catch(e){} const pn = document.getElementById('dft-panel'); if (pn) pn.remove(); });

  /* ---- движок: искусственный экран ---- */
  console.log('— движок проверки на искусственном экране —');
  await p.evaluate(() => { App.go('settings'); window.scrollTo(0, 0); }); await p.waitForTimeout(400);
  const fx = await p.evaluate(() => {
    const app = document.getElementById('app'), box = document.createElement('div'); box.id = 't54';
    box.innerHTML = `
      <div class="card" style="display:flex;width:320px"><button class="btn" id="t54-b1" style="width:130px;flex:none">Один</button><button class="btn" id="t54-b2" style="width:130px;flex:none;margin-left:-70px">Два</button></div>
      <div class="card" style="white-space:nowrap"><button class="btn" id="t54-off" style="width:200px;white-space:nowrap">За краем</button></div>
      <div class="card" style="width:260px"><div class="form-row" style="display:block"><button class="btn" id="t54-esc" style="position:relative;left:170px;width:150px">Вылезла</button></div></div>
      <div class="card" style="position:relative;width:260px"><button class="btn" id="t54-under">Под крышкой</button><div style="position:absolute;inset:0;background:#111"></div></div>`;
    app.prepend(box); window.scrollTo(0, 0);
    const ob = document.getElementById('t54-off'); ob.style.marginLeft = Math.round(innerWidth - 80 - ob.getBoundingClientRect().left) + 'px';   /* левый край — за 80px до правого края экрана */
    const q = window.UIDiag.quickJson('fixture'), by = id => q.checks.filter(c => (c.items || []).some(i => i.msg.includes(id))).map(c => c.id + ':' + c.items.filter(i => i.msg.includes(id)).map(i => i.level).join('/'));
    const out = { touch: by('t54-b1'), off: by('t54-off'), esc: by('t54-esc'), under: by('t54-under'), msg: (q.checks.find(c => c.id === 'touch') || { items: [] }).items.map(i => i.msg).filter(m => m.includes('t54')).slice(0, 2) };
    box.remove(); return out; });
  t('ловит: две кнопки наехали друг на друга (ошибка, с размером наезда), кнопку за правым краем экрана, кнопку, вылезшую из своей строки, и кнопку под крышкой',
    fx.touch.some(x => /^touch:err/.test(x)) && /t54-b1.*×.*t54-b2.*\(70×\d+px\)/.test(fx.msg[0] || '') && fx.off.some(x => /^offscreen:(err|warn)/.test(x)) && fx.esc.some(x => /^escape:(err|warn)/.test(x)) && fx.under.some(x => /^cover:err/.test(x)), fx);
  const fo = await p.evaluate(() => {
    const mk = scroll => { const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 't54-ov'; ov.style.cssText = 'position:fixed;inset:0;display:block;z-index:1100;background:rgba(0,0,0,.4)';
      ov.innerHTML = `<div class="modal" style="position:absolute;left:20px;top:20px;width:320px;bottom:20px;${scroll ? 'overflow:auto' : 'overflow:visible'}"><h3>Окно</h3><div style="height:${innerHeight}px"></div><button class="btn" id="t54-low">Ниже экрана</button></div>`;
      document.body.appendChild(ov); const q = window.UIDiag.quickJson('ov'); ov.remove();
      return q.checks.filter(c => (c.items || []).some(i => i.msg.includes('t54-low'))).map(c => c.id + ':' + c.items.filter(i => i.msg.includes('t54-low')).map(i => i.msg.slice(0, 90)).join('/')); };
    return { stuck: mk(false), scroll: mk(true) }; });
  t('окно выше экрана без прокрутки: кнопка ниже края — «прокрутки нет»; то же окно с прокруткой — не дефект', fo.stuck.some(x => /^offscreen:ниже края на \d+px, прокрутки нет/.test(x)) && !fo.scroll.some(x => /^offscreen/.test(x)), fo);
  const fg = await p.evaluate(async () => {
    const app = document.getElementById('app'), box = document.createElement('div'); box.id = 't54g';
    box.innerHTML = `
      <div class="card"><div style="position:relative;width:240px"><input id="t54-in" style="width:240px;box-sizing:border-box" value="поиск"><button id="t54-x" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);width:22px;height:22px;padding:0">×</button></div></div>
      <div class="card"><div class="tabs" id="t54-car" style="display:flex;gap:6px;overflow-x:auto;width:300px">${[1, 2, 3, 4, 5, 6, 7, 8].map(i => `<button class="btn" style="flex:none;width:120px">Вкладка ${i}</button>`).join('')}</div></div>
      <div id="t54-drw" style="position:fixed;left:calc(100vw - 40px);top:200px;width:300px;height:120px;z-index:46;background:#222"><button class="btn" id="t54-dbtn" style="width:280px">Меню уехало</button></div>
      <div class="card" style="width:320px"><div class="form-row" style="position:relative"><input class="combo-in" value="Mag"><div class="combo-list" style="display:block"><div class="combo-opt" onclick="0">Magnolia Group</div><div class="combo-opt" onclick="0">Maple Homes</div><div class="combo-opt" onclick="0">Marble Inc</div></div></div>
        <div class="form-row"><span class="lbl">Метка <span class="tl-tip" id="t54-tip" onclick="0">?</span></span><button class="btn" id="t54-nx">Кнопка</button></div></div>
      <div class="card" style="width:320px"><button class="btn" id="t54-pb" style="width:280px">Под панелью теста</button></div>
      <div class="card" style="width:320px"><div class="qty-line"><span class="name">Работник</span><select id="t54-sel" class="role-sel" style="width:150px"><option value="">—</option><option value="a" selected>Oleg Ivanov</option></select></div></div>`;
    app.prepend(box); selxApply(); window.scrollTo(0, 0);
    const sx = document.querySelector('#t54-sel + .selx-x.on');
    const pb = document.getElementById('t54-pb').getBoundingClientRect(), pn = document.createElement('div'); pn.id = 'dft-panel'; pn.className = 'dft-panel';
    pn.style.cssText = `position:fixed;left:${pb.left - 10}px;top:${pb.top - 10}px;width:${pb.width + 20}px;height:${pb.height + 20}px;z-index:9500;background:#000`; pn.innerHTML = '<button class="btn">Панель</button>'; document.body.appendChild(pn);
    const q = window.UIDiag.quickJson('guards'), ids = ['t54-in', 't54-x', 't54-car', 'Вкладка', 't54-dbtn', 'Magnolia', 'Maple', 'Marble', 't54-tip', 't54-nx', 't54-pb', 'dft-panel', 't54-sel', 'selx-x'];
    const hitsBy = q.checks.flatMap(c => (c.items || []).filter(i => ids.some(id => i.msg.includes(id))).map(i => c.id + ' ' + i.level + ' ' + i.msg.slice(0, 160)));
    const panelBack = pn.style.visibility === '';
    const listCovers = (() => { const tip = document.getElementById('t54-tip').getBoundingClientRect(), e = document.elementFromPoint(tip.left + tip.width / 2, tip.top + tip.height / 2); return !!(e && e.closest('.combo-list')); })();
    const selx = !!sx && (() => { const a = document.getElementById('t54-sel').getBoundingClientRect(), b = sx.getBoundingClientRect(); return b.left < a.right && b.right > a.left; })();
    box.remove(); pn.remove(); return { hitsBy, panelBack, listCovers, selx }; });
  t('не ловит приёмы вёрстки: крестик в поле ввода и крестик очистки на выпадающем списке, вкладки в карусели за краем, выехавшее за край меню, открытый список поверх строки ниже, панель теста поверх кнопки (на время проверки прячется и возвращается)',
    !fg.hitsBy.length && fg.panelBack && fg.listCovers && fg.selx, fg);
  /* липкое меню настроек у конца страницы невысокого окна: контейнер выталкивает его вверх */
  await p.setViewportSize({ width: 1024, height: 700 }); await p.evaluate(() => { App.go('settings'); }); await p.waitForTimeout(700);
  const sn = await p.evaluate(async () => {
    const nav = document.getElementById('set-nav'), tb = document.querySelector('.topbar'), brand = document.querySelector('.topbar .brand');
    window.scrollTo(0, 1e6); await new Promise(r => setTimeout(r, 150));
    const b = brand.getBoundingClientRect(), nr = nav.getBoundingClientRect(), e = document.elementFromPoint(b.left + 30, b.top + b.height / 2);
    const cov = z => { nav.style.zIndex = z; const q = window.UIDiag.quickJson('set'); nav.style.zIndex = ''; return (q.checks.find(c => c.id === 'cover') || { items: [] }).items.map(i => i.level + ' ' + i.msg.slice(0, 150)); };
    const res = { z: +getComputedStyle(nav).zIndex, tbz: +getComputedStyle(tb).zIndex, pushed: Math.round(nr.top) < parseInt(nav.style.top || getComputedStyle(nav).top, 10), brandTop: !!(e && tb.contains(e)), now: cov(''), old: cov('60') };
    window.scrollTo(0, 0); return res; });
  t('меню разделов настроек у конца страницы (окно 1024×700) уходит под шапку, а не ложится на логотип; проверка перекрытия — чистая, а со старым слоем меню ловит наезд на шапку',
    sn.z < sn.tbz && sn.pushed && sn.brandTop && !sn.now.length && sn.old.some(x => /brand.*←\s+nav#set-nav/.test(x)), sn);
  /* табличка очереди отправки на ПК — правее меню */
  const net = await p.evaluate(async () => {
    const n = document.getElementById('tl-net'); if (!n) return { none: true }; const d0 = n.style.display; n.style.display = 'flex'; await new Promise(r => setTimeout(r, 50));
    const r = n.getBoundingClientRect(), tb = document.querySelector('.tabbar').getBoundingClientRect(), set = [...document.querySelectorAll('.tabbar [onclick], .tabbar button')].find(b => /settings/.test(b.getAttribute('onclick') || '') || /Настройки/.test(b.textContent || b.title || ''));
    const sr = set && set.getBoundingClientRect(), top = sr && document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
    const res = { left: Math.round(r.left), menuR: Math.round(tb.right), setOk: !!(top && set.contains(top)), cs: getComputedStyle(n).left };
    n.style.display = d0; return res; });
  t('ПК: табличка очереди отправки стоит правее левого меню и не закрывает пункт «Настройки»', !net.none && net.left >= net.menuR && net.setOk && net.cs === '124px', net);
  await p.setViewportSize({ width: 1400, height: 900 });

  /* ---- телефон ---- */
  console.log('— телефон 390×844: исправления вёрстки и весь тест работника —');
  const m = await mkPage({ width: 390, height: 844 }, true);
  await boot(m, 'demo-admin', 'mobile'); await m.evaluate(() => { DFT.warned = true; App.dftSetMode(true, 4); }); await m.waitForTimeout(400);   /* предупреждение админу о режиме — не поверх экранов */
  await m.evaluate(() => { try{ App.closeModal(); }catch(e){} });
  const db = await m.evaluate(async () => {
    const j = state.data.jobs.find(x => x.status === 'draft' && !x.is_test) || state.data.jobs[0], cx = cxById(j.complex_id); const code0 = cx.access_code; if (!cx.access_code) cx.access_code = '4321#';
    App.openJob(j.id); await new Promise(r => setTimeout(r, 500));
    if (document.getElementById('overlay')){ App.closeModal(); await new Promise(r => setTimeout(r, 300)); }
    const R = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), t: Math.round(b.top), h: Math.round(b.height) }; };
    const out = { W: innerWidth, x: R('.docbar .db-x'), tt: R('.docbar .db-t'), back: R('.docbar .db-back'), save: R('.docbar .db-save'), lbl: getComputedStyle(document.querySelector('.docbar .db-back span')).display,
      tip: document.querySelector('.docbar .db-back').title, stip: (document.querySelector('.docbar .db-save') || {}).title };
    const wt = document.querySelector('.wt-change'), kc = document.querySelector('.key-copy');
    if (wt){ const b = wt.getBoundingClientRect(), e = document.elementFromPoint(b.left + Math.min(40, b.width / 2), b.top + 3); out.wt = { pos: getComputedStyle(wt).position, top: !!(e && wt.contains(e)), key: !!kc, by: e ? (e.className || e.tagName) + '' : null }; }
    const q = window.UIDiag.quickJson('job'); out.errs = q.checks.flatMap(c => (c.items || []).filter(i => i.level === 'err').map(i => c.id + ' ' + i.msg.slice(0, 140)));
    cx.access_code = code0; App.jobClose(); await new Promise(r => setTimeout(r, 300)); try{ App.closeModal(); }catch(e){} App.go('home'); return out; });
  t('телефон 390px: шапка документа влезает — «Закрыть» в пределах экрана, номер документа виден, «Назад» и «Сохранить» — значками с подсказкой',
    db.x && db.x.r <= db.W && db.tt && db.tt.w >= 60 && db.lbl === 'none' && db.tip === 'Назад' && db.stip === 'Сохранить' && db.back.r <= db.tt.l && db.save.r <= db.x.l + 1, db);
  t('телефон: кнопка вида задачи не перекрыта расширенной зоной кода доступа строкой выше; на экране задачи ошибок интерфейса нет',
    !!db.wt && db.wt.pos === 'relative' && db.wt.top && db.wt.key && !db.errs.length, { wt: db.wt, errs: db.errs });
  const ch = await m.evaluate(async () => {
    const j = state.data.jobs.find(x => !x.is_test && x.status === 'done') || state.data.jobs[0];
    state.data.repairs.push({ id: 't54-r1', no: 5401, date: j.date, counterparty_id: j.counterparty_id, complex_id: j.complex_id, unit_number: j.unit_number, job_id: j.id, items: [], materials: [], helper_ids: [], status: 'sent', hist: [] },
      { id: 't54-r2', no: 5402, date: j.date, counterparty_id: j.counterparty_id, complex_id: j.complex_id, unit_number: j.unit_number, job_id: j.id, items: [], materials: [], helper_ids: [], status: 'draft', hist: [] });
    App.chain('rep', 't54-r1'); await new Promise(r => setTimeout(r, 600));
    const its = [...document.querySelectorAll('#overlay .chain-item')].map(e => e.getBoundingClientRect()), ars = [...document.querySelectorAll('#overlay .chain-arr')];
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const over = ars.filter(a => its.some(r => hit(a.getBoundingClientRect(), r))).length, gaps = ars.map(a => (a.querySelector('.chain-gap') || {}).textContent || '').filter(Boolean);
    const ar = ars[0] && ars[0].getBoundingClientRect(), svgT = ars[0] ? getComputedStyle(ars[0].querySelector('svg')).transform : '';
    const jobSub = [...document.querySelectorAll('#overlay .chain-item.t-job .tiny')].map(e => e.textContent.trim())[0] || '';
    const tr = ars[0] ? getComputedStyle(ars[0]).transform : '';
    const q = window.UIDiag.quickJson('chain'); const errs = q.checks.flatMap(c => (c.items || []).filter(i => i.level === 'err' || (c.id === 'touch')).map(i => c.id + ' ' + i.msg.slice(0, 140)));
    App.closeModal(); state.data.repairs = state.data.repairs.filter(r => !/^t54-/.test(r.id));
    return { items: its.length, arrows: ars.length, over, gaps, arW: ar && Math.round(ar.width), arH: ar && Math.round(ar.height), tr, svgT, jobSub, errs }; });
  t('телефон: цепочка документов — стрелки с подписью дней стоят между карточками, а не поперёк них (поворачивается только значок)',
    ch.items >= 3 && ch.arrows >= 2 && ch.over === 0 && ch.tr === 'none' && ch.svgT !== 'none' && ch.arH < 40 && ch.gaps.length >= 1 && !ch.errs.length, ch);
  t('цепочка: у инвойса (WORK) подпись статуса словами, а не сырой ключ «st_…»', !/\bst_|status_/.test(ch.jobSub) && /Выполнено|Черновик|Апрув/.test(ch.jobSub), ch.jobSub);

  const rt = await runUi(m, 'demo-tech', 'demo-tech2', QUICK, QUICK ? 360000 : 600000);
  check('телефон · работник', rt, QUICK, QUICK ? 45 : 140, 'режим телефон');
  const lt = await logs('телефон · работник', m, rt, QUICK);
  t('телефон · работник: в логе интерфейса — устройство телефона (390×844, книжная), в общем логе — экраны форм работника кнопками',
    /Устройство: .*390×844.*книжная.*режим телефон/.test(lt.u.txt) && /☛ /.test(lt.a.txt), lt.u.txt.split('\n').slice(2, 4));

  /* ---- выключение ---- */
  await p.evaluate(() => App.dftSetMode(false)); await p.waitForTimeout(400);
  await login(p, 'demo-tech'); await openCard(p);
  t('админ выключил режим: у работника третьей карточки нет, запуск невозможен', await p.evaluate(async () => { const c = !document.getElementById('dftu-card'); await App.dftRun('ui'); return c && !DFT.running; }));

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
