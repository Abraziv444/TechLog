import { svc, userClient, driveToken, driveConfig, monthFolder, moveFile,
         CORS, jres, FN_VER, ARCHIVE_DIR, PHOTOS_DIR, FILES_DIR, INVOICES_DIR,
         folderIdOf } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))      // v1.07.72: «кто ты»
    return new Response(JSON.stringify({ fn: "media-delete", ver: FN_VER }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
  const { data: prof } = await sb.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();

  const { media_id, job_id, mode } = await req.json();
  const s = svc();

  /* v1.07.88 · АРХИВ (корзина). Документ, помеченный на удаление, не теряет
     файлы: они переезжают в папку «Архив TechLog / <документ>» на Диске.
     Вернуть документ из архива — файлы едут обратно в рабочие папки.
     Насовсем (в корзину Google Диска) файлы уходят только режимом purge,
     то есть только из архива приложения. */
  if (job_id && (mode === "archive" || mode === "restore")) {
    const { data: job } = await sb.from("jobs")
      .select("id,technician_id,date,unit_number,complexes(abbr,name)")
      .eq("id", job_id).maybeSingle();
    if (!job) return jres({ error: "NO_ACCESS" }, 403);
    if (prof?.role !== "admin" && job.technician_id !== user.id)
      return jres({ error: "FORBIDDEN" }, 403);
    const { data: rows } = await s.from("media")
      .select("id,kind,drive_file_id").eq("job_id", job_id);
    let moved = 0;
    if (rows?.length) {
      const t = await driveToken();
      const cfg = await driveConfig();
      const ym = String((job as any).date ?? "").slice(0, 7);
      const cx = (job as any).complexes;
      const tag = [String((job as any).date ?? ""), String(cx?.abbr ?? cx?.name ?? "CX"),
                   String((job as any).unit_number ?? "")].filter(Boolean).join("_")
                   .replace(/[^\wА-Яа-я .-]+/g, "-").slice(0, 60) || job_id.slice(0, 8);
      /* куда класть при возврате: та же раскладка, что у media-begin */
      const org = await s.from("org_settings").select("gd_inv_folder").eq("id", "org").maybeSingle();
      const invRoot = folderIdOf(String(org.data?.gd_inv_folder ?? ""));
      for (const m of rows) {
        if (!m.drive_file_id) continue;
        let dest = "";
        if (mode === "archive") {
          dest = await monthFolder(t, await monthFolder(t, cfg.gd_folder_id, ARCHIVE_DIR), tag);
        } else {
          const root = m.kind === "invoice"
            ? (invRoot || await monthFolder(t, cfg.gd_folder_id, INVOICES_DIR))
            : await monthFolder(t, cfg.gd_folder_id, m.kind === "file" ? FILES_DIR : PHOTOS_DIR);
          dest = await monthFolder(t, root, ym);
        }
        if (dest && await moveFile(t, m.drive_file_id, dest)) moved++;
      }
      await s.from("media").update({ archived_at: mode === "archive" ? new Date().toISOString() : null })
        .eq("job_id", job_id);
    }
    await s.from("audit_log").insert({ actor: user.id, actor_name: prof?.display_name ?? "",
      action: mode === "archive" ? "job_archive" : "job_restore",
      entity: "job", entity_id: job_id, details: { files: rows?.length ?? 0, moved } });
    return jres({ ok: true, files: rows?.length ?? 0, moved });
  }

  /* v1.07.81 · уборка при удалении работы. Раньше строка media исчезала по
     каскаду вместе с работой, а сам файл оставался на Диске навсегда —
     сирота без единой ссылки. Теперь удаление работы сначала зовёт сюда.
     Право то же, что и на удаление самой работы: админ или исполнитель;
     видимость работы дополнительно проверяет RLS через клиент пользователя. */
  if (job_id) {
    const { data: job } = await sb.from("jobs").select("id,technician_id,archived_at")
      .eq("id", job_id).maybeSingle();
    if (!job) return jres({ error: "NO_ACCESS" }, 403);
    if (prof?.role !== "admin" && job.technician_id !== user.id)
      return jres({ error: "FORBIDDEN" }, 403);
    /* v1.07.88: насовсем — только из архива. Прямое удаление из рабочих
       списков сюда больше не приходит, но проверяем и на сервере. */
    if (!(job as any).archived_at) return jres({ error: "NOT_ARCHIVED" }, 409);
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
