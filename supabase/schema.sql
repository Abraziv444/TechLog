-- =====================================================================
-- TechLog v1.01.01 — схема Supabase
-- Выполните целиком в Supabase → SQL Editor → New query → Run
-- =====================================================================

-- pgcrypto не обязателен: uuid и sha256 берём из встроенных функций Postgres
-- (gen_random_uuid и sha256 доступны в PG13+/PG11+ без расширений)

-- ---------------------------------------------------------------------
-- ПРОФИЛИ (роль: admin | manager | tech)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login text not null,
  display_name text not null,
  role text not null default 'tech' check (role in ('admin','manager','tech')),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_login_ux on public.profiles (lower(login));

-- ---------------------------------------------------------------------
-- СЕКРЕТЫ ПРИЛОЖЕНИЯ (код приглашения хранится ТОЛЬКО как sha256-хэш)
-- RLS включён без политик: читают лишь security definer функции.
-- ---------------------------------------------------------------------
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- хэш кода приглашения по умолчанию (сам код в файлах проекта не хранится).
-- Сменить код: update public.app_secrets
--   set value = encode(sha256(convert_to('НОВЫЙ_КОД','UTF8')),'hex') where key='invite';
-- do nothing: повторный запуск схемы НЕ сбрасывает уже изменённый вами код
insert into public.app_secrets (key, value)
values ('invite', 'a43915481c3b48d871d73fb0396701d3626c2cc5e5d1a95ec17e067cc8d3d7fe')
on conflict (key) do nothing;

create or replace function public.is_valid_invite(code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_secrets
    where key = 'invite'
      and value = encode(sha256(convert_to(coalesce(code,''), 'UTF8')), 'hex')
  )
$$;

-- Публичная предпроверка кода (для дружелюбной ошибки в форме регистрации)
create or replace function public.check_invite(code text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_valid_invite(code)
$$;
grant execute on function public.check_invite(text) to anon, authenticated;

-- Живая проверка «логин свободен?» для формы регистрации.
-- Раскрывает занятость логинов; для внутреннего инструмента с кодом приглашения это приемлемо.
create or replace function public.login_available(p_login text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles where lower(login) = lower(coalesce(p_login,''))
  )
$$;
grant execute on function public.login_available(text) to anon, authenticated;

-- Полная предпроверка регистрации: возвращает точную причину отказа
-- ('OK' | 'BAD_LOGIN' | 'BAD_INVITE' | 'LOGIN_TAKEN') — те же коды бросает и триггер.
create or replace function public.signup_precheck(p_login text, p_invite text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v text := lower(coalesce(p_login,''));
begin
  if v !~ '^[a-z0-9_.-]{3,32}$' then return 'BAD_LOGIN'; end if;
  if not public.is_valid_invite(p_invite) then return 'BAD_INVITE'; end if;
  if exists (select 1 from public.profiles where lower(login) = v) then return 'LOGIN_TAKEN'; end if;
  return 'OK';
end $$;
grant execute on function public.signup_precheck(text, text) to anon, authenticated;

-- авто-создание профиля при регистрации + серверная проверка кода приглашения.
-- Клиент шлёт login и invite в user_metadata; email формируется как login@<AUTH_EMAIL_DOMAIN из config.js>
-- (по умолчанию login@techlog.example.com — домен зарезервирован IANA, писем на нём не бывает).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_login text;
begin
  if not public.is_valid_invite(new.raw_user_meta_data->>'invite') then
    raise exception 'BAD_INVITE';
  end if;
  v_login := lower(coalesce(new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)));
  if v_login !~ '^[a-z0-9_.-]{3,32}$' then
    raise exception 'BAD_LOGIN';
  end if;
  if exists (select 1 from public.profiles where lower(login) = v_login) then
    raise exception 'LOGIN_TAKEN';
  end if;
  begin
    insert into public.profiles (id, login, display_name, role)
    values (new.id, v_login,
            coalesce(new.raw_user_meta_data->>'display_name', v_login), 'tech');
  exception
    when unique_violation then raise exception 'LOGIN_TAKEN';
    when others then raise exception 'PROFILE_CREATE_FAILED: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- роль текущего пользователя
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- СПРАВОЧНИКИ
-- ---------------------------------------------------------------------
create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbr text default '',
  notes text default ''
);

create table if not exists public.complexes (
  id uuid primary key default gen_random_uuid(),
  counterparty_id uuid not null references public.counterparties(id) on delete cascade,
  name text not null,
  abbr text default '',
  address text default '',
  access_code text default '',
  lat double precision,
  lng double precision
);

create table if not exists public.aux_equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists public.work_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#58CC02',
  needs_aux boolean not null default false,
  aux_ids jsonb not null default '[]'::jsonb,
  sort int not null default 0
);

create table if not exists public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbr text not null,
  color text not null default '#1CB0F6',
  price_key text not null,
  sort int not null default 0
);

create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  unit_label text default '',
  price numeric not null default 0,
  sort int not null default 0
);

create table if not exists public.counterparty_prices (
  id uuid primary key default gen_random_uuid(),
  counterparty_id uuid not null references public.counterparties(id) on delete cascade,
  key text not null,
  custom boolean not null default false,
  price numeric not null default 0,
  unique (counterparty_id, key)
);

create table if not exists public.org_settings (
  id text primary key default 'org',
  invoice_title text default 'INVOICE #CC',
  header_city text default 'ATLANTA',
  assoc_line text default 'atlanta apartment association',
  addr1 text default 'PO BOX 920482',
  addr2 text default 'NORCROSS,',
  addr3 text default 'GA 30010',
  company_name text default 'Atlanta Global Renovations, LLC',
  company_short text default 'AGR, LLC'
);

-- ---------------------------------------------------------------------
-- ВИДИМОСТЬ ДЛЯ МЕНЕДЖЕРОВ: запись = сотрудник СКРЫТ от менеджера
-- ---------------------------------------------------------------------
create table if not exists public.hidden_staff (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  tech_id uuid not null references public.profiles(id) on delete cascade,
  unique (manager_id, tech_id)
);

-- ---------------------------------------------------------------------
-- РАБОТЫ (1 работа = 1 юнит в апарт-комплексе = 1 PDF-инвойс)
-- ---------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  complex_id uuid references public.complexes(id) on delete set null,
  unit_number text default '',
  work_type_id uuid references public.work_types(id) on delete set null,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  technician_name text default '',
  helper_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','done','approved')),
  note text not null default '',
  form_data jsonb not null default '{}'::jsonb,
  total numeric not null default 0,
  approved_total numeric,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_date_idx on public.jobs(date);
create index if not exists jobs_tech_idx on public.jobs(technician_id);

-- сброс апрува, если НЕ-админ изменил итоговую стоимость
create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if old.status = 'approved'
     and coalesce(public.my_role(),'tech') <> 'admin'
     and new.total is distinct from old.total then
    new.status := 'done';
    new.approved_total := null;
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;
drop trigger if exists jobs_guard_tg on public.jobs;
create trigger jobs_guard_tg before update on public.jobs
  for each row execute function public.jobs_guard();

-- ---------------------------------------------------------------------
-- РАЗМЕЩЕНИЯ ОБОРУДОВАНИЯ (пикапы: due = дата работы + дни, по умолч. 3 = 72ч)
-- ---------------------------------------------------------------------
create table if not exists public.placements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  qty int not null default 1,
  days int not null default 3,
  placed_date date not null default current_date,
  due_date date not null,
  picked_up boolean not null default false,
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles(id) on delete set null,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  complex_id uuid references public.complexes(id) on delete set null,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  unit_number text default ''
);
create index if not exists placements_due_idx on public.placements(due_date, picked_up);
create index if not exists placements_tech_idx on public.placements(technician_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.counterparties      enable row level security;
alter table public.complexes           enable row level security;
alter table public.aux_equipment       enable row level security;
alter table public.work_types          enable row level security;
alter table public.equipment_types     enable row level security;
alter table public.price_list          enable row level security;
alter table public.counterparty_prices enable row level security;
alter table public.org_settings        enable row level security;
alter table public.hidden_staff        enable row level security;
alter table public.jobs                enable row level security;
alter table public.placements          enable row level security;

-- профили: читать всем вошедшим, править себя (админ — всех)
drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated using (true);
drop policy if exists profiles_ins on public.profiles;
create policy profiles_ins on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_upd on public.profiles;
create policy profiles_upd on public.profiles for update to authenticated
  using (id = auth.uid() or public.my_role() = 'admin')
  with check (id = auth.uid() or public.my_role() = 'admin');

-- справочники: читают все, пишет админ
do $$
declare tb text;
begin
  foreach tb in array array['counterparties','aux_equipment','work_types','equipment_types','price_list','counterparty_prices','org_settings']
  loop
    execute format('drop policy if exists %I_sel on public.%I', tb, tb);
    execute format('create policy %I_sel on public.%I for select to authenticated using (true)', tb, tb);
    execute format('drop policy if exists %I_wr on public.%I', tb, tb);
    execute format('create policy %I_wr on public.%I for all to authenticated using (public.my_role() = ''admin'') with check (public.my_role() = ''admin'')', tb, tb);
  end loop;
end $$;

-- скрытые сотрудники: менеджер читает свои строки, админ — всё; пишет только админ
drop policy if exists hs_sel on public.hidden_staff;
create policy hs_sel on public.hidden_staff for select to authenticated
  using (manager_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists hs_wr on public.hidden_staff;
create policy hs_wr on public.hidden_staff for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- комплексы: читают все, пишут админ и менеджер
drop policy if exists complexes_sel on public.complexes;
create policy complexes_sel on public.complexes for select to authenticated using (true);
drop policy if exists complexes_wr on public.complexes;
create policy complexes_wr on public.complexes for all to authenticated
  using (public.my_role() in ('admin','manager'))
  with check (public.my_role() in ('admin','manager'));

-- работы: сотрудник видит/правит только свои; менеджер видит все; админ — всё
drop policy if exists jobs_sel on public.jobs;
create policy jobs_sel on public.jobs for select to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager'));
drop policy if exists jobs_ins on public.jobs;
create policy jobs_ins on public.jobs for insert to authenticated
  with check (technician_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists jobs_upd on public.jobs;
create policy jobs_upd on public.jobs for update to authenticated
  using (technician_id = auth.uid() or public.my_role() = 'admin')
  with check (technician_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists jobs_del on public.jobs;
create policy jobs_del on public.jobs for delete to authenticated
  using (technician_id = auth.uid() or public.my_role() = 'admin');

-- размещения/пикапы: сотрудник — свои; менеджер и админ — все
drop policy if exists pl_sel on public.placements;
create policy pl_sel on public.placements for select to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager'));
drop policy if exists pl_ins on public.placements;
create policy pl_ins on public.placements for insert to authenticated
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager'));
drop policy if exists pl_upd on public.placements;
create policy pl_upd on public.placements for update to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager'))
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager'));
drop policy if exists pl_del on public.placements;
create policy pl_del on public.placements for delete to authenticated
  using (technician_id = auth.uid() or public.my_role() = 'admin');

-- =====================================================================
-- СИД-ДАННЫЕ
-- =====================================================================
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;

-- доп. оборудование
insert into public.aux_equipment (id, name) values
 ('a0000000-0000-4000-8000-000000000001','Портативный моющий пылесос / Portable carpet extractor'),
 ('a0000000-0000-4000-8000-000000000002','Эйрдак-машина / Air duct machine'),
 ('a0000000-0000-4000-8000-000000000003','Портативная откачка воды / Portable water extraction'),
 ('a0000000-0000-4000-8000-000000000004','Озон-машина / Ozone machine')
on conflict (id) do nothing;

-- виды работ (цвета по ТЗ)
insert into public.work_types (id, name, color, needs_aux, aux_ids, sort) values
 ('b0000000-0000-4000-8000-000000000001','VETVAG (water extraction)','#58CC02',true,'["a0000000-0000-4000-8000-000000000003"]',1),
 ('b0000000-0000-4000-8000-000000000002','DAMAGE WATER','#2EC4B6',true,'["a0000000-0000-4000-8000-000000000003"]',2),
 ('b0000000-0000-4000-8000-000000000003','STEAM CLEAN','#FF9600',true,'["a0000000-0000-4000-8000-000000000001"]',3),
 ('b0000000-0000-4000-8000-000000000004','AIR DUCT','#FF4B4B',true,'["a0000000-0000-4000-8000-000000000002"]',4),
 ('b0000000-0000-4000-8000-000000000005','DEMOLITION (walls/cabinets)','#1CB0F6',false,'[]',5),
 ('b0000000-0000-4000-8000-000000000006','PROPOSAL (approved earlier)','#CE82FF',false,'[]',6)
on conflict (id) do nothing;

-- типы оборудования для аренды/пикапов (цвета по ТЗ)
insert into public.equipment_types (id, name, abbr, color, price_key, sort) values
 ('c0000000-0000-4000-8000-000000000001','Air Scrubber','SCR','#FF4B4B','eq_scr',1),
 ('c0000000-0000-4000-8000-000000000002','Blower','BLW','#58CC02','eq_blw',2),
 ('c0000000-0000-4000-8000-000000000003','Dehumidifier','DHM','#1CB0F6','eq_dhm',3),
 ('c0000000-0000-4000-8000-000000000004','Ozone Machine','OZN','#111827','eq_ozn',4)
on conflict (id) do nothing;

-- стандартный прейскурант (вкладка PRICE)
insert into public.price_list (key, name, unit_label, price, sort) values
 ('steam_deep_scrub','Steam Clean — Deep Scrub','per room',35,0),
 ('steam_rotovac','Steam Clean — Rotovac','per room',45,1),
 ('rem_red_stain','Removal — Red Stain','flat',25,2),
 ('rem_wax','Removal — Wax','flat',25,3),
 ('rem_rust','Removal — Rust','flat',25,4),
 ('rem_ink','Removal — Ink','flat',25,5),
 ('rem_gum','Removal — Gum','flat',15,6),
 ('rem_paint','Removal — Paint','flat',25,7),
 ('rep_threshold','Repair — Threshold','flat',20,8),
 ('rep_stretch','Repair — Stretch','flat',45,9),
 ('rep_seam','Repair — Seam','flat',35,10),
 ('rep_patch','Repair — Patch','flat',35,11),
 ('dye_spot','Dye — Spot Dye','flat',45,12),
 ('dye_full','Dye — Full Dye','flat',150,13),
 ('oth_trash_out','Other — Trash Out','flat',50,14),
 ('oth_pad_removal_room','Other — Pad Removal (room)','per room',30,15),
 ('oth_pad_removal_all','Other — Pad Removal (all unit)','flat',120,16),
 ('fog_pet','Fog/GOC — Pet','flat',45,17),
 ('fog_smoke','Fog/GOC — Smoke','flat',45,18),
 ('fog_deodorizer','Fog/GOC — Deodorizer','flat',25,19),
 ('tr_sealant','Treatment — Sealant','flat',45,20),
 ('tr_mold','Treatment — Mold & Mildew','flat',45,21),
 ('tr_degreaser','Treatment — Degreaser','flat',45,22),
 ('wv_area','Wet Vac / Flood — per area','per area',40,23),
 ('wv_all_unit','Wet Vac / Flood — All Unit','flat',180,24),
 ('wv_sewer_extra','Wet Vac — Sewer surcharge','flat',60,25),
 ('ad_per_bedroom','Air Duct Cleaning — per bedroom','per bedroom',50,26),
 ('ad_dryer_vent','Dryer Vent Cleaning','flat',80,27),
 ('pad_q14','Pad — 1/4 roll','flat',95,28),
 ('pad_q12','Pad — 1/2 roll','flat',180,29),
 ('pad_q34','Pad — 3/4 roll','flat',260,30),
 ('pad_roll','Pad — 1 Roll','flat',340,31),
 ('pad_install_room','Pad Installation (room)','per room',30,32),
 ('pad_install_all','Pad Installation (all unit)','flat',120,33),
 ('eq_blw','Equipment — Blower','per unit/day',30,34),
 ('eq_dhm','Equipment — Dehumidifier','per unit/day',60,35),
 ('eq_scr','Equipment — Air Scrubber','per unit/day',75,36),
 ('eq_ozn','Equipment — Ozone Machine','per unit/day',85,37)
on conflict (key) do nothing;

-- стартовые контрагенты и комплексы (координаты для карты; правьте под себя)
insert into public.counterparties (id, name, abbr) values
 ('d0000000-0000-4000-8000-000000000001','Magnolia Group','MG'),
 ('d0000000-0000-4000-8000-000000000002','Cascade Living','CL'),
 ('d0000000-0000-4000-8000-000000000003','Peachtree RE','PT')
on conflict (id) do nothing;

insert into public.complexes (id, counterparty_id, name, abbr, address, access_code, lat, lng) values
 ('e1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','Magnolia Vinings','MGV','3200 Cumberland Blvd SE, Atlanta, GA','#2461',33.8823,-84.4620),
 ('e1000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','Magnolia Creek','MGC','1180 Franklin Rd, Marietta, GA','#7730',33.9260,-84.5170),
 ('e1000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002','Cascade Falls','CSF','2890 Cascade Rd SW, Atlanta, GA','#1150',33.7223,-84.4790),
 ('e1000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000003','Peachtree Corners','PTC','5560 Peachtree Pkwy, Norcross, GA','#9042',33.9700,-84.2210)
on conflict (id) do nothing;

-- индивидуальные цены для стартовых контрагентов = копия стандартных
insert into public.counterparty_prices (counterparty_id, key, custom, price)
select c.id, p.key, false, p.price
from public.counterparties c cross join public.price_list p
on conflict (counterparty_id, key) do nothing;

-- =====================================================================
-- МИГРАЦИЯ С v1.01 (если схема уже была создана раньше) — безопасно повторять
-- =====================================================================
alter table public.complexes add column if not exists lat double precision;
alter table public.complexes add column if not exists lng double precision;
alter table public.jobs      add column if not exists note text not null default '';
alter table public.jobs      add column if not exists helper_ids jsonb not null default '[]'::jsonb;

-- =====================================================================
-- ПОСЛЕ СОЗДАНИЯ ПОЛЬЗОВАТЕЛЕЙ назначьте роли (пример):
--   update public.profiles set role = 'admin'   where login = 'admin@example.com';
--   update public.profiles set role = 'manager' where login = 'manager@example.com';
-- =====================================================================
