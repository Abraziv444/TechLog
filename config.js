/* =====================================================================
   TechLog — конфигурация Supabase.
   Publishable/anon key — публичный по дизайну Supabase; доступ к данным
   ограничивают RLS-политики (см. supabase/schema.sql).
   НИКОГДА не вписывайте сюда пароль базы данных или service_role key.
   ===================================================================== */
window.TECHLOG_CONFIG = {
  SUPABASE_URL: "https://ryquchrjayarvrdalvza.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_h_hFFmZ1cnUQJVsI-vEWOw_NW7MP6KM",
  /* Служебный домен для входа по логину: login@<домен>.
     Письма на него НЕ отправляются (Confirm email выключен), нужен только
     синтаксически валидный адрес. Supabase отвергает спец-домены вроде .local,
     поэтому по умолчанию — зарезервированный IANA example.com (почта на нём
     не существует в принципе). Можно заменить на свой домен. */
  AUTH_EMAIL_DOMAIN: "techlog.example.com"
};
