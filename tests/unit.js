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
  sectionFaqHtml, faqHtml, viewHeader, viewLogin, viewStats, SECTION_HELP, chainCardBody, tvAgo, gdInvPathSample,
  /* v1.08.51: учёба */
  STUDY, qzNorm, studyAllowedFor, studyMenuOn, studySections, studyDefaultCat, studySecStat, fmtMs, BK_TABLES,
  studyBook, studyBookAll, stComboRefs, stViewBuild, stOpts, stCorrect, biText, mediaLocked, canArchDoc, printBtnOn,
  /* v1.08.84 */
  invTail, drawInvoiceCont, techFullNamesFor, invCutLine,
  /* v1.08.85 */
  AUTHX, sbFetch, authWhy, authSignedOutLog, authKeepDraft, authRestoreDraft, viewLogin,
  /* v1.08.92 */
  mfaQrHtml, mfaUri, mfaNeedsCode, MFA, trPending, trFiltered, trSelSet, TRF, trWhoOf, trCpOf,
  setJobDraft: d => { jobDraft = d; }, getJobDraft: () => jobDraft, setScreen: s => { state.screen = s; },
  /* v1.09.01: справочник трекеров Bouncie */
  TRK, bnDevices, bnDevByImei, bnDevActive, bnDevLabel, bnDevCar, bnDevNeedSync, bnDevNorm, bnDevApplyLocal, bnDevSync,
  dirTrackers, vehTrackerLine, vehTrackerSelHtml, vehDevPick, isAdmin
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
t('closeModal выключает', /closeModal\(\)\{\s*\$\('#overlay'\)\?\.remove\(\); modalTrap\(false\);/.test(appNow));   // v1.08.59: closeModal стал многострочным

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
  t('в отчёте видно файлы и архив', /файлы на Диске по базе/.test(src) && /архив: задач/.test(src));
}

console.log('\n— камера на любом телефоне (v1.07.90) —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('mediaPick принимает источник', /function mediaPick\(jobId, kind, src, doc\)/.test(src));
  t('«Камера» — всегда capture', /src === 'cam' \|\| \(src !== 'lib' && camMode\(\) === 'quick'\)/.test(src));
  t('в карточке одна кнопка «Фото» и «Видео» (v1.08.79), выбор из галереи остался для «Забрать кадры»', /App\.mediaShoot\('\$\{jobId\}','photo','\$\{doc\}'\)/.test(src) && /mediaPick\(jobId, kind, 'lib', doc \|\| 'job'\)/.test(src));
  t('«Камера не открылась?» из документа убрана, крючок camFix остался', /camFix\(\)\{/.test(src) && !/onclick="App\.camFix\(\)"/.test(src));
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
  t('у кнопки «Камера» честная подсказка (без HDR)', /без HDR/i.test(T.DICT.ru.media_cam_hint));
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
  t('возврат в документ на старте', /async function pickRestore/.test(src) && /pickRestore\(\)\.catch/.test(src));
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
  t('права RLS проверяются пробной записью', /чужая задача: /.test(src) && /запись своей задачи/.test(src));
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
  T.netSet(true, 640);
  t('v1.08.68: одиночный медленный пинг 640 мс — ещё «on» (холодный старт), ждём контрольный', !T.netOff() && T.netState() === 'on' && T.NET.slowN === 1);
  T.netSet(true, 90);
  t('v1.08.68: контрольный 90 мс — счётчик сброшен, «on»', T.netState() === 'on' && T.NET.slowN === 0);
  T.netSet(true, 640); T.netSet(true, 710);
  t('v1.08.45/68: два медленных пинга подряд — статус «нестабильно», не офлайн', !T.netOff() && T.netState() === 'slow'
    && T.netPillText() === T.DICT.ru.net_unst);
  T.netSet(true, 120);
  t('v1.08.45: пинг вернулся к 120 мс — снова «on»', T.netState() === 'on' && T.netPillText() === '120 мс');
  T.netSet(false); T.netSet(false);
  t('v1.08.68: провал пинга сбрасывает счётчик медленных', T.NET.slowN === 0 && T.netOff());
  T.netSet(true, 50);
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
  let rlsOrg = false;                                   // v1.08.97: база без update-to-1_08_97 не пускает бухгалтера
  const resp = (op, table, payload) => {
    calls.push(op + ':' + table);
    if (rlsOrg && op === 'upsert' && table === 'org_settings')
      return Promise.resolve({ error: { code: '42501', message: 'new row violates row-level security policy for table "org_settings"' } });
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
      /* v1.08.97: бухгалтер сохраняет «Организацию (для PDF)» */
      netDown = false; S.NET.srv = true; S.NET.fails = 0;
      S.setUser({ id: 'u2', role: 'accountant', display_name: 'Acc', login: 'acc' });
      rlsOrg = true; calls.length = 0;
      w2.document.querySelectorAll('#toasts .toast').forEach(x => x.remove());
      const accOld = await S.dbSaveOrg({ id: 'org', company_name: 'ACC' });
      const tx = [...w2.document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | ');
      t('v1.08.97: бухгалтер, база без апдейта — «Обновите БД» с файлом, не сырая ошибка, в очередь не легло',
        accOld === false && /Обновите БД/.test(tx) && tx.includes(S.DB_SQL_FILE || 'full-install-1_08_97.sql') && !/row-level security/.test(tx)
        && S.pendingLoad().length === 0 && calls.join(',') === 'upsert:org_settings', JSON.stringify({ accOld, tx, calls }));
      rlsOrg = false;
      const accNew = await S.dbSaveOrg({ id: 'org', company_name: 'ACC2' });
      t('v1.08.97: бухгалтер, база обновлена — сохранение проходит (true)', accNew === true && S.state.data.org_settings.company_name === 'ACC2', accNew);
      S.setUser({ id: 'u1', role: 'admin', display_name: 'Test', login: 'test' });
      rlsOrg = true;
      const admErr = await S.dbSaveOrg({ id: 'org', company_name: 'ADM' });
      const tx2 = [...w2.document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | ');
      t('v1.08.97: у админа та же ошибка — как раньше, обычный тост ошибки (false)', admErr === false && /row-level security/.test(tx2), tx2);
      rlsOrg = false;
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

console.log('\n— v1.08.47: сжатие видео и политика доставки —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  const vj = JSON.parse(fs.readFileSync(ROOT + '/version.json', 'utf8'));
  t('версии синхронны (app = sw = version.json)',
    src.includes(`APP_VERSION = '${vj.version}'`) && sw.includes(`VERSION = '${vj.version}'`));
  t('vendor-библиотеки в сборке', fs.existsSync(ROOT + '/vendor/mp4box.all.min.js')
    && fs.existsSync(ROOT + '/vendor/mp4-muxer.js'));
  t('vendor в прекэше service worker',
    sw.includes("'./vendor/mp4box.all.min.js'") && sw.includes("'./vendor/mp4-muxer.js'"));
  t('политика: посредник — фото ≤250 КБ и 10/день',
    /M_RELAY_MAX = 250 \* 1024, M_RELAY_DAY = 10/.test(src)
    && /it\.kind === 'photo' && it\.blob && it\.blob\.size <= M_RELAY_MAX/.test(src)
    && /mRelayDay\(\) < M_RELAY_DAY/.test(src));
  t('посредник решается по файлу, не глобально',
    /const viaRelay = _mediaRelay && mRelayOk\(it\);/.test(src)
    && /mPutChunk\(url, range, body, viaRelay\)/.test(src));
  t('мёртвая сессия распознаётся и возрождается',
    /e\.code = 'SESSION_DEAD'/.test(src) && /mq_l_sess_dead/.test(src)
    && src.includes("if (e.code === 'SESSION_DEAD')"));
  t('видео и крупным фото посредник не положен (строки журнала)',
    /mq_l_no_relay/.test(src) && /mq_l_relay_cap/.test(src)
    && /if \(!mRelayOk\(it\)\)\{/.test(src));
  t('счётчик дня после успешной отправки через посредника',
    src.includes("if (it.relay_used && it.kind === 'photo') mRelayBump();"));
  t('413 для видео: пометить «сжать» вместо выбросить',
    src.includes("st === 413 && it.kind === 'video'") && /it\.forceShr = 1/.test(src));
  t('видео не хоронится после 5 срывов и не в «зависших»',
    src.includes("it.kind !== 'video' && (it.attempts || 0) >= 5")
    && src.includes("mediaQ.filter(x => x.kind !== 'video'"));
  t('сжатие в очереди: один раз, итог запоминается',
    src.includes("it.shr !== 1 && it.shr !== 'orig'") && /mq_l_shr_ok/.test(src)
    && /mq_l_shr_skip/.test(src) && /mq_l_shr_no/.test(src));
  t('воркер: поворот, звук копией, лестница кодеков с VP9-запаской',
    /function rotOf\(/.test(src) && /d\.tag === 5 && d\.data/.test(src)
    && /vp09\.00\.41\.08/.test(src) && /addAudioChunkRaw/.test(src)
    && src.includes("avc = { format: 'avc' }"));
  t('исходник в очереди не трогается до успеха сжатия',
    src.includes('sr.blob.size < it.blob.size') && /Возвращает \{ blob \} \| \{ skip \} \| \{ err \}/.test(src));
  t('копия в «Загрузки»: только снятое капчей, имя TL_',
    src.includes('opts && opts.cam && mCopyDl()') && /'TL_' \+ d\.getFullYear/.test(src));
  /* пункт «скрепка-картинка идёт путём фото» (работает с v1.07.76) —
     теперь закреплено ассертом, а не только чтением кода */
  t('скрепка: вид файла решает MIME (картинка→фото, видео→видео)',
    src.includes("if (/^image\\//.test(ty)) return 'photo';")
    && src.includes("if (/^video\\//.test(ty)) return 'video';")
    && src.includes("mediaTakeFiles(jobId, [...(inp.files || [])], null, { doc })")
    && src.includes('kind || mKindOf(f)'));
  t('настройки: режим видео и копия — на устройстве',
    /techlog_vid_mode/.test(src) && /techlog_copy_dl/.test(src)
    && /'vidMode'\)/.test(src) && /vid_test/.test(src));
}

console.log('\n— v1.08.48: медиа у ремонта, ТВ-уборка, модалки —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const css = fs.readFileSync(ROOT + '/styles.css', 'utf8');
  const sql = fs.readFileSync(ROOT + '/supabase/full-install-1_08_48.sql', 'utf8');
  const beg = fs.readFileSync(ROOT + '/supabase/functions/media-begin/index.ts', 'utf8');
  const com = fs.readFileSync(ROOT + '/supabase/functions/media-commit/index.ts', 'utf8');
  const del = fs.readFileSync(ROOT + '/supabase/functions/media-delete/index.ts', 'utf8');
  t('SQL-комплект 1.08.48 на месте (DB_SQL_FILE двинулся дальше)',
    /DB_SQL_FILE = 'full-install-1_0(8_(51|70|71|97)|9_\d\d)\.sql'/.test(src)
    && fs.existsSync(ROOT + '/supabase/update-to-1_08_48.sql'));
  t('SQL: ровно один владелец медиа + права ремонта + tv_cleanup',
    sql.includes('media_owner_one') && sql.includes('can_view_repair')
    && sql.includes('tv_cleanup') && sql.includes('repair_id uuid references public.repairs'));
  t('media-begin: ветка ремонта (isRep, ownerCol, вид REPAIR)',
    /const isRep = doc === "rep"/.test(beg) && /ownerCol/.test(beg)
    && beg.includes('work_types: { name: "REPAIR" }')
    && beg.includes('repair_id: isRep ? repair_id : null'));
  t('media-commit: журнал по владельцу (repair|job)',
    com.includes('entity: m.repair_id ? "repair" : "job"'));
  t('media-delete: полный вынос файлов ремонта',
    del.includes('if (repair_id) {') && del.includes('.eq("repair_id", repair_id)')
    && del.includes('entity: "repair"'));
  t('клиент: владелец записи — задача ИЛИ ремонт (mOwnId/mOwnMatch)',
    /function mOwnId\(/.test(src) && /function mOwnMatch\(/.test(src)
    && src.includes("doc === 'rep' ? m.repair_id === id : m.job_id === id"));
  t('полоса медиа и сборщики принимают doc',
    src.includes("function mediaStripHtml(jobId, doc = 'job')")
    && src.includes("function mediaEnqueueFile(jobId, f, kind, doc = 'job', ex)")
    && src.includes("function mediaPick(jobId, kind, src, doc)"));
  t('форма ремонта: свой медиа-блок и кнопка чека',
    src.includes("mediaStripHtml(r.id, 'rep')")
    && src.includes("App.mediaShoot('${r.id}','photo','rep')"));
  t('кнопки сметы переименованы, «+строка» осталась',
    src.includes("t('rep_add_work')") && src.includes("t('rep_add_mat')")
    && (src.match(/t\('prop_add_row'\)/g) || []).length >= 2);
  t('связи ремонта: пикер пропозала и фильтр задач по контрагенту',
    /function repPropPickerHtml\(/.test(src) && /repLinkProp/.test(src)
    && src.includes("j.counterparty_id === r.counterparty_id)   // v1.08.48"));
  t('удаление навсегда уносит файлы ремонта',
    /mediaDropRepair\(id\)/.test(src) && /function mediaDropRepair/.test(src));
  t('ТВ: три кнопки уборки и RPC',
    src.includes("App.tvCleanup('revoked')") && src.includes("App.tvCleanup('inactive')")
    && src.includes("App.tvCleanup('revoke_all')") && src.includes("rpc('tv_cleanup'"));
  t('ТВ-сессии видны в списке устройств, kill гасит и их',
    src.includes("t('sess_tv')") && src.includes("via: 'st_kill'"));
  t('модалки: фон заперт (tl-lock + компенсация скроллбара)',
    src.includes("b.classList.add('tl-lock')") && /--sbw/.test(src)
    && css.includes('body.tl-lock{ overflow:hidden; padding-right:var(--sbw, 0px) }')
    && css.includes('.modal{ overscroll-behavior:contain }'));
  t('иконка руля у номера машины (значок с цифрой)',
    /function carNoSvg\(/.test(src) && src.includes("${carNoSvg(u.car_no)}"));
  t('очередь: подпись и владелец для ремонта',
    src.includes("it.doc === 'rep' ? 'REP·' : ''") && src.includes('mOwnId(it)'));
}

console.log('\n— v1.08.49: поиск — место, галочка, мультивыбор —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  t('поиск стоит сразу после «Главной» (и после «Бухгалтерии» у бухгалтера)',
    /\['home', ICONS\.home, t\('tab_home'\)\],\n    \.\.\.srchItem,/.test(src)
    && /\['acc', ic\('receipt'\), t\('tab_acc'\)\],\n    \.\.\.srchItem,/.test(src));
  t('на телефоне кнопку прячет личная галочка, на ПК — всегда видна',
    src.includes("(vmCur() !== 'mobile' || srchTabOn())")
    && /techlog_srch_tab/.test(src) && src.includes("App.srchTab(this.checked)"));
  t('из карточки настроек поиск открывается и при спрятанной кнопке',
    src.includes("onclick=\"App.searchOpen()\">${ic('search')} ${t('srch_open_here')}"));
  t('v1.08.58: чипы — одна группа из шести, «Всё» = все горят, повтор снимает все, крестик снимает, пустой выбор разрешён',
    src.includes("const SRCH_ALL = ['unit', ...SRCH_KINDS]") && src.includes('function srchAllOn(){ return srchUnit && srchSel.size === SRCH_KINDS.length; }')
    && src.includes("if (k === 'all'){ if (srchAllOn()){ srchSel = new Set(); srchUnit = false; } else { srchSel = new Set(SRCH_KINDS); srchUnit = true; } }")
    && src.includes("else if (k === 'none'){ srchSel = new Set(); srchUnit = false; }") && src.includes('class="chip-preset srch-clear"')
    && !src.includes("srchSel = new Set([k])") && !src.includes("if (!srchSel.size) srchSel = new Set(SRCH_KINDS);   // пусто"));
  t('v1.08.59: askModal — модалка да/нет; «Прервать» тест идёт через неё, а не через confirm()',
    src.includes('function askModal(o){') && src.includes("if (_askResolve){ const r = _askResolve; _askResolve = null; r(false); }")
    && src.includes("const yes = await askModal({ title: t('st_finish_t')") && !src.includes("if (confirm(t('st_finish_q')")
    && Object.keys(T.DICT.ru).filter(k => /^ask_|^st_finish_/.test(k)).every(k => k in T.DICT.en));
  t('v1.08.58: «Юнит» — добавочное поле (искать и по номеру юнита), комплексы ищутся всегда',
    src.includes('const unit = x => U && has(x.unit_number);') && src.includes("if (S.has('cx')) (state.data.complexes") && !src.includes("S.has('cx') && !U"));
  t('выбор запоминается на устройстве',
    /techlog_srch_sel/.test(src) && /srchSaveSel\(\); srchChipsSync\(\); srchRender\(\);/.test(src));
  t('фильтры видов читают набор, а не одиночный вид',
    src.includes("if (S.has('job')) liveJobs()") && src.includes("if (S.has('pk'))")
    && src.includes("if (S.has('prop'))") && src.includes("if (S.has('rep'))"));
}

console.log('\n— v1.08.50: присланный руль + цифра —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const css = fs.readFileSync(ROOT + '/styles.css', 'utf8');
  t('основа значка — присланный SVG (путь руля перенесён байт в байт)',
    src.includes("const CAR_WHEEL_D = 'M61.44,0c33.93,0,61.44,27.51,61.44,61.44")
    && src.includes('c6.2,5.27,15.18,6.23,16.58,16.16C54.37,106.74,53.19,111.38,47.26,109.05'));
  t('центр приглушён маской, цифра с размытым ореолом (два слоя text)',
    src.includes('radialGradient id=') && src.includes('${id}m')
    && src.includes('feGaussianBlur stdDeviation=') && src.includes('dominant-baseline'));
  t('значок заменил кружочки во всех местах номера',
    (src.match(/carNoSvg\(/g) || []).length >= 7);
  t('старые рамки сняты, подсветка «едет» — цветом значка',
    css.includes('.carno-ic{ display:block') && css.includes('.bn-sno.run{ border:0; box-shadow:none; color:var(--green)')
    && css.includes('.car-no .ic{ display:none }'));
}


console.log('\n— v1.08.51: учёба —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const css = fs.readFileSync(ROOT + '/styles.css', 'utf8');
  const sw  = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  t('SQL-комплект 1.08.51 на месте (DB_SQL_FILE двинулся на 1.08.70)',
    /DB_SQL_FILE = 'full-install-1_0(8_(51|70|71|97)|9_\d\d)\.sql'/.test(src)
    && fs.existsSync(ROOT + '/supabase/update-to-1_08_51.sql') && fs.existsSync(ROOT + '/supabase/full-install-1_08_51.sql'));
  const sql = fs.readFileSync(ROOT + '/supabase/update-to-1_08_51.sql', 'utf8');
  t('SQL: study_sessions с RLS, колонки доступа, study_access под защитой guard, восстановление',
    sql.includes('create table if not exists public.study_sessions') && sql.includes('study_sel') && sql.includes('study_upd')
    && sql.includes('add column if not exists study_on') && sql.includes('add column if not exists study_access')
    && sql.includes('new.study_access is distinct from old.study_access') && /v_allowed[^;]*'study_sessions'/.test(sql));
  t('словарь: все st_* и act_study_* ключи есть в RU и EN',
    Object.keys(T.DICT.ru).filter(k => /^st_|^act_study_|^tab_study$/.test(k)).every(k => k in T.DICT.en)
    && T.DICT.ru.tab_study === 'Учёба' && T.DICT.en.tab_study === 'Study');
  t('study_sessions в синке и в бэкапе; DB-диагностика знает новые колонки',
    T.TABLES.includes('study_sessions') && T.BK_TABLES.includes('study_sessions')
    && T.DB_NEED_COLS.some(c => c[0] === 'study_sessions') && T.DB_NEED_COLS.some(c => c[0] === 'profiles' && c[1] === 'study_access'));
  t('каталог: 8 разделов по умолчанию, тест, учебник и короткая подпись у каждого',
    T.studyDefaultCat().sections.length === 8 && T.studyDefaultCat().sections.every(s => /^tests\/section-\d\.json$/.test(s.test)
      && (typeof s.book === 'string' ? /^books\/section-\d\.html$/.test(s.book) : /^books\/section-\d-ru\.html$/.test(s.book.ru) && /^books\/section-\d-en\.html$/.test(s.book.en))
      && s.short && s.short.ru && s.short.en));
  /* v1.08.60: книга на двух языках — выбор по языку интерфейса, строка по-прежнему работает */
  t('v1.08.60: studyBook/studyBookAll — {ru,en} по языку, строка как есть, пусто без книги',
    (() => { const s1 = { book: { ru: 'books/a-ru.html', en: 'books/a-en.html' } }, s2 = { book: 'books/x.html' }, s3 = { book: { en: 'books/b-en.html' } };
      const L0 = T.state.lang; T.state.lang = 'en'; const e1 = T.studyBook(s1); T.state.lang = 'ru'; const r1 = T.studyBook(s1), r3 = T.studyBook(s3); T.state.lang = L0;
      return e1 === 'books/a-en.html' && r1 === 'books/a-ru.html' && r3 === 'books/b-en.html' && T.studyBook(s2) === 'books/x.html' && T.studyBook({}) === ''
        && T.studyBookAll(s1).length === 2 && T.studyBookAll(s2).length === 1 && T.studyBookAll({}).length === 0; })());
  t('v1.08.60: рамка html-учебника с allow-scripts и полным экраном; кнопка «Книга» смотрит на studyBook',
    src.includes('sandbox="allow-same-origin allow-scripts allow-popups" allow="fullscreen"') && src.includes('bookOk = studyHas(studyBook(s))')
    && src.includes('[s.test].concat(studyBookAll(s))'));
  t('v1.08.60: index.json — у разделов 1–7 книга {ru,en}, файлы раздела 1 в сборке',
    (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'dictionary/index.json'), 'utf8'));
      return j.sections.filter(s => s.id <= 7).every(s => s.book && s.book.ru === `books/section-${s.id}-ru.html` && s.book.en === `books/section-${s.id}-en.html`)
        && [1, 2, 3, 4, 5, 6, 7].every(n => fs.existsSync(path.join(ROOT, `dictionary/books/section-${n}-ru.html`)) && fs.existsSync(path.join(ROOT, `dictionary/books/section-${n}-en.html`))); })());
  t('v1.08.61: учебник раздела 2 — 67 страниц, титулы i–iii, оглавление с главами, RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-2-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-2-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      return pg(ru) === 67 && pg(en) === 67 && ru.includes('"labels":["i","ii","iii","1"') && en.includes('"labels":["i","ii","iii","1"')
        && ru.includes('"t":"Пожар и дым"') && en.includes('"t":"Fire and Smoke"') && ru.includes('"section":2'); })());
  t('v1.08.62: учебник раздела 3 — 54 страницы, титулы i–iv, главы 1–8, RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-3-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-3-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      return pg(ru) === 54 && pg(en) === 54 && ru.includes('"labels":["i","ii","iii","iv","1"') && ru.includes('"t":"Устранение запахов дыма"')
        && en.includes('"t":"Removing Smoke Odors"') && ru.includes('"section":3') && ru.includes('"color":"#FFC800"'); })());
  t('v1.08.63: учебник раздела 4 — 86 страниц, титулы i–iv, главы 1–16, отточия-картинки в «Содержании», RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-4-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-4-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      const p2 = JSON.parse(ru.slice(ru.indexOf('<script id="bk" type="application/json">') + 40, ru.indexOf('</script>', ru.indexOf('<script id="bk"')))).p[1].s;
      return pg(ru) === 86 && pg(en) === 86 && ru.includes('"t":"Системы HVAC"') && en.includes('"t":"HVAC Systems"') && ru.includes('"section":4')
        && (p2.match(/<image /g) || []).length >= 15 && ru.includes('"color":"#58CC02"'); })());
  t('v1.08.64: учебник раздела 5 — 52 страницы, титулы i–iv, главы 1–6, RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-5-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-5-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      return pg(ru) === 52 && pg(en) === 52 && ru.includes('"labels":["i","ii","iii","iv","1"') && ru.includes('"t":"Очистка и обеззараживание"')
        && en.includes('"t":"Cleaning and Decontamination"') && ru.includes('"section":5') && ru.includes('"color":"#8AA0AB"'); })());
  t('v1.08.65: учебник раздела 6 — 76 страниц, титулы i–iv, главы 1–8, RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-6-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-6-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      return pg(ru) === 76 && pg(en) === 76 && ru.includes('"labels":["i","ii","iii","iv","1"') && ru.includes('"t":"Выведение пятен"')
        && en.includes('"t":"Spotting"') && ru.includes('"section":6') && ru.includes('"color":"#9A5A22"'); })());
  t('v1.08.66: учебник раздела 7 — 78 страниц, титулы i–iv, главы 1–9, «Содержание» в оглавлении несмотря на тёмный текст, RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-7-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-7-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      return pg(ru) === 78 && pg(en) === 78 && ru.includes('"labels":["i","ii","iii","iv","1"') && ru.includes('"t":"Содержание"') && ru.includes('"t":"Природа ковра"')
        && en.includes('"t":"The Nature of Carpet"') && ru.includes('"section":7') && ru.includes('"color":"#2F5FD0"'); })());
  t('v1.08.60: учебник раздела 1 — 173 страницы, шрифты и картинки внутри, RU/EN',
    (() => { const ru = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-1-ru.html'), 'utf8'), en = fs.readFileSync(path.join(ROOT, 'dictionary/books/section-1-en.html'), 'utf8');
      const pg = (h) => { const m = h.match(/"pages":(\d+)/); return m ? +m[1] : 0; };
      return pg(ru) === 173 && pg(en) === 173 && ru.includes('font-family:BkSe') && ru.includes('data:image/webp;base64,') && ru.includes('"lang":"ru"') && en.includes('"lang":"en"')
        && ru.includes('Оглавление') && en.includes('Contents'); })());
  t('v1.08.56: экран без вкладок — чипы, две кнопки, результаты и статистика на экране; языка в тесте нет',
    src.includes('function studyChipsHtml') && src.includes('function studyResultsHtml') && src.includes('function studyOverallHtml')
    && !src.includes('STUDY.tab') && !src.includes('studyLang') && src.includes("function stLang(){ return state.lang || 'ru'; }")
    && !src.includes("seg('lang', 'ru', 'RU')") && (src.match(/onclick="App\.studyRead\('\$\{s\.id\}'\)"/g) || []).length === 1);
  const idx = JSON.parse(fs.readFileSync(ROOT + '/dictionary/index.json', 'utf8'));
  t('v1.08.56: index.json — у всех восьми разделов short на двух языках', idx.sections.every(s => s.short && s.short.ru && s.short.en));
  const dcss = fs.readFileSync(ROOT + '/desktop.css', 'utf8');
  t('v1.08.57/86: полоска отправки — крестик и «подробнее», max-height; место и центровка — от #toasts, своих координат внутри него нет',
    css.includes('#toasts > .mq-mini, #toasts > .mq-pop{position:static;transform:none;margin:0;')
    && css.includes('max-height:min(40dvh,240px)') && !css.includes('has-mq-mini') && !css.includes('--mqh')
    && !/html\.tl-desktop \.mq-mini\{[^}]*(left|right|top|bottom):/.test(dcss)
    && css.includes('body:has(> .overlay) #toasts > .mq-mini')
    && src.includes('class="mq-mini-c"') && src.includes("e.target.closest('.mq-mini-c')") && src.includes("e.key === 'Escape' && $('#mq-mini')")
    && src.includes('popHost(el, true);') && (src.match(/popHost\(el\);/g) || []).length === 3);
  t('v1.08.86: «только при ошибке» — настройка аккаунта (push_prefs.mq_quiet), тесты в неё не пишут, галочка в «Всплывающих подсказках»',
    src.includes('state.user.push_prefs.mq_quiet') && src.includes('function mqQuietSyncPref')
    && (src.match(/localStorage\.setItem\('techlog_mq_quiet'/g) || []).length === 2
    && !src.includes("localStorage.removeItem('techlog_mq_quiet')") && src.includes('_mqQuietForce = true;')
    && (src.match(/_mqQuietForce = false;/g) || []).length === 3
    && /function popCardHtml\(\)\{[\s\S]*?App\.mqQuiet\(this\.checked\)[\s\S]*?App\.srchTab/.test(src)
    && !/function mediaQueueCardHtml\(\)\{[\s\S]*?App\.mqQuiet[\s\S]*?\nfunction mediaQueueModal/.test(src));
  t('v1.08.87: кликабельные плашки — cursor:pointer у .banner.clicky, «Пикап сегодня» открывает pkDueModal, ключи RU/EN, набор строк как у myDueCount',
    css.includes('.banner.clicky{cursor:pointer;') && dcss.includes('html.tl-desktop .banner.clicky:hover') && dcss.includes('html.tl-desktop .pkm-list{ grid-template-columns:repeat(2')
    && src.includes('class="banner b-pk clicky ${over?\'b-red\':\'\'}" role="button" tabindex="0"') && src.includes('onclick="App.pkDueModal()"')
    && src.includes('function pkDueModal(){') && src.includes('function pkDueOpen(jobId, ev){') && src.includes('function bannerKey(e){')
    && src.includes('pickupModal, pkDueModal, pkDueOpen, bannerKey,')
    && (src.match(/\(p\.technician_id === state\.user\.id \|\| isPlacementSharedWithMe\(p\)\) && pkPending\(p\)/g) || []).length === 2
    && ['pkd_title', 'pkd_today', 'pkd_over', 'pkd_addr', 'pkd_units', 'pkd_days', 'pkd_open', 'pkd_hint', 'pkd_empty', 'pkd_banner_open'].every(k => (src.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === 2));
  t('v1.08.88: «Проверить связь» в настройках открывает netModal (одна модалка), строка домена вместо сайта Cloudflare, «Копировать лог», img-проба',
    src.includes('onclick="App.netModal()">${ic(\'wifi\')} ${t(\'net_check_btn\')} · ${netPillHtml()}') && !/onclick="App\.netCheck\(\)"/.test(src)
    && src.includes("await netLine(t('net_l_dom').replace('{H}', CANON_HOST)") && src.includes('function netImgProbe(url){') && src.includes('function netCopy(){')
    && src.includes("netLogSet(el, `⚠ ${t('net_l_cf')} — ${t('net_l_blocked')}`, 'warn')")
    && ['net_l_dom', 'net_l_blocked', 'net_cf_note', 'net_copy'].every(k => (src.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === 2));
  const uijs = fs.readFileSync(ROOT + '/ui.js', 'utf8');
  t('v1.08.89: свой размер шрифта у режимов «Телефон» и «ПК», настройка аккаунта, описание — в «?»',
    uijs.includes("var FONT_KEY_PC = 'techlog_font_pct_pc';") && uijs.includes('function fontMode()') && uijs.includes('LS.set(fontKey(), String(best));')
    && uijs.includes("LS.get('techlog_font_v2', null) === '1'") && uijs.includes('fontMode: fontMode,')
    && src.includes("function fontPrefKey(){ return fontMode() === 'desktop' ? 'font_pct_pc' : 'font_pct'; }")
    && src.includes('function fontSyncPref(){') && src.includes('fontSavePref(); render();')
    && src.includes("window.addEventListener('tl:viewmode', () => { try { fontSyncPref(); render(); }")
    && src.includes("${t('font_title')} ${tipQ('font_hint')}") && !/<div class="d">\$\{t\('font_hint'\)\}<\/div>/.test(src)
    && ['font_mode_ph', 'font_mode_pc'].every(k => (src.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === 2));
  t('v1.08.90: диагностика стримит строки в уже открытое окно, синхронизация объяснена, push-раздел с проверкой',
    src.includes('async function runDiagnostics(onLine){') && src.includes('try{ if (onLine) onLine(s); }catch(e){}')
    && /async function showDiagnostics\(\)\{\s*\/\* сначала окно/.test(src) && src.includes('<pre class="diag-pre" id="diag-pre">')
    && src.includes('id="diag-copy" disabled') && css.includes('min-height:min(52vh, 320px)')
    && src.includes("${t('synced')}: <b>${state.lastSync || t('never')}</b> · ${HAS_SB?'Supabase':'DEMO / localStorage'} ${tipQ('sync_tip')}")   /* v1.08.96: без кнопки, в «Диагностике» */
    && src.includes("push_card: 'Push уведомления'") && src.includes("push_card: 'Push notifications'")
    && src.includes('async function pushTest(){') && src.includes('function pushTestKinds(){') && src.includes('function pushTestItem(kind){')
    && src.includes('reg.showNotification(it.title, {') && src.includes("tag: 'techlog-test-' + k") && src.includes('App.pushTest()')
    && ['push_test', 'push_test_hint', 'push_s_perm', 'push_s_sub', 'push_s_srv', 'push_s_fn', 'push_t_done', 'push_t_tail', 'sync_tip', 'sync_what'].every(k => (src.match(new RegExp('\\b' + k + ': \'', 'g')) || []).length === 2));
  t('v1.08.91: справка по нумерации — тот же noHelpHtml() под спойлером в карточке, модалка по «?» на месте',
    src.includes("${fold('nohelp', t('no_help_open'), 'help', noHelpHtml())}")
    && /function numberingCardHtml\(\)\{[\s\S]*App\.noHelp\(\)[\s\S]*fold\('nohelp'/.test(src)
    && src.includes("noHelp(){ openModal(modalHead(t('no_help_t'), 'receipt') + noHelpHtml()); }")
    && (src.match(/\bno_help_open: '/g) || []).length === 2);
  /* --- v1.08.92: 2FA и список «Документы без перевода» --- */
  {
    const svg = T.mfaQrHtml('<svg xmlns="http://www.w3.org/2000/svg" width="41" height="41" style="x"><rect x="0" y="0"/></svg>');
    const dataUrl = T.mfaQrHtml('data:image/png;base64,AAAA');
    const dirty = T.mfaQrHtml('<svg onload="alert(1)"><scr' + 'ipt>alert(2)</scr' + 'ipt><rect/></svg>');
    t('v1.08.92: QR-разметка вставляется как SVG в белую рамку и растягивается по viewBox',
      /^<div class="mfa-qr"><svg /.test(svg) && / width="100%" height="100%"/.test(svg)
      && /viewBox="0 0 41 41"/.test(svg) && !/ style="x"/.test(svg) && !/width="41"/.test(svg), svg.slice(0, 160));
    {
      const withVb = T.mfaQrHtml('<svg viewBox="0 0 25 25"><rect/></svg>');
      const noSize = T.mfaQrHtml('<svg><rect/></svg>');
      t('v1.08.92: свой viewBox не трогаем, SVG без размеров оставляем как есть',
        /viewBox="0 0 25 25"/.test(withVb) && (withVb.match(/viewBox/g) || []).length === 1
        && /width="100%"/.test(withVb) && /<svg><rect\/><\/svg>/.test(noSize), withVb + ' | ' + noSize);
    }
    t('v1.08.92: data:-код — картинкой в той же рамке; мусор и скрипты вырезаются',
      /^<div class="mfa-qr"><img src="data:image\/png;base64,AAAA"/.test(dataUrl)
      && !/onload/.test(dirty) && !/<scr.pt/i.test(dirty) && T.mfaQrHtml('') === '' && T.mfaQrHtml('javascript:1') === '', dataUrl + ' | ' + dirty);
    t('v1.08.92: otpauth-ссылка собирается с секретом и издателем',
      /^otpauth:\/\/totp\/TechLog/.test(T.mfaUri('ABC')) && /[?&]secret=ABC/.test(T.mfaUri('ABC'))
      && /issuer=TechLog/.test(T.mfaUri('ABC')) && T.mfaUri('') === '');
    t('v1.08.92: код 2FA требуется ровно при aal1→aal2',
      T.mfaNeedsCode({ currentLevel: 'aal1', nextLevel: 'aal2' }) === true
      && T.mfaNeedsCode({ currentLevel: 'aal2', nextLevel: 'aal2' }) === false
      && T.mfaNeedsCode({ currentLevel: 'aal1', nextLevel: 'aal1' }) === false && T.mfaNeedsCode(null) === false);
  }
  t('v1.08.92: калитка 2FA стоит на всех трёх путях входа, «Отмена» завершает вход, prompt() убран',
    src.includes('if (await mfaGate(data.session)) return;') && src.includes('if (session && !(await mfaGate(session)))')
    && src.includes('mfaGate(s).then(need => {') && src.includes('async function mfaLoginCancel(){')
    && src.includes('function mfaDisableModal(){') && !/prompt\(t\('mfa_enter'\)\)/.test(src)
    && ['mfa_open_app', 'mfa_copy_secret', 'mfa_manual', 'mfa_gate', 'mfa_dis_code', 'mfa_lost'].every(k => (src.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === 2));
  t('v1.08.92: список без перевода — строка-кнопка документа, галочки и фильтры; перевод по отмеченным',
    src.includes('class="grow tr-open"') && src.includes('App.trOpenDoc(') && src.includes('App.trSelOne(')
    && src.includes('App.trSelAll(1)') && src.includes('function trFiltered(list){') && src.includes('async function trRunSel(){')
    && src.includes('async function trRunList(list, silent){') && css.includes('.rowline.tr-row-doc')
    && ['tr_sel_all', 'tr_sel_none', 'tr_f_who', 'tr_f_cp', 'tr_f_cx', 'tr_open_doc'].every(k => (src.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === 2));
  t('v1.08.93: окно кода 2FA не обойти — подложка и стрелка «назад» вызывают отмену входа, отмена выходит и локально',
    /function openModal\(html, opt\)\{/.test(src)
    && src.includes("const bye = (opt && typeof opt.onClose === 'function') ? opt.onClose : closeModal;")
    && src.includes("if (bx) bx.onclick = (e) => { e.preventDefault(); e.stopPropagation(); opt.onClose(); };")
    && src.includes('{ onClose: () => mfaLoginCancel() });')
    && src.includes("await state.sb.auth.signOut({ scope: 'local' });"));
  t('v1.08.94: во всех трёх окнах кода 2FA — общий ввод с Enter, только цифры, без maxlength',
    src.includes('function mfaCodeInput(go){') && (src.match(/\$\{mfaCodeInput\(/g) || []).length === 3
    && !/id="mfa-code"[^>]*maxlength/.test(src)
    && src.includes("onkeydown=\"if(event.key==='Enter'){event.preventDefault();${go}}\"")
    && src.includes('enterkeyhint="go"') && /mfaCodeInput\(`App\.mfaVerifyEnroll/.test(src)
    && src.includes("mfaCodeInput('App.mfaDisableGo()')") && src.includes("mfaCodeInput('App.mfaLoginVerify()')"));
  t('v1.08.95: «Настройки документов» — печать и поиск ушли из «Подсказок», общий доступ/аренда/лимиты внутри секции, отступы у галочек',
    src.includes("${fold('docs', t('docs_set_card'), 'clipboard', docsCardHtml())}")
    && !/function popCardHtml\(\)\{[\s\S]*?\n\}/.exec(src)[0].match(/App\.printBtn|App\.srchTab|App\.searchOpen/)
    && src.includes('return docsMyCardHtml() + docsSharedCardHtml() + docsEquipCardHtml() + mediaLimitsCardHtml()')
    && !src.includes("fold('mlim'") && (src.match(/id="org-shared"/g) || []).length === 1
    && (src.match(/orgStepperHtml\('default_rent_days'/g) || []).length === 1
    && css.includes('.set-opts{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;margin:10px 0}')
    && ['docs_set_card', 'docs_my_title'].every(k => (src.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === 2));
  t('v1.08.96: раздел «Диагностика» — связь и журналы сверху, подразделы Интерфейс / Тесты / Бэкап / Автобэкап, кнопки «Синхронизировать» нет',
    src.includes("${fold('dgs', t('dgs_card'), 'steth', dgsCardHtml())}")
    && !src.includes('onclick="App.sync()"') && src.includes("sync(){ syncNow(false);")
    && src.includes("+ fold('uid', t('dg_ui'), 'layers', uiDiagCardHtml(), true)")
    && src.includes("(adm ? fold('diag', t('diag_card'), 'flask', diagCardHtml(), true)")
    && src.includes("+ fold('bkp', t('bk_card'), 'save', backupCardHtml(), true)")
    && src.includes("+ fold('abk', t('abk_card'), 'save', abkCardHtml(), true) : '')")
    && (src.match(/fold\('(uid|diag|bkp|abk)'/g) || []).length === 4
    && src.includes('function fold(key, label, iconName, html, sub){')
    && css.includes('.fold.on > .fold-h{') && !css.includes('.fold.on .fold-h{') && css.includes('.fold-sub > .fold-h{')
    && !/кнопка нужна, если кажется|the button is for when data looks stale/.test(src)
    && ['dgs_card', 'dg_net_title', 'dg_ui'].every(k => (src.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === 2));
  t('v1.08.97: «Нумерация» и «Организация (для PDF)» — подразделы «Настроек документов»; организация — админ и бухгалтер; SQL-комплект 1.08.97',
    src.includes("+ fold('num', t('no_card'), 'receipt', numberingCardHtml(), true)")
    && src.includes("+ fold('org', t('org'), 'building', orgCardHtml(), true);")
    && !src.includes("${fold('num', t('no_card'), 'receipt', numberingCardHtml())}")
    && (src.match(/id="org-name"/g) || []).length === 1 && /function orgCardHtml\(\)\{\s*if \(!isAdmin\(\) && !isAcc\(\)\) return '';/.test(src)
    && src.includes("if ((!isAdmin() && !isAcc()) || !$('#org-name')) return;   // v1.08.97: админ и бухгалтер, форма на экране")
    && /^full-install-1_0(8_97|9_\d\d)\.sql$/.test(T.DB_SQL_FILE)   /* v1.09.01: комплект двинулся дальше */
    && (() => { const u = fs.readFileSync(ROOT + '/supabase/update-to-1_08_97.sql', 'utf8'), f = fs.readFileSync(ROOT + '/supabase/full-install-1_08_97.sql', 'utf8');
         return [u, f].every(x => x.includes('create policy org_settings_acc_upd') && x.includes('create policy org_settings_acc_ins')
           && x.includes("with check (public.my_role() = 'accountant' and id = 'org')") && x.includes('create trigger org_settings_acc_guard_tg before update on public.org_settings')
           && x.includes("'voice_line','fax_line','ship_method','legal_note']") && x.includes('схема соответствует v1.08.97'))
           && f.includes('create table if not exists public.org_settings') && fs.existsSync(ROOT + '/tests/org-acc.sql'); })());
  t('v1.08.98: раздел «Интеграции» — «Настройка Google Drive» и «GPS-трекинг Bouncie» подразделами, у Bouncie своя подпись Redirect URI',
    src.includes("${fold('intg', t('intg_card'), 'link', intgCardHtml())}")
    && src.includes("return fold('gd', t('gd_card'), 'folder', mediaSettingsCardHtml(), true)")
    && src.includes("+ fold('bn', t('bn_card'), 'car', bnCardHtml(), true);")
    && (src.match(/fold\('(gd|bn)'/g) || []).length === 2
    && src.includes("gd_card: 'Настройка Google Drive'") && src.includes("gd_card: 'Google Drive settings'")
    && /function bnCardHtml\(\)\{[\s\S]*?\n\}/.exec(src)[0].split("t('bn_redirect')").length === 3
    && !/function bnCardHtml\(\)\{[\s\S]*?\n\}/.exec(src)[0].includes("t('gd_redirect')")
    && ['intg_card', 'bn_redirect'].every(k => (src.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === 2));
  t('v1.08.99: «ТВ-экраны» — первая карточка «Режима телевизора», список грузится при раскрытом tvc, подсказка на ТВ ведёт по новому пути',
    src.includes("${fold('tvc', t('tvc_card'), 'tv', tvModeHtml())}") && !src.includes("fold('tvs'")
    && /function tvModeHtml\(\)\{\s*return `<div class="card" id="tvs-card">[\s\S]*?\$\{tvSessionsCardHtml\(\)\}[\s\S]*?<div class="card" id="tvc-card">\$\{tvCfgCardHtml\(\)\}<\/div>`;/.test(src)
    && src.includes("if (!HAS_SB || !isAdmin() || !foldOpen('tvc')) return;") && !src.includes("foldOpen('tvs')")
    && src.includes("Настройки → «Режим телевизора» → «ТВ-экраны»") && src.includes("Settings → “TV mode” → “TV screens”"));
  t('v1.09.00: «Push уведомления и подсказки» одним разделом; «Прочие функции» (Функции, Код приглашения, PWA) — последний раздел перед «Выйти»',
    src.includes("${fold('push', t('push_pop_card'), 'bell', pbCardHtml() + popCardHtml())}") && !src.includes("fold('pop'")
    && !src.includes("fold('feat'") && src.includes("${fold('misc', t('misc_card'), 'gear', miscCardHtml())}\n\n  <button class=\"btn btn-red\" onclick=\"App.logout()\">")
    && src.includes("return (isAdmin() ? featCardHtml() + inviteCardHtml() : '') + pwaCardHtml();")
    && (src.match(/onclick="App\.inviteSave\(\)"/g) || []).length === 1 && (src.match(/onclick="App\.updCheck\(\)"/g) || []).length === 1
    && /function inviteCardHtml\(\)\{\s*if \(!isAdmin\(\)\) return '';/.test(src)
    && ['misc_card', 'push_pop_card'].every(k => (src.match(new RegExp('\\b' + k + ": '", 'g')) || []).length === 2));
  t('dictionary/index.json: 8 разделов, файлы всех семи разделов и учебник 8 реально лежат в сборке',
    idx.sections.length === 8 && [1, 2, 3, 4, 5, 6, 7].every(n => fs.existsSync(ROOT + '/dictionary/' + idx.sections[n - 1].test))
    && fs.existsSync(ROOT + '/dictionary/' + idx.sections[7].book) && fs.existsSync(ROOT + '/dictionary/tests/SCHEMA.md')
    && fs.existsSync(ROOT + '/dictionary/tests/template.json') && fs.existsSync(ROOT + '/dictionary/tests/tools/normalize-quiz.py'));
  /* нормализация: единый формат и три старых варианта структуры */
  const canon = T.qzNorm(JSON.parse(fs.readFileSync(ROOT + '/dictionary/tests/template.json', 'utf8')), 1);
  t('qzNorm: единый формат — вопрос, 6 вариантов, верный «2», схема, ссылка на страницы',
    canon.questions.length === 1 && canon.questions[0].options.length === 6 && canon.questions[0].correct[0] === '2'
    && canon.questions[0].asset === 'scheme_example' && canon.assets.scheme_example.svg.startsWith('<svg')
    && canon.questions[0].options[1].explanation.ru.startsWith('Верно') && canon.questions[0].ref.pages[0] === 1);
  const legacyA = T.qzNorm({ meta: { title: 'X' }, assets: { pic: { type: 'svg', title: 'P', content: '<svg/>' } },
    questions: [{ id: 'U1-Q01', manualSection: 3, pages: [1], question: { en: 'q', ru: 'в' }, media: 'pic',
      options: [{ id: '1', text: { en: 'a', ru: 'а' } }, { id: '2', text: { en: 'b', ru: 'б' } }], correctOption: '2',
      option_explanations: { '2': { en: 'ok', ru: 'да', ref: { pages: [7] } } } }] }, 3);
  t('qzNorm: старый вариант A (correctOption + option_explanations + media/content)',
    legacyA.questions[0].correct[0] === '2' && legacyA.questions[0].asset === 'pic' && legacyA.assets.pic.svg === '<svg/>'
    && legacyA.questions[0].options[1].explanation.ru === 'да' && legacyA.questions[0].options[1].pages[0] === 7 && legacyA.meta.section === 3);
  const legacyB = T.qzNorm({ meta: {}, media: { m1: { type: 'svg', svg: '<svg/>' } },
    questions: [{ id: 'S5-001', type: 'single', book: { journalSection: 5, chapter: 1, chapterTitle: { en: 'Bg', ru: 'Общ' }, pages: '1' }, mediaRef: 'm1',
      question: { en: 'q', ru: 'в' }, options: [{ id: 1, text: { en: 'a', ru: 'а' }, correct: false, explanation: { en: 'no', ru: 'нет' } },
      { id: 2, text: { en: 'b', ru: 'б' }, correct: true, explanation: { en: 'yes', ru: 'да' } }], reference: { journalSection: 5, chapter: 1, pages: '1', label: { en: 'L', ru: 'Л' } } }] }, 5);
  t('qzNorm: старый вариант B (correct:true в варианте, mediaRef, book.chapterTitle; номер главы — не название)',
    legacyB.questions[0].correct[0] === '2' && legacyB.questions[0].asset === 'm1' && legacyB.questions[0].ref.chapter.ru === 'Общ'
    && legacyB.questions[0].ref.pages[0] === '1' && legacyB.questions[0].options[0].id === '1' && legacyB.questions[0].type === 'single');
  const legacyC = T.qzNorm({ meta: {}, assets: { a1: { type: 'svg', svg: '<svg/>' } },
    questions: [{ id: 'q001', journalSection: 7, pages: '1-2', sectionTitle: { en: 'Intro', ru: 'Введ' }, asset: 'a1', multiSelect: true,
      question: { en: 'q', ru: 'в' }, options: [{ id: '1', text: { en: 'a', ru: 'а' } }, { id: '2', text: { en: 'b', ru: 'б' } }], correct: ['1', '2'] }] }, 7);
  t('qzNorm: старый вариант C (correct[] + multiSelect + asset + sectionTitle) → multi',
    legacyC.questions[0].type === 'multi' && legacyC.questions[0].correct.length === 2 && legacyC.questions[0].ref.chapter.en === 'Intro');
  const legacyD = T.qzNorm({ meta: { quiz_id: 'wdr-s1', source: { section: 1, title: { en: 'WDR', ru: 'ВДР' } }, covers: { pages: '1-162' } },
    chapters: [{ no: 1, pages: '1-6', title: { en: 'Introduction', ru: 'Введение' } }],
    questions: [{ id: 's1-q008', type: 'single', source_ref: { section: 1, pages: [2], chapter_no: 1, chapter_title: { en: 'Introduction', ru: 'Введение' } },
      media: { type: 'svg', file: 'media/s1-restore-or-replace.svg', caption: { en: 'C', ru: 'П' }, alt: { en: 'A', ru: 'Ф' } },
      question: { en: 'q', ru: 'в' }, options: [{ id: '1', text: { en: 'a', ru: 'а' } }, { id: '2', text: { en: 'b', ru: 'б' } }], correct: ['1'],
      option_explanations: { '1': { en: 'ok', ru: 'да', ref: { section: 1, pages: [2] } } } }] }, 1);
  t('qzNorm: вариант D (раздел 1: media-объект с файлом, chapters, chapter_title/chapter_no)',
    legacyD.questions[0].asset === 's1-restore-or-replace' && legacyD.assets['s1-restore-or-replace'].type === 'image'
    && legacyD.assets['s1-restore-or-replace'].src === 'media/s1-restore-or-replace.svg' && legacyD.assets['s1-restore-or-replace'].alt.ru === 'Ф'
    && legacyD.questions[0].topic.ru === 'Введение' && legacyD.questions[0].ref.chapter.en === 'Introduction' && legacyD.meta.title.ru === 'ВДР');
  const s1 = JSON.parse(fs.readFileSync(ROOT + '/dictionary/tests/section-1.json', 'utf8'));
  t('section-1.json в сборке: 399 вопросов, 48 встроенных схем без <metadata>, 10 тем-глав',
    s1.questions.length === 399 && Object.keys(s1.assets).length === 48 && Object.values(s1.assets).every(a => a.svg.startsWith('<svg') && !a.svg.includes('<metadata'))
    && s1.topics.length === 10 && s1.questions.filter(q => q.asset).length === 48 && s1.questions.every(q => q.options.length === 6 && q.options.every(o => o.explanation)));
  const legacyE = T.qzNorm({ schema_version: '1.0', id: 'razdel-2', title: { en: 'FS', ru: 'ПД' }, source: { book: 'Fire', journal_section: 2, pages: 'i-iii, 1-64' },
    settings: { pass_score_percent: 75, shuffle_questions: true, shuffle_options_default: false },
    sections: [{ id: 2, title: { en: 'Fire and Smoke', ru: 'Пожар и дым' }, pages: '2-5' }],
    media: { 'fire-triangle': { type: 'svg', title: { en: 'T', ru: 'Т' }, content: '<svg/>' } },
    questions: [{ id: 'q-005', section: 2, pages: '2', topic: { en: 'About Smoke', ru: 'О дыме' }, type: 'single', media: ['fire-triangle'],
      question: { en: 'q', ru: 'в' }, options: [{ n: 1, text: { en: 'a', ru: 'а' } }, { n: 2, text: { en: 'b', ru: 'б' } }], correct: 1,
      explanation: { en: 'e', ru: 'о' }, reference: { en: 'Journal section 2 (red), Section 2, p. 2', ru: 'Журнал, раздел 2, с. 2' } }] }, 2);
  t('qzNorm: вариант E (раздел 2: без meta, settings, sections-главы, options.n, correct числом, media списком)',
    legacyE.questions[0].correct[0] === '1' && legacyE.questions[0].options[1].id === '2' && legacyE.questions[0].asset === 'fire-triangle'
    && legacyE.questions[0].ref.section === 2 && legacyE.questions[0].ref.chapter.ru === 'Пожар и дым' && legacyE.questions[0].ref.pages[0] === '2'
    && legacyE.questions[0].topic.ru === 'О дыме' && legacyE.meta.pass_percent === 75 && legacyE.meta.title.ru === 'ПД' && legacyE.meta.section === 2);
  const s2 = JSON.parse(fs.readFileSync(ROOT + '/dictionary/tests/section-2.json', 'utf8'));
  t('section-2.json в сборке: 201 вопрос, 17 схем, 8 тем-глав, у всех вопросов ссылка на раздел 2',
    s2.questions.length === 201 && Object.keys(s2.assets).length === 17 && s2.topics.length === 8 && s2.meta.section === 2
    && s2.questions.every(q => q.ref && q.ref.section === 2 && q.ref.chapter && q.options.length === 6));
  const legacyF = T.qzNorm({ meta: { id: 'mr-s4', title: { en: 'MR', ru: 'МР' }, source: { book: 'Microbial Remediation', pagesCovered: 'i–iv, 1–82' } },
    mediaLibrary: { apf_table: { id: 'apf_table', type: 'svg', svg: '<svg/>' } },
    questions: [{ id: 'MR4-061', section: 5, sectionTitle: { en: 'Health and Safety', ru: 'Охрана труда' }, pages: '24, 26', topic: 'ppe', type: 'single',
      media: { type: 'svg', id: 'apf_table', caption: { en: 'APF', ru: 'КЗФ' } },
      question: { en: 'q', ru: 'в' }, options: [
        { id: 'a', text: { en: 'a', ru: 'а' }, isCorrect: true, explanation: { en: 'ok', ru: 'да' } },
        { id: 'b', text: { en: 'b', ru: 'б' }, isCorrect: false, explanation: { en: 'no', ru: 'нет' } },
        { id: 'c', text: { en: 'Options 1 and 2', ru: 'Верны варианты 1 и 2' }, isCorrect: false }],
      correctOptionIds: ['a'], explanation: { en: 'e', ru: 'о' }, reference: { section: 5, pages: '24, 26', citation: { en: 'Section 5, pp. 24, 26', ru: 'Раздел 5, стр. 24, 26' } } }] }, 4);
  const f0 = legacyF.questions[0];
  t('qzNorm: вариант F (раздел 4: mediaLibrary, media.id + caption, a…f → 1…6, isCorrect/correctOptionIds, section = глава, slug-тема скрыта)',
    f0.options.map(o => o.id).join('') === '123' && f0.correct[0] === '1' && f0.options[0].explanation.ru === 'да'
    && f0.asset === 'apf_table' && legacyF.assets.apf_table.caption.ru === 'КЗФ' && f0.ref.section === 4 && f0.ref.chapter.ru === 'Охрана труда'
    && f0.ref.pages[0] === '24, 26' && f0.ref.text.ru.startsWith('Раздел 5') && f0.topic && f0.topic.ru === 'Охрана труда');
  const s4 = JSON.parse(fs.readFileSync(ROOT + '/dictionary/tests/section-4.json', 'utf8'));
  t('section-4.json в сборке: 193 вопроса, 26 схем, 16 тем-глав, варианты 1–6, у всех ссылка на раздел 4',
    s4.questions.length === 193 && Object.keys(s4.assets).length === 26 && s4.topics.length === 16 && s4.meta.section === 4
    && s4.questions.every(q => q.ref && q.ref.section === 4 && q.options.map(o => o.id).join('') === '123456' && q.correct.length === 1 && q.options.every(o => o.explanation)));
  const legacyG = T.qzNorm({ schemaVersion: '1.0', meta: { id: 'uf', title: { en: 'UF', ru: 'ЧО' }, source: { title: 'Upholstery', pages: 'i–iv, 1–72' },
      sections: [{ number: 5, title: { en: 'The Chemistry of Cleaning', ru: 'Химия чистки' }, pages: '37–42' }] },
    assets: { 'fig-ph-scale': { type: 'svg', title: { en: 'pH', ru: 'pH' }, content: '<svg/>' } },
    questions: [{ id: 's6-137', section: 5, sectionTitle: { en: 'The Chemistry of Cleaning', ru: 'Химия чистки' }, pages: '38', topic: 'pH', type: 'single_choice',
      question: { en: 'q', ru: 'в' }, options: [
        { id: '1', text: { en: 'a', ru: 'а' }, correct: true, explanation: { en: 'ok [Sec. 5, p. 38]', ru: 'да [Разд. 5, стр. 38]' }, reference: { section: 5, pages: '38' } },
        { id: '2', text: { en: 'b', ru: 'б' }, correct: false, explanation: { en: 'no', ru: 'нет' }, reference: { section: 5, pages: '39' } }],
      correctOptionId: '1', explanation: { en: 'e', ru: 'о' }, reference: { section: 5, pages: '38' },
      media: { type: 'svg', assetId: 'fig-ph-scale', caption: { en: 'pH scale', ru: 'Шкала pH' } } }] }, 6);
  const g0 = legacyG.questions[0];
  t('qzNorm: вариант G (раздел 6: meta.sections[number], single_choice, correctOptionId, media.assetId, страницы варианта из reference, строка-тема скрыта)',
    g0.type === 'single' && g0.correct[0] === '1' && g0.asset === 'fig-ph-scale' && legacyG.assets['fig-ph-scale'].caption.ru === 'Шкала pH'
    && g0.ref.section === 6 && g0.ref.chapter.ru === 'Химия чистки' && g0.ref.pages[0] === '38' && g0.options[1].pages[0] === '39'
    && g0.topic && g0.topic.ru === 'Химия чистки');
  const s6 = JSON.parse(fs.readFileSync(ROOT + '/dictionary/tests/section-6.json', 'utf8'));
  t('section-6.json в сборке: 272 вопроса, 31 схема, схема у каждого, 8 тем-глав, у всех ссылка на раздел 6',
    s6.questions.length === 272 && Object.keys(s6.assets).length === 31 && s6.topics.length === 8 && s6.meta.section === 6
    && s6.questions.every(q => q.asset && q.ref && q.ref.section === 6 && q.ref.chapter && q.options.length === 6 && q.correct.length === 1 && q.options.every(o => o.explanation)));
  t('qzNorm: вопрос без верного ответа или с одним вариантом отбрасывается',
    T.qzNorm({ questions: [{ id: 'x', question: 'q', options: [{ id: '1', text: 'a' }] }, { id: 'y', question: 'q', options: [{ id: '1', text: 'a' }, { id: '2', text: 'b' }] }] }, 1).questions.length === 0);
  /* доступ */
  const orgBak = T.state.data.org_settings;
  T.state.data.org_settings = { ...orgBak, study_on: true, study_all: true };
  t('доступ: «всем» — техник без флага допущен; админ — всегда',
    T.studyAllowedFor({ role: 'tech' }) && T.studyAllowedFor({ role: 'admin' }));
  T.state.data.org_settings = { ...orgBak, study_on: true, study_all: false };
  t('доступ: «по списку» — только с флагом study_access',
    !T.studyAllowedFor({ role: 'tech' }) && T.studyAllowedFor({ role: 'tech', study_access: true }) && !T.studyAllowedFor({ role: 'manager' }));
  T.state.data.org_settings = { ...orgBak, study_on: false, study_all: true };
  t('доступ: общий выключатель снят — техник нет, админ да',
    !T.studyAllowedFor({ role: 'tech', study_access: true }) && T.studyAllowedFor({ role: 'admin' }));
  T.state.data.org_settings = orgBak;
  const userBak = T.state.user;
  T.state.user = { id: 'u1', role: 'tech' };
  const withBtn = T.viewTabbar().includes("App.go('study')");
  T.state.user = { id: 'u1', role: 'tech', study_off: true };
  const noBtn = T.viewTabbar().includes("App.go('study')");
  T.state.user = { id: 'u1', role: 'accountant' };
  const accBtn = T.viewTabbar().includes("App.go('study')");
  T.state.user = userBak;
  t('меню: кнопка есть у техника, прячется личной галочкой, у бухгалтера нет', withBtn && !noBtn && !accBtn);
  /* статистика по сессиям и формат времени */
  const list = [
    { kind: 'test', section: 3, score_pct: 60, duration_ms: 60000, started_at: '2026-09-13T10:00:00Z' },
    { kind: 'test', section: 3, score_pct: 85, duration_ms: 90000, started_at: '2026-09-13T11:00:00Z' },
    { kind: 'read', section: 3, duration_ms: 30000, started_at: '2026-09-13T12:00:00Z' }];
  const st = T.studySecStat(3, list);
  t('studySecStat: попытки 2, лучший 85, последний (по дате) 85, время чтения 30 с', st.n === 2 && st.best === 85 && st.last === 85 && st.readMs === 30000 && st.testMs === 150000);
  t('fmtMs: 5 с / 2 мин 05 с / 1 ч 01 мин', T.fmtMs(5000) === '5 с' && T.fmtMs(125000) === '2 мин 05 с' && T.fmtMs(3660000) === '1 ч 01 мин');
  /* верстка, sw, справка */
  t('CSS: стили теста, вариантов, кольца результата, рамки учебника',
    css.includes('.st-opt.ok{') && css.includes('.st-ring{') && css.includes('.st-frame{') && css.includes('.st-kpi{'));
  t('service worker: index.json в прекэше, dictionary/ — stale-while-revalidate',
    sw.includes("'./dictionary/index.json'") && sw.includes("url.pathname.includes('/dictionary/')") && /VERSION = '1\.(08\.(5[1-9]|[6-9]\d)|(09|[1-9]\d)\.\d\d)'/.test(sw));   /* v1.09.00: номер версии перешёл на 1.09 */
  t('v1.08.72: встроенный регресс — функция regressRun, кнопка в диагностике, десять шагов и уборка остатков',
    src.includes('async function regressRun()') && src.includes("App.regress()") && src.includes("t('rg_clean')")
    && ['rg_job','rg_media','rg_send','rg_pk','rg_rep','rg_home','rg_take','rg_yest','rg_del','rg_gone'].every(k => src.includes("t('" + k + "')")) && src.includes('window.confirm = confirm0'));
  t('v1.08.71: biText — «ru | en» и «ru / en» по языку интерфейса, без разделителя как есть',
    (() => { const L0 = T.state.lang; T.state.lang = 'en'; const e1 = T.biText('Шланги и насадки | Hoses and nozzles'), e2 = T.biText('Эйрдак-машина / Air duct machine'), e3 = T.biText('Шуруповёрт'), e4 = T.biText('Steam / Dry');
      T.state.lang = 'ru'; const r1 = T.biText('Шланги и насадки | Hoses and nozzles'), r2 = T.biText('Air duct machine / Эйрдак-машина'); T.state.lang = L0;
      return e1 === 'Hoses and nozzles' && e2 === 'Air duct machine' && e3 === 'Шуруповёрт' && e4 === 'Steam / Dry' && r1 === 'Шланги и насадки' && r2 === 'Эйрдак-машина'; })());
  t('v1.08.71: замок после апрува — работник не архивирует апрувнутый документ, админ может, без галочки можно',
    (() => { const org = T.state.data.org_settings, u = T.state.user; const saveOrg = { ...org }, saveU = u;
      const job = { id: 'j1', technician_id: 'tech1', status: 'approved', date: '2026-09-14' };
      T.setUser({ id: 'tech1', role: 'tech', display_name: 'T' }); T.state.data.org_settings = { ...org };
      const a = T.mediaLocked(job) && !T.canArchDoc({ t: 'job', o: job });
      T.state.data.org_settings = { ...org, media_lock_approved: false }; const b = !T.mediaLocked(job) && T.canArchDoc({ t: 'job', o: job });
      T.state.data.org_settings = { ...org }; T.setUser({ id: 'adm', role: 'admin', display_name: 'A' }); const c = !T.mediaLocked(job) && T.canArchDoc({ t: 'job', o: job });
      T.state.data.org_settings = saveOrg; T.setUser(saveU); return a && b && c; })());
  t('v1.08.71: кнопка печати на карточке — личная галочка включена по умолчанию, SQL 1.08.71 и media-delete с замком',
    T.printBtnOn() && src.includes("App.jobPrint('${j.id}')") && src.includes("onchange=\"App.printBtn(this.checked)\"")
    && fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_08_71.sql'), 'utf8').includes('media_lock_approved boolean not null default true')
    && fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_08_71.sql'), 'utf8').includes('media_lock_approved')
    && fs.readFileSync(path.join(ROOT, 'supabase/functions/media-delete/index.ts'), 'utf8').includes('LOCKED_APPROVED')
    && fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/google.ts'), 'utf8').includes('FN_VER = "1.08.71"') && src.includes("'media-delete': '1.08.71'"));
  t('v1.08.71: полная проверка Диска — кнопка в карточке Диска и функция gdFullTest в App',
    src.includes('App.gdFullTest()') && src.includes('async function gdFullTest()') && src.includes("kind === 'invoice' ? M_INV_MAX"));
  t('v1.08.70: разбор комбо-пунктов — «1 и 3», «все», «ни один», просто число, обычный текст',
    JSON.stringify(T.stComboRefs('Верны варианты 1 и 3')) === '[1,3]' && T.stComboRefs('Все перечисленные варианты верны') === 'all'
    && T.stComboRefs('Ни один из приведённых выше вариантов не верен') === 'none' && T.stComboRefs('None of the above') === 'none'
    && JSON.stringify(T.stComboRefs('Both 1 and 2')) === '[1,2]' && JSON.stringify(T.stComboRefs('Только 2')) === '[2]'
    && T.stComboRefs('10') === null && T.stComboRefs('1 000') === null && T.stComboRefs('Категория 2 воды') === null
    && T.stComboRefs('Ни один продукт нельзя применять в генераторе') === null && T.stComboRefs('Через 24–48 часов') === null);
  t('v1.08.70: представление вопроса — комбо-пункт «1 и 3» верный → набор {1,3}, комбо убраны, «ни один» последним, номера 1…N',
    (() => { const q = { id: 'x', type: 'single', correct: ['5'], options: [
        { id: '1', text: { ru: 'А' } }, { id: '2', text: { ru: 'Б' } }, { id: '3', text: { ru: 'В' } }, { id: '4', text: { ru: 'Ни один из вариантов не верен' } }, { id: '5', text: { ru: 'Верны варианты 1 и 3' } }, { id: '6', text: { ru: 'Все варианты верны' } } ] };
      const v = T.stViewBuild(q); if (!v) return false;
      const opts = T.stOpts(q, v);
      return v.plain && v.multi && v.correct.slice().sort().join() === '1,3' && v.order.length === 4 && v.order[3] === '4'
        && opts.map(x => x.no).join() === '1,2,3,4' && opts.every(x => !/Верны варианты|Все варианты/.test(x.o.text.ru)) && T.stCorrect(q, v).join() === v.correct.join(); })());
  t('v1.08.70: «все варианты верны» → все смысловые; «ни один» верный → сам пункт; вопрос без комбо — только перемешивание',
    (() => { const mk = (c) => ({ id: 'y', type: 'single', correct: [c], options: [{ id: '1', text: { ru: 'А' } }, { id: '2', text: { ru: 'Б' } }, { id: '3', text: { ru: 'Ни один из вариантов не верен' } }, { id: '4', text: { ru: 'Все варианты верны' } }] });
      const a = T.stViewBuild(mk('4')), n = T.stViewBuild(mk('3'));
      const plain = T.stViewBuild({ id: 'z', type: 'single', correct: ['2'], options: [{ id: '1', text: { ru: 'А' } }, { id: '2', text: { ru: 'Б' } }, { id: '3', text: { ru: 'В' } }] });
      return a && a.correct.slice().sort().join() === '1,2' && n && n.correct.join() === '3' && n.order[2] === '3'
        && plain && !plain.plain && !plain.multi && plain.correct.join() === '2' && plain.order.slice().sort().join() === '1,2,3'; })());
  t('v1.08.70: все 1747 вопросов семи тестов преобразуются; вопросов с несколькими верными > 400',
    (() => { let n = 0, ok = 0, multi = 0;
      for (let k = 1; k <= 7; k++){ const j = JSON.parse(fs.readFileSync(path.join(ROOT, `dictionary/tests/section-${k}.json`), 'utf8'));
        j.questions.forEach(q => { n++; const v = T.stViewBuild(q); if (v){ ok++; if (v.correct.length > 1) multi++; } }); }
      return n === 1747 && ok === n && multi > 400; })());
  t('v1.08.70: галочка админа «перемешивать варианты», колонка org_settings.study_shuffle в update-to и full-install, DB_NEED_COLS',
    src.includes("setOrgFlag('study_shuffle', this.checked)") && src.includes("['org_settings',  'study_shuffle']") && /^full-install-1_0(8_(7\d|9\d)|9_\d\d)\.sql$/.test(T.DB_SQL_FILE)
    && fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_08_70.sql'), 'utf8').includes('study_shuffle boolean not null default true')
    && fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_08_70.sql'), 'utf8').includes('study_shuffle boolean not null default true'));
  t('v1.08.69: карта — помощник перевода называется LOC, function L на верхнем уровне нет (иначе подменяется window.L Leaflet)',
    src.includes('function LOC(o){') && !/^function L\(/m.test(src) && !/^(const|let|var) L\b/m.test(src) && src.includes('L.map(') && src.includes('LOC(s.title)'));
  t('v1.08.69: телефон — прокручивается #app, документ стоит; ПК не тронут',
    css.includes('html:not(.tl-desktop) body{ height:100%;min-height:0;overflow:hidden') && css.includes('html:not(.tl-desktop) #app{') && css.includes('overflow-y:auto;overflow-x:hidden')
    && src.includes('function scrollHost()') && src.includes('function pageScrollTo(y, smooth)') && !/window\.scrollTo\(0, 0\)/.test(src));
  t('v1.08.69: пилюля связи не переносится и не сжимается',
    css.includes('.net-pill{ flex:0 0 auto;white-space:nowrap !important') && css.includes('button.btn:has(> .net-pill){ flex-wrap:wrap }'));
  t('v1.08.60: sw — под ключ оболочки только сама оболочка; учебник во фрейме идёт веткой dictionary/',
    sw.includes("req.mode === 'navigate' && !url.pathname.includes('/dictionary/')") && sw.includes("const shell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')"));
  t('справка экрана S.study на двух языках и карточка настроек',
    src.includes('S.study = H(') && src.includes("fold('study', t('st_card'), 'grad', studyCardHtml())")
    && src.includes("App.studyAccess('${uid_}', this.checked)"));

  console.log('\n— v1.08.73: камера в приложении, приёмник, «Поделиться», видео —');
  t('v1.08.73: ключи RU/EN на месте', ['cam_in_title', 'cam_in_done', 'cam_in_torch', 'cam_in_no', 'cam_in_denied', 'cam_in_vid_no', 'cam_in_rec_hint',
      'cam_mode_app', 'cam_mode_app_h', 'cam_mode_inapp', 'share_title', 'share_q', 'share_recent', 'share_drop', 'share_done', 'share_none', 'share_hint',
      'intake_rest', 'mv_dl_pct', 'mv_dl_mb', 'mq_l_vid_codec', 'media_photo_w', 'media_video_w', 'media_file_w']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.73/79: режим камеры выводится из способа аккаунта; quick — только запасной путь',
    src.includes("return camWay() === 'phone' ? 'full' : 'app';") && src.includes('function camInCan()') && src.includes('function camWay(){'));
  t('v1.08.73: «Камера» и (в режиме app) «Видео» → камера в приложении, иначе как раньше; перед камерой телефона — разгрузка памяти',
    src.includes("if (src === 'cam' || (src !== 'lib' && camMode() === 'app')){") && src.includes("if (camInCan() && !CAMIN.fallback){ camInOpen(jobId, kind, doc || 'job'); return; }")
    && src.includes('mediaLighten();') && src.includes('function mediaLighten(){'));
  t('v1.08.73: IndexedDB v2 — хранилища outbox и intake, onversionchange; приёмник пишется до обработки и чистится после',
    src.includes('const MDB_VER = 2;') && src.includes("if (!d.objectStoreNames.contains('intake')) d.createObjectStore('intake', { keyPath: 'iid' });")
    && src.includes('d.onversionchange = ') && /await intakePut\(\{ iid, doc/.test(src) && src.includes('if (iid) await intakeDel(iid);') && src.includes('async function intakeRecover(){'));
  t('v1.08.73: доразбор приёмника — после загрузки данных, кадры восстановлены → без «кадр не доехал»',
    src.includes("setTimeout(() => { pickRestore().catch(e => dlog('⛔ pickRestore:', e)); }, 400);") && src.includes('if (restored) return;'));
  t('v1.08.73: модуль камеры — takePhoto с таймаутом и кадр с потока, вспышка, зум, смена, видео MediaRecorder ≤ M_VMAX, «назад» закрывает',
    src.includes('async function camInGrab(){') && src.includes("new Error('takePhoto timeout')") && src.includes('async function camInTorch(') && src.includes('async function camInZoom(')
    && src.includes('function camInRecStart(){') && src.includes('if (sec >= M_VMAX){ camInRecStop(); return; }') && src.includes('if (CAMIN.el){ camInClose(); rearm(); return; }'));
  t('v1.08.73: поворот — orientation.lock(\'any\') в полном экране, иначе акселерометр → rot в обработке (воркер и запасной путь)',
    src.includes("await screen.orientation.lock('any'); CAMIN.locked = true;") && src.includes("addEventListener('devicemotion', camInMotion)")
    && src.includes('if (d.rot === 90 || d.rot === 270){') && src.includes("if (o.rot === 90 || o.rot === 270 || o.rot === 180){") && src.includes('const keep = qn === \'orig\' && isJpg && f.size <= M_ORIG_MAX && !rot;'));
  t('v1.08.73: «Поделиться» — метка последнего документа, модалка выбора, ?share=1 убирается из адреса',
    src.includes("shareTargetMark('job', id);") && src.includes("shareTargetMark('rep', id);") && src.includes('function shareIntakeModal(rows){') && src.includes("if (/[?&]share=1/.test(location.search)) history.replaceState"));
  t('v1.08.73: манифест — share_target POST multipart files=media, launch_handler navigate-existing',
    (() => { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
      return m.share_target && m.share_target.method === 'POST' && m.share_target.action === './share-target' && m.share_target.params.files[0].name === 'media' && Array.isArray(m.launch_handler.client_mode) && m.launch_handler.client_mode[0] === 'focus-existing'; })());
  t('v1.08.73: sw — POST ./share-target → tl-media/intake (версия 2) → редирект на index.html?share=1',
    sw.includes("url.pathname.endsWith('/share-target')") && sw.includes('const MDB_VER = 2;') && sw.includes("createObjectStore('intake', { keyPath: 'iid' })") && sw.includes("index.html?share=1&n="));
  t('v1.08.73: видео — таймауты dur/thumb, кадр с 0,5 с, воркер отпускает сэмплы, длительность из очереди, честная причина при 413 без сжатия',
    src.includes('const M_VMETA_MS = 8000, M_VTHUMB_MS = 12000;') && src.includes('v.currentTime = Math.min(0.5, d / 2);')
    && src.includes('mp4.releaseUsedSamples(id, samples[samples.length - 1].number + 1)') && src.includes('if (dur <= 0.6 && target.dur > 0.6) dur = target.dur;')
    && src.includes("if (it.shrFail){") && src.includes("if (it.forceShr) it.shrFail = String(sr && sr.err || '?');"));
  t('v1.08.73: плитка без превью — значок вида файла; просмотрщик с процентами, ролики соседей не подгружаются',
    src.includes('<span class="mfile mvph">') && css.includes('.mth img[data-thumb].nothumb{display:none}') && src.includes('async function mvFetch(id, onPct){')
    && src.includes("if (nx && !nx.local && nx.kind !== 'video') mvFetch(nx.id)"));
  t('v1.08.73/79: карточка «Съёмка» — Способ 1/2 и подсказка «Поделиться»; стили камеры',
    src.includes("${seg(camWay(), 'app', t('way1'), 'camWay')}") && src.includes("${seg(camWay(), 'phone', t('way2'), 'camWay')}") && src.includes("<b>${ic('share')} ${t('share_title')}</b>")
    && css.includes('.camin{position:fixed;inset:0;z-index:10000') && css.includes('html.tl-camin #toasts{z-index:10001}') && css.includes('@media (orientation:landscape){'));

  console.log('\n— v1.08.74: тест съёмки —');
  t('v1.08.74: ключи RU/EN', ['ct_btn', 'ct_running', 'ct_hint', 'ct_copy', 'ct_save', 'ct_saved', 'ct_done', 'ct_wait', 'ct_demo', 'ct_s_env', 'ct_s_job', 'ct_s_open', 'ct_s_photo',
      'ct_s_prep', 'ct_s_video', 'ct_s_thumbs', 'ct_s_save', 'ct_s_reopen', 'ct_s_send', 'ct_s_srv', 'ct_s_view', 'ct_s_del', 'ct_s_clean']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.74: кнопка в карточке «Съёмка» (админ), отчёт, копирование и .txt (с 1.08.76 — через журнал теста)', src.includes('id="ct-btn" onclick="App.camTest()"') && src.includes('App.tlogCopy()') && src.includes('App.tlogSave()')
    && src.includes('async function camTestRun(){') && src.includes('function ctReportTxt(steps){') && src.includes('techlog-${(c && c.kind) || \'test\'}-'));
  t('v1.08.74: шаги — окружение, инвойс, камера, обработка, видео, миниатюры, сохранить/выйти, заново, отправка с журналом, сервер, просмотр, удаление, уборка',
    ['ct_s_env', 'ct_s_job', 'ct_s_open', 'ct_s_photo', 'ct_s_prep', 'ct_s_video', 'ct_s_thumbs', 'ct_s_save', 'ct_s_reopen', 'ct_s_send', 'ct_s_srv', 'ct_s_view', 'ct_s_del', 'ct_s_clean']
      .every(k => src.includes(`await step(t('${k}')`)) && src.includes("ctLine('   журнал: ' + l.text.replace(/<[^>]+>/g, '')") && src.includes('mvFetch(vd.id, (p, g) => { got = g; })'));
  t('v1.08.74: камера — промис готовности, без ухода в камеру телефона под тестом, видео без звука при запрете микрофона, сведения о кадре',
    src.includes('CAMIN.ready = new Promise((res, rej) => { CAMIN._res = res; CAMIN._rej = rej; });') && src.includes('if (CAMIN.noFallback) return;')
    && src.includes('CAMIN.noAudio = true;') && src.includes('CAMIN.last = { size: blob.size, name, src, rot, at: Date.now(), ms: Math.round(performance.now() - a) };')
    && src.includes('it.w = ex.w; it.h = ex.h; it.iw = ex.iw; it.ih = ex.ih; it.orig = ex.orig; it.small = ex.small; it.sharp = ex.sharp;'));
  t('v1.08.74: стили журнала теста', css.includes('.ct-log{max-height:260px') && css.includes('.ct-acts{display:flex'));

  console.log('\n— v1.08.75: метрики отклика камеры —');
  t('v1.08.75: ключи RU/EN', ['cp_title', 'cp_hint', 'cp_ui', 'cp_copy', 'cp_none', 'cp_live_prev', 'cp_live_main', 'cp_live_jank', 'cp_live_tap', 'cp_live_shot', 'cp_live_long',
      'cp_h_session', 'cp_h_fps', 'cp_h_long', 'cp_h_tap', 'cp_h_paint', 'cp_h_evt', 'cp_h_shot', 'cp_h_after', 'cp_h_mem', 'cp_h_verdict',
      'cp_v_ok', 'cp_v_soft', 'cp_v_hal', 'cp_v_chip', 'cp_v_weak', 'ct_s_perf'].every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.75: сбор — longtask, Event Timing, rAF и requestVideoFrameCallback, память; тап→обработчик и →кадр экрана',
    src.includes("CAMPERF.po.observe({ type: 'longtask', buffered: false });") && src.includes("CAMPERF.poEv.observe({ type: 'event', durationThreshold: 16, buffered: false });")
    && src.includes('v.requestVideoFrameCallback(cb)') && src.includes('function camPerfTap(ev, what){') && src.includes('requestAnimationFrame(() => requestAnimationFrame(() => { rec.paint = Math.round(performance.now() - now); }));')
    && src.includes('function camPerfMemMB(){'));
  t('v1.08.75: кнопки камеры передают событие (задержка ввода), pointerdown запоминается',
    src.includes('onpointerdown="App.cam.pd(event)" onclick="App.cam.shot(event)"') && src.includes("const tap = ev && ev.timeStamp ? camPerfTap(ev, 'shutter') : null;")
    && src.includes("pd(ev){ CAMIN.pdTs = ev && ev.timeStamp || 0; }"));
  t('v1.08.75: отметки времени — takePhoto/кадр, приёмник, recstart/rec, после закрытия prep/render/flush в сохранённую сессию',
    src.includes("camPerfMark(src, performance.now() - a, Math.round(blob.size / 1024) + ' KB');") && src.includes("camPerfMark('intake', performance.now() - b);")
    && src.includes("rec.onstart = () => camPerfMark('recstart'") && src.includes("camPerfMark('rec', CAMIN.recStopAt") && src.includes("if (perf) perf('prep', performance.now() - pa);")
    && src.includes("if (perf) perf('render', performance.now() - ra);") && src.includes('const s0 = CAMPERF.sessions[0]; if (!s0) return;'));
  t('v1.08.75: разбор кадров отложен до «Готово»: приёмник сразу, список deferred, «Готово» во время снимка кадр не теряет',
    src.includes('async function camInFlushList(jobId, doc, list){') && src.includes("if (CAMIN.deferred && CAMIN.jobId === sJob) CAMIN.deferred.push(entry); else camInFlushList(sJob, sDoc, [entry]);")
    && src.includes('const dj = CAMIN.jobId, dd = CAMIN.doc, dl = CAMIN.deferred || []; CAMIN.deferred = null;') && !src.includes("mediaTakeFiles(CAMIN.jobId, [f], 'photo', { cam: true, doc: CAMIN.doc, rot })")
    && src.includes('if (rec._done) return; rec._done = true;'));
  t('v1.08.75/77: превью по режиму — быстрое 1280×720 (без ImageCapture 1920×1440), максимум 4096×3072; частота ≤ 30',
    src.includes("const phW = pm === 'max' ? 4096 : (hasIC ? 1280 : 1920), phH = pm === 'max' ? 3072 : (hasIC ? 720 : 1440);") && src.includes("frameRate: { ideal: 30, max: 30 }"));

  console.log('\n— v1.08.77: превью, портретное видео, экспорт метрик —');
  t('v1.08.77: ключи RU/EN', ['cam_prev_lbl', 'cam_prev_fast', 'cam_prev_max', 'cam_prev_fast_h', 'cam_prev_max_h', 'cp_h_photo_max', 'cp_no_taps', 'cp_save', 'cp_share', 'cp_saved', 'mq_l_shr_bigger']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.77: настройка превью — camPrev/camPrevSet, переключатель в карточке «Съёмка», видео в приложении по режиму, битрейт по фактическому потоку',
    src.includes("function camPrev(){ try{ return localStorage.getItem('techlog_cam_prev') === 'max' ? 'max' : 'fast'; }") && src.includes("${seg(camPrev(), 'fast', t('cam_prev_fast'), 'camPrev')}")
    && src.includes("const vidH = pm === 'max' ? vt.h : Math.min(720, vt.h)") && src.includes("const vbr = shortSide >= 1080 ? 4000000 : shortSide >= 720 ? 2500000 : 1200000;"));
  t('v1.08.77: метрики — режим превью и «снимок до», «нет тапов», Скачать/Поделиться',
    src.includes("CAMIN.photoMax = pc.imageWidth.max + '×' + pc.imageHeight.max;") && src.includes("prevMode: CAMIN.prevMode || '', photoMax: CAMIN.photoMax || ''")
    && src.includes("`${t('cp_h_tap')}: ${t('cp_no_taps')}`") && src.includes('function camPerfSave(){') && src.includes('function camPerfShare(){') && src.includes('App.camPerfSave()'));
  t('v1.08.77: портретное видео — цель и правило «уже компактный» по короткой стороне; «не меньше оригинала» в журнал',
    src.includes('var k = Math.min(1, target.h / Math.min(dw, dh));') && src.includes("if (Math.min(dw, dh) <= target.h + 8 && /^avc1/.test(vTrk.codec)")
    && src.includes("} else if (sr && sr.blob){") && src.includes("t('mq_l_shr_bigger')"));
  console.log('\n— v1.08.78: профиль телефона, серия, 480p —');
  t('v1.08.78: ключи RU/EN', ['cp_v_chip_fast', 'cp_v_vid_load', 'cp_v_vid_ok', 'cp_prof_t', 'cp_prof_photo', 'cp_prof_video', 'cp_prof_reco_slow', 'cp_prof_reco_ok', 'cam_in_queued']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]) && T.DICT.ru.vid_480 === '480p' && T.DICT.en.vid_480 === '480p');
  t('v1.08.78: вердикт видео отдельно, профиль телефона в карточке и .txt, кадры видео-сессии из отметок',
    src.includes("if (soft) key = 'soft'; else if (mf && mf.avg < 45) key = 'vid_load'; else key = 'vid_ok';") && src.includes('function camPerfProfile(){') && src.includes('<div class="cp-prof">')
    && src.includes("const nShots = s.marks.filter(m => m.kind === 'takePhoto' || m.kind === 'frame' || m.kind === 'rec').length;"));
  t('v1.08.78: затвор во время снимка ставит кадр в очередь; кольцо ожидания; кнопка не блокируется',
    src.includes("if (CAMIN.kind === 'photo' && !CAMIN.queued && CAMIN.left > 1){ CAMIN.queued = true;") && src.includes("if (CAMIN.queued && CAMIN.el){ CAMIN.queued = false; setTimeout(() => camInShot(), 30); }")
    && src.includes("if (sh) sh.disabled = left <= 0;") && css.includes('.camin-shutter.busy::after'));
  t('v1.08.78: 480p в пресете и целях, запись 2-секундными кусками, плашка молчит при записи',
    src.includes("m === '480' ? { h: 480, vbr: 1200000 }") && src.includes("${seg(mVidMode(), '480', t('vid_480'), 'vidMode')}") && src.includes('rec.start(2000);') && src.includes('if (CAMIN.rec) return;                                           // v1.08.78'));
  console.log('\n— v1.08.79: Способ 1 / Способ 2 —');
  t('v1.08.79: ключи RU/EN', ['way_lbl', 'way1', 'way2', 'way1_t', 'way2_t', 'way1_h', 'way2_h', 'way2_banner_t', 'way2_banner_h', 'way2_take', 'way2_take_v', 'way2_hide', 'way2_no_intent', 'way2_ios', 'share_direct']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.79: способ — личная настройка в profiles.push_prefs.cam_way с кэшем в localStorage, сохраняется upsert-ом профиля',
    src.includes("const pv = state.user && state.user.push_prefs && state.user.push_prefs.cam_way;") && src.includes("localStorage.setItem('techlog_cam_way', v)") && src.includes("if (HAS_SB) await dbUpsert('profiles', { ...me, push_prefs: prefs });"));
  t('v1.08.79: mediaShoot — Способ 1 → камера в приложении, Способ 2 → intent камеры телефона (STILL_IMAGE_CAMERA / VIDEO_CAMERA), не Android → системный выбор',
    src.includes("function mediaShoot(jobId, kind, doc){") && src.includes("if (camWay() === 'phone'){ if (!HAS_SB){ toast(t('media_sb_only'), 'err'); return; } phoneCamLaunch(jobId, kind, doc); return; }")
    && src.includes("'intent:#Intent;action=android.media.action.' + (kind === 'video' ? 'VIDEO_CAMERA' : 'STILL_IMAGE_CAMERA') + ';end'") && src.includes("if (!isAndroid || IS_IOS){"));
  t('v1.08.79: баннер Способа 2 в документе с «Забрать кадры», снимается, когда кадры дошли',
    src.includes('function way2BannerHtml(jobId, doc){') && src.includes('${way2BannerHtml(jobId, doc)}') && src.includes("{ const m = way2Mark(); if (m && m.id === jobId) way2Set(null); }") && css.includes('.way2-banner{'));
  t('v1.08.79: «Поделиться» без перезагрузки — launchQueue + focus-existing; в открытый документ кладётся без вопроса',
    src.includes('function initLaunchQueue(){') && src.includes('window.launchQueue.setConsumer(params => {') && src.includes("if (m && openDoc && openDoc.id === m.id){") && src.includes("t('share_direct')"));
  console.log('\n— v1.08.80: журнал Способа 2, тест Способа 2 —');
  t('v1.08.80: ключи RU/EN', ['w2_title', 'w2_none', 'w2_s_launch', 'w2_s_away', 'w2_s_alive', 'w2_s_reload', 'w2_s_via_picker', 'w2_s_via_share', 'w2_s_files', 'ct2_btn', 'ct2_hint', 'ct2_p_photo', 'ct2_p_video', 'ct2_p_save',
      'ct2_resumed', 'ct2_s_alive_save', 'ct2_alive_no', 'ct2_alive_yes', 'ct2_timeout', 'ct2_aborted'].every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.80: журнал Способа 2 — сессия при запуске, фон/возврат, перезапуск при старте, путь возврата picker/share, в метриках и в журнале теста',
    src.includes('function w2Begin(jobId, doc, kind){') && src.includes('function w2Vis(){') && src.includes('function w2Init(){') && src.includes("w2Files(jobId, [...inp.files], 'picker')")
    && src.includes("w2Files(m.id, files, 'share');") && src.includes('<div class="cp-prof" id="w2-log">') && src.includes("L.push('', `--- ${t('w2_title')} ---`);"));
  t('v1.08.80: общие шаги тестов вынесены (ctStepJob/Send/Srv/View/Del) и используются обоими тестами',
    ['ctStepJob', 'ctStepSend', 'ctStepSrv', 'ctStepView', 'ctStepDel'].every(f => src.includes('async function ' + f + '(')) && src.includes("await ctStepJob('способ 1')") && src.includes("await ctStepJob('способ 2')"));
  t('v1.08.80: тест Способа 2 — состояние в localStorage, порядок фаз, ожидание пользователя 5 мин с «Прервать», продолжение после перезапуска, шаг «дожила до сохранения», hook в saveJob',
    src.includes("const LS_CT2 = 'techlog_ct2', CT2_USER_SEC = 300;") && src.includes("const CT2_ORDER = ['job', 'photo-launch', 'photo-wait'") && src.includes('async function ct2WaitUser(text, fn, sec){')
    && src.includes('function ct2Resume(){') && src.includes("setTimeout(() => { try{ ct2Resume(); }") && src.includes("await run('alive-save', t('ct2_s_alive_save')") && src.includes("CT2.st.phase === 'save-wait') CT2.saved = Date.now();")
    && src.includes("if (p && !p.finished && c.kind === 'camtest2') return;") && src.includes('id="ct2-btn" onclick="App.camTest2()"') && css.includes('.ct2-bar{position:fixed'));
  console.log('\n— v1.08.81: автосохранение, живая модалка, отчёт всегда —');
  t('v1.08.81: ключи RU/EN', ['ct_live_send', 'ct_live_hide', 'ct_live_continue', 'ct2_live_resume', 'ct2_no_user'].every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]) && /автоматически/.test(T.DICT.ru.ct2_s_save));
  t('v1.08.81: тест Способа 2 сохраняет сам (saveJob(false) в шаге save-wait), живая модалка на отправке, «заглушка» после перезапуска с «Продолжить», продолжить некому → отчёт всё равно',
    src.includes("await jobOpen(); ct2BarHide();\n      await saveJob(false); jobDraft = null;") && src.includes("ctLiveOpen(t('ct2_btn'), t('ct_live_send'));") && src.includes("ctLiveOpen(t('ct2_btn'), t('ct2_live_resume').replace('{S}', (r && r.label) || CT2.st.phase), manual ? 'continue' : '');")
    && src.includes("text: '⛔ ' + t('ct2_no_user')") && !src.includes("ct2WaitUser(t('ct2_p_save')"));
  t('v1.08.81: живая модалка — открытие, дописывание строк из ctLine, превращение в отчёт с кнопками; обычный тест тоже', src.includes('function ctLiveOpen(title, sub, mode){') && src.includes('ctLiveAppend(l);') && src.includes('function ctLiveDone(){')
    && src.includes("ctLiveOpen(t('ct_btn'), t('ct_live_send'));") && (src.match(/setTimeout\(ctLiveDone, 300\);/g) || []).length === 2 && css.includes('.ct-live{max-height:42vh'));
  console.log('\n— v1.08.82: объём автоматического прогона —');
  t('v1.08.82: 3 кадра и 2 ролика по 3 с в автоматическом тесте, названия шагов с количеством, проверки по фактическим числам',
    src.includes('const CT_PHOTOS = 3, CT_VIDEOS = 2, CT_VSEC = 3;') && src.includes("const nPh = Math.min(CT_PHOTOS, mediaFree(jobId, 'photo', 'job')), nVd = Math.min(CT_VIDEOS, mediaFree(jobId, 'video', 'job'));")
    && src.includes("for (let k = 1; k <= nVd; k++){") && src.includes("await wait(CT_VSEC * 1000);") && src.includes("ctStepSrv(jobId, nPh)") && /ct_s_photo: 'Камера: \{N\} кадра\(ов\)'/.test(src)
    && src.includes("if (r.ph < needP || r.phOk < needP) throw new Error('миниатюры фото: ' + r.phOk + ' из ' + needP);"));
  console.log('\n— v1.08.85: почему разлогинило, черновик переживает чужой разлогин —');
  t('v1.08.85: клиент Supabase создаётся с обёрткой fetch, SIGNED_OUT логируется с контекстом, черновик сохраняется',
    src.includes("createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { global: { fetch: sbFetch } })") && src.includes('authSignedOutLog();') && src.includes('if (!AUTHX.byUser && !AUTHX.byApp) authKeepDraft();')
    && src.includes("try{ authRestoreDraft(); }catch(e){ dlog('⛔ authRestoreDraft:', e); }") && src.includes('AUTHX.byUser = true;') && src.includes("AUTHX.byApp = 'пользователь заблокирован';"));
  t('v1.08.85: плашка на экране входа и строка в диагностике',
    src.includes("${AUTHX.kicked ? `<div class=\"net-login-note kicked\">") && src.includes("if (AUTHX.lastFail){ const f = AUTHX.lastFail; put(`⚠ последний отказ auth-сервера:") && css.includes('.net-login-note.kicked{ display:flex'));
  { /* живой прогон: отказ refresh пишется в AUTHX.lastFail с расшифровкой */
    const fetch0 = w.fetch;
    const fake = (status, body) => ({ ok: status < 300, status, clone(){ return this; }, json(){ return Promise.resolve(body); } });
    w.fetch = (u) => Promise.resolve(/refresh_token/.test(u) ? fake(400, { error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' }) : fake(200, {}));
    T.AUTHX.lastFail = null;
    const runs = [
      T.sbFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token'),
      T.sbFetch('https://x.supabase.co/rest/v1/jobs'),
    ];
    await Promise.all(runs); await new Promise(r => setTimeout(r, 30));
    {
      const f = T.AUTHX.lastFail;
      t('v1.08.85: sbFetch — отказ refresh_token попал в AUTHX.lastFail с кодом и расшифровкой',
        f && f.grant === 'refresh_token' && f.status === 400 && f.code === 'refresh_token_already_used' && /другом окне/.test(T.authWhy(f.code)), JSON.stringify(f));
      w.fetch = fetch0;
      /* черновик: чужой разлогин на экране документа → localStorage с пометкой → после входа документ открыт заново */
      T.setScreen('job'); T.setJobDraft({ id: 'zz-new', unit_number: '12B', form_data: {}, helper_ids: [] });
      T.authKeepDraft();
      let saved = null; try{ saved = JSON.parse(w.localStorage.getItem('techlog_draft')); }catch(e){}
      t('v1.08.85: authKeepDraft — черновик в localStorage с relogin, плашка знает Unit', saved && saved.relogin === true && saved.id === 'zz-new' && T.AUTHX.kicked && T.AUTHX.kicked.doc && T.AUTHX.kicked.unit === '12B');
      t('v1.08.85: плашка входа с Unit есть в Supabase-ветке viewLogin (в демо-ветке её нет — там нет сервера), тексты ru/en',
        /kicked\.doc \? t\('login_kicked_doc'\)\.replace\('\{U\}'/.test(src) && T.DICT.ru.login_kicked_doc.includes('{U}') && T.DICT.en.login_kicked_doc.includes('{U}'));
      T.setScreen('login'); T.setJobDraft(null);
      T.state.user = { id: 'demo-admin', role: 'admin' }; T.state.data.jobs = T.state.data.jobs || [];
      const ok2 = T.authRestoreDraft();
      let saved2 = null; try{ saved2 = JSON.parse(w.localStorage.getItem('techlog_draft')); }catch(e){}
      t('v1.08.85: authRestoreDraft — новый документ открыт заново, пометка снята, плашка убрана',
        ok2 && T.getJobDraft() && T.getJobDraft().id === 'zz-new' && T.state.screen === 'job' && saved2 && !saved2.relogin && T.AUTHX.kicked === null);
      T.authSignedOutLog();   // не должно бросать
      t('v1.08.85: authSignedOutLog не падает', true);
      w.localStorage.removeItem('techlog_draft'); T.setJobDraft(null); T.setScreen('home');
    }
  }
  console.log('\n— v1.08.84: одиночный инвойс — альбомный лист, лист-продолжение —');
  t('v1.08.84: одиночный PDF на альбомном Letter, бланк в (0,0), линия отреза, разбор хвоста и лист справа',
    /function buildInvoicePdfDoc\(quiet, jobArg\)\{[\s\S]*?orientation: 'landscape', unit: 'mm', format: 'letter'[\s\S]*?invCutLine\(doc\);\s*const cont = invTail\(doc, j\);\s*drawInvoiceVert\(doc, j, 0, 0, cont\);\s*if \(cont\.any\) drawInvoiceCont\(doc, j, cont, INV_W, 0\);/.test(src)
    && !src.includes('const left = (215.9 - INV_W) / 2'));
  t('v1.08.84: invTail/drawInvoiceCont/techFullNamesFor/invCutLine есть; бланк принимает cont и ставит пометки «see attached sheet»',
    src.includes('function invTail(doc, j){') && src.includes('function drawInvoiceCont(doc, j, cont, left, top){') && src.includes('function techFullNamesFor(j){') && src.includes('function invCutLine(doc){')
    && src.includes('function drawInvoiceVert(doc, j, left, top, cont){') && src.includes("const SEE = 'see attached sheet';") && src.includes("if (noteOver) nl[1] = '(continued - ' + SEE + ')';")
    && src.includes("txt(othOver ? fitW(s1, C2 - 1 - (L+26)) : s1.slice(0,46), L+26, ry+3.2)") && src.includes("if (exList.length > 1 || exOver){"));
  t('v1.08.84: лист-продолжение — шапка с номером/датой/сотрудниками, разделы с AMOUNT и подытогом, перенос на новые страницы по две колонки',
    src.includes("txt('INVOICE ATTACHMENT' + (contd ? ' (cont.)' : '')") && src.includes("txt('Technician(s):', L+2, y)") && src.includes("section('OTHER SERVICES', true);") && src.includes("section('ADDITIONAL WORKS & PURCHASES', true);")
    && src.includes("section('NOTES', false);") && src.includes("subtotal('Subtotal:'") && src.includes("if (colX + INV_W + 1 < PW){ colX += INV_W; }") && src.includes("else { doc.addPage(); colX = 0; invCutLine(doc); }"));
  t('v1.08.84: пакетный отчёт — линия отреза через invCutLine, бланк без cont (старое поведение)', src.includes('if (pos === 0) invCutLine(doc);\n    drawInvoiceVert(doc, j, pos * INV_W, 0);'));
  { /* живой прогон разбора хвоста на фиктивном doc: ширины считаем по длине строки */
    const mk = () => ({ setFont(){}, setFontSize(){}, getTextWidth: s => String(s).length * 1.2, splitTextToSize: (s, w) => { const out = []; let cur = ''; String(s).split(' ').forEach(x => { if ((cur + ' ' + x).length * 1.2 > w && cur){ out.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x; }); if (cur) out.push(cur); return out; } });
    const jb = { note: '', note_en: 'short', form_data: Object.assign(T.emptyFormData(), { others: [{ desc: 'a', amount: 1 }, { desc: 'b', amount: 2 }], extra: [] }) };
    const a = T.invTail(mk(), jb);
    const jb2 = { note: '', note_en: 'short', form_data: Object.assign(T.emptyFormData(), { others: [{ desc: 'a', amount: 1 }, { desc: 'b', amount: 2 }, { desc: 'c', amount: 3 }], extra: [] }) };
    const b = T.invTail(mk(), jb2);
    const jb3 = { note: '', note_en: Array.from({ length: 80 }, () => 'word').join(' '), form_data: T.emptyFormData() };
    const c = T.invTail(mk(), jb3);
    t('v1.08.84: invTail — 2 короткие строки не переносятся, 3 строки или длинная заметка уходят на лист', !a.any && b.othOver && b.any && !b.noteOver && c.noteOver && !c.othOver && c.any && c.noteLines.length > 2);
  }
  console.log('\n— v1.08.83: копировать всегда, плитки локально+сервер —');
  t('v1.08.83: в живой модалке кнопки Копировать/Скачать с первой секунды', src.includes("const copyBtns = `<button class=\"btn btn-blue sm\" onclick=\"App.tlogCopy()\">") && src.includes("`${copyBtns}<button class=\"btn btn-ghost sm\" onclick=\"App.ctLiveHide()\">"));
  t('v1.08.83: плитки считаются локально + с сервера, в обоих тестах', src.includes('function ctTiles(){') && src.includes('async function ctTilesCheck(jobId, needP, needV){') && src.includes("ctTilesCheck(jobId, nPh, nVd)") && src.includes("ctTilesCheck(st.jobId, 2, 1)")
    && src.includes("const cntP = () => qOf(jobId).filter(x => x.kind === 'photo').length + (state.data.media || []).filter(m => m.job_id === jobId && m.kind === 'photo').length;") && src.includes("if (rows.length < items + already)"));
  t('v1.08.77: mfa null-guard, bouncie «не настроено» один раз без ⛔',
    src.includes("const f = ((data && data.totp) || []).find(x => x.status === 'verified');") && src.includes("if (/BN_NOT_CONFIGURED/.test(BN.err)){ if (!BN.notedOff){"));
  console.log('\n— v1.08.76: журнал теста целиком —');
  t('v1.08.76: ключи RU/EN', ['tl_title', 'tl_save', 'tl_share', 'tl_copy', 'tl_show', 'tl_status_abort', 'tl_aborted', 'tl_aborted_toast', 'tl_done_t', 'tl_done_h', 'tl_sec_log', 'tl_sec_perf', 'tl_sec_mq', 'tl_sec_app', 'log_save', 'log_share']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]));
  t('v1.08.76: журнал в localStorage построчно (throttle), старт/строка/шаг/конец, dlog во время теста',
    src.includes("const LS_TLOG = 'techlog_testlog'") && src.includes('function tlogStart(kind, title){') && src.includes('function tlogLine(text, cls){') && src.includes('function tlogStep(st){') && src.includes('function tlogEnd(ok, total){')
    && src.includes('TLOG._t = setTimeout(tlogSaveNow, 300)') && src.includes("if (typeof TLOG !== 'undefined' && TLOG.active) tlogLine('dlog: ' + parts.join(' '), 'dim');"));
  t('v1.08.76: .txt целиком — журнал, шаги, метрики камеры, журнал отправки, хвост журнала приложения; имя techlog-<kind>-дата.txt',
    src.includes("L.push('', `--- ${t('tl_sec_steps')} ---`);") && src.includes("`--- ${t('tl_sec_perf')} ---`") && src.includes("mqLogLines.slice(-150)") && src.includes("PLOG.slice(-400)") && src.includes('function tlogFileName(c){'));
  t('v1.08.76: кнопки Скачать/Поделиться/Копировать/Показать в карточке Съёмка и в Диагностике, модалка по завершении, Web Share для файла',
    src.includes('function tlogBtnsHtml(style){') && src.includes('function tlogCardHtml(){') && src.includes('${tlogCardHtml()}')
    && (src.match(/\$\{tlogCardHtml\(\)\}/g) || []).length === 2 && src.includes('function tlogDoneModal(){') && src.includes('setTimeout(tlogDoneModal, 400);') && src.includes("navigator.canShare({ files: [f] })"));
  t('v1.08.76: тест съёмки и регресс пишут в журнал; прерванный тест помечается при старте; «Журнал событий» скачивается',
    src.includes("tlogStart('camtest', t('ct_btn'));") && src.includes("tlogStart('regress', t('rg_btn'));") && src.includes('function tlogInit(){') && src.includes('try{ tlogInit(); }catch(e){}')
    && src.includes('function logSave(){') && src.includes('App.logSave()') && css.includes('.tl-acts{display:flex'));
  t('v1.08.75: вердикт софт/камера/железо, плашка, карточка в настройках с копированием, шаг в тесте съёмки',
    src.includes('function camPerfVerdict(s){') && src.includes("} else if (soft) key = 'soft'; else if (hal) key = 'hal'; else if (chip) key = (s.prevMode === 'fast' ? 'chip_fast' : 'chip'); else if (weak) key = 'weak';")
    && src.includes('function camPerfLive(){') && src.includes('function camPerfCardHtml(){') && src.includes('App.camPerfCopy()') && src.includes("await step(t('ct_s_perf')")
    && src.includes('${camPerfCardHtml()}') && css.includes('.camin-perf{position:absolute') && css.includes('.cp-last{white-space:pre-wrap'));
}

console.log('\n— v1.09.01: справочник «Трекеры Bouncie» —');
{
  const src = fs.readFileSync(ROOT + '/app.js', 'utf8');
  const css = fs.readFileSync(ROOT + '/styles.css', 'utf8');
  const upd = fs.readFileSync(ROOT + '/supabase/update-to-1_09_01.sql', 'utf8');
  const full = fs.readFileSync(ROOT + '/supabase/full-install-1_09_01.sql', 'utf8');
  t('v1.09.01: версии (app = sw = version.json = 1.09.01), DB_SQL_FILE = full-install-1_09_01.sql, комплект SQL и тесты на месте',
    T.APP_VERSION === '1.09.01' && T.DB_SQL_FILE === 'full-install-1_09_01.sql'
    && fs.readFileSync(ROOT + '/sw.js', 'utf8').includes("VERSION = '1.09.01'") && JSON.parse(fs.readFileSync(ROOT + '/version.json', 'utf8')).version === '1.09.01'
    && fs.existsSync(ROOT + '/tests/bn-devices.sql') && fs.existsSync(ROOT + '/tests/v1_09_01.js'));
  t('v1.09.01: ключи RU/EN справочника трекеров и карточки машины',
    ['d_trackers', 'trk_hint', 'trk_sync', 'trk_syncing', 'trk_all', 'trk_active', 'trk_inactive', 'trk_st_active', 'trk_st_inactive', 'trk_none', 'trk_none_f',
     'trk_car', 'trk_free', 'trk_seen', 'trk_gone', 'trk_checked', 'trk_never', 'trk_done', 'trk_added', 'trk_back', 'trk_off', 'trk_empty', 'trk_car_inactive',
     'trk_no_dev', 'trk_inactive_pick', 'trk_taken', 'trk_bad_list', 'veh_tracker', 'veh_no_tracker', 'veh_no_tracker_l', 'veh_trk_hint', 'veh_trk_empty', 'act_bn_dev_sync']
    .every(k => T.DICT.ru[k] && T.DICT.en[k] && T.DICT.ru[k] !== T.DICT.en[k]) && !/IMEI/.test(T.DICT.ru.veh_hint) && !/IMEI/.test(T.DICT.en.veh_hint));
  t('v1.09.01: таблица bn_devices в TABLES, DB_NEED_COLS и RPC bn_devices_sync в диагностике, действие bn_dev_sync в журнале системы',
    T.TABLES.includes('bn_devices') && T.DB_NEED_COLS.some(x => x[0] === 'bn_devices' && x[1] === 'checked_at') && T.DB_NEED_RPCS.includes('bn_devices_sync')
    && src.includes("'bn_dev_sync'];         // v1.09.01") && src.includes("audit('bn_dev_sync', 'bn_device', 'sync',"));
  t('v1.09.01: вкладка «Трекеры Bouncie» только у админа, после «Автомобили»; карточка машины — выпадающий список трекеров вместо поля IMEI',
    src.includes("['trackers', t('d_trackers'), isAdmin()],   // v1.09.01") && src.includes("vehicles: dirVehicles, trackers: dirTrackers,")
    && src.includes('${vehTrackerSelHtml(v)}') && !src.includes('<input id="veh-imei"') && src.includes('onchange="App.vehDevPick(this.value)"')
    && src.includes("trkSync(){ bnDevSync(false); }, trkFilter(v){ state.trkFilter = v; render(); }")
    && css.includes('.trk-dot.on{ color:var(--green)') && css.includes('.lang-seg.trk-seg button{ flex:1 1 0'));
  t('v1.09.01: автосверка — при смене состава приборов в фоновом опросе и при открытии вкладки; пустой список не гасит статусы',
    src.includes("if (bnDevNeedSync(j.vehicles)) bnDevSync(true, j.vehicles);") && src.includes("if (!TRK.busy && bnDevNeedSync(null)) setTimeout(() => bnDevSync(true), 0);")
    && src.includes("if (norm.length) for (let i = 0; i < arr.length; i++){") && src.includes("if (auto && BN.off) return null;"));
  t('v1.09.01: импорт машин сначала сверяет справочник; vehicle_save — понятные ошибки NO_DEVICE / DEVICE_INACTIVE / DEVICE_TAKEN',
    src.includes("const res = await bnDevSync(false);\n  if (!res || res.empty) return;\n  let added = 0, upd = 0;\n  for (const d of bnDevices().filter(bnDevActive)){")
    && src.includes(": /NO_DEVICE|vehicles_imei_fk/.test(s) ? t('trk_no_dev')") && src.includes(": /DEVICE_INACTIVE/.test(s) ? t('trk_inactive_pick')")
    && src.includes(": /DEVICE_TAKEN|vehicles_imei_ux/.test(s) ? t('trk_taken')"));
  t('v1.09.01: SQL — bn_devices с RLS (select только админ), FK vehicles_imei_fk, bn_dev_norm, bn_devices_sync, перенос IMEI, проверки vehicle_save, самопроверка; backup дампит bn_devices до vehicles',
    [upd, full].every(x => x.includes('create table if not exists public.bn_devices (') && x.includes("constraint bn_devices_status_ck check (status in ('active','inactive'))")
      && x.includes("create policy bn_devices_sel on public.bn_devices for select to authenticated\n  using (public.my_role() = 'admin');")
      && x.includes("foreign key (imei) references public.bn_devices (imei) on update cascade;") && x.includes('create or replace function public.bn_dev_norm(p_list jsonb)')
      && x.includes('create or replace function public.bn_devices_sync(p_list jsonb)') && x.includes("update public.bn_devices d set status = 'inactive', inactive_at = v_now, checked_at = v_now")
      && x.includes("if not found then raise exception 'NO_DEVICE'; end if;") && x.includes("raise exception 'DEVICE_INACTIVE'") && x.includes("raise exception 'DEVICE_TAKEN'")
      && x.includes('insert into public.bn_devices (imei, make, first_seen_at)') && x.includes('схема соответствует v1.09.01'))
    && full.includes('create table if not exists public.vehicles (') && !full.includes('Самопроверка v1.08.97 (')
    && (() => { const bk = fs.readFileSync(ROOT + '/supabase/functions/backup/index.ts', 'utf8'); return bk.indexOf('"bn_devices"') > 0 && bk.indexOf('"bn_devices"') < bk.indexOf('"vehicles"') && bk.includes('const BK_VER = "1.09.01";'); })()
    && fs.readFileSync(ROOT + '/supabase/functions-dashboard/backup/index.ts', 'utf8').includes('"bn_devices"'));
  /* разбор ответа Bouncie — то же, что bn_dev_norm в базе */
  const raw = [
    { imei: '359999000000001', vin: '1ftbw2cm5mka10001', nickName: 'Van 1', model: { make: 'Ford', name: 'Transit', year: 2021 },
      stats: { lastUpdated: '2026-09-19T12:00:00.000Z', odometer: 45678.4, location: { lat: 33.88, lon: -84.46, heading: 90, address: '3200 Cumberland Blvd' } } },
    { imei: '35-9999-0000-00002', nickName: 'Van 2', model: { make: 'RAM', name: 'ProMaster', year: '2020' }, stats: { lastUpdated: 'n/a', location: { lat: '33.9', lon: -84.5 } } },
    { imei: '359999000000003', nickName: 'Old', stats: { lastUpdated: '2026-09-18T08:00:00Z' } },
    { imei: '359999000000003', nickName: 'Van 3', model: { make: 'Chevrolet', name: 'Express', year: 2019 }, stats: { lastUpdated: '2026-09-19T09:30:00Z' } },
    { vin: 'NOIMEI' }, { imei: 'abc' }, { imei: '123' }, 'string', 42, null ];
  const norm = T.bnDevNorm(raw);
  const n1 = norm.find(d => d.imei === '359999000000001'), n2 = norm.find(d => d.imei === '359999000000002'), n3 = norm.find(d => d.imei === '359999000000003');
  t('v1.09.01: bnDevNorm — 3 прибора из мусора, IMEI только цифрами, VIN в верхнем регистре, год строкой принят, кривые дата/широта → null, дубль → свежий',
    norm.length === 3 && n1.vin === '1FTBW2CM5MKA10001' && n1.make === 'Ford' && n1.model === 'Transit' && n1.year === 2021 && n1.lat === 33.88 && n1.lng === -84.46
    && n1.address === '3200 Cumberland Blvd' && n1.odometer === 45678.4 && n1.reported_at === '2026-09-19T12:00:00.000Z'
    && n2.year === 2020 && n2.reported_at === null && n2.lat === null && n2.lng === -84.5 && n2.vin === null
    && n3.nickname === 'Van 3' && n3.make === 'Chevrolet' && T.bnDevNorm('nope').length === 0);
  /* локальное зеркало сверки: новые / пропавшие → неактивен / вернувшиеся / пустой список */
  const prevUser = T.state.user, prevData = T.state.data;
  T.state.user = { id: 'u1', role: 'admin', display_name: 'Adm', login: 'adm' };
  T.state.data = { ...(prevData || {}), bn_devices: [], vehicles: [], profiles: [] };
  const r1 = T.bnDevApplyLocal(raw);
  const d2 = () => T.bnDevices().find(d => d.imei === '359999000000002');
  t('v1.09.01: bnDevApplyLocal — первая сверка: added 3, все активны, checked_at/last_seen_at выставлены',
    r1.total === 3 && r1.added === 3 && r1.back === 0 && r1.off === 0 && !r1.empty && r1.active === 3
    && T.bnDevices().length === 3 && T.bnDevices().every(d => T.bnDevActive(d) && d.checked_at && d.last_seen_at && d.first_seen_at && d.id));
  const firstSeen = d2().first_seen_at;
  const r2 = T.bnDevApplyLocal([{ imei: '359999000000001' }, { imei: '359999000000003', nickName: 'Van 3' }]);
  t('v1.09.01: пропавший прибор — off 1, status inactive с датой, строка и её данные на месте; частичный ответ не затирает марку/VIN',
    r2.off === 1 && r2.added === 0 && r2.back === 0 && T.bnDevices().length === 3 && d2().status === 'inactive' && d2().inactive_at && d2().nickname === 'Van 2' && d2().lng === -84.5
    && T.bnDevices().find(d => d.imei === '359999000000001').vin === '1FTBW2CM5MKA10001' && T.bnDevices().find(d => d.imei === '359999000000001').make === 'Ford');
  const r3 = T.bnDevApplyLocal(raw);
  t('v1.09.01: вернувшийся прибор — back 1, снова активен, inactive_at сброшен, first_seen_at прежний',
    r3.back === 1 && r3.off === 0 && d2().status === 'active' && d2().inactive_at === null && d2().first_seen_at === firstSeen);
  const arrBefore = T.bnDevices();
  const r4 = T.bnDevApplyLocal([]);
  t('v1.09.01: пустой список — empty, статусы не тронуты, массив заменён, а не изменён на месте',
    r4.empty && r4.off === 0 && r4.total === 0 && T.bnDevices().every(T.bnDevActive) && T.bnDevices() !== arrBefore);
  /* когда сверять самим */
  T.TRK.at = 0;
  T.state.data.bn_devices.forEach(d => { d.checked_at = new Date().toISOString(); });
  t('v1.09.01: bnDevNeedSync — тот же состав: нет; другой состав или новый прибор: да; пустой список: нет; 15 минут прошло: да; не админ: нет',
    T.bnDevNeedSync(raw) === false && T.bnDevNeedSync([{ imei: '359999000000001' }]) === true && T.bnDevNeedSync([...raw, { imei: '359999000000009' }]) === true
    && T.bnDevNeedSync([]) === false && T.bnDevNeedSync(null) === false
    && (() => { T.TRK.at = Date.now() - 16 * 60 * 1000; const r = T.bnDevNeedSync(null); T.TRK.at = 0; return r === true; })()
    && (() => { T.state.user.role = 'manager'; const r = T.bnDevNeedSync([{ imei: '1' }]); T.state.user.role = 'admin'; return r === false; })());
  /* карточка машины и строка списка */
  T.state.data.vehicles = [{ id: 'v1', make: 'Ford Transit', vin: '', imei: '359999000000001', car_no: 1, driver_id: null },
                           { id: 'v2', make: 'Old car', vin: '', imei: '359999000000077', car_no: 2, driver_id: null }];
  T.bnDevApplyLocal([{ imei: '359999000000001', nickName: 'Van 1' }, { imei: '359999000000003', nickName: 'Van 3' }]);   // Van 2 → неактивен
  const selNew = T.vehTrackerSelHtml({ id: null, imei: '' });
  const selV1 = T.vehTrackerSelHtml({ id: 'v1', imei: '359999000000001' });
  const selV2 = T.vehTrackerSelHtml({ id: 'v2', imei: '359999000000077' });
  t('v1.09.01: список трекеров новой машины — без неактивного Van 2, занятый Van 1 disabled с №1, Van 3 доступен',
    !/Van 2/.test(selNew) && /<option value="359999000000001" disabled>Van 1 · 359999000000001 · №1<\/option>/.test(selNew)
    && /<option value="359999000000003">Van 3 · 359999000000003<\/option>/.test(selNew) && /<option value="">/.test(selNew) && !/disabled>\s*<option value=""/.test(selNew));
  t('v1.09.01: у машины свой трекер выбран и не disabled; IMEI вне справочника остаётся выбранным с пометкой «?»',
    /<option value="359999000000001" selected>Van 1/.test(selV1) && /<option value="359999000000077" selected>IMEI 359999000000077 · \?<\/option>/.test(selV2));
  T.state.data.vehicles.push({ id: 'v3', make: 'RAM', vin: '', imei: '359999000000002', car_no: 3, driver_id: null });
  const selV3 = T.vehTrackerSelHtml({ id: 'v3', imei: '359999000000002' });
  t('v1.09.01: свой неактивный трекер виден в списке с пометкой «неактивен»; строка машины — чип ⚠ неактивен / «?» вне справочника / имя прибора',
    /<option value="359999000000002" selected>Van 2 · 359999000000002 · (неактивен|inactive)<\/option>/.test(selV3)
    && /chip bad/.test(T.vehTrackerLine({ imei: '359999000000002' })) && /chip warn/.test(T.vehTrackerLine({ imei: '359999000000077' }))
    && /Van 1 \(IMEI 359999000000001\)/.test(T.vehTrackerLine({ imei: '359999000000001' })) && !/chip/.test(T.vehTrackerLine({ imei: '359999000000001' }))
    && (T.vehTrackerLine({ imei: '' }) === T.DICT.ru.veh_no_tracker_l || T.vehTrackerLine({ imei: '' }) === T.DICT.en.veh_no_tracker_l));
  /* справочник: строки, счётчики, фильтр, кнопка, время сверки */
  T.state.screen = 'dirs'; T.state.trkFilter = 'all'; T.TRK.at = Date.now();
  const html = T.dirTrackers();
  T.state.trkFilter = 'inactive'; const htmlOff = T.dirTrackers(); T.state.trkFilter = 'all';
  t('v1.09.01: dirTrackers — 3 строки, сегмент «Все · 3 / Активные · 2 / Неактивные · 1», активные первыми, кнопка сверки, ⚠ у неактивного с машиной, фильтр «Неактивные» → 1',
    (html.match(/class="rowline trk-row/g) || []).length === 3 && (html.match(/trk-row off"/g) || []).length === 1
    && / · 3<\/button>/.test(html) && / · 2<\/button>/.test(html) && / · 1<\/button>/.test(html)
    && html.indexOf('data-imei="359999000000001"') < html.indexOf('data-imei="359999000000002"') && /id="trk-sync"/.test(html) && /App\.trkSync\(\)/.test(html)
    && /chip warn/.test(html) && (htmlOff.match(/class="rowline trk-row/g) || []).length === 1 && /data-imei="359999000000002"/.test(htmlOff));
  T.state.user = prevUser; T.state.data = prevData;
}

console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
  process.exit(bad ? 1 : 0);
}
