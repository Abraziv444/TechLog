/* v1.09.00 — «Push уведомления и подсказки» одним разделом; «Прочие функции»
   (Функции, Код приглашения — админ; PWA с версией — все) — последний раздел
   Настроек, сразу над кнопкой «Выйти». Запуск: node tests/v1_09_00.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8900;
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
  const app = document.getElementById('app');
  const seq = [...app.children].filter(x => x.classList.contains('fold') || x.matches('button.btn-red')).map(x => x.classList.contains('fold') ? key(x.querySelector(':scope > .fold-h')) : 'LOGOUT');
  const body = (k) => { const h = app.querySelector(`:scope > .fold > .fold-h[onclick="App.foldToggle('${k}')"]`); return h ? h.closest('.fold').querySelector(':scope > .fold-b') : null; };
  const title = (k) => { const h = app.querySelector(`:scope > .fold > .fold-h[onclick="App.foldToggle('${k}')"]`); return h ? h.textContent.trim() : null; };
  const push = body('push'), misc = body('misc');
  const q = (b, s) => !!(b && b.querySelector(s));
  const out = (s) => [...document.querySelectorAll(s)].filter(x => !(x.closest('#app > .fold') && x.closest('#app > .fold').querySelector(`:scope > .fold-h[onclick="App.foldToggle('misc')"], :scope > .fold-h[onclick="App.foldToggle('push')"]`))).length;
  return { seq, pushTitle: title('push'), miscTitle: title('misc'),
    pushCards: push ? [...push.children].map(c => (c.firstElementChild && c.firstElementChild.textContent || '').trim().slice(0, 30)) : [],
    pbOn: q(push, '[onclick*="App.pbPref"], [onclick*="pbToggle"], [onclick*="App.pb"]'), popPos: q(push, '[onclick*="App.popPos"]'), mq: q(push, '#mq-quiet-chk'),
    misc: misc ? [...misc.children].map(c => c.id) : [],
    feat: q(misc, 'input[onchange*="tpl_on"]'), inv: q(misc, '#inv-code'), upd: q(misc, '[onclick="App.updCheck()"]'), ver: misc ? /TechLog v1\.\d\d\.\d\d/.test(misc.textContent) : false,
    stray: out('[onclick="App.updCheck()"], #inv-code, input[onchange*="tpl_on"], [onclick*="App.popPos"]'),
    oldPop: !!app.querySelector(`.fold-h[onclick="App.foldToggle('pop')"]`), oldFeat: !!app.querySelector(`.fold-h[onclick="App.foldToggle('feat')"]`) };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— админ, ПК —');
  {
    const p = await boot(br, 'demo-admin', 'desktop', 1280, 900, ['push', 'misc']);
    const a = await info(p);
    t('«Прочие функции» — последний раздел, сразу над «Выйти»', a.seq[a.seq.length - 1] === 'LOGOUT' && a.seq[a.seq.length - 2] === 'misc' && /^Прочие функции$/.test(a.miscTitle), JSON.stringify(a.seq));
    t('в «Прочих функциях»: Функции → Код приглашения → PWA', JSON.stringify(a.misc) === '["feat-card","inv-card","pwa-card"]' && a.feat && a.inv && a.upd && a.ver, JSON.stringify(a.misc));
    t('раздел «Push уведомления и подсказки»: сверху push, ниже подсказки', /^Push уведомления и подсказки$/.test(a.pushTitle) && a.pushCards.length === 2
      && /Push уведомления/.test(a.pushCards[0]) && /Всплывающие подсказки/.test(a.pushCards[1]) && a.popPos && a.mq, JSON.stringify({ t: a.pushTitle, c: a.pushCards }));
    t('отдельных «Всплывающие подсказки» и «Функции» больше нет, копий вне разделов нет', !a.oldPop && !a.oldFeat && a.stray === 0, JSON.stringify({ oldPop: a.oldPop, oldFeat: a.oldFeat, stray: a.stray }));
    /* работает на новом месте */
    const on0 = await p.evaluate(() => document.querySelector('input[onchange*="tpl_on"]').checked);
    await p.click('input[onchange*="tpl_on"]'); await p.waitForTimeout(500);
    const on1 = await p.evaluate(() => document.querySelector('input[onchange*="tpl_on"]').checked);
    t('галочка «Создать такую же / Перенести день» переключается внутри раздела', on0 !== on1, on0 + ' → ' + on1);
    await p.evaluate(() => window.App.popPos('bottom')); await p.waitForTimeout(300);
    t('место подсказок переключается («Снизу»)', await p.evaluate(() => !!document.querySelector('[onclick="App.popPos(\'bottom\')"].on')));
    await p.evaluate(() => window.App.popPos('top'));
    await p.close();
  }

  console.log('— менеджер и техник, телефон —');
  for (const who of ['demo-manager', 'demo-tech']){
    const p = await boot(br, who, 'mobile', 390, 2600, ['push', 'misc']);
    const a = await info(p);
    t(who + ': «Прочие функции» только с PWA, последний перед «Выйти»', JSON.stringify(a.misc) === '["pwa-card"]' && a.upd && !a.feat && !a.inv
      && a.seq[a.seq.length - 2] === 'misc' && a.seq[a.seq.length - 1] === 'LOGOUT', JSON.stringify({ misc: a.misc, seq: a.seq }));
    t(who + ': push и подсказки в одном разделе', a.pushCards.length === 2 && a.popPos, JSON.stringify(a.pushCards));
    await p.close();
  }

  console.log('— свёрнуто по умолчанию —');
  {
    const p = await boot(br, 'demo-admin', 'mobile', 390, 900, []);
    const a = await info(p);
    t('свёрнутые разделы не рисуют содержимое, «Выйти» на месте', !a.misc.length && !a.pushCards.length && a.seq.includes('LOGOUT'), JSON.stringify(a.seq));
    await p.close();
  }
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
