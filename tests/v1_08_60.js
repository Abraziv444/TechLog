/* v1.08.60 — учебник раздела 1 на двух языках: выбор файла по языку
   интерфейса, рамка со скриптами, просмотрщик внутри книги (страницы,
   оглавление, поиск, масштаб, режимы, тема, память позиции).
   Запуск: node tests/v1_08_60.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8161;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 414, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);
  const frameOf = () => p.frames().find(f => /dictionary\/books\/section-1/.test(f.url()));

  console.log('— каталог и кнопка «Книга» по языку —');
  {
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(1600);
    const c1 = await p.evaluate(() => { window.App.studySel('1'); const b = document.querySelector('.st-sec button[onclick*="studyRead"]'); return { dis: b.disabled, sub: (document.querySelector('.st-sec .tiny') || {}).textContent || '' }; });
    t('раздел 1: кнопка «Книга» активна, в подписи «книга»', !c1.dis && /книга/.test(c1.sub), JSON.stringify(c1));
    await p.evaluate(() => window.App.studySel('6')); await p.waitForTimeout(900);
    const c2 = await p.evaluate(() => ({ dis: document.querySelector('.st-sec button[onclick*="studyRead"]').disabled, sub: (document.querySelector('.st-sec .tiny') || {}).textContent || '' }));
    t('раздел 6: файлов книги нет (ни ru, ни en) — кнопка гаснет, «книги пока нет»', c2.dis && /книги пока нет/.test(c2.sub), JSON.stringify(c2));
    await p.evaluate(() => window.App.studySel('5')); await p.waitForTimeout(900);
    await p.evaluate(() => window.App.studyRead('5')); await p.waitForTimeout(500);
    const s5 = await p.evaluate(() => document.querySelector('.st-frame').getAttribute('src'));
    t('v1.08.64: раздел 5 — открывается section-5-ru.html', /books\/section-5-ru\.html$/.test(s5), s5);
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.studySel('4')); await p.waitForTimeout(900);
    await p.evaluate(() => window.App.studyRead('4')); await p.waitForTimeout(500);
    const s4 = await p.evaluate(() => document.querySelector('.st-frame').getAttribute('src'));
    t('v1.08.63: раздел 4 — открывается section-4-ru.html', /books\/section-4-ru\.html$/.test(s4), s4);
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.studySel('3')); await p.waitForTimeout(900);
    await p.evaluate(() => window.App.studyRead('3')); await p.waitForTimeout(500);
    const s3 = await p.evaluate(() => document.querySelector('.st-frame').getAttribute('src'));
    t('v1.08.62: раздел 3 — открывается section-3-ru.html', /books\/section-3-ru\.html$/.test(s3), s3);
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.studySel('2')); await p.waitForTimeout(900);
    const c3 = await p.evaluate(() => ({ dis: document.querySelector('.st-sec button[onclick*="studyRead"]').disabled }));
    await p.evaluate(() => window.App.studyRead('2')); await p.waitForTimeout(500);
    const s2 = await p.evaluate(() => document.querySelector('.st-frame').getAttribute('src'));
    t('v1.08.61: раздел 2 — кнопка активна, открывается section-2-ru.html', !c3.dis && /books\/section-2-ru\.html$/.test(s2), s2);
    let f2s = null; for (let i = 0; i < 60 && !f2s; i++){ await p.waitForTimeout(250); f2s = p.frames().find(f => /section-2-ru/.test(f.url())); }
    await f2s.waitForFunction(() => document.querySelectorAll('#inner .pg[data-on]').length > 0, null, { timeout: 30000 }); await f2s.waitForTimeout(500);
    await f2s.evaluate(() => { const i = document.getElementById('pgin'); i.value = 'ii'; i.dispatchEvent(new Event('change')); }); await f2s.waitForTimeout(400);
    const r2 = await f2s.evaluate(() => ({ tot: document.getElementById('pgtot').textContent.trim(), pg: document.getElementById('pgin').value, toc: [...document.querySelectorAll('#btoc .toci span')].map(e => e.textContent) }));
    t('v1.08.61: 67 страниц, ввод «ii» ведёт на римскую титульную, оглавление с главой «Пожар и дым»', r2.tot === '/ 67' && r2.pg === 'ii' && r2.toc.includes('Пожар и дым'), JSON.stringify(r2));
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.studySel('1')); await p.waitForTimeout(300);

    await p.evaluate(() => window.App.studyRead('1')); await p.waitForTimeout(600);
    const rd = await p.evaluate(() => { const f = document.querySelector('.st-frame'); return { src: f.getAttribute('src'), sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow') }; });
    t('RU: открывается section-1-ru.html, рамка с allow-scripts и fullscreen', /books\/section-1-ru\.html$/.test(rd.src) && /allow-scripts/.test(rd.sandbox) && /allow-same-origin/.test(rd.sandbox) && rd.allow === 'fullscreen', JSON.stringify(rd));
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.setLang('en')); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.studyRead('1')); await p.waitForTimeout(600);
    const en = await p.evaluate(() => document.querySelector('.st-frame').getAttribute('src'));
    t('EN в Настройках → открывается section-1-en.html', /books\/section-1-en\.html$/.test(en), en);
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.setLang('ru')); await p.waitForTimeout(300);
  }

  console.log('— просмотрщик внутри книги (RU) —');
  {
    await p.evaluate(() => window.App.studyRead('1'));
    let f = null;
    for (let i = 0; i < 60 && !f; i++){ await p.waitForTimeout(250); f = frameOf(); }
    await f.waitForFunction(() => document.querySelectorAll('#inner .pg').length > 0, null, { timeout: 30000 });
    await f.waitForTimeout(800);
    const st = await f.evaluate(() => ({ n: document.querySelectorAll('#inner .pg').length, tot: document.getElementById('pgtot').textContent.trim(),
      pg: document.getElementById('pgin').value, mounted: document.querySelectorAll('#inner .pg[data-on] svg').length,
      title: document.getElementById('ttx').textContent, toc: document.querySelectorAll('#btoc .toci').length,
      text: document.querySelectorAll('#inner .pg svg text').length, img: document.querySelectorAll('#inner .pg svg image').length,
      pw: parseFloat(getComputedStyle(document.querySelector('#inner .pg')).width), fit: document.getElementById('bfit').classList.contains('on') }));
    t('173 страницы, счётчик «/ 173», первые страницы смонтированы (svg с текстом)', st.n === 173 && st.tot === '/ 173' && st.mounted >= 2 && st.text > 0, JSON.stringify(st));
    t('заголовок «Раздел 1 · Устранение последствий залива», оглавление ≥ 10 пунктов', /Раздел 1 · Устранение/.test(st.title) && st.toc >= 10, JSON.stringify({ title: st.title, toc: st.toc }));
    t('старт «по ширине»: страница уже рамки, кнопка подсвечена', st.fit && st.pw > 200 && st.pw <= 414, JSON.stringify({ pw: st.pw, fit: st.fit }));

    await f.evaluate(() => document.getElementById('bnext').click()); await f.waitForTimeout(500);
    const nx = await f.evaluate(() => ({ pg: document.getElementById('pgin').value, top: document.getElementById('doc').scrollTop }));
    t('«вперёд»: вторая страница, лента прокрутилась', nx.top > 100, JSON.stringify(nx));
    await f.evaluate(() => { const i = document.getElementById('pgin'); i.value = '45'; i.dispatchEvent(new Event('change')); }); await f.waitForTimeout(500);
    const j45 = await f.evaluate(() => ({ pg: document.getElementById('pgin').value, cur: [...document.querySelectorAll('#inner .pg')].findIndex(e => e.dataset.on && Math.abs(e.getBoundingClientRect().top - document.getElementById('doc').getBoundingClientRect().top) < 40) }));
    t('ввод «45» → книжная страница 45 (физическая 56: 11 титульных + 45)', j45.pg === '45' && j45.cur === 55, JSON.stringify(j45));
    await f.evaluate(() => document.getElementById('bzi').click()); await f.waitForTimeout(300);
    const z = await f.evaluate(() => ({ pw: parseFloat(getComputedStyle(document.querySelector('#inner .pg')).width), lbl: document.getElementById('zlbl').textContent, fit: document.getElementById('bfit').classList.contains('on') }));
    t('«крупнее» увеличивает страницу и снимает «по ширине»', z.pw > 414 && !z.fit, JSON.stringify(z));
    await f.evaluate(() => document.getElementById('bfit').click()); await f.waitForTimeout(300);
    t('«по ширине» возвращает ширину рамки', await f.evaluate(() => document.getElementById('bfit').classList.contains('on') && parseFloat(getComputedStyle(document.querySelector('#inner .pg')).width) <= 414));

    await f.evaluate(() => document.getElementById('bmode').click()); await f.waitForTimeout(300);
    const pm = await f.evaluate(() => ({ mode: document.getElementById('doc').classList.contains('pagemode'), vis: [...document.querySelectorAll('#inner .pg')].filter(e => getComputedStyle(e).display !== 'none').length }));
    t('режим листания: видна ровно одна страница', pm.mode && pm.vis === 1, JSON.stringify(pm));
    await f.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))); await f.waitForTimeout(200);
    t('→ в режиме листания переводит на следующую страницу', (await f.evaluate(() => document.getElementById('pgin').value)) === '46');
    await f.evaluate(() => document.getElementById('bmode').click()); await f.waitForTimeout(300);

    await f.evaluate(() => document.getElementById('bfind').click()); await f.waitForTimeout(200);
    await f.type('#q', 'влажность'); await f.waitForTimeout(900);
    const sr = await f.evaluate(() => ({ cnt: document.getElementById('scnt').textContent, res: document.querySelectorAll('#bres .sri').length, hl: document.querySelectorAll('#inner .pg rect.hl').length, cur: document.querySelectorAll('#inner .pg rect.hl.cur').length }));
    t('поиск «влажность»: счётчик «N из M», список совпадений, подсветка в тексте с текущим', /\d+ из \d+/.test(sr.cnt) && sr.res > 10 && sr.hl > 0 && sr.cur === 1, JSON.stringify(sr));
    await f.evaluate(() => document.getElementById('snext').click()); await f.waitForTimeout(400);
    t('«следующее» двигает счётчик на 2', /^2 из/.test(await f.evaluate(() => document.getElementById('scnt').textContent)));
    await f.evaluate(() => document.getElementById('sclose').click()); await f.waitForTimeout(200);
    t('закрытие поиска снимает подсветку', (await f.evaluate(() => document.querySelectorAll('#inner .pg rect.hl').length)) === 0);

    await f.evaluate(() => document.getElementById('bmenu').click()); await f.waitForTimeout(300);
    await f.evaluate(() => document.querySelectorAll('#btoc .toci')[2].click()); await f.waitForTimeout(500);
    const tc = await f.evaluate(() => ({ open: document.getElementById('pn').classList.contains('open'), pg: document.getElementById('pgin').value, on: document.querySelectorAll('#btoc .toci.on').length }));
    t('оглавление: пункт открывает свою страницу, панель на телефоне закрывается', !tc.open && tc.pg !== '46' && tc.on === 1, JSON.stringify(tc));
    const tocT = await f.evaluate(() => [...document.querySelectorAll('#btoc .toci span')].map(e => e.textContent));
    t('оглавление собрано по колонтитулам: главы 1–10, без мусора из таблиц («Чёрный»)', tocT.includes('Введение') && tocT.includes('Сушка материалов') && tocT.includes('Оглавление') && !tocT.includes('Чёрный') && tocT.length >= 14, tocT.join(' | '));
    await f.evaluate(() => { document.getElementById('bmenu').click(); document.getElementById('tthumb').click(); }); await f.waitForTimeout(700);
    const th = await f.evaluate(() => ({ n: document.querySelectorAll('#thg .th').length, svg: document.querySelectorAll('#thg .th svg').length }));
    t('миниатюры: 173 плитки, видимые отрисованы', th.n === 173 && th.svg > 0 && th.svg < 173, JSON.stringify(th));
    await f.evaluate(() => document.getElementById('ov').click()); await f.waitForTimeout(200);

    await f.evaluate(() => document.getElementById('btheme').click()); await f.waitForTimeout(200);
    await f.evaluate(() => document.getElementById('btheme').click()); await f.waitForTimeout(200);
    t('тема: два нажатия — тёмная (инверсия страницы)', await f.evaluate(() => document.body.classList.contains('night') && getComputedStyle(document.querySelector('#inner .pg svg')).filter.includes('invert')));
    await f.evaluate(() => document.getElementById('btheme').click()); await f.waitForTimeout(200);

    const saved = await f.evaluate(() => Object.assign({ pg: document.getElementById('pgin').value }, JSON.parse(localStorage.getItem('tlbook:ru:1') || '{}')));
    t('позиция, режим и тема сохранены в localStorage (tlbook:ru:1)', saved.cur > 0 && saved.mode === 'scroll' && saved.theme === 'light', JSON.stringify(saved));
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(400);
    await p.evaluate(() => window.App.studyRead('1'));
    let f2 = null; for (let i = 0; i < 60 && !f2; i++){ await p.waitForTimeout(250); f2 = frameOf(); }
    await f2.waitForFunction(() => document.querySelectorAll('#inner .pg[data-on]').length > 0, null, { timeout: 30000 }); await f2.waitForTimeout(600);
    const re = await f2.evaluate(() => ({ pg: document.getElementById('pgin').value, ls: localStorage.getItem('tlbook:ru:1') }));
    t('повторное открытие — с той же страницы', re.pg === saved.pg && saved.cur > 0, JSON.stringify({ saved, re }));
    await p.evaluate(() => window.App.studyReadClose()); await p.waitForTimeout(300);
  }

  t('ошибок JS на странице и во фрейме нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
