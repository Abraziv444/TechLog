-- ============================================================
-- TechLog · update to v1.07.61
-- Моточасы осушителя (DHM) в размещениях: показание на старте
-- работы и на момент проверки. Идемпотентно, RLS не меняется.
-- ============================================================
alter table public.placements
  add column if not exists dhm_hours_start numeric,
  add column if not exists dhm_hours_check numeric;
