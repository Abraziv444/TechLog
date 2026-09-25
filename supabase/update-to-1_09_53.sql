-- =====================================================================
-- TechLog · update-to-1_09_53.sql  (после 1.09.44; идемпотентно — можно запускать повторно)
--  ДОКУМЕНТ РЕМОНТА — правила сервера под тест «Документооборот + ремонт»:
--  1) бригада ремонта видит документ (rep_sel: + helper_ids). Раньше сотрудник, добавленный в бригаду ремонта без
--     инвойса, документ не видел — хотя получал уведомление «Ремонт апрувлен» со ссылкой на него;
--  2) сторож апрува repairs_guard:
--     · сохранение (upsert) УЖЕ существующего ремонта больше не снимает апрув молча: решает ветка UPDATE по старой и
--       новой строке. Раньше «Одобрен» у сотрудника без права апрува становился «Черновиком» при ЛЮБОМ сохранении —
--       даже без правок (пометки «до/после», повторное «Сохранить»), а приложение считало документ одобренным;
--     · правка сметы, шапки или бригады одобренного (или отправленного на апрув) ремонта снимает апрув и на сервере,
--       как кнопки приложения: запрос в обход интерфейса не оставит изменённый документ «одобренным». Переводы,
--       пометки фото, история, связи с документами и архив апрув не снимают;
--     · кто решил судьбу ремонта (decided_by) записывает сервер по входу, а не по присланному полю;
--  3) события ремонта в ленту «Уведомления» и пуши: «Ремонт отклонён» (автору и бригаде, с причиной) и
--     «Ремонт ждёт апрува» (согласующим); «Ремонт апрувлен» и «Апрув снят с ремонта» — как раньше;
--  4) функция теста dft_exec: у ремонта — пропозал (только тестовый), PO, срок, налог, доставка, пометки фото;
--     связь только с тестовыми документами; строгий rep_get (видимость того, от чьего имени запрос).
--  Edge Functions не меняются (dft передаёт аргументы как есть). docflow_v = 11.
-- =====================================================================

-- ▄▄▄▄▄▄▄▄▄▄ 1. ВИДИМОСТЬ: бригада ремонта ▄▄▄▄▄▄▄▄▄▄
drop policy if exists rep_sel on public.repairs;
create policy rep_sel on public.repairs for select to authenticated
  using (
    public.my_role() in ('admin','manager','accountant')
    or created_by = auth.uid()
    or coalesce(helper_ids, '[]'::jsonb) ? auth.uid()::text
    or (job_id is not null and public.can_view_job(job_id))
  );

-- ▄▄▄▄▄▄▄▄▄▄ 2. СТОРОЖ АПРУВА ▄▄▄▄▄▄▄▄▄▄
/* строки работ и материалов без переводов: количество, код, описание, сумма (числа — как числа) */
create or replace function public.rep_rows_key(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(
           case when coalesce(e->>'q', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e->>'q')::numeric else 0 end,
           upper(coalesce(e->>'code', '')), coalesce(e->>'d', ''),
           case when coalesce(e->>'a', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e->>'a')::numeric else 0 end) order by o), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as x(e, o)
$$;
/* то, что видел согласующий: шапка, смета, бригада, заметка (переводы, фото, история, связи и архив — не входят) */
create or replace function public.rep_content_key(r public.repairs)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_array(r.date, r.counterparty_id, r.complex_id, coalesce(r.unit_number, ''), coalesce(r.po_number, ''), r.complete_by,
                           coalesce(r.note, ''), coalesce(r.sales_tax, 0), coalesce(r.freight, 0), coalesce(r.total, 0),
                           coalesce(r.helper_ids, '[]'::jsonb), public.rep_rows_key(r.items), public.rep_rows_key(r.materials))
$$;

create or replace function public.repairs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_can boolean; v_nm text;
begin
  if coalesce(current_setting('techlog.restore', true), '') = '1' then return new; end if;
  v_can := public.can_approve_docs();
  if TG_OP = 'INSERT' then
    /* v1.09.53: приложение сохраняет документ командой upsert. Если ремонт уже есть, решает ветка UPDATE (старая и новая
       строка); раньше «Одобрен» у сотрудника без права апрува молча становился «Черновиком» при любом сохранении. */
    if exists (select 1 from public.repairs where id = new.id) then return new; end if;
    if new.status in ('approved','declined') and not coalesce(v_can, false) then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if coalesce(current_setting('techlog.dft', true), '') <> '1' then new.is_test := old.is_test; new.test_owner := old.test_owner; new.test_run := old.test_run; end if;
  if new.status is distinct from old.status
     and new.status in ('approved','declined')
     and not coalesce(v_can, false) then
    raise exception 'FORBIDDEN_APPROVE';
  end if;
  /* v1.09.53: правка сметы, шапки или бригады одобренного / отправленного ремонта снимает апрув и на сервере */
  if old.status in ('approved','sent') and new.status = old.status
     and public.rep_content_key(new) is distinct from public.rep_content_key(old) then
    select display_name into v_nm from public.profiles where id = auth.uid();
    new.status := 'draft';
    new.hist := (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                   from jsonb_array_elements(jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'by_name', coalesce(v_nm, ''),
                          'act', 'reset', 'from', old.status, 'to', old.decided_by, 'srv', true))
                          || (case when jsonb_typeof(new.hist) = 'array' then new.hist else '[]'::jsonb end)) with ordinality as x(e, o)
                  where o <= 40);
  end if;
  if new.status is distinct from old.status then
    if new.status in ('approved','declined') then
      new.decided_by := coalesce(auth.uid(), new.decided_by); new.decided_at := now();
    elsif new.status in ('draft','sent') then
      new.decided_by := null; new.decided_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists repairs_guard_t on public.repairs;
create trigger repairs_guard_t before insert or update on public.repairs
  for each row execute function public.repairs_guard();

-- ▄▄▄▄▄▄▄▄▄▄ 3. СОБЫТИЯ РЕМОНТА ▄▄▄▄▄▄▄▄▄▄
create or replace function public.repairs_push_tg_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; v_b text; v_url text; r record; v_appr boolean := false;
begin
  if current_setting('techlog.restore', true) = '1' then return new; end if;
  perform set_config('techlog.test_owner', case when new.is_test then coalesce(new.test_owner::text, '00000000-0000-0000-0000-000000000000') else '' end, true);   -- v1.09.30
  v_b := 'REP-' || new.no || ' · Unit ' || coalesce(nullif(new.unit_number,''),'—');
  if old.status is distinct from 'approved' and new.status = 'approved' then
    v_t := 'Ремонт апрувлен';
  elsif new.status = 'declined' and old.status is distinct from 'declined' then
    v_t := 'Ремонт отклонён';                                                             -- v1.09.53: с причиной
    if coalesce(new.decline_reason, '') <> '' then v_b := v_b || ' · ' || left(new.decline_reason, 160); end if;
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    v_t := 'Апрув снят с ремонта';
  elsif new.status = 'sent' and old.status is distinct from 'sent' then
    v_t := 'Ремонт ждёт апрува'; v_appr := true;                                          -- v1.09.53: согласующим
  else
    return new;
  end if;
  v_url := './?doc=rep:' || new.id::text;
  if v_appr then
    for r in select id from public.profiles where not blocked and (role = 'admin' or (role = 'manager' and coalesce(can_approve, false)))
    loop
      perform public.push_enqueue(r.id, 'approve', v_t, v_b, v_url);
    end loop;
    return new;
  end if;
  perform public.push_enqueue(new.created_by, 'approve', v_t, v_b, v_url);
  for r in select distinct value::uuid as uid
             from jsonb_array_elements_text(coalesce(new.helper_ids, '[]'::jsonb))
  loop
    if r.uid is distinct from new.created_by then
      perform public.push_enqueue(r.uid, 'approve', v_t, v_b, v_url);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists repairs_push_tg on public.repairs;
create trigger repairs_push_tg after update on public.repairs
  for each row execute function public.repairs_push_tg_fn();

-- ▄▄▄▄▄▄▄▄▄▄ 4. ФУНКЦИЯ ТЕСТА: ремонт целиком ▄▄▄▄▄▄▄▄▄▄
create or replace function public.dft_exec(p_caller uuid, p_actor uuid, p_op text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_crole text; v_id uuid; v_job public.jobs%rowtype; v_pl public.placements%rowtype; v_rep public.repairs%rowtype; v_prop public.proposals%rowtype; v_res jsonb; v_n int := 0;
  v_run text := left(coalesce(p_args->>'run', ''), 60); v_fn text; a jsonb := coalesce(p_args->'args', '{}'::jsonb);
  v_patch jsonb := coalesce(p_args->'patch', '{}'::jsonb); v_row jsonb := coalesce(p_args->'row', '{}'::jsonb);
begin
  select role into v_crole from public.profiles where id = p_caller and not blocked;
  if v_crole is null then raise exception 'DFT_NO_CALLER'; end if;

  -- уборка работает и при выключенном режиме: остатки должны убираться всегда. Своё — любой, всё — только админ.
  if p_op = 'cleanup' then
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
    perform set_config('techlog.test_owner', '00000000-0000-0000-0000-000000000000', true);
    for v_id in select id from public.jobs where is_test
                  and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
                  and (v_run = '' or test_run = v_run)
    loop
      delete from public.doc_locks where doc_id = v_id;
      delete from public.doc_requests where doc_id = v_id;
      delete from public.ext_requests where job_id = v_id;
      delete from public.notices where url like '%doc=job:' || v_id::text || '%';
      delete from public.placements where job_id = v_id;
      delete from public.jobs where id = v_id;
      v_n := v_n + 1;
    end loop;
    delete from public.repairs where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    delete from public.notices where url like '%doc=rep:%' and user_id = p_caller and body like '%DFTEST%';
    delete from public.proposals where is_test
       and (case when coalesce((p_args->>'all')::boolean, false) and v_crole = 'admin' then true else test_owner = p_caller end)
       and (v_run = '' or test_run = v_run);
    perform set_config('techlog.test_owner', '', true);
    return jsonb_build_object('ok', true, 'deleted', v_n);
  end if;

  if not public.dft_enabled() then raise exception 'DFT_OFF'; end if;
  select role into v_role from public.profiles where id = p_actor and not blocked;
  if v_role is null then raise exception 'DFT_NO_ACTOR'; end if;

  -- с этого места все сторожа видят p_actor как вошедшего пользователя
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  perform set_config('techlog.dft', '1', true);

  if p_op in ('prop_adopt', 'rep_adopt') then
    /* v1.09.30: пропозал или ремонт, созданный КНОПКАМИ приложения, принимается в тест — условия те же, что у задачи:
       свой (created_by = вызывающий), черновик, создан не раньше 10 минут назад, юнит начинается с DFTEST */
    if p_op = 'prop_adopt' then
      select * into v_prop from public.proposals where id = (p_args->>'id')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
      if not v_prop.is_test then
        if v_prop.status <> 'draft' or v_prop.created_by is distinct from p_caller or v_prop.created_at < now() - interval '10 minutes'
           or coalesce(v_prop.unit_number, '') not like 'DFTEST%' or v_prop.archived_at is not null then raise exception 'DFT_ADOPT_DENIED'; end if;
        update public.proposals set is_test = true, test_owner = p_caller, test_run = v_run where id = v_prop.id;
      elsif v_prop.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
      select to_jsonb(x) into v_res from public.proposals x where x.id = v_prop.id;
    else
      select * into v_rep from public.repairs where id = (p_args->>'id')::uuid;
      if not found then raise exception 'NOT_FOUND'; end if;
      if not v_rep.is_test then
        if v_rep.status <> 'draft' or v_rep.created_by is distinct from p_caller or v_rep.created_at < now() - interval '10 minutes'
           or coalesce(v_rep.unit_number, '') not like 'DFTEST%' or v_rep.archived_at is not null
           or (v_rep.job_id is not null and not exists (select 1 from public.jobs where id = v_rep.job_id and is_test)) then raise exception 'DFT_ADOPT_DENIED'; end if;
        perform set_config('techlog.dft', '1', true);
        update public.repairs set is_test = true, test_owner = p_caller, test_run = v_run where id = v_rep.id;
        perform set_config('techlog.dft', '', true);
      elsif v_rep.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
      select to_jsonb(x) into v_res from public.repairs x where x.id = v_rep.id;
    end if;
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_adopt' then
    /* v1.09.28: документ, который ведущий тест только что создал КНОПКОЙ «Добавить задание», становится тестовым. Условия жёсткие,
       чтобы пометить можно было только свой свежий черновик, который и так разрешено удалить: черновик, ни разу не отправлялся,
       создан не раньше 10 минут назад, юнит начинается с DFTEST, без пикапов; исполнитель — сам вызывающий (менеджеру и админу —
       ещё и «без исполнителя»). Настоящий рабочий документ под эти условия не попадает. */
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_job.is_test then
      if v_job.test_owner is distinct from p_caller then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    else
      if v_job.status <> 'draft' or v_job.numbered_at is not null or v_job.archived_at is not null
         or v_job.created_at < now() - interval '10 minutes' or coalesce(v_job.unit_number, '') not like 'DFTEST%'
         or exists (select 1 from public.placements where job_id = v_job.id)
         or not (v_job.technician_id = p_caller or (v_job.technician_id is null and v_crole in ('admin','manager'))) then
        raise exception 'DFT_ADOPT_DENIED';
      end if;
      perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
      perform set_config('techlog.sysupd', '1', true);
      update public.jobs set is_test = true, test_owner = p_caller, test_run = v_run, test_wide = coalesce((p_args->>'wide')::boolean, false) where id = v_job.id;
      perform set_config('techlog.sysupd', '', true);
      delete from public.push_queue where url like '%doc=job:' || v_job.id::text || '%' and sent_at is null;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;
    perform set_config('techlog.dft', '', true);
    return jsonb_build_object('ok', true, 'data', v_res);
  end if;

  if p_op = 'job_create' then
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_ins
    insert into public.jobs (id, date, counterparty_id, complex_id, unit_number, work_type_id, technician_id, technician_name, helper_ids,
                             shared_with_helpers, status, note, note_en, form_data, total, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'work_type_id')::uuid, (v_row->>'technician_id')::uuid, coalesce(v_row->>'technician_name', ''),
            coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce((v_row->>'shared_with_helpers')::boolean, false), coalesce(v_row->>'status', 'draft'),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), coalesce(v_row->'form_data', '{}'::jsonb), coalesce((v_row->>'total')::numeric, 0),
            true, p_caller, v_run)
    returning id into v_id;
    if coalesce((p_args->>'wide')::boolean, false) then perform set_config('techlog.sysupd', '1', true); update public.jobs set test_wide = true where id = v_id; perform set_config('techlog.sysupd', '', true); end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_id;

  elsif p_op in ('job_update', 'job_get') then
    select * into v_job from public.jobs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;                       -- настоящий документ функция не трогает никогда
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if p_op = 'job_update' then
      if not (v_job.technician_id = p_actor or v_role in ('admin','manager') or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;   -- как политика jobs_upd
      update public.jobs j set (date, unit_number, complex_id, counterparty_id, work_type_id, technician_id, technician_name, helper_ids, shared_with_helpers,
                               priority, sort_order, status, note, note_en, form_data, total, approved_total, approved_by, approved_at, return_note,
                               archived_at, archived_by, arch_note, proposal_id, has_proposal, rev, updated_dev)
        = (select r.date, r.unit_number, r.complex_id, r.counterparty_id, r.work_type_id, r.technician_id, r.technician_name, r.helper_ids, r.shared_with_helpers,
                  r.priority, r.sort_order, r.status, r.note, r.note_en, r.form_data, r.total, r.approved_total, r.approved_by, r.approved_at, r.return_note,
                  r.archived_at, r.archived_by, r.arch_note, r.proposal_id, r.has_proposal, r.rev, r.updated_dev
             from jsonb_populate_record(j, v_patch) r)
       where j.id = v_job.id;
    end if;
    select to_jsonb(j) into v_res from public.jobs j where j.id = v_job.id;

  elsif p_op = 'pl_upsert' then
    select * into v_job from public.jobs where id = (v_row->>'job_id')::uuid;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if not (v_role in ('admin','manager') or (v_row->>'technician_id')::uuid = p_actor or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;
    select * into v_pl from public.placements where id = (v_row->>'id')::uuid;
    if found then
      update public.placements p set (qty, days, due_date, picked_up, picked_up_at, picked_up_by, returned_at, returned_by, superseded, superseded_at,
                                      archived_at, archived_by, arch_note, note, note_en, technician_id)
        = (select r.qty, r.days, r.due_date, r.picked_up, r.picked_up_at, r.picked_up_by, r.returned_at, r.returned_by, r.superseded, r.superseded_at,
                  r.archived_at, r.archived_by, r.arch_note, r.note, r.note_en, r.technician_id from jsonb_populate_record(p, v_row) r)
       where p.id = v_pl.id;
    else
      insert into public.placements (id, job_id, equipment_type_id, qty, days, placed_date, due_date, technician_id, complex_id, counterparty_id, unit_number, ext_of, note, note_en, no)
      values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), v_job.id, (v_row->>'equipment_type_id')::uuid, coalesce((v_row->>'qty')::int, 1), coalesce((v_row->>'days')::int, 1),
              coalesce((v_row->>'placed_date')::date, current_date), coalesce((v_row->>'due_date')::date, current_date + 1), (v_row->>'technician_id')::uuid,
              coalesce((v_row->>'complex_id')::uuid, v_job.complex_id), coalesce((v_row->>'counterparty_id')::uuid, v_job.counterparty_id), coalesce(v_row->>'unit_number', v_job.unit_number),
              (v_row->>'ext_of')::uuid, coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''), 90000000 + nextval('public.jobs_test_no_seq'))   -- номер тестового пикапа — тоже из своего диапазона
      returning id into v_id;
    end if;
    select to_jsonb(p) into v_res from public.placements p where p.id = coalesce(v_pl.id, v_id);

  elsif p_op = 'ext_req_create' then
    /* v1.09.33: заявка на продление аренды сверх лимита — от имени работника (как кнопка «Запросить…» в карточке пикапа):
       по всем ожидающим строкам пикапа тестового документа, на p_args->>'days' дней */
    select * into v_job from public.jobs where id = (p_args->>'job_id')::uuid;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if not (v_job.technician_id = p_actor or public.is_shared_job_helper(v_job.id)) then raise exception 'RLS_DENIED'; end if;   -- заявку подаёт тот, у кого пикапы
    insert into public.ext_requests (id, job_id, requested_by, days, qty_total, payload, unit, cx, eq)
    select gen_random_uuid(), v_job.id, p_actor, greatest(1, least(60, coalesce((p_args->>'days')::int, 4))),
           coalesce(sum(p.qty), 0), coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'qty', p.qty)), '[]'::jsonb),
           coalesce(v_job.unit_number, ''), coalesce((select abbr from public.complexes where id = v_job.complex_id), ''),
           coalesce(string_agg(coalesce(e.abbr, '?') || '×' || p.qty, ' '), '')
      from public.placements p left join public.equipment_types e on e.id = p.equipment_type_id
     where p.job_id = v_job.id and not p.picked_up and not coalesce(p.superseded, false) and p.archived_at is null
    returning id into v_id;
    if v_id is null or (select qty_total from public.ext_requests where id = v_id) = 0 then
      delete from public.ext_requests where id = v_id; raise exception 'DFT_NO_PENDING';
    end if;
    select to_jsonb(x) into v_res from public.ext_requests x where x.id = v_id;

  elsif p_op = 'prop_create' then
    if v_role not in ('admin','manager') then raise exception 'RLS_DENIED'; end if;                  -- как политика prop_ins
    insert into public.proposals (id, no, date, counterparty_id, complex_id, unit_number, note, items, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date),
            (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid, coalesce(v_row->>'unit_number', 'DFTEST'), coalesce(v_row->>'note', ''),
            coalesce(v_row->'items', '[]'::jsonb), coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.proposals x where x.id = v_id;

  elsif p_op = 'rep_create' then
    if (v_row->>'created_by') is not null and (v_row->>'created_by')::uuid is distinct from p_actor then raise exception 'RLS_DENIED'; end if;   -- как политика rep_ins
    if (v_row->>'job_id') is not null and not exists (select 1 from public.jobs where id = (v_row->>'job_id')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if (v_row->>'proposal_id') is not null and not exists (select 1 from public.proposals where id = (v_row->>'proposal_id')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;   -- v1.09.53
    insert into public.repairs (id, no, date, counterparty_id, complex_id, unit_number, job_id, proposal_id, helper_ids, items, materials, note, note_en,
                                po_number, complete_by, sales_tax, freight, photos, hist, total, status, created_by, is_test, test_owner, test_run)
    values (coalesce((v_row->>'id')::uuid, gen_random_uuid()), 90000000 + nextval('public.jobs_test_no_seq'), coalesce((v_row->>'date')::date, current_date), (v_row->>'counterparty_id')::uuid, (v_row->>'complex_id')::uuid,
            coalesce(v_row->>'unit_number', 'DFTEST'), (v_row->>'job_id')::uuid, (v_row->>'proposal_id')::uuid, coalesce(v_row->'helper_ids', '[]'::jsonb), coalesce(v_row->'items', '[]'::jsonb), coalesce(v_row->'materials', '[]'::jsonb),
            coalesce(v_row->>'note', ''), coalesce(v_row->>'note_en', ''),
            coalesce(v_row->>'po_number', ''), (v_row->>'complete_by')::date, coalesce((v_row->>'sales_tax')::numeric, 0), coalesce((v_row->>'freight')::numeric, 0),
            coalesce(v_row->'photos', '{"before":[],"after":[]}'::jsonb), coalesce(v_row->'hist', '[]'::jsonb),
            coalesce((v_row->>'total')::numeric, 0), coalesce(v_row->>'status', 'draft'), p_actor, true, p_caller, v_run)
    returning id into v_id;
    select to_jsonb(x) into v_res from public.repairs x where x.id = v_id;

  elsif p_op in ('rep_update', 'rep_get') then
    select * into v_rep from public.repairs where id = (p_args->>'id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not v_rep.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_rep.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    /* v1.09.53: строгий rep_get — видимость как у политики rep_sel для того, от чьего имени запрос (тест «посторонний не видит») */
    if p_op = 'rep_get' and coalesce((p_args->>'strict')::boolean, false)
       and not (v_role in ('admin','manager','accountant') or v_rep.created_by = p_actor
                or coalesce(v_rep.helper_ids, '[]'::jsonb) ? p_actor::text
                or (v_rep.job_id is not null and public.can_view_job(v_rep.job_id))) then
      raise exception 'RLS_DENIED';
    end if;
    if p_op = 'rep_update' then
      if not (v_role in ('admin','manager') or v_rep.created_by = p_actor) then raise exception 'RLS_DENIED'; end if;                  -- как политика rep_upd
      /* v1.09.53: тестовый ремонт связывается только с тестовыми инвойсом и пропозалом */
      if v_patch ? 'job_id' and (v_patch->>'job_id') is not null and not exists (select 1 from public.jobs where id = (v_patch->>'job_id')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      if v_patch ? 'proposal_id' and (v_patch->>'proposal_id') is not null and not exists (select 1 from public.proposals where id = (v_patch->>'proposal_id')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      update public.repairs x set (date, counterparty_id, complex_id, unit_number, items, materials, note, note_en, po_number, complete_by, sales_tax, freight, photos,
                                   total, status, decline_reason, decided_by, decided_at, hist, helper_ids, job_id, proposal_id, archived_at, archived_by, arch_note)
        = (select r.date, r.counterparty_id, r.complex_id, r.unit_number, r.items, r.materials, r.note, r.note_en, r.po_number, r.complete_by, r.sales_tax, r.freight, r.photos,
                  r.total, r.status, r.decline_reason, r.decided_by, r.decided_at, r.hist, r.helper_ids, r.job_id, r.proposal_id, r.archived_at, r.archived_by, r.arch_note
             from jsonb_populate_record(x, v_patch) r)
       where x.id = v_rep.id;
    end if;
    select to_jsonb(x) into v_res from public.repairs x where x.id = v_rep.id;

  elsif p_op = 'rpc' then
    v_fn := p_args->>'fn';
    -- цель любой функции — тестовый документ этого прогона
    v_id := coalesce((a->>'p_job')::uuid, case when v_fn = 'doc_request_decide' then (select doc_id from public.doc_requests where id = (a->>'p_id')::uuid)
                                               when v_fn = 'decide_ext_request' then (select job_id from public.ext_requests where id = (a->>'p_id')::uuid)
                                               when v_fn in ('doc_lock','doc_unlock') then (a->>'p_id')::uuid end);
    select * into v_job from public.jobs where id = v_id;
    if not found or not v_job.is_test then raise exception 'DFT_NOT_TEST_DOC'; end if;
    if v_job.test_owner is distinct from p_caller and v_crole <> 'admin' then raise exception 'DFT_NOT_YOUR_RUN'; end if;
    if v_fn = 'approve_job' then perform public.approve_job(v_id, (a->>'p_total')::numeric); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_request_edit' then v_res := to_jsonb(public.doc_request_edit(v_id, a->>'p_reason'));
    elsif v_fn = 'doc_request_decide' then perform public.doc_request_decide((a->>'p_id')::uuid, (a->>'p_grant')::boolean, a->>'p_answer'); v_res := 'null'::jsonb;
    elsif v_fn = 'doc_lock' then v_res := public.doc_lock('job', v_id, coalesce((a->>'p_force')::boolean, false));
    elsif v_fn = 'doc_unlock' then perform public.doc_unlock('job', v_id); v_res := 'null'::jsonb;
    elsif v_fn = 'decide_ext_request' then perform public.decide_ext_request((a->>'p_id')::uuid, (a->>'p_ok')::boolean); v_res := 'null'::jsonb;
    elsif v_fn = 'job_fix_no' then v_res := to_jsonb(public.job_fix_no(v_id, a->>'p_text'));
    elsif v_fn = 'link_job_proposal' then
      if (a->>'p_prop') is not null and not exists (select 1 from public.proposals where id = (a->>'p_prop')::uuid and is_test) then raise exception 'DFT_NOT_TEST_DOC'; end if;
      perform public.link_job_proposal(v_id, (a->>'p_prop')::uuid); v_res := 'null'::jsonb;
    else raise exception 'DFT_BAD_FN';
    end if;
    v_res := jsonb_build_object('result', v_res, 'job', (select to_jsonb(j) from public.jobs j where j.id = v_id));
  else
    raise exception 'DFT_BAD_OP';
  end if;

  perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  perform set_config('techlog.dft', '', true); perform set_config('techlog.test_owner', '', true);
  return jsonb_build_object('ok', true, 'data', v_res);
end $$;
revoke all on function public.dft_exec(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dft_exec(uuid, uuid, text, jsonb) to service_role;

update public.org_settings set docflow_v = 11 where id = 'org' and coalesce(docflow_v, 0) < 11;

-- ▄▄▄▄▄▄▄▄▄▄ САМОПРОВЕРКА ▄▄▄▄▄▄▄▄▄▄
do $$
declare miss text := '';
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'repairs' and policyname = 'rep_sel' and qual like '%helper_ids%') then miss := miss || ' rep_sel(бригада)'; end if;
  if position('rep_content_key(new)' in pg_get_functiondef('public.repairs_guard()'::regprocedure)) = 0 then miss := miss || ' repairs_guard(снятие апрува)'; end if;
  if position('exists (select 1 from public.repairs where id = new.id)' in pg_get_functiondef('public.repairs_guard()'::regprocedure)) = 0 then miss := miss || ' repairs_guard(upsert)'; end if;
  if position('Ремонт отклонён' in pg_get_functiondef('public.repairs_push_tg_fn()'::regprocedure)) = 0 then miss := miss || ' repairs_push_tg_fn(отклонён)'; end if;
  if position('''strict''' in pg_get_functiondef('public.dft_exec(uuid,uuid,text,jsonb)'::regprocedure)) = 0 then miss := miss || ' dft_exec(strict)'; end if;
  if has_function_privilege('authenticated', 'public.dft_exec(uuid,uuid,text,jsonb)', 'execute') then miss := miss || ' dft_exec(ДОСТУПНА КЛИЕНТУ!)'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'repairs_guard_t' and tgrelid = 'public.repairs'::regclass) then miss := miss || ' repairs_guard_t'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'repairs_push_tg' and tgrelid = 'public.repairs'::regclass) then miss := miss || ' repairs_push_tg'; end if;
  if (select coalesce(docflow_v, 0) from public.org_settings where id = 'org') < 11 then miss := miss || ' docflow_v'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт целиком.', miss;
  else raise notice 'TechLog: обновление до v1.09.53 применено — всё на месте.'; end if;
end $$;

select 'TechLog v1.09.53 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
