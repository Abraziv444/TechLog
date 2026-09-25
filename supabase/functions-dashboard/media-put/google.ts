import { createClient } from "npm:@supabase/supabase-js@2";

export const svc = () => createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export const userClient = (req: Request) => createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });

let tok = { v: "", exp: 0 };

export async function driveConfig() {
  const { data, error } = await svc().from("app_secrets").select("key,value")
    .in("key", ["gd_client_id","gd_client_secret","gd_refresh_token","gd_folder_id"]);
  if (error) throw new Error("SECRETS: " + error.message);
  const m: Record<string,string> = {};
  for (const r of data ?? []) m[r.key] = r.value;
  /* v1.09.50: ссылка на корневую папку не обязательна — нет её или папку удалили, rootFolder() создаст
     «TechLog Archive» сама и запомнит ссылку в app_secrets.gd_folder_id */
  if (!m.gd_client_id || !m.gd_client_secret || !m.gd_refresh_token)
    throw new Error("DRIVE_NOT_CONFIGURED");
  return m;
}

export async function driveToken(): Promise<string> {
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const c = await driveConfig();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.gd_client_id, client_secret: c.gd_client_secret,
      refresh_token: c.gd_refresh_token, grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("GOOGLE_AUTH: " + JSON.stringify(j));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return tok.v;
}

/* v1.07.76: ключ кеша — родитель + имя. Раньше ключом было только имя, и
   папка «2026-09» внутри архива перекрывала одноимённую внутри «Files». */
const folders = new Map<string,string>();
export async function monthFolder(t: string, rootId: string, ym: string) {
  const key = rootId + "/" + ym;
  const hit = folders.get(key); if (hit) return hit;
  const q = encodeURIComponent(
    `name='${ym}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const s = await (await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${t}` } })).json();
  let id = s.files?.[0]?.id;
  if (!id) {
    const c = await (await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: ym, parents: [rootId],
        mimeType: "application/vnd.google-apps.folder" }) })).json();
    id = c.id;
  }
  folders.set(key, id); return id;
}

/* v1.07.72: версия комплекта функций. Диагностика в приложении спрашивает
   каждую функцию «кто ты и какой версии» — так видно и перепутанный код,
   и функцию, которую забыли передеплоить. */
export const FN_VER = "1.09.50";   // v1.09.50: корень Диска создаётся сам, имена служебных папок — по-английски

/* v1.07.81: имена служебных папок внутри архива — одни на все функции.
   Фото и видео лежат в «Photos/ГГГГ-ММ», документы — в «Files/ГГГГ-ММ»:
   раньше своя папка была только у документов, а съёмка сыпалась прямо в
   корень архива вперемешку со служебными папками. */
export const PHOTOS_DIR = "Photos";
export const FILES_DIR  = "Files";
/* v1.07.85: PDF-инвойсы — в свою папку. Админ может увести их в чужую
   папку Диска (org_settings.gd_inv_folder), тогда корнем служит она. */
export const INVOICES_DIR = "Invoices";
/* v1.07.88: корзина. Документ, помеченный на удаление, уезжает сюда вместе
   со своими файлами; из рабочих папок ничего не удаляется. Насовсем файлы
   уходят в корзину Google Диска только отсюда. */
/* v1.09.50: имена служебных папок — по-английски. Корень, который приложение создаёт само, — «TechLog Archive»;
   папка помеченных на удаление документов — «Deleted documents». Старая «Архив TechLog» не бросается: её находим
   и переименовываем, так что всё уже перенесённое остаётся на месте и новое ложится туда же. */
export const ROOT_DIR = "TechLog Archive";
export const ARCHIVE_DIR = "Deleted documents";
export const LEGACY_ARCHIVE_DIRS = ["Архив TechLog"];
const CYR = /[А-Яа-яЁё]/;
const DRIVE = "https://www.googleapis.com/drive/v3/files";
async function renameFolder(t: string, id: string, name: string) {
  await fetch(`${DRIVE}/${id}?supportsAllDrives=true`, { method: "PATCH",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
}
async function findFolder(t: string, parent: string, name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const j = await (await fetch(`${DRIVE}?q=${q}&fields=files(id)`, { headers: { Authorization: `Bearer ${t}` } })).json();
  return j.files?.[0]?.id ?? "";
}
/* Корневая папка архива. Ссылка — app_secrets.gd_folder_id (админ может вставить свою в Настройках).
   Нет ссылки, папка удалена или недоступна приложению (drive.file видит только свои папки) — находим свою
   «TechLog Archive» в корне Диска или создаём её, и ЗАПОМИНАЕМ ссылку: вручную ничего делать не нужно.
   Русское имя корня (раньше папку заводили руками) меняется на английское — ID и файлы те же. */
let rootCache = { id: "", at: 0, created: false, renamed: false };
export async function rootFolder(t: string): Promise<string> {
  if (rootCache.id && Date.now() - rootCache.at < 10 * 60_000) return rootCache.id;
  const s = svc();
  const { data } = await s.from("app_secrets").select("value").eq("key", "gd_folder_id").maybeSingle();
  let id = folderIdOf(String(data?.value ?? ""));
  let created = false, renamed = false;
  if (id) {
    const r = await fetch(`${DRIVE}/${id}?fields=id,name,trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${t}` } });
    if (r.ok) {
      const f = await r.json();
      if (!f.trashed) {
        if (CYR.test(String(f.name ?? ""))) { await renameFolder(t, id, ROOT_DIR); renamed = true; }
        if (id !== String(data?.value ?? "")) await s.from("app_secrets").upsert({ key: "gd_folder_id", value: id });
        rootCache = { id, at: Date.now(), created, renamed }; return id;
      }
    } else if (r.status !== 404 && r.status !== 403) throw new Error("DRIVE_ROOT: HTTP " + r.status);   // сбой Google — не плодим копии
  }
  id = await findFolder(t, "root", ROOT_DIR);
  if (!id) {
    const c = await (await fetch(DRIVE, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: ROOT_DIR, mimeType: "application/vnd.google-apps.folder" }) })).json();
    if (!c.id) throw new Error("DRIVE_ROOT_CREATE: " + JSON.stringify(c).slice(0, 200));
    id = c.id; created = true;
  }
  await s.from("app_secrets").upsert({ key: "gd_folder_id", value: id });
  rootCache = { id, at: Date.now(), created, renamed }; return id;
}
export function rootFolderInfo() { return { ...rootCache }; }
/* Папка помеченных на удаление документов внутри корня: английская, старая русская переименовывается */
export async function archiveFolder(t: string, root: string): Promise<string> {
  const key = root + "/" + ARCHIVE_DIR;
  const hit = folders.get(key); if (hit) return hit;
  let id = await findFolder(t, root, ARCHIVE_DIR);
  if (!id) for (const old of LEGACY_ARCHIVE_DIRS) {
    id = await findFolder(t, root, old);
    if (id) { await renameFolder(t, id, ARCHIVE_DIR); break; }
  }
  if (!id) id = await monthFolder(t, root, ARCHIVE_DIR);
  folders.set(key, id); return id;
}

/* Переложить файл в другую папку Диска (родитель заменяется целиком) */
export async function moveFile(t: string, fileId: string, parentId: string) {
  const cur = await (await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${t}` } })).json();
  const old = (cur.parents ?? []).join(",");
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${parentId}` +
    (old ? `&removeParents=${old}` : "") + "&fields=id,parents",
    { method: "PATCH", headers: { Authorization: `Bearer ${t}` } });
  return r.ok;
}

/* ID папки из вставленной ссылки Google Диска (или сам ID, как есть) */
export function folderIdOf(v: string) {
  const s = String(v ?? "").trim();
  const m = s.match(/\/folders\/([^/?#]+)/) ?? s.match(/[?&]id=([^&#]+)/);
  if (m) return m[1];
  return s.replace(/^https?:\/\/[^/]+\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export const jres = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* v1.08.12: папка по СУЩНОСТИ, а не по имени. Ключ — ID контрагента,
   комплекса, сотрудника или документа; соответствие лежит в drive_dirs.
   Даёт две вещи: переименование в справочнике не плодит новые папки, и
   на каждый файл не нужен поиск по Диску — это заметно на мобильной сети. */
export async function dirFor(
  s: any, t: string, kind: string, key: string, parentId: string, name: string,
) {
  const clean = String(name || "").replace(/[\\/]+/g, "-").trim() || "—";
  try {
    const q = await s.from("drive_dirs").select("folder_id,name")
      .eq("kind", kind).eq("key", key).maybeSingle();
    const id = q.data?.folder_id;
    if (id) {
      /* имя могли поменять в справочнике — подтягиваем на Диске, папка та же */
      if (q.data?.name !== clean) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: clean }),
        }).catch(() => null);
        await s.from("drive_dirs").update({ name: clean, updated_at: new Date().toISOString() })
          .eq("kind", kind).eq("key", key);
      }
      return id;
    }
  } catch (_e) { /* нет таблицы — работаем поиском по имени */ }
  const fresh = await monthFolder(t, parentId, clean);   // найдёт или создаст по имени
  try {
    await s.from("drive_dirs").insert({ kind, key, folder_id: fresh, name: clean });
  } catch (_e) { /* не страшно: в следующий раз найдём по имени */ }
  return fresh;
}
/* v1.09.10: папка заблокированного (уволенного) сотрудника — «Имя Ф Заблокирован».
   Суффикс добавляют все, кто вычисляет имя папки сотрудника (media-begin, media-commit,
   media-health?tech_dir=…): иначе dirFor при следующей выгрузке переименовал бы папку обратно. */
export const BLOCKED_SUFFIX = " (blocked)";                 // v1.09.50: по-английски, как все служебные имена
export const LEGACY_BLOCKED_SUFFIXES = [" Заблокирован"];
export function stripBlocked(name: string) {
  let s = String(name ?? "");
  for (const x of [BLOCKED_SUFFIX, ...LEGACY_BLOCKED_SUFFIXES]) s = s.split(x).join("");
  return s.trim();
}
export function techDirLabel(base: string, blocked: unknown) {
  const b = stripBlocked(String(base || "")).trim();
  return b && blocked === true ? (b + BLOCKED_SUFFIX).slice(0, 60) : b;
}
/* Месяц в виде 2026_09 — так просил заказчик */
export function ymDir(date: string) {
  const d = String(date || "").slice(0, 7);       // 2026-09
  return d.length === 7 ? d.replace("-", "_") : "0000_00";
}
/* Имя папки сотрудника: имя и первая буква фамилии латиницей */
