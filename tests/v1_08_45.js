/* Смоук v1.08.45: шапка, статусы связи, меню ПК, Shift-прокрутка, «глазик».
   1. Бейдж связи: кнопка слева от плашки роли (не под логотипом), фиксированная
      ширина — не прыгает при смене статуса; статус «нестабильно» — свой цвет.
   2. Клик по бейджу открывает модалку «Проверка связи»: окошко лога, строки
      сервисов, кнопка повторной проверки; закрытие работает.
   3. Глобальный поиск: в шапке кнопки нет, в меню (таббаре) — первый пункт,
      клик открывает поиск.
   4. ПК-меню: язычок со стрелкой ‹›, поворот при tl-menu-open; кнопка-pin
      в панели меню; закрепление ставит tl-menu-pin и пишется в localStorage.
   5. Shift + колесо: горизонтальная прокрутка ленты недели; без Shift
      обработчик не вмешивается.
   6. «Глазик»: в модалке смены пароля переключает type поля password ↔ text.
   Демо-режим. Запуск: node tests/v1_08_45.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8151;
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
    localStorage.removeItem('techlog_menu_pin');
  });
  await p.reload(); await p.waitForTimeout(1800);

  console.log('— 1. бейдж связи: место, кнопка, фиксированная ширина —');
  const pill = await p.evaluate(() => {
    const el = document.querySelector('.topbar .net-pill');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName, cls: el.className, txt: el.textContent.trim(),
      inRole: !!el.closest('.rt-role') && !!el.closest('.rt-role').querySelector('.role-tag'),
      underLogo: !!el.closest('.logo-wrap'),
      onclick: el.getAttribute('onclick') || '',
      minW: parseFloat(cs.minWidth) || 0,
      w: Math.round(el.getBoundingClientRect().width),
    };
  });
  t('бейдж — кнопка в строке роли, не под логотипом',
    !!pill && pill.tag === 'BUTTON' && pill.inRole && !pill.underLogo, JSON.stringify(pill));
  t('клик открывает модалку (onclick → App.netModal)', !!pill && /App\.netModal\(\)/.test(pill.onclick));
  t('фиксированная ширина ≥ 74px', !!pill && pill.minW >= 74 && pill.w >= pill.minW - 1, pill && (pill.minW + ' / ' + pill.w));
  /* тонкая пилюля, но поле нажатия расширено псевдоэлементом (как у vm-slot):
     точка на 5px НИЖЕ пилюли всё ещё попадает в кнопку */
  t('поле нажатия шире пилюли (клик под нижним краем попадает)', await p.evaluate(() => {
    const el = document.querySelector('.topbar .net-pill'), r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.bottom + 5);
    return at === el || (at && at.closest && at.closest('.net-pill') === el);
  }));

  /* смена статуса не меняет ширину: on → slow → warn (через ширину DOM-узла) */
  const widths = await p.evaluate(() => {
    const el = document.querySelector('.topbar .net-pill');
    const w = () => Math.round(el.getBoundingClientRect().width);
    const out = {};
    out.on = w();
    el.className = 'net-pill slow'; el.textContent = 'нестабильно'; out.slow = w();
    el.className = 'net-pill warn'; el.textContent = 'нет сервера'; out.warn = w();
    el.className = 'net-pill off';  el.textContent = 'офлайн';      out.off = w();
    const so = getComputedStyle(el);
    out.slowColorDiffers = (() => {
      el.className = 'net-pill slow';
      const c1 = getComputedStyle(el).borderTopColor;
      el.className = 'net-pill on';
      const c2 = getComputedStyle(el).borderTopColor;
      return c1 !== c2 ? (c1 + ' vs ' + c2) : '';
    })();
    return out;
  });
  t('ширина не прыгает: on = slow = warn = off',
    widths.on === widths.slow && widths.slow === widths.warn && widths.warn === widths.off,
    JSON.stringify(widths));
  t('статус «нестабильно» — свой цвет рамки (оранжевый ≠ зелёный)', !!widths.slowColorDiffers, widths.slowColorDiffers);
  /* вернуть живой бейдж */
  await p.evaluate(() => { const el = document.querySelector('.topbar .net-pill'); el.className = 'net-pill on'; });

  console.log('— 2. netState: порог «нестабильно» —');
  /* App.netState() читает NET из замыкания — проверяем через живой пинг:
     демо пингует локальный version.json, порог 500 мс тут не набрать,
     поэтому логика порога закрыта в tests/unit.js (jsdom, netSet(true, 640)).
     Здесь — что состояние отдаётся и «on» при живом локальном сервере. */
  t('netState() === on при живом локальном пинге', await p.evaluate(() => window.App.netState() === 'on'));

  console.log('— 3. модалка «Проверка связи» —');
  await p.click('.topbar .net-pill');
  await p.waitForSelector('#net-log', { timeout: 3000 });
  await p.waitForTimeout(1200);   /* строки набегают: интернет + пропуски + карты (абортится роутом) */
  const modal = await p.evaluate(() => ({
    run: !!document.querySelector('#net-run'),
    logLines: document.querySelectorAll('#net-log .mq-l').length,
    txt: (document.querySelector('#net-log') || {}).textContent || '',
    pillInModal: !!document.querySelector('#overlay .net-pill'),
  }));
  t('кнопка «Проверить связь» и окошко лога на месте', modal.run && modal.logLines >= 3, modal.logLines + ' строк');
  t('в логе есть строка «Интернет»', /Интернет/.test(modal.txt), modal.txt.slice(0, 120));
  t('в логе есть строка про карты (OSM)', /Сервис карт/.test(modal.txt));
  t('админ видит строки GitHub и Cloudflare', /GitHub/.test(modal.txt) && /Cloudflare/.test(modal.txt));
  t('бейдж продублирован в модалке', modal.pillInModal);
  await p.evaluate(() => window.App.closeModal());
  await p.waitForTimeout(200);
  t('модалка закрылась', await p.evaluate(() => !document.getElementById('overlay')));

  console.log('— 4. поиск в меню —');
  const srch = await p.evaluate(() => ({
    inTop: !!document.querySelector('.topbar .hdr-srch'),
    inBar: !!document.querySelector('.tabbar .hdr-srch'),
    first: (document.querySelector('.tabbar').firstElementChild || {}).className || '',
  }));
  t('в шапке кнопки поиска больше нет', !srch.inTop);
  t('в меню (таббаре) поиск есть — первым пунктом', srch.inBar && /hdr-srch/.test(srch.first), srch.first);
  await p.click('.tabbar .hdr-srch');
  await p.waitForSelector('#srch-q', { timeout: 3000 });
  t('клик по пункту меню открывает глобальный поиск', true);
  await p.evaluate(() => window.App.closeModal());

  console.log('— 5. ПК-меню: стрелка и закрепление —');
  await p.setViewportSize({ width: 1366, height: 900 });
  await p.evaluate(() => window.App.setVm('desktop'));
  await p.waitForTimeout(600);
  const menu = await p.evaluate(() => {
    const html = document.documentElement;
    window.TLBoardFit.buildTab();                       // язычок и pin строятся как в tl-fit
    html.classList.add('tl-fit');
    const tab = document.getElementById('dsk-menu-tab');
    const arr = tab && tab.querySelector('.arr');
    const pin = document.querySelector('.tabbar #dsk-menu-pin');
    const closed = arr ? getComputedStyle(arr).transform : '';
    /* transition .28s интерполирует transform — на время замера отключаем,
       чтобы прочитать КОНЕЧНОЕ значение, а не кадр анимации */
    if (arr) arr.style.transition = 'none';
    html.classList.add('tl-menu-open');
    const opened = arr ? getComputedStyle(arr).transform : '';
    html.classList.remove('tl-menu-open');
    if (arr) arr.style.transition = '';
    return {
      tab: !!tab, arr: !!arr, pin: !!pin,
      closed, opened,
      pinTitle: pin ? pin.title : '',
    };
  });
  t('язычок построен, стрелка обёрнута в .arr', menu.tab && menu.arr);
  t('меню выехало → стрелка повёрнута (transform менятся)', menu.closed !== menu.opened,
    menu.closed + ' → ' + menu.opened);
  t('стрелка повёрнута на 180° (matrix(-1 …))', /matrix\(-1/.test(menu.opened), menu.opened);
  t('кнопка-pin в панели меню, с подсказкой', menu.pin && /[Зз]акрепить|Pin/.test(menu.pinTitle), menu.pinTitle);

  const pinned = await p.evaluate(() => {
    document.documentElement.classList.add('tl-fit');
    window.TLBoardFit.pinSet(true);
    return {
      cls: document.documentElement.classList.contains('tl-menu-pin'),
      ls: localStorage.getItem('techlog_menu_pin'),
      api: window.TLBoardFit.pinned(),
    };
  });
  t('закрепление: html.tl-menu-pin + запись в localStorage', pinned.cls && pinned.ls === '1' && pinned.api,
    JSON.stringify(pinned));
  const unpinned = await p.evaluate(() => {
    window.TLBoardFit.pinSet(false);
    return {
      cls: document.documentElement.classList.contains('tl-menu-pin'),
      ls: localStorage.getItem('techlog_menu_pin'),
    };
  });
  t('открепление: класс снят, в localStorage «0»', !unpinned.cls && unpinned.ls === '0', JSON.stringify(unpinned));

  console.log('— 6. Shift + колесо —');
  await p.setViewportSize({ width: 360, height: 780 });
  await p.evaluate(() => window.App.setVm('mobile'));
  await p.waitForTimeout(500);
  await p.evaluate(() => window.App.go('home'));
  await p.waitForTimeout(500);
  const wheel = await p.evaluate(() => {
    const wd = document.getElementById('week-days');
    if (!wd) return { err: 'нет #week-days' };
    wd.scrollLeft = 0;
    const cell = wd.querySelector('.day-cell') || wd;
    /* без Shift обработчик не вооружён — прокрутки от нашего кода нет */
    cell.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    const noShift = wd.scrollLeft;
    /* зажали Shift → колесо над лентой листает её вбок */
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    cell.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, shiftKey: true, bubbles: true, cancelable: true }));
    const withShift = wd.scrollLeft;
    /* отпустили — обработчик снят */
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    cell.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, shiftKey: true, bubbles: true, cancelable: true }));
    const afterUp = wd.scrollLeft;
    return { canScroll: wd.scrollWidth > wd.clientWidth + 2, noShift, withShift, afterUp };
  });
  t('лента недели прокручивается по горизонтали', wheel.canScroll === true, JSON.stringify(wheel));
  t('без Shift наш код ленту не трогает', wheel.noShift === 0, String(wheel.noShift));
  t('Shift + колесо листает ленту вбок', wheel.withShift > 0, String(wheel.withShift));
  t('после отпускания Shift обработчик снят', wheel.afterUp === wheel.withShift,
    wheel.afterUp + ' vs ' + wheel.withShift);

  console.log('— 7. «глазик» у пароля —');
  await p.evaluate(() => window.App.ownPassModal());
  await p.waitForSelector('#op-pass', { timeout: 3000 });
  const eye1 = await p.evaluate(() => ({
    eyes: document.querySelectorAll('#overlay .pass-eye').length,
    type: document.getElementById('op-pass').type,
  }));
  t('в модалке смены пароля два «глазика», поля скрыты', eye1.eyes === 2 && eye1.type === 'password',
    JSON.stringify(eye1));
  await p.evaluate(() => { document.getElementById('op-pass').value = 'секрет123'; });
  await p.click('#overlay .pass-row .pass-eye');
  const eye2 = await p.evaluate(() => {
    const b = document.querySelector('#overlay .pass-row .pass-eye');
    return { type: document.getElementById('op-pass').type, on: b.classList.contains('on'),
      pressed: b.getAttribute('aria-pressed') };
  });
  t('нажат — ввод виден постоянно (type=text, кнопка подсвечена)',
    eye2.type === 'text' && eye2.on && eye2.pressed === 'true', JSON.stringify(eye2));
  await p.click('#overlay .pass-row .pass-eye');
  const eye3 = await p.evaluate(() => ({ type: document.getElementById('op-pass').type }));
  t('повторное нажатие снова прячет (type=password)', eye3.type === 'password');
  await p.evaluate(() => window.App.closeModal());

  console.log('— 8. вход с Supabase: «глазик» в разметке входа —');
  /* демо-режим рисует список пользователей; сама разметка SB-входа
     проверяется по исходнику приложения */
  const loginSrc = await p.evaluate(async () => {
    const s = await (await fetch('app.js')).text();
    const li = s.includes(`pass-row"><input id="li-pass"`) && s.includes(`passEyeBtn('li-pass')`);
    const su = s.includes(`pass-row"><input id="su-pass"`) && s.includes(`passEyeBtn('su-pass')`);
    return { li, su };
  });
  t('поле пароля входа — с «глазиком»', loginSrc.li);
  t('поле пароля регистрации — с «глазиком»', loginSrc.su);

  t('ошибок страницы нет', errs.length === 0, errs.join(' | ').slice(0, 200));

  await br.close();
  console.log(`\nИтого: ${ok} ок, ${bad} провал(ов)`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
