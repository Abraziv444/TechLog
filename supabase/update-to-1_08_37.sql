-- =====================================================================
-- TechLog · update-to-1_08_37.sql — РЕЖИМ ТЕЛЕВИЗОРА
-- ---------------------------------------------------------------------
-- Что добавляется:
--   1) Таблица public.tv_sessions — сессии телевизоров. Телевизор при
--      нажатии «Режим телевизора» создаёт запись (pending) и показывает
--      4-значный код; админ в Настройках → «ТВ-экраны» сверяет код и
--      жмёт «Авторизовать ТВ» (approved) либо «Отклонить» / «Отозвать»
--      (revoked). Прямого доступа к таблице ни у кого нет (RLS включён,
--      политик нет) — вся работа идёт через RPC ниже.
--   2) org_settings.tv (text, JSON) — раскладка ТВ-режима из карточки
--      «Режим телевизора» в админке (чекбоксы, степперы, конструктор).
--   3) RPC:
--        tv_request(agent)        — anon: создать pending-сессию, вернуть
--                                   {key, code}; старые pending чистятся,
--                                   от спама — потолок 20 ожидающих;
--        tv_poll(key)             — anon: статус сессии + heartbeat;
--        tv_feed(key, date)       — anon: весь набор данных для экрана
--                                   (работы дня, пикапы, комплексы,
--                                   сотрудники, статистика день/неделя,
--                                   «на объекте» из site_visits, раскладка);
--                                   только для approved-сессии;
--        tv_list()                — админ: список сессий для карточки;
--        tv_decide(id, approve)   — админ: авторизовать / отозвать.
-- Скрипт идемпотентен: безопасен для повторного запуска.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Таблица сессий
-- ---------------------------------------------------------------------
create table if not exists public.tv_sessions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  device_key   text not null unique,
  agent        text not null default '',
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  approved_by  uuid,
  approved_at  timestamptz,
  last_seen_at timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tv_sessions_status_chk') then
    alter table public.tv_sessions
      add constraint tv_sessions_status_chk check (status in ('pending','approved','revoked'));
  end if;
end $$;
alter table public.tv_sessions enable row level security;
-- политик нет намеренно: чтение и запись только через SECURITY DEFINER RPC

-- ---------------------------------------------------------------------
-- 2. Раскладка ТВ-режима в настройках организации
-- ---------------------------------------------------------------------
alter table public.org_settings add column if not exists tv text;

-- ---------------------------------------------------------------------
-- 3. RPC
-- ---------------------------------------------------------------------
-- Телевизор просит сессию. Ключ — 64 hex-символа (без pgcrypto, чтобы не
-- зависеть от схемы extensions), код — 4 символа без похожих букв.
create or replace function public.tv_request(p_agent text default '')
returns json language plpgsql security definer set search_path = public as $$
declare
  k text; c text := ''; i int; cnt int;
  ab constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  delete from tv_sessions where status = 'pending' and created_at < now() - interval '20 minutes';
  select count(*) into cnt from tv_sessions where status = 'pending';
  if cnt >= 20 then raise exception 'TV_BUSY'; end if;
  k := md5(random()::text || clock_timestamp()::text) || md5(random()::text || now()::text);
  for i in 1..4 loop
    c := c || substr(ab, 1 + floor(random() * length(ab))::int, 1);
  end loop;
  insert into tv_sessions (code, device_key, agent)
  values (c, k, left(coalesce(p_agent, ''), 120));
  return json_build_object('key', k, 'code', c);
end $$;
revoke all on function public.tv_request(text) from public;
grant execute on function public.tv_request(text) to anon, authenticated;

-- Статус сессии + heartbeat (карточка админа показывает «онлайн»)
create or replace function public.tv_poll(p_key text)
returns json language plpgsql security definer set search_path = public as $$
declare st text;
begin
  update tv_sessions set last_seen_at = now()
    where device_key = p_key returning status into st;
  if st is null then return json_build_object('status', 'unknown'); end if;
  return json_build_object('status', st);
end $$;
revoke all on function public.tv_poll(text) from public;
grant execute on function public.tv_poll(text) to anon, authenticated;

-- Данные для экрана. Дату телевизор передаёт свою (часовой пояс ТВ),
-- неделя = дата-6 … дата. Только для авторизованной сессии.
create or replace function public.tv_feed(p_key text, p_date date default current_date)
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
    'stat_day', (select coalesce(json_agg(json_build_object('id', q.id, 'n', q.n)), '[]'::json)
        from (select technician_id as id, count(*)::int as n from jobs
              where date = p_date and status in ('done', 'approved') and archived_at is null
              group by technician_id) q),
    'stat_week', (select coalesce(json_agg(json_build_object('id', q.id, 'n', q.n)), '[]'::json)
        from (select technician_id as id, count(*)::int as n from jobs
              where date between wk and p_date and status in ('done', 'approved') and archived_at is null
              group by technician_id) q));
end $$;
revoke all on function public.tv_feed(text, date) from public;
grant execute on function public.tv_feed(text, date) to anon, authenticated;

-- Список сессий для карточки «ТВ-экраны» (только админ)
create or replace function public.tv_list()
returns json language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id', s.id, 'code', s.code, 'agent', s.agent, 'status', s.status,
      'created_at', s.created_at, 'approved_at', s.approved_at,
      'last_seen_at', s.last_seen_at)
      order by (s.status = 'pending') desc, s.created_at desc), '[]'::json)
    from (select * from tv_sessions order by (status = 'pending') desc, created_at desc limit 30) s);
end $$;
revoke all on function public.tv_list() from public, anon;
grant execute on function public.tv_list() to authenticated;

-- «Авторизовать ТВ» / «Отклонить» / «Отозвать» (только админ)
create or replace function public.tv_decide(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_approve then
    update tv_sessions set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id;
  else
    update tv_sessions set status = 'revoked' where id = p_id;
  end if;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.tv_decide(uuid, boolean) from public, anon;
grant execute on function public.tv_decide(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Самопроверка
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if to_regclass('public.tv_sessions') is null then miss := miss || ' tv_sessions'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'org_settings' and column_name = 'tv')
     then miss := miss || ' org_settings.tv'; end if;
  if to_regprocedure('public.tv_request(text)') is null then miss := miss || ' tv_request()'; end if;
  if to_regprocedure('public.tv_poll(text)') is null then miss := miss || ' tv_poll()'; end if;
  if to_regprocedure('public.tv_feed(text,date)') is null then miss := miss || ' tv_feed()'; end if;
  if to_regprocedure('public.tv_list()') is null then miss := miss || ' tv_list()'; end if;
  if to_regprocedure('public.tv_decide(uuid,boolean)') is null then miss := miss || ' tv_decide()'; end if;
  if miss <> '' then
    raise exception 'TechLog 1.08.37: не хватает —%', miss;
  else
    raise notice 'TechLog: обновление 1.08.37 применено — режим телевизора готов (сессии, авторизация, фид).';
  end if;
end $$;
