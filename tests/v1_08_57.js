/* v1.08.57 — полоска отправки фото/видео (мини-журнал): оформление как у
   модалок, крестик, Esc, «подробнее» → модалка, положение без растяжения.
   Запуск: node tests/v1_08_57.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, vp, mode, pos){
  const p = await (await br.newContext({ viewport: vp })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 120)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([m, ps]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', m);
    localStorage.setItem('techlog_pop_pos', ps);
    localStorage.setItem('techlog_mq_quiet', '0'); }, [mode, pos]);
  await p.reload(); await p.waitForTimeout(1300);
  return p;
}
const geom = (p) => p.evaluate(() => {
  const el = document.querySelector('#mq-mini'); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bot: Math.round(innerHeight - r.bottom), h: Math.round(r.height), w: Math.round(r.width),
    right: Math.round(innerWidth - r.right), left: Math.round(r.left), H: innerHeight, W: innerWidth,
    inToasts: !!el.closest('#toasts'),
    title: (el.querySelector('.mq-mini-t') || {}).textContent || '', x: !!el.querySelector('.mq-mini-c'), more: !!el.querySelector('.mq-mini-x'),
    radius: getComputedStyle(el).borderRadius, bg: getComputedStyle(el).backgroundColor, body: !!el.querySelector('.mq-mini-b') };
});
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— телефон, подсказки «сверху» —');
  {
    const p = await boot(br, { width: 414, height: 850 }, 'mobile', 'top');
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(200);
    const g = await geom(p);
    t('полоска показана: заголовок состояния, крестик, «подробнее», журнал', g && /отправлены/.test(g.title) && g.x && g.more && g.body, JSON.stringify(g));
    t('оформление как у модалки: радиус 20px, фон панели', g && g.radius === '20px' && g.bg === 'rgb(23, 35, 42)', g && (g.radius + ' ' + g.bg));
    t('«сверху»: у верха по центру, в контейнере тостов, высота < 200 (v1.08.86)', g && g.inToasts && g.top >= 0 && g.top < g.H / 3 && g.h < 200 && Math.abs(g.left - g.right) <= 2, JSON.stringify(g));
    await p.evaluate(() => document.querySelector('#mq-mini .mq-mini-c').click()); await p.waitForTimeout(150);
    t('крестик закрывает полоску (модалка не открылась)', !(await p.$('#mq-mini')) && !(await p.$('#overlay')));
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(150);
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    t('Esc закрывает полоску', !(await p.$('#mq-mini')));
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#mq-mini .mq-mini-x').click()); await p.waitForTimeout(400);
    t('«подробнее» открывает обычную модалку журнала, полоска убрана', !!(await p.$('#overlay #mq-log')) && !(await p.$('#mq-mini')));
    await p.evaluate(() => window.App.closeModal());
    await p.evaluate(() => { localStorage.setItem('techlog_pop_pos', 'bottom'); }); await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(200);
    const gb = await geom(p);
    t('«снизу»: у низа над панелью, высота < 200', gb && gb.bot > 40 && gb.bot < gb.H / 3 && gb.h < 200, JSON.stringify(gb));
    await p.close();
  }

  console.log('— ПК, подсказки «сбоку» (сценарий с растянутой панелью) —');
  {
    const p = await boot(br, { width: 1440, height: 900 }, 'desktop', 'side');
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(250);
    const g = await geom(p);
    t('«сбоку» на ПК: справа сверху, ширина ≤ 480, высота < 200 — НЕ растянута на весь экран',
      g && g.right >= 0 && g.right < 60 && g.top > 40 && g.top < g.H / 3 && g.w <= 480 && g.h < 200, JSON.stringify(g));
    const ov = await p.evaluate(() => {
      const m = document.querySelector('#mq-mini').getBoundingClientRect();
      const ts = [...document.querySelectorAll('#toasts .toast')].map(x => x.getBoundingClientRect());
      return { n: ts.length, overlap: ts.some(r => r.top < m.bottom && r.bottom > m.top && r.left < m.right && r.right > m.left) };
    });
    t('тост «Пикап сегодня» не ложится на полоску (отодвинут ниже)', ov.n >= 1 && !ov.overlap, JSON.stringify(ov));
    await p.evaluate(() => { localStorage.setItem('techlog_pop_pos', 'bottom'); }); await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(250);
    const gb = await geom(p);
    t('«снизу» на ПК: снизу по центру — как тосты, высота < 200 (v1.08.86)', gb && gb.inToasts && Math.abs(gb.left - gb.right) <= 2 && gb.bot >= 0 && gb.bot < gb.H / 3 && gb.h < 200, JSON.stringify(gb));
    await p.evaluate(() => { localStorage.setItem('techlog_pop_pos', 'top'); }); await p.reload(); await p.waitForTimeout(1300);
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(250);
    const gt = await geom(p);
    t('«сверху» на ПК: сверху по центру — как тосты, высота < 200 (v1.08.86)', gt && gt.inToasts && Math.abs(gt.left - gt.right) <= 2 && gt.top > 40 && gt.top < gt.H / 3 && gt.h < 200, JSON.stringify(gt));
    await p.close();
  }

  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
