-- ============================================================
-- TechLog · update to v1.07.83
-- Двуязычные заметки: русский текст остаётся в приложении,
-- в PDF печатается только английский перевод. Перевод лежит
-- РЯДОМ с оригиналом и никогда его не затирает.
--   jobs.note_en       — перевод заметки инвойса
--   proposals.note_en  — перевод заметки пропозала
-- Строки «Прочее», примечание Air Duct и описания позиций
-- пропозала хранят перевод внутри jsonb (form_data, items) —
-- для них колонки не нужны.
-- Плюс четыре настройки организации: напоминание о
-- непереведённых документах, автоперевод, интервал проверки
-- и e-mail для бесплатного переводчика.
-- Идемпотентно: повторный запуск безопасен, данные не трогаются.
-- ============================================================
alter table public.jobs
  add column if not exists note_en text not null default '';

alter table public.proposals
  add column if not exists note_en text not null default '';

alter table public.org_settings
  add column if not exists tr_remind       boolean not null default true,
  add column if not exists tr_auto         boolean not null default false,
  add column if not exists tr_interval_min int     not null default 60,
  add column if not exists tr_email        text    not null default '';

-- границы те же, что у степпера в интерфейсе (15…480 минут)
alter table public.org_settings drop constraint if exists org_tr_interval_ck;
alter table public.org_settings add constraint org_tr_interval_ck
  check (tr_interval_min between 15 and 480);

-- строка настроек существует и на старых базах
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
