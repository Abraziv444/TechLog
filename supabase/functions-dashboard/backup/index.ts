import { svc, userClient, CORS, jres, driveToken, driveConfig, monthFolder } from "./google.ts";

/* =====================================================================
   v1.08.33 · BACKUP — SQL-бэкап данных в Google Drive.
   Собирает ВСЕ данные фирмы (включая auth-пользователей с хэшами
   паролей и app_secrets через RPC backup_dump) в один .sql-файл с
   INSERT'ами и кладёт его в папку «TechLog Backups» корневой папки
   Google Drive (той же, что настроена для фото).

   v1.09.03 · ТРИ ПОЛКИ ХРАНЕНИЯ (вид копии — в имени файла И в
   appProperties.tl_kind файла на Диске):
     ADMIN   — бэкап, сделанный админом вручную («Сделать бэкап сейчас»).
               TechLog-backup-ГГГГ-ММ-ДД_ЧЧММ-ADMIN.sql. Хранится ВЕЧНО:
               функция его не удаляет и не трогает никогда.
     weekly  — одна копия на ISO-неделю: TechLog-backup-ГГГГ-ММ-ДД-weekly-
               ГГГГ-Wнн.sql. Хранится ВЕЧНО. Делается первым автобэкапом
               недели (копия дневного файла средствами Диска).
     daily   — автобэкап, не чаще одного в день (дата по Нью-Йорку):
               TechLog-backup-ГГГГ-ММ-ДД-daily.sql. Хранятся последние 8
               дней, более старые уходят в КОРЗИНУ Диска (30 дней на возврат).
   Ротация работает по «белому списку»: удалить можно только файл, у которого
   И имя оканчивается на -daily.sql, И appProperties.tl_kind = daily. Всё
   остальное в папке (ручные, недельные, файлы старого формата без пометки,
   переименованные или положенные руками) функция не удаляет НИКОГДА.

   Восстановление: чистая база → supabase/full-install-*.sql → затем
   этот файл целиком в SQL Editor. Дамп сам включает replica-режим,
   поэтому триггеры и защиты не мешают, а identity-счётчики (номера
   документов) подтягиваются в конце.

   Режимы:
     ?ping=1  — диагностика;
     ?run=1&kind=admin — ручной бэкап админа (вечный). Права: админ (JWT);
     ?run=1&kind=auto  — автобэкап: daily, если за сегодня его ещё нет, и
                weekly, если за эту неделю его ещё нет; иначе {skipped:true}
                и дамп не строится. Права: админ (JWT) либо заголовок
                x-cron-key = app_secrets.push_cron_key.
                Без kind: по ключу крона — auto, по JWT — admin (старый
                клиент ничего не потеряет: его копии станут вечными);
     ?list=1  — копии в папке (имя · дата · размер · вид) и счётчики, админ.

   v1.09.01 · в дамп добавлена таблица bn_devices (справочник трекеров
   Bouncie) — перед vehicles, потому что vehicles.imei ссылается на неё.

   v1.08.46 · POST {action:"journal", name, text} — кладёт текстовый
   .log-архив журнала в <корень вложений>/journals (создаёт папку при
   отсутствии; корень вложений — org_settings.gd_files_folder, при пустом
   значении — папка Files внутри корневой gd_folder_id). Права: админ.
   ===================================================================== */

const BK_VER = "1.09.19";
type Sb = ReturnType<typeof svc>;

const TABLES = [
  /* порядок важен: сначала то, на что ссылаются FK */
  "profiles", "counterparties", "complexes", "work_types", "equipment_types",
  "aux_equipment", "size_types", "extra_works", "product_types",
  "counterparty_prices", "org_settings", "proposals", "jobs", "placements",
  "ext_requests", "repairs", "code_requests", "complex_code_history",
  "hidden_staff", "media", "stock_daily", "equip_moves",
  "bn_devices",                                     /* v1.09.01: справочник трекеров — до vehicles (FK vehicles.imei) */
  "vehicles", "site_visits", "push_subs", "tech_log", "audit_log",
  /* v1.09.18: раньше в бэкап НЕ попадали прайс, остатки склада, настройки и оплаты бухгалтерии, шаблоны заметок,
     учёба и чат — восстановление из SQL-бэкапа оставило бы базу без цен. Таблицы без FK на документы — в конце.
     Намеренно НЕ входят: app_secrets (секреты не должны лежать на Диске), push_queue, rpc_throttle, tv_sessions,
     drive_dirs, bn_trips / bn_trip_days (кэш, перекачивается из Bouncie), doc_shares (заменён чатом). */
  "price_list", "equipment_stock", "acc_settings", "acc_payments", "note_templates", "study_sessions",
  /* v1.09.19: чат в бэкап на Диск НЕ входит намеренно — личная переписка не должна лежать читаемым файлом;
     у переписки есть срок хранения (org_settings.chat_keep_days), восстанавливать её из бэкапа не нужно */
];

/* единственная массивная колонка схемы — profiles.tt_list (uuid[]) */
const ARRAY_COLS: Record<string, true> = { "profiles.tt_list": true };

function lit(table: string, col: string, v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (Array.isArray(v) && ARRAY_COLS[table + "." + col])
    return "'{" + v.map((x) => String(x)).join(",") + "}'";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return "'" + s.replace(/'/g, "''").replace(/\u0000/g, "") + "'";
}

async function dumpTable(s: Sb, name: string, out: string[]) {
  let from = 0;
  const page = 500;
  let cols: string[] | null = null;
  for (;;) {
    const { data, error } = await s.from(name).select("*").range(from, from + page - 1);
    if (error) { out.push(`-- ${name}: ПРОПУЩЕНА (${error.message.replace(/\n/g, " ")})`); return; }
    if (!data?.length) { if (from === 0) out.push(`-- ${name}: пусто`); return; }
    if (!cols) {
      cols = Object.keys(data[0]);
      out.push(`\n-- ---- public.${name} (${cols.length} колонок) ----`);
    }
    const vals = data.map((row: Record<string, unknown>) =>
      "(" + cols!.map((c) => lit(name, c, row[c])).join(",") + ")").join(",\n");
    out.push(`insert into public.${name} (${cols.map((c) => '"' + c + '"').join(",")}) values\n${vals}\non conflict do nothing;`);
    if (data.length < page) return;
    from += page;
  }
}

async function buildSql(s: Sb): Promise<string> {
  const out: string[] = [];
  const now = new Date().toISOString();
  out.push(`-- =====================================================================`);
  out.push(`-- TechLog · SQL-бэкап данных · ${now} · backup v${BK_VER}`);
  out.push(`-- Восстановление: чистая база → full-install-*.sql → этот файл целиком.`);
  out.push(`-- =====================================================================`);
  out.push(`set session_replication_role = replica;`);

  /* auth-пользователи и секреты — через дамп-RPC (service role) */
  const { data: dump, error: de } = await s.rpc("backup_dump");
  if (de) throw new Error("backup_dump: " + de.message);
  const users = (dump?.auth_users ?? []) as Record<string, unknown>[];
  out.push(`\n-- ---- auth.users (${users.length}) ----`);
  if (users.length) {
    const uc = ["id", "email", "encrypted_password", "raw_user_meta_data", "created_at", "banned_until"];
    out.push(`insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,` +
      `raw_app_meta_data,raw_user_meta_data,created_at,updated_at,banned_until) values`);
    out.push(users.map((u) => "(" + [
      lit("u", "id", u.id), "'authenticated'", "'authenticated'",
      lit("u", "email", u.email), lit("u", "encrypted_password", u.encrypted_password),
      "now()", `'{"provider":"email","providers":["email"]}'`,
      lit("u", "raw_user_meta_data", u.raw_user_meta_data ?? {}),
      lit("u", "created_at", u.created_at), "now()",
      lit("u", "banned_until", u.banned_until),
    ].join(",") + ")").join(",\n") + "\non conflict (id) do nothing;");
    void uc;
  }
  const secrets = (dump?.secrets ?? []) as { key: string; value: string }[];
  out.push(`\n-- ---- public.app_secrets (${secrets.length}) ----`);
  if (secrets.length)
    out.push(`insert into public.app_secrets (key, value) values\n` +
      secrets.map((r) => `(${lit("s", "k", r.key)},${lit("s", "v", r.value)})`).join(",\n") +
      `\non conflict (key) do update set value = excluded.value;`);

  for (const t of TABLES) await dumpTable(s, t, out);

  out.push(`\nset session_replication_role = origin;`);
  out.push(`-- номера документов: подтянуть identity-счётчики к максимуму`);
  out.push(`do $tl$ declare t text; begin
  foreach t in array array['jobs','placements','proposals','repairs'] loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='no') then
      execute format('select setval(pg_get_serial_sequence(''public.%I'',''no''),
        coalesce((select max(no) from public.%I),0)+1, false)', t, t);
    end if;
  end loop; end $tl$;`);
  out.push(`select 'TechLog: бэкап восстановлен.' as result;`);
  return out.join("\n") + "\n";
}

/* PURE-BEGIN · чистые функции полок и ротации (их гоняет tests/backup-rotation.js) */
const KEEP_DAILY = 8;
type BkKind = "admin" | "weekly" | "daily" | "legacy";
type BkFile = { id: string; name: string; createdTime: string; size?: string;
  description?: string; appProperties?: Record<string, string> };

/* ISO-неделя «ГГГГ-Wнн» по дате «ГГГГ-ММ-ДД» (понедельник — первый день) */
function isoWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));      // четверг этой недели
  const wk = Math.ceil(((dt.getTime() - Date.UTC(dt.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
function nameKind(name: string): BkKind {
  if (/-ADMIN\.sql$/i.test(name)) return "admin";
  if (/-weekly-\d{4}-W\d{2}\.sql$/i.test(name)) return "weekly";
  if (/-daily\.sql$/i.test(name)) return "daily";
  return "legacy";
}
/* Вид копии. «Вечная» пометка побеждает: хватит её в ОДНОМ месте (имя или
   свойство). daily — только когда так говорят ОБА места; любое сомнение
   (старый формат, переименовали, положили руками) — legacy: не удаляется. */
function kindOf(f: BkFile): BkKind {
  const p = f.appProperties?.tl_kind, nk = nameKind(f.name);
  if (p === "admin" || nk === "admin") return "admin";
  if (p === "weekly" || nk === "weekly") return "weekly";
  if (p === "daily" && nk === "daily") return "daily";
  return "legacy";
}
const dayOf = (f: BkFile): string =>
  f.appProperties?.tl_day || (f.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "");
const weekOf = (f: BkFile): string =>
  f.appProperties?.tl_week || (f.name.match(/\d{4}-W\d{2}/)?.[0] ?? "");

/* что делать автобэкапу сегодня */
function bkPlan(files: BkFile[], day: string) {
  const week = isoWeek(day);
  const today = files.find((f) => kindOf(f) === "daily" && dayOf(f) === day) ?? null;
  const hasWeekly = files.some((f) => kindOf(f) === "weekly" && weekOf(f) === week);
  return { week, needDaily: !today, needWeekly: !hasWeekly, dailyTodayId: today?.id ?? null };
}
/* что уходит в корзину: только daily — дубли одного дня (кроме самого свежего)
   и всё, что старше KEEP_DAILY последних дней. Остальные виды сюда не попадают. */
function bkRotate(files: BkFile[], keep = KEEP_DAILY): BkFile[] {
  const daily = files.filter((f) => kindOf(f) === "daily")
    .sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  const days: string[] = [], out: BkFile[] = [];
  for (const f of daily) {
    const d = dayOf(f) || f.id;
    if (days.includes(d)) { out.push(f); continue; }              // дубль дня
    days.push(d);
    if (days.length > keep) out.push(f);                           // девятый день и дальше
  }
  return out;
}
function bkCounts(files: BkFile[]) {
  const c = { admin: 0, weekly: 0, daily: 0, legacy: 0 };
  for (const f of files) c[kindOf(f)]++;
  return c;
}
/* PURE-END */

const nyDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const nyHM = (d = new Date()) => d.toLocaleTimeString("en-GB",
  { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "");

async function ensureBackupFolder(t: string): Promise<string> {
  const cfg = await driveConfig();
  const rootId = cfg.gd_folder_id.match(/[-\w]{20,}/)?.[0] ?? cfg.gd_folder_id;
  return await monthFolder(t, rootId, "TechLog Backups");   // найти/создать по имени
}

/* все копии папки (недельные и ручные копятся годами — читаем постранично) */
async function listBackups(t: string, folderId: string): Promise<BkFile[]> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  const out: BkFile[] = [];
  let page = "";
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1000` +
      `&fields=nextPageToken,files(id,name,createdTime,size,description,appProperties)` +
      (page ? `&pageToken=${encodeURIComponent(page)}` : ""),
      { headers: { Authorization: `Bearer ${t}` } })).json();
    if (r.error) throw new Error("DRIVE_LIST: " + JSON.stringify(r.error).slice(0, 200));
    out.push(...((r.files ?? []) as BkFile[]));
    page = r.nextPageToken ?? "";
    if (!page) break;
  }
  return out;
}

async function upload(t: string, folderId: string, name: string, body: string, mime = "application/sql",
  extra: Record<string, unknown> = {}) {
  const boundary = "tlbk" + crypto.randomUUID().slice(0, 8);
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: mime, ...extra });
  const payload =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/sql\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await (await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload })).json();
  if (!r.id) throw new Error("DRIVE_UPLOAD: " + JSON.stringify(r));
  return r as { id: string; size?: string };
}

/* недельная копия = копия дневного файла средствами Диска (без повторной выгрузки) */
async function copyFile(t: string, srcId: string, folderId: string, name: string, extra: Record<string, unknown>) {
  const r = await (await fetch(
    `https://www.googleapis.com/drive/v3/files/${srcId}/copy?fields=id,size`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [folderId], ...extra }) })).json();
  if (!r.id) throw new Error("DRIVE_COPY: " + JSON.stringify(r).slice(0, 200));
  return r as { id: string; size?: string };
}
/* в корзину (не насовсем): у ошибочно ушедшей копии есть 30 дней на возврат */
async function trashFile(t: string, id: string): Promise<boolean> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }) });
  return r.ok;
}
const meta = (kind: BkKind, day: string, week: string, by: string) => ({
  description: kind === "admin"
    ? `TechLog · ручной бэкап администратора${by ? " " + by : ""} · хранится вечно, автоматически не удаляется`
    : kind === "weekly" ? `TechLog · недельный бэкап ${week} · хранится вечно, автоматически не удаляется`
    : `TechLog · ежедневный автобэкап · хранятся последние ${KEEP_DAILY}, старые уходят в корзину`,
  appProperties: { tl_kind: kind, tl_day: day, tl_week: week, ...(by ? { tl_by: by.slice(0, 60) } : {}) },
});

async function noteOrg(s: Sb, note: string, okStamp: boolean) {
  const { data: org } = await s.from("org_settings").select("id").limit(1).maybeSingle();
  if (!org) return;
  const patch: Record<string, unknown> = { backup_note: note.slice(0, 200) };
  if (okStamp) patch.backup_last_at = new Date().toISOString();
  await s.from("org_settings").update(patch).eq("id", org.id);
}

async function adminOf(req: Request, s: Sb): Promise<{ ok: boolean; who: string }> {
  const { data: u } = await userClient(req).auth.getUser();
  if (!u?.user) return { ok: false, who: "" };
  const { data: p } = await s.from("profiles").select("role,login").eq("id", u.user.id).maybeSingle();
  return { ok: p?.role === "admin", who: String(p?.login ?? "") };
}
async function isAdminReq(req: Request, s: Sb): Promise<boolean> {
  return (await adminOf(req, s)).ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const s = svc();
  try {
    if (url.searchParams.get("ping")) return jres({ ok: true, fn: "backup", ver: BK_VER });

    const { data: ck } = await s.from("app_secrets").select("value").eq("key", "push_cron_key").maybeSingle();
    const byKey = !!ck?.value && req.headers.get("x-cron-key") === ck.value;

    /* v1.08.46: архив журнала действий → Files/journals */
    if (req.method === "POST") {
      const b = await req.json().catch(() => null) as
        { action?: string; name?: string; text?: string } | null;
      if (b?.action === "journal") {
        if (!(await isAdminReq(req, s))) return jres({ error: "FORBIDDEN" }, 403);
        const name = String(b.name || "").replace(/[^\w.\-]+/g, "_").slice(0, 80) || "journal.log";
        const text = String(b.text || "");
        if (!text || text.length > 8 * 1024 * 1024) return jres({ error: "BAD_TEXT" }, 400);
        const t = await driveToken();
        const { data: org } = await s.from("org_settings")
          .select("gd_files_folder").limit(1).maybeSingle();
        const filesRoot = String(org?.gd_files_folder ?? "").match(/[-\w]{20,}/)?.[0] || "";
        const cfg = await driveConfig();
        const rootId = cfg.gd_folder_id.match(/[-\w]{20,}/)?.[0] ?? cfg.gd_folder_id;
        const parent = filesRoot || await monthFolder(t, rootId, "Files");
        const folder = await monthFolder(t, parent, "journals");   // найти/создать по имени
        const up = await upload(t, folder, name, text, "text/plain");
        return jres({ ok: true, name, id: up?.id ?? null, kb: Math.max(1, Math.round(text.length / 1024)) });
      }
      return jres({ error: "BAD_REQUEST" }, 400);
    }

    if (url.searchParams.get("list")) {
      if (!byKey && !(await isAdminReq(req, s))) return jres({ error: "FORBIDDEN" }, 403);
      const t = await driveToken();
      const files = await listBackups(t, await ensureBackupFolder(t));
      return jres({ ok: true, ver: BK_VER, keep_daily: KEEP_DAILY, counts: bkCounts(files),
        files: files.slice(0, 500).map((f) => ({ id: f.id, name: f.name, createdTime: f.createdTime,
          size: f.size, kind: kindOf(f), by: f.appProperties?.tl_by ?? "" })) });
    }

    if (url.searchParams.get("run")) {
      const adm = byKey ? { ok: false, who: "" } : await adminOf(req, s);
      if (!byKey && !adm.ok) return jres({ error: "FORBIDDEN" }, 403);
      const kp = url.searchParams.get("kind");
      const kind: "auto" | "admin" = kp === "auto" || kp === "admin" ? kp : (byKey ? "auto" : "admin");
      if (kind === "admin" && !adm.ok) return jres({ error: "FORBIDDEN" }, 403);   // вечную копию делает только человек-админ
      let t: string;
      try { t = await driveToken(); }
      catch (e: any) {
        await noteOrg(s, "⛔ " + String(e?.message ?? e), false);
        return jres({ error: "DRIVE: " + String(e?.message ?? e) }, 409);
      }
      const folder = await ensureBackupFolder(t);
      const day = nyDay(), week = isoWeek(day);
      let name = "", weekly = "", sql: string | null = null;

      if (kind === "admin") {
        /* ручной бэкап: вечный, время в имени — сколько угодно за день */
        sql = await buildSql(s);
        name = `TechLog-backup-${day}_${nyHM()}-ADMIN.sql`;
        await upload(t, folder, name, sql, "application/sql", meta("admin", day, week, adm.who));
      } else {
        const plan = bkPlan(await listBackups(t, folder), day);
        if (!plan.needDaily && !plan.needWeekly)                     // сегодня уже делали — не чаще раза в день
          return jres({ ok: true, skipped: true, kind, day, week });
        let srcId = plan.dailyTodayId;
        if (plan.needDaily) {
          sql = await buildSql(s);
          name = `TechLog-backup-${day}-daily.sql`;
          srcId = (await upload(t, folder, name, sql, "application/sql", meta("daily", day, week, ""))).id;
        }
        if (plan.needWeekly) {
          weekly = `TechLog-backup-${day}-weekly-${week}.sql`;
          try {
            if (!srcId) throw new Error("NO_SOURCE");
            await copyFile(t, srcId, folder, weekly, meta("weekly", day, week, ""));
          } catch (_e) {                                             // копия не вышла — выгружаем сами
            sql = sql ?? await buildSql(s);
            await upload(t, folder, weekly, sql, "application/sql", meta("weekly", day, week, ""));
          }
          if (!name) name = weekly;
        }
      }

      /* ротация: только daily, только по белому списку, только в корзину */
      let files = await listBackups(t, folder);
      let removed = 0;
      for (const f of bkRotate(files)) {
        if (kindOf(f) !== "daily" || nameKind(f.name) !== "daily" || f.appProperties?.tl_kind !== "daily") continue;
        if (await trashFile(t, f.id)) { removed++; files = files.filter((x) => x.id !== f.id); }
      }
      const c = bkCounts(files);
      const kb = sql ? Math.max(1, Math.round(sql.length / 1024)) : 0;
      await noteOrg(s, `ok · ${name}${kb ? ` · ${kb} KB` : ""} · ежедн. ${c.daily}/${KEEP_DAILY} · недельных ${c.weekly}` +
        ` · админ ${c.admin}${c.legacy ? ` · старых ${c.legacy}` : ""}`, true);
      return jres({ ok: true, kind, name, weekly, size: kb, counts: c, kept: c.daily, removed });
    }

    return jres({ error: "BAD_REQUEST" }, 400);
  } catch (e: any) {
    await noteOrg(s, "⛔ " + String(e?.message ?? e), false).catch(() => {});
    return jres({ error: String(e?.message ?? e) }, 500);
  }
});
