-- v1.09.44 · «живые» данные для проверки ПОВТОРНОГО запуска full-install на рабочей базе.
-- Порядок (на отдельной тестовой базе с заглушкой Supabase):
--   psql -f supabase/full-install-X.sql;  psql -f tests/full-install-rerun.sql;  psql -f supabase/full-install-X.sql
-- Второй запуск должен пройти без ошибок. Здесь — строки со значениями, которые разрешают только ПОЗДНИЕ версии
-- проверок (CHECK): PDF-инвойс в media (раньше ранняя секция 1.07.76 сужала список видов и падала с 23514),
-- роль бухгалтера, закрытый запрос на правку, лимит вложений.
\set ON_ERROR_STOP 1
set session_replication_role = replica;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000044f1', 'rerun-test-1@x') on conflict do nothing;
insert into public.profiles (id, login, display_name, role) values ('00000000-0000-0000-0000-0000000044f1', 'rerun_test_acc', 'Rerun Acc', 'accountant')
  on conflict (id) do update set role = 'accountant';
insert into public.media (id, job_id, kind, seq, owner_id, status, file_name) values
  (gen_random_uuid(), gen_random_uuid(), 'photo',   1, '00000000-0000-0000-0000-0000000044f1', 'ready', 'rerun-test-p.jpg'),
  (gen_random_uuid(), gen_random_uuid(), 'video',   1, '00000000-0000-0000-0000-0000000044f1', 'ready', 'rerun-test-v.mp4'),
  (gen_random_uuid(), gen_random_uuid(), 'file',    1, '00000000-0000-0000-0000-0000000044f1', 'ready', 'rerun-test-f.pdf'),
  (gen_random_uuid(), gen_random_uuid(), 'invoice', 1, '00000000-0000-0000-0000-0000000044f1', 'ready', 'rerun-test-i.pdf');
do $$ begin
  if to_regclass('public.doc_requests') is not null then
    execute $q$insert into public.doc_requests (id, doc_kind, doc_id, requested_by, status, reason)
               values (gen_random_uuid(), 'job', gen_random_uuid(), '00000000-0000-0000-0000-0000000044f1', 'closed', 'rerun-test')$q$;
  end if;
exception when undefined_column then null; end $$;
update public.org_settings set media_max_file = 50 where id = 'org';
set session_replication_role = origin;
select 'rerun-test: «живые» строки добавлены — запустите full-install ещё раз' as result;
