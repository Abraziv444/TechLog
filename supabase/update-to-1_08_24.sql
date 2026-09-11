-- ============================================================
-- TechLog · update to v1.08.24
-- ФОТО «ДО/ПОСЛЕ» В ДОКУМЕНТЕ РЕМОНТА.
--   repairs.photos — пометки к снимкам инвойса: {"before":[id…],"after":[id…]}
-- Сами файлы остаются в media у связанной работы и уходят на Диск
-- обычным маршрутом — Edge-функции не меняются и передеплой не нужен.
-- Уведомление «апрув слетел» отдельных полей не требует: это черновик,
-- у которого последней записью в repairs.hist стоит снятие апрува.
-- Ставится поверх 1.08.23. Идемпотентно.
-- ============================================================

alter table public.repairs
  add column if not exists photos jsonb not null default '{"before": [], "after": []}'::jsonb;

-- Старым документам — тот же вид, что и у новых.
update public.repairs
   set photos = '{"before": [], "after": []}'::jsonb
 where photos is null
    or jsonb_typeof(photos) <> 'object';

-- ---------------------------------------------------------------------
-- Самопроверка
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if to_regclass('public.repairs') is null then miss := miss || ' repairs'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'repairs'
                   and column_name = 'photos') then miss := miss || ' repairs.photos'; end if;
  if miss <> '' then
    raise warning 'TechLog 1.08.24: НЕ ХВАТАЕТ:%  — сначала выполните update-to-1_08_23.sql.', miss;
  else
    raise notice 'TechLog 1.08.24: фото «до/после» на месте.';
  end if;
end $$;

select 'TechLog v1.08.24 — скрипт выполнен.' as result;
