-- ============================================================
-- TechLog · update to v1.08.27
-- РЕГИСТР ОБОРУДОВАНИЯ: один журнал движений equip_moves.
--   Места: склад (stock) · машина сотрудника (car) · объект (site)
--   · ремонт (repair) · внешний мир (ext — поступление и списание).
--   Остатки склада, машин и ремонта — сумма журнала; «на объектах»
--   по-прежнему считается из placements (механика аренды не тронута).
--   Операции: поступление и списание (админ), взять со склада / сдать
--   на склад (техник, своя машина), в ремонт / из ремонта.
--   Аренда, «забрал» и «вернул на склад» пишут движения сами — триггером
--   на placements; для техников в этих сценариях ничего не меняется.
--   Ручные счётчики equipment_stock приложением больше не редактируются;
--   текущие остатки разово переносятся в журнал («начальный ввод»).
--   profiles.car_no: номер машины 1–99, уникальный.
-- Идемпотентно: безопасно запускать повторно.
-- ============================================================

-- ---------------------------------------------------------------------
-- 1) Номер машины: диапазон 1–99 и уникальность. Значения вне диапазона
--    и дубли (кроме самого раннего сотрудника) обнуляются — админ
--    расставит заново в «Настройки → Сотрудники».
-- ---------------------------------------------------------------------
-- profiles_guard не пускает правку car_no без admin-сессии, а в SQL-редакторе
-- Supabase её нет. На время чистки глушим строковые триггеры (штатный приём
-- Supabase для миграций), после — возвращаем как было.
set session_replication_role = replica;

update public.profiles set car_no = null
 where car_no is not null and (car_no < 1 or car_no > 99);

with d as (
  select id, row_number() over (partition by car_no order by created_at, id) as rn
    from public.profiles where car_no is not null)
update public.profiles p set car_no = null
  from d where p.id = d.id and d.rn > 1;

set session_replication_role = origin;

alter table public.profiles drop constraint if exists profiles_car_no_range;
alter table public.profiles add constraint profiles_car_no_range
  check (car_no is null or car_no between 1 and 99);
create unique index if not exists profiles_car_no_ux
  on public.profiles (car_no) where car_no is not null;

-- ---------------------------------------------------------------------
-- 2) Журнал движений. Каждая строка — «qty единиц типа X из from_loc в
--    to_loc». Для машин заполняется tech_id (чья машина), для движений
--    аренды — placement_id (удаление аренды удаляет и её движения).
-- ---------------------------------------------------------------------
create table if not exists public.equip_moves (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in
    ('init','intake','writeoff','take','return','to_repair','from_repair','place','pickup','undo')),
  equipment_type_id uuid not null references public.equipment_types(id) on delete cascade,
  qty int not null check (qty > 0),
  from_loc text not null check (from_loc in ('ext','stock','car','site','repair')),
  to_loc   text not null check (to_loc   in ('ext','stock','car','site','repair')),
  tech_id uuid references public.profiles(id) on delete set null,        -- чья машина
  placement_id uuid references public.placements(id) on delete cascade,  -- движение аренды
  actor uuid references public.profiles(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists equip_moves_et_idx on public.equip_moves(equipment_type_id);
create index if not exists equip_moves_pl_idx on public.equip_moves(placement_id);
create index if not exists equip_moves_at_idx on public.equip_moves(created_at desc);

alter table public.equip_moves enable row level security;
drop policy if exists em_sel on public.equip_moves;
create policy em_sel on public.equip_moves for select to authenticated using (true);
-- политик на запись нет: пишут только equip_op() и триггер (security definer)

-- ---------------------------------------------------------------------
-- 3) Остаток типа в месте (внутренняя, наружу не выдаётся).
-- ---------------------------------------------------------------------
create or replace function public.equip_bal(p_type uuid, p_loc text, p_tech uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(
    case when m.to_loc   = p_loc and (p_loc <> 'car' or m.tech_id = p_tech) then  m.qty
         when m.from_loc = p_loc and (p_loc <> 'car' or m.tech_id = p_tech) then -m.qty
         else 0 end), 0)::int
    from public.equip_moves m
   where m.equipment_type_id = p_type;
$$;
revoke all on function public.equip_bal(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Документы регистра одной функцией. p_kind:
--      intake        поступление на склад (только админ)   ext    → stock
--      writeoff      списание со склада (только админ)     stock  → ext
--      take          взял со склада в свою машину          stock  → car
--      return        сдал из своей машины на склад         car    → stock
--      repair_stock  в ремонт со склада                    stock  → repair
--      repair_car    в ремонт из своей машины              car    → repair
--      from_repair   вернулось из ремонта на склад         repair → stock
--    Остатка должно хватать — иначе NOT_ENOUGH:<доступно>.
-- ---------------------------------------------------------------------
create or replace function public.equip_op(p_kind text, p_type uuid, p_qty int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(public.my_role(), 'tech');
  v_me uuid := auth.uid();
  v_from text; v_to text; v_kind text; v_tech uuid := null;
  v_have int; v_row public.equip_moves; v_abbr text; v_name text; v_act text;
begin
  if v_me is null then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.profiles where id = v_me and coalesce(blocked, false)) then
    raise exception 'FORBIDDEN';
  end if;
  if p_type is null or not exists (select 1 from public.equipment_types where id = p_type) then
    raise exception 'BAD_TYPE';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 999 then raise exception 'BAD_QTY'; end if;

  if p_kind = 'intake' then
    if v_role <> 'admin' then raise exception 'FORBIDDEN'; end if;
    v_kind := 'intake'; v_from := 'ext'; v_to := 'stock'; v_act := 'equip_intake';
  elsif p_kind = 'writeoff' then
    if v_role <> 'admin' then raise exception 'FORBIDDEN'; end if;
    v_kind := 'writeoff'; v_from := 'stock'; v_to := 'ext'; v_act := 'equip_writeoff';
  elsif p_kind = 'take' then
    v_kind := 'take'; v_from := 'stock'; v_to := 'car'; v_tech := v_me; v_act := 'equip_take';
  elsif p_kind = 'return' then
    v_kind := 'return'; v_from := 'car'; v_to := 'stock'; v_tech := v_me; v_act := 'equip_return';
  elsif p_kind = 'repair_stock' then
    v_kind := 'to_repair'; v_from := 'stock'; v_to := 'repair'; v_act := 'equip_repair';
  elsif p_kind = 'repair_car' then
    v_kind := 'to_repair'; v_from := 'car'; v_to := 'repair'; v_tech := v_me; v_act := 'equip_repair';
  elsif p_kind = 'from_repair' then
    v_kind := 'from_repair'; v_from := 'repair'; v_to := 'stock'; v_act := 'equip_repair_back';
  else
    raise exception 'BAD_KIND';
  end if;

  if v_from <> 'ext' then
    v_have := public.equip_bal(p_type, v_from, v_tech);
    if v_have < p_qty then raise exception 'NOT_ENOUGH:%', v_have; end if;
  end if;

  insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, actor, note)
  values (v_kind, p_type, p_qty, v_from, v_to, v_tech, v_me, coalesce(p_note, ''))
  returning * into v_row;

  select abbr into v_abbr from public.equipment_types where id = p_type;
  select display_name into v_name from public.profiles where id = v_me;
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (v_me, coalesce(v_name, ''), v_act, 'equip', p_type::text,
          jsonb_build_object('eq', coalesce(v_abbr, '?'), 'qty', p_qty,
                             'from', v_from, 'to', v_to, 'note', coalesce(p_note, '')));
  return to_jsonb(v_row);
end $$;
revoke all on function public.equip_op(text, uuid, int, text) from public, anon;
grant execute on function public.equip_op(text, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Аренда пишет движения сама. Создание аренды — «машина → объект»,
--    недостающее в машине само добирается со склада (техник не обязан
--    жать «Взять»). «Забрал» — «объект → машина забравшего», «вернул на
--    склад» — «машина → склад». Отмена удаляет своё движение; если
--    движения нет (пикап был до появления регистра) — пишется обратное.
--    Продления (ext_of) — бумажные, физически ничего не едет.
-- ---------------------------------------------------------------------
create or replace function public.equip_place(p_type uuid, p_qty int, p_tech uuid, p_pl uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_short int;
begin
  if p_qty is null or p_qty < 1 then return; end if;
  v_short := p_qty - public.equip_bal(p_type, 'car', p_tech);
  if v_short > 0 then
    insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor, note)
    values ('take', p_type, v_short, 'stock', 'car', p_tech, p_pl, p_tech, 'auto');
  end if;
  insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
  values ('place', p_type, p_qty, 'car', 'site', p_tech, p_pl, p_tech);
end $$;
revoke all on function public.equip_place(uuid, int, uuid, uuid) from public, anon, authenticated;

create or replace function public.equip_pl_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tech uuid; v_d int; v_n int;
begin
  -- восстановление из бэкапа: движения приезжают из самого бэкапа
  if current_setting('techlog.restore', true) = '1' then return new; end if;

  if tg_op = 'INSERT' then
    if new.ext_of is null then
      perform public.equip_place(new.equipment_type_id,
                                 greatest(1, coalesce(new.qty, 1)),
                                 new.technician_id, new.id);
    end if;
    return new;
  end if;

  -- «забрал» / отмена забора
  if old.picked_up is distinct from new.picked_up then
    v_tech := coalesce(new.picked_up_by, old.picked_up_by, new.technician_id);
    if new.picked_up then
      insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
      values ('pickup', new.equipment_type_id, greatest(1, coalesce(new.qty, 1)),
              'site', 'car', v_tech, new.id, coalesce(new.picked_up_by, v_tech));
    else
      delete from public.equip_moves where placement_id = new.id and kind = 'pickup';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
        values ('undo', new.equipment_type_id, greatest(1, coalesce(old.qty, 1)),
                'car', 'site', v_tech, new.id, auth.uid());
      end if;
    end if;
  end if;

  -- «вернул на склад» / отмена возврата
  if (old.returned_at is null) is distinct from (new.returned_at is null) then
    v_tech := coalesce(new.picked_up_by, old.picked_up_by, new.technician_id);
    if new.returned_at is not null then
      insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
      values ('return', new.equipment_type_id, greatest(1, coalesce(new.qty, 1)),
              'car', 'stock', v_tech, new.id, coalesce(new.returned_by, v_tech));
    else
      delete from public.equip_moves where placement_id = new.id and kind = 'return';
      get diagnostics v_n = row_count;
      if v_n = 0 then
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
        values ('undo', new.equipment_type_id, greatest(1, coalesce(old.qty, 1)),
                'stock', 'car', v_tech, new.id, auth.uid());
      end if;
    end if;
  end if;

  -- правка количества в форме работы. Строки, у которых есть продления,
  -- форма не трогает (частичное продление меняет qty — это бумажный
  -- перенос на строку продления, движения не нужны).
  if old.qty is distinct from new.qty and new.ext_of is null
     and not exists (select 1 from public.placements x where x.ext_of = new.id) then
    v_d := coalesce(new.qty, 0) - coalesce(old.qty, 0);
    if v_d <> 0 then
      if new.returned_at is not null then                 -- уже сдано на склад
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, placement_id, actor)
        values ('undo', new.equipment_type_id, abs(v_d),
                case when v_d > 0 then 'ext' else 'stock' end,
                case when v_d > 0 then 'stock' else 'ext' end, new.id, auth.uid());
      elsif new.picked_up then                            -- в машине
        v_tech := coalesce(new.picked_up_by, new.technician_id);
        insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
        values ('undo', new.equipment_type_id, abs(v_d),
                case when v_d > 0 then 'site' else 'car' end,
                case when v_d > 0 then 'car' else 'site' end, v_tech, new.id, auth.uid());
      else                                                -- стоит на объекте
        if v_d > 0 then
          perform public.equip_place(new.equipment_type_id, v_d, new.technician_id, new.id);
        else
          insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, placement_id, actor)
          values ('undo', new.equipment_type_id, -v_d, 'site', 'car', new.technician_id, new.id, auth.uid());
        end if;
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists equip_pl_sync_tg on public.placements;
create trigger equip_pl_sync_tg
  after insert or update on public.placements
  for each row execute function public.equip_pl_sync();

-- ---------------------------------------------------------------------
-- 6) Начальный ввод: разовый перенос текущих остатков в журнал.
--    Выполняется только на полностью пустом журнале. «Свободно» из старых
--    счётчиков ложится на склад, сломано + в ремонте — в ремонт, забранное
--    и не сданное — в машины забравших. Стоящее на объектах в журнал не
--    вносится: оно приедет в машину пикапом и ляжет на склад возвратом.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  if exists (select 1 from public.equip_moves limit 1) then return; end if;

  for r in
    with pl as (
      select p.equipment_type_id as et,
             sum(case when not p.superseded and not p.picked_up
                      then p.qty else 0 end)::int as on_site,
             sum(case when not p.superseded and p.picked_up and p.returned_at is null
                      then p.qty else 0 end)::int as in_car
        from public.placements p group by p.equipment_type_id)
    select s.equipment_type_id as et,
           greatest(0, coalesce(s.total, 0) - coalesce(s.broken, 0) - coalesce(s.in_repair, 0)
                       - coalesce(pl.on_site, 0) - coalesce(pl.in_car, 0)) as free,
           coalesce(s.broken, 0) + coalesce(s.in_repair, 0) as rep
      from public.equipment_stock s
      left join pl on pl.et = s.equipment_type_id
  loop
    if r.free > 0 then
      insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, note)
      values ('init', r.et, r.free, 'ext', 'stock', 'начальный ввод');
    end if;
    if r.rep > 0 then
      insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, note)
      values ('init', r.et, r.rep, 'ext', 'repair', 'начальный ввод');
    end if;
  end loop;

  insert into public.equip_moves (kind, equipment_type_id, qty, from_loc, to_loc, tech_id, note)
  select 'init', p.equipment_type_id, sum(p.qty)::int, 'ext', 'car',
         coalesce(p.picked_up_by, p.technician_id), 'начальный ввод'
    from public.placements p
   where p.picked_up and p.returned_at is null and not p.superseded
   group by p.equipment_type_id, coalesce(p.picked_up_by, p.technician_id)
  having sum(p.qty) > 0;
end $$;

-- ---------------------------------------------------------------------
-- 7) Остатки: склад / машины / ремонт — из журнала; в аренде и «ждут
--    вывоза» — из placements, как раньше. Сигнатура прежняя, поэтому
--    ежедневные снимки stock_daily работают без изменений; broken
--    больше не существует и всегда 0.
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
                     and p.due_date <= current_date then p.qty else 0 end)::int as pending
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
revoke all on function public.stock_counts() from public, anon;
grant execute on function public.stock_counts() to authenticated;

-- ---------------------------------------------------------------------
-- 8) Бэкап: equip_moves входит в выгрузку и восстановление. Тот же
--    admin_restore_rows, в списке разрешённых таблиц добавился журнал
--    (set_config('techlog.restore') уже стоит — триггер аренды при
--    восстановлении молчит, движения приезжают из самого бэкапа).
-- ---------------------------------------------------------------------
create or replace function public.admin_restore_rows(p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'profiles','counterparties','complexes','aux_equipment','work_types',
    'equipment_types','size_types','extra_works','product_types','price_list',
    'counterparty_prices','equipment_stock','org_settings','code_requests',
    'complex_code_history','hidden_staff','proposals','jobs','placements',
    'ext_requests','media','repairs','equip_moves'];
  v_cols text[]; v_collist text; v_set text; v_sql text;
  r jsonb; v_n int := 0; v_rc int;
  v_ins int := 0; v_skip int := 0; v_errs jsonb := '[]'::jsonb;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if not (p_table = any(v_allowed)) then raise exception 'BAD_TABLE'; end if;
  if to_regclass('public.' || p_table) is null then raise exception 'NO_TABLE'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'errors', '[]'::jsonb);
  end if;

  perform set_config('techlog.restore', '1', true);

  select array_agg(quote_ident(column_name) order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table
    and (p_rows->0) ? column_name;
  if v_cols is null then raise exception 'NO_MATCHING_COLUMNS'; end if;
  v_collist := array_to_string(v_cols, ',');

  if p_table = 'org_settings' then
    select string_agg(format('%s = excluded.%s', c, c), ', ')
      into v_set from unnest(v_cols) c where c <> 'id';
    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
       on conflict (id) do update set %s', p_table, v_collist, v_collist, p_table, v_set);
  else
    v_sql := format(
      'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)
       on conflict do nothing', p_table, v_collist, v_collist, p_table);
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    begin
      execute v_sql using r;
      get diagnostics v_rc = row_count;
      if v_rc > 0 then v_ins := v_ins + 1; else v_skip := v_skip + 1; end if;
    exception when others then
      v_errs := v_errs || jsonb_build_object(
        'row', coalesce(r->>'id', '#' || v_n), 'error', sqlerrm);
    end;
  end loop;

  -- identity-счётчики номеров: после загрузки старых номеров двигаем вперёд
  if p_table in ('proposals','repairs') then
    execute format(
      'select setval(pg_get_serial_sequence(''public.%I'',''no''),
                     greatest((select coalesce(max(no), 0) from public.%I), 1), true)',
      p_table, p_table);
  end if;

  return jsonb_build_object('inserted', v_ins, 'skipped', v_skip, 'errors', v_errs);
end $$;
revoke all on function public.admin_restore_rows(text, jsonb) from public, anon;
grant execute on function public.admin_restore_rows(text, jsonb) to authenticated;
