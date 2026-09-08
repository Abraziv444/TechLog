import { userClient, CORS, FN_VER } from "../_shared/google.ts";

/* v1.07.69 · сервер-посредник для докачки.
   Обычно браузер льёт байты прямо в сессию Google. Если это не проходит
   (сессия открыта без Origin, фильтр в сети, старая ссылка в очереди),
   клиент сам переключается сюда: тот же кусок уходит в Google от имени
   сервера, а обратно возвращается разобранный ответ.

   Заголовки от клиента:
     x-tl-url   — адрес сессии докачки (только *.googleapis.com);
     x-tl-range — значение Content-Range для этого куска.
   Тело — сами байты (для запроса состояния «bytes * / N» тело пустое). */

const CORS_RELAY = { ...CORS,
  "Access-Control-Allow-Headers": "authorization, content-type, x-tl-url, x-tl-range" };
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b),
  { status: s, headers: { ...CORS_RELAY, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_RELAY });
  if (new URL(req.url).searchParams.get("ping"))         // v1.07.72: «кто ты»
    return res({ fn: "media-put", ver: FN_VER });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return res({ error: "UNAUTHORIZED" }, 401);

    const url = req.headers.get("x-tl-url") ?? "";
    const range = req.headers.get("x-tl-range") ?? "";
    if (!range) return res({ error: "NO_RANGE" }, 400);
    let host = "";
    try { host = new URL(url).host; } catch { return res({ error: "BAD_URL" }, 400); }
    if (!/(^|\.)googleapis\.com$/.test(host)) return res({ error: "BAD_HOST" }, 400);

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
