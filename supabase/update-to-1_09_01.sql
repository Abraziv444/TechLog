-- =====================================================================
-- TechLog · обновление до v1.09.01 — справочник «Трекеры Bouncie»
--  · Таблица bn_devices: приборы из аккаунта Bouncie. Пропавший из
--    Bouncie трекер НЕ удаляется — статус 'inactive' и дата ухода;
--    вернувшийся снова получает 'active'. Удаления нет ни политикой,
--    ни функцией.
--  · RPC bn_devices_sync(p_list jsonb) — сверка со списком /v1/vehicles
--    (Edge Function bouncie, ?vehicles=1). Только админ. Пустой список
--    статусы не трогает: сбой API не «гасит» весь автопарк.
--  · vehicles.imei — ссылка на bn_devices.imei (vehicles_imei_fk):
--    машине выбирают трекер из справочника, по нему она и видна на
--    карте. Уже привязанные IMEI переносятся в справочник заранее.
--  · vehicle_save: NO_DEVICE (трекера нет в справочнике),
--    DEVICE_INACTIVE (новая привязка неактивного), DEVICE_TAKEN
--    (трекер у другой машины).
-- Идемпотентно: можно запускать повторно. С нуля — full-install-1_09_01.sql.
-- Edge Functions: bouncie не менялась; backup — только список таблиц
-- (bn_devices попадает в SQL-бэкап), передеплой желателен.
-- =====================================================================

-- 1) Справочник трекеров --------------------------------------------------
create table if not exists public.bn_devices (
  id            uuid primary key default gen_random_uuid(),
  imei          text not null,
  vin           text,
  nickname      text not null default '',          -- имя прибора в Bouncie
  make          text not null default '',
  model         text not null default '',
  year          int,
  status        text not null default 'active',     -- active | inactive
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz,                         -- последняя сверка, где он был в Bouncie
  inactive_at   timestamptz,                         -- когда пропал из Bouncie (у активных null)
  checked_at    timestamptz,                         -- последняя сверка вообще (null — не сверялся)
  reported_at   timestamptz,                         -- stats.lastUpdated: выход трекера на связь
  lat           double precision,
  lng           double precision,
  address       text,
  odometer      numeric,
  constraint bn_devices_imei_uq unique (imei),
  constraint bn_devices_status_ck check (status in ('active','inactive'))
);

alter table public.bn_devices enable row level security;
drop policy if exists bn_devices_sel on public.bn_devices;
create policy bn_devices_sel on public.bn_devices for select to authenticated
  using (public.my_role() = 'admin');
-- insert/update — только через bn_devices_sync (security definer); delete нет вовсе

-- 2) Уже привязанные к машинам IMEI — в справочник (до первой сверки
--    считаются активными; сверка сама поправит статус)
update public.vehicles set imei = null where imei is not null and trim(imei) = '';
insert into public.bn_devices (imei, make, first_seen_at)
select distinct on (v.imei) v.imei, coalesce(v.make, ''), coalesce(v.created_at, now())
  from public.vehicles v
 where coalesce(v.imei, '') <> ''
 order by v.imei, v.created_at
on conflict (imei) do nothing;

-- 3) Машина ссылается на трекер из справочника
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_imei_fk') then
    alter table public.vehicles add constraint vehicles_imei_fk
      foreign key (imei) references public.bn_devices (imei) on update cascade;
  end if;
end $$;

-- 4) Разбор ответа Bouncie ------------------------------------------------
create or replace function public.bn_try_ts(p text)
returns timestamptz language plpgsql stable set search_path = public as $$
begin
  if coalesce(trim(p), '') = '' then return null; end if;
  return p::timestamptz;
exception when others then return null;
end $$;

-- элемент /v1/vehicles → строка справочника; IMEI — только цифры, дубли схлопываются
create or replace function public.bn_dev_norm(p_list jsonb)
returns table (imei text, vin text, nickname text, make text, model text, year int,
               reported_at timestamptz, lat double precision, lng double precision,
               address text, odometer numeric)
language sql stable set search_path = public as $$
  select distinct on (s.imei) s.*
    from (
      select regexp_replace(coalesce(x->>'imei', ''), '\D', '', 'g')                  as imei,
             nullif(left(upper(trim(coalesce(x->>'vin', ''))), 32), '')                as vin,
             left(trim(coalesce(x->>'nickName', x->>'nickname', '')), 80)               as nickname,
             left(trim(coalesce(x#>>'{model,make}', '')), 60)                           as make,
             left(trim(coalesce(x#>>'{model,name}', '')), 60)                           as model,
             case when coalesce(x#>>'{model,year}', '') ~ '^\d{4}$'
                  then (x#>>'{model,year}')::int end                                    as year,
             public.bn_try_ts(x#>>'{stats,lastUpdated}')                                as reported_at,
             case when jsonb_typeof(x#>'{stats,location,lat}') = 'number'
                  then (x#>>'{stats,location,lat}')::double precision end               as lat,
             case when jsonb_typeof(coalesce(x#>'{stats,location,lon}', x#>'{stats,location,lng}')) = 'number'
                  then coalesce(x#>>'{stats,location,lon}', x#>>'{stats,location,lng}')::double precision end as lng,
             nullif(left(trim(coalesce(x#>>'{stats,location,address}', '')), 200), '')  as address,
             case when jsonb_typeof(x#>'{stats,odometer}') = 'number'
                  then (x#>>'{stats,odometer}')::numeric end                            as odometer
        from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]'::jsonb end) x
       where jsonb_typeof(x) = 'object'
    ) s
   where length(s.imei) between 8 and 20
   order by s.imei, s.reported_at desc nulls last;
$$;
revoke all on function public.bn_dev_norm(jsonb) from public, anon;

-- 5) Сверка справочника со списком Bouncie --------------------------------
-- Ответ: total (в списке Bouncie), added (новые), back (вернулись из
-- неактивных), off (стали неактивными), empty, active, inactive, at.
create or replace function public.bn_devices_sync(p_list jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_now   timestamptz := now();
  v_imeis text[];
  v_total int := 0; v_add int := 0; v_back int := 0; v_off int := 0;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_list is null or jsonb_typeof(p_list) <> 'array' then raise exception 'BAD_LIST'; end if;

  select coalesce(array_agg(n.imei), '{}') into v_imeis from public.bn_dev_norm(p_list) n;
  v_total := coalesce(array_length(v_imeis, 1), 0);

  select count(*) into v_add from unnest(v_imeis) i
   where not exists (select 1 from public.bn_devices d where d.imei = i);
  select count(*) into v_back from public.bn_devices d
   where d.status = 'inactive' and d.imei = any(v_imeis);

  insert into public.bn_devices as d (imei, vin, nickname, make, model, year, status,
         first_seen_at, last_seen_at, inactive_at, checked_at, reported_at, lat, lng, address, odometer)
  select n.imei, n.vin, n.nickname, n.make, n.model, n.year, 'active',
         v_now, v_now, null, v_now, n.reported_at, n.lat, n.lng, n.address, n.odometer
    from public.bn_dev_norm(p_list) n
  on conflict (imei) do update set
    vin          = coalesce(excluded.vin, d.vin),
    nickname     = excluded.nickname,
    make         = coalesce(nullif(excluded.make, ''), d.make),
    model        = coalesce(nullif(excluded.model, ''), d.model),
    year         = coalesce(excluded.year, d.year),
    status       = 'active',
    inactive_at  = null,
    last_seen_at = v_now,
    checked_at   = v_now,
    reported_at  = coalesce(excluded.reported_at, d.reported_at),
    lat          = coalesce(excluded.lat, d.lat),
    lng          = coalesce(excluded.lng, d.lng),
    address      = coalesce(excluded.address, d.address),
    odometer     = coalesce(excluded.odometer, d.odometer);

  -- пропавшие из Bouncie: не удаляем, а помечаем «неактивен» с датой
  if v_total > 0 then
    update public.bn_devices d set status = 'inactive', inactive_at = v_now, checked_at = v_now
     where d.status = 'active' and not (d.imei = any(v_imeis));
    get diagnostics v_off = row_count;
    update public.bn_devices d set checked_at = v_now where d.checked_at is distinct from v_now;
  end if;

  return jsonb_build_object(
    'total', v_total, 'added', v_add, 'back', v_back, 'off', v_off, 'empty', v_total = 0,
    'active',   (select count(*) from public.bn_devices where status = 'active'),
    'inactive', (select count(*) from public.bn_devices where status = 'inactive'),
    'at', v_now);
end $$;
revoke all on function public.bn_devices_sync(jsonb) from public, anon;
grant execute on function public.bn_devices_sync(jsonb) to authenticated;

-- 6) Запись машины: трекер — только из справочника --------------------------
-- Ошибки: FORBIDDEN / BAD_CAR_NO / CAR_NO_TAKEN / NOT_FOUND / NO_DEVICE /
-- DEVICE_INACTIVE / DEVICE_TAKEN. Уже стоящий у машины трекер, ставший
-- неактивным, правку остальных полей не блокирует.
create or replace function public.vehicle_save(
  p_id uuid, p_make text, p_vin text, p_imei text, p_car_no int, p_driver uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_imei text := nullif(regexp_replace(coalesce(p_imei, ''), '\D', '', 'g'), '');
  v_old_driver uuid;
  v_old_imei text;
  v_st text;
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
  select driver_id, imei into v_old_driver, v_old_imei from public.vehicles where id = v_id;

  -- v1.09.01: трекер выбирается из справочника «Трекеры Bouncie»
  if v_imei is not null then
    select status into v_st from public.bn_devices where imei = v_imei;
    if not found then raise exception 'NO_DEVICE'; end if;
    if v_st = 'inactive' and v_imei is distinct from v_old_imei then raise exception 'DEVICE_INACTIVE'; end if;
    if exists (select 1 from public.vehicles where imei = v_imei and id <> v_id)
       then raise exception 'DEVICE_TAKEN'; end if;
  end if;

  -- водитель уходит с другой машины (уникальность driver_id)
  if p_driver is not null then
    update public.vehicles set driver_id = null where driver_id = p_driver and id <> v_id;
  end if;

  insert into public.vehicles (id, make, vin, imei, car_no, driver_id)
  values (v_id, coalesce(trim(p_make), ''), nullif(trim(p_vin), ''), v_imei, p_car_no, p_driver)
  on conflict (id) do update
    set make = excluded.make, vin = excluded.vin, imei = excluded.imei,
        car_no = excluded.car_no, driver_id = excluded.driver_id;

  -- профили: у прежнего водителя номер снимаем, новому ставим номер машины
  if v_old_driver is not null and v_old_driver is distinct from p_driver then
    update public.profiles set car_no = null where id = v_old_driver;
  end if;
  if p_driver is not null then
    update public.profiles set car_no = null
      where car_no = p_car_no and id <> p_driver;          -- номер один на всех
    update public.profiles set car_no = p_car_no where id = p_driver;
  end if;
  return v_id;
end $$;
revoke all on function public.vehicle_save(uuid,text,text,text,int,uuid) from public, anon;
grant execute on function public.vehicle_save(uuid,text,text,text,int,uuid) to authenticated;

-- 7) Самопроверка ----------------------------------------------------------
do $$
declare miss text := '';
begin
  if to_regclass('public.bn_devices') is null then miss := miss || ' bn_devices'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bn_devices' and column_name='checked_at')
     then miss := miss || ' bn_devices.checked_at'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bn_devices' and policyname='bn_devices_sel')
     then miss := miss || ' bn_devices_sel'; end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_imei_fk')
     then miss := miss || ' vehicles_imei_fk'; end if;
  if to_regprocedure('public.bn_dev_norm(jsonb)') is null then miss := miss || ' bn_dev_norm'; end if;
  if to_regprocedure('public.bn_devices_sync(jsonb)') is null then miss := miss || ' bn_devices_sync'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт.', miss;
  else raise notice 'TechLog: схема соответствует v1.09.01 — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.01 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
