/* v1.09.47 — ПРОВЕРКА ПЕРЕД АВТОТЕСТАМИ (то же, что приложение делает перед своими тестами, но для репозитория):
     1. версия одна: app.js APP_VERSION = sw.js VERSION = version.json;
     2. миграции: файл базы DB_SQL_FILE есть, full-install заканчивается последним update-to, ранние секции не
        сужают CHECK-списки; если задан TL_PSQL (например "psql -h /tmp/pgsock -p 5433 -U postgres") — full-install
        выполняется на чистой базе дважды, между запусками кладутся «живые» строки (tests/full-install-rerun.sql);
     3. Edge Functions: каждая транспилируется TypeScript без ошибок и отвечает на ?ping своим именем; копии для
        Dashboard совпадают с исходниками (make-dashboard-copies.py --check);
     4. сервисы офлайн: Bouncie (tests/bouncie-tracks.js — функция с подменой Bouncie API). Google Диск офлайн
        проверяют tests/drive-paths.js (браузер) и прогоны media-* в tests/v1_09_40.js.
   Запуск: node tests/preflight.js   (выход 1 — есть проблема; тесты после неё запускать бессмысленно) */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + String(typeof note === 'string' ? note : JSON.stringify(note)).slice(0, 700) : '')); } }
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* 1. версия */
const app = read('app.js');
const av = (app.match(/const APP_VERSION = '([\d.]+)'/) || [])[1], sv = (read('sw.js').match(/const VERSION = '([\d.]+)'/) || [])[1], jv = JSON.parse(read('version.json')).version;
t(`версия одна везде: app.js ${av} · sw.js ${sv} · version.json ${jv}`, av && av === sv && sv === jv);

/* 2. миграции */
const sqlFile = (app.match(/const DB_SQL_FILE = '([^']+)'/) || [])[1];
const full = sqlFile && fs.existsSync(path.join(ROOT, 'supabase', sqlFile)) ? read('supabase/' + sqlFile) : '';
t(`файл базы ${sqlFile} есть`, !!full);
const lastDelta = (full.match(/ДЕЛЬТА · update-to-(\d_\d\d_\d\d)/g) || []).pop() || '';
const lastUp = lastDelta.replace('ДЕЛЬТА · ', '') + '.sql';
const upPath = path.join(ROOT, 'supabase', lastUp);
t(`full-install заканчивается последним обновлением (${lastUp})`, fs.existsSync(upPath) && full.endsWith(fs.readFileSync(upPath, 'utf8')));
{ const defs = {}; const re = /add\s+constraint\s+(\w+)\s+check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)\s*\)/gi; let m;
  while ((m = re.exec(full))) (defs[m[1]] = defs[m[1]] || []).push(new Set(m[3].split(',').map(s => s.trim())));
  const nar = []; for (const [n, l] of Object.entries(defs)){ const last = l[l.length - 1]; l.slice(0, -1).forEach(s => { const lost = [...last].filter(v => !s.has(v)); if (lost.length) nar.push(n + ' без ' + lost.join(',')); }); }
  t('ранние секции SQL не сужают CHECK-списки (повторный запуск на рабочей базе не упадёт)', !nar.length, nar); }
if (process.env.TL_PSQL){
  const sh = (cmd) => cp.execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const db = 'tl_preflight_' + Date.now().toString(36), base = process.env.TL_PSQL;
  try{
    sh(`${base} -q -c "create database ${db}"`);
    const stub = process.env.TL_STUB || '/tmp/stub.sql';
    if (fs.existsSync(stub)) sh(`${base} -d ${db} -q -f ${stub}`);
    const run = () => sh(`${base} -d ${db} -v ON_ERROR_STOP=1 -q -f ${path.join(ROOT, 'supabase', sqlFile)} 2>&1`);
    const r1 = run(); sh(`${base} -d ${db} -v ON_ERROR_STOP=1 -q -f ${path.join(__dirname, 'full-install-rerun.sql')}`); const r2 = run();
    t('миграции: чистая база → «живые» строки → повторный запуск — без ошибок', !/ERROR/.test(r1 + r2), (r1 + r2).split('\n').filter(l => /ERROR/.test(l)).slice(0, 3));
  }catch(e){ t('миграции на чистой базе', false, String(e.stderr || e.stdout || e.message).split('\n').filter(l => /ERROR/.test(l)).slice(0, 3).join(' | ') || String(e.message).slice(0, 300)); }
  try{ sh(`${base} -q -c "drop database if exists ${db}"`); }catch(e){}
} else console.log('  • TL_PSQL не задан — выполнение SQL на тестовой базе пропущено (статические проверки выполнены)');

/* 3. Edge Functions */
let ts = null; try{ ts = require('typescript'); }catch(e){}
const fdir = path.join(ROOT, 'supabase', 'functions');
const fns = fs.readdirSync(fdir).filter(n => !n.startsWith('_') && fs.existsSync(path.join(fdir, n, 'index.ts')));
const broken = [], noPing = [];
for (const n of fns){
  const src = fs.readFileSync(path.join(fdir, n, 'index.ts'), 'utf8');
  if (ts){ const r = ts.transpileModule(src, { reportDiagnostics: true, compilerOptions: { target: 99, module: 99 } }); if ((r.diagnostics || []).length) broken.push(n + ': ' + ts.flattenDiagnosticMessageText(r.diagnostics[0].messageText, ' ')); }
  if (!new RegExp('fn:\\s*"' + n + '"').test(src)) noPing.push(n);
}
t(`Edge Functions (${fns.length}): синтаксис без ошибок${ts ? '' : ' — typescript не найден, пропущено'}`, !broken.length, broken);
t('Edge Functions: каждая отвечает на ?ping своим именем', !noPing.length, noPing);
try{ const out = cp.execSync('python3 ' + path.join(ROOT, 'supabase', 'make-dashboard-copies.py') + ' --check', { encoding: 'utf8' }); t('копии функций для Dashboard совпадают с исходниками', /РАСХОЖДЕНИЯ: нет/.test(out), out.slice(0, 300)); }
catch(e){ t('копии функций для Dashboard совпадают с исходниками', false, String(e.stdout || e.message).slice(0, 300)); }

/* 4. сервисы офлайн */
if (ts){
  try{ const out = cp.execSync('node ' + path.join(__dirname, 'bouncie-tracks.js'), { encoding: 'utf8', env: process.env, timeout: 120000 });
    const m = out.match(/Итог: ✓ (\d+) · ✗ (\d+)/); t(`Bouncie офлайн (bouncie-tracks.js): ${m ? m[1] + ' ✓ / ' + m[2] + ' ✗' : '?'}`, m && m[2] === '0', out.split('\n').filter(l => /✗/.test(l)).slice(0, 3));
  }catch(e){ const out = String(e.stdout || ''); const m = out.match(/Итог: ✓ (\d+) · ✗ (\d+)/); t(`Bouncie офлайн (bouncie-tracks.js): ${m ? m[1] + ' ✓ / ' + m[2] + ' ✗' : 'не запустился'}`, false, out.split('\n').filter(l => /✗/.test(l)).slice(0, 3)); }
}
if (ts){
  try{ const out = cp.execSync('node ' + path.join(__dirname, 'drive-root.js'), { encoding: 'utf8', env: process.env, timeout: 60000 });
    const m = out.match(/Итог: ✓ (\d+) · ✗ (\d+)/); t(`Google Диск офлайн (drive-root.js — корень и папки): ${m ? m[1] + ' ✓ / ' + m[2] + ' ✗' : '?'}`, m && m[2] === '0', out.split('\n').filter(l => /✗/.test(l)).slice(0, 3));
  }catch(e){ const out = String(e.stdout || ''); t('Google Диск офлайн (drive-root.js)', false, out.split('\n').filter(l => /✗/.test(l)).slice(0, 3).join(' | ') || String(e.message).slice(0, 200)); }
}
console.log(`\nПРОВЕРКА ПЕРЕД ТЕСТАМИ: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
