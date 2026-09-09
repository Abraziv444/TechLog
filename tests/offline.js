/* =====================================================================
   TechLog · tests/offline.js — отказоустойчивость при обрывах связи
   ---------------------------------------------------------------------
   Связь на объектах мобильная и рвётся, поэтому проверяем не «работает ли
   приложение», а «переживает ли оно обрыв»:
     1. приложение открывается БЕЗ сети — из кэша service worker;
     2. переходы между экранами в офлайне не ломаются;
     3. правки, сделанные в офлайне, не теряются после перезагрузки;
     4. очередь фото/видео переживает обрыв и перезагрузку;
     5. возврат сети не ломает состояние, документ остаётся открытым.

   Запуск:  node tests/offline.js [порт]      (по умолчанию 8080)
   Нужен playwright-core и Chromium; сервер поднимается отдельно.
   ===================================================================== */
const { chromium } = require('playwright-core');

const PORT = process.argv[2] || '8080';
const URL = 'http://127.0.0.1:' + PORT + '/index.html';
const CHROME = process.env.CHROME_PATH ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let ok = 0, bad = 0;
const T = (name, cond, extra) => {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (extra ? ' — ' + String(extra).slice(0, 160) : '')); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  await page.route('**://cdn.jsdelivr.net/**', r => r.abort());
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  console.log('\n— подготовка: первый заход, service worker ставится —');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => navigator.serviceWorker.getRegistration()
    .then(r => !!(r && (r.active || r.installing))).catch(() => false));
  T('service worker зарегистрирован', sw);
  /* ждём, пока он реально возьмёт страницу под контроль */
  await page.evaluate(() => navigator.serviceWorker.ready.catch(() => null));
  await page.waitForTimeout(800);

  console.log('\n— 1. запуск без сети —');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1800);
  const alive = await page.evaluate(() => {
    const app = document.getElementById('app');
    return { есть: !!app && app.children.length > 0, экран: (app || {}).className || '' };
  });
  T('приложение открылось из кэша без сети', alive.есть, JSON.stringify(alive));

  console.log('\n— 2. переходы по экранам в офлайне —');
  const nav = await page.evaluate(async () => {
    const out = [];
    for (const s of ['home', 'board', 'dirs', 'reports', 'settings']) {
      try { App.go(s); } catch (e) { out.push(s + ':' + e.message); continue; }
      await new Promise(r => setTimeout(r, 120));
      const app = document.getElementById('app');
      out.push(s + ':' + (app && app.children.length > 0 ? 'ок' : 'пусто'));
    }
    return out;
  });
  T('все экраны открываются в офлайне', nav.every(x => x.endsWith('ок')), nav.join(' '));

  console.log('\n— 3. правка в офлайне переживает перезагрузку —');
  await page.evaluate(() => App.go('home'));
  await page.waitForTimeout(400);
  const jobId = await page.evaluate(() => {
    const m = /App\.openJob\('([^']+)'/.exec(document.body.innerHTML) ||
              /App\.moveJob\('([^']+)'/.exec(document.body.innerHTML);
    return m ? m[1] : null;
  });
  await page.evaluate(i => App.openJob(i), jobId);
  await page.waitForTimeout(600);
  T('документ открылся в офлайне', await page.evaluate(() => !!document.getElementById('jb-note')));
  const MARK = 'офлайн-заметка ' + Date.now();
  await page.evaluate(m => {
    const ta = document.getElementById('jb-note');
    ta.value = m; ta.dispatchEvent(new Event('input', { bubbles: true }));
    App.saveJob(true);
  }, MARK);
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1600);
  const kept = await page.evaluate(m => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}');
    return (d.jobs || []).some(j => (j.note || '') === m);
  }, MARK);
  T('заметка, сделанная без сети, на месте после перезагрузки', kept);

  console.log('\n— 4. очередь фото переживает обрыв —');
  const q = await page.evaluate(async () => {
    return new Promise(res => {
      const req = indexedDB.open('tl-media');
      req.onsuccess = () => {
        const db = req.result;
        const names = [...db.objectStoreNames];
        if (!names.length) return res({ хранилище: 'пусто', записей: 0 });
        const tx = db.transaction(names[0], 'readonly');
        const all = tx.objectStore(names[0]).getAll();
        all.onsuccess = () => res({ хранилище: names[0], записей: all.result.length });
        all.onerror = () => res({ ошибка: 'чтение' });
      };
      req.onerror = () => res({ ошибка: 'открытие' });
    });
  });
  T('хранилище очереди доступно в офлайне', !q.ошибка, JSON.stringify(q));

  console.log('\n— 5. сеть вернулась —');
  await ctx.setOffline(false);
  await page.waitForTimeout(400);
  await page.evaluate(i => App.openJob(i), jobId);
  await page.waitForTimeout(700);
  const back = await page.evaluate(m => ({
    экран: (document.getElementById('app') || {}).className,
    заметка: (document.getElementById('jb-note') || {}).value === m,
    онлайн: navigator.onLine
  }), MARK);
  T('после возврата сети документ открывается', /scr-job/.test(back.экран), JSON.stringify(back));
  T('правка не потерялась при возврате сети', back.заметка);
  T('без ошибок в консоли за весь прогон', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
