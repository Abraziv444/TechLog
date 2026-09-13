-- =====================================================================
-- TechLog · tests/study.sql — сквозной автотест учёбы (v1.08.51)
-- ---------------------------------------------------------------------
-- Проверяет:
--   · колонки org_settings.study_on/study_all/study_pass и
--     profiles.study_access/study_off на месте, значения по умолчанию;
--   · profiles_guard v3: техник свою study_off меняет, study_access —
--     FORBIDDEN_FIELD; админ ставит study_access кому угодно;
--   · study_sessions: техник пишет свои строки (test и read), повторный
--     upsert той же строки (очередь) проходит; чужой user_id — RLS
--     режет (0 строк / ошибка политики);
--   · RLS чтения: техник видит только свои строки, менеджер — только
--     свои, админ — все; удалять может только админ;
--   · admin_restore_rows принимает study_sessions (дубль пропускается).
--
-- БЕЗОПАСЕН ДЛЯ ЛЮБОЙ БАЗЫ: одна транзакция, в конце ROLLBACK.
-- Требует схему v1.08.51 (update-to-1_08_51.sql или full-install-1_08_51.sql).
-- Запуск: psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/study.sql
-- Успех: NOTICE «УЧЁБА: все N проверок пройдены» и Rollback ниже.
-- =====================================================================

begin;

create temporary sequence if not exists tst_cnt;
grant usage, select, update on sequence tst_cnt to authenticated;

create or replace function pg_temp.ok(l text, c boolean) returns void language plpgsql as $$
begin
  if c is distinct from true then raise exception 'ТЕСТ [%]: условие ложно', l; end if;
  perform nextval('tst_cnt');
  raise notice '  ok %', l;
end $$;

do $$
declare
  A  uuid := 'ad000000-0000-4000-8000-00000000b001';  -- админ
  M  uuid := 'ad000000-0000-4000-8000-00000000b002';  -- менеджер
  B  uuid := 'ad000000-0000-4000-8000-00000000b003';  -- техник
  S1 uuid := 'a5000000-0000-4000-8000-00000000b011';  -- тест техника
  S2 uuid := 'a5000000-0000-4000-8000-00000000b012';  -- чтение техника
  S3 uuid := 'a5000000-0000-4000-8000-00000000b013';  -- тест менеджера
  r jsonb; msg text;
begin
  -- ---------- сид (триггеры молчат) ----------
  perform set_config('session_replication_role', 'replica', true);
  insert into auth.users (id) values (A), (M), (B);
  insert into public.profiles (id, login, display_name, role) values
    (A, 'tst_admin', 'ТестАдмин', 'admin'),
    (M, 'tst_mgr',   'ТестМенеджер', 'manager'),
    (B, 'tst_tech',  'ТестТехник', 'tech');
  insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
  perform set_config('session_replication_role', 'origin', true);

  -- ---------- колонки и умолчания ----------
  perform pg_temp.ok('org_settings.study_on по умолчанию true',  (select study_on  from public.org_settings where id = 'org'));
  perform pg_temp.ok('org_settings.study_all по умолчанию true', (select study_all from public.org_settings where id = 'org'));
  perform pg_temp.ok('org_settings.study_pass по умолчанию 70',  (select study_pass from public.org_settings where id = 'org') = 70);
  perform pg_temp.ok('profiles.study_off по умолчанию false',    (select study_off from public.profiles where id = B) = false);
  perform pg_temp.ok('profiles.study_access по умолчанию null',  (select study_access from public.profiles where id = B) is null);

  -- ---------- profiles_guard v3 ----------
  perform set_config('request.jwt.claim.sub', B::text, true);
  update public.profiles set study_off = true where id = B;
  perform pg_temp.ok('техник прячет кнопку (study_off) — можно', (select study_off from public.profiles where id = B));
  begin
    update public.profiles set study_access = true where id = B;
    msg := 'нет ошибки';
  exception when others then msg := sqlerrm; end;
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.ok('техник сам себе study_access — FORBIDDEN_FIELD', msg like '%FORBIDDEN_FIELD%');
  perform set_config('request.jwt.claim.sub', A::text, true);
  update public.profiles set study_access = true where id = B;
  perform pg_temp.ok('админ ставит study_access технику', (select study_access from public.profiles where id = B));

  -- ---------- настройки организации: «по списку», порог 80 ----------
  update public.org_settings set study_all = false, study_pass = 80 where id = 'org';
  perform pg_temp.ok('study_all=false, study_pass=80 записаны', (select study_all = false and study_pass = 80 from public.org_settings where id = 'org'));

  -- ---------- admin_restore_rows принимает study_sessions ----------
  r := public.admin_restore_rows('study_sessions', jsonb_build_array(jsonb_build_object(
    'id', S3, 'user_id', M, 'kind', 'test', 'section', 3, 'total', 20, 'answered', 20, 'correct', 17, 'wrong', 3,
    'score_pct', 85, 'passed', true, 'duration_ms', 600000, 'answers', '[]'::jsonb)));
  perform pg_temp.ok('admin_restore_rows(study_sessions): 1 строка вставлена', (r->>'inserted')::int = 1);
  r := public.admin_restore_rows('study_sessions', jsonb_build_array(jsonb_build_object('id', S3, 'user_id', M, 'kind', 'test', 'section', 3)));
  perform pg_temp.ok('admin_restore_rows: дубль пропущен', (r->>'skipped')::int = 1);
  begin
    perform public.admin_restore_rows('study_sessions', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'user_id', M, 'kind', 'bogus', 'section', 1)));
    msg := 'нет ошибки';
  exception when others then msg := sqlerrm; end;
  perform set_config('request.jwt.claim.sub', A::text, true);
  r := public.admin_restore_rows('study_sessions', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'user_id', M, 'kind', 'bogus', 'section', 1)));
  perform pg_temp.ok('kind вне (test, read) — ошибка в отчёте восстановления', jsonb_array_length(r->'errors') = 1);

  -- ================= RLS под ролью authenticated (последний блок) =================
  perform set_config('request.jwt.claim.sub', B::text, true);
  set local role authenticated;
  insert into public.study_sessions (id, user_id, kind, section, quiz_id, mode, lang, started_at, finished_at, duration_ms,
    total, answered, correct, wrong, score_pct, passed, answers)
  values (S1, B, 'test', 5, 'section-5', 'learn', 'ru', now() - interval '10 min', now(), 600000,
    10, 10, 8, 2, 80, true, '[{"q":"S5-001","pick":["4"],"ok":true,"ms":12000,"hint":false}]'::jsonb);
  perform pg_temp.ok('RLS: техник пишет свой тест', (select count(*) from public.study_sessions where id = S1) = 1);
  -- повторный upsert из очереди — та же строка, update своей строки
  insert into public.study_sessions (id, user_id, kind, section, total, answered, correct, wrong, score_pct, passed, duration_ms)
  values (S1, B, 'test', 5, 10, 10, 8, 2, 80, true, 601000)
  on conflict (id) do update set duration_ms = excluded.duration_ms;
  perform pg_temp.ok('RLS: повторный upsert своей строки проходит', (select duration_ms from public.study_sessions where id = S1) = 601000);
  insert into public.study_sessions (id, user_id, kind, section, file, duration_ms)
  values (S2, B, 'read', 8, 'books/section-8.html', 120000);
  perform pg_temp.ok('RLS: техник пишет чтение', (select count(*) from public.study_sessions where id = S2 and kind = 'read') = 1);
  begin
    insert into public.study_sessions (id, user_id, kind, section) values (gen_random_uuid(), M, 'test', 1);
    msg := 'нет ошибки';
  exception when others then msg := sqlerrm; end;
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pg_temp.ok('RLS: чужой user_id технику не записать', msg like '%row-level security%');
  perform pg_temp.ok('RLS: техник видит только свои (2)', (select count(*) from public.study_sessions) = 2);
  delete from public.study_sessions where id = S1;
  perform pg_temp.ok('RLS: техник свою строку не удаляет (0 строк)', (select count(*) from public.study_sessions where id = S1) = 1);

  perform set_config('request.jwt.claim.sub', M::text, true);
  perform pg_temp.ok('RLS: менеджер видит только свои (1)', (select count(*) from public.study_sessions) = 1);
  update public.study_sessions set score_pct = 100 where id = S1;
  perform pg_temp.ok('RLS: менеджер чужую строку не правит', (select score_pct from public.study_sessions where id = S1) is null);

  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pg_temp.ok('RLS: админ видит все (3)', (select count(*) from public.study_sessions) = 3);
  perform pg_temp.ok('RLS: админ читает ответы техника', (select answers->0->>'q' from public.study_sessions where id = S1) = 'S5-001');
  delete from public.study_sessions where id = S2;
  perform pg_temp.ok('RLS: админ удаляет строку', (select count(*) from public.study_sessions where id = S2) = 0);

  raise notice '';
  raise notice 'УЧЁБА: все % проверок пройдены — транзакция откатывается, база не изменена.', currval('tst_cnt');
end $$;

rollback;
