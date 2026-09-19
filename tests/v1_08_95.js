/* v1.08.95 — «Настройки документов»: одна складная секция вместо трёх мест.
   Кнопка печати инвойса на карточке, кнопка поиска в панели и «Открыть поиск»
   ушли из «Всплывающих подсказок»; общий доступ к документам, аренда
   оборудования с правами и лимиты фото/видео — внутрь той же секции (админ).
   Отступы у кнопок-галочек. Запуск: node tests/v1_08_95.js [порт] (демо). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8195;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, who, mode, w, h, folds){
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([who, mode, folds]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', who);
    localStorage.setItem('techlog_view_mode', mode);
    const f = {}; folds.forEach(k => f[k] = 1);
    localStorage.setItem('techlog_fold', JSON.stringify(f)); }, [who, mode, folds]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(600);
  return p;
}
/* содержимое секции по ключу складки */
const foldInfo = (p, key) => p.evaluate((key) => {
  const h = document.querySelector(`#app .fold-h[onclick="App.foldToggle('${key}')"]`);
  if (!h) return null;
  const f = h.closest('.fold'), b = f.querySelector('.fold-b');
  const q = (s) => !!(b && b.querySelector(s));
  return { title: h.textContent.trim(), open: f.classList.contains('on'),
    print: q('input[onchange="App.printBtn(this.checked)"]'),
    srch: q('input[onchange="App.srchTab(this.checked)"]'),
    open_srch: q('button[onclick="App.searchOpen()"]'),
    shared: q('#org-shared'), reorder: q('input[onchange="App.setMgrReorder(this.checked)"]'),
    rent: q('[onclick*="orgStep(\'default_rent_days\'"]'), ext: q('[onclick*="orgStep(\'max_extend_days\'"]'),
    approve: q('input[onchange*="manager_can_approve"]'), stock: q('input[onchange*="stock_visible_all"]'),
    prop: q('input[onchange*="allow_tech_proposal_flag"]'), lock: q('[onclick*="orgStep(\'edit_lock_days\'"]'),
    photo: q('[onclick*="orgStep(\'media_max_photo\'"]'), mlock: q('input[onchange*="media_lock_approved"]'),
    cards: b ? b.querySelectorAll(':scope > .card').length : 0 };
}, key);
/* зазоры между соседними галочками-кнопками в группах .set-opts */
const gaps = (p) => p.evaluate(() => {
  const out = { minH: 99, minV: 99, pairs: 0, touching: [] };
  document.querySelectorAll('#app .set-opts').forEach(g => {
    const r = [...g.querySelectorAll(':scope > .opt')].map(x => x.getBoundingClientRect());
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++){
      const a = r[i], b = r[j];
      const sameRow = Math.abs(a.top - b.top) < 4;
      const d = sameRow ? (b.left - a.right) : (b.top - a.bottom);
      if (!sameRow && j !== i + 1) continue;
      out.pairs++;
      if (sameRow) out.minH = Math.min(out.minH, d); else out.minV = Math.min(out.minV, d);
      if (d < 6) out.touching.push(Math.round(d));
    }
  });
  const btn = document.querySelector('#app button[onclick="App.searchOpen()"]');
  const hint = btn && btn.parentElement.previousElementSibling;
  out.btnGap = btn && hint ? Math.round(btn.getBoundingClientRect().top - hint.getBoundingClientRect().bottom) : null;
  return out;
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— админ, ПК —');
  {
    const p = await boot(br, 'demo-admin', 'desktop', 1280, 900, ['pop', 'docs']);
    const pop = await foldInfo(p, 'pop'), docs = await foldInfo(p, 'docs');
    t('«Всплывающие подсказки»: нет кнопки печати, поиска и «Открыть поиск»',
      pop && pop.open && !pop.print && !pop.srch && !pop.open_srch, JSON.stringify(pop));
    t('секция «Настройки документов» есть и открыта',
      docs && docs.open && /Настройки документов/.test(docs.title), JSON.stringify(docs && docs.title));
    t('в ней: печать на карточке, кнопка поиска в панели, «Открыть поиск»',
      docs.print && docs.srch && docs.open_srch, JSON.stringify(docs));
    t('в ней: общий доступ к документам (обе галочки)', docs.shared && docs.reorder);
    t('в ней: аренда по умолчанию, максимум продления, права, блокировка правки',
      docs.rent && docs.ext && docs.approve && docs.stock && docs.prop && docs.lock);
    t('в ней: лимиты фото/видео и «после апрува неприкосновенны»', docs.photo && docs.mlock);
    t('четыре подкарточки (личное · доступ · аренда · лимиты)', docs.cards === 4, docs.cards);
    const outside = await p.evaluate(() => ({
      shared: [...document.querySelectorAll('#org-shared')].filter(x => !x.closest('.fold')).length,
      rent: [...document.querySelectorAll('[onclick*="orgStep(\'default_rent_days\'"]')].filter(x => !x.closest('.fold')).length,
      mlim: !!document.querySelector('.fold-h[onclick="App.foldToggle(\'mlim\')"]'),
      dupPrint: document.querySelectorAll('input[onchange="App.printBtn(this.checked)"]').length,
      order: (() => { const hs = [...document.querySelectorAll('#app .fold-h')].map(h => (h.getAttribute('onclick') || '').replace(/.*'(\w+)'.*/, '$1'));
        /* v1.08.97: «Нумерация» — подраздел внутри «Настроек документов» */
        return hs.indexOf('docs') >= 0 && hs.indexOf('num') > hs.indexOf('docs'); })()
    }));
    t('вне секции копий не осталось, отдельной складки «Лимиты» нет, секция сразу после «Нумерации»',
      !outside.shared && !outside.rent && !outside.mlim && outside.dupPrint === 1 && outside.order, JSON.stringify(outside));

    const g = await gaps(p);
    t('галочки-кнопки не стоят вплотную (зазор ≥ 6 px по горизонтали и вертикали)',
      g.pairs >= 3 && !g.touching.length && g.minH >= 6 && g.minH < 99 && g.minV >= 6, JSON.stringify(g));
    t('кнопка «Открыть поиск» отделена от подсказки', g.btnGap !== null && g.btnGap >= 8, g.btnGap);

    /* галочки и степперы работают на новом месте */
    await p.click('#app input[onchange="App.printBtn(this.checked)"]'); await p.waitForTimeout(400);
    const pr = await p.evaluate(() => (document.querySelector('#app input[onchange="App.printBtn(this.checked)"]') || {}).checked);
    t('галочка печати снимается на новом месте и остаётся в секции', pr === false, pr);
    await p.click('#app input[onchange="App.printBtn(this.checked)"]'); await p.waitForTimeout(400);
    const rent0 = await p.evaluate(() => document.querySelector('[onclick*="orgStep(\'default_rent_days\',1"]').parentElement.querySelector('input').value);
    await p.click('[onclick*="orgStep(\'default_rent_days\',1"]'); await p.waitForTimeout(500);
    const rent1 = await p.evaluate(() => document.querySelector('[onclick*="orgStep(\'default_rent_days\',1"]').parentElement.querySelector('input').value);
    t('степпер «Аренда по умолчанию» работает внутри секции', +rent1 === +rent0 + 1, rent0 + ' → ' + rent1);
    const st0 = await p.evaluate(() => document.querySelector('#app input[onchange*="stock_visible_all"]').checked);
    await p.click('#app input[onchange*="stock_visible_all"]'); await p.waitForTimeout(500);
    const st1 = await p.evaluate(() => document.querySelector('#app input[onchange*="stock_visible_all"]').checked);
    t('галочка «Сотрудники видят остатки склада» переключается', st0 !== st1, st0 + ' → ' + st1);
    await p.click('#app button[onclick="App.searchOpen()"]'); await p.waitForTimeout(600);
    const srch = await p.evaluate(() => !!document.querySelector('#overlay input, #app .srch-inp, #srch-q, #overlay .srch-chips, #app .srch-chips'));
    t('«Открыть поиск» открывает поиск', srch);
    await p.close();
  }

  console.log('— админ, телефон —');
  {
    const p = await boot(br, 'demo-admin', 'mobile', 390, 3600, ['docs']);
    const g = await gaps(p);
    t('на телефоне галочки тоже с зазорами', g.pairs >= 3 && !g.touching.length && g.minV >= 6, JSON.stringify(g));
    const over = await p.evaluate(() => {
      const b = document.querySelector('#app .fold-b'); if (!b) return 'нет';
      const R = b.getBoundingClientRect();
      return [...b.querySelectorAll('.opt, .btn, .stepper')].filter(x => { const r = x.getBoundingClientRect(); return r.right > R.right + 1 || r.left < R.left - 1; }).length;
    });
    t('ничего не вылезает за края секции', over === 0, over);
    await p.close();
  }

  console.log('— техник —');
  {
    const p = await boot(br, 'demo-tech', 'mobile', 390, 2400, ['docs']);
    const d = await foldInfo(p, 'docs');
    t('у техника секция есть: личные галочки и «Открыть поиск»', d && d.print && d.srch && d.open_srch, JSON.stringify(d));
    t('командные настройки технику не видны', d && !d.shared && !d.rent && !d.photo && d.cards === 1, JSON.stringify(d));
    await p.close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
