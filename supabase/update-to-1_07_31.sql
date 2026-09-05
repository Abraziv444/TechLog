-- =====================================================================
-- TechLog update-to-1_07_31 — ФОТО И ВИДЕО → Google Drive (интеграция)
-- Выполнить целиком в Supabase → SQL Editor → Run. Повторный запуск безопасен.
--
-- После SQL разверните функции (Supabase CLI, из корня репозитория):
--   supabase functions deploy media-begin media-commit media-view \
--     media-health media-delete media-oauth
-- Файлы функций лежат в supabase/functions/ этого репозитория.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Общая функция «право видеть работу». ВАЖНО: она же используется
-- политикой prop_sel из update-to-1_07_27 — если тот файл падал с
-- ошибкой "function can_view_job does not exist", выполните его ПОВТОРНО
-- после этого файла.
-- ---------------------------------------------------------------------
create or replace function public.can_view_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.technician_id = auth.uid()
      or public.my_role() in ('admin','manager')
      or (j.shared_with_helpers and j.helper_ids ? auth.uid()::text
          and public.shared_jobs_enabled())
    )
  )
$$;

-- ---------------------------------------------------------------------
-- 1. Таблица медиафайлов
-- ---------------------------------------------------------------------
create table if not exists public.media (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('photo','video')),
  seq           int  not null,
  file_name     text not null,
  mime          text not null default '',
  size_bytes    bigint not null default 0,
  drive_file_id text,
  thumb_path    text,
  status        text not null default 'uploading'
                check (status in ('uploading','ready')),
  created_at    timestamptz not null default now(),
  unique (job_id, kind, seq)
);
create index if not exists media_job_idx   on public.media(job_id, kind, seq);
create index if not exists media_owner_idx on public.media(owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. RLS: клиент только ЧИТАЕТ. Вставку/изменение делает исключительно
-- Edge Function (service role), удаление — только админ через
-- media-delete. Сотрудник после отправки удалить или подменить фото
-- не может — защита от «подчистки» архива.
-- ---------------------------------------------------------------------
alter table public.media enable row level security;
drop policy if exists media_sel on public.media;
create policy media_sel on public.media for select to authenticated
  using (owner_id = auth.uid() or public.can_view_job(job_id));
-- политик insert/update/delete для authenticated НЕТ — это осознанно.

-- ---------------------------------------------------------------------
-- 3. Bucket миниатюр (полноразмерные файлы живут в Google Drive)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media-thumbs','media-thumbs', false)
on conflict (id) do nothing;

drop policy if exists thumbs_ins on storage.objects;
create policy thumbs_ins on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-thumbs'
    and exists (select 1 from public.media m
                where m.thumb_path = name and m.owner_id = auth.uid())
  );
drop policy if exists thumbs_sel on storage.objects;
create policy thumbs_sel on storage.objects for select to authenticated
  using (
    bucket_id = 'media-thumbs'
    and exists (select 1 from public.media m
                where m.thumb_path = name
                  and (m.owner_id = auth.uid() or public.can_view_job(m.job_id)))
  );

-- ---------------------------------------------------------------------
-- 4. Настройки Drive из админки. Секреты кладутся в app_secrets
-- (RLS без политик: клиент их НИКОГДА не прочитает; читает только
-- service role внутри Edge Functions). Пустые параметры не затирают
-- сохранённые значения. Refresh-token из интерфейса не вводится —
-- его сохраняет функция media-oauth после кнопки «Подключить Google».
-- ---------------------------------------------------------------------
create or replace function public.admin_set_drive_config(
  p_client_id text, p_client_secret text, p_refresh_token text, p_folder_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_client_id', trim(p_client_id))
    on conflict (key) do update set value = excluded.value; end if;
  if nullif(trim(p_client_secret),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_client_secret', trim(p_client_secret))
    on conflict (key) do update set value = excluded.value; end if;
  if nullif(trim(p_refresh_token),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_refresh_token', trim(p_refresh_token))
    on conflict (key) do update set value = excluded.value; end if;
  if nullif(trim(p_folder_id),'') is not null then
    insert into public.app_secrets(key,value) values ('gd_folder_id', trim(p_folder_id))
    on conflict (key) do update set value = excluded.value; end if;
end $$;
revoke all on function public.admin_set_drive_config(text,text,text,text) from public, anon;
grant execute on function public.admin_set_drive_config(text,text,text,text) to authenticated;
