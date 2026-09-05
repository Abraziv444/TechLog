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
      try { localStorage.removeItem('techlog_staff_last'); } catch (e) {}   // v1.07.18
      toHome(A);
      if (typeof A.setMine === 'function') A.setMine(false);
      if (typeof A.searchClear === 'function') A.searchClear(); else A.searchInput('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  }
  function pickStaff(name) {
    var A = api(); if (!A) return;
    try {
      try { localStorage.setItem('techlog_staff_last', name); } catch (e) {}   // v1.07.18
      toHome(A);
      if (typeof A.setMine === 'function') A.setMine(false); // видеть работы всех, не только «мои»
      A.searchInput(name);                                    // мобильный поиск: все даты, инвойсы+пикапы
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  }

  /* ---------- рендер колонки ---------- */
  var railEl = null, lastSig = '', autoApplied = false;

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
    try { if (document.documentElement.classList.contains('tl-staff'))
      document.documentElement.classList.remove('tl-staff'); } catch (e) {}
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
      if (!document.documentElement.classList.contains('tl-staff'))
        document.documentElement.classList.add('tl-staff');
      /* v1.07.18: помним последнего выбранного сотрудника между сессиями */
      if (!autoApplied) {
        autoApplied = true;
        var saved = lsGet('techlog_staff_last');
        var inp = document.getElementById('home-search');
        if (saved && inp && !String(inp.value || '').trim() &&
            list.some(function (p) { return p.display_name === saved; })) {
          setTimeout(function () { try { pickStaff(saved); } catch (e) {} }, 60);
        }
      }
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

/* =====================================================================
   v1.07.18 · ПК-режим, модуль 2: верхняя панель формы инвойса,
   чипы периодов при выбранном сотруднике, горячие клавиши, плотность.
   Тот же принцип: только чтение DOM/localStorage мобильной версии и
   «нажатие» её собственных кнопок; всё в try/catch, при ошибке —
   элементы исчезают, приложение работает как обычно.
   ===================================================================== */
(function () {
  'use strict';

  function q(s, r) { return (r || document).querySelector(s); }
  function isDesk() { try { return document.documentElement.classList.contains('tl-desktop'); } catch (e) { return false; } }
  function wide(px) { try { return !window.matchMedia || window.matchMedia('(min-width:' + px + 'px)').matches; } catch (e) { return true; } }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ru() { return lsGet('techlog_lang') !== 'en'; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var SVG = {
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    down:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M5 19.5h14"/></svg>',
    dens:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>'
  };

  /* ---------------- ВЕРХНЯЯ ПАНЕЛЬ ФОРМЫ ИНВОЙСА ----------------
     Дубли: история, «работа выполнена», индикатор апрува (фиолетовый,
     только состояние), итог и скачивание PDF. Иконки без подписей;
     каждая кнопка «нажимает» соответствующий элемент мобильной формы. */
  var bar = null;

  function origDone()    { return q('#jb-done'); }
  function origTotal()   { return q('#jb-total'); }
  function origHistory() { return q('#app > .btn.btn-ghost[onclick*="jobHistory"]'); }
  function origPdf()     { return q('#app [onclick*="makePdf"]'); }
  function isApproved()  { return !!q('#app .badge-status.st-approved'); }

  function buildBar() {
    var back = q('#app > .back-top');
    if (!back || !q('#app .inv-sec')) { removeBar(); return; }
    if (bar && document.contains(bar)) { syncBar(); return; }
    bar = document.createElement('div');
    bar.id = 'dsk-jobbar';
    var T = ru()
      ? { hist: 'История работы', done: 'Работа выполнена', appr: 'Апрув', total: 'Итого', pdf: 'Скачать PDF-инвойс' }
      : { hist: 'Job history', done: 'Job done', appr: 'Approve', total: 'Total', pdf: 'Download PDF invoice' };
    bar.innerHTML =
      '<button type="button" class="djb-btn" data-a="hist" title="' + T.hist + '">' + SVG.clock + '</button>' +
      '<button type="button" class="djb-btn djb-done" data-a="done" title="' + T.done + '">' + SVG.check + '</button>' +
      '<span class="djb-btn djb-appr" data-a="appr" title="' + T.appr + '">' + SVG.check + '</span>' +
      '<span class="djb-total" id="djb-total" title="' + T.total + '">$0</span>' +
      '<button type="button" class="djb-btn djb-pdf" data-a="pdf" title="' + T.pdf + '">' + SVG.down + '</button>';
    back.after(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
      if (!b) return;
      e.stopPropagation();
      try {
        if (b.dataset.a === 'hist') { var h = origHistory(); if (h) h.click(); }
        else if (b.dataset.a === 'pdf') { var p = origPdf(); if (p) p.click(); }
        else if (b.dataset.a === 'done') {
          var d = origDone();
          if (d) { d.checked = !d.checked; d.dispatchEvent(new Event('change', { bubbles: true })); }
          setTimeout(syncBar, 40);
        }
      } catch (err) {}
    });
    syncBar();
  }
  function removeBar() { try { if (bar) bar.remove(); } catch (e) {} bar = null; }
  function syncBar() {
    if (!bar || !document.contains(bar)) return;
    try {
      var setOn = function (el, v) {
        if (el && el.classList.contains('on') !== !!v) el.classList.toggle('on', !!v);
      };
      var d = origDone();
      setOn(bar.querySelector('.djb-done'), d && d.checked);
      setOn(bar.querySelector('.djb-appr'), isApproved());
      var t = origTotal();
      var out = bar.querySelector('#djb-total');
      if (t && out && out.textContent !== t.textContent) out.textContent = t.textContent;
    } catch (e) {}
  }

  /* ---------------- ЧИПЫ ПЕРИОДОВ ПРИ ВЫБРАННОМ СОТРУДНИКЕ ----------------
     Фильтруют карточки результатов поиска по дате: работы — по дате работы,
     пикапы — по сроку вывоза. Даты берём из кэша localStorage по id из
     onclick-атрибутов карточек; непонятную карточку не прячем. */
  var period = 'all', lastQ = '';

  function cacheMaps() {
    try {
      var d = JSON.parse(lsGet('techlog_state_v1') || 'null') || {};
      var jm = {}, pm = {};
      (d.jobs || []).forEach(function (j) { jm[j.id] = j.date; });
      (d.placements || []).forEach(function (p) { pm[p.id] = p.due_date; });
      return { jm: jm, pm: pm };
    } catch (e) { return { jm: {}, pm: {} }; }
  }
  function cutoff() {
    var t = todayISO();
    if (period === 'today') return { from: t, to: t };
    if (period === '7')  { var a = new Date(); a.setDate(a.getDate() - 6);  return { from: a.toISOString().slice(0, 10), to: '9999' }; }
    if (period === '30') { var b = new Date(); b.setDate(b.getDate() - 29); return { from: b.toISOString().slice(0, 10), to: '9999' }; }
    return null;
  }
  function applyPeriod() {
    var sa = q('#search-area'); if (!sa) return;
    var c = cutoff(), maps = c ? cacheMaps() : null, hidden = 0;
    sa.querySelectorAll('.item').forEach(function (it) {
      var show = true;
      if (c) {
        var oc = it.getAttribute('onclick') || '';
        var m = oc.match(/openJob\('([^']+)'\)/), d = null;
        if (m) d = maps.jm[m[1]];
        else if ((m = oc.match(/searchOpenPk\('([^']+)'\)/))) d = maps.pm[m[1]];
        if (d) show = (d >= c.from && d <= c.to);
      }
      var want = show ? '' : 'none';
      if (it.style.display !== want) it.style.display = want;
      if (!show) hidden++;
    });
    var n = q('#dsk-periods .dsk-hid');
    var txt = hidden ? (ru() ? 'скрыто: ' + hidden : 'hidden: ' + hidden) : '';
    if (n && n.textContent !== txt) n.textContent = txt;
  }
  function buildChips() {
    var sa = q('#search-area'), inp = q('#home-search');
    var qv = inp ? String(inp.value || '').trim() : '';
    var need = isDesk() && wide(1180) && sa && sa.style.display !== 'none' && qv;
    var old = q('#dsk-periods');
    if (!need) { if (old) old.remove(); period = 'all'; lastQ = qv; return; }
    if (qv !== lastQ) { period = 'all'; lastQ = qv; }   // новый запрос — сброс периода
    if (!old) {
      old = document.createElement('div');
      old.id = 'dsk-periods';
      var L = ru() ? ['Все даты', 'Сегодня', '7 дней', '30 дней'] : ['All dates', 'Today', '7 days', '30 days'];
      old.innerHTML = ['all', 'today', '7', '30'].map(function (v, i) {
        return '<button type="button" class="dsk-chip" data-p="' + v + '">' + L[i] + '</button>';
      }).join('') + '<span class="tiny dsk-hid"></span>';
      sa.parentNode.insertBefore(old, sa);
      old.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.dsk-chip') : null;
        if (!b) return;
        e.stopPropagation();
        period = b.dataset.p; paint(); applyPeriod();
      });
    }
    function paint() {
      old.querySelectorAll('.dsk-chip').forEach(function (b) {
        var v = b.dataset.p === period;
        if (b.classList.contains('on') !== v) b.classList.toggle('on', v);
      });
    }
    paint(); applyPeriod();
  }

  /* ---------------- ГОРЯЧИЕ КЛАВИШИ ----------------
     1–9 — вкладки левого меню по порядку, Esc — закрыть модалку. */
  document.addEventListener('keydown', function (e) {
    try {
      if (!isDesk()) return;
      var t = e.target;
      if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (e.key === 'Escape') {
        var x = q('#overlay .back-x');
        if (x) { x.click(); e.preventDefault(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        var tabs = document.querySelectorAll('.tabbar .tab');
        if (tabs[n - 1]) { tabs[n - 1].click(); e.preventDefault(); }
      }
    } catch (err) {}
  });

  /* ---------------- ПЛОТНОСТЬ: компактно / просторно ---------------- */
  var densBtn = null;
  function applyDensity() {
    var on = lsGet('techlog_density') === 'compact';
    try { if (document.documentElement.classList.contains('tl-compact') !== on)
      document.documentElement.classList.toggle('tl-compact', on); } catch (e) {}
    if (densBtn) densBtn.classList.toggle('on', on);
  }
  function buildDensity() {
    var need = isDesk() && wide(980);
    if (!need) { if (densBtn) { densBtn.remove(); densBtn = null; } return; }
    if (densBtn && document.contains(densBtn)) { applyDensity(); return; }
    densBtn = document.createElement('button');
    densBtn.type = 'button';
    densBtn.id = 'dsk-density';
    densBtn.title = ru() ? 'Плотность интерфейса: компактно / просторно' : 'Density: compact / cozy';
    densBtn.innerHTML = SVG.dens;
    densBtn.addEventListener('click', function () {
      lsSet('techlog_density', lsGet('techlog_density') === 'compact' ? 'cozy' : 'compact');
      applyDensity();
    });
    document.body.appendChild(densBtn);
    applyDensity();
  }

  /* ---------------- жизненный цикл ---------------- */
  var deb = null;
  function refresh() {
    try {
      if (!isDesk() || !wide(980)) { removeBar(); var c = q('#dsk-periods'); if (c) c.remove(); buildDensity(); return; }
      buildBar(); buildChips(); buildDensity(); syncBar();
    } catch (e) { removeBar(); }
  }
  function sched() {
    if (deb) return;                       // уже взведён — не сбрасываем, иначе шторм
    deb = setTimeout(function () { deb = null; refresh(); }, 120);   // событий его вечно откладывает
  }
  function start() {
    try {
      var app = document.getElementById('app');
      if (app && window.MutationObserver) new MutationObserver(sched).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      if (window.MutationObserver) new MutationObserver(sched)
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener('change', sched, true);
      document.addEventListener('input', sched, true);
      window.addEventListener('resize', sched);
      refresh();
      window.TLDeskTools = { refresh: refresh };   // для отладки
    } catch (e) {}
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', function () { try { start(); } catch (e) {} });
})();
