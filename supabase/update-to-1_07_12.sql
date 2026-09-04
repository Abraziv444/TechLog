-- =====================================================================
-- TechLog: обновление БД до v1.07.12
-- ПРОДЛЕНИЕ АРЕНДЫ ОБОРУДОВАНИЯ И ИСТОРИЯ РАБОТЫ
--
-- Выполните целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт идемпотентен: повторный запуск безопасен и ничего не затирает.
-- Если вы обновляетесь с версии старше 1.07.10 — сначала выполните
-- supabase/update-to-1_07_10.sql (или полный supabase/schema.sql).
-- =====================================================================

-- Продление = «второй пикап»: новое размещение со ссылкой на исходное (ext_of).
-- Исходное при полном продлении помечается superseded (закрыто продлением)
-- и остаётся в истории работы; при частичном — у него уменьшается qty.
alter table public.placements
  add column if not exists ext_of uuid references public.placements(id) on delete set null;
alter table public.placements
  add column if not exists superseded boolean not null default false;
alter table public.placements
  add column if not exists superseded_at timestamptz;

create index if not exists placements_ext_idx on public.placements(ext_of);

-- RLS-политики менять не нужно: политики v1.07.10 (владелец / менеджер / админ /
-- коворкер с общим доступом через is_shared_job_helper) полностью покрывают
-- строки-продления, так как это обычные записи placements той же работы.
