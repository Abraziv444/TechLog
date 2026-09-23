-- =====================================================================
-- TechLog · update-to-1_09_40.sql  (после 1.09.38; идемпотентно — можно запускать повторно)
--  Замечания по коду v1.09.38 (первый пакет):
--  1) п. 4 — строки справочников, на которые ссылаются документы, база не даёт удалить (dir_del_guard):
--     контрагент, комплекс, вид задачи, тип оборудования. Раньше каскад стирал комплексы, пикапы, движения склада.
--  2) п. 5 — сотрудника с документами нельзя удалить и в панели Supabase (profile_del_guard): удаление
--     пользователя там откатывается целиком с ошибкой USER_HAS_DOCUMENTS. Блокировка в приложении — как раньше.
--  3) п. 9 — журнал: при прямой записи из приложения база сама ставит автора и его имя, время не может уйти
--     в будущее или далеко в прошлое, служебные действия (роли, доступы, бухгалтерия, апрув) пишет только
--     та роль, которой они разрешены; в details добавляется _role — роль автора на момент записи.
--     Записи самой базы (RPC, триггеры) и Edge Functions не трогаются.
--  4) п. 10 — пикап без исполнителя меняют админ, менеджер и основной исполнитель самой задачи (не любой сотрудник:
--     раньше любой вошедший мог «забрать» ничейный пикап себе).
--  5) п. 12 — media.upload_id: сессия загрузки Google Drive, открытая media-begin; media-put 1.09.40 пускает
--     докачку только в сессию своего файла.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Справочники: удаление строки, которая используется в документах
-- ---------------------------------------------------------------------
create or replace function public.dir_del_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n_cx int := 0; n_doc int := 0; n_mv int := 0;
begin
  if coalesce(current_setting('techlog.restore', true), '') = '1' then return old; end if;
  if tg_table_name = 'counterparties' then
    select count(*) into n_cx from public.complexes where counterparty_id = old.id;
    select (select count(*) from public.jobs       where counterparty_id = old.id)
         + (select count(*) from public.placements where counterparty_id = old.id)
         + (select count(*) from public.proposals  where counterparty_id = old.id)
         + (select count(*) from public.repairs    where counterparty_id = old.id) into n_doc;
  elsif tg_table_name = 'complexes' then
    select (select count(*) from public.jobs       where complex_id = old.id)
         + (select count(*) from public.placements where complex_id = old.id)
         + (select count(*) from public.proposals  where complex_id = old.id)
         + (select count(*) from public.repairs    where complex_id = old.id) into n_doc;
  elsif tg_table_name = 'work_types' then
    select count(*) into n_doc from public.jobs where work_type_id = old.id;
  elsif tg_table_name = 'equipment_types' then
    select count(*) into n_doc from public.placements  where equipment_type_id = old.id;
    select count(*) into n_mv  from public.equip_moves where equipment_type_id = old.id;
  end if;
  if n_cx + n_doc + n_mv > 0 then
    raise exception 'IN_USE: комплексов %, документов %, движений склада %', n_cx, n_doc, n_mv using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists dir_del_guard_tg on public.counterparties;
create trigger dir_del_guard_tg before delete on public.counterparties  for each row execute function public.dir_del_guard();
drop trigger if exists dir_del_guard_tg on public.complexes;
create trigger dir_del_guard_tg before delete on public.complexes       for each row execute function public.dir_del_guard();
drop trigger if exists dir_del_guard_tg on public.work_types;
create trigger dir_del_guard_tg before delete on public.work_types      for each row execute function public.dir_del_guard();
drop trigger if exists dir_del_guard_tg on public.equipment_types;
create trigger dir_del_guard_tg before delete on public.equipment_types for each row execute function public.dir_del_guard();

-- ---------------------------------------------------------------------
-- 2. Профиль сотрудника с документами не удаляется (и из панели Supabase)
--    auth.users → profiles идёт каскадом; исключение здесь откатывает удаление пользователя целиком.
-- ---------------------------------------------------------------------
create or replace function public.profile_del_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if coalesce(current_setting('techlog.restore', true), '') = '1' then return old; end if;
  select (select count(*) from public.jobs       where technician_id = old.id)
       + (select count(*) from public.placements where technician_id = old.id)
       + (select count(*) from public.repairs    where created_by    = old.id)
       + (select count(*) from public.proposals  where created_by    = old.id)
       + (select count(*) from public.media      where owner_id      = old.id) into n;
  if n > 0 then
    raise exception 'USER_HAS_DOCUMENTS: у сотрудника % документов и файлов. Не удаляйте — заблокируйте в приложении (Справочники → Сотрудники)', n
      using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists profile_del_guard_tg on public.profiles;
create trigger profile_del_guard_tg before delete on public.profiles for each row execute function public.profile_del_guard();

-- ---------------------------------------------------------------------
-- 3. Журнал: прямую запись приложения проверяет база
--    Функция НЕ security definer: current_user = роль того, кто пишет. Запись из RPC/триггеров базы идёт
--    от владельца функций, из Edge Functions — от service_role; их не трогаем.
-- ---------------------------------------------------------------------
create or replace function public.audit_guard()
returns trigger language plpgsql set search_path = public as $$
declare r text; nm text;
begin
  if current_user is distinct from 'authenticated' then return new; end if;
  select p.role, p.display_name into r, nm from public.profiles p where p.id = auth.uid();
  new.actor := auth.uid();
  new.actor_name := coalesce(nm, new.actor_name, '');
  -- запись из офлайн-очереди приходит позже и со своим временем; будущее и «глубокое прошлое» не принимаем
  if new.at is null or new.at > now() + interval '10 minutes' or new.at < now() - interval '14 days' then new.at := now(); end if;
  if new.action is null or new.action !~ '^[a-z][a-z0-9_]{1,48}$' then
    raise exception 'AUDIT_BAD_ACTION' using errcode = 'P0001';
  end if;
  if new.action = any (array['user_create','role_change','user_block','user_unblock','org_tz','org_office','doc_rights',
       'staff_flag','password_reset','sess_kill','car_no_set','veh_save','veh_del','mt_save','mt_del','bn_dev_sync',
       'jr_archive','backup_restore'])
     and r is distinct from 'admin' then
    raise exception 'AUDIT_FORBIDDEN: %', new.action using errcode = 'P0001';
  end if;
  if new.action = any (array['acc_mark','acc_rates','acc_map','acc_pay_add','acc_pay_del'])
     and coalesce(r, '') not in ('admin','accountant') then
    raise exception 'AUDIT_FORBIDDEN: %', new.action using errcode = 'P0001';
  end if;
  if new.action = any (array['job_approve','approve_resum','edit_request_granted','edit_request_denied'])
     and coalesce(r, '') not in ('admin','manager') then
    raise exception 'AUDIT_FORBIDDEN: %', new.action using errcode = 'P0001';
  end if;
  new.details := coalesce(new.details, '{}'::jsonb) || jsonb_build_object('_role', coalesce(r, ''));
  return new;
end $$;
drop trigger if exists audit_guard_tg on public.audit_log;
create trigger audit_guard_tg before insert on public.audit_log for each row execute function public.audit_guard();
drop trigger if exists audit_guard_tg on public.tech_log;
create trigger audit_guard_tg before insert on public.tech_log  for each row execute function public.audit_guard();

-- ---------------------------------------------------------------------
-- 4. Пикап без исполнителя: не любой вошедший
-- ---------------------------------------------------------------------
create or replace function public.is_job_main(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs j where j.id = p_job and j.technician_id = auth.uid())
$$;
revoke all on function public.is_job_main(uuid) from public, anon;
grant execute on function public.is_job_main(uuid) to authenticated;

drop policy if exists pl_upd on public.placements;
create policy pl_upd on public.placements for update to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager')
         or (technician_id is null and public.is_job_main(job_id))
         or public.is_shared_job_helper(job_id))
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager')
              or (technician_id is null and public.is_job_main(job_id))
              or public.is_shared_job_helper(job_id));

-- ---------------------------------------------------------------------
-- 5. Сессия загрузки файла — для проверки в media-put
-- ---------------------------------------------------------------------
alter table public.media add column if not exists upload_id text;
create index if not exists media_upload_id_idx on public.media(upload_id) where upload_id is not null;

-- ▄▄▄▄▄▄▄▄▄▄ САМОПРОВЕРКА ▄▄▄▄▄▄▄▄▄▄
do $$
declare miss text := '';
begin
  if not exists (select 1 from pg_trigger where tgname = 'dir_del_guard_tg' and tgrelid = 'public.counterparties'::regclass) then miss := miss || ' dir_del_guard_tg(counterparties)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'dir_del_guard_tg' and tgrelid = 'public.equipment_types'::regclass) then miss := miss || ' dir_del_guard_tg(equipment_types)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'profile_del_guard_tg') then miss := miss || ' profile_del_guard_tg'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'audit_guard_tg' and tgrelid = 'public.audit_log'::regclass) then miss := miss || ' audit_guard_tg(audit_log)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'audit_guard_tg' and tgrelid = 'public.tech_log'::regclass) then miss := miss || ' audit_guard_tg(tech_log)'; end if;
  if to_regprocedure('public.is_job_main(uuid)') is null then miss := miss || ' is_job_main'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media' and column_name = 'upload_id') then miss := miss || ' media.upload_id'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.40 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.40 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
