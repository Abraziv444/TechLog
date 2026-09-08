import { svc, userClient, driveToken, CORS, jres, FN_VER } from "./google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))      // v1.07.72: «кто ты»
    return new Response(JSON.stringify({ fn: "media-commit", ver: FN_VER }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);

    const { media_id, drive_file_id } = await req.json();
    const s = svc();
    const { data: m } = await s.from("media").select("*")
      .eq("id", media_id).eq("owner_id", user.id).eq("status", "uploading").maybeSingle();
    if (!m) return jres({ error: "NOT_FOUND" }, 404);

    const t = await driveToken();
    const g = await (await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(drive_file_id)}` +
      `?fields=id,name,size,parents,appProperties`,
      { headers: { Authorization: `Bearer ${t}` } })).json();
    if (!g.id || g.name !== m.file_name || g.appProperties?.media !== m.id)
      return jres({ error: "MISMATCH" }, 409);

    await s.from("media").update({ status: "ready", drive_file_id: g.id,
      size_bytes: Number(g.size ?? m.size_bytes) }).eq("id", m.id);

    const { data: p } = await s.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    await s.from("audit_log").insert({ actor: user.id, actor_name: p?.display_name ?? "",
      action: m.kind === "video" ? "video_upload" : "photo_upload",
      entity: "job", entity_id: m.job_id,
      details: { media_id: m.id, file: m.file_name, size: g.size ?? m.size_bytes, seq: m.seq } });

    /* v1.07.64: свободное место на Диске — не чаще раза в 6 часов, чтобы
       предупреждение для админа и менеджера оставалось свежим без ручных
       тестов подключения. Ошибка здесь не должна ронять загрузку файла. */
    try {
      const { data: o } = await s.from("org_settings")
        .select("gd_checked_at").eq("id", "org").maybeSingle();
      const last = o?.gd_checked_at ? Date.parse(o.gd_checked_at) : 0;
      if (!last || Date.now() - last > 6 * 3600 * 1000) {
        const about = await (await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(emailAddress)",
          { headers: { Authorization: `Bearer ${t}` } })).json();
        const q = about.storageQuota ?? {};
        const usage = Number(q.usage ?? 0), limit = Number(q.limit ?? 0);
        await s.from("org_settings").update({
          gd_used_gb: Number((usage / 1e9).toFixed(2)),
          gd_limit_gb: limit ? Number((limit / 1e9).toFixed(2)) : null,
          gd_free_pct: limit ? Number((100 - (usage * 100) / limit).toFixed(1)) : null,
          gd_account: about.user?.emailAddress ?? null,
          gd_checked_at: new Date().toISOString(),
        }).eq("id", "org");
      }
    } catch (_e) { /* не критично */ }

    return jres({ ok: true });
  } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
});
