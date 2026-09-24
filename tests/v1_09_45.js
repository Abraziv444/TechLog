/* v1.09.45 — диагностика «номер документа»: черновик без номера — норма (номер выдаётся при первой отправке на согласование,
   с 1.09.25), ошибка — только отправленный документ без номера или нет колонки jobs.no. Запуск: node tests/v1_09_45.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 600) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1300, height: 800 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(600);
  const r = await p.evaluate(async () => {
    liveJobs().forEach((j, i) => { j.no = i + 1; });
    const cx = state.data.complexes[0];
    const mk = (u, st) => { const j = { id: uid(), date: todayISO(), technician_id: state.user.id, helper_ids: [], counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: u, status: st, no: null, form_data: emptyFormData(), created_at: new Date().toISOString() }; state.data.jobs.push(j); return j; };
    mk('D1', 'draft'); mk('D2', 'draft');
    const lines = []; await runDiagnostics(l => lines.push(String(l)));
    const a = lines.filter(l => /номер/.test(l) && /(черновик|согласован|jobs\.no)/.test(l));
    mk('S9', 'done');
    const lines2 = []; await runDiagnostics(l => lines2.push(String(l)));
    const b = lines2.filter(l => /номер/.test(l) && /(черновик|согласован|jobs\.no)/.test(l));
    return { a, b, vers: APP_VERSION };
  });
  t('черновики без номера — норма (✅), без призыва выполнить SQL', r.a.some(l => /^✅ черновиков без номера: 2/.test(l)) && r.a.some(l => /^✅ задач без номера после отправки на согласование: 0/.test(l)) && !r.a.some(l => /выполните/.test(l)), r.a);
  t('отправленный документ без номера — ⛔ с указанием, какой именно', r.b.some(l => /^⛔ задач без номера после отправки на согласование: 1 .*Unit S9/.test(l)), r.b);
  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
