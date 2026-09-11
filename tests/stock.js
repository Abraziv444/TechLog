/* TechLog · tests/stock.js — склад: регистр оборудования (v1.08.29)
   Демо-режим: серверного триггера нет, движения аренды зеркалит
   demoPlMoves — тест проверяет и его, и экран «Склад»: большие кнопки
   «Взять/Сдать» с минивеном, окно операции («всё · N», источник ремонта),
   авто-добор при аренде, «забрал»/«вернул», правку количества, бумажные
   продления, справку-схему и права техника.
   Запуск: node tests/stock.js [порт]   (сервер поднят отдельно) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || '8811';
const ok = [], bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name);
  console.log((cond ? '  [ok] ' : '  [ ! ] ') + name + (extra !== undefined && !cond ? ' → ' + extra : ''));
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.PW_CHROME
    || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const x = m.text();
    if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED|403/.test(x)) errs.push('C: ' + x.slice(0, 160)); });
  for (const u of ['**://cdn.jsdelivr.net/**', '**://cdnjs.cloudflare.com/**',
                   '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**'])
    await p.route(u, r => r.abort());
  p.on('dialog', d => d.accept());

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1100);

  // ------------------------------------------------ чистый регистр + аренда
  console.log('\n== посадка: начальный ввод и аренда с авто-добором ==');
  const seed = await p.evaluate(async () => {
    const et = state.data.equipment_types[0], et2 = state.data.equipment_types[1];
    const me = state.user.id;
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const job = state.data.jobs[0];
    state.data.placements = [];
    state.data.equip_moves = [
      { id: 'i1', kind: 'init', equipment_type_id: et.id, qty: 12, from_loc: 'ext', to_loc: 'stock' },
      { id: 'i2', kind: 'init', equipment_type_id: et.id, qty: 1, from_loc: 'ext', to_loc: 'repair' },
      { id: 'i3', kind: 'init', equipment_type_id: et2.id, qty: 5, from_loc: 'ext', to_loc: 'stock' },
    ];
    saveLocal(); render();
    /* аренда через штатный dbUpsert — демо-зеркало должно провести
       «машина → объект» с авто-добором со склада */
    await dbUpsert('placements', { id: 'q1', job_id: job.id, equipment_type_id: et.id, qty: 4, days: 3,
      placed_date: day(0), due_date: day(3), picked_up: false, superseded: false, technician_id: me,
      complex_id: job.complex_id, counterparty_id: job.counterparty_id, unit_number: job.unit_number });
    render();
    return { et: et.id, et2: et2.id, ab: et.abbr, ab2: et2.abbr, me,
             free: stockRow(et.id).free, rented: stockRow(et.id).rented,
             moves: state.data.equip_moves.filter(m => m.placement_id === 'q1').map(m => m.kind).sort() };
  });
  check('авто-добор: свободно 12 − 4', seed.free === 8, seed.free);
  check('аренда видна в остатках', seed.rented === 4, seed.rented);
  check('зеркало провело добор и постановку', seed.moves.join('+') === 'place+take', seed.moves.join('+'));

  // ------------------------------------------------ экран «Склад»
  console.log('\n== экран «Склад»: большие кнопки и наличие ==');
  await p.locator('.tabbar .tab:has-text("Склад")').click();
  await p.waitForTimeout(500);
  check('большие кнопки с минивеном', await p.locator('.eq-bigrow .eq-big .eq-van').count() === 2);
  check('подписи направлений', await p.evaluate(() => {
    const t2 = document.body.innerText.toLowerCase();
    return t2.includes('со склада → в машину') && t2.includes('из машины → на склад'); }));
  check('счётчик «на складе» на кнопке', await p.evaluate(() => /на складе: 13/i.test(document.body.innerText)));
  check('таблица наличия по типам', await p.locator('.eq-cols').count() >= 2);
  check('карточка «в ремонте» = 1', await p.evaluate(() => {
    const c = document.querySelector('.sb-card.sb-repair .sb-n'); return c && c.textContent.trim() === '1'; }));

  // ------------------------------------------------ взять: чипы типов, «всё», степпер
  console.log('\n== операция «Взять» ==');
  await p.locator('.eq-bigrow .eq-big', { hasText: 'Взять' }).click();
  await p.waitForTimeout(350);
  check('окно открылось с чипами типов', await p.locator('#overlay .eq-et').count() >= 2);
  await p.locator('#overlay .eq-et', { hasText: seed.ab2 }).click();      // второй тип
  await p.waitForTimeout(250);
  check('лимит по второму типу («всё · 5»)', await p.evaluate(() => /всё · 5/.test(document.querySelector('#overlay').innerText)));
  await p.locator('#overlay button', { hasText: 'всё · 5' }).click();
  await p.waitForTimeout(250);
  await p.locator('#overlay .stepper button[aria-label="−"]').click();    // 5 → 4
  await p.waitForTimeout(200);
  check('степпер уменьшил до 4', await p.evaluate(() => document.querySelector('#overlay .stepper .val').textContent.trim() === '4'));
  await p.locator('#overlay .btn-green', { hasText: 'Сохранить' }).click();
  await p.waitForTimeout(400);
  const afterTake = await p.evaluate(x => ({ my: myCarQty(x.et2), free: emRow(x.et2).stock }), seed);
  check('взято 4 второго типа в мою машину', afterTake.my === 4, JSON.stringify(afterTake));
  check('склад второго типа опустел до 1', afterTake.free === 1, afterTake.free);
  check('чип «в машине» на экране', await p.evaluate(x => new RegExp(x.ab2 + ' × 4').test(document.body.innerText), seed));

  // ------------------------------------------------ сдать всё
  console.log('\n== операция «Сдать» ==');
  await p.locator('.eq-bigrow .eq-big', { hasText: 'Сдать' }).click();
  await p.waitForTimeout(350);
  await p.locator('#overlay .eq-et', { hasText: seed.ab2 }).click();
  await p.waitForTimeout(250);
  await p.locator('#overlay button', { hasText: 'всё · 4' }).click();
  await p.waitForTimeout(200);
  await p.locator('#overlay .btn-green', { hasText: 'Сохранить' }).click();
  await p.waitForTimeout(400);
  check('машина пуста после «сдать всё»', await p.evaluate(x => myCarQty(x.et2) === 0, seed));

  // ------------------------------------------------ ремонт туда и обратно
  console.log('\n== ремонт ==');
  await p.locator('.eq-btns .btn', { hasText: 'В ремонт' }).click();
  await p.waitForTimeout(350);
  check('переключатель источника есть', await p.evaluate(() => /со склада/.test(document.querySelector('#overlay').innerText)));
  await p.locator('#overlay .eq-et', { hasText: seed.ab }).click();       // тип 1 явно
  await p.waitForTimeout(250);
  await p.locator('#overlay .btn-green', { hasText: 'Сохранить' }).click();   // 1 со склада, тип 1
  await p.waitForTimeout(400);
  check('в ремонте стало 2', await p.evaluate(x => emRow(x.et).repair === 2, seed));
  await p.locator('.eq-btns .btn', { hasText: 'Из ремонта' }).click();
  await p.waitForTimeout(350);
  await p.locator('#overlay .eq-et', { hasText: seed.ab }).click();
  await p.waitForTimeout(250);
  await p.locator('#overlay button', { hasText: 'всё · 2' }).click();
  await p.waitForTimeout(200);
  await p.locator('#overlay .btn-green', { hasText: 'Сохранить' }).click();
  await p.waitForTimeout(400);
  check('ремонт опустел, всё на складе', await p.evaluate(x =>
    emRow(x.et).repair === 0 && emRow(x.et).stock === 9, seed));

  // ------------------------------------------------ админ: поступление и списание
  console.log('\n== поступление и списание (админ) ==');
  await p.locator('.eq-btns .btn', { hasText: 'Поступление' }).click();
  await p.waitForTimeout(350);
  await p.locator('#overlay .eq-et', { hasText: seed.ab }).click();
  await p.waitForTimeout(250);
  await p.evaluate(() => { const el = document.getElementById('eq-note'); if (el) el.value = 'закупка-тест'; });
  for (let i = 0; i < 2; i++) await p.locator('#overlay .stepper button[aria-label="+"]').click(); // 3
  await p.waitForTimeout(200);
  await p.locator('#overlay .btn-green', { hasText: 'Сохранить' }).click();
  await p.waitForTimeout(400);
  check('поступление 3 легло на склад', await p.evaluate(x => emRow(x.et).stock === 12, seed));
  check('комментарий сохранился в движении', await p.evaluate(() =>
    state.data.equip_moves.some(m => m.kind === 'intake' && m.note === 'закупка-тест')));
  await p.locator('.eq-btns .btn', { hasText: 'Списание' }).click();
  await p.waitForTimeout(350);
  await p.locator('#overlay .eq-et', { hasText: seed.ab }).click();
  await p.waitForTimeout(250);
  await p.locator('#overlay .btn-green', { hasText: 'Сохранить' }).click();
  await p.waitForTimeout(400);
  check('списание 1 со склада', await p.evaluate(x => emRow(x.et).stock === 11, seed));

  // ------------------------------------------------ забрал → вернуть всё → отмена
  console.log('\n== «забрал» и «вернуть всё на склад» ==');
  await p.evaluate(async () => {
    const q = state.data.placements.find(x => x.id === 'q1');
    await dbUpsert('placements', { ...q, picked_up: true, picked_up_at: new Date().toISOString(), picked_up_by: state.user.id });
    render();
  });
  await p.waitForTimeout(300);
  check('после «забрал» аренда ушла из остатков', await p.evaluate(x => stockRow(x.et).rented === 0, seed));
  check('4 единицы в моей машине', await p.evaluate(x => myCarQty(x.et) === 4, seed));
  check('кнопка «Вернуть всё на склад · 4»', await p.locator('button:has-text("Вернуть всё на склад")').count() === 1);
  await p.locator('button:has-text("Вернуть всё на склад")').click();   // confirm авто-принят
  await p.waitForTimeout(500);
  const afterRet = await p.evaluate(x => ({ my: myCarQty(x.et), free: emRow(x.et).stock }), seed);
  check('вернул всё: машина пуста, склад 15', afterRet.my === 0 && afterRet.free === 15, JSON.stringify(afterRet));
  await p.evaluate(async () => {   // отмена вывоза — «снова в аренде»
    const q = state.data.placements.find(x => x.id === 'q1');
    await dbUpsert('placements', { ...q, picked_up: false, picked_up_at: null, picked_up_by: null,
      returned_at: null, returned_by: null });
    render();
  });
  await p.waitForTimeout(300);
  check('отмена вывоза вернула аренду и цифры', await p.evaluate(x =>
    stockRow(x.et).rented === 4 && emRow(x.et).stock === 11 && myCarQty(x.et) === 0, seed));

  // ------------------------------------------------ правка количества в форме
  console.log('\n== правка количества аренды ==');
  await p.evaluate(async () => {
    const q = state.data.placements.find(x => x.id === 'q1');
    await dbUpsert('placements', { ...q, qty: 6 }); render();
  });
  await p.waitForTimeout(250);
  check('qty 4→6: авто-добор со склада', await p.evaluate(x => emRow(x.et).stock === 9, seed));
  await p.evaluate(async () => {
    const q = state.data.placements.find(x => x.id === 'q1');
    await dbUpsert('placements', { ...q, qty: 4 }); render();
  });
  await p.waitForTimeout(250);
  check('qty 6→4: две единицы в машину', await p.evaluate(x => myCarQty(x.et) === 2, seed));

  // ------------------------------------------------ частичное продление — бумажное
  console.log('\n== продление — бумажный перенос ==');
  const extRes = await p.evaluate(async x => {
    const before = JSON.stringify([emRow(x.et).stock, myCarQty(x.et)]);
    const q = state.data.placements.find(p2 => p2.id === 'q1');
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    await dbUpsert('placements', { ...q, id: 'q1ext', qty: 1, days: 2, placed_date: q.due_date,
      due_date: day(5), ext_of: 'q1', picked_up: false, picked_up_at: null, picked_up_by: null });
    await dbUpsert('placements', { ...q, qty: (+q.qty || 1) - 1 });
    render();
    return { before, after: JSON.stringify([emRow(x.et).stock, myCarQty(x.et)]),
             extMoves: state.data.equip_moves.filter(m => m.placement_id === 'q1ext').length };
  }, seed);
  check('продление не создало движений', extRes.extMoves === 0, extRes.extMoves);
  check('склад и машина не шелохнулись', extRes.before === extRes.after, extRes.after);

  // ------------------------------------------------ справка со схемой
  console.log('\n== справка «?» со схемой ==');
  await p.locator('.section-title .faq-i').first().click();
  await p.waitForTimeout(400);
  check('схема цепочки в справке', await p.locator('#overlay .faq-scheme').count() === 1);
  check('на схеме узлы Склад/Машина/Объект/Ремонт', await p.evaluate(() => {
    const t2 = document.querySelector('#overlay .faq-scheme').textContent;
    return ['Склад', 'Машина', 'Объект', 'Ремонт'].every(w => t2.includes(w)); }));
  await p.evaluate(() => App.closeModal());

  // ------------------------------------------------ права техника
  console.log('\n== экран техника ==');
  await p.evaluate(() => {
    state.user = state.data.profiles.find(u => u.role === 'tech') || state.user;
    render();
  });
  await p.waitForTimeout(400);
  check('у техника нет «Списания»', await p.evaluate(() => !/Списание/.test(document.body.innerText)));
  check('у техника нет «По машинам»', await p.evaluate(() => !/По машинам/.test(document.body.innerText)));
  check('большая «Взять» на месте', await p.locator('.eq-bigrow .eq-big:has-text("Взять")').count() === 1);

  // ------------------------------------------------ итог
  check('ошибок страницы нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok.length}, провалено ${bad.length}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
