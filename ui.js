/* =====================================================================
   TechLog · ui.js — ОБЩИЕ ЭЛЕМЕНТЫ ИНТЕРФЕЙСА (v1.07.78)
   ---------------------------------------------------------------------
   Автономная надстройка: не зависит от app.js, при любой ошибке молча
   выключается и приложение остаётся прежним. Работает ОДИНАКОВО на
   телефоне и на ПК — здесь живёт всё, что должно выглядеть одинаково
   в обоих режимах:

     1) размер шрифта — личная настройка каждого участника (админ,
        менеджер, работник) в шагах 85…150 %; применяется до первого
        рендера, чтобы не было скачка вёрстки;
     2) выпадающие списки — свой список вместо системного для всех
        <select>, в стиле приложения (как .combo-list и календарь);
     3) календарь для input[type=date] — раньше был только в ПК-режиме
        (desktop.js), теперь общий.

   Публичные ручки: window.TLUI.{fontPct,fontSet,fontStep,FONT_STEPS,
   closeAll}. Событие 'tl-font' летит на window при смене масштаба.
   ===================================================================== */
(function () {
  'use strict';

  var html = document.documentElement;
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function ru() { return LS.get('techlog_lang', 'ru') !== 'en'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ===================================================================
     1 · РАЗМЕР ШРИФТА
     Базовые 16px из :root множатся на выбранный процент. Вся вёрстка
     построена на rem, поэтому меняется весь интерфейс разом — и в
     мобильном режиме, и в ПК, для любой роли. Значение личное и живёт
     на устройстве (у одного техника телефон, у другого — планшет).
     =================================================================== */
  var FONT_STEPS = [85, 92, 100, 110, 122, 135, 150];
  var FONT_KEY = 'techlog_font_pct';

  function fontPct() {
    var v = parseInt(LS.get(FONT_KEY, '100'), 10);
    if (!isFinite(v)) v = 100;
    return Math.max(FONT_STEPS[0], Math.min(FONT_STEPS[FONT_STEPS.length - 1], v));
  }
  function fontApply(pct) {
    try {
      /* v1.08.35: «компактно» на ПК меняет БАЗУ масштаба 16 → 14px, личный
         процент пользователя сохраняется и умножается на неё. Inline-стиль
         на <html> перебивает любой CSS, поэтому база живёт здесь. */
      var base = html.classList.contains('tl-compact') ? 14 : 16;
      html.style.fontSize = (base * pct / 100).toFixed(2) + 'px';
      html.setAttribute('data-fs', String(pct));
      html.classList.toggle('tl-fs-big', pct >= 122);
    } catch (e) {}
  }
  /* desktop.js шлёт это событие после переключения плотности */
  try { window.addEventListener('tl-density', function () { fontApply(fontPct()); }); } catch (e) {}
  function fontSet(pct) {
    var v = Number(pct) || 100;
    /* приводим к ближайшему шагу — чтобы «＋/−» и прямая установка совпадали */
    var best = FONT_STEPS[0];
    for (var i = 0; i < FONT_STEPS.length; i++)
      if (Math.abs(FONT_STEPS[i] - v) < Math.abs(best - v)) best = FONT_STEPS[i];
    LS.set(FONT_KEY, String(best));
    fontApply(best);
    try { window.dispatchEvent(new CustomEvent('tl-font', { detail: { pct: best } })); } catch (e) {}
    return best;
  }
  function fontStep(dir) {
    var cur = fontPct(), i = FONT_STEPS.indexOf(cur);
    if (i < 0) { i = 2; }
    i = Math.max(0, Math.min(FONT_STEPS.length - 1, i + (dir > 0 ? 1 : -1)));
    return fontSet(FONT_STEPS[i]);
  }
  fontApply(fontPct());                       // до первого рендера приложения

  /* Ctrl/⌘ + «+» / «−» / «0» — привычные горячие клавиши в ПК-режиме */
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '+' || e.key === '=') { fontStep(1); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { fontStep(-1); e.preventDefault(); }
    else if (e.key === '0') { fontSet(100); e.preventDefault(); }
  });

  /* ===================================================================
     2 · ВЫПАДАЮЩИЕ СПИСКИ
     Системный список выглядит по-своему в каждой ОС (и белым на iOS).
     Рисуем свой — тем же тёмным стеклом, что у .combo-list и календаря.
     Значение пишется в сам <select> и рассылаются input+change, поэтому
     все прежние обработчики onchange="App…" работают как раньше.
     =================================================================== */
  var dd = null, ddSel = null;

  function ddClose() {
    if (dd) dd.remove();
    dd = null; ddSel = null;
  }
  function ddPick(i) {
    var s = ddSel;
    if (!s) return ddClose();
    var o = s.options[i];
    if (!o || o.disabled) return;
    s.selectedIndex = i;
    ddClose();
    try {
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  }
  function ddPlace(sel) {
    var r = sel.getBoundingClientRect();
    var w = Math.max(r.width, 190);
    w = Math.min(w, window.innerWidth - 16);
    dd.style.width = w + 'px';
    dd.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    dd.style.top = '0px';
    var h = dd.offsetHeight;
    var below = window.innerHeight - r.bottom - 10, above = r.top - 10;
    if (h > below && above > below) dd.style.top = Math.max(8, r.top - h - 6) + 'px';
    else dd.style.top = (r.bottom + 6) + 'px';
  }
  function ddOpen(sel) {
    if (ddSel === sel) return ddClose();          // повторный тап — закрыть
    ddClose();
    var opts = Array.prototype.slice.call(sel.options || []);
    if (!opts.length) return;
    ddSel = sel;
    dd = document.createElement('div');
    dd.className = 'tl-dd';
    dd.setAttribute('role', 'listbox');
    dd.innerHTML = opts.map(function (o, i) {
      var cls = 'tl-dd-o' + (o.selected ? ' sel' : '') + (o.disabled ? ' dis' : '');
      var txt = esc(o.label || o.textContent || '');
      return '<button type="button" class="' + cls + '" data-i="' + i + '" role="option">' +
        '<span class="tl-dd-t">' + (txt || '—') + '</span></button>';
    }).join('');
    dd.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tl-dd-o') : null;
      if (b && !b.classList.contains('dis')) ddPick(+b.dataset.i);
    });
    document.body.appendChild(dd);
    ddPlace(sel);
    var cur = dd.querySelector('.tl-dd-o.sel');
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  }
  function ddTarget(e) {
    var t = e.target;
    var s = t && t.closest ? t.closest('select') : null;
    if (!s || s.disabled || s.multiple || s.size > 1 || s.hasAttribute('data-native')) return null;
    return s;
  }
  /* pointerdown перехватывает и мышь, и палец: системный список не
     успевает открыться. Фокус ставим сами — доступность не теряется. */
  document.addEventListener('pointerdown', function (e) {
    try {
      var s = ddTarget(e);
      if (s) {
        e.preventDefault();
        try { s.focus({ preventScroll: true }); } catch (err) { s.focus(); }
        ddOpen(s);
        return;
      }
      if (dd && !dd.contains(e.target)) ddClose();
    } catch (err) {}
  }, true);
  /* браузеры без Pointer Events (старый iOS) — тот же путь через mousedown */
  document.addEventListener('mousedown', function (e) {
    try {
      if (window.PointerEvent) return;
      var s = ddTarget(e);
      if (s) { e.preventDefault(); ddOpen(s); }
      else if (dd && !dd.contains(e.target)) ddClose();
    } catch (err) {}
  }, true);
  document.addEventListener('click', function (e) {
    try { if (ddTarget(e)) e.preventDefault(); } catch (err) {}
  }, true);
  document.addEventListener('keydown', function (e) {
    try {
      if (e.key === 'Escape') { ddClose(); return; }
      var s = ddTarget(e);
      if (s && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
        e.preventDefault(); ddOpen(s);
      }
    } catch (err) {}
  });

  /* ===================================================================
     3 · КАЛЕНДАРЬ ДЛЯ ПОЛЕЙ ДАТЫ (был в desktop.js, теперь общий)
     Клик в любое место input[type=date] открывает тёмный календарь в
     стиле приложения: неделя с понедельника, «Сегодня» / «Очистить»,
     ‹ › по месяцам. Выбор пишет value и шлёт input+change.
     =================================================================== */
  var cal = null, curInput = null, view = null;   // view = {y, m}
  var M_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  var M_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var W_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  var W_EN = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parse(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
  }
  function calClose() {
    if (cal) cal.remove();
    cal = null; curInput = null; view = null;
  }
  function setVal(v) {
    if (!curInput) return calClose();
    curInput.value = v;
    try {
      curInput.dispatchEvent(new Event('input',  { bubbles: true }));
      curInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
    calClose();
  }
  function inRange(v) {
    if (!curInput) return true;
    if (curInput.min && v < curInput.min) return false;
    if (curInput.max && v > curInput.max) return false;
    return true;
  }
  function grid() {
    var t = new Date(), tISO = iso(t.getFullYear(), t.getMonth(), t.getDate());
    var sel = parse(curInput && curInput.value);
    var first = new Date(view.y, view.m, 1);
    var lead = (first.getDay() + 6) % 7;                    // Пн=0
    var days = new Date(view.y, view.m + 1, 0).getDate();
    var prevDays = new Date(view.y, view.m, 0).getDate();
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = i - lead + 1, y = view.y, m = view.m, out = false;
      if (d < 1) { m--; d = prevDays + d; out = true; if (m < 0) { m = 11; y--; } }
      else if (d > days) { d -= days; m++; out = true; if (m > 11) { m = 0; y++; } }
      var v = iso(y, m, d);
      var cls = 'dcal-day' + (out ? ' out' : '') +
        (v === tISO ? ' today' : '') +
        (sel && v === iso(sel.y, sel.m, sel.d) ? ' sel' : '') +
        (inRange(v) ? '' : ' dis');
      cells += '<button type="button" class="' + cls + '" data-v="' + v + '">' + d + '</button>';
    }
    return cells;
  }
  function paint() {
    var mm = (ru() ? M_RU : M_EN)[view.m];
    var wd = (ru() ? W_RU : W_EN).map(function (w) { return '<span>' + w + '</span>'; }).join('');
    cal.innerHTML =
      '<div class="dcal-h">' +
        '<button type="button" class="dcal-nav" data-nav="-1" aria-label="&lt;">' + chev('l') + '</button>' +
        '<b>' + mm + ' ' + view.y + '</b>' +
        '<button type="button" class="dcal-nav" data-nav="1" aria-label="&gt;">' + chev('r') + '</button>' +
      '</div>' +
      '<div class="dcal-w">' + wd + '</div>' +
      '<div class="dcal-g">' + grid() + '</div>' +
      '<div class="dcal-f">' +
        '<button type="button" class="dcal-btn" data-act="today">' + (ru() ? 'Сегодня' : 'Today') + '</button>' +
        '<button type="button" class="dcal-btn" data-act="clear">' + (ru() ? 'Очистить' : 'Clear') + '</button>' +
      '</div>';
  }
  /* та же рисованная стрелка, что и в наборе иконок приложения */
  function chev(side) {
    var d = side === 'l' ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7';
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  }
  function place(inp) {
    var r = inp.getBoundingClientRect(), W = 272, H = cal.offsetHeight || 330;
    var x = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    var y = r.bottom + 6;
    if (y + H > window.innerHeight - 8) y = Math.max(8, r.top - H - 6);
    cal.style.left = x + 'px'; cal.style.top = y + 'px';
  }
  function calOpen(inp) {
    if (curInput === inp) return calClose();                // повторный клик — закрыть
    calClose();
    curInput = inp;
    var s = parse(inp.value), t = new Date();
    view = s ? { y: s.y, m: s.m } : { y: t.getFullYear(), m: t.getMonth() };
    cal = document.createElement('div');
    cal.id = 'dsk-cal';
    cal.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.dataset.nav) {
        view.m += +b.dataset.nav;
        if (view.m < 0) { view.m = 11; view.y--; }
        if (view.m > 11) { view.m = 0; view.y++; }
        paint(); return;
      }
      if (b.dataset.act === 'today') {
        var n = new Date(), v = iso(n.getFullYear(), n.getMonth(), n.getDate());
        if (inRange(v)) setVal(v);
        return;
      }
      if (b.dataset.act === 'clear') { setVal(''); return; }
      if (b.dataset.v && !b.classList.contains('dis')) setVal(b.dataset.v);
    });
    document.body.appendChild(cal);
    paint(); place(inp);
  }
  document.addEventListener('click', function (e) {
    try {
      var t = e.target;
      var inp = t && t.closest ? t.closest('input[type="date"]') : null;
      if (inp && !inp.readOnly && !inp.disabled) { e.preventDefault(); calOpen(inp); return; }
      if (cal && !cal.contains(t)) calClose();
    } catch (err) {}
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cal) calClose(); });
  window.addEventListener('resize', function () { calClose(); ddClose(); });
  /* passive — иначе браузер ждёт JS на каждой прокрутке любого блока */
  document.addEventListener('scroll', function (e) {
    var t = e.target && e.target.nodeType === 1 ? e.target : null;
    if (cal && !(t && cal.contains(t))) calClose();
    if (dd && !(t && dd.contains(t))) ddClose();
  }, { capture: true, passive: true });

  window.TLUI = {
    FONT_STEPS: FONT_STEPS,
    fontPct: fontPct,
    fontSet: fontSet,
    fontStep: fontStep,
    closeAll: function () { ddClose(); calClose(); }
  };
})();
