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

const folders = new Map<string,string>();
export async function monthFolder(t: string, rootId: string, ym: string) {
  const hit = folders.get(ym); if (hit) return hit;
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
  folders.set(ym, id); return id;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export const jres = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
