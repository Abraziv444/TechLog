/* v1.09.46 — МЕТРИКИ КОДА: классы ошибок, которые уже ловили вручную, теперь считаются автоматически.
   Проверки (сбой = ошибка, которую увидит пользователь):
     · t('ключ') без перевода в RU или EN            → на экране сырой ключ;
     · App.xxx( в разметке, а в App такого нет        → кнопка молча не работает;
     · rpc('xxx') есть в приложении, а в базе нет       → операция падает у пользователя;
     · таблицы TABLES / колонки DB_NEED_COLS / функции DB_NEED_RPCS нет в SQL текущей версии;
     · CHECK-список в ранней секции SQL уже, чем в поздней → повторный запуск на рабочей базе падает (23514, как media_kind_check);
     · подсказка «выполните SQL» в Диагностике без проверки колонки/функции (как «задач без номера» в 1.09.44).
   Долговые метрики (не должны расти относительно tests/metrics-baseline.json):
     · ключи перевода, которые нигде не используются (мёртвые строки);
     · функции верхнего уровня, на которые нет ни одной ссылки (мёртвый код).
   Итог — tests/out/metrics-static.json. Запуск: node tests/metrics.js [порт] (демо-сервер, как у остальных тестов).
   Обновить базовую линию после уборки: node tests/metrics.js [порт] --baseline */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
const WRITE_BASE = process.argv.includes('--baseline');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 900) : '')); } }
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC_FILES = ['app.js', 'desktop.js', 'viewmode.js', 'uidiag.js', 'ui.js', 'uishots.js', 'proposal-tips.js'].filter(f => fs.existsSync(path.join(ROOT, f)));
const SRC = Object.fromEntries(SRC_FILES.map(f => [f, read(f)]));
const ALL = Object.values(SRC).join('\n');
const APP = SRC['app.js'];

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1300, height: 800 }, serviceWorkers: 'block' })).newPage();
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(500);
  const rt = await p.evaluate(() => ({ ru: Object.keys(I18N.ru), en: Object.keys(I18N.en), app: Object.keys(App), tables: TABLES,
    cols: DB_NEED_COLS, rpcs: DB_NEED_RPCS, sqlFile: DB_SQL_FILE,
    fns: Object.keys(window).filter(k => { try{ return typeof window[k] === 'function' && /^[a-z]/.test(k); }catch(e){ return false; } }) }));
  await br.close();
  const RU = new Set(rt.ru), EN = new Set(rt.en), APPK = new Set(rt.app);
  const SQL = read('supabase/' + rt.sqlFile);
  const M = {};

  /* 1) переводы: используемые ключи без перевода */
  const used = new Set(); let m;
  const reT = /\b(?:t|tipQ|toastInfo|tr)\(\s*'([a-z][a-z0-9_]*)'\s*\)/g;
  while ((m = reT.exec(ALL))) used.add(m[1]);
  const missRu = [...used].filter(k => !RU.has(k)), missEn = [...used].filter(k => !EN.has(k));
  M.i18n_missing = missRu.length + missEn.length;
  t(`переводы: у всех t('ключ') есть RU и EN (использовано ключей ${used.size})`, M.i18n_missing === 0, { ru: missRu.slice(0, 15), en: missEn.slice(0, 15) });
  /* мёртвые строки: ключ не встречается нигде как 'ключ' и не подходит под динамический префикс t('pre_' + …) */
  /* динамические ключи: 'pre_' + x или `pre_${x}` в любом месте кода (ключ собирается в переменную, потом t(k)) */
  const prefixes = new Set(); const reP = /['"]([a-z][a-z0-9_]*_)['"]\s*\+|`([a-z][a-z0-9_]*_)\$\{/g;
  while ((m = reP.exec(ALL))) prefixes.add(m[1] || m[2]);
  const reQ = /['"`]([a-z][a-z0-9_]{2,})['"`]/g; const lits = new Map();
  while ((m = reQ.exec(ALL))) lits.set(m[1], (lits.get(m[1]) || 0) + 1);
  const dictDecl = k => (APP.match(new RegExp('\\b' + k + ':', 'g')) || []).length;
  const deadKeys = rt.ru.filter(k => !used.has(k) && !(lits.get(k) > 0) && ![...prefixes].some(pr => k.startsWith(pr)) && dictDecl(k) <= 2);
  M.i18n_dead = deadKeys.length;

  /* 2) обработчики: App.xxx( в разметке */
  const NOCOMM = ALL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');   // без комментариев
  const onApp = new Set(); const reA = /\bApp\.([a-zA-Z_$][\w$]*)\s*\(/g;
  while ((m = reA.exec(NOCOMM))) onApp.add(m[1]);
  const missApp = [...onApp].filter(k => !APPK.has(k));
  M.app_missing = missApp.length;
  t(`кнопки: у всех App.xxx(…) есть обработчик (вызовов ${onApp.size})`, missApp.length === 0, missApp);

  /* 3) функции базы, которые зовёт приложение */
  const sqlFns = new Set(); const reF = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi;
  while ((m = reF.exec(SQL))) sqlFns.add(m[1]);
  const dropped = new Set(); const reD = /drop\s+function\s+if\s+exists\s+public\.([a-z_0-9]+)/gi;
  while ((m = reD.exec(SQL.slice(SQL.lastIndexOf('ДЕЛЬТА · update-to-1_09_4'))))) dropped.add(m[1]);
  const called = new Set(); const reR = /\.rpc\(\s*'([a-z_0-9]+)'/g;
  while ((m = reR.exec(ALL))) called.add(m[1]);
  /* функции из push-setup.sql ставятся отдельным скриптом — их отсутствие приложение проверяет само */
  const PUSH_SETUP = fs.existsSync(path.join(ROOT, 'supabase/push-setup.sql')) ? read('supabase/push-setup.sql') : '';
  const pushFns = new Set(); while ((m = reF.exec(PUSH_SETUP))) pushFns.add(m[1]);
  const missRpc = [...called].filter(f => (!sqlFns.has(f) || dropped.has(f)) && !pushFns.has(f));
  M.rpc_missing = missRpc.length;
  t(`функции базы: всё, что зовёт приложение (${called.size}), есть в ${rt.sqlFile}`, missRpc.length === 0, missRpc);
  const needMissRpc = rt.rpcs.filter(f => !sqlFns.has(f) || dropped.has(f));
  t(`проверка БД (DB_NEED_RPCS): все ${rt.rpcs.length} функций есть в SQL`, needMissRpc.length === 0, needMissRpc);

  /* 4) таблицы и колонки */
  const hasTable = tb => new RegExp('create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.' + tb + '\\s*\\(', 'i').test(SQL);
  const missTables = rt.tables.filter(tb => !hasTable(tb));
  t(`таблицы TABLES (${rt.tables.length}) есть в SQL`, missTables.length === 0, missTables);
  const hasCol = (tb, c) => new RegExp('alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.' + tb + '[^;]*add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?' + c + '\\b', 'i').test(SQL)
    || (() => { const re = new RegExp('create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.' + tb + '\\s*\\(([\\s\\S]*?)\\n\\);', 'gi'); let mm, found = false; while ((mm = re.exec(SQL))) if (new RegExp('(^|\\n|,)\\s*' + c + '\\s').test(mm[1])) found = true; return found; })();
  const missCols = rt.cols.filter(([tb, c]) => !hasCol(tb, c)).map(x => x.join('.'));
  M.db_cols_missing = missCols.length;
  t(`колонки DB_NEED_COLS (${rt.cols.length}) есть в SQL`, missCols.length === 0, missCols);

  /* 5) SQL: ранняя секция сужает CHECK-список, поздняя расширяет → повторный запуск на рабочих данных падает */
  const defs = {}; const reC = /add\s+constraint\s+(\w+)\s+check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)\s*\)/gi;
  while ((m = reC.exec(SQL))) (defs[m[1]] = defs[m[1]] || []).push(new Set(m[3].split(',').map(s => s.trim())));
  const narrowing = [];
  for (const [name, list] of Object.entries(defs)){
    const last = list[list.length - 1];
    list.slice(0, -1).forEach(s => { const lost = [...last].filter(v => !s.has(v)); if (lost.length) narrowing.push(name + ': ранняя секция без ' + lost.join(',')); });
  }
  M.sql_check_narrowing = narrowing.length;
  t('SQL: ни одна ранняя секция не сужает CHECK-список (повторный запуск на рабочей базе безопасен)', narrowing.length === 0, narrowing);

  /* 6) Диагностика: призыв «выполните SQL» только там, где проверяется наличие колонки/функции */
  const diagSrc = APP.slice(APP.indexOf('async function runDiagnostics('), APP.indexOf('// хвост журнала'));
  const hints = diagSrc.split('\n').filter(l => /выполните supabase\//.test(l));
  /* подсказка признаётся обоснованной, если в строке есть проверка схемы или явная пометка «sql-hint: …» с причиной */
  const blind = hints.filter(l => !/sql-hint:|noCol|no_col|DB_NEED|missing|miss\b|needSql|PGRST|42703|42883|does not exist|column|колонк|функци/i.test(l));
  M.diag_blind_sql_hints = blind.length;
  t(`Диагностика: каждая подсказка «выполните SQL» (${hints.length}) опирается на проверку колонки / функции`, blind.length === 0, blind.map(s => s.trim().slice(0, 140)));

  /* 7) мёртвый код: функции верхнего уровня без ссылок */
  const ours = fn => new RegExp('(^|\\n)\\s*(async\\s+)?function\\s+' + fn + '\\s*\\(').test(ALL);   // только наши функции, не встроенные в браузер
  const deadFns = rt.fns.filter(ours).filter(fn => { const n = (NOCOMM.match(new RegExp('\\b' + fn.replace(/\$/g, '\\$') + '\\b', 'g')) || []).length; return n <= 1; });
  M.dead_functions = deadFns.length;

  /* базовая линия долга */
  const basePath = path.join(__dirname, 'metrics-baseline.json');
  const cur = { i18n_dead: M.i18n_dead, dead_functions: M.dead_functions, i18n_dead_list: deadKeys.sort(), dead_functions_list: deadFns.sort() };
  if (WRITE_BASE || !fs.existsSync(basePath)){ fs.writeFileSync(basePath, JSON.stringify({ at: new Date().toISOString().slice(0, 10), ...cur }, null, 2)); console.log('  • базовая линия записана: ' + basePath); }
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const newDeadKeys = deadKeys.filter(k => !base.i18n_dead_list.includes(k)), newDeadFns = deadFns.filter(f => !base.dead_functions_list.includes(f));
  t(`мёртвые строки перевода не прибавились (сейчас ${M.i18n_dead}, в базовой линии ${base.i18n_dead})`, newDeadKeys.length === 0, newDeadKeys);
  t(`мёртвые функции не прибавились (сейчас ${M.dead_functions}, в базовой линии ${base.dead_functions})`, newDeadFns.length === 0, newDeadFns);

  const out = { at: new Date().toISOString(), sql: rt.sqlFile, ...M, i18n_used: used.size, app_handlers: onApp.size, rpc_called: called.size, tables: rt.tables.length, db_need_cols: rt.cols.length };
  try{ fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'metrics-static.json'), JSON.stringify(out, null, 2)); }catch(e){}
  console.log('\nМЕТРИКИ КОДА: ключей без перевода ' + M.i18n_missing + ' · кнопок без обработчика ' + M.app_missing + ' · RPC нет в базе ' + M.rpc_missing +
    ' · колонок нет в SQL ' + M.db_cols_missing + ' · сужений CHECK ' + M.sql_check_narrowing + ' · «выполните SQL» без проверки ' + M.diag_blind_sql_hints +
    ' · мёртвых строк ' + M.i18n_dead + ' · мёртвых функций ' + M.dead_functions);
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
