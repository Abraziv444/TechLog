-- Обновление БД до v1.08.51 (после full-install-1_08_48 или новее).
-- УЧЁБА: сессии тестов и чтения, доступ сотрудников. Выполнять целиком.

-- =====================================================================
-- v1.08.51 · УЧЁБА — тесты по разделам учебника и учебные материалы
-- 1) org_settings: study_on (общий выключатель), study_all (всем /
--    по списку), study_pass (порог зачёта, %).
-- 2) profiles: study_access (флаг «по списку», ставит только админ —
--    защищён в profiles_guard), study_off (сотрудник сам прячет кнопку
--    «Учёба» из меню; своё поле, меняет сам).
-- 3) Таблица study_sessions — одна строка на пройденный тест (kind=test:
--    итоги + ответы по каждому вопросу в answers jsonb) или на чтение
--    учебника (kind=read: только время). RLS: свои строки — читать и
--    писать; админ читает все (статистика) и может удалять.
-- 4) admin_restore_rows: study_sessions в списке восстанавливаемых.
-- Скрипт идемпотентен: безопасен для повторного запуска.
-- =====================================================================

-- 1) Настройки организации ------------------------------------------
alter table public.org_settings add column if not exists study_on   boolean not null default true;
alter table public.org_settings add column if not exists study_all  boolean not null default true;
alter table public.org_settings add column if not exists study_pass int     not null default 70;

-- 2) Профили ---------------------------------------------------------
alter table public.profiles add column if not exists study_access boolean;
alter table public.profiles add column if not exists study_off    boolean not null default false;

-- profiles_guard v3: + study_access меняет только админ
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
       or new.study_access is distinct from old.study_access then
      raise exception 'FORBIDDEN_FIELD';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg before update on public.profiles
  for each row execute function public.profiles_guard();

-- 3) Сессии учёбы ----------------------------------------------------
create table if not exists public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'test' check (kind in ('test','read')),
  section     int  not null default 0,
  quiz_id     text,
  file        text,
  mode        text,              -- learn | exam
  lang        text,              -- ru | en
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms bigint not null default 0,
  total       int not null default 0,
  answered    int not null default 0,
  correct     int not null default 0,
  wrong       int not null default 0,
  score_pct   int,
  passed      boolean,
  answers     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists study_sessions_user_idx on public.study_sessions(user_id, started_at desc);
create index if not exists study_sessions_sec_idx  on public.study_sessions(section, kind);

alter table public.study_sessions enable row level security;

drop policy if exists study_sel on public.study_sessions;
create policy study_sel on public.study_sessions for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');

drop policy if exists study_ins on public.study_sessions;
create policy study_ins on public.study_sessions for insert to authenticated
  with check (user_id = auth.uid() or public.my_role() = 'admin');

-- update нужен для upsert из очереди (повторная отправка той же строки);
-- чужие строки не правит никто, кроме админа (восстановление из бэкапа)
drop policy if exists study_upd on public.study_sessions;
create policy study_upd on public.study_sessions for update to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin')
  with check (user_id = auth.uid() or public.my_role() = 'admin');

drop policy if exists study_del on public.study_sessions;
create policy study_del on public.study_sessions for delete to authenticated
  using (public.my_role() = 'admin');

grant select, insert, update, delete on public.study_sessions to authenticated;

-- 4) Бэкап: study_sessions восстанавливается тем же admin_restore_rows
create or replace function public.admin_restore_rows(p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'profiles','counterparties','complexes','aux_equipment','work_types',
    'equipment_types','size_types','extra_works','product_types','price_list',
    'counterparty_prices','equipment_stock','org_settings','code_requests',
    'complex_code_history','hidden_staff','proposals','jobs','placements',
    'ext_requests','media','repairs','equip_moves','acc_settings','study_sessions'];
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
-- Самопроверка v1.08.51
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if to_regclass('public.study_sessions') is null then miss := miss || ' study_sessions'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='study_access')
     then miss := miss || ' profiles.study_access'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='study_on')
     then miss := miss || ' org_settings.study_on'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_sessions' and policyname='study_sel')
     then miss := miss || ' study_sel'; end if;
  if miss <> '' then
    raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else
    raise notice 'TechLog: схема соответствует v1.08.51 — всё на месте.';
  end if;
end $$;

select 'TechLog v1.08.51 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
