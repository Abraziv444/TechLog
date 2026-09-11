-- =====================================================================
-- TechLog · update-to-1_08_32.sql — GPS-трекинг Bouncie и справочник машин
-- ---------------------------------------------------------------------
-- Что делает файл (идемпотентно, можно выполнять повторно):
--   1) Справочник public.vehicles: марка, VIN, IMEI трекера, порядковый
--      номер 1–99, водитель (сотрудник). VIN и IMEI вводятся один раз и
--      дальше просто отображаются; секретов в этой таблице нет.
--   2) RPC public.vehicle_save(...) — единственный канал записи машины:
--      только админ; номер 1–99; номер и водитель уникальны; назначение
--      водителя синхронизирует profiles.car_no (им живёт регистр техники
--      «Моя машина №N»), у прежнего водителя номер снимается.
--   3) RPC public.admin_set_bouncie_config(id, secret) — ключи Bouncie
--      Developer Portal кладутся в app_secrets (RLS закрыт: браузер и
--      publishable-ключ их не видят; читает только Edge Function bouncie
--      сервисной ролью). Токены туда же пишет сама функция bouncie.
--   4) org_settings.bn_account / bn_checked_at — НЕсекретный статус
--      подключения для карточки настроек.
-- После SQL разверните Edge Function `bouncie`
-- (supabase/functions-dashboard/bouncie/ — index.ts + google.ts).
-- =====================================================================

-- 1) Справочник автомобилей --------------------------------------------
create table if not exists public.vehicles (
  id         uuid primary key default gen_random_uuid(),
  make       text not null default '',          -- марка/модель, свободный текст
  vin        text,                              -- VIN (17 знаков, храним как ввели)
  imei       text,                              -- IMEI трекера Bouncie (15 цифр)
  car_no     int,                               -- порядковый номер 1–99
  driver_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vehicles_car_no_ck check (car_no is null or car_no between 1 and 99)
);
create unique index if not exists vehicles_car_no_ux on public.vehicles (car_no) where car_no is not null;
create unique index if not exists vehicles_driver_ux on public.vehicles (driver_id) where driver_id is not null;
create unique index if not exists vehicles_imei_ux   on public.vehicles (imei) where coalesce(imei,'') <> '';
create unique index if not exists vehicles_vin_ux    on public.vehicles (upper(vin)) where coalesce(vin,'') <> '';

alter table public.vehicles enable row level security;
drop policy if exists vehicles_sel on public.vehicles;
create policy vehicles_sel on public.vehicles for select to authenticated using (true);
drop policy if exists vehicles_ins on public.vehicles;
create policy vehicles_ins on public.vehicles for insert to authenticated
  with check (public.my_role() = 'admin');
drop policy if exists vehicles_upd on public.vehicles;
create policy vehicles_upd on public.vehicles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists vehicles_del on public.vehicles;
create policy vehicles_del on public.vehicles for delete to authenticated
  using (public.my_role() = 'admin');

-- 2) Запись машины + синхронизация номера у водителя --------------------
-- Ошибки: FORBIDDEN / BAD_CAR_NO / CAR_NO_TAKEN / NOT_FOUND.
-- Водителя можно «перевесить» с другой машины: там он снимется сам.
-- Снятие/смена водителя обнуляет car_no у прежнего; назначение ставит
-- car_no машины её водителю (регистр техники продолжает жить номерами).
create or replace function public.vehicle_save(
  p_id uuid, p_make text, p_vin text, p_imei text, p_car_no int, p_driver uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
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

  -- водитель уходит с другой машины (уникальность driver_id)
  if p_driver is not null then
    update public.vehicles set driver_id = null where driver_id = p_driver and id <> v_id;
  end if;

  insert into public.vehicles (id, make, vin, imei, car_no, driver_id)
  values (v_id, coalesce(trim(p_make), ''), nullif(trim(p_vin), ''),
          nullif(regexp_replace(coalesce(p_imei, ''), '\D', '', 'g'), ''), p_car_no, p_driver)
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

-- 3) Ключи Bouncie — только в app_secrets, только админом ----------------
-- Пустая строка = «не менять» (как в admin_set_drive_config).
create or replace function public.admin_set_bouncie_config(
  p_client_id text, p_client_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_client_id), '') <> '' then
    insert into public.app_secrets(key, value) values ('bn_client_id', trim(p_client_id))
    on conflict (key) do update set value = excluded.value;
  end if;
  if coalesce(trim(p_client_secret), '') <> '' then
    insert into public.app_secrets(key, value) values ('bn_client_secret', trim(p_client_secret))
    on conflict (key) do update set value = excluded.value;
  end if;
end $$;
revoke all on function public.admin_set_bouncie_config(text,text) from public, anon;
grant execute on function public.admin_set_bouncie_config(text,text) to authenticated;

-- 4) Статус подключения (несекретный) в настройках организации -----------
alter table public.org_settings add column if not exists bn_account text;
alter table public.org_settings add column if not exists bn_checked_at timestamptz;

-- ---------------------------------------------------------------------
select 'TechLog: update-to-1_08_32 выполнен (машины + Bouncie).' as result;
