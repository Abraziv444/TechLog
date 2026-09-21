/* v1.09.25 · серверный путь клиента на заглушке Supabase (jsdom): чтение ревизии тем же запросом, отказ STALE_DOC →
   окно конфликта, служебная правка накатывается на свежую строку, отказ «документ заперт», очередь без вечных повторов,
   мягкое «занято», заморозка номера через функцию базы, поведение до выполнения SQL.
   Запуск: NODE_PATH=<каталог с jsdom@24>/node_modules node tests/docflow-sb.js */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(ROOT + '/app.js', 'utf8');
let ok = 0, bad = 0;
const t = (name, cond, extra) => { if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>`,
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const w = dom.window;
w.TECHLOG_CONFIG = { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_ANON_KEY: 'anon' };
w.scrollTo = () => {}; w.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
if (!w.navigator.vibrate) w.navigator.vibrate = () => {};
w.confirm = () => true;

/* ---- заглушка клиента: сервер с одной таблицей jobs ---- */
const srv = { jobs: {}, upserts: [], rpcs: [], nextErr: null, lock: null, tablesMissing: false };
const upsertJobs = (row) => {
  srv.upserts.push(JSON.parse(JSON.stringify(row)));
  const run = (wantBack) => {
    if (srv.nextErr){ const e = srv.nextErr; srv.nextErr = null; return Promise.resolve({ data: null, error: { message: e } }); }
    const old = srv.jobs[row.id];
    const next = { ...(old || {}), ...row, rev: old ? (old.rev || 0) + 1 : 0, updated_by: 'me', updated_at: '2026-09-21T15:00:00Z' };
    if (next.status !== 'draft' && next.no == null){ next.no = 41; next.numbered_at = '2026-09-21T15:00:00Z'; }
    if (old && old.doc_no) next.doc_no = old.doc_no;
    srv.jobs[row.id] = next;
    return Promise.resolve({ data: wantBack ? [{ id: next.id, no: next.no ?? null, rev: next.rev, updated_by: next.updated_by, updated_at: next.updated_at, doc_no: next.doc_no ?? null, numbered_at: next.numbered_at ?? null }] : null, error: null });
  };
  const q = { select: () => run(true), then: (a, b) => run(false).then(a, b) };
  return q;
};
const from = (table) => ({
  upsert: (row) => table === 'jobs' ? upsertJobs(row) : Promise.resolve({ data: null, error: null }),
  insert: () => Promise.resolve({ data: null, error: null }),
  delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  select: (cols) => ({
    eq: (k, v) => ({ maybeSingle: () => Promise.resolve({ data: table === 'jobs' ? (srv.jobs[v] ? JSON.parse(JSON.stringify(srv.jobs[v])) : null) : null, error: null }),
                     single: () => Promise.resolve({ data: table === 'jobs' ? (srv.jobs[v] || null) : null, error: null }) }),
    order: () => ({ limit: () => Promise.resolve(srv.tablesMissing ? { data: null, error: { message: 'relation "public.' + table + '" does not exist' } } : { data: [], error: null }) }),
    limit: () => Promise.resolve({ data: [], error: null }) }),
});
const rpc = (fn, args) => {
  srv.rpcs.push({ fn, args });
  if (fn === 'doc_lock') return Promise.resolve({ data: srv.lock ? { ok: false, by: 'u2', name: 'Ivan Petrov', since: '2026-09-21T14:05:00Z', at: '2026-09-21T14:06:00Z', asked: !!args.p_force } : { ok: true }, error: null });
  if (fn === 'job_fix_no'){ const j = srv.jobs[args.p_job]; if (j && !j.doc_no) j.doc_no = args.p_text; return Promise.resolve({ data: j ? j.doc_no : null, error: null }); }
  return Promise.resolve({ data: null, error: null });
};
w.supabase = { createClient: () => ({ from, rpc, removeChannel: () => {}, channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
  auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => {}, signOut: () => Promise.resolve({}),
          mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: null }) } } }) };

const expose = `;window.__T = { state, NET, DF, JL, dbUpsert, saveJobPatch, pendingLoad, pendingSave, pendingAdd, pendingFlush, emptyData, emptyFormData, netOff, dfReady, canApprove, jobMode,
  jlTake, jlStart, jlStop, jlActive, jobNoFreeze, dfLoad, docNo, closeModal, setUser: u => { state.user = u; }, setData: d => { state.data = d; }, setDraft: d => { jobDraft = d; }, getDraft: () => jobDraft };`;
try{ const sc = w.document.createElement('script'); sc.textContent = appSrc + expose; w.document.body.appendChild(sc); }
catch(e){ console.log('⛔ app.js (SB) не выполнился:', e.message); process.exit(1); }
const S = w.__T;
if (!S){ console.log('⛔ внутренности не экспортировались'); process.exit(1); }

(async () => {
  await sleep(60);
  const data = S.emptyData();
  data.org_settings = { ...data.org_settings, docflow_v: 1, doc_no_fmt: '{TYPE}-{TECH}-{SEQ}', doc_no_pad: 5, manager_can_approve: true };
  data.profiles = [{ id: 'me', role: 'tech', display_name: 'Sergey Volkov', tag: 'SVK' }, { id: 'u2', role: 'manager', display_name: 'Ivan Petrov', can_approve: false }];
  S.setData(data); S.setUser(data.profiles[0]); S.pendingSave([]); S.NET.srv = true; S.NET.fails = 0;
  t('режим Supabase на заглушке: сеть есть, серверная часть 1.09.25 «выполнена»', !S.netOff() && S.dfReady());

  console.log('\n— запись документа и чтение ревизии —');
  const mk = (over) => ({ id: 'j1', date: '2026-09-21', unit_number: '12', technician_id: 'me', helper_ids: [], shared_with_helpers: false, status: 'draft', note: '', form_data: S.emptyFormData(), total: 0, priority: false, sort_order: 0, ...over });
  let r = await S.dbUpsert('jobs', mk());
  const row0 = S.state.data.jobs.find(j => j.id === 'j1');
  t('новый черновик записан: ревизия 0 пришла тем же запросом, номера нет, очередь пуста', (!r || r.ok !== false) && row0.rev === 0 && row0.no == null && S.pendingLoad().length === 0, { r, rev: row0.rev, no: row0.no });
  r = await S.dbUpsert('jobs', { ...row0, note: 'правка', status: 'done' });
  const row1 = S.state.data.jobs.find(j => j.id === 'j1');
  t('«Выполнено»: ревизия 1 и номер 41 вернулись в ответе записи', row1.rev === 1 && row1.no === 41 && !!row1.numbered_at, { rev: row1.rev, no: row1.no });
  await S.jobNoFreeze(row1);
  const fix = srv.rpcs.filter(x => x.fn === 'job_fix_no').pop();
  t('номер заморожен функцией базы: текст с личным сокращением основного', fix && fix.args.p_text === 'WORK-SVK-00041' && row1.doc_no === 'WORK-SVK-00041' && S.docNo('job', row1) === 'WORK-SVK-00041', { fix, doc: row1.doc_no });

  console.log('\n— чужая правка: STALE_DOC —');
  srv.jobs.j1 = { ...srv.jobs.j1, note: 'правка коллеги', rev: 7, updated_by: 'u2', updated_at: '2026-09-21T16:00:00Z' };   // коллега сохранил, пока я правил
  srv.nextErr = 'STALE_DOC';
  r = await S.dbUpsert('jobs', { ...row1, note: 'моя правка' });
  await sleep(30);
  const row2 = S.state.data.jobs.find(j => j.id === 'j1');
  t('содержимое разошлось: запись отклонена, в данных — свежая строка коллеги, открыто окно конфликта, очередь пуста',
    r && r.ok === false && r.code === 'STALE_DOC' && row2.note === 'правка коллеги' && row2.rev === 7 && !!S.DF.conflict && !!w.document.getElementById('df-cf-mine') && S.pendingLoad().length === 0,
    { r, note: row2.note, rev: row2.rev, conflict: !!S.DF.conflict });
  t('в окне — кто изменил', /Ivan P/.test((w.document.getElementById('overlay') || {}).textContent || ''));
  w.App.dfConflictMine(); await sleep(60);
  const last = srv.upserts[srv.upserts.length - 1];
  t('«записать мои поверх»: уходит моя правка со СВЕЖЕЙ ревизией и прежним номером', last.note === 'моя правка' && last.rev === 7 && last.doc_no === 'WORK-SVK-00041' && srv.jobs.j1.note === 'моя правка', { note: last.note, rev: last.rev });

  console.log('\n— служебная правка при устаревшей строке —');
  const stale = { ...S.state.data.jobs.find(j => j.id === 'j1'), note: 'старьё из кэша', rev: 3 };
  srv.jobs.j1 = { ...srv.jobs.j1, note: 'актуальная заметка', rev: 9, updated_by: 'u2' };
  srv.nextErr = 'STALE_DOC'; S.DF.conflict = null; S.closeModal();
  const n0 = srv.upserts.length;
  await S.saveJobPatch(stale, { priority: true }); await sleep(40);
  const again = srv.upserts[srv.upserts.length - 1];
  t('приоритет: отказ → повтор сам, на свежую строку — заметка коллеги цела, приоритет мой, окна конфликта нет',
    srv.upserts.length === n0 + 2 && again.note === 'актуальная заметка' && again.priority === true && again.rev === 9 && !S.DF.conflict && srv.jobs.j1.note === 'актуальная заметка' && srv.jobs.j1.priority === true,
    { n: srv.upserts.length - n0, note: again.note, pr: again.priority, conflict: !!S.DF.conflict });

  console.log('\n— документ заперт —');
  srv.nextErr = 'DOC_LOCKED_DONE';
  r = await S.dbUpsert('jobs', { ...S.state.data.jobs.find(j => j.id === 'j1'), note: 'правлю запертое' }); await sleep(30);
  t('DOC_LOCKED_DONE: запись отклонена, строка вернулась к серверной, красная подсказка, в очереди ничего',
    r && r.ok === false && r.code === 'DOC_LOCKED_DONE' && S.state.data.jobs.find(j => j.id === 'j1').note === 'актуальная заметка' && !!w.document.querySelector('#toasts .toast.err') && S.pendingLoad().length === 0, r);
  S.pendingSave([]); S.pendingAdd('upsert', 'jobs', { ...S.state.data.jobs.find(j => j.id === 'j1'), note: 'из офлайна' });   // как это делает приложение без связи
  srv.nextErr = 'DOC_LOCKED_APPROVED';
  await S.pendingFlush(); await sleep(40);
  t('очередь: отклонённый сервером документ не остаётся в ней навсегда', S.pendingLoad().length === 0, S.pendingLoad());

  console.log('\n— мягкое «занято» —');
  srv.jobs.j2 = { ...mk({ id: 'j2' }), rev: 0 }; S.state.data.jobs.push(JSON.parse(JSON.stringify(srv.jobs.j2)));
  S.setDraft(JSON.parse(JSON.stringify(srv.jobs.j2))); S.state.screen = 'job';
  srv.lock = true; S.jlStart('j2'); await sleep(40);
  const md1 = S.jobMode(S.getDraft());
  t('документ занят коллегой: режим «только просмотр», известно кто и с какого времени', md1.edit === false && md1.why === 'locked' && S.JL.held && S.JL.held.name === 'Ivan Petrov', { md1, held: S.JL.held });
  srv.lock = false; const okTake = await S.jlTake('j2', false);
  const md2 = S.jobMode(S.getDraft());
  t('освободился: блокировка моя, документ снова на правке', okTake === true && S.JL.mine === true && !S.JL.held && md2.edit === true, { okTake, md2 });
  S.jlStop(); await sleep(10);
  t('ушёл из документа: «занято» снято на сервере', srv.rpcs.some(x => x.fn === 'doc_unlock' && x.args.p_id === 'j2') && S.JL.id === null);

  console.log('\n— до выполнения SQL 1.09.25 —');
  const org = S.state.data.org_settings; delete org.docflow_v;
  S.setUser(S.state.data.profiles[1]);
  const before = srv.rpcs.length; srv.lock = true;
  const free = await S.jlTake('j2', false);
  t('серверной части нет: блокировки и чтение ревизии не используются, право апрува менеджера — по прежней общей галочке',
    !S.dfReady() && !S.jlActive() && free === true && srv.rpcs.length === before && S.canApprove() === true, { ready: S.dfReady(), free, appr: S.canApprove() });
  org.docflow_v = 1;
  t('серверная часть есть: право апрува — личное (галочка у сотрудника), общая галочка уже не действует', S.canApprove() === false);
  srv.tablesMissing = true; S.DF.at = 0;
  await S.dfLoad(true);
  t('таблиц ленты и запросов нет: загрузка не падает, а помечает «нужен SQL»', S.DF.noDb === true);

  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
