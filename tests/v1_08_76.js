/* v1.08.76 — журнал теста целиком: построчно в localStorage, кнопки
   Скачать/Копировать/Показать в карточках и модалке по завершении,
   прерванный тест помечается при старте, «Журнал событий» скачивается.
   Запуск: node tests/v1_08_76.js [порт] (демо, фейковая камера). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8176;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 }, permissions: ['camera', 'microphone'], acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  t('до первого теста блока «Журнал последнего теста» нет', await p.evaluate(() => !document.querySelector('#tl-last') && !localStorage.getItem('techlog_testlog')));

  console.log('— прогон теста съёмки: журнал пишется построчно —');
  await p.evaluate(() => window.App.camTest());
  await p.waitForTimeout(2500);
  const mid = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_testlog') || 'null'));
  t('во время теста журнал уже в localStorage: kind camtest, не завершён, строки пишутся', mid && mid.kind === 'camtest' && !mid.finished && mid.lines.length > 5, mid && JSON.stringify({ k: mid.kind, n: mid.lines.length }));
  await p.waitForFunction(() => !window.App.camTestState().busy, null, { timeout: 180000 }); await p.waitForTimeout(800);
  const modal = await p.evaluate(() => { const o = document.getElementById('overlay'); if (!o) return null;
    return { title: o.querySelector('h3').textContent, btns: [...o.querySelectorAll('.tl-acts .btn')].map(b => b.textContent.trim()), head: (o.querySelector('.ask-text') || o.querySelector('#ct-live-sub') || {}).textContent || '' }; });
  t('по завершении — модалка «Тест завершён» с кнопками Скачать / Копировать / Показать и сводкой', modal && /Тест завершён/.test(modal.title) && modal.btns.some(b => /Скачать/.test(b)) && modal.btns.some(b => /Копировать/.test(b)) && modal.btns.some(b => /Показать/.test(b)) && /из \d+ шагов/.test(modal.head), JSON.stringify(modal));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => window.App.tlogSave())]);
  const body = require('fs').readFileSync(await dl.path(), 'utf8');
  t('«Скачать .txt» из модалки: techlog-camtest-дата.txt', /^techlog-camtest-\d{4}-\d\d-\d\d_\d\d-\d\d\.txt$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  t('файл целиком: шапка, журнал теста с мс, шаги, метрики отклика камеры, журнал приложения',
    /^TechLog 1\.08\.\d+ — Тест съёмки/.test(body) && /--- журнал теста ---\n\d\d:\d\d:\d\d\.\d{3}  ▶ Окружение/.test(body) && /--- шаги ---\n✓ Окружение — \d+ ms/.test(body)
    && /--- метрики отклика камеры/.test(body) && /Съёмка: Фото/.test(body) && /--- журнал приложения/.test(body) && /\[TechLog 1\.08\.\d+ /.test(body) && /dlog: /.test(body), body.slice(0, 300));
  await p.evaluate(() => window.App.closeModal()); await p.waitForTimeout(300);

  console.log('— блок в карточках, копирование, показ —');
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.dgs !== 1) window.App.foldToggle('dgs'); if (f.diag !== 1) window.App.foldToggle('diag'); });   // v1.08.96 await p.waitForTimeout(400);
  const card = await p.evaluate(() => { const els = [...document.querySelectorAll('#tl-last')]; return { n: els.length, txt: els[0] ? els[0].textContent : '', btns: els[0] ? [...els[0].querySelectorAll('.btn')].map(b => b.textContent.trim()) : [] }; });
  t('блок «Журнал последнего теста» в карточке «Съёмка» и в «Диагностике» (2 шт.), со сводкой и кнопками', card.n === 2 && /Журнал последнего теста/.test(card.txt) && /Тест съёмки/.test(card.txt) && /из \d+ шагов/.test(card.txt) && card.btns.length >= 3, JSON.stringify(card));
  await p.evaluate(() => window.App.tlogCopy()); await p.waitForTimeout(300);
  const clip = await p.evaluate(async () => { try{ return await navigator.clipboard.readText(); }catch(e){ return 'ERR ' + e; } });
  t('«Копировать» кладёт тот же полный текст', clip === body, clip.slice(0, 60));
  await p.evaluate(() => window.App.tlogShow()); await p.waitForTimeout(300);
  t('«Показать» открывает модалку с полным журналом', await p.evaluate(() => { const o = document.getElementById('overlay'); return !!o && /Журнал последнего теста/.test(o.querySelector('h3').textContent) && /--- шаги ---/.test(o.querySelector('pre').textContent); }));
  await p.evaluate(() => window.App.closeModal());

  console.log('— перезапуск страницы: журнал остаётся, незавершённый тест помечается —');
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.App.go('settings'); }); await p.waitForTimeout(400);
  t('после перезапуска блок на месте и текст тот же', await p.evaluate(b => { const el = document.querySelector('#tl-last'); return !!el && window.App.tlogGet().txt === b; }, body));
  await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('techlog_testlog')); c.finished = null; c.aborted = false; c.txt = ''; c.lines = c.lines.slice(0, 20); c.steps = c.steps.slice(0, 3); localStorage.setItem('techlog_testlog', JSON.stringify(c)); });
  await p.reload(); await p.waitForTimeout(2200);
  const ab = await p.evaluate(() => { const c = window.App.tlogGet(); return { fin: !!c.finished, aborted: c.aborted, last: c.lines[c.lines.length - 1].text, ok: c.ok, total: c.total, toast: document.getElementById('toasts').textContent, txt: c.txt }; });
  t('незавершённый тест при старте помечен «прерван»: строка в журнале, статус, тост, .txt пересобран', !ab.fin === false && ab.aborted && /тест прерван: страница была перезапущена/.test(ab.last) && ab.total === 3 && /Прошлый тест прервался/.test(ab.toast) && /прерван \(страница перезапустилась\)/.test(ab.txt), JSON.stringify({ a: ab.aborted, last: ab.last, ok: ab.ok, total: ab.total }));

  console.log('— регресс пишет в тот же журнал —');
  await p.evaluate(() => { window.App.go('settings'); window.App.regress(); });
  await p.waitForFunction(() => { const c = window.App.tlogGet(); return c && c.kind === 'regress' && !!c.finished; }, null, { timeout: 180000 }); await p.waitForTimeout(600);
  const rg = await p.evaluate(() => { const c = window.App.tlogGet(); return { kind: c.kind, steps: c.steps.length, ok: c.ok, total: c.total, lines: c.lines.filter(l => /^[✓✗] /.test(l.text)).length, modal: !!document.getElementById('overlay') && /Тест завершён/.test(document.getElementById('overlay').textContent) }; });
  t('регресс: журнал kind=regress, шаги и строки записаны, модалка по завершении', rg.kind === 'regress' && rg.steps >= 10 && rg.lines === rg.steps && rg.ok === rg.total && rg.modal, JSON.stringify(rg));
  await p.evaluate(() => window.App.closeModal());

  console.log('— «Журнал событий»: скачать —');
  await p.evaluate(() => window.App.showLog()); await p.waitForTimeout(300);
  t('в модалке журнала событий есть «Скачать .txt»', await p.evaluate(() => { const o = document.getElementById('overlay'); return !!o && [...o.querySelectorAll('.btn')].some(b => /Скачать \.txt/.test(b.textContent)); }));
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => window.App.logSave())]);
  const body2 = require('fs').readFileSync(await dl2.path(), 'utf8');
  t('скачивается techlog-log-дата.txt с журналом приложения', /^techlog-log-\d{4}-\d\d-\d\d_\d\d-\d\d\.txt$/.test(dl2.suggestedFilename()) && /\[TechLog 1\.08\.\d+ /.test(body2) && body2.split('\n').length > 20, dl2.suggestedFilename());
  await p.evaluate(() => window.App.closeModal());

  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
