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

  console.log('— экран: чипы разделов, две кнопки, без вкладок (v1.08.56) —');
  await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(1200);
  {
    const chips = await p.evaluate(() => [...document.querySelectorAll('.st-chip')].map(c => ({ no: c.querySelector('.st-chip-no').textContent.trim(), on: c.classList.contains('on'), t: c.querySelector('.st-chip-t').textContent.trim() })));
    t('восемь чипов разделов сверху, выбран 1-й, подписи короткие («Вода», «Пожар»…)',
      chips.length === 8 && chips[0].on && chips.filter(c => c.on).length === 1 && chips[0].t === 'Вода' && chips[1].t === 'Пожар' && chips[7].t === 'Материалы', JSON.stringify(chips));
    t('вкладок и переключателя языка нет', !(await p.$('.acc-nav')) && !(await p.$('.st-lang')));
    const secs = [];
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]){
      await p.evaluate(id => window.App.studySel(id), n); await p.waitForTimeout(150);
      secs.push(await p.evaluate(() => {
        const c = document.querySelector('.st-sec');
        const btns = [...c.querySelectorAll('.st-sec-btns .btn')];
        return { no: c.querySelector('.st-sec-no').textContent.trim(), nb: btns.length, labels: btns.map(b => b.textContent.trim().toLowerCase()).join('|'),
          test: !c.querySelector('button[onclick*="studyStart"]').disabled, book: !c.querySelector('button[onclick*="studyRead"]').disabled,
          on: document.querySelector('.st-chip.on .st-chip-no').textContent.trim(), saved: localStorage.getItem('techlog_study_sec') };
      }));
    }
    t('чип переключает карточку раздела, выбор запоминается на устройстве', secs.every((x, i) => x.no === String(i + 1) && x.on === String(i + 1) && x.saved === String(i + 1)), JSON.stringify(secs.map(x => [x.no, x.on, x.saved])));
    t('в карточке ровно две кнопки — «Тест» и «Книга»', secs.every(x => x.nb === 2 && /тест\|книга/.test(x.labels)), secs[0].labels);
    t('«Тест» активен у всех семи разделов 1–7, у раздела 8 погашен',
      secs.filter(x => x.test).map(x => x.no).join(',') === '1,2,3,4,5,6,7', JSON.stringify(secs.map(x => [x.no, x.test])));
    t('«Книга» активна у разделов 1, 2 (v1.08.60–61: section-N-ru/en) и 8', secs.filter(x => x.book).map(x => x.no).join(',') === '1,2,8', JSON.stringify(secs.map(x => [x.no, x.book])));
    const cards = await p.evaluate(() => ({ res: !!document.querySelector('.st-cap') && /Мои результаты/.test(document.querySelector('.st-cap').textContent), overall: [...document.querySelectorAll('.st-cap')].some(c => /Общий прогресс/.test(c.textContent)),
      stat: [...document.querySelectorAll('.st-cap')].some(c => /Статистика/.test(c.textContent)), pills: document.querySelectorAll('.st-pill').length, empty: !!document.querySelector('.st-empty') }));
    t('на экране без кнопок: «Мои результаты» (пока пусто), «Общий прогресс» с 7 пилюлями разделов, «Статистика» (админ)', cards.res && cards.overall && cards.stat && cards.pills === 7 && cards.empty, JSON.stringify(cards));
    await p.evaluate(() => window.App.studySel('1')); await p.waitForTimeout(150);
  }

  console.log('— запуск теста раздела 3 (обучение, 5 вопросов) —');
  {
    await p.evaluate(() => window.App.studyStart('3'));
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 15000 });
    const head = await txt('#overlay');
    t('модалка старта: режим, число вопросов, порог; выбора языка нет', /Режим/.test(head) && /Вопросов/.test(head) && /Порог зачёта/.test(head) && /185/.test(head) && !/Язык теста/.test(head), head.slice(0, 120));
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

    /* «Прервать» → своя модалка-вопрос в дизайне приложения (v1.08.59) */
    await p.evaluate(() => window.App.studyAbort()); await p.waitForTimeout(400);
    const ask = await p.evaluate(() => {
      const m = document.querySelector('#overlay .modal'); if (!m) return null;
      return { title: (m.querySelector('h3') || {}).textContent || '', text: (m.querySelector('.ask-text') || {}).textContent || '',
        ok: (m.querySelector('#ask-ok') || {}).textContent || '', no: (m.querySelector('#ask-no') || {}).textContent || '', backx: !!m.querySelector('.back-x') };
    });
    t('вопрос о завершении — модалка приложения: заголовок, «2 из 20», кнопки «Завершить» / «Продолжить тест», стрелка назад',
      ask && /Завершить тест\?/.test(ask.title) && /2 из 20/.test(ask.text) && /Завершить/.test(ask.ok) && /Продолжить тест/.test(ask.no) && ask.backx, JSON.stringify(ask));
    await p.evaluate(() => document.querySelector('#ask-no').click()); await p.waitForTimeout(300);
    t('«Продолжить тест» — окно закрылось, тест на месте', !(await p.$('#overlay')) && !!(await p.$('.st-run')));
    await p.evaluate(() => window.App.studyAbort()); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    t('Esc — тоже «нет»', !(await p.$('#overlay')) && !!(await p.$('.st-run')));
    await p.evaluate(() => window.App.studyAbort()); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#ask-ok').click()); await p.waitForTimeout(700);
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

  console.log('— раздел 1: 399 вопросов, встроенные схемы (v1.08.52) —');
  {
    await p.evaluate(() => window.App.studyStart('1'));
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 20000 });
    t('модалка старта раздела 1 называет 399 вопросов и страницы 1-162', /399/.test(await txt('#overlay')) && /1-162/.test(await txt('#overlay')));
    await p.evaluate(() => { window.App.studyStartOpt('shuffle', false, '1'); window.App.studyStartOpt('count', 20, '1'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyBegin('1')); await p.waitForTimeout(400);
    for (let i = 0; i < 7; i++){ await p.evaluate(() => { window.App.studyPick('1'); window.App.studyCheck(); window.App.studyNext(); }); await p.waitForTimeout(80); }
    const a = await p.evaluate(() => ({
      i: (document.querySelector('.st-run-h .tiny') || {}).textContent || '',
      svg: !!document.querySelector('.st-asset svg'), meta: !!document.querySelector('.st-asset svg metadata'),
      cap: (document.querySelector('.st-asset figcaption') || {}).textContent || '',
      w: (document.querySelector('.st-asset svg') || {}).getBoundingClientRect ? document.querySelector('.st-asset svg').getBoundingClientRect().width : 0,
    }));
    t('8-й вопрос раздела 1 показывает встроенную схему (без <metadata>), с подписью и темой главы',
      /8 \/ 20/.test(a.i) && a.svg && !a.meta && a.w > 200 && /Восстановить или заменить/.test(a.cap) && /Введение/.test(a.i), JSON.stringify(a));
    await p.evaluate(() => window.App.studyDrop()); await p.waitForTimeout(300);
  }

  console.log('— раздел 2: 201 вопрос, главы-темы, схема у 5-го вопроса (v1.08.53) —');
  {
    await p.evaluate(() => window.App.studyStart('2'));
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 20000 });
    t('модалка старта раздела 2 называет 201 вопрос', /201/.test(await txt('#overlay')));
    await p.evaluate(() => { window.App.studyStartOpt('shuffle', false, '2'); window.App.studyStartOpt('count', 20, '2'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyBegin('2')); await p.waitForTimeout(400);
    for (let i = 0; i < 4; i++){ await p.evaluate(() => { window.App.studyPick('1'); window.App.studyCheck(); window.App.studyNext(); }); await p.waitForTimeout(80); }
    await p.evaluate(() => { window.App.studyPick('1'); window.App.studyCheck(); }); await p.waitForTimeout(250);
    const a = await p.evaluate(() => ({
      i: (document.querySelector('.st-run-h .tiny') || {}).textContent || '',
      svg: !!document.querySelector('.st-asset svg'), ids: [...document.querySelectorAll('.st-opt-id')].map(x => x.textContent.trim()).join(''),
      verdict: (document.querySelector('.st-verdict') || {}).className || '', ref: (document.querySelector('.st-ref') || {}).textContent || '',
    }));
    t('5-й вопрос: схема «треугольник горения», варианты 1–6, ответ 1 верный, ссылка «Раздел 2 · Пожар и дым · стр. 2»',
      /5 \/ 20/.test(a.i) && a.svg && a.ids === '123456' && /ok/.test(a.verdict) && /Раздел 2/.test(a.ref) && /Пожар и дым/.test(a.ref) && /стр\. 2/.test(a.ref), JSON.stringify(a));
    await p.evaluate(() => window.App.studyDrop()); await p.waitForTimeout(300);
  }

  console.log('— раздел 4: 193 вопроса, варианты 1–6 вместо a–f, схема у 2-го вопроса (v1.08.54) —');
  {
    await p.evaluate(() => window.App.studyStart('4'));
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 20000 });
    t('модалка старта раздела 4 называет 193 вопроса', /193/.test(await txt('#overlay')));
    await p.evaluate(() => { window.App.studyStartOpt('shuffle', false, '4'); window.App.studyStartOpt('count', 20, '4'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyBegin('4')); await p.waitForTimeout(400);
    await p.evaluate(() => { window.App.studyPick('2'); window.App.studyCheck(); window.App.studyNext(); }); await p.waitForTimeout(100);
    await p.evaluate(() => { window.App.studyPick('2'); window.App.studyCheck(); }); await p.waitForTimeout(250);
    const a = await p.evaluate(() => ({
      i: (document.querySelector('.st-run-h .tiny') || {}).textContent || '',
      svg: !!document.querySelector('.st-asset svg'), cap: (document.querySelector('.st-asset figcaption') || {}).textContent || '',
      ids: [...document.querySelectorAll('.st-opt-id')].map(x => x.textContent.trim()).join(''),
      verdict: (document.querySelector('.st-verdict') || {}).className || '', ref: (document.querySelector('.st-ref') || {}).textContent || '',
      optEx: !!document.querySelector('.st-opt.ok .st-opt-ex'),
    }));
    t('2-й вопрос: схема «пять шагов» с подписью, варианты 1–6, ответ 2 верный с объяснением, ссылка «Раздел 4 · Введение · стр. 1», тема без slug',
      /2 \/ 20/.test(a.i) && a.svg && /Пять шагов/.test(a.cap) && a.ids === '123456' && /ok/.test(a.verdict) && a.optEx
      && /Раздел 4/.test(a.ref) && /Введение/.test(a.ref) && !/definitions|ppe/.test(a.i), JSON.stringify(a));
    await p.evaluate(() => window.App.studyDrop()); await p.waitForTimeout(300);
  }

  console.log('— раздел 6: 272 вопроса, схема у каждого, главы из meta.sections (v1.08.55) —');
  {
    await p.evaluate(() => window.App.studyStart('6'));
    await p.waitForFunction(() => !!document.querySelector('#overlay button[onclick*="studyBegin"]'), null, { timeout: 20000 });
    t('модалка старта раздела 6 называет 272 вопроса', /272/.test(await txt('#overlay')));
    await p.evaluate(() => { window.App.studyStartOpt('shuffle', false, '6'); window.App.studyStartOpt('count', 20, '6'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => window.App.studyBegin('6')); await p.waitForTimeout(400);
    await p.evaluate(() => { window.App.studyPick('1'); window.App.studyCheck(); }); await p.waitForTimeout(250);
    const a = await p.evaluate(() => ({
      i: (document.querySelector('.st-run-h .tiny') || {}).textContent || '',
      svg: !!document.querySelector('.st-asset svg'), cap: (document.querySelector('.st-asset figcaption') || {}).textContent || '',
      ids: [...document.querySelectorAll('.st-opt-id')].map(x => x.textContent.trim()).join(''),
      verdict: (document.querySelector('.st-verdict') || {}).className || '', ref: (document.querySelector('.st-ref') || {}).textContent || '',
      optEx: (document.querySelector('.st-opt.ok .st-opt-ex') || {}).textContent || '',
    }));
    t('1-й вопрос: схема «семь ключей», варианты 1–6, ответ 1 верный с объяснением и стр. 1, ссылка «Раздел 6 · Волокна и ткани · стр. 1», тема — глава',
      /1 \/ 20/.test(a.i) && /Волокна и ткани/.test(a.i) && !/seven keys/.test(a.i) && a.svg && /ключ/i.test(a.cap) && a.ids === '123456' && /ok/.test(a.verdict)
      && /стр\. 1/.test(a.optEx) && /Раздел 6/.test(a.ref) && /Волокна и ткани/.test(a.ref), JSON.stringify(a));
    await p.evaluate(() => window.App.studyDrop()); await p.waitForTimeout(300);
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
    t('рамка учебника с section-8.html, таймер, песочница со скриптами (v1.08.60: листалка внутри книги)', rd.frame && /books\/section-8\.html/.test(rd.src) && rd.timer && /allow-same-origin/.test(rd.sandbox) && /allow-scripts/.test(rd.sandbox), JSON.stringify(rd));
    await p.waitForTimeout(5300);
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(1700);
    const rs = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').study_sessions || []).find(s => s.kind === 'read'));
    t('чтение ≥5 с записано как сессия read по разделу 8', rs && +rs.section === 8 && rs.duration_ms >= 5000, JSON.stringify(rs && { sec: rs.section, ms: rs.duration_ms }));
    await p.evaluate(() => window.App.studySel('8')); await p.waitForTimeout(200);
    const k8 = await p.evaluate(() => [...document.querySelectorAll('.st-kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim()));
    t('в «Моих результатах» раздела 8 появилось время чтения (≥5 с)', k8.some(x => /время чтения/.test(x) && /[5-9] с|мин/.test(x)), JSON.stringify(k8));
  }

  console.log('— результаты и статистика прямо на экране —');
  {
    await p.evaluate(() => window.App.studySel('3')); await p.waitForTimeout(300);
    const mine = await p.evaluate(() => {
      const card = document.querySelector('.st-cap').closest('.card');
      return { kpi: card.querySelectorAll('.st-kpi').length, rows: card.querySelectorAll('.st-srow').length, eye: card.querySelectorAll('.st-srow button[onclick*="studySessReview"]').length,
        best: [...card.querySelectorAll('.st-kpi')].find(k => /лучший/.test(k.textContent)).textContent.replace(/\s+/g, ' ').trim() };
    });
    t('«Мои результаты» раздела 3: 5 плиток, 1 попытка в списке с глазиком, лучший = 5%', mine.kpi === 5 && mine.rows === 1 && mine.eye === 1 && /5%/.test(mine.best), JSON.stringify(mine));
    const ov = await p.evaluate(() => {
      const card = [...document.querySelectorAll('.st-cap')].find(c => /Общий прогресс/.test(c.textContent)).closest('.card');
      const pills = [...card.querySelectorAll('.st-pill')].map(x => ({ no: x.querySelector('.st-chip-no').textContent.trim(), cls: x.className, txt: x.textContent.replace(/\s+/g, ' ').trim() }));
      return { kpi: card.querySelectorAll('.st-kpi').length, pills, tests: [...card.querySelectorAll('.st-kpi')].find(k => /тестов/.test(k.textContent)).textContent.replace(/\s+/g, ' ').trim() };
    });
    t('«Общий прогресс»: 6 плиток, тестов 1, пилюля раздела 3 красная «5%», остальные «—»',
      ov.kpi === 6 && /^1\s*тестов/.test(ov.tests) && ov.pills.find(x => x.no === '3').cls.includes('bad') && /5%/.test(ov.pills.find(x => x.no === '3').txt) && ov.pills.filter(x => /—/.test(x.txt)).length === 6, JSON.stringify(ov));
    const st = await p.evaluate(() => {
      const card = [...document.querySelectorAll('.st-cap')].find(c => /Статистика/.test(c.textContent)).closest('.card');
      const sum = card.nextElementSibling; const rows = sum.nextElementSibling;
      return { kpi: sum.querySelectorAll('.st-kpi').length, users: rows.querySelectorAll('.st-urow').length, csv: !!card.querySelector('button[onclick*="studyStatCsv"]'), txt: (rows.querySelector('.st-urow .tiny') || {}).textContent || '' };
    });
    t('«Статистика» (админ) внизу экрана: 8 показателей, 1 сотрудник, CSV, строка с тестами/ответами/%/временем',
      st.kpi === 8 && st.users === 1 && st.csv && /тестов: 1/.test(st.txt) && /ответов: 2/.test(st.txt) && /время чтения/.test(st.txt), JSON.stringify(st));
    await p.evaluate(() => document.querySelector('.st-urow .rowline').click()); await p.waitForTimeout(300);
    t('строка сотрудника раскрывается по разделам и попыткам', (await p.$$('.st-secline')).length === 2 && (await p.$$('.st-sess .st-srow')).length === 2);
    await p.evaluate(() => window.App.studySel('1')); await p.waitForTimeout(150);
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
