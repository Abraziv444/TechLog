/* v1.08.93 — окно кода 2FA не обойти: подложка и стрелка «назад» работают
   как «Отмена» (завершают вход), приложение за окном не загружено, данные
   недоступны. Запуск: node tests/v1_08_93.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br){
  const p = await (await br.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForTimeout(1500);
  return p;
}
/* поднимаем калитку на подставном клиенте Supabase и отдаём состояние экрана */
async function gateUp(p){
  return p.evaluate(async () => {
    window.__calls = [];
    window.App.__test_setSb({ auth: {
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } }) },
      signOut: async (o) => { window.__calls.push('signOut' + (o && o.scope ? ':' + o.scope : '')); return {}; } } });
    const need = await window.App.__test_mfaGate({ user: { id: 'x' } });
    await new Promise(r => setTimeout(r, 250));
    return { need, modal: !!document.querySelector('#overlay .mfa-login'), screen: document.getElementById('app').className,
      rows: document.querySelectorAll('#app .item').length };
  });
}
const after = (p) => p.evaluate(() => ({ modal: !!document.querySelector('#overlay'),
  screen: document.getElementById('app').className, calls: window.__calls || [],
  rows: document.querySelectorAll('#app .item').length,
  login: document.getElementById('app').className === 'scr-login' && !document.querySelector('#app .tabbar') }));
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— за окном кода приложения нет —');
  {
    const p = await boot(br);
    const g = await gateUp(p);
    t('калитка сработала: окно кода, экран входа, списка документов за ним нет',
      g.need === true && g.modal && g.screen === 'scr-login' && g.rows === 0, JSON.stringify(g));
    await p.close();
  }

  console.log('— подложка вокруг окна = «Отмена» —');
  {
    const p = await boot(br);
    await gateUp(p);
    await p.mouse.click(20, 20); await p.waitForTimeout(500);       // мимо окна, по подложке
    const a = await after(p);
    t('клик мимо окна завершает вход, а не открывает приложение',
      !a.modal && a.login && a.calls.some(c => /signOut/.test(c)) && a.rows === 0, JSON.stringify(a));
    await p.close();
  }

  console.log('— стрелка «назад» = «Отмена» —');
  {
    const p = await boot(br);
    await gateUp(p);
    await p.evaluate(() => document.querySelector('#overlay .back-x').click()); await p.waitForTimeout(500);
    const a = await after(p);
    t('стрелка «назад» завершает вход', !a.modal && a.login && a.calls.some(c => /signOut/.test(c)), JSON.stringify(a));
    await p.close();
  }

  console.log('— кнопка «Отмена»: выход и локально, и на сервере —');
  {
    const p = await boot(br);
    await gateUp(p);
    await p.evaluate(() => [...document.querySelectorAll('#overlay .btn-ghost')].find(x => /Отмена/i.test(x.textContent)).click());
    await p.waitForTimeout(600);
    const a = await after(p);
    t('«Отмена» завершает сессию локально и на сервере', a.calls.includes('signOut:local') && a.calls.includes('signOut'), JSON.stringify(a.calls));
    t('после отмены — форма входа без данных', !a.modal && a.login && a.rows === 0, JSON.stringify(a));
    await p.close();
  }

  console.log('— обычные окна закрываются как раньше —');
  {
    const p = await boot(br);
    await p.evaluate(() => window.App.trPendingModal()); await p.waitForTimeout(400);
    const opened = await p.evaluate(() => !!document.querySelector('#overlay'));
    await p.mouse.click(10, 10); await p.waitForTimeout(300);
    const closed = await p.evaluate(() => !!document.querySelector('#overlay'));
    t('обычная модалка по-прежнему закрывается кликом по подложке', opened && !closed);
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
