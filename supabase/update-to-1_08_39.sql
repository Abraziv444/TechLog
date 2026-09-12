-- =====================================================================
-- TechLog · update-to-1_08_39.sql — БУХГАЛТЕРИЯ
-- ---------------------------------------------------------------------
-- Что добавляется (идемпотентно, безопасно повторять):
--   1) Роль accountant («Бухгалтер»): constraint profiles.role,
--      admin_set_role() и admin_create_user() принимают новую роль.
--   2) Поля учёта у документов: jobs / repairs → acc_status
--      ('' | checked | issue | paid), acc_note, acc_at, acc_by.
--      Их защищает триггер acc_guard: клиентский upsert полной строки
--      (техник сохранил инвойс со старым снимком) значения НЕ затирает —
--      менять их может только RPC acc_doc_mark (флаг techlog.acc).
--   3) RPC acc_doc_mark(kind, id, status, note) — админ и бухгалтер.
--   4) Таблица acc_settings — проценты по категориям, привязка секций
--      инвойса к категориям и опции реестра. Читают и пишут только
--      админ и бухгалтер (RLS). Штамп updated_at/updated_by — триггером.
--   5) RLS чтения для бухгалтера: jobs, placements, proposals, repairs и
--      can_view_job() (через неё — медиа).
--   6) admin_restore_rows(): acc_settings в списке восстанавливаемых.
-- =====================================================================

-- 1) Роль accountant --------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','manager','tech','accountant'));

create or replace function public.admin_set_role(target uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('admin','manager','tech','accountant') then raise exception 'BAD_ROLE'; end if;
  if target = auth.uid() and p_role <> 'admin' then raise exception 'SELF_DEMOTE'; end if;
  update public.profiles set role = p_role where id = target;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

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
revoke all on function public.admin_create_user(text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text) to authenticated;

-- 2) Поля учёта у документов -------------------------------------------
alter table public.jobs add column if not exists acc_status text not null default '';
alter table public.jobs add column if not exists acc_note   text not null default '';
alter table public.jobs add column if not exists acc_at     timestamptz;
alter table public.jobs add column if not exists acc_by     uuid references public.profiles(id) on delete set null;
alter table public.jobs drop constraint if exists jobs_acc_status_ck;
alter table public.jobs add constraint jobs_acc_status_ck check (acc_status in ('','checked','issue','paid'));

alter table public.repairs add column if not exists acc_status text not null default '';
alter table public.repairs add column if not exists acc_note   text not null default '';
alter table public.repairs add column if not exists acc_at     timestamptz;
alter table public.repairs add column if not exists acc_by     uuid references public.profiles(id) on delete set null;
alter table public.repairs drop constraint if exists repairs_acc_status_ck;
alter table public.repairs add constraint repairs_acc_status_ck check (acc_status in ('','checked','issue','paid'));

-- Учётные поля меняет только acc_doc_mark (флаг techlog.acc) и восстановление
-- из бэкапа (INSERT — триггер на него не вешаем). Любой другой UPDATE
-- (полная строка из приложения) получает прежние значения.
create or replace function public.acc_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('techlog.acc', true) is distinct from '1'
     and current_setting('techlog.restore', true) is distinct from '1' then
    new.acc_status := old.acc_status;
    new.acc_note   := old.acc_note;
    new.acc_at     := old.acc_at;
    new.acc_by     := old.acc_by;
  end if;
  return new;
end $$;
drop trigger if exists jobs_acc_guard_tg on public.jobs;
create trigger jobs_acc_guard_tg before update on public.jobs
  for each row execute function public.acc_guard();
drop trigger if exists repairs_acc_guard_tg on public.repairs;
create trigger repairs_acc_guard_tg before update on public.repairs
  for each row execute function public.acc_guard();

-- 3) RPC: отметка бухгалтера --------------------------------------------
create or replace function public.acc_doc_mark(p_kind text, p_id uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_st text := coalesce(p_status, ''); v_note text := coalesce(p_note, '');
        v_at timestamptz := now(); v_by uuid := auth.uid(); v_rc int := 0;
begin
  if coalesce(public.my_role(), 'tech') not in ('admin','accountant') then raise exception 'FORBIDDEN'; end if;
  if v_st not in ('','checked','issue','paid') then raise exception 'BAD_STATUS'; end if;
  if length(v_note) > 2000 then raise exception 'NOTE_TOO_LONG'; end if;
  if p_kind not in ('job','rep') then raise exception 'BAD_KIND'; end if;
  perform set_config('techlog.acc', '1', true);          -- флаг только на время этого UPDATE
  if p_kind = 'job' then
    update public.jobs set acc_status = v_st, acc_note = v_note, acc_at = v_at, acc_by = v_by where id = p_id;
  else
    update public.repairs set acc_status = v_st, acc_note = v_note, acc_at = v_at, acc_by = v_by where id = p_id;
  end if;
  get diagnostics v_rc = row_count;
  perform set_config('techlog.acc', '', true);
  if v_rc = 0 then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('acc_status', v_st, 'acc_note', v_note, 'acc_at', v_at, 'acc_by', v_by);
end $$;
revoke all on function public.acc_doc_mark(text, uuid, text, text) from public, anon;
grant execute on function public.acc_doc_mark(text, uuid, text, text) to authenticated;

-- 4) Настройки бухгалтерии ------------------------------------------------
--   id:  rate:clean | rate:rep | rate:rent | rate:rent:<equipment_type_id> | rate:mat
--        map:<секция инвойса>  ·  opt:label  ·  opt:split
--   pct: процент (0–100) для rate:*;  val: категория для map:* и значение opt:*
create table if not exists public.acc_settings (
  id         text primary key,
  pct        numeric,
  val        text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint acc_settings_pct_ck check (pct is null or (pct >= 0 and pct <= 100))
);
alter table public.acc_settings enable row level security;
drop policy if exists acc_sel on public.acc_settings;
create policy acc_sel on public.acc_settings for select to authenticated
  using (public.my_role() in ('admin','accountant'));
drop policy if exists acc_wr on public.acc_settings;
create policy acc_wr on public.acc_settings for all to authenticated
  using (public.my_role() in ('admin','accountant'))
  with check (public.my_role() in ('admin','accountant'));

create or replace function public.acc_settings_stamp()
returns trigger language plpgsql as $$
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists acc_settings_stamp_tg on public.acc_settings;
create trigger acc_settings_stamp_tg before insert or update on public.acc_settings
  for each row execute function public.acc_settings_stamp();

-- 5) Чтение документов бухгалтером ----------------------------------------
create or replace function public.can_view_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.technician_id = auth.uid()
      or public.my_role() in ('admin','manager','accountant')
      or (j.shared_with_helpers and j.helper_ids ? auth.uid()::text
          and public.shared_jobs_enabled())
    )
  )
$$;

drop policy if exists jobs_sel on public.jobs;
create policy jobs_sel on public.jobs for select to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager','accountant')
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );

drop policy if exists pl_sel on public.placements;
create policy pl_sel on public.placements for select to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager','accountant')
         or public.is_shared_job_helper(job_id));

drop policy if exists prop_sel on public.proposals;
create policy prop_sel on public.proposals for select to authenticated
  using (
    public.my_role() in ('admin','manager','accountant')
    or exists (select 1 from public.jobs j
               where j.proposal_id = proposals.id and public.can_view_job(j.id))
  );

drop policy if exists rep_sel on public.repairs;
create policy rep_sel on public.repairs for select to authenticated
  using (
    public.my_role() in ('admin','manager','accountant')
    or created_by = auth.uid()
    or (job_id is not null and public.can_view_job(job_id))
  );

-- 6) Бэкап: acc_settings восстанавливается кнопкой ------------------------
create or replace function public.admin_restore_rows(p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'profiles','counterparties','complexes','aux_equipment','work_types',
    'equipment_types','size_types','extra_works','product_types','price_list',
    'counterparty_prices','equipment_stock','org_settings','code_requests',
    'complex_code_history','hidden_staff','proposals','jobs','placements',
    'ext_requests','media','repairs','equip_moves','acc_settings'];
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
revoke all on function public.admin_restore_rows(text, jsonb) from public, anon;
grant execute on function public.admin_restore_rows(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Самопроверка
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check'
                   and pg_get_constraintdef(oid) like '%accountant%')
     then miss := miss || ' profiles.role(accountant)'; end if;
  if to_regclass('public.acc_settings') is null then miss := miss || ' acc_settings'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'jobs' and column_name = 'acc_status')
     then miss := miss || ' jobs.acc_status'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'repairs' and column_name = 'acc_status')
     then miss := miss || ' repairs.acc_status'; end if;
  if to_regprocedure('public.acc_doc_mark(text,uuid,text,text)') is null then miss := miss || ' acc_doc_mark()'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'jobs_acc_guard_tg' and tgrelid = 'public.jobs'::regclass)
     then miss := miss || ' jobs_acc_guard_tg'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'repairs_acc_guard_tg' and tgrelid = 'public.repairs'::regclass)
     then miss := miss || ' repairs_acc_guard_tg'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs'
                   and policyname = 'jobs_sel' and coalesce(qual, '') like '%accountant%')
     then miss := miss || ' jobs_sel(accountant)'; end if;
  if miss <> '' then
    raise exception 'TechLog 1.08.39: не хватает —%', miss;
  else
    raise notice 'TechLog: обновление 1.08.39 применено — бухгалтерия готова (роль, учётные поля, проценты, RPC).';
  end if;
end $$;
