/* v1.08.99 — «ТВ-экраны» (сессии телевизоров) переехали в самое начало
   раздела «Режим телевизора». Запуск: node tests/v1_08_99.js [порт] (демо). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8199;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, who, mode, w, h, folds){
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([who, mode, folds]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', who);
    localStorage.setItem('techlog_view_mode', mode);
    const f = {}; folds.forEach(k => f[k] = 1);
    localStorage.setItem('techlog_fold', JSON.stringify(f)); }, [who, mode, folds]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(600);
  return p;
}
const info = (p) => p.evaluate(() => {
  const key = (h) => (h.getAttribute('onclick') || '').replace(/.*'(\w+)'.*/, '$1');
  const top = [...document.querySelectorAll('#app > .fold > .fold-h')].map(key);
  const h = document.querySelector(`#app > .fold > .fold-h[onclick="App.foldToggle('tvc')"]`);
  const f = h && h.closest('.fold'), b = f && f.querySelector(':scope > .fold-b');
  const kids = b ? [...b.children].map(x => x.id || x.className) : [];
  const tvs = document.querySelector('#tvs-card'), cfg = document.querySelector('#tvc-card');
  const hb = h && h.getBoundingClientRect();
  const head = cfg && cfg.firstElementChild && cfg.firstElementChild.getBoundingClientRect();
  const tvsHead = tvs && tvs.firstElementChild && tvs.firstElementChild.getBoundingClientRect();
  return { top, tvc: !!h, open: !!(f && f.classList.contains('on')), kids,
    tvsTitle: tvs ? tvs.firstElementChild.textContent.trim() : '', tvsTxt: tvs ? tvs.textContent : '',
    cfgHead: cfg ? cfg.firstElementChild.textContent.trim() : '',
    gapTvs: tvsHead && hb ? Math.round(tvsHead.top - hb.bottom) : null,
    zones: cfg ? cfg.querySelectorAll('.tvz-zone').length : 0 };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const [mode, w] of [['desktop', 1280], ['mobile', 390]]){
    console.log(`— админ, ${mode} —`);
    const p = await boot(br, 'demo-admin', mode, w, 3000, ['tvc', 'tvs']);
    const a = await info(p);
    t('отдельного спойлера «ТВ-экраны» нет, «Режим телевизора» раскрыт', a.tvc && a.open && !a.top.includes('tvs'), JSON.stringify(a.top));
    t('в самом начале — карточка «ТВ-экраны», за ней настройки режима', JSON.stringify(a.kids) === '["tvs-card","tvc-card"]' && /ТВ-экраны/.test(a.tvsTitle), JSON.stringify(a.kids));
    t('в демо карточка честно пишет про Supabase', /Supabase/i.test(a.tvsTxt));
    t('ниже — «Что показывать» и конструктор (две зоны)', /^Что показывать/.test(a.cfgHead) && a.zones === 2, JSON.stringify({ h: a.cfgHead, z: a.zones }));
    t('заголовок первой карточки не прилипает к шапке раздела (≥ 8 px)', a.gapTvs !== null && a.gapTvs >= 8, a.gapTvs);
    await p.close();
  }
  {
    const p = await boot(br, 'demo-admin', 'desktop', 1280, 900, []);
    const a = await info(p);
    t('свёрнутый раздел не рисует карточки', a.tvc && !a.open && !a.kids.length);
    await p.close();
  }
  for (const who of ['demo-manager', 'demo-tech']){
    const p = await boot(br, who, 'mobile', 390, 1800, ['tvc']);
    const a = await info(p);
    t(who + ': раздела нет', !a.tvc && !a.tvsTxt);
    await p.close();
  }
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
