import { svc, userClient, CORS, jres, driveToken, driveConfig, monthFolder } from "../_shared/google.ts";

/* =====================================================================
   v1.08.33 · BACKUP — SQL-бэкап данных в Google Drive.
   Собирает ВСЕ данные фирмы (включая auth-пользователей с хэшами
   паролей и app_secrets через RPC backup_dump) в один .sql-файл с
   INSERT'ами и кладёт его в папку «TechLog Backups» корневой папки
   Google Drive (той же, что настроена для фото). Хранятся последние
   8 копий, старые удаляются.

   Восстановление: чистая база → supabase/full-install-*.sql → затем
   этот файл целиком в SQL Editor. Дамп сам включает replica-режим,
   поэтому триггеры и защиты не мешают, а identity-счётчики (номера
   документов) подтягиваются в конце.

   Режимы:
     ?ping=1  — диагностика;
     ?run=1   — сделать бэкап сейчас. Права: админ (JWT) либо заголовок
                x-cron-key = app_secrets.push_cron_key;
     ?list=1  — последние копии в папке (имя · дата · размер), админ.
   ===================================================================== */

const BK_VER = "1.08.33";
type Sb = ReturnType<typeof svc>;

const TABLES = [
  /* порядок важен: сначала то, на что ссылаются FK */
  "profiles", "counterparties", "complexes", "work_types", "equipment_types",
  "aux_equipment", "size_types", "extra_works", "product_types",
  "counterparty_prices", "org_settings", "proposals", "jobs", "placements",
  "ext_requests", "repairs", "code_requests", "complex_code_history",
  "hidden_staff", "media", "stock_daily", "equip_moves",
  "vehicles", "site_visits", "push_subs", "tech_log", "audit_log",
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

async function ensureBackupFolder(t: string): Promise<string> {
  const cfg = await driveConfig();
  const rootId = cfg.gd_folder_id.match(/[-\w]{20,}/)?.[0] ?? cfg.gd_folder_id;
  return await monthFolder(t, rootId, "TechLog Backups");   // найти/создать по имени
}

async function listBackups(t: string, folderId: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const r = await (await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc` +
    `&fields=files(id,name,createdTime,size)`,
    { headers: { Authorization: `Bearer ${t}` } })).json();
  return (r.files ?? []) as { id: string; name: string; createdTime: string; size?: string }[];
}

async function upload(t: string, folderId: string, name: string, body: string) {
  const boundary = "tlbk" + crypto.randomUUID().slice(0, 8);
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "application/sql" });
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

async function noteOrg(s: Sb, note: string, okStamp: boolean) {
  const { data: org } = await s.from("org_settings").select("id").limit(1).maybeSingle();
  if (!org) return;
  const patch: Record<string, unknown> = { backup_note: note.slice(0, 200) };
  if (okStamp) patch.backup_last_at = new Date().toISOString();
  await s.from("org_settings").update(patch).eq("id", org.id);
}

async function isAdminReq(req: Request, s: Sb): Promise<boolean> {
  const { data: u } = await userClient(req).auth.getUser();
  if (!u?.user) return false;
  const { data: p } = await s.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  return p?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const s = svc();
  try {
    if (url.searchParams.get("ping")) return jres({ ok: true, fn: "backup", ver: BK_VER });

    const { data: ck } = await s.from("app_secrets").select("value").eq("key", "push_cron_key").maybeSingle();
    const byKey = !!ck?.value && req.headers.get("x-cron-key") === ck.value;

    if (url.searchParams.get("list")) {
      if (!byKey && !(await isAdminReq(req, s))) return jres({ error: "FORBIDDEN" }, 403);
      const t = await driveToken();
      const files = await listBackups(t, await ensureBackupFolder(t));
      return jres({ ok: true, files: files.slice(0, 10) });
    }

    if (url.searchParams.get("run")) {
      if (!byKey && !(await isAdminReq(req, s))) return jres({ error: "FORBIDDEN" }, 403);
      let t: string;
      try { t = await driveToken(); }
      catch (e: any) {
        await noteOrg(s, "⛔ " + String(e?.message ?? e), false);
        return jres({ error: "DRIVE: " + String(e?.message ?? e) }, 409);
      }
      const sql = await buildSql(s);
      const folder = await ensureBackupFolder(t);
      const name = "TechLog-backup-" +
        new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + ".sql";
      const up = await upload(t, folder, name, sql);
      /* ротация: держим 8 свежих */
      const files = await listBackups(t, folder);
      let removed = 0;
      for (const f of files.slice(8)) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
        removed++;
      }
      const kb = Math.max(1, Math.round(sql.length / 1024));
      await noteOrg(s, `ok · ${name} · ${kb} KB · копий: ${Math.min(files.length, 8)}`, true);
      return jres({ ok: true, name, size: kb, kept: Math.min(files.length, 8), removed });
    }

    return jres({ error: "BAD_REQUEST" }, 400);
  } catch (e: any) {
    await noteOrg(s, "⛔ " + String(e?.message ?? e), false).catch(() => {});
    return jres({ error: String(e?.message ?? e) }, 500);
  }
});
