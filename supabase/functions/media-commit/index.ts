import { svc, userClient, driveToken, driveConfig, monthFolder, dirFor, ymDir,
         folderIdOf, INVOICES_DIR, CORS, jres, FN_VER } from "../_shared/google.ts";

/* v1.08.13: имя папки сотрудника — как в media-begin */
function techDirName(display: string) {
  const p = String(display ?? "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return (cap(p[0]) + (p[1] ? " " + p[1].charAt(0).toUpperCase() : ""))
    .replace(/[^A-Za-zА-Яа-я0-9 ._-]+/g, "").slice(0, 40).trim();
}

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

    /* v1.08.13 · КОПИЯ ИНВОЙСА КОВОРКЕРАМ.
       По галочке «Инвойсы и для коворкеров» PDF, кроме папки исполнителя,
       кладётся копией и тем, кто был на работе. Это именно копия файла на
       Диске: своя строка в media не заводится, счётчики документа не растут,
       а у человека в его папке лежит тот же бланк. Ошибка здесь не должна
       ронять загрузку — оборачиваем целиком. */
    if (m.kind === "invoice") {
      try {
        const o = await s.from("org_settings")
          .select("gd_inv_helpers,gd_inv_folder").eq("id", "org").maybeSingle();
        if (o.data?.gd_inv_helpers) {
          const j = await s.from("jobs").select("date,helper_ids").eq("id", m.job_id).maybeSingle();
          const ids: string[] = (j.data?.helper_ids ?? []).filter(Boolean);
          if (ids.length) {
            const cfg = await driveConfig();
            const root = folderIdOf(String(o.data?.gd_inv_folder ?? "")) ||
                         await monthFolder(t, cfg.gd_folder_id, INVOICES_DIR);
            const ymd = ymDir(String(j.data?.date ?? ""));
            const pr = await s.from("profiles").select("id,display_name").in("id", ids);
            for (const h of (pr.data ?? [])) {
              const dir = techDirName(String(h.display_name ?? "")) || "—";
              const techDir = await dirFor(s, t, "tech", String(h.id), root, dir);
              const monthDir = await dirFor(s, t, "ym", techDir + "/" + ymd, techDir, ymd);
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(g.id)}/copy`,
                { method: "POST",
                  headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ name: m.file_name, parents: [monthDir] }) },
              ).catch(() => null);
            }
          }
        }
      } catch (_e) { /* копии — удобство, а не обязательство */ }
    }

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
