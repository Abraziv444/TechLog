/* =====================================================================
   TechLog · Edge Function dft — ТЕСТ ДОКУМЕНТООБОРОТА (v1.09.27; 1.09.28: + job_adopt; 1.09.30: + ремонт, приём пропозала и ремонта)
   ---------------------------------------------------------------------
   Встроенный тест полного цикла идёт под настоящим пользователем. Шаги «другой стороны» — назначить задачу работнику,
   апрувить, вернуть на доработку, решить запрос правки, создать пропозал, убрать тестовые документы — выполняет эта
   функция от имени администратора или менеджера. Она НЕ нужна для работы приложения: её можно не деплоить или
   удалить — приложение работает как раньше, просто тест «другой стороны» будет недоступен.

   Почему это не дыра:
   · работает только пока админ включил режим (org_settings.dft_on, срок dft_until) — иначе DFT_OFF;
   · трогает ТОЛЬКО документы с пометкой is_test. Пометку ставит только база внутри dft_exec; клиент её не ставит и
     не меняет. Настоящий инвойс через функцию не создать, не поправить и не апрувить (DFT_NOT_TEST_DOC);
   · чужой прогон недоступен (DFT_NOT_YOUR_RUN), кроме администратора;
   · всё делает SQL-функция dft_exec (доступна только service_role): она подменяет личность исполнителя, поэтому
     сторожа и правила срабатывают так же, как для настоящего админа или менеджера; набор операций и функций — закрытый;
   · каждый запуск теста пишется в журнал событий (dft_run). Результаты тестов в базе НЕ хранятся.

   POST { action: "status" | "begin" | "exec" | "cleanup", ... }
     status  → { on, until, by, actors, mine, all }
     begin   { run }                                  → запись в журнал событий
     exec    { as, tech?, op, args }                  → { ok, data | error, actor, ms }   (HTTP 200 и при отказе базы: отказ — это ответ)
     cleanup { run?, all? }                           → { ok, deleted, files, trashed }   (работает и при выключенном режиме; файлы — в корзину Диска)
     pushes  { run }                                  → { ok, rows }                       (очередь пушей по тестовым документам прогона)
   as: "self" | "admin" | "manager" | "manager_appr" | "tech" (+ tech: uuid работника)
   ===================================================================== */
import { svc, userClient, driveToken, CORS, jres } from "../_shared/google.ts";

const DFT_VER = "1.09.33";
const OPS = new Set(["job_create", "job_adopt", "job_update", "job_get", "pl_upsert", "ext_req_create", "prop_create", "prop_adopt", "rep_create", "rep_adopt", "rep_update", "rep_get", "rpc"]);   // job_adopt (v1.09.28): документ, созданный кнопкой приложения, становится тестовым

type Prof = { id: string; role: string; display_name: string; blocked: boolean; can_approve?: boolean };

/* кого функция может «сыграть». Настоящих прав никому не выдаёт: только действует от их имени над тестовыми документами */
async function actors(s: any, org: any, meId: string) {
  const { data } = await s.from("profiles").select("id,role,display_name,blocked,can_approve").eq("blocked", false);
  const list = (data ?? []) as Prof[];
  const admins = list.filter((p) => p.role === "admin");
  const admin = admins.find((p) => p.id === org?.dft_by) ?? admins[0] ?? null;      // первым — тот, кто включил режим
  const mgrs = list.filter((p) => p.role === "manager");
  return {
    admin,
    manager: mgrs.find((p) => !p.can_approve) ?? null,            // менеджер БЕЗ права апрува
    manager_appr: mgrs.find((p) => !!p.can_approve) ?? null,      // менеджер С правом апрува
    techs: list.filter((p) => p.role === "tech" && p.id !== meId),
  };
}
const pub = (p: Prof | null) => (p ? { id: p.id, name: p.display_name, role: p.role } : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (new URL(req.url).searchParams.get("ping"))
    return new Response(JSON.stringify({ fn: "dft", ver: DFT_VER }), { headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const sb = userClient(req);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jres({ error: "UNAUTHORIZED" }, 401);
    const s = svc();
    const { data: me } = await s.from("profiles").select("id,role,display_name,blocked").eq("id", user.id).maybeSingle();
    if (!me || (me as Prof).blocked) return jres({ error: "FORBIDDEN" }, 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const { data: org } = await s.from("org_settings").select("dft_on,dft_until,dft_by").eq("id", "org").maybeSingle();
    const on = !!org?.dft_on && (!org?.dft_until || Date.parse(org.dft_until) > Date.now());

    if (action === "cleanup") {                                   // остатки убираются всегда — и при выключенном режиме
      /* v1.09.31: у тестовых документов теперь есть настоящие файлы на Google Диске (фото, видео, PDF) — сначала они уходят
         в корзину Диска (30 дней), строки media и миниатюры удаляются, и только потом удаляются сами документы */
      let files = 0, trashed = 0;
      try {
        let jq = s.from("jobs").select("id").eq("is_test", true);
        if (!(body?.all === true && (me as Prof).role === "admin")) jq = jq.eq("test_owner", user.id);
        const run = String(body?.run ?? "").slice(0, 60); if (run) jq = jq.eq("test_run", run);
        const ids = ((await jq).data ?? []).map((j: any) => j.id);
        if (ids.length) {
          const { data: rows } = await s.from("media").select("id,drive_file_id,thumb_path").in("job_id", ids);
          if (rows?.length) {
            files = rows.length;
            const t = await driveToken().catch(() => "");
            for (const m of rows) {
              if (!m.drive_file_id || !t) continue;
              const d = await fetch(`https://www.googleapis.com/drive/v3/files/${m.drive_file_id}`, { method: "PATCH",
                headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
              if (d.ok || d.status === 404) trashed++;
            }
            const thumbs = rows.map((m: any) => m.thumb_path).filter(Boolean) as string[];
            if (thumbs.length) await s.storage.from("media-thumbs").remove(thumbs);
            await s.from("media").delete().in("job_id", ids);
          }
        }
      } catch (_e) { /* файлы — не повод оставить тестовые документы в базе */ }
      const { data, error } = await s.rpc("dft_exec", { p_caller: user.id, p_actor: user.id, p_op: "cleanup",
        p_args: { run: String(body?.run ?? "").slice(0, 60), all: body?.all === true } });
      return jres({ ok: !error, deleted: data?.deleted ?? 0, files, trashed, error: error ? { message: error.message, code: error.code } : null });
    }

    const a = await actors(s, org, user.id);
    if (action === "status") {
      const mine = await s.from("jobs").select("id", { count: "exact", head: true }).eq("is_test", true).eq("test_owner", user.id);
      const all = (me as Prof).role === "admin" ? await s.from("jobs").select("id", { count: "exact", head: true }).eq("is_test", true) : null;
      return jres({ ok: true, ver: DFT_VER, on, until: org?.dft_until ?? null,
        actors: { admin: pub(a.admin), manager: pub(a.manager), manager_appr: pub(a.manager_appr), techs: a.techs.map(pub) },
        mine: mine.count ?? 0, all: all ? (all.count ?? 0) : null });
    }

    if (!on) return jres({ ok: false, error: { message: "DFT_OFF" } });     // 200: для теста это ответ, а не сбой связи

    if (action === "pushes") {                                    // v1.09.31: что ушло в очередь пушей за прогон — для отчёта теста
      const { data, error } = await s.rpc("dft_pushes", { p_caller: user.id, p_run: String(body?.run ?? "").slice(0, 60) });
      return jres({ ok: !error, rows: data ?? [], error: error ? { message: error.message } : null });
    }

    if (action === "begin") {
      await s.from("audit_log").insert({ actor: user.id, actor_name: (me as Prof).display_name ?? "", action: "dft_run", entity: "org", entity_id: "org",
        details: { run: String(body?.run ?? "").slice(0, 60), role: (me as Prof).role } });
      return jres({ ok: true });
    }

    if (action !== "exec") return jres({ error: "BAD_ACTION" }, 400);
    const op = String(body?.op ?? "");
    if (!OPS.has(op)) return jres({ ok: false, error: { message: "DFT_BAD_OP" } });
    const as = String(body?.as ?? "self");
    let actor: Prof | null = null;
    if (as === "self") actor = me as Prof;
    else if (as === "admin") actor = a.admin;
    else if (as === "manager") actor = a.manager;
    else if (as === "manager_appr") actor = a.manager_appr;
    else if (as === "tech") actor = a.techs.find((p) => p.id === String(body?.tech ?? "")) ?? null;
    if (!actor) return jres({ ok: false, error: { message: "DFT_NO_ACTOR", details: "нет подходящего сотрудника для роли «" + as + "»" } });

    const t0 = Date.now();
    const { data, error } = await s.rpc("dft_exec", { p_caller: user.id, p_actor: actor.id, p_op: op, p_args: body?.args ?? {} });
    return jres({ ok: !error, data: error ? null : (data?.data ?? null),
      error: error ? { message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null } : null,
      actor: pub(actor), ms: Date.now() - t0 });
  } catch (e) {
    return jres({ ok: false, error: { message: "DFT_CRASH", details: String((e as Error)?.message ?? e) } }, 500);
  }
});
