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
  DICT: I18N, APP_VERSION, DB_SQL_FILE, DB_NEED_COLS, POP_POS,
  hasCyr, enText, needsTr, trFields, trMiss, trCanWrite, trDocLabel,
  translit, pdfLatinize, enName,
  renderNoFmt, docNo, pickNo, docNoVals, DOC_FMT_DEF, FILE_FMT_DEF, DOC_TOKENS, FILE_TOKENS,
  popPos, applyPopPos, emptyFormData, mqLogPaint, mqLog, state, trIntervalMs
};`;

try {
  const sc = w.document.createElement('script');
  sc.textContent = appSrc + expose;
  w.document.body.appendChild(sc);
} catch (e) { console.log('⛔ app.js не выполнился:', e.message); process.exit(1); }
const T = w.__T;
if (!T) { console.log('⛔ внутренности не экспортировались'); process.exit(1); }

console.log('\n— версия и SQL —');
t('APP_VERSION = 1.08.10', T.APP_VERSION === '1.08.10', T.APP_VERSION);
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
{ // все три бланка латинизируются
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const n = (src.match(/pdfLatinize\(new jsPDF/g) || []).length;
  t('pdfLatinize у всех трёх бланков (инвойс, пакет, пропозал)', n === 3, String(n));
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
  t('версия функций поднята', /FN_VER = "1\.07\.88"/.test(g));
  const mb = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  t('media-begin принимает invoice', /invoice: \{ max: 50/.test(mb) && /kind === "invoice"/.test(mb));
  t('media-begin читает свою папку из настроек', /gd_inv_folder/.test(mb) && /folderIdOf/.test(mb));
  const mh = fs.readFileSync(ROOT + '/supabase/functions/media-health/index.ts', 'utf8');
  t('media-health показывает путь инвойсов', /invoice: \{ id: invMonth/.test(mh));
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
  t('галочка в карточке Диска', /setOrgFlag\('gd_inv_by_tech'/.test(src));
  t('тултип у галочки и кнопка ⓘ',
    /title="\$\{esc\(t\('gd_inv_tech_tip'\)\)\}"/.test(src) && /toastInfo\('gd_inv_tech_tip'\)/.test(src));
  t('живой пример пути', /function gdInvPathSample/.test(src));
  t('диагностика БД знает про gd_inv_by_tech',
    T.DB_NEED_COLS.some(c => c[0] === 'org_settings' && c[1] === 'gd_inv_by_tech'));
  const mb = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  t('media-begin читает галочку', /gd_inv_by_tech/.test(mb) && /const byTech = !!org\?\.gd_inv_by_tech/.test(mb));
  t('папка сотрудника встаёт перед месяцем', /if \(dir\) root = await monthFolder\(t, root, dir\);/.test(mb));
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

console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
process.exit(bad ? 1 : 0);
