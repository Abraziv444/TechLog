-- =====================================================================
-- TechLog · обновление до v1.09.09 — порядок справочников и режим склада
--  · org_settings.dir_order (jsonb)  — порядок вкладок «Справочников», общий для всех;
--  · org_settings.stock_mode (text)  — 'full' | 'lite', по умолчанию 'full'.
-- Идемпотентно: можно запускать повторно. Включает и update-to-1_09_08 (колонка
-- work_types.preset и вид OTHER) — если тот скрипт ещё не выполнялся, достаточно этого.
-- С нуля — full-install-1_09_09.sql. Edge Functions не менялись.
-- =====================================================================

-- =====================================================================
-- v1.09.08 · СТАНДАРТНЫЕ ГАЛОЧКИ ВИДА РАБОТЫ + вид работы OTHER
-- =====================================================================
-- work_types.preset — массив «раздел.ключ» галочек бланка, которые ставятся
-- сами при создании документа этого вида (и при смене вида в документе с
-- нетронутыми галочками). NULL = встроенный набор приложения по названию
-- вида (VETVAG → Wet Vac, DAMAGE WATER → Flood, STEAM → Deep Scrub,
-- AIR DUCT → Air Duct Cleaning); админ правит в «Справочники → Виды задач».
alter table public.work_types add column if not exists preset jsonb;

-- вид работы OTHER: пустой набор галочек; не добавляется, если свой «Other» уже заведён
insert into public.work_types (id, name, color, needs_aux, aux_ids, sort)
select 'b0000000-0000-4000-8000-000000000007'::uuid, 'OTHER', '#8AA0AB', false, '[]'::jsonb, 7
where not exists (select 1 from public.work_types where upper(name) like 'OTHER%')
on conflict (id) do nothing;

-- =====================================================================
-- v1.09.09 · ПОРЯДОК СПРАВОЧНИКОВ + РЕЖИМ СКЛАДА
-- =====================================================================
-- org_settings.dir_order  — порядок вкладок «Справочников», общий для всех (массив ключей вкладок;
--                           пусто = порядок по умолчанию). Личная вкладка «по умолчанию» лежит
--                           в profiles.push_prefs.dir_default — колонка не нужна.
-- org_settings.stock_mode — 'full' (склад → машина → объект → машина → склад) или 'lite'
--                           (только аренда/продление вычитают, «Забрал» возвращает; машины не считаются).
alter table public.org_settings add column if not exists dir_order  jsonb;
alter table public.org_settings add column if not exists stock_mode text not null default 'full';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'org_settings_stock_mode_chk') then
    alter table public.org_settings add constraint org_settings_stock_mode_chk check (stock_mode in ('full','lite'));
  end if;
end $$;

do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='work_types' and column_name='preset')
     then miss := miss || ' work_types.preset'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='dir_order')
     then miss := miss || ' org_settings.dir_order'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='stock_mode')
     then miss := miss || ' org_settings.stock_mode'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.09 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.09 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
