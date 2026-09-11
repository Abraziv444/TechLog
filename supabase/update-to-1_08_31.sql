-- =====================================================================
-- TechLog · update-to-1_08_31.sql — роли сотрудников и админский upsert
-- ---------------------------------------------------------------------
-- Чинит: администратор не мог изменить роль (и номер машины) сотрудника.
-- Причина: клиент пишет профиль через UPSERT, а PostgreSQL при
-- INSERT ... ON CONFLICT проверяет INSERT-политику ещё ДО разрешения
-- конфликта. Политика profiles_ins разрешала вставку только собственной
-- строки (id = auth.uid()) — админский upsert чужого профиля падал с
-- «new row violates row-level security policy for table profiles».
--
-- Что делает файл (идемпотентно, можно выполнять повторно):
--   1) profiles_ins: администратору разрешён и «вставочный» путь upsert;
--      защита полей остаётся на триггере profiles_guard (role / blocked /
--      login / car_no меняет только админ) и UPDATE-политике.
--   2) Новая RPC public.admin_set_role(target, p_role) — явный канал
--      смены роли, симметричный admin_set_blocked: только админ,
--      роли admin|manager|tech, самому себе роль не понизить
--      (SELF_DEMOTE), несуществующий сотрудник — NOT_FOUND.
-- Выполните файл целиком в Supabase SQL Editor.
-- =====================================================================

-- 1) INSERT-политика: свой профиль — как раньше; админ — любой (для upsert)
drop policy if exists profiles_ins on public.profiles;
create policy profiles_ins on public.profiles for insert to authenticated
  with check (id = auth.uid() or public.my_role() = 'admin');

-- 2) Смена роли сотрудника — только администратор
create or replace function public.admin_set_role(target uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('admin','manager','tech') then raise exception 'BAD_ROLE'; end if;
  if target = auth.uid() and p_role <> 'admin' then raise exception 'SELF_DEMOTE'; end if;
  update public.profiles set role = p_role where id = target;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Самопроверка
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if to_regprocedure('public.admin_set_role(uuid,text)') is null
     then miss := miss || ' admin_set_role()'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'profiles' and policyname = 'profiles_ins'
                   and coalesce(with_check, '') like '%my_role%')
     then miss := miss || ' profiles_ins(admin)'; end if;
  if miss <> '' then
    raise exception 'TechLog 1.08.31: не хватает —%', miss;
  else
    raise notice 'TechLog: обновление 1.08.31 применено — роли сотрудников меняются, админский upsert профилей разрешён.';
  end if;
end $$;
