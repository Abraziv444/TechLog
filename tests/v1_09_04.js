/* v1.09.04 — (1) значок «копировать» — два прямоугольника внахлёст (кнопка у адреса
   на карточке и остальные «Копировать…»); (2) справка Главной: раздел «Цвет левой
   полосы карточки» с пустыми карточками-образцами, цвета образцов = цвета настоящих
   карточек на экране; та же легенда видов задач — в справке Доски.
   Запуск: node tests/v1_09_04.js [порт] (демо; сервер поднимается в той же команде).
   Снимки для просмотра глазами: tests/out/v1_09_04-<режим>.png */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8194;
const OUT = path.join(__dirname, 'out');
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, who, mode, w, h){
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([who, mode]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', who);
    localStorage.setItem('techlog_view_mode', mode); }, [who, mode]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(500);
  return p;
}

(async () => {
  try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  for (const [title, mode, w, h, tag] of [['админ, телефон 390', 'mobile', 390, 900, 'mobile'], ['админ, ПК 1280', 'desktop', 1280, 1000, 'pc']]){
    console.log('— ' + title + ' —');
    const p = await boot(br, 'demo-admin', mode, w, h);

    /* (1) кнопка копирования адреса */
    const cp = await p.evaluate(() => {
      const b = document.querySelector('#app .item .copy-mini'); if (!b) return null;
      const r = b.getBoundingClientRect(), s = b.querySelector('svg'), sr = s.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), rects: s.querySelectorAll('rect').length, paths: s.querySelectorAll('path').length,
        sw: Math.round(sr.width), inside: sr.left >= r.left && sr.right <= r.right && sr.top >= r.top && sr.bottom <= r.bottom,
        title: b.getAttribute('title') || '' };
    });
    t('у адреса на карточке — кнопка копирования 24×24 со значком «два листа» (rect + контур второго), значок внутри кнопки',
      cp && cp.w >= 24 && cp.h >= 24 && cp.rects === 1 && cp.paths === 1 && cp.inside && cp.sw >= 14, JSON.stringify(cp));
    const clip = await p.evaluate(async () => { let got = null;
      try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async x => { got = x; } }, configurable: true }); } catch (e) {}
      const b = document.querySelector('#app .item .copy-mini');
      const addr = b.parentElement.querySelector('.addr-txt').textContent.trim();
      b.click(); await new Promise(r => setTimeout(r, 300));
      return { got, addr, scr: location.hash, modal: !!document.querySelector('.overlay') }; });
    t('нажатие копирует адрес и не открывает документ', clip.got === clip.addr && !clip.modal, JSON.stringify(clip));

    /* (2) справка Главной */
    const real = await p.evaluate(() => [...document.querySelectorAll('#app .item')].map(x => x.style.borderLeftColor));
    await p.evaluate(() => window.App.sectionFaq('home'));
    await p.waitForTimeout(500);
    const L = await p.evaluate(() => {
      const m = document.querySelector('.overlay .faqm'); if (!m) return null;
      const big = [...m.querySelectorAll('.fq-stripes .fq-card')], sm = [...m.querySelectorAll('.fq-wts .fq-card.sm')];
      const M = m.getBoundingClientRect();
      const box = x => { const r = x.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), out: r.right > M.right + 1 || r.left < M.left - 1 }; };
      const txt = x => { const c = x.cloneNode(true); c.querySelectorAll('svg').forEach(s => s.remove()); return c.textContent.trim(); };
      return { big: big.map(x => ({ col: getComputedStyle(x).borderLeftColor, bw: getComputedStyle(x).borderLeftWidth, op: getComputedStyle(x).opacity,
                 num: !!x.querySelector('.row-num'), mv: x.querySelectorAll('.fq-mv').length, txt: txt(x), ...box(x) })),
        sm: sm.map(x => ({ col: getComputedStyle(x).borderLeftColor, txt: txt(x), ...box(x) })),
        names: [...m.querySelectorAll('.fq-wt-n')].map(x => x.textContent.trim()),
        nameOut: [...m.querySelectorAll('.fq-wt, .fq-txt')].filter(x => box(x).out).length,
        overlap: (() => { const rs = [...m.querySelectorAll('.fq-row')].map(r => [r.querySelector('.fq-card').getBoundingClientRect(), r.querySelector('.fq-txt').getBoundingClientRect()]);
          return rs.filter(([a, b]) => a.right > b.left + 0.5).length; })(),
        btn: m.querySelectorAll('.fq-stripes button, .fq-wts button').length,
        h4: [...m.querySelectorAll('h4')].map(x => x.textContent.trim()),
        wts: (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').work_types || []).length,
        scrollW: m.scrollWidth - m.clientWidth };
    });
    t('в справке Главной есть раздел «Цвет левой полосы карточки»', L && L.h4.some(x => /Цвет левой полосы/.test(x)), L && L.h4.join(' | '));
    t('три образца пикапа: серый, красный, тёмный блёклый; полоса 6 px, номер и две стрелки, текста внутри нет',
      L && L.big.length === 3 && L.big[0].col === 'rgb(138, 160, 171)' && L.big[1].col === 'rgb(255, 75, 75)' && L.big[2].col === 'rgb(58, 74, 82)'
      && L.big[2].op === '0.6' && L.big.every(c => c.bw === '6px' && c.num && c.mv === 2 && /^\d+$/.test(c.txt)), JSON.stringify(L && L.big));
    t('образцы видов задач — по одному на каждый вид справочника, пустые, подпись рядом', L && L.wts > 0 && L.sm.length === L.wts
      && L.names.length === L.wts && L.names.every(Boolean) && L.sm.every(c => /^\d+$/.test(c.txt)), JSON.stringify({ wts: L && L.wts, sm: L && L.sm.length }));
    t('ничего не вылезает за окно справки, карточка-образец не налезает на свой текст, горизонтальной прокрутки нет',
      L && L.big.every(c => !c.out) && L.sm.every(c => !c.out) && L.nameOut === 0 && L.overlap === 0 && L.scrollW <= 0, JSON.stringify({ o: L && L.overlap, n: L && L.nameOut, s: L && L.scrollW }));
    t('образцы — не кнопки', L && L.btn === 0);
    const toRgb = await p.evaluate((cols) => cols.map(c => { const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }), real);
    const legend = new Set([...(L ? L.big : []), ...(L ? L.sm : [])].map(c => c.col));
    t('каждый цвет полосы настоящих карточек на экране есть среди образцов справки', toRgb.length > 0 && toRgb.every(c => legend.has(c)), JSON.stringify(toRgb.filter(c => !legend.has(c))));
    const sh = await p.$('.overlay .modal'); if (sh) await sh.screenshot({ path: path.join(OUT, `v1_09_04-${tag}.png`) });
    await p.evaluate(() => { const el = document.querySelector('.overlay .faqm .fq-sub'); if (el) el.scrollIntoView(); });
    await p.waitForTimeout(200);
    if (sh) await sh.screenshot({ path: path.join(OUT, `v1_09_04-${tag}-legend.png`) });
    await p.evaluate(() => window.App.closeModal && window.App.closeModal()); await p.waitForTimeout(200);

    /* EN */
    await p.evaluate(() => { window.App.setLang ? window.App.setLang('en') : null; }); await p.waitForTimeout(400);
    const en = await p.evaluate(() => { window.App.sectionFaq('home'); const m = document.querySelector('.overlay .faqm');
      return m ? { h4: [...m.querySelectorAll('h4')].map(x => x.textContent.trim()), cards: m.querySelectorAll('.fq-card').length } : null; });
    t('EN: раздел и образцы на месте', en && en.h4.some(x => /left stripe/i.test(x)) && L && en.cards === L.big.length + L.sm.length, JSON.stringify(en));
    await p.evaluate(() => { window.App.closeModal && window.App.closeModal(); window.App.setLang && window.App.setLang('ru'); }); await p.waitForTimeout(300);

    /* Доска */
    const bd = await p.evaluate(() => { window.App.sectionFaq('board'); const m = document.querySelector('.overlay .faqm');
      return m ? { sm: m.querySelectorAll('.fq-wts .fq-card.sm').length, pu: /PU/.test(m.textContent), sw: m.scrollWidth - m.clientWidth } : null; });
    t('справка Доски: легенда видов задач и пояснение про плашку PU', bd && bd.sm === (L && L.wts) && bd.pu && bd.sw <= 0, JSON.stringify(bd));
    await p.context().close();
  }

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})();
