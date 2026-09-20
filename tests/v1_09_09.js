/* v1.09.09:
     1) Настройки — меню разделов (ПК: липкий столбец, телефон: липкая лента), переход к разделу;
     2) Справочники — колёсико на карусели, вкладка по умолчанию «Сотрудники», «По умолчанию» и «Порядок»;
     3) ТВ-режим — экран на всё окно в режимах «ПК» и «Телефон», проверка из Настроек, плотность, выход;
     4) Склад — режим «облегчённый»: скрытые блоки, «Забрал» сразу возвращает на склад;
     5) Карточки дня и окно пикапов — одна высота в 4 сочетаниях режим × плотность, юнит и чипы не обрезаны.
   Запуск: node tests/v1_09_09.js [порт]. Демо-режим (config.js = {}), CDN режутся. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8909;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.evaluate(([who, mode]) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('techlog_session_v1', who); localStorage.setItem('techlog_view_mode', mode); }, [o.who || 'demo-admin', o.mode || 'mobile']);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(800);
  if (o.seed){ await p.waitForTimeout(1700); await p.evaluate(o.seed, o.seedArg);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(800); }
  return p;
}
const PC = { w: 1400, h: 1000, mode: 'desktop' }, PH = { w: 412, h: 915, mode: 'mobile', touch: true };

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* ---------- 1–2. настройки и справочники ---------- */
  for (const o of [PC, PH]){
    console.log('1–2. Настройки и справочники — ' + o.mode);
    const p = await boot(br, o);
    await p.evaluate(() => App.go('settings')); await p.waitForTimeout(600);
    const nav = await p.evaluate(() => { const n = document.querySelector('#set-nav'); if (!n) return null; const b = n.getBoundingClientRect();
      return { pos: getComputedStyle(n).position, w: Math.round(b.width), h: Math.round(b.height), n: [...n.querySelectorAll('.set-nav-b')].filter(x => x.offsetParent).length }; });
    t('меню разделов есть, липкое, пунктов ≥ 6', !!nav && nav.pos === 'sticky' && nav.n >= 6, nav);
    t(o.mode === 'desktop' ? 'на ПК — вертикальный столбец' : 'на телефоне — горизонтальная лента', !!nav && (o.mode === 'desktop' ? nav.h > nav.w : nav.w > nav.h * 3), nav);
    const k = await p.evaluate(() => { const bs = [...document.querySelectorAll('#set-nav .set-nav-b')].filter(x => x.offsetParent); return bs[bs.length - 2].dataset.k; });
    const y0 = await p.evaluate(() => (document.scrollingElement.scrollTop || document.querySelector('#app').scrollTop));
    await p.evaluate(k => App.setNavGo(k), k); await p.waitForTimeout(900);
    const st = await p.evaluate(() => ({ on: (document.querySelector('#set-nav .set-nav-b.on') || {}).dataset?.k, y: (document.scrollingElement.scrollTop || document.querySelector('#app').scrollTop) }));
    t('переход к разделу: пункт подсвечен, страница прокрутилась', st.on === k && st.y > y0 + 100, { k, st, y0 });
    await p.evaluate(() => App.go('dirs')); await p.waitForTimeout(500);
    t('справочники открываются на «Сотрудниках»', await p.evaluate(() => state.dirTab) === 'staff');
    t('кнопки «По умолчанию» и «Порядок» у админа', await p.evaluate(() => ['dirDefaultSet', 'dirOrderModal'].every(f => [...document.querySelectorAll('#app button')].some(b => (b.getAttribute('onclick') || '').includes(f)))));
    await p.evaluate(() => App.dirTab('vehicles')); await p.evaluate(() => App.dirDefaultSet()); await p.waitForTimeout(500);
    t('«По умолчанию» запоминается в профиле', await p.evaluate(() => (state.user.push_prefs || {}).dir_default) === 'vehicles');
    await p.context().close();
  }
  { console.log('2. Колёсико на карусели справочников (ПК, окно 1070 px)');
    const p = await boot(br, { w: 1070, h: 800, mode: 'desktop' });
    await p.evaluate(() => App.go('dirs')); await p.waitForTimeout(500);
    const bb = await p.locator('#dir-tabs').boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.wheel(0, 300); await p.waitForTimeout(500);
    const e = await p.evaluate(() => { const x = document.getElementById('dir-tabs'); return { sl: x.scrollLeft, over: x.scrollWidth > x.clientWidth }; });
    t('вертикальное колёсико прокручивает ленту вкладок вбок', e.over && e.sl > 50, e);
    await p.context().close(); }

  /* ---------- 3. ТВ ---------- */
  for (const [w, h, mode] of [[1920, 1080, 'desktop'], [1113, 1042, 'desktop'], [1113, 1042, 'mobile']]){
    console.log(`3. ТВ-режим — окно ${w}×${h}, режим ${mode}`);
    const p = await boot(br, { w, h, mode });
    await p.evaluate(() => App.go('settings')); await p.waitForTimeout(300);
    t('кнопка проверки в «Режиме телевизора»', await p.evaluate(() => { if (!foldOpen('tvc')) App.foldToggle('tvc'); return [...document.querySelectorAll('#app button')].some(b => /tvTest\(\)/.test(b.getAttribute('onclick') || '')); }));
    await p.evaluate(() => App.tvTest()); await p.waitForTimeout(1500);
    const g = await p.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      const tb = document.querySelector('.tabbar'); return { wrap: r('.tvwrap'), map: r('.tv-mapbox'), rail: r('.tv-rail'), bar: !!document.querySelector('.tv-testbar'), menu: tb ? getComputedStyle(tb).display : 'none', user: !!state.user }; });
    t('ТВ-экран занимает всё окно', !!g.wrap && g.wrap[0] === 0 && g.wrap[2] === w && g.wrap[3] === h, g.wrap);
    t('карта не сплющена (шире половины свободного места)', !!g.map && g.map[2] >= (w - 500) * 0.9, g.map);
    t('меню приложения скрыто, полоска проверки есть, вход сохранён', g.menu === 'none' && g.bar && g.user, g);
    await p.evaluate(() => App.tvDensSet('compact')); await p.waitForTimeout(700);
    t('плотность «компактная» включается и сохраняется в раскладке ТВ', await p.evaluate(() => document.documentElement.classList.contains('tl-compact') && tvCfg().dens === 'compact' && /"dens":"compact"/.test(state.data.org_settings.tv)));
    await p.evaluate(() => App.tvDensSet('cozy')); await p.waitForTimeout(400);
    await p.evaluate(() => App.tvTestStop()); await p.waitForTimeout(700);
    t('«Закончить проверку» возвращает в Настройки под той же учётной записью', await p.evaluate(() => state.screen === 'settings' && !!state.user && !document.querySelector('.tvwrap') && !document.documentElement.classList.contains('tl-tv')));
    await p.context().close();
  }

  /* ---------- 4. склад ---------- */
  { console.log('4. Склад — облегчённый режим');
    const p = await boot(br, PH);
    await p.evaluate(() => App.go('stock')); await p.waitForTimeout(500);
    t('полный учёт: «Моя машина» и «Взять/Сдать» на месте', await p.evaluate(() => !stockLite() && !!document.querySelector('.eq-bigrow')));
    await p.evaluate(() => App.stockModeSet('lite')); await p.waitForTimeout(600);
    t('облегчённый: блоки машин скрыты, режим записан', await p.evaluate(() => stockLite() && !document.querySelector('.eq-bigrow') && state.data.org_settings.stock_mode === 'lite'));
    const jid = await p.evaluate(() => (state.data.placements.find(x => !x.picked_up && !x.superseded) || {}).job_id);
    const sum = () => p.evaluate(() => state.data.equipment_types.reduce((a, et) => { const e = emRow(et.id); a.stock += e.stock; a.car += e.car; return a; }, { stock: 0, car: 0 }));
    const qty = await p.evaluate(j => state.data.placements.filter(x => x.job_id === j && !x.picked_up && !x.superseded).reduce((a, x) => a + (+x.qty || 0), 0), jid);
    const b = await sum();
    await p.evaluate(j => App.pickupGroup(j), jid); await p.waitForTimeout(1500);
    const a = await sum();
    t(`«Забрал» (${qty} ед.) — сразу на склад, в машинах ничего`, a.stock === b.stock + qty && a.car === b.car, { b, a, qty });
    t('строки аренды помечены «вернул на склад», плашки «на руках» нет', await p.evaluate(j => state.data.placements.filter(x => x.job_id === j).every(x => x.picked_up && !!x.returned_at) && myOnHandQty() === 0, jid));
    await p.evaluate(() => App.stockModeSet('full')); await p.waitForTimeout(500);
    t('возврат в полный учёт', await p.evaluate(() => !stockLite()));
    await p.context().close(); }

  /* ---------- 5. карточки ---------- */
  console.log('5. Один размер карточек');
  const seed = (dens) => {
    const LONG = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque eleifend, nisi vel sodales euismod. '.repeat(4);
    const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
    const dt = new Date(), iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const tISO = iso(dt), old = iso(new Date(dt.getTime() - 9 * 864e5));
    const pend = d.placements.filter(x => !x.picked_up); const j0 = d.jobs.find(x => x.id === pend[0].job_id);
    pend.forEach(x => { x.pickup_date = old; x.due_date = old; }); j0.note = LONG; j0.note_en = LONG;
    const mk = (id, unit, note) => { const j = JSON.parse(JSON.stringify(j0)); j.id = id; j.unit_number = unit; j.note = note; j.note_en = note; d.jobs.push(j);
      pend.forEach((x, i) => { const c = JSON.parse(JSON.stringify(x)); c.id = id + '-pl' + i; c.job_id = id; c.unit_number = unit; c.pickup_date = tISO; c.due_date = tISO; d.placements.push(c); }); };
    mk('cj1', '111', ''); mk('cj2', '2222B', 'short');
    const base = d.jobs.find(x => x.date === tISO && !/^cj/.test(x.id)) || d.jobs[0];
    ['A', 'B', 'C'].forEach((u, i) => { const j = JSON.parse(JSON.stringify(base)); j.id = 'tj' + i; j.date = tISO; j.unit_number = u + '10'; j.technician_id = 'demo-admin'; j.status = i === 1 ? 'done' : 'draft'; j.note = i === 0 ? LONG : ''; j.work_type_id = d.work_types[i].id; d.jobs.push(j); });
    const me = d.profiles.find(x => x.id === 'demo-admin'); me.push_prefs = Object.assign({}, me.push_prefs, { density: dens, density_pc: dens });
    localStorage.setItem('techlog_state_v1', JSON.stringify(d)); };
  for (const [o, dens] of [[{ ...PC, w: 1600, h: 1200 }, 'cozy'], [{ ...PC, w: 1600, h: 1200 }, 'compact'], [PH, 'cozy'], [PH, 'compact']]){
    const p = await boot(br, { ...o, seed, seedArg: dens });
    await p.evaluate(() => App.go('home')); await p.waitForTimeout(500);
    const hs = await p.evaluate(() => [...document.querySelectorAll('#app .item.clicky')].map(e => Math.round(e.getBoundingClientRect().height)));
    t(`${o.mode}/${dens}: ${hs.length} карточек дня одной высоты (${hs[0]} px)`, hs.length >= 5 && new Set(hs).size === 1, hs);
    const clip = await p.evaluate(() => [...document.querySelectorAll('#app .item.clicky')].map(e => { const tail = e.querySelector('.t > .tail'), chips = [...e.querySelectorAll('.s.meta > .chip')];
      const cut = x => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().right > x.parentElement.getBoundingClientRect().right + 1;
      return (tail && cut(tail)) || chips.some(cut); }).filter(Boolean).length);
    t(`${o.mode}/${dens}: номер юнита и чипы статуса не обрезаны`, clip === 0, clip);
    await p.evaluate(() => App.pkDueModal()); await p.waitForTimeout(500);
    const ms = await p.evaluate(() => [...document.querySelectorAll('#overlay .pkm-card')].map(e => Math.round(e.getBoundingClientRect().height)));
    t(`${o.mode}/${dens}: карточки окна пикапов одной высоты (${ms[0]} px)`, ms.length >= 3 && new Set(ms).size === 1, ms);
    await p.context().close();
  }

  await br.close();
  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
