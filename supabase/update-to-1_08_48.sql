-- Обновление БД до v1.08.48 (после full-install-1_08_39 или новее).
-- Медиа у документа ремонта + уборка ТВ-сессий. Выполнять целиком.

-- =====================================================================
-- v1.08.48 · МЕДИА У ДОКУМЕНТА РЕМОНТА + УБОРКА ТВ-СЕССИЙ
-- 1) У ремонта появляются СВОИ фото, видео и вложения: media.repair_id.
--    Ровно один владелец записи — задача ИЛИ ремонт (check-ограничение).
--    Права чтения ремонта выделены в can_view_repair и добавлены в
--    политику media и в политику превью-миниатюр.
-- 2) tv_cleanup(mode): 'revoked' — стереть отозванные, 'inactive' —
--    стереть авторизованные, не выходившие в сеть больше суток,
--    'revoke_all' — завершить (отозвать) все активные. Только админ.
-- =====================================================================

alter table public.media
  add column if not exists repair_id uuid references public.repairs(id) on delete cascade;
alter table public.media alter column job_id drop not null;
alter table public.media drop constraint if exists media_owner_one;
alter table public.media
  add constraint media_owner_one check ((job_id is null) <> (repair_id is null));
create index if not exists media_repair_idx on public.media(repair_id, kind, seq);
create unique index if not exists media_rep_seq
  on public.media(repair_id, kind, seq) where repair_id is not null;

create or replace function public.can_view_repair(p_rep uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from repairs r where r.id = p_rep and (
       public.my_role() in ('admin','manager','accountant')
    or r.created_by = auth.uid()
    or (r.job_id is not null and public.can_view_job(r.job_id))
    or r.helper_ids ? auth.uid()::text
  ));
$$;
revoke all on function public.can_view_repair(uuid) from public, anon;
grant execute on function public.can_view_repair(uuid) to authenticated;

drop policy if exists media_sel on public.media;
create policy media_sel on public.media for select to authenticated
  using (owner_id = auth.uid()
     or (job_id    is not null and public.can_view_job(job_id))
     or (repair_id is not null and public.can_view_repair(repair_id)));

drop policy if exists thumbs_sel on storage.objects;
create policy thumbs_sel on storage.objects for select to authenticated
  using (
    bucket_id = 'media-thumbs'
    and exists (select 1 from public.media m
                where m.thumb_path = name
                  and (m.owner_id = auth.uid()
                    or (m.job_id    is not null and public.can_view_job(m.job_id))
                    or (m.repair_id is not null and public.can_view_repair(m.repair_id))))
  );

create or replace function public.tv_cleanup(p_mode text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_mode = 'revoked' then
    delete from tv_sessions where status = 'revoked';
    get diagnostics n = row_count;
  elsif p_mode = 'inactive' then
    delete from tv_sessions where status = 'approved'
      and coalesce(last_seen_at, created_at) < now() - interval '24 hours';
    get diagnostics n = row_count;
  elsif p_mode = 'revoke_all' then
    update tv_sessions set status = 'revoked' where status = 'approved';
    get diagnostics n = row_count;
  else
    raise exception 'BAD_MODE';
  end if;
  return n;
end $$;
revoke all on function public.tv_cleanup(text) from public, anon;
grant execute on function public.tv_cleanup(text) to authenticated;
