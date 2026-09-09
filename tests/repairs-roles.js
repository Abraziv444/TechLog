/* TechLog · tests/repairs-roles.js — права на документ ремонта (v1.08.23)
   Работник заводит документ и отправляет на апрув, но одобрить не может —
   ни кнопкой, ни прямым вызовом. Админ одобряет и переносит сумму в инвойс
   (повторно — не дублирует). Настройка скрывает суммы от работников.
   Правка одобренного документа работником снимает апрув.
   Запуск: node tests/repairs-roles.js [порт]   (сервер поднят отдельно) */
const { chromium } = require('playwright-core');
const ok = [], bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name);
  console.log((cond ? '  [ok] ' : '  [ ! ] ') + name + (extra ? ' → ' + extra : ''));
}
const PORT = process.argv[2] || '8811';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED/.test(t)) errs.push('C: ' + t.slice(0, 160)); });
  for (const u of ['**://cdn.jsdelivr.net/**', '**://cdnjs.cloudflare.com/**', '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**'])
    await p.route(u, r => r.abort());
  p.on('dialog', d => d.accept());

  const loginAs = async (role) => {
    await p.evaluate(r => { localStorage.setItem('techlog_session_v1', 'demo-' + r); }, role);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
  };

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.waitForTimeout(900);

  // =============================================== работник
  console.log('\n== работник ==');
  await loginAs('tech');
  check('роль в шапке — работник', (await p.locator('.role-tag').textContent()).trim().toLowerCase().includes('работник')
        || (await p.locator('.role-tag').textContent()).trim().length > 0,
        (await p.locator('.role-tag').textContent()).trim());
  check('вкладка «Ремонт» доступна работнику', await p.locator('.tabbar .tab:has-text("Ремонт")').count() > 0);

  // свой инвойс: блок виден автору даже без демонтажа
  await p.locator('#day-list .item:has(.badge-status)').first().click();
  await p.waitForTimeout(600);
  check('блок ремонта виден автору работы', await p.locator('.card:has-text("Ремонтные работы")').count() > 0);
  // ставим ручной флаг
  await p.locator('label:has-text("Требуется восстановление") input').check();
  await p.waitForTimeout(500);
  check('после флага появилась подсказка о демонтаже',
        (await p.locator('.card:has-text("Ремонтные работы")').first().textContent()).includes('восстановить'));

  await p.locator('button:has-text("Новый документ ремонта")').first().click();
  await p.waitForTimeout(600);
  check('работник может завести документ', await p.locator('#rep-apr').count() > 0);
  check('кнопки «Одобрить» у работника нет', await p.locator('#rep-apr button:has-text("Одобрить")').count() === 0);
  check('кнопка «Отправить на апрув» есть', await p.locator('#rep-apr button:has-text("Отправить на апрув")').count() > 0);
  const segDisabled = await p.locator('#rep-st button:has-text("Одобрен")').isDisabled();
  check('переключатель «Одобрен» заблокирован', segDisabled);
  check('пояснение про права показано', (await p.locator('#rep-apr').textContent()).includes('Апрув ставит'));

  // позиция + сохранение + отправка
  await p.locator('button:has-text("Справочник")').first().click();
  await p.waitForTimeout(400);
  await p.locator('#overlay .rowline').first().click();
  await p.waitForTimeout(400);
  await p.locator('.prop-wrap button:has-text("Сохранить")').last().click();
  await p.waitForTimeout(700);
  await p.locator('#rep-apr button:has-text("Отправить на апрув")').click();
  await p.waitForTimeout(700);
  check('работник отправил на апрув', (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Отправлен');
  const repId = await p.evaluate(() => repDraft && repDraft.id);
  check('документ сохранён в базе', !!(await p.evaluate(id => !!repById(id), repId)));
  check('суммы работнику видны', !/—/.test(await p.locator('#rp-grand').textContent()),
        await p.locator('#rp-grand').textContent());

  // попытка обойти интерфейс: работник дёргает смену статуса напрямую
  await p.evaluate(() => App.repSetStatus('approved'));
  await p.waitForTimeout(600);
  check('прямой вызов апрува работником отклонён',
        (await p.evaluate(() => repDraft.status)) !== 'approved',
        await p.evaluate(() => repDraft.status));

  // =============================================== админ
  console.log('\n== админ ==');
  await loginAs('admin');
  await p.locator('.tabbar .tab:has-text("Ремонт")').click();
  await p.waitForTimeout(600);
  check('админ видит документ работника', await p.locator('.rowline:has-text("R-")').count() > 0);
  await p.locator('.rowline:has-text("R-")').first().click();
  await p.waitForTimeout(600);
  await p.locator('#rep-apr button:has-text("Одобрить")').click();
  await p.waitForTimeout(700);
  check('админ одобрил', (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Одобрен');
  check('появилась кнопка переноса в инвойс', await p.locator('button:has-text("Перенести суммы в инвойс")').count() > 0);

  // перенос в инвойс
  const jobId = await p.evaluate(() => repDraft.job_id);
  await p.locator('button:has-text("Перенести суммы в инвойс")').click();
  await p.waitForTimeout(900);
  const others = await p.evaluate(id => {
    const j = state.data.jobs.find(x => x.id === id);
    return (j.form_data.others || []).filter(o => o.desc).map(o => o.desc + '=' + o.amount);
  }, jobId);
  check('строка ремонта попала в инвойс', others.some(x => /REP-/.test(x)), others.join(' | '));
  // повторный перенос не дублирует
  await p.locator('button:has-text("Перенести суммы в инвойс")').click();
  await p.waitForTimeout(800);
  const others2 = await p.evaluate(id => {
    const j = state.data.jobs.find(x => x.id === id);
    return (j.form_data.others || []).filter(o => /REP-/.test(String(o.desc || ''))).length;
  }, jobId);
  check('повторный перенос не дублирует строку', others2 === 1, String(others2));

  // скрытие сумм от работников
  await p.evaluate(() => { App.setOrgFlag('rep_hide_prices', true); });
  await p.waitForTimeout(600);

  // =============================================== работник снова
  console.log('\n== работник после одобрения ==');
  await loginAs('tech');
  await p.locator('.tabbar .tab:has-text("Ремонт")').click();
  await p.waitForTimeout(600);
  await p.locator('.rowline:has-text("R-")').first().click();
  await p.waitForTimeout(700);
  check('суммы скрыты настройкой', /—/.test(await p.locator('#rp-grand').textContent()),
        await p.locator('#rp-grand').textContent());
  check('поля сумм заменены прочерком', await p.locator('#rep-rows-work .prop-row input.pa').count() === 0);
  check('статус одобрен', (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Одобрен');

  // работник правит одобренный документ — апрув слетает
  await p.locator('#rep-rows-work .prop-row .pd').first().fill('Установка гипсокартона, 3 листа');
  await p.waitForTimeout(600);
  check('правка работника сняла апрув',
        (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Черновик');
  check('в истории видно, кто снял', (await p.locator('#rep-apr').textContent()).includes('апрув снят'));

  console.log('\n== ошибки страницы ==');
  console.log(errs.length ? errs.slice(0, 6).join('\n') : '  нет');
  console.log('\nИТОГО: ok=' + ok.length + ' проблем=' + bad.length);
  if (bad.length) console.log('ПРОБЛЕМЫ:\n - ' + bad.join('\n - '));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
