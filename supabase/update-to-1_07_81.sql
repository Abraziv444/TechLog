-- ============================================================
-- TechLog · update to v1.07.81
-- Лимит вложений «скрепкой» переезжает из кода в настройки:
-- админ задаёт его степпером рядом с лимитами фото и видео,
-- проверяет по-прежнему сервер (media-begin читает эту строку).
-- До этой версии в коде функции стояло жёсткое «20 файлов».
-- Идемпотентно: повторный запуск безопасен, данные не трогаются.
-- ============================================================
alter table public.org_settings
  add column if not exists media_max_file int not null default 20;

-- границы те же, что у степперов в интерфейсе
alter table public.org_settings drop constraint if exists org_media_limits_ck;
alter table public.org_settings add constraint org_media_limits_ck
  check (media_max_photo between 1 and 50
     and media_max_video between 0 and 10
     and media_max_file  between 1 and 50);

-- строка настроек существует и на старых базах
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;

