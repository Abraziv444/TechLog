-- ============================================================
-- TechLog · update to v1.07.85
-- PDF-инвойсы уезжают на Google Диск, в свою папку «Invoices».
--   media.kind      — четвёртый вид записи: 'invoice'
--   org_settings.gd_inv_folder — необязательная ССЫЛКА (или ID) чужой
--     папки Google Диска под инвойсы. Пусто — папка «Invoices» внутри
--     архива, рядом с «Photos» и «Files».
-- Идемпотентно: повторный запуск безопасен, данные не трогаются.
-- ============================================================
alter table public.media drop constraint if exists media_kind_check;
alter table public.media add constraint media_kind_check
  check (kind in ('photo','video','file','invoice'));

alter table public.org_settings
  add column if not exists gd_inv_folder text not null default '';

-- строка настроек существует и на старых базах
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
