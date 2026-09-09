-- ============================================================
-- TechLog · update to v1.07.97
-- Бланк пропозала по образцу заказчика:
--   org_settings.legal_note  — юридическая приписка внизу бланка
--     (текст правится в настройках, а не зашит в код)
--   org_settings.ship_method — «Shipping Method» в шапке (по умолчанию Airborne)
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================
alter table public.org_settings
  add column if not exists legal_note  text not null default '',
  add column if not exists ship_method text not null default 'Airborne';

insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
