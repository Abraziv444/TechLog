/* v1.09.48 — кнопка «Принудительно обновить» (Настройки → Версия приложения): спрашивает сайт, стирает кэши
   techlog-*, снимает service worker, перезагружает; вход и данные на месте; при недоступном сайте — предупреждение
   и «Отмена» ничего не трогает. Запуск: node tests/v1_09_48.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1300, height: 850 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  let siteDown = false;
  await p.route(/\/version\.json/, r => siteDown ? r.abort() : r.continue());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(600);
  const openSettings = () => p.evaluate(async () => { window.__tlAskModal = true; foldSet('misc', true); App.go('settings'); await new Promise(r => setTimeout(r, 300)); });

  await openSettings();
  const btn = await p.evaluate(() => ({ btn: !!document.getElementById('fu-btn'), hint: (document.querySelector('#fu-row .d') || {}).textContent || '' }));
  t('в Настройках → «Версия приложения» есть «Принудительно обновить» с пояснением', btn.btn && /не трогаются/.test(btn.hint), btn);

  /* сайт недоступен → предупреждение, «Отмена» ничего не трогает */
  siteDown = true;
  const down = await p.evaluate(async () => { await caches.open('techlog-keep').then(c => c.put('./x', new Response('x')));
    App.forceUpdate(); for (let i = 0; i < 30 && !document.getElementById('ask-ov'); i++) await new Promise(r => setTimeout(r, 100));
    const txt = (document.querySelector('#ask-ov .ask-text') || {}).textContent || '', danger = !!document.querySelector('#ask-ov .btn-red');
    document.getElementById('ask-no').click(); await new Promise(r => setTimeout(r, 300));
    return { txt, danger, keys: await caches.keys() }; });
  siteDown = false;
  t('сайт недоступен — красное предупреждение «приложение не откроется, пока сайт не заработает»', /не откроется/.test(down.txt) && down.danger, down);
  t('«Отмена» — копия приложения не стёрта', down.keys.includes('techlog-keep'), down.keys);

  /* сайт отвечает → вопрос с версиями → «Обновить» → перезагрузка */
  const q = await p.evaluate(async () => { App.forceUpdate(); for (let i = 0; i < 30 && !document.getElementById('ask-ov'); i++) await new Promise(r => setTimeout(r, 100));
    return (document.querySelector('#ask-ov .ask-text') || {}).textContent || ''; });
  t('вопрос называет версию на сайте и на устройстве', /На сайте версия 1\.09\.\d+, у вас 1\.09\.\d+/.test(q), q);
  const nav = p.waitForNavigation({ timeout: 15000 }).catch(() => null);
  await p.evaluate(() => document.getElementById('ask-ok').click());
  await nav; await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(1500);
  const after = await p.evaluate(async () => ({ keys: (await caches.keys()).filter(k => k.startsWith('techlog-')), user: state.user && state.user.id,
    log: (typeof DIAG !== 'undefined' ? DIAG : []).filter(s => /принудительное обновление/.test(s)), fu: sessionStorage.getItem('techlog_fu') }));
  t('после «Обновить» страница перезагрузилась, кэши techlog-* стёрты', after.keys.length === 0, after.keys);
  t('вход и данные на месте (сессия не сброшена)', after.user === 'demo-admin', after.user);
  t('в журнале — «принудительное обновление: было v… стало v…»', after.log.some(s => /было v1\.09\.\d+, стало v1\.09\.\d+/.test(s)) && after.fu === null, after.log);

  t('системных окон браузера не было', dialogs === 0, dialogs);
  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
