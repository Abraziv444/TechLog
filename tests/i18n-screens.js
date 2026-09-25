/* v1.09.49 — ПЕРЕВОДЫ НА ЭКРАНЕ: приложение в английском интерфейсе проходит по всем экранам (и вкладкам
   Справочников, и раскрытым разделам Настроек) и собирает видимый текст на кириллице — подписи, подсказки
   (title, placeholder, aria-label). Каждая строка — либо непереведённая надпись интерфейса, либо данные
   (заметка, адрес), которые и должны остаться как есть. Список сравнивается с tests/i18n-baseline.json:
   новая кириллица в английском интерфейсе = провал. Итог — tests/out/i18n-screens.json.
   Запуск: node tests/i18n-screens.js [порт]   ·   обновить базовую линию: … --baseline */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WRITE_BASE = process.argv.includes('--baseline');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 1500) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_lang', 'en'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(700);
  const lang = await p.evaluate(() => state.lang);
  const found = await p.evaluate(async () => {
    const CYR = /[А-Яа-яЁё]/, out = {};
    const scan = where => {
      const add = (txt, el) => { txt = String(txt).replace(/\s+/g, ' ').trim(); if (!txt || !CYR.test(txt)) return;
        const tag = el ? (el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase())) : '';
        (out[where] = out[where] || new Set()).add(txt.slice(0, 120) + (tag ? '  [' + tag + ']' : '')); };
      const roots = [document.querySelector('#app'), document.getElementById('overlay'), document.querySelector('.topbar'), document.querySelector('.tabbar, nav')].filter(Boolean);
      roots.forEach(r => {
        const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())){ const el = n.parentElement; if (!el || el.closest('script,style,textarea,[contenteditable]')) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; add(n.textContent, el); }
        r.querySelectorAll('[title],[placeholder],[aria-label]').forEach(el => ['title', 'placeholder', 'aria-label'].forEach(a => { const v = el.getAttribute(a); if (v) add(v, el); }));
      });
    };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    _foldForce = true;
    const screens = ['home', 'board', 'map', 'docflow', 'approvals', 'proposals', 'repairs', 'stock', 'reports', 'stats', 'study', 'journal', 'acc', 'mycar', 'chat', 'archive', 'settings'];
    for (const s of screens){ try{ state.screen = s; render(); await wait(250); scan(s); }catch(e){ (out[s] = out[s] || new Set()).add('⛔ ' + e); } }
    state.screen = 'dirs'; _dirTabInit = true;
    for (const tab of ['staff', 'counterparties', 'complexes', 'worktypes', 'equipment', 'aux', 'price', 'extraworks', 'sizes', 'products', 'notes', 'vehicles', 'trackers', 'maint']){
      try{ state.dirTab = tab; render(); await wait(200); scan('dirs:' + tab); }catch(e){}
    }
    try{ const j = liveJobs()[0]; openJob(j.id); await wait(300); scan('job'); }catch(e){}
    try{ state.screen = 'home'; render(); closeModal(); }catch(e){}
    _foldForce = false;
    const res = {}; Object.keys(out).forEach(k => res[k] = [...out[k]].sort()); return res;
  });
  const all = Object.entries(found).flatMap(([k, v]) => v.map(x => k + ' :: ' + x));
  const basePath = path.join(__dirname, 'i18n-baseline.json');
  if (WRITE_BASE || !fs.existsSync(basePath)){ fs.writeFileSync(basePath, JSON.stringify({ at: new Date().toISOString().slice(0, 10), count: all.length, lines: all }, null, 2)); console.log('  • базовая линия записана: ' + basePath); }
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const fresh = all.filter(x => !base.lines.includes(x));
  t(`английский интерфейс включён (${lang})`, /en/.test(String(lang)), lang);
  t(`новой кириллицы в английском интерфейсе нет (сейчас строк ${all.length}, в базовой линии ${base.count})`, fresh.length === 0, fresh.slice(0, 30));
  try{ fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'i18n-screens.json'), JSON.stringify(found, null, 2)); }catch(e){}
  console.log('\nМЕТРИКИ ПЕРЕВОДА: экранов ' + Object.keys(found).length + ' с кириллицей · строк ' + all.length + ' · новых ' + fresh.length);
  Object.entries(found).forEach(([k, v]) => console.log('  ' + k + ': ' + v.length + ' — ' + v.slice(0, 3).join(' | ').slice(0, 260)));
  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
