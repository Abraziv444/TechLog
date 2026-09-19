/* =====================================================================
   TechLog · viewmode.js — переключатель «Телефон | Компьютер» (v1.07.40)

   АРХИТЕКТУРНОЕ ПРАВИЛО (однонаправленная зависимость):
   ─ Мобильная версия = базовая. Это app.js + styles.css, и этот файл
     их НЕ трогает и НИКАК от них не зависит (ни одной функции App.*).
   ─ Десктопная версия = надстройка: класс `tl-desktop` на <html>
     включает правила из desktop.css поверх той же самой разметки.
   ─ Меняем мобильную версию → десктоп наследует изменения сам.
     Меняем десктоп (desktop.css) → мобильная не видит этого в принципе:
     без класса tl-desktop ни одно правило desktop.css не срабатывает.
   ─ Если этот файл или desktop.css не загрузятся/сломаются — приложение
     продолжает работать как обычная мобильная версия.

   Хранение выбора: localStorage['techlog_view_mode'] = 'mobile'|'desktop'.
   Чтение localStorage['techlog_lang'] — только для подписи кнопок (read-only).

   v1.09.05 · ХОЛСТ ПК-РЕЖИМА НА МАЛЕНЬКОМ СЕНСОРНОМ ЭКРАНЕ.
   viewport у приложения — device-width: у Full HD-телефона это ≈412 CSS-px
   в книжной и ≈915 в альбомной ориентации, а вся ПК-раскладка desktop.css
   стоит за min-width:980px. Поэтому «ПК-режим» на телефоне рисовал мобильную
   вёрстку. Теперь, когда режим «ПК» выбран ЯВНО, палец — основной указатель,
   а экран уже 980 CSS-px, страница рисуется на холсте шириной W
   (<meta viewport width=W>) и браузер сам масштабирует её под экран — тот же
   механизм, что «Версия для ПК» в браузере. Приложение при этом видит
   innerWidth = W, и вся логика (media queries, авто-подгон доски) работает
   без единой правки.
     localStorage['techlog_pc_canvas'] = 'auto' | 'off' | '1100'…'1920'
     (настройка УСТРОЙСТВА — зависит от экрана, в профиль не пишется).
   Читаемость: масштаб не ниже 0.45 — иначе берётся ширина поменьше, а если
   не проходит и 1100 (телефон в книжной ориентации) — холста нет.
   ===================================================================== */
(function () {
  'use strict';

  var KEY = 'techlog_view_mode';
  var CLS = 'tl-desktop';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function getMode() {
    var m = safeGet(KEY);
    if (m === 'desktop' || m === 'mobile') return m;
    /* v1.08.46: на новом устройстве режим выбирается сам — мышь + широкий
       экран = ПК, иначе телефон. В localStorage НИЧЕГО не пишем: автовыбор —
       не выбор человека; ручной клик по пилюле по-прежнему сильнее и
       запоминается. app.js (vmCur) считает точно так же. */
    try {
      if (window.matchMedia('(hover:hover) and (pointer:fine)').matches
          && window.innerWidth >= 1024) return 'desktop';
    } catch (e) {}
    return 'mobile';
  }

  function labels() {
    var lang = safeGet('techlog_lang') === 'en' ? 'en' : 'ru';
    return lang === 'en'
      ? { group: 'Interface mode', mobile: 'Phone', desktop: 'Desktop' }
      : { group: 'Режим интерфейса', mobile: 'Телефон', desktop: 'Компьютер' };
  }

  /* Класс на <html> ставим сразу, до отрисовки — чтобы десктоп-режим
     не мигал мобильной вёрсткой при загрузке. */
  function applyClass(mode) {
    try { document.documentElement.classList.toggle(CLS, mode === 'desktop'); } catch (e) {}
  }

  /* Собственные стили переключателя. Изолированный префикс vm-.
     Цвета берём из переменных мобильной темы (десктоп зависит от мобильной,
     не наоборот) с запасными значениями на случай их переименования.

     v1.07.17: пилюля сидит В ЛИНИИ ШАПКИ — по центру, между логотипом и
     аватаркой. Приём: сам .vm-bar имеет высоту 0 (не занимает свой ряд),
     а пилюля опускается на высоту строки шапки через top. В мобильной
     версии подписи скрыты — только SVG-значки; активная кнопка синяя.
     На очень узких телефонах (<480px) пилюля возвращается в свой ряд,
     чтобы не наехать на название программы. Точную позицию в ПК-режиме
     задаёт desktop.css (учитывает боковые панели). */
  var CSS =
    /* align-items:flex-start обязателен: контейнер имеет height:0, и дефолтный
       stretch схлопывал пилюлю по вертикали — иконки «вываливались» за рамку */
    '.vm-bar{position:fixed;top:0;right:0;height:0;z-index:46;pointer-events:none;}' +
    '.vm-seg{pointer-events:auto;position:fixed;top:calc(env(safe-area-inset-top,0px) + 42px);right:70px;' +
      'transform:scale(.85);transform-origin:top right;display:inline-flex;gap:4px;' +
      'background:var(--panel,#17232A);border:2px solid var(--line,#31434C);' +
      'border-radius:999px;padding:3px;}' +
    '.vm-btn{font:inherit;font-weight:800;font-size:.72rem;letter-spacing:.4px;' +
      'text-transform:uppercase;color:var(--dim,#8AA0AB);background:none;border:none;' +
      'border-radius:999px;padding:5px 11px;cursor:pointer;display:inline-flex;' +
      'align-items:center;gap:6px;line-height:1;-webkit-tap-highlight-color:transparent;}' +
    '.vm-btn span{display:none;}' +                                    /* мобильная: только значки */
    '.vm-btn svg{width:15px;height:15px;flex:0 0 auto;display:block;}' +
    '.vm-btn.on{background:var(--blue,#1CB0F6);color:#04314A;}' +      /* активная — синяя */
    '.vm-btn:not(.on):hover{color:var(--blue,#1CB0F6);}' +
    '.vm-btn:focus-visible{outline:3px solid rgba(28,176,246,.45);outline-offset:1px;}' +
    /* v1.09.05: холст ПК-режима. Мобильный браузер на широком холсте «раздувает»
       абзацы (font boosting) и ломает вёрстку — запрещаем. Подсказка о масштабе
       рисуется в --vs раз крупнее: страница уменьшена, а палец прежний. */
    'html.tl-vscale{-webkit-text-size-adjust:100%;text-size-adjust:100%;}' +
    '#vm-canvas-hint{position:fixed;left:50%;transform:translateX(-50%);z-index:1300;' +
      'top:calc(env(safe-area-inset-top,0px) + 10px * var(--vs,1));' +
      'width:min(calc(340px * var(--vs,1)), 92vw);box-sizing:border-box;' +
      'background:var(--panel,#17232A);color:var(--text,#F1F7FB);border:2px solid var(--blue,#1CB0F6);' +
      'border-radius:calc(14px * var(--vs,1));padding:calc(10px * var(--vs,1)) calc(12px * var(--vs,1));' +
      'font-weight:700;font-size:calc(13px * var(--vs,1));line-height:1.3;box-shadow:0 10px 30px rgba(0,0,0,.55);}' +
    '#vm-canvas-hint .vch-b{display:flex;gap:calc(8px * var(--vs,1));margin-top:calc(8px * var(--vs,1));}' +
    '#vm-canvas-hint button{flex:1;font:inherit;font-weight:900;cursor:pointer;color:var(--text,#F1F7FB);' +
      'background:var(--panel-2,#1C2B33);border:2px solid var(--line,#31434C);' +
      'border-radius:calc(12px * var(--vs,1));min-height:calc(40px * var(--vs,1));padding:0 calc(10px * var(--vs,1));}' +
    '#vm-canvas-hint button[data-a="phone"]{background:var(--blue,#1CB0F6);border-color:var(--blue,#1CB0F6);color:#04314A;}' +
    '';  /* v1.07.40: подписи не показываем нигде — мини-пилюля (только значки)
             одинакова на телефоне и ПК; после входа её рисует сама шапка (#vm-slot),
             а эта плавающая остаётся только на экране логина. */

  function injectStyles() {
    if (document.getElementById('vm-style')) return;
    var st = document.createElement('style');
    st.id = 'vm-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  var btnMobile = null, btnDesktop = null;

  function paintButtons(mode) {
    if (!btnMobile || !btnDesktop) return;
    var L = labels(); // подписи освежаем при каждом клике (вдруг сменили язык)
    btnMobile.className = 'vm-btn' + (mode === 'mobile' ? ' on' : '');
    btnDesktop.className = 'vm-btn' + (mode === 'desktop' ? ' on' : '');
    btnMobile.setAttribute('aria-pressed', mode === 'mobile' ? 'true' : 'false');
    btnDesktop.setAttribute('aria-pressed', mode === 'desktop' ? 'true' : 'false');
    /* v1.07.20: SVG вместо эмодзи — одинаковы на всех платформах и
       гарантированно внутри границ пилюли */
    var IC_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
    var IC_DESK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/></svg>';
    btnMobile.innerHTML = IC_PHONE + '<span>' + L.mobile + '</span>';
    btnDesktop.innerHTML = IC_DESK + '<span>' + L.desktop + '</span>';
    var bar = document.getElementById('vm-bar');
    if (bar) bar.setAttribute('aria-label', L.group);
  }

  /* ------------------------------------------------------------------
     v1.09.05 · холст ПК-режима (см. шапку файла)
     ------------------------------------------------------------------ */
  var CANVAS_KEY = 'techlog_pc_canvas';
  var CANVAS_STEPS = [1100, 1280, 1440, 1600, 1920];
  var CANVAS_AUTO = 1100;
  var MIN_SCALE = 0.45;
  var VP_BASE = 'width=device-width, initial-scale=1, viewport-fit=cover';
  var canvasW = 0;            // применённая ширина холста; 0 — холста нет
  var canvasDead = false;     // браузер игнорирует <meta viewport> (настольный)
  var html = document.documentElement;

  /* any-pointer: телефон с подключённой мышью остаётся телефоном (у него основной
     указатель становится «точным», и холст иначе пропадал бы вместе с мышью) */
  function coarse() {
    try { return window.matchMedia('(any-pointer:coarse)').matches || window.matchMedia('(pointer:coarse)').matches; } catch (e) { return false; }
  }
  function isLandscape() {
    try { if (screen.orientation && screen.orientation.type) return /landscape/.test(screen.orientation.type); } catch (e) {}
    try { if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90; } catch (e) {}
    try { return window.matchMedia('(orientation: landscape)').matches; } catch (e) {}
    return false;
  }
  /* ширина экрана в CSS-px при device-width. Android и эмуляторы меняют
     screen.width/height местами при повороте, iOS — никогда (всегда «книжные»),
     поэтому у iOS сторону выбираем по ориентации. От <meta viewport> значение
     не зависит — иначе после включения холста мы бы мерили сам холст. */
  function nativeW() {
    var sw = 0, sh = 0;
    try { sw = +screen.width || 0; sh = +screen.height || 0; } catch (e) {}
    if (!sw || !sh) return 0;
    if (sw > sh) return sw;
    return isLandscape() ? sh : sw;
  }
  function canvasPref() {
    var v = safeGet(CANVAS_KEY);
    if (v === 'off') return 'off';
    var nn = parseInt(v, 10);
    return CANVAS_STEPS.indexOf(nn) >= 0 ? nn : 'auto';
  }
  /* маленький сенсорный экран — там, где холст вообще имеет смысл */
  function canvasApplicable() {
    var nw = nativeW();
    return !canvasDead && coarse() && nw > 0 && nw < 980;
  }
  function canvasPlan(mode) {
    if (mode !== 'desktop' || !canvasApplicable()) return 0;
    if (safeGet(KEY) !== 'desktop') return 0;          // только ЯВНО выбранный режим «ПК»
    var pref = canvasPref();
    if (pref === 'off') return 0;
    var want = pref === 'auto' ? CANVAS_AUTO : pref;
    var nw = nativeW(), best = 0;
    for (var i = 0; i < CANVAS_STEPS.length; i++) {
      var w = CANVAS_STEPS[i];
      if (w <= want && nw / w >= MIN_SCALE) best = w;
    }
    return best;
  }
  function vpMeta() { try { return document.querySelector('meta[name="viewport"]'); } catch (e) { return null; } }
  var verT = null;
  function applyCanvas(mode) {
    try {
      var m = vpMeta(); if (!m) return;
      var w = canvasPlan(mode), nw = nativeW();
      var content = w
        ? 'width=' + w + ', initial-scale=' + (Math.floor(nw / w * 10000) / 10000) + ', viewport-fit=cover'
        : VP_BASE;
      var changed = m.getAttribute('content') !== content;
      if (changed) m.setAttribute('content', content);
      var was = canvasW; canvasW = w;
      if (html.classList.contains('tl-vscale') !== !!w) html.classList.toggle('tl-vscale', !!w);
      if (w) html.style.setProperty('--vs', (w / nw).toFixed(3)); else html.style.removeProperty('--vs');
      if (changed || was !== w) {
        try { window.dispatchEvent(new CustomEvent('tl:canvas', { detail: canvasInfo() })); } catch (e) {}
      }
      if (w && changed) canvasVerify(0);
      if (!w) canvasHintClose();
    } catch (e) {}
  }
  /* самопроверка: настольный браузер на сенсорном ноутбуке <meta viewport>
     игнорирует — innerWidth остаётся шириной экрана. Тогда выключаемся. Решение
     не с первого замера: на медленном телефоне и в скрытой вкладке раскладка
     обновляется не сразу, и холст нельзя гасить по одному раннему замеру. */
  function canvasVerify(attempt) {
    clearTimeout(verT);
    verT = setTimeout(function () {
      try {
        if (!canvasW) return;
        if (document.hidden) { canvasVerify(attempt); return; }
        var iw = window.innerWidth, nw2 = nativeW();
        if (Math.abs(iw - canvasW) <= 12) { canvasHint(); return; }
        if (Math.abs(iw - nw2) <= 12) {
          if (attempt < 1) { canvasVerify(attempt + 1); return; }
          canvasDead = true; applyCanvas(getMode());
        } else canvasHint();
      } catch (e) {}
    }, attempt ? 1300 : 700);
  }
  function canvasInfo() {
    var nw = nativeW();
    return { applicable: canvasApplicable(), pref: canvasPref(), width: canvasW, native: nw,
             scale: canvasW && nw ? Math.round(nw / canvasW * 100) / 100 : 1,
             steps: CANVAS_STEPS.slice(), auto: CANVAS_AUTO, minScale: MIN_SCALE,
             /* какие ширины пройдут по читаемости на ЭТОМ экране в текущей ориентации */
             fit: CANVAS_STEPS.filter(function (w) { return nw && nw / w >= MIN_SCALE; }) };
  }
  function canvasSet(v) {
    var val = v === 'off' ? 'off' : (CANVAS_STEPS.indexOf(+v) >= 0 ? String(+v) : 'auto');
    safeSet(CANVAS_KEY, val);
    applyCanvas(getMode());
    return canvasInfo();
  }

  /* подсказка при первом включении холста за сессию: что произошло и как
     вернуться. Размеры умножены на --vs — иначе на уменьшенной странице в
     кнопку не попасть пальцем. */
  var hintEl = null, hintT = null;
  function canvasHintClose() { clearTimeout(hintT); if (hintEl) { try { hintEl.remove(); } catch (e) {} hintEl = null; } }
  function canvasHint() {
    try {
      if (!canvasW || hintEl) return;
      if (sessionStorage.getItem('tl_canvas_hint') === '1') return;
      sessionStorage.setItem('tl_canvas_hint', '1');
      var en = safeGet('techlog_lang') === 'en';
      var pct = Math.round(nativeW() / canvasW * 100);
      hintEl = document.createElement('div');
      hintEl.id = 'vm-canvas-hint';
      hintEl.setAttribute('role', 'status');
      hintEl.innerHTML =
        '<div class="vch-t">' + (en
          ? 'PC mode: the page is scaled to ' + pct + '% to fit this screen. Pinch to zoom.'
          : 'ПК-режим: страница уменьшена до ' + pct + '%, чтобы влезла раскладка компьютера. Щипок — увеличить.') + '</div>' +
        '<div class="vch-b"><button type="button" data-a="phone">' + (en ? 'Phone mode' : 'Режим «Телефон»') + '</button>' +
        '<button type="button" data-a="ok">OK</button></div>';
      hintEl.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!b) return;
        canvasHintClose();
        if (b.getAttribute('data-a') === 'phone') setMode('mobile');
      });
      document.body.appendChild(hintEl);
      hintT = setTimeout(canvasHintClose, 12000);
    } catch (e) {}
  }

  function setMode(mode) {
    safeSet(KEY, mode);
    applyClass(mode);
    applyCanvas(mode);
    paintButtons(mode);
    /* v1.07.40: сообщаем приложению (если оно есть) — оно перерисует шапку.
       Зависимость по-прежнему односторонняя: мы ничего из App.* не зовём. */
    try { window.dispatchEvent(new CustomEvent('tl:viewmode', { detail: { mode: mode } })); } catch (e) {}
  }

  function buildBar() {
    if (document.getElementById('vm-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'vm-bar';
    bar.className = 'vm-bar';
    bar.setAttribute('role', 'group');

    var seg = document.createElement('div');
    seg.className = 'vm-seg';

    btnMobile = document.createElement('button');
    btnMobile.type = 'button';
    btnMobile.addEventListener('click', function () { setMode('mobile'); });

    btnDesktop = document.createElement('button');
    btnDesktop.type = 'button';
    btnDesktop.addEventListener('click', function () { setMode('desktop'); });

    seg.appendChild(btnMobile);
    seg.appendChild(btnDesktop);
    bar.appendChild(seg);

    /* Ставим бар ПЕРВЫМ элементом body — выше #app. Приложение
       перерисовывает только innerHTML самого #app, поэтому наш бар
       живёт независимо и не стирается при render(). */
    document.body.insertBefore(bar, document.body.firstChild);
    paintButtons(getMode());
  }

  try {
    applyClass(getMode());           // класс — мгновенно, до первой отрисовки
    applyCanvas(getMode());          // v1.09.05: холст — тоже до первой отрисовки
    injectStyles();
    if (document.body) buildBar();
    else document.addEventListener('DOMContentLoaded', function () {
      try { buildBar(); } catch (e) {}
    });
    /* при возвращении на вкладку освежаем подписи (могли сменить язык) */
    document.addEventListener('visibilitychange', function () {
      try { if (!document.hidden) paintButtons(getMode()); } catch (e) {}
    });
    /* v1.09.05: поворот экрана меняет «родную» ширину — пересчитать холст.
       Сам холст тоже даёт resize, но план от него не зависит (меряем screen,
       а не окно), поэтому <meta> второй раз не переписывается — петли нет. */
    var cvT = null;
    var cvSched = function () { clearTimeout(cvT); cvT = setTimeout(function () { try { applyCanvas(getMode()); } catch (e) {} }, 180); };
    window.addEventListener('orientationchange', cvSched);
    window.addEventListener('resize', cvSched, { passive: true });
    try { if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', cvSched); } catch (e) {}
    window.TLViewMode = { get: getMode, set: setMode }; // для отладки
  } catch (e) {
    /* Любая ошибка здесь не должна мешать приложению: молча остаёмся
       в мобильном режиме. */
    try { document.documentElement.classList.remove(CLS); } catch (e2) {}
  }

  /* v1.07.29: пилюля всегда стоит ПОД бейджем роли, на любой ширине.
     Фиксированные отступы от края окна ломались на планшетах, где контент
     уже окна — теперь позицию считаем от реального положения .role-tag. */
  var _segState = null;
  function placeSeg() {
    /* v1.07.40: правило одно для всех режимов и ширин. Залогинены
       (#vm-slot в шапке) → плавающая пилюля скрыта: переключатель рисует
       сама шапка, одинаково на телефоне и ПК. Экран логина → плавающая
       видна в правом верхнем углу. Раньше на ПК жила отдельная центральная
       пилюля с подписями: две реализации расходились подсветкой, а на
       границе 980px переключатель вовсе пропадал. */
    /* дешёвый выход: пока состояние «залогинен / экран логина» не менялось,
       трогать DOM незачем (v1.07.67) */
    var logged = !!document.getElementById('vm-slot');
    if (_segState === logged) return;
    var seg = document.querySelector('.vm-seg');
    if (!seg) return;
    _segState = logged;
    var bar = document.querySelector('.vm-bar');
    if (bar && bar.style.zIndex !== '120') bar.style.zIndex = '120';
    if (bar && seg.parentNode !== bar) bar.appendChild(seg);
    if (document.getElementById('vm-slot')) {   // залогинены — пилюля в шапке
      if (seg.style.display !== 'none') seg.style.display = 'none';
      return;
    }
    seg.style.display = '';                     // экран логина
    seg.style.position = 'fixed';
    seg.style.zIndex = '120';
    seg.style.transform = 'scale(.85)';
    seg.style.right = '12px';
    seg.style.top = 'calc(env(safe-area-inset-top,0px) + 10px)';
  }
  window.TLView = { setMode: setMode,     // v1.07.38: шапка дергает режим напрямую
    /* v1.09.05: холст ПК-режима — строка настроек в app.js и тесты */
    canvasInfo: canvasInfo, canvasSet: canvasSet, canvasApply: function () { applyCanvas(getMode()); } };
  window.addEventListener('resize', placeSeg, { passive: true });
  /* v1.07.67: слушателя scroll здесь больше нет. Пилюля — position:fixed,
     при прокрутке она не двигается, пересчитывать нечего; зато вызов на
     каждое событие прокрутки давал три querySelector и запись стилей.
     Периодической проверки раз в 400 мс достаточно (шапка меняется только
     при render()), а сама она теперь выходит по дешёвой проверке. */
  setInterval(placeSeg, 400);
  placeSeg();
})();
