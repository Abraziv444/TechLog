/* v1.09.03 — полки и ротация SQL-бэкапов (Edge Function backup).
   Чистые функции лежат в supabase/functions/backup/index.ts между метками
   PURE-BEGIN / PURE-END; тест вырезает этот блок, снимает типы компилятором
   TypeScript и гоняет сценарии: год ежедневных запусков, ручные копии, файлы
   старого формата, переименования, дубли дня, гонка двух устройств.
   Запуск: node tests/backup-rotation.js   (нужен пакет typescript:
   NODE_PATH=<папка с node_modules/typescript>; без него тест пропускается) */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let ts; try{ ts = require('typescript'); }catch(e){ console.log('SKIP: нет пакета typescript (npm i typescript)'); process.exit(0); }
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
function pure(file){
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf('/* PURE-BEGIN'), b = src.indexOf('/* PURE-END */');
  if (a < 0 || b < 0) throw new Error(file + ': нет меток PURE-BEGIN/PURE-END');
  const js = ts.transpileModule(src.slice(a, b), { compilerOptions: { target: 'ES2020' } }).outputText;
  return new Function(js + '\nreturn { KEEP_DAILY, isoWeek, nameKind, kindOf, dayOf, weekOf, bkPlan, bkRotate, bkCounts };')();
}
const F = pure('supabase/functions/backup/index.ts');
const D = pure('supabase/functions-dashboard/backup/index.ts');

console.log('— полки: вид копии —');
t('обе копии функции (functions / functions-dashboard) отличаются только импортом',
  fs.readFileSync(path.join(ROOT, 'supabase/functions/backup/index.ts'), 'utf8').replace('"../_shared/google.ts"', '"./google.ts"')
  === fs.readFileSync(path.join(ROOT, 'supabase/functions-dashboard/backup/index.ts'), 'utf8') && D.KEEP_DAILY === F.KEEP_DAILY);
t('KEEP_DAILY = 8', F.KEEP_DAILY === 8);
const f = (name, kind, created, extra) => ({ id: name + '#' + (created || ''), name, createdTime: created || '2026-09-19T10:00:00Z',
  appProperties: kind ? Object.assign({ tl_kind: kind }, extra || {}) : undefined });
t('ADMIN по имени и свойству', F.kindOf(f('TechLog-backup-2026-09-19_1432-ADMIN.sql', 'admin')) === 'admin');
t('weekly по имени и свойству', F.kindOf(f('TechLog-backup-2026-09-14-weekly-2026-W38.sql', 'weekly')) === 'weekly');
t('daily — только когда и имя, и свойство', F.kindOf(f('TechLog-backup-2026-09-19-daily.sql', 'daily')) === 'daily');
t('старый формат без пометки → legacy (не удаляется)', F.kindOf(f('TechLog-backup-2026-09-01.sql')) === 'legacy');
t('daily-имя БЕЗ свойства (положили руками) → legacy', F.kindOf(f('TechLog-backup-2026-09-19-daily.sql')) === 'legacy');
t('daily-свойство, но файл переименовали → legacy', F.kindOf(f('важный перед переездом.sql', 'daily')) === 'legacy');
t('daily переименовали в …-ADMIN.sql → admin (вечная пометка побеждает)', F.kindOf(f('TechLog-backup-2026-09-19-ADMIN.sql', 'daily')) === 'admin');
t('свойство admin, имя любое → admin', F.kindOf(f('x-daily.sql', 'admin')) === 'admin');
t('свойство weekly, имя daily → weekly', F.kindOf(f('TechLog-backup-2026-09-19-daily.sql', 'weekly')) === 'weekly');

console.log('— ISO-неделя —');
t('2026-09-19 (суббота) → 2026-W38', F.isoWeek('2026-09-19') === '2026-W38', F.isoWeek('2026-09-19'));
t('понедельник 2026-09-21 → W39, воскресенье 2026-09-20 → W38', F.isoWeek('2026-09-21') === '2026-W39' && F.isoWeek('2026-09-20') === '2026-W38');
t('стык годов: 2026-12-31 → 2026-W53, 2027-01-03 → 2026-W53, 2027-01-04 → 2027-W01',
  F.isoWeek('2026-12-31') === '2026-W53' && F.isoWeek('2027-01-03') === '2026-W53' && F.isoWeek('2027-01-04') === '2027-W01',
  [F.isoWeek('2026-12-31'), F.isoWeek('2027-01-03'), F.isoWeek('2027-01-04')].join(' '));
t('2024-12-30 → 2025-W01', F.isoWeek('2024-12-30') === '2025-W01');

console.log('— план автобэкапа —');
{
  const p0 = F.bkPlan([], '2026-09-19');
  t('пустая папка: нужен и daily, и weekly', p0.needDaily && p0.needWeekly && p0.week === '2026-W38' && p0.dailyTodayId === null);
  const day = f('TechLog-backup-2026-09-19-daily.sql', 'daily', '2026-09-19T12:00:00Z', { tl_day: '2026-09-19', tl_week: '2026-W38' });
  const wk = f('TechLog-backup-2026-09-14-weekly-2026-W38.sql', 'weekly', '2026-09-14T12:00:00Z', { tl_day: '2026-09-14', tl_week: '2026-W38' });
  const p1 = F.bkPlan([day, wk], '2026-09-19');
  t('сегодня daily уже есть и weekly этой недели есть → ничего не нужно (не чаще раза в день)', !p1.needDaily && !p1.needWeekly);
  const p2 = F.bkPlan([day], '2026-09-19');
  t('daily есть, weekly не вышел (сбой копии) → доделать только weekly, источник — сегодняшний daily',
    !p2.needDaily && p2.needWeekly && p2.dailyTodayId === day.id);
  const p3 = F.bkPlan([wk, f('TechLog-backup-2026-09-19_0900-ADMIN.sql', 'admin', '2026-09-19T13:00:00Z', { tl_day: '2026-09-19' })], '2026-09-19');
  t('ручной бэкап за сегодня автобэкапу не мешает: daily всё равно нужен', p3.needDaily && !p3.needWeekly);
  const p4 = F.bkPlan([day, wk], '2026-09-21');
  t('новая неделя: нужен и daily, и weekly', p4.needDaily && p4.needWeekly && p4.week === '2026-W39');
  t('файл старого формата за сегодня daily не считается', F.bkPlan([f('TechLog-backup-2026-09-19.sql')], '2026-09-19').needDaily);
}

console.log('— ротация: год ежедневных запусков —');
{
  let files = [];
  const legacy = ['2026-08-01', '2026-08-08', '2026-08-15'].map(d => f(`TechLog-backup-${d}.sql`, null, d + 'T10:00:00Z'));
  files.push(...legacy);
  const hand = { id: 'hand', name: 'dump от Алекса.sql', createdTime: '2026-08-20T10:00:00Z' };
  files.push(hand);
  let trashed = [], adminMade = 0;
  const start = Date.UTC(2026, 8, 19);
  for (let i = 0; i < 365; i++){
    const dt = new Date(start + i * 86400000), day = dt.toISOString().slice(0, 10), ct = day + 'T12:00:00Z';
    const plan = F.bkPlan(files, day);
    if (plan.needDaily) files.push(f(`TechLog-backup-${day}-daily.sql`, 'daily', ct, { tl_day: day, tl_week: plan.week }));
    if (plan.needWeekly) files.push(f(`TechLog-backup-${day}-weekly-${plan.week}.sql`, 'weekly', ct, { tl_day: day, tl_week: plan.week }));
    if (i % 30 === 0){ adminMade++; files.push(f(`TechLog-backup-${day}_1500-ADMIN.sql`, 'admin', day + 'T19:00:00Z', { tl_day: day, tl_by: 'abraziv777' })); }
    /* второй запуск в тот же день — сервер должен ответить skipped */
    const again = F.bkPlan(files, day);
    if (again.needDaily || again.needWeekly) throw new Error('повторный запуск за день не пропущен: ' + day);
    const out = F.bkRotate(files);
    trashed.push(...out); files = files.filter(x => !out.includes(x));
  }
  const c = F.bkCounts(files);
  t('после 365 дней: ежедневных ровно 8', c.daily === 8, c.daily);
  t('недельных — по одной на каждую неделю (53), ни одна не удалена', c.weekly === 53 && new Set(files.filter(x => F.kindOf(x) === 'weekly').map(F.weekOf)).size === 53, c.weekly);
  t('ручные бэкапы админа целы все (' + adminMade + ')', c.admin === adminMade, c.admin);
  t('файлы старого формата и положенный руками — на месте', c.legacy === 4 && legacy.every(x => files.includes(x)) && files.includes(hand));
  t('в корзину ушли ТОЛЬКО ежедневные (357 шт.)', trashed.length === 357 && trashed.every(x => F.nameKind(x.name) === 'daily' && x.appProperties.tl_kind === 'daily'), trashed.length);
  const last8 = files.filter(x => F.kindOf(x) === 'daily').map(F.dayOf).sort();
  t('оставшиеся ежедневные — последние 8 дней подряд', last8[0] === '2027-09-11' && last8[7] === '2027-09-18', last8.join(','));
}

console.log('— ротация: дубли дня, гонка, пропуски —');
{
  const mk = (day, hh) => f(`TechLog-backup-${day}-daily.sql`, 'daily', `${day}T${hh}:00:00Z`, { tl_day: day });
  const a = mk('2026-09-19', '10'), b = mk('2026-09-19', '11');             // два устройства одновременно
  const out = F.bkRotate([a, b]);
  t('два daily одного дня → в корзину уходит более старый, свежий остаётся', out.length === 1 && out[0] === a);
  const sparse = ['2026-09-19', '2026-09-10', '2026-08-30', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01', '2026-03-01', '2026-02-01'].map(d => mk(d, '12'));
  const o2 = F.bkRotate(sparse);
  t('админ заходит редко: хранится 8 последних КОПИЙ, а не 8 календарных дней', o2.length === 2 && o2.map(F.dayOf).sort().join() === '2026-02-01,2026-03-01');
  t('меньше 8 ежедневных — не удаляется ничего', F.bkRotate(sparse.slice(0, 8)).length === 0);
  const mixed = [...sparse, f('TechLog-backup-2026-01-01_1200-ADMIN.sql', 'admin', '2026-01-01T12:00:00Z'), f('TechLog-backup-2026-01-05-weekly-2026-W02.sql', 'weekly', '2026-01-05T12:00:00Z'), f('TechLog-backup-2025-12-01.sql', null, '2025-12-01T12:00:00Z')];
  t('самые старые в папке — ADMIN, weekly и старый формат — в ротацию не попадают', F.bkRotate(mixed).every(x => F.kindOf(x) === 'daily') && F.bkRotate(mixed).length === 2);
  t('bkRotate(keep=0) всё равно не трогает вечные', F.bkRotate(mixed, 0).length === 10 && F.bkRotate(mixed, 0).every(x => F.kindOf(x) === 'daily'));
}

console.log('— текст функции: страховки —');
{
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/backup/index.ts'), 'utf8');
  t('BK_VER = 1.09.03', src.includes('const BK_VER = "1.09.03";'));
  t('безвозвратного удаления нет: метод DELETE не используется, только trashed:true',
    !/method:\s*"DELETE"/.test(src) && src.includes('JSON.stringify({ trashed: true })'));
  t('в цикле ротации тройная проверка daily перед корзиной',
    src.includes('if (kindOf(f) !== "daily" || nameKind(f.name) !== "daily" || f.appProperties?.tl_kind !== "daily") continue;'));
  t('ручной бэкап: имя с временем и -ADMIN, свойства tl_kind=admin + tl_by; только человек-админ',
    src.includes('`TechLog-backup-${day}_${nyHM()}-ADMIN.sql`') && src.includes('meta("admin", day, week, adm.who)')
    && src.includes('if (kind === "admin" && !adm.ok) return jres({ error: "FORBIDDEN" }, 403);'));
  t('автобэкап: skipped до построения дампа; крон без kind → auto, JWT без kind → admin',
    src.indexOf('skipped: true') < src.indexOf('name = `TechLog-backup-${day}-daily.sql`')
    && src.includes('kp === "auto" || kp === "admin" ? kp : (byKey ? "auto" : "admin")'));
  t('weekly — копия daily средствами Диска, при сбое — своя выгрузка', src.includes('await copyFile(t, srcId, folder, weekly, meta("weekly", day, week, ""))')
    && src.includes('await upload(t, folder, weekly, sql, "application/sql", meta("weekly", day, week, ""))'));
  t('list: постранично, с appProperties, видом копии и счётчиками', src.includes('nextPageToken,files(id,name,createdTime,size,description,appProperties)')
    && src.includes('counts: bkCounts(files)') && src.includes('kind: kindOf(f)'));
}
console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
process.exit(bad ? 1 : 0);
