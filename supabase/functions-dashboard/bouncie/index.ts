import { svc, userClient, CORS, jres } from "./google.ts";

/* =====================================================================
   v1.08.32 · BOUNCIE — прокси к GPS-трекингу (api.bouncie.dev).
   Зачем функция: секреты (client_id / client_secret / коды и токены)
   лежат ТОЛЬКО в app_secrets (RLS закрыт), браузер их не видит; сам
   Bouncie API из браузера недоступен (CORS + секрет клиента).

   Ключи в app_secrets:
     bn_client_id, bn_client_secret  — из Bouncie Developer Portal;
     bn_auth_code                    — одноразовый код авторизации.
       По документации Bouncie он НЕ истекает, пока пользователь не
       пройдёт авторизацию заново — держим как запасной вход, если
       refresh-токен протух;
     bn_refresh_token, bn_access_token, bn_token_exp — рабочие токены.

   Режимы (все требуют вход в приложение; конфиг — только админ):
     ?ping=1                — «кто ты» для диагностики;
     ?cfg=1                 — конфиг без секретов (карточка настроек);
     ?reveal=1              — секрет админу по «глазу»;
     POST {op:'exchange', code, redirect_uri} — обмен кода на токены;
     ?vehicles=1            — GET /v1/vehicles как есть (позиции машин);
     ?stats=1&from=&to=     — сводка /v1/trips по каждому IMEI из
                              справочника: мили, минуты, поездки и точка
                              окончания последней поездки (откуда уехал).
   ===================================================================== */

const BN_VER = "1.08.32";
const AUTH = "https://auth.bouncie.com/oauth/token";
const API = "https://api.bouncie.dev/v1";

type Sb = ReturnType<typeof svc>;

async function secrets(s: Sb) {
  const { data, error } = await s.from("app_secrets").select("key,value")
    .in("key", ["bn_client_id", "bn_client_secret", "bn_auth_code", "bn_redirect_uri",
                "bn_refresh_token", "bn_access_token", "bn_token_exp"]);
  if (error) throw new Error("SECRETS: " + error.message);
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[r.key] = r.value;
  return m;
}
const put = (s: Sb, key: string, value: string) =>
  s.from("app_secrets").upsert({ key, value });

/* Обмен: authorization_code или refresh_token. Bouncie при каждом refresh
   выдаёт НОВЫЙ refresh-токен, а старый гасит — сохраняем сразу же. */
async function grant(s: Sb, m: Record<string, string>, body: Record<string, string>) {
  const r = await fetch(AUTH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: m.bn_client_id, client_secret: m.bn_client_secret, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error("BOUNCIE_AUTH: " + JSON.stringify(j).slice(0, 200));
  const exp = Date.now() + Math.max(60, (+j.expires_in || 3600) - 120) * 1000;
  await put(s, "bn_access_token", j.access_token);
  await put(s, "bn_token_exp", String(exp));
  if (j.refresh_token) await put(s, "bn_refresh_token", j.refresh_token);
  return j.access_token as string;
}

let tok = { v: "", exp: 0 };                       // кэш процесса (тёплые вызовы)
async function bnToken(s: Sb): Promise<string> {
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const m = await secrets(s);
  if (!m.bn_client_id || !m.bn_client_secret) throw new Error("BN_NOT_CONFIGURED");
  let v = "";
  if (m.bn_access_token && Date.now() < +(m.bn_token_exp || 0)) v = m.bn_access_token;
  else if (m.bn_refresh_token) {
    try { v = await grant(s, m, { grant_type: "refresh_token", refresh_token: m.bn_refresh_token }); }
    catch (_e) { /* refresh протух — ниже пробуем код авторизации */ }
  }
  if (!v && m.bn_auth_code)
    v = await grant(s, m, { grant_type: "authorization_code", code: m.bn_auth_code,
                            redirect_uri: m.bn_redirect_uri ?? "" });
  if (!v) throw new Error("BN_NOT_CONNECTED");
  tok = { v, exp: Math.min(Date.now() + 10 * 60 * 1000, +(m.bn_token_exp || 0) || Date.now() + 600000) };
  return v;
}

/* Заголовок Bouncie — токен БЕЗ префикса Bearer (так требует их FAQ) */
const bnGet = async (s: Sb, path: string) => {
  const t = await bnToken(s);
  const r = await fetch(API + path, { headers: { Authorization: t, "Content-Type": "application/json" } });
  if (r.status === 401) { tok = { v: "", exp: 0 }; await put(s, "bn_token_exp", "0"); }
  if (!r.ok) throw new Error("BOUNCIE_" + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
};

/* Google encoded polyline (precision 5) → последняя точка трека.
   Нужна как «откуда уехал»: конец последней завершённой поездки. */
function polyLast(str: string): { lat: number; lng: number } | null {
  if (!str) return null;
  let i = 0, lat = 0, lng = 0, last: { lat: number; lng: number } | null = null;
  while (i < str.length) {
    for (const w of [0, 1]) {
      let shift = 0, result = 0, b = 0x20;
      while (b >= 0x20) { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (w === 0) lat += d; else lng += d;
    }
    last = { lat: lat / 1e5, lng: lng / 1e5 };
  }
  return last;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  if (url.searchParams.get("ping")) return jres({ fn: "bouncie", ver: BN_VER });

  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
    const { data: prof } = await sb.from("profiles").select("role,blocked").eq("id", user.id).maybeSingle();
    if (!prof || prof.blocked) return jres({ error: "FORBIDDEN" }, 403);
    const s = svc();
    const admin = prof.role === "admin";

    /* ---- конфиг для карточки настроек (без секретов) ---- */
    if (url.searchParams.get("cfg")) {
      if (!admin) return jres({ error: "FORBIDDEN" }, 403);
      const m = await secrets(s);
      const { data: org } = await s.from("org_settings")
        .select("bn_account,bn_checked_at").eq("id", "org").maybeSingle();
      return jres({ cfg: {
        client_id: m.bn_client_id ?? "",
        has_secret: !!m.bn_client_secret,
        has_auth: !!(m.bn_refresh_token || m.bn_auth_code),
        account: org?.bn_account ?? "", checked_at: org?.bn_checked_at ?? "" } });
    }
    if (url.searchParams.get("reveal")) {
      if (!admin) return jres({ error: "FORBIDDEN" }, 403);
      const m = await secrets(s);
      return jres({ secrets: { client_secret: m.bn_client_secret ?? "" } });
    }

    /* ---- обмен кода авторизации (кнопка «Подключить Bouncie») ---- */
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.op === "exchange") {
        if (!admin) return jres({ error: "FORBIDDEN" }, 403);
        if (!b.code || !b.redirect_uri) return jres({ error: "BAD_REQUEST" }, 400);
        const m = await secrets(s);
        if (!m.bn_client_id || !m.bn_client_secret) return jres({ error: "KEYS_NOT_SAVED" }, 400);
        await put(s, "bn_auth_code", b.code);            // код не истекает — храним как запасной
        await put(s, "bn_redirect_uri", b.redirect_uri); // Bouncie требует точного совпадения
        const v = await grant(s, m, { grant_type: "authorization_code",
          code: b.code, redirect_uri: b.redirect_uri });
        tok = { v, exp: Date.now() + 9 * 60 * 1000 };
        let account = "", vehicles = 0;
        try {
          const u = await bnGet(s, "/user");
          account = u?.name || u?.email || "";
          const vs = await bnGet(s, "/vehicles?limit=100");
          vehicles = Array.isArray(vs) ? vs.length : 0;
        } catch (_e) { /* не критично: токен уже получен */ }
        await s.from("org_settings").update({
          bn_account: account, bn_checked_at: new Date().toISOString() }).eq("id", "org");
        const { data: p } = await s.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
        await s.from("tech_log").insert({ actor: user.id, actor_name: p?.display_name ?? "",
          action: "org_set", entity: "org", entity_id: "bn_connect",
          details: { account, vehicles } }).then(r => r, () => null);
        return jres({ ok: true, account, vehicles });
      }
      return jres({ error: "BAD_REQUEST" }, 400);
    }

    /* ---- живые позиции: массив /v1/vehicles как есть ---- */
    if (url.searchParams.get("vehicles")) {
      const vs = await bnGet(s, "/vehicles?limit=100");
      return jres({ at: new Date().toISOString(), vehicles: Array.isArray(vs) ? vs : [] });
    }

    /* ---- сводка дня по поездкам: ?stats=1&from=ISO&to=ISO ---- */
    if (url.searchParams.get("stats")) {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      if (!from || !to) return jres({ error: "BAD_REQUEST" }, 400);
      if (new Date(to).getTime() - new Date(from).getTime() > 8 * 86400_000)
        return jres({ error: "RANGE_TOO_WIDE" }, 400);          // Bouncie: окно не шире недели
      const { data: rows } = await s.from("vehicles").select("imei").not("imei", "is", null);
      const imeis = [...new Set((rows ?? []).map(r => String(r.imei || "").trim()).filter(x => x))];
      const cars: Record<string, unknown> = {};
      await Promise.all(imeis.map(async (imei) => {
        try {
          const trips = await bnGet(s, "/trips?gps-format=polyline&imei=" + encodeURIComponent(imei)
            + "&starts-after=" + encodeURIComponent(from) + "&ends-before=" + encodeURIComponent(to));
          const arr = Array.isArray(trips) ? trips : [];
          const seen = new Set<string>();                        // дубли по transactionId (два потока данных)
          let mi = 0, sec = 0, n = 0, lastEnd = null as null | { lat: number; lng: number }, lastAt = "";
          for (const tr of arr) {
            const key = tr.transactionId || (tr.startTime + "|" + tr.endTime);
            if (seen.has(key)) continue; seen.add(key);
            mi += +tr.distance || 0; n++;
            const a = Date.parse(tr.startTime), b = Date.parse(tr.endTime);
            if (b > a) sec += (b - a) / 1000;
            if (!lastAt || tr.endTime > lastAt) {
              lastAt = tr.endTime;
              lastEnd = polyLast(tr.gps) ?? lastEnd;
            }
          }
          cars[imei] = { mi: Math.round(mi * 10) / 10, min: Math.round(sec / 60), n, lastEnd, lastAt };
        } catch (e) {
          cars[imei] = { err: String((e as Error)?.message ?? e).slice(0, 120) };
        }
      }));
      return jres({ at: new Date().toISOString(), cars });
    }

    return jres({ error: "BAD_REQUEST" }, 400);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const code = /BN_NOT_CONFIGURED|BN_NOT_CONNECTED|KEYS_NOT_SAVED/.test(msg) ? 409 : 500;
    return jres({ error: msg }, code);
  }
});
