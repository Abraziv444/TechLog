/* v1.09.27–28 — встроенный «Тест документооборота». С 1.09.28 всё, что роли доступно, тест делает КНОПКАМИ приложения;
   служебно — только шаги других ролей, приём документа в тест и «запросы в обход интерфейса».
   Сам сценарий прогоняется в демо-режиме за все три роли (админ, менеджер, работник),
   плюс режим тестирования: включает только админ, на срок; предупреждение админу при каждом входе; карточка теста скрыта у остальных,
   пока режим выключен; тестовые документы удаляются; отчёт содержит шаги и запросы с ответами. В демо сервера нет — его правила
   повторяет приложение (dftDemoExec); серверная сторона проверяется tests/dft.sql (34) и tests/dft-fn.js (15).
   Запуск: node tests/v1_09_27.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8927;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const n of ['update-to-1_09_27.sql', 'full-install-1_09_27.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', n), 'utf8');
    t(`${n}: dft_exec только для service_role, пометку «тестовый» клиент не ставит, режим — на срок, тестовые документы вне нумерации, склада и пушей`,
      q.includes('revoke all on function public.dft_exec(uuid, uuid, text, jsonb) from public, anon, authenticated;') && q.includes('grant execute on function public.dft_exec(uuid, uuid, text, jsonb) to service_role;')
      && q.includes('new.is_test := old.is_test; new.test_owner := old.test_owner;') && q.includes("raise exception 'DFT_NOT_TEST_DOC'") && q.includes('greatest(1, least(72, coalesce(p_hours, 4)))')
      && q.includes("90000000 + nextval('public.jobs_test_no_seq')") && q.includes('if new.is_test then return new; end if;') && q.includes("if p_user::text = v_owner then"));
  }
  const fnSrc = fs.readFileSync(path.join(ROOT, 'supabase/functions/dft/index.ts'), 'utf8');
  t('Edge Function dft: закрытый список операций, режим проверяется, отказ базы — это ответ; копия для Dashboard совпадает', fnSrc.includes('const OPS = new Set(["job_create", "job_adopt", "job_update", "job_get", "pl_upsert", "prop_create", "prop_adopt", "rep_create", "rep_adopt", "rep_update", "rep_get", "rpc"]);') && fnSrc.includes('if (action === "pushes")') && fnSrc.includes('body: JSON.stringify({ trashed: true })')
    && fnSrc.includes('if (!on) return jres({ ok: false, error: { message: "DFT_OFF" } });') && fs.readFileSync(path.join(ROOT, 'supabase/functions-dashboard/dft/index.ts'), 'utf8') === fnSrc.replace('"../_shared/google.ts"', '"./google.ts"'));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });   /* v1.09.31: съёмка способом 1 — с поддельной камерой браузера */
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block', permissions: ['camera', 'microphone'] }); const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 300)); }); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const login = async who => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1000); };
  const openCard = async () => { await p.evaluate(() => { foldSet('dgs', true); foldSet('dft', true); _foldForce = true; App.go('settings'); }); await p.waitForTimeout(500); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-tech'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1000);
  await p.evaluate(() => { const ps = state.data.profiles; ps.push({ id: 'demo-tech2', login: 'oleg', display_name: 'Oleg Ivanov', role: 'tech', car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' },
    { id: 'demo-appr', login: 'maria', display_name: 'Maria Approver', role: 'manager', can_approve: true, car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' }); ps.find(x => x.id === 'demo-manager').can_approve = false; saveLocalNow(); });

  /* ---- режим выключен: у работника карточки нет, запуск невозможен, включить он не может ---- */
  await openCard();
  const off = await p.evaluate(async () => { const card = !!document.getElementById('dft-card'); await App.dftSetMode(true, 4); return { card, on: dftOn() }; });
  t('режим выключен: работник карточку теста не видит и включить режим не может', off.card === false && off.on === false, off);

  /* ---- админ включает на срок; предупреждение при входе ---- */
  await login('demo-admin'); await openCard();
  const c0 = await p.evaluate(() => ({ card: !!document.getElementById('dft-card'), mode: (document.getElementById('dft-mode') || {}).textContent || '', run: !!document.getElementById('dft-run'), hours: !!document.getElementById('dft-hours') }));
  t('админ видит карточку всегда: режим выключен, кнопки запуска нет, есть выбор срока', c0.card && /выключен/i.test(c0.mode) && !c0.run && c0.hours, c0);
  await p.evaluate(() => App.dftSetMode(true, 4)); await p.waitForTimeout(500);
  const c1 = await p.evaluate(() => { const o = state.data.org_settings; return { on: dftOn(), h: Math.round((Date.parse(o.dft_until) - Date.now()) / 36e5), by: o.dft_by, log: (state.data.audit_log || []).some(a => a.action === 'dft_on'), run: !!document.getElementById('dft-run'), red: !!document.querySelector('#dft-mode.b-red') }; });
  t('включил на 4 часа: срок записан, кто включил — записано, запись в журнале событий, красная плашка и кнопка запуска', c1.on && c1.h === 4 && c1.by === 'demo-admin' && c1.log && c1.run && c1.red, c1);
  await login('demo-admin'); await p.waitForTimeout(1800);
  const warn = await p.evaluate(() => ({ txt: (document.getElementById('dft-warn') || {}).textContent || '', off: !!document.getElementById('dft-warn-off') }));
  t('админ при входе видит предупреждение: режим включён, до какого времени, кнопка «Выключить сейчас»', /потенциальная дыра/.test(warn.txt) && /Ivan P/.test(warn.txt) && warn.off, warn);
  await p.evaluate(() => App.closeModal());

  /* ---- прогон сценария за три роли ---- */
  const runAs = async (who, worker) => {
    await login(who); await p.waitForTimeout(who === 'demo-admin' ? 1800 : 200); await p.evaluate(() => { try{ App.closeModal(); }catch(e){} }); await openCard();
    await p.evaluate(w => { DFT.worker = w || ''; DFT.stepMode = false; trApi = async ru => 'EN: ' + String(ru).length; }, worker);   /* сеть в тесте закрыта — переводчик подменён; кнопка «Сформировать переводы» нажимается настоящая */
    const before = await p.evaluate(() => ({ jobs: state.data.jobs.length, pl: state.data.placements.length, pr: state.data.proposals.length }));
    await p.evaluate(() => { App.dftRun(); });
    await p.waitForFunction(() => !DFT.running && !!document.getElementById('dft-sum'), null, { timeout: 120000 });
    const res = await p.evaluate(() => { const c = tlogGet(), txt = tlogText(c); return { ok: c.ok, total: c.total, steps: c.steps.map(s => ({ n: s.name, ok: s.ok, x: s.extra })), txt,
      left: state.data.jobs.filter(j => j.is_test).length + state.data.placements.filter(x => x.is_test).length + state.data.proposals.filter(x => x.is_test).length,
      jobs: state.data.jobs.length, pl: state.data.placements.length, pr: state.data.proposals.length, scr: state.screen, sum: document.getElementById('dft-sum').textContent,
      btns: document.querySelectorAll('#dft-bar .btn').length, notices: dfNotices().filter(n => /DFTEST|doc=job/.test(n.body + n.url)).length }; });
    res.before = before; return res;
  };
  const check = (label, r, minSteps, mustRun) => {
    const failed = r.steps.filter(s => s.ok === false), skipped = r.steps.filter(s => s.ok === null);
    t(`${label}: сценарий прошёл без провалов (${r.ok} / ${r.total}, пропущено ${skipped.length})`, failed.length === 0 && r.ok === r.total && r.total >= minSteps, { failed: failed.slice(0, 4), sum: r.sum });
    t(`${label}: обязательные для роли шаги выполнены, а не пропущены`, mustRun.every(k => r.steps.some(s => s.n.includes(k) && s.ok === true)), mustRun.filter(k => !r.steps.some(s => s.n.includes(k) && s.ok === true)));
    t(`${label}: после теста ничего тестового не осталось, рабочие данные те же, экран прежний`, r.left === 0 && r.jobs === r.before.jobs && r.pl === r.before.pl && r.pr === r.before.pr && r.scr === 'settings', { left: r.left, jobs: [r.before.jobs, r.jobs], pl: [r.before.pl, r.pl] });
    t(`${label}: отчёт — группы шагов, «запрос ⇒ / ответ ⇐», итог; в окне — кнопки копировать / скачать`, /=== A · /.test(r.txt) && /=== I · /.test(r.txt) && (r.txt.match(/⇒ /g) || []).length > 40 && (r.txt.match(/⇐ /g) || []).length > 40 && /ИТОГ: ✓/.test(r.txt) && r.btns >= 3, { btns: r.btns });
  };
  const rt = await runAs('demo-tech', 'demo-tech2');
  check('работник', rt, 60, ['кнопками заполняет ВСЮ форму', 'сам создаёт задачу кнопкой', 'принят в тест', 'в ленту пришло «Новая задача»', 'в ленту пришло «В правке отказано»', 'Менеджер меняет технику', 'апрувит СОБСТВЕННЫЙ инвойс', 'Продление аренды', 'со старой ревизией', 'Заметка пикапа', '«Забрал»', 'удаляет документ, который ни разу не отправляли']);
  t('работник: свои негативные шаги проверены ИНТЕРФЕЙСОМ (окно «Нужен перевод», пустая причина не принята), а запросы в обход интерфейса получили отказы сервера',
    rt.steps.some(s => s.ok === true && /Нужен перевод/.test(s.x)) && rt.steps.some(s => s.ok === true && /причину/i.test(s.x))
    && ['DOC_LOCKED_DONE', 'DOC_LOCKED_APPROVED', 'DOC_LOCKED_DELETE', 'FORBIDDEN_FIELD', 'ALREADY_PENDING'].every(c => rt.steps.some(s => s.ok === true && s.x === '→ ' + c)), rt.steps.filter(s => /^→/.test(s.x)).map(s => s.x).join(' '));
  t('работник: всё доступное сделано КНОПКАМИ — в отчёте сотни нажатий и ввода, служебных вызовов для своей роли нет (кроме приёма документа в тест)',
    (rt.txt.match(/☛ /g) || []).length > 100 && (rt.txt.match(/⌨ /g) || []).length >= 15 && (rt.txt.match(/⇒ W \(/g) || []).length <= 20,   /* от своего имени служебно идут только «запросы в обход интерфейса» */
    { clicks: (rt.txt.match(/☛ /g) || []).length, typed: (rt.txt.match(/⌨ /g) || []).length, raw: (rt.txt.match(/⇒ W \(/g) || []).length });
  t('работник: новые сценарии 1.09.29 выполнены — кнопка перевода, разделы «Документооборота», «Записать заново», заявка на продление, частичное продление, помощник забирает, PDF DRAFT, лента «Задача удалена»',
    ['на согласовании, номер выдан', 'Ждут апрува', 'Возвращены на доработку', 'В правке отказано»', 'В правке после апрува', 'Записать заново', 'Заявка на продление сверх лимита', 'Продление аренды', 'забирает часть техники', 'PDF черновика', 'Задача удалена']
      .filter(k => !rt.steps.some(s => s.n.includes(k) && s.ok === true)).length === 0 && rt.steps.some(s => /Сформировать переводы/.test(s.x)) && rt.steps.some(s => /Частично|1 \+ 1/.test(s.x)),
    rt.steps.filter(s => s.ok !== true).map(s => s.n + ' :: ' + s.x).slice(0, 6));
  t('отчёт 1.09.29: шапка со средой и настройками, снимок документа после шага (∑), подсказки (💬), окна (▣), вопросы (?), итог по ленте и журналу событий',
    /Среда: app /.test(rt.txt) && /Настройки: self_approve=/.test(rt.txt) && (rt.txt.match(/∑ J: /g) || []).length > 40 && /💬 /.test(rt.txt) && /▣ /.test(rt.txt) && / \? /.test(rt.txt) && /В ленту за прогон пришло: \d+/.test(rt.txt) && /Записей журнала событий с пометкой test: \d+/.test(rt.txt));
  t('работник (1.09.30): ремонт создан кнопками и прошёл ОБОИХ согласующих (менеджер апрувит, админ отклоняет и апрувит), второй круг согласования от имени другого согласующего, лента «перенесена» и «передана вам», штамп APPROVED',
    ['создаёт ремонт из задачи', 'отправляет ремонт на апрув', 'МЕНЕДЖЕР с правом апрува апрувит ремонт', 'АДМИН отклоняет ремонт', 'АДМИН апрувит', 'Ремонт апрувлен', 'второй согласующий возвращает', 'второй согласующий апрувит', 'второй согласующий отказывает', 'второй согласующий разрешает', 'Задача перенесена', 'Задача передана вам', 'штампом APPROVED']
      .filter(k => !rt.steps.some(s => s.n.includes(k) && s.ok === true)).length === 0, rt.steps.filter(s => s.ok !== true).map(s => s.n + ' :: ' + s.x).slice(0, 8));
  t('работник (1.09.30): ремонт — свои запреты проверены и интерфейсом, и запросом в обход', rt.steps.some(s => s.n.includes('Работник апрувит ремонт') && s.ok === true && s.x === '→ FORBIDDEN_APPROVE') && rt.steps.some(s => s.n.includes('Менеджер без права апрува апрувит ремонт') && s.x === '→ FORBIDDEN_APPROVE'));
  t('работник (1.09.31): фото и видео сняты способом 1 без участия человека и встали в очередь; цикл пропозала — «Нужен пропозал», отвязка и привязка, работник видит, но не привязывает',
    ['Фото способом 1', 'Видео способом 1', 'отмечает «Нужен пропозал»', 'отвязывает пропозал и привязывает снова', 'видит привязанный пропозал'].filter(k => !rt.steps.some(s => s.n.includes(k) && s.ok === true)).length === 0
    && rt.steps.some(s => s.n.includes('отправлены на Google Диск') && s.ok === null) && /☛ кадр 1/.test(rt.txt) && /☛ запись ролика/.test(rt.txt),
    rt.steps.filter(s => /способом 1|пропозал|Диск/i.test(s.n)).map(s => s.n.slice(0, 40) + ' :: ' + s.ok + ' ' + s.x).slice(0, 10));
  t('после теста в очереди фото и видео ничего не осталось', await p.evaluate(() => mediaQ.filter(x => /DFTEST/.test(JSON.stringify(x.meta || {})) || !state.data.jobs.some(j => j.id === x.job_id)).length === 0));
  const rm = await runAs('demo-manager', 'demo-tech');
  t('менеджер: у работника «через функцию» номер приложением не заморожен — проверен и отказ BAD_NUMBER_TEXT (у работника-ведущего этот шаг пропускается: номер морозит само приложение)',
    rm.steps.some(x => x.ok === true && x.x === '→ BAD_NUMBER_TEXT') && rt.steps.some(x => x.ok === null && /заморожен приложением/.test(x.x)));
  t('все коды отказа сервера встретились хотя бы в одном из трёх прогонов', (() => { const all = [rt, rm].flatMap(r => r.steps).filter(s => s.ok === true).map(s => s.x);
    return ['TRANSLATION_REQUIRED', 'DOC_LOCKED_DONE', 'DOC_LOCKED_APPROVED', 'DOC_LOCKED_DELETE', 'FORBIDDEN_EQUIPMENT', 'FORBIDDEN_CREW', 'FORBIDDEN_FIELD', 'FORBIDDEN_APPROVE', 'RLS_DENIED', 'SELF_APPROVE_OFF', 'REASON_REQUIRED', 'ALREADY_PENDING', 'ALREADY_DECIDED', 'STALE_DOC', 'LINK_LOCKED', 'BAD_NUMBER_TEXT'].filter(c => !all.includes('→ ' + c)); })().length === 0);
  check('менеджер', rm, 55, ['Создаю задачу кнопкой', 'Назначаю исполнителя', 'Менеджер меняет технику', 'Менеджер правит остальное', 'Менеджер без права апрува апрувит', 'Менеджер привязывает пропозал', 'добавляет помощника', 'переназначает основного']);
  const rp = await runAs('demo-appr', 'demo-tech');
  t('менеджер без права «создавать пропозалы»: кнопки «Новый пропозал» нет — проверено интерфейсом', rm.steps.some(s => s.n.includes('Создаю пропозал кнопками') && s.ok === true && /не разрешено/.test(s.x)));
  check('менеджер с правом апрува', rp, 55, ['возвращает на доработку', 'апрувит с другой суммой', 'вопрос про сумму апрува', 'Согласующему в ленту пришло «Ждёт апрува»', 'Согласующему в ленту пришло «Запрос на правку', 'апрувит СОБСТВЕННЫЙ инвойс', 'отказывает с ответом']);
  const ra = await runAs('demo-admin', 'demo-tech');
  check('админ', ra, 55, ['Создаю задачу кнопкой', 'Назначаю исполнителя', 'Админ апрувит', 'Админ отказывает', 'Админ удаляет', 'Админ привязывает пропозал', 'возвращает на доработку', 'апрувит свой инвойс» — второе положение', 'к запертому инвойсу» — второе положение', 'снимает помощнику «правка общих»',
    'Запрет правки по давности включён', 'правит документ старше срока', 'внутри суточного окна', 'возвращён в прежнее положение', 'Создаю пропозал кнопками', '«Вернуть из архива» и «Удалить навсегда»', 'пикапы в архиве с пояснением', 'МЕНЕДЖЕР с правом апрува апрувит ремонт', 'АДМИН отклоняет ремонт']);

  /* ---- тест можно остановить; остатки убираются кнопкой ---- */
  await p.evaluate(() => { DFT.stepMode = true; App.dftRun(); }); await p.waitForFunction(() => !!DFT.next, null, { timeout: 20000 });
  t('«Пошагово»: тест ждёт кнопку «Дальше»', await p.evaluate(() => DFT.running && !document.getElementById('dft-next').disabled));
  await p.evaluate(() => App.dftNext()); await p.waitForFunction(() => !!DFT.next, null, { timeout: 20000 });
  await p.evaluate(() => App.dftStop()); await p.waitForFunction(() => !DFT.running, null, { timeout: 60000 });
  t('«Остановить»: тест прерван, уборка всё равно прошла — тестовых документов нет', await p.evaluate(() => state.data.jobs.filter(j => j.is_test).length === 0 && /остановлен/.test(tlogText(tlogGet()))));
  await p.evaluate(() => { DFT.stepMode = false; App.closeModal(); state.data.jobs.push({ id: 'left-1', is_test: true, test_owner: state.user.id, test_run: 'old', status: 'draft', date: todayISO(), form_data: {}, helper_ids: [] }); DFT.statusAt = 0; });
  await openCard(); await p.waitForTimeout(700);
  t('остатки сорвавшегося теста: кнопка «Убрать остатки тестов»', await p.evaluate(() => !!document.getElementById('dft-clean')));
  await p.evaluate(() => App.dftCleanup(true)); await p.waitForTimeout(600);
  t('…убирает их', await p.evaluate(() => !state.data.jobs.some(j => j.is_test)));

  /* ---- пропозал клиенту не отправляется: статус «Отправлен» выключен, включает админ ---- */
  await p.evaluate(() => { try{ App.closeModal(); }catch(e){} const pn = document.getElementById('dft-panel'); if (pn) pn.remove(); App.go('proposals'); App.openProposal(); }); await p.waitForTimeout(500);
  const ps0 = await p.evaluate(() => { const has = !!document.querySelector('[data-pst="sent"]'); document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); App.setPropStatus('sent');
    return { has, st: propDraft.status, toast: (document.querySelector('#toasts .toast') || {}).textContent || '', chips: [...document.querySelectorAll('[data-pst]')].map(b => b.dataset.pst).join() }; });
  t('по умолчанию статуса «Отправлен» у пропозала нет: кнопки нет, перевод в него отклоняется с пояснением', !ps0.has && ps0.st === 'draft' && /не отправляется/.test(ps0.toast) && ps0.chips === 'draft,approved,declined', ps0);
  await p.evaluate(() => { state.data.org_settings.prop_send_on = true; render(); }); await p.waitForTimeout(300);
  t('админ включил настройку — кнопка «Отправлен» вернулась', await p.evaluate(() => { const r = !!document.querySelector('[data-pst="sent"]'); state.data.org_settings.prop_send_on = false; propDraft = null; App.go('settings'); return r; }));
  await p.evaluate(() => { foldSet('prop', true); _foldForce = true; App.go('settings'); }); await p.waitForTimeout(400);
  t('в настройках админа — галочка «Статус „Отправлен“ у пропозала», по умолчанию снята', await p.evaluate(() => { const b = document.querySelector('#opt-prop-send input'); _foldForce = false; return !!b && b.checked === false; }));

  /* ---- выключение ---- */
  await p.evaluate(() => App.dftSetMode(false)); await p.waitForTimeout(400);
  t('админ выключил: режим снят, запись в журнале событий', await p.evaluate(() => !dftOn() && state.data.org_settings.dft_until == null && (state.data.audit_log || []).some(a => a.action === 'dft_off')));
  await login('demo-tech'); await openCard();
  t('у работника карточка снова скрыта; запуск теста невозможен', await p.evaluate(async () => { const c = !document.getElementById('dft-card'); await App.dftRun(); return c && !DFT.running; }));

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
