/* v1.08.91 — справка по нумерации доступна прямо в карточке, под спойлером:
   раскрывается на месте, содержит то же, что окно по «?», состояние помнится;
   кнопка «?» с модалкой осталась. Запуск: node tests/v1_08_91.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, vp, mode){
  const p = await (await br.newContext({ viewport: vp })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate((m) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', m);
    localStorage.setItem('techlog_fold', '{"num":1}'); }, mode);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(600);
  return p;
}
const card = (p) => p.evaluate(() => {
  const c = [...document.querySelectorAll('#app .card')].find(x => /App\.noReset\(\)/.test(x.innerHTML));
  if (!c) return null;
  const f = c.querySelector('.fold');
  const b = f && f.querySelector('.fold-b');
  const inp = c.querySelector('#no-doc');
  return { card: true, fold: !!f, head: f ? f.querySelector('.fold-h').textContent.trim() : '',
    open: !!(f && f.classList.contains('on')), body: !!b,
    tokens: b ? b.querySelectorAll('.rowline').length : 0,
    hasVals: b ? /\{TYPE\}[\s\S]*\{SEQ\}/.test(b.textContent) : false,
    hasName: b ? /\{NAME\}/.test(b.textContent) && /\{KIND\}/.test(b.textContent) : false,
    hasRoots: b ? /папк/i.test(b.textContent) : false,
    q: !!c.querySelector('[onclick="App.noHelp()"]'),
    inpTop: inp ? Math.round(inp.getBoundingClientRect().top) : null,
    bodyTop: b ? Math.round(b.getBoundingClientRect().top) : null };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const [name, vp, mode] of [['ПК', { width: 1440, height: 950 }, 'desktop'], ['телефон', { width: 414, height: 850 }, 'mobile']]){
    console.log('— ' + name + ' —');
    const p = await boot(br, vp, mode);
    const a = await card(p);
    t('в карточке нумерации есть складная «Справка…», по умолчанию свёрнута', a && a.fold && /Справка/.test(a.head) && !a.open && !a.body, JSON.stringify(a));
    t('кнопка «?» с окном осталась', a && a.q);
    await p.evaluate(() => [...document.querySelectorAll('#app .card')].find(x => /App\.noReset\(\)/.test(x.innerHTML)).querySelector('.fold-h').click());
    await p.waitForTimeout(400);
    const b = await card(p);
    t('раскрывается на месте: все кусочки со значениями, {NAME}/{KIND}, папки Диска',
      b && b.open && b.body && b.tokens >= 12 && b.hasVals && b.hasName && b.hasRoots, JSON.stringify(b));
    t('конструктор остаётся выше справки — настраивать можно параллельно', b && b.inpTop !== null && b.bodyTop > b.inpTop, JSON.stringify([b && b.inpTop, b && b.bodyTop]));
    /* то же содержимое, что в модалке */
    await p.evaluate(() => window.App.noHelp()); await p.waitForTimeout(400);
    const same = await p.evaluate(() => {
      const m = document.querySelector('#overlay .modal');
      const b = [...document.querySelectorAll('#app .card')].find(x => /App\.noReset\(\)/.test(x.innerHTML)).querySelector('.fold-b');
      const norm = (s) => s.replace(/\s+/g, ' ').trim();
      return { modal: !!m, rowsM: m.querySelectorAll('.rowline').length, rowsB: b.querySelectorAll('.rowline').length,
        eq: norm(b.textContent) === norm(m.textContent.replace(/^[\s\S]*?Нумерация — справка/, '')) };
    });
    t('содержимое совпадает с окном по «?»', same.modal && same.rowsM === same.rowsB && same.eq, JSON.stringify(same));
    await p.evaluate(() => window.App.closeModal());
    /* состояние помнится */
    await p.reload(); await p.waitForTimeout(1500);
    await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(600);
    const c = await card(p);
    t('раскрытая справка остаётся раскрытой после перезагрузки', c && c.open && c.body, JSON.stringify(c));
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
