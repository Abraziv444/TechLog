/* =====================================================================
   TechLog · desktop.js — колонка сотрудников в ПК-режиме (v1.07.16)

   НАПРАВЛЕНИЕ ЗАВИСИМОСТИ — ТОЛЬКО desktop → mobile:
   ─ Файл ЧИТАЕТ публичные вещи мобильной версии и ничего в ней не меняет:
       · window.App.go / setMine / searchInput / searchClear — вызовы «ручек»,
         которые сама мобильная версия вешает на onclick своих кнопок;
       · localStorage['techlog_state_v1'].profiles — локальный кэш данных;
       · классы role-* на бейдже роли в шапке — чтобы узнать роль.
   ─ Каждое обращение обёрнуто в try/catch и feature-detect: если мобильная
     версия что-то переименует или уберёт, колонка просто исчезнет,
     а приложение продолжит работать как обычно.
   ─ Мобильная версия про этот файл не знает: он не трогает app.js,
     styles.css и содержимое #app.

   Как работает: слева от вертикальной навигации появляется колонка
   аватарок сотрудников (менеджеру и админу; технику не нужна — он видит
   только свои работы). Клик по аватарке = мобильный поиск по имени
   сотрудника → его работы и пикапы ЗА ВСЕ ДАТЫ с датами на карточках и
   переключателем «Инвойсы | Пикапы». Кнопка «Все» сбрасывает поиск и
   включает «Все» в фильтре «Мои/Все».
   ===================================================================== */
(function () {
  'use strict';

  var LS_DATA = 'techlog_state_v1';   // кэш данных мобильной версии (read-only)
  var MIN_W = 1180;                   // колонка нужна только на широком экране
  var RAIL_ID = 'dsk-staff';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function isDesktop() { try { return document.documentElement.classList.contains('tl-desktop'); } catch (e) { return false; } }
  function isWide() {
    try { return !window.matchMedia || window.matchMedia('(min-width:' + MIN_W + 'px)').matches; }
    catch (e) { return true; }
  }
  function api() { // публичные «ручки» мобильной версии; без них колонка не показывается
    var A = window.App;
    if (!A) return null;
    if (typeof A.searchInput !== 'function' || typeof A.go !== 'function') return null;
    return A;
  }
  function myRole() { // роль текущего пользователя — из бейджа в шапке
    try {
      var el = document.querySelector('.topbar .role-tag');
      if (!el) return null;
      if (el.classList.contains('role-admin')) return 'admin';
      if (el.classList.contains('role-manager')) return 'manager';
      if (el.classList.contains('role-tech')) return 'tech';
    } catch (e) {}
    return null;
  }
  function profiles() {
    try {
      var d = JSON.parse(lsGet(LS_DATA) || 'null');
      var arr = (d && Array.isArray(d.profiles)) ? d.profiles : [];
      var ord = { tech: 0, manager: 1, admin: 2 };
      return arr.filter(function (p) { return p && p.display_name && !p.blocked; })
        .sort(function (a, b) {
          var r = (ord[a.role] ?? 3) - (ord[b.role] ?? 3);
          return r !== 0 ? r : String(a.display_name).localeCompare(String(b.display_name));
        });
    } catch (e) { return []; }
  }
  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    var s = (parts[0] || '').charAt(0) + (parts[1] || '').charAt(0);
    return (s || '?').toUpperCase();
  }
  function lang() { return lsGet('techlog_lang') === 'en' ? 'en' : 'ru'; }
  function T(k) {
    var ru = { all: 'Все', staff: 'Сотрудники', role_tech: 'сотрудник', role_manager: 'менеджер', role_admin: 'админ' };
    var en = { all: 'All', staff: 'Staff', role_tech: 'worker', role_manager: 'manager', role_admin: 'admin' };
    return (lang() === 'en' ? en : ru)[k] || k;
  }
  function currentQuery() {
    try { var i = document.getElementById('home-search'); return i ? String(i.value || '').trim() : ''; }
    catch (e) { return ''; }
  }

  /* ---------- действия (через мобильные «ручки») ---------- */
  function toHome(A) {
    // если поле поиска главной не в DOM — мы не на главной
    if (!document.getElementById('home-search')) A.go('home');
  }
  function pickAll() {
    var A = api(); if (!A) return;
    try {
      toHome(A);
      if (typeof A.setMine === 'function') A.setMine(false);
      if (typeof A.searchClear === 'function') A.searchClear(); else A.searchInput('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  }
  function pickStaff(name) {
    var A = api(); if (!A) return;
    try {
      toHome(A);
      if (typeof A.setMine === 'function') A.setMine(false); // видеть работы всех, не только «мои»
      A.searchInput(name);                                    // мобильный поиск: все даты, инвойсы+пикапы
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  }

  /* ---------- рендер колонки ---------- */
  var railEl = null, lastSig = '';

  function ensureRail() {
    if (railEl && document.body.contains(railEl)) return railEl;
    railEl = document.createElement('div');
    railEl.id = RAIL_ID;
    railEl.setAttribute('role', 'navigation');
    document.body.appendChild(railEl);
    return railEl;
  }
  function removeRail() {
    try { if (railEl) railEl.remove(); } catch (e) {}
    railEl = null; lastSig = '';
    try { document.documentElement.classList.remove('tl-staff'); } catch (e) {}
  }

  function build(list) {
    var el = ensureRail();
    el.setAttribute('aria-label', T('staff'));
    var html = '<div class="dsk-staff-title">' + T('staff') + '</div>' +
      '<button type="button" class="dsk-all" data-act="all" title="' + T('all') + '">' + T('all') + '</button>';
    list.forEach(function (p) {
      var nm = String(p.display_name);
      var role = (p.role === 'admin' || p.role === 'manager') ? p.role : 'tech';
      var first = nm.split(/\s+/)[0] || nm;
      html += '<button type="button" class="dsk-av role-' + role + '" data-name="' + nm.replace(/"/g, '&quot;') + '"' +
        ' title="' + nm.replace(/"/g, '&quot;') + ' · ' + T('role_' + role) + '">' +
        '<span class="dsk-ini">' + initials(nm) + '</span>' +
        '<span class="dsk-nm">' + first.replace(/</g, '&lt;') + '</span></button>';
    });
    el.innerHTML = html;
  }

  function highlight() {
    if (!railEl) return;
    var q = currentQuery().toLowerCase();
    var onHome = !!document.getElementById('home-search');
    var anyActive = false;
    railEl.querySelectorAll('.dsk-av').forEach(function (b) {
      var on = onHome && q && String(b.dataset.name || '').toLowerCase() === q;
      b.classList.toggle('on', on);
      if (on) anyActive = true;
    });
    var all = railEl.querySelector('.dsk-all');
    if (all) all.classList.toggle('on', onHome && !q && !anyActive);
  }

  function refresh() {
    try {
      var A = api();
      var role = myRole();
      var show = isDesktop() && isWide() && A && (role === 'manager' || role === 'admin');
      if (!show) { removeRail(); return; }
      var list = profiles();
      if (!list.length) { removeRail(); return; }
      var sig = lang() + '|' + list.map(function (p) { return p.id + ':' + p.display_name + ':' + p.role; }).join(',');
      if (sig !== lastSig) { build(list); lastSig = sig; }
      document.documentElement.classList.add('tl-staff');
      highlight();
    } catch (e) { removeRail(); }
  }

  /* один обработчик кликов на всю колонку */
  document.addEventListener('click', function (e) {
    try {
      var t = e.target && e.target.closest ? e.target.closest('#' + RAIL_ID + ' button') : null;
      if (!t) return;
      if (t.dataset.act === 'all') pickAll();
      else if (t.dataset.name) pickStaff(t.dataset.name);
      setTimeout(refresh, 50);
    } catch (err) {}
  });

  /* следим за перерисовками приложения, сменой режима и шириной окна */
  var deb = null;
  function schedule() { clearTimeout(deb); deb = setTimeout(refresh, 120); }
  function start() {
    try {
      var app = document.getElementById('app');
      if (app && window.MutationObserver) new MutationObserver(schedule).observe(app, { childList: true, subtree: false });
      if (window.MutationObserver) new MutationObserver(schedule)
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      window.addEventListener('resize', schedule);
      refresh();
      window.TLStaffRail = { refresh: refresh }; // для отладки
    } catch (e) { removeRail(); }
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', function () { try { start(); } catch (e) {} });
})();
