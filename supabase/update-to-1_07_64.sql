-- ============================================================
-- TechLog · update to v1.07.64
-- 1) Лимиты фото и видео на документ — настраиваются админом
--    (степперы в «Настройках»), проверяются сервером в media-begin.
-- 2) Свободное место на Google Диске — снимается при тесте
--    подключения и при заливке файлов (media-health / media-commit),
--    хранится здесь, чтобы предупреждение видел и менеджер.
-- Идемпотентно: повторный запуск безопасен, RLS не меняется.
-- ============================================================
alter table public.org_settings
  add column if not exists media_max_photo int not null default 10,
  add column if not exists media_max_video int not null default 2,
  add column if not exists gd_used_gb      numeric,
  add column if not exists gd_limit_gb     numeric,
  add column if not exists gd_free_pct     numeric,
  add column if not exists gd_account      text,
  add column if not exists gd_checked_at   timestamptz;

-- разумные границы: те же, что у степперов в интерфейсе
alter table public.org_settings drop constraint if exists org_media_limits_ck;
alter table public.org_settings add constraint org_media_limits_ck
  check (media_max_photo between 1 and 50 and media_max_video between 0 and 10);

-- строка настроек существует и на старых базах
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
