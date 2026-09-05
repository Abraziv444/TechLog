/* =====================================================================
   TechLog · viewmode.js — переключатель «Телефон | Компьютер» (v1.07.15)

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
   ===================================================================== */
(function () {
  'use strict';

  var KEY = 'techlog_view_mode';
  var CLS = 'tl-desktop';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function getMode() {
    var m = safeGet(KEY);
    return m === 'desktop' ? 'desktop' : 'mobile'; // по умолчанию — мобильная
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
    '@media (min-width:980px){html.tl-desktop .vm-btn span{display:inline;}' +
      'html.tl-desktop .vm-btn{padding:5px 14px;}}' +                  /* ПК-режим: с подписями */
    '';  /* v1.07.26: пилюля всегда справа под бейджем роли — ряда над шапкой больше нет */

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

  function setMode(mode) {
    safeSet(KEY, mode);
    applyClass(mode);
    paintButtons(mode);
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
    injectStyles();
    if (document.body) buildBar();
    else document.addEventListener('DOMContentLoaded', function () {
      try { buildBar(); } catch (e) {}
    });
    /* при возвращении на вкладку освежаем подписи (могли сменить язык) */
    document.addEventListener('visibilitychange', function () {
      try { if (!document.hidden) paintButtons(getMode()); } catch (e) {}
    });
    window.TLViewMode = { get: getMode, set: setMode }; // для отладки
  } catch (e) {
    /* Любая ошибка здесь не должна мешать приложению: молча остаёмся
       в мобильном режиме. */
    try { document.documentElement.classList.remove(CLS); } catch (e2) {}
  }

  /* v1.07.29: пилюля всегда стоит ПОД бейджем роли, на любой ширине.
     Фиксированные отступы от края окна ломались на планшетах, где контент
     уже окна — теперь позицию считаем от реального положения .role-tag. */
  function placeSeg() {
    /* v1.07.38: в мобильной раскладке переключатель рисует САМА шапка
       приложения (нативный поток вёрстки — выравнивание гарантировано,
       никаких координат). Наша пилюля там прячется; ПК-режим и экран
       логина продолжают использовать её как раньше. */
    var seg = document.querySelector('.vm-seg');
    if (!seg) return;
    var bar = document.querySelector('.vm-bar');
    if (bar && bar.style.zIndex !== '120') bar.style.zIndex = '120';
    if (bar && seg.parentNode !== bar) bar.appendChild(seg);
    var desktop = document.documentElement.classList.contains('tl-desktop')
      && window.innerWidth >= 980;
    if (desktop) {
      seg.style.display = '';
      seg.style.position = ''; seg.style.right = '';
      seg.style.top = ''; seg.style.transform = '';
      return;
    }
    if (document.getElementById('vm-slot')) {   // залогинены — пилюля в шапке
      seg.style.display = 'none';
      return;
    }
    seg.style.display = '';                     // экран логина
    seg.style.position = 'fixed';
    seg.style.zIndex = '120';
    seg.style.transform = 'scale(.85)';
    seg.style.right = '12px';
    seg.style.top = 'calc(env(safe-area-inset-top,0px) + 10px)';
  }
  window.TLView = { setMode: setMode };   // v1.07.38: шапка дергает режим напрямую
  window.addEventListener('resize', placeSeg);
  window.addEventListener('scroll', placeSeg, { passive: true });
  setInterval(placeSeg, 400);                             // шапка перерисовывается при render()
  placeSeg();
})();
