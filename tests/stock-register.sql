-- =====================================================================
-- TechLog · tests/stock-register.sql — сквозной автотест склада (v1.08.29)
-- ---------------------------------------------------------------------
-- Создаёт ВСЕ типы документов приложения и после каждого шага сверяет
-- регистр оборудования (журнал equip_moves):
--   пропозал → работа (связь через link_job_proposal) → аренда
--   (placements, 2 типа оборудования, авто-добор) → операции регистра
--   (поступление · списание · взять · сдать · в ремонт ×2 · из ремонта)
--   → «забрал» → запрос продления (reject и approve через
--   decide_ext_request: полное и частичное) → «забрал» продление →
--   «вернул на склад» + обе отмены → правка количества → документ
--   ремонтных работ (REP) → заявка на код доступа → удаление работы
--   (каскад движений) → финальный инвариант сохранения журнала;
--   плюс блок «профили и роли»: создание сотрудника админом, все три
--   роли по кругу, блокировка/разблокировка, правка профиля и регрессия
--   «админ не может изменить роль» (клиентский RLS-upsert, v1.08.31);
--   плюс блок v1.08.32 «автомобили»: vehicle_save с синхронизацией номера
--   в профиле, перевес водителя, CAR_NO_TAKEN/BAD_CAR_NO/FORBIDDEN/NOT_FOUND
--   и ключи Bouncie в app_secrets через admin_set_bouncie_config;
--   плюс блок v1.08.33: триггеры пуш-очереди (назначение/передача, «не себе»,
--   личные галочки push_prefs, апрув/снятие, пикап vs продление), матрица
--   прав журнала времени tt_can_see, RLS site_visits (запись только с
--   сервера), права admin_sessions/kill и vehicle_service_set (порог ТО,
--   сброс notified, FORBIDDEN, NOT_FOUND).
--
-- БЕЗОПАСЕН ДЛЯ ЛЮБОЙ БАЗЫ: всё выполняется в одной транзакции и в конце
-- откатывается (ROLLBACK) — в таблицах не остаётся ни строки, включая
-- audit_log. Требует схему v1.08.27+ (equip_moves, equip_op, триггер).
--
-- Запуск:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/stock-register.sql
--   или целиком в Supabase SQL Editor (вывод NOTICE — во вкладке результатов).
-- Успех: NOTICE «СКЛАД-РЕГИСТР: все N проверок пройдены» и Rollback ниже.
-- Любое расхождение валит скрипт EXCEPTION с именем шага.
-- =====================================================================

begin;

create temporary sequence if not exists trt_cnt;
grant usage, select, update on sequence trt_cnt to authenticated;   -- хвост теста идёт под ролью authenticated

create or replace function pg_temp.eq(l text, v int, exp int) returns void language plpgsql as $$
begin
  if v is distinct from exp then
    raise exception 'ТЕСТ [%]: получили %, ждали %', l, v, exp;
  end if;
  perform nextval('trt_cnt');
  raise notice '  ok % = %', l, v;
end $$;

do $$
declare
  A  uuid := 'ad000000-0000-4000-8000-0000000000ad';  -- админ
  B  uuid := 'be000000-0000-4000-8000-0000000000be';  -- техник
  E1 uuid := 'e1000000-0000-4000-8000-0000000000e1';  -- тип 1 (DH)
  E2 uuid := 'e2000000-0000-4000-8000-0000000000e2';  -- тип 2 (BL)
  PP uuid := 'ee000000-0000-4000-8000-0000000000ee';  -- пропозал
  J  uuid := 'aa000000-0000-4000-8000-0000000000aa';  -- работа
  P1 uuid; P2 uuid; P3 uuid; X1 uuid; X2 uuid;
  RQ uuid := 'cc000000-0000-4000-8000-0000000000cc';  -- запрос продления (reject)
  RQ2 uuid := 'cd000000-0000-4000-8000-0000000000cd'; -- запрос продления (approve)
  NN uuid;                                              -- новый сотрудник (создаётся тестом)
  RP uuid := 'dd000000-0000-4000-8000-0000000000dd';  -- документ ремонта
  CQ uuid := 'cf000000-0000-4000-8000-0000000000cf';  -- заявка на код
  CX uuid := 'c0000000-0000-4000-8000-0000000000c0';  -- комплекс
  CP uuid := 'c1000000-0000-4000-8000-0000000000c1';  -- контрагент
  msg text; n int;
begin
  -- ---------- сид: пользователи, справочники (триггеры молчат) ----------
  perform set_config('session_replication_role', 'replica', true);
  insert into auth.users (id) values (A), (B);
  insert into public.profiles (id, login, display_name, role, car_no) values
    (A, 'trt_admin', 'ТестАдмин', 'admin', 98),
    (B, 'trt_tech',  'ТестТехник', 'tech', 99);
  insert into public.counterparties (id, name, abbr) values (CP, 'ТестКонтрагент', 'TCP');
  insert into public.complexes (id, name, abbr, counterparty_id) values (CX, 'ТестКомплекс', 'TCX', CP);
  insert into public.equipment_types (id, name, abbr, color, price_key, sort) values
    (E1, 'Тест-осушитель', 'TDH', '#3aa0ff', 'trt_dh', 901),
    (E2, 'Тест-блоуэр',   'TBL', '#58cc02', 'trt_bl', 902);
  perform set_config('session_replication_role', 'origin', true);

  -- ---------- операции регистра: поступление и первичные остатки ----------
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform public.equip_op('intake', E1, 10, 'автотест: закупка');
  perform public.equip_op('intake', E2, 6,  'автотест: закупка');
  perform pg_temp.eq('поступление: склад E1', public.equip_bal(E1, 'stock'), 10);
  perform pg_temp.eq('поступление: склад E2', public.equip_bal(E2, 'stock'), 6);
  perform public.equip_op('writeoff', E1, 1, 'автотест: утиль');
  perform pg_temp.eq('списание: склад E1', public.equip_bal(E1, 'stock'), 9);

  begin
    perform public.equip_op('writeoff', E1, 99);
    raise exception 'ТЕСТ [списание сверх остатка прошло]';
  exception when others then
    msg := SQLERRM;
    if msg not like 'NOT_ENOUGH:9%' then raise; end if;
    perform nextval('trt_cnt'); raise notice '  ok списание сверх остатка отбито (%)', msg;
  end;

  -- техник: взять / в ремонт из машины / сдать
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform public.equip_op('take', E1, 3);
  perform public.equip_op('repair_car', E1, 1);
  perform public.equip_op('return', E1, 1);
  perform pg_temp.eq('взять/ремонт/сдать: склад E1', public.equip_bal(E1, 'stock'), 7);
  perform pg_temp.eq('взять/ремонт/сдать: машина B', public.equip_bal(E1, 'car', B), 1);
  perform pg_temp.eq('взять/ремонт/сдать: ремонт', public.equip_bal(E1, 'repair'), 1);
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform public.equip_op('repair_stock', E2, 1);
  perform public.equip_op('from_repair', E2, 1);
  perform pg_temp.eq('в ремонт и обратно: склад E2', public.equip_bal(E2, 'stock'), 6);

  begin
    perform set_config('request.jwt.claim.sub', B::text, true);
    perform public.equip_op('intake', E1, 1);
    raise exception 'ТЕСТ [поступление технику прошло]';
  exception when others then
    if SQLERRM <> 'FORBIDDEN' then raise; end if;
    perform nextval('trt_cnt'); raise notice '  ok поступление технику запрещено';
  end;

  -- ---------- пропозал → работа → связь ----------
  perform set_config('request.jwt.claim.sub', A::text, true);
  insert into public.proposals (id, date, counterparty_id, complex_id, unit_number, items, total, status)
  values (PP, current_date, CP, CX, '101', '[]'::jsonb, 250, 'approved');
  insert into public.jobs (id, date, counterparty_id, complex_id, technician_id, unit_number, status, form_data)
  values (J, current_date, CP, CX, B, '101', 'draft',
          jsonb_build_object('equipment', jsonb_build_object(
            E1::text, jsonb_build_object('qty', 4, 'days', 3),
            E2::text, jsonb_build_object('qty', 2, 'days', 3))));
  perform public.link_job_proposal(J, PP);
  select count(*) into n from public.jobs where id = J and proposal_id = PP;
  perform pg_temp.eq('пропозал привязан к работе', n, 1);

  -- ---------- аренда: placements двух типов (авто-добор в машину B) ----------
  insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id,
                                 complex_id, counterparty_id, unit_number)
  values (gen_random_uuid(), J, E1, 4, 3, current_date + 3, B, CX, CP, '101')
  returning id into P1;
  insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id,
                                 complex_id, counterparty_id, unit_number)
  values (gen_random_uuid(), J, E2, 2, 3, current_date + 3, B, CX, CP, '101')
  returning id into P2;
  -- в машине B был 1×E1 → добор 3; E2 в машине не было → добор 2
  perform pg_temp.eq('аренда E1: склад (авто-добор 3)', public.equip_bal(E1, 'stock'), 4);
  perform pg_temp.eq('аренда E1: машина B опустела', public.equip_bal(E1, 'car', B), 0);
  perform pg_temp.eq('аренда E2: склад (авто-добор 2)', public.equip_bal(E2, 'stock'), 4);
  select count(*) into n from public.equip_moves where placement_id = P1;
  perform pg_temp.eq('аренда E1: движений (добор+постановка)', n, 2);

  -- ---------- запрос продления: отклонить, затем одобрить ----------
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into public.ext_requests (id, job_id, requested_by, days, qty_total, payload, unit, cx, eq)
  values (RQ, J, B, 2, 4, jsonb_build_array(jsonb_build_object('id', P1, 'qty', 4)), '101', 'TCX', 'TDH');
  insert into public.ext_requests (id, job_id, requested_by, days, qty_total, payload, unit, cx, eq)
  values (RQ2, J, B, 2, 5, jsonb_build_array(
            jsonb_build_object('id', P1, 'qty', 4),      -- полное продление E1
            jsonb_build_object('id', P2, 'qty', 1)),     -- частичное продление E2 (1 из 2)
          '101', 'TCX', 'TDH+TBL');

  perform set_config('request.jwt.claim.sub', A::text, true);
  perform public.decide_ext_request(RQ, false);
  select count(*) into n from public.ext_requests where id = RQ and status = 'rejected';
  perform pg_temp.eq('запрос продления отклонён', n, 1);

  perform public.decide_ext_request(RQ2, true);
  select count(*) into n from public.placements where ext_of = P1;
  perform pg_temp.eq('одобрение: продление E1 создано', n, 1);
  select count(*) into n from public.placements where id = P1 and superseded;
  perform pg_temp.eq('одобрение: исходный E1 закрыт продлением', n, 1);
  select qty into n from public.placements where id = P2;
  perform pg_temp.eq('одобрение: частичное — у исходного E2 остался 1', n, 1);
  select id into X1 from public.placements where ext_of = P1;
  select id into X2 from public.placements where ext_of = P2;
  select count(*) into n from public.equip_moves where placement_id in (X1, X2);
  perform pg_temp.eq('продления — бумажные: движений нет', n, 0);
  select count(*) into n from public.equip_moves where placement_id = P2 and kind = 'undo';
  perform pg_temp.eq('уменьшение qty при продлении движения не создало', n, 0);
  perform pg_temp.eq('после продлений склад E1 не тронут', public.equip_bal(E1, 'stock'), 4);
  perform pg_temp.eq('после продлений склад E2 не тронут', public.equip_bal(E2, 'stock'), 4);

  -- ---------- «забрал»: продление E1 и остаток E2, потом возврат ----------
  perform set_config('request.jwt.claim.sub', B::text, true);
  update public.placements set picked_up = true, picked_up_at = now(), picked_up_by = B where id = X1;
  update public.placements set picked_up = true, picked_up_at = now(), picked_up_by = B where id = P2;
  perform pg_temp.eq('забрал: машина B по E1', public.equip_bal(E1, 'car', B), 4);
  perform pg_temp.eq('забрал: машина B по E2', public.equip_bal(E2, 'car', B), 1);

  update public.placements set returned_at = now(), returned_by = B where id = X1;
  perform pg_temp.eq('вернул: склад E1', public.equip_bal(E1, 'stock'), 8);
  update public.placements set returned_at = null, returned_by = null where id = X1;
  perform pg_temp.eq('отмена возврата: склад E1', public.equip_bal(E1, 'stock'), 4);
  perform pg_temp.eq('отмена возврата: машина B', public.equip_bal(E1, 'car', B), 4);
  update public.placements set picked_up = false, picked_up_at = null, picked_up_by = null where id = X1;
  perform pg_temp.eq('отмена забора: машина B по E1', public.equip_bal(E1, 'car', B), 0);

  -- ---------- строки с продлениями qty-правкой не трогаются (бумажный перенос) ----------
  update public.placements set qty = 9 where id = X2;    -- у продления и его исходной
  update public.placements set qty = 9 where id = P2;    -- qty-ветка триггера молчит
  select count(*) into n from public.equip_moves where placement_id in (P2, X2) and kind = 'undo';
  perform pg_temp.eq('qty затронутых продлением строк — движений нет', n, 0);
  update public.placements set qty = 1 where id = X2;
  update public.placements set qty = 1 where id = P2;

  -- ---------- правка количества в форме: обычная аренда P3 ----------
  insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id,
                                 complex_id, counterparty_id, unit_number)
  values (gen_random_uuid(), J, E2, 2, 3, current_date + 3, B, CX, CP, '101')
  returning id into P3;
  perform pg_temp.eq('P3: склад E2 (в машине был 1 — добор 1)', public.equip_bal(E2, 'stock'), 3);
  update public.placements set qty = 4 where id = P3;              -- на объекте: добор 2
  perform pg_temp.eq('qty 2→4 на объекте: авто-добор со склада', public.equip_bal(E2, 'stock'), 1);
  update public.placements set qty = 3 where id = P3;              -- на объекте: единица в машину
  perform pg_temp.eq('qty 4→3 на объекте: вернулась в машину B', public.equip_bal(E2, 'car', B), 1);
  update public.placements set picked_up = true, picked_up_at = now(), picked_up_by = B where id = P3;
  update public.placements set qty = 2 where id = P3;              -- у забранного: машина −1
  perform pg_temp.eq('qty 3→2 у забранного: машина скорректирована', public.equip_bal(E2, 'car', B), 3);
  update public.placements set returned_at = now(), returned_by = B where id = P3;
  perform pg_temp.eq('вернул P3: склад E2', public.equip_bal(E2, 'stock'), 3);
  perform pg_temp.eq('вернул P3: машина B по E2', public.equip_bal(E2, 'car', B), 1);

  -- ---------- документ ремонтных работ: склад не трогает ----------
  select count(*) into n from public.equip_moves;
  insert into public.repairs (id, job_id, date, created_by, helper_ids, status, items, materials, total, hist)
  values (RP, J, current_date, B, jsonb_build_array(B), 'draft',
          '[{"q":1,"d":"Тестовая работа","a":50}]'::jsonb, '[]'::jsonb, 50, '[]'::jsonb);
  perform set_config('request.jwt.claim.sub', A::text, true);  -- апрув ставит админ (repairs_guard)
  update public.repairs set status = 'approved' where id = RP;
  select count(*) - n into n from public.equip_moves;
  perform pg_temp.eq('документ ремонта движений не создаёт', n, 0);

  -- ---------- заявка на код доступа ----------
  perform set_config('request.jwt.claim.sub', B::text, true);
  insert into public.code_requests (id, complex_id, requested_by, access_code)
  values (CQ, CX, B, '#4321');
  perform set_config('request.jwt.claim.sub', A::text, true);
  update public.code_requests set status = 'approved', decided_by = A, decided_at = now() where id = CQ;
  select count(*) into n from public.code_requests where id = CQ and status = 'approved';
  perform pg_temp.eq('заявка на код создана и одобрена', n, 1);

  -- ---------- удаление работы: каскад placements → каскад движений ----------
  delete from public.jobs where id = J;
  select count(*) into n from public.equip_moves where placement_id is not null;
  perform pg_temp.eq('каскад: движений аренды не осталось', n, 0);
  perform pg_temp.eq('каскад: склад E1 = ручные операции', public.equip_bal(E1, 'stock'), 7);
  perform pg_temp.eq('каскад: склад E2', public.equip_bal(E2, 'stock'), 6);
  -- в машине B остаётся ручной остаток E1: взял 3 − в ремонт 1 − сдал 1 = 1
  perform pg_temp.eq('каскад: в машине B остались ручные E1', public.equip_bal(E1, 'car', B), 1);
  perform pg_temp.eq('каскад: машина B пуста (E2)', public.equip_bal(E2, 'car', B), 0);
  perform pg_temp.eq('каскад: ремонт E1 (ручная сдача в ремонт)', public.equip_bal(E1, 'repair'), 1);

  -- ---------- инвариант сохранения: журнал не «течёт» ----------
  -- всё, что вошло извне (intake/init), минус ушедшее (writeoff),
  -- обязано лежать на складе + в машинах + в ремонте.
  for msg, n in
    select et.abbr,
           (select coalesce(sum(case when m.from_loc = 'ext' then m.qty
                                     when m.to_loc = 'ext' then -m.qty else 0 end), 0)
              from public.equip_moves m where m.equipment_type_id = et.id)
         - public.equip_bal(et.id, 'stock')
         - (select coalesce(sum(case when m2.to_loc = 'car' then m2.qty
                                     when m2.from_loc = 'car' then -m2.qty else 0 end), 0)
              from public.equip_moves m2 where m2.equipment_type_id = et.id)
         - public.equip_bal(et.id, 'repair')
      from public.equipment_types et where et.id in (E1, E2)
  loop
    perform pg_temp.eq('инвариант сохранения ' || msg, n, 0);
  end loop;

  -- ---------- stock_counts и аудит ----------
  select free into n from public.stock_counts() where equipment_type_id = E1;
  perform pg_temp.eq('stock_counts: свободно E1', n, 7);
  select with_tech into n from public.stock_counts() where equipment_type_id = E1;
  perform pg_temp.eq('stock_counts: в машинах E1', n, 1);
  select broken into n from public.stock_counts() where equipment_type_id = E1;
  perform pg_temp.eq('stock_counts: «сломано» всегда 0', n, 0);
  select count(*)::int into n from public.audit_log where action like 'equip\_%' escape '\'
    and actor in (A, B);
  perform pg_temp.eq('аудит операций регистра', n, 8);

  -- =====================================================================
  -- ПРОФИЛИ И РОЛИ (v1.08.31): создание, все роли, блокировка, правка,
  -- регрессия «админ не может изменить роль» (клиентский upsert под RLS).
  -- =====================================================================
  perform set_config('request.jwt.claim.sub', A::text, true);
  NN := public.admin_create_user('trt.new', 'trt.new@techlog.local', 'secret7', 'Новый Работник', 'tech');
  select count(*) into n from public.profiles where id = NN and role = 'tech' and blocked = false;
  perform pg_temp.eq('создание сотрудника админом (tech)', n, 1);
  select count(*) into n from auth.identities where user_id = NN;
  perform pg_temp.eq('identity для входа создана', n, 1);

  begin
    perform public.admin_create_user('trt.new', 'trt.new@techlog.local', 'secret7', 'Дубль', 'tech');
    raise exception 'ТЕСТ [дубль логина прошёл]';
  exception when others then
    if SQLERRM <> 'LOGIN_TAKEN' then raise; end if;
    perform nextval('trt_cnt'); raise notice '  ok дубль логина отбит (LOGIN_TAKEN)';
  end;

  perform public.admin_set_role(NN, 'manager');
  select count(*) into n from public.profiles where id = NN and role = 'manager';
  perform pg_temp.eq('роль назначена: manager', n, 1);
  perform public.admin_set_role(NN, 'admin');
  select count(*) into n from public.profiles where id = NN and role = 'admin';
  perform pg_temp.eq('роль назначена: admin', n, 1);
  perform public.admin_set_role(NN, 'tech');
  select count(*) into n from public.profiles where id = NN and role = 'tech';
  perform pg_temp.eq('роль назначена: tech (обратно)', n, 1);

  begin
    perform public.admin_set_role(A, 'tech');
    raise exception 'ТЕСТ [самопонижение прошло]';
  exception when others then
    if SQLERRM <> 'SELF_DEMOTE' then raise; end if;
    perform nextval('trt_cnt'); raise notice '  ok самопонижение админа отбито (SELF_DEMOTE)';
  end;

  begin
    perform set_config('request.jwt.claim.sub', B::text, true);
    perform public.admin_set_role(NN, 'admin');
    raise exception 'ТЕСТ [смена роли техником прошла]';
  exception when others then
    if SQLERRM <> 'FORBIDDEN' then raise; end if;
    perform nextval('trt_cnt'); raise notice '  ok смена роли техником запрещена (FORBIDDEN)';
  end;

  perform set_config('request.jwt.claim.sub', A::text, true);
  perform public.admin_set_blocked(NN, true);
  select count(*) into n from public.profiles p join auth.users u on u.id = p.id
   where p.id = NN and p.blocked and u.banned_until is not null;
  perform pg_temp.eq('блокировка: profiles + auth.users', n, 1);
  perform public.admin_set_blocked(NN, false);
  select count(*) into n from public.profiles p join auth.users u on u.id = p.id
   where p.id = NN and not p.blocked and u.banned_until is null;
  perform pg_temp.eq('разблокировка: доступ возвращён', n, 1);

  perform set_config('request.jwt.claim.sub', NN::text, true);
  update public.profiles set display_name = 'Новый Работник 2' where id = NN;
  select count(*) into n from public.profiles where id = NN and display_name = 'Новый Работник 2';
  perform pg_temp.eq('сотрудник правит своё имя', n, 1);
  perform set_config('request.jwt.claim.sub', A::text, true);
  update public.profiles set display_name = 'Новый Работник 3' where id = NN;
  select count(*) into n from public.profiles where id = NN and display_name = 'Новый Работник 3';
  perform pg_temp.eq('админ правит имя сотрудника', n, 1);

  -- ================= v1.08.32: автомобили и ключи Bouncie ==============
  declare
    V1 uuid; V2 uuid;
  begin
    perform set_config('request.jwt.claim.sub', A::text, true);

    -- ключи Bouncie: запись, «пустая строка = не менять», запрет технику
    perform public.admin_set_bouncie_config('cid-1', 'sec-1');
    select count(*) into n from public.app_secrets
     where (key, value) in (('bn_client_id','cid-1'), ('bn_client_secret','sec-1'));
    perform pg_temp.eq('bouncie: ключи легли в app_secrets', n, 2);
    perform public.admin_set_bouncie_config('cid-2', '');
    select count(*) into n from public.app_secrets
     where (key, value) in (('bn_client_id','cid-2'), ('bn_client_secret','sec-1'));
    perform pg_temp.eq('bouncie: пустой секрет не затирает старый', n, 2);
    begin
      perform set_config('request.jwt.claim.sub', B::text, true);
      perform public.admin_set_bouncie_config('x', 'y');
      raise exception 'ТЕСТ [техник записал ключи Bouncie]';
    exception when others then
      if SQLERRM <> 'FORBIDDEN' then raise; end if;
      perform nextval('trt_cnt'); raise notice '  ok bouncie: технику ключи запрещены (FORBIDDEN)';
    end;
    perform set_config('request.jwt.claim.sub', A::text, true);   -- exception откатил GUC

    -- vehicle_save: создание + синхронизация номера в профиле водителя
    select public.vehicle_save(null, 'Ford Transit', 'VIN0001', '35-000 111', 11, NN) into V1;
    select count(*) into n from public.vehicles
     where id = V1 and imei = '35000111' and car_no = 11 and driver_id = NN;
    perform pg_temp.eq('машина создана, IMEI очищен до цифр', n, 1);
    select count(*) into n from public.profiles where id = NN and car_no = 11;
    perform pg_temp.eq('номер машины лёг в профиль водителя', n, 1);

    -- негативы: занятый и кривой номер
    begin
      perform public.vehicle_save(null, 'Dodge', null, null, 11, null);
      raise exception 'ТЕСТ [дубль номера машины (vehicles) прошёл]';
    exception when others then
      if SQLERRM <> 'CAR_NO_TAKEN' then raise; end if;
      perform nextval('trt_cnt'); raise notice '  ok номер занят другой машиной (CAR_NO_TAKEN)';
    end;
    perform set_config('request.jwt.claim.sub', A::text, true);
    begin
      perform public.vehicle_save(null, 'Dodge', null, null, 100, null);
      raise exception 'ТЕСТ [номер 100 прошёл]';
    exception when others then
      if SQLERRM <> 'BAD_CAR_NO' then raise; end if;
      perform nextval('trt_cnt'); raise notice '  ok номер вне 1–99 отбит (BAD_CAR_NO)';
    end;
    perform set_config('request.jwt.claim.sub', A::text, true);

    -- вторая машина и «перевес» водителя: старая машина и старый номер очищаются
    select public.vehicle_save(null, 'RAM ProMaster', null, '35000222', 12, B) into V2;
    select count(*) into n from public.profiles where id = B and car_no = 12;
    perform pg_temp.eq('второй водитель получил №12', n, 1);
    perform public.vehicle_save(V1, 'Ford Transit', 'VIN0001', '35000111', 11, B);
    select count(*) into n from public.vehicles where id = V2 and driver_id is null;
    perform pg_temp.eq('перевес: со старой машины водитель снят', n, 1);
    select count(*) into n from public.profiles where id = B and car_no = 11;
    perform pg_temp.eq('перевес: у водителя номер новой машины', n, 1);
    select count(*) into n from public.profiles where id = NN and car_no is null;
    perform pg_temp.eq('перевес: у прежнего водителя номер снят', n, 1);

    -- негативы: техник и несуществующая машина
    begin
      perform set_config('request.jwt.claim.sub', B::text, true);
      perform public.vehicle_save(V1, 'Hack', null, null, 11, B);
      raise exception 'ТЕСТ [техник сохранил машину]';
    exception when others then
      if SQLERRM <> 'FORBIDDEN' then raise; end if;
      perform nextval('trt_cnt'); raise notice '  ok машины технику запрещены (FORBIDDEN)';
    end;
    perform set_config('request.jwt.claim.sub', A::text, true);
    begin
      perform public.vehicle_save('9e000000-0000-4000-8000-0000000000e9', 'Ghost', null, null, 13, null);
      raise exception 'ТЕСТ [правка несуществующей машины прошла]';
    exception when others then
      if SQLERRM <> 'NOT_FOUND' then raise; end if;
      perform nextval('trt_cnt'); raise notice '  ok несуществующая машина (NOT_FOUND)';
    end;
    perform set_config('request.jwt.claim.sub', A::text, true);

    -- вернуть профили в исходное состояние: хвост ниже рассчитывает,
    -- что №99 занят техником B (негатив «дубль номера машины»)
    perform public.vehicle_save(V1, 'Ford Transit', 'VIN0001', '35000111', 11, null);
    update public.profiles set car_no = 99 where id = B;
    select count(*) into n from public.profiles where id = B and car_no = 99;
    perform pg_temp.eq('парк разобран: технику вернули №99', n, 1);
  end;


  -- ===================================================================
  -- v1.08.33 · ПУШ-ОЧЕРЕДЬ, ЖУРНАЛ ВРЕМЕНИ, СЕССИИ, ТО
  -- ===================================================================
  begin
    declare
      PJ uuid := 'aa000000-0000-4000-8000-000000000a01';   -- работа для пушей
      PS uuid := 'aa000000-0000-4000-8000-000000000a02';   -- работа «самому себе»
      PL uuid := 'aa000000-0000-4000-8000-000000000a03';   -- пикап
      PX uuid := 'aa000000-0000-4000-8000-000000000a04';   -- продление
      VS uuid := 'aa000000-0000-4000-8000-000000000a05';   -- машина для ТО
    begin
      perform set_config('request.jwt.claim.sub', A::text, true);
      delete from public.push_queue;                      -- предыдущие блоки могли насорить триггерами

      -- назначение техника B (админом A) → одна строка kind='job' для B
      insert into public.jobs (id, date, counterparty_id, complex_id, technician_id, unit_number, status, form_data)
      values (PJ, current_date, CP, CX, B, '901', 'draft', '{}'::jsonb);
      select count(*) into n from public.push_queue where user_id = B and kind = 'job';
      perform pg_temp.eq('пуш: новая задача → технику', n, 1);

      -- работа «на себя» (A → A): автору не шлём
      insert into public.jobs (id, date, counterparty_id, complex_id, technician_id, unit_number, status, form_data)
      values (PS, current_date, CP, CX, A, '902', 'draft', '{}'::jsonb);
      select count(*) into n from public.push_queue where user_id = A;
      perform pg_temp.eq('пуш: самому себе не ставится', n, 0);

      -- личная галочка: prefs.job=false выключает kind='job'
      update public.profiles set push_prefs = '{"job":false}'::jsonb where id = B;
      update public.jobs set technician_id = A where id = PJ;
      update public.jobs set technician_id = B where id = PJ;   -- передача обратно B
      select count(*) into n from public.push_queue where user_id = B and kind = 'job';
      perform pg_temp.eq('пуш: prefs.job=false — передача не шлётся', n, 1);   -- осталась только первая
      update public.profiles set push_prefs = '{}'::jsonb where id = B;

      -- апрув → kind='approve'; снятие → kind='reset'
      update public.jobs set status = 'approved', approved_total = 100 where id = PJ;
      select count(*) into n from public.push_queue where user_id = B and kind = 'approve';
      perform pg_temp.eq('пуш: апрув инвойса', n, 1);
      update public.jobs set status = 'draft', approved_total = null where id = PJ;
      select count(*) into n from public.push_queue where user_id = B and kind = 'reset';
      perform pg_temp.eq('пуш: снятие апрува', n, 1);

      -- пикап (ext_of is null) → kind='pickup'; продление (ext_of) — тихо
      insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id,
                                     complex_id, counterparty_id, unit_number)
      values (PL, PJ, E1, 1, 3, current_date + 3, B, CX, CP, '901');
      select count(*) into n from public.push_queue where user_id = B and kind = 'pickup';
      perform pg_temp.eq('пуш: новый пикап', n, 1);
      insert into public.placements (id, job_id, equipment_type_id, qty, days, due_date, technician_id,
                                     complex_id, counterparty_id, unit_number, ext_of)
      values (PX, PJ, E1, 1, 2, current_date + 5, B, CX, CP, '901', PL);
      select count(*) into n from public.push_queue where user_id = B and kind = 'pickup';
      perform pg_temp.eq('пуш: продление не дублирует пикап', n, 1);

      -- журнал времени: матрица tt_can_see
      perform pg_temp.eq('время: админ видит любого',
        case when public.tt_can_see(A, B) then 1 else 0 end, 1);
      perform pg_temp.eq('время: свой журнал по умолчанию закрыт',
        case when public.tt_can_see(B, B) then 1 else 0 end, 0);
      update public.profiles set tt_self = true where id = B;
      perform pg_temp.eq('время: tt_self открывает свой журнал',
        case when public.tt_can_see(B, B) then 1 else 0 end, 1);
      perform pg_temp.eq('время: чужой без прав закрыт',
        case when public.tt_can_see(B, A) then 1 else 0 end, 0);
      update public.profiles set tt_others = 'all' where id = B;
      perform pg_temp.eq('время: tt_others=all открывает всех',
        case when public.tt_can_see(B, A) then 1 else 0 end, 1);
      update public.profiles set tt_others = 'list', tt_list = array[A]::uuid[] where id = B;
      perform pg_temp.eq('время: список — входящий виден',
        case when public.tt_can_see(B, A) then 1 else 0 end, 1);
      update public.profiles set tt_list = array[]::uuid[] where id = B;
      perform pg_temp.eq('время: список — не входящий закрыт',
        case when public.tt_can_see(B, A) then 1 else 0 end, 0);
      update public.profiles set tt_self = null, tt_others = null, tt_list = null where id = B;

      -- сессии: технику FORBIDDEN, админу можно
      begin
        perform set_config('request.jwt.claim.sub', B::text, true);
        perform * from public.admin_sessions(A);
        raise exception 'ТЕСТ [сессии открылись технику]';
      exception when others then
        if SQLERRM <> 'FORBIDDEN' then raise; end if;
        perform nextval('trt_cnt'); raise notice '  ok сессии: технику FORBIDDEN';
      end;
      perform set_config('request.jwt.claim.sub', A::text, true);   -- exception откатил GUC
      select count(*) into n from public.admin_sessions(B);
      perform pg_temp.eq('сессии: админ читает (пусто — ок)', n, 0);
      perform public.admin_kill_sessions(B);
      perform nextval('trt_cnt'); raise notice '  ok сессии: kill выполняется админом';

      -- ТО: установка порога, сброс notified, права, NOT_FOUND
      insert into public.vehicles (id, make, service_notified) values (VS, 'SvcTest', true);
      perform public.vehicle_service_set(VS, 87000);
      select count(*) into n from public.vehicles
        where id = VS and service_due_mi = 87000 and service_notified = false;
      perform pg_temp.eq('ТО: порог сохранён, notified сброшен', n, 1);
      begin
        perform set_config('request.jwt.claim.sub', B::text, true);
        perform public.vehicle_service_set(VS, 90000);
        raise exception 'ТЕСТ [ТО поставил техник]';
      exception when others then
        if SQLERRM <> 'FORBIDDEN' then raise; end if;
        perform nextval('trt_cnt'); raise notice '  ok ТО: технику FORBIDDEN';
      end;
      perform set_config('request.jwt.claim.sub', A::text, true);
      begin
        perform public.vehicle_service_set('9e000000-0000-4000-8000-0000000000e8', 500);
        raise exception 'ТЕСТ [ТО несуществующей машины прошло]';
      exception when others then
        if SQLERRM <> 'NOT_FOUND' then raise; end if;
        perform nextval('trt_cnt'); raise notice '  ok ТО: NOT_FOUND';
      end;
      perform set_config('request.jwt.claim.sub', A::text, true);

      -- прибраться: пуш-строки и тестовые документы не мешают хвосту
      delete from public.placements where id in (PL, PX);
      delete from public.jobs where id in (PJ, PS);
      delete from public.vehicles where id = VS;
      delete from public.push_queue;
    end;
  end;

  -- хвост под ролью authenticated: живой RLS, как у приложения
  set local role authenticated;

  insert into public.profiles as pp (id, login, display_name, role)
  values (NN, 'trt.new', 'Новый Работник 3', 'manager')
  on conflict (id) do update set role = excluded.role;
  select count(*) into n from public.profiles where id = NN and role = 'manager';
  perform pg_temp.eq('регрессия: upsert админа меняет роль', n, 1);

  insert into public.profiles as pp (id, login, display_name, role, car_no)
  values (NN, 'trt.new', 'Новый Работник 3', 'manager', 77)
  on conflict (id) do update set car_no = excluded.car_no;
  select count(*) into n from public.profiles where id = NN and car_no = 77;
  perform pg_temp.eq('регрессия: upsert админа ставит номер машины', n, 1);

  begin
    insert into public.profiles as pp (id, login, display_name, role, car_no)
    values (NN, 'trt.new', 'Новый Работник 3', 'manager', 99)   -- занят техником B
    on conflict (id) do update set car_no = excluded.car_no;
    raise exception 'ТЕСТ [дубль номера машины прошёл]';
  exception when unique_violation then
    perform nextval('trt_cnt'); raise notice '  ok дубль номера машины отбит (unique)';
  end;

  begin
    perform set_config('request.jwt.claim.sub', NN::text, true);
    update public.profiles set role = 'admin' where id = NN;
    raise exception 'ТЕСТ [самоповышение прошло]';
  exception when others then
    if SQLERRM <> 'FORBIDDEN_FIELD' then raise; end if;
    perform nextval('trt_cnt'); raise notice '  ok самоповышение отбито триггером (FORBIDDEN_FIELD)';
  end;

  perform set_config('request.jwt.claim.sub', NN::text, true);   -- exception выше откатил GUC
  update public.profiles set display_name = 'Взломано' where id = B;
  select count(*) into n from public.profiles where id = B and display_name = 'Взломано';
  perform pg_temp.eq('RLS: чужая строка сотруднику не пишется', n, 0);

  -- v1.08.33: site_visits пишет только сервер — обычной роли insert закрыт
  begin
    insert into public.site_visits (driver_id, complex_id, arrived_at, date)
    values (B, CX, now(), current_date);
    raise exception 'ТЕСТ [site_visits вставился под authenticated]';
  exception when insufficient_privilege or sqlstate '42501' then
    perform nextval('trt_cnt'); raise notice '  ok журнал времени: запись только с сервера (RLS)';
  end;

  raise notice '';
  raise notice 'СКЛАД-РЕГИСТР: все % проверок пройдены — транзакция откатывается, база не изменена.',
    currval('trt_cnt');
end $$;

rollback;
