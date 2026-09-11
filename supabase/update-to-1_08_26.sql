-- ============================================================
-- TechLog · update to v1.08.26
-- СКЛАД: ВОЗВРАТ ОБОРУДОВАНИЯ И ЕЖЕДНЕВНЫЙ СНИМОК ОСТАТКОВ.
--   placements.returned_at / returned_by — «вернул на склад» отдельным
--     шагом после «забрал»: между ними оборудование лежит у сотрудника.
--   stock_daily — по строке на тип оборудования за день: свободно,
--     в аренде, ожидают вывоза, у сотрудников, поломано.
--   stock_snapshot() пишет снимок, stock_snapshot_due() решает, пора ли.
--   Расписание — pg_cron, ежечасно; функция сама смотрит, наступило ли
--     10:00 по местному времени и не записан ли день. Так снимок не
--     съезжает при переходе на летнее время.
-- Регистра накопления здесь нет: остатки считаются от документов.
-- Идемпотентно.
-- ============================================================

-- ---------------------------------------------------------------------
-- 1. Возврат на склад
-- ---------------------------------------------------------------------
alter table public.placements
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid references public.profiles(id) on delete set null;
create index if not exists placements_ret_idx on public.placements(returned_at);

-- ---------------------------------------------------------------------
-- 2. Когда снимать остатки
-- ---------------------------------------------------------------------
alter table public.org_settings
  add column if not exists snapshot_tz   text not null default 'America/New_York',
  add column if not exists snapshot_hour int  not null default 10;
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. История остатков. Пишет только функция снимка, читают все свои.
-- ---------------------------------------------------------------------
create table if not exists public.stock_daily (
  date              date not null,
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  total             int  not null default 0,
  free              int  not null default 0,
  rented            int  not null default 0,
  pending           int  not null default 0,
  with_tech         int  not null default 0,
  broken            int  not null default 0,
  in_repair         int  not null default 0,
  at                timestamptz not null default now(),
  primary key (date, equipment_type_id)
);
create index if not exists stock_daily_date_idx on public.stock_daily(date desc);

alter table public.stock_daily enable row level security;
drop policy if exists sd_sel on public.stock_daily;
create policy sd_sel on public.stock_daily for select to authenticated using (true);
-- политик на запись нет: строки кладёт только stock_snapshot() (security definer)

-- ---------------------------------------------------------------------
-- 4. Текущие остатки по типам. Считаются от документов:
--      в аренде       — стоит на объекте, срок ещё не вышел
--      ожидают вывоза — стоит на объекте, срок вышел или сегодня
--      у сотрудников  — забрано с объекта, но на склад ещё не сдано
--      свободно       — всё остальное из общего количества
-- ---------------------------------------------------------------------
create or replace function public.stock_counts()
returns table (equipment_type_id uuid, total int, free int, rented int,
               pending int, with_tech int, broken int, in_repair int)
language sql stable security definer set search_path = public as $$
  with pl as (
    select p.equipment_type_id as et,
           sum(case when not p.picked_up and not p.superseded
                     and p.due_date >  current_date then p.qty else 0 end)::int as rented,
           sum(case when not p.picked_up and not p.superseded
                     and p.due_date <= current_date then p.qty else 0 end)::int as pending,
           sum(case when p.picked_up and not p.superseded
                     and p.returned_at is null then p.qty else 0 end)::int as with_tech
      from public.placements p
     group by p.equipment_type_id)
  select e.id,
         coalesce(s.total, 0),
         coalesce(s.total, 0) - coalesce(pl.rented, 0) - coalesce(pl.pending, 0)
           - coalesce(pl.with_tech, 0) - coalesce(s.broken, 0) - coalesce(s.in_repair, 0),
         coalesce(pl.rented, 0), coalesce(pl.pending, 0), coalesce(pl.with_tech, 0),
         coalesce(s.broken, 0), coalesce(s.in_repair, 0)
    from public.equipment_types e
    left join public.equipment_stock s on s.equipment_type_id = e.id
    left join pl on pl.et = e.id;
$$;
revoke all on function public.stock_counts() from public, anon;
grant execute on function public.stock_counts() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Снимок за дату. Повторный вызов переписывает строку того же дня,
--    поэтому и cron, и приложение могут звать её сколько угодно раз.
-- ---------------------------------------------------------------------
create or replace function public.stock_snapshot(p_date date default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_tz text; v_date date; v_n int;
begin
  select coalesce(snapshot_tz, 'America/New_York') into v_tz
    from public.org_settings where id = 'org';
  v_date := coalesce(p_date, (now() at time zone coalesce(v_tz, 'America/New_York'))::date);

  insert into public.stock_daily
    (date, equipment_type_id, total, free, rented, pending, with_tech, broken, in_repair, at)
  select v_date, c.equipment_type_id, c.total, c.free, c.rented, c.pending,
         c.with_tech, c.broken, c.in_repair, now()
    from public.stock_counts() c
  on conflict (date, equipment_type_id) do update set
    total = excluded.total, free = excluded.free, rented = excluded.rented,
    pending = excluded.pending, with_tech = excluded.with_tech,
    broken = excluded.broken, in_repair = excluded.in_repair, at = now();
  get diagnostics v_n = row_count;

  delete from public.stock_daily where date < v_date - 400;   -- история за год с хвостом
  return v_n;
end $$;
revoke all on function public.stock_snapshot(date) from public, anon;
grant execute on function public.stock_snapshot(date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. «Пора ли писать»: местное время дошло до нужного часа, а строки за
--    сегодня ещё нет. Зовут и cron, и приложение — второй как подстраховка,
--    если pg_cron в проекте недоступен.
-- ---------------------------------------------------------------------
create or replace function public.stock_snapshot_due()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_tz text; v_hour int; v_loc timestamp; v_date date;
begin
  select coalesce(snapshot_tz, 'America/New_York'), coalesce(snapshot_hour, 10)
    into v_tz, v_hour from public.org_settings where id = 'org';
  v_tz := coalesce(v_tz, 'America/New_York'); v_hour := coalesce(v_hour, 10);
  v_loc := now() at time zone v_tz;
  v_date := v_loc::date;
  if extract(hour from v_loc) < v_hour then return false; end if;
  if exists (select 1 from public.stock_daily where date = v_date) then return false; end if;
  perform public.stock_snapshot(v_date);
  return true;
end $$;
revoke all on function public.stock_snapshot_due() from public, anon;
grant execute on function public.stock_snapshot_due() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Расписание. Если pg_cron в проекте не поднять — не беда: снимок
--    напишет приложение, когда склад откроют после назначенного часа.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create schema if not exists cron;
    create extension if not exists pg_cron with schema cron;
  exception when others then
    raise notice 'TechLog: pg_cron включить не удалось (%). Снимок будет писать приложение.', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('techlog-stock-daily');
    exception when others then null;
    end;
    begin
      perform cron.schedule('techlog-stock-daily', '7 * * * *',
                            'select public.stock_snapshot_due()');
      raise notice 'TechLog: снимок склада — задание cron поставлено, проверка каждый час.';
    exception when others then
      raise notice 'TechLog: задание cron не поставилось (%). Снимок будет писать приложение.', sqlerrm;
    end;
  end if;
end $$;

-- Первый снимок — сразу, чтобы график не пустовал до завтра.
select public.stock_snapshot();

-- ---------------------------------------------------------------------
-- 8. Самопроверка
-- ---------------------------------------------------------------------
do $$
declare miss text := '';
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='placements'
                   and column_name='returned_at') then miss := miss || ' placements.returned_at'; end if;
  if to_regclass('public.stock_daily') is null then miss := miss || ' stock_daily'; end if;
  if to_regprocedure('public.stock_counts()') is null then miss := miss || ' stock_counts()'; end if;
  if to_regprocedure('public.stock_snapshot(date)') is null then miss := miss || ' stock_snapshot()'; end if;
  if to_regprocedure('public.stock_snapshot_due()') is null then miss := miss || ' stock_snapshot_due()'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='org_settings'
                   and column_name='snapshot_hour') then miss := miss || ' org_settings.snapshot_hour'; end if;
  if miss <> '' then
    raise warning 'TechLog 1.08.26: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else
    raise notice 'TechLog 1.08.26: склад и ежедневный снимок на месте.';
  end if;
end $$;

select 'TechLog v1.08.26 — скрипт выполнен.' as result;
