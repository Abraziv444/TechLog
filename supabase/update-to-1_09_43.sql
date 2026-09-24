-- =====================================================================
-- TechLog · update-to-1_09_43.sql  (после 1.09.42; идемпотентно — можно запускать повторно)
--  Замечание по коду v1.09.38, п. 8 — база отдавала любому вошедшему больше, чем показывает приложение.
--  1) ПРОФИЛИ. Строку профиля целиком читает только сам человек и админ. Остальные видят сотрудников через
--     представление profiles_pub — только то, что нужно для работы: имя, логин, роль, номер машины,
--     блокировка, сокращение для номеров документов, право апрува (кому уходят документы на согласование).
--     Личные настройки (push_prefs), доступы (трекер, журнал времени, учёба, правка общих документов,
--     объявления) и вид сотрудника чужим больше не отдаются. Функции базы (security definer) и Edge Functions
--     (сервисный ключ) читают профили как раньше.
--  2) СКЛАД. Журнал движений (equip_moves), суточные остатки (stock_daily) и старые остатки (equipment_stock)
--     сотрудник читает только при включённой галочке «Сотрудники видят остатки склада»; иначе — только движения
--     своей машины и свои операции. Сколько доступно для «Взять» / «В ремонт», сотрудник спрашивает у функции
--     stock_avail() — она отдаёт только итоговые числа по типам, без журнала.
--  Что намеренно НЕ закрыто: прайс и цены контрагентов (без них не посчитать инвойс), справочники,
--  машины (номер, марка, VIN — VIN и так написан на машине; водителю и карте они нужны).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Профили
-- ---------------------------------------------------------------------
create or replace view public.profiles_pub with (security_barrier = true) as
  select id, login, display_name, role, created_at, car_no, blocked, tag, can_approve
  from public.profiles;
comment on view public.profiles_pub is 'v1.09.43: сотрудники для всех вошедших — только рабочие поля. Полную строку читают сам человек и админ (политика profiles_sel).';
revoke all on public.profiles_pub from public, anon;
grant select on public.profiles_pub to authenticated;

drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');

-- ---------------------------------------------------------------------
-- 2. Склад
-- ---------------------------------------------------------------------
create or replace function public.stock_visible_me()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(), '') in ('admin','manager','accountant')
      or coalesce((select stock_visible_all from public.org_settings where id = 'org'), true)
$$;
revoke all on function public.stock_visible_me() from public, anon;
grant execute on function public.stock_visible_me() to authenticated;

drop policy if exists em_sel on public.equip_moves;
create policy em_sel on public.equip_moves for select to authenticated
  using (public.stock_visible_me() or tech_id = auth.uid() or actor = auth.uid());

drop policy if exists sd_sel on public.stock_daily;
create policy sd_sel on public.stock_daily for select to authenticated
  using (public.stock_visible_me());

drop policy if exists stock_sel on public.equipment_stock;
create policy stock_sel on public.equipment_stock for select to authenticated
  using (public.stock_visible_me());

-- сколько на складе и в ремонте по каждому типу — итог журнала, без самих строк
create or replace function public.stock_avail()
returns table (equipment_type_id uuid, stock int, repair int)
language sql stable security definer set search_path = public as $$
  select m.equipment_type_id,
         (coalesce(sum(m.qty) filter (where m.to_loc = 'stock'), 0) - coalesce(sum(m.qty) filter (where m.from_loc = 'stock'), 0))::int,
         (coalesce(sum(m.qty) filter (where m.to_loc = 'repair'), 0) - coalesce(sum(m.qty) filter (where m.from_loc = 'repair'), 0))::int
  from public.equip_moves m
  where auth.uid() is not null
  group by m.equipment_type_id
$$;
revoke all on function public.stock_avail() from public, anon;
grant execute on function public.stock_avail() to authenticated;

-- ▄▄▄▄▄▄▄▄▄▄ САМОПРОВЕРКА ▄▄▄▄▄▄▄▄▄▄
do $$
declare miss text := '';
begin
  if to_regclass('public.profiles_pub') is null then miss := miss || ' profiles_pub'; end if;
  if not exists (select 1 from pg_policy where polname = 'profiles_sel' and polrelid = 'public.profiles'::regclass
                 and pg_get_expr(polqual, polrelid) like '%auth.uid()%') then miss := miss || ' profiles_sel'; end if;
  if to_regprocedure('public.stock_avail()') is null then miss := miss || ' stock_avail'; end if;
  if not exists (select 1 from pg_policy where polname = 'em_sel' and pg_get_expr(polqual, polrelid) like '%stock_visible_me%') then miss := miss || ' em_sel'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'org_settings' and column_name = 'media_mb_photo') then miss := miss || ' (сначала update-to-1_09_42.sql)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.43 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.43 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
