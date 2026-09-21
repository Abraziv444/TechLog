/* v1.08.86 — (1) «Показывать полоску отправки только при ошибке»: настройка
   аккаунта (profiles.push_prefs.mq_quiet), кэш в localStorage, перенос с
   устройства в профиль, переживает очистку localStorage-ключа; тесты съёмки
   в неё не пишут. (2) Галочка — в блоке «Всплывающие подсказки». (3) Полоска
   отправки стоит АБСОЛЮТНО там же, где тосты: тот же контейнер, та же ось
   центра / тот же правый край — сверху · снизу · сбоку, телефон и ПК.
   Запуск: node tests/v1_08_86.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, vp, mode, pos, extra){
  const p = await (await br.newContext({ viewport: vp })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([m, ps, ex]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', m);
    localStorage.setItem('techlog_pop_pos', ps);
    Object.keys(ex || {}).forEach(k => localStorage.setItem(k, ex[k])); }, [mode, pos, extra || {}]);
  await p.reload(); await p.waitForTimeout(1300);
  return p;
}
const prefOf = (p) => p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}');
  const me = (d.profiles || []).find(x => x.id === 'demo-admin') || {};
  return { pref: (me.push_prefs || {}).mq_quiet, ls: localStorage.getItem('techlog_mq_quiet') };
});
/* полоска и пробный тост одновременно: сравниваем геометрию */
const pair = (p) => p.evaluate(async () => {
  window.App.mqMini(true);
  window.App.popDemo();
  await new Promise(r => setTimeout(r, 350));
  const m = document.querySelector('#mq-mini'), box = document.querySelector('#toasts');
  const ts = [...document.querySelectorAll('#toasts > .toast')], tt = ts[ts.length - 1];
  if (!m || !tt) return { miss: true, m: !!m, t: !!tt };
  const a = m.getBoundingClientRect(), b = tt.getBoundingClientRect(), c = box.getBoundingClientRect();
  const cs = getComputedStyle(m);
  return { inBox: m.parentNode === box, first: box.firstElementChild === m, pos: cs.position,
    mcx: Math.round((a.left + a.right) / 2 * 10) / 10, tcx: Math.round((b.left + b.right) / 2 * 10) / 10,
    mright: Math.round(a.right * 10) / 10, tright: Math.round(b.right * 10) / 10,
    mtop: Math.round(a.top), boxtop: Math.round(c.top), mbot: Math.round(a.bottom), tbot: Math.round(b.bottom), boxbot: Math.round(c.bottom),
    overlap: b.top < a.bottom && b.bottom > a.top && b.left < a.right && b.right > a.left,
    W: innerWidth, H: innerHeight };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— настройка: профиль, кэш, перенос, очистка ключа —');
  {
    const p = await boot(br, { width: 414, height: 850 }, 'mobile', 'top');
    await p.evaluate(() => { window.App.go('settings'); window.App.foldToggle('push'); }); await p.waitForTimeout(400);   // v1.09.00: «Push уведомления и подсказки»
    const where = await p.evaluate(() => {
      const chk = document.querySelector('#mq-quiet-chk');
      const cards = [...document.querySelectorAll('#app .card')];
      const qCard = cards.find(c => /App\.mediaQueueModal\(\)/.test(c.innerHTML));
      const host = chk && chk.closest('.card');
      return { chk: !!chk, inPop: !!(host && /App\.popPos\(/.test(host.innerHTML) && /App\.popDemo\(\)/.test(host.innerHTML)),
        qCardHas: !!(qCard && /App\.mqQuiet/.test(qCard.innerHTML)), checked: chk && chk.checked,
        afterDemo: !!(host && host.innerHTML.indexOf('App.popDemo()') < host.innerHTML.indexOf('mq-quiet-chk')) };
    });
    t('галочка — в блоке «Всплывающие подсказки», после «Показать пример»', where.chk && where.inPop && where.afterDemo, JSON.stringify(where));
    t('в карточке «Все фото и видео отправлены» галочки больше нет', !where.qCardHas, JSON.stringify(where));
    t('по умолчанию стоит (v1.09.12: полоска только когда что-то не отправлено)', where.checked === true);
    await p.evaluate(() => window.App.mqQuiet(true)); await p.waitForTimeout(1900);
    const a = await prefOf(p);
    t('поставили: ушла в профиль (push_prefs.mq_quiet = true) и в кэш устройства', a.pref === true && a.ls === '1', JSON.stringify(a));
    /* «другое устройство / очищенный браузер»: ключа на устройстве нет, профиль есть */
    await p.evaluate(() => localStorage.removeItem('techlog_mq_quiet')); await p.reload(); await p.waitForTimeout(1300);
    const b = await prefOf(p);
    await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(300);   // блок «Всплывающие подсказки» остался раскрытым
    const chk2 = await p.evaluate(() => (document.querySelector('#mq-quiet-chk') || {}).checked);
    t('ключ устройства стёрт → галочка НЕ сбросилась: взята из профиля, кэш восстановлен', chk2 === true && b.pref === true && b.ls === '1', JSON.stringify({ chk2, b }));
    /* чужое значение в кэше не перебивает профиль */
    await p.evaluate(() => localStorage.setItem('techlog_mq_quiet', '0')); await p.reload(); await p.waitForTimeout(1300);
    const c = await prefOf(p);
    t('в кэше «0», в профиле «да» → верх берёт профиль', c.pref === true && c.ls === '1', JSON.stringify(c));
    await p.evaluate(() => window.App.mqMini(true)); await p.waitForTimeout(150);
    t('тихий режим: без ошибок полоска не показывается', !(await p.$('#mq-mini')));
    await p.evaluate(() => window.App.mqQuiet(false)); await p.waitForTimeout(1900);
    const d = await prefOf(p);
    t('сняли: в профиле false, в кэше «0»', d.pref === false && d.ls === '0', JSON.stringify(d));
    await p.close();
  }
  {
    /* перенос: галочка стояла на устройстве до 1.08.86, в профиле пусто */
    const p = await boot(br, { width: 414, height: 850 }, 'mobile', 'top', { techlog_mq_quiet: '1' });
    await p.waitForTimeout(1900);
    const a = await prefOf(p);
    t('галочка с устройства (до 1.08.86) сама перенесена в профиль', a.pref === true && a.ls === '1', JSON.stringify(a));
    await p.close();
  }

  console.log('— центровка: полоска = тосты —');
  const cases = [
    ['телефон', { width: 414, height: 850 }, 'mobile'],
    ['ПК', { width: 1440, height: 900 }, 'desktop'],
  ];
  for (const [name, vp, mode] of cases){
    for (const pos of ['top', 'bottom', 'side']){
      const p = await boot(br, vp, mode, pos, { techlog_mq_quiet: '0' });   // v1.09.12: по умолчанию полоска тихая — для проверки геометрии включаем её явно
      const g = await pair(p);
      const lbl = `${name}, «${pos === 'top' ? 'сверху' : pos === 'bottom' ? 'снизу' : 'сбоку'}»`;
      t(`${lbl}: полоска лежит в #toasts первой, без своего позиционирования`, !g.miss && g.inBox && g.first && g.pos === 'static', JSON.stringify(g));
      if (pos === 'side') t(`${lbl}: правый край полоски = правый край тоста`, !g.miss && Math.abs(g.mright - g.tright) <= 0.5, JSON.stringify(g));
      else t(`${lbl}: ось центра полоски = ось центра тоста = центр экрана`, !g.miss && Math.abs(g.mcx - g.tcx) <= 0.5 && Math.abs(g.mcx - g.W / 2) <= 0.5, JSON.stringify(g));
      if (pos === 'bottom') t(`${lbl}: низ стопки = низ контейнера тостов, тост не лежит на полоске`, !g.miss && g.tbot === g.boxbot && !g.overlap, JSON.stringify(g));
      else t(`${lbl}: верх полоски = верх контейнера тостов, тост не лежит на полоске`, !g.miss && g.mtop === g.boxtop && !g.overlap, JSON.stringify(g));
      await p.close();
    }
  }

  console.log('— стопка, модалка, крестик —');
  {
    const p = await boot(br, { width: 1440, height: 900 }, 'desktop', 'top', { techlog_mq_quiet: '0' });
    const st = await p.evaluate(async () => {
      window.App.mqMini(true);
      await new Promise(r => setTimeout(r, 100));
      const box = document.querySelector('#toasts');
      const vis0 = getComputedStyle(document.querySelector('#mq-mini')).display;
      const ov = document.createElement('div'); ov.className = 'overlay'; document.body.appendChild(ov);
      const vis1 = getComputedStyle(document.querySelector('#mq-mini')).display;
      ov.remove();
      /* поповер очереди встаёт в ту же стопку: после полоски, перед тостами */
      const pop = document.createElement('div'); pop.className = 'mq-pop'; pop.textContent = 'x';
      window.App.popDemo(); await new Promise(r => setTimeout(r, 100));
      return { vis0, vis1, kids: [...box.children].map(x => x.className.split(' ')[0]) };
    });
    t('под любой модалкой полоска скрыта, без модалки — видна', st.vis0 !== 'none' && st.vis1 === 'none', JSON.stringify(st));
    t('стопка: полоска первой, тост — после неё', st.kids[0] === 'mq-mini' && st.kids[st.kids.length - 1] === 'toast', JSON.stringify(st));
    await p.evaluate(() => document.querySelector('#mq-mini .mq-mini-c').click()); await p.waitForTimeout(150);
    t('крестик закрывает полоску', !(await p.$('#mq-mini')));
    await p.close();
  }

  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
