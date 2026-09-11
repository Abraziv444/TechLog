-- =====================================================================
-- TechLog · update-to-1_08_33.sql — пуш-уведомления, журнал времени на
-- объектах, активные сессии, доступы Bouncie и напоминания о ТО.
-- Идемпотентен: безопасен для повторного запуска. Выполняется целиком
-- в Supabase SQL Editor. После него разверните Edge Functions:
-- push (новая), backup (новая), bouncie (обновлена).
-- =====================================================================

-- 1) Подписки Web Push (браузеры/телефоны сотрудников) -------------------
create table if not exists public.push_subs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  ua         text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists push_subs_endpoint_ux on public.push_subs(endpoint);
create index if not exists push_subs_user_ix on public.push_subs(user_id);
alter table public.push_subs enable row level security;
drop policy if exists push_subs_sel on public.push_subs;
create policy push_subs_sel on public.push_subs for select to authenticated
  using (user_id = auth.uid());
drop policy if exists push_subs_ins on public.push_subs;
create policy push_subs_ins on public.push_subs for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists push_subs_upd on public.push_subs;
create policy push_subs_upd on public.push_subs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_subs_del on public.push_subs;
create policy push_subs_del on public.push_subs for delete to authenticated
  using (user_id = auth.uid());

-- 2) Очередь уведомлений (пишут триггеры и Edge, читает только сервер) ---
create table if not exists public.push_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  url        text not null default './',
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  tries      int not null default 0,
  last_err   text not null default ''
);
create index if not exists push_queue_unsent_ix on public.push_queue(created_at)
  where sent_at is null;
alter table public.push_queue enable row level security;   -- политик нет: только service role

-- служебный ключ для запуска рассылки без пользовательского JWT
insert into public.app_secrets(key, value)
  values ('push_cron_key', gen_random_uuid()::text)
  on conflict (key) do nothing;

-- 3) Профили: галочки пушей и персональные доступы -----------------------
alter table public.profiles add column if not exists push_prefs jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists bn_access  boolean;  -- инфо с трекера (null = по роли: admin/manager да, tech нет)
alter table public.profiles add column if not exists bn_service boolean;  -- пуши о ТО (null = только админ)
alter table public.profiles add column if not exists bn_track   boolean;  -- трек дня (null = только админ)
alter table public.profiles add column if not exists tt_self    boolean;  -- видит свой журнал времени
alter table public.profiles add column if not exists tt_others  text
  check (tt_others is null or tt_others in ('none','all','list'));        -- чей журнал видит ещё
alter table public.profiles add column if not exists tt_list    uuid[];   -- список при tt_others='list'

-- защита: персональные доступы меняет только админ (push_prefs — сам сотрудник)
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN_FIELD_ID';
  end if;
  if coalesce(public.my_role(), 'tech') <> 'admin' then
    if new.role    is distinct from old.role
       or new.blocked is distinct from old.blocked
       or new.login   is distinct from old.login
       or new.bn_access  is distinct from old.bn_access      -- v1.08.33
       or new.bn_service is distinct from old.bn_service
       or new.bn_track   is distinct from old.bn_track
       or new.tt_self    is distinct from old.tt_self
       or new.tt_others  is distinct from old.tt_others
       or new.tt_list    is distinct from old.tt_list then
      raise exception 'FORBIDDEN_FIELD';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg before update on public.profiles
  for each row execute function public.profiles_guard();

-- эффективный доступ к данным Bouncie
create or replace function public.bn_eff_access(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p.bn_access, p.role in ('admin','manager'))
    from public.profiles p where p.id = u
$$;

-- 4) Постановка пуша в очередь (уважает push_prefs, не шлёт автору) ------
create or replace function public.push_enqueue(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text default './')
returns void language plpgsql security definer set search_path = public as $$
declare v_prefs jsonb;
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  select push_prefs into v_prefs from public.profiles where id = p_user and not blocked;
  if v_prefs is null then return; end if;                       -- нет профиля / заблокирован
  if coalesce((v_prefs->>p_kind)::boolean, true) = false then return; end if;
  insert into public.push_queue(user_id, kind, title, body, url)
  values (p_user, p_kind, p_title, coalesce(p_body,''), coalesce(p_url,'./'));
end $$;
revoke all on function public.push_enqueue(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.push_enqueue(uuid,text,text,text,text) to service_role;

-- 5) Триггеры документов → очередь ---------------------------------------
create or replace function public.jobs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  v_body := 'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · ' || to_char(new.date, 'DD.MM');
  if tg_op = 'INSERT' then
    if new.technician_id is not null then
      perform public.push_enqueue(new.technician_id, 'job', 'Новая задача', v_body);
    end if;
    return new;
  end if;
  if new.technician_id is distinct from old.technician_id and new.technician_id is not null then
    perform public.push_enqueue(new.technician_id, 'job', 'Задача передана вам', v_body);
  end if;
  if old.status is distinct from 'approved' and new.status = 'approved' then
    perform public.push_enqueue(new.technician_id, 'approve', 'Инвойс апрувлен',
      v_body || ' · $' || round(coalesce(new.approved_total, new.total, 0)));
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    perform public.push_enqueue(new.technician_id, 'reset', 'Апрув снят с инвойса', v_body);
  end if;
  return new;
end $$;
drop trigger if exists jobs_push_tg on public.jobs;
create trigger jobs_push_tg after insert or update on public.jobs
  for each row execute function public.jobs_push_tg_fn();

create or replace function public.placements_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  if new.ext_of is null and new.technician_id is not null then
    perform public.push_enqueue(new.technician_id, 'pickup', 'Новый пикап',
      'Unit ' || coalesce(nullif(new.unit_number,''),'—') || ' · до ' || to_char(new.due_date, 'DD.MM'));
  end if;
  return new;
end $$;
drop trigger if exists placements_push_tg on public.placements;
create trigger placements_push_tg after insert on public.placements
  for each row execute function public.placements_push_tg_fn();

create or replace function public.repairs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text; r record;
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
  perform public.push_enqueue(new.created_by, 'approve', v_t, v_b);
  for r in select distinct value::uuid as uid
             from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
  loop
    if r.uid is distinct from new.created_by then
      perform public.push_enqueue(r.uid, 'approve', v_t, v_b);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists repairs_push_tg on public.repairs;
create trigger repairs_push_tg after update on public.repairs
  for each row execute function public.repairs_push_tg_fn();

-- 6) Журнал времени на объектах (пишет только Edge Function bouncie) -----
create table if not exists public.site_visits (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.profiles(id) on delete cascade,
  vehicle_imei text not null default '',
  complex_id   uuid not null references public.complexes(id) on delete cascade,
  arrived_at   timestamptz not null,
  left_at      timestamptz,
  date         date not null,
  created_at   timestamptz not null default now()
);
create unique index if not exists site_visits_ux
  on public.site_visits(driver_id, complex_id, arrived_at);
create index if not exists site_visits_date_ix on public.site_visits(date);
alter table public.site_visits enable row level security;

create or replace function public.tt_can_see(viewer uuid, target uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  if viewer is null then return false; end if;
  select role, tt_self, tt_others, tt_list into v from public.profiles where id = viewer;
  if v is null then return false; end if;
  if v.role = 'admin' then return true; end if;
  if viewer = target then return coalesce(v.tt_self, false); end if;
  if v.tt_others = 'all'  then return true; end if;
  if v.tt_others = 'list' then return target = any(coalesce(v.tt_list, '{}')); end if;
  return false;
end $$;

drop policy if exists site_visits_sel on public.site_visits;
create policy site_visits_sel on public.site_visits for select to authenticated
  using (public.tt_can_see(auth.uid(), driver_id));
-- запись/правка/удаление — только service role (политик нет)

-- 7) Автомобили: ошибки, топливо, ТО --------------------------------------
alter table public.vehicles add column if not exists mil            boolean not null default false;
alter table public.vehicles add column if not exists fuel_low       boolean not null default false;
alter table public.vehicles add column if not exists last_odo       numeric;
alter table public.vehicles add column if not exists service_due_mi int;
alter table public.vehicles add column if not exists service_notified boolean not null default false;

create or replace function public.vehicle_service_set(p_id uuid, p_mi int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  update public.vehicles
     set service_due_mi = nullif(p_mi, 0), service_notified = false
   where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.vehicle_service_set(uuid,int) from public, anon;
grant execute on function public.vehicle_service_set(uuid,int) to authenticated;

-- 8) Настройки организации (нужно ДО функций сессий: sess_rights читает sess_mgr) ------------------------------------------------
alter table public.org_settings add column if not exists tpl_on             boolean;      -- шаблоны (null = вкл)
alter table public.org_settings add column if not exists sess_mgr           boolean;      -- сессии видит и менеджер
alter table public.org_settings add column if not exists code_remind        boolean;      -- напоминание о кодах
alter table public.org_settings add column if not exists code_remind_months int;          -- порог, мес (по умолчанию 12)
alter table public.org_settings add column if not exists backup_auto        boolean;      -- автобэкап при входе админа
alter table public.org_settings add column if not exists backup_last_at     timestamptz;
alter table public.org_settings add column if not exists backup_note        text;
alter table public.org_settings add column if not exists push_overdue_at    timestamptz;  -- маркер проверки просрочки

-- 9) Активные сессии -------------------------------------------------------
create or replace function public.sess_rights()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin'
      or (public.my_role() = 'manager'
          and coalesce((select sess_mgr from public.org_settings limit 1), false))
$$;

create or replace function public.admin_sessions(target uuid)
returns table (sid uuid, created_at timestamptz, refreshed_at timestamptz, ua text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sess_rights() then raise exception 'FORBIDDEN'; end if;
  return query
    select s.id, s.created_at, coalesce(s.refreshed_at, s.updated_at), coalesce(s.user_agent,'')
      from auth.sessions s
     where s.user_id = target
     order by 3 desc nulls last;
end $$;
revoke all on function public.admin_sessions(uuid) from public, anon;
grant execute on function public.admin_sessions(uuid) to authenticated;

create or replace function public.admin_last_seen()
returns table (uid uuid, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sess_rights() then raise exception 'FORBIDDEN'; end if;
  return query
    select s.user_id, max(coalesce(s.refreshed_at, s.updated_at))
      from auth.sessions s group by s.user_id;
end $$;
revoke all on function public.admin_last_seen() from public, anon;
grant execute on function public.admin_last_seen() to authenticated;

create or replace function public.admin_kill_sessions(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
end $$;
revoke all on function public.admin_kill_sessions(uuid) from public, anon;
grant execute on function public.admin_kill_sessions(uuid) to authenticated;

-- 10) Дамп auth-части для SQL-бэкапа (вызывает Edge Function backup) -------
create or replace function public.backup_dump()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role'
     and public.my_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'auth_users', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
        'raw_user_meta_data', u.raw_user_meta_data, 'created_at', u.created_at,
        'banned_until', u.banned_until))
      from auth.users u), '[]'::jsonb),
    'secrets', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value))
      from public.app_secrets s), '[]'::jsonb));
end $$;
revoke all on function public.backup_dump() from public, anon, authenticated;
grant execute on function public.backup_dump() to service_role;

-- =====================================================================
-- САМОПРОВЕРКА КОМПЛЕКТНОСТИ (v1.08.33)
-- =====================================================================
do $$
declare miss text := '';
begin
  if to_regclass('public.push_subs')   is null then miss := miss || ' push_subs'; end if;
  if to_regclass('public.push_queue')  is null then miss := miss || ' push_queue'; end if;
  if to_regclass('public.site_visits') is null then miss := miss || ' site_visits'; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='push_prefs')
    then miss := miss || ' profiles.push_prefs'; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='vehicles' and column_name='service_due_mi')
    then miss := miss || ' vehicles.service_due_mi'; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='org_settings' and column_name='tpl_on')
    then miss := miss || ' org_settings.tpl_on'; end if;
  if to_regprocedure('public.push_enqueue(uuid,text,text,text,text)') is null
    then miss := miss || ' push_enqueue(...)'; end if;
  if to_regprocedure('public.tt_can_see(uuid,uuid)') is null
    then miss := miss || ' tt_can_see(uuid,uuid)'; end if;
  if to_regprocedure('public.admin_sessions(uuid)') is null
    then miss := miss || ' admin_sessions(uuid)'; end if;
  if to_regprocedure('public.admin_kill_sessions(uuid)') is null
    then miss := miss || ' admin_kill_sessions(uuid)'; end if;
  if to_regprocedure('public.vehicle_service_set(uuid,integer)') is null
    then miss := miss || ' vehicle_service_set(uuid,int)'; end if;
  if to_regprocedure('public.backup_dump()') is null
    then miss := miss || ' backup_dump()'; end if;
  if to_regprocedure('public.bn_eff_access(uuid)') is null
    then miss := miss || ' bn_eff_access(uuid)'; end if;
  if miss <> '' then
    raise warning 'TechLog: НЕ ХВАТАЕТ:%', miss;
  else
    raise notice 'TechLog: update-to-1_08_33 выполнен (пуши, журнал времени, сессии, ТО).';
  end if;
end $$;

select 'TechLog: update-to-1_08_33 выполнен.' as result;
