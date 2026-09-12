/* Смоук v1.08.34: (1) жест по ленте календаря инертен — свайп не листает
   неделю и не даёт кликов; неделя меняется только кнопками ‹ ›; обычный тап
   по дню работает как раньше. (2) Переключатель клавиатуры 123/ABC у номера
   юнита в «Добавить задание», выбор запоминается. Демо-режим, тач-контекст.
   Запуск: node tests/v1_08_34.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8124;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 360, height: 740 },
    hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript',
      body: 'window.L={map:()=>({setView(){return this},remove(){}}),tileLayer:()=>({addTo(){}}),marker:()=>({addTo(){return{bindPopup(){return this}}}})};' });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-admin'); });
  await p.reload(); await p.waitForTimeout(900);

  /* синтетический тач-жест: touchstart → touchmove(...) → touchend,
     затем click — как браузер шлёт его после тапа. Killer в app.js обязан
     погасить click, если был сдвиг. */
  const gesture = (sel, dx, withClick, clickSel) => p.evaluate(([sel, dx, withClick, clickSel]) => {
    const el = document.querySelector(sel); if (!el) return 'no el ' + sel;
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width * 0.7, y0 = r.top + r.height / 2;
    const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const ev = (type, x, y) => el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      touches: type === 'touchend' ? [] : [mk(x, y)],
      changedTouches: [mk(x, y)] }));
    ev('touchstart', x0, y0);
    const steps = 4;
    for (let i = 1; i <= steps; i++) ev('touchmove', x0 + dx * i / steps, y0);
    ev('touchend', x0 + dx, y0);
    if (withClick){
      const tgt = clickSel ? document.querySelector(clickSel) : el;
      if (tgt) tgt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    return 'ok';
  }, [sel, dx, withClick, clickSel]);

  const weekState = () => p.evaluate(() => ({
    first: document.querySelector('.week-days .day-cell .dom')?.textContent,
    sel:   document.querySelector('.day-cell.sel .dom')?.textContent,
    cells: document.querySelectorAll('.week-days .day-cell').length,
  }));

  console.log('— календарь: жест инертен —');
  t('главная открыта', await p.evaluate(() => window.App.curScreen() === 'home'));
  const w0 = await weekState();
  t('лента отрисована (7 дней)', w0.cells === 7, JSON.stringify(w0));

  /* 1. свайп влево по ленте + синтетический click по дню под пальцем */
  await gesture('.week-days', -80, true, '.week-days .day-cell:nth-child(3)');
  await p.waitForTimeout(300);
  const w1 = await weekState();
  t('свайп НЕ перелистнул неделю', w1.first === w0.first, `${w0.first} → ${w1.first}`);
  t('click после жеста погашен (день не сменился)', w1.sel === w0.sel, `${w0.sel} → ${w1.sel}`);

  /* 2. свайп вправо — то же самое */
  await gesture('.week-days', 90, true, '.week-days .day-cell:nth-child(5)');
  await p.waitForTimeout(300);
  const w2 = await weekState();
  t('обратный свайп тоже инертен', w2.first === w0.first && w2.sel === w0.sel,
    JSON.stringify(w2));

  /* 3. обычный тап (без сдвига) по другому дню — ДОЛЖЕН сработать */
  const tapDay = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('.week-days .day-cell')];
    const cur = cells.findIndex(c => c.classList.contains('sel'));
    const idx = cur === 2 ? 3 : 2;
    const el = cells[idx];
    const r = el.getBoundingClientRect();
    const mk = () => new Touch({ identifier: 2, target: el,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk()], changedTouches: [mk()] }));
    el.dispatchEvent(new TouchEvent('touchend',   { bubbles: true, touches: [],     changedTouches: [mk()] }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return el.querySelector('.dom').textContent;
  });
  await p.waitForTimeout(300);
  const w3 = await weekState();
  t('обычный тап по дню выбирает день', w3.sel === tapDay, `тап ${tapDay}, sel ${w3.sel}`);

  /* 4. свайп и СРАЗУ тап по стрелке › — стрелка обязана сработать */
  await gesture('.week-days', -70, false);
  await p.evaluate(() => {
    const el = document.querySelectorAll('.week .wk-arrow')[1];
    const r = el.getBoundingClientRect();
    const mk = () => new Touch({ identifier: 3, target: el,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk()], changedTouches: [mk()] }));
    el.dispatchEvent(new TouchEvent('touchend',   { bubbles: true, touches: [],     changedTouches: [mk()] }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(300);
  const w4 = await weekState();
  t('кнопка › сразу после свайпа листает неделю', w4.first !== w3.first,
    `${w3.first} → ${w4.first}`);

  /* 5. кнопка ‹ возвращает неделю назад */
  await p.evaluate(() => document.querySelectorAll('.week .wk-arrow')[0].click());
  await p.waitForTimeout(300);
  const w5 = await weekState();
  t('кнопка ‹ листает назад', w5.first === w3.first, `${w4.first} → ${w5.first}`);

  t('App.weekSwipe удалён', await p.evaluate(() => window.App.weekSwipe === undefined));
  t('App.swipeDay удалён',  await p.evaluate(() => window.App.swipeDay === undefined));

  console.log('— номер юнита: клавиатура 123/ABC —');
  await p.evaluate(() => window.App.addTaskModal());
  await p.waitForSelector('#nt-unit', { timeout: 3000 });
  let u = await p.evaluate(() => ({
    im: document.querySelector('#nt-unit').getAttribute('inputmode'),
    btn: document.querySelector('#nt-unit-kb')?.textContent.trim(),
  }));
  t('по умолчанию цифровая клавиатура', u.im === 'numeric', JSON.stringify(u));
  t('кнопка предлагает ABC', u.btn === 'ABC', u.btn);

  await p.evaluate(() => document.querySelector('#nt-unit-kb').click());
  u = await p.evaluate(() => ({
    im: document.querySelector('#nt-unit').getAttribute('inputmode'),
    btn: document.querySelector('#nt-unit-kb').textContent.trim(),
    ls: localStorage.getItem('tl_unit_kb'),
    focus: document.activeElement?.id,
  }));
  t('после нажатия — обычная клавиатура', u.im === 'text', JSON.stringify(u));
  t('кнопка предлагает 123', u.btn === '123', u.btn);
  t('выбор записан в localStorage', u.ls === 'abc', u.ls);
  t('фокус вернулся в поле (клавиатура переоткрыта)', u.focus === 'nt-unit', u.focus);

  await p.fill('#nt-unit', '12B');
  t('буквенный юнит принят полем', await p.evaluate(() =>
    document.querySelector('#nt-unit').value) === '12B');

  /* закрыть и открыть заново — выбор клавиатуры должен сохраниться */
  await p.evaluate(() => window.App.closeModal());
  await p.waitForTimeout(200);
  await p.evaluate(() => window.App.addTaskModal());
  await p.waitForSelector('#nt-unit', { timeout: 3000 });
  u = await p.evaluate(() => ({
    im: document.querySelector('#nt-unit').getAttribute('inputmode'),
    btn: document.querySelector('#nt-unit-kb').textContent.trim(),
  }));
  t('выбор пережил переоткрытие формы', u.im === 'text' && u.btn === '123', JSON.stringify(u));

  /* обратно на цифры */
  await p.evaluate(() => document.querySelector('#nt-unit-kb').click());
  u = await p.evaluate(() => ({
    im: document.querySelector('#nt-unit').getAttribute('inputmode'),
    ls: localStorage.getItem('tl_unit_kb'),
  }));
  t('переключение обратно на цифры', u.im === 'numeric' && u.ls === 'num', JSON.stringify(u));

  await p.screenshot({ path: '/tmp/pw/34-unit-kb.png' });
  await br.close();
  console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
