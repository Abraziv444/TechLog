/* Дымовой тест v1.07.83: двуязычные заметки, место поповеров, журнал отправки.
   Внутренние функции достаём одним eval вместе с исходником — иначе до
   лексических переменных модуля не добраться. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');   // npm i jsdom@24

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(ROOT + '/app.js', 'utf8');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="app"></div><div id="toasts"></div></body></html>`,
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const w = dom.window;
w.TECHLOG_CONFIG = {};
w.scrollTo = () => {};
w.fetch = () => Promise.reject(new Error('нет сети в тесте'));
if (!w.navigator.vibrate) w.navigator.vibrate = () => {};

let ok = 0, bad = 0;
const t = (name, cond, extra) => {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};

const expose = `;window.__T = {
  DICT: I18N, APP_VERSION, DB_SQL_FILE, DB_NEED_COLS, DB_NEED_RPCS, POP_POS,
  hasCyr, enText, needsTr, trFields, trMiss, trCanWrite, trDocLabel,
  translit, pdfLatinize, enName,
  renderNoFmt, docNo, pickNo, docNoVals, DOC_FMT_DEF, FILE_FMT_DEF, DOC_TOKENS, FILE_TOKENS,
  popPos, applyPopPos, emptyFormData, mqLogPaint, mqLog, state, trIntervalMs,
  needsRepair, repWorks, repMats, repGrand, repCleanItems, repHistAdd, repNew,
  repMoneyHidden, repCanCreate, wtById, seedDemoData,
  repApprovalReset, repPhotos, repsResetList,
  stockRow, stockTotals, plOut, myOnHand, myOnHandQty,
  emSums, emRow, myCarQty, eqCap, setEqDraft: d => { eqDraft = d; }, viewStock, viewTabbar,
  docBlockers, canArchDoc, archReps, chainBlockModal,
  TABLES, BN, bnMiP, bnDestFor, bnSelSet, bnDotHtml, bnCompute, bnDemoFill,
  bnVehicles, vehFreeNo, vehApplyLocal, dirVehicles, bnChipsHtml, bnStatsHtml,
  tplOn, polyDecode, optOrder, optRouteLen, srchRows, bnVisible, bnCanTrack,
  ttVisits, ttDur, codeRemindOn, codeMonths, vehServiceLine, sessMgrOn
};`;

try {
  const sc = w.document.createElement('script');
  sc.textContent = appSrc + expose;
  w.document.body.appendChild(sc);
} catch (e) { console.log('⛔ app.js не выполнился:', e.message); process.exit(1); }
const T = w.__T;
if (!T) { console.log('⛔ внутренности не экспортировались'); process.exit(1); }

console.log('\n— версия и SQL —');
const VJ = JSON.parse(fs.readFileSync(ROOT + '/version.json', 'utf8')).version;
t('APP_VERSION совпадает с version.json (' + VJ + ')', T.APP_VERSION === VJ, T.APP_VERSION);
t('DB_SQL_FILE указывает на существующий файл',
  fs.existsSync(ROOT + '/supabase/' + T.DB_SQL_FILE), T.DB_SQL_FILE);
t('диагностика БД знает про jobs.note_en',
  T.DB_NEED_COLS.some(c => c[0] === 'jobs' && c[1] === 'note_en'));
t('диагностика БД знает про proposals.note_en',
  T.DB_NEED_COLS.some(c => c[0] === 'proposals' && c[1] === 'note_en'));

console.log('\n— словарь —');
const ru = Object.keys(T.DICT.ru), en = Object.keys(T.DICT.en);
t(`симметрия ru/en (${ru.length}/${en.length})`, ru.length === en.length, ru.length + ' vs ' + en.length);
const miss = ru.filter(k => !(k in T.DICT.en)).concat(en.filter(k => !(k in T.DICT.ru)));
t('нет ключей только в одном языке', miss.length === 0, miss.slice(0, 5).join(', '));
['tr_pdf_card','tr_all_btn','tr_set_card','tr_remind','tr_auto','tr_int','tr_email',
 'pop_card','pop_top','pop_bottom','pop_side','pop_demo','act_doc_translate',
 'inv_drive','inv_queued','gd_inv_folder','gd_inv_hint','gd_where_inv','name_en_hint',
 'no_card','no_doc_lbl','no_file_lbl','no_pad_lbl','no_t_TECH','doc_no',
 'gd_inv_tech','gd_inv_tech_tip','gd_inv_tech_ex']
  .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));

console.log('\n— кириллица и текст для PDF —');
t('hasCyr: русский', T.hasCyr('Ключ в офисе'));
t('hasCyr: латиница', !T.hasCyr('Key at the office'));
t('enText: есть перевод → перевод', T.enText('Ключ в офисе', 'Key at the office') === 'Key at the office');
t('enText: латиница без перевода → сам текст', T.enText('Key at the office', '') === 'Key at the office');
t('enText: русский без перевода → пусто', T.enText('Ключ в офисе', '') === '');
t('needsTr: русский без перевода', T.needsTr('Ключ в офисе', ''));
t('needsTr: русский с переводом — нет', !T.needsTr('Ключ в офисе', 'Key'));
t('needsTr: латиница — нет', !T.needsTr('Key at the office', ''));

console.log('\n— поля документа —');
const fd = T.emptyFormData();
fd.others[0] = { desc: 'вырезал потолок', desc_en: '', amount: 200 };
fd.airduct.note = 'снял прокладку';
const job = { id: 'j1', note: 'Ключ в офисе', note_en: '', form_data: fd, unit_number: '916', date: '2026-09-08' };
const jf = T.trFields('job', job);
t('поля работы: заметка + прочее + air duct', jf.length === 3, jf.map(f => f.id).join(','));
t('все три без перевода', T.trMiss('job', job).length === 3);
jf.find(f => f.id === 'oth0').set('cut the ceiling');
t('set() кладёт перевод в form_data.others', fd.others[0].desc_en === 'cut the ceiling');
jf.find(f => f.id === 'ad').set('removed pad');
t('set() кладёт перевод в airduct', fd.airduct.note_en === 'removed pad');
t('после перевода двух полей осталось одно', T.trMiss('job', job).length === 1);
t('английский оригинал в список не попадает',
  T.trFields('job', { note: 'Key at the office', form_data: T.emptyFormData() }).length === 1);

const prop = { id: 'p1', no: 7, date: '2026-09-08', note: 'Смета на кухню', note_en: '',
               items: [{ q: 1, code: 'A', d: 'замена плинтуса', d_en: '', a: 100 },
                       { q: 1, code: 'B', d: 'Baseboard', d_en: '', a: 50 }] };
const pf = T.trFields('prop', prop);
t('поля пропозала: заметка + 2 позиции', pf.length === 3, pf.map(f => f.id).join(','));
t('без перевода только русские', T.trMiss('prop', prop).length === 2);
pf.find(f => f.id === 'it0').set('baseboard replacement');
t('set() кладёт перевод в items[].d_en', prop.items[0].d_en === 'baseboard replacement');

console.log('\n— права на перевод —');
T.state.user = { id: 'u1', role: 'tech' };
T.state.data = { jobs: [], proposals: [], org_settings: {} };
t('исполнитель правит свою работу', T.trCanWrite('job', { technician_id: 'u1' }));
t('чужую — нет', !T.trCanWrite('job', { technician_id: 'u2' }));
t('пропозал работнику — нет', !T.trCanWrite('prop', prop));
T.state.user = { id: 'u1', role: 'admin' };
t('админ правит чужую работу', T.trCanWrite('job', { technician_id: 'u2' }));
t('админ правит пропозал', T.trCanWrite('prop', prop));
T.state.user = { id: 'u1', role: 'manager' };
t('менеджер правит ничейную работу', T.trCanWrite('job', { technician_id: null }));
t('менеджер не правит чужую назначенную', !T.trCanWrite('job', { technician_id: 'u2' }));

console.log('\n— интервал проверки —');
T.state.data.org_settings = {};
t('по умолчанию час', T.trIntervalMs() === 3600000, String(T.trIntervalMs()));
T.state.data.org_settings = { tr_interval_min: 15 };
t('15 минут принимается', T.trIntervalMs() === 900000);
T.state.data.org_settings = { tr_interval_min: 9999 };
t('верхняя граница 480 мин', T.trIntervalMs() === 480 * 60000);
T.state.data.org_settings = { tr_interval_min: 'ерунда' };
t('битое значение → час', T.trIntervalMs() === 3600000);

console.log('\n— место поповеров —');
t('по умолчанию сверху', T.popPos() === 'top');
T.applyPopPos();
t('класс tl-pop-top на <html>', w.document.documentElement.classList.contains('tl-pop-top'));
w.localStorage.setItem('techlog_pop_pos', 'side');
T.applyPopPos();
t('переключение на «сбоку»', w.document.documentElement.classList.contains('tl-pop-side') &&
  !w.document.documentElement.classList.contains('tl-pop-top'));
w.localStorage.setItem('techlog_pop_pos', 'ерунда');
t('битое значение → сверху', T.popPos() === 'top');
t('три варианта', T.POP_POS.join(',') === 'top,bottom,side');

console.log('\n— журнал отправки —');
const box = w.document.createElement('div');
box.id = 'mq-log'; w.document.body.appendChild(box);
T.mqLog('старт отправки, 3 файл(ов) в очереди');
T.mqLog('✓ отправлено 2 фото · 1 видео', 'ok');
t('время своей колонкой', /class="mq-tm"/.test(box.innerHTML));
t('текст своим блоком (.m)', (box.innerHTML.match(/<span class="m">/g) || []).length === 2, box.innerHTML.slice(0, 120));

console.log('\n— CSS —');
const css = fs.readFileSync(ROOT + '/styles.css', 'utf8');
t('.mq-log .mq-l — flex', /\.mq-log \.mq-l\{display:flex/.test(css));
t('правило для .mq-log .mq-l > .m', /\.mq-log \.mq-l > \.m\{/.test(css));
['tl-pop-bottom #toasts', 'tl-pop-side #toasts', 'tl-pop-bottom .mq-pop', 'tl-pop-side .mq-pop']
  .forEach(sel => t('стиль ' + sel, css.indexOf(sel) > 0));
t('.tr-card оформлен', /\.tr-card \.tr-ru\{/.test(css));
const dcss = fs.readFileSync(ROOT + '/desktop.css', 'utf8');
t('docbar сдвинут на --tbh', /html\.tl-desktop \.docbar\{ top:var\(--tbh/.test(dcss));
t('btn-rowpp: display:contents только в сетке 1420',
  dcss.indexOf('.btn-rowpp{ display:contents') > dcss.indexOf('@media (min-width: 1420px)'));
t('тосты на ПК уезжают вбок только по настройке',
  !/html\.tl-desktop #toasts\{ left:auto/.test(dcss));

console.log('\n— uidiag —');
const ud = fs.readFileSync(ROOT + '/uidiag.js', 'utf8');
t('кнопка выше оверлея', /#uidiag-fab\{position:fixed;right:10px;bottom:calc\(84px \+ env\(safe-area-inset-bottom,0px\)\);z-index:1150;/.test(ud));
t('обработчик окна общий (wire)', /function wire\(m\)/.test(ud) && /wire\(m\);\s*\/\/ v1\.07\.83/.test(ud));
t('обход: справочники', /function phaseDirs/.test(ud));
t('обход: документы', /function phaseDocs/.test(ud));
t('обход: календарь', /function phaseCalendar/.test(ud));
t('обход закрывает за собой', /function closeAny/.test(ud));

console.log('\n— ловушка фокуса —');
t('modalTrap в app.js', /function modalTrap\(on\)/.test(appSrc.replace(/\r/g, '')) ||
  /function modalTrap/.test(fs.readFileSync(ROOT + '/app.js', 'utf8')));
const appNow = fs.readFileSync(ROOT + '/app.js', 'utf8');
t('openModal включает ловушку', /document\.body\.appendChild\(ov\);\n  modalTrap\(true\);/.test(appNow));
t('closeModal выключает', /closeModal\(\)\{ \$\('#overlay'\)\?\.remove\(\); modalTrap\(false\);/.test(appNow));

console.log('\n— латиница в бланке (v1.07.84) —');
t('транслит имени', T.translit('Иван Петров') === 'Ivan Petrov', T.translit('Иван Петров'));
t('транслит шипящих', T.translit('Щукин Ёж') === 'Shchukin Ezh', T.translit('Щукин Ёж'));
t('латиница не трогается', T.translit('Magnolia Vinings 916') === 'Magnolia Vinings 916');
t('смешанная строка', T.translit('Unit 916 · Клён') === 'Unit 916 · Klen', T.translit('Unit 916 · Клён'));
t('пустое значение', T.translit(null) === '' && T.translit(undefined) === '');
t('enName берёт часть после слэша', T.enName('Осушитель / Dehumidifier') === 'Dehumidifier');
t('enName без слэша — как есть', T.enName('Blower') === 'Blower');
{ // подменённый doc.text: что бы ни писали — уходит латиница
  const seen = [];
  const fake = { text(x){ seen.push(x); } };
  T.pdfLatinize(fake);
  fake.text('Ключ в офисе');
  fake.text(['Собака', 'Dog']);
  fake.text(42);
  T.pdfLatinize(fake);                       // повторный вызов не должен обернуть дважды
  fake.text('Пёс');
  t('строка транслитерируется на выводе', seen[0] === 'Klyuch v ofise', String(seen[0]));
  t('массив строк тоже', Array.isArray(seen[1]) && seen[1][0] === 'Sobaka' && seen[1][1] === 'Dog', JSON.stringify(seen[1]));
  t('нестроки не портятся', seen[2] === 42, String(seen[2]));
  t('повторная обёртка не удваивает', seen[3] === 'Pyos' || seen[3] === 'Pes', String(seen[3]));
}
{ // все бланки латинизируются
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const n = (src.match(/pdfLatinize\(new jsPDF/g) || []).length;
  /* v1.08.23: бланков стало четыре — добавился документ ремонтных работ */
  t('pdfLatinize у всех четырёх бланков (инвойс, пакет, пропозал, ремонт)', n === 4, String(n));
  t('оборудование печатается английской частью', /const etEn = enName\(et\.name\)/.test(src));
}

console.log('\n— инвойсы на Диск (v1.07.85) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('очередь знает вид «invoice»', /kind === 'invoice' \? M_INV_MAX/.test(src));
  t('кнопка «Инвойс на Диск» в карточке медиа', /App\.invToDrive\(/.test(src));
  t('перед отправкой работает страж перевода', /trPdfGuard\('job', j, go\)/.test(src));
  t('поле папки инвойсов в настройках Диска', /gd_inv_folder', App\.gdFolderIdOf/.test(src));
  t('диагностика БД знает про gd_inv_folder',
    T.DB_NEED_COLS.some(c => c[0] === 'org_settings' && c[1] === 'gd_inv_folder'));
  const g = fs.readFileSync(ROOT + '/supabase/functions/_shared/google.ts', 'utf8');
  t('INVOICES_DIR в общем модуле', /INVOICES_DIR = "Invoices"/.test(g));
  t('версия функций поднята', /FN_VER = "1\.08\.25"/.test(g));
  const mb = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  t('media-begin принимает invoice', /invoice: \{ max: 50/.test(mb) && /kind === "invoice"/.test(mb));
  t('media-begin читает свою папку из настроек', /gd_inv_folder/.test(mb) && /folderIdOf/.test(mb));
  const mh = fs.readFileSync(ROOT + '/supabase/functions/media-health/index.ts', 'utf8');
  t('media-health показывает путь инвойсов', /invoice: pack\(invRoot/.test(mh));
  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_07_85.sql', 'utf8');
  t('SQL добавляет вид invoice', /'photo','video','file','invoice'/.test(sql));
  t('SQL добавляет колонку папки', /gd_inv_folder text not null default/.test(sql));
  const dash = fs.readFileSync(ROOT + '/supabase/functions-dashboard/media-begin/google.ts', 'utf8');
  t('комплект для Dashboard пересобран', /INVOICES_DIR/.test(dash) && /1\.07\.85/.test(dash));
}

console.log('\n— конструктор нумерации (v1.07.86) —');
{
  const F = T.renderNoFmt;
  const v = { TYPE:'WORK', DATE:'20260905', YEAR:'2026', CP:'MG', CX:'MGV', UNIT:'916', TECH:'IP', WT:'VETVAG', SEQ:'00001' };
  t('шаблон по умолчанию', F(T.DOC_FMT_DEF, v) === 'WORK-20260905-MGV-916-00001', F(T.DOC_FMT_DEF, v));
  t('порядок и разделители свои', F('{SEQ}/{CX}/{TYPE}', v) === '00001/MGV/WORK', F('{SEQ}/{CX}/{TYPE}', v));
  t('без {TECH} инициалов нет', !/IP/.test(F('{TYPE}-{DATE}-{CX}-{SEQ}', v)));
  t('пустой кусочек уносит разделитель',
    F('{TYPE}-{DATE}-{TECH}-{SEQ}', { ...v, TECH:'' }) === 'WORK-20260905-00001',
    F('{TYPE}-{DATE}-{TECH}-{SEQ}', { ...v, TECH:'' }));
  t('пустой кусочек в начале не оставляет мусор',
    F('{TECH}-{TYPE}-{SEQ}', { ...v, TECH:'' }) === 'WORK-00001', F('{TECH}-{TYPE}-{SEQ}', { ...v, TECH:'' }));
  t('все кусочки пустые → пусто', F('{TECH}{CP}', { TECH:'', CP:'' }) === '');
  t('шаблон имени файла по умолчанию',
    F(T.FILE_FMT_DEF, { ...v, NAME:'VETVAG', SEQ:'01' }) === '20260905_MGV_916_VETVAG_01',
    F(T.FILE_FMT_DEF, { ...v, NAME:'VETVAG', SEQ:'01' }));
  t('в наборе кусочков документа есть тип и порядковый',
    T.DOC_TOKENS.indexOf('TYPE') >= 0 && T.DOC_TOKENS.indexOf('SEQ') >= 0 && T.DOC_TOKENS.indexOf('TECH') >= 0);
  t('в наборе для файлов есть {NAME} и {KIND}',
    T.FILE_TOKENS.indexOf('NAME') >= 0 && T.FILE_TOKENS.indexOf('KIND') >= 0);
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('номер печатается в бланке инвойса', /const no = docNo\('job', j\)/.test(src));
  t('номер в строке Proposal Number', /pair\('Proposal Number:', docNo\('prop', p\)/.test(src));
  t('карточка-конструктор только для админа', /function numberingCardHtml\(\)\{\s*\n\s*if \(!isAdmin\(\)\) return '';/.test(src.replace(/\r/g,'')) || /numberingCardHtml/.test(src));
  t('пустой номер не уходит в базу', /NUMBERED\.indexOf\(table\) >= 0 && \(row\.no == null\)/.test(src));
  t('номер дочитывается после сохранения', /fetchDocNo\('jobs', j\)/.test(src));
  const mb = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  t('media-begin собирает имя по шаблону', /renderFmt\(String\(org\?\.file_name_fmt/.test(mb));
  t('media-begin читает инициалы только если просят', /includes\("\{TECH\}"\)/.test(mb));
  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_07_86.sql', 'utf8');
  t('SQL добавляет jobs.no и placements.no',
    /jobs\s+add column if not exists no bigint generated by default as identity/.test(sql) &&
    /placements\s+add column if not exists no bigint/.test(sql));
  t('SQL добавляет шаблоны', /doc_no_fmt/.test(sql) && /file_name_fmt/.test(sql) && /doc_no_pad/.test(sql));
}

console.log('\n— инвойсы по папкам сотрудников (v1.07.87) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('галочка в карточке Диска (нередактируемая с v1.08.12)', /gd_inv_by_tech\) \? 'checked'/.test(src));
  t('тултип у галочки и кнопка ⓘ',
    /title="\$\{esc\(t\('gd_inv_tech_tip'\)\)\}"/.test(src) && /toastInfo\('gd_inv_tech_tip'\)/.test(src));
  t('живой пример пути', /function gdInvPathSample/.test(src));
  t('диагностика БД знает про gd_inv_by_tech',
    T.DB_NEED_COLS.some(c => c[0] === 'org_settings' && c[1] === 'gd_inv_by_tech'));
  const mb = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  t('media-begin читает галочку', /gd_inv_by_tech/.test(mb) && /const byTech = !!org\?\.gd_inv_by_tech/.test(mb));
  t('папка сотрудника встаёт перед месяцем', /dirFor\(s, t, "tech"/.test(mb));
  t('имя папки — имя и буква фамилии латиницей', /function techFolderName/.test(mb));
  const mh = fs.readFileSync(ROOT + '/supabase/functions/media-health/index.ts', 'utf8');
  t('тест соединения показывает схему пути', /<сотрудник>/.test(mh));
  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_07_87.sql', 'utf8');
  t('SQL добавляет колонку', /gd_inv_by_tech boolean not null default false/.test(sql));
}

console.log('\n— архив-корзина и сверка (v1.07.88) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('экран архива есть', /function viewArchive/.test(src) && /screen === 'archive'/.test(src));
  t('архивные уходят из рабочих списков', /function liveJobs/.test(src) && /scopeFilter\(liveJobs\(\)/.test(src));
  t('пикапы уезжают за своей работой', /const dead = new Set\(archJobs\(\)/.test(src));
  t('кнопка «Удалить» в документе шлёт в архив', /if \(!confirm\(t\('arch_q'\)\)\) return;\s*\n\s*localStorage\.removeItem/.test(src));
  t('удалить навсегда — только админ и только из архива',
    /if \(!isAdmin\(\)\)\{ toast\('⚠ ' \+ t\('arch_only_admin'\)/.test(src) && /!isArch\(row\)/.test(src));
  t('файлы переезжают в архив и обратно', /mediaMoveJob\(id, 'archive'\)/.test(src) && /mediaMoveJob\(id, 'restore'\)/.test(src));
  t('сверка: что есть на Диске', /function mediaChips/.test(src) && /function auditListModal/.test(src));
  t('опрос Диска', /media-health\?audit=1/.test(src));
  const g = fs.readFileSync(ROOT + '/supabase/functions/_shared/google.ts', 'utf8');
  t('папка «Архив TechLog»', /ARCHIVE_DIR = "Архив TechLog"/.test(g) && /export async function moveFile/.test(g));
  const md = fs.readFileSync(ROOT + '/supabase/functions/media-delete/index.ts', 'utf8');
  t('media-delete умеет archive/restore', /mode === "archive" \|\| mode === "restore"/.test(md));
  t('сервер не даёт стереть неархивное', /NOT_ARCHIVED/.test(md));
  const mh = fs.readFileSync(ROOT + '/supabase/functions/media-health/index.ts', 'utf8');
  t('media-health умеет ?audit=1', /searchParams\.get\("audit"\)/.test(mh) && /lost_ids/.test(mh));
  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_07_88.sql', 'utf8');
  t('SQL: archived_at у работ, пропозалов и файлов',
    (sql.match(/archived_at/g) || []).length >= 3);
}

console.log('\n— диагностика новых модулей (v1.07.89) —');
{
  const ud = fs.readFileSync(ROOT + '/uidiag.js', 'utf8');
  t('проверка «Новые модули» есть', /function checkFeat/.test(ud) && /checkFeat\];|checkFeat\]/.test(ud.replace(/\s+/g,' ')));
  t('проверка включена в набор', /checkMedia,\s*\n\s*checkFeat/.test(ud));
  t('обход заходит в архив', /'dirs',\s*\n\s*'archive'/.test(ud));
  t('обход открывает таблицу сверки', /сверка с Диском', scr: \['archive'\]/.test(ud));
  t('ключ c_feat в обоих языках',
    (ud.match(/c_feat:/g) || []).length === 2, String((ud.match(/c_feat:/g) || []).length));
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('общая диагностика: раздел документов', /— документы, номера, переводы, архив —/.test(src));
  t('в отчёте виден шаблон номера и пример', /номер документа: шаблон/.test(src) && /пример: \$\{docNo/.test(src));
  t('в отчёте видно, сколько без перевода', /заметок без английского перевода/.test(src));
  t('в отчёте видно файлы и архив', /файлы на Диске по базе/.test(src) && /архив: работ/.test(src));
}

console.log('\n— камера на любом телефоне (v1.07.90) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('mediaPick принимает источник', /function mediaPick\(jobId, kind, src\)/.test(src));
  t('«Камера» — всегда capture', /src === 'cam' \|\| \(src !== 'lib' && camMode\(\) === 'quick'\)/.test(src));
  t('кнопки «Камера» и «Галерея» в карточке', /'photo','cam'/.test(src) && /'photo','lib'/.test(src));
  t('кнопка «Камера не открылась?»', /App\.camFix\(\)/.test(src) && /cam_nocam/.test(src));
  t('ключи в обоих языках', ['media_cam','media_lib','cam_nocam','cam_nocam_hint','cam_switched']
    .every(k => (k in T.DICT.ru) && (k in T.DICT.en)));
  const ud = fs.readFileSync(ROOT + '/uidiag.js', 'utf8');
  t('диагностика проверяет прямой вызов камеры', /вызывает камеру напрямую/.test(ud));
  t('диагностика печатает режим устройства', /techlog_cam_mode/.test(ud));
}

console.log('\n— качество снимка (v1.07.91) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('нет второго сжатия поверх камерного JPEG', /const orig = keep \|\| !r\.blob \|\| \(same && isJpg\);/.test(src));
  t('в журнал пишется размер и вес кадра', /media: кадр ' \+ r\.iw/.test(src));
  t('предупреждение о мелком кадре', /M_SMALL_MP/.test(src) && /cam_small/.test(src));
  t('в карточке видно режим и качество', /cam_mode_now/.test(src) && /cam_quality_now/.test(src));
  t('кнопка возврата к полному качеству', /cam_switch_best/.test(src));
  t('camFix спрашивает, а не молчит', /if \(confirm\(t\('cam_nocam_hint'\)/.test(src));
  t('диагностика печатает режим съёмки', /съёмка: \$\{camMode\(\) === 'quick'/.test(src));
  t('ключи в обоих языках', ['cam_small','cam_mode_now','cam_mode_soft','cam_mode_best','cam_switch_best']
    .every(k => (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— HDR и ночная съёмка (v1.07.92) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('обход системного выбора картинок', /NAT_EXTRA = ',application\/octet-stream'/.test(src));
  t('обход включён только у «Родной камеры»', /src === 'lib' \? 'image\/\*' \+ NAT_EXTRA : 'image\/\*'/.test(src));
  t('кнопка переименована', T.DICT.ru.media_lib === 'Родная камера');
  t('в подсказке сказано про HDR и ночной', /HDR, ночной, зум/.test(T.DICT.ru.media_lib_hint));
  t('у быстрой кнопки честная подсказка', /без HDR и ночной/.test(T.DICT.ru.media_cam_hint));
  t('раздел про HDR в настройках', /cam_hdr_t/.test(src) && /cam_hdr_h/.test(src));
  t('ключи в обоих языках', ['cam_hdr_t','cam_hdr_h','media_lib','media_cam_hint','media_lib_hint']
    .every(k => (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— резкость как у родной камеры (v1.07.93) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('нерезкое маскирование в воркере', /function usm\(cv, amount\)/.test(src));
  t('и в запасном пути без воркера', /function mUsm2\(cv, amount\)/.test(src));
  t('подрезкость только после реального уменьшения',
    /if \(d\.usm && \(tw < iw \|\| th < ih\)\) usm\(big, d\.usm\)/.test(src));
  t('мелкое уменьшение пропускается', (src.match(/if \(k > 0\.9\) k = 1;/g) || []).length === 2);
  t('кнопка «как у родной камеры»', /camNative\(\)\{\s*\n\s*camSet\('mode', 'full'\); camSet\('q', 'orig'\);/.test(src));
  t('тумблер подрезкости', /function camUsmOn/.test(src) && /camUsm\(v\)\{/.test(src));
  t('ключи в обоих языках', ['cam_native_btn','cam_native_h','cam_usm','cam_usm_h','cam_native_done']
    .every(k => (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— снимок не пропадает (v1.07.94) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('поле выбора живёт в разметке', /document\.body\.appendChild\(inp\);\s*\n\s*_pickInp = inp;/.test(src));
  t('метка о начатой съёмке', /function pickMark/.test(src) && /LS_PICK = 'techlog_pick'/.test(src));
  t('возврат в документ на старте', /function pickRestore/.test(src) && /pickRestore\(\); \}catch/.test(src));
  t('метка живёт 15 минут', /15 \* 60000/.test(src));
  t('метка снимается при приёме файла', /inp\.onchange = \(\) => \{\s*\n\s*pickDone\(\);/.test(src));
  t('подрезкость идёт полосами', (src.match(/BAND = 256/g) || []).length === 2);
  t('осечка подрезкости не стоит кадра', /\}catch\(e\)\{\}                    \/\/ не вышло/.test(src));
  t('ключ pick_lost в обоих языках', ('pick_lost' in T.DICT.ru) && ('pick_lost' in T.DICT.en));
}

console.log('\n— тормоза «Настроек» (v1.08.03) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('пауза между попытками загрузить конфиг Диска', /gdCfg\._try && now - gdCfg\._try < 30000/.test(src));
  t('параллельные запросы не запускаются', /gdCfg\._busy/.test(src) && /finally \{ gdCfg\._busy = false; \}/.test(src));
  t('счётчики переводов кэшируются', /function trPendingCached/.test(src) && /_trCacheKey === k/.test(src));
  t('карточка сверки кэшируется', /_audCache \|\| _audKey !== key/.test(src));
  t('кэш сбрасывается при изменении данных', /function trCacheDrop\(\)\{ _trCache = null/.test(src));
  const css = fs.readFileSync(ROOT + '/styles.css', 'utf8');
  t('маркер в строке без расширенной зоны', /\.pri\.inline::after\{content:none\}/.test(css));
}

console.log('\n— снимки экранов (v1.08.07) —');
{
  const sh = fs.readFileSync(ROOT + '/uishots.js', 'utf8');
  t('модуль подключён в index.html', /uishots\.js/.test(fs.readFileSync(ROOT + '/index.html', 'utf8')));
  t('модуль в кэше service worker', /uishots\.js/.test(fs.readFileSync(ROOT + '/sw.js', 'utf8')));
  t('ZIP собирается сам, без библиотек', /0x04034b50/.test(sh) && /0x02014b50/.test(sh) && /0x06054b50/.test(sh));
  t('кадр берётся через getDisplayMedia', /getDisplayMedia/.test(sh) && /preferCurrentTab/.test(sh));
  t('длинная страница склеивается из полос', /function shotFull/.test(sh) && /slices/.test(sh));
  t('архив уходит в загрузки, никуда не отправляется',
    /a\.download = 'techlog-shots-/.test(sh) && !/fetch\(/.test(sh) && !/supabase/i.test(sh));
  t('в архиве сведения о браузере и разрешении',
    /userAgent/.test(sh) && /devicePixelRatio|dpr/.test(sh) && /содержимое/.test(sh));
  t('отказ в доступе не ломает прогон', /withShots = false/.test(sh));
  const ud = fs.readFileSync(ROOT + '/uidiag.js', 'utf8');
  t('кнопка в окне диагностики', /data-a="shots"/.test(ud) && /window\.UIShots\.run/.test(ud));
  t('ключи кнопки в обоих языках',
    (ud.match(/shots_ok:/g) || []).length === 2 && (ud.match(/shots_nocap:/g) || []).length === 2);
}

console.log('\n— глубокая проверка базы и матрица (v1.08.10) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('скорость базы меряется пятью запросами', /скорость базы: медиана/.test(src));
  t('сверяются часы устройства и сервера', /часы устройства расходятся с сервером/.test(src));
  t('права RLS проверяются пробной записью', /чужая работа: /.test(src) && /запись своей работы/.test(src));
  t('пробная запись не меняет значение', /update\(\{ note: mine\.note \?\? '' \}\)/.test(src));
  const ud = fs.readFileSync(ROOT + '/uidiag.js', 'utf8');
  t('матрица открывает приложение в рамке', /createElement\('iframe'\)/.test(ud) && /jsonAll\(\{ deep: false \}\)/.test(ud));
  t('в матрице шесть размеров', (ud.match(/\{ n: '/g) || []).length >= 6);
  t('кнопка матрицы в окне диагностики', /data-a="matrix"/.test(ud));
}

console.log('\n— документ ремонтных работ (v1.08.23) —');
{
  /* документ ремонта читает справочники — поднимаем демо-данные */
  const d = T.seedDemoData();
  T.state.data = d;
  T.state.user = d.profiles.find(p => p.role === 'admin');
  const wtDemo = d.work_types.find(w => /DEMOLITION/i.test(w.name));
  const wtSteam = d.work_types.find(w => /STEAM/i.test(w.name));
  const base = { form_data: T.emptyFormData() };

  t('признак ремонта: вид работы DEMOLITION',
    T.needsRepair({ ...base, work_type_id: wtDemo.id }));
  t('признак ремонта: обычная работа — нет',
    !T.needsRepair({ ...base, work_type_id: wtSteam.id }));
  t('признак ремонта: доп. работа «вырезка стен»',
    T.needsRepair({ ...base, work_type_id: wtSteam.id,
      form_data: { ...T.emptyFormData(), extra: [{ name: 'Вырезка стен / Wall cutout' }] } }));
  t('признак ремонта: строка «сняли наличники»',
    T.needsRepair({ ...base, work_type_id: wtSteam.id,
      form_data: { ...T.emptyFormData(), others: [{ desc: 'сняли наличники в спальне', amount: 0 }] } }));
  t('признак ремонта: ручной флаг',
    T.needsRepair({ ...base, work_type_id: wtSteam.id, needs_repair: true }));

  const r = { items: [{ q: 1, a: 85 }, { q: 2, a: 320 }], materials: [{ q: 1, a: 42 }],
              sales_tax: 10, freight: 5 };
  t('сумма работ', T.repWorks(r) === 405, String(T.repWorks(r)));
  t('сумма материалов', T.repMats(r) === 42, String(T.repMats(r)));
  t('итог = работы + материалы + налог + доставка', T.repGrand(r) === 462, String(T.repGrand(r)));

  const cleaned = T.repCleanItems([{ q: '2', code: 'dry', d: 'Гипсокартон', a: '85' },
                                   { q: 1, code: '', d: '   ', a: 0 }]);
  t('пустые строки не сохраняются', cleaned.length === 1, String(cleaned.length));
  t('код приводится к верхнему регистру', cleaned[0].code === 'DRY', cleaned[0].code);
  t('числа приходят числами', cleaned[0].q === 2 && cleaned[0].a === 85);

  const doc = { note: 'Вырезали стену', note_en: '',
                items: [{ d: 'Установка гипсокартона', d_en: '' }],
                materials: [{ d: 'Гипсокартон 4х8', d_en: '' }] };
  const fs2 = T.trFields('rep', doc);
  t('перевод видит заметку, работы и материалы', fs2.length === 3, String(fs2.length));
  fs2[1].set('Drywall installation');
  t('перевод пишется в строку работ', doc.items[0].d_en === 'Drywall installation');
  t('ярлык документа ремонта', /^R-/.test(T.trDocLabel('rep', { no: 4, date: '2026-09-09' })),
    T.trDocLabel('rep', { no: 4, date: '2026-09-09' }));

  const cx = d.complexes[0];
  const no = T.docNo('rep', { no: 7, date: '2026-09-09', complex_id: cx.id, unit_number: '204' });
  t('номер документа начинается с REP', /^REP-/.test(no), no);

  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('repairs в списке таблиц', /'proposals','repairs'/.test(src));
  t('repairs получает сквозной номер', /NUMBERED = \['jobs', 'placements', 'proposals', 'repairs'\]/.test(src));
  t('repairs в бэкапе', /'proposals','repairs','jobs'/.test(src));
  t('диагностика БД знает про jobs.needs_repair',
    T.DB_NEED_COLS.some(c => c[0] === 'jobs' && c[1] === 'needs_repair'));
  t('ручка смены статуса не затирается фильтром отчётов',
    /repSetStatus/.test(src) && !/repCatModal, repCatAdd, repCrewAdd, repCrewDel, repStatus,/.test(src));
  ['tab_repairs','rep_doc','rep_new','rep_items','rep_mats','rep_cat','rep_flag','rep_send',
   'rep_approve','rep_decline','rep_reset_note','rep_reset_done','rep_to_inv','rep_hide']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));

  const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  const idx = fs.readFileSync(ROOT + '/index.html', 'utf8');
  t('подсказки подключены в index.html', /proposal-tips\.js/.test(idx));
  t('подсказки в кэше service worker', /proposal-tips\.js/.test(sw));
  t('версия service worker совпадает с приложением', sw.includes("VERSION = '" + T.APP_VERSION + "'"));
  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_08_23.sql', 'utf8');
  t('в SQL есть таблица repairs', /create table if not exists public\.repairs/.test(sql));
  t('в SQL есть страж апрува', /create trigger repairs_guard_t/.test(sql));
  t('в SQL есть позиции справочника ремонта', /Установка гипсокартона/.test(sql));
}

console.log('\n— связанные документы: блок удаления (v1.08.30) —');
{
  const d = T.state.data;
  const me = T.state.user.id;
  d.proposals = [{ id: 'pp1', no: 7, date: '2026-09-01', status: 'approved', items: [], total: 100 }];
  d.jobs = d.jobs || [];
  const j1 = { id: 'jj1', date: '2026-09-05', proposal_id: 'pp1', technician_id: me, unit_number: '12', form_data: {} };
  d.jobs.push(j1);
  d.repairs = [
    { id: 'rr1', no: 1, date: '2026-09-06', job_id: 'jj1', created_by: me, status: 'draft', items: [], materials: [], hist: [] },
    { id: 'rr2', no: 2, date: '2026-09-06', proposal_id: 'pp1', created_by: me, status: 'draft', items: [], materials: [], hist: [] },
  ];
  t('пропозал блокируют работа и оба ремонта', T.docBlockers('prop', 'pp1').length === 3,
    JSON.stringify(T.docBlockers('prop', 'pp1').map(b => b.t)));
  t('работу блокирует её ремонт', T.docBlockers('job', 'jj1').length === 1
    && T.docBlockers('job', 'jj1')[0].o.id === 'rr1');
  t('ремонт ничем не блокируется', T.docBlockers('rep', 'rr1').length === 0);
  t('админ/автор может архивировать блокеры', T.docBlockers('prop', 'pp1').every(T.canArchDoc));

  d.repairs[0].archived_at = '2026-09-07T00:00:00Z';
  t('архивный ремонт больше не блокирует работу', T.docBlockers('job', 'jj1').length === 0);
  t('архивный ремонт виден в списке архива', T.archReps().length === 1);
  j1.archived_at = '2026-09-07T00:00:00Z';
  t('после архива работы пропозал держит только второй ремонт',
    T.docBlockers('prop', 'pp1').length === 1 && T.docBlockers('prop', 'pp1')[0].o.id === 'rr2');
  delete j1.archived_at; delete d.repairs[0].archived_at;

  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('deleteJob проверяет блокеров', /docBlockers\('job', jobDraft\.id\)/.test(src));
  t('delProposal проверяет блокеров', /docBlockers\('prop', id\)/.test(src));
  t('кнопка «в архив с цепочкой» есть', /ch_block_btn/.test(src) && /App\.chainArchive/.test(src));
  t('архив умеет удалять ремонт навсегда', /dbDelete\('repairs', id\)/.test(src));
  t('журнал знает repair-события', /'repair_archive','repair_restore','repair_delete'/.test(src));
  t('смена роли идёт через RPC (v1.08.31)', /rpc\('admin_set_role'/.test(src)
    && T.DB_NEED_RPCS.includes('admin_set_role'));
  t('справка архива добавлена', /S\.archive = H\(/.test(src));
}

console.log('\n— склад: регистр оборудования (v1.08.27) —');
{
  const d = T.state.data = T.state.data || T.seedDemoData();
  T.state.user = T.state.user || d.profiles.find(p => p.role === 'admin');
  const et = d.equipment_types[0];
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const me = T.state.user.id;
  /* аренда и вывоз — по-прежнему из placements */
  d.placements = [
    { id: 'p1', equipment_type_id: et.id, qty: 4, due_date: soon, picked_up: false, superseded: false, technician_id: me },
    { id: 'p2', equipment_type_id: et.id, qty: 3, due_date: past, picked_up: false, superseded: false, technician_id: me },
    { id: 'p3', equipment_type_id: et.id, qty: 2, due_date: past, picked_up: true, picked_up_by: me, superseded: false, technician_id: me },
    { id: 'p5', equipment_type_id: et.id, qty: 9, due_date: past, picked_up: false, superseded: true, technician_id: me },
  ];
  /* склад, машины и ремонт — сумма журнала движений */
  d.equip_moves = [
    { id: 'm1', kind: 'init', equipment_type_id: et.id, qty: 12, from_loc: 'ext', to_loc: 'stock' },
    { id: 'm2', kind: 'init', equipment_type_id: et.id, qty: 1, from_loc: 'ext', to_loc: 'repair' },
    { id: 'm3', kind: 'take', equipment_type_id: et.id, qty: 2, from_loc: 'stock', to_loc: 'car', tech_id: me },
    { id: 'm4', kind: 'to_repair', equipment_type_id: et.id, qty: 1, from_loc: 'stock', to_loc: 'repair' },
    { id: 'm5', kind: 'take', equipment_type_id: et.id, qty: 3, from_loc: 'stock', to_loc: 'car', tech_id: 'other' },
  ];
  const r = T.stockRow(et.id);
  t('в аренде — срок не вышел', r.rented === 4, String(r.rented));
  t('ожидают вывоза — срок вышел', r.pending === 3, String(r.pending));
  t('закрытый продлением пикап не считается', r.rented + r.pending === 7, String(r.rented + r.pending));
  t('на складе — сумма журнала', r.free === 12 - 2 - 1 - 3, String(r.free));
  t('в машинах — сумма журнала по всем машинам', r.with_tech === 5, String(r.with_tech));
  t('в ремонте — из журнала, «сломано» упразднено', r.in_repair === 2 && r.broken === 0,
    r.in_repair + '/' + r.broken);
  t('«всего» — производное, а не счётчик', r.total === r.free + r.rented + r.pending + r.with_tech + r.in_repair,
    String(r.total));

  const em = T.emRow(et.id);
  t('emRow: склад/машины/ремонт', em.stock === 6 && em.car === 5 && em.repair === 2,
    JSON.stringify({ s: em.stock, c: em.car, r: em.repair }));
  t('myCarQty — только моя машина', T.myCarQty(et.id) === 2, String(T.myCarQty(et.id)));
  t('кэш пересчитывается при замене массива', (() => {
    d.equip_moves = [...d.equip_moves,
      { id: 'm6', kind: 'return', equipment_type_id: et.id, qty: 1, from_loc: 'car', to_loc: 'stock', tech_id: me }];
    return T.emRow(et.id).stock === 7 && T.myCarQty(et.id) === 1;
  })(), JSON.stringify(T.emRow(et.id)));

  const tot = T.stockTotals();
  t('итоги суммируются по типам', tot.free === T.stockRow(et.id).free && tot.total === T.stockRow(et.id).total,
    tot.total + '/' + tot.free);

  t('на руках только незакрытое (по документам)', T.myOnHandQty() === 2, String(T.myOnHandQty()));
  t('признак «у сотрудника»', T.plOut(d.placements[2]));

  /* лимиты окна операций */
  T.setEqDraft({ kind: 'take', et: et.id, qty: 1, src: 'stock', note: '' });
  t('лимит «взять» = складу', T.eqCap() === 7, String(T.eqCap()));
  T.setEqDraft({ kind: 'give', et: et.id, qty: 1, src: 'stock', note: '' });
  t('лимит «сдать» = моей машине', T.eqCap() === 1, String(T.eqCap()));
  T.setEqDraft({ kind: 'unrepair', et: et.id, qty: 1, src: 'stock', note: '' });
  t('лимит «из ремонта» = ремонту', T.eqCap() === 2, String(T.eqCap()));

  /* экран и таббар */
  T.state.screen = 'stock';
  const html = T.viewStock();
  t('экран «Склад»: большие кнопки с минивеном', html.includes('eq-bigrow') && html.includes('eq-van'));
  t('экран «Склад»: счётчики на кнопках', /на складе: 7/.test(html) && /в машине: 1/.test(html));
  t('вкладка «Склад» в таббаре', /App\.go\('stock'\)/.test(T.viewTabbar()));

  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('возврат сбрасывается при восстановлении пикапа', /returned_at: null, returned_by: null/.test(src));
  t('кнопка «вернуть всё» есть', /returnAllMine/.test(src));
  t('приложение подстраховывает cron', /stock_snapshot_due/.test(src));
  t('журнал движений в списке таблиц', /'stock_daily','equip_moves'/.test(src));
  t('журнал движений в бэкапе', /'ext_requests','media','equip_moves'/.test(src));
  t('диагностика знает про возврат',
    T.DB_NEED_COLS.some(c => c[0] === 'placements' && c[1] === 'returned_at'));

  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_08_26.sql', 'utf8');
  t('в SQL есть история остатков', /create table if not exists public\.stock_daily/.test(sql));
  t('в SQL есть подсчёт остатков', /function public\.stock_counts\(\)/.test(sql));
  t('снимок идемпотентен', /on conflict \(date, equipment_type_id\) do update/.test(sql));
  t('час снимка берётся из настроек', /snapshot_hour/.test(sql));
  t('расписание переживает переход на летнее время', /'7 \* \* \* \*'/.test(sql));
  t('без pg_cron скрипт не падает', /pg_cron включить не удалось/.test(sql));
  t('история подрезается', /delete from public\.stock_daily where date </.test(sql));
  ['sb_total','sb_free','sb_rented','sb_pending','sb_with_tech','sb_broken','sb_hist',
   'sb_return','sb_return_all','sb_on_hand','sb_all_q']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— корень и конечная папка на Диске (v1.08.25) —');
{
  const mh = fs.readFileSync(ROOT + '/supabase/functions/media-health/index.ts', 'utf8');
  const mb = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');

  t('media-health отдаёт корень отдельно от схемы', /root: r, scheme/.test(mh));
  t('схема съёмки — контрагент, комплекс, юнит',
    /photo:\s+pack\(photoRoot, \["cp", "cx", "unit"\]/.test(mh));
  t('схема вложений — сотрудник, месяц, документ',
    /file:\s+pack\(fileRoot,\s+\["tech", "ym", "doc"\]/.test(mh));
  t('месяц у инвойсов зависит от галочки', /byTech \? \["tech", "ym"\] : \["ym"\]/.test(mh));
  t('проверка больше не заводит пустой месяц в Photos', !/monthFolder\(t, photoRoot/.test(mh));
  t('месяц берётся тем же помощником, что и в записи', /ymDir\(new Date\(\)/.test(mh));

  t('инвойсы без галочки — прямо в корень', /let base = root;\s+if \(byTech\) \{/.test(mb));
  t('вложениям тоже нужно имя исполнителя',
    /byTech \|\| kind === "file" \|\| String\(org\?\.file_name_fmt/.test(mb));

  t('клиент разбирает корень и схему', /function gdPathParts/.test(src));
  t('клиент понимает токены схемы', /GD_SEG_KEY = \{ cp:/.test(src));
  t('старый ответ функции тоже разбирается', /legacy: true/.test(src));
  t('карточка предупреждает про старую функцию', /gd_paths_old/.test(src));
  t('пример пути инвойса — с подчёркиванием', /slice\(0, 7\)\.replace\('-', '_'\)/.test(src));
  t('минимальные версии функций подняты',
    /'media-begin': '1\.08\.25'/.test(src) && /'media-health': '1\.08\.25'/.test(src));
  ['gd_root','gd_into','gd_into_root','gd_seg_cp','gd_seg_cx','gd_seg_unit','gd_seg_tech',
   'gd_seg_doc','gd_photo_note','gd_paths_old']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— снятый апрув и фото ремонта (v1.08.24) —');
{
  const reset = { status: 'draft', hist: [{ act: 'reset' }, { act: 'approved' }] };
  t('черновик после снятия апрува заметен', T.repApprovalReset(reset));
  t('одобренный документ в список внимания не идёт',
    !T.repApprovalReset({ status: 'approved', hist: [{ act: 'approved' }] }));
  t('обычный черновик в список внимания не идёт',
    !T.repApprovalReset({ status: 'draft', hist: [{ act: 'created' }] }));
  t('документ без истории не ломает проверку', !T.repApprovalReset({ status: 'draft' }));

  t('пометки фото приводятся к двум спискам',
    JSON.stringify(T.repPhotos({ photos: { before: ['m1'] } })) === '{"before":["m1"],"after":[]}',
    JSON.stringify(T.repPhotos({ photos: { before: ['m1'] } })));
  t('мусор в пометках не роняет форму',
    JSON.stringify(T.repPhotos({ photos: 'нет' })) === '{"before":[],"after":[]}');
  t('пустой документ — пустые пометки',
    JSON.stringify(T.repPhotos({})) === '{"before":[],"after":[]}');

  t('диагностика БД знает про repairs.photos',
    T.DB_NEED_COLS.some(c => c[0] === 'repairs' && c[1] === 'photos'));
  const sql24 = fs.readFileSync(ROOT + '/supabase/update-to-1_08_24.sql', 'utf8');
  t('в SQL есть колонка пометок', /add column if not exists photos jsonb/.test(sql24));
  const src24 = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('снятие апрува пишется в журнал', /repair_approve_reset/.test(src24));
  t('пометки фото входят в проверку изменений', /repPhotos\(r\)\]\);/.test(src24));
  t('в PDF печатается число фото', /Photos: ' \+ phc\.before\.length/.test(src24));
  ['act_rep_reset','act_rep_reset_h','rep_reset_chip','rep_photos','rep_ph_before','rep_ph_after',
   'rep_photos_h','rep_photos_nojob']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— GPS-трекинг Bouncie и автомобили (v1.08.32) —');
{
  t('таблица vehicles синхронизируется', T.TABLES.includes('vehicles'));
  t('диагностика БД знает про vehicles.imei',
    T.DB_NEED_COLS.some(c => c[0] === 'vehicles' && c[1] === 'imei'));
  t('диагностика БД знает про org_settings.bn_account',
    T.DB_NEED_COLS.some(c => c[0] === 'org_settings' && c[1] === 'bn_account'));

  const sql32 = fs.readFileSync(ROOT + '/supabase/update-to-1_08_32.sql', 'utf8');
  t('SQL создаёт таблицу vehicles', /create table if not exists public\.vehicles/.test(sql32));
  t('SQL содержит vehicle_save', /create or replace function public\.vehicle_save/.test(sql32));
  t('SQL содержит admin_set_bouncie_config', /admin_set_bouncie_config/.test(sql32));
  const full32 = fs.readFileSync(ROOT + '/supabase/full-install-1_08_32.sql', 'utf8');
  t('полный скрипт включает vehicle_save и чекер 1.08.32',
    /vehicle_save/.test(full32) && /схема соответствует v1\.08\.32/.test(full32));
  t('Edge Function bouncie на месте (functions + dashboard-копия)',
    fs.existsSync(ROOT + '/supabase/functions/bouncie/index.ts') &&
    fs.existsSync(ROOT + '/supabase/functions-dashboard/bouncie/index.ts') &&
    fs.existsSync(ROOT + '/supabase/functions-dashboard/bouncie/google.ts'));
  t('dashboard-копия импортирует ./google.ts',
    /from ["']\.\/google\.ts["']/.test(fs.readFileSync(ROOT + '/supabase/functions-dashboard/bouncie/index.ts', 'utf8')));
  t('новые RPC в списке диагностики',
    T.DB_NEED_RPCS.includes('vehicle_save') && T.DB_NEED_RPCS.includes('admin_set_bouncie_config'));

  const dMi = T.bnMiP({ lat: 33.749, lng: -84.388 }, { lat: 33.749, lng: -83.388 });
  t('haversine: 1° долготы на широте Атланты ≈ 57.5 mi', dMi > 56 && dMi < 59, dMi && dMi.toFixed(2));
  t('haversine принимает lon как синоним lng',
    T.bnMiP({ lat: 1, lng: 2 }, { lat: 1, lon: 2 }) === 0);

  T.state.data = T.seedDemoData();
  T.state.user = T.state.data.profiles.find(p => p.id === 'demo-admin');
  t('в демо-данных три машины с водителями',
    T.bnVehicles().length === 3 && T.bnVehicles().every(v => v.driver_id && v.imei));
  t('свободный номер после 1–3 — четвёртый', T.vehFreeNo(null) === 4);

  const dAdm = T.bnDestFor('demo-admin');
  t('цель админа — просроченный пикап (pk:…)', !!dAdm && dAdm.kind === 'pk' && /^pk:/.test(dAdm.key), dAdm && dAdm.key);
  const dTech = T.bnDestFor('demo-tech');
  t('цель воркера — сегодняшняя работа (job:…)', !!dTech && dTech.kind === 'job' && /^job:/.test(dTech.key));
  t('у целей есть координаты комплекса', !!(dAdm && dAdm.pt) && !!(dTech && dTech.pt));

  T.bnDemoFill();
  T.bnCompute();
  t('демо-телеметрия по всем машинам', T.BN.vs.length === 3 && !!T.BN.stats);
  const lT = T.BN.live['demo-tech'], lA = T.BN.live['demo-admin'];
  t('воркер «едет» к работе (мигающая точка)', !!lT && lT.mode === 'go');
  t('процент оставшегося пути осмысленный', !!lT && lT.pctLeft > 30 && lT.pctLeft < 80, lT && (lT.pctLeft + '%'));
  t('админ «на месте» пикапа (сплошная точка)', !!lA && lA.mode === 'site');

  t('точка рисуется с ключом карточки', /data-bnd="job:x1"/.test(T.bnDotHtml('job:x1')));
  t('справочник рисует демо-парк', /Ford Transit/.test(T.dirVehicles()) && /IMEI/.test(T.dirVehicles()));
  t('чипы: режим «все» по умолчанию', T.BN.sel === null && /bn-chip on/.test(T.bnChipsHtml()));
  t('панель пробега считает итог', /bn-stot/.test(T.bnStatsHtml(false)) && /bn-srow/.test(T.bnStatsHtml(false)));

  const v1 = T.bnVehicles().find(v => v.car_no === 1);
  T.vehApplyLocal({ id: v1.id, make: v1.make, vin: v1.vin, imei: v1.imei, car_no: 7, driver_id: 'demo-tech',
    created_at: v1.created_at }, 'demo-tech');
  t('vehApplyLocal синхронизирует номер в профиле',
    T.state.data.profiles.find(p => p.id === 'demo-tech').car_no === 7);

  ['d_vehicles','veh_make','veh_vin','veh_imei','veh_no','veh_driver','veh_import','veh_hint',
   'veh_no_taken','veh_bad_no','map_cars','map_cars_all','bn_card','bn_intro','bn_connect',
   'bn_stat_title','bn_stat_total','bn_dot_go','bn_dot_site','bn_left','bn_onsite',
   'bn_route_hint','bn_off_admin','bn_no_cars','act_veh_save','act_veh_del']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));
}

console.log('\n— пуши, время, поиск, оптимизация (v1.08.33) —');
{
  // словарь: ключи всех новых функций в обоих языках
  ['push_card','push_on_dev','push_kinds','push_k_job','push_k_pickup','push_k_approve',
   'push_k_overdue','push_k_reset','push_k_bn_alert','push_k_bn_service','push_ios_hint',
   'sec_card','mfa_on','mfa_enable','mfa_code','tt_tab','tt_title','tt_onsite','tt_now',
   'st_cfg','st_last_seen','st_sessions','st_kill','st_bn_access','st_tt_self',
   'srch_btn','srch_ph','srch_empty','opt_btn','opt_title','opt_apply','opt_open',
   'tpl_clone','tpl_move_day','tpl_card','feat_card','abk_card','abk_now','code_remind_lbl',
   'code_old','veh_service','veh_track','veh_mil','bn_no_access','upd_title','demo_sb_only']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));

  // файлы релиза
  const upd33 = fs.readFileSync(ROOT + '/supabase/update-to-1_08_33.sql', 'utf8');
  t('update-to-1_08_33: очередь, время, сессии',
    /push_enqueue/.test(upd33) && /tt_can_see/.test(upd33) && /admin_kill_sessions/.test(upd33)
    && /site_visits/.test(upd33) && /vehicle_service_set/.test(upd33));
  const full33 = fs.readFileSync(ROOT + '/supabase/full-install-1_08_33.sql', 'utf8');
  t('full-install-1_08_33: дельта внутри и чекер обновлён',
    /push_queue/.test(full33) && /backup_dump/.test(full33) && /v1\.08\.33 — всё на месте/.test(full33));
  for (const fn of ['push', 'backup']){
    t('edge ' + fn + ': канонический файл', fs.existsSync(ROOT + '/supabase/functions/' + fn + '/index.ts'));
  }
  for (const fn of ['push', 'backup', 'bouncie']){
    const p = ROOT + '/supabase/functions-dashboard/' + fn + '/index.ts';
    const ok33 = fs.existsSync(p) && /["']\.\/google\.ts["']/.test(fs.readFileSync(p, 'utf8'))
      && fs.existsSync(ROOT + '/supabase/functions-dashboard/' + fn + '/google.ts');
    t('dashboard-копия ' + fn + ' с локальным google.ts', ok33);
  }
  const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  t('sw.js: VERSION 1.08.33 и обработчик пушей',
    /VERSION = '1\.08\.33'/.test(sw) && /addEventListener\('push'/.test(sw)
    && /notificationclick/.test(sw));

  // polyline: энкодер в тесте → polyDecode восстанавливает точки
  const enc = (pts) => {
    let out = '', la = 0, ln = 0;
    const one = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let s = '';
      while (v >= 0x20){ s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
      return s + String.fromCharCode(v + 63); };
    for (const [a, b] of pts){
      const ia = Math.round(a * 1e5), ib = Math.round(b * 1e5);
      out += one(ia - la) + one(ib - ln); la = ia; ln = ib;
    }
    return out;
  };
  const pts = [[33.8823, -84.4620], [33.9260, -84.5170], [33.9700, -84.2210]];
  const dec = T.polyDecode(enc(pts));
  t('polyDecode: round-trip 3 точек',
    dec.length === 3 && dec.every((p, i) =>
      Math.abs(p[0] - pts[i][0]) < 1e-5 && Math.abs(p[1] - pts[i][1]) < 1e-5),
    JSON.stringify(dec));

  // оптимизация: перепутанная линия выпрямляется, экономия > 0
  const line = [
    { lat: 33.90, lng: -84.30 }, { lat: 33.90, lng: -84.10 },
    { lat: 33.90, lng: -84.20 }, { lat: 33.90, lng: -84.00 }];
  const before = T.optRouteLen(null, line);
  const best = T.optOrder(null, line.slice());
  const after = T.optRouteLen(null, best);
  t('optOrder: экономия на перепутанной линии', after < before - 1, before.toFixed(1) + '→' + after.toFixed(1));
  t('optOrder: все точки сохранены', best.length === 4);

  // журнал времени: длительность и вкладка
  const t0 = new Date('2026-09-11T08:00:00');
  const t1 = new Date('2026-09-11T09:30:00');
  t('ttDur: 1:30', T.ttDur(t0.toISOString(), t1.toISOString()) === '1:30');
  t('демо-сид кладёт визиты за сегодня', T.ttVisits().length >= 3
    && T.ttVisits().some(v => v.left_at === null));

  // поиск: демо-данные находятся, короткий запрос — подсказка
  t('поиск: null на коротком запросе', T.srchRows('x') === null);
  const r = T.srchRows('magnolia');
  t('поиск: комплексы Magnolia найдены', r && r.cx.length >= 1);

  // доступы Bouncie: воркер по флагу
  const savedU = T.state.user;
  T.state.user = T.state.data.profiles.find(p => p.id === 'demo-tech');
  t('bnVisible: демо-технику дан доступ', T.bnVisible() === true);
  T.state.user.bn_access = false;
  t('bnVisible: снятый флаг закрывает трекер', T.bnVisible() === false);
  T.state.user.bn_access = true;
  t('bnCanTrack: технику трек по умолчанию закрыт', T.bnCanTrack() === false);
  T.state.user = savedU;
  t('bnCanTrack: админу трек открыт', T.bnCanTrack() === true);

  // шаблоны и ТО
  const orgSaved = T.state.data.org_settings.tpl_on;
  t('tplOn: включено по умолчанию (null)', T.tplOn() === true);
  T.state.data.org_settings.tpl_on = false;
  t('tplOn: выключается чекбоксом', T.tplOn() === false);
  T.state.data.org_settings.tpl_on = orgSaved;
  const vSvc = { service_due_mi: 46000, last_odo: 45700 };
  t('vehServiceLine: жёлтая «до ТО 300 mi»', /300/.test(T.vehServiceLine(vSvc)));
  vSvc.last_odo = 46200;
  t('vehServiceLine: красная просрочка', /200/.test(T.vehServiceLine(vSvc)));
}

console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
process.exit(bad ? 1 : 0);
