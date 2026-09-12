/* =====================================================================
   TechLog · tests/tv.js — ТВ-режим в демо (Playwright, без Supabase).
   Запуск (сервер и тест в одном вызове; port — argv[2]):
     rm -rf /tmp/tlrun && cp -r . /tmp/tlrun \
       && echo 'window.TECHLOG_CONFIG = {};' > /tmp/tlrun/config.js \
       && (cd /tmp/tlrun && python3 -m http.server 8123 &) \
       && sleep 1 && node tests/tv.js 8123
   Проверяется: кнопка «Режим телевизора» на входе → экран ТВ (карта,
   сотрудники, карточки, часы) → «На весь экран»/✕ → у демо-админа в
   Настройках карточки «ТВ-экраны» (demo-заглушка) и «Режим телевизора»
   (чекбоксы, степперы с правилом авто-сжатия, конструктор зон).
   ===================================================================== */
const pw = require('playwright-core');
const PORT = process.argv[2] || '8123';
const BASE = `http://127.0.0.1:${PORT}/`;

const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('OK:', m); };

(async () => {
  const browser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (u.includes('tile.openstreetmap.org'))
      return r.fulfill({ contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    return r.abort();                      /* CDN (шрифты, Leaflet) — офлайн, у приложения есть фолбэки */
  });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);

  /* ---- 1. кнопка на экране входа и запуск ТВ ---- */
  const btn = p.locator('button', { hasText: /режим телевизора/i }).first();
  ok(await btn.count() > 0, 'на экране входа есть кнопка «Режим телевизора»');
  await btn.click();
  await p.waitForSelector('.tvwrap', { timeout: 5000 });
  ok(true, 'демо открывает экран ТВ сразу, без кода');
  ok(await p.locator('#tv-map .leaflet-container, #tv-map').count() > 0, 'карта дня на месте');
  ok(await p.locator('#tv-zrail .twg-workers').count() === 1, 'зона сотрудников в правой колонке');
  const workers = await p.locator('.bn-srow.tvw, .twtile').count();
  ok(workers >= 1, `строки/плитки сотрудников: ${workers}`);
  ok(/\d{2}:\d{2}/.test(await p.locator('#tv-clk').innerText()), 'часы идут');
  ok(await p.locator('.tv-stats .dcard').count() >= 1, 'карточки дня на месте');
  ok(await p.locator('#tv-zbot .twg').count() >= 1, 'график(и) под картой');

  /* ---- 2. полный экран и выход ---- */
  await p.locator('.tv-fsbtn').click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.body.classList.contains('tl-tvfs')), 'киоск-режим включился');
  ok(await p.locator('.tv-x').isVisible(), 'крестик появился справа сверху');
  await p.locator('.tv-x').click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.body.classList.contains('tl-tvfs')), 'крестик вернул обычный вид');

  /* ---- 3. отмена возвращает на вход ---- */
  await p.evaluate(() => App.tvCancel());
  await p.waitForTimeout(400);
  ok(await p.locator('.login-wrap').count() > 0, 'отмена вернула экран входа');

  /* ---- 4. настройки демо-админа: карточки ТВ ---- */
  await p.evaluate(() => {
    const adm = state.data.profiles.find(x => x.role === 'admin');
    App.demoLogin(adm.id);
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => App.go('settings'));
  await p.waitForTimeout(400);
  await p.evaluate(() => App.foldToggle('tvs'));
  await p.waitForTimeout(300);
  const tvsTxt = await p.locator('.fold.on .fold-b').first().innerText();
  ok(/supabase/i.test(tvsTxt), 'карточка «ТВ-экраны» в демо честно говорит про Supabase');
  await p.evaluate(() => App.foldToggle('tvs'));
  await p.evaluate(() => App.foldToggle('tvc'));
  await p.waitForTimeout(300);
  ok(await p.locator('.tvz-zone').count() === 2, 'конструктор: две зоны раскладки');
  ok(await p.locator('.tvz-item').count() === 5, 'конструктор: пять блоков');
  ok(await p.locator('.chk-line input').count() >= 7, 'семь чекбоксов «что показывать»');

  /* правило авто-сжатия: 10 > 6 в подсказке, степпер меняет значение */
  let hint = await p.locator('.fold.on .fold-b').first().innerText();
  ok(/10\s*[>&]/.test(hint) || hint.includes('10'), 'подсказка показывает «всего 10»');
  await p.evaluate(() => App.tvcStep('wTotal', -1));
  await p.waitForTimeout(300);
  hint = await p.locator('.fold.on .fold-b').first().innerText();
  ok(hint.includes('9'), 'степпер «показывать всего» уменьшил до 9');
  /* перенос блока между зонами */
  const railBefore = await p.locator('.tvz-zone').first().locator('.tvz-item').count();
  await p.evaluate(() => App.tvcSwap('chDay'));
  await p.waitForTimeout(300);
  const railAfter = await p.locator('.tvz-zone').first().locator('.tvz-item').count();
  ok(railAfter === railBefore + 1, `⇄ перенёс график в правую колонку (${railBefore}→${railAfter})`);
  await p.evaluate(() => App.tvcReset());
  await p.waitForTimeout(300);
  ok((await p.locator('.tvz-zone').first().locator('.tvz-item').count()) === 2, '«Сбросить» вернул раскладку по умолчанию');

  /* ---- 5. ТВ-экран уважает сохранённую раскладку (демо) ---- */
  await p.evaluate(() => { App.tvcFlag('chMi', false); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { App.logout ? App.logout() : (state.user = null, state.screen = 'login', render()); });
  await p.waitForTimeout(400);
  await p.locator('button', { hasText: /режим телевизора/i }).first().click();
  await p.waitForSelector('.tvwrap', { timeout: 5000 });
  const botTitles = await p.locator('#tv-zbot .twg-h').allInnerTexts();
  ok(!botTitles.join(' ').toLowerCase().includes('мил'), 'выключенный чекбоксом график миль не показан');

  const hard = errs.filter(e => !/tile|Failed to fetch|NetworkError|Leaflet|net::/i.test(e));
  ok(!hard.length, 'ошибок JS нет' + (hard.length ? ': ' + hard[0] : ''));
  await browser.close();
  console.log('\n=== tests/tv.js: все проверки пройдены ✅ ===');
})().catch(e => { console.error(e.message); process.exit(1); });
