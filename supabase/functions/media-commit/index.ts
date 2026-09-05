import { svc, userClient, driveToken, CORS, jres } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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

    return jres({ ok: true });
  } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
});
