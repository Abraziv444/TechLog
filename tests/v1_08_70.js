/* v1.08.70 — перемешивание вариантов ответов: галочка админа (по умолчанию
   включена), комбо-пункты «верны 1 и 3» / «все» / «ни один» превращаются в
   «отметьте все верные», номера 1…N, проверка набора, разбор сессии в том же
   виде; без галочки — исходный порядок с комбо-пунктами.
   Запуск: node tests/v1_08_70.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8162;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
const COMBO = /верны вариант|все (перечисленные |приведённые |приведенные )?(выше )?вариант|ни один из|all of the above|none of the above|both \d/i;
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 414, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);
  const run = () => p.evaluate(() => JSON.parse(localStorage.getItem('techlog_study_run') || 'null'));
  const shown = () => p.evaluate(() => [...document.querySelectorAll('.st-opt')].map(b => ({ no: b.querySelector('.st-opt-id').textContent.trim(), txt: b.querySelector('.grow').textContent.trim(), on: b.classList.contains('on'), ok: b.classList.contains('ok'), bad: b.classList.contains('bad') })));

  console.log('— галочка админа —');
  {
    await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (!f.study) window.App.foldToggle('study'); }); await p.waitForTimeout(500);
    const chk = await p.evaluate(() => { const i = document.querySelector('input[onchange*="study_shuffle"]'); return i ? { on: i.checked, txt: i.parentElement.textContent.trim() } : null; });
    t('в настройках учёбы есть галочка «Перемешивать варианты ответов», включена по умолчанию', chk && chk.on && /Перемешивать варианты/.test(chk.txt), JSON.stringify(chk));
  }

  console.log('— тест с перемешиванием (раздел 1) —');
  {
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(1500);
    await p.evaluate(() => window.App.studyStart('1')); await p.waitForTimeout(500);
    await p.evaluate(() => { window.App.studyStartOpt('count', 6, '1'); window.App.studyStartOpt('shuffle', false, '1'); window.App.closeModal(); window.App.studyBegin('1'); }); await p.waitForTimeout(600);
    let r = await run();
    const q0 = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_study_run')).order[0]);
    const quiz = await p.evaluate(async () => (await (await fetch('./dictionary/tests/section-1.json')).json()).questions);
    const qq = quiz[q0]; const v = r.view[qq.id];
    const s = await shown();
    t('у вопроса есть представление: комбо-пункты убраны, показаны только смысловые, номера 1…N', v && s.length === v.order.length && s.every((x, i) => x.no === String(i + 1)) && s.every(x => !COMBO.test(x.txt)) && qq.options.some(o => COMBO.test(o.text.ru)), JSON.stringify({ n: s.length, order: v && v.order, texts: s.map(x => x.txt.slice(0, 30)) }));
    t('подпись «верных может быть один или несколько — отметьте все»', await p.evaluate(() => /один или несколько/.test((document.querySelector('.st-multi') || {}).textContent || '')));
    t('порядок отличается от файла хотя бы у половины из 6 вопросов (перемешано)', (() => { let diff = 0; r.order.forEach(i => { const q = quiz[i], vv = r.view[q.id]; const plain = q.options.filter(o => !COMBO.test(o.text.ru)).map(o => o.id); if (vv && vv.order.slice(0, plain.length).join() !== plain.join()) diff++; }); return diff >= 3; })());
    /* мультивыбор: два пункта, потом верный набор */
    const ids = v.order;
    await p.evaluate(id => window.App.studyPick(id), ids[0]); await p.evaluate(id => window.App.studyPick(id), ids[1]); await p.waitForTimeout(200);
    const two = await shown();
    t('можно отметить два пункта одновременно (чекбоксы)', two.filter(x => x.on).length === 2);
    await p.evaluate(id => window.App.studyPick(id), ids[0]); await p.evaluate(id => window.App.studyPick(id), ids[1]);
    for (const id of v.correct) await p.evaluate(id => window.App.studyPick(id), id);
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyCheck()); await p.waitForTimeout(400);
    const vd = await p.evaluate(() => ({ cls: (document.querySelector('.st-verdict') || {}).className || '', ok: [...document.querySelectorAll('.st-opt.ok')].length }));
    t('верный набор (из представления) → «верно», верные пункты подсвечены', /\bok\b/.test(vd.cls) && vd.ok === v.correct.length, JSON.stringify(vd));
    r = await run();
    t('в ответе сохранено представление вопроса (порядок и верный набор) — для разбора', r.answers[qq.id] && r.answers[qq.id].ok && r.answers[qq.id].v && r.answers[qq.id].v.correct.join() === v.correct.join());
    /* второй вопрос — неверно: один лишний пункт */
    await p.evaluate(() => window.App.studyNext()); await p.waitForTimeout(400);
    r = await run(); const q1 = quiz[r.order[1]], v1 = r.view[q1.id];
    const wrong = v1.order.filter(id => !v1.correct.includes(id))[0];
    for (const id of v1.correct) await p.evaluate(id => window.App.studyPick(id), id);
    await p.evaluate(id => window.App.studyPick(id), wrong);
    await p.evaluate(() => window.App.studyCheck()); await p.waitForTimeout(400);
    const vd2 = await p.evaluate(() => ({ cls: (document.querySelector('.st-verdict') || {}).className || '', txt: (document.querySelector('.st-verdict') || {}).textContent || '' }));
    const nums = v1.correct.map(id => String(v1.order.indexOf(id) + 1));
    t('лишний пункт → «неверно», в вердикте номера верных по новой нумерации', /\bbad\b/.test(vd2.cls) && nums.every(n => new RegExp('(^|[^\\d])' + n + '([^\\d]|$)').test(vd2.txt.replace(/.*:/, ''))), JSON.stringify({ txt: vd2.txt.slice(0, 80), nums }));
    /* добиваем до конца (4 вопроса) — разбор */
    for (let k = 0; k < 4; k++){ await p.evaluate(() => window.App.studyNext()); await p.waitForTimeout(250); r = await run(); if (!r) break; const q = quiz[r.order[r.i]], vv = r.view[q.id]; await p.evaluate(id => window.App.studyPick(id), vv.correct[0]); await p.evaluate(() => window.App.studyCheck()); await p.waitForTimeout(250); }
    await p.evaluate(() => window.App.studyNext()); await p.waitForTimeout(900);
    t('тест завершён — окно результата', !!(await p.$('.st-ring')));
    const sess = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').study_sessions || []).find(s => s.kind === 'test'));
    await p.evaluate(id => window.App.studySessReview(id), sess.id); await p.waitForTimeout(600);
    const rv = await p.evaluate(() => [...document.querySelectorAll('.st-rv')].slice(0, 2).map(b => ({ nos: [...b.querySelectorAll('.st-opt-id')].map(e => e.textContent.trim()), txt: [...b.querySelectorAll('.st-rv-opt .grow')].map(e => e.textContent), ok: b.querySelectorAll('.st-rv-opt.ok').length })));
    t('разбор показывает вопрос в том же виде: номера 1…N, без комбо-пунктов, верные отмечены', rv.length === 2 && rv.every(x => x.nos.every((n, i) => n === String(i + 1)) && x.txt.every(s => !COMBO.test(s)) && x.ok >= 1), JSON.stringify(rv.map(x => x.nos)));
    await p.evaluate(() => window.App.closeModal());
  }

  console.log('— без галочки: исходный порядок —');
  {
    await p.evaluate(() => window.App.setOrgFlag('study_shuffle', false)); await p.waitForTimeout(400);
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(800);
    await p.evaluate(() => window.App.studyStart('1')); await p.waitForTimeout(400);
    await p.evaluate(() => { window.App.studyStartOpt('shuffle', false, '1'); window.App.closeModal(); window.App.studyBegin('1'); }); await p.waitForTimeout(500);
    const r = await run(); const s = await shown();
    const quiz = await p.evaluate(async () => (await (await fetch('./dictionary/tests/section-1.json')).json()).questions);
    const q = quiz[r.order[0]];
    t('представления нет, варианты как в файле (с комбо-пунктами), бейджи — исходные id', !r.view && s.length === q.options.length && s.every((x, i) => x.no === String(q.options[i].id)) && s.some(x => COMBO.test(x.txt)), JSON.stringify({ n: s.length, m: q.options.length }));
    await p.evaluate(() => window.App.studyDrop());
    await p.evaluate(() => window.App.setOrgFlag('study_shuffle', true));
  }

  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
