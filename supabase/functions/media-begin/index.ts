import { svc, userClient, driveToken, driveConfig, monthFolder, CORS, jres, FN_VER,
         PHOTOS_DIR, FILES_DIR, INVOICES_DIR, folderIdOf, dirFor, ymDir, techDirLabel } from "../_shared/google.ts";

const BEGIN_VER = "1.09.42";         // v1.09.40: upload_id для media-put; v1.09.42: размер файла — из настроек

/* v1.07.64: max — это дефолт; действующий лимит на документ админ задаёт
   в настройках (org_settings.media_max_photo / media_max_video). Проверка
   именно здесь: клиент лимит только показывает, обойти его нельзя. */
const LIMITS = { photo: { max: 30, bytes: 8_000_000 },
                 video: { max: 5,  bytes: 120_000_000 },
                 /* v1.07.81: вложение «скрепкой» — документ. Его лимит админ
                    тоже задаёт в настройках (org_settings.media_max_file);
                    значение ниже — только запасное. */
                 file:  { max: 20, bytes: 25_000_000 },
                 /* v1.07.85: PDF-инвойс документа. Лимит здесь только как
                    предохранитель: бланк перевыпускают по многу раз, и каждый
                    выпуск ложится рядом со своим номером. */
                 invoice: { max: 50, bytes: 20_000_000 } };

const translit = (s: string) => s.replace(/[а-яё]/gi, (ch) => ({
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
  м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",
  щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" } as Record<string,string>)[ch.toLowerCase()] ?? "");
const clean = (s: string, n = 24) =>
  translit(String(s ?? "")).replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, n).toUpperCase() || "X";

/* v1.07.86: имя файла собирается по шаблону из настроек (конструктор в
   приложении). Пустой кусочек выпадает вместе с лишним разделителем.
   Шаблон по умолчанию повторяет прежнее имя файла один в один. */
const FILE_FMT_DEF = "{DATE}_{CX}_{UNIT}_{NAME}_{SEQ}";
function renderFmt(fmt: string, vals: Record<string, string>) {
  let out = String(fmt || FILE_FMT_DEF).replace(/\{([A-Z]+)\}/g, (_m, k) =>
    (vals[k] == null || vals[k] === "") ? "\u0000" : vals[k]);
  out = out.replace(/\u0000[^A-Za-z0-9\u0000]*/g, "").replace(/[^A-Za-z0-9]*\u0000/g, "");
  return out.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").replace(/([^A-Za-z0-9])\1+/g, "$1") || "FILE";
}
const initialsOf = (s: string) => String(s ?? "").trim().split(/\s+/)
  .map((w) => w[0] ?? "").slice(0, 2).join("");

/* v1.07.87: имя папки сотрудника на Диске — имя и первая буква фамилии
   латиницей: «Иван Петров» → «Ivan P». Тот же вид, что подпись исполнителя
   в документах, только без точки — точку в имени папки Диск не любит. */
function techFolderName(display: string) {
  const p = translit(String(display ?? "")).trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const name = cap(p[0]) + (p[1] ? " " + p[1].charAt(0).toUpperCase() : "");
  return name.replace(/[^A-Za-z0-9 ._-]+/g, "").slice(0, 40).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))      // v1.07.72: «кто ты»; v1.09.40: своя версия в ver (общий FN_VER — в lib)
    return new Response(JSON.stringify({ fn: "media-begin", ver: BEGIN_VER, lib: FN_VER }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);

    const { job_id, repair_id, doc, kind, mime, size, name } = await req.json();
    const isRep = doc === "rep" || (!!repair_id && !job_id);   // v1.08.48: медиа у ремонта
    const lim = LIMITS[kind as "photo" | "video" | "file" | "invoice"];
    if (!lim) return jres({ error: "BAD_KIND" }, 400);
    /* v1.09.42 (п. 51): предел размера задаёт админ (org_settings.media_mb_*); здесь — только грубая страховка,
       настоящая проверка — ниже, после чтения настроек */
    if (!Number.isFinite(size) || size <= 0 || size > 600_000_000)
      return jres({ error: "TOO_BIG", max: lim.bytes }, 413);

    // права: если RLS не отдал документ — доступа нет; логику не дублируем.
    // v1.08.48: у ремонта свой владелец — строка приводится к «job-подобному»
    // виду (technician = created_by, вид работы = REPAIR), и вся раскладка
    // по папкам/именам ниже работает без ветвлений.
    let job: any = null;
    if (isRep) {
      const { data: rep } = await sb.from("repairs")
        .select("id,date,unit_number,created_by,counterparty_id,complex_id," +
                "complexes(abbr,name),counterparties(abbr,name)")
        .eq("id", repair_id).maybeSingle();
      if (!rep) return jres({ error: "NO_ACCESS" }, 403);
      job = { ...rep, technician_id: (rep as any).created_by,
              work_types: { name: "REPAIR" } };
    } else {
      const q = await sb.from("jobs")
        .select("id,date,unit_number,technician_id,counterparty_id,complex_id," +
                "complexes(abbr,name),counterparties(abbr,name),work_types(name)")
        .eq("id", job_id).maybeSingle();
      job = q.data;
    }
    if (!job) return jres({ error: "NO_ACCESS" }, 403);
    const ownerCol = isRep ? "repair_id" : "job_id";
    const ownerId  = isRep ? repair_id : job_id;

    const s = svc();
    /* v1.07.81: media_max_file мог ещё не появиться в базе (SQL не выполнен) —
       тогда запрос падает целиком и обнулил бы заодно лимиты фото и видео.
       Поэтому при ошибке перечитываем старым набором колонок. */
    let org: Record<string, unknown> | null = null;
    {
      const q = await s.from("org_settings")
        .select("media_max_photo,media_max_video,media_max_file,gd_inv_folder,file_name_fmt,gd_inv_by_tech,gd_photo_folder,gd_files_folder")
        .eq("id", "org").maybeSingle();
      if (q.error) {
        /* v1.07.85: колонки gd_inv_folder может ещё не быть (SQL не выполнен) —
           перечитываем прежним набором, инвойсы уйдут в архив/Invoices */
        const q2 = await s.from("org_settings")
          .select("media_max_photo,media_max_video,media_max_file").eq("id", "org").maybeSingle();
        if (q2.error) {
          const q3 = await s.from("org_settings")
            .select("media_max_photo,media_max_video").eq("id", "org").maybeSingle();
          org = (q3.data ?? null) as Record<string, unknown> | null;
        } else org = (q2.data ?? null) as Record<string, unknown> | null;
      } else org = (q.data ?? null) as Record<string, unknown> | null;
    }
    /* v1.09.42 (п. 51): размер файла из настроек; колонок нет (SQL 1.09.42 не выполнен) — прежние LIMITS */
    {
      const col = ({ photo: "media_mb_photo", video: "media_mb_video", file: "media_mb_file", invoice: "media_mb_invoice" } as Record<string, string>)[kind];
      const mb = await s.from("org_settings").select(col).eq("id", "org").maybeSingle();
      const v = !mb.error && mb.data ? Number((mb.data as Record<string, unknown>)[col]) : NaN;
      const maxBytes = Number.isFinite(v) && v > 0 ? v * 1_000_000 : lim.bytes;
      if (size > maxBytes) return jres({ error: "TOO_BIG", max: maxBytes }, 413);
    }
    const maxCount = kind === "video" ? Number(org?.media_max_video ?? LIMITS.video.max)
      : kind === "file" ? Number(org?.media_max_file ?? LIMITS.file.max)
      : kind === "invoice" ? LIMITS.invoice.max
      : Number(org?.media_max_photo ?? LIMITS.photo.max);
    await s.from("media").delete().eq(ownerCol, ownerId).eq("status", "uploading")
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
    const { data: rows } = await s.from("media")
      .select("seq").eq(ownerCol, ownerId).eq("kind", kind)
      .order("seq", { ascending: false }).limit(1);
    const { count } = await s.from("media")
      .select("id", { count: "exact", head: true })
      .eq(ownerCol, ownerId).eq("kind", kind);
    if ((count ?? 0) >= maxCount) return jres({ error: "LIMIT", max: maxCount }, 409);
    const seq = (rows?.[0]?.seq ?? 0) + 1;

    const orig = String(name ?? "");
    const ext = kind === "video"
      ? (/quicktime/.test(mime) ? "mov" : /webm/.test(mime) ? "webm" : "mp4")
      : kind === "invoice" ? "pdf"
      : kind === "file"
        ? ((orig.match(/\.([A-Za-z0-9]{1,8})$/) ?? [])[1] ?? "bin").toLowerCase()
        : "jpg";
    const cx = (job as any).complexes, wt = (job as any).work_types,
          cp = (job as any).counterparties;
    /* у вложения в имени остаётся исходное название файла, у съёмки — вид работы */
    const tail = kind === "file"
      ? clean(orig.replace(/\.[^.]*$/, "") || "FILE", 32)
      : kind === "invoice" ? "INVOICE"
      : clean(wt?.name || "WORK", 12);
    /* имя исполнителя нужно, если его просит шаблон имени файла или включена
       раскладка инвойсов по папкам сотрудников — читаем один раз */
    const byTech = !!org?.gd_inv_by_tech && kind === "invoice";
    let techName = "";
    let techBlocked = false;
    /* v1.08.25: вложения всегда лежат в папке сотрудника, поэтому имя нужно
       и для них — без него папка называлась «—». */
    if (((job as any).technician_id) &&
        (byTech || kind === "file" || String(org?.file_name_fmt ?? "").includes("{TECH}"))) {
      const pr = await s.from("profiles").select("display_name,blocked")
        .eq("id", (job as any).technician_id).maybeSingle();
      techName = String(pr.data?.display_name ?? "");
      techBlocked = pr.data?.blocked === true;               // v1.09.10
    }
    const tech = clean(initialsOf(techName), 3);
    const date = String(job.date ?? "");
    const file_name = renderFmt(String(org?.file_name_fmt ?? "") || FILE_FMT_DEF, {
      DATE: date, YEAR: date.slice(0, 4),
      CP: clean(cp?.abbr || cp?.name || "", 4),
      CX: clean(cx?.abbr || cx?.name || "CX"),
      UNIT: "U" + clean(job.unit_number || "0", 10),   // v1.09.12: буква U перед номером юнита
      TECH: tech, WT: clean(wt?.name || "", 12),
      NAME: tail, KIND: kind.toUpperCase(),
      SEQ: String(seq).padStart(2, "0"),
    }) + "." + ext;

    const id = crypto.randomUUID();
    const thumb_path = (kind === "file" || kind === "invoice") ? null : `${ownerId}/${id}.jpg`;  // у документа превью нет
    const { error: insErr } = await s.from("media").insert({
      id, job_id: isRep ? null : job_id, repair_id: isRep ? repair_id : null,
      owner_id: user.id, kind, seq, file_name,
      mime: String(mime ?? ""), size_bytes: size, thumb_path, status: "uploading" });
    if (insErr) return jres({ error: insErr.message }, 500);

    const t = await driveToken();
    const cfg = await driveConfig();
    /* v1.07.81: у съёмки и у документов теперь по своей папке в архиве:
       «Photos/ГГГГ-ММ» и «Files/ГГГГ-ММ». Старые месяцы из корня архива
       переносит кнопка в настройках (media-health?migrate=1). */
    const ym = String(job.date).slice(0, 7);
    /* v1.07.85: инвойсы — в «Invoices/ГГГГ-ММ» внутри архива, а если админ
       вписал в настройках ссылку на другую папку Диска — прямо в неё
       (месяц внутри неё же). Так бухгалтерию можно вынести в отдельную
       расшаренную папку, не трогая архив с фото. */
    /* v1.08.12 · РАСКЛАДКА ПО СМЫСЛУ.
         фото/видео : <корень фото> / контрагент / комплекс / юнит
         инвойсы    : <корень инвойсов> / Ivan P / 2026_09
         вложения   : <корень вложений> / Ivan P / 2026_09 / номер документа
       Папки ищутся по ID сущности через drive_dirs, а не по имени: так
       переименование в справочнике не плодит копии, и на каждый файл не
       нужен поиск по Диску. Корни, которые админ не задал, падают на
       прежние Photos / Files / Invoices внутри архива. */
    const ymd = ymDir(String(job.date ?? ""));
    let parent = "";
    if (kind === "photo" || kind === "video") {
      const cpName = String(cp?.name ?? cp?.abbr ?? "").trim();
      const cxName = String(cx?.name ?? cx?.abbr ?? "").trim();
      const unit = String(job.unit_number ?? "").trim();
      /* без контрагента или юнита в общую свалку не кладём — приложение
         покажет такие документы в разделе «Действие» */
      if (!cpName || !unit) return jres({ error: "NEED_META", need: !cpName ? "counterparty" : "unit" }, 409);
      const root = folderIdOf(String(org?.gd_photo_folder ?? "")) ||
                   await monthFolder(t, cfg.gd_folder_id, PHOTOS_DIR);
      const cpDir = await dirFor(s, t, "cp", String((job as any).counterparty_id ?? cpName), root, cpName);
      const cxDir = await dirFor(s, t, "cx", String((job as any).complex_id ?? cxName), cpDir, cxName || cpName);
      parent = await dirFor(s, t, "unit", String((job as any).complex_id ?? "") + "/" + unit, cxDir, unit);
    } else if (kind === "invoice") {
      const root = folderIdOf(String(org?.gd_inv_folder ?? "")) ||
                   await monthFolder(t, cfg.gd_folder_id, INVOICES_DIR);
      /* v1.08.25: без галочки «по сотрудникам» месяц лежит прямо в корне
         инвойсов. Раньше папка сотрудника заводилась всегда и при снятой
         галочке называлась «—». */
      let base = root;
      if (byTech) {
        const dir = techDirLabel(techFolderName(techName), techBlocked) || "—";
        base = await dirFor(s, t, "tech", String((job as any).technician_id ?? dir), root, dir);
      }
      parent = await dirFor(s, t, "ym", base + "/" + ymd, base, ymd);
    } else {
      const root = folderIdOf(String(org?.gd_files_folder ?? "")) ||
                   await monthFolder(t, cfg.gd_folder_id, FILES_DIR);
      const dir = techDirLabel(techFolderName(techName), techBlocked) || "—";
      const techDir = await dirFor(s, t, "tech", String((job as any).technician_id ?? dir), root, dir);
      const ymDirId = await dirFor(s, t, "ym", techDir + "/" + ymd, techDir, ymd);
      /* имя папки документа фиксируется при первой загрузке и дальше не
         пересчитывается: сменится шаблон номера — старые файлы не потеряются */
      const docName = String(job.date ?? "") + "_" + clean(cx?.abbr || cx?.name || "CX") +
                      "_" + clean(job.unit_number || "0", 10);
      parent = await dirFor(s, t, "doc", String(job.id), ymDirId, docName);
    }
    /* v1.07.69: сессию открывает сервер, а байты льёт браузер. Google отдаёт
       CORS-заголовки на адрес сессии только если при открытии был передан
       Origin браузера — иначе браузерный PUT отбивается («Failed to fetch»),
       хотя сам сервер с Google работает нормально. */
    const origin = req.headers.get("Origin") ?? "";
    const init = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
        "X-Upload-Content-Type": String(mime ?? "application/octet-stream"),
        "X-Upload-Content-Length": String(size) },
      body: JSON.stringify({ name: file_name, parents: [parent],
        appProperties: { job: job_id, media: id, owner: user.id } }) });
    const upload_url = init.headers.get("Location");
    if (!upload_url) return jres({ error: "DRIVE_INIT: " + await init.text() }, 502);
    /* v1.09.40: сессию запоминаем в строке файла — media-put пускает докачку только в неё
       (владелец — этот пользователь, статус «загружается»). Без колонки (SQL 1.09.40 не выполнен) — не падаем. */
    try {
      const uid = new URL(upload_url).searchParams.get("upload_id") ?? "";
      if (uid) await s.from("media").update({ upload_id: uid }).eq("id", id);
    } catch (_e) { /* колонки ещё нет */ }

    return jres({ media_id: id, upload_url, file_name, thumb_path, seq,
      cors: !!origin });                       // диагностика: ушёл ли Origin
  } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
});
