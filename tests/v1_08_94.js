/* v1.08.94 — Enter в поле кода 2FA нажимает «Подтвердить»; поле принимает
   только цифры (максимум шесть). Проверяется во всех трёх окнах: включение,
   отключение и вход. Запуск: node tests/v1_08_94.js [порт] (демо-режим). */
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
/* подставной клиент: считаем вызовы challenge/verify/unenroll и enroll */
const SB = `{
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } }),
      listFactors: async () => ({ data: { all: [], totp: [{ id: 'f1', status: 'verified' }] } }),
      enroll: async () => ({ data: { id: 'f1', totp: { secret: 'ABCDEF', uri: 'otpauth://x',
        qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21"><rect width="21" height="21" fill="#fff"/></svg>' } } }),
      challenge: async () => { window.__calls.push('challenge'); return { data: { id: 'c1' } }; },
      verify: async (o) => { window.__calls.push('verify:' + o.code); return {}; },
      unenroll: async () => { window.__calls.push('unenroll'); return { error: { message: 'insufficient aal2' } }; }
    },
    signOut: async () => { window.__calls.push('signOut'); return {}; },
    getSession: async () => ({ data: { session: null } })
  }
}`;
async function stub(p){ await p.evaluate(`(() => { window.__calls = []; window.App.__test_setSb(${SB}); })()`); }
const inpInfo = (p) => p.evaluate(() => {
  const i = document.querySelector('#overlay #mfa-code'); if (!i) return null;
  return { enter: i.getAttribute('enterkeyhint'), mode: i.getAttribute('inputmode'),
    key: (i.getAttribute('onkeydown') || ''), max: i.getAttribute('maxlength'), inp: i.getAttribute('oninput') || '' };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— окно входа —');
  {
    const p = await boot(br); await stub(p);
    await p.evaluate(() => window.App.__test_mfaGate({ user: { id: 'x' } })); await p.waitForTimeout(500);
    const a = await inpInfo(p);
    t('поле кода: цифровая клавиатура, «Go», Enter → Подтвердить', a && a.mode === 'numeric' && a.enter === 'go' && /mfaLoginVerify/.test(a.key) && !a.max && /slice\(0,6\)/.test(a.inp), JSON.stringify(a));
    await p.fill('#overlay #mfa-code', '  12 34ab56  ');
    const val = await p.inputValue('#overlay #mfa-code');
    t('в поле остаются только цифры, не больше шести', val === '123456', JSON.stringify(val));
    await p.press('#overlay #mfa-code', 'Enter'); await p.waitForTimeout(600);
    const calls = await p.evaluate(() => window.__calls);
    t('Enter отправляет код (как кнопка «Подтвердить»)', calls.includes('challenge') && calls.includes('verify:123456'), JSON.stringify(calls));
    await p.close();
  }

  console.log('— окно включения 2FA —');
  {
    const p = await boot(br); await stub(p);
    await p.evaluate(() => window.App.mfaEnroll()); await p.waitForTimeout(600);
    const a = await inpInfo(p);
    t('поле кода с Enter → mfaVerifyEnroll', a && /mfaVerifyEnroll/.test(a.key) && a.enter === 'go', JSON.stringify(a));
    await p.fill('#overlay #mfa-code', '654321');
    await p.press('#overlay #mfa-code', 'Enter'); await p.waitForTimeout(600);
    const calls = await p.evaluate(() => window.__calls);
    t('Enter подтверждает включение', calls.includes('verify:654321'), JSON.stringify(calls));
    await p.close();
  }

  console.log('— окно отключения 2FA —');
  {
    const p = await boot(br); await stub(p);
    await p.evaluate(() => window.App.mfaDisable()); await p.waitForTimeout(600);
    const a = await inpInfo(p);
    t('окно отключения открылось, Enter → mfaDisableGo', a && /mfaDisableGo/.test(a.key), JSON.stringify(a));
    await p.fill('#overlay #mfa-code', '111222');
    await p.press('#overlay #mfa-code', 'Enter'); await p.waitForTimeout(600);
    const calls = await p.evaluate(() => window.__calls);
    t('Enter подтверждает отключение', calls.includes('verify:111222'), JSON.stringify(calls));
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
