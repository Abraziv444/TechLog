/* Смоук v1.08.33: пуш-карточка и 2FA в настройках, глобальный поиск
   (активные свои / чужие «замком»), отчёт «Время», оптимизация маршрута,
   «Создать такую же», ⚙-доступы в Штате, значки машин. Демо-режим,
   Leaflet — DOM-заглушка. Запуск: node tests/v1_08_33.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8123;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript',
      body: require('fs').readFileSync('/tmp/pw/leaflet-stub.js', 'utf8') });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });

  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => {
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'desktop');
  });
  await p.reload(); await p.waitForTimeout(900);

  console.log('— настройки: уведомления, 2FA, функции, автобэкап —');
  await p.evaluate(() => window.App.go('settings'));
  await p.waitForTimeout(400);
  const folds = await p.evaluate(() => document.body.textContent);
  t('карточка «Уведомления» на месте', /Уведомления/.test(folds));
  t('карточка «Безопасность (2FA)» на месте', /Безопасность \(2FA\)/.test(folds));
  t('карточка «Функции» на месте (админ)', /Функции/.test(folds));
  t('карточка «Автобэкап» на месте (админ)', /Автобэкап/.test(folds));
  // раскрыть «Уведомления»: галочки видов
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.fold-h, .fold-head, button, .card [role="button"]')]
      .find(x => /Уведомления/.test(x.textContent || ''));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  const push = await p.evaluate(() => ({
    kinds: [...document.querySelectorAll('.chk-line')].map(l => l.textContent.trim()),
    tip: !!document.querySelector('.tipq'),
  }));
  t('галочки видов пушей (задача/пикап/апрув/просрочка/снятие)',
    ['Новая задача', 'Новый пикап', 'Апрув', 'просрочен', 'Апрув снят']
      .every(s => push.kinds.some(k => k.includes(s))), JSON.stringify(push.kinds));
  t('галочка Bouncie-ошибок присутствует (админ)', push.kinds.some(k => /Check Engine|Ошибки машины/.test(k)));
  t('тултипы «?» расставлены', push.tip);
  await p.screenshot({ path: '/tmp/pw/33-settings.png' });

  console.log('— глобальный поиск —');
  await p.click('.hdr-srch');
  await p.waitForSelector('#srch-q', { timeout: 3000 });
  await p.fill('#srch-q', 'magnolia');
  await p.waitForTimeout(250);
  const s1 = await p.evaluate(() => ({
    grps: document.querySelectorAll('.srch-grp').length,
    rows: document.querySelectorAll('.srch-row').length }));
  t('поиск по комплексу даёт группы', s1.grps >= 1 && s1.rows >= 1, JSON.stringify(s1));
  await p.fill('#srch-q', '916');
  await p.waitForTimeout(250);
  const s2 = await p.evaluate(() => ({
    rows: document.querySelectorAll('.srch-row').length,
    locked: document.querySelectorAll('.srch-row.locked').length }));
  t('админ: работа 916 активна (не «замком»)', s2.rows >= 1 && s2.locked === 0, JSON.stringify(s2));
  await p.screenshot({ path: '/tmp/pw/33-search.png' });
  await p.keyboard.press('Escape'); await p.evaluate(() => window.App.closeModal());

  console.log('— отчёты: вкладка «Время» —');
  await p.evaluate(() => window.App.go('reports'));
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.tabbtn')].find(x => /Время/.test(x.textContent));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  const tt = await p.evaluate(() => ({
    cards: document.querySelectorAll('.tt-card').length,
    rows: document.querySelectorAll('.tt-row').length,
    open: /ещё на объекте/.test(document.body.textContent),
    date: !!document.querySelector('.filters input[type="date"]') }));
  t('журнал времени: карточки по сотрудникам', tt.cards >= 2, JSON.stringify(tt));
  t('журнал времени: визиты и открытый «ещё на объекте»', tt.rows >= 3 && tt.open);
  t('журнал времени: день-пикер', tt.date);
  await p.screenshot({ path: '/tmp/pw/33-time.png' });

  console.log('— карта: оптимизация маршрута —');
  await p.evaluate(() => window.App.go('map'));
  await p.waitForTimeout(900);
  const hasOpt = await p.evaluate(() => !![...document.querySelectorAll('button')]
    .find(b => /Оптимизировать/.test(b.textContent)));
  t('кнопка «Оптимизировать» на карте дня', hasOpt);
  if (hasOpt){
    await p.evaluate(() => [...document.querySelectorAll('button')]
      .find(b => /Оптимизировать/.test(b.textContent)).click());
    await p.waitForTimeout(400);
    const opt = await p.evaluate(() => ({
      sum: (document.querySelector('.opt-sum') || {}).textContent || '',
      rows: document.querySelectorAll('.opt-list .map-row').length,
      open: !![...document.querySelectorAll('button')].find(b => /Открыть маршрут/.test(b.textContent)) }));
    t('модалка: «Сейчас X mi → Оптимально Y mi»', /Сейчас/.test(opt.sum) && /Оптимально/.test(opt.sum), opt.sum.slice(0, 60));
    t('модалка: список нового порядка', opt.rows >= 2, opt.rows);
    t('модалка: «Открыть маршрут» в навигаторе', opt.open);
    await p.screenshot({ path: '/tmp/pw/33-opt.png' });
    await p.evaluate(() => window.App.closeModal());
  }

  console.log('— работа: «Создать такую же» и перенос дня —');
  await p.evaluate(() => window.App.go('home'));
  await p.waitForTimeout(300);
  t('кнопка «Перенести день» у админа', await p.evaluate(() =>
    !!document.querySelector('.tpl-move')));
  await p.evaluate(() => window.App.setMine(false));   // у админа сегодня чужая работа 204
  await p.waitForTimeout(250);
  await p.evaluate(() => {
    const m = document.body.innerHTML.match(/openJob\('([^']+)'\)/);
    if (m) window.App.openJob(m[1]);
  });
  await p.waitForTimeout(400);
  const clone = await p.evaluate(() => !![...document.querySelectorAll('button')]
    .find(b => /Создать такую же/.test(b.textContent)));
  t('в открытой работе есть «Создать такую же»', clone);
  if (clone){
    await p.evaluate(() => [...document.querySelectorAll('button')]
      .find(b => /Создать такую же/.test(b.textContent)).click());
    await p.waitForTimeout(300);
    const dirty = await p.evaluate(() => !!document.querySelector('.docbar'));
    t('клон открыт черновиком (докбар на месте)', dirty);
    await p.evaluate(() => window.App.go('home'));
    await p.waitForTimeout(200);
  }

  console.log('— справочник: машины и штат —');
  await p.evaluate(() => window.App.go('dirs'));
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Автомобили/.test(x.textContent));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  const veh = await p.evaluate(() => ({
    mil: /Check Engine/.test(document.body.textContent),
    svc: /до ТО\s*\d+/.test(document.body.textContent),
    track: document.querySelectorAll('[onclick*="bnTrack"]').length }));
  t('машины: чип ⚠ Check Engine (RAM)', veh.mil, JSON.stringify(veh));
  t('машины: жёлтая метка «до ТО N mi» (Ford)', veh.svc);
  t('машины: кнопка трека у админа', veh.track >= 1);
  await p.screenshot({ path: '/tmp/pw/33-veh.png' });

  await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Сотрудники|Штат/.test(x.textContent));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  const gear = await p.evaluate(() => document.querySelectorAll('[onclick*="staffCfg"]').length);
  t('штат: ⚙ у каждого сотрудника', gear >= 3, gear);
  await p.evaluate(() => { const b = document.querySelector('[onclick*="staffCfg"]'); if (b) b.click(); });
  await p.waitForTimeout(300);
  const cfg = await p.evaluate(() => ({
    chk: document.querySelectorAll('.overlay .chk-line').length,
    seg: !!document.querySelector('.overlay .lang-seg'),
    seen: /Был\(а\) в сети/.test((document.querySelector('.overlay') || {}).textContent || '') }));
  t('⚙-модалка: галочки доступов (Bouncie + журнал)', cfg.chk >= 4, JSON.stringify(cfg));
  t('⚙-модалка: сегмент «чей журнал видит»', cfg.seg);
  t('⚙-модалка: строка «Был(а) в сети»', cfg.seen);
  await p.screenshot({ path: '/tmp/pw/33-staff.png' });
  await p.evaluate(() => window.App.closeModal());

  console.log('— воркер: чужие документы «замком» —');
  await p.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-tech'));
  await p.reload(); await p.waitForTimeout(900);
  await p.click('.hdr-srch');
  await p.waitForSelector('#srch-q', { timeout: 3000 });
  await p.fill('#srch-q', '916');            // работа админа
  await p.waitForTimeout(250);
  const w1 = await p.evaluate(() => ({
    locked: document.querySelectorAll('.srch-row.locked').length,
    txt: (document.querySelector('.srch-row.locked') || {}).textContent || '' }));
  t('чужая работа — неактивная строка', w1.locked >= 1, JSON.stringify(w1));
  t('строка содержит дату · номер · Имя Ф.', /Ivan P\./.test(w1.txt) && /INV|916/.test(w1.txt), w1.txt.trim());
  await p.fill('#srch-q', '204');            // своя работа техника
  await p.waitForTimeout(250);
  const w2 = await p.evaluate(() => ({
    act: [...document.querySelectorAll('.srch-row')].filter(r => !r.classList.contains('locked')).length }));
  t('своя работа открывается (активная строка)', w2.act >= 1, JSON.stringify(w2));
  await p.screenshot({ path: '/tmp/pw/33-search-tech.png' });

  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await br.close();
  console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('⛔', e); process.exit(1); });
