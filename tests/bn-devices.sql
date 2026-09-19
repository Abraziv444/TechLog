-- v1.09.01 · функциональная проверка справочника «Трекеры Bouncie»:
-- сверка bn_devices_sync (новые / пропавшие → «неактивен» без удаления /
-- вернувшиеся), разбор ответа Bouncie, связь vehicles.imei → bn_devices,
-- проверки vehicle_save, RLS (читает только админ, писать и удалять нельзя).
-- Запуск: локальный PostgreSQL + заглушка Supabase, база после
-- full-install-1_09_01.sql (или 1_08_97 + update-to-1_09_01.sql).
-- psql -tA -d <база> -f tests/bn-devices.sql → «ИТОГ: N ✓ / 0 ✗». Всё в BEGIN…ROLLBACK.
\set ON_ERROR_STOP 1
begin;
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adm@x'), ('00000000-0000-0000-0000-00000000000d', 'mgr@x'),
  ('00000000-0000-0000-0000-00000000000c', 'tech@x')
  on conflict do nothing;
insert into public.profiles (id, login, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 't_adm', 'Adm', 'admin'),
  ('00000000-0000-0000-0000-00000000000d', 't_mgr', 'Mgr', 'manager'),
  ('00000000-0000-0000-0000-00000000000c', 't_tech', 'Tech', 'tech')
  on conflict (id) do update set role = excluded.role;
-- всё, что уже было в справочнике, — неактивно: счётчики сверки ниже точные
update public.bn_devices set status = 'inactive', inactive_at = coalesce(inactive_at, now());
set session_replication_role = origin;

create temp table r (n int, name text, ok boolean, note text);
grant all on r to authenticated;
create temp sequence rn; grant usage, select, update on sequence rn to authenticated;
create temp table lists (k text primary key, j jsonb);
grant select on lists to authenticated;
create temp table res (k text primary key, j jsonb);
grant all on res to authenticated;

insert into lists values
 ('L1', '[
   {"imei":"359999000000001","vin":"1ftbw2cm5mka10001","nickName":"Van 1",
    "model":{"make":"Ford","name":"Transit","year":2021},
    "stats":{"lastUpdated":"2026-09-19T12:00:00.000Z","odometer":45678.4,
             "location":{"lat":33.88,"lon":-84.46,"heading":90,"address":"3200 Cumberland Blvd"}}},
   {"imei":"35-9999-0000-00002","nickName":"Van 2","model":{"make":"RAM","name":"ProMaster","year":"2020"},
    "stats":{"lastUpdated":"n/a","location":{"lat":"33.9","lon":-84.5}}},
   {"imei":"359999000000003","nickName":"Old","stats":{"lastUpdated":"2026-09-18T08:00:00Z"}},
   {"imei":"359999000000003","nickName":"Van 3","model":{"make":"Chevrolet","name":"Express","year":2019},
    "stats":{"lastUpdated":"2026-09-19T09:30:00Z"}},
   {"vin":"NOIMEI"}, {"imei":"abc"}, {"imei":"123"}, "string", 42, null
 ]'),
 ('L2',  '[{"imei":"359999000000001"},{"imei":"359999000000003","nickName":"Van 3"}]'),
 ('L2b', '[{"imei":"359999000000001"}]'),
 ('L3',  '[{"imei":"359999000000001"},{"imei":"359999000000002","nickName":"Van 2"},{"imei":"359999000000003","nickName":"Van 3"}]'),
 ('E',   '[]'),
 ('BAD', '{"imei":"359999000000001"}');

-- 1) права: менеджер и техник сверять не могут
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  begin perform public.bn_devices_sync((select j from lists where k = 'L1'));
    insert into r values (nextval('rn'), 'менеджер: сверка запрещена (FORBIDDEN)', false, 'прошла');
  exception when others then insert into r values (nextval('rn'), 'менеджер: сверка запрещена (FORBIDDEN)', sqlerrm = 'FORBIDDEN', sqlerrm); end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  begin perform public.bn_devices_sync((select j from lists where k = 'L1'));
    insert into r values (nextval('rn'), 'техник: сверка запрещена (FORBIDDEN)', false, 'прошла');
  exception when others then insert into r values (nextval('rn'), 'техник: сверка запрещена (FORBIDDEN)', sqlerrm = 'FORBIDDEN', sqlerrm); end;
end $$;

-- 2) админ: не массив — BAD_LIST
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  begin perform public.bn_devices_sync((select j from lists where k = 'BAD'));
    insert into r values (nextval('rn'), 'админ: объект вместо массива — BAD_LIST', false, 'прошла');
  exception when others then insert into r values (nextval('rn'), 'админ: объект вместо массива — BAD_LIST', sqlerrm = 'BAD_LIST', sqlerrm); end;
end $$;

-- 3) первая сверка: три трекера, мусор отброшен, дубль схлопнут
insert into res select 'L1', public.bn_devices_sync((select j from lists where k = 'L1'));
insert into r select nextval('rn'), 'сверка L1: total 3, added 3, back 0, off 0, не пустая',
  (j->>'total')::int = 3 and (j->>'added')::int = 3 and (j->>'back')::int = 0 and (j->>'off')::int = 0 and (j->>'empty')::boolean = false,
  j::text from res where k = 'L1';
insert into r select nextval('rn'), 'в справочнике ровно 3 тестовых трекера, все активны',
  count(*) = 3 and bool_and(status = 'active'), count(*)::text from public.bn_devices where imei like '359999%';
insert into r select nextval('rn'), 'поля из Bouncie: VIN в верхнем регистре, имя, марка/модель/год, связь, координаты, адрес, пробег',
  vin = '1FTBW2CM5MKA10001' and nickname = 'Van 1' and make = 'Ford' and model = 'Transit' and year = 2021
  and reported_at = '2026-09-19T12:00:00Z'::timestamptz and lat = 33.88 and lng = -84.46
  and address = '3200 Cumberland Blvd' and odometer = 45678.4 and inactive_at is null
  and last_seen_at is not null and checked_at is not null,
  vin || '/' || nickname || '/' || make || '/' || model || '/' || year from public.bn_devices where imei = '359999000000001';
insert into r select nextval('rn'), 'IMEI с дефисами → только цифры; кривая дата и строковая широта → null без ошибки; год строкой принят',
  reported_at is null and lat is null and lng = -84.5 and year = 2020 and nickname = 'Van 2',
  coalesce(reported_at::text, 'null') || '/' || coalesce(lat::text, 'null') || '/' || coalesce(year::text, 'null')
  from public.bn_devices where imei = '359999000000002';
insert into r select nextval('rn'), 'дубль IMEI в ответе: берётся свежая запись',
  nickname = 'Van 3' and reported_at = '2026-09-19T09:30:00Z'::timestamptz, nickname from public.bn_devices where imei = '359999000000003';

-- 4) трекер 2 пропал из Bouncie — «неактивен», строка на месте
insert into res select 'L2', public.bn_devices_sync((select j from lists where k = 'L2'));
insert into r select nextval('rn'), 'сверка L2: off 1, added 0, back 0',
  (j->>'off')::int = 1 and (j->>'added')::int = 0 and (j->>'back')::int = 0, j::text from res where k = 'L2';
insert into r select nextval('rn'), 'пропавший трекер не удалён: status inactive, inactive_at есть, данные сохранены',
  status = 'inactive' and inactive_at is not null and nickname = 'Van 2' and lng = -84.5,
  status || '/' || coalesce(inactive_at::text, 'null') from public.bn_devices where imei = '359999000000002';
insert into r select nextval('rn'), 'частичный ответ без полей не затирает марку/модель/VIN/координаты',
  make = 'Ford' and model = 'Transit' and vin = '1FTBW2CM5MKA10001' and lat = 33.88 and odometer = 45678.4 and status = 'active',
  make || '/' || model from public.bn_devices where imei = '359999000000001';
insert into r select nextval('rn'), 'checked_at одинаков у всех строк после сверки (время последней сверки)',
  count(distinct checked_at) = 1, count(distinct checked_at)::text from public.bn_devices;

-- 5) машины: трекер — только из справочника
create temp table ids (k text primary key, id uuid);
do $$
declare v uuid;
begin
  v := public.vehicle_save(null, 'Ford Transit', null, '359999000000001', 91, null);
  insert into ids values ('A', v);
  insert into r values (nextval('rn'), 'vehicle_save: активный свободный трекер привязан',
    (select imei from public.vehicles where id = v) = '359999000000001', v::text);
end $$;
do $$ begin
  begin perform public.vehicle_save(null, 'B', null, '359999000000001', 92, null);
    insert into r values (nextval('rn'), 'vehicle_save: трекер другой машины — DEVICE_TAKEN', false, 'прошло');
  exception when others then insert into r values (nextval('rn'), 'vehicle_save: трекер другой машины — DEVICE_TAKEN', sqlerrm = 'DEVICE_TAKEN', sqlerrm); end;
end $$;
do $$ begin
  begin perform public.vehicle_save(null, 'B', null, '359999000000002', 92, null);
    insert into r values (nextval('rn'), 'vehicle_save: неактивный трекер новой машине — DEVICE_INACTIVE', false, 'прошло');
  exception when others then insert into r values (nextval('rn'), 'vehicle_save: неактивный трекер новой машине — DEVICE_INACTIVE', sqlerrm = 'DEVICE_INACTIVE', sqlerrm); end;
end $$;
do $$ begin
  begin perform public.vehicle_save(null, 'B', null, '359999000000099', 92, null);
    insert into r values (nextval('rn'), 'vehicle_save: IMEI вне справочника — NO_DEVICE', false, 'прошло');
  exception when others then insert into r values (nextval('rn'), 'vehicle_save: IMEI вне справочника — NO_DEVICE', sqlerrm = 'NO_DEVICE', sqlerrm); end;
end $$;
do $$
declare v uuid;
begin
  v := public.vehicle_save(null, 'RAM', null, '35 9999 0000 00003', 92, null);
  insert into ids values ('B', v);
  insert into r values (nextval('rn'), 'vehicle_save: IMEI с пробелами нормализуется и привязывается',
    (select imei from public.vehicles where id = v) = '359999000000003', (select imei from public.vehicles where id = v));
end $$;

-- 6) трекер машины B пропал — правка машины с тем же трекером не блокируется
insert into res select 'L2b', public.bn_devices_sync((select j from lists where k = 'L2b'));
do $$
begin
  perform public.vehicle_save((select id from ids where k = 'B'), 'RAM ProMaster', null, '359999000000003', 92, null);
  insert into r values (nextval('rn'), 'машина со своим ставшим неактивным трекером сохраняется (правка марки)',
    (select make from public.vehicles where id = (select id from ids where k = 'B')) = 'RAM ProMaster', null);
exception when others then insert into r values (nextval('rn'), 'машина со своим ставшим неактивным трекером сохраняется (правка марки)', false, sqlerrm);
end $$;
insert into r select nextval('rn'), 'машина по-прежнему ссылается на неактивный трекер (его не удалили)',
  v.imei = d.imei and d.status = 'inactive', d.status from public.vehicles v join public.bn_devices d on d.imei = v.imei
  where v.id = (select id from ids where k = 'B');

-- 7) вернулись — снова «активен», дата появления прежняя
create temp table fs as select imei, first_seen_at from public.bn_devices where imei like '359999%';
insert into res select 'L3', public.bn_devices_sync((select j from lists where k = 'L3'));
insert into r select nextval('rn'), 'сверка L3: back 2, added 0, off 0',
  (j->>'back')::int = 2 and (j->>'added')::int = 0 and (j->>'off')::int = 0, j::text from res where k = 'L3';
insert into r select nextval('rn'), 'вернувшиеся активны, inactive_at сброшен, first_seen_at не менялся',
  bool_and(d.status = 'active' and d.inactive_at is null and d.first_seen_at = fs.first_seen_at), count(*)::text
  from public.bn_devices d join fs using (imei);

-- 8) пустой ответ Bouncie статусы не трогает
insert into res select 'E', public.bn_devices_sync((select j from lists where k = 'E'));
insert into r select nextval('rn'), 'пустой список: empty = true, off 0',
  (j->>'empty')::boolean and (j->>'off')::int = 0 and (j->>'total')::int = 0, j::text from res where k = 'E';
insert into r select nextval('rn'), 'после пустого списка все три по-прежнему активны',
  count(*) filter (where status = 'active') = 3, count(*) filter (where status = 'active')::text
  from public.bn_devices where imei like '359999%';

-- 9) внешний ключ: IMEI машины обязан быть в справочнике
do $$ begin
  begin insert into public.vehicles (id, make, imei, car_no) values ('c0000000-0000-0000-0000-0000000000c3', 'X', '359999000000077', 93);
    insert into r values (nextval('rn'), 'FK vehicles_imei_fk: чужой IMEI не вставляется', false, 'вставилось');
  exception when foreign_key_violation then insert into r values (nextval('rn'), 'FK vehicles_imei_fk: чужой IMEI не вставляется', true, sqlerrm); end;
end $$;

-- 10) RLS: читает админ; менеджер не видит; вставить/изменить/удалить напрямую нельзя
set local role authenticated;
insert into r select nextval('rn'), 'RLS: админ видит справочник',
  count(*) = 3, count(*)::text from public.bn_devices where imei like '359999%';
do $$ begin
  begin insert into public.bn_devices (imei) values ('359999000000055');
    insert into r values (nextval('rn'), 'RLS: админ не вставляет строки напрямую', false, 'вставилось');
  exception when insufficient_privilege then insert into r values (nextval('rn'), 'RLS: админ не вставляет строки напрямую', true, sqlerrm); end;
end $$;
update public.bn_devices set status = 'inactive' where imei = '359999000000001';
delete from public.bn_devices where imei like '359999%';
reset role;
insert into r select nextval('rn'), 'RLS: прямые update и delete ничего не делают (только сверка)',
  count(*) = 3 and bool_and(status = 'active'), count(*)::text from public.bn_devices where imei like '359999%';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
set local role authenticated;
insert into r select nextval('rn'), 'RLS: менеджер справочник не видит', count(*) = 0, count(*)::text from public.bn_devices;
reset role;

select case when ok then '✓' else '✗' end || ' ' || name || coalesce(' — ' || note, '') from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
