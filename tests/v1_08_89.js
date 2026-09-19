/* v1.08.89 — размер шрифта: свой у режима «Телефон» и у режима «ПК», хранится
   в профиле аккаунта (push_prefs.font_pct / font_pct_pc), на устройстве кэш;
   описание переехало в подсказку «?». Запуск: node tests/v1_08_89.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, mode, extra){
  const p = await (await br.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([m, ex]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', m);
    Object.keys(ex || {}).forEach(k => localStorage.setItem(k, ex[k])); }, [mode, extra || {}]);
  await p.reload(); await p.waitForTimeout(1400);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(500);
  return p;
}
const st = (p) => p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}');
  const me = (d.profiles || []).find(x => x.id === 'demo-admin') || {};
  return { pct: window.TLUI.fontPct(), mode: window.TLUI.fontMode(),
    root: Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 100) / 100,
    ls: localStorage.getItem('techlog_font_pct'), lsPc: localStorage.getItem('techlog_font_pct_pc'),
    pref: (me.push_prefs || {}).font_pct, prefPc: (me.push_prefs || {}).font_pct_pc,
    shown: (document.querySelector('#fs-val') || {}).textContent };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— подсказка вместо длинного описания —');
  {
    const p = await boot(br, 'mobile');
    const card = await p.evaluate(() => {
      const b = [...document.querySelectorAll('#app .settings-row')].find(r => /Размер шрифта/.test(r.textContent));
      if (!b) return null;
      const q = b.querySelector('.tipq');
      return { q: !!q, onclick: q && q.getAttribute('onclick'), d: (b.querySelector('.d') || {}).textContent.trim(), long: /Личная настройка аккаунта/.test(b.textContent) };
    });
    t('у заголовка «Размер шрифта» есть «?» с подсказкой font_hint', card && card.q && /toastInfo\('font_hint'\)/.test(card.onclick), JSON.stringify(card));
    t('длинного описания в карточке больше нет — вместо него текущий режим', card && !card.long && /режим «Телефон»/.test(card.d), JSON.stringify(card));
    await p.evaluate(() => [...document.querySelectorAll('#app .settings-row')].find(r => /Размер шрифта/.test(r.textContent)).querySelector('.tipq').click()); await p.waitForTimeout(300);
    t('нажатие «?» показывает подсказку', await p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].some(x => /Личная настройка аккаунта/.test(x.textContent))));
    await p.close();
  }

  console.log('— свой размер у каждого режима —');
  {
    const p = await boot(br, 'mobile');
    await p.evaluate(() => { window.App.fontSet(135); }); await p.waitForTimeout(1600);
    const a = await st(p);
    t('в режиме «Телефон» 135% ушло в ключ телефона и в профиль (font_pct)',
      a.pct === 135 && a.ls === '135' && a.pref === 135 && !a.lsPc && a.prefPc === undefined && a.root > 20, JSON.stringify(a));
    /* переключаем режим — размер ПК свой, не 135 */
    await p.evaluate(() => { localStorage.setItem('techlog_view_mode', 'desktop'); window.dispatchEvent(new CustomEvent('tl:viewmode', { detail: { mode: 'desktop' } })); });
    await p.waitForTimeout(600);
    const b = await st(p);
    t('переключение в режим «ПК» НЕ тащит за собой телефонный размер', b.mode === 'desktop' && b.pct === 100 && Math.abs(b.root - 16) < 0.6, JSON.stringify(b));
    await p.evaluate(() => window.App.fontSet(92)); await p.waitForTimeout(1600);
    const c = await st(p);
    t('в режиме «ПК» 92% ушло в свой ключ и в профиль (font_pct_pc), телефонные 135% целы',
      c.pct === 92 && c.lsPc === '92' && c.ls === '135' && c.prefPc === 92 && c.pref === 135, JSON.stringify(c));
    await p.evaluate(() => { localStorage.setItem('techlog_view_mode', 'mobile'); window.dispatchEvent(new CustomEvent('tl:viewmode', { detail: { mode: 'mobile' } })); });
    await p.waitForTimeout(600);
    const d = await st(p);
    t('возврат в «Телефон» возвращает 135%', d.pct === 135 && d.root > 20, JSON.stringify(d));
    await p.close();
  }

  console.log('— настройка аккаунта: новое устройство и перенос старого значения —');
  {
    /* «другой компьютер»: локального кэша нет, в профиле есть font_pct_pc */
    const p = await boot(br, 'desktop');
    await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
      const me = d.profiles.find(x => x.id === 'demo-admin');
      me.push_prefs = { ...(me.push_prefs || {}), font_pct_pc: 122 };
      localStorage.setItem('techlog_state_v1', JSON.stringify(d));
      localStorage.removeItem('techlog_font_pct'); localStorage.removeItem('techlog_font_pct_pc');
    });
    await p.reload(); await p.waitForTimeout(1800);
    const a = await st(p);
    t('на новом устройстве размер взят из профиля (122% в режиме ПК)', a.pct === 122 && a.lsPc === '122', JSON.stringify(a));
    await p.close();
  }
  {
    /* старое общее значение (до 1.08.89) — стартовое и для ПК-ключа */
    const p = await boot(br, 'desktop', { techlog_font_pct: '110' });   // как у старой сборки: один общий ключ
    const a = await st(p);
    t('прежнее общее значение переносится в режим ПК, размер не прыгает', a.pct === 110 && Math.abs(a.root - 17.6) < 0.6, JSON.stringify(a));
    await p.evaluate(() => window.App.fontSet(100)); await p.waitForTimeout(400);
    const b = await st(p);
    t('после правки в ПК-режиме телефонный ключ не тронут', b.lsPc === '100' && b.ls === '110', JSON.stringify(b));
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
