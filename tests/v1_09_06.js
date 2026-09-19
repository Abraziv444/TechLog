/* v1.09.06 — системная кнопка «назад» возвращает туда, откуда пришёл.
   Раньше на любом экране, кроме открытого инвойса и модалки, «назад» сразу показывала
   «нажмите ещё раз для выхода», и второе нажатие закрывало приложение — с Доски, из
   Настроек, откуда угодно. Теперь:
     • модалка → закрывается; окно, открытое из другого окна, возвращает к нему;
       выпадающий список → закрывается, окно под ним остаётся;
     • переходы между вкладками → «назад» идёт по ним в обратном порядке, в ту же точку
       прокрутки; документ, открытый с Доски, возвращает на Доску (правки сохраняются);
     • редактор пропозала, поиск на главной → закрываются;
     • подсказка о выходе и выход — ТОЛЬКО на главном экране (у бухгалтера — «Бухгалтерия»,
       на экране входа); переход на главную обнуляет историю.
   «Назад» здесь — настоящий history.back(), как у кнопки телефона и браузера.
   Запуск: node tests/v1_09_06.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8906;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
const HINT = 'нажмите «назад» ещё раз';

async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(400);                          // «сторож» истории и первый рендер — до того, как трогать localStorage
  await p.evaluate(([who, mode]) => { localStorage.clear(); sessionStorage.clear();
    if (who) localStorage.setItem('techlog_session_v1', who);
    localStorage.setItem('techlog_view_mode', mode); }, [o.who === undefined ? 'demo-admin' : o.who, o.mode || 'mobile']);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 });
  await p.waitForTimeout(700);
  if (o.seed) await seed(p, o.seed);
  return p;
}
/* длинный день у админа + пара сотрудников с задачами для доски */
async function seed(p, o){
  await p.waitForTimeout(1700);
  await p.evaluate((o) => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
    let q = 0; const uid = () => 'bk' + (++q) + Math.random().toString(36).slice(2, 8);
    const dt = new Date(), tISO = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const me = d.profiles.find(x => x.id === 'demo-admin');
    let no = d.jobs.length;
    for (let i = 0; i < (o.mine || 0); i++){
      const cx = d.complexes[i % d.complexes.length], wt = d.work_types[i % d.work_types.length];
      d.jobs.push({ id: uid(), no: ++no, date: tISO, counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: String(500 + i),
        work_type_id: wt.id, technician_id: me.id, technician_name: me.display_name, helper_ids: [], shared_with_helpers: false, priority: false, sort_order: i,
        status: 'draft', note: '', form_data: d.jobs[0].form_data, total: 100 + i, approved_total: null, approved_by: null, approved_at: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    localStorage.setItem('techlog_state_v1', JSON.stringify(d));
  }, o);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('.tabbar'), null, { timeout: 20000 });
  await p.waitForTimeout(800);
}
/* «назад» — как кнопка телефона: настоящий шаг по истории браузера */
const back = async (p, ms) => { await p.evaluate(() => history.back()); await p.waitForTimeout(ms || 450); };
const tab = async (p, s) => { await p.click(`#app .tabbar .tab[onclick="App.go('${s}')"]`); await p.waitForTimeout(450); };
const st = (p) => p.evaluate((HINT) => ({ scr: window.App.curScreen(), stack: window.App.navStack(), modal: !!document.getElementById('overlay'),
  hint: [...document.querySelectorAll('#toasts > *')].some(x => (x.textContent || '').includes(HINT)),
  inApp: /index\.html/.test(location.href) }), HINT);
const clearToasts = (p) => p.evaluate(() => { document.querySelectorAll('#toasts > *').forEach(x => { if (!x.classList.contains('mq-mini')) x.remove(); }); });

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  console.log('— вкладки: «назад» идёт по ним в обратном порядке, подсказка о выходе — только на главной —');
  let p = await boot(br, { w: 390, h: 844, touch: 1, seed: { mine: 14 } });
  await p.waitForTimeout(2600); await clearToasts(p);         // стартовый тост «Пикап сегодня» не должен мешать
  await tab(p, 'board'); await tab(p, 'settings'); await tab(p, 'dirs');
  let s = await st(p);
  t('история переходов: главная → доска → настройки → справочники', s.scr === 'dirs' && s.stack.join() === 'home,board,settings', s);
  await back(p); s = await st(p);
  t('«назад» из справочников → настройки, подсказки о выходе НЕТ', s.scr === 'settings' && !s.hint && s.inApp, s);
  await back(p); s = await st(p);
  t('«назад» → доска, подсказки нет', s.scr === 'board' && !s.hint, s);
  await back(p); s = await st(p);
  t('«назад» → главная, подсказки нет, история пуста', s.scr === 'home' && !s.hint && s.stack.length === 0, s);
  await back(p); s = await st(p);
  t('«назад» НА ГЛАВНОЙ → подсказка «нажмите ещё раз», приложение на месте', s.scr === 'home' && s.hint && s.inApp, s);
  await p.waitForTimeout(2500); await clearToasts(p);
  await back(p); s = await st(p);
  t('через 2,5 с подсказка «остыла»: снова подсказка, а не выход', s.hint && s.inApp, s);
  await p.waitForTimeout(2500); await clearToasts(p);

  console.log('— переход на главную обнуляет историю; подсказка действует только подряд —');
  await tab(p, 'board'); await tab(p, 'home'); s = await st(p);
  t('главная → доска → главная (вкладкой): история пуста', s.scr === 'home' && s.stack.length === 0, s);
  await back(p); s = await st(p);
  t('«назад» → подсказка (а не возврат на доску)', s.scr === 'home' && s.hint, s);
  await tab(p, 'board'); await back(p); s = await st(p);       // между двумя «назад» на главной был другой экран
  t('подсказка → ушёл на доску → «назад»: вернулся на главную, приложение НЕ закрылось', s.scr === 'home' && s.inApp, s);
  await back(p); s = await st(p);
  t('следующее «назад» — снова только подсказка', s.hint && s.inApp, s);
  await p.waitForTimeout(2500); await clearToasts(p);

  console.log('— модалки и выпадающий список —');
  await tab(p, 'settings');
  await p.evaluate(() => window.App.ownPassModal()); await p.waitForTimeout(300);
  t('окно «Смена пароля» открыто', (await st(p)).modal);
  await back(p); s = await st(p);
  t('«назад» закрыла окно: экран тот же (настройки), подсказки нет', !s.modal && s.scr === 'settings' && !s.hint, s);
  await tab(p, 'home');
  await p.evaluate(() => window.App.pkDueModal()); await p.waitForTimeout(350);
  const listTitle = await p.evaluate(() => document.querySelector('#overlay h3').textContent.trim());
  await p.click('#overlay .pkm-card'); await p.waitForTimeout(400);
  const innerTitle = await p.evaluate(() => document.querySelector('#overlay h3').textContent.trim());
  t('окно из окна: список пикапов → карточка → окно пикапа', innerTitle !== listTitle && !!innerTitle, [listTitle, innerTitle]);
  await back(p);
  const backTitle = await p.evaluate(() => (document.querySelector('#overlay h3') || {}).textContent || '');
  t('«назад» вернула К СПИСКУ пикапов, а не закрыла всё', backTitle.trim() === listTitle, [backTitle, listTitle]);
  await back(p); s = await st(p);
  t('ещё «назад» — окно закрыто, главная, подсказки нет', !s.modal && s.scr === 'home' && !s.hint, s);
  await p.evaluate(() => window.App.addTaskModal()); await p.waitForTimeout(350);
  await p.dispatchEvent('#overlay select', 'pointerdown'); await p.waitForTimeout(250);
  t('в окне раскрыт выпадающий список', await p.evaluate(() => !!document.querySelector('.tl-dd')));
  await back(p);
  t('«назад» закрыла список, окно «Добавить задание» осталось', await p.evaluate(() => !document.querySelector('.tl-dd') && !!document.getElementById('overlay')));
  await back(p); s = await st(p);
  t('ещё «назад» — закрыла окно', !s.modal && s.scr === 'home' && !s.hint, s);

  console.log('— документ: правки сохраняются, возврат — туда, откуда открыли —');
  await tab(p, 'board');
  const jid = await p.evaluate(() => /'([^']+)'/.exec(document.querySelector('.board .bjob').getAttribute('onclick'))[1]);
  await p.evaluate(id => window.App.openJob(id), jid); await p.waitForTimeout(700);
  s = await st(p);
  t('задача открыта с доски; сам документ в историю не пишется', s.scr === 'job' && s.stack.join() === 'home,board', s);
  await p.fill('#jb-note, textarea[oninput*="note"], textarea', 'note from back test').catch(() => {});
  await p.evaluate(() => { const ta = document.querySelector('#app textarea'); if (ta){ ta.value = 'note from back test'; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.waitForTimeout(250);
  await back(p, 900); s = await st(p);
  t('«назад» из документа → ДОСКА (а не главная), подсказки о выходе нет', s.scr === 'board' && !s.hint && s.stack.join() === 'home', s);
  await p.waitForTimeout(2200);
  const note = await p.evaluate(id => (JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(x => x.id === id) || {}).note, jid);
  t('правка документа сохранена кнопкой «назад», как и раньше', note === 'note from back test', note);
  await tab(p, 'home'); await clearToasts(p);
  const jid2 = await p.evaluate(() => { const e = [...document.querySelectorAll('#day-list .item')].find(x => (x.getAttribute('onclick') || '').includes('openJob')); return /'([^']+)'/.exec(e.getAttribute('onclick'))[1]; });
  await p.evaluate(id => window.App.openJob(id), jid2); await p.waitForTimeout(600);
  await back(p, 700); s = await st(p);
  const savedToast = await p.evaluate(() => [...document.querySelectorAll('#toasts > *')].some(x => /Сохранено|Saved/.test(x.textContent || '')));
  t('документ без правок: «назад» → главная, ничего не пересохраняется, подсказки нет', s.scr === 'home' && !s.hint && !savedToast, [s, savedToast]);

  console.log('— прокрутка: возврат в ту же точку —');
  await p.evaluate(() => { const a = document.getElementById('app'); a.scrollTop = 640; }); await p.waitForTimeout(200);
  const y0 = await p.evaluate(() => document.getElementById('app').scrollTop);
  await tab(p, 'settings');
  const yS = await p.evaluate(() => document.getElementById('app').scrollTop);
  await back(p); await p.waitForTimeout(250);
  const y1 = await p.evaluate(() => document.getElementById('app').scrollTop);
  s = await st(p);
  t('главная прокручена на ' + y0 + ' → настройки (сверху) → «назад»: главная в той же точке', y0 > 500 && yS < 50 && s.scr === 'home' && Math.abs(y1 - y0) <= 4, [y0, yS, y1]);

  console.log('— поиск на главной и редактор пропозала —');
  await p.evaluate(() => { document.getElementById('app').scrollTop = 0; });
  await p.fill('#home-search', 'Magnolia'); await p.waitForTimeout(500);
  t('поиск активен: лента дня спрятана', await p.evaluate(() => getComputedStyle(document.getElementById('day-list')).display === 'none'));
  await back(p); s = await st(p);
  t('«назад» сбросила поиск: лента дня на месте, поле пустое, подсказки нет',
    !s.hint && await p.evaluate(() => getComputedStyle(document.getElementById('day-list')).display !== 'none' && document.getElementById('home-search').value === ''), s);
  await tab(p, 'proposals');
  await p.evaluate(() => { const b = [...document.querySelectorAll('#app button')].find(x => /openProposal\(/.test(x.getAttribute('onclick') || '')); if (b) b.click(); else window.App.openProposal(); });
  await p.waitForTimeout(600);
  const edOpen = await p.evaluate(() => !!document.querySelector('.docbar'));
  await back(p, 600); s = await st(p);
  t('редактор пропозала: «назад» закрыла его, остались на «Пропозалах»', edOpen && s.scr === 'proposals' && !s.hint && await p.evaluate(() => !document.querySelector('.docbar')), [edOpen, s]);
  await back(p); s = await st(p);
  t('ещё «назад» → главная', s.scr === 'home' && !s.hint, s);

  console.log('— выход: только с главной и только вторым нажатием подряд —');
  await p.waitForTimeout(400); await clearToasts(p);
  await back(p); s = await st(p);
  t('первое «назад» на главной — подсказка', s.hint && s.inApp, s);
  await p.evaluate(() => history.back()); await p.waitForTimeout(900);
  t('второе подряд — приложение закрылось (страница ушла с index.html)', !/index\.html/.test(p.url()), p.url());
  await p.context().close();

  console.log('— ПК-режим, бухгалтер, экран входа —');
  p = await boot(br, { w: 1366, h: 768, mode: 'desktop' });
  await p.waitForTimeout(2600); await clearToasts(p);
  await tab(p, 'board'); await tab(p, 'reports'); await back(p); s = await st(p);
  t('ПК: доска → отчёты → «назад» (кнопка браузера) → доска', s.scr === 'board' && !s.hint, s);
  await back(p); s = await st(p);
  t('ПК: ещё «назад» → главная', s.scr === 'home' && !s.hint, s);
  await p.context().close();
  p = await boot(br, { w: 390, h: 844, touch: 1, who: 'demo-acc' });
  await p.waitForTimeout(1200); await clearToasts(p);
  s = await st(p);
  await tab(p, 'reports'); await back(p); const s2 = await st(p);
  t('бухгалтер: главный экран — «Бухгалтерия»; отчёты → «назад» → бухгалтерия', s.scr === 'acc' && s2.scr === 'acc' && !s2.hint, [s, s2]);
  await back(p); s = await st(p);
  t('бухгалтер: «назад» на «Бухгалтерии» — подсказка о выходе', s.scr === 'acc' && s.hint, s);
  await p.context().close();
  p = await boot(br, { w: 390, h: 844, touch: 1, who: null });
  await back(p);
  t('экран входа: «назад» — подсказка о выходе, приложение на месте',
    await p.evaluate((HINT) => [...document.querySelectorAll('#toasts > *')].some(x => (x.textContent || '').includes(HINT)) && !!document.querySelector('.login-wrap'), HINT));
  await p.context().close();

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('тест упал:', e); process.exit(2); });
