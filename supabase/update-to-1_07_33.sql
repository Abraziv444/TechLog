-- =====================================================================
-- TechLog update-to-1_07_33 — пропозал по образцу клиента (QuickBooks)
-- Выполнить целиком. Повторный запуск безопасен.
-- =====================================================================
alter table public.proposals add column if not exists po_number  text not null default '';
alter table public.proposals add column if not exists complete_by date;
