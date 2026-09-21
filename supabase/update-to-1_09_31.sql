-- =====================================================================
-- TechLog · обновление до v1.09.31 — пропозал клиенту не отправляется (статус «Отправлен» выключен, включает админ);
-- тест документооборота: события тестовых документов идут и в ленту, и пушем (ведущему тест или всем участникам), отчёт о пушах.
-- Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_30. С нуля — full-install-1_09_31.sql. Edge Functions: ПЕРЕДЕПЛОИТЬ dft.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.30 — функция тестирования документооборота: документ ремонта (rep_create / rep_update / rep_get),
-- приём в тест пропозала и ремонта, созданных кнопками (prop_adopt / rep_adopt), уборка тестовых ремонтов. Идемпотентно.
-- ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_29. С нуля — full-install-1_09_30.sql. Edge Functions: ПЕРЕДЕПЛОИТЬ dft.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.29 — ревизия документа на момент апрува (jobs.approved_rev): раздел «Апрув не совпадает с расчётом»
-- больше не гадает по часам устройств. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_28.
-- С нуля — full-install-1_09_29.sql. Edge Functions после 1.09.28 не менялись.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.28 — тест документооборота идёт кнопками: операция job_adopt (документ, созданный кнопкой
-- «Добавить задание», принимается в тест), номер пикапа выдаётся после вставки (тестовые пикапы не тратят настоящую нумерацию),
-- решение по заявке на продление — в закрытом списке функции. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_27.
-- С нуля — full-install-1_09_28.sql. Edge Functions: ПЕРЕДЕПЛОИТЬ dft (добавлена операция job_adopt).
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.27 — режим тестирования документооборота: пометка «тестовый документ» (ставит только база),
-- служебная функция dft_exec (только service_role) для Edge Function dft, включение режима админом на срок, тестовые документы
-- не тратят нумерацию, не двигают склад и не шлют пушей. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_26.
-- С нуля — full-install-1_09_27.sql. Edge Functions: НОВАЯ функция dft (нужна только для теста; приложение работает и без неё).
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.26 — документооборот, исправления по разбору цикла: перевод обязателен при отправке на
-- согласование, своя заметка пикапа, пикап в архив вместо удаления (склад возвращает технику), менеджер технику в чужом документе
-- не правит, привязка пропозала к запертому инвойсу и апрув своего инвойса — с разрешения админа, основной удаляет только документ
-- без номера, ревизия различает устройства, запрос правки закрывается сам. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_25.
-- С нуля — full-install-1_09_26.sql. Edge Functions после 1.09.23 не менялись.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.25 — документооборот инвойса: личные права (сокращение для номера, «правка общих документов»,
-- «апрув инвойсов»), бригада видит документ всегда, «Выполнена» и «Апрув» запирают документ, «отозвать» / «вернуть на
-- доработку» / «запросить правку», ревизия строки против затирания чужих правок, мягкая блокировка «занято», номер документа
-- при первом НЕ черновике, лента уведомлений. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_24 — достаточно одного этого файла.
-- С нуля — full-install-1_09_25.sql. Edge Functions после 1.09.23 не менялись.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.24 — чат: модерация в группах (создатель и назначенные админы группы), «не беспокоить»,
-- срок хранения переписки по умолчанию без ограничения, бухгалтер в чате с правами менеджера, лимиты от потока,
-- пароль от 10 символов на сервере. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_23 — достаточно одного этого файла.
-- С нуля — full-install-1_09_24.sql. Edge Functions после 1.09.23 не менялись.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.23 — исправления по ревью чата и пушей (заголовок уведомления = переписка, строки групп
-- с именем автора, проверка ключа в отметке чтения, тайм-аут вызова функции от базы). Идемпотентно.
-- ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_22 — достаточно одного этого файла. С нуля — full-install-1_09_23.sql.
-- Edge Functions: передеплой push (PUSH_VER 1.09.23). push-setup.sql повторно запускать не нужно.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.22 — надёжные push-уведомления: отправка сразу от базы (pg_net), защита от двойной
-- отправки, ссылки из уведомления прямо в документ, новое уведомление «Документ изменён».
-- Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_21 — достаточно одного этого файла. С нуля — full-install-1_09_22.sql.
-- ПОСЛЕ НЕГО: 1) передеплой Edge Function push (PUSH_VER 1.09.22); 2) один раз выполнить push-setup.sql.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.21 — ключи защиты переписки (шаг «ключи без шифрования»):
-- chat_pubkeys, chat_keys (сейф читает только владелец), chat_org_key, chat_org_holders и функции chat_key_*.
-- Сообщения этим выпуском НЕ шифруются. Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_20.
-- С нуля — full-install-1_09_21.sql. Edge Functions не менялись.
-- В бэкап на Диск таблицы ключей НЕ входят намеренно (это запертые ключи; их место — только база).
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.20 — чат: группы (таблицы chat_groups, chat_members, chat_msgs.group_id,
-- функции chat_group_*, новая подпись chat_send с группой). Идемпотентно.
-- ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_19 — достаточно одного этого файла. С нуля — full-install-1_09_20.sql.
-- ПОРЯДОК: сначала этот SQL, потом публикация сборки. Edge Functions после 1.09.19 не менялись.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.19 — чат «как привычно»: ответ на сообщение, правка, реакции, фото,
-- срок хранения переписки (по умолчанию 180 дней), уборка текста доставленных чат-пушей.
-- Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_18 — достаточно одного этого файла.
-- С нуля — full-install-1_09_19.sql.
-- ПОРЯДОК: сначала этот SQL, потом публикация сборки (до SQL новая сборка отправляет простой текст и
-- документы по-старому, а ответы, реакции и фото просят выполнить этот файл).
-- Edge Functions: передеплой backup (BK_VER 1.09.19) — чат из автобэкапа на Диск убран.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.18 — чат: отметка «прочитано» и мгновенная доставка (Realtime);
-- восстановление из JSON-бэкапа принимает оплаты бухгалтерии и шаблоны заметок.
-- Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_17 — достаточно одного этого файла.
-- С нуля — full-install-1_09_18.sql.
-- Edge Functions: ПЕРЕДЕПЛОЙ backup (BK_VER 1.09.18) — в SQL-автобэкап добавлены прайс, остатки склада,
-- настройки и оплаты бухгалтерии, шаблоны заметок, учёба и чат (раньше их там НЕ было).
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.17 — «Сообщения»: внутренний чат (таблицы chat_msgs, chat_reads,
-- функции chat_send / chat_mark_read, push «Сообщения в чате»). Идемпотентно. ВКЛЮЧАЕТ
-- update-to-1_09_08 … 1_09_15 (в 1.09.16 база не менялась) — достаточно одного этого файла.
-- С нуля — full-install-1_09_17.sql. Edge Functions после 1.09.13 не менялись
-- (если ещё не передеплоили — push и media-begin). Чтобы сообщения приходили пушем, когда TechLog
-- ни у кого не открыт, выполните один раз cron-push-morning.sql (очередь разбирается каждые 15 минут).
-- Таблица doc_shares (журнал пересылок 1.09.14) больше не используется: документы уходят в чат.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.15 — оплаты по инвойсам и ремонтам (таблица acc_payments:
-- видят и ведут только администратор и бухгалтер). Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 …
-- 1_09_14 — если они ещё не выполнялись, достаточно этого файла. С нуля — full-install-1_09_15.sql.
-- Edge Functions после 1.09.13 не менялись (если ещё не передеплоили — push и media-begin).
-- ВАЖНО: в SQL-автобэкап (Edge Function backup) таблица acc_payments пока НЕ входит.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.14 — пересылка документов внутри TechLog (таблица doc_shares,
-- функции doc_share_send / doc_share_read, push «Вам отправили документ»).
-- Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_13 — если они ещё не выполнялись, достаточно
-- этого файла. С нуля — full-install-1_09_14.sql. Edge Functions не менялись после 1.09.13
-- (если ещё не передеплоили — push и media-begin).
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.13 — порядок на доске с push сотруднику, профиль сотрудника
-- (техник · ремонтник · помощник), «Ремонт» только ремонтникам.
-- Идемпотентно. ВКЛЮЧАЕТ update-to-1_09_08 … 1_09_12 — если они ещё не выполнялись, достаточно
-- этого файла. С нуля — full-install-1_09_13.sql.
-- Edge Functions: ПЕРЕДЕПЛОЙ push (утренняя сводка пикапов, PUSH_VER 1.09.13) и, если ещё не делали,
-- media-begin (1.09.12). Утренняя сводка по расписанию — отдельный файл cron-push-morning.sql.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.12 — новый бланк инвойса, лимиты 30 фото / 5 видео,
-- «Перенести день» скрыт по умолчанию, своё название трекера, привязка неактивного трекера.
-- Идемпотентно: можно запускать повторно. ВКЛЮЧАЕТ update-to-1_09_08, 1_09_09 и 1_09_10 —
-- если они ещё не выполнялись, достаточно этого файла. С нуля — full-install-1_09_12.sql.
-- Edge Functions: ПЕРЕДЕПЛОЙ media-begin (буква U перед юнитом в имени файла, лимиты 30/5);
-- если ещё не делали после 1.09.10 — также bouncie, media-commit, media-health.
-- =====================================================================

-- =====================================================================
-- TechLog · обновление до v1.09.10 — история треков машин
--  · bn_trips / bn_trip_days — поездки по дням из Bouncie (пишет только Edge Function bouncie).
-- Идемпотентно: можно запускать повторно. Включает update-to-1_09_08 и 1_09_09 — если они ещё
-- не выполнялись, достаточно этого файла. С нуля — full-install-1_09_10.sql.
-- Edge Functions: ПЕРЕДЕПЛОЙ bouncie (история треков), media-begin, media-commit, media-health
-- (папка заблокированного сотрудника «Имя Ф Заблокирован»).
-- =====================================================================

-- =====================================================================
-- v1.09.08 · СТАНДАРТНЫЕ ГАЛОЧКИ ВИДА РАБОТЫ + вид работы OTHER
-- =====================================================================
-- work_types.preset — массив «раздел.ключ» галочек бланка, которые ставятся
-- сами при создании документа этого вида (и при смене вида в документе с
-- нетронутыми галочками). NULL = встроенный набор приложения по названию
-- вида (VETVAG → Wet Vac, DAMAGE WATER → Flood, STEAM → Deep Scrub,
-- AIR DUCT → Air Duct Cleaning); админ правит в «Справочники → Виды задач».
alter table public.work_types add column if not exists preset jsonb;

-- вид работы OTHER: пустой набор галочек; не добавляется, если свой «Other» уже заведён
insert into public.work_types (id, name, color, needs_aux, aux_ids, sort)
select 'b0000000-0000-4000-8000-000000000007'::uuid, 'OTHER', '#8AA0AB', false, '[]'::jsonb, 7
where not exists (select 1 from public.work_types where upper(name) like 'OTHER%')
on conflict (id) do nothing;

-- =====================================================================
-- v1.09.09 · ПОРЯДОК СПРАВОЧНИКОВ + РЕЖИМ СКЛАДА
-- =====================================================================
-- org_settings.dir_order  — порядок вкладок «Справочников», общий для всех (массив ключей вкладок;
--                           пусто = порядок по умолчанию). Личная вкладка «по умолчанию» лежит
--                           в profiles.push_prefs.dir_default — колонка не нужна.
-- org_settings.stock_mode — 'full' (склад → машина → объект → машина → склад) или 'lite'
--                           (только аренда/продление вычитают, «Забрал» возвращает; машины не считаются).
alter table public.org_settings add column if not exists dir_order  jsonb;
alter table public.org_settings add column if not exists stock_mode text not null default 'full';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'org_settings_stock_mode_chk') then
    alter table public.org_settings add constraint org_settings_stock_mode_chk check (stock_mode in ('full','lite'));
  end if;
end $$;

-- =====================================================================
-- v1.09.10 · ИСТОРИЯ ТРЕКОВ МАШИН (Bouncie)
-- =====================================================================
-- bn_trips     — поездки машин по дням: одна строка = одна поездка (старт, финиш, мили,
--                маршрут encoded polyline). День — по времени Нью-Йорка. Пишет ТОЛЬКО Edge
--                Function bouncie (service role): попутно из ?stats=1 / ?tv=1 и по запросу
--                ?tracks=1. Читают админ и сотрудники с правом «Трек дня» (profiles.bn_track).
-- bn_trip_days — какие дни уже догружены из Bouncie и когда; «закрытый» день (сохранён после
--                конца суток) повторно у Bouncie не запрашивается.
create table if not exists public.bn_trips (
  id          uuid primary key default gen_random_uuid(),
  imei        text not null,
  day         date not null,
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  mi          numeric(8,1) not null default 0,
  gps         text not null default '',
  tx          text,
  driver_id   uuid references public.profiles(id) on delete set null,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists bn_trips_imei_start_uq on public.bn_trips (imei, started_at);
create index if not exists bn_trips_day_idx on public.bn_trips (day, imei);

create table if not exists public.bn_trip_days (
  day        date primary key,
  synced_at  timestamptz not null default now()
);

alter table public.bn_trips     enable row level security;
alter table public.bn_trip_days enable row level security;
drop policy if exists bn_trips_sel on public.bn_trips;
create policy bn_trips_sel on public.bn_trips for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and not coalesce(p.blocked, false)
                 and (p.role = 'admin' or p.bn_track is true)));
drop policy if exists bn_trip_days_sel on public.bn_trip_days;
create policy bn_trip_days_sel on public.bn_trip_days for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and not coalesce(p.blocked, false)
                 and (p.role = 'admin' or p.bn_track is true)));
-- вставка / правка / удаление — только service role (Edge Function), политик для них нет намеренно
revoke insert, update, delete on public.bn_trips, public.bn_trip_days from authenticated, anon;
grant select on public.bn_trips, public.bn_trip_days to authenticated;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='work_types' and column_name='preset')
     then miss := miss || ' work_types.preset'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='dir_order')
     then miss := miss || ' org_settings.dir_order'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='stock_mode')
     then miss := miss || ' org_settings.stock_mode'; end if;
  if to_regclass('public.bn_trips') is null then miss := miss || ' bn_trips'; end if;
  if to_regclass('public.bn_trip_days') is null then miss := miss || ' bn_trip_days'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='bn_trips_imei_start_uq') then miss := miss || ' bn_trips_imei_start_uq'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bn_trips' and policyname='bn_trips_sel') then miss := miss || ' bn_trips_sel'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.10 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.10 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.12 · НОВЫЙ БЛАНК, ЛИМИТЫ МЕДИА, «ПЕРЕНЕСТИ ДЕНЬ», ТРЕКЕРЫ
-- =====================================================================
-- 1) Позиции прайса нового бумажного бланка. Цена 0 — её задаёт админ в «Ценах»;
--    пока цена 0, галочка печатается в бланке, но на сумму не влияет.
insert into public.price_list (key, name, unit_label, price, sort) values
 ('steam_portable','Steam Clean — Portable','per room',0,101),
 ('rem_imprint','Removal — Imprint','flat',0,102),
 ('oth_crb','Other — Crb Machine','flat',0,103)
on conflict (key) do nothing;

-- 2) Кнопка «Перенести день» — по умолчанию скрыта (Настройки → Прочие функции → Функции)
alter table public.org_settings add column if not exists day_move_on boolean not null default false;

-- 3) Лимиты на документ по умолчанию: 30 фото и 5 видео. Значения, которые админ уже менял
--    (не 10 и не 2), не трогаются.
alter table public.org_settings alter column media_max_photo set default 30;
alter table public.org_settings alter column media_max_video set default 5;
update public.org_settings set media_max_photo = 30 where media_max_photo = 10;
update public.org_settings set media_max_video = 5  where media_max_video = 2;

-- 4) Трекеры Bouncie: своё название и привязка НЕАКТИВНОГО трекера (предупреждает приложение)
alter table public.bn_devices add column if not exists label text;

create or replace function public.bn_device_label(p_imei text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  update public.bn_devices set label = nullif(left(trim(coalesce(p_label, '')), 40), '')
   where imei = nullif(regexp_replace(coalesce(p_imei, ''), '\D', '', 'g'), '');
  if not found then raise exception 'NO_DEVICE'; end if;
end $$;
revoke all on function public.bn_device_label(text, text) from public, anon;
grant execute on function public.bn_device_label(text, text) to authenticated;

create or replace function public.vehicle_save(
  p_id uuid, p_make text, p_vin text, p_imei text, p_car_no int, p_driver uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_imei text := nullif(regexp_replace(coalesce(p_imei, ''), '\D', '', 'g'), '');
  v_old_driver uuid;
  v_exists boolean;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_car_no is not null and (p_car_no < 1 or p_car_no > 99) then raise exception 'BAD_CAR_NO'; end if;
  if p_car_no is not null and exists (
       select 1 from public.vehicles where car_no = p_car_no and id <> v_id)
     then raise exception 'CAR_NO_TAKEN'; end if;
  if p_driver is not null and not exists (select 1 from public.profiles where id = p_driver)
     then raise exception 'NOT_FOUND'; end if;

  select exists(select 1 from public.vehicles where id = v_id) into v_exists;
  if p_id is not null and not v_exists then raise exception 'NOT_FOUND'; end if;
  select driver_id into v_old_driver from public.vehicles where id = v_id;

  -- v1.09.01: трекер выбирается из справочника «Трекеры Bouncie».
  -- v1.09.12: неактивный трекер привязывать можно — о неактивности предупреждает приложение.
  if v_imei is not null then
    if not exists (select 1 from public.bn_devices where imei = v_imei) then raise exception 'NO_DEVICE'; end if;
    if exists (select 1 from public.vehicles where imei = v_imei and id <> v_id)
       then raise exception 'DEVICE_TAKEN'; end if;
  end if;

  if p_driver is not null then
    update public.vehicles set driver_id = null where driver_id = p_driver and id <> v_id;
  end if;

  insert into public.vehicles (id, make, vin, imei, car_no, driver_id)
  values (v_id, coalesce(trim(p_make), ''), nullif(trim(p_vin), ''), v_imei, p_car_no, p_driver)
  on conflict (id) do update
    set make = excluded.make, vin = excluded.vin, imei = excluded.imei,
        car_no = excluded.car_no, driver_id = excluded.driver_id;

  if v_old_driver is not null and v_old_driver is distinct from p_driver then
    update public.profiles set car_no = null where id = v_old_driver;
  end if;
  if p_driver is not null then
    update public.profiles set car_no = null
      where car_no = p_car_no and id <> p_driver;
    update public.profiles set car_no = p_car_no where id = p_driver;
  end if;
  return v_id;
end $$;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='day_move_on')
     then miss := miss || ' org_settings.day_move_on'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bn_devices' and column_name='label')
     then miss := miss || ' bn_devices.label'; end if;
  if not exists (select 1 from public.price_list where key = 'oth_crb') then miss := miss || ' price_list.oth_crb'; end if;
  if to_regprocedure('public.bn_device_label(text,text)') is null then miss := miss || ' bn_device_label()'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.12 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.12 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.13 · ПОРЯДОК НА ДОСКЕ С УВЕДОМЛЕНИЕМ, ПРОФИЛЬ СОТРУДНИКА, «РЕМОНТ» ТОЛЬКО РЕМОНТНИКАМ
-- =====================================================================
-- 1) Профиль сотрудника: техник · ремонтник · помощник. Настройка интерфейса, права не меняет.
alter table public.profiles add column if not exists staff_kind text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_staff_kind_chk') then
    alter table public.profiles add constraint profiles_staff_kind_chk
      check (staff_kind is null or staff_kind in ('tech','repair','helper'));
  end if;
end $$;

-- 2) «Раздел „Ремонт“ — только ремонтникам» (Настройки → Прочие функции → Функции)
alter table public.org_settings add column if not exists rep_kind_only boolean not null default false;

-- 3) Push сотруднику, которому менеджер или админ сохранил новый порядок на доске.
--    Ссылка ./?day=ГГГГ-ММ-ДД открывает главную на этом дне. Личная галочка — push_prefs.order.
create or replace function public.board_order_notify(p_user uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_user is null or p_date is null then return; end if;
  perform public.push_enqueue(p_user, 'order', 'Порядок задач изменён',
    'на ' || to_char(p_date, 'MM/DD') || ' — откройте день: порядок задач и пикапов обновлён',
    './?day=' || to_char(p_date, 'YYYY-MM-DD'));
end $$;
revoke all on function public.board_order_notify(uuid, date) from public, anon;
grant execute on function public.board_order_notify(uuid, date) to authenticated;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='staff_kind')
     then miss := miss || ' profiles.staff_kind'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='rep_kind_only')
     then miss := miss || ' org_settings.rep_kind_only'; end if;
  if to_regprocedure('public.board_order_notify(uuid,date)') is null then miss := miss || ' board_order_notify()'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.13 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.13 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.14 · ПЕРЕСЫЛКА ДОКУМЕНТОВ ВНУТРИ TECHLOG (журнал «Документы: мне / от меня»)
-- =====================================================================
-- Одна строка = один документ одному получателю. Доступ к самому документу пересылка НЕ выдаёт:
-- получатель откроет его, только если документ и так виден ему по RLS.
create table if not exists public.doc_shares (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('job','prop','rep')),
  doc_id     uuid not null,
  title      text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists doc_shares_to_idx   on public.doc_shares (to_user, created_at desc);
create index if not exists doc_shares_from_idx on public.doc_shares (from_user, created_at desc);
alter table public.doc_shares enable row level security;
drop policy if exists doc_shares_sel on public.doc_shares;
create policy doc_shares_sel on public.doc_shares for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid() or public.my_role() = 'admin');
-- вставка и отметка «прочитано» — только функциями ниже, прямых политик записи нет намеренно
revoke insert, update, delete on public.doc_shares from authenticated, anon;
grant select on public.doc_shares to authenticated;

create or replace function public.doc_share_send(p_kind text, p_doc uuid, p_to uuid[], p_title text, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_to uuid; v_n int := 0; v_ok boolean; v_title text; v_name text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if p_kind not in ('job','prop','rep') or p_doc is null then raise exception 'BAD_DOC'; end if;
  -- отправитель сам должен видеть документ
  if p_kind = 'job' then v_ok := public.can_view_job(p_doc);
  elsif p_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
  else v_ok := exists (select 1 from public.proposals where id = p_doc)
               and coalesce(public.my_role(), 'tech') in ('admin','manager','accountant','tech');
  end if;
  if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  v_title := left(coalesce(nullif(trim(p_title), ''), 'Документ'), 160);
  select display_name into v_name from public.profiles where id = v_me;
  foreach v_to in array coalesce(p_to, array[]::uuid[]) loop
    continue when v_to = v_me;
    continue when not exists (select 1 from public.profiles where id = v_to and not blocked);
    insert into public.doc_shares (from_user, to_user, kind, doc_id, title, note)
    values (v_me, v_to, p_kind, p_doc, v_title, left(coalesce(trim(p_note), ''), 300));
    perform public.push_enqueue(v_to, 'share', 'Вам отправили документ',
      coalesce(v_name, '') || ': ' || v_title || case when coalesce(trim(p_note), '') <> '' then ' — ' || left(trim(p_note), 120) else '' end,
      './?doc=' || p_kind || ':' || p_doc::text);
    v_n := v_n + 1;
    exit when v_n >= 40;
  end loop;
  return v_n;
end $$;
revoke all on function public.doc_share_send(text, uuid, uuid[], text, text) from public, anon;
grant execute on function public.doc_share_send(text, uuid, uuid[], text, text) to authenticated;

create or replace function public.doc_share_read(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.doc_shares set read_at = coalesce(read_at, now()) where id = p_id and to_user = auth.uid();
$$;
revoke all on function public.doc_share_read(uuid) from public, anon;
grant execute on function public.doc_share_read(uuid) to authenticated;

do $$
declare miss text := '';
begin
  if to_regclass('public.doc_shares') is null then miss := miss || ' doc_shares'; end if;
  if to_regprocedure('public.doc_share_send(text,uuid,uuid[],text,text)') is null then miss := miss || ' doc_share_send()'; end if;
  if to_regprocedure('public.doc_share_read(uuid)') is null then miss := miss || ' doc_share_read()'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='doc_shares' and policyname='doc_shares_sel') then miss := miss || ' doc_shares_sel'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.14 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.14 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.15 · ОПЛАТЫ ПО ИНВОЙСАМ И РЕМОНТАМ (бухгалтерия: учёт поступлений и долгов по срокам)
-- =====================================================================
create table if not exists public.acc_payments (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('job','rep')),
  doc_id     uuid not null,
  paid_on    date not null,
  amount     numeric(12,2) not null check (amount > 0),
  method     text not null default 'check' check (method in ('check','ach','card','cash','other')),
  ref        text not null default '',
  note       text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists acc_payments_doc_idx  on public.acc_payments (doc_id);
create index if not exists acc_payments_date_idx on public.acc_payments (paid_on);
alter table public.acc_payments enable row level security;
-- деньги видят и ведут только администратор и бухгалтер
drop policy if exists acc_payments_sel on public.acc_payments;
create policy acc_payments_sel on public.acc_payments for select to authenticated
  using (public.my_role() in ('admin','accountant'));
drop policy if exists acc_payments_ins on public.acc_payments;
create policy acc_payments_ins on public.acc_payments for insert to authenticated
  with check (public.my_role() in ('admin','accountant') and created_by = auth.uid());
drop policy if exists acc_payments_del on public.acc_payments;
create policy acc_payments_del on public.acc_payments for delete to authenticated
  using (public.my_role() in ('admin','accountant'));
-- правки нет намеренно: ошибочная оплата удаляется и вносится заново — след остаётся в журнале событий
grant select, insert, delete on public.acc_payments to authenticated;
revoke update on public.acc_payments from authenticated, anon;

do $$
declare miss text := '';
begin
  if to_regclass('public.acc_payments') is null then miss := miss || ' acc_payments'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='acc_payments' and policyname='acc_payments_ins') then miss := miss || ' acc_payments_ins'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.15 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.15 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.17 · СООБЩЕНИЯ — внутренний чат («Объявления», «Общий чат», личная переписка, документы карточкой)
-- =====================================================================
create table if not exists public.chat_msgs (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid references public.profiles(id) on delete cascade,          -- личное сообщение
  channel    text check (channel in ('ann','all')),                          -- либо канал: объявления / общий чат
  body       text not null default '',
  important  boolean not null default false,
  doc_kind   text check (doc_kind in ('job','prop','rep')),
  doc_id     uuid,
  doc_title  text not null default '',
  created_at timestamptz not null default now(),
  constraint chat_msgs_target_chk check ((to_user is null) <> (channel is null)),
  constraint chat_msgs_body_chk   check (length(body) <= 2000 and (length(trim(body)) > 0 or doc_id is not null))
);
create index if not exists chat_msgs_time_idx on public.chat_msgs (created_at desc);
create index if not exists chat_msgs_to_idx   on public.chat_msgs (to_user, created_at desc);
create index if not exists chat_msgs_from_idx on public.chat_msgs (from_user, created_at desc);
alter table public.chat_msgs enable row level security;
-- каналы читают все вошедшие; личное — только двое участников (админ чужую переписку НЕ видит)
drop policy if exists chat_msgs_sel on public.chat_msgs;
create policy chat_msgs_sel on public.chat_msgs for select to authenticated
  using (channel is not null or from_user = auth.uid() or to_user = auth.uid());
-- удалить может автор; админ — только сообщения в каналах (модерация)
drop policy if exists chat_msgs_del on public.chat_msgs;
create policy chat_msgs_del on public.chat_msgs for delete to authenticated
  using (from_user = auth.uid() or (channel is not null and public.my_role() = 'admin'));
grant select, delete on public.chat_msgs to authenticated;
revoke insert, update on public.chat_msgs from authenticated, anon;          -- запись только функцией chat_send

create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread  text not null,                                                     -- 'ann' | 'all' | id собеседника
  read_at timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table public.chat_reads enable row level security;
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for select to authenticated using (user_id = auth.uid());
grant select on public.chat_reads to authenticated;

create or replace function public.chat_send(
  p_to uuid, p_channel text, p_body text, p_important boolean, p_doc_kind text, p_doc uuid, p_doc_title text)
returns public.chat_msgs language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_role text := coalesce(public.my_role(), '');
  v_body text := left(coalesce(trim(p_body), ''), 2000);
  v_imp boolean := coalesce(p_important, false) and v_role in ('admin','manager');
  v_name text; v_row public.chat_msgs; v_title text; v_text text; v_ok boolean; r record; v_n int := 0;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if (p_to is null) = (p_channel is null) then raise exception 'BAD_TARGET'; end if;
  if p_channel is not null and p_channel not in ('ann','all') then raise exception 'BAD_TARGET'; end if;
  if p_channel = 'ann' and v_role not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_to is not null and (p_to = v_me or not exists (select 1 from public.profiles where id = p_to and not blocked)) then raise exception 'NOT_FOUND'; end if;
  if p_doc is not null then
    if coalesce(p_doc_kind, '') not in ('job','prop','rep') then raise exception 'BAD_DOC'; end if;
    -- приложить можно только документ, который отправитель сам видит
    if p_doc_kind = 'job' then v_ok := public.can_view_job(p_doc);
    elsif p_doc_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
    else v_ok := exists (select 1 from public.proposals where id = p_doc);
    end if;
    if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  end if;
  if v_body = '' and p_doc is null then raise exception 'EMPTY'; end if;

  insert into public.chat_msgs (from_user, to_user, channel, body, important, doc_kind, doc_id, doc_title)
  values (v_me, p_to, p_channel, v_body, v_imp, case when p_doc is null then null else p_doc_kind end, p_doc,
          case when p_doc is null then '' else left(coalesce(trim(p_doc_title), ''), 160) end)
  returning * into v_row;

  select display_name into v_name from public.profiles where id = v_me;
  v_title := case when v_imp then '❗ ' else '' end
          || case when p_channel = 'ann' then 'Объявление · ' when p_channel = 'all' then 'Общий чат · ' else '' end || coalesce(v_name, 'TechLog');
  v_text := case when v_body <> '' then left(v_body, 160) else '' end
         || case when p_doc is not null then case when v_body <> '' then ' · ' else '' end || '📄 ' || left(coalesce(p_doc_title, 'документ'), 100) else '' end;
  if p_to is not null then
    perform public.push_enqueue(p_to, 'chat', v_title, v_text, './?chat=' || v_me::text);
  else
    for r in select id from public.profiles where not blocked and id <> v_me limit 300 loop
      perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=' || p_channel);
      v_n := v_n + 1;
    end loop;
  end if;
  return v_row;
end $$;
revoke all on function public.chat_send(uuid, text, text, boolean, text, uuid, text) from public, anon;
grant execute on function public.chat_send(uuid, text, text, boolean, text, uuid, text) to authenticated;

create or replace function public.chat_mark_read(p_thread text, p_at timestamptz)
returns void language sql security definer set search_path = public as $$
  insert into public.chat_reads (user_id, thread, read_at)
  values (auth.uid(), left(p_thread, 60), least(coalesce(p_at, now()), now() + interval '1 minute'))
  on conflict (user_id, thread) do update set read_at = greatest(public.chat_reads.read_at, excluded.read_at);
$$;
revoke all on function public.chat_mark_read(text, timestamptz) from public, anon;
grant execute on function public.chat_mark_read(text, timestamptz) to authenticated;

do $$
declare miss text := '';
begin
  if to_regclass('public.chat_msgs') is null then miss := miss || ' chat_msgs'; end if;
  if to_regclass('public.chat_reads') is null then miss := miss || ' chat_reads'; end if;
  if to_regprocedure('public.chat_send(uuid,text,text,boolean,text,uuid,text)') is null then miss := miss || ' chat_send()'; end if;
  if to_regprocedure('public.chat_mark_read(text,timestamptz)') is null then miss := miss || ' chat_mark_read()'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_msgs' and policyname='chat_msgs_sel') then miss := miss || ' chat_msgs_sel'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.17 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.17 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.18 · ЧАТ: «прочитано» и мгновенная доставка; БЭКАП: оплаты и шаблоны заметок восстанавливаются из JSON
-- =====================================================================
-- 1) Отметка «прочитано» у моих сообщений: собеседник видит МОЮ отметку чтения переписки с ним, и наоборот.
--    thread личной переписки = id собеседника, поэтому «thread = мой id» — это отметки тех, кто читал переписку со мной.
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for select to authenticated
  using (user_id = auth.uid() or thread = auth.uid()::text);

-- 2) Realtime для чата: новые сообщения приходят открытому приложению сразу (RLS действует и на подписку).
--    Если публикации нет или таблица уже в ней — молча идём дальше: чат и без неё работает опросом.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_msgs') then
    alter publication supabase_realtime add table public.chat_msgs;
  end if;
exception when others then raise notice 'TechLog: realtime для chat_msgs не включён (%). Чат работает опросом.', sqlerrm;
end $$;

-- 3) Ручной JSON-бэкап: восстановление теперь принимает оплаты бухгалтерии и шаблоны заметок
create or replace function public.admin_restore_rows(p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'profiles','counterparties','complexes','aux_equipment','work_types',
    'equipment_types','size_types','extra_works','product_types','price_list',
    'counterparty_prices','equipment_stock','org_settings','code_requests',
    'complex_code_history','hidden_staff','proposals','jobs','placements',
    'ext_requests','media','repairs','equip_moves','acc_settings','study_sessions',
    'acc_payments','note_templates'];   -- v1.09.18
  v_cols text[]; v_collist text; v_set text; v_sql text;
  r jsonb; v_n int := 0; v_rc int;
  v_ins int := 0; v_skip int := 0; v_errs jsonb := '[]'::jsonb;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if not (p_table = any(v_allowed)) then raise exception 'BAD_TABLE'; end if;
  if to_regclass('public.' || p_table) is null then raise exception 'NO_TABLE'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  end if;

  perform set_config('techlog.restore', '1', true);

  select array_agg(quote_ident(column_name) order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table
    and (p_rows->0) ? column_name;
  if v_cols is null then raise exception 'NO_MATCHING_COLUMNS'; end if;
  v_collist := array_to_string(v_cols, ',');

  if p_table = 'org_settings' then
    select string_agg(format('%s = excluded.%s', c, c), ', ')
      into v_set from unnest(v_cols) c where c <> 'id';
    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
       on conflict (id) do update set %s', p_table, v_collist, v_collist, p_table, v_set);
  else
    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
       on conflict do nothing', p_table, v_collist, v_collist, p_table);
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    begin
      execute v_sql using r;
      get diagnostics v_rc = row_count;
      if v_rc > 0 then v_ins := v_ins + 1; else v_skip := v_skip + 1; end if;
    exception when others then
      v_errs := v_errs || jsonb_build_object(
        'row', coalesce(r->>'id', '#' || v_n), 'error', sqlerrm);
    end;
  end loop;

  -- identity-счётчики номеров: после загрузки старых номеров двигаем вперёд
  if p_table in ('proposals','repairs') then
    execute format(
      'select setval(pg_get_serial_sequence(''public.%I'',''no''),
                     greatest((select coalesce(max(no), 0) from public.%I), 1), true)',
      p_table, p_table);
  end if;

  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'errors', v_errs);
end $$;

do $$
declare miss text := '';
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_reads' and policyname='chat_reads_own'
                 and qual like '%thread%') then miss := miss || ' chat_reads_own(thread)'; end if;
  if position('acc_payments' in pg_get_functiondef('public.admin_restore_rows(text,jsonb)'::regprocedure)) = 0 then miss := miss || ' admin_restore_rows(acc_payments)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.18 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.18 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.19 · ЧАТ «КАК ПРИВЫЧНО»: ответы, правка, реакции, фото, срок хранения переписки
-- =====================================================================
alter table public.chat_msgs add column if not exists reply_to   uuid references public.chat_msgs(id) on delete set null;
alter table public.chat_msgs add column if not exists edited_at  timestamptz;
alter table public.chat_msgs add column if not exists updated_at timestamptz not null default now();
alter table public.chat_msgs add column if not exists reactions  jsonb not null default '{}'::jsonb;
alter table public.chat_msgs add column if not exists img_thumb  text;          -- миниатюра (data URL ~10 КБ) — лента рисуется без догрузок
alter table public.chat_msgs add column if not exists img_id     uuid;          -- полный снимок лежит в chat_files
alter table public.chat_msgs add column if not exists img_w      int;
alter table public.chat_msgs add column if not exists img_h      int;
create index if not exists chat_msgs_upd_idx on public.chat_msgs (updated_at desc);
-- сообщение может состоять из одного снимка
alter table public.chat_msgs drop constraint if exists chat_msgs_body_chk;
alter table public.chat_msgs add constraint chat_msgs_body_chk
  check (length(body) <= 2000 and (length(trim(body)) > 0 or doc_id is not null or img_thumb is not null));

create table if not exists public.chat_files (
  id         uuid primary key default gen_random_uuid(),
  msg_id     uuid not null references public.chat_msgs(id) on delete cascade,
  data       text not null,                                                     -- JPEG, data URL (уменьшен на устройстве)
  bytes      int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chat_files_msg_idx on public.chat_files (msg_id);
alter table public.chat_files enable row level security;
-- снимок виден тем же, кому видно сообщение
drop policy if exists chat_files_sel on public.chat_files;
create policy chat_files_sel on public.chat_files for select to authenticated
  using (exists (select 1 from public.chat_msgs m where m.id = msg_id
                 and (m.channel is not null or m.from_user = auth.uid() or m.to_user = auth.uid())));
grant select on public.chat_files to authenticated;
revoke insert, update, delete on public.chat_files from authenticated, anon;

alter table public.org_settings add column if not exists chat_keep_days int not null default 180;

-- уборка: переписка старше срока, текст уже доставленных чат-пушей (в очереди он больше не нужен)
create or replace function public.chat_cleanup()
returns int language plpgsql security definer set search_path = public as $$
declare v_days int; v_n int := 0;
begin
  select coalesce(max(chat_keep_days), 180) into v_days from public.org_settings;
  if v_days > 0 then
    delete from public.chat_msgs where created_at < now() - make_interval(days => v_days);
    get diagnostics v_n = row_count;
  end if;
  update public.push_queue set body = '' where kind = 'chat' and sent_at is not null and body <> '';
  delete from public.push_queue where kind = 'chat' and sent_at is not null and sent_at < now() - interval '14 days';
  return v_n;
end $$;
revoke all on function public.chat_cleanup() from public, anon, authenticated;

-- новая подпись chat_send (ответ и фото). Старую убираем, иначе PostgREST не сможет выбрать между двумя.
drop function if exists public.chat_send(uuid, text, text, boolean, text, uuid, text);
create or replace function public.chat_send(
  p_to uuid, p_channel text, p_body text, p_important boolean, p_doc_kind text, p_doc uuid, p_doc_title text,
  p_reply uuid, p_thumb text, p_img text, p_w int, p_h int)
returns public.chat_msgs language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_role text := coalesce(public.my_role(), '');
  v_body text := left(coalesce(trim(p_body), ''), 2000);
  v_imp boolean := coalesce(p_important, false) and v_role in ('admin','manager');
  v_name text; v_row public.chat_msgs; v_title text; v_text text; v_ok boolean; r record; v_img uuid;
  v_has_img boolean := p_img is not null and p_thumb is not null;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if (p_to is null) = (p_channel is null) then raise exception 'BAD_TARGET'; end if;
  if p_channel is not null and p_channel not in ('ann','all') then raise exception 'BAD_TARGET'; end if;
  if p_channel = 'ann' and v_role not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_to is not null and (p_to = v_me or not exists (select 1 from public.profiles where id = p_to and not blocked)) then raise exception 'NOT_FOUND'; end if;
  if p_doc is not null then
    if coalesce(p_doc_kind, '') not in ('job','prop','rep') then raise exception 'BAD_DOC'; end if;
    if p_doc_kind = 'job' then v_ok := public.can_view_job(p_doc);
    elsif p_doc_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
    else v_ok := exists (select 1 from public.proposals where id = p_doc);
    end if;
    if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  end if;
  if v_has_img then
    if left(p_img, 23) <> 'data:image/jpeg;base64,' or left(p_thumb, 23) <> 'data:image/jpeg;base64,' then raise exception 'BAD_IMAGE'; end if;
    if length(p_img) > 1500000 or length(p_thumb) > 60000 then raise exception 'TOO_BIG'; end if;
  end if;
  if v_body = '' and p_doc is null and not v_has_img then raise exception 'EMPTY'; end if;
  -- отвечать можно только на сообщение, которое сам видишь
  if p_reply is not null and not exists (select 1 from public.chat_msgs m where m.id = p_reply
        and (m.channel is not null or m.from_user = v_me or m.to_user = v_me)) then p_reply := null; end if;

  if v_has_img then v_img := gen_random_uuid(); end if;
  insert into public.chat_msgs (from_user, to_user, channel, body, important, doc_kind, doc_id, doc_title, reply_to, img_thumb, img_id, img_w, img_h)
  values (v_me, p_to, p_channel, v_body, v_imp, case when p_doc is null then null else p_doc_kind end, p_doc,
          case when p_doc is null then '' else left(coalesce(trim(p_doc_title), ''), 160) end, p_reply,
          case when v_has_img then p_thumb end, v_img, case when v_has_img then p_w end, case when v_has_img then p_h end)
  returning * into v_row;
  if v_has_img then insert into public.chat_files (id, msg_id, data, bytes) values (v_img, v_row.id, p_img, (length(p_img) * 3) / 4); end if;

  select display_name into v_name from public.profiles where id = v_me;
  v_title := case when v_imp then '❗ ' else '' end
          || case when p_channel = 'ann' then 'Объявление · ' when p_channel = 'all' then 'Общий чат · ' else '' end || coalesce(v_name, 'TechLog');
  v_text := case when v_body <> '' then left(v_body, 160) else '' end
         || case when v_has_img then case when v_body <> '' then ' · ' else '' end || '📷 Фото' else '' end
         || case when p_doc is not null then case when v_body <> '' or v_has_img then ' · ' else '' end || '📄 ' || left(coalesce(p_doc_title, 'документ'), 100) else '' end;
  if p_to is not null then
    perform public.push_enqueue(p_to, 'chat', v_title, v_text, './?chat=' || v_me::text);
  else
    for r in select id from public.profiles where not blocked and id <> v_me limit 300 loop
      perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=' || p_channel);
    end loop;
  end if;
  if random() < 0.03 then perform public.chat_cleanup(); end if;      -- уборка «между делом»: отдельное расписание не нужно
  return v_row;
end $$;
revoke all on function public.chat_send(uuid, text, text, boolean, text, uuid, text, uuid, text, text, int, int) from public, anon;
grant execute on function public.chat_send(uuid, text, text, boolean, text, uuid, text, uuid, text, text, int, int) to authenticated;

-- правка своего сообщения — сутки; остаётся пометка «изменено»
create or replace function public.chat_edit(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_body text := left(coalesce(trim(p_body), ''), 2000);
begin
  if v_body = '' then raise exception 'EMPTY'; end if;
  update public.chat_msgs set body = v_body, edited_at = now(), updated_at = now()
   where id = p_id and from_user = auth.uid() and created_at > now() - interval '24 hours';
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;
revoke all on function public.chat_edit(uuid, text) from public, anon;
grant execute on function public.chat_edit(uuid, text) to authenticated;

-- реакция: одна от человека; та же ещё раз — снять, другая — заменить
create or replace function public.chat_react(p_id uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me text := auth.uid()::text; v_r jsonb; v_had boolean; k text; v_out jsonb := '{}'::jsonb; v_arr jsonb;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if p_emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception 'BAD_EMOJI'; end if;
  select reactions into v_r from public.chat_msgs m where m.id = p_id
     and (m.channel is not null or m.from_user = auth.uid() or m.to_user = auth.uid()) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_r := coalesce(v_r, '{}'::jsonb);
  v_had := coalesce(v_r -> p_emoji, '[]'::jsonb) ? v_me;
  for k in select jsonb_object_keys(v_r) loop
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_arr from jsonb_array_elements_text(v_r -> k) x where x <> v_me;
    if jsonb_array_length(v_arr) > 0 then v_out := v_out || jsonb_build_object(k, v_arr); end if;
  end loop;
  if not v_had then v_out := v_out || jsonb_build_object(p_emoji, coalesce(v_out -> p_emoji, '[]'::jsonb) || to_jsonb(v_me)); end if;
  update public.chat_msgs set reactions = v_out, updated_at = now() where id = p_id;
  return v_out;
end $$;
revoke all on function public.chat_react(uuid, text) from public, anon;
grant execute on function public.chat_react(uuid, text) to authenticated;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='chat_msgs' and column_name='reactions') then miss := miss || ' chat_msgs.reactions'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='chat_keep_days') then miss := miss || ' org_settings.chat_keep_days'; end if;
  if to_regclass('public.chat_files') is null then miss := miss || ' chat_files'; end if;
  if to_regprocedure('public.chat_send(uuid,text,text,boolean,text,uuid,text,uuid,text,text,int,int)') is null then miss := miss || ' chat_send(12)'; end if;
  if to_regprocedure('public.chat_send(uuid,text,text,boolean,text,uuid,text)') is not null then miss := miss || ' старая chat_send(7) не удалена'; end if;
  if to_regprocedure('public.chat_edit(uuid,text)') is null then miss := miss || ' chat_edit()'; end if;
  if to_regprocedure('public.chat_react(uuid,text)') is null then miss := miss || ' chat_react()'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.19 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.19 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.20 · ЧАТ: ГРУППЫ (создаёт любой сотрудник; сообщения видят только участники)
-- =====================================================================
create table if not exists public.chat_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);
alter table public.chat_msgs add column if not exists group_id uuid references public.chat_groups(id) on delete cascade;
create index if not exists chat_msgs_group_idx on public.chat_msgs (group_id, created_at desc);
alter table public.chat_msgs drop constraint if exists chat_msgs_target_chk;
alter table public.chat_msgs add constraint chat_msgs_target_chk check (num_nonnulls(to_user, channel, group_id) = 1);

-- членство проверяет функция с правами владельца: политика на chat_members не может читать саму chat_members (рекурсия)
create or replace function public.chat_is_member(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.chat_members where group_id = p_group and user_id = auth.uid());
$$;
revoke all on function public.chat_is_member(uuid) from public, anon;
grant execute on function public.chat_is_member(uuid) to authenticated;

create or replace function public.chat_msg_visible(p_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.chat_msgs m where m.id = p_id and (m.channel is not null or m.from_user = auth.uid()
     or m.to_user = auth.uid() or (m.group_id is not null and public.chat_is_member(m.group_id))));
$$;
revoke all on function public.chat_msg_visible(uuid) from public, anon;
grant execute on function public.chat_msg_visible(uuid) to authenticated;

alter table public.chat_groups  enable row level security;
alter table public.chat_members enable row level security;
-- группу и её состав видят участники; администратор — для управления (сообщений чужих групп он НЕ видит)
drop policy if exists chat_groups_sel on public.chat_groups;
create policy chat_groups_sel on public.chat_groups for select to authenticated
  using (public.chat_is_member(id) or public.my_role() = 'admin');
drop policy if exists chat_members_sel on public.chat_members;
create policy chat_members_sel on public.chat_members for select to authenticated
  using (public.chat_is_member(group_id) or public.my_role() = 'admin');
grant select on public.chat_groups, public.chat_members to authenticated;
revoke insert, update, delete on public.chat_groups, public.chat_members from authenticated, anon;

drop policy if exists chat_msgs_sel on public.chat_msgs;
create policy chat_msgs_sel on public.chat_msgs for select to authenticated
  using (channel is not null or from_user = auth.uid() or to_user = auth.uid()
         or (group_id is not null and public.chat_is_member(group_id)));
drop policy if exists chat_files_sel on public.chat_files;
create policy chat_files_sel on public.chat_files for select to authenticated using (public.chat_msg_visible(msg_id));

create or replace function public.chat_group_create(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_name text := left(coalesce(trim(p_name), ''), 60); u uuid; v_who text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if v_name = '' then raise exception 'EMPTY'; end if;
  insert into public.chat_groups (name, created_by) values (v_name, v_me) returning id into v_id;
  insert into public.chat_members (group_id, user_id, added_by) values (v_id, v_me, v_me);
  select display_name into v_who from public.profiles where id = v_me;
  foreach u in array coalesce(p_members, array[]::uuid[]) loop
    continue when u = v_me or not exists (select 1 from public.profiles where id = u and not blocked);
    insert into public.chat_members (group_id, user_id, added_by) values (v_id, u, v_me) on conflict do nothing;
    perform public.push_enqueue(u, 'chat', 'Вас добавили в группу', coalesce(v_who, '') || ': «' || v_name || '»', './?chat=g:' || v_id::text);
  end loop;
  return v_id;
end $$;

create or replace function public.chat_group_rename(p_group uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := left(coalesce(trim(p_name), ''), 60);
begin
  if v_name = '' then raise exception 'EMPTY'; end if;
  update public.chat_groups set name = v_name where id = p_group and (created_by = auth.uid() or public.my_role() = 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;

create or replace function public.chat_group_add(p_group uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare u uuid; v_n int := 0; v_name text; v_who text;
begin
  if not (public.chat_is_member(p_group) or public.my_role() = 'admin') then raise exception 'FORBIDDEN'; end if;
  select name into v_name from public.chat_groups where id = p_group; if not found then raise exception 'NOT_FOUND'; end if;
  select display_name into v_who from public.profiles where id = auth.uid();
  foreach u in array coalesce(p_users, array[]::uuid[]) loop
    continue when not exists (select 1 from public.profiles where id = u and not blocked);
    insert into public.chat_members (group_id, user_id, added_by) values (p_group, u, auth.uid()) on conflict do nothing;
    if found then v_n := v_n + 1;
      perform public.push_enqueue(u, 'chat', 'Вас добавили в группу', coalesce(v_who, '') || ': «' || v_name || '»', './?chat=g:' || p_group::text); end if;
  end loop;
  return v_n;
end $$;

-- убрать участника: себя — любой; другого — создатель группы или администратор. Ушёл создатель — группа переходит
-- самому давнему участнику; не осталось никого — группа удаляется вместе с перепиской.
create or replace function public.chat_group_remove(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_next uuid;
begin
  select created_by into v_owner from public.chat_groups where id = p_group; if not found then raise exception 'NOT_FOUND'; end if;
  if not (p_user = auth.uid() or v_owner = auth.uid() or public.my_role() = 'admin') then raise exception 'FORBIDDEN'; end if;
  delete from public.chat_members where group_id = p_group and user_id = p_user;
  select user_id into v_next from public.chat_members where group_id = p_group order by added_at limit 1;
  if v_next is null then delete from public.chat_groups where id = p_group;
  elsif v_owner is not distinct from p_user then update public.chat_groups set created_by = v_next where id = p_group; end if;
  delete from public.chat_reads where user_id = p_user and thread = 'g:' || p_group::text;
end $$;

create or replace function public.chat_group_delete(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.chat_groups where id = p_group and (created_by = auth.uid() or public.my_role() = 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  delete from public.chat_reads where thread = 'g:' || p_group::text;
end $$;
revoke all on function public.chat_group_create(text, uuid[]), public.chat_group_rename(uuid, text), public.chat_group_add(uuid, uuid[]),
                       public.chat_group_remove(uuid, uuid), public.chat_group_delete(uuid) from public, anon;
grant execute on function public.chat_group_create(text, uuid[]), public.chat_group_rename(uuid, text), public.chat_group_add(uuid, uuid[]),
                          public.chat_group_remove(uuid, uuid), public.chat_group_delete(uuid) to authenticated;

-- реакция и правка теперь знают про группы
create or replace function public.chat_react(p_id uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me text := auth.uid()::text; v_r jsonb; v_had boolean; k text; v_out jsonb := '{}'::jsonb; v_arr jsonb;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if p_emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception 'BAD_EMOJI'; end if;
  if not public.chat_msg_visible(p_id) then raise exception 'NOT_FOUND'; end if;
  select reactions into v_r from public.chat_msgs m where m.id = p_id for update;
  v_r := coalesce(v_r, '{}'::jsonb);
  v_had := coalesce(v_r -> p_emoji, '[]'::jsonb) ? v_me;
  for k in select jsonb_object_keys(v_r) loop
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_arr from jsonb_array_elements_text(v_r -> k) x where x <> v_me;
    if jsonb_array_length(v_arr) > 0 then v_out := v_out || jsonb_build_object(k, v_arr); end if;
  end loop;
  if not v_had then v_out := v_out || jsonb_build_object(p_emoji, coalesce(v_out -> p_emoji, '[]'::jsonb) || to_jsonb(v_me)); end if;
  update public.chat_msgs set reactions = v_out, updated_at = now() where id = p_id;
  return v_out;
end $$;

-- отправка: + группа. Старую подпись (12 параметров) убираем — иначе PostgREST не выберет между двумя.
drop function if exists public.chat_send(uuid, text, text, boolean, text, uuid, text, uuid, text, text, int, int);
create or replace function public.chat_send(
  p_to uuid, p_channel text, p_group uuid, p_body text, p_important boolean, p_doc_kind text, p_doc uuid, p_doc_title text,
  p_reply uuid, p_thumb text, p_img text, p_w int, p_h int)
returns public.chat_msgs language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_role text := coalesce(public.my_role(), '');
  v_body text := left(coalesce(trim(p_body), ''), 2000);
  v_imp boolean := coalesce(p_important, false) and v_role in ('admin','manager');
  v_name text; v_row public.chat_msgs; v_title text; v_text text; v_ok boolean; r record; v_img uuid;
  v_has_img boolean := p_img is not null and p_thumb is not null; v_gname text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if num_nonnulls(p_to, p_channel, p_group) <> 1 then raise exception 'BAD_TARGET'; end if;
  if p_group is not null then
    if not public.chat_is_member(p_group) then raise exception 'FORBIDDEN'; end if;
    select name into v_gname from public.chat_groups where id = p_group;
  end if;
  if p_channel is not null and p_channel not in ('ann','all') then raise exception 'BAD_TARGET'; end if;
  if p_channel = 'ann' and v_role not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_to is not null and (p_to = v_me or not exists (select 1 from public.profiles where id = p_to and not blocked)) then raise exception 'NOT_FOUND'; end if;
  if p_doc is not null then
    if coalesce(p_doc_kind, '') not in ('job','prop','rep') then raise exception 'BAD_DOC'; end if;
    if p_doc_kind = 'job' then v_ok := public.can_view_job(p_doc);
    elsif p_doc_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
    else v_ok := exists (select 1 from public.proposals where id = p_doc);
    end if;
    if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  end if;
  if v_has_img then
    if left(p_img, 23) <> 'data:image/jpeg;base64,' or left(p_thumb, 23) <> 'data:image/jpeg;base64,' then raise exception 'BAD_IMAGE'; end if;
    if length(p_img) > 1500000 or length(p_thumb) > 60000 then raise exception 'TOO_BIG'; end if;
  end if;
  if v_body = '' and p_doc is null and not v_has_img then raise exception 'EMPTY'; end if;
  -- отвечать можно только на сообщение, которое сам видишь
  if p_reply is not null and not public.chat_msg_visible(p_reply) then p_reply := null; end if;

  if v_has_img then v_img := gen_random_uuid(); end if;
  insert into public.chat_msgs (from_user, to_user, channel, group_id, body, important, doc_kind, doc_id, doc_title, reply_to, img_thumb, img_id, img_w, img_h)
  values (v_me, p_to, p_channel, p_group, v_body, v_imp, case when p_doc is null then null else p_doc_kind end, p_doc,
          case when p_doc is null then '' else left(coalesce(trim(p_doc_title), ''), 160) end, p_reply,
          case when v_has_img then p_thumb end, v_img, case when v_has_img then p_w end, case when v_has_img then p_h end)
  returning * into v_row;
  if v_has_img then insert into public.chat_files (id, msg_id, data, bytes) values (v_img, v_row.id, p_img, (length(p_img) * 3) / 4); end if;

  select display_name into v_name from public.profiles where id = v_me;
  v_title := case when v_imp then '❗ ' else '' end
          || case when p_channel = 'ann' then 'Объявление · ' when p_channel = 'all' then 'Общий чат · ' when p_group is not null then coalesce(v_gname, 'Группа') || ' · ' else '' end || coalesce(v_name, 'TechLog');
  v_text := case when v_body <> '' then left(v_body, 160) else '' end
         || case when v_has_img then case when v_body <> '' then ' · ' else '' end || '📷 Фото' else '' end
         || case when p_doc is not null then case when v_body <> '' or v_has_img then ' · ' else '' end || '📄 ' || left(coalesce(p_doc_title, 'документ'), 100) else '' end;
  if p_to is not null then
    perform public.push_enqueue(p_to, 'chat', v_title, v_text, './?chat=' || v_me::text);
  elsif p_group is not null then
    for r in select gm.user_id as id from public.chat_members gm join public.profiles pf on pf.id = gm.user_id
              where gm.group_id = p_group and gm.user_id <> v_me and not pf.blocked limit 300 loop
      perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=g:' || p_group::text);
    end loop;
  else
    for r in select id from public.profiles where not blocked and id <> v_me limit 300 loop
      perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=' || p_channel);
    end loop;
  end if;
  if random() < 0.03 then perform public.chat_cleanup(); end if;      -- уборка «между делом»: отдельное расписание не нужно
  return v_row;
end $$;
revoke all on function public.chat_send(uuid, text, uuid, text, boolean, text, uuid, text, uuid, text, text, int, int) from public, anon;
grant execute on function public.chat_send(uuid, text, uuid, text, boolean, text, uuid, text, uuid, text, text, int, int) to authenticated;

do $$
declare miss text := '';
begin
  if to_regclass('public.chat_groups') is null then miss := miss || ' chat_groups'; end if;
  if to_regclass('public.chat_members') is null then miss := miss || ' chat_members'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='chat_msgs' and column_name='group_id') then miss := miss || ' chat_msgs.group_id'; end if;
  if to_regprocedure('public.chat_send(uuid,text,uuid,text,boolean,text,uuid,text,uuid,text,text,int,int)') is null then miss := miss || ' chat_send(13)'; end if;
  if to_regprocedure('public.chat_send(uuid,text,text,boolean,text,uuid,text,uuid,text,text,int,int)') is not null then miss := miss || ' старая chat_send(12) не удалена'; end if;
  if to_regprocedure('public.chat_group_create(text,uuid[])') is null then miss := miss || ' chat_group_create()'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.20 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.20 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.21 · КЛЮЧИ ЗАЩИТЫ ПЕРЕПИСКИ (шаг «ключи без шифрования»: сообщения ещё открытые)
-- =====================================================================
-- Открытые ключи — видны всем вошедшим: на них позже будут запираться ключи переписок.
create table if not exists public.chat_pubkeys (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  pub        jsonb not null,
  mode       text  not null default 'recover' check (mode in ('recover','total')),
  key_id     text  not null,
  updated_at timestamptz not null default now()
);
-- Сейф (личный ключ, запертый ключом из пароля) и второй замок (запертый ключом фирмы).
-- Сейф читает ТОЛЬКО владелец: это единственное, что можно перебирать по словарю паролей.
create table if not exists public.chat_keys (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  safe       jsonb not null,
  escrow     jsonb,
  mode       text  not null default 'recover' check (mode in ('recover','total')),
  key_id     text  not null,
  updated_at timestamptz not null default now(),
  constraint chat_keys_total_chk check (mode <> 'total' or escrow is null)      -- полное шифрование = второго замка нет
);
create table if not exists public.chat_org_key (
  id         int primary key default 1 check (id = 1),
  pub        jsonb not null,
  key_id     text  not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_org_holders (
  admin_id   uuid primary key references public.profiles(id) on delete cascade,
  blob       jsonb not null,                                                     -- закрытый ключ фирмы, запертый на открытый ключ этого админа
  by_user    uuid,
  updated_at timestamptz not null default now()
);
alter table public.chat_pubkeys     enable row level security;
alter table public.chat_keys        enable row level security;
alter table public.chat_org_key     enable row level security;
alter table public.chat_org_holders enable row level security;
drop policy if exists chat_pubkeys_sel on public.chat_pubkeys;
create policy chat_pubkeys_sel on public.chat_pubkeys for select to authenticated using (true);
drop policy if exists chat_keys_own on public.chat_keys;
create policy chat_keys_own on public.chat_keys for select to authenticated using (user_id = auth.uid());
drop policy if exists chat_org_key_sel on public.chat_org_key;
create policy chat_org_key_sel on public.chat_org_key for select to authenticated using (true);
drop policy if exists chat_org_holders_own on public.chat_org_holders;
create policy chat_org_holders_own on public.chat_org_holders for select to authenticated using (admin_id = auth.uid());
grant select on public.chat_pubkeys, public.chat_keys, public.chat_org_key, public.chat_org_holders to authenticated;
revoke insert, update, delete on public.chat_pubkeys, public.chat_keys, public.chat_org_key, public.chat_org_holders from authenticated, anon;

-- свой ключ: создать (или заменить — только с явным p_replace: замена ключа лишает доступа к зашифрованному старым)
create or replace function public.chat_key_put(p_pub jsonb, p_safe jsonb, p_escrow jsonb, p_mode text, p_key_id text, p_replace boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_old text; v_mode text := coalesce(p_mode, 'recover');
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if p_pub is null or p_safe is null or coalesce(p_key_id, '') = '' or v_mode not in ('recover','total') then raise exception 'BAD_KEY'; end if;
  if (p_pub ->> 'kty') is distinct from 'EC' or (p_pub ->> 'crv') is distinct from 'P-256' or p_pub ? 'd' then raise exception 'BAD_KEY'; end if;   -- закрытая часть на сервер не принимается
  select key_id into v_old from public.chat_keys where user_id = v_me;
  if v_old is not null and v_old <> p_key_id and not coalesce(p_replace, false) then raise exception 'KEY_EXISTS'; end if;
  insert into public.chat_keys (user_id, safe, escrow, mode, key_id) values (v_me, p_safe, case when v_mode = 'total' then null else p_escrow end, v_mode, p_key_id)
  on conflict (user_id) do update set safe = excluded.safe, escrow = excluded.escrow, mode = excluded.mode, key_id = excluded.key_id, updated_at = now();
  insert into public.chat_pubkeys (user_id, pub, mode, key_id) values (v_me, p_pub, v_mode, p_key_id)
  on conflict (user_id) do update set pub = excluded.pub, mode = excluded.mode, key_id = excluded.key_id, updated_at = now();
end $$;

-- перезапереть свой сейф (смена пароля; восстановление с вошедшего устройства)
create or replace function public.chat_key_safe_set(p_safe jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_safe is null then raise exception 'BAD_KEY'; end if;
  update public.chat_keys set safe = p_safe, updated_at = now() where user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- режим: «с восстановлением» (второй замок) / «полное» (второго замка нет)
create or replace function public.chat_key_mode_set(p_mode text, p_escrow jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('recover','total') then raise exception 'BAD_MODE'; end if;
  if p_mode = 'recover' and p_escrow is null then raise exception 'NO_ESCROW'; end if;
  update public.chat_keys set mode = p_mode, escrow = case when p_mode = 'total' then null else p_escrow end, updated_at = now() where user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.chat_pubkeys set mode = p_mode, updated_at = now() where user_id = auth.uid();
end $$;

-- ключ фирмы: создаёт первый администратор; выдаёт другим администраторам тот, у кого он уже есть
create or replace function public.chat_org_key_init(p_pub jsonb, p_key_id text, p_blob jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_pub is null or p_blob is null or p_pub ? 'd' then raise exception 'BAD_KEY'; end if;
  if exists (select 1 from public.chat_org_key) then raise exception 'KEY_EXISTS'; end if;
  insert into public.chat_org_key (id, pub, key_id, created_by) values (1, p_pub, p_key_id, auth.uid());
  insert into public.chat_org_holders (admin_id, blob, by_user) values (auth.uid(), p_blob, auth.uid());
end $$;

create or replace function public.chat_org_key_grant(p_admin uuid, p_blob jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.chat_org_holders where admin_id = auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = p_admin and role = 'admin' and not blocked) then raise exception 'NOT_ADMIN'; end if;
  insert into public.chat_org_holders (admin_id, blob, by_user) values (p_admin, p_blob, auth.uid())
  on conflict (admin_id) do update set blob = excluded.blob, by_user = excluded.by_user, updated_at = now();
end $$;

create or replace function public.chat_org_holders_list()
returns uuid[] language sql security definer stable set search_path = public as $$
  select case when public.my_role() = 'admin' then coalesce(array_agg(admin_id), array[]::uuid[]) else array[]::uuid[] end from public.chat_org_holders;
$$;

-- второй замок сотрудника — только администратору, только функцией, и КАЖДОЕ обращение пишется в журнал событий
create or replace function public.chat_key_escrow_get(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_esc jsonb; v_name text; v_who text;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  select escrow into v_esc from public.chat_keys where user_id = p_user and mode = 'recover';
  select display_name into v_name from public.profiles where id = auth.uid();
  select display_name into v_who  from public.profiles where id = p_user;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name, ''), 'chat_key_escrow', 'profile', p_user::text, jsonb_build_object('name', coalesce(v_who, ''), 'found', v_esc is not null));
  return v_esc;
end $$;

create or replace function public.chat_key_admin_rewrap(p_user uuid, p_safe jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_safe is null then raise exception 'BAD_KEY'; end if;
  update public.chat_keys set safe = p_safe, updated_at = now() where user_id = p_user and mode = 'recover';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- снятый с должности администратор теряет копию ключа фирмы
create or replace function public.chat_org_holders_gc() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from 'admin' or new.blocked then delete from public.chat_org_holders where admin_id = new.id; end if;
  return new;
end $$;
drop trigger if exists chat_org_holders_gc_tg on public.profiles;
create trigger chat_org_holders_gc_tg after update of role, blocked on public.profiles for each row execute function public.chat_org_holders_gc();

revoke all on function public.chat_key_put(jsonb, jsonb, jsonb, text, text, boolean), public.chat_key_safe_set(jsonb), public.chat_key_mode_set(text, jsonb),
  public.chat_org_key_init(jsonb, text, jsonb), public.chat_org_key_grant(uuid, jsonb), public.chat_org_holders_list(), public.chat_key_escrow_get(uuid),
  public.chat_key_admin_rewrap(uuid, jsonb) from public, anon;
grant execute on function public.chat_key_put(jsonb, jsonb, jsonb, text, text, boolean), public.chat_key_safe_set(jsonb), public.chat_key_mode_set(text, jsonb),
  public.chat_org_key_init(jsonb, text, jsonb), public.chat_org_key_grant(uuid, jsonb), public.chat_org_holders_list(), public.chat_key_escrow_get(uuid),
  public.chat_key_admin_rewrap(uuid, jsonb) to authenticated;

do $$
declare miss text := '';
begin
  if to_regclass('public.chat_keys') is null then miss := miss || ' chat_keys'; end if;
  if to_regclass('public.chat_pubkeys') is null then miss := miss || ' chat_pubkeys'; end if;
  if to_regclass('public.chat_org_key') is null then miss := miss || ' chat_org_key'; end if;
  if to_regprocedure('public.chat_key_put(jsonb,jsonb,jsonb,text,text,boolean)') is null then miss := miss || ' chat_key_put()'; end if;
  if to_regprocedure('public.chat_key_escrow_get(uuid)') is null then miss := miss || ' chat_key_escrow_get()'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_keys' and policyname='chat_keys_own') then miss := miss || ' chat_keys_own'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.21 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.21 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.22 · PUSH: отправка сразу от базы, защита от двойной отправки, ссылки на документ, «документ изменён»
-- =====================================================================
alter table public.push_queue add column if not exists claimed_at timestamptz;

-- 1) Захват строк очереди: два одновременных запуска функции push (расписание + толчок от базы + пинг приложения)
--    больше не отправят одно уведомление дважды. Захват «протухает» через 2 минуты — упавший запуск ничего не теряет.
create or replace function public.push_claim(p_limit int)
returns setof public.push_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.push_queue q set claimed_at = now()
   where q.id in (select id from public.push_queue
                   where sent_at is null and tries < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
                   order by created_at limit greatest(1, least(coalesce(p_limit, 200), 500)) for update skip locked)
  returning q.*;
end $$;
revoke all on function public.push_claim(int) from public, anon, authenticated;
grant execute on function public.push_claim(int) to service_role;

-- 2) Толчок от базы: появилась строка в очереди — база сама зовёт Edge Function push (pg_net, асинхронно, после commit).
--    Адрес функции и ключи лежат в app_secrets (их кладёт push-setup.sql). Нет pg_net или настроек — молча ничего не делаем:
--    уведомление уйдёт по расписанию или от открытого приложения, как раньше. Один толчок на транзакцию.
create or replace function public.push_kick()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_key text; v_cron text;
begin
  if current_setting('techlog.restore', true) = '1' then return null; end if;
  if current_setting('techlog.push_kicked', true) = '1' then return null; end if;
  perform set_config('techlog.push_kicked', '1', true);
  select value into v_url  from public.app_secrets where key = 'push_fn_url';
  select value into v_key  from public.app_secrets where key = 'push_fn_key';
  select value into v_cron from public.app_secrets where key = 'push_cron_key';
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' or coalesce(v_cron, '') = '' then return null; end if;
  begin
    perform net.http_post(url := v_url || '?send=1&kick=1',
      /* ключ проекта нового формата (sb_publishable_…) — не JWT: его нельзя слать как Bearer, шлюз функций ответит 401.
         Поэтому: apikey — всегда; Authorization — только для старого JWT-ключа (eyJ…). У функции push при ключах нового
         формата должна быть ВЫКЛЮЧЕНА проверка «Verify JWT» — свою проверку (x-cron-key либо вход пользователя) она делает сама. */
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'x-cron-key', v_cron)
                 || case when v_key like 'eyJ%' then jsonb_build_object('Authorization', 'Bearer ' || v_key) else '{}'::jsonb end,
      body := '{}'::jsonb);
  exception when others then null;            -- pg_net не включён / недоступен — доставка пойдёт прежним путём
  end;
  return null;
end $$;
drop trigger if exists push_kick_tg on public.push_queue;
create trigger push_kick_tg after insert on public.push_queue for each statement execute function public.push_kick();

-- 3) Уведомления о документах ведут прямо в документ; новое — «Документ изменён» (кто-то другой поправил ваш документ)
create or replace function public.jobs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text; v_url text; v_who text; r record;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
  v_url  := './?doc=job:' || new.id::text;
  if tg_op = 'INSERT' then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Новая задача', v_body, v_url);
    end if;
    return new;
  end if;
  if new.technician_id is distinct from old.technician_id and new.technician_id is not null then
    perform public.push_enqueue(new.technician_id, 'job', 'Задача передана вам', v_body, v_url);
    return new;
  end if;
  if old.status is distinct from 'approved' and new.status = 'approved' then
    perform public.push_enqueue(new.technician_id, 'approve', 'Инвойс апрувлен',
      v_body || ' · $' || round(coalesce(new.approved_total, new.total, 0)), v_url);
    return new;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    perform public.push_enqueue(new.technician_id, 'reset', 'Апрув снят с инвойса', v_body, v_url);
    return new;
  end if;
  /* «Документ изменён»: содержимое поменял НЕ исполнитель (push_enqueue сам пропускает автора правки). Приложение шлёт
     строку целиком при любом сохранении — сравниваем только значимые поля; не чаще раза в 10 минут на документ и человека. */
  if auth.uid() is not null and (new.form_data is distinct from old.form_data or new.date is distinct from old.date
       or new.unit_number is distinct from old.unit_number or new.complex_id is distinct from old.complex_id
       or coalesce(new.note, '') is distinct from coalesce(old.note, '') or new.helper_ids is distinct from old.helper_ids) then
    select display_name into v_who from public.profiles where id = auth.uid();
    for r in select distinct x.uid from (
               select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x
              where x.uid is not null and x.uid <> auth.uid()
    loop
      if not exists (select 1 from public.push_queue where user_id = r.uid and kind = 'edit' and url = v_url and created_at > now() - interval '10 minutes') then
        perform public.push_enqueue(r.uid, 'edit', 'Документ изменён', v_body || ' · ' || coalesce(v_who, ''), v_url);
      end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.placements_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if new.ext_of is null and new.technician_id is not null then
    perform public.push_enqueue(new.technician_id, 'pickup', 'Новый пикап',
      'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · до ' || to_char(new.due_date, 'DD.MM'),
      './?day=' || to_char(new.due_date, 'YYYY-MM-DD'));
  end if;
  return new;
end $$;

create or replace function public.repairs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text; v_url text; r record;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if old.status is distinct from 'approved' and new.status = 'approved' then
    v_t := 'Ремонт апрувлен';
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    v_t := 'Апрув снят с ремонта';
  else
    return new;
  end if;
  v_b := 'REP-' || new.no || ' · Unit ' || coalesce(nullif(new.unit_number,''),'—');
  v_url := './?doc=rep:' || new.id::text;
  perform public.push_enqueue(new.created_by, 'approve', v_t, v_b, v_url);
  for r in select distinct value::uuid as uid
             from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
  loop
    if r.uid is distinct from new.created_by then
      perform public.push_enqueue(r.uid, 'approve', v_t, v_b, v_url);
    end if;
  end loop;
  return new;
end $$;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='push_queue' and column_name='claimed_at') then miss := miss || ' push_queue.claimed_at'; end if;
  if to_regprocedure('public.push_claim(int)') is null then miss := miss || ' push_claim()'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'push_kick_tg') then miss := miss || ' push_kick_tg'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.22 применено — всё на месте. Для отправки «сразу от базы» выполните ещё push-setup.sql.'; end if;
end $$;

select 'TechLog v1.09.22 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.23 · РЕВЬЮ ЧАТА И ПУШЕЙ: заголовок уведомления = переписка, проверка ключа отметки чтения, тайм-аут вызова от базы
-- =====================================================================
create or replace function public.chat_send(
  p_to uuid, p_channel text, p_group uuid, p_body text, p_important boolean, p_doc_kind text, p_doc uuid, p_doc_title text,
  p_reply uuid, p_thumb text, p_img text, p_w int, p_h int)
returns public.chat_msgs language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_role text := coalesce(public.my_role(), '');
  v_body text := left(coalesce(trim(p_body), ''), 2000);
  v_imp boolean := coalesce(p_important, false) and v_role in ('admin','manager');
  v_name text; v_row public.chat_msgs; v_title text; v_text text; v_ok boolean; r record; v_img uuid;
  v_has_img boolean := p_img is not null and p_thumb is not null; v_gname text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if num_nonnulls(p_to, p_channel, p_group) <> 1 then raise exception 'BAD_TARGET'; end if;
  if p_group is not null then
    if not public.chat_is_member(p_group) then raise exception 'FORBIDDEN'; end if;
    select name into v_gname from public.chat_groups where id = p_group;
  end if;
  if p_channel is not null and p_channel not in ('ann','all') then raise exception 'BAD_TARGET'; end if;
  if p_channel = 'ann' and v_role not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_to is not null and (p_to = v_me or not exists (select 1 from public.profiles where id = p_to and not blocked)) then raise exception 'NOT_FOUND'; end if;
  if p_doc is not null then
    if coalesce(p_doc_kind, '') not in ('job','prop','rep') then raise exception 'BAD_DOC'; end if;
    if p_doc_kind = 'job' then v_ok := public.can_view_job(p_doc);
    elsif p_doc_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
    else v_ok := exists (select 1 from public.proposals where id = p_doc);
    end if;
    if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  end if;
  if v_has_img then
    if left(p_img, 23) <> 'data:image/jpeg;base64,' or left(p_thumb, 23) <> 'data:image/jpeg;base64,' then raise exception 'BAD_IMAGE'; end if;
    if length(p_img) > 1500000 or length(p_thumb) > 60000 then raise exception 'TOO_BIG'; end if;
  end if;
  if v_body = '' and p_doc is null and not v_has_img then raise exception 'EMPTY'; end if;
  -- отвечать можно только на сообщение, которое сам видишь
  if p_reply is not null and not public.chat_msg_visible(p_reply) then p_reply := null; end if;

  if v_has_img then v_img := gen_random_uuid(); end if;
  insert into public.chat_msgs (from_user, to_user, channel, group_id, body, important, doc_kind, doc_id, doc_title, reply_to, img_thumb, img_id, img_w, img_h)
  values (v_me, p_to, p_channel, p_group, v_body, v_imp, case when p_doc is null then null else p_doc_kind end, p_doc,
          case when p_doc is null then '' else left(coalesce(trim(p_doc_title), ''), 160) end, p_reply,
          case when v_has_img then p_thumb end, v_img, case when v_has_img then p_w end, case when v_has_img then p_h end)
  returning * into v_row;
  if v_has_img then insert into public.chat_files (id, msg_id, data, bytes) values (v_img, v_row.id, p_img, (length(p_img) * 3) / 4); end if;

  select display_name into v_name from public.profiles where id = v_me;
  /* v1.09.23 (ревью): заголовок уведомления — ПЕРЕПИСКА (человек, группа, канал), а автор идёт в строку. Иначе стопка группы
     называлась именем последнего написавшего: «Бригада · Олег (3)», хотя из трёх сообщений его было одно. */
  v_title := case when v_imp then '❗ ' else '' end
          || case when p_channel = 'ann' then 'Объявления' when p_channel = 'all' then 'Общий чат'
                  when p_group is not null then coalesce(v_gname, 'Группа') else coalesce(v_name, 'TechLog') end;
  v_text := case when p_to is null then split_part(coalesce(v_name, ''), ' ', 1) || ': ' else '' end
         || case when v_body <> '' then left(v_body, 160) else '' end
         || case when v_has_img then case when v_body <> '' then ' · ' else '' end || '📷 Фото' else '' end
         || case when p_doc is not null then case when v_body <> '' or v_has_img then ' · ' else '' end || '📄 ' || left(coalesce(p_doc_title, 'документ'), 100) else '' end;
  if p_to is not null then
    perform public.push_enqueue(p_to, 'chat', v_title, v_text, './?chat=' || v_me::text);
  elsif p_group is not null then
    for r in select gm.user_id as id from public.chat_members gm join public.profiles pf on pf.id = gm.user_id
              where gm.group_id = p_group and gm.user_id <> v_me and not pf.blocked limit 300 loop
      perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=g:' || p_group::text);
    end loop;
  else
    for r in select id from public.profiles where not blocked and id <> v_me limit 300 loop
      perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=' || p_channel);
    end loop;
  end if;
  if random() < 0.03 then perform public.chat_cleanup(); end if;      -- уборка «между делом»: отдельное расписание не нужно
  return v_row;
end $$;

-- отметка чтения принимает только настоящие ключи переписок (раньше — любую строку до 60 знаков: мусор в таблице)
create or replace function public.chat_mark_read(p_thread text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if p_thread is null or p_thread !~ '^(ann|all|(g:)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$' then raise exception 'BAD_THREAD'; end if;
  if left(p_thread, 2) = 'g:' and not public.chat_is_member(substr(p_thread, 3)::uuid) then raise exception 'FORBIDDEN'; end if;
  insert into public.chat_reads (user_id, thread, read_at)
  values (auth.uid(), p_thread, least(coalesce(p_at, now()), now() + interval '1 minute'))
  on conflict (user_id, thread) do update set read_at = greatest(public.chat_reads.read_at, excluded.read_at);
end $$;
revoke all on function public.chat_mark_read(text, timestamptz) from public, anon;
grant execute on function public.chat_mark_read(text, timestamptz) to authenticated;

-- толчок от базы: функции нужно время (холодный старт + рассылка) — 2 секунды по умолчанию обрывали вызов
create or replace function public.push_kick()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_key text; v_cron text;
begin
  if current_setting('techlog.restore', true) = '1' then return null; end if;
  if current_setting('techlog.push_kicked', true) = '1' then return null; end if;
  perform set_config('techlog.push_kicked', '1', true);
  select value into v_url  from public.app_secrets where key = 'push_fn_url';
  select value into v_key  from public.app_secrets where key = 'push_fn_key';
  select value into v_cron from public.app_secrets where key = 'push_cron_key';
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' or coalesce(v_cron, '') = '' then return null; end if;
  begin
    perform net.http_post(url := v_url || '?send=1&kick=1',
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'x-cron-key', v_cron)
                 || case when v_key like 'eyJ%' then jsonb_build_object('Authorization', 'Bearer ' || v_key) else '{}'::jsonb end,
      body := '{}'::jsonb, timeout_milliseconds := 10000);
  exception when others then null;            -- pg_net не включён / недоступен — доставка пойдёт прежним путём
  end;
  return null;
end $$;

do $$
declare miss text := '';
begin
  if position('BAD_THREAD' in pg_get_functiondef('public.chat_mark_read(text,timestamptz)'::regprocedure)) = 0 then miss := miss || ' chat_mark_read(проверка ключа)'; end if;
  if position('timeout_milliseconds' in pg_get_functiondef('public.push_kick()'::regprocedure)) = 0 then miss := miss || ' push_kick(тайм-аут)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.23 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.23 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;


-- =====================================================================
-- v1.09.24 · ЧАТ: модерация в группах (создатель и назначенные админы группы), «не беспокоить», срок хранения по
-- умолчанию БЕЗ ограничения, бухгалтер в чате с правами менеджера, лимиты от потока, пароль от 10 символов на сервере
-- =====================================================================
alter table public.chat_members add column if not exists role text not null default 'member';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chat_members_role_chk') then
    alter table public.chat_members add constraint chat_members_role_chk check (role in ('member','admin'));
  end if;
end $$;

-- модератор группы: её создатель или участник с ролью admin
create or replace function public.chat_is_group_mod(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.chat_groups g where g.id = p_group and g.created_by = auth.uid())
      or exists (select 1 from public.chat_members m where m.group_id = p_group and m.user_id = auth.uid() and m.role = 'admin');
$$;
revoke all on function public.chat_is_group_mod(uuid) from public, anon;
grant execute on function public.chat_is_group_mod(uuid) to authenticated;

-- удалить сообщение: автор; администратор фирмы — в общих каналах; в группе — её модератор
drop policy if exists chat_msgs_del on public.chat_msgs;
create policy chat_msgs_del on public.chat_msgs for delete to authenticated
  using (from_user = auth.uid()
         or (channel is not null and public.my_role() = 'admin')
         or (group_id is not null and public.chat_is_group_mod(group_id)));

-- назначить / снять админа группы: создатель группы или администратор фирмы
create or replace function public.chat_group_set_role(p_group uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('member','admin') then raise exception 'BAD_ROLE'; end if;
  if not exists (select 1 from public.chat_groups where id = p_group and (created_by = auth.uid() or public.my_role() = 'admin')) then raise exception 'FORBIDDEN'; end if;
  update public.chat_members set role = p_role where group_id = p_group and user_id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.chat_group_set_role(uuid, uuid, text) from public, anon;
grant execute on function public.chat_group_set_role(uuid, uuid, text) to authenticated;

-- название и состав теперь правит и админ группы (создателя убрать может только он сам или администратор фирмы)
create or replace function public.chat_group_rename(p_group uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := left(coalesce(trim(p_name), ''), 60);
begin
  if v_name = '' then raise exception 'EMPTY'; end if;
  if not (public.chat_is_group_mod(p_group) or public.my_role() = 'admin') then raise exception 'FORBIDDEN'; end if;
  update public.chat_groups set name = v_name where id = p_group;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.chat_group_remove(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_next uuid;
begin
  select created_by into v_owner from public.chat_groups where id = p_group; if not found then raise exception 'NOT_FOUND'; end if;
  if not (p_user = auth.uid() or public.my_role() = 'admin' or (public.chat_is_group_mod(p_group) and p_user is distinct from v_owner)) then raise exception 'FORBIDDEN'; end if;
  delete from public.chat_members where group_id = p_group and user_id = p_user;
  select user_id into v_next from public.chat_members where group_id = p_group order by (role = 'admin') desc, added_at limit 1;   -- группа переходит админу группы, иначе самому давнему
  if v_next is null then delete from public.chat_groups where id = p_group;
  elsif v_owner is not distinct from p_user then update public.chat_groups set created_by = v_next where id = p_group; end if;
  delete from public.chat_reads where user_id = p_user and thread = 'g:' || p_group::text;
end $$;

-- группы: не больше 20 новых в сутки от одного человека
create or replace function public.chat_group_create(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_name text := left(coalesce(trim(p_name), ''), 60); u uuid; v_who text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if v_name = '' then raise exception 'EMPTY'; end if;
  if (select count(*) from public.chat_groups where created_by = v_me and created_at > now() - interval '1 day') >= 20 then raise exception 'RATE_LIMIT'; end if;
  insert into public.chat_groups (name, created_by) values (v_name, v_me) returning id into v_id;
  insert into public.chat_members (group_id, user_id, added_by) values (v_id, v_me, v_me);
  select display_name into v_who from public.profiles where id = v_me;
  foreach u in array coalesce(p_members, array[]::uuid[]) loop
    continue when u = v_me or not exists (select 1 from public.profiles where id = u and not blocked);
    insert into public.chat_members (group_id, user_id, added_by) values (v_id, u, v_me) on conflict do nothing;
    perform public.push_enqueue(u, 'chat', 'Вас добавили в группу', coalesce(v_who, '') || ': «' || v_name || '»', './?chat=g:' || v_id::text);
  end loop;
  return v_id;
end $$;

-- «не беспокоить»: переписка в списке profiles.push_prefs.chat_mute
create or replace function public.chat_muted(p_user uuid, p_key text)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select (push_prefs -> 'chat_mute') ? p_key from public.profiles where id = p_user), false);
$$;
revoke all on function public.chat_muted(uuid, text) from public, anon, authenticated;

-- срок хранения переписки: по умолчанию БЕЗ ограничения (0). Прежнее значение по умолчанию (180) сбрасывается;
-- выставленное вручную другое число не трогается.
alter table public.org_settings alter column chat_keep_days set default 0;
update public.org_settings set chat_keep_days = 0 where chat_keep_days = 180;
create or replace function public.chat_cleanup()
returns int language plpgsql security definer set search_path = public as $$
declare v_days int; v_n int := 0;
begin
  select coalesce(max(chat_keep_days), 0) into v_days from public.org_settings;
  if v_days > 0 then
    delete from public.chat_msgs where created_at < now() - make_interval(days => v_days);
    get diagnostics v_n = row_count;
  end if;
  update public.push_queue set body = '' where kind = 'chat' and sent_at is not null and body <> '';
  delete from public.push_queue where kind = 'chat' and sent_at is not null and sent_at < now() - interval '14 days';
  return v_n;
end $$;
revoke all on function public.chat_cleanup() from public, anon, authenticated;

create or replace function public.chat_send(
  p_to uuid, p_channel text, p_group uuid, p_body text, p_important boolean, p_doc_kind text, p_doc uuid, p_doc_title text,
  p_reply uuid, p_thumb text, p_img text, p_w int, p_h int)
returns public.chat_msgs language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_role text := coalesce(public.my_role(), '');
  v_body text := left(coalesce(trim(p_body), ''), 2000);
  v_imp boolean := coalesce(p_important, false) and v_role in ('admin','manager','accountant');   -- v1.09.24: бухгалтер в чате — с правами менеджера
  v_name text; v_row public.chat_msgs; v_title text; v_text text; v_ok boolean; r record; v_img uuid;
  v_has_img boolean := p_img is not null and p_thumb is not null; v_gname text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if num_nonnulls(p_to, p_channel, p_group) <> 1 then raise exception 'BAD_TARGET'; end if;
  if p_group is not null then
    if not public.chat_is_member(p_group) then raise exception 'FORBIDDEN'; end if;
    select name into v_gname from public.chat_groups where id = p_group;
  end if;
  if p_channel is not null and p_channel not in ('ann','all') then raise exception 'BAD_TARGET'; end if;
  if p_channel = 'ann' and v_role not in ('admin','manager','accountant') then raise exception 'FORBIDDEN'; end if;
  -- v1.09.24: защита от потока — не больше 30 сообщений в минуту от одного человека
  if (select count(*) from public.chat_msgs where from_user = v_me and created_at > now() - interval '1 minute') >= 30 then raise exception 'RATE_LIMIT'; end if;
  if p_to is not null and (p_to = v_me or not exists (select 1 from public.profiles where id = p_to and not blocked)) then raise exception 'NOT_FOUND'; end if;
  if p_doc is not null then
    if coalesce(p_doc_kind, '') not in ('job','prop','rep') then raise exception 'BAD_DOC'; end if;
    if p_doc_kind = 'job' then v_ok := public.can_view_job(p_doc);
    elsif p_doc_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
    else v_ok := exists (select 1 from public.proposals where id = p_doc);
    end if;
    if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  end if;
  if v_has_img then
    if left(p_img, 23) <> 'data:image/jpeg;base64,' or left(p_thumb, 23) <> 'data:image/jpeg;base64,' then raise exception 'BAD_IMAGE'; end if;
    if length(p_img) > 1500000 or length(p_thumb) > 60000 then raise exception 'TOO_BIG'; end if;
  end if;
  if v_body = '' and p_doc is null and not v_has_img then raise exception 'EMPTY'; end if;
  -- отвечать можно только на сообщение, которое сам видишь
  if p_reply is not null and not public.chat_msg_visible(p_reply) then p_reply := null; end if;

  if v_has_img then v_img := gen_random_uuid(); end if;
  insert into public.chat_msgs (from_user, to_user, channel, group_id, body, important, doc_kind, doc_id, doc_title, reply_to, img_thumb, img_id, img_w, img_h)
  values (v_me, p_to, p_channel, p_group, v_body, v_imp, case when p_doc is null then null else p_doc_kind end, p_doc,
          case when p_doc is null then '' else left(coalesce(trim(p_doc_title), ''), 160) end, p_reply,
          case when v_has_img then p_thumb end, v_img, case when v_has_img then p_w end, case when v_has_img then p_h end)
  returning * into v_row;
  if v_has_img then insert into public.chat_files (id, msg_id, data, bytes) values (v_img, v_row.id, p_img, (length(p_img) * 3) / 4); end if;

  select display_name into v_name from public.profiles where id = v_me;
  /* v1.09.23 (ревью): заголовок уведомления — ПЕРЕПИСКА (человек, группа, канал), а автор идёт в строку. Иначе стопка группы
     называлась именем последнего написавшего: «Бригада · Олег (3)», хотя из трёх сообщений его было одно. */
  v_title := case when v_imp then '❗ ' else '' end
          || case when p_channel = 'ann' then 'Объявления' when p_channel = 'all' then 'Общий чат'
                  when p_group is not null then coalesce(v_gname, 'Группа') else coalesce(v_name, 'TechLog') end;
  v_text := case when p_to is null then split_part(coalesce(v_name, ''), ' ', 1) || ': ' else '' end
         || case when v_body <> '' then left(v_body, 160) else '' end
         || case when v_has_img then case when v_body <> '' then ' · ' else '' end || '📷 Фото' else '' end
         || case when p_doc is not null then case when v_body <> '' or v_has_img then ' · ' else '' end || '📄 ' || left(coalesce(p_doc_title, 'документ'), 100) else '' end;
  /* v1.09.24: «не беспокоить» — переписка в списке profiles.push_prefs.chat_mute получателя пуш не шлёт.
     Сообщение с пометкой «Важно» проходит всегда: ради этого пометка и существует. */
  if p_to is not null then
    if v_imp or not public.chat_muted(p_to, v_me::text) then
      perform public.push_enqueue(p_to, 'chat', v_title, v_text, './?chat=' || v_me::text);
    end if;
  elsif p_group is not null then
    for r in select gm.user_id as id from public.chat_members gm join public.profiles pf on pf.id = gm.user_id
              where gm.group_id = p_group and gm.user_id <> v_me and not pf.blocked limit 300 loop
      if v_imp or not public.chat_muted(r.id, 'g:' || p_group::text) then
        perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=g:' || p_group::text);
      end if;
    end loop;
  else
    for r in select id from public.profiles where not blocked and id <> v_me limit 300 loop
      if v_imp or not public.chat_muted(r.id, p_channel) then
        perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=' || p_channel);
      end if;
    end loop;
  end if;
  if random() < 0.03 then perform public.chat_cleanup(); end if;      -- уборка «между делом»: отдельное расписание не нужно
  return v_row;
end $$;

-- пароль от 10 символов — и на сервере (раньше проверяло только приложение)
create or replace function public.admin_set_password(target uuid, new_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(new_password,'')) < 10 then raise exception 'WEAK_PASSWORD'; end if;   -- v1.09.24: паролем заперт ключ переписки
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
end $$;

create or replace function public.admin_create_user(
  p_login text, p_email text, p_password text, p_display_name text, p_role text default 'tech')
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  new_id uuid := gen_random_uuid();
  v_login text := lower(trim(coalesce(p_login,'')));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_name  text := coalesce(nullif(trim(p_display_name),''), v_login);
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if v_login !~ '^[a-z0-9_.-]{3,32}$' then raise exception 'BAD_LOGIN'; end if;
  if v_email !~ '^[a-z0-9_.-]+@[a-z0-9.-]+$' or v_email not like v_login || '@%' then
    raise exception 'BAD_EMAIL';
  end if;
  if length(coalesce(p_password,'')) < 10 then raise exception 'WEAK_PASSWORD'; end if;   -- v1.09.24
  if p_role not in ('admin','manager','tech','accountant') then raise exception 'BAD_ROLE'; end if;
  if exists (select 1 from public.profiles where lower(login) = v_login)
     or exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'LOGIN_TAKEN';
  end if;

  perform set_config('techlog.admin_create', '1', true);   -- байпас триггера в этой транзакции

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token,
    reauthentication_token, is_super_admin, is_sso_user)
  values (
    new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('login', v_login, 'display_name', v_name),
    now(), now(),
    '', '', '', '', '', '', '', '', false, false);

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());

  insert into public.profiles (id, login, display_name, role, blocked)
  values (new_id, v_login, v_name, p_role, false);

  return new_id;
end $$;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='chat_members' and column_name='role') then miss := miss || ' chat_members.role'; end if;
  if to_regprocedure('public.chat_is_group_mod(uuid)') is null then miss := miss || ' chat_is_group_mod()'; end if;
  if to_regprocedure('public.chat_group_set_role(uuid,uuid,text)') is null then miss := miss || ' chat_group_set_role()'; end if;
  if to_regprocedure('public.chat_muted(uuid,text)') is null then miss := miss || ' chat_muted()'; end if;
  if position('RATE_LIMIT' in pg_get_functiondef('public.chat_send(uuid,text,uuid,text,boolean,text,uuid,text,uuid,text,text,int,int)'::regprocedure)) = 0 then miss := miss || ' chat_send(лимит)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.24 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.24 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_25 (документооборот) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.25 · ДОКУМЕНТООБОРОТ ИНВОЙСА
--   · личные права сотрудника: сокращение для номера (tag), «правка общих документов», «апрув инвойсов»;
--   · бригада видит документ всегда; правит — основной, а помощник только при «Общем доступе» и личном праве;
--   · статусы: черновик → выполнена (ждёт апрува, заперта) → апрув (заперт); «отозвать», «вернуть на доработку»,
--     «запросить правку» (doc_requests);
--   · одновременная правка: ревизия строки (rev) — чужие изменения молча не затираются (STALE_DOC),
--     плюс мягкая «занято» (doc_locks) с продлением раз в 40 с и сроком жизни 2 минуты;
--   · номер документа выдаётся при первом сохранении НЕ черновиком и замораживается (doc_no);
--   · лента уведомлений (notices): каждое событие пуша пишется и в ленту — даже если пуш этого вида выключен;
--   · новые события: добавили в бригаду, сняли с задачи, возврат на доработку, документ отозван;
--   · «Важные объявления»: круг пишущих расширяет админ (can_announce), пуш канала не отключается.
-- =====================================================================

-- 1) Сотрудник: сокращение и личные права ------------------------------
alter table public.profiles add column if not exists tag text;
alter table public.profiles add column if not exists can_edit_docs boolean not null default true;
alter table public.profiles add column if not exists can_approve   boolean not null default false;
alter table public.profiles add column if not exists can_announce  boolean not null default false;
alter table public.profiles drop constraint if exists profiles_tag_ck;
alter table public.profiles add constraint profiles_tag_ck check (tag is null or tag ~ '^[A-Z0-9]{2,4}$');
create unique index if not exists profiles_tag_uq on public.profiles(tag) where tag is not null;

alter table public.org_settings add column if not exists docflow_v int not null default 0;

-- разовый перенос: «менеджер может апрувить» (общая галочка) → личное право каждого менеджера
do $$
begin
  if coalesce((select docflow_v from public.org_settings where id = 'org'), 0) < 1 then
    set local session_replication_role = replica;
    update public.profiles set can_approve = true
     where role = 'manager'
       and coalesce((select manager_can_approve from public.org_settings where id = 'org'), false);
    update public.org_settings set docflow_v = 1 where id = 'org';
    set local session_replication_role = origin;
  end if;
end $$;

create or replace function public.can_approve_docs()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.role = 'admin' or (p.role = 'manager' and p.can_approve)) and not p.blocked
                     from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.can_approve_docs() from public, anon;
grant execute on function public.can_approve_docs() to authenticated;

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN_FIELD_ID';
  end if;
  if coalesce(public.my_role(), 'tech') <> 'admin' then
    if new.role         is distinct from old.role
       or new.blocked   is distinct from old.blocked
       or new.login     is distinct from old.login
       or new.car_no    is distinct from old.car_no
       or new.study_access is distinct from old.study_access
       or new.tag           is distinct from old.tag
       or new.can_edit_docs is distinct from old.can_edit_docs
       or new.can_approve   is distinct from old.can_approve
       or new.can_announce  is distinct from old.can_announce then
      raise exception 'FORBIDDEN_FIELD';
    end if;
  end if;
  return new;
end $$;

create or replace function public.admin_set_doc_rights(p_user uuid, p_tag text, p_edit boolean, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_tag text := nullif(upper(regexp_replace(coalesce(p_tag, ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  if coalesce(public.my_role(), 'tech') <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if v_tag is not null and v_tag !~ '^[A-Z0-9]{2,4}$' then raise exception 'BAD_TAG'; end if;
  if v_tag is not null and exists (select 1 from public.profiles where tag = v_tag and id <> p_user) then
    raise exception 'TAG_TAKEN';
  end if;
  update public.profiles
     set tag = v_tag,
         can_edit_docs = coalesce(p_edit, can_edit_docs),
         can_approve   = coalesce(p_approve, can_approve)
   where id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce((select display_name from public.profiles where id = auth.uid()), ''),
          'doc_rights', 'profile', p_user::text,
          jsonb_build_object('tag', v_tag, 'edit', p_edit, 'approve', p_approve));
end $$;
revoke all on function public.admin_set_doc_rights(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.admin_set_doc_rights(uuid, text, boolean, boolean) to authenticated;

-- 2) Инвойс: ревизия, автор правки, замороженный номер, возврат, окно правки ----
alter table public.jobs add column if not exists rev int not null default 0;
alter table public.jobs add column if not exists updated_by uuid;
alter table public.jobs add column if not exists doc_no text;
alter table public.jobs add column if not exists numbered_at timestamptz;
alter table public.jobs add column if not exists return_note text;
alter table public.jobs add column if not exists returned_by uuid;
alter table public.jobs add column if not exists approved_crew jsonb;
alter table public.jobs add column if not exists edit_open_until timestamptz;

-- номер больше не выдаётся при создании строки: счётчик свой, выдаёт триггер при первом НЕ черновике
do $$
declare v_next bigint;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'jobs' and column_name = 'no' and is_identity = 'YES') then
    alter table public.jobs alter column no drop identity;
  end if;
  alter table public.jobs alter column no drop not null;
  alter table public.jobs alter column no drop default;
  if to_regclass('public.jobs_doc_no_seq') is null then
    select coalesce(max(no), 0) + 1 into v_next from public.jobs;
    execute format('create sequence public.jobs_doc_no_seq start with %s', v_next);
  end if;
end $$;

-- 3) Кто бригада, кто правит -------------------------------------------
create or replace function public.is_job_crew(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j
                  where j.id = p_job and (j.technician_id = auth.uid() or j.helper_ids ? auth.uid()::text))
$$;
revoke all on function public.is_job_crew(uuid) from public, anon;
grant execute on function public.is_job_crew(uuid) to authenticated;

-- помощник правит общий документ только с личным правом «правка общих документов»
create or replace function public.is_shared_job_helper(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.shared_jobs_enabled()
     and coalesce((select can_edit_docs from public.profiles where id = auth.uid()), false)
     and exists (
       select 1 from public.jobs j
       where j.id = p_job
         and j.shared_with_helpers
         and j.helper_ids ? auth.uid()::text
     )
$$;

-- бригада видит документ (а через него — фото и пикапы) всегда
create or replace function public.can_view_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.technician_id = auth.uid()
      or public.my_role() in ('admin','manager','accountant')
      or j.helper_ids ? auth.uid()::text
    )
  )
$$;

drop policy if exists jobs_sel on public.jobs;
create policy jobs_sel on public.jobs for select to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager','accountant')
    or helper_ids ? auth.uid()::text
  );

-- правка: основной, админ, менеджер (что именно можно — решает jobs_guard по статусу), помощник с правом
drop policy if exists jobs_upd on public.jobs;
create policy jobs_upd on public.jobs for update to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager')
    or public.is_shared_job_helper(id)
  )
  with check (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager')
    or public.is_shared_job_helper(id)
  );

-- удаление строки: основной — только черновик, дальше — админ
drop policy if exists jobs_del on public.jobs;
create policy jobs_del on public.jobs for delete to authenticated
  using ((technician_id = auth.uid() and status = 'draft') or public.my_role() = 'admin');

drop policy if exists pl_sel on public.placements;
create policy pl_sel on public.placements for select to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager','accountant')
         or public.is_shared_job_helper(job_id) or public.is_job_crew(job_id));

-- 4) Сторож инвойса -----------------------------------------------------
create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := coalesce(public.my_role(), 'tech');
  v_appr boolean := public.can_approve_docs();
  v_sys  boolean := auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1'
                    or coalesce(current_setting('techlog.sysupd', true), '') = '1';
  v_content boolean; v_no bigint;
begin
  new.updated_at := now();
  if v_sys then return new; end if;

  -- поля, которыми клиент не распоряжается
  new.no := old.no; new.numbered_at := old.numbered_at; new.approved_crew := old.approved_crew;
  if v_role = 'admin' then new.doc_no := coalesce(new.doc_no, old.doc_no); else new.doc_no := old.doc_no; end if;
  if not v_appr then
    new.edit_open_until := old.edit_open_until;
    new.approved_total := old.approved_total; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    if not (new.status = 'draft' and old.status = 'done') then
      new.return_note := old.return_note; new.returned_by := old.returned_by;
    end if;
  end if;

  v_content := new.form_data is distinct from old.form_data
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')
       or new.date is distinct from old.date
       or coalesce(new.unit_number, '') is distinct from coalesce(old.unit_number, '')
       or new.complex_id is distinct from old.complex_id
       or new.counterparty_id is distinct from old.counterparty_id
       or new.work_type_id is distinct from old.work_type_id
       or new.technician_id is distinct from old.technician_id
       or new.helper_ids is distinct from old.helper_ids
       or new.shared_with_helpers is distinct from old.shared_with_helpers
       or new.total is distinct from old.total
       or new.proposal_id is distinct from old.proposal_id;

  -- смена основного исполнителя: админ всегда, менеджер — пока черновик
  if new.technician_id is distinct from old.technician_id
     and not (v_role = 'admin' or (v_role = 'manager' and old.status = 'draft')) then
    raise exception 'FORBIDDEN_FIELD';
  end if;
  -- состав бригады и «Общий доступ» помощник не меняет
  if (new.helper_ids is distinct from old.helper_ids or new.shared_with_helpers is distinct from old.shared_with_helpers)
     and not (v_role in ('admin','manager') or old.technician_id = v_uid) then
    raise exception 'FORBIDDEN_CREW';
  end if;
  -- в архив: основной — только черновик, дальше — админ
  if new.archived_at is distinct from old.archived_at and old.status <> 'draft' and v_role <> 'admin' then
    raise exception 'DOC_LOCKED_DELETE';
  end if;

  if new.status = 'approved' and old.status <> 'approved' and not v_appr then
    raise exception 'FORBIDDEN_APPROVE';
  end if;

  if not v_appr then
    if old.status = 'approved' and (v_content or new.status <> 'approved') then
      raise exception 'DOC_LOCKED_APPROVED';
    end if;
    if old.status = 'done' then
      if new.status = 'draft' then        -- «отозвать»: основной или менеджер; правки в том же сохранении допустимы
        if not (old.technician_id = v_uid or v_role = 'manager') then raise exception 'DOC_LOCKED_DONE'; end if;
      elsif v_content then
        raise exception 'DOC_LOCKED_DONE';
      end if;
    end if;
  end if;

  -- ревизия: чужую правку, которую автор этой записи не видел, молча не затираем
  if v_content or new.status is distinct from old.status then
    if new.rev is distinct from old.rev and old.updated_by is distinct from v_uid then
      raise exception 'STALE_DOC';
    end if;
    new.rev := old.rev + 1;
    new.updated_by := v_uid;
  else
    new.rev := old.rev; new.updated_by := old.updated_by;
  end if;

  -- переходы статуса
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := coalesce(new.approved_by, v_uid);
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_crew := jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb));
    new.edit_open_until := null; new.return_note := null; new.returned_by := null;
  elsif old.status = 'approved' and new.status <> 'approved' then
    new.approved_total := null; new.approved_by := null; new.approved_at := null; new.approved_crew := null;
  end if;
  if new.status = 'done' and old.status = 'draft' then
    new.return_note := null; new.returned_by := null;
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    if old.technician_id is distinct from v_uid and coalesce(new.return_note, '') <> '' then new.returned_by := v_uid;
    elsif old.technician_id = v_uid then new.return_note := null; new.returned_by := null; end if;
  end if;

  -- номер — при первом НЕ черновике
  if new.status <> 'draft' and new.no is null then
    loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop;
    new.no := v_no; new.numbered_at := now();
  end if;
  return new;
end $$;

drop trigger if exists jobs_guard_tg on public.jobs;
create trigger jobs_guard_tg before update on public.jobs
  for each row execute function public.jobs_guard();

-- новая строка: служебные поля приводятся в порядок ПОСЛЕ вставки. В BEFORE INSERT этого делать нельзя: приложение
-- сохраняет через upsert, и BEFORE INSERT срабатывает при КАЖДОМ сохранении — счётчик номеров тратился бы впустую,
-- а обнулённая ревизия ломала бы проверку STALE_DOC.
create or replace function public.jobs_after_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  if auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  if new.status = 'approved' and not public.can_approve_docs() then raise exception 'FORBIDDEN_APPROVE'; end if;
  if new.status <> 'draft' then
    loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop;
  end if;
  perform set_config('techlog.sysupd', '1', true);
  update public.jobs set no = v_no, numbered_at = case when v_no is null then null else now() end, doc_no = null,
         rev = 0, updated_by = auth.uid(), edit_open_until = null, approved_crew = case when new.status = 'approved'
           then jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb)) else null end
   where id = new.id;
  perform set_config('techlog.sysupd', '', true);
  return new;
end $$;
drop trigger if exists jobs_after_ins_tg on public.jobs;
create trigger jobs_after_ins_tg after insert on public.jobs
  for each row execute function public.jobs_after_ins();

-- запрет правки по давности: разрешённая правка (edit_open_until) его обходит
create or replace function public.jobs_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select coalesce(edit_lock_days, 0) into v_n from public.org_settings where id = 'org';
  if v_n > 0
     and auth.uid() is not null
     and coalesce(current_setting('techlog.sysupd', true), '') <> '1'
     and coalesce(public.my_role(), 'tech') = 'tech'
     and old.date < current_date - v_n
     and not (old.edit_open_until is not null and old.edit_open_until > now()) then
    raise exception 'LOCKED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- замороженный текст номера: пишется один раз, когда номер уже выдан
create or replace function public.job_fix_no(p_job uuid, p_text text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_txt text := left(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9._-]', '', 'g'), 80);
begin
  if not public.can_view_job(p_job) then raise exception 'FORBIDDEN'; end if;
  select doc_no into v_cur from public.jobs where id = p_job and no is not null and status <> 'draft';
  if not found then return null; end if;
  if v_cur is not null then return v_cur; end if;
  if v_txt = '' then return null; end if;
  perform set_config('techlog.sysupd', '1', true);
  update public.jobs set doc_no = v_txt where id = p_job and doc_no is null;
  perform set_config('techlog.sysupd', '', true);
  return v_txt;
end $$;
revoke all on function public.job_fix_no(uuid, text) from public, anon;
grant execute on function public.job_fix_no(uuid, text) to authenticated;

-- апрув через функцию: право — личное
create or replace function public.approve_job(p_job uuid, p_total numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_unit text; v_name text;
begin
  if not public.can_approve_docs() then raise exception 'FORBIDDEN'; end if;
  if p_total is null or p_total < 0 then raise exception 'BAD_TOTAL'; end if;
  update public.jobs
     set status = 'approved', approved_total = p_total, approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where id = p_job
   returning unit_number into v_unit;
  if not found then raise exception 'NOT_FOUND'; end if;
  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name, ''), 'job_approve', 'job', p_job::text,
          jsonb_build_object('unit', coalesce(v_unit, ''), 'total', p_total, 'via', 'rpc'));
end $$;

-- ремонты: то же личное право вместо общей галочки
create or replace function public.repairs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_can boolean;
begin
  if coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  v_can := public.can_approve_docs();
  if TG_OP = 'INSERT' then
    if new.status in ('approved','declined') and not coalesce(v_can, false) then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status
     and new.status in ('approved','declined')
     and not coalesce(v_can, false) then
    raise exception 'FORBIDDEN_APPROVE';
  end if;
  return new;
end $$;

-- 5) Лента уведомлений ---------------------------------------------------
create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default '',
  title      text not null default '',
  body       text not null default '',
  url        text not null default './',
  actor      uuid,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notices_user_idx on public.notices(user_id, created_at desc);
alter table public.notices enable row level security;
grant select, update on public.notices to authenticated;
drop policy if exists notices_sel on public.notices;
create policy notices_sel on public.notices for select to authenticated using (user_id = auth.uid());
drop policy if exists notices_upd on public.notices;
create policy notices_upd on public.notices for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.notices_mark_read()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.notices set read_at = now() where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  if random() < 0.05 then delete from public.notices where created_at < now() - interval '90 days'; end if;
  return n;
end $$;
revoke all on function public.notices_mark_read() from public, anon;
grant execute on function public.notices_mark_read() to authenticated;

-- каждое событие — в ленту; пуш — только если этот вид у человека включён (переписка в ленту не идёт)
create or replace function public.push_enqueue(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text default './')
returns void language plpgsql security definer set search_path = public as $$
declare v_prefs jsonb;
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  select push_prefs into v_prefs from public.profiles where id = p_user and not blocked;
  if not found then return; end if;                             -- нет профиля / заблокирован
  if p_kind <> 'chat' then
    insert into public.notices(user_id, kind, title, body, url, actor)
    values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_url, './'), auth.uid());
  end if;
  if coalesce((coalesce(v_prefs, '{}'::jsonb)->>p_kind)::boolean, true) = false then return; end if;
  insert into public.push_queue(user_id, kind, title, body, url)
  values (p_user, p_kind, p_title, coalesce(p_body,''), coalesce(p_url,'./'));
end $$;
revoke all on function public.push_enqueue(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.push_enqueue(uuid,text,text,text,text) to service_role;

-- 6) События инвойса → лента и пуши ------------------------------------
create or replace function public.jobs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text; v_url text; v_who text; r record; v_done boolean := false;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
  v_url  := './?doc=job:' || new.id::text;
  if tg_op = 'INSERT' then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Новая задача', v_body, v_url);
    end if;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    return new;
  end if;
  select display_name into v_who from public.profiles where id = auth.uid();

  -- основной исполнитель сменился
  if new.technician_id is distinct from old.technician_id then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Задача передана вам', v_body, v_url);
    end if;
    if old.technician_id is not null and not (coalesce(new.helper_ids, '[]'::jsonb) ? old.technician_id::text) then
      perform public.push_enqueue(old.technician_id, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
    end if;
    v_done := true;
  end if;
  -- состав бригады
  if new.helper_ids is distinct from old.helper_ids then
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
              where not (coalesce(old.helper_ids, '[]'::jsonb) ? value) and value::uuid is distinct from old.technician_id
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(old.helper_ids, '[]'::jsonb))
              where not (coalesce(new.helper_ids, '[]'::jsonb) ? value)
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
      end if;
    end loop;
    v_done := true;
  end if;

  -- статусы
  if old.status is distinct from 'approved' and new.status = 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Инвойс апрувлен',
        v_body || ' · $' || round(coalesce(new.approved_total, new.total, 0)), v_url);
    end loop;
    return new;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'reset',
        case when new.status = 'draft' then 'Апрув снят — документ в черновике' else 'Апрув снят с инвойса' end,
        v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
    end loop;
    return new;
  elsif old.status = 'done' and new.status = 'draft' then
    if auth.uid() is distinct from new.technician_id then
      for r in select distinct x.uid from (select new.technician_id as uid
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Возвращён на доработку',
          v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
      end loop;
    else
      for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Документ отозван исполнителем', v_body || ' · ' || coalesce(v_who, ''), v_url);
      end loop;
    end if;
    return new;
  elsif old.status = 'draft' and new.status = 'done' then
    for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Ждёт апрува', v_body || ' · ' || coalesce(v_who, ''), v_url);
    end loop;
    return new;
  end if;
  if v_done then return new; end if;

  /* «Документ изменён»: содержимое поменял НЕ исполнитель (push_enqueue сам пропускает автора правки). Приложение шлёт
     строку целиком при любом сохранении — сравниваем только значимые поля; не чаще раза в 10 минут на документ и человека. */
  if auth.uid() is not null and (new.form_data is distinct from old.form_data or new.date is distinct from old.date
       or new.unit_number is distinct from old.unit_number or new.complex_id is distinct from old.complex_id
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')) then
    for r in select distinct x.uid from (
               select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x
              where x.uid is not null and x.uid <> auth.uid()
    loop
      if not exists (select 1 from public.notices where user_id = r.uid and kind = 'edit' and url = v_url and created_at > now() - interval '10 minutes') then
        perform public.push_enqueue(r.uid, 'edit',
          case when new.date is distinct from old.date then 'Задача перенесена на ' || to_char(new.date, 'DD.MM') else 'Документ изменён' end,
          v_body || ' · ' || coalesce(v_who, ''), v_url);
      end if;
    end loop;
  end if;
  return new;
end $$;

-- документ удалён (ушёл в архив) — бригада должна узнать
create or replace function public.jobs_arch_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_body text; v_who text;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if old.archived_at is null and new.archived_at is not null then
    v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
    select display_name into v_who from public.profiles where id = auth.uid();
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'job', 'Задача удалена', v_body || ' · ' || coalesce(v_who, ''), './');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists jobs_arch_push_tg on public.jobs;
create trigger jobs_arch_push_tg after update on public.jobs
  for each row execute function public.jobs_arch_push_tg_fn();

-- 7) Запросы на правку заапрувленного документа ---------------------------
create table if not exists public.doc_requests (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'job' check (kind in ('job')),
  doc_id     uuid not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text not null default '',
  status     text not null default 'pending' check (status in ('pending','granted','denied')),
  answer     text not null default '',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists doc_requests_doc_idx on public.doc_requests(doc_id);
create unique index if not exists doc_requests_one_pending on public.doc_requests(kind, doc_id) where status = 'pending';
alter table public.doc_requests enable row level security;
grant select on public.doc_requests to authenticated;
drop policy if exists doc_requests_sel on public.doc_requests;
create policy doc_requests_sel on public.doc_requests for select to authenticated
  using (user_id = auth.uid() or public.my_role() in ('admin','manager'));

create or replace function public.doc_request_edit(p_job uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype; v_id uuid; v_who text; r record; v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (j.technician_id = auth.uid() or j.helper_ids ? auth.uid()::text) then raise exception 'FORBIDDEN'; end if;
  if j.status <> 'approved' then raise exception 'BAD_STATUS'; end if;
  if length(v_reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if exists (select 1 from public.doc_requests where kind = 'job' and doc_id = p_job and status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;
  insert into public.doc_requests(kind, doc_id, user_id, reason) values ('job', p_job, auth.uid(), v_reason) returning id into v_id;
  select display_name into v_who from public.profiles where id = auth.uid();
  for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
  loop
    perform public.push_enqueue(r.uid, 'approve', 'Запрос на правку документа',
      'Unit ' || coalesce(nullif(j.unit_number,''),'—') || ' · ' || to_char(j.date, 'DD.MM') || ' · ' || coalesce(v_who, '') || ' · ' || v_reason,
      './?doc=job:' || p_job::text);
  end loop;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_who, ''), 'edit_request', 'job', p_job::text, jsonb_build_object('unit', j.unit_number, 'reason', v_reason));
  return v_id;
end $$;
revoke all on function public.doc_request_edit(uuid, text) from public, anon;
grant execute on function public.doc_request_edit(uuid, text) to authenticated;

create or replace function public.doc_request_decide(p_id uuid, p_grant boolean, p_answer text)
returns void language plpgsql security definer set search_path = public as $$
declare q public.doc_requests%rowtype; j public.jobs%rowtype; v_who text; v_ans text := left(trim(coalesce(p_answer, '')), 500);
begin
  if not public.can_approve_docs() then raise exception 'FORBIDDEN'; end if;
  select * into q from public.doc_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if q.status <> 'pending' then raise exception 'ALREADY_DECIDED'; end if;
  select * into j from public.jobs where id = q.doc_id;
  update public.doc_requests set status = case when p_grant then 'granted' else 'denied' end,
         answer = v_ans, decided_by = auth.uid(), decided_at = now() where id = p_id;
  select display_name into v_who from public.profiles where id = auth.uid();
  if p_grant and found and j.id is not null then
    update public.jobs set status = 'draft', edit_open_until = now() + interval '24 hours',
           return_note = nullif('Правка разрешена' || coalesce(': ' || nullif(v_ans, ''), ''), '') where id = q.doc_id;
  end if;
  if not p_grant then perform public.push_enqueue(q.user_id, 'reset', 'В правке отказано',
    'Unit ' || coalesce(nullif(j.unit_number,''),'—') || ' · ' || to_char(j.date, 'DD.MM') || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(v_ans, ''), ''),
    './?doc=job:' || q.doc_id::text); end if;   -- при разрешении автору запроса пишет триггер инвойса: «Апрув снят — документ в черновике»
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_who, ''), case when p_grant then 'edit_request_granted' else 'edit_request_denied' end,
          'job', q.doc_id::text, jsonb_build_object('unit', j.unit_number, 'answer', v_ans));
end $$;
revoke all on function public.doc_request_decide(uuid, boolean, text) from public, anon;
grant execute on function public.doc_request_decide(uuid, boolean, text) to authenticated;

-- 8) «Занято»: кто сейчас правит документ ---------------------------------
create table if not exists public.doc_locks (
  kind      text not null,
  doc_id    uuid not null,
  user_id   uuid not null,
  user_name text not null default '',
  since     timestamptz not null default now(),
  at        timestamptz not null default now(),
  primary key (kind, doc_id)
);
alter table public.doc_locks enable row level security;
grant select on public.doc_locks to authenticated;
drop policy if exists doc_locks_sel on public.doc_locks;
create policy doc_locks_sel on public.doc_locks for select to authenticated using (true);

-- взять или продлить; p_force — перехват (админ, менеджер — всегда; остальные — только у «уснувшей» блокировки)
create or replace function public.doc_lock(p_kind text, p_id uuid, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.doc_locks%rowtype; v_name text; v_role text := coalesce(public.my_role(), 'tech'); v_ask boolean := false;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if p_kind = 'job' and not public.can_view_job(p_id) then raise exception 'FORBIDDEN'; end if;
  select display_name into v_name from public.profiles where id = auth.uid();
  select * into l from public.doc_locks where kind = p_kind and doc_id = p_id for update;
  if found and l.user_id <> auth.uid() and l.at > now() - interval '2 minutes'
     and not (coalesce(p_force, false) and v_role in ('admin','manager')) then
    if coalesce(p_force, false) then            -- «запросить редактирование»: держателю — уведомление, не чаще раза в 2 минуты
      if not exists (select 1 from public.notices where user_id = l.user_id and kind = 'edit' and url = './?doc=' || p_kind || ':' || p_id::text
                        and title = 'Просят доступ к документу' and created_at > now() - interval '2 minutes') then
        perform public.push_enqueue(l.user_id, 'edit', 'Просят доступ к документу', coalesce(v_name, '') || ' ждёт, пока вы сохраните или закроете документ',
                                    './?doc=' || p_kind || ':' || p_id::text);
        v_ask := true;
      end if;
    end if;
    return jsonb_build_object('ok', false, 'by', l.user_id, 'name', l.user_name, 'since', l.since, 'at', l.at, 'asked', v_ask);
  end if;
  insert into public.doc_locks(kind, doc_id, user_id, user_name, since, at)
  values (p_kind, p_id, auth.uid(), coalesce(v_name, ''), now(), now())
  on conflict (kind, doc_id) do update
    set since = case when public.doc_locks.user_id = excluded.user_id then public.doc_locks.since else now() end,
        user_id = excluded.user_id, user_name = excluded.user_name, at = now();
  if random() < 0.02 then delete from public.doc_locks where at < now() - interval '1 day'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.doc_lock(text, uuid, boolean) from public, anon;
grant execute on function public.doc_lock(text, uuid, boolean) to authenticated;

create or replace function public.doc_unlock(p_kind text, p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.doc_locks where kind = p_kind and doc_id = p_id and user_id = auth.uid()
$$;
revoke all on function public.doc_unlock(text, uuid) from public, anon;
grant execute on function public.doc_unlock(text, uuid) to authenticated;


-- 9) «Важные объявления»: круг пишущих — админ, менеджеры, бухгалтер и те, кого выбрал админ ----------------
alter table public.profiles add column if not exists can_announce boolean not null default false;

create or replace function public.chat_can_announce()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.role in ('admin','manager','accountant') or p.can_announce) and not p.blocked
                     from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.chat_can_announce() from public, anon;
grant execute on function public.chat_can_announce() to authenticated;

create or replace function public.admin_set_announce(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), 'tech') <> 'admin' then raise exception 'FORBIDDEN'; end if;
  update public.profiles set can_announce = coalesce(p_on, false) where id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce((select display_name from public.profiles where id = auth.uid()), ''),
          'doc_rights', 'profile', p_user::text, jsonb_build_object('announce', coalesce(p_on, false)));
end $$;
revoke all on function public.admin_set_announce(uuid, boolean) from public, anon;
grant execute on function public.admin_set_announce(uuid, boolean) to authenticated;

create or replace function public.chat_send(
  p_to uuid, p_channel text, p_group uuid, p_body text, p_important boolean, p_doc_kind text, p_doc uuid, p_doc_title text,
  p_reply uuid, p_thumb text, p_img text, p_w int, p_h int)
returns public.chat_msgs language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_role text := coalesce(public.my_role(), '');
  v_body text := left(coalesce(trim(p_body), ''), 2000);
  v_imp boolean := coalesce(p_important, false) and public.chat_can_announce();   -- v1.09.25: «Важно» ставит тот же круг, что пишет в «Важные объявления»
  v_name text; v_row public.chat_msgs; v_title text; v_text text; v_ok boolean; r record; v_img uuid;
  v_has_img boolean := p_img is not null and p_thumb is not null; v_gname text;
begin
  if v_me is null then raise exception 'AUTH'; end if;
  if exists (select 1 from public.profiles where id = v_me and blocked) then raise exception 'BLOCKED'; end if;
  if num_nonnulls(p_to, p_channel, p_group) <> 1 then raise exception 'BAD_TARGET'; end if;
  if p_group is not null then
    if not public.chat_is_member(p_group) then raise exception 'FORBIDDEN'; end if;
    select name into v_gname from public.chat_groups where id = p_group;
  end if;
  if p_channel is not null and p_channel not in ('ann','all') then raise exception 'BAD_TARGET'; end if;
  if p_channel = 'ann' and not public.chat_can_announce() then raise exception 'FORBIDDEN'; end if;   -- v1.09.25: админ, менеджеры, бухгалтер + выбранные админом
  -- v1.09.24: защита от потока — не больше 30 сообщений в минуту от одного человека
  if (select count(*) from public.chat_msgs where from_user = v_me and created_at > now() - interval '1 minute') >= 30 then raise exception 'RATE_LIMIT'; end if;
  if p_to is not null and (p_to = v_me or not exists (select 1 from public.profiles where id = p_to and not blocked)) then raise exception 'NOT_FOUND'; end if;
  if p_doc is not null then
    if coalesce(p_doc_kind, '') not in ('job','prop','rep') then raise exception 'BAD_DOC'; end if;
    if p_doc_kind = 'job' then v_ok := public.can_view_job(p_doc);
    elsif p_doc_kind = 'rep' then v_ok := public.can_view_repair(p_doc);
    else v_ok := exists (select 1 from public.proposals where id = p_doc);
    end if;
    if not coalesce(v_ok, false) then raise exception 'NO_ACCESS'; end if;
  end if;
  if v_has_img then
    if left(p_img, 23) <> 'data:image/jpeg;base64,' or left(p_thumb, 23) <> 'data:image/jpeg;base64,' then raise exception 'BAD_IMAGE'; end if;
    if length(p_img) > 1500000 or length(p_thumb) > 60000 then raise exception 'TOO_BIG'; end if;
  end if;
  if v_body = '' and p_doc is null and not v_has_img then raise exception 'EMPTY'; end if;
  -- отвечать можно только на сообщение, которое сам видишь
  if p_reply is not null and not public.chat_msg_visible(p_reply) then p_reply := null; end if;

  if v_has_img then v_img := gen_random_uuid(); end if;
  insert into public.chat_msgs (from_user, to_user, channel, group_id, body, important, doc_kind, doc_id, doc_title, reply_to, img_thumb, img_id, img_w, img_h)
  values (v_me, p_to, p_channel, p_group, v_body, v_imp, case when p_doc is null then null else p_doc_kind end, p_doc,
          case when p_doc is null then '' else left(coalesce(trim(p_doc_title), ''), 160) end, p_reply,
          case when v_has_img then p_thumb end, v_img, case when v_has_img then p_w end, case when v_has_img then p_h end)
  returning * into v_row;
  if v_has_img then insert into public.chat_files (id, msg_id, data, bytes) values (v_img, v_row.id, p_img, (length(p_img) * 3) / 4); end if;

  select display_name into v_name from public.profiles where id = v_me;
  /* v1.09.23 (ревью): заголовок уведомления — ПЕРЕПИСКА (человек, группа, канал), а автор идёт в строку. Иначе стопка группы
     называлась именем последнего написавшего: «Бригада · Олег (3)», хотя из трёх сообщений его было одно. */
  v_title := case when v_imp then '❗ ' else '' end
          || case when p_channel = 'ann' then 'Важные объявления' when p_channel = 'all' then 'Общий чат'
                  when p_group is not null then coalesce(v_gname, 'Группа') else coalesce(v_name, 'TechLog') end;
  v_text := case when p_to is null then split_part(coalesce(v_name, ''), ' ', 1) || ': ' else '' end
         || case when v_body <> '' then left(v_body, 160) else '' end
         || case when v_has_img then case when v_body <> '' then ' · ' else '' end || '📷 Фото' else '' end
         || case when p_doc is not null then case when v_body <> '' or v_has_img then ' · ' else '' end || '📄 ' || left(coalesce(p_doc_title, 'документ'), 100) else '' end;
  /* v1.09.24: «не беспокоить» — переписка в списке profiles.push_prefs.chat_mute получателя пуш не шлёт.
     Сообщение с пометкой «Важно» проходит всегда: ради этого пометка и существует. */
  if p_to is not null then
    if v_imp or not public.chat_muted(p_to, v_me::text) then
      perform public.push_enqueue(p_to, 'chat', v_title, v_text, './?chat=' || v_me::text);
    end if;
  elsif p_group is not null then
    for r in select gm.user_id as id from public.chat_members gm join public.profiles pf on pf.id = gm.user_id
              where gm.group_id = p_group and gm.user_id <> v_me and not pf.blocked limit 300 loop
      if v_imp or not public.chat_muted(r.id, 'g:' || p_group::text) then
        perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=g:' || p_group::text);
      end if;
    end loop;
  else
    for r in select id from public.profiles where not blocked and id <> v_me limit 300 loop
      if p_channel = 'ann' then        -- v1.09.25: пуш «Важных объявлений» не отключается — ни «не беспокоить», ни галочкой вида
        insert into public.push_queue(user_id, kind, title, body, url) values (r.id, 'chat', v_title, v_text, './?chat=ann');
      elsif v_imp or not public.chat_muted(r.id, p_channel) then
        perform public.push_enqueue(r.id, 'chat', v_title, v_text, './?chat=' || p_channel);
      end if;
    end loop;
  end if;
  if random() < 0.03 then perform public.chat_cleanup(); end if;      -- уборка «между делом»: отдельное расписание не нужно
  return v_row;
end $$;

-- 10) Заморозка номеров уже существующих документов — пачкой, один раз, от имени админа ----------------------
create or replace function public.job_fix_no_bulk(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_txt text;
begin
  if coalesce(public.my_role(), 'tech') <> 'admin' then raise exception 'FORBIDDEN'; end if;
  perform set_config('techlog.sysupd', '1', true);
  for r in select (x->>'id')::uuid as id, x->>'t' as t from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x limit 1000
  loop
    v_txt := left(regexp_replace(coalesce(r.t, ''), '[^A-Za-z0-9._-]', '', 'g'), 80);
    if v_txt <> '' then
      update public.jobs set doc_no = v_txt where id = r.id and doc_no is null and no is not null and status <> 'draft';
      if found then n := n + 1; end if;
    end if;
  end loop;
  perform set_config('techlog.sysupd', '', true);
  return n;
end $$;
revoke all on function public.job_fix_no_bulk(jsonb) from public, anon;
grant execute on function public.job_fix_no_bulk(jsonb) to authenticated;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='tag') then miss := miss || ' profiles.tag'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='rev') then miss := miss || ' jobs.rev'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='doc_no') then miss := miss || ' jobs.doc_no'; end if;
  if to_regclass('public.jobs_doc_no_seq') is null then miss := miss || ' jobs_doc_no_seq'; end if;
  if to_regclass('public.notices') is null then miss := miss || ' notices'; end if;
  if to_regclass('public.doc_requests') is null then miss := miss || ' doc_requests'; end if;
  if to_regclass('public.doc_locks') is null then miss := miss || ' doc_locks'; end if;
  if to_regprocedure('public.can_approve_docs()') is null then miss := miss || ' can_approve_docs()'; end if;
  if to_regprocedure('public.doc_lock(text,uuid,boolean)') is null then miss := miss || ' doc_lock()'; end if;
  if to_regprocedure('public.chat_can_announce()') is null then miss := miss || ' chat_can_announce()'; end if;
  if to_regprocedure('public.job_fix_no_bulk(jsonb)') is null then miss := miss || ' job_fix_no_bulk()'; end if;
  if position('chat_can_announce' in pg_get_functiondef('public.chat_send(uuid,text,uuid,text,boolean,text,uuid,text,uuid,text,text,int,int)'::regprocedure)) = 0 then miss := miss || ' chat_send(круг объявлений)'; end if;
  if to_regprocedure('public.doc_request_decide(uuid,boolean,text)') is null then miss := miss || ' doc_request_decide()'; end if;
  if position('STALE_DOC' in pg_get_functiondef('public.jobs_guard()'::regprocedure)) = 0 then miss := miss || ' jobs_guard(ревизия)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.25 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.25 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_26 (документооборот: разбор и решения) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.26 · ДОКУМЕНТООБОРОТ — ИСПРАВЛЕНИЯ ПО РАЗБОРУ
--   · на согласование уходит только полностью переведённый документ (TRANSLATION_REQUIRED);
--   · заметка пикапа — своя (placements.note), в инвойс не пишется;
--   · техника, убранная из инвойса, не удаляется, а уходит в архив с пояснением (placements.archived_at / arch_note);
--     складской регистр при этом возвращает её так же, как при удалении;
--   · менеджер технику в чужом документе не правит (FORBIDDEN_EQUIPMENT);
--   · привязка пропозала — не содержимое; к запертому инвойсу менеджер привязывает только с разрешения админа (LINK_LOCKED);
--   · апрув собственного инвойса менеджером — только если админ разрешил (SELF_APPROVE_OFF);
--   · основной удаляет только документ, у которого ещё нет номера (иначе обход: отозвал → удалил);
--   · ревизия различает устройства одного человека (updated_dev);
--   · отозвать может тот, кто правит черновик (в том числе помощник с правом); запрос правки — он же;
--   · запрос правки закрывается сам, если документ ушёл из «Апрув» другим путём или удалён;
--   · бухгалтеру — уведомление, если на правку возвращён документ с её отметкой;
--   · мелочи: текст замороженного номера обязан содержать выданный номер; «занято» — только для известных видов.
-- =====================================================================

alter table public.placements add column if not exists archived_at timestamptz;
alter table public.placements add column if not exists archived_by uuid;
alter table public.placements add column if not exists arch_note   text;
alter table public.placements add column if not exists note        text not null default '';
alter table public.placements add column if not exists note_en     text not null default '';
alter table public.jobs       add column if not exists arch_note   text;
alter table public.jobs       add column if not exists updated_dev text;
alter table public.repairs    add column if not exists arch_note   text;
alter table public.proposals  add column if not exists arch_note   text;
alter table public.org_settings add column if not exists self_approve      boolean not null default false;
alter table public.org_settings add column if not exists mgr_link_locked   boolean not null default false;
alter table public.org_settings add column if not exists pdf_approved_mark boolean not null default true;
alter table public.org_settings add column if not exists pdf_draft_mark    boolean not null default true;

alter table public.doc_requests drop constraint if exists doc_requests_status_check;
alter table public.doc_requests add constraint doc_requests_status_check check (status in ('pending','granted','denied','closed'));

-- сколько полей документа без перевода (то же правило, что в приложении: есть кириллица, а английского текста нет)
create or replace function public.job_tr_missing(p_note text, p_note_en text, p_fd jsonb)
returns int language sql immutable as $$
  select (case when coalesce(p_note, '') ~ '[А-Яа-яЁё]' and btrim(coalesce(p_note_en, '')) = '' then 1 else 0 end)
       + (select count(*)::int
            from jsonb_array_elements(case when jsonb_typeof(p_fd->'others') = 'array' then p_fd->'others' else '[]'::jsonb end) o
           where coalesce(o->>'desc', '') ~ '[А-Яа-яЁё]' and btrim(coalesce(o->>'desc_en', '')) = '')
       + (case when coalesce(p_fd->'airduct'->>'note', '') ~ '[А-Яа-яЁё]' and btrim(coalesce(p_fd->'airduct'->>'note_en', '')) = '' then 1 else 0 end)
$$;

-- техника документа в сравнимом виде: только позиции с количеством больше нуля
create or replace function public.job_equip_norm(p_fd jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, jsonb_build_object('q', e.value->>'qty', 'd', e.value->>'days')), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p_fd->'equipment') = 'object' then p_fd->'equipment' else '{}'::jsonb end) e
   where (e.value->>'qty') ~ '^[0-9]+(\.[0-9]+)?$' and (e.value->>'qty')::numeric > 0
$$;

create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := coalesce(public.my_role(), 'tech');
  v_appr boolean := public.can_approve_docs();
  v_sys  boolean := auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1'
                    or coalesce(current_setting('techlog.sysupd', true), '') = '1';
  v_content boolean; v_no bigint; v_self boolean; v_link boolean;
begin
  new.updated_at := now();
  if v_sys then return new; end if;
  select coalesce(self_approve, false), coalesce(mgr_link_locked, false) into v_self, v_link from public.org_settings where id = 'org';

  -- поля, которыми клиент не распоряжается
  new.no := old.no; new.numbered_at := old.numbered_at; new.approved_crew := old.approved_crew;
  if v_role = 'admin' then new.doc_no := coalesce(new.doc_no, old.doc_no); else new.doc_no := old.doc_no; end if;
  if not v_appr then
    new.edit_open_until := old.edit_open_until;
    new.approved_total := old.approved_total; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    if not (new.status = 'draft' and old.status = 'done') then
      new.return_note := old.return_note; new.returned_by := old.returned_by;
    end if;
  end if;

  -- привязка пропозала — связь документов, а не содержимое инвойса
  if new.proposal_id is distinct from old.proposal_id and old.status <> 'draft'
     and not (v_role = 'admin' or v_appr or (v_role = 'manager' and coalesce(v_link, false))) then
    raise exception 'LINK_LOCKED';
  end if;

  v_content := new.form_data is distinct from old.form_data
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')
       or coalesce(new.note_en, '') is distinct from coalesce(old.note_en, '')
       or new.date is distinct from old.date
       or coalesce(new.unit_number, '') is distinct from coalesce(old.unit_number, '')
       or new.complex_id is distinct from old.complex_id
       or new.counterparty_id is distinct from old.counterparty_id
       or new.work_type_id is distinct from old.work_type_id
       or new.technician_id is distinct from old.technician_id
       or new.helper_ids is distinct from old.helper_ids
       or new.shared_with_helpers is distinct from old.shared_with_helpers
       or new.total is distinct from old.total;

  -- смена основного исполнителя: админ всегда, менеджер — пока черновик
  if new.technician_id is distinct from old.technician_id
     and not (v_role = 'admin' or (v_role = 'manager' and old.status = 'draft')) then
    raise exception 'FORBIDDEN_FIELD';
  end if;
  -- состав бригады и «Общий доступ» помощник не меняет
  if (new.helper_ids is distinct from old.helper_ids or new.shared_with_helpers is distinct from old.shared_with_helpers)
     and not (v_role in ('admin','manager') or old.technician_id = v_uid) then
    raise exception 'FORBIDDEN_CREW';
  end if;
  -- техника — это пикапы и склад исполнителя: менеджер в чужом документе её только видит
  if v_role = 'manager' and old.technician_id is distinct from v_uid
     and public.job_equip_norm(new.form_data) is distinct from public.job_equip_norm(old.form_data) then
    raise exception 'FORBIDDEN_EQUIPMENT';
  end if;
  -- в архив: основной — только документ, который ещё ни разу не отправляли на согласование (иначе обход: отозвал → удалил), дальше — админ.
  -- Признак — numbered_at, а не no: у черновиков, созданных до 1.09.25, номер есть с рождения, и удалять их по-прежнему можно.
  if new.archived_at is distinct from old.archived_at and v_role <> 'admin'
     and (old.numbered_at is not null or old.status <> 'draft') then
    raise exception 'DOC_LOCKED_DELETE';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if not v_appr then raise exception 'FORBIDDEN_APPROVE'; end if;
    if v_role <> 'admin' and old.technician_id = v_uid and not coalesce(v_self, false) then
      raise exception 'SELF_APPROVE_OFF';
    end if;
  end if;

  if not v_appr then
    if old.status = 'approved' and (v_content or new.status <> 'approved') then
      raise exception 'DOC_LOCKED_APPROVED';
    end if;
    if old.status = 'done' then
      if new.status = 'draft' then        -- «отозвать»: тот, кто правит черновик; правки в том же сохранении допустимы
        if not (old.technician_id = v_uid or v_role = 'manager' or public.is_shared_job_helper(old.id)) then raise exception 'DOC_LOCKED_DONE'; end if;
      elsif v_content then
        raise exception 'DOC_LOCKED_DONE';
      end if;
    end if;
  end if;

  -- на согласование — только с переводом
  if old.status = 'draft' and new.status <> 'draft'
     and public.job_tr_missing(new.note, new.note_en, new.form_data) > 0 then
    raise exception 'TRANSLATION_REQUIRED';
  end if;

  -- ревизия: чужую правку (или свою же с ДРУГОГО устройства), которую автор этой записи не видел, молча не затираем
  if v_content or new.status is distinct from old.status then
    if new.rev is distinct from old.rev
       and (old.updated_by is distinct from v_uid or coalesce(old.updated_dev, '') is distinct from coalesce(new.updated_dev, '')) then
      raise exception 'STALE_DOC';
    end if;
    new.rev := old.rev + 1;
    new.updated_by := v_uid;
  else
    new.rev := old.rev; new.updated_by := old.updated_by; new.updated_dev := old.updated_dev;
  end if;

  -- переходы статуса
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := coalesce(new.approved_by, v_uid);
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_crew := jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb));
    new.edit_open_until := null; new.return_note := null; new.returned_by := null;
  elsif old.status = 'approved' and new.status <> 'approved' then
    new.approved_total := null; new.approved_by := null; new.approved_at := null; new.approved_crew := null;
  end if;
  if new.status = 'done' and old.status = 'draft' then
    new.return_note := null; new.returned_by := null;
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    if old.technician_id is distinct from v_uid and coalesce(new.return_note, '') <> '' then new.returned_by := v_uid;
    elsif old.technician_id = v_uid then new.return_note := null; new.returned_by := null; end if;
  end if;

  -- номер — при первом НЕ черновике
  if new.status <> 'draft' then
    if new.no is null then
      loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop;
      new.no := v_no;
    end if;
    if new.numbered_at is null then new.numbered_at := now(); end if;   -- «номер выдан»: документ отправляли на согласование
  end if;
  return new;
end $$;

-- новая строка сразу НЕ черновиком: те же правила (перевод, апрув)
create or replace function public.jobs_after_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  if auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  if new.status = 'approved' and not public.can_approve_docs() then raise exception 'FORBIDDEN_APPROVE'; end if;
  if new.status <> 'draft' then
    if public.job_tr_missing(new.note, new.note_en, new.form_data) > 0 then raise exception 'TRANSLATION_REQUIRED'; end if;
    loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop;
  end if;
  perform set_config('techlog.sysupd', '1', true);
  update public.jobs set no = v_no, numbered_at = case when v_no is null then null else now() end, doc_no = null,
         rev = 0, updated_by = auth.uid(), edit_open_until = null, approved_crew = case when new.status = 'approved'
           then jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb)) else null end
   where id = new.id;
  perform set_config('techlog.sysupd', '', true);
  return new;
end $$;

-- события инвойса: отзыв и возврат различаются по тому, КТО вернул документ в черновик
create or replace function public.jobs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text; v_url text; v_who text; r record; v_done boolean := false;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
  v_url  := './?doc=job:' || new.id::text;
  if tg_op = 'INSERT' then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Новая задача', v_body, v_url);
    end if;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    return new;
  end if;
  select display_name into v_who from public.profiles where id = auth.uid();

  -- основной исполнитель сменился
  if new.technician_id is distinct from old.technician_id then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Задача передана вам', v_body, v_url);
    end if;
    if old.technician_id is not null and not (coalesce(new.helper_ids, '[]'::jsonb) ? old.technician_id::text) then
      perform public.push_enqueue(old.technician_id, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
    end if;
    v_done := true;
  end if;
  -- состав бригады
  if new.helper_ids is distinct from old.helper_ids then
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
              where not (coalesce(old.helper_ids, '[]'::jsonb) ? value) and value::uuid is distinct from old.technician_id
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(old.helper_ids, '[]'::jsonb))
              where not (coalesce(new.helper_ids, '[]'::jsonb) ? value)
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
      end if;
    end loop;
    v_done := true;
  end if;

  -- статусы
  if old.status is distinct from 'approved' and new.status = 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Инвойс апрувлен',
        v_body || ' · $' || round(coalesce(new.approved_total, new.total, 0)), v_url);
    end loop;
    return new;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'reset',
        case when new.status = 'draft' then 'Апрув снят — документ в черновике' else 'Апрув снят с инвойса' end,
        v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
    end loop;
    return new;
  elsif old.status = 'done' and new.status = 'draft' then
    /* v1.09.26: вернуть на доработку может только согласующий; все остальные (основной, менеджер без права апрува,
       помощник с правом правки) документ ОТЗЫВАЮТ — об этом узнают согласующие и остальная бригада */
    if public.can_approve_docs() and auth.uid() is distinct from new.technician_id then
      for r in select distinct x.uid from (select new.technician_id as uid
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Возвращён на доработку',
          v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
      end loop;
    else
      for r in select distinct x.uid from (
                 select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
                 union select new.technician_id
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Документ отозван из согласования', v_body || ' · ' || coalesce(v_who, ''), v_url);
      end loop;
    end if;
    return new;
  elsif old.status = 'draft' and new.status = 'done' then
    for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Ждёт апрува', v_body || ' · ' || coalesce(v_who, ''), v_url);
    end loop;
    return new;
  end if;
  if v_done then return new; end if;

  /* «Документ изменён»: содержимое поменял НЕ исполнитель (push_enqueue сам пропускает автора правки). Приложение шлёт
     строку целиком при любом сохранении — сравниваем только значимые поля; не чаще раза в 10 минут на документ и человека. */
  if auth.uid() is not null and (new.form_data is distinct from old.form_data or new.date is distinct from old.date
       or new.unit_number is distinct from old.unit_number or new.complex_id is distinct from old.complex_id
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')) then
    for r in select distinct x.uid from (
               select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x
              where x.uid is not null and x.uid <> auth.uid()
    loop
      if not exists (select 1 from public.notices where user_id = r.uid and kind = 'edit' and url = v_url and created_at > now() - interval '10 minutes') then
        perform public.push_enqueue(r.uid, 'edit',
          case when new.date is distinct from old.date then 'Задача перенесена на ' || to_char(new.date, 'DD.MM') else 'Документ изменён' end,
          v_body || ' · ' || coalesce(v_who, ''), v_url);
      end if;
    end loop;
  end if;
  return new;
end $$;

-- строку основной удаляет, только пока у документа нет номера
drop policy if exists jobs_del on public.jobs;
create policy jobs_del on public.jobs for delete to authenticated
  using ((technician_id = auth.uid() and status = 'draft' and numbered_at is null) or public.my_role() = 'admin');

-- запрос правки закрывается сам, если документ ушёл из «Апрув» другим путём или удалён
create or replace function public.jobs_req_close_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.status = 'approved' and new.status <> 'approved') or (old.archived_at is null and new.archived_at is not null) then
    update public.doc_requests set status = 'closed', decided_at = now(),
           answer = case when new.archived_at is not null and old.archived_at is null then 'документ удалён' else 'документ уже возвращён в работу' end
     where kind = 'job' and doc_id = new.id and status = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists jobs_req_close_tg on public.jobs;
create trigger jobs_req_close_tg after update on public.jobs
  for each row execute function public.jobs_req_close_tg_fn();

-- запрос правки подаёт тот, кто потом сможет править черновик: основной или помощник с правом и «Общим доступом»
create or replace function public.doc_request_edit(p_job uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype; v_id uuid; v_who text; r record; v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (j.technician_id = auth.uid() or public.is_shared_job_helper(p_job)) then raise exception 'FORBIDDEN'; end if;
  if j.status <> 'approved' then raise exception 'BAD_STATUS'; end if;
  if length(v_reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if exists (select 1 from public.doc_requests where kind = 'job' and doc_id = p_job and status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;
  insert into public.doc_requests(kind, doc_id, user_id, reason) values ('job', p_job, auth.uid(), v_reason) returning id into v_id;
  select display_name into v_who from public.profiles where id = auth.uid();
  for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
  loop
    perform public.push_enqueue(r.uid, 'approve', 'Запрос на правку документа',
      'Unit ' || coalesce(nullif(j.unit_number,''),'—') || ' · ' || to_char(j.date, 'DD.MM') || ' · ' || coalesce(v_who, '') || ' · ' || v_reason,
      './?doc=job:' || p_job::text);
  end loop;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_who, ''), 'edit_request', 'job', p_job::text, jsonb_build_object('unit', j.unit_number, 'reason', v_reason));
  return v_id;
end $$;

-- решение по запросу: при разрешении документа с отметкой бухгалтерии она узнаёт об этом
create or replace function public.doc_request_decide(p_id uuid, p_grant boolean, p_answer text)
returns void language plpgsql security definer set search_path = public as $$
declare q public.doc_requests%rowtype; j public.jobs%rowtype; v_who text; v_ans text := left(trim(coalesce(p_answer, '')), 500); r record; v_body text;
begin
  if not public.can_approve_docs() then raise exception 'FORBIDDEN'; end if;
  select * into q from public.doc_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if q.status <> 'pending' then raise exception 'ALREADY_DECIDED'; end if;
  select * into j from public.jobs where id = q.doc_id;
  update public.doc_requests set status = case when p_grant then 'granted' else 'denied' end,
         answer = v_ans, decided_by = auth.uid(), decided_at = now() where id = p_id;
  select display_name into v_who from public.profiles where id = auth.uid();
  v_body := 'Unit ' || coalesce(nullif(j.unit_number,''),'—') || ' · ' || to_char(j.date, 'DD.MM') || ' · ' || coalesce(v_who, '');
  if p_grant and j.id is not null then
    update public.jobs set status = 'draft', edit_open_until = now() + interval '24 hours',
           return_note = nullif('Правка разрешена' || coalesce(': ' || nullif(v_ans, ''), ''), '') where id = q.doc_id;
    if coalesce(j.acc_status, '') <> '' then
      for r in select id as uid from public.profiles where not blocked and role = 'accountant'
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Инвойс с отметкой бухгалтерии возвращён на правку',
          v_body || ' · отметка: ' || j.acc_status, './');
      end loop;
    end if;
  end if;
  if not p_grant then perform public.push_enqueue(q.user_id, 'reset', 'В правке отказано',
    v_body || coalesce(' · ' || nullif(v_ans, ''), ''), './?doc=job:' || q.doc_id::text); end if;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_who, ''), case when p_grant then 'edit_request_granted' else 'edit_request_denied' end,
          'job', q.doc_id::text, jsonb_build_object('unit', j.unit_number, 'answer', v_ans, 'acc', coalesce(j.acc_status, '')));
end $$;

-- замороженный текст номера обязан содержать сам выданный номер
create or replace function public.job_fix_no(p_job uuid, p_text text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_no bigint; v_txt text := left(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9._-]', '', 'g'), 80);
begin
  if not public.can_view_job(p_job) then raise exception 'FORBIDDEN'; end if;
  select doc_no, no into v_cur, v_no from public.jobs where id = p_job and no is not null and status <> 'draft';
  if not found then return null; end if;
  if v_cur is not null then return v_cur; end if;
  if v_txt = '' then return null; end if;
  if position(v_no::text in v_txt) = 0 then raise exception 'BAD_NUMBER_TEXT'; end if;
  perform set_config('techlog.sysupd', '1', true);
  update public.jobs set doc_no = v_txt where id = p_job and doc_no is null;
  perform set_config('techlog.sysupd', '', true);
  return v_txt;
end $$;

-- «занято»: только для известных видов документов
create or replace function public.doc_lock(p_kind text, p_id uuid, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.doc_locks%rowtype; v_name text; v_role text := coalesce(public.my_role(), 'tech'); v_ask boolean := false;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if p_kind is distinct from 'job' then raise exception 'BAD_KIND'; end if;
  if not public.can_view_job(p_id) then raise exception 'FORBIDDEN'; end if;
  select display_name into v_name from public.profiles where id = auth.uid();
  select * into l from public.doc_locks where kind = p_kind and doc_id = p_id for update;
  if found and l.user_id <> auth.uid() and l.at > now() - interval '2 minutes'
     and not (coalesce(p_force, false) and v_role in ('admin','manager')) then
    if coalesce(p_force, false) then
      if not exists (select 1 from public.notices where user_id = l.user_id and kind = 'edit' and url = './?doc=' || p_kind || ':' || p_id::text
                        and title = 'Просят доступ к документу' and created_at > now() - interval '2 minutes') then
        perform public.push_enqueue(l.user_id, 'edit', 'Просят доступ к документу', coalesce(v_name, '') || ' ждёт, пока вы сохраните или закроете документ',
                                    './?doc=' || p_kind || ':' || p_id::text);
        v_ask := true;
      end if;
    end if;
    return jsonb_build_object('ok', false, 'by', l.user_id, 'name', l.user_name, 'since', l.since, 'at', l.at, 'asked', v_ask);
  end if;
  insert into public.doc_locks(kind, doc_id, user_id, user_name, since, at)
  values (p_kind, p_id, auth.uid(), coalesce(v_name, ''), now(), now())
  on conflict (kind, doc_id) do update
    set since = case when public.doc_locks.user_id = excluded.user_id then public.doc_locks.since else now() end,
        user_id = excluded.user_id, user_name = excluded.user_name, at = now();
  if random() < 0.02 then delete from public.doc_locks where at < now() - interval '1 day'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- складской регистр: техника, ушедшая в архив (убрана из инвойса), возвращается так же, как при удалении строки
create or replace function public.equip_pl_arch_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if old.archived_at is null and new.archived_at is not null and not coalesce(new.picked_up, false) then
    delete from public.equip_moves where placement_id = new.id;
  elsif old.archived_at is not null and new.archived_at is null and not coalesce(new.picked_up, false) and new.ext_of is null then
    perform public.equip_place(new.equipment_type_id, greatest(1, coalesce(new.qty, 1)), new.technician_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists equip_pl_arch_tg on public.placements;
create trigger equip_pl_arch_tg after update of archived_at on public.placements
  for each row execute function public.equip_pl_arch_tg_fn();

update public.org_settings set docflow_v = 2 where id = 'org' and docflow_v < 2;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='placements' and column_name='arch_note') then miss := miss || ' placements.arch_note'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='placements' and column_name='note') then miss := miss || ' placements.note'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='updated_dev') then miss := miss || ' jobs.updated_dev'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='self_approve') then miss := miss || ' org_settings.self_approve'; end if;
  if to_regprocedure('public.job_tr_missing(text,text,jsonb)') is null then miss := miss || ' job_tr_missing()'; end if;
  if position('TRANSLATION_REQUIRED' in pg_get_functiondef('public.jobs_guard()'::regprocedure)) = 0 then miss := miss || ' jobs_guard(перевод)'; end if;
  if position('FORBIDDEN_EQUIPMENT' in pg_get_functiondef('public.jobs_guard()'::regprocedure)) = 0 then miss := miss || ' jobs_guard(техника)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'equip_pl_arch_tg') then miss := miss || ' equip_pl_arch_tg'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'jobs_req_close_tg') then miss := miss || ' jobs_req_close_tg'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.26 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.26 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_27 (тест документооборота) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.27 · РЕЖИМ ТЕСТИРОВАНИЯ ДОКУМЕНТООБОРОТА
--   Встроенный тест полного цикла идёт под настоящим пользователем (админ, менеджер, работник). Шаги «другой стороны»
--   (назначить задачу работнику, апрувить, вернуть, решить запрос правки, убрать тестовые документы) выполняет
--   Edge Function dft — от имени администратора или менеджера. Чтобы это не стало дырой:
--   · режим включает ТОЛЬКО админ, на ограниченное время (dft_until), каждое включение — в журнале событий;
--   · функция работает ТОЛЬКО с документами, помеченными is_test; пометку ставит только она сама (клиент её не ставит и
--     не меняет: сторож возвращает прежнее значение, обычная вставка «тестовой» быть не может) — настоящий инвойс
--     через функцию не апрувить;
--   · dft_exec доступна только service_role (её зовёт Edge Function), внутри подменяется личность исполнителя
--     (request.jwt.claim.sub) — все правила сторожей срабатывают так же, как для настоящего админа или менеджера;
--   · тестовые документы не тратят настоящую нумерацию (свой диапазон 90000001…), не двигают склад, не шлют пушей;
--     их события попадают только в ленту того, кто ведёт тест; уборка удаляет всё тестовое насовсем.
--   Выключили режим или удалили функцию — приложение работает как раньше.
-- =====================================================================

alter table public.jobs       add column if not exists is_test    boolean not null default false;
alter table public.jobs       add column if not exists test_owner uuid;
alter table public.jobs       add column if not exists test_run   text;
alter table public.placements add column if not exists is_test    boolean not null default false;
alter table public.proposals  add column if not exists is_test    boolean not null default false;
alter table public.proposals  add column if not exists test_owner uuid;
alter table public.proposals  add column if not exists test_run   text;
create index if not exists jobs_is_test_idx on public.jobs(is_test) where is_test;
alter table public.org_settings add column if not exists dft_on    boolean not null default false;
alter table public.org_settings add column if not exists dft_until timestamptz;
alter table public.org_settings add column if not exists dft_by    uuid;
do $$ begin
  if to_regclass('public.jobs_test_no_seq') is null then create sequence public.jobs_test_no_seq; end if;
end $$;

create or replace function public.dft_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select dft_on and (dft_until is null or dft_until > now()) from public.org_settings where id = 'org'), false)
$$;
revoke all on function public.dft_enabled() from public, anon;
grant execute on function public.dft_enabled() to authenticated, service_role;

-- включает и выключает только админ; всегда на срок (1–72 часа), запись в журнале событий
create or replace function public.admin_set_dft(p_on boolean, p_hours int default 4)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_until timestamptz := case when coalesce(p_on, false) then now() + make_interval(hours => greatest(1, least(72, coalesce(p_hours, 4)))) end;
begin
  if coalesce(public.my_role(), 'tech') <> 'admin' then raise exception 'FORBIDDEN'; end if;
  perform set_config('techlog.sysupd', '1', true);
  update public.org_settings set dft_on = coalesce(p_on, false), dft_until = v_until, dft_by = case when coalesce(p_on, false) then auth.uid() end where id = 'org';
  perform set_config('techlog.sysupd', '', true);
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce((select display_name from public.profiles where id = auth.uid()), ''),
          case when coalesce(p_on, false) then 'dft_on' else 'dft_off' end, 'org', 'org', jsonb_build_object('until', v_until));
  return v_until;
end $$;
revoke all on function public.admin_set_dft(boolean, int) from public, anon;
grant execute on function public.admin_set_dft(boolean, int) to authenticated;

-- тестовый пикап наследует пометку от своего документа (клиент её не задаёт)
create or replace function public.placements_test_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.is_test := coalesce((select j.is_test from public.jobs j where j.id = new.job_id), false);
  else new.is_test := old.is_test; end if;
  return new;
end $$;
drop trigger if exists placements_test_flag_tg on public.placements;
create trigger placements_test_flag_tg before insert or update on public.placements
  for each row execute function public.placements_test_flag();

create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := coalesce(public.my_role(), 'tech');
  v_appr boolean := public.can_approve_docs();
  v_sys  boolean := auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1'
                    or coalesce(current_setting('techlog.sysupd', true), '') = '1';
  v_content boolean; v_no bigint; v_self boolean; v_link boolean;
begin
  new.updated_at := now();
  if v_sys then return new; end if;
  select coalesce(self_approve, false), coalesce(mgr_link_locked, false) into v_self, v_link from public.org_settings where id = 'org';

  -- поля, которыми клиент не распоряжается
  new.no := old.no; new.numbered_at := old.numbered_at; new.approved_crew := old.approved_crew;
  new.is_test := old.is_test; new.test_owner := old.test_owner; new.test_run := old.test_run;   -- v1.09.27: пометку «тестовый» ставит только функция тестирования
  if v_role = 'admin' then new.doc_no := coalesce(new.doc_no, old.doc_no); else new.doc_no := old.doc_no; end if;
  if not v_appr then
    new.edit_open_until := old.edit_open_until;
    new.approved_total := old.approved_total; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    if not (new.status = 'draft' and old.status = 'done') then
      new.return_note := old.return_note; new.returned_by := old.returned_by;
    end if;
  end if;

  -- привязка пропозала — связь документов, а не содержимое инвойса
  if new.proposal_id is distinct from old.proposal_id and old.status <> 'draft'
     and not (v_role = 'admin' or v_appr or (v_role = 'manager' and coalesce(v_link, false))) then
    raise exception 'LINK_LOCKED';
  end if;

  v_content := new.form_data is distinct from old.form_data
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')
       or coalesce(new.note_en, '') is distinct from coalesce(old.note_en, '')
       or new.date is distinct from old.date
       or coalesce(new.unit_number, '') is distinct from coalesce(old.unit_number, '')
       or new.complex_id is distinct from old.complex_id
       or new.counterparty_id is distinct from old.counterparty_id
       or new.work_type_id is distinct from old.work_type_id
       or new.technician_id is distinct from old.technician_id
       or new.helper_ids is distinct from old.helper_ids
       or new.shared_with_helpers is distinct from old.shared_with_helpers
       or new.total is distinct from old.total;

  -- смена основного исполнителя: админ всегда, менеджер — пока черновик
  if new.technician_id is distinct from old.technician_id
     and not (v_role = 'admin' or (v_role = 'manager' and old.status = 'draft')) then
    raise exception 'FORBIDDEN_FIELD';
  end if;
  -- состав бригады и «Общий доступ» помощник не меняет
  if (new.helper_ids is distinct from old.helper_ids or new.shared_with_helpers is distinct from old.shared_with_helpers)
     and not (v_role in ('admin','manager') or old.technician_id = v_uid) then
    raise exception 'FORBIDDEN_CREW';
  end if;
  -- техника — это пикапы и склад исполнителя: менеджер в чужом документе её только видит
  if v_role = 'manager' and old.technician_id is distinct from v_uid
     and public.job_equip_norm(new.form_data) is distinct from public.job_equip_norm(old.form_data) then
    raise exception 'FORBIDDEN_EQUIPMENT';
  end if;
  -- в архив: основной — только документ, который ещё ни разу не отправляли на согласование (иначе обход: отозвал → удалил), дальше — админ.
  -- Признак — numbered_at, а не no: у черновиков, созданных до 1.09.25, номер есть с рождения, и удалять их по-прежнему можно.
  if new.archived_at is distinct from old.archived_at and v_role <> 'admin'
     and (old.numbered_at is not null or old.status <> 'draft') then
    raise exception 'DOC_LOCKED_DELETE';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if not v_appr then raise exception 'FORBIDDEN_APPROVE'; end if;
    if v_role <> 'admin' and old.technician_id = v_uid and not coalesce(v_self, false) then
      raise exception 'SELF_APPROVE_OFF';
    end if;
  end if;

  if not v_appr then
    if old.status = 'approved' and (v_content or new.status <> 'approved') then
      raise exception 'DOC_LOCKED_APPROVED';
    end if;
    if old.status = 'done' then
      if new.status = 'draft' then        -- «отозвать»: тот, кто правит черновик; правки в том же сохранении допустимы
        if not (old.technician_id = v_uid or v_role = 'manager' or public.is_shared_job_helper(old.id)) then raise exception 'DOC_LOCKED_DONE'; end if;
      elsif v_content then
        raise exception 'DOC_LOCKED_DONE';
      end if;
    end if;
  end if;

  -- на согласование — только с переводом
  if old.status = 'draft' and new.status <> 'draft'
     and public.job_tr_missing(new.note, new.note_en, new.form_data) > 0 then
    raise exception 'TRANSLATION_REQUIRED';
  end if;

  -- ревизия: чужую правку (или свою же с ДРУГОГО устройства), которую автор этой записи не видел, молча не затираем
  if v_content or new.status is distinct from old.status then
    if new.rev is distinct from old.rev
       and (old.updated_by is distinct from v_uid or coalesce(old.updated_dev, '') is distinct from coalesce(new.updated_dev, '')) then
      raise exception 'STALE_DOC';
    end if;
    new.rev := old.rev + 1;
    new.updated_by := v_uid;
  else
    new.rev := old.rev; new.updated_by := old.updated_by; new.updated_dev := old.updated_dev;
  end if;

  -- переходы статуса
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := coalesce(new.approved_by, v_uid);
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_crew := jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb));
    new.edit_open_until := null; new.return_note := null; new.returned_by := null;
  elsif old.status = 'approved' and new.status <> 'approved' then
    new.approved_total := null; new.approved_by := null; new.approved_at := null; new.approved_crew := null;
  end if;
  if new.status = 'done' and old.status = 'draft' then
    new.return_note := null; new.returned_by := null;
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    if old.technician_id is distinct from v_uid and coalesce(new.return_note, '') <> '' then new.returned_by := v_uid;
    elsif old.technician_id = v_uid then new.return_note := null; new.returned_by := null; end if;
  end if;

  -- номер — при первом НЕ черновике
  if new.status <> 'draft' then
    if new.no is null then
      if new.is_test then v_no := 90000000 + nextval('public.jobs_test_no_seq');     -- тестовые документы настоящую нумерацию не трогают
      else loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop; end if;
      new.no := v_no;
    end if;
    if new.numbered_at is null then new.numbered_at := now(); end if;   -- «номер выдан»: документ отправляли на согласование
  end if;
  return new;
end $$;

create or replace function public.jobs_after_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_no bigint; v_dft boolean := coalesce(current_setting('techlog.dft', true), '') = '1';
begin
  if auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  if new.status = 'approved' and not public.can_approve_docs() then raise exception 'FORBIDDEN_APPROVE'; end if;
  if new.status <> 'draft' then
    if public.job_tr_missing(new.note, new.note_en, new.form_data) > 0 then raise exception 'TRANSLATION_REQUIRED'; end if;
    if new.is_test and v_dft then v_no := 90000000 + nextval('public.jobs_test_no_seq');
    else loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop; end if;
  end if;
  perform set_config('techlog.sysupd', '1', true);
  update public.jobs set no = v_no, numbered_at = case when v_no is null then null else now() end, doc_no = null,
         /* v1.09.27: обычная вставка «тестовой» быть не может */ is_test = (new.is_test and v_dft), test_owner = case when new.is_test and v_dft then new.test_owner end, test_run = case when new.is_test and v_dft then new.test_run end,
         rev = 0, updated_by = auth.uid(), edit_open_until = null, approved_crew = case when new.status = 'approved'
           then jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb)) else null end
   where id = new.id;
  perform set_config('techlog.sysupd', '', true);
  return new;
end $$;

create or replace function public.push_enqueue(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text default './')
returns void language plpgsql security definer set search_path = public as $$
declare v_prefs jsonb; v_owner text := nullif(coalesce(current_setting('techlog.test_owner', true), ''), '');
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if v_owner is not null then                                   -- v1.09.27: событие ТЕСТОВОГО документа — только в ленту того, кто ведёт тест; пуша нет
    if p_user::text = v_owner then
      insert into public.notices(user_id, kind, title, body, url, actor) values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_url, './'), auth.uid());
    end if;
    return;
  end if;
  select push_prefs into v_prefs from public.profiles where id = p_user and not blocked;
  if not found then return; end if;                             -- нет профиля / заблокирован
  if p_kind <> 'chat' then
    insert into public.notices(user_id, kind, title, body, url, actor)
    values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_url, './'), auth.uid());
  end if;
  if coalesce((coalesce(v_prefs, '{}'::jsonb)->>p_kind)::boolean, true) = false then return; end if;
  insert into public.push_queue(user_id, kind, title, body, url)
  values (p_user, p_kind, p_title, coalesce(p_body,''), coalesce(p_url,'./'));
end $$;

create or replace function public.jobs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text; v_url text; v_who text; r record; v_done boolean := false;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  perform set_config('techlog.test_owner', case when new.is_test then coalesce(new.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.27
  v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
  v_url  := './?doc=job:' || new.id::text;
  if tg_op = 'INSERT' then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Новая задача', v_body, v_url);
    end if;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    return new;
  end if;
  select display_name into v_who from public.profiles where id = auth.uid();

  -- основной исполнитель сменился
  if new.technician_id is distinct from old.technician_id then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Задача передана вам', v_body, v_url);
    end if;
    if old.technician_id is not null and not (coalesce(new.helper_ids, '[]'::jsonb) ? old.technician_id::text) then
      perform public.push_enqueue(old.technician_id, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
    end if;
    v_done := true;
  end if;
  -- состав бригады
  if new.helper_ids is distinct from old.helper_ids then
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
              where not (coalesce(old.helper_ids, '[]'::jsonb) ? value) and value::uuid is distinct from old.technician_id
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(old.helper_ids, '[]'::jsonb))
              where not (coalesce(new.helper_ids, '[]'::jsonb) ? value)
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
      end if;
    end loop;
    v_done := true;
  end if;

  -- статусы
  if old.status is distinct from 'approved' and new.status = 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Инвойс апрувлен',
        v_body || ' · $' || round(coalesce(new.approved_total, new.total, 0)), v_url);
    end loop;
    return new;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'reset',
        case when new.status = 'draft' then 'Апрув снят — документ в черновике' else 'Апрув снят с инвойса' end,
        v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
    end loop;
    return new;
  elsif old.status = 'done' and new.status = 'draft' then
    /* v1.09.26: вернуть на доработку может только согласующий; все остальные (основной, менеджер без права апрува,
       помощник с правом правки) документ ОТЗЫВАЮТ — об этом узнают согласующие и остальная бригада */
    if public.can_approve_docs() and auth.uid() is distinct from new.technician_id then
      for r in select distinct x.uid from (select new.technician_id as uid
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Возвращён на доработку',
          v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
      end loop;
    else
      for r in select distinct x.uid from (
                 select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
                 union select new.technician_id
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Документ отозван из согласования', v_body || ' · ' || coalesce(v_who, ''), v_url);
      end loop;
    end if;
    return new;
  elsif old.status = 'draft' and new.status = 'done' then
    for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Ждёт апрува', v_body || ' · ' || coalesce(v_who, ''), v_url);
    end loop;
    return new;
  end if;
  if v_done then return new; end if;

  /* «Документ изменён»: содержимое поменял НЕ исполнитель (push_enqueue сам пропускает автора правки). Приложение шлёт
     строку целиком при любом сохранении — сравниваем только значимые поля; не чаще раза в 10 минут на документ и человека. */
  if auth.uid() is not null and (new.form_data is distinct from old.form_data or new.date is distinct from old.date
       or new.unit_number is distinct from old.unit_number or new.complex_id is distinct from old.complex_id
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')) then
    for r in select distinct x.uid from (
               select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x
              where x.uid is not null and x.uid <> auth.uid()
    loop
      if not exists (select 1 from public.notices where user_id = r.uid and kind = 'edit' and url = v_url and created_at > now() - interval '10 minutes') then
        perform public.push_enqueue(r.uid, 'edit',
          case when new.date is distinct from old.date then 'Задача перенесена на ' || to_char(new.date, 'DD.MM') else 'Документ изменён' end,
          v_body || ' · ' || coalesce(v_who, ''), v_url);
      end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.jobs_arch_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_body text; v_who text;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  perform set_config('techlog.test_owner', case when new.is_test then coalesce(new.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.27
  if old.archived_at is null and new.archived_at is not null then
    v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
    select display_name into v_who from public.profiles where id = auth.uid();
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'job', 'Задача удалена', v_body || ' · ' || coalesce(v_who, ''), './');
    end loop;
  end if;
  return new;
end $$;

create or replace function public.doc_request_edit(p_job uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype; v_id uuid; v_who text; r record; v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform set_config('techlog.test_owner', case when j.is_test then coalesce(j.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.27
  if not (j.technician_id = auth.uid() or public.is_shared_job_helper(p_job)) then raise exception 'FORBIDDEN'; end if;
  if j.status <> 'approved' then raise exception 'BAD_STATUS'; end if;
  if length(v_reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if exists (select 1 from public.doc_requests where kind = 'job' and doc_id = p_job and status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;
  insert into public.doc_requests(kind, doc_id, user_id, reason) values ('job', p_job, auth.uid(), v_reason) returning id into v_id;
  select display_name into v_who from public.profiles where id = auth.uid();
  for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
  loop
    perform public.push_enqueue(r.uid, 'approve', 'Запрос на правку документа',
      'Unit ' || coalesce(nullif(j.unit_number,''),'—') || ' · ' || to_char(j.date, 'DD.MM') || ' · ' || coalesce(v_who, '') || ' · ' || v_reason,
      './?doc=job:' || p_job::text);
  end loop;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_who, ''), 'edit_request', 'job', p_job::text, jsonb_build_object('unit', j.unit_number, 'reason', v_reason));
  return v_id;
end $$;

create or replace function public.doc_request_decide(p_id uuid, p_grant boolean, p_answer text)
returns void language plpgsql security definer set search_path = public as $$
declare q public.doc_requests%rowtype; j public.jobs%rowtype; v_who text; v_ans text := left(trim(coalesce(p_answer, '')), 500); r record; v_body text;
begin
  if not public.can_approve_docs() then raise exception 'FORBIDDEN'; end if;
  select * into q from public.doc_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if q.status <> 'pending' then raise exception 'ALREADY_DECIDED'; end if;
  select * into j from public.jobs where id = q.doc_id;
  perform set_config('techlog.test_owner', case when j.is_test then coalesce(j.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.27
  update public.doc_requests set status = case when p_grant then 'granted' else 'denied' end,
         answer = v_ans, decided_by = auth.uid(), decided_at = now() where id = p_id;
  select display_name into v_who from public.profiles where id = auth.uid();
  v_body := 'Unit ' || coalesce(nullif(j.unit_number,''),'—') || ' · ' || to_char(j.date, 'DD.MM') || ' · ' || coalesce(v_who, '');
  if p_grant and j.id is not null then
    update public.jobs set status = 'draft', edit_open_until = now() + interval '24 hours',
           return_note = nullif('Правка разрешена' || coalesce(': ' || nullif(v_ans, ''), ''), '') where id = q.doc_id;
    if coalesce(j.acc_status, '') <> '' then
      for r in select id as uid from public.profiles where not blocked and role = 'accountant'
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Инвойс с отметкой бухгалтерии возвращён на правку',
          v_body || ' · отметка: ' || j.acc_status, './');
      end loop;
    end if;
  end if;
  if not p_grant then perform public.push_enqueue(q.user_id, 'reset', 'В правке отказано',
    v_body || coalesce(' · ' || nullif(v_ans, ''), ''), './?doc=job:' || q.doc_id::text); end if;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_who, ''), case when p_grant then 'edit_request_granted' else 'edit_request_denied' end,
          'job', q.doc_id::text, jsonb_build_object('unit', j.unit_number, 'answer', v_ans, 'acc', coalesce(j.acc_status, '')));
end $$;

create or replace function public.placements_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if new.is_test then return new; end if;                          -- v1.09.27: тестовый пикап никого не будит
  if new.ext_of is null and new.technician_id is not null then
    perform public.push_enqueue(new.technician_id, 'pickup', 'Новый пикап',
      'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · до ' || to_char(new.due_date, 'DD.MM'),
      './?day=' || to_char(new.due_date, 'YYYY-MM-DD'));
  end if;
  return new;
end $$;

create or replace function public.equip_pl_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tech uuid; v_d int; v_n int;
begin
  -- восстановление из бэкапа: движения приезжают из самого бэкапа
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if new.is_test then return new; end if;                          -- v1.09.27: тестовые пикапы склад не двигают

  if tg_op = 'INSERT' then
    if new.ext_of is null then
      perform public.equip_place(new.equipment_type_id,
                                 greatest(1, coalesce(new.qty, 1)),
                                 new.technician_id, new.id);
    end if;
    return new;
  end if;

  -- «забрал» / отмена забора
  if old.picked_up is distinct from new.picked_up then
    v_tech := coalesce(new.picked_up_by, old.picked_up_by, new.technician_id);
    if new.picked_up then
      insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
      values ('pickup', new.equipment_type_id, greatest(1, coalesce(new.qty, 1)),
              'site', 'car', v_tech, new.id, coalesce(new.picked_up_by, v_tech));
    else
      delete from public.equip_moves where placement_id = new.id and kind = 'pickup';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
        values ('undo', new.equipment_type_id, greatest(1, coalesce(old.qty, 1)),
                'car', 'site', v_tech, new.id, auth.uid());
      end if;
    end if;
  end if;

  -- «вернул на склад» / отмена возврата
  if (old.returned_at is null) is distinct from (new.returned_at is null) then
    v_tech := coalesce(new.picked_up_by, old.picked_up_by, new.technician_id);
    if new.returned_at is not null then
      insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
      values ('return', new.equipment_type_id, greatest(1, coalesce(new.qty, 1)),
              'car', 'stock', v_tech, new.id, coalesce(new.returned_by, v_tech));
    else
      delete from public.equip_moves where placement_id = new.id and kind = 'return';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
        values ('undo', new.equipment_type_id, greatest(1, coalesce(old.qty, 1)),
                'stock', 'car', v_tech, new.id, auth.uid());
      end if;
    end if;
  end if;

  -- правка количества в форме работы. Строки, у которых есть продления,
  -- форма не трогает (частичное продление меняет qty — это бумажный
  -- перенос на строку продления, движения не нужны).
  if old.qty is distinct from new.qty and new.ext_of is null
     and not exists (select 1 from public.placements x where x.ext_of = new.id) then
    v_d := coalesce(new.qty, 0) - coalesce(old.qty, 0);
    if v_d <> 0 then
      if new.returned_at is not null then                 -- уже сдано на склад
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, placement_id, actor)
        values ('undo', new.equipment_type_id, abs(v_d),
                case when v_d > 0 then 'ext' else 'stock' end,
                case when v_d > 0 then 'stock' else 'ext' end, new.id, auth.uid());
      elsif new.picked_up then                            -- в машине
        v_tech := coalesce(new.picked_up_by, new.technician_id);
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
        values ('undo', new.equipment_type_id, abs(v_d),
                case when v_d > 0 then 'site' else 'car' end,
                case when v_d > 0 then 'car' else 'site' end, v_tech, new.id, auth.uid());
      else                                                -- стоит на объекте
        if v_d > 0 then
          perform public.equip_place(new.equipment_type_id, v_d, new.technician_id, new.id);
        else
          insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
          values ('undo', new.equipment_type_id, -v_d, 'site', 'car', new.technician_id, new.id, auth.uid());
        end if;
      end if;
    end if;
  end if;

  return new;
end $$;

create or replace function public.equip_pl_arch_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if new.is_test then return new; end if;                          -- v1.09.27
  if old.archived_at is null and new.archived_at is not null and not coalesce(new.picked_up, false) then
    delete from public.equip_moves where placement_id = new.id;
  elsif old.archived_at is not null and new.archived_at is null and not coalesce(new.picked_up, false) and new.ext_of is null then
    perform public.equip_place(new.equipment_type_id, greatest(1, coalesce(new.qty, 1)), new.technician_id, new.id);
  end if;
  return new;
end $$;

-- =====================================================================
-- dft_exec — одна операция над ТЕСТОВЫМ документом от имени указанного человека. Только для service_role.
-- =====================================================================
create or replace function public.dft_exec(p_caller uuid, p_actor uuid, p_op text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_crole text; v_id uuid; v_job public.jobs%rowtype; v_pl public.placements%rowtype; v_res jsonb; v_n int := 0;
  v_run text := left(coalesce(p_args->>'run', ''), 60); v_fn text; a jsonb := coalesce(p_args->'args', '{}'::jsonb);
  v_patch jsonb := coalesce(p_args->'patch', '{}'::jsonb); v_row jsonb := coalesce(p_args->'row', '{}'::jsonb);
begin
  select role into v_crole from public.profiles where id = p_caller and not blocked;
  if v_crole is null then raise exception 'DFT_NO_CALLER'; end if;

  -- уборка работает и при выключенном режиме: остатки должны убираться всегда. Своё — любой, всё — только админ.
  if p_op = 'cleanup' then
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    perform set_config('techlog.test_owner', '00000000-0000-0000-0000-000000000000', true);
    for v_id in select id from public.jobs where is_test
                  and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
                  and (v_run = '' or test_run = v_run)
    loop
      delete from public.doc_locks where doc_id = v_id;
      delete from public.doc_requests where doc_id = v_id;
      delete from public.notices where url like '%doc=job:' || v_id::text || '%';
      delete from public.placements where job_id = v_id;
      delete from public.jobs where id = v_id;
      v_n := v_n + 1;
    end loop;
    delete from public.proposals where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    perform set_config('techlog.test_owner', '', true);
    return jsonb_build_object('ok', true, 'deleted', v_n);
  end if;

  if not public.dft_enabled() then raise exception 'DFT_OFF'; end if;
  select role into v_role from public.profiles where id = p_actor and not blocked;
  if v_role is null then raise exception 'DFT_NO_ACTOR'; end if;

  -- с этого места все сторожа видят p_actor как вошедшего пользователя
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  perform set_config('techlog.dft', '1', true);

  if p_op = 'job_create' then
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_ins
    insert into public.jobs (id, date, counterparty_id, complex_id, unit_number, work_type_id, technician_id, technician_name, helper_ids,
                             shared_with_helpers, status, note, note_en, form_data, total, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'work_type_id')::uuid, (v_row->>'technician_id')::uuid, coalesce(v_row->>'technician_name', ''),
            coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce((v_row->>'shared_with_helpers')::boolean, false), coalesce(v_row->>'status', 'draft'),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce(v_row->'form_data', '{}'::jsonb), coalesce((v_row->>'total')::numeric, 0),
            true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_id;

  elsif p_op in ('job_update', 'job_get') then
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;                       -- настоящий документ функция не трогает никогда
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'job_update' then
      if not (v_job.technician_id = p_actor or v_role in ('admin','manager') or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_upd
      update public.jobs j set (date, unit_number, complex_id, counterparty_id, work_type_id, technician_id, technician_name, helper_ids, shared_with_helpers,
                               priority, sort_order, status, note, note_en, form_data, total, approved_total, approved_by, approved_at, return_note,
                               archived_at, archived_by, arch_note, proposal_id, has_proposal, rev, updated_dev)
        = (select r.date, r.unit_number, r.complex_id, r.counterparty_id, r.work_type_id, r.technician_id, r.technician_name, r.helper_ids, r.shared_with_helpers,
                  r.priority, r.sort_order, r.status, r.note, r.note_en, r.form_data, r.total, r.approved_total, r.approved_by, r.approved_at, r.return_note,
                  r.archived_at, r.archived_by, r.arch_note, r.proposal_id, r.has_proposal, r.rev, r.updated_dev
             from jsonb_populate_record(j, v_patch) r)
       where j.id = v_job.id;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;

  elsif p_op = 'pl_upsert' then
    select * into v_job from public.jobs where id = (v_row->>'job_id')::uuid;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;
    select * into v_pl from public.placements where id = (v_row->>'id')::uuid;
    if found then
      update public.placements p set (qty, days, due_date, picked_up, picked_up_at, picked_up_by, returned_at, returned_by, superseded, superseded_at,
                                      archived_at, archived_by, arch_note, note, note_en, technician_id)
        = (select r.qty, r.days, r.due_date, r.picked_up, r.picked_up_at, r.picked_up_by, r.returned_at, r.returned_by, r.superseded, r.superseded_at,
                  r.archived_at, r.archived_by, r.arch_note, r.note, r.note_en, r.technician_id from jsonb_populate_record(p, v_row) r)
       where p.id = v_pl.id;
    else
      insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number, ext_of, note, note_en, no)
      values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_job.id, (v_row->>'equipment_type_id')::uuid, coalesce((v_row->>'qty')::int, 1), coalesce((v_row->>'days')::int, 1),
              coalesce((v_row->>'placed_date')::date, current_date), coalesce((v_row->>'due_date')::date, current_date + 1), (v_row->>'technician_id')::uuid,
              coalesce((v_row->>'complex_id')::uuid, v_job.complex_id), coalesce((v_row->>'counterparty_id')::uuid, v_job.counterparty_id), coalesce(v_row->>'unit_number', v_job.unit_number),
              (v_row->>'ext_of')::uuid, coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), 90000000 + nextval('public.jobs_test_no_seq'))   -- номер тестового пикапа — тоже из своего диапазона
      returning id into v_id;
    end if;
    select to_jsonb(p) into v_res from public.placements p where p.id = coalesce(v_pl.id, v_id);

  elsif p_op = 'prop_create' then
    if v_role not in ('admin','manager') then raise exception 'RLS_DENIED'; end if;                  -- как политика prop_ins
    insert into public.proposals (id, no, date, counterparty_id, complex_id, unit_number, note, items, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date),
            (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid, coalesce(v_row->>'unit_number', 'DFTEST'), coalesce(v_row->>'note', ''),
            coalesce(v_row->'items', '[]'::jsonb), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.proposals x where x.id = v_id;

  elsif p_op = 'rpc' then
    v_fn := p_args->>'fn';
    -- цель любой функции — тестовый документ этого прогона
    v_id := coalesce((a->>'p_job')::uuid, case when v_fn = 'doc_request_decide' then (select doc_id from public.doc_requests where id = (a->>'p_id')::uuid)
                                               when v_fn in ('doc_lock','doc_unlock') then (a->>'p_id')::uuid end);
    select * into v_job from public.jobs where id = v_id;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if v_fn = 'approve_job' then perform public.approve_job(v_id, (a->>'p_total')::numeric); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_request_edit' then v_res := to_jsonb(public.doc_request_edit(v_id, a->>'p_reason'));
    elsif v_fn = 'doc_request_decide' then perform public.doc_request_decide((a->>'p_id')::uuid, (a->>'p_grant')::boolean, a->>'p_answer'); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_lock' then v_res := public.doc_lock('job', v_id, coalesce((a->>'p_force')::boolean, false));
    elsif v_fn = 'doc_unlock' then perform public.doc_unlock('job', v_id); v_res := 'null'::jsonb;
    elsif v_fn = 'job_fix_no' then v_res := to_jsonb(public.job_fix_no(v_id, a->>'p_text'));
    elsif v_fn = 'link_job_proposal' then
      if (a->>'p_prop') is not null and not exists (select 1 from public.proposals where id = (a->>'p_prop')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      perform public.link_job_proposal(v_id, (a->>'p_prop')::uuid); v_res := 'null'::jsonb;
    else raise exception 'DFT_BAD_FN';
    end if;
    v_res := jsonb_build_object('result', v_res, 'job', (select to_jsonb(j) from public.jobs j where j.id = v_id));
  else
    raise exception 'DFT_BAD_OP';
  end if;

  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  perform set_config('techlog.dft', '', true); perform set_config('techlog.test_owner', '', true);
  return jsonb_build_object('ok', true, 'data', v_res);
end $$;
revoke all on function public.dft_exec(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dft_exec(uuid, uuid, text, jsonb) to service_role;

-- что видит приложение: включён ли режим, до какого времени, сколько осталось тестовых документов
create or replace function public.dft_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'on', public.dft_enabled(),
    'until', (select dft_until from public.org_settings where id = 'org'),
    'by', (select p.display_name from public.org_settings o join public.profiles p on p.id = o.dft_by where o.id = 'org'),
    'mine', (select count(*) from public.jobs where is_test and test_owner = auth.uid()),
    'all', case when public.my_role() = 'admin' then (select count(*) from public.jobs where is_test) end)
$$;
revoke all on function public.dft_status() from public, anon;
grant execute on function public.dft_status() to authenticated;

update public.org_settings set docflow_v = 3 where id = 'org' and docflow_v < 3;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='is_test') then miss := miss || ' jobs.is_test'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='placements' and column_name='is_test') then miss := miss || ' placements.is_test'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='dft_until') then miss := miss || ' org_settings.dft_until'; end if;
  if to_regclass('public.jobs_test_no_seq') is null then miss := miss || ' jobs_test_no_seq'; end if;
  if to_regprocedure('public.dft_exec(uuid,uuid,text,jsonb)') is null then miss := miss || ' dft_exec()'; end if;
  if to_regprocedure('public.admin_set_dft(boolean,int)') is null then miss := miss || ' admin_set_dft()'; end if;
  if has_function_privilege('authenticated', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute') then miss := miss || ' dft_exec(ДОСТУПНА КЛИЕНТУ!)'; end if;
  if position('new.is_test := old.is_test' in pg_get_functiondef('public.jobs_guard()'::regprocedure)) = 0 then miss := miss || ' jobs_guard(is_test)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.27 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.27 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_28 (тест документооборота — кнопками) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.28 · ТЕСТ ДОКУМЕНТООБОРОТА ИДЁТ КНОПКАМИ
--   Всё, что роли доступно в интерфейсе, тест теперь делает кнопками самого приложения. Для этого серверу нужно три вещи:
--   · job_adopt — документ, созданный кнопкой «Добавить задание», становится тестовым (условия — только свой свежий черновик DFTEST);
--   · номер пикапа выдаётся ПОСЛЕ вставки (как у инвойса): тестовые пикапы, созданные кнопками приложения, берут номер
--     из тестового диапазона и настоящую нумерацию пикапов не тратят;
--   · решение по заявке на продление аренды (decide_ext_request) — в закрытом списке функции тестирования.
-- =====================================================================

-- номер пикапа: вместо identity — свой счётчик и выдача ПОСЛЕ вставки (BEFORE INSERT срабатывает при каждом upsert)
do $$
declare v_next bigint;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'placements' and column_name = 'no' and is_identity = 'YES') then
    alter table public.placements alter column no drop identity;
  end if;
  alter table public.placements alter column no drop not null;
  alter table public.placements alter column no drop default;
  if to_regclass('public.placements_doc_no_seq') is null then
    select coalesce(max(no) filter (where no < 90000000), 0) + 1 into v_next from public.placements;
    execute format('create sequence public.placements_doc_no_seq start with %s', v_next);
  end if;
end $$;

create or replace function public.placements_after_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_no bigint;
begin
  if new.no is not null then return new; end if;                  -- номер задан явно: восстановление из бэкапа, функция тестирования
  if new.is_test then v_no := 90000000 + nextval('public.jobs_test_no_seq');
  else loop v_no := nextval('public.placements_doc_no_seq'); exit when not exists (select 1 from public.placements where no = v_no); end loop; end if;
  update public.placements set no = v_no where id = new.id;
  return new;
end $$;
drop trigger if exists placements_after_ins_tg on public.placements;
create trigger placements_after_ins_tg after insert on public.placements
  for each row execute function public.placements_after_ins();

-- номер, выданный базой, клиент не затирает (приложение шлёт строку целиком, а номера в ней может ещё не быть)
create or replace function public.placements_test_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.is_test := coalesce((select j.is_test from public.jobs j where j.id = new.job_id), false);
  else new.is_test := old.is_test; if new.no is null then new.no := old.no; end if; end if;
  return new;
end $$;

create or replace function public.dft_exec(p_caller uuid, p_actor uuid, p_op text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_crole text; v_id uuid; v_job public.jobs%rowtype; v_pl public.placements%rowtype; v_res jsonb; v_n int := 0;
  v_run text := left(coalesce(p_args->>'run', ''), 60); v_fn text; a jsonb := coalesce(p_args->'args', '{}'::jsonb);
  v_patch jsonb := coalesce(p_args->'patch', '{}'::jsonb); v_row jsonb := coalesce(p_args->'row', '{}'::jsonb);
begin
  select role into v_crole from public.profiles where id = p_caller and not blocked;
  if v_crole is null then raise exception 'DFT_NO_CALLER'; end if;

  -- уборка работает и при выключенном режиме: остатки должны убираться всегда. Своё — любой, всё — только админ.
  if p_op = 'cleanup' then
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    perform set_config('techlog.test_owner', '00000000-0000-0000-0000-000000000000', true);
    for v_id in select id from public.jobs where is_test
                  and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
                  and (v_run = '' or test_run = v_run)
    loop
      delete from public.doc_locks where doc_id = v_id;
      delete from public.doc_requests where doc_id = v_id;
      delete from public.ext_requests where job_id = v_id;
      delete from public.notices where url like '%doc=job:' || v_id::text || '%';
      delete from public.placements where job_id = v_id;
      delete from public.jobs where id = v_id;
      v_n := v_n + 1;
    end loop;
    delete from public.proposals where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    perform set_config('techlog.test_owner', '', true);
    return jsonb_build_object('ok', true, 'deleted', v_n);
  end if;

  if not public.dft_enabled() then raise exception 'DFT_OFF'; end if;
  select role into v_role from public.profiles where id = p_actor and not blocked;
  if v_role is null then raise exception 'DFT_NO_ACTOR'; end if;

  -- с этого места все сторожа видят p_actor как вошедшего пользователя
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  perform set_config('techlog.dft', '1', true);

  if p_op = 'job_adopt' then
    /* v1.09.28: документ, который ведущий тест только что создал КНОПКОЙ «Добавить задание», становится тестовым. Условия жёсткие,
       чтобы пометить можно было только свой свежий черновик, который и так разрешено удалить: черновик, ни разу не отправлялся,
       создан не раньше 10 минут назад, юнит начинается с DFTEST, без пикапов; исполнитель — сам вызывающий (менеджеру и админу —
       ещё и «без исполнителя»). Настоящий рабочий документ под эти условия не попадает. */
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_job.is_test then
      if v_job.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    else
      if v_job.status <> 'draft' or v_job.numbered_at is not null or v_job.archived_at is not null
         or v_job.created_at < now() - interval '10 minutes' or coalesce(v_job.unit_number, '') not like 'DFTEST%'
         or exists (select 1 from public.placements where job_id = v_job.id)
         or not (v_job.technician_id = p_caller or (v_job.technician_id is null and v_crole in ('admin','manager'))) then
        raise exception 'DFT_ADOPT_DENIED';
      end if;
      perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
      perform set_config('techlog.sysupd', '1', true);
      update public.jobs set is_test = true, test_owner = p_caller, test_run = v_run where id = v_job.id;
      perform set_config('techlog.sysupd', '', true);
      delete from public.push_queue where url like '%doc=job:' || v_job.id::text || '%' and sent_at is null;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;
    perform set_config('techlog.dft', '', true);
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_create' then
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_ins
    insert into public.jobs (id, date, counterparty_id, complex_id, unit_number, work_type_id, technician_id, technician_name, helper_ids,
                             shared_with_helpers, status, note, note_en, form_data, total, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'work_type_id')::uuid, (v_row->>'technician_id')::uuid, coalesce(v_row->>'technician_name', ''),
            coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce((v_row->>'shared_with_helpers')::boolean, false), coalesce(v_row->>'status', 'draft'),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce(v_row->'form_data', '{}'::jsonb), coalesce((v_row->>'total')::numeric, 0),
            true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_id;

  elsif p_op in ('job_update', 'job_get') then
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;                       -- настоящий документ функция не трогает никогда
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'job_update' then
      if not (v_job.technician_id = p_actor or v_role in ('admin','manager') or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_upd
      update public.jobs j set (date, unit_number, complex_id, counterparty_id, work_type_id, technician_id, technician_name, helper_ids, shared_with_helpers,
                               priority, sort_order, status, note, note_en, form_data, total, approved_total, approved_by, approved_at, return_note,
                               archived_at, archived_by, arch_note, proposal_id, has_proposal, rev, updated_dev)
        = (select r.date, r.unit_number, r.complex_id, r.counterparty_id, r.work_type_id, r.technician_id, r.technician_name, r.helper_ids, r.shared_with_helpers,
                  r.priority, r.sort_order, r.status, r.note, r.note_en, r.form_data, r.total, r.approved_total, r.approved_by, r.approved_at, r.return_note,
                  r.archived_at, r.archived_by, r.arch_note, r.proposal_id, r.has_proposal, r.rev, r.updated_dev
             from jsonb_populate_record(j, v_patch) r)
       where j.id = v_job.id;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;

  elsif p_op = 'pl_upsert' then
    select * into v_job from public.jobs where id = (v_row->>'job_id')::uuid;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;
    select * into v_pl from public.placements where id = (v_row->>'id')::uuid;
    if found then
      update public.placements p set (qty, days, due_date, picked_up, picked_up_at, picked_up_by, returned_at, returned_by, superseded, superseded_at,
                                      archived_at, archived_by, arch_note, note, note_en, technician_id)
        = (select r.qty, r.days, r.due_date, r.picked_up, r.picked_up_at, r.picked_up_by, r.returned_at, r.returned_by, r.superseded, r.superseded_at,
                  r.archived_at, r.archived_by, r.arch_note, r.note, r.note_en, r.technician_id from jsonb_populate_record(p, v_row) r)
       where p.id = v_pl.id;
    else
      insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number, ext_of, note, note_en, no)
      values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_job.id, (v_row->>'equipment_type_id')::uuid, coalesce((v_row->>'qty')::int, 1), coalesce((v_row->>'days')::int, 1),
              coalesce((v_row->>'placed_date')::date, current_date), coalesce((v_row->>'due_date')::date, current_date + 1), (v_row->>'technician_id')::uuid,
              coalesce((v_row->>'complex_id')::uuid, v_job.complex_id), coalesce((v_row->>'counterparty_id')::uuid, v_job.counterparty_id), coalesce(v_row->>'unit_number', v_job.unit_number),
              (v_row->>'ext_of')::uuid, coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), 90000000 + nextval('public.jobs_test_no_seq'))   -- номер тестового пикапа — тоже из своего диапазона
      returning id into v_id;
    end if;
    select to_jsonb(p) into v_res from public.placements p where p.id = coalesce(v_pl.id, v_id);

  elsif p_op = 'prop_create' then
    if v_role not in ('admin','manager') then raise exception 'RLS_DENIED'; end if;                  -- как политика prop_ins
    insert into public.proposals (id, no, date, counterparty_id, complex_id, unit_number, note, items, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date),
            (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid, coalesce(v_row->>'unit_number', 'DFTEST'), coalesce(v_row->>'note', ''),
            coalesce(v_row->'items', '[]'::jsonb), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.proposals x where x.id = v_id;

  elsif p_op = 'rpc' then
    v_fn := p_args->>'fn';
    -- цель любой функции — тестовый документ этого прогона
    v_id := coalesce((a->>'p_job')::uuid, case when v_fn = 'doc_request_decide' then (select doc_id from public.doc_requests where id = (a->>'p_id')::uuid)
                                               when v_fn = 'decide_ext_request' then (select job_id from public.ext_requests where id = (a->>'p_id')::uuid)
                                               when v_fn in ('doc_lock','doc_unlock') then (a->>'p_id')::uuid end);
    select * into v_job from public.jobs where id = v_id;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if v_fn = 'approve_job' then perform public.approve_job(v_id, (a->>'p_total')::numeric); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_request_edit' then v_res := to_jsonb(public.doc_request_edit(v_id, a->>'p_reason'));
    elsif v_fn = 'doc_request_decide' then perform public.doc_request_decide((a->>'p_id')::uuid, (a->>'p_grant')::boolean, a->>'p_answer'); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_lock' then v_res := public.doc_lock('job', v_id, coalesce((a->>'p_force')::boolean, false));
    elsif v_fn = 'doc_unlock' then perform public.doc_unlock('job', v_id); v_res := 'null'::jsonb;
    elsif v_fn = 'decide_ext_request' then perform public.decide_ext_request((a->>'p_id')::uuid, (a->>'p_ok')::boolean); v_res := 'null'::jsonb;
    elsif v_fn = 'job_fix_no' then v_res := to_jsonb(public.job_fix_no(v_id, a->>'p_text'));
    elsif v_fn = 'link_job_proposal' then
      if (a->>'p_prop') is not null and not exists (select 1 from public.proposals where id = (a->>'p_prop')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      perform public.link_job_proposal(v_id, (a->>'p_prop')::uuid); v_res := 'null'::jsonb;
    else raise exception 'DFT_BAD_FN';
    end if;
    v_res := jsonb_build_object('result', v_res, 'job', (select to_jsonb(j) from public.jobs j where j.id = v_id));
  else
    raise exception 'DFT_BAD_OP';
  end if;

  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  perform set_config('techlog.dft', '', true); perform set_config('techlog.test_owner', '', true);
  return jsonb_build_object('ok', true, 'data', v_res);
end $$;
revoke all on function public.dft_exec(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dft_exec(uuid, uuid, text, jsonb) to service_role;

update public.org_settings set docflow_v = 4 where id = 'org' and docflow_v < 4;

do $$
declare miss text := '';
begin
  if to_regclass('public.placements_doc_no_seq') is null then miss := miss || ' placements_doc_no_seq'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'placements_after_ins_tg') then miss := miss || ' placements_after_ins_tg'; end if;
  if position('job_adopt' in pg_get_functiondef('public.dft_exec(uuid,uuid,text,jsonb)'::regprocedure)) = 0 then miss := miss || ' dft_exec(job_adopt)'; end if;
  if has_function_privilege('authenticated', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute') then miss := miss || ' dft_exec(ДОСТУПНА КЛИЕНТУ!)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.28 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.28 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_29 (тест документооборота: все сценарии и журнал) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.29 · «Апрув не совпадает с расчётом» без догадок по времени: сервер запоминает ревизию документа на момент апрува
--   (jobs.approved_rev). Документ правили после апрува ⇔ rev > approved_rev. Раньше раздел «Документооборота» судил по разнице
--   времени апрува и правки (> 60 с) — часы телефона согласующего могли давать ложные срабатывания, а быстрая правка не замечалась.
-- =====================================================================
alter table public.jobs add column if not exists approved_rev int;
update public.jobs set approved_rev = rev where status = 'approved' and approved_rev is null;

create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := coalesce(public.my_role(), 'tech');
  v_appr boolean := public.can_approve_docs();
  v_sys  boolean := auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1'
                    or coalesce(current_setting('techlog.sysupd', true), '') = '1';
  v_content boolean; v_no bigint; v_self boolean; v_link boolean;
begin
  new.updated_at := now();
  if v_sys then return new; end if;
  select coalesce(self_approve, false), coalesce(mgr_link_locked, false) into v_self, v_link from public.org_settings where id = 'org';

  -- поля, которыми клиент не распоряжается
  new.no := old.no; new.numbered_at := old.numbered_at; new.approved_crew := old.approved_crew; new.approved_rev := old.approved_rev;
  new.is_test := old.is_test; new.test_owner := old.test_owner; new.test_run := old.test_run;   -- v1.09.27: пометку «тестовый» ставит только функция тестирования
  if v_role = 'admin' then new.doc_no := coalesce(new.doc_no, old.doc_no); else new.doc_no := old.doc_no; end if;
  if not v_appr then
    new.edit_open_until := old.edit_open_until;
    new.approved_total := old.approved_total; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    if not (new.status = 'draft' and old.status = 'done') then
      new.return_note := old.return_note; new.returned_by := old.returned_by;
    end if;
  end if;

  -- привязка пропозала — связь документов, а не содержимое инвойса
  if new.proposal_id is distinct from old.proposal_id and old.status <> 'draft'
     and not (v_role = 'admin' or v_appr or (v_role = 'manager' and coalesce(v_link, false))) then
    raise exception 'LINK_LOCKED';
  end if;

  v_content := new.form_data is distinct from old.form_data
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')
       or coalesce(new.note_en, '') is distinct from coalesce(old.note_en, '')
       or new.date is distinct from old.date
       or coalesce(new.unit_number, '') is distinct from coalesce(old.unit_number, '')
       or new.complex_id is distinct from old.complex_id
       or new.counterparty_id is distinct from old.counterparty_id
       or new.work_type_id is distinct from old.work_type_id
       or new.technician_id is distinct from old.technician_id
       or new.helper_ids is distinct from old.helper_ids
       or new.shared_with_helpers is distinct from old.shared_with_helpers
       or new.total is distinct from old.total;

  -- смена основного исполнителя: админ всегда, менеджер — пока черновик
  if new.technician_id is distinct from old.technician_id
     and not (v_role = 'admin' or (v_role = 'manager' and old.status = 'draft')) then
    raise exception 'FORBIDDEN_FIELD';
  end if;
  -- состав бригады и «Общий доступ» помощник не меняет
  if (new.helper_ids is distinct from old.helper_ids or new.shared_with_helpers is distinct from old.shared_with_helpers)
     and not (v_role in ('admin','manager') or old.technician_id = v_uid) then
    raise exception 'FORBIDDEN_CREW';
  end if;
  -- техника — это пикапы и склад исполнителя: менеджер в чужом документе её только видит
  if v_role = 'manager' and old.technician_id is distinct from v_uid
     and public.job_equip_norm(new.form_data) is distinct from public.job_equip_norm(old.form_data) then
    raise exception 'FORBIDDEN_EQUIPMENT';
  end if;
  -- в архив: основной — только документ, который ещё ни разу не отправляли на согласование (иначе обход: отозвал → удалил), дальше — админ.
  -- Признак — numbered_at, а не no: у черновиков, созданных до 1.09.25, номер есть с рождения, и удалять их по-прежнему можно.
  if new.archived_at is distinct from old.archived_at and v_role <> 'admin'
     and (old.numbered_at is not null or old.status <> 'draft') then
    raise exception 'DOC_LOCKED_DELETE';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if not v_appr then raise exception 'FORBIDDEN_APPROVE'; end if;
    if v_role <> 'admin' and old.technician_id = v_uid and not coalesce(v_self, false) then
      raise exception 'SELF_APPROVE_OFF';
    end if;
  end if;

  if not v_appr then
    if old.status = 'approved' and (v_content or new.status <> 'approved') then
      raise exception 'DOC_LOCKED_APPROVED';
    end if;
    if old.status = 'done' then
      if new.status = 'draft' then        -- «отозвать»: тот, кто правит черновик; правки в том же сохранении допустимы
        if not (old.technician_id = v_uid or v_role = 'manager' or public.is_shared_job_helper(old.id)) then raise exception 'DOC_LOCKED_DONE'; end if;
      elsif v_content then
        raise exception 'DOC_LOCKED_DONE';
      end if;
    end if;
  end if;

  -- на согласование — только с переводом
  if old.status = 'draft' and new.status <> 'draft'
     and public.job_tr_missing(new.note, new.note_en, new.form_data) > 0 then
    raise exception 'TRANSLATION_REQUIRED';
  end if;

  -- ревизия: чужую правку (или свою же с ДРУГОГО устройства), которую автор этой записи не видел, молча не затираем
  if v_content or new.status is distinct from old.status then
    if new.rev is distinct from old.rev
       and (old.updated_by is distinct from v_uid or coalesce(old.updated_dev, '') is distinct from coalesce(new.updated_dev, '')) then
      raise exception 'STALE_DOC';
    end if;
    new.rev := old.rev + 1;
    new.updated_by := v_uid;
  else
    new.rev := old.rev; new.updated_by := old.updated_by; new.updated_dev := old.updated_dev;
  end if;

  -- согласующий обновил апрувленную сумму у уже заапрувленного документа — апрув «переставлен» на текущую ревизию
  if old.status = 'approved' and new.status = 'approved' and v_appr and new.approved_total is distinct from old.approved_total then new.approved_rev := new.rev; end if;
  -- переходы статуса
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := coalesce(new.approved_by, v_uid);
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_crew := jsonb_build_object('main', new.technician_id, 'crew', coalesce(new.helper_ids, '[]'::jsonb));
    new.approved_rev := new.rev;                                   -- v1.09.29: ревизия на момент апрува — по ней видно, что документ правили ПОСЛЕ апрува
    new.edit_open_until := null; new.return_note := null; new.returned_by := null;
  elsif old.status = 'approved' and new.status <> 'approved' then
    new.approved_total := null; new.approved_by := null; new.approved_at := null; new.approved_crew := null; new.approved_rev := null;
  end if;
  if new.status = 'done' and old.status = 'draft' then
    new.return_note := null; new.returned_by := null;
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    if old.technician_id is distinct from v_uid and coalesce(new.return_note, '') <> '' then new.returned_by := v_uid;
    elsif old.technician_id = v_uid then new.return_note := null; new.returned_by := null; end if;
  end if;

  -- номер — при первом НЕ черновике
  if new.status <> 'draft' then
    if new.no is null then
      if new.is_test then v_no := 90000000 + nextval('public.jobs_test_no_seq');     -- тестовые документы настоящую нумерацию не трогают
      else loop v_no := nextval('public.jobs_doc_no_seq'); exit when not exists (select 1 from public.jobs where no = v_no); end loop; end if;
      new.no := v_no;
    end if;
    if new.numbered_at is null then new.numbered_at := now(); end if;   -- «номер выдан»: документ отправляли на согласование
  end if;
  return new;
end $$;

update public.org_settings set docflow_v = 5 where id = 'org' and docflow_v < 5;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='approved_rev') then miss := miss || ' jobs.approved_rev'; end if;
  if position('approved_rev' in pg_get_functiondef('public.jobs_guard()'::regprocedure)) = 0 then miss := miss || ' jobs_guard(approved_rev)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.29 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.29 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_30 (тест документооборота: ремонт, пропозал кнопками, все ветки) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.30 · функция тестирования умеет больше: документ ремонта (rep_create / rep_update / rep_get), приём в тест пропозала и
--   ремонта, созданных кнопками приложения (prop_adopt / rep_adopt), уборка удаляет и тестовые ремонты. Пометку «тестовый» у ремонта,
--   как и у инвойса, ставит только функция; события тестового ремонта приходят только ведущему тест и без пушей.
-- =====================================================================
alter table public.repairs add column if not exists is_test    boolean not null default false;
alter table public.repairs add column if not exists test_owner uuid;
alter table public.repairs add column if not exists test_run   text;

create or replace function public.repairs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_can boolean;
begin
  if coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  v_can := public.can_approve_docs();
  if TG_OP = 'INSERT' then
    if coalesce(current_setting('techlog.dft', true), '') <> '1' then new.is_test := false; new.test_owner := null; new.test_run := null; end if;   -- v1.09.30: пометку «тестовый» ставит только функция тестирования
    if new.status in ('approved','declined') and not coalesce(v_can, false) then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if coalesce(current_setting('techlog.dft', true), '') <> '1' then new.is_test := old.is_test; new.test_owner := old.test_owner; new.test_run := old.test_run; end if;
  if new.status is distinct from old.status
     and new.status in ('approved','declined')
     and not coalesce(v_can, false) then
    raise exception 'FORBIDDEN_APPROVE';
  end if;
  return new;
end $$;

create or replace function public.repairs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text; v_url text; r record;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  perform set_config('techlog.test_owner', case when new.is_test then coalesce(new.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.30
  if old.status is distinct from 'approved' and new.status = 'approved' then
    v_t := 'Ремонт апрувлен';
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    v_t := 'Апрув снят с ремонта';
  else
    return new;
  end if;
  v_b := 'REP-' || new.no || ' · Unit ' || coalesce(nullif(new.unit_number,''),'—');
  v_url := './?doc=rep:' || new.id::text;
  perform public.push_enqueue(new.created_by, 'approve', v_t, v_b, v_url);
  for r in select distinct value::uuid as uid
             from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
  loop
    if r.uid is distinct from new.created_by then
      perform public.push_enqueue(r.uid, 'approve', v_t, v_b, v_url);
    end if;
  end loop;
  return new;
end $$;

create or replace function public.dft_exec(p_caller uuid, p_actor uuid, p_op text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_crole text; v_id uuid; v_job public.jobs%rowtype; v_pl public.placements%rowtype; v_rep public.repairs%rowtype; v_prop public.proposals%rowtype; v_res jsonb; v_n int := 0;
  v_run text := left(coalesce(p_args->>'run', ''), 60); v_fn text; a jsonb := coalesce(p_args->'args', '{}'::jsonb);
  v_patch jsonb := coalesce(p_args->'patch', '{}'::jsonb); v_row jsonb := coalesce(p_args->'row', '{}'::jsonb);
begin
  select role into v_crole from public.profiles where id = p_caller and not blocked;
  if v_crole is null then raise exception 'DFT_NO_CALLER'; end if;

  -- уборка работает и при выключенном режиме: остатки должны убираться всегда. Своё — любой, всё — только админ.
  if p_op = 'cleanup' then
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    perform set_config('techlog.test_owner', '00000000-0000-0000-0000-000000000000', true);
    for v_id in select id from public.jobs where is_test
                  and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
                  and (v_run = '' or test_run = v_run)
    loop
      delete from public.doc_locks where doc_id = v_id;
      delete from public.doc_requests where doc_id = v_id;
      delete from public.ext_requests where job_id = v_id;
      delete from public.notices where url like '%doc=job:' || v_id::text || '%';
      delete from public.placements where job_id = v_id;
      delete from public.jobs where id = v_id;
      v_n := v_n + 1;
    end loop;
    delete from public.repairs where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    delete from public.notices where url like '%doc=rep:%' and user_id = p_caller and body like '%DFTEST%';
    delete from public.proposals where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    perform set_config('techlog.test_owner', '', true);
    return jsonb_build_object('ok', true, 'deleted', v_n);
  end if;

  if not public.dft_enabled() then raise exception 'DFT_OFF'; end if;
  select role into v_role from public.profiles where id = p_actor and not blocked;
  if v_role is null then raise exception 'DFT_NO_ACTOR'; end if;

  -- с этого места все сторожа видят p_actor как вошедшего пользователя
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  perform set_config('techlog.dft', '1', true);

  if p_op in ('prop_adopt', 'rep_adopt') then
    /* v1.09.30: пропозал или ремонт, созданный КНОПКАМИ приложения, принимается в тест — условия те же, что у задачи:
       свой (created_by = вызывающий), черновик, создан не раньше 10 минут назад, юнит начинается с DFTEST */
    if p_op = 'prop_adopt' then
      select * into v_prop from public.proposals where id = (p_args->>'id')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
      if not v_prop.is_test then
        if v_prop.status <> 'draft' or v_prop.created_by is distinct from p_caller or v_prop.created_at < now() - interval '10 minutes'
           or coalesce(v_prop.unit_number, '') not like 'DFTEST%' or v_prop.archived_at is not null then raise exception 'DFT_ADOPT_DENIED'; end if;
        update public.proposals set is_test = true, test_owner = p_caller, test_run = v_run where id = v_prop.id;
      elsif v_prop.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
      select to_jsonb(x) into v_res from public.proposals x where x.id = v_prop.id;
    else
      select * into v_rep from public.repairs where id = (p_args->>'id')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
      if not v_rep.is_test then
        if v_rep.status <> 'draft' or v_rep.created_by is distinct from p_caller or v_rep.created_at < now() - interval '10 minutes'
           or coalesce(v_rep.unit_number, '') not like 'DFTEST%' or v_rep.archived_at is not null
           or (v_rep.job_id is not null and not exists (select 1 from public.jobs where id = v_rep.job_id and is_test)) then raise exception 'DFT_ADOPT_DENIED'; end if;
        perform set_config('techlog.dft', '1', true);
        update public.repairs set is_test = true, test_owner = p_caller, test_run = v_run where id = v_rep.id;
        perform set_config('techlog.dft', '', true);
      elsif v_rep.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
      select to_jsonb(x) into v_res from public.repairs x where x.id = v_rep.id;
    end if;
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_adopt' then
    /* v1.09.28: документ, который ведущий тест только что создал КНОПКОЙ «Добавить задание», становится тестовым. Условия жёсткие,
       чтобы пометить можно было только свой свежий черновик, который и так разрешено удалить: черновик, ни разу не отправлялся,
       создан не раньше 10 минут назад, юнит начинается с DFTEST, без пикапов; исполнитель — сам вызывающий (менеджеру и админу —
       ещё и «без исполнителя»). Настоящий рабочий документ под эти условия не попадает. */
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_job.is_test then
      if v_job.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    else
      if v_job.status <> 'draft' or v_job.numbered_at is not null or v_job.archived_at is not null
         or v_job.created_at < now() - interval '10 minutes' or coalesce(v_job.unit_number, '') not like 'DFTEST%'
         or exists (select 1 from public.placements where job_id = v_job.id)
         or not (v_job.technician_id = p_caller or (v_job.technician_id is null and v_crole in ('admin','manager'))) then
        raise exception 'DFT_ADOPT_DENIED';
      end if;
      perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
      perform set_config('techlog.sysupd', '1', true);
      update public.jobs set is_test = true, test_owner = p_caller, test_run = v_run where id = v_job.id;
      perform set_config('techlog.sysupd', '', true);
      delete from public.push_queue where url like '%doc=job:' || v_job.id::text || '%' and sent_at is null;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;
    perform set_config('techlog.dft', '', true);
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_create' then
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_ins
    insert into public.jobs (id, date, counterparty_id, complex_id, unit_number, work_type_id, technician_id, technician_name, helper_ids,
                             shared_with_helpers, status, note, note_en, form_data, total, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'work_type_id')::uuid, (v_row->>'technician_id')::uuid, coalesce(v_row->>'technician_name', ''),
            coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce((v_row->>'shared_with_helpers')::boolean, false), coalesce(v_row->>'status', 'draft'),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce(v_row->'form_data', '{}'::jsonb), coalesce((v_row->>'total')::numeric, 0),
            true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_id;

  elsif p_op in ('job_update', 'job_get') then
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;                       -- настоящий документ функция не трогает никогда
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'job_update' then
      if not (v_job.technician_id = p_actor or v_role in ('admin','manager') or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_upd
      update public.jobs j set (date, unit_number, complex_id, counterparty_id, work_type_id, technician_id, technician_name, helper_ids, shared_with_helpers,
                               priority, sort_order, status, note, note_en, form_data, total, approved_total, approved_by, approved_at, return_note,
                               archived_at, archived_by, arch_note, proposal_id, has_proposal, rev, updated_dev)
        = (select r.date, r.unit_number, r.complex_id, r.counterparty_id, r.work_type_id, r.technician_id, r.technician_name, r.helper_ids, r.shared_with_helpers,
                  r.priority, r.sort_order, r.status, r.note, r.note_en, r.form_data, r.total, r.approved_total, r.approved_by, r.approved_at, r.return_note,
                  r.archived_at, r.archived_by, r.arch_note, r.proposal_id, r.has_proposal, r.rev, r.updated_dev
             from jsonb_populate_record(j, v_patch) r)
       where j.id = v_job.id;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;

  elsif p_op = 'pl_upsert' then
    select * into v_job from public.jobs where id = (v_row->>'job_id')::uuid;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;
    select * into v_pl from public.placements where id = (v_row->>'id')::uuid;
    if found then
      update public.placements p set (qty, days, due_date, picked_up, picked_up_at, picked_up_by, returned_at, returned_by, superseded, superseded_at,
                                      archived_at, archived_by, arch_note, note, note_en, technician_id)
        = (select r.qty, r.days, r.due_date, r.picked_up, r.picked_up_at, r.picked_up_by, r.returned_at, r.returned_by, r.superseded, r.superseded_at,
                  r.archived_at, r.archived_by, r.arch_note, r.note, r.note_en, r.technician_id from jsonb_populate_record(p, v_row) r)
       where p.id = v_pl.id;
    else
      insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number, ext_of, note, note_en, no)
      values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_job.id, (v_row->>'equipment_type_id')::uuid, coalesce((v_row->>'qty')::int, 1), coalesce((v_row->>'days')::int, 1),
              coalesce((v_row->>'placed_date')::date, current_date), coalesce((v_row->>'due_date')::date, current_date + 1), (v_row->>'technician_id')::uuid,
              coalesce((v_row->>'complex_id')::uuid, v_job.complex_id), coalesce((v_row->>'counterparty_id')::uuid, v_job.counterparty_id), coalesce(v_row->>'unit_number', v_job.unit_number),
              (v_row->>'ext_of')::uuid, coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), 90000000 + nextval('public.jobs_test_no_seq'))   -- номер тестового пикапа — тоже из своего диапазона
      returning id into v_id;
    end if;
    select to_jsonb(p) into v_res from public.placements p where p.id = coalesce(v_pl.id, v_id);

  elsif p_op = 'prop_create' then
    if v_role not in ('admin','manager') then raise exception 'RLS_DENIED'; end if;                  -- как политика prop_ins
    insert into public.proposals (id, no, date, counterparty_id, complex_id, unit_number, note, items, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date),
            (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid, coalesce(v_row->>'unit_number', 'DFTEST'), coalesce(v_row->>'note', ''),
            coalesce(v_row->'items', '[]'::jsonb), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.proposals x where x.id = v_id;

  elsif p_op = 'rep_create' then
    if (v_row->>'created_by') is not null and (v_row->>'created_by')::uuid is distinct from p_actor then raise exception 'RLS_DENIED'; end if;   -- как политика rep_ins
    if (v_row->>'job_id') is not null and not exists (select 1 from public.jobs where id = (v_row->>'job_id')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
    insert into public.repairs (id, no, date, counterparty_id, complex_id, unit_number, job_id, helper_ids, items, materials, note, note_en, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'job_id')::uuid, coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce(v_row->'items', '[]'::jsonb), coalesce(v_row->'materials', '[]'::jsonb),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.repairs x where x.id = v_id;

  elsif p_op in ('rep_update', 'rep_get') then
    select * into v_rep from public.repairs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_rep.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_rep.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'rep_update' then
      if not (v_role in ('admin','manager') or v_rep.created_by = p_actor) then raise exception 'RLS_DENIED'; end if;                  -- как политика rep_upd
      update public.repairs x set (date, unit_number, items, materials, note, note_en, total, status, decline_reason, decided_by, decided_at, hist, helper_ids, job_id, archived_at, arch_note)
        = (select r.date, r.unit_number, r.items, r.materials, r.note, r.note_en, r.total, r.status, r.decline_reason, r.decided_by, r.decided_at, r.hist, r.helper_ids, r.job_id, r.archived_at, r.arch_note
             from jsonb_populate_record(x, v_patch) r)
       where x.id = v_rep.id;
    end if;
    select to_jsonb(x) into v_res from public.repairs x where x.id = v_rep.id;

  elsif p_op = 'rpc' then
    v_fn := p_args->>'fn';
    -- цель любой функции — тестовый документ этого прогона
    v_id := coalesce((a->>'p_job')::uuid, case when v_fn = 'doc_request_decide' then (select doc_id from public.doc_requests where id = (a->>'p_id')::uuid)
                                               when v_fn = 'decide_ext_request' then (select job_id from public.ext_requests where id = (a->>'p_id')::uuid)
                                               when v_fn in ('doc_lock','doc_unlock') then (a->>'p_id')::uuid end);
    select * into v_job from public.jobs where id = v_id;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if v_fn = 'approve_job' then perform public.approve_job(v_id, (a->>'p_total')::numeric); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_request_edit' then v_res := to_jsonb(public.doc_request_edit(v_id, a->>'p_reason'));
    elsif v_fn = 'doc_request_decide' then perform public.doc_request_decide((a->>'p_id')::uuid, (a->>'p_grant')::boolean, a->>'p_answer'); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_lock' then v_res := public.doc_lock('job', v_id, coalesce((a->>'p_force')::boolean, false));
    elsif v_fn = 'doc_unlock' then perform public.doc_unlock('job', v_id); v_res := 'null'::jsonb;
    elsif v_fn = 'decide_ext_request' then perform public.decide_ext_request((a->>'p_id')::uuid, (a->>'p_ok')::boolean); v_res := 'null'::jsonb;
    elsif v_fn = 'job_fix_no' then v_res := to_jsonb(public.job_fix_no(v_id, a->>'p_text'));
    elsif v_fn = 'link_job_proposal' then
      if (a->>'p_prop') is not null and not exists (select 1 from public.proposals where id = (a->>'p_prop')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      perform public.link_job_proposal(v_id, (a->>'p_prop')::uuid); v_res := 'null'::jsonb;
    else raise exception 'DFT_BAD_FN';
    end if;
    v_res := jsonb_build_object('result', v_res, 'job', (select to_jsonb(j) from public.jobs j where j.id = v_id));
  else
    raise exception 'DFT_BAD_OP';
  end if;

  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  perform set_config('techlog.dft', '', true); perform set_config('techlog.test_owner', '', true);
  return jsonb_build_object('ok', true, 'data', v_res);
end $$;
revoke all on function public.dft_exec(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dft_exec(uuid, uuid, text, jsonb) to service_role;

update public.org_settings set docflow_v = 6 where id = 'org' and docflow_v < 6;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='repairs' and column_name='is_test') then miss := miss || ' repairs.is_test'; end if;
  if position('rep_create' in pg_get_functiondef('public.dft_exec(uuid,uuid,text,jsonb)'::regprocedure)) = 0 then miss := miss || ' dft_exec(rep_create)'; end if;
  if position('prop_adopt' in pg_get_functiondef('public.dft_exec(uuid,uuid,text,jsonb)'::regprocedure)) = 0 then miss := miss || ' dft_exec(prop_adopt)'; end if;
  if has_function_privilege('authenticated', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute') then miss := miss || ' dft_exec(ДОСТУПНА КЛИЕНТУ!)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.30 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.30 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;

-- ▄▄▄▄▄▄▄▄▄▄ ДЕЛЬТА · update-to-1_09_31 (пропозал без «отправки клиенту», пуши в тесте, фото и PDF на Диск) ▄▄▄▄▄▄▄▄▄▄
-- =====================================================================
-- v1.09.31
--   · Пропозал клиенту не отправляется: статус «Отправлен» выключен, включает админ (org_settings.prop_send_on, по умолчанию выкл.).
--     Сервер не даёт перевести пропозал в «Отправлен», пока настройка выключена (PROP_SEND_OFF); уже отправленные остаются как есть.
--   · Тест документооборота: события тестовых документов теперь идут и в ленту, и ПУШЕМ (раньше пуш подавлялся) — ведущему тест,
--     а с галочкой «всем участникам» (jobs.test_wide) — всем обычным получателям. dft_pushes — что ушло в очередь пушей за прогон.
-- =====================================================================
alter table public.org_settings add column if not exists prop_send_on boolean not null default false;
alter table public.jobs add column if not exists test_wide boolean not null default false;

create or replace function public.proposals_send_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent')
     and not coalesce((select prop_send_on from public.org_settings where id = 'org'), false) then
    raise exception 'PROP_SEND_OFF';
  end if;
  return new;
end $$;
drop trigger if exists proposals_send_guard_tg on public.proposals;
create trigger proposals_send_guard_tg before insert or update on public.proposals
  for each row execute function public.proposals_send_guard();

create or replace function public.push_enqueue(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text default './')
returns void language plpgsql security definer set search_path = public as $$
declare v_prefs jsonb; v_owner text := nullif(coalesce(current_setting('techlog.test_owner', true), ''), '');
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  /* v1.09.31: событие ТЕСТОВОГО документа получает тот, кто ведёт тест (а с галочкой «всем участникам» — все обычные получатели).
     Дальше всё как у настоящего события: строка в ленте «Уведомления» И пуш по личным настройкам — тест проверяет доставку целиком. */
  if v_owner is not null and p_user::text <> v_owner and coalesce(current_setting('techlog.test_wide', true), '') <> '1' then return; end if;
  select push_prefs into v_prefs from public.profiles where id = p_user and not blocked;
  if not found then return; end if;                             -- нет профиля / заблокирован
  if p_kind <> 'chat' then
    insert into public.notices(user_id, kind, title, body, url, actor)
    values (p_user, p_kind, p_title, coalesce(p_body, ''), coalesce(p_url, './'), auth.uid());
  end if;
  if coalesce((coalesce(v_prefs, '{}'::jsonb)->>p_kind)::boolean, true) = false then return; end if;
  insert into public.push_queue(user_id, kind, title, body, url)
  values (p_user, p_kind, p_title, coalesce(p_body,''), coalesce(p_url,'./'));
end $$;

create or replace function public.jobs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text; v_url text; v_who text; r record; v_done boolean := false;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  perform set_config('techlog.test_owner', case when new.is_test then coalesce(new.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.27
  perform set_config('techlog.test_wide', case when new.is_test and coalesce(new.test_wide, false) then '1' else '' end, true);                                        -- v1.09.31
  v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
  v_url  := './?doc=job:' || new.id::text;
  if tg_op = 'INSERT' then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Новая задача', v_body, v_url);
    end if;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    return new;
  end if;
  select display_name into v_who from public.profiles where id = auth.uid();

  -- основной исполнитель сменился
  if new.technician_id is distinct from old.technician_id then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Задача передана вам', v_body, v_url);
    end if;
    if old.technician_id is not null and not (coalesce(new.helper_ids, '[]'::jsonb) ? old.technician_id::text) then
      perform public.push_enqueue(old.technician_id, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
    end if;
    v_done := true;
  end if;
  -- состав бригады
  if new.helper_ids is distinct from old.helper_ids then
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
              where not (coalesce(old.helper_ids, '[]'::jsonb) ? value) and value::uuid is distinct from old.technician_id
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас добавили в бригаду', v_body, v_url);
      end if;
    end loop;
    for r in select value::uuid as uid from jsonb_array_elements_text(coalesce(old.helper_ids, '[]'::jsonb))
              where not (coalesce(new.helper_ids, '[]'::jsonb) ? value)
    loop
      if r.uid is distinct from new.technician_id then
        perform public.push_enqueue(r.uid, 'job', 'Вас сняли с задачи', v_body || ' · ' || coalesce(v_who, ''), './');
      end if;
    end loop;
    v_done := true;
  end if;

  -- статусы
  if old.status is distinct from 'approved' and new.status = 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Инвойс апрувлен',
        v_body || ' · $' || round(coalesce(new.approved_total, new.total, 0)), v_url);
    end loop;
    return new;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    for r in select distinct x.uid from (select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
    loop
      perform public.push_enqueue(r.uid, 'reset',
        case when new.status = 'draft' then 'Апрув снят — документ в черновике' else 'Апрув снят с инвойса' end,
        v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
    end loop;
    return new;
  elsif old.status = 'done' and new.status = 'draft' then
    /* v1.09.26: вернуть на доработку может только согласующий; все остальные (основной, менеджер без права апрува,
       помощник с правом правки) документ ОТЗЫВАЮТ — об этом узнают согласующие и остальная бригада */
    if public.can_approve_docs() and auth.uid() is distinct from new.technician_id then
      for r in select distinct x.uid from (select new.technician_id as uid
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Возвращён на доработку',
          v_body || ' · ' || coalesce(v_who, '') || coalesce(' · ' || nullif(new.return_note, ''), ''), v_url);
      end loop;
    else
      for r in select distinct x.uid from (
                 select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
                 union select new.technician_id
                 union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x where x.uid is not null
      loop
        perform public.push_enqueue(r.uid, 'reset', 'Документ отозван из согласования', v_body || ' · ' || coalesce(v_who, ''), v_url);
      end loop;
    end if;
    return new;
  elsif old.status = 'draft' and new.status = 'done' then
    for r in select id as uid from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and can_approve))
    loop
      perform public.push_enqueue(r.uid, 'approve', 'Ждёт апрува', v_body || ' · ' || coalesce(v_who, ''), v_url);
    end loop;
    return new;
  end if;
  if v_done then return new; end if;

  /* «Документ изменён»: содержимое поменял НЕ исполнитель (push_enqueue сам пропускает автора правки). Приложение шлёт
     строку целиком при любом сохранении — сравниваем только значимые поля; не чаще раза в 10 минут на документ и человека. */
  if auth.uid() is not null and (new.form_data is distinct from old.form_data or new.date is distinct from old.date
       or new.unit_number is distinct from old.unit_number or new.complex_id is distinct from old.complex_id
       or coalesce(new.note, '') is distinct from coalesce(old.note, '')) then
    for r in select distinct x.uid from (
               select new.technician_id as uid
               union select value::uuid from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))) x
              where x.uid is not null and x.uid <> auth.uid()
    loop
      if not exists (select 1 from public.notices where user_id = r.uid and kind = 'edit' and url = v_url and created_at > now() - interval '10 minutes') then
        perform public.push_enqueue(r.uid, 'edit',
          case when new.date is distinct from old.date then 'Задача перенесена на ' || to_char(new.date, 'DD.MM') else 'Документ изменён' end,
          v_body || ' · ' || coalesce(v_who, ''), v_url);
      end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.dft_exec(p_caller uuid, p_actor uuid, p_op text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_crole text; v_id uuid; v_job public.jobs%rowtype; v_pl public.placements%rowtype; v_rep public.repairs%rowtype; v_prop public.proposals%rowtype; v_res jsonb; v_n int := 0;
  v_run text := left(coalesce(p_args->>'run', ''), 60); v_fn text; a jsonb := coalesce(p_args->'args', '{}'::jsonb);
  v_patch jsonb := coalesce(p_args->'patch', '{}'::jsonb); v_row jsonb := coalesce(p_args->'row', '{}'::jsonb);
begin
  select role into v_crole from public.profiles where id = p_caller and not blocked;
  if v_crole is null then raise exception 'DFT_NO_CALLER'; end if;

  -- уборка работает и при выключенном режиме: остатки должны убираться всегда. Своё — любой, всё — только админ.
  if p_op = 'cleanup' then
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    perform set_config('techlog.test_owner', '00000000-0000-0000-0000-000000000000', true);
    for v_id in select id from public.jobs where is_test
                  and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
                  and (v_run = '' or test_run = v_run)
    loop
      delete from public.doc_locks where doc_id = v_id;
      delete from public.doc_requests where doc_id = v_id;
      delete from public.ext_requests where job_id = v_id;
      delete from public.notices where url like '%doc=job:' || v_id::text || '%';
      delete from public.placements where job_id = v_id;
      delete from public.jobs where id = v_id;
      v_n := v_n + 1;
    end loop;
    delete from public.repairs where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    delete from public.notices where url like '%doc=rep:%' and user_id = p_caller and body like '%DFTEST%';
    delete from public.proposals where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    perform set_config('techlog.test_owner', '', true);
    return jsonb_build_object('ok', true, 'deleted', v_n);
  end if;

  if not public.dft_enabled() then raise exception 'DFT_OFF'; end if;
  select role into v_role from public.profiles where id = p_actor and not blocked;
  if v_role is null then raise exception 'DFT_NO_ACTOR'; end if;

  -- с этого места все сторожа видят p_actor как вошедшего пользователя
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  perform set_config('techlog.dft', '1', true);

  if p_op in ('prop_adopt', 'rep_adopt') then
    /* v1.09.30: пропозал или ремонт, созданный КНОПКАМИ приложения, принимается в тест — условия те же, что у задачи:
       свой (created_by = вызывающий), черновик, создан не раньше 10 минут назад, юнит начинается с DFTEST */
    if p_op = 'prop_adopt' then
      select * into v_prop from public.proposals where id = (p_args->>'id')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
      if not v_prop.is_test then
        if v_prop.status <> 'draft' or v_prop.created_by is distinct from p_caller or v_prop.created_at < now() - interval '10 minutes'
           or coalesce(v_prop.unit_number, '') not like 'DFTEST%' or v_prop.archived_at is not null then raise exception 'DFT_ADOPT_DENIED'; end if;
        update public.proposals set is_test = true, test_owner = p_caller, test_run = v_run where id = v_prop.id;
      elsif v_prop.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
      select to_jsonb(x) into v_res from public.proposals x where x.id = v_prop.id;
    else
      select * into v_rep from public.repairs where id = (p_args->>'id')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
      if not v_rep.is_test then
        if v_rep.status <> 'draft' or v_rep.created_by is distinct from p_caller or v_rep.created_at < now() - interval '10 minutes'
           or coalesce(v_rep.unit_number, '') not like 'DFTEST%' or v_rep.archived_at is not null
           or (v_rep.job_id is not null and not exists (select 1 from public.jobs where id = v_rep.job_id and is_test)) then raise exception 'DFT_ADOPT_DENIED'; end if;
        perform set_config('techlog.dft', '1', true);
        update public.repairs set is_test = true, test_owner = p_caller, test_run = v_run where id = v_rep.id;
        perform set_config('techlog.dft', '', true);
      elsif v_rep.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
      select to_jsonb(x) into v_res from public.repairs x where x.id = v_rep.id;
    end if;
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_adopt' then
    /* v1.09.28: документ, который ведущий тест только что создал КНОПКОЙ «Добавить задание», становится тестовым. Условия жёсткие,
       чтобы пометить можно было только свой свежий черновик, который и так разрешено удалить: черновик, ни разу не отправлялся,
       создан не раньше 10 минут назад, юнит начинается с DFTEST, без пикапов; исполнитель — сам вызывающий (менеджеру и админу —
       ещё и «без исполнителя»). Настоящий рабочий документ под эти условия не попадает. */
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_job.is_test then
      if v_job.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    else
      if v_job.status <> 'draft' or v_job.numbered_at is not null or v_job.archived_at is not null
         or v_job.created_at < now() - interval '10 minutes' or coalesce(v_job.unit_number, '') not like 'DFTEST%'
         or exists (select 1 from public.placements where job_id = v_job.id)
         or not (v_job.technician_id = p_caller or (v_job.technician_id is null and v_crole in ('admin','manager'))) then
        raise exception 'DFT_ADOPT_DENIED';
      end if;
      perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
      perform set_config('techlog.sysupd', '1', true);
      update public.jobs set is_test = true, test_owner = p_caller, test_run = v_run, test_wide = coalesce((p_args->>'wide')::boolean, false) where id = v_job.id;
      perform set_config('techlog.sysupd', '', true);
      delete from public.push_queue where url like '%doc=job:' || v_job.id::text || '%' and sent_at is null;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;
    perform set_config('techlog.dft', '', true);
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_create' then
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_ins
    insert into public.jobs (id, date, counterparty_id, complex_id, unit_number, work_type_id, technician_id, technician_name, helper_ids,
                             shared_with_helpers, status, note, note_en, form_data, total, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'work_type_id')::uuid, (v_row->>'technician_id')::uuid, coalesce(v_row->>'technician_name', ''),
            coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce((v_row->>'shared_with_helpers')::boolean, false), coalesce(v_row->>'status', 'draft'),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce(v_row->'form_data', '{}'::jsonb), coalesce((v_row->>'total')::numeric, 0),
            true, p_caller, v_run)
    returning id into v_id;
    if coalesce((p_args->>'wide')::boolean, false) then perform set_config('techlog.sysupd', '1', true); update public.jobs set test_wide = true where id = v_id; perform set_config('techlog.sysupd', '', true); end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_id;

  elsif p_op in ('job_update', 'job_get') then
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;                       -- настоящий документ функция не трогает никогда
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'job_update' then
      if not (v_job.technician_id = p_actor or v_role in ('admin','manager') or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_upd
      update public.jobs j set (date, unit_number, complex_id, counterparty_id, work_type_id, technician_id, technician_name, helper_ids, shared_with_helpers,
                               priority, sort_order, status, note, note_en, form_data, total, approved_total, approved_by, approved_at, return_note,
                               archived_at, archived_by, arch_note, proposal_id, has_proposal, rev, updated_dev)
        = (select r.date, r.unit_number, r.complex_id, r.counterparty_id, r.work_type_id, r.technician_id, r.technician_name, r.helper_ids, r.shared_with_helpers,
                  r.priority, r.sort_order, r.status, r.note, r.note_en, r.form_data, r.total, r.approved_total, r.approved_by, r.approved_at, r.return_note,
                  r.archived_at, r.archived_by, r.arch_note, r.proposal_id, r.has_proposal, r.rev, r.updated_dev
             from jsonb_populate_record(j, v_patch) r)
       where j.id = v_job.id;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;

  elsif p_op = 'pl_upsert' then
    select * into v_job from public.jobs where id = (v_row->>'job_id')::uuid;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;
    select * into v_pl from public.placements where id = (v_row->>'id')::uuid;
    if found then
      update public.placements p set (qty, days, due_date, picked_up, picked_up_at, picked_up_by, returned_at, returned_by, superseded, superseded_at,
                                      archived_at, archived_by, arch_note, note, note_en, technician_id)
        = (select r.qty, r.days, r.due_date, r.picked_up, r.picked_up_at, r.picked_up_by, r.returned_at, r.returned_by, r.superseded, r.superseded_at,
                  r.archived_at, r.archived_by, r.arch_note, r.note, r.note_en, r.technician_id from jsonb_populate_record(p, v_row) r)
       where p.id = v_pl.id;
    else
      insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number, ext_of, note, note_en, no)
      values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_job.id, (v_row->>'equipment_type_id')::uuid, coalesce((v_row->>'qty')::int, 1), coalesce((v_row->>'days')::int, 1),
              coalesce((v_row->>'placed_date')::date, current_date), coalesce((v_row->>'due_date')::date, current_date + 1), (v_row->>'technician_id')::uuid,
              coalesce((v_row->>'complex_id')::uuid, v_job.complex_id), coalesce((v_row->>'counterparty_id')::uuid, v_job.counterparty_id), coalesce(v_row->>'unit_number', v_job.unit_number),
              (v_row->>'ext_of')::uuid, coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), 90000000 + nextval('public.jobs_test_no_seq'))   -- номер тестового пикапа — тоже из своего диапазона
      returning id into v_id;
    end if;
    select to_jsonb(p) into v_res from public.placements p where p.id = coalesce(v_pl.id, v_id);

  elsif p_op = 'prop_create' then
    if v_role not in ('admin','manager') then raise exception 'RLS_DENIED'; end if;                  -- как политика prop_ins
    insert into public.proposals (id, no, date, counterparty_id, complex_id, unit_number, note, items, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date),
            (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid, coalesce(v_row->>'unit_number', 'DFTEST'), coalesce(v_row->>'note', ''),
            coalesce(v_row->'items', '[]'::jsonb), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.proposals x where x.id = v_id;

  elsif p_op = 'rep_create' then
    if (v_row->>'created_by') is not null and (v_row->>'created_by')::uuid is distinct from p_actor then raise exception 'RLS_DENIED'; end if;   -- как политика rep_ins
    if (v_row->>'job_id') is not null and not exists (select 1 from public.jobs where id = (v_row->>'job_id')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
    insert into public.repairs (id, no, date, counterparty_id, complex_id, unit_number, job_id, helper_ids, items, materials, note, note_en, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'job_id')::uuid, coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce(v_row->'items', '[]'::jsonb), coalesce(v_row->'materials', '[]'::jsonb),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.repairs x where x.id = v_id;

  elsif p_op in ('rep_update', 'rep_get') then
    select * into v_rep from public.repairs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_rep.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_rep.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'rep_update' then
      if not (v_role in ('admin','manager') or v_rep.created_by = p_actor) then raise exception 'RLS_DENIED'; end if;                  -- как политика rep_upd
      update public.repairs x set (date, unit_number, items, materials, note, note_en, total, status, decline_reason, decided_by, decided_at, hist, helper_ids, job_id, archived_at, arch_note)
        = (select r.date, r.unit_number, r.items, r.materials, r.note, r.note_en, r.total, r.status, r.decline_reason, r.decided_by, r.decided_at, r.hist, r.helper_ids, r.job_id, r.archived_at, r.arch_note
             from jsonb_populate_record(x, v_patch) r)
       where x.id = v_rep.id;
    end if;
    select to_jsonb(x) into v_res from public.repairs x where x.id = v_rep.id;

  elsif p_op = 'rpc' then
    v_fn := p_args->>'fn';
    -- цель любой функции — тестовый документ этого прогона
    v_id := coalesce((a->>'p_job')::uuid, case when v_fn = 'doc_request_decide' then (select doc_id from public.doc_requests where id = (a->>'p_id')::uuid)
                                               when v_fn = 'decide_ext_request' then (select job_id from public.ext_requests where id = (a->>'p_id')::uuid)
                                               when v_fn in ('doc_lock','doc_unlock') then (a->>'p_id')::uuid end);
    select * into v_job from public.jobs where id = v_id;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if v_fn = 'approve_job' then perform public.approve_job(v_id, (a->>'p_total')::numeric); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_request_edit' then v_res := to_jsonb(public.doc_request_edit(v_id, a->>'p_reason'));
    elsif v_fn = 'doc_request_decide' then perform public.doc_request_decide((a->>'p_id')::uuid, (a->>'p_grant')::boolean, a->>'p_answer'); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_lock' then v_res := public.doc_lock('job', v_id, coalesce((a->>'p_force')::boolean, false));
    elsif v_fn = 'doc_unlock' then perform public.doc_unlock('job', v_id); v_res := 'null'::jsonb;
    elsif v_fn = 'decide_ext_request' then perform public.decide_ext_request((a->>'p_id')::uuid, (a->>'p_ok')::boolean); v_res := 'null'::jsonb;
    elsif v_fn = 'job_fix_no' then v_res := to_jsonb(public.job_fix_no(v_id, a->>'p_text'));
    elsif v_fn = 'link_job_proposal' then
      if (a->>'p_prop') is not null and not exists (select 1 from public.proposals where id = (a->>'p_prop')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      perform public.link_job_proposal(v_id, (a->>'p_prop')::uuid); v_res := 'null'::jsonb;
    else raise exception 'DFT_BAD_FN';
    end if;
    v_res := jsonb_build_object('result', v_res, 'job', (select to_jsonb(j) from public.jobs j where j.id = v_id));
  else
    raise exception 'DFT_BAD_OP';
  end if;

  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  perform set_config('techlog.dft', '', true); perform set_config('techlog.test_owner', '', true);
  return jsonb_build_object('ok', true, 'data', v_res);
end $$;

-- что ушло в очередь пушей по тестовым документам вызывающего (для отчёта теста); только service_role
create or replace function public.dft_pushes(p_caller uuid, p_run text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('title', q.title, 'to', (select display_name from public.profiles where id = q.user_id), 'kind', q.kind,
                                               'created_at', q.created_at, 'sent_at', q.sent_at, 'tries', q.tries, 'err', q.last_err) order by q.created_at), '[]'::jsonb)
    from public.push_queue q
   where exists (select 1 from public.jobs j where j.is_test and j.test_owner = p_caller and (coalesce(p_run, '') = '' or j.test_run = p_run)
                   and q.url like '%' || j.id::text || '%')
$$;
revoke all on function public.dft_pushes(uuid, text) from public, anon, authenticated;
grant execute on function public.dft_pushes(uuid, text) to service_role;

update public.org_settings set docflow_v = 7 where id = 'org' and docflow_v < 7;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='prop_send_on') then miss := miss || ' org_settings.prop_send_on'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs' and column_name='test_wide') then miss := miss || ' jobs.test_wide'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'proposals_send_guard_tg') then miss := miss || ' proposals_send_guard_tg'; end if;
  if to_regprocedure('public.dft_pushes(uuid,text)') is null then miss := miss || ' dft_pushes()'; end if;
  if has_function_privilege('authenticated', 'public.dft_pushes(uuid,text)', 'execute') then miss := miss || ' dft_pushes(ДОСТУПНА КЛИЕНТУ!)'; end if;
  if position('test_wide' in pg_get_functiondef('public.push_enqueue(uuid,text,text,text,text)'::regprocedure)) = 0 then miss := miss || ' push_enqueue(test_wide)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.31 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.31 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
