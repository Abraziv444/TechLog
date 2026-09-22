-- v1.09.38 · пояс фирмы, рабочее время пушей, ТО и заметки по машине. Запуск: локальный PostgreSQL + заглушка Supabase,
-- база после full-install-1_09_38.sql (или update-to-1_09_38.sql). psql -tA -d <база> -f tests/v1_09_38.sql → «ИТОГ: N ✓ / 0 ✗».
\set ON_ERROR_STOP 1
begin;
create temp table r (n serial, name text, ok boolean, note text);
grant all on r to authenticated, service_role; grant usage, select, update on sequence r_n_seq to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;   -- как у Supabase по умолчанию (в заглушке этого нет)
create table if not exists public._net_calls (url text, headers jsonb, at timestamptz default now());
set session_replication_role = replica;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'a@x'), ('00000000-0000-0000-0000-0000000000c2', 'm@x'),
  ('00000000-0000-0000-0000-0000000000c3', 't@x'), ('00000000-0000-0000-0000-0000000000c4', 't2@x') on conflict do nothing;
insert into public.profiles (id, login, display_name, role, blocked) values
  ('00000000-0000-0000-0000-0000000000c1', 't38_adm', 'Adm', 'admin', false), ('00000000-0000-0000-0000-0000000000c2', 't38_mgr', 'Mgr', 'manager', false),
  ('00000000-0000-0000-0000-0000000000c3', 't38_drv', 'Drv', 'tech', false), ('00000000-0000-0000-0000-0000000000c4', 't38_oth', 'Oth', 'tech', false)
  on conflict (id) do update set role = excluded.role;
insert into public.vehicles (id, make, car_no, driver_id, last_odo) values ('66666666-0000-0000-0000-0000000000c1', 'Test Van', 77, '00000000-0000-0000-0000-0000000000c3', 10000);
insert into public.app_secrets (key, value) values ('push_fn_url', 'https://x/functions/v1/push'), ('push_fn_key', 'sb_publishable_x'), ('push_cron_key', 'k')
  on conflict (key) do update set value = excluded.value;
set session_replication_role = origin;

-- 1. пояс
insert into r(name, ok) select 'пояс по умолчанию — Нью-Йорк', public.app_tz() = 'America/New_York';
insert into r(name, ok) select 'app_today = дата в поясе фирмы', public.app_today() = (now() at time zone 'America/New_York')::date;
update public.org_settings set tz = 'Pacific/Honolulu' where id = 'org';
insert into r(name, ok) select 'смена пояса — app_today следует; снимок остатков в том же поясе', public.app_today() = (now() at time zone 'Pacific/Honolulu')::date
  and (select snapshot_tz from public.org_settings where id = 'org') = 'Pacific/Honolulu';
do $$ begin update public.org_settings set tz = 'Mars/Olympus' where id = 'org'; insert into r(name, ok) values ('неверный пояс отклонён', false);
exception when others then insert into r(name, ok, note) values ('неверный пояс отклонён', sqlerrm = 'BAD_TZ', sqlerrm); end $$;
update public.org_settings set tz = 'America/New_York' where id = 'org';
insert into r(name, ok) select 'дата задачи по умолчанию — app_today()', pg_get_expr(adbin, adrelid) like '%app_today%'
  from pg_attrdef where adrelid = 'public.jobs'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.jobs'::regclass and attname = 'date');

-- 2. рабочее окно: пн–пт 08:00–18:00 по Нью-Йорку
insert into r(name, ok) select 'правило выключено — сразу', public.push_hold_calc('{"work":{"on":false,"days":[1,2,3,4,5],"from":"08:00","to":"18:00"}}', '2026-09-22 14:00-04') is null;
insert into r(name, ok) select 'вт 10:00 — внутри окна, сразу', public.push_hold_calc('{"work":{"on":true,"days":[1,2,3,4,5],"from":"08:00","to":"18:00"}}', '2026-09-22 10:00-04') is null;
insert into r(name, ok, note) select 'вт 19:30 — ждёт ср 08:00', h = '2026-09-23 08:00-04', h::text
  from (select public.push_hold_calc('{"work":{"on":true,"days":[1,2,3,4,5],"from":"08:00","to":"18:00"}}', '2026-09-22 19:30-04') h) x;
insert into r(name, ok, note) select 'вт 06:10 — ждёт тот же вт 08:00', h = '2026-09-22 08:00-04', h::text
  from (select public.push_hold_calc('{"work":{"on":true,"days":[1,2,3,4,5],"from":"08:00","to":"18:00"}}', '2026-09-22 06:10-04') h) x;
insert into r(name, ok, note) select 'пт 18:00 — ждёт пн 08:00 (выходные пропущены)', h = '2026-09-28 08:00-04', h::text
  from (select public.push_hold_calc('{"work":{"on":true,"days":[1,2,3,4,5],"from":"08:00","to":"18:00"}}', '2026-09-25 18:00-04') h) x;
insert into r(name, ok, note) select 'ночная смена 22:00–06:00: ср 03:00 — внутри (начало во вторник)', h is null, h::text
  from (select public.push_hold_calc('{"work":{"on":true,"days":[2],"from":"22:00","to":"06:00"}}', '2026-09-23 03:00-04') h) x;
insert into r(name, ok, note) select 'переход на зимнее время: пт 31.10 20:00 → пн 03.11 08:00 EST (-05)', h = '2026-11-02 08:00-05', h::text
  from (select public.push_hold_calc('{"work":{"on":true,"days":[1,2,3,4,5],"from":"08:00","to":"18:00"}}', '2026-10-30 20:00-04') h) x;

-- очередь: строка вне окна получает hold_until и не захватывается; проверка доставки идёт всегда
update public.profiles set push_prefs = jsonb_build_object('work', jsonb_build_object('on', true, 'days', '[1,2,3,4,5,6,7]'::jsonb,
  'from', to_char((now() at time zone 'America/New_York') + interval '2 hours', 'HH24:MI'), 'to', to_char((now() at time zone 'America/New_York') + interval '3 hours', 'HH24:MI')))
 where id = '00000000-0000-0000-0000-0000000000c3';
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-0000000000c3', 'job', 'held', ''), ('00000000-0000-0000-0000-0000000000c3', 'test', 'test', '');
insert into r(name, ok) select 'вне окна — hold_until в будущем', hold_until > now() from public.push_queue where title = 'held';
insert into r(name, ok) select 'проверка доставки — без задержки', hold_until is null from public.push_queue where title = 'test';
insert into r(name, ok) select 'push_claim берёт проверку и не трогает отложенный', (select array_agg(title) from public.push_claim(50)) = array['test'];
update public.profiles set push_prefs = '{}'::jsonb where id = '00000000-0000-0000-0000-0000000000c3';
insert into r(name, ok) select 'правило выключили — отложенный пересчитан и уходит', hold_until is null from public.push_queue where title = 'held';
update public.push_queue set hold_until = now() - interval '1 minute', claimed_at = null where title = 'held';
insert into r(name, ok, note) select 'тик: созрел отложенный — функция позвана', public.push_cron_tick() in ('due', 'morning', 'insurance'), (select count(*)::text from public._net_calls);
insert into r(name, ok) select 'тик: ключ расписания в заголовке, ключ проекта не как Bearer', headers->>'x-cron-key' = 'k' and not (headers ? 'Authorization') from public._net_calls order by at desc limit 1;

-- 3. ТО: интервал 5000, напомнить за 500
set session_replication_role = replica;
insert into public.maint_types (id, name, interval_mi, remind_mi) values ('77777777-0000-0000-0000-0000000000c1', 'Oil', 5000, 500) on conflict (id) do nothing;
set session_replication_role = origin;
delete from public.notices where user_id in ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1') and kind = 'bn_service';
insert into public.vehicle_maint (vehicle_id, type_id, last_mi) values ('66666666-0000-0000-0000-0000000000c1', '77777777-0000-0000-0000-0000000000c1', 6000);
insert into r(name, ok) select 'до ТО далеко — пуша нет', not exists (select 1 from public.notices where kind = 'bn_service' and user_id = '00000000-0000-0000-0000-0000000000c3');
update public.vehicles set last_odo = 10600 where id = '66666666-0000-0000-0000-0000000000c1';
insert into r(name, ok) select 'пробег 10600 при ТО на 11000 — пуш «Пора на ТО» водителю и админу',
  (select count(distinct user_id) from public.notices where kind = 'bn_service' and user_id in ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1')) = 2;
update public.vehicles set last_odo = 10700 where id = '66666666-0000-0000-0000-0000000000c1';
insert into r(name, ok) select 'второй раз за то же ТО — не шлёт', (select count(*) from public.notices where kind = 'bn_service' and user_id = '00000000-0000-0000-0000-0000000000c3') = 1;
update public.vehicle_maint set own_on = true, own_mi = 8000 where vehicle_id = '66666666-0000-0000-0000-0000000000c1';
insert into r(name, ok) select 'свой интервал 8000: следующее на 14000, отметка сброшена', notified_mi is null from public.vehicle_maint where vehicle_id = '66666666-0000-0000-0000-0000000000c1';
update public.vehicle_maint set notified_mi = 1 where vehicle_id = '66666666-0000-0000-0000-0000000000c1';
insert into r(name, ok) select 'отметку «пуш ушёл» клиент не перепишет', notified_mi is null from public.vehicle_maint where vehicle_id = '66666666-0000-0000-0000-0000000000c1';

-- 4. RLS: заметки и справочник ТО
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
insert into public.vehicle_notes (vehicle_id, author_id, body) values ('66666666-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', 'стук справа');
insert into r(name, ok) select 'водитель пишет заметку по своей машине', count(*) = 1 from public.vehicle_notes;
do $$ begin insert into public.vehicle_notes (vehicle_id, author_id, body) values ('66666666-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'подделка');
  insert into r(name, ok) values ('от чужого имени — нельзя', false); exception when others then insert into r(name, ok) values ('от чужого имени — нельзя', true); end $$;
do $$ begin update public.maint_types set interval_mi = 100; insert into r(name, ok) values ('воркер не правит справочник ТО', (select interval_mi from public.maint_types where id = '77777777-0000-0000-0000-0000000000c1') = 5000);
  exception when others then insert into r(name, ok) values ('воркер не правит справочник ТО', true); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', true);
do $$ begin insert into public.vehicle_notes (vehicle_id, author_id, body) values ('66666666-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4', 'не моя машина');
  insert into r(name, ok) values ('чужую машину сотрудник не комментирует', false); exception when others then insert into r(name, ok) values ('чужую машину сотрудник не комментирует', true); end $$;
insert into r(name, ok) select 'чужие заметки сотруднику не видны', count(*) = 0 from public.vehicle_notes;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
insert into r(name, ok) select 'менеджер видит все заметки по машине', count(*) = 1 from public.vehicle_notes;
insert into public.vehicle_notes (vehicle_id, author_id, body) values ('66666666-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'проверил');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
insert into r(name, ok) select 'водитель по-прежнему видит только свою', count(*) = 1 from public.vehicle_notes;
delete from public.vehicle_notes;
insert into r(name, ok) select 'сотрудник не удаляет историю', (select count(*) from public.vehicle_notes) = 1;

select case when ok then '✓ ' else '✗ ' end || name || coalesce(' — ' || note, '') from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
