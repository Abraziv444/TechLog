-- ============================================================
-- TechLog · update to v1.08.15
-- Права и цены пропозала:
--   org_settings.prop_mgr_create  — менеджеру разрешено создавать пропозал
--   org_settings.prop_hide_prices — цены пропозала скрыты от всех, кроме
--     администратора (по умолчанию ВКЛЮЧЕНО)
-- Идемпотентно.
-- ============================================================
alter table public.org_settings
  add column if not exists prop_mgr_create  boolean not null default false,
  add column if not exists prop_hide_prices boolean not null default true;

insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
