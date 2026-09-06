-- =====================================================================
-- TechLog · update-to-1_07_49.sql — личная настройка доски
-- Идемпотентно: безопасно выполнять повторно.
-- =====================================================================
alter table public.profiles add column if not exists board_cols int;
comment on column public.profiles.board_cols is
  'Личная настройка: сколько колонок сотрудников умещать на доске (ПК). NULL = авто. Пишется самим пользователем (policy profiles_upd: self).';
