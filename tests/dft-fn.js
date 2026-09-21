/* v1.09.27: офлайн-проверка Edge Function dft (тест документооборота). Сама функция транспилируется TypeScript'ом и выполняется
   в Node с подменой Deno.serve и клиента Supabase. Проверяется то, за что отвечает именно функция (правила над документами —
   в SQL, tests/dft.sql): вход, блокировка, режим выключен, закрытый список операций, выбор исполнителя по роли, уборка при
   выключенном режиме, запись запуска в журнал событий, отказ базы возвращается как ответ (HTTP 200), а не как сбой.
   Нужен typescript: NODE_PATH=/path/to/node_modules node tests/dft-fn.js */
const fs = require('fs'), path = require('path'), ts = require('typescript');
let ok = 0, bad = 0;
const t = (n, c, note) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 300) : '')); } };

const DB = {
  profiles: [
    { id: 'adm1', role: 'admin', display_name: 'Admin One', blocked: false }, { id: 'adm2', role: 'admin', display_name: 'Admin Two', blocked: false },
    { id: 'mgr', role: 'manager', display_name: 'Mgr Plain', blocked: false, can_approve: false }, { id: 'appr', role: 'manager', display_name: 'Mgr Approver', blocked: false, can_approve: true },
    { id: 'tech', role: 'tech', display_name: 'Tech One', blocked: false }, { id: 'tech2', role: 'tech', display_name: 'Tech Two', blocked: false },
    { id: 'gone', role: 'tech', display_name: 'Blocked', blocked: true }],
  org_settings: [{ id: 'org', dft_on: false, dft_until: null, dft_by: null }], audit_log: [], jobs: [{ id: 't1', is_test: true, test_owner: 'tech' }, { id: 'r1', is_test: false }]
};
const rpcCalls = []; let rpcNext = null;
function q(table){
  const f = []; let head = false;
  const api = { select(c, o){ head = !!(o && o.head); return api; }, eq(k, v){ f.push(r => r[k] === v); return api; },
    maybeSingle(){ return Promise.resolve({ data: DB[table].filter(r => f.every(x => x(r)))[0] || null, error: null }); },
    insert(row){ DB[table].push(row); return Promise.resolve({ error: null }); },
    then(res){ const d = DB[table].filter(r => f.every(x => x(r))); return res(head ? { count: d.length, data: null, error: null } : { data: d, error: null }); } };
  return api;
}
const svcFake = { from: q, rpc: (fn, args) => { rpcCalls.push({ fn, args }); const r = rpcNext || { data: { ok: true, data: { id: 'row' }, deleted: 2 }, error: null }; rpcNext = null; return Promise.resolve(r); } };
let me = { id: 'tech' };
const stub = { driveToken: async () => 'tok', svc: () => svcFake, userClient: () => ({ auth: { getUser: async () => ({ data: { user: me } }) } }), CORS: {}, jres: (b, s = 200) => ({ status: s, body: b }) };
let handler = null;
global.Deno = { serve: h => { handler = h; }, env: { get: () => '' } };
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/dft/index.ts'), 'utf8').replace(/^import .*?;\s*$/m, 'const { svc, userClient, driveToken, CORS, jres } = __g;');
new Function('__g', ts.transpileModule(src, { compilerOptions: { target: 'ES2022', module: 'None' } }).outputText)(stub);
const call = async (body) => handler({ method: 'POST', url: 'https://x/functions/v1/dft', headers: { get: () => 'Bearer x' }, json: async () => body });

(async () => {
  console.log('— Edge Function dft —');
  me = null; let r = await call({ action: 'status' });
  t('без входа — 401', r.status === 401);
  me = { id: 'gone' }; r = await call({ action: 'status' });
  t('заблокированный сотрудник — 403', r.status === 403);

  me = { id: 'tech' }; r = await call({ action: 'status' });
  t('status: режим выключен, видно, кого функция может «сыграть», и сколько осталось моих тестовых документов',
    r.status === 200 && r.body.on === false && r.body.actors.admin.id === 'adm1' && r.body.actors.manager.id === 'mgr' && r.body.actors.manager_appr.id === 'appr'
    && r.body.actors.techs.length === 1 && r.body.actors.techs[0].id === 'tech2' && r.body.mine === 1 && r.body.all === null, r.body);
  r = await call({ action: 'exec', as: 'admin', op: 'rpc', args: {} });
  t('режим выключен: exec отвечает DFT_OFF и до базы не доходит', r.status === 200 && r.body.ok === false && r.body.error.message === 'DFT_OFF' && rpcCalls.length === 0, r.body);
  r = await call({ action: 'cleanup', run: 'r1' });
  t('уборка работает и при выключенном режиме — от имени самого вызывающего', r.body.ok && r.body.deleted === 2 && rpcCalls[0].args.p_op === 'cleanup' && rpcCalls[0].args.p_caller === 'tech' && rpcCalls[0].args.p_actor === 'tech');

  DB.org_settings[0] = { id: 'org', dft_on: true, dft_until: new Date(Date.now() - 1000).toISOString(), dft_by: 'adm2' };
  r = await call({ action: 'exec', as: 'admin', op: 'job_get', args: {} });
  t('срок режима истёк — DFT_OFF', r.body.ok === false && r.body.error.message === 'DFT_OFF');
  DB.org_settings[0].dft_until = new Date(Date.now() + 3600e3).toISOString();

  rpcCalls.length = 0;
  r = await call({ action: 'begin', run: 'run-1' });
  t('begin: запуск теста записан в журнал событий (кто, роль, прогон); результаты в базе не хранятся', r.body.ok && DB.audit_log.length === 1 && DB.audit_log[0].action === 'dft_run' && DB.audit_log[0].actor === 'tech' && DB.audit_log[0].details.run === 'run-1');
  r = await call({ action: 'exec', as: 'admin', op: 'job_update', args: { id: 't1', patch: { status: 'approved' } } });
  t('exec от имени админа: исполнитель — админ, ВКЛЮЧИВШИЙ режим; вызывающий передан базе как есть', r.body.ok && r.body.actor.id === 'adm2' && rpcCalls[0].fn === 'dft_exec'
    && rpcCalls[0].args.p_caller === 'tech' && rpcCalls[0].args.p_actor === 'adm2' && rpcCalls[0].args.p_op === 'job_update', { actor: r.body.actor, call: rpcCalls[0] });
  r = await call({ action: 'exec', as: 'manager', op: 'job_get', args: {} });
  const r2 = await call({ action: 'exec', as: 'manager_appr', op: 'job_get', args: {} });
  t('«manager» — менеджер без права апрува, «manager_appr» — с правом', r.body.actor.id === 'mgr' && r2.body.actor.id === 'appr');
  r = await call({ action: 'exec', as: 'tech', tech: 'tech2', op: 'job_get', args: {} });
  const r3 = await call({ action: 'exec', as: 'tech', tech: 'adm1', op: 'job_get', args: {} });
  const r4 = await call({ action: 'exec', as: 'tech', tech: 'gone', op: 'job_get', args: {} });
  t('«tech» — только настоящий незаблокированный работник; админа или заблокированного под видом работника не подставить',
    r.body.actor.id === 'tech2' && r3.body.ok === false && r3.body.error.message === 'DFT_NO_ACTOR' && r4.body.error.message === 'DFT_NO_ACTOR');
  r = await call({ action: 'exec', as: 'self', op: 'job_get', args: {} });
  t('«self» — сам вызывающий', r.body.actor.id === 'tech');
  const n0 = rpcCalls.length;
  r = await call({ action: 'exec', as: 'admin', op: 'cleanup_all_real', args: {} });
  const r5 = await call({ action: 'exec', as: 'admin', op: 'sql', args: { q: 'drop table jobs' } });
  t('операции вне закрытого списка до базы не доходят: DFT_BAD_OP', r.body.error.message === 'DFT_BAD_OP' && r5.body.error.message === 'DFT_BAD_OP' && rpcCalls.length === n0);
  rpcNext = { data: null, error: { message: 'DFT_NOT_TEST_DOC', code: 'P0001', details: null, hint: null } };
  r = await call({ action: 'exec', as: 'admin', op: 'rpc', args: { fn: 'approve_job', args: { p_job: 'r1', p_total: 100 } } });
  t('отказ базы (настоящий документ) возвращается как ОТВЕТ: HTTP 200, ok=false, код и текст ошибки — для журнала теста', r.status === 200 && r.body.ok === false && r.body.error.message === 'DFT_NOT_TEST_DOC' && r.body.error.code === 'P0001' && typeof r.body.ms === 'number', r.body);
  r = await call({ action: 'nope' });
  t('неизвестное действие — 400', r.status === 400);
  me = { id: 'adm1' }; r = await call({ action: 'status' });
  t('админ в status видит и общее число тестовых документов', r.body.all === 1 && r.body.mine === 0, r.body);

  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
