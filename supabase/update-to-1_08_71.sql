-- =====================================================================
-- TechLog · обновление до v1.08.71 (включает и 1.08.70)
--  · org_settings.study_shuffle      — перемешивание вариантов ответов в тестах (1.08.70)
--  · org_settings.media_lock_approved — «после апрува файлы неприкосновенны» (1.08.71)
-- Идемпотентно: можно запускать повторно. С нуля — full-install-1_08_71.sql.
-- После обновления передеплойте Edge Function media-delete (замок на архивацию).
-- =====================================================================
alter table public.org_settings add column if not exists study_shuffle       boolean not null default true;
alter table public.org_settings add column if not exists media_lock_approved boolean not null default true;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='study_shuffle')
     then miss := miss || ' org_settings.study_shuffle'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='media_lock_approved')
     then miss := miss || ' org_settings.media_lock_approved'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт.', miss;
  else raise notice 'TechLog: схема соответствует v1.08.71 — всё на месте.'; end if;
end $$;

select 'TechLog v1.08.71 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
