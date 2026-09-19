/* v1.09.05 — компактная плотность интерфейса (телефон и ПК) и ПК-режим на телефоне.
   Что проверяется (демо-режим, без Supabase):
     A. настройка: строка «Плотность интерфейса» под размером шрифта; значение своё у
        режима «Телефон» и «ПК»; кэш устройства + запись в профиль (push_prefs.density /
        density_pc); класс tl-compact стоит ДО старта app.js; профиль сильнее устройства;
        кнопка ПК-режима внизу слева и кнопка на доске переключают то же значение;
     B. геометрия на «густом» посеве (12 сотрудников, задачи, просроченные пикапы):
        шапка, лента недели, карточка дня, доска — меньше порогов и меньше, чем в
        обычной плотности; текст не выходит за карточки доски; ▲▼ по наведению;
     C. исправления: доска не под закреплённым меню и без горизонтальной прокрутки
        страницы; окно ≤ 1150 px — страница не теряет 124 px слева;
     D. холст ПК-режима: альбомный телефон → innerWidth = 1100, раскладка ПК, подсказка
        с возвратом в «Телефон»; книжный — без холста, но колонки доски слушаются
        «минимум сотрудников»; «Выкл», выбор ширины, предел читаемости 45%;
        мышь — без холста; браузер, игнорирующий viewport, — самовыключение;
     E. «Диагностика интерфейса» в компактном: 0 дефектов на главной, доске,
        настройках и в открытом документе — телефон, ПК и холст.
   Запуск: node tests/v1_09_05.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8905;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
const SOFT = ['contrast', 'hit', 'clip', 'paint', 'store'];

/* opts: { w, h, mode, touch, mobile, ls: {ключ: значение}, seed: {...}|null } */
async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.touch ? 2 : 1,
    hasTouch: !!o.touch, isMobile: !!o.mobile, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  /* снимок «что было на <html>, когда app.js ещё не стартовал» */
  await p.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (!window.__early) window.__early = { state: document.readyState, cls: document.documentElement.className,
        fs: document.documentElement.style.fontSize, app: !!window.App };
    });
  });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([mode, ls]) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', mode);
    Object.keys(ls || {}).forEach(k => localStorage.setItem(k, ls[k])); }, [o.mode, o.ls || {}]);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('.tabbar'), null, { timeout: 20000 });
  await p.waitForTimeout(700);
  if (o.seed) await seed(p, o.seed);
  return p;
}
/* «густой» посев: сотрудники, задачи на сегодня, просроченные пикапы по 2 и 4 типа оборудования */
async function seed(p, o){
  await p.waitForTimeout(1700);                       // кэш демо пишется с задержкой
  await p.evaluate((o) => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
    let seq = 0; const uid = () => 'sd' + (++seq) + Math.random().toString(36).slice(2, 8);
    const iso = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const tISO = iso(new Date());
    const back = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return iso(x); };
    const names = ['Aleksei Bondarenko', 'Alex Brown', 'Artem Kuznetsov', 'IVAN Sidorov', 'TestUser1 One', 'TestUser2 Two',
      'TestUser3 Three', 'TestUser4 Four', 'Maksim Konstantinopolsky', 'Dmitry Orlov', 'Pavel Novak', 'Oleg Tkachenko'];
    const techs = [];
    for (let i = 0; i < (o.staff || 0); i++){
      const pr = { id: 'seed-t' + i, login: 'seed' + i, display_name: names[i % names.length], role: 'tech', car_no: 10 + i, blocked: false, created_at: '2026-03-01T09:00:00Z' };
      d.profiles.push(pr); techs.push(pr);
    }
    const wts = d.work_types, cxs = d.complexes, ets = d.equipment_types;
    let no = d.jobs.length, pno = d.placements.length, k = 0;
    const mkJob = (tech, date, status) => { const cx = cxs[k % cxs.length], wt = wts[k % wts.length]; k++;
      return { id: uid(), no: ++no, date, counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: String(100 + k * 7) + (k % 5 === 0 ? 'B' : ''),
        work_type_id: wt.id, technician_id: tech.id, technician_name: tech.display_name, helper_ids: [], shared_with_helpers: false,
        priority: k % 4 === 0, sort_order: k, status: status || ['done', 'approved', 'draft'][k % 3], note: '',
        form_data: d.jobs[0].form_data, total: 120 + k * 35, approved_total: null, approved_by: null, approved_at: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; };
    techs.forEach((tch, ti) => {
      for (let i = 0; i < [6, 1, 2, 0, 0, 3, 0, 5, 2, 1, 0, 4][ti % 12]; i++) d.jobs.push(mkJob(tch, tISO));
      for (let g = 0; g < [4, 1, 1, 0, 0, 0, 0, 2, 0, 1, 0, 0][ti % 12]; g++){
        const j = mkJob(tch, back(8 + g * 2), 'done'); d.jobs.push(j);
        const cx = cxs[(ti + g) % cxs.length];
        (g % 2 ? [['SCR', 1], ['BLW', 3], ['DHM', 1], ['OZN', 1]] : [['SCR', 1], ['BLW', 1]]).forEach(([ab, q]) => {
          const et = ets.find(e => e.abbr === ab);
          d.placements.push({ id: uid(), no: ++pno, job_id: j.id, equipment_type_id: et.id, qty: q, days: 3, placed_date: j.date, due_date: back(5 + g),
            picked_up: false, picked_up_at: null, picked_up_by: null, technician_id: tch.id, complex_id: cx.id, counterparty_id: cx.counterparty_id,
            unit_number: j.unit_number, ext_of: null });
        });
      }
    });
    const me = d.profiles.find(x => x.id === 'demo-admin');
    for (let i = 0; i < (o.mine || 0); i++) d.jobs.push(mkJob(me, tISO));
    if (o.boardCols) me.board_cols = o.boardCols;
    if (o.prefs) me.push_prefs = Object.assign({}, me.push_prefs || {}, o.prefs);
    localStorage.setItem('techlog_state_v1', JSON.stringify(d));
  }, o);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('.tabbar'), null, { timeout: 20000 });
  await p.waitForTimeout(900);
}
const go = async (p, s) => { await p.evaluate(x => window.App.go(x), s); await p.waitForTimeout(650); };
const html = (p) => p.evaluate(() => ({ cls: document.documentElement.className, fs: parseFloat(getComputedStyle(document.documentElement).fontSize),
  iw: innerWidth, ih: innerHeight, docW: document.documentElement.scrollWidth,
  vp: document.querySelector('meta[name="viewport"]').getAttribute('content'),
  vs: document.documentElement.style.getPropertyValue('--vs') }));
const me = (p) => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}');
  return ((d.profiles || []).find(x => x.id === 'demo-admin') || {}).push_prefs || {}; });
/* геометрия главной */
const homeGeo = (p) => p.evaluate(() => {
  const rc = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const tb = rc('#app .topbar'), dc = rc('.week-days .day-cell'), bn = rc('#app .banner');
  const items = [...document.querySelectorAll('#day-list .item')].map(e => e.getBoundingClientRect());
  const jobs = [...document.querySelectorAll('#day-list .item')].filter(e => (e.getAttribute('onclick') || '').includes('openJob') && e.querySelector('.badge-status'))
    .map(e => Math.round(e.getBoundingClientRect().height));
  const bar = rc('#app .tabbar');
  const limit = bar && bar.width > 300 ? bar.top : innerHeight;      // нижнее меню закрывает низ экрана
  return { top: Math.round(tb.height), cell: Math.round(dc.height), banner: bn ? Math.round(bn.height) : 0,
    firstTop: items.length ? Math.round(items[0].top) : -1, jobH: jobs, n: items.length,
    whole: items.filter(r => r.top >= 0 && r.bottom <= limit).length, ih: innerHeight };
});
/* геометрия доски: колонки, наплывы, вылет текста */
const boardGeo = (p) => p.evaluate(() => {
  const b = document.querySelector('.board'); if (!b) return null;
  const br = b.getBoundingClientRect();
  const cols = [...b.querySelectorAll('.bcol')].map(c => c.getBoundingClientRect());
  const tab = document.querySelector('#app .tabbar').getBoundingClientRect();
  const vertical = tab.height > tab.width;            // меню колонкой слева (ПК-раскладка)
  const tabVisible = vertical && tab.right > 4;       // не уехало за край (tl-fit без закрепления)
  let spill = [];
  b.querySelectorAll('.bjob, .bpk, .bcol-h').forEach(card => {
    const cr = card.getBoundingClientRect();
    /* голый текст карточки (у пикапа набор оборудования — текстовый узел): меряем диапазоном.
       scrollWidth не годится — в него попадает точка трекера, сознательно висящая на углу */
    const tw = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let nd = tw.nextNode(); nd; nd = tw.nextNode()){
      if (!nd.nodeValue.trim() || !nd.parentElement || nd.parentElement.closest('.brail, .bn-dot')) continue;
      const ps = getComputedStyle(nd.parentElement); if (ps.display === 'none' || ps.visibility === 'hidden') continue;
      if (nd.parentElement.closest('.bwt') ) continue;                       // вид работ режется многоточием — его рамку проверит цикл ниже
      const rg = document.createRange(); rg.selectNodeContents(nd);
      [...rg.getClientRects()].forEach(r => { if (r.width && (r.right > cr.right + 1.5 || r.left < cr.left - 1.5)) spill.push('text «' + nd.nodeValue.trim().slice(0, 14) + '» ' + Math.round(r.right - cr.right)); });
    }
    card.querySelectorAll('b, span, div, button').forEach(k => {
      const s = getComputedStyle(k); if (s.display === 'none' || s.visibility === 'hidden') return;
      if (k.classList.contains('bn-dot') || k.closest('.brail')) return;   // точка трекера сознательно висит на углу
      const r = k.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (r.right > cr.right + 1.5 || r.left < cr.left - 1.5) spill.push((k.className || k.tagName) + ' ' + Math.round(r.right - cr.right));
    });
  });
  const pk4 = [...b.querySelectorAll('.bpk')].filter(x => /OZN/.test(x.textContent)).map(x => Math.round(x.getBoundingClientRect().height));
  const jobH = [...b.querySelectorAll('.bjob')].filter(x => !x.querySelector('.brep')).map(x => Math.round(x.getBoundingClientRect().height));
  return { left: Math.round(br.left), right: Math.round(br.right), iw: innerWidth, docW: document.documentElement.scrollWidth,
    n: cols.length, colW: cols.length ? Math.round(cols[0].width) : 0,
    whole: cols.filter(r => r.left >= br.left - 1 && r.right <= Math.min(br.right, innerWidth) + 1).length,
    tabRight: Math.round(tab.right), vertical, tabVisible, underMenu: tabVisible && br.left < tab.right - 1,
    spill: spill.slice(0, 6), spillN: spill.length, pk4, jobH: jobH.slice(0, 8),
    top: Math.round(br.top), hdrRows: [...b.querySelectorAll('.bcol-h')].slice(0, 4).map(h => Math.round(h.getBoundingClientRect().height)),
    yr: [...b.querySelectorAll('.bpk .yr')].filter(y => getComputedStyle(y).display !== 'none').length };
});
async function diagList(p){
  const r = await p.evaluate(() => window.UIDiag.json());
  const hard = [];
  r.checks.forEach(c => c.items.forEach(i => { if (i.level === 'err' && !SOFT.includes(c.id)) hard.push('[' + c.id + '] ' + i.msg.slice(0, 150)); }));
  return hard;
}
async function diag(p, label){
  const hard = await diagList(p);
  t('диагностика интерфейса · ' + label + ': дефектов 0', hard.length === 0, hard.slice(0, 3).join(' | '));
}
async function openFirstJob(p){
  await go(p, 'home');
  const jid = await p.evaluate(() => { const e = [...document.querySelectorAll('#day-list .item')].find(x => (x.getAttribute('onclick') || '').includes('openJob')); return /'([^']+)'/.exec(e.getAttribute('onclick'))[1]; });
  await p.evaluate(id => window.App.openJob(id), jid); await p.waitForTimeout(900);
}

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ================= A. настройка ================= */
  console.log('— A. телефон 390 px: строка настройки, класс, кэш устройства, профиль —');
  let p = await boot(br, { w: 390, h: 844, mode: 'mobile', touch: 1, mobile: 1 });
  let h0 = await html(p);
  t('по умолчанию плотность обычная: класса tl-compact нет, база кегля 16 px', !/tl-compact/.test(h0.cls) && h0.fs === 16, h0);
  await go(p, 'settings');
  let st = await p.evaluate(() => {
    const row = document.querySelector('#dens-row'), card = row && row.closest('.card'), rows = card ? [...card.children] : [];
    return { row: !!row, after: rows.indexOf(row) - rows.findIndex(x => x.classList.contains('fs-demo')), ml: rows.findIndex(x => x.id === 'ml-row') - rows.indexOf(row),
      seg: [...document.querySelectorAll('#dens-row .lang-seg button')].map(x => x.textContent.trim() + (x.classList.contains('on') ? '*' : '')),
      d: (row.querySelector('.d') || {}).textContent, tip: !!row.querySelector('.tipq'), cv: !!document.querySelector('#cv-row') };
  });
  t('«Плотность интерфейса» — строка карточки профиля сразу под примером шрифта, перед строками меню; есть «?»',
    st.row && st.after === 1 && st.ml >= 1 && st.tip, st);
  t('сегмент «Обычная | Компактная», выбрана обычная; подпись «сейчас: режим „Телефон“»',
    JSON.stringify(st.seg) === '["Обычная*","Компактная"]' && /Телефон/.test(st.d), st);
  await p.click('#dens-row .lang-seg button:nth-child(2)'); await p.waitForTimeout(400);
  let h1 = await html(p);
  t('«Компактная»: класс tl-compact на <html>, база кегля телефона 15 px', /tl-compact/.test(h1.cls) && h1.fs === 15, h1);
  let ls = await p.evaluate(() => [localStorage.getItem('techlog_density_m'), localStorage.getItem('techlog_density')]);
  t('кэш устройства: techlog_density_m = compact, ключ ПК-режима не тронут', ls[0] === 'compact' && ls[1] === null, ls);
  t('сегмент перерисовался: выбрана «Компактная»', await p.evaluate(() => document.querySelector('#dens-row .lang-seg button.on').textContent.trim() === 'Компактная'));
  await p.waitForTimeout(2600);
  let pf = await me(p);
  t('профиль: push_prefs.density = compact, density_pc не появился', pf.density === 'compact' && pf.density_pc === undefined, pf);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('.tabbar'));
  const early = await p.evaluate(() => window.__early);
  t('после перезагрузки класс и кегль стоят ДО старта app.js (readyState ' + (early && early.state) + ')',
    early && /tl-compact/.test(early.cls) && parseFloat(early.fs) === 15 && early.app === false, early);
  await p.evaluate(() => window.App.setLang('en')); await p.waitForTimeout(300); await go(p, 'settings');
  t('EN: «Interface density», Regular | Compact', await p.evaluate(() => /Interface density/.test(document.querySelector('#dens-row').textContent)
    && [...document.querySelectorAll('#dens-row .lang-seg button')].map(x => x.textContent.trim()).join('|') === 'Regular|Compact'));
  await p.evaluate(() => window.App.setLang('ru')); await p.waitForTimeout(300);
  await p.context().close();

  console.log('— A. ПК 1366 px: своё значение, кнопка внизу слева, кнопка на доске, профиль сильнее устройства —');
  p = await boot(br, { w: 1366, h: 768, mode: 'desktop', ls: { techlog_density_m: 'compact' } });
  h0 = await html(p);
  t('на телефоне «компактно», в ПК-режиме — своё значение: обычная, 16 px', !/tl-compact/.test(h0.cls) && h0.fs === 16, h0);
  t('кнопка плотности внизу слева есть, не нажата', await p.evaluate(() => { const b = document.querySelector('#dsk-density'); return !!b && !b.classList.contains('on') && b.getAttribute('aria-pressed') === 'false'; }));
  await p.click('#dsk-density'); await p.waitForTimeout(500);
  h1 = await html(p);
  t('клик: tl-compact, база кегля ПК 14 px, кнопка подсвечена', /tl-compact/.test(h1.cls) && h1.fs === 14
    && await p.evaluate(() => document.querySelector('#dsk-density').classList.contains('on')), h1);
  t('кэш ПК-режима techlog_density = compact (историческое имя ключа)', await p.evaluate(() => localStorage.getItem('techlog_density') === 'compact'));
  await go(p, 'settings');
  t('в настройках выбрана «Компактная», подпись «сейчас: режим „ПК“», строки холста нет (мышь)',
    await p.evaluate(() => document.querySelector('#dens-row .lang-seg button.on').textContent.trim() === 'Компактная'
      && /ПК/.test(document.querySelector('#dens-row .d').textContent) && !document.querySelector('#cv-row')));
  await p.waitForTimeout(2600);
  pf = await me(p);
  t('профиль: density_pc = compact (кнопка ПК-режима тоже пишет в аккаунт)', pf.density_pc === 'compact', pf);
  await go(p, 'board');
  t('на доске рядом с глазом — кнопка плотности, нажата', await p.evaluate(() => { const b = document.querySelector('.board-tools #brd-dens');
    return !!b && b.classList.contains('on') && !!b.previousElementSibling && b.previousElementSibling.classList.contains('brd-eye'); }));
  await p.click('#brd-dens'); await p.waitForTimeout(500);
  h1 = await html(p);
  t('кнопка на доске вернула обычную плотность; кнопка внизу слева погасла', !/tl-compact/.test(h1.cls) && h1.fs === 16
    && await p.evaluate(() => !document.querySelector('#dsk-density').classList.contains('on')), h1);
  /* профиль → устройство */
  await p.waitForTimeout(2600);
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('techlog_state_v1')); const m = d.profiles.find(x => x.id === 'demo-admin');
    m.push_prefs = Object.assign({}, m.push_prefs, { density_pc: 'compact' }); localStorage.setItem('techlog_state_v1', JSON.stringify(d));
    localStorage.setItem('techlog_density', 'cozy'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('.tabbar')); await p.waitForTimeout(900);
  h1 = await html(p);
  t('в профиле «компактно», на устройстве «обычная» → после входа действует профиль, кэш обновлён',
    /tl-compact/.test(h1.cls) && await p.evaluate(() => localStorage.getItem('techlog_density') === 'compact'), h1);
  await p.context().close();

  /* ================= B. геометрия ================= */
  console.log('— B. телефон 412×915, густой день: обычная против компактной —');
  const geo = {};
  for (const dens of ['cozy', 'compact']){
    p = await boot(br, { w: 412, h: 915, mode: 'mobile', touch: 1, mobile: 1, ls: { techlog_density_m: dens }, seed: { staff: 12, mine: 6 } });
    await go(p, 'home'); geo[dens] = { home: await homeGeo(p) };
    await go(p, 'board'); geo[dens].board = await boardGeo(p);
    /* открытый документ: у движка есть замечания к демо-камере, от плотности они не зависят —
       поэтому сравниваем компактную с обычной, а не с нулём */
    await openFirstJob(p); geo[dens].docDefects = await diagList(p);
    await p.evaluate(() => { if (window.App.jobDrop) window.App.jobDrop(); }); await p.waitForTimeout(300);
    if (dens === 'compact'){
      await diag(p, 'телефон, компактно, доска');
      await go(p, 'home'); await diag(p, 'телефон, компактно, главная');
      await go(p, 'settings'); await diag(p, 'телефон, компактно, настройки');
      const tabH = await p.evaluate(() => Math.round(document.querySelector('#app .tabbar .tab').getBoundingClientRect().height));
      t('палец: пункт нижнего меню ≥ 40 px', tabH >= 40, tabH);
    }
    await p.context().close();
  }
  const gc = geo.compact, gz = geo.cozy;
  t('открытый документ (телефон): компактная плотность не добавила ни одного дефекта к обычной (' + gz.docDefects.length + ')',
    gc.docDefects.filter(x => gz.docDefects.indexOf(x) < 0).length === 0, gc.docDefects.filter(x => gz.docDefects.indexOf(x) < 0).slice(0, 3));
  t('шапка: компактная ≤ 60 px и ниже обычной (' + gz.home.top + ')', gc.home.top <= 60 && gc.home.top < gz.home.top - 8, [gz.home.top, gc.home.top]);
  t('ячейка ленты недели: ≤ 50 px (было ' + gz.home.cell + ')', gc.home.cell <= 50 && gc.home.cell < gz.home.cell - 12, [gz.home.cell, gc.home.cell]);
  t('карточка задачи: каждая ≤ 126 px (было ' + Math.max(...gz.home.jobH) + ') и в среднем не выше 75% обычной',
    gc.home.jobH.length > 3 && Math.max(...gc.home.jobH) <= 126
    && gc.home.jobH.reduce((a, b) => a + b, 0) / gc.home.jobH.length <= 0.75 * gz.home.jobH.reduce((a, b) => a + b, 0) / gz.home.jobH.length,
    { cozy: gz.home.jobH, compact: gc.home.jobH });
  t('первая карточка дня видна на первом экране раньше', gc.home.firstTop > 0 && gc.home.firstTop < gz.home.firstTop - 100, [gz.home.firstTop, gc.home.firstTop]);
  t('доска: целиком видно ≥ 3 колонок (было ' + gz.board.whole + ')', gc.board.whole >= 3 && gz.board.whole <= 1, [gz.board.whole, gc.board.whole, gc.board.colW]);
  t('доска: ни один текст не выходит за карточку и шапку колонки', gc.board.spillN === 0, gc.board.spill);
  t('доска: пикап из 4 типов ≤ 64 px (было ' + Math.max(...gz.board.pk4) + '), год в сроке скрыт',
    gc.board.pk4.length > 0 && Math.max(...gc.board.pk4) <= 64 && Math.max(...gc.board.pk4) < 0.6 * Math.max(...gz.board.pk4) && gc.board.yr === 0 && gz.board.yr > 0,
    { cozy: gz.board.pk4, compact: gc.board.pk4, yr: [gz.board.yr, gc.board.yr] });
  t('доска: шапка колонки — одна строка (≤ 28 px)', Math.max(...gc.board.hdrRows) <= 28, gc.board.hdrRows);
  t('страница без горизонтальной прокрутки (обе плотности)', gc.board.docW <= gc.board.iw && gz.board.docW <= gz.board.iw, [gz.board.docW, gc.board.docW]);

  console.log('— B/C. ПК 1366×768, меню закреплено, 12 сотрудников —');
  for (const dens of ['cozy', 'compact']){
    p = await boot(br, { w: 1366, h: 768, mode: 'desktop', ls: { techlog_density: dens, techlog_menu_pin: '1' }, seed: { staff: 12, mine: 6 } });
    await go(p, 'home'); geo[dens].pcHome = await homeGeo(p);
    await go(p, 'board'); await p.waitForTimeout(500); geo[dens].pcBoard = await boardGeo(p);
    if (dens === 'compact'){
      await diag(p, 'ПК, компактно, доска');
      /* ▲▼ и серый приоритет — по наведению */
      const hov = await p.evaluate(() => { const c = document.querySelector('.bjob.has-brail'); const r = c.querySelector('.brail');
        return { before: getComputedStyle(r).display, box: c.getBoundingClientRect().toJSON() }; });
      await p.mouse.move(hov.box.x + hov.box.width / 2, hov.box.y + hov.box.height / 2); await p.waitForTimeout(250);
      const hov2 = await p.evaluate(() => { const c = document.querySelector('.bjob.has-brail'); const r = c.querySelector('.brail'), m = r.querySelector('.mv').getBoundingClientRect();
        return { after: getComputedStyle(r).display, mv: [Math.round(m.width), Math.round(m.height)], h: Math.round(c.getBoundingClientRect().height) }; });
      t('доска: ▲▼ в узкой колонке скрыты, по наведению — кнопки 24×24, высота карточки не меняется',
        hov.before === 'none' && hov2.after === 'flex' && hov2.mv[0] >= 24 && hov2.mv[1] >= 24 && hov2.h === Math.round(hov.box.height), [hov.before, hov2]);
      await p.mouse.move(5, 5);
      await go(p, 'home'); await diag(p, 'ПК, компактно, главная');
      const rl = await p.evaluate(() => { const c = document.querySelector('#day-list .item.has-rail'); return { d: getComputedStyle(c.querySelector('.rail')).display, box: c.getBoundingClientRect().toJSON() }; });
      await p.mouse.move(rl.box.x + rl.box.width / 2, rl.box.y + rl.box.height / 2); await p.waitForTimeout(250);
      const rl2 = await p.evaluate(() => { const c = document.querySelector('#day-list .item.has-rail'); const r = c.querySelector('.rail'), m = r.querySelector('.mv').getBoundingClientRect(), nr = c.querySelector('.row-num');
        return { d: getComputedStyle(r).display, mv: [Math.round(m.width), Math.round(m.height)], num: getComputedStyle(nr).visibility, h: Math.round(c.getBoundingClientRect().height),
          inside: r.getBoundingClientRect().bottom <= c.getBoundingClientRect().bottom + 0.5 }; });
      t('главная: ▲▼ по наведению на месте номера, 24×24, внутри карточки, высота та же',
        rl.d === 'none' && rl2.d === 'flex' && rl2.mv[0] >= 24 && rl2.mv[1] >= 24 && rl2.num === 'hidden' && rl2.inside && rl2.h === Math.round(rl.box.height), [rl.d, rl2]);
      await p.mouse.move(5, 5);
      const menu = await p.evaluate(() => { const b = document.querySelector('#app .tabbar'); return { sc: b.scrollHeight, cl: b.clientHeight, n: b.querySelectorAll('.tab').length }; });
      t('левое меню: все ' + menu.n + ' пунктов влезают в 768 px без прокрутки', menu.sc <= menu.cl + 1 && menu.n >= 15, menu);
      await go(p, 'settings'); await diag(p, 'ПК, компактно, настройки');
    }
    await p.context().close();
  }
  for (const dens of ['cozy', 'compact']){
    const b = geo[dens].pcBoard;
    t('[' + dens + '] доска НЕ под закреплённым меню (левый край ' + b.left + ' ≥ правого края меню ' + b.tabRight + ') и страница без горизонтальной прокрутки',
      b.tabVisible && !b.underMenu && b.docW <= b.iw && b.right <= b.iw, b);
  }
  t('компактная доска: колонка 96 px, целиком видно ≥ 11 сотрудников (было ' + gz.pcBoard.whole + ')',
    gc.pcBoard.colW === 96 && gc.pcBoard.whole >= 11 && gc.pcBoard.whole >= gz.pcBoard.whole + 2, [gz.pcBoard.colW, gz.pcBoard.whole, gc.pcBoard.colW, gc.pcBoard.whole]);
  t('компактная доска начинается выше (' + gc.pcBoard.top + ' против ' + gz.pcBoard.top + ') и текст не выходит за карточки',
    gc.pcBoard.top < gz.pcBoard.top - 60 && gc.pcBoard.spillN === 0, gc.pcBoard.spill);
  t('ПК 1366×768, главная: шапка ≤ 56 px; на первом экране целиком ≥ 5 карточек дня (было ' + gz.pcHome.whole + '); карточка задачи ≤ 76 px (было ' + Math.max(...gz.pcHome.jobH) + ')',
    gc.pcHome.top <= 56 && gc.pcHome.whole >= 5 && gc.pcHome.whole >= gz.pcHome.whole + 3 && Math.max(...gc.pcHome.jobH) <= 76, [gz.pcHome, gc.pcHome]);

  console.log('— C. широкая колонка (2 сотрудника): ▲▼ и приоритет на виду без наведения —');
  p = await boot(br, { w: 1366, h: 768, mode: 'desktop', ls: { techlog_density: 'compact' } });
  await go(p, 'board');
  const wide = await p.evaluate(() => { const c = document.querySelector('.bjob.has-brail'); if (!c) return null; const r = c.querySelector('.brail'), pr = c.querySelector('.pri.corner');
    const a = r.getBoundingClientRect(), m = c.querySelector('.bmain'), mr = m.getBoundingClientRect();
    const txt = [...m.querySelectorAll('b, .tiny, .bwt')].map(e => e.getBoundingClientRect().right);
    return { col: Math.round(c.closest('.bcol').getBoundingClientRect().width), rail: getComputedStyle(r).display, pri: pr ? getComputedStyle(pr).display : '-',
      clash: Math.max(...txt) > a.left + 0.5 && pr ? Math.max(...txt) > pr.getBoundingClientRect().left + 0.5 : Math.max(...txt) > a.left + 0.5 }; });
  t('колонка ≥ 170 px: ▲▼ стоят справа в ряд, серый приоритет виден, текст на них не наезжает',
    wide && wide.col >= 170 && wide.rail === 'flex' && wide.pri === 'grid' && !wide.clash, wide);
  await p.context().close();

  console.log('— C. окно 1100 px (маленький ноутбук): страница не теряет 124 px слева —');
  for (const dens of ['cozy', 'compact']){
    p = await boot(br, { w: 1100, h: 700, mode: 'desktop', ls: { techlog_density: dens }, seed: { staff: 12 } });
    await go(p, 'dirs');
    const a = await p.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(), tb = document.querySelector('#app .tabbar').getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), tab: Math.round(tb.right), docW: document.documentElement.scrollWidth }; });
    t('[' + dens + '] справочники: страница начинается сразу за меню (' + a.left + ' px, было 252) и не под ним', a.left >= a.tab && a.left <= 140 && a.docW <= 1100, a);
    await go(p, 'board'); await p.waitForTimeout(500);
    const b = await boardGeo(p);
    t('[' + dens + '] доска в окне 1100 px: в границах окна, без «+34 px»', b.right <= b.iw && b.docW <= b.iw && !b.underMenu, b);
    await p.context().close();
  }

  /* ================= D. холст ПК-режима ================= */
  console.log('— D. телефон 915×412 (альбом) в режиме «ПК»: холст 1100 —');
  p = await boot(br, { w: 915, h: 412, mode: 'desktop', touch: 1, mobile: 1, ls: { techlog_density: 'compact' }, seed: { staff: 12, boardCols: 10 } });
  let hv = await html(p);
  t('innerWidth ≈ 1100, класс tl-vscale, --vs ≈ 1.2, viewport width=1100', Math.abs(hv.iw - 1100) <= 3 && /tl-vscale/.test(hv.cls)
    && Math.abs(parseFloat(hv.vs) - 1.202) < 0.02 && /width=1100/.test(hv.vp) && /viewport-fit=cover/.test(hv.vp), hv);
  await go(p, 'board'); await p.waitForTimeout(500);
  let bg = await boardGeo(p);
  t('раскладка ПК: меню — колонка слева; доска во всю ширину холста, целиком видно ≥ 10 сотрудников («минимум сотрудников» = 10)',
    bg.vertical && bg.whole >= 10 && bg.right <= bg.iw && bg.docW <= bg.iw + 1 && bg.spillN === 0, bg);
  await diag(p, 'холст 1100, компактно, доска');
  await go(p, 'home'); await diag(p, 'холст 1100, компактно, главная');
  await go(p, 'settings');
  let cv = await p.evaluate(() => { const r = document.querySelector('#cv-row'); return r ? { d: r.querySelector('#cv-d').textContent,
    seg: [...r.querySelectorAll('.lang-seg button')].map(x => x.textContent.trim() + (x.classList.contains('on') ? '*' : '') + (x.disabled ? '!' : '')) } : null; });
  t('настройки: строка «ПК-режим на маленьком экране» — холст 1100 px, масштаб 83%; Авто выбрано; все ширины доступны (915/1920 = 48%)',
    cv && /1100/.test(cv.d) && /83%/.test(cv.d) && cv.seg.join(' ') === 'Авто* 1100 1280 1440 1600 1920 Выкл', cv);
  await p.click('#cv-row .lang-seg button:nth-child(3)'); await p.waitForTimeout(900);
  hv = await html(p);
  t('выбор 1280: innerWidth ≈ 1280, значение на устройстве, в профиль не пишется', Math.abs(hv.iw - 1280) <= 3
    && await p.evaluate(() => localStorage.getItem('techlog_pc_canvas') === '1280') && (await me(p)).pc_canvas === undefined, hv);
  await p.click('#cv-row .lang-seg button:last-child'); await p.waitForTimeout(900);
  hv = await html(p);
  t('«Выкл»: холста нет — device-width, innerWidth 915, класса tl-vscale нет', hv.iw === 915 && !/tl-vscale/.test(hv.cls) && /device-width/.test(hv.vp) && hv.vs === '', hv);
  await p.context().close();

  console.log('— D. подсказка при первом включении и возврат в «Телефон» —');
  p = await boot(br, { w: 915, h: 412, mode: 'desktop', touch: 1, mobile: 1 });
  await p.waitForTimeout(900);
  let hint = await p.evaluate(() => { const e = document.querySelector('#vm-canvas-hint'); if (!e) return null; const b = e.querySelector('button[data-a="phone"]').getBoundingClientRect();
    return { txt: e.textContent, btnH: Math.round(b.height), vis: visualViewport ? Math.round(b.height * visualViewport.scale) : 0 }; });
  t('подсказка: масштаб 83%, кнопка «Режим „Телефон“»; кнопка крупная — ≥ 40 px НА ЭКРАНЕ (с учётом уменьшения страницы)',
    hint && /83%/.test(hint.txt) && /Телефон/.test(hint.txt) && hint.vis >= 40, hint);
  await p.click('#vm-canvas-hint button[data-a="phone"]'); await p.waitForTimeout(900);
  hv = await html(p);
  t('кнопка вернула режим «Телефон»: device-width, 915 px, нет tl-desktop и tl-vscale, подсказка закрыта',
    hv.iw === 915 && !/tl-desktop|tl-vscale/.test(hv.cls) && /device-width/.test(hv.vp) && await p.evaluate(() => !document.querySelector('#vm-canvas-hint')
      && localStorage.getItem('techlog_view_mode') === 'mobile'), hv);
  await p.evaluate(() => window.App.setVm('desktop')); await p.waitForTimeout(1200);
  hv = await html(p);
  t('снова «ПК» в шапке: холст вернулся, подсказка второй раз за сессию не показывается',
    Math.abs(hv.iw - 1100) <= 3 && await p.evaluate(() => !document.querySelector('#vm-canvas-hint')), hv);
  await p.context().close();

  console.log('— D. тот же телефон в книжной ориентации: холста нет, доска слушается «минимум сотрудников» —');
  p = await boot(br, { w: 412, h: 915, mode: 'desktop', touch: 1, mobile: 1, ls: { techlog_density: 'compact' }, seed: { staff: 12, boardCols: 10 } });
  hv = await html(p);
  t('книжная: масштаб был бы 37% < 45% → холста нет, innerWidth 412', hv.iw === 412 && !/tl-vscale/.test(hv.cls) && /device-width/.test(hv.vp), hv);
  await go(p, 'board'); bg = await boardGeo(p);
  t('доска: колонка 96 px (не 232), целиком видно ≥ 3, во всю ширину окна, без вылета текста и прокрутки страницы',
    bg.colW === 96 && bg.whole >= 3 && bg.left <= 8 && bg.right >= bg.iw - 8 && bg.spillN === 0 && bg.docW <= bg.iw, bg);
  await diag(p, 'ПК-режим в узком окне, компактно, доска');
  await go(p, 'settings');
  cv = await p.evaluate(() => { const r = document.querySelector('#cv-row'); return r ? { d: r.querySelector('#cv-d').textContent,
    dis: [...r.querySelectorAll('.lang-seg button')].filter(x => x.disabled).map(x => x.textContent.trim()) } : null; });
  t('строка холста: «экран сейчас слишком узкий — поверните телефон», ширины недоступны', cv && /поверните/.test(cv.d) && cv.dis.length === 5, cv);
  await p.context().close();

  console.log('— D. предел читаемости, мышь, браузер без viewport —');
  p = await boot(br, { w: 844, h: 390, mode: 'desktop', touch: 1, mobile: 1, ls: { techlog_pc_canvas: '1920' } });
  hv = await html(p);
  t('844 px и выбор 1920 (44% < 45%): берётся ближайшая меньшая — 1600', Math.abs(hv.iw - 1600) <= 3, hv);
  await go(p, 'settings');
  t('в строке холста кнопка «1920» недоступна', await p.evaluate(() => [...document.querySelectorAll('#cv-row .lang-seg button')].find(x => x.textContent.trim() === '1920').disabled));
  await p.context().close();
  p = await boot(br, { w: 900, h: 700, mode: 'desktop' });
  hv = await html(p);
  t('мышь, окно 900 px: холста нет', hv.iw === 900 && !/tl-vscale/.test(hv.cls) && /device-width/.test(hv.vp), hv);
  await p.context().close();
  p = await boot(br, { w: 915, h: 412, mode: 'desktop', touch: 1, mobile: 0 });      // палец есть, а <meta viewport> браузер не слушает
  await p.waitForTimeout(2300);                                                        // решение — со второго замера (0.7 + 1.3 с)
  hv = await html(p);
  t('браузер игнорирует viewport → механизм выключился сам: нет tl-vscale, device-width, подсказки нет',
    !/tl-vscale/.test(hv.cls) && /device-width/.test(hv.vp) && await p.evaluate(() => !document.querySelector('#vm-canvas-hint')
      && window.TLView.canvasInfo().applicable === false), hv);
  await p.context().close();
  p = await boot(br, { w: 915, h: 412, mode: 'mobile', touch: 1, mobile: 1 });
  hv = await html(p);
  t('режим «Телефон» на том же экране: холста нет', hv.iw === 915 && !/tl-vscale/.test(hv.cls), hv);
  await p.context().close();

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('тест упал:', e); process.exit(2); });
