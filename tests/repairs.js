/* TechLog · tests/repairs.js — документ ремонтных работ (v1.08.23)
   Сквозной сценарий администратора: блок в инвойсе → создание документа →
   подбор позиций из справочника → суммы → сохранение → апрув → правка
   одобренного снимает апрув → PDF → список, карточка дня, доска, цепочка.
   Запуск: node tests/repairs.js [порт]   (сервер поднят отдельно) */
const { chromium } = require('playwright-core');

const PORT = process.argv[2] || '8811';
const ok = [], bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? ' → ' + extra : ''));
  console.log((cond ? '  [ok] ' : '  [ ! ] ') + name + (extra ? ' → ' + extra : ''));
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 850 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED/.test(t)) errs.push('CONSOLE: ' + t.slice(0, 180)); });
  for (const u of ['**://cdn.jsdelivr.net/**', '**://cdnjs.cloudflare.com/**', '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**'])
    await p.route(u, r => r.abort());
  p.on('dialog', d => d.accept());

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.waitForTimeout(1000);
  await p.locator('.demo-user').first().click();          // Ivan, админ
  await p.waitForTimeout(600);

  // ---------------------------------------------------- 1. блок в инвойсе
  console.log('\n== инвойс ==');
  if (await p.locator('.filter-row .lang-seg button:has-text("Все")').count()) {
    await p.locator('.filter-row .lang-seg button:has-text("Все")').click();
    await p.waitForTimeout(400);
  }
  console.log('     карточек-работ:', await p.locator('#day-list .item:has(.badge-status)').count());
  await p.locator('#day-list .item:has(.badge-status)').first().click();
  await p.waitForTimeout(600);
  const repBox = p.locator('.card', { hasText: 'Ремонтные работы' }).first();
  check('блок «Ремонтные работы» в инвойсе', await repBox.count() > 0);
  check('кнопка «Новый документ ремонта»', await p.locator('button:has-text("Новый документ ремонта")').count() > 0);
  check('чекбокс «Требуется восстановление»', await p.locator('label:has-text("Требуется восстановление")').count() > 0);

  // ---------------------------------------------------- 2. создание документа
  console.log('\n== создание документа ==');
  await p.locator('button:has-text("Новый документ ремонта")').first().click();
  await p.waitForTimeout(600);
  const unit = await p.locator('.form-row:has(.lbl:text-is("Юнит №")) input').inputValue();
  const cpv = await p.locator('#cb-cp .combo-in').inputValue();
  check('юнит подставлен из работы', !!unit, 'unit=' + unit);
  check('контрагент подставлен', !!cpv, cpv);
  const crew = await p.locator('#rep-crew .chip-tech').count();
  check('бригада подставлена', crew > 0, crew + ' чел.');
  check('источник — «На основе работы»', (await p.locator('.prop-wrap .tiny').first().textContent()).includes('На основе работы'));

  // подсказки «?»
  const tips = await p.locator('.tl-tip').count();
  check('подсказки «?» на форме ремонта', tips >= 8, tips + ' значков');

  // ---------------------------------------------------- 3. справочник и суммы
  console.log('\n== работы, материалы, суммы ==');
  await p.locator('button:has-text("Справочник")').first().click();
  await p.waitForTimeout(400);
  const catRows = await p.locator('#overlay .rowline').count();
  const firstCat = await p.locator('#overlay .rowline b').first().textContent();
  check('справочник открылся', catRows > 0, catRows + ' позиций, первая: ' + firstCat);
  check('ремонтные позиции сверху', /гипсокартон/i.test(firstCat));
  await p.locator('#overlay .rowline').first().click();     // гипсокартон 85
  await p.waitForTimeout(400);
  await p.locator('button:has-text("Справочник")').first().click();
  await p.waitForTimeout(300);
  await p.locator('#overlay .rowline').nth(2).click();       // ванна 320
  await p.waitForTimeout(400);
  check('строк работ', await p.locator('#rep-rows-work .prop-row').count() === 2,
        (await p.locator('#rep-rows-work .prop-row').count()) + '');
  // материалы
  await p.locator('button:has-text("Справочник")').nth(1).click();
  await p.waitForTimeout(300);
  await p.locator('#overlay .rowline').first().click();
  await p.waitForTimeout(300);
  await p.locator('#rep-rows-mat .prop-row .pa').first().fill('42');
  await p.locator('#rep-rows-mat .prop-row .pd').first().fill('Гипсокартон 4х8');
  await p.waitForTimeout(300);
  const works = await p.locator('#rp-works').textContent();
  const mats = await p.locator('#rp-mats').textContent();
  const grand = await p.locator('#rp-grand').textContent();
  check('итоги считаются', /405/.test(works.replace(/\s/g, '')) && /42/.test(mats) && /447/.test(grand.replace(/\s/g, '')),
        works + ' + ' + mats + ' = ' + grand);

  // ---------------------------------------------------- 4. сохранение
  console.log('\n== сохранение ==');
  await p.locator('.prop-wrap button:has-text("Сохранить")').last().click();
  await p.waitForTimeout(700);
  const title = await p.locator('.db-t').textContent();
  check('номер документа присвоен', /REP|R-/.test(title), title.trim());

  // ---------------------------------------------------- 5. апрув
  console.log('\n== апрув ==');
  await p.locator('#rep-apr button:has-text("Отправить на апрув")').click();
  await p.waitForTimeout(500);
  check('статус «Отправлен»', (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Отправлен');
  await p.locator('#rep-apr button:has-text("Одобрить")').click();
  await p.waitForTimeout(600);
  check('статус «Одобрен»', (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Одобрен');
  check('предупреждение о снятии апрува', await p.locator('#rep-apr .banner').count() > 0);
  const hist1 = await p.locator('#rep-apr .tiny').allTextContents();
  check('история пишется', hist1.some(x => /одобрен/i.test(x)), hist1.filter(x => /·/.test(x)).slice(0, 3).join(' / '));

  // ---------------------------------------------------- 6. правка снимает апрув
  console.log('\n== правка одобренного ==');
  await p.locator('#rep-rows-work .prop-row .pa').first().fill('120');
  await p.waitForTimeout(500);
  const st2 = (await p.locator('#rep-apr .chip.pst').textContent()).trim();
  check('апрув снят правкой', st2 === 'Черновик', 'статус: ' + st2);
  const hist2 = await p.locator('#rep-apr .tiny').allTextContents();
  check('в истории есть «апрув снят»', hist2.some(x => /апрув снят/i.test(x)));
  const grand2 = await p.locator('#rp-grand').textContent();
  check('итог пересчитался', /482/.test(grand2.replace(/\s/g, '')), grand2);
  const focusId = await p.evaluate(() => document.activeElement && document.activeElement.className);
  check('фокус не потерян при снятии апрува', /pa/.test(focusId || ''), focusId);

  await p.screenshot({ path: '/tmp/tl-repairs-form.png', fullPage: false });

  // ---------------------------------------------------- 7. PDF (jsPDF замокан)
  console.log('\n== PDF ==');
  await p.evaluate(() => {
    const calls = { text: 0, rect: 0, pages: 1, name: '' };
    window.__pdf = calls;
    function Doc(){ }
    Doc.prototype.setFont = function(){}; Doc.prototype.setFontSize = function(){};
    Doc.prototype.setTextColor = function(){}; Doc.prototype.setFillColor = function(){};
    Doc.prototype.text = function(){ calls.text++; }; Doc.prototype.rect = function(){ calls.rect++; };
    Doc.prototype.line = function(){}; Doc.prototype.addPage = function(){ calls.pages++; };
    Doc.prototype.splitTextToSize = function(s){ return String(s).split('\n'); };
    Doc.prototype.save = function(n){ calls.name = n; };
    Doc.prototype.output = function(){ return new Blob(['x']); };
    window.jspdf = { jsPDF: Doc };
  });
  await p.locator('button:has-text("PDF ремонта")').click();
  await p.waitForTimeout(900);
  // модалка перевода может перехватить — соглашаемся «без перевода»
  if (await p.locator('button:has-text("Без перевода")').count()) {
    await p.locator('button:has-text("Без перевода")').click(); await p.waitForTimeout(700);
  } else if (await p.locator('#overlay button').count()) {
    const btns = await p.locator('#overlay button').allTextContents();
    console.log('     модалка перед PDF:', btns.join(' | '));
    await p.locator('#overlay button').last().click(); await p.waitForTimeout(700);
  }
  const pdf = await p.evaluate(() => window.__pdf);
  check('PDF собран', pdf && pdf.text > 20, pdf ? ('text=' + pdf.text + ' rect=' + pdf.rect + ' файл=' + pdf.name) : 'нет вызовов');

  // ---------------------------------------------------- 8. список, главная, доска
  console.log('\n== список / главная / доска ==');
  // выход из формы: правки не сохранены — приложение спросит
  await p.locator('.db-back').click();
  await p.waitForTimeout(500);
  if (await p.locator('#overlay button:has-text("Сохранить и закрыть")').count()) {
    check('спрошено про несохранённые правки', true);
    await p.locator('#overlay button:has-text("Сохранить и закрыть")').click();
    await p.waitForTimeout(700);
  }
  check('документ в списке', await p.locator('.rowline:has-text("R-")').count() > 0,
        (await p.locator('.rowline:has-text("R-")').first().textContent().catch(()=>'')).replace(/\s+/g,' ').trim());
  check('фильтр по статусу есть', await p.locator('.tabs .tabbtn:has-text("Черновик")').count() > 0);
  await p.locator('.tabbar .tab:has-text("Главная")').click();
  await p.waitForTimeout(600);
  check('чип R- на карточке дня', await p.locator('#day-list .chip.rep').count() > 0);
  check('кнопка ремонта на карточке дня', await p.locator('#day-list .item .btn').count() > 0);
  await p.locator('.tabbar .tab:has-text("Доска")').click();
  await p.waitForTimeout(700);
  check('полоса ремонта на доске', await p.locator('.strip-h:has-text("Ремонтные работы дня")').count() > 0);
  check('чип на карточке доски', await p.locator('.bjob .chip.rep').count() > 0);
  await p.screenshot({ path: '/tmp/tl-repairs-board.png' });

  // ---------------------------------------------------- 9. цепочка документов
  console.log('\n== цепочка ==');
  await p.locator('.tabbar .tab:has-text("Ремонт")').click();
  await p.waitForTimeout(500);
  await p.locator('.rowline:has-text("R-")').first().click();
  await p.waitForTimeout(600);
  await p.locator('.db-chain').click();
  await p.waitForTimeout(600);
  const chainTags = await p.locator('.chain-tag').allTextContents();
  check('REP в цепочке документов', chainTags.some(x => /REP/.test(x)), chainTags.join(' → '));
  await p.evaluate(() => { if (window.App && App.closeModal) App.closeModal(); });
  await p.waitForTimeout(400);

  // -------------------------------------------------- 10. внимание менеджера
  console.log('\n== снятый апрув на виду ==');
  await p.evaluate(() => { if (window.App && App.closeModal) App.closeModal(); });
  await p.waitForTimeout(400);
  await p.locator('.tabbar .tab:has-text("Действие")').click();
  await p.waitForTimeout(700);
  const attn = p.locator('.card', { hasText: 'Ремонт: слетел апрув' }).first();
  check('карточка «слетел апрув» на экране «Действие»', await attn.count() > 0);
  check('в карточке есть документ', /R-\d/.test(await attn.textContent()),
        (await attn.textContent()).replace(/\s+/g, ' ').slice(0, 110));
  check('счётчик карточки не нулевой', (await attn.locator('.chip').first().textContent()).trim() !== '0',
        (await attn.locator('.chip').first().textContent()).trim());
  await p.locator('.tabbar .tab:has-text("Доска")').click();
  await p.waitForTimeout(700);
  check('пометка «слетел апрув» на доске', await p.locator('.chip:has-text("слетел апрув")').count() > 0);
  check('запись в журнале', await p.evaluate(() =>
    (state.data.audit_log || JSON.parse(localStorage.getItem('techlog_audit_v1') || '[]'))
      .some(a => a.action === 'repair_approve_reset')));

  // -------------------------------------------------- 11. фото «до/после»
  console.log('\n== фото до и после ==');
  await p.locator('.tabbar .tab:has-text("Ремонт")').click();
  await p.waitForTimeout(600);
  if (!(await p.locator('#rep-apr').count())) {      // экран мог остаться на открытом документе
    await p.locator('.rowline:has-text("R-")').first().click();
    await p.waitForTimeout(600);
  }
  check('без фото показана подсказка', /нет фото|Привяжите работу/.test(
    await p.locator('.card:has-text("Фото до и после")').first().textContent()));
  // подкладываем снимки в инвойс
  await p.evaluate(() => {
    const jid = repDraft.job_id;
    state.data.media = [1, 2, 3].map(i => ({ id: 'm' + i, job_id: jid, owner_id: state.user.id,
      kind: 'photo', seq: i, file_name: 'IMG_' + i + '.jpg', status: 'ready', thumb_path: '' }));
    render();
  });
  await p.waitForTimeout(500);
  check('плитки фото появились', await p.locator('.rep-ph').count() === 3,
        String(await p.locator('.rep-ph').count()));
  await p.locator('.rep-ph').nth(0).locator('button:has-text("до")').click();
  await p.waitForTimeout(300);
  await p.locator('.rep-ph').nth(1).locator('button:has-text("после")').click();
  await p.waitForTimeout(300);
  let ph = await p.evaluate(() => repDraft.photos);
  check('пометки «до» и «после» сохранились в документе',
        ph.before.length === 1 && ph.after.length === 1, JSON.stringify(ph));
  check('счётчик в заголовке обновился',
        /до 1 · после 1/.test(await p.locator('.card:has-text("Фото до и после")').first().textContent()));
  // тот же снимок переносим в другую колонку — дублей быть не должно
  await p.locator('.rep-ph').nth(1).locator('button:has-text("до")').click();
  await p.waitForTimeout(300);
  ph = await p.evaluate(() => repDraft.photos);
  check('снимок переехал, а не задвоился', ph.before.length === 2 && ph.after.length === 0,
        JSON.stringify(ph));
  // пометки не должны ронять апрув
  await p.locator('.prop-wrap button:has-text("Сохранить")').last().click();
  await p.waitForTimeout(600);
  await p.locator('#rep-apr button:has-text("Отправить на апрув")').click();
  await p.waitForTimeout(500);
  await p.locator('#rep-apr button:has-text("Одобрить")').click();
  await p.waitForTimeout(600);
  await p.locator('.rep-ph').nth(2).locator('button:has-text("после")').click();
  await p.waitForTimeout(500);
  check('пометка фото апрув не снимает',
        (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Одобрен',
        (await p.locator('#rep-apr .chip.pst').textContent()).trim());
  check('а правка суммы — снимает', await (async () => {
    await p.locator('#rep-rows-work .prop-row .pa').first().fill('99');
    await p.waitForTimeout(500);
    return (await p.locator('#rep-apr .chip.pst').textContent()).trim() === 'Черновик';
  })());

  console.log('\n== ошибки страницы ==');
  console.log(errs.length ? errs.slice(0, 6).join('\n') : '  нет');
  console.log('\nИТОГО: ok=' + ok.length + ' проблем=' + bad.length);
  if (bad.length) console.log('ПРОБЛЕМЫ:\n - ' + bad.join('\n - '));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
