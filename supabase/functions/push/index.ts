import { svc, userClient, CORS, jres } from "../_shared/google.ts";
import webpush from "npm:web-push@3.6.7";

/* =====================================================================
   v1.08.33 · PUSH — Web Push уведомления TechLog.
   Ключи VAPID функция создаёт себе сама при первом обращении и хранит
   в app_secrets (vapid_pub / vapid_priv) — ручной настройки нет.

   Кто ставит уведомления в очередь (public.push_queue):
     - триггеры БД: новая задача / передача, новый пикап, апрув и снятие
       апрува (jobs, placements, repairs) — функция push_enqueue уважает
       personal push_prefs и не шлёт автору действия;
     - эта функция: дайджест «просроченные пикапы» (раз в ~6 часов);
     - функция bouncie: Check Engine, низкое топливо, ТО.

   Режимы:
     ?ping=1                    — диагностика;
     ?pub=1                     — публичный VAPID-ключ (вход обязателен);
     POST {op:'sub',  sub, ua}  — сохранить подписку этого устройства;
     POST {op:'unsub', endpoint}— удалить подписку;
     ?send=1                    — разобрать очередь. Авторизация: любой
       вошедший ЛИБО заголовок x-cron-key = app_secrets.push_cron_key
       (для внешнего расписания, если захочется).
   Очередь разгребается, пока хоть кто-то из фирмы онлайн: клиент
   пингует ?send=1 раз в ~2 минуты и сразу после действий-триггеров.
   ===================================================================== */

const PUSH_VER = "1.08.33";
type Sb = ReturnType<typeof svc>;

async function vapid(s: Sb): Promise<{ pub: string; priv: string }> {
  const { data, error } = await s.from("app_secrets").select("key,value")
    .in("key", ["vapid_pub", "vapid_priv"]);
  if (error) throw new Error("SECRETS: " + error.message);
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[r.key] = r.value;
  if (m.vapid_pub && m.vapid_priv) return { pub: m.vapid_pub, priv: m.vapid_priv };
  const k = webpush.generateVAPIDKeys();
  await s.from("app_secrets").upsert([
    { key: "vapid_pub", value: k.publicKey },
    { key: "vapid_priv", value: k.privateKey },
  ], { onConflict: "key" });
  return { pub: k.publicKey, priv: k.privateKey };
}

async function cronKey(s: Sb): Promise<string> {
  const { data } = await s.from("app_secrets").select("value").eq("key", "push_cron_key").maybeSingle();
  if (data?.value) return data.value;
  const v = crypto.randomUUID();
  await s.from("app_secrets").upsert([{ key: "push_cron_key", value: v }], { onConflict: "key" });
  return v;
}

/* сегодняшняя дата фирмы (Атланта) */
function todayNY(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/* дайджест просроченных пикапов — не чаще раза в 6 часов */
async function enqueueOverdue(s: Sb) {
  const { data: org } = await s.from("org_settings")
    .select("id, push_overdue_at").limit(1).maybeSingle();
  if (!org) return;
  const last = org.push_overdue_at ? Date.parse(org.push_overdue_at) : 0;
  if (Date.now() - last < 6 * 3600 * 1000) return;
  await s.from("org_settings").update({ push_overdue_at: new Date().toISOString() }).eq("id", org.id);

  const today = todayNY();
  const { data: pls } = await s.from("placements")
    .select("technician_id, unit_number, due_date, picked_up")
    .eq("picked_up", false).eq("superseded", false)
    .lt("due_date", today).not("technician_id", "is", null);
  if (!pls?.length) return;
  const byTech: Record<string, number> = {};
  for (const p of pls) byTech[p.technician_id] = (byTech[p.technician_id] ?? 0) + 1;
  const ids = Object.keys(byTech);
  const { data: profs } = await s.from("profiles")
    .select("id, blocked, push_prefs").in("id", ids);
  for (const pr of profs ?? []) {
    if (pr.blocked) continue;
    if ((pr.push_prefs?.overdue ?? true) === false) continue;
    await s.from("push_queue").insert({
      user_id: pr.id, kind: "overdue",
      title: "Просроченные пикапы",
      body: byTech[pr.id] + " шт. ждут забора — откройте главный экран",
      url: "./",
    });
  }
}

/* разбор очереди: подписки юзера, группировка пикапов, отправка */
async function deliver(s: Sb): Promise<{ sent: number; dropped: number; closed: number }> {
  const keys = await vapid(s);
  const det = { subject: "mailto:push@techlog.app", publicKey: keys.pub, privateKey: keys.priv };
  const { data: q } = await s.from("push_queue").select("*")
    .is("sent_at", null).lt("tries", 5).order("created_at").limit(200);
  if (!q?.length) return { sent: 0, dropped: 0, closed: 0 };

  const uids = [...new Set(q.map((r) => r.user_id))];
  const { data: subs } = await s.from("push_subs")
    .select("id, user_id, endpoint, p256dh, auth").in("user_id", uids);
  const byUser: Record<string, any[]> = {};
  for (const sub of subs ?? []) (byUser[sub.user_id] = byUser[sub.user_id] ?? []).push(sub);

  /* пикапы одному человеку — одной нотификацией (аренда создаёт по строке на тип) */
  const items: { rows: any[]; title: string; body: string; url: string; user: string }[] = [];
  const grouped: Record<string, any[]> = {};
  for (const r of q) {
    if (r.kind === "pickup") (grouped[r.user_id] = grouped[r.user_id] ?? []).push(r);
    else items.push({ rows: [r], title: r.title, body: r.body, url: r.url, user: r.user_id });
  }
  for (const [user, rows] of Object.entries(grouped)) {
    items.push(rows.length === 1
      ? { rows, title: rows[0].title, body: rows[0].body, url: rows[0].url, user }
      : { rows, title: "Новые пикапы: " + rows.length,
          body: rows.map((r) => r.body).slice(0, 4).join("; ") + (rows.length > 4 ? "…" : ""),
          url: "./", user });
  }

  let sent = 0, dropped = 0, closed = 0;
  const now = new Date().toISOString();
  for (const it of items) {
    const list = byUser[it.user] ?? [];
    if (!list.length) {                       // подписок нет — закрываем, чтобы не копить
      for (const r of it.rows)
        await s.from("push_queue").update({ sent_at: now, last_err: "no_subs" }).eq("id", r.id);
      closed += it.rows.length;
      continue;
    }
    const payload = JSON.stringify({ title: it.title, body: it.body, url: it.url });
    let ok = false, err = "";
    for (const sub of list) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload, { vapidDetails: det, TTL: 3600 });
        ok = true;
      } catch (e: any) {
        const code = e?.statusCode ?? 0;
        err = "HTTP " + code;
        if (code === 404 || code === 410) {   // устройство отписалось — чистим
          await s.from("push_subs").delete().eq("id", sub.id);
          dropped++;
        }
      }
    }
    for (const r of it.rows) {
      if (ok) { await s.from("push_queue").update({ sent_at: now }).eq("id", r.id); sent++; }
      else await s.from("push_queue").update({ tries: (r.tries ?? 0) + 1, last_err: err }).eq("id", r.id);
    }
  }
  return { sent, dropped, closed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const s = svc();
  try {
    if (url.searchParams.get("ping")) return jres({ ok: true, fn: "push", ver: PUSH_VER });

    /* рассылка: вошедший ИЛИ cron-ключ */
    if (url.searchParams.get("send")) {
      let allowed = req.headers.get("x-cron-key") === await cronKey(s);
      if (!allowed) {
        const { data: u } = await userClient(req).auth.getUser();
        allowed = !!u?.user;
      }
      if (!allowed) return jres({ error: "FORBIDDEN" }, 403);
      await enqueueOverdue(s);
      const r = await deliver(s);
      return jres({ ok: true, ...r });
    }

    /* всё остальное — только вошедшим */
    const { data: u, error: ue } = await userClient(req).auth.getUser();
    if (ue || !u?.user) return jres({ error: "AUTH" }, 401);
    const uid = u.user.id;

    if (url.searchParams.get("pub")) {
      const k = await vapid(s);
      return jres({ ok: true, pub: k.pub });
    }

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.op === "sub" && b.sub?.endpoint && b.sub?.keys?.p256dh && b.sub?.keys?.auth) {
        await s.from("push_subs").upsert([{
          user_id: uid, endpoint: b.sub.endpoint,
          p256dh: b.sub.keys.p256dh, auth: b.sub.keys.auth,
          ua: String(b.ua ?? "").slice(0, 200),
        }], { onConflict: "endpoint" });
        return jres({ ok: true });
      }
      if (b.op === "unsub" && b.endpoint) {
        await s.from("push_subs").delete().eq("endpoint", b.endpoint).eq("user_id", uid);
        return jres({ ok: true });
      }
      return jres({ error: "BAD_OP" }, 400);
    }

    return jres({ error: "BAD_REQUEST" }, 400);
  } catch (e: any) {
    return jres({ error: String(e?.message ?? e) }, 500);
  }
});
