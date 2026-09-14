/* v1.08.75 — метрики отклика камеры: плашка в камере, тап→обработчик через
   реальный клик по затвору, отложенный разбор после «Готово», сводка и
   копирование в настройках, шаг в тесте съёмки. Фейковая камера Chromium.
   Запуск: node tests/v1_08_75.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8175;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 }, permissions: ['camera', 'microphone'], hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1500);
  const jobId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => !j.archived_at).id);
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(400);

  console.log('— плашка и тап по затвору —');
  await p.evaluate(id => window.App.cam.open(id, 'photo', 'job'), jobId);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  await p.waitForTimeout(2300);
  const pill = await p.evaluate(() => { const el = document.querySelector('.camin-perf'); return el ? el.textContent : null; });
  t('плашка метрик в камере: превью к/с, поток к/с, рывки, тап, снимок, долгие', pill && /превью к\/с \d+/.test(pill) && /поток к\/с \d+/.test(pill) && /рывков \d+/.test(pill) && /снимок/.test(pill) && /долгих \d+/.test(pill), pill);
  t('сбор идёт: longtask и Event Timing подключены, к/с считаются', await p.evaluate(() => { const c = window.App.cam.perf(); return c.on && c.po && c.poEv && c.fps.length >= 1; }));
  const sh = await p.$('.camin-shutter');
  await sh.tap(); await p.waitForFunction(() => !window.App.cam.st().busy, null, { timeout: 15000 });
  await p.waitForTimeout(300);
  await sh.click(); await p.waitForFunction(() => !window.App.cam.st().busy, null, { timeout: 15000 });
  await p.waitForTimeout(400);
  const taps = await p.evaluate(() => window.App.cam.perf().taps.map(x => ({ what: x.what, delay: x.delay, paint: x.paint, done: x.done })));
  t('два тапа по затвору: задержка ввода и кадр экрана измерены (мс, не отрицательные)', taps.length === 2 && taps.every(x => x.what === 'shutter' && x.delay != null && x.delay >= 0 && x.paint != null && x.paint >= 0 && x.done > 0), JSON.stringify(taps));
  const marks = await p.evaluate(() => window.App.cam.perf().marks.map(m => m.kind + ':' + m.ms));
  t('отметки: открытие, 2×(takePhoto|frame) с размером, 2×приёмник', marks.some(m => /^open:/.test(m)) && marks.filter(m => /^(takePhoto|frame):/.test(m)).length === 2 && marks.filter(m => /^intake:/.test(m)).length === 2, marks.join(' '));
  t('кадры пока НЕ в очереди — отложено до «Готово»; в приёмнике 2', await p.evaluate(async () => {
    const st = window.App.cam.st(); const ik = await window.App.cam.intakeAll();
    return st.deferred && st.deferred.length === 2 && ik.filter(r => r.cam).length === 2 && document.querySelectorAll('.media-card .mth.loc').length === 0; }));
  await p.evaluate(() => { document.querySelector('.camin-perf').click(); });
  t('тап по плашке сворачивает её', await p.evaluate(() => document.querySelector('.camin-perf').classList.contains('min')));

  console.log('— «Готово»: разбор и сводка —');
  await p.evaluate(() => window.App.cam.close());
  await p.waitForFunction(() => document.querySelectorAll('.media-card .mth.loc').length >= 2, null, { timeout: 20000 });
  await p.waitForTimeout(800);
  const ses = await p.evaluate(() => { const c = window.App.cam.perf(); return { on: c.on, n: c.sessions.length, s: c.sessions[0], txt: window.App.cam.perfText(c.sessions[0]), ls: !!localStorage.getItem('techlog_cam_perf') }; });
  t('сессия закрыта и сохранена (localStorage), сбор остановлен', !ses.on && ses.n === 1 && ses.ls);
  t('после «Готово» в сессию дописаны prep и render', ses.s.marks.some(m => m.kind === 'prep') && ses.s.marks.some(m => m.kind === 'render') && ses.s.marks.some(m => m.kind === 'flush'), ses.s.marks.map(m => m.kind).join(','));
  t('сводка: съёмка, кадры/с, долгие задачи, тап→обработчик, снимок 1 и 2, после «Готово», вывод',
    /^Съёмка: Фото/.test(ses.txt) && /Кадры\/с: превью к\/с/.test(ses.txt) && /Долгие задачи главного потока: \d+/.test(ses.txt) && /тап→обработчик: \d+ \/ \d+ \/ \d+ ms/.test(ses.txt)
    && /снимок 1: тап→обработчик \d+\/\d+ ms · (takePhoto|frame) \d+ ms \(\d+ KB\) · в приёмник \d+ ms/.test(ses.txt) && /снимок 2:/.test(ses.txt) && /После «Готово»: prep \d+ ms/.test(ses.txt) && /Вывод: /.test(ses.txt), ses.txt);
  t('приёмник пуст после разбора', await p.evaluate(async () => (await window.App.cam.intakeAll()).length === 0));

  console.log('— видео: старт/стоп и разбор после закрытия —');
  await p.evaluate(id => window.App.cam.open(id, 'video', 'job'), jobId);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  const rb = await p.$('.camin-shutter'); await rb.tap(); await p.waitForTimeout(1500); await rb.tap();
  await p.waitForFunction(() => !window.App.cam.st().rec, null, { timeout: 10000 }); await p.waitForTimeout(400);
  const vm = await p.evaluate(() => window.App.cam.perf().marks.map(m => m.kind));
  t('видео: отметки recstart и rec (стоп→onstop), ролик в приёмнике, ещё не в очереди', vm.includes('recstart') && vm.includes('rec') && await p.evaluate(async () => (await window.App.cam.intakeAll()).length === 1 && !document.querySelector('.media-card .mth.loc .mvid')), vm.join(','));
  await p.evaluate(() => window.App.cam.close());
  await p.waitForFunction(() => !!document.querySelector('.media-card .mth.loc .mvid'), null, { timeout: 30000 });
  t('после «Готово» ролик разобран: плитка видео, приёмник пуст, сессий две', await p.evaluate(async () => (await window.App.cam.intakeAll()).length === 0 && window.App.cam.perf().sessions.length === 2 && window.App.cam.perf().sessions[0].kind === 'video'));

  console.log('— «Готово» во время снимка —');
  await p.evaluate(id => window.App.cam.open(id, 'photo', 'job'), jobId);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  const before = await p.evaluate(() => document.querySelectorAll('.media-card .mth.loc').length);
  await p.evaluate(() => { window.App.cam.shot(); window.App.cam.close(); });
  await p.waitForFunction(b => document.querySelectorAll('.media-card .mth.loc').length >= b + 1, before, { timeout: 20000 });
  t('кадр, снятый в момент «Готово», не потерян — попал в очередь', true);

  console.log('— настройки —');
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  const card = await p.evaluate(() => { const c = document.querySelector('#cp-card'); if (!c) return null;
    return { chk: c.querySelector('input[type=checkbox]').checked, pre: (c.querySelector('.cp-last') || {}).textContent || '', copy: !!c.querySelector('button') }; });
  t('карточка «Метрики отклика камеры»: галочка плашки включена, сводка двух последних съёмок, кнопка копирования', card && card.chk && /Съёмка: Фото/.test(card.pre) && /Съёмка: Видео/.test(card.pre) && card.copy, JSON.stringify(card && { chk: card.chk, len: card.pre.length }));
  await p.evaluate(() => window.App.camPerfCopy()); await p.waitForTimeout(300);
  const clip = await p.evaluate(async () => { try{ return await navigator.clipboard.readText(); }catch(e){ return 'ERR ' + e; } });
  t('«Копировать метрики» кладёт сводку в буфер', /Съёмка: /.test(clip) && /Вывод: /.test(clip), clip.slice(0, 80));
  await p.evaluate(() => window.App.camPerfUi(false)); await p.waitForTimeout(300);
  await p.evaluate(id => window.App.cam.open(id, 'photo', 'job'), jobId);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  await p.waitForTimeout(1600);
  t('галочка снята — плашки в камере нет, сбор всё равно идёт', await p.evaluate(() => !document.querySelector('.camin-perf') && window.App.cam.perf().on && localStorage.getItem('techlog_cam_perf_ui') === '0'));
  await p.evaluate(() => window.App.cam.close()); await p.waitForTimeout(500);

  console.log('— тест съёмки: шаг «Метрики отклика камеры» —');
  await p.evaluate(() => { window.App.go('settings'); }); await p.waitForTimeout(300);
  await p.evaluate(() => window.App.camTest());
  await p.waitForFunction(() => !window.App.camTestState().busy, null, { timeout: 180000 }); await p.waitForTimeout(500);
  const ct = await p.evaluate(() => window.App.camTestState().txt);
  t('в отчёте теста есть шаг «Метрики отклика камеры» с двумя съёмками и выводом', /▶ Метрики отклика камеры/.test(ct) && /Съёмка: Фото/.test(ct) && /Съёмка: Видео/.test(ct) && /Вывод: /.test(ct) && /✓ Метрики отклика камеры — \d+ ms/.test(ct), ct.slice(-400));
  t('тест съёмки пройден целиком', /тест съёмки: (\d+) из \1 шагов/.test(ct));

  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
