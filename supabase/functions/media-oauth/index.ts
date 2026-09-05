import { svc, userClient, CORS, jres } from "../_shared/google.ts";

/* v1.07.31: обмен одноразового кода Google на refresh-token — прямо из
   интерфейса админки (кнопка «Подключить Google»). Секреты клиента и
   токен живут только на сервере (app_secrets), в браузер не попадают. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
    const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (prof?.role !== "admin") return jres({ error: "FORBIDDEN" }, 403);

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) return jres({ error: "BAD_REQUEST" }, 400);

    const s = svc();
    const { data } = await s.from("app_secrets").select("key,value")
      .in("key", ["gd_client_id", "gd_client_secret"]);
    const m: Record<string,string> = {};
    for (const row of data ?? []) m[row.key] = row.value;
    if (!m.gd_client_id || !m.gd_client_secret)
      return jres({ error: "KEYS_NOT_SAVED" }, 400);

    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: m.gd_client_id, client_secret: m.gd_client_secret,
        redirect_uri, grant_type: "authorization_code" }) });
    const tj = await tr.json();
    if (!tj.refresh_token) {
      // без prompt=consent Google может не выдать refresh-token повторно
      return jres({ error: "NO_REFRESH_TOKEN: " + JSON.stringify(tj).slice(0, 200) }, 400);
    }
    await s.from("app_secrets").upsert({ key: "gd_refresh_token", value: tj.refresh_token });

    let email = "";
    try {
      const about = await (await fetch(
        "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
        { headers: { Authorization: `Bearer ${tj.access_token}` } })).json();
      email = about.user?.emailAddress ?? "";
    } catch (_e) { /* не критично */ }

    const { data: p } = await s.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await s.from("tech_log").insert({ actor: user.id, actor_name: p?.display_name ?? "",
      action: "org_set", entity: "org", entity_id: "gd_refresh_token",
      details: { v: "connected", email } }).then(r => r, () => null);

    return jres({ ok: true, email });
  } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
});
