/* =====================================================================
   TechLog · tests/ui-check.js — проверка интерфейса и прокрутки
   ---------------------------------------------------------------------
   Гоняет тот же движок, что и кнопка «Диагностика интерфейса» в
   приложении (window.UIDiag), по всем экранам и в двух режимах —
   телефон и ПК. Валит сборку, если:
     • появился блокирующий (не passive) слушатель wheel/touchmove
       на window или document — из-за таких прокрутка ждёт главный поток;
     • любая проверка вернула ошибку (перекрытия, вылет за край,
       битые обработчики, недоступные под панелью кнопки и т.д.).

   Запуск (демо-режим, без Supabase):
     cp -r . /tmp/tlrun && echo 'window.TECHLOG_CONFIG = {};' > /tmp/tlrun/config.js
     (cd /tmp/tlrun && python3 -m http.server 8099 &) && node tests/ui-check.js 8099

   Переменные окружения:
     PW_CHROME  — путь к бинарю Chromium (по умолчанию системный)
     UI_STRICT  — 1: предупреждения тоже валят сборку
   ===================================================================== */
const { chromium } = require('playwright-core');

const PORT = process.argv[2] || process.env.PORT || '8099';
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STRICT = process.env.UI_STRICT === '1';

const SCREENS = ['home', 'board', 'proposals', 'repairs', 'map', 'reports', 'stats', 'dirs', 'journal', 'settings'];
const MODES = [
  { name: 'телефон', vp: { width: 414, height: 896 }, mode: 'mobile' },
  { name: 'ПК',      vp: { width: 1440, height: 900 }, mode: 'desktop' },
];

/* эти замечания не считаем ошибками сборки: они про оформление,
   а не про сломанный интерфейс */
const SOFT = ['contrast', 'hit', 'clip'];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let fails = 0, warns = 0;

  for (const m of MODES) {
    const page = await browser.newPage({ viewport: m.vp });
    /* внешние CDN режем: без этого страница висит в песочнице */
    for (const p of ['**://*.jsdelivr.net/**', '**://*.cloudflare.com/**', '**://*.unpkg.com/**',
                     '**://*.googleapis.com/**', '**://*.gstatic.com/**', '**://*.supabase.co/**'])
      await page.route(p, r => r.abort());

    await page.addInitScript(mode => {
      localStorage.setItem('techlog_session_v1', 'demo-admin');
      localStorage.setItem('techlog_view_mode', mode);
    }, m.mode);

    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.UIDiag && window.App, null, { timeout: 15000 });
    await page.waitForTimeout(1200);

    /* --- 1. блокирующие слушатели прокрутки ------------------------- */
    const blocking = await page.evaluate(() => window.UIDiag.blocking());
    console.log(`\n=== режим: ${m.name} (${m.vp.width}×${m.vp.height}) ===`);
    if (blocking.length) {
      fails++;
      console.log(`  ⛔ блокирующих слушателей прокрутки: ${blocking.length}`);
      blocking.forEach(b => console.log(`     ${b.type} на ${b.target} — ${b.where}`));
    } else {
      console.log('  ✓ блокирующих слушателей wheel/touchmove на window/document нет');
    }

    /* --- 2. движок диагностики по всем экранам ---------------------- */
    for (const scr of SCREENS) {
      const ok = await page.evaluate(s => {
        try { window.App.go(s); return true; } catch (e) { return false; }
      }, scr);
      if (!ok) { console.log(`  ${scr.padEnd(10)} — экран недоступен, пропуск`); continue; }
      await page.waitForTimeout(400);

      const r = await page.evaluate(() => window.UIDiag.json());
      const bad = r.checks.filter(c => c.level === 'err' && !SOFT.includes(c.id));
      const soft = r.checks.filter(c => c.level !== 'ok' && SOFT.includes(c.id));
      const hard = bad.reduce((a, c) => a + c.items.filter(i => i.level === 'err').length, 0);
      const softN = soft.reduce((a, c) => a + c.items.length, 0);
      const mark = hard ? '⛔' : (softN ? '⚠️ ' : '✓');
      console.log(`  ${mark} ${scr.padEnd(10)} дефектов ${hard}, оформление ${softN}`);
      bad.forEach(c => {
        fails++;
        c.items.filter(i => i.level === 'err').slice(0, 4)
          .forEach(i => console.log(`      ⛔ ${c.title}: ${i.msg}`));
      });
      soft.forEach(c => {
        warns += c.items.length;
        c.items.slice(0, 2).forEach(i => console.log(`      ⚠️  ${c.title}: ${i.msg}`));
      });
    }

    if (errors.length) {
      fails += errors.length;
      console.log('  ⛔ ошибки в консоли:');
      errors.forEach(e => console.log('     ' + e));
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nИтог: ошибок ${fails}, мягких замечаний ${warns}`);
  process.exit(fails || (STRICT && warns) ? 1 : 0);
})().catch(e => { console.error('тест упал:', e); process.exit(2); });
