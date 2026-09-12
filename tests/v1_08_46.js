/* v1.08.46 — «задачи», апрув-хаб, имя сотрудника, архив журнала, крестики
   селектов, автовыбор режима, сохранение прокрутки, кнопки без разрыва слов.
   Запуск: node tests/v1_08_46.js [порт]  (демо-режим, сервер уже поднят) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8156;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  /* ---------- 0. автовыбор режима: чистое устройство ---------- */
  console.log('— автовыбор Телефон/ПК —');
  {
    const c = await br.newContext({ viewport: { width: 1366, height: 900 } });
    const p = await c.newPage();
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); });
    await p.reload(); await p.waitForTimeout(1200);
    const d = await p.evaluate(() => ({
      mm: matchMedia('(hover:hover) and (pointer:fine)').matches,
      w: innerWidth,
      dsk: document.documentElement.classList.contains('tl-desktop'),
      stored: localStorage.getItem('techlog_view_mode'),
    }));
    t('без сохранённого выбора режим определился по устройству',
      d.dsk === (d.mm && d.w >= 1024), JSON.stringify(d));
    t('автовыбор ничего не пишет в память (ручной выбор сильнее)', d.stored === null, d.stored);
    await c.close();
  }
  {
    const c = await br.newContext({ viewport: { width: 414, height: 850 }, hasTouch: true, isMobile: true });
    const p = await c.newPage();
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); });
    await p.reload(); await p.waitForTimeout(1200);
    const d = await p.evaluate(() => ({
      mm: matchMedia('(hover:hover) and (pointer:fine)').matches,
      dsk: document.documentElement.classList.contains('tl-desktop'),
    }));
    t('узкий тач-контекст открывается в мобильном виде',
      d.dsk === (d.mm && 414 >= 1024), JSON.stringify(d));
    await c.close();
  }

  /* ---------- основной прогон: демо-админ, телефон ---------- */
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);

  console.log('— терминология: «задачи» —');
  {
    await p.evaluate(() => window.App.go('stats')); await p.waitForTimeout(600);
    const st = await p.evaluate(() => document.getElementById('app').textContent);
    t('статистика говорит «Задач выполнено»', /Задач выполнено/.test(st));
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(500);
    const home = await p.evaluate(() => document.getElementById('app').textContent);
    const strip = x => x.replace(/Доп\. ?работ\w*|Ремонтн\w+ работ\w*|работает\w*/gi, '');
    t('на главной не осталось слова «работа» о документе',
      !/\bработ\w*\b/i.test(strip(home)), (strip(home).match(/.{10}работ\w*.{6}/i) || [''])[0]);
    const brd = await p.evaluate(() => { window.App.go('board'); return 1; });
    await p.waitForTimeout(500); void brd;
    const btxt = await p.evaluate(() => document.getElementById('app').textContent);
    t('на доске нет «РАБОТ»', !/\bРАБОТ\b/.test(btxt), (btxt.match(/.{8}РАБОТ.{6}/) || [''])[0]);
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
  }

  console.log('— сохранение прокрутки при перерисовке —');
  {
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(400);
    const canScroll = await p.evaluate(() => document.body.scrollHeight - innerHeight > 300);
    await p.evaluate(() => scrollTo(0, 250)); await p.waitForTimeout(120);
    await p.evaluate(() => window.App.setMine(true)); await p.waitForTimeout(350);
    const y1 = await p.evaluate(() => scrollY);
    t('перерисовка того же экрана держит прокрутку', !canScroll || Math.abs(y1 - 250) < 60, `y=${y1}`);
    await p.evaluate(() => window.App.go('journal')); await p.waitForTimeout(400);
    const y2 = await p.evaluate(() => scrollY);
    t('смена экрана начинается сверху', y2 < 40, y2);
  }

  console.log('— журнал: строки, прокрутка, архив —');
  {
    /* наполняем локальный журнал реальными действиями (номер машины) */
    await p.evaluate(() => {
      window.__toast0 = true;
      const b = document.body;
      for (let i = 1; i <= 28; i++) window.App.setCarNo('demo-tech', 1 + (i % 60));
      void b;
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => window.App.go('journal')); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.jrTab('tech')); await p.waitForTimeout(600);
    const jr = await p.evaluate(() => ({
      rows: document.querySelectorAll('.jr-row').length,
      tall: document.body.scrollHeight > innerHeight + 200,
      archBtn: !!document.querySelector('#app [onclick="App.jrArchive()"]'),
    }));
    t('журнал наполнился строками', jr.rows >= 20, jr.rows);
    t('страница журнала прокручивается (контент выше окна)', jr.tall);
    t('кнопка «Архивировать старые записи» на месте', jr.archBtn);
    await p.evaluate(() => scrollTo(0, 220)); await p.waitForTimeout(100);
    await p.mouse.move(200, 500); await p.mouse.wheel(0, 300); await p.waitForTimeout(250);
    const yw = await p.evaluate(() => scrollY);
    t('колесо реально прокручивает журнал', yw > 300, yw);
    /* перерисовка журнала (настройка подсказок) не бросает вверх */
    await p.evaluate(() => scrollTo(0, 260)); await p.waitForTimeout(100);
    await p.evaluate(() => window.App.popPos('top')); await p.waitForTimeout(350);
    const yk = await p.evaluate(() => scrollY);
    t('перерисовка журнала держит прокрутку', Math.abs(yk - 260) < 60, yk);
    /* архив при коротком журнале: файл не скачивается, тост «нечего» */
    let dl = 0; p.on('download', () => dl++);
    await p.evaluate(() => window.App.jrArchive()); await p.waitForTimeout(700);
    const toast = await p.evaluate(() => (document.getElementById('toasts') || {}).textContent || '');
    t('меньше 200 строк — «архивировать нечего», файла нет', dl === 0 && /двухсот|нечего/i.test(toast), toast.slice(0, 60));
  }

  console.log('— крестики очистки у селектов —');
  {
    const st0 = await p.evaluate(() => {
      const sel = document.querySelector('#app .filter-row select');
      const x = sel && sel.nextElementSibling;
      return { has: !!(x && x.classList.contains('selx-x')), on: x && x.classList.contains('on') };
    });
    t('крестик дорисован пустому фильтру и скрыт', st0.has && !st0.on, JSON.stringify(st0));
    await p.evaluate(() => {
      const sel = document.querySelector('#app .filter-row select');
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(400);
    const st1 = await p.evaluate(() => {
      const sel = document.querySelector('#app .filter-row select');
      const x = sel.nextElementSibling;
      return { on: x && x.classList.contains('on'), val: sel.value };
    });
    t('выбрано значение — крестик показался', st1.on && st1.val !== '', JSON.stringify(st1));
    await p.evaluate(() => document.querySelector('#app .filter-row .selx-x').click());
    await p.waitForTimeout(400);
    const st2 = await p.evaluate(() => {
      const sel = document.querySelector('#app .filter-row select');
      const x = sel.nextElementSibling;
      return { val: sel.value, on: x && x.classList.contains('on') };
    });
    t('клик по крестику очистил фильтр', st2.val === '' && !st2.on, JSON.stringify(st2));
    /* у списка без пустого пункта (роль в Штате) крестика нет */
    await p.evaluate(() => { window.App.go('dirs'); window.App.dirTab('staff'); });
    await p.waitForTimeout(500);
    const role = await p.evaluate(() => {
      const sel = document.querySelector('#app .role-sel:not([disabled])');
      const x = sel && sel.nextElementSibling;
      return { found: !!sel, noX: !(x && x.classList && x.classList.contains('selx-x')) };
    });
    t('у выбора роли крестика нет (пустого пункта не существует)', role.found && role.noX, JSON.stringify(role));
  }

  console.log('— штат: админ правит имя сотрудника —');
  {
    await p.evaluate(() => window.App.staffCfg('demo-tech')); await p.waitForTimeout(400);
    const f = await p.evaluate(() => ({
      inp: !!document.getElementById('st-name'),
      login: /@/.test((document.querySelector('#overlay .tiny') || {}).textContent || ''),
    }));
    t('в ⚙️-карточке есть поле имени и @логин', f.inp && f.login, JSON.stringify(f));
    await p.evaluate(() => {
      const i = document.getElementById('st-name');
      i.value = 'Пётр Проверочный';
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(500);
    await p.evaluate(() => window.App.closeModal());
    const named = await p.evaluate(() => document.getElementById('app').textContent.includes('Пётр Проверочный'));
    t('новое имя видно в штате', named);
    await p.evaluate(() => { window.App.go('journal'); window.App.jrTab('tech'); });
    await p.waitForTimeout(700);
    const logHas = await p.evaluate(() => document.getElementById('app').textContent.includes('имя изменено'));
    t('в журнале появилась запись «имя изменено»', logHas);
  }

  console.log('— апрув-хаб —');
  {
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(400);
    const n0 = await p.evaluate(() => ({
      banner: !!document.querySelector('.banner.b-apv'),
      btxt: (document.querySelector('.banner.b-apv') || {}).textContent || '',
    }));
    t('на главной жёлтая карточка «Ждут апрува» (в демо есть done-задача)',
      n0.banner && /апрува/i.test(n0.btxt), n0.btxt.slice(0, 40));
    await p.evaluate(() => document.querySelector('.banner.b-apv').click());
    await p.waitForTimeout(450);
    const scr = await p.evaluate(() => ({
      cls: document.getElementById('app').className,
      title: (document.querySelector('.section-title') || {}).textContent || '',
      rows: document.querySelectorAll('#app .rowline').length,
      jobsSec: /Задачи — выполнено/.test(document.getElementById('app').textContent),
    }));
    t('клик по карточке открывает экран «На апруве»',
      scr.cls === 'scr-approvals' && /апруве/i.test(scr.title), JSON.stringify(scr).slice(0, 80));
    t('в списке есть ожидающие документы с заголовком раздела',
      scr.rows >= 1 && scr.jobsSec, scr.rows);
    await p.evaluate(() => document.querySelector('#app .rowline .btn').click());
    await p.waitForTimeout(600);
    const opened = await p.evaluate(() => document.getElementById('app').className);
    t('«Открыть» ведёт в сам документ', opened === 'scr-job', opened);
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
  }

  console.log('— мини-журнал отправки слушает настройку подсказок —');
  {
    const pos = await p.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'mq-mini'; el.textContent = 'x';
      document.body.appendChild(el);
      const rect = () => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bot: Math.round(innerHeight - r.bottom) }; };
      document.documentElement.classList.remove('tl-pop-bottom', 'tl-pop-side');
      document.documentElement.classList.add('tl-pop-top');
      const top = rect();
      document.documentElement.classList.remove('tl-pop-top');
      document.documentElement.classList.add('tl-pop-bottom');
      const bot = rect();
      document.documentElement.classList.remove('tl-pop-bottom');
      document.documentElement.classList.add('tl-pop-top');
      el.remove();
      return { top, bot, h: innerHeight };
    });
    t('«сверху» — полоска стоит у верха, под шапкой',
      pos.top.top > 40 && pos.top.top < pos.h / 3, JSON.stringify(pos.top));
    t('«снизу» — полоска стоит у низа, над панелью',
      pos.bot.bot > 40 && pos.bot.bot < pos.h / 3, JSON.stringify(pos.bot));
  }

  console.log('— кнопки не рвут слова по буквам —');
  {
    await p.evaluate(() => window.App.mediaQueueModal()); await p.waitForTimeout(400);
    const btn = await p.evaluate(() => {
      const b = [...document.querySelectorAll('#overlay .btn')]
        .find(x => /ПОВТОРИТЬ/i.test(x.textContent));
      if (!b) return null;
      /* слово не разорвано = у Range по «ПОВТОРИТЬ» один прямоугольник */
      /* в разметке текст обычным регистром («Повторить…»), капс — это CSS */
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      let tn = null, n;
      while ((n = walker.nextNode())) if (/повторить/i.test(n.textContent)){ tn = n; break; }
      let wordRects = -1;
      if (tn){
        const i = tn.textContent.toLowerCase().indexOf('повторить');
        const rg = document.createRange();
        rg.setStart(tn, i); rg.setEnd(tn, i + 'повторить'.length);
        wordRects = rg.getClientRects().length;
      }
      return { ow: getComputedStyle(b).overflowWrap, wordRects };
    });
    t('у кнопок перенос целыми словами (break-word)', btn && btn.ow === 'break-word', btn && btn.ow);
    t('слово «ПОВТОРИТЬ» не разорвано по буквам', btn && btn.wordRects === 1, btn && btn.wordRects);
    await p.evaluate(() => window.App.closeModal());
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
