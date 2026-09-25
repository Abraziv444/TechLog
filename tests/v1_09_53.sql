-- v1.09.53 · документ ремонта: правила сервера под тест «Документооборот + ремонт».
--   1) бригада ремонта видит документ (rep_sel + helper_ids), посторонний — нет;
--   2) сторож апрува: upsert существующего ремонта не снимает апрув молча; правка сметы / шапки / бригады одобренного
--      или отправленного — снимает (запись в истории «reset», srv); переводы, пометки фото, связи — не снимают;
--      decided_by — по входу, а не по присланному полю;
--   3) события: «Ремонт отклонён» (автору и бригаде, с причиной), «Ремонт ждёт апрува» (согласующим, не менеджеру без права);
--   4) dft_exec: у ремонта — пропозал / PO / налог / доставка / пометки фото; связь только с тестовыми документами; строгий rep_get;
--   5) сохранение приложением (upsert) под политиками доступа: автор без правок — апрув цел, менеджер с правкой — проходит и снимает апрув, помощник — отказ.
-- Запуск: psql -tA -d <база> -f tests/v1_09_53.sql → «ИТОГ: N ✓ / 0 ✗». База после full-install-1_09_53.sql (или update-to-1_09_53.sql).
-- Всё в BEGIN…ROLLBACK.
\set ON_ERROR_STOP 1
begin;
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'r53_adm@x'), ('00000000-0000-0000-0000-0000000000c2', 'r53_mgr@x'),
  ('00000000-0000-0000-0000-0000000000c3', 'r53_appr@x'), ('00000000-0000-0000-0000-0000000000c4', 'r53_tech@x'),
  ('00000000-0000-0000-0000-0000000000c5', 'r53_tech2@x'), ('00000000-0000-0000-0000-0000000000c6', 'r53_tech3@x')
  on conflict do nothing;
insert into public.profiles (id, login, display_name, role, can_approve, can_edit_docs, blocked) values
  ('00000000-0000-0000-0000-0000000000c1', 'r53_adm',   'R53 Admin',     'admin',   false, true, false),
  ('00000000-0000-0000-0000-0000000000c2', 'r53_mgr',   'R53 Manager',   'manager', false, true, false),
  ('00000000-0000-0000-0000-0000000000c3', 'r53_appr',  'R53 Approver',  'manager', true,  true, false),
  ('00000000-0000-0000-0000-0000000000c4', 'r53_tech',  'R53 Tech',      'tech',    false, true, false),
  ('00000000-0000-0000-0000-0000000000c5', 'r53_tech2', 'R53 Helper',    'tech',    false, true, false),
  ('00000000-0000-0000-0000-0000000000c6', 'r53_tech3', 'R53 Outsider',  'tech',    false, true, false)
  on conflict (id) do update set role = excluded.role, can_approve = excluded.can_approve, blocked = excluded.blocked;
-- в этой транзакции согласующие — только наши (чтобы проверить адресатов «Ремонт ждёт апрува»)
update public.profiles set blocked = true where role in ('admin','manager') and id::text not like '00000000-0000-0000-0000-0000000000c%';
insert into public.org_settings (id) values ('org') on conflict do nothing;
update public.org_settings set dft_on = false, dft_until = null where id = 'org';
insert into public.jobs (id, date, unit_number, technician_id, helper_ids, status, form_data, total)
  values ('44444444-0000-0000-0000-0000000000d1', current_date, 'REAL-R53', '00000000-0000-0000-0000-0000000000c4', '["00000000-0000-0000-0000-0000000000c5"]', 'draft', '{}', 100);
insert into public.proposals (id, date, status, unit_number) values ('55555555-0000-0000-0000-0000000000d1', current_date, 'approved', 'REAL-P53') on conflict do nothing;
set session_replication_role = origin;

create temp table r (n int, name text, ok boolean, note text);
grant all on r to authenticated, service_role;
create temp sequence rn; grant usage, select, update on sequence rn to authenticated, service_role;
create function pg_temp.throws(p_sql text, p_msg text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return position(p_msg in sqlerrm) > 0; end $$;
create function pg_temp.ok(p_name text, p_ok boolean, p_note text default '') returns void language sql as
  $$ insert into r values (nextval('rn'), p_name, coalesce(p_ok, false), p_note) $$;
create function pg_temp.me(p text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p, true) $$;
\set ADM   '''00000000-0000-0000-0000-0000000000c1'''
\set MGR   '''00000000-0000-0000-0000-0000000000c2'''
\set APPR  '''00000000-0000-0000-0000-0000000000c3'''
\set TECH  '''00000000-0000-0000-0000-0000000000c4'''
\set TECH2 '''00000000-0000-0000-0000-0000000000c5'''
\set TECH3 '''00000000-0000-0000-0000-0000000000c6'''
\set R1    '''88888888-0000-0000-0000-0000000000d1'''
\set R2    '''88888888-0000-0000-0000-0000000000d2'''
\set R3    '''88888888-0000-0000-0000-0000000000d3'''

-- ===== 1. Сторож апрува: upsert существующего ремонта =====
select pg_temp.me(:TECH);
insert into public.repairs (id, date, unit_number, created_by, helper_ids, items, total, status)
  values (:R1, current_date, 'U-53', :TECH, jsonb_build_array(:TECH, :TECH2), '[{"q":1,"code":"","d":"Заделка стены","d_en":"","a":40}]', 40, 'draft');
insert into public.repairs (id, date, created_by, status) values ('88888888-0000-0000-0000-0000000000d9', current_date, :TECH, 'approved');
select pg_temp.ok('новый ремонт работника со статусом «Одобрен» при вставке становится черновиком (как раньше)',
  (select status = 'draft' from public.repairs where id = '88888888-0000-0000-0000-0000000000d9'));
update public.repairs set status = 'sent' where id = :R1;
select pg_temp.me(:APPR);
update public.repairs set status = 'approved', decided_by = :TECH where id = :R1;
select pg_temp.ok('согласующий апрувит: decided_by — тот, кто вошёл, а не присланное поле', (select status = 'approved' and decided_by = :APPR::uuid and decided_at is not null from public.repairs where id = :R1));
select pg_temp.me(:TECH);
insert into public.repairs as x (id, date, unit_number, created_by, helper_ids, items, total, status, decided_by, decided_at)
  select id, date, unit_number, created_by, helper_ids, items, total, status, decided_by, decided_at from public.repairs where id = :R1
  on conflict (id) do update set date = excluded.date, unit_number = excluded.unit_number, created_by = excluded.created_by, helper_ids = excluded.helper_ids,
    items = excluded.items, total = excluded.total, status = excluded.status, decided_by = excluded.decided_by, decided_at = excluded.decided_at;
select pg_temp.ok('upsert одобренного ремонта автором БЕЗ правок апрув не снимает (раньше становился черновиком)', (select status = 'approved' and decided_by = :APPR::uuid from public.repairs where id = :R1));
insert into public.repairs as x (id, date, created_by, status, photos) select id, date, created_by, status, '{"before":["m1"],"after":["m2"]}'::jsonb from public.repairs where id = :R1
  on conflict (id) do update set status = excluded.status, photos = excluded.photos;
select pg_temp.ok('upsert с пометками «до/после» апрув не снимает', (select status = 'approved' and photos->'before' ? 'm1' from public.repairs where id = :R1));
update public.repairs set note_en = 'wall patch', items = '[{"q":1,"code":"","d":"Заделка стены","d_en":"Wall patch","a":40}]' where id = :R1;
select pg_temp.ok('переводы (note_en, d_en) апрув не снимают', (select status = 'approved' from public.repairs where id = :R1));
update public.repairs set items = '[{"q":1.0,"code":"","d":"Заделка стены","d_en":"Wall patch","a":40.00}]', total = 40.0 where id = :R1;
select pg_temp.ok('те же числа в другой записи (1.0 / 40.00) — не правка', (select status = 'approved' from public.repairs where id = :R1));
update public.repairs set proposal_id = '55555555-0000-0000-0000-0000000000d1', job_id = '44444444-0000-0000-0000-0000000000d1' where id = :R1;
select pg_temp.ok('связь с инвойсом и пропозалом апрув не снимает', (select status = 'approved' and job_id is not null from public.repairs where id = :R1));

-- ===== 2. Правка сметы / шапки / бригады одобренного — апрув снимает сервер =====
update public.repairs set items = '[{"q":1,"code":"","d":"Заделка стены","d_en":"Wall patch","a":55}]', total = 55 where id = :R1;
select pg_temp.ok('работник правит смету одобренного «в обход интерфейса» — сервер снимает апрув: черновик, решение снято, в истории reset от сервера',
  (select status = 'draft' and decided_by is null and decided_at is null and hist->0->>'act' = 'reset' and (hist->0->>'srv')::boolean and hist->0->>'from' = 'approved'
     and hist->0->>'by' = :TECH and hist->0->>'to' = :APPR from public.repairs where id = :R1));
select pg_temp.ok('…и в ленту автору/бригаде ушло «Апрув снят с ремонта» (помощнику; автору — нет, это он правил)',
  exists(select 1 from public.notices where user_id = :TECH2::uuid and title = 'Апрув снят с ремонта' and url like '%' || :R1 || '%')
  and not exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Апрув снят с ремонта' and url like '%' || :R1 || '%'));
update public.repairs set status = 'sent' where id = :R1;
select pg_temp.ok('«Ремонт ждёт апрува» — согласующим (админ, менеджер с правом), не менеджеру без права и не автору',
  exists(select 1 from public.notices where user_id = :ADM::uuid and title = 'Ремонт ждёт апрува' and url like '%' || :R1 || '%')
  and exists(select 1 from public.notices where user_id = :APPR::uuid and title = 'Ремонт ждёт апрува' and url like '%' || :R1 || '%')
  and not exists(select 1 from public.notices where user_id = :MGR::uuid and title = 'Ремонт ждёт апрува')
  and not exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Ремонт ждёт апрува'));
update public.repairs set unit_number = 'U-53B' where id = :R1;
select pg_temp.ok('правка шапки отправленного на апрув — назад в черновик (как «rep_unsent» в приложении)', (select status = 'draft' and hist->0->>'from' = 'sent' from public.repairs where id = :R1));
update public.repairs set status = 'sent' where id = :R1;
select pg_temp.me(:APPR);
update public.repairs set status = 'approved' where id = :R1;
select pg_temp.ok('«Ремонт апрувлен» — автору и бригаде', exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Ремонт апрувлен')
  and exists(select 1 from public.notices where user_id = :TECH2::uuid and title = 'Ремонт апрувлен'));
select pg_temp.me(:MGR);
update public.repairs set helper_ids = jsonb_build_array(:TECH) where id = :R1;
select pg_temp.ok('менеджер меняет бригаду одобренного — апрув снят', (select status = 'draft' and hist->0->>'by' = :MGR from public.repairs where id = :R1));
update public.repairs set helper_ids = jsonb_build_array(:TECH, :TECH2), status = 'sent' where id = :R1;
select pg_temp.me(:APPR);
update public.repairs set status = 'approved' where id = :R1;
update public.repairs set sales_tax = 3.5 where id = :R1;
select pg_temp.ok('и у согласующего правка одобренного снимает апрув (как кнопки приложения — у всех)', (select status = 'draft' from public.repairs where id = :R1));
select pg_temp.me(:TECH);
select pg_temp.ok('работник апрувит сам — FORBIDDEN_APPROVE, отклоняет — тоже',
  pg_temp.throws($q$update public.repairs set status = 'approved' where id = '88888888-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_APPROVE')
  and pg_temp.throws($q$update public.repairs set status = 'declined' where id = '88888888-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_APPROVE'));
select pg_temp.me(:MGR);
select pg_temp.ok('менеджер без права — тоже FORBIDDEN_APPROVE', pg_temp.throws($q$update public.repairs set status = 'approved' where id = '88888888-0000-0000-0000-0000000000d1'$q$, 'FORBIDDEN_APPROVE'));
select pg_temp.me(:ADM);
update public.repairs set status = 'declined', decline_reason = 'нет фото «до»' where id = :R1;
select pg_temp.ok('«Ремонт отклонён» — автору и бригаде, с причиной в тексте',
  exists(select 1 from public.notices where user_id = :TECH::uuid and title = 'Ремонт отклонён' and body like '%нет фото «до»%')
  and exists(select 1 from public.notices where user_id = :TECH2::uuid and title = 'Ремонт отклонён'));
select pg_temp.ok('отклонён: решение записано (админ)', (select decided_by = :ADM::uuid from public.repairs where id = :R1));

-- ===== 3. dft_exec: ремонт целиком =====
select pg_temp.me(:ADM);
select public.admin_set_dft(true, 4) is not null as on_ok \gset
select set_config('request.jwt.claim.sub', '', true);
select (public.dft_exec(:TECH, :MGR, 'job_create', jsonb_build_object('run', 'r53', 'row', jsonb_build_object('id', '44444444-0000-0000-0000-0000000000d2', 'technician_id', :TECH, 'unit_number', 'DFTEST-R53')))->>'ok')::boolean as j1 \gset
select (public.dft_exec(:TECH, :MGR, 'prop_create', jsonb_build_object('run', 'r53', 'row', jsonb_build_object('id', '55555555-0000-0000-0000-0000000000d2', 'unit_number', 'DFTEST-P53', 'status', 'approved')))->>'ok')::boolean as p1 \gset
select (public.dft_exec(:TECH, :TECH, 'rep_create', jsonb_build_object('run', 'r53', 'row', jsonb_build_object('id', :R2, 'job_id', '44444444-0000-0000-0000-0000000000d2',
  'proposal_id', '55555555-0000-0000-0000-0000000000d2', 'po_number', 'PO-53', 'complete_by', (current_date + 3)::text, 'sales_tax', 2.5, 'freight', 5,
  'photos', '{"before":["a"],"after":[]}'::jsonb, 'helper_ids', jsonb_build_array(:TECH), 'hist', '[{"act":"created"}]'::jsonb, 'items', '[{"q":1,"d":"Patch","a":40}]'::jsonb, 'total', 40)))->>'ok')::boolean as r2 \gset
select pg_temp.ok('rep_create: пропозал (тестовый), PO, срок, налог, доставка, пометки фото, история — записаны; номер из тестового диапазона',
  :'r2'::boolean and (select proposal_id = '55555555-0000-0000-0000-0000000000d2' and po_number = 'PO-53' and complete_by = current_date + 3 and sales_tax = 2.5 and freight = 5
     and photos->'before' ? 'a' and hist->0->>'act' = 'created' and no > 90000000 and is_test from public.repairs where id = :R2));
select pg_temp.ok('rep_create с НАСТОЯЩИМ пропозалом — DFT_NOT_TEST_DOC',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c4', 'rep_create', '{"run":"r53","row":{"proposal_id":"55555555-0000-0000-0000-0000000000d1"}}')$q$, 'DFT_NOT_TEST_DOC'));
select pg_temp.ok('rep_update: привязать тестовый ремонт к НАСТОЯЩЕМУ инвойсу или пропозалу — DFT_NOT_TEST_DOC',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c4', 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000d2","patch":{"job_id":"44444444-0000-0000-0000-0000000000d1"}}')$q$, 'DFT_NOT_TEST_DOC')
  and pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c4', 'rep_update', '{"id":"88888888-0000-0000-0000-0000000000d2","patch":{"proposal_id":"55555555-0000-0000-0000-0000000000d1"}}')$q$, 'DFT_NOT_TEST_DOC'));
select (public.dft_exec(:TECH, :TECH, 'rep_update', jsonb_build_object('id', :R2, 'patch', jsonb_build_object('proposal_id', null, 'po_number', 'PO-53B', 'sales_tax', 1, 'freight', 2, 'photos', '{"before":[],"after":["b"]}'::jsonb)))->>'ok')::boolean as u2 \gset
select pg_temp.ok('rep_update: отвязка пропозала, PO, налог, доставка, пометки фото', (select proposal_id is null and po_number = 'PO-53B' and sales_tax = 1 and freight = 2 and photos->'after' ? 'b' from public.repairs where id = :R2));
select (public.dft_exec(:TECH, :TECH3, 'rep_create', jsonb_build_object('run', 'r53', 'row', jsonb_build_object('id', :R3, 'unit_number', 'DFTEST-R53O', 'helper_ids', jsonb_build_array(:TECH3, :TECH2))))->>'ok')::boolean as r3 \gset
select pg_temp.ok('строгий rep_get: посторонний работник — RLS_DENIED; помощник по ремонту и менеджер — видят; нестрогий — как раньше',
  pg_temp.throws($q$select public.dft_exec('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c4', 'rep_get', '{"id":"88888888-0000-0000-0000-0000000000d3","strict":true}')$q$, 'RLS_DENIED')
  and (public.dft_exec(:TECH, :TECH2, 'rep_get', jsonb_build_object('id', :R3, 'strict', true))->>'ok')::boolean
  and (public.dft_exec(:TECH, :MGR, 'rep_get', jsonb_build_object('id', :R3, 'strict', true))->>'ok')::boolean
  and (public.dft_exec(:TECH, :TECH, 'rep_get', jsonb_build_object('id', :R3))->>'ok')::boolean);
select (public.dft_exec(:TECH, :APPR, 'rep_update', jsonb_build_object('id', :R2, 'patch', '{"status":"approved"}'::jsonb))->'data'->>'status') as st2 \gset
select (public.dft_exec(:TECH, :TECH, 'rep_update', jsonb_build_object('id', :R2, 'patch', '{"items":[{"q":1,"d":"Patch","a":41}],"total":41}'::jsonb))->'data'->>'status') as st3 \gset
select pg_temp.ok('через функцию теста — то же правило: правка сметы одобренного снимает апрув', :'st2' = 'approved' and :'st3' = 'draft');
select public.dft_exec(:TECH, :TECH, 'cleanup', '{"run":"r53"}')->>'deleted' as c1 \gset
select pg_temp.ok('уборка удалила тестовые ремонты (и того, где работник посторонний)', not exists(select 1 from public.repairs where id in (:R2, :R3)));

-- ===== 4. Видимость: бригада ремонта (под ролью authenticated — в конце) =====
select set_config('request.jwt.claim.sub', '', true);
insert into public.repairs (id, date, unit_number, created_by, helper_ids, status)
  values ('88888888-0000-0000-0000-0000000000d4', current_date, 'U-SOLO', :TECH3, jsonb_build_array(:TECH3, :TECH2), 'draft');
set local role authenticated;
select pg_temp.me(:TECH2);
select pg_temp.ok('помощник по ремонту БЕЗ инвойса видит документ (раньше — нет)', exists(select 1 from public.repairs where id = '88888888-0000-0000-0000-0000000000d4'));
select pg_temp.ok('…и ремонт с инвойсом, где он в бригаде', exists(select 1 from public.repairs where id = :R1));
select pg_temp.me(:TECH);
select pg_temp.ok('посторонний работник чужой ремонт без своего инвойса не видит', not exists(select 1 from public.repairs where id = '88888888-0000-0000-0000-0000000000d4'));
with u as (update public.repairs set note = 'x' where id = '88888888-0000-0000-0000-0000000000d4' returning 1) select pg_temp.ok('посторонний не правит (0 строк)', (select count(*) = 0 from u));
select pg_temp.me(:TECH2);
with u as (update public.repairs set note = 'x' where id = '88888888-0000-0000-0000-0000000000d4' returning 1) select pg_temp.ok('помощник видит, но не правит (0 строк)', (select count(*) = 0 from u));
select pg_temp.me(:MGR);
select pg_temp.ok('менеджер видит все ремонты', exists(select 1 from public.repairs where id = '88888888-0000-0000-0000-0000000000d4'));

-- ===== 5. Сохранение приложением (upsert) — под политиками доступа, как шлёт клиент =====
select pg_temp.me(:APPR);
update public.repairs set status = 'approved' where id = '88888888-0000-0000-0000-0000000000d4';
select pg_temp.me(:TECH3);
insert into public.repairs as x (id, date, unit_number, created_by, helper_ids, status, decided_by, decided_at)
  select id, date, unit_number, created_by, helper_ids, status, decided_by, decided_at from public.repairs where id = '88888888-0000-0000-0000-0000000000d4'
  on conflict (id) do update set unit_number = excluded.unit_number, helper_ids = excluded.helper_ids, status = excluded.status, decided_by = excluded.decided_by, decided_at = excluded.decided_at;
select pg_temp.ok('под политиками: автор сохраняет (upsert) одобренный ремонт без правок — апрув на месте', (select status = 'approved' and decided_by = :APPR::uuid from public.repairs where id = '88888888-0000-0000-0000-0000000000d4'));
select pg_temp.me(:MGR);
insert into public.repairs as x (id, date, unit_number, created_by, helper_ids, status) values ('88888888-0000-0000-0000-0000000000d4', current_date, 'U-SOLO-M', :TECH3, jsonb_build_array(:TECH3, :TECH2), 'approved')
  on conflict (id) do update set unit_number = excluded.unit_number, status = excluded.status;
select pg_temp.ok('под политиками: менеджер сохраняет чужой одобренный ремонт с правкой шапки — запись проходит, апрув снимает сервер',
  (select unit_number = 'U-SOLO-M' and status = 'draft' and (hist->0->>'srv')::boolean and hist->0->>'by' = :MGR from public.repairs where id = '88888888-0000-0000-0000-0000000000d4'));
select pg_temp.me(:TECH2);
select pg_temp.ok('под политиками: помощник сохранить (upsert) чужой ремонт не может; работник не создаёт ремонт «от имени» другого',
  pg_temp.throws($q$insert into public.repairs as x (id, date, created_by, status, note) values ('88888888-0000-0000-0000-0000000000d4', current_date, '00000000-0000-0000-0000-0000000000c6', 'draft', 'helper') on conflict (id) do update set note = excluded.note$q$, 'row-level security')
  and pg_temp.throws($q$insert into public.repairs (id, date, created_by, status) values ('88888888-0000-0000-0000-0000000000d5', current_date, '00000000-0000-0000-0000-0000000000c6', 'draft')$q$, 'row-level security'));

select n, case when ok then '✓' else '✗' end || ' ' || name || case when note <> '' then '  [' || note || ']' else '' end from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
