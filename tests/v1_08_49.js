/* v1.08.49 — поиск: место в панели, галочка скрытия, мультивыбор чипов.
   Запуск: node tests/v1_08_49.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8156;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 414, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);

  const tabbar = () => p.evaluate(() =>
    [...document.querySelectorAll('.tabbar .tab')].map(b => ({
      srch: b.classList.contains('hdr-srch'),
      label: (b.querySelector('span') || {}).textContent || '',
    })));

  console.log('— кнопка поиска под «Главной» —');
  {
    const bar = await tabbar();
    t('первая кнопка — «Главная», вторая — поиск',
      bar[0] && /Главная/i.test(bar[0].label) && bar[1] && bar[1].srch,
      JSON.stringify(bar.slice(0, 3)));
  }

  console.log('— галочка прячет кнопку на телефоне —');
  {
    await p.evaluate(() => { window.App.go('settings');
      const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}');
      if (!f.pop) window.App.foldToggle('pop'); });
    await p.waitForTimeout(600);
    const has = await p.evaluate(() => ({
      chk: !!document.querySelector('#app input[onchange*="srchTab"]'),
      open: !!document.querySelector('#app button[onclick="App.searchOpen()"]'),
    }));
    t('в «Подсказках» есть галочка и запасная кнопка «Открыть поиск»',
      has.chk && has.open, JSON.stringify(has));

    await p.evaluate(() => {
      const c = document.querySelector('#app input[onchange*="srchTab"]');
      c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(500);
    const bar2 = await tabbar();
    t('галочка снята — кнопки поиска в панели нет',
      !bar2.some(b => b.srch) && localStorage_get('techlog_srch_tab') === undefined
        ? true : !bar2.some(b => b.srch),
      JSON.stringify(bar2.slice(0, 2)));
    function localStorage_get(){ return undefined; } // заглушка для линтера строки выше

    await p.evaluate(() => window.App.setVm('desktop'));
    await p.waitForTimeout(900);
    const barPc = await p.evaluate(() =>
      [...document.querySelectorAll('.tabbar .tab')].some(b => b.classList.contains('hdr-srch')));
    t('в ПК-режиме кнопка видна даже при снятой галочке', barPc === true, barPc);

    await p.evaluate(() => { window.App.setVm('mobile'); });
    await p.waitForTimeout(900);
    await p.evaluate(() => { window.App.srchTab(true); });   // вернуть по умолчанию
    await p.waitForTimeout(400);
    const bar3 = await tabbar();
    t('галочка возвращена — кнопка снова в панели', bar3.some(b => b.srch));
  }

  console.log('— мультивыбор видов —');
  {
    /* берём буквы из аббревиатуры комплекса первой задачи: по ним
       находятся и задачи, и пикапы этого комплекса */
    const q = await p.evaluate(() => {
      const j = (state.data.jobs || [])[0];
      const cx = state.data.complexes.find(c => c.id === j.complex_id) || {};
      return String(cx.abbr || cx.name || '').slice(0, 3).toLowerCase();
    });
    await p.evaluate(() => window.App.searchOpen());
    await p.waitForTimeout(400);
    await p.fill('#srch-q', q);
    await p.waitForTimeout(400);
    const chipOn = name => p.evaluate(n =>
      [...document.querySelectorAll('.srch-chips .chip-preset')]
        .find(b => b.textContent.trim() === n)?.classList.contains('on'), name);
    const groups = () => p.evaluate(() =>
      [...document.querySelectorAll('#srch-res .srch-grp')].map(g => g.textContent.split('·')[0].trim()));

    t('по умолчанию активен чип «Всё»', await chipOn('Всё'), await chipOn('Всё'));
    const g0 = await groups();
    t('со «Всё» найдены и задачи, и комплексы', g0.includes('Задачи') && g0.includes('Комплексы'), g0.join(','));

    await p.evaluate(() => [...document.querySelectorAll('.srch-chips .chip-preset')]
      .find(b => b.textContent.trim() === 'Задачи').click());
    await p.waitForTimeout(300);
    const g1 = await groups();
    t('клик «Задачи» сужает выбор до одного вида',
      g1.includes('Задачи') && !g1.includes('Пикапы') && !g1.includes('Комплексы'), g1.join(','));

    await p.evaluate(() => [...document.querySelectorAll('.srch-chips .chip-preset')]
      .find(b => b.textContent.trim() === 'Пикапы').click());
    await p.waitForTimeout(300);
    const g2 = await groups();
    t('второй чип ДОБАВЛЯЕТСЯ: видны и задачи, и пикапы',
      g2.includes('Задачи') && g2.includes('Пикапы') && !g2.includes('Комплексы'), g2.join(','));
    t('оба чипа подсвечены, «Всё» — нет',
      (await chipOn('Задачи')) && (await chipOn('Пикапы')) && !(await chipOn('Всё')));

    await p.evaluate(() => window.App.closeModal());
    await p.waitForTimeout(300);
    await p.evaluate(() => window.App.searchOpen());
    await p.waitForTimeout(400);
    t('выбор пережил закрытие окна (запомнен на устройстве)',
      (await chipOn('Задачи')) && (await chipOn('Пикапы')) && !(await chipOn('Всё')));

    await p.evaluate(() => [...document.querySelectorAll('.srch-chips .chip-preset')]
      .find(b => b.textContent.trim() === 'Всё').click());
    await p.waitForTimeout(300);
    t('чип «Всё» возвращает полный набор', await chipOn('Всё'));
    await p.evaluate(() => window.App.closeModal());
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
