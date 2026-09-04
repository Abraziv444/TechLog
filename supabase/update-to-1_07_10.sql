-- =====================================================================
-- TechLog: обновление БД до v1.07.10
-- ОБЩИЙ ДОСТУП К ДОКУМЕНТАМ ДЛЯ КОВОРКЕРОВ
--
-- Выполните целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт идемпотентен: повторный запуск безопасен и ничего не затирает.
-- Если вы обновляетесь с версии старше 1.07.07 — сначала выполните
-- supabase/update-to-1_07_07.sql (или полный supabase/schema.sql).
-- =====================================================================

-- 1) Новые колонки --------------------------------------------------------
-- Галочка «Общий доступ к документу для коворкера» в самой работе:
alter table public.jobs
  add column if not exists shared_with_helpers boolean not null default false;
-- Глобальный выключатель функции (галочка админа в «Настройках»):
alter table public.org_settings
  add column if not exists allow_shared_jobs boolean not null default true;

-- 2) Общий доступ включён на уровне организации? --------------------------
create or replace function public.shared_jobs_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select allow_shared_jobs from public.org_settings where id = 'org'), true)
$$;

-- 3) Текущий пользователь — коворкер работы с включённым общим доступом? --
--    security definer: читает jobs в обход RLS, чтобы политики placements
--    не зависели от политик jobs и не было рекурсии.
create or replace function public.is_shared_job_helper(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.shared_jobs_enabled()
     and exists (
       select 1 from public.jobs j
       where j.id = p_job
         and j.shared_with_helpers
         and j.helper_ids ? auth.uid()::text
     )
$$;

-- 4) RLS работ: коворкер с общим доступом видит и правит работу -----------
--    (создание и удаление остаются за автором и админом, как раньше)
drop policy if exists jobs_sel on public.jobs;
create policy jobs_sel on public.jobs for select to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() in ('admin','manager')
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );

drop policy if exists jobs_upd on public.jobs;
create policy jobs_upd on public.jobs for update to authenticated
  using (
    technician_id = auth.uid()
    or public.my_role() = 'admin'
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  )
  with check (
    technician_id = auth.uid()
    or public.my_role() = 'admin'
    or (shared_with_helpers and helper_ids ? auth.uid()::text and public.shared_jobs_enabled())
  );

-- 5) RLS пикапов: коворкер видит и обслуживает размещения по общей работе -
--    (нужно, чтобы правка секции Equipment Rental коворкером корректно
--    создавала/обновляла/удаляла пикапы, а кнопка «Забрать» работала)
drop policy if exists pl_sel on public.placements;
create policy pl_sel on public.placements for select to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager')
         or public.is_shared_job_helper(job_id));

drop policy if exists pl_ins on public.placements;
create policy pl_ins on public.placements for insert to authenticated
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager')
              or public.is_shared_job_helper(job_id));

drop policy if exists pl_upd on public.placements;
create policy pl_upd on public.placements for update to authenticated
  using (technician_id = auth.uid() or public.my_role() in ('admin','manager')
         or public.is_shared_job_helper(job_id))
  with check (technician_id = auth.uid() or public.my_role() in ('admin','manager')
              or public.is_shared_job_helper(job_id));

drop policy if exists pl_del on public.placements;
create policy pl_del on public.placements for delete to authenticated
  using (technician_id = auth.uid() or public.my_role() = 'admin'
         or public.is_shared_job_helper(job_id));
