-- =====================================================================
-- TechLog v1.07.12 — схема Supabase
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
-- v1.07.06: БЛОКИРОВКА СОТРУДНИКОВ И СМЕНА ПАРОЛЯ АДМИНОМ
-- (для существующей базы достаточно выполнить только этот блок)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists board_cols int;  -- v1.07.49: личных колонок доски (ПК), NULL = авто
alter table public.complexes alter column counterparty_id drop not null;  -- v1.07.54: комплексы с карты могут быть без владельца

-- Админ блокирует/разблокирует сотрудника:
-- profiles.blocked (для интерфейса) + banned_until в auth.users (GoTrue не пустит
-- на уровне сервера) + завершение всех активных сессий заблокированного.
create or replace function public.admin_set_blocked(target uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if target = auth.uid() then raise exception 'SELF_BLOCK'; end if;
  update public.profiles set blocked = p_blocked where id = target;
  update auth.users
     set banned_until = case when p_blocked then 'infinity'::timestamptz else null end
   where id = target;
  if p_blocked then
    delete from auth.refresh_tokens where user_id = target::text;
    delete from auth.sessions where user_id = target;
  end if;
end $$;
revoke all on function public.admin_set_blocked(uuid, boolean) from public, anon;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

-- Админ задаёт сотруднику новый пароль (если тот его забыл).
-- Хэш bcrypt — тот же формат, что использует Supabase Auth (GoTrue).
-- Старые сессии сотрудника завершаются, вход только с новым паролем.
create extension if not exists pgcrypto with schema extensions;
create or replace function public.admin_set_password(target uuid, new_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(new_password,'')) < 6 then raise exception 'WEAK_PASSWORD'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
end $$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- v1.07.07: СОЗДАНИЕ СОТРУДНИКОВ АДМИНОМ + СМЕНА КОДА ПРИГЛАШЕНИЯ
-- (для существующей базы достаточно выполнить только этот блок)
-- ---------------------------------------------------------------------

-- Пересоздаём триггер регистрации: если пользователь создаётся функцией
-- admin_create_user (транзакционный флаг techlog.admin_create — клиент его
-- подделать не может, в отличие от user_metadata), профиль вставляет она сама.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_login text;
begin
  if current_setting('techlog.admin_create', true) = '1' then
    return new;                      -- создан админом из приложения
  end if;
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

-- Админ создаёт сотрудника: логин, пароль, имя, роль.
-- p_email клиент строит тем же loginToEmail(), что и при обычном входе,
-- поэтому вход у нового сотрудника гарантированно совпадёт с приложением.
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
  if length(coalesce(p_password,'')) < 6 then raise exception 'WEAK_PASSWORD'; end if;
  if p_role not in ('admin','manager','tech') then raise exception 'BAD_ROLE'; end if;
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
revoke all on function public.admin_create_user(text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text) to authenticated;

-- Админ задаёт новый код приглашения (общий для всех регистраций).
-- Хранится только sha256-хэш — показать текущий код нельзя, только заменить.
create or replace function public.admin_set_invite(new_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(new_code,''));
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if length(v) < 2 or length(v) > 64 then raise exception 'BAD_CODE'; end if;
  insert into public.app_secrets (key, value)
  values ('invite', encode(sha256(convert_to(v, 'UTF8')), 'hex'))
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.admin_set_invite(text) from public, anon;
grant execute on function public.admin_set_invite(text) to authenticated;

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
  counterparty_id uuid references public.counterparties(id) on delete cascade,  -- v1.07.54: NULL = комплекс без владельца (подсвечивается ⚠ в справочнике)
  name text not null,
  abbr text default '',
  address text default '',
  access_code text default '',
  callbox_code text default '',
  callbox_gate boolean not null default false,
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

-- виды размеров для доп. работ (длина ft, площадь sq ft, вес lb, штуки)
create table if not exists public.size_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default '',
  sort int not null default 0
);

-- доп. виды работ для шаблонов заметки (kind: work | purchase)
create table if not exists public.extra_works (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'work' check (kind in ('work','purchase')),
  needs_size boolean not null default false,
  size_type_id uuid references public.size_types(id) on delete set null,
  price numeric not null default 0,
  sort int not null default 0
);

-- виды товара для «покупки товара»
create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_price numeric not null default 0,
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
  company_name text default 'APC, LLC',
  company_short text default 'APC',
  allow_shared_jobs boolean not null default true  -- v1.07.10: выключатель общего доступа (галочка админа)
);

-- ---------------------------------------------------------------------
-- ЗАЯВКИ НА ИЗМЕНЕНИЕ КОДОВ ДОСТУПА (решение принимает админ)
-- ---------------------------------------------------------------------
create table if not exists public.code_requests (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.complexes(id) on delete cascade,
  access_code text,          -- null = это поле не меняем
  callbox_code text,
  callbox_gate boolean,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);
create index if not exists code_requests_status_idx on public.code_requests(status);

-- ---------------------------------------------------------------------
-- ИСТОРИЯ ИЗМЕНЕНИЙ КОДОВ (видна всем, пишет админ / апрув заявки)
-- ---------------------------------------------------------------------
create table if not exists public.complex_code_history (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.complexes(id) on delete cascade,
  field text not null check (field in ('access','callbox')),
  old_value text default '',
  new_value text default '',
  gate boolean,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  source text not null default 'direct' check (source in ('direct','request'))
);
create index if not exists cch_cx_idx on public.complex_code_history(complex_id, changed_at desc);

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
  shared_with_helpers boolean not null default false,  -- v1.07.10: общий доступ к документу для коворкеров
  priority boolean not null default false,
  sort_order int not null default 0,
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
  unit_number text default '',
  ext_of uuid references public.placements(id) on delete set null,  -- v1.07.12: продление аренды («второй пикап»)
  superseded boolean not null default false,                        -- v1.07.12: исходный пикап закрыт продлением
  superseded_at timestamptz
);
create index if not exists placements_due_idx on public.placements(due_date, picked_up);
create index if not exists placements_ext_idx on public.placements(ext_of);
create index if not exists placements_tech_idx on public.placements(technician_id);

-- =====================================================================
-- МИГРАЦИЯ (если схема уже создавалась раньше) — ВЫПОЛНЯЕТСЯ ДО СИДОВ,
-- чтобы insert-ы ниже видели новые колонки. Безопасно повторять.
-- =====================================================================
-- Смена организации по умолчанию AGR → APC (только если стоят старые значения)
update public.org_settings
   set company_name = 'APC, LLC', company_short = 'APC'
 where id = 'org' and company_short in ('AGR, LLC', 'AGR');
alter table public.complexes add column if not exists lat double precision;
alter table public.complexes add column if not exists lng double precision;
alter table public.jobs      add column if not exists note text not null default '';
alter table public.jobs      add column if not exists helper_ids jsonb not null default '[]'::jsonb;
alter table public.jobs      add column if not exists priority boolean not null default false;
alter table public.jobs      add column if not exists sort_order int not null default 0;
alter table public.complexes add column if not exists callbox_code text default '';
alter table public.complexes add column if not exists callbox_gate boolean not null default false;
alter table public.extra_works add column if not exists price numeric not null default 0;
-- v1.07.10: общий доступ к документам для коворкеров
alter table public.jobs         add column if not exists shared_with_helpers boolean not null default false;
alter table public.org_settings add column if not exists allow_shared_jobs   boolean not null default true;
-- v1.07.12: продление аренды оборудования
alter table public.placements add column if not exists ext_of uuid references public.placements(id) on delete set null;
alter table public.placements add column if not exists superseded boolean not null default false;
alter table public.placements add column if not exists superseded_at timestamptz;

-- ---------------------------------------------------------------------
-- v1.07.10: ОБЩИЙ ДОСТУП К ДОКУМЕНТАМ ДЛЯ КОВОРКЕРОВ
-- Автор ставит в работе галочку «Общий доступ к документу для коворкера» —
-- сотрудники из helper_ids видят и редактируют эту работу. Админ может
-- выключить функцию целиком (org_settings.allow_shared_jobs).
-- ---------------------------------------------------------------------
create or replace function public.shared_jobs_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select allow_shared_jobs from public.org_settings where id = 'org'), true)
$$;

-- Текущий пользователь — коворкер работы с включённым общим доступом?
-- security definer: читает jobs в обход RLS, чтобы политики placements
-- не зависели от политик jobs и не было рекурсии.
create or replace function public.is_shared_job_helper(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.shared_jobs_enabled()
     and exists (
       select 1 from public.jobs j
       where j.id = p_job
         and j.shared_with_helpers
         and j.helper_ids ? auth.uid()::text
     )
$$;


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
alter table public.code_requests       enable row level security;
alter table public.complex_code_history enable row level security;
alter table public.size_types          enable row level security;
alter table public.extra_works         enable row level security;
alter table public.product_types       enable row level security;
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
  foreach tb in array array['counterparties','aux_equipment','work_types','equipment_types','price_list','counterparty_prices','org_settings','size_types','extra_works','product_types']
  loop
    execute format('drop policy if exists %I_sel on public.%I', tb, tb);
    execute format('create policy %I_sel on public.%I for select to authenticated using (true)', tb, tb);
    execute format('drop policy if exists %I_wr on public.%I', tb, tb);
    execute format('create policy %I_wr on public.%I for all to authenticated using (public.my_role() = ''admin'') with check (public.my_role() = ''admin'')', tb, tb);
  end loop;
end $$;

-- заявки на коды: создаёт любой (от своего имени), видит автор и админ, решает админ
drop policy if exists cr_sel on public.code_requests;
create policy cr_sel on public.code_requests for select to authenticated
  using (requested_by = auth.uid() or public.my_role() = 'admin');
drop policy if exists cr_ins on public.code_requests;
create policy cr_ins on public.code_requests for insert to authenticated
  with check (requested_by = auth.uid());
drop policy if exists cr_upd on public.code_requests;
create policy cr_upd on public.code_requests for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists cr_del on public.code_requests;
create policy cr_del on public.code_requests for delete to authenticated
  using (public.my_role() = 'admin');

-- история кодов: читают все, пишет админ
drop policy if exists cch_sel on public.complex_code_history;
create policy cch_sel on public.complex_code_history for select to authenticated using (true);
drop policy if exists cch_wr on public.complex_code_history;
create policy cch_wr on public.complex_code_history for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

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

-- работы: сотрудник видит/правит свои и общие (где он коворкер и включён
-- общий доступ, v1.07.10); менеджер видит все; админ — всё
drop policy if exists jobs_sel on public.jobs;
create policy jobs_sel on public.jobs for select to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager')
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );
drop policy if exists jobs_ins on public.jobs;
create policy jobs_ins on public.jobs for insert to authenticated
  with check (technician_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists jobs_upd on public.jobs;
create policy jobs_upd on public.jobs for update to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() = 'admin'
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  )
  with check (
    technician_id = auth.uid()
    or public.my_role() = 'admin'
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );
drop policy if exists jobs_del on public.jobs;
create policy jobs_del on public.jobs for delete to authenticated
  using (technician_id = auth.uid() or public.my_role() = 'admin');

-- размещения/пикапы: сотрудник — свои и по общим работам (v1.07.10);
-- менеджер и админ — все
drop policy if exists pl_sel on public.placements;
create policy pl_sel on public.placements for select to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager')
         or public.is_shared_job_helper(job_id));
drop policy if exists pl_ins on public.placements;
create policy pl_ins on public.placements for insert to authenticated
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager')
              or public.is_shared_job_helper(job_id));
drop policy if exists pl_upd on public.placements;
create policy pl_upd on public.placements for update to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager')
         or public.is_shared_job_helper(job_id))
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager')
              or public.is_shared_job_helper(job_id));
drop policy if exists pl_del on public.placements;
create policy pl_del on public.placements for delete to authenticated
  using (technician_id = auth.uid() or public.my_role() = 'admin'
         or public.is_shared_job_helper(job_id));

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

-- виды размеров
insert into public.size_types (id, name, unit, sort) values
 ('c1000000-0000-4000-8000-000000000001','Длина / Length','ft',1),
 ('c1000000-0000-4000-8000-000000000002','Площадь / Area','sq ft',2),
 ('c1000000-0000-4000-8000-000000000003','Вес / Weight','lb',3),
 ('c1000000-0000-4000-8000-000000000004','Количество / Quantity','pcs',4)
on conflict (id) do nothing;

-- доп. виды работ (шаблоны заметки)
insert into public.extra_works (id, name, kind, needs_size, size_type_id, price, sort) values
 ('c2000000-0000-4000-8000-000000000001','Вырезка стен / Wall cutout','work',true,'c1000000-0000-4000-8000-000000000002',3,1),
 ('c2000000-0000-4000-8000-000000000002','Вырезка потолка / Ceiling cutout','work',true,'c1000000-0000-4000-8000-000000000002',4,2),
 ('c2000000-0000-4000-8000-000000000003','Покупка товара / Purchase','purchase',false,null,0,3)
on conflict (id) do nothing;

-- виды товара
insert into public.product_types (id, name, default_price, sort) values
 ('c3000000-0000-4000-8000-000000000001','Решётка / Vent grille',25,1),
 ('c3000000-0000-4000-8000-000000000002','Химия для ковра / Carpet chemicals',45,2)
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
-- ПОСЛЕ СОЗДАНИЯ ПОЛЬЗОВАТЕЛЕЙ назначьте роли (пример):
--   update public.profiles set role = 'admin'   where login = 'admin@example.com';
--   update public.profiles set role = 'manager' where login = 'manager@example.com';
-- =====================================================================

-- =====================================================================
-- v1.07.18: ЖУРНАЛ ДЕЙСТВИЙ СОТРУДНИКОВ (audit_log)
-- (идентично supabase/update-to-1_07_18.sql)
-- =====================================================================

-- Таблица журнала: кто, когда, что сделал и с чем.
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  actor      uuid references public.profiles(id) on delete set null,
  actor_name text,
  action     text not null,          -- job_create / pickup_done / user_block / ...
  entity     text,                   -- job | placement | profile
  entity_id  text,
  details    jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx    on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor);
create index if not exists audit_log_action_idx on public.audit_log (action);

alter table public.audit_log enable row level security;

-- Писать может каждый авторизованный, но только ОТ СВОЕГО имени.
drop policy if exists audit_ins on public.audit_log;
create policy audit_ins on public.audit_log
  for insert to authenticated
  with check (actor = auth.uid());

-- Читать журнал может только админ.
drop policy if exists audit_sel on public.audit_log;
create policy audit_sel on public.audit_log
  for select to authenticated
  using (public.my_role() = 'admin');

-- Политик update/delete нет намеренно: журнал нельзя править и чистить
-- через API даже админом — только владельцу проекта в SQL-редакторе.

-- Регистрация нового сотрудника пишется в журнал на сервере: в момент
-- регистрации клиент ещё не авторизован и сам записать её не может.
create or replace function public.log_new_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (new.id, new.display_name, 'user_register', 'profile', new.id::text,
          jsonb_build_object('login', new.login, 'role', new.role));
  return new;
end $$;

drop trigger if exists trg_log_new_profile on public.profiles;
create trigger trg_log_new_profile
  after insert on public.profiles
  for each row execute function public.log_new_profile();

-- История действий хранится ПОЛНОСТЬЮ — без автоматической обрезки.
-- Если этот апдейт запускался в ранней редакции (там был триггер-ограничитель
-- на последние 5000 записей), две строки ниже снимают его; на чистой базе
-- они ничего не делают. Удалять записи журнала через API по-прежнему
-- нельзя никому — только владельцу проекта вручную в SQL-редакторе.
drop trigger if exists trg_trim_audit on public.audit_log;
drop function if exists public.trim_audit_log();
