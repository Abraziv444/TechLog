/* v1.09.53 · серверный путь клиента для ремонта на заглушке Supabase (jsdom): то, что в демо не проверить.
   · сохранение ремонта с базой 1.09.53 (docflow_v ≥ 11) читает ответ сервера тем же запросом — select('id,no,status,decided_by,decided_at,hist'):
     номер нового документа приходит сразу (без второго запроса), снятый сервером апрув виден в документе и подсказкой;
   · со старой базой — прежний путь: upsert без чтения и отдельный запрос номера;
   · тест в приложении: свои шаги ремонта идут настоящими запросами (update / select под политиками), «0 строк» — это RLS_DENIED;
     правила сервера для ремонта считаются установленными только с docflow_v ≥ 11.
   Запуск: NODE_PATH=<каталог с jsdom@24>/node_modules node tests/v1_09_53-sb.js */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(ROOT + '/app.js', 'utf8');
let ok = 0, bad = 0;
const t = (name, cond, extra) => { if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>`,
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const w = dom.window;
w.TECHLOG_CONFIG = { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'anon' };
w.scrollTo = () => {}; w.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
if (!w.navigator.vibrate) w.navigator.vibrate = () => {};
w.confirm = () => true;

/* ---- заглушка: таблица repairs со сторожем апрува, как update-to-1_09_53.sql ---- */
const srv = { repairs: {}, calls: [], seq: 100, visible: true };
const key = r => JSON.stringify([r.date, r.counterparty_id, r.complex_id, r.unit_number || '', r.po_number || '', r.complete_by || null, r.note || '', +r.sales_tax || 0, +r.freight || 0, +r.total || 0,
  r.helper_ids || [], (r.items || []).map(e => [+e.q || 0, String(e.code || '').toUpperCase(), e.d || '', +e.a || 0]), (r.materials || []).map(e => [+e.q || 0, String(e.code || '').toUpperCase(), e.d || '', +e.a || 0])]);
const guard = row => {
  const old = srv.repairs[row.id], nw = { ...(old || {}), ...row };
  if (!old){ if (nw.status === 'approved' || nw.status === 'declined') nw.status = 'draft'; nw.no = ++srv.seq; }
  else {
    nw.no = old.no;
    if ((old.status === 'approved' || old.status === 'sent') && nw.status === old.status && key(nw) !== key(old)){
      nw.status = 'draft'; nw.hist = [{ act: 'reset', from: old.status, srv: true, by: 'me' }].concat(nw.hist || []); }
    if (nw.status !== old.status){ if (nw.status === 'draft' || nw.status === 'sent'){ nw.decided_by = null; nw.decided_at = null; } }
  }
  srv.repairs[row.id] = nw; return nw;
};
const upsertRep = row => {
  srv.calls.push({ op: 'upsert', id: row.id });
  const run = back => { const nw = guard(JSON.parse(JSON.stringify(row)));
    return Promise.resolve({ data: back ? [{ id: nw.id, no: nw.no, status: nw.status, decided_by: nw.decided_by ?? null, decided_at: nw.decided_at ?? null, hist: nw.hist || [] }] : null, error: null }); };
  return { select: cols => { srv.calls.push({ op: 'upsert+select', cols }); return run(true); }, then: (a, b) => run(false).then(a, b) };
};
const from = table => ({
  upsert: row => table === 'repairs' ? upsertRep(row) : Promise.resolve({ data: null, error: null }),
  insert: () => Promise.resolve({ data: null, error: null }),
  update: patch => ({ eq: (k, v) => ({ select: () => { srv.calls.push({ op: 'update', table, id: v, patch });
    if (table !== 'repairs' || !srv.visible || !srv.repairs[v]) return Promise.resolve({ data: [], error: null });
    if (patch.status === 'approved') return Promise.resolve({ data: null, error: { message: 'FORBIDDEN_APPROVE', code: 'P0001' } });
    return Promise.resolve({ data: [guard({ ...srv.repairs[v], ...patch })], error: null }); } }) }),
  delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  select: cols => ({
    eq: (k, v) => { const hit = table === 'repairs' && srv.visible && srv.repairs[v] ? JSON.parse(JSON.stringify(srv.repairs[v])) : null;
      const p = Promise.resolve({ data: hit ? [hit] : [], error: null });
      return { single: () => { srv.calls.push({ op: 'select-single', table, cols, id: v }); return Promise.resolve({ data: hit, error: null }); },
               maybeSingle: () => Promise.resolve({ data: hit, error: null }), then: (a, b) => { srv.calls.push({ op: 'select', table, cols, id: v }); return p.then(a, b); } }; },
    order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    limit: () => Promise.resolve({ data: [], error: null }) }),
});
w.supabase = { createClient: () => ({ from, rpc: () => Promise.resolve({ data: null, error: null }), removeChannel: () => {}, channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
  auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => {}, signOut: () => Promise.resolve({}),
          mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: null }) } } }) };

const expose = `;window.__T = { state, NET, DFT, dbUpsert, saveRepair, repById, pendingSave, pendingLoad, emptyData, netOff, dftExec, dftRepSrvOk, repSrvV11,
  setUser: u => { state.user = u; }, setData: d => { state.data = d; }, setRep: d => { repDraft = d; }, getRep: () => repDraft };`;
try{ const sc = w.document.createElement('script'); sc.textContent = appSrc + expose; w.document.body.appendChild(sc); }
catch(e){ console.log('⛔ app.js (SB) не выполнился:', e.message); process.exit(1); }
const S = w.__T;
if (!S){ console.log('⛔ внутренности не экспортировались'); process.exit(1); }

(async () => {
  await sleep(60);
  const data = S.emptyData();
  data.org_settings = { ...data.org_settings, docflow_v: 11 };
  data.profiles = [{ id: 'me', role: 'tech', display_name: 'Sergey Volkov' }, { id: 'ap', role: 'manager', can_approve: true, display_name: 'Maria Approver' }];
  data.repairs = [];
  S.setData(data); S.setUser(data.profiles[0]); S.pendingSave([]); S.NET.srv = true; S.NET.fails = 0; S.state.screen = 'repairs';
  t('режим Supabase на заглушке, база 1.09.53: правила ремонта установлены (docflow_v 11)', !S.netOff() && S.repSrvV11() && S.dftRepSrvOk());

  console.log('\n— сохранение ремонта читает ответ сервера —');
  const mk = over => ({ id: 'r1', no: null, date: '2026-09-24', counterparty_id: 'cp1', complex_id: 'cx1', unit_number: '12', job_id: null, proposal_id: null, helper_ids: ['me'],
    items: [{ q: 1, code: '', d: 'Patch', d_en: '', a: 40 }], materials: [], note: '', note_en: '', photos: { before: [], after: [] }, po_number: '', complete_by: null, sales_tax: 0, freight: 0,
    total: 40, status: 'draft', hist: [{ act: 'created' }], decline_reason: '', created_by: 'me', decided_by: null, decided_at: null, ...over });
  srv.calls = []; S.setRep(mk()); await S.saveRepair(true);
  const r1 = S.repById('r1');
  t('новый ремонт: upsert + select статуса, решения и истории одним запросом; номер пришёл в ответе — второго запроса номера нет',
    srv.calls.some(c => c.op === 'upsert+select' && c.cols === 'id,no,status,decided_by,decided_at,hist') && !srv.calls.some(c => c.op === 'select-single') && r1.no === 101 && S.getRep().no === 101,
    { calls: srv.calls, no: r1 && r1.no });
  /* согласующий одобрил на сервере; у работника в руках документ «Одобрен» */
  srv.repairs.r1 = { ...srv.repairs.r1, status: 'approved', decided_by: 'ap', decided_at: '2026-09-24T10:00:00Z' };
  Object.assign(r1, { status: 'approved', decided_by: 'ap', decided_at: '2026-09-24T10:00:00Z' });
  S.setRep(JSON.parse(JSON.stringify(r1))); w.document.querySelectorAll('#toasts .toast').forEach(x => x.remove());
  srv.calls = []; await S.saveRepair(true);
  t('«Сохранить» без правок одобренного — апрув на месте и у сервера, и в приложении', S.repById('r1').status === 'approved' && srv.repairs.r1.status === 'approved' && S.getRep().status === 'approved');
  /* правка сметы, пришедшая мимо кнопок (например, устаревшая копия в другой вкладке): приложение прислало «Одобрен» с другой суммой */
  S.setRep({ ...JSON.parse(JSON.stringify(S.repById('r1'))), items: [{ q: 1, code: '', d: 'Patch', d_en: '', a: 55 }], total: 55 });
  w.document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); await S.saveRepair(true);
  const r1b = S.repById('r1'), toast = [...w.document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | ');
  t('правка сметы одобренного: сервер снял апрув — документ сразу «Черновик» с записью «сервер», решение снято, подсказка', r1b.status === 'draft' && r1b.decided_by == null && (r1b.hist[0] || {}).srv === true
    && S.getRep().status === 'draft' && (S.getRep().hist[0] || {}).srv === true && /Сервер снял апрув/.test(toast), { st: r1b.status, h: r1b.hist && r1b.hist[0], toast });

  console.log('\n— старая база (до 1.09.53) — прежний путь —');
  S.state.data.org_settings.docflow_v = 10;
  srv.calls = []; S.setRep(mk({ id: 'r2' })); await S.saveRepair(true);
  t('docflow_v 10: upsert без чтения ответа и отдельный запрос номера (как в 1.09.52); правила ремонта в тесте — «не установлены»',
    srv.calls.some(c => c.op === 'upsert') && !srv.calls.some(c => c.op === 'upsert+select') && srv.calls.some(c => c.op === 'select-single' && c.cols === 'no') && S.repById('r2').no === 102 && !S.dftRepSrvOk(),
    srv.calls);
  S.state.data.org_settings.docflow_v = 11;

  console.log('\n— тест в приложении: свои шаги ремонта — настоящими запросами —');
  S.DFT.status = { ok: true, actors: { admin: null, manager: null, manager_appr: { id: 'ap', name: 'Maria Approver', role: 'manager' }, techs: [] } }; S.DFT.statusAt = Date.now(); S.DFT.running = true; S.DFT.run = 'dft-x';
  srv.calls = [];
  const g = await S.dftExec('W', 'rep_get', { id: 'r1' });
  t('работник-ведущий: rep_get — select по его правам (не через функцию)', g.ok && g.data && g.data.id === 'r1' && srv.calls.some(c => c.op === 'select' && c.table === 'repairs' && c.cols === '*'), { g, calls: srv.calls });
  srv.visible = false; const g2 = await S.dftExec('W', 'rep_get', { id: 'r1' }), u2 = await S.dftExec('W', 'rep_update', { id: 'r1', patch: { note: 'x' } }); srv.visible = true;
  t('не видно по политике: select и update вернули 0 строк — это RLS_DENIED', !g2.ok && g2.error.message === 'RLS_DENIED' && !u2.ok && u2.error.message === 'RLS_DENIED', { g2, u2 });
  const u3 = await S.dftExec('W', 'rep_update', { id: 'r1', patch: { status: 'approved' } });
  t('апрув своего ремонта запросом в обход интерфейса — отказ сервера FORBIDDEN_APPROVE (как видит тест)', !u3.ok && /FORBIDDEN_APPROVE/.test(u3.error.message), u3);
  const u4 = await S.dftExec('W', 'rep_update', { id: 'r1', patch: { note_en: 'fix' } });
  t('правка своего ремонта — update … select() под политиками, ответ — строка сервера', u4.ok && u4.data.note_en === 'fix' && srv.calls.some(c => c.op === 'update' && c.table === 'repairs'), u4);
  S.DFT.running = false;

  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
