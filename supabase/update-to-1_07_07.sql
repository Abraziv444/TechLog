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
