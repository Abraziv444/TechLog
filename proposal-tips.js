/* TechLog · proposal-tips.js · v1.08.40
 * Подсказки «?» к полям пропозала. Автономный модуль:
 * app.js / styles.css не трогает, вешается на текст подписей.
 * Подключение: <script defer src="proposal-tips.js"></script> в index.html
 * API: window.TLTips.on() / .off() / .refresh() / .version
 */
(function () {
  'use strict';
  if (window.__TL_TIPS__) return;
  window.__TL_TIPS__ = true;

  var LS_KEY = 'tl_tips_off';

  /* ---- Тексты подсказок. Правьте прямо здесь. --------------------------
     v1.08.40: два словаря — русский и английский; выбор по языку интерфейса
     (localStorage techlog_lang), чтобы в EN-режиме подписи PO NUMBER / SALES TAX /
     FREIGHT / $ и алиасы UNIT / TOTAL не открывали русские тексты. */
  var TIPS_RU = {
    'ДАТА':
      'Дата составления пропозала, по умолчанию сегодня. Это не срок работ — срок задаётся в «Выполнить до».',
    'КОНТРАГЕНТ':
      'Заказчик, на которого выставляется пропозал. Смена контрагента сбрасывает комплекс и юнит.',
    'АПАРТ-КОМПЛЕКС':
      'Комплекс, где будут работы. При выборе комплекса контрагент подставляется автоматически.',
    'ЮНИТ №':
      'Номер квартиры. Если работы по общей зоне — укажите здание или «common area».',
    'СТАТУС':
      'Черновик — правится свободно. Отправлен — ушёл заказчику. Одобрен — можно создавать задание. Отклонён — в работу не идёт.',
    'PO NUMBER':
      'Номер заказа заказчика (Purchase Order), если он его выдал. Печатается в PDF. Нет номера — оставьте пустым.',
    'ВЫПОЛНИТЬ ДО (COMPLETE BY)':
      'Крайний срок, который вы обещаете заказчику. Печатается в PDF.',
    'ПОЗИЦИИ':
      'Строки сметы: каждая строка — отдельная работа или материал. Из них складывается Итого.',
    'КОЛ-ВО':
      'Количество: штук, часов работы или суток аренды. По умолчанию 1.',
    'КОД':
      'Код позиции из прайса (Item). Печатается в PDF отдельной колонкой. Не обязателен.',
    'ОПИСАНИЕ':
      'Что делается — формулировкой для заказчика, а не для техника. Одна работа — одна строка.',
    '$':
      'Сумма по строке в долларах. Итого пересчитывается автоматически.',
    'ИТОГО':
      'Сумма всех строк, считается автоматически и вручную не правится. Sales Tax и Freight идут отдельно.',
    'ПРИМЕЧАНИЕ':
      'Условия и оговорки: что не входит в цену, сроки, доступ в юнит. «Вставить блок» — готовые шаблоны текста.',
    'SALES TAX':
      'Налог с продаж суммой в долларах. Не облагается — оставьте пустым.',
    'FREIGHT':
      'Доставка и логистика отдельной суммой, если она не заложена в строки.',

    /* документ ремонтных работ */
    'РАБОТЫ':
      'Что восстанавливаем. Берите позиции из справочника — код, описание и цена подставятся сами; своё добавляйте свободной строкой.',
    'МАТЕРИАЛЫ':
      'Покупка материалов отдельной секцией: гипсокартон, бруски, краска. В итог идут отдельной строкой, чтобы заказчик видел, за что платит.',
    'ВСЕГО':
      'Работы + материалы + налог + доставка. Считается автоматически; правка сметы у одобренного документа снимает апрув.',
    'ИСПОЛНИТЕЛИ':
      'Кто выполняет работы. Первое имя — основной исполнитель, остальные — коворкеры.'
  };

  /* английский интерфейс */
  var TIPS_EN = {
    'DATE': 'Document date, today by default. This is not the deadline — that is «Complete By».',
    'COUNTERPARTY': 'The client the document is issued to. Changing it resets complex and unit.',
    'COMPLEX': 'The complex where the work is done. Picking it fills in the counterparty.',
    'STATUS': 'Draft — free to edit. Sent — with the client. Approved — ready to work from. Declined — not going ahead.',
    'COMPLETE BY': 'The deadline you promise the client. Printed on the PDF.',
    'LINE ITEMS': 'Estimate rows: one work or material per row. They add up to the total.',
    'QTY': 'Quantity: pieces, hours or rental days. Defaults to 1.',
    'ITEM': 'Price-list code. Printed in its own PDF column. Optional.',
    'DESCRIPTION': 'What is being done, worded for the client. One job — one row.',
    'NOTES': 'Terms and exclusions: what is not covered, access to the unit. «Insert block» — ready-made texts.',
    'WORKS': 'What is being restored. Take rows from the catalog — code, description and price come with them.',
    'MATERIALS': 'Materials purchased, kept separate so the client sees what the money went on.',
    'CREW': 'Who does the work. The first name is the lead; the rest are coworkers.',
    'UNIT #': 'Apartment number. For a common area put the building or «common area».',
    'PO NUMBER': 'The client’s Purchase Order number, if they issued one. Printed on the PDF. No number — leave it empty.',
    '$': 'Line amount in dollars. The total is recalculated automatically.',
    'TOTAL': 'Sum of all lines, calculated automatically and not editable by hand. Sales Tax and Freight are separate.',
    'SALES TAX': 'Sales tax as a dollar amount. Not taxable — leave it empty.',
    'FREIGHT': 'Delivery and logistics as a separate amount when it is not built into the lines.',
    'GRAND TOTAL': 'Works + materials + tax + freight. Calculated automatically; editing an approved estimate resets the approval.'
  };

  function lang() { return lsGet('techlog_lang') === 'en' ? 'en' : 'ru'; }
  function TIPS_() { return lang() === 'en' ? TIPS_EN : TIPS_RU; }

  /* Варианты написания подписей → канонический ключ */
  var ALIAS = {
    'ЮНИТ #': 'ЮНИТ №',
    'ЮНИТ': 'ЮНИТ №',
    'КОЛВО': 'КОЛ-ВО',
    'КОЛ ВО': 'КОЛ-ВО',
    'КОЛ- ВО': 'КОЛ-ВО',
    'ВЫПОЛНИТЬ ДО': 'ВЫПОЛНИТЬ ДО (COMPLETE BY)',
    'PO NUMBER (НОМЕР ЗАКАЗА)': 'PO NUMBER',
    'АПАРТКОМПЛЕКС': 'АПАРТ-КОМПЛЕКС',
    'АПАРТ КОМПЛЕКС': 'АПАРТ-КОМПЛЕКС',
    'ПОЗИЦИИ / LINE ITEMS': 'ПОЗИЦИИ',
    'UNIT': 'UNIT #',
    'SUBTOTAL': 'TOTAL',
    'APARTMENT COMPLEX': 'COMPLEX',
    'CREW': 'ИСПОЛНИТЕЛИ',
    'PERFORMED BY': 'CREW'
  };

  /* Подписи, по которым определяем, что открыт именно пропозал */
  var MARKERS = ['PO NUMBER', 'ВЫПОЛНИТЬ ДО (COMPLETE BY)', 'COMPLETE BY'];

  /* ---- Стили ------------------------------------------------------------ */
  var CSS = [
    '.tl-tip{display:inline-block;position:relative;width:17px;height:17px;line-height:15px;',
    'margin:0 0 0 6px;border-radius:50%;border:1.5px solid rgba(126,224,10,.6);',
    'color:#7ee00a;background:rgba(126,224,10,.08);font:800 11px/15px system-ui,sans-serif;',
    'text-align:center;vertical-align:middle;cursor:pointer;user-select:none;',
    '-webkit-tap-highlight-color:transparent;text-transform:none;letter-spacing:0;flex:0 0 auto}',
    '.tl-tip::after{content:"?"}',
    '.tl-tip::before{content:"";position:absolute;left:-9px;top:-9px;right:-9px;bottom:-9px}',
    '.tl-tip.is-on{background:#7ee00a;color:#08210a;border-color:#7ee00a}',
    '#tl-tip-pop{position:fixed;z-index:99999;max-width:270px;box-sizing:border-box;',
    'padding:10px 12px;border-radius:12px;background:#16202b;border:1px solid #33455a;',
    'box-shadow:0 10px 28px rgba(0,0,0,.55);color:#dfe8f1;',
    'font:500 13px/1.42 system-ui,-apple-system,Roboto,sans-serif;',
    'opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .12s,transform .12s}',
    '#tl-tip-pop.is-on{opacity:1;transform:none}',
    '#tl-tip-pop b{display:block;margin-bottom:3px;color:#7ee00a;font-size:12px;letter-spacing:.4px}'
  ].join('');

  function injectCss() {
    if (document.getElementById('tl-tip-css')) return;
    var s = document.createElement('style');
    s.id = 'tl-tip-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---- Утилиты ---------------------------------------------------------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  function norm(s) {
    return (s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\s]+/g, ' ')
      .trim()
      .replace(/[:*]+$/, '')
      .trim()
      .toUpperCase();
  }

  function keyOf(el) {
    var t = norm(el.textContent), TIPS = TIPS_();
    if (!t || t.length > 60) return null;
    if (TIPS[t]) return t;
    var a = ALIAS[t];
    return a && TIPS[a] ? a : null;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, OPTION: 1, TEXTAREA: 1, INPUT: 1, SVG: 1, PATH: 1, NOSCRIPT: 1 };

  function isLeaf(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (!el.children[i].classList.contains('tl-tip')) return false;
    }
    return true;
  }

  /* ---- Всплывашка ------------------------------------------------------- */
  var pop = null, active = null;

  function popEl() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'tl-tip-pop';
    document.body.appendChild(pop);
    return pop;
  }

  function hide() {
    if (!active) return;
    active.classList.remove('is-on');
    active = null;
    if (pop) pop.classList.remove('is-on');
  }

  function show(badge, key) {
    var p = popEl();
    p.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = key;
    var t = document.createElement('span');
    t.textContent = TIPS_()[key] || '';
    p.appendChild(b);
    p.appendChild(t);

    p.style.left = '-9999px';
    p.style.top = '0px';
    p.classList.add('is-on');

    var r = badge.getBoundingClientRect();
    var pr = p.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;

    var left = Math.round(r.left + r.width / 2 - pr.width / 2);
    left = Math.max(8, Math.min(left, vw - pr.width - 8));

    var top = Math.round(r.bottom + 8);
    if (top + pr.height > vh - 8) {
      var up = Math.round(r.top - pr.height - 8);
      top = up >= 8 ? up : Math.max(8, vh - pr.height - 8);
    }

    p.style.left = left + 'px';
    p.style.top = top + 'px';

    badge.classList.add('is-on');
    active = badge;
  }

  function onBadgeClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var badge = e.currentTarget;
    var key = badge.getAttribute('data-k');
    if (active === badge) { hide(); return; }
    hide();
    show(badge, key);
  }

  /* ---- Развешивание значков --------------------------------------------- */
  function addBadge(el, key) {
    var b = document.createElement('span');
    b.className = 'tl-tip';
    b.setAttribute('data-k', key);
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.setAttribute('aria-label', (lang() === 'en' ? 'Hint: ' : 'Подсказка: ') + key);
    b.addEventListener('click', onBadgeClick);
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') onBadgeClick(e);
    });
    el.appendChild(b);
  }

  function clearBadges() {
    var list = document.querySelectorAll('.tl-tip');
    if (!list.length) return;
    hide();
    for (var i = 0; i < list.length; i++) {
      if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
    }
  }

  function scan() {
    if (lsGet(LS_KEY) === '1') { clearBadges(); return; }
    if (!document.body) return;

    var hits = [];
    var seen = {};
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
    var el;
    while ((el = walker.nextNode())) {
      if (SKIP[el.tagName]) continue;
      if (el.classList && el.classList.contains('tl-tip')) continue;
      if (pop && (el === pop || pop.contains(el))) continue;   /* текст самой всплывашки не сканируем */
      if (!isLeaf(el)) continue;
      var k = keyOf(el);
      if (k) hits.push([el, k]);
    }

    var i;
    for (i = 0; i < hits.length; i++) seen[hits[i][1]] = 1;

    var onProposal = false;
    for (i = 0; i < MARKERS.length; i++) if (seen[MARKERS[i]]) onProposal = true;

    if (!onProposal) { clearBadges(); return; }

    /* снять значки с подписей, которых больше нет на экране */
    var live = document.querySelectorAll('.tl-tip');
    for (i = 0; i < live.length; i++) {
      var host = live[i].parentNode;
      if (!host || !document.body.contains(host)) {
        if (host) host.removeChild(live[i]);
      }
    }

    for (i = 0; i < hits.length; i++) {
      var node = hits[i][0];
      if (node.querySelector(':scope > .tl-tip')) continue;  /* уже есть — не трогаем */
      addBadge(node, hits[i][1]);
    }
  }

  /* ---- Наблюдение за перерисовкой (fire-and-wait, без сброса) ------------ */
  var armed = false;
  function schedule() {
    if (armed) return;
    armed = true;
    setTimeout(function () { armed = false; try { scan(); } catch (e) {} }, 250);
  }

  function start() {
    injectCss();
    scan();
    try {
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.classList || !e.target.classList.contains('tl-tip')) hide();
    }, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }

  window.TLTips = {
    on: function () { lsSet(LS_KEY, null); scan(); },
    off: function () { lsSet(LS_KEY, '1'); clearBadges(); },
    refresh: scan,
    version: '1.08.18',
    tips: TIPS_RU, tipsEn: TIPS_EN
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
