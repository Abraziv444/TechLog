/* Смоук v1.08.38: офлайн-режим и спойлеры инвойса.
   1. Пилюля связи в шапке: зелёная «NN мс» при сети, красная «офлайн» без неё.
   2. Без сети серверные кнопки помечены .net-need, html.tl-offline, клик по
      ним перехватывается подсказкой и не доходит до обработчика; обычные
      действия (сохранить работу, создать задачу) работают.
   3. Возврат сети снимает блокировку.
   4. Инвойс: пустые секции свёрнуты, заполненные открыты; тап по заголовку,
      «?» внутри заголовка не сворачивает; «Развернуть все (N)» ↔ «Свернуть
      пустые»; ручной выбор переживает перерисовку; новый документ — чистый.
   5. ПК-бланк (1280px): подпись DESCRIPTION на месте при свёрнутой первой секции.
   Демо-режим. Запуск: node tests/v1_08_38.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8147;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 414, height: 896 } });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: 'window.L={};' });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => {
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile');
  });
  await p.reload(); await p.waitForTimeout(1800);

  console.log('— 1. пилюля связи —');
  const pill = await p.evaluate(() => {
    const el = document.querySelector('.topbar .net-pill');
    return el ? { cls: el.className, txt: el.textContent.trim(),
      /* v1.08.45: бейдж переехал к плашке роли и стал кнопкой */
      row: el.tagName === 'BUTTON' && !!el.closest('.rt-role') && !!el.closest('.rt-role').querySelector('.role-tag') } : null;
  });
  t('бейдж есть в шапке — кнопкой слева от роли (v1.08.45)', !!pill && pill.row, JSON.stringify(pill));
  t('при сети — зелёная с пингом «NN мс»', !!pill && /\bon\b/.test(pill.cls) && /^\d+ мс$/.test(pill.txt), pill && pill.txt);
  t('состояние: онлайн', await p.evaluate(() => window.App.netState() === 'on' && !window.App.netOff()));

  console.log('— 2. серверные кнопки помечены —');
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(400);
  const marks = await p.evaluate(() => ({
    sync: !!document.querySelector('[onclick="App.sync()"].net-need'),
    upd: !!document.querySelector('[onclick*="updCheck"].net-need'),
    logout: !!document.querySelector('[onclick*="App.logout"].net-need'),
    diagFree: !!document.querySelector('[onclick="App.diag()"]') && !document.querySelector('[onclick="App.diag()"].net-need'),
    pillFree: !document.querySelector('.net-pill.net-need'),
    offlineCls: document.documentElement.classList.contains('tl-offline'),
  }));
  t('«Синхронизация» помечена .net-need', marks.sync);
  t('«Проверить обновление» помечена', marks.upd);
  t('«Выйти» помечена', marks.logout);
  t('«Диагностика» — нет (работает без сети)', marks.diagFree);
  t('сама пилюля не помечена', marks.pillFree);
  t('в карточке синхронизации есть «Проверить связь» с живой пилюлей', await p.evaluate(() =>
    !!document.querySelector('[onclick="App.netCheck()"] .net-pill') && !document.querySelector('[onclick="App.netCheck()"].net-need')));
  t('при сети класса tl-offline нет', !marks.offlineCls);

  console.log('— 3. обрыв сети —');
  await ctx.setOffline(true);
  await p.waitForTimeout(700);
  const off = await p.evaluate(() => ({
    cls: document.documentElement.classList.contains('tl-offline'),
    pill: (document.querySelector('.topbar .net-pill') || {}).className,
    txt: (document.querySelector('.topbar .net-pill') || {}).textContent,
    dim: +getComputedStyle(document.querySelector('[onclick="App.sync()"]')).opacity < 0.6,
    st: window.App.netState(),
  }));
  t('html.tl-offline выставлен', off.cls, JSON.stringify(off));
  t('пилюля красная «офлайн»', /\boff\b/.test(off.pill || '') && /офлайн/.test(off.txt || ''), off.txt);
  t('серверная кнопка блеклая (opacity < .6)', off.dim);
  /* клик по блеклой кнопке: обработчик не вызывается, вместо него подсказка */
  await p.evaluate(() => { window.__sync = 0; const o = window.App.sync; window.App.sync = () => { window.__sync++; }; window.__syncOrig = o; });
  await p.locator('[onclick="App.sync()"]').click({ force: true });
  await p.waitForTimeout(300);
  const blocked = await p.evaluate(() => ({ calls: window.__sync,
    toast: [...document.querySelectorAll('#toasts .toast')].some(x => /Нет связи/.test(x.textContent)) }));
  t('клик перехвачен — App.sync не вызван', blocked.calls === 0, 'calls=' + blocked.calls);
  t('показана подсказка «Нет связи…»', blocked.toast);

  /* обычные функции живы: создать задачу самому себе и сохранить работу */
  const before = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').jobs || []).length);
  await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
  const addFree = await p.evaluate(() => {
    const b = document.querySelector('[onclick*="addTaskModal"]');
    return !!b && !b.classList.contains('net-need');
  });
  t('кнопка «Добавить задание» не помечена', addFree);
  await p.evaluate(() => window.App.addTaskModal()); await p.waitForTimeout(400);
  const created = await p.evaluate(async () => {
    const st = JSON.parse(localStorage.getItem('techlog_state_v1'));
    const c = st.complexes[0];
    const set = (sel, v) => { const el = document.querySelector(sel); if (el){ el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } return !!el; };
    const okCx = set('#nt-cp', c.counterparty_id) && set('#nt-cx', c.id) && set('#nt-unit', '777');
    const wtBtn = document.querySelector('#nt-wt button'); if (wtBtn) wtBtn.click();
    const btn = [...document.querySelectorAll('#overlay button')].find(b => /App\.createTask/.test(b.getAttribute('onclick') || ''));
    const blocked = btn ? btn.classList.contains('net-need') : null;
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 700));
    const st2 = JSON.parse(localStorage.getItem('techlog_state_v1'));
    return { okCx, wt: !!wtBtn, n: (st2.jobs || []).length, has: (st2.jobs || []).some(j => j.unit_number === '777'),
             btn: !!btn, blocked };
  });
  t('кнопка «Создать» в форме задания не помечена', created.btn && created.blocked === false, JSON.stringify(created));
  t('задача создана без сети (юнит 777 в кэше)', created.has, JSON.stringify({ before, after: created.n }));

  console.log('— 4. возврат сети —');
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForTimeout(900);
  const back = await p.evaluate(() => ({
    cls: document.documentElement.classList.contains('tl-offline'),
    st: window.App.netState(),
    txt: (document.querySelector('.topbar .net-pill') || {}).textContent,
  }));
  t('tl-offline снят, состояние «on»', !back.cls && back.st === 'on', JSON.stringify(back));
  t('пилюля снова показывает пинг', /^\d+ мс$/.test((back.txt || '').trim()), back.txt);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(300);
  await p.locator('[onclick="App.sync()"]').click();
  await p.waitForTimeout(200);
  t('после возврата сети клик доходит до App.sync', await p.evaluate(() => window.__sync === 1));
  await p.evaluate(() => { window.App.sync = window.__syncOrig; });

  console.log('— 5. спойлеры инвойса —');
  const ids = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('techlog_state_v1'));
    return { full: st.jobs.find(j => j.unit_number === '916').id, empty: st.jobs.find(j => j.unit_number === '204').id };
  });
  await p.evaluate(id => window.App.openJob(id), ids.full); await p.waitForTimeout(500);
  const secs = () => p.evaluate(() => {
    const out = {};
    document.querySelectorAll('.inv-sec[data-sec]').forEach(el => {
      out[el.dataset.sec] = { closed: el.classList.contains('sec-closed'),
        bodyHidden: getComputedStyle(el.querySelector('.inv-body')).display === 'none',
        exp: el.querySelector('.inv-head').getAttribute('aria-expanded') };
    });
    return out;
  });
  let s = await secs();
  t('13 секций с data-sec', Object.keys(s).length === 13, Object.keys(s).length);
  const openIds = Object.keys(s).filter(k => !s[k].closed).sort().join(',');
  t('открыты только заполненные: airduct, equipment, note, others, treatments',
    openIds === 'airduct,equipment,note,others,treatments', openIds);
  t('у свёрнутых тело скрыто и aria-expanded=false',
    Object.values(s).every(v => v.closed ? (v.bodyHidden && v.exp === 'false') : (!v.bodyHidden && v.exp === 'true')));
  let btn = await p.evaluate(() => (document.querySelector('#inv-tools-btn') || {}).textContent);
  t('кнопка в шапке: «Развернуть все (8)»', /Развернуть все \(8\)/.test(btn || ''), btn);
  t('панель спойлеров внутри верхней карточки', await p.evaluate(() => !!document.querySelector('.docbar + .card .inv-tools')));

  /* тап по заголовку пустой секции — раскрывается */
  await p.locator('.inv-sec[data-sec="dye"] .inv-head').click();
  await p.waitForTimeout(150);
  s = await secs();
  t('тап по заголовку Dye — секция открылась', !s.dye.closed && !s.dye.bodyHidden);
  btn = await p.evaluate(() => (document.querySelector('#inv-tools-btn') || {}).textContent);
  t('счётчик уменьшился: «Развернуть все (7)»', /\(7\)/.test(btn || ''), btn);
  /* «?» в заголовке — справка, а не сворачивание */
  await p.locator('.inv-sec[data-sec="dye"] .inv-head .faq-i').click();
  await p.waitForTimeout(300);
  const q = await p.evaluate(() => ({ modal: !!document.querySelector('#overlay'),
    still: !document.querySelector('.inv-sec[data-sec="dye"]').classList.contains('sec-closed') }));
  t('кнопка «?» открыла справку и не свернула секцию', q.modal && q.still, JSON.stringify(q));
  await p.evaluate(() => window.App.closeModal());
  /* ручной выбор переживает перерисовку формы */
  await p.evaluate(() => window.App.crewAll()); await p.waitForTimeout(400);
  s = await secs();
  t('после перерисовки (crewAll) Dye остаётся открытой', !s.dye.closed);
  t('… а пустые по-прежнему свёрнуты', s.steam.closed && s.pad.closed && s.fog.closed);
  /* развернуть все → свернуть пустые */
  await p.locator('#inv-tools-btn').click(); await p.waitForTimeout(150);
  s = await secs();
  t('«Развернуть все» открыл все 13', Object.values(s).every(v => !v.closed));
  btn = await p.evaluate(() => (document.querySelector('#inv-tools-btn') || {}).textContent);
  t('кнопка стала «Свернуть пустые»', /Свернуть пустые/.test(btn || ''), btn);
  await p.locator('#inv-tools-btn').click(); await p.waitForTimeout(150);
  s = await secs();
  t('«Свернуть пустые» снова свернул 8 пустых', Object.keys(s).filter(k => s[k].closed).length === 8,
    Object.keys(s).filter(k => s[k].closed).join(','));
  /* отметка в открытой секции считается — сумма/чекбокс */
  await p.locator('.inv-sec[data-sec="dye"] .inv-head').click(); await p.waitForTimeout(100);
  await p.locator('.inv-sec[data-sec="dye"] input[data-k="spot"]').click(); await p.waitForTimeout(150);
  const spot = await p.evaluate(() => ({
    chk: document.querySelector('.inv-sec[data-sec="dye"] input[data-k="spot"]').checked,
    on: document.querySelector('.inv-sec[data-sec="dye"] input[data-k="spot"]').closest('.opt').classList.contains('on') }));
  t('чекбокс в раскрытой секции работает', spot.chk && spot.on, JSON.stringify(spot));
  /* обычные кнопки документа не помечены как серверные */
  t('«Сохранить», «PDF», «Фото» документа не помечены .net-need', await p.evaluate(() =>
    !document.querySelector('[onclick*="saveJob"].net-need') && !document.querySelector('[onclick*="makePdf"].net-need')
    && !document.querySelector('[onclick*="mediaPick"].net-need')));

  /* новый (пустой) документ — все секции свёрнуты, ручной выбор прошлого не тянется */
  await p.evaluate(() => window.App.jobDrop());
  await p.evaluate(id => window.App.openJob(id), ids.empty); await p.waitForTimeout(500);
  s = await secs();
  t('пустой документ 204: свёрнуты все 13', Object.values(s).every(v => v.closed), Object.keys(s).filter(k => !s[k].closed).join(','));
  btn = await p.evaluate(() => (document.querySelector('#inv-tools-btn') || {}).textContent);
  t('кнопка: «Развернуть все (13)»', /\(13\)/.test(btn || ''), btn);
  await p.evaluate(() => window.App.jobDrop());

  console.log('— 6. ПК-бланк —');
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.evaluate(() => { localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(id => window.App.openJob(id), ids.empty); await p.waitForTimeout(600);
  const dsk = await p.evaluate(() => {
    const first = document.querySelector('#app .card + .inv-sec');
    const head = first && first.querySelector('.inv-head');
    const cs = head && getComputedStyle(head, '::after');
    const amt = first && getComputedStyle(first.querySelector('.inv-head .amt'));
    return { desktop: document.documentElement.classList.contains('tl-desktop'),
      closed: first && first.classList.contains('sec-closed'),
      label: cs && cs.content, amtBorder: amt && amt.borderLeftWidth,
      tools: (document.querySelector('.inv-tools') || {}).offsetWidth,
      closedAny: document.querySelectorAll('.inv-sec.sec-closed').length,
      chev: document.querySelectorAll('.inv-sec .sec-chev').length,
      headH: (document.querySelector('.inv-sec[data-sec="removals"] .inv-head') || {}).offsetHeight };
  });
  t('ПК-режим включён', dsk.desktop, JSON.stringify(dsk));
  /* v1.08.46: на ПК спойлеров больше нет — секции всегда развёрнуты,
     панель «Свернуть/Развернуть» и шевроны не рисуются. */
  t('ПК: секции не сворачиваются (sec-closed нет)', dsk.closed === false && dsk.closedAny === 0, JSON.stringify({c: dsk.closed, n: dsk.closedAny}));
  t('колонка AMOUNT с разделителем', dsk.amtBorder === '2px', dsk.amtBorder);
  t('ПК: панели спойлеров нет', !dsk.tools, dsk.tools);
  t('ПК: шевронов в заголовках нет', dsk.chev === 0, dsk.chev);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nИТОГ: ' + ok + ' ✓ / ' + bad + ' ✗');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + e.message); process.exit(1); });
