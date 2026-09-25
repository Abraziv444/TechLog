/* v1.09.51 — варианты раскладки ТВ-экрана: 11 готовых вариантов, доля карты (% площади), масштаб от Full HD,
   зеркало, профили ручной настройки, правила «под разрешение экрана», личная кнопка «ТВ» в меню у админа и
   менеджера, полоска проверки (вариант, разрешение, доля карты, «Применить на все ТВ»), менеджер — только просмотр.
   Условие заказчика — карта занимает основную площадь: проверяется для КАЖДОГО варианта на КАЖДОМ разрешении
   (1280×720 … 3840×2160, 21:9, 4:3, вертикальный 9:16) и по геометрии, и по живому экрану.
   Запуск: node tests/v1_09_51.js [порт]   (демо-копия с пустым config.js, как у остальных тестов) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
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
/* синтетический день на 10 сотрудников — чтобы раскладки проверялись на настоящем объёме */
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
/* что на экране: доля карты, зоны не вылезают вбок, у каждого блока виден хотя бы заголовок */
const MEASURE = () => {
  const cfg = TV.eff, s = tvScr(), bad = [];
  document.querySelectorAll('.tvwrap .tvzm').forEach(z => { if (z.scrollWidth > z.clientWidth + 2) bad.push('вбок: ' + (z.id || z.className.split(' ')[0])); });
  document.querySelectorAll('.tvwrap .tvzm').forEach(z => { const zr = z.getBoundingClientRect();
    z.querySelectorAll(':scope .twg, :scope .tv-stats, :scope .tv-head').forEach(w => { const r = w.getBoundingClientRect(), vis = Math.min(r.bottom, zr.bottom) - Math.max(r.top, zr.top);
      if (vis < 30 * TV.geo.k * (tvScr().sim ? Math.min(innerWidth / s.w, innerHeight / s.h) : 1)) bad.push('не виден: ' + (w.dataset.wid || w.className.split(' ')[0]) + ' ' + Math.round(vis)); }); });
  const hd = document.querySelector('.tv-head, .tv-tick'); if (hd && hd.scrollWidth > hd.clientWidth + 2) bad.push('шапка шире зоны');
  return { lay: TV.geo.lay, k: TV.geo.k, exp: tvShareFor(cfg, s.w, s.h), now: tvShareNow(), bad };
};

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* ---------- 1. логика: разбор, варианты, геометрия, классы экрана ---------- */
  console.log('1. Логика раскладки');
  { const p = await boot(br, 'demo-admin');
    const L = await p.evaluate(() => {
      const legacy = tvCfgParse(JSON.stringify({ map: 1, cardJobs: 1, cardPk: 1, workers: 1, chDay: 1, chWeek: 0, chMi: 1, wMode: 'auto', wTotal: 10, wScreen: 6, zones: { rail: ['cards', 'workers'], bottom: ['chDay', 'chMi'] } }));
      const clamp = tvCfgParse(JSON.stringify({ lay: 'foo', share: 10, scale: 5, flip: 'yes', dens: 'x', profiles: Array.from({ length: 15 }, (_, i) => ({ id: 'u' + i, name: '  Профиль ' + i + '  ', cfg: { lay: 'hud', share: 80, junk: 1, profiles: [1] } })), auto: { on: 1, small: 'p:hd', wide: 5 } }));
      const hi = tvCfgParse(JSON.stringify({ share: 120, scale: 900 }));
      const ids0 = tvCfgParse(JSON.stringify({ profiles: [{ id: "x');alert(1);//", name: 'a', cfg: { lay: 'side' } }, { id: 'xalert1', name: 'dup', cfg: {} }, { id: '<>', name: 'пусто', cfg: {} }] })).profiles.map(p => p.id);
      const ids = TV_PRESETS.map(x => x.id);
      const i18n = ids.every(id => ['tvp_' + id, 'tvp_' + id + '_d'].every(k => k in I18N.ru && k in I18N.en && !/[А-Яа-яЁё]/.test(I18N.en[k])));
      /* каждый вариант × каждое разрешение: карта — основная площадь, прямоугольники внутри экрана, зоны не налезают друг на друга */
      const sizes = TV_SIMS.concat([[960, 540], [3440, 1440], [1600, 900], [1920, 1200]]);
      const inside = (r, W, H) => !r || (r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 1 && r.y + r.h <= H + 1 && r.w > 0 && r.h > 0);
      const over = (a, b) => a && b && Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0;
      const probs = [], minShare = {};
      for (const pr of TV_PRESETS){ const cfg = tvRefCfg('p:' + pr.id, tvCfgParse('{}'));
        for (const [W, H] of sizes){ const G = tvGeom(cfg, W, H), sh = tvShareFor(cfg, W, H);
          minShare[pr.id] = Math.min(minShare[pr.id] ?? 100, sh);
          if (sh < 50) probs.push(pr.id + ' ' + W + '×' + H + ': карта ' + sh + '%');
          for (const k of ['map', 'a', 'a2', 'b', 'h', 'tick']) if (!inside(G[k], W, H)) probs.push(pr.id + ' ' + W + '×' + H + ': ' + k + ' вне экрана');
          const zs = [G.a, G.a2, G.b, G.h, G.tick];   /* v1.09.52: + второй остров и карточка с часами */
          if (zs.some((z, i) => zs.some((y, j) => j > i && over(z, y)))) probs.push(pr.id + ' ' + W + '×' + H + ': зоны налезают');
          if (!TV_FLOAT.includes(G.lay) && zs.some(z => over(G.map, z))) probs.push(pr.id + ' ' + W + '×' + H + ': зона на карте');   /* поверх карты — только у шаблонов «поверх» */
        } }
      /* доля карты «на своём» экране варианта близка к заданной */
      const own = TV_PRESETS.map(pr => { const port = pr.scr.includes('port'), wide = pr.scr.includes('wide'); const W = port ? 1080 : wide ? 2560 : 1920, H = port ? 1920 : 1080;
        const cfg = tvRefCfg('p:' + pr.id, tvCfgParse('{}')); return { id: pr.id, want: cfg.share, got: tvShareFor(cfg, W, H) }; });
      /* ступенька «доля карты»: больше — не меньше, пока шаблон может */
      const mono = ['classic', 'side', 'strip', 'hud', 'twin'].every(lay => { let prev = 0; for (let s = 50; s <= 90; s += 2){ const v = tvShareFor(tvCfgNorm({ lay, share: s }), 1920, 1080); if (v + 1 < prev) return false; prev = v; } return true; });
      const hit = ['side', 'strip', 'classic'].map(lay => [60, 66, 70].map(s => Math.abs(tvShareFor(tvCfgNorm({ lay, share: s }), 1920, 1080) - s) <= 2).every(Boolean)).every(Boolean);
      const cls = [[1920, 1080, 1], [1366, 768, 1], [1280, 720, 1], [2560, 1080, 1], [3440, 1440, 1], [1080, 1920, 1], [1024, 768, 1], [1280, 1024, 1], [3840, 2160, 1], [960, 540, 2], [1920, 1080, 2], [1920, 1200, 1]].map(([w, h, d]) => tvScrClass(w, h, d));
      const k = [tvK(tvCfgNorm({}), 1920, 1080), tvK(tvCfgNorm({}), 3840, 2160), tvK(tvCfgNorm({}), 1366, 768), tvK(tvCfgNorm({ scale: 130 }), 1080, 1920), tvK(tvCfgNorm({}), 2560, 1080)].map(v => +v.toFixed(3));
      const flip = (() => { const a = tvGeom(tvCfgNorm({ lay: 'classic' }), 1920, 1080), b = tvGeom(tvCfgNorm({ lay: 'classic', flip: 1 }), 1920, 1080); return a.a.x > a.map.x && b.a.x < b.map.x && a.map.w === b.map.w; })();
      const flipV = (() => { const a = tvGeom(tvCfgNorm({ lay: 'strip' }), 1920, 1080), b = tvGeom(tvCfgNorm({ lay: 'strip', flip: 1 }), 1920, 1080); return a.a.y > a.map.y && b.a.y < b.map.y; })();
      return { legacy: [legacy.lay, legacy.share, legacy.scale, legacy.flip, legacy.dens, legacy.profiles.length, legacy.auto.on, legacy.auto.portrait, legacy.zones.rail.join(',')],
        clamp: [clamp.lay, clamp.share, clamp.scale, clamp.flip, clamp.dens, clamp.profiles.length, clamp.profiles[0].name, Object.keys(clamp.profiles[0].cfg).sort().join(','), clamp.auto.on, clamp.auto.small, clamp.auto.wide],
        hi: [hi.share, hi.scale], ids0, n: ids.length, uniq: new Set(ids).size === ids.length, i18n, probs, minShare, own, mono, hit, cls, k, flip, flipV,
        ticker: tvShareFor(tvRefCfg('p:ticker', tvCfgParse('{}')), 1920, 1080), nomap: tvGeom(tvCfgNorm({ map: 0 }), 1920, 1080).map === null };
    });
    t('старая раскладка (до 1.09.51) читается как «Классика»: 62% карты, масштаб 100%, без зеркала, без профилей, правила выключены', JSON.stringify(L.legacy) === JSON.stringify(['classic', 62, 100, 0, 'cozy', 0, 0, 'p:tower', 'cards,workers,route']), L.legacy);
    t('мусор в настройке ТВ отсекается: шаблон, доля 50…90, масштаб 50…200, профилей не больше 12, в профиле только поля раскладки, имя без пробелов по краям',
      JSON.stringify(L.clamp) === JSON.stringify(['classic', 50, 50, 1, 'cozy', 12, 'Профиль 0', 'lay,share', 1, 'p:hd', 'p:twin']) && JSON.stringify(L.hi) === JSON.stringify([90, 200]), { clamp: L.clamp, hi: L.hi });
    t('id профиля очищается (он попадает в onclick): только буквы/цифры/«_»/«-», повторы и пустые отброшены', JSON.stringify(L.ids0) === JSON.stringify(['xalert1']), L.ids0);
    t(`готовых вариантов не меньше 10 (${L.n}), id разные, у каждого название и описание RU/EN`, L.n >= 10 && L.uniq && L.i18n);
    t('условие заказчика: у КАЖДОГО варианта на КАЖДОМ разрешении карта занимает больше половины экрана, зоны внутри экрана и не налезают', !L.probs.length, L.probs.slice(0, 8));
    t('минимальная доля карты по вариантам ≥ 50% (по всем разрешениям)', Object.values(L.minShare).every(v => v >= 50), L.minShare);
    t('на своём экране вариант даёт заданную долю карты (±3%) или упирается в предел шаблона сверху', L.own.every(o => o.got >= Math.min(o.want, 70) - 3 && o.got >= 58), L.own);
    t('ступенька «Карта занимает, %»: доля растёт вместе с настройкой; у классики, колонки и ленты 60/66/70% попадают точно (±2)', L.mono && L.hit);
    t('классы экрана: Full HD — основной, 1366/1280 — низкое, 21:9 — ультраширокий, 9:16 — вертикальный, 4:3 и 5:4 — почти квадратный, 4K — 4K; 960×540 при DPR 2 = Full HD',
      JSON.stringify(L.cls) === JSON.stringify(['normal', 'small', 'small', 'wide', 'wide', 'portrait', 'square', 'square', 'big', 'normal', 'big', 'normal']), L.cls);
    t('масштаб k = min(W/1920, H/1080) × масштаб%: Full HD 1, 4K 2, 1366×768 0.711, вертикальный 130% — 0.731, 21:9 — 1', JSON.stringify(L.k) === JSON.stringify([1, 2, 0.711, 0.731, 1]), L.k);
    t('«Зеркально»: колонка уходит влево (карта той же ширины); у ленты — наверх', L.flip && L.flipV);
    t('«Только карта»: строка сверху, карта ≈ 90% экрана; без карты раскладка без области карты', L.ticker >= 88 && L.nomap, L.ticker);
    t('без ошибок страницы (логика)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 2. каждый вариант на живом экране при разных разрешениях ---------- */
  console.log('2. Варианты на экране: 1920×1080, 1366×768, 1280×720, 2560×1080, 1080×1920, 1024×768, 3840×2160');
  for (const [W, H] of [[1920, 1080], [1366, 768], [1280, 720], [2560, 1080], [1080, 1920], [1024, 768], [3840, 2160]]){
    const p = await boot(br, 'demo-admin', W, H);
    await p.evaluate(SYNTH);
    await p.evaluate(() => { App.tvTest(); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { clearInterval(TV.tm.test); TV.tm.test = 0; __synth(10); tvRepaint(); });
    const ids = await p.evaluate(() => TV_PRESETS.map(x => x.id));
    const res = [];
    for (const id of ids){
      await p.evaluate(ref => App.tvPrevSet(ref), 'p:' + id); await p.waitForTimeout(350);
      res.push({ id, ...(await p.evaluate(MEASURE)) });
    }
    const low = res.filter(r => r.now < 50 || Math.abs(r.now - r.exp) > 1), probs = res.filter(r => r.bad.length);
    t(`${W}×${H}: у всех ${res.length} вариантов карта на экране ≥ 50% и совпадает с расчётом (±1%)`, !low.length, low.map(r => [r.id, r.exp, r.now]));
    t(`${W}×${H}: блоки не вылезают вбок, у каждого виден заголовок, шапка с часами целиком`, !probs.length, probs.map(r => [r.id, r.bad.slice(0, 3)]));
    t(`${W}×${H}: без ошибок страницы`, !p.errs.length, p.errs);
    await p.context().close();
  }

  /* ---------- 3. настройки админа: галерея, раскладка, профили, правила ---------- */
  console.log('3. Настройки админа');
  { const p = await boot(br, 'demo-admin', 1366, 900);
    await p.evaluate(() => { foldSet('tvc', true); foldSet('tvprof', true); foldSet('tvauto', true); App.go('settings'); }); await p.waitForTimeout(400);
    const g = await p.evaluate(() => ({ cards: document.querySelectorAll('#tvg-grid .tvg-card').length, svgs: document.querySelectorAll('#tvg-grid .tvg-card svg.tvsch').length, n: TV_PRESETS.length,
      look: document.querySelectorAll('#tvg-grid button[onclick^="App.tvcPreview"]').length, apply: document.querySelectorAll('#tvg-grid button[onclick^="App.tvcPreset"]').length,
      menu: !!document.querySelector('#tvc-card #tv-menu-chk'), lay: !!document.querySelector('#tvc-lay'), share: !!document.querySelector('#tvc-share'), scale: !!document.querySelector('#tvc-scale'),
      flip: !!document.querySelector('#tvc-flip'), prof: !!document.querySelector('#tvp-name'), auto: !!document.querySelector('#tvc-auto-on'), sessions: !!document.querySelector('#tvs-card'),
      office: !!document.querySelector('#office-card'), zones: document.querySelectorAll('.tvz-zone').length, items: document.querySelectorAll('.tvz-item').length,
      hscroll: document.documentElement.scrollWidth > innerWidth + 1 }));
    t('«Режим телевизора»: галерея — карточка со схемой на каждый вариант, «Посмотреть» и «Применить»', g.cards === g.n && g.svgs === g.n && g.look === g.n && g.apply === g.n, g);
    t('рядом: кнопка «ТВ» в меню, шаблон, доля карты, зеркало, масштаб, профили, правила по разрешению; сеансы ТВ, конструктор (2 зоны, 6 блоков) и офис на месте',
      g.menu && g.lay && g.share && g.scale && g.flip && g.prof && g.auto && g.sessions && g.office && g.zones === 2 && g.items === 6, g);
    t('страница настроек не шире окна (галерея не вылезает)', !g.hscroll);
    /* применить готовый вариант */
    await p.evaluate(() => App.tvcPreset('panorama')); await p.waitForTimeout(400);
    const a1 = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); return { lay: c.lay, share: c.share, preset: c.preset, zr: c.zones.rail.join(','), chip: (document.querySelector('.tvg-card[data-p="panorama"] .chip.ok') || {}).textContent || '', on: !!document.querySelector('.tvg-card.on[data-p="panorama"]') }; });
    t('«Применить» «Панораму»: в org_settings.tv — лента, 70% карты, пометка варианта; карточка «на ТВ»', a1.lay === 'strip' && a1.share === 70 && a1.preset === 'p:panorama' && a1.zr === 'cards,workers' && a1.on && /на ТВ/.test(a1.chip), a1);
    await p.evaluate(() => App.tvcShare(2)); await p.waitForTimeout(300);
    const a2 = await p.evaluate(() => ({ share: tvCfgParse(state.data.org_settings.tv).share, chip: (document.querySelector('.tvg-card[data-p="panorama"] .chip.ok') || {}).textContent || '', now: document.getElementById('tvc-share-now').textContent }));
    t('«Карта занимает» +2 → 72%, вариант помечен «изменён», строка показывает долю на 1920×1080', a2.share === 72 && /изменён/.test(a2.chip) && /72%/.test(a2.now), a2);
    await p.evaluate(() => { App.tvcScale(5); App.tvcFlip(true); App.tvcLay('hud'); }); await p.waitForTimeout(400);
    const a3 = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); return [c.scale, c.flip, c.lay, document.querySelectorAll('.tvz-t')[0].textContent, document.querySelectorAll('.tvz-t')[1].textContent]; });
    t('масштаб +5 → 105%, зеркало, шаблон «поверх карты»; зоны конструктора переименованы («Панель слева» / «Панель снизу»)', a3[0] === 105 && a3[1] === 1 && a3[2] === 'hud' && /слева/i.test(a3[3]) && /снизу/i.test(a3[4]), a3);
    /* профиль: сохранить, применить после другого варианта, перезаписать, удалить */
    await p.fill('#tvp-name', '  Офис 55″  '); await p.evaluate(() => App.tvcProfSave()); await p.waitForTimeout(400);
    const pr1 = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); const pr = c.profiles[0] || {}; return { n: c.profiles.length, name: pr.name, lay: pr.cfg && pr.cfg.lay, scale: pr.cfg && pr.cfg.scale, flip: pr.cfg && pr.cfg.flip, preset: c.preset, id: pr.id, row: document.querySelectorAll('#tvp-list .tvp-row').length }; });
    t('«Сохранить текущую»: профиль «Офис 55″» с раскладкой целиком (поверх карты, 105%, зеркало), он же на ТВ, строка в списке', pr1.n === 1 && pr1.name === 'Офис 55″' && pr1.lay === 'hud' && pr1.scale === 105 && pr1.flip === 1 && pr1.preset === 'u:' + pr1.id && pr1.row === 1, pr1);
    await p.evaluate(() => App.tvcPreset('classic')); await p.waitForTimeout(300);
    await p.evaluate(id => App.tvcProfApply(id), pr1.id); await p.waitForTimeout(300);
    const pr2 = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); return [c.lay, c.scale, c.flip, c.share, c.preset]; });
    t('после «Классики» «Применить» профиль возвращает его раскладку', JSON.stringify(pr2) === JSON.stringify(['hud', 105, 1, 72, 'u:' + pr1.id]), pr2);
    await p.evaluate(() => App.tvcScale(-15)); await p.evaluate(id => App.tvcProfUpd(id), pr1.id); await p.waitForTimeout(500);
    const pr3 = await p.evaluate(() => tvCfgParse(state.data.org_settings.tv).profiles[0].cfg.scale);
    t('«Перезаписать» сохраняет в профиль текущую раскладку (масштаб 90%)', pr3 === 90, pr3);
    /* правила «под разрешение» */
    await p.evaluate(() => App.tvcAutoOn(true)); await p.waitForTimeout(300);
    await p.evaluate(id => App.tvcAutoSet('small', 'u:' + id), pr1.id); await p.waitForTimeout(300);
    const au = await p.evaluate(() => { const a = tvCfgParse(state.data.org_settings.tv).auto; return { a, sel: document.querySelector('#tvc-auto-small') && document.querySelector('#tvc-auto-small').value, dis: document.querySelector('#tvc-auto-portrait').disabled }; });
    t('«Подбирать вариант по экрану»: включается, по умолчанию вертикальный → «Вертикальный ТВ», 21:9 → «Ультраширокий», 4:3 → «Панорама», HD → профиль (выбран)',
      au.a.on === 1 && au.a.portrait === 'p:tower' && au.a.wide === 'p:twin' && au.a.square === 'p:panorama' && au.a.small === 'u:' + pr1.id && au.sel === 'u:' + pr1.id && !au.dis, au);
    await p.evaluate(id => App.tvcProfDel(id), pr1.id); await p.waitForTimeout(500);
    const pr4 = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); return { n: c.profiles.length, small: c.auto.small, preset: c.preset }; });
    t('«Удалить» профиль (с вопросом): профиля нет, правило HD и пометка варианта вернулись к основной раскладке', pr4.n === 0 && pr4.small === '' && pr4.preset === '', pr4);
    await p.evaluate(() => App.tvcReset()); await p.waitForTimeout(300);
    const rs = await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); return [c.lay, c.share, c.scale, c.flip, c.auto.on]; });
    t('«Сбросить» возвращает «Классику» 62% / 100%, правила по разрешению не трогает', JSON.stringify(rs) === JSON.stringify(['classic', 62, 100, 0, 1]), rs);
    await p.evaluate(() => App.tvcAutoOn(false));
    /* поиск по настройкам строится с новым разделом без ошибок */
    const sidx = await p.evaluate(() => { try{ foldSet('tvprof', false); foldSet('tvauto', false); render(); _setIdx = null; const ix = setIdxBuild().filter(x => x.sec === 'tvc');
      return ['профил', 'под разрешение', 'кнопка «тв» в меню', 'карта занимает'].map(w => ix.some(x => x.label.toLowerCase().includes(w))); }catch(e){ return 'ERR ' + e.message; } });
    t('поиск по настройкам находит новые пункты «Режима телевизора» (профили и правила — подразделы, даже свёрнутые)', Array.isArray(sidx) && sidx.every(Boolean), sidx);
    t('без ошибок страницы (настройки)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 4. кнопка «ТВ» в меню, полоска проверки, разрешения, «назад» ---------- */
  console.log('4. Кнопка «ТВ» в меню и проверка на своём экране');
  { const p = await boot(br, 'demo-admin', 1600, 900);
    const fs0 = await p.evaluate(() => document.documentElement.style.fontSize);
    t('по умолчанию кнопки «ТВ» в меню нет', await p.evaluate(() => !document.querySelector('.tabbar .tab-tv')));
    await p.evaluate(() => App.tvMenuSet(true)); await p.waitForTimeout(400);
    const m1 = await p.evaluate(() => ({ btn: !!document.querySelector('.tabbar .tab-tv'), pref: state.user.push_prefs.menu_tv, prof: state.data.profiles.find(x => x.id === state.user.id).push_prefs.menu_tv, lbl: (document.querySelector('.tabbar .tab-tv span') || {}).textContent }));
    t('галочка «Кнопка «ТВ» в меню» — кнопка «ТВ» в меню, настройка записана в профиль (push_prefs.menu_tv)', m1.btn && m1.pref === true && m1.prof === true && m1.lbl === 'ТВ', m1);
    await p.evaluate(() => App.go('stock')); await p.waitForTimeout(300);
    await p.click('.tabbar .tab-tv'); await p.waitForTimeout(900);
    const m2 = await p.evaluate(() => ({ tv: !!document.querySelector('.tvwrap'), bar: !!document.querySelector('#tv-testbar'), menu: (tb => tb ? getComputedStyle(tb).display : 'none')(document.querySelector('.tabbar')), fs: document.documentElement.style.fontSize,
      share: (document.getElementById('tvt-share') || {}).textContent || '', opts: document.querySelectorAll('#tvt-prev option').length, sims: document.querySelectorAll('#tvt-sim option').length }));
    t('кнопка открывает проверку ТВ: экран ТВ, полоска проверки с выбором варианта (Как на ТВ + все варианты) и разрешения, доля карты; меню спрятано',
      m2.tv && m2.bar && m2.menu === 'none' && /карта \d+% экрана/.test(m2.share) && m2.opts >= 12 && m2.sims === 9, m2);
    t('кегль ТВ свой (16px) — одинаковый на телевизоре и на проверке', m2.fs === '16px', m2.fs);
    /* карта переживает перерисовку: тот же контейнер Leaflet в новой рамке */
    const mp = await p.evaluate(async () => { const el0 = TV.map && TV.map.getContainer(); render(); await new Promise(r => setTimeout(r, 300)); const el1 = document.getElementById('tv-map');
      return { same: !!el0 && el0 === el1, leaflet: !!el1 && el1.classList.contains('leaflet-container'), tiles: !!(el1 && el1.querySelector('.leaflet-tile-pane')) }; });
    t('перерисовка экрана ТВ не оставляет карту пустой: тот же контейнер Leaflet переезжает в новую рамку', mp.same && mp.leaflet && mp.tiles, mp);
    /* разрешения: кадр 1080×1920 уменьшается под окно */
    await p.selectOption('#tvt-sim', { label: '1080×1920 · вертикальный 9:16' }); await p.waitForTimeout(600);
    const s1 = await p.evaluate(() => { const w = document.querySelector('.tvwrap'), r = w.getBoundingClientRect(); return { sim: w.classList.contains('tv-sim'), cw: w.offsetWidth, ch: w.offsetHeight, rw: Math.round(r.width), rh: Math.round(r.height), inWin: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, lay: TV.geo.lay }; });
    t('«Экран: 1080×1920» — кадр ровно 1080×1920, уменьшен целиком в окно', s1.sim && s1.cw === 1080 && s1.ch === 1920 && s1.inWin && Math.abs(s1.rh - 900) <= 2, s1);
    /* правила по разрешению: вертикальному экрану — «Вертикальный ТВ» */
    await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); c.auto.on = 1; tvcSave(c); }); await p.waitForTimeout(600);
    const s2 = await p.evaluate(() => ({ rule: TV.eff._rule, preset: TV.eff.preset, lay: TV.geo.lay, port: TV.geo.port, dirA: TV.geo.dirA, asTv: document.querySelector('#tvt-prev option').textContent }));
    t('правило «вертикальный → Вертикальный ТВ»: на кадре 9:16 — лента двумя столбцами, в полоске «Как на ТВ: Вертикальный ТВ · Вертикальный»', s2.rule === 'portrait' && s2.preset === 'p:tower' && s2.lay === 'strip' && s2.port && s2.dirA === 'col' && /Вертикальный ТВ/.test(s2.asTv), s2);
    await p.selectOption('#tvt-sim', { label: '3840×2160 · 4K · QHD' }); await p.waitForTimeout(700);
    const s3 = await p.evaluate(() => ({ k: TV.geo.k, cls: tvScrClass(3840, 2160, 1), zoom: getComputedStyle(document.querySelector('.tv-rail')).zoom, pin: (() => { const e = document.querySelector('.tvwrap .map-pin.tvpin'); return e ? getComputedStyle(e).zoom : 'нет'; })() }));
    t('«Экран: 4K» — всё, кроме карты, вдвое крупнее (zoom 2 у колонки и значков)', s3.k === 2 && s3.zoom === '2' && s3.pin === '2', s3);
    await p.selectOption('#tvt-sim', { index: 0 }); await p.waitForTimeout(500);
    await p.evaluate(() => { const c = tvCfgParse(state.data.org_settings.tv); c.auto.on = 0; tvcSave(c); }); await p.waitForTimeout(400);
    /* просмотр варианта и «Применить на все ТВ» */
    await p.selectOption('#tvt-prev', 'p:dispatch'); await p.waitForTimeout(500);
    const v1 = await p.evaluate(() => ({ lay: TV.geo.lay, prev: TV.prevRef, org: tvCfgParse(state.data.org_settings.tv).preset, btn: !!document.getElementById('tvt-apply'), route1: (document.querySelector('#tv-zrail > [data-wid]') || {}).dataset?.wid }));
    t('просмотр «Диспетчера» меняет только этот экран: колонка с маршрутами первыми, на телевизорах прежняя раскладка, есть «Применить на все ТВ»', v1.lay === 'side' && v1.prev === 'p:dispatch' && v1.org !== 'p:dispatch' && v1.btn && v1.route1 === 'route', v1);
    await p.click('#tvt-apply'); await p.waitForTimeout(500);
    const v2 = await p.evaluate(() => ({ org: tvCfgParse(state.data.org_settings.tv).preset, lay: tvCfgParse(state.data.org_settings.tv).lay, prev: TV.prevRef, btn: !!document.getElementById('tvt-apply') }));
    t('«Применить на все ТВ» записывает вариант в общую раскладку, просмотр закрывается', v2.org === 'p:dispatch' && v2.lay === 'side' && !v2.prev && !v2.btn, v2);
    await p.click('.tvt-min'); await p.waitForTimeout(300);
    t('полоску проверки можно свернуть', await p.evaluate(() => document.getElementById('tv-testbar').classList.contains('min') && getComputedStyle(document.querySelector('.tvt-more')).display === 'none'));
    /* «назад» заканчивает проверку и возвращает туда, откуда пришли */
    await p.evaluate(() => backPressed()); await p.waitForTimeout(500);
    const b1 = await p.evaluate(() => ({ scr: state.screen, tv: !!document.querySelector('.tvwrap'), cls: document.documentElement.classList.contains('tl-tv'), fs: document.documentElement.style.fontSize, prev: TV.prevRef, sim: TV.sim, user: !!state.user }));
    t('системная «назад» заканчивает проверку и возвращает на «Склад», вход сохранён, кегль приложения восстановлен', b1.scr === 'stock' && !b1.tv && !b1.cls && b1.fs === fs0 && !b1.prev && !b1.sim && b1.user, { b1, fs0 });
    await p.evaluate(() => App.tvMenuSet(false)); await p.waitForTimeout(300);
    t('галочку сняли — кнопки «ТВ» в меню нет', await p.evaluate(() => !document.querySelector('.tabbar .tab-tv') && state.user.push_prefs.menu_tv === false));
    t('без ошибок страницы (проверка)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 5. менеджер: проверка и просмотр, раскладку не меняет ---------- */
  console.log('5. Менеджер');
  { const p = await boot(br, 'demo-manager', 1366, 900);
    await p.evaluate(() => { foldSet('tvc', true); App.go('settings'); }); await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({ nav: !!document.querySelector('.set-nav-b[data-k="tvc"]'), fold: !!document.getElementById('fold-tvc'), test: !!document.querySelector('#tvc-card button[onclick="App.tvTest()"]'),
      chk: !!document.querySelector('#tvc-card #tv-menu-chk'), cards: document.querySelectorAll('#tvg-grid .tvg-card').length, apply: document.querySelectorAll('#tvg-grid button[onclick^="App.tvcPreset"]').length,
      look: document.querySelectorAll('#tvg-grid button[onclick^="App.tvcPreview"]').length, sessions: !!document.getElementById('tvs-card'), builder: document.querySelectorAll('.tvz-zone').length, intg: !!document.getElementById('fold-intg') }));
    t('у менеджера «Режим телевизора» в Настройках: проверка, кнопка в меню, варианты только «Посмотреть»; без сеансов ТВ, конструктора и интеграций',
      m.nav && m.fold && m.test && m.chk && m.cards >= 10 && m.apply === 0 && m.look === m.cards && !m.sessions && m.builder === 0 && !m.intg, m);
    const before = await p.evaluate(() => state.data.org_settings.tv || '');
    await p.evaluate(() => { App.tvcPreset('hud'); App.tvcShare(10); App.tvcLay('twin'); }); await p.waitForTimeout(300);
    t('менеджер не меняет раскладку телевизоров (действия админа для него ничего не делают)', await p.evaluate(b => (state.data.org_settings.tv || '') === b, before));
    await p.evaluate(() => App.tvMenuSet(true)); await p.waitForTimeout(300);
    t('менеджер включает себе кнопку «ТВ» в меню', await p.evaluate(() => !!document.querySelector('.tabbar .tab-tv')));
    await p.click('#tvg-grid .tvg-card[data-p="twin"] button'); await p.waitForTimeout(900);
    const mv = await p.evaluate(() => ({ tv: !!document.querySelector('.tvwrap'), lay: TV.geo && TV.geo.lay, apply: !!document.getElementById('tvt-apply'), dens: !!document.querySelector('#tv-testbar .lang-seg') }));
    t('«Посмотреть» у менеджера открывает вариант на своём экране (двe колонки), без «Применить на все ТВ»', mv.tv && mv.lay === 'twin' && !mv.apply, mv);
    await p.evaluate(() => App.tvTestStop()); await p.waitForTimeout(400);
    t('менеджер вернулся в Настройки', await p.evaluate(() => state.screen === 'settings' && !document.querySelector('.tvwrap')));
    t('без ошибок страницы (менеджер)', !p.errs.length, p.errs);
    await p.context().close(); }

  /* ---------- 6. телевизор без входа: общая раскладка и правило по разрешению ---------- */
  console.log('6. Телевизор (демо, без входа)');
  for (const [W, H, want, rule] of [[1920, 1080, 'hud', null], [1080, 1920, 'strip', 'portrait'], [1366, 768, 'side', 'small']]){
    const p = await boot(br, null, W, H);
    await p.evaluate(() => { const d = loadLocal() || seedDemoData(); const c = tvCfgNorm({ ...tvLayoutPick(TV_PRESETS.find(x => x.id === 'hud').cfg), preset: 'p:hud', auto: { on: 1 } });
      d.org_settings = { ...(d.org_settings || {}), tv: JSON.stringify(c) }; state.data = d; saveLocalNow(); });
    await p.locator('button', { hasText: /режим телевизора/i }).first().click();
    await p.waitForSelector('.tvwrap', { timeout: 5000 }); await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ lay: TV.geo.lay, rule: TV.eff._rule || null, share: tvShareNow(), bar: !!document.getElementById('tv-testbar'), full: (() => { const b = document.querySelector('.tvwrap').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }));
    t(`${W}×${H}: телевизор показывает ${rule ? 'вариант по правилу «' + rule + '»' : 'общую раскладку «Во весь экран»'}, карта ≥ 50%, экран на всё окно, полоски проверки нет`,
      r.lay === want && r.rule === rule && r.share >= 50 && !r.bar && r.full[0] === W && r.full[1] === H, r);
    t(`${W}×${H}: без ошибок страницы (телевизор)`, !p.errs.length, p.errs);
    await p.context().close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
