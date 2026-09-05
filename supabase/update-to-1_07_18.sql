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
