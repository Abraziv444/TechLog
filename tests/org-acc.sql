-- v1.08.97 · функциональная проверка: бухгалтер правит только реквизиты PDF в org_settings.
-- Запуск: локальный PostgreSQL + заглушка Supabase, база после full-install-1_08_97.sql
-- (или 1_08_71 + update-to-1_08_97.sql), права authenticated на таблицы public.
-- psql -tA -d <база> -f tests/org-acc.sql → «ИТОГ: 10 ✓ / 0 ✗». Всё в BEGIN…ROLLBACK.
-- Функциональная проверка v1.08.97: бухгалтер правит только реквизиты PDF
\set ON_ERROR_STOP 1
begin;
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'adm@x'), ('00000000-0000-0000-0000-00000000000b', 'acc@x'),
  ('00000000-0000-0000-0000-00000000000c', 'tech@x'), ('00000000-0000-0000-0000-00000000000d', 'mgr@x')
  on conflict do nothing;
insert into public.profiles (id, login, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 't_adm', 'Adm', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 't_acc', 'Acc', 'accountant'),
  ('00000000-0000-0000-0000-00000000000c', 't_tech', 'Tech', 'tech'),
  ('00000000-0000-0000-0000-00000000000d', 't_mgr', 'Mgr', 'manager')
  on conflict (id) do update set role = excluded.role;
insert into public.org_settings (id) values ('org') on conflict do nothing;
update public.org_settings set company_name = 'APC, LLC', manager_can_approve = false, default_rent_days = 3, legal_note = '' where id = 'org';
set session_replication_role = origin;
create temp table r (n int, name text, ok boolean, note text);
grant all on r to authenticated;
create temp sequence rn; grant usage, select, update on sequence rn to authenticated;

-- 1) бухгалтер: upsert всей строки — PDF-поля меняются, флаги/степперы нет
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
set local role authenticated;
insert into public.org_settings as o (id, company_name, legal_note, addr1, voice_line, manager_can_approve, default_rent_days)
  values ('org', 'ACC Corp', 'acc note', 'PO BOX 1', '404-000-0000', true, 29)
  on conflict (id) do update set company_name = excluded.company_name, legal_note = excluded.legal_note, addr1 = excluded.addr1,
    voice_line = excluded.voice_line, manager_can_approve = excluded.manager_can_approve, default_rent_days = excluded.default_rent_days;
insert into r select nextval('rn'), 'бухгалтер: реквизиты PDF сохранились',
  company_name = 'ACC Corp' and legal_note = 'acc note' and addr1 = 'PO BOX 1' and voice_line = '404-000-0000', company_name from public.org_settings where id = 'org';
insert into r select nextval('rn'), 'бухгалтер: права и степперы не изменились (сторож вернул)',
  manager_can_approve = false and default_rent_days = 3, manager_can_approve::text || '/' || default_rent_days from public.org_settings where id = 'org';
-- 2) бухгалтер: обычный update флага — молча не меняется
update public.org_settings set stock_visible_all = false, company_short = 'AC' where id = 'org';
insert into r select nextval('rn'), 'бухгалтер: update флага не проходит, короткое имя проходит',
  stock_visible_all = true and company_short = 'AC', stock_visible_all::text || '/' || company_short from public.org_settings where id = 'org';
-- 3) бухгалтер: вторую строку настроек создать нельзя
do $$ begin
  begin insert into public.org_settings (id, company_name) values ('evil', 'x');
    insert into r values (nextval('rn'), 'бухгалтер: вторая строка настроек запрещена', false, 'вставилась');
  exception when insufficient_privilege then insert into r values (nextval('rn'), 'бухгалтер: вторая строка настроек запрещена', true, sqlerrm); end;
end $$;
reset role;

-- 4) техник: запись в настройки запрещена
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
set local role authenticated;
update public.org_settings set company_name = 'TECH' where id = 'org';
insert into r select nextval('rn'), 'техник: update ничего не меняет (RLS)', company_name = 'ACC Corp', company_name from public.org_settings where id = 'org';
do $$ begin
  begin insert into public.org_settings (id, company_name) values ('org', 'TECH') on conflict (id) do update set company_name = excluded.company_name;
    insert into r values (nextval('rn'), 'техник: upsert отклонён', false, 'прошёл');
  exception when insufficient_privilege then insert into r values (nextval('rn'), 'техник: upsert отклонён', true, sqlerrm); end;
end $$;
reset role;

-- 5) менеджер: как и раньше — запись закрыта
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
set local role authenticated;
update public.org_settings set company_name = 'MGR' where id = 'org';
insert into r select nextval('rn'), 'менеджер: update ничего не меняет', company_name = 'ACC Corp', company_name from public.org_settings where id = 'org';
reset role;

-- 6) админ: меняет всё, как раньше
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
set local role authenticated;
insert into public.org_settings as o (id, company_name, manager_can_approve, default_rent_days)
  values ('org', 'ADM Co', true, 7)
  on conflict (id) do update set company_name = excluded.company_name, manager_can_approve = excluded.manager_can_approve, default_rent_days = excluded.default_rent_days;
insert into r select nextval('rn'), 'админ: меняет и реквизиты, и права',
  company_name = 'ADM Co' and manager_can_approve and default_rent_days = 7, company_name || '/' || manager_can_approve || '/' || default_rent_days from public.org_settings where id = 'org';
reset role;

-- 7) бухгалтер присылает устаревшую копию — свежая правка админа не затирается
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
set local role authenticated;
update public.org_settings set company_name = 'ACC 2', manager_can_approve = false, default_rent_days = 3 where id = 'org';
insert into r select nextval('rn'), 'бухгалтер со старой копией: права админа (true/7) целы, имя поменялось',
  manager_can_approve and default_rent_days = 7 and company_name = 'ACC 2', company_name || '/' || manager_can_approve || '/' || default_rent_days from public.org_settings where id = 'org';
reset role;

-- 8) SQL-редактор (my_role() = null): сторож не мешает
select set_config('request.jwt.claim.sub', '', true);
update public.org_settings set stock_visible_all = false where id = 'org';
insert into r select nextval('rn'), 'SQL-редактор без роли: правка флага проходит', stock_visible_all = false, stock_visible_all::text from public.org_settings where id = 'org';

select case when ok then '✓' else '✗' end || ' ' || name || coalesce(' — ' || note, '') from r order by n;
select 'ИТОГ: ' || count(*) filter (where ok) || ' ✓ / ' || count(*) filter (where not ok) || ' ✗' from r;
rollback;
