-- =====================================================================
-- TechLog · update-to-1_09_44.sql  (после 1.09.43; идемпотентно — можно запускать повторно)
--  Замечание по коду v1.09.38, п. 52 (мёртвый код): функция vehicle_service_set («ТО на пробеге», 1.08.33)
--  интерфейсом не вызывается с 1.09.38 — ТО ведётся по видам (maint_types / vehicle_maint). Удаляется.
--  Колонки vehicles.service_due_mi / service_notified остаются в архиве (пометка 1.09.42), данные не трогаем.
-- =====================================================================
drop function if exists public.vehicle_service_set(uuid, int);

-- ▄▄▄▄▄▄▄▄▄▄ САМОПРОВЕРКА ▄▄▄▄▄▄▄▄▄▄
do $$
declare miss text := '';
begin
  if to_regprocedure('public.vehicle_service_set(uuid,int)') is not null then miss := miss || ' vehicle_service_set ещё есть'; end if;
  if to_regclass('public.profiles_pub') is null then miss := miss || ' (сначала update-to-1_09_43.sql)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.44 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.44 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
