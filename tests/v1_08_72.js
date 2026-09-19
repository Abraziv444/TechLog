/* v1.08.72 — встроенный регресс основных функций (Настройки → Диагностика):
   кнопка есть у админа на телефоне и ПК, сценарий проходит целиком в
   демо-режиме, пробные данные не остаются.
   Запуск: node tests/v1_08_72.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8163;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const mode of ['mobile', 'desktop']){
    console.log(`— ${mode === 'mobile' ? 'телефон' : 'ПК'} —`);
    const p = await (await br.newContext({ viewport: mode === 'mobile' ? { width: 414, height: 850 } : { width: 1400, height: 900 } })).newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.evaluate(m => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', m); }, mode);
    await p.reload(); await p.waitForTimeout(1500);
    const before = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('techlog_state_v1')); return { jobs: st.jobs.length, reps: (st.repairs || []).length, pl: st.placements.length }; });
    await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (!f.dgs) window.App.foldToggle('dgs'); if (!f.diag) window.App.foldToggle('diag'); });   // v1.08.96: подраздел «Диагностики» await p.waitForTimeout(400);
    t('кнопка «Регресс основных функций» в карточке диагностики', !!(await p.$('#rg-btn')));
    await p.evaluate(() => window.App.regress());
    await p.waitForTimeout(300);
    t('на время прогона кнопка неактивна и подписана «идёт регресс…»', await p.evaluate(() => { const b = document.getElementById('rg-btn'); return b && b.disabled && /идёт регресс/.test(b.textContent); }));
    await p.waitForFunction(() => /регресс: \d+ из \d+/.test((document.getElementById('rg-out') || {}).textContent || ''), null, { timeout: 120000 });
    const txt = await p.evaluate(() => (document.getElementById('rg-out') || {}).innerText || '');
    const m = txt.match(/регресс: (\d+) из (\d+)/);
    t('сценарий прошёл целиком (10 из 10)', m && m[1] === '10' && m[2] === '10', txt.replace(/\n/g, ' | ').slice(0, 400));
    t('шаги: инвойс на вчера, очередь, пикап на сегодня, документ работ, главная, «Забрать», вчера, удаление, проверка', ['инвойс на вчера', 'очередь', 'пикап на сегодня', 'документ работ', 'главная', '«Забрать»', 'вчера: инвойс', 'удаление инвойса', 'фото и видео удалены'].every(k => txt.includes(k)));
    await p.waitForTimeout(1800);
    const after = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('techlog_state_v1')); return { jobs: st.jobs.length, reps: (st.repairs || []).length, pl: st.placements.length, test: st.jobs.filter(j => j.unit_number === 'TEST').length, q: 0 }; });
    t('пробных данных не осталось: работы, документы работ и размещения как до прогона', after.jobs === before.jobs && after.reps === before.reps && after.pl === before.pl && after.test === 0, JSON.stringify({ before, after }));
    t('кнопка снова активна, экран вернулся в Настройки', await p.evaluate(() => { const b = document.getElementById('rg-btn'); return b && !b.disabled; }));
    t('ошибок JS нет', errs.length === 0, errs.join(' | '));
    await p.close();
  }
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
