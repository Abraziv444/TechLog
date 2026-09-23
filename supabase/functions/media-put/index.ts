import { svc, userClient, CORS, FN_VER } from "../_shared/google.ts";

const PUT_VER = "1.09.40";           // v1.09.40: докачка только в сессию своего файла

/* v1.07.69 · сервер-посредник для докачки.
   Обычно браузер льёт байты прямо в сессию Google. Если это не проходит
   (сессия открыта без Origin, фильтр в сети, старая ссылка в очереди),
   клиент сам переключается сюда: тот же кусок уходит в Google от имени
   сервера, а обратно возвращается разобранный ответ.

   Заголовки от клиента:
     x-tl-url   — адрес сессии докачки (только *.googleapis.com);
     x-tl-range — значение Content-Range для этого куска.
   Тело — сами байты (для запроса состояния «bytes * / N» тело пустое).
   v1.09.40: адрес — только сессия загрузки Google (*.googleapis.com/upload/…?upload_id=…),
   и upload_id должен принадлежать строке media этого пользователя в статусе «загружается»
   (media-begin 1.09.40 записывает его). Посредником для других запросов к Google функция больше не служит. */

const CORS_RELAY = { ...CORS,
  "Access-Control-Allow-Headers": "authorization, content-type, x-tl-url, x-tl-range" };
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...CORS_RELAY, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_RELAY });
  if (new URL(req.url).searchParams.get("ping"))         // v1.07.72: «кто ты»
    return res({ fn: "media-put", ver: PUT_VER, lib: FN_VER });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res({ error: "UNAUTHORIZED" }, 401);

    const url = req.headers.get("x-tl-url") ?? "";
    const range = req.headers.get("x-tl-range") ?? "";
    if (!range) return res({ error: "NO_RANGE" }, 400);
    let u: URL;
    try { u = new URL(url); } catch { return res({ error: "BAD_URL" }, 400); }
    if (u.protocol !== "https:" || !/(^|\.)googleapis\.com$/.test(u.host) || !u.pathname.startsWith("/upload/"))
      return res({ error: "BAD_HOST" }, 400);
    const upId = u.searchParams.get("upload_id") ?? "";             // настоящая проверка — совпадение с media.upload_id ниже
    if (!upId) return res({ error: "BAD_URL" }, 400);
    if (!/^bytes (\d+-\d+|\*)\/(\d+|\*)$/.test(range)) return res({ error: "BAD_RANGE" }, 400);
    const { data: own, error: ownErr } = await svc().from("media").select("id, owner_id, status")
      .eq("upload_id", upId).maybeSingle();
    if (ownErr) return res({ error: "RELAY_CHECK: " + ownErr.message }, 500);
    if (!own || (own as any).owner_id !== user.id || (own as any).status !== "uploading")
      return res({ error: "RELAY_FORBIDDEN" }, 403);

    const body = await req.arrayBuffer();       // пустое тело = запрос состояния
    const g = await fetch(url, { method: "PUT",
      headers: { "Content-Range": range },
      body: body.byteLength ? body : undefined });

    let id = "", error = "";
    if (g.ok) { try { id = ((await g.json()) as { id?: string }).id ?? ""; } catch (_e) { /* пусто */ } }
    else if (g.status !== 308) error = (await g.text()).slice(0, 300);

    return res({ status: g.status, range: g.headers.get("Range") ?? "", id, error });
  } catch (e) { return res({ error: String((e as Error)?.message ?? e) }, 500); }
});
