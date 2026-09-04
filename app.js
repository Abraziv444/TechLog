/* =====================================================================
   TechLog v1.01.01 — учёт работ и пикапов оборудования
   Duolingo-style PWA · Vanilla JS · Supabase (или демо-режим localStorage)
   ===================================================================== */
'use strict';

const APP_VERSION = '1.07.03';
const CFG = (window.TECHLOG_CONFIG || {});
const HAS_SB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
/* ---------- Журнал диагностики: всё в консоль + кольцевой буфер ---------- */
const DIAG = [];
function errStr(e){
  if (!e) return 'null';
  if (typeof e === 'string') return e;
  const code = e.code || e.status || '';
  const msg = e.message || e.msg || e.error_description || e.hint || '';
  const det = e.details || '';
  const hint = e.hint || '';
  return [code, msg, det, hint].filter(Boolean).join(' · ') || (()=>{ try{ return JSON.stringify(e); }catch(_){ return String(e); } })();
}
function dlog(){
  const ts = new Date().toISOString().slice(0,19).replace('T',' ');
  const head = `[TechLog ${APP_VERSION} ${ts}]`;
  const parts = [...arguments].map(a => typeof a === 'string' ? a : errStr(a));
  console.log(head, ...arguments);
  const line = head + ' ' + parts.join(' ');
  DIAG.push(line);
  if (DIAG.length > 300) DIAG.shift();
  try {
    PLOG.push(line);
    if (PLOG.length > 250) PLOG.splice(0, PLOG.length - 250);
    clearTimeout(dlog._t);
    dlog._t = setTimeout(() => { try{ localStorage.setItem('techlog_log', JSON.stringify(PLOG)); }catch(e){} }, 400);
  } catch(e){}
}
let SYNC_ERRORS = [];   // ошибки таблиц последней синхронизации
let WRITE_ERRORS = [];  // последние ошибки записи (upsert/delete), кольцо 20
function noteWriteError(op, table, id, e){
  WRITE_ERRORS.push({ at: new Date().toISOString().slice(11,19), op, table, id: String(id||'').slice(0,8), err: errStr(e) });
  if (WRITE_ERRORS.length > 20) WRITE_ERRORS.shift();
}
let PLOG = [];
try { PLOG = JSON.parse(localStorage.getItem('techlog_log') || '[]') || []; } catch(e){ PLOG = []; }
window.addEventListener('error', e => dlog('⛔ window.error:', e.message, '@', (e.filename||'').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => dlog('⛔ unhandledrejection:', e.reason));

const LS_KEY = 'techlog_state_v1';
const LS_SESSION = 'techlog_session_v1';

/* ---------------- i18n ---------------- */
const I18N = {
  ru: {
    app_sub: 'учёт работ · версия',
    today: 'Сегодня', pickups_today: 'Мои пикапы', jobs: 'Работы', pickup: 'Пикап',
    add_task: 'Добавить задание', no_items: 'На этот день пусто', tap_add: 'Нажмите «Добавить задание»',
    date: 'Дата', counterparty: 'Контрагент', complex: 'Апарт-комплекс', unit: 'Юнит №',
    work_type: 'Вид работы', create: 'Создать', cancel: 'Отмена', save: 'Сохранить',
    delete: 'Удалить', edit: 'Изменить', close: 'Закрыть', back: 'Назад', add: 'Добавить',
    tab_home: 'Главная', tab_report: 'Отчёт', tab_dirs: 'Справочники', tab_settings: 'Настройки', tab_faq: 'FAQ', tab_stats: 'Статистика',
    mine: 'Мои', all: 'Все',
    status_draft: 'Черновик', status_done: 'Выполнено', status_approved: 'Апрув',
    job_done_chk: 'Работа выполнена',
    vacant: 'Vacant (пусто)', occupied: 'Occupied (заселён)',
    equipment: 'Оборудование (аренда, пикап через N дней)',
    aux_needed: 'Возьмите с собой',
    other_services: 'Другие услуги (свободный текст)',
    desc: 'Описание', amount: 'Сумма',
    total: 'Итого', approved_total: 'Итог (утв.)',
    approve: 'Поставить апрув', approved_by: 'Апрув', approve_reset_note: 'Изменение стоимости после апрува снимет статус',
    pdf: 'Скачать PDF инвойс', due: 'вывоз', overdue: 'просрочен',
    pick_up: 'Забрать', picked: 'Забрано', pickup_confirm: 'Отметить оборудование как вывезенное?',
    banner_pickups: 'Пикап сегодня', banner_overdue: 'просрочено',
    report_title: 'Отчёт по пикапам', report_date: 'На дату', copy_report: 'Скопировать отчёт',
    copied: 'Скопировано', nothing_due: 'Пикапов на эту дату нет', incl_overdue: 'включая просроченные',
    dirs: 'Справочники',
    d_counterparties: 'Контрагенты', d_complexes: 'Комплексы', d_worktypes: 'Виды работ',
    d_equipment: 'Оборудование', d_aux: 'Доп. оборудование', d_price: 'PRICE',
    std_price: 'Стандартная цена', custom_price: 'Индивидуальная цена', price_list: 'Прейскурант',
    name: 'Название', abbr: 'Сокращение', color: 'Цвет', address: 'Адрес', access_code: 'Код доступа',
    day_price: 'Цена $/сутки', needs_aux: 'Нужно доп. оборудование',
    complexes_of: 'Комплексы контрагента', info: 'Инфо', prices: 'Цены',
    settings: 'Настройки', profile: 'Профиль', doc_name: 'Имя в документах и работах',
    language: 'Язык интерфейса', sync: 'Синхронизировать', synced: 'Синхронизировано',
    never: 'ещё не было', org: 'Организация (для PDF)', org_name: 'Название компании (в тексте условий)',
    org_short: 'Короткое имя (APC)', org_assoc: 'Ассоциация (шапка)', org_addr: 'Адрес (шапка, по строке)',
    logout: 'Выйти', version: 'Версия приложения', updated_to: 'Приложение обновлено до версии',
    update_after_form: 'Есть обновление — применю после закрытия формы',
    upd_check: 'Проверить обновления', upd_latest: 'Версия актуальна',
    upd_found: 'Доступно обновление', upd_last: 'проверено',
    login_title: 'Вход в TechLog', demo_note: 'Демо-режим: Supabase не настроен (config.js). Данные хранятся локально.',
    email: 'Email', password: 'Пароль', sign_in: 'Войти', sign_up: 'Регистрация',
    display_name: 'Имя (для документов)', have_acc: 'Уже есть аккаунт? Войти', no_acc: 'Нет аккаунта? Регистрация',
    role_admin: 'Админ', role_manager: 'Менеджер', role_tech: 'Сотрудник',
    saved: 'Сохранено', deleted: 'Удалено', created: 'Создано',
    confirm_del: 'Удалить безвозвратно?',
    days: 'дн.', qty: 'Кол-во', for_days: 'Дней',
    tech: 'Техник', no_access: 'Нет доступа', stats_jobs: 'работ', stats_pk: 'пикапов',
    stats_due: 'на вывоз', stats_over: 'просрочено',
    sync_err: 'Ошибка синхронизации', offline_note: 'Оффлайн: показаны сохранённые данные',
    not_selected: 'Не выбрано', aux_take_hint: 'нажмите то, что нужно взять',
    select: '— выбрать —', install_hint: 'Меню браузера → «Установить приложение» / «Добавить на главный экран»',
    tab_map: 'Карта', tab_reports: 'Отчёты',
    map_title: 'Карта апарт-комплексов', all_counterparties: 'Все контрагенты',
    map_day_mode: 'Показать день на карте', map_day_hint: 'Работы и пикапы за выбранную дату',
    map_no_coords: 'без координат — откройте комплекс и нажмите «Найти по адресу»',
    route_gmaps: 'Маршрут дня в Google Maps', open_gmaps: 'Открыть в Google Maps',
    geocode: 'Найти по адресу', geocode_ok: 'Координаты найдены', geocode_fail: 'Адрес не найден — введите координаты вручную',
    lat: 'Широта (lat)', lng: 'Долгота (lng)',
    note: 'Заметка', note_hint: 'Текст попадёт в PDF-инвойс (строка NOTES)',
    dictate: 'Надиктовать', listening: 'Слушаю… нажмите ещё раз, чтобы остановить',
    dict_unsupported: 'Голосовой ввод не поддерживается этим браузером (нужен Chrome)',
    dict_lang: 'Язык диктовки',
    reports_pdf: 'Инвойсы (PDF)', rep_pickups: 'Пикапы',
    rep_range: 'Период', from: 'с', to: 'по',
    rep_yesterday: 'Вчера', rep_7: '7 дней', rep_30: '30 дней',
    rep_status_all: 'Все', rep_only_done: 'Выполн.+Апрув', rep_only_approved: 'Только апрув',
    rep_found: 'Найдено инвойсов', rep_sum: 'на сумму',
    rep_download: 'Скачать единый PDF', rep_none: 'Работ за период нет',
    rep_half_hint: '2 инвойса на страницу Letter (по половине)',
    d_staff: 'Сотрудники', role: 'Роль', visibility: 'Видимость для менеджера',
    vis_hint: 'Отмеченные сотрудники видны этому менеджеру', vis_btn: 'Видимость',
    confirm_email: 'Подтвердите email по ссылке из письма, затем войдите',
    auth_loading: 'Проверяю авторизацию…',
    no_coords_yet: 'Нет координат',
    req_missing: 'Не заполнено', issue_complex: 'апарт-комплекс', issue_unit: 'номер юнита', issue_tech: 'сотрудник',
    crew: 'Кто выполнял', add_helper: '＋ добавить сотрудника', all_staff: 'Все',
    login: 'Логин', login_hint: 'Латиница/цифры, 3–32 символа. Вход по логину и паролю.',
    invite_code: 'Код приглашения', invite_bad: 'Неверный код приглашения',
    login_taken_or_err: 'Логин занят или ошибка регистрации',
    back_today: 'Сегодня', navigate: 'Маршрут', copied_code: 'Код скопирован',
    draft_restored: 'Черновик восстановлен (несохранённые изменения)',
    pdf_blocked: 'PDF недоступен — заполните', batch_skipped: 'пропущено (не заполнены поля)',
    diag: 'Диагностика', diag_copy: 'Скопировать отчёт', diag_running: 'Проверяю…',
    srv_not_ready: 'Сервер не настроен: выполните supabase/schema.sql (нет функции check_invite)',
    invite_check_err: 'Ошибка проверки кода', srv_rejected: 'Сервер отклонил регистрацию — детали в Диагностике',
    login_taken: 'Такой логин уже существует', login_free: 'логин свободен', login_checking: 'проверяю логин…',
    srv500: 'Сервер отклонил регистрацию (500). Точная причина — в Supabase → Logs → Postgres; отчёт скопируйте в Диагностике',
    run_new_schema: 'выполните новую supabase/schema.sql',
    install_app: 'Установить приложение', installed_ok: 'Приложение установлено',
    already_installed: 'Открыто как установленное приложение',
    install_declined: 'Установка отменена',
    install_where_win: 'После установки ищите TechLog в меню «Пуск» (Windows) или на рабочем столе; список приложений Chrome: chrome://apps',
    install_no_prompt: 'Браузер пока не предложил установку — проверьте раздел PWA в Диагностике',
    reg_ok: 'Регистрация успешна', welcome: 'Добро пожаловать',
    reg_now_signin: 'Аккаунт создан — теперь войдите',
    quick_title: 'Быстрые настройки', font_soon: 'Настройка шрифта — скоро',
    all_settings: 'Все настройки',
    footer_rights: '© Никакие права не защищены', footer_city: 'Альфаретта',
    faq: 'Как это работает (FAQ)',
    map_mode_all: 'Общая карта', map_mode_day: 'Карта дня', map_of_day: 'Карта этого дня',
    translate_en: 'Перевести на EN', translating: 'Перевожу…', translate_err: 'Перевод не удался (сеть или дневной лимит)',
    log_title: 'Журнал событий', clear: 'Очистить',
    db_diag: 'Диагностика БД (все таблицы)', admin_only: 'Доступно только администратору',
    checking_tables: 'Проверяю таблицы…',
    priority: 'Приоритет', move_up: 'Выше', move_down: 'Ниже',
    callbox: 'Код callbox', code_target: 'Этот код открывает', target_callbox: 'Домофон', target_gate: 'Ворота',
    history: 'История', code_history: 'История кодов',
    propose_code: 'Предложить код', request_sent: 'Заявка отправлена админу',
    code_requests: 'Заявки на коды', reject: 'Отклонить',
    req_by: 'заявка от', no_changes: 'без изменений',
    req_approved: 'Заявка одобрена, код обновлён', req_rejected: 'Заявка отклонена',
    no_history: 'Изменений ещё не было', since: 'с', by_word: 'добавил',
    last_code_upd: 'код обновлён', code_pending_note: 'Ваша заявка ждёт решения админа',
    template: 'Шаблон', pick_template: 'Выберите шаблон',
    d_extraworks: 'Доп. работы', d_sizes: 'Размеры', d_products: 'Товары',
    kind_work: 'Работа', kind_purchase: 'Покупка товара',
    needs_size: 'Указывать размер', size_type: 'Вид размера', unit_lbl: 'Ед. изм.',
    product: 'Товар', qty: 'Кол-во', default_price: 'Цена по умолч.',
    no_templates: 'Справочник «Доп. работы» пуст — админ заполнит его в Справочниках',
    extra_section: 'Доп. работы и покупки',
    price_lbl: 'Цена', price_per_size: 'за 1 ед. размера', custom_size: 'свой размер',
    stats_title: 'Статистика', period_all: 'Всё время',
    st_done: 'Работ выполнено', st_total: 'создано', st_earned: 'Заработано',
    st_approved_sum: 'из них апрувлено', st_avg: 'Средний чек',
    st_miles: '≈ миль в пути', st_miles_hint: 'сумма прямых отрезков между объектами дня; реальный пробег больше',
    st_picked: 'Пикапов собрано', st_ontime: 'вовремя', st_late: 'с опозданием',
    st_visited: 'Объектов посещено', st_eq: 'Оборудования размещено', st_units: 'шт·разм.',
    st_purchases: 'Покупок на', chart_earn: 'Заработок по дням',
    sync_partial: 'Синхронизация частичная — ошибки в таблицах', sync_dur: 'за',
    write_err: 'Ошибка записи', tables_failed: 'таблиц с ошибкой',
    week_days: ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'],
    months: ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'],
  },
  en: {
    app_sub: 'work log · version',
    today: 'Today', pickups_today: 'My pickups', jobs: 'Jobs', pickup: 'Pickup',
    add_task: 'Add task', no_items: 'Nothing for this day', tap_add: 'Tap "Add task"',
    date: 'Date', counterparty: 'Counterparty', complex: 'Apartment complex', unit: 'Unit #',
    work_type: 'Work type', create: 'Create', cancel: 'Cancel', save: 'Save',
    delete: 'Delete', edit: 'Edit', close: 'Close', back: 'Back', add: 'Add',
    tab_home: 'Home', tab_report: 'Report', tab_dirs: 'Directory', tab_settings: 'Settings', tab_faq: 'FAQ', tab_stats: 'Stats',
    mine: 'Mine', all: 'All',
    status_draft: 'Draft', status_done: 'Done', status_approved: 'Approved',
    job_done_chk: 'Work completed',
    vacant: 'Vacant', occupied: 'Occupied',
    equipment: 'Equipment (rental, pickup in N days)',
    aux_needed: 'Bring with you',
    other_services: 'Other services (free text)',
    desc: 'Description', amount: 'Amount',
    total: 'Total', approved_total: 'Approved total',
    approve: 'Approve', approved_by: 'Approved', approve_reset_note: 'Changing the total after approval resets it',
    pdf: 'Download PDF invoice', due: 'pickup', overdue: 'overdue',
    pick_up: 'Pick up', picked: 'Picked up', pickup_confirm: 'Mark this equipment as picked up?',
    banner_pickups: 'Pickup today', banner_overdue: 'overdue',
    report_title: 'Pickups report', report_date: 'For date', copy_report: 'Copy report',
    copied: 'Copied', nothing_due: 'No pickups for this date', incl_overdue: 'including overdue',
    dirs: 'Directory',
    d_counterparties: 'Counterparties', d_complexes: 'Complexes', d_worktypes: 'Work types',
    d_equipment: 'Equipment', d_aux: 'Aux equipment', d_price: 'PRICE',
    std_price: 'Standard price', custom_price: 'Custom price', price_list: 'Price list',
    name: 'Name', abbr: 'Abbr', color: 'Color', address: 'Address', access_code: 'Access code',
    day_price: 'Price $/day', needs_aux: 'Needs aux equipment',
    complexes_of: 'Counterparty complexes', info: 'Info', prices: 'Prices',
    settings: 'Settings', profile: 'Profile', doc_name: 'Name in documents & jobs',
    language: 'Interface language', sync: 'Sync now', synced: 'Synced',
    never: 'never', org: 'Organization (for PDF)', org_name: 'Company name (terms text)',
    org_short: 'Short name (APC)', org_assoc: 'Association (header)', org_addr: 'Address (header, per line)',
    logout: 'Log out', version: 'App version', updated_to: 'App updated to version',
    update_after_form: 'Update ready — will apply after you close the form',
    upd_check: 'Check for updates', upd_latest: 'You are up to date',
    upd_found: 'Update available', upd_last: 'checked',
    login_title: 'Sign in to TechLog', demo_note: 'Demo mode: Supabase is not configured (config.js). Data is stored locally.',
    email: 'Email', password: 'Password', sign_in: 'Sign in', sign_up: 'Sign up',
    display_name: 'Name (for documents)', have_acc: 'Have an account? Sign in', no_acc: 'No account? Sign up',
    role_admin: 'Admin', role_manager: 'Manager', role_tech: 'Technician',
    saved: 'Saved', deleted: 'Deleted', created: 'Created',
    confirm_del: 'Delete permanently?',
    days: 'd.', qty: 'Qty', for_days: 'Days',
    tech: 'Technician', no_access: 'No access', stats_jobs: 'jobs', stats_pk: 'pickups',
    stats_due: 'to pick up', stats_over: 'overdue',
    sync_err: 'Sync error', offline_note: 'Offline: showing cached data',
    not_selected: 'Not selected', aux_take_hint: 'tap what you need to take',
    select: '— select —', install_hint: 'Browser menu → "Install app" / "Add to Home screen"',
    tab_map: 'Map', tab_reports: 'Reports',
    map_title: 'Apartment complexes map', all_counterparties: 'All counterparties',
    map_day_mode: 'Show day on map', map_day_hint: 'Jobs and pickups for the selected date',
    map_no_coords: 'no coordinates — open the complex and tap "Find by address"',
    route_gmaps: 'Day route in Google Maps', open_gmaps: 'Open in Google Maps',
    geocode: 'Find by address', geocode_ok: 'Coordinates found', geocode_fail: 'Address not found — enter coordinates manually',
    lat: 'Latitude', lng: 'Longitude',
    note: 'Note', note_hint: 'This text goes to the PDF invoice (NOTES line)',
    dictate: 'Dictate', listening: 'Listening… tap again to stop',
    dict_unsupported: 'Voice input is not supported by this browser (use Chrome)',
    dict_lang: 'Dictation language',
    reports_pdf: 'Invoices (PDF)', rep_pickups: 'Pickups',
    rep_range: 'Period', from: 'from', to: 'to',
    rep_yesterday: 'Yesterday', rep_7: '7 days', rep_30: '30 days',
    rep_status_all: 'All', rep_only_done: 'Done+Approved', rep_only_approved: 'Approved only',
    rep_found: 'Invoices found', rep_sum: 'total',
    rep_download: 'Download single PDF', rep_none: 'No jobs in this period',
    rep_half_hint: '2 invoices per Letter page (half each)',
    d_staff: 'Staff', role: 'Role', visibility: 'Visibility for manager',
    vis_hint: 'Checked employees are visible to this manager', vis_btn: 'Visibility',
    confirm_email: 'Confirm your email via the link, then sign in',
    auth_loading: 'Checking authorization…',
    no_coords_yet: 'No coordinates',
    req_missing: 'Missing', issue_complex: 'apartment complex', issue_unit: 'unit number', issue_tech: 'technician',
    crew: 'Performed by', add_helper: '＋ add employee', all_staff: 'All',
    login: 'Login', login_hint: 'Latin/digits, 3–32 chars. Sign in with login & password.',
    invite_code: 'Invite code', invite_bad: 'Invalid invite code',
    login_taken_or_err: 'Login is taken or sign-up failed',
    back_today: 'Today', navigate: 'Navigate', copied_code: 'Code copied',
    draft_restored: 'Draft restored (unsaved changes)',
    pdf_blocked: 'PDF blocked — fill in', batch_skipped: 'skipped (missing required fields)',
    diag: 'Diagnostics', diag_copy: 'Copy report', diag_running: 'Checking…',
    srv_not_ready: 'Server not configured: run supabase/schema.sql (check_invite function is missing)',
    invite_check_err: 'Invite check error', srv_rejected: 'Server rejected sign-up — see Diagnostics',
    login_taken: 'This login already exists', login_free: 'login is free', login_checking: 'checking login…',
    srv500: 'Server rejected sign-up (500). See Supabase → Logs → Postgres; copy the report in Diagnostics',
    run_new_schema: 'run the new supabase/schema.sql',
    install_app: 'Install app', installed_ok: 'App installed',
    already_installed: 'Running as installed app',
    install_declined: 'Install dismissed',
    install_where_win: 'After install, find TechLog in the Start menu (Windows) or desktop; Chrome apps list: chrome://apps',
    install_no_prompt: 'Browser has not offered install yet — check the PWA section in Diagnostics',
    reg_ok: 'Sign-up successful', welcome: 'Welcome',
    reg_now_signin: 'Account created — now sign in',
    quick_title: 'Quick settings', font_soon: 'Font size — coming soon',
    all_settings: 'All settings',
    footer_rights: '© No rights reserved', footer_city: 'Alpharetta',
    faq: 'How it works (FAQ)',
    map_mode_all: 'All complexes', map_mode_day: 'Day map', map_of_day: 'Map of this day',
    translate_en: 'Translate to EN', translating: 'Translating…', translate_err: 'Translation failed (network or daily limit)',
    log_title: 'Event log', clear: 'Clear',
    db_diag: 'DB diagnostics (all tables)', admin_only: 'Admins only',
    checking_tables: 'Checking tables…',
    priority: 'Priority', move_up: 'Up', move_down: 'Down',
    callbox: 'Callbox code', code_target: 'This code opens', target_callbox: 'Callbox', target_gate: 'Gate',
    history: 'History', code_history: 'Code history',
    propose_code: 'Propose code', request_sent: 'Request sent to admin',
    code_requests: 'Code requests', reject: 'Reject',
    req_by: 'request by', no_changes: 'no changes',
    req_approved: 'Approved, code updated', req_rejected: 'Request rejected',
    no_history: 'No changes yet', since: 'since', by_word: 'added by',
    last_code_upd: 'code updated', code_pending_note: 'Your request awaits admin decision',
    template: 'Template', pick_template: 'Pick a template',
    d_extraworks: 'Extra works', d_sizes: 'Sizes', d_products: 'Products',
    kind_work: 'Work', kind_purchase: 'Purchase',
    needs_size: 'Requires size', size_type: 'Size type', unit_lbl: 'Unit',
    product: 'Product', qty: 'Qty', default_price: 'Default price',
    no_templates: 'The "Extra works" directory is empty — an admin can fill it in Directories',
    extra_section: 'Extra works & purchases',
    price_lbl: 'Price', price_per_size: 'per 1 size unit', custom_size: 'custom size',
    stats_title: 'Statistics', period_all: 'All time',
    st_done: 'Jobs completed', st_total: 'created', st_earned: 'Earned',
    st_approved_sum: 'approved of it', st_avg: 'Avg invoice',
    st_miles: '≈ miles traveled', st_miles_hint: 'straight-line legs between the day\'s stops; real mileage is higher',
    st_picked: 'Pickups collected', st_ontime: 'on time', st_late: 'late',
    st_visited: 'Sites visited', st_eq: 'Equipment placed', st_units: 'pcs·plc.',
    st_purchases: 'Purchases', chart_earn: 'Earnings by day',
    sync_partial: 'Partial sync — table errors', sync_dur: 'in',
    write_err: 'Write error', tables_failed: 'tables failed',
    week_days: ['MO','TU','WE','TH','FR','SA','SU'],
    months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  }
};
function t(k){ const d = I18N[state.lang] || I18N.ru; return (k in d) ? d[k] : (I18N.ru[k] ?? k); }

/* ---------------- Глобальное состояние ---------------- */
const state = {
  lang: localStorage.getItem('techlog_lang') || 'ru',
  screen: 'login',            // login | home | job | report | dirs | settings
  dirTab: 'counterparties',
  repTab: 'invoices',
  repFrom: null, repTo: null, repStatus: 'all', repCp: '',
  statFrom: null, statTo: null, statMine: true,
  mapCp: '', mapDay: false, mapDate: null,
  dictLang: localStorage.getItem('techlog_dictlang') || 'ru-RU',
  jobId: null,
  cpOpenId: null, cpTab: 'info',
  weekStart: null,            // ISO monday
  selDate: null,              // ISO yyyy-mm-dd
  reportDate: null,
  filterMine: true,
  user: null,                 // {id, login, display_name, role}
  sb: null,                   // supabase client
  syncing: false,
  lastSync: localStorage.getItem('techlog_lastsync') || '',
  pendingUpdate: null,        // версия, ждущая закрытия формы
  data: null,                 // все таблицы
};

/* ---------------- Утилиты ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money = (n) => '$' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2});
const todayISO = () => { const d = new Date(); return isoOf(d); };
function isoOf(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function parseISO(s){ const [y,m,dd] = String(s).split('-').map(Number); return new Date(y, m-1, dd); }
function addDaysISO(iso, n){ const d = parseISO(iso); d.setDate(d.getDate()+n); return isoOf(d); }
function mondayOf(iso){ const d = parseISO(iso); const wd = (d.getDay()+6)%7; d.setDate(d.getDate()-wd); return isoOf(d); }
function fmtDM(iso){ const d = parseISO(iso); return d.getDate() + ' ' + t('months')[d.getMonth()]; }
function fmtDMY(iso){ const d = parseISO(iso); return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear(); }
function fmtUS(iso){ const d = parseISO(iso); return String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0') + '.' + String(d.getFullYear()).slice(2); }
function nowStamp(){ const d = new Date(); return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
function shortName(full){
  const p = String(full||'').trim().split(/\s+/);
  return p[0] ? p[0] + (p[1] ? ' ' + p[1][0].toUpperCase() + '.' : '') : '';
}
function techNamesFor(j){
  const ids = [j.technician_id, ...(j.helper_ids||[])].filter(Boolean);
  const names = ids.map(id => {
    const pr = state.data.profiles.find(p=>p.id===id);
    return pr ? shortName(pr.display_name) : null;
  }).filter(Boolean);
  return names.length ? names.join(', ') : shortName(j.technician_name||'');
}
function jobIssues(j){
  const out = [];
  if (!j.complex_id) out.push('complex');
  if (!String(j.unit_number||'').trim()) out.push('unit');
  if (!j.technician_id && !(j.helper_ids||[]).length) out.push('tech');
  return out;
}
function warnIcon(sm){ return `<span class="warn${sm?' sm':''}" title="${t('req_missing')}">!</span>`; }
function initials(name){ return String(name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function textColorFor(hex){ const h = (hex||'#888').replace('#',''); const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16); return (r*299+g*587+b*114)/1000 > 150 ? '#10251a' : '#ffffff'; }
function toast(msg, kind){ const el = document.createElement('div'); el.className = 'toast' + (kind==='err'?' err':kind==='inf'?' inf':''); el.textContent = msg; $('#toasts').appendChild(el); setTimeout(()=>el.remove(), 3800); }
const PALETTE = ['#58CC02','#1CB0F6','#FF4B4B','#FF9600','#FFC800','#CE82FF','#2EC4B6','#111827','#8B9AA3'];

/* =====================================================================
   СПРАВОЧНИКИ ПО УМОЛЧАНИЮ (сид)
   ===================================================================== */
const STD_PRICES = [
  ['steam_deep_scrub','Steam Clean — Deep Scrub','per room',35],
  ['steam_rotovac','Steam Clean — Rotovac','per room',45],
  ['rem_red_stain','Removal — Red Stain','flat',25],
  ['rem_wax','Removal — Wax','flat',25],
  ['rem_rust','Removal — Rust','flat',25],
  ['rem_ink','Removal — Ink','flat',25],
  ['rem_gum','Removal — Gum','flat',15],
  ['rem_paint','Removal — Paint','flat',25],
  ['rep_threshold','Repair — Threshold','flat',20],
  ['rep_stretch','Repair — Stretch','flat',45],
  ['rep_seam','Repair — Seam','flat',35],
  ['rep_patch','Repair — Patch','flat',35],
  ['dye_spot','Dye — Spot Dye','flat',45],
  ['dye_full','Dye — Full Dye','flat',150],
  ['oth_trash_out','Other — Trash Out','flat',50],
  ['oth_pad_removal_room','Other — Pad Removal (room)','per room',30],
  ['oth_pad_removal_all','Other — Pad Removal (all unit)','flat',120],
  ['fog_pet','Fog/GOC — Pet','flat',45],
  ['fog_smoke','Fog/GOC — Smoke','flat',45],
  ['fog_deodorizer','Fog/GOC — Deodorizer','flat',25],
  ['tr_sealant','Treatment — Sealant','flat',45],
  ['tr_mold','Treatment — Mold & Mildew','flat',45],
  ['tr_degreaser','Treatment — Degreaser','flat',45],
  ['wv_area','Wet Vac / Flood — per area','per area',40],
  ['wv_all_unit','Wet Vac / Flood — All Unit','flat',180],
  ['wv_sewer_extra','Wet Vac — Sewer surcharge','flat',60],
  ['ad_per_bedroom','Air Duct Cleaning — per bedroom','per bedroom',50],
  ['ad_dryer_vent','Dryer Vent Cleaning','flat',80],
  ['pad_q14','Pad — 1/4 roll','flat',95],
  ['pad_q12','Pad — 1/2 roll','flat',180],
  ['pad_q34','Pad — 3/4 roll','flat',260],
  ['pad_roll','Pad — 1 Roll','flat',340],
  ['pad_install_room','Pad Installation (room)','per room',30],
  ['pad_install_all','Pad Installation (all unit)','flat',120],
  ['eq_blw','Equipment — Blower','per unit/day',30],
  ['eq_dhm','Equipment — Dehumidifier','per unit/day',60],
  ['eq_scr','Equipment — Air Scrubber','per unit/day',75],
  ['eq_ozn','Equipment — Ozone Machine','per unit/day',85],
];

function seedCatalogs(){
  const auxIds = { carpet: uid(), duct: uid(), water: uid(), ozone: uid() };
  const aux = [
    { id: auxIds.carpet, name: 'Портативный моющий пылесос / Portable carpet extractor' },
    { id: auxIds.duct,   name: 'Эйрдак-машина / Air duct machine' },
    { id: auxIds.water,  name: 'Портативная откачка воды / Portable water extraction' },
    { id: auxIds.ozone,  name: 'Озон-машина / Ozone machine' },
  ];
  const work_types = [
    { id: uid(), name: 'VETVAG (water extraction)', color: '#58CC02', needs_aux: true,  aux_ids: [auxIds.water], sort: 1 },
    { id: uid(), name: 'DAMAGE WATER',              color: '#2EC4B6', needs_aux: true,  aux_ids: [auxIds.water], sort: 2 },
    { id: uid(), name: 'STEAM CLEAN',               color: '#FF9600', needs_aux: true,  aux_ids: [auxIds.carpet], sort: 3 },
    { id: uid(), name: 'AIR DUCT',                  color: '#FF4B4B', needs_aux: true,  aux_ids: [auxIds.duct], sort: 4 },
    { id: uid(), name: 'DEMOLITION (walls/cabinets)', color: '#1CB0F6', needs_aux: false, aux_ids: [], sort: 5 },
    { id: uid(), name: 'PROPOSAL (approved earlier)', color: '#CE82FF', needs_aux: false, aux_ids: [], sort: 6 },
  ];
  const equipment_types = [
    { id: uid(), name: 'Blower',        abbr: 'BLW', color: '#58CC02', price_key: 'eq_blw', sort: 2 },
    { id: uid(), name: 'Dehumidifier',  abbr: 'DHM', color: '#1CB0F6', price_key: 'eq_dhm', sort: 3 },
    { id: uid(), name: 'Air Scrubber',  abbr: 'SCR', color: '#FF4B4B', price_key: 'eq_scr', sort: 1 },
    { id: uid(), name: 'Ozone Machine', abbr: 'OZN', color: '#111827', price_key: 'eq_ozn', sort: 4 },
  ];
  const price_list = STD_PRICES.map(([key,name,unitl,price], i) => ({ id: uid(), key, name, unit_label: unitl, price, sort: i }));
  const org = {
    id: 'org', invoice_title: 'INVOICE #CC', header_city: 'ATLANTA',
    assoc_line: 'atlanta apartment association',
    addr1: 'PO BOX 920482', addr2: 'NORCROSS,', addr3: 'GA 30010',
    company_name: 'APC, LLC', company_short: 'APC'
  };
  const size_types = [
    { id:'sz1', name:'Длина / Length', unit:'ft', sort:1 },
    { id:'sz2', name:'Площадь / Area', unit:'sq ft', sort:2 },
    { id:'sz3', name:'Вес / Weight', unit:'lb', sort:3 },
    { id:'sz4', name:'Количество / Quantity', unit:'pcs', sort:4 },
  ];
  const extra_works = [
    { id:'ew1', name:'Вырезка стен / Wall cutout', kind:'work', needs_size:true, size_type_id:'sz2', price:3, sort:1 },
    { id:'ew2', name:'Вырезка потолка / Ceiling cutout', kind:'work', needs_size:true, size_type_id:'sz2', price:4, sort:2 },
    { id:'ew3', name:'Покупка товара / Purchase', kind:'purchase', needs_size:false, size_type_id:null, price:0, sort:3 },
  ];
  const product_types = [
    { id:'pt1', name:'Решётка / Vent grille', default_price:25, sort:1 },
    { id:'pt2', name:'Химия для ковра / Carpet chemicals', default_price:45, sort:2 },
  ];
  return { aux_equipment: aux, work_types, equipment_types, price_list, org_settings: org, size_types, extra_works, product_types };
}

function seedDemoData(){
  const cat = seedCatalogs();
  const profiles = [
    { id: 'demo-admin',   login: 'ivan',   display_name: 'Ivan Petrov',   role: 'admin' },
    { id: 'demo-manager', login: 'alexey', display_name: 'Alexey Smirnov', role: 'manager' },
    { id: 'demo-tech',    login: 'sergey', display_name: 'Sergey Volkov', role: 'tech' },
  ];
  const cp1 = { id: uid(), name: 'Magnolia Group',  abbr: 'MG', notes: '' };
  const cp2 = { id: uid(), name: 'Cascade Living',  abbr: 'CL', notes: '' };
  const cp3 = { id: uid(), name: 'Peachtree RE',    abbr: 'PT', notes: '' };
  const counterparties = [cp1, cp2, cp3];
  const complexes = [
    { id: uid(), counterparty_id: cp1.id, name: 'Magnolia Vinings', abbr: 'MGV', address: '3200 Cumberland Blvd SE, Atlanta, GA', access_code: '#2461', lat: 33.8823, lng: -84.4620 },
    { id: uid(), counterparty_id: cp1.id, name: 'Magnolia Creek',   abbr: 'MGC', address: '1180 Franklin Rd, Marietta, GA',       access_code: '#7730', lat: 33.9260, lng: -84.5170 },
    { id: uid(), counterparty_id: cp2.id, name: 'Cascade Falls',    abbr: 'CSF', address: '2890 Cascade Rd SW, Atlanta, GA',      access_code: '#1150', lat: 33.7223, lng: -84.4790 },
    { id: uid(), counterparty_id: cp3.id, name: 'Peachtree Corners',abbr: 'PTC', address: '5560 Peachtree Pkwy, Norcross, GA',    access_code: '#9042', lat: 33.9700, lng: -84.2210 },
  ];
  const counterparty_prices = [
    { id: uid(), counterparty_id: cp2.id, key: 'eq_blw', custom: true, price: 35 },
    { id: uid(), counterparty_id: cp2.id, key: 'steam_deep_scrub', custom: true, price: 40 },
  ];
  const today = todayISO();
  const d3 = addDaysISO(today, -3);
  const wtSteam = cat.work_types.find(w=>/STEAM/.test(w.name));
  const wtVet = cat.work_types.find(w=>/VETVAG/.test(w.name));
  const eqBLW = cat.equipment_types.find(e=>e.abbr==='BLW');
  const eqDHM = cat.equipment_types.find(e=>e.abbr==='DHM');
  const fd = emptyFormData();
  fd.treatments.on = true; fd.treatments.sealant = true;
  fd.airduct.air_duct = true; fd.airduct.bedrooms = 1; fd.airduct.note = '1x5 removed pad';
  fd.equipment[eqBLW.id] = { qty: 5, days: 3 };
  fd.equipment[eqDHM.id] = { qty: 1, days: 3 };
  fd.others[0] = { desc: 'cut ceiling toilet 2x7, living room ceiling 7x7, bedroom 7x7', amount: 200 };
  const job1 = {
    id: uid(), date: d3, counterparty_id: cp1.id, complex_id: complexes[0].id, unit_number: '916',
    work_type_id: wtVet.id, technician_id: 'demo-admin', technician_name: 'Ivan P., Alexey S.', helper_ids: ['demo-manager'],
    priority: true, sort_order: 0, status: 'done', note: 'Key at leasing office. Dog in unit — call tenant 30 min before pickup.', form_data: fd, total: 0, approved_total: null, approved_by: null, approved_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const job2 = {
    id: uid(), date: today, counterparty_id: cp2.id, complex_id: complexes[2].id, unit_number: '204',
    work_type_id: wtSteam.id, technician_id: 'demo-tech', technician_name: 'Sergey V.', helper_ids: [],
    status: 'draft', note: '', form_data: emptyFormData(), total: 0, approved_total: null, approved_by: null, approved_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const placements = [
    { id: uid(), job_id: job1.id, equipment_type_id: eqBLW.id, qty: 5, days: 3, placed_date: d3, due_date: addDaysISO(d3,3),
      picked_up: false, picked_up_at: null, picked_up_by: null, technician_id: 'demo-admin',
      complex_id: complexes[0].id, counterparty_id: cp1.id, unit_number: '916' },
    { id: uid(), job_id: job1.id, equipment_type_id: eqDHM.id, qty: 1, days: 3, placed_date: d3, due_date: addDaysISO(d3,3),
      picked_up: false, picked_up_at: null, picked_up_by: null, technician_id: 'demo-admin',
      complex_id: complexes[0].id, counterparty_id: cp1.id, unit_number: '916' },
  ];
  const data = {
    profiles, counterparties, complexes, counterparty_prices, hidden_staff: [], code_requests: [], complex_code_history: [],
    jobs: [job1, job2], placements, ...cat
  };
  job1.total = calcTotal(job1.form_data, priceResolver(cp1.id, data), data);
  return data;
}

/* =====================================================================
   ХРАНИЛИЩЕ / СИНХРОНИЗАЦИЯ
   ===================================================================== */
function saveLocal(){
  try { return saveLocalUnsafe(); }
  catch(e){ dlog('⛔ saveLocal (квота localStorage?):', e); }
}
function saveLocalUnsafe(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state.data)); }catch(e){} }
function loadLocal(){
  try { return loadLocalUnsafe(); }
  catch(e){ dlog('⛔ loadLocal (битый кеш):', e); return null; }
}
function loadLocalUnsafe(){ try{ const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }catch(e){ return null; } }

const TABLES = ['profiles','counterparties','complexes','counterparty_prices','work_types','equipment_types','aux_equipment','price_list','size_types','extra_works','product_types','hidden_staff','code_requests','complex_code_history','jobs','placements'];

function emptyData(){
  const d = { org_settings: {
    id: 'org', invoice_title: 'INVOICE #CC', header_city: 'ATLANTA',
    assoc_line: 'atlanta apartment association',
    addr1: 'PO BOX 920482', addr2: 'NORCROSS,', addr3: 'GA 30010',
    company_name: 'APC, LLC', company_short: 'APC'
  } };
  TABLES.forEach(tb => d[tb] = []);
  return d;
}

async function sbLoadAll(){
  const sb = state.sb;
  const out = {};
  SYNC_ERRORS = [];
  const prev = state.data || {};
  const names = [...TABLES, 'org_settings'];
  const t0 = Date.now();
  const reqs = names.map(tb => {
    const q = tb === 'org_settings' ? sb.from(tb).select('*').limit(1) : sb.from(tb).select('*');
    const ts = Date.now();
    return Promise.resolve(q)
      .then(r => ({ tb, ms: Date.now() - ts, data: r.data, error: r.error }))
      .catch(e => ({ tb, ms: Date.now() - ts, data: null, error: e }));
  });
  const res = await Promise.all(reqs);
  let okCnt = 0;
  for (const r of res){
    if (r.error){
      SYNC_ERRORS.push({ tb: r.tb, err: errStr(r.error) });
      dlog('⛔ sync таблица', r.tb + ':', r.error, '· ' + r.ms + ' мс');
      // не теряем локальные данные упавшей таблицы
      if (r.tb === 'org_settings') out.org_settings = prev.org_settings || seedCatalogs().org_settings;
      else out[r.tb] = prev[r.tb] || [];
      continue;
    }
    okCnt++;
    if (r.tb === 'org_settings') out.org_settings = (r.data && r.data[0]) || prev.org_settings || seedCatalogs().org_settings;
    else out[r.tb] = r.data || [];
    if (r.ms > 1500) dlog('🐢 sync таблица', r.tb, 'медленно: ' + r.ms + ' мс');
  }
  out._syncMs = Date.now() - t0;
  out._syncOk = okCnt;
  out._syncFail = SYNC_ERRORS.length;
  if (SYNC_ERRORS.length && SYNC_ERRORS.length === names.length){
    // упало вообще всё — считаем фатальной ошибкой (сеть/авторизация)
    throw new Error('sync: все таблицы недоступны — ' + SYNC_ERRORS[0].err);
  }
  return out;
}

async function syncNow(silent){
  dlog('sync: старт', HAS_SB ? 'Supabase' : 'demo');
  if (!HAS_SB){ state.lastSync = nowStamp(); localStorage.setItem('techlog_lastsync', state.lastSync); if(!silent) toast('✓ ' + t('synced') + ': ' + state.lastSync); render(); return; }
  if (state.syncing) return;
  state.syncing = true;
  try {
    if (!state.data) state.data = loadLocal() || emptyData();
    render();
    if (!navigator.onLine) dlog('⚠ sync: navigator.onLine = false (возможен офлайн)');
    state.data = await sbLoadAll();
    saveLocal();
    const ms = state.data._syncMs, failN = state.data._syncFail || 0;
    dlog('sync:', failN ? '⚠ частично' : 'ок', '·', t('sync_dur'), ms + ' мс ·',
      TABLES.map(tb => tb + '=' + (state.data[tb]||[]).length).join(' '),
      failN ? '· ошибки: ' + SYNC_ERRORS.map(x=>x.tb).join(',') : '');
    if (failN) toast('⚠ ' + t('sync_partial') + ': ' + SYNC_ERRORS.map(x=>x.tb).join(', '), 'err');
    if (isAdmin() && pendingCodeRequests().length && !state._reqToasted){
      state._reqToasted = true;
      toast('🔔 ' + t('code_requests') + ': ' + pendingCodeRequests().length, 'inf');
    }
    state.lastSync = nowStamp();
    localStorage.setItem('techlog_lastsync', state.lastSync);
    if (!silent) toast('✓ ' + t('synced') + ': ' + state.lastSync);
  } catch (e) {
    dlog('⛔ sync: ошибка:', e);
    toast(t('sync_err') + ' — ' + t('offline_note'), 'err');
    if (!state.data) state.data = loadLocal() || emptyData();
  } finally {
    state.syncing = false; render();
  }
}

/* Универсальные записи: локально + (если есть) Supabase */
function tableOf(name){ return state.data[name]; }
async function dbUpsert(table, row){
  const arr = tableOf(table);
  const i = arr.findIndex(r => r.id === row.id);
  if (i >= 0) arr[i] = row; else arr.push(row);
  saveLocal();
  if (HAS_SB) {
    const ts = Date.now();
    try {
      const { error } = await state.sb.from(table).upsert(row);
      if (error) {
        noteWriteError('upsert', table, row.id, error);
        dlog('⛔ upsert', table, 'id=' + String(row.id||'').slice(0,8) + ':', error, '· ' + (Date.now()-ts) + ' мс');
        toast(t('write_err') + ' (' + table + '): ' + error.message, 'err');
      } else if (Date.now() - ts > 1500) {
        dlog('🐢 upsert', table, 'медленно: ' + (Date.now()-ts) + ' мс');
      }
    } catch(e){
      noteWriteError('upsert', table, row.id, e);
      dlog('⛔ upsert exception', table + ':', e);
      toast(t('write_err') + ' (' + table + ')', 'err');
    }
  }
}
async function dbDelete(table, id){
  const arr = tableOf(table);
  const i = arr.findIndex(r => r.id === id);
  if (i >= 0) arr.splice(i, 1);
  saveLocal();
  if (HAS_SB) {
    const ts = Date.now();
    try {
      const { error } = await state.sb.from(table).delete().eq('id', id);
      if (error) {
        noteWriteError('delete', table, id, error);
        dlog('⛔ delete', table, 'id=' + String(id||'').slice(0,8) + ':', error, '· ' + (Date.now()-ts) + ' мс');
        toast(t('write_err') + ' (' + table + '): ' + error.message, 'err');
      }
    } catch(e){
      noteWriteError('delete', table, id, e);
      dlog('⛔ delete exception', table + ':', e);
      toast(t('write_err') + ' (' + table + ')', 'err');
    }
  }
}
async function dbSaveOrg(org){
  state.data.org_settings = org; saveLocal();
  if (HAS_SB) {
    const { error } = await state.sb.from('org_settings').upsert(org);
    if (error) toast(t('sync_err') + ': ' + error.message, 'err');
  }
}

/* ---------------- Роли ---------------- */
const isAdmin = () => state.user?.role === 'admin';
const isManager = () => state.user?.role === 'manager' || isAdmin();

/* =====================================================================
   МОДЕЛЬ ФОРМЫ ИНВОЙСА + РАСЧЁТ
   ===================================================================== */
function emptyFormData(){
  return {
    vacant: false, occupied: false,
    steam: { on:false, deep_scrub:false, rotovac:false, rooms:1 },
    removals: { on:false, red_stain:false, wax:false, rust:false, ink:false, gum:false, paint:false },
    repairs: { on:false, threshold:false, stretch:false, seam:false, patch:false },
    dye: { on:false, spot:false, full:false },
    other: { on:false, trash_out:false, pad_removal:false, rooms:1, all_unit:false },
    fog: { fog:false, goc:false, pet:false, smoke:false, deodorizer:false },
    treatments: { on:false, sealant:false, mold:false, degreaser:false },
    wetvac: { wet_vac:false, flood:false, sewer:false, fresh:false,
              areas: { ktc:false, lr:false, dr:false, hall:false, brs:false, all:false } },
    airduct: { air_duct:false, dryer_vent:false, bedrooms:1, note:'' },
    equipment: {},                 // { [equipment_type_id]: {qty, days} }
    pad: { on:false, size:null, rooms:0, all_unit:false },   // size: q14|q12|q34|roll
    others: [ {desc:'',amount:0}, {desc:'',amount:0}, {desc:'',amount:0} ],
    extra: [],
    aux_take: {},                  // { [aux_id]: true } — отмеченное «взять с собой»
  };
}

/* Резолвер цены: индивидуальная цена контрагента → стандартная */
function priceResolver(counterparty_id, data){
  const d = data || state.data;
  const std = {}; d.price_list.forEach(p => std[p.key] = +p.price || 0);
  const map = {};
  d.counterparty_prices.filter(cp => cp.counterparty_id === counterparty_id && cp.custom)
    .forEach(cp => map[cp.key] = +cp.price || 0);
  return (key) => (key in map) ? map[key] : (std[key] || 0);
}

function eqDayPrice(eqType, p){ return p(eqType.price_key || ('eq_' + String(eqType.abbr||'').toLowerCase())); }

/* Сумма секции — для показа в заголовках + итог */
function calcSections(fd, p, data){
  const d = data || state.data;
  const s = {};
  const n1 = (v) => Math.max(1, +v || 1);
  s.steam = (fd.steam.deep_scrub ? p('steam_deep_scrub') * n1(fd.steam.rooms) : 0)
          + (fd.steam.rotovac ? p('steam_rotovac') * n1(fd.steam.rooms) : 0);
  s.removals = ['red_stain','wax','rust','ink','gum','paint']
    .reduce((a,k)=>a + (fd.removals[k] ? p('rem_' + k) : 0), 0);
  s.repairs = ['threshold','stretch','seam','patch']
    .reduce((a,k)=>a + (fd.repairs[k] ? p('rep_' + k) : 0), 0);
  s.dye = (fd.dye.spot ? p('dye_spot') : 0) + (fd.dye.full ? p('dye_full') : 0);
  s.other = (fd.other.trash_out ? p('oth_trash_out') : 0)
          + (fd.other.pad_removal ? (fd.other.all_unit ? p('oth_pad_removal_all') : p('oth_pad_removal_room') * n1(fd.other.rooms)) : 0);
  s.fog = (fd.fog.pet ? p('fog_pet') : 0) + (fd.fog.smoke ? p('fog_smoke') : 0) + (fd.fog.deodorizer ? p('fog_deodorizer') : 0);
  s.treatments = (fd.treatments.sealant ? p('tr_sealant') : 0) + (fd.treatments.mold ? p('tr_mold') : 0) + (fd.treatments.degreaser ? p('tr_degreaser') : 0);
  const areas = fd.wetvac.areas;
  const areaCnt = ['ktc','lr','dr','hall','brs'].reduce((a,k)=>a+(areas[k]?1:0),0);
  s.wetvac = (fd.wetvac.wet_vac || fd.wetvac.flood)
    ? ((areas.all ? p('wv_all_unit') : areaCnt * p('wv_area')) + (fd.wetvac.sewer ? p('wv_sewer_extra') : 0))
    : 0;
  s.airduct = (fd.airduct.air_duct ? p('ad_per_bedroom') * n1(fd.airduct.bedrooms) : 0)
            + (fd.airduct.dryer_vent ? p('ad_dryer_vent') : 0);
  s.equipment = 0;
  d.equipment_types.forEach(et => {
    const e = fd.equipment[et.id];
    if (e && +e.qty > 0) s.equipment += (+e.qty) * Math.max(1, +e.days || 1) * eqDayPrice(et, p);
  });
  const padMap = { q14:'pad_q14', q12:'pad_q12', q34:'pad_q34', roll:'pad_roll' };
  s.pad = (fd.pad.size ? p(padMap[fd.pad.size]) : 0)
        + (fd.pad.all_unit ? p('pad_install_all') : (+fd.pad.rooms > 0 ? (+fd.pad.rooms) * p('pad_install_room') : 0));
  s.others = fd.others.reduce((a,o)=>a + (+o.amount || 0), 0);
  s.extra = (fd.extra||[]).reduce((a,it)=> a + extraLineTotal(it), 0);
  return s;
}
function calcTotal(fd, p, data){
  const s = calcSections(fd, p, data);
  return Math.round(Object.values(s).reduce((a,b)=>a+b,0) * 100) / 100;
}

/* =====================================================================
   АВТОРИЗАЦИЯ
   ===================================================================== */
async function initAuth(){
  dlog('start:', HAS_SB ? 'режим Supabase, ' + (CFG.SUPABASE_URL||'').replace('https://','') : 'демо-режим (localStorage)');
  if (HAS_SB && !window.supabase) throw new Error('supabase-js не загрузился (CDN). Проверьте интернет и обновите страницу.');
  if (!HAS_SB){
    const saved = localStorage.getItem(LS_SESSION);
    state.data = loadLocal() || seedDemoData(); saveLocal();
    if (saved){
      const u = state.data.profiles.find(p => p.id === saved);
      if (u){ state.user = u; state.screen = 'home'; }
    }
    return;
  }
  state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const { data: { session } } = await state.sb.auth.getSession();
  if (session){ try{ await afterSbLogin(session); }catch(e){ dlog('⛔ afterSbLogin(init):', e); } }
  state.sb.auth.onAuthStateChange((ev, s) => {
    dlog('auth: событие', ev);
    if (!s && state.user){ state.user = null; state.screen = 'login'; render(); }
    else if (s && !state.user && !loginInFlight){
      afterSbLogin(s).then(()=>{ render(); checkPickupBanner(true); }).catch(e => dlog('⛔ onAuthStateChange:', e));
    }
  });
}
let loginInFlight = false;
async function afterSbLogin(session){
  if (loginInFlight) return;
  loginInFlight = true;
  try {
    dlog('auth: afterSbLogin, загружаю профиль…');
    let prof = null;
    try {
      const r = await state.sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (r.error) dlog('⛔ профиль:', r.error);
      prof = r.data;
    } catch(e){ dlog('⛔ профиль exception:', e); }
    const md = session.user.user_metadata || {};
    state.user = prof || {
      id: session.user.id,
      login: md.login || String(session.user.email||'').split('@')[0],
      display_name: md.display_name || md.login || String(session.user.email||'').split('@')[0],
      role: 'tech'
    };
    state.data = loadLocal() || emptyData();
    state.screen = 'home';
    if (!state.selDate){ state.selDate = todayISO(); state.weekStart = mondayOf(state.selDate); }
    await syncNow(true);
  } finally {
    loginInFlight = false;
  }
}
function demoLogin(id){
  const u = state.data.profiles.find(p => p.id === id);
  if (!u) return;
  state.user = u; localStorage.setItem(LS_SESSION, id);
  state.screen = 'home'; state.selDate = todayISO(); state.weekStart = mondayOf(state.selDate);
  render(); checkPickupBanner(true);
}
const LOGIN_RE = /^[a-z0-9_.-]{3,32}$/;
const AUTH_DOMAIN = (CFG.AUTH_EMAIL_DOMAIN || 'techlog.example.com').replace(/^@/,'');
function loginToEmail(login){ return login + '@' + AUTH_DOMAIN; }
async function sbSignIn(login, pass){
  login = String(login||'').trim().toLowerCase();
  if (!LOGIN_RE.test(login)){ toast(t('login_hint'), 'err'); return; }
  dlog('auth: вход', login, '→', loginToEmail(login));
  const { data, error } = await state.sb.auth.signInWithPassword({ email: loginToEmail(login), password: pass });
  if (error){ dlog('⛔ auth.signIn:', error); toast(error.message, 'err'); return; }
  dlog('auth: вход ок, uid', data.session?.user?.id);
  try{ await afterSbLogin(data.session); }catch(e){ dlog('⛔ afterSbLogin:', e); }
  render(); checkPickupBanner(true);
}
async function sbSignUp(login, pass, name, invite){
  login = String(login||'').trim().toLowerCase();
  if (!LOGIN_RE.test(login)){ toast(t('login_hint'), 'err'); return; }
  if (!name || !pass){ toast(t('login_taken_or_err'), 'err'); return; }
  // серверная предпроверка: логин-формат, код приглашения, занятость логина — одной RPC
  dlog('auth: регистрация', login, '→', loginToEmail(login), '· signup_precheck…');
  let prechecked = false;
  try{
    const { data: st, error: e0 } = await state.sb.rpc('signup_precheck', { p_login: login, p_invite: String(invite||'') });
    dlog('auth: signup_precheck →', st, e0 ? e0 : '');
    if (!e0){
      prechecked = true;
      if (st === 'LOGIN_TAKEN'){ toast('⛔ ' + t('login_taken'), 'err'); setLoginStatus('taken'); return; }
      if (st === 'BAD_INVITE'){ toast('⛔ ' + t('invite_bad'), 'err'); return; }
      if (st === 'BAD_LOGIN'){ toast('⛔ ' + t('login_hint'), 'err'); return; }
      if (st !== 'OK'){ toast('⛔ ' + t('invite_check_err') + ': ' + st, 'err'); return; }
    } else if (!/PGRST202|schema cache|find the function/i.test(errStr(e0))){
      toast('⛔ ' + t('invite_check_err') + ': ' + errStr(e0), 'err'); return;
    } else dlog('signup_precheck отсутствует — ' + t('run_new_schema') + '; использую check_invite');
  }catch(e){ dlog('⛔ signup_precheck exception:', e); }
  if (!prechecked){
    try{
      const { data: ok, error: e1 } = await state.sb.rpc('check_invite', { code: String(invite||'') });
      dlog('auth: check_invite →', ok === true ? 'true' : ok === false ? 'false' : ok, e1 ? e1 : '');
      if (e1){
        const s = errStr(e1);
        const noFn = /PGRST202|schema cache|does not exist|find the function/i.test(s);
        toast('⛔ ' + (noFn ? t('srv_not_ready') : t('invite_check_err') + ': ' + s), 'err');
        return;
      }
      if (!ok){ toast('⛔ ' + t('invite_bad'), 'err'); return; }
    }catch(e){ dlog('⛔ check_invite exception:', e); toast('⛔ ' + t('invite_check_err') + ': ' + errStr(e), 'err'); return; }
  }
  const { data, error } = await state.sb.auth.signUp({
    email: loginToEmail(login), password: pass,
    options: { data: { display_name: name, login, invite: String(invite||'') } }
  });
  if (error){
    dlog('⛔ auth.signUp:', error);
    const msg = /database error/i.test(error.message) ? (prechecked ? t('srv500') : t('srv_rejected'))
              : /already/i.test(error.message) ? t('login_taken')
              : error.message;
    toast('⛔ ' + msg, 'err'); return;
  }
  dlog('auth: signUp ок, session:', data.session ? 'есть' : 'нет (нужно подтверждение?)');
  if (data.session){
    dlog('auth: регистрация успешна —', login);
    toast('✅ ' + t('reg_ok') + '! ' + t('welcome') + ', ' + shortName(name) + ' 👋');
    try{ await afterSbLogin(data.session); }catch(e){ dlog('⛔ afterSbLogin:', e); }
    render(); checkPickupBanner(true);
  } else {
    toast('✅ ' + t('reg_now_signin') + ' · ✉️ ' + t('confirm_email'), 'inf');
    App.authMode(false);
    const li = document.getElementById('li-login'); if (li) li.value = login;
    document.getElementById('li-pass')?.focus();
  }
}
function logout(){
  dictStop();
  if (HAS_SB && state.sb) state.sb.auth.signOut();
  localStorage.removeItem(LS_SESSION);
  state.user = null; state.screen = 'login'; render();
}

/* =====================================================================
   ВЫБОРКИ
   ===================================================================== */
function cpById(id){ return state.data.counterparties.find(c=>c.id===id); }
function cxById(id){ return state.data.complexes.find(c=>c.id===id); }
function wtById(id){ return state.data.work_types.find(c=>c.id===id); }
function etById(id){ return state.data.equipment_types.find(c=>c.id===id); }
function profName(id){ const p = state.data.profiles.find(x=>x.id===id); return p ? p.display_name : '—'; }

function hiddenSetFor(uid){
  return new Set((state.data.hidden_staff || []).filter(h => h.manager_id === uid).map(h => h.tech_id));
}
function scopeFilter(list, techKey){
  // tech: только свои; manager: все, кроме скрытых админом; admin: все
  if (state.user.role === 'tech') return list.filter(x => x[techKey] === state.user.id);
  if (state.user.role === 'manager'){
    const hid = hiddenSetFor(state.user.id);
    return list.filter(x => x[techKey] === state.user.id || !hid.has(x[techKey]));
  }
  return list;
}
function visibleJobs(){
  let js = scopeFilter(state.data.jobs, 'technician_id');
  if (!isManager() || state.filterMine) js = js.filter(j => j.technician_id === state.user.id);
  return js;
}
function visiblePlacements(){
  let ps = scopeFilter(state.data.placements, 'technician_id');
  if (!isManager() || state.filterMine) ps = ps.filter(p => p.technician_id === state.user.id);
  return ps;
}
function jobSortCmp(a, b){
  return (b.priority?1:0) - (a.priority?1:0)
      || (a.sort_order||0) - (b.sort_order||0)
      || String(a.created_at||'').localeCompare(String(b.created_at||''));
}
function canReorder(j){ return j && (isAdmin() || j.technician_id === state.user.id); }
function jobsOn(dateISO){ return visibleJobs().filter(j => j.date === dateISO).sort(jobSortCmp); }
function pickupsOn(dateISO){
  const today = todayISO();
  return visiblePlacements().filter(p => !p.picked_up && (p.due_date === dateISO || (dateISO === today && p.due_date < today)))
    .concat(visiblePlacements().filter(p => p.picked_up && p.picked_up_at && p.picked_up_at.slice(0,10) === dateISO));
}
function myDueCount(){
  if (!state.data) return { due: 0, over: 0 };
  const today = todayISO();
  const mine = state.data.placements.filter(p => p.technician_id === state.user.id && !p.picked_up);
  return { due: mine.filter(p=>p.due_date===today).length, over: mine.filter(p=>p.due_date<today).length };
}
function checkPickupBanner(withToast){
  const { due, over } = myDueCount();
  if (withToast && (due+over) > 0) toast('🔔 ' + t('banner_pickups') + ': ' + (due+over), 'inf');
}

/* =====================================================================
   РЕНДЕР: каркас
   ===================================================================== */
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  dirs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z"/><path d="M11 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.4a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.4h4l.4-2.4a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  q: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 1 1 3.7 2.5c-.8.35-1.1.9-1.1 1.8"/><path d="M12 17h.01"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 14h8M8 17.5h5"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M21 4v5h-5M3 20v-5h5"/></svg>',
};

function render(){
  const app = $('#app');
  if (!state.user){ app.innerHTML = viewLogin(); return; }
  if (!state.data) state.data = loadLocal() || (HAS_SB ? emptyData() : seedDemoData());
  if (!state.selDate){ state.selDate = todayISO(); state.weekStart = mondayOf(state.selDate); }
  let body = '';
  if (state.screen === 'report') state.screen = 'reports'; // алиас старого экрана
  if (state.screen === 'home') body = viewHome();
  else if (state.screen === 'job') body = viewJob();
  else if (state.screen === 'map') body = viewMap();
  else if (state.screen === 'reports') body = viewReports();
  else if (state.screen === 'stats') body = viewStats();
  else if (state.screen === 'dirs') body = viewDirs();
  else if (state.screen === 'settings') body = viewSettings();
  app.innerHTML = viewHeader() + body + viewTabbar();
  if (state.screen === 'home'){
    try { document.querySelector('.day-cell.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch(e){}
  }
  if (state.screen === 'job') bindJobForm();
  if (state.screen === 'map') initMapView();
}

function viewHeader(){
  const u = state.user;
  const org = (state.data && state.data.org_settings) || {};
  return `
  <div class="topbar">
    <div class="logo"><span>TL</span></div>
    <div class="brand">
      <div class="name">Tech<b>Log</b></div>
      <div class="sub">by ${esc(org.company_short || 'APC')} · ${t('app_sub')} · v${APP_VERSION}</div>
    </div>
    <button class="icon-btn ${state.syncing?'spin':''}" onclick="App.sync()" title="${t('sync')}" aria-label="${t('sync')}">${ICONS.sync}</button>
    <div class="avatar-wrap">
      <button class="avatar role-${u.role}" onclick="App.go('settings')" aria-label="${t('settings')}">${esc(initials(u.display_name))}</button>
      <div class="login-pill">${esc(u.login)}</div>
    </div>
  </div>`;
}

/* Подпись внизу каждой страницы */
function viewFooter(){
  const y = new Date().getFullYear();
  return `<div class="app-footer ${state.user ? '' : 'nofix'}">
    TechLog · Powered by Abraziv<br>
    ${t('footer_rights')}<br>
    ${y} · ${t('footer_city')}
  </div>`;
}

function viewTabbar(){
  const items = [
    ['home', ICONS.home, t('tab_home')],
    ['map', ICONS.map, t('tab_map')],
    ['reports', ICONS.pdf, t('tab_reports')],
    ['stats', ICONS.stats, t('tab_stats')],
    ['dirs', ICONS.dirs, t('tab_dirs')],
    ['faq', ICONS.q, t('tab_faq')],
    ['settings', ICONS.gear, t('tab_settings')],
  ];
  return `<nav class="tabbar">` + items.map(([id, ic, label]) => id === 'faq'
    ? `<button class="tab" onclick="App.faq()">${ic}<span>${label}</span></button>`
    : `<button class="tab ${state.screen===id || (id==='home'&&state.screen==='job') ? 'active':''}" onclick="App.go('${id}')">
      ${ic}<span>${label}</span>
    </button>`).join('') + `</nav>`;
}

/* ---------------- Неделя ПН–ПТ ---------------- */
function viewWeek(){
  const days = [];
  const today = todayISO();
  for (let i=0;i<7;i++){
    const iso = addDaysISO(state.weekStart, i);
    const d = parseISO(iso);
    const dayJobs = jobsOn(iso);
    const jobDots = dayJobs.slice(0,4).map(j => wtById(j.work_type_id)?.color || '#888');
    const hasPk = pickupsOn(iso).some(p=>!p.picked_up);
    if (hasPk) jobDots.unshift('#8AA0AB');
    const hasIssue = dayJobs.some(j => jobIssues(j).length);
    days.push(`
      <button class="day-cell ${state.selDate===iso?'sel':''} ${iso===today?'today':''} ${i>=5?'wknd':''}" onclick="App.selDay('${iso}')">
        ${hasIssue ? warnIcon(true) : ''}
        <div class="dow">${t('week_days')[i]}</div>
        <div class="dom">${d.getDate()}</div>
        <div class="mon">${t('months')[d.getMonth()]}</div>
        <div class="dot-row">${jobDots.slice(0,4).map(c=>`<span class="dot" style="background:${c}"></span>`).join('')}</div>
      </button>`);
  }
  return `
  <div class="week">
    <button class="wk-arrow" onclick="App.shiftWeek(-1)" aria-label="prev week">‹</button>
    <div class="week-days" id="week-days">${days.join('')}</div>
    <button class="wk-arrow" onclick="App.shiftWeek(1)" aria-label="next week">›</button>
  </div>
  ${state.selDate!==today ? `<button class="today-jump" onclick="App.jumpToday()">⌂ ${t('back_today')}</button>` : ''}`;
}

/* =====================================================================
   ЭКРАН: ГЛАВНАЯ (день: работы + пикапы)
   ===================================================================== */
function triHtml(on, jobId, canEdit){
  if (!on && !canEdit) return '';
  const cls = 'pri' + (on ? ' on' : '');
  return canEdit
    ? `<button class="${cls}" title="${t('priority')}" onclick="event.stopPropagation();App.togglePriority('${jobId}')"><span class="tri">!</span></button>`
    : `<span class="${cls}"><span class="tri">!</span></span>`;
}
function railHtml(j){
  const can = canReorder(j);
  return `<div class="rail" onclick="event.stopPropagation()">
    ${triHtml(!!j.priority, j.id, can)}
    ${can ? `<button class="mv" title="${t('move_up')}" onclick="App.moveJob('${j.id}',-1)">▲</button>
             <button class="mv" title="${t('move_down')}" onclick="App.moveJob('${j.id}',1)">▼</button>` : ''}
  </div>`;
}
function eqDotsFor(list){
  const agg = {};
  list.forEach(p => { agg[p.equipment_type_id] = (agg[p.equipment_type_id]||0) + (+p.qty||0); });
  return Object.entries(agg).map(([etId, n]) => {
    const et = etById(etId) || { color:'#888', abbr:'?' };
    return `<span class="eq-dot" style="background:${et.color};color:${textColorFor(et.color)}" title="${esc(et.name||et.abbr)}">${n}</span>`;
  }).join('');
}

/* ---------- Сквозная нумерация строк дня ----------
   Порядок как на главном экране: сначала пикапы (в порядке показа), затем работы,
   забранные пикапы продолжают счёт. Эти же номера показываются на карте дня. */
function dayNumbering(iso){
  const jobs = jobsOn(iso);
  const pkAll = pickupsOn(iso);
  const pkOpen = pkAll.filter(p=>!p.picked_up);
  const pkDone = pkAll.filter(p=>p.picked_up);
  const groups = {};
  pkOpen.forEach(p => { (groups[p.job_id] = groups[p.job_id] || []).push(p); });
  const pkGroups = Object.entries(groups).sort((a,b) => jobSortCmp(
    state.data.jobs.find(x=>x.id===a[0]) || {sort_order:999},
    state.data.jobs.find(x=>x.id===b[0]) || {sort_order:999}));
  let n = 0;
  const pkNum = {}, jobNum = {};
  pkGroups.forEach(([jobId]) => { pkNum[jobId] = ++n; });
  jobs.forEach(j => { jobNum[j.id] = ++n; });
  return { jobs, pkGroups, pkDone, pkNum, jobNum, count: n };
}
function rowNumHtml(n){ return `<span class="row-num">${n}</span>`; }

function viewHome(){
  const iso = state.selDate;
  const today = todayISO();
  const num = dayNumbering(iso);
  const { jobs, pkGroups, pkDone } = num;
  const { due, over } = myDueCount();

  const banner = (due+over) > 0 ? `
    <div class="banner ${over?'b-red':''}" role="status">🔔
      <div>${t('banner_pickups')}: <b>${due}</b>${over?` · ${t('banner_overdue')}: <b>${over}</b>`:''}</div>
    </div>` : '';

  const filter = isManager() ? `
    <div class="lang-seg" style="margin-bottom:10px">
      <button class="${state.filterMine?'on':''}" onclick="App.setMine(true)">${t('mine')}</button>
      <button class="${!state.filterMine?'on':''}" onclick="App.setMine(false)">${t('all')}</button>
    </div>` : '';

  const pkHtml = pkGroups.map(([jobId, list]) => {
    const p0 = list[0];
    const cx = cxById(p0.complex_id) || {abbr:'?', name:'?', address:''};
    const overdue = p0.due_date < today;
    const pkJob = state.data.jobs.find(x=>x.id===jobId) || { id: jobId, priority:false, technician_id: p0.technician_id, sort_order: 999 };
    return `
    <div class="item" style="border-left-color:${pkJob.priority ? 'var(--red)' : '#8AA0AB'}">
      ${railHtml(pkJob)}
      ${rowNumHtml(num.pkNum[jobId])}
      <div class="abbr">${esc(cx.abbr||cx.name.slice(0,3).toUpperCase())}</div>
      <div class="info">
        <div class="t">${esc(cx.name)} · Unit ${esc(p0.unit_number||'')}</div>
        <div class="s">${esc(cx.address||'')}</div>
        <div class="s">${t('pickup')} · ${t('due')}: ${fmtDMY(p0.due_date)} ${overdue?`<span class="chip bad">${t('overdue')}</span>`:''} ${!state.filterMine?'· '+esc(profName(p0.technician_id)):''}</div>
        ${(state.data.jobs.find(x=>x.id===jobId)||{}).note ? `<div class="s note-line">📝 ${esc((state.data.jobs.find(x=>x.id===jobId)||{}).note)}</div>` : ''}
      </div>
      <div class="right">
        <div class="eq-dots">${eqDotsFor(list)}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-ghost sm" title="${t('navigate')}" onclick="App.navToCx('${p0.complex_id}')">🧭</button>
          <button class="btn btn-ghost sm" title="${t('note')}" onclick="App.noteModal('${jobId}')">📝</button>
          <button class="btn btn-green sm" onclick="App.pickupGroup('${jobId}','${iso}')">${t('pick_up')}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const pkDoneHtml = pkDone.length ? (() => {
    const g = {}; pkDone.forEach(p => (g[p.job_id] = g[p.job_id]||[]).push(p));
    return Object.values(g).map((list, di) => {
      const p0 = list[0]; const cx = cxById(p0.complex_id) || {abbr:'?',name:'?'};
      return `<div class="item" style="border-left-color:#3a4a52;opacity:.6">
        ${rowNumHtml(num.count + di + 1)}
        <div class="abbr">${esc(cx.abbr)}</div>
        <div class="info"><div class="t">${esc(cx.name)} · Unit ${esc(p0.unit_number||'')}</div>
        <div class="s">✓ ${t('picked')}</div></div>
        <div class="eq-dots">${eqDotsFor(list)}</div>
      </div>`;
    }).join('');
  })() : '';

  const jobsHtml = jobs.map(j => {
    const wt = wtById(j.work_type_id) || { color:'#888', name:'?' };
    const cx = cxById(j.complex_id) || { abbr:'?', name:'?', address:'' };
    const total = (j.status==='approved' && j.approved_total != null) ? j.approved_total : j.total;
    return `
    <div class="item clicky" style="border-left-color:${wt.color}" onclick="App.openJob('${j.id}')">
      ${railHtml(j)}
      ${rowNumHtml(num.jobNum[j.id])}
      <div class="abbr" style="border-color:${wt.color}">${esc(cx.abbr||'—')}</div>
      <div class="info">
        <div class="t">${esc(cx.name)} · Unit ${esc(j.unit_number||'—')}</div>
        <div class="s">${esc(cx.address||'')}</div>
        <div class="s"><span style="color:${wt.color};font-weight:800">${esc(wt.name)}</span>${!state.filterMine?' · '+esc(j.technician_name||profName(j.technician_id)):''}</div>
      </div>
      <div class="right">
        <span class="badge-status st-${j.status}">${jobIssues(j).length ? warnIcon() : ''}${t('status_'+j.status)}</span>
        <div class="money" style="margin-top:6px">${money(total)}</div>
      </div>
    </div>`;
  }).join('');

  const empty = (!jobs.length && !pkGroups.length && !pkDone.length)
    ? `<div class="list-empty"><div class="big">🦉</div>${t('no_items')}<br><span class="tiny">${t('tap_add')}</span></div>` : '';

  const dayBar = `
    <div class="day-bar">
      <b>${fmtDMY(iso)}</b>
      <button class="mini-nav" onclick="App.openDayMap()">🗺 ${t('map_of_day')}</button>
    </div>`;
  return banner + viewWeek() + dayBar + homeStatsHtml() + filter
    + (pkGroups.length ? `<div class="section-title">${t('pickups_today')} <span class="hint">${fmtDM(iso)}</span></div>` + pkHtml : '')
    + (jobs.length ? `<div class="section-title">${t('jobs')}</div>` + jobsHtml : '')
    + pkDoneHtml + empty
    + `<button class="btn btn-green" style="margin-top:12px" onclick="App.addTaskModal()">＋ ${t('add_task')}</button>
       <button class="fab" onclick="App.addTaskModal()" aria-label="${t('add_task')}">＋</button>`;
}

/* =====================================================================
   МОДАЛКИ
   ===================================================================== */
function openModal(html){
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = 'overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
}
function closeModal(){ $('#overlay')?.remove(); maybeApplyPendingUpdate(); }
function modalHead(title){ return `<h3><button class="back-x" onclick="App.closeModal()">←</button> ${esc(title)}</h3>`; }

/* ---------- Добавить задание ---------- */
function addTaskModal(){
  const cps = state.data.counterparties;
  const wts = [...state.data.work_types].sort((a,b)=>(a.sort||0)-(b.sort||0));
  openModal(`
    ${modalHead(t('add_task'))}
    <div class="form-row"><span class="lbl">${t('date')}</span>
      <input type="date" id="nt-date" value="${state.selDate}"></div>
    <div class="form-row"><span class="lbl">${t('counterparty')}</span>
      <select id="nt-cp" onchange="App.ntCpChange()">
        <option value="">${t('select')}</option>
        ${cps.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}
      </select></div>
    <div class="form-row"><span class="lbl">${t('complex')}</span>
      <select id="nt-cx"><option value="">${t('select')}</option></select></div>
    <div class="form-row"><span class="lbl">${t('unit')}</span>
      <input id="nt-unit" inputmode="numeric" placeholder="916"></div>
    <div class="form-row"><span class="lbl">${t('work_type')}</span>
      <div class="opt-grid" id="nt-wt">
        ${wts.map(w=>`<button class="opt" data-id="${w.id}" style="border-color:${w.color};color:${w.color}"
          onclick="App.ntPickWt(this)">${esc(w.name)}</button>`).join('')}
      </div></div>
    <button class="btn btn-green" onclick="App.createTask()">${t('create')}</button>
  `);
}
function ntCpChange(){
  const cpId = $('#nt-cp').value;
  const list = state.data.complexes.filter(c=>c.counterparty_id===cpId);
  $('#nt-cx').innerHTML = `<option value="">${t('select')}</option>` +
    list.map(c=>`<option value="${c.id}">${esc(c.name)} (${esc(c.abbr||'')})</option>`).join('');
}
let ntWt = null;
function ntPickWt(btn){
  ntWt = btn.dataset.id;
  // сброс всех кнопок: не только фон, но и цвет текста, иначе после
  // повторных нажатий текст оставался тёмным и «исчезал» на тёмном фоне
  btn.parentElement.querySelectorAll('.opt').forEach(b=>{
    const w0 = wtById(b.dataset.id);
    b.style.background = '';
    b.style.color = w0 ? w0.color : '';
  });
  const w = wtById(ntWt);
  btn.style.background = w.color; btn.style.color = textColorFor(w.color);
}
async function createTask(){
  const date = $('#nt-date').value || state.selDate;
  const cpId = $('#nt-cp').value, cxId = $('#nt-cx').value;
  const unit = $('#nt-unit').value.trim();
  const missing = [];
  if (!cpId) missing.push(t('counterparty'));
  if (!cxId) missing.push(t('complex'));
  if (!ntWt) missing.push(t('work_type'));
  if (missing.length){ toast('⚠ ' + t('not_selected') + ': ' + missing.join(', '), 'err'); return; }
  const job = {
    id: uid(), date, counterparty_id: cpId, complex_id: cxId, unit_number: unit,
    work_type_id: ntWt, technician_id: state.user.id, technician_name: shortName(state.user.display_name), helper_ids: [], priority: false, sort_order: jobsOn(date).length,
    priority: false, sort_order: 1, status: 'draft', note: '', form_data: emptyFormData(), total: 0,
    approved_total: null, approved_by: null, approved_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  await dbUpsert('jobs', job);
  ntWt = null; closeModal();
  state.selDate = date; state.weekStart = mondayOf(date);
  toast('✓ ' + t('created'));
  App.openJob(job.id);
}

/* ---------- Пикап: забрать группу ---------- */
async function pickupGroup(jobId){
  if (!confirm(t('pickup_confirm'))) return;
  const now = new Date().toISOString();
  const list = state.data.placements.filter(p => p.job_id === jobId && !p.picked_up)
    .filter(p => isManager() || p.technician_id === state.user.id);
  for (const p of list){
    const upd = { ...p, picked_up: true, picked_up_at: now, picked_up_by: state.user.id };
    await dbUpsert('placements', upd);
  }
  navigator.vibrate?.([30,40,30]);
  toast('✓ ' + t('picked')); render();
}

/* =====================================================================
   ЭКРАН: ЛОГИН
   ===================================================================== */
function viewLogin(){
  if (!HAS_SB){
    const users = (state.data?.profiles) || [];
    return `<div class="login-wrap">
      <div class="logo"><span>TL</span></div>
      <div class="hello">TechLog</div>
      <div class="tiny">${t('app_sub')} ${APP_VERSION}</div>
      <hr class="sep">
      <div class="note-green" style="text-align:left;margin-bottom:12px">🧪 ${t('demo_note')}</div>
      ${users.map(u=>`
        <button class="demo-user" onclick="App.demoLogin('${u.id}')">
          <span class="avatar role-${u.role}">${esc(initials(u.display_name))}</span>
          <span class="grow" style="flex:1">
            <div style="font-weight:900">${esc(u.display_name)}</div>
            <div class="tiny">@${esc(u.login)}</div>
          </span>
          <span class="role-tag rt-${u.role}">${t('role_'+u.role)}</span>
        </button>`).join('')}
      <div class="tiny" style="margin-top:14px">Supabase: см. config.js и README</div>
      <button class="btn btn-ghost" style="margin-top:14px" onclick="App.diag()">🩺 ${t('diag')}</button>
    </div>`;
  }
  return `<div class="login-wrap">
    <div class="logo"><span>TL</span></div>
    <div class="hello">${t('login_title')}</div>
    <div class="tiny">${t('app_sub')} ${APP_VERSION}</div>
    <hr class="sep">
    <div id="auth-signin">
      <div class="form-row"><input id="li-login" placeholder="${t('login')}" autocomplete="username" autocapitalize="none"
          autofocus enterkeyhint="go" onkeydown="App.enterKey(event,'in')"></div>
      <div class="form-row"><input id="li-pass" type="password" placeholder="${t('password')}" autocomplete="current-password"
          enterkeyhint="go" onkeydown="App.enterKey(event,'in')"></div>
      <button class="btn btn-green" onclick="App.signIn()">${t('sign_in')}</button>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="App.authMode(true)">${t('no_acc')}</button>
    </div>
    <div id="auth-signup" style="display:none">
      <div class="form-row"><input id="su-name" placeholder="${t('display_name')}"
          enterkeyhint="go" onkeydown="App.enterKey(event,'up')"></div>
      <div class="form-row"><input id="su-login" placeholder="${t('login')}" autocomplete="username" autocapitalize="none"
          onblur="App.loginCheck()" oninput="App.loginTyped()" enterkeyhint="go" onkeydown="App.enterKey(event,'up')">
        <div class="tiny" id="su-login-st">${t('login_hint')}</div></div>
      <div class="form-row"><input id="su-pass" type="password" placeholder="${t('password')}" autocomplete="new-password"
          onfocus="App.loginCheck()" enterkeyhint="go" onkeydown="App.enterKey(event,'up')"></div>
      <div class="form-row"><input id="su-invite" placeholder="${t('invite_code')}" autocapitalize="characters"
          enterkeyhint="go" onkeydown="App.enterKey(event,'up')"></div>
      <button class="btn btn-blue" onclick="App.signUp()">${t('sign_up')}</button>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="App.authMode(false)">${t('have_acc')}</button>
    </div>
    <button class="btn btn-ghost" style="margin-top:14px" onclick="App.diag()">🩺 ${t('diag')}</button>
    <button id="pwa-install-btn" class="btn btn-blue" style="${pwaPrompt?'':'display:none'};margin-top:8px" onclick="App.installPwa()">⬇ ${t('install_app')}</button>
  </div>`;
}

/* =====================================================================
   ЭКРАН: ФОРМА РАБОТЫ (цифровой инвойс)
   ===================================================================== */
let jobDraft = null; // рабочая копия

function openJob(id){
  const j = state.data.jobs.find(x=>x.id===id);
  if (!j) return;
  if (!isManager() && j.technician_id !== state.user.id){ toast(t('no_access'), 'err'); return; }
  jobDraft = JSON.parse(JSON.stringify(j));
  try{
    const saved = JSON.parse(localStorage.getItem('techlog_draft')||'null');
    if (saved && saved.id === j.id && saved.ts > (Date.parse(j.updated_at||0)||0)){
      jobDraft = saved.draft; toast('♻ ' + t('draft_restored'), 'inf');
    }
  }catch(e){}
  // мердж на случай новых полей формы
  jobDraft.form_data = Object.assign(emptyFormData(), jobDraft.form_data || {});
  jobDraft.helper_ids = jobDraft.helper_ids || [];
  state.screen = 'job'; state.jobId = id; render();
  window.scrollTo(0,0);
}

function chk(section, key, label, extra){
  const fd = jobDraft.form_data;
  const on = section === 'root' ? !!fd[key] : !!fd[section][key];
  return `<label class="opt ${on?'on':''}"><input type="checkbox" data-s="${section}" data-k="${key}" ${on?'checked':''}> ${esc(label)}${extra||''}</label>`;
}
function stepperHtml(id, val, min){
  return `<span class="stepper" data-st="${id}">
    <button type="button" data-act="-">−</button><span class="val">${val}</span><button type="button" data-act="+">＋</button>
  </span>`;
}

function viewJob(){
  const j = jobDraft;
  const fd = j.form_data;
  const cp = cpById(j.counterparty_id) || {name:'—'};
  const cx = cxById(j.complex_id) || {name:'—', address:'', abbr:''};
  const wt = wtById(j.work_type_id) || {color:'#888', name:'—', aux_ids:[]};
  const p = priceResolver(j.counterparty_id);
  const sec = calcSections(fd, p);
  const total = calcTotal(fd, p);
  const isApproved = j.status === 'approved';
  const auxList = (wt.needs_aux && (wt.aux_ids||[]).length)
    ? (wt.aux_ids||[]).map(id => state.data.aux_equipment.find(a=>a.id===id)).filter(Boolean) : [];
  const auxTake = fd.aux_take || {};
  /* Доп. оборудование теперь опционально: не обязательное требование,
     а чек-лист — техник отмечает, что реально нужно взять на этот выезд */
  const aux = auxList.length ? `
    <div class="note-green" style="display:block">
      <div style="font-weight:900;margin-bottom:6px">🧰 ${t('aux_needed')} <span class="tiny" style="font-weight:400">· ${t('aux_take_hint')}</span></div>
      <div class="opt-grid">${auxList.map(a=>`
        <button type="button" class="opt ${auxTake[a.id]?'on':''}" data-aux="${a.id}"
          onclick="App.auxToggle('${a.id}')"><span class="aux-mk">${auxTake[a.id]?'✅':'⬜'}</span> ${esc(a.name)}</button>`).join('')}
      </div>
    </div>` : '';

  const amt = (v) => v > 0 ? `<span class="amt">${money(v)}</span>` : '<span class="amt" style="color:var(--dim-2)">—</span>';

  const eqRows = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0)).map(et => {
    const e = fd.equipment[et.id] || { qty:0, days:3 };
    const line = (+e.qty||0) * Math.max(1,+e.days||1) * eqDayPrice(et,p);
    return `<div class="qty-line eq-line">
      <span class="icon-circle" style="background:${et.color};color:${textColorFor(et.color)}" title="${esc(et.name)}">${esc(et.abbr)}</span>
      <span class="eq-name" title="${esc(et.name)} · ${money(eqDayPrice(et,p))}/${t('days')}">
        <b class="nm">${esc(et.name)}</b>
        <span class="pr">${money(eqDayPrice(et,p))}/${t('days')}</span>
      </span>
      ${stepperHtml('eq-q-'+et.id, e.qty||0)}
      <span class="tiny eq-x">×</span>
      ${stepperHtml('eq-d-'+et.id, e.days||3)}
      <span class="tiny eq-dlbl">${t('days')}</span>
      <span class="money eq-sum" data-eqline="${et.id}">${line>0?money(line):'—'}</span>
    </div>`;
  }).join('');

  return `
  <button class="back-top" onclick="App.go('home')">← ${t('back')}</button>
  <div class="card" style="border-left:6px solid ${wt.color}">
    <div style="display:flex;gap:10px;align-items:center">
      <div class="abbr" style="border-color:${wt.color}">${esc(cx.abbr||'—')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:900">${j.complex_id?'':warnIcon()}${esc(cx.name)} · Unit
          <input id="jb-unit" value="${esc(j.unit_number||'')}" style="width:76px;display:inline-block;padding:4px 8px">
          <span id="jb-warn-unit">${String(j.unit_number||'').trim()?'':warnIcon()}</span></div>
        <div class="tiny">${esc(cp.name)} · ${esc(cx.address||'')}
          ${(cx.lat!=null||cx.address)?`<button class="mini-nav" onclick="App.navToCx('${j.complex_id}')">🧭 ${t('navigate')}</button>`:''}</div>
        ${(cx.access_code||cx.callbox_code)?`<div class="tiny">${codeLineHtml(cx, true)}</div>`:''}
        <div class="tiny" style="color:${wt.color};font-weight:800">${esc(wt.name)}</div>
      </div>
      <span class="badge-status st-${j.status}">${t('status_'+j.status)}</span>
    </div>
    <div class="grid-2" style="margin-top:10px">
      <div class="form-row"><span class="lbl">${t('date')}</span><input type="date" id="jb-date" value="${j.date}"></div>
      <div class="form-row"><span class="lbl">Vacant / Occupied</span>
        <div class="opt-grid">
          ${chk('root','vacant','Vacant')}
          ${chk('root','occupied','Occupied')}
        </div></div>
    </div>
    <div class="crew-box">
      <div class="tiny" style="font-weight:900;margin-bottom:6px">${(j.technician_id||(j.helper_ids||[]).length)?'':warnIcon()}👷 ${t('crew')}</div>
      <div class="crew-chips" id="crew-chips">${crewChipsHtml(j)}</div>
      <div class="crew-add">
        <select id="crew-sel" onchange="App.crewAdd(this.value)">
          <option value="">${t('add_helper')}</option>
          ${state.data.profiles.filter(p=>p.id!==j.technician_id && !(j.helper_ids||[]).includes(p.id))
            .map(p=>`<option value="${p.id}">${esc(shortName(p.display_name))} (${t('role_'+p.role)})</option>`).join('')}
        </select>
        <button class="btn btn-ghost sm" onclick="App.crewAll()">${t('all_staff')}</button>
      </div>
    </div>
    ${aux}
  </div>

  <div class="inv-sec"><div class="inv-head">🧼 Steam Clean ${amtWrap('steam',sec.steam)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('steam','deep_scrub','Deep Scrub')} ${chk('steam','rotovac','Rotovac')}
      <span class="qty-line"><span class="tiny">Rooms</span>${stepperHtml('steam-rooms', fd.steam.rooms||1)}</span>
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">🧽 Removals ${amtWrap('removals',sec.removals)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('removals','red_stain','Red Stain')} ${chk('removals','wax','Wax')} ${chk('removals','rust','Rust')}
      ${chk('removals','ink','Ink')} ${chk('removals','gum','Gum')} ${chk('removals','paint','Paint Removal')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">🔧 Repairs ${amtWrap('repairs',sec.repairs)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('repairs','threshold','Threshold')} ${chk('repairs','stretch','Stretch')}
      ${chk('repairs','seam','Seam')} ${chk('repairs','patch','Patch')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">🎨 Dye ${amtWrap('dye',sec.dye)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('dye','spot','Spot Dye')} ${chk('dye','full','Full Dye')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">📦 Other ${amtWrap('other',sec.other)}</div>
    <div class="inv-body">
      <div class="opt-grid">${chk('other','trash_out','Trash Out')} ${chk('other','pad_removal','Pad Removal')} ${chk('other','all_unit','All Unit')}</div>
      <div class="qty-line"><span class="tiny">Rooms</span>${stepperHtml('other-rooms', fd.other.rooms||1)}</div>
    </div></div>

  <div class="inv-sec"><div class="inv-head">💨 Fog / GOC ${amtWrap('fog',sec.fog)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('fog','fog','Fog')} ${chk('fog','goc','GOC')} ${chk('fog','pet','Pet')}
      ${chk('fog','smoke','Smoke')} ${chk('fog','deodorizer','Deodorizer')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">🧪 Treatments ${amtWrap('treatments',sec.treatments)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('treatments','sealant','Sealant')} ${chk('treatments','mold','Mold & Mildew')} ${chk('treatments','degreaser','Degreaser')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">💧 Wet Vac / Flood ${amtWrap('wetvac',sec.wetvac)}</div>
    <div class="inv-body">
      <div class="opt-grid">${chk('wetvac','wet_vac','Wet Vac')} ${chk('wetvac','flood','Flood')}
        ${chk('wetvac','sewer','Sewer')} ${chk('wetvac','fresh','Fresh Water')}</div>
      <div class="opt-grid">
        ${['ktc','lr','dr','hall','brs','all'].map(k=>{
          const lbl = {ktc:'Ktc',lr:'Lr',dr:'Dr',hall:'Hall',brs:"Br's",all:'All Unit'}[k];
          const on = !!fd.wetvac.areas[k];
          return `<label class="opt ${on?'on':''}"><input type="checkbox" data-area="${k}" ${on?'checked':''}> ${lbl}</label>`;
        }).join('')}
      </div>
    </div></div>

  <div class="inv-sec"><div class="inv-head">🌀 Air Duct / Dryer Vent ${amtWrap('airduct',sec.airduct)}</div>
    <div class="inv-body">
      <div class="opt-grid">${chk('airduct','air_duct','Air Duct Cleaning')} ${chk('airduct','dryer_vent','Dryer Vent Cleaning')}</div>
      <div class="qty-line"><span class="tiny">Bedrooms</span>${stepperHtml('ad-bedrooms', fd.airduct.bedrooms||1)}
        <input id="jb-adnote" placeholder="note…" value="${esc(fd.airduct.note||'')}" style="flex:1"></div>
    </div></div>

  <div class="inv-sec"><div class="inv-head">🛠 Equipment Rental ${amtWrap('equipment',sec.equipment)}</div>
    <div class="inv-body">
      <div class="tiny">${t('equipment')}</div>
      ${eqRows}
    </div></div>

  <div class="inv-sec"><div class="inv-head">🧵 Pad Installation ${amtWrap('pad',sec.pad)}</div>
    <div class="inv-body">
      <div class="opt-grid">
        ${['q14','q12','q34','roll'].map(s=>{
          const lbl = {q14:'1/4',q12:'1/2',q34:'3/4',roll:'1 Roll'}[s];
          return `<label class="opt ${fd.pad.size===s?'on':''}"><input type="radio" name="padsize" data-pad="${s}" ${fd.pad.size===s?'checked':''}> ${lbl}</label>`;
        }).join('')}
        <label class="opt ${fd.pad.size===null?'on':''}"><input type="radio" name="padsize" data-pad="" ${fd.pad.size===null?'checked':''}> —</label>
        ${chk('pad','all_unit','All Unit')}
      </div>
      <div class="qty-line"><span class="tiny">Rooms</span>${stepperHtml('pad-rooms', fd.pad.rooms||0)}</div>
    </div></div>

  <div class="inv-sec"><div class="inv-head">✍️ Other services ${amtWrap('others',sec.others)}</div>
    <div class="inv-body">
      ${fd.others.map((o,i)=>`
        <div class="qty-line">
          <input data-oth-d="${i}" placeholder="${t('desc')}…" value="${esc(o.desc)}" style="flex:1">
          <input data-oth-a="${i}" inputmode="decimal" placeholder="$" value="${o.amount||''}" class="price-input">
        </div>`).join('')}
    </div></div>

  <div class="inv-sec"><div class="inv-head">📝 ${t('note')} · ${t('extra_section')} ${amtWrap('extra',sec.extra)}</div>
    <div class="inv-body">
      ${dictationHTML('jb-note', j.note || '')}
      <div class="tiny">${t('note_hint')}</div>
      <div id="extra-list">${(jobDraft.form_data.extra||[]).length ? extraListHtml() : ''}</div>
      <button class="btn btn-blue sm" onclick="App.extraPicker()">＋ ${t('template')}</button>
    </div></div>

  <label class="opt ${j.status!=='draft'?'on':''}" style="margin:4px 0 8px">
    <input type="checkbox" id="jb-done" ${j.status!=='draft'?'checked':''}> ${t('job_done_chk')}
  </label>

  ${isAdmin() ? `
  <div class="card" style="border-color:var(--yellow)">
    <div style="font-weight:900;margin-bottom:6px">⭐ ${t('approve')}</div>
    <div class="qty-line">
      <span class="name">${t('approved_total')}</span>
      <input id="jb-approved" class="price-input" inputmode="decimal" value="${j.approved_total ?? total}">
      <button class="btn btn-blue sm" onclick="App.approveJob()">${isApproved ? '↻' : '✓'} ${t('approve')}</button>
    </div>
    ${isApproved ? `<div class="tiny">✓ ${t('approved_by')}: ${esc(profName(j.approved_by))} · ${j.approved_at ? j.approved_at.slice(0,16).replace('T',' ') : ''}</div>` : ''}
    <div class="tiny">${t('approve_reset_note')}</div>
  </div>` : (isApproved ? `<div class="note-green">✓ ${t('status_approved')}: ${esc(profName(j.approved_by))} — ${money(j.approved_total ?? total)}</div>` : '')}

  <div class="total-bar"><span>${t('total')}</span><span class="sum" id="jb-total">${money(total)}</span></div>

  <button class="btn btn-green" onclick="App.saveJob()">💾 ${t('save')}</button>
  <div class="btn-row3">
    <button class="btn btn-blue" onclick="App.makePdf()">⬇ ${t('pdf')}</button>
    <button class="btn btn-ghost" onclick="App.go('home')">← ${t('back')}</button>
    ${(isAdmin() || j.technician_id===state.user.id)
      ? `<button class="btn btn-red" onclick="App.deleteJob()">🗑 ${t('delete')}</button>`
      : `<span></span>`}
  </div>
  `;
}
function amtWrap(id, v){ return `<span class="amt" data-amt="${id}">${v>0?money(v):'—'}</span>`; }

/* --- биндинг формы (изменения без полного ререндера, чтобы не терять фокус) --- */
let jobFormBound = false;
function bindJobForm(){
  if (jobFormBound) return;
  jobFormBound = true;
  const root = $('#app');
  const fd = () => jobDraft.form_data;

  root.addEventListener('change', (e) => {
    if (state.screen !== 'job' || !jobDraft) return;
    const el = e.target;
    if (el.matches('[data-s][data-k]')){
      const s = el.dataset.s, k = el.dataset.k;
      if (s === 'root') fd()[k] = el.checked; else fd()[s][k] = el.checked;
      el.closest('.opt')?.classList.toggle('on', el.checked);
      recalcJob();
    } else if (el.matches('[data-area]')){
      fd().wetvac.areas[el.dataset.area] = el.checked;
      el.closest('.opt')?.classList.toggle('on', el.checked);
      recalcJob();
    } else if (el.matches('[data-pad]')){
      fd().pad.size = el.dataset.pad || null;
      root.querySelectorAll('[data-pad]').forEach(r=>r.closest('.opt').classList.toggle('on', r.checked));
      recalcJob();
    } else if (el.id === 'jb-date'){ jobDraft.date = el.value; }
    else if (el.id === 'jb-unit'){ jobDraft.unit_number = el.value.trim(); }
    else if (el.id === 'jb-adnote'){ fd().airduct.note = el.value; }
    else if (el.id === 'jb-note'){ jobDraft.note = el.value; }
    else if (el.matches('[data-oth-d]')){ fd().others[+el.dataset.othD].desc = el.value; }
    else if (el.matches('[data-oth-a]')){ fd().others[+el.dataset.othA].amount = parseFloat(el.value)||0; recalcJob(); }
    else if (el.matches('[data-ex-qty]')){ const it=fd().extra[+el.dataset.exQty]; it.qty = Math.max(1, parseInt(el.value)||1); recalcJob(); }
    else if (el.matches('[data-ex-price]')){ const it=fd().extra[+el.dataset.exPrice]; it.price = parseFloat(el.value)||0; recalcJob(); }
    else if (el.matches('[data-ex-prod]')){
      const it = fd().extra[+el.dataset.exProd];
      const pt = ptById(el.value);
      it.product_id = el.value || null;
      it.product_name = pt ? pt.name : '';
      if (pt && (!it.price || +it.price === 0)){
        it.price = +pt.default_price || 0;
        const pr = document.querySelector('[data-ex-price="'+el.dataset.exProd+'"]');
        if (pr) pr.value = it.price || '';
      }
      recalcJob();
    }
    autosaveDraft();
  });

  root.addEventListener('input', (e) => {
    if (state.screen !== 'job' || !jobDraft) return;
    if (e.target.id === 'jb-note') jobDraft.note = e.target.value;
    if (e.target.id === 'jb-unit'){
      jobDraft.unit_number = e.target.value.trim();
      const w = $('#jb-warn-unit'); if (w) w.innerHTML = jobDraft.unit_number ? '' : warnIcon();
    }
    autosaveDraft();
  });

  root.addEventListener('click', (e) => {
    if (state.screen !== 'job' || !jobDraft) return;
    const b = e.target.closest('.stepper button');
    if (!b) return;
    const st = b.closest('.stepper'); const id = st.dataset.st;
    const valEl = st.querySelector('.val');
    let v = parseInt(valEl.textContent)||0;
    v += (b.dataset.act === '+' ? 1 : -1);
    const min = /^(eq-q|pad-rooms)/.test(id) ? 0 : 1;
    v = Math.max(min, v);
    valEl.textContent = v;
    if (id === 'steam-rooms') fd().steam.rooms = v;
    else if (id === 'other-rooms') fd().other.rooms = v;
    else if (id === 'ad-bedrooms') fd().airduct.bedrooms = v;
    else if (id === 'pad-rooms') fd().pad.rooms = v;
    else if (id.startsWith('exa-') || id.startsWith('exb-')){
      const idx = +id.slice(4);
      const it = fd().extra[idx]; if (!it) return;
      if (id.startsWith('exa-')) it.size_a = v; else it.size_b = v;
      it.size_value = exSizeVal(it);
      const szEl = document.querySelector('[data-exsz="'+idx+'"]'); if (szEl) szEl.textContent = it.size_value;
      recalcJob(); autosaveDraft();
      return;
    }
    else if (id.startsWith('eq-q-') || id.startsWith('eq-d-')){
      const etId = id.slice(5);
      const cur = fd().equipment[etId] || { qty:0, days:3 };
      if (id.startsWith('eq-q-')) cur.qty = v; else cur.days = Math.max(1, v);
      fd().equipment[etId] = cur;
      if (id.startsWith('eq-d-')) valEl.textContent = cur.days;
    }
    recalcJob(); autosaveDraft();
  });
}

function recalcJob(){
  const p = priceResolver(jobDraft.counterparty_id);
  const sec = calcSections(jobDraft.form_data, p);
  Object.entries(sec).forEach(([id,v]) => {
    const el = document.querySelector(`[data-amt="${id}"]`);
    if (el) el.textContent = v>0 ? money(v) : '—';
  });
  state.data.equipment_types.forEach(et => {
    const e = jobDraft.form_data.equipment[et.id];
    const line = e ? (+e.qty||0)*Math.max(1,+e.days||1)*eqDayPrice(et,p) : 0;
    const el = document.querySelector(`[data-eqline="${et.id}"]`);
    if (el) el.textContent = line>0 ? money(line) : '—';
  });
  (jobDraft.form_data.extra||[]).forEach((it, i) => {
    const el = document.querySelector('[data-exline="'+i+'"]');
    if (el){ const v = extraLineTotal(it); el.textContent = v>0 ? money(v) : '—'; }
  });
  const total = calcTotal(jobDraft.form_data, p);
  const tEl = $('#jb-total'); if (tEl) tEl.textContent = money(total);
  return total;
}

async function saveJob(goHome){
  dictStop();
  const j = jobDraft;
  const orig = state.data.jobs.find(x=>x.id===j.id);
  const p = priceResolver(j.counterparty_id);
  j.total = calcTotal(j.form_data, p);
  const doneChk = $('#jb-done');
  if (doneChk){
    if (orig.status === 'approved'){
      // апрув снимается при изменении итоговой стоимости не-админом
      if (!isAdmin() && j.total !== orig.total){
        j.status = 'done'; j.approved_total = null; j.approved_by = null; j.approved_at = null;
        toast(t('approve_reset_note'), 'inf');
      } else { j.status = 'approved'; }
      if (!doneChk.checked) j.status = 'draft';
    } else {
      j.status = doneChk.checked ? 'done' : 'draft';
    }
  }
  j.technician_name = techNamesFor(j);
  j.updated_at = new Date().toISOString();
  localStorage.removeItem('techlog_draft');
  navigator.vibrate?.(30);
  await dbUpsert('jobs', JSON.parse(JSON.stringify(j)));
  await syncPlacementsForJob(j);
  toast('✓ ' + t('saved'));
  if (goHome !== false){ state.screen = 'home'; state.selDate = j.date; state.weekStart = mondayOf(j.date); }
  render();
  maybeApplyPendingUpdate();
}

/* Пикапы из секции Equipment Rental: qty>0 → размещение с due=дата+дни */
async function syncPlacementsForJob(j){
  const existing = state.data.placements.filter(p => p.job_id === j.id);
  const want = Object.entries(j.form_data.equipment).filter(([,e]) => (+e.qty||0) > 0);
  for (const [etId, e] of want){
    const days = Math.max(1, +e.days || 3);
    const found = existing.find(p => p.equipment_type_id === etId);
    const row = {
      id: found ? found.id : uid(), job_id: j.id, equipment_type_id: etId,
      qty: +e.qty, days, placed_date: j.date, due_date: addDaysISO(j.date, days),
      picked_up: found ? found.picked_up : false,
      picked_up_at: found ? found.picked_up_at : null,
      picked_up_by: found ? found.picked_up_by : null,
      technician_id: j.technician_id,
      complex_id: j.complex_id, counterparty_id: j.counterparty_id, unit_number: j.unit_number
    };
    await dbUpsert('placements', row);
  }
  for (const p of existing){
    if (!want.find(([etId]) => etId === p.equipment_type_id)) await dbDelete('placements', p.id);
  }
}

async function approveJob(){
  const j = jobDraft;
  const val = parseFloat($('#jb-approved').value);
  j.approved_total = isNaN(val) ? calcTotal(j.form_data, priceResolver(j.counterparty_id)) : val;
  j.status = 'approved';
  j.approved_by = state.user.id;
  j.approved_at = new Date().toISOString();
  const chkEl = $('#jb-done'); if (chkEl) chkEl.checked = true;
  await saveJob(false);
}

async function deleteJob(){
  if (!confirm(t('confirm_del'))) return;
  localStorage.removeItem('techlog_draft');
  const id = jobDraft.id;
  for (const p of state.data.placements.filter(p=>p.job_id===id)) await dbDelete('placements', p.id);
  await dbDelete('jobs', id);
  state.screen = 'home'; toast('🗑 ' + t('deleted')); render();
}

/* =====================================================================
   ЭКРАН: ОТЧЁТ ПО ПИКАПАМ (менеджер/админ)
   ===================================================================== */
function reportRows(dateISO){
  const today = todayISO();
  const rows = scopeFilter(state.data.placements, 'technician_id').filter(p => !p.picked_up && (p.due_date === dateISO || (dateISO >= today && p.due_date < today)));
  const byCx = {};
  rows.forEach(p => { (byCx[p.complex_id] = byCx[p.complex_id] || []).push(p); });
  return byCx;
}
function viewPickupsReport(){
  if (!isManager()) return `<div class="list-empty">${t('no_access')}</div>`;
  if (!state.reportDate) state.reportDate = todayISO();
  const dateISO = state.reportDate;
  const byCx = reportRows(dateISO);
  const totalAgg = {};
  let cnt = 0;
  const blocks = Object.entries(byCx).map(([cxId, list]) => {
    const cx = cxById(cxId) || {name:'?', abbr:'?', address:'', access_code:''};
    const byJob = {};
    list.forEach(p => { (byJob[p.job_id] = byJob[p.job_id] || []).push(p); cnt += +p.qty||0; totalAgg[p.equipment_type_id] = (totalAgg[p.equipment_type_id]||0) + (+p.qty||0); });
    return `<div class="card gray">
      <div style="display:flex;gap:10px;align-items:center">
        <div class="abbr">${esc(cx.abbr)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:900">${esc(cx.name)}</div>
          <div class="tiny">${esc(cx.address||'')} · ${codeLineHtml(cx, true)}</div>
        </div>
        <button class="btn btn-ghost sm" onclick="App.navToCx('${cxId}')">🧭</button>
      </div>
      ${Object.values(byJob).map(jl => {
        const p0 = jl[0];
        const over = p0.due_date < todayISO();
        return `<div class="rowline">
          <div class="grow">Unit <b>${esc(p0.unit_number||'—')}</b>
            <span class="tiny">· ${esc(profName(p0.technician_id))} · ${t('due')}: ${fmtDMY(p0.due_date)}</span>
            ${over?`<span class="chip bad">${t('overdue')}</span>`:''}</div>
          <div class="eq-dots">${eqDotsFor(jl)}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  const totals = Object.entries(totalAgg).map(([etId,n]) => {
    const et = etById(etId) || {abbr:'?', color:'#888'};
    return `<span class="chip" style="border-color:${et.color};color:${et.color}">${esc(et.abbr)} × ${n}</span>`;
  }).join(' ');

  const quick = [0,1,2,7].map(n => {
    const iso = addDaysISO(todayISO(), n);
    const lbl = n===0 ? t('today') : '+' + n;
    return `<button class="tabbtn ${dateISO===iso?'active':''}" onclick="App.setReportDate('${iso}')">${lbl}</button>`;
  }).join('');

  return `
  <div class="section-title">${t('report_title')}</div>
  <div class="card">
    <div class="form-row"><span class="lbl">${t('report_date')}</span>
      <input type="date" value="${dateISO}" onchange="App.setReportDate(this.value)"></div>
    <div class="tabs">${quick}</div>
    <div class="tiny">${dateISO>=todayISO() ? t('incl_overdue') : ''}</div>
  </div>
  ${blocks || `<div class="list-empty"><div class="big">📭</div>${t('nothing_due')}</div>`}
  ${cnt ? `<div class="card"><div style="font-weight:900;margin-bottom:6px">Σ ${t('stats_due')}: ${cnt}</div><div class="color-dots" style="gap:6px">${totals}</div></div>
  <button class="btn btn-blue" onclick="App.copyReport()">📋 ${t('copy_report')}</button>` : ''}`;
}
function copyReport(){
  const dateISO = state.reportDate;
  const byCx = reportRows(dateISO);
  let txt = `PICKUP REPORT — ${fmtDMY(dateISO)} (TechLog v${APP_VERSION})\n`;
  Object.entries(byCx).forEach(([cxId, list]) => {
    const cx = cxById(cxId) || {name:'?'};
    txt += `\n${cx.name}${cx.abbr?' ('+cx.abbr+')':''} — ${cx.address||''}${cx.access_code?' · code '+cx.access_code:''}\n`;
    const byJob = {}; list.forEach(p => (byJob[p.job_id]=byJob[p.job_id]||[]).push(p));
    Object.values(byJob).forEach(jl => {
      const p0 = jl[0];
      const eq = jl.map(p => `${p.qty}×${(etById(p.equipment_type_id)||{}).abbr||'?'}`).join(', ');
      txt += `  Unit ${p0.unit_number||'—'}: ${eq} — ${profName(p0.technician_id)} (due ${fmtDMY(p0.due_date)})\n`;
    });
  });
  navigator.clipboard?.writeText(txt).then(()=>toast('✓ ' + t('copied'))).catch(()=>toast(txt.slice(0,80)+'…','inf'));
}

/* =====================================================================
   ЭКРАН: СПРАВОЧНИКИ
   ===================================================================== */
function viewDirs(){
  const tabs = [
    ['staff', t('d_staff'), isAdmin()],
    ['counterparties', t('d_counterparties'), isAdmin()],
    ['complexes', t('d_complexes'), true],
    ['worktypes', t('d_worktypes'), isAdmin()],
    ['equipment', t('d_equipment'), isAdmin()],
    ['aux', t('d_aux'), isAdmin()],
    ['extraworks', t('d_extraworks'), isAdmin()],
    ['sizes', t('d_sizes'), isAdmin()],
    ['products', t('d_products'), isAdmin()],
    ['price', t('d_price'), true],
  ].filter(x=>x[2]);
  if (!tabs.find(x=>x[0]===state.dirTab)) state.dirTab = tabs[0][0];
  const nav = `<div class="tabs">` + tabs.map(([id,l]) =>
    `<button class="tabbtn ${state.dirTab===id?'active':''}" onclick="App.dirTab('${id}')">${l}</button>`).join('') + `</div>`;
  const body = { staff: dirStaff, counterparties: dirCounterparties, complexes: dirComplexes, worktypes: dirWorkTypes,
                 equipment: dirEquipment, aux: dirAux, price: dirPrice,
                 extraworks: dirExtraWorks, sizes: dirSizes, products: dirProducts }[state.dirTab]();
  return `<div class="section-title">${t('dirs')}</div>` + nav + body;
}

function dirCounterparties(){
  const list = state.data.counterparties;
  return `<div class="card">` + (list.map(c => `
    <div class="rowline">
      <div class="abbr" style="min-width:44px;height:38px">${esc(c.abbr||initials(c.name))}</div>
      <div class="grow"><b>${esc(c.name)}</b>
        <div class="tiny">${state.data.complexes.filter(x=>x.counterparty_id===c.id).length} ${t('d_complexes').toLowerCase()}</div></div>
      <button class="btn btn-ghost sm" onclick="App.openCp('${c.id}')">${t('edit')}</button>
    </div>`).join('') || `<div class="list-empty">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editCpModal()">＋ ${t('add')}</button>`;
}

function dirComplexes(){
  const canEdit = isManager();
  const inbox = codeRequestsHtml();
  const byCp = {};
  state.data.complexes.forEach(cx => (byCp[cx.counterparty_id]=byCp[cx.counterparty_id]||[]).push(cx));
  const blocks = state.data.counterparties.map(cp => `
    <div class="card">
      <div style="font-weight:900;margin-bottom:4px">${esc(cp.name)}</div>
      ${(byCp[cp.id]||[]).map(cx => `
        <div class="rowline">
          <div class="abbr" style="min-width:44px;height:38px">${esc(cx.abbr||'—')}</div>
          <div class="grow"><b>${esc(cx.name)}</b>
            <div class="tiny">${esc(cx.address||'')}</div>
            <div class="tiny">${codeLineHtml(cx, true)}
              ${(()=>{ const m=lastCodeMeta(cx.id); return m?` · <span style="color:var(--dim-2)">${t('last_code_upd')} ${fmtDMY(String(m.date).slice(0,10))}</span>`:''; })()}</div></div>
          <button class="btn btn-ghost sm" title="${t('history')}" onclick="App.codeHistory('${cx.id}')">📖</button>
          ${canEdit
            ? `<button class="btn btn-ghost sm" onclick="App.editCxModal('${cx.id}')">${t('edit')}</button>`
            : `<button class="btn btn-ghost sm" title="${t('propose_code')}" onclick="App.proposeCode('${cx.id}')">🔑</button>`}
        </div>`).join('') || `<div class="tiny">—</div>`}
    </div>`).join('');
  return inbox + blocks + (canEdit ? `<button class="btn btn-green" onclick="App.editCxModal()">＋ ${t('add')}</button>` : '');
}

function colorPicker(cur, inputId){
  return `<div class="color-dots" id="${inputId}">
    ${PALETTE.map(c=>`<button type="button" class="cdot ${c===cur?'sel':''}" data-c="${c}" style="background:${c}"
      onclick="App.pickColor('${inputId}','${c}')"></button>`).join('')}
  </div><input type="hidden" id="${inputId}-v" value="${cur||PALETTE[0]}">`;
}

function dirWorkTypes(){
  const list = [...state.data.work_types].sort((a,b)=>(a.sort||0)-(b.sort||0));
  return `<div class="card">` + list.map(w => `
    <div class="rowline">
      <span class="icon-circle" style="background:${w.color};color:${textColorFor(w.color)}">●</span>
      <div class="grow"><b style="color:${w.color}">${esc(w.name)}</b>
        ${w.needs_aux?`<div class="tiny">🧰 ${(w.aux_ids||[]).map(id=>esc((state.data.aux_equipment.find(a=>a.id===id)||{}).name||'')).join(' · ')}</div>`:''}</div>
      <button class="btn btn-ghost sm" onclick="App.editWtModal('${w.id}')">${t('edit')}</button>
    </div>`).join('') + `</div>
    <button class="btn btn-green" onclick="App.editWtModal()">＋ ${t('add')}</button>`;
}

function dirEquipment(){
  const list = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0));
  const p = (key)=>{ const r = state.data.price_list.find(x=>x.key===key); return r ? r.price : 0; };
  return `<div class="card">` + list.map(e => `
    <div class="rowline">
      <span class="icon-circle" style="background:${e.color};color:${textColorFor(e.color)}">${esc(e.abbr)}</span>
      <div class="grow"><b>${esc(e.name)}</b><div class="tiny">${money(p(e.price_key))}/${t('days')}</div></div>
      <button class="btn btn-ghost sm" onclick="App.editEtModal('${e.id}')">${t('edit')}</button>
    </div>`).join('') + `</div>
    <button class="btn btn-green" onclick="App.editEtModal()">＋ ${t('add')}</button>`;
}

function dirAux(){
  return `<div class="card">` + state.data.aux_equipment.map(a => `
    <div class="rowline"><div class="grow">🧰 ${esc(a.name)}</div>
      <button class="btn btn-ghost sm" onclick="App.editAuxModal('${a.id}')">${t('edit')}</button>
    </div>`).join('') + `</div>
    <button class="btn btn-green" onclick="App.editAuxModal()">＋ ${t('add')}</button>`;
}

function dirPrice(){
  const canEdit = isAdmin();
  return `<div class="card">
    <div style="font-weight:900;margin-bottom:6px">💲 ${t('price_list')} — ${t('std_price')}</div>
    ${state.data.price_list.map(pr => `
      <div class="rowline">
        <div class="grow">${esc(pr.name)}<div class="tiny">${esc(pr.unit_label||'')}</div></div>
        ${canEdit
          ? `<input class="price-input" inputmode="decimal" value="${pr.price}" onchange="App.setStdPrice('${pr.id}', this.value)">`
          : `<span class="money">${money(pr.price)}</span>`}
      </div>`).join('')}
  </div>`;
}

/* ---------- Модалки-редакторы справочников ---------- */
function editCpModal(id){
  const c = id ? cpById(id) : { id: uid(), name:'', abbr:'', notes:'' };
  openModal(`
    ${modalHead(t('counterparty'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="cp-name" value="${esc(c.name)}"></div>
    <div class="form-row"><span class="lbl">${t('abbr')}</span><input id="cp-abbr" maxlength="4" value="${esc(c.abbr||'')}"></div>
    <button class="btn btn-green" onclick="App.saveCp('${c.id}', ${!!id})">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('counterparties','${c.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveCp(id, existed){
  const row = { id, name: $('#cp-name').value.trim(), abbr: $('#cp-abbr').value.trim().toUpperCase(), notes:'' };
  if (!row.name) return;
  await dbUpsert('counterparties', row);
  if (!existed){
    // авто-копия стандартного прайса (все цены стандартные, custom=false)
    for (const pr of state.data.price_list){
      await dbUpsert('counterparty_prices', { id: uid(), counterparty_id: id, key: pr.key, custom: false, price: pr.price });
    }
  }
  closeModal(); toast('✓ ' + t('saved')); render();
}

/* Карточка контрагента: Инфо | Цены | Комплексы */
function openCp(id){ state.cpOpenId = id; state.cpTab = 'prices'; renderCpModal(); }
function renderCpModal(){
  const c = cpById(state.cpOpenId); if (!c) return;
  const tab = state.cpTab;
  const tabs = [['info',t('info')],['prices',t('prices')],['complexes',t('d_complexes')]];
  let body = '';
  if (tab === 'info'){
    body = `
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="cp-name" value="${esc(c.name)}"></div>
    <div class="form-row"><span class="lbl">${t('abbr')}</span><input id="cp-abbr" maxlength="4" value="${esc(c.abbr||'')}"></div>
    <button class="btn btn-green" onclick="App.saveCp('${c.id}', true)">${t('save')}</button>
    <button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('counterparties','${c.id}')">${t('delete')}</button>`;
  } else if (tab === 'prices'){
    const rows = state.data.price_list.map(pr => {
      let cpp = state.data.counterparty_prices.find(x => x.counterparty_id===c.id && x.key===pr.key);
      const custom = cpp?.custom || false;
      const val = custom ? cpp.price : pr.price;
      return `<div class="rowline">
        <div class="grow" style="font-size:.82rem">${esc(pr.name)}
          <div class="tiny">${t('std_price')}: ${money(pr.price)}</div></div>
        <input type="checkbox" ${custom?'checked':''} title="${t('custom_price')}"
          onchange="App.cpCustomToggle('${c.id}','${pr.key}', this.checked)">
        <input class="price-input" inputmode="decimal" value="${val}" ${custom?'':'disabled'}
          data-cpprice="${pr.key}" onchange="App.cpSetPrice('${c.id}','${pr.key}', this.value)">
      </div>`;
    }).join('');
    body = `<div class="tiny" style="margin-bottom:6px">☑ = ${t('custom_price')}</div>${rows}`;
  } else {
    const list = state.data.complexes.filter(x=>x.counterparty_id===c.id);
    body = list.map(cx=>`
      <div class="rowline">
        <div class="abbr" style="min-width:44px;height:38px">${esc(cx.abbr||'—')}</div>
        <div class="grow"><b>${esc(cx.name)}</b><div class="tiny">${esc(cx.address||'')} ${cx.access_code?'· 🔑 '+esc(cx.access_code):''}</div></div>
        <button class="btn btn-ghost sm" onclick="App.editCxModal('${cx.id}','${c.id}')">${t('edit')}</button>
      </div>`).join('') || `<div class="tiny">—</div>`;
    body += `<button class="btn btn-green" style="margin-top:10px" onclick="App.editCxModal(null,'${c.id}')">＋ ${t('add')}</button>`;
  }
  openModal(`
    ${modalHead(c.name)}
    <div class="tabs">${tabs.map(([id,l])=>`<button class="tabbtn ${tab===id?'active':''}" onclick="App.cpTab('${id}')">${l}</button>`).join('')}</div>
    ${body}
  `);
}
async function cpCustomToggle(cpId, key, on){
  let row = state.data.counterparty_prices.find(x=>x.counterparty_id===cpId && x.key===key);
  const std = state.data.price_list.find(x=>x.key===key);
  if (!row) row = { id: uid(), counterparty_id: cpId, key, custom: on, price: std ? std.price : 0 };
  else row = { ...row, custom: on, price: on ? row.price : (std ? std.price : row.price) };
  await dbUpsert('counterparty_prices', row);
  renderCpModal();
}
async function cpSetPrice(cpId, key, v){
  let row = state.data.counterparty_prices.find(x=>x.counterparty_id===cpId && x.key===key);
  if (!row) return;
  await dbUpsert('counterparty_prices', { ...row, price: parseFloat(v)||0, custom: true });
}

function editCxModal(id, cpId){
  const cx = id ? cxById(id) : { id: uid(), counterparty_id: cpId || state.data.counterparties[0]?.id || '', name:'', abbr:'', address:'', access_code:'' };
  openModal(`
    ${modalHead(t('complex'))}
    <div class="form-row"><span class="lbl">${t('counterparty')}</span>
      <select id="cx-cp">${state.data.counterparties.map(c=>`<option value="${c.id}" ${c.id===cx.counterparty_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="cx-name" value="${esc(cx.name)}"></div>
    <div class="form-row"><span class="lbl">${t('abbr')}</span><input id="cx-abbr" maxlength="4" value="${esc(cx.abbr||'')}"></div>
    <div class="form-row"><span class="lbl">${t('address')}</span><input id="cx-addr" value="${esc(cx.address||'')}"></div>
    <div class="form-row"><span class="lbl">${t('access_code')}</span><input id="cx-code" value="${esc(cx.access_code||'')}">
      ${firstSeenLine(cx.id,'access',cx.access_code)}</div>
    <div class="form-row"><span class="lbl">${t('callbox')}</span><input id="cx-callbox" value="${esc(cx.callbox_code||'')}">
      ${firstSeenLine(cx.id,'callbox',cx.callbox_code)}</div>
    <div class="form-row"><span class="lbl">${t('code_target')}</span>
      <div class="tabs">
        <button class="tabbtn ${!cx.callbox_gate?'active':''}" data-gate="0" onclick="App.pcGate(this)">📟 ${t('target_callbox')}</button>
        <button class="tabbtn ${cx.callbox_gate?'active':''}" data-gate="1" onclick="App.pcGate(this)">🚧 ${t('target_gate')}</button>
      </div>
      <input type="hidden" id="pc-gate" value="${cx.callbox_gate?1:0}"></div>
    ${(()=>{ const m=lastCodeMeta(cx.id); return m?`<div class="tiny" style="margin:-4px 0 8px">📖 ${t('last_code_upd')}: ${fmtDMY(String(m.date).slice(0,10))} · ${esc(profName(m.by))}</div>`:''; })()}
    <button class="btn btn-ghost sm" style="margin-bottom:10px" onclick="App.codeHistory('${cx.id}')">📖 ${t('history')}</button>
    <div class="grid-2">
      <div class="form-row"><span class="lbl">${t('lat')}</span><input id="cx-lat" inputmode="decimal" value="${cx.lat ?? ''}" placeholder="33.78"></div>
      <div class="form-row"><span class="lbl">${t('lng')}</span><input id="cx-lng" inputmode="decimal" value="${cx.lng ?? ''}" placeholder="-84.38"></div>
    </div>
    <div class="grid-2" style="margin-bottom:10px">
      <button class="btn btn-blue sm" onclick="App.geocodeCx()">📍 ${t('geocode')}</button>
      <button class="btn btn-ghost sm" onclick="App.gmapsCx()">🗺 ${t('open_gmaps')}</button>
    </div>
    <button class="btn btn-green" onclick="App.saveCx('${cx.id}')">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('complexes','${cx.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveCx(id){
  const latV = parseFloat($('#cx-lat').value), lngV = parseFloat($('#cx-lng').value);
  const old = cxById(id) || {};
  const access = $('#cx-code').value.trim();
  const callbox = $('#cx-callbox').value.trim();
  const gate = $('#pc-gate').value === '1';
  const row = { id, counterparty_id: $('#cx-cp').value, name: $('#cx-name').value.trim(),
    abbr: $('#cx-abbr').value.trim().toUpperCase(), address: $('#cx-addr').value.trim(),
    access_code: old.access_code || '', callbox_code: old.callbox_code || '', callbox_gate: !!old.callbox_gate,
    lat: isNaN(latV) ? null : latV, lng: isNaN(lngV) ? null : lngV };
  if (!row.name) return;
  const codesChanged = access !== (old.access_code||'') || callbox !== (old.callbox_code||'') || gate !== !!old.callbox_gate;
  if (isAdmin()){
    row.access_code = access; row.callbox_code = callbox; row.callbox_gate = gate;
    await dbUpsert('complexes', row);
    if (codesChanged){
      const cx = cxById(id);
      // история пишется через общий механизм (old уже перезаписан — используем old-значения)
      const now = new Date().toISOString();
      if (access !== (old.access_code||''))
        await dbUpsert('complex_code_history', { id: uid(), complex_id: id, field:'access', old_value: old.access_code||'', new_value: access, gate: null, changed_by: state.user.id, changed_at: now, source:'direct' });
      if (callbox !== (old.callbox_code||'') || gate !== !!old.callbox_gate)
        await dbUpsert('complex_code_history', { id: uid(), complex_id: id, field:'callbox', old_value: old.callbox_code||'', new_value: callbox, gate, changed_by: state.user.id, changed_at: now, source:'direct' });
    }
  } else {
    await dbUpsert('complexes', row); // менеджер: обычные поля сразу
    if (codesChanged){
      await dbUpsert('code_requests', { id: uid(), complex_id: id,
        access_code: access !== (old.access_code||'') ? access : null,
        callbox_code: callbox !== (old.callbox_code||'') ? callbox : null,
        callbox_gate: gate !== !!old.callbox_gate ? gate : null,
        requested_by: state.user.id, requested_at: new Date().toISOString(),
        status: 'pending', decided_by: null, decided_at: null });
      toast('📨 ' + t('request_sent'));
      dlog('codes: заявка (из редактора) от', state.user.login);
    }
  }
  closeModal(); toast('✓ ' + t('saved')); render();
}

function editWtModal(id){
  const w = id ? wtById(id) : { id: uid(), name:'', color: PALETTE[0], needs_aux: false, aux_ids: [], sort: state.data.work_types.length+1 };
  openModal(`
    ${modalHead(t('work_type'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="wt-name" value="${esc(w.name)}"></div>
    <div class="form-row"><span class="lbl">${t('color')}</span>${colorPicker(w.color,'wt-color')}</div>
    <label class="opt" style="margin-bottom:8px"><input type="checkbox" id="wt-aux" ${w.needs_aux?'checked':''}> ${t('needs_aux')}</label>
    <div class="form-row"><span class="lbl">${t('d_aux')}</span>
      <div class="opt-grid">${state.data.aux_equipment.map(a=>`
        <label class="opt ${(w.aux_ids||[]).includes(a.id)?'on':''}"><input type="checkbox" data-wtaux="${a.id}" ${(w.aux_ids||[]).includes(a.id)?'checked':''}> ${esc(a.name)}</label>`).join('')}
      </div></div>
    <button class="btn btn-green" onclick="App.saveWt('${w.id}', ${w.sort||0})">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('work_types','${w.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveWt(id, sort){
  const aux_ids = [...document.querySelectorAll('[data-wtaux]:checked')].map(x=>x.dataset.wtaux);
  const row = { id, name: $('#wt-name').value.trim(), color: $('#wt-color-v').value,
    needs_aux: $('#wt-aux').checked, aux_ids, sort };
  if (!row.name) return;
  await dbUpsert('work_types', row); closeModal(); toast('✓ ' + t('saved')); render();
}

function editEtModal(id){
  const e = id ? etById(id) : { id: uid(), name:'', abbr:'', color: PALETTE[1], price_key:'', sort: state.data.equipment_types.length+1 };
  const priceRow = state.data.price_list.find(x=>x.key===e.price_key);
  openModal(`
    ${modalHead(t('d_equipment'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="et-name" value="${esc(e.name)}"></div>
    <div class="form-row"><span class="lbl">${t('abbr')} (3)</span><input id="et-abbr" maxlength="3" value="${esc(e.abbr)}"></div>
    <div class="form-row"><span class="lbl">${t('color')}</span>${colorPicker(e.color,'et-color')}</div>
    <div class="form-row"><span class="lbl">${t('day_price')}</span><input id="et-price" inputmode="decimal" value="${priceRow?priceRow.price:30}"></div>
    <button class="btn btn-green" onclick="App.saveEt('${e.id}', ${e.sort||0})">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('equipment_types','${e.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveEt(id, sort){
  const abbr = $('#et-abbr').value.trim().toUpperCase();
  const name = $('#et-name').value.trim();
  if (!name || !abbr) return;
  const key = 'eq_' + abbr.toLowerCase();
  const row = { id, name, abbr, color: $('#et-color-v').value, price_key: key, sort };
  await dbUpsert('equipment_types', row);
  let pr = state.data.price_list.find(x=>x.key===key);
  const price = parseFloat($('#et-price').value)||0;
  if (!pr) pr = { id: uid(), key, name: 'Equipment — ' + name, unit_label: 'per unit/day', price, sort: state.data.price_list.length };
  else pr = { ...pr, price, name: 'Equipment — ' + name };
  await dbUpsert('price_list', pr);
  closeModal(); toast('✓ ' + t('saved')); render();
}

function editAuxModal(id){
  const a = id ? state.data.aux_equipment.find(x=>x.id===id) : { id: uid(), name:'' };
  openModal(`
    ${modalHead(t('d_aux'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="ax-name" value="${esc(a.name)}"></div>
    <button class="btn btn-green" onclick="App.saveAux('${a.id}')">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('aux_equipment','${a.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveAux(id){
  const name = $('#ax-name').value.trim(); if (!name) return;
  await dbUpsert('aux_equipment', { id, name }); closeModal(); toast('✓ ' + t('saved')); render();
}
async function setStdPrice(id, v){
  const pr = state.data.price_list.find(x=>x.id===id); if (!pr) return;
  await dbUpsert('price_list', { ...pr, price: parseFloat(v)||0 }); toast('✓ ' + t('saved'));
}
async function delRow(table, id){
  if (!confirm(t('confirm_del'))) return;
  await dbDelete(table, id); closeModal(); toast('🗑 ' + t('deleted')); render();
}

/* =====================================================================
   ЭКРАН: НАСТРОЙКИ
   ===================================================================== */
function viewSettings(){
  const u = state.user;
  const org = state.data.org_settings;
  return `
  <div class="section-title">${t('settings')}</div>

  <div class="card">
    <div class="settings-row">
      <span class="avatar role-${u.role}">${esc(initials(u.display_name))}</span>
      <div class="grow" style="flex:1">
        <b>${esc(u.display_name)}</b> <span class="role-tag rt-${u.role}">${t('role_'+u.role)}</span>
        <div class="d">@${esc(u.login)}</div>
      </div>
    </div>
    <div class="settings-row">
      <div class="grow" style="flex:1"><b>${t('doc_name')}</b></div>
      <input id="set-name" value="${esc(u.display_name)}" style="max-width:200px" onchange="App.saveMyName(this.value)">
    </div>
    <div class="settings-row">
      <div class="grow" style="flex:1"><b>${t('language')}</b></div>
      <div class="lang-seg">
        <button class="${state.lang==='ru'?'on':''}" onclick="App.setLang('ru')">RU</button>
        <button class="${state.lang==='en'?'on':''}" onclick="App.setLang('en')">EN</button>
      </div>
    </div>
    <div class="settings-row">
      <div class="grow" style="flex:1"><b>🔤 ${t('font_soon').split(' — ')[0]}</b><div class="d">${t('font_soon')}</div></div>
    </div>
  </div>

  <div class="card" style="border-color:var(--green)">
    <div class="settings-row" style="border:none">
      <div class="grow" style="flex:1">
        <b>🔄 ${t('sync')}</b>
        <div class="d">${t('synced')}: ${state.lastSync || t('never')} · ${HAS_SB?'Supabase':'DEMO / localStorage'}</div>
        ${SYNC_ERRORS.length ? `<div class="d" style="color:var(--red)">⚠ ${SYNC_ERRORS.length} ${t('tables_failed')}: ${SYNC_ERRORS.map(x=>x.tb).join(', ')}</div>` : ''}
        ${WRITE_ERRORS.length ? `<div class="d" style="color:var(--yellow)">✎ ${t('write_err')}: ${WRITE_ERRORS.length}</div>` : ''}
      </div>
      <button class="btn btn-green sm" onclick="App.sync()">${t('sync')}</button>
    </div>
    <button class="btn btn-ghost sm" style="margin-top:8px" onclick="App.diag()">🩺 ${t('diag')}</button>
    <button class="btn btn-ghost sm" style="margin-top:8px" onclick="App.showLog()">🧾 ${t('log_title')}</button>
    ${isAdmin() ? `<button class="btn btn-blue sm" style="margin-top:8px" onclick="App.dbDiag()">🗄 ${t('db_diag')}</button>` : ''}
  </div>

  ${isAdmin() ? `
  <div class="card">
    <div style="font-weight:900;margin-bottom:6px">🏢 ${t('org')}</div>
    <div class="form-row"><span class="lbl">${t('org_name')}</span><input id="org-name" value="${esc(org.company_name)}"></div>
    <div class="form-row"><span class="lbl">${t('org_short')}</span><input id="org-short" value="${esc(org.company_short)}"></div>
    <div class="form-row"><span class="lbl">${t('org_assoc')}</span><input id="org-assoc" value="${esc(org.assoc_line)}"></div>
    <div class="grid-3">
      <input id="org-a1" value="${esc(org.addr1)}"><input id="org-a2" value="${esc(org.addr2)}"><input id="org-a3" value="${esc(org.addr3)}">
    </div>
    <button class="btn btn-blue sm" style="margin-top:8px" onclick="App.saveOrg()">${t('save')}</button>
  </div>` : ''}

  <div class="card">
    <div class="settings-row"><div class="grow" style="flex:1"><b>📱 PWA</b>
      <div class="d">${isStandalone() ? '✓ ' + t('already_installed') : t('install_hint')}</div>
      <div class="d">${t('install_where_win')}</div></div></div>
    ${!isStandalone() ? `<button id="pwa-install-btn" class="btn btn-blue sm" style="${pwaPrompt?'':'display:none'};margin-top:6px" onclick="App.installPwa()">⬇ ${t('install_app')}</button>` : ''}
    <div class="settings-row"><div class="grow" style="flex:1"><b>${t('version')}</b>
      <div class="d">TechLog v${APP_VERSION}${state.lastUpdCheck ? ' · ' + t('upd_last') + ' ' + state.lastUpdCheck : ''}${state.updAvail ? ' · ⬆ ' + t('upd_found') + ': ' + state.updAvail : ''}</div></div>
      <button class="btn btn-ghost sm" onclick="App.updCheck()">🔄 ${t('upd_check')}</button></div>
  </div>

  <button class="btn btn-red" onclick="App.logout()">✕ ${t('logout')}</button>
  ${viewFooter()}`;
}

/* =====================================================================
   PDF-ИНВОЙС (только английский, по образцу бумажной формы)
   ===================================================================== */
function makePdf(){
  if (!window.jspdf){ toast('jsPDF not loaded', 'err'); return; }
  { const jj = jobDraft || state.data.jobs.find(x=>x.id===state.jobId);
    const iss = jobIssues(jj);
    if (iss.length){ toast('⚠ ' + t('pdf_blocked') + ': ' + iss.map(k=>t('issue_'+k)).join(', '), 'err'); return; } }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' }); // 215.9 × 279.4
  const j = jobDraft || state.data.jobs.find(x=>x.id===state.jobId);
  const fd = j.form_data;
  const cp = cpById(j.counterparty_id) || {name:''};
  const cx = cxById(j.complex_id) || {name:'', address:''};
  const org = state.data.org_settings;
  const p = priceResolver(j.counterparty_id);
  const sec = calcSections(fd, p);
  const grand = (j.status==='approved' && j.approved_total != null) ? j.approved_total : calcTotal(fd, p);

  const L = 13, R = 203, W = R - L;
  const C1 = L + 47;           // services | description
  const C2 = R - 26;           // description | amount
  const line = (x1,y1,x2,y2)=>doc.line(x1,y1,x2,y2);
  const box = (x,y,on,s=3.6)=>{ doc.rect(x,y,s,s); if(on){ doc.setLineWidth(.5); line(x+.6,y+.6,x+s-.6,y+s-.6); line(x+s-.6,y+.6,x+.6,y+s-.6); doc.setLineWidth(.25);} };
  const radio = (x,y,on)=>{ doc.circle(x,y,1.7); if(on) doc.circle(x,y,.9,'F'); };
  const txt = (s,x,y,o)=>doc.text(String(s),x,y,o);
  const F = (st,sz)=>{ doc.setFont('helvetica',st); doc.setFontSize(sz); };
  const val = (s,x,y,o)=>{ F('bold',10); txt(s??'',x,y,o); };
  const amount = (v,yBase)=>{ if(v>0){ F('bold',11); txt(String(Math.round(v*100)/100), R-3, yBase, {align:'right'}); } };

  /* ---- Шапка ---- */
  doc.setFillColor(20,20,20);
  doc.triangle(L+2,34, L+16,15, L+30,34, 'F');
  doc.setFillColor(255,255,255);
  doc.triangle(L+11,34, L+16,26, L+21,34, 'F');
  doc.setDrawColor(20,20,20); doc.setLineWidth(1.6);
  line(L+26,20, L+34,31); line(L+29.5,18, L+37.5,29); line(L+33,16, L+41,27);
  doc.setLineWidth(.25);
  F('italic',8.5); txt(org.assoc_line || 'atlanta apartment association', L+1, 39);

  F('bold',24); txt(org.invoice_title || 'INVOICE #CC', 118, 22, {align:'center'});
  F('bold',13); txt(org.header_city || 'ATLANTA', 66, 32);
  F('bold',8);  txt(org.addr1||'', 100, 28); txt(org.addr2||'', 100, 32); txt(org.addr3||'', 100, 36);

  /* ---- Поля шапки ---- */
  F('bold',11);
  txt('Date:', L, 48);  line(L+12, 49, L+58, 49);  val(fmtUS(j.date), L+16, 47.6);
  txt('Unit #:', 78, 48); line(92, 49, 126, 49);    val(j.unit_number || '', 96, 47.6);
  box(140, 44.6, !!fd.vacant); F('bold',11); txt('Vacant', 145.5, 48);
  box(166, 44.6, !!fd.occupied); txt('Occupied', 171.5, 48);
  txt('Property/ Customer:', L, 56); line(L+42, 57, R, 57); val(cp.name + '  —  ' + cx.name, L+45, 55.6);
  txt('Address:', L, 64); line(L+19, 65, R, 65); val(cx.address || '', L+22, 63.6);
  txt('Technician:', L, 72); line(L+24, 73, R, 73); val(techNamesFor(j), L+27, 71.6);

  /* ---- Таблица ---- */
  let y = 78;
  const rowTop = [];
  const startRow = (h)=>{ rowTop.push([y,h]); const yy=y; y+=h; return yy; };
  // заголовок
  let ry = startRow(8);
  doc.setLineWidth(.4); doc.rect(L, ry, W, 8); doc.setLineWidth(.25);
  F('bold',11);
  txt('SERVICES', L+23.5, ry+5.6, {align:'center'});
  txt('DESCRIPTION', (C1+C2)/2, ry+5.6, {align:'center'});
  txt('AMOUNT', (C2+R)/2, ry+5.6, {align:'center'});

  const svc = (label, yy, on, withBox=true)=>{ F('bold',10); if(withBox){ box(L+2, yy, on); txt(label, L+7.5, yy+3);} else txt(label, L+2, yy+3); };
  const dTxt = (s,x,yy,sz=9,st='bold')=>{ F(st,sz); txt(s,x,yy); };

  // 1. Steam Clean
  ry = startRow(8);
  svc('Steam Clean', ry+2.2, fd.steam.deep_scrub||fd.steam.rotovac);
  box(C1+4, ry+2.2, fd.steam.deep_scrub); dTxt('Deep Scrub', C1+9.5, ry+5.2);
  box(C1+40, ry+2.2, fd.steam.rotovac);  dTxt('Rotovac', C1+45.5, ry+5.2);
  if ((fd.steam.deep_scrub||fd.steam.rotovac) && fd.steam.rooms>1) dTxt('Rooms: '+fd.steam.rooms, C1+72, ry+5.2);
  amount(sec.steam, ry+5.6);

  // 2. Removals — ячейки-подписи
  ry = startRow(10);
  svc('Removals', ry+3.2, Object.keys(fd.removals).some(k=>k!=='on'&&fd.removals[k]));
  const remCols = [['red_stain','Red Stain'],['wax','Wax'],['rust','Rust'],['ink','Ink'],['gum','Gum'],['paint','Paint Removal']];
  const remW = (C2-C1)/6;
  remCols.forEach(([k,lab],i)=>{
    const x = C1 + i*remW;
    if (i>0) line(x, ry, x, ry+10);
    F('bold',7.6); txt(lab, x+remW/2, ry+3.4, {align:'center'});
    box(x+remW/2-1.8, ry+5, fd.removals[k], 3.4);
  });
  amount(sec.removals, ry+6.6);

  // 3. Repairs
  ry = startRow(10);
  svc('Repairs', ry+3.2, Object.keys(fd.repairs).some(k=>k!=='on'&&fd.repairs[k]));
  const repCols = [['threshold','Threshold'],['stretch','Stretch'],['seam','Seam'],['patch','Patch']];
  const repW = (C2-C1)/4;
  repCols.forEach(([k,lab],i)=>{
    const x = C1 + i*repW;
    if (i>0) line(x, ry, x, ry+10);
    F('bold',8); txt(lab, x+repW/2, ry+3.4, {align:'center'});
    box(x+repW/2-1.8, ry+5, fd.repairs[k], 3.4);
  });
  amount(sec.repairs, ry+6.6);

  // 4. Dye
  ry = startRow(8);
  svc('Dye', ry+2.2, fd.dye.spot||fd.dye.full);
  box(C1+4, ry+2.2, fd.dye.spot); dTxt('Spot Dye', C1+9.5, ry+5.2);
  box(C1+40, ry+2.2, fd.dye.full); dTxt('Full Dye', C1+45.5, ry+5.2);
  amount(sec.dye, ry+5.6);

  // 5. Other
  ry = startRow(9);
  svc('Other', ry+2.6, fd.other.trash_out||fd.other.pad_removal);
  box(C1+4, ry+2.6, fd.other.trash_out); dTxt('Trash Out', C1+9.5, ry+5.6);
  box(C1+34, ry+2.6, fd.other.pad_removal); dTxt('Pad', C1+39.5, ry+3.6, 7.6); dTxt('Removal', C1+39.5, ry+6.8, 7.6);
  doc.rect(C1+62, ry+1.6, 8, 6); if (fd.other.pad_removal && !fd.other.all_unit){ F('bold',10); txt(String(fd.other.rooms||1), C1+66, ry+6.2, {align:'center'}); }
  dTxt('Rooms', C1+72, ry+5.6);
  box(C1+90, ry+2.6, fd.other.all_unit); dTxt('All', C1+95.5, ry+3.6, 7.6); dTxt('Unit', C1+95.5, ry+6.8, 7.6);
  amount(sec.other, ry+6);

  // 6. Fog / GOC
  ry = startRow(8);
  box(L+2, ry+2.2, fd.fog.fog); dTxt('Fog', L+7.5, ry+5.2, 10);
  box(L+20, ry+2.2, fd.fog.goc); dTxt('GOC', L+25.5, ry+5.2, 10);
  box(C1+4, ry+2.2, fd.fog.pet); dTxt('Pet', C1+9.5, ry+5.2);
  box(C1+28, ry+2.2, fd.fog.smoke); dTxt('Smoke', C1+33.5, ry+5.2);
  box(C1+58, ry+2.2, fd.fog.deodorizer); dTxt('Deodorizer', C1+63.5, ry+5.2);
  amount(sec.fog, ry+5.6);

  // 7. Treatments
  ry = startRow(8);
  svc('Treatments', ry+2.2, fd.treatments.sealant||fd.treatments.mold||fd.treatments.degreaser);
  box(C1+4, ry+2.2, fd.treatments.sealant); dTxt('Sealant', C1+9.5, ry+5.2);
  box(C1+34, ry+2.2, fd.treatments.mold); dTxt('Mold & Mildew', C1+39.5, ry+5.2);
  box(C1+76, ry+2.2, fd.treatments.degreaser); dTxt('Degreaser', C1+81.5, ry+5.2);
  amount(sec.treatments, ry+5.6);

  // 8. Wet Vac / Flood
  ry = startRow(11);
  box(L+2, ry+3.6, fd.wetvac.wet_vac); dTxt('Wet Vac', L+7.5, ry+6.6, 10);
  box(L+26, ry+3.6, fd.wetvac.flood); dTxt('Flood', L+31.5, ry+6.6, 10);
  box(C1+12, ry+1, fd.wetvac.sewer, 3.2); dTxt('Sewer', C1+16.5, ry+3.6, 8);
  box(C1+40, ry+1, fd.wetvac.fresh, 3.2); dTxt('Fresh Water', C1+44.5, ry+3.6, 8);
  const wvAreas = [['ktc','Ktc'],['lr','Lr'],['dr','Dr'],['hall','Hall'],['brs',"Br's"],['all','All Unit']];
  wvAreas.forEach(([k,lab],i)=>{
    const x = C1 + 4 + i*17.5;
    radio(x, ry+8.2, fd.wetvac.areas[k]);
    dTxt(lab, x+2.6, ry+9.2, 8);
  });
  amount(sec.wetvac, ry+7);

  // 9. Air Duct / Dryer Vent
  ry = startRow(11);
  box(L+2, ry+1.2, fd.airduct.air_duct, 3.2); dTxt('Air Duct Cleaning', L+6.5, ry+4, 9.4);
  box(L+2, ry+6.4, fd.airduct.dryer_vent, 3.2); dTxt('Dryer Vent Cleaning', L+6.5, ry+9.2, 9.4);
  doc.rect(C1+4, ry+2, 7, 6); if (fd.airduct.air_duct){ F('bold',10); txt(String(fd.airduct.bedrooms||1), C1+7.5, ry+6.4, {align:'center'}); }
  dTxt('Bedrooms', C1+13, ry+6.4);
  if (fd.airduct.note) { F('bolditalic',10); txt(fd.airduct.note, C1+34, ry+6.4); }
  dTxt('Unit #', C2-38, ry+9.6, 8); dTxt('For', C2-20, ry+9.6, 8); doc.rect(C2-14, ry+5.8, 6, 5); dTxt('Days', C2-6.5, ry+9.6, 8);
  amount(sec.airduct, ry+7);

  // 10. Equipment Rental — строки по справочнику
  const eqList = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0));
  eqList.forEach((et, i)=>{
    ry = startRow(8.4);
    if (i === 0){ svc('Equipment Rental', ry+2.4, Object.values(fd.equipment).some(e=>+e.qty>0)); }
    else { F('bold',9); txt('Unit #', L+23.5, ry+5.4, {align:'center'}); }
    const e = fd.equipment[et.id] || {qty:0, days:0};
    dTxt(et.name, C1+4, ry+5.4, 9.4);
    dTxt('Qty', C1+42, ry+5.4, 8);
    doc.rect(C1+49, ry+1.6, 7, 5.4); if (+e.qty>0){ F('bold',10); txt(String(e.qty), C1+52.5, ry+5.6, {align:'center'}); }
    dTxt('For', C2-22, ry+5.4, 8);
    doc.rect(C2-16, ry+1.6, 7, 5.4); if (+e.qty>0){ F('bold',10); txt(String(e.days||3), C2-12.5, ry+5.6, {align:'center'}); }
    dTxt('Days', C2-7.5, ry+5.4, 8);
    const lineSum = (+e.qty||0) * Math.max(1,+e.days||1) * eqDayPrice(et,p);
    amount(lineSum, ry+5.6);
  });

  // 11. Pad Installation
  ry = startRow(9);
  svc('Pad Installation', ry+2.6, !!fd.pad.size || fd.pad.all_unit || fd.pad.rooms>0);
  const sizes = [['q14','1/4'],['q12','1/2'],['q34','3/4'],['roll','1 Roll']];
  sizes.forEach(([k,lab],i)=>{
    const x = C1 + 6 + i*16;
    radio(x, ry+4.4, fd.pad.size===k);
    dTxt(lab, x+2.6, ry+5.4, 8.4);
  });
  doc.rect(C1+72, ry+1.6, 8, 6); if (fd.pad.rooms>0){ F('bold',10); txt(String(fd.pad.rooms), C1+76, ry+6.2, {align:'center'}); }
  dTxt('Rooms', C1+82, ry+5.4);
  radio(C1+100, ry+4.4, fd.pad.all_unit); dTxt('All', C1+103, ry+3.4, 7.4); dTxt('Unit', C1+103, ry+6.6, 7.4);
  amount(sec.pad, ry+6);

  // OTHER SERVICES: 3 строки; в 3-й — блок TOTAL
  const others = fd.others || [];
  ry = startRow(9.5);
  F('bold',10.5); txt('OTHER SERVICES:', L+2, ry+6);
  F('bolditalic',10.5); txt((others[0]?.desc)||'', L+42, ry+6);
  line(L+40, ry+7.4, C2-1, ry+7.4);
  amount(+others[0]?.amount||0, ry+6.4);
  ry = startRow(9.5);
  F('bolditalic',10.5); txt((others[1]?.desc)||'', L+3, ry+6);
  line(L+2, ry+7.4, C2-1, ry+7.4);
  amount(+others[1]?.amount||0, ry+6.4);
  (fd.extra||[]).slice(0,6).forEach(it => {
    ry = startRow(8);
    F('bolditalic',10); txt(extraItemTextEn(it).slice(0,78), L+3, ry+5.4);
    line(L+2, ry+6.6, C2-1, ry+6.6);
    amount(extraLineTotal(it), ry+5.6);
  });
  ry = startRow(12);
  F('bolditalic',10.5); txt((others[2]?.desc)||'', L+3, ry+6.4);
  line(L+2, ry+8, 140, ry+8);
  F('bold',13); txt('TOTAL DUE $', C2-2, ry+6.6, {align:'right'});
  F('bold',7);  txt('NET DUE 30 DAYS', C2-2, ry+10, {align:'right'});
  F('bold',14); txt(String(Math.round(grand*100)/100), R-3, ry+8, {align:'right'});

  // сетка таблицы
  const tableTop = rowTop[0][0];
  const tableBot = y;
  doc.setLineWidth(.4);
  doc.rect(L, tableTop, W, tableBot - tableTop);
  doc.setLineWidth(.25);
  rowTop.forEach(([yy],i)=>{ if(i>0) line(L, yy, R, yy); });
  line(C1, tableTop, C1, tableBot - 31);         // services|description (до OTHER SERVICES)
  line(C2, tableTop, C2, tableBot);              // amount

  /* ---- NOTES ---- */
  if (j.note){
    F('bold',8.5); txt('NOTES:', L, y+4.6);
    F('bolditalic',8.5);
    const nl = doc.splitTextToSize(j.note, R - L - 18).slice(0,2);
    nl.forEach((s,i)=>txt(s, L+16, y+4.6+i*4));
    y += 4 + nl.length*4;
  }

  /* ---- Условия и подписи ---- */
  const terms = 'I AUTHORIZE ' + (org.company_name||'') + ' TO PERFORM THE WORK LISTED ABOVE. I AM SATISFIED WITH THE WORK AND AGREE WITH THE PRICE. PAYMENTS ARE DUE NET 30 DAYS FROM DATE OF SERVICE. LATE PAYMENTS ARE SUBJECT TO 1% MONTHLY CHARGE. ANY EQUIPMENT PLACED ON YOUR PROPERTY IS PROPERTY OF ' + (org.company_short||'') + '. CUSTOMER IS RESPONSIBLE FOR EQUIPMENT AND RESPONSIBILITY FOR THE REPLACEMENT VALUE OF THE EQUIPMENT LOST OR DAMAGED.';
  F('bold',6.4);
  const tl = doc.splitTextToSize(terms, 178);
  tl.forEach((s,i)=>txt(s, 108, y+5+i*3, {align:'center'}));
  let sy = y + 5 + tl.length*3 + 12;
  F('bold',10);
  txt('PRINT NAME', 118, sy); doc.setLineDashPattern([1.4,1],0); line(146, sy+1, R, sy+1);
  sy += 12;
  txt('SIGNATURE:', L, sy); line(L+27, sy+1, 118, sy+1); doc.setLineDashPattern([],0);

  const fname = 'Invoice_' + (cx.abbr||'UNIT') + '_' + (j.unit_number||'x') + '_' + j.date + '.pdf';
  doc.save(fname);
}

/* =====================================================================
   ОБНОВЛЕНИЯ / SERVICE WORKER
   ===================================================================== */
function editingBusy(){
  return state.screen === 'job' || !!document.getElementById('overlay') || !!dictTa;
}
function maybeApplyPendingUpdate(){
  if (state.pendingUpdate && !editingBusy()){
    dlog('update: применяю отложенное обновление', state.pendingUpdate);
    sessionStorage.setItem('techlog_updated', '1');
    location.reload();
  }
}

/* ---------- Плановая проверка обновлений ----------
   старт приложения · каждое переключение вкладки · открытие настроек · таймер раз в 10 минут.
   Во время заполнения инвойса/модалок/диктовки проверки молчат, обновление откладывается. */
let updLastCheck = 0;
async function checkForUpdate(reason, force){
  if (!force && Date.now() - updLastCheck < 15000) return;      // защита от спама при быстрых кликах
  if (!force && editingBusy()) return;                          // не мешаем заполнению документов
  updLastCheck = Date.now();
  try{
    const r = await fetch('./version.json?ts=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    state.lastUpdCheck = new Date().toTimeString().slice(0,5);
    if (v.version && v.version !== APP_VERSION){
      state.updAvail = v.version;
      dlog('update: найдена версия', v.version, '· причина: ' + reason);
      const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) reg.update();                                    // дальше сработает SW_ACTIVATED → перезагрузка или отложка
      else if (!editingBusy()){ sessionStorage.setItem('techlog_updated','1'); location.reload(); }
      else { state.pendingUpdate = v.version; toast('⬆ ' + t('update_after_form'), 'inf'); }
    } else {
      state.updAvail = null;
      dlog('update: версия актуальна · причина: ' + reason);
    }
  }catch(e){ dlog('update: проверка не удалась (' + reason + '):', e); }
}
function initSW(){
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'SW_ACTIVATED') return;
    if (e.data.version === APP_VERSION) return;
    if (editingBusy()){ state.pendingUpdate = e.data.version; toast('⬆ ' + t('update_after_form'), 'inf'); }
    else { sessionStorage.setItem('techlog_updated', '1'); location.reload(); }
  });
  // проверка версии при каждом открытии приложения
  checkForUpdate('открытие приложения', true);
  if (sessionStorage.getItem('techlog_updated')){
    sessionStorage.removeItem('techlog_updated');
    setTimeout(()=>toast('✓ ' + t('updated_to') + ' ' + APP_VERSION), 600);
  }
}

/* =====================================================================
   ПУБЛИЧНЫЕ ОБРАБОТЧИКИ + СТАРТ
   ===================================================================== */
const App = {
  go(s){
    dictStop();
    if (state.screen==='job' && s!=='job') { state.jobId=null; localStorage.removeItem('techlog_draft'); }
    if (state.screen==='map' && s!=='map' && mapObj){ try{ mapObj.remove(); }catch(e){} mapObj=null; }
    state.screen = s; render(); maybeApplyPendingUpdate();
    checkForUpdate('переключение → ' + s, s === 'settings');
  },
  selDay(iso){ state.selDate = iso; render(); },
  shiftWeek(n){ state.weekStart = addDaysISO(state.weekStart, n*7); const cand = addDaysISO(state.selDate, n*7); state.selDate = cand; render(); },
  setMine(v){ state.filterMine = v; render(); },
  sync(){ syncNow(false); checkForUpdate('кнопка синхронизации', true); },
  addTaskModal, ntCpChange, ntPickWt, createTask, closeModal,
  openJob, saveJob, approveJob, deleteJob, makePdf, pickupGroup,
  setReportDate(v){ state.reportDate = v; render(); }, copyReport,
  repTab(v){ state.repTab = v; render(); },
  repFrom(v){ state.repFrom = v; render(); }, repTo(v){ state.repTo = v; render(); },
  repRange(f,to){ state.repFrom = f; state.repTo = to; render(); },
  repCp(v){ state.repCp = v; render(); }, repStatus(v){ state.repStatus = v; render(); },
  statRange(f, to){ state.statFrom = f; state.statTo = to; render(); },
  statFrom(v){ state.statFrom = v; render(); }, statTo(v){ state.statTo = v; render(); },
  statMine(v){ state.statMine = v; render(); },
  async updCheck(){
    await checkForUpdate('вручную', true);
    toast(state.updAvail ? '⬆ ' + t('upd_found') + ': ' + state.updAvail : '✓ ' + t('upd_latest'), state.updAvail ? 'inf' : undefined);
    render();
  },
  batchPdf,
  mapSetCp(v){ state.mapCp = v; render(); },
  mapToggleDay(v){ state.mapDay = v; if (v && !state.mapDate) state.mapDate = state.selDate; render(); },
  mapSetDate(v){ state.mapDate = v; render(); },
  mapFocus(lat,lng){ if (mapObj){ mapObj.setView([lat,lng], 15); window.scrollTo({top:0,behavior:'smooth'}); } },
  mapRoute,
  geocodeCx, gmapsCx,
  dictToggle, dictLang(l){ state.dictLang = l; localStorage.setItem('techlog_dictlang', l); document.querySelectorAll('.dict-row .lang-seg button').forEach(b=>b.classList.toggle('on', b.textContent === (l==='ru-RU'?'RU':'EN'))); },
  noteModal, saveNote, auxToggle,
  crewAdd, crewAll, crewRemove, navToCx, copyText,
  jumpToday(){ state.selDate = todayISO(); state.weekStart = mondayOf(state.selDate); render(); },
  setRole, staffVis, saveVis,
  diag: showDiagnostics, copyDiag,
  faq: faqModal,
  translateEn: translateToEn,
  openDayMap(){ state.mapDay = true; state.mapDate = state.selDate; App.go('map'); },
  mapMode(v){ state.mapDay = !!v; if (v && !state.mapDate) state.mapDate = state.selDate; render(); },
  showLog: showLogModal, copyLog, clearLog,
  togglePriority, moveJob,
  codeHistory: codeHistoryModal, proposeCode: proposeCodeModal, pcGate, submitCode,
  extraPicker: extraPickerModal, exAdd, exDel,
  exPreset(i, n){
    const it = jobDraft && jobDraft.form_data.extra[i]; if (!it) return;
    it.size_a = n; it.size_b = n; it.size_value = exSizeVal(it);
    refreshExtraList();
  },
  editEwModal, saveEw, editSzModal, saveSz, editPtModal, savePt,
  decideReq: decideCodeReq,
  dbDiag: showDbDiagnostics,
  loginCheck, loginTyped,
  installPwa,
  enterKey(e, mode){
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (mode === 'in') App.signIn(); else App.signUp();
  },
  dirTab(v){ state.dirTab = v; render(); },
  openCp, cpTab(v){ state.cpTab = v; renderCpModal(); },
  editCpModal, saveCp, cpCustomToggle, cpSetPrice,
  editCxModal, saveCx, editWtModal, saveWt, editEtModal, saveEt, editAuxModal, saveAux,
  setStdPrice, delRow,
  pickColor(id, c){ $('#'+id+'-v').value = c; document.querySelectorAll('#'+id+' .cdot').forEach(d=>d.classList.toggle('sel', d.dataset.c===c)); },
  setLang(l){ state.lang = l; localStorage.setItem('techlog_lang', l); render(); },
  saveMyName(v){
    v = v.trim(); if (!v) return;
    state.user.display_name = v;
    const prof = state.data.profiles.find(p=>p.id===state.user.id);
    if (prof){ prof.display_name = v; dbUpsert('profiles', {...prof}); }
    else if (HAS_SB) state.sb.from('profiles').upsert({ id: state.user.id, login: state.user.login, display_name: v, role: state.user.role });
    toast('✓ ' + t('saved'));
  },
  saveOrg(){
    const org = { ...state.data.org_settings,
      company_name: $('#org-name').value.trim(), company_short: $('#org-short').value.trim(),
      assoc_line: $('#org-assoc').value.trim(),
      addr1: $('#org-a1').value.trim(), addr2: $('#org-a2').value.trim(), addr3: $('#org-a3').value.trim() };
    dbSaveOrg(org); toast('✓ ' + t('saved'));
  },
  demoLogin, logout,
  signIn(){ sbSignIn($('#li-login').value, $('#li-pass').value); },
  signUp(){ sbSignUp($('#su-login').value, $('#su-pass').value, $('#su-name').value.trim(), $('#su-invite').value.trim()); },
  authMode(up){ $('#auth-signin').style.display = up?'none':''; $('#auth-signup').style.display = up?'':'none'; },
};
window.App = App;

(async function start(){
  try {
    initSW();
    if (HAS_SB){
      try{
        const cached = loadLocal();
        if (cached && (cached.profiles||[]).some(p => String(p.id).startsWith('demo-'))) localStorage.removeItem(LS_KEY);
      }catch(e){}
    }
    await initAuth();
    if (state.user){ state.selDate = todayISO(); state.weekStart = mondayOf(state.selDate); }
    render();
    if (state.user) checkPickupBanner(true);
    setInterval(() => checkForUpdate('таймер 10 мин'), 10 * 60 * 1000);
  } catch (e) {
    console.error('TechLog start failed:', e);
    window.__tlErr = e && (e.message || String(e));
    if (window.__tlPanic) window.__tlPanic('Ошибка запуска приложения'); 
  }
})();

/* =====================================================================
   ГОЛОСОВАЯ ДИКТОВКА ЗАМЕТОК (Web Speech API, ru-RU / en-US)
   ===================================================================== */
let dictRec = null, dictTa = null, dictBase = '', dictWant = false;
const DICT_ANDROID = /android/i.test(navigator.userAgent);
function dictSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function dictationHTML(taId, value){
  return `<div class="dict-wrap">
    <textarea id="${taId}" class="note-ta" rows="3" placeholder="${t('note')}…">${esc(value||'')}</textarea>
    <div class="dict-row">
      <button type="button" class="mic ${dictTa===taId?'rec':''}" id="mic-${taId}" onclick="App.dictToggle('${taId}')" title="${t('dictate')}">🎤</button>
      <div class="lang-seg sm">
        <button type="button" class="${state.dictLang==='ru-RU'?'on':''}" onclick="App.dictLang('ru-RU')">RU</button>
        <button type="button" class="${state.dictLang==='en-US'?'on':''}" onclick="App.dictLang('en-US')">EN</button>
      </div>
      <button type="button" class="btn btn-ghost sm" onclick="App.translateEn('${taId}')">🌐 ${t('translate_en')}</button>
      <span class="tiny" id="mic-hint-${taId}">${dictTa===taId ? t('listening') : ''}</span>
    </div>
  </div>`;
}
function dictStop(){
  dictWant = false;
  if (dictRec){ try{ dictRec.onresult = null; dictRec.onend = null; dictRec.onerror = null; dictRec.stop(); }catch(e){} }
  const prev = dictTa;
  dictRec = null; dictTa = null;
  if (prev){
    document.getElementById('mic-'+prev)?.classList.remove('rec');
    const h = document.getElementById('mic-hint-'+prev); if (h) h.textContent = '';
  }
}
/* Фикс «спама слов» на Android Chrome: движок там дублирует финальные результаты
   и глючит в continuous-режиме, из-за чего фразы повторялись по многу раз.
   Теперь: финальный текст на каждом событии пересобирается заново из полного
   списка e.results (а не накапливается +=), подряд идущие одинаковые куски
   отбрасываются, а на Android распознавание идёт короткими сессиями
   с авто-перезапуском — диктовка при этом не прерывается. */
function dictToggle(taId){
  if (dictTa === taId){ dictStop(); return; }
  dictStop();
  if (!dictSupported()){ toast(t('dict_unsupported'), 'err'); return; }
  const ta = document.getElementById(taId); if (!ta) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  dictTa = taId; dictWant = true;
  dictBase = ta.value ? ta.value.replace(/\s+$/,'') + ' ' : '';
  const norm = s => s.replace(/\s+/g,' ').trim().toLowerCase();

  const startSession = () => {
    if (!dictWant || dictTa !== taId) return;
    dictRec = new SR();
    dictRec.lang = state.dictLang;
    dictRec.continuous = !DICT_ANDROID;   // continuous на Android дублирует текст
    dictRec.interimResults = true;
    let sessionFinal = '';

    dictRec.onresult = (e) => {
      let fin = '', prevChunk = '', interim = '';
      for (let i = 0; i < e.results.length; i++){
        const res = e.results[i];
        const tr = ((res[0] && res[0].transcript) || '').trim();
        if (!tr) continue;
        if (res.isFinal){
          if (DICT_ANDROID && norm(tr) === norm(prevChunk)) continue; // дубль финала (баг Android)
          fin += tr + ' ';
          prevChunk = tr;
        } else {
          interim = tr;                    // берём последнюю гипотезу целиком, не суммируем
        }
      }
      sessionFinal = fin;
      if (interim && norm(fin).endsWith(norm(interim))) interim = '';
      ta.value = (dictBase + fin + interim).replace(/\s+/g,' ').trimStart();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const commit = () => {
      const chunk = sessionFinal.replace(/\s+/g,' ').trim();
      sessionFinal = '';
      if (!chunk) return;
      if (DICT_ANDROID && norm(dictBase).endsWith(norm(chunk))) return; // уже записано
      dictBase = (dictBase.replace(/\s+$/,'') + ' ' + chunk).trimStart() + ' ';
      ta.value = dictBase.replace(/\s+$/,'');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };

    dictRec.onerror = (e) => {
      const fatal = ['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(e.error);
      if (fatal){ commit(); dictStop(); }
      // 'no-speech' / 'aborted' / 'network' — onend сам перезапустит сессию
    };

    dictRec.onend = () => {
      commit();
      if (dictWant && dictTa === taId) setTimeout(startSession, 250); // авто-перезапуск
      else if (dictTa === taId) dictStop();
    };

    try { dictRec.start(); } catch(err){ dictStop(); }
  };

  startSession();
  if (!dictRec) return; // start() не удался
  document.getElementById('mic-'+taId)?.classList.add('rec');
  const h = document.getElementById('mic-hint-'+taId); if (h) h.textContent = t('listening');
}

/* Переключатель «взять с собой» доп. оборудования (опционально, на конкретный выезд) */
function auxToggle(id){
  if (!jobDraft) return;
  const fd = jobDraft.form_data;
  fd.aux_take = fd.aux_take || {};
  fd.aux_take[id] = !fd.aux_take[id];
  const b = document.querySelector(`[data-aux="${id}"]`);
  if (b){
    b.classList.toggle('on', !!fd.aux_take[id]);
    const mk = b.querySelector('.aux-mk'); if (mk) mk.textContent = fd.aux_take[id] ? '✅' : '⬜';
  }
  autosaveDraft();
}

/* Заметка из карточки пикапа (та же заметка работы, попадает в PDF) */
function noteModal(jobId){
  const j = state.data.jobs.find(x=>x.id===jobId); if (!j) return;
  openModal(`
    ${modalHead('📝 ' + t('note'))}
    ${dictationHTML('pk-note', j.note || '')}
    <div class="tiny" style="margin-bottom:10px">${t('note_hint')}</div>
    <button class="btn btn-green" onclick="App.saveNote('${jobId}')">${t('save')}</button>
  `);
}
async function saveNote(jobId){
  dictStop();
  const j = state.data.jobs.find(x=>x.id===jobId); if (!j) return;
  const v = document.getElementById('pk-note')?.value ?? '';
  await dbUpsert('jobs', { ...j, note: v, updated_at: new Date().toISOString() });
  closeModal(); toast('✓ ' + t('saved')); render();
}

/* =====================================================================
   ЭКРАН: КАРТА (Leaflet + OpenStreetMap)
   ===================================================================== */
let mapObj = null;
function cpColor(cpId){
  const i = state.data.counterparties.findIndex(c=>c.id===cpId);
  return PALETTE[(i>=0?i:0) % PALETTE.length];
}
function mapDayItems(){
  const iso = state.mapDate || state.selDate || todayISO();
  const num = dayNumbering(iso);   // те же номера, что в строках на главном экране
  const pts = [];
  num.pkGroups.forEach(([jobId, list]) => {
    const p0 = list[0];
    const cx = cxById(p0.complex_id);
    if (cx && cx.lat != null && cx.lng != null){
      const over = list.some(p => p.due_date < todayISO());
      const eq = list.map(p => `${p.qty}×${(etById(p.equipment_type_id)||{abbr:'?'}).abbr}`).join(' ');
      pts.push({ num: num.pkNum[jobId], lat:+cx.lat, lng:+cx.lng, color: over ? '#FF4B4B' : '#8AA0AB',
        label: `📦 ${t('pickup')} Unit ${p0.unit_number||'—'} · ${eq}`, cx, kind:'pickup' });
    }
  });
  num.jobs.forEach(j => {
    const cx = cxById(j.complex_id);
    if (cx && cx.lat != null && cx.lng != null){
      const wt = wtById(j.work_type_id) || {color:'#888', name:''};
      pts.push({ num: num.jobNum[j.id], lat:+cx.lat, lng:+cx.lng, color: wt.color,
        label: `🛠 Unit ${j.unit_number||'—'} · ${wt.name}`, cx, kind:'job' });
    }
  });
  pts.sort((a,b)=>a.num-b.num);
  return { iso, pts };
}
function viewMap(){
  const cps = state.data.counterparties;
  const list = state.data.complexes.filter(cx => !state.mapCp || cx.counterparty_id === state.mapCp);
  const noCoords = list.filter(cx => cx.lat == null || cx.lng == null);
  const day = state.mapDay ? mapDayItems() : null;

  const legend = state.mapDay
    ? (day.pts.length
        ? day.pts.map(p=>`<button class="rowline map-row" onclick="App.mapFocus(${p.lat},${p.lng})">
            <span class="dot num" style="background:${p.color};color:${textColorFor(p.color)}">${p.num}</span>
            <div class="grow">${esc(p.label)}<div class="tiny">${esc(p.cx.name)}</div></div></button>`).join('')
        : `<div class="list-empty">${t('no_items')}</div>`)
    : list.map(cx=>{
        const has = cx.lat != null && cx.lng != null;
        return `<button class="rowline map-row" ${has?`onclick="App.mapFocus(${cx.lat},${cx.lng})"`:''}>
          <span class="dot" style="background:${cpColor(cx.counterparty_id)}"></span>
          <div class="grow"><b>${esc(cx.name)}</b> <span class="tiny">${esc((cpById(cx.counterparty_id)||{}).abbr||'')}</span>
            <div class="tiny">${has ? esc(cx.address||'') : '⚠ ' + t('map_no_coords')}</div></div>
          ${cx.access_code?`<span class="tiny key-copy" onclick="event.stopPropagation();App.copyText('${esc(cx.access_code)}')">🔑 ${esc(cx.access_code)}</span>`:''}
        </button>`;
      }).join('');

  return `
  <div class="section-title">${t('map_title')}</div>
  <div class="card map-controls">
    <div class="form-row"><span class="lbl">${t('counterparty')}</span>
      <select onchange="App.mapSetCp(this.value)">
        <option value="">${t('all_counterparties')}</option>
        ${cps.map(c=>`<option value="${c.id}" ${state.mapCp===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select></div>
    <div class="tabs" style="margin-top:8px">
      <button class="tabbtn ${!state.mapDay?'active':''}" onclick="App.mapMode(false)">🗺 ${t('map_mode_all')}</button>
      <button class="tabbtn ${state.mapDay?'active':''}" onclick="App.mapMode(true)">📅 ${t('map_mode_day')}</button>
    </div>
    ${state.mapDay ? `
      <div class="form-row" style="margin-top:8px"><span class="lbl">${t('map_day_hint')}</span>
        <input type="date" value="${state.mapDate || state.selDate}" onchange="App.mapSetDate(this.value)"></div>
      ${day.pts.length ? `<button class="btn btn-blue sm" onclick="App.mapRoute()">🧭 ${t('route_gmaps')}</button>` : ''}` : ''}
  </div>
  <div id="map" class="map-box"></div>
  ${legend}
  ${!state.mapDay && noCoords.length ? `<div class="tiny" style="margin-top:6px">⚠ ${noCoords.length} · ${t('map_no_coords')}</div>` : ''}`;
}
function initMapView(){
  if (!window.L) { setTimeout(initMapView, 150); return; }
  if (mapObj){ try{ mapObj.remove(); }catch(e){} mapObj = null; }
  const el = document.getElementById('map'); if (!el) return;
  mapObj = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(mapObj);

  const marks = [];
  const mk = (lat, lng, color, html, numTxt) => {
    const m = numTxt != null
      ? L.marker([lat, lng], { icon: L.divIcon({ className: '', iconSize: null,
          html: `<div class="map-pin" style="background:${color};color:${textColorFor(color)}">${numTxt}</div>` }) }).addTo(mapObj)
      : L.circleMarker([lat, lng], { radius: 9, color: '#0F171B', weight: 2, fillColor: color, fillOpacity: .95 }).addTo(mapObj);
    m.bindPopup(html);
    marks.push([lat, lng]);
  };
  const gm = (cx) => `<a href="https://www.google.com/maps/dir/?api=1&destination=${cx.lat},${cx.lng}" target="_blank" rel="noopener">${t('open_gmaps')} →</a>`;

  if (state.mapDay){
    const { pts } = mapDayItems();
    const byCx = {};
    pts.forEach(p => (byCx[p.cx.id] = byCx[p.cx.id] || { cx: p.cx, items: [], color: p.color }).items.push(p));
    Object.values(byCx).forEach(g => {
      g.items.sort((a,b)=>(a.num||0)-(b.num||0));
      const cx = g.cx;
      const html = `<b>${esc(cx.name)}</b><br>${esc(cx.address||'')}${cx.access_code?'<br>🔑 '+esc(cx.access_code):''}${cx.callbox_code?'<br>'+(cx.callbox_gate?'🚧 ':'📟 ')+esc(cx.callbox_code):''}<hr style="margin:4px 0">` +
        g.items.map(i=>`<b>#${i.num}</b> <span style="color:${i.color}">●</span> ${esc(i.label)}`).join('<br>') + `<br>${gm(cx)}`;
      const numTxt = g.items.map(i=>i.num).join('·');
      mk(+cx.lat, +cx.lng, g.items.find(i=>i.kind==='job')?.color || g.items[0].color, html, numTxt);
    });
  } else {
    state.data.complexes
      .filter(cx => (!state.mapCp || cx.counterparty_id === state.mapCp) && cx.lat != null && cx.lng != null)
      .forEach(cx => {
        const cp = cpById(cx.counterparty_id) || {name:''};
        mk(+cx.lat, +cx.lng, cpColor(cx.counterparty_id),
          `<b>${esc(cx.name)}</b> (${esc(cx.abbr||'')})<br>${esc(cp.name)}<br>${esc(cx.address||'')}${cx.access_code?'<br>🔑 '+esc(cx.access_code):''}${cx.callbox_code?'<br>'+(cx.callbox_gate?'🚧 ':'📟 ')+esc(cx.callbox_code):''}<br>${gm(cx)}`);
      });
  }
  if (marks.length) mapObj.fitBounds(marks, { padding: [30,30], maxZoom: 14 });
  else mapObj.setView([33.79, -84.39], 10); // Атланта
  setTimeout(()=>mapObj && mapObj.invalidateSize(), 120);
}
function mapRoute(){
  const { pts } = mapDayItems();
  const uniq = [];
  pts.forEach(p => { const k = p.lat.toFixed(5)+','+p.lng.toFixed(5); if (!uniq.includes(k)) uniq.push(k); });
  if (!uniq.length) return;
  window.open('https://www.google.com/maps/dir/' + uniq.join('/'), '_blank', 'noopener');
}

/* Геокодинг адреса комплекса (Nominatim / OpenStreetMap) */
async function geocodeCx(){
  const addr = $('#cx-addr').value.trim();
  if (!addr){ toast(t('geocode_fail'), 'err'); return; }
  try{
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(addr), { headers: { 'Accept': 'application/json' } });
    const js = await r.json();
    if (js && js[0]){
      $('#cx-lat').value = (+js[0].lat).toFixed(6);
      $('#cx-lng').value = (+js[0].lon).toFixed(6);
      toast('✓ ' + t('geocode_ok'));
    } else toast(t('geocode_fail'), 'err');
  }catch(e){ toast(t('geocode_fail'), 'err'); }
}
function gmapsCx(){
  const la = $('#cx-lat').value, ln = $('#cx-lng').value, addr = $('#cx-addr').value.trim();
  const q = (la && ln) ? (la + ',' + ln) : addr;
  if (!q) return;
  window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank', 'noopener');
}

/* =====================================================================
   ЭКРАН: ОТЧЁТЫ — вкладки «Инвойсы (PDF)» и «Пикапы»
   ===================================================================== */
function repScopeJobs(){
  return scopeFilter(state.data.jobs, 'technician_id');
}
function repJobs(){
  if (!state.repFrom) state.repFrom = addDaysISO(todayISO(), -6);
  if (!state.repTo) state.repTo = todayISO();
  let js = repScopeJobs().filter(j => j.date >= state.repFrom && j.date <= state.repTo);
  if (state.repCp) js = js.filter(j => j.counterparty_id === state.repCp);
  if (state.repStatus === 'done') js = js.filter(j => j.status !== 'draft');
  if (state.repStatus === 'approved') js = js.filter(j => j.status === 'approved');
  return js.sort((a,b)=> a.date.localeCompare(b.date) || (a.created_at||'').localeCompare(b.created_at||''));
}
function jobGrand(j){ return (j.status==='approved' && j.approved_total != null) ? +j.approved_total : +j.total || 0; }
function viewReports(){
  const tabs = [['invoices', t('reports_pdf'), true], ['pickups', t('rep_pickups'), isManager()]].filter(x=>x[2]);
  if (!tabs.find(x=>x[0]===state.repTab)) state.repTab = 'invoices';
  const nav = `<div class="tabs">` + tabs.map(([id,l]) =>
    `<button class="tabbtn ${state.repTab===id?'active':''}" onclick="App.repTab('${id}')">${l}</button>`).join('') + `</div>`;
  if (state.repTab === 'pickups') return `<div class="section-title">${t('tab_reports')}</div>` + nav + viewPickupsReport();
  return `<div class="section-title">${t('tab_reports')}</div>` + nav + viewInvoicesReport();
}
function viewInvoicesReport(){
  const js = repJobs();
  const sum = js.reduce((s,j)=>s+jobGrand(j), 0);
  const today = todayISO();
  const chips = [
    [t('today'), today, today],
    [t('rep_yesterday'), addDaysISO(today,-1), addDaysISO(today,-1)],
    [t('rep_7'), addDaysISO(today,-6), today],
    [t('rep_30'), addDaysISO(today,-29), today],
  ].map(([l,f,to]) => `<button class="tabbtn ${state.repFrom===f&&state.repTo===to?'active':''}" onclick="App.repRange('${f}','${to}')">${l}</button>`).join('');

  const byDate = {};
  js.forEach(j => (byDate[j.date] = byDate[j.date] || []).push(j));
  const listHtml = Object.entries(byDate).map(([d, arr]) => `
    <div class="card gray">
      <div style="font-weight:900;margin-bottom:4px">${fmtDMY(d)} <span class="tiny">· ${arr.length}</span></div>
      ${arr.map(j => {
        const cx = cxById(j.complex_id) || {abbr:'—', name:'—'};
        const wt = wtById(j.work_type_id) || {color:'#888'};
        return `<button class="rowline map-row" onclick="App.openJob('${j.id}')">
          <span class="dot" style="background:${wt.color}"></span>
          <div class="grow">${jobIssues(j).length?warnIcon():''}${esc(cx.abbr||cx.name)} · Unit <b>${esc(j.unit_number||'—')}</b>
            <span class="tiny">· ${esc(techNamesFor(j))}</span></div>
          <span class="badge-status st-${j.status}">${t('status_'+j.status)}</span>
          <span class="money" style="min-width:56px;text-align:right">${money(jobGrand(j))}</span>
        </button>`;
      }).join('')}
    </div>`).join('');

  return `
  <div class="card">
    <div class="grid-2">
      <div class="form-row"><span class="lbl">${t('rep_range')} — ${t('from')}</span>
        <input type="date" value="${state.repFrom}" onchange="App.repFrom(this.value)"></div>
      <div class="form-row"><span class="lbl">${t('to')}</span>
        <input type="date" value="${state.repTo}" onchange="App.repTo(this.value)"></div>
    </div>
    <div class="tabs">${chips}</div>
    <div class="grid-2">
      <div class="form-row"><span class="lbl">${t('counterparty')}</span>
        <select onchange="App.repCp(this.value)">
          <option value="">${t('all_counterparties')}</option>
          ${state.data.counterparties.map(c=>`<option value="${c.id}" ${state.repCp===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
        </select></div>
      <div class="form-row"><span class="lbl">${t('status_draft')}/…</span>
        <select onchange="App.repStatus(this.value)">
          <option value="all" ${state.repStatus==='all'?'selected':''}>${t('rep_status_all')}</option>
          <option value="done" ${state.repStatus==='done'?'selected':''}>${t('rep_only_done')}</option>
          <option value="approved" ${state.repStatus==='approved'?'selected':''}>${t('rep_only_approved')}</option>
        </select></div>
    </div>
  </div>
  ${js.length ? `
    <div class="card" style="border-color:var(--green)">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="grow" style="flex:1"><b>${t('rep_found')}: ${js.length}</b>
          <div class="tiny">${t('rep_sum')} <b class="money">${money(sum)}</b> · ${t('rep_half_hint')}</div></div>
      </div>
      <button class="btn btn-green" style="margin-top:10px" onclick="App.batchPdf()">⬇ ${t('rep_download')} (${js.length})</button>
    </div>
    ${listHtml}`
  : `<div class="list-empty"><div class="big">🗂</div>${t('rep_none')}</div>`}`;
}

/* =====================================================================
   ПАКЕТНЫЙ PDF: 2 инвойса на страницу Letter (по половине)
   ===================================================================== */
function drawInvoiceHalf(doc, j, top){
  const fd = Object.assign(emptyFormData(), j.form_data || {});
  const cp = cpById(j.counterparty_id) || {name:''};
  const cx = cxById(j.complex_id) || {name:'', address:''};
  const org = state.data.org_settings;
  const p = priceResolver(j.counterparty_id);
  const sec = calcSections(fd, p);
  const grand = (j.status==='approved' && j.approved_total != null) ? +j.approved_total : calcTotal(fd, p);

  const L = 9, R = 207, W = R - L, C1 = L + 36, C2 = R - 19;
  const line = (a,b,c,d)=>doc.line(a,b,c,d);
  const F = (st,sz)=>{ doc.setFont('helvetica',st); doc.setFontSize(sz); };
  const txt = (s,x,y,o)=>doc.text(String(s??''),x,y,o);
  const box = (x,y,on,s=2.7)=>{ doc.rect(x,y,s,s); if(on){ doc.setLineWidth(.45); line(x+.4,y+.4,x+s-.4,y+s-.4); line(x+s-.4,y+.4,x+.4,y+s-.4); doc.setLineWidth(.2);} };
  const radio = (x,y,on)=>{ doc.circle(x,y,1.25); if(on) doc.circle(x,y,.65,'F'); };
  const amt = (v,yy)=>{ if(v>0){ F('bold',7.6); txt(String(Math.round(v*100)/100), R-2, yy, {align:'right'}); } };

  doc.setLineWidth(.2);
  let y = top + 4;

  /* шапка */
  doc.setFillColor(20,20,20);
  doc.triangle(L+1, y+8.5, L+7.5, y+0.5, L+14, y+8.5, 'F');
  doc.setFillColor(255,255,255);
  doc.triangle(L+5.4, y+8.5, L+7.5, y+5, L+9.6, y+8.5, 'F');
  F('italic',5.2); txt(org.assoc_line||'', L, y+11.6);
  F('bold',13); txt(org.invoice_title||'INVOICE #CC', (L+R)/2, y+5.5, {align:'center'});
  F('bold',7); txt(org.header_city||'', (L+R)/2, y+10, {align:'center'});
  F('bold',5.4);
  txt(org.addr1||'', R-1, y+3, {align:'right'}); txt(org.addr2||'', R-1, y+6, {align:'right'}); txt(org.addr3||'', R-1, y+9, {align:'right'});
  y += 14;

  /* поля */
  F('bold',7.4);
  txt('Date:', L, y); F('bold',7.8); txt(fmtUS(j.date), L+9, y);
  F('bold',7.4); txt('Unit #:', L+38, y); F('bold',7.8); txt(j.unit_number||'', L+49, y);
  box(L+72, y-2.5, !!fd.vacant, 2.6); F('bold',7); txt('Vacant', L+75.6, y);
  box(L+92, y-2.5, !!fd.occupied, 2.6); txt('Occupied', L+95.6, y);
  F('bold',7); txt('Technician:', C2-42, y); F('bold',7.6); txt(techNamesFor(j).slice(0,26), C2-26, y);
  y += 4.6;
  F('bold',7); txt('Property/Customer:', L, y);
  F('bold',7.4); txt((cp.name + ' — ' + cx.name).slice(0,58), L+27, y);
  y += 4.4;
  F('bold',7); txt('Address:', L, y);
  F('bold',7.2); txt((cx.address||'').slice(0,70), L+13, y);
  y += 3.4;

  /* таблица */
  const tTop = y;
  const rows = [];
  const row = (h)=>{ rows.push(y); const yy = y; y += h; return yy; };

  let ry = row(4.4);
  F('bold',7.2);
  txt('SERVICES', L+18, ry+3.1, {align:'center'});
  txt('DESCRIPTION', (C1+C2)/2, ry+3.1, {align:'center'});
  txt('AMOUNT', (C2+R)/2, ry+3.1, {align:'center'});

  const svc = (label, yy, on)=>{ F('bold',6.8); box(L+1.5, yy+0.9, on, 2.7); txt(label, L+5.4, yy+3.1); };
  const opt = (x, yy, on, label, fs=6.2)=>{ box(x, yy+0.9, on, 2.7); F('bold',fs); txt(label, x+3.5, yy+3.1); return x + 3.5 + doc.getTextWidth(label) + 3.2; };

  ry = row(4.8);
  svc('Steam Clean', ry, fd.steam.deep_scrub||fd.steam.rotovac);
  let x = opt(C1+2, ry, fd.steam.deep_scrub, 'Deep Scrub');
  x = opt(x, ry, fd.steam.rotovac, 'Rotovac');
  if ((fd.steam.deep_scrub||fd.steam.rotovac) && fd.steam.rooms>1){ F('bold',6.2); txt('Rooms: '+fd.steam.rooms, x, ry+3.1); }
  amt(sec.steam, ry+3.3);

  ry = row(4.8);
  svc('Removals', ry, ['red_stain','wax','rust','ink','gum','paint'].some(k=>fd.removals[k]));
  x = C1+2;
  [['red_stain','Red Stain'],['wax','Wax'],['rust','Rust'],['ink','Ink'],['gum','Gum'],['paint','Paint']].forEach(([k,l])=>{ x = opt(x, ry, fd.removals[k], l, 5.9); });
  amt(sec.removals, ry+3.3);

  ry = row(4.8);
  svc('Repairs', ry, ['threshold','stretch','seam','patch'].some(k=>fd.repairs[k]));
  x = C1+2;
  [['threshold','Threshold'],['stretch','Stretch'],['seam','Seam'],['patch','Patch']].forEach(([k,l])=>{ x = opt(x, ry, fd.repairs[k], l); });
  amt(sec.repairs, ry+3.3);

  ry = row(4.8);
  svc('Dye', ry, fd.dye.spot||fd.dye.full);
  x = opt(C1+2, ry, fd.dye.spot, 'Spot Dye'); opt(x, ry, fd.dye.full, 'Full Dye');
  amt(sec.dye, ry+3.3);

  ry = row(4.8);
  svc('Other', ry, fd.other.trash_out||fd.other.pad_removal);
  x = opt(C1+2, ry, fd.other.trash_out, 'Trash Out');
  x = opt(x, ry, fd.other.pad_removal, 'Pad Removal');
  if (fd.other.pad_removal && !fd.other.all_unit){ F('bold',6.2); txt('Rooms: '+(fd.other.rooms||1), x, ry+3.1); x += 14; }
  opt(x, ry, fd.other.all_unit, 'All Unit');
  amt(sec.other, ry+3.3);

  ry = row(4.8);
  x = opt(L+1.5, ry, fd.fog.fog, 'Fog', 6.8); opt(x, ry, fd.fog.goc, 'GOC', 6.8);
  x = opt(C1+2, ry, fd.fog.pet, 'Pet');
  x = opt(x, ry, fd.fog.smoke, 'Smoke');
  opt(x, ry, fd.fog.deodorizer, 'Deodorizer');
  amt(sec.fog, ry+3.3);

  ry = row(4.8);
  svc('Treatments', ry, fd.treatments.sealant||fd.treatments.mold||fd.treatments.degreaser);
  x = opt(C1+2, ry, fd.treatments.sealant, 'Sealant');
  x = opt(x, ry, fd.treatments.mold, 'Mold & Mildew');
  opt(x, ry, fd.treatments.degreaser, 'Degreaser');
  amt(sec.treatments, ry+3.3);

  ry = row(7.8);
  x = opt(L+1.5, ry, fd.wetvac.wet_vac, 'Wet Vac', 6.6); opt(x, ry, fd.wetvac.flood, 'Flood', 6.6);
  x = opt(C1+2, ry, fd.wetvac.sewer, 'Sewer');
  opt(x, ry, fd.wetvac.fresh, 'Fresh Water');
  x = C1+2;
  [['ktc','Ktc'],['lr','Lr'],['dr','Dr'],['hall','Hall'],['brs',"Br's"],['all','All Unit']].forEach(([k,l])=>{
    radio(x+1.2, ry+5.8, fd.wetvac.areas[k]); F('bold',5.9); txt(l, x+3.2, ry+6.8); x += 3.2 + doc.getTextWidth(l) + 4.4;
  });
  amt(sec.wetvac, ry+4.4);

  ry = row(7.2);
  box(L+1.5, ry+0.7, fd.airduct.air_duct, 2.5); F('bold',6.2); txt('Air Duct Cleaning', L+4.8, ry+2.9);
  box(L+1.5, ry+4.1, fd.airduct.dryer_vent, 2.5); txt('Dryer Vent Cleaning', L+4.8, ry+6.3);
  F('bold',6.2); txt('Bedrooms:', C1+2, ry+3.1);
  doc.rect(C1+15, ry+0.6, 5.5, 3.4); if (fd.airduct.air_duct){ F('bold',6.6); txt(String(fd.airduct.bedrooms||1), C1+17.7, ry+3.2, {align:'center'}); }
  if (fd.airduct.note){ F('bolditalic',6.4); txt(String(fd.airduct.note).slice(0,52), C1+24, ry+3.1); }
  amt(sec.airduct, ry+4);

  const eqList = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0)).slice(0,5);
  eqList.forEach((et, i)=>{
    ry = row(4.5);
    if (i===0) svc('Equipment Rental', ry, Object.values(fd.equipment).some(e=>+e.qty>0));
    const e = fd.equipment[et.id] || {qty:0, days:0};
    F('bold',6.4); txt(et.name, C1+2, ry+3.1);
    F('bold',6); txt('Qty', C1+32, ry+3.1);
    doc.rect(C1+38, ry+0.5, 5, 3.3); if (+e.qty>0){ F('bold',6.6); txt(String(e.qty), C1+40.5, ry+3.1, {align:'center'}); }
    F('bold',6); txt('For', C2-19, ry+3.1);
    doc.rect(C2-14, ry+0.5, 5, 3.3); if (+e.qty>0){ F('bold',6.6); txt(String(e.days||3), C2-11.5, ry+3.1, {align:'center'}); }
    F('bold',6); txt('Days', C2-8, ry+3.1);
    amt((+e.qty||0)*Math.max(1,+e.days||1)*eqDayPrice(et,p), ry+3.2);
  });

  ry = row(5);
  svc('Pad Installation', ry, !!fd.pad.size || fd.pad.all_unit || fd.pad.rooms>0);
  x = C1+3;
  [['q14','1/4'],['q12','1/2'],['q34','3/4'],['roll','1 Roll']].forEach(([k,l])=>{
    radio(x, ry+2.4, fd.pad.size===k); F('bold',6.2); txt(l, x+2, ry+3.3); x += 2 + doc.getTextWidth(l) + 4.6;
  });
  F('bold',6.2); txt('Rooms:', x, ry+3.3);
  doc.rect(x+9.5, ry+0.7, 5, 3.3); if (fd.pad.rooms>0){ F('bold',6.6); txt(String(fd.pad.rooms), x+12, ry+3.3, {align:'center'}); }
  radio(x+18.5, ry+2.4, fd.pad.all_unit); txt('All Unit', x+20.5, ry+3.3);
  amt(sec.pad, ry+3.4);

  const oth = (fd.others||[]).filter(o => (o.desc && o.desc.trim()) || +o.amount > 0);
  ry = row(4.6);
  F('bold',6.8); txt('OTHER SERVICES:', L+1.5, ry+3.2);
  if (oth[0]){ F('bolditalic',6.6); txt(String(oth[0].desc||'').slice(0,72), L+27, ry+3.2); amt(+oth[0].amount||0, ry+3.2); }
  doc.setLineWidth(.15); line(L+26, ry+3.9, C2-1, ry+3.9); doc.setLineWidth(.2);
  const rest = oth.slice(1);
  const exList = (fd.extra||[]);
  if (rest.length || !exList.length){
    ry = row(4.6);
    if (rest.length){
      F('bolditalic',6.6);
      txt(rest.map(o=>o.desc||'').join(' · ').slice(0,86), L+2, ry+3.2);
      amt(rest.reduce((s,o)=>s+(+o.amount||0),0), ry+3.2);
    }
    doc.setLineWidth(.15); line(L+1.5, ry+3.9, C2-1, ry+3.9); doc.setLineWidth(.2);
  }
  if (exList.length){
    const head = exList[0];
    ry = row(4.4);
    F('bolditalic',6.4); txt(extraItemTextEn(head).slice(0,88), L+2, ry+3.1);
    amt(extraLineTotal(head), ry+3.1);
    if (exList.length > 1){
      ry = row(4.4);
      const tail = exList.slice(1);
      F('bolditalic',6.2);
      txt(tail.map(extraItemTextEn).join(' · ').slice(0,92), L+2, ry+3.1);
      amt(tail.reduce((s,it)=>s+extraLineTotal(it),0), ry+3.1);
    }
  }

  if (j.note){
    ry = row(4.6);
    F('bold',6.6); txt('NOTES:', L+1.5, ry+3.2);
    F('bolditalic',6.4); txt(String(j.note).replace(/\s+/g,' ').slice(0,100), L+12, ry+3.2);
  }

  ry = row(6.6);
  F('bold',8.6); txt('TOTAL DUE $', C2-2, ry+3.6, {align:'right'});
  F('bold',4.6); txt('NET DUE 30 DAYS', C2-2, ry+5.9, {align:'right'});
  F('bold',9.4); txt(String(Math.round(grand*100)/100), R-2, ry+4.4, {align:'right'});

  const tBot = y;
  doc.setLineWidth(.35); doc.rect(L, tTop, W, tBot - tTop); doc.setLineWidth(.2);
  rows.forEach((yy,i)=>{ if (i>0) line(L, yy, R, yy); });
  line(C1, tTop, C1, tBot - (j.note ? 15.8 : 11.2) - 4.6);
  line(C2, tTop, C2, tBot);

  const terms = 'I AUTHORIZE ' + (org.company_name||'') + ' TO PERFORM THE WORK LISTED ABOVE AND AGREE WITH THE PRICE. PAYMENTS ARE DUE NET 30 DAYS. EQUIPMENT PLACED ON THE PROPERTY REMAINS PROPERTY OF ' + (org.company_short||'') + '.';
  F('bold',4.6);
  doc.splitTextToSize(terms, 190).slice(0,2).forEach((s,i)=>txt(s, (L+R)/2, y+2.6+i*2.4, {align:'center'}));
  y += 7.6;
  F('bold',6.6);
  txt('PRINT NAME', L+2, y+2.2); doc.setLineDashPattern([1,0.8],0); line(L+18, y+2.8, L+88, y+2.8);
  txt('SIGNATURE:', L+96, y+2.2); line(L+112, y+2.8, R-2, y+2.8); doc.setLineDashPattern([],0);
}

function batchPdf(){
  if (!window.jspdf){ toast('jsPDF not loaded', 'err'); return; }
  const all = repJobs();
  const js = all.filter(j => !jobIssues(j).length);
  const skipped = all.length - js.length;
  if (!js.length){ toast(t('rep_none') + (skipped?` · ⚠ ${skipped} ${t('batch_skipped')}`:''), 'err'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const HALF = 139.7;
  js.forEach((j, i) => {
    const pos = i % 2;
    if (i > 0 && pos === 0) doc.addPage();
    if (pos === 0){
      doc.setLineDashPattern([2,2],0); doc.setDrawColor(150);
      doc.line(6, HALF, 210, HALF);
      doc.setDrawColor(0); doc.setLineDashPattern([],0);
    }
    drawInvoiceHalf(doc, j, pos * HALF);
  });
  doc.save('Invoices_' + state.repFrom + '_' + state.repTo + '.pdf');
  toast('⬇ PDF: ' + js.length + (skipped?` · ⚠ ${skipped} ${t('batch_skipped')}`:''));
}

/* =====================================================================
   СПРАВОЧНИК: СОТРУДНИКИ (админ) — роли и видимость для менеджеров
   ===================================================================== */
function dirStaff(){
  const list = [...state.data.profiles].sort((a,b)=>a.display_name.localeCompare(b.display_name));
  return `<div class="card">` + list.map(u => `
    <div class="rowline">
      <span class="avatar role-${u.role}">${esc(initials(u.display_name))}</span>
      <div class="grow"><b>${esc(u.display_name)}</b><div class="tiny">@${esc(u.login)}</div></div>
      <select class="role-sel" onchange="App.setRole('${u.id}', this.value)" ${u.id===state.user.id?'disabled':''}>
        ${['tech','manager','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${t('role_'+r)}</option>`).join('')}
      </select>
      ${u.role==='manager' ? `<button class="btn btn-ghost sm" onclick="App.staffVis('${u.id}')">👁 ${t('vis_btn')}</button>` : ''}
    </div>`).join('') + `</div>
    <div class="tiny">${t('vis_hint')}</div>`;
}
async function setRole(uid_, role){
  const u = state.data.profiles.find(p=>p.id===uid_); if (!u) return;
  await dbUpsert('profiles', { ...u, role });
  toast('✓ ' + t('saved')); render();
}
function staffVis(managerId){
  const m = state.data.profiles.find(p=>p.id===managerId); if (!m) return;
  const hid = hiddenSetFor(managerId);
  const others = state.data.profiles.filter(p => p.id !== managerId);
  openModal(`
    ${modalHead('👁 ' + t('visibility') + ' — ' + esc(m.display_name))}
    <div class="tiny" style="margin-bottom:8px">${t('vis_hint')}</div>
    ${others.map(p=>`
      <label class="opt ${hid.has(p.id)?'':'on'}" style="width:100%;justify-content:flex-start;margin-bottom:6px">
        <input type="checkbox" data-vis="${p.id}" ${hid.has(p.id)?'':'checked'}>
        <span class="avatar role-${p.role}" style="width:26px;height:26px;font-size:.6rem">${esc(initials(p.display_name))}</span>
        ${esc(p.display_name)} <span class="tiny">(${t('role_'+p.role)})</span>
      </label>`).join('')}
    <button class="btn btn-green" onclick="App.saveVis('${managerId}')">${t('save')}</button>
  `);
}
async function saveVis(managerId){
  const hidNow = hiddenSetFor(managerId);
  const boxes = [...document.querySelectorAll('[data-vis]')];
  for (const b of boxes){
    const techId = b.dataset.vis;
    const hiddenWanted = !b.checked;
    const row = (state.data.hidden_staff||[]).find(h => h.manager_id === managerId && h.tech_id === techId);
    if (hiddenWanted && !row) await dbUpsert('hidden_staff', { id: uid(), manager_id: managerId, tech_id: techId });
    else if (!hiddenWanted && row) await dbDelete('hidden_staff', row.id);
  }
  closeModal(); toast('✓ ' + t('saved')); render();
}

/* =====================================================================
   v1.03: БРИГАДА / НАВИГАЦИЯ / АВТОСОХРАНЕНИЕ / КОПИРОВАНИЕ
   ===================================================================== */
function crewChipsHtml(j){
  const ids = [j.technician_id, ...(j.helper_ids||[])].filter(Boolean);
  if (!ids.length) return `<span class="tiny">—</span>`;
  return ids.map((id, i) => {
    const pr = state.data.profiles.find(p=>p.id===id);
    const nm = pr ? shortName(pr.display_name) : '?';
    const primary = i === 0;
    return `<span class="chip-tech ${primary?'primary':''}">
      ${esc(nm)}${primary ? '' : ` <button class="x" onclick="App.crewRemove('${id}')" aria-label="remove">✕</button>`}
    </span>`;
  }).join('');
}
function crewRefresh(){
  const box = $('#crew-chips'); if (box && jobDraft) box.innerHTML = crewChipsHtml(jobDraft);
  const sel = $('#crew-sel');
  if (sel && jobDraft){
    sel.innerHTML = `<option value="">${t('add_helper')}</option>` +
      state.data.profiles.filter(p=>p.id!==jobDraft.technician_id && !(jobDraft.helper_ids||[]).includes(p.id))
        .map(p=>`<option value="${p.id}">${esc(shortName(p.display_name))} (${t('role_'+p.role)})</option>`).join('');
  }
  const w = document.querySelector('.crew-box .tiny .warn');
  autosaveDraft();
}
function crewAdd(id){
  if (!id || !jobDraft) return;
  jobDraft.helper_ids = jobDraft.helper_ids || [];
  if (id !== jobDraft.technician_id && !jobDraft.helper_ids.includes(id)) jobDraft.helper_ids.push(id);
  crewRefresh();
}
function crewAll(){
  if (!jobDraft) return;
  jobDraft.helper_ids = state.data.profiles.map(p=>p.id).filter(id => id !== jobDraft.technician_id);
  crewRefresh();
}
function crewRemove(id){
  if (!jobDraft) return;
  jobDraft.helper_ids = (jobDraft.helper_ids||[]).filter(x=>x!==id);
  crewRefresh();
}

let autosaveT = null;
function autosaveDraft(){
  if (state.screen !== 'job' || !jobDraft) return;
  clearTimeout(autosaveT);
  autosaveT = setTimeout(() => {
    try{ localStorage.setItem('techlog_draft', JSON.stringify({ id: jobDraft.id, ts: Date.now(), draft: jobDraft })); }catch(e){}
  }, 400);
}

function navToCx(cxId){
  const cx = cxById(cxId); if (!cx) return;
  const q = (cx.lat!=null && cx.lng!=null) ? `${cx.lat},${cx.lng}` : (cx.address||cx.name);
  window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q), '_blank', 'noopener');
}
function copyText(s){
  navigator.clipboard?.writeText(s).then(()=>{ navigator.vibrate?.(20); toast('✓ ' + t('copied_code')); });
}

/* =====================================================================
   ДИАГНОСТИКА: активные проверки сервера + отчёт в консоль и на экран
   ===================================================================== */
async function runDiagnostics(){
  const L = [];
  const put = (s) => { L.push(s); };
  const mark = (ok) => ok ? '✅' : '⛔';
  const now = new Date();
  put(`TechLog v${APP_VERSION} · ${now.toLocaleDateString()} ${now.toLocaleTimeString()} (${now.toISOString()})`);
  put(`URL: ${location.href}`);
  put(`UA: ${navigator.userAgent}`);
  put(`online: ${navigator.onLine ? 'да' : 'нет'} · язык UI: ${state.lang} · экран: ${state.screen}`);
  put(`режим: ${HAS_SB ? 'Supabase' : 'ДЕМО (localStorage)'} · пользователь: ${state.user ? state.user.login + ' (' + state.user.role + ')' : '—'}`);
  put(`последняя синхронизация: ${state.lastSync || '—'}`);
  put('');

  // версия на сервере
  try{
    const r = await fetch('./version.json?ts=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    put(`${mark(true)} version.json на сервере: ${v.version}${v.version !== APP_VERSION ? ' (⚠ клиент ' + APP_VERSION + ' — обновите страницу)' : ''}`);
  }catch(e){ put(`${mark(false)} version.json недоступен: ${errStr(e)}`); }

  put(`${mark(!!window.supabase)} supabase-js ${window.supabase ? 'загружен' : 'НЕ загружен (CDN)'}`);
  put(`${mark(!!window.jspdf)} jsPDF ${window.jspdf ? 'загружен' : 'не загружен'}`);
  put(`${mark(!!window.L)} Leaflet ${window.L ? 'загружен' : 'не загружен'}`);

  if (HAS_SB){
    const base = CFG.SUPABASE_URL.replace(/\/$/, '');
    put('');
    put(`Supabase: ${base.replace('https://','')} · ключ: ${String(CFG.SUPABASE_ANON_KEY).slice(0,18)}… · почтовый домен: ${AUTH_DOMAIN}`);

    // Auth API
    try{
      const r = await fetch(base + '/auth/v1/health', { headers: { apikey: CFG.SUPABASE_ANON_KEY } });
      put(`${mark(r.ok)} Auth API (auth/v1/health): HTTP ${r.status}`);
    }catch(e){ put(`${mark(false)} Auth API недоступен: ${errStr(e)}`); }

    // REST API (401 без активной сессии — нормальный ответ)
    try{
      const r = await fetch(base + '/rest/v1/', { headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY } });
      const okish = r.ok || r.status === 401;
      put(`${mark(okish)} REST API (rest/v1): HTTP ${r.status}${r.status === 401 ? ' (401 без входа — норма)' : ''}`);
    }catch(e){ put(`${mark(false)} REST API недоступен: ${errStr(e)}`); }

    // сессия
    try{
      const { data: { session } } = await state.sb.auth.getSession();
      put(`${mark(true)} сессия: ${session ? 'активна (uid ' + session.user.id.slice(0,8) + '…, ' + (session.user.email||'') + ')' : 'нет (не выполнен вход)'}`);
    }catch(e){ put(`${mark(false)} getSession: ${errStr(e)}`); }

    // таблицы (главный признак невыполненного schema.sql)
    try{
      const { error, count } = await state.sb.from('profiles').select('id', { count: 'exact', head: true });
      if (error){
        const s = errStr(error);
        put(`${mark(false)} таблица profiles: ${s}${/42P01|does not exist|schema cache/i.test(s) ? '  ← ТАБЛИЦ НЕТ: выполните supabase/schema.sql целиком' : ''}`);
      } else put(`${mark(true)} таблица profiles: доступна${count!=null ? ' (видно строк: ' + count + ')' : ''}`);
    }catch(e){ put(`${mark(false)} profiles: ${errStr(e)}`); }

    // функция check_invite (пустой код → корректный ответ false)
    try{
      const { data, error } = await state.sb.rpc('check_invite', { code: '' });
      if (error){
        const s = errStr(error);
        const noFn = /PGRST202|schema cache|does not exist|find the function/i.test(s);
        put(`${mark(false)} функция check_invite: ${s}${noFn ? '  ← ФУНКЦИИ НЕТ: выполните supabase/schema.sql целиком' : ''}`);
      } else put(`${mark(data === false)} функция check_invite: отвечает (пустой код → ${data})`);
    }catch(e){ put(`${mark(false)} check_invite: ${errStr(e)}`); }

    // функции регистрации v1.03.04
    try{
      const { data, error } = await state.sb.rpc('login_available', { p_login: 'zz_diag_probe_999' });
      if (error){
        const s = errStr(error);
        put(`${mark(false)} функция login_available: ${s}${/PGRST202|find the function/i.test(s) ? '  ← выполните НОВУЮ schema.sql (v1.03.04)' : ''}`);
      } else put(`${mark(data === true)} функция login_available: отвечает (тестовый логин свободен: ${data})`);
    }catch(e){ put(`${mark(false)} login_available: ${errStr(e)}`); }
    try{
      const { data, error } = await state.sb.rpc('signup_precheck', { p_login: '', p_invite: '' });
      if (error){
        const s = errStr(error);
        put(`${mark(false)} функция signup_precheck: ${s}${/PGRST202|find the function/i.test(s) ? '  ← выполните НОВУЮ schema.sql (v1.03.04)' : ''}`);
      } else put(`${mark(data === 'BAD_LOGIN')} функция signup_precheck: отвечает (пустой ввод → ${data})`);
    }catch(e){ put(`${mark(false)} signup_precheck: ${errStr(e)}`); }

    // справочник (виден и без входа? нет — RLS; ошибки 42P01 важнее)
    try{
      const { error } = await state.sb.from('work_types').select('id').limit(1);
      if (error) put(`${mark(false)} таблица work_types: ${errStr(error)}`);
      else put(`${mark(true)} таблица work_types: доступна`);
    }catch(e){ put(`${mark(false)} work_types: ${errStr(e)}`); }
  }

  // Синхронизация и запись
  put('');
  put('— синхронизация —');
  put(`последняя: ${state.lastSync || '—'}${state.data && state.data._syncMs ? ' · ' + state.data._syncMs + ' мс · таблиц ок: ' + (state.data._syncOk||'?') : ''}`);
  if (SYNC_ERRORS.length){
    SYNC_ERRORS.forEach(x => put(`⛔ таблица ${x.tb}: ${x.err}`));
  } else put('✅ ошибок таблиц в последней синхронизации нет');
  if (WRITE_ERRORS.length){
    put(`⛔ ошибки записи (${WRITE_ERRORS.length} последних):`);
    WRITE_ERRORS.slice(-8).forEach(w => put(`   ${w.at} · ${w.op} ${w.table} ${w.id}: ${w.err}`));
  } else put('✅ ошибок записи в этой сессии нет');

  // PWA / установка
  put('');
  put('— PWA —');
  put(`${mark(true)} режим запуска: ${isStandalone() ? 'установленное приложение (standalone)' : 'вкладка браузера'}`);
  try{
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    put(`${mark(!!(reg && (reg.active||reg.installing||reg.waiting)))} service worker: ${reg ? (reg.active ? 'активен' : 'устанавливается') : 'не зарегистрирован'} · контролирует страницу: ${navigator.serviceWorker && navigator.serviceWorker.controller ? 'да' : 'нет (обновите страницу)'}`);
  }catch(e){ put(`${mark(false)} service worker: ${errStr(e)}`); }
  try{
    const r = await fetch('./manifest.webmanifest', { cache: 'no-store' });
    if (r.ok){
      const m = await r.json();
      put(`${mark(m.display === 'standalone')} манифест: ok · display=${m.display} · иконок: ${(m.icons||[]).length}`);
    } else put(`${mark(false)} манифест: HTTP ${r.status}`);
  }catch(e){ put(`${mark(false)} манифест: ${errStr(e)}`); }
  for (const ic of ['./icons/icon-192.png','./icons/icon-512.png']){
    try{
      const r = await fetch(ic, { method: 'HEAD', cache: 'no-store' });
      put(`${mark(r.ok)} ${ic.replace('./icons/','иконка ')}: HTTP ${r.status}${!r.ok ? '  ← файл не залит на сервер — установка невозможна' : ''}`);
    }catch(e){ put(`${mark(false)} ${ic}: ${errStr(e)}`); }
  }
  put(`${mark(!!pwaPrompt || isStandalone())} предложение установки: ${isStandalone() ? 'не нужно (уже установлено)' : pwaPrompt ? 'получено — кнопка «Установить приложение» активна' : 'ещё не поступало от браузера'}`);

  // хвост журнала
  put('');
  put('— последние события журнала —');
  DIAG.slice(-20).forEach(s => put(s));

  const report = L.join('\n');
  console.group('%cTechLog · Диагностика', 'color:#58CC02;font-weight:bold');
  console.log(report);
  console.groupEnd();
  return report;
}

async function showDiagnostics(){
  toast('🩺 ' + t('diag_running'), 'inf');
  let report = '';
  try{ report = await runDiagnostics(); }
  catch(e){ report = '⛔ Диагностика упала: ' + errStr(e); dlog(report); }
  openModal(`
    ${modalHead('🩺 ' + t('diag'))}
    <pre class="diag-pre">${esc(report)}</pre>
    <button class="btn btn-blue" onclick="App.copyDiag()">📋 ${t('diag_copy')}</button>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="App.closeModal()">${t('close')}</button>
  `);
  window.__lastDiag = report;
}
function copyDiag(){
  navigator.clipboard?.writeText(window.__lastDiag || '').then(()=>toast('✓ ' + t('copied')));
}

/* ---- Живая проверка логина в форме регистрации ---- */
let loginCheckT = null, loginCheckLast = '';
function setLoginStatus(kind, extra){
  const el = document.getElementById('su-login-st'); if (!el) return;
  if (kind === 'hint'){ el.textContent = t('login_hint'); el.style.color = ''; }
  else if (kind === 'checking'){ el.textContent = '… ' + t('login_checking'); el.style.color = ''; }
  else if (kind === 'free'){ el.textContent = '✓ ' + t('login_free'); el.style.color = 'var(--green)'; }
  else if (kind === 'taken'){ el.textContent = '⛔ ' + t('login_taken'); el.style.color = 'var(--red)'; }
  else if (kind === 'bad'){ el.textContent = t('login_hint'); el.style.color = 'var(--yellow)'; }
  else if (kind === 'err'){ el.textContent = '… ' + (extra||''); el.style.color = ''; }
}
function loginTyped(){
  clearTimeout(loginCheckT);
  setLoginStatus('hint');
  loginCheckT = setTimeout(loginCheck, 600);
}
async function loginCheck(){
  clearTimeout(loginCheckT);
  const inp = document.getElementById('su-login'); if (!inp || !HAS_SB) return;
  const login = inp.value.trim().toLowerCase();
  if (!login) { setLoginStatus('hint'); return; }
  if (!LOGIN_RE.test(login)){ setLoginStatus('bad'); return; }
  if (login === loginCheckLast) return; // уже проверяли этот вариант
  setLoginStatus('checking');
  try{
    const { data: free, error } = await state.sb.rpc('login_available', { p_login: login });
    if (error){
      dlog('login_available:', error);
      setLoginStatus('err', /PGRST202|find the function/i.test(errStr(error)) ? t('run_new_schema') : '');
      return;
    }
    loginCheckLast = login;
    dlog('auth: login_available(' + login + ') →', free);
    setLoginStatus(free ? 'free' : 'taken');
  }catch(e){ dlog('⛔ login_available exception:', e); setLoginStatus('err'); }
}

/* =====================================================================
   PWA: перехват установки + своя кнопка «Установить приложение»
   ===================================================================== */
let pwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaPrompt = e;
  dlog('PWA: beforeinstallprompt получен — критерии установки выполнены');
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  dlog('PWA: appinstalled — приложение установлено');
  pwaPrompt = null;
  toast('✓ ' + t('installed_ok'));
  render();
});
function isStandalone(){
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
async function installPwa(){
  if (!pwaPrompt){ toast(t('install_no_prompt'), 'inf'); return; }
  dlog('PWA: показываю системный диалог установки…');
  pwaPrompt.prompt();
  try{
    const { outcome } = await pwaPrompt.userChoice;
    dlog('PWA: результат установки →', outcome);
    if (outcome !== 'accepted') toast(t('install_declined'), 'inf');
  }catch(e){ dlog('⛔ PWA install:', e); }
  pwaPrompt = null;
}

/* =====================================================================
   v1.04: FAQ · перевод заметки на EN · свайпы по дням · журнал · БД-диагностика
   ===================================================================== */

/* ---------- Мини-FAQ ---------- */
function faqHtml(){
  if (state.lang === 'en') return `
    <h4>🧭 How it works</h4>
    <p>One job = one unit in an apartment complex. Tap <b>＋</b>, pick date → counterparty → complex → unit → work type. Inside the job you check the services — prices fill in automatically and the total recalculates live. Mark it done; an admin can approve it (editing the final amount). If a non-admin changes the price after approval, the approval is reset. The <b>PDF</b> button builds an invoice that mirrors the paper form.</p>
    <h4>📚 Directories</h4>
    <p><b>Counterparties</b> — apartment networks. <b>Complexes</b> — their properties: address, gate code, map coordinates. <b>Work types</b> — name, color and the extra gear it requires. <b>Equipment</b> — rental units (BLW, DHM, SCR, OZN) with a $/day price. <b>Extra gear</b> — what to bring along. <b>PRICE</b> — the standard price list. <b>Staff</b> (admin) — roles and per-manager visibility.</p>
    <h4>💲 Standard vs individual prices</h4>
    <p>The <b>PRICE</b> tab is the default price list for everyone. To set special prices for a network: Directories → Counterparties → open one → <b>Prices</b> tab. Tick the checkbox next to a line to switch it to an <b>individual price</b> and type your value; untick — the standard price applies again. A new counterparty automatically receives a copy of the standard list.</p>
    <h4>🗂 Reports</h4>
    <p>Per <b>unit</b>: open the job and press PDF. Per <b>period</b> (a day, a week, a month): bottom tab <b>Reports</b> → pick the dates → download a single PDF with all invoices, two per Letter page. Managers also get the <b>Pickups</b> report for any date.</p>
    <h4>⚠️ Priority & ordering</h4>
    <p>Every trip card has a control rail: the red <b>“!” triangle</b> marks a “go first” object (priority items float to the top), and <b>▲▼</b> arrows reorder trips within the day. The order is shared between jobs and pickups.</p>
    <h4>🔑 Access codes & requests</h4>
    <p>A complex has two codes: 🔑 general and 📟 callbox (a toggle marks it as the 🚧 <b>gate</b> code). Anyone can edit: admins apply instantly, others submit a <b>request</b> the admin approves or rejects (inbox at the top of the Complexes tab). The 📖 button shows the full <b>history</b> — who entered which code and when; next to the current code you see since when it’s valid and who added it.</p>
    <h4>🧰 Note templates & purchases</h4>
    <p>In the Note block, <b>＋ Template</b> inserts items from the “Extra works” directory: a work flagged with a size shows an input in the right units (📏 “Sizes”: ft, sq ft, lb, pcs), while “🛒 Purchase” opens the “Products” list with quantity and a <b>price</b> that flows into the total and prints as its own PDF line. All three directories are admin-managed.</p>
    <h4>📦 Automatic pickups</h4>
    <p>Fill <b>Equipment Rental</b> (qty × days) and save — the app creates pickups due on <i>job date + days</i> (72 h by default). On the due day they appear on Home with colored equipment dots and a banner; overdue ones turn red. Everything can be shown on the <b>day map</b> with a Google Maps route.</p>`;
  return `
    <h4>🧭 Как всё устроено</h4>
    <p>Одна работа = один юнит в апарт-комплексе. Жмёте <b>＋</b>, выбираете дату → контрагента → комплекс → юнит → вид работы. Внутри работы отмечаете услуги галочками — цены подставляются сами, итог пересчитывается на лету. Отметили «выполнено» — админ может поставить апрув (с правкой итоговой суммы). Если после апрува не-админ меняет стоимость — апрув снимается. Кнопка <b>PDF</b> собирает инвойс, повторяющий бумажную форму.</p>
    <h4>📚 Какие есть справочники</h4>
    <p><b>Контрагенты</b> — сети апартаментов. <b>Комплексы</b> — их объекты: адрес, код доступа, координаты для карты. <b>Виды работ</b> — название, цвет и нужное доп. оборудование. <b>Оборудование</b> — то, что сдаётся в аренду (BLW, DHM, SCR, OZN) с ценой $/сутки. <b>Доп. оборудование</b> — что взять с собой на выезд. <b>PRICE</b> — стандартный прейскурант. <b>Сотрудники</b> (админ) — роли и видимость для менеджеров.</p>
    <h4>💲 Стандартные и индивидуальные цены</h4>
    <p>Вкладка <b>PRICE</b> — базовый прейскурант, действует для всех. Чтобы задать особые цены сети апартаментов: Справочники → Контрагенты → откройте нужного → вкладка <b>Цены</b>. Чекбокс напротив позиции включает <b>индивидуальную цену</b> — вводите свою; сняли галочку — снова действует стандартная. Новому контрагенту прайс копируется автоматически.</p>
    <h4>🗂 Отчёты</h4>
    <p>За <b>юнит</b>: откройте работу и нажмите PDF. За <b>период</b> (день, неделя, месяц): нижняя вкладка <b>Отчёты</b> → выбираете даты → скачиваете единый PDF со всеми инвойсами, по два на страницу Letter. Менеджеру доступен и отчёт по <b>пикапам</b> на любую дату.</p>
    <h4>⚠️ Приоритет и очерёдность</h4>
    <p>Слева на каждой карточке поездки — рельса управления: красный <b>треугольник «!»</b> помечает объект «ехать первым» (приоритетные всегда вверху списка), стрелки <b>▲▼</b> меняют очерёдность внутри дня. Порядок общий для работ и пикапов.</p>
    <h4>🔑 Коды доступа и заявки</h4>
    <p>У комплекса два кода: 🔑 общий и 📟 callbox (переключателем помечается, что это код от 🚧 <b>ворот</b>). Изменить может каждый: админ — сразу, остальные отправляют <b>заявку</b>, которую админ подтверждает или отклоняет (входящие — вверху вкладки «Комплексы»). Кнопка 📖 показывает <b>историю</b> изменений: кто, когда и какой код вводил; рядом с текущим кодом видно, с какой даты он действует и кто его добавил.</p>
    <h4>🧰 Шаблоны заметки и покупки</h4>
    <p>В блоке «Заметка» кнопка <b>＋ Шаблон</b> подставляет позиции из справочника «Доп. работы»: у работы с флагом размера появляется поле в нужных единицах (📏 «Размеры»: футы, sq ft, паунды, штуки), а «🛒 Покупка товара» открывает выбор из справочника «Товары», количество и <b>цену</b> — она попадает в итог и печатается в PDF отдельной строкой. Все три справочника редактирует администратор.</p>
    <h4>📦 Пикапы формируются сами</h4>
    <p>Заполните <b>Equipment Rental</b> (кол-во × дни) и сохраните — приложение создаст пикапы со сроком <i>дата работы + дни</i> (по умолчанию 72 часа). В день срока они появятся на «Главной» с цветными кружками оборудования и баннером; просроченные подсвечиваются красным. Всё это выводится на <b>карту дня</b> с маршрутом Google Maps.</p>`;
}
function faqModal(){
  openModal(`
    ${modalHead('❓ ' + t('faq'))}
    <div class="faq-body">${faqHtml()}</div>
    <button class="btn btn-ghost" onclick="App.closeModal()">${t('close')}</button>
  `);
}

/* ---------- Перевод заметки на английский (MyMemory, без ключей) ---------- */
function decodeEntities(s){
  const d = document.createElement('textarea'); d.innerHTML = s; return d.value;
}
async function translateToEn(taId){
  const ta = document.getElementById(taId); if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  toast('🌐 ' + t('translating'), 'inf');
  dlog('translate: ru→en,', text.length, 'символов');
  const chunks = [];
  let buf = '';
  text.split(/(?<=[.!?…])\s+/).forEach(s => {
    if ((buf + ' ' + s).length > 450){ if (buf) chunks.push(buf); buf = s; }
    else buf = buf ? buf + ' ' + s : s;
  });
  if (buf) chunks.push(buf);
  try{
    const out = [];
    for (const ch of chunks){
      const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(ch) + '&langpair=ru|en');
      const js = await r.json();
      const tr = js && js.responseData && js.responseData.translatedText;
      if (!tr) throw new Error(js && js.responseDetails || 'empty');
      out.push(decodeEntities(tr));
    }
    ta.value = out.join(' ');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    dlog('translate: ок');
  }catch(e){
    dlog('⛔ translate:', e);
    toast('⛔ ' + t('translate_err'), 'err');
  }
}

/* ---------- Свайпы по дням недели (влево/вправо, будни) ---------- */
function shiftWorkday(iso, dir){
  return addDaysISO(iso, dir); // показаны все 7 дней — листаем без пропусков
}
let swX = null, swY = null;
function initSwipes(){
  const root = $('#app');
  root.addEventListener('touchstart', (e) => {
    if (state.screen !== 'home') { swX = null; return; }
    if (!e.target.closest('.week, .day-bar')) { swX = null; return; }
    swX = e.touches[0].clientX; swY = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (swX == null) return;
    const dx = e.changedTouches[0].clientX - swX;
    const dy = e.changedTouches[0].clientY - swY;
    swX = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5){
      App.swipeDay(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

/* ---------- Журнал событий ---------- */
function showLogModal(){
  const txt = PLOG.slice(-220).join('\n') || '—';
  window.__lastLog = txt;
  openModal(`
    ${modalHead('🧾 ' + t('log_title'))}
    <pre class="diag-pre">${esc(txt)}</pre>
    <button class="btn btn-blue" onclick="App.copyLog()">📋 ${t('diag_copy')}</button>
    <button class="btn btn-red" style="margin-top:8px" onclick="App.clearLog()">🗑 ${t('clear')}</button>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="App.closeModal()">${t('close')}</button>
  `);
}
function copyLog(){ navigator.clipboard?.writeText(window.__lastLog || '').then(()=>toast('✓ ' + t('copied'))); }
function clearLog(){ PLOG.length = 0; try{ localStorage.removeItem('techlog_log'); }catch(e){} closeModal(); toast('🗑 ' + t('deleted')); }

/* ---------- Диагностика БД по всем таблицам (только админ) ---------- */
async function runDbDiagnostics(){
  const L = [];
  const now = new Date();
  L.push(`TechLog v${APP_VERSION} · БД-диагностика · ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
  L.push(`Проект: ${(CFG.SUPABASE_URL||'').replace('https://','')} · роль: ${state.user?.role} · uid: ${(state.user?.id||'').slice(0,8)}…`);
  L.push('');
  const tbs = [...TABLES, 'org_settings', 'app_secrets'];
  for (const tb of tbs){
    const t0 = Date.now();
    try{
      const { count, error } = await state.sb.from(tb).select('*', { count: 'exact', head: true });
      const ms = Date.now() - t0;
      if (error){
        const s = errStr(error);
        const miss = /42P01|does not exist|schema cache/i.test(s);
        const denied = tb === 'app_secrets' && /permission|denied|42501/i.test(s);
        L.push(`${denied ? '✅' : '⛔'} ${tb}: ${denied ? 'доступ закрыт (RLS работает как надо)' : s}${miss ? '  ← таблицы нет: выполните schema.sql' : ''} · ${ms} мс`);
      } else {
        L.push(`✅ ${tb}: строк видно ${count ?? '?'} · ${ms} мс`);
      }
    }catch(e){ L.push(`⛔ ${tb}: ${errStr(e)}`); }
  }
  L.push('');
  for (const [fn, args, expect] of [
    ['check_invite', { code: '' }, false],
    ['login_available', { p_login: 'zz_diag_probe_999' }, true],
    ['signup_precheck', { p_login: '', p_invite: '' }, 'BAD_LOGIN'],
  ]){
    const t0 = Date.now();
    try{
      const { data, error } = await state.sb.rpc(fn, args);
      const ms = Date.now() - t0;
      if (error) L.push(`⛔ функция ${fn}: ${errStr(error)} · ${ms} мс`);
      else L.push(`${data === expect ? '✅' : '⚠️'} функция ${fn}: → ${data} · ${ms} мс`);
    }catch(e){ L.push(`⛔ функция ${fn}: ${errStr(e)}`); }
  }
  L.push('');
  L.push(`локальный кеш: ${TABLES.map(tb => tb + '=' + ((state.data||{})[tb]||[]).length).join(' ')}`);
  L.push(`последняя синхронизация: ${state.lastSync || '—'}${state.data && state.data._syncMs ? ' · ' + state.data._syncMs + ' мс' : ''}`);
  if (SYNC_ERRORS.length){
    L.push('');
    L.push('ошибки таблиц последней синхронизации:');
    SYNC_ERRORS.forEach(x => L.push(`⛔ ${x.tb}: ${x.err}`));
  }
  if (WRITE_ERRORS.length){
    L.push('');
    L.push(`ошибки записи за сессию (${WRITE_ERRORS.length}):`);
    WRITE_ERRORS.forEach(w => L.push(`⛔ ${w.at} · ${w.op} ${w.table} ${w.id}: ${w.err}`));
  }
  const report = L.join('\n');
  console.group('%cTechLog · БД-диагностика', 'color:#1CB0F6;font-weight:bold');
  console.log(report);
  console.groupEnd();
  dlog('db-diag: выполнена,', tbs.length, 'таблиц');
  return report;
}
async function showDbDiagnostics(){
  if (!isAdmin()){ toast('⛔ ' + t('admin_only'), 'err'); return; }
  toast('🗄 ' + t('checking_tables'), 'inf');
  let report = '';
  try{ report = await runDbDiagnostics(); }
  catch(e){ report = '⛔ ' + errStr(e); dlog('⛔ db-diag:', e); }
  window.__lastDiag = report;
  openModal(`
    ${modalHead('🗄 ' + t('db_diag'))}
    <pre class="diag-pre">${esc(report)}</pre>
    <button class="btn btn-blue" onclick="App.copyDiag()">📋 ${t('diag_copy')}</button>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="App.closeModal()">${t('close')}</button>
  `);
}

/* =====================================================================
   v1.05: приоритет и очерёдность поездок
   ===================================================================== */
function dayTripJobIds(iso){
  const ids = [];
  jobsOn(iso).forEach(j => { if (!ids.includes(j.id)) ids.push(j.id); });
  pickupsOn(iso).filter(p=>!p.picked_up).forEach(p => { if (!ids.includes(p.job_id)) ids.push(p.job_id); });
  // единый порядок: приоритет → sort_order → создание
  return ids.sort((a,b) => jobSortCmp(
    state.data.jobs.find(x=>x.id===a) || {sort_order:999},
    state.data.jobs.find(x=>x.id===b) || {sort_order:999}));
}
async function togglePriority(id){
  const j = state.data.jobs.find(x=>x.id===id); if (!j || !canReorder(j)) return;
  await dbUpsert('jobs', { ...j, priority: !j.priority, updated_at: new Date().toISOString() });
  navigator.vibrate?.(20);
  dlog('priority:', j.unit_number || id, '→', !j.priority);
  render();
}
async function moveJob(id, dir){
  const iso = state.selDate;
  const order = dayTripJobIds(iso);
  const i = order.indexOf(id);
  const k = i + dir;
  if (i < 0 || k < 0 || k >= order.length) return;
  const a = state.data.jobs.find(x=>x.id===order[i]);
  const b = state.data.jobs.find(x=>x.id===order[k]);
  if (!a || !b) return;
  if (!canReorder(a)) return;
  // нормализуем порядок дня, затем меняем соседей местами
  const seq = order.map((jid, idx) => ({ jid, so: idx }));
  const t1 = seq[i].so; seq[i].so = seq[k].so; seq[k].so = t1;
  for (const { jid, so } of seq){
    const jj = state.data.jobs.find(x=>x.id===jid);
    if (jj && (jj.sort_order !== so)){
      if (canReorder(jj)) await dbUpsert('jobs', { ...jj, sort_order: so, updated_at: new Date().toISOString() });
      else jj.sort_order = so; // чужие — только локально для отображения
    }
  }
  navigator.vibrate?.(15);
  render();
}

/* =====================================================================
   v1.05: коды доступа — callbox/ворота, заявки админу, история
   ===================================================================== */
function codeLineHtml(cx, compact){
  const parts = [];
  if (cx.access_code) parts.push(`<button class="key-copy" onclick="event.stopPropagation();App.copyText('${esc(cx.access_code)}')">🔑 ${esc(cx.access_code)}</button>`);
  if (cx.callbox_code) parts.push(`<button class="key-copy" onclick="event.stopPropagation();App.copyText('${esc(cx.callbox_code)}')">${cx.callbox_gate ? '🚧' : '📟'} ${esc(cx.callbox_code)}</button>`);
  return parts.join(compact ? ' · ' : ' &nbsp; ');
}
function cxHistory(cxId){
  return (state.data.complex_code_history || [])
    .filter(h => h.complex_id === cxId)
    .sort((a,b) => String(b.changed_at||'').localeCompare(String(a.changed_at||'')));
}
function lastCodeMeta(cxId){
  const h = cxHistory(cxId)[0];
  return h ? { date: h.changed_at, by: h.changed_by } : null;
}
function firstSeenOf(cxId, field, value){
  if (!value) return null;
  const list = cxHistory(cxId).filter(h => h.field === field && h.new_value === value);
  return list.length ? list[list.length - 1] : null;
}
function firstSeenLine(cxId, field, value){
  const f = firstSeenOf(cxId, field, value);
  if (!f) return '';
  return `<span class="tiny">${t('since')} ${fmtDMY(String(f.changed_at).slice(0,10))} · ${esc(profName(f.changed_by))}</span>`;
}
function pendingCodeRequests(){
  return (state.data.code_requests || []).filter(r => r.status === 'pending');
}

/* модалка истории кодов */
function codeHistoryModal(cxId){
  const cx = cxById(cxId); if (!cx) return;
  const rows = cxHistory(cxId);
  const cur = `
    <div class="rowline"><div class="grow">🔑 ${esc(cx.access_code||'—')} ${firstSeenLine(cxId,'access',cx.access_code)}</div></div>
    <div class="rowline"><div class="grow">${cx.callbox_gate?'🚧':'📟'} ${esc(cx.callbox_code||'—')}
      <span class="tiny">(${cx.callbox_gate ? t('target_gate') : t('target_callbox')})</span> ${firstSeenLine(cxId,'callbox',cx.callbox_code)}</div></div>`;
  const hist = rows.length ? rows.map(h => `
    <div class="rowline">
      <div class="grow" style="font-size:.8rem">
        ${h.field==='access'?'🔑':(h.gate?'🚧':'📟')}
        <s style="color:var(--dim-2)">${esc(h.old_value||'—')}</s> → <b>${esc(h.new_value||'—')}</b>
        ${h.source==='request' ? `<span class="chip">${t('req_by')}</span>` : ''}
        <div class="tiny">${fmtDMY(String(h.changed_at).slice(0,10))} ${String(h.changed_at).slice(11,16)} · ${t('by_word')}: ${esc(profName(h.changed_by))}</div>
      </div>
    </div>`).join('') : `<div class="tiny">${t('no_history')}</div>`;
  openModal(`
    ${modalHead('📖 ' + t('code_history') + ' — ' + esc(cx.name))}
    ${cur}
    <hr class="sep">
    ${hist}
    <button class="btn btn-ghost" style="margin-top:10px" onclick="App.closeModal()">${t('close')}</button>
  `);
}

/* заявка на код (доступна всем; не-админ → на решение админу) */
function proposeCodeModal(cxId){
  const cx = cxById(cxId); if (!cx) return;
  openModal(`
    ${modalHead('🔑 ' + t('propose_code') + ' — ' + esc(cx.name))}
    <div class="form-row"><span class="lbl">${t('access_code')}</span>
      <input id="pc-access" value="${esc(cx.access_code||'')}"></div>
    <div class="form-row"><span class="lbl">${t('callbox')}</span>
      <input id="pc-callbox" value="${esc(cx.callbox_code||'')}"></div>
    <div class="form-row"><span class="lbl">${t('code_target')}</span>
      <div class="tabs">
        <button class="tabbtn ${!cx.callbox_gate?'active':''}" data-gate="0" onclick="App.pcGate(this)">📟 ${t('target_callbox')}</button>
        <button class="tabbtn ${cx.callbox_gate?'active':''}" data-gate="1" onclick="App.pcGate(this)">🚧 ${t('target_gate')}</button>
      </div>
      <input type="hidden" id="pc-gate" value="${cx.callbox_gate?1:0}"></div>
    <button class="btn btn-green" onclick="App.submitCode('${cx.id}')">${isAdmin() ? t('save') : '📨 ' + t('propose_code')}</button>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="App.closeModal();App.codeHistory('${cx.id}')">📖 ${t('history')}</button>
  `);
}
function pcGate(btn){
  btn.parentElement.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $('#pc-gate').value = btn.dataset.gate;
}
async function applyCodeChange(cx, access, callbox, gate, changedBy, source){
  const now = new Date().toISOString();
  if (access !== null && access !== (cx.access_code||'')){
    await dbUpsert('complex_code_history', { id: uid(), complex_id: cx.id, field: 'access',
      old_value: cx.access_code||'', new_value: access, gate: null, changed_by: changedBy, changed_at: now, source });
    cx.access_code = access;
  }
  const gateChanged = gate !== null && !!gate !== !!cx.callbox_gate;
  if ((callbox !== null && callbox !== (cx.callbox_code||'')) || (gateChanged && (callbox !== null || cx.callbox_code))){
    await dbUpsert('complex_code_history', { id: uid(), complex_id: cx.id, field: 'callbox',
      old_value: cx.callbox_code||'', new_value: callbox !== null ? callbox : (cx.callbox_code||''),
      gate: gate !== null ? !!gate : !!cx.callbox_gate, changed_by: changedBy, changed_at: now, source });
  }
  if (callbox !== null) cx.callbox_code = callbox;
  if (gate !== null) cx.callbox_gate = !!gate;
  await dbUpsert('complexes', { ...cx });
}
async function submitCode(cxId){
  const cx = cxById(cxId); if (!cx) return;
  const access = $('#pc-access').value.trim();
  const callbox = $('#pc-callbox').value.trim();
  const gate = $('#pc-gate').value === '1';
  const changed = access !== (cx.access_code||'') || callbox !== (cx.callbox_code||'') || gate !== !!cx.callbox_gate;
  if (!changed){ toast(t('no_changes'), 'inf'); return; }
  if (isAdmin()){
    await applyCodeChange(cx, access, callbox, gate, state.user.id, 'direct');
    dlog('codes: админ обновил коды', cx.abbr||cx.name);
    closeModal(); toast('✓ ' + t('saved')); render();
    return;
  }
  const req = {
    id: uid(), complex_id: cx.id,
    access_code: access !== (cx.access_code||'') ? access : null,
    callbox_code: callbox !== (cx.callbox_code||'') ? callbox : null,
    callbox_gate: gate !== !!cx.callbox_gate ? gate : null,
    requested_by: state.user.id, requested_at: new Date().toISOString(),
    status: 'pending', decided_by: null, decided_at: null
  };
  await dbUpsert('code_requests', req);
  dlog('codes: заявка на коды', cx.abbr||cx.name, 'от', state.user.login);
  closeModal(); toast('📨 ' + t('request_sent')); render();
}
async function decideCodeReq(reqId, approve){
  if (!isAdmin()) return;
  const r = (state.data.code_requests||[]).find(x=>x.id===reqId); if (!r || r.status!=='pending') return;
  const cx = cxById(r.complex_id);
  if (approve && cx){
    await applyCodeChange(cx,
      r.access_code !== null && r.access_code !== undefined ? r.access_code : null,
      r.callbox_code !== null && r.callbox_code !== undefined ? r.callbox_code : null,
      r.callbox_gate !== null && r.callbox_gate !== undefined ? r.callbox_gate : null,
      r.requested_by, 'request');
  }
  await dbUpsert('code_requests', { ...r, status: approve ? 'approved' : 'rejected',
    decided_by: state.user.id, decided_at: new Date().toISOString() });
  dlog('codes:', approve ? 'апрув' : 'отклонение', 'заявки', reqId.slice(0,8));
  toast(approve ? '✓ ' + t('req_approved') : '✕ ' + t('req_rejected'));
  render();
}
function codeRequestsHtml(){
  if (!isAdmin()) return '';
  const list = pendingCodeRequests();
  if (!list.length) return '';
  return `<div class="card" style="border-color:var(--yellow)">
    <div style="font-weight:900;margin-bottom:6px">🔔 ${t('code_requests')} (${list.length})</div>
    ${list.map(r => {
      const cx = cxById(r.complex_id) || {name:'?'};
      const ch = [];
      if (r.access_code !== null && r.access_code !== undefined) ch.push(`🔑 ${esc(cx.access_code||'—')} → <b>${esc(r.access_code)}</b>`);
      if (r.callbox_code !== null && r.callbox_code !== undefined) ch.push(`📟 ${esc(cx.callbox_code||'—')} → <b>${esc(r.callbox_code)}</b>`);
      if (r.callbox_gate !== null && r.callbox_gate !== undefined) ch.push(`${r.callbox_gate?'🚧 '+t('target_gate'):'📟 '+t('target_callbox')}`);
      return `<div class="rowline">
        <div class="grow" style="font-size:.82rem">
          <b>${esc(cx.name)}</b> · <span class="tiny">${t('req_by')} ${esc(profName(r.requested_by))} · ${fmtDMY(String(r.requested_at).slice(0,10))}</span>
          <div class="tiny">${ch.join(' · ') || t('no_changes')}</div>
        </div>
        <button class="btn btn-green sm" onclick="App.decideReq('${r.id}',true)">✓</button>
        <button class="btn btn-red sm" onclick="App.decideReq('${r.id}',false)">✕</button>
      </div>`;
    }).join('')}
  </div>`;
}

/* =====================================================================
   v1.06: ШАБЛОНЫ ЗАМЕТКИ — доп. работы, размеры, покупки товара
   ===================================================================== */
function szById(id){ return (state.data.size_types||[]).find(s=>s.id===id); }
function ewById(id){ return (state.data.extra_works||[]).find(s=>s.id===id); }
function ptById(id){ return (state.data.product_types||[]).find(s=>s.id===id); }

function enName(s){
  s = String(s||'');
  if (s.includes('/')){
    const p = s.split('/');
    const en = p[p.length-1].trim();
    if (en) return en;
  }
  return s;
}
function extraItemTextEn(it){
  if (it.kind === 'purchase'){
    const q = Math.max(1, parseInt(it.qty)||1);
    return enName(it.product_name || it.name) + (q > 1 ? ' x' + q : '');
  }
  let sz = '';
  if (it.needs_size){
    const a = Math.max(1, parseInt(it.size_a)||0), b = Math.max(1, parseInt(it.size_b)||0);
    const v = exSizeVal(it);
    sz = ' — ' + ((it.size_a && b > 1) ? a + 'x' + b + ' = ' : '') + v + ' ' + (it.size_unit||'');
  }
  return enName(it.name) + sz;
}
function exSizeVal(it){
  if (!it.needs_size) return 1;
  if (it.size_a || it.size_b){
    return Math.max(1, parseInt(it.size_a)||1) * Math.max(1, parseInt(it.size_b)||1);
  }
  return parseFloat(it.size_value) || 1; // совместимость со старыми записями
}
function extraLineTotal(it){
  if (it.kind === 'purchase') return Math.max(1, parseInt(it.qty)||1) * (parseFloat(it.price)||0);
  const rate = parseFloat(it.price)||0;
  return it.needs_size ? exSizeVal(it) * rate : rate;
}
function extraItemText(it){
  if (it.kind === 'purchase'){
    const q = Math.max(1, parseInt(it.qty)||1);
    return (it.product_name || it.name) + (q > 1 ? ' ×' + q : '');
  }
  let sz = '';
  if (it.needs_size){
    const a = Math.max(1, parseInt(it.size_a)||0), b = Math.max(1, parseInt(it.size_b)||0);
    const v = exSizeVal(it);
    sz = ' — ' + ((it.size_a && b > 1) ? a + '×' + b + ' = ' : '') + v + ' ' + (it.size_unit||'');
  }
  return it.name + sz;
}

function extraListHtml(){
  const list = jobDraft.form_data.extra || [];
  if (!list.length) return '';
  return list.map((it, i) => {
    if (it.kind === 'purchase'){
      const prods = [...(state.data.product_types||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
      return `<div class="ex-item">
        <div class="ex-head"><b>🛒 ${esc(it.name)}</b>
          <button class="ex-del" onclick="App.exDel(${i})">✕</button></div>
        <div class="qty-line">
          <select data-ex-prod="${i}" style="flex:1;min-width:130px">
            <option value="">${t('product')}…</option>
            ${prods.map(p=>`<option value="${p.id}" ${it.product_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
          </select>
          <input data-ex-qty="${i}" inputmode="numeric" value="${it.qty||1}" style="width:52px;text-align:center" title="${t('qty')}">
          <span class="tiny">×</span>
          <input data-ex-price="${i}" class="price-input" inputmode="decimal" value="${it.price||''}" placeholder="$">
          <span class="money" data-exline="${i}" style="min-width:52px;text-align:right">${extraLineTotal(it)>0?money(extraLineTotal(it)):'—'}</span>
        </div>
      </div>`;
    }
    const lineSum = extraLineTotal(it);
    return `<div class="ex-item">
      <div class="ex-head"><b>🧰 ${esc(it.name)}</b>
        <button class="ex-del" onclick="App.exDel(${i})">✕</button></div>
      ${it.needs_size ? `
      <div class="qty-line size-presets">
        ${[1,2,3].map(n=>`<button type="button" class="chip-preset ${(+it.size_a===n && +it.size_b===n)?'on':''}" onclick="App.exPreset(${i},${n})">${n}×${n}</button>`).join('')}
        <span class="tiny">· ${t('custom_size')} ↓</span>
      </div>
      <div class="qty-line">
        ${stepperHtml('exa-'+i, Math.max(1, parseInt(it.size_a)||1))}
        <span class="tiny">×</span>
        ${stepperHtml('exb-'+i, Math.max(1, parseInt(it.size_b)||1))}
        <span class="tiny">= <b data-exsz="${i}">${exSizeVal(it)}</b> ${esc(it.size_unit||'')}</span>
      </div>` : ''}
      <div class="qty-line">
        <span class="tiny">${t('price_lbl')}${it.needs_size ? ' <b>' + t('price_per_size') + '</b>' : ''}:</span>
        <input data-ex-price="${i}" class="price-input" inputmode="decimal" value="${it.price||''}" placeholder="$">
        <span class="money" data-exline="${i}" style="margin-left:auto;min-width:52px;text-align:right">${lineSum>0?money(lineSum):'—'}</span>
      </div>
    </div>`;
  }).join('');
}
function refreshExtraList(){
  const box = document.getElementById('extra-list');
  if (box) box.innerHTML = extraListHtml();
  recalcJob(); autosaveDraft();
}
function extraPickerModal(){
  const list = [...(state.data.extra_works||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  openModal(`
    ${modalHead('＋ ' + t('template'))}
    ${list.length ? list.map(w => `
      <button class="demo-user" onclick="App.exAdd('${w.id}')">
        <span style="font-size:1.2rem">${w.kind==='purchase'?'🛒':'🧰'}</span>
        <span class="grow" style="flex:1;text-align:left">
          <div style="font-weight:900">${esc(w.name)}</div>
          <div class="tiny">${w.kind==='purchase' ? t('kind_purchase') : (w.needs_size ? (szById(w.size_type_id)||{}).name || t('needs_size') : t('kind_work'))}</div>
        </span>
      </button>`).join('')
    : `<div class="tiny">${t('no_templates')}</div>`}
  `);
}
function exAdd(ewId){
  const w = ewById(ewId); if (!w || !jobDraft) return;
  const sz = w.size_type_id ? szById(w.size_type_id) : null;
  const it = {
    id: uid(), ew_id: w.id, name: w.name, kind: w.kind,
    needs_size: !!w.needs_size,
    size_name: sz ? sz.name : '', size_unit: sz ? sz.unit : '',
    size_a: 1, size_b: 1, size_value: 1,
    product_id: null, product_name: '', qty: 1,
    price: +w.price || 0
  };
  jobDraft.form_data.extra = jobDraft.form_data.extra || [];
  jobDraft.form_data.extra.push(it);
  closeModal();
  refreshExtraList();
  dlog('extra: добавлен шаблон', w.name);
}
function exDel(i){
  jobDraft.form_data.extra.splice(i, 1);
  refreshExtraList();
}

/* ---------- Справочники: доп. работы / размеры / товары (админ) ---------- */
function dirSizes(){
  const list = [...(state.data.size_types||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  return `<div class="card">` + (list.map(s => `
    <div class="rowline">
      <div class="grow">📏 <b>${esc(s.name)}</b> <span class="tiny">· ${esc(s.unit)}</span></div>
      <button class="btn btn-ghost sm" onclick="App.editSzModal('${s.id}')">${t('edit')}</button>
    </div>`).join('') || `<div class="tiny">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editSzModal()">＋ ${t('add')}</button>`;
}
function editSzModal(id){
  const s = id ? szById(id) : { id: uid(), name:'', unit:'', sort: (state.data.size_types||[]).length+1 };
  openModal(`
    ${modalHead('📏 ' + t('d_sizes'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="sz-name" value="${esc(s.name)}" placeholder="Площадь / Area"></div>
    <div class="form-row"><span class="lbl">${t('unit_lbl')}</span><input id="sz-unit" value="${esc(s.unit)}" placeholder="sq ft"></div>
    <button class="btn btn-green" onclick="App.saveSz('${s.id}', ${s.sort||0})">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('size_types','${s.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveSz(id, sort){
  const name = $('#sz-name').value.trim(); if (!name) return;
  await dbUpsert('size_types', { id, name, unit: $('#sz-unit').value.trim(), sort });
  closeModal(); toast('✓ ' + t('saved')); render();
}

function dirExtraWorks(){
  const list = [...(state.data.extra_works||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  return `<div class="card">` + (list.map(w => {
    const sz = szById(w.size_type_id);
    return `<div class="rowline">
      <div class="grow">${w.kind==='purchase'?'🛒':'🧰'} <b>${esc(w.name)}</b>
        <div class="tiny">${w.kind==='purchase' ? t('kind_purchase') : t('kind_work')}${w.needs_size && sz ? ' · 📏 ' + esc(sz.name) + ' (' + esc(sz.unit) + ')' : ''}${+w.price ? ' · 💲 ' + money(+w.price) + (w.needs_size ? '/' + esc((sz||{}).unit||'ед.') : '') : ''}</div></div>
      <button class="btn btn-ghost sm" onclick="App.editEwModal('${w.id}')">${t('edit')}</button>
    </div>`;
  }).join('') || `<div class="tiny">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editEwModal()">＋ ${t('add')}</button>`;
}
function editEwModal(id){
  const w = id ? ewById(id) : { id: uid(), name:'', kind:'work', needs_size:false, size_type_id:null, sort:(state.data.extra_works||[]).length+1 };
  const sizes = [...(state.data.size_types||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  openModal(`
    ${modalHead('🧰 ' + t('d_extraworks'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="ew-name" value="${esc(w.name)}" placeholder="Вырезка стен / Wall cutout"></div>
    <div class="form-row"><span class="lbl">&nbsp;</span>
      <div class="tabs">
        <button class="tabbtn ${w.kind!=='purchase'?'active':''}" data-kind="work" onclick="App.pcGate ? (this.parentElement.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active')), this.classList.add('active'), document.getElementById('ew-kind').value='work') : null">🧰 ${t('kind_work')}</button>
        <button class="tabbtn ${w.kind==='purchase'?'active':''}" data-kind="purchase" onclick="(this.parentElement.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active')), this.classList.add('active'), document.getElementById('ew-kind').value='purchase')">🛒 ${t('kind_purchase')}</button>
      </div>
      <input type="hidden" id="ew-kind" value="${w.kind}"></div>
    <div class="form-row"><span class="lbl">${t('price_lbl')} <span class="tiny">(${t('price_per_size')} — если включён размер)</span></span>
      <input id="ew-price" class="price-input" inputmode="decimal" value="${w.price||''}" style="width:120px"></div>
    <label class="opt ${w.needs_size?'on':''}" style="margin-bottom:8px"><input type="checkbox" id="ew-size" ${w.needs_size?'checked':''} onchange="this.closest('.opt').classList.toggle('on', this.checked)"> 📏 ${t('needs_size')}</label>
    <div class="form-row"><span class="lbl">${t('size_type')}</span>
      <select id="ew-szt">
        <option value="">—</option>
        ${sizes.map(s=>`<option value="${s.id}" ${w.size_type_id===s.id?'selected':''}>${esc(s.name)} (${esc(s.unit)})</option>`).join('')}
      </select></div>
    <button class="btn btn-green" onclick="App.saveEw('${w.id}', ${w.sort||0})">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('extra_works','${w.id}')">${t('delete')}</button>`:''}
  `);
}
async function saveEw(id, sort){
  const name = $('#ew-name').value.trim(); if (!name) return;
  await dbUpsert('extra_works', {
    id, name,
    kind: $('#ew-kind').value === 'purchase' ? 'purchase' : 'work',
    needs_size: $('#ew-size').checked,
    size_type_id: $('#ew-szt').value || null,
    price: parseFloat($('#ew-price').value) || 0,
    sort
  });
  closeModal(); toast('✓ ' + t('saved')); render();
}

function dirProducts(){
  const list = [...(state.data.product_types||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  return `<div class="card">` + (list.map(p => `
    <div class="rowline">
      <div class="grow">🛒 <b>${esc(p.name)}</b><div class="tiny">${t('default_price')}: ${money(+p.default_price||0)}</div></div>
      <button class="btn btn-ghost sm" onclick="App.editPtModal('${p.id}')">${t('edit')}</button>
    </div>`).join('') || `<div class="tiny">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editPtModal()">＋ ${t('add')}</button>`;
}
function editPtModal(id){
  const p = id ? ptById(id) : { id: uid(), name:'', default_price:0, sort:(state.data.product_types||[]).length+1 };
  openModal(`
    ${modalHead('🛒 ' + t('d_products'))}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="pt-name" value="${esc(p.name)}" placeholder="Решётка / Vent grille"></div>
    <div class="form-row"><span class="lbl">${t('default_price')}</span><input id="pt-price" class="price-input" inputmode="decimal" value="${p.default_price||''}"></div>
    <button class="btn btn-green" onclick="App.savePt('${p.id}', ${p.sort||0})">${t('save')}</button>
    ${id?`<button class="btn btn-red" style="margin-top:8px" onclick="App.delRow('product_types','${p.id}')">${t('delete')}</button>`:''}
  `);
}
async function savePt(id, sort){
  const name = $('#pt-name').value.trim(); if (!name) return;
  await dbUpsert('product_types', { id, name, default_price: parseFloat($('#pt-price').value)||0, sort });
  closeModal(); toast('✓ ' + t('saved')); render();
}

/* Статистика на главной (перенесена из настроек) */
function homeStatsHtml(){
  const u = state.user;
  const myJobs = state.data.jobs.filter(j=>j.technician_id===u.id || (j.helper_ids||[]).includes(u.id)).length;
  const myPk = state.data.placements.filter(p=>p.technician_id===u.id).length;
  const { due, over } = myDueCount();
  return `<div class="stats">
    <div class="stat c-blue"><div class="n">${myJobs}</div><div class="l">${t('stats_jobs')}</div></div>
    <div class="stat c-gray"><div class="n">${myPk}</div><div class="l">${t('stats_pk')}</div></div>
    <div class="stat c-green"><div class="n">${due}</div><div class="l">${t('stats_due')}</div></div>
    <div class="stat c-red"><div class="n">${over}</div><div class="l">${t('stats_over')}</div></div>
  </div>`;
}

/* =====================================================================
   v1.07: ЭКРАН СТАТИСТИКИ — работы, деньги, «мили», пикапы и прочее
   ===================================================================== */
function haversineMi(a, b){
  const R = 3958.8; // радиус Земли в милях
  const toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function statScopeJobs(){
  let js = scopeFilter(state.data.jobs, 'technician_id');
  if (state.statMine) js = js.filter(j => j.technician_id === state.user.id || (j.helper_ids||[]).includes(state.user.id));
  return js;
}
function statScopePlacements(){
  let ps = scopeFilter(state.data.placements, 'technician_id');
  if (state.statMine) ps = ps.filter(p => p.technician_id === state.user.id);
  return ps;
}
function inRange(iso, from, to){
  if (!iso) return false;
  const d = String(iso).slice(0,10);
  return (!from || d >= from) && (!to || d <= to);
}
function tripPointsForDate(iso, jobsAll, plAll){
  // порядок дня: приоритет → sort_order; координаты берём у комплексов
  const ids = [];
  jobsAll.filter(j => j.date === iso).forEach(j => { if (!ids.includes(j.id)) ids.push(j.id); });
  plAll.filter(p => !p.picked_up ? p.due_date === iso : String(p.picked_up_at||'').slice(0,10) === iso)
       .forEach(p => { if (!ids.includes(p.job_id)) ids.push(p.job_id); });
  ids.sort((a,b) => jobSortCmp(
    state.data.jobs.find(x=>x.id===a) || {sort_order:999},
    state.data.jobs.find(x=>x.id===b) || {sort_order:999}));
  const pts = [];
  for (const jid of ids){
    const j = state.data.jobs.find(x=>x.id===jid);
    const cxId = j ? j.complex_id : (plAll.find(p=>p.job_id===jid)||{}).complex_id;
    const cx = cxById(cxId);
    if (cx && cx.lat != null && cx.lng != null){
      const last = pts[pts.length-1];
      if (!last || last.cx !== cx.id) pts.push({ cx: cx.id, lat:+cx.lat, lng:+cx.lng });
    }
  }
  return pts;
}
function statData(){
  const from = state.statFrom || '';
  const to = state.statTo || todayISO();
  const jobs = statScopeJobs().filter(j => inRange(j.date, from, to));
  const done = jobs.filter(j => j.status !== 'draft');
  const earned = done.reduce((s,j) => s + jobGrand(j), 0);
  const approvedSum = jobs.filter(j => j.status === 'approved').reduce((s,j) => s + (+j.approved_total || +j.total || 0), 0);
  const purchases = jobs.reduce((s,j) => s + ((j.form_data && j.form_data.extra) || [])
    .filter(it => it.kind === 'purchase').reduce((a,it) => a + extraLineTotal(it), 0), 0);

  const plAll = statScopePlacements();
  const placed = plAll.filter(p => inRange(p.placed_date, from, to));
  const eqUnits = placed.reduce((s,p) => s + (+p.qty || 0), 0);
  const picked = plAll.filter(p => p.picked_up && inRange(String(p.picked_up_at||'').slice(0,10), from, to));
  const onTime = picked.filter(p => String(p.picked_up_at).slice(0,10) <= p.due_date).length;

  // дни с поездками: работы + пикапы (собранные считаем по дате сбора)
  const daySet = new Set();
  jobs.forEach(j => daySet.add(j.date));
  plAll.forEach(p => {
    if (p.picked_up){ const d = String(p.picked_up_at||'').slice(0,10); if (inRange(d, from, to)) daySet.add(d); }
    else if (inRange(p.due_date, from, to)) daySet.add(p.due_date);
  });
  let miles = 0;
  const visited = new Set();
  for (const iso of daySet){
    const pts = tripPointsForDate(iso, jobs, plAll);
    pts.forEach(pt => visited.add(pt.cx));
    for (let i = 1; i < pts.length; i++) miles += haversineMi(pts[i-1], pts[i]);
  }
  // заработок по дням для мини-графика (последние ≤14 дней с работами)
  const byDay = {};
  done.forEach(j => { byDay[j.date] = (byDay[j.date] || 0) + jobGrand(j); });
  const chart = Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);

  return { from, to, jobsTotal: jobs.length, doneCnt: done.length, earned, approvedSum,
           avg: done.length ? earned / done.length : 0, purchases,
           miles, eqUnits, pickedCnt: picked.length, onTime, late: picked.length - onTime,
           visited: visited.size, chart };
}
function viewStats(){
  if (!state.statTo) state.statTo = todayISO();
  const d = statData();
  const today = todayISO();
  const chips = [
    ['7д', addDaysISO(today,-6), today],
    ['30д', addDaysISO(today,-29), today],
    ['90д', addDaysISO(today,-89), today],
    [t('period_all'), '', today],
  ].map(([l,f,to]) => `<button class="tabbtn ${state.statFrom===f&&state.statTo===to?'active':''}" onclick="App.statRange('${f}','${to}')">${l}</button>`).join('');
  const maxBar = Math.max(1, ...d.chart.map(([,v])=>v));
  const bars = d.chart.map(([iso,v]) => `
    <div class="bar-col" title="${fmtDMY(iso)} · ${money(v)}">
      <div class="bar" style="height:${Math.max(6, Math.round(v/maxBar*100))}%"></div>
      <div class="bar-l">${iso.slice(8,10)}</div>
    </div>`).join('');
  return `
  <div class="section-title">${ICONS.stats} ${t('stats_title')}</div>
  <div class="card">
    <div class="tabs">${chips}</div>
    <div class="grid-2">
      <div class="form-row"><span class="lbl">${t('from')}</span>
        <input type="date" value="${state.statFrom||''}" onchange="App.statFrom(this.value)"></div>
      <div class="form-row"><span class="lbl">${t('to')}</span>
        <input type="date" value="${state.statTo}" onchange="App.statTo(this.value)"></div>
    </div>
    ${isManager() ? `<div class="tabs">
      <button class="tabbtn ${state.statMine?'active':''}" onclick="App.statMine(true)">${t('mine')}</button>
      <button class="tabbtn ${!state.statMine?'active':''}" onclick="App.statMine(false)">${t('all')}</button>
    </div>` : ''}
  </div>

  <div class="stat-grid">
    <div class="stat-lg c-green"><div class="n">${money(d.earned)}</div><div class="l">💰 ${t('st_earned')}</div>
      <div class="s">${t('st_approved_sum')}: ${money(d.approvedSum)}</div></div>
    <div class="stat-lg c-blue"><div class="n">${d.doneCnt}</div><div class="l">✅ ${t('st_done')}</div>
      <div class="s">${t('st_total')}: ${d.jobsTotal} · ${t('st_avg')}: ${money(d.avg)}</div></div>
    <div class="stat-lg c-purple"><div class="n">${d.miles.toFixed(1)}</div><div class="l">🚗 ${t('st_miles')}</div>
      <div class="s">${t('st_miles_hint')}</div></div>
    <div class="stat-lg c-gray"><div class="n">${d.pickedCnt}</div><div class="l">📦 ${t('st_picked')}</div>
      <div class="s">✓ ${t('st_ontime')}: ${d.onTime} · ⏰ ${t('st_late')}: ${d.late}</div></div>
    <div class="stat-lg c-teal"><div class="n">${d.visited}</div><div class="l">🏢 ${t('st_visited')}</div>
      <div class="s">🧰 ${t('st_eq')}: ${d.eqUnits} ${t('st_units')}</div></div>
    <div class="stat-lg c-yellow"><div class="n">${money(d.purchases)}</div><div class="l">🛒 ${t('st_purchases')}</div>
      <div class="s">&nbsp;</div></div>
  </div>

  ${d.chart.length ? `
  <div class="card">
    <div style="font-weight:900;margin-bottom:8px">📈 ${t('chart_earn')}</div>
    <div class="bar-chart">${bars}</div>
  </div>` : ''}`;
}
