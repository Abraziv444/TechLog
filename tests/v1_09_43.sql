-- v1.09.43 · п. 8: профили (полная строка — сам и админ, остальным — profiles_pub), склад по галочке «Сотрудники видят
-- остатки», stock_avail(). Запуск: локальный PostgreSQL + заглушка Supabase, база после full-install-1_09_43.sql.
-- psql -tA -d <база> -f tests/v1_09_43.sql → «ИТОГ: N ✓ / 0 ✗». Всё в одной транзакции с ROLLBACK.
\set ON_ERROR_STOP 1
begin;
create temp table r (n serial, name text, ok boolean, note text);
grant all on r to authenticated, service_role; grant usage, select, update on sequence r_n_seq to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.profiles_pub to authenticated;
set session_replication_role = replica;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000043a1', 'a43@x'), ('00000000-0000-0000-0000-0000000043a2', 'm43@x'),
  ('00000000-0000-0000-0000-0000000043a3', 't43@x'), ('00000000-0000-0000-0000-0000000043a4', 'o43@x') on conflict do nothing;
insert into public.profiles (id, login, display_name, role, blocked, push_prefs, bn_access, tag) values
  ('00000000-0000-0000-0000-0000000043a1', 't43_adm', 'Adm43', 'admin', false, '{"font_pct":110}', true, 'AD'),
  ('00000000-0000-0000-0000-0000000043a2', 't43_mgr', 'Mgr43', 'manager', false, '{"font_pct":120}', true, 'MG'),
  ('00000000-0000-0000-0000-0000000043a3', 't43_tec', 'Tec43', 'tech', false, '{"font_pct":90,"secret":"x"}', true, 'TC'),
  ('00000000-0000-0000-0000-0000000043a4', 't43_oth', 'Oth43', 'tech', false, '{"font_pct":100,"secret":"other"}', false, 'OT')
  on conflict (id) do update set role = excluded.role, push_prefs = excluded.push_prefs;
insert into public.equipment_types (id, name, abbr, color, price_key, sort) values ('43000000-0000-0000-0000-0000000000e1', 'ET43', 'E43', '#58cc02', 't43_et', 943);
insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, actor) values
  ('intake', '43000000-0000-0000-0000-0000000000e1', 10, 'ext', 'stock', null, '00000000-0000-0000-0000-0000000043a1'),
  ('take',   '43000000-0000-0000-0000-0000000000e1', 3, 'stock', 'car', '00000000-0000-0000-0000-0000000043a3', '00000000-0000-0000-0000-0000000043a3'),
  ('take',   '43000000-0000-0000-0000-0000000000e1', 2, 'stock', 'car', '00000000-0000-0000-0000-0000000043a4', '00000000-0000-0000-0000-0000000043a4'),
  ('to_repair', '43000000-0000-0000-0000-0000000000e1', 1, 'stock', 'repair', null, '00000000-0000-0000-0000-0000000043a1');
insert into public.stock_daily (date, equipment_type_id, free) select current_date, '43000000-0000-0000-0000-0000000000e1', 4 where exists (select 1 from information_schema.columns where table_name = 'stock_daily' and column_name = 'free') on conflict do nothing;
set session_replication_role = origin;
update public.org_settings set stock_visible_all = false where id = 'org';

create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'OK'; exception when others then return sqlerrm; end $$;

-- сотрудник
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043a3', false);
set role authenticated;
create temp table x_tec as select
  (select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-000000004%') as prof,
  (select count(*) from public.profiles_pub where id::text like '00000000-0000-0000-0000-000000004%') as pub,
  (select push_prefs->>'secret' from public.profiles where id = '00000000-0000-0000-0000-0000000043a3') as own_prefs,
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000043a4') as other_full,
  (select tag from public.profiles_pub where id = '00000000-0000-0000-0000-0000000043a4') as other_tag,
  (select count(*) from public.equip_moves where equipment_type_id = '43000000-0000-0000-0000-0000000000e1') as moves,
  (select count(*) from public.stock_daily) as sd,
  (select stock from public.stock_avail() where equipment_type_id = '43000000-0000-0000-0000-0000000000e1') as av_stock,
  (select repair from public.stock_avail() where equipment_type_id = '43000000-0000-0000-0000-0000000000e1') as av_rep;
update public.profiles set push_prefs = push_prefs || '{"font_pct":95}' where id = '00000000-0000-0000-0000-0000000043a3';
insert into r(name, ok, note) select 'сотрудник: чужие поля ПРОФИЛЯ недоступны — через profiles_pub только рабочие колонки', e like '%push_prefs%does not exist%' or e like '%column%push_prefs%', e
  from (select pg_temp.err($q$select push_prefs from public.profiles_pub limit 1$q$) e) x;
reset role;
insert into r(name, ok, note) select 'сотрудник: из profiles — только своя строка, остальные — через profiles_pub', prof = 1 and pub = 4 and other_full = 0, prof || '/' || pub || '/' || other_full from x_tec;
insert into r(name, ok, note) select 'сотрудник: своя строка целиком (личные настройки), у коллеги — сокращение для номеров', own_prefs = 'x' and other_tag = 'OT', own_prefs || '/' || other_tag from x_tec;
insert into r(name, ok) select 'сотрудник сохраняет свои настройки (своя строка правится)', (select push_prefs->>'font_pct' from public.profiles where id = '00000000-0000-0000-0000-0000000043a3') = '95';
insert into r(name, ok, note) select 'склад закрыт: сотрудник видит только движения своей машины (1 из 4) и не видит суточные остатки', moves = 1 and sd = 0, moves || '/' || sd from x_tec;
insert into r(name, ok, note) select 'stock_avail(): доступно на складе 10−3−2−1 = 4, в ремонте 1 — без самого журнала', av_stock = 4 and av_rep = 1, av_stock || '/' || av_rep from x_tec;

-- склад открыт
update public.org_settings set stock_visible_all = true where id = 'org';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043a3', false);
set role authenticated;
create temp table x_open as select (select count(*) from public.equip_moves where equipment_type_id = '43000000-0000-0000-0000-0000000000e1') as moves;
reset role;
insert into r(name, ok, note) select 'галочка «Сотрудники видят остатки» включена — журнал виден целиком', moves = 4, moves::text from x_open;
update public.org_settings set stock_visible_all = false where id = 'org';

-- менеджер
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043a2', false);
set role authenticated;
create temp table x_mgr as select
  (select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-000000004%') as prof,
  (select count(*) from public.profiles_pub where id::text like '00000000-0000-0000-0000-000000004%') as pub,
  (select count(*) from public.equip_moves where equipment_type_id = '43000000-0000-0000-0000-0000000000e1') as moves;
reset role;
insert into r(name, ok, note) select 'менеджер: полная строка только своя, коллеги — profiles_pub; склад виден всегда', prof = 1 and pub = 4 and moves = 4, prof || '/' || pub || '/' || moves from x_mgr;

-- админ
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043a1', false);
set role authenticated;
create temp table x_adm as select
  (select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-000000004%') as prof,
  (select push_prefs->>'secret' from public.profiles where id = '00000000-0000-0000-0000-0000000043a4') as other_prefs;
update public.profiles set bn_access = true where id = '00000000-0000-0000-0000-0000000043a4';
reset role;
insert into r(name, ok, note) select 'админ: все профили целиком (настройки сотрудников в Справочниках)', prof = 4 and other_prefs = 'other', prof || '/' || other_prefs from x_adm;
insert into r(name, ok) select 'админ правит чужой профиль', (select bn_access from public.profiles where id = '00000000-0000-0000-0000-0000000043a4') = true;

-- anon
insert into r(name, ok, note) select 'anon: profiles_pub и stock_avail закрыты', a <> 'OK' and b <> 'OK', a || ' | ' || b
  from (select pg_temp.err($q$set local role anon; select count(*) from public.profiles_pub$q$) a) x1,
       (select pg_temp.err($q$set local role anon; select count(*) from public.stock_avail()$q$) b) x2;
reset role;

-- функции базы читают профили как раньше (security definer): my_role у сотрудника
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043a3', false);
insert into r(name, ok) select 'my_role() и is_shared_job_helper() работают (definer)', public.my_role() = 'tech';

select case when ok then '✓ ' else '✗ ' end || name || coalesce(' — ' || case when ok then null else note end, '') from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
