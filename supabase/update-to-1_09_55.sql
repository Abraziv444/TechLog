-- =====================================================================
-- TechLog · update-to-1_09_55.sql  (после 1.09.53; идемпотентно — можно запускать повторно)
--  1) ХАРАКТЕРИСТИКИ АПАРТАМЕНТОВ: список характеристик — org_settings.cx_attrs (jsonb: [{id, name, kind:
--     text|check|choice, opts[], req, cp}]; пишет админ, как остальные настройки), значения — complexes.attrs
--     (jsonb: {<id>: значение}; пишут те, кто правит апарт-комплексы). Обе колонки попадают в SQL-бэкап сами
--     (org_settings и complexes уже в нём) — передеплой функции backup не нужен;
--  2) ПРЕДЫСТОРИЯ ЗАДАЧИ В ЮНИТЕ (без цен): org_settings.hist_on / hist_days (7…365, по умолчанию 60) и функция
--     job_history(p_job) — прежние документы того же вида работ в том же юните (комплекс + номер юнита) за hist_days
--     дней до даты документа. Отдаёт только тому, кто сам видит p_job (can_view_job), только при включённой
--     настройке, не больше 5 документов; суммы (Other services, доп. работы, итог) сервер вырезает сам (fd_noprice);
--  3) ТЕЛЕВИЗОР: tv_feed дополнительно отдаёт статистику по сотрудникам для карусели — stat_month (выполнено с 1-го
--     числа), emp_wt (выполнено по видам работ за 7 дней и за месяц), emp_pk (пикапы за 7 дней и месяц — по тому,
--     кто забрал), emp_mi (мили по bn_trips за 7 дней и месяц). Прежние ключи ответа не меняются.
--  Edge Functions не меняются.
-- =====================================================================

-- ▄▄▄▄▄▄▄▄▄▄ 1. ХАРАКТЕРИСТИКИ АПАРТАМЕНТОВ ▄▄▄▄▄▄▄▄▄▄
alter table public.org_settings add column if not exists cx_attrs jsonb not null default '[]'::jsonb;
alter table public.complexes   add column if not exists attrs    jsonb not null default '{}'::jsonb;

-- ▄▄▄▄▄▄▄▄▄▄ 2. ПРЕДЫСТОРИЯ ЗАДАЧИ В ЮНИТЕ ▄▄▄▄▄▄▄▄▄▄
alter table public.org_settings add column if not exists hist_on   boolean not null default false;
alter table public.org_settings add column if not exists hist_days int     not null default 60;
alter table public.org_settings drop constraint if exists org_settings_hist_days_chk;
alter table public.org_settings add constraint org_settings_hist_days_chk check (hist_days between 7 and 365);

-- номер юнита для сравнения: «U214», «Unit 214», «#214», « 214 » → «214»
create or replace function public.unit_key(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(lower(coalesce(p, '')), '^\s*(unit|u|#|№)\s*', ''), '[^a-z0-9а-яё]', '', 'g')
$$;

-- form_data без денег: суммы строк Other services и цены доп. работ убираются
create or replace function public.fd_noprice(fd jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case when fd is null or jsonb_typeof(fd) <> 'object' then '{}'::jsonb else
    fd
    || jsonb_build_object('others', coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'amount' - 'price' - 'total' else e end)
                                              from jsonb_array_elements(case when jsonb_typeof(fd->'others') = 'array' then fd->'others' else '[]'::jsonb end) e), '[]'::jsonb))
    || jsonb_build_object('extra',  coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'object' then e - 'price' - 'amount' - 'total' else e end)
                                              from jsonb_array_elements(case when jsonb_typeof(fd->'extra') = 'array' then fd->'extra' else '[]'::jsonb end) e), '[]'::jsonb))
  end
$$;

create or replace function public.job_history(p_job uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare j public.jobs%rowtype; v_on boolean; v_days int; v_unit text;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and blocked is true) then
    raise exception 'FORBIDDEN';
  end if;
  select * into j from public.jobs where id = p_job;
  if not found then return '[]'::json; end if;
  if not public.can_view_job(p_job) then raise exception 'FORBIDDEN'; end if;
  select coalesce(hist_on, false), coalesce(hist_days, 60) into v_on, v_days from public.org_settings where id = 'org';
  if not coalesce(v_on, false) then return '[]'::json; end if;
  v_unit := public.unit_key(j.unit_number);
  if j.complex_id is null or j.work_type_id is null or v_unit = '' then return '[]'::json; end if;
  return coalesce((select json_agg(x) from (
    select h.id, h.date, h.status, h.no, h.doc_no, h.unit_number as unit, h.work_type_id,
           h.technician_id, coalesce(nullif(p.display_name, ''), h.technician_name, '') as tech_name,
           (select coalesce(json_agg(pp.display_name order by pp.display_name), '[]'::json)
              from public.profiles pp where coalesce(h.helper_ids, '[]'::jsonb) ? pp.id::text) as helpers,
           h.note, public.fd_noprice(h.form_data) as form_data,
           (select count(*) from public.media m where m.job_id = h.id and m.kind = 'photo')::int as photos,
           (select count(*) from public.media m where m.job_id = h.id and m.kind = 'video')::int as videos
      from public.jobs h
      left join public.profiles p on p.id = h.technician_id
     where h.id <> j.id and h.archived_at is null
       and h.complex_id = j.complex_id and h.work_type_id = j.work_type_id
       and public.unit_key(h.unit_number) = v_unit
       and h.date between j.date - v_days and j.date
       and (h.date < j.date or h.created_at < j.created_at)
     order by h.date desc, h.created_at desc
     limit 5) x), '[]'::json);
end $$;
revoke all on function public.job_history(uuid) from public, anon;
grant execute on function public.job_history(uuid) to authenticated;

-- ▄▄▄▄▄▄▄▄▄▄ 3. ТЕЛЕВИЗОР: статистика по сотрудникам для карусели ▄▄▄▄▄▄▄▄▄▄
create or replace function public.tv_feed(p_key text, p_date date default public.app_today())
returns json language plpgsql security definer set search_path = public as $$
declare sid uuid; wk date := p_date - 6; ms date := date_trunc('month', p_date)::date; lo date;
        tz text := public.app_tz();
begin
  select id into sid from tv_sessions where device_key = p_key and status = 'approved';
  if sid is null then raise exception 'TV_FORBIDDEN'; end if;
  update tv_sessions set last_seen_at = now() where id = sid;
  lo := least(wk, ms);
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
              group by technician_id) q),
    -- v1.09.55: карусель сотрудников — месяц, виды работ, пикапы и мили
    'stat_month', (select coalesce(json_agg(json_build_object('id', q.id, 'n', q.n)), '[]'::json)
        from (select technician_id as id, count(*)::int as n from jobs
              where date between ms and p_date and status in ('done', 'approved') and archived_at is null
              group by technician_id) q),
    'emp_wt', (select coalesce(json_agg(json_build_object('id', q.id, 'wt', q.wt, 'w', q.w, 'm', q.m)), '[]'::json)
        from (select technician_id as id, work_type_id as wt,
                     (count(*) filter (where date >= wk))::int as w,
                     (count(*) filter (where date >= ms))::int as m
                from jobs
               where date between lo and p_date and status in ('done', 'approved') and archived_at is null
                 and technician_id is not null
               group by technician_id, work_type_id) q),
    'emp_pk', (select coalesce(json_agg(json_build_object('id', q.id, 'w', q.w, 'm', q.m)), '[]'::json)
        from (select coalesce(p.picked_up_by, p.technician_id) as id,
                     (count(distinct p.job_id) filter (where p.picked_up_at >= (wk::timestamp at time zone tz)))::int as w,
                     (count(distinct p.job_id) filter (where p.picked_up_at >= (ms::timestamp at time zone tz)))::int as m
                from placements p
               where p.picked_up is true and p.superseded is not true
                 and p.picked_up_at >= (lo::timestamp at time zone tz)
                 and p.picked_up_at <  ((p_date + 1)::timestamp at time zone tz)
                 and coalesce(p.picked_up_by, p.technician_id) is not null
               group by coalesce(p.picked_up_by, p.technician_id)) q),
    'emp_mi', (select coalesce(json_agg(json_build_object('id', q.id, 'w', q.w, 'm', q.m)), '[]'::json)
        from (select t.driver_id as id,
                     round(coalesce(sum(t.mi) filter (where t.day >= wk), 0), 1) as w,
                     round(coalesce(sum(t.mi) filter (where t.day >= ms), 0), 1) as m
                from bn_trips t
               where t.day between lo and p_date and t.driver_id is not null
               group by t.driver_id) q));
end $$;
revoke all on function public.tv_feed(text, date) from public;
grant execute on function public.tv_feed(text, date) to anon, authenticated;

-- ▄▄▄▄▄▄▄▄▄▄ САМОПРОВЕРКА ▄▄▄▄▄▄▄▄▄▄
do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'org_settings' and column_name = 'cx_attrs') then miss := miss || ' org_settings.cx_attrs'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'complexes' and column_name = 'attrs') then miss := miss || ' complexes.attrs'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'org_settings' and column_name = 'hist_on') then miss := miss || ' org_settings.hist_on'; end if;
  if to_regprocedure('public.job_history(uuid)') is null then miss := miss || ' job_history'; end if;
  if has_function_privilege('anon', 'public.job_history(uuid)', 'execute') then miss := miss || ' job_history(ДОСТУПНА БЕЗ ВХОДА!)'; end if;
  if position('emp_wt' in pg_get_functiondef('public.tv_feed(text,date)'::regprocedure)) = 0 then miss := miss || ' tv_feed(emp_wt)'; end if;
  if public.unit_key(' Unit #214 ') <> '214' or public.unit_key('U214') <> '214' then miss := miss || ' unit_key'; end if;
  if public.fd_noprice('{"others":[{"desc":"x","amount":5}],"extra":[{"name":"y","price":9}]}'::jsonb)::text ~ '(amount|price)' then miss := miss || ' fd_noprice'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.55 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.55 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
