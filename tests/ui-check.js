/* =====================================================================
   TechLog · tests/ui-check.js — проверка интерфейса и прокрутки
   ---------------------------------------------------------------------
   Гоняет тот же движок, что и кнопка «Диагностика интерфейса» в
   приложении (window.UIDiag), по всем экранам и в двух режимах —
   телефон и ПК; v1.08.68: плюс учёба — у каждого раздела 1–8 карточка,
   окно запуска теста, первый вопрос с ответом и учебник в рамке
   (просмотрщик отрисовал страницы, тулбар и страница в границах рамки,
   оглавление не пустое). Валит сборку, если:
     • появился блокирующий (не passive) слушатель wheel/touchmove
       на window или document — из-за таких прокрутка ждёт главный поток;
     • любая проверка вернула ошибку (перекрытия, вылет за край,
       битые обработчики, недоступные под панелью кнопки и т.д.).

   Запуск (демо-режим, без Supabase):
     cp -r . /tmp/tlrun && echo 'window.TECHLOG_CONFIG = {};' > /tmp/tlrun/config.js
     (cd /tmp/tlrun && python3 -m http.server 8099 &) && node tests/ui-check.js 8099

   Переменные окружения:
     PW_CHROME  — путь к бинарю Chromium (по умолчанию системный)
     UI_STRICT  — 1: предупреждения тоже валят сборку
     UI_DENS    — compact: тот же прогон в компактной плотности (v1.09.05)
   ===================================================================== */
const { chromium } = require('playwright-core');

const PORT = process.argv[2] || process.env.PORT || '8099';
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STRICT = process.env.UI_STRICT === '1';
const DENS = process.env.UI_DENS === 'compact' ? 'compact' : '';   // v1.09.05

const SCREENS = ['home', 'chat', 'docflow', 'board', 'proposals', 'repairs', 'map', 'reports', 'stats', 'study', 'dirs', 'journal', 'settings'];   // v1.08.51: + учёба; v1.09.26: + документооборот
const MODES = [
  { name: 'телефон', vp: { width: 414, height: 896 }, mode: 'mobile' },
  { name: 'ПК',      vp: { width: 1440, height: 900 }, mode: 'desktop' },
];

/* эти замечания не считаем ошибками сборки: они про оформление,
   а не про сломанный интерфейс */
const SOFT = ['contrast', 'hit', 'clip'];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let fails = 0, warns = 0;

  for (const m of MODES) {
    const page = await browser.newPage({ viewport: m.vp });
    /* внешние CDN режем: без этого страница висит в песочнице */
    for (const p of ['**://*.jsdelivr.net/**', '**://*.cloudflare.com/**', '**://*.unpkg.com/**',
                     '**://*.googleapis.com/**', '**://*.gstatic.com/**', '**://*.supabase.co/**'])
      await page.route(p, r => r.abort());
    /* v1.09.12: Leaflet теперь свой (vendor/) и карта в песочнице рисуется — плитки OSM отдаём
       прозрачной заглушкой 1×1, иначе «картинка не загрузилась» была бы дефектом окружения, а не вёрстки */
    await page.route('**://*.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));

    await page.addInitScript(([mode, dens]) => {
      localStorage.setItem('techlog_session_v1', 'demo-admin');
      localStorage.setItem('techlog_view_mode', mode);
      if (dens) { localStorage.setItem('techlog_density', dens); localStorage.setItem('techlog_density_m', dens); }
    }, [m.mode, DENS]);

    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.UIDiag && window.App, null, { timeout: 15000 });
    await page.waitForTimeout(1200);

    /* --- 1. блокирующие слушатели прокрутки ------------------------- */
    const blocking = await page.evaluate(() => window.UIDiag.blocking());
    console.log(`\n=== режим: ${m.name} (${m.vp.width}×${m.vp.height})${DENS ? ' · компактная плотность' : ''} ===`);
    if (blocking.length) {
      fails++;
      console.log(`  ⛔ блокирующих слушателей прокрутки: ${blocking.length}`);
      blocking.forEach(b => console.log(`     ${b.type} на ${b.target} — ${b.where}`));
    } else {
      console.log('  ✓ блокирующих слушателей wheel/touchmove на window/document нет');
    }

    /* --- 2. движок диагностики по всем экранам ---------------------- */
    for (const scr of SCREENS) {
      const ok = await page.evaluate(s => {
        try { window.App.go(s); return true; } catch (e) { return false; }
      }, scr);
      if (!ok) { console.log(`  ${scr.padEnd(10)} — экран недоступен, пропуск`); continue; }
      await page.waitForTimeout(400);

      const r = await page.evaluate(() => window.UIDiag.json());
      const bad = r.checks.filter(c => c.level === 'err' && !SOFT.includes(c.id));
      const soft = r.checks.filter(c => c.level !== 'ok' && SOFT.includes(c.id));
      const hard = bad.reduce((a, c) => a + c.items.filter(i => i.level === 'err').length, 0);
      const softN = soft.reduce((a, c) => a + c.items.length, 0);
      const mark = hard ? '⛔' : (softN ? '⚠️ ' : '✓');
      console.log(`  ${mark} ${scr.padEnd(10)} дефектов ${hard}, оформление ${softN}`);
      bad.forEach(c => {
        fails++;
        c.items.filter(i => i.level === 'err').slice(0, 4)
          .forEach(i => console.log(`      ⛔ ${c.title}: ${i.msg}`));
      });
      soft.forEach(c => {
        warns += c.items.length;
        c.items.slice(0, 2).forEach(i => console.log(`      ⚠️  ${c.title}: ${i.msg}`));
      });
    }

    /* --- 3. учёба: карточка, тест и учебник каждого раздела (v1.08.68) --- */
    const diag = async (label) => {
      const r = await page.evaluate(() => window.UIDiag.json());
      const bad = r.checks.filter(c => c.level === 'err' && !SOFT.includes(c.id));
      const hard = bad.reduce((a, c) => a + c.items.filter(i => i.level === 'err').length, 0);
      bad.forEach(c => { fails++; c.items.filter(i => i.level === 'err').slice(0, 3)
        .forEach(i => console.log(`      ⛔ ${label} · ${c.title}: ${i.msg}`)); });
      return hard;
    };
    console.log('  — учёба: разделы 1–8, тест и книга каждого —');
    await page.evaluate(() => window.App.go('study')); await page.waitForTimeout(1500);
    const secIds = await page.evaluate(() => [...document.querySelectorAll('.st-chip .st-chip-no')].map(e => e.textContent.trim()));
    for (const id of secIds) {
      let hard = 0, note = [];
      await page.evaluate(i => window.App.studySel(i), id); await page.waitForTimeout(900);
      hard += await diag(`раздел ${id}`);
      const btn = await page.evaluate(() => ({
        test: !document.querySelector('.st-sec button[onclick*="studyStart"]').disabled,
        book: !document.querySelector('.st-sec button[onclick*="studyRead"]').disabled }));
      /* тест: окно запуска → первый вопрос → ответ и проверка → сброс */
      if (btn.test) {
        await page.evaluate(i => window.App.studyStart(i), id); await page.waitForTimeout(500);
        hard += await diag(`раздел ${id} · запуск теста`);
        await page.evaluate(i => { window.App.closeModal(); window.App.studyBegin(i); }, id); await page.waitForTimeout(500);
        const q = await page.evaluate(() => ({ run: !!document.querySelector('.st-run'), opts: document.querySelectorAll('.st-opt').length,
          txt: (document.querySelector('.st-q') || document.querySelector('.st-run') || {}).textContent || '' }));
        if (!q.run || q.opts < 2) { fails++; hard++; console.log(`      ⛔ раздел ${id}: тест не открылся (вопрос ${q.run}, вариантов ${q.opts})`); }
        else {
          hard += await diag(`раздел ${id} · вопрос`);
          await page.evaluate(() => document.querySelector('.st-opt').click()); await page.waitForTimeout(200);
          await page.evaluate(() => window.App.studyCheck()); await page.waitForTimeout(400);
          hard += await diag(`раздел ${id} · проверка ответа`);
        }
        await page.evaluate(() => window.App.studyDrop()); await page.waitForTimeout(300);
        note.push('тест');
      } else note.push('теста нет');
      /* книга: рамка, просмотрщик внутри, тулбар и страница в границах рамки */
      if (btn.book) {
        await page.evaluate(i => window.App.studyRead(i), id);
        let fr = null;
        for (let k = 0; k < 80 && !fr; k++) { await page.waitForTimeout(250); fr = page.frames().find(f => /dictionary\/books\//.test(f.url())); }
        if (!fr) { fails++; hard++; console.log(`      ⛔ раздел ${id}: рамка учебника не появилась`); }
        else {
          const isViewer = await fr.evaluate(() => !!document.getElementById('bk'));
          if (isViewer) {
            await fr.waitForFunction(() => document.querySelectorAll('#inner .pg[data-on] svg').length > 0, null, { timeout: 40000 }).catch(() => {});
            await fr.waitForTimeout(500);
            const v = await fr.evaluate(() => {
              const tb = document.getElementById('tb'), doc = document.getElementById('doc'), pg = document.querySelector('#inner .pg');
              const tbKids = [...tb.querySelectorAll('button,input,#ttl')].filter(e => getComputedStyle(e).display !== 'none');
              const cut = tbKids.filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length;
              return { pages: document.querySelectorAll('#inner .pg').length, mounted: document.querySelectorAll('#inner .pg[data-on] svg').length,
                tot: document.getElementById('pgtot').textContent.trim(), cut, tbOver: tb.scrollWidth > tb.clientWidth + 1,
                pgW: pg ? pg.getBoundingClientRect().width : 0, docW: doc.clientWidth, fit: document.getElementById('bfit').classList.contains('on'),
                toc: document.querySelectorAll('#btoc .toci').length, text: document.querySelectorAll('#inner .pg svg text').length };
            });
            const probs = [];
            if (!v.pages || !v.mounted || !v.text) probs.push(`страницы не отрисовались (${v.mounted}/${v.pages}, текстов ${v.text})`);
            if (v.cut || v.tbOver) probs.push(`тулбар не влезает: обрезано кнопок ${v.cut}, overflow ${v.tbOver}`);
            if (v.fit && v.pgW > v.docW + 1) probs.push(`страница шире рамки при «по ширине» (${Math.round(v.pgW)} > ${v.docW})`);
            if (v.toc < 2) probs.push(`оглавление пустое (${v.toc})`);
            if (probs.length) { fails += probs.length; hard += probs.length; probs.forEach(x => console.log(`      ⛔ раздел ${id} · книга: ${x}`)); }
            note.push(`книга ${v.pages} стр.`);
          } else {
            const ok = await fr.evaluate(() => document.body && document.body.textContent.trim().length > 50);
            if (!ok) { fails++; hard++; console.log(`      ⛔ раздел ${id}: страница учебника пустая`); }
            note.push('книга (html)');
          }
          hard += await diag(`раздел ${id} · чтение`);
        }
        await page.evaluate(() => window.App.studyReadClose()); await page.waitForTimeout(400);
      } else note.push('книги нет');
      console.log(`  ${hard ? '⛔' : '✓'} учёба/${id}   дефектов ${hard} · ${note.join(' · ')}`);
    }

    /* v1.09.09: ОБЛАСТИ ВЫВОДА СООБЩЕНИЙ (логи). Случай из замечаний: строка-предупреждение в
       «Проверке связи» превращалась в жёлтый кружок-столбик — общий класс .warn красил её как
       значок. Теперь в каждую область-лог (.mq-log и полоска отправки .mq-mini-b) тест сам
       вставляет строки всех видов, включая очень длинную, и проверяет геометрию каждой:
       строка — во всю ширину области, не вылезает за неё, не круглая и не выше шести строк. */
    {
      let hard = 0;
      const areas = [
        { name: 'проверка связи', open: () => window.App.netModal(), box: '#net-log', wait: 2500 },
        { name: 'очередь отправки', open: () => (window.App.mediaQueueModal || window.App.mqOpen || (() => {}))(), box: '#mq-log', wait: 600 },
      ];
      for (const a of areas){
        await page.evaluate(a.open).catch(() => {}); await page.waitForTimeout(a.wait);
        const res = await page.evaluate((sel) => {
          const box = document.querySelector(sel); if (!box) return null;
          const LONG = 'Очень длинная строка журнала: '.repeat(12);
          ['', 'ok', 'warn', 'err', 'inf', 'dim'].forEach(c => { const d = document.createElement('div'); d.className = 'mq-l ' + c; d.textContent = (c || 'обычная') + ' — ' + (c === 'err' ? LONG : '✓ Сервис карт — 2300 мс'); box.appendChild(d); });
          const bw = box.clientWidth, br = box.getBoundingClientRect();
          return [...box.querySelectorAll('.mq-l')].map(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
            const bad = [];
            if (r.width < bw * 0.6) bad.push('узкая: ' + Math.round(r.width) + ' из ' + bw);
            if (r.left < br.left - 1 || r.right > br.right + 1) bad.push('вылезает за область');
            if (r.height > lh * 6 + 4 && e.textContent.length < 80) bad.push('слишком высокая: ' + Math.round(r.height));
            if (parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 1 && r.height > 4 && r.width < 60) bad.push('круглая');
            if (e.scrollWidth > e.clientWidth + 1 && cs.whiteSpace === 'nowrap' && cs.textOverflow !== 'ellipsis') bad.push('текст обрезан без многоточия');
            return { cls: e.className, bad }; }).filter(x => x.bad.length);
        }, a.box);
        if (res === null){ console.log(`  · сообщения/${a.name}: область не открылась — пропуск`); }
        else { hard += res.length; res.forEach(x => console.log(`      ⛔ сообщения/${a.name}: «${x.cls}» — ${x.bad.join('; ')}`)); }
        await page.evaluate(() => window.App.closeModal()).catch(() => {}); await page.waitForTimeout(200);
      }
      /* полоска отправки: строки хвоста лога */
      const mini = await page.evaluate(() => {
        const host = document.getElementById('toasts') || document.body;
        const el = document.createElement('div'); el.id = 'mq-mini'; el.className = 'mq-mini'; el.innerHTML = '<div class="mq-mini-b"></div>'; host.appendChild(el);
        const b = el.querySelector('.mq-mini-b');
        ['ok', 'warn', 'err', 'dim'].forEach(c => { const d = document.createElement('div'); d.className = 'mq-l ' + c; d.textContent = c + ' — файл отправлен на Диск'; b.appendChild(d); });
        const bw = b.clientWidth; const out = [...b.querySelectorAll('.mq-l')].map(e => ({ cls: e.className, w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), bw })).filter(x => x.w < x.bw * 0.6 || x.h > 60);
        el.remove(); return out; });
      hard += mini.length; mini.forEach(x => console.log(`      ⛔ сообщения/полоска отправки: «${x.cls}» ${x.w}×${x.h} при ширине ${x.bw}`));
      fails += hard;
      console.log(`  ${hard ? '⛔' : '✓'} сообщения   дефектов ${hard} · проверка связи, очередь отправки, полоска отправки`);
    }

    if (errors.length) {
      fails += errors.length;
      console.log('  ⛔ ошибки в консоли:');
      errors.forEach(e => console.log('     ' + e));
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nИтог: ошибок ${fails}, мягких замечаний ${warns}`);
  process.exit(fails || (STRICT && warns) ? 1 : 0);
})().catch(e => { console.error('тест упал:', e); process.exit(2); });
