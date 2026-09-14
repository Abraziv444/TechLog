/* v1.08.74 — «Тест съёмки: фото и видео» (Настройки → Съёмка): сквозной
   сценарий в демо-режиме с фейковой камерой Chromium, отчёт, копирование,
   сохранение .txt. Запуск: node tests/v1_08_74.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8174;
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

  console.log('— кнопка в настройках —');
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  const card = await p.evaluate(() => { const c = document.querySelector('#ct-card'); if (!c) return null;
    return { btn: (c.querySelector('#ct-btn') || {}).textContent || '', hint: c.querySelector('.tiny').textContent, acts: getComputedStyle(c.querySelector('#ct-acts')).display }; });
  t('карточка «Тест съёмки» в разделе «Съёмка»: кнопка, подсказка, кнопки отчёта скрыты до запуска', card && /Тест съёмки/.test(card.btn) && /CAMTEST/.test(card.hint) && card.acts === 'none', JSON.stringify(card));
  const jobs0 = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.length);

  console.log('— прогон —');
  await p.evaluate(() => window.App.camTest());
  await p.waitForTimeout(700);
  t('тест идёт: состояние busy, документ CAMTEST открыт или камера на экране', await p.evaluate(() => window.App.camTestState().busy && (document.querySelector('#camin') || /CAMTEST/.test(document.body.textContent))));
  await p.waitForFunction(() => !window.App.camTestState().busy, null, { timeout: 180000 });
  await p.waitForTimeout(600);
  t('после прогона — снова настройки, отчёт на экране', await p.evaluate(() => !!document.querySelector('#ct-out') && /тест съёмки: \d+ из \d+ шагов/.test(document.querySelector('#ct-out').textContent)));
  const res = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#ct-out > div')].filter(d => d.id !== 'ct-log').map(d => d.textContent.trim());
    if (!document.querySelector('#ct-log')) return { rows, fin: rows[rows.length - 1], log: '' };
    const fin = rows[rows.length - 1];
    const log = document.querySelector('#ct-log').textContent;
    return { rows, fin, log, txtLen: (window.__ctTxt = null, 0) }; });
  console.log(res.rows.map(r => '     ' + r).join('\n'));
  const m = /тест съёмки: (\d+) из (\d+) шагов · (\d+) с/.exec(res.fin);
  t('все шаги пройдены', m && m[1] === m[2] && +m[2] >= 12, res.fin);
  const names = ['Окружение', 'Инвойс CAMTEST', 'Документ открыт', 'Камера: 3 кадра(ов)', 'Обработка фото и очередь', 'Камера: 2 ролика(ов) по 3 с', 'Метрики отклика камеры', 'Миниатюры в документе', 'Сохранить и выйти', 'Документ заново', 'Фоновая отправка на Диск', 'Миниатюры с сервера', 'Просмотр фото и видео с Диска', 'Удаление инвойса'];
  t('состав шагов по порядку', names.every((n, i) => res.rows[i] && res.rows[i].includes(n)), res.rows.slice(0, 14).join(' | '));
  t('демо: отправка, миниатюры с сервера и просмотр помечены «пропущено»', res.rows.filter(r => /демо-режим — пропущено/.test(r)).length === 3);
  t('журнал: окружение (версия, телефон, демо, API), поток камеры, два кадра с размером, ролик в очереди, миниатюры, очередь в IndexedDB',
    /приложение 1\.08\.\d+ · телефон/.test(res.log) && /сервер: демо/.test(res.log) && /API: getUserMedia есть/.test(res.log)
    && /камера открылась за \d+ мс: поток \d+×\d+/.test(res.log) && /кадр 1: \d+ мс · (takePhoto|кадр с потока) · \d+ КБ · TL_/.test(res.log) && /кадр 2: /.test(res.log) && /кадр 3: /.test(res.log)
    && /фото 1: TL_\S+ · \d+×\d+ · \d+ КБ \((оригинал|пережато)\) · превью \d+ КБ/.test(res.log)
    && /ролик 1 в очереди: TL_\S+\.(mp4|webm) · video\/\S+ · [\d.]+ МБ · длительность \d+ с/.test(res.log) && /ролик 2 в очереди: /.test(res.log)
    && /плиток в документе: 5 \(фото 3, видео 2\) · миниатюры фото 3\/3 · видео 2\/2/.test(res.log)
    && /очередь документа: 5 файл\(ов\) в IndexedDB/.test(res.log) && /документ открыт заново: плиток 5/.test(res.log)
    && /инвойс CAMTEST и его файлы удалены/.test(res.log), res.log.slice(0, 600));
  t('инвойс CAMTEST убран, экран вернулся в настройки, кнопка снова активна', await p.evaluate(jobs0 => {
    const st = JSON.parse(localStorage.getItem('techlog_state_v1'));
    return st.jobs.length === jobs0 && !st.jobs.some(j => j.unit_number === 'CAMTEST') && !document.querySelector('#camin') && !document.querySelector('#ct-btn').disabled; }, jobs0));
  t('очередь пуста после удаления', await p.evaluate(async () => {
    const d = await new Promise((r, j) => { const o = indexedDB.open('tl-media', 2); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
    const rows = await new Promise((r, j) => { const tx = d.transaction('outbox', 'readonly'); const q = tx.objectStore('outbox').getAll(); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    d.close(); return rows.length === 0; }));

  console.log('— отчёт —');
  const acts = await p.evaluate(() => getComputedStyle(document.querySelector('#ct-acts')).display !== 'none');
  t('кнопки «Копировать отчёт» и «Сохранить .txt» показаны после прогона', acts);
  await p.evaluate(() => window.App.camTestCopy()); await p.waitForTimeout(300);
  const clip = await p.evaluate(async () => { try{ return await navigator.clipboard.readText(); }catch(e){ return 'ERR ' + e; } });
  t('буфер обмена: заголовок с версией и пользователем, строки с временем, блок «— шаги —»',
    /^TechLog 1\.08\.\d+ — Тест съёмки/.test(clip) && /\n\d\d:\d\d:\d\d\.\d{3}  ▶ Окружение/.test(clip) && /--- шаги ---\n✓ Окружение — \d+ ms/.test(clip) && clip.split('\n').length > 40, clip.slice(0, 200));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => window.App.camTestSave())]);
  const fname = dl.suggestedFilename();
  const path = await dl.path(); const body = require('fs').readFileSync(path, 'utf8');
  t('.txt скачивается: techlog-camtest-дата.txt, содержимое = отчёт', /^techlog-camtest-\d{4}-\d\d-\d\d_\d\d-\d\d\.txt$/.test(fname) && body === clip, fname);
  t('тост «отчёт сохранён»', await p.evaluate(() => /отчёт сохранён/.test(document.getElementById('toasts').textContent)));

  console.log('— файлы сборки —');
  {
    const fs = require('fs'), pth = require('path'); const root = pth.join(__dirname, '..');
    const app = fs.readFileSync(pth.join(root, 'app.js'), 'utf8');
    t('app.js: camTestRun, промис готовности камеры, noFallback, запись без звука при запрете микрофона',
      /async function camTestRun\(\)/.test(app) && /CAMIN\.ready = new Promise/.test(app) && /if \(CAMIN\.noFallback\) return;/.test(app) && /CAMIN\.noAudio = true;/.test(app));
    t('версии синхронны', (() => { const v = JSON.parse(fs.readFileSync(pth.join(root, 'version.json'), 'utf8')).version; return app.includes(`const APP_VERSION = '${v}'`) && fs.readFileSync(pth.join(root, 'sw.js'), 'utf8').includes(`const VERSION = '${v}'`); })());
  }
  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
