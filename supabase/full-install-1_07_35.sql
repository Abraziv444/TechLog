-- =====================================================================
-- TechLog · FULL INSTALL · v1.07.35 · собран 2026-09-05
-- =====================================================================
-- ОДИН файл вместо двенадцати: полная схема + все обновления в
-- хронологическом порядке. Полностью ИДЕМПОТЕНТЕН — безопасен и для
-- чистого проекта Supabase, и для действующей базы (уже применённые
-- куски пройдут вхолостую: if not exists / or replace / on conflict).
--
-- Состав по порядку:
--   schema.sql, 1_07_07, 1_07_10, 1_07_12, 1_07_18,
--   security-hotfix-1_07_24, 1_07_25, 1_07_26, [hoist can_view_job],
--   1_07_27, 1_07_31, 1_07_32, 1_07_33.
--
-- Проверен реальным двойным прогоном на чистом PostgreSQL 16
-- (с заглушками схем auth/storage) — обе итерации без единой ошибки.
--
-- ПОСЛЕ выполнения не забудьте (SQL этого не делает):
--   supabase functions deploy media-begin media-commit media-view \
--     media-health media-delete media-oauth
-- =====================================================================

-- ############################ FILE: schema.sql ############################

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
  counterparty_id uuid not null references public.counterparties(id) on delete cascade,
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

-- ############################ FILE: update-to-1_07_07.sql ############################

-- =====================================================================
-- TechLog: ОБНОВЛЕНИЕ существующей базы до v1.07.07
-- Выполните этот файл целиком в Supabase → SQL Editor.
-- Скрипт идемпотентен: повторный запуск безопасен и ничего не затирает.
-- (Новая база с нуля: используйте полный schema.sql — этот файл не нужен.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- v1.07.06: БЛОКИРОВКА СОТРУДНИКОВ И СМЕНА ПАРОЛЯ АДМИНОМ
-- (для существующей базы достаточно выполнить только этот блок)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists blocked boolean not null default false;

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

-- ############################ FILE: update-to-1_07_10.sql ############################

-- =====================================================================
-- TechLog: обновление БД до v1.07.10
-- ОБЩИЙ ДОСТУП К ДОКУМЕНТАМ ДЛЯ КОВОРКЕРОВ
--
-- Выполните целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт идемпотентен: повторный запуск безопасен и ничего не затирает.
-- Если вы обновляетесь с версии старше 1.07.07 — сначала выполните
-- supabase/update-to-1_07_07.sql (или полный supabase/schema.sql).
-- =====================================================================

-- 1) Новые колонки --------------------------------------------------------
-- Галочка «Общий доступ к документу для коворкера» в самой работе:
alter table public.jobs
  add column if not exists shared_with_helpers boolean not null default false;
-- Глобальный выключатель функции (галочка админа в «Настройках»):
alter table public.org_settings
  add column if not exists allow_shared_jobs boolean not null default true;

-- 2) Общий доступ включён на уровне организации? --------------------------
create or replace function public.shared_jobs_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select allow_shared_jobs from public.org_settings where id = 'org'), true)
$$;

-- 3) Текущий пользователь — коворкер работы с включённым общим доступом? --
--    security definer: читает jobs в обход RLS, чтобы политики placements
--    не зависели от политик jobs и не было рекурсии.
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

-- 4) RLS работ: коворкер с общим доступом видит и правит работу -----------
--    (создание и удаление остаются за автором и админом, как раньше)
drop policy if exists jobs_sel on public.jobs;
create policy jobs_sel on public.jobs for select to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager')
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );

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

-- 5) RLS пикапов: коворкер видит и обслуживает размещения по общей работе -
--    (нужно, чтобы правка секции Equipment Rental коворкером корректно
--    создавала/обновляла/удаляла пикапы, а кнопка «Забрать» работала)
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

-- ############################ FILE: update-to-1_07_12.sql ############################

-- =====================================================================
-- TechLog: обновление БД до v1.07.12
-- ПРОДЛЕНИЕ АРЕНДЫ ОБОРУДОВАНИЯ И ИСТОРИЯ РАБОТЫ
--
-- Выполните целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт идемпотентен: повторный запуск безопасен и ничего не затирает.
-- Если вы обновляетесь с версии старше 1.07.10 — сначала выполните
-- supabase/update-to-1_07_10.sql (или полный supabase/schema.sql).
-- =====================================================================

-- Продление = «второй пикап»: новое размещение со ссылкой на исходное (ext_of).
-- Исходное при полном продлении помечается superseded (закрыто продлением)
-- и остаётся в истории работы; при частичном — у него уменьшается qty.
alter table public.placements
  add column if not exists ext_of uuid references public.placements(id) on delete set null;
alter table public.placements
  add column if not exists superseded boolean not null default false;
alter table public.placements
  add column if not exists superseded_at timestamptz;

create index if not exists placements_ext_idx on public.placements(ext_of);

-- RLS-политики менять не нужно: политики v1.07.10 (владелец / менеджер / админ /
-- коворкер с общим доступом через is_shared_job_helper) полностью покрывают
-- строки-продления, так как это обычные записи placements той же работы.

-- ############################ FILE: update-to-1_07_18.sql ############################

-- =====================================================================
-- TechLog · update-to-1_07_18.sql — ЖУРНАЛ ДЕЙСТВИЙ СОТРУДНИКОВ
-- Выполните этот файл в Supabase → SQL Editor, если база создана до
-- v1.07.18. Скрипт идемпотентен: повторный запуск безопасен.
-- Новая база с нуля разворачивается полным schema.sql (блок уже включён).
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

-- ############################ FILE: security-hotfix-1_07_24.sql ############################

-- =====================================================================
-- TechLog security-hotfix v1.07.24 — СРОЧНЫЕ исправления безопасности
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. КРИТИЧНО: запрет самостоятельной смены роли (эскалация привилегий)
--
-- Сейчас политика profiles_upd разрешает сотруднику UPDATE своей строки
-- ЦЕЛИКОМ. RLS не умеет ограничивать отдельные колонки, поэтому любой
-- tech одним REST-запросом (PATCH /rest/v1/profiles?id=eq.<свой id>
-- c телом {"role":"admin"}) делает себя админом: читает журнал, меняет
-- цены, апрувит свои инвойсы, блокирует других. Триггер ниже закрывает
-- дыру: role / blocked / login меняет только админ, id не меняет никто.
-- ---------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN_FIELD_ID';
  end if;
  if coalesce(public.my_role(), 'tech') <> 'admin' then
    if new.role    is distinct from old.role
       or new.blocked is distinct from old.blocked
       or new.login   is distinct from old.login then
      raise exception 'FORBIDDEN_FIELD';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- 2. Мошенничество с инвойсами: сейчас jobs_guard сбрасывает апрув только
-- при изменении total. Состав работ (form_data) можно переписать ПОСЛЕ
-- апрува, не трогая total, — PDF разойдётся с согласованным. Плюс запрет
-- переписывать автора работы (technician_id) не-админом.
-- ---------------------------------------------------------------------
create or replace function public.jobs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.technician_id is distinct from old.technician_id
     and coalesce(public.my_role(),'tech') <> 'admin' then
    raise exception 'FORBIDDEN_FIELD';
  end if;
  if old.status = 'approved'
     and coalesce(public.my_role(),'tech') <> 'admin'
     and (new.total     is distinct from old.total
          or new.form_data is distinct from old.form_data) then
    new.status := 'done';
    new.approved_total := null;
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;
-- триггер jobs_guard_tg уже существует и подхватит новую версию функции

-- ---------------------------------------------------------------------
-- 3. Анти-брутфорс для публичных RPC (check_invite / login_available /
-- signup_precheck). Они доступны роли anon без ограничений: код
-- приглашения можно перебирать бесконечно. Вводим лимит по IP.
-- (Перебор паролей входа ограничивает сам Supabase Auth; дополнительно
-- включите CAPTCHA: Dashboard → Auth → Attack Protection → Turnstile.)
-- ---------------------------------------------------------------------
create table if not exists public.rpc_throttle (
  key          text primary key,
  window_start timestamptz not null default now(),
  cnt          int not null default 1
);
alter table public.rpc_throttle enable row level security;
revoke all on public.rpc_throttle from anon, authenticated;

create or replace function public.client_ip()
returns text language plpgsql stable as $$
declare v text;
begin
  begin
    v := split_part(coalesce(
           current_setting('request.headers', true)::json->>'x-forwarded-for',
           current_setting('request.headers', true)::json->>'x-real-ip',
           'anon'), ',', 1);
  exception when others then v := 'anon';
  end;
  return coalesce(nullif(trim(v), ''), 'anon');
end $$;

create or replace function public.throttle(p_bucket text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare v_key text := p_bucket || ':' || public.client_ip(); v_cnt int;
begin
  insert into public.rpc_throttle as t (key) values (v_key)
  on conflict (key) do update set
    cnt          = case when t.window_start < now() - p_window then 1 else t.cnt + 1 end,
    window_start = case when t.window_start < now() - p_window then now() else t.window_start end
  returning t.cnt into v_cnt;
  if random() < 0.01 then
    delete from public.rpc_throttle where window_start < now() - interval '1 day';
  end if;
  if v_cnt > p_max then raise exception 'RATE_LIMITED'; end if;
end $$;

-- перепроверка кода приглашения: максимум 10 попыток за 15 минут с IP
create or replace function public.check_invite(code text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.throttle('invite', 10, interval '15 minutes');
  return public.is_valid_invite(code);
end $$;

create or replace function public.login_available(p_login text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.throttle('login_free', 30, interval '15 minutes');
  return not exists (
    select 1 from public.profiles where lower(login) = lower(coalesce(p_login,''))
  );
end $$;

create or replace function public.signup_precheck(p_login text, p_invite text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text := lower(coalesce(p_login,''));
begin
  perform public.throttle('signup', 15, interval '15 minutes');
  if v !~ '^[a-z0-9_.-]{3,32}$' then return 'BAD_LOGIN'; end if;
  if not public.is_valid_invite(p_invite) then return 'BAD_INVITE'; end if;
  if exists (select 1 from public.profiles where lower(login) = v) then return 'LOGIN_TAKEN'; end if;
  return 'OK';
end $$;

-- ---------------------------------------------------------------------
-- 4. Составные индексы под типовые запросы (списки «мои работы за период»
-- и «мои невывезенные пикапы»). При сотнях тысяч строк это разница между
-- миллисекундами и секундами.
-- ---------------------------------------------------------------------
create index if not exists jobs_tech_date_idx  on public.jobs(technician_id, date desc);
create index if not exists pl_tech_open_idx    on public.placements(technician_id, picked_up, due_date);

-- ---------------------------------------------------------------------
-- 5. Чек-лист в Dashboard (руками, SQL этого не умеет):
--  • Auth → Providers → Email → Minimum password length: 8–10.
--  • Auth → Attack Protection → включить CAPTCHA (Cloudflare Turnstile) —
--    остановит переборы паролей ботами; в app.js добавить captchaToken.
--  • Auth → Rate Limits — убедиться, что лимиты на /token включены.
--  • Organization → пароль владельца + 2FA на аккаунте Supabase и на
--    GitHub (утечка аккаунта владельца = утечка всей базы и секретов).
--  • Если код приглашения короче 10 символов — смените через админку на
--    длинную фразу: перебор даже с лимитом должен быть бессмысленным.
--  • Репозиторий GitHub Pages публичный: убедитесь, что дефолтный
--    invite-код из schema.sql давно заменён, а в истории коммитов нет
--    настоящих кодов доступа/домофонов из seed-данных.
-- =====================================================================

-- ############################ FILE: update-to-1_07_25.sql ############################

-- =====================================================================
-- TechLog update-to-1_07_25 — «Доска», номер машины, права менеджера
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- =====================================================================

-- Галочка админа: менеджеру можно менять очерёдность задач (Доска и ▲▼)
alter table public.org_settings
  add column if not exists manager_can_reorder boolean not null default false;

-- Номер машины, закреплённой за сотрудником (бейдж в справочнике и на Доске)
alter table public.profiles
  add column if not exists car_no int;

-- ---------------------------------------------------------------------
-- profiles_guard v2: role / blocked / login / car_no меняет только админ.
-- (Замещает версию из security-hotfix-1_07_24.sql; если хотфикс ещё не
-- выполнялся — триггер будет создан здесь. Сам хотфикс всё равно выполните:
-- в нём анти-брутфорс и защита инвойсов.)
-- ---------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN_FIELD_ID';
  end if;
  if coalesce(public.my_role(), 'tech') <> 'admin' then
    if new.role       is distinct from old.role
       or new.blocked is distinct from old.blocked
       or new.login   is distinct from old.login
       or new.car_no  is distinct from old.car_no then
      raise exception 'FORBIDDEN_FIELD';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- RPC для Доски: менеджеру нельзя писать в jobs напрямую (RLS), а
-- расширять политику целиком опасно — он смог бы править суммы и составы.
-- Функция меняет РОВНО два поля: priority и sort_order.
--  • priority (красный треугольник) — менеджеру можно всегда;
--  • sort_order (очерёдность)       — только если админ включил галочку
--    org_settings.manager_can_reorder.
-- Смена приоритета фиксируется в журнале действий (пишет сервер).
-- ---------------------------------------------------------------------
create or replace function public.board_job_flags(
  p_job uuid, p_priority boolean default null, p_sort int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(public.my_role(), 'tech');
  v_unit text; v_name text;
begin
  if v_role not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_priority is null and p_sort is null then return; end if;
  if p_sort is not null and v_role = 'manager'
     and not coalesce((select manager_can_reorder
                       from public.org_settings where id = 'org'), false) then
    raise exception 'REORDER_OFF';
  end if;

  update public.jobs
     set priority   = coalesce(p_priority, priority),
         sort_order = coalesce(p_sort, sort_order),
         updated_at = now()
   where id = p_job
   returning unit_number into v_unit;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_priority is not null then
    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
    values (auth.uid(), coalesce(v_name, ''), 'priority_set', 'job', p_job::text,
            jsonb_build_object('on', p_priority, 'unit', coalesce(v_unit, '')));
  end if;
end $$;
revoke all on function public.board_job_flags(uuid, boolean, int) from public, anon;
grant execute on function public.board_job_flags(uuid, boolean, int) to authenticated;

-- ############################ FILE: update-to-1_07_26.sql ############################

-- =====================================================================
-- TechLog update-to-1_07_26 — склад, чек-листы, апрувы менеджера,
-- лимиты аренды/продления, блокировка правки старых документов, PROPOSAL
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Новые настройки организации
-- ---------------------------------------------------------------------
alter table public.org_settings add column if not exists default_rent_days   int     not null default 3;
alter table public.org_settings add column if not exists max_extend_days     int     not null default 3;
alter table public.org_settings add column if not exists manager_can_approve boolean not null default false;
alter table public.org_settings add column if not exists stock_visible_all   boolean not null default true;
alter table public.org_settings add column if not exists edit_lock_days      int     not null default 0;

-- PROPOSAL — не вид работы, а признак документа (чекбокс после номера юнита)
alter table public.jobs add column if not exists has_proposal boolean not null default false;

-- Чек-лист перед выездом — хранится у вида работ
alter table public.work_types add column if not exists checklist jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- СКЛАД: остатки оборудования. Правит админ, читают все авторизованные
-- (видимость для сотрудников дополнительно регулируется галочкой
-- org_settings.stock_visible_all на клиенте).
-- «У клиентов» не хранится — считается по невывезенным пикапам.
-- ---------------------------------------------------------------------
create table if not exists public.equipment_stock (
  id                uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null unique references public.equipment_types(id) on delete cascade,
  total             int  not null default 0,
  broken            int  not null default 0,
  in_repair         int  not null default 0
);
alter table public.equipment_stock enable row level security;
drop policy if exists stock_sel on public.equipment_stock;
create policy stock_sel on public.equipment_stock for select to authenticated using (true);
drop policy if exists stock_wr on public.equipment_stock;
create policy stock_wr on public.equipment_stock for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------------
-- Апрув менеджером: RLS не даёт менеджеру писать в jobs, а открывать
-- политику целиком нельзя (он смог бы править составы и суммы).
-- Функция меняет только поля апрува и пишет запись в журнал на сервере.
-- ---------------------------------------------------------------------
create or replace function public.approve_job(p_job uuid, p_total numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(public.my_role(), 'tech');
  v_unit text; v_name text;
begin
  if v_role <> 'admin' then
    if v_role <> 'manager'
       or not coalesce((select manager_can_approve from public.org_settings where id = 'org'), false) then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  if p_total is null or p_total < 0 then raise exception 'BAD_TOTAL'; end if;

  update public.jobs
     set status = 'approved',
         approved_total = p_total,
         approved_by = auth.uid(),
         approved_at = now(),
         updated_at = now()
   where id = p_job
   returning unit_number into v_unit;
  if not found then raise exception 'NOT_FOUND'; end if;

  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name, ''), 'job_approve', 'job', p_job::text,
          jsonb_build_object('unit', coalesce(v_unit, ''), 'total', p_total, 'via', 'rpc'));
end $$;
revoke all on function public.approve_job(uuid, numeric) from public, anon;
grant execute on function public.approve_job(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Блокировка правки старых документов на уровне БД (клиентский замок —
-- удобство, этот триггер — защита). Техник не может менять и удалять
-- работы старше org_settings.edit_lock_days; 0 — выключено.
-- Менеджер и админ — без ограничений.
-- ---------------------------------------------------------------------
create or replace function public.jobs_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select coalesce(edit_lock_days, 0) into v_n from public.org_settings where id = 'org';
  if v_n > 0
     and coalesce(public.my_role(), 'tech') = 'tech'
     and old.date < current_date - v_n then
    raise exception 'LOCKED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists jobs_lock_tg on public.jobs;
create trigger jobs_lock_tg before update or delete on public.jobs
  for each row execute function public.jobs_lock_guard();

-- ---------------------------------------------------------------------
-- Сиды чек-листов (по вашим спискам). Заполняются ТОЛЬКО там, где
-- чек-лист ещё пуст — ваши правки повторный запуск не перетрёт.
-- Дальше редактируются в Справочники → Виды работ → 📋.
-- ---------------------------------------------------------------------
update public.work_types set checklist = '[
  "Эйрдак-машина / Air duct machine",
  "Шланги и насадки",
  "Шуруповёрт",
  "Нож — срезать герметик",
  "Фогер + тритмант",
  "Тряпки",
  "Запросить размеры решёток и их состояние (купить нужные заранее)"
]'::jsonb
where name ilike '%air duct%' and (checklist is null or checklist = '[]'::jsonb);

update public.work_types set checklist = '[
  "Сопоги (сапоги)",
  "Портативная откачка / portable",
  "Тритмант",
  "Нож",
  "Подкладка под ковёр (pad)",
  "Бловеры",
  "Дехью (dehumidifier)",
  "Скрабер (air scrubber)",
  "Швабра, тряпки",
  "Анализатор воды",
  "Термокамера / тепловизор",
  "Датчик влажности"
]'::jsonb
where (name ilike '%vetvag%' or name ilike '%damage water%')
  and (checklist is null or checklist = '[]'::jsonb);

update public.work_types set checklist = '[
  "Портабл или машина (шланги и вант — под каждый свои)",
  "Ведро, шампунь, пахучки",
  "Чемодан с химией от пятен",
  "Химия для предварительного распыления + распылитель",
  "Нож для вырезания подкладки",
  "Подкладка (pad)",
  "Устройство для выпрямления ворсинок"
]'::jsonb
where name ilike '%steam%' and (checklist is null or checklist = '[]'::jsonb);

update public.work_types set checklist = '[
  "Мультитул для вырезки стен + насадки",
  "Лестница",
  "Перчатки, тряпки",
  "Силент (герметик)",
  "Уровень, карандаш",
  "Мусорные пакеты",
  "Респиратор / маска"
]'::jsonb
where name ilike '%demolition%' and (checklist is null or checklist = '[]'::jsonb);

-- #####################################################################
-- HOIST: can_view_job нужен политике prop_sel из 1_07_27, но исторически
-- определялся только в 1_07_31 — на чистой базе 27-й падал бы. Здесь
-- функция объявляется заранее; повторное объявление в блоке 1_07_31
-- безвредно (create or replace).
-- #####################################################################
create or replace function public.can_view_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.technician_id = auth.uid()
      or public.my_role() in ('admin','manager')
      or (j.shared_with_helpers and j.helper_ids ? auth.uid()::text
          and public.shared_jobs_enabled())
    )
  )
$$;

-- ############################ FILE: update-to-1_07_27.sql ############################

-- =====================================================================
-- TechLog update-to-1_07_27 — пропозалы, раздельный журнал,
-- согласование продлений сверх лимита
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен
-- (перенос старых записей журнала выполнится один раз).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ПРОПОЗАЛЫ (коммерческие предложения)
-- ---------------------------------------------------------------------
create table if not exists public.proposals (
  id              uuid primary key default gen_random_uuid(),
  no              bigint generated by default as identity,       -- номер P-…
  date            date not null default current_date,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  complex_id      uuid references public.complexes(id) on delete set null,
  unit_number     text not null default '',
  note            text not null default '',
  items           jsonb not null default '[]'::jsonb,            -- [{d:'…', a:123}]
  total           numeric not null default 0,
  status          text not null default 'draft'
                  check (status in ('draft','sent','approved','declined')),
  created_by      uuid references public.profiles(id) on delete set null,
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists proposals_no_idx on public.proposals(no);
create index if not exists proposals_cx_idx   on public.proposals(complex_id, date desc);
create index if not exists proposals_date_idx on public.proposals(date desc);

alter table public.jobs
  add column if not exists proposal_id uuid references public.proposals(id) on delete set null;
create index if not exists jobs_proposal_idx on public.jobs(proposal_id);

alter table public.org_settings
  add column if not exists allow_tech_proposal_flag boolean not null default true;

alter table public.proposals enable row level security;
-- читают менеджер/админ; техник видит только пропозал, связанный с его работой
drop policy if exists prop_sel on public.proposals;
create policy prop_sel on public.proposals for select to authenticated
  using (
    public.my_role() in ('admin','manager')
    or exists (select 1 from public.jobs j
               where j.proposal_id = proposals.id and public.can_view_job(j.id))
  );
drop policy if exists prop_ins on public.proposals;
create policy prop_ins on public.proposals for insert to authenticated
  with check (public.my_role() in ('admin','manager'));
drop policy if exists prop_upd on public.proposals;
create policy prop_upd on public.proposals for update to authenticated
  using (public.my_role() in ('admin','manager'))
  with check (public.my_role() in ('admin','manager'));
drop policy if exists prop_del on public.proposals;
create policy prop_del on public.proposals for delete to authenticated
  using (public.my_role() = 'admin');

-- Связь инвойс↔пропозал ставит менеджер/админ. RLS менеджеру писать в jobs
-- не даёт, а открывать политику целиком опасно — функция меняет ровно
-- одно поле и фиксирует действие в журнале документов.
create or replace function public.link_job_proposal(p_job uuid, p_prop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_unit text; v_no bigint; v_name text;
begin
  if public.my_role() not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_prop is not null then
    select no into v_no from public.proposals where id = p_prop;
    if v_no is null then raise exception 'NO_PROPOSAL'; end if;
  end if;
  update public.jobs
     set proposal_id  = p_prop,
         has_proposal = case when p_prop is not null then true else has_proposal end,
         updated_at   = now()
   where id = p_job
   returning unit_number into v_unit;
  if not found then raise exception 'NOT_FOUND'; end if;
  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name,''),
          case when p_prop is null then 'proposal_unlink' else 'proposal_link' end,
          'job', p_job::text,
          jsonb_build_object('unit', coalesce(v_unit,''), 'no', v_no));
end $$;
revoke all on function public.link_job_proposal(uuid, uuid) from public, anon;
grant execute on function public.link_job_proposal(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. ЖУРНАЛ: отдельная таблица для системных событий (tech_log).
--    Документные остаются в audit_log. Существующие системные записи
--    переносятся один раз (атомарно: перенос = удаление + вставка).
-- ---------------------------------------------------------------------
create table if not exists public.tech_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  actor      uuid,
  actor_name text not null default '',
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb
);
create index if not exists tech_log_at_idx     on public.tech_log(at desc);
create index if not exists tech_log_action_idx on public.tech_log(action, at desc);

alter table public.tech_log enable row level security;
drop policy if exists tlog_ins on public.tech_log;
create policy tlog_ins on public.tech_log for insert to authenticated
  with check (actor = auth.uid());
drop policy if exists tlog_sel on public.tech_log;
create policy tlog_sel on public.tech_log for select to authenticated
  using (public.my_role() = 'admin');
-- политик update/delete нет — журнал неизменяем, как и audit_log

with moved as (
  delete from public.audit_log
  where action in ('user_register','user_create','user_block','user_unblock','role_change',
                   'password_change','password_reset','car_no_set','org_toggle','org_set',
                   'stock_set','backup_export','backup_restore')
  returning at, actor, actor_name, action, entity, entity_id, details
)
insert into public.tech_log (at, actor, actor_name, action, entity, entity_id, details)
select at, actor, actor_name, action, entity, entity_id, details from moved;

-- регистрация пользователя — системное событие: триггер пишет в tech_log
create or replace function public.log_new_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then
    return new;                                   -- идёт восстановление из бэкапа
  end if;
  insert into public.tech_log (actor, actor_name, action, entity, entity_id, details)
  values (new.id, new.display_name, 'user_register', 'profile', new.id::text,
          jsonb_build_object('login', new.login, 'role', new.role));
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. СОГЛАСОВАНИЕ ПРОДЛЕНИЙ сверх лимита.
--    Техник создаёт заявку (insert под своим именем), менеджер/админ
--    решает через RPC; при одобрении продление применяется СЕРВЕРОМ
--    той же логикой, что и обычное продление (ext_of / superseded).
-- ---------------------------------------------------------------------
create table if not exists public.ext_requests (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  days         int  not null check (days between 1 and 60),
  qty_total    int  not null default 0,
  payload      jsonb not null default '[]'::jsonb,   -- [{id: placement_id, qty: n}]
  unit         text not null default '',
  cx           text not null default '',
  eq           text not null default '',
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected')),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz
);
create index if not exists extreq_status_idx on public.ext_requests(status, requested_at desc);
create index if not exists extreq_job_idx    on public.ext_requests(job_id);

alter table public.ext_requests enable row level security;
drop policy if exists exr_ins on public.ext_requests;
create policy exr_ins on public.ext_requests for insert to authenticated
  with check (requested_by = auth.uid());
drop policy if exists exr_sel on public.ext_requests;
create policy exr_sel on public.ext_requests for select to authenticated
  using (requested_by = auth.uid() or public.my_role() in ('admin','manager'));
drop policy if exists exr_del on public.ext_requests;
create policy exr_del on public.ext_requests for delete to authenticated
  using (public.my_role() = 'admin');
-- update только через RPC ниже

create or replace function public.decide_ext_request(p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req  public.ext_requests%rowtype;
  v_pl   public.placements%rowtype;
  v_row  jsonb;
  v_q    int;
  v_base date;
  v_made int := 0;
  v_name text;
begin
  if public.my_role() not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.ext_requests
   where id = p_id and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  if not p_ok then
    update public.ext_requests
       set status = 'rejected', decided_by = auth.uid(), decided_at = now()
     where id = p_id;
    insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
    values (auth.uid(), coalesce(v_name,''), 'ext_request_rejected', 'job', v_req.job_id::text,
            jsonb_build_object('unit', v_req.unit, 'days', v_req.days, 'eq', v_req.eq));
    return;
  end if;

  for v_row in select * from jsonb_array_elements(v_req.payload) loop
    select * into v_pl from public.placements
     where id = (v_row->>'id')::uuid
       and job_id = v_req.job_id
       and picked_up = false
       and coalesce(superseded, false) = false
     for update;
    if not found then continue; end if;

    v_q := least(coalesce((v_row->>'qty')::int, 0), coalesce(v_pl.qty, 0));
    if v_q <= 0 then continue; end if;
    v_base := greatest(v_pl.due_date, current_date);

    insert into public.placements (
      id, job_id, equipment_type_id, qty, days, placed_date, due_date,
      picked_up, picked_up_at, picked_up_by, ext_of, superseded, superseded_at,
      technician_id, complex_id, counterparty_id, unit_number)
    values (
      gen_random_uuid(), v_pl.job_id, v_pl.equipment_type_id, v_q, v_req.days,
      v_base, v_base + v_req.days,
      false, null, null, v_pl.id, false, null,
      v_pl.technician_id, v_pl.complex_id, v_pl.counterparty_id, v_pl.unit_number);

    if v_q >= coalesce(v_pl.qty, 0) then
      update public.placements
         set superseded = true, superseded_at = now() where id = v_pl.id;
    else
      update public.placements set qty = v_pl.qty - v_q where id = v_pl.id;
    end if;
    v_made := v_made + v_q;
  end loop;

  update public.ext_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id;

  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name,''), 'ext_request_approved', 'job', v_req.job_id::text,
          jsonb_build_object('unit', v_req.unit, 'days', v_req.days, 'qty', v_made, 'eq', v_req.eq));
  if v_made > 0 then
    insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
    values (auth.uid(), coalesce(v_name,''), 'extension_create', 'job', v_req.job_id::text,
            jsonb_build_object('unit', v_req.unit, 'days', v_req.days, 'qty', v_made));
  end if;
end $$;
revoke all on function public.decide_ext_request(uuid, boolean) from public, anon;
grant execute on function public.decide_ext_request(uuid, boolean) to authenticated;

-- ############################ FILE: update-to-1_07_31.sql ############################

-- =====================================================================
-- TechLog update-to-1_07_31 — ФОТО И ВИДЕО → Google Drive (интеграция)
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
--
-- После SQL разверните функции (Supabase CLI, из корня репозитория):
--   supabase functions deploy media-begin media-commit media-view \
--     media-health media-delete media-oauth
-- Файлы функций лежат в supabase/functions/ этого репозитория.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Общая функция «право видеть работу». ВАЖНО: она же используется
-- политикой prop_sel из update-to-1_07_27 — если тот файл падал с
-- ошибкой "function can_view_job does not exist", выполните его ПОВТОРНО
-- после этого файла.
-- ---------------------------------------------------------------------
create or replace function public.can_view_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.technician_id = auth.uid()
      or public.my_role() in ('admin','manager')
      or (j.shared_with_helpers and j.helper_ids ? auth.uid()::text
          and public.shared_jobs_enabled())
    )
  )
$$;

-- ---------------------------------------------------------------------
-- 1. Таблица медиафайлов
-- ---------------------------------------------------------------------
create table if not exists public.media (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('photo','video')),
  seq           int  not null,
  file_name     text not null,
  mime          text not null default '',
  size_bytes    bigint not null default 0,
  drive_file_id text,
  thumb_path    text,
  status        text not null default 'uploading'
                check (status in ('uploading','ready')),
  created_at    timestamptz not null default now(),
  unique (job_id, kind, seq)
);
create index if not exists media_job_idx   on public.media(job_id, kind, seq);
create index if not exists media_owner_idx on public.media(owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. RLS: клиент только ЧИТАЕТ. Вставку/изменение делает исключительно
-- Edge Function (service role), удаление — только админ через
-- media-delete. Сотрудник после отправки удалить или подменить фото
-- не может — защита от «подчистки» архива.
-- ---------------------------------------------------------------------
alter table public.media enable row level security;
drop policy if exists media_sel on public.media;
create policy media_sel on public.media for select to authenticated
  using (owner_id = auth.uid() or public.can_view_job(job_id));
-- политик insert/update/delete для authenticated НЕТ — это осознанно.

-- ---------------------------------------------------------------------
-- 3. Bucket миниатюр (полноразмерные файлы живут в Google Drive)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media-thumbs','media-thumbs', false)
on conflict (id) do nothing;

drop policy if exists thumbs_ins on storage.objects;
create policy thumbs_ins on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-thumbs'
    and exists (select 1 from public.media m
                where m.thumb_path = name and m.owner_id = auth.uid())
  );
drop policy if exists thumbs_sel on storage.objects;
create policy thumbs_sel on storage.objects for select to authenticated
  using (
    bucket_id = 'media-thumbs'
    and exists (select 1 from public.media m
                where m.thumb_path = name
                  and (m.owner_id = auth.uid() or public.can_view_job(m.job_id)))
  );

-- ---------------------------------------------------------------------
-- 4. Настройки Drive из админки. Секреты кладутся в app_secrets
-- (RLS без политик: клиент их НИКОГДА не прочитает; читает только
-- service role внутри Edge Functions). Пустые параметры не затирают
-- сохранённые значения. Refresh-token из интерфейса не вводится —
-- его сохраняет функция media-oauth после кнопки «Подключить Google».
-- ---------------------------------------------------------------------
create or replace function public.admin_set_drive_config(
  p_client_id text, p_client_secret text, p_refresh_token text, p_folder_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_client_id', trim(p_client_id))
    on conflict (key) do update set value = excluded.value; end if;
  if nullif(trim(p_client_secret),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_client_secret', trim(p_client_secret))
    on conflict (key) do update set value = excluded.value; end if;
  if nullif(trim(p_refresh_token),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_refresh_token', trim(p_refresh_token))
    on conflict (key) do update set value = excluded.value; end if;
  if nullif(trim(p_folder_id),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_folder_id', trim(p_folder_id))
    on conflict (key) do update set value = excluded.value; end if;
end $$;
revoke all on function public.admin_set_drive_config(text,text,text,text) from public, anon;
grant execute on function public.admin_set_drive_config(text,text,text,text) to authenticated;

-- ############################ FILE: update-to-1_07_32.sql ############################

-- =====================================================================
-- TechLog update-to-1_07_32 — БЭКАП (серверная часть, консолидированная)
-- ЗАМЕНЯЕТ ранний backup-restore.sql: выполните этот файл, старый больше
-- не нужен (повторный запуск любого из них безопасен — create or replace).
-- Белый список восстановления дополнен таблицами последних релизов:
-- equipment_stock, proposals, ext_requests, media; после загрузки
-- пропозалов выравнивается счётчик номеров P-№.
--
-- Зачем RPC (нельзя ли просто insert с клиента?): нельзя —
--  • profiles_ins разрешает вставку только СВОЕЙ строки;
--  • app_secrets и auth.users через API вообще недоступны;
--  • дубли должен отсекать сам Postgres (ON CONFLICT DO NOTHING ловит
--    совпадение ЛЮБОГО уникального ключа — id, логин, ключ цены и т.д.).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Журнал не шумит при восстановлении: user_register пропускается
--    для строк, вставленных в режиме restore (актуальная версия — tech_log).
-- ---------------------------------------------------------------------
create or replace function public.log_new_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then
    return new;                                   -- идёт восстановление из бэкапа
  end if;
  insert into public.tech_log (actor, actor_name, action, entity, entity_id, details)
  values (new.id, new.display_name, 'user_register', 'profile', new.id::text,
          jsonb_build_object('login', new.login, 'role', new.role));
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. ЭКСПОРТ учётных записей (auth.users через API не читается).
--    Отдаёт bcrypt-хэши паролей — как обычный pg_dump. Только админ.
-- ---------------------------------------------------------------------
create or replace function public.admin_export_auth_users()
returns jsonb language sql stable security definer
set search_path = public, auth as $$
  select case when public.my_role() = 'admin' then
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email,
      'encrypted_password', u.encrypted_password,
      'created_at', u.created_at,
      'banned_until', u.banned_until,
      'raw_user_meta_data', coalesce(u.raw_user_meta_data, '{}'::jsonb)))
      from auth.users u
      where u.aud = 'authenticated' and coalesce(u.is_sso_user, false) = false),
      '[]'::jsonb)
  else null end
$$;
revoke all on function public.admin_export_auth_users() from public, anon;
grant execute on function public.admin_export_auth_users() to authenticated;

-- ---------------------------------------------------------------------
-- 3. ВОССТАНОВЛЕНИЕ учётной записи с ТЕМ ЖЕ uuid и тем же хэшем пароля
--    (сотрудники входят старыми паролями). Существующие не трогает.
-- ---------------------------------------------------------------------
create or replace function public.admin_restore_auth_user(p jsonb)
returns text language plpgsql security definer
set search_path = public, auth as $$
declare v_id uuid := (p->>'id')::uuid;
        v_email text := lower(trim(coalesce(p->>'email','')));
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if v_id is null or v_email = '' or coalesce(p->>'encrypted_password','') = '' then
    raise exception 'BAD_ROW';
  end if;
  if exists (select 1 from auth.users where id = v_id) then return 'exists'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'EMAIL_TAKEN';
  end if;

  perform set_config('techlog.admin_create', '1', true);   -- байпас триггера регистрации

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token,
    reauthentication_token, is_super_admin, is_sso_user)
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, p->>'encrypted_password', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    coalesce(p->'raw_user_meta_data', '{}'::jsonb),
    coalesce(nullif(p->>'created_at','')::timestamptz, now()), now(),
    nullif(p->>'banned_until','')::timestamptz,
    '', '', '', '', '', '', '', '', false, false);

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());

  return 'created';
end $$;
revoke all on function public.admin_restore_auth_user(jsonb) from public, anon;
grant execute on function public.admin_restore_auth_user(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Универсальное восстановление строк таблицы пачкой.
--    Возвращает {inserted, skipped, errors:[{row, error}]}.
--    Дубли (любой уникальный ключ) → skipped; FK и прочее → в errors,
--    остальные строки пачки продолжают загружаться. Лишние поля бэкапа
--    игнорируются, для отсутствующих сработают DEFAULT.
-- ---------------------------------------------------------------------
create or replace function public.admin_restore_rows(p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'profiles','counterparties','complexes','aux_equipment','work_types',
    'equipment_types','size_types','extra_works','product_types','price_list',
    'counterparty_prices','equipment_stock','org_settings','code_requests',
    'complex_code_history','hidden_staff','proposals','jobs','placements',
    'ext_requests','media'];
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

  if p_table = 'org_settings' then       -- единственная строка настроек: обновляем
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

  -- пропозалы нумеруются identity-счётчиком: после загрузки со старыми
  -- номерами двигаем счётчик, иначе новый пропозал получит занятый P-№
  if p_table = 'proposals' then
    perform setval(pg_get_serial_sequence('public.proposals','no'),
                   greatest((select coalesce(max(no), 0) from public.proposals), 1), true);
  end if;

  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'errors', v_errs);
end $$;
revoke all on function public.admin_restore_rows(text, jsonb) from public, anon;
grant execute on function public.admin_restore_rows(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Секреты приложения: экспорт/импорт по явной галочке админа.
--    (В бэкап-файле окажутся токены Google — храните такой файл бережно.)
-- ---------------------------------------------------------------------
create or replace function public.admin_export_secrets()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.my_role() = 'admin' then
    coalesce((select jsonb_agg(jsonb_build_object('key', key, 'value', value))
              from public.app_secrets), '[]'::jsonb)
  else null end
$$;
revoke all on function public.admin_export_secrets() from public, anon;
grant execute on function public.admin_export_secrets() to authenticated;

create or replace function public.admin_restore_secrets(p jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; v int := 0;
        v_keys text[] := array['invite','gd_client_id','gd_client_secret',
                               'gd_refresh_token','gd_folder_id'];
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  for r in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if (r->>'key') = any(v_keys) and coalesce(r->>'value','') <> '' then
      insert into public.app_secrets (key, value) values (r->>'key', r->>'value')
      on conflict (key) do update set value = excluded.value;
      v := v + 1;
    end if;
  end loop;
  return v;
end $$;
revoke all on function public.admin_restore_secrets(jsonb) from public, anon;
grant execute on function public.admin_restore_secrets(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Журналы (audit_log, tech_log) в бэкап ВЫГРУЖАЮТСЯ, но кнопкой НЕ
-- восстанавливаются: «загрузка журнала из файла» была бы способом его
-- подделать. Перенос в новый проект — только владельцем в SQL-редакторе:
--
--   -- вместо [...] вставьте содержимое tables.audit_log из бэкапа:
--   insert into public.audit_log
--   select * from jsonb_populate_recordset(null::public.audit_log, '[...]'::jsonb)
--   on conflict do nothing;
--
--   -- и аналогично для tables.tech_log:
--   insert into public.tech_log
--   select * from jsonb_populate_recordset(null::public.tech_log, '[...]'::jsonb)
--   on conflict do nothing;
-- =====================================================================

-- ############################ FILE: update-to-1_07_33.sql ############################

-- =====================================================================
-- TechLog update-to-1_07_33 — пропозал по образцу клиента (QuickBooks)
-- Выполнить целиком. Повторный запуск безопасен.
-- =====================================================================
alter table public.proposals add column if not exists po_number  text not null default '';
alter table public.proposals add column if not exists complete_by date;
