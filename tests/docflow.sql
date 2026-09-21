-- v1.09.25 · функциональная проверка документооборота инвойса.
-- Запуск: локальный PostgreSQL + заглушка Supabase, база после full-install-1_09_25.sql
-- (или 1_09_24 + update-to-1_09_25.sql). psql -tA -d <база> -f tests/docflow.sql → «ИТОГ: N ✓ / 0 ✗». Всё в BEGIN…ROLLBACK.
\set ON_ERROR_STOP 1
begin;
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'df_adm@x'), ('00000000-0000-0000-0000-0000000000a2', 'df_mgr@x'),
  ('00000000-0000-0000-0000-0000000000a3', 'df_mgr2@x'), ('00000000-0000-0000-0000-0000000000a4', 'df_main@x'),
  ('00000000-0000-0000-0000-0000000000a5', 'df_help@x'), ('00000000-0000-0000-0000-0000000000a6', 'df_out@x')
  on conflict do nothing;
insert into public.profiles (id, login, display_name, role, can_approve, can_edit_docs) values
  ('00000000-0000-0000-0000-0000000000a1', 'df_adm',  'Df Admin',   'admin',   false, true),
  ('00000000-0000-0000-0000-0000000000a2', 'df_mgr',  'Df Approver','manager', true,  true),
  ('00000000-0000-0000-0000-0000000000a3', 'df_mgr2', 'Df Manager', 'manager', false, true),
  ('00000000-0000-0000-0000-0000000000a4', 'df_main', 'Df Main',    'tech',    false, true),
  ('00000000-0000-0000-0000-0000000000a5', 'df_help', 'Df Helper',  'tech',    false, true),
  ('00000000-0000-0000-0000-0000000000a6', 'df_out',  'Df Outsider','tech',    false, true)
  on conflict (id) do update set role = excluded.role, can_approve = excluded.can_approve, can_edit_docs = excluded.can_edit_docs, blocked = false;
insert into public.org_settings (id) values ('org') on conflict do nothing;
update public.org_settings set allow_shared_jobs = true, edit_lock_days = 0 where id = 'org';
set session_replication_role = origin;

create temp table r (n int, name text, ok boolean, note text);
grant all on r to authenticated;
create temp sequence rn; grant usage, select, update on sequence rn to authenticated;
create function pg_temp.throws(p_sql text, p_msg text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return position(p_msg in sqlerrm) > 0; end $$;
create function pg_temp.ok(p_name text, p_ok boolean, p_note text default '') returns void language sql as
  $$ insert into r values (nextval('rn'), p_name, coalesce(p_ok, false), p_note) $$;
create function pg_temp.me(p text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p, true) $$;
\set ADM  '''00000000-0000-0000-0000-0000000000a1'''
\set MGR  '''00000000-0000-0000-0000-0000000000a2'''
\set MGR2 '''00000000-0000-0000-0000-0000000000a3'''
\set MAIN '''00000000-0000-0000-0000-0000000000a4'''
\set HELP '''00000000-0000-0000-0000-0000000000a5'''
\set OUT  '''00000000-0000-0000-0000-0000000000a6'''
\set JOB  '''11111111-0000-0000-0000-0000000000d1'''

-- ===== 1. Черновик: номера нет, ревизия 0, автор записан =====
select pg_temp.me(:MAIN);
insert into public.jobs (id, date, unit_number, technician_id, helper_ids, status, form_data, total)
  values (:JOB, current_date, '101', :MAIN, jsonb_build_array(:HELP), 'draft', '{"a":1}', 10);
select pg_temp.ok('черновик: номера нет, ревизия 0, автор записан', no is null and rev = 0 and updated_by = :MAIN::uuid and doc_no is null,
  coalesce(no::text,'∅') || '/' || rev) from public.jobs where id = :JOB;
select pg_temp.ok('помощник о новой задаче узнал из ленты', exists(select 1 from public.notices where user_id = :HELP::uuid and title = 'Вас добавили в бригаду'));

-- ===== 2. Upsert без изменений не тратит счётчик и не трогает ревизию =====
create temp table sq as select last_value as v, is_called as c from public.jobs_doc_no_seq;
insert into public.jobs (id, date, unit_number, technician_id, helper_ids, status, form_data, total, rev)
  values (:JOB, current_date, '101', :MAIN, jsonb_build_array(:HELP), 'draft', '{"a":1}', 10, 0)
  on conflict (id) do update set date = excluded.date, unit_number = excluded.unit_number, status = excluded.status,
    form_data = excluded.form_data, total = excluded.total, rev = excluded.rev, helper_ids = excluded.helper_ids;
select pg_temp.ok('upsert без правок: счётчик номеров не тронут, ревизия прежняя',
  (select last_value from public.jobs_doc_no_seq) = (select v from sq) and (select rev from public.jobs where id = :JOB) = 0);

-- ===== 3. Видимость (RLS под authenticated) =====
select pg_temp.me(:HELP); set local role authenticated;
select pg_temp.ok('помощник видит документ без «Общего доступа»', (select count(*) from public.jobs where id = :JOB) = 1);
update public.jobs set note = 'helper was here' where id = :JOB;
reset role;
select pg_temp.ok('…но править не может (RLS)', (select coalesce(note,'') from public.jobs where id = :JOB) = '');
select pg_temp.me(:OUT); set local role authenticated;
select pg_temp.ok('посторонний документ не видит', (select count(*) from public.jobs where id = :JOB) = 0);
reset role;

-- ===== 4. Общий доступ + личное право; ревизия =====
select pg_temp.me(:MAIN);
update public.jobs set shared_with_helpers = true where id = :JOB;
select pg_temp.ok('основной включил «Общий доступ»: ревизия выросла', (select rev from public.jobs where id = :JOB) = 1);
select pg_temp.me(:HELP); set local role authenticated;
update public.jobs set form_data = '{"a":2}', rev = 1 where id = :JOB;
reset role;
select pg_temp.ok('помощник с правом правит общий документ', form_data = '{"a":2}' and rev = 2 and updated_by = :HELP::uuid, rev::text) from public.jobs where id = :JOB;
select pg_temp.me(:MAIN);
select pg_temp.ok('основной со старой ревизией: STALE_DOC, чужая правка цела',
  pg_temp.throws($q$update public.jobs set form_data = '{"a":3}', rev = 1 where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'STALE_DOC')
  and (select form_data from public.jobs where id = :JOB) = '{"a":2}');
select pg_temp.me(:MAIN);
update public.jobs set form_data = '{"a":3}', rev = 2 where id = :JOB;
select pg_temp.ok('основной со свежей ревизией — записал', (select rev from public.jobs where id = :JOB) = 3);
update public.jobs set form_data = '{"a":4}', rev = 0 where id = :JOB;
select pg_temp.ok('повторная запись того же автора со старой ревизией проходит (досыл очереди)', (select rev from public.jobs where id = :JOB) = 4);
update public.jobs set priority = true, rev = 0 where id = :JOB;
select pg_temp.ok('приоритет без правки содержимого ревизию не меняет', (select rev from public.jobs where id = :JOB) = 4);
select pg_temp.me(:HELP);
select pg_temp.ok('помощник состав бригады не меняет: FORBIDDEN_CREW',
  pg_temp.throws($q$update public.jobs set helper_ids = '[]' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_CREW'));
select pg_temp.me(:ADM);
select public.admin_set_doc_rights(:HELP, null, false, null);
select pg_temp.me(:HELP); set local role authenticated;
update public.jobs set note = 'no right' where id = :JOB;
reset role;
select pg_temp.ok('без личного права помощник общий документ не правит', (select coalesce(note,'') from public.jobs where id = :JOB) = '');
select pg_temp.me(:ADM);
select public.admin_set_doc_rights(:HELP, null, true, null);

-- ===== 5. Личные права: сокращение =====
select pg_temp.me(:MAIN);
select pg_temp.ok('права ставит только админ', pg_temp.throws($q$select public.admin_set_doc_rights('00000000-0000-0000-0000-0000000000a4', 'DFM', true, true)$q$, 'FORBIDDEN'));
select pg_temp.me(:ADM);
select public.admin_set_doc_rights(:MAIN, 'dfm', null, null);
select pg_temp.ok('сокращение приводится к верхнему регистру', (select tag from public.profiles where id = :MAIN::uuid) = 'DFM');
select pg_temp.ok('чужое сокращение занять нельзя: TAG_TAKEN', pg_temp.throws($q$select public.admin_set_doc_rights('00000000-0000-0000-0000-0000000000a5', 'DFM', null, null)$q$, 'TAG_TAKEN'));
select pg_temp.me(:ADM);
select pg_temp.ok('сокращение из одного знака: BAD_TAG', pg_temp.throws($q$select public.admin_set_doc_rights('00000000-0000-0000-0000-0000000000a5', 'X', null, null)$q$, 'BAD_TAG'));
select pg_temp.me(:MAIN);
select pg_temp.ok('сам себе право апрува не выдаст: FORBIDDEN_FIELD',
  pg_temp.throws($q$update public.profiles set can_approve = true where id = '00000000-0000-0000-0000-0000000000a4'$q$, 'FORBIDDEN_FIELD'));

-- ===== 6. «Выполнена»: номер, замок, отзыв =====
select pg_temp.me(:MAIN);
update public.jobs set status = 'done' where id = :JOB;
create temp table n1 as select no from public.jobs where id = :JOB;
select pg_temp.ok('первый НЕ черновик: номер выдан', no is not null and numbered_at is not null, no::text) from public.jobs where id = :JOB;
select pg_temp.ok('согласующие получили «Ждёт апрува» (админ и менеджер с правом, без права — нет)',
  (select count(*) from public.notices where title = 'Ждёт апрува' and user_id in (:ADM::uuid, :MGR::uuid)) = 2
  and not exists(select 1 from public.notices where title = 'Ждёт апрува' and user_id = :MGR2::uuid));
select pg_temp.ok('правка содержимого в «Выполнена»: DOC_LOCKED_DONE',
  pg_temp.throws($q$update public.jobs set form_data = '{"a":5}' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'DOC_LOCKED_DONE'));
-- v1.09.26: отозвать может тот, кто правит черновик. Помощник без «Общего доступа» — нет, посторонний техник — нет.
set session_replication_role = replica;
update public.jobs set shared_with_helpers = false where id = :JOB;
set session_replication_role = origin;
select pg_temp.me(:HELP);
select pg_temp.ok('помощник без «Общего доступа» отозвать не может: DOC_LOCKED_DONE',
  pg_temp.throws($q$update public.jobs set status = 'draft' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'DOC_LOCKED_DONE'));
set session_replication_role = replica;
update public.jobs set shared_with_helpers = true where id = :JOB;
set session_replication_role = origin;
select pg_temp.me(:MAIN);
update public.jobs set status = 'draft', form_data = '{"a":5}' where id = :JOB;
select pg_temp.ok('основной отозвал и поправил одним сохранением; номер прежний',
  status = 'draft' and form_data = '{"a":5}' and no = (select no from n1)) from public.jobs where id = :JOB;
select pg_temp.ok('согласующий и помощник узнали об отзыве', exists(select 1 from public.notices where user_id = :MGR::uuid and title = 'Документ отозван из согласования')
  and exists(select 1 from public.notices where user_id = :HELP::uuid and title = 'Документ отозван из согласования'));
update public.jobs set status = 'done' where id = :JOB;
select pg_temp.ok('повторное «Выполнено»: номер не меняется', (select no from public.jobs where id = :JOB) = (select no from n1));

-- ===== 7. Возврат на доработку =====
select pg_temp.me(:MGR);
update public.jobs set status = 'draft', return_note = 'нет фото счётчика' where id = :JOB;
select pg_temp.ok('согласующий вернул: причина и автор возврата записаны', status = 'draft' and return_note = 'нет фото счётчика' and returned_by = :MGR::uuid) from public.jobs where id = :JOB;
select pg_temp.ok('основной и помощник получили «Возвращён на доработку» с причиной',
  (select count(*) from public.notices where title = 'Возвращён на доработку' and body like '%нет фото счётчика%' and user_id in (:MAIN::uuid, :HELP::uuid)) = 2);
select pg_temp.me(:MAIN);
update public.jobs set status = 'done' where id = :JOB;
select pg_temp.ok('после повторной сдачи причина возврата очищена', return_note is null and returned_by is null) from public.jobs where id = :JOB;

-- ===== 8. Апрув =====
select pg_temp.me(:MGR2);
select pg_temp.ok('менеджер без права: approve_job → FORBIDDEN', pg_temp.throws($q$select public.approve_job('11111111-0000-0000-0000-0000000000d1', 10)$q$, 'FORBIDDEN'));
select pg_temp.me(:MGR2);
select pg_temp.ok('менеджер без права: прямой статус → FORBIDDEN_APPROVE',
  pg_temp.throws($q$update public.jobs set status = 'approved' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_APPROVE'));
select pg_temp.me(:MAIN);
select pg_temp.ok('исполнитель сам себя не апрувит', pg_temp.throws($q$update public.jobs set status = 'approved' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_APPROVE'));
select pg_temp.me(:MGR);
select public.approve_job(:JOB, 12);
select pg_temp.ok('менеджер с правом апрувит; состав бригады зафиксирован',
  status = 'approved' and approved_total = 12 and approved_by = :MGR::uuid and approved_crew->>'main' = '00000000-0000-0000-0000-0000000000a4'
  and approved_crew->'crew' ? '00000000-0000-0000-0000-0000000000a5') from public.jobs where id = :JOB;
select pg_temp.ok('основной и помощник получили «Инвойс апрувлен»',
  (select count(*) from public.notices where title = 'Инвойс апрувлен' and user_id in (:MAIN::uuid, :HELP::uuid)) = 2);
select pg_temp.me(:MAIN);
select pg_temp.ok('правка после апрува: DOC_LOCKED_APPROVED', pg_temp.throws($q$update public.jobs set form_data = '{"a":6}' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'DOC_LOCKED_APPROVED'));
select pg_temp.me(:MAIN);
select pg_temp.ok('снять «Выполнено» после апрува: DOC_LOCKED_APPROVED', pg_temp.throws($q$update public.jobs set status = 'draft' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'DOC_LOCKED_APPROVED'));
select pg_temp.me(:MAIN);
select pg_temp.ok('в архив после апрува — только админ: DOC_LOCKED_DELETE', pg_temp.throws($q$update public.jobs set archived_at = now() where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'DOC_LOCKED_DELETE'));
select pg_temp.me(:MAIN);
update public.jobs set priority = false where id = :JOB;
select pg_temp.ok('приоритет у заапрувленного менять можно — апрув цел', status = 'approved' and approved_total = 12) from public.jobs where id = :JOB;

-- ===== 9. Замороженный номер =====
create temp table nt as select 'WORK-U101-DFM-' || lpad(no::text, 5, '0') as t from public.jobs where id = :JOB;
grant select on nt to authenticated;
select pg_temp.me(:HELP);
select pg_temp.ok('job_fix_no: текст номера записан', public.job_fix_no(:JOB, (select t from nt)) = (select t from nt));
select pg_temp.ok('второй вызов возвращает уже замороженный', public.job_fix_no(:JOB, 'OTHER') = (select t from nt));
select pg_temp.me(:MAIN);
update public.jobs set doc_no = 'HACK', priority = true where id = :JOB;
select pg_temp.ok('прямой записью номер не меняется', (select doc_no from public.jobs where id = :JOB) = (select t from nt));
select pg_temp.me(:OUT);
select pg_temp.ok('посторонний номер не фиксирует: FORBIDDEN', pg_temp.throws($q$select public.job_fix_no('11111111-0000-0000-0000-0000000000d1', 'X1')$q$, 'FORBIDDEN'));

-- ===== 10. Запрос правки =====
select pg_temp.me(:OUT);
select pg_temp.ok('запрос от постороннего: FORBIDDEN', pg_temp.throws($q$select public.doc_request_edit('11111111-0000-0000-0000-0000000000d1', 'хочу')$q$, 'FORBIDDEN'));
select pg_temp.me(:MAIN);
select pg_temp.ok('запрос без причины: REASON_REQUIRED', pg_temp.throws($q$select public.doc_request_edit('11111111-0000-0000-0000-0000000000d1', ' ')$q$, 'REASON_REQUIRED'));
select pg_temp.me(:MAIN);
select public.doc_request_edit(:JOB, 'забыл осушитель');
select pg_temp.ok('запрос создан, согласующие оповещены',
  (select count(*) from public.doc_requests where doc_id = :JOB::uuid and status = 'pending') = 1
  and (select count(*) from public.notices where title = 'Запрос на правку документа' and user_id in (:ADM::uuid, :MGR::uuid)) = 2);
select pg_temp.ok('второй запрос на тот же документ: ALREADY_PENDING', pg_temp.throws($q$select public.doc_request_edit('11111111-0000-0000-0000-0000000000d1', 'ещё раз')$q$, 'ALREADY_PENDING'));
select pg_temp.me(:MGR2);
select pg_temp.ok('решает только согласующий: FORBIDDEN',
  pg_temp.throws(format($q$select public.doc_request_decide(%L, true, '')$q$, (select id from public.doc_requests where doc_id = :JOB::uuid and status = 'pending')), 'FORBIDDEN'));
select pg_temp.me(:MGR);
select public.doc_request_decide((select id from public.doc_requests where doc_id = :JOB::uuid and status = 'pending'), true, 'правь');
select pg_temp.ok('разрешено: документ в черновике, апрув снят, окно правки открыто, номер цел',
  status = 'draft' and approved_total is null and approved_by is null and edit_open_until > now() + interval '23 hours'
  and no = (select no from n1) and doc_no = (select t from nt)) from public.jobs where id = :JOB;
select pg_temp.ok('бригада получила «Апрув снят — документ в черновике»',
  (select count(*) from public.notices where title = 'Апрув снят — документ в черновике' and user_id in (:MAIN::uuid, :HELP::uuid)) = 2);
-- окно правки обходит запрет по давности
set session_replication_role = replica;
update public.org_settings set edit_lock_days = 3 where id = 'org';
update public.jobs set date = current_date - 30 where id = :JOB;
set session_replication_role = origin;
select pg_temp.me(:MAIN);
update public.jobs set form_data = '{"a":7}' where id = :JOB;
select pg_temp.ok('разрешённая правка старого документа проходит при включённом запрете по давности', (select form_data from public.jobs where id = :JOB) = '{"a":7}');
set session_replication_role = replica;
update public.jobs set edit_open_until = null where id = :JOB;
set session_replication_role = origin;
select pg_temp.me(:MAIN);
select pg_temp.ok('без окна правки тот же документ заперт: LOCKED', pg_temp.throws($q$update public.jobs set form_data = '{"a":8}' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'LOCKED'));
set session_replication_role = replica;
update public.org_settings set edit_lock_days = 0 where id = 'org';
update public.jobs set date = current_date where id = :JOB;
set session_replication_role = origin;
-- отказ
select pg_temp.me(:MAIN);
update public.jobs set status = 'done' where id = :JOB;
select pg_temp.me(:ADM);
update public.jobs set status = 'approved', approved_total = 15 where id = :JOB;
select pg_temp.me(:HELP);
select public.doc_request_edit(:JOB, 'не та квартира');
select pg_temp.me(:ADM);
select public.doc_request_decide((select id from public.doc_requests where doc_id = :JOB::uuid and status = 'pending'), false, 'всё верно');
select pg_temp.ok('отказ: апрув цел, автор запроса оповещён',
  (select status from public.jobs where id = :JOB) = 'approved'
  and exists(select 1 from public.notices where user_id = :HELP::uuid and title = 'В правке отказано' and body like '%всё верно%'));

-- ===== 11. Бригада и основной =====
select pg_temp.me(:ADM);
update public.jobs set status = 'draft' where id = :JOB;
select pg_temp.me(:MAIN);
delete from public.notices;
update public.jobs set helper_ids = '[]' where id = :JOB;
select pg_temp.ok('сняли с задачи: строка в ленте у помощника', exists(select 1 from public.notices where user_id = :HELP::uuid and title = 'Вас сняли с задачи'));
update public.jobs set helper_ids = jsonb_build_array(:HELP) where id = :JOB;
select pg_temp.ok('добавили в бригаду: строка в ленте', exists(select 1 from public.notices where user_id = :HELP::uuid and title = 'Вас добавили в бригаду'));
select pg_temp.me(:MGR2);
update public.jobs set technician_id = :OUT where id = :JOB;
select pg_temp.ok('менеджер переназначил черновик: новый и прежний основной оповещены',
  (select technician_id from public.jobs where id = :JOB) = :OUT::uuid
  and exists(select 1 from public.notices where user_id = :OUT::uuid and title = 'Задача передана вам')
  and exists(select 1 from public.notices where user_id = :MAIN::uuid and title = 'Вас сняли с задачи'));
select pg_temp.me(:ADM);
update public.jobs set technician_id = null where id = :JOB;
select pg_temp.me(:MGR2);
update public.jobs set technician_id = :MAIN where id = :JOB;
select pg_temp.ok('менеджер назначает исполнителя ничейной задаче (старый баг сторожа)', (select technician_id from public.jobs where id = :JOB) = :MAIN::uuid);
select pg_temp.me(:MAIN);
update public.jobs set status = 'done' where id = :JOB;
select pg_temp.me(:MGR2);
select pg_temp.ok('после «Выполнено» менеджер основного не меняет: FORBIDDEN_FIELD',
  pg_temp.throws($q$update public.jobs set technician_id = '00000000-0000-0000-0000-0000000000a6' where id = '11111111-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_FIELD'));

-- ===== 12. Лента и выключенный пуш =====
set session_replication_role = replica;
update public.profiles set push_prefs = '{"approve": false}' where id = :MAIN::uuid;
set session_replication_role = origin;
delete from public.push_queue; delete from public.notices;
select pg_temp.me(:ADM);
update public.jobs set status = 'approved', approved_total = 20 where id = :JOB;
select pg_temp.ok('пуш «апрув» выключен: в очереди пусто, а в ленте строка есть',
  not exists(select 1 from public.push_queue where user_id = :MAIN::uuid and kind = 'approve')
  and exists(select 1 from public.notices where user_id = :MAIN::uuid and kind = 'approve'));
select pg_temp.ok('у помощника пуш включён: и очередь, и лента',
  exists(select 1 from public.push_queue where user_id = :HELP::uuid and kind = 'approve')
  and exists(select 1 from public.notices where user_id = :HELP::uuid and kind = 'approve'));
select pg_temp.me(:MAIN); set local role authenticated;
select pg_temp.ok('лента личная: вижу только свои строки (RLS)', (select count(*) from public.notices) = (select count(*) from public.notices where user_id = :MAIN::uuid) and (select count(*) from public.notices) >= 1);
select pg_temp.ok('notices_mark_read отметил прочитанным', public.notices_mark_read() >= 1);
reset role;
select pg_temp.me(:ADM);
update public.jobs set archived_at = now() where id = :JOB;
select pg_temp.ok('удаление (архив): бригада оповещена', (select count(*) from public.notices where title = 'Задача удалена' and user_id in (:MAIN::uuid, :HELP::uuid)) = 2);
update public.jobs set archived_at = null where id = :JOB;

-- ===== 13. «Занято» =====
select pg_temp.me(:MAIN);
select pg_temp.ok('блокировка взята', (public.doc_lock('job', :JOB, false)->>'ok')::boolean);
select pg_temp.ok('продление своим же — ок', (public.doc_lock('job', :JOB, false)->>'ok')::boolean);
select pg_temp.me(:HELP);
select pg_temp.ok('второму — отказ с именем держателя', (public.doc_lock('job', :JOB, false)->>'ok')::boolean = false and public.doc_lock('job', :JOB, false)->>'name' = 'Df Main');
select pg_temp.ok('«Запросить редактирование»: отказ с пометкой «держателя попросили»', (public.doc_lock('job', :JOB, true)->>'asked')::boolean);
select pg_temp.ok('…и держателю ушло уведомление', exists(select 1 from public.notices where user_id = :MAIN::uuid and title = 'Просят доступ к документу'));
select pg_temp.ok('повторный запрос в те же 2 минуты не дублируется', (public.doc_lock('job', :JOB, true)->>'asked')::boolean = false);
select pg_temp.me(:MGR2);
select pg_temp.ok('менеджер перехватывает сразу', (public.doc_lock('job', :JOB, true)->>'ok')::boolean);
update public.doc_locks set at = now() - interval '3 minutes' where doc_id = :JOB::uuid;
select pg_temp.me(:HELP);
select pg_temp.ok('уснувшую блокировку (старше 2 минут) забирает любой', (public.doc_lock('job', :JOB, false)->>'ok')::boolean);
select public.doc_unlock('job', :JOB);
select pg_temp.ok('снята', not exists(select 1 from public.doc_locks where doc_id = :JOB::uuid));
select pg_temp.me(:OUT);
select pg_temp.ok('посторонний блокировку не берёт: FORBIDDEN', pg_temp.throws($q$select public.doc_lock('job', '11111111-0000-0000-0000-0000000000d1', false)$q$, 'FORBIDDEN'));

-- ===== 14. Новый документ сразу «Выполнена»; удаление строки =====
select pg_temp.me(:MAIN);
insert into public.jobs (id, date, unit_number, technician_id, status, form_data, total)
  values ('11111111-0000-0000-0000-0000000000d2', current_date, '202', :MAIN, 'done', '{}', 5);
select pg_temp.ok('вставка сразу «Выполнена»: номер выдан, и он следующий', no > (select no from n1) and rev = 0, no::text) from public.jobs where id = '11111111-0000-0000-0000-0000000000d2';
select pg_temp.ok('вставка сразу «Апрув» исполнителем: FORBIDDEN_APPROVE',
  pg_temp.throws($q$insert into public.jobs (id, date, technician_id, status) values ('11111111-0000-0000-0000-0000000000d3', current_date, '00000000-0000-0000-0000-0000000000a4', 'approved')$q$, 'FORBIDDEN_APPROVE'));
select pg_temp.me(:MAIN); set local role authenticated;
delete from public.jobs where id = '11111111-0000-0000-0000-0000000000d2';
reset role;
select pg_temp.ok('строку НЕ черновика основной не удаляет (RLS)', exists(select 1 from public.jobs where id = '11111111-0000-0000-0000-0000000000d2'));

-- ===== 15. Ремонты: право апрува личное =====
select pg_temp.ok('repairs_guard переведён на can_approve_docs()', position('can_approve_docs' in pg_get_functiondef('public.repairs_guard()'::regprocedure)) > 0);

-- ===== 16. «Важные объявления»: круг пишущих и неотключаемый пуш =====
select pg_temp.me(:OUT);
select pg_temp.ok('техник без права в «Важные объявления» не пишет: FORBIDDEN',
  pg_temp.throws($q$select public.chat_send(null, 'ann', null, 'привет', false, null, null, null, null, null, null, null, null)$q$, 'FORBIDDEN'));
select pg_temp.me(:OUT);
select pg_temp.ok('право писать выдаёт только админ', pg_temp.throws($q$select public.admin_set_announce('00000000-0000-0000-0000-0000000000a6', true)$q$, 'FORBIDDEN'));
select pg_temp.me(:ADM);
select public.admin_set_announce(:OUT, true);
set session_replication_role = replica;
update public.profiles set push_prefs = '{"chat": false, "chat_mute": ["ann"]}' where id = :HELP::uuid;
set session_replication_role = origin;
delete from public.push_queue; delete from public.notices;
select pg_temp.me(:OUT);
select (public.chat_send(null, 'ann', null, 'завтра склад закрыт', false, null, null, null, null, null, null, null, null)).id is not null as sent \gset
select pg_temp.ok('выбранный админом техник пишет в «Важные объявления»', :'sent'::boolean);
select pg_temp.ok('пуш объявления уходит даже при выключенных пушах чата и «не беспокоить»',
  exists(select 1 from public.push_queue where user_id = :HELP::uuid and kind = 'chat' and title = 'Важные объявления' and url = './?chat=ann'));
select pg_temp.ok('переписка в ленту уведомлений не попадает', not exists(select 1 from public.notices where kind = 'chat'));

-- ===== 17. Заморозка номеров пачкой =====
select pg_temp.me(:MAIN);
select pg_temp.ok('пачкой — только админ', pg_temp.throws($q$select public.job_fix_no_bulk('[]'::jsonb)$q$, 'FORBIDDEN'));
select pg_temp.me(:ADM);
select pg_temp.ok('job_fix_no_bulk: записал номер второму документу, уже замороженный не тронул',
  public.job_fix_no_bulk(jsonb_build_array(jsonb_build_object('id', '11111111-0000-0000-0000-0000000000d2', 't', 'WORK-U202-00002'),
                                           jsonb_build_object('id', '11111111-0000-0000-0000-0000000000d1', 't', 'OVERWRITE'))) = 1
  );
select pg_temp.ok('…первый номер цел', (select doc_no from public.jobs where id = :JOB) = (select t from nt)
  and (select doc_no from public.jobs where id = '11111111-0000-0000-0000-0000000000d2') = 'WORK-U202-00002');

-- =====================================================================
-- v1.09.26 · исправления по разбору
-- =====================================================================
\set J3 '''11111111-0000-0000-0000-0000000000d3'''
\set J4 '''11111111-0000-0000-0000-0000000000d4'''
\set PR '''33333333-0000-0000-0000-0000000000e1'''
select pg_temp.me(:MAIN);
select pg_temp.ok('«занято» — только для известных видов документов: BAD_KIND', pg_temp.throws($q$select public.doc_lock('zzz', '11111111-0000-0000-0000-0000000000d2', false)$q$, 'BAD_KIND'));

-- перевод обязателен при отправке на согласование
select pg_temp.me(:MAIN);
insert into public.jobs (id, date, unit_number, technician_id, helper_ids, status, note, form_data, total)
  values (:J3, current_date, '303', :MAIN, jsonb_build_array(:HELP), 'draft', 'ключ у консьержа', '{"others":[{"desc":"вынос мебели","amount":50},{"desc":"Haul away","amount":10}],"airduct":{"note":""},"equipment":{"e1":{"qty":2,"days":3},"e2":{"qty":0,"days":3}}}', 60);
select pg_temp.ok('job_tr_missing считает поля без перевода (заметка + одна строка Other; латиница перевода не требует)', public.job_tr_missing(note, note_en, form_data) = 2) from public.jobs where id = :J3;
select pg_temp.ok('без перевода на согласование не уходит: TRANSLATION_REQUIRED', pg_temp.throws($q$update public.jobs set status = 'done' where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'TRANSLATION_REQUIRED'));
select pg_temp.me(:ADM);
select pg_temp.ok('и сразу апрувом из черновика — тоже', pg_temp.throws($q$update public.jobs set status = 'approved' where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'TRANSLATION_REQUIRED'));
select pg_temp.me(:MAIN);
select pg_temp.ok('вставка сразу «Выполнена» без перевода: TRANSLATION_REQUIRED',
  pg_temp.throws($q$insert into public.jobs (id, date, technician_id, status, note) values ('11111111-0000-0000-0000-0000000000d9', current_date, '00000000-0000-0000-0000-0000000000a4', 'done', 'без перевода')$q$, 'TRANSLATION_REQUIRED'));
select pg_temp.me(:MAIN);
update public.jobs set note_en = 'key at the concierge', form_data = jsonb_set(form_data, '{others,0,desc_en}', '"furniture haul away"') where id = :J3;
select pg_temp.ok('перевод внесён — пропусков нет', public.job_tr_missing(note, note_en, form_data) = 0) from public.jobs where id = :J3;

-- техника: менеджер в чужом документе её только видит
select pg_temp.me(:MGR2);
select pg_temp.ok('менеджер меняет количество техники в чужом черновике: FORBIDDEN_EQUIPMENT',
  pg_temp.throws($q$update public.jobs set form_data = jsonb_set(form_data, '{equipment,e1,qty}', '5') where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'FORBIDDEN_EQUIPMENT'));
select pg_temp.me(:MGR2);
select pg_temp.ok('…и убрать её не может', pg_temp.throws($q$update public.jobs set form_data = form_data - 'equipment' where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'FORBIDDEN_EQUIPMENT'));
select pg_temp.me(:MGR2);
update public.jobs set unit_number = '303A', form_data = jsonb_set(form_data, '{equipment,e9}', '{"qty":0,"days":3}') where id = :J3;
select pg_temp.ok('остальное менеджер правит; пустая позиция техники (кол-во 0) изменением не считается', (select unit_number from public.jobs where id = :J3) = '303A');
select pg_temp.me(:ADM);
update public.jobs set form_data = jsonb_set(form_data, '{equipment,e1,qty}', '3') where id = :J3;
select pg_temp.ok('админ технику правит', (select form_data->'equipment'->'e1'->>'qty' from public.jobs where id = :J3) = '3');

-- устройства одного человека
select pg_temp.me(:MAIN);
update public.jobs set note_en = 'key at the front desk', updated_dev = 'phone', rev = (select rev from public.jobs where id = :J3) where id = :J3;
create temp table rv as select rev from public.jobs where id = :J3; grant select on rv to authenticated;
select pg_temp.ok('тот же человек с ДРУГОГО устройства и со старой ревизией: STALE_DOC',
  pg_temp.throws($q$update public.jobs set note_en = 'from pc', updated_dev = 'pc', rev = 0 where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'STALE_DOC'));
select pg_temp.me(:MAIN);
update public.jobs set note_en = 'same phone again', updated_dev = 'phone', rev = 0 where id = :J3;
select pg_temp.ok('с того же устройства досыл со старой ревизией проходит', (select note_en from public.jobs where id = :J3) = 'same phone again');

-- отозвал → удалил: у документа уже есть номер
update public.jobs set status = 'done' where id = :J3;
update public.jobs set status = 'draft' where id = :J3;
select pg_temp.ok('черновик с выданным номером основной не удаляет (обход «отозвал → удалил»): DOC_LOCKED_DELETE',
  (select no is not null from public.jobs where id = :J3) and pg_temp.throws($q$update public.jobs set archived_at = now() where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'DOC_LOCKED_DELETE'));
select pg_temp.me(:MAIN);
insert into public.jobs (id, date, unit_number, technician_id, status) values (:J4, current_date, '404', :MAIN, 'draft');
update public.jobs set archived_at = now() where id = :J4;
select pg_temp.ok('черновик без номера — удаляет', (select archived_at is not null from public.jobs where id = :J4));
set session_replication_role = replica;
insert into public.jobs (id, date, unit_number, technician_id, status, no) values ('11111111-0000-0000-0000-0000000000d5', current_date, '505', :MAIN, 'draft', 900001);
set session_replication_role = origin;
select pg_temp.me(:MAIN);
update public.jobs set archived_at = now() where id = '11111111-0000-0000-0000-0000000000d5';
select pg_temp.ok('черновик, созданный до 1.09.25 (номер есть с рождения, на согласование не отправлялся), основной удаляет по-прежнему',
  (select archived_at is not null from public.jobs where id = '11111111-0000-0000-0000-0000000000d5'));

-- привязка пропозала к запертому инвойсу
set session_replication_role = replica;
insert into public.proposals (id, date, status) values (:PR, current_date, 'draft') on conflict do nothing;
set session_replication_role = origin;
select pg_temp.me(:MAIN);
update public.jobs set status = 'done' where id = :J3;
select pg_temp.ok('текст номера без самого номера не принимается: BAD_NUMBER_TEXT', pg_temp.throws($q$select public.job_fix_no('11111111-0000-0000-0000-0000000000d3', 'WORK-ABC')$q$, 'BAD_NUMBER_TEXT'));
select pg_temp.me(:MGR2);
select pg_temp.ok('менеджер без разрешения админа пропозал к запертому инвойсу не привязывает: LINK_LOCKED',
  pg_temp.throws($q$update public.jobs set proposal_id = '33333333-0000-0000-0000-0000000000e1' where id = '11111111-0000-0000-0000-0000000000d3'$q$, 'LINK_LOCKED'));
set session_replication_role = replica;
update public.org_settings set mgr_link_locked = true where id = 'org';
set session_replication_role = origin;
select pg_temp.me(:MGR2);
update public.jobs set proposal_id = :PR where id = :J3;
select pg_temp.ok('админ разрешил — привязка проходит, документ остаётся запертым и ревизия не растёт',
  proposal_id = :PR::uuid and status = 'done' and rev = (select rev from public.jobs j2 where j2.id = :J3)) from public.jobs where id = :J3;

-- апрув собственного инвойса
set session_replication_role = replica;
update public.jobs set technician_id = :MGR, helper_ids = '[]' where id = :J3;
update public.org_settings set self_approve = false where id = 'org';
set session_replication_role = origin;
select pg_temp.me(:MGR);
select pg_temp.ok('менеджер свой инвойс не апрувит, пока админ не разрешил: SELF_APPROVE_OFF', pg_temp.throws($q$select public.approve_job('11111111-0000-0000-0000-0000000000d3', 60)$q$, 'SELF_APPROVE_OFF'));
set session_replication_role = replica;
update public.org_settings set self_approve = true where id = 'org';
set session_replication_role = origin;
select pg_temp.me(:MGR);
select public.approve_job(:J3, 60);
select pg_temp.ok('админ разрешил — апрувит', (select status from public.jobs where id = :J3) = 'approved');

-- запрос правки: кто подаёт и как закрывается сам
set session_replication_role = replica;
update public.jobs set technician_id = :MAIN, helper_ids = jsonb_build_array(:HELP), shared_with_helpers = false, acc_status = 'paid' where id = :J3;
set session_replication_role = origin;
select pg_temp.me(:HELP);
select pg_temp.ok('помощник без права правки запрос не подаёт: FORBIDDEN', pg_temp.throws($q$select public.doc_request_edit('11111111-0000-0000-0000-0000000000d3', 'поправьте')$q$, 'FORBIDDEN'));
select pg_temp.me(:MAIN);
select public.doc_request_edit(:J3, 'ошибка в технике');
select pg_temp.me(:MGR);
update public.jobs set status = 'draft', return_note = 'сам вернул' where id = :J3;
select pg_temp.ok('согласующий вернул документ сам — висящий запрос закрылся', (select status from public.doc_requests where doc_id = :J3::uuid order by created_at desc limit 1) = 'closed');
select pg_temp.me(:MAIN);
update public.jobs set status = 'done' where id = :J3;
select pg_temp.me(:ADM);
update public.jobs set status = 'approved', approved_total = 60 where id = :J3;
select pg_temp.me(:MAIN);
select public.doc_request_edit(:J3, 'ещё правка');
set session_replication_role = replica;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'df_acc@x') on conflict do nothing;
insert into public.profiles (id, login, display_name, role) values ('00000000-0000-0000-0000-0000000000a7', 'df_acc', 'Df Acc', 'accountant') on conflict (id) do update set role = 'accountant', blocked = false;
set session_replication_role = origin;
delete from public.notices;
select pg_temp.me(:MGR);
select public.doc_request_decide((select id from public.doc_requests where doc_id = :J3::uuid and status = 'pending'), true, '');
select pg_temp.ok('правка разрешена по документу с отметкой бухгалтерии — бухгалтер получила уведомление',
  exists(select 1 from public.notices where user_id = '00000000-0000-0000-0000-0000000000a7' and title = 'Инвойс с отметкой бухгалтерии возвращён на правку'));

-- пикап: своя заметка и архив вместо удаления
select pg_temp.ok('у пикапа своя заметка и поля архива', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'placements' and column_name in ('note','note_en','archived_at','archived_by','arch_note')) = 5);

-- ===== v1.09.28 · пробелы, найденные проверкой покрытия =====
\set J6 '''11111111-0000-0000-0000-0000000000d6'''
select pg_temp.me(:MGR2);
insert into public.jobs (id, date, unit_number, technician_id, status, form_data) values (:J6, current_date, '606', :MGR2, 'draft', '{"equipment":{"e1":{"qty":1,"days":2}}}');
update public.jobs set form_data = jsonb_set(form_data, '{equipment,e1,qty}', '4') where id = :J6;
select pg_temp.ok('менеджер правит технику в СВОЁМ документе', (select form_data->'equipment'->'e1'->>'qty' from public.jobs where id = :J6) = '4');
select pg_temp.me(:MAIN);
select pg_temp.ok('запрос правки по НЕ заапрувленному документу: BAD_STATUS', pg_temp.throws($q$select public.doc_request_edit('11111111-0000-0000-0000-0000000000d4', 'нельзя')$q$, 'BAD_STATUS'));
select pg_temp.me(:ADM);
select pg_temp.ok('апрув с отрицательной суммой: BAD_TOTAL', pg_temp.throws($q$select public.approve_job('11111111-0000-0000-0000-0000000000d6', -5)$q$, 'BAD_TOTAL'));
select pg_temp.me(:ADM);
select pg_temp.ok('апрув несуществующего документа: NOT_FOUND', pg_temp.throws($q$select public.approve_job('99999999-0000-0000-0000-000000000000', 5)$q$, 'NOT_FOUND'));
-- запрос правки закрывается и при УДАЛЕНИИ документа
select pg_temp.me(:MGR2);
update public.jobs set status = 'done' where id = :J6;
select pg_temp.me(:ADM);
update public.jobs set status = 'approved', approved_total = 9 where id = :J6;
select pg_temp.me(:MGR2);
select public.doc_request_edit(:J6, 'запрос перед удалением') is not null as rq6 \gset
select pg_temp.me(:ADM);
update public.jobs set archived_at = now() where id = :J6;
select pg_temp.ok('документ удалён — висящий запрос правки закрылся сам, с пояснением', (select status = 'closed' and answer = 'документ удалён' from public.doc_requests where doc_id = :J6::uuid order by created_at desc limit 1));
-- разовый перенос «менеджер может апрувить» → личное право
set session_replication_role = replica;
update public.org_settings set docflow_v = 0, manager_can_approve = true where id = 'org';
update public.profiles set can_approve = false where id in (:MGR::uuid, :MGR2::uuid);
set session_replication_role = origin;
do $mig$ begin
  if coalesce((select docflow_v from public.org_settings where id = 'org'), 0) < 1 then
    set local session_replication_role = replica;
    update public.profiles set can_approve = true where role = 'manager' and coalesce((select manager_can_approve from public.org_settings where id = 'org'), false);
    update public.org_settings set docflow_v = 1 where id = 'org';
    set local session_replication_role = origin;
  end if;
end $mig$;
select pg_temp.ok('перенос общей галочки апрува в личные права: оба менеджера получили право, работник — нет, повторно не выполняется',
  (select bool_and(can_approve) from public.profiles where id in (:MGR::uuid, :MGR2::uuid)) and not (select can_approve from public.profiles where id = :MAIN::uuid)
  and (select docflow_v from public.org_settings where id = 'org') = 1);

-- ===== v1.09.29 · ревизия на момент апрува =====
\set J7 '''11111111-0000-0000-0000-0000000000d7'''
select pg_temp.me(:MAIN);
insert into public.jobs (id, date, unit_number, technician_id, status, form_data, total) values (:J7, current_date, '707', :MAIN, 'done', '{"a":1}', 50);
select pg_temp.me(:ADM);
update public.jobs set status = 'approved', approved_total = 55 where id = :J7;
select pg_temp.ok('апрув: сервер запомнил ревизию (approved_rev = rev), хотя сумма апрува отличается от расчёта', approved_rev = rev and approved_total = 55 and total = 50) from public.jobs where id = :J7;
update public.jobs set form_data = '{"a":2}', total = 70 where id = :J7;
select pg_temp.ok('согласующий поправил документ после апрува: rev > approved_rev — раздел «Апрув не совпадает с расчётом» это увидит', rev > approved_rev and status = 'approved') from public.jobs where id = :J7;
update public.jobs set approved_total = 70 where id = :J7;
select pg_temp.ok('обновил апрувленную сумму — апрув переставлен на текущую ревизию', approved_rev = rev and approved_total = 70) from public.jobs where id = :J7;
select pg_temp.me(:MAIN);
update public.jobs set approved_rev = 0, priority = true where id = :J7;
select pg_temp.ok('клиент approved_rev не меняет', (select approved_rev = rev from public.jobs where id = :J7));
select pg_temp.me(:ADM);
update public.jobs set status = 'draft', return_note = 'x' where id = :J7;
select pg_temp.ok('апрув снят — approved_rev очищен', (select approved_rev is null from public.jobs where id = :J7));

select n, case when ok then '✓' else '✗' end || ' ' || name || case when note <> '' then '  [' || note || ']' else '' end from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
