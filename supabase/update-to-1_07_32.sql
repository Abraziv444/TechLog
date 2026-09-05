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
