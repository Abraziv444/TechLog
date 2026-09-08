import { svc, userClient, driveToken, CORS, jres, FN_VER } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))      // v1.07.72: «кто ты»
    return new Response(JSON.stringify({ fn: "media-delete", ver: FN_VER }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
  const { data: prof } = await sb.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();

  const { media_id, job_id } = await req.json();
  const s = svc();

  /* v1.07.81 · уборка при удалении работы. Раньше строка media исчезала по
     каскаду вместе с работой, а сам файл оставался на Диске навсегда —
     сирота без единой ссылки. Теперь удаление работы сначала зовёт сюда.
     Право то же, что и на удаление самой работы: админ или исполнитель;
     видимость работы дополнительно проверяет RLS через клиент пользователя. */
  if (job_id) {
    const { data: job } = await sb.from("jobs").select("id,technician_id")
      .eq("id", job_id).maybeSingle();
    if (!job) return jres({ error: "NO_ACCESS" }, 403);
    if (prof?.role !== "admin" && job.technician_id !== user.id)
      return jres({ error: "FORBIDDEN" }, 403);
    const { data: rows } = await s.from("media")
      .select("id,kind,file_name,drive_file_id,thumb_path").eq("job_id", job_id);
    let trashed = 0;
    if (rows?.length) {
      const t = await driveToken();
      for (const m of rows) {
        if (!m.drive_file_id) continue;
        const d = await fetch(`https://www.googleapis.com/drive/v3/files/${m.drive_file_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }) });      // в корзину Drive (30 дней)
        if (d.ok || d.status === 404) trashed++;
      }
      const thumbs = rows.map((m) => m.thumb_path).filter(Boolean) as string[];
      if (thumbs.length) await s.storage.from("media-thumbs").remove(thumbs);
      await s.from("media").delete().eq("job_id", job_id);
      await s.from("audit_log").insert({ actor: user.id, actor_name: prof?.display_name ?? "",
        action: "media_purge", entity: "job", entity_id: job_id,
        details: { files: rows.length, trashed } });
    }
    return jres({ ok: true, files: rows?.length ?? 0, trashed });
  }

  if (prof?.role !== "admin") return jres({ error: "FORBIDDEN" }, 403);
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
