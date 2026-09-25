/* v1.09.52 — ещё 10 вариантов раскладки ТВ (всего 21) и 6 новых шаблонов: «Две панели поверх» (hud2), «Острова» (corners),
   «Док снизу» (dock), «Две строки» (bars), «Г-образная» (lshape), «Рамка» (frame); зеркальные варианты (колонка слева,
   лента сверху, вертикальный с блоками сверху) и «Карта и часы». Фильтр галереи по типу раскладки. Плитки сотрудников,
   которые не влезли, — «+N ещё» и честный счётчик в заголовке (раньше обрезались молча, «10 из 10»); в колонке со
   сжатыми плитками и маршрутами остаток колонки — маршрутам.
   Запуск: node tests/v1_09_52.js [порт]   (демо-копия с пустым config.js, как у остальных тестов) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const NEW = ['side_l', 'pano_top', 'hud2', 'corners', 'dock', 'clock', 'bars', 'lshape', 'frame', 'tower_top'];
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 900) : '')); } }

async function boot(br, who, w, h){
  const ctx = await br.newContext({ viewport: { width: w || 1920, height: h || 1080 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.request().url().includes('tile.openstreetmap.org') ? r.fulfill({ contentType: 'image/png', body: TILE }) : r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(700);
  await p.evaluate(u => { localStorage.clear(); if (u) localStorage.setItem('techlog_session_v1', u); localStorage.setItem('techlog_view_mode', 'desktop'); }, who);
  await p.reload();
  if (who) await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 });
  else await p.waitForFunction(() => window.App && document.querySelector('.login-wrap'), null, { timeout: 20000 });
  await p.waitForTimeout(500);
  return p;
}
/* синтетический день на 10 сотрудников — раскладки проверяются на настоящем объёме */
const SYNTH = () => {
  window.__synth = (nW) => {
    const names = ['Sergey V.', 'Ivan P.', 'Alexey S.', 'Dmitry K.', 'Maria L.', 'Oleg T.', 'Pavel R.', 'Nikolay B.', 'Anton G.', 'Yuri M.'].slice(0, nW || 10);
    const cx = []; for (let i = 0; i < 14; i++) cx.push({ id: 'cx' + i, name: 'Complex ' + i, abbr: 'C' + i, lat: 33.70 + (i % 5) * 0.07, lng: -84.55 + Math.floor(i / 5) * 0.12 + (i % 3) * 0.03 });
    const wts = (TV.feed.work_types && TV.feed.work_types.length ? TV.feed.work_types : [{ id: 'w1', name: 'STEAM CLEAN', color: '#FF9600' }]).slice(0, 6);
    const prof = names.map((n, i) => ({ id: 'p' + i, name: n, car_no: i + 1, role: 'tech' }));
    const jobs = []; let s = 0;
    prof.forEach((pp, i) => { for (let k = 0; k < 1 + (i % 3); k++) jobs.push({ id: 'j' + (s++), unit: String(100 + s * 7), complex_id: cx[(i + k * 3) % cx.length].id, work_type_id: wts[(i + k) % wts.length].id, technician_id: pp.id, status: 'draft', priority: false, sort_order: k, done: k === 0 && i % 4 === 0 }); });
    const pickups = []; for (let i = 0; i < 6; i++) pickups.push({ job_id: 'pk' + i, complex_id: cx[(i * 2 + 1) % cx.length].id, unit: String(300 + i), technician_id: prof[i % prof.length].id, equipment_type_id: (TV.feed.equipment_types[i % Math.max(1, TV.feed.equipment_types.length)] || {}).id, qty: 1 + (i % 3), due_date: TV.feed.date, overdue: i % 3 === 0 });
    TV.feed = { ...TV.feed, complexes: cx, profiles: prof, jobs, pickups, site_day: [], site_now: [],
      stat_day: prof.map((pp, i) => ({ id: pp.id, n: i % 4 })), stat_week: prof.map((pp, i) => ({ id: pp.id, n: 3 + (i * 7) % 11 })) };
    TV.bn = prof.map((pp, i) => ({ car_no: i + 1, driver_id: pp.id, run: i % 3 === 0, lat: 33.72 + (i % 4) * 0.06, lng: -84.50 + (i % 5) * 0.05, heading: i * 36, mi: 5 + i * 3.3, min: 30 + i * 9, n: 2 + i }));
  };
};
/* что на экране: доля карты, ничего не вылезает вбок, у блоков виден заголовок; плитки сотрудников — без скрытого
   переполнения, счётчик в заголовке = видимым плиткам, «+N ещё» = остальным */
const MEASURE = () => {
  const cfg = TV.eff, s = tvScr(), bad = [], sc = s.sim ? Math.min(innerWidth / s.w, innerHeight / s.h) : 1;
  document.querySelectorAll('.tvwrap .tvzm').forEach(z => { if (z.scrollWidth > z.clientWidth + 2) bad.push('вбок: ' + (z.id || z.className.split(' ')[0])); });
  document.querySelectorAll('.tvwrap .tvzm').forEach(z => { const zr = z.getBoundingClientRect();
    z.querySelectorAll(':scope .twg, :scope .tv-stats, :scope .tv-head').forEach(w => { const r = w.getBoundingClientRect(), vis = Math.min(r.bottom, zr.bottom) - Math.max(r.top, zr.top);
      if (vis < 30 * TV.geo.k * sc) bad.push('не виден: ' + (w.dataset.wid || w.className.split(' ')[0]) + ' ' + Math.round(vis)); }); });
  const hd = document.querySelector('.tv-head, .tv-tick'); if (hd && hd.scrollWidth > hd.clientWidth + 2) bad.push('шапка шире зоны');
  const all = tvWorkersAll().length, tiles = [];
  document.querySelectorAll('.tvwrap .twg-workers').forEach(w => { const box = w.querySelector('.twtiles'); if (!box) return;
    const n = box.querySelectorAll('.twtile:not(.tw-more)').length, more = box.querySelector('.tw-more'), head = (w.querySelector('.twg-h .tiny') || {}).textContent || '';
    const bb = box.getBoundingClientRect(), cut = [...box.children].some(x => x.getBoundingClientRect().bottom > bb.bottom + 1);
    tiles.push({ n, more: more ? more.textContent.replace(/\s+/g, ' ').trim() : '', head });
    if (box.scrollHeight > box.clientHeight + 2 || cut) bad.push('плитки обрезаны');
    if (!head.includes(n + ' ' + t('tv_of') + ' ' + all)) bad.push('счётчик: ' + head + ' / видно ' + n);
    if (n < Math.min(all, cfg.wTotal) && (!more || !more.textContent.includes('+' + (all - n)))) bad.push('нет «+' + (all - n) + '»');
    if (n >= Math.min(all, cfg.wTotal) && more) bad.push('лишнее «+N»'); });
  return { lay: TV.geo.lay, k: TV.geo.k, exp: tvShareFor(cfg, s.w, s.h), now: tvShareNow(), bad, tiles };
};

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* ---------- 1. логика: новые шаблоны и варианты ---------- */
  console.log('1. Логика: новые шаблоны и варианты');
  { const p = await boot(br, 'demo-admin');
    const L = await p.evaluate(NEW => {
      const W = 1920, H = 1080, ids = TV_PRESETS.map(x => x.id);
      const cfgOf = id => tvRefCfg('p:' + id, tvCfgParse('{}'));
      const G = (id, w, h) => tvGeom(cfgOf(id), w || W, h || H), GF = (id, w, h) => tvGeom(tvCfgNorm({ ...cfgOf(id), flip: 1 }), w || W, h || H);
      const inter = (a, b) => !!(a && b) && Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0;
      const c = G('corners'), cf = GF('corners');
      const corners = { lay: c.lay, full: c.map.x === 0 && c.map.y === 0 && c.map.w === W && c.map.h === H,
        h: !!c.h && c.h.x < W / 4 && c.h.y < H / 4, a: !!c.a && c.a.x + c.a.w > W * 0.75 && c.a.y < H / 4,
        a2: !!c.a2 && c.a2.x + c.a2.w > W * 0.75 && c.a2.y + c.a2.h > H * 0.75, b: !!c.b && c.b.x < W / 4 && c.b.y + c.b.h > H * 0.75,
        gap: !!(c.a && c.a2) && c.a2.y - (c.a.y + c.a.h) > 100, sep: ![c.h, c.a, c.a2, c.b].some((x, i, arr) => arr.some((y, j) => j > i && inter(x, y))),
        split: c.splitA, headA: c.headA, flip: cf.h.x + cf.h.w > W * 0.75 && cf.a.x < W / 4 && cf.a2.x < W / 4 && cf.b.x + cf.b.w > W * 0.75 };
      const k = G('clock'), clock = { lay: k.lay, h: !!k.h, rest: !!(k.a || k.a2 || k.b || k.tick), share: tvShareFor(cfgOf('clock'), W, H) };
      const h2 = G('hud2', 2560, 1080), h2f = GF('hud2', 2560, 1080);
      const hud2 = { lay: h2.lay, full: h2.map.w === 2560 && h2.map.h === 1080, sides: h2.a.x > 1280 && h2.b.x + h2.b.w < 1280, tall: h2.a.h > 1000 && h2.b.h > 1000,
        dirB: h2.dirB, headA: h2.headA, flip: h2f.a.x < 1280 && h2f.b.x > 1280,
        one: tvGeom(tvCfgNorm({ lay: 'hud2', chDay: 0, chWeek: 0, chMi: 0, route: 0 }), W, H).lay };
      const d = G('dock'), df = GF('dock');
      const dock = { full: d.map.w === W && d.map.h === H, bottom: d.a.y + d.a.h >= H - d.p - 1 && d.a.w >= W - 2 * d.p - 1, top: df.a.y <= df.p + 1, dir: d.dirA, merge: d.mergeB, hPct: Math.round(d.a.h / H * 100) };
      const b = G('bars'), bf = GF('bars');
      const bars = { order: b.tick.y < b.map.y && b.map.y < b.a.y, orderF: bf.a.y < bf.map.y && bf.map.y < bf.tick.y, headA: b.headA, dir: b.dirA, fullW: b.tick.w === b.map.w && b.map.w === b.a.w };
      const l = G('lshape'), lf = GF('lshape');
      const lshape = { tick: l.tick.y < l.map.y && l.tick.w > W * 0.9, col: l.a.x > l.map.x && l.a.y === l.map.y, flip: lf.a.x < lf.map.x && lf.tick.w > W * 0.9, headA: l.headA };
      const f = G('frame');
      const frame = { tick: f.tick.y < f.map.y, under: !!f.b && f.b.y > f.map.y && f.b.x === f.map.x && f.b.w === f.map.w, col: f.a.x > f.map.x, headA: f.headA,
        toL: tvGeom(tvCfgNorm({ lay: 'frame', chDay: 0, chWeek: 0, chMi: 0 }), W, H).lay };
      const sl = G('side_l'), pt = G('pano_top'), tt = G('tower_top', 1080, 1920);
      const mirrors = { side_l: sl.lay === 'side' && sl.a.x < sl.map.x, pano_top: pt.lay === 'strip' && pt.a.y < pt.map.y, tower_top: tt.lay === 'strip' && tt.port && tt.a.y < tt.map.y };
      const own = NEW.map(id => { const pr = TV_PRESETS.find(x => x.id === id), port = pr.scr.includes('port'), wide = pr.scr[0] === 'wide';
        const w = port ? 1080 : wide ? 2560 : 1920, h = port ? 1920 : 1080, cfg = cfgOf(id); return { id, want: cfg.share, got: tvShareFor(cfg, w, h) }; });
      const svgC = tvSchemeSvg(cfgOf('corners'), 160, 90), svgL = tvSchemeSvg(cfgOf('lshape'), 160, 90), svgD = tvSchemeSvg(cfgOf('dock'), 160, 90);
      const scheme = { cOp: (svgC.match(/fill-opacity/g) || []).length, lRects: (svgL.match(/<rect/g) || []).length, dOp: (svgD.match(/fill-opacity/g) || []).length };
      const i18n = NEW.every(id => ['tvp_' + id, 'tvp_' + id + '_d'].every(x => x in I18N.ru && x in I18N.en && !/[А-Яа-яЁё]/.test(I18N.en[x])))
        && ['hud2', 'corners', 'dock', 'bars', 'lshape', 'frame'].every(x => ('tvl_' + x) in I18N.ru && ('tvl_' + x) in I18N.en)
        && ['all'].concat(TV_GRPS).every(g => ('tvg_' + g) in I18N.ru && ('tvg_' + g) in I18N.en);
      const zt = {}; for (const lay of ['hud2', 'corners', 'dock', 'bars', 'lshape', 'frame']) zt[lay] = tvZoneTitles(tvCfgNorm({ lay }));
      zt.cornersF = tvZoneTitles(tvCfgNorm({ lay: 'corners', flip: 1 })); zt.hud2F = tvZoneTitles(tvCfgNorm({ lay: 'hud2', flip: 1 }));
      const grp = {}; TV_PRESETS.forEach(x => { grp[x.grp] = (grp[x.grp] || 0) + 1; });
      return { n: ids.length, has: NEW.every(id => ids.includes(id)), lays: ['hud2', 'corners', 'dock', 'bars', 'lshape', 'frame'].every(x => TV_LAYS.includes(x)),
        grps: TV_PRESETS.every(x => TV_GRPS.includes(x.grp)), grp, float: ['hud2', 'corners', 'dock'].every(x => TV_FLOAT.includes(x)),
        corners, clock, hud2, dock, bars, lshape, frame, mirrors, own, scheme, i18n, zt };
    }, NEW);
    t(`вариантов стало ${L.n} (было 11): все 10 новых на месте, id разные`, L.n >= 21 && L.has, L.n);
    t('6 новых шаблонов в списке «Шаблон»; у каждого варианта группа галереи (с колонкой / с лентой / поверх карты / со строками / под экран)', L.lays && L.grps && L.float && Object.keys(L.grp).length === 5, L.grp);
    t('названия и описания новых вариантов, шаблонов и групп — RU и EN (в EN без кириллицы)', L.i18n);
    t('«Острова»: карта на весь экран, часы — карточкой слева сверху, сводка справа сверху, сотрудники справа снизу, маршруты слева снизу; между островами — карта',
      L.corners.lay === 'corners' && L.corners.full && L.corners.h && L.corners.a && L.corners.a2 && L.corners.b && L.corners.gap && L.corners.sep && L.corners.split === 1 && L.corners.headA === false, L.corners);
    t('«Острова» зеркально: часы справа, острова со сводкой и сотрудниками — слева, маршруты — справа внизу', L.corners.flip, L.corners);
    t('«Карта и часы»: только карточка с часами поверх карты, карта ≥ 95% экрана', L.clock.lay === 'corners' && L.clock.h && !L.clock.rest && L.clock.share >= 95, L.clock);
    t('«Две панели поверх» (21:9): панели справа (с часами) и слева во всю высоту; зеркально — наоборот; без второй панели — обычная «поверх карты»',
      L.hud2.lay === 'hud2' && L.hud2.full && L.hud2.sides && L.hud2.tall && L.hud2.dirB === 'col' && L.hud2.headA && L.hud2.flip && L.hud2.one === 'hud', L.hud2);
    t('«Док снизу»: карта на весь экран, полоса во всю ширину снизу (зеркально — сверху), блоки в ряд, высота полосы 20–40% экрана',
      L.dock.full && L.dock.bottom && L.dock.top && L.dock.dir === 'row' && L.dock.merge && L.dock.hPct >= 20 && L.dock.hPct <= 40, L.dock);
    t('«Две строки»: сверху строка счётчиков, в середине карта, снизу строка сотрудников; зеркально — наоборот; часы в строке, а не в зоне',
      L.bars.order && L.bars.orderF && L.bars.headA === false && L.bars.dir === 'row' && L.bars.fullW, L.bars);
    t('«Г-образная»: строка во всю ширину сверху, под ней карта и колонка справа (зеркально — слева), часы в строке', L.lshape.tick && L.lshape.col && L.lshape.flip && L.lshape.headA === false, L.lshape);
    t('«Рамка»: строка сверху, колонка справа, полоса под картой той же ширины; без блоков для полосы — «Г-образная»', L.frame.tick && L.frame.under && L.frame.col && L.frame.headA === false && L.frame.toL === 'lshape', L.frame);
    t('зеркальные варианты: «Колонка слева», «Лента сверху», «Вертикальный: блоки сверху»', L.mirrors.side_l && L.mirrors.pano_top && L.mirrors.tower_top, L.mirrors);
    t('на своём экране каждый новый вариант даёт заданную долю карты (не меньше, −3%)', L.own.every(o => o.got >= o.want - 3 && o.got >= 58), L.own);
    t('схема-миниатюра: у «Островов» 4 полупрозрачные карточки поверх карты, у «Дока» — полоса, у «Г-образной» — строка, колонка и блоки', L.scheme.cOp >= 4 && L.scheme.dOp >= 1 && L.scheme.lRects >= 6, L.scheme);
    const zt = L.zt;
    t('конструктор называет зоны по шаблону: панели справа/слева, острова, полоса дока, строка статусов, колонка «Г» и «Рамки»',
      /справа/i.test(zt.hud2[0]) && /слева/i.test(zt.hud2[1]) && /справа/i.test(zt.corners[0]) && /слева внизу/i.test(zt.corners[1]) && /слева/i.test(zt.cornersF[0]) && /справа внизу/i.test(zt.cornersF[1])
      && /слева/i.test(zt.hud2F[0]) && /Полоса/.test(zt.dock[0]) && /Строка статусов/.test(zt.bars[0]) && zt.lshape[0] !== zt.lshape[1] && zt.frame[0] !== zt.frame[1], zt);
    t('без ошибок страницы (логика)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 2. новые варианты на живом экране ---------- */
  console.log('2. Новые варианты на экране: 1920×1080, 1366×768, 2560×1080, 1080×1920, 3840×2160, 1024×768');
  for (const [W, H] of [[1920, 1080], [1366, 768], [2560, 1080], [1080, 1920], [3840, 2160], [1024, 768]]){
    const p = await boot(br, 'demo-admin', W, H);
    await p.evaluate(SYNTH);
    await p.evaluate(() => { App.tvTest(); }); await p.waitForTimeout(600);
    await p.evaluate(() => { clearInterval(TV.tm.test); TV.tm.test = 0; __synth(10); tvRepaint(); });
    const res = [], ids = await p.evaluate(() => TV_PRESETS.map(x => x.id));
    for (const id of ids){
      await p.evaluate(ref => App.tvPrevSet(ref), 'p:' + id); await p.waitForTimeout(350);
      res.push({ id, ...(await p.evaluate(MEASURE)) });
    }
    const nw = res.filter(r => NEW.includes(r.id)), low = nw.filter(r => r.now < 50 || Math.abs(r.now - r.exp) > 1), probs = res.filter(r => r.bad.length);
    t(`${W}×${H}: у 10 новых вариантов карта на экране ≥ 50% и совпадает с расчётом (±1%)`, nw.length === 10 && !low.length, low.map(r => [r.id, r.exp, r.now]));
    t(`${W}×${H}: у всех ${res.length} вариантов блоки не вылезают вбок, заголовки видны, плитки сотрудников не обрезаны молча (счётчик и «+N ещё» честные)`, !probs.length, probs.map(r => [r.id, r.bad.slice(0, 3)]));
    if (W === 1920){
      /* масштаб карты подгоняется под рамку НОВОГО варианта, даже при быстрой смене (раньше — под прежний размер, точки мелкие) */
      const FIT = () => { const { pts } = tvDayItems(), b = pts.map(q => [+q.cx.lat, +q.cx.lng]).concat((TV.bn || []).filter(c => c.lat != null).map(c => [c.lat, c.lng]));
        const pad = tvFitPad(); return { lay: TV.geo.lay, zoom: TV.map.getZoom(), bz: Math.min(13, TV.map.getBoundsZoom(L.latLngBounds(b), false, L.point(pad.paddingTopLeft).add(pad.paddingBottomRight))) }; };
      await p.evaluate(() => App.tvPrevSet('p:classic')); await p.waitForTimeout(500);
      await p.evaluate(() => App.tvPrevSet('p:dock')); await p.waitForTimeout(500);
      const z1 = await p.evaluate(FIT);
      await p.evaluate(() => { App.tvPrevSet('p:hud'); App.tvPrevSet('p:corners'); App.tvPrevSet('p:panorama'); }); await p.waitForTimeout(700);
      const z2 = await p.evaluate(FIT);
      t('смена варианта: масштаб карты — под рамку и панели нового варианта (Классика → Док; быстро Во весь экран → Острова → Панорама)', z1.lay === 'dock' && z1.zoom === z1.bz && z2.lay === 'strip' && z2.zoom === z2.bz, { z1, z2 });
      /* устройство новых шаблонов на экране */
      await p.evaluate(() => App.tvPrevSet('p:corners')); await p.waitForTimeout(400);
      const c = await p.evaluate(() => { const q = s => document.querySelector(s), ids = s => [...document.querySelectorAll(s + ' [data-wid]')].map(x => x.dataset.wid).join(',');
        const lg = q('.tvwrap .tv-legend').getBoundingClientRect(), boxes = ['.tva-h', '.tva-a', '.tva-a2', '.tva-b'].map(s => q('.tvwrap ' + s).getBoundingClientRect());
        const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0;
        return { cls: q('.tvwrap').className, head: !!q('.tva-h .tv-head'), headA: !!q('.tva-a .tv-head'), a: ids('.tva-a'), a2: ids('.tva-a2'), b: ids('.tva-b'),
          sep: !boxes.some((x, i) => boxes.some((y, j) => j > i && inter(x, y))), lgc: Math.round(lg.left + lg.width / 2), lgt: Math.round(lg.top),
          panel: getComputedStyle(q('.tva-a .tv-rail')).backgroundColor }; });
      t('1920×1080 «Острова»: часы — отдельной карточкой, сводка / сотрудники / маршруты по своим углам, карточки не налезают, легенда сверху по центру, без общей подложки',
        /tvl-corners/.test(c.cls) && c.head && !c.headA && c.a === 'cards' && c.a2 === 'workers' && c.b === 'route' && c.sep && Math.abs(c.lgc - 960) < 40 && c.lgt < 60 && /rgba\(0, 0, 0, 0\)|transparent/.test(c.panel), c);
      await p.evaluate(() => App.tvPrevSet('p:clock')); await p.waitForTimeout(400);
      const k = await p.evaluate(() => ({ h: !!document.querySelector('.tvwrap .tva-h .tv-head'), a: !!document.querySelector('.tvwrap .tva-a'), a2: !!document.querySelector('.tvwrap .tva-a2'),
        b: getComputedStyle(document.querySelector('.tvwrap .tva-b')).display, share: tvShareNow() }));
      t('«Карта и часы»: на экране только карта и карточка с часами (≥ 95%)', k.h && !k.a && !k.a2 && k.b === 'none' && k.share >= 95, k);
      await p.evaluate(() => App.tvPrevSet('p:bars')); await p.waitForTimeout(400);
      const b = await p.evaluate(() => { const q = s => document.querySelector(s), tk = q('.tvwrap .tva-tick'), a = q('.tvwrap .tva-a'), m = q('.tvwrap .tva-map');
        return { chips: document.querySelectorAll('.tva-tick .tt-chip').length, clk: !!q('.tva-tick #tv-clk'), order: tk.getBoundingClientRect().top < m.getBoundingClientRect().top && m.getBoundingClientRect().bottom <= a.getBoundingClientRect().top + 1,
          a: [...a.querySelectorAll('[data-wid]')].map(x => x.dataset.wid).join(','), headA: !!a.querySelector('.tv-head'), wh: getComputedStyle(a.querySelector('.twg-workers .twg-h')).display }; });
      t('«Две строки»: верхняя строка — счётчики и часы, внизу — только плитки сотрудников (без заголовка), карта между ними', b.chips >= 5 && b.clk && b.order && b.a === 'workers' && !b.headA && b.wh === 'none', b);
      await p.evaluate(() => App.tvPrevSet('p:lshape')); await p.waitForTimeout(400);
      const l = await p.evaluate(() => { const w = document.querySelector('.tva-a .twg-workers'), r = document.querySelector('.tva-a .twg-route'), col = document.getElementById('tv-zrail');
        const last = w.lastElementChild.getBoundingClientRect(), wr = w.getBoundingClientRect();
        return { tick: !!document.querySelector('.tva-tick .tt-chips'), headA: !!document.querySelector('.tva-a .tv-head'), a: [...col.children].map(x => x.dataset.wid).join(','),
          more: !!w.querySelector('.tw-more'), head: w.querySelector('.twg-h .tiny').textContent, gap: Math.round(wr.bottom - last.bottom), rh: +(r.getBoundingClientRect().height / col.getBoundingClientRect().height).toFixed(2) }; });
      t('«Г-образная»: строка сверху, в колонке сотрудники и маршруты; все 10 плиток без «+N», карточка сотрудников по содержимому, остаток колонки — маршрутам',
        l.tick && !l.headA && l.a === 'workers,route' && !l.more && /10 из 10/.test(l.head) && l.gap < 30 && l.rh > 0.35, l);
      await p.evaluate(() => App.tvPrevSet('p:frame')); await p.waitForTimeout(400);
      const f = await p.evaluate(() => ({ b: [...document.querySelectorAll('.tva-b [data-wid]')].map(x => x.dataset.wid).join(','), tick: !!document.querySelector('.tva-tick .tt-chips'),
        under: (() => { const m = document.querySelector('.tva-map').getBoundingClientRect(), b = document.querySelector('.tva-b').getBoundingClientRect(); return b.top >= m.bottom - 1 && Math.abs(b.left - m.left) < 2 && Math.abs(b.width - m.width) < 2; })() }));
      t('«Рамка»: строка сверху, под картой — три графика той же ширины, что и карта', f.tick && f.under && f.b === 'chDay,chWeek,chMi', f);
      await p.evaluate(() => App.tvPrevSet('p:dock')); await p.waitForTimeout(400);
      const d = await p.evaluate(() => { const a = document.querySelector('.tvwrap .tva-a').getBoundingClientRect(), lg = document.querySelector('.tvwrap .tv-legend').getBoundingClientRect(), fs = document.querySelector('.tvwrap .tv-fsbtn').getBoundingClientRect();
        const w = document.querySelector('.tva-a .twg-workers'), box = w.querySelector('.twtiles'), n = box.querySelectorAll('.twtile:not(.tw-more)').length;
        return { bottom: a.bottom >= innerHeight - 14 && a.width > innerWidth * 0.95, lg: lg.bottom < a.top && lg.top < 60, fs: fs.bottom < a.top && fs.top < 80, head: !!document.querySelector('.tva-a .tv-head'),
          n, more: (box.querySelector('.tw-more') || {}).textContent || '', cnt: w.querySelector('.twg-h .tiny').textContent, cols: getComputedStyle(box).gridTemplateColumns.split(' ').length, upd: getComputedStyle(w.querySelector('.tv-upd')).display }; });
      t('«Док снизу»: полоса во всю ширину внизу с часами, легенда и «На весь экран» — сверху, над полосой', d.bottom && d.lg && d.fs && d.head, d);
      t('«Док снизу»: сотрудники — в 3 колонки; не влезшие — последней плиткой «+N ещё», в заголовке столько, сколько видно', d.cols >= 3 && d.n >= 5 && d.more.replace(/\s+/g, '') === `+${10 - d.n}ещё` && d.cnt.includes(`${d.n} из 10`) && d.upd === 'none', d);
      await p.evaluate(() => App.tvPrevSet('p:classic')); await p.waitForTimeout(400);
      const cl = await p.evaluate(() => { const w = document.querySelector('#tv-zrail .twg-workers'); return { n: w.querySelectorAll('.twtile:not(.tw-more)').length, more: (w.querySelector('.tw-more') || {}).textContent || '', cnt: w.querySelector('.twg-h .tiny').textContent }; });
      t('«Классика» (как было): плитки, что не влезли, — «+N ещё» вместо молча обрезанных, заголовок «N из 10»', cl.n >= 3 && cl.n < 10 && cl.more.includes('+' + (10 - cl.n)) && cl.cnt.includes(cl.n + ' из 10'), cl);
    }
    if (W === 2560){
      await p.evaluate(() => App.tvPrevSet('p:hud2')); await p.waitForTimeout(400);
      const h = await p.evaluate(() => { const a = document.querySelector('.tvwrap .tva-a').getBoundingClientRect(), b = document.querySelector('.tvwrap .tva-b').getBoundingClientRect();
        return { cls: document.querySelector('.tvwrap').className, head: !!document.querySelector('.tva-a .tv-head'), right: a.left > 1280, left: b.right < 1280, bcol: document.querySelector('#tv-zbot').classList.contains('dir-col'),
          b: [...document.querySelectorAll('#tv-zbot > [data-wid]')].map(x => x.dataset.wid).join(','), lgc: (r => Math.round(r.left + r.width / 2))(document.querySelector('.tvwrap .tv-legend').getBoundingClientRect()) }; });
      t('2560×1080 «Две панели поверх»: справа — часы, сводка и сотрудники, слева — маршруты и графики столбиком, легенда по центру между панелями',
        /tvl-hud2/.test(h.cls) && h.head && h.right && h.left && h.bcol && /^route,chDay/.test(h.b) && Math.abs(h.lgc - 1280) < 40, h);
    }
    if (W === 1080){
      await p.evaluate(() => App.tvPrevSet('p:tower_top')); await p.waitForTimeout(400);
      const v = await p.evaluate(() => ({ port: document.querySelector('.tvwrap').classList.contains('tvl-port'), above: document.querySelector('.tvwrap .tva-a').getBoundingClientRect().bottom <= document.querySelector('.tvwrap .tva-map').getBoundingClientRect().top + 1, share: tvShareNow() }));
      t('1080×1920 «Вертикальный: блоки сверху»: блоки над картой, карта ≥ 55%', v.port && v.above && v.share >= 55, v);
    }
    t(`${W}×${H}: без ошибок страницы`, !p.errs.length, p.errs);
    await p.context().close();
  }

  /* ---------- 3. настройки админа: фильтр галереи, применение нового варианта, конструктор ---------- */
  console.log('3. Настройки админа: фильтр галереи и новые шаблоны');
  { const p = await boot(br, 'demo-admin', 1366, 900);
    await p.evaluate(() => { foldSet('tvc', true); App.go('settings'); }); await p.waitForTimeout(400);
    const chips = () => p.evaluate(() => ({ f: [...document.querySelectorAll('#tvg-f .tvg-fb')].map(b => [b.dataset.g, +b.querySelector('span').textContent, b.classList.contains('on')]),
      cards: [...document.querySelectorAll('#tvg-grid .tvg-card')].map(c => c.dataset.p), hscroll: document.documentElement.scrollWidth > innerWidth + 1 }));
    const g0 = await chips(), n = await p.evaluate(() => TV_PRESETS.length);
    const sum = g0.f.slice(1).reduce((s, x) => s + x[1], 0);
    t('над галереей — фильтр: «Все» и 5 групп со счётчиками (сумма групп = всем вариантам), по умолчанию «Все», в галерее все варианты',
      g0.f.length === 6 && g0.f[0][0] === 'all' && g0.f[0][1] === n && g0.f[0][2] && sum === n && g0.cards.length === n && !g0.hscroll, g0);
    await p.evaluate(() => App.tvcGalF('over')); await p.waitForTimeout(300);
    const g1 = await chips(), over = await p.evaluate(() => TV_PRESETS.filter(x => x.grp === 'over').map(x => x.id));
    t('«Поверх карты»: в галерее только варианты этой группы (в т.ч. «Острова», «Док», «Две панели», «Карта и часы»), кнопка группы отмечена',
      JSON.stringify(g1.cards) === JSON.stringify(over) && ['hud2', 'corners', 'dock', 'clock'].every(x => g1.cards.includes(x)) && g1.f.find(x => x[0] === 'over')[2], { g1, over });
    await p.evaluate(() => App.tvcGalF('bars')); await p.waitForTimeout(300);
    const g2 = await chips();
    t('«Со строками»: «Только карта», «Две строки», «Г-образная», «Рамка»', ['ticker', 'bars', 'lshape', 'frame'].every(x => g2.cards.includes(x)) && g2.cards.length === 4, g2.cards);
    await p.evaluate(() => App.tvcGalF('<script>')); await p.waitForTimeout(300);
    const g3 = await chips();
    t('неизвестная группа — снова «Все»', g3.cards.length === n && g3.f[0][2], g3.f);
    await p.evaluate(() => App.tvcPreset('corners')); await p.waitForTimeout(400);
    const a1 = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); return { lay: c.lay, share: c.share, preset: c.preset, zr: c.zones.rail.join(','), zb: c.zones.bottom.join(','), ch: [c.chDay, c.chWeek, c.chMi].join(''),
      on: !!document.querySelector('.tvg-card.on[data-p="corners"]'), sel: (document.getElementById('tvc-lay') || {}).value, titles: [...document.querySelectorAll('.tvz-t')].map(x => x.textContent) }; });
    t('«Применить» «Острова»: в org_settings.tv — шаблон corners, 76% карты, сводка+сотрудники справа, маршруты слева, без графиков; конструктор называет зоны «Карточки справа…» / «Карточка слева внизу»',
      a1.lay === 'corners' && a1.share === 76 && a1.preset === 'p:corners' && /^cards,workers/.test(a1.zr) && /^route/.test(a1.zb) && a1.ch === '000' && a1.on && a1.sel === 'corners' && /справа/i.test(a1.titles[0]) && /слева внизу/i.test(a1.titles[1]), a1);
    await p.evaluate(() => App.tvcLay('dock')); await p.waitForTimeout(300);
    const a2 = await p.evaluate(() => ({ flip: document.getElementById('tvc-flip').parentElement.textContent, t0: (document.querySelector('.tvz-t') || {}).textContent, lay: tvCfgParse(state.data.org_settings.tv).lay }));
    t('шаблон «Док снизу»: у «Зеркально» подпись про верх/низ, зоны конструктора — «Полоса…»', a2.lay === 'dock' && /сверху/i.test(a2.flip) && /Полоса/.test(a2.t0), a2);
    await p.evaluate(() => App.tvcLay('lshape')); await p.waitForTimeout(300);
    const a3 = await p.evaluate(() => ({ flip: document.getElementById('tvc-flip').parentElement.textContent, share: document.getElementById('tvc-share-now').textContent }));
    t('шаблон «Г-образная»: «Зеркально» — колонка слева; строка «на 1920×1080» показывает долю карты', /слева/i.test(a3.flip) && /\d+%/.test(a3.share), a3);
    await p.evaluate(() => App.tvcReset()); await p.waitForTimeout(300);
    t('без ошибок страницы (настройки)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 4. менеджер: новые варианты — только посмотреть ---------- */
  console.log('4. Менеджер');
  { const p = await boot(br, 'demo-manager', 1600, 900);
    await p.evaluate(() => { foldSet('tvc', true); App.go('settings'); }); await p.waitForTimeout(400);
    const before = await p.evaluate(() => state.data.org_settings.tv || '');
    const m = await p.evaluate(() => ({ f: document.querySelectorAll('#tvg-f .tvg-fb').length, cards: document.querySelectorAll('#tvg-grid .tvg-card').length, apply: document.querySelectorAll('#tvg-grid button[onclick^="App.tvcPreset"]').length }));
    t('у менеджера тоже фильтр и все варианты, но без «Применить»', m.f === 6 && m.cards >= 21 && m.apply === 0, m);
    await p.evaluate(() => App.tvcGalF('over')); await p.waitForTimeout(300);
    await p.click('#tvg-grid .tvg-card[data-p="corners"] button'); await p.waitForTimeout(900);
    const v = await p.evaluate(() => ({ tv: !!document.querySelector('.tvwrap'), lay: TV.geo && TV.geo.lay, apply: !!document.getElementById('tvt-apply'), opts: document.querySelectorAll('#tvt-prev option').length, share: tvShareNow() }));
    t('«Посмотреть» «Острова» у менеджера: вариант на своём экране, в полоске проверки все варианты, без «Применить на все ТВ»', v.tv && v.lay === 'corners' && !v.apply && v.opts >= 22 && v.share >= 70, v);
    await p.evaluate(() => App.tvTestStop()); await p.waitForTimeout(400);
    t('раскладка телевизоров не изменилась', await p.evaluate(b => (state.data.org_settings.tv || '') === b, before));
    t('без ошибок страницы (менеджер)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 5. телевизор без входа с новым шаблоном ---------- */
  console.log('5. Телевизор (демо, без входа)');
  for (const [W, H, id, lay] of [[1920, 1080, 'corners', 'corners'], [1920, 1080, 'bars', 'bars'], [2560, 1080, 'hud2', 'hud2']]){
    const p = await boot(br, null, W, H);
    await p.evaluate(id => { const d = loadLocal() || seedDemoData(); const c = tvCfgNorm({ ...tvLayoutPick(TV_PRESETS.find(x => x.id === id).cfg), preset: 'p:' + id });
      d.org_settings = { ...(d.org_settings || {}), tv: JSON.stringify(c) }; state.data = d; saveLocalNow(); }, id);
    await p.locator('button', { hasText: /режим телевизора/i }).first().click();
    await p.waitForSelector('.tvwrap', { timeout: 5000 }); await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ lay: TV.geo.lay, share: tvShareNow(), bar: !!document.getElementById('tv-testbar'), map: !!document.querySelector('#tv-map.leaflet-container'),
      clk: !!document.getElementById('tv-clk') }));
    t(`${W}×${H}: телевизор показывает «${id}» из общей раскладки, карта ≥ 60%, часы на экране, полоски проверки нет`, r.lay === lay && r.share >= 60 && !r.bar && r.map && r.clk, r);
    t(`${W}×${H}: без ошибок страницы (телевизор, ${id})`, !p.errs.length, p.errs);
    await p.context().close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
