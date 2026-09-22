-- v1.09.27 · режим тестирования документооборота: проверка, что он НЕ дыра.
-- Запуск: локальный PostgreSQL + заглушка Supabase, база после full-install-1_09_27.sql (или update-to-1_09_27.sql).
-- psql -tA -d <база> -f tests/dft.sql → «ИТОГ: N ✓ / 0 ✗». Всё в BEGIN…ROLLBACK.
\set ON_ERROR_STOP 1
begin;
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'dft_adm@x'), ('00000000-0000-0000-0000-0000000000b2', 'dft_mgr@x'),
  ('00000000-0000-0000-0000-0000000000b3', 'dft_appr@x'), ('00000000-0000-0000-0000-0000000000b4', 'dft_tech@x'),
  ('00000000-0000-0000-0000-0000000000b5', 'dft_tech2@x'), ('00000000-0000-0000-0000-0000000000b6', 'dft_gone@x')
  on conflict do nothing;
insert into public.profiles (id, login, display_name, role, can_approve, can_edit_docs, blocked) values
  ('00000000-0000-0000-0000-0000000000b1', 'dft_adm',   'Dft Admin',    'admin',   false, true, false),
  ('00000000-0000-0000-0000-0000000000b2', 'dft_mgr',   'Dft Manager',  'manager', false, true, false),
  ('00000000-0000-0000-0000-0000000000b3', 'dft_appr',  'Dft Approver', 'manager', true,  true, false),
  ('00000000-0000-0000-0000-0000000000b4', 'dft_tech',  'Dft Tech',     'tech',    false, true, false),
  ('00000000-0000-0000-0000-0000000000b5', 'dft_tech2', 'Dft Tech Two', 'tech',    false, true, false),
  ('00000000-0000-0000-0000-0000000000b6', 'dft_gone',  'Dft Blocked',  'tech',    false, true, true)
  on conflict (id) do update set role = excluded.role, can_approve = excluded.can_approve, blocked = excluded.blocked;
insert into public.org_settings (id) values ('org') on conflict do nothing;
update public.org_settings set dft_on = false, dft_until = null, self_approve = false, edit_lock_days = 0 where id = 'org';
insert into public.jobs (id, date, unit_number, technician_id, status, form_data, total)
  values ('44444444-0000-0000-0000-0000000000f1', current_date, 'REAL-1', '00000000-0000-0000-0000-0000000000b4', 'done', '{}', 100);
insert into public.proposals (id, date, status) values ('55555555-0000-0000-0000-0000000000f1', current_date, 'draft') on conflict do nothing;
insert into public.equipment_types (id, name, abbr, price_key) values ('77777777-0000-0000-0000-0000000000e1', 'Dft Blower', 'DFB', 'dft_blower') on conflict (id) do nothing;
set session_replication_role = origin;

create temp table r (n int, name text, ok boolean, note text);
grant all on r to authenticated, service_role;
create temp sequence rn; grant usage, select, update on sequence rn to authenticated, service_role;
create function pg_temp.throws(p_sql text, p_msg text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return position(p_msg in sqlerrm) > 0; end $$;
create function pg_temp.ok(p_name text, p_ok boolean, p_note text default '') returns void language sql as
  $$ insert into r values (nextval('rn'), p_name, coalesce(p_ok, false), p_note) $$;
create function pg_temp.me(p text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p, true) $$;
\set ADM   '''00000000-0000-0000-0000-0000000000b1'''
\set MGR   '''00000000-0000-0000-0000-0000000000b2'''
\set APPR  '''00000000-0000-0000-0000-0000000000b3'''
\set TECH  '''00000000-0000-0000-0000-0000000000b4'''
\set TECH2 '''00000000-0000-0000-0000-0000000000b5'''
\set GONE  '''00000000-0000-0000-0000-0000000000b6'''
\set REAL  '''44444444-0000-0000-0000-0000000000f1'''

-- ===== 1. Пометку «тестовый» клиент не ставит =====
select pg_temp.me(:TECH);
update public.jobs set is_test = true, test_owner = :TECH where id = :REAL;
select pg_temp.ok('обновлением пометка «тестовый» не ставится', (select is_test = false and test_owner is null from public.jobs where id = :REAL));
select pg_temp.ok('v1.09.32: вставка «тестовой» строки не от функции отклоняется (DFT_TEST_ROW), а не становится настоящим документом',
  pg_temp.throws($q$insert into public.jobs (id, date, unit_number, technician_id, status, is_test, test_owner) values ('44444444-0000-0000-0000-0000000000f2', current_date, 'REAL-2', '00000000-0000-0000-0000-0000000000b4', 'draft', true, '00000000-0000-0000-0000-0000000000b4')$q$, 'DFT_TEST_ROW')
  and not exists(select 1 from public.jobs where id = '44444444-0000-0000-0000-0000000000f2'));
select pg_temp.ok('dft_exec клиенту недоступна (ни authenticated, ни anon)',
  not has_function_privilege('authenticated', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute') and not has_function_privilege('anon', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute'));
set local role authenticated;
select pg_temp.ok('вызов под ролью authenticated — отказ базы', pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'job_get', '{}')$q$, 'permission denied'));
reset role;

-- ===== 2. Включает только админ, на срок =====
select pg_temp.me(:TECH);
select pg_temp.ok('работник режим не включает: FORBIDDEN', pg_temp.throws($q$select public.admin_set_dft(true, 4)$q$, 'FORBIDDEN'));
select pg_temp.me(:MGR);
select pg_temp.ok('менеджер — тоже', pg_temp.throws($q$select public.admin_set_dft(true, 4)$q$, 'FORBIDDEN'));
select pg_temp.ok('режим выключен: функция тестирования отвечает DFT_OFF',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'job_create', '{"run":"r1","row":{"technician_id":"00000000-0000-0000-0000-0000000000b4"}}')$q$, 'DFT_OFF'));
select pg_temp.me(:ADM);
select public.admin_set_dft(true, 500) as until \gset
select pg_temp.ok('админ включил: срок ограничен 72 часами, кто включил — записано, в журнале событий — запись',
  (select dft_on and dft_until between now() + interval '71 hours' and now() + interval '73 hours' and dft_by = :ADM::uuid from public.org_settings where id = 'org')
  and exists(select 1 from public.audit_log where action = 'dft_on' and actor = :ADM::uuid) and public.dft_enabled());

-- ===== 3. Тестовый документ: от имени менеджера — работнику =====
create temp table sq as select last_value as v from public.jobs_doc_no_seq;
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH, :MGR, 'job_create', jsonb_build_object('run', 'r1', 'row', jsonb_build_object('id', '44444444-0000-0000-0000-0000000000a1',
  'technician_id', :TECH, 'unit_number', 'DFTEST', 'helper_ids', jsonb_build_array(:TECH2), 'form_data', '{"equipment":{"e1":{"qty":1,"days":2}}}'::jsonb)))->'data'->>'id') as tj \gset
select pg_temp.ok('создан тестовый документ: пометка, владелец прогона, автор — менеджер', is_test and test_owner = :TECH::uuid and test_run = 'r1' and updated_by = :MGR::uuid and status = 'draft') from public.jobs where id = :'tj'::uuid;
select pg_temp.ok('личность после вызова сброшена (функция не оставляет «вошедшего» менеджера)', coalesce(current_setting('request.jwt.claim.sub', true), '') = '');
select pg_temp.ok('v1.09.31: ведущему тест (работнику) — и строка в ленте «Новая задача», и ПУШ; больше пуш не получил никто',
  exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Новая задача' and url like '%' || :'tj' || '%')
  and exists(select 1 from public.push_queue where user_id = :TECH::uuid and title = 'Новая задача' and url like '%' || :'tj' || '%')
  and not exists(select 1 from public.push_queue where user_id <> :TECH::uuid and url like '%' || :'tj' || '%'));
select pg_temp.ok('помощнику (не владельцу прогона) событие тестового документа не приходит', not exists(select 1 from public.notices where user_id = :TECH2::uuid and url like '%' || :'tj' || '%'));

-- работник сам (как через приложение) сдаёт документ
select pg_temp.me(:TECH);
update public.jobs set status = 'done' where id = :'tj'::uuid;
select pg_temp.ok('номер тестового документа — из своего диапазона, настоящий счётчик не тронут',
  (select no > 90000000 from public.jobs where id = :'tj'::uuid) and (select last_value from public.jobs_doc_no_seq) = (select v from sq));
select pg_temp.ok('согласующим о тестовом документе ничего не пришло (ни ленты, ни пуша)',
  not exists(select 1 from public.notices where user_id in (:ADM::uuid, :APPR::uuid) and url like '%' || :'tj' || '%') and not exists(select 1 from public.push_queue where user_id in (:ADM::uuid, :APPR::uuid) and url like '%' || :'tj' || '%'));
select set_config('request.jwt.claim.sub', '', true);

-- ===== 4. Правила действуют и под подменённой личностью =====
select pg_temp.ok('от имени менеджера БЕЗ права апрува апрув не проходит: FORBIDDEN',
  pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b2', 'rpc', '{"fn":"approve_job","args":{"p_job":"%s","p_total":10}}')$q$, :'tj'), 'FORBIDDEN'));
select pg_temp.ok('от имени работника правка документа на согласовании: DOC_LOCKED_DONE',
  pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'job_update', '{"id":"%s","patch":{"note":"edit","note_en":"edit"}}')$q$, :'tj'), 'DOC_LOCKED_DONE'));
select pg_temp.ok('от имени помощника без «Общего доступа»: отказ политики (RLS_DENIED)',
  pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b5', 'job_update', '{"id":"%s","patch":{"priority":true}}')$q$, :'tj'), 'RLS_DENIED'));
select public.dft_exec(:TECH, :ADM, 'rpc', jsonb_build_object('fn', 'approve_job', 'args', jsonb_build_object('p_job', :'tj', 'p_total', 25))) is not null as x \gset
select pg_temp.ok('от имени админа — апрув прошёл; автор апрува — админ, владельцу прогона в ленту «Инвойс апрувлен»',
  (select status = 'approved' and approved_by = :ADM::uuid and approved_total = 25 from public.jobs where id = :'tj'::uuid)
  and exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Инвойс апрувлен'));

-- ===== 5. ГЛАВНОЕ: настоящий документ функция не трогает =====
select pg_temp.ok('апрув НАСТОЯЩЕГО инвойса через функцию: DFT_NOT_TEST_DOC',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'rpc', '{"fn":"approve_job","args":{"p_job":"44444444-0000-0000-0000-0000000000f1","p_total":100}}')$q$, 'DFT_NOT_TEST_DOC')
  and (select status from public.jobs where id = :REAL) = 'done');
select pg_temp.ok('правка настоящего инвойса: DFT_NOT_TEST_DOC',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'job_update', '{"id":"44444444-0000-0000-0000-0000000000f1","patch":{"status":"approved"}}')$q$, 'DFT_NOT_TEST_DOC'));
select pg_temp.ok('пикап к настоящему инвойсу: DFT_NOT_TEST_DOC',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'pl_upsert', '{"row":{"job_id":"44444444-0000-0000-0000-0000000000f1","equipment_type_id":"77777777-0000-0000-0000-0000000000e1","qty":1}}')$q$, 'DFT_NOT_TEST_DOC'));
select pg_temp.ok('привязка НАСТОЯЩЕГО пропозала к тестовому документу: DFT_NOT_TEST_DOC',
  pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'rpc', '{"fn":"link_job_proposal","args":{"p_job":"%s","p_prop":"55555555-0000-0000-0000-0000000000f1"}}')$q$, :'tj'), 'DFT_NOT_TEST_DOC'));
select pg_temp.ok('чужой прогон: другой работник мой тестовый документ не трогает (DFT_NOT_YOUR_RUN), админ — может',
  pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000b1', 'job_get', '{"id":"%s"}')$q$, :'tj'), 'DFT_NOT_YOUR_RUN')
  and (public.dft_exec(:ADM, :ADM, 'job_get', jsonb_build_object('id', :'tj'))->>'ok')::boolean);
select pg_temp.ok('неизвестная операция и функция вне списка: DFT_BAD_OP / DFT_BAD_FN',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'sql', '{}')$q$, 'DFT_BAD_OP')
  and pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'rpc', '{"fn":"admin_set_role","args":{"p_job":"%s"}}')$q$, :'tj'), 'DFT_BAD_FN'));
select pg_temp.ok('заблокированный исполнитель и заблокированный вызывающий: DFT_NO_ACTOR / DFT_NO_CALLER',
  pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b6', 'job_get', '{"id":"%s"}')$q$, :'tj'), 'DFT_NO_ACTOR')
  and pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000b1', 'job_get', '{"id":"%s"}')$q$, :'tj'), 'DFT_NO_CALLER'));

-- ===== 6. Пикап и пропозал тестового документа =====
select (public.dft_exec(:TECH, :ADM, 'pl_upsert', jsonb_build_object('row', jsonb_build_object('id', '66666666-0000-0000-0000-0000000000c1', 'job_id', :'tj', 'equipment_type_id', '77777777-0000-0000-0000-0000000000e1', 'qty', 2, 'days', 3,
  'due_date', (current_date + 3)::text, 'technician_id', :TECH, 'unit_number', 'DFTEST')))->>'ok')::boolean as plok \gset
select pg_temp.ok('тестовый пикап: пометка унаследована от документа, склад не тронут',
  :'plok'::boolean and (select is_test from public.placements where id = '66666666-0000-0000-0000-0000000000c1')
  and not exists(select 1 from public.equip_moves where placement_id = '66666666-0000-0000-0000-0000000000c1'));
select pg_temp.me(:TECH);
insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id, is_test) values ('66666666-0000-0000-0000-0000000000c2', :REAL, '77777777-0000-0000-0000-0000000000e1', 1, 1, current_date, :TECH, true);
select pg_temp.ok('пикап настоящего документа «тестовым» сделать нельзя', (select is_test = false from public.placements where id = '66666666-0000-0000-0000-0000000000c2'));
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.ok('пропозал от имени работника: отказ политики; от имени менеджера — создан тестовым',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'prop_create', '{"run":"r1","row":{}}')$q$, 'RLS_DENIED')
  and (select (public.dft_exec(:TECH, :MGR, 'prop_create', '{"run":"r1","row":{"unit_number":"DFTEST"}}')->'data'->>'is_test')::boolean));
select pg_temp.ok('…номер тестового пропозала — из тестового диапазона, автор — менеджер, владелец прогона — работник',
  (select min(no) > 90000000 and bool_and(created_by = :MGR::uuid and test_owner = :TECH::uuid) from public.proposals where is_test));

-- ===== 7. Срок режима =====
set session_replication_role = replica;
update public.org_settings set dft_until = now() - interval '1 minute' where id = 'org';
set session_replication_role = origin;
select pg_temp.ok('срок истёк — режим выключен сам: DFT_OFF', not public.dft_enabled()
  and pg_temp.throws(format($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b1', 'job_get', '{"id":"%s"}')$q$, :'tj'), 'DFT_OFF'));

-- ===== 8. Уборка работает и при выключенном режиме; чужое и настоящее не трогает =====
select pg_temp.me(:TECH);
select public.doc_request_edit(:'tj'::uuid, 'тестовый запрос') is not null as rq \gset
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH2, :TECH2, 'cleanup', '{"all":true}')->>'deleted')::int as d0 \gset
select pg_temp.ok('работник с «all» убирает только СВОИ тестовые документы (чужой прогон цел)', :d0 = 0 and exists(select 1 from public.jobs where id = :'tj'::uuid));
select (public.dft_exec(:TECH, :TECH, 'cleanup', '{"run":"r1"}')->>'deleted')::int as d1 \gset
select pg_temp.ok('уборка прогона: документ, пикап, запрос правки, строки ленты и тестовый пропозал удалены',
  :d1 = 1 and not exists(select 1 from public.jobs where id = :'tj'::uuid) and not exists(select 1 from public.placements where id = '66666666-0000-0000-0000-0000000000c1')
  and not exists(select 1 from public.doc_requests where doc_id = :'tj'::uuid) and not exists(select 1 from public.notices where url like '%' || :'tj' || '%')
  and not exists(select 1 from public.proposals where is_test));
select pg_temp.ok('настоящие документы уборка не тронула', exists(select 1 from public.jobs where id = :REAL) and exists(select 1 from public.proposals where id = '55555555-0000-0000-0000-0000000000f1')
  and exists(select 1 from public.placements where id = '66666666-0000-0000-0000-0000000000c2'));
select pg_temp.me(:ADM);
select public.admin_set_dft(false, 0) is null as off \gset
select pg_temp.ok('админ выключил: флаг снят, срок очищен, в журнале событий — запись', :'off'::boolean and (select not dft_on and dft_until is null and dft_by is null from public.org_settings where id = 'org')
  and exists(select 1 from public.audit_log where action = 'dft_off'));

-- ===== 9. v1.09.28 · документ, созданный кнопкой приложения, принимается в тест; номер пикапа — после вставки =====
select pg_temp.me(:ADM);
select public.admin_set_dft(true, 4) is not null as on2 \gset
select pg_temp.me(:TECH);
insert into public.jobs (id, date, unit_number, technician_id, status) values ('44444444-0000-0000-0000-0000000000c1', current_date, 'DFTEST-UI', :TECH, 'draft');
insert into public.jobs (id, date, unit_number, technician_id, status) values ('44444444-0000-0000-0000-0000000000c2', current_date, '916', :TECH, 'draft');
insert into public.jobs (id, date, unit_number, technician_id, status) values ('44444444-0000-0000-0000-0000000000c3', current_date, 'DFTEST-OLD', :TECH, 'draft');
insert into public.jobs (id, date, unit_number, technician_id, status) values ('44444444-0000-0000-0000-0000000000c4', current_date, 'DFTEST-T2', :TECH2, 'draft');
set session_replication_role = replica;
update public.jobs set created_at = now() - interval '1 hour' where id = '44444444-0000-0000-0000-0000000000c3';
set session_replication_role = origin;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.ok('job_adopt: свой свежий черновик DFTEST принят в тест', (public.dft_exec(:TECH, :TECH, 'job_adopt', '{"run":"r2","id":"44444444-0000-0000-0000-0000000000c1"}')->'data'->>'is_test')::boolean);
select pg_temp.ok('…владелец прогона и сам прогон записаны', (select is_test and test_owner = :TECH::uuid and test_run = 'r2' from public.jobs where id = '44444444-0000-0000-0000-0000000000c1'));
select pg_temp.ok('обычный рабочий документ (юнит не DFTEST) в тест не принимается: DFT_ADOPT_DENIED',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'job_adopt', '{"id":"44444444-0000-0000-0000-0000000000c2"}')$q$, 'DFT_ADOPT_DENIED'));
select pg_temp.ok('старый черновик (создан час назад) — тоже', pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'job_adopt', '{"id":"44444444-0000-0000-0000-0000000000c3"}')$q$, 'DFT_ADOPT_DENIED'));
select pg_temp.ok('чужой черновик работник не принимает; сданный документ — никто', pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'job_adopt', '{"id":"44444444-0000-0000-0000-0000000000c4"}')$q$, 'DFT_ADOPT_DENIED')
  and pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'job_adopt', '{"id":"44444444-0000-0000-0000-0000000000f1"}')$q$, 'DFT_ADOPT_DENIED'));
select pg_temp.me(:TECH);
create temp table ps as select last_value as v, is_called as c from public.placements_doc_no_seq;
insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id) values ('66666666-0000-0000-0000-0000000000d1', '44444444-0000-0000-0000-0000000000c1', '77777777-0000-0000-0000-0000000000e1', 1, 1, current_date + 1, :TECH);
select pg_temp.ok('пикап тестового документа, созданный КАК ИЗ ПРИЛОЖЕНИЯ: номер из тестового диапазона, настоящий счётчик пикапов не тронут, склад не тронут',
  (select is_test and no > 90000000 from public.placements where id = '66666666-0000-0000-0000-0000000000d1') and (select last_value from public.placements_doc_no_seq) = (select v from ps)
  and not exists(select 1 from public.equip_moves where placement_id = '66666666-0000-0000-0000-0000000000d1'));
insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id) values ('66666666-0000-0000-0000-0000000000d2', '44444444-0000-0000-0000-0000000000c2', '77777777-0000-0000-0000-0000000000e1', 1, 1, current_date + 1, :TECH)
  on conflict (id) do update set qty = excluded.qty;
insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id) values ('66666666-0000-0000-0000-0000000000d2', '44444444-0000-0000-0000-0000000000c2', '77777777-0000-0000-0000-0000000000e1', 2, 1, current_date + 1, :TECH)
  on conflict (id) do update set qty = excluded.qty;
select pg_temp.ok('пикап настоящего документа: номер выдан один раз — повторный upsert счётчик не тратит и номер не теряет',
  (select no is not null and no < 90000000 and qty = 2 from public.placements where id = '66666666-0000-0000-0000-0000000000d2')
  and (select last_value from public.placements_doc_no_seq) - (select case when c then v else v - 1 end from ps) = 1);
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH, :TECH, 'cleanup', '{"run":"r2"}')->>'deleted')::int as d2 \gset
select pg_temp.ok('уборка убрала принятый документ вместе с его пикапом; настоящие целы', :d2 = 1 and not exists(select 1 from public.placements where id = '66666666-0000-0000-0000-0000000000d1')
  and exists(select 1 from public.placements where id = '66666666-0000-0000-0000-0000000000d2') and exists(select 1 from public.jobs where id = '44444444-0000-0000-0000-0000000000c2'));

-- ===== 10. v1.09.30 · тестовый ремонт; приём в тест пропозала и ремонта, созданных кнопками =====
select pg_temp.me(:ADM);
select public.admin_set_dft(true, 4) is not null as on3 \gset
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH, :MGR, 'job_create', jsonb_build_object('run', 'r3', 'row', jsonb_build_object('id', '44444444-0000-0000-0000-0000000000e1', 'technician_id', :TECH, 'unit_number', 'DFTEST')))->>'ok')::boolean as j3 \gset
select (public.dft_exec(:TECH, :TECH, 'rep_create', jsonb_build_object('run', 'r3', 'row', jsonb_build_object('id', '88888888-0000-0000-0000-0000000000a1', 'job_id', '44444444-0000-0000-0000-0000000000e1',
  'unit_number', 'DFTEST', 'items', '[{"q":1,"d":"Patch drywall","a":40}]'::jsonb, 'total', 40, 'status', 'sent')))->'data'->>'is_test')::boolean as r3 \gset
select pg_temp.ok('тестовый ремонт создан от имени работника: пометка, владелец прогона, номер из тестового диапазона, привязан к тестовой задаче',
  :'r3'::boolean and (select is_test and test_owner = :TECH::uuid and created_by = :TECH::uuid and no > 90000000 from public.repairs where id = '88888888-0000-0000-0000-0000000000a1'));
select pg_temp.ok('ремонт к НАСТОЯЩЕЙ задаче функция не создаёт: DFT_NOT_TEST_DOC',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'rep_create', '{"row":{"job_id":"44444444-0000-0000-0000-0000000000f1"}}')$q$, 'DFT_NOT_TEST_DOC'));
select pg_temp.ok('апрув ремонта от имени работника и менеджера без права: FORBIDDEN_APPROVE',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000a1","patch":{"status":"approved"}}')$q$, 'FORBIDDEN_APPROVE')
  and pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b2', 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000a1","patch":{"status":"approved"}}')$q$, 'FORBIDDEN_APPROVE'));
select (public.dft_exec(:TECH, :APPR, 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000a1","patch":{"status":"approved"}}')->'data'->>'status') as st1 \gset
select pg_temp.ok('v1.09.34: автора и время апрува записал сервер', (select decided_by = :APPR::uuid and decided_at is not null from public.repairs where id = '88888888-0000-0000-0000-0000000000a1'));
select pg_temp.ok('менеджер С правом апрува апрувит ремонт; работнику (владельцу прогона) в ленту — «Ремонт апрувлен», посторонним пушей нет',
  :'st1' = 'approved' and exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Ремонт апрувлен') and not exists(select 1 from public.push_queue where user_id <> :TECH::uuid and url like '%88888888-0000-0000-0000-0000000000a1%'));
select (public.dft_exec(:TECH, :ADM, 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000a1","patch":{"status":"declined","decline_reason":"не та квартира"}}')->'data'->>'status') as st2 \gset
select pg_temp.ok('админ отклоняет ремонт с причиной', :'st2' = 'declined' and (select decline_reason from public.repairs where id = '88888888-0000-0000-0000-0000000000a1') = 'не та квартира');
select (public.dft_exec(:TECH, :TECH, 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000a1","patch":{"status":"sent"}}')->'data'->>'status') as st3 \gset
select pg_temp.ok('работник отправил ремонт снова — решение снято сервером', :'st3' = 'sent' and (select decided_by is null and decided_at is null from public.repairs where id = '88888888-0000-0000-0000-0000000000a1'));
select pg_temp.ok('посторонний работник тестовый ремонт не правит: RLS_DENIED',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b5', 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000a1","patch":{"note":"x"}}')$q$, 'RLS_DENIED'));
-- пометку у ремонта клиент не ставит
select pg_temp.me(:TECH);
select pg_temp.ok('обычной вставкой «тестовый» ремонт не создать: DFT_TEST_ROW',
  pg_temp.throws($q$insert into public.repairs (id, date, unit_number, created_by, status, is_test, test_owner) values ('88888888-0000-0000-0000-0000000000a2', current_date, 'DFTEST-UI', '00000000-0000-0000-0000-0000000000b4', 'draft', true, '00000000-0000-0000-0000-0000000000b4')$q$, 'DFT_TEST_ROW'));
select pg_temp.me(:TECH);
insert into public.repairs (id, date, unit_number, created_by, status) values ('88888888-0000-0000-0000-0000000000a2', current_date, 'DFTEST-UI', :TECH, 'draft');
update public.repairs set is_test = true where id = '88888888-0000-0000-0000-0000000000a2';
select pg_temp.ok('…и правкой — тоже', (select is_test = false from public.repairs where id = '88888888-0000-0000-0000-0000000000a2'));
insert into public.proposals (id, date, unit_number, status, created_by) values ('55555555-0000-0000-0000-0000000000a2', current_date, 'DFTEST-UI', 'draft', :TECH);
insert into public.proposals (id, date, unit_number, status, created_by) values ('55555555-0000-0000-0000-0000000000a3', current_date, '916', 'draft', :TECH);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.ok('rep_adopt / prop_adopt: свой свежий черновик DFTEST, созданный кнопками, принят в тест',
  (public.dft_exec(:TECH, :TECH, 'rep_adopt', '{"run":"r3","id":"88888888-0000-0000-0000-0000000000a2"}')->'data'->>'is_test')::boolean
  and (public.dft_exec(:TECH, :TECH, 'prop_adopt', '{"run":"r3","id":"55555555-0000-0000-0000-0000000000a2"}')->'data'->>'is_test')::boolean);
select pg_temp.ok('рабочий пропозал (юнит не DFTEST) и чужой ремонт в тест не принимаются: DFT_ADOPT_DENIED',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'prop_adopt', '{"id":"55555555-0000-0000-0000-0000000000a3"}')$q$, 'DFT_ADOPT_DENIED')
  and pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000b5', 'rep_adopt', '{"id":"88888888-0000-0000-0000-0000000000a2"}')$q$, 'DFT_NOT_YOUR_RUN'));
select (public.dft_exec(:TECH, :TECH, 'cleanup', '{"run":"r3"}')->>'deleted')::int as d3 \gset
select pg_temp.ok('уборка прогона удалила тестовые ремонты и принятый пропозал; рабочий пропозал цел',
  not exists(select 1 from public.repairs where is_test) and not exists(select 1 from public.proposals where is_test) and exists(select 1 from public.proposals where id = '55555555-0000-0000-0000-0000000000a3'));

-- ===== 11. v1.09.31 · пуши в тесте, «всем участникам», отчёт о пушах; пропозал без «отправки клиенту» =====
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH, :MGR, 'job_create', jsonb_build_object('run', 'r4', 'wide', true, 'row', jsonb_build_object('id', '44444444-0000-0000-0000-0000000000e4', 'technician_id', :TECH, 'unit_number', 'DFTEST-W')))->'data'->>'test_wide')::boolean as wide \gset
select pg_temp.me(:TECH);
update public.jobs set status = 'done' where id = '44444444-0000-0000-0000-0000000000e4';
select pg_temp.ok('галочка «всем участникам»: событие тестового документа получили и согласующие — лента и пуш',
  :'wide'::boolean and exists(select 1 from public.notices where user_id = :ADM::uuid and title = 'Ждёт апрува' and url like '%0000000000e4%')
  and exists(select 1 from public.push_queue where user_id = :APPR::uuid and title = 'Ждёт апрува' and url like '%0000000000e4%'));
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.ok('dft_pushes: отчёт о пушах прогона — кому, что, отправлено ли; клиенту функция недоступна',
  jsonb_array_length(public.dft_pushes(:TECH::uuid, 'r4')) >= 2 and (public.dft_pushes(:TECH::uuid, 'r4')->0->>'title') is not null
  and not has_function_privilege('authenticated', 'public.dft_pushes(uuid,text)', 'execute'));
select pg_temp.me(:MGR);
select pg_temp.ok('пропозал клиенту не отправляется: статус «Отправлен» выключен — PROP_SEND_OFF',
  pg_temp.throws($q$update public.proposals set status = 'sent' where id = '55555555-0000-0000-0000-0000000000a3'$q$, 'PROP_SEND_OFF')
  and pg_temp.throws($q$insert into public.proposals (id, date, status, created_by) values ('55555555-0000-0000-0000-0000000000a9', current_date, 'sent', '00000000-0000-0000-0000-0000000000b2')$q$, 'PROP_SEND_OFF'));
set session_replication_role = replica;
update public.org_settings set prop_send_on = true where id = 'org';
set session_replication_role = origin;
select pg_temp.me(:MGR);
update public.proposals set status = 'sent' where id = '55555555-0000-0000-0000-0000000000a3';
select pg_temp.ok('админ включил настройку — статус «Отправлен» снова доступен; «Одобрен» и «Отклонён» доступны всегда', (select status from public.proposals where id = '55555555-0000-0000-0000-0000000000a3') = 'sent');
set session_replication_role = replica;
update public.org_settings set prop_send_on = false where id = 'org';
set session_replication_role = origin;
select pg_temp.me(:MGR);
update public.proposals set status = 'approved' where id = '55555555-0000-0000-0000-0000000000a3';
select pg_temp.ok('уже отправленный пропозал при выключенной настройке переводится дальше без помех', (select status from public.proposals where id = '55555555-0000-0000-0000-0000000000a3') = 'approved');
select set_config('request.jwt.claim.sub', '', true);
select public.dft_exec(:TECH, :TECH, 'cleanup', '{"run":"r4"}') is not null as c4 \gset

-- ===== 12. v1.09.33 · заявка на продление сверх лимита от имени работника =====
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH, :MGR, 'job_create', jsonb_build_object('run', 'r5', 'row', jsonb_build_object('id', '44444444-0000-0000-0000-0000000000e5', 'technician_id', :TECH, 'unit_number', 'DFTEST-X')))->>'ok')::boolean as j5 \gset
select pg_temp.ok('заявка без ожидающих пикапов не создаётся: DFT_NO_PENDING',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4', 'ext_req_create', '{"job_id":"44444444-0000-0000-0000-0000000000e5","days":4}')$q$, 'DFT_NO_PENDING'));
select (public.dft_exec(:TECH, :ADM, 'pl_upsert', jsonb_build_object('row', jsonb_build_object('id', '66666666-0000-0000-0000-0000000000e5', 'job_id', '44444444-0000-0000-0000-0000000000e5', 'equipment_type_id', '77777777-0000-0000-0000-0000000000e1', 'qty', 2, 'days', 1,
  'due_date', (current_date + 1)::text, 'technician_id', :TECH)))->>'ok')::boolean as pl5 \gset
select pg_temp.ok('заявка от имени постороннего работника: RLS_DENIED',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b5', 'ext_req_create', '{"job_id":"44444444-0000-0000-0000-0000000000e5","days":4}')$q$, 'RLS_DENIED'));
select public.dft_exec(:TECH, :TECH, 'ext_req_create', '{"job_id":"44444444-0000-0000-0000-0000000000e5","days":4}')->'data'->>'id' as rq5 \gset
select pg_temp.ok('заявка от имени исполнителя создана: дни, количество, состав техники, ожидает решения',
  (select days = 4 and qty_total = 2 and eq like 'DFB×2%' and status = 'pending' and requested_by = :TECH::uuid from public.ext_requests where id = :'rq5'::uuid));
select (public.dft_exec(:TECH, :MGR, 'rpc', jsonb_build_object('fn', 'decide_ext_request', 'args', jsonb_build_object('p_id', :'rq5', 'p_ok', true)))->>'ok')::boolean as dec5 \gset
select pg_temp.ok('решение по заявке — через закрытый список функции (менеджер): заявка одобрена, продление создано тестовым',
  :'dec5'::boolean and (select status = 'approved' from public.ext_requests where id = :'rq5'::uuid)
  and exists(select 1 from public.placements where ext_of = '66666666-0000-0000-0000-0000000000e5' and is_test));
select public.dft_exec(:TECH, :TECH, 'cleanup', '{"run":"r5"}')->>'deleted' as c5 \gset
select pg_temp.ok('уборка удалила и заявку', not exists(select 1 from public.ext_requests where id = :'rq5'::uuid));

select n, case when ok then '✓' else '✗' end || ' ' || name || case when note <> '' then '  [' || note || ']' else '' end from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
