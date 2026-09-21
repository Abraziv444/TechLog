-- =====================================================================
-- TechLog · PUSH-SETUP — выполняется ОДИН раз (повторный запуск безопасен). Заменяет прежний cron-push-morning.sql.
-- Что делает:
--   1) включает расширения pg_net (база сама зовёт Edge Function) и pg_cron (расписание);
--   2) кладёт в app_secrets адрес функции push и публичный anon-ключ проекта — тот же, что в config.js
--      (он и так отдаётся каждому браузеру; таблица app_secrets клиентам закрыта);
--   3) ставит расписание: утренняя сводка пикапов 11:30 UTC (7:30 в Атланте летом, 6:30 зимой)
--      и страховочный разбор очереди каждые 5 минут — на случай, если толчок от базы не дошёл.
-- ПЕРЕД ЗАПУСКОМ: выполнен update-to-1_09_22.sql и передеплоена Edge Function push (PUSH_VER 1.09.22).
-- ВАЖНО — «Verify JWT»: у этого проекта ключи нового формата (sb_publishable_…), это не JWT. База и расписание обращаются
-- к функции без входа пользователя, и шлюз отклонит их с 401, пока у функции включена проверка JWT. Откройте
-- Supabase → Edge Functions → push → Details и ВЫКЛЮЧИТЕ «Verify JWT» (Enforce JWT verification). Это безопасно:
-- функция сама пускает к рассылке только по секретному x-cron-key либо вошедшего пользователя, всё остальное — только вошедшим.
-- Ключ расписания (push_cron_key) функция push создаёт сама при первом обращении — откройте приложение
-- хотя бы раз после передеплоя, затем запускайте этот файл.
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into public.app_secrets (key, value) values
  ('push_fn_url', 'https://ryquchrjayarvrdalvza.supabase.co/functions/v1/push'),
  ('push_fn_key', 'sb_publishable_h_hFFmZ1cnUQJVsI-vEWOw_NW7MP6KM')
on conflict (key) do update set value = excluded.value;

do $$ begin perform cron.unschedule('techlog-push-morning'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('techlog-push-queue');   exception when others then null; end $$;

select cron.schedule('techlog-push-morning', '30 11 * * *', $cron$
  select net.http_post(
    url := (select value from public.app_secrets where key = 'push_fn_url') || '?send=1&morning=1',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', (select value from public.app_secrets where key = 'push_fn_key'),
      'x-cron-key', (select value from public.app_secrets where key = 'push_cron_key'))
      || case when (select value from public.app_secrets where key = 'push_fn_key') like 'eyJ%'
              then jsonb_build_object('Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'push_fn_key')) else '{}'::jsonb end,
    body := '{}'::jsonb, timeout_milliseconds := 10000);
$cron$);

select cron.schedule('techlog-push-queue', '*/5 * * * *', $cron$
  select net.http_post(
    url := (select value from public.app_secrets where key = 'push_fn_url') || '?send=1',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', (select value from public.app_secrets where key = 'push_fn_key'),
      'x-cron-key', (select value from public.app_secrets where key = 'push_cron_key'))
      || case when (select value from public.app_secrets where key = 'push_fn_key') like 'eyJ%'
              then jsonb_build_object('Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'push_fn_key')) else '{}'::jsonb end,
    body := '{}'::jsonb, timeout_milliseconds := 10000);
$cron$);

-- проверка: что записано и что запланировано
select key, case when key = 'push_fn_key' then left(value, 12) || '…' else value end as value
  from public.app_secrets where key in ('push_fn_url', 'push_fn_key') order by key;
select jobname, schedule from cron.job where jobname like 'techlog-push-%' order by jobname;
select case when exists (select 1 from public.app_secrets where key = 'push_cron_key')
  then 'ключ расписания есть — отправка от базы и расписание заработают сразу'
  else 'ключа расписания ЕЩЁ НЕТ: откройте TechLog (он обратится к функции push), затем всё заработает само' end as push_cron_key;

-- Диагностика: последние ответы функции на вызовы от базы. 200 — всё работает; 401 — не выключен «Verify JWT» (см. выше);
-- 403 — не совпал ключ расписания (откройте TechLog и запустите файл ещё раз). Пусто — вызовов ещё не было: это нормально.
select id, status_code, left(coalesce(content, error_msg, ''), 160) as answer, created
  from net._http_response order by created desc limit 5;
