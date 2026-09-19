/* v1.08.98 — раздел «Интеграции» в Настройках админа: подразделы
   «Настройка Google Drive» (бывшая «Фото и видео → Google Drive») и
   «GPS-трекинг Bouncie». Запуск: node tests/v1_08_98.js [порт] (демо). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8198;
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
const info = (p) => p.evaluate(() => {
  const key = (h) => (h.getAttribute('onclick') || '').replace(/.*'(\w+)'.*/, '$1');
  const top = [...document.querySelectorAll('#app > .fold > .fold-h')].map(h => ({ k: key(h), txt: h.textContent.trim() }));
  const ih = document.querySelector(`#app > .fold > .fold-h[onclick="App.foldToggle('intg')"]`);
  const f = ih && ih.closest('.fold'), b = f && f.querySelector(':scope > .fold-b');
  const subs = b ? [...b.children].map(x => x.classList.contains('fold-sub') ? key(x.querySelector(':scope > .fold-h')) + ':' + x.querySelector(':scope > .fold-h').textContent.trim() : '?' + x.className) : [];
  const inI = (s) => !!(b && b.querySelector(s));
  const bn = document.querySelector('#bn-card');
  return { top, intg: !!ih, open: !!(f && f.classList.contains('on')), title: ih && ih.textContent.trim(), subs,
    gd: inI('#gd-card') || inI('#gd-inv') || inI('#gd-photo'), bn: inI('#bn-card'),
    gdTitle: (document.querySelector('#gd-card .gd-head') || document.querySelector('.gd-head') || {}).textContent || '',
    bnRedirect: bn ? [...bn.querySelectorAll('.lbl')].map(x => x.textContent).filter(x => /Redirect/i.test(x)) : [],
    oldName: /Фото и видео → Google Drive/.test(document.getElementById('app').textContent) };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— админ, ПК —');
  {
    const p = await boot(br, 'demo-admin', 'desktop', 1280, 900, ['intg', 'gd', 'bn']);
    const a = await info(p);
    t('спойлер «Интеграции» есть и раскрыт; наверху нет отдельных «Google Drive» и «Bouncie»',
      a.intg && a.open && /^Интеграции$/.test(a.title) && !a.top.some(x => x.k === 'gd' || x.k === 'bn'), JSON.stringify(a.top.map(x => x.k)));
    t('подразделы: «Настройка Google Drive» → «GPS-трекинг Bouncie»',
      a.subs.length === 2 && /^gd:Настройка Google Drive$/.test(a.subs[0]) && /^bn:GPS-трекинг Bouncie$/.test(a.subs[1]), JSON.stringify(a.subs));
    t('внутри — карточка Диска (папки) и карточка Bouncie', a.gd && a.bn, JSON.stringify({ gd: a.gd, bn: a.bn }));
    t('старое название «Фото и видео → Google Drive» нигде не осталось', !a.oldName);
    t('заголовок карточки Диска — «Настройка Google Drive»', /Настройка Google Drive/.test(a.gdTitle), a.gdTitle.trim().slice(0, 60));
    t('у Bouncie Redirect URI подписан «на портале Bouncie», не Google Console',
      a.bnRedirect.length >= 1 && a.bnRedirect.every(x => /Bouncie/.test(x) && !/Google/.test(x)), JSON.stringify(a.bnRedirect));
    const order = await p.evaluate(() => [...document.querySelectorAll('#app > .fold > .fold-h, #app > .card')].map(x =>
      x.classList.contains('fold-h') ? (x.getAttribute('onclick') || '').replace(/.*'(\w+)'.*/, '$1') : (/Организация|Код приглашения|PWA/.exec(x.textContent) || ['card'])[0]));
    t('«Интеграции» стоят в блоке админа (после «Диагностики», до «Режима телевизора»)',
      order.indexOf('intg') > order.indexOf('dgs') && order.indexOf('intg') < order.indexOf('tvc'), JSON.stringify(order));   // v1.08.99: tvs → внутри tvc
    /* свернуть подраздел — раздел остаётся открытым */
    await p.evaluate(() => window.App.foldToggle('gd')); await p.waitForTimeout(300);
    const c = await info(p);
    t('свернули Google Drive — раздел открыт, Bouncie на месте', c.open && !c.gd && c.bn, JSON.stringify({ open: c.open, gd: c.gd, bn: c.bn }));
    await p.close();
  }

  console.log('— свёрнуто по умолчанию, телефон —');
  {
    const p = await boot(br, 'demo-admin', 'mobile', 390, 900, []);
    const a = await info(p);
    t('свёрнутый раздел не рисует подразделы', a.intg && !a.open && !a.subs.length, JSON.stringify({ open: a.open, subs: a.subs }));
    await p.close();
  }
  {
    const p = await boot(br, 'demo-admin', 'mobile', 390, 3200, ['intg', 'gd', 'bn']);
    const over = await p.evaluate(() => {
      const ih = document.querySelector(`.fold-h[onclick="App.foldToggle('intg')"]`);
      const b = ih.closest('.fold').querySelector(':scope > .fold-b'); const R = b.getBoundingClientRect();
      return [...b.querySelectorAll('input, .btn, .icon-btn')].filter(x => { const r = x.getBoundingClientRect(); return r.width && (r.right > R.right + 1 || r.left < R.left - 1); }).length;
    });
    t('на телефоне поля и кнопки не вылезают за раздел', over === 0, over);
    await p.close();
  }

  console.log('— не админ —');
  for (const who of ['demo-manager', 'demo-tech', 'demo-acc']){
    const p = await boot(br, who, 'mobile', 390, 2000, ['intg', 'gd', 'bn']);
    const a = await info(p);
    t(who + ': «Интеграций» нет', !a.intg && !a.gd && !a.bn, JSON.stringify(a.top.map(x => x.k)));
    await p.close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
