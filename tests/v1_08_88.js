/* v1.08.88 — «Проверить связь» в Настройках открывает ТУ ЖЕ модалку, что бейдж
   в шапке (журнал проверок + «Копировать лог»); строка про сайт cloudflare.com
   при живом интернете не красная, а оранжевая с пояснением, и появилась строка
   про домен (DNS Cloudflare). Запуск: node tests/v1_08_88.js [порт] (демо). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, vp, mode, block){
  const ctx = await br.newContext({ viewport: vp, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  /* внешний мир недоступен: cloudflare.com «режется» как блокировщиком (abort),
     остальные внешние адреса просто молчат — как в песочнице */
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate((m) => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', m); }, mode);
  await p.reload(); await p.waitForTimeout(1400);
  return p;
}
const logOf = (p) => p.evaluate(() => {
  const box = document.querySelector('#overlay #net-log'); if (!box) return null;
  return [...box.children].map(d => ({ cls: d.className.replace('mq-l', '').trim(), txt: d.textContent.trim() }));
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const [name, vp, mode] of [['ПК', { width: 1440, height: 900 }, 'desktop'], ['телефон', { width: 414, height: 850 }, 'mobile']]){
    console.log('— ' + name + ' —');
    const p = await boot(br, vp, mode);
    /* 1. из шапки */
    await p.evaluate(() => document.querySelector('.net-pill').click()); await p.waitForTimeout(2500);
    const a = await p.evaluate(() => ({ h: (document.querySelector('#overlay h3') || {}).textContent.trim(), log: !!document.querySelector('#overlay #net-log'), run: !!document.querySelector('#overlay #net-run'), copy: /Копировать/.test(document.querySelector('#overlay').textContent) }));
    t('бейдж в шапке открывает модалку «Проверка связи» с журналом и «Копировать лог»', /Проверка связи/.test(a.h) && a.log && a.run && a.copy, JSON.stringify(a));
    const l1 = await logOf(p);
    await p.evaluate(() => window.App.closeModal());
    /* 2. из настроек — та же модалка */
    await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(500);
    const btn = await p.evaluate(() => { const b = [...document.querySelectorAll('#app button')].find(x => /App\.netModal\(\)/.test(x.getAttribute('onclick') || '')); if (b){ b.click(); return true; } return false; });
    t('в Настройках кнопка «Проверить связь» вызывает netModal, а не всплывашку', btn);
    await p.waitForTimeout(2500);
    const b2 = await p.evaluate(() => ({ h: (document.querySelector('#overlay h3') || {}).textContent.trim(), log: !!document.querySelector('#overlay #net-log'), toast: !!document.querySelector('#toasts .toast') }));
    const l2 = await logOf(p);
    t('из настроек — та же модалка с журналом', /Проверка связи/.test(b2.h) && b2.log, JSON.stringify(b2));
    const names = (l) => l.map(x => x.txt.replace(/—.*$/, '').replace(/^[✓✗⚠…]\s*/, '').trim()).filter(Boolean);
    t('набор строк в обеих проверках одинаковый', l1 && l2 && JSON.stringify(names(l1)) === JSON.stringify(names(l2)), JSON.stringify([l1 && names(l1), l2 && names(l2)]));
    /* 3. строки про Cloudflare */
    const cf = l2.find(x => /^[✓✗⚠]\s*Сайт cloudflare\.com/i.test(x.txt));
    const dom = l2.find(x => /Домен techlog\.pro/i.test(x.txt));
    const note = l2.find(x => /только держит DNS домена/i.test(x.txt));
    t('есть строка про домен techlog.pro (DNS Cloudflare)', !!dom, JSON.stringify(l2.map(x => x.txt)));
    t('строка про сайт cloudflare.com при живом интернете — оранжевая, не красная', !!cf && cf.cls === 'warn' && /режет этот браузер/.test(cf.txt), JSON.stringify(cf));
    t('под ней — пояснение, что сайт к работе приложения не относится', !!note && note.cls === 'dim', JSON.stringify(note));
    /* 4. копирование лога */
    await p.evaluate(() => document.querySelector('#overlay .btn-ghost').click()); await p.waitForTimeout(400);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    t('«Копировать лог» кладёт в буфер весь журнал с версией и адресом', /TechLog v1\.\d\d\.\d+/.test(clip) && /Проверка связи/.test(clip) && /cloudflare\.com/i.test(clip), JSON.stringify((clip || '').slice(0, 120)));
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
