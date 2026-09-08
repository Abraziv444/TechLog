-- ============================================================
-- TechLog · update to v1.07.78
-- Работа-черновик БЕЗ назначенного сотрудника.
-- Менеджер или админ создаёт задание, не выбирая исполнителя;
-- такая работа висит на доске отдельной полосой «Работы без
-- исполнителя», пока её кому-нибудь не назначат.
--
-- Что меняется:
--   1) jobs.technician_id и placements.technician_id становятся
--      необязательными (было not null);
--   2) политики RLS: менеджер может создать работу и назначить
--      исполнителя на ничейную работу. Сотрудник ничейных работ
--      НЕ видит (technician_id = auth.uid() для NULL не выполняется),
--      то есть доступ никому не расширяется.
-- Идемпотентно: повторный запуск безопасен, данные не трогаются.
-- ============================================================

alter table public.jobs       alter column technician_id drop not null;
alter table public.placements alter column technician_id drop not null;

-- создание работы: менеджер тоже может (в т.ч. ничейную и на другого)
drop policy if exists jobs_ins on public.jobs;
create policy jobs_ins on public.jobs for insert to authenticated
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager'));

-- правка работы: у менеджера добавляется только ничейная работа
-- (чтобы можно было назначить исполнителя); всё остальное как было
drop policy if exists jobs_upd on public.jobs;
create policy jobs_upd on public.jobs for update to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() = 'admin'
    or (public.my_role() = 'manager' and technician_id is null)
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  )
  with check (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager')
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );

-- размещения ничейной работы: та же логика для менеджера
drop policy if exists pl_upd on public.placements;
create policy pl_upd on public.placements for update to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager')
         or technician_id is null
         or public.is_shared_job_helper(job_id))
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager')
              or public.is_shared_job_helper(job_id));

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='jobs'
               and column_name='technician_id' and is_nullable='NO')
  then raise warning 'TechLog: jobs.technician_id всё ещё NOT NULL — скрипт не применился.';
  else raise notice 'TechLog: работы без исполнителя разрешены — v1.07.78 применён.';
  end if;
end $$;
