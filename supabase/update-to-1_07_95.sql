-- ============================================================
-- TechLog · update to v1.07.95
-- Телефон и факс организации в шапке PDF-бланка.
--   org_settings.voice_line / fax_line — как в образце бланка
--   (Voice: … / Fax: …). Пусто — строка не печатается.
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================
alter table public.org_settings
  add column if not exists voice_line text not null default '',
  add column if not exists fax_line   text not null default '';

insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
