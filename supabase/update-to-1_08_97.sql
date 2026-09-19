-- =====================================================================
-- TechLog · обновление до v1.08.97
--  · Бухгалтер (роль accountant) правит «Организацию (для PDF)» —
--    реквизиты бланков: company_name, company_short, assoc_line,
--    addr1..addr3, voice_line, fax_line, ship_method, legal_note.
--  · Политики org_settings_acc_ins / org_settings_acc_upd пускают
--    бухгалтера писать в строку настроек, а триггер
--    org_settings_acc_guard молча возвращает ВСЕ остальные колонки к
--    текущим значениям — права, лимиты, ключи, флаги бухгалтер не
--    изменит, даже если пришлёт их (и не затрёт свежие правки админа
--    устаревшей копией строки).
-- Идемпотентно: можно запускать повторно. С нуля — full-install-1_08_97.sql.
-- Edge Functions не менялись.
-- =====================================================================

-- 1) Политики: бухгалтер — только строка 'org' (админская org_settings_wr не трогается)
drop policy if exists org_settings_acc_ins on public.org_settings;
create policy org_settings_acc_ins on public.org_settings for insert to authenticated
  with check (public.my_role() = 'accountant' and id = 'org');
drop policy if exists org_settings_acc_upd on public.org_settings;
create policy org_settings_acc_upd on public.org_settings for update to authenticated
  using (public.my_role() = 'accountant' and id = 'org')
  with check (public.my_role() = 'accountant' and id = 'org');

-- 2) Сторож: у бухгалтера меняются только реквизиты для PDF
create or replace function public.org_settings_acc_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') = 'accountant' then
    new := jsonb_populate_record(new, to_jsonb(old) - array[
      'company_name','company_short','assoc_line','addr1','addr2','addr3',
      'voice_line','fax_line','ship_method','legal_note']);
  end if;
  return new;
end $$;
revoke all on function public.org_settings_acc_guard() from public, anon;
drop trigger if exists org_settings_acc_guard_tg on public.org_settings;
create trigger org_settings_acc_guard_tg before update on public.org_settings
  for each row execute function public.org_settings_acc_guard();

-- 3) Самопроверка
do $$
declare miss text := '';
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='org_settings' and policyname='org_settings_acc_upd')
     then miss := miss || ' org_settings_acc_upd'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='org_settings' and policyname='org_settings_acc_ins')
     then miss := miss || ' org_settings_acc_ins'; end if;
  if not exists (select 1 from pg_trigger where tgname='org_settings_acc_guard_tg' and not tgisinternal)
     then miss := miss || ' org_settings_acc_guard_tg'; end if;
  if miss <> '' then raise warning 'TechLog: НЕ ХВАТАЕТ:%  — перезапустите скрипт.', miss;
  else raise notice 'TechLog: схема соответствует v1.08.97 — всё на месте.'; end if;
end $$;

select 'TechLog v1.08.97 — скрипт выполнен. Смотрите NOTICE выше: «всё на месте» = готово.' as result;
