/* v1.09.46 — ЛОГИКА ДАННЫХ: метрики инвариантов и ложных тревог диагностики.
   1) Чистые демо-данные: ни одно правило уровня «ошибка» не срабатывает (ложные тревоги = 0).
   2) Мутации: для КАЖДОГО правила из INV_RULES данные портятся ровно в том месте, которое правило сторожит, —
      правило обязано сработать. Метрика «поймано» = сработавшие / все, должна быть 100 %. Правило без мутации —
      тоже провал: значит, добавили правило и не проверили, что оно ловит.
   3) «Шум»: сколько посторонних правил срабатывает на мутацию (для сведения).
   4) Диагностика на здоровом демо: ни одной строки «⛔» (ложная тревога — как «задач без номера» в 1.09.44).
   Итог пишется в tests/out/metrics-invariants.json. Запуск: node tests/invariants.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 900) : '')); } }

/* мутации: id правила → код, портящий данные (выполняется в странице; j — живая задача, p — ждущий пикап) */
const MUT = {
  job_sent_no_number:      `j.status = 'done'; j.no = null; j.is_test = false;`,
  job_approved_no_meta:    `j.status = 'approved'; j.approved_total = 100; j.approved_at = null; j.approved_by = null;`,
  job_draft_keeps_approval:`j.status = 'draft'; j.approved_total = 100;`,
  job_helper_is_main:      `j.helper_ids = [j.technician_id];`,
  job_cx_cp_mismatch:      `const cx = cxById(j.complex_id); const other = state.data.counterparties.find(c => c.id !== cx.counterparty_id); j.counterparty_id = other.id;`,
  job_blocked_owner:       `j.status = 'draft'; state.data.profiles.find(x => x.id === j.technician_id).blocked = true;`,
  prop_link_missing:       `j.proposal_id = 'no-such-proposal';`,
  rep_job_missing:         `(state.data.repairs = state.data.repairs || []).push({ id: uid(), no: 77, date: j.date, status: 'draft', job_id: 'no-such-job', items: [], materials: [] });`,
  pk_of_archived_job:      `jobById(p.job_id).archived_at = new Date().toISOString();`,
  pk_due_before_placed:    `p.placed_date = '2026-09-10'; p.due_date = '2026-09-01';`,
  pk_picked_no_time:       `p.picked_up = true; p.picked_up_at = null;`,
  pk_ext_orphan:           `p.ext_of = 'no-such-pickup';`,
  pk_qty_bad:              `p.qty = 0;`,
  ext_req_dead_job:        `(state.data.ext_requests = state.data.ext_requests || []).push({ id: uid(), status: 'pending', job_id: 'no-such-job', unit: '9', days: 3 });`,
  doc_req_on_draft:        `j.status = 'draft'; (state.data.doc_requests = state.data.doc_requests || []).push({ id: uid(), kind: 'job', doc_id: j.id, status: 'pending', user_id: j.technician_id });`,
  acc_paid_with_debt:      `j.status = 'approved'; j.approved_total = 500; j.total = 500; j.approved_at = new Date().toISOString(); j.approved_by = state.user.id; j.acc_status = 'paid';
                            state.data.acc_payments = (state.data.acc_payments || []).filter(x => x.doc_id !== j.id);`,
  acc_overpaid:            `j.status = 'approved'; j.approved_total = 500; j.total = 500; j.approved_at = new Date().toISOString(); j.approved_by = state.user.id;
                            state.data.acc_payments = (state.data.acc_payments || []).concat([{ id: uid(), kind: 'job', doc_id: j.id, paid_on: todayISO(), amount: 900, method: 'check' }]);`,
  inv_pdf_not_approved:    `j.status = 'draft'; state.data.media.push({ id: uid(), job_id: j.id, kind: 'invoice', seq: 1, status: 'ready', file_name: 'INV.pdf', archived_at: null, created_at: new Date().toISOString() });`,
  media_stuck_upload:      `state.data.media.push({ id: uid(), job_id: j.id, kind: 'photo', seq: 99, status: 'uploading', file_name: 'x.jpg', created_at: new Date(Date.now() - 3 * 864e5).toISOString() });`,
  car_no_dup:              `const ps = state.data.profiles.filter(x => !x.blocked); ps[0].car_no = 7; ps[1].car_no = 7;`,
  car_no_vehicle_mismatch: `const v = (state.data.vehicles || []).find(x => x.driver_id); state.data.profiles.find(x => x.id === v.driver_id).car_no = (v.car_no || 0) + 50;`,
  cx_no_owner:             `state.data.complexes.push({ id: uid(), name: 'Orphan CX', abbr: 'ORP', counterparty_id: null });`,
  stock_negative:          `const et = state.data.equipment_types[0]; state.data.equip_moves = (state.data.equip_moves || []).concat([{ id: uid(), kind: 'take', equipment_type_id: et.id, qty: 99999, from_loc: 'stock', to_loc: 'car', tech_id: state.user.id, at: new Date().toISOString() }]);`,
};

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1300, height: 800 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user && typeof invariantsRun === 'function', null, { timeout: 20000 }); await p.waitForTimeout(700);

  /* 1) чистые данные */
  const clean = await p.evaluate(async () => { window.__snap = JSON.stringify(state.data); const r = await invariantsRun();
    return { rules: r.rules, errs: r.res.filter(x => x.rule.sev === 'err' && x.list.length).map(x => x.rule.id + ':' + x.list.length),
             warns: r.res.filter(x => x.rule.sev === 'warn' && x.list.length).map(x => x.rule.id + ':' + x.list.length), broken: r.res.filter(x => x.error).map(x => x.rule.id + ': ' + x.error),
             ids: r.res.map(x => x.rule.id) }; });
  t(`чистые демо-данные: ошибок логики 0 (правил ${clean.rules})`, clean.errs.length === 0, clean.errs);
  t('ни одно правило не падает с исключением', clean.broken.length === 0, clean.broken);

  /* 2) мутации */
  const res = [];
  for (const id of clean.ids){
    const code = MUT[id];
    if (!code){ res.push({ id, caught: false, noMut: true }); continue; }
    const r = await p.evaluate(async ({ id, code }) => {
      state.data = JSON.parse(window.__snap);
      const j = liveJobs().find(x => (x.status || 'draft') !== 'approved' && state.data.placements.some(pl => pl.job_id === x.id && pkPending(pl))) || liveJobs()[0];
      const p = state.data.placements.find(pl => pl.job_id === j.id && pkPending(pl)) || state.data.placements.find(pkPending);
      try{ (new Function('j', 'p', code))(j, p); }catch(e){ return { id, mutErr: String(e) }; }
      const r = await invariantsRun();
      const hit = r.res.find(x => x.rule.id === id);
      const noise = r.res.filter(x => x.rule.id !== id && x.list.length && x.rule.sev === 'err').map(x => x.rule.id);
      return { id, caught: !!(hit && hit.list.length), skipped: hit && hit.skipped, noise };
    }, { id, code });
    res.push(r);
  }
  await p.evaluate(() => { state.data = JSON.parse(window.__snap); });
  const caught = res.filter(x => x.caught).length, total = clean.ids.length;
  res.filter(x => !x.caught).forEach(x => t(`мутация «${x.id}» поймана своим правилом`, false, x));
  t(`мутации: поймано ${caught} из ${total} правил (${Math.round(caught / total * 100)} %)`, caught === total);
  const unknown = Object.keys(MUT).filter(k => !clean.ids.includes(k));
  t('у каждой мутации есть правило (нет «мёртвых» мутаций)', unknown.length === 0, unknown);

  /* 3) диагностика на здоровом демо */
  /* service worker в этом браузере выключен самим тестом (serviceWorkers: 'block') — строка про него зависит от окружения, не от логики */
  const ENV_ONLY = [/^⛔ service worker:/];
  const diag = await p.evaluate(async () => { const L = []; await runDiagnostics(l => L.push(String(l))); return { all: L, logic: L.filter(l => /правил|логика данных/.test(l)) }; });
  diag.bad = diag.all.filter(l => /^⛔/.test(l) && !ENV_ONLY.some(re => re.test(l))); diag.warn = diag.all.filter(l => /^⚠/.test(l));
  t('диагностика на здоровом демо: ни одной «⛔» (ложных тревог нет)', diag.bad.length === 0, diag.bad);
  t('в диагностике есть раздел «логика данных» с итогом по правилам', diag.logic.some(l => /— логика данных \(правил \d+\) —/.test(l)) && diag.logic.some(l => /✅ без нарушений: \d+ из \d+ правил/.test(l)), diag.logic);
  const metricLog = await p.evaluate(() => (typeof DIAG !== 'undefined' ? DIAG : []).filter(s => /метрики·логика/.test(s)).slice(-1)[0] || '');
  t('в журнале — строка «метрики·логика»', /метрики·логика: правил \d+ · ошибок \d+/.test(metricLog), metricLog);

  const metrics = { at: new Date().toISOString(), rules: total, caught, catch_rate: +(caught / total).toFixed(3),
    clean_errors: clean.errs.length, clean_warnings: clean.warns, noise: res.filter(x => x.noise && x.noise.length).map(x => ({ id: x.id, also: x.noise })),
    diag_false_alarms: diag.bad.length, diag_warnings: diag.warn.length };
  try{ fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'metrics-invariants.json'), JSON.stringify(metrics, null, 2)); }catch(e){}
  console.log('\nМЕТРИКИ ЛОГИКИ: правил ' + total + ' · поймано мутаций ' + caught + '/' + total + ' · ложных ошибок на чистых данных ' + clean.errs.length +
    ' · предупреждений на чистых данных ' + clean.warns.length + ' · ложных «⛔» в диагностике ' + diag.bad.length + ' · мутаций с посторонними ошибками ' + metrics.noise.length);
  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
