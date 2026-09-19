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
      if (!f.docs) window.App.foldToggle('docs'); });   // v1.08.95: переехало из «Подсказок»
    await p.waitForTimeout(600);
    const has = await p.evaluate(() => ({
      chk: !!document.querySelector('#app input[onchange*="srchTab"]'),
      open: !!document.querySelector('#app button[onclick="App.searchOpen()"]'),
    }));
    t('в «Настройках документов» есть галочка и запасная кнопка «Открыть поиск»',
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

    const click = name => p.evaluate(n => [...document.querySelectorAll('.srch-chips .chip-preset')]
      .find(b => b.textContent.trim() === n).click(), name);
    const clearBtn = () => p.evaluate(() => { const b = document.querySelector('.srch-chips .srch-clear'); return b ? { has: true, off: b.disabled } : { has: false }; });
    t('v1.08.58: по умолчанию горят все шесть чипов и «Всё», крестик активен',
      (await chipOn('Юнит')) && (await chipOn('Задачи')) && (await chipOn('Комплексы')) && (await clearBtn()).has && !(await clearBtn()).off);

    /* снятие одного чипа при «Всё» — «Всё» гаснет, остальные остаются */
    await click('Юнит'); await p.waitForTimeout(300);
    t('снят «Юнит» при «Всё» — «Всё» погасло, остальные пять горят',
      !(await chipOn('Всё')) && !(await chipOn('Юнит')) && (await chipOn('Задачи')) && (await chipOn('Пикапы')) && (await chipOn('Комплексы')));
    await click('Комплексы'); await p.waitForTimeout(300);
    const g1 = await groups();
    t('снят «Комплексы» — комплексы пропали из результатов, задачи остались',
      g1.includes('Задачи') && !g1.includes('Комплексы'), g1.join(','));
    await click('Комплексы'); await click('Юнит'); await p.waitForTimeout(300);
    t('вернули оба — «Всё» снова горит', await chipOn('Всё'));

    /* «Всё» при полном наборе — снимает все; крестик — тоже */
    await click('Всё'); await p.waitForTimeout(300);
    const emptyState = await p.evaluate(() => ({ on: document.querySelectorAll('.srch-chips .chip-preset.on').length, txt: document.querySelector('#srch-res').textContent, clear: document.querySelector('.srch-chips .srch-clear').disabled }));
    t('«Всё» при полном выборе снимает все чипы: ничего не горит, подсказка «ничего не выбрано», крестик погашен',
      emptyState.on === 0 && /Ничего не выбрано/.test(emptyState.txt) && emptyState.clear, JSON.stringify(emptyState));
    await click('Всё'); await p.waitForTimeout(200);
    t('«Всё» из пустого — включает все', await chipOn('Всё') && (await chipOn('Юнит')));
    await p.evaluate(() => document.querySelector('.srch-chips .srch-clear').click()); await p.waitForTimeout(300);
    t('крестик снимает весь выбор', (await p.evaluate(() => document.querySelectorAll('.srch-chips .chip-preset.on').length)) === 0);

    /* обычное сложение чипов из пустого */
    await click('Задачи'); await click('Пикапы'); await p.waitForTimeout(300);
    const g2 = await groups();
    t('чипы складываются: из пустого «Задачи» + «Пикапы» — видны оба вида, комплексов нет',
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
