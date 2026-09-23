-- =====================================================================
-- TechLog · update-to-1_09_42.sql  (после 1.09.40; идемпотентно — можно запускать повторно)
--  Замечания по коду v1.09.38 (третий пакет):
--  1) п. 51 — предельный размер файла задаёт админ в Настройках (МБ): media_mb_photo / _video / _file / _invoice.
--     Пусто — действуют прежние значения из media-begin (8 / 120 / 25 / 20 МБ). Проверяет media-begin 1.09.42.
--  2) п. 53 — устаревшие таблица и колонки помечены как архив (данные не трогаем): equipment_stock (остатки
--     считаются по журналу equip_moves с v1.08.27), doc_shares (журнал «Поделиться» заменён чатом в 1.09.21),
--     vehicles.service_due_mi / service_notified (ТО по видам из справочника с 1.09.38).
--  3) п. 55 — проверка роли в full-install исправлена в самом create table (здесь — только сверка).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Размер файлов
-- ---------------------------------------------------------------------
alter table public.org_settings add column if not exists media_mb_photo   int;
alter table public.org_settings add column if not exists media_mb_video   int;
alter table public.org_settings add column if not exists media_mb_file    int;
alter table public.org_settings add column if not exists media_mb_invoice int;
alter table public.org_settings drop constraint if exists org_settings_media_mb_chk;
alter table public.org_settings add constraint org_settings_media_mb_chk check (
      (media_mb_photo   is null or media_mb_photo   between 1 and 50)
  and (media_mb_video   is null or media_mb_video   between 10 and 500)
  and (media_mb_file    is null or media_mb_file    between 1 and 100)
  and (media_mb_invoice is null or media_mb_invoice between 1 and 50));

-- ---------------------------------------------------------------------
-- 2. Архивные таблица и колонки (только пометка)
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('public.equipment_stock') is not null then
    comment on table public.equipment_stock is 'АРХИВ (v1.09.42): остатки считаются по журналу equip_moves с v1.08.27; приложение таблицу не читает и не пишет, в бэкап попадает для совместимости';
  end if;
  if to_regclass('public.doc_shares') is not null then
    comment on table public.doc_shares is 'АРХИВ (v1.09.42): журнал «Поделиться документом» 1.09.14, заменён чатом «Сообщения» в 1.09.21; новые строки не пишутся';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicles' and column_name = 'service_due_mi') then
    comment on column public.vehicles.service_due_mi is 'АРХИВ (v1.09.42): ТО по видам — таблицы maint_types / vehicle_maint (1.09.38); колонка очищена, приложение её не показывает';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicles' and column_name = 'service_notified') then
    comment on column public.vehicles.service_notified is 'АРХИВ (v1.09.42): см. vehicle_maint';
  end if;
end $$;

-- ▄▄▄▄▄▄▄▄▄▄ САМОПРОВЕРКА ▄▄▄▄▄▄▄▄▄▄
do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'org_settings' and column_name = 'media_mb_invoice') then miss := miss || ' org_settings.media_mb_*'; end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check'
                 and pg_get_constraintdef(oid) like '%accountant%') then miss := miss || ' profiles_role_check(accountant)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'audit_guard_tg') then miss := miss || ' (сначала update-to-1_09_40.sql)'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.42 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.42 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
