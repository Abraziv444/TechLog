import { svc, userClient, driveToken, monthFolder, CORS, jres, FN_VER,
         PHOTOS_DIR, FILES_DIR, INVOICES_DIR, folderIdOf } from "../_shared/google.ts";

/* v1.07.64 · три режима:
   ?cfg=1     — только конфиг без секретов (быстро, для отрисовки карточки);
   ?reveal=1  — реальные значения секретов админу по клику «глаза»;
   без параметров — полная проверка: БД, токен, аккаунт, место, папка, запись.

   Скоуп drive.file даёт доступ ТОЛЬКО к тому, что создано самим приложением,
   поэтому папка, созданная руками в интерфейсе Диска, не видна (404 File not
   found). ID чистится от вставленной ссылки, доступ проверяется, и если папки
   нет — приложение создаёт свою «TechLog Archive» и запоминает её.
   Свободное место пишется в org_settings — так его видит и менеджер. */

const cleanId = (s: string) => {
  const v = String(s ?? "").trim();
  const m = v.match(/\/folders\/([^/?#]+)/) || v.match(/[?&]id=([^&#]+)/);
  if (m) return m[1];
  return v.replace(/^https?:\/\/[^/]+\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
};

async function saveQuota(s: ReturnType<typeof svc>, about: Record<string, any>) {
  const q = about?.storageQuota ?? {};
  const usage = Number(q.usage ?? 0), limit = Number(q.limit ?? 0);
  const free = limit ? Number((100 - (usage * 100) / limit).toFixed(1)) : null;
  await s.from("org_settings").update({
    gd_used_gb: Number((usage / 1e9).toFixed(2)),
    gd_limit_gb: limit ? Number((limit / 1e9).toFixed(2)) : null,
    gd_free_pct: free,
    gd_account: about?.user?.emailAddress ?? null,
    gd_checked_at: new Date().toISOString(),
  }).eq("id", "org");
  return { usage, limit, free };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))         // v1.07.72: «кто ты»
    return jres({ fn: "media-health", ver: FN_VER });
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return jres({ error: "FORBIDDEN" }, 403);

  const url = new URL(req.url);
  const s = svc();

  /* v1.07.88 · СВЕРКА С ДИСКОМ. Проходим по записям media и спрашиваем Диск,
     жив ли файл. Отвечаем списком потерянных id — приложение помечает их в
     карточках документов. За один прогон берём не больше 400 записей. */
  if (new URL(req.url).searchParams.get("audit")) {
    try {
      const t = await driveToken();
      const { data: rows } = await s.from("media")
        .select("id,drive_file_id,job_id,kind,archived_at")
        .not("drive_file_id", "is", null).limit(400);
      const lost: string[] = [];
      for (const m of rows ?? []) {
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${m.drive_file_id}?fields=id,trashed`,
          { headers: { Authorization: `Bearer ${t}` } });
        if (r.status === 404) { lost.push(m.id); continue; }
        if (r.ok) { const j = await r.json(); if (j.trashed) lost.push(m.id); }
      }
      return jres({ audit: { checked: rows?.length ?? 0, lost: lost.length, lost_ids: lost } });
    } catch (e) {
      return jres({ audit: { error: String((e as Error)?.message ?? e) } }, 200);
    }
  }
  const r: Record<string, unknown> = {};

  // ---- секреты: только по явному запросу админа, в базе они и остаются ----
  if (url.searchParams.get("reveal")) {
    const { data } = await s.from("app_secrets").select("key,value")
      .in("key", ["gd_client_secret", "gd_refresh_token"]);
    const m: Record<string, string> = {};
    for (const row of data ?? []) m[row.key] = row.value;
    return jres({ secrets: { client_secret: m.gd_client_secret ?? "",
                             refresh_token: m.gd_refresh_token ?? "" } });
  }

  // ---- конфиг без секретов ----
  let folder = "";
  try {
    const { data } = await s.from("app_secrets").select("key,value")
      .in("key", ["gd_client_id", "gd_client_secret", "gd_refresh_token", "gd_folder_id"]);
    const m: Record<string, string> = {};
    for (const row of data ?? []) m[row.key] = row.value;
    folder = cleanId(m.gd_folder_id ?? "");
    if (folder && folder !== (m.gd_folder_id ?? ""))            // почистили — сохраняем
      await s.from("app_secrets").upsert({ key: "gd_folder_id", value: folder });
    const { data: org } = await s.from("org_settings").select("gd_account").eq("id", "org").maybeSingle();
    r.cfg = { client_id: m.gd_client_id ?? "", folder_id: folder, account: org?.gd_account ?? "",
      has_secret: !!m.gd_client_secret, has_refresh: !!m.gd_refresh_token };
  } catch (_e) { /* не критично */ }

  if (url.searchParams.get("cfg")) return jres(r);              // быстрый режим для карточки

  /* v1.07.70 · сквозная проверка загрузки.
     ?probe=1   — открыть сессию докачки для тестовой картинки (с Origin
                  браузера, как для настоящего фото) и вернуть её адрес;
     ?cleanup=1 — удалить тестовые файлы с Диска по списку id.
     В таблицу media ничего не пишется, лимиты документа не расходуются. */
  const SELFTEST = "TechLog-selftest-";
  if (url.searchParams.get("probe")) {
    try {
      const { size, kind } = await req.json().catch(() => ({ size: 0, kind: "photo" }));
      const t = await driveToken();
      const origin = req.headers.get("Origin") ?? "";
      const isFile = kind === "file";
      const name = SELFTEST + new Date().toISOString().replace(/[:.]/g, "-")
        + (isFile ? ".txt" : ".jpg");
      /* v1.07.81: кладём туда же, куда пойдёт настоящий файл —
         «Photos/ГГГГ-ММ» для съёмки, «Files/ГГГГ-ММ» для вложения. */
      const ym = new Date().toISOString().slice(0, 7);
      const base = folder ? await monthFolder(t, folder, isFile ? FILES_DIR : PHOTOS_DIR) : "";
      const month = base ? await monthFolder(t, base, ym) : "";
      const root = folder ? await (await fetch(
        `https://www.googleapis.com/drive/v3/files/${folder}?fields=id,name`,
        { headers: { Authorization: `Bearer ${t}` } })).json() : {};
      const init = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
          "X-Upload-Content-Type": isFile ? "text/plain" : "image/jpeg",
          ...(Number(size) > 0 ? { "X-Upload-Content-Length": String(size) } : {}) },
        body: JSON.stringify({ name, parents: month ? [month] : (folder ? [folder] : undefined),
          appProperties: { techlog: "selftest" } }) });
      const upload_url = init.headers.get("Location");
      if (!upload_url) return jres({ error: "DRIVE_INIT: " + (await init.text()).slice(0, 200) }, 502);
      return jres({ upload_url, name, origin: !!origin, kind: isFile ? "file" : "photo",
        folder: { root_id: folder, root_name: root?.name ?? "", month_id: month, month: ym,
          path: (root?.name ?? "—") + " / " + (isFile ? FILES_DIR : PHOTOS_DIR) + " / " + ym } });
    } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
  }
  /* v1.07.72: где файл оказался на самом деле — сверка каталога */
  if (url.searchParams.get("verify")) {
    try {
      const id = encodeURIComponent(String(url.searchParams.get("verify")));
      const t = await driveToken();
      const f = await (await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,size,parents`,
        { headers: { Authorization: `Bearer ${t}` } })).json();
      if (!f?.id) return jres({ error: "NOT_ON_DRIVE" }, 404);
      /* v1.07.76: путь считаем вглубь — вложения лежат на уровень ниже
         (архив / Files / 2026-09), и проверка каталога должна это понимать. */
      let cursor = (f.parents ?? [])[0] ?? "", inArchive = false;
      const chain: string[] = [];
      for (let i = 0; i < 4 && cursor; i++) {
        if (cursor === folder) { inArchive = true; break; }
        const p = await (await fetch(
          `https://www.googleapis.com/drive/v3/files/${cursor}?fields=id,name,parents`,
          { headers: { Authorization: `Bearer ${t}` } })).json();
        chain.unshift(p?.name ?? "?");
        cursor = (p?.parents ?? [])[0] ?? "";
      }
      return jres({ ok: true, name: f.name, size: Number(f.size ?? 0),
        parent_id: (f.parents ?? [])[0] ?? "", parent_name: chain[chain.length - 1] ?? "",
        path: chain.join(" / "), in_archive: inArchive, root_id: folder });
    } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
  }
  /* v1.07.72: bucket миниатюр — проверяем сервером, RLS его не закрывает */
  if (url.searchParams.get("storage")) {
    try {
      const key = `_selftest/${crypto.randomUUID()}.txt`;
      const up = await s.storage.from("media-thumbs")
        .upload(key, new Blob(["techlog"]), { contentType: "text/plain", upsert: true });
      if (up.error) return jres({ ok: false, error: up.error.message }, 200);
      await s.storage.from("media-thumbs").remove([key]);
      return jres({ ok: true });
    } catch (e) { return jres({ ok: false, error: String((e as Error)?.message ?? e) }, 200); }
  }
  if (url.searchParams.get("cleanup")) {
    try {
      const { ids } = await req.json().catch(() => ({ ids: [] }));
      const t = await driveToken();
      let deleted = 0;
      for (const raw of (Array.isArray(ids) ? ids : []).slice(0, 10)) {
        const id = encodeURIComponent(String(raw));
        // удаляем только собственные тестовые файлы — чужое не трогаем
        const info = await fetch(
          `https://www.googleapis.com/drive/v3/files/${id}?fields=name,appProperties`,
          { headers: { Authorization: `Bearer ${t}` } });
        if (!info.ok) continue;
        const f = await info.json();
        if (f?.appProperties?.techlog !== "selftest" && !String(f?.name ?? "").startsWith(SELFTEST)) continue;
        const d = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
        if (d.ok || d.status === 404) deleted++;
      }
      return jres({ deleted });
    } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
  }

  /* v1.07.81 · разовый переезд старых месяцев в папку «Photos».
     До этой версии съёмка ложилась прямо в корень архива (архив/ГГГГ-ММ),
     и месячные папки соседствовали с «Files» и служебными файлами. Кнопка
     в настройках переносит их внутрь «Photos». Идентификаторы файлов при
     переносе не меняются, поэтому ссылки в базе остаются рабочими, а
     повторный запуск просто вернёт moved: 0 — переносить будет нечего. */
  if (url.searchParams.get("migrate")) {
    try {
      if (!folder) return jres({ error: "NO_FOLDER" }, 400);
      const t = await driveToken();
      const photos = await monthFolder(t, folder, PHOTOS_DIR);
      if (!photos) return jres({ error: "NO_PHOTOS_DIR" }, 502);
      const q = encodeURIComponent(
        `'${folder}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const list = await (await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=200`,
        { headers: { Authorization: `Bearer ${t}` } })).json();
      const months = (list.files ?? [])
        .filter((f: { name: string }) => /^\d{4}-\d{2}$/.test(f.name));
      let moved = 0, merged = 0;
      for (const m of months) {
        /* такой месяц уже заведён внутри Photos? тогда переносим содержимое
           по одному файлу, а пустую папку из корня отправляем в корзину */
        const qq = encodeURIComponent(
          `name='${m.name}' and '${photos}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const ex = await (await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${qq}&fields=files(id)`,
          { headers: { Authorization: `Bearer ${t}` } })).json();
        const twin = ex.files?.[0]?.id;
        if (!twin) {
          const mv = await fetch(
            `https://www.googleapis.com/drive/v3/files/${m.id}?addParents=${photos}&removeParents=${folder}&fields=id`,
            { method: "PATCH", headers: { Authorization: `Bearer ${t}` } });
          if (mv.ok) moved++;
          continue;
        }
        const qf = encodeURIComponent(`'${m.id}' in parents and trashed=false`);
        const inner = await (await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${qf}&fields=files(id)&pageSize=1000`,
          { headers: { Authorization: `Bearer ${t}` } })).json();
        for (const f of inner.files ?? []) {
          const mv = await fetch(
            `https://www.googleapis.com/drive/v3/files/${f.id}?addParents=${twin}&removeParents=${m.id}&fields=id`,
            { method: "PATCH", headers: { Authorization: `Bearer ${t}` } });
          if (mv.ok) merged++;
        }
        await fetch(`https://www.googleapis.com/drive/v3/files/${m.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }) });
        moved++;
      }
      return jres({ ok: true, moved, merged, months: months.length, folder: photos });
    } catch (e) { return jres({ error: String((e as Error)?.message ?? e) }, 500); }
  }

  try {
    const t0 = Date.now();
    await s.from("org_settings").select("id").limit(1);
    r.db = { ok: true, ms: Date.now() - t0 };
  } catch (e) { r.db = { ok: false, error: String(e) }; }

  try {
    const t0 = Date.now();
    const t = await driveToken();
    r.auth = { ok: true, ms: Date.now() - t0 };
    const about = await (await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(emailAddress)",
      { headers: { Authorization: `Bearer ${t}` } })).json();
    const q = await saveQuota(s, about);
    r.drive = { ok: true, account: about.user?.emailAddress,
      used_gb: (q.usage / 1e9).toFixed(2),
      limit_gb: q.limit ? (q.limit / 1e9).toFixed(1) : "∞",
      free_pct: q.free };
    if (r.cfg) (r.cfg as Record<string, unknown>).account = about.user?.emailAddress ?? "";

    // доступна ли папка приложению?
    let reachable = false, rootName = "";
    if (folder) {
      const chk = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folder}?fields=id,name,trashed`,
        { headers: { Authorization: `Bearer ${t}` } });
      if (chk.ok) { const f = await chk.json(); reachable = !f.trashed; rootName = f.name ?? ""; }
    }
    if (!reachable) {                     // папка сделана руками в Диске — создаём свою
      const mkf = await (await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "TechLog Archive",
          mimeType: "application/vnd.google-apps.folder" }) })).json();
      if (mkf.id) {
        folder = mkf.id; rootName = "TechLog Archive";
        await s.from("app_secrets").upsert({ key: "gd_folder_id", value: folder });
        if (r.cfg) (r.cfg as Record<string, unknown>).folder_id = folder;
        r.folder = { ok: true, created: true, id: folder, name: rootName };
      } else r.folder = { ok: false, error: JSON.stringify(mkf).slice(0, 200) };
    } else r.folder = { ok: true, id: folder, name: rootName };

    /* v1.07.78: наглядно, куда что ложится. Админ видит в настройках две
       строки с иконкой папки и её именем — как в самом Google Диске;
       v1.07.81: у съёмки появилась своя папка, поэтому пути стали
       симметричными: «архив / Photos / ГГГГ-ММ» и «архив / Files / ГГГГ-ММ».
       Папки те же самые, что использует настоящая отправка (monthFolder),
       поэтому проверка заодно создаёт их заранее. */
    if (folder) {
      try {
        const ym = new Date().toISOString().slice(0, 7);
        const photoRoot = await monthFolder(t, folder, PHOTOS_DIR);
        const photoMonth = photoRoot ? await monthFolder(t, photoRoot, ym) : "";
        const filesRoot = await monthFolder(t, folder, FILES_DIR);
        const fileMonth = filesRoot ? await monthFolder(t, filesRoot, ym) : "";
        /* v1.07.85: третья строка — инвойсы. Если админ указал в настройках
           чужую папку Диска, показываем её же, а не «архив / Invoices». */
        let invName = "", byTech = false;
        try {
          const q = await svc().from("org_settings")
            .select("gd_inv_folder,gd_inv_by_tech").eq("id", "org").maybeSingle();
          invName = folderIdOf(String(q.data?.gd_inv_folder ?? ""));
          byTech = !!q.data?.gd_inv_by_tech;
        } catch (_e) { invName = ""; }
        const invRoot = invName || await monthFolder(t, folder, INVOICES_DIR);
        /* v1.07.87: с галочкой «по сотрудникам» месяц лежит внутри папки
           исполнителя, поэтому показываем сам корень инвойсов и схему пути —
           заранее создавать папки под каждого сотрудника незачем. */
        const invMonth = byTech ? invRoot : (invRoot ? await monthFolder(t, invRoot, ym) : "");
        r.paths = {
          photo: { id: photoMonth, name: ym, path: `${rootName || "—"} / ${PHOTOS_DIR} / ${ym}` },
          file: { id: fileMonth, name: ym, path: `${rootName || "—"} / ${FILES_DIR} / ${ym}` },
          invoice: { id: invMonth, name: byTech ? "…" : ym,
            path: (invName ? `(${INVOICES_DIR})` : `${rootName || "—"} / ${INVOICES_DIR}`) +
                  (byTech ? ` / <сотрудник> / ${ym}` : ` / ${ym}`) },
        };
      } catch (_e) { /* не критично: тест продолжается */ }
    }

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
