-- =====================================================================
-- TechLog update-to-1_07_26 — склад, чек-листы, апрувы менеджера,
-- лимиты аренды/продления, блокировка правки старых документов, PROPOSAL
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Новые настройки организации
-- ---------------------------------------------------------------------
alter table public.org_settings add column if not exists default_rent_days   int     not null default 3;
alter table public.org_settings add column if not exists max_extend_days     int     not null default 3;
alter table public.org_settings add column if not exists manager_can_approve boolean not null default false;
alter table public.org_settings add column if not exists stock_visible_all   boolean not null default true;
alter table public.org_settings add column if not exists edit_lock_days      int     not null default 0;

-- PROPOSAL — не вид работы, а признак документа (чекбокс после номера юнита)
alter table public.jobs add column if not exists has_proposal boolean not null default false;

-- Чек-лист перед выездом — хранится у вида работ
alter table public.work_types add column if not exists checklist jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- СКЛАД: остатки оборудования. Правит админ, читают все авторизованные
-- (видимость для сотрудников дополнительно регулируется галочкой
-- org_settings.stock_visible_all на клиенте).
-- «У клиентов» не хранится — считается по невывезенным пикапам.
-- ---------------------------------------------------------------------
create table if not exists public.equipment_stock (
  id                uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null unique references public.equipment_types(id) on delete cascade,
  total             int  not null default 0,
  broken            int  not null default 0,
  in_repair         int  not null default 0
);
alter table public.equipment_stock enable row level security;
drop policy if exists stock_sel on public.equipment_stock;
create policy stock_sel on public.equipment_stock for select to authenticated using (true);
drop policy if exists stock_wr on public.equipment_stock;
create policy stock_wr on public.equipment_stock for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------------
-- Апрув менеджером: RLS не даёт менеджеру писать в jobs, а открывать
-- политику целиком нельзя (он смог бы править составы и суммы).
-- Функция меняет только поля апрува и пишет запись в журнал на сервере.
-- ---------------------------------------------------------------------
create or replace function public.approve_job(p_job uuid, p_total numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(public.my_role(), 'tech');
  v_unit text; v_name text;
begin
  if v_role <> 'admin' then
    if v_role <> 'manager'
       or not coalesce((select manager_can_approve from public.org_settings where id = 'org'), false) then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  if p_total is null or p_total < 0 then raise exception 'BAD_TOTAL'; end if;

  update public.jobs
     set status = 'approved',
         approved_total = p_total,
         approved_by = auth.uid(),
         approved_at = now(),
         updated_at = now()
   where id = p_job
   returning unit_number into v_unit;
  if not found then raise exception 'NOT_FOUND'; end if;

  select display_name into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name, ''), 'job_approve', 'job', p_job::text,
          jsonb_build_object('unit', coalesce(v_unit, ''), 'total', p_total, 'via', 'rpc'));
end $$;
revoke all on function public.approve_job(uuid, numeric) from public, anon;
grant execute on function public.approve_job(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Блокировка правки старых документов на уровне БД (клиентский замок —
-- удобство, этот триггер — защита). Техник не может менять и удалять
-- работы старше org_settings.edit_lock_days; 0 — выключено.
-- Менеджер и админ — без ограничений.
-- ---------------------------------------------------------------------
create or replace function public.jobs_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  select coalesce(edit_lock_days, 0) into v_n from public.org_settings where id = 'org';
  if v_n > 0
     and coalesce(public.my_role(), 'tech') = 'tech'
     and old.date < current_date - v_n then
    raise exception 'LOCKED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists jobs_lock_tg on public.jobs;
create trigger jobs_lock_tg before update or delete on public.jobs
  for each row execute function public.jobs_lock_guard();

-- ---------------------------------------------------------------------
-- Сиды чек-листов (по вашим спискам). Заполняются ТОЛЬКО там, где
-- чек-лист ещё пуст — ваши правки повторный запуск не перетрёт.
-- Дальше редактируются в Справочники → Виды работ → 📋.
-- ---------------------------------------------------------------------
update public.work_types set checklist = '[
  "Эйрдак-машина / Air duct machine",
  "Шланги и насадки",
  "Шуруповёрт",
  "Нож — срезать герметик",
  "Фогер + тритмант",
  "Тряпки",
  "Запросить размеры решёток и их состояние (купить нужные заранее)"
]'::jsonb
where name ilike '%air duct%' and (checklist is null or checklist = '[]'::jsonb);

update public.work_types set checklist = '[
  "Сопоги (сапоги)",
  "Портативная откачка / portable",
  "Тритмант",
  "Нож",
  "Подкладка под ковёр (pad)",
  "Бловеры",
  "Дехью (dehumidifier)",
  "Скрабер (air scrubber)",
  "Швабра, тряпки",
  "Анализатор воды",
  "Термокамера / тепловизор",
  "Датчик влажности"
]'::jsonb
where (name ilike '%vetvag%' or name ilike '%damage water%')
  and (checklist is null or checklist = '[]'::jsonb);

update public.work_types set checklist = '[
  "Портабл или машина (шланги и вант — под каждый свои)",
  "Ведро, шампунь, пахучки",
  "Чемодан с химией от пятен",
  "Химия для предварительного распыления + распылитель",
  "Нож для вырезания подкладки",
  "Подкладка (pad)",
  "Устройство для выпрямления ворсинок"
]'::jsonb
where name ilike '%steam%' and (checklist is null or checklist = '[]'::jsonb);

update public.work_types set checklist = '[
  "Мультитул для вырезки стен + насадки",
  "Лестница",
  "Перчатки, тряпки",
  "Силент (герметик)",
  "Уровень, карандаш",
  "Мусорные пакеты",
  "Респиратор / маска"
]'::jsonb
where name ilike '%demolition%' and (checklist is null or checklist = '[]'::jsonb);
