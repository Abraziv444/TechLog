-- =====================================================================
-- TechLog · update-to-1_09_38.sql  (после 1.09.34; идемпотентно — можно запускать повторно)
--  1) ЕДИНЫЙ ЧАСОВОЙ ПОЯС: org_settings.tz (по умолчанию America/New_York), app_tz() / app_today();
--     функции, где «сегодня» считалось по UTC (current_date), теперь считают по поясу фирмы.
--     ДАННЫЕ НЕ ПЕРЕСЧИТЫВАЮТСЯ — и это правильно: timestamptz хранит абсолютный момент (UTC), его только
--     показывают в нужном поясе; поля-даты (дата задачи, пикапа) — это выбранный человеком календарный день.
--     Ошибка была в другом: после 20:00 по Нью-Йорку у базы уже наступало «завтра» (замок правки, продление
--     аренды, остатки, ТВ). Пояс сессий базы НЕ меняем: иначе сервер начнёт отдавать время с «-04:00» вместо UTC,
--     а приложение местами сравнивает метки времени как строки.
--  2) РАБОЧЕЕ ВРЕМЯ ПУШЕЙ: push_queue.hold_until — вне рабочего окна получателя пуш ждёт начала ближайшего окна;
--     расписание раз в минуту (push_cron_tick) зовёт функцию push только когда есть что отправить.
--  3) ТО МАШИН и ЗАМЕТКИ: maint_types, vehicle_maint, vehicle_notes; пуш «Пора на ТО» ставит база по пробегу с трекера.
--  4) ИНВОЙС НА ДИСКЕ: inv_drive — сумма экземпляра на Диске (перенос в архив делает Edge Function media-delete 1.09.38).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Часовой пояс фирмы
-- ---------------------------------------------------------------------
alter table public.org_settings add column if not exists tz text not null default 'America/New_York';
alter table public.org_settings add column if not exists push_morning_hm text not null default '07:30';
alter table public.org_settings add column if not exists office_addr text;               -- офис: начало маршрутов на ТВ
alter table public.org_settings add column if not exists office_lat  double precision;
alter table public.org_settings add column if not exists office_lng  double precision;
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;

create or replace function public.org_tz_guard()
returns trigger language plpgsql as $$
begin
  if new.tz is null or new.tz = '' then new.tz := 'America/New_York'; end if;
  begin perform now() at time zone new.tz; exception when others then raise exception 'BAD_TZ'; end;
  if new.push_morning_hm is null or new.push_morning_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then new.push_morning_hm := '07:30'; end if;
  if tg_op = 'INSERT' or new.tz is distinct from old.tz then
    begin new.snapshot_tz := new.tz; exception when undefined_column then null; end;   -- снимок остатков — в том же поясе
  end if;
  return new;
end $$;
drop trigger if exists org_tz_guard_tg on public.org_settings;
create trigger org_tz_guard_tg before insert or update on public.org_settings for each row execute function public.org_tz_guard();

create or replace function public.app_tz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(tz, '') from public.org_settings where id = 'org'), 'America/New_York')
$$;
create or replace function public.app_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone public.app_tz())::date
$$;
grant execute on function public.app_tz() to anon, authenticated, service_role;
grant execute on function public.app_today() to anon, authenticated, service_role;

-- снимок остатков и прочее, что уже жило в поясе snapshot_tz — выравниваем по поясу фирмы
do $$ begin
  update public.org_settings set snapshot_tz = tz where snapshot_tz is distinct from tz;
exception when undefined_column then null; end $$;

-- «сегодня» по умолчанию у дат документов — по поясу фирмы
alter table public.jobs       alter column date        set default public.app_today();
alter table public.placements alter column placed_date set default public.app_today();
alter table public.proposals  alter column date        set default public.app_today();
alter table public.repairs    alter column date        set default public.app_today();

-- функции, где было current_date (UTC): замок правки старых задач, решение по продлению аренды, остатки склада, ТВ
create or replace function public.jobs_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select coalesce(edit_lock_days, 0) into v_n from public.org_settings where id = 'org';
  if v_n > 0
     and auth.uid() is not null
     and coalesce(current_setting('techlog.sysupd', true), '') <> '1'
     and coalesce(public.my_role(), 'tech') = 'tech'
     and old.date < public.app_today() - v_n
     and not (old.edit_open_until is not null and old.edit_open_until > now()) then
    raise exception 'LOCKED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.decide_ext_request(p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req  public.ext_requests%rowtype;
  v_pl   public.placements%rowtype;
  v_row  jsonb;
  v_q    int;
  v_base date;
  v_made int := 0;
  v_name text;
begin
  if public.my_role() not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.ext_requests
   where id = p_id and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select display_name into v_name from public.profiles where id = auth.uid();

  if not p_ok then
    update public.ext_requests
       set status = 'rejected', decided_by = auth.uid(), decided_at = now()
     where id = p_id;
    insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
    values (auth.uid(), coalesce(v_name,''), 'ext_request_rejected', 'job', v_req.job_id::text,
            jsonb_build_object('unit', v_req.unit, 'days', v_req.days, 'eq', v_req.eq));
    return;
  end if;

  for v_row in select * from jsonb_array_elements(v_req.payload) loop
    select * into v_pl from public.placements
     where id = (v_row->>'id')::uuid
       and job_id = v_req.job_id
       and picked_up = false
       and coalesce(superseded, false) = false
     for update;
    if not found then continue; end if;

    v_q := least(coalesce((v_row->>'qty')::int, 0), coalesce(v_pl.qty, 0));
    if v_q <= 0 then continue; end if;
    v_base := greatest(v_pl.due_date, public.app_today());

    insert into public.placements (
      id, job_id, equipment_type_id, qty, days, placed_date, due_date,
      picked_up, picked_up_at, picked_up_by, ext_of, superseded, superseded_at,
      technician_id, complex_id, counterparty_id, unit_number)
    values (
      gen_random_uuid(), v_pl.job_id, v_pl.equipment_type_id, v_q, v_req.days,
      v_base, v_base + v_req.days,
      false, null, null, v_pl.id, false, null,
      v_pl.technician_id, v_pl.complex_id, v_pl.counterparty_id, v_pl.unit_number);

    if v_q >= coalesce(v_pl.qty, 0) then
      update public.placements
         set superseded = true, superseded_at = now() where id = v_pl.id;
    else
      update public.placements set qty = v_pl.qty - v_q where id = v_pl.id;
    end if;
    v_made := v_made + v_q;
  end loop;

  update public.ext_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id;

  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name,''), 'ext_request_approved', 'job', v_req.job_id::text,
          jsonb_build_object('unit', v_req.unit, 'days', v_req.days, 'qty', v_made, 'eq', v_req.eq));
  if v_made > 0 then
    insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
    values (auth.uid(), coalesce(v_name,''), 'extension_create', 'job', v_req.job_id::text,
            jsonb_build_object('unit', v_req.unit, 'days', v_req.days, 'qty', v_made));
  end if;
end $$;

create or replace function public.stock_counts()
returns table (equipment_type_id uuid, total int, free int, rented int,
               pending int, with_tech int, broken int, in_repair int)
language sql stable security definer set search_path = public as $$
  with pl as (
    select p.equipment_type_id as et,
           sum(case when not p.picked_up and not p.superseded
                     and p.due_date >  public.app_today() then p.qty else 0 end)::int as rented,
           sum(case when not p.picked_up and not p.superseded
                     and p.due_date <= public.app_today() then p.qty else 0 end)::int as pending
      from public.placements p
     group by p.equipment_type_id),
  em as (
    select m.equipment_type_id as et,
           sum(case when m.to_loc = 'stock'  then m.qty when m.from_loc = 'stock'  then -m.qty else 0 end)::int as st,
           sum(case when m.to_loc = 'car'    then m.qty when m.from_loc = 'car'    then -m.qty else 0 end)::int as car,
           sum(case when m.to_loc = 'repair' then m.qty when m.from_loc = 'repair' then -m.qty else 0 end)::int as rep
      from public.equip_moves m
     group by m.equipment_type_id)
  select e.id,
         coalesce(em.st, 0) + coalesce(em.car, 0) + coalesce(em.rep, 0)
           + coalesce(pl.rented, 0) + coalesce(pl.pending, 0),
         coalesce(em.st, 0),
         coalesce(pl.rented, 0),
         coalesce(pl.pending, 0),
         coalesce(em.car, 0),
         0,
         coalesce(em.rep, 0)
    from public.equipment_types e
    left join em on em.et = e.id
    left join pl on pl.et = e.id;
$$;

create or replace function public.tv_feed(p_key text, p_date date default public.app_today())
returns json language plpgsql security definer set search_path = public as $$
declare sid uuid; wk date := p_date - 6;
begin
  select id into sid from tv_sessions where device_key = p_key and status = 'approved';
  if sid is null then raise exception 'TV_FORBIDDEN'; end if;
  update tv_sessions set last_seen_at = now() where id = sid;
  return json_build_object(
    'date', p_date,
    'tv',   (select tv from org_settings where id = 'org'),
    'work_types', (select coalesce(json_agg(json_build_object(
        'id', id, 'name', name, 'color', color) order by name), '[]'::json) from work_types),
    'equipment_types', (select coalesce(json_agg(json_build_object(
        'id', id, 'abbr', abbr, 'name', name, 'color', color) order by abbr), '[]'::json) from equipment_types),
    'complexes', (select coalesce(json_agg(json_build_object(
        'id', id, 'name', name, 'abbr', abbr, 'lat', lat, 'lng', lng)), '[]'::json) from complexes),
    'profiles', (select coalesce(json_agg(json_build_object(
        'id', id, 'name', display_name, 'car_no', car_no, 'role', role)
        order by coalesce(car_no, 999), display_name), '[]'::json)
        from profiles where blocked is not true),
    'jobs', (select coalesce(json_agg(json_build_object(
        'id', j.id, 'unit', j.unit_number, 'complex_id', j.complex_id,
        'work_type_id', j.work_type_id, 'technician_id', j.technician_id,
        'status', j.status, 'priority', j.priority, 'sort_order', j.sort_order,
        'done', (j.status in ('done', 'approved'))) order by j.sort_order, j.created_at), '[]'::json)
        from jobs j where j.date = p_date and j.archived_at is null),
    'pickups', (select coalesce(json_agg(json_build_object(
        'job_id', p.job_id, 'complex_id', p.complex_id, 'unit', p.unit_number,
        'technician_id', p.technician_id, 'equipment_type_id', p.equipment_type_id,
        'qty', p.qty, 'due_date', p.due_date, 'overdue', (p.due_date < p_date))), '[]'::json)
        from placements p join jobs j2 on j2.id = p.job_id and j2.archived_at is null
        where p.picked_up is not true and p.superseded is not true and p.due_date <= p_date),
    'picked_today', (select coalesce(json_agg(distinct jsonb_build_object(
        'job_id', p.job_id, 'complex_id', p.complex_id, 'unit', p.unit_number))::json, '[]'::json)
        from placements p
        where p.picked_up is true and p.superseded is not true
          and p.picked_up_at >= p_date::timestamptz
          and p.picked_up_at <  (p_date + 1)::timestamptz),
    'site_now', (select coalesce(json_agg(json_build_object(
        'driver_id', v.driver_id, 'complex_id', v.complex_id)), '[]'::json)
        from site_visits v where v.date = p_date and v.left_at is null),
    'site_day', (select coalesce(json_agg(json_build_object(                   -- v1.09.38: визиты дня — этапы водителей
        'driver_id', v.driver_id, 'complex_id', v.complex_id, 'arrived_at', v.arrived_at, 'left_at', v.left_at) order by v.arrived_at), '[]'::json)
        from site_visits v where v.date = p_date),
    'office', (select case when office_lat is not null and office_lng is not null
        then json_build_object('lat', office_lat, 'lng', office_lng, 'addr', coalesce(office_addr, '')) end from org_settings where id = 'org'),
    'stat_day', (select coalesce(json_agg(json_build_object('id', q.id, 'n', q.n)), '[]'::json)
        from (select technician_id as id, count(*)::int as n from jobs
              where date = p_date and status in ('done', 'approved') and archived_at is null
              group by technician_id) q),
    'stat_week', (select coalesce(json_agg(json_build_object('id', q.id, 'n', q.n)), '[]'::json)
        from (select technician_id as id, count(*)::int as n from jobs
              where date between wk and p_date and status in ('done', 'approved') and archived_at is null
              group by technician_id) q));
end $$;

-- ---------------------------------------------------------------------
-- 2. Рабочее время для пушей
--    profiles.push_prefs.work = {"on": true, "days": [1,2,3,4,5], "from": "08:00", "to": "18:00"}  (ISO: 1 = пн)
-- ---------------------------------------------------------------------
alter table public.push_queue add column if not exists hold_until timestamptz;
create index if not exists push_queue_hold_ix on public.push_queue(hold_until) where sent_at is null and hold_until is not null;

-- null — сейчас рабочее время (или правило выключено); иначе — начало ближайшего рабочего окна
create or replace function public.push_hold_calc(p_prefs jsonb, p_at timestamptz default now())
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare w jsonb := coalesce(p_prefs, '{}'::jsonb)->'work'; v_tz text := public.app_tz(); v_from time; v_to time; v_days int[];
        v_loc timestamp; d date; i int; s timestamptz; e timestamptz;
begin
  if w is null or jsonb_typeof(w) <> 'object' or coalesce((w->>'on')::boolean, false) = false then return null; end if;
  begin v_from := (w->>'from')::time; v_to := (w->>'to')::time; exception when others then return null; end;
  if v_from is null or v_to is null or v_from = v_to then return null; end if;
  select array_agg(x::int) into v_days
    from jsonb_array_elements_text(case when jsonb_typeof(w->'days') = 'array' then w->'days' else '[1,2,3,4,5]'::jsonb end) x
   where x ~ '^[1-7]$';
  if v_days is null or cardinality(v_days) = 0 then return null; end if;
  v_loc := p_at at time zone v_tz;
  for i in -1..8 loop
    d := v_loc::date + i;
    if extract(isodow from d)::int = any(v_days) then
      s := (d + v_from) at time zone v_tz;
      e := (case when v_to > v_from then d + v_to else d + 1 + v_to end) at time zone v_tz;   -- ночная смена — через полночь
      if p_at >= s and p_at < e then return null; end if;
      if s > p_at then return s; end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.push_hold_calc(jsonb, timestamptz) from public, anon;
grant execute on function public.push_hold_calc(jsonb, timestamptz) to authenticated, service_role;

create or replace function public.push_hold_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefs jsonb;
begin
  if new.kind = 'test' or new.hold_until is not null then return new; end if;   -- проверка доставки приходит всегда
  select push_prefs into v_prefs from public.profiles where id = new.user_id;
  new.hold_until := public.push_hold_calc(v_prefs, now());
  return new;
end $$;
drop trigger if exists push_hold_tg on public.push_queue;
create trigger push_hold_tg before insert on public.push_queue for each row execute function public.push_hold_tg_fn();

-- человек поменял рабочее время — отложенные ему пуши пересчитываются (стало рабочим — уйдут на ближайшей минуте)
create or replace function public.profiles_work_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.push_queue set hold_until = public.push_hold_calc(new.push_prefs, now())
   where user_id = new.id and sent_at is null and kind <> 'test';
  return null;
end $$;
drop trigger if exists profiles_work_tg on public.profiles;
create trigger profiles_work_tg after update of push_prefs on public.profiles for each row
  when ((new.push_prefs->'work') is distinct from (old.push_prefs->'work')) execute function public.profiles_work_tg_fn();

-- разбор очереди не трогает строки, чьё время ещё не пришло
create or replace function public.push_claim(p_limit int)
returns setof public.push_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.push_queue q set claimed_at = now()
   where q.id in (select id from public.push_queue
                   where sent_at is null and tries < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
                     and (hold_until is null or hold_until <= now())
                   order by created_at limit greatest(1, least(coalesce(p_limit, 200), 500)) for update skip locked)
  returning q.*;
end $$;
revoke all on function public.push_claim(int) from public, anon, authenticated;
grant execute on function public.push_claim(int) to service_role;

-- минутный «тик» расписания: функцию push зовём только когда есть созревшие отложенные пуши, пора утренней сводки
-- (по местному времени фирмы, не по UTC — летом и зимой одинаково) или раз в 5 минут для страховки, как раньше
create or replace function public.push_cron_tick()
returns text language plpgsql security definer set search_path = public as $$
declare v_url text; v_key text; v_cron text; v_due boolean; v_loc timestamp := now() at time zone public.app_tz();
        v_mday text; v_hm text; v_morning boolean; v_every5 boolean := (extract(minute from v_loc)::int % 5 = 0);
begin
  select value into v_url  from public.app_secrets where key = 'push_fn_url';
  select value into v_key  from public.app_secrets where key = 'push_fn_key';
  select value into v_cron from public.app_secrets where key = 'push_cron_key';
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' or coalesce(v_cron, '') = '' then return 'no_cfg'; end if;
  select exists(select 1 from public.push_queue where sent_at is null and tries < 5 and hold_until is not null and hold_until <= now()
                  and (claimed_at is null or claimed_at < now() - interval '2 minutes')) into v_due;
  select value into v_mday from public.app_secrets where key = 'push_morning_day';
  select coalesce(nullif(push_morning_hm, ''), '07:30') into v_hm from public.org_settings where id = 'org';
  v_morning := v_every5 and v_loc::time >= coalesce(v_hm, '07:30')::time and coalesce(v_mday, '') <> to_char(v_loc::date, 'YYYY-MM-DD');
  if not (v_due or v_morning or v_every5) then return 'idle'; end if;
  begin
    perform net.http_post(url := v_url || '?send=1' || case when v_morning then '&morning=1' else '' end,
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key, 'x-cron-key', v_cron)
                 || case when v_key like 'eyJ%' then jsonb_build_object('Authorization', 'Bearer ' || v_key) else '{}'::jsonb end,
      body := '{}'::jsonb, timeout_milliseconds := 10000);
  exception when others then return 'no_net: ' || sqlerrm; end;
  return case when v_morning then 'morning' when v_due then 'due' else 'insurance' end;
end $$;
revoke all on function public.push_cron_tick() from public, anon, authenticated;

-- расписание: вместо «утро 11:30 UTC» и «очередь раз в 5 минут» — один минутный тик (если pg_cron включён push-setup.sql)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('techlog-push-morning'); exception when others then null; end;
    begin perform cron.unschedule('techlog-push-queue');   exception when others then null; end;
    perform cron.schedule('techlog-push-queue', '* * * * *', 'select public.push_cron_tick()');
    raise notice 'TechLog: расписание пушей — минутный тик push_cron_tick()';
  else
    raise notice 'TechLog: pg_cron не включён — выполните push-setup.sql (он поставит минутный тик)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. ТО машин и заметки по машине
-- ---------------------------------------------------------------------
create table if not exists public.maint_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  interval_mi int  not null default 5000 check (interval_mi between 100 and 200000),
  remind_mi   int  not null default 500  check (remind_mi between 0 and 50000),
  sort        int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists public.vehicle_maint (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  type_id     uuid not null references public.maint_types(id) on delete cascade,
  last_mi     numeric check (last_mi is null or last_mi >= 0),   -- пробег, на котором было последнее ТО этого вида
  own_on      boolean not null default false,                    -- свой интервал для этой машины
  own_mi      int check (own_mi is null or own_mi between 100 and 200000),
  notified_mi numeric,                                           -- для какого «следующего ТО» уже ушёл пуш
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint vehicle_maint_ux unique (vehicle_id, type_id)
);
create table if not exists public.vehicle_notes (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  body        text not null check (char_length(body) between 1 and 2000),
  odo         numeric,
  created_at  timestamptz not null default now()
);
create index if not exists vehicle_notes_v_ix on public.vehicle_notes(vehicle_id, created_at desc);
grant select, insert, update, delete on public.maint_types, public.vehicle_maint, public.vehicle_notes to authenticated;

alter table public.maint_types   enable row level security;
alter table public.vehicle_maint enable row level security;
alter table public.vehicle_notes enable row level security;
drop policy if exists maint_types_sel on public.maint_types;
create policy maint_types_sel on public.maint_types for select to authenticated using (true);
drop policy if exists maint_types_wr on public.maint_types;
create policy maint_types_wr on public.maint_types for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
drop policy if exists vehicle_maint_sel on public.vehicle_maint;
create policy vehicle_maint_sel on public.vehicle_maint for select to authenticated using (true);
drop policy if exists vehicle_maint_wr on public.vehicle_maint;
create policy vehicle_maint_wr on public.vehicle_maint for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
-- заметки: сотрудник видит свои, админ и менеджер — все; пишет закреплённый водитель, админ, менеджер; история не правится, удаляет только админ
drop policy if exists vehicle_notes_sel on public.vehicle_notes;
create policy vehicle_notes_sel on public.vehicle_notes for select to authenticated
  using (author_id = auth.uid() or public.my_role() in ('admin', 'manager'));
drop policy if exists vehicle_notes_ins on public.vehicle_notes;
create policy vehicle_notes_ins on public.vehicle_notes for insert to authenticated
  with check (author_id = auth.uid() and (public.my_role() in ('admin', 'manager')
              or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.driver_id = auth.uid())));
drop policy if exists vehicle_notes_del on public.vehicle_notes;
create policy vehicle_notes_del on public.vehicle_notes for delete to authenticated using (public.my_role() = 'admin');

-- пуш «Пора на ТО»: водителю машины и тем, кому положены сервисные уведомления (админ по умолчанию)
create or replace function public.veh_maint_check(p_vid uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v record; m record; v_next numeric; v_int int; n int := 0; r record;
begin
  select * into v from public.vehicles where id = p_vid;
  if not found or v.last_odo is null then return 0; end if;
  for m in select vm.vehicle_id, vm.type_id, vm.last_mi, vm.own_on, vm.own_mi, vm.notified_mi, mt.name, mt.interval_mi, mt.remind_mi
             from public.vehicle_maint vm join public.maint_types mt on mt.id = vm.type_id
            where vm.vehicle_id = p_vid and mt.active and vm.last_mi is not null loop
    v_int := case when m.own_on and m.own_mi is not null then m.own_mi else m.interval_mi end;
    v_next := m.last_mi + v_int;
    if v.last_odo >= v_next - m.remind_mi and m.notified_mi is distinct from v_next then
      perform set_config('techlog.vm_sys', '1', true);           -- отметку пишет сервер: страж её пропускает, повторной проверки нет
      update public.vehicle_maint set notified_mi = v_next where vehicle_id = m.vehicle_id and type_id = m.type_id;
      perform set_config('techlog.vm_sys', '', true);
      for r in select id from public.profiles p
                where not p.blocked and (p.id = v.driver_id or p.bn_service is true or (p.bn_service is null and p.role = 'admin')) loop
        perform public.push_enqueue(r.id, 'bn_service', 'Пора на ТО: ' || m.name,
          '№' || coalesce(v.car_no::text, '·') || ' · ' || coalesce(v.make, '') || ' · пробег ' || round(v.last_odo)
          || ' mi · ТО на ' || round(v_next) || ' mi', './?mycar=1');
      end loop;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.veh_maint_check(uuid) from public, anon, authenticated;

create or replace function public.vehicles_maint_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return null; end if;
  perform public.veh_maint_check(new.id);
  return null;
end $$;
drop trigger if exists vehicles_maint_tg on public.vehicles;
create trigger vehicles_maint_tg after update of last_odo on public.vehicles for each row
  when (new.last_odo is distinct from old.last_odo) execute function public.vehicles_maint_tg_fn();

-- отметку «пуш ушёл» пишет только сервер: правка ТО её сбрасывает, остальное — сохраняет
create or replace function public.vehicle_maint_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.vm_sys', true) = '1' then return new; end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then new.notified_mi := null; new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end if;
  if new.last_mi is distinct from old.last_mi or new.own_on is distinct from old.own_on or new.own_mi is distinct from old.own_mi then
    new.notified_mi := null;
  else
    new.notified_mi := old.notified_mi;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists vehicle_maint_guard_tg on public.vehicle_maint;
create trigger vehicle_maint_guard_tg before insert or update on public.vehicle_maint for each row execute function public.vehicle_maint_guard();
create or replace function public.vehicle_maint_after_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('techlog.restore', true) = '1' then return null; end if;
  perform public.veh_maint_check(new.vehicle_id);
  return null;
end $$;
drop trigger if exists vehicle_maint_after_tg on public.vehicle_maint;
create trigger vehicle_maint_after_tg after insert or update of last_mi, own_on, own_mi on public.vehicle_maint for each row execute function public.vehicle_maint_after_fn();

-- перенос старого «ТО на пробеге» (vehicles.service_due_mi): один вид «Замена масла» 5000 / 500, последнее ТО = старый
-- пробег ТО − 5000 (следующее выходит ровно прежним). Только при первом запуске, пока справочник пуст. Старое поле
-- очищается — иначе функция bouncie прислала бы второй, старый пуш о том же ТО.
do $$ declare v_t uuid;
begin
  if not exists (select 1 from public.maint_types) then
    insert into public.maint_types(name, interval_mi, remind_mi, sort) values ('Замена масла / Oil change', 5000, 500, 1) returning id into v_t;
    insert into public.vehicle_maint(vehicle_id, type_id, last_mi)
      select id, v_t, service_due_mi - 5000 from public.vehicles where service_due_mi is not null and service_due_mi > 5000
      on conflict (vehicle_id, type_id) do nothing;
    update public.vehicle_maint vm set notified_mi = vm.last_mi + 5000
      from public.vehicles v where v.id = vm.vehicle_id and vm.type_id = v_t and v.service_notified;
    update public.vehicles set service_due_mi = null, service_notified = false where service_due_mi is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Инвойс на Google Диске: какая сумма лежит на Диске (для правила «цена изменилась при апруве — прежний PDF в архив»)
-- ---------------------------------------------------------------------
create table if not exists public.inv_drive (
  job_id   uuid primary key references public.jobs(id) on delete cascade,
  total    numeric,
  approved boolean not null default false,
  at       timestamptz not null default now(),
  by       uuid default auth.uid()
);
grant select, insert, update, delete on public.inv_drive to authenticated;
alter table public.inv_drive enable row level security;
drop policy if exists inv_drive_sel on public.inv_drive;
create policy inv_drive_sel on public.inv_drive for select to authenticated using (exists (select 1 from public.jobs j where j.id = job_id));
drop policy if exists inv_drive_ins on public.inv_drive;
create policy inv_drive_ins on public.inv_drive for insert to authenticated with check (exists (select 1 from public.jobs j where j.id = job_id));
drop policy if exists inv_drive_upd on public.inv_drive;
create policy inv_drive_upd on public.inv_drive for update to authenticated using (exists (select 1 from public.jobs j where j.id = job_id))
  with check (exists (select 1 from public.jobs j where j.id = job_id));

-- ---------------------------------------------------------------------
-- проверка
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='org_settings' and column_name='tz') then miss := miss || ' org_settings.tz'; end if;
  if to_regprocedure('public.app_today()') is null then miss := miss || ' app_today'; end if;
  if position('app_today' in pg_get_functiondef('public.jobs_lock_guard()'::regprocedure)) = 0 then miss := miss || ' jobs_lock_guard(пояс)'; end if;
  if position('hold_until' in pg_get_functiondef('public.push_claim(int)'::regprocedure)) = 0 then miss := miss || ' push_claim(рабочее время)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'push_hold_tg') then miss := miss || ' push_hold_tg'; end if;
  if to_regclass('public.maint_types') is null then miss := miss || ' maint_types'; end if;
  if to_regclass('public.vehicle_maint') is null then miss := miss || ' vehicle_maint'; end if;
  if to_regclass('public.vehicle_notes') is null then miss := miss || ' vehicle_notes'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'vehicles_maint_tg') then miss := miss || ' vehicles_maint_tg'; end if;
  if to_regclass('public.inv_drive') is null then miss := miss || ' inv_drive'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.38 применено — всё на месте. Пояс фирмы: %, сегодня: %', public.app_tz(), public.app_today(); end if;
end $$;

select 'TechLog v1.09.38 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
