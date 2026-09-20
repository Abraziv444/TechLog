import { svc, userClient, CORS, jres } from "../_shared/google.ts";

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
                              Заодно (v1.08.33) пишет журнал времени на
                              объектах (site_visits): конец поездки рядом
                              с комплексом = прибытие, старт следующей
                              оттуда = убытие;
     ?track=1&imei=&date=   — поездки машины за день (polyline) для
                              отрисовки реального трека (право bn_track);
     ?tracks=1&from=&to=[&refresh=1] — v1.09.10: ИСТОРИЯ ТРЕКОВ из таблицы
                              bn_trips за дни from..to (YYYY-MM-DD, не шире 31 дня;
                              право bn_track). Дни, которых в базе ещё нет или
                              которые сохранялись до конца суток, сначала
                              догружаются из Bouncie (окнами по 5 дней) и
                              записываются; «закрытые» дни читаются только из
                              базы. refresh=1 перечитывает весь диапазон.
   Поездки пишутся в bn_trips и попутно — из ?stats=1 и ?tv=1 (их и так
   запрашивают весь день), так что история копится сама, без cron.
   День поездки — по времени Нью-Йорка (как бэкапы и отчёты).

   Доступ к данным трекера (v1.08.33): profiles.bn_access — null значит
   «по роли» (админ и менеджер да, воркер нет); Check Engine / топливо /
   ТО ставятся в push_queue прямо отсюда при смене состояния машины.
   ===================================================================== */

const BN_VER = "1.09.10";
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
/* ---------- v1.09.10: история треков ---------- */
const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
function nyDay(iso: string | number | Date): string { try { return NY_DAY.format(new Date(iso)); } catch (_e) { return ""; } }
function addDays(day: string, d: number): string { return new Date(Date.parse(day + "T12:00:00Z") + d * 86400_000).toISOString().slice(0, 10); }
/* запись поездок одной машины; дубли (два потока данных Bouncie) сворачиваются по началу поездки */
async function tripsStore(s: any, imei: string, arr: any[], drv: string | null, veh: string | null): Promise<number> {
  const seen = new Set<string>(); const rows: any[] = [];
  for (const tr of arr) {
    if (!tr || !tr.startTime || !tr.endTime) continue;
    const k = String(tr.startTime); if (seen.has(k)) continue; seen.add(k);
    rows.push({ imei, day: nyDay(tr.startTime), started_at: tr.startTime, ended_at: tr.endTime,
      mi: Math.round((+tr.distance || 0) * 10) / 10, gps: String(tr.gps ?? ""), tx: tr.transactionId ? String(tr.transactionId) : null,
      driver_id: drv, vehicle_id: veh });
  }
  if (!rows.length) return 0;
  const { error } = await s.from("bn_trips").upsert(rows, { onConflict: "imei,started_at" });
  if (error) throw new Error("bn_trips: " + error.message);
  return rows.length;
}
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
function polyFirst(str: string): { lat: number; lng: number } | null {
  if (!str) return null;
  let i = 0; const out = [0, 0];
  for (const w of [0, 1]) {
    let shift = 0, result = 0, b = 0x20;
    while (b >= 0x20 && i < str.length) { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; }
    out[w] = (result & 1) ? ~(result >> 1) : (result >> 1);
  }
  return { lat: out[0] / 1e5, lng: out[1] / 1e5 };
}
/* мили по прямой (haversine) */
function miP(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): number {
  if (!a || !b) return 1e9;
  const R = 3958.8, r = Math.PI / 180;
  const la1 = a.lat * r, la2 = b.lat * r;
  const s = Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* v1.08.33: смена состояния машин (Check Engine / топливо / ТО) → пуши.
   Адресаты: Check Engine и топливо — все с доступом к трекеру
   (bn_eff_access), ТО — админ и те, кому включён bn_service. Личные
   галочки уважает push_enqueue (kind bn_alert / bn_service). */
async function vehicleAlerts(s: Sb, live: any[]) {
  const { data: rows } = await s.from("vehicles")
    .select("id,imei,car_no,make,driver_id,mil,fuel_low,last_odo,service_due_mi,service_notified");
  if (!rows?.length) return;
  const byImei: Record<string, any> = {};
  for (const bv of live) byImei[String(bv.imei ?? "")] = bv;
  let targetsA: string[] | null = null, targetsS: string[] | null = null;
  async function targets() {
    if (targetsA) return;
    const { data: ps } = await s.from("profiles")
      .select("id,role,blocked,bn_access,bn_service");
    targetsA = (ps ?? []).filter(p => !p.blocked &&
      (p.bn_access ?? (p.role === "admin" || p.role === "manager"))).map(p => p.id);
    targetsS = (ps ?? []).filter(p => !p.blocked &&
      (p.bn_service ?? (p.role === "admin"))).map(p => p.id);
  }
  const enq = (uid: string, kind: string, title: string, body: string) =>
    s.rpc("push_enqueue", { p_user: uid, p_kind: kind, p_title: title, p_body: body, p_url: "./" });
  const { data: profs } = await s.from("profiles").select("id,display_name");
  const nameOf = (id: string | null) =>
    (profs ?? []).find(p => p.id === id)?.display_name ?? "";
  for (const v of rows) {
    const bv = byImei[String(v.imei ?? "")]; if (!bv) continue;
    const st = bv.stats ?? {};
    const milOn = !!(st.mil && (st.mil.milOn ?? st.mil === true));
    const fuel = typeof st.fuelLevel === "number" ? st.fuelLevel : null;
    const odo = typeof st.odometer === "number" ? st.odometer : null;
    const who = "№" + (v.car_no ?? "·") + " · " + (v.make || "") +
      (v.driver_id ? " · " + nameOf(v.driver_id) : "");
    const patch: Record<string, unknown> = {};
    if (milOn !== !!v.mil) {
      patch.mil = milOn;
      if (milOn) { await targets(); for (const u of targetsA!) await enq(u, "bn_alert", "Check Engine ⚠", who); }
    }
    if (fuel !== null) {
      if (fuel < 15 && !v.fuel_low) {
        patch.fuel_low = true;
        await targets(); for (const u of targetsA!) await enq(u, "bn_alert", "Мало топлива: " + Math.round(fuel) + "%", who);
      } else if (fuel >= 20 && v.fuel_low) patch.fuel_low = false;   // гистерезис
    }
    if (odo !== null) {
      if (odo !== v.last_odo) patch.last_odo = odo;
      if (v.service_due_mi && odo >= v.service_due_mi - 500 && !v.service_notified) {
        patch.service_notified = true;
        await targets();
        for (const u of targetsS!) await enq(u, "bn_service", "Пора на ТО",
          who + " · одометр " + Math.round(odo) + " mi, ТО на " + v.service_due_mi);
      }
    }
    if (Object.keys(patch).length) await s.from("vehicles").update(patch).eq("id", v.id);
  }
}

/* v1.08.33: журнал времени на объектах из поездок дня.
   Конец поездки в радиусе 0.15 mi от комплекса — прибытие; старт
   следующей поездки оттуда — убытие. Открытый визит остаётся с
   left_at = null, пока машина не уедет. */
async function visitsUpsert(s: Sb, perImei: Record<string, { drv: string | null;
    trips: { s: string; e: string; a: any; b: any }[] }>) {
  const { data: cxs } = await s.from("complexes")
    .select("id,lat,lng").not("lat", "is", null).not("lng", "is", null);
  if (!cxs?.length) return;
  const near = (p: any) => {
    let best: any = null, bd = 0.15;
    for (const c of cxs) {
      const d = miP(p, { lat: +c.lat, lng: +c.lng });
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const rows: any[] = [];
  for (const [imei, rec] of Object.entries(perImei)) {
    if (!rec.drv) continue;
    const trips = rec.trips.slice().sort((x, y) => x.e.localeCompare(y.e));
    let open: { cx: string; arr: string } | null = null;
    for (const tr of trips) {
      if (open) {
        const cA = near(tr.a);
        if (cA && cA.id === open.cx) {                      // уехал с объекта
          rows.push({ driver_id: rec.drv, vehicle_imei: imei, complex_id: open.cx,
            arrived_at: open.arr, left_at: tr.s,
            date: new Date(open.arr).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) });
          open = null;
        }
      }
      const cB = near(tr.b);
      if (cB && (!open || open.cx !== cB.id)) open = { cx: cB.id, arr: tr.e };
    }
    if (open) rows.push({ driver_id: rec.drv, vehicle_imei: imei, complex_id: open.cx,
      arrived_at: open.arr, left_at: null,
      date: new Date(open.arr).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) });
  }
  for (let i = 0; i < rows.length; i += 100)
    await s.from("site_visits").upsert(rows.slice(i, i + 100),
      { onConflict: "driver_id,complex_id,arrived_at" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  if (url.searchParams.get("ping")) return jres({ fn: "bouncie", ver: BN_VER });

  /* =====================================================================
     v1.08.37 · РЕЖИМ ТЕЛЕВИЗОРА: ?tv=1&from=&to= + заголовок x-tv-key.
     Телевизор не залогинен, поэтому доступ проверяется по approved-сессии
     из public.tv_sessions (создаётся кнопкой «Режим телевизора», апрув —
     в админке). Ответ санитизирован: НИКАКИХ imei/vin/одометров/топлива —
     только номер машины, водитель, позиция и суточная сводка миль.
     ===================================================================== */
  if (url.searchParams.get("tv")) {
    try {
      const key = req.headers.get("x-tv-key") ?? url.searchParams.get("tvkey") ?? "";
      if (!key) return jres({ error: "TV_FORBIDDEN" }, 403);
      const s = svc();
      const { data: sess } = await s.from("tv_sessions")
        .select("id,status").eq("device_key", key).maybeSingle();
      if (!sess || sess.status !== "approved") return jres({ error: "TV_FORBIDDEN" }, 403);
      await s.from("tv_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", sess.id);
      const { data: rows } = await s.from("vehicles")
        .select("imei,car_no,driver_id").not("imei", "is", null);
      const veh = (rows ?? []).filter(v => String(v.imei ?? "").trim());
      if (!veh.length) return jres({ at: new Date().toISOString(), cars: [] });
      const live = await bnGet(s, "/vehicles?limit=100");
      const byImei: Record<string, any> = {};
      for (const x of (Array.isArray(live) ? live : [])) byImei[String(x.imei ?? "")] = x;
      /* суточные мили — как в ?stats=1, но без журнала визитов и лишних полей */
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      const day: Record<string, { mi: number; min: number; n: number }> = {};
      if (from && to && new Date(to).getTime() - new Date(from).getTime() <= 2 * 86400_000) {
        await Promise.all(veh.map(async (v) => {
          const imei = String(v.imei).trim();
          try {
            const trips = await bnGet(s, "/trips?gps-format=polyline&imei=" + encodeURIComponent(imei)
              + "&starts-after=" + encodeURIComponent(from) + "&ends-before=" + encodeURIComponent(to));
            const arr = Array.isArray(trips) ? trips : [];
            const seen = new Set<string>();
            let mi = 0, sec = 0, cnt = 0;
            for (const tr of arr) {
              const k2 = tr.transactionId || (tr.startTime + "|" + tr.endTime);
              if (seen.has(k2)) continue; seen.add(k2);
              mi += +tr.distance || 0; cnt++;
              const a = Date.parse(tr.startTime), b = Date.parse(tr.endTime);
              if (b > a) sec += (b - a) / 1000;
            }
            day[imei] = { mi: Math.round(mi * 10) / 10, min: Math.round(sec / 60), n: cnt };
            try { await tripsStore(s, imei, arr, v.driver_id ?? null, null); } catch (_e2) { /* v1.09.10 */ }
          } catch (_e) { /* без сводки — машина всё равно уедет в ответ */ }
        }));
      }
      const cars = veh.map(v => {
        const imei = String(v.imei).trim();
        const x = byImei[imei]; const st = x && x.stats; const l = st && st.location;
        const d = day[imei];
        return {
          car_no: v.car_no ?? null, driver_id: v.driver_id ?? null,
          run: !!(st && (st.isRunning || (+st.speed || 0) > 2)),
          lat: l && l.lat != null ? +l.lat : null,
          lng: l && l.lat != null ? +(l.lon ?? l.lng) : null,
          heading: l ? (+l.heading || 0) : 0,
          mi: d ? d.mi : null, min: d ? d.min : null, n: d ? d.n : null };
      });
      return jres({ at: new Date().toISOString(), cars });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      const code = /BN_NOT_CONFIGURED|BN_NOT_CONNECTED/.test(msg) ? 409 : 500;
      return jres({ error: msg.slice(0, 160) }, code);
    }
  }

  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
    const { data: prof } = await sb.from("profiles")
      .select("role,blocked,bn_access,bn_track").eq("id", user.id).maybeSingle();
    if (!prof || prof.blocked) return jres({ error: "FORBIDDEN" }, 403);
    const s = svc();
    const admin = prof.role === "admin";
    /* v1.08.33: доступ к данным трекера — по роли или личному флагу */
    const canBn = prof.bn_access ?? (admin || prof.role === "manager");
    const canTrack = admin || prof.bn_track === true;

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
      if (!canBn) return jres({ error: "NO_ACCESS" }, 403);
      const vs = await bnGet(s, "/vehicles?limit=100");
      const arr = Array.isArray(vs) ? vs : [];
      try { await vehicleAlerts(s, arr); } catch (_e) { /* пуши не критичны для ответа */ }
      return jres({ at: new Date().toISOString(), vehicles: arr });
    }

    /* ---- трек машины за день: ?track=1&imei=&date=YYYY-MM-DD ---- */
    if (url.searchParams.get("track")) {
      if (!canTrack) return jres({ error: "NO_ACCESS" }, 403);
      const imei = url.searchParams.get("imei") ?? "";
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !imei) return jres({ error: "BAD_REQUEST" }, 400);
      const from = new Date(Date.parse(date) - 12 * 3600_000).toISOString();
      const to = new Date(Date.parse(date) + 36 * 3600_000).toISOString();
      const trips = await bnGet(s, "/trips?gps-format=polyline&imei=" + encodeURIComponent(imei)
        + "&starts-after=" + encodeURIComponent(from) + "&ends-before=" + encodeURIComponent(to));
      const seen = new Set<string>();
      const out = (Array.isArray(trips) ? trips : []).filter((tr: any) => {
        const k = tr.transactionId || (tr.startTime + "|" + tr.endTime);
        if (seen.has(k)) return false; seen.add(k); return true;
      }).map((tr: any) => ({ gps: tr.gps ?? "", s: tr.startTime, e: tr.endTime,
        mi: Math.round((+tr.distance || 0) * 10) / 10 }));
      return jres({ ok: true, date, imei, trips: out });
    }

    /* ---- v1.09.10 · история треков: ?tracks=1&from=YYYY-MM-DD&to=YYYY-MM-DD[&refresh=1] ---- */
    if (url.searchParams.get("tracks")) {
      if (!canTrack) return jres({ error: "NO_ACCESS" }, 403);
      const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
      const RX = /^\d{4}-\d{2}-\d{2}$/;
      if (!RX.test(from) || !RX.test(to) || to < from) return jres({ error: "BAD_REQUEST" }, 400);
      if ((Date.parse(to) - Date.parse(from)) / 86400_000 > 31) return jres({ error: "RANGE_TOO_WIDE" }, 400);
      const refresh = !!url.searchParams.get("refresh");
      const today = nyDay(Date.now());
      const days: string[] = []; for (let d = from; d <= to && d <= today; d = addDays(d, 1)) days.push(d);
      const { data: known, error: e0 } = await s.from("bn_trip_days").select("day,synced_at").gte("day", from).lte("day", to);
      if (e0) return jres({ error: "NEED_SQL", detail: e0.message }, 409);           // таблиц ещё нет — нужен update-to-1_09_10.sql
      const syncedAt: Record<string, number> = {};
      for (const r of known ?? []) syncedAt[String(r.day)] = Date.parse(r.synced_at);
      /* день «закрыт», если сохранялся позже чем через 3 часа после своего конца (конец — с запасом, +29 ч от полудня UTC) */
      const closed = (d: string) => (syncedAt[d] ?? 0) > Date.parse(d + "T12:00:00Z") + 29 * 3600_000 + 3 * 3600_000;
      const need = days.filter(d => refresh || !closed(d));
      const { data: vrows } = await s.from("vehicles").select("id,imei,driver_id").not("imei", "is", null);
      const vehs = (vrows ?? []).map((r: any) => ({ id: r.id, imei: String(r.imei || "").trim(), drv: r.driver_id ?? null })).filter((x: any) => x.imei);
      let pulled = 0; const errs: string[] = [];
      for (let i = 0; i < need.length; ) {                                           // окна по ≤ 5 дней подряд (лимит Bouncie — неделя с запасом по краям)
        let j = i; while (j + 1 < need.length && j - i < 4 && need[j + 1] === addDays(need[j], 1)) j++;
        const wFrom = new Date(Date.parse(need[i] + "T00:00:00Z") - 2 * 3600_000).toISOString();
        const wTo = new Date(Date.parse(need[j] + "T00:00:00Z") + 34 * 3600_000).toISOString();
        const inWin = new Set(need.slice(i, j + 1));
        const got = await Promise.all(vehs.map(async (v: any) => {
          try {
            const trips = await bnGet(s, "/trips?gps-format=polyline&imei=" + encodeURIComponent(v.imei)
              + "&starts-after=" + encodeURIComponent(wFrom) + "&ends-before=" + encodeURIComponent(wTo));
            const arr = (Array.isArray(trips) ? trips : []).filter((tr: any) => inWin.has(nyDay(tr.startTime)));
            return await tripsStore(s, v.imei, arr, v.drv, v.id);
          } catch (e) { errs.push(v.imei + ": " + String((e as Error)?.message ?? e).slice(0, 80)); return 0; }
        }));
        pulled += got.reduce((a: number, x: number) => a + x, 0);      // «pulled += await …» внутри параллельных задач терял слагаемые
        if (!errs.length) {
          const now = new Date().toISOString();
          await s.from("bn_trip_days").upsert(need.slice(i, j + 1).map(d => ({ day: d, synced_at: now })), { onConflict: "day" });
        }
        i = j + 1;
      }
      const { data: rows, error: e1 } = await s.from("bn_trips").select("imei,day,started_at,ended_at,mi,gps,driver_id")
        .gte("day", from).lte("day", to).order("started_at", { ascending: true }).limit(5000);
      if (e1) return jres({ error: e1.message }, 500);
      return jres({ ok: true, from, to, pulled, synced: need, errors: errs,
        trips: (rows ?? []).map((r: any) => ({ imei: r.imei, day: r.day, s: r.started_at, e: r.ended_at, mi: +r.mi || 0, gps: r.gps || "", drv: r.driver_id ?? null })) });
    }

    /* ---- сводка дня по поездкам: ?stats=1&from=ISO&to=ISO ---- */
    if (url.searchParams.get("stats")) {
      if (!canBn) return jres({ error: "NO_ACCESS" }, 403);
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      if (!from || !to) return jres({ error: "BAD_REQUEST" }, 400);
      if (new Date(to).getTime() - new Date(from).getTime() > 8 * 86400_000)
        return jres({ error: "RANGE_TOO_WIDE" }, 400);          // Bouncie: окно не шире недели
      const { data: rows } = await s.from("vehicles")
        .select("imei,driver_id").not("imei", "is", null);
      const drvOf: Record<string, string | null> = {};
      for (const r of rows ?? []) drvOf[String(r.imei || "").trim()] = r.driver_id ?? null;
      const imeis = [...new Set((rows ?? []).map(r => String(r.imei || "").trim()).filter(x => x))];
      const cars: Record<string, unknown> = {};
      const perImei: Record<string, { drv: string | null; trips: { s: string; e: string; a: any; b: any }[] }> = {};
      await Promise.all(imeis.map(async (imei) => {
        try {
          const trips = await bnGet(s, "/trips?gps-format=polyline&imei=" + encodeURIComponent(imei)
            + "&starts-after=" + encodeURIComponent(from) + "&ends-before=" + encodeURIComponent(to));
          const arr = Array.isArray(trips) ? trips : [];
          const seen = new Set<string>();                        // дубли по transactionId (два потока данных)
          let mi = 0, sec = 0, n = 0, lastEnd = null as null | { lat: number; lng: number }, lastAt = "";
          const tlist: { s: string; e: string; a: any; b: any }[] = [];
          for (const tr of arr) {
            const key = tr.transactionId || (tr.startTime + "|" + tr.endTime);
            if (seen.has(key)) continue; seen.add(key);
            tlist.push({ s: tr.startTime, e: tr.endTime, a: polyFirst(tr.gps), b: polyLast(tr.gps) });
            mi += +tr.distance || 0; n++;
            const a = Date.parse(tr.startTime), b = Date.parse(tr.endTime);
            if (b > a) sec += (b - a) / 1000;
            if (!lastAt || tr.endTime > lastAt) {
              lastAt = tr.endTime;
              lastEnd = polyLast(tr.gps) ?? lastEnd;
            }
          }
          cars[imei] = { mi: Math.round(mi * 10) / 10, min: Math.round(sec / 60), n, lastEnd, lastAt };
          perImei[imei] = { drv: drvOf[imei] ?? null, trips: tlist };
          try { await tripsStore(s, imei, arr, drvOf[imei] ?? null, null); } catch (_e) { /* v1.09.10: история не критична для сводки */ }
        } catch (e) {
          cars[imei] = { err: String((e as Error)?.message ?? e).slice(0, 120) };
        }
      }));
      try { await visitsUpsert(s, perImei); } catch (_e) { /* журнал не критичен для ответа */ }
      return jres({ at: new Date().toISOString(), cars });
    }

    return jres({ error: "BAD_REQUEST" }, 400);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const code = /BN_NOT_CONFIGURED|BN_NOT_CONNECTED|KEYS_NOT_SAVED/.test(msg) ? 409 : 500;
    return jres({ error: msg }, code);
  }
});
