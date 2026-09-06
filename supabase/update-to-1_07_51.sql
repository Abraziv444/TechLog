-- =====================================================================
-- TechLog · update-to-1_07_51.sql — ФИКС РЕГИСТРАЦИИ ПО ИНВАЙТ-КОДУ
--
-- Симптом: check_invite / login_available / signup_precheck падают с
--   25006 · cannot execute INSERT in a read-only transaction
-- (видно в БД-диагностике; регистрация новых сотрудников не работает).
--
-- Причина: security-hotfix-1_07_24 добавил внутрь этих функций вызов
-- public.throttle() с INSERT в rpc_throttle (анти-брутфорс), но сами
-- функции остались объявлены STABLE. PostgREST исполняет STABLE-функции
-- в read-only транзакции даже при POST — INSERT внутри запрещён.
--
-- Фикс: те же тела, но VOLATILE (volatility просто не указана — это
-- значение по умолчанию). Вход в приложение не затронут (он через
-- GoTrue); ломалась только регистрация по коду приглашения.
--
-- Идемпотентно: безопасно выполнять повторно. Самодостаточно: обвязка
-- (rpc_throttle / client_ip / throttle) создаётся, если её ещё нет.
-- =====================================================================

create table if not exists public.rpc_throttle (
  key text primary key,
  cnt int not null default 1,
  window_start timestamptz not null default now()
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

-- ------- те же функции, что в hotfix-1_07_24, но VOLATILE -------

create or replace function public.check_invite(code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.throttle('invite', 10, interval '15 minutes');
  return public.is_valid_invite(code);
end $$;

create or replace function public.login_available(p_login text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.throttle('login_free', 30, interval '15 minutes');
  return not exists (
    select 1 from public.profiles where lower(login) = lower(coalesce(p_login,''))
  );
end $$;

create or replace function public.signup_precheck(p_login text, p_invite text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := lower(coalesce(p_login,''));
begin
  perform public.throttle('signup', 15, interval '15 minutes');
  if v !~ '^[a-z0-9_.-]{3,32}$' then return 'BAD_LOGIN'; end if;
  if not public.is_valid_invite(p_invite) then return 'BAD_INVITE'; end if;
  if exists (select 1 from public.profiles where lower(login) = v) then return 'LOGIN_TAKEN'; end if;
  return 'OK';
end $$;

-- регистрация идёт до входа — функции доступны и анонимному клиенту
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.login_available(text) to anon, authenticated;
grant execute on function public.signup_precheck(text, text) to anon, authenticated;

-- контроль: все три должны стать 'v' (volatile)
-- select proname, provolatile from pg_proc
--  where proname in ('check_invite','login_available','signup_precheck');
