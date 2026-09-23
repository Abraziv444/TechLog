/* v1.09.40 — первый пакет «Замечаний по коду v1.09.38»: долг по ремонту от суммы счёта (п. 1), скрытые цены пропозала
   в форме и PDF (п. 2), скрытые суммы ремонта без PDF (п. 3), удаление строки справочника со связями (п. 4), статистика
   без архива (п. 6), «Добавить как комплекс» по ролям (п. 13), недельная доска сотрудника: ▲▼ и забранные пикапы (п. 14–15),
   отчёт по пикапам у бухгалтера и без двойного заголовка (п. 16, 46), печать ремонта/пропозала — окно предпросмотра
   (п. 18, 45), пуш «Пора на ТО» (п. 20), время журнала (п. 21), очередь переноса PDF в архив (п. 23), «REP» в цепочке
   (п. 26), нумерация «Оптимизировать» (п. 40). Демо-режим. Запуск: node tests/v1_09_40.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_view_mode', 'desktop'); });
  const login = async (role, keep) => {
    await p.evaluate(r => { localStorage.setItem('techlog_session_v1', 'demo-' + r); }, role);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length && state.user, null, { timeout: 20000 });
    await p.waitForTimeout(600);
  };
  const modalHtml = () => p.evaluate(() => { const m = document.querySelector('#overlay .modal'); return m ? m.innerHTML : ''; });
  const closeAll = () => p.evaluate(() => { for (let i = 0; i < 4; i++) closeModal(); });

  /* ---------- п. 1: долг по ремонту = сумма счёта клиенту ---------- */
  await login('admin');
  const ap = await p.evaluate(() => {
    const cx = state.data.complexes[0];
    const r = { id: uid(), no: 901, date: todayISO(), status: 'approved', counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '7',
      items: [{ q: 1, code: '', d: 'Works', a: 1000 }], materials: [{ q: 1, code: '', d: 'Mat', a: 200 }], sales_tax: 80, freight: 50,
      created_by: state.user.id, helper_ids: [], created_at: new Date().toISOString() };
    (state.data.repairs = state.data.repairs || []).push(r);
    const row0 = accDocRow('rep', r);
    state.data.acc_payments = (state.data.acc_payments || []).concat([{ id: uid(), kind: 'rep', doc_id: r.id, paid_on: todayISO(), amount: 1200, method: 'check' }]);
    const row1 = accDocRow('rep', r);
    const inAr = apOpenDocs().some(x => x.id === r.id && x.due > 0.005);
    const chip = apChipHtml(row1);
    return { grand: repGrand(r), bill: row0.bill, total: row0.total, due0: row0.due, due1: row1.due, inAr, chip, rid: r.id };
  });
  t('п.1: сумма к оплате по ремонту = «Всего» PDF (задачи + материалы + налог + доставка)', ap.bill === ap.grand && ap.grand === 1330 && ap.due0 === 1330, ap);
  t('п.1: база процентов — без налога и доставки (1200), оплатили 1200 → долг 130, документ в «Оплатах и долгах»', ap.total === 1200 && ap.due1 === 130 && ap.inAr && /1,?200/.test(ap.chip) && /1,?330/.test(ap.chip), ap);
  const autoPaid = await p.evaluate(async (rid) => {
    const r = repById(rid); r.acc_status = '';
    state.screen = 'acc'; render();
    const box = document.createElement('div'); box.innerHTML = apBlockHtml(accDocRow('rep', r)); document.body.appendChild(box);
    document.getElementById('ap-' + rid + '-a').value = '100';
    await apAdd('rep', rid);
    const a = repById(rid).acc_status || '';
    document.getElementById('ap-' + rid + '-a').value = '30';
    await apAdd('rep', rid);
    const b = repById(rid).acc_status || ''; box.remove();
    return { a, b };
  }, ap.rid);
  t('п.1: «оплачен» ставится только когда пришла вся сумма счёта (после 1300 из 1330 — нет, после 1330 — да)', autoPaid.a !== 'paid' && autoPaid.b === 'paid', autoPaid);

  /* ---------- п. 2: цены пропозала скрыты у менеджера и в форме, и в PDF ---------- */
  const propId = await p.evaluate(() => {
    const cx = state.data.complexes[0];
    const pr = { id: uid(), no: 77, date: todayISO(), counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '5', status: 'draft',
      items: [{ q: 1, code: 'A', d: 'Paint', a: 555 }], total: 555, sales_tax: 12, freight: 3, note: '', created_by: state.user.id, created_at: new Date().toISOString() };
    (state.data.proposals = state.data.proposals || []).push(pr);
    state.data.org_settings.prop_hide_prices = true; saveLocal(); return pr.id;
  });
  await p.waitForTimeout(1700);
  await login('manager');
  const pm = await p.evaluate(async (id) => {
    openProposal(id); await new Promise(r => setTimeout(r, 200));
    const html = document.querySelector('#app').innerHTML;
    const pa = [...document.querySelectorAll('.prop-row .pa')];
    let saved = 0; const s0 = savePdfCompat; window.savePdfCompat = () => { saved++; };
    makeProposalPdf(id, true);
    return { hidden: propMoneyHidden(), paDisabled: pa.length > 0 && pa.every(x => x.disabled && x.value === '—'),
      total: (document.getElementById('pr-total') || {}).textContent, has555: /555/.test(html), pdfBtn: /App\.makeProposalPdf\(/.test(html),
      printBtn: !!document.getElementById('prop-print'), taxInput: /App\.propField\('sales_tax'/.test(html), saved };
  }, propId);
  t('п.2: менеджер при «Скрывать цены» — суммы строк «—» и недоступны, итог «—», налог и доставка без полей, сумм в форме нет', pm.hidden && pm.paDisabled && pm.total === '—' && !pm.has555 && !pm.taxInput, pm);
  t('п.2: менеджер — нет кнопок PDF и печати, makeProposalPdf ничего не отдаёт', !pm.pdfBtn && !pm.printBtn && pm.saved === 0, pm);
  await p.evaluate(() => { propDraft = null; });
  await login('admin');
  const pa2 = await p.evaluate(async (id) => { openProposal(id); await new Promise(r => setTimeout(r, 200)); const html = document.querySelector('#app').innerHTML;
    return { pdfBtn: /App\.makeProposalPdf\(/.test(html), printBtn: !!document.getElementById('prop-print'), total: (document.getElementById('pr-total') || {}).textContent }; }, propId);
  t('п.2, п.45: админ видит суммы, есть «PDF пропозала» и «Печать»', pa2.pdfBtn && pa2.printBtn && /555/.test(pa2.total || ''), pa2);
  await p.waitForFunction(() => !!window.jspdf, null, { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => document.getElementById('prop-print').click());
  await p.waitForTimeout(900);
  const prm = await modalHtml();
  t('п.45: «Печать» пропозала — окно «Предпросмотр и печать» с кнопками печати и скачивания', /id="pr-go"/.test(prm) && /id="pr-dl2"/.test(prm), prm.slice(0, 300));
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await p.evaluate(() => document.getElementById('pr-dl2').click());
  const d1 = await dl;
  t('п.45: «Скачать PDF» из окна печати отдаёт файл пропозала', !!d1 && /^Proposal_77_/.test(d1.suggestedFilename()), d1 && d1.suggestedFilename());
  await closeAll(); await p.evaluate(() => { propDraft = null; render(); });

  /* ---------- п. 3 и 18: ремонт ---------- */
  const repId = await p.evaluate(() => {
    const cx = state.data.complexes[0];
    const r = { id: uid(), no: 902, date: todayISO(), status: 'draft', counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '9',
      items: [{ q: 1, code: '', d: 'W', a: 400 }], materials: [], sales_tax: 0, freight: 0, created_by: 'demo-tech', helper_ids: [], created_at: new Date().toISOString() };
    (state.data.repairs = state.data.repairs || []).push(r); saveLocal(); return r.id;
  });
  await p.waitForTimeout(1700);
  await p.evaluate(async (id) => { openRepair(id); await new Promise(r => setTimeout(r, 200)); }, repId);
  await p.evaluate(() => document.getElementById('rep-print').click());
  await p.waitForTimeout(900);
  const rpm = await modalHtml();
  t('п.18: «Печать» ремонта открывает окно предпросмотра и печати, а не второе «Скачать»', /id="pr-go"/.test(rpm) && /id="pr-frame"|id="pr-nofr"/.test(rpm), rpm.slice(0, 300));
  await closeAll(); await p.evaluate(() => { repDraft = null; state.data.org_settings.rep_hide_prices = true; saveLocal(); render(); });
  await p.waitForTimeout(1700);
  await login('tech');
  const rt = await p.evaluate(async (id) => {
    openRepair(id); await new Promise(r => setTimeout(r, 200));
    const html = document.querySelector('#app').innerHTML;
    let saved = 0; window.savePdfCompat = () => { saved++; };
    makeRepairPdf(id, true); docPrint('rep', id);
    return { hidden: repMoneyHidden(), pdfBtn: /App\.makeRepairPdf\(/.test(html), printBtn: !!document.getElementById('rep-print'), saved, modal: !!document.querySelector('#overlay #pr-go') };
  }, repId);
  t('п.3: сотрудник при «Скрыть суммы ремонта» — нет кнопок PDF/Печать, PDF и печать не строятся', rt.hidden && !rt.pdfBtn && !rt.printBtn && rt.saved === 0 && !rt.modal, rt);
  await p.evaluate(() => { repDraft = null; render(); });
  await login('acc');
  t('п.3: бухгалтер — не «работник»: суммы ремонта ему не скрыты', await p.evaluate(() => !repMoneyHidden()));
  /* п. 16 + 46: отчёт по пикапам у бухгалтера */
  const accRep = await p.evaluate(async () => { state.screen = 'reports'; state.repTab = 'pickups'; render(); await new Promise(r => setTimeout(r, 150));
    const h = document.querySelector('#app').innerHTML;
    return { noAccess: h.includes(t('no_access')), titles: document.querySelectorAll('#app .section-title').length, dateRow: h.includes(t('report_date')) }; });
  t('п.16: бухгалтер открывает вкладку «Пикапы» в Отчётах — отчёт, а не «Нет доступа»', !accRep.noAccess && accRep.dateRow, accRep);
  t('п.46: во вкладке «Пикапы» один заголовок экрана', accRep.titles === 1, accRep);

  /* ---------- п. 4: удаление строки справочника ---------- */
  await login('admin');
  const del = await p.evaluate(async () => {
    const cp = state.data.counterparties.find(c => state.data.complexes.some(x => x.counterparty_id === c.id));
    const use = dirUsage('counterparties', cp.id);
    delRow('counterparties', cp.id); await new Promise(r => setTimeout(r, 150));
    const m1 = document.querySelector('#overlay .modal') ? document.querySelector('#overlay .modal').innerHTML : '';
    const still = state.data.counterparties.some(c => c.id === cp.id);
    closeModal();
    const et = state.data.equipment_types.find(e => state.data.placements.some(pl => pl.equipment_type_id === e.id));
    const useEt = et ? dirUsage('equipment_types', et.id) : [];
    const st = { id: uid(), name: 'ZZ test size' }; (state.data.size_types = state.data.size_types || []).push(st);
    const pr = delRow('size_types', st.id); await new Promise(r => setTimeout(r, 150));
    const askTxt = (document.querySelector('#overlay .ask-text') || {}).textContent || '';
    document.getElementById('ask-ok').click(); await pr; await new Promise(r => setTimeout(r, 150));
    return { use, inUse: /id="du-list"/.test(m1), still, useEt, askTxt, gone: !state.data.size_types.some(x => x.id === st.id) };
  });
  t('п.4: контрагента с комплексами и документами не удалить — окно «Удалить нельзя» со счётчиками, строка на месте', del.use.length > 0 && del.inUse && del.still, del);
  t('п.4: у типа оборудования считаются пикапы/движения склада', del.useEt.length > 0, del.useEt);
  t('п.4: неиспользуемая строка — вопрос в окне приложения (не confirm), после «Удалить» строка удалена', /не используется|No documents/.test(del.askTxt) && del.gone, del);

  /* ---------- п. 6: статистика без архива ---------- */
  const st6 = await p.evaluate(() => {
    const j = liveJobs()[0]; const before = statScopeJobs().some(x => x.id === j.id);
    j.archived_at = new Date().toISOString(); const after = statScopeJobs().some(x => x.id === j.id);
    const pl = state.data.placements.find(x => x.job_id === j.id);
    const plIn = pl ? statScopePlacements().some(x => x.id === pl.id) : false;
    j.archived_at = null; return { before, after, plIn, hasPl: !!pl };
  });
  t('п.6: архивная задача и её пикапы не попадают в статистику', st6.before && !st6.after && !st6.plIn, st6);

  /* ---------- п. 13: «Добавить как комплекс» по ролям ---------- */
  const mapRole = async () => p.evaluate(async () => {
    state.screen = 'map'; render(); await new Promise(r => setTimeout(r, 300));
    geoResults = [{ lat: '33.9', lon: '-84.3', display_name: 'Test Place, Alpharetta' }];
    let box = document.getElementById('map-sr'); if (!box){ box = document.createElement('div'); box.id = 'map-sr'; document.body.appendChild(box); }
    mapPickRun(0);
    const btn = !!document.getElementById('map-add-cx'), no = !!document.getElementById('map-add-cx-no');
    addCxModal(0); await new Promise(r => setTimeout(r, 100));
    const sel = document.getElementById('ncx-cp'); const opts = sel ? [...sel.options].map(o => o.value) : null; closeModal();
    return { btn, no, opts };
  });
  const mA = await mapRole();
  await login('manager'); const mM = await mapRole();
  await login('tech'); const mT = await mapRole();
  t('п.13: админ — кнопка и «Новый контрагент»', mA.btn && mA.opts && mA.opts.includes('__new'), mA);
  t('п.13: менеджер — кнопка есть, «Новый контрагент» нет', mM.btn && mM.opts && !mM.opts.includes('__new'), mM);
  t('п.13: сотрудник — вместо кнопки подсказка, окно не открывается', !mT.btn && mT.no && mT.opts === null, mT);

  /* ---------- п. 14, 15: недельная доска сотрудника ---------- */
  const wk = await p.evaluate(async () => {
    const me = state.user.id, iso = todayISO(), cx = state.data.complexes[0];
    const mk = (u, so) => ({ id: uid(), date: iso, technician_id: me, helper_ids: [], counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: u, status: 'draft',
      sort_order: so, priority: false, form_data: emptyFormData(), created_at: new Date().toISOString() });
    const a = mk('W1', 0), b = mk('W2', 1); state.data.jobs.push(a, b);
    /* забранный сегодня пикап своей задачи */
    const et = state.data.equipment_types[0];
    const pl = { id: uid(), job_id: a.id, technician_id: me, equipment_type_id: et.id, qty: 1, complex_id: cx.id, counterparty_id: cx.counterparty_id,
      placed_at: iso, due_date: iso, picked_up: true, picked_up_at: new Date().toISOString(), superseded: false };
    state.data.placements.push(pl);
    state.weekStart = mondayOf(iso); state.selDate = addDaysISO(iso, 3);   // выбран другой день — стрелки берут дату карточки
    const html = viewBoardWeek();
    const rail = /App\.moveJobDay\('/.test(html) && !/App\.boardMove\('/.test(html);
    const done = /bpk-done/.test(html);
    const i0 = dayTripJobIds(iso).indexOf(b.id);
    await App.moveJobDay(b.id, -1, iso);
    const i1 = dayTripJobIds(iso).indexOf(b.id);
    return { rail, done, i0, i1, saved: jobById(b.id).sort_order };
  }).catch(e => ({ err: String(e) }));
  t('п.14: на недельной доске сотрудника ▲▼ ведут в перестановку по дате карточки', wk.rail, wk);
  t('п.14: ▲ поднимает задачу на место выше и сохраняет порядок сразу (при другом выбранном дне)', wk.i0 > 0 && wk.i1 === wk.i0 - 1 && wk.saved === wk.i1, wk);
  t('п.15: забранный пикап — блёклая плашка «✓ Забрано»', wk.done, wk);

  /* ---------- п. 20, 21, 23 ---------- */
  await login('admin');
  const misc = await p.evaluate(() => {
    const ok20 = deepLinkApply('./?mycar=1') === true && state.screen === 'mycar';
    state.screen = 'home'; render();
    invArchQAdd('job-x', 'draft'); invArchQAdd('job-x', 'draft'); invArchQAdd('job-y', 'price');
    const q = invArchQ(); invArchQSet([]);
    return { ok20, q: q.map(x => x.id + ':' + x.why), empty: invArchQ().length,
      retry: [invArchRetryable(new TypeError('Failed to fetch')), invArchRetryable(new Error('FORBIDDEN'))] };
  });
  t('п.20: ссылка «./?mycar=1» из пуша «Пора на ТО» открывает «Мою машину»', misc.ok20, misc);
  t('п.23: очередь переноса PDF в архив — без дублей по документу, пустеет', misc.q.join() === 'job-x:draft,job-y:price' && misc.empty === 0, misc);
  t('п.23: повтор — только для сбоев связи/сервера, отказ в праве не повторяется', misc.retry[0] === true && misc.retry[1] === false, misc.retry);
  const jr = await p.evaluate(async () => {
    const at = '2026-09-23T02:30:00Z';                     // 22:30 22 сентября в Нью-Йорке
    state.jr = state.jr || {}; state.jr.rows = [{ id: 'x', at, actor_name: 'Ivan', action: 'job_create', entity: 'job', entity_id: 'z', details: {} }];
    state.screen = 'journal'; render(); await new Promise(r => setTimeout(r, 100));
    const w = document.querySelector('.jr-when'); return { when: w ? w.textContent.trim() : null, expect: tsISO(at).slice(5) + ' ' + fmtHM(at) };
  });
  t('п.21: журнал — время по поясу фирмы (не UTC)', jr.when === jr.expect && jr.when === '09-22 22:30', jr);

  /* ---------- исходник: 7, 22–24, 26, 40, SQL/Edge ---------- */
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  t('п.7: после «Разрешить» вызывается invDriveOnStatus со статусом до решения', /const j0 = jobById\(q\.doc_id\), prevSt = /.test(src) && src.includes('if (grant && prevSt){ const jn = jobById(q.doc_id); if (jn) invDriveOnStatus(prevSt, jn); }'));
  t('п.24: клиент больше не пишет inv_archive в журнал (пишет media-delete)', !/audit\('inv_archive'/.test(src));
  t('п.26: путь цепочки подписывает ремонт', src.includes("rep: 'REP' })[x.t] || '?'"));
  t('п.40: «Оптимизировать → Применить» нумерует с 0', src.includes('saveJobPatch(j, { sort_order: k++ })') && !src.includes('sort_order: ++k'));
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_40.sql'), 'utf8');
  const full = fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_09_40.sql'), 'utf8');
  t('SQL 1.09.40: стражи удаления, журнал, pl_upd, upload_id; full-install = 1.09.38 + обновление', ['dir_del_guard_tg', 'profile_del_guard_tg', 'audit_guard_tg', 'is_job_main', 'media add column if not exists upload_id'].every(k => sql.includes(k))
    && full.startsWith(fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_09_38.sql'), 'utf8')) && full.endsWith(sql) && /const DB_SQL_FILE = 'full-install-1_09_(4\d|[5-9]\d)\.sql';/.test(src));   // v1.09.42: файл базы двинулся дальше
  const fn = n => fs.readFileSync(path.join(ROOT, 'supabase/functions', n, 'index.ts'), 'utf8');
  t('Edge: media-put сверяет upload_id с владельцем и статусом; media-begin его пишет; свои версии в ver', /eq\("upload_id", upId\)/.test(fn('media-put')) && /RELAY_FORBIDDEN/.test(fn('media-put'))
    && /update\(\{ upload_id: uid \}\)/.test(fn('media-begin')) && /ver: BEGIN_VER/.test(fn('media-begin')) && /ver: PUT_VER/.test(fn('media-put')) && /ver: DEL_VER/.test(fn('media-delete')));
  t('Edge: media-delete пускает помощника с общим доступом в inv_archive', /rpc\("is_shared_job_helper", \{ p_job: job_id \}\)/.test(fn('media-delete')));
  t('Edge: push — morning только расписанию/админу, пауза 15 с для обычных, заблокированных не пускает', /morning"\) && \(cron \|\| admin\)/.test(fn('push')) && /ago < 15000/.test(fn('push')) && /blocked\) return jres\(\{ error: "FORBIDDEN" \}, 403\)/.test(fn('push')));
  t('клиент: отказ посредника RELAY_FORBIDDEN = мёртвая сессия (410) → новая сессия', src.includes("if (j.error === 'RELAY_FORBIDDEN') return { status: 410, range: '', id: '' };"));
  let dash = ''; try{ dash = cp.execSync('python3 ' + path.join(ROOT, 'supabase/make-dashboard-copies.py') + ' --check', { encoding: 'utf8' }); }catch(e){ dash = String(e.stdout || e); }
  t('п.57: копии функций для Dashboard совпадают с исходниками', /РАСХОЖДЕНИЯ: нет/.test(dash), dash.slice(0, 300));

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
