# TechLog · развёртывание серверной части (Supabase)

Актуально для v1.07.66. Клиент (GitHub Pages) и сервер обновляются независимо:
приложение — заливкой архива в репозиторий, база и edge-функции — отсюда.

---

## 1. База данных

Supabase → **SQL Editor** → вставить файл целиком → **Run**.

| Ситуация | Файл |
|---|---|
| Новый проект или база любого возраста | `full-install-1_07_64.sql` — один идемпотентный скрипт, добавляет только недостающее |
| База уже на уровне v1.07.62 | `update-to-1_07_64.sql` — короткая дельта |

В конце скрипт печатает NOTICE: «схема соответствует v1.07.64 — всё на месте» либо
WARNING со списком недостающего. Повторный запуск безопасен: `create … if not exists`,
`create or replace`, `drop policy if exists`, `on conflict do nothing`. Данные и
изменённый код приглашения не сбрасываются.

Разовые настройки проекта (делаются один раз):
- **Authentication → Sign In / Providers → Email**: выключить **Confirm email** — вход
  идёт по логину, а служебные адреса `login@techlog.example.com` писем не получают.
- Роли первому пользователю: `update public.profiles set role='admin' where login='<логин>';`

---

## 2. Edge-функции

Шесть функций обслуживают фото и видео: `media-begin`, `media-commit`, `media-view`,
`media-delete`, `media-oauth`, `media-health`. Переменные `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет сам — руками в
Secrets добавлять ничего не нужно. Настройку **Verify JWT** оставьте включённой:
приложение ходит с JWT сессии.

В репозитории лежат два комплекта одного и того же кода:

- `supabase/functions/` — **канонический**, для CLI: общий модуль в `_shared/google.ts`,
  импорт `"../_shared/google.ts"`.
- `supabase/functions-dashboard/` — **для редактора в браузере**: у каждой функции своя
  копия `google.ts` и импорт `"./google.ts"`, потому что редактор Dashboard не видит
  соседние папки. Пересобирается из первого: `python3 supabase/make-dashboard-copies.py`
  (а `--check` покажет расхождения, ничего не записывая).

### Вариант A — CLI (быстрее, Docker не нужен)

Нужен Node.js 18+. Из корня проекта:

```bash
npx supabase@latest login                       # откроется браузер
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest functions deploy media-begin media-commit media-delete \
  media-health media-oauth media-view --project-ref <project-ref>
```

`_shared/google.ts` подтягивается автоматически.

### Вариант B — Dashboard, без установки чего-либо

Edge Functions → **Deploy a new function → Via Editor**, для каждой функции:

1. **Function name** — точное имя (`media-oauth` и т. д.).
2. В `index.ts` вставить содержимое `supabase/functions-dashboard/<имя>/index.ts`.
3. **+ Add file** → имя ровно `google.ts` → вставить `supabase/functions-dashboard/<имя>/google.ts`.
4. **Deploy function**.

### Что передеплоивать при обновлении

Меняется не весь комплект. Ориентир по версиям:

| Версия | Что менялось |
|---|---|
| v1.07.64 | `media-health` (режимы `?cfg=1` / `?reveal=1`, чистка ID папки, создание своей папки, запись свободного места), `media-begin` (лимиты фото/видео из `org_settings`), `media-commit` (обновление свободного места не чаще раза в 6 часов) |
| v1.07.65–66 | функции не менялись — достаточно залить архив приложения |

---

## 3. Google Drive (разово)

console.cloud.google.com → проект:

1. **APIs & Services → Library → Google Drive API** → Enable.
2. **Credentials → Create OAuth client ID → Web application**; в *Authorized redirect URIs*
   вставить адрес из поля «Redirect URI» в настройках приложения символ в символ
   (например `https://<аккаунт>.github.io/TechLog/` — со слэшем на конце).
3. **Google Auth Platform → Branding**: название, User support email, Developer contact,
   плюс ссылки на страницы, лежащие в этом же репозитории:
   - Application home page — `https://<аккаунт>.github.io/TechLog/`
   - Privacy policy — `https://<аккаунт>.github.io/TechLog/privacy.html`
   - Terms of service — `https://<аккаунт>.github.io/TechLog/terms.html`
4. **Audience → Publish app** (статус *In production*). Скоуп `drive.file` — несенситивный,
   верификация не требуется. Если оставить *Testing*, архивный аккаунт нужно внести в
   **Test users**, и refresh-токен будет умирать каждые 7 дней.
5. В приложении: Настройки → «Фото и видео → Google Drive» → Client ID, Client Secret и
   папка (можно вставить ссылку на папку целиком) → «Сохранить ключи» → «Подключить
   Google» под **архивным** аккаунтом фирмы → «Тест соединения».

Про папку: `drive.file` даёт доступ только к тому, что создало само приложение, поэтому
папку, сделанную руками в интерфейсе Диска, оно не видит. При тесте соединения приложение
создаёт собственную папку `TechLog Archive` и запоминает её ID — это нормальное поведение,
а не ошибка.

---

## 4. Если что-то не работает

| Симптом | Причина | Что делать |
|---|---|---|
| «функции не задеплоены», `Failed to fetch`, 404 | функции не загружены в проект | раздел 2 |
| `⛔ Google OAuth: 401` / `UNAUTHORIZED` | сессия истекла между уходом на Google и возвратом | войти заново и повторить «Подключить Google» |
| `FORBIDDEN` | подключает не админ | зайти под администратором |
| `KEYS_NOT_SAVED` | Client ID/Secret не в базе | «Сохранить ключи», затем «Подключить Google» |
| `redirect_uri_mismatch` | URI в Google Console не совпадает | раздел 3, п. 2 |
| `access_denied` / «app not verified» | аккаунт не в Test users и приложение не опубликовано | раздел 3, п. 4 |
| `NO_REFRESH_TOKEN: {"access_token"…}` | Google уже выдавал токен этому клиенту | myaccount.google.com/permissions → удалить доступ → подключить снова |
| `NO_REFRESH_TOKEN: {"error":"invalid_client"…}` | неверный Client Secret | вставить секрет заново → сохранить → подключить |
| `DRIVE_NOT_CONFIGURED` | нет refresh-токена | раздел 3, п. 5 |
| `GOOGLE_AUTH: {"error":"invalid_grant"…}` | токен отозван или истёк (7 дней в режиме Testing) | опубликовать приложение и подключить заново |
| «Пробная запись в папку 🔴 … File not found» | ID папки с мусором из ссылки либо папка не создана приложением | «Тест соединения» — он почистит ID и при необходимости создаст свою папку |
| Устаревшая подсказка про SQL-файл | база ниже текущей версии | выполнить файл из раздела 1 |

Диагностика в приложении (Настройки → «Диагностика») проверяет интернет, базу, сессию,
хранилище миниатюр, edge-функции и Google Drive; у админа есть ещё проверка всех таблиц и
функций БД с указанием нужного SQL-файла.
