-- v1.09.55 · предыстория задачи в юните без цен (job_history), номер юнита (unit_key), вырезание сумм (fd_noprice),
--   характеристики апартаментов (колонки), статистика сотрудников для карусели ТВ (tv_feed: stat_month, emp_wt, emp_pk, emp_mi).
-- Запуск: psql -tA -d <база> -f tests/v1_09_55.sql → «ИТОГ: N ✓ / 0 ✗». База после full-install-1_09_55.sql (или update-to-1_09_55.sql).
-- Всё в BEGIN…ROLLBACK.
\set ON_ERROR_STOP 1
begin;
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'h55_adm@x'), ('00000000-0000-0000-0000-0000000000e2', 'h55_tech@x'),
  ('00000000-0000-0000-0000-0000000000e3', 'h55_tech2@x'), ('00000000-0000-0000-0000-0000000000e4', 'h55_block@x')
  on conflict do nothing;
insert into public.profiles (id, login, display_name, role, blocked) values
  ('00000000-0000-0000-0000-0000000000e1', 'h55_adm',   'H55 Admin', 'admin', false),
  ('00000000-0000-0000-0000-0000000000e2', 'h55_tech',  'H55 Tech',  'tech',  false),
  ('00000000-0000-0000-0000-0000000000e3', 'h55_tech2', 'H55 Other', 'tech',  false),
  ('00000000-0000-0000-0000-0000000000e4', 'h55_block', 'H55 Block', 'tech',  true)
  on conflict (id) do update set role = excluded.role, blocked = excluded.blocked;
insert into public.org_settings (id) values ('org') on conflict do nothing;
update public.org_settings set hist_on = false, hist_days = 60 where id = 'org';
insert into public.counterparties (id, name) values ('66666666-0000-0000-0000-0000000000e1', 'H55 CP') on conflict do nothing;
insert into public.complexes (id, counterparty_id, name) values
  ('77777777-0000-0000-0000-0000000000e1', '66666666-0000-0000-0000-0000000000e1', 'H55 Complex'),
  ('77777777-0000-0000-0000-0000000000e2', '66666666-0000-0000-0000-0000000000e1', 'H55 Other complex') on conflict do nothing;
insert into public.work_types (id, name) values ('99999999-0000-0000-0000-0000000000e1', 'H55 WT'), ('99999999-0000-0000-0000-0000000000e2', 'H55 WT2') on conflict do nothing;
-- текущий документ работника и прежние: тот же юнит под разными записями, другой юнит, другой вид, старше срока, в архиве
insert into public.jobs (id, date, complex_id, unit_number, work_type_id, technician_id, status, note, form_data, total, created_at) values
  ('44444444-0000-0000-0000-0000000000e0', current_date,      '77777777-0000-0000-0000-0000000000e1', 'U214',     '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 'draft', '', '{}', 0, now()),
  ('44444444-0000-0000-0000-0000000000e1', current_date - 10, '77777777-0000-0000-0000-0000000000e1', 'Unit #214', '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'approved', 'first visit',
     '{"others":[{"desc":"cut pad","amount":200}],"extra":[{"name":"Wall patch","price":77}],"steam":{"deep_scrub":true}}', 450, now() - interval '10 days'),
  ('44444444-0000-0000-0000-0000000000e2', current_date - 30, '77777777-0000-0000-0000-0000000000e1', '214',      '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'done', 'second', '{}', 120, now() - interval '30 days'),
  ('44444444-0000-0000-0000-0000000000e3', current_date - 5,  '77777777-0000-0000-0000-0000000000e1', '215',      '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'done', 'other unit', '{}', 1, now()),
  ('44444444-0000-0000-0000-0000000000e4', current_date - 5,  '77777777-0000-0000-0000-0000000000e1', '214',      '99999999-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3', 'done', 'other wt', '{}', 1, now()),
  ('44444444-0000-0000-0000-0000000000e5', current_date - 75, '77777777-0000-0000-0000-0000000000e1', '214',      '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'done', 'too old', '{}', 1, now()),
  ('44444444-0000-0000-0000-0000000000e6', current_date - 3,  '77777777-0000-0000-0000-0000000000e2', '214',      '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'done', 'other complex', '{}', 1, now()),
  ('44444444-0000-0000-0000-0000000000e7', current_date - 2,  '77777777-0000-0000-0000-0000000000e1', '214',      '99999999-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'done', 'archived', '{}', 1, now())
  on conflict (id) do nothing;
update public.jobs set archived_at = now() where id = '44444444-0000-0000-0000-0000000000e7';
set session_replication_role = origin;

create temp table r (n int, name text, ok boolean, note text);
grant all on r to authenticated, service_role;
create temp sequence rn; grant usage, select, update on sequence rn to authenticated, service_role;
create function pg_temp.throws(p_sql text, p_msg text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return position(p_msg in sqlerrm) > 0; end $$;
create function pg_temp.ok(p_name text, p_ok boolean, p_note text default '') returns void language sql as
  $$ insert into r values (nextval('rn'), p_name, coalesce(p_ok, false), p_note) $$;
create function pg_temp.me(p text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p, true) $$;
\set ADM   '''00000000-0000-0000-0000-0000000000e1'''
\set TECH  '''00000000-0000-0000-0000-0000000000e2'''
\set TECH2 '''00000000-0000-0000-0000-0000000000e3'''
\set BLOCK '''00000000-0000-0000-0000-0000000000e4'''
\set CUR   '''44444444-0000-0000-0000-0000000000e0'''

-- ===== 1. номер юнита и суммы =====
select pg_temp.ok('unit_key: «U214», «Unit #214», «#214», « 214 », «214» — один юнит; «215» — другой',
  public.unit_key('U214') = '214' and public.unit_key('Unit #214') = '214' and public.unit_key('#214') = '214' and public.unit_key(' 214 ') = '214' and public.unit_key('215') = '215' and public.unit_key(null) = '');
select pg_temp.ok('fd_noprice: у Other services нет amount, у доп. работ нет price; остальное на месте',
  (select not (x::text ~ '"amount"|"price"') and x->'others'->0->>'desc' = 'cut pad' and x->'extra'->0->>'name' = 'Wall patch' and (x->'steam'->>'deep_scrub')::boolean
     from public.fd_noprice('{"others":[{"desc":"cut pad","amount":200}],"extra":[{"name":"Wall patch","price":77}],"steam":{"deep_scrub":true}}'::jsonb) x));
select pg_temp.ok('fd_noprice: не объект / null — пустой объект, строки в массиве не ломают', public.fd_noprice(null) = '{}'::jsonb and public.fd_noprice('[1]'::jsonb) = '{}'::jsonb
  and (public.fd_noprice('{"others":["x",{"desc":"y","amount":1}]}'::jsonb)->'others') = '["x",{"desc":"y"}]'::jsonb);

-- ===== 2. job_history =====
select pg_temp.me(:TECH);
select pg_temp.ok('настройка выключена — пусто', public.job_history(:CUR::uuid)::text = '[]');
set session_replication_role = replica; update public.org_settings set hist_on = true where id = 'org'; set session_replication_role = origin;
select pg_temp.me(:TECH);
select pg_temp.ok('работник видит предысторию своего документа: два прежних документа того же юнита и вида (другой юнит, вид, комплекс, старше 60 дней и архив — нет)',
  (select json_array_length(public.job_history(:CUR::uuid)) = 2
      and (select array_agg(x->>'note' order by x->>'date' desc) from json_array_elements(public.job_history(:CUR::uuid)) x) = array['first visit', 'second']));
select pg_temp.ok('в ответе нет сумм: ни total, ни amount, ни price', public.job_history(:CUR::uuid)::text !~ '"(total|approved_total|amount|price)"');
select pg_temp.ok('в ответе — кто делал, статус, дата, работы и заметка', (select x->>'tech_name' = 'H55 Other' and x->>'status' = 'approved' and (x->'form_data'->'steam'->>'deep_scrub')::boolean
    and x->'form_data'->'others'->0->>'desc' = 'cut pad' from json_array_elements(public.job_history(:CUR::uuid)) x where x->>'note' = 'first visit'));
set session_replication_role = replica; update public.org_settings set hist_days = 20 where id = 'org'; set session_replication_role = origin;
select pg_temp.me(:TECH);
select pg_temp.ok('срок 20 дней — только документ 10-дневной давности', json_array_length(public.job_history(:CUR::uuid)) = 1);
set session_replication_role = replica; update public.org_settings set hist_days = 60 where id = 'org'; set session_replication_role = origin;
select pg_temp.me(:TECH2);
select pg_temp.ok('чужой документ (не свой и не в бригаде) — FORBIDDEN', pg_temp.throws($q$select public.job_history('44444444-0000-0000-0000-0000000000e0')$q$, 'FORBIDDEN'));
select pg_temp.me(:BLOCK);
select pg_temp.ok('заблокированный — FORBIDDEN', pg_temp.throws($q$select public.job_history('44444444-0000-0000-0000-0000000000e0')$q$, 'FORBIDDEN'));
select pg_temp.me('');
select pg_temp.ok('без входа — FORBIDDEN', pg_temp.throws($q$select public.job_history('44444444-0000-0000-0000-0000000000e0')$q$, 'FORBIDDEN'));
select pg_temp.me(:ADM);
select pg_temp.ok('админ — тоже только по своему документу-образцу: те же два', json_array_length(public.job_history(:CUR::uuid)) = 2);
select pg_temp.ok('несуществующий документ — пусто, без ошибки', public.job_history('44444444-0000-0000-0000-0000000000ff'::uuid)::text = '[]');
select pg_temp.ok('права: authenticated может вызвать, anon — нет', has_function_privilege('authenticated', 'public.job_history(uuid)', 'execute') and not has_function_privilege('anon', 'public.job_history(uuid)', 'execute'));

-- ===== 3. характеристики апартаментов — колонки =====
select pg_temp.ok('org_settings.cx_attrs (jsonb, по умолчанию []) и complexes.attrs (jsonb, по умолчанию {})',
  (select data_type = 'jsonb' and column_default like '''[]''%' from information_schema.columns where table_schema = 'public' and table_name = 'org_settings' and column_name = 'cx_attrs')
  and (select data_type = 'jsonb' and column_default like '''{}''%' from information_schema.columns where table_schema = 'public' and table_name = 'complexes' and column_name = 'attrs'));
select pg_temp.ok('hist_days — от 7 до 365', pg_temp.throws($q$update public.org_settings set hist_days = 3 where id = 'org'$q$, 'org_settings_hist_days_chk'));

-- ===== 4. tv_feed: статистика для карусели =====
set session_replication_role = replica;
insert into public.tv_sessions (id, code, device_key, status) values ('12121212-0000-0000-0000-0000000000e1', '5555', 'h55-tv-key', 'approved') on conflict do nothing;
insert into public.equipment_types (id, abbr, name, price_key) values ('13131313-0000-0000-0000-0000000000e1', 'H5B', 'H55 Blower', 'eq_h5b') on conflict do nothing;
insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, picked_up, picked_up_at, picked_up_by, technician_id, complex_id, unit_number) values
  ('14141414-0000-0000-0000-0000000000e1', '44444444-0000-0000-0000-0000000000e1', '13131313-0000-0000-0000-0000000000e1', 2, 3, current_date - 10, current_date - 7, true, now() - interval '1 day', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3', '77777777-0000-0000-0000-0000000000e1', '214')
  on conflict do nothing;
insert into public.bn_trips (imei, day, started_at, ended_at, mi, driver_id) values
  ('h55imei', current_date - 1, now() - interval '1 day', now() - interval '23 hours', 12.5, '00000000-0000-0000-0000-0000000000e3'),
  ('h55imei', current_date - 20, now() - interval '20 days', now() - interval '20 days' + interval '1 hour', 30, '00000000-0000-0000-0000-0000000000e3')
  on conflict do nothing;
set session_replication_role = origin;
select pg_temp.me('');
create temp table f as select public.tv_feed('h55-tv-key', current_date)::jsonb as j;
select pg_temp.ok('tv_feed: прежние ключи на месте и новые stat_month, emp_wt, emp_pk, emp_mi',
  (select j ?& array['jobs', 'pickups', 'profiles', 'stat_day', 'stat_week', 'site_day', 'office', 'stat_month', 'emp_wt', 'emp_pk', 'emp_mi'] from f));
select pg_temp.ok('emp_wt: у H55 Other по виду H55 WT за 7 дней не меньше 1 (документ 5 дней назад — другой юнит), за месяц — все свои выполненные',
  (select (x->>'w')::int >= 1 from f, jsonb_array_elements(j->'emp_wt') x where x->>'id' = :TECH2 and x->>'wt' = '99999999-0000-0000-0000-0000000000e1'));
select pg_temp.ok('emp_pk: пикап засчитан тому, кто забрал (picked_up_by), а не исполнителю аренды',
  (select (x->>'w')::int = 1 from f, jsonb_array_elements(j->'emp_pk') x where x->>'id' = :TECH)
  and not exists (select 1 from f, jsonb_array_elements(j->'emp_pk') x where x->>'id' = :TECH2));
select pg_temp.ok('emp_mi: мили водителя из bn_trips — за 7 дней 12.5',
  (select (x->>'w')::numeric = 12.5 from f, jsonb_array_elements(j->'emp_mi') x where x->>'id' = :TECH2));
select pg_temp.ok('неодобренный ключ ТВ — TV_FORBIDDEN', pg_temp.throws($q$select public.tv_feed('no-such-key', current_date)$q$, 'TV_FORBIDDEN'));

select n, case when ok then '✓' else '✗' end || ' ' || name || case when note <> '' then '  [' || note || ']' else '' end from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
