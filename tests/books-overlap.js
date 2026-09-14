/* =====================================================================
   TechLog · tests/books-overlap.js — вёрстка учебников (v1.08.68)
   ---------------------------------------------------------------------
   Пробегает по ВСЕМ страницам ВСЕХ учебников из dictionary/index.json
   (RU и EN), отрисовывает каждую страницу в настоящем просмотрщике и
   меряет фактические прямоугольники элементов SVG. Ищет:
     • текст ∩ картинка — надпись легла на фотографию/схему;
     • текст ∩ линия   — линейка, рамка таблицы или стрелка проходит
                         сквозь буквы (подчёркивания под базовой линией
                         не считаются);
     • текст ∩ текст   — два фрагмента наехали друг на друга
                         (шрифт заменён, ширина прибита textLength —
                         так ловим места, где подгонка не сработала);
     • текст за краем страницы.
   Отчёт: в консоль — итог по книгам и первые находки, полный список —
   tests/out/books-overlap.txt (страница, вид, координаты, текст).

   Запуск (демо-сервер как у остальных тестов):
     cp -r . /tmp/tlrun && echo 'window.TECHLOG_CONFIG = {};' > /tmp/tlrun/config.js
     (cd /tmp/tlrun && python3 -m http.server 8099 &) && node tests/books-overlap.js 8099

   Переменные: BOOKS=section-1-ru,section-2-en — только эти книги;
   PAGES=1-20 — только диапазон физических страниц; BOOKS_STRICT=0 — не
   валить сборку, только отчёт.
   ===================================================================== */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');

const PORT = process.argv[2] || process.env.PORT || '8099';
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STRICT = process.env.BOOKS_STRICT !== '0';
const ONLY = (process.env.BOOKS || '').split(',').map(s => s.trim()).filter(Boolean);
const RANGE = (process.env.PAGES || '').match(/^(\d+)-(\d+)$/);
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');

/* пороги (в пунктах, страница 612×792) */
const T = {
  minOverlap: 1.0,      // пересечение меньше пункта — округление, не дефект
  textTextX: 2.5,       // два текста на строке наехали более чем на 2,5 pt (свес жирных букв за ширину знака — до ~2 pt, не дефект)
  textTextY: 0.5,       // и по высоте перекрываются больше половины меньшего
  lineThin: 1.6,        // «линия» = путь тоньше 1,6 pt по одной из сторон
  coreTop: 0.22,        // «сердцевина» строки: от 22 % до 72 % высоты box —
  coreBot: 0.72,        //   подчёркивания и надчёркивания сюда не попадают
  imgMinArea: 0.10,     // на картинке: не меньше 10 % площади текста
};

/* в браузере: отрисовать страницу и вернуть прямоугольники */
function MEASURE([idx, TH]){
  const D = window.__BK || (window.__BK = JSON.parse(document.getElementById('bk').textContent));
  const host = document.getElementById('inner') || document.body;
  let el = document.getElementById('__measure');
  if (!el){ el = document.createElement('div'); el.id = '__measure';
    el.style.cssText = 'position:absolute;left:0;top:0;width:612px;height:792px;overflow:visible;visibility:hidden;pointer-events:none';
    host.appendChild(el); }
  el.innerHTML = '<svg viewBox="0 0 612 792" width="612" height="792" xmlns="http://www.w3.org/2000/svg">' + D.p[idx].s + '</svg>';
  const svg = el.firstChild, sr = svg.getBoundingClientRect();
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }; };
  const texts = [], images = [], lines = [], fills = [];
  svg.querySelectorAll('text').forEach(e => { const b = box(e); if (b.w > 0 && b.h > 0) texts.push(Object.assign(b, { t: e.textContent.slice(0, 60) })); });
  svg.querySelectorAll('image').forEach(e => images.push(box(e)));
  /* пути с одинаковым стилем конвертер склеивает в один <path> (рамки двух
     фото, все отточия оглавления…) — меряем каждый подпуть отдельно, иначе
     общий bbox накрывает текст между ними */
  const NS = 'http://www.w3.org/2000/svg';
  svg.querySelectorAll('path').forEach(e => {
    const stroked = e.getAttribute('stroke') && e.getAttribute('stroke') !== 'none';
    const filled = (e.getAttribute('fill') || '') !== 'none';
    const white = /^#f{6}$|^#fff$|^white$/i.test(e.getAttribute('fill') || '') && !stroked;
    if (white) return;                                    // белые заливки — «ластик», не линия
    const d = e.getAttribute('d') || '';
    const subs = d.split(/(?=[Mm])/).filter(Boolean);
    const boxes = [];
    if (subs.length <= 1) boxes.push(box(e));
    else {
      const tmp = document.createElementNS(NS, 'path');
      for (const a of e.attributes) if (a.name !== 'd') tmp.setAttribute(a.name, a.value);
      svg.appendChild(tmp);
      subs.forEach(sd => { tmp.setAttribute('d', sd); boxes.push(box(tmp)); });
      tmp.remove();
    }
    boxes.forEach(b => {
      if (!(b.w > 0 || b.h > 0)) return;
      if (b.w >= 611 && b.h >= 791) return;               // подложка страницы
      if (b.w < TH.lineThin || b.h < TH.lineThin) lines.push(Object.assign(b, { s: !!stroked }));
      else if (stroked && !filled) lines.push(Object.assign(b, { s: true, frame: true }));   // рамка без заливки — её стороны
      else fills.push(b);
    });
  });
  el.innerHTML = '';
  return { texts, images, lines, fills, label: D.meta.labels[idx] || String(idx + 1) };
}

function inter(a, b){
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w), bo = Math.min(a.y + a.h, b.y + b.h);
  return (r > x && bo > y) ? { x, y, w: r - x, h: bo - y } : null;
}
const f1 = (v) => Math.round(v * 10) / 10;

function analyze(m){
  const out = [];
  const { texts, images, lines } = m;
  /* текст ∩ картинка */
  texts.forEach(t => images.forEach(im => {
    const i = inter(t, im); if (!i || i.w < T.minOverlap || i.h < T.minOverlap) return;
    if (i.w * i.h < T.imgMinArea * t.w * t.h) return;
    out.push({ kind: 'картинка', at: `x${f1(t.x)} y${f1(t.y)}`, text: t.t, note: `${f1(i.w)}×${f1(i.h)} pt` });
  }));
  /* текст ∩ линия: только сердцевина строки */
  texts.forEach(t => {
    const core = { x: t.x, y: t.y + t.h * T.coreTop, w: t.w, h: t.h * (T.coreBot - T.coreTop) };
    lines.forEach(l => {
      let segs = [l];
      if (l.frame) segs = [ { x: l.x, y: l.y, w: l.w, h: 0.5 }, { x: l.x, y: l.y + l.h - 0.5, w: l.w, h: 0.5 },
                            { x: l.x, y: l.y, w: 0.5, h: l.h }, { x: l.x + l.w - 0.5, y: l.y, w: 0.5, h: l.h } ];
      for (const sg of segs){
        const i = inter(core, sg); if (!i) continue;
        const horiz = sg.w >= sg.h;
        if (horiz ? i.w < T.minOverlap : i.h < T.minOverlap) continue;
        /* линия должна реально заходить в строку, а не касаться её края */
        if (horiz ? i.h < Math.min(0.5, sg.h * 0.6) : i.w < Math.min(0.5, sg.w * 0.6)) continue;
        out.push({ kind: 'линия', at: `x${f1(t.x)} y${f1(t.y)}`, text: t.t, note: (horiz ? 'горизонтальная' : 'вертикальная') + ` через ${f1(i.w)}×${f1(i.h)} pt` });
        break;
      }
    });
  });
  /* текст ∩ текст */
  for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++){
    const A = texts[a], B = texts[b], i = inter(A, B); if (!i) continue;
    if (i.w < T.textTextX) continue;
    /* одиночный знак препинания (кавычка, штрих) в отдельном шрифте — его
       собственная ширина в PDF шире глифа; наезд в пару пунктов — не дефект */
    const punct = (x) => x.t.trim().length <= 1 && !/[\p{L}\p{N}]/u.test(x.t);
    if ((punct(A) || punct(B)) && i.w < 4) continue;
    if (i.h < T.textTextY * Math.min(A.h, B.h)) continue;
    out.push({ kind: 'текст', at: `x${f1(A.x)} y${f1(A.y)}`, text: `«${A.t}» ∩ «${B.t}»`, note: `${f1(i.w)}×${f1(i.h)} pt` });
  }
  /* за краем страницы */
  texts.forEach(t => {
    if (t.x < -0.5 || t.x + t.w > 612.5 || t.y < -0.5 || t.y + t.h > 792.5)
      out.push({ kind: 'край', at: `x${f1(t.x)} y${f1(t.y)}`, text: t.t, note: `правый край ${f1(t.x + t.w)}` });
  });
  return out;
}

(async () => {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'dictionary/index.json'), 'utf8'));
  const books = [];
  idx.sections.forEach(s => {
    const b = s.book; if (!b) return;
    const list = typeof b === 'string' ? [['', b]] : Object.entries(b);
    list.forEach(([lang, file]) => {
      if (!/\.html$/.test(file) || !fs.existsSync(path.join(ROOT, 'dictionary', file))) return;
      const name = path.basename(file, '.html');
      if (ONLY.length && !ONLY.includes(name)) return;
      books.push({ sec: s.id, lang, file, name });
    });
  });
  if (!books.length){ console.log('учебников не найдено'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  let total = 0, pagesN = 0;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('pageerror', e => console.log('  ⛔ ошибка в книге: ' + String(e).slice(0, 140)));
  const t0 = Date.now();
  for (const bk of books){
    await page.goto(`http://127.0.0.1:${PORT}/dictionary/${bk.file}`, { waitUntil: 'load' });
    const isViewer = await page.evaluate(() => !!(document.getElementById('bk') && document.getElementById('inner')));
    if (!isViewer){ console.log(`  · ${bk.name.padEnd(14)} обычная html-страница, не учебник из PDF — пропуск`); continue; }
    await page.evaluate(() => (document.fonts && document.fonts.ready) || null);
    const n = await page.evaluate(() => JSON.parse(document.getElementById('bk').textContent).p.length);
    if (!n){ console.log(`  ${bk.name}: страниц нет, пропуск`); continue; }
    const from = RANGE ? Math.max(0, +RANGE[1] - 1) : 0, to = RANGE ? Math.min(n, +RANGE[2]) : n;
    const found = [], byKind = {};
    for (let i = from; i < to; i++){
      const m = await page.evaluate(MEASURE, [i, T]);
      pagesN++;
      analyze(m).forEach(f => { f.page = m.label; f.phys = i + 1; found.push(f); byKind[f.kind] = (byKind[f.kind] || 0) + 1; });
    }
    total += found.length;
    const sum = Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`  ${found.length ? '⛔' : '✓'} ${bk.name.padEnd(14)} ${n} стр. — ${found.length ? 'пересечений ' + found.length + ' (' + sum + ')' : 'пересечений нет'}`);
    found.slice(0, 6).forEach(f => console.log(`      стр. ${f.page} [${f.phys}] · ${f.kind}: ${f.text} · ${f.note}`));
    if (found.length > 6) console.log(`      … ещё ${found.length - 6}, полный список — tests/out/books-overlap.txt`);
    report.push(`=== ${bk.name} (раздел ${bk.sec}${bk.lang ? ', ' + bk.lang : ''}) — ${n} стр., пересечений ${found.length}`);
    found.forEach(f => report.push(`стр. ${f.page} [${f.phys}] · ${f.kind} · ${f.at} · ${f.text} · ${f.note}`));
    report.push('');
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'books-overlap.txt'), report.join('\n'), 'utf8');
  console.log(`\nИтог: книг ${books.length}, страниц ${pagesN}, пересечений ${total} — ${Math.round((Date.now() - t0) / 1000)} с; отчёт: tests/out/books-overlap.txt`);
  process.exit(total && STRICT ? 1 : 0);
})().catch(e => { console.error('тест упал:', e); process.exit(2); });
