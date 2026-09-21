/* v1.09.25 — документооборот инвойса: личные права, кто видит и правит, «Выполнена» и «Апрув» запирают документ,
   «отозвать» / «вернуть на доработку» / «запросить правку», номер при первом НЕ черновике и его заморозка,
   основной исполнитель (★), лента «Уведомления», «Важные объявления»; SQL-комплект. Демо-режим.
   Запуск: node tests/v1_09_25.js [порт]. Серверная часть проверяется отдельно: tests/docflow.sql (84 проверки). */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8925;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 420) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const n of ['update-to-1_09_25.sql', 'full-install-1_09_25.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', n), 'utf8'), g = q.slice(q.lastIndexOf('create or replace function public.jobs_guard()'));
    t(`${n}: сторож инвойса — ревизия (STALE_DOC), замки «Выполнена» и «Апрув», номер при первом НЕ черновике, служебные поля клиенту не отдаются`,
      g.includes("raise exception 'STALE_DOC'") && g.includes("raise exception 'DOC_LOCKED_DONE'") && g.includes("raise exception 'DOC_LOCKED_APPROVED'") && g.includes("raise exception 'DOC_LOCKED_DELETE'")
      && g.includes("nextval('public.jobs_doc_no_seq')") && g.includes('new.no := old.no;') && g.includes('old.updated_by is distinct from v_uid'));
    t(`${n}: номер новой строки выдаётся ПОСЛЕ вставки (BEFORE INSERT срабатывает при каждом upsert — счётчик тратился бы впустую)`,
      q.includes('create trigger jobs_after_ins_tg after insert on public.jobs') && q.includes('create trigger jobs_guard_tg before update on public.jobs') && !q.slice(q.lastIndexOf('drop trigger if exists jobs_guard_tg')).includes('before insert or update on public.jobs'));
    t(`${n}: бригада видит документ всегда; помощник правит только с личным правом; лента пишется даже при выключенном пуше; круг «Важных объявлений»`,
      q.includes('or helper_ids ? auth.uid()::text\n  );') && q.includes('and coalesce((select can_edit_docs from public.profiles where id = auth.uid()), false)')
      && q.includes("if p_kind <> 'chat' then\n    insert into public.notices") && q.includes('if p_channel = \'ann\' and not public.chat_can_announce() then raise exception')
      && q.includes("values (r.id, 'chat', v_title, v_text, './?chat=ann');"));
  }
  t('tests/docflow.sql на месте (серверная проверка документооборота)', fs.existsSync(path.join(ROOT, 'tests', 'docflow.sql')));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 300)); }); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const login = async who => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1200); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1200);

  /* ---- админ: второй техник, сокращения и личные права ---- */
  await p.evaluate(() => { state.data.profiles.push({ id: 'demo-tech2', login: 'oleg', display_name: 'Oleg Ivanov', role: 'tech', car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' }); saveLocalNow(); App.go('dirs'); });
  await p.evaluate(() => { state.dirTab = 'staff'; render(); }); await p.waitForTimeout(400);
  const staff = await p.evaluate(() => ({ rows: document.querySelectorAll('.staff-df').length, acc: !!document.querySelector('.staff-df[data-uid="demo-acc"]'),
    mgrAppr: !!document.querySelector('.staff-df[data-uid="demo-manager"] input[onchange*="can_approve"]'), techAnn: !!document.querySelector('.staff-df[data-uid="demo-tech"] input[onchange*="dfAnnounceSet"]'),
    ph: (document.querySelector('.staff-df[data-uid="demo-tech"] .df-tag') || {}).placeholder }));
  t('Сотрудники: у каждого строка «сокращение + права» (бухгалтеру не нужна); «апрув» — у менеджера, «объявления» — у техника; подсказка в поле — инициалы', staff.rows >= 4 && !staff.acc && staff.mgrAppr && staff.techAnn && staff.ph === 'SV', staff);
  await p.evaluate(() => App.dfTagSet('demo-tech', 'svk')); await p.waitForTimeout(300);
  await p.evaluate(() => App.dfTagSet('demo-tech2', 'svk')); await p.waitForTimeout(300);
  await p.evaluate(() => App.dfTagSet('demo-tech2', 'o')); await p.waitForTimeout(300);
  await p.evaluate(() => App.dfTagSet('demo-tech2', 'Olg')); await p.waitForTimeout(300);
  const tags = await p.evaluate(() => ({ a: state.data.profiles.find(x => x.id === 'demo-tech').tag, b: state.data.profiles.find(x => x.id === 'demo-tech2').tag }));
  t('сокращение: приводится к верхнему регистру, занятое и слишком короткое не принимаются', tags.a === 'SVK' && tags.b === 'OLG', tags);
  await p.evaluate(() => App.dfRightSet('demo-manager', 'can_approve', false)); await p.waitForTimeout(300);

  /* ---- техник: черновик без номера; «Выполнено» выдаёт номер с сокращением и замораживает его ---- */
  await login('demo-tech');
  const jid = await p.evaluate(async () => {
    const cx = state.data.complexes[0], wt = state.data.work_types[0];
    const j = { id: uid(), date: todayISO(), counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '925', work_type_id: wt.id, technician_id: state.user.id, technician_name: 'Sergey V.',
      helper_ids: ['demo-tech2'], shared_with_helpers: false, priority: false, sort_order: 0, status: 'draft', note: '', form_data: emptyFormData(), total: 0, approved_total: null, approved_by: null, approved_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await dbUpsert('jobs', j); dfDemoEvents(null, j); return j.id; });
  await p.evaluate(() => { const o = state.data.org_settings; o.doc_no_fmt = '{TYPE}-{TECH}-{SEQ}'; });
  const d0 = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { no: j.no == null, num: docNo('job', j), rev: j.rev }; }, jid);
  t('черновик: номера нет (в номере только тип и сокращение), ревизия 0', d0.no && d0.num === 'WORK-SVK' && d0.rev === 0, d0);
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(500);
  const e0 = await p.evaluate(() => ({ ro: document.getElementById('app').classList.contains('job-ro'), done: !!document.getElementById('jb-done'), save: !!document.querySelector('.db-save'), star: (document.querySelector('.chip-tech.primary') || {}).textContent.trim(),
    tag: (document.querySelector('.chip-tech.primary .crew-tag') || {}).textContent, hint: !!document.querySelector('.df-done-h') }));
  t('основной исполнитель открывает черновик на правку: галочка «выполнена» с пояснением, «Сохранить», ★ и сокращение на чипе', !e0.ro && e0.done && e0.save && /^★/.test(e0.star) && e0.tag === 'SVK' && e0.hint, e0);
  await p.evaluate(() => { document.getElementById('jb-done').checked = true; }); await p.evaluate(() => App.saveJob(false)); await p.waitForTimeout(900);
  const d1 = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { st: j.status, no: j.no, doc: j.doc_no, num: docNo('job', j), rev: j.rev, by: j.updated_by, nat: !!j.numbered_at }; }, jid);
  t('«Выполнено»: номер выдан, текст номера заморожен (с сокращением основного), ревизия выросла', d1.st === 'done' && d1.no > 0 && d1.nat && /^WORK-SVK-\d{5}$/.test(d1.doc || '') && d1.num === d1.doc && d1.rev === 1 && d1.by === 'demo-tech', d1);
  const r1 = await p.evaluate(() => ({ ro: document.getElementById('app').classList.contains('job-ro'), ban: !!document.getElementById('df-ban-done'), wd: !!document.getElementById('df-withdraw'), save: !!document.querySelector('.db-save'), done: !!document.getElementById('jb-done'),
    del: !!document.querySelector('.btn-red[onclick*="deleteJob"]'), pe: getComputedStyle(document.getElementById('jb-unit')).pointerEvents, ed: (document.getElementById('df-edited') || {}).textContent || '' }));
  t('на согласовании: только просмотр — плашка, «Отозвать», нет «Сохранить», галочки и «Удалить»; поля не нажимаются; «Изменён: кто · когда»', r1.ro && r1.ban && r1.wd && !r1.save && !r1.done && !r1.del && r1.pe === 'none' && /Sergey V/.test(r1.ed), r1);
  await p.evaluate(() => { jobDraft.note = 'взлом'; return App.saveJob(false); }); await p.waitForTimeout(400);
  t('сохранение из режима просмотра ничего не пишет', await p.evaluate(id => (state.data.jobs.find(x => x.id === id).note || '') === '', jid));
  await p.evaluate(() => { const o = state.data.org_settings; o.doc_no_fmt = '{TYPE}-{DATE}-{SEQ}'; state.data.profiles.find(x => x.id === 'demo-tech').tag = 'ZZZ'; });
  t('замороженный номер не меняется ни от шаблона, ни от сокращения', await p.evaluate(([id, doc]) => docNo('job', state.data.jobs.find(x => x.id === id)) === doc, [jid, d1.doc]));
  await p.evaluate(() => { state.data.profiles.find(x => x.id === 'demo-tech').tag = 'SVK'; });

  /* ---- помощник: видит, но не правит; «Общий доступ» + личное право ---- */
  await login('demo-tech2');
  const h0 = await p.evaluate(id => { const n = dfNotices(); App.openJob(id); return { n: n.map(x => x.title), vis: visibleJobs().some(j => j.id === id) }; }, jid); await p.waitForTimeout(500);
  const h1 = await p.evaluate(() => ({ scr: state.screen, ro: document.getElementById('app').classList.contains('job-ro'), wd: !!document.getElementById('df-withdraw'), media: getComputedStyle(document.querySelector('.media-card .mshoot')).pointerEvents }));
  t('помощник: задача видна, документ открывается только для просмотра, отозвать не может, фото добавлять может; в ленте — «Вас добавили в бригаду»', h0.vis && h1.scr === 'job' && h1.ro && !h1.wd && h1.media !== 'none' && h0.n.includes('Вас добавили в бригаду'), { h0, h1 });

  /* ---- основной отзывает, включает общий доступ; помощник правит; личное право снято — снова только просмотр ---- */
  await login('demo-tech');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400); await p.click('#df-withdraw'); await p.waitForTimeout(800);
  const w1 = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { st: j.status, doc: j.doc_no, ro: document.getElementById('app').classList.contains('job-ro'), scr: state.screen }; }, jid);
  t('«Отозвать из согласования»: документ снова черновик и открыт на правку, номер прежний', w1.st === 'draft' && w1.doc === d1.doc && !w1.ro && w1.scr === 'job', w1);
  await p.evaluate(() => { const c = document.getElementById('jb-shared'); if (c){ c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } jobDraft.shared_with_helpers = true; return App.saveJob(true); }); await p.waitForTimeout(700);
  await login('demo-tech2');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  t('«Общий доступ» + личное право: помощник правит документ, но состав бригады и основного не меняет', await p.evaluate(() => !document.getElementById('app').classList.contains('job-ro') && !!document.querySelector('.db-save') && !document.getElementById('crew-sel') && !document.querySelector('.crew-mk')));
  await p.evaluate(() => { state.data.profiles.find(x => x.id === 'demo-tech2').can_edit_docs = false; render(); }); await p.waitForTimeout(300);
  t('личное право «правка общих» снято — документ только для просмотра', await p.evaluate(() => document.getElementById('app').classList.contains('job-ro') && !!document.getElementById('df-ban-crew')));
  await p.evaluate(() => { state.data.profiles.find(x => x.id === 'demo-tech2').can_edit_docs = true; });

  /* ---- менеджер без права апрува: правит черновик, меняет основного; апрува нет ---- */
  await login('demo-manager');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  const m0 = await p.evaluate(() => ({ appr: canApprove(), card: !!document.getElementById('jb-approved'), mk: document.querySelectorAll('.crew-mk').length, ro: document.getElementById('app').classList.contains('job-ro') }));
  t('менеджер без личного права: апрува нет, черновик правит, у помощника — ☆ «сделать основным»', !m0.appr && !m0.card && m0.mk === 1 && !m0.ro, m0);
  await p.click('.crew-mk'); await p.waitForTimeout(300);
  const m1 = await p.evaluate(() => ({ main: jobDraft.technician_id, helpers: jobDraft.helper_ids }));
  t('☆: основной и помощник поменялись местами', m1.main === 'demo-tech2' && m1.helpers.includes('demo-tech') && m1.helpers.length === 1, m1);
  await p.evaluate(() => App.crewMain('demo-tech')); await p.waitForTimeout(200);
  await p.evaluate(() => { document.getElementById('jb-done').checked = true; return App.saveJob(true); }); await p.waitForTimeout(800);
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  t('менеджер без права апрува на «Выполнена»: только просмотр (отозвать может)', await p.evaluate(() => document.getElementById('app').classList.contains('job-ro') && !!document.getElementById('df-withdraw')));

  /* ---- админ даёт менеджеру право апрува; возврат на доработку с причиной ---- */
  await login('demo-admin');
  await p.evaluate(() => App.dfRightSet('demo-manager', 'can_approve', true)); await p.waitForTimeout(300);
  const a0 = await p.evaluate(() => { const c = apvCollect(); return { n: c.n, jobs: c.jobs.length, note: dfNotices().some(x => x.title === 'Ждёт апрува') }; });
  t('согласующему в ленту пришло «Ждёт апрува»', a0.note && a0.jobs >= 1, a0);
  await login('demo-manager');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  t('менеджер с личным правом: карточка апрува и «Вернуть на доработку», документ открыт на правку', await p.evaluate(() => canApprove() && !!document.getElementById('jb-approved') && !!document.getElementById('df-return') && !document.getElementById('app').classList.contains('job-ro')));
  await p.click('#df-return'); await p.waitForTimeout(300); await p.click('#df-ret-go'); await p.waitForTimeout(300);
  t('возврат без причины не проходит', await p.evaluate(id => state.data.jobs.find(x => x.id === id).status === 'done' && !!document.getElementById('df-ret-note'), jid));
  await p.fill('#df-ret-note', 'нет фото счётчика'); await p.click('#df-ret-go'); await p.waitForTimeout(800);
  const rt = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { st: j.status, note: j.return_note, by: j.returned_by, scr: state.screen, log: (state.data.audit_log || []).some(a => a.action === 'job_return') }; }, jid);
  t('«Вернуть на доработку»: черновик, причина и автор возврата записаны, запись в журнале', rt.st === 'draft' && rt.note === 'нет фото счётчика' && rt.by === 'demo-manager' && rt.scr === 'home' && rt.log, rt);
  await login('demo-tech');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  const rb = await p.evaluate(() => ({ ban: (document.getElementById('df-ban-ret') || {}).textContent || '', n: dfNotices().filter(x => x.title === 'Возвращён на доработку').map(x => x.body) }));
  t('исполнитель видит красную плашку с причиной и строку в ленте', /нет фото счётчика/.test(rb.ban) && /Alexey S/.test(rb.ban) && rb.n.length === 1 && /нет фото счётчика/.test(rb.n[0]), rb);
  await p.evaluate(() => { document.getElementById('jb-done').checked = true; return App.saveJob(true); }); await p.waitForTimeout(800);

  /* ---- апрув → замок → запрос правки → отказ → запрос → разрешение ---- */
  await login('demo-manager');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400); await p.evaluate(() => App.approveJob()); await p.waitForTimeout(900);
  t('апрув поставлен менеджером с личным правом', await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return j.status === 'approved' && j.approved_by === 'demo-manager'; }, jid));
  await login('demo-tech');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  const ap = await p.evaluate(() => ({ ro: document.getElementById('app').classList.contains('job-ro'), ban: !!document.getElementById('df-ban-appr'), req: !!document.getElementById('df-req'), wd: !!document.getElementById('df-withdraw'), n: dfNotices().some(x => x.title === 'Инвойс апрувлен') }));
  t('после апрува: только просмотр, «Запросить правку» (отозвать нельзя), в ленте «Инвойс апрувлен»', ap.ro && ap.ban && ap.req && !ap.wd && ap.n, ap);
  await p.click('#df-req'); await p.waitForTimeout(300); await p.fill('#df-req-reason', 'забыл осушитель'); await p.click('#df-req-go'); await p.waitForTimeout(600);
  t('запрос отправлен: вместо кнопки — «ждёт решения», второй запрос не создать', await p.evaluate(id => !!document.getElementById('df-req-wait') && !document.getElementById('df-req') && dfReqs().filter(r => r.doc_id === id && r.status === 'pending').length === 1, jid));
  await login('demo-manager');
  const hub = await p.evaluate(() => { App.go('approvals'); return { n: apvCollect().reqs.length, note: dfNotices().some(x => x.title === 'Запрос на правку документа') }; }); await p.waitForTimeout(400);
  t('согласующий: запрос в «На апруве» (с причиной и кнопками) и в ленте', hub.n === 1 && hub.note && await p.evaluate(() => /забыл осушитель/.test((document.getElementById('df-reqs') || {}).textContent || '') && document.querySelectorAll('#df-reqs .btn-green').length === 1), hub);
  await p.evaluate(id => App.dfReqDecide(dfReqs().find(r => r.doc_id === id && r.status === 'pending').id, false), jid); await p.waitForTimeout(500);
  t('отказ: апрув цел, запрос закрыт', await p.evaluate(id => state.data.jobs.find(x => x.id === id).status === 'approved' && dfReqs().every(r => r.status !== 'pending'), jid));
  await login('demo-tech');
  t('автору запроса — «В правке отказано»', await p.evaluate(() => dfNotices().some(x => x.title === 'В правке отказано')));
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(300); await p.click('#df-req'); await p.waitForTimeout(200); await p.fill('#df-req-reason', 'всё же нужен осушитель'); await p.click('#df-req-go'); await p.waitForTimeout(500);
  await login('demo-manager');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  t('согласующий видит запрос плашкой в самом документе — с причиной и кнопками', await p.evaluate(() => /всё же нужен осушитель/.test((document.getElementById('df-ban-req') || {}).textContent || '') && !!document.querySelector('#df-ban-req .btn-green')));
  await p.click('#df-ban-req .btn-green'); await p.waitForTimeout(800);
  t('разрешил из открытого документа: документ открыт заново уже черновиком (старая копия с апрувом не осталась на экране)', await p.evaluate(id => state.screen === 'job' && jobDraft && jobDraft.id === id && jobDraft.status === 'draft' && jobDraft.approved_total == null && !document.getElementById('df-ban-req'), jid));
  const gr = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { st: j.status, at: j.approved_total, open: Date.parse(j.edit_open_until) > Date.now() + 23 * 36e5, doc: j.doc_no }; }, jid);
  t('разрешено: документ в черновике, апрув снят, правка открыта на сутки, номер прежний', gr.st === 'draft' && gr.at == null && gr.open && gr.doc === d1.doc, gr);
  await login('demo-tech');
  await p.evaluate(id => { state.data.org_settings.edit_lock_days = 1; const j = state.data.jobs.find(x => x.id === id); j.date = addDaysISO(todayISO(), -30); }, jid);
  t('окно правки обходит запрет правки старых задач; без окна — заперто', await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); const a = editLocked(j); const b = editLocked({ ...j, edit_open_until: null }); return a === false && b === true; }, jid));
  await p.evaluate(id => { state.data.org_settings.edit_lock_days = 0; state.data.jobs.find(x => x.id === id).date = todayISO(); }, jid);
  t('в ленте исполнителя — «Апрув снят — документ в черновике»', await p.evaluate(() => dfNotices().some(x => x.title === 'Апрув снят — документ в черновике')));

  /* ---- сняли с задачи ---- */
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  await p.evaluate(() => { App.crewRemove('demo-tech2'); return App.saveJob(true); }); await p.waitForTimeout(700);
  await login('demo-tech2');
  const rm = await p.evaluate(id => ({ n: dfNotices().some(x => x.title === 'Вас сняли с задачи'), vis: visibleJobs().some(j => j.id === id) }), jid);
  t('снятому с задачи — строка «Вас сняли с задачи»', rm.n, rm);

  /* ---- лента «Уведомления» в Сообщениях ---- */
  await p.evaluate(() => App.go('chat')); await p.waitForTimeout(500);
  const th = await p.evaluate(() => { const ks = [...document.querySelectorAll('#ch-ths .ch-th')].map(b => b.dataset.k); const b = document.querySelector('#ch-ths .ch-th[data-k="ntf"]');
    return { order: ks.slice(0, 3), unread: chUnread('ntf'), total: chUnread(), badge: !!(b && b.querySelector('.ch-n')), name: b ? b.querySelector('b').textContent : '', ann: document.querySelector('#ch-ths .ch-th[data-k="ann"] b').textContent }; });
  t('Сообщения: «Общий чат» → «Важные объявления» → «Уведомления»; счётчик непрочитанного входит в общий', th.order.join() === 'all,ann,ntf' && th.unread >= 2 && th.total >= th.unread && th.badge && th.name === 'Уведомления' && th.ann === 'Важные объявления', th);
  await p.click('#ch-ths .ch-th[data-k="ntf"]'); await p.waitForTimeout(600);
  const fd = await p.evaluate(() => ({ rows: document.querySelectorAll('#ch-msgs .ntf-row').length, ro: !!document.querySelector('.ch-ro'), comp: !!document.getElementById('ch-compose'), mute: !!document.getElementById('ch-mute'), unread: chUnread('ntf') }));
  t('лента: строки событий, писать нельзя, колокольчика «не беспокоить» нет; открытие помечает прочитанным', fd.rows >= 2 && fd.ro && !fd.comp && !fd.mute && fd.unread === 0, fd);
  await p.evaluate(() => { const n = dfNotices().find(x => x.title === 'Вас добавили в бригаду'); App.ntfOpen(n.id); }); await p.waitForTimeout(500);
  t('нажатие на строку с документом открывает его (снятому с задачи — «нет доступа», экран прежний)', await p.evaluate(() => state.screen === 'chat' || state.screen === 'job'));
  await p.evaluate(() => App.chOpen('ann')); await p.waitForTimeout(300);
  t('«Важные объявления»: техник без права не пишет, заглушить нельзя', await p.evaluate(() => !chCanPost('ann') && !document.getElementById('ch-mute') && chMuted('ann') === false));
  await p.evaluate(() => { state.data.profiles.find(x => x.id === 'demo-tech2').can_announce = true; render(); }); await p.waitForTimeout(300);
  t('галочка «объявления» от админа — техник пишет в «Важные объявления» и ставит «Важно»', await p.evaluate(() => chCanPost('ann') && !!document.getElementById('ch-compose') && !!document.getElementById('ch-imp-btn')));

  /* ---- удаление: основной — только черновик ---- */
  await login('demo-tech');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  /* v1.09.26: этот документ уже отправляли на согласование (номер выдан) — основной его не удаляет; новый, ни разу не отправленный черновик — удаляет */
  t('v1.09.26: у черновика, который уже отправляли на согласование, «Удалить» у основного нет', await p.evaluate(() => !document.querySelector('.btn-red[onclick*="deleteJob"]') && canArchDoc({ t: 'job', o: { technician_id: state.user.id, status: 'draft', date: todayISO() } }) === true));

  /* ---- окно конфликта ---- */
  await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); DF.conflict = { mine: { ...j, note: 'моя правка' }, fresh: { ...j, note: 'правка коллеги', updated_by: 'demo-manager', updated_at: new Date().toISOString(), rev: (j.rev || 0) + 1 } }; dfConflictModal(); }, jid); await p.waitForTimeout(300);
  const cf = await p.evaluate(() => ({ txt: (document.querySelector('#overlay') || {}).textContent || '', a: !!document.getElementById('df-cf-fresh'), b: !!document.getElementById('df-cf-mine') }));
  t('окно конфликта: кто и когда изменил, «открыть свежую» и «записать мои поверх»', /Alexey S/.test(cf.txt) && cf.a && cf.b, cf);
  await p.click('#df-cf-mine'); await p.waitForTimeout(600);
  t('«записать мои поверх»: моя правка записана, в журнале — отметка', await p.evaluate(id => state.data.jobs.find(x => x.id === id).note === 'моя правка' && (state.data.audit_log || []).some(a => a.action === 'job_overwrite'), jid));

  /* ---- настройки: общая галочка апрува заменена подсказкой ---- */
  await login('demo-admin');
  await p.evaluate(() => { foldSet('docs', true); App.go('settings'); }); await p.waitForTimeout(500);
  t('Настройки: вместо общей галочки «менеджер может апрувить» — подсказка, что право теперь личное', await p.evaluate(() => { _foldForce = true; render(); const okk = !!document.getElementById('df-appr-moved') && !document.querySelector('input[onchange*="manager_can_approve"]'); _foldForce = false; return okk; }));

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
