-- =====================================================================
-- TechLog · УТРЕННЯЯ СВОДКА ПИКАПОВ ПО РАСПИСАНИЮ (необязательный файл, выполняется один раз).
-- Почему пуши «утром не приходили»: очередь уведомлений и сводку просроченных разгребает Edge
-- Function push, а будил её только открытый у кого-нибудь TechLog. Пока все спят — будить некому.
-- Здесь база сама дёргает функцию каждое утро: pg_cron + pg_net (оба есть в Supabase).
-- ПЕРЕД ЗАПУСКОМ: 1) Database → Extensions → включите pg_cron и pg_net;
--                 2) передеплойте Edge Function push (PUSH_VER 1.09.13);
--                 3) вставьте ниже anon-ключ проекта (тот же, что в config.js) вместо ВАШ_ANON_KEY.
-- Время: 11:30 UTC = 7:30 утра в Атланте летом (6:30 зимой). Повторный запуск файла безопасен.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  perform cron.unschedule('techlog-push-morning');
exception when others then null; end $$;

select cron.schedule('techlog-push-morning', '30 11 * * *', $cron$
  select net.http_post(
    url := 'https://ryquchrjayarvrdalvza.supabase.co/functions/v1/push?send=1&morning=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ВАШ_ANON_KEY',
      'x-cron-key', (select value from public.app_secrets where key = 'push_cron_key')),
    body := '{}'::jsonb);
$cron$);

-- заодно раз в 5 минут разгребаем очередь — уведомления (в том числе сообщения чата) доходят, даже когда TechLog ни у кого не открыт
do $$ begin
  perform cron.unschedule('techlog-push-queue');
exception when others then null; end $$;
select cron.schedule('techlog-push-queue', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://ryquchrjayarvrdalvza.supabase.co/functions/v1/push?send=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ВАШ_ANON_KEY',
      'x-cron-key', (select value from public.app_secrets where key = 'push_cron_key')),
    body := '{}'::jsonb);
$cron$);

select jobname, schedule from cron.job where jobname like 'techlog-push-%';
