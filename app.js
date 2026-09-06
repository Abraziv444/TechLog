/* =====================================================================
   TechLog v1.01.01 — учёт работ и пикапов оборудования
   Duolingo-style PWA · Vanilla JS · Supabase (или демо-режим localStorage)
   ===================================================================== */
'use strict';

const APP_VERSION = '1.07.39';
const CFG = (window.TECHLOG_CONFIG || {});
const HAS_SB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
/* v1.07.31: возврат с OAuth-страницы Google (Подключить Google в настройках) */
let _driveOAuth = null;
try{
  const _q = new URLSearchParams(location.search);
  if (_q.get('state') === 'tl_drive' && _q.get('code')){
    _driveOAuth = _q.get('code');
    history.replaceState(null, '', location.pathname);
  }
}catch(e){}

/* =====================================================================
   v1.07.21: ПЛАТФОРМА + НАВИГАТОР (Apple Maps / Google Maps)
   iPhone/iPod видны по UA; iPad на iPadOS 13+ маскируется под Mac —
   отличаем его по количеству тач-точек. Выбор навигатора хранится в
   localStorage['techlog_navapp']: 'auto' | 'apple' | 'google'
   (auto = Карты Apple на iOS, Google Maps на остальных платформах).
   ===================================================================== */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function navProvider(){
  const v = (state && state.navApp) || 'auto';
  if (v === 'apple' || v === 'google') return v;
  return IS_IOS ? 'apple' : 'google';
}
function navName(){ return navProvider() === 'apple' ? 'Apple Maps' : 'Google Maps'; }
/* Маршрут к одной точке. dest: 'lat,lng' или адрес.
   Классический формат maps.apple.com/?daddr= работает на всех версиях iOS. */
function navDirUrl(dest){
  return navProvider() === 'apple'
    ? 'https://maps.apple.com/?daddr=' + encodeURIComponent(dest) + '&dirflg=d'
    : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);
}
/* Мультиточечный маршрут. points: массив 'lat,lng' в порядке объезда.
   Для Apple Maps — официальный формат iOS 18.4+ (/directions + waypoint);
   на более старых iOS Карты откроют только конечную точку — это предел URL-схемы. */
function navRouteUrl(points){
  if (navProvider() !== 'apple') return 'https://www.google.com/maps/dir/' + points.join('/');
  const last = points[points.length - 1];
  const wps = points.slice(0, -1).map(p => 'waypoint=' + encodeURIComponent(p)).join('&');
  return 'https://maps.apple.com/directions?destination=' + encodeURIComponent(last)
       + (wps ? '&' + wps : '') + '&mode=driving';
}
/* Показать точку/адрес на карте (без маршрута). */
function navSearchUrl(q){
  return navProvider() === 'apple'
    ? 'https://maps.apple.com/?q=' + encodeURIComponent(q)
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
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
    if (PLOG.length > 2000) PLOG.splice(0, PLOG.length - 2000);   // v1.07.18: максимум 2000 строк
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
/* v1.07.10: если БД ещё не обновлена (нет новой колонки), PostgREST возвращает
   "Could not find the 'xxx' column …". Достаём имя колонки, чтобы повторить запись без неё. */
function missingColumnOf(e){
  const m = String((e && e.message) || e || '');
  const a = /find the '([A-Za-z0-9_]+)' column/.exec(m) || /column "([A-Za-z0-9_]+)"/.exec(m);
  return a ? a[1] : null;
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
    tab_journal: 'Журнал', jr_title: 'Журнал действий', jr_refresh: 'Обновить', jr_more: 'Показать ещё',
    jr_empty: 'Записей пока нет', jr_all_actions: 'Все действия', jr_all_staff: 'Все сотрудники',
    jr_local: 'локально (демо)', jr_open: 'Открыть',
    jr_need_db: 'Таблица журнала не найдена — выполните supabase/update-to-1_07_18.sql',
    act_user_register: 'регистрация', act_user_create: 'создан сотрудник', act_user_block: 'блокировка',
    act_user_unblock: 'разблокировка', act_role_change: 'смена роли', act_password_change: 'смена своего пароля',
    act_password_reset: 'сброс пароля сотрудника', act_job_create: 'создан инвойс', act_job_update: 'изменён инвойс',
    act_job_done: 'работа выполнена', act_job_reopen: 'возврат в черновик', act_job_approve: 'апрув',
    act_job_delete: 'удалён инвойс', act_crew_add: 'бригада: добавлен', act_crew_remove: 'бригада: убран',
    act_pickup_done: 'пикап выполнен', act_pickup_early: 'досрочный вывоз', act_extension_create: 'продление аренды',
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
    d_equipment: 'Оборудование', d_aux: 'Доп. оборудование', d_price: 'Цены',
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
    stats_due: 'на вывоз', stats_over: 'просрочено', day_empty: 'на этот день нет',
    sync_err: 'Ошибка синхронизации', offline_note: 'Оффлайн: показаны сохранённые данные',
    not_selected: 'Не выбрано', aux_take_hint: 'нажмите то, что нужно взять',
    back_exit_hint: 'Чтобы выйти из приложения, нажмите «назад» ещё раз', help_title: 'Справка',
    select: '— выбрать —', install_hint: 'Меню браузера → «Установить приложение» / «Добавить на главный экран»',
    tab_map: 'Карта', tab_reports: 'Отчёты',
    map_title: 'Карта апарт-комплексов', all_counterparties: 'Все контрагенты',
    map_day_mode: 'Показать день на карте', map_day_hint: 'Работы и пикапы за выбранную дату',
    map_no_coords: 'без координат — откройте комплекс и нажмите «Найти по адресу»',
    route_day_in: 'Маршрут дня в', open_in: 'Открыть в',
    nav_app: 'Навигатор', nav_auto: 'Авто',
    nav_app_hint: 'Куда открывать маршруты. Авто: Карты Apple на iPhone/iPad, Google Maps на остальных.',
    dict_kbd_hint: 'Диктовка на iPhone — кнопкой 🎤 на клавиатуре',
    install_ios_hint: 'iPhone/iPad: в Safari «Поделиться» → «На экран “Домой”». После установки войдите заново — у приложения на «Домой» своё хранилище.',
    pdf_share_fail: 'Не удалось открыть PDF',
    a2hs_title: 'Установите TechLog на экран «Домой»',
    a2hs_text: 'Без App Store: полный экран, офлайн и вход, который не слетает',
    a2hs_how: 'Как установить', a2hs_hide_hint: 'Скрыть подсказку',
    a2hs_step1: 'Нажмите «Поделиться»', a2hs_step1n: 'кнопка в панели Safari; в Chrome и Edge — меню у адресной строки (нужна iOS 16.4+)',
    a2hs_step2: 'Выберите «На экран “Домой”»', a2hs_step2n: 'список действий прокручивается — пункт может быть ниже',
    a2hs_step3: 'Нажмите «Добавить» и откройте иконку', a2hs_step3n: 'войдите заново: у приложения на «Домой» своё хранилище, логин и пароль те же',
    a2hs_note: 'App Store не участвует: установка идёт прямо из браузера, обновления приходят сами.',
    pending_writes: 'Записи в очереди на отправку', pending_sent: 'Отложенные записи доставлены',
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
    vis_hint: 'Отмеченные сотрудники видны этому менеджеру', vis_btn: 'Доступные сотрудники',
    confirm_email: 'Подтвердите email по ссылке из письма, затем войдите',
    auth_loading: 'Проверяю авторизацию…',
    no_coords_yet: 'Нет координат',
    req_missing: 'Не заполнено', issue_complex: 'апарт-комплекс', issue_unit: 'номер юнита', issue_tech: 'сотрудник',
    crew: 'Кто выполнял', add_helper: '＋ добавить сотрудника', all_staff: 'Все',
    shared_chk: 'Общий доступ к документу для коворкера',
    shared_hint: 'Коворкеры из списка «Кто выполнял» увидят эту работу у себя и смогут её редактировать',
    shared_chip: 'Общий',
    shared_on_info: 'Автор включил общий доступ — вы можете редактировать этот документ',
    shared_set_title: 'Общий доступ к документам',
    shared_set_chk: 'Разрешить общий доступ к документам для коворкеров',
    shared_set_hint: 'Если выключить — каждый работает только со своими документами: галочка «Общий доступ» в работах скрывается и перестаёт действовать. Сами отметки в документах сохраняются и снова заработают после включения.',
    db_needs_update: 'Обновите БД: выполните свежие supabase/update-to-*.sql в SQL-редакторе (последний — update-to-1_07_33.sql)',
    open_invoice: 'Открыть инвойс', job_history: 'История работы',
    what_where: 'Что и откуда вывозим',
    extend_rent: 'Продлить аренду', extend_title: 'Продление аренды',
    ext_all: 'Продлить всё', ext_partial: 'Выборочно',
    ext_days_lbl: 'На сколько дней', ext_new_due: 'новый срок вывоза',
    ext_chip: 'продление', ext_done: 'Аренда продлена',
    ext_nothing: 'Нечего продлевать: всё уже забрано',
    ext_qty_hint: 'Отметьте степперами, сколько единиц продлить (остальное — забрать в срок)',
    ext_invoice_note: 'Инвойс не меняется автоматически: при необходимости добавьте дни в секции Equipment Rental самой работы',
    ext_summary: 'Продлеваем', units_short: 'ед.',
    hist_invoice: 'Инвойс', hist_created: 'создан', hist_workdate: 'дата работы',
    hist_pickup: 'Пикап', hist_ext: 'Продление аренды', hist_placed: 'размещено',
    hist_due_lbl: 'срок вывоза', hist_picked_at: 'забрано', hist_superseded: 'закрыт продлением',
    hist_pending: 'ожидает вывоза', hist_none: 'Пикапов по этой работе нет',
    pick_now: 'Забрать сейчас', pick_all_btn: 'Забрать всё',
    search_ph: 'Поиск: юнит, комплекс, адрес…',
    search_jobs: 'Инвойсы', search_pk: 'Пикапы',
    search_empty: 'Ничего не найдено',
    search_more: 'Показаны первые',
    upd_checking: 'Проверяю версию…', upd_latest: 'У вас актуальная версия',
    upd_found: 'Найдена новая версия', upd_fail: 'Не удалось проверить версию — проверьте интернет',
    login: 'Логин', login_hint: 'Латиница/цифры, 3–32 символа. Вход по логину и паролю.',
    invite_code: 'Код приглашения', invite_bad: 'Неверный код приглашения',
    login_taken_or_err: 'Логин занят или ошибка регистрации',
    back_today: 'Сегодня', navigate: 'Маршрут', copied_code: 'Код скопирован',
    app_tag: 'учёт работ', copy_addr: 'Копировать адрес', copied_addr: 'Адрес скопирован',
    today_tag: 'сегодня',
    drag_hint: 'Тяните карточку мышью или удерживайте пальцем и тяните вверх/вниз',
    st_active: 'Активен', st_blocked: 'Заблокирован', block: 'Заблокировать', unblock: 'Разблокировать',
    block_confirm: 'Заблокировать сотрудника? Он не сможет войти в приложение:',
    blocked_done: 'Сотрудник заблокирован', unblocked_done: 'Сотрудник разблокирован',
    blocked_msg: 'Доступ заблокирован администратором',
    registered: 'в приложении с', cant_self: 'Нельзя выполнить для самого себя',
    set_pass: 'Сменить пароль', new_pass: 'Новый пароль (мин. 6 символов)',
    pass_short: 'Пароль — минимум 6 символов', pass_changed: 'Пароль изменён. Старые сессии сотрудника завершены',
    rpc_missing: 'Обновите БД: выполните свежий supabase/schema.sql в SQL-редакторе Supabase',
    demo_only_sb: 'В демо-режиме пароли не используются — доступно только с Supabase',
    price_std_tab: 'Стандартные', price_ind_tab: 'Индивидуальные',
    price_ind_hint: 'Галочка включает индивидуальную цену для выбранного контрагента; без галочки действует стандартная.',
    add_staff: 'Добавить сотрудника', staff_login_lbl: 'Логин (латиница, 3–32)',
    staff_created: 'Сотрудник создан — может входить с этим логином и паролем',
    staff_created_demo: 'Сотрудник добавлен (демо: вход без пароля)',
    bad_email_cfg: 'Почтовый домен не совпал — проверьте AUTH_EMAIL_DOMAIN в config.js',
    invite_set_title: 'Код приглашения', invite_new_lbl: 'Новый код (2–64 символа)',
    invite_hint: 'Действует для всех новых регистраций. Хранится только хэш — текущий код показать нельзя, только заменить. Стандартный код: APC.',
    invite_saved: 'Код приглашения обновлён', invite_short: 'Код — от 2 до 64 символов',
    my_pass_title: 'Смена пароля', pass_repeat: 'Повторите пароль', pass_mismatch: 'Пароли не совпадают',
    own_pass_changed: 'Пароль изменён',
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
    tab_board: 'Доска', b_jobs: 'работ', b_pk: 'пикапов', b_empty: 'День свободен',
    b_ext: 'продление', b_over: 'просрочен', b_only: 'Доска доступна менеджеру и администратору.',
    car_no: 'Номер машины', mgr_reorder_chk: 'Менеджер может менять очерёдность задач (Доска и ▲▼)',
    tomorrow: 'Завтра',
    overdue_hint: 'Просроченные пикапы не входят в число «сегодня» — они показаны отдельным числом.',
    ext_rules_hint: 'Количество можно только уменьшить — продлеваем не больше, чем стоит у клиента; остаток забирается в срок. Продление — максимум {N} дн. за раз.',
    ext_max_note: 'макс {N}', restore_pk: 'Вернуть в аренду', restored: 'Возвращено в аренду',
    mgr_approve_chk: 'Менеджер может ставить апрув инвойсов',
    eq_settings_title: 'Оборудование и документы',
    def_days_lbl: 'Аренда по умолчанию, дн.', max_ext_lbl: 'Максимум продления, дн.',
    lock_days_lbl: 'Блокировать правку старше, дн. (0 — выкл)',
    lock_hint: 'Документы старше срока техник менять не может — только менеджер или админ.',
    lock_note: 'Документ старше {N} дн. — правка только менеджером или админом',
    d_stock: 'Склад', stock_total: 'всего', stock_broken: 'сломано', stock_repair: 'в ремонте',
    stock_field: 'у клиентов', stock_avail: 'на складе',
    stock_vis_chk: 'Сотрудники видят остатки склада',
    stock_hint: 'Всего − сломано − в ремонте − у клиентов = на складе. «У клиентов» считается автоматически по невывезенным пикапам.',
    cl_title: 'Чек-лист перед выездом', cl_edit_hint: 'Каждый пункт — с новой строки.',
    proposal_chk: 'PROPOSAL — работы согласованы заранее',
    pdf_preview: 'Просмотр PDF', pdf_print: 'Печать',
    print_hint: 'Откроется системная печать; если нет — PDF откроется в новой вкладке (меню браузера → Печать).',
    tab_proposals: 'Пропозалы', prop_only: 'Пропозалы доступны менеджеру и администратору.',
    prop_new: '＋ Новый пропозал', prop_items: 'Позиции', prop_desc: 'Описание', prop_amount: 'Сумма',
    prop_add_row: '＋ строка', prop_note: 'Примечание',
    pst_draft: 'Черновик', pst_sent: 'Отправлен', pst_approved: 'Одобрен', pst_declined: 'Отклонён',
    prop_linked: 'Связанные инвойсы', prop_link: 'Связать', prop_unlink: 'Отвязать',
    prop_pick: 'Выбрать пропозал…', prop_pick_none: 'нет подходящих (комплекс/статус)',
    prop_requested: 'Сотрудник указал: должен быть пропозал',
    allow_prop_chk: 'Сотрудники могут отмечать «нужен пропозал»',
    prop_pdf: 'PDF пропозала', prop_status: 'Статус', prop_need_cpcx: 'Укажите контрагента и комплекс',
    jr_tab_doc: 'Документы', jr_tab_tech: 'Система',
    rep_print2: 'Печать 2-на-лист',
    ext_req_btn: 'Запросить продление сверх лимита',
    ext_req_days_q: 'На сколько дней запросить? (макс. 30)',
    ext_req_sent: 'Запрос отправлен на согласование',
    ext_req_pending: '⏳ запрос на {N} дн. ждёт решения',
    ext_req_title: 'Согласование продлений', ext_req_ok: 'Одобрить', ext_req_no: 'Отклонить',
    b_hide_empty: 'Скрыть свободных',
    media_title: 'Фото и видео', media_photo: '📷 Фото', media_video: '🎥 Видео',
    media_sb_only: 'Фото и видео работают только с подключённым Supabase',
    media_vlong: 'Видео длиннее 90 сек — снимите короче', media_limit: 'Лимит: 10 фото и 2 видео на работу',
    media_open_err: 'Нет доступа или файл ещё грузится', media_del_q: 'Удалить файл из архива',
    media_offline: '🔴 офлайн', media_wait: 'ждут отправки',
    media_not_cfg: 'Google Drive не настроен — фото сохранятся и уйдут после настройки (Настройки → Фото и видео)',
    gd_card: '📷 Фото и видео → Google Drive',
    gd_intro: 'Логин и пароль Google сюда не вводятся — это небезопасно и не нужно. Приложение работает по ключам OAuth: введите три значения ниже, нажмите «Подключить Google» и подтвердите доступ на странице самого Google. Токен доступа сервер сохранит сам.',
    gd_cid: 'Client ID', gd_secret: 'Client Secret', gd_folder: 'ID папки на Диске',
    gd_save: 'Сохранить ключи', gd_connect: '🔗 Подключить Google', gd_test: '🧪 Тест соединения',
    gd_redirect: 'Redirect URI — вставьте в Google Console',
    gd_saved: 'Ключи сохранены', gd_need_cid: 'Сначала введите Client ID',
    gd_connected: 'Google подключён', gd_not_conn: 'не подключено',
    gd_db: 'База данных', gd_auth: 'Авторизация Google', gd_acc: 'Аккаунт',
    gd_used: 'Занято на Диске', gd_write: 'Пробная запись в папку', gd_status: 'Статус',
    gd_help: 'Как получить ключи (разово, ~15 минут)',
    bk_card: '💾 Бэкап данных',
    bk_intro: 'Один JSON-файл: все таблицы базы, учётные записи (пароли — bcrypt-хэшами) и, по галочке, секреты. При загрузке дубли пропускаются, ошибки видны построчно; лог можно сохранить в .txt (в базе он не хранится).',
    bk_export: '💾 Выгрузить бэкап', bk_import: '📥 Загрузить из бэкапа',
    bk_secrets: 'включая секреты (токены Google, код приглашения)',
    bk_savelog: '⬇ Сохранить лог (.txt)',
    bk_reading: 'Чтение файла', bk_notfile: 'это не файл бэкапа TechLog',
    bk_from: 'Бэкап от', bk_by: 'выгрузил',
    bk_added: 'добавлено', bk_dupes: 'дублей', bk_errs: 'ошибок',
    bk_total: 'ИТОГО', bk_users_c: 'создано', bk_users_e: 'уже были',
    bk_need_sql: 'Выполните update-to-1_07_32.sql — функции бэкапа не найдены',
    bk_confirm: 'Загрузить данные из файла?\n\nСуществующие записи не изменяются, дубли пропускаются, добавляются только недостающие строки.',
    bk_journal_skip: 'журналы (audit_log, tech_log) кнопкой не восстанавливаются — защита от подделки; сниппет для SQL-редактора в update-to-1_07_32.sql',
    bk_demo_imp: 'Загрузка бэкапа — только с подключённым Supabase',
    bk_done_file: 'Файл сформирован',
    bk_secrets_warn: 'в файле токены — храните бережно!',
    bk_new_proj: 'Как восстановиться в новый проект Supabase',
    prop_qty: 'Кол-во', prop_code: 'Код', prop_complete: 'Выполнить до (Complete By)',
    diag_card: '🧪 Диагностика', diag_run: '▶ Запустить все тесты',
    diag_net: 'Интернет', diag_db: 'База данных', diag_auth: 'Сессия входа',
    diag_store: 'Хранилище миниатюр', diag_fn: 'Серверные функции',
    diag_skip: 'пропущено (демо-режим)', diag_fn_admin: 'доступно, детали — админу',
    diag_no_sess: 'нет сессии', diag_sql31: 'выполните update-to-1_07_31.sql',
    diag_deploy: 'функции не задеплоены',
    ext_req_done: 'Продление применено', ext_req_rej: 'Запрос отклонён',
    act_price_change: 'изменение цены', act_approve_reset: 'сброс апрува',
    act_pickup_restore: 'возврат в аренду', act_priority_set: 'приоритет',
    act_org_toggle: 'настройка (вкл/выкл)', act_org_set: 'настройка (значение)',
    act_car_no_set: 'номер машины', act_stock_set: 'склад',
    act_backup_export: 'бэкап: выгрузка', act_backup_restore: 'бэкап: загрузка',
    act_proposal_create: 'пропозал создан', act_proposal_update: 'пропозал изменён',
    act_proposal_delete: 'пропозал удалён', act_proposal_link: 'связан с пропозалом',
    act_proposal_unlink: 'связь с пропозалом снята',
    act_ext_request: 'запрос продления', act_ext_request_approved: 'продление одобрено',
    act_ext_request_rejected: 'продление отклонено',
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
    tab_journal: 'Journal', jr_title: 'Activity journal', jr_refresh: 'Refresh', jr_more: 'Show more',
    jr_empty: 'No records yet', jr_all_actions: 'All actions', jr_all_staff: 'All staff',
    jr_local: 'local (demo)', jr_open: 'Open',
    jr_need_db: 'Journal table missing — run supabase/update-to-1_07_18.sql',
    act_user_register: 'sign-up', act_user_create: 'staff created', act_user_block: 'blocked',
    act_user_unblock: 'unblocked', act_role_change: 'role changed', act_password_change: 'own password changed',
    act_password_reset: 'staff password reset', act_job_create: 'invoice created', act_job_update: 'invoice updated',
    act_job_done: 'job done', act_job_reopen: 'back to draft', act_job_approve: 'approved',
    act_job_delete: 'invoice deleted', act_crew_add: 'crew: added', act_crew_remove: 'crew: removed',
    act_pickup_done: 'pickup done', act_pickup_early: 'early pickup', act_extension_create: 'rental extension',
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
    d_equipment: 'Equipment', d_aux: 'Aux equipment', d_price: 'Prices',
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
    stats_due: 'to pick up', stats_over: 'overdue', day_empty: 'none for this day',
    sync_err: 'Sync error', offline_note: 'Offline: showing cached data',
    not_selected: 'Not selected', aux_take_hint: 'tap what you need to take',
    back_exit_hint: 'Press back again to exit the app', help_title: 'Help',
    select: '— select —', install_hint: 'Browser menu → "Install app" / "Add to Home screen"',
    tab_map: 'Map', tab_reports: 'Reports',
    map_title: 'Apartment complexes map', all_counterparties: 'All counterparties',
    map_day_mode: 'Show day on map', map_day_hint: 'Jobs and pickups for the selected date',
    map_no_coords: 'no coordinates — open the complex and tap "Find by address"',
    route_day_in: 'Day route in', open_in: 'Open in',
    nav_app: 'Navigation app', nav_auto: 'Auto',
    nav_app_hint: 'Where routes open. Auto: Apple Maps on iPhone/iPad, Google Maps elsewhere.',
    dict_kbd_hint: 'On iPhone, dictate with the 🎤 key on the keyboard',
    install_ios_hint: 'iPhone/iPad: in Safari tap Share → “Add to Home Screen”. Sign in again after installing — the Home Screen app has its own storage.',
    pdf_share_fail: 'Could not open the PDF',
    a2hs_title: 'Install TechLog on your Home Screen',
    a2hs_text: 'No App Store: full screen, offline, and a sign-in that sticks',
    a2hs_how: 'How to install', a2hs_hide_hint: 'Hide this tip',
    a2hs_step1: 'Tap “Share”', a2hs_step1n: 'the button in the Safari toolbar; in Chrome and Edge — the menu by the address bar (needs iOS 16.4+)',
    a2hs_step2: 'Choose “Add to Home Screen”', a2hs_step2n: 'the action list scrolls — the item may be further down',
    a2hs_step3: 'Tap “Add” and open the icon', a2hs_step3n: 'sign in again: the Home-Screen app has its own storage, same login and password',
    a2hs_note: 'The App Store is not involved: installation happens right from the browser, updates arrive on their own.',
    pending_writes: 'Writes queued for delivery', pending_sent: 'Queued writes delivered',
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
    vis_hint: 'Checked employees are visible to this manager', vis_btn: 'Available staff',
    confirm_email: 'Confirm your email via the link, then sign in',
    auth_loading: 'Checking authorization…',
    no_coords_yet: 'No coordinates',
    req_missing: 'Missing', issue_complex: 'apartment complex', issue_unit: 'unit number', issue_tech: 'technician',
    crew: 'Performed by', add_helper: '＋ add employee', all_staff: 'All',
    shared_chk: 'Shared document access for co-worker',
    shared_hint: 'Co-workers from “Performed by” will see this job in their own list and can edit it',
    shared_chip: 'Shared',
    shared_on_info: 'The author enabled shared access — you can edit this document',
    shared_set_title: 'Shared document access',
    shared_set_chk: 'Allow shared document access for co-workers',
    shared_set_hint: 'When off, everyone works only with their own documents: the “Shared access” checkbox in jobs is hidden and stops working. The marks saved in documents are kept and work again after re-enabling.',
    db_needs_update: 'Update the DB: run the latest supabase/update-to-*.sql in the SQL editor (newest — update-to-1_07_33.sql)',
    open_invoice: 'Open invoice', job_history: 'Job history',
    what_where: 'What to collect & where from',
    extend_rent: 'Extend rental', extend_title: 'Rental extension',
    ext_all: 'Extend all', ext_partial: 'Selected only',
    ext_days_lbl: 'For how many days', ext_new_due: 'new pickup date',
    ext_chip: 'extension', ext_done: 'Rental extended',
    ext_nothing: 'Nothing to extend: everything is collected',
    ext_qty_hint: 'Use the steppers to choose how many units to extend (the rest — pick up on time)',
    ext_invoice_note: 'The invoice is not changed automatically: add days in the job’s Equipment Rental section if needed',
    ext_summary: 'Extending', units_short: 'pcs',
    hist_invoice: 'Invoice', hist_created: 'created', hist_workdate: 'work date',
    hist_pickup: 'Pickup', hist_ext: 'Rental extension', hist_placed: 'placed',
    hist_due_lbl: 'pickup due', hist_picked_at: 'picked up', hist_superseded: 'closed by extension',
    hist_pending: 'awaiting pickup', hist_none: 'No pickups for this job',
    pick_now: 'Pick up now', pick_all_btn: 'Pick up all',
    search_ph: 'Search: unit, complex, address…',
    search_jobs: 'Invoices', search_pk: 'Pickups',
    search_empty: 'Nothing found',
    search_more: 'Showing first',
    upd_checking: 'Checking version…', upd_latest: 'You are on the latest version',
    upd_found: 'New version found', upd_fail: 'Version check failed — check your connection',
    login: 'Login', login_hint: 'Latin/digits, 3–32 chars. Sign in with login & password.',
    invite_code: 'Invite code', invite_bad: 'Invalid invite code',
    login_taken_or_err: 'Login is taken or sign-up failed',
    back_today: 'Today', navigate: 'Navigate', copied_code: 'Code copied',
    app_tag: 'work log', copy_addr: 'Copy address', copied_addr: 'Address copied',
    today_tag: 'today',
    drag_hint: 'Drag a card with the mouse, or press & hold and drag up/down',
    st_active: 'Active', st_blocked: 'Blocked', block: 'Block', unblock: 'Unblock',
    block_confirm: 'Block this employee? They will not be able to sign in:',
    blocked_done: 'Employee blocked', unblocked_done: 'Employee unblocked',
    blocked_msg: 'Access blocked by the administrator',
    registered: 'joined', cant_self: 'You can’t do this to yourself',
    set_pass: 'Change password', new_pass: 'New password (min 6 chars)',
    pass_short: 'Password must be at least 6 characters', pass_changed: 'Password changed. Old sessions were revoked',
    rpc_missing: 'Update the DB: run the latest supabase/schema.sql in the Supabase SQL editor',
    demo_only_sb: 'Demo mode has no passwords — available with Supabase only',
    price_std_tab: 'Standard', price_ind_tab: 'Individual',
    price_ind_hint: 'The checkbox enables an individual price for the selected counterparty; unchecked — the standard price applies.',
    add_staff: 'Add employee', staff_login_lbl: 'Login (Latin, 3–32)',
    staff_created: 'Employee created — they can sign in with this login and password',
    staff_created_demo: 'Employee added (demo: sign-in without a password)',
    bad_email_cfg: 'Email domain mismatch — check AUTH_EMAIL_DOMAIN in config.js',
    invite_set_title: 'Invite code', invite_new_lbl: 'New code (2–64 chars)',
    invite_hint: 'Applies to all new sign-ups. Only a hash is stored — the current code can’t be shown, only replaced. Default code: APC.',
    invite_saved: 'Invite code updated', invite_short: 'Code must be 2–64 characters',
    my_pass_title: 'Change password', pass_repeat: 'Repeat password', pass_mismatch: 'Passwords don’t match',
    own_pass_changed: 'Password changed',
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
    tab_board: 'Board', b_jobs: 'jobs', b_pk: 'pickups', b_empty: 'Free day',
    b_ext: 'extension', b_over: 'overdue', b_only: 'The Board is for managers and admins.',
    car_no: 'Vehicle #', mgr_reorder_chk: 'Manager can reorder tasks (Board & ▲▼)',
    tomorrow: 'Tomorrow',
    overdue_hint: 'Overdue pickups are not counted in “today” — they are shown as a separate number.',
    ext_rules_hint: 'Quantity can only be reduced — you extend no more than what is on site; the rest is picked up on time. Extension — max {N} days at once.',
    ext_max_note: 'max {N}', restore_pk: 'Return to rental', restored: 'Returned to rental',
    mgr_approve_chk: 'Manager can approve invoices',
    eq_settings_title: 'Equipment & documents',
    def_days_lbl: 'Default rental, days', max_ext_lbl: 'Max extension, days',
    lock_days_lbl: 'Lock editing older than, days (0 — off)',
    lock_hint: 'Techs cannot edit documents older than this — only manager or admin.',
    lock_note: 'Document older than {N} days — manager/admin only',
    d_stock: 'Warehouse', stock_total: 'total', stock_broken: 'broken', stock_repair: 'in repair',
    stock_field: 'on site', stock_avail: 'available',
    stock_vis_chk: 'Staff can see warehouse stock',
    stock_hint: 'Total − broken − in repair − on site = available. “On site” is computed from pending pickups.',
    cl_title: 'Pre-trip checklist', cl_edit_hint: 'One item per line.',
    proposal_chk: 'PROPOSAL — approved earlier',
    pdf_preview: 'Preview PDF', pdf_print: 'Print',
    print_hint: 'System print will open; otherwise the PDF opens in a new tab (browser menu → Print).',
    tab_proposals: 'Proposals', prop_only: 'Proposals are for managers and admins.',
    prop_new: '＋ New proposal', prop_items: 'Line items', prop_desc: 'Description', prop_amount: 'Amount',
    prop_add_row: '＋ row', prop_note: 'Notes',
    pst_draft: 'Draft', pst_sent: 'Sent', pst_approved: 'Approved', pst_declined: 'Declined',
    prop_linked: 'Linked invoices', prop_link: 'Link', prop_unlink: 'Unlink',
    prop_pick: 'Pick a proposal…', prop_pick_none: 'no matching (complex/status)',
    prop_requested: 'Tech marked: proposal expected',
    allow_prop_chk: 'Techs may mark “proposal expected”',
    prop_pdf: 'Proposal PDF', prop_status: 'Status', prop_need_cpcx: 'Select counterparty and complex',
    jr_tab_doc: 'Documents', jr_tab_tech: 'System',
    rep_print2: 'Print 2-per-sheet',
    ext_req_btn: 'Request extension beyond limit',
    ext_req_days_q: 'How many days to request? (max 30)',
    ext_req_sent: 'Request sent for approval',
    ext_req_pending: '⏳ request for {N} d. awaiting decision',
    ext_req_title: 'Extension approvals', ext_req_ok: 'Approve', ext_req_no: 'Reject',
    b_hide_empty: 'Hide free',
    media_title: 'Photos & video', media_photo: '📷 Photo', media_video: '🎥 Video',
    media_sb_only: 'Media requires Supabase connection',
    media_vlong: 'Video longer than 90s — please retake', media_limit: 'Limit: 10 photos & 2 videos per job',
    media_open_err: 'No access or file still uploading', media_del_q: 'Delete file from archive',
    media_offline: '🔴 offline', media_wait: 'pending upload',
    media_not_cfg: 'Google Drive is not configured — photos are queued and will upload after setup (Settings → Photos & video)',
    gd_card: '📷 Photos & video → Google Drive',
    gd_intro: 'Do NOT enter your Google login/password here — not needed and unsafe. The app uses OAuth keys: fill three values below, press “Connect Google” and confirm on Google’s own page. The server stores the token itself.',
    gd_cid: 'Client ID', gd_secret: 'Client Secret', gd_folder: 'Drive folder ID',
    gd_save: 'Save keys', gd_connect: '🔗 Connect Google', gd_test: '🧪 Test connection',
    gd_redirect: 'Redirect URI — paste into Google Console',
    gd_saved: 'Keys saved', gd_need_cid: 'Enter Client ID first',
    gd_connected: 'Google connected', gd_not_conn: 'not connected',
    gd_db: 'Database', gd_auth: 'Google auth', gd_acc: 'Account',
    gd_used: 'Drive used', gd_write: 'Test write to folder', gd_status: 'Status',
    gd_help: 'How to get the keys (one-time, ~15 min)',
    bk_card: '💾 Data backup',
    bk_intro: 'One JSON file: all DB tables, user accounts (passwords as bcrypt hashes) and, optionally, secrets. On import duplicates are skipped, errors are listed line by line; the log can be saved as .txt (never stored in DB).',
    bk_export: '💾 Export backup', bk_import: '📥 Restore from file',
    bk_secrets: 'include secrets (Google tokens, invite code)',
    bk_savelog: '⬇ Save log (.txt)',
    bk_reading: 'Reading file', bk_notfile: 'not a TechLog backup file',
    bk_from: 'Backup from', bk_by: 'by',
    bk_added: 'added', bk_dupes: 'dupes', bk_errs: 'errors',
    bk_total: 'TOTAL', bk_users_c: 'created', bk_users_e: 'existed',
    bk_need_sql: 'Run update-to-1_07_32.sql — backup functions not found',
    bk_confirm: 'Restore data from file?\n\nExisting rows are untouched, duplicates skipped, only missing rows are added.',
    bk_journal_skip: 'journals (audit_log, tech_log) are not restorable via button — tamper protection; SQL snippet is in update-to-1_07_32.sql',
    bk_demo_imp: 'Restore requires Supabase connection',
    bk_done_file: 'File created',
    bk_secrets_warn: 'file contains tokens — store safely!',
    bk_new_proj: 'How to restore into a fresh Supabase project',
    prop_qty: 'Qty', prop_code: 'Item', prop_complete: 'Complete By',
    diag_card: '🧪 Diagnostics', diag_run: '▶ Run all tests',
    diag_net: 'Internet', diag_db: 'Database', diag_auth: 'Auth session',
    diag_store: 'Thumbs storage', diag_fn: 'Edge functions',
    diag_skip: 'skipped (demo)', diag_fn_admin: 'reachable, details for admin',
    diag_no_sess: 'no session', diag_sql31: 'run update-to-1_07_31.sql',
    diag_deploy: 'functions not deployed',
    ext_req_done: 'Extension applied', ext_req_rej: 'Request rejected',
    act_price_change: 'price change', act_approve_reset: 'approve reset',
    act_pickup_restore: 'returned to rental', act_priority_set: 'priority',
    act_org_toggle: 'setting (on/off)', act_org_set: 'setting (value)',
    act_car_no_set: 'vehicle #', act_stock_set: 'warehouse',
    act_backup_export: 'backup: export', act_backup_restore: 'backup: restore',
    act_proposal_create: 'proposal created', act_proposal_update: 'proposal updated',
    act_proposal_delete: 'proposal deleted', act_proposal_link: 'linked to proposal',
    act_proposal_unlink: 'proposal unlinked',
    act_ext_request: 'extension request', act_ext_request_approved: 'extension approved',
    act_ext_request_rejected: 'extension rejected',
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
  navApp: localStorage.getItem('techlog_navapp') || 'auto',   // v1.07.21: auto | apple | google
  jobId: null,
  cpOpenId: null, cpTab: 'info',
  priceMode: 'std', priceCp: '',   // v1.07.06: справочник «Цены»
  weekStart: null,            // ISO monday
  selDate: null,              // ISO yyyy-mm-dd
  reportDate: null,
  filterMine: true,
  user: null,                 // {id, login, display_name, role}
  sb: null,                   // supabase client
  syncing: false,
  lastSync: localStorage.getItem('techlog_lastsync') || '',
  pendingUpdate: null,        // версия, ждущая закрытия формы
  searchQ: '',                // v1.07.13: строка поиска на главной
  searchKind: 'jobs',         // v1.07.13: поиск по инвойсам ('jobs') или пикапам ('pk')
  jr: { rows: null, act: '', actor: '', loading: false, more: false }, // v1.07.18: журнал действий (админ)
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
function fmtDMY(iso){ const d = parseISO(iso); return String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '/' + d.getFullYear(); } // v1.07.26: US MM/DD/YYYY
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
function toast(msg, kind){
  const now = Date.now();                                  // v1.07.26: не спамим одинаковыми
  if (toast._m === msg && now - (toast._t || 0) < 1800) return;
  toast._m = msg; toast._t = now;
  const el = document.createElement('div'); el.className = 'toast' + (kind==='err'?' err':kind==='inf'?' inf':'');
  el.textContent = msg; $('#toasts').appendChild(el); setTimeout(()=>el.remove(), 3800);
}
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
    company_name: 'APC, LLC', company_short: 'APC',
    allow_shared_jobs: true
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
    { id: 'demo-admin',   login: 'ivan',   display_name: 'Ivan Petrov',   role: 'admin',   blocked: false, created_at: '2026-01-12T09:00:00Z' },
    { id: 'demo-manager', login: 'alexey', display_name: 'Alexey Smirnov', role: 'manager', blocked: false, created_at: '2026-02-03T10:30:00Z' },
    { id: 'demo-tech',    login: 'sergey', display_name: 'Sergey Volkov', role: 'tech',    blocked: false, created_at: '2026-03-18T15:45:00Z' },
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
    work_type_id: wtVet.id, technician_id: 'demo-admin', technician_name: 'Ivan P., Alexey S.', helper_ids: ['demo-manager'], shared_with_helpers: true,
    priority: true, sort_order: 0, status: 'done', note: 'Key at leasing office. Dog in unit — call tenant 30 min before pickup.', form_data: fd, total: 0, approved_total: null, approved_by: null, approved_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const job2 = {
    id: uid(), date: today, counterparty_id: cp2.id, complex_id: complexes[2].id, unit_number: '204',
    work_type_id: wtSteam.id, technician_id: 'demo-tech', technician_name: 'Sergey V.', helper_ids: [], shared_with_helpers: false,
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
    profiles, counterparties, complexes, counterparty_prices, equipment_stock: [], proposals: [], ext_requests: [], media: [], hidden_staff: [], code_requests: [], complex_code_history: [],
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
/* v1.07.21: без внутреннего try — иначе QuotaExceededError глотался молча,
   кеш переставал обновляться, и офлайн тихо «протухал». Теперь квоту видно в журнале. */
function saveLocalUnsafe(){ localStorage.setItem(LS_KEY, JSON.stringify(state.data)); }
function loadLocal(){
  try { return loadLocalUnsafe(); }
  catch(e){ dlog('⛔ loadLocal (битый кеш):', e); return null; }
}
function loadLocalUnsafe(){ const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }

/* =====================================================================
   v1.07.21: ОЧЕРЕДЬ НЕДОСТАВЛЕННЫХ ЗАПИСЕЙ
   iOS замораживает JS свёрнутых PWA агрессивнее Android: upsert, начатый
   перед сворачиванием, мог не долететь до Supabase, а следующий полный
   синк затирал локальную запись серверным снимком. Теперь каждая запись
   попадает в очередь (localStorage) до подтверждения сервера; очередь
   досылается при синке, возврате в приложение и появлении сети, а при
   полном синке недоставленные записи накатываются поверх снимка.
   ===================================================================== */
const LS_PENDING = 'techlog_pending';
function pendingLoad(){ try{ return JSON.parse(localStorage.getItem(LS_PENDING)) || []; }catch(e){ return []; } }
function pendingSave(q){ try{ localStorage.setItem(LS_PENDING, JSON.stringify(q)); }catch(e){ dlog('⛔ pendingSave:', e); } }
function pendingKey(op, table, id){ return op + ':' + table + ':' + id; }
function pendingAdd(op, table, payload){          // payload: строка (upsert) или id (delete)
  const id = op === 'upsert' ? payload.id : payload;
  const q = pendingLoad();
  const key = pendingKey(op, table, id);
  const item = { key, op, table, payload, ts: Date.now() };
  const i = q.findIndex(x => x.key === key);
  if (i >= 0) q[i] = item; else q.push(item);
  /* upsert и delete одной строки взаимоисключающи — оставляем последнее действие */
  const other = pendingKey(op === 'upsert' ? 'delete' : 'upsert', table, id);
  pendingSave(q.filter(x => x.key !== other));
}
function pendingDone(op, table, id){
  const key = pendingKey(op, table, id);
  const q = pendingLoad();
  const q2 = q.filter(x => x.key !== key);
  if (q2.length !== q.length) pendingSave(q2);
}
let pendingBusy = false;
async function pendingFlush(){
  if (pendingBusy || !HAS_SB || !state.sb) return;
  const q = pendingLoad();
  if (!q.length) return;
  pendingBusy = true;
  dlog('sync: досылаю недоставленные записи:', q.length);
  let sent = 0;
  try{
    for (const it of q){
      try{
        const r = it.op === 'upsert'
          ? await state.sb.from(it.table).upsert(it.payload)
          : await state.sb.from(it.table).delete().eq('id', it.payload);
        if (!r.error){ pendingDone(it.op, it.table, it.op === 'upsert' ? it.payload.id : it.payload); sent++; }
        else dlog('⛔ pending', it.op, it.table + ':', r.error);
      }catch(e){ dlog('⛔ pending exception', it.table + ':', e); }
    }
  } finally { pendingBusy = false; }
  if (sent){ dlog('sync: доставлено из очереди:', sent); toast('✓ ' + t('pending_sent') + ': ' + sent); }
}
/* Накатываем ещё не доставленные записи поверх серверного снимка,
   чтобы полный синк не «терял» их до досылки. */
function pendingApplyLocal(data){
  for (const it of pendingLoad()){
    const arr = data[it.table];
    if (!Array.isArray(arr)) continue;
    if (it.op === 'upsert'){
      const i = arr.findIndex(r => r.id === it.payload.id);
      if (i >= 0) arr[i] = it.payload; else arr.push(it.payload);
    } else {
      const i = arr.findIndex(r => r.id === it.payload);
      if (i >= 0) arr.splice(i, 1);
    }
  }
}

const TABLES = ['profiles','counterparties','complexes','counterparty_prices','work_types','equipment_types','aux_equipment','price_list','size_types','extra_works','product_types','equipment_stock','hidden_staff','code_requests','complex_code_history','jobs','placements','proposals','ext_requests','media'];

function emptyData(){
  const d = { org_settings: {
    id: 'org', invoice_title: 'INVOICE #CC', header_city: 'ATLANTA',
    assoc_line: 'atlanta apartment association',
    addr1: 'PO BOX 920482', addr2: 'NORCROSS,', addr3: 'GA 30010',
    company_name: 'APC, LLC', company_short: 'APC',
    allow_shared_jobs: true
  } };
  TABLES.forEach(tb => d[tb] = []);
  d.audit_log = [];               // v1.07.18: локальный журнал действий
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
    await pendingFlush();                 // v1.07.21: сперва досылаем очередь — снимок включит эти записи
    state.data = await sbLoadAll();
    pendingApplyLocal(state.data);        // v1.07.21: что не доставилось — не теряем, накатываем поверх снимка
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
    // v1.07.06: если админ заблокировал текущего пользователя — сразу выходим
    const meProf = state.user && (state.data.profiles||[]).find(p => p.id === state.user.id);
    if (meProf && meProf.blocked){
      dlog('sync: текущий пользователь заблокирован — выход');
      if (HAS_SB){ try{ await state.sb.auth.signOut(); }catch(e){} }
      else localStorage.removeItem(LS_SESSION);
      state.user = null; state.screen = 'login';
      toast('⛔ ' + t('blocked_msg'), 'err');
      return;
    }
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
    pendingAdd('upsert', table, row);              // v1.07.21: в очередь до подтверждения сервера
    const ts = Date.now();
    try {
      let { error } = await state.sb.from(table).upsert(row);
      if (error) {
        // v1.07.10+: БД без новых колонок — убираем их по одной и повторяем (данные не теряются)
        let clean = row, guard = 0, stripped = false;
        while (error && guard++ < 4){
          const miss = missingColumnOf(error);
          if (!miss || !Object.prototype.hasOwnProperty.call(clean, miss)) break;
          clean = { ...clean }; delete clean[miss]; stripped = true;
          const r2 = await Promise.resolve(state.sb.from(table).upsert(clean)).catch(e2 => ({ error: e2 }));
          error = r2.error || null;
        }
        if (!error && stripped){
          pendingDone('upsert', table, row.id);    // v1.07.21: сервер принял (без новых колонок)
          dlog('⚠ upsert', table, 'сохранено без новых колонок — выполните свежие supabase/update-to-*.sql (последний: update-to-1_07_33.sql)');
          toast('⚠ ' + t('db_needs_update'), 'err');
          return;
        }
        if (error){
          noteWriteError('upsert', table, row.id, error);
          dlog('⛔ upsert', table, 'id=' + String(row.id||'').slice(0,8) + ':', error, '· ' + (Date.now()-ts) + ' мс');
          toast(t('write_err') + ' (' + table + '): ' + error.message, 'err');
        }
      } else if (Date.now() - ts > 1500) {
        dlog('🐢 upsert', table, 'медленно: ' + (Date.now()-ts) + ' мс');
      }
      if (!error) pendingDone('upsert', table, row.id);   // v1.07.21: доставлено — из очереди долой
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
    pendingAdd('delete', table, id);               // v1.07.21: в очередь до подтверждения сервера
    const ts = Date.now();
    try {
      const { error } = await state.sb.from(table).delete().eq('id', id);
      if (error) {
        noteWriteError('delete', table, id, error);
        dlog('⛔ delete', table, 'id=' + String(id||'').slice(0,8) + ':', error, '· ' + (Date.now()-ts) + ' мс');
        toast(t('write_err') + ' (' + table + '): ' + error.message, 'err');
      } else pendingDone('delete', table, id);     // v1.07.21: доставлено
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
    if (error){
      // v1.07.10: БД без новой колонки — сохраняем остальное и подсказываем выполнить апдейт
      const miss = missingColumnOf(error);
      if (miss && Object.prototype.hasOwnProperty.call(org, miss)){
        const clean = { ...org }; delete clean[miss];
        const r2 = await Promise.resolve(state.sb.from('org_settings').upsert(clean)).catch(e2 => ({ error: e2 }));
        if (!r2.error){ toast('⚠ ' + t('db_needs_update'), 'err'); return; }
      }
      toast(t('sync_err') + ': ' + error.message, 'err');
    }
  }
}

/* ---------------- Роли ---------------- */
const isAdmin = () => state.user?.role === 'admin';
const isManager = () => state.user?.role === 'manager' || isAdmin();

/* ---------------- v1.07.10: общий доступ к документам для коворкеров ---------------- */
/* Глобальный выключатель функции (галочка админа в «Настройках», org_settings.allow_shared_jobs). */
function sharedJobsEnabled(){
  const org = state.data && state.data.org_settings;
  return !org || org.allow_shared_jobs !== false;   // по умолчанию включено
}
/* Я — коворкер этой работы, и автор включил в ней «Общий доступ» (и функция не выключена админом) */
function isJobSharedWithMe(j){
  return !!j && sharedJobsEnabled() && !!j.shared_with_helpers
      && state.user && j.technician_id !== state.user.id
      && (j.helper_ids || []).includes(state.user.id);
}
function isPlacementSharedWithMe(p){
  if (!p || !state.data) return false;
  const j = state.data.jobs.find(x => x.id === p.job_id);
  return isJobSharedWithMe(j);
}
/* v1.07.12: размещение «в ожидании вывоза» — не забрано и не закрыто продлением */
function pkPending(p){ return !p.picked_up && !p.superseded; }
/* Кто может забирать/продлевать этот пикап */
function canTouchPk(p){ return isManager() || p.technician_id === state.user.id || isPlacementSharedWithMe(p); }
/* Чип «Общий» на карточке работы: виден автору и коворкерам, пока общий доступ действует */
function jobSharedChipHtml(j){
  if (!sharedJobsEnabled() || !j.shared_with_helpers || !(j.helper_ids || []).length) return '';
  return ` <span class="chip info shared-chip" title="${esc(t('shared_hint'))}">${ic('share')} ${t('shared_chip')}</span>`;
}
/* Блок «Общий доступ» в форме работы: автору/админу — галочка, коворкеру — пометка */
function sharedAccessBoxHtml(j){
  if (!sharedJobsEnabled()) return '';          // функция выключена админом — блок скрыт целиком
  if (isAdmin() || j.technician_id === state.user.id){
    return `
      <label class="opt shared-opt ${j.shared_with_helpers?'on':''}" style="margin-top:8px">
        <input type="checkbox" id="jb-shared" ${j.shared_with_helpers?'checked':''}> ${ic('share')} ${t('shared_chk')}
      </label>
      <div class="tiny" style="margin-top:4px">${t('shared_hint')}</div>`;
  }
  if (isJobSharedWithMe(j)){
    return `<div class="tiny shared-note" style="margin-top:8px">${ic('share')} ${t('shared_on_info')}</div>`;
  }
  return '';
}

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
    if (prof && prof.blocked){
      dlog('auth: профиль заблокирован — выходим');
      try{ await state.sb.auth.signOut(); }catch(e){}
      state.user = null; state.screen = 'login';
      toast('⛔ ' + t('blocked_msg'), 'err');
      return;
    }
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
  if (u.blocked){ toast('⛔ ' + t('blocked_msg'), 'err'); return; }
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
  if (error){
    dlog('⛔ auth.signIn:', error);
    toast(/banned/i.test(error.message||'') ? '⛔ ' + t('blocked_msg') : error.message, 'err');
    return;
  }
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
  // v1.07.10: работы с общим доступом, где я коворкер, видны наравне со своими
  const shared = state.data.jobs.filter(j => isJobSharedWithMe(j) && !js.includes(j));
  if (shared.length) js = js.concat(shared);
  if (!isManager() || state.filterMine) js = js.filter(j => j.technician_id === state.user.id || isJobSharedWithMe(j));
  return js;
}
function visiblePlacements(){
  let ps = scopeFilter(state.data.placements, 'technician_id');
  // v1.07.10: пикапы работ с общим доступом тоже видны коворкеру
  const shared = state.data.placements.filter(p => isPlacementSharedWithMe(p) && !ps.includes(p));
  if (shared.length) ps = ps.concat(shared);
  if (!isManager() || state.filterMine) ps = ps.filter(p => p.technician_id === state.user.id || isPlacementSharedWithMe(p));
  return ps;
}
function jobSortCmp(a, b){
  return (b.priority?1:0) - (a.priority?1:0)
      || (a.sort_order||0) - (b.sort_order||0)
      || String(a.created_at||'').localeCompare(String(b.created_at||''));
}
function canPrio(j){ return j && (isAdmin() || state.user.role === 'manager' || j.technician_id === state.user.id); }
function mgrReorderOn(){ const o = state.data && state.data.org_settings; return !!(o && o.manager_can_reorder); }
function defRentDays(){ const v = +((state.data && state.data.org_settings || {}).default_rent_days); return v >= 1 ? v : 3; }
function maxExtendDays(){ const v = +((state.data && state.data.org_settings || {}).max_extend_days); return v >= 1 ? v : 3; }
function editLockDays(){ const v = +((state.data && state.data.org_settings || {}).edit_lock_days); return v >= 1 ? v : 0; }
function editLocked(j){ const n = editLockDays(); if (!n || isManager()) return false; return j.date < addDaysISO(todayISO(), -n); }
function canApprove(){ return isAdmin() || (state.user.role === 'manager' && !!((state.data.org_settings||{}).manager_can_approve)); }
function stockVisibleAll(){ return (state.data.org_settings || {}).stock_visible_all !== false; }
function vmCur(){
  try{ const v = localStorage.getItem('techlog_view_mode'); if (v) return v; }catch(e){}
  return window.innerWidth >= 980 ? 'desktop' : 'mobile';
}
function canReorder(j){ return j && (isAdmin() || j.technician_id === state.user.id || (state.user.role === 'manager' && mgrReorderOn())); }
/* v1.07.25: приоритет/очерёдность. Свои работы и админ — прямой upsert (RLS
   пропускает). Менеджер чужие — ТОЛЬКО через RPC board_job_flags: политика
   jobs_upd менеджеру запись не даёт, а расширять её целиком опасно — функция
   меняет ровно два поля (priority, sort_order) и ничего больше. */
async function saveJobPatch(j, patch){
  if (isAdmin() || j.technician_id === state.user.id || isJobSharedWithMe(j)){
    await dbUpsert('jobs', { ...j, ...patch, updated_at: new Date().toISOString() });
    return;
  }
  if (!HAS_SB){ Object.assign(j, patch); return; }
  const { error } = await state.sb.rpc('board_job_flags', {
    p_job: j.id,
    p_priority: ('priority' in patch) ? patch.priority : null,
    p_sort: ('sort_order' in patch) ? patch.sort_order : null });
  if (error) throw error;
  Object.assign(j, patch);
}
function jobsOn(dateISO){ return visibleJobs().filter(j => j.date === dateISO).sort(jobSortCmp); }
function pickupsOn(dateISO){
  const today = todayISO();
  return visiblePlacements().filter(p => pkPending(p) && (p.due_date === dateISO || (dateISO === today && p.due_date < today)))
    .concat(visiblePlacements().filter(p => p.picked_up && p.picked_up_at && p.picked_up_at.slice(0,10) === dateISO));
}
function myDueCount(){
  if (!state.data) return { due: 0, over: 0 };
  const today = todayISO();
  const mine = state.data.placements.filter(p => (p.technician_id === state.user.id || isPlacementSharedWithMe(p)) && pkPending(p));
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
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20V3H7.5A2.5 2.5 0 0 0 5 5.5z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H20v-5"/><path d="M10 7h6"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5.4" height="16" rx="1.2"/><rect x="9.8" y="4" width="5.4" height="11" rx="1.2"/><rect x="16.6" y="4" width="5.4" height="7" rx="1.2"/></svg>',
  prop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.8" width="16" height="18.4" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/></svg>',
};

/* =====================================================================
   СОБСТВЕННЫЕ КОНТУРНЫЕ ИКОНКИ (нарисованы вручную, стиль как у таббара:
   контур stroke=currentColor — цвет наследуется от соседнего текста)
   ===================================================================== */
const IC = {
  ioshare: '<rect x="5" y="9.5" width="14" height="11" rx="2"/><path d="M12 15V3.6"/><path d="M8.5 6.6 12 3.1l3.5 3.5"/>',  /* v1.07.23: значок «Поделиться» iOS */
  ban: '<circle cx="12" cy="12" r="8.2"/><path d="M6.4 6.6 17.6 17.4"/>',
  steam: '<path d="M7 4.2C5.3 6.3 5.3 8.4 7 10.5c1.7 2.1 1.7 4.2 0 6.3"/><path d="M12 4.2c-1.7 2.1-1.7 4.2 0 6.3 1.7 2.1 1.7 4.2 0 6.3"/><path d="M17 4.2c-1.7 2.1-1.7 4.2 0 6.3 1.7 2.1 1.7 4.2 0 6.3"/><path d="M5.5 20.5h13"/>',
  sponge: '<rect x="3" y="10.5" width="18" height="9" rx="3"/><circle cx="8" cy="15" r="1"/><circle cx="12.5" cy="17" r="1"/><circle cx="15.8" cy="13.8" r="1"/><path d="M6.5 3.8v3.4M4.8 5.5h3.4"/><path d="M17.5 3v3.4M15.8 4.7h3.4"/>',
  wrench: '<path d="M20.8 7.2a4.9 4.9 0 0 1-6.3 4.7l-6.7 6.7a2.33 2.33 0 1 1-3.3-3.3l6.7-6.7a4.9 4.9 0 0 1 5.9-6.2L14 5.5l1.1 3.4 3.4 1.1 3.1-3.1c.14.74.2 1 .2 1.3z" transform="translate(0 -.5)"/>',
  palette: '<path d="M12 3.2a8.8 8.8 0 1 0 .4 17.6c1.6 0 2.1-1 2.1-1.9 0-.8-.6-1.3-.6-2.1 0-1 .8-1.8 2-1.8h1.9c2.1 0 3.5-1.5 3.5-3.4C21.3 6.6 17.1 3.2 12 3.2z"/><circle cx="7.8" cy="9.2" r="1.1"/><circle cx="12" cy="7.2" r="1.1"/><circle cx="16.2" cy="9.2" r="1.1"/><circle cx="7" cy="13.8" r="1.1"/>',
  box: '<path d="M3.6 7.8L12 3.8l8.4 4v8.4l-8.4 4-8.4-4z"/><path d="M3.6 7.8l8.4 4 8.4-4"/><path d="M12 11.8v8.4"/>',
  fog: '<path d="M7.2 14.8a3.6 3.6 0 1 1 .5-7.15A5.1 5.1 0 0 1 17.6 8.4a3.35 3.35 0 0 1-.5 6.6l-9.9-.2z"/><path d="M5 18.6h8"/><path d="M15.6 18.6H19"/>',
  flask: '<path d="M9.3 3.4h5.4"/><path d="M10.4 3.4v5.3L5.5 17a2.4 2.4 0 0 0 2.1 3.6h8.8a2.4 2.4 0 0 0 2.1-3.6l-4.9-8.3V3.4"/><path d="M7.4 14.6h9.2"/>',
  drop: '<path d="M12 3.4c3.2 4 5.7 7 5.7 9.9a5.7 5.7 0 1 1-11.4 0C6.3 10.4 8.8 7.4 12 3.4z"/>',
  vent: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9.2h8"/><path d="M8 12.5h8"/><path d="M8 15.8h8"/>',
  fan: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="1.9"/><path d="M12 10.1V4.6"/><path d="M10.4 13l-4.8 2.8"/><path d="M13.6 13l4.8 2.8"/>',
  layers: '<path d="M4 8.4l8-4 8 4-8 4z"/><path d="M4 12.4l8 4 8-4"/><path d="M4 16.4l8 4 8-4"/>',
  pen: '<path d="M4.4 19.6l1-4L15.6 5.4l3 3L8.4 18.6z"/><path d="M13.7 7.3l3 3"/><path d="M17.3 3.7l3 3"/>',
  note: '<path d="M14 3.4H7a2 2 0 0 0-2 2v13.2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.4z"/><path d="M14 3.4v5h5"/><path d="M8.5 13h7"/><path d="M8.5 16.5h4.5"/>',
  mic: '<rect x="9" y="3.2" width="6" height="10.6" rx="3"/><path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0"/><path d="M12 17.8v2.6"/><path d="M9.4 20.4h5.2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.6 8.4l-1.9 5.3-5.3 1.9 1.9-5.3z"/>',
  key: '<circle cx="7.3" cy="15.7" r="3.9"/><path d="M10.1 12.9L20.2 2.8"/><path d="M15.3 7.7l3.1 3.1"/><path d="M12.6 10.4l2.1 2.1"/>',
  callbox: '<rect x="6" y="3.2" width="12" height="17.6" rx="2.5"/><path d="M9.2 6.8h5.6"/><g fill="currentColor" stroke="none"><circle cx="9" cy="11.4" r="1.05"/><circle cx="12" cy="11.4" r="1.05"/><circle cx="15" cy="11.4" r="1.05"/><circle cx="9" cy="15.2" r="1.05"/><circle cx="12" cy="15.2" r="1.05"/><circle cx="15" cy="15.2" r="1.05"/></g>',
  gate: '<path d="M5 20.6V7.4"/><circle cx="5" cy="5.2" r="1.9"/><path d="M6.9 5.9l13.3 4.3-.8 2.4L6.6 8.4"/><path d="M11.2 7.3l-.8 2.4"/><path d="M15.2 8.6l-.8 2.4"/><path d="M3 20.6h4"/>',
  crew: '<circle cx="12" cy="8.6" r="3.6"/><path d="M5.2 20.4a6.8 6.8 0 0 1 13.6 0"/>',
  share: '<circle cx="6" cy="12" r="2.7"/><circle cx="17.4" cy="5.8" r="2.7"/><circle cx="17.4" cy="18.2" r="2.7"/><path d="M8.4 10.7l6.6-3.6"/><path d="M8.4 13.3l6.6 3.6"/>',
  toolbox: '<rect x="3.4" y="8.4" width="17.2" height="11" rx="2"/><path d="M9 8.4V7a3 3 0 0 1 6 0v1.4"/><path d="M3.4 13h17.2"/><path d="M10.4 13v2.6h3.2V13"/>',
  save: '<path d="M5.6 4h10.8L20 7.6V18.4A1.6 1.6 0 0 1 18.4 20H5.6A1.6 1.6 0 0 1 4 18.4V5.6A1.6 1.6 0 0 1 5.6 4z"/><path d="M8 4v4.6h7V4"/><path d="M8 20v-6.4h8V20"/>',
  download: '<path d="M12 3.8v10.4"/><path d="M7.4 9.8l4.6 4.6 4.6-4.6"/><path d="M4.4 19.6h15.2"/>',
  trash: '<path d="M4.4 6.4h15.2"/><path d="M9 6.4V4.9a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 4.9v1.5"/><path d="M6.4 6.4l1 13.1a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l1-13.1"/><path d="M10 10.4v6.2"/><path d="M14 10.4v6.2"/>',
  star: '<path d="M12 3.6l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  bell: '<path d="M6.2 18.4h11.6c-1.3-1.6-1.8-3.2-1.8-5.2v-2.6a4 4 0 1 0-8 0v2.6c0 2-.5 3.6-1.8 5.2z"/><path d="M12 3.4v1.8"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  owl: '<path d="M4.6 6.6C4.6 3.7 7 3.2 7.6 5.3 8.8 4.1 10.3 3.5 12 3.5s3.2.6 4.4 1.8c.6-2.1 3-1.6 3 1.3.6 1.3 1 2.8 1 4.4 0 5-3.7 8.6-8.4 8.6S3.6 16 3.6 11c0-1.6.4-3.1 1-4.4z"/><circle cx="9" cy="10.4" r="2.4"/><circle cx="15" cy="10.4" r="2.4"/><path d="M12 13l-1.2 1.6h2.4z"/>',
  map: '<path d="M3.6 6.4l5.4-2 6 2 5.4-2v13.2l-5.4 2-6-2-5.4 2z"/><path d="M9 4.4v13.2"/><path d="M15 6.4v13.2"/>',
  calendar: '<rect x="4" y="5.4" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M8.4 3.4v4"/><path d="M15.6 3.4v4"/>',
  pin: '<path d="M12 21s-6.6-6.1-6.6-10.7a6.6 6.6 0 0 1 13.2 0C18.6 14.9 12 21 12 21z"/><circle cx="12" cy="10.2" r="2.3"/>',
  book: '<path d="M12 6.4C10.5 4.9 8.5 4.4 5.5 4.4c-.9 0-1.5.6-1.5 1.4v11.6c0 .8.6 1.4 1.5 1.4 3 0 5 .5 6.5 2 1.5-1.5 3.5-2 6.5-2 .9 0 1.5-.6 1.5-1.4V5.8c0-.8-.6-1.4-1.5-1.4-3 0-5 .5-6.5 2z"/><path d="M12 6.4v14.4"/>',
  clipboard: '<path d="M9 4.6H6.6A1.6 1.6 0 0 0 5 6.2v13.2A1.6 1.6 0 0 0 6.6 21h10.8a1.6 1.6 0 0 0 1.6-1.6V6.2a1.6 1.6 0 0 0-1.6-1.6H15"/><rect x="9" y="3" width="6" height="3.4" rx="1.2"/><path d="M8.6 11.4h6.8"/><path d="M8.6 15h4.8"/>',
  dollar: '<path d="M16.2 7.6a4.4 4.4 0 0 0-3.8-1.8c-2.3 0-4.2 1.2-4.2 3s1.8 2.5 4.2 3 4.2 1.3 4.2 3.1-1.9 3-4.2 3a4.4 4.4 0 0 1-3.8-1.9"/><path d="M12.4 3.4v17.2"/>',
  receipt: '<path d="M6 3.4h12V20l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6"/><path d="M9 11.4h6"/><path d="M9 14.8h4"/>',
  building: '<path d="M5 21V4h14v17"/><path d="M3.6 21h16.8"/><path d="M9 8h1.6M13.4 8H15M9 12h1.6M13.4 12H15M9 16h1.6M13.4 16H15"/><path d="M11 21v-2.6h2V21"/>',
  eye: '<path d="M2.8 12S6.5 5.8 12 5.8 21.2 12 21.2 12 17.5 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  hand: '<path d="M7.6 12.4V7a1.35 1.35 0 0 1 2.7 0v4M10.3 11V5.4a1.35 1.35 0 0 1 2.7 0V11M13 11V6.2a1.35 1.35 0 0 1 2.7 0v5.6"/><path d="M15.7 11.8l1.5-2.2a1.3 1.3 0 0 1 2.2 1.4l-2.5 5a5.9 5.9 0 0 1-5.3 3.4c-3.2 0-4.5-1.7-6.1-4.9l-1.4-2.7a1.35 1.35 0 0 1 2.3-1.4l1.2 1.9"/>',
  mail: '<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2"/><path d="M4.4 7l7.6 6 7.6-6"/>',
  send: '<path d="M20.6 3.4L3.4 10.3l7.1 2.4 2.4 7.1z"/><path d="M20.6 3.4L10.5 12.7"/>',
  inbox: '<path d="M3.4 13.4h4.7l1.7 2.6h4.4l1.7-2.6h4.7"/><path d="M5.6 5.4h12.8l2.2 8v5.2a1.5 1.5 0 0 1-1.5 1.5H4.9a1.5 1.5 0 0 1-1.5-1.5v-5.2z"/>',
  archive: '<rect x="3.4" y="4.4" width="17.2" height="5" rx="1.2"/><path d="M5 9.4v8.7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.4"/><path d="M10 13.4h4"/>',
  chk_on: '<rect x="4" y="4" width="16" height="16" rx="3.6"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>',
  chk_off: '<rect x="4" y="4" width="16" height="16" rx="3.6"/>',
  font: '<path d="M3.6 19L8.2 5.4h1L13.8 19"/><path d="M5.4 14.4h6.6"/><circle cx="18" cy="15.6" r="3.2"/><path d="M21.2 12.4V19"/>',
  pencil: '<path d="M4 20l.9-3.6L15.6 5.7l2.7 2.7L7.6 19.1z"/><path d="M14.3 7l2.7 2.7"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.6"/><path d="M11 17.8h2"/>',
  car: '<path d="M4.4 16.4v-4L6.3 8a2 2 0 0 1 1.9-1.3h7.6A2 2 0 0 1 17.7 8l1.9 4.4v4"/><path d="M4.4 12.4h15.2"/><circle cx="8" cy="16.9" r="1.9"/><circle cx="16" cy="16.9" r="1.9"/><path d="M9.9 16.9h4.2"/>',
  steth: '<path d="M5.4 3.6v4.8a4.4 4.4 0 0 0 8.8 0V3.6"/><path d="M4 3.6h2.8M12.8 3.6h2.8"/><path d="M9.8 12.8v3.6a4.1 4.1 0 0 0 8.2 0v-1.6"/><circle cx="18" cy="12.2" r="2.5"/>',
  cart: '<circle cx="9.6" cy="19.4" r="1.6"/><circle cx="17" cy="19.4" r="1.6"/><path d="M3.4 4.4H6l2.3 10.3a1.8 1.8 0 0 0 1.8 1.4h6.5a1.8 1.8 0 0 0 1.8-1.4l2-6.7H7"/>',
  ruler: '<g transform="rotate(-35 12 12)"><rect x="2.8" y="9.2" width="18.4" height="5.6" rx="1.3"/><path d="M7 9.2v2.4M10.4 9.2v2.4M13.8 9.2v2.4M17.2 9.2v2.4"/></g>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.4 9.2a2.7 2.7 0 0 1 5.3.7c0 1.8-2.7 2.2-2.7 3.9"/><circle cx="12" cy="17" r=".4"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M21 4v5h-5M3 20v-5h5"/>',
  chart: '<path d="M4 19.6h16"/><path d="M7 19.6v-6.2"/><path d="M12 19.6V9"/><path d="M17 19.6V4.8"/>',
  warn: '<path d="M12 3.8L21.5 20.2H2.5z"/><path d="M12 10v4.6"/><path d="M12 17.6v.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.1"/><path d="M15.3 15.3 20.2 20.2"/>'
};
function ic(n, style){
  const p = IC[n]; if (!p) return '';
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${style?` style="${style}"`:''}>${p}</svg>`;
}
function helpBtn(key){
  return `<button type="button" class="help-btn" onclick="event.stopPropagation();App.sectionHelp('${key}')" title="${t('help_title')}">?</button>`;
}

/* =====================================================================
   СПРАВКА ПО СЕКЦИЯМ ИНВОЙСА («?» в заголовке секции)
   ===================================================================== */
const SECTION_HELP = {
 "steam": {
  "title": "Steam Clean",
  "items": [
   {
    "t": "Deep Scrub",
    "r": "Глубокая паровая чистка ковра с механическим скрабированием (предварительная обработка + агитация щёткой). Цена за комнату.",
    "e": "Deep steam cleaning with pre-spray and mechanical brush agitation. Priced per room."
   },
   {
    "t": "Rotovac",
    "r": "Чистка роторной экстракционной машиной Rotovac — сотни проходов в минуту, для сильно загрязнённых ковров. Цена за комнату.",
    "e": "Cleaning with a Rotovac rotary extractor — for heavily soiled carpet. Priced per room."
   },
   {
    "t": "Rooms",
    "r": "Количество комнат — множитель для отмеченных услуг секции.",
    "e": "Number of rooms — a multiplier for the checked services."
   }
  ]
 },
 "removals": {
  "title": "Removals",
  "items": [
   {
    "t": "Red Stain",
    "r": "Выведение красных пятен (соки, вино, Kool-Aid) термопереносом.",
    "e": "Red stain removal (juice, wine, Kool-Aid) via heat transfer."
   },
   {
    "t": "Wax",
    "r": "Удаление воска и парафина (свечи).",
    "e": "Wax and paraffin removal (candles)."
   },
   {
    "t": "Rust",
    "r": "Удаление пятен ржавчины (от мебели, гвоздей).",
    "e": "Rust stain removal (furniture legs, nails)."
   },
   {
    "t": "Ink",
    "r": "Удаление чернил, маркера, ручки.",
    "e": "Ink, marker and pen removal."
   },
   {
    "t": "Gum",
    "r": "Удаление жвачки (заморозка + счистка).",
    "e": "Chewing gum removal (freeze and scrape)."
   },
   {
    "t": "Paint Removal",
    "r": "Удаление пятен краски с ковра.",
    "e": "Paint spot removal from carpet."
   }
  ]
 },
 "repairs": {
  "title": "Repairs",
  "items": [
   {
    "t": "Threshold",
    "r": "Порожек в дверном проёме: закрепление или замена перехода ковра.",
    "e": "Doorway threshold: re-securing or replacing the carpet transition."
   },
   {
    "t": "Stretch",
    "r": "Перетяжка ковра (power stretch) — устранение волн и складок с повторным закреплением.",
    "e": "Carpet power stretch — removing ripples and re-securing the carpet."
   },
   {
    "t": "Seam",
    "r": "Ремонт разошедшегося шва ковра (термолента).",
    "e": "Repairing a separated carpet seam (heat-bond tape)."
   },
   {
    "t": "Patch",
    "r": "Заплатка: вырезка повреждённого участка и вклейка донорского куска.",
    "e": "Patch: cutting out damage and bonding in a donor piece."
   }
  ]
 },
 "dye": {
  "title": "Dye",
  "items": [
   {
    "t": "Spot Dye",
    "r": "Подкраска осветлённого/выцветшего пятна (например, от отбеливателя) в цвет ковра.",
    "e": "Spot dyeing a bleached or faded spot to match the carpet colour."
   },
   {
    "t": "Full Dye",
    "r": "Полная покраска ковра в комнате целиком.",
    "e": "Full carpet dye of the entire room."
   }
  ]
 },
 "other": {
  "title": "Other",
  "items": [
   {
    "t": "Trash Out",
    "r": "Вынос мусора и брошенных вещей из юнита.",
    "e": "Removing trash and abandoned items from the unit."
   },
   {
    "t": "Pad Removal",
    "r": "Демонтаж старой подложки ковра. Цена за комнату либо фикс за весь юнит (All Unit).",
    "e": "Removing old carpet pad. Priced per room, or flat for the whole unit (All Unit)."
   },
   {
    "t": "All Unit",
    "r": "Подложка снимается во всём юните — применяется фиксированная цена вместо поштучной.",
    "e": "Pad removed in the entire unit — a flat price applies instead of per-room."
   },
   {
    "t": "Rooms",
    "r": "Число комнат для Pad Removal (когда не выбран All Unit).",
    "e": "Room count for Pad Removal (when All Unit is not selected)."
   }
  ]
 },
 "fog": {
  "title": "Fog / GOC",
  "items": [
   {
    "t": "Fog",
    "r": "Обработка помещения дезинфицирующим/дезодорирующим туманом (фоггером). Отметка в инвойсе без отдельной цены.",
    "e": "Treating the unit with a disinfecting/deodorising fog (fogger). Invoice mark without a separate price."
   },
   {
    "t": "GOC",
    "r": "?????",
    "e": "?????"
   },
   {
    "t": "Pet",
    "r": "Обработка от запахов и меток животных (энзимы).",
    "e": "Pet odour and urine treatment (enzymes)."
   },
   {
    "t": "Smoke",
    "r": "Устранение запаха дыма и табака.",
    "e": "Smoke and tobacco odour removal."
   },
   {
    "t": "Deodorizer",
    "r": "Дезодорация помещения после чистки.",
    "e": "Deodorising the unit after cleaning."
   }
  ]
 },
 "treatments": {
  "title": "Treatments",
  "items": [
   {
    "t": "Sealant",
    "r": "Защитная пропитка ковра после чистки (грязе- и влагоотталкивающая).",
    "e": "Protective carpet sealant after cleaning (soil and moisture repellent)."
   },
   {
    "t": "Mold & Mildew",
    "r": "Антисептическая обработка от плесени и грибка.",
    "e": "Anti-microbial treatment for mold and mildew."
   },
   {
    "t": "Degreaser",
    "r": "Обезжиривающая обработка (кухни, жирные загрязнения).",
    "e": "Degreasing treatment (kitchens, greasy soils)."
   }
  ]
 },
 "wetvac": {
  "title": "Wet Vac / Flood",
  "items": [
   {
    "t": "Wet Vac",
    "r": "Сбор воды с ковра экстрактором после протечки.",
    "e": "Extracting water from carpet after a leak."
   },
   {
    "t": "Flood",
    "r": "Затопление: откачка воды по зонам юнита.",
    "e": "Flood: water extraction by unit areas."
   },
   {
    "t": "Sewer",
    "r": "Канализационная вода — доплата за загрязнённую категорию воды.",
    "e": "Sewage water — surcharge for contaminated water category."
   },
   {
    "t": "Fresh Water",
    "r": "Чистая вода (водопровод) — отметка категории, без доплаты.",
    "e": "Fresh (supply) water — category mark, no surcharge."
   },
   {
    "t": "Ktc / Lr / Dr / Hall / Br's",
    "r": "Зоны: Kitchen — кухня, Living room — гостиная, Dining room — столовая, Hall — коридор, Bedrooms — спальни. Цена за каждую отмеченную зону.",
    "e": "Areas: Kitchen, Living room, Dining room, Hall, Bedrooms. Priced per checked area."
   },
   {
    "t": "All Unit",
    "r": "Весь юнит — фиксированная цена вместо оплаты по зонам.",
    "e": "Entire unit — flat price instead of per-area."
   }
  ]
 },
 "airduct": {
  "title": "Air Duct / Dryer Vent",
  "items": [
   {
    "t": "Air Duct Cleaning",
    "r": "Чистка вентиляционных каналов; цена за каждую спальню (Bedrooms).",
    "e": "Air duct cleaning; priced per bedroom."
   },
   {
    "t": "Dryer Vent Cleaning",
    "r": "Чистка вентканала сушильной машины.",
    "e": "Dryer vent cleaning."
   },
   {
    "t": "Bedrooms",
    "r": "Число спален — множитель для Air Duct.",
    "e": "Bedroom count — multiplier for Air Duct."
   },
   {
    "t": "note…",
    "r": "Примечание к секции, попадает в PDF-инвойс.",
    "e": "Section note, appears in the PDF invoice."
   }
  ]
 },
 "equipment": {
  "title": "Equipment Rental",
  "items": [
   {
    "t": "Формула / Formula",
    "r": "Аренда сушильного оборудования: количество × дни × цена в сутки.",
    "e": "Drying equipment rental: quantity × days × price per day."
   },
   {
    "t": "Blower (BLW)",
    "r": "Вентилятор для просушки (air mover).",
    "e": "Air mover fan for drying."
   },
   {
    "t": "Dehumidifier (DHM)",
    "r": "Осушитель воздуха — убирает влагу из помещения.",
    "e": "Dehumidifier — removes moisture from the air."
   },
   {
    "t": "Air Scrubber (SCR)",
    "r": "Очиститель воздуха с HEPA-фильтром.",
    "e": "Air scrubber with HEPA filtration."
   },
   {
    "t": "Ozone Machine (OZN)",
    "r": "Озонатор — устранение стойких запахов (работает в пустом помещении).",
    "e": "Ozone generator — removes persistent odours (runs in an empty unit)."
   }
  ]
 },
 "pad": {
  "title": "Pad Installation",
  "items": [
   {
    "t": "1/4 · 1/2 · 3/4 · 1 Roll",
    "r": "Количество материала подложки: четверть, половина, три четверти или целый рулон.",
    "e": "Amount of pad material: quarter, half, three-quarters or a full roll."
   },
   {
    "t": "Rooms",
    "r": "Установка подложки — цена за каждую комнату.",
    "e": "Pad installation — priced per room."
   },
   {
    "t": "All Unit",
    "r": "Установка во всём юните — фиксированная цена.",
    "e": "Installation in the entire unit — flat price."
   }
  ]
 },
 "others": {
  "title": "Other services",
  "items": [
   {
    "t": "Описание + $",
    "r": "Свободные строки: любая услуга словами и её сумма — попадают в инвойс как есть.",
    "e": "Free-form lines: any service in words plus its amount — go to the invoice as-is."
   }
  ]
 },
 "note": {
  "title": "Заметка · Доп. работы и покупки / Note",
  "items": [
   {
    "t": "Заметка / Note",
    "r": "Текст попадает в PDF-инвойс (строка NOTES).",
    "e": "The text goes into the PDF invoice (NOTES line)."
   },
   {
    "t": "＋ Шаблон / Template",
    "r": "Подставляет позиции из справочника «Доп. работы и покупки»: у работ с размером появляется поле размера, цена считается автоматически и попадает в раздел Extra.",
    "e": "Inserts items from the “Extra works & purchases” directory: sized works get a size input, the price is calculated automatically into the Extra section."
   },
   {
    "t": "Микрофон / Mic",
    "r": "Голосовая диктовка заметки (RU/EN).",
    "e": "Voice dictation of the note (RU/EN)."
   },
   {
    "t": "Перевести на EN / Translate",
    "r": "Переводит текст заметки на английский для инвойса.",
    "e": "Translates the note into English for the invoice."
   }
  ]
 }
};
function sectionHelpModal(key){
  const s = SECTION_HELP[key]; if (!s) return;
  const L = state.lang === 'ru' ? 'r' : 'e';
  const rows = s.items.map(it => it.r === '?????'
    ? `<div class="help-row"><b>${esc(it.t)}</b><div class="tiny">?????</div><div style="height:2.4em"></div></div>`
    : `<div class="help-row"><b>${esc(it.t)}</b><div class="tiny">${esc(it[L])}</div></div>`).join('');
  openModal(`${modalHead(s.title, 'help')}<div class="card" style="padding:4px 12px">${rows}</div>`);
}


/* =====================================================================
   v1.07.18: ЖУРНАЛ ДЕЙСТВИЙ СОТРУДНИКОВ (админ)
   Локально пишем всегда (до 2000 записей, живёт в state.data.audit_log);
   при Supabase дополнительно шлём в таблицу audit_log (insert-only,
   читает только админ; регистрацию пишет серверный триггер).
   ===================================================================== */
let auditDbMissing = false;
function audit(action, entity, entityId, details){
  try{
    const row = {
      id: uid(), at: new Date().toISOString(),
      actor: state.user?.id || null, actor_name: state.user?.display_name || '',
      action, entity: entity || null,
      entity_id: entityId != null ? String(entityId) : null,
      details: details || {}
    };
    row.src = JR_TECH_SET.has(action) ? 'tech' : 'doc';   // v1.07.27
    if (!state.data.audit_log) state.data.audit_log = [];
    state.data.audit_log.unshift(row);
    if (state.data.audit_log.length > 2000) state.data.audit_log.length = 2000;
    saveLocal();
    if (HAS_SB && state.sb){
      Promise.resolve(state.sb.from(row.src === 'tech' ? 'tech_log' : 'audit_log').insert({
        at: row.at, actor: row.actor, actor_name: row.actor_name,
        action, entity: row.entity, entity_id: row.entity_id, details: row.details
      })).then(({ error } = {}) => {
        if (error){
          dlog('⛔ audit insert:', error);
          if (!auditDbMissing && /audit_log|42P01|schema cache/i.test(errStr(error))){
            auditDbMissing = true; toast('⚠ ' + t('jr_need_db'), 'err');
          }
        }
      }).catch(e => dlog('⛔ audit insert exception:', e));
    }
  }catch(e){ dlog('⛔ audit():', e); }
}

const JR_PAGE = 300;
/* v1.07.27: журнал разделён — документы (audit_log) и система (tech_log) */
const JR_DOC_ACTIONS = ['job_create','job_update','job_done','job_reopen','job_approve','job_delete',
  'approve_reset','price_change','priority_set','crew_add','crew_remove',
  'pickup_done','pickup_early','pickup_restore','extension_create',
  'ext_request','ext_request_approved','ext_request_rejected',
  'proposal_create','proposal_update','proposal_delete','proposal_link','proposal_unlink'];
const JR_TECH_ACTIONS = ['user_register','user_create','user_block','user_unblock','role_change',
  'password_change','password_reset','car_no_set','org_toggle','org_set','stock_set',
  'backup_export','backup_restore'];
const JR_TECH_SET = new Set(JR_TECH_ACTIONS);

async function loadJournal(reset){
  if (!isAdmin()) return;
  const jr = state.jr;
  if (!jr.tab) jr.tab = 'doc';
  if (jr.loading) return;
  jr.loading = true;
  if (reset) jr.rows = null;
  render();
  try{
    if (!HAS_SB){
      let rows = (state.data.audit_log || []).slice();
      rows = rows.filter(r => (r.src || 'doc') === (jr.tab === 'tech' ? 'tech' : 'doc'));
      if (jr.act)   rows = rows.filter(r => r.action === jr.act);
      if (jr.actor) rows = rows.filter(r => r.actor === jr.actor);
      const upto = (reset ? 0 : ((jr.rows && jr.rows.length) || 0)) + JR_PAGE;
      jr.rows = rows.slice(0, upto);
      jr.more = rows.length > jr.rows.length;
    } else {
      const from = reset ? 0 : ((jr.rows && jr.rows.length) || 0);
      let q = state.sb.from(jr.tab === 'tech' ? 'tech_log' : 'audit_log').select('*')
        .order('at', { ascending: false }).range(from, from + JR_PAGE - 1);
      if (jr.act)   q = q.eq('action', jr.act);
      if (jr.actor) q = q.eq('actor', jr.actor);
      const { data, error } = await q;
      if (error){
        dlog('⛔ journal load:', error);
        if (/audit_log|42P01|schema cache/i.test(errStr(error))) auditDbMissing = true;
        jr.rows = jr.rows || []; jr.more = false;
      } else {
        jr.rows = reset ? (data || []) : [ ...(jr.rows || []), ...(data || []) ];
        jr.more = (data || []).length === JR_PAGE;
      }
    }
  }catch(e){ dlog('⛔ loadJournal:', e); state.jr.rows = state.jr.rows || []; }
  state.jr.loading = false;
  render();
}

function jrChipClass(a){
  if (a === 'job_approve' || /^proposal/.test(a)) return 'purple';
  if (a === 'ext_request_approved') return 'ok';
  if (a === 'ext_request_rejected') return 'bad';                              // апрув — фиолетовый везде
  if (/delete|_block$/.test(a)) return 'bad';
  if (/pickup|extension|crew/.test(a)) return 'info';
  if (/register|create|unblock|_done$/.test(a)) return 'ok';
  return 'warn';
}
function jrDetails(r){
  const d = r.details || {}, bits = [];
  if (d.unit) bits.push('Unit ' + d.unit);
  if (d.complex) bits.push(d.complex);
  if (d.work) bits.push(d.work);
  if (d.date) bits.push(fmtDMY(d.date));
  if (d.total != null) bits.push(money(+d.total || 0));
  if (d.days) bits.push('+' + d.days + ' ' + t('days'));
  if (d.qty) bits.push('× ' + d.qty);
  if (d.eq) bits.push(d.eq);
  if (Array.isArray(d.items)) bits.push(d.items.map(i => `${i.qty}×${i.eq}`).join(' '));
  if (d.login) bits.push('@' + d.login);
  if (d.role) bits.push(t('role_' + d.role));
  if (d.name) bits.push(d.name);
  if (Array.isArray(d.added) && d.added.length) bits.push('+ ' + d.added.join(', '));
  if (Array.isArray(d.removed) && d.removed.length) bits.push('− ' + d.removed.join(', '));
  if (d.no != null) bits.push('P-' + d.no);
  if (d.old != null && d.new != null) bits.push(money(+d.old||0) + ' → ' + money(+d.new||0));
  if (d.key) bits.push(d.key + (d.v != null ? '=' + d.v : (d.on != null ? (d.on ? '=on' : '=off') : '')));
  return bits.map(esc).join(' · ');
}
function viewJournal(){
  if (!isAdmin()) return `<div class="list-empty">${t('no_access')}</div>`;
  const jr = state.jr;
  if (!jr.tab) jr.tab = 'doc';
  if (jr.rows === null && !jr.loading) setTimeout(() => loadJournal(true), 0);
  const profs = state.data.profiles || [];
  const roleOf = id => (profs.find(p => p.id === id) || {}).role || 'tech';
  const rowsHtml = (jr.rows || []).map(r => {
    const when = String(r.at || '').slice(5, 16).replace('T', ' ');
    const job = r.entity === 'job' ? state.data.jobs.find(x => x.id === r.entity_id) : null;
    const lbl = t('act_' + r.action);
    return `<div class="rowline jr-row">
      <span class="tiny nowrap jr-when">${esc(when)}</span>
      <span class="avatar role-${roleOf(r.actor)} jr-av">${esc(initials(r.actor_name || '?'))}</span>
      <div class="grow"><b>${esc(r.actor_name || '—')}</b>
        <span class="chip ${jrChipClass(r.action)}">${esc(lbl === 'act_' + r.action ? r.action : lbl)}</span>
        <div class="tiny">${jrDetails(r)}</div></div>
      ${job ? `<button class="btn btn-ghost sm" onclick="App.openJob('${job.id}')">${t('jr_open')}</button>` : ''}
    </div>`;
  }).join('');
  return `
  <div class="section-title">${t('jr_title')} <span class="hint">${HAS_SB ? (auditDbMissing ? '' : 'Supabase') : t('jr_local')}</span></div>
  ${auditDbMissing ? `<div class="note-red" style="margin-bottom:10px">${t('jr_need_db')}</div>` : ''}
  <div class="lang-seg" style="margin-bottom:8px">
    <button class="${(jr.tab||'doc')==='doc'?'on':''}" onclick="App.jrTab('doc')">${t('jr_tab_doc')}</button>
    <button class="${jr.tab==='tech'?'on':''}" onclick="App.jrTab('tech')">${t('jr_tab_tech')}</button>
  </div>
  <div class="filter-row">
    <select style="flex:1" onchange="App.jrAct(this.value)">
      <option value="">${t('jr_all_actions')}</option>
      ${(jr.tab === 'tech' ? JR_TECH_ACTIONS : JR_DOC_ACTIONS).map(a => `<option value="${a}" ${jr.act === a ? 'selected' : ''}>${t('act_' + a)}</option>`).join('')}
    </select>
    <select style="flex:1" onchange="App.jrActor(this.value)">
      <option value="">${t('jr_all_staff')}</option>
      ${profs.map(p => `<option value="${p.id}" ${jr.actor === p.id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}
    </select>
    <button class="btn btn-ghost sm" onclick="App.jrRefresh()">🔄</button>
  </div>
  <div class="card">${rowsHtml || `<div class="list-empty">${jr.loading ? '…' : t('jr_empty')}</div>`}</div>
  ${jr.more ? `<button class="btn btn-ghost" onclick="App.jrMore()">${t('jr_more')}</button>` : ''}`;
}

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
  else if (state.screen === 'journal') body = viewJournal();   // v1.07.18
  else if (state.screen === 'board') body = viewBoard();       // v1.07.25
  else if (state.screen === 'proposals') body = viewProposals(); // v1.07.27
  app.innerHTML = viewHeader() + body + viewTabbar();
  if (state.screen === 'home' || state.screen === 'board'){
    try { document.querySelector('.day-cell.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch(e){}
  }
  if (state.screen === 'dirs'){
    try { document.querySelector('#dir-tabs .tabbtn.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch(e){}
  }
  if (state.screen === 'job') bindJobForm();
  if (state.screen === 'map') initMapView();
}

function viewHeader(){
  const u = state.user;
  const org = (state.data && state.data.org_settings) || {};
  return `
  <div class="topbar">
    <div class="logo clicky" role="button" tabindex="0" title="${t('tab_home')}" onclick="App.logoHome()"><span>TL</span></div>
    <div class="brand clicky" role="button" tabindex="0" title="${t('upd_checking')}" onclick="App.checkVerClick()">
      <div class="name">Tech<b>Log</b><span class="name-tag">${t('app_tag')}</span></div>
      <div class="sub">by ${esc(org.company_short || 'APC')} · v${APP_VERSION}</div>
    </div>
    <div class="rt-col">
      <span class="vm-inline" id="vm-slot" role="group">
        <button class="${vmCur()==='mobile'?'on':''}" onclick="App.setVm('mobile')" aria-label="Телефон" title="Телефон">${ICONS.phone}</button>
        <button class="${vmCur()==='desktop'?'on':''}" onclick="App.setVm('desktop')" aria-label="ПК" title="ПК">${ICONS.monitor}</button>
      </span>
      <div class="role-tag rt-${u.role}" title="${t('role_' + u.role)}">${t('role_' + u.role)}</div>
    </div>
    <div class="avatar-wrap">
      <button class="avatar role-${u.role}" onclick="App.go('settings')" aria-label="${t('settings')}">${esc(initials(u.display_name))}</button>
      <div class="login-pill role-${u.role}">${esc(u.login)}</div>
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
    ...(isManager() ? [['board', ICONS.board, t('tab_board')]] : []),   // v1.07.25
    ...(isManager() ? [['proposals', ICONS.prop, t('tab_proposals')]] : []),  // v1.07.27
    ['map', ICONS.map, t('tab_map')],
    ['reports', ICONS.pdf, t('tab_reports')],
    ['stats', ICONS.stats, t('tab_stats')],
    ['dirs', ICONS.dirs, t('tab_dirs')],
    ...(isAdmin() ? [['journal', ICONS.book, t('tab_journal')]] : []),   // v1.07.18
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
        <div class="mon">${iso===today ? `<span class="today-tag">${t('today_tag')}</span>` : t('months')[d.getMonth()]}</div>
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
  // v1.07.05: треугольник приоритета живёт в правом верхнем углу карточки
  if (!on && !canEdit) return '';
  const cls = 'pri corner' + (on ? ' on' : '');
  return canEdit
    ? `<button class="${cls}" title="${t('priority')}" onclick="event.stopPropagation();App.togglePriority('${jobId}')"><span class="tri">!</span></button>`
    : `<span class="${cls}"><span class="tri">!</span></span>`;
}
function railHtml(j){
  const can = canReorder(j);
  if (!can) return '';
  return `<div class="rail" onclick="event.stopPropagation()">
    <button class="mv" title="${t('move_up')}" onclick="App.moveJob('${j.id}',-1)">▲</button>
    <button class="mv" title="${t('move_down')}" onclick="App.moveJob('${j.id}',1)">▼</button>
  </div>`;
}
/* Адрес целиком + кнопка копирования; коды доступа/callbox целиком, копирование тапом */
function addrLineHtml(cx){
  if (!cx || !cx.address) return '';
  return `<div class="s addr"><span class="addr-txt">${esc(cx.address)}</span>
    <button class="copy-mini" title="${t('copy_addr')}" aria-label="${t('copy_addr')}"
      onclick="event.stopPropagation();App.copyCxAddr('${cx.id}')">${ic('clipboard')}</button></div>`;
}
function codesLineHtml(cx){
  if (!cx || (!cx.access_code && !cx.callbox_code)) return '';
  return `<div class="s codes">${codeLineHtml(cx, true)}</div>`;
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
function rowNumHtml(n){ return `<span class="row-num corner">${n}</span>`; }

function viewHome(){
  const iso = state.selDate;
  const today = todayISO();
  const num = dayNumbering(iso);
  const { jobs, pkGroups, pkDone } = num;
  const { due, over } = myDueCount();

  const banner = (due+over) > 0 ? `
    <div class="banner ${over?'b-red':''}" role="status">${ic('bell')}
      <div>${t('banner_pickups')}: <b>${due}</b>${over?` · ${t('banner_overdue')}: <b>${over}</b> <span class="info-i" title="${t('overdue_hint')}" onclick="event.stopPropagation();App.toastInfo('overdue_hint')">ⓘ</span>`:''}</div>
    </div>` : '';
  /* v1.07.23: iPhone/iPad без установленной PWA — подсказываем установку */
  const a2hs = a2hsShow() ? `
    <div class="banner a2hs" role="status">${ic('phone')}
      <div class="grow"><b>${t('a2hs_title')}</b><div class="tiny">${t('a2hs_text')}</div></div>
      <button class="btn btn-blue sm" onclick="App.a2hsModal()">${t('a2hs_how')}</button>
      <button class="btn btn-ghost sm" title="${t('a2hs_hide_hint')}" onclick="App.a2hsHide()">✕</button>
    </div>` : '';

  const q = (state.searchQ || '').trim();
  const filter = `
    <div class="filter-row">
      ${isManager() ? `
      <div class="lang-seg">
        <button class="${state.filterMine?'on':''}" onclick="App.setMine(true)">${t('mine')}</button>
        <button class="${!state.filterMine?'on':''}" onclick="App.setMine(false)">${t('all')}</button>
      </div>` : ''}
      <div class="search-box">
        ${ic('search')}
        <input id="home-search" type="search" autocomplete="off" enterkeyhint="search" placeholder="${t('search_ph')}" value="${esc(state.searchQ || '')}" oninput="App.searchInput(this.value)">
        <button class="x" id="search-clear" style="${q?'':'display:none'}" onclick="App.searchClear()" aria-label="✕">✕</button>
      </div>
    </div>`;

  const pkHtml = pkGroups.map(([jobId, list]) => {
    const p0 = list[0];
    const cx = cxById(p0.complex_id) || {abbr:'?', name:'?', address:''};
    const overdue = p0.due_date < today;
    const pkJob = state.data.jobs.find(x=>x.id===jobId) || { id: jobId, priority:false, technician_id: p0.technician_id, sort_order: 999 };
    return `
    <div class="item clicky" data-drag-id="${jobId}" data-can="${canReorder(pkJob)?1:0}" style="border-left-color:${pkJob.priority ? 'var(--red)' : '#8AA0AB'}" onclick="App.pickupModal('${jobId}','${iso}',event)">
      ${rowNumHtml(num.pkNum[jobId])}
      ${triHtml(!!pkJob.priority, jobId, canPrio(pkJob))}
      ${railHtml(pkJob)}
      <div class="info">
        <div class="t">${esc(cx.name)} · Unit ${esc(p0.unit_number||'')}</div>
        ${addrLineHtml(cx)}
        <div class="s">${t('pickup')} · ${t('due')}: ${fmtDMY(p0.due_date)} ${overdue?`<span class="chip bad">${t('overdue')}</span>`:''}${list.some(p=>p.ext_of)?` <span class="chip info">${t('ext_chip')}</span>`:''} ${(!state.filterMine || isPlacementSharedWithMe(p0))?'· '+esc(profName(p0.technician_id)):''}</div>
        ${codesLineHtml(cx)}
        ${(state.data.jobs.find(x=>x.id===jobId)||{}).note ? `<div class="s note-line">${ic('note')} ${esc((state.data.jobs.find(x=>x.id===jobId)||{}).note)}</div>` : ''}
      </div>
      <div class="right">
        <div class="eq-dots">${eqDotsFor(list)}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-ghost sm" title="${t('navigate')}" onclick="App.navToCx('${p0.complex_id}')">${ic('compass')}</button>
          <button class="btn btn-ghost sm" title="${t('note')}" onclick="App.noteModal('${jobId}')">${ic('note')}</button>
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
    <div class="item clicky" data-drag-id="${j.id}" data-can="${canReorder(j)?1:0}" style="border-left-color:${wt.color}" onclick="App.openJob('${j.id}')">
      ${rowNumHtml(num.jobNum[j.id])}
      ${triHtml(!!j.priority, j.id, canPrio(j))}
      ${railHtml(j)}
      <div class="info">
        <div class="t">${esc(cx.name)} · Unit ${esc(j.unit_number||'—')}</div>
        ${addrLineHtml(cx)}
        <div class="s"><span style="color:${wt.color};font-weight:800">${esc(wt.name)}</span>${(!state.filterMine || isJobSharedWithMe(j))?' · '+esc(j.technician_name||profName(j.technician_id)):''}${jobSharedChipHtml(j)}${proposalChipHtml(j)}</div>
        ${codesLineHtml(cx)}
      </div>
      <div class="right">
        <span class="badge-status st-${j.status}">${jobIssues(j).length ? warnIcon() : ''}${t('status_'+j.status)}</span>
        <div class="money" style="margin-top:6px">${money(total)}</div>
      </div>
    </div>`;
  }).join('');

  const empty = (!jobs.length && !pkGroups.length && !pkDone.length)
    ? `<div class="list-empty"><div class="big">${ic('owl')}</div>${t('no_items')}<br><span class="tiny">${t('tap_add')}</span></div>` : '';

  const dayBar = `
    <div class="day-bar">
      <b>${fmtDMY(iso)}</b>
      <button class="mini-nav" onclick="App.openDayMap()">${ic('map')} ${t('map_of_day')}</button>
    </div>`;
  return a2hs + banner + viewWeek() + dayBar
    + `<div id="day-top" style="${q?'display:none':''}">` + homeStatsHtml() + `</div>`
    + filter
    + `<div id="search-area" style="${q?'':'display:none'}">${q ? searchAreaHtml() : ''}</div>`
    + `<div id="day-list" style="${q?'display:none':''}">`
    + (pkGroups.length ? `<div class="section-title">${t('pickups_today')} <span class="hint">${fmtDM(iso)}</span></div>` + pkHtml : '')
    + (jobs.length ? `<div class="section-title">${t('jobs')}</div>` + jobsHtml : '')
    + pkDoneHtml + empty
    + `<button class="btn btn-green" style="margin-top:12px" onclick="App.addTaskModal()">＋ ${t('add_task')}</button>
       <button class="fab" onclick="App.addTaskModal()" aria-label="${t('add_task')}">＋</button>`
    + `</div>`;
}

/* =====================================================================
   v1.07.13: ПОИСК НА ГЛАВНОЙ — инвойсы и пикапы по любой дате
   ===================================================================== */
function searchJobs(q){
  return visibleJobs().filter(j => {
    const cx = cxById(j.complex_id) || {};
    const cp = cpById(j.counterparty_id) || {};
    const wt = wtById(j.work_type_id) || {};
    const hay = [j.unit_number, cx.name, cx.abbr, cx.address, cp.name, wt.name,
      j.technician_name, profName(j.technician_id), j.note, j.date, fmtDMY(j.date)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a,b) => String(b.date).localeCompare(String(a.date))
      || String(b.created_at||'').localeCompare(String(a.created_at||'')));
}
function searchPks(q){
  return visiblePlacements().filter(p => !p.superseded).filter(p => {
    const cx = cxById(p.complex_id) || {};
    const cp = cpById(p.counterparty_id) || {};
    const et = state.data.equipment_types.find(e => e.id === p.equipment_type_id) || {};
    const hay = [p.unit_number, cx.name, cx.abbr, cx.address, cp.name, et.name, et.abbr,
      profName(p.technician_id), p.due_date, fmtDMY(p.due_date)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a,b) => (pkPending(a)?0:1) - (pkPending(b)?0:1)
      || String(a.due_date).localeCompare(String(b.due_date)));
}
function searchJobCard(j){
  const cx = cxById(j.complex_id) || { name: '?' };
  const wt = wtById(j.work_type_id) || { name: '', color: '#8B9AA3' };
  return `<div class="item clicky" style="border-left-color:${wt.color}" onclick="App.openJob('${j.id}')">
    <div class="info">
      <div class="t">${esc(cx.name)} · Unit ${esc(j.unit_number || '—')} <span class="badge-status st-${j.status}">${t('status_' + j.status)}</span></div>
      <div class="s">${fmtDMY(j.date)} · <span style="color:${wt.color};font-weight:800">${esc(wt.name)}</span> · ${money(jobGrand(j))} · ${esc(j.technician_name || profName(j.technician_id))}${jobSharedChipHtml(j)}${proposalChipHtml(j)}</div>
    </div>
  </div>`;
}
function searchPkCard(p){
  const cx = cxById(p.complex_id) || { name: '?' };
  const et = state.data.equipment_types.find(e => e.id === p.equipment_type_id) || { abbr: '?', color: '#8B9AA3', name: '?' };
  const st = p.picked_up
    ? `<span class="chip ok">✓ ${t('picked')}</span>`
    : `<span class="chip warn">${t('hist_pending')}</span>${p.due_date < todayISO() ? ` <span class="chip bad">${t('overdue')}</span>` : ''}`;
  return `<div class="item clicky" style="border-left-color:${et.color}" onclick="App.searchOpenPk('${p.id}')">
    <div class="info">
      <div class="t" style="display:flex;align-items:center;gap:8px"><span class="icon-circle" style="background:${et.color};color:${textColorFor(et.color)}">${esc(et.abbr)}</span>${esc(et.name)} × ${+p.qty || 1}${p.ext_of ? ` <span class="chip info">${t('ext_chip')}</span>` : ''}</div>
      <div class="s">${esc(cx.name)} · Unit ${esc(p.unit_number || '—')} · ${t('due')}: ${fmtDMY(p.due_date)} ${st}</div>
    </div>
  </div>`;
}
function searchAreaHtml(){
  const q = (state.searchQ || '').trim().toLowerCase();
  if (!q) return '';
  const jobs = searchJobs(q);
  const pks = searchPks(q);
  const kind = state.searchKind === 'pk' ? 'pk' : 'jobs';
  const LIM = 50;
  const list = kind === 'jobs' ? jobs : pks;
  const shown = list.slice(0, LIM);
  const cards = kind === 'jobs' ? shown.map(searchJobCard).join('') : shown.map(searchPkCard).join('');
  return `
    <div class="lang-seg" style="margin-bottom:10px">
      <button class="${kind==='jobs'?'on':''}" onclick="App.searchKindSet('jobs')">${ic('receipt')} ${t('search_jobs')} (${jobs.length})</button>
      <button class="${kind==='pk'?'on':''}" onclick="App.searchKindSet('pk')">${ic('box')} ${t('search_pk')} (${pks.length})</button>
    </div>
    ${shown.length ? cards : `<div class="list-empty"><div class="big">${ic('search')}</div>${t('search_empty')}</div>`}
    ${list.length > LIM ? `<div class="tiny" style="margin-top:8px">${t('search_more')} ${LIM} / ${list.length}</div>` : ''}`;
}
function searchInput(v){
  state.searchQ = v;
  const q = (v || '').trim();
  const sa = $('#search-area'), top = $('#day-top'), lst = $('#day-list'), xb = $('#search-clear');
  if (xb) xb.style.display = q ? '' : 'none';
  if (!sa || !top || !lst) return;
  if (q){
    sa.style.display = ''; top.style.display = 'none'; lst.style.display = 'none';
    sa.innerHTML = searchAreaHtml();
  } else {
    sa.style.display = 'none'; sa.innerHTML = '';
    top.style.display = ''; lst.style.display = '';
  }
}
function searchKindSet(v){
  state.searchKind = v;
  const sa = $('#search-area'); if (sa) sa.innerHTML = searchAreaHtml();
}
function searchClear(){
  state.searchQ = '';
  const inp = $('#home-search');
  if (inp) inp.value = '';
  searchInput('');
  if (inp) inp.focus();
}
function searchOpenPk(pid){
  const p = state.data.placements.find(x => x.id === pid); if (!p) return;
  if (pkPending(p)){
    const today = todayISO();
    pickupModal(p.job_id, p.due_date < today ? today : p.due_date);
  } else jobHistory(p.job_id);
}
/* v1.07.13: клики по шапке */
function logoHome(){ state.searchQ = ''; App.go('home'); }
async function checkVerClick(){
  toast('🔄 ' + t('upd_checking'), 'inf');
  const okNet = await checkForUpdate('клик по названию', true);
  if (state.updAvail) toast('⬆ ' + t('upd_found') + ': v' + state.updAvail);
  else if (okNet) toast('✓ ' + t('upd_latest') + ' · v' + APP_VERSION);
  else toast('⚠ ' + t('upd_fail'), 'err');
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
function modalHead(title, iconName){ return `<h3><button class="back-x" onclick="App.closeModal()">←</button> ${iconName?ic(iconName)+' ':''}${esc(title)}</h3>`; }

/* ---------- Добавить задание ---------- */
function addTaskModal(){
  const wts = [...state.data.work_types].filter(w => !/proposal/i.test(w.name)).sort((a,b)=>(a.sort||0)-(b.sort||0));
  openModal(`
    ${modalHead(t('add_task'))}
    <div class="form-row"><span class="lbl">${t('date')}</span>
      <input type="date" id="nt-date" value="${state.selDate}"></div>
    <div class="form-row"><span class="lbl">${t('counterparty')}</span>
      <div class="combo" id="cb-cp">
        <input class="combo-in" placeholder="${t('select')}" autocomplete="off"
          oninput="App.comboFilter('cp', this.value)" onfocus="App.comboFilter('cp', this.value)">
        <input type="hidden" id="nt-cp"><div class="combo-list" id="cb-cp-list"></div>
      </div></div>
    <div class="form-row"><span class="lbl">${t('complex')}</span>
      <div class="combo" id="cb-cx">
        <input class="combo-in" placeholder="${t('select')}" autocomplete="off"
          oninput="App.comboFilter('cx', this.value)" onfocus="App.comboFilter('cx', this.value)">
        <input type="hidden" id="nt-cx"><div class="combo-list" id="cb-cx-list"></div>
      </div></div>
    <div class="form-row"><span class="lbl">${t('unit')}</span>
      <input id="nt-unit" inputmode="numeric" placeholder="916"></div>
    <label class="opt" style="margin:2px 0 8px"><input type="checkbox" id="nt-prop"> ${t('proposal_chk')}</label>
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
/* v1.07.26: комбо с поиском по буквам для контрагента и комплекса */
function comboItems(kind){
  if (kind === 'cp') return state.data.counterparties.map(c => ({ id: c.id, label: c.name }));
  const cpId = $('#nt-cp') ? $('#nt-cp').value : '';
  return state.data.complexes.filter(c => !cpId || c.counterparty_id === cpId)
    .map(c => ({ id: c.id, label: c.name + (c.abbr ? ` (${c.abbr})` : '') }));
}
function comboFilter(kind, q){
  const list = $('#cb-' + kind + '-list'); if (!list) return;
  const v = String(q || '').toLowerCase();
  const items = comboItems(kind).filter(it => it.label.toLowerCase().includes(v)).slice(0, 30);
  list.innerHTML = items.map(it =>
    `<div class="combo-opt" onclick="App.comboPick('${kind}','${it.id}')">${esc(it.label)}</div>`).join('')
    || `<div class="combo-opt dim">—</div>`;
  list.style.display = 'block';
}
function comboPick(kind, id){
  const it = comboItems(kind).find(x => x.id === id); if (!it) return;
  $('#nt-' + kind).value = id;
  const box = $('#cb-' + kind);
  box.querySelector('.combo-in').value = it.label;
  box.querySelector('.combo-list').style.display = 'none';
  if (kind === 'cp'){
    /* v1.07.35: комплекс сбрасываем ТОЛЬКО если он чужой для выбранного
       контрагента — свой остаётся на месте */
    const cxId = ($('#nt-cx') || {}).value;
    const cx = cxId && state.data.complexes.find(c => c.id === cxId);
    if (cx && cx.counterparty_id !== id){
      $('#nt-cx').value = '';
      const cbx = $('#cb-cx'); if (cbx) cbx.querySelector('.combo-in').value = '';
    }
  } else if (kind === 'cx'){
    /* выбор комплекса автоматически подставляет его контрагента */
    const cx = state.data.complexes.find(c => c.id === id);
    if (cx && cx.counterparty_id){
      const cp = state.data.counterparties.find(c => c.id === cx.counterparty_id);
      const hid = $('#nt-cp'); if (hid) hid.value = cx.counterparty_id;
      const cbp = $('#cb-cp');
      if (cbp && cp) cbp.querySelector('.combo-in').value = cp.name;
    }
  }
}
document.addEventListener('click', e => {
  if (!e.target.closest('.combo'))
    document.querySelectorAll('.combo-list').forEach(l => l.style.display = 'none');
});
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
    has_proposal: !!($('#nt-prop') && $('#nt-prop').checked),
    work_type_id: ntWt, technician_id: state.user.id, technician_name: shortName(state.user.display_name), helper_ids: [], shared_with_helpers: false, priority: false, sort_order: jobsOn(date).length,
    status: 'draft', note: '', form_data: emptyFormData(), total: 0,
    approved_total: null, approved_by: null, approved_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  await dbUpsert('jobs', job);
  audit('job_create', 'job', job.id, { unit: job.unit_number, date: job.date,
    complex: (cxById(cxId) || {}).abbr || '', work: (wtById(ntWt) || {}).name || '' });
  ntWt = null; closeModal();
  state.selDate = date; state.weekStart = mondayOf(date);
  toast('✓ ' + t('created'));
  App.openJob(job.id);
}

/* ---------- Пикап: забрать группу ---------- */
async function pickupGroup(jobId){
  if (!confirm(t('pickup_confirm'))) return;
  const now = new Date().toISOString();
  const list = state.data.placements.filter(p => p.job_id === jobId && pkPending(p))
    .filter(p => canTouchPk(p));
  for (const p of list){
    const upd = { ...p, picked_up: true, picked_up_at: now, picked_up_by: state.user.id };
    await dbUpsert('placements', upd);
  }
  navigator.vibrate?.([30,40,30]);
  if (list.length) audit('pickup_done', 'job', jobId, {                   // v1.07.18
    unit: list[0].unit_number,
    items: list.map(p => ({ eq: (etById(p.equipment_type_id) || {}).abbr || '?', qty: +p.qty || 1 })) });
  closeModal();
  toast('✓ ' + t('picked')); render();
}

/* =====================================================================
   v1.07.12: МОДАЛКА ПИКАПА · ПРОДЛЕНИЕ АРЕНДЫ · ИСТОРИЯ РАБОТЫ
   ===================================================================== */
/* Ожидающие строки пикапа этой работы на выбранный день (для «сегодня» — с просрочкой) */
function pkRowsFor(jobId, dateISO){
  const today = todayISO();
  return state.data.placements
    .filter(p => p.job_id === jobId && pkPending(p) && (p.due_date === dateISO || (dateISO === today && p.due_date < today)))
    .filter(p => canTouchPk(p));
}
function pkLineHtml(p, withDue){
  const et = state.data.equipment_types.find(e => e.id === p.equipment_type_id) || { abbr:'?', color:'#8B9AA3', name:'?' };
  const od = pkPending(p) && p.due_date < todayISO();
  return `<div class="qty-line pk-line">
    <span class="icon-circle" style="background:${et.color};color:${textColorFor(et.color)}">${esc(et.abbr)}</span>
    <span class="name">${esc(et.name)}${p.ext_of ? ` <span class="chip info">${t('ext_chip')}</span>` : ''}</span>
    <b>× ${+p.qty || 1}</b>
    ${withDue ? `<span class="tiny">${t('due')}: ${fmtDMY(p.due_date)}${od ? ` <span class="chip bad">${t('overdue')}</span>` : ''}</span>` : ''}
  </div>`;
}

function pickupModal(jobId, dateISO, ev){
  // клик по кнопкам внутри карточки не должен открывать модалку
  if (ev && ev.target && ev.target.closest && ev.target.closest('button,select,input,a')) return;
  const rows = pkRowsFor(jobId, dateISO);
  if (!rows.length) return;
  const p0 = rows[0];
  const cx = cxById(p0.complex_id) || { name:'?', address:'', abbr:'' };
  const cp = cpById(p0.counterparty_id) || { name:'' };
  openModal(`
    ${modalHead(t('pickup').toUpperCase() + ' · Unit ' + (p0.unit_number || '—'), 'box')}
    <div class="tiny" style="margin:-4px 0 8px">${esc(cx.name)}${cp.name ? ' · ' + esc(cp.name) : ''}<br>${esc(cx.address||'')}
      ${(cx.lat != null || cx.address) ? `<button class="mini-nav" onclick="App.navToCx('${p0.complex_id}')">${ic('compass')} ${t('navigate')}</button>` : ''}</div>
    ${(cx.access_code || cx.callbox_code) ? `<div class="tiny" style="margin-bottom:8px">${codeLineHtml(cx, true)}</div>` : ''}
    <div style="font-weight:900;margin-bottom:6px">${ic('toolbox')} ${t('what_where')}</div>
    <div class="card" style="padding:8px 10px;margin-bottom:10px">${rows.map(p => pkLineHtml(p, true)).join('')}</div>
    ${mediaStripHtml(jobId)}
    <button class="btn btn-blue" onclick="App.extendModal('${jobId}','${dateISO}')">${ic('calendar')} ${t('extend_rent')}</button>
    <button class="btn btn-green" onclick="App.pickupGroup('${jobId}','${dateISO}')">${ic('chk_on')} ${t('pick_all_btn')}</button>
    <div class="btn-row3" style="grid-template-columns:1fr 1fr">
      <button class="btn btn-ghost" onclick="App.closeModal();App.openJob('${jobId}')">${ic('receipt')} ${t('open_invoice')}</button>
      <button class="btn btn-ghost" onclick="App.jobHistory('${jobId}')">${ic('clock')} ${t('job_history')}</button>
    </div>
  `);
}

/* ---------- Продление аренды ---------- */
let extDraft = null;
function extendModal(jobId, dateISO){
  const rows = pkRowsFor(jobId, dateISO);
  if (!rows.length){ toast(t('ext_nothing'), 'err'); return; }
  const sel = {}; rows.forEach(p => sel[p.id] = +p.qty || 1);
  extDraft = { jobId, dateISO, mode: 'all', daysN: 1, rows, sel };
  renderExtendModal();
}
/* Просроченные продлеваем от выбранного дня, остальные — от их срока */
function extBaseDue(p){ return p.due_date > extDraft.dateISO ? p.due_date : extDraft.dateISO; }
function renderExtendModal(){
  const d = extDraft; if (!d) return;
  const total = d.rows.reduce((s, p) => s + (d.mode === 'all' ? (+p.qty || 1) : (d.sel[p.id] || 0)), 0);
  const lines = d.rows.map(p => {
    const et = state.data.equipment_types.find(e => e.id === p.equipment_type_id) || { abbr:'?', color:'#8B9AA3', name:'?' };
    const q = d.mode === 'all' ? (+p.qty || 1) : (d.sel[p.id] || 0);
    return `<div class="qty-line pk-line">
      <span class="icon-circle" style="background:${et.color};color:${textColorFor(et.color)}">${esc(et.abbr)}</span>
      <span class="name">${esc(et.name)}${p.ext_of ? ` <span class="chip info">${t('ext_chip')}</span>` : ''}<span class="tiny"> · ${t('due')}: ${fmtDMY(p.due_date)}</span></span>
      ${d.mode === 'all'
        ? `<b>× ${+p.qty || 1}</b>`
        : `<span class="stepper"><button type="button" onclick="App.extQty('${p.id}',-1)">−</button><span class="val">${q}</span><button type="button" onclick="App.extQty('${p.id}',1)">＋</button></span><span class="tiny">/ ${+p.qty || 1}</span>`}
    </div>`;
  }).join('');
  const newDue = addDaysISO(extBaseDue(d.rows[0]), d.daysN);
  openModal(`
    ${modalHead(t('extend_title'), 'calendar')}
    <div class="lang-seg" style="margin-bottom:10px">
      <button class="${d.mode==='all'?'on':''}" onclick="App.extMode('all')">${t('ext_all')}</button>
      <button class="${d.mode==='sel'?'on':''}" onclick="App.extMode('sel')">${t('ext_partial')}</button>
    </div>
    <div class="tiny" style="margin-bottom:6px">${t('ext_rules_hint').replace('{N}', maxExtendDays())}</div>
    ${d.mode==='sel' ? `<div class="tiny" style="margin-bottom:6px">${t('ext_qty_hint')}</div>` : ''}
    <div class="card" style="padding:8px 10px">${lines}</div>
    <div class="qty-line" style="margin:10px 0">
      <span class="name">${t('ext_days_lbl')}</span>
      <span class="stepper"><button type="button" onclick="App.extDays(-1)">−</button><span class="val">${d.daysN}</span><button type="button" onclick="App.extDays(1)">＋</button></span>
      <span class="tiny">${t('days')} · ${t('ext_max_note').replace('{N}', maxExtendDays())}</span>
    </div>
    ${pendingExtReqHtml(d.jobId)}
    <button class="btn btn-ghost sm" style="margin-bottom:8px" onclick="App.extReqCreate()">⏳ ${t('ext_req_btn')}</button>
    <div class="note-green" style="display:block">${t('ext_summary')}: <b>${total} ${t('units_short')}</b> · +${d.daysN} ${t('days')} · ${t('ext_new_due')}: <b>${fmtDMY(newDue)}</b></div>
    <div class="tiny" style="margin:6px 0 10px">${t('ext_invoice_note')}</div>
    <button class="btn btn-blue" onclick="App.extApply()" ${total > 0 ? '' : 'disabled'}>${ic('chk_on')} ${t('extend_rent')}</button>
    <button class="btn btn-ghost" onclick="App.pickupModal('${d.jobId}','${d.dateISO}')">← ${t('back')}</button>
  `);
}
function extMode(v){ if (extDraft){ extDraft.mode = v; renderExtendModal(); } }
function extDays(dv){ if (extDraft){ extDraft.daysN = Math.min(maxExtendDays(), Math.max(1, extDraft.daysN + dv)); renderExtendModal(); } }
function extQty(pid, dv){
  if (!extDraft) return;
  const p = extDraft.rows.find(x => x.id === pid); if (!p) return;
  extDraft.sel[pid] = Math.min(+p.qty || 1, Math.max(0, (extDraft.sel[pid] || 0) + dv));
  renderExtendModal();
}
async function extApply(){
  const d = extDraft; if (!d) return;
  const N = d.daysN; let made = 0;
  for (const p of d.rows){
    const q = d.mode === 'all' ? (+p.qty || 1) : Math.min(+p.qty || 1, d.sel[p.id] || 0);
    if (q <= 0) continue;
    const base = extBaseDue(p);
    // «второй пикап»: новое размещение-продление, привязанное к исходному через ext_of
    const ext = { ...p, id: uid(), qty: q, days: N, placed_date: base, due_date: addDaysISO(base, N),
      picked_up: false, picked_up_at: null, picked_up_by: null,
      ext_of: p.id, superseded: false, superseded_at: null };
    await dbUpsert('placements', ext);
    if (q >= (+p.qty || 1)){
      // продлили всё количество — исходный пикап закрыт продлением (остаётся в истории)
      await dbUpsert('placements', { ...p, superseded: true, superseded_at: new Date().toISOString() });
    } else {
      // продлили часть — остаток забрать в исходный срок
      await dbUpsert('placements', { ...p, qty: (+p.qty || 1) - q });
    }
    made += q;
  }
  if (made > 0 && d.rows[0]) audit('extension_create', 'job', d.rows[0].job_id, {     // v1.07.18
    unit: d.rows[0].unit_number, days: N, qty: made });
  extDraft = null; closeModal();
  navigator.vibrate?.(30);
  toast('✓ ' + t('ext_done'));
  render();
}

/* ---------- История работы: инвойс → пикапы → продления ---------- */
function jobHistory(jobId){
  const id = jobId || state.jobId || (jobDraft && jobDraft.id);
  const j = state.data.jobs.find(x => x.id === id); if (!j) return;
  const wt = wtById(j.work_type_id) || { name:'', color:'#8B9AA3' };
  const cx = cxById(j.complex_id) || { name:'—' };
  const fmtTs = (ts) => ts ? String(ts).slice(0,16).replace('T',' ') : '—';
  const pls = state.data.placements.filter(p => p.job_id === j.id)
    .sort((a,b) => (a.ext_of?1:0) - (b.ext_of?1:0)
      || String(a.placed_date||'').localeCompare(String(b.placed_date||''))
      || String(a.due_date||'').localeCompare(String(b.due_date||'')));
  const plHtml = pls.map(p => {
    const stateHtml = p.picked_up
      ? `<span class="chip ok">✓ ${t('hist_picked_at')}: ${fmtTs(p.picked_up_at)}</span>`
      : p.superseded
        ? `<span class="chip info">${t('hist_superseded')}</span>`
        : `<span class="chip warn">${t('hist_pending')}</span>${p.due_date < todayISO() ? ` <span class="chip bad">${t('overdue')}</span>` : ''}`;
    return `<div class="hist-item ${p.ext_of ? 'hist-ext' : ''}">
      <div class="hist-t">${p.ext_of ? ic('calendar') + ' ' + t('hist_ext') + ` <b>+${+p.days||1} ${t('days')}</b>` : ic('box') + ' ' + t('hist_pickup')}</div>
      ${pkLineHtml(p, false)}
      <div class="tiny">${t('hist_placed')}: ${fmtDMY(p.placed_date)} · ${t('hist_due_lbl')}: <b>${fmtDMY(p.due_date)}</b></div>
      <div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">${stateHtml}
        ${(pkPending(p) && canTouchPk(p)) ? `<button class="btn btn-green sm" onclick="App.pickupOne('${p.id}','${j.id}')">${t('pick_now')}</button>` : ''}
        ${(p.picked_up && canTouchPk(p)) ? `<button class="btn btn-ghost sm" onclick="App.restorePk('${p.id}','${j.id}')">↩ ${t('restore_pk')}</button>` : ''}
      </div>
    </div>`;
  }).join('');
  openModal(`
    ${modalHead(t('job_history'), 'clock')}
    <div class="hist-item">
      <div class="hist-t">${ic('receipt')} ${t('hist_invoice')} · <span style="color:${wt.color}">${esc(wt.name)}</span></div>
      <div class="tiny">${esc(cx.name)} · Unit ${esc(j.unit_number || '—')}</div>
      <div class="tiny">${t('hist_created')}: ${fmtTs(j.created_at)} · ${t('hist_workdate')}: <b>${fmtDMY(j.date)}</b></div>
      <div style="margin-top:4px"><span class="badge-status st-${j.status}">${t('status_' + j.status)}</span>${proposalChipHtml(j)}${j.status === 'approved' && j.approved_at ? ` <span class="tiny">✓ ${esc(profName(j.approved_by))} · ${fmtTs(j.approved_at)}</span>` : ''}</div>
      <button class="btn btn-ghost sm" style="margin-top:6px" onclick="App.closeModal();App.openJob('${j.id}')">${ic('receipt')} ${t('open_invoice')}</button>
    </div>
    ${pls.length ? plHtml : `<div class="tiny" style="margin-top:8px">${t('hist_none')}</div>`}
    <button class="btn btn-ghost" style="margin-top:10px" onclick="App.closeModal()">${t('close')}</button>
  `);
}
/* «Забрать сейчас» из истории: досрочный вывоз = аннулирование пикапа/продления */
async function pickupOne(pid, jobId){
  const p = state.data.placements.find(x => x.id === pid); if (!p) return;
  if (!confirm(t('pickup_confirm'))) return;
  await dbUpsert('placements', { ...p, picked_up: true, picked_up_at: new Date().toISOString(), picked_up_by: state.user.id });
  audit(p.due_date > todayISO() ? 'pickup_early' : 'pickup_done', 'placement', pid, {   // v1.07.18
    unit: p.unit_number, eq: (etById(p.equipment_type_id) || {}).abbr || '?', qty: +p.qty || 1 });
  navigator.vibrate?.(30);
  toast('✓ ' + t('picked'));
  render();
  jobHistory(jobId || p.job_id);
}
/* v1.07.26: восстановление вывезенного пикапа/продления — снова «в аренде» */
async function restorePk(pid, jobId){
  const p = state.data.placements.find(x => x.id === pid); if (!p || !p.picked_up) return;
  if (!confirm(t('restore_pk') + '?')) return;
  await dbUpsert('placements', { ...p, picked_up: false, picked_up_at: null, picked_up_by: null });
  audit('pickup_restore', 'placement', pid, { unit: p.unit_number,
    eq: (etById(p.equipment_type_id) || {}).abbr || '?', qty: +p.qty || 1 });
  navigator.vibrate?.(20);
  toast('↩ ' + t('restored'));
  render();
  jobHistory(jobId || p.job_id);
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
      <div class="note-green" style="text-align:left;margin-bottom:12px">${ic('flask')} ${t('demo_note')}</div>
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
      <button class="btn btn-ghost" style="margin-top:14px" onclick="App.diag()">${ic('steth')} ${t('diag')}</button>
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
    <button class="btn btn-ghost" style="margin-top:14px" onclick="App.diag()">${ic('steth')} ${t('diag')}</button>
    <button id="pwa-install-btn" class="btn btn-blue" style="${pwaPrompt?'':'display:none'};margin-top:8px" onclick="App.installPwa()">${ic('download')} ${t('install_app')}</button>
  </div>`;
}

/* =====================================================================
   ЭКРАН: ФОРМА РАБОТЫ (цифровой инвойс)
   ===================================================================== */
let jobDraft = null; // рабочая копия

function openJob(id){
  const j = state.data.jobs.find(x=>x.id===id);
  if (!j) return;
  if (!isManager() && j.technician_id !== state.user.id && !isJobSharedWithMe(j)){ toast(t('no_access'), 'err'); return; }
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
  jobDraft.shared_with_helpers = !!jobDraft.shared_with_helpers;   // v1.07.10
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
  // v1.07.10: коворкер с общим доступом правит содержимое работы, но не состав бригады и не саму галочку доступа
  const crewEditable = isManager() || j.technician_id === state.user.id;
  const auxList = (wt.needs_aux && (wt.aux_ids||[]).length)
    ? (wt.aux_ids||[]).map(id => state.data.aux_equipment.find(a=>a.id===id)).filter(Boolean) : [];
  const auxTake = fd.aux_take || {};
  /* Доп. оборудование теперь опционально: не обязательное требование,
     а чек-лист — техник отмечает, что реально нужно взять на этот выезд */
  const aux = auxList.length ? `
    <div class="note-green" style="display:block">
      <div style="font-weight:900;margin-bottom:6px">${ic('toolbox')} ${t('aux_needed')} <span class="tiny" style="font-weight:400">· ${t('aux_take_hint')}</span></div>
      <div class="opt-grid">${auxList.map(a=>`
        <button type="button" class="opt ${auxTake[a.id]?'on':''}" data-aux="${a.id}"
          onclick="App.auxToggle('${a.id}')"><span class="aux-mk">${auxTake[a.id]?ic('chk_on'):ic('chk_off')}</span> ${esc(a.name)}</button>`).join('')}
      </div>
    </div>` : '';

  const amt = (v) => v > 0 ? `<span class="amt">${money(v)}</span>` : '<span class="amt" style="color:var(--dim-2)">—</span>';

  const eqRows = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0)).map(et => {
    const e = fd.equipment[et.id] || { qty:0, days: defRentDays() };
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
          ${(cx.lat!=null||cx.address)?`<button class="mini-nav" onclick="App.navToCx('${j.complex_id}')">${ic('compass')} ${t('navigate')}</button>`:''}</div>
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
      <div class="tiny" style="font-weight:900;margin-bottom:6px">${(j.technician_id||(j.helper_ids||[]).length)?'':warnIcon()}${ic('crew')} ${t('crew')}</div>
      <div class="crew-chips" id="crew-chips">${crewChipsHtml(j)}</div>
      ${crewEditable ? `
      <div class="crew-add">
        <select id="crew-sel" onchange="App.crewAdd(this.value)">
          <option value="">${t('add_helper')}</option>
          ${state.data.profiles.filter(p=>!p.blocked && p.id!==j.technician_id && !(j.helper_ids||[]).includes(p.id))
            .map(p=>`<option value="${p.id}">${esc(shortName(p.display_name))} (${t('role_'+p.role)})</option>`).join('')}
        </select>
        <button class="btn btn-ghost sm" onclick="App.crewAll()">${t('all_staff')}</button>
      </div>` : ''}
      ${sharedAccessBoxHtml(j)}
    </div>
    ${aux}
  </div>
  ${checklistCardHtml(j)}

  <div class="inv-sec"><div class="inv-head">${ic('steam')} Steam Clean ${helpBtn('steam')} ${amtWrap('steam',sec.steam)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('steam','deep_scrub','Deep Scrub')} ${chk('steam','rotovac','Rotovac')}
      <span class="qty-line"><span class="tiny">Rooms</span>${stepperHtml('steam-rooms', fd.steam.rooms||1)}</span>
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">${ic('sponge')} Removals ${helpBtn('removals')} ${amtWrap('removals',sec.removals)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('removals','red_stain','Red Stain')} ${chk('removals','wax','Wax')} ${chk('removals','rust','Rust')}
      ${chk('removals','ink','Ink')} ${chk('removals','gum','Gum')} ${chk('removals','paint','Paint Removal')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">${ic('wrench')} Repairs ${helpBtn('repairs')} ${amtWrap('repairs',sec.repairs)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('repairs','threshold','Threshold')} ${chk('repairs','stretch','Stretch')}
      ${chk('repairs','seam','Seam')} ${chk('repairs','patch','Patch')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">${ic('palette')} Dye ${helpBtn('dye')} ${amtWrap('dye',sec.dye)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('dye','spot','Spot Dye')} ${chk('dye','full','Full Dye')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">${ic('box')} Other ${helpBtn('other')} ${amtWrap('other',sec.other)}</div>
    <div class="inv-body">
      <div class="opt-grid">${chk('other','trash_out','Trash Out')} ${chk('other','pad_removal','Pad Removal')} ${chk('other','all_unit','All Unit')}</div>
      <div class="qty-line"><span class="tiny">Rooms</span>${stepperHtml('other-rooms', fd.other.rooms||1)}</div>
    </div></div>

  <div class="inv-sec"><div class="inv-head">${ic('fog')} Fog / GOC ${helpBtn('fog')} ${amtWrap('fog',sec.fog)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('fog','fog','Fog')} ${chk('fog','goc','GOC')} ${chk('fog','pet','Pet')}
      ${chk('fog','smoke','Smoke')} ${chk('fog','deodorizer','Deodorizer')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">${ic('flask')} Treatments ${helpBtn('treatments')} ${amtWrap('treatments',sec.treatments)}</div>
    <div class="inv-body"><div class="opt-grid">
      ${chk('treatments','sealant','Sealant')} ${chk('treatments','mold','Mold & Mildew')} ${chk('treatments','degreaser','Degreaser')}
    </div></div></div>

  <div class="inv-sec"><div class="inv-head">${ic('drop')} Wet Vac / Flood ${helpBtn('wetvac')} ${amtWrap('wetvac',sec.wetvac)}</div>
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

  <div class="inv-sec"><div class="inv-head">${ic('vent')} Air Duct / Dryer Vent ${helpBtn('airduct')} ${amtWrap('airduct',sec.airduct)}</div>
    <div class="inv-body">
      <div class="opt-grid">${chk('airduct','air_duct','Air Duct Cleaning')} ${chk('airduct','dryer_vent','Dryer Vent Cleaning')}</div>
      <div class="qty-line"><span class="tiny">Bedrooms</span>${stepperHtml('ad-bedrooms', fd.airduct.bedrooms||1)}
        <input id="jb-adnote" placeholder="note…" value="${esc(fd.airduct.note||'')}" style="flex:1"></div>
    </div></div>

  <div class="inv-sec"><div class="inv-head">${ic('fan')} Equipment Rental ${helpBtn('equipment')} ${amtWrap('equipment',sec.equipment)}</div>
    <div class="inv-body">
      <div class="tiny">${t('equipment')}</div>
      ${eqRows}
    </div></div>

  <div class="inv-sec"><div class="inv-head">${ic('layers')} Pad Installation ${helpBtn('pad')} ${amtWrap('pad',sec.pad)}</div>
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

  <div class="inv-sec"><div class="inv-head">${ic('pen')} Other services ${helpBtn('others')} ${amtWrap('others',sec.others)}</div>
    <div class="inv-body">
      ${fd.others.map((o,i)=>`
        <div class="qty-line">
          <input data-oth-d="${i}" placeholder="${t('desc')}…" value="${esc(o.desc)}" style="flex:1">
          <input data-oth-a="${i}" inputmode="decimal" placeholder="$" value="${o.amount||''}" class="price-input">
        </div>`).join('')}
    </div></div>

  <div class="inv-sec"><div class="inv-head">${ic('note')} ${t('note')} · ${t('extra_section')} ${helpBtn('note')} ${amtWrap('extra',sec.extra)}</div>
    <div class="inv-body">
      ${dictationHTML('jb-note', j.note || '')}
      <div class="tiny">${t('note_hint')}</div>
      <div id="extra-list">${(jobDraft.form_data.extra||[]).length ? extraListHtml() : ''}</div>
      <button class="btn btn-blue sm" onclick="App.extraPicker()">＋ ${t('template')}</button>
    </div></div>

  ${mediaStripHtml(j.id)}
  ${proposalBoxHtml(j)}
  <label class="opt ${j.status!=='draft'?'on':''}" style="margin:4px 0 8px">
    <input type="checkbox" id="jb-done" ${j.status!=='draft'?'checked':''}> ${t('job_done_chk')}
  </label>

  ${canApprove() ? `
  <div class="card" style="border-color:var(--purple)">
    <div style="font-weight:900;margin-bottom:6px">${ic('star')} ${t('approve')}</div>
    <div class="qty-line">
      <span class="name">${t('approved_total')}</span>
      <input id="jb-approved" class="price-input" inputmode="decimal" value="${j.approved_total ?? total}">
      <button class="btn btn-blue sm" onclick="App.approveJob()">${isApproved ? '↻' : '✓'} ${t('approve')}</button>
    </div>
    ${isApproved ? `<div class="tiny">✓ ${t('approved_by')}: ${esc(profName(j.approved_by))} · ${j.approved_at ? j.approved_at.slice(0,16).replace('T',' ') : ''}</div>` : ''}
    <div class="tiny">${t('approve_reset_note')}</div>
  </div>` : (isApproved ? `<div class="note-purple">✓ ${t('status_approved')}: ${esc(profName(j.approved_by))} — ${money(j.approved_total ?? total)}</div>` : '')}

  <button class="btn btn-ghost" style="margin-bottom:8px" onclick="App.jobHistory('${j.id}')">${ic('clock')} ${t('job_history')}</button>

  <div class="total-bar"><span>${t('total')}</span><span class="sum ${j.status==='approved'?'ok':'pend'}" id="jb-total">${money(total)}</span></div>

  ${editLocked(j) ? `<div class="banner b-red" style="margin-bottom:8px">🔒 ${t('lock_note').replace('{N}', editLockDays())}</div>` : ''}
  <button class="btn btn-green" onclick="App.saveJob()">${ic('save')} ${t('save')}</button>
  <div class="btn-rowpp">
    <button class="btn btn-ghost" onclick="App.pdfPreview()">${ic('search')} ${t('pdf_preview')}</button>
    <button class="btn btn-ghost" onclick="App.pdfPrint()">${ic('report')} ${t('pdf_print')}</button>
    <span></span>
  </div>
  <div class="btn-row3">
    <button class="btn btn-ghost" onclick="App.go('home')">← ${t('back')}</button>
    <button class="btn btn-blue" onclick="App.makePdf()">${ic('download')} ${t('pdf')}</button>
    ${(isAdmin() || j.technician_id===state.user.id)
      ? `<button class="btn btn-red" onclick="App.deleteJob()">${ic('trash')} ${t('delete')}</button>`
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
    else if (el.id === 'jb-shared'){ jobDraft.shared_with_helpers = el.checked; el.closest('.opt')?.classList.toggle('on', el.checked); }
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
      const cur = fd().equipment[etId] || { qty:0, days: defRentDays() };
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
  if (saveJob._busy) return;                               // v1.07.26: даблклик «Сохранить»
  const j = jobDraft;
  if (editLocked(j)){ toast('🔒 ' + t('lock_note').replace('{N}', editLockDays()), 'err'); return; }
  saveJob._busy = true;
  dictStop();
  const orig = state.data.jobs.find(x=>x.id===j.id);
  const prevStatus  = orig ? orig.status : 'draft';                       // v1.07.18: для журнала
  const prevHelpers = orig ? (orig.helper_ids || []).slice() : [];
  const p = priceResolver(j.counterparty_id);
  j.total = calcTotal(j.form_data, p);
  const doneChk = $('#jb-done');
  if (doneChk){
    if (orig.status === 'approved'){
      // апрув снимается при изменении итоговой стоимости не-админом
      if (!isAdmin() && j.total !== orig.total){
        j.status = 'done'; j.approved_total = null; j.approved_by = null; j.approved_at = null;
        toast(t('approve_reset_note'), 'inf');
        audit('approve_reset', 'job', j.id, { unit: j.unit_number, old_total: +orig.total, new_total: +j.total });
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
  { // v1.07.18: журнал — статус и бригада
    const cx = cxById(j.complex_id) || {};
    const base = { unit: j.unit_number, date: j.date, complex: cx.abbr || '', total: (j.status==='approved' && j.approved_total!=null) ? j.approved_total : j.total };
    let act = 'job_update';
    if (j.status === 'approved' && prevStatus !== 'approved') act = 'job_approve';
    else if (j.status === 'done' && prevStatus !== 'done') act = 'job_done';
    else if (j.status === 'draft' && prevStatus !== 'draft') act = 'job_reopen';
    audit(act, 'job', j.id, base);
    const nowH = j.helper_ids || [];
    const added   = nowH.filter(x => !prevHelpers.includes(x)).map(profName);
    const removed = prevHelpers.filter(x => !nowH.includes(x)).map(profName);
    if (added.length)   audit('crew_add', 'job', j.id, { unit: j.unit_number, added });
    if (removed.length) audit('crew_remove', 'job', j.id, { unit: j.unit_number, removed });
    if (orig && +j.total !== +orig.total)
      audit('price_change', 'job', j.id, { unit: j.unit_number, old: +orig.total, new: +j.total });
  }
  saveJob._busy = false;
  mediaFlush();
  toast('✓ ' + t('saved'));
  if (goHome !== false){ state.screen = 'home'; state.selDate = j.date; state.weekStart = mondayOf(j.date); }
  render();
  maybeApplyPendingUpdate();
}

/* Пикапы из секции Equipment Rental: qty>0 → размещение с due=дата+дни.
   v1.07.12: продления (ext_of) и строки, закрытые продлением или уже продлённые
   частично, живут своей жизнью — форма работы их не пересоздаёт и не удаляет. */
async function syncPlacementsForJob(j){
  const all = state.data.placements.filter(p => p.job_id === j.id);
  const originals = all.filter(p => !p.ext_of);
  const touchedByExt = (p) => p.superseded || all.some(x => x.ext_of === p.id);
  const want = Object.entries(j.form_data.equipment).filter(([,e]) => (+e.qty||0) > 0);
  for (const [etId, e] of want){
    const days = Math.max(1, +e.days || defRentDays());
    const found = originals.find(p => p.equipment_type_id === etId);
    if (found && touchedByExt(found)) continue;   // этим типом уже управляет история продлений
    const row = {
      ...(found || {}),
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
  for (const p of originals){
    if (touchedByExt(p)) continue;                // историю продлений не удаляем
    if (!want.find(([etId]) => etId === p.equipment_type_id)) await dbDelete('placements', p.id);
  }
}

async function approveJob(){
  const j = jobDraft;
  if (!canApprove()) return;
  const val = parseFloat($('#jb-approved').value);
  const calc = calcTotal(j.form_data, priceResolver(j.counterparty_id));
  const at = (isNaN(val) || val <= 0) ? calc : val;        // v1.07.26: 0/пусто = цену не менять
  if (isAdmin() || j.technician_id === state.user.id){
    j.approved_total = at; j.status = 'approved';
    j.approved_by = state.user.id; j.approved_at = new Date().toISOString();
    const chkEl = $('#jb-done'); if (chkEl) chkEl.checked = true;
    await saveJob(false);
  } else {
    // менеджер на чужой работе: RLS запись не даёт — только через RPC approve_job
    try{
      const { error } = await state.sb.rpc('approve_job', { p_job: j.id, p_total: at });
      if (error) throw error;
      Object.assign(j, { approved_total: at, status: 'approved',
        approved_by: state.user.id, approved_at: new Date().toISOString() });
      const row = state.data.jobs.find(x => x.id === j.id); if (row) Object.assign(row, j);
      toast('✓ ' + t('saved')); render();
    }catch(e){ toast('⛔ ' + rpcFail(e, 'approve_job'), 'err'); }
  }
}

async function deleteJob(){
  if (editLocked(jobDraft)){ toast('🔒 ' + t('lock_note').replace('{N}', editLockDays()), 'err'); return; }
  if (!confirm(t('confirm_del'))) return;
  localStorage.removeItem('techlog_draft');
  const id = jobDraft.id;
  const _dj = state.data.jobs.find(x=>x.id===id) || jobDraft;             // v1.07.18: для журнала
  for (const p of state.data.placements.filter(p=>p.job_id===id)) await dbDelete('placements', p.id);
  await dbDelete('jobs', id);
  audit('job_delete', 'job', id, { unit: _dj.unit_number, date: _dj.date,
    complex: (cxById(_dj.complex_id) || {}).abbr || '' });
  state.screen = 'home'; toast('🗑 ' + t('deleted')); render();
}

/* =====================================================================
   ЭКРАН: ОТЧЁТ ПО ПИКАПАМ (менеджер/админ)
   ===================================================================== */
function reportRows(dateISO){
  const today = todayISO();
  const rows = scopeFilter(state.data.placements, 'technician_id').filter(p => pkPending(p) && (p.due_date === dateISO || (dateISO >= today && p.due_date < today)));
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
        <button class="btn btn-ghost sm" onclick="App.navToCx('${cxId}')">${ic('compass')}</button>
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
    const lbl = n===0 ? t('today') : n===1 ? t('tomorrow') : fmtUS(iso).replace(/\./g,'/');
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
  ${blocks || `<div class="list-empty"><div class="big">${ic('inbox')}</div>${t('nothing_due')}</div>`}
  ${cnt ? `<div class="card"><div style="font-weight:900;margin-bottom:6px">Σ ${t('stats_due')}: ${cnt}</div><div class="color-dots" style="gap:6px">${totals}</div></div>
  <button class="btn btn-blue" onclick="App.copyReport()">${ic('clipboard')} ${t('copy_report')}</button>` : ''}`;
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
    ['price', t('d_price'), true],
    ['stock', t('d_stock'), isAdmin() || stockVisibleAll()],
    ['staff', t('d_staff'), isAdmin()],
    ['counterparties', t('d_counterparties'), isAdmin()],
    ['complexes', t('d_complexes'), true],
    ['worktypes', t('d_worktypes'), isAdmin()],
    ['equipment', t('d_equipment'), isAdmin()],
    ['aux', t('d_aux'), isAdmin()],
    ['extraworks', t('d_extraworks'), isAdmin()],
    ['sizes', t('d_sizes'), isAdmin()],
    ['products', t('d_products'), isAdmin()],
  ].filter(x=>x[2]);
  if (!tabs.find(x=>x[0]===state.dirTab)) state.dirTab = tabs[0][0];
  const nav = `<div class="tabs-nav">
    <button class="tabs-arr" onclick="App.dirTabsScroll(-1)" aria-label="◀">‹</button>
    <div class="tabs" id="dir-tabs">` + tabs.map(([id,l]) =>
    `<button class="tabbtn ${state.dirTab===id?'active':''}" onclick="App.dirTab('${id}')">${l}</button>`).join('') + `</div>
    <button class="tabs-arr" onclick="App.dirTabsScroll(1)" aria-label="▶">›</button>
  </div>`;
  const body = { stock: dirStock, staff: dirStaff, counterparties: dirCounterparties, complexes: dirComplexes, worktypes: dirWorkTypes,
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
          <button class="btn btn-ghost sm" title="${t('history')}" onclick="App.codeHistory('${cx.id}')">${ic('book')}</button>
          ${canEdit
            ? `<button class="btn btn-ghost sm" onclick="App.editCxModal('${cx.id}')">${t('edit')}</button>`
            : `<button class="btn btn-ghost sm" title="${t('propose_code')}" onclick="App.proposeCode('${cx.id}')">${ic('key')}</button>`}
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
        ${w.needs_aux?`<div class="tiny">${ic('toolbox')} ${(w.aux_ids||[]).map(id=>esc((state.data.aux_equipment.find(a=>a.id===id)||{}).name||'')).join(' · ')}</div>`:''}</div>
      <button class="btn btn-ghost sm" title="${t('cl_title')}" onclick="App.wtChecklistModal('${w.id}')">📋${(w.checklist&&w.checklist.length)?' '+w.checklist.length:''}</button>
      <button class="btn btn-ghost sm" onclick="App.editWtModal('${w.id}')">${t('edit')}</button>
    </div>`).join('') + `</div>
    <button class="btn btn-green" onclick="App.editWtModal()">＋ ${t('add')}</button>`;
}
/* v1.07.26: чек-лист вида работ — редактор (админ) */
function wtChecklistModal(wtId){
  const w = wtById(wtId); if (!w) return;
  openModal(`
    ${modalHead(t('cl_title') + ' — ' + esc(w.name), 'toolbox')}
    <div class="tiny" style="margin-bottom:6px">${t('cl_edit_hint')}</div>
    <textarea id="wt-cl" rows="10" style="width:100%" ${isAdmin()?'':'readonly'}>${esc((w.checklist||[]).join('\n'))}</textarea>
    ${isAdmin() ? `<button class="btn btn-green" style="margin-top:8px" onclick="App.wtChecklistSave('${w.id}')">${t('save')}</button>` : ''}
  `);
}
async function wtChecklistSave(wtId){
  const w = wtById(wtId); if (!w || !isAdmin()) return;
  const lines = String($('#wt-cl').value || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40);
  await dbUpsert('work_types', { ...w, checklist: lines });
  toast('✓ ' + t('saved')); closeModal(); render();
}
/* карточка чек-листа в форме работы; отметки живут в form_data.cl */
function checklistCardHtml(j){
  const wt = wtById(j.work_type_id);
  const cl = (wt && wt.checklist) || [];
  if (!cl.length) return '';
  const done = j.form_data.cl || {};
  const n = cl.filter((_, i) => done[i]).length;
  return `<div class="card" id="cl-card">
    <div style="font-weight:900;margin-bottom:6px">${ic('toolbox')} ${t('cl_title')}
      <span class="chip ${n===cl.length?'ok':'warn'}">${n}/${cl.length}</span></div>
    ${cl.map((s, i) => `<label class="opt ${done[i]?'on':''}" style="margin:3px 0">
      <input type="checkbox" ${done[i]?'checked':''} onchange="App.clToggle(${i}, this.checked)"> ${esc(s)}</label>`).join('')}
  </div>`;
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

/* v1.07.26: СКЛАД — остатки оборудования (правит админ, видят по галочке) */
function dirStock(){
  const canEdit = isAdmin();
  const list = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0));
  const stock = (etId) => (state.data.equipment_stock || []).find(s => s.equipment_type_id === etId)
    || { total: 0, broken: 0, in_repair: 0 };
  const inField = (etId) => state.data.placements
    .filter(p => p.equipment_type_id === etId && pkPending(p))
    .reduce((s, p) => s + (+p.qty || 0), 0);
  const cell = (et, key, val) => canEdit
    ? `<input class="car-inp" inputmode="numeric" value="${val}" onchange="App.stockSet('${et.id}','${key}',this.value)">`
    : `<b>${val}</b>`;
  return `<div class="card">` + list.map(et => {
    const s = stock(et.id), fld = inField(et.id);
    const avail = (+s.total||0) - (+s.broken||0) - (+s.in_repair||0) - fld;
    return `<div class="rowline" style="flex-wrap:wrap">
      <span class="icon-circle" style="background:${et.color};color:${textColorFor(et.color)}">${esc(et.abbr)}</span>
      <div class="grow"><b>${esc(et.name)}</b>
        <div class="tiny">${t('stock_field')}: <b>${fld}</b> · ${t('stock_avail')}: <b style="color:${avail<0?'var(--red)':'var(--green)'}">${avail}</b></div></div>
      <div class="stock-ctl">
        <span class="tiny">${t('stock_total')}</span>${cell(et,'total',+s.total||0)}
        <span class="tiny">${t('stock_broken')}</span>${cell(et,'broken',+s.broken||0)}
        <span class="tiny">${t('stock_repair')}</span>${cell(et,'in_repair',+s.in_repair||0)}
      </div>
    </div>`;
  }).join('') + `</div><div class="tiny" style="margin:6px 2px">${t('stock_hint')}</div>`;
}
async function stockSet(etId, key, v){
  if (!isAdmin()) return;
  const n = Math.max(0, parseInt(v, 10) || 0);
  const cur = (state.data.equipment_stock || []).find(s => s.equipment_type_id === etId);
  const row = { id: cur ? cur.id : uid(), equipment_type_id: etId,
    total: 0, broken: 0, in_repair: 0, ...(cur || {}), [key]: n };
  await dbUpsert('equipment_stock', row);
  audit('stock_set', 'stock', etId, { key, v: n, eq: (etById(etId) || {}).abbr || '?' });
  toast('✓ ' + t('saved')); render();
}

function dirAux(){
  return `<div class="card">` + state.data.aux_equipment.map(a => `
    <div class="rowline"><div class="grow">${ic('toolbox')} ${esc(a.name)}</div>
      <button class="btn btn-ghost sm" onclick="App.editAuxModal('${a.id}')">${t('edit')}</button>
    </div>`).join('') + `</div>
    <button class="btn btn-green" onclick="App.editAuxModal()">＋ ${t('add')}</button>`;
}

function dirPrice(){
  const canEdit = isAdmin();
  const mode = state.priceMode === 'ind' ? 'ind' : 'std';
  const cps = state.data.counterparties;
  const seg = `
    <div class="lang-seg seg-full" style="margin-bottom:10px">
      <button class="${mode==='std'?'on':''}" onclick="App.priceMode('std')">${t('price_std_tab')}</button>
      <button class="${mode==='ind'?'on':''}" onclick="App.priceMode('ind')">${t('price_ind_tab')}</button>
    </div>`;
  if (mode === 'std'){
    return seg + `<div class="card">
      <div style="font-weight:900;margin-bottom:6px">${ic('dollar')} ${t('price_list')} — ${t('std_price')}</div>
      ${state.data.price_list.map(pr => `
        <div class="rowline">
          <div class="grow">${esc(pr.name)}<div class="tiny">${esc(pr.unit_label||'')}</div></div>
          ${canEdit
            ? `<input class="price-input" inputmode="decimal" value="${pr.price}" onchange="App.setStdPrice('${pr.id}', this.value)">`
            : `<span class="money">${money(pr.price)}</span>`}
        </div>`).join('')}
    </div>`;
  }
  /* индивидуальные: третья область — выпадающий список контрагентов */
  if (!cps.length) return seg + `<div class="list-empty">${t('no_items')}</div>`;
  if (!state.priceCp || !cps.find(c=>c.id===state.priceCp)) state.priceCp = cps[0].id;
  const c = cpById(state.priceCp);
  const cpSel = `
    <div class="form-row"><span class="lbl">${t('counterparty')}</span>
      <select onchange="App.priceCpSel(this.value)">
        ${cps.map(x=>`<option value="${x.id}" ${x.id===state.priceCp?'selected':''}>${esc(x.name)}</option>`).join('')}
      </select></div>`;
  const rows = state.data.price_list.map(pr => {
    const cpp = state.data.counterparty_prices.find(x => x.counterparty_id===c.id && x.key===pr.key);
    const custom = cpp?.custom || false;
    const val = custom ? cpp.price : pr.price;
    return `<div class="rowline">
      <div class="grow" style="font-size:.82rem">${custom?`<span class="money">●</span> `:''}${esc(pr.name)}
        <div class="tiny">${t('std_price')}: ${money(pr.price)}</div></div>
      ${canEdit
        ? `<input type="checkbox" ${custom?'checked':''} title="${t('custom_price')}"
             onchange="App.cpCustomToggle('${c.id}','${pr.key}', this.checked)">
           <input class="price-input" inputmode="decimal" value="${val}" ${custom?'':'disabled'}
             onchange="App.cpSetPrice('${c.id}','${pr.key}', this.value)">`
        : `<span class="money">${money(val)}</span>`}
    </div>`;
  }).join('');
  return seg + cpSel + `<div class="card">
    <div class="tiny" style="margin-bottom:6px">${t('price_ind_hint')}</div>
    ${rows}
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
    body = `<div class="tiny" style="margin-bottom:6px">${ic('chk_on')} = ${t('custom_price')}</div>${rows}`;
  } else {
    const list = state.data.complexes.filter(x=>x.counterparty_id===c.id);
    body = list.map(cx=>`
      <div class="rowline">
        <div class="abbr" style="min-width:44px;height:38px">${esc(cx.abbr||'—')}</div>
        <div class="grow"><b>${esc(cx.name)}</b><div class="tiny">${esc(cx.address||'')} ${cx.access_code?'· '+ic('key')+' '+esc(cx.access_code):''}</div></div>
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
  if (document.getElementById('overlay') && state.cpOpenId) renderCpModal(); else render();
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
        <button class="tabbtn ${!cx.callbox_gate?'active':''}" data-gate="0" onclick="App.pcGate(this)">${ic('callbox')} ${t('target_callbox')}</button>
        <button class="tabbtn ${cx.callbox_gate?'active':''}" data-gate="1" onclick="App.pcGate(this)">${ic('gate')} ${t('target_gate')}</button>
      </div>
      <input type="hidden" id="pc-gate" value="${cx.callbox_gate?1:0}"></div>
    ${(()=>{ const m=lastCodeMeta(cx.id); return m?`<div class="tiny" style="margin:-4px 0 8px">${ic('book')} ${t('last_code_upd')}: ${fmtDMY(String(m.date).slice(0,10))} · ${esc(profName(m.by))}</div>`:''; })()}
    <button class="btn btn-ghost sm" style="margin-bottom:10px" onclick="App.codeHistory('${cx.id}')">${ic('book')} ${t('history')}</button>
    <div class="grid-2">
      <div class="form-row"><span class="lbl">${t('lat')}</span><input id="cx-lat" inputmode="decimal" value="${cx.lat ?? ''}" placeholder="33.78"></div>
      <div class="form-row"><span class="lbl">${t('lng')}</span><input id="cx-lng" inputmode="decimal" value="${cx.lng ?? ''}" placeholder="-84.38"></div>
    </div>
    <div class="grid-2" style="margin-bottom:10px">
      <button class="btn btn-blue sm" onclick="App.geocodeCx()">${ic('pin')} ${t('geocode')}</button>
      <button class="btn btn-ghost sm" onclick="App.gmapsCx()">${ic('map')} ${t('open_in')} ${navName()}</button>
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
      <div class="grow" style="flex:1"><b>${ic('key')} ${t('my_pass_title')}</b>
        ${HAS_SB ? '' : `<div class="d">${t('demo_only_sb')}</div>`}</div>
      <button class="btn btn-ghost sm" onclick="App.ownPassModal()">${t('set_pass')}</button>
    </div>
    <div class="settings-row">
      <div class="grow" style="flex:1"><b>${t('language')}</b></div>
      <div class="lang-seg">
        <button class="${state.lang==='ru'?'on':''}" onclick="App.setLang('ru')">RU</button>
        <button class="${state.lang==='en'?'on':''}" onclick="App.setLang('en')">EN</button>
      </div>
    </div>
    <div class="settings-row"><!-- v1.07.21: выбор навигатора для маршрутов -->
      <div class="grow" style="flex:1"><b>${ic('compass')} ${t('nav_app')}</b>
        <div class="d">${t('nav_app_hint')}</div></div>
      <div class="lang-seg">
        <button class="${(state.navApp||'auto')==='auto'?'on':''}" onclick="App.setNavApp('auto')">${t('nav_auto')}</button>
        <button class="${state.navApp==='apple'?'on':''}" onclick="App.setNavApp('apple')">Apple</button>
        <button class="${state.navApp==='google'?'on':''}" onclick="App.setNavApp('google')">Google</button>
      </div>
    </div>
    <div class="settings-row">
      <div class="grow" style="flex:1"><b>${ic('font')} ${t('font_soon').split(' — ')[0]}</b><div class="d">${t('font_soon')}</div></div>
    </div>
  </div>

  <div class="card" style="border-color:var(--green)">
    <div class="settings-row" style="border:none">
      <div class="grow" style="flex:1">
        <b>${ic('refresh')} ${t('sync')}</b>
        <div class="d">${t('synced')}: ${state.lastSync || t('never')} · ${HAS_SB?'Supabase':'DEMO / localStorage'}</div>
        ${SYNC_ERRORS.length ? `<div class="d" style="color:var(--red)">⚠ ${SYNC_ERRORS.length} ${t('tables_failed')}: ${SYNC_ERRORS.map(x=>x.tb).join(', ')}</div>` : ''}
        ${WRITE_ERRORS.length ? `<div class="d" style="color:var(--yellow)">${ic('pencil')} ${t('write_err')}: ${WRITE_ERRORS.length}</div>` : ''}
        ${pendingLoad().length ? `<div class="d" style="color:var(--yellow)">⏳ ${t('pending_writes')}: ${pendingLoad().length}</div>` : ''}
      </div>
      <button class="btn btn-green sm" onclick="App.sync()">${t('sync')}</button>
    </div>
    <button class="btn btn-ghost sm" style="margin-top:8px" onclick="App.diag()">${ic('steth')} ${t('diag')}</button>
    <button class="btn btn-ghost sm" style="margin-top:8px" onclick="App.showLog()">${ic('receipt')} ${t('log_title')}</button>
    ${isAdmin() ? `<button class="btn btn-blue sm" style="margin-top:8px" onclick="App.dbDiag()">${ic('archive')} ${t('db_diag')}</button>` : ''}
  </div>

  ${isAdmin() ? `
  <div class="card">
    <div style="font-weight:900;margin-bottom:6px">${ic('building')} ${t('org')}</div>
    <div class="form-row"><span class="lbl">${t('org_name')}</span><input id="org-name" value="${esc(org.company_name)}"></div>
    <div class="form-row"><span class="lbl">${t('org_short')}</span><input id="org-short" value="${esc(org.company_short)}"></div>
    <div class="form-row"><span class="lbl">${t('org_assoc')}</span><input id="org-assoc" value="${esc(org.assoc_line)}"></div>
    <div class="grid-3">
      <input id="org-a1" value="${esc(org.addr1)}"><input id="org-a2" value="${esc(org.addr2)}"><input id="org-a3" value="${esc(org.addr3)}">
    </div>
    <button class="btn btn-blue sm" style="margin-top:8px" onclick="App.saveOrg()">${t('save')}</button>
  </div>
  <div class="card">
    <div style="font-weight:900;margin-bottom:6px">${ic('share')} ${t('shared_set_title')}</div>
    <label class="opt ${org.allow_shared_jobs!==false?'on':''}">
      <input type="checkbox" id="org-shared" ${org.allow_shared_jobs!==false?'checked':''} onchange="App.setSharedJobs(this.checked)"> ${t('shared_set_chk')}
    </label>
    <label class="opt ${org.manager_can_reorder?'on':''}">
      <input type="checkbox" ${org.manager_can_reorder?'checked':''} onchange="App.setMgrReorder(this.checked)"> ${t('mgr_reorder_chk')}
    </label>
    <div class="tiny" style="margin-top:6px">${t('shared_set_hint')}</div>
  </div>
  <div class="card">
    <div style="font-weight:900;margin-bottom:6px">${ic('box')} ${t('eq_settings_title')}</div>
    <div class="qty-line"><span class="name">${t('def_days_lbl')}</span>
      <input class="price-input" style="max-width:70px" inputmode="numeric" value="${org.default_rent_days ?? 3}" onchange="App.setOrgNum('default_rent_days', this.value, 1, 30)"></div>
    <div class="qty-line"><span class="name">${t('max_ext_lbl')}</span>
      <input class="price-input" style="max-width:70px" inputmode="numeric" value="${org.max_extend_days ?? 3}" onchange="App.setOrgNum('max_extend_days', this.value, 1, 30)"></div>
    <label class="opt ${org.manager_can_approve?'on':''}">
      <input type="checkbox" ${org.manager_can_approve?'checked':''} onchange="App.setOrgFlag('manager_can_approve', this.checked)"> ${t('mgr_approve_chk')}</label>
    <label class="opt ${org.stock_visible_all!==false?'on':''}">
      <input type="checkbox" ${org.stock_visible_all!==false?'checked':''} onchange="App.setOrgFlag('stock_visible_all', this.checked)"> ${t('stock_vis_chk')}</label>
    <label class="opt ${org.allow_tech_proposal_flag!==false?'on':''}">
      <input type="checkbox" ${org.allow_tech_proposal_flag!==false?'checked':''} onchange="App.setOrgFlag('allow_tech_proposal_flag', this.checked)"> ${t('allow_prop_chk')}</label>
    <div class="qty-line"><span class="name">${t('lock_days_lbl')}</span>
      <input class="price-input" style="max-width:70px" inputmode="numeric" value="${org.edit_lock_days ?? 0}" onchange="App.setOrgNum('edit_lock_days', this.value, 0, 60)"></div>
    <div class="tiny">${t('lock_hint')}</div>
  </div>
  ${mediaSettingsCardHtml()}
  ${backupCardHtml()}
  ${diagCardHtml()}
  <div class="card">
    <div style="font-weight:900;margin-bottom:6px">${ic('mail')} ${t('invite_set_title')}</div>
    <div class="tiny" style="margin-bottom:8px">${t('invite_hint')}</div>
    <div class="form-row"><span class="lbl">${t('invite_new_lbl')}</span>
      <input id="inv-code" autocomplete="off" autocapitalize="none" spellcheck="false" ${HAS_SB?'':'disabled'}></div>
    ${HAS_SB ? '' : `<div class="tiny" style="margin:-4px 0 8px">${t('demo_only_sb')}</div>`}
    <button class="btn btn-blue sm" onclick="App.inviteSave()" ${HAS_SB?'':'disabled'}>${t('save')}</button>
  </div>` : ''}

  <div class="card">
    <div class="settings-row"><div class="grow" style="flex:1"><b>${ic('phone')} PWA</b>
      <div class="d">${isStandalone() ? '✓ ' + t('already_installed') : t('install_hint')}</div>
      ${IS_IOS && !isStandalone() ? `<div class="d">🍎 ${t('install_ios_hint')}</div><button class="btn btn-blue sm" style="margin-top:6px" onclick="App.a2hsModal()">${ic('phone')} ${t('a2hs_how')}</button>` : ''}
      <div class="d">${t('install_where_win')}</div></div></div>
    ${!isStandalone() ? `<button id="pwa-install-btn" class="btn btn-blue sm" style="${pwaPrompt?'':'display:none'};margin-top:6px" onclick="App.installPwa()">${ic('download')} ${t('install_app')}</button>` : ''}
    <div class="settings-row"><div class="grow" style="flex:1"><b>${t('version')}</b>
      <div class="d">TechLog v${APP_VERSION}${state.lastUpdCheck ? ' · ' + t('upd_last') + ' ' + state.lastUpdCheck : ''}${state.updAvail ? ' · ⬆ ' + t('upd_found') + ': ' + state.updAvail : ''}</div></div>
      <button class="btn btn-ghost sm" onclick="App.updCheck()">${ic('refresh')} ${t('upd_check')}</button></div>
  </div>

  <button class="btn btn-red" onclick="App.logout()">✕ ${t('logout')}</button>
  ${viewFooter()}`;
}

/* =====================================================================
   PDF-ИНВОЙС (только английский, по образцу бумажной формы)
   ===================================================================== */
/* v1.07.19: сборка PDF-документа вынесена из makePdf — один и тот же бланк
   нужен и для скачивания (телефон/ПК), и для живого предпросмотра в ПК-режиме.
   quiet=true (предпросмотр): без тостов и без блокировки по незаполненным
   полям — предпросмотр обязан показывать текущее состояние формы как есть. */
function buildInvoicePdfDoc(quiet){
  if (!window.jspdf){ if (!quiet) toast('jsPDF not loaded', 'err'); return null; }
  const j = jobDraft || state.data.jobs.find(x=>x.id===state.jobId);
  if (!j) return null;
  if (!quiet){
    const iss = jobIssues(j);
    if (iss.length){ toast('⚠ ' + t('pdf_blocked') + ': ' + iss.map(k=>t('issue_'+k)).join(', '), 'err'); return null; }
  }
  const { jsPDF } = window.jspdf;
  // v1.07.06: одиночный инвойс — тот же ВЕРТИКАЛЬНЫЙ бланк, по центру портретного Letter
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });          // 215.9 × 279.4
  const left = (215.9 - INV_W) / 2, top = (279.4 - INV_H) / 2;
  doc.setLineDashPattern([2,2],0); doc.setDrawColor(190);
  doc.rect(left, top, INV_W, INV_H);                                 // контур половинки-бланка (линия отреза)
  doc.setDrawColor(0); doc.setLineDashPattern([],0);
  drawInvoiceVert(doc, j, left, top);
  return doc;
}
/* =====================================================================
   v1.07.21: сохранение PDF с обходом для iOS.
   doc.save() (blob + <a download>) в Safari-вкладке терпимо, но в
   установленной на «Домой» PWA на iOS часто «ничего не происходит» либо
   открывается просмотрщик без выхода назад. Надёжный путь на iOS —
   системный share sheet с файлом («Сохранить в Файлы», AirDrop, почта…);
   фолбэк для очень старых iOS — blob во встроенном просмотрщике.
   Вызывается синхронно из onclick — это сохраняет «жест пользователя»,
   без которого Safari блокирует и share, и window.open.
   ===================================================================== */
function savePdfCompat(doc, fname){
  if (!IS_IOS){ doc.save(fname); return; }
  let blob = null;
  try{ blob = doc.output('blob'); }catch(e){ dlog('⛔ pdf blob:', e); }
  if (!blob){
    try{ doc.save(fname); }catch(e){ dlog('⛔ pdf save:', e); toast('⛔ ' + t('pdf_share_fail'), 'err'); }
    return;
  }
  try{
    const file = new File([blob], fname, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })){
      navigator.share({ files: [file], title: fname }).catch(err => {
        if (err && err.name === 'AbortError') return;   // пользователь сам закрыл шит — не ошибка
        dlog('⛔ pdf share:', err);
        toast('⛔ ' + t('pdf_share_fail'), 'err');
      });
      return;
    }
  }catch(e){ dlog('⛔ pdf File/canShare:', e); }
  /* iOS < 15 (без share с файлами): открываем во встроенном просмотрщике */
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function makePdf(){
  const doc = buildInvoicePdfDoc(false);
  if (!doc) return;
  const j = jobDraft || state.data.jobs.find(x=>x.id===state.jobId);
  const cx = cxById(j.complex_id) || {name:'', address:''};
  const fname = 'Invoice_' + (cx.abbr||'UNIT') + '_' + (j.unit_number||'x') + '_' + j.date + '.pdf';
  savePdfCompat(doc, fname);   // v1.07.21
}
/* публичная ручка для ПК-режима: Blob с актуальным бланком или null */
function pdfPreviewBlob(){
  try{
    const doc = buildInvoicePdfDoc(true);
    return doc ? doc.output('blob') : null;
  }catch(e){ dlog('⛔ pdfPreviewBlob:', e); return null; }
}
/* v1.07.26: предпросмотр PDF в новой вкладке и печать с телефона */
function pdfPreview(){
  const b = pdfPreviewBlob(); if (!b){ toast('⛔ PDF', 'err'); return; }
  const u = URL.createObjectURL(b);
  window.open(u, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
function pdfPrint(){
  const b = pdfPreviewBlob(); if (!b){ toast('⛔ PDF', 'err'); return; }
  const u = URL.createObjectURL(b);
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0';
  fr.src = u; document.body.appendChild(fr);
  fr.onload = () => {
    try { fr.contentWindow.focus(); fr.contentWindow.print(); }
    catch (e) { window.open(u, '_blank', 'noopener'); }
    setTimeout(() => { fr.remove(); URL.revokeObjectURL(u); }, 60000);
  };
  toast('ℹ ' + t('print_hint'), 'inf');
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
    return true;
  }catch(e){ dlog('update: проверка не удалась (' + reason + '):', e); return false; }
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
  openJob, saveJob, approveJob, deleteJob, makePdf, pdfPreviewBlob, pickupGroup,
  setReportDate(v){ state.reportDate = v; render(); }, copyReport,
  repTab(v){ state.repTab = v; render(); },
  jrTab(v){ if (state.jr){ state.jr.tab = v; state.jr.act = ''; loadJournal(true); } },
  boardHideEmpty(v){ localStorage.setItem('tl_board_hide_empty', v ? '1' : '0'); render(); },
  mediaPick, mediaFlush, mediaOpen, mediaDelete, mediaQDel,
  mediaSaveKeys, mediaConnect, mediaHealth,
  bkExport, bkImportPick, bkSaveLog, runDiag,
  setVm(v){
    try{
      if (window.TLView && window.TLView.setMode){ window.TLView.setMode(v); render(); return; }
    }catch(e){}
    try{ localStorage.setItem('techlog_view_mode', v); }catch(e){}
    location.reload();
  },
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
  noteModal, saveNote, auxToggle, sectionHelp: sectionHelpModal,
  crewAdd, crewAll, crewRemove, navToCx, copyText, copyCxAddr,
  pickupModal, extendModal, extMode, extDays, extQty, extApply, jobHistory, pickupOne,
  searchInput, searchKindSet, searchClear, searchOpenPk, logoHome, checkVerClick,
  jumpToday(){ state.selDate = todayISO(); state.weekStart = mondayOf(state.selDate); render(); },
  setRole, staffVis, saveVis, staffBlock, staffPassModal, staffSetPass,
  staffAddModal, staffCreate, inviteSave, ownPassModal, ownPassSave,
  priceMode(v){ state.priceMode = v; render(); },
  priceCpSel(v){ state.priceCp = v; render(); },
  diag: showDiagnostics, copyDiag,
  faq: faqModal,
  translateEn: translateToEn,
  openDayMap(){ state.mapDay = true; state.mapDate = state.selDate; App.go('map'); },
  mapMode(v){ state.mapDay = !!v; if (v && !state.mapDate) state.mapDate = state.selDate; render(); },
  showLog: showLogModal, copyLog, clearLog,
  jrRefresh(){ loadJournal(true); }, jrMore(){ loadJournal(false); },   // v1.07.18: журнал
  jrAct(v){ state.jr.act = v; loadJournal(true); },
  jrActor(v){ state.jr.actor = v; loadJournal(true); },
  togglePriority, moveJob, boardMove, setCarNo, restorePk, pdfPreview, pdfPrint,
  comboFilter, comboPick, stockSet, wtChecklistModal, wtChecklistSave,
  openProposal, propBack, saveProposal, delProposal, makeProposalPdf, linkProposal,
  propField(k, v){ if (propDraft) propDraft[k] = v; },
  propFilter(v){ state.propFilter = v; render(); },
  propItem(i, f, v){ if (!propDraft || !propDraft.items[i]) return;
    propDraft.items[i][f] = (f === 'a') ? (parseFloat(v) || 0)
      : (f === 'q') ? (parseFloat(v) || 1) : v;
    if (f === 'a') propRecalc(); },
  propItemAdd(){ if (!propDraft) return; propDraft.items.push({ q: 1, code: '', d: '', a: 0 });
    const el = $('#prop-rows'); if (el) el.innerHTML = propItemsHtml(); },
  propItemDel(i){ if (!propDraft) return; propDraft.items.splice(i, 1);
    if (!propDraft.items.length) propDraft.items.push({ q: 1, code: '', d: '', a: 0 });
    const el = $('#prop-rows'); if (el) el.innerHTML = propItemsHtml(); propRecalc(); },
  setPropStatus(s){ if (!propDraft) return; propDraft.status = s;
    if (s === 'approved' || s === 'declined'){ propDraft.decided_by = state.user.id;
      propDraft.decided_at = new Date().toISOString(); } render(); },
  batchPreview, batchPrint, extReqCreate, extReqDecide,
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
  installPwa, a2hsModal, a2hsHide,
  enterKey(e, mode){
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (mode === 'in') App.signIn(); else App.signUp();
  },
  dirTab(v){ state.dirTab = v; render(); },
  dirTabsScroll(dir){
    const el = document.getElementById('dir-tabs'); if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.7), behavior: 'smooth' });
  },
  openCp, cpTab(v){ state.cpTab = v; renderCpModal(); },
  editCpModal, saveCp, cpCustomToggle, cpSetPrice,
  editCxModal, saveCx, editWtModal, saveWt, editEtModal, saveEt, editAuxModal, saveAux,
  setStdPrice, delRow,
  pickColor(id, c){ $('#'+id+'-v').value = c; document.querySelectorAll('#'+id+' .cdot').forEach(d=>d.classList.toggle('sel', d.dataset.c===c)); },
  setLang(l){ state.lang = l; localStorage.setItem('techlog_lang', l); render(); },
  setNavApp(v){ state.navApp = v; localStorage.setItem('techlog_navapp', v); render(); },  // v1.07.21
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
  setSharedJobs(v){
    // v1.07.10: админ включает/выключает общий доступ к документам для всей команды
    const org = { ...state.data.org_settings, allow_shared_jobs: !!v };
    dbSaveOrg(org); toast('✓ ' + t('saved')); render();
  },
  setMgrReorder(v){
    // v1.07.25: админ разрешает менеджеру менять очерёдность (Доска и ▲▼ на главной)
    const org = { ...state.data.org_settings, manager_can_reorder: !!v };
    dbSaveOrg(org); audit('org_toggle', 'org', 'manager_can_reorder', { on: !!v });
    toast('✓ ' + t('saved')); render();
  },
  setOrgFlag(key, v){
    const org = { ...state.data.org_settings, [key]: !!v };
    dbSaveOrg(org); audit('org_toggle', 'org', key, { on: !!v });
    toast('✓ ' + t('saved')); render();
  },
  setOrgNum(key, v, min, max){
    const n = Math.max(min, Math.min(max, parseInt(v, 10) || 0));
    const org = { ...state.data.org_settings, [key]: n };
    dbSaveOrg(org); audit('org_set', 'org', key, { v: n });
    toast('✓ ' + t('saved')); render();
  },
  setProposal(v){ if (jobDraft){ jobDraft.has_proposal = !!v; autosaveDraft(); } },
  toastInfo(k){ toast('ℹ ' + t(k), 'inf'); },
  clToggle(i, v){
    if (!jobDraft) return;
    (jobDraft.form_data.cl = jobDraft.form_data.cl || {})[i] = !!v;
    autosaveDraft();
    const card = $('#cl-card');
    if (card){
      const wt = wtById(jobDraft.work_type_id); const cl = (wt && wt.checklist) || [];
      const done = jobDraft.form_data.cl; const n = cl.filter((_, k) => done[k]).length;
      const chip = card.querySelector('.chip');
      if (chip){ chip.textContent = n + '/' + cl.length; chip.className = 'chip ' + (n === cl.length ? 'ok' : 'warn'); }
    }
  },
  demoLogin, logout,
  signIn(){ sbSignIn($('#li-login').value, $('#li-pass').value); },
  signUp(){ sbSignUp($('#su-login').value, $('#su-pass').value, $('#su-name').value.trim(), $('#su-invite').value.trim()); },
  authMode(up){ $('#auth-signin').style.display = up?'none':''; $('#auth-signup').style.display = up?'':'none'; },
};
window.App = App;


/* =====================================================================
   СИСТЕМНАЯ КНОПКА «НАЗАД» (Android):
   модалка → закрыть; инвойс → сохранить и на главную; иначе — двойное
   нажатие для выхода из приложения (с подсказкой).
   ===================================================================== */
let backExitAt = 0;
function initBackGuard(){
  if (!window.history || !history.pushState) return;
  try{ history.pushState({ tl: 1 }, ''); }catch(e){ return; }
  window.addEventListener('popstate', async () => {
    const rearm = () => { try{ history.pushState({ tl: 1 }, ''); }catch(e){} };
    if (document.getElementById('overlay')){ closeModal(); rearm(); return; }
    if (state.user && state.screen === 'job' && jobDraft){
      rearm();
      try{ await saveJob(); }catch(e){ App.go('home'); }  // сохранить черновик и выйти на главную
      return;
    }
    const now = Date.now();
    if (now - backExitAt < 2200){ history.back(); return; } // второе нажатие — выход
    backExitAt = now;
    toast(t('back_exit_hint'), 'inf');
    rearm();
  });
}

(async function start(){
  try {
    initSW();
    initBackGuard();
    initDragSort();
    initTabsDrag();
    /* v1.07.21: iOS замораживает фон — досылаем недоставленные записи,
       когда приложение снова видно или появилась сеть */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pendingFlush();
    });
    window.addEventListener('online', () => pendingFlush());
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
/* v1.07.21: на iOS webkitSpeechRecognition формально существует (Safari 14.5+),
   но continuous-режим там печально известен багами (микрофон не останавливается,
   результаты не приходят). Свою кнопку на iOS скрываем — системная диктовка
   кнопкой 🎤 на клавиатуре iPhone работает в любое поле и распознаёт RU/EN. */
function dictSupported(){ return !IS_IOS && !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function dictationHTML(taId, value){
  const micRow = dictSupported() ? `
      <button type="button" class="mic ${dictTa===taId?'rec':''}" id="mic-${taId}" onclick="App.dictToggle('${taId}')" title="${t('dictate')}">${ic('mic')}</button>
      <div class="lang-seg sm">
        <button type="button" class="${state.dictLang==='ru-RU'?'on':''}" onclick="App.dictLang('ru-RU')">RU</button>
        <button type="button" class="${state.dictLang==='en-US'?'on':''}" onclick="App.dictLang('en-US')">EN</button>
      </div>` : '';
  const iosHint = (!dictSupported() && IS_IOS) ? `<span class="tiny">${t('dict_kbd_hint')}</span>` : '';
  return `<div class="dict-wrap">
    <textarea id="${taId}" class="note-ta" rows="3" placeholder="${t('note')}…">${esc(value||'')}</textarea>
    <div class="dict-row">${micRow}
      <button type="button" class="btn btn-ghost sm" onclick="App.translateEn('${taId}')">${ic('globe')} ${t('translate_en')}</button>
      ${iosHint}<span class="tiny" id="mic-hint-${taId}">${dictTa===taId ? t('listening') : ''}</span>
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
    const mk = b.querySelector('.aux-mk'); if (mk) mk.innerHTML = fd.aux_take[id] ? ic('chk_on') : ic('chk_off');
  }
  autosaveDraft();
}

/* Заметка из карточки пикапа (та же заметка работы, попадает в PDF) */
function noteModal(jobId){
  const j = state.data.jobs.find(x=>x.id===jobId); if (!j) return;
  openModal(`
    ${modalHead(t('note'), 'note')}
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
        label: `${t('pickup')} Unit ${p0.unit_number||'—'} · ${eq}`, cx, kind:'pickup' });
    }
  });
  num.jobs.forEach(j => {
    const cx = cxById(j.complex_id);
    if (cx && cx.lat != null && cx.lng != null){
      const wt = wtById(j.work_type_id) || {color:'#888', name:''};
      pts.push({ num: num.jobNum[j.id], lat:+cx.lat, lng:+cx.lng, color: wt.color,
        label: `Unit ${j.unit_number||'—'} · ${wt.name}`, cx, kind:'job' });
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
            <div class="grow">${p.kind==='job'?ic('wrench'):ic('box')} ${esc(p.label)}<div class="tiny">${esc(p.cx.name)}</div></div></button>`).join('')
        : `<div class="list-empty">${t('no_items')}</div>`)
    : list.map(cx=>{
        const has = cx.lat != null && cx.lng != null;
        return `<button class="rowline map-row" ${has?`onclick="App.mapFocus(${cx.lat},${cx.lng})"`:''}>
          <span class="dot" style="background:${cpColor(cx.counterparty_id)}"></span>
          <div class="grow"><b>${esc(cx.name)}</b> <span class="tiny">${esc((cpById(cx.counterparty_id)||{}).abbr||'')}</span>
            <div class="tiny">${has ? esc(cx.address||'') : '⚠ ' + t('map_no_coords')}</div></div>
          ${cx.access_code?`<span class="tiny key-copy" onclick="event.stopPropagation();App.copyText('${esc(cx.access_code)}')">${ic('key')} ${esc(cx.access_code)}</span>`:''}
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
      <button class="tabbtn ${!state.mapDay?'active':''}" onclick="App.mapMode(false)">${ic('map')} ${t('map_mode_all')}</button>
      <button class="tabbtn ${state.mapDay?'active':''}" onclick="App.mapMode(true)">${ic('calendar')} ${t('map_mode_day')}</button>
    </div>
    ${state.mapDay ? `
      <div class="form-row" style="margin-top:8px"><span class="lbl">${t('map_day_hint')}</span>
        <input type="date" value="${state.mapDate || state.selDate}" onchange="App.mapSetDate(this.value)"></div>
      ${day.pts.length ? `<button class="btn btn-blue sm" onclick="App.mapRoute()">${ic('compass')} ${t('route_day_in')} ${navName()}</button>` : ''}` : ''}
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
  mapObj.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>'); // v1.07.20: без флага в стандартном префиксе
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
  /* v1.07.21: обычный <a href> надёжнее window.open передаёт управление в нативное приложение карт на iOS */
  const gm = (cx) => `<a href="${navDirUrl(cx.lat + ',' + cx.lng)}" target="_blank" rel="noopener">${t('open_in')} ${navName()} →</a>`;

  if (state.mapDay){
    const { pts } = mapDayItems();
    const byCx = {};
    pts.forEach(p => (byCx[p.cx.id] = byCx[p.cx.id] || { cx: p.cx, items: [], color: p.color }).items.push(p));
    Object.values(byCx).forEach(g => {
      g.items.sort((a,b)=>(a.num||0)-(b.num||0));
      const cx = g.cx;
      const html = `<b>${esc(cx.name)}</b><br>${esc(cx.address||'')}${cx.access_code?'<br>'+ic('key')+' '+esc(cx.access_code):''}${cx.callbox_code?'<br>'+(cx.callbox_gate?ic('gate')+' ':ic('callbox')+' ')+esc(cx.callbox_code):''}<hr style="margin:4px 0">` +
        g.items.map(i=>`<b>#${i.num}</b> <span style="color:${i.color}">${i.kind==='job'?ic('wrench'):ic('box')}</span> ${esc(i.label)}`).join('<br>') + `<br>${gm(cx)}`;
      const numTxt = g.items.map(i=>i.num).join('·');
      mk(+cx.lat, +cx.lng, g.items.find(i=>i.kind==='job')?.color || g.items[0].color, html, numTxt);
    });
  } else {
    state.data.complexes
      .filter(cx => (!state.mapCp || cx.counterparty_id === state.mapCp) && cx.lat != null && cx.lng != null)
      .forEach(cx => {
        const cp = cpById(cx.counterparty_id) || {name:''};
        mk(+cx.lat, +cx.lng, cpColor(cx.counterparty_id),
          `<b>${esc(cx.name)}</b> (${esc(cx.abbr||'')})<br>${esc(cp.name)}<br>${esc(cx.address||'')}${cx.access_code?'<br>'+ic('key')+' '+esc(cx.access_code):''}${cx.callbox_code?'<br>'+(cx.callbox_gate?ic('gate')+' ':ic('callbox')+' ')+esc(cx.callbox_code):''}<br>${gm(cx)}`);
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
  window.open(navRouteUrl(uniq), '_blank', 'noopener'); // v1.07.21: мультистоп в Apple Maps (iOS 18.4+) или Google Maps
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
  window.open(navSearchUrl(q), '_blank', 'noopener');  // v1.07.21: Apple Maps на iOS / Google на остальных
}

/* =====================================================================
   ЭКРАН: ОТЧЁТЫ — вкладки «Инвойсы (PDF)» и «Пикапы»
   ===================================================================== */
function repScopeJobs(){
  let js = scopeFilter(state.data.jobs, 'technician_id');
  // v1.07.10: работы с общим доступом видны коворкеру и в отчётах
  const shared = state.data.jobs.filter(j => isJobSharedWithMe(j) && !js.includes(j));
  return shared.length ? js.concat(shared) : js;
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
      <button class="btn btn-ghost" style="margin-top:10px" onclick="App.batchPreview()">${ic('search')} ${t('pdf_preview')}</button>
      <button class="btn btn-green" style="margin-top:8px" onclick="App.batchPdf()">${ic('download')} ${t('rep_download')} (${js.length})</button>
      <button class="btn btn-blue" style="margin-top:8px" onclick="App.batchPrint()">${ic('report')} ${t('rep_print2')}</button>
    </div>
    ${listHtml}`
  : `<div class="list-empty"><div class="big">${ic('archive')}</div>${t('rep_none')}</div>`}`;
}

/* =====================================================================
   ПАКЕТНЫЙ PDF: 2 инвойса на страницу Letter (по половине)
   ===================================================================== */
/* =====================================================================
   v1.07.06: ВЕРТИКАЛЬНЫЙ бланк инвойса (как бумажная форма):
   половина Letter в альбомной ориентации — 139.7 × 215.9 мм.
   Используется и в одиночном PDF (по центру портретного листа),
   и в пакетном отчёте (два бланка рядом, вертикальная линия отреза).
   ===================================================================== */
const INV_W = 139.7, INV_H = 215.9;
function drawInvoiceVert(doc, j, left, top){
  const fd = Object.assign(emptyFormData(), j.form_data || {});
  const cp = cpById(j.counterparty_id) || {name:''};
  const cx = cxById(j.complex_id) || {name:'', address:''};
  const org = state.data.org_settings;
  const p = priceResolver(j.counterparty_id);
  const sec = calcSections(fd, p);
  const grand = (j.status==='approved' && j.approved_total != null) ? +j.approved_total : calcTotal(fd, p);

  const L = left + 6, R = left + INV_W - 6, W = R - L;
  const C1 = L + 27;              // SERVICES | DESCRIPTION
  const C2 = R - 15;              // DESCRIPTION | AMOUNT
  const line = (a,b,c,d)=>doc.line(a,b,c,d);
  const F = (st,sz)=>{ doc.setFont('helvetica',st); doc.setFontSize(sz); };
  const txt = (s,x,y,o)=>doc.text(String(s??''),x,y,o);
  const box = (x,y,on,sz=2.7)=>{ doc.rect(x,y,sz,sz); if(on){ doc.setLineWidth(.45); line(x+.4,y+.4,x+sz-.4,y+sz-.4); line(x+sz-.4,y+.4,x+.4,y+sz-.4); doc.setLineWidth(.2);} };
  const radio = (x,y,on)=>{ doc.circle(x,y,1.25); if(on) doc.circle(x,y,.65,'F'); };
  const amt = (v,yy)=>{ if(v>0){ F('bold',7.4); txt(String(Math.round(v*100)/100), R-1.5, yy, {align:'right'}); } };

  doc.setLineWidth(.2);
  let y = top + 6;

  /* ---- шапка ---- */
  doc.setFillColor(20,20,20);
  doc.triangle(L+1, y+8, L+7, y+0.5, L+13, y+8, 'F');
  doc.setFillColor(255,255,255);
  doc.triangle(L+5, y+8, L+7, y+4.7, L+9, y+8, 'F');
  F('italic',4.9); txt(org.assoc_line||'', L, y+11.2);
  F('bold',12); txt(org.invoice_title||'INVOICE #CC', L + W*0.55, y+4.6, {align:'center'});
  F('bold',6.6); txt(org.header_city||'', L + W*0.55, y+9, {align:'center'});
  F('bold',5);
  txt(org.addr1||'', R-1, y+12.2, {align:'right'}); txt(org.addr2||'', R-1, y+15, {align:'right'}); txt(org.addr3||'', R-1, y+17.8, {align:'right'});
  y += 20;

  /* ---- реквизиты ---- */
  F('bold',7.2);
  txt('Date:', L, y); F('bold',7.6); txt(fmtUS(j.date), L+9, y);
  F('bold',7.2); txt('Unit #:', L+40, y); F('bold',7.6); txt(String(j.unit_number||''), L+51, y);
  box(L+74, y-2.5, !!fd.vacant, 2.6); F('bold',6.8); txt('Vacant', L+77.6, y);
  box(L+96, y-2.5, !!fd.occupied, 2.6); txt('Occupied', L+99.6, y);
  y += 4.8;
  F('bold',6.8); txt('Technician:', L, y);
  F('bold',7.2); txt(techNamesFor(j).slice(0,44), L+16, y);
  y += 4.6;
  F('bold',6.8); txt('Property/Customer:', L, y);
  F('bold',7); txt((cp.name + ' — ' + cx.name).slice(0,52), L+27, y);
  y += 4.4;
  F('bold',6.8); txt('Address:', L, y);
  F('bold',6.8); txt(String(cx.address||'').slice(0,60), L+12.5, y);
  y += 3.2;

  /* ---- таблица ---- */
  const tTop = y;
  const rows = [];
  const row = (h)=>{ rows.push(y); const yy = y; y += h; return yy; };

  let ry = row(4.6);
  F('bold',7);
  txt('SERVICES', (L+C1)/2, ry+3.2, {align:'center'});
  txt('DESCRIPTION', (C1+C2)/2, ry+3.2, {align:'center'});
  txt('AMOUNT', (C2+R)/2, ry+3.2, {align:'center'});

  const svc = (label, yy, on)=>{ F('bold',6.4); box(L+1.3, yy+0.9, on, 2.6); txt(label, L+4.8, yy+3.1); };
  const opt = (x, yy, on, label, fs=6)=>{ box(x, yy+0.9, on, 2.6); F('bold',fs); txt(label, x+3.4, yy+3.1); return x + 3.4 + doc.getTextWidth(label) + 2.8; };

  ry = row(5);
  svc('Steam Clean', ry, fd.steam.deep_scrub||fd.steam.rotovac);
  let x = opt(C1+2, ry, fd.steam.deep_scrub, 'Deep Scrub');
  x = opt(x, ry, fd.steam.rotovac, 'Rotovac');
  if ((fd.steam.deep_scrub||fd.steam.rotovac) && fd.steam.rooms>1){ F('bold',6); txt('Rooms: '+fd.steam.rooms, x, ry+3.1); }
  amt(sec.steam, ry+3.3);

  ry = row(8.6);                              /* Removals — 6 опций в две строки */
  svc('Removals', ry, ['red_stain','wax','rust','ink','gum','paint'].some(k=>fd.removals[k]));
  x = C1+2;
  [['red_stain','Red Stain'],['wax','Wax'],['rust','Rust']].forEach(([k,l])=>{ x = opt(x, ry, fd.removals[k], l, 5.8); });
  x = C1+2;
  [['ink','Ink'],['gum','Gum'],['paint','Paint']].forEach(([k,l])=>{ x = opt(x, ry+3.9, fd.removals[k], l, 5.8); });
  amt(sec.removals, ry+3.3);

  ry = row(5);
  svc('Repairs', ry, ['threshold','stretch','seam','patch'].some(k=>fd.repairs[k]));
  x = C1+2;
  [['threshold','Threshold'],['stretch','Stretch'],['seam','Seam'],['patch','Patch']].forEach(([k,l])=>{ x = opt(x, ry, fd.repairs[k], l, 5.8); });
  amt(sec.repairs, ry+3.3);

  ry = row(5);
  svc('Dye', ry, fd.dye.spot||fd.dye.full);
  x = opt(C1+2, ry, fd.dye.spot, 'Spot Dye'); opt(x, ry, fd.dye.full, 'Full Dye');
  amt(sec.dye, ry+3.3);

  ry = row(8.6);                              /* Other — две строки */
  svc('Other', ry, fd.other.trash_out||fd.other.pad_removal);
  x = opt(C1+2, ry, fd.other.trash_out, 'Trash Out');
  opt(x, ry, fd.other.pad_removal, 'Pad Removal');
  x = C1+2;
  if (fd.other.pad_removal && !fd.other.all_unit){ F('bold',6); txt('Rooms: '+(fd.other.rooms||1), x, ry+7); x += 15; }
  opt(x, ry+3.9, fd.other.all_unit, 'All Unit');
  amt(sec.other, ry+3.3);

  ry = row(5);
  x = opt(L+1.3, ry, fd.fog.fog, 'Fog', 6.4); opt(x, ry, fd.fog.goc, 'GOC', 6.4);
  x = opt(C1+2, ry, fd.fog.pet, 'Pet');
  x = opt(x, ry, fd.fog.smoke, 'Smoke');
  opt(x, ry, fd.fog.deodorizer, 'Deodorizer');
  amt(sec.fog, ry+3.3);

  ry = row(8.6);                              /* Treatments — две строки */
  svc('Treatments', ry, fd.treatments.sealant||fd.treatments.mold||fd.treatments.degreaser);
  x = opt(C1+2, ry, fd.treatments.sealant, 'Sealant');
  opt(x, ry, fd.treatments.degreaser, 'Degreaser');
  opt(C1+2, ry+3.9, fd.treatments.mold, 'Mold & Mildew');
  amt(sec.treatments, ry+3.3);

  ry = row(9.2);                              /* Wet Vac / Flood */
  x = opt(L+1.3, ry, fd.wetvac.wet_vac, 'Wet Vac', 6.2); opt(x, ry, fd.wetvac.flood, 'Flood', 6.2);
  x = opt(C1+2, ry, fd.wetvac.sewer, 'Sewer');
  opt(x, ry, fd.wetvac.fresh, 'Fresh Water');
  x = C1+2;
  [['ktc','Ktc'],['lr','Lr'],['dr','Dr'],['hall','Hall'],['brs',"Br's"],['all','All Unit']].forEach(([k,l])=>{
    radio(x+1.2, ry+6.4, fd.wetvac.areas[k]); F('bold',5.7); txt(l, x+3.1, ry+7.4); x += 3.1 + doc.getTextWidth(l) + 3.4;
  });
  amt(sec.wetvac, ry+4.6);

  ry = row(7.6);                              /* Air Duct / Dryer Vent */
  box(L+1.3, ry+0.8, fd.airduct.air_duct, 2.5); F('bold',5.9); txt('Air Duct Cleaning', L+4.6, ry+3);
  box(L+1.3, ry+4.3, fd.airduct.dryer_vent, 2.5); txt('Dryer Vent Cleaning', L+4.6, ry+6.5);
  F('bold',6); txt('Bedrooms:', C1+2, ry+3.1);
  doc.rect(C1+15, ry+0.6, 5.5, 3.4); if (fd.airduct.air_duct){ F('bold',6.4); txt(String(fd.airduct.bedrooms||1), C1+17.7, ry+3.2, {align:'center'}); }
  if (fd.airduct.note){ F('bolditalic',5.9); txt(String(fd.airduct.note).slice(0,34), C1+2, ry+6.7); }
  amt(sec.airduct, ry+4);

  const eqList = [...state.data.equipment_types].sort((a,b)=>(a.sort||0)-(b.sort||0)).slice(0,5);
  eqList.forEach((et, i)=>{
    ry = row(4.7);
    if (i===0) svc('Equipment', ry, Object.values(fd.equipment).some(e=>+e.qty>0));
    if (i===1){ F('bold',6.4); txt('Rental', L+4.8, ry+3.1); }
    const e = fd.equipment[et.id] || {qty:0, days:0};
    F('bold',6.1); txt(String(et.name).slice(0,16), C1+2, ry+3.2);
    F('bold',5.8); txt('Qty', C1+27, ry+3.2);
    doc.rect(C1+32, ry+0.6, 5, 3.4); if (+e.qty>0){ F('bold',6.4); txt(String(e.qty), C1+34.5, ry+3.2, {align:'center'}); }
    F('bold',5.8); txt('For', C2-16.5, ry+3.2);
    doc.rect(C2-12, ry+0.6, 5, 3.4); if (+e.qty>0){ F('bold',6.4); txt(String(e.days||3), C2-9.5, ry+3.2, {align:'center'}); }
    F('bold',5.8); txt('Days', C2-6, ry+3.2);
    amt((+e.qty||0)*Math.max(1,+e.days||1)*eqDayPrice(et,p), ry+3.3);
  });

  ry = row(8.6);                              /* Pad Installation — две строки */
  svc('Pad', ry, !!fd.pad.size || fd.pad.all_unit || fd.pad.rooms>0);
  F('bold',6.4); txt('Installation', L+4.8, ry+6.6);
  x = C1+3;
  [['q14','1/4'],['q12','1/2'],['q34','3/4'],['roll','1 Roll']].forEach(([k,l])=>{
    radio(x, ry+2.4, fd.pad.size===k); F('bold',6); txt(l, x+2, ry+3.3); x += 2 + doc.getTextWidth(l) + 3.6;
  });
  x = C1+3;
  F('bold',6); txt('Rooms:', x, ry+7.2);
  doc.rect(x+9.5, ry+4.6, 5, 3.3); if (fd.pad.rooms>0){ F('bold',6.4); txt(String(fd.pad.rooms), x+12, ry+7.2, {align:'center'}); }
  radio(x+19, ry+6.3, fd.pad.all_unit); txt('All Unit', x+21, ry+7.2);
  amt(sec.pad, ry+3.4);

  /* OTHER SERVICES: строки переносим, ширина узкая */
  const oth = (fd.others||[]).filter(o => (o.desc && o.desc.trim()) || +o.amount > 0);
  ry = row(4.8);
  F('bold',6.4); txt('OTHER SERVICES:', L+1.3, ry+3.2);
  if (oth[0]){ F('bolditalic',6.2); txt(String(oth[0].desc||'').slice(0,46), L+26, ry+3.2); amt(+oth[0].amount||0, ry+3.2); }
  doc.setLineWidth(.15); line(L+25, ry+3.9, C2-1, ry+3.9); doc.setLineWidth(.2);
  const rest = oth.slice(1);
  const exList = (fd.extra||[]);
  if (rest.length || !exList.length){
    ry = row(4.8);
    if (rest.length){
      F('bolditalic',6.2);
      txt(rest.map(o=>o.desc||'').join(' · ').slice(0,58), L+2, ry+3.2);
      amt(rest.reduce((s,o)=>s+(+o.amount||0),0), ry+3.2);
    }
    doc.setLineWidth(.15); line(L+1.3, ry+3.9, C2-1, ry+3.9); doc.setLineWidth(.2);
  }
  if (exList.length){
    const head = exList[0];
    ry = row(4.6);
    F('bolditalic',6.1); txt(extraItemTextEn(head).slice(0,60), L+2, ry+3.1);
    amt(extraLineTotal(head), ry+3.1);
    if (exList.length > 1){
      ry = row(4.6);
      const tail = exList.slice(1);
      F('bolditalic',6);
      txt(tail.map(extraItemTextEn).join(' · ').slice(0,62), L+2, ry+3.1);
      amt(tail.reduce((s,it)=>s+extraLineTotal(it),0), ry+3.1);
    }
  }

  if (j.note){
    const nl = doc.splitTextToSize(String(j.note).replace(/\s+/g,' '), W - 16).slice(0,2);
    ry = row(2.2 + nl.length*2.8 + 1.6);
    F('bold',6.2); txt('NOTES:', L+1.3, ry+3.1);
    F('bolditalic',6);
    nl.forEach((s2,i)=>txt(s2, L+11.5, ry+3.1+i*2.8));
  }

  ry = row(7);
  F('bold',8.4); txt('TOTAL DUE $', C2-2, ry+3.8, {align:'right'});
  F('bold',4.4); txt('NET DUE 30 DAYS', C2-2, ry+6.1, {align:'right'});
  F('bold',9.2); txt(String(Math.round(grand*100)/100), R-1.5, ry+4.6, {align:'right'});

  const tBot = y;
  doc.setLineWidth(.35); doc.rect(L, tTop, W, tBot - tTop); doc.setLineWidth(.2);
  rows.forEach((yy,i)=>{ if (i>0) line(L, yy, R, yy); });
  const c1Bot = rows[rows.length - (j.note ? 3 : 2)] ?? tBot;   /* колонка SERVICES не пересекает OTHER/NOTES/TOTAL */
  line(C1, tTop, C1, c1Bot);
  line(C2, tTop, C2, tBot);

  /* ---- условия и подписи ---- */
  const terms = 'I AUTHORIZE ' + (org.company_name||'') + ' TO PERFORM THE WORK LISTED ABOVE AND AGREE WITH THE PRICE. PAYMENTS ARE DUE NET 30 DAYS. EQUIPMENT PLACED ON THE PROPERTY REMAINS PROPERTY OF ' + (org.company_short||'') + '.';
  F('bold',4.5);
  doc.splitTextToSize(terms, W - 6).slice(0,3).forEach((s2,i)=>txt(s2, L + W/2, y+3+i*2.3, {align:'center'}));
  y += 11;
  F('bold',6.6);
  txt('PRINT NAME', L+2, y+2.2); doc.setLineDashPattern([1,0.8],0); line(L+18, y+2.8, R-2, y+2.8);
  y += 6.4;
  txt('SIGNATURE:', L+2, y+2.2); line(L+18, y+2.8, R-2, y+2.8); doc.setLineDashPattern([],0);
}

function buildBatchDoc(){
  if (!window.jspdf){ toast('jsPDF not loaded', 'err'); return null; }
  const all = repJobs();
  const js = all.filter(j => !jobIssues(j).length);
  const skipped = all.length - js.length;
  if (!js.length){ toast(t('rep_none') + (skipped?` · ⚠ ${skipped} ${t('batch_skipped')}`:''), 'err'); return null; }
  const { jsPDF } = window.jspdf;
  // альбомный Letter: два ВЕРТИКАЛЬНЫХ бланка рядом, между ними линия отреза;
  // если инвойс один — вторая половина листа остаётся пустой
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' }); // 279.4 × 215.9
  js.forEach((j, i) => {
    const pos = i % 2;
    if (i > 0 && pos === 0) doc.addPage();
    if (pos === 0){
      doc.setLineDashPattern([2,2],0); doc.setDrawColor(150);
      doc.line(INV_W, 5, INV_W, INV_H - 5);
      doc.setDrawColor(0); doc.setLineDashPattern([],0);
    }
    drawInvoiceVert(doc, j, pos * INV_W, 0);
  });
  doc._cnt = js.length; doc._skipped = skipped;
  return doc;
}
function batchPdf(){
  const doc = buildBatchDoc(); if (!doc) return;
  savePdfCompat(doc, 'Invoices_' + state.repFrom + '_' + state.repTo + '.pdf');   // v1.07.21
  toast('⬇ PDF: ' + doc._cnt + (doc._skipped?` · ⚠ ${doc._skipped} ${t('batch_skipped')}`:''));
}
function batchPreview(){                                 // v1.07.35: предпросмотр единого PDF
  const doc = buildBatchDoc(); if (!doc) return;
  const u = URL.createObjectURL(doc.output('blob'));
  window.open(u, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
function batchPrint(){                                   // v1.07.27: сразу на печать
  const doc = buildBatchDoc(); if (!doc) return;
  const u = URL.createObjectURL(doc.output('blob'));
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0';
  fr.src = u; document.body.appendChild(fr);
  fr.onload = () => {
    try { fr.contentWindow.focus(); fr.contentWindow.print(); }
    catch (e) { window.open(u, '_blank', 'noopener'); }
    setTimeout(() => { fr.remove(); URL.revokeObjectURL(u); }, 60000);
  };
  toast('ℹ ' + t('print_hint'), 'inf');
}

/* =====================================================================
   СПРАВОЧНИК: СОТРУДНИКИ (админ) — роли и видимость для менеджеров
   ===================================================================== */
function dirStaff(){
  const list = [...state.data.profiles].sort((a,b)=>a.display_name.localeCompare(b.display_name));
  return `<div class="card">` + list.map(u => {
    const me = u.id === state.user.id;
    const reg = u.created_at ? fmtDMY(String(u.created_at).slice(0,10)) : '—';
    return `
    <div class="rowline staff-row ${u.blocked?'is-blocked':''}">
      <span class="avatar role-${u.role}">${esc(initials(u.display_name))}</span>
      <div class="grow">
        <b>${esc(u.display_name)}</b>${u.car_no != null ? ` <span class="car-no" title="${t('car_no')}">${u.car_no}</span>` : ''}
        <span class="chip ${u.blocked?'bad':'ok'} chip-st">${u.blocked?t('st_blocked'):t('st_active')}</span>
        <div class="tiny">@${esc(u.login)} · ${t('registered')} ${reg}</div>
      </div>
      <div class="staff-ctl">
        <input class="car-inp" type="number" min="0" max="999" inputmode="numeric" title="${t('car_no')}"
          placeholder="№" value="${u.car_no ?? ''}" onchange="App.setCarNo('${u.id}', this.value)">
        ${u.role==='manager' ? `<button class="btn btn-ghost sm" onclick="App.staffVis('${u.id}')">${ic('eye')} ${t('vis_btn')}</button>` : ''}
        <select class="role-sel" onchange="App.setRole('${u.id}', this.value)" ${me?'disabled':''}>
          ${['tech','manager','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${t('role_'+r)}</option>`).join('')}
        </select>
        ${me ? '' : `<button class="icon-btn key-btn" title="${t('set_pass')}" aria-label="${t('set_pass')}" onclick="App.staffPassModal('${u.id}')">${ic('key')}</button>
        <button class="icon-btn ban-btn ${u.blocked?'off':''}" title="${u.blocked?t('unblock'):t('block')}" aria-label="${u.blocked?t('unblock'):t('block')}" onclick="App.staffBlock('${u.id}')">${ic('ban')}</button>`}
      </div>
    </div>`; }).join('') + `</div>
    <button class="btn btn-green" onclick="App.staffAddModal()">＋ ${t('add_staff')}</button>`;
}
async function setRole(uid_, role){
  const u = state.data.profiles.find(p=>p.id===uid_); if (!u) return;
  await dbUpsert('profiles', { ...u, role });
  audit('role_change', 'profile', uid_, { name: u.display_name, role });   // v1.07.18
  toast('✓ ' + t('saved')); render();
}
async function setCarNo(uid_, v){
  if (!isAdmin()) return;
  const u = state.data.profiles.find(p => p.id === uid_); if (!u) return;
  const n = String(v).trim() === '' ? null : Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  await dbUpsert('profiles', { ...u, car_no: n });
  audit('car_no_set', 'profile', uid_, { name: u.display_name, car_no: n });   // v1.07.25
  toast('✓ ' + t('saved'));
}
/* ---------- v1.07.06: блокировка сотрудника (красный перечёркнутый кружок) ---------- */
function rpcFail(error, fn){
  const s = errStr(error);
  return /does not exist|schema cache|42883|404/i.test(s) ? t('rpc_missing') + ` (${fn})` : s;
}
async function staffBlock(uid_){
  if (!isAdmin()) return;
  const u = state.data.profiles.find(p=>p.id===uid_); if (!u) return;
  if (u.id === state.user.id){ toast('⛔ ' + t('cant_self'), 'err'); return; }
  const want = !u.blocked;
  if (want && !confirm(t('block_confirm') + ' ' + u.display_name)) return;
  if (HAS_SB){
    // серверная часть: banned_until в auth + завершение сессий (RPC из schema.sql)
    const { error } = await state.sb.rpc('admin_set_blocked', { target: uid_, p_blocked: want });
    if (error){ dlog('⛔ admin_set_blocked:', error); toast('⚠ ' + rpcFail(error, 'admin_set_blocked'), 'err'); }
  }
  await dbUpsert('profiles', { ...u, blocked: want });   // флаг в profiles — приложение проверяет его при входе
  audit(want ? 'user_block' : 'user_unblock', 'profile', uid_, { name: u.display_name });   // v1.07.18
  navigator.vibrate?.(20);
  toast(want ? '🚫 ' + t('blocked_done') : '✓ ' + t('unblocked_done'));
  render();
}
/* ---------- v1.07.06: админ меняет пароль сотрудника ---------- */
function staffPassModal(uid_){
  const u = state.data.profiles.find(p=>p.id===uid_); if (!u) return;
  openModal(`
    ${modalHead(t('set_pass') + ' — ' + u.display_name, 'key')}
    ${HAS_SB ? '' : `<div class="note-green" style="margin-bottom:10px">${t('demo_only_sb')}</div>`}
    <div class="form-row"><span class="lbl">${t('new_pass')}</span>
      <input id="sp-pass" type="text" autocomplete="new-password" placeholder="••••••"></div>
    <button class="btn btn-green" onclick="App.staffSetPass('${u.id}')" ${HAS_SB?'':'disabled'}>${t('save')}</button>
  `);
  setTimeout(()=>$('#sp-pass')?.focus(), 50);
}
async function staffSetPass(uid_){
  if (!isAdmin() || !HAS_SB) return;
  const v = String($('#sp-pass').value || '');
  if (v.length < 6){ toast('⛔ ' + t('pass_short'), 'err'); return; }
  const { error } = await state.sb.rpc('admin_set_password', { target: uid_, new_password: v });
  if (error){ dlog('⛔ admin_set_password:', error); toast('⛔ ' + rpcFail(error, 'admin_set_password'), 'err'); return; }
  audit('password_reset', 'profile', uid_, { name: (state.data.profiles.find(p=>p.id===uid_)||{}).display_name || '' });   // v1.07.18
  closeModal(); toast('✓ ' + t('pass_changed'));
}
/* ---------- v1.07.07: админ создаёт сотрудника (логин, пароль, имя, роль) ---------- */
function staffAddModal(){
  if (!isAdmin()) return;
  openModal(`
    ${modalHead(t('add_staff'), 'crew')}
    <div class="form-row"><span class="lbl">${t('doc_name')}</span><input id="ns-name" autocomplete="off"></div>
    <div class="form-row"><span class="lbl">${t('staff_login_lbl')}</span><input id="ns-login" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="ivan.petrov"></div>
    <div class="form-row"><span class="lbl">${t('new_pass')}</span><input id="ns-pass" type="text" autocomplete="new-password" placeholder="••••••" ${HAS_SB?'':'disabled'}></div>
    ${HAS_SB ? '' : `<div class="tiny" style="margin:-4px 0 8px">${t('demo_only_sb')}</div>`}
    <div class="form-row"><span class="lbl">${t('role_tech')} / ${t('role_manager')} / ${t('role_admin')}</span>
      <select id="ns-role">
        ${['tech','manager','admin'].map(r=>`<option value="${r}">${t('role_'+r)}</option>`).join('')}
      </select></div>
    <button class="btn btn-green" onclick="App.staffCreate()">${t('save')}</button>
  `);
  setTimeout(()=>$('#ns-name')?.focus(), 50);
}
async function staffCreate(){
  if (!isAdmin()) return;
  const name  = String($('#ns-name').value || '').trim();
  const login = String($('#ns-login').value || '').trim().toLowerCase();
  const pass  = String($('#ns-pass').value || '');
  const role  = $('#ns-role').value;
  if (!LOGIN_RE.test(login)){ toast('⛔ ' + t('login_hint'), 'err'); return; }
  if (state.data.profiles.some(p => String(p.login).toLowerCase() === login)){ toast('⛔ ' + t('login_taken'), 'err'); return; }
  if (HAS_SB){
    if (pass.length < 6){ toast('⛔ ' + t('pass_short'), 'err'); return; }
    const { data, error } = await state.sb.rpc('admin_create_user', {
      p_login: login, p_email: loginToEmail(login), p_password: pass,
      p_display_name: name || login, p_role: role
    });
    if (error){
      dlog('⛔ admin_create_user:', error);
      const s = errStr(error);
      const msg = /LOGIN_TAKEN/.test(s) ? t('login_taken')
        : /BAD_LOGIN/.test(s) ? t('login_hint')
        : /WEAK_PASSWORD/.test(s) ? t('pass_short')
        : /BAD_EMAIL/.test(s) ? t('bad_email_cfg')
        : rpcFail(error, 'admin_create_user');
      toast('⛔ ' + msg, 'err'); return;
    }
    // локальный кэш: строка profiles уже создана на сервере — добавляем зеркально
    const row = { id: data, login, display_name: name || login, role, blocked: false, created_at: new Date().toISOString() };
    const i = state.data.profiles.findIndex(p=>p.id===row.id);
    if (i >= 0) state.data.profiles[i] = row; else state.data.profiles.push(row);
    saveLocal();
    audit('user_create', 'profile', row.id, { login, role, name: row.display_name });   // v1.07.18
    closeModal(); toast('✓ ' + t('staff_created'));
  } else {
    const nrow = { id: uid(), login, display_name: name || login, role, blocked: false, created_at: new Date().toISOString() };
    await dbUpsert('profiles', nrow);
    audit('user_create', 'profile', nrow.id, { login, role, name: nrow.display_name });   // v1.07.18
    closeModal(); toast('✓ ' + t('staff_created_demo'));
  }
  render();
}
/* ---------- v1.07.07: админ меняет код приглашения ---------- */
async function inviteSave(){
  if (!isAdmin()) return;
  const v = String($('#inv-code')?.value || '').trim();
  if (v.length < 2 || v.length > 64){ toast('⛔ ' + t('invite_short'), 'err'); return; }
  if (!HAS_SB){ toast('ℹ ' + t('demo_only_sb'), 'inf'); return; }
  const { error } = await state.sb.rpc('admin_set_invite', { new_code: v });
  if (error){ dlog('⛔ admin_set_invite:', error); toast('⛔ ' + rpcFail(error, 'admin_set_invite'), 'err'); return; }
  $('#inv-code').value = '';
  toast('✓ ' + t('invite_saved'));
}
/* ---------- v1.07.07: смена собственного пароля в настройках ---------- */
function ownPassModal(){
  openModal(`
    ${modalHead(t('my_pass_title'), 'key')}
    ${HAS_SB ? '' : `<div class="note-green" style="margin-bottom:10px">${t('demo_only_sb')}</div>`}
    <div class="form-row"><span class="lbl">${t('new_pass')}</span>
      <input id="op-pass" type="password" autocomplete="new-password" placeholder="••••••"></div>
    <div class="form-row"><span class="lbl">${t('pass_repeat')}</span>
      <input id="op-pass2" type="password" autocomplete="new-password" placeholder="••••••"></div>
    <button class="btn btn-green" onclick="App.ownPassSave()" ${HAS_SB?'':'disabled'}>${t('save')}</button>
  `);
  setTimeout(()=>$('#op-pass')?.focus(), 50);
}
async function ownPassSave(){
  if (!HAS_SB) return;
  const v1 = String($('#op-pass').value || ''), v2 = String($('#op-pass2').value || '');
  if (v1.length < 6){ toast('⛔ ' + t('pass_short'), 'err'); return; }
  if (v1 !== v2){ toast('⛔ ' + t('pass_mismatch'), 'err'); return; }
  const { error } = await state.sb.auth.updateUser({ password: v1 });
  if (error){ dlog('⛔ auth.updateUser:', error); toast('⛔ ' + errStr(error), 'err'); return; }
  audit('password_change', 'profile', state.user.id, {});   // v1.07.18
  closeModal(); toast('✓ ' + t('own_pass_changed'));
}
function staffVis(managerId){
  const m = state.data.profiles.find(p=>p.id===managerId); if (!m) return;
  const hid = hiddenSetFor(managerId);
  const others = state.data.profiles.filter(p => p.id !== managerId);
  openModal(`
    ${modalHead(t('vis_btn') + ' — ' + m.display_name, 'eye')}
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
  const editable = isManager() || j.technician_id === state.user.id;   // v1.07.10: коворкер не меняет состав бригады
  return ids.map((id, i) => {
    const pr = state.data.profiles.find(p=>p.id===id);
    const nm = pr ? shortName(pr.display_name) : '?';
    const primary = i === 0;
    return `<span class="chip-tech ${primary?'primary':''}">
      ${esc(nm)}${(primary || !editable) ? '' : ` <button class="x" onclick="App.crewRemove('${id}')" aria-label="remove">✕</button>`}
    </span>`;
  }).join('');
}
function crewRefresh(){
  const box = $('#crew-chips'); if (box && jobDraft) box.innerHTML = crewChipsHtml(jobDraft);
  const sel = $('#crew-sel');
  if (sel && jobDraft){
    sel.innerHTML = `<option value="">${t('add_helper')}</option>` +
      state.data.profiles.filter(p=>!p.blocked && p.id!==jobDraft.technician_id && !(jobDraft.helper_ids||[]).includes(p.id))
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
  jobDraft.helper_ids = state.data.profiles.filter(p=>!p.blocked).map(p=>p.id).filter(id => id !== jobDraft.technician_id);
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
  const q = (cx.address && cx.address.trim()) ? cx.address : ((cx.lat!=null && cx.lng!=null) ? `${cx.lat},${cx.lng}` : cx.name); // v1.07.26: адрес, а не безымянная точка
  window.open(navDirUrl(q), '_blank', 'noopener');   // v1.07.21: Apple Maps на iOS / Google на остальных
}
function copyText(s){
  navigator.clipboard?.writeText(s).then(()=>{ navigator.vibrate?.(20); toast('✓ ' + t('copied_code')); });
}
/* v1.07.05: копирование адреса комплекса из строки на главном экране */
function copyCxAddr(cxId){
  const cx = cxById(cxId); if (!cx || !cx.address) return;
  navigator.clipboard?.writeText(cx.address).then(()=>{ navigator.vibrate?.(20); toast('✓ ' + t('copied_addr')); });
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
  /* v1.07.21: iOS-диагностика */
  put(`платформа: ${IS_IOS ? 'iOS/iPadOS' : 'не-iOS'} · установлено на экран: ${isStandalone() ? 'да' : 'нет'} · навигатор: ${navName()}`);
  try{
    const raw = localStorage.getItem(LS_KEY) || '';
    put(`кеш localStorage: ${(raw.length/1024).toFixed(0)} КБ (лимит Safari ~5 МБ) · очередь записей: ${pendingLoad().length}`);
  }catch(e){}
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
    ${modalHead(t('diag'), 'steth')}
    <pre class="diag-pre">${esc(report)}</pre>
    <button class="btn btn-blue" onclick="App.copyDiag()">${ic('clipboard')} ${t('diag_copy')}</button>
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
   v1.07.23: подсказка установки на iPhone/iPad.
   На iOS нет события beforeinstallprompt и системного диалога установки —
   WebKit их не реализует, это ограничение платформы, а не приложения.
   Установка PWA на iOS идёт вручную из браузера («Поделиться → На экран
   “Домой”»), App Store не участвует. Максимум, что может приложение, —
   вовремя и понятно это подсказать: баннер на главной + модалка с шагами.
   ===================================================================== */
function a2hsShow(){
  try{ return IS_IOS && !isStandalone() && !localStorage.getItem('techlog_a2hs_hide'); }
  catch(e){ return false; }
}
function a2hsHide(){
  try{ localStorage.setItem('techlog_a2hs_hide', '1'); }catch(e){}
  render();
}
function a2hsModal(){
  openModal(`
    ${modalHead(t('a2hs_title'), 'phone')}
    <div class="a2hs-steps">
      <div class="a2hs-step"><span class="n">1</span><div><b>${t('a2hs_step1')}</b> ${ic('ioshare')}<div class="tiny">${t('a2hs_step1n')}</div></div></div>
      <div class="a2hs-step"><span class="n">2</span><div><b>${t('a2hs_step2')}</b><div class="tiny">${t('a2hs_step2n')}</div></div></div>
      <div class="a2hs-step"><span class="n">3</span><div><b>${t('a2hs_step3')}</b><div class="tiny">${t('a2hs_step3n')}</div></div></div>
    </div>
    <div class="tiny" style="margin-top:10px">${t('a2hs_note')}</div>
    <button class="btn btn-ghost" style="margin-top:12px" onclick="App.closeModal()">${t('close')}</button>`);
}

/* =====================================================================
   v1.04: FAQ · перевод заметки на EN · свайпы по дням · журнал · БД-диагностика
   ===================================================================== */

/* ---------- Мини-FAQ ---------- */
function faqHtml(){
  if (state.lang === 'en') return `
    <h4>${ic('compass')} How it works</h4>
    <p>One job = one unit in an apartment complex. Tap <b>＋</b>, pick date → counterparty → complex → unit → work type. Inside the job you check the services — prices fill in automatically and the total recalculates live. Mark it done; an admin can approve it (editing the final amount). If a non-admin changes the price after approval, the approval is reset. The <b>PDF</b> button builds an invoice that mirrors the paper form.</p>
    <h4>${ic('book')} Directories</h4>
    <p><b>Counterparties</b> — apartment networks. <b>Complexes</b> — their properties: address, gate code, map coordinates. <b>Work types</b> — name, color and the extra gear it requires. <b>Equipment</b> — rental units (BLW, DHM, SCR, OZN) with a $/day price. <b>Extra gear</b> — what to bring along. <b>PRICE</b> — the standard price list. <b>Staff</b> (admin) — roles and per-manager visibility.</p>
    <h4>${ic('dollar')} Standard vs individual prices</h4>
    <p>Directories → <b>Prices</b> has two tabs. <b>Standard</b> — the default price list for everyone. <b>Individual</b> — pick a counterparty from the dropdown, tick the checkbox next to a line to switch it to an individual price and type your value; untick — the standard price applies again. The same prices are also editable inside the counterparty card. A new counterparty automatically receives a copy of the standard list.</p>
    <h4>${ic('archive')} Reports</h4>
    <p>Per <b>unit</b>: open the job and press PDF — a <b>vertical blank</b> (like the paper half-sheet) centered on a Letter page. Per <b>period</b>: bottom tab <b>Reports</b> → pick the dates → one PDF, landscape Letter with <b>two vertical blanks side by side</b> and a cut line between them. Managers also get the <b>Pickups</b> report for any date.</p>
    <h4>${ic('warn')} Priority & ordering</h4>
    <p>The queue number sits in the <b>top-left</b> corner of a card, the red <b>“!” triangle</b> — in the <b>top-right</b> (priority items float to the top; tapping the triangle toggles it). Reorder with the <b>▲▼</b> arrows on the left, or by gesture: <b>press & hold</b> a card for ~half a second and drag it up/down (with a mouse just grab and drag — no hold needed). The order is shared between jobs and pickups. The full address is shown on the card — the button next to it copies it, and the ${ic('key')}/${ic('callbox')} codes are copied with a tap.</p>
    <h4>${ic('key')} Access codes & requests</h4>
    <p>A complex has two codes: ${ic('key')} general and ${ic('callbox')} callbox (a toggle marks it as the ${ic('gate')} <b>gate</b> code). Anyone can edit: admins apply instantly, others submit a <b>request</b> the admin approves or rejects (inbox at the top of the Complexes tab). The ${ic('book')} button shows the full <b>history</b> — who entered which code and when; next to the current code you see since when it’s valid and who added it.</p>
    <h4>${ic('toolbox')} Note templates & purchases</h4>
    <p>In the Note block, <b>＋ Template</b> inserts items from the “Extra works” directory: a work flagged with a size shows an input in the right units (${ic('ruler')} “Sizes”: ft, sq ft, lb, pcs), while “${ic('cart')} Purchase” opens the “Products” list with quantity and a <b>price</b> that flows into the total and prints as its own PDF line. All three directories are admin-managed.</p>
    <h4>${ic('box')} Automatic pickups</h4>
    <p>Fill <b>Equipment Rental</b> (qty × days) and save — the app creates pickups due on <i>job date + days</i> (72 h by default). On the due day they appear on Home with colored equipment dots and a banner; overdue ones turn red. <b>Tap a pickup card</b> to open the details: what to collect and how much, where from (address, codes, route), plus buttons “Open invoice”, “Job history”, “Pick up all” and <b>“Extend rental”</b> — all units or selected ones, with a day stepper (1 by default); the extension appears on the new day as a separate pickup with an “extension” chip. <b>Job history</b> (the button is also inside the invoice) shows the whole chain: the invoice with its dates, pickups and extensions with statuses; any pending line can be <b>collected early</b> via “Pick up now” — that’s how both a pickup and an extension are cancelled ahead of time. Everything can be shown on the <b>day map</b> with a route in your navigation app (Apple Maps or Google Maps — see Settings).</p>
    <h4>${ic('eye')} Roles & access</h4>
    <p><b>Tech</b> sees only their own jobs and pickups. <b>Manager</b> sees everyone (minus those hidden via ${ic('eye')} <b>Visibility</b>), has the Mine/All filter and the pickups report. <b>Admin</b> can do everything: approve, edit directories, manage <b>Staff</b> — roles, ${ic('ban')} <b>blocking</b> (a blocked employee can’t sign in; the red crossed circle toggles it), ${ic('key')} <b>password reset</b> for an employee who forgot theirs, plus code requests. The admin also <b>creates employees</b> right there: the “＋ Add employee” button — name, login, password and role; they can sign in immediately. The list shows each person’s status (Active/Blocked) and the date they joined the app.</p>
    <h4>${ic('receipt')} Statuses & approval</h4>
    <p>A job goes <b>Draft → Done → Approved</b>. Only an admin approves and may adjust the final amount. If a non-admin changes the price after approval, the approval is reset automatically. A yellow <b>“!”</b> means required fields are missing (complex, unit, at least one performer) — the PDF is blocked until they’re filled, and batch reports skip such jobs.</p>
    <h4>${ic('calendar')} Week feed & day cards</h4>
    <p>The 7-day strip shows colored dots per work type, a gray dot for pickups and a small “!” on dates with unfinished required fields; today’s cell is outlined in green and labeled “today”; the <b>⌂ Today</b> button returns to it from any week. Under the strip: the <b>day cards</b> (jobs by work type and pickups by equipment — see the next section) and the <b>day map</b> button. On a card the queue number is top-left, the priority triangle top-right, the address is shown in full with a copy button, and access/callbox codes copy with a tap. To the right of the Mine/All filter there is a <b>search box</b>: type a unit, complex, address or name to get results across all dates with an “Invoices | Pickups” toggle; tapping a result opens the invoice, the pickup modal or the history. Clicking the <b>TL logo</b> returns Home, and clicking the app name with the version checks for updates.</p>
    <h4>${ic('chart')} Day cards under the strip</h4>
    <p>Two cards summarize the <b>day selected in the strip</b> (today by default). Left — <b>jobs</b>: the big number is the day’s total, below it a breakdown by work type, each labeled in its own color. Right — <b>pickups</b>: the big number is how many equipment units must be collected that day; each icon is an equipment type (its abbreviation inside the circle: BLW — blower, DHM — dehumidifier, SCR — air scrubber, OZN — ozone machine), the number under the icon — how many units. A red “overdue” chip appears when something should have been collected earlier and still wasn’t. A sample day:</p>
    <div class="faq-example">${faqDayCardsExample()}</div>
    <p>Reading the sample: <b>7 jobs</b> are planned — Steam Clean 4, Air Duct 2, Vetvag 1. <b>8 equipment units</b> to collect — 5 blowers (BLW), 2 dehumidifiers (DHM) and 1 air scrubber (SCR) — and one pickup is already overdue. The numbers come from the same lists shown below on the screen: flip the strip to another day and the cards recalculate; for managers they respect the Mine/All filter.</p>
    <h4>${ic('refresh')} Sync, offline & updates</h4>
    <p>Data lives in <b>Supabase</b>; the ${ic('refresh')} button in the header syncs manually, the last sync time is under Settings. The app is a <b>PWA</b>: installable on Android and iPhone (see the iPhone section below), works offline from cache, checks <i>version.json</i> on launch and updates itself (if an invoice form is open, the update waits until it’s closed). With an empty <i>config.js</i> it runs in a local demo mode.</p>
    <h4>${ic('phone')} iPhone & iPad (iOS)</h4>
    <p><b>Install:</b> in Safari tap <b>Share → “Add to Home Screen”</b> — unlike Android there is no automatic prompt, so the app shows its own banner with step-by-step instructions on the Home screen (and a button in Settings). Sign in again after installing: the Home-Screen app has <b>its own storage</b>, separate from the Safari tab. Installing is worth it: Safari wipes a site’s local data (session, offline cache, an unsaved draft) after <b>7 days</b> of using the browser without visiting the site, while the installed app keeps them for as long as you use it; don’t work in Private Browsing — nothing there survives closing the tab. <b>Routes</b> open in <b>Apple Maps</b>: the multi-stop “Day route” needs iOS 18.4+, older systems open only the final stop — a limitation of Apple’s URL scheme; if you prefer Google Maps, switch in Settings → “Navigation app”. <b>PDF invoices</b> (single and batch) go through the system <b>Share sheet</b> — “Save to Files”, AirDrop or mail; inside an installed web-app this is the only reliable way. <b>Dictation:</b> the in-app mic button is hidden on iOS — use the <b>🎤 key on the keyboard</b>, it types RU and EN into any field; the “Translate to EN” button works as usual. <b>Minimizing is safe:</b> iOS freezes background apps aggressively, so every save goes into a queue and is re-sent automatically when you return to the app, the network comes back or a sync runs — the queue counter shows in Settings and Diagnostics. There is no vibration feedback — iOS doesn’t allow it for web apps.</p>
    <h4>${ic('map')} Map</h4>
    <p>The Map tab shows every complex as a dot colored by counterparty, with a filter and a popup (address, codes, a route link). <b>Day mode</b> plots the selected date’s jobs (work-type colors) and pickups (gray, red when overdue) and builds a multi-stop <b>route</b> in your navigation app — Apple Maps on iPhone/iPad (multistop needs iOS 18.4+) or Google Maps; pick one in Settings → “Navigation app”. Coordinates are set in the complex card — “Find by address” or manually.</p>
    <h4>${ic('chart')} Statistics</h4>
    <p>The Stats tab: period chips (today/7/30 days or custom), Mine/All, big totals (jobs, revenue, approved, pickups) and a per-day bar chart.</p>
    <h4>${ic('mic')} Notes, dictation & translation</h4>
    <p>Every job and pickup has a note. The ${ic('mic')} microphone dictates in RU or EN (Chrome/Android; on iPhone — the 🎤 key on the keyboard, see the iPhone section), text is editable by hand, and the note prints on the PDF as the <b>NOTES</b> line. One tap translates a Russian note to English.</p>
    <h4>${ic('wrench')} Account, settings & service</h4>
    <p>Sign in with a login (Latin, 3–32 chars) and password; sign-up needs the <b>invite code</b> (set by the admin in Settings, default — APC). You change your own password under Settings → “Change password”; if you’re blocked or forgot it, the admin helps in Staff. Settings: UI language RU/EN (PDF is always EN), your display name, app install, event <b>log</b>, <b>diagnostics</b> (and DB diagnostics for admin). Android back button: closes a modal, saves and exits an open form, double-press exits the app.</p>`;
  return `
    <h4>${ic('compass')} Как всё устроено</h4>
    <p>Одна работа = один юнит в апарт-комплексе. Жмёте <b>＋</b>, выбираете дату → контрагента → комплекс → юнит → вид работы. Внутри работы отмечаете услуги галочками — цены подставляются сами, итог пересчитывается на лету. Отметили «выполнено» — админ может поставить апрув (с правкой итоговой суммы). Если после апрува не-админ меняет стоимость — апрув снимается. Кнопка <b>PDF</b> собирает инвойс, повторяющий бумажную форму.</p>
    <h4>${ic('book')} Какие есть справочники</h4>
    <p><b>Контрагенты</b> — сети апартаментов. <b>Комплексы</b> — их объекты: адрес, код доступа, координаты для карты. <b>Виды работ</b> — название, цвет и нужное доп. оборудование. <b>Оборудование</b> — то, что сдаётся в аренду (BLW, DHM, SCR, OZN) с ценой $/сутки. <b>Доп. оборудование</b> — что взять с собой на выезд. <b>PRICE</b> — стандартный прейскурант. <b>Сотрудники</b> (админ) — роли и видимость для менеджеров.</p>
    <h4>${ic('dollar')} Стандартные и индивидуальные цены</h4>
    <p>Справочники → <b>Цены</b>: две вкладки. <b>Стандартные</b> — базовый прейскурант для всех. <b>Индивидуальные</b> — выбираете контрагента в выпадающем списке, чекбокс напротив позиции включает индивидуальную цену — вводите свою; сняли галочку — снова действует стандартная. Те же цены доступны и в карточке контрагента. Новому контрагенту прайс копируется автоматически.</p>
    <h4>${ic('archive')} Отчёты</h4>
    <p>За <b>юнит</b>: откройте работу и нажмите PDF — это <b>вертикальный бланк</b> (как бумажная половинка), по центру листа Letter. За <b>период</b>: нижняя вкладка <b>Отчёты</b> → выбираете даты → единый PDF: альбомный Letter, <b>два вертикальных бланка рядом</b> и линия отреза между ними. Менеджеру доступен и отчёт по <b>пикапам</b> на любую дату.</p>
    <h4>${ic('warn')} Приоритет и очерёдность</h4>
    <p>Номер очереди — в <b>левом верхнем</b> углу карточки, красный <b>треугольник «!»</b> приоритета — в <b>правом верхнем</b> (приоритетные всегда вверху списка, тап по треугольнику включает/выключает приоритет). Изменить порядок можно стрелками <b>▲▼</b> слева или жестом: <b>удерживайте карточку</b> ~полсекунды и тяните вверх/вниз (мышью — просто хватайте и тяните, удержание не нужно). Порядок общий для работ и пикапов. Адрес на карточке показан целиком — кнопка рядом копирует его в буфер, коды ${ic('key')}/${ic('callbox')} копируются тапом.</p>
    <h4>${ic('key')} Коды доступа и заявки</h4>
    <p>У комплекса два кода: ${ic('key')} общий и ${ic('callbox')} callbox (переключателем помечается, что это код от ${ic('gate')} <b>ворот</b>). Изменить может каждый: админ — сразу, остальные отправляют <b>заявку</b>, которую админ подтверждает или отклоняет (входящие — вверху вкладки «Комплексы»). Кнопка ${ic('book')} показывает <b>историю</b> изменений: кто, когда и какой код вводил; рядом с текущим кодом видно, с какой даты он действует и кто его добавил.</p>
    <h4>${ic('toolbox')} Шаблоны заметки и покупки</h4>
    <p>В блоке «Заметка» кнопка <b>＋ Шаблон</b> подставляет позиции из справочника «Доп. работы»: у работы с флагом размера появляется поле в нужных единицах (${ic('ruler')} «Размеры»: футы, sq ft, паунды, штуки), а «${ic('cart')} Покупка товара» открывает выбор из справочника «Товары», количество и <b>цену</b> — она попадает в итог и печатается в PDF отдельной строкой. Все три справочника редактирует администратор.</p>
    <h4>${ic('box')} Пикапы формируются сами</h4>
    <p>Заполните <b>Equipment Rental</b> (кол-во × дни) и сохраните — приложение создаст пикапы со сроком <i>дата работы + дни</i> (по умолчанию 72 часа). В день срока они появятся на «Главной» с цветными кружками оборудования и баннером; просроченные подсвечиваются красным. <b>Тап по карточке пикапа</b> открывает подробности: что и сколько вывозить, откуда (адрес, коды, маршрут), кнопки «Открыть инвойс», «История работы», «Забрать всё» и <b>«Продлить аренду»</b> — целиком или выборочно, степпером выбираете количество дней (по умолчанию 1), и задача-продление появляется в новый день как отдельный пикап с чипом «продление». В <b>истории работы</b> (кнопка есть и в инвойсе) видна вся цепочка: инвойс с датами, пикапы и продления со статусами; любую ожидающую строку можно <b>забрать досрочно</b> кнопкой «Забрать сейчас» — так аннулируются и пикап, и продление. Всё это выводится на <b>карту дня</b> с маршрутом в навигаторе (Apple Maps или Google Maps — см. Настройки).</p>
    <h4>${ic('eye')} Роли и доступ</h4>
    <p><b>Сотрудник (tech)</b> видит только свои работы и пикапы. <b>Менеджер</b> — всех (кроме скрытых через ${ic('eye')} <b>Видимость</b>), у него есть фильтр «Мои/Все» и отчёт по пикапам. <b>Админ</b> может всё: апрув, справочники, управление <b>Сотрудниками</b> — роли, ${ic('ban')} <b>блокировка</b> (заблокированный не сможет войти; красный перечёркнутый кружок включает и снимает блокировку), ${ic('key')} <b>смена пароля</b> сотруднику, если тот его забыл, а также заявки на коды. Там же админ <b>создаёт сотрудников</b>: кнопка «＋ Добавить сотрудника» — имя, логин, пароль и роль, вход возможен сразу. В списке виден статус каждого (Активен/Заблокирован) и дата регистрации в приложении.</p>
    <h4>${ic('receipt')} Статусы и апрув</h4>
    <p>Работа проходит путь <b>Черновик → Выполнено → Апрув</b>. Апрув ставит только админ и может поправить итоговую сумму. Если после апрува не-админ меняет стоимость — апрув снимается автоматически. Жёлтый <b>«!»</b> — не заполнены обязательные поля (комплекс, юнит, хотя бы один исполнитель): PDF не сформируется, а в пакетном отчёте такая работа будет пропущена.</p>
    <h4>${ic('calendar')} Лента недели и карточки дня</h4>
    <p>Лента из 7 дней показывает цветные точки по видам работ, серую точку пикапов и маленький «!» на датах с незаполненными полями; сегодняшний день подсвечен зелёной рамкой и подписан «сегодня», кнопка <b>⌂ Сегодня</b> возвращает к нему из любой недели. Под лентой — <b>карточки дня</b> (работы по видам и пикапы по оборудованию — подробно в следующем разделе) и кнопка <b>карты дня</b>. На карточке: номер очереди слева-сверху, треугольник приоритета справа-сверху, адрес целиком с кнопкой копирования, коды доступа/callbox копируются тапом. Справа от фильтра «Мои/Все» — <b>поиск</b>: введите юнит, комплекс, адрес или имя, и по всем датам появятся результаты с переключателем «Инвойсы | Пикапы»; тап по результату открывает инвойс, модалку пикапа или историю. Клик по <b>логотипу TL</b> возвращает на главную, а по названию с версией — проверяет обновления.</p>
    <h4>${ic('chart')} Карточки дня под лентой</h4>
    <p>Две карточки — сводка по <b>выбранному в ленте дню</b> (при открытии приложения это сегодня). Слева — <b>работы</b>: большая цифра — сколько всего работ на день, под ней разбивка по видам, каждый вид подписан своим цветом. Справа — <b>пикапы</b>: большая цифра — сколько единиц оборудования нужно забрать в этот день; каждая иконка — тип оборудования (внутри кружка его сокращение: BLW — блоуэр, DHM — осушитель, SCR — скруббер, OZN — озонатор), под иконкой — количество единиц. Красная плашка «просрочено» появляется, если что-то должны были забрать раньше, но ещё не забрали. Вот пример одного дня:</p>
    <div class="faq-example">${faqDayCardsExample()}</div>
    <p>Читаем пример: на день запланировано <b>7 работ</b> — Steam Clean 4, Air Duct 2, Vetvag 1. Забрать нужно <b>8 единиц оборудования</b> — 5 блоуэров (BLW), 2 осушителя (DHM) и 1 скруббер (SCR), при этом один пикап уже просрочен. Цифры считаются по тем же спискам, что показаны ниже на экране: листаете ленту на другой день — карточки пересчитываются, а у менеджера они подчиняются фильтру «Мои/Все».</p>
    <h4>${ic('refresh')} Синхронизация, офлайн и обновления</h4>
    <p>Данные живут в <b>Supabase</b>; кнопка ${ic('refresh')} в шапке синхронизирует вручную, время последней синхронизации — в «Настройках». Приложение — <b>PWA</b>: ставится на Android и iPhone (см. раздел про iPhone ниже), работает офлайн из кеша, при запуске проверяет <i>version.json</i> и обновляется само (если открыта форма инвойса — обновление подождёт её закрытия). С пустым <i>config.js</i> работает локальный демо-режим.</p>
    <h4>${ic('phone')} iPhone и iPad (iOS)</h4>
    <p><b>Установка:</b> в Safari «Поделиться» → <b>«На экран “Домой”»</b> — автоматической подсказки, как на Android, здесь нет, поэтому приложение само показывает баннер с пошаговой инструкцией на главном экране (и кнопку в Настройках). После установки войдите заново: у приложения на «Домой» <b>своё хранилище</b>, отдельное от вкладки Safari. Ставить стоит: вкладка Safari стирает локальные данные сайта (сессию, офлайн-кеш, несохранённый черновик) после <b>7 дней</b> пользования браузером без захода в TechLog, а установленное приложение хранит их, пока вы им пользуетесь; в приватном режиме не работайте — там ничего не переживает закрытия вкладки. <b>Маршруты</b> открываются в <b>Картах Apple</b>: мультиточечный «Маршрут дня» — с iOS 18.4, более старые системы откроют только конечную точку — это ограничение URL-схемы Apple; привычнее Google Maps — переключите в Настройках → «Навигатор». <b>PDF-инвойсы</b> (одиночные и пакетные) уходят через системное окно <b>«Поделиться»</b> — «Сохранить в Файлы», AirDrop, почта; в установленном веб-приложении это единственный надёжный путь. <b>Диктовка:</b> своя кнопка микрофона на iOS скрыта — используйте <b>🎤 на клавиатуре</b> iPhone, она печатает RU и EN в любое поле; кнопка «Перевести на EN» работает как обычно. <b>Сворачивать не страшно:</b> iOS жёстко замораживает фоновые приложения, поэтому каждое сохранение попадает в очередь и досылается само при возврате в приложение, появлении сети или синхронизации — счётчик очереди виден в Настройках и Диагностике. Вибрации нет — iOS не даёт её веб-приложениям.</p>
    <h4>${ic('map')} Карта</h4>
    <p>Вкладка «Карта» показывает все комплексы точками в цвет контрагента, с фильтром и попапом (адрес, коды, ссылка на маршрут). <b>Режим дня</b> выводит работы выбранной даты (цвет вида работы) и пикапы (серые, красные при просрочке) и строит мультиточечный <b>маршрут</b> в навигаторе — Карты Apple на iPhone/iPad (мультистоп с iOS 18.4) или Google Maps; выбор в Настройках → «Навигатор». Координаты задаются в карточке комплекса — «Найти по адресу» или вручную.</p>
    <h4>${ic('chart')} Статистика</h4>
    <p>Вкладка «Статистика»: чипы периода (сегодня/7/30 дней или свой), «Мои/Все», крупные итоги (работы, выручка, апрувы, пикапы) и график по дням.</p>
    <h4>${ic('mic')} Заметки, диктовка и перевод</h4>
    <p>У каждой работы и пикапа есть заметка. Микрофон ${ic('mic')} диктует на RU или EN (Chrome/Android; на iPhone — кнопкой 🎤 на клавиатуре, см. раздел про iPhone), текст правится руками и печатается в PDF строкой <b>NOTES</b>. Одним нажатием русскую заметку можно перевести на английский.</p>
    <h4>${ic('wrench')} Аккаунт, настройки и сервис</h4>
    <p>Вход — логин латиницей (3–32 символа) и пароль; для регистрации нужен <b>код приглашения</b> (задаёт админ в «Настройках», стандартный — APC). Свой пароль меняется в «Настройках» → «Смена пароля»; если вас заблокировали или пароль забыт — поможет админ во вкладке «Сотрудники». В «Настройках»: язык интерфейса RU/EN (PDF всегда на английском), ваше имя, установка приложения, <b>журнал</b> событий, <b>диагностика</b> (и БД-диагностика для админа). Кнопка «назад» на Android: закрывает модалку, сохраняет и закрывает открытую форму, двойное нажатие — выход из приложения.</p>`;
}
function faqModal(){
  openModal(`
    ${modalHead(t('faq'), 'help')}
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
  const txt = PLOG.slice(-2000).join('\n') || '—';
  window.__lastLog = txt;
  openModal(`
    ${modalHead(t('log_title'), 'receipt')}
    <pre class="diag-pre">${esc(txt)}</pre>
    <button class="btn btn-blue" onclick="App.copyLog()">${ic('clipboard')} ${t('diag_copy')}</button>
    <button class="btn btn-red" style="margin-top:8px" onclick="App.clearLog()">${ic('trash')} ${t('clear')}</button>
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
        const denied = tb === 'app_secrets';   // v1.07.35: секреты закрыты RLS — отказ это норма
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
    ${modalHead(t('db_diag'), 'archive')}
    <pre class="diag-pre">${esc(report)}</pre>
    <button class="btn btn-blue" onclick="App.copyDiag()">${ic('clipboard')} ${t('diag_copy')}</button>
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
  const j = state.data.jobs.find(x=>x.id===id); if (!j || !canPrio(j)) return;
  try { await saveJobPatch(j, { priority: !j.priority }); }
  catch(e){ toast('⛔ ' + rpcFail(e, 'board_job_flags'), 'err'); return; }
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
      if (canReorder(jj)){ try{ await saveJobPatch(jj, { sort_order: so }); }catch(e){ toast('⛔ ' + rpcFail(e, 'board_job_flags'), 'err'); break; } }
      else jj.sort_order = so; // чужие — только локально для отображения
    }
  }
  navigator.vibrate?.(15);
  render();
}

/* =====================================================================
   v1.07.25: ДОСКА — день по сотрудникам (менеджер/админ)
   ===================================================================== */
function boardCanReorder(){ return isAdmin() || (state.user.role === 'manager' && mgrReorderOn()); }
function viewBoard(){
  if (!isManager()) return `<div class="card" style="margin:14px 12px">${t('b_only')}</div>`;
  const iso = state.selDate;
  const hid = state.user.role === 'manager' ? hiddenSetFor(state.user.id) : new Set();
  const dayJobs = state.data.jobs.filter(j => j.date === iso && !hid.has(j.technician_id));
  const dayPk   = state.data.placements.filter(p => pkPending(p) && p.due_date <= iso && !hid.has(p.technician_id));
  const hideEmpty = localStorage.getItem('tl_board_hide_empty') === '1';   // v1.07.30
  const staff = [...state.data.profiles]
    .filter(p => {
      if (p.blocked || hid.has(p.id)) return false;
      const busy = dayJobs.some(j => j.technician_id === p.id) || dayPk.some(x => x.technician_id === p.id);
      return busy || (p.role === 'tech' && !hideEmpty);
    })
    .sort((a,b) => (a.car_no ?? 999) - (b.car_no ?? 999) || a.display_name.localeCompare(b.display_name));
  const canOrd = boardCanReorder();
  const cols = staff.map(p => {
    const js  = dayJobs.filter(j => j.technician_id === p.id).sort(jobSortCmp);
    const pls = dayPk.filter(x => x.technician_id === p.id);
    const byJob = {};
    pls.forEach(x => { (byJob[x.job_id] = byJob[x.job_id] || []).push(x); });
    const cards = js.map((j, i) => boardJobCard(j, i, canOrd)).join('')
                + Object.entries(byJob).map(([jid, arr]) => boardPkCard(jid, arr, iso)).join('');
    return `<div class="bcol">
      <div class="bcol-h">
        <span class="avatar role-${p.role}">${esc(initials(p.display_name))}</span>
        <div class="grow"><b>${esc(shortName(p.display_name))}</b>${p.car_no != null ? ` <span class="car-no" title="${t('car_no')}">${p.car_no}</span>` : ''}
          <div class="tiny">${js.length} ${t('b_jobs')} · ${pls.length} ${t('b_pk')}</div></div>
      </div>
      ${cards || `<div class="tiny bempty">${t('b_empty')}</div>`}
    </div>`;
  }).join('');
  const tools = `<div class="board-tools"><label class="opt ${hideEmpty?'on':''}">
    <input type="checkbox" ${hideEmpty?'checked':''} onchange="App.boardHideEmpty(this.checked)"> ${t('b_hide_empty')}</label></div>`;
  return viewWeek() + extReqStripHtml() + propStripHtml() + tools + `<div class="board">${cols}</div>`;
}
function boardJobCard(j, idx, canOrd){
  const wt = wtById(j.work_type_id), cx = cxById(j.complex_id);
  const col = (wt && wt.color) || '#8AA0AB';
  const rail = canOrd ? `<div class="rail brail" onclick="event.stopPropagation()">
      <button class="mv" title="${t('move_up')}" onclick="App.boardMove('${j.id}',-1)">▲</button>
      <button class="mv" title="${t('move_down')}" onclick="App.boardMove('${j.id}',1)">▼</button>
    </div>` : '';
  return `<div class="bjob clicky" style="border-left-color:${col}" onclick="App.openJob('${j.id}')">
    ${rail}
    <span class="bnum">${idx + 1}</span>
    ${triHtml(!!j.priority, j.id, canPrio(j))}
    <div class="bmain"><b>${esc(j.unit_number || '—')}</b>${proposalChipHtml(j, true)}<span class="tiny"> · ${esc((cx && (cx.abbr || cx.name)) || '—')}</span>
      <div class="tiny bwt"><span class="dotc" style="background:${col}"></span>${esc((wt && wt.name) || '')}</div></div>
    <span class="bst st-${j.status}" title="${t('status_' + j.status)}"></span>
  </div>`;
}
function boardPkCard(jobId, arr, iso){
  const today = todayISO();
  const over = arr.some(p => p.due_date < today);
  const ext  = arr.some(p => p.ext_of);
  const due  = arr.map(p => p.due_date).sort()[0];
  const agg = {};
  arr.forEach(p => { const e = etById(p.equipment_type_id); const k = e ? e.abbr : '?'; agg[k] = (agg[k] || 0) + (+p.qty || 1); });
  const eq = Object.entries(agg).map(([k, q]) => `${k}×${q}`).join(' ');
  return `<div class="bpk clicky ${over ? 'over' : ''}" onclick="App.pickupModal('${jobId}','${iso}',event)">
    <b>PU</b> ${esc(eq)}${ext ? ` <span class="bext" title="${t('b_ext')}">⟳</span>` : ''}
    <span class="tiny">${over ? `${t('b_over')} · ` : ''}${fmtDMY(due)}</span>
  </div>`;
}
async function boardMove(id, dir){
  if (!boardCanReorder()) return;
  const j = state.data.jobs.find(x => x.id === id); if (!j) return;
  const list = state.data.jobs
    .filter(x => x.date === state.selDate && x.technician_id === j.technician_id)
    .sort(jobSortCmp);
  const i = list.findIndex(x => x.id === id), k = i + dir;
  if (i < 0 || k < 0 || k >= list.length) return;
  [list[i], list[k]] = [list[k], list[i]];
  for (let n = 0; n < list.length; n++){
    if ((list[n].sort_order || 0) !== n){
      try { await saveJobPatch(list[n], { sort_order: n }); }
      catch(e){ toast('⛔ ' + rpcFail(e, 'board_job_flags'), 'err'); return; }
    }
  }
  navigator.vibrate?.(15);
  render();
}

/* =====================================================================
   v1.07.27: ПРОПОЗАЛЫ — коммерческие предложения (менеджер/админ)
   ===================================================================== */
let propDraft = null;
function allowTechProposal(){ return (state.data.org_settings || {}).allow_tech_proposal_flag !== false; }
function propById(id){ return (state.data.proposals || []).find(x => x.id === id); }
function proposalChipHtml(j, short){
  const p = j && j.proposal_id ? propById(j.proposal_id) : null;
  if (p) return ` <span class="chip pr" title="PROPOSAL">${short ? 'P' : 'P-' + (p.no ?? '·')}</span>`;
  if (j && j.has_proposal) return ` <span class="chip prq" title="${t('prop_requested')}">P?</span>`;
  return '';
}
function proposalBoxHtml(j){
  const p = j.proposal_id ? propById(j.proposal_id) : null;
  if (isManager()){
    let inner;
    if (p){
      inner = `<span class="chip pr">P-${p.no ?? '·'} · ${money(+p.total || 0)}</span>
        <button class="btn btn-ghost sm" onclick="App.openProposal('${p.id}')">↗</button>
        <button class="btn btn-ghost sm" onclick="App.linkProposal('${j.id}', null)">✕ ${t('prop_unlink')}</button>`;
    } else {
      const opts = (state.data.proposals || [])
        .filter(x => x.complex_id === j.complex_id && ['sent','approved'].includes(x.status))
        .sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 20);
      inner = `${j.has_proposal ? `<span class="chip prq" title="${t('prop_requested')}">P?</span>` : ''}
        ${opts.length ? `<select id="jb-prop-sel" style="flex:1;min-width:130px">
          <option value="">${t('prop_pick')}</option>
          ${opts.map(x => `<option value="${x.id}">P-${x.no ?? '·'} · ${esc(x.unit_number || '')} · ${money(+x.total || 0)}</option>`).join('')}
        </select>
        <button class="btn btn-blue sm" onclick="App.linkProposal('${j.id}', ($('#jb-prop-sel')||{}).value)">${t('prop_link')}</button>`
        : `<span class="tiny">${t('prop_pick_none')}</span>`}`;
    }
    return `<div class="card" style="margin:4px 0 0;padding:8px 10px">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${ic('prop')} <b>PROPOSAL</b> ${inner}</div></div>`;
  }
  if (p) return `<div class="tiny" style="margin:4px 0 0"><span class="chip pr">P-${p.no ?? '·'}</span> PROPOSAL</div>`;
  if (allowTechProposal())
    return `<label class="opt ${j.has_proposal?'on':''}" style="margin:4px 0 0">
      <input type="checkbox" ${j.has_proposal?'checked':''} onchange="App.setProposal(this.checked)"> ${t('proposal_chk')}</label>`;
  return j.has_proposal ? `<div class="tiny" style="margin:4px 0 0"><span class="chip prq">P?</span> ${t('proposal_chk')}</div>` : '';
}
async function linkProposal(jobId, propId){
  if (!isManager()) return;
  if (propId === '' || propId === undefined){ toast('⚠ ' + t('prop_pick'), 'err'); return; }
  const apply = () => {
    const jj = state.data.jobs.find(x => x.id === jobId);
    if (jj){ jj.proposal_id = propId; if (propId) jj.has_proposal = true; }
    if (jobDraft && jobDraft.id === jobId){ jobDraft.proposal_id = propId; if (propId) jobDraft.has_proposal = true; }
  };
  if (!HAS_SB){ apply(); render(); return; }
  const { error } = await state.sb.rpc('link_job_proposal', { p_job: jobId, p_prop: propId });
  if (error){ toast('⛔ ' + rpcFail(error, 'link_job_proposal'), 'err'); return; }
  apply(); toast('✓ ' + t('saved')); render();
}
function viewProposals(){
  if (!isManager()) return `<div class="card" style="margin:14px 12px">${t('prop_only')}</div>`;
  return propDraft ? viewProposalForm() : viewProposalList();
}
function viewProposalList(){
  const f = state.propFilter || 'all';
  const chips = ['all','draft','sent','approved','declined'].map(s =>
    `<button class="tabbtn ${f===s?'active':''}" onclick="App.propFilter('${s}')">${s==='all'?t('all'):t('pst_'+s)}</button>`).join('');
  const list = [...(state.data.proposals || [])]
    .filter(p => f === 'all' || p.status === f)
    .sort((a,b) => String(b.date).localeCompare(String(a.date)) || (b.no||0) - (a.no||0));
  const rows = list.map(p => {
    const cx = cxById(p.complex_id) || {abbr:'—', name:'—'};
    const linked = state.data.jobs.filter(j => j.proposal_id === p.id).length;
    return `<button class="rowline map-row" onclick="App.openProposal('${p.id}')">
      <span class="chip pst pst-${p.status}">${t('pst_' + p.status)}</span>
      <div class="grow"><b>P-${p.no ?? '·'}</b> · ${esc(cx.abbr || cx.name)}${p.unit_number ? ` · Unit <b>${esc(p.unit_number)}</b>` : ''}
        <div class="tiny">${fmtDMY(p.date)}${linked ? ` · 🔗 ${linked}` : ''}</div></div>
      <span class="money">${money(+p.total || 0)}</span>
    </button>`;
  }).join('');
  return `<div class="prop-wrap"><div class="section-title">${t('tab_proposals')}</div>
  <div class="tabs" style="margin:0 12px 8px">${chips}</div>
  <div class="card" style="margin:0 12px">${rows || `<div class="list-empty">${t('no_items')}</div>`}</div>
  <button class="btn btn-green" style="margin:10px 12px" onclick="App.openProposal()">${t('prop_new')}</button></div>`;
}
function openProposal(id){
  if (!isManager()) return;
  state.screen = 'proposals';
  if (id){
    const p = propById(id);
    propDraft = p ? JSON.parse(JSON.stringify(p)) : null;
    if (propDraft && !Array.isArray(propDraft.items)) propDraft.items = [];
  } else {
    propDraft = { id: uid(), no: null, date: state.selDate, counterparty_id: '', complex_id: '',
      unit_number: '', po_number: '', complete_by: null,
      note: '', status: 'draft', items: [{ q: 1, code: '', d: '', a: 0 }], total: 0,
      created_by: state.user.id, created_at: new Date().toISOString() };
  }
  render();
}
function propBack(){ propDraft = null; render(); }
function propRecalc(){
  if (!propDraft) return 0;
  const s = (propDraft.items || []).reduce((n, it) => n + (+it.a || 0), 0);
  propDraft.total = s;
  const el = $('#pr-total'); if (el) el.textContent = money(s);
  return s;
}
function propItemsHtml(){
  return (propDraft.items || []).map((it, i) => `
    <div class="prop-row">
      <input class="pq" inputmode="decimal" value="${it.q ?? 1}" title="${t('prop_qty')}"
        oninput="App.propItem(${i},'q',this.value)">
      <input class="pc" value="${esc(it.code || '')}" placeholder="${t('prop_code')}"
        oninput="App.propItem(${i},'code',this.value)">
      <textarea class="pd" rows="2" placeholder="${t('prop_desc')}"
        oninput="App.propItem(${i},'d',this.value)">${esc(it.d || '')}</textarea>
      <input class="pa" inputmode="decimal" value="${it.a || ''}" placeholder="0"
        oninput="App.propItem(${i},'a',this.value)">
      <button class="btn btn-ghost sm" onclick="App.propItemDel(${i})">✕</button>
    </div>`).join('');
}
function viewProposalForm(){
  const p = propDraft;
  const cp = cpById(p.counterparty_id) || {};
  const cx = cxById(p.complex_id) || {};
  const linked = state.data.jobs.filter(j => j.proposal_id === p.id);
  const stSeg = ['draft','sent','approved','declined'].map(s =>
    `<button class="${p.status===s?'on':''}" onclick="App.setPropStatus('${s}')">${t('pst_'+s)}</button>`).join('');
  return `<div class="prop-wrap">
  <div class="section-title"><button class="icon-btn" onclick="App.propBack()">←</button> ${t('tab_proposals')} · <b>P-${p.no ?? '…'}</b></div>
  <div class="card" style="margin:0 12px">
    <div class="form-row"><span class="lbl">${t('date')}</span>
      <input type="date" value="${p.date}" onchange="App.propField('date', this.value)"></div>
    <div class="form-row"><span class="lbl">${t('counterparty')}</span>
      <div class="combo" id="cb-cp">
        <input class="combo-in" value="${esc(cp.name || '')}" placeholder="${t('select')}" autocomplete="off"
          oninput="App.comboFilter('cp', this.value)" onfocus="App.comboFilter('cp', this.value)">
        <input type="hidden" id="nt-cp" value="${p.counterparty_id || ''}">
        <div class="combo-list" id="cb-cp-list"></div>
      </div></div>
    <div class="form-row"><span class="lbl">${t('complex')}</span>
      <div class="combo" id="cb-cx">
        <input class="combo-in" value="${esc(cx.name || '')}" placeholder="${t('select')}" autocomplete="off"
          oninput="App.comboFilter('cx', this.value)" onfocus="App.comboFilter('cx', this.value)">
        <input type="hidden" id="nt-cx" value="${p.complex_id || ''}">
        <div class="combo-list" id="cb-cx-list"></div>
      </div></div>
    <div class="form-row"><span class="lbl">${t('unit')}</span>
      <input value="${esc(p.unit_number || '')}" oninput="App.propField('unit_number', this.value)"></div>
    <div class="form-row"><span class="lbl">${t('prop_status')}</span>
      <div class="lang-seg">${stSeg}</div></div>
    <div class="form-row"><span class="lbl">PO Number</span>
      <input value="${esc(p.po_number || '')}" oninput="App.propField('po_number', this.value)"></div>
    <div class="form-row"><span class="lbl">${t('prop_complete')}</span>
      <input type="date" value="${p.complete_by || ''}" onchange="App.propField('complete_by', this.value || null)"></div>
  </div>
  <div class="card" style="margin:8px 12px">
    <div style="font-weight:900;margin-bottom:6px">${t('prop_items')}</div>
    <div class="prop-head"><span>${t('prop_qty')}</span><span>${t('prop_code')}</span><span>${t('prop_desc')}</span><span style="text-align:right">$</span><span></span></div>
    <div id="prop-rows">${propItemsHtml()}</div>
    <button class="btn btn-ghost sm" onclick="App.propItemAdd()">${t('prop_add_row')}</button>
    <div class="total-bar" style="margin-top:8px"><span>${t('total')}</span>
      <span class="sum ok" id="pr-total">${money(+p.total || 0)}</span></div>
  </div>
  <div class="card" style="margin:8px 12px">
    <div style="font-weight:900;margin-bottom:6px">${t('prop_note')}</div>
    <textarea rows="3" style="width:100%" oninput="App.propField('note', this.value)">${esc(p.note || '')}</textarea>
  </div>
  ${propById(p.id) ? `<div class="card" style="margin:8px 12px">
    <div style="font-weight:900;margin-bottom:6px">🔗 ${t('prop_linked')} (${linked.length})</div>
    ${linked.map(j => { const jcx = cxById(j.complex_id) || {};
      return `<div class="rowline"><div class="grow">${esc(jcx.abbr || '')} · Unit <b>${esc(j.unit_number || '—')}</b>
        <span class="tiny">· ${fmtDMY(j.date)} · ${money(jobGrand(j))}</span></div>
        <button class="btn btn-ghost sm" onclick="App.openJob('${j.id}')">↗</button>
        <button class="btn btn-ghost sm" onclick="App.linkProposal('${j.id}', null)">✕</button></div>`; }).join('')
      || `<div class="tiny">—</div>`}
  </div>` : ''}
  <div style="margin:10px 12px">
    <button class="btn btn-green" onclick="App.saveProposal()">${ic('save')} ${t('save')}</button>
    <div class="btn-rowpp" style="margin-top:8px">
      <button class="btn btn-blue" onclick="App.makeProposalPdf('${p.id}')">${ic('download')} ${t('prop_pdf')}</button>
      ${isAdmin() && propById(p.id) ? `<button class="btn btn-red" onclick="App.delProposal('${p.id}')">${ic('trash')} ${t('delete')}</button>` : '<span></span>'}
    </div>
  </div></div>`;
}
async function saveProposal(){
  const p = propDraft; if (!p || !isManager()) return;
  p.counterparty_id = ($('#nt-cp') || {}).value || p.counterparty_id;
  p.complex_id = ($('#nt-cx') || {}).value || p.complex_id;
  if (!p.counterparty_id || !p.complex_id){ toast('⚠ ' + t('prop_need_cpcx'), 'err'); return; }
  p.items = (p.items || [])
    .filter(it => String(it.d || '').trim() || String(it.code || '').trim() || +it.a)
    .map(it => ({ q: +it.q || 1, code: String(it.code || ''), d: String(it.d || ''), a: +it.a || 0 }));
  if (!p.items.length) p.items = [{ q: 1, code: '', d: '', a: 0 }];
  propRecalc();
  const isNew = !propById(p.id);
  p.updated_at = new Date().toISOString();
  await dbUpsert('proposals', JSON.parse(JSON.stringify(p)));
  if (p.no == null){
    if (HAS_SB){
      try{ const { data } = await state.sb.from('proposals').select('no').eq('id', p.id).single();
        if (data) p.no = data.no; }catch(e){}
    } else p.no = (state.data.proposals || []).length;
    const loc = propById(p.id); if (loc) loc.no = p.no;
  }
  audit(isNew ? 'proposal_create' : 'proposal_update', 'proposal', p.id,
    { no: p.no, unit: p.unit_number, total: p.total, status: p.status });
  toast('✓ ' + t('saved')); render();
}
async function delProposal(id){
  if (!isAdmin()) return;
  if (!confirm(t('confirm_del'))) return;
  const p = propById(id);
  await dbDelete('proposals', id);
  audit('proposal_delete', 'proposal', id, { no: p && p.no, unit: p && p.unit_number });
  propDraft = null; toast('🗑 ' + t('deleted')); render();
}
function makeProposalPdf(id){
  /* v1.07.33: печатная форма по образцу QuickBooks-пропозала клиента:
     шапка PROPOSAL + Number/Date/Complete By/Page, блоки To/Ship To,
     сетка Customer ID / PO Number / Contact / Shipping Method (Airborne),
     таблица Quantity|Item|Description|Amount с Note внутри описания,
     итоги Subtotal/Sales Tax/Freight/TOTAL и юридическая приписка. */
  const p = (propDraft && propDraft.id === id) ? propDraft : propById(id);
  if (!p || !window.jspdf){ toast('⛔ PDF', 'err'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });      // 215.9 × 279.4
  const org = state.data.org_settings || {};
  const cp = cpById(p.counterparty_id) || { name: '' };
  const cx = cxById(p.complex_id) || { name: '', address: '', abbr: '' };
  const L = 12, R = 203.9, W = R - L;
  const money2 = n => (+n || 0).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- шапка ---------- */
  let y = 16;
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text(String(org.company_name || ''), L, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  let hy = y + 5;
  [org.addr1, org.addr2, org.addr3].forEach(s => {
    if (s){ doc.text(String(s), L, hy); hy += 4; } });

  doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.setTextColor(160);
  doc.text('PROPOSAL', R, y + 3, { align: 'right' });
  doc.setTextColor(0); doc.setFontSize(9);
  let ry = y + 11;
  const pair = (k, v) => {
    doc.setFont('helvetica','normal'); doc.text(k, R - 28, ry, { align: 'right' });
    doc.setFont('helvetica','bold'); doc.text(String(v ?? ''), R, ry, { align: 'right' });
    ry += 4.6;
  };
  pair('Proposal Number:', p.no ?? '—');
  pair('Proposal Date:', fmtUS(p.date));
  if (p.complete_by) pair('Complete By:', fmtUS(p.complete_by));
  pair('Page:', '1');
  y = Math.max(hy, ry) + 3;

  /* ---------- To / Ship To ---------- */
  const addr = String(cx.address || '');
  const comma = addr.indexOf(',');
  const street = comma > 0 ? addr.slice(0, comma).trim() : addr;
  const cityln = comma > 0 ? addr.slice(comma + 1).trim() : '';
  const boxW = 92, boxH = 24;
  const infoBox = (x, title, lines) => {
    doc.setFillColor(222); doc.rect(x, y, boxW, 5.6, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text(title, x + 2, y + 4);
    doc.rect(x, y + 5.6, boxW, boxH);
    doc.setFont('helvetica','normal');
    let by = y + 10;
    lines.filter(Boolean).forEach(s => {
      doc.text(String(s).slice(0, 46), x + 2, by); by += 4.4; });
  };
  infoBox(L, 'To:', [cp.name, cx.name !== cp.name ? cx.name : '', street, cityln]);
  infoBox(R - boxW, 'Ship To:',
    [cx.name, street, p.unit_number ? String(p.unit_number) : '', cityln]);
  y += 5.6 + boxH + 4;

  /* ---------- Customer ID / PO Number / Contact / Shipping ---------- */
  const half = W / 2;
  const gridCell = (x, w, title, val) => {
    doc.setFillColor(222); doc.rect(x, y, w, 5.4, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.text(title, x + w / 2, y + 3.8, { align: 'center' });
    doc.rect(x, y + 5.4, w, 6);
    doc.setFont('helvetica','normal');
    if (val) doc.text(String(val).slice(0, 50), x + w / 2, y + 9.5, { align: 'center' });
  };
  gridCell(L, half, 'Customer ID', cx.name || cp.name);
  gridCell(L + half, half, 'PO Number', p.po_number || '');
  y += 11.4;
  gridCell(L, half, 'Customer Contact', '');
  gridCell(L + half, half, 'Shipping Method', 'Airborne');
  y += 11.4 + 3;

  /* ---------- таблица позиций ---------- */
  const cQ = L, wQ = 20, cI = cQ + wQ, wI = 24, cD = cI + wI, cA = R - 26, wD = cA - cD;
  const headRow = () => {
    doc.setFillColor(222); doc.rect(L, y, W, 5.8, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('Quantity', cQ + wQ - 2, y + 4.1, { align: 'right' });
    doc.text('Item', cI + 2, y + 4.1);
    doc.text('Description', cD + 2, y + 4.1);
    doc.text('Amount', R - 2, y + 4.1, { align: 'right' });
    y += 5.8;
    doc.setFont('helvetica','normal');
  };
  headRow();
  let btop = y;
  const flushBox = () => {
    doc.rect(L, btop, W, y - btop);
    doc.line(cI, btop, cI, y);
    doc.line(cD, btop, cD, y);
    doc.line(cA, btop, cA, y);
  };
  const LH = 4.3;
  const ensure = h => {
    if (y + h > 232){
      flushBox(); doc.addPage();
      y = 14;
      doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text('Proposal # ' + (p.no ?? ''), R, y, { align: 'right' });
      y += 4; headRow(); btop = y;
    }
  };
  const rows = [];
  if (p.unit_number) rows.push({ q: 1, code: '1', d: 'Unit # ' + p.unit_number, a: 0 });
  (p.items || []).forEach(it => rows.push({
    q: (it.q ?? 1), code: it.code || '', d: it.d || '', a: +it.a || 0 }));
  doc.setFontSize(9);
  rows.forEach(it => {
    const lines = doc.splitTextToSize(String(it.d), wD - 4);
    const h = Math.max(LH, lines.length * LH) + 1.8;
    ensure(h);
    doc.text((+it.q || 1).toFixed(2), cQ + wQ - 2, y + 3.6, { align: 'right' });
    doc.text(String(it.code).slice(0, 10), cI + 2, y + 3.6);
    doc.text(lines, cD + 2, y + 3.6);
    if (it.a) doc.text(money2(it.a), R - 2, y + 3.6, { align: 'right' });
    y += h;
  });
  if (p.note){
    const nl = doc.splitTextToSize('Note:\n' + p.note, wD - 4);
    const h = nl.length * LH + 2.4;
    ensure(h);
    doc.text(nl, cD + 2, y + 3.6);
    y += h;
  }
  y += 1;
  flushBox();

  /* ---------- итоги ---------- */
  const tx = cD, tw = R - tx;
  const totRow = (k, v, dark) => {
    if (dark){ doc.setFillColor(205); doc.rect(tx, y, tw, 6, 'FD'); doc.setFont('helvetica','bold'); }
    else { doc.rect(tx, y, tw, 6); doc.setFont('helvetica','normal'); }
    doc.text(k, tx + 2, y + 4.2);
    if (v !== '') doc.text(v, R - 2, y + 4.2, { align: 'right' });
    y += 6;
  };
  doc.setFontSize(9);
  totRow('Subtotal', money2(p.total), false);
  totRow('Sales Tax', '', false);
  totRow('Freight', '', false);
  totRow('TOTAL PROPOSAL AMOUNT', '$' + money2(p.total), true);

  /* ---------- юридическая приписка ---------- */
  doc.setFont('helvetica','normal'); doc.setFontSize(7.4);
  const legal = 'NOTE: All invoices are due and payable upon receipt. Any balances that remain '
    + 'outstanding for a period greater than thirty (30) days will be subject to a service charge at '
    + "the rate of 1.5% per month. You agree to pay all legal expenses, including reasonable attorney's "
    + 'fees, incurred in connection with the collection of past due amounts.';
  doc.text(doc.splitTextToSize(legal, W), L, Math.max(y + 8, 250));

  savePdfCompat(doc, 'Proposal_' + (p.no ?? 'x') + '_' + (cx.abbr || '') + '.pdf');
}
function propStripHtml(){
  const list = (state.data.proposals || []).filter(p => p.date === state.selDate);
  if (!list.length) return '';
  return `<div class="pstrip">${list.map(p => {
    const cx = cxById(p.complex_id) || {abbr:'—'};
    return `<div class="pcard clicky" onclick="App.openProposal('${p.id}')">
      <span class="chip pst pst-${p.status}">${t('pst_' + p.status)}</span>
      <div><b>P-${p.no ?? '·'}</b> · ${esc(cx.abbr)}${p.unit_number ? ' · ' + esc(p.unit_number) : ''}</div>
      <div class="tiny money">${money(+p.total || 0)}</div>
    </div>`; }).join('')}</div>`;
}

/* =====================================================================
   v1.07.27: СОГЛАСОВАНИЕ ПРОДЛЕНИЙ сверх лимита
   ===================================================================== */
function pendingExtReqHtml(jobId){
  const mine = (state.data.ext_requests || []).filter(r => r.job_id === jobId && r.status === 'pending');
  if (!mine.length) return '';
  return mine.map(r => `<div class="tiny" style="margin:2px 0 6px">${t('ext_req_pending').replace('{N}', r.days)}</div>`).join('');
}
async function extReqCreate(){
  const d = extDraft; if (!d) return;
  let days = parseInt(prompt(t('ext_req_days_q'), String(maxExtendDays() + 1)) || '0', 10);
  if (!(days >= 1)) return;
  days = Math.min(30, days);
  const rows = d.rows.map(p => ({ id: p.id,
      qty: d.mode === 'all' ? (+p.qty || 1) : Math.min(+p.qty || 1, d.sel[p.id] || 0) }))
    .filter(r => r.qty > 0);
  if (!rows.length){ toast('⚠ 0', 'err'); return; }
  const agg = {}; d.rows.forEach(p => { const r = rows.find(x => x.id === p.id); if (!r) return;
    const e = etById(p.equipment_type_id); const k = e ? e.abbr : '?'; agg[k] = (agg[k] || 0) + r.qty; });
  const p0 = d.rows[0]; const cx = cxById(p0.complex_id) || {};
  const req = { id: uid(), job_id: d.jobId, requested_by: state.user.id,
    requested_at: new Date().toISOString(), days,
    qty_total: rows.reduce((s, r) => s + r.qty, 0),
    payload: rows, unit: p0.unit_number || '', cx: cx.abbr || cx.name || '',
    eq: Object.entries(agg).map(([k, q]) => `${k}×${q}`).join(' '), status: 'pending' };
  await dbUpsert('ext_requests', req);
  audit('ext_request', 'job', d.jobId, { unit: req.unit, days, qty: req.qty_total, eq: req.eq });
  extDraft = null; closeModal();
  toast('⏳ ' + t('ext_req_sent')); render();
}
function extReqStripHtml(){
  const list = (state.data.ext_requests || []).filter(r => r.status === 'pending');
  if (!list.length) return '';
  return `<div class="section-title" style="margin-top:2px">${t('ext_req_title')} <span class="chip warn">${list.length}</span></div>
  <div class="pstrip">${list.map(r => `
    <div class="pcard reqcard">
      <div><b>Unit ${esc(r.unit || '—')}</b> · ${esc(r.cx || '')}</div>
      <div class="tiny">${esc(r.eq || '')} · +${r.days} ${t('days')} · ${esc(profName(r.requested_by))}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn btn-green sm" onclick="App.extReqDecide('${r.id}', true)">✓ ${t('ext_req_ok')}</button>
        <button class="btn btn-red sm" onclick="App.extReqDecide('${r.id}', false)">✗</button>
      </div>
    </div>`).join('')}</div>`;
}
async function extReqDecide(id, ok){
  if (!isManager()) return;
  if (!confirm((ok ? t('ext_req_ok') : t('ext_req_no')) + '?')) return;
  if (!HAS_SB){ toast('Supabase only', 'err'); return; }
  const { error } = await state.sb.rpc('decide_ext_request', { p_id: id, p_ok: !!ok });
  if (error){ toast('⛔ ' + rpcFail(error, 'decide_ext_request'), 'err'); return; }
  const r = (state.data.ext_requests || []).find(x => x.id === id);
  if (r){ r.status = ok ? 'approved' : 'rejected'; }
  toast(ok ? '✓ ' + t('ext_req_done') : '✗ ' + t('ext_req_rej'));
  try{ if (App.sync) await App.sync(); }catch(e){}
  render();
}

/* =====================================================================
   v1.07.31: ФОТО И ВИДЕО → GOOGLE DRIVE (интеграция media-модуля)
   Снимок → сжатие в браузере → очередь в IndexedDB (офлайн) →
   media-begin (права по RLS, имя от сервера, resumable-URL) →
   PUT байтов НАПРЯМУЮ в Google → миниатюра в Supabase Storage →
   media-commit (журнал пишет сервер). Токены Google клиента не касаются.
   ===================================================================== */
const M_MAXW = 1920, M_THUMBW = 320, M_JPEGQ = 0.8, M_THQ = 0.7;
const M_VMAX = 90, M_CHUNK = 8 * 1024 * 1024;
const mediaFN = () => (CFG.SUPABASE_URL || '') + '/functions/v1';
let mediaQ = [];                       // зеркало IndexedDB-очереди для мгновенного рендера
const mediaThumbCache = new Map();     // thumb_path -> objectURL
let _mediaHydPlanned = false, _mediaBusy = false;

async function mediaJwt(){
  try{ const { data } = await state.sb.auth.getSession(); return data.session && data.session.access_token; }
  catch(e){ return null; }
}
/* ---------- IndexedDB-очередь ---------- */
let _mdbP = null;
function mdb(){
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no idb'));
  if (_mdbP) return _mdbP;
  _mdbP = new Promise((res, rej) => {
    const r = indexedDB.open('tl-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('outbox', { keyPath: 'qid' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return _mdbP;
}
const mtx = (mode, fn) => mdb().then(d => new Promise((res, rej) => {
  const t = d.transaction('outbox', mode); const out = fn(t.objectStore('outbox'));
  t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
  t.onerror = () => rej(t.error);
}));
const mQPut = it => mtx('readwrite', s => s.put(it)).catch(() => {});
const mQDelIdb = qid => mtx('readwrite', s => s.delete(qid)).catch(() => {});

async function initMedia(){
  try{ mediaQ = (await mtx('readonly', s => s.getAll())) || []; }catch(e){ mediaQ = []; }
  mediaBadge();
  addEventListener('online', () => { mediaFlush(); });
  addEventListener('visibilitychange', () => { if (!document.hidden) mediaFlush(); });
  setInterval(() => { if (mediaQ.length) mediaFlush(); }, 30000);
  if (_driveOAuth){                     // вернулись со страницы Google
    const tmr = setInterval(() => {
      if (state.user && isAdmin() && HAS_SB){
        clearInterval(tmr);
        const code = _driveOAuth; _driveOAuth = null;
        mediaOauthExchange(code);
      }
    }, 700);
    setTimeout(() => clearInterval(tmr), 90000);
  }
}
/* ---------- сжатие ---------- */
async function mShrink(file, maxW, q){
  let src, iw, ih;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (bmp){ src = bmp; iw = bmp.width; ih = bmp.height; }
  else {
    src = await new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = rej; im.src = u;
    });
    iw = src.naturalWidth; ih = src.naturalHeight;
  }
  const k = Math.min(1, maxW / Math.max(iw, ih));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (bmp && bmp.close) bmp.close();
  return new Promise(res => c.toBlob(res, 'image/jpeg', q));
}
const mVideoDur = f => new Promise(res => {
  const u = URL.createObjectURL(f), v = document.createElement('video');
  v.preload = 'metadata'; v.src = u;
  v.onloadedmetadata = () => { URL.revokeObjectURL(u); res(v.duration || 0); };
  v.onerror = () => { URL.revokeObjectURL(u); res(0); };
});
const mVideoThumb = f => new Promise(res => {
  const u = URL.createObjectURL(f), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
  v.onloadeddata = () => { try{
    const k = Math.min(1, M_THUMBW / Math.max(v.videoWidth || 1, v.videoHeight || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((v.videoWidth || 320) * k));
    c.height = Math.max(1, Math.round((v.videoHeight || 240) * k));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(b => { URL.revokeObjectURL(u); res(b); }, 'image/jpeg', M_THQ);
  }catch(e){ URL.revokeObjectURL(u); res(null); } };
  v.onerror = () => { URL.revokeObjectURL(u); res(null); };
});
/* ---------- съёмка ---------- */
function mediaPick(jobId, kind){
  if (!HAS_SB){ toast(t('media_sb_only'), 'err'); return; }
  const rows = (state.data.media || []).filter(m => m.job_id === jobId && m.kind === kind);
  const loc = mediaQ.filter(x => x.job_id === jobId && x.kind === kind);
  if (rows.length + loc.length >= (kind === 'video' ? 2 : 10)){ toast('⚠ ' + t('media_limit'), 'err'); return; }
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = kind === 'video' ? 'video/*' : 'image/*';
  inp.capture = 'environment';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try{
      let blob, thumb, mime;
      if (kind === 'photo'){
        blob = await mShrink(f, M_MAXW, M_JPEGQ);
        thumb = await mShrink(f, M_THUMBW, M_THQ);
        mime = 'image/jpeg';
      } else {
        const dur = await mVideoDur(f);
        if (dur > M_VMAX + 2){ toast('⚠ ' + t('media_vlong'), 'err'); return; }
        blob = f; thumb = await mVideoThumb(f); mime = f.type || 'video/mp4';
      }
      const it = { qid: uid(), job_id: jobId, kind, mime, blob, thumb,
        state: 'new', attempts: 0, at: Date.now() };
      mediaQ.push(it); await mQPut(it);
      navigator.vibrate?.(15);
      render(); mediaFlush();
    }catch(e){ toast('⛔ ' + (e.message || e), 'err'); }
  };
  inp.click();
}
async function mediaQDel(qid){
  mediaQ = mediaQ.filter(x => x.qid !== qid);
  await mQDelIdb(qid);
  render(); mediaBadge();
}
/* ---------- отправка (докачка чанками) ---------- */
async function mPutResumable(it){
  const total = it.blob.size;
  let offset = 0;
  if (it.started){
    const p = await fetch(it.upload_url, { method: 'PUT',
      headers: { 'Content-Range': `bytes */${total}` } });
    if (p.status === 308){
      const r = p.headers.get('Range');
      offset = r ? Number(r.split('-')[1]) + 1 : 0;
    } else if (p.ok) return (await p.json()).id;
  }
  while (offset < total){
    const end = Math.min(offset + M_CHUNK, total);
    const r = await fetch(it.upload_url, { method: 'PUT',
      headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
      body: it.blob.slice(offset, end) });
    it.started = true; await mQPut(it);
    if (r.status === 308){ offset = end; continue; }
    if (r.ok) return (await r.json()).id;
    throw new Error('upload ' + r.status);
  }
  throw new Error('upload incomplete');
}
async function mediaFlush(){
  if (_mediaBusy || !HAS_SB || !navigator.onLine || !state.user){ mediaBadge(); return; }
  _mediaBusy = true;
  try{
    for (const it of [...mediaQ].sort((a, b) => a.at - b.at)){
      try{
        const token = await mediaJwt(); if (!token) break;
        if (!it.upload_url){
          const r = await fetch(mediaFN() + '/media-begin', { method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ job_id: it.job_id, kind: it.kind, mime: it.mime, size: it.blob.size }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok){
            if (r.status === 409 || r.status === 403 || r.status === 413){
              await mediaQDel(it.qid); toast('⛔ ' + (j.error || r.status), 'err'); continue;
            }
            if (String(j.error || '').includes('DRIVE_NOT_CONFIGURED')){
              if (isAdmin()) toast('⚠ ' + t('media_not_cfg'), 'inf');
              break;
            }
            throw new Error(j.error || r.status);
          }
          Object.assign(it, { media_id: j.media_id, upload_url: j.upload_url, thumb_path: j.thumb_path });
          await mQPut(it);
        }
        const driveId = await mPutResumable(it);
        if (it.thumb && it.thumb_path){
          await state.sb.storage.from('media-thumbs')
            .upload(it.thumb_path, it.thumb, { contentType: 'image/jpeg', upsert: true })
            .catch(() => {});
        }
        const token2 = await mediaJwt();
        const c = await fetch(mediaFN() + '/media-commit', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token2 },
          body: JSON.stringify({ media_id: it.media_id, drive_file_id: driveId }) });
        if (!c.ok) throw new Error('commit ' + c.status);
        mediaQ = mediaQ.filter(x => x.qid !== it.qid);
        await mQDelIdb(it.qid);
        if (!state.data.media) state.data.media = [];
        state.data.media.push({ id: it.media_id, job_id: it.job_id, owner_id: state.user.id,
          kind: it.kind, seq: 0, file_name: '', thumb_path: it.thumb_path, status: 'ready' });
        render();
      }catch(e){
        it.attempts = (it.attempts || 0) + 1; await mQPut(it);
        dlog('media stuck', it.qid, e);
        break;                              // сеть шалит — дождёмся online/интервала
      }
    }
  } finally { _mediaBusy = false; mediaBadge(); }
}
/* ---------- полоса миниатюр ---------- */
function mediaStripHtml(jobId){
  const rows = (state.data.media || []).filter(m => m.job_id === jobId)
    .sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : (a.seq || 0) - (b.seq || 0)));
  const loc = mediaQ.filter(x => x.job_id === jobId);
  const nP = rows.filter(m => m.kind === 'photo').length + loc.filter(x => x.kind === 'photo').length;
  const nV = rows.filter(m => m.kind === 'video').length + loc.filter(x => x.kind === 'video').length;
  const cells = rows.map(m => `
    <div class="mth clicky" onclick="App.mediaOpen('${m.id}','${m.kind}')">
      <img data-thumb="${m.thumb_path || ''}" alt="">
      ${m.kind === 'video' ? '<span class="mvid">▶</span>' : ''}
      ${m.status !== 'ready' ? '<span class="mst">⏳</span>' : ''}
      ${isAdmin() ? `<span class="mx" title="${t('media_del_q')}" onclick="event.stopPropagation();App.mediaDelete('${m.id}')">✕</span>` : ''}
    </div>`).join('')
  + loc.map(x => `
    <div class="mth loc">
      <img src="${x.thumb ? URL.createObjectURL(x.thumb) : ''}" alt="">
      ${x.kind === 'video' ? '<span class="mvid">▶</span>' : ''}
      <span class="mst">⏳</span>
      <span class="mx" onclick="App.mediaQDel('${x.qid}')">✕</span>
    </div>`).join('');
  if (!_mediaHydPlanned){ _mediaHydPlanned = true; setTimeout(mediaHydrate, 0); }
  return `<div class="card media-card">
    <div style="font-weight:900;margin-bottom:6px">📷 ${t('media_title')}
      <span class="tiny"> · ${nP}/10 · ${nV}/2</span></div>
    <div class="mstrip">${cells}
      <button type="button" class="btn btn-ghost sm" onclick="App.mediaPick('${jobId}','photo')">${t('media_photo')}</button>
      <button type="button" class="btn btn-ghost sm" onclick="App.mediaPick('${jobId}','video')">${t('media_video')}</button>
    </div>
  </div>`;
}
async function mediaHydrate(){
  _mediaHydPlanned = false;
  if (!HAS_SB) return;
  const imgs = [...document.querySelectorAll('img[data-thumb]:not([src])')];
  for (const img of imgs){
    const p = img.getAttribute('data-thumb'); if (!p) continue;
    if (mediaThumbCache.has(p)){ img.src = mediaThumbCache.get(p); continue; }
    try{
      const { data } = await state.sb.storage.from('media-thumbs').download(p);
      if (data){ const u = URL.createObjectURL(data); mediaThumbCache.set(p, u); img.src = u; }
    }catch(e){}
  }
}
async function mediaOpen(id, kind){
  if (!HAS_SB) return;
  toast('⏳ …', 'inf');
  const token = await mediaJwt();
  const r = await fetch(mediaFN() + '/media-view?id=' + encodeURIComponent(id),
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok){ toast('⛔ ' + t('media_open_err'), 'err'); return; }
  const u = URL.createObjectURL(await r.blob());
  const w = document.createElement('div');
  w.className = 'mfull';
  w.onclick = () => { URL.revokeObjectURL(u); w.remove(); };
  w.innerHTML = kind === 'video'
    ? `<video src="${u}" controls playsinline autoplay></video>`
    : `<img src="${u}" alt="">`;
  document.body.appendChild(w);
}
async function mediaDelete(id){
  if (!isAdmin()) return;
  if (!confirm(t('media_del_q') + '?')) return;
  const token = await mediaJwt();
  const r = await fetch(mediaFN() + '/media-delete', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ media_id: id }) });
  if (!r.ok){ toast('⛔', 'err'); return; }
  state.data.media = (state.data.media || []).filter(m => m.id !== id);
  toast('🗑 ' + t('deleted')); render();
}
function mediaBadge(){
  let el = document.getElementById('tl-net');
  if (!el){
    el = document.createElement('div'); el.id = 'tl-net';
    document.body.appendChild(el);
  }
  const n = mediaQ.length;
  const off = !navigator.onLine;
  el.textContent = (off ? t('media_offline') : '') + (n ? ` ⬆${n} ${t('media_wait')}` : '');
  el.style.display = (off || n) ? 'inline-flex' : 'none';
}
/* ---------- админка: ключи, подключение, тест ---------- */
function mediaSettingsCardHtml(){
  if (!isAdmin()) return '';
  const redirect = location.origin + location.pathname;
  return `<div class="card" id="gd-card">
    <div style="font-weight:900;margin-bottom:6px">${t('gd_card')}</div>
    <div class="tiny" style="margin-bottom:8px">${t('gd_intro')}</div>
    <div class="form-row"><span class="lbl">${t('gd_cid')}</span>
      <input id="gd-cid" autocomplete="off" placeholder="…apps.googleusercontent.com"></div>
    <div class="form-row"><span class="lbl">${t('gd_secret')}</span>
      <input id="gd-sec" type="password" autocomplete="new-password" placeholder="GOCSPX-…"></div>
    <div class="form-row"><span class="lbl">${t('gd_folder')}</span>
      <input id="gd-folder" autocomplete="off" placeholder="ID из адреса папки на Диске"></div>
    <div class="form-row"><span class="lbl">${t('gd_redirect')}</span>
      <input readonly value="${esc(redirect)}" onclick="this.select()"></div>
    <div class="btn-rowpp" style="margin:8px 0 0">
      <button class="btn btn-ghost" onclick="App.mediaSaveKeys()">${t('gd_save')}</button>
      <button class="btn btn-blue" onclick="App.mediaConnect()">${t('gd_connect')}</button>
    </div>
    <button class="btn btn-green" style="margin-top:8px" onclick="App.mediaHealth()">${t('gd_test')}</button>
    <div id="gd-health" class="tiny" style="margin-top:8px"></div>
    <details style="margin-top:8px"><summary class="tiny">${t('gd_help')}</summary>
      <div class="tiny" style="margin-top:6px;line-height:1.5">
        1. console.cloud.google.com → создайте проект → APIs &amp; Services → Library → включите <b>Google Drive API</b>.<br>
        2. OAuth consent screen → External → заполните название и почту → <b>Publish app</b> (иначе токен умрёт через 7 дней; скоуп drive.file верификации не требует).<br>
        3. Credentials → Create OAuth client ID → <b>Web application</b> → в Authorized redirect URIs вставьте адрес из поля выше.<br>
        4. Скопируйте Client ID и Client Secret в поля, укажите ID папки архива на Диске (создайте папку, ID — в адресной строке после /folders/).<br>
        5. «${t('gd_save')}» → «${t('gd_connect')}» → войдите под <b>архивным</b> Google-аккаунтом фирмы и разрешите доступ → «${t('gd_test')}».
      </div>
    </details>
  </div>`;
}
async function mediaSaveKeys(){
  if (!HAS_SB){ toast(t('media_sb_only'), 'err'); return; }
  const cid = ($('#gd-cid') || {}).value || '', sec = ($('#gd-sec') || {}).value || '',
        fld = ($('#gd-folder') || {}).value || '';
  const { error } = await state.sb.rpc('admin_set_drive_config',
    { p_client_id: cid, p_client_secret: sec, p_refresh_token: '', p_folder_id: fld });
  if (error){ toast('⛔ ' + rpcFail(error, 'admin_set_drive_config'), 'err'); return; }
  toast('✓ ' + t('gd_saved'));
}
async function mediaConnect(){
  if (!HAS_SB){ toast(t('media_sb_only'), 'err'); return; }
  const cid = (($('#gd-cid') || {}).value || '').trim();
  if (!cid){ toast('⚠ ' + t('gd_need_cid'), 'err'); return; }
  await mediaSaveKeys();
  const redirect = location.origin + location.pathname;
  const u = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + encodeURIComponent(cid)
    + '&redirect_uri=' + encodeURIComponent(redirect)
    + '&response_type=code'
    + '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/drive.file')
    + '&access_type=offline&prompt=consent&state=tl_drive';
  location.href = u;
}
async function mediaOauthExchange(code){
  try{
    const token = await mediaJwt();
    const r = await fetch(mediaFN() + '/media-oauth', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ code, redirect_uri: location.origin + location.pathname }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || r.status);
    toast('✓ ' + t('gd_connected') + (j.email ? ' · ' + j.email : ''));
    App.go('settings');
  }catch(e){ toast('⛔ Google OAuth: ' + (e.message || e), 'err'); }
}
async function mediaHealth(){
  if (!HAS_SB){ toast(t('media_sb_only'), 'err'); return; }
  const box = $('#gd-health'); if (box) box.textContent = '⏳ …';
  try{
    const token = await mediaJwt();
    const r = await fetch(mediaFN() + '/media-health',
      { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    const row = (k, ok, extra) =>
      `<div>${ok ? '🟢' : '🔴'} ${k}${extra ? ' — ' + extra : ''}</div>`;
    let h = '';
    h += row(t('gd_db'), j.db && j.db.ok, j.db && (j.db.ok ? j.db.ms + ' ms' : esc(String(j.db.error || ''))));
    h += row(t('gd_auth'), j.auth && j.auth.ok,
      j.auth && j.auth.ok ? j.auth.ms + ' ms' : t('gd_not_conn'));
    if (j.drive && j.drive.ok){
      h += row(t('gd_acc'), true, esc(j.drive.account || ''));
      h += row(t('gd_used'), true, j.drive.used_gb + ' / ' + j.drive.limit_gb + ' GB');
    } else if (j.drive){
      h += row('Drive', false, esc(String(j.drive.error || '')).slice(0, 120));
    }
    if (j.write) h += row(t('gd_write'), j.write.ok, j.write.error ? esc(String(j.write.error)).slice(0, 120) : '');
    if (box) box.innerHTML = h || '⛔';
    if (j.cfg){
      const c = $('#gd-cid'), f = $('#gd-folder');
      if (c && !c.value && j.cfg.client_id) c.value = j.cfg.client_id;
      if (f && !f.value && j.cfg.folder_id) f.value = j.cfg.folder_id;
    }
  }catch(e){ if (box) box.innerHTML = '🔴 ' + esc(String(e.message || e)); }
}
/* =====================================================================
   v1.07.34: ДИАГНОСТИКА — интернет, БД, сессия, хранилище, функции и
   подключение к Google Drive (детали Drive — админу через media-health).
   ===================================================================== */
function diagCardHtml(){
  return `<div class="card" id="dg-card">
    <div style="font-weight:900;margin-bottom:6px">${t('diag_card')}</div>
    <button class="btn btn-blue" onclick="App.runDiag()">${t('diag_run')}</button>
    <div id="dg-out" class="tiny" style="margin-top:8px"></div>
  </div>`;
}
async function runDiag(){
  const out = $('#dg-out'); if (!out) return;
  out.innerHTML = '⏳ …';
  const rows = [];
  const paint = () => { out.innerHTML = rows.join(''); };
  const row = (name, ok, extra) => {
    rows.push(`<div>${ok === null ? '⚪' : ok ? '🟢' : '🔴'} ${name}${extra ? ' — ' + esc(String(extra)) : ''}</div>`);
    paint();
  };
  rows.length = 0; paint();
  /* 1. интернет */
  try{
    const t0 = Date.now();
    await fetch('version.json?d=' + Date.now(), { cache: 'no-store' });
    row(t('diag_net'), true, (Date.now() - t0) + ' ms');
  }catch(e){ row(t('diag_net'), false, e.message || e); }
  if (!HAS_SB){
    [t('diag_db'), t('diag_auth'), t('diag_store'), t('diag_fn')]
      .forEach(n => row(n, null, t('diag_skip')));
    return;
  }
  /* 2. база */
  try{
    const t0 = Date.now();
    const { error } = await state.sb.from('org_settings').select('id').limit(1);
    if (error) throw error;
    row(t('diag_db'), true, (Date.now() - t0) + ' ms');
  }catch(e){ row(t('diag_db'), false, e.message || e); }
  /* 3. сессия */
  try{
    const { data } = await state.sb.auth.getSession();
    row(t('diag_auth'), !!(data && data.session),
      data && data.session ? ((state.user && state.user.login) || 'ok') : t('diag_no_sess'));
  }catch(e){ row(t('diag_auth'), false, e.message || e); }
  /* 4. bucket миниатюр */
  try{
    const { error } = await state.sb.storage.from('media-thumbs').list('', { limit: 1 });
    if (error) throw error;
    row(t('diag_store'), true, '');
  }catch(e){ row(t('diag_store'), false, (e.message || e) + ' · ' + t('diag_sql31')); }
  /* 5. функции + Google Drive */
  try{
    const token = await mediaJwt();
    const r = await fetch(mediaFN() + '/media-health',
      { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 404) throw new Error(t('diag_deploy'));
    if (r.status === 403){ row(t('diag_fn'), true, t('diag_fn_admin')); return; }
    row(t('diag_fn'), true, '');
    if (isAdmin()){
      const j = await r.json().catch(() => ({}));
      row(t('gd_auth'), !!(j.auth && j.auth.ok),
        j.auth && j.auth.ok ? j.auth.ms + ' ms' : t('gd_not_conn'));
      if (j.drive && j.drive.ok){
        row(t('gd_acc'), true, j.drive.account || '');
        row(t('gd_used'), true, j.drive.used_gb + ' / ' + j.drive.limit_gb + ' GB');
      } else if (j.drive){
        row('Google Drive', false, String(j.drive.error || '').slice(0, 90));
      }
      if (j.write) row(t('gd_write'), !!j.write.ok,
        j.write.error ? String(j.write.error).slice(0, 90) : '');
    }
  }catch(e){ row(t('diag_fn'), false, e.message || e); }
}
/* фейд вместо обрубания: класс вешается только реально обрезанным текстам */
function updateFadeClips(){
  document.querySelectorAll('.brand .name,.brand .sub,.tabbar .tab span')  // login-pill исключён: у аватара — прежнее троеточие
    .forEach(e => e.classList.toggle('fade-clip', e.scrollWidth > e.clientWidth + 1));
}
(function initFadeClips(){
  let tm = 0;
  const kick = () => { clearTimeout(tm); tm = setTimeout(updateFadeClips, 60); };
  addEventListener('resize', kick);
  const root = document.getElementById('app') || document.body;
  new MutationObserver(kick).observe(root, { childList: true, subtree: true });
  kick();
})();
initMedia();

/* =====================================================================
   v1.07.32: БЭКАП ДАННЫХ — интегрирован в приложение (Настройки, админ).
   Выгрузка: все таблицы постранично + учётки (RPC) + секреты (по галочке)
   в один JSON. Загрузка: учётки → таблицы в порядке зависимостей FK,
   пачками через admin_restore_rows; дубли отсекает Postgres
   (ON CONFLICT DO NOTHING), ошибки — построчно в экранный лог с
   выгрузкой в .txt. Журналы выгружаются, но кнопкой не восстанавливаются.
   ===================================================================== */
const BK_TABLES = ['profiles','counterparties','complexes','aux_equipment','work_types',
  'equipment_types','size_types','extra_works','product_types','price_list',
  'counterparty_prices','equipment_stock','org_settings','hidden_staff',
  'code_requests','complex_code_history','proposals','jobs','placements',
  'ext_requests','media'];
const BK_EXPORT_ONLY = ['audit_log','tech_log'];
const BK_PAGE = 1000, BK_CHUNK = 300;
let bkLogLines = null;

function bkStamp(){ const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }
function bkLog(mark, msg){
  bkLogLines = bkLogLines || [];
  const s = `${new Date().toLocaleTimeString()} ${mark} ${msg}`;
  bkLogLines.push(s);
  const pre = $('#bk-log');
  if (pre){ pre.style.display = 'block'; pre.textContent += s + '\n'; pre.scrollTop = pre.scrollHeight; }
  const btn = $('#bk-save'); if (btn) btn.style.display = 'inline-flex';
}
function bkDownload(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function bkSaveLog(){
  if (!bkLogLines) return;
  bkDownload(new Blob([bkLogLines.join('\n')], { type: 'text/plain;charset=utf-8' }),
    `techlog-${bkStamp()}-log.txt`);
}
const bkNoRpc = e => /PGRST202|Could not find the function|schema cache/i
  .test(String((e && e.message) || e));
function bkBusy(v){ ['#bk-exp', '#bk-imp'].forEach(s => { const b = $(s); if (b) b.disabled = !!v; }); }

async function bkFetchAll(tb){
  if (!HAS_SB){                                   // демо: из локального состояния
    if (tb === 'org_settings') return [state.data.org_settings];
    if (tb === 'audit_log' || tb === 'tech_log')
      return (state.data.audit_log || []).filter(r => (r.src || 'doc') === (tb === 'tech_log' ? 'tech' : 'doc'));
    return (state.data[tb] || []).slice();
  }
  const out = []; let from = 0;
  for (;;){
    let q = state.sb.from(tb).select('*');
    q = (tb === 'audit_log' || tb === 'tech_log')
      ? q.order('at', { ascending: true }) : q.order('id', { ascending: true });
    const { data, error } = await q.range(from, from + BK_PAGE - 1);
    if (error){
      if (/does not exist|42P01/i.test(error.message)) return null;   // таблицы ещё нет
      throw new Error(error.message);
    }
    out.push(...data);
    if (data.length < BK_PAGE) break;
    from += BK_PAGE;
  }
  return out;
}
async function bkExport(){
  const withSec = !!(($('#bk-sec') || {}).checked);
  bkLogLines = [`# TechLog — выгрузка бэкапа — ${new Date().toLocaleString()}`];
  const pre = $('#bk-log'); if (pre){ pre.style.display = 'block'; pre.textContent = ''; }
  bkBusy(true);
  try{
    const counts = {}; const parts = []; let first = true;
    const meta = { app: 'TechLog', kind: 'backup', app_version: APP_VERSION,
      exported_at: new Date().toISOString(), by: (state.user && state.user.login) || '?' };
    parts.push('{"meta":' + JSON.stringify(meta) + ',"tables":{');
    for (const tb of [...BK_TABLES, ...BK_EXPORT_ONLY]){
      try{
        const rows = await bkFetchAll(tb);
        if (rows === null){ bkLog('·', tb + ': таблицы нет — пропущена'); continue; }
        parts.push((first ? '' : ',') + JSON.stringify(tb) + ':' + JSON.stringify(rows));
        first = false; counts[tb] = rows.length;
        bkLog('✔', `${tb}: ${rows.length}`);
      }catch(e){ bkLog('⛔', `${tb}: ${e.message || e}`); }
    }
    parts.push('}');
    if (HAS_SB){
      try{
        const { data, error } = await state.sb.rpc('admin_export_auth_users');
        if (error) throw error;
        parts.push(',"auth_users":' + JSON.stringify(data || []));
        counts.auth_users = (data || []).length;
        bkLog('✔', `auth_users: ${counts.auth_users} (bcrypt)`);
      }catch(e){ bkLog('⛔', 'auth_users: ' + (bkNoRpc(e) ? t('bk_need_sql') : (e.message || e))); }
      if (withSec){
        try{
          const { data, error } = await state.sb.rpc('admin_export_secrets');
          if (error) throw error;
          parts.push(',"secrets":' + JSON.stringify(data || []));
          bkLog('✔', `secrets: ${(data || []).length} — ${t('bk_secrets_warn')}`);
        }catch(e){ bkLog('⛔', 'secrets: ' + (e.message || e)); }
      }
    }
    parts.push('}');
    const name = `techlog-backup-${bkStamp()}.json`;
    bkDownload(new Blob(parts, { type: 'application/json' }), name);
    bkLog('✔', t('bk_done_file') + ': ' + name);
    audit('backup_export', 'system', 'backup', { counts, with_secrets: withSec });
  } finally { bkBusy(false); }
}
function bkImportPick(){
  if (!HAS_SB){ toast(t('bk_demo_imp'), 'err'); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (!confirm(t('bk_confirm'))) return;
    bkImportFile(f);
  };
  inp.click();
}
async function bkImportFile(file){
  bkLogLines = [`# TechLog — загрузка из бэкапа — ${new Date().toLocaleString()}`];
  const pre = $('#bk-log'); if (pre){ pre.style.display = 'block'; pre.textContent = ''; }
  const withSec = !!(($('#bk-sec') || {}).checked);
  bkBusy(true);
  try{
    let b;
    try{
      bkLog('·', t('bk_reading') + ' ' + file.name + ' …');
      b = JSON.parse(await file.text());
      if (!b || !b.tables) throw new Error(t('bk_notfile'));
    }catch(e){ bkLog('⛔', String(e.message || e)); return; }
    bkLog('·', `${t('bk_from')} ${(b.meta && b.meta.exported_at) || '?'} (${t('bk_by')}: ${(b.meta && b.meta.by) || '?'})`);

    let tIns = 0, tSkip = 0, tErr = 0;
    /* 1. учётные записи — раньше профилей (FK profiles.id → auth.users.id) */
    if (Array.isArray(b.auth_users) && b.auth_users.length){
      let c = 0, ex = 0;
      for (const u of b.auth_users){
        try{
          const { data, error } = await state.sb.rpc('admin_restore_auth_user', { p: u });
          if (error) throw error;
          if (data === 'created') c++; else ex++;
        }catch(e){
          tErr++;
          bkLog('⛔', `auth_users ${u.email || u.id}: ${bkNoRpc(e) ? t('bk_need_sql') : (e.message || e)}`);
          if (bkNoRpc(e)) return;
        }
      }
      bkLog('✔', `auth_users: ${t('bk_users_c')} ${c}, ${t('bk_users_e')} ${ex}`);
    }
    /* 2. таблицы в порядке зависимостей, пачками; дубли отсекает БД */
    for (const tb of BK_TABLES){
      const rows = b.tables[tb];
      if (!Array.isArray(rows) || !rows.length) continue;
      let ins = 0, skip = 0; const errs = [];
      for (let i = 0; i < rows.length; i += BK_CHUNK){
        try{
          const { data, error } = await state.sb.rpc('admin_restore_rows',
            { p_table: tb, p_rows: rows.slice(i, i + BK_CHUNK) });
          if (error) throw error;
          ins += data.inserted; skip += data.skipped;
          for (const e of (data.errors || [])) errs.push(e);
        }catch(e){
          if (bkNoRpc(e)){ bkLog('⛔', t('bk_need_sql')); return; }
          errs.push({ row: `#${i}–${i + BK_CHUNK}`, error: String(e.message || e) });
        }
      }
      tIns += ins; tSkip += skip; tErr += errs.length;
      bkLog(errs.length ? '⛔' : '✔',
        `${tb}: ${t('bk_added')} ${ins}, ${t('bk_dupes')} ${skip}, ${t('bk_errs')} ${errs.length}`);
      for (const e of errs) bkLog('⛔', `   ${tb} [${e.row}]: ${e.error}`);
    }
    /* 3. секреты — только по явной галочке */
    if (withSec && Array.isArray(b.secrets) && b.secrets.length){
      try{
        const { data, error } = await state.sb.rpc('admin_restore_secrets', { p: b.secrets });
        if (error) throw error;
        bkLog('✔', 'secrets: ' + data);
      }catch(e){ tErr++; bkLog('⛔', 'secrets: ' + (e.message || e)); }
    }
    if (b.tables.audit_log || b.tables.tech_log) bkLog('·', t('bk_journal_skip'));
    bkLog('✔', `${t('bk_total')}: ${t('bk_added')} ${tIns}, ${t('bk_dupes')} ${tSkip}, ${t('bk_errs')} ${tErr}`);
    audit('backup_restore', 'system', 'backup',
      { inserted: tIns, skipped: tSkip, errors: tErr, file: file.name });
    try{ if (App.sync) await App.sync(); }catch(e){}
    render();
  } finally { bkBusy(false); }
}
function backupCardHtml(){
  if (!isAdmin()) return '';
  return `<div class="card" id="bk-card">
    <div style="font-weight:900;margin-bottom:6px">${t('bk_card')}</div>
    <div class="tiny" style="margin-bottom:8px">${t('bk_intro')}</div>
    <div class="btn-rowpp" style="margin:0">
      <button id="bk-exp" class="btn btn-blue" onclick="App.bkExport()">${t('bk_export')}</button>
      <button id="bk-imp" class="btn btn-ghost" onclick="App.bkImportPick()">${t('bk_import')}</button>
    </div>
    <label class="opt" style="margin:8px 0 0">
      <input type="checkbox" id="bk-sec"> ${t('bk_secrets')}</label>
    <pre id="bk-log" style="display:none;max-height:260px;overflow:auto;background:#17232A;border:2px solid var(--line);border-radius:12px;padding:10px 12px;font-size:12px;white-space:pre-wrap;margin-top:8px"></pre>
    <button id="bk-save" class="btn btn-ghost sm" style="display:none;margin-top:6px" onclick="App.bkSaveLog()">${t('bk_savelog')}</button>
    <details style="margin-top:8px"><summary class="tiny">${t('bk_new_proj')}</summary>
      <div class="tiny" style="margin-top:6px;line-height:1.5">
        1. В новом проекте выполните ОДИН файл supabase/full-install-1_07_35.sql — это вся схема и все обновления разом.<br>
        2. Зарегистрируйтесь под <b>временным</b> логином (не совпадающим ни с одним старым) и назначьте себе admin через SQL-редактор.<br>
        3. Загрузите бэкап с галочкой секретов: учётки встанут первыми — сотрудники войдут <b>старыми паролями</b>.<br>
        4. Войдите под прежним логином, временного удалите или заблокируйте.<br>
        Журналы кнопкой не восстанавливаются (сниппет — в update-to-1_07_32.sql). Миниатюры фото в новый проект не переносятся; полноразмеры в Google Drive остаются доступны.
      </div>
    </details>
  </div>`;
}

/* =====================================================================
   v1.07.05: перетаскивание карточек дня жестом — зажать и тянуть ▲▼
   Работает и пальцем (long-press ~0.34 c), и мышью. Кнопки ▲▼ остаются.
   ===================================================================== */
let dnd = null;              // { el, id, pid, x, y, active, timer, staticTop, grabDY }
let dndClickBlock = 0;       // подавить клик, случившийся сразу после drag
function dndItems(){ return [...document.querySelectorAll('#app .item[data-drag-id]')]; }
function dndCalib(){
  if (!dnd) return;
  const tr = dnd.el.style.transform;
  dnd.el.style.transform = 'none';
  const r = dnd.el.getBoundingClientRect();
  dnd.staticTop = r.top;
  dnd.staticLeft = r.left;                                  // v1.07.20: двухколоночная сетка ПК
  dnd.el.style.transform = tr;
}
function dndPlace(clientX, clientY){
  dnd.el.style.transform =
    `translate(${(clientX - dnd.grabDX) - dnd.staticLeft}px, ${(clientY - dnd.grabDY) - dnd.staticTop}px)`;
}
function dndActivate(){
  if (!dnd || dnd.active) return;
  dnd.active = true;
  try{ dnd.el.setPointerCapture(dnd.pid); }catch(e){}
  dnd.el.classList.add('dragging');
  document.body.classList.add('dnd-on');
  dndCalib();
  dnd.grabDY = dnd.y - dnd.staticTop;
  dnd.grabDX = dnd.x - dnd.staticLeft;
  dndPlace(dnd.x, dnd.y);
  navigator.vibrate?.(30);
}
function dndDown(e){
  if (dnd || state.screen !== 'home') return;
  if (e.button != null && e.button !== 0) return;
  const el = e.target.closest('.item[data-drag-id]');
  if (!el || el.dataset.can !== '1') return;
  if (e.target.closest('button,select,input,a,textarea,.key-copy')) return;
  /* v1.07.22: у мыши нет конфликта «скролл или перенос» — таймер удержания
     не нужен: обычный клик открывает карточку, а движение с зажатой кнопкой
     сразу начинает перенос (см. dndMove). Пальцу — прежний long-press 340 мс. */
  const mouse = e.pointerType === 'mouse';
  dnd = { el, id: el.dataset.dragId, pid: e.pointerId, x: e.clientX, y: e.clientY,
          mouse, active: false, timer: mouse ? 0 : setTimeout(dndActivate, 340) };
}
function dndMove(e){
  if (!dnd) return;
  if (!dnd.active){
    const th = dnd.mouse ? 6 : 8;
    if (Math.abs(e.clientY - dnd.y) > th || Math.abs(e.clientX - dnd.x) > th){
      if (!dnd.mouse){ clearTimeout(dnd.timer); dnd = null; return; } // палец «поехал» до long-press — это скролл
      dndActivate();  // v1.07.22: мышь потянула карточку — начинаем перенос и ведём её этим же событием
    } else return;
  }
  if (e.cancelable) e.preventDefault();
  // автопрокрутка страницы у верхнего/нижнего края
  if (e.clientY < 90){ window.scrollBy(0, -14); dndCalib(); }
  else if (e.clientY > window.innerHeight - 110){ window.scrollBy(0, 14); dndCalib(); }
  dndPlace(e.clientX, e.clientY);
  /* v1.07.20: цель ищем и по X (двухколоночная сетка ПК), и только в СВОЁМ
     списке — карточка работы не должна «впрыгивать» в список пикапов */
  const over = dndItems().find(o => {
    if (o === dnd.el || o.parentNode !== dnd.el.parentNode) return false;
    const r = o.getBoundingClientRect();
    return e.clientY >= r.top && e.clientY <= r.bottom
        && e.clientX >= r.left && e.clientX <= r.right;
  });
  if (over){
    const r = over.getBoundingClientRect();
    const midX = r.left + r.width / 2, midY = r.top + r.height / 2;
    /* в колонке решаем по вертикали; в ряду сетки (палец у вертикальной
       середины соседа) — по горизонтали, порядок чтения слева-направо */
    const before = (Math.abs(e.clientY - midY) >= r.height * 0.22)
      ? e.clientY < midY
      : e.clientX < midX;
    const p = over.parentNode;
    if (before && over.previousElementSibling !== dnd.el){
      p.insertBefore(dnd.el, over); dndCalib(); dndPlace(e.clientX, e.clientY);
    } else if (!before && over.nextElementSibling !== dnd.el){
      p.insertBefore(dnd.el, over.nextElementSibling); dndCalib(); dndPlace(e.clientX, e.clientY);
    }
  }
}
function dndFinish(apply){
  if (!dnd) return;
  clearTimeout(dnd.timer);
  const was = dnd.active;
  if (was){
    dnd.el.classList.remove('dragging');
    dnd.el.style.transform = '';
    document.body.classList.remove('dnd-on');
    dndClickBlock = Date.now() + 350;
  }
  const ids = (was && apply) ? [...new Set(dndItems().map(el => el.dataset.dragId))] : null;
  dnd = null;
  if (ids) applyDayOrder(ids);
  else if (was) render(); // отмена — вернуть как было
}
async function applyDayOrder(ids){
  for (let i = 0; i < ids.length; i++){
    const j = state.data.jobs.find(x => x.id === ids[i]);
    if (!j || (j.sort_order || 0) === i) continue;
    if (canReorder(j)){ try{ await saveJobPatch(j, { sort_order: i }); }catch(e){ toast('⛔ ' + rpcFail(e, 'board_job_flags'), 'err'); break; } }
    else j.sort_order = i; // чужие — только локально для отображения
  }
  navigator.vibrate?.(15);
  dlog('dnd: порядок дня обновлён перетаскиванием');
  render();
}
function initDragSort(){
  document.addEventListener('pointerdown', dndDown, { passive: true });
  document.addEventListener('pointermove', dndMove, { passive: false });
  document.addEventListener('pointerup', () => dndFinish(true));
  document.addEventListener('pointercancel', () => dndFinish(false));
  window.addEventListener('blur', () => dndFinish(false));   // v1.07.22: мышь отпущена вне окна / alt-tab — не зависаем в захвате
  /* v1.07.20: на тач-устройствах прокрутку останавливает только touchmove.
     preventDefault на pointermove скролл НЕ отменяет — браузер начинал
     прокрутку и стрелял pointercancel, убивая перетаскивание на первом же
     движении пальца. Гасим прокрутку, только пока карточка реально «в руке». */
  document.addEventListener('touchmove', e => {
    if (dnd && dnd.active && e.cancelable) e.preventDefault();
  }, { passive: false });
  /* долгое нажатие не должно вызывать контекстное меню/выделение */
  document.addEventListener('contextmenu', e => { if (dnd) e.preventDefault(); });
  // пока карточка «в руке» — не даём странице скроллиться под пальцем
  document.addEventListener('touchmove', e => { if (dnd && dnd.active && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => { if (dnd) e.preventDefault(); });
  document.addEventListener('click', e => {
    if (Date.now() < dndClickBlock){ e.preventDefault(); e.stopPropagation(); }
  }, true);
}

/* ---------- v1.07.05: вкладки справочников — drag-скролл мышью ----------
   (пальцем полоса вкладок скроллится нативно; стрелки ‹ › — App.dirTabsScroll) */
let tdrag = null, tabsClickBlock = 0;
function initTabsDrag(){
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('.tabs');
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    tdrag = { el, x: e.clientX, left: el.scrollLeft, moved: false, pid: e.pointerId };
  }, { passive: true });
  document.addEventListener('pointermove', e => {
    if (!tdrag) return;
    const dx = e.clientX - tdrag.x;
    if (!tdrag.moved && Math.abs(dx) > 6){
      tdrag.moved = true;
      tdrag.el.classList.add('grabbing');
      try{ tdrag.el.setPointerCapture(tdrag.pid); }catch(_){}
    }
    if (tdrag.moved) tdrag.el.scrollLeft = tdrag.left - dx;
  });
  const tEnd = () => {
    if (!tdrag) return;
    tdrag.el.classList.remove('grabbing');
    if (tdrag.moved) tabsClickBlock = Date.now() + 300;
    tdrag = null;
  };
  document.addEventListener('pointerup', tEnd);
  document.addEventListener('pointercancel', tEnd);
  document.addEventListener('click', e => {
    if (Date.now() < tabsClickBlock && e.target.closest('.tabs')){ e.preventDefault(); e.stopPropagation(); }
  }, true);
}

/* =====================================================================
   v1.05: коды доступа — callbox/ворота, заявки админу, история
   ===================================================================== */
function codeLineHtml(cx, compact){
  const parts = [];
  if (cx.access_code) parts.push(`<button class="key-copy" onclick="event.stopPropagation();App.copyText('${esc(cx.access_code)}')">${ic('key')} ${esc(cx.access_code)}</button>`);
  if (cx.callbox_code) parts.push(`<button class="key-copy" onclick="event.stopPropagation();App.copyText('${esc(cx.callbox_code)}')">${cx.callbox_gate ? ic('gate') : ic('callbox')} ${esc(cx.callbox_code)}</button>`);
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
    <div class="rowline"><div class="grow">${ic('key')} ${esc(cx.access_code||'—')} ${firstSeenLine(cxId,'access',cx.access_code)}</div></div>
    <div class="rowline"><div class="grow">${cx.callbox_gate?ic('gate'):ic('callbox')} ${esc(cx.callbox_code||'—')}
      <span class="tiny">(${cx.callbox_gate ? t('target_gate') : t('target_callbox')})</span> ${firstSeenLine(cxId,'callbox',cx.callbox_code)}</div></div>`;
  const hist = rows.length ? rows.map(h => `
    <div class="rowline">
      <div class="grow" style="font-size:.8rem">
        ${h.field==='access'?ic('key'):(h.gate?ic('gate'):ic('callbox'))}
        <s style="color:var(--dim-2)">${esc(h.old_value||'—')}</s> → <b>${esc(h.new_value||'—')}</b>
        ${h.source==='request' ? `<span class="chip">${t('req_by')}</span>` : ''}
        <div class="tiny">${fmtDMY(String(h.changed_at).slice(0,10))} ${String(h.changed_at).slice(11,16)} · ${t('by_word')}: ${esc(profName(h.changed_by))}</div>
      </div>
    </div>`).join('') : `<div class="tiny">${t('no_history')}</div>`;
  openModal(`
    ${modalHead(t('code_history') + ' — ' + cx.name, 'book')}
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
    ${modalHead(t('propose_code') + ' — ' + cx.name, 'key')}
    <div class="form-row"><span class="lbl">${t('access_code')}</span>
      <input id="pc-access" value="${esc(cx.access_code||'')}"></div>
    <div class="form-row"><span class="lbl">${t('callbox')}</span>
      <input id="pc-callbox" value="${esc(cx.callbox_code||'')}"></div>
    <div class="form-row"><span class="lbl">${t('code_target')}</span>
      <div class="tabs">
        <button class="tabbtn ${!cx.callbox_gate?'active':''}" data-gate="0" onclick="App.pcGate(this)">${ic('callbox')} ${t('target_callbox')}</button>
        <button class="tabbtn ${cx.callbox_gate?'active':''}" data-gate="1" onclick="App.pcGate(this)">${ic('gate')} ${t('target_gate')}</button>
      </div>
      <input type="hidden" id="pc-gate" value="${cx.callbox_gate?1:0}"></div>
    <button class="btn btn-green" onclick="App.submitCode('${cx.id}')">${isAdmin() ? t('save') : ic('send')+' ' + t('propose_code')}</button>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="App.closeModal();App.codeHistory('${cx.id}')">${ic('book')} ${t('history')}</button>
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
    <div style="font-weight:900;margin-bottom:6px">${ic('bell')} ${t('code_requests')} (${list.length})</div>
    ${list.map(r => {
      const cx = cxById(r.complex_id) || {name:'?'};
      const ch = [];
      if (r.access_code !== null && r.access_code !== undefined) ch.push(`${ic('key')} ${esc(cx.access_code||'—')} → <b>${esc(r.access_code)}</b>`);
      if (r.callbox_code !== null && r.callbox_code !== undefined) ch.push(`${ic('callbox')} ${esc(cx.callbox_code||'—')} → <b>${esc(r.callbox_code)}</b>`);
      if (r.callbox_gate !== null && r.callbox_gate !== undefined) ch.push(`${r.callbox_gate?ic('gate')+' '+t('target_gate'):ic('callbox')+' '+t('target_callbox')}`);
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
        <div class="ex-head"><b>${ic('cart')} ${esc(it.name)}</b>
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
      <div class="ex-head"><b>${ic('toolbox')} ${esc(it.name)}</b>
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
        <span style="font-size:1.2rem">${w.kind==='purchase'?ic('cart'):ic('toolbox')}</span>
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
      <div class="grow">${ic('ruler')} <b>${esc(s.name)}</b> <span class="tiny">· ${esc(s.unit)}</span></div>
      <button class="btn btn-ghost sm" onclick="App.editSzModal('${s.id}')">${t('edit')}</button>
    </div>`).join('') || `<div class="tiny">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editSzModal()">＋ ${t('add')}</button>`;
}
function editSzModal(id){
  const s = id ? szById(id) : { id: uid(), name:'', unit:'', sort: (state.data.size_types||[]).length+1 };
  openModal(`
    ${modalHead(t('d_sizes'), 'ruler')}
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
      <div class="grow">${w.kind==='purchase'?ic('cart'):ic('toolbox')} <b>${esc(w.name)}</b>
        <div class="tiny">${w.kind==='purchase' ? t('kind_purchase') : t('kind_work')}${w.needs_size && sz ? ' · ' + ic('ruler') + ' ' + esc(sz.name) + ' (' + esc(sz.unit) + ')' : ''}${+w.price ? ' · ' + ic('dollar') + ' ' + money(+w.price) + (w.needs_size ? '/' + esc((sz||{}).unit||'ед.') : '') : ''}</div></div>
      <button class="btn btn-ghost sm" onclick="App.editEwModal('${w.id}')">${t('edit')}</button>
    </div>`;
  }).join('') || `<div class="tiny">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editEwModal()">＋ ${t('add')}</button>`;
}
function editEwModal(id){
  const w = id ? ewById(id) : { id: uid(), name:'', kind:'work', needs_size:false, size_type_id:null, sort:(state.data.extra_works||[]).length+1 };
  const sizes = [...(state.data.size_types||[])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  openModal(`
    ${modalHead(t('d_extraworks'), 'toolbox')}
    <div class="form-row"><span class="lbl">${t('name')}</span><input id="ew-name" value="${esc(w.name)}" placeholder="Вырезка стен / Wall cutout"></div>
    <div class="form-row"><span class="lbl">&nbsp;</span>
      <div class="tabs">
        <button class="tabbtn ${w.kind!=='purchase'?'active':''}" data-kind="work" onclick="App.pcGate ? (this.parentElement.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active')), this.classList.add('active'), document.getElementById('ew-kind').value='work') : null">${ic('toolbox')} ${t('kind_work')}</button>
        <button class="tabbtn ${w.kind==='purchase'?'active':''}" data-kind="purchase" onclick="(this.parentElement.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active')), this.classList.add('active'), document.getElementById('ew-kind').value='purchase')">${ic('cart')} ${t('kind_purchase')}</button>
      </div>
      <input type="hidden" id="ew-kind" value="${w.kind}"></div>
    <div class="form-row"><span class="lbl">${t('price_lbl')} <span class="tiny">(${t('price_per_size')} — если включён размер)</span></span>
      <input id="ew-price" class="price-input" inputmode="decimal" value="${w.price||''}" style="width:120px"></div>
    <label class="opt ${w.needs_size?'on':''}" style="margin-bottom:8px"><input type="checkbox" id="ew-size" ${w.needs_size?'checked':''} onchange="this.closest('.opt').classList.toggle('on', this.checked)"> ${ic('ruler')} ${t('needs_size')}</label>
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
      <div class="grow">${ic('cart')} <b>${esc(p.name)}</b><div class="tiny">${t('default_price')}: ${money(+p.default_price||0)}</div></div>
      <button class="btn btn-ghost sm" onclick="App.editPtModal('${p.id}')">${t('edit')}</button>
    </div>`).join('') || `<div class="tiny">—</div>`) + `</div>
    <button class="btn btn-green" onclick="App.editPtModal()">＋ ${t('add')}</button>`;
}
function editPtModal(id){
  const p = id ? ptById(id) : { id: uid(), name:'', default_price:0, sort:(state.data.product_types||[]).length+1 };
  openModal(`
    ${modalHead(t('d_products'), 'cart')}
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
/* v1.07.11: карточки выбранного дня — работы по видам и пикапы по оборудованию.
   Общий рендер используется и на главной, и в примере внутри FAQ. */
function dayStatsCardsHtml(jobsByWt, eqByType, over){
  const totalJobs = jobsByWt.reduce((s, x) => s + x.count, 0);
  const totalPk = eqByType.reduce((s, x) => s + x.count, 0);
  const wtLines = jobsByWt.map(x => `
      <span class="wt-line"><i class="wt-dot" style="background:${x.color}"></i><span class="wt-nm" style="color:${x.color}" title="${esc(x.name)}">${esc(x.name)}</span><b>${x.count}</b></span>`).join('');
  const eqBadges = eqByType.map(x => `
      <span class="eq-badge" title="${esc(x.name)}">
        <span class="icon-circle" style="background:${x.color};color:${textColorFor(x.color)}">${esc(x.abbr)}</span>
        <b>${x.count}</b>
      </span>`).join('');
  return `<div class="stats-day">
    <div class="dcard c-blue">
      <div class="dcard-head"><span class="n">${totalJobs}</span><span class="l">${t('stats_jobs')}</span></div>
      ${jobsByWt.length ? `<div class="wt-lines">${wtLines}</div>` : `<div class="tiny dim-empty">${t('day_empty')}</div>`}
    </div>
    <div class="dcard c-gray">
      <div class="dcard-head"><span class="n">${totalPk}</span><span class="l">${t('stats_pk')}</span>${over > 0 ? `<span class="chip bad sm-chip">${t('stats_over')}: ${over}</span>` : ''}</div>
      ${eqByType.length ? `<div class="eq-badges">${eqBadges}</div>` : `<div class="tiny dim-empty">${t('day_empty')}</div>`}
    </div>
  </div>`;
}

function homeStatsHtml(){
  const iso = state.selDate || todayISO();
  const today = todayISO();
  // Работы выбранного дня, сгруппированные по видам (те же, что в списке ниже)
  const byWt = {};
  jobsOn(iso).forEach(j => { byWt[j.work_type_id] = (byWt[j.work_type_id] || 0) + 1; });
  const jobsByWt = Object.entries(byWt)
    .map(([id, count]) => { const wt = wtById(id) || { name: '?', color: '#8B9AA3' }; return { name: wt.name, color: wt.color, count }; })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  // Пикапы, которые нужно забрать в этот день (для «сегодня» — включая просроченные)
  const rows = visiblePlacements().filter(p => pkPending(p) && (p.due_date === iso || (iso === today && p.due_date < today)));
  const byEq = {}; let over = 0;
  rows.forEach(p => {
    byEq[p.equipment_type_id] = (byEq[p.equipment_type_id] || 0) + (+p.qty || 1);
    if (p.due_date < iso) over++;
  });
  const eqByType = Object.entries(byEq)
    .map(([id, count]) => { const et = state.data.equipment_types.find(e => e.id === id) || { abbr: '?', color: '#8B9AA3', name: '?' }; return { abbr: et.abbr, color: et.color, name: et.name, count }; })
    .sort((a, b) => b.count - a.count || String(a.abbr).localeCompare(String(b.abbr)));
  return dayStatsCardsHtml(jobsByWt, eqByType, over);
}

/* Пример дня для FAQ: Steam Clean 4 · Air Duct 2 · Vetvag 1; BLW 5, DHM 2, SCR 1, 1 просрочен */
function faqDayCardsExample(){
  return dayStatsCardsHtml(
    [ { name: 'STEAM CLEAN', color: '#FF9600', count: 4 },
      { name: 'AIR DUCT', color: '#FF4B4B', count: 2 },
      { name: 'VETVAG (water extraction)', color: '#58CC02', count: 1 } ],
    [ { abbr: 'BLW', color: '#58CC02', name: 'Blower', count: 5 },
      { abbr: 'DHM', color: '#1CB0F6', name: 'Dehumidifier', count: 2 },
      { abbr: 'SCR', color: '#FF4B4B', name: 'Air Scrubber', count: 1 } ],
    1);
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
  const placed = plAll.filter(p => !p.superseded && inRange(p.placed_date, from, to));
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
    <div class="stat-lg c-green"><div class="n">${money(d.earned)}</div><div class="l">${ic('dollar')} ${t('st_earned')}</div>
      <div class="s">${t('st_approved_sum')}: ${money(d.approvedSum)}</div></div>
    <div class="stat-lg c-blue"><div class="n">${d.doneCnt}</div><div class="l">${ic('chk_on')} ${t('st_done')}</div>
      <div class="s">${t('st_total')}: ${d.jobsTotal} · ${t('st_avg')}: ${money(d.avg)}</div></div>
    <div class="stat-lg c-purple"><div class="n">${d.miles.toFixed(1)}</div><div class="l">${ic('car')} ${t('st_miles')}</div>
      <div class="s">${t('st_miles_hint')}</div></div>
    <div class="stat-lg c-gray"><div class="n">${d.pickedCnt}</div><div class="l">${ic('box')} ${t('st_picked')}</div>
      <div class="s">✓ ${t('st_ontime')}: ${d.onTime} · ${ic('clock')} ${t('st_late')}: ${d.late}</div></div>
    <div class="stat-lg c-teal"><div class="n">${d.visited}</div><div class="l">${ic('building')} ${t('st_visited')}</div>
      <div class="s">${ic('toolbox')} ${t('st_eq')}: ${d.eqUnits} ${t('st_units')}</div></div>
    <div class="stat-lg c-yellow"><div class="n">${money(d.purchases)}</div><div class="l">${ic('cart')} ${t('st_purchases')}</div>
      <div class="s">&nbsp;</div></div>
  </div>

  ${d.chart.length ? `
  <div class="card">
    <div style="font-weight:900;margin-bottom:8px">${ic('chart')} ${t('chart_earn')}</div>
    <div class="bar-chart">${bars}</div>
  </div>` : ''}`;
}
