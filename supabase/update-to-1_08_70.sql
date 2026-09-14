-- =====================================================================
-- TechLog · обновление до v1.08.70
-- Перемешивание вариантов ответов в тестах учёбы: галочка администратора
-- «Перемешивать варианты ответов» (по умолчанию включена).
-- Идемпотентно: можно запускать повторно. Если ставите с нуля —
-- достаточно full-install-1_08_70.sql (он включает это).
-- =====================================================================
alter table public.org_settings add column if not exists study_shuffle boolean not null default true;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='study_shuffle')
     then raise warning 'TechLog: НЕ ХВАТАЕТ org_settings.study_shuffle — перезапустите скрипт.';
  else raise notice 'TechLog: схема соответствует v1.08.70 — всё на месте.'; end if;
end $$;

select 'TechLog v1.08.70 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
