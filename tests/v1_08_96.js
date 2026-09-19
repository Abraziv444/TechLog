/* v1.08.96 — раздел «Диагностика» в Настройках: сверху «Связь и журналы»
   (статус синхронизации, «Проверить связь», «Диагностика», «Журнал событий»,
   у админа «Диагностика БД»), ниже подразделы-спойлеры Интерфейс; у админа —
   Тесты и регресс, Бэкап данных, Автобэкап. Кнопки «Синхронизировать» нет.
   Запуск: node tests/v1_08_96.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8196;
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
  const top = [...document.querySelectorAll('#app > .fold > .fold-h')].map(h => (h.getAttribute('onclick') || '').replace(/.*'(\w+)'.*/, '$1'));
  const h = document.querySelector(`#app > .fold > .fold-h[onclick="App.foldToggle('dgs')"]`);
  const f = h && h.closest('.fold'), b = f && f.querySelector(':scope > .fold-b');
  const subs = b ? [...b.querySelectorAll(':scope > .fold-sub > .fold-h')].map(x => ({ k: (x.getAttribute('onclick') || '').replace(/.*'(\w+)'.*/, '$1'), txt: x.textContent.trim() })) : [];
  const net = b && b.querySelector(':scope > #dg-net');
  const q = (s) => !!(net && net.querySelector(s));
  return { top, title: h && h.textContent.trim(), open: !!(f && f.classList.contains('on')), subs,
    net: !!net, netFirst: !!(b && b.firstElementChild === net),
    status: !!net && /Синхронизировано/.test(net.textContent),
    netBtn: q('[onclick="App.netModal()"] .net-pill'), diagBtn: q('[onclick="App.diag()"]'),
    logBtn: q('[onclick="App.showLog()"]'), dbBtn: q('[onclick="App.dbDiag()"]'),
    syncBtn: !!document.querySelector('[onclick="App.sync()"]'),
    uiRun: !!(b && b.querySelector('[onclick="App.uiDiagRun()"]')),
    rg: !!(b && b.querySelector('#rg-btn')), bk: !!(b && b.querySelector('#bk-exp')), abk: !!(b && b.querySelector('[onclick="App.abkRun()"]')),
    outside: ['#rg-btn', '#bk-exp', '[onclick="App.abkRun()"]', '[onclick="App.uiDiagRun()"]', '[onclick="App.dbDiag()"]']
      .filter(s => [...document.querySelectorAll(s)].some(x => !x.closest(`.fold [onclick="App.foldToggle('dgs')"]`) && !(x.closest('#app > .fold') && x.closest('#app > .fold').querySelector(`:scope > .fold-h[onclick="App.foldToggle('dgs')"]`)))) };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— админ, ПК: раздел и подразделы —');
  {
    const p = await boot(br, 'demo-admin', 'desktop', 1280, 900, ['dgs', 'uid', 'diag', 'bkp', 'abk']);
    const a = await info(p);
    t('спойлер «Диагностика» есть, раскрыт, отдельного «Диагностика интерфейса» наверху нет',
      a.open && /^Диагностика$/.test(a.title) && a.top.includes('dgs') && !a.top.some(k => ['uid', 'diag', 'bkp', 'abk'].includes(k)), JSON.stringify(a.top));
    t('подразделы по порядку: Интерфейс · Тесты и регресс · Бэкап данных · Автобэкап',
      JSON.stringify(a.subs.map(x => x.k)) === '["uid","diag","bkp","abk"]' && /Интерфейс/.test(a.subs[0].txt) && /Тесты и регресс/.test(a.subs[1].txt),
      JSON.stringify(a.subs));
    t('сверху «Связь и журналы» со статусом синхронизации', a.net && a.netFirst && a.status, JSON.stringify(a));
    t('в ней «Проверить связь» с пилюлей, «Диагностика», «Журнал событий», «Диагностика БД»',
      a.netBtn && a.diagBtn && a.logBtn && a.dbBtn, JSON.stringify(a));
    t('кнопки «Синхронизировать» нет нигде', !a.syncBtn);
    t('содержимое подразделов на месте (проверка экрана, регресс, выгрузка бэкапа, автобэкап)', a.uiRun && a.rg && a.bk && a.abk, JSON.stringify(a));
    t('за пределами раздела копий нет', a.outside.length === 0, JSON.stringify(a.outside));
    const geo = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
      const hs = [...document.querySelectorAll('.fold-sub > .fold-h')].map(h => getComputedStyle(h));
      const closed = document.querySelector('.fold-sub:not(.on) > .fold-h');
      return { rad: hs.map(s => s.borderTopLeftRadius), closedBottom: closed ? getComputedStyle(closed).borderBottomColor : null,
        row: (() => { const bs = [...document.querySelectorAll('#dg-net .set-btns > .btn')].map(b => b.getBoundingClientRect());
          return bs.length > 1 && Math.abs(bs[0].top - bs[1].top) < 3 && bs[1].left - bs[0].right >= 6; })() };
    });
    t('подразделы — компактные заголовки (радиус 12px), кнопки связи в ряд с зазором', geo.rad.every(x => x === '12px') && geo.row, JSON.stringify(geo));
    /* кнопки работают */
    await p.click('#dg-net [onclick="App.showLog()"]'); await p.waitForTimeout(500);
    t('«Журнал событий» открывается', await p.evaluate(() => !!document.querySelector('#overlay')));
    await p.evaluate(() => window.App.closeModal()); await p.waitForTimeout(300);
    await p.click('#dg-net [onclick="App.diag()"]'); await p.waitForTimeout(700);
    t('«Диагностика» открывает окно отчёта', await p.evaluate(() => !!document.querySelector('#overlay #diag-pre')));
    await p.evaluate(() => window.App.closeModal()); await p.waitForTimeout(300);
    /* сворачивание подраздела не трогает раздел */
    await p.evaluate(() => window.App.foldToggle('bkp')); await p.waitForTimeout(300);
    const c = await info(p);
    t('свернули «Бэкап данных» — раздел открыт, остальные подразделы тоже', c.open && !c.bk && c.rg && c.abk, JSON.stringify({ open: c.open, bk: c.bk, rg: c.rg }));
    await p.close();
  }

  console.log('— раздел свёрнут по умолчанию —');
  {
    const p = await boot(br, 'demo-admin', 'mobile', 390, 900, []);
    const a = await info(p);
    t('свёрнутый раздел не рисует содержимое', !a.open && !a.net && !a.subs.length, JSON.stringify({ open: a.open, net: a.net }));
    await p.close();
  }

  console.log('— техник —');
  {
    const p = await boot(br, 'demo-tech', 'mobile', 390, 2400, ['dgs', 'uid', 'diag', 'bkp', 'abk']);
    const a = await info(p);
    t('у техника: связь и журналы + «Интерфейс», без БД/тестов/бэкапов',
      a.net && a.netBtn && a.diagBtn && a.logBtn && !a.dbBtn && JSON.stringify(a.subs.map(x => x.k)) === '["uid"]' && !a.rg && !a.bk && !a.abk,
      JSON.stringify(a));
    const over = await p.evaluate(() => {
      const b = document.querySelector('#dg-net'); const R = b.getBoundingClientRect();
      return [...b.querySelectorAll('.btn')].filter(x => { const r = x.getBoundingClientRect(); return r.right > R.right + 1; }).length;
    });
    t('на телефоне кнопки не вылезают за карточку', over === 0, over);
    await p.close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
