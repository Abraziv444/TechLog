/* =====================================================================
   TechLog · tests/scroll-regress.js — прокрутка не сломала функции
   ---------------------------------------------------------------------
   С v1.07.67 блокирующие слушатели wheel/touchmove сняты с window и
   document и вешаются точечно: wheel — на .board при отрисовке,
   touchmove — на перетаскиваемые карточки главной. Этот тест сторожит
   ровно то, что от этого могло пострадать:
     1. touchmove действительно привязан к карточкам после render();
     2. перенос карточки пальцем (long-press → dragging) работает;
     3. доска по-прежнему едет по горизонтали от колеса;
     4. возврат ПК → телефон убирает надстройки desktop.js
        (наблюдатели гасят только поток мутаций #app, смена режима
        обрабатывается всегда);
     5. в консоли нет ошибок.

   Запуск — как у tests/ui-check.js:
     node tests/scroll-regress.js 8099
   ===================================================================== */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || process.env.PORT || '8099';
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let bad = 0;
  const ok = (name, pass, extra) => { console.log(`  ${pass ? '✓' : '⛔'} ${name}${extra ? ' — ' + extra : ''}`); if (!pass) bad++; };

  const page = await b.newPage({ viewport: { width: 414, height: 896 }, hasTouch: true, isMobile: true });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  for (const p of ['**://*.jsdelivr.net/**', '**://*.cloudflare.com/**', '**://*.unpkg.com/**',
                   '**://*.googleapis.com/**', '**://*.gstatic.com/**', '**://*.supabase.co/**'])
    await page.route(p, r => r.abort());
  await page.addInitScript(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.App);
  await page.waitForTimeout(1200);

  /* --- 1. слушатель touchmove на карточках ----------------------------- */
  await page.evaluate(() => window.App.go('home'));
  await page.waitForTimeout(500);
  const cards = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#app .item[data-drag-id]')];
    return { total: all.length, bound: all.filter(x => x.__tlTouch).length,
             can: all.filter(x => x.dataset.can === '1').length };
  });
  ok('touchmove привязан к перетаскиваемым карточкам', cards.can === 0 || cards.bound === cards.can,
     `карточек ${cards.total}, доступных для переноса ${cards.can}, с обработчиком ${cards.bound}`);

  /* --- 2. перенос пальцем ---------------------------------------------- */
  if (cards.can >= 1) {
    const dragged = await page.evaluate(async () => {
      const el = document.querySelector('#app .item[data-drag-id][data-can="1"]');
      if (!el) return 'нет карточки';
      const r = el.getBoundingClientRect();
      const opt = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
                    clientX: r.left + 20, clientY: r.top + 20 };
      el.dispatchEvent(new PointerEvent('pointerdown', opt));
      await new Promise(x => setTimeout(x, 420));            // long-press 340 мс
      const active = document.body.classList.contains('dnd-on');
      document.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, opt, { clientY: r.top + 140 })));
      const moved = el.classList.contains('dragging');
      document.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, opt, { clientY: r.top + 140 })));
      return active && moved ? 'ок' : `dnd-on=${active} dragging=${moved}`;
    });
    ok('перенос карточки пальцем (long-press → dragging)', dragged === 'ок', dragged === 'ок' ? '' : dragged);
    await page.waitForTimeout(400);
  } else ok('перенос карточки пальцем', true, 'нет карточек для переноса, пропуск');

  /* --- 3. доска и колесо ------------------------------------------------ */
  await page.evaluate(() => window.App.go('board'));
  await page.waitForTimeout(700);
  const bd = await page.evaluate(async () => {
    const el = document.querySelector('.board');
    if (!el) return { skip: 'доски нет' };
    if (el.scrollWidth <= el.clientWidth + 2) return { skip: 'доска не шире экрана' };
    const bound = !!el.__tlWheel, before = el.scrollLeft, r = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 300,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    await new Promise(x => setTimeout(x, 400));
    return { bound, before, after: el.scrollLeft };
  });
  if (bd.skip) ok('инерционная прокрутка доски колесом', true, bd.skip);
  else ok('инерционная прокрутка доски колесом', bd.bound && bd.after > bd.before,
          `обработчик=${bd.bound}, scrollLeft ${bd.before}→${bd.after}`);

  /* --- 4. уборка ПК-надстроек ------------------------------------------ */
  await page.evaluate(() => window.TLView.setMode('desktop'));
  await page.waitForTimeout(700);
  const onDesk = await page.evaluate(() => document.documentElement.className);
  await page.evaluate(() => window.TLView.setMode('mobile'));
  await page.waitForTimeout(700);
  const onMob = await page.evaluate(() => ({
    cls: document.documentElement.className,
    rail: !!document.getElementById('dsk-staff'),
    bar: !!document.getElementById('dsk-bar'),
  }));
  ok('возврат в мобильный режим убирает надстройки ПК',
     !/tl-desktop|tl-staff|tl-fit/.test(onMob.cls) && !onMob.rail && !onMob.bar,
     `ПК: "${onDesk}" → телефон: "${onMob.cls}"`);

  /* --- 5. консоль ------------------------------------------------------- */
  ok('без ошибок в консоли', errs.length === 0, errs.join(' | '));

  await b.close();
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nВсе функциональные проверки пройдены');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('тест упал:', e); process.exit(2); });
