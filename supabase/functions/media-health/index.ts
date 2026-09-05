import { svc, userClient, driveToken, CORS, jres } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return jres({ error: "FORBIDDEN" }, 403);

  const r: Record<string, unknown> = {};
  const s = svc();

  try { const t0 = Date.now();
    await s.from("org_settings").select("id").limit(1);
    r.db = { ok: true, ms: Date.now() - t0 };
  } catch (e) { r.db = { ok: false, error: String(e) }; }

  // конфиг без секретов — чтобы админка могла подставить сохранённые значения
  try {
    const { data } = await s.from("app_secrets").select("key,value")
      .in("key", ["gd_client_id","gd_client_secret","gd_refresh_token","gd_folder_id"]);
    const m: Record<string,string> = {};
    for (const row of data ?? []) m[row.key] = row.value;
    r.cfg = { client_id: m.gd_client_id ?? "", folder_id: m.gd_folder_id ?? "",
      has_secret: !!m.gd_client_secret, has_refresh: !!m.gd_refresh_token };
  } catch (_e) { /* не критично */ }

  try { const t0 = Date.now();
    const t = await driveToken();
    r.auth = { ok: true, ms: Date.now() - t0 };
    const about = await (await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(emailAddress)",
      { headers: { Authorization: `Bearer ${t}` } })).json();
    const q = about.storageQuota ?? {};
    r.drive = { ok: true, account: about.user?.emailAddress,
      used_gb: (Number(q.usage ?? 0) / 1e9).toFixed(2),
      limit_gb: q.limit ? (Number(q.limit) / 1e9).toFixed(1) : "∞" };
    const { data } = await s.from("app_secrets").select("value").eq("key", "gd_folder_id").maybeSingle();
    const folder = data?.value ?? "";
    const mk = await (await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "healthcheck.txt", parents: folder ? [folder] : undefined }) })).json();
    if (mk.id) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${mk.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      r.write = { ok: true };
    } else r.write = { ok: false, error: JSON.stringify(mk).slice(0, 200) };
  } catch (e) {
    r.auth = r.auth ?? { ok: false };
    r.drive = { ok: false, error: String((e as Error)?.message ?? e) };
  }
  return jres(r);
});
