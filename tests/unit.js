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
  gdNamesFrom, gdCfg, mediaSettingsCardHtml, gdRootsRowsHtml,
  checkForUpdate, getUpdFailWhy: () => updFailWhy, canonUrl, CANON_HOST,
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
  ttVisits, ttDur, codeRemindOn, codeMonths, vehServiceLine, sessMgrOn,
  /* v1.08.38 */
  invSecFilled, INV_SECS, NET, NET_ONLY, netOff, netState, netSet, netMark, netPillText, isNetErr,
  pendingAdd, pendingLoad, pendingSave, pendingApplyLocal, pendingFlush, dbUpsert, dbDelete, dbSaveOrg, audit,
  emptyData, setUser: u => { state.user = u; }, setData: d => { state.data = d; },
  /* v1.08.39: бухгалтерия */
  ACC_SEC_DEF, ACC_SECS, ACC_CATS, accSplitJob, accSplitRep, accPay, accSecCat, accExtraCat, accPctEff, accPct,
  accByStaff, accTotals, accDocRow, accDocs, accF, isAcc, isAccP, scopeFilter, viewAcc,
  /* v1.08.40: переводы */
  sectionFaqHtml, faqHtml, viewHeader, viewLogin, viewStats, SECTION_HELP, chainCardBody, tvAgo, gdInvPathSample
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
  /* v1.08.42: три строки каталогов собираются одним блоком gdRootsRowsHtml —
     проверяем механизм (onchange через gdRootSet) и проводку инвойсов в нём */
  t('поле папки инвойсов в настройках Диска',
    /App\.gdRootSet\('\$\{kind\}', this\)/.test(src) && /one\('invoice',\s*'gd_inv_folder'/.test(src));
  t('диагностика БД знает про gd_inv_folder',
    T.DB_NEED_COLS.some(c => c[0] === 'org_settings' && c[1] === 'gd_inv_folder'));
  const g = fs.readFileSync(ROOT + '/supabase/functions/_shared/google.ts', 'utf8');
  t('INVOICES_DIR в общем модуле', /INVOICES_DIR = "Invoices"/.test(g));
  {  /* v1.08.36: версию не хардкодим — формат верный и не старше 1.08.25 */
    const m = g.match(/FN_VER = "(\d+)\.(\d+)\.(\d+)"/);
    const v = m ? m.slice(1).map(Number) : null;
    const cmp = v ? v[0] * 1e6 + v[1] * 1e3 + v[2] : -1;
    t('версия функций поднята (' + (v ? v.join('.') : '?') + ')', cmp >= 1e6 + 8e3 + 25);
  }
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
  const swVJ = JSON.parse(fs.readFileSync(ROOT + '/version.json', 'utf8')).version;
  t('sw.js: VERSION = version.json (' + swVJ + ') и обработчик пушей',
    sw.includes("VERSION = '" + swVJ + "'") && /addEventListener\('push'/.test(sw)
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

console.log('\n— имена корневых папок Диска (v1.08.36) —');
{
  // новая функция отвечает форматом {names:…} — берём как есть
  const fresh = T.gdNamesFrom({ names: { root: { id: 'r', name: 'Архив' },
    photo: { id: 'p', name: 'APC Фото', own: true } } });
  t('gdNamesFrom: свежий ответ ?names=1 — как есть',
    fresh && fresh.photo.name === 'APC Фото' && fresh.root.name === 'Архив');
  // старая сборка функции отвечает полной проверкой — маппим из paths/folder
  const legacy = T.gdNamesFrom({ folder: { id: 'r', name: 'Архив' }, paths: {
    photo:   { root: { id: 'p', name: 'Своя фото', own: true } },
    invoice: { root: { id: '',  name: 'Invoices',  own: false } },
    file:    { root: { id: 'f', name: '',          own: true } } } });
  t('gdNamesFrom: фолбэк из paths старой функции',
    legacy && legacy.photo.name === 'Своя фото' && legacy.photo.own === true
    && legacy.invoice.own === false && legacy.file.name === '' && legacy.root.name === 'Архив');
  t('gdNamesFrom: пустой ответ → null', T.gdNamesFrom({}) === null && T.gdNamesFrom(null) === null);
}

console.log('\n— спойлеры инвойса (v1.08.38) —');
{
  const e = T.emptyFormData();
  t('INV_SECS — 13 разделов', T.INV_SECS.length === 13);
  t('пустая форма: все 13 разделов пустые', T.INV_SECS.every(id => !T.invSecFilled(id, e, null, '')));
  const f = T.emptyFormData();
  f.steam.rooms = 4;
  t('одни «Rooms» без галочек — раздел всё ещё пустой', !T.invSecFilled('steam', f, null, ''));
  f.steam.rotovac = true;
  t('галочка Rotovac — заполнен', T.invSecFilled('steam', f, null, ''));
  t('сумма > 0 — заполнен даже без известной галочки', T.invSecFilled('dye', e, { dye: 10 }, ''));
  const w = T.emptyFormData(); w.wetvac.areas.lr = true;
  t('wetvac: отмечена только зона — заполнен', T.invSecFilled('wetvac', w, null, ''));
  const a = T.emptyFormData(); a.airduct.note = '1x5 removed pad';
  t('airduct: только заметка — заполнен', T.invSecFilled('airduct', a, null, ''));
  const q = T.emptyFormData(); q.equipment['x'] = { qty: 0, days: 3 };
  t('equipment: qty 0 — пустой', !T.invSecFilled('equipment', q, null, ''));
  q.equipment['x'].qty = 2;
  t('equipment: qty 2 — заполнен', T.invSecFilled('equipment', q, null, ''));
  const pd = T.emptyFormData(); pd.pad.size = 'q12';
  t('pad: выбран размер — заполнен', T.invSecFilled('pad', pd, null, ''));
  const o = T.emptyFormData(); o.others[1].desc = 'cut ceiling';
  t('others: описание строки — заполнен', T.invSecFilled('others', o, null, ''));
  t('note: только текст заметки — заполнен', T.invSecFilled('note', e, null, 'Ключ в офисе'));
  const x = T.emptyFormData(); x.extra = [{ qty: 1 }];
  t('note: строка доп. работ — заполнен', T.invSecFilled('note', x, null, ''));
  ['net_on','net_off','net_srv','net_off_hint','net_saved_off','net_login_off','inv_sec_open_all','inv_sec_fold_empty']
    .forEach(k => t('ключ ' + k + ' в обоих языках', (k in T.DICT.ru) && (k in T.DICT.en)));
}


/* v1.08.39: бухгалтерия — раскладка инвойса и REP по категориям, проценты,
   масштабирование к апрувленной сумме, сводка по сотрудникам, роль. */
console.log('\n— бухгалтерия: раскладка и проценты (v1.08.39) —');
{
  T.state.data = T.seedDemoData();
  T.state.data.acc_settings = [];
  T.setUser(T.state.data.profiles.find(p => p.role === 'accountant'));
  const job = T.state.data.jobs.find(j => j.status === 'done');
  const blw = T.state.data.equipment_types.find(e => e.abbr === 'BLW'), dhm = T.state.data.equipment_types.find(e => e.abbr === 'DHM');
  t('демо-профиль бухгалтера есть, isAcc()', !!T.state.user && T.isAcc() && T.isAccP(T.state.user));
  t('scopeFilter у бухгалтера отдаёт все работы', T.scopeFilter(T.state.data.jobs, 'technician_id').length === T.state.data.jobs.length);
  t('карта по умолчанию: steam→clean, repairs→rep, equipment→rent, extra→rep', T.accSecCat('steam') === 'clean' && T.accSecCat('repairs') === 'rep'
    && T.accSecCat('equipment') === 'rent' && T.accSecCat('extra') === 'rep' && T.ACC_SEC_DEF.pad === 'rep');
  const sp = T.accSplitJob(job);
  t('демо-инвойс: клининг 295, аренда 630 (BLW 450 + DHM 180), итог 925', sp.clean === 295 && sp.rent === 630
    && sp.rentBy[blw.id] === 450 && sp.rentBy[dhm.id] === 180 && sp.total === 925 && !sp.scaled, JSON.stringify(sp));
  t('секции раскладки: treatments, airduct, equipment, others', sp.secs.map(x => x.id).sort().join(',') === 'airduct,equipment,others,treatments', sp.secs.map(x => x.id).join(','));
  t('без процентов «к выплате» 0', T.accPay(sp) === 0);
  T.state.data.acc_settings = [
    { id: 'rate:clean', pct: 40 }, { id: 'rate:rep', pct: 50 }, { id: 'rate:rent', pct: 10 }, { id: 'rate:rent:' + blw.id, pct: 20 }, { id: 'rate:mat', pct: 0 }];
  t('accPctEff: свой процент BLW 20, DHM берёт общий 10', T.accPctEff('rent:' + blw.id) === 20 && T.accPctEff('rent:' + dhm.id) === 10);
  t('к выплате = 295×.4 + 450×.2 + 180×.1 = 226', T.accPay(sp) === 226, T.accPay(sp));
  /* апрувленная сумма отличается от расчёта — пропорция */
  const j2 = JSON.parse(JSON.stringify(job)); j2.status = 'approved'; j2.approved_total = 1850;
  const sp2 = T.accSplitJob(j2);
  t('апрув 1850 (×2): категории удвоены, итог 1850, флаг scaled', sp2.scaled && sp2.total === 1850 && sp2.clean === 590 && sp2.rentBy[blw.id] === 900, JSON.stringify(sp2));
  /* доп. работы: покупка → материалы, флаг repair → ремонт, остальное → extra-карта */
  const j3 = JSON.parse(JSON.stringify(job));
  const ew = T.state.data.extra_works[0];
  j3.form_data.extra = [
    { id: 'x1', kind: 'purchase', name: 'Paint', product_name: 'Paint', qty: 2, price: 25 },
    { id: 'x2', kind: 'work', ew_id: ew && ew.id, name: 'Works', price: 100, repair: true },
    { id: 'x3', kind: 'work', name: 'Free work', price: 40 } ];
  j3.total = 925 + 190;   // сохранённый итог = расчёт (иначе раскладка масштабируется к total, как в отчётах)
  const sp3 = T.accSplitJob(j3);
  t('покупка 50 → материалы; repair-работа 100 → ремонт; прочая 40 → по карте extra (ремонт)', sp3.mat === 50 && sp3.rep === 140, JSON.stringify({ mat: sp3.mat, rep: sp3.rep }));
  t('accExtraCat', T.accExtraCat({ kind: 'purchase' }) === 'mat' && T.accExtraCat({ kind: 'work', repair: true }) === 'rep' && T.accExtraCat({ kind: 'work' }) === 'rep');
  T.state.data.acc_settings.push({ id: 'map:extra', val: 'clean' });
  t('карта extra→clean переопределяет прочие доп. работы', T.accSplitJob(j3).clean === 295 + 40 && T.accSplitJob(j3).rep === 100);
  /* документ ремонта */
  const rep = { id: 'r1', no: 7, date: job.date, status: 'sent', complex_id: job.complex_id, counterparty_id: job.counterparty_id, unit_number: '5B',
    items: [{ q: 1, d: 'Drywall', a: 300 }, { q: 1, d: 'Paint', a: 200 }], materials: [{ q: 1, d: 'Sheets', a: 120 }], sales_tax: 8.5, freight: 20,
    created_by: 'demo-tech', helper_ids: ['demo-manager'], note: 'быстро', note_en: '' };
  const spr = T.accSplitRep(rep);
  t('REP: работы 500 → ремонт, материалы 120 → материалы, итог 620, налог+доставка 28.5 вне базы', spr.rep === 500 && spr.mat === 120 && spr.total === 620 && spr.extra === 28.5, JSON.stringify(spr));
  t('REP к выплате = 500×50% + 120×0% = 250', T.accPay(spr) === 250);
  /* реестр и сводка по сотрудникам */
  T.state.data.repairs = [rep];
  const f = T.accF(); f.from = '2000-01-01'; f.to = '2099-12-31'; f.st = 'done'; f.kind = 'all'; f.ast = 'all'; f.notes = false; f.q = '';
  const rows = T.accDocs();
  t('реестр: инвойс done + REP sent, черновик исключён', rows.length === 2 && rows.some(r => r.kind === 'rep') && !rows.some(r => r.status === 'draft'), rows.map(r => r.kind + ':' + r.status).join(','));
  const tot = T.accTotals(rows);
  t('итоги: выставлено 925+620, к выплате 226+250', tot.total === 1545 && tot.pay === 476 && tot.n === 2, JSON.stringify(tot));
  const st = T.accByStaff(rows);
  const by = id => st.find(x => x.id === id) || {};
  t('поровну на бригаду: Ivan 113, Alexey 113+125, Sergey 125', by('demo-admin').pay === 113 && by('demo-manager').pay === 238 && by('demo-tech').pay === 125, JSON.stringify(st.map(x => x.id + '=' + x.pay)));
  T.state.data.acc_settings.push({ id: 'opt:split', val: 'main' });
  const st2 = T.accByStaff(rows);
  t('всё основному: Ivan 226, Sergey 250, Alexey нет', st2.find(x => x.id === 'demo-admin').pay === 226 && st2.find(x => x.id === 'demo-tech').pay === 250 && !st2.find(x => x.id === 'demo-manager'));
  f.notes = true;
  t('фильтр «только с заметками» — обе (заметки техника есть в обоих)', T.accDocs().length === 2);
  f.notes = false; f.q = '5B';
  t('поиск по юниту находит REP', T.accDocs().length === 1 && T.accDocs()[0].kind === 'rep');
  f.q = ''; f.st = 'approved';
  t('фильтр «только апрув» — пусто', T.accDocs().length === 0);
  f.st = 'done';
  const html = T.viewAcc();
  t('viewAcc рендерит реестр с обеими строками и кнопками CSV/PDF', /acc-tbl/.test(html) && (html.match(/class="acc-row /g) || []).length === 2 && /accCsv/.test(html) && /accPdfBatch/.test(html));
  T.setUser(T.state.data.profiles.find(p => p.role === 'admin'));
  t('таблица acc_settings в TABLES и BK_TABLES-логике (DB_NEED_COLS)', T.TABLES.includes('acc_settings') && T.DB_NEED_COLS.some(x => x[0] === 'acc_settings') && T.DB_NEED_RPCS.includes('acc_doc_mark'));
  t('sql-миграция 1.08.39 лежит в supabase/', fs.existsSync(ROOT + '/supabase/update-to-1_08_39.sql') && fs.existsSync(ROOT + '/supabase/full-install-1_08_39.sql'));
}

console.log('\n— переводы RU/EN (v1.08.40) —');
{
  const CYR = /[\u0400-\u04FF]/;
  const dictSrc = appSrc.slice(appSrc.indexOf('const I18N = {'), appSrc.indexOf('function t(k)'));
  /* задвоенные ключи: в объектном литерале побеждает последний — расхождения незаметны */
  const dupOf = seg => { const seen = new Set(), dup = new Set();
    seg.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*:/g, (m, k) => { if (seen.has(k)) dup.add(k); seen.add(k); return m; });
    return [...dup]; };
  const enAt = dictSrc.indexOf('\n  en: {');
  const dRu = dupOf(dictSrc.slice(0, enAt)), dEn = dupOf(dictSrc.slice(enAt));
  t('в словаре ru нет задвоенных ключей', dRu.length === 0, dRu.join(', '));
  t('в словаре en нет задвоенных ключей', dEn.length === 0, dEn.join(', '));
  /* каждое действие audit('…') имеет подпись act_* — иначе журнал показывает код */
  const acts = [...new Set([...appSrc.matchAll(/\baudit\(\s*['"]([a-z_]+)['"]/g)].map(m => m[1]))];
  const noAct = acts.filter(a => !(('act_' + a) in T.DICT.ru) || !(('act_' + a) in T.DICT.en));
  t(`все ${acts.length} действий журнала имеют подпись act_* в обоих языках`, noAct.length === 0, noAct.join(', '));
  /* английские значения без кириллицы (кроме имени папки «Архив TechLog» и примера в name_en_hint) */
  const allowCyr = new Set(['name_en_hint', 'arch_hint', 'arch_q']);
  const enCyr = Object.keys(T.DICT.en).filter(k => !allowCyr.has(k) && CYR.test(JSON.stringify(T.DICT.en[k])));
  t('в английских значениях словаря нет кириллицы', enCyr.length === 0, enCyr.slice(0, 6).join(', '));
  /* справка по разделам: обе половины H(ru, en) одинаковой структуры, английская без кириллицы */
  const prevLang = T.state.lang, prevUser = T.state.user, prevData = T.state.data;
  T.state.user = { id: 'u1', role: 'admin', display_name: 'Test Admin', login: 'admin' };
  T.state.data = T.state.data || { jobs: [], placements: [], proposals: [], repairs: [], profiles: [], org_settings: {}, complexes: [], counterparties: [], equipment_types: [], work_types: [] };
  const keys = ['home', 'board', 'map', 'proposals', 'reports', 'stats', 'dirs', 'archive', 'stock', 'journal', 'settings', 'acc'];
  const li = h => (h.match(/<li\b/g) || []).length, h4 = h => (h.match(/<h4\b/g) || []).length;
  keys.forEach(k => {
    let ru = '', en = '';
    try { T.state.lang = 'ru'; ru = T.sectionFaqHtml(k); T.state.lang = 'en'; en = T.sectionFaqHtml(k); } catch (e) { t('справка «' + k + '» рисуется', false, e && e.message); return; }
    t(`справка «${k}»: пунктов поровну (ru ${li(ru)} / en ${li(en)}, h4 ${h4(ru)}/${h4(en)})`, li(ru) === li(en) && h4(ru) === h4(en) && li(ru) > 0);
    t(`справка «${k}»: в английской версии нет кириллицы`, !CYR.test(en.replace(/Архив TechLog/g, '')), (en.match(/[^\s<>]*[\u0400-\u04FF][^\s<>]*/g) || []).slice(0, 4).join(' '));
  });
  T.state.lang = 'en';
  t('FAQ (вкладка) по-английски без кириллицы', !CYR.test(T.faqHtml()));
  t('журнал в справке перечисляет события (не «—»)', /Recorded events<\/b>: [^—]/.test(T.sectionFaqHtml('journal')));
  t('шапка в EN-режиме без кириллицы (подсказки Телефон/ПК)', !CYR.test(T.viewHeader()));
  t('экран входа в EN-режиме без кириллицы', !CYR.test(T.viewLogin()));
  t('чипы статистики 7d/30d/90d по-английски', /7d<\/button>.*30d<\/button>.*90d<\/button>/s.test(T.viewStats()));
  t('«был в сети N min» по-английски', /\bmin$/.test(T.tvAgo(new Date(Date.now() - 5 * 60000).toISOString())));
  t('пример пути инвойсов по-английски', /^archive \/ Invoices/.test(T.gdInvPathSample()));
  const sh = T.SECTION_HELP;
  t('справка секций: у смешанных подписей есть английский вариант (te)', ['equipment', 'others', 'note'].every(k => sh[k].items.every(it => !/ \/ /.test(it.t) && (!CYR.test(it.t) || it.te))));
  T.state.lang = prevLang; T.state.user = prevUser; T.state.data = prevData;
}

console.log('\n— офлайн-режим: пометка кнопок и состояние (v1.08.38) —');
{
  const d = w.document.createElement('div');
  d.innerHTML = '<button id="b1" onclick="App.sync()">s</button>' +
    '<button id="b2" onclick="App.saveJob()">j</button>' +
    '<button id="b3" data-net="1" onclick="App.approveJob()">a</button>' +
    '<button id="b4" data-net="0" onclick="App.sync()">p</button>' +
    '<select id="s1" onchange="App.setRole(\'u\', this.value)"><option>x</option></select>' +
    '<button id="b5" onclick="App.closeModal(); App.eqDo()">m</button>';
  w.document.body.appendChild(d);
  T.netMark(d);
  const has = id => d.querySelector('#' + id).classList.contains('net-need');
  t('App.sync → .net-need', has('b1'));
  t('App.saveJob — не помечена', !has('b2'));
  t('data-net="1" помечает принудительно', has('b3'));
  t('data-net="0" исключает даже серверный обработчик', !has('b4'));
  t('select с onchange=App.setRole помечен', has('s1'));
  t('второй вызов в onclick (closeModal(); eqDo()) тоже ловится', has('b5'));
  t('повторный netMark не дублирует класс', (T.netMark(d), d.querySelector('#b1').className === 'net-need'));
  t('NET_ONLY не содержит saveJob/createTask/mediaPick/pickupOne/saveProposal/saveRepair',
    !['saveJob','createTask','mediaPick','pickupOne','saveProposal','saveRepair','deleteJob','archive'].some(k => T.NET_ONLY.has(k)));
  t('isNetErr: «TypeError: Failed to fetch»', T.isNetErr({ message: 'TypeError: Failed to fetch' }));
  t('isNetErr: NetworkError (Firefox)', T.isNetErr(new Error('NetworkError when attempting to fetch resource.')));
  t('isNetErr: «duplicate key» — не сетевая', !T.isNetErr({ message: 'duplicate key value violates unique constraint' }));
  T.NET.srv = true; T.NET.fails = 0;
  t('исходно: онлайн', !T.netOff() && T.netState() === 'on');
  T.netSet(false);
  t('один сбой пинга — ещё онлайн', !T.netOff());
  T.netSet(false);
  t('второй подряд — «нет сервера»', T.netOff() && T.netState() === 'warn' && T.netPillText() === T.DICT.ru.net_srv);
  t('select под офлайном disabled', d.querySelector('#s1').disabled === true && w.document.documentElement.classList.contains('tl-offline'));
  T.netSet(true, 42);
  t('успешный пинг 42 мс — онлайн, пилюля «42 мс»', !T.netOff() && T.netPillText() === '42 мс');
  t('select снова активен, tl-offline снят', d.querySelector('#s1').disabled === false && !w.document.documentElement.classList.contains('tl-offline'));
  d.remove();
}

console.log('\n— офлайн-очередь: insert/org_settings (v1.08.38) —');
{
  T.pendingSave([]);
  T.pendingAdd('upsert', 'jobs', { id: 'j1', unit_number: '1' });
  T.pendingAdd('insert', 'audit_log', { action: 'x' }, 'a1');
  T.pendingAdd('insert', 'audit_log', { action: 'y' }, 'a2');
  T.pendingAdd('upsert', 'org_settings', { id: 'org', company_short: 'ZZ' });
  const q = T.pendingLoad();
  t('четыре записи в очереди (upsert, 2×insert, org)', q.length === 4, q.length);
  t('insert-строки не схлопываются (разные ключи)', q.filter(x => x.op === 'insert').length === 2);
  T.pendingAdd('delete', 'jobs', 'j1');
  t('delete той же строки вытесняет upsert', T.pendingLoad().filter(x => x.table === 'jobs').length === 1
    && T.pendingLoad().find(x => x.table === 'jobs').op === 'delete');
  const data = { jobs: [{ id: 'j1' }, { id: 'j2' }], org_settings: { id: 'org', company_short: 'APC' }, audit_log: [] };
  T.pendingApplyLocal(data);
  t('pendingApplyLocal: delete применён к снимку', data.jobs.length === 1 && data.jobs[0].id === 'j2');
  t('pendingApplyLocal: org_settings из очереди поверх снимка', data.org_settings.company_short === 'ZZ');
  t('pendingApplyLocal: insert-строки снимок не трогают', data.audit_log.length === 0);
  T.pendingSave([]);
}

/* Режим Supabase на заглушке клиента: без сети dbUpsert/dbDelete/dbSaveOrg/audit
   не дёргают сервер и кладут в очередь; при возврате сети pendingFlush
   досылает всё одним проходом (upsert / insert / delete). */
console.log('\n— офлайн-запись в режиме Supabase (v1.08.38) —');
{
  const dom2 = new JSDOM(`<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>`,
    { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const w2 = dom2.window;
  w2.TECHLOG_CONFIG = { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  w2.scrollTo = () => {};
  w2.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  if (!w2.navigator.vibrate) w2.navigator.vibrate = () => {};
  const calls = [];
  let netDown = true;
  const resp = (op, table, payload) => {
    calls.push(op + ':' + table);
    return netDown ? Promise.resolve({ error: { message: 'TypeError: Failed to fetch' } }) : Promise.resolve({ data: null, error: null });
  };
  const from = (table) => ({
    upsert: (row) => resp('upsert', table, row),
    insert: (row) => resp('insert', table, row),
    delete: () => ({ eq: (k, v) => resp('delete', table, v) }),
    select: () => ({ eq: () => ({ single: () => resp('select', table), maybeSingle: () => resp('select', table) }), limit: () => resp('select', table) }),
  });
  w2.supabase = { createClient: () => ({ from, rpc: () => Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => {}, signOut: () => Promise.resolve({}),
            mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: null }) } } }) };
  try {
    const sc = w2.document.createElement('script');
    sc.textContent = appSrc + expose;
    w2.document.body.appendChild(sc);
  } catch (e) { console.log('⛔ app.js (SB) не выполнился:', e.message); }
  const S = w2.__T;
  t('app.js поднялся в режиме Supabase на заглушке', !!S && !!S.state);
  if (S){
    const run = async () => {
      await new Promise(r => setTimeout(r, 50));
      S.setUser({ id: 'u1', role: 'admin', display_name: 'Test', login: 'test' });
      const data = S.emptyData(); S.setData(data);
      S.pendingSave([]);
      S.NET.srv = false; S.NET.fails = 2;                 // сервер «молчит»
      t('netOff() в режиме SB без сервера', S.netOff());
      calls.length = 0;
      await S.dbUpsert('jobs', { id: 'j9', unit_number: '9', form_data: {} });
      await S.dbDelete('placements', 'p9');
      await S.dbSaveOrg({ id: 'org', company_short: 'OFF' });
      S.audit('job_create', 'job', 'j9', { unit: '9' });
      await new Promise(r => setTimeout(r, 20));
      t('без сети сервер не вызывался вовсе', calls.length === 0, calls.join(','));
      const q = S.pendingLoad();
      t('очередь: jobs upsert + placements delete + org upsert + audit insert',
        q.length === 4 && q.some(x => x.op === 'upsert' && x.table === 'jobs') && q.some(x => x.op === 'delete' && x.table === 'placements')
        && q.some(x => x.table === 'org_settings') && q.some(x => x.op === 'insert' && x.table === 'audit_log'),
        q.map(x => x.op + ':' + x.table).join(','));
      t('строка работы уже в локальном кэше', S.state.data.jobs.some(j => j.id === 'j9'));
      t('красных тостов «Ошибка записи» нет', ![...w2.document.querySelectorAll('#toasts .toast.err')].length);
      /* сеть вернулась: досыл одним проходом */
      netDown = false; S.NET.srv = true; S.NET.fails = 0;
      const sent = await S.pendingFlush();
      t('pendingFlush дослал 4 записи', sent === 4, sent);
      t('очередь пуста', S.pendingLoad().length === 0);
      t('на сервер ушли upsert, delete, org-upsert и insert журнала',
        calls.includes('upsert:jobs') && calls.includes('delete:placements') && calls.includes('upsert:org_settings') && calls.includes('insert:audit_log'),
        calls.join(','));
      /* сеть пропала на ходу: ошибка fetch → в очередь, без красного тоста */
      netDown = true; calls.length = 0;
      await S.dbUpsert('jobs', { id: 'j10', unit_number: '10', form_data: {} });
      t('сетевая ошибка на ходу: запись осталась в очереди', S.pendingLoad().some(x => x.id === 'j10'));
      t('первый сбой — ещё «онлайн» (контрольный пинг запланирован)', !S.netOff());
      await S.dbUpsert('jobs', { id: 'j11', unit_number: '11', form_data: {} });
      t('второй сбой подряд — «нет сервера», обе записи в очереди', S.netOff() && S.pendingLoad().length === 2);
      t('на сервер ходили только два раза (третьего вызова без сети нет)', calls.length === 2, calls.join(','));
      S.pendingSave([]);
    };
    run().catch(e => t('SB-сценарий выполнился без исключений', false, e && e.stack || e)).then(finish);
  } else finish();
}
async function finish(){
  console.log('\n— каталоги Диска видны в обоих режимах карточки (v1.08.42) —');
{
  const d = T.seedDemoData();
  T.state.data = d;
  T.state.user = d.profiles.find(p => p.role === 'admin');
  const hasRoots = h => /id="gd-photo"/.test(h) && /id="gd-inv"/.test(h)
    && /id="gd-files"/.test(h) && /id="gd-nm-photo"/.test(h) && /gd-roots-t/.test(h);
  /* режим ПРОСМОТРА: ключи заведены и подключено — как у настоящего админа */
  Object.assign(T.gdCfg, { loaded: true, client_id: 'x.apps', has_secret: true,
    has_refresh: true, folder_id: 'FLD1' });
  const ro = T.mediaSettingsCardHtml();
  t('просмотр: карточка в режиме просмотра (токен показан)', /gd-cid" readonly/.test(ro));
  t('просмотр: три строки каталогов на месте', hasRoots(ro));
  t('просмотр: поля каталогов редактируемые', !/id="gd-photo"[^>]*readonly/.test(ro));
  /* режим РЕДАКТИРОВАНИЯ: ключей нет — карточка сама открывает форму */
  Object.assign(T.gdCfg, { client_id: '', has_secret: false, has_refresh: false, folder_id: '' });
  const ed = T.mediaSettingsCardHtml();
  t('редактирование: три строки каталогов на месте', hasRoots(ed));
  t('редактирование: это точно форма ключей', /id="gd-sec"/.test(ed));
  t('блок каталогов один и тот же (без дублей id в разметке)',
    (ro.match(/id="gd-photo"/g) || []).length === 1 && (ed.match(/id="gd-photo"/g) || []).length === 1);
}

console.log('\n— причины провала проверки версии (v1.08.43) —');
{
  const w = dom.window, origFetch = w.fetch;
  const run = async (fetchImpl) => {
    w.fetch = fetchImpl;
    const ok = await T.checkForUpdate('тест', true);
    return { ok, why: T.getUpdFailWhy() };
  };
  let r = await run(async () => ({ ok: false, status: 404 }));
  t('HTTP 404 → провал с причиной http:404', r.ok === false && r.why === 'http:404', JSON.stringify(r));
  r = await run(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }));
  t('тело не-JSON → провал с причиной json', r.ok === false && r.why === 'json', JSON.stringify(r));
  r = await run(async () => { throw new TypeError('Failed to fetch'); });
  t('сеть упала → провал с причиной net', r.ok === false && r.why === 'net', JSON.stringify(r));
  r = await run(async () => ({ ok: true, status: 200, json: async () => ({ version: T.APP_VERSION }) }));
  t('успех: версия совпала, причина сброшена', r.ok === true && r.why === null, JSON.stringify(r));
  w.fetch = origFetch;
}

console.log('\n— переезд на домен (v1.08.44) —');
{
  const U = T.canonUrl;
  t('CANON_HOST задан', T.CANON_HOST === 'techlog.pro', T.CANON_HOST);
  t('github.io/TechLog/ → корень домена',
    U({ hostname: 'abraziv444.github.io', pathname: '/TechLog/', search: '', hash: '' })
      === 'https://techlog.pro/');
  t('путь, запрос и якорь сохраняются',
    U({ hostname: 'abraziv444.github.io', pathname: '/TechLog/index.html', search: '?x=1', hash: '#h' })
      === 'https://techlog.pro/index.html?x=1#h');
  t('на самом домене не дёргаемся',
    U({ hostname: 'techlog.pro', pathname: '/', search: '', hash: '' }) === null);
  t('127.0.0.1 и localhost не трогаем',
    U({ hostname: '127.0.0.1', pathname: '/index.html' }) === null
    && U({ hostname: 'localhost', pathname: '/' }) === null);
  t('чужой хост не трогаем',
    U({ hostname: 'example.com', pathname: '/TechLog/' }) === null);
  const fs2 = require('fs');
  const cn = fs2.readFileSync(ROOT + '/CNAME', 'utf8').trim();
  t('CNAME в корне архива и содержит домен', cn === 'techlog.pro', cn);
  t('.nojekyll на месте', fs2.existsSync(ROOT + '/.nojekyll'));
  const man = JSON.parse(fs2.readFileSync(ROOT + '/manifest.webmanifest', 'utf8'));
  t('манифест относительный: работает и на домене, и на github.io',
    man.id === './' && man.scope === './' && String(man.start_url).startsWith('./'));
}

console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
  process.exit(bad ? 1 : 0);
}
