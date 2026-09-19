/* v1.08.90 — (1) «Диагностика» открывает окно мгновенно и наполняет его по
   мере проверок; (2) карточка «Синхронизировать» объясняет, что с чем;
   (3) раздел «Push уведомления» с кнопкой «Проверить работу уведомлений»:
   пошаговая проверка и по одному уведомлению каждого отмеченного вида
   с настоящим номером документа. Запуск: node tests/v1_08_90.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, mode, noSw){
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['notifications'],
    /* для проверки «окно раньше отчёта» service worker выключаем: иначе запросы
       отчёта уходят из него и перехватить их в тесте нельзя */
    serviceWorkers: noSw ? 'block' : 'allow' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate((m) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', m);
    localStorage.setItem('techlog_fold', '{"push":1}'); }, mode);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(600);
  return p;
}
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— диагностика: окно сразу, строки по мере проверок —');
  {
    const p = await boot(br, 'desktop', true);
    /* притормаживаем одну из проверок отчёта — так видно, что окно открылось
       ДО её завершения и наполняется по ходу (в демо всё иначе слишком быстро) */
    await p.route(/version\.json/, async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); });
    const t0 = Date.now();
    await p.evaluate(() => { window.App.diag(); });   // не ждём промис: важна реакция, а не конец проверок
    await p.waitForSelector('#overlay #diag-pre', { timeout: 2000 });
    const ms = Date.now() - t0;
    const a = await p.evaluate(() => {
      const pre = document.querySelector('#overlay #diag-pre');
      return { len: pre.textContent.length, h: Math.round(pre.getBoundingClientRect().height),
        copyOff: document.querySelector('#overlay #diag-copy').disabled };
    });
    t('окно появляется сразу (< 1.5 с) и не пустое', ms < 1500 && a.len > 0, ms + ' мс · ' + JSON.stringify(a));
    t('пустое окно уже нужного размера (высота отчёта ≥ 300 px)', a.h >= 300, JSON.stringify(a));
    t('«Скопировать отчёт» пока недоступна — проверки ещё идут', a.copyOff);
    await p.waitForTimeout(5000);
    const b = await p.evaluate(() => ({ len: document.querySelector('#overlay #diag-pre').textContent.length,
      copyOff: document.querySelector('#overlay #diag-copy').disabled,
      tail: /последние события журнала/i.test(document.querySelector('#overlay #diag-pre').textContent) }));
    t('строки дописались, отчёт дошёл до конца, «Скопировать» включилась', b.len > a.len && b.tail && !b.copyOff, JSON.stringify([a.len, b]));
    await p.evaluate(() => window.App.closeModal());
    await p.close();
  }

  console.log('— статус синхронизации объяснён (v1.08.96: «Связь и журналы» в «Диагностике», без кнопки) —');
  {
    const p = await boot(br, 'desktop');
    await p.evaluate(() => { const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (!f.dgs) window.App.foldToggle('dgs'); });
    await p.waitForTimeout(400);
    const c = await p.evaluate(() => {
      const card = document.querySelector('#dg-net');
      const q = card && card.querySelector('.tipq');
      return { q: !!q, oc: q && q.getAttribute('onclick'), st: !!card && /Синхронизировано/.test(card.textContent),
        noBtn: !document.querySelector('[onclick="App.sync()"]') };
    });
    t('у строки «Синхронизировано» есть «?» с объяснением', c.q && /toastInfo\('sync_tip'\)/.test(c.oc), JSON.stringify(c));
    t('кнопки «Синхронизировать» нет, статус на месте', c.noBtn && c.st, JSON.stringify(c));
    await p.evaluate(() => document.querySelector('#dg-net .tipq').click());
    await p.waitForTimeout(300);
    t('«?» показывает подсказку про обмен данными', await p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].some(x => /наверх уходит всё, что вы создали/.test(x.textContent))));
    await p.close();
  }

  console.log('— Push уведомления: раздел и проверка —');
  {
    const p = await boot(br, 'desktop');
    /* ловим системные уведомления, которые покажет service worker */
    await p.evaluate(() => {
      window.__notes = [];
      navigator.serviceWorker.ready.then(reg => {
        const orig = reg.showNotification.bind(reg);
        reg.showNotification = (title, opt) => { window.__notes.push({ title, body: (opt || {}).body, tag: (opt || {}).tag }); return orig(title, opt); };
      });
    });
    await p.waitForTimeout(400);
    const head = await p.evaluate(() => {
      const f = [...document.querySelectorAll('#app .fold')].find(x => /уведомлени/i.test(x.textContent));
      return { title: f.querySelector('.fold-h').textContent.trim(), btn: !!f.querySelector('[onclick="App.pushTest()"]'),
        hint: /по одному уведомлению каждого отмеченного вида/.test(f.textContent) };
    });
    t('раздел называется «Push уведомления»', /Push уведомления/.test(head.title), head.title);
    t('в разделе есть кнопка «Проверить работу уведомлений» с пояснением', head.btn && head.hint, JSON.stringify(head));
    await p.evaluate(() => document.querySelector('#app [onclick="App.pushTest()"]').click());
    await p.waitForSelector('#overlay #pt-log', { timeout: 2000 });
    await p.waitForTimeout(5000);
    const r = await p.evaluate(() => ({
      lines: [...document.querySelectorAll('#overlay #pt-log > div')].map(d => d.className.replace('mq-l', '').trim() + ' | ' + d.textContent.trim()),
      notes: window.__notes || [] }));
    const txt = r.lines.join('\n');
    t('шаги проверки пройдены: поддержка, разрешение, service worker, подписка',
      /ok \| ✓ Поддержка браузером/.test(txt) && /ok \| ✓ Разрешение на уведомления/.test(txt) && /ok \| ✓ Service worker/.test(txt) && /Подписка этого устройства/.test(txt), txt.slice(0, 400));
    t('показано по уведомлению на каждый отмеченный вид', r.notes.length >= 5, JSON.stringify(r.notes.map(x => x.title)));
    t('заголовки — виды уведомлений, у каждого свой тег',
      r.notes.some(x => /Новая задача/.test(x.title)) && r.notes.some(x => /Новый пикап/.test(x.title))
      && new Set(r.notes.map(x => x.tag)).size === r.notes.length, JSON.stringify(r.notes));
    t('в тексте — настоящий документ: юнит и дата', r.notes.every(x => /Unit .+·/.test(x.body) || /TechLog|#/.test(x.body)), JSON.stringify(r.notes.map(x => x.body)));
    t('итог и подсказка «если ничего не появилось»', /Показано уведомлений: \d+/.test(txt) && /Не беспокоить/.test(txt), txt.slice(-300));
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
