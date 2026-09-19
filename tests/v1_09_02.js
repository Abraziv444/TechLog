/* v1.09.02 — личные настройки меню: «Названия пунктов меню» (Авто / Показать /
   Скрыть, своё значение для режима «Телефон» и «ПК») и «Рядов меню на телефоне»
   (степпер 1…5); «Безопасность (2FA)» — строка карточки профиля сразу под
   «Сменой пароля». Запуск: node tests/v1_09_02.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8902;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, who, mode, w, h){
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([who, mode]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', who);
    localStorage.setItem('techlog_view_mode', mode); }, [who, mode]);
  await p.reload(); await p.waitForTimeout(1500);
  return p;
}
/* геометрия меню */
const bar = (p) => p.evaluate(() => {
  const b = document.querySelector('#app .tabbar'); if (!b) return null;
  const r = b.getBoundingClientRect();
  const tabs = [...b.querySelectorAll('.tab')].map(x => { const q = x.getBoundingClientRect(), s = x.querySelector('span');
    return { top: Math.round(q.top), l: q.left, r: q.right, b: q.bottom, w: q.width,
      lab: !!s && getComputedStyle(s).display !== 'none' && s.getBoundingClientRect().height > 0,
      cut: !!s && s.scrollWidth > s.clientWidth + 1, title: x.getAttribute('title') || '' }; });
  const rows = [...new Set(tabs.map(x => x.top))].sort((a, b) => a - b).map(tp => tabs.filter(x => x.top === tp).length);
  let overlap = 0;
  for (let i = 0; i < tabs.length; i++) for (let j = i + 1; j < tabs.length; j++){
    const a = tabs[i], c = tabs[j];
    if (a.top === c.top && Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1) overlap++;
  }
  const app = document.getElementById('app');
  return { cls: b.className, h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: r.left, right: r.right, n: tabs.length, rows,
    labs: tabs.filter(x => x.lab).length, cut: tabs.filter(x => x.lab && x.cut).length, titles: tabs.filter(x => x.title).length, overlap,
    out: tabs.filter(x => x.l < r.left - 1 || x.r > r.right + 1 || x.b > r.bottom + 1).length,
    tbx: getComputedStyle(document.documentElement).getPropertyValue('--tbx').trim(),
    padB: parseFloat(getComputedStyle(app).paddingBottom), vh: innerHeight };
});
const toSettings = async (p) => { await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(500); };

(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— админ, телефон 390 px: по умолчанию всё как раньше —');
  const p = await boot(br, 'demo-admin', 'mobile', 390, 844);
  await toSettings(p);
  const b0 = await bar(p);
  t('по умолчанию: один ряд, подписи спрятаны (авто, ≤430 px), классов настроек нет, --tbx = 0', b0.rows.length === 1 && b0.labs === 0 && !/tb-multi|tb-lab-/.test(b0.cls) && (b0.tbx === '0px' || b0.tbx === ''), JSON.stringify(b0));
  t('у каждой кнопки меню есть title с названием', b0.titles === b0.n && b0.n >= 14, b0.titles + '/' + b0.n);

  console.log('— экран настроек: 2FA под сменой пароля, строки меню в карточке профиля —');
  const st = await p.evaluate(() => {
    const card = document.querySelector('#sec-row') && document.querySelector('#sec-row').closest('.card');
    const rows = card ? [...card.children] : [];
    const ix = (sel) => rows.findIndex(x => x.matches(sel) || x.querySelector(sel));
    return { inCard: !!card, pass: ix('[onclick="App.ownPassModal()"]'), sec: rows.findIndex(x => x.id === 'sec-row'), lang: ix('[onclick="App.setLang(\'ru\')"]'),
      font: rows.findIndex(x => x.classList.contains('fs-demo')), ml: rows.findIndex(x => x.id === 'ml-row'), mr: rows.findIndex(x => x.id === 'mr-row'),
      secFold: !!document.querySelector(`.fold-h[onclick="App.foldToggle('sec')"]`), secTxt: (document.querySelector('#sec-row') || {}).textContent || '',
      seg: [...document.querySelectorAll('#ml-row .lang-seg button')].map(x => x.textContent.trim() + (x.classList.contains('on') ? '*' : '')),
      val: (document.querySelector('#mr-val') || {}).textContent, minusOff: !!document.querySelector('#mr-row .stepper button:first-child:disabled') };
  });
  t('«Безопасность (2FA)» — строка карточки профиля сразу под «Сменой пароля», перед «Языком»', st.inCard && st.sec === st.pass + 1 && st.lang === st.sec + 1 && /2FA/.test(st.secTxt), JSON.stringify(st));
  t('отдельного спойлера «Безопасность (2FA)» больше нет', !st.secFold);
  t('«Названия пунктов меню» и «Рядов меню» — после размера шрифта; Авто выбрано, рядов 1, «−» недоступен',
    st.ml > st.font && st.mr === st.ml + 1 && JSON.stringify(st.seg) === '["Авто*","Показать","Скрыть"]' && st.val === '1' && st.minusOff, JSON.stringify(st));

  console.log('— «Показать» на маленьком экране —');
  await p.click('#ml-row .lang-seg button:nth-child(2)'); await p.waitForTimeout(400);
  const b1 = await bar(p);
  t('подписи видны у всех пунктов на 390 px, кнопки не наезжают и не вылезают', b1.labs === b1.n && /tb-lab-on/.test(b1.cls) && b1.overlap === 0 && b1.out === 0, JSON.stringify(b1));
  t('в один ряд подписи обрезаются (ради этого и нужны ряды)', b1.cut > 0, 'cut ' + b1.cut);

  console.log('— ряды —');
  await p.click('#mr-row .stepper button:last-child'); await p.waitForTimeout(400);
  const b2 = await bar(p);
  t('2 ряда: пункты поровну, меню выросло, --tbx > 0', b2.rows.length === 2 && b2.rows[0] === Math.ceil(b2.n / 2) && b2.h > b1.h + 30 && parseInt(b2.tbx) > 30 && b2.overlap === 0 && b2.out === 0, JSON.stringify(b2));
  t('отступ экрана под меню вырос вместе с ним (меню не закрывает низ экрана)', b2.padB >= b2.h && b2.bottom <= b2.vh + 1, 'pad ' + b2.padB + ' h ' + b2.h);
  const low = await p.evaluate(() => { const a = document.getElementById('app'); a.scrollTop = a.scrollHeight; const lo = document.querySelector('#app .btn-red[onclick="App.logout()"]').getBoundingClientRect();
    return { btnBottom: Math.round(lo.bottom), barTop: Math.round(document.querySelector('.tabbar').getBoundingClientRect().top) }; });
  t('«Выйти» в самом низу настроек остаётся над меню', low.btnBottom <= low.barTop, JSON.stringify(low));
  await p.click('#mr-row .stepper button:last-child'); await p.waitForTimeout(250);
  await p.click('#mr-row .stepper button:last-child'); await p.waitForTimeout(400);
  const b4 = await bar(p);
  t('4 ряда: ни одна подпись не обрезана', b4.rows.length === 4 && b4.cut === 0 && b4.labs === b4.n && b4.overlap === 0, JSON.stringify({ rows: b4.rows, cut: b4.cut }));
  await p.click('#mr-row .stepper button:last-child'); await p.waitForTimeout(300);
  const s5 = await p.evaluate(() => ({ val: document.querySelector('#mr-val').textContent, plusOff: !!document.querySelector('#mr-row .stepper button:last-child:disabled'), m: window.App.__test_menu() }));
  await p.evaluate(() => window.App.menuRowsStep(1)); await p.waitForTimeout(200);
  t('степпер упирается в 5, «+» недоступен', s5.val === '5' && s5.plusOff && s5.m.rows === 5 && (await p.evaluate(() => window.App.__test_menu().rows)) === 5, JSON.stringify(s5));
  const b5 = await bar(p);
  t('в ряду не меньше четырёх пунктов даже при 5 рядах', Math.max(...b5.rows) >= 4 && b5.rows.slice(0, -1).every(x => x >= 4), JSON.stringify(b5.rows));

  console.log('— всё, что над меню, поднимается —');
  await p.evaluate(() => { window.App.menuRowsStep(-1); window.App.menuRowsStep(-1); }); await p.waitForTimeout(300);   // 3 ряда
  await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(600);
  const hm = await p.evaluate(() => { const f = document.querySelector('.fab'), b = document.querySelector('.tabbar');
    return { fab: f ? Math.round(f.getBoundingClientRect().bottom) : null, barTop: Math.round(b.getBoundingClientRect().top), rows: window.App.__test_menu().rows }; });
  t('кнопка «+» на главной стоит над трёхрядным меню', hm.rows === 3 && hm.fab !== null && hm.fab <= hm.barTop, JSON.stringify(hm));
  const tabGo = await p.evaluate(() => { const b = [...document.querySelectorAll('.tabbar .tab')].find(x => /App\.go\('stats'\)/.test(x.getAttribute('onclick'))); const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && b.contains(hit); });
  await p.click(`.tabbar .tab[onclick="App.go('stats')"]`); await p.waitForTimeout(400);
  t('пункт из нижнего ряда нажимается (ничем не перекрыт)', tabGo && (await p.evaluate(() => document.getElementById('app').className)) === 'scr-stats');

  console.log('— настройка личная: профиль + кэш устройства, переживает перезагрузку —');
  await p.waitForTimeout(1900);
  const saved = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}'); const me = (d.profiles || []).find(x => x.id === 'demo-admin');
    const other = (d.profiles || []).find(x => x.id === 'demo-tech');
    return { prefs: me && me.push_prefs, other: other && other.push_prefs && other.push_prefs.menu_rows, ls: [localStorage.getItem('techlog_menu_labels'), localStorage.getItem('techlog_menu_rows')] }; });
  t('в профиле: menu_labels = on, menu_rows = 3; у другого сотрудника ничего не появилось', saved.prefs && saved.prefs.menu_labels === 'on' && saved.prefs.menu_rows === 3 && !saved.other
    && saved.ls[0] === 'on' && saved.ls[1] === '3', JSON.stringify(saved));
  await p.reload(); await p.waitForTimeout(1500);
  const b6 = await bar(p);
  t('после перезагрузки: 3 ряда и подписи на месте, --tbx выставлен', b6.rows.length === 3 && b6.labs === b6.n && parseInt(b6.tbx) > 60, JSON.stringify({ rows: b6.rows, tbx: b6.tbx }));

  console.log('— «Скрыть» —');
  await toSettings(p);
  await p.click('#ml-row .lang-seg button:nth-child(3)'); await p.waitForTimeout(400);
  const b7 = await bar(p);
  t('одни значки, ряды остаются', b7.labs === 0 && /tb-lab-off/.test(b7.cls) && b7.rows.length === 3 && b7.overlap === 0, JSON.stringify({ cls: b7.cls, rows: b7.rows }));

  console.log('— режим ПК: своё значение подписей, ряды на колонку не действуют —');
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.evaluate(() => window.App.setVm('desktop')); await p.waitForTimeout(900);
  await toSettings(p);
  const d1 = await bar(p);
  const dm = await p.evaluate(() => window.App.__test_menu());
  t('ПК: меню — одна колонка слева, подписи видны (там «Авто»), --tbx = 0', dm.key === 'menu_labels_pc' && dm.labels === 'auto' && !dm.bottom && !/tb-multi|tb-lab-/.test(d1.cls)
    && d1.labs === d1.n && d1.left < 40 && d1.h > 400 && d1.tbx === '0px', JSON.stringify({ cls: d1.cls, labs: d1.labs, left: d1.left, h: d1.h, tbx: d1.tbx, dm }));
  await p.click('#ml-row .lang-seg button:nth-child(3)'); await p.waitForTimeout(400);
  const d2 = await bar(p);
  t('ПК: «Скрыть» убирает подписи в колонке', d2.labs === 0 && /tb-lab-off/.test(d2.cls));
  await p.click('#ml-row .lang-seg button:nth-child(1)'); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 800, height: 900 }); await p.waitForTimeout(600);
  const d3 = await bar(p);
  t('ПК-режим в узком окне: меню снова внизу — ряды действуют, низ экрана не закрыт', d3.rows.length === 3 && parseInt(d3.tbx) > 60 && d3.overlap === 0, JSON.stringify({ rows: d3.rows, tbx: d3.tbx }));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => window.App.setVm('mobile')); await p.waitForTimeout(900);
  const m2 = await p.evaluate(() => window.App.__test_menu());
  t('возврат в режим «Телефон»: там по-прежнему «Скрыть», выбранное на ПК его не тронуло', m2.key === 'menu_labels' && m2.labels === 'off' && m2.rows === 3, JSON.stringify(m2));
  await p.close();

  console.log('— техник: короткое меню —');
  {
    const q = await boot(br, 'demo-tech', 'mobile', 360, 740);
    const t0 = await bar(q);
    await q.evaluate(() => { window.App.menuLabels('on'); for (let i = 0; i < 4; i++) window.App.menuRowsStep(1); }); await q.waitForTimeout(500);
    const t5 = await bar(q);
    t('у техника своё значение (по умолчанию 1 ряд); при «5» меню делится из расчёта ≥ 4 пунктов на ряд', t0.rows.length === 1 && t5.rows.length === Math.ceil(t5.n / 4) && t5.rows.length < 5 && t5.cut === 0 && t5.overlap === 0,
      JSON.stringify({ n: t5.n, rows: t5.rows, cut: t5.cut }));
    await q.close();
  }

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})();
