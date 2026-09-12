-- =====================================================================
-- TechLog · tests/tv.sql — функциональная проверка RPC режима телевизора
-- Запуск на базе со схемой ≥ 1.08.37:  psql -d <db> -f tests/tv.sql
-- Всё внутри BEGIN…ROLLBACK — база остаётся нетронутой.
-- Сценарий: телевизор просит сессию (anon) → воркеру отказано в апруве →
-- админ видит список и авторизует → фид отдаёт данные дня → отзыв
-- закрывает фид. Данные дня сеются под session_replication_role=replica.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

do $$
declare
  adm uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';
  wrk uuid := 'aaaaaaaa-0000-0000-0000-0000000000b2';
  cx  uuid := 'aaaaaaaa-0000-0000-0000-0000000000c3';
  wt  uuid := 'aaaaaaaa-0000-0000-0000-0000000000d4';
  et  uuid := 'aaaaaaaa-0000-0000-0000-0000000000e5';
  jb  uuid := 'aaaaaaaa-0000-0000-0000-0000000000f6';
  req json; k text; sid uuid; st text; feed json; ok boolean;
begin
  -- ---- сиды: админ, воркер, комплекс, работа «сегодня выполнена», пикап, визит
  perform set_config('session_replication_role', 'replica', true);
  insert into auth.users (id, email) values
    (adm, 'tv-adm@techlog.example.com'), (wrk, 'tv-wrk@techlog.example.com')
    on conflict (id) do nothing;
  insert into profiles (id, login, display_name, role, car_no) values
    (adm, 'tv_adm', 'TV Admin', 'admin', 90),
    (wrk, 'tv_wrk', 'TV Worker', 'tech', 91)
    on conflict (id) do nothing;
  insert into complexes (id, name, abbr, lat, lng) values
    (cx, 'TV Test Complex', 'TVC', 33.80, -84.40) on conflict (id) do nothing;
  insert into work_types (id, name, color) values (wt, 'TV STEAM', '#FF9600')
    on conflict (id) do nothing;
  insert into equipment_types (id, abbr, name, color, price_key) values
    (et, 'TVB', 'TV Blower', '#58CC02', 'tv_blower') on conflict (id) do nothing;
  insert into jobs (id, date, unit_number, complex_id, work_type_id, technician_id, status) values
    (jb, current_date, '204', cx, wt, wrk, 'done') on conflict (id) do nothing;
  insert into placements (job_id, complex_id, unit_number, technician_id,
                          equipment_type_id, qty, placed_date, due_date) values
    (jb, cx, '204', wrk, et, 2, current_date - 2, current_date);
  insert into site_visits (date, driver_id, complex_id, arrived_at) values
    (current_date, wrk, cx, now() - interval '40 minutes');
  perform set_config('session_replication_role', 'origin', true);

  -- ---- 1. телевизор (anon, без jwt) просит сессию
  perform set_config('request.jwt.claim.sub', '', true);
  req := public.tv_request('sql-test');
  k := req->>'key';
  if length(k) <> 64 then raise exception 'FAIL: длина ключа % <> 64', length(k); end if;
  if length(req->>'code') <> 4 then raise exception 'FAIL: код не 4 символа'; end if;
  select id, status into sid, st from tv_sessions where device_key = k;
  if st is distinct from 'pending' then raise exception 'FAIL: статус новой сессии %', st; end if;
  raise notice 'OK 1: tv_request → pending, ключ и код на месте';

  -- ---- 2. tv_poll до апрува
  st := public.tv_poll(k)->>'status';
  if st <> 'pending' then raise exception 'FAIL: tv_poll до апрува → %', st; end if;
  raise notice 'OK 2: tv_poll → pending';

  -- ---- 3. фид закрыт до апрува
  ok := false;
  begin
    feed := public.tv_feed(k, current_date);
  exception when others then
    ok := sqlerrm like '%TV_FORBIDDEN%';
  end;
  if not ok then raise exception 'FAIL: tv_feed до апрува должен падать TV_FORBIDDEN'; end if;
  raise notice 'OK 3: tv_feed до апрува → TV_FORBIDDEN';

  -- ---- 4. воркер не может авторизовать
  perform set_config('request.jwt.claim.sub', wrk::text, true);
  ok := false;
  begin
    perform public.tv_decide(sid, true);
  exception when others then
    ok := sqlerrm like '%FORBIDDEN%';
  end;
  if not ok then raise exception 'FAIL: tv_decide воркером должен падать FORBIDDEN'; end if;
  raise notice 'OK 4: tv_decide воркером → FORBIDDEN';

  -- ---- 5. админ видит сессию в списке и авторизует
  perform set_config('request.jwt.claim.sub', adm::text, true);   -- после exception ставим заново
  if (select count(*) from json_array_elements(public.tv_list()) e
        where e->>'id' = sid::text) <> 1
    then raise exception 'FAIL: сессии нет в tv_list()'; end if;
  perform public.tv_decide(sid, true);
  select status, approved_by into st, sid from tv_sessions where device_key = k;
  if st <> 'approved' then raise exception 'FAIL: после апрува статус %', st; end if;
  raise notice 'OK 5: tv_list видит сессию, «Авторизовать ТВ» → approved';

  -- ---- 6. фид отдаёт данные дня (anon)
  perform set_config('request.jwt.claim.sub', '', true);
  st := public.tv_poll(k)->>'status';
  if st <> 'approved' then raise exception 'FAIL: tv_poll после апрува → %', st; end if;
  feed := public.tv_feed(k, current_date);
  if (feed->>'date')::date <> current_date then raise exception 'FAIL: feed.date'; end if;
  if (select count(*) from json_array_elements(feed->'jobs') j
        where j->>'unit' = '204' and (j->>'done')::boolean) <> 1
    then raise exception 'FAIL: работа дня не в фиде или без done'; end if;
  if json_array_length(feed->'pickups') < 1 then raise exception 'FAIL: пикап не в фиде'; end if;
  if (select count(*) from json_array_elements(feed->'stat_day') x
        where x->>'n' = '1') < 1 then raise exception 'FAIL: stat_day пуст'; end if;
  if json_array_length(feed->'site_now') < 1 then raise exception 'FAIL: site_now пуст'; end if;
  if (select count(*) from json_array_elements(feed->'profiles') p
        where p->>'name' = 'TV Worker') <> 1
    then raise exception 'FAIL: профили не в фиде'; end if;
  raise notice 'OK 6: tv_feed — работы, пикапы, статистика, «на объекте», штат';

  -- ---- 7. отзыв закрывает фид
  perform set_config('request.jwt.claim.sub', adm::text, true);
  select id into sid from tv_sessions where device_key = k;
  perform public.tv_decide(sid, false);
  perform set_config('request.jwt.claim.sub', '', true);
  st := public.tv_poll(k)->>'status';
  if st <> 'revoked' then raise exception 'FAIL: после отзыва tv_poll → %', st; end if;
  ok := false;
  begin
    feed := public.tv_feed(k, current_date);
  exception when others then
    ok := sqlerrm like '%TV_FORBIDDEN%';
  end;
  if not ok then raise exception 'FAIL: tv_feed после отзыва должен падать TV_FORBIDDEN'; end if;
  raise notice 'OK 7: «Отозвать» → фид закрыт';

  raise notice '======================================';
  raise notice 'tests/tv.sql: все проверки пройдены ✅';
  raise notice '======================================';
end $$;

rollback;
