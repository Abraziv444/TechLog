/* v1.08.48 — модалки забирают прокрутку, свои медиа у ремонта, связи,
   руль у номера машины. Запуск: node tests/v1_08_48.js [порт] (демо).
   ТВ-кнопки и список ТВ-сессий живут только при Supabase — их покрывают
   ассерты в tests/unit.js. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8156;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);

  console.log('— модалка забирает прокрутку себе —');
  {
    /* страница должна быть выше окна: наполняем журнал действий */
    await p.evaluate(() => { for (let i = 1; i <= 28; i++) window.App.setCarNo('demo-tech', 1 + (i % 60)); });
    await p.waitForTimeout(3200);
    await p.evaluate(() => { window.App.go('journal'); window.App.jrTab('tech'); });
    await p.waitForTimeout(700);
    await p.evaluate(() => scrollTo(0, 400));
    await p.waitForTimeout(200);
    const before = await p.evaluate(() => scrollY);
    t('страница журнала прокручена (фон есть куда крутить)', before > 300, before);

    await p.evaluate(() => window.App.staffCfg('demo-tech'));
    await p.waitForTimeout(500);
    const locked = await p.evaluate(() => ({
      cls: document.body.classList.contains('tl-lock'),
      ov: getComputedStyle(document.body).overflow,
      y: scrollY,
    }));
    t('модалка открыта — на body замок и overflow:hidden',
      locked.cls && locked.ov === 'hidden', JSON.stringify(locked));

    await p.mouse.move(207, 800);            // над подложкой, ниже модалки
    for (let i = 0; i < 6; i++){ await p.mouse.wheel(0, 240); await p.waitForTimeout(60); }
    const during = await p.evaluate(() => scrollY);
    t('колесо над подложкой НЕ крутит страницу', during === locked.y, `${locked.y} → ${during}`);

    await p.evaluate(() => window.App.closeModal());
    await p.waitForTimeout(400);
    const after0 = await p.evaluate(() => ({ cls: document.body.classList.contains('tl-lock'), y: scrollY }));
    await p.mouse.move(207, 500);
    for (let i = 0; i < 5; i++){ await p.mouse.wheel(0, 240); await p.waitForTimeout(60); }
    const after1 = await p.evaluate(() => scrollY);
    t('модалка закрыта — замок снят, позиция цела, колесо снова крутит',
      !after0.cls && after0.y === during && after1 > after0.y,
      JSON.stringify({ after0, after1 }));
  }

  console.log('— штат: номер машины с рулём —');
  {
    await p.evaluate(() => { window.App.go('dirs'); window.App.dirTab('staff'); });
    await p.waitForTimeout(600);
    const w = await p.evaluate(() => {
      const el = document.querySelector('#app .car-no .carno-ic');
      if (!el) return null;
      return { path: !!el.querySelector('path[d^="M61.44,0"]'),
               mask: !!el.querySelector('mask'),
               digits: [...el.querySelectorAll('text')].map(t => t.textContent.trim()) };
    });
    t('значок = присланный руль (маска) с цифрой внутри двумя слоями',
      !!w && w.path && w.mask && w.digits.length === 2 && /^\d+$/.test(w.digits[1]),
      JSON.stringify(w));
  }

  console.log('— документ ремонта: кнопки, чек, свои медиа, связи —');
  {
    const jid = await p.evaluate(() => {
      window.App.go('home');
      return new Promise(r => setTimeout(() => {
        const el = document.querySelector('.item[data-drag-id]');
        r(el ? el.dataset.dragId : null);
      }, 500));
    });
    t('демо-задача найдена', !!jid, jid);
    await p.evaluate(id => window.App.newRepairFromJob(id), jid);
    await p.waitForTimeout(700);
    const f = await p.evaluate(() => {
      const app = document.getElementById('app');
      const txt = app.textContent;
      const btn = q => [...app.querySelectorAll('button')].find(b => q.test(b.textContent));
      const repId = (document.querySelector('.media-card[data-mjob]') || {}).dataset
        ? document.querySelector('.media-card[data-mjob]').dataset.mjob : '';
      const own = document.querySelector('.media-card[data-mjob]');
      return {
        cls: app.className,
        addWork: !!btn(/Добавить задачу/i),
        addMat: !!btn(/Добавить материалы/i),
        rows: [...app.querySelectorAll('button')]
          .filter(b => b.textContent.trim().toLowerCase() === 'строка').length,
        receipt: !!app.querySelector(`button[onclick*="'rep'"]`),
        ownStrip: !!own,
        stripRep: own ? /'rep'/.test(own.innerHTML) : false,
        noInv: own ? !/invToDrive/.test(own.innerHTML) : false,
        linkedJob: /WORK\s*·/.test(txt),
        propHint: /Пропозалов этого комплекса нет|Выбрать пропозал/i.test(txt),
        linkTitle: /Фото связанной задачи/.test(txt),
        repId,
      };
    });
    t('форма ремонта открыта', f.cls === 'scr-repairs', f.cls);
    t('синие кнопки: «Добавить задачу» и «Добавить материалы»', f.addWork && f.addMat, JSON.stringify(f));
    t('«+ строка» осталась в обеих секциях', f.rows >= 2, f.rows);
    t('кнопка «Сфотографировать чек» на месте (путь rep)', f.receipt);
    t('свой медиа-блок ремонта: полоса с doc=rep и без инвойс-кнопки',
      f.ownStrip && f.stripRep && f.noInv, JSON.stringify({ s: f.stripRep, i: f.noInv }));
    t('связанные: задача-источник видна, место под пропозал есть',
      f.linkedJob && f.propHint, JSON.stringify({ j: f.linkedJob, p: f.propHint }));
    t('карточка пометок называется «Фото связанной задачи»', f.linkTitle);
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
