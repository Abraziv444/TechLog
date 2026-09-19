/* v1.08.97 — «Нумерация документов» и «Организация (для PDF)» стали
   подразделами «Настроек документов»; «Организация» доступна бухгалтеру.
   Запуск: node tests/v1_08_97.js [порт] (демо-режим). Серверная часть
   (бухгалтер меняет только реквизиты PDF) — tests/org-acc.sql. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8197;
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
  const top = [...document.querySelectorAll('#app > .fold > .fold-h')].map(key);
  const dh = document.querySelector(`#app > .fold > .fold-h[onclick="App.foldToggle('docs')"]`);
  const b = dh && dh.closest('.fold').querySelector(':scope > .fold-b');
  const kids = b ? [...b.children].map(x => x.classList.contains('fold-sub') ? 'sub:' + key(x.querySelector(':scope > .fold-h')) : (x.classList.contains('card') ? 'card' : x.className)) : [];
  const inDocs = (s) => !!(b && b.querySelector(s));
  const anywhere = (s) => document.querySelectorAll(s).length;
  return { top, kids, docs: !!dh,
    num: inDocs('[onclick*="noAddTok"]'), org: inDocs('#org-card #org-name') && inDocs('#org-card [onclick="App.saveOrg()"]'),
    orgAll: anywhere('#org-name'), numAll: anywhere('[onclick*="noAddTok"]'),
    orgTitle: (b && [...b.querySelectorAll(':scope > .fold-sub > .fold-h')].map(h => h.textContent.trim())) || [],
    shared: inDocs('#org-shared') };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— админ, ПК —');
  {
    const p = await boot(br, 'demo-admin', 'desktop', 1280, 900, ['docs', 'num', 'org']);
    const a = await info(p);
    t('наверху нет отдельной «Нумерации», «Настройки документов» на месте', a.docs && !a.top.includes('num') && !a.top.includes('org'), JSON.stringify(a.top));
    t('подразделы после карточек: … карточки → «Нумерация документов» → «Организация (для PDF)»',
      JSON.stringify(a.kids.slice(-2)) === '["sub:num","sub:org"]' && a.kids.filter(k => k === 'card').length === 4
      && /Нумерация документов/.test(a.orgTitle[0] || '') && /Организация \(для PDF\)/.test(a.orgTitle[1] || ''), JSON.stringify({ kids: a.kids, titles: a.orgTitle }));
    t('конструктор нумерации и форма организации — внутри раздела', a.num && a.org, JSON.stringify(a));
    t('копий вне раздела нет (одна форма, один конструктор)', a.orgAll === 1 && a.numAll >= 1 && await p.evaluate(() =>
      [...document.querySelectorAll('#org-name, [onclick*="noAddTok"]')].every(x => x.closest(`#app > .fold`) && x.closest('#app > .fold').querySelector(`:scope > .fold-h[onclick="App.foldToggle('docs')"]`))));
    await p.fill('#org-name', 'APC Test LLC'); await p.fill('#org-a1', 'PO BOX 1');
    await p.click('#org-card [onclick="App.saveOrg()"]'); await p.waitForTimeout(1900);
    const sv = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}'); const o = st.org_settings || {};
      return { name: o.company_name, a1: o.addr1, toast: [...document.querySelectorAll('#toasts .toast')].some(x => /Сохранено|Saved/i.test(x.textContent)) }; });
    t('админ сохраняет организацию из подраздела', sv.name === 'APC Test LLC' && sv.a1 === 'PO BOX 1' && sv.toast, JSON.stringify(sv));
    await p.close();
  }

  console.log('— бухгалтер —');
  {
    const p = await boot(br, 'demo-acc', 'mobile', 390, 3000, ['docs', 'org', 'num']);
    const a = await info(p);
    t('у бухгалтера есть «Настройки документов» с подразделом «Организация (для PDF)»', a.docs && a.org, JSON.stringify(a));
    t('нумерации и командных карточек у бухгалтера нет', !a.num && !a.shared && !a.kids.includes('sub:num'), JSON.stringify(a.kids));
    await p.fill('#org-legal', 'Payment due in 30 days.'); await p.fill('#org-voice', '404-111-2222');
    await p.click('#org-card [onclick="App.saveOrg()"]'); await p.waitForTimeout(1900);
    const sv = await p.evaluate(() => { const o = (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').org_settings) || {};
      return { legal: o.legal_note, voice: o.voice_line }; });
    t('бухгалтер сохраняет реквизиты (приписка, телефон)', sv.legal === 'Payment due in 30 days.' && sv.voice === '404-111-2222', JSON.stringify(sv));
    const over = await p.evaluate(() => {
      const c = document.querySelector('#org-card'); const R = c.getBoundingClientRect();
      return [...c.querySelectorAll('input, textarea, .btn')].filter(x => { const r = x.getBoundingClientRect(); return r.right > R.right + 1 || r.left < R.left - 1; }).length;
    });
    t('на телефоне поля организации не вылезают за карточку', over === 0, over);
    await p.close();
  }

  console.log('— техник и менеджер —');
  for (const who of ['demo-tech', 'demo-manager']){
    const p = await boot(br, who, 'mobile', 390, 2400, ['docs', 'org', 'num']);
    const a = await info(p);
    t(who + ': организации и нумерации нет', a.docs && !a.org && !a.num && a.orgAll === 0 && !a.kids.some(k => k.startsWith('sub:')), JSON.stringify(a.kids));
    const r = await p.evaluate(async () => {
      const get = () => JSON.stringify((JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').org_settings) || {});
      const before = get();
      try { await window.App.saveOrg(); } catch(e){ return 'throw: ' + e.message; }
      await new Promise(r => setTimeout(r, 1700));
      return get() === before ? 'same' : 'changed'; });
    t(who + ': App.saveOrg() ничего не делает и не падает', r === 'same', r);
    await p.close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
