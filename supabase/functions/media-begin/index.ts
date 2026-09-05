import { svc, userClient, driveToken, driveConfig, monthFolder, CORS, jres } from "../_shared/google.ts";

const LIMITS = { photo: { max: 10, bytes: 8_000_000 },
                 video: { max: 2,  bytes: 120_000_000 } };

const translit = (s: string) => s.replace(/[а-яё]/gi, (ch) => ({
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
  м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",
  щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" } as Record<string,string>)[ch.toLowerCase()] ?? "");
const clean = (s: string, n = 24) =>
  translit(String(s ?? "")).replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, n).toUpperCase() || "X";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);

    const { job_id, kind, mime, size } = await req.json();
    const lim = LIMITS[kind as "photo" | "video"];
    if (!lim) return jres({ error: "BAD_KIND" }, 400);
    if (!Number.isFinite(size) || size <= 0 || size > lim.bytes)
      return jres({ error: "TOO_BIG", max: lim.bytes }, 413);

    // права: если RLS не отдал работу — доступа нет; логику не дублируем
    const { data: job } = await sb.from("jobs")
      .select("id,date,unit_number,complexes(abbr,name),work_types(name)")
      .eq("id", job_id).maybeSingle();
    if (!job) return jres({ error: "NO_ACCESS" }, 403);

    const s = svc();
    await s.from("media").delete().eq("job_id", job_id).eq("status", "uploading")
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
    const { data: rows } = await s.from("media")
      .select("seq").eq("job_id", job_id).eq("kind", kind)
      .order("seq", { ascending: false }).limit(1);
    const { count } = await s.from("media")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job_id).eq("kind", kind);
    if ((count ?? 0) >= lim.max) return jres({ error: "LIMIT", max: lim.max }, 409);
    const seq = (rows?.[0]?.seq ?? 0) + 1;

    const ext = kind === "video"
      ? (/quicktime/.test(mime) ? "mov" : /webm/.test(mime) ? "webm" : "mp4") : "jpg";
    const cx = (job as any).complexes, wt = (job as any).work_types;
    const file_name = [ job.date, clean(cx?.abbr || cx?.name || "CX"),
      clean(job.unit_number || "0", 10), clean(wt?.name || "WORK", 12),
      String(seq).padStart(2, "0") ].join("_") + "." + ext;

    const id = crypto.randomUUID();
    const thumb_path = `${job_id}/${id}.jpg`;
    const { error: insErr } = await s.from("media").insert({
      id, job_id, owner_id: user.id, kind, seq, file_name,
      mime: String(mime ?? ""), size_bytes: size, thumb_path, status: "uploading" });
    if (insErr) return jres({ error: insErr.message }, 500);

    const t = await driveToken();
    const cfg = await driveConfig();
    const parent = await monthFolder(t, cfg.gd_folder_id, String(job.date).slice(0, 7));
    const init = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json",
        "X-Upload-Content-Type": String(mime ?? "application/octet-stream"),
        "X-Upload-Content-Length": String(size) },
      body: JSON.stringify({ name: file_name, parents: [parent],
        appProperties: { job: job_id, media: id, owner: user.id } }) });
    const upload_url = init.headers.get("Location");
    if (!upload_url) return jres({ error: "DRIVE_INIT: " + await init.text() }, 502);

    return jres({ media_id: id, upload_url, file_name, thumb_path, seq });
  } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
});
