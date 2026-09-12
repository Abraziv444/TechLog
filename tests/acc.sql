-- =====================================================================
-- TechLog · tests/acc.sql — сквозной автотест бухгалтерии (v1.08.39)
-- ---------------------------------------------------------------------
-- Проверяет:
--   · роль accountant принимается constraint'ом, admin_set_role и
--     admin_create_user (техник и бухгалтер получают BAD_ROLE/FORBIDDEN);
--   · acc_doc_mark: бухгалтер и админ ставят отметку и заметку на инвойс
--     и REP (acc_at/acc_by заполняются), техник/менеджер — FORBIDDEN,
--     BAD_STATUS / BAD_KIND / NOT_FOUND / NOTE_TOO_LONG;
--   · триггер acc_guard: полная строка из приложения (upsert техника с
--     устаревшим снимком) учётные поля НЕ затирает, а сам документ
--     меняется; апрув при отметке не сбрасывается, пуши не уходят;
--   · acc_settings: штамп updated_at/updated_by триггером, ограничение
--     0…100, восстановление через admin_restore_rows (acc_settings в
--     списке разрешённых), штамп при восстановлении не перебивается;
--   · RLS под ролью authenticated: бухгалтер читает чужие инвойсы,
--     пикапы, пропозалы, ремонты и acc_settings, пишет acc_settings;
--     техник acc_settings не видит и не пишет, чужой инвойс не видит;
--     can_view_job(...) для бухгалтера — true.
--
-- БЕЗОПАСЕН ДЛЯ ЛЮБОЙ БАЗЫ: одна транзакция, в конце ROLLBACK.
-- Требует схему v1.08.39 (update-to-1_08_39.sql или full-install-1_08_39.sql).
-- Запуск: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/acc.sql
-- Успех: NOTICE «БУХГАЛТЕРИЯ: все N проверок пройдены» и Rollback ниже.
-- =====================================================================

begin;

create temporary sequence if not exists tac_cnt;
grant usage, select, update on sequence tac_cnt to authenticated;

create or replace function pg_temp.ok(l text, c boolean) returns void language plpgsql as $$
begin
  if c is distinct from true then raise exception 'ТЕСТ [%]: условие ложно', l; end if;
  perform nextval('tac_cnt');
  raise notice '  ok %', l;
end $$;

do $$
declare
  A  uuid := 'ad000000-0000-4000-8000-00000000ac01';  -- админ
  M  uuid := 'ad000000-0000-4000-8000-00000000ac02';  -- менеджер
  B  uuid := 'ad000000-0000-4000-8000-00000000ac03';  -- техник
  K  uuid := 'ad000000-0000-4000-8000-00000000ac04';  -- бухгалтер
  CP uuid := 'c1000000-0000-4000-8000-00000000ac05';
  CX uuid := 'c0000000-0000-4000-8000-00000000ac06';
  E1 uuid := 'e1000000-0000-4000-8000-00000000ac07';
  J  uuid := 'aa000000-0000-4000-8000-00000000ac08';  -- инвойс техника B
  RP uuid := 'dd000000-0000-4000-8000-00000000ac09';  -- REP техника B
  PP uuid := 'ee000000-0000-4000-8000-00000000ac0a';  -- пропозал
  NN uuid; r jsonb; msg text; n int; ts timestamptz;
begin
  -- ---------- сид (триггеры молчат) ----------
  perform set_config('session_replication_role', 'replica', true);
  insert into auth.users (id) values (A), (M), (B), (K);
  insert into public.profiles (id, login, display_name, role) values
    (A, 'tac_admin', 'ТестАдмин', 'admin'),
    (M, 'tac_mgr',   'ТестМенеджер', 'manager'),
    (B, 'tac_tech',  'ТестТехник', 'tech'),
    (K, 'tac_acc',   'ТестБухгалтер', 'accountant');
  insert into public.counterparties (id, name, abbr) values (CP, 'ТестКонтрагент', 'TAC');
  insert into public.complexes (id, name, abbr, counterparty_id) values (CX, 'ТестКомплекс', 'TCX', CP);
  insert into public.equipment_types (id, name, abbr, color, price_key, sort) values
    (E1, 'Тест-блоуэр', 'TBL', '#58cc02', 'tac_bl', 903);
  insert into public.proposals (id, date, counterparty_id, complex_id, unit_number, items, total, status, created_by)
    values (PP, current_date, CP, CX, '7', '[]'::jsonb, 100, 'approved', A);
  insert into public.jobs (id, date, counterparty_id, complex_id, technician_id, unit_number, status, note, form_data, total)
    values (J, current_date, CP, CX, B, '7', 'done', 'ключ в офисе',
            jsonb_build_object('equipment', jsonb_build_object(E1::text, jsonb_build_object('qty', 2, 'days', 3))), 180);
  insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number)
    values (gen_random_uuid(), J, E1, 2, 3, current_date, current_date + 3, B, CX, CP, '7');
  insert into public.repairs (id, date, counterparty_id, complex_id, unit_number, job_id, items, materials, total, status, created_by)
    values (RP, current_date, CP, CX, '7', J, '[{"q":1,"d":"Drywall","a":300}]'::jsonb, '[{"q":1,"d":"Sheets","a":50}]'::jsonb, 350, 'sent', B);
  perform set_config('session_replication_role', 'origin', true);
  perform pg_temp.ok('сид: роль accountant принята constraint''ом', (select role from public.profiles where id = K) = 'accountant');

  -- ---------- роли ----------
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform public.admin_set_role(B, 'accountant');
  perform pg_temp.ok('admin_set_role → accountant', (select role from public.profiles where id = B) = 'accountant');
  perform public.admin_set_role(B, 'tech');
  perform pg_temp.ok('admin_set_role → обратно tech', (select role from public.profiles where id = B) = 'tech');
  begin
    perform public.admin_set_role(B, 'director');
    raise exception 'ТЕСТ [BAD_ROLE не сработал]';
  exception when others then
    if SQLERRM <> 'BAD_ROLE' then raise; end if;
    perform pg_temp.ok('admin_set_role: неизвестная роль — BAD_ROLE', true);
  end;
  perform set_config('request.jwt.claim.sub', A::text, true);
  NN := public.admin_create_user('tac_acc2', 'tac_acc2@techlog.example.com', 'secret123', 'Бухгалтер Два', 'accountant');
  perform pg_temp.ok('admin_create_user с ролью accountant', (select role from public.profiles where id = NN) = 'accountant');
  begin
    perform set_config('request.jwt.claim.sub', K::text, true);
    perform public.admin_set_role(B, 'manager');
    raise exception 'ТЕСТ [бухгалтер сменил роль]';
  exception when others then
    if SQLERRM <> 'FORBIDDEN' then raise; end if;
    perform pg_temp.ok('бухгалтер роли не меняет — FORBIDDEN', true);
  end;

  -- ---------- acc_doc_mark ----------
  perform set_config('request.jwt.claim.sub', K::text, true);
  r := public.acc_doc_mark('job', J, 'checked', 'оплачено чеком 12.09');
  perform pg_temp.ok('бухгалтер: отметка «проверен» на инвойс', r->>'acc_status' = 'checked' and (r->>'acc_by')::uuid = K);
  perform pg_temp.ok('поля acc_* записаны в jobs', (select acc_status = 'checked' and acc_note = 'оплачено чеком 12.09' and acc_by = K and acc_at is not null from public.jobs where id = J));
  perform pg_temp.ok('статус документа не тронут', (select status = 'done' from public.jobs where id = J));
  r := public.acc_doc_mark('rep', RP, 'paid', '');
  perform pg_temp.ok('бухгалтер: отметка «оплачен» на REP', (select acc_status = 'paid' and acc_by = K from public.repairs where id = RP));
  perform set_config('request.jwt.claim.sub', A::text, true);
  r := public.acc_doc_mark('job', J, 'issue', 'уточнить аренду');
  perform pg_temp.ok('админ тоже ставит отметку («вопрос»)', (select acc_status = 'issue' and acc_by = A from public.jobs where id = J));
  begin
    perform set_config('request.jwt.claim.sub', B::text, true);
    perform public.acc_doc_mark('job', J, 'paid', '');
    raise exception 'ТЕСТ [техник поставил отметку]';
  exception when others then
    if SQLERRM <> 'FORBIDDEN' then raise; end if;
    perform pg_temp.ok('техник — FORBIDDEN', true);
  end;
  begin
    perform set_config('request.jwt.claim.sub', M::text, true);
    perform public.acc_doc_mark('job', J, 'paid', '');
    raise exception 'ТЕСТ [менеджер поставил отметку]';
  exception when others then
    if SQLERRM <> 'FORBIDDEN' then raise; end if;
    perform pg_temp.ok('менеджер — FORBIDDEN', true);
  end;
  perform set_config('request.jwt.claim.sub', K::text, true);
  begin
    perform public.acc_doc_mark('job', J, 'done', '');
    raise exception 'ТЕСТ [BAD_STATUS не сработал]';
  exception when others then
    if SQLERRM <> 'BAD_STATUS' then raise; end if;
    perform pg_temp.ok('чужой статус — BAD_STATUS', true);
  end;
  perform set_config('request.jwt.claim.sub', K::text, true);
  begin
    perform public.acc_doc_mark('prop', PP, 'paid', '');
    raise exception 'ТЕСТ [BAD_KIND не сработал]';
  exception when others then
    if SQLERRM <> 'BAD_KIND' then raise; end if;
    perform pg_temp.ok('пропозал — BAD_KIND', true);
  end;
  perform set_config('request.jwt.claim.sub', K::text, true);
  begin
    perform public.acc_doc_mark('job', gen_random_uuid(), 'paid', '');
    raise exception 'ТЕСТ [NOT_FOUND не сработал]';
  exception when others then
    if SQLERRM <> 'NOT_FOUND' then raise; end if;
    perform pg_temp.ok('нет документа — NOT_FOUND', true);
  end;
  perform set_config('request.jwt.claim.sub', K::text, true);
  begin
    perform public.acc_doc_mark('job', J, 'paid', repeat('x', 2001));
    raise exception 'ТЕСТ [NOTE_TOO_LONG не сработал]';
  exception when others then
    if SQLERRM <> 'NOTE_TOO_LONG' then raise; end if;
    perform pg_temp.ok('заметка длиннее 2000 — NOTE_TOO_LONG', true);
  end;

  -- ---------- триггер acc_guard: чужой upsert не затирает отметку ----------
  perform set_config('request.jwt.claim.sub', B::text, true);
  update public.jobs set note = 'ключ у консьержа', acc_status = '', acc_note = '', acc_at = null, acc_by = null where id = J;
  perform pg_temp.ok('техник правит инвойс — note изменён', (select note = 'ключ у консьержа' from public.jobs where id = J));
  perform pg_temp.ok('…а отметка бухгалтера уцелела (acc_guard)', (select acc_status = 'issue' and acc_note = 'уточнить аренду' and acc_by = A from public.jobs where id = J));
  perform set_config('request.jwt.claim.sub', A::text, true);
  update public.jobs set acc_status = 'paid' where id = J;
  perform pg_temp.ok('даже админ прямым UPDATE отметку не меняет — только RPC', (select acc_status = 'issue' from public.jobs where id = J));
  update public.repairs set note = 'быстро', acc_status = '' where id = RP;
  perform pg_temp.ok('REP: note изменён, acc_status уцелел', (select note = 'быстро' and acc_status = 'paid' from public.repairs where id = RP));
  -- апрув + отметка: апрув не сбрасывается, пуш-очередь молчит
  perform set_config('request.jwt.claim.sub', A::text, true);
  update public.jobs set status = 'approved', approved_total = 180, approved_by = A, approved_at = now() where id = J;
  select count(*) into n from public.push_queue where user_id = B;
  perform set_config('request.jwt.claim.sub', K::text, true);
  r := public.acc_doc_mark('job', J, 'paid', 'оплачено');
  perform pg_temp.ok('отметка на апрувленном: апрув на месте', (select status = 'approved' and approved_total = 180 from public.jobs where id = J));
  perform pg_temp.ok('отметка не породила пуш', (select count(*) from public.push_queue where user_id = B) = n);

  -- ---------- acc_settings ----------
  perform set_config('request.jwt.claim.sub', K::text, true);
  insert into public.acc_settings (id, pct) values ('rate:clean', 40), ('rate:rent', 10), ('rate:rent:' || E1::text, 20);
  insert into public.acc_settings (id, val) values ('map:others', 'mat'), ('opt:label', 'Зарплата');
  perform pg_temp.ok('acc_settings: штамп updated_by = бухгалтер', (select bool_and(updated_by = K and updated_at is not null) from public.acc_settings where id like 'rate:%'));
  select updated_at into ts from public.acc_settings where id = 'rate:clean';
  perform set_config('request.jwt.claim.sub', A::text, true);
  update public.acc_settings set pct = 45 where id = 'rate:clean';
  perform pg_temp.ok('правка админом: pct 45, updated_by = админ', (select pct = 45 and updated_by = A and updated_at >= ts from public.acc_settings where id = 'rate:clean'));
  begin
    insert into public.acc_settings (id, pct) values ('rate:mat', 140);
    raise exception 'ТЕСТ [pct 140 принят]';
  exception when check_violation then
    perform pg_temp.ok('pct вне 0…100 — check_violation', true);
  end;
  perform set_config('request.jwt.claim.sub', A::text, true);
  r := public.admin_restore_rows('acc_settings', jsonb_build_array(
         jsonb_build_object('id', 'rate:mat', 'pct', 5, 'updated_at', '2026-01-01T00:00:00Z', 'updated_by', K),
         jsonb_build_object('id', 'rate:clean', 'pct', 99, 'updated_at', '2026-01-01T00:00:00Z', 'updated_by', K)));
  perform pg_temp.ok('admin_restore_rows(acc_settings): 1 вставлена, 1 дубль пропущен', (r->>'inserted')::int = 1 and (r->>'skipped')::int = 1);
  perform pg_temp.ok('восстановленная строка сохранила штамп из бэкапа', (select updated_by = K and updated_at = '2026-01-01T00:00:00Z' from public.acc_settings where id = 'rate:mat'));
  perform pg_temp.ok('дубль не перезаписал pct 45', (select pct = 45 from public.acc_settings where id = 'rate:clean'));
  perform pg_temp.ok('can_view_job для бухгалтера — true', (select public.can_view_job(J)) and (select public.my_role()) = 'admin');

  -- ---------- RLS под ролью authenticated (хвост: SET ROLE не отматывается) ----------
  perform set_config('request.jwt.claim.sub', K::text, true);
  set local role authenticated;
  perform pg_temp.ok('RLS: бухгалтер читает чужой инвойс', (select count(*) from public.jobs where id = J) = 1);
  perform pg_temp.ok('RLS: бухгалтер читает пикап', (select count(*) from public.placements where job_id = J) = 1);
  perform pg_temp.ok('RLS: бухгалтер читает пропозал', (select count(*) from public.proposals where id = PP) = 1);
  perform pg_temp.ok('RLS: бухгалтер читает REP', (select count(*) from public.repairs where id = RP) = 1);
  perform pg_temp.ok('RLS: бухгалтер видит acc_settings', (select count(*) from public.acc_settings) >= 5);
  perform pg_temp.ok('RLS: can_view_job(J) у бухгалтера', public.can_view_job(J));
  update public.acc_settings set pct = 42 where id = 'rate:clean';
  perform pg_temp.ok('RLS: бухгалтер пишет acc_settings (pct 42)', (select pct = 42 from public.acc_settings where id = 'rate:clean'));
  update public.jobs set note = 'взломано' where id = J;
  perform pg_temp.ok('RLS: чужой инвойс бухгалтеру НЕ пишется', (select note from public.jobs where id = J) <> 'взломано');
  r := public.acc_doc_mark('job', J, 'checked', 'из-под RLS');
  perform pg_temp.ok('RPC acc_doc_mark работает под authenticated', (select acc_status = 'checked' from public.jobs where id = J));
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.ok('RLS: техник свой инвойс видит', (select count(*) from public.jobs where id = J) = 1);
  perform pg_temp.ok('RLS: техник acc_settings не видит', (select count(*) from public.acc_settings) = 0);
  update public.acc_settings set pct = 1 where id = 'rate:clean';
  perform pg_temp.ok('RLS: техник acc_settings не пишет (0 строк)', (select count(*) from public.acc_settings where pct = 1) = 0);
  perform set_config('request.jwt.claim.sub', M::text, true);
  perform pg_temp.ok('RLS: менеджер acc_settings не видит', (select count(*) from public.acc_settings) = 0);

  raise notice '';
  raise notice 'БУХГАЛТЕРИЯ: все % проверок пройдены — транзакция откатывается, база не изменена.', currval('tac_cnt');
end $$;

rollback;
