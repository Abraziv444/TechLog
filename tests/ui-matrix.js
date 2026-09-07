/* =====================================================================
   TechLog · tests/ui-matrix.js — прогон интерфейса по матрице устройств
   ---------------------------------------------------------------------
   Открывает приложение в размерах настоящих телефонов, планшетов и
   мониторов, на каждом обходит все экраны движком «Диагностики
   интерфейса» (window.UIDiag) и складывает всё в один отчёт:

     tests/out/ui-matrix.md    — читаемый отчёт, замечания сгруппированы
                                 по сути, а не по устройству
     tests/out/ui-matrix.json  — то же машинно, для сравнения выпусков
     tests/out/shots/*.png     — снимки экранов (ключ --shots)

   Запуск:
     rm -rf /tmp/tlrun && cp -r . /tmp/tlrun
     echo 'window.TECHLOG_CONFIG = {};' > /tmp/tlrun/config.js
     (cd /tmp/tlrun && python3 -m http.server 8099 &) && sleep 2
     node tests/ui-matrix.js 8099            # весь набор
     node tests/ui-matrix.js 8099 --shots    # + снимки
     node tests/ui-matrix.js 8099 --only=iPhone,iPad
     node tests/ui-matrix.js 8099 --screens=home,settings

   Важно: вырез и домашнюю полосу iPhone эмулятор не воспроизводит —
   env(safe-area-inset-*) там всегда 0. Эти зоны проверяет уже сама
   кнопка диагностики на живом устройстве.
   ===================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const PORT = args.find(a => /^\d+$/.test(a)) || process.env.PORT || '8099';
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = args.includes('--shots');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').replace('--only=', '');
const SCREENS = (args.find(a => a.startsWith('--screens=')) || '').replace('--screens=', '');
const OUT = path.join(__dirname, 'out');

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/* w/h — CSS-пиксели (то, что видит вёрстка), dpr — плотность точек */
const DEVICES = [
  // ---- телефоны, режим «телефон» -------------------------------------
  { name: 'iPhone SE 2/3',        w: 375,  h: 667,  dpr: 2,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'iPhone 13 mini',       w: 375,  h: 812,  dpr: 3,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'iPhone 14/15',         w: 390,  h: 844,  dpr: 3,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'iPhone 16 Pro',        w: 402,  h: 874,  dpr: 3,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'iPhone 15 Plus',       w: 428,  h: 926,  dpr: 3,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'iPhone 16 Pro Max',    w: 440,  h: 956,  dpr: 3,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'Android узкий 360',    w: 360,  h: 740,  dpr: 3,   touch: 1, ua: UA_ANDROID, mode: 'mobile' },
  { name: 'Pixel 7',              w: 412,  h: 915,  dpr: 2.6, touch: 1, ua: UA_ANDROID, mode: 'mobile' },
  { name: 'минимум 320',          w: 320,  h: 568,  dpr: 2,   touch: 1, ua: UA_IOS,     mode: 'mobile' },
  { name: 'iPhone 14 альбом',     w: 844,  h: 390,  dpr: 3,   touch: 1, ua: UA_IOS,     mode: 'mobile' },

  // ---- планшеты, оба режима -------------------------------------------
  { name: 'iPad mini книжн.',     w: 744,  h: 1133, dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'mobile' },
  { name: 'iPad mini альбом',     w: 1133, h: 744,  dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'mobile' },
  { name: 'iPad mini альбом ПК',  w: 1133, h: 744,  dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'desktop' },
  { name: 'iPad 10.9 книжн.',     w: 820,  h: 1180, dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'mobile' },
  { name: 'iPad 10.9 альбом ПК',  w: 1180, h: 820,  dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'desktop' },
  { name: 'iPad Pro 12.9 книжн.', w: 1024, h: 1366, dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'desktop' },
  { name: 'iPad Pro 12.9 альбом', w: 1366, h: 1024, dpr: 2,   touch: 1, ua: UA_IPAD,    mode: 'desktop' },

  // ---- мониторы --------------------------------------------------------
  { name: 'ноутбук 1280',         w: 1280, h: 720,  dpr: 1,   touch: 0, ua: null,       mode: 'desktop' },
  { name: 'ноутбук 1280 телефон', w: 1280, h: 720,  dpr: 1,   touch: 0, ua: null,       mode: 'mobile' },
  { name: 'ноутбук 1366',         w: 1366, h: 768,  dpr: 1,   touch: 0, ua: null,       mode: 'desktop' },
  { name: 'MacBook 1440',         w: 1440, h: 900,  dpr: 2,   touch: 0, ua: null,       mode: 'desktop' },
  { name: 'Full HD 1920',         w: 1920, h: 1080, dpr: 1,   touch: 0, ua: null,       mode: 'desktop' },
  { name: '2K 2560',              w: 2560, h: 1440, dpr: 1,   touch: 0, ua: null,       mode: 'desktop' },
  { name: 'ultrawide 3440',       w: 3440, h: 1440, dpr: 1,   touch: 0, ua: null,       mode: 'desktop' },
];

/* оформительские замечания — печатаем, но сборку не валим */
const SOFT = ['contrast', 'hit', 'clip', 'paint', 'store'];

/* одинаковые по сути замечания склеиваем: числа из текста убираем */
const norm = s => String(s).replace(/\d+([.,]\d+)?/g, '#').replace(/«[^»]*»/g, '«…»').slice(0, 190);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (SHOTS) fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

  const list = ONLY ? DEVICES.filter(d => ONLY.split(',').some(x => d.name.toLowerCase().includes(x.trim().toLowerCase()))) : DEVICES;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];

  for (const d of list) {
    const ctx = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      deviceScaleFactor: d.dpr,
      hasTouch: !!d.touch,
      isMobile: !!d.touch && d.w < 900,
      userAgent: d.ua || undefined,
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    for (const p of ['**://*.jsdelivr.net/**', '**://*.cloudflare.com/**', '**://*.unpkg.com/**',
                     '**://*.googleapis.com/**', '**://*.gstatic.com/**', '**://*.supabase.co/**'])
      await page.route(p, r => r.abort());
    await page.addInitScript(mode => {
      localStorage.setItem('techlog_session_v1', 'demo-admin');
      localStorage.setItem('techlog_view_mode', mode);
    }, d.mode);

    let rec = { device: d, env: null, screens: [], hard: 0, soft: 0, errs, failed: null };
    try {
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.UIDiag && window.App, null, { timeout: 20000 });
      await page.waitForTimeout(1000);
      rec.env = await page.evaluate(() => window.UIDiag.env());

      const screens = SCREENS ? SCREENS.split(',').map(x => x.trim()) : null;
      const all = await page.evaluate(async only => {
        if (!only) return window.UIDiag.jsonAll();
        const out = [];
        for (const s of only) {
          window.App.go(s);
          await new Promise(r => setTimeout(r, 320));
          out.push(await window.UIDiag.json());
        }
        return { ts: new Date().toISOString(), env: window.UIDiag.env(), screens: out };
      }, screens);

      rec.screens = all.screens;
      all.screens.forEach(r => r.checks.forEach(c => c.items.forEach(i => {
        if (i.level === 'err') SOFT.includes(c.id) ? rec.soft++ : rec.hard++;
        else if (i.level === 'warn') rec.soft++;
      })));

      if (SHOTS) {
        for (const s of ['home', 'settings', 'board']) {
          try {
            await page.evaluate(x => window.App.go(x), s);
            await page.waitForTimeout(350);
            await page.screenshot({ path: path.join(OUT, 'shots', `${d.name.replace(/[^\wА-Яа-я]+/g, '_')}-${s}.png`), fullPage: false });
          } catch (e) {}
        }
      }
    } catch (e) {
      rec.failed = String(e).slice(0, 200);
    }
    await ctx.close();

    const flag = rec.failed ? '💥' : rec.hard ? '⛔' : rec.soft ? '⚠️ ' : '✓';
    console.log(`${flag} ${d.name.padEnd(22)} ${String(d.w + '×' + d.h).padStart(9)} ${d.mode.padEnd(8)} ` +
      `дефектов ${String(rec.hard).padStart(3)}  оформление ${String(rec.soft).padStart(3)}` +
      (rec.failed ? '  ' + rec.failed : '') + (errs.length ? `  ⛔ консоль: ${errs.length}` : ''));
    results.push(rec);
  }
  await browser.close();

  /* ---------------- сводим замечания по сути ------------------------- */
  const groups = new Map();
  results.forEach(rec => rec.screens.forEach(r => r.checks.forEach(c => c.items.forEach(i => {
    if (i.level === 'ok') return;
    const key = c.id + '|' + i.level + '|' + norm(i.msg);
    const g = groups.get(key) || { check: c.title, id: c.id, level: i.level, sample: i.msg, devices: new Set(), screens: new Set(), n: 0 };
    g.devices.add(rec.device.name); g.screens.add(String(r.screen).replace('scr-', '')); g.n++;
    groups.set(key, g);
  }))));

  const sorted = [...groups.values()].sort((a, b) =>
    (a.level === b.level ? 0 : a.level === 'err' ? -1 : 1) || b.devices.size - a.devices.size);
  const hardG = sorted.filter(g => g.level === 'err' && !SOFT.includes(g.id));
  const softG = sorted.filter(g => !(g.level === 'err' && !SOFT.includes(g.id)));

  const md = [];
  md.push('# TechLog · интерфейс по матрице устройств', '');
  md.push(`Собрано: ${new Date().toISOString()} · устройств: ${results.length} · экранов на каждом: ${results[0] ? results[0].screens.length : 0}`, '');
  md.push('## Сводка по устройствам', '');
  md.push('| Устройство | Размер | Режим | dpr | Дефектов | Оформление |', '|---|---:|---|---:|---:|---:|');
  results.forEach(r => md.push(`| ${r.device.name} | ${r.device.w}×${r.device.h} | ${r.device.mode} | ${r.device.dpr} | ${r.failed ? '💥' : r.hard} | ${r.soft} |`));
  md.push('');

  const block = (title, arr) => {
    md.push(`## ${title}`, '');
    if (!arr.length) { md.push('_пусто_', ''); return; }
    arr.forEach(g => {
      const dv = [...g.devices];
      md.push(`### ${g.level === 'err' ? '⛔' : '⚠️'} ${g.check}`);
      md.push('```', g.sample, '```');
      md.push(`* экраны: ${[...g.screens].join(', ')}`);
      md.push(`* устройств: ${dv.length} из ${results.length}${dv.length === results.length ? ' (везде)' : ' — ' + dv.slice(0, 8).join(', ') + (dv.length > 8 ? ' …' : '')}`);
      md.push(`* всего срабатываний: ${g.n}`, '');
    });
  };
  block('Дефекты', hardG);
  block('Оформление и предупреждения', softG);

  fs.writeFileSync(path.join(OUT, 'ui-matrix.md'), md.join('\n'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'ui-matrix.json'), JSON.stringify({
    ts: new Date().toISOString(),
    devices: results.map(r => ({ device: r.device, env: r.env, hard: r.hard, soft: r.soft, failed: r.failed, console: r.errs })),
    groups: sorted.map(g => ({ check: g.check, id: g.id, level: g.level, sample: g.sample, n: g.n, devices: [...g.devices], screens: [...g.screens] })),
  }, null, 1), 'utf8');

  const totalHard = results.reduce((a, r) => a + r.hard, 0);
  const crashed = results.filter(r => r.failed).length;
  console.log(`\nОтчёт: tests/out/ui-matrix.md · групп замечаний ${sorted.length} (дефектных ${hardG.length})`);
  console.log(`Итого: дефектов ${totalHard}, устройств не открылось ${crashed}`);
  process.exit(totalHard || crashed ? 1 : 0);
})().catch(e => { console.error('матрица упала:', e); process.exit(2); });
