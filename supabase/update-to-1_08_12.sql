-- ============================================================
-- TechLog · update to v1.08.12
-- Три корневых каталога на Google Диске и раскладка по смыслу:
--   фото/видео : <корень> / контрагент / комплекс / юнит
--   инвойсы    : <корень> / Ivan P / 2026_09
--   вложения   : <корень> / Ivan P / 2026_09 / номер документа
--
--   org_settings.gd_photo_folder / gd_files_folder — корни (ID или ссылка)
--   org_settings.gd_inv_helpers  — делать инвойс и коворкерам
--   drive_dirs — соответствие «сущность → папка на Диске». Ключ — ID
--     контрагента, комплекса, сотрудника или документа, а НЕ имя: тогда
--     переименование в справочнике не плодит новые папки, а поиск папки
--     не требует запроса к Диску на каждый файл.
-- Идемпотентно.
-- ============================================================
alter table public.org_settings
  add column if not exists gd_photo_folder text not null default '',
  add column if not exists gd_files_folder text not null default '',
  add column if not exists gd_inv_helpers  boolean not null default false;

create table if not exists public.drive_dirs (
  kind       text not null,             -- cp | cx | unit | tech | ym | doc
  key        text not null,             -- ID сущности (или составной ключ)
  folder_id  text not null,
  name       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);
alter table public.drive_dirs enable row level security;
drop policy if exists dd_sel on public.drive_dirs;
create policy dd_sel on public.drive_dirs for select to authenticated using (true);
drop policy if exists dd_all on public.drive_dirs;
create policy dd_all on public.drive_dirs for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
