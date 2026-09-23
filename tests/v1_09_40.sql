-- v1.09.40 · стражи удаления (справочники, сотрудник), журнал под контролем базы, «ничейный» пикап, media.upload_id.
-- Запуск: локальный PostgreSQL + заглушка Supabase, база после full-install-1_09_40.sql (или update-to-1_09_40.sql).
-- psql -tA -d <база> -f tests/v1_09_40.sql → «ИТОГ: N ✓ / 0 ✗». Всё в одной транзакции с ROLLBACK — база не меняется.
\set ON_ERROR_STOP 1
begin;
create temp table r (n serial, name text, ok boolean, note text);
grant all on r to authenticated, service_role; grant usage, select, update on sequence r_n_seq to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;   -- как у Supabase по умолчанию (в заглушке этого нет)
set session_replication_role = replica;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000040a1', 'a40@x'), ('00000000-0000-0000-0000-0000000040a2', 'm40@x'),
  ('00000000-0000-0000-0000-0000000040a3', 't40@x'), ('00000000-0000-0000-0000-0000000040a4', 'h40@x'), ('00000000-0000-0000-0000-0000000040a5', 'e40@x'),
  ('00000000-0000-0000-0000-0000000040a6', 'k40@x') on conflict do nothing;
insert into public.profiles (id, login, display_name, role, blocked) values
  ('00000000-0000-0000-0000-0000000040a1', 't40_adm', 'Adm40', 'admin', false), ('00000000-0000-0000-0000-0000000040a2', 't40_mgr', 'Mgr40', 'manager', false),
  ('00000000-0000-0000-0000-0000000040a3', 't40_tec', 'Tec40', 'tech', false),  ('00000000-0000-0000-0000-0000000040a4', 't40_oth', 'Oth40', 'tech', false),
  ('00000000-0000-0000-0000-0000000040a5', 't40_empty', 'Empty40', 'tech', false), ('00000000-0000-0000-0000-0000000040a6', 't40_acc', 'Acc40', 'accountant', false)
  on conflict (id) do update set role = excluded.role;
insert into public.counterparties (id, name, abbr) values ('40000000-0000-0000-0000-0000000000c1', 'CP40 used', 'C4U'), ('40000000-0000-0000-0000-0000000000c2', 'CP40 free', 'C4F');
insert into public.complexes (id, name, abbr, counterparty_id) values ('40000000-0000-0000-0000-0000000000d1', 'CX40 used', 'X4U', '40000000-0000-0000-0000-0000000000c1'),
  ('40000000-0000-0000-0000-0000000000d2', 'CX40 free', 'X4F', '40000000-0000-0000-0000-0000000000c1');
insert into public.equipment_types (id, name, abbr, color, price_key, sort) values ('40000000-0000-0000-0000-0000000000e1', 'ET40 used', 'E4U', '#58cc02', 't40_used', 940),
  ('40000000-0000-0000-0000-0000000000e2', 'ET40 free', 'E4F', '#58cc02', 't40_free', 941);
insert into public.work_types (id, name) values ('40000000-0000-0000-0000-0000000000f1', 'WT40 used'), ('40000000-0000-0000-0000-0000000000f2', 'WT40 free');
insert into public.jobs (id, date, counterparty_id, complex_id, work_type_id, technician_id, unit_number, status, form_data, total) values
  ('40000000-0000-0000-0000-0000000000b1', current_date, '40000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000040a3', '40', 'draft', '{}'::jsonb, 0);
insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number) values
  ('40000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000e1', 1, 3, current_date, current_date + 3, null,
   '40000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000c1', '40');
set session_replication_role = origin;

create or replace function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlerrm; end $$;

-- 1. справочники
insert into r(name, ok, note) select 'контрагент с комплексами и документами не удаляется (IN_USE)', e like 'IN_USE%', e
  from (select pg_temp.err($q$delete from public.counterparties where id = '40000000-0000-0000-0000-0000000000c1'$q$) e) x;
insert into r(name, ok) select 'после отказа комплексы контрагента на месте', (select count(*) from public.complexes where counterparty_id = '40000000-0000-0000-0000-0000000000c1') = 2;
insert into r(name, ok, note) select 'комплекс с задачей и пикапом не удаляется', e like 'IN_USE%', e
  from (select pg_temp.err($q$delete from public.complexes where id = '40000000-0000-0000-0000-0000000000d1'$q$) e) x;
insert into r(name, ok, note) select 'тип оборудования с пикапом не удаляется (раньше каскад стирал пикапы)', e like 'IN_USE%', e
  from (select pg_temp.err($q$delete from public.equipment_types where id = '40000000-0000-0000-0000-0000000000e1'$q$) e) x;
insert into r(name, ok, note) select 'вид задачи с задачей не удаляется', e like 'IN_USE%', e
  from (select pg_temp.err($q$delete from public.work_types where id = '40000000-0000-0000-0000-0000000000f1'$q$) e) x;
insert into r(name, ok, note) select 'неиспользуемые строки удаляются как раньше (контрагент, комплекс, тип, вид задачи)',
  a || b || c || d = 'OKOKOKOK', a || '|' || b || '|' || c || '|' || d
  from (select pg_temp.err($q$delete from public.complexes where id = '40000000-0000-0000-0000-0000000000d2'$q$) a,
               pg_temp.err($q$delete from public.counterparties where id = '40000000-0000-0000-0000-0000000000c2'$q$) b,
               pg_temp.err($q$delete from public.equipment_types where id = '40000000-0000-0000-0000-0000000000e2'$q$) c,
               pg_temp.err($q$delete from public.work_types where id = '40000000-0000-0000-0000-0000000000f2'$q$) d) x;

-- 2. сотрудник
insert into r(name, ok, note) select 'удаление пользователя с задачами (как в панели Supabase) откатывается: USER_HAS_DOCUMENTS', e like 'USER_HAS_DOCUMENTS%', e
  from (select pg_temp.err($q$delete from auth.users where id = '00000000-0000-0000-0000-0000000040a3'$q$) e) x;
insert into r(name, ok) select 'после отказа профиль и задача сотрудника на месте',
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000040a3') and exists (select 1 from public.jobs where id = '40000000-0000-0000-0000-0000000000b1');
insert into r(name, ok, note) select 'пользователь без документов удаляется', e = 'OK', e
  from (select pg_temp.err($q$delete from auth.users where id = '00000000-0000-0000-0000-0000000040a5'$q$) e) x;
insert into r(name, ok) select 'его профиль ушёл каскадом', not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000040a5');

-- 3. журнал: запись сервера (не authenticated) не трогается
insert into public.audit_log (actor, actor_name, action, entity, entity_id, details) values ('00000000-0000-0000-0000-0000000040a2', 'srv', 'inv_archive', 'job', 'srv40', '{}'::jsonb);
insert into r(name, ok) select 'запись сервера/RPC — автор и детали как есть, без _role',
  exists (select 1 from public.audit_log where entity_id = 'srv40' and actor = '00000000-0000-0000-0000-0000000040a2' and actor_name = 'srv' and not (details ? '_role'));

-- 3б. журнал: прямая запись приложения сотрудника
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a3', false);
set role authenticated;
insert into public.audit_log (at, actor, actor_name, action, entity, entity_id, details)
  values (now() + interval '3 days', '00000000-0000-0000-0000-0000000040a3', 'Кто-то другой', 'job_create', 'job', 'a40', '{"unit":"40"}');
insert into public.tech_log (at, actor, actor_name, action, entity, entity_id, details)
  values (now() - interval '1 hour', '00000000-0000-0000-0000-0000000040a3', '', 'push_sub', 'profile', 't40', '{}');
insert into r(name, ok, note) select 'сотрудник: «апрув» от своего имени — AUDIT_FORBIDDEN', e like 'AUDIT_FORBIDDEN%', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a3', 'job_approve', 'job', 'x')$q$) e) x;
insert into r(name, ok, note) select 'сотрудник: «смена роли» — AUDIT_FORBIDDEN', e like 'AUDIT_FORBIDDEN%', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a3', 'role_change', 'profile', 'x')$q$) e) x;
insert into r(name, ok, note) select 'сотрудник: «оплата» бухгалтерии — AUDIT_FORBIDDEN', e like 'AUDIT_FORBIDDEN%', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a3', 'acc_pay_add', 'job', 'x')$q$) e) x;
insert into r(name, ok, note) select 'мусор вместо действия — AUDIT_BAD_ACTION', e like 'AUDIT_BAD_ACTION%', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action) values ('00000000-0000-0000-0000-0000000040a3', 'DROP TABLE x')$q$) e) x;
insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a1', 'job_create', 'job', 'fake40');
reset role;
insert into r(name, ok) select 'подставить чужого автора нельзя: база записывает того, кто вошёл',
  (select actor from public.audit_log where entity_id = 'fake40') = '00000000-0000-0000-0000-0000000040a3';
insert into r(name, ok, note) select 'обычная запись сотрудника: имя из профиля, время из будущего → сейчас, в details роль',
  actor_name = 'Tec40' and at <= now() + interval '1 minute' and details->>'_role' = 'tech' and details->>'unit' = '40', actor_name || ' · ' || at || ' · ' || details::text
  from public.audit_log where entity_id = 'a40';
insert into r(name, ok) select 'tech_log: запись из офлайн-очереди (час назад) сохраняет своё время',
  exists (select 1 from public.tech_log where entity_id = 't40' and at < now() - interval '50 minutes' and actor_name = 'Tec40' and details->>'_role' = 'tech');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a1', false);
set role authenticated;
insert into r(name, ok, note) select 'админ: «смена роли» пишется', e = 'OK', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a1', 'role_change', 'profile', 'r40')$q$) e) x;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a6', false);
set role authenticated;
insert into r(name, ok, note) select 'бухгалтер: «оплата» пишется', e = 'OK', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a6', 'acc_pay_add', 'job', 'p40')$q$) e) x;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a2', false);
set role authenticated;
insert into r(name, ok, note) select 'менеджер: «апрув» пишется', e = 'OK', e
  from (select pg_temp.err($q$insert into public.audit_log (actor, action, entity, entity_id) values ('00000000-0000-0000-0000-0000000040a2', 'job_approve', 'job', 'm40')$q$) e) x;
reset role;

-- 4. «ничейный» пикап
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a4', false);
set role authenticated;
update public.placements set technician_id = '00000000-0000-0000-0000-0000000040a4' where id = '40000000-0000-0000-0000-0000000000a1';
reset role;
insert into r(name, ok) select 'чужой сотрудник не забирает «ничейный» пикап себе', (select technician_id from public.placements where id = '40000000-0000-0000-0000-0000000000a1') is null;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a3', false);
set role authenticated;
update public.placements set note = 'main40' where id = '40000000-0000-0000-0000-0000000000a1';
reset role;
insert into r(name, ok) select 'основной исполнитель задачи правит её «ничейный» пикап', (select note from public.placements where id = '40000000-0000-0000-0000-0000000000a1') = 'main40';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a2', false);
set role authenticated;
update public.placements set technician_id = '00000000-0000-0000-0000-0000000040a3' where id = '40000000-0000-0000-0000-0000000000a1';
reset role;
insert into r(name, ok) select 'менеджер назначает исполнителя (кнопка «Назначить…» на Доске)', (select technician_id from public.placements where id = '40000000-0000-0000-0000-0000000000a1') = '00000000-0000-0000-0000-0000000040a3';

-- 5. upload_id
insert into r(name, ok) select 'media.upload_id и индекс на месте', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media' and column_name = 'upload_id')
  and exists (select 1 from pg_indexes where indexname = 'media_upload_id_idx');

select case when ok then '✓ ' else '✗ ' end || name || coalesce(' — ' || case when ok then null else note end, '') from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
