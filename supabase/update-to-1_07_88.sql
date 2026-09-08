-- ============================================================
-- TechLog · update to v1.07.88
-- Архив (корзина) документов вместо прямого удаления.
--   jobs.archived_at / archived_by, proposals.archived_at / archived_by
--     — документ помечен на удаление: из рабочих списков он уходит,
--       но остаётся в Архиве, откуда его можно вернуть.
--   media.archived_at — файл переехал в папку «Архив TechLog» на Диске.
-- Насовсем документ и его файлы удаляются ТОЛЬКО из Архива.
-- Идемпотентно: повторный запуск безопасен, данные не трогаются.
-- ============================================================
alter table public.jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;
create index if not exists jobs_archived_idx on public.jobs(archived_at);

alter table public.proposals
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;
create index if not exists proposals_archived_idx on public.proposals(archived_at);

alter table public.media
  add column if not exists archived_at timestamptz;

-- строка настроек существует и на старых базах
insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
