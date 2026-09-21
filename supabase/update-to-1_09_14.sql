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
