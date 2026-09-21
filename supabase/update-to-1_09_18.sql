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
