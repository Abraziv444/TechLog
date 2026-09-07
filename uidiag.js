/* =====================================================================
   TechLog · v1.07.67 — ДИАГНОСТИКА ИНТЕРФЕЙСА
   ---------------------------------------------------------------------
   Автономный модуль в стиле viewmode.js / desktop.js: приложение о нём
   ничего не знает, любая ошибка внутри гасится и оставляет TechLog
   работать как обычно. Подключается ПЕРВЫМ (до viewmode.js и app.js) —
   ему нужно успеть повесить учёт слушателей прокрутки.

   Что делает:
     • кнопка-«таблетка» в углу на КАЖДОМ экране (включается в Настройках
       или горячими клавишами Ctrl+Alt+D);
     • по нажатию прогоняет 11 проверок текущего экрана и показывает
       отчёт: перекрытия, вылет за край, обрезанный текст, мелкие цели,
       контраст, битые обработчики, плавность прокрутки и т.д.;
     • каждую находку можно подсветить на странице, отчёт — скопировать
       или скачать .txt.

   Тот же движок дергают автотесты: window.UIDiag.run() возвращает
   структуру { errors, warns, checks[] } — см. tests/ui-check.js.
   ===================================================================== */
(function () {
  'use strict';

  var LS_ON = 'techlog_uidiag';
  var SELF = '#uidiag-fab,#uidiag-modal,#uidiag-flash,#uidiag-style';

  /* ------------------------------------------------------------------
     0. РЕЕСТРЫ. Ставятся до всех остальных скриптов приложения.
     ------------------------------------------------------------------ */
  var BLOCKING = [];      // блокирующие слушатели прокрутки
  var LONG = [];          // длинные задачи главного потока

  try {
    var origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      try {
        if (type === 'wheel' || type === 'mousewheel' || type === 'touchmove' || type === 'touchstart') {
          var passive = (opts && typeof opts === 'object') ? opts.passive : undefined;
          var global = (this === window || this === document ||
                        this === document.documentElement || this === document.body);
          if (global && passive !== true) {
            var line = '';
            try { line = ((new Error().stack || '').split('\n')[2] || '').trim().replace(/^at\s+/, ''); } catch (e) {}
            /* только свой код: у слушателей, вставленных инструментами
               автоматизации и расширениями, в стеке нет .js-файла */
            if (/\.js[:?)]/.test(line))
              BLOCKING.push({ type: type, target: this === window ? 'window' : (this === document ? 'document' : 'body/html'), where: line });
          }
        }
      } catch (e) {}
      return origAdd.apply(this, arguments);
    };
  } catch (e) {}

  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) {
        LONG.push({ ms: Math.round(e.duration), at: Math.round(e.startTime) });
        if (LONG.length > 60) LONG.shift();
      });
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}

  /* ------------------------------------------------------------------
     1. Мелочи
     ------------------------------------------------------------------ */
  function lang() { try { return localStorage.getItem('techlog_lang') === 'en' ? 'en' : 'ru'; } catch (e) { return 'ru'; } }
  var TXT = {
    ru: {
      title: 'Диагностика интерфейса', run: 'Проверить экран', again: 'Ещё раз', close: 'Закрыть',
      copy: 'Скопировать отчёт', save: 'Скачать .txt', copied: 'Скопировано', show: 'Показать',
      none: 'Замечаний нет — экран чист', working: 'Проверяю экран…', screen: 'Экран',
      errors: 'ошибок', warns: 'предупреждений', ok: 'проверок пройдено', more: 'ещё',
      c_cover: 'Перекрытие элементов', c_flow: 'Налезание соседних блоков',
      c_overflow: 'Вылет за правый край', c_clip: 'Обрезанный текст',
      c_hit: 'Размер зон нажатия', c_bars: 'Перекрытие нижней панелью',
      c_contrast: 'Контраст текста', c_handlers: 'Обработчики в разметке',
      c_dom: 'Гигиена разметки', c_scroll: 'Плавность прокрутки', c_layers: 'Слои и модалки'
    },
    en: {
      title: 'Interface diagnostics', run: 'Check this screen', again: 'Run again', close: 'Close',
      copy: 'Copy report', save: 'Download .txt', copied: 'Copied', show: 'Show',
      none: 'No issues — the screen is clean', working: 'Checking…', screen: 'Screen',
      errors: 'errors', warns: 'warnings', ok: 'checks passed', more: 'more',
      c_cover: 'Overlapping elements', c_flow: 'Neighbours overlapping',
      c_overflow: 'Overflow past right edge', c_clip: 'Clipped text',
      c_hit: 'Tap target size', c_bars: 'Hidden behind bottom bar',
      c_contrast: 'Text contrast', c_handlers: 'Inline handlers',
      c_dom: 'Markup hygiene', c_scroll: 'Scrolling smoothness', c_layers: 'Layers and modals'
    }
  };
  function T(k) { return (TXT[lang()] || TXT.ru)[k] || k; }
  /* «1 ошибка · 2 ошибки · 5 ошибок» — иначе шапка отчёта выглядит небрежно */
  function plural(n2, forms) {
    if (lang() === 'en') return n2 + ' ' + (n2 === 1 ? forms[3] : forms[4]);
    var a = Math.abs(n2) % 100, b = a % 10;
    return n2 + ' ' + (a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b > 1 && b < 5 ? forms[1] : forms[2]);
  }
  function nErr(n2) { return plural(n2, ['ошибка', 'ошибки', 'ошибок', 'error', 'errors']); }
  function nWarn(n2) { return plural(n2, ['предупреждение', 'предупреждения', 'предупреждений', 'warning', 'warnings']); }

  function qsa(s, r) { try { return [].slice.call((r || document).querySelectorAll(s)); } catch (e) { return []; } }
  function css(el, p) { try { return getComputedStyle(el)[p]; } catch (e) { return ''; } }

  function isSelf(el) { try { return !!(el && el.closest && el.closest(SELF)); } catch (e) { return false; } }

  function visible(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      if (isSelf(el)) return false;
      /* свёрнутый <details> в Chrome прячет содержимое через
         content-visibility: рамка у детей остаётся ненулевой, хотя они не
         отрисованы. checkVisibility это учитывает, closest — страховка
         для браузеров постарше. */
      if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
      if (el.closest && el.closest('details:not([open])')) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      var s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.08) return false;
      return true;
    } catch (e) { return false; }
  }

  /* короткий человеко-читаемый путь до элемента */
  function pathOf(el) {
    try {
      var out = [], hop = 0;
      while (el && el.nodeType === 1 && hop++ < 4) {
        var p = el.tagName.toLowerCase();
        if (el.id) { out.unshift(p + '#' + el.id); break; }
        var cl = (el.className && typeof el.className === 'string')
          ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        if (cl) p += '.' + cl;
        var txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
        if (txt && out.length === 0) p += ' «' + txt + '»';
        out.unshift(p);
        el = el.parentElement;
      }
      return out.join(' ▸ ');
    } catch (e) { return '?'; }
  }

  /* ------------------------------------------------------------------
     2. ДВИЖОК ПРОВЕРОК
        Каждая возвращает { id, title, level, items:[{level,msg,el}] }
     ------------------------------------------------------------------ */
  var HIT = 'button,a,input,select,textarea,summary,[onclick],[role="button"],.clicky,.tab,.day-cell,.opt';
  function hits() {
    /* открыта модалка — проверяем её содержимое: страница под ней всё
       равно перекрыта по замыслу */
    var ov = qsa('.overlay').filter(visible)[0];
    var root = ov ? '.overlay ' : '#app ';
    return qsa(root + HIT.split(',').join(',' + root)).filter(visible);
  }

  function box(el) { var r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; }

  /* видимая часть элемента: пересечение с рамками всех предков, которые
     обрезают содержимое (полосы вкладок, доска, карточки с overflow) */
  function clipped(el) {
    var r = box(el), p = el.parentElement, hop = 0;
    while (p && p.nodeType === 1 && hop++ < 12) {
      var s2 = getComputedStyle(p);
      if (/hidden|auto|scroll/.test(s2.overflowX + s2.overflowY)) {
        var pr = box(p);
        r.t = Math.max(r.t, pr.t); r.b = Math.min(r.b, pr.b);
        r.l = Math.max(r.l, pr.l); r.r = Math.min(r.r, pr.r);
      }
      p = p.parentElement;
    }
    r.w = r.r - r.l; r.h = r.b - r.t;
    return r;
  }

  /* плавающие панели (шапка, нижняя панель, пилюля режима) закрывают
     содержимое при прокрутке по замыслу — это не дефект. Их постоянное
     перекрытие ловит отдельная проверка checkBars. */
  function floating(el) {
    var n2 = el, hop = 0;
    while (n2 && n2.nodeType === 1 && hop++ < 6) {
      var pos = getComputedStyle(n2).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
      n2 = n2.parentElement;
    }
    return false;
  }
  function inView(r) { return r.b > 0 && r.t < innerHeight && r.r > 0 && r.l < innerWidth; }

  /* прогон по всей странице экранами: fn(видимые сейчас цели) */
  function sweep(targets, fn) {
    var y0 = window.scrollY, step = Math.max(200, innerHeight - 80);
    var max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (var y = 0; ; y += step) {
      window.scrollTo(0, Math.min(y, max));
      var here = targets.filter(function (el) { return inView(box(el)); });
      if (here.length) fn(here);
      if (y >= max) break;
    }
    window.scrollTo(0, y0);
  }

  /* --- 1. перекрытие интерактивных элементов --------------------------- */
  function checkCover() {
    var items = [], seen = {};
    sweep(hits(), function (list) {
      list.forEach(function (el) {
        var key = pathOf(el);
        if (seen[key]) return;
        /* выключенное поле и pointer-events:none не должны принимать
           нажатия по замыслу — это не перекрытие */
        if (el.disabled || getComputedStyle(el).pointerEvents === 'none') return;
        var r = clipped(el);
        if (r.w < 4 || r.h < 4) return;                 // элемент укатан в свой скроллер — не его вина
        var pts = [
          [r.l + r.w / 2, r.t + r.h / 2],
          [r.l + r.w * 0.25, r.t + r.h / 2],
          [r.l + r.w * 0.75, r.t + r.h / 2]
        ].filter(function (p) { return p[0] > 0 && p[0] < innerWidth && p[1] > 0 && p[1] < innerHeight; });
        if (!pts.length) return;
        var bad = 0, by = null;
        pts.forEach(function (p) {
          var top = document.elementFromPoint(p[0], p[1]);
          if (!top || isSelf(top)) return;
          if (top === el || el.contains(top)) return;
          /* всплывашки живут поверх страницы по определению */
          if (top.closest && top.closest('#toasts,.mq-pop,.overlay,.modal')) return;
          if (floating(top) && !floating(el)) return;   // проехали под шапкой/панелью — норма
          if (top.contains(el)) { bad++; by = by || top; return; }   // pointer-events / нулевая зона
          bad++; by = by || top;
        });
        if (bad) {
          seen[key] = 1;
          items.push({
            level: bad === pts.length ? 'err' : 'warn',
            msg: key + '  ←  ' + (by ? pathOf(by) : '?'),
            el: el
          });
        }
      });
    });
    return mk('cover', T('c_cover'), items);
  }

  /* --- 2. налезание соседних блоков в обычном потоке -------------------- */
  function checkFlow() {
    var items = [], parents = qsa('#app *').filter(function (p) { return p.children.length > 1 && !isSelf(p); });
    parents.slice(0, 400).forEach(function (p) {
      var kids = [].slice.call(p.children).filter(function (k) {
        if (!visible(k)) return false;
        var s = getComputedStyle(k);
        if (s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky') return false;
        return /block|flex|grid|list-item/.test(s.display);
      });
      for (var i = 0; i + 1 < kids.length; i++) {
        var a = box(kids[i]), b = box(kids[i + 1]);
        var ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        var oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        /* отрицательный отступ и сдвиг transform — приём вёрстки
           (пилюля логина под аватаром), а не дефект */
        var sb = getComputedStyle(kids[i + 1]);
        if (parseFloat(sb.marginTop) < 0 || parseFloat(sb.marginLeft) < 0 || sb.transform !== 'none') continue;
        if (ox > 6 && oy > 6) {
          items.push({ level: 'err', msg: pathOf(kids[i]) + '  ×  ' + pathOf(kids[i + 1]) + '  (' + Math.round(ox) + '×' + Math.round(oy) + 'px)', el: kids[i] });
          if (items.length > 12) return;
        }
      }
    });
    return mk('flow', T('c_flow'), items);
  }

  /* --- 3. вылет за правый край / горизонтальная прокрутка --------------- */
  function checkOverflow() {
    var items = [], W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) {
      var worst = [];
      qsa('#app *').forEach(function (el) {
        if (!visible(el)) return;
        var r = box(el);
        var over = Math.round(r.r - W);
        if (over > 1 && r.w < W * 3) worst.push({ over: over, el: el });
      });
      worst.sort(function (a, b) { return b.over - a.over; });
      worst.slice(0, 6).forEach(function (x) {
        items.push({ level: 'err', msg: '+' + x.over + 'px за край: ' + pathOf(x.el), el: x.el });
      });
      if (!items.length) items.push({ level: 'warn', msg: 'страница шире экрана на ' + (document.documentElement.scrollWidth - W) + 'px, виновник не найден', el: null });
    }
    return mk('overflow', T('c_overflow'), items);
  }

  /* --- 4. обрезанный текст --------------------------------------------- */
  function checkClip() {
    var items = [];
    qsa('#app *').forEach(function (el) {
      if (items.length > 14 || !visible(el)) return;
      if (/INPUT|TEXTAREA|SELECT|SVG|PATH/.test(el.tagName)) return;
      if (el.classList.contains('fade-clip') || el.closest('.board,.tabs,.week,.tabbar')) return;
      var s = getComputedStyle(el);
      var scrollable = /auto|scroll/.test(s.overflowX + s.overflowY);
      if (scrollable) return;
      if (!(el.textContent || '').trim()) return;
      if (s.textOverflow === 'ellipsis') return;         // многоточие поставлено намеренно
      if (s.overflowX === 'hidden' && el.scrollWidth > el.clientWidth + 4)
        items.push({ level: 'warn', msg: 'по ширине (' + el.scrollWidth + '→' + el.clientWidth + '): ' + pathOf(el), el: el });
      else if (s.overflowY === 'hidden' && !s.webkitLineClamp && el.scrollHeight > el.clientHeight + 4 && el.children.length < 3)
        items.push({ level: 'warn', msg: 'по высоте (' + el.scrollHeight + '→' + el.clientHeight + '): ' + pathOf(el), el: el });
    });
    return mk('clip', T('c_clip'), items);
  }

  /* --- 5. размер зон нажатия ------------------------------------------- */
  function checkHit() {
    var items = [], MIN = 40;
    hits().forEach(function (el) {
      if (items.length > 12) return;
      if (el.closest('.stepper') || el.tagName === 'A' && el.closest('.legal-links,.tiny')) return;
      var r = box(el);
      if (Math.min(r.w, r.h) < MIN)
        items.push({ level: 'warn', msg: Math.round(r.w) + '×' + Math.round(r.h) + 'px (< ' + MIN + '): ' + pathOf(el), el: el });
    });
    return mk('hit', T('c_hit'), items);
  }

  /* --- 6. перекрытие нижней панелью в самом низу страницы -------------- */
  function checkBars() {
    var items = [], y0 = window.scrollY;
    /* низ страницы: что осталось под нижней панелью — до того уже не
       доскроллить, значит элемент недоступен навсегда */
    var bar = document.querySelector('.tabbar');
    if (bar) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      var br = box(bar);
      hits().forEach(function (el) {
        if (items.length > 8 || bar.contains(el)) return;
        var r = box(el);
        if (r.b > br.t + 2 && r.t < br.b - 2 && r.r > br.l && r.l < br.r)
          items.push({ level: 'err', msg: 'недоступно под нижней панелью: ' + pathOf(el), el: el });
      });
    }
    /* верх страницы: то же самое для липкой шапки */
    var top = document.querySelector('.topbar');
    if (top) {
      window.scrollTo(0, 0);
      var tr = box(top);
      hits().forEach(function (el) {
        if (items.length > 12 || top.contains(el)) return;
        var r = box(el);
        if (r.t < tr.b - 2 && r.b > tr.t + 2 && r.r > tr.l && r.l < tr.r)
          items.push({ level: 'err', msg: 'недоступно под шапкой: ' + pathOf(el), el: el });
      });
    }
    window.scrollTo(0, y0);
    return mk('bars', T('c_bars'), items);
  }

  /* --- 7. контраст текста (WCAG) --------------------------------------- */
  function lum(c) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    if (!m) return null;
    var a = m[4] === undefined ? 1 : +m[4];
    var v = [1, 2, 3].map(function (i) {
      var x = +m[i] / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return { L: 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2], a: a };
  }
  function bgOf(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;   // картинка — не считаем
      var l = lum(s.backgroundColor);
      if (l && l.a > 0.85) return l.L;
      n = n.parentElement;
    }
    return lum('rgb(15,23,27)').L;
  }
  function checkContrast() {
    var items = [], n = 0;
    qsa('#app *').forEach(function (el) {
      if (items.length > 10 || n > 500 || !visible(el)) return;
      var own = [].slice.call(el.childNodes).some(function (x) { return x.nodeType === 3 && x.textContent.trim(); });
      if (!own) return;
      n++;
      var s = getComputedStyle(el);
      var fg = lum(s.color); if (!fg) return;
      var bg = bgOf(el); if (bg === null) return;
      var hi = Math.max(fg.L, bg), lo = Math.min(fg.L, bg);
      var ratio = (hi + 0.05) / (lo + 0.05);
      var px = parseFloat(s.fontSize) || 16, bold = (+s.fontWeight || 400) >= 700;
      var need = (px >= 24 || (bold && px >= 18.7)) ? 3 : 4.5;
      if (ratio < need)
        items.push({ level: ratio < need - 1.5 ? 'err' : 'warn', msg: ratio.toFixed(2) + ' при норме ' + need + ': ' + pathOf(el), el: el });
    });
    return mk('contrast', T('c_contrast'), items);
  }

  /* --- 8. обработчики в разметке (onclick="App.xxx()") ----------------- */
  function checkHandlers() {
    var items = [], attrs = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onblur', 'onfocus', 'onsubmit'];
    var sel = attrs.map(function (a) { return '#app [' + a + ']'; }).join(',');
    var missing = {};
    qsa(sel).forEach(function (el) {
      attrs.forEach(function (a) {
        var v = el.getAttribute(a); if (!v) return;
        var re = /\b(App|window)\.([A-Za-z0-9_$]+)\s*\(/g, m;
        while ((m = re.exec(v))) {
          var host = m[1] === 'App' ? window.App : window, name = m[2];
          if (!host || typeof host[name] !== 'function') {
            var k = m[1] + '.' + name;
            if (!missing[k]) { missing[k] = 1; items.push({ level: 'err', msg: 'нет функции ' + k + '() — ' + pathOf(el), el: el }); }
          }
        }
      });
    });
    return mk('handlers', T('c_handlers'), items);
  }

  /* --- 9. гигиена разметки --------------------------------------------- */
  function checkDom() {
    var items = [], ids = {};
    qsa('#app [id]').forEach(function (el) {
      var i = el.id;
      if (ids[i]) { if (ids[i] === 1) items.push({ level: 'err', msg: 'дубль id="' + i + '"', el: el }); ids[i]++; }
      else ids[i] = 1;
    });
    qsa('#app img').forEach(function (im) {
      if (im.complete && im.naturalWidth === 0 && im.getAttribute('src'))
        items.push({ level: 'err', msg: 'картинка не загрузилась: ' + (im.getAttribute('src') || '').slice(0, 40), el: im });
    });
    qsa('#app button').filter(visible).forEach(function (b) {
      if (items.length > 12) return;
      var name = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title');
      if (!name) items.push({ level: 'warn', msg: 'кнопка без подписи и aria-label: ' + pathOf(b), el: b });
    });
    qsa('#app label[for]').forEach(function (l) {
      if (!document.getElementById(l.getAttribute('for')))
        items.push({ level: 'warn', msg: 'label for="' + l.getAttribute('for') + '" ведёт в никуда', el: l });
    });
    return mk('dom', T('c_dom'), items);
  }

  /* --- 10. плавность прокрутки ----------------------------------------- */
  function checkScroll() {
    return new Promise(function (done) {
      var items = [];
      BLOCKING.forEach(function (b) {
        items.push({
          level: b.type === 'touchmove' || b.type === 'wheel' ? 'err' : 'warn',
          msg: 'блокирующий ' + b.type + ' на ' + b.target + ' (passive не выставлен) — прокрутка ждёт главный поток. ' + (b.where || ''),
          el: null
        });
      });
      var nodes = qsa('#app *').length, h = document.documentElement.scrollHeight;
      if (nodes > 2500) items.push({ level: 'warn', msg: 'узлов в #app: ' + nodes + ' — тяжёлая страница', el: null });

      var y0 = window.scrollY, frames = [], last = performance.now(), i = 0;
      LONG.length = 0;                       // считаем только то, что случилось во время замера
      var canScroll = document.documentElement.scrollHeight - innerHeight > 120;
      if (!canScroll) { finish(); return; }
      window.scrollTo(0, 0);
      requestAnimationFrame(function tick(now) {
        frames.push(now - last); last = now;
        window.scrollBy(0, 36);
        if (++i < 45) requestAnimationFrame(tick);
        else { window.scrollTo(0, y0); finish(); }
      });

      function finish() {
        if (frames.length > 4) {
          var f = frames.slice(3).sort(function (a, b) { return a - b; });
          var med = f[Math.floor(f.length / 2)], p95 = f[Math.floor(f.length * 0.95)] || med;
          var jank = f.filter(function (x) { return x > 34; }).length;
          var lvl = (p95 > 50 || jank > f.length * 0.15) ? 'err' : (p95 > 26 ? 'warn' : 'ok');
          items.push({ level: lvl, msg: 'кадр: медиана ' + med.toFixed(1) + ' мс, p95 ' + p95.toFixed(1) + ' мс, просадок ' + jank + ' из ' + f.length, el: null });
        }
        if (LONG.length) {
          var worst = Math.max.apply(null, LONG.map(function (x) { return x.ms; }));
          items.push({ level: worst > 120 ? 'err' : 'warn', msg: 'во время прокрутки главный поток блокировался ' + LONG.length + ' раз, дольше всего на ' + worst + ' мс', el: null });
        }
        items.push({ level: 'ok', msg: 'высота страницы ' + h + 'px, узлов ' + nodes, el: null });
        done(mk('scroll', T('c_scroll'), items));
      }
    });
  }

  /* --- 11. слои и модалки ---------------------------------------------- */
  function checkLayers() {
    var items = [];
    var open = qsa('.overlay').filter(visible);
    if (open.length > 1) items.push({ level: 'err', msg: 'открыто модалок сразу: ' + open.length, el: open[1] });
    qsa('#app *').forEach(function (el) {
      if (items.length > 8 || !visible(el)) return;
      var z = parseInt(css(el, 'zIndex'), 10);
      if (z >= 100 && !el.closest('.overlay,.tabbar,.topbar,.vm-bar,.modal'))
        items.push({ level: 'warn', msg: 'z-index ' + z + ' выше панелей: ' + pathOf(el), el: el });
    });
    return mk('layers', T('c_layers'), items);
  }

  function mk(id, title, items) {
    var lvl = items.some(function (i) { return i.level === 'err'; }) ? 'err'
            : items.some(function (i) { return i.level === 'warn'; }) ? 'warn' : 'ok';
    return { id: id, title: title, level: lvl, items: items };
  }

  /* ------------------------------------------------------------------
     3. ЗАПУСК
     ------------------------------------------------------------------ */
  var LAST = null;
  function run() {
    var fab = document.getElementById('uidiag-fab');
    if (fab) fab.style.visibility = 'hidden';
    var checks = [];
    var sync = [checkCover, checkFlow, checkOverflow, checkClip, checkHit, checkBars,
                checkContrast, checkHandlers, checkDom, checkLayers];
    sync.forEach(function (f) {
      try { checks.push(f()); }
      catch (e) { checks.push(mk('?', f.name, [{ level: 'warn', msg: 'проверка упала: ' + (e && e.message), el: null }])); }
    });
    return checkScroll().catch(function (e) {
      return mk('scroll', T('c_scroll'), [{ level: 'warn', msg: String(e), el: null }]);
    }).then(function (sc) {
      checks.push(sc);
      if (fab) fab.style.visibility = '';
      var errors = 0, warns = 0;
      checks.forEach(function (c) {
        c.items.forEach(function (i) { if (i.level === 'err') errors++; else if (i.level === 'warn') warns++; });
      });
      LAST = {
        screen: (document.getElementById('app') || {}).className || '?',
        version: (window.APP_VERSION || document.querySelector('.brand .sub') && document.querySelector('.brand .sub').textContent || '').trim(),
        w: innerWidth, h: innerHeight, ts: new Date().toISOString(),
        errors: errors, warns: warns, checks: checks
      };
      return LAST;
    });
  }

  function asText(r) {
    var L = ['TechLog · ' + T('title'), T('screen') + ': ' + r.screen + ' · ' + r.w + '×' + r.h + ' · ' + r.ts,
             nErr(r.errors) + ', ' + nWarn(r.warns), ''];
    r.checks.forEach(function (c) {
      L.push((c.level === 'err' ? '[!] ' : c.level === 'warn' ? '[~] ' : '[+] ') + c.title + (c.items.length ? ' (' + c.items.length + ')' : ''));
      c.items.forEach(function (i) { L.push('      · ' + i.msg); });
    });
    return L.join('\n');
  }

  /* ------------------------------------------------------------------
     4. ИНТЕРФЕЙС: кнопка + отчёт
     ------------------------------------------------------------------ */
  function styles() {
    if (document.getElementById('uidiag-style')) return;
    var st = document.createElement('style');
    st.id = 'uidiag-style';
    st.textContent = [
      '#uidiag-fab{position:fixed;right:10px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:95;',
      ' width:44px;height:44px;border-radius:50%;border:2px solid var(--line,#31434C);background:var(--panel,#17232A);',
      ' color:var(--blue,#1CB0F6);display:flex;align-items:center;justify-content:center;cursor:pointer;',
      ' box-shadow:0 4px 0 rgba(0,0,0,.35);padding:0}',
      '#uidiag-fab:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(0,0,0,.35)}',
      '#uidiag-fab svg{width:22px;height:22px}',
      'html.tl-desktop #uidiag-fab{bottom:18px;right:18px}',
      '#uidiag-modal{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.62);display:flex;',
      ' align-items:flex-end;justify-content:center}',
      '#uidiag-modal .ud-win{background:var(--panel,#17232A);border:2px solid var(--line,#31434C);',
      ' border-radius:16px 16px 0 0;width:min(720px,100%);max-height:88vh;display:flex;flex-direction:column;',
      ' color:var(--text,#F1F7FB);font-family:Nunito,system-ui,sans-serif}',
      '@media(min-width:720px){#uidiag-modal{align-items:center}#uidiag-modal .ud-win{border-radius:16px}}',
      '#uidiag-modal .ud-hd{padding:12px 14px;border-bottom:2px solid var(--line,#31434C);display:flex;gap:8px;align-items:center}',
      '#uidiag-modal .ud-hd b{flex:1;font-size:.98rem}',
      '#uidiag-modal .ud-sum{font-size:.74rem;color:var(--dim,#8AA0AB);padding:8px 14px 0}',
      '#uidiag-modal .ud-body{overflow:auto;padding:8px 14px 14px;-webkit-overflow-scrolling:touch}',
      '#uidiag-modal .ud-chk{border:2px solid var(--line-soft,#26363E);border-radius:12px;margin:8px 0;overflow:hidden}',
      '#uidiag-modal .ud-chk>summary{list-style:none;cursor:pointer;padding:9px 12px;font-weight:800;font-size:.84rem;',
      ' display:flex;gap:8px;align-items:center;background:var(--panel-2,#1C2B33)}',
      '#uidiag-modal .ud-chk>summary::-webkit-details-marker{display:none}',
      '#uidiag-modal .ud-dot{width:10px;height:10px;border-radius:50%;flex:none}',
      '#uidiag-modal .ud-err .ud-dot{background:var(--red,#FF4B4B)}',
      '#uidiag-modal .ud-warn .ud-dot{background:var(--yellow,#FFC800)}',
      '#uidiag-modal .ud-ok .ud-dot{background:var(--green,#58CC02)}',
      '#uidiag-modal .ud-n{font-size:.72rem;color:var(--dim,#8AA0AB)}',
      '#uidiag-modal .ud-it{display:flex;gap:8px;align-items:flex-start;padding:7px 12px;font-size:.76rem;',
      ' border-top:1px solid var(--line-soft,#26363E);line-height:1.35;word-break:break-word}',
      '#uidiag-modal .ud-it .m{flex:1}',
      '#uidiag-modal .ud-it button{border:2px solid var(--line,#31434C);background:transparent;color:var(--blue,#1CB0F6);',
      ' border-radius:8px;font:inherit;font-size:.7rem;padding:2px 8px;cursor:pointer;flex:none}',
      '#uidiag-modal .ud-ft{display:flex;gap:8px;padding:10px 14px;border-top:2px solid var(--line,#31434C);flex-wrap:wrap}',
      '#uidiag-modal .ud-ft button{flex:1 1 44%;min-width:0;border-radius:12px;border:2px solid var(--line,#31434C);',
      ' background:var(--panel-2,#1C2B33);color:var(--text,#F1F7FB);font:inherit;font-weight:800;font-size:.8rem;padding:9px 10px;cursor:pointer}',
      '#uidiag-modal .ud-ft .pri{background:var(--blue,#1CB0F6);border-color:var(--blue-dk,#0E86C0);color:#05202D}',
      '#uidiag-flash{position:fixed;z-index:8999;border:3px solid var(--red,#FF4B4B);border-radius:8px;',
      ' pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.35);transition:opacity .3s}'
    ].join('');
    document.head.appendChild(st);
  }

  function flash(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(function () {
        var r = el.getBoundingClientRect();
        var f = document.getElementById('uidiag-flash') || document.createElement('div');
        f.id = 'uidiag-flash';
        f.style.left = (r.left - 3) + 'px'; f.style.top = (r.top - 3) + 'px';
        f.style.width = r.width + 'px'; f.style.height = r.height + 'px'; f.style.opacity = '1';
        document.body.appendChild(f);
        setTimeout(function () { f.style.opacity = '0'; }, 1400);
        setTimeout(function () { if (f.parentNode) f.remove(); }, 1800);
      }, 260);
    } catch (e) {}
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function paint(r) {
    var m = document.getElementById('uidiag-modal');
    if (!m) return;
    var body = m.querySelector('.ud-body'), sum = m.querySelector('.ud-sum');
    sum.textContent = T('screen') + ': ' + r.screen.replace('scr-', '') + ' · ' + r.w + '×' + r.h +
      ' · ' + nErr(r.errors) + ' · ' + nWarn(r.warns);
    body.innerHTML = r.checks.map(function (c, ci) {
      var cls = c.level === 'err' ? 'ud-err' : c.level === 'warn' ? 'ud-warn' : 'ud-ok';
      var rows = c.items.length
        ? c.items.map(function (i, ii) {
            return '<div class="ud-it"><span class="m">' + (i.level === 'err' ? '⛔ ' : i.level === 'warn' ? '⚠️ ' : '✓ ') +
              esc(i.msg) + '</span>' + (i.el ? '<button data-c="' + ci + '" data-i="' + ii + '">' + T('show') + '</button>' : '') + '</div>';
          }).join('')
        : '<div class="ud-it"><span class="m">✓ ' + T('none') + '</span></div>';
      return '<details class="ud-chk ' + cls + '"' + (c.level === 'ok' ? '' : ' open') + '><summary>' +
        '<span class="ud-dot"></span><span>' + esc(c.title) + '</span>' +
        '<span class="ud-n">' + (c.items.length || '') + '</span></summary>' + rows + '</details>';
    }).join('');
    body.onclick = function (e) {
      var b = e.target.closest('button[data-c]'); if (!b) return;
      var it = r.checks[+b.dataset.c].items[+b.dataset.i];
      close(); flash(it.el);
    };
  }

  function close() { var m = document.getElementById('uidiag-modal'); if (m) m.remove(); }

  function open() {
    styles(); close();
    var m = document.createElement('div');
    m.id = 'uidiag-modal';
    m.innerHTML =
      '<div class="ud-win"><div class="ud-hd"><b>🩺 ' + T('title') + '</b>' +
      '<button class="ud-x" style="border:none;background:transparent;color:var(--dim,#8AA0AB);font-size:1.3rem;cursor:pointer">×</button></div>' +
      '<div class="ud-sum">' + T('working') + '</div><div class="ud-body"></div>' +
      '<div class="ud-ft"><button class="pri" data-a="again">' + T('again') + '</button>' +
      '<button data-a="copy">' + T('copy') + '</button>' +
      '<button data-a="save">' + T('save') + '</button>' +
      '<button data-a="close">' + T('close') + '</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m) return close();
      var b = e.target.closest('[data-a],.ud-x'); if (!b) return;
      var a = b.dataset ? b.dataset.a : null;
      if (b.classList.contains('ud-x') || a === 'close') return close();
      if (a === 'again') { paintWait(); run().then(paint); return; }
      if (a === 'copy' && LAST) {
        var txt = asText(LAST);
        try { navigator.clipboard.writeText(txt); } catch (e2) {}
        b.textContent = T('copied'); setTimeout(function () { b.textContent = T('copy'); }, 1500);
      }
      if (a === 'save' && LAST) {
        var blob = new Blob([asText(LAST)], { type: 'text/plain;charset=utf-8' });
        var a2 = document.createElement('a');
        a2.href = URL.createObjectURL(blob);
        a2.download = 'techlog-ui-' + LAST.screen.replace('scr-', '') + '-' + LAST.ts.slice(0, 19).replace(/[:T]/g, '-') + '.txt';
        a2.click(); setTimeout(function () { URL.revokeObjectURL(a2.href); }, 4000);
      }
    });
    function paintWait() { m.querySelector('.ud-body').innerHTML = '<div class="ud-it"><span class="m">' + T('working') + '</span></div>'; }
    paintWait();
    /* даём модалке отрисоваться, потом гасим её на время замеров */
    setTimeout(function () {
      m.style.display = 'none';
      run().then(function (r) { m.style.display = ''; paint(r); })
           .catch(function () { m.style.display = ''; });
    }, 60);
  }

  /* ------------------------------------------------------------------
     5. КНОПКА НА КАЖДОМ ЭКРАНЕ
     ------------------------------------------------------------------ */
  function enabled() { try { return localStorage.getItem(LS_ON) === '1'; } catch (e) { return false; } }
  function setEnabled(v) {
    try { localStorage.setItem(LS_ON, v ? '1' : '0'); } catch (e) {}
    paintFab();
  }
  function paintFab() {
    var have = document.getElementById('uidiag-fab');
    var need = enabled() && !!document.querySelector('#app .tabbar');   // только когда пользователь внутри приложения
    if (need && !have) {
      styles();
      var b = document.createElement('button');
      b.id = 'uidiag-fab';
      b.title = T('title') + ' (Ctrl+Alt+D)';
      b.setAttribute('aria-label', T('title'));
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/><circle cx="15.5" cy="15" r="2.6"/><path d="M17.6 17.1 20 19.5"/></svg>';
      b.addEventListener('click', open);
      document.body.appendChild(b);
    } else if (!need && have) have.remove();
  }

  function start() {
    try {
      paintFab();
      var app = document.getElementById('app');
      var armed = false;
      var kick = function () {
        if (armed) return;
        armed = true;
        setTimeout(function () { armed = false; paintFab(); }, 200);
      };
      if (app && window.MutationObserver) new MutationObserver(kick).observe(app, { childList: true });
      document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) { e.preventDefault(); open(); }
      });
      window.UIDiag = {
        run: run, open: open, close: close,
        /* сериализуемый отчёт для автотестов: те же данные без DOM-узлов */
        json: function () { return run().then(function (r) { return JSON.parse(JSON.stringify(r, function (k, v) { return k === 'el' ? undefined : v; })); }); },
        text: function () { return LAST ? asText(LAST) : ''; },
        enabled: enabled, setEnabled: setEnabled, blocking: function () { return BLOCKING.slice(); }
      };
    } catch (e) {
      try { window.UIDiag = { run: function () { return Promise.resolve({ errors: 0, warns: 0, checks: [] }); } }; } catch (e2) {}
    }
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', function () { try { start(); } catch (e) {} });
})();
