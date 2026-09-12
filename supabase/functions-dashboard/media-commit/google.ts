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
  if (!m.gd_client_id || !m.gd_client_secret || !m.gd_refresh_token || !m.gd_folder_id)
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
export const FN_VER = "1.08.36";

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
export const ARCHIVE_DIR = "Архив TechLog";

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
/* Месяц в виде 2026_09 — так просил заказчик */
export function ymDir(date: string) {
  const d = String(date || "").slice(0, 7);       // 2026-09
  return d.length === 7 ? d.replace("-", "_") : "0000_00";
}
/* Имя папки сотрудника: имя и первая буква фамилии латиницей */
