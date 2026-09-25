/* v1.09.49 — английские части справочников: вид задачи хранит «RU | EN» и не теряет половину при правке, пометки
   «нет EN» у вида задачи и чек-листа, «Перевести пустые EN» в чек-листе, «Перевести справочники» в Настройках,
   строка в Диагностике; двуязычные названия (доп. оборудование, размеры, товары, виды ТО) показываются на языке
   интерфейса. Перевод подменяется заглушкой (сеть закрыта). Запуск: node tests/v1_09_49.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && state.user, null, { timeout: 20000 }); await p.waitForTimeout(600);
  await p.evaluate(() => { window.trApi = async (s) => 'EN:' + s; window.trSleep = async () => {}; });   // перевод — заглушка

  const wt = await p.evaluate(async () => {
    const w = { id: uid(), name: 'Сушка', color: '#3b82f6', needs_aux: false, aux_ids: [], sort: 99,
      checklist: [{ id: 'c1', t: 'Снять плинтус', req: true }, { id: 'c2', t: 'Поставить осушитель | Place dehumidifier' }] };
    state.data.work_types.push(w);
    state.screen = 'dirs'; _dirTabInit = true; state.dirTab = 'worktypes'; render();
    const h = document.querySelector('#app').innerHTML;
    const marks = { name: /wt-no-en/.test(h), cl: /class="chip warn cl-no-en">1 /.test(h) };
    /* правка вида задачи: RU и EN — отдельные поля, при сохранении обе половины на месте */
    editWtModal(w.id); document.getElementById('wt-name-en').value = 'Drying'; await saveWt(w.id, 99);
    const n1 = wtById(w.id).name;
    editWtModal(w.id); const ru = document.getElementById('wt-name').value, en = document.getElementById('wt-name-en').value; await saveWt(w.id, 99);
    const n2 = wtById(w.id).name;
    return { marks, n1, n2, ru, en };
  });
  t('список видов задач: пометки «нет EN» у названия и у чек-листа (1 пункт без EN)', wt.marks.name && wt.marks.cl, wt.marks);
  t('вид задачи: RU и EN — отдельные поля, сохраняется «Сушка | Drying»', wt.n1 === 'Сушка | Drying' && wt.ru === 'Сушка' && wt.en === 'Drying', wt);
  t('повторное сохранение без правки не теряет английскую половину (раньше пропадала)', wt.n2 === 'Сушка | Drying', wt.n2);

  const cl = await p.evaluate(async () => {
    const w = state.data.work_types.find(x => x.name.startsWith('Сушка'));
    wtChecklistModal(w.id); await clEdTranslate();
    const ens = [...document.querySelectorAll('#cl-ed .cl-en')].map(x => x.value);
    await wtChecklistSave(w.id);
    return { ens, saved: clItems(wtById(w.id)).map(i => i.t) };
  });
  t('чек-лист: «Перевести пустые EN» заполнил только пустую строку', cl.ens[0] === 'EN:Снять плинтус' && cl.ens[1] === 'Place dehumidifier', cl.ens);
  t('после сохранения пункты хранятся как «RU | EN»', cl.saved[0] === 'Снять плинтус | EN:Снять плинтус', cl.saved);

  const dtr = await p.evaluate(async () => {
    state.data.work_types.push({ id: uid(), name: 'Озонирование', color: '#999', sort: 100, checklist: ['Закрыть окна', 'Включить озонатор | Turn on ozone'] });
    const before = dirTrMissing();
    const diag = []; await runDiagnostics(l => diag.push(String(l)));
    _foldForce = true; state.screen = 'settings'; render(); const card = !!document.getElementById('dtr-btn'); _foldForce = false;
    await dirTranslate();
    const after = dirTrMissing(); const oz = state.data.work_types.find(x => /^Озонирование/.test(x.name));
    return { before: { n: before.names.length, c: before.items }, after: after.total, card, name: oz.name, items: clItems(oz).map(i => i.t),
      diagLine: diag.find(l => /справочники без английского/.test(l)) || '' };
  });
  t('Настройки → Переводы: «Перевести справочники» есть, пока в справочниках есть пустые EN', dtr.card && dtr.before.n >= 1 && dtr.before.c >= 1, dtr);
  t('Диагностика: строка «справочники без английского» с подсказкой, где перевести', /⚠ справочники без английского: названий видов задач \d+, пунктов чек-листов \d+/.test(dtr.diagLine), dtr.diagLine);
  t('«Перевести справочники» перевёл названия и пункты, готовые EN не тронул', dtr.after === 0 && dtr.name === 'Озонирование | EN:Озонирование' && dtr.items[0] === 'Закрыть окна | EN:Закрыть окна' && dtr.items[1] === 'Включить озонатор | Turn on ozone', dtr);

  const en = await p.evaluate(async () => { state.lang = 'en'; state.screen = 'dirs'; state.dirTab = 'aux'; render(); const aux = document.querySelector('#app').innerText;
    state.dirTab = 'sizes'; render(); const sz = document.querySelector('#app').innerText; state.lang = 'ru'; render();
    return { cyrAux: /[А-Яа-я]/.test(aux), cyrSz: /[А-Яа-я]/.test(sz) }; });
  t('английский интерфейс: доп. оборудование и размеры — английской половиной названия', !en.cyrAux && !en.cyrSz, en);

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
