-- =====================================================================
-- TechLog update-to-1_07_25 — «Доска», номер машины, права менеджера
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- =====================================================================

-- Галочка админа: менеджеру можно менять очерёдность задач (Доска и ▲▼)
alter table public.org_settings
  add column if not exists manager_can_reorder boolean not null default false;

-- Номер машины, закреплённой за сотрудником (бейдж в справочнике и на Доске)
alter table public.profiles
  add column if not exists car_no int;

-- ---------------------------------------------------------------------
-- profiles_guard v2: role / blocked / login / car_no меняет только админ.
-- (Замещает версию из security-hotfix-1_07_24.sql; если хотфикс ещё не
-- выполнялся — триггер будет создан здесь. Сам хотфикс всё равно выполните:
-- в нём анти-брутфорс и защита инвойсов.)
-- ---------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN_FIELD_ID';
  end if;
  if coalesce(public.my_role(), 'tech') <> 'admin' then
    if new.role       is distinct from old.role
       or new.blocked is distinct from old.blocked
       or new.login   is distinct from old.login
       or new.car_no  is distinct from old.car_no then
      raise exception 'FORBIDDEN_FIELD';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- RPC для Доски: менеджеру нельзя писать в jobs напрямую (RLS), а
-- расширять политику целиком опасно — он смог бы править суммы и составы.
-- Функция меняет РОВНО два поля: priority и sort_order.
--  • priority (красный треугольник) — менеджеру можно всегда;
--  • sort_order (очерёдность)       — только если админ включил галочку
--    org_settings.manager_can_reorder.
-- Смена приоритета фиксируется в журнале действий (пишет сервер).
-- ---------------------------------------------------------------------
create or replace function public.board_job_flags(
  p_job uuid, p_priority boolean default null, p_sort int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(public.my_role(), 'tech');
  v_unit text; v_name text;
begin
  if v_role not in ('admin','manager') then raise exception 'FORBIDDEN'; end if;
  if p_priority is null and p_sort is null then return; end if;
  if p_sort is not null and v_role = 'manager'
     and not coalesce((select manager_can_reorder
                       from public.org_settings where id = 'org'), false) then
    raise exception 'REORDER_OFF';
  end if;

  update public.jobs
     set priority   = coalesce(p_priority, priority),
         sort_order = coalesce(p_sort, sort_order),
         updated_at = now()
   where id = p_job
   returning unit_number into v_unit;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_priority is not null then
    select display_name into v_name from public.profiles where id = auth.uid();
    insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
    values (auth.uid(), coalesce(v_name, ''), 'priority_set', 'job', p_job::text,
            jsonb_build_object('on', p_priority, 'unit', coalesce(v_unit, '')));
  end if;
end $$;
revoke all on function public.board_job_flags(uuid, boolean, int) from public, anon;
grant execute on function public.board_job_flags(uuid, boolean, int) to authenticated;
