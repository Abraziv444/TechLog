import { userClient, driveToken, CORS } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
