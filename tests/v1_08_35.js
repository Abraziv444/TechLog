/* Смоук v1.08.35: (1) шапка не растёт — поиск в строке с пилюлей режима;
   (2) чипы «что ищем» в глобальном поиске; (3) «?»-справка конструктора
   нумерации; (4) диагностика внешних сервисов карт (OSM + Nominatim,
   заглушки в роуте); (5) «компактно» на ПК реально ужимает интерфейс.
   Запуск: node tests/v1_08_35.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8135;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const stubRoutes = async (p) => {
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/tile\.openstreetmap\.org/.test(u))
      return r.fulfill({ contentType: 'image/png', body: PNG1 });
    if (/nominatim\.openstreetmap\.org/.test(u))
      return r.fulfill({ contentType: 'application/json', body: '[]' });
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript',
      body: 'window.L={map:()=>({setView(){return this},remove(){}}),tileLayer:()=>({addTo(){}})};' });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });
};

(async () => {
  const br = await chromium.launch({ executablePath:
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  /* ================= МОБИЛЬНЫЙ КОНТЕКСТ ================= */
  const mctx = await br.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const p = await mctx.newPage();
  p.on('dialog', d => d.accept());
  await stubRoutes(p);
  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await p.reload(); await p.waitForTimeout(900);

  console.log('— шапка —');
  const hdr = await p.evaluate(() => {
    const bar = document.querySelector('.topbar');
    const row = document.querySelector('.rt-col .rt-row');
    return {
      h: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
      rowKids: row ? [...row.children].map(e => e.className || e.id).join('|') : '(нет .rt-row)',
      srchInRow: !!document.querySelector('.rt-row .hdr-srch'),
      srchSize: Math.round(document.querySelector('.hdr-srch').getBoundingClientRect().height),
      pill: Math.round(document.querySelector('#vm-slot').getBoundingClientRect().height),
      rtcol: Math.round(document.querySelector('.rt-col').getBoundingClientRect().height),
      avwrap: Math.round(document.querySelector('.avatar-wrap').getBoundingClientRect().height),
    };
  });
  t('поиск и пилюля режима — одной строкой', hdr.srchInRow, hdr.rowKids);
  t('шапка не выросла из-за поиска (значок не выше пилюли)', hdr.srchSize <= hdr.pill, hdr.srchSize + ' vs ' + hdr.pill);
  t('правая колонка не выше колонки аватарки (+4px допуск)', hdr.rtcol <= hdr.avwrap + 4, hdr.rtcol + ' vs ' + hdr.avwrap);
  t('шапка ≤ 70px', hdr.h > 0 && hdr.h <= 70, hdr.h + 'px');

  console.log('— глобальный поиск: чипы —');
  /* какой юнит есть в демо-данных — берём с главной */
  const demoUnit = await p.evaluate(() => {
    const m = (document.body.textContent || '').match(/Unit\s+([0-9A-Za-z-]{2,})/);
    return m ? m[1] : null;
  });
  await p.click('.hdr-srch');
  await p.waitForSelector('#srch-q', { timeout: 3000 });
  const chips = await p.evaluate(() =>
    [...document.querySelectorAll('.srch-chips .chip-preset')].map(b => b.dataset.sk));
  t('7 чипов на месте', chips.join(',') === 'all,unit,job,pk,prop,rep,cx', chips.join(','));

  await p.fill('#srch-q', 'magnolia');
  await p.waitForTimeout(250);
  const gAll = await p.evaluate(() => [...document.querySelectorAll('.srch-grp')].map(e => e.textContent));
  t('«Всё»: и работы, и комплексы найдены',
    gAll.some(s => /Работы/.test(s)) && gAll.some(s => /Комплексы/.test(s)), JSON.stringify(gAll));

  await p.evaluate(() => window.App.srchChip('cx'));
  await p.waitForTimeout(200);
  const gCx = await p.evaluate(() => ({
    grps: [...document.querySelectorAll('.srch-grp')].map(e => e.textContent),
    focus: document.activeElement && document.activeElement.id,
    on: document.querySelector('.srch-chips .chip-preset.on')?.dataset.sk,
  }));
  t('чип «Комплексы»: остались только комплексы',
    gCx.grps.length === 1 && /Комплексы/.test(gCx.grps[0]), JSON.stringify(gCx.grps));
  t('активный чип подсвечен', gCx.on === 'cx', gCx.on);

  await p.evaluate(() => window.App.srchChip('job'));
  await p.waitForTimeout(200);
  const gJob = await p.evaluate(() => [...document.querySelectorAll('.srch-grp')].map(e => e.textContent));
  t('чип «Работы»: остались только работы',
    gJob.length === 1 && /Работы/.test(gJob[0]), JSON.stringify(gJob));

  await p.evaluate(() => window.App.srchChip('unit'));
  await p.waitForTimeout(200);
  const gU = await p.evaluate(() => document.querySelector('#srch-res').textContent);
  t('чип «Юнит» + запрос-название → пусто (ищет только по номеру юнита)',
    /Ничего не найдено/.test(gU), gU.slice(0, 60));

  if (demoUnit){
    await p.fill('#srch-q', demoUnit.slice(0, 3));
    await p.waitForTimeout(250);
    const gU2 = await p.evaluate(() => [...document.querySelectorAll('.srch-grp')].map(e => e.textContent));
    t('чип «Юнит» + номер ' + demoUnit.slice(0, 3) + ' → документы без раздела «Комплексы»',
      gU2.length > 0 && !gU2.some(s => /Комплексы/.test(s)), JSON.stringify(gU2));
  } else t('чип «Юнит» + номер: юнит в демо не найден', false, 'нет Unit на главной');

  console.log('— справка нумерации —');
  await p.evaluate(() => { window.App.closeModal(); window.App.go('settings'); });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.fold-h')].find(x => /Нумерация документов/.test(x.textContent || ''));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  t('в карточке нумерации есть кнопка «?»',
    await p.evaluate(() => !!document.querySelector('.fold.on .tipq')));
  await p.evaluate(() => window.App.noHelp());
  await p.waitForTimeout(200);
  const help = await p.evaluate(() => document.querySelector('.modal, .overlay, body').textContent);
  t('справка: кусочки с живыми значениями', /значения сейчас/.test(help));
  t('справка: {TYPE} и REP упомянуты', /\{TYPE\}/.test(help) && /REP/.test(help));
  t('справка: пример шаблон→результат', /Пример:/.test(help) && /→/.test(help));
  t('справка: три корневые папки Диска', /Корневые папки/.test(help) && /вложения-скрепки/.test(help)
    && /архив\/Photos/.test(help));
  await p.screenshot({ path: '/tmp/pw/35-nohelp.png' });

  console.log('— диагностика: внешние сервисы (демо) —');
  await p.evaluate(() => { window.App.closeModal(); });
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('.fold-h')].find(x =>
      /Диагностика/.test(x.textContent || '') && !/интерфейса/.test(x.textContent || ''));
    if (b) b.click();
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.App.runDiag());
  await p.waitForTimeout(1500);
  const dg = await p.evaluate(() =>
    [...document.querySelectorAll('#dg-out > div')].map(d => ({
      txt: d.textContent.trim(), green: /--green/.test(d.innerHTML) })));
  const osm = dg.find(r => /Карта: тайлы OSM/.test(r.txt));
  const geo = dg.find(r => /Nominatim/.test(r.txt));
  t('строка «Карта: тайлы OSM» — зелёная с таймингом',
    !!osm && osm.green && /\d+ ms/.test(osm.txt), JSON.stringify(osm || dg.map(r=>r.txt)));
  t('строка «Карта: геокодер (Nominatim)» — зелёная с таймингом',
    !!geo && geo.green && /\d+ ms/.test(geo.txt), JSON.stringify(geo || ''));

  /* ================= ПК-КОНТЕКСТ: компактный режим ================= */
  console.log('— «компактно» на ПК —');
  const dctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await dctx.newPage();
  d.on('dialog', x => x.accept());
  await stubRoutes(d);
  await d.goto('http://127.0.0.1:' + PORT + '/index.html');
  await d.evaluate(() => {
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'desktop');
    localStorage.removeItem('techlog_density');
  });
  await d.reload(); await d.waitForTimeout(900);
  const before = await d.evaluate(() => ({
    fs: getComputedStyle(document.documentElement).fontSize,
    btn: !!document.querySelector('#dsk-density'),
  }));
  t('кнопка плотности на месте', before.btn);
  t('исходный размер шрифта 16px', before.fs === '16px', before.fs);
  await d.click('#dsk-density');
  await d.waitForTimeout(200);
  const after = await d.evaluate(() => ({
    cls: document.documentElement.classList.contains('tl-compact'),
    fs: getComputedStyle(document.documentElement).fontSize,
    inp: (i => i ? getComputedStyle(i).minHeight : '—')(document.querySelector('input:not([type=checkbox])')),
  }));
  t('класс tl-compact включился', after.cls);
  t('шрифт ужался (база 14px) — интерфейс реально плотнее',
    parseFloat(after.fs) > 13 && parseFloat(after.fs) < 15, after.fs);
  await d.screenshot({ path: '/tmp/pw/35-compact.png' });
  await d.click('#dsk-density');
  await d.waitForTimeout(200);
  const back = await d.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  t('повторное нажатие возвращает базу 16px', parseFloat(back) > 15.5, back);

  await br.close();
  console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
