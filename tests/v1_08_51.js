/* v1.08.51 — учёба: вкладка, разделы, тест, итоги, разбор, чтение,
   мои результаты, статистика админа, доступ и личное скрытие кнопки.
   Запуск: node tests/v1_08_51.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8158;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 414, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);

  const labels = () => p.evaluate(() => [...document.querySelectorAll('.tabbar .tab span')].map(s => s.textContent.trim()));
  const txt = (sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);

  console.log('— вкладка «Учёба» в меню —');
  {
    const l = await labels();
    t('кнопка «Учёба» стоит после «Статистики»', l.indexOf('Учёба') > 0 && l[l.indexOf('Учёба') - 1] === 'Статистика', l.join(','));
    await p.evaluate(() => window.App.setLang('en')); await p.waitForTimeout(300);
    t('по-английски — «Study»', (await labels()).includes('Study'));
    await p.evaluate(() => window.App.setLang('ru')); await p.waitForTimeout(300);
  }

  console.log('— экран: 8 разделов —');
  await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(1200);
  {
    const secs = await p.evaluate(() => [...document.querySelectorAll('.st-sec')].map(c => ({
      no: c.querySelector('.st-sec-no').textContent.trim(),
      test: !c.querySelector('button[onclick*="studyStart"]').disabled,
      book: !c.querySelector('button[onclick*="studyRead"]').disabled })));
    t('восемь карточек разделов', secs.length === 8, secs.length);
    t('тесты доступны у 3, 5, 7; у остальных кнопка погашена',
      secs.filter(s => s.test).map(s => s.no).join(',') === '3,5,7', JSON.stringify(secs.map(s => [s.no, s.test])));
    t('учебник доступен только у раздела 8', secs.filter(s => s.book).map(s => s.no).join(',') === '8', JSON.stringify(secs.map(s => [s.no, s.book])));
    t('вкладки Разделы · Мои результаты · Статистика (админ)', (await txt('.acc-nav')).includes('Статистика'));
  }

  console.log('— запуск теста раздела 3 (обучение, 5 вопросов) —');
  {
    await p.evaluate(() => window.App.studyStart('3'));
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 15000 });
    const head = await txt('#overlay');
    t('модалка старта: режим, число вопросов, язык, порог', /Режим/.test(head) && /Вопросов/.test(head) && /Порог зачёта/.test(head) && /185/.test(head), head.slice(0, 120));
    await p.evaluate(() => { window.App.studyStartOpt('count', 20, '3'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => { window.STUDY_TEST_HOOK = 1; window.App.studyStartOpt('shuffle', false, '3'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyBegin('3'));
    await p.waitForTimeout(500);
    const run = await p.evaluate(() => ({
      q: !!document.querySelector('.st-run .st-qtext'),
      n: document.querySelectorAll('.st-opt').length,
      prog: (document.querySelector('.st-run-h .tiny') || {}).textContent || '',
      timer: !!document.querySelector('#st-timer'),
      saved: !!localStorage.getItem('techlog_study_run'),
    }));
    t('экран вопроса: текст, 6 вариантов, «1 / 20», таймер, черновик в localStorage',
      run.q && run.n === 6 && /1 \/ 20/.test(run.prog) && run.timer && run.saved, JSON.stringify(run));
    t('кнопка «Проверить» неактивна без выбора', await p.evaluate(() => document.querySelector('.st-run-btns .btn-green').disabled));

    /* отвечаем: первый вопрос верно (ответ известен из файла), дальше — вариант 1 */
    const correctFirst = await p.evaluate(async () => {
      const r = await fetch('./dictionary/tests/section-3.json'); const j = await r.json();
      return j.questions[0].correct[0];
    });
    await p.evaluate(id => window.App.studyPick(id), correctFirst);
    await p.evaluate(() => window.App.studyHint()); await p.waitForTimeout(200);
    t('подсказка показана', !!(await p.$('.st-hint')));
    await p.evaluate(() => window.App.studyCheck()); await p.waitForTimeout(300);
    const v = await p.evaluate(() => ({
      verdict: (document.querySelector('.st-verdict') || {}).className || '',
      ex: !!document.querySelector('.st-ex'),
      okOpt: !!document.querySelector('.st-opt.ok'),
      ref: !!document.querySelector('.st-ref'),
    }));
    t('после проверки: «Верно», общий разбор, верный вариант подсвечен, ссылка на страницы',
      /ok/.test(v.verdict) && v.ex && v.okOpt && v.ref, JSON.stringify(v));
    await p.evaluate(() => window.App.studyNext()); await p.waitForTimeout(250);
    t('второй вопрос', /2 \/ 20/.test(await txt('.st-run-h .tiny')));
    /* выбираем вариант, затем «Дальше» без «Проверить» — ответ должен зачесться */
    await p.evaluate(() => window.App.studyPick('1'));
    await p.evaluate(() => window.App.studyNext()); await p.waitForTimeout(250);
    t('«Дальше» с выбранным ответом = проверка (остаёмся на вопросе с разбором)', !!(await p.$('.st-verdict')));

    /* перезагрузка страницы — тест продолжается */
    await p.reload(); await p.waitForTimeout(1400);
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(1500);
    const resumed = await p.evaluate(() => ({ run: !!document.querySelector('.st-run'), i: (document.querySelector('.st-run-h .tiny') || {}).textContent || '' }));
    t('после перезагрузки тест восстановлен на 2-м вопросе', resumed.run && /2 \/ 20/.test(resumed.i), JSON.stringify(resumed));

    /* «Прервать» → диалог принят → итоги по 2 отвеченным */
    await p.evaluate(() => window.App.studyAbort()); await p.waitForTimeout(700);
    const res = await txt('#overlay');
    t('модалка результатов: процент, зачёт/не сдан, верных/неверных, время',
      /Результат/.test(res) && /%/.test(res) && /верных/.test(res) && /неверных/.test(res) && /Время/.test(res), res.slice(0, 160));
    const sess = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').study_sessions || []));
    await p.waitForTimeout(1600);
    const sess2 = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').study_sessions || []));
    const s = sess2[0] || sess[0];
    t('сессия записана: kind=test, раздел 3, 2 ответа из 20, answers с вопросами',
      s && s.kind === 'test' && +s.section === 3 && s.total === 20 && s.answered === 2 && Array.isArray(s.answers) && s.answers.length === 2 && s.answers[0].ok === true,
      JSON.stringify(s && { k: s.kind, sec: s.section, tot: s.total, a: s.answered, c: s.correct }));
    t('черновик теста очищен', await p.evaluate(() => !localStorage.getItem('techlog_study_run')));

    /* разбор */
    await p.evaluate(() => document.querySelector('#overlay button[onclick*="studySessReview"]').click());
    await p.waitForTimeout(600);
    const rv = await p.evaluate(() => ({ n: document.querySelectorAll('.st-rv').length, ok: document.querySelectorAll('.st-rv.ok').length,
      your: !!document.querySelector('.st-rv .chip'), tools: !!document.querySelector('.st-rv-tools') }));
    t('разбор: 2 вопроса, первый верный, отметка «ваш ответ», фильтр ошибок', rv.n === 2 && rv.ok === 1 && rv.your && rv.tools, JSON.stringify(rv));
    await p.evaluate(() => window.App.closeModal());
  }

  console.log('— экзамен: без разбора до конца —');
  {
    await p.evaluate(() => { window.App.studyStart('5'); });
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 15000 });
    await p.evaluate(() => { window.App.studyStartOpt('mode', 'exam', '5'); window.App.studyStartOpt('count', 20, '5'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyBegin('5')); await p.waitForTimeout(400);
    await p.evaluate(() => window.App.studyPick('2'));
    await p.evaluate(() => window.App.studyCheck()); await p.waitForTimeout(250);
    const ex = await p.evaluate(() => ({ verdict: !!document.querySelector('.st-verdict'), i: (document.querySelector('.st-run-h .tiny') || {}).textContent || '' }));
    t('в экзамене ответ сразу переводит на следующий вопрос без разбора', !ex.verdict && /2 \/ 20/.test(ex.i), JSON.stringify(ex));
    await p.evaluate(() => window.App.studyDrop()); await p.waitForTimeout(300);
    t('«Сбросить» убирает незавершённый тест', !(await p.$('.st-run')));
  }

  console.log('— чтение учебника (раздел 8) —');
  {
    await p.evaluate(() => window.App.studyRead('8')); await p.waitForTimeout(700);
    const rd = await p.evaluate(() => ({ frame: !!document.querySelector('.st-frame'), src: (document.querySelector('.st-frame') || {}).getAttribute && document.querySelector('.st-frame').getAttribute('src'),
      timer: !!document.querySelector('#st-timer'), sandbox: document.querySelector('.st-frame').getAttribute('sandbox') }));
    t('рамка учебника с section-8.html, таймер, песочница без скриптов', rd.frame && /books\/section-8\.html/.test(rd.src) && rd.timer && /allow-same-origin/.test(rd.sandbox) && !/allow-scripts/.test(rd.sandbox), JSON.stringify(rd));
    await p.waitForTimeout(5300);
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(1700);
    const rs = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').study_sessions || []).find(s => s.kind === 'read'));
    t('чтение ≥5 с записано как сессия read по разделу 8', rs && +rs.section === 8 && rs.duration_ms >= 5000, JSON.stringify(rs && { sec: rs.section, ms: rs.duration_ms }));
    const card8 = await p.evaluate(() => [...document.querySelectorAll('.st-sec')].find(c => c.querySelector('.st-sec-no').textContent.trim() === '8').textContent);
    t('в карточке раздела 8 появилось время чтения', /чтение/.test(card8));
  }

  console.log('— мои результаты и статистика —');
  {
    await p.evaluate(() => window.App.studyTab('mine')); await p.waitForTimeout(300);
    const mine = await p.evaluate(() => ({ kpi: document.querySelectorAll('.st-kpi').length, rows: document.querySelectorAll('.st-srow').length, eye: document.querySelectorAll('.st-srow button[onclick*="studySessReview"]').length }));
    t('«Мои результаты»: сводка и 2 строки (тест + чтение), глазик у теста', mine.kpi === 5 && mine.rows === 2 && mine.eye === 1, JSON.stringify(mine));
    await p.evaluate(() => window.App.studyTab('stat')); await p.waitForTimeout(300);
    const st = await p.evaluate(() => ({ kpi: document.querySelectorAll('.st-kpi').length, users: document.querySelectorAll('.st-urow').length, csv: !!document.querySelector('button[onclick*="studyStatCsv"]'), txt: document.querySelector('.st-urow .tiny').textContent }));
    t('«Статистика»: 8 показателей, 1 сотрудник, CSV, строка с тестами/ответами/%/временем',
      st.kpi === 8 && st.users === 1 && st.csv && /тестов: 1/.test(st.txt) && /ответов: 2/.test(st.txt) && /время чтения/.test(st.txt), JSON.stringify(st));
    await p.evaluate(() => document.querySelector('.st-urow .rowline').click()); await p.waitForTimeout(300);
    t('строка сотрудника раскрывается по разделам и сессиям', (await p.$$('.st-secline')).length === 2 && (await p.$$('.st-sess .st-srow')).length === 2);
  }

  console.log('— доступ: настройки админа и карточка сотрудника —');
  {
    await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (!f.study) window.App.foldToggle('study'); });
    await p.waitForTimeout(500);
    const card = await p.evaluate(() => ({
      self: !!document.querySelector('input[onchange*="studySelfOff"]'),
      on: !!document.querySelector('input[onchange*="study_on"]'),
      who: !!document.querySelector('button[onclick*="study_all"]'),
      pass: !!document.querySelector('input[onchange*="study_pass"]') || !!document.querySelector('button[onclick*="study_pass"]'),
    }));
    t('карточка «Учёба»: галочка меню, выключатель, «Всем / По списку», порог', card.self && card.on && card.who && card.pass, JSON.stringify(card));
    await p.evaluate(() => window.App.setOrgFlag('study_all', false)); await p.waitForTimeout(400);
    const chips = await p.evaluate(() => document.querySelectorAll('.chip-wrap .chip[onclick*="studyAccess"]').length);
    t('«По списку» показывает чипы сотрудников', chips >= 2, chips);
    /* техник без флага — кнопки нет; с флагом — есть */
    await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-tech'); });
    await p.reload(); await p.waitForTimeout(1300);
    t('техник без флага — кнопки «Учёба» нет', !(await labels()).includes('Учёба'));
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(300);
    t('прямой переход — «не включена» без списка разделов', /не включена/.test(await txt('#app')) && !(await p.$('.st-sec')));
    await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-admin'); });
    await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate(() => window.App.studyAccess('demo-tech', true)); await p.waitForTimeout(1700);
    await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-tech'); });
    await p.reload(); await p.waitForTimeout(1300);
    t('техник с флагом — кнопка есть', (await labels()).includes('Учёба'));
    /* личное скрытие */
    await p.evaluate(() => window.App.studySelfOff(true)); await p.waitForTimeout(500);
    t('галочка «Показывать в меню» снята — кнопки нет', !(await labels()).includes('Учёба'));
    await p.evaluate(() => window.App.studySelfOff(false)); await p.waitForTimeout(500);
    t('вернули — кнопка на месте', (await labels()).includes('Учёба'));
    /* общий выключатель */
    await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-admin'); });
    await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate(() => window.App.setOrgFlag('study_on', false)); await p.waitForTimeout(1700);
    await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-tech'); });
    await p.reload(); await p.waitForTimeout(1300);
    t('«Учёба включена» снята — у техника кнопки нет', !(await labels()).includes('Учёба'));
    await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-admin'); });
    await p.reload(); await p.waitForTimeout(1300);
    t('у админа кнопка остаётся при выключенной учёбе', (await labels()).includes('Учёба'));
    /* карточка сотрудника в Штате */
    await p.evaluate(() => { window.App.go('dirs'); }); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.staffCfg('demo-tech')); await p.waitForTimeout(400);
    t('в ⚙️ сотрудника есть флажок «Учёба доступна»', !!(await p.$('#overlay input[onchange*="studyAccess"]')));
    await p.evaluate(() => window.App.closeModal());
  }

  console.log('— справка экрана —');
  {
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(400);
    await p.evaluate(() => window.App.sectionFaq('study')); await p.waitForTimeout(400);
    const h = await txt('#overlay');
    t('справка «?» открывается и описывает режимы и статистику', /Обучение/.test(h) && /Статистика/.test(h), h.slice(0, 80));
    await p.evaluate(() => window.App.closeModal());
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
