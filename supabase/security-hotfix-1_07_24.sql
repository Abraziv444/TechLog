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
