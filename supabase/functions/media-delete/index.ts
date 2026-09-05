import { svc, userClient, driveToken, CORS, jres } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
  const { data: prof } = await sb.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return jres({ error: "FORBIDDEN" }, 403);

  const { media_id } = await req.json();
  const s = svc();
  const { data: m } = await s.from("media").select("*").eq("id", media_id).maybeSingle();
  if (!m) return jres({ error: "NOT_FOUND" }, 404);

  if (m.drive_file_id) {
    const t = await driveToken();                       // в корзину Drive (30 дней)
    await fetch(`https://www.googleapis.com/drive/v3/files/${m.drive_file_id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }) });
  }
  if (m.thumb_path) await s.storage.from("media-thumbs").remove([m.thumb_path]);
  await s.from("media").delete().eq("id", m.id);
  await s.from("audit_log").insert({ actor: user.id, actor_name: prof?.display_name ?? "",
    action: m.kind === "video" ? "video_delete" : "photo_delete",
    entity: "job", entity_id: m.job_id, details: { file: m.file_name } });
  return jres({ ok: true });
});
