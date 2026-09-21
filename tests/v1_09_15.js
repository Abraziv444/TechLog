/* v1.09.15 — бухгалтерия: оплаты по документам и долги по срокам. Демо-режим (локальный журнал оплат).
   Проверяется: вкладка «Оплаты и долги», блок «Оплаты» в строке реестра, частичная и полная оплата,
   авто-отметка «оплачен», чипы, срок Net N и просрочка, корзины по контрагентам, «поступило за период»,
   удаление оплаты, доступ только админу и бухгалтеру, SQL. Запуск: node tests/v1_09_15.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8915;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 320) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_15.sql'), 'utf8');
  t('SQL: acc_payments — только админ и бухгалтер, сумма > 0, правки нет, включает 1.09.14',
    sql.includes('create table if not exists public.acc_payments') && sql.includes("check (amount > 0)") && (sql.match(/public\.my_role\(\) in \('admin','accountant'\)/g) || []).length >= 3
    && sql.includes('revoke update on public.acc_payments from authenticated, anon') && sql.includes('doc_share_send'));
  t('разбор для бухгалтера лежит в сборке', fs.existsSync(path.join(ROOT, 'TZ-accounting.md')));
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const o of [{ w: 1400, h: 1000, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
    p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
    await p.evaluate(mode => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', mode); }, o.mode);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1600);
    /* два выставленных документа: старый (просрочен) и свежий */
    const prep = await p.evaluate(() => { const j = state.data.jobs; const today = todayISO();
      j[0].status = 'done'; j[0].date = addDaysISO(today, -75); j[1].status = 'done'; j[1].date = addDaysISO(today, -5);
      j[1].form_data = Object.assign(emptyFormData(), j[1].form_data || {}); j[1].form_data.steam = { on: true, deep_scrub: true, rotovac: false, portable: false, rooms: 2 };
      j[1].total = calcTotal(j[1].form_data, priceResolver(j[1].counterparty_id)); j[1].approved_total = null;
      state.data.acc_payments = []; const f = accF(); f.from = addDaysISO(today, -120); f.to = today; f.st = 'all'; f.ast = 'all';
      App.go('acc'); const r0 = accDocRow('job', j[0]), r1 = accDocRow('job', j[1]);
      return { id0: j[0].id, id1: j[1].id, t0: r0.total, t1: r1.total, age0: r0.age, age1: r1.age, due0: r0.due }; });
    await p.waitForTimeout(500);
    t('срок Net 30: документ 75-дневной давности просрочен на 45 дн., свежий — нет', prep.age0 === 45 && prep.age1 === 0 && prep.t0 > 0 && prep.due0 === prep.t0, prep);
    t('вкладка «Оплаты и долги» есть у админа', await p.evaluate(() => [...document.querySelectorAll('.acc-nav .tabbtn')].some(b => /Оплаты и долги/.test(b.textContent))));
    await p.evaluate(id => App.accOpen(id), prep.id0); await p.waitForTimeout(400);
    const box = await p.evaluate(id => { const b = document.getElementById('ap-' + id); if (!b) return null; const r = b.getBoundingClientRect();
      return { amount: document.getElementById('ap-' + id + '-a').value, fit: r.right <= innerWidth + 1 && r.left >= -1, over: /просрочено 45/.test(b.textContent) }; }, prep.id0);
    t('в строке реестра блок «Оплаты»: сумма подставлена = остаток, просрочка видна, блок в границах экрана', box && box.fit && box.over && Math.abs(parseFloat(box.amount) - prep.t0) < 0.01, box);
    /* частичная оплата */
    const half = Math.round(prep.t0 / 2 * 100) / 100;
    await p.fill(`#ap-${prep.id0}-a`, String(half)); await p.fill(`#ap-${prep.id0}-r`, '10452'); await p.evaluate(id => App.apAdd('job', id), prep.id0); await p.waitForTimeout(600);
    const s1 = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id), r = accDocRow('job', j); const row = document.querySelector(`.acc-row[data-id="${id}"]`);
      return { paid: r.paid, due: r.due, st: j.acc_status || '', chip: row ? (row.querySelector('.ap-chip') || {}).textContent : null, lines: document.querySelectorAll(`#ap-${id} .ap-line`).length,
        log: (state.data.audit_log || []).some(a => a.action === 'acc_pay_add') }; }, prep.id0);
    t('частичная оплата: остаток пересчитан, отметка «оплачен» НЕ ставится, чип «N / M», запись в журнале', Math.abs(s1.paid - half) < 0.01 && Math.abs(s1.due - (prep.t0 - half)) < 0.011 && s1.st !== 'paid' && /\//.test(s1.chip || '') && s1.lines === 1 && s1.log, s1);
    /* доплата до конца */
    await p.evaluate(id => App.apAdd('job', id), prep.id0); await p.waitForTimeout(700);
    const s2 = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id), r = accDocRow('job', j); return { due: r.due, st: j.acc_status, n: r.payN, age: r.age }; }, prep.id0);
    t('доплата остатка: долг 0, отметка «оплачен» поставилась сама, просрочки больше нет', s2.due === 0 && s2.st === 'paid' && s2.n === 2 && s2.age === 0, s2);
    /* неверные суммы */
    await p.evaluate(id => App.accOpen(id), prep.id1); await p.waitForTimeout(300);
    await p.fill(`#ap-${prep.id1}-a`, '0'); await p.evaluate(id => App.apAdd('job', id), prep.id1); await p.waitForTimeout(300);
    t('нулевая сумма не записывается', await p.evaluate(id => apFor('job', id).length === 0, prep.id1));
    /* вкладка долгов */
    await p.evaluate(() => App.accTab('ar')); await p.waitForTimeout(500);
    const ar = await p.evaluate(({ id1, t1, t0 }) => { const due = document.getElementById('ap-k-due').textContent, got = document.getElementById('ap-k-got').textContent;
      const tbl = document.getElementById('ap-tbl'), wrap = tbl.parentElement.getBoundingClientRect();
      return { due, got, wantDue: money(t1), wantGot: money(t0), rows: tbl.querySelectorAll('tbody tr').length, docs: document.querySelectorAll('#ap-docs .ap-doc').length, fit: wrap.right <= innerWidth + 1 }; }, prep);
    t('«Нам должны» = неоплаченный документ, «Поступило за период» = обе оплаты; таблица по контрагентам и список документов', ar.due === ar.wantDue && ar.got === ar.wantGot && ar.rows >= 1 && ar.docs === 1 && ar.fit, ar);
    await p.click('#ap-docs .ap-doc'); await p.waitForTimeout(600);
    t('нажатие на должника открывает его документ в реестре', await p.evaluate(id => accF().tab === 'reg' && !!document.getElementById('ap-' + id), prep.id1));
    /* удаление оплаты возвращает долг */
    const pid = await p.evaluate(id => apFor('job', id)[0].id, prep.id0);
    await p.evaluate(id => { App.apDel(id); }, pid); await p.waitForTimeout(400);
    const askTxt = await p.evaluate(() => { const b = document.getElementById('ask-ok'); const s = b ? b.textContent.trim() : ''; if (b) b.click(); return s; }); await p.waitForTimeout(600);
    t('вопрос перед удалением: красная кнопка «Удалить»', /удалить/i.test(askTxt), askTxt);
    const s3 = await p.evaluate(id => { const r = accDocRow('job', state.data.jobs.find(x => x.id === id)); return { n: r.payN, due: r.due, log: (state.data.audit_log || []).some(a => a.action === 'acc_pay_del') }; }, prep.id0);
    t('удаление оплаты (через вопрос) возвращает долг и пишется в журнал', s3.n === 1 && s3.due > 0 && s3.log, s3);
    /* срок оплаты настраивается */
    t('срок Net N берётся из настройки', await p.evaluate(() => { state.data.acc_settings = (state.data.acc_settings || []).filter(r => r.id !== 'opt:terms').concat([{ id: 'opt:terms', val: '60' }]); return apTerms() === 60; }));
    await ctx.close();
  }
  { console.log('— сотрудник —');
    const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-tech'); localStorage.setItem('techlog_view_mode', 'desktop'); });
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1500);
    t('сотруднику оплаты недоступны: блока нет, запись не проходит', await p.evaluate(async () => { const j = state.data.jobs[0]; const html = apBlockHtml(accDocRow('job', j)); await App.apAdd('job', j.id); return html === '' && apFor('job', j.id).length === 0; }));
    await ctx.close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
