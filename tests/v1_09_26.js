/* v1.09.26 — документооборот, исправления по разбору: перевод обязателен при отправке на согласование (окно «Нужен перевод»),
   своя заметка пикапа, пикап в архив вместо удаления, менеджер технику в чужом документе не правит, апрув своего инвойса —
   с разрешения админа, основной удаляет только документ без номера, экран «Документооборот» и отклонённые версии,
   пометки DRAFT/APPROVED в PDF, «Перенести день» скрыт. Демо-режим. Запуск: node tests/v1_09_26.js [порт].
   Серверные правила — tests/docflow.sql (107 проверок) и tests/stock-register.sql (архив пикапа и склад). */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8926;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 420) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const n of ['update-to-1_09_26.sql', 'full-install-1_09_26.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', n), 'utf8'), g = q.slice(q.lastIndexOf('create or replace function public.jobs_guard()'));
    t(`${n}: сторож — перевод при отправке, техника у менеджера, самоапрув, привязка пропозала, удаление только ни разу не отправленного, устройство в ревизии`,
      g.includes("raise exception 'TRANSLATION_REQUIRED'") && g.includes("raise exception 'FORBIDDEN_EQUIPMENT'") && g.includes("raise exception 'SELF_APPROVE_OFF'") && g.includes("raise exception 'LINK_LOCKED'")
      && g.includes('(old.numbered_at is not null or old.status <> \'draft\')') && g.includes("coalesce(old.updated_dev, '') is distinct from coalesce(new.updated_dev, '')"));
    t(`${n}: пикап уходит в архив и склад его возвращает; запрос правки закрывается сам; своя заметка пикапа`,
      q.includes('create trigger equip_pl_arch_tg after update of archived_at on public.placements') && q.includes('create trigger jobs_req_close_tg after update on public.jobs')
      && q.includes("add column if not exists note        text not null default ''") && q.includes("check (status in ('pending','granted','denied','closed'))"));
  }

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 300)); }); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const login = async who => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1200); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-tech'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1200);

  /* ---- меню и пустой экран ---- */
  const menu = await p.evaluate(() => { const tabs = [...document.querySelectorAll('.tabbar .tab')].map(b => (b.getAttribute('onclick') || '')); const i = tabs.findIndex(x => x.includes("'docflow'"));
    return { has: i >= 0, afterChat: i > 0 && tabs[i - 1].includes("'chat'"), badge: !!document.querySelector('.tab-badge[data-b="docflow"]'), dayMove: typeof window.dayMoveOn === 'function' ? window.dayMoveOn() : false }; });   /* v1.09.44: «Перенести день» удалён целиком */
  t('в меню — «Документооборот» сразу после «Сообщений», со счётчиком; «Перенести день» выключен', menu.has && menu.afterChat && menu.badge && menu.dayMove === false, menu);

  /* ---- документ с русской заметкой и техникой: на согласование без перевода не уходит ---- */
  const jid = await p.evaluate(async () => {
    const cx = state.data.complexes[0], wt = state.data.work_types[0], et = state.data.equipment_types[0], et2 = state.data.equipment_types[1];
    const fd = emptyFormData(); fd.equipment[et.id] = { qty: 2, days: 3 }; fd.equipment[et2.id] = { qty: 1, days: 3 };
    const j = { id: uid(), date: todayISO(), counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '926', work_type_id: wt.id, technician_id: state.user.id, technician_name: 'Sergey V.',
      helper_ids: [], shared_with_helpers: false, priority: false, sort_order: 0, status: 'draft', note: 'ключ у консьержа', note_en: '', form_data: fd, total: 0, approved_total: null, approved_by: null, approved_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await dbUpsert('jobs', j); await syncPlacementsForJob(j); return j.id; });
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(500);
  await p.evaluate(() => { document.getElementById('jb-done').checked = true; return App.saveJob(false); }); await p.waitForTimeout(500);
  const gate = await p.evaluate(id => ({ modal: !!document.getElementById('tr-need-go'), txt: (document.getElementById('overlay') || {}).textContent || '', st: state.data.jobs.find(x => x.id === id).status }), jid);
  t('«Задача выполнена» без перевода: окно «Нужен перевод» с кнопкой «Сформировать переводы», документ остался черновиком', gate.modal && /перевод/i.test(gate.txt) && gate.st === 'draft', gate);
  /* сеть в тесте закрыта — переводчик подменяем; дальше всё идёт настоящим путём */
  await p.evaluate(() => { window.__trApi0 = trApi; trApi = async ru => 'EN: ' + String(ru).length; });
  await p.click('#tr-need-go'); await p.waitForTimeout(1500);
  const sent = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { st: j.status, en: j.note_en, no: j.no, doc: j.doc_no }; }, jid);
  t('«Сформировать переводы»: перевод записан, сохранение продолжилось само — документ на согласовании, номер выдан', sent.st === 'done' && /^EN:/.test(sent.en || '') && sent.no > 0 && !!sent.doc, sent);

  /* ---- PDF: пометки статуса; на Диск — не черновик ---- */
  const marks = await p.evaluate(id => { const calls = []; const fake = { saveGraphicsState(){}, restoreGraphicsState(){}, setFont(){}, setFontSize(){}, setTextColor(){}, setDrawColor(){}, setLineWidth(){}, roundedRect(){}, text(s){ calls.push(s); } };
    const j = state.data.jobs.find(x => x.id === id);
    invStatusMark(fake, { ...j, id: 'zz-new', status: 'draft' }, 0, 139); const d = calls.slice(); calls.length = 0;
    invStatusMark(fake, j, 0, 139); const dn = calls.slice(); calls.length = 0;
    const j2 = { ...j, id: 'zz-appr', status: 'approved', approved_at: '2026-09-21T10:00:00Z' }; invStatusMark(fake, j2, 0, 139); const ap = calls.slice(); calls.length = 0;
    state.data.org_settings.pdf_approved_mark = false; invStatusMark(fake, j2, 0, 139); const off = calls.slice(); state.data.org_settings.pdf_approved_mark = true;
    return { d, dn, ap, off }; }, jid);
  t('PDF: черновик — DRAFT, «Выполнена» — без пометки, апрув — штамп APPROVED с датой; админ может выключить', marks.d.join() === 'DRAFT' && marks.dn.length === 0 && marks.ap[0] === 'APPROVED' && marks.ap[1] === '09/21/2026' && marks.off.length === 0, marks);

  /* ---- заметка пикапа — своя ---- */
  await p.evaluate(id => { App.go('home'); App.noteModal(id); }, jid); await p.waitForTimeout(400);
  const nm = await p.evaluate(() => ({ inv: (document.getElementById('pk-note-inv') || {}).textContent || '', own: (document.getElementById('pk-note') || {}).value, save: !!document.getElementById('pk-note-save') }));
  t('окно заметки пикапа: заметка инвойса — только для чтения, своя заметка пикапа пуста', /ключ у консьержа/.test(nm.inv) && nm.own === '' && nm.save, nm);
  await p.evaluate(() => { document.getElementById('pk-note').value = 'забрать после 15:00'; document.getElementById('pk-note-en').value = 'pick up after 3 pm'; }); await p.click('#pk-note-save'); await p.waitForTimeout(600);
  const pn = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { inv: j.note, pk: pkNoteOf(id), rows: state.data.placements.filter(x => x.job_id === id && x.note === 'забрать после 15:00').length, st: j.status, prob: dfProblems().length }; }, jid);
  t('заметка записана в пикап (во все его строки), инвойс не тронут и остался на согласовании, отказов нет', pn.inv === 'ключ у консьержа' && pn.pk === 'забрать после 15:00' && pn.rows === 2 && pn.st === 'done' && pn.prob === 0, pn);

  /* ---- отозвал: удалить документ с номером основной уже не может ---- */
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400); await p.click('#df-withdraw'); await p.waitForTimeout(800);
  const del = await p.evaluate(() => ({ st: jobDraft.status, no: jobDraft.no, btn: !!document.querySelector('.btn-red[onclick*="deleteJob"]'), can: canArchDoc({ t: 'job', o: jobDraft }) }));
  t('отозванный документ с номером: кнопки «Удалить» нет (обход «отозвал → удалил» закрыт)', del.st === 'draft' && del.no > 0 && !del.btn && del.can === false, del);

  /* ---- техника убрана из инвойса → пикап в архив с пояснением, ту же технику можно поставить заново ---- */
  const arch = await p.evaluate(async id => { const et2 = state.data.equipment_types[1]; jobDraft.form_data.equipment[et2.id].qty = 0; await App.saveJob(false);
    const rows = state.data.placements.filter(x => x.job_id === id); const a = rows.find(x => x.archived_at);
    return { total: rows.length, arch: rows.filter(x => x.archived_at).length, note: a && a.arch_note, sup: a && a.superseded, pending: rows.filter(pkPending).length, vis: visiblePlacements().filter(x => x.job_id === id).length,
      log: (state.data.audit_log || []).some(x => x.action === 'pickup_archive') }; }, jid); await p.waitForTimeout(400);
  t('убрали технику: строка пикапа НЕ удалена, а в архиве с пояснением; в ожидающих и видимых её нет; запись в журнале', arch.total === 2 && arch.arch === 1 && /Техника удалена из инвойса/.test(arch.note || '') && /Sergey V/.test(arch.note || '') && arch.sup === true && arch.pending === 1 && arch.vis === 1 && arch.log, arch);
  const again = await p.evaluate(async id => { const et2 = state.data.equipment_types[1]; jobDraft.form_data.equipment[et2.id] = { qty: 3, days: 2 }; await App.saveJob(false);
    const rows = state.data.placements.filter(x => x.job_id === id); return { total: rows.length, live: rows.filter(x => !x.archived_at).length, qty: (rows.find(x => !x.archived_at && x.equipment_type_id === et2.id) || {}).qty }; }, jid);
  t('ту же технику поставили заново: появилась новая строка пикапа, архивная не воскресла', again.total === 3 && again.live === 2 && again.qty === 3, again);

  /* ---- менеджер: техника — только просмотр; апрув своего инвойса — по настройке ---- */
  await login('demo-admin');
  await p.evaluate(() => App.dfRightSet('demo-manager', 'can_approve', true)); await p.waitForTimeout(300);
  const pkArch = await p.evaluate(() => { App.go('archive'); return true; }); await p.waitForTimeout(500);
  t('«Архив»: раздел «Пикапы в архиве» с пояснением', await p.evaluate(() => /Техника удалена из инвойса/.test((document.getElementById('arch-pickups') || {}).textContent || '')));
  await login('demo-manager');
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(500);
  const eq = await p.evaluate(() => { const b = document.getElementById('eq-ro'); const st = b && b.querySelector('.stepper');
    return { ro: !!b, note: !!document.getElementById('eq-ro-note'), pe: st ? getComputedStyle(st.parentElement.closest('.eq-line') || st).pointerEvents : '', docRo: document.getElementById('app').classList.contains('job-ro'), unitPe: getComputedStyle(document.getElementById('jb-unit')).pointerEvents }; });
  t('менеджер в чужом черновике: документ правится, а техника — только просмотр', eq.ro && eq.note && eq.pe === 'none' && !eq.docRo && eq.unitPe !== 'none', eq);
  await p.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); App.eqRoWhy(); }); await p.waitForTimeout(200);
  t('нажатие на технику объясняет, почему её нельзя менять', await p.evaluate(() => /пикап/i.test((document.querySelector('#toasts .toast') || {}).textContent || '')));
  /* собственный инвойс менеджера */
  const own = await p.evaluate(async () => { const cx = state.data.complexes[0], wt = state.data.work_types[0];
    const j = { id: uid(), date: todayISO(), counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '927', work_type_id: wt.id, technician_id: state.user.id, technician_name: 'Alexey S.', helper_ids: [], shared_with_helpers: false,
      priority: false, sort_order: 0, status: 'done', note: '', note_en: '', form_data: emptyFormData(), total: 0, approved_total: null, approved_by: null, approved_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await dbUpsert('jobs', j); return j.id; });
  await p.evaluate(id => App.openJob(id), own); await p.waitForTimeout(400);
  const sa = await p.evaluate(() => ({ hint: !!document.getElementById('df-self-appr'), btn: !!document.querySelector('[onclick="App.approveJob()"]') }));
  t('свой инвойс менеджер не апрувит: вместо кнопки — пояснение', sa.hint && !sa.btn, sa);
  await p.evaluate(() => { state.data.org_settings.self_approve = true; render(); }); await p.waitForTimeout(300);
  t('админ включил «менеджер может апрувить собственный инвойс» — кнопка появилась', await p.evaluate(() => !document.getElementById('df-self-appr') && !!document.querySelector('[onclick="App.approveJob()"]')));
  await p.evaluate(() => { state.data.org_settings.self_approve = false; });

  /* ---- привязка пропозала к запертому инвойсу ---- */
  const lk = await p.evaluate(async id => { document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); const j = state.data.jobs.find(x => x.id === id); j.status = 'done';
    state.data.profiles.find(x => x.id === 'demo-manager').can_approve = false; const before = j.proposal_id || null;
    await App.linkProposal(id, (state.data.proposals[0] || { id: 'p-x' }).id); const txt = (document.querySelector('#toasts .toast') || {}).textContent || '';
    const res = { blocked: (j.proposal_id || null) === before, txt }; state.data.profiles.find(x => x.id === 'demo-manager').can_approve = true; return res; }, jid);
  t('менеджер без разрешения админа пропозал к запертому инвойсу не привязывает — подсказка говорит, какую настройку включить', lk.blocked && /администратор/i.test(lk.txt) && /запертому/i.test(lk.txt), lk);

  /* ---- согласующий правит заапрувленный документ: вопрос про сумму ---- */
  await p.evaluate(async id => { const j = state.data.jobs.find(x => x.id === id); Object.assign(j, { status: 'approved', total: 100, approved_total: 100, approved_by: 'demo-admin', approved_at: new Date().toISOString() }); }, jid);
  await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(400);
  const sum = await p.evaluate(async id => { const fd = jobDraft.form_data; fd.others = fd.others || []; fd.others[0] = { desc: 'Extra haul', desc_en: '', amount: 40 }; await App.saveJob(false);
    const j = state.data.jobs.find(x => x.id === id); return { st: j.status, total: j.total, appr: j.approved_total, by: j.approved_by, log: (state.data.audit_log || []).some(x => x.action === 'approve_resum') }; }, jid);
  t('сумма изменилась после апрува: на вопрос ответили «да» — апрувленная сумма обновлена, запись в журнале', sum.st === 'approved' && +sum.appr === +sum.total && sum.by === 'demo-manager' && sum.log, sum);

  /* ---- «Документооборот»: отклонённая версия, разделы, кликабельность ---- */
  await login('demo-tech');
  await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); dfProblemAdd('jobs', { ...j, note: 'моя офлайн-правка' }, 'DOC_LOCKED_APPROVED'); render(); }, jid); await p.waitForTimeout(300);
  const b1 = await p.evaluate(() => { const b = document.querySelector('.tab-badge[data-b="docflow"]'); return { n: b && !b.hidden ? b.textContent : '', cnt: dflCount() }; });
  t('счётчик на пункте меню показывает то, что ждёт именно меня', b1.n === String(b1.cnt) && b1.cnt >= 1, b1);
  await p.evaluate(() => App.go('docflow')); await p.waitForTimeout(500);
  const scr = await p.evaluate(() => ({ prob: document.querySelectorAll('#dfl-problems + .tiny + .card .dfl-problem, .dfl-problem').length, txt: (document.querySelector('.dfl-problem') || {}).textContent || '',
    btns: document.querySelectorAll('.dfl-problem .btn').length, help: !!document.querySelector('.section-title .help-q, .section-title [onclick*="docflow"]') }));
  t('раздел «Не записано на сервер»: причина отказа и три действия — открыть, записать заново, убрать', scr.prob >= 1 && /заапрувлен/i.test(scr.txt) && scr.btns === 3, scr);
  await p.evaluate(() => { const x = dfProblems()[0]; App.dfProblemOpen(x.id); }); await p.waitForTimeout(500);
  t('«Открыть» ведёт в документ', await p.evaluate(id => state.screen === 'job' && jobDraft && jobDraft.id === id, jid));
  await p.evaluate(() => { App.go('docflow'); }); await p.waitForTimeout(300);
  await p.evaluate(() => App.dfProblemDiscard(dfProblems()[0].id)); await p.waitForTimeout(400);
  t('«Убрать»: отклонённой версии больше нет, счётчик уменьшился', await p.evaluate(() => dfProblems().length === 0 && !document.querySelector('.dfl-problem')));
  /* возврат на доработку виден исполнителю отдельным разделом, строка кликабельна */
  await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); Object.assign(j, { status: 'draft', return_note: 'нет фото счётчика', returned_by: 'demo-manager', approved_total: null }); App.go('docflow'); }, jid); await p.waitForTimeout(400);
  t('«Возвращены на доработку»: строка с причиной', await p.evaluate(() => /нет фото счётчика/.test((document.getElementById('dfl-returned') || { nextElementSibling: {} }).parentElement.textContent || '')));
  await p.click('#app .dfl-row.clicky'); await p.waitForTimeout(500);
  t('нажатие на строку открывает документ', await p.evaluate(() => state.screen === 'job'));

  /* ---- кликабельная подсказка об отказе ---- */
  await p.evaluate(() => { App.go('home'); document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); toastGo('⛔ тест · ' + t('dfl_open'), 'err', 9000, () => App.go('docflow')); }); await p.waitForTimeout(200);
  await p.click('#toasts .toast.go'); await p.waitForTimeout(400);
  t('подсказка об отказе кликабельна и ведёт в «Документооборот»', await p.evaluate(() => state.screen === 'docflow'));

  /* ---- админ: четыре новые галочки; блокировка сотрудника с незакрытыми документами ---- */
  await login('demo-admin');
  await p.evaluate(() => { foldSet('docs', true); App.go('settings'); }); await p.waitForTimeout(500);
  t('Настройки: галочки самоапрува, привязки к запертому инвойсу и пометок DRAFT / APPROVED; «Перенести день» убран', await p.evaluate(() => { _foldForce = true; render();
    const r = ['opt-self-approve', 'opt-link-locked', 'opt-pdf-draft', 'opt-pdf-appr'].every(id => !!document.getElementById(id)) && !document.querySelector('input[onchange*="day_move_on"]'); _foldForce = false; return r; }));
  await p.evaluate(() => { App.go('docflow'); }); await p.waitForTimeout(300);
  await p.evaluate(() => { state.data.profiles.find(x => x.id === 'demo-tech').blocked = true; render(); }); await p.waitForTimeout(300);
  t('документы заблокированного сотрудника — отдельным разделом у админа', await p.evaluate(() => !!document.getElementById('dfl-orphan') && dflCollect().orphan.length >= 1));
  await p.evaluate(() => { state.data.profiles.find(x => x.id === 'demo-tech').blocked = false; });

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
