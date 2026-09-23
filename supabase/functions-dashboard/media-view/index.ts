import { userClient, driveToken, CORS, FN_VER } from "./google.ts";

/* v1.09.42 (п. 56): у каждой функции своя версия в ver — «Функции сервера» видят старую копию даже без правки общего google.ts (общий FN_VER — в lib) */
const VIEW_VER = "1.09.42";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))      // v1.07.72: «кто ты»
    return new Response(JSON.stringify({ fn: "media-view", ver: VIEW_VER, lib: FN_VER }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401, headers: CORS });

  const { data: m } = await sb.from("media")
    .select("drive_file_id,mime,status").eq("id", id).maybeSingle();
  if (!m || m.status !== "ready") return new Response("not found", { status: 404, headers: CORS });

  const t = await driveToken();
  const h: Record<string,string> = { Authorization: `Bearer ${t}` };
  const range = req.headers.get("Range"); if (range) h["Range"] = range;
  const g = await fetch(
    `https://www.googleapis.com/drive/v3/files/${m.drive_file_id}?alt=media`, { headers: h });

  const out = new Headers(CORS);
  out.set("Content-Type", m.mime || g.headers.get("Content-Type") || "application/octet-stream");
  for (const k of ["Content-Length","Content-Range","Accept-Ranges"]) {
    const v = g.headers.get(k); if (v) out.set(k, v);
  }
  out.set("Cache-Control", "private, max-age=3600");
  return new Response(g.body, { status: g.status, headers: out });
});
