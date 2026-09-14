/* v1.08.80 — журнал Способа 2 и полуручной тест Способа 2 (в демо ручные
   шаги имитируются: кадры вкладываются через App.cam.take, «Сохранить» —
   через App.saveJob), продолжение теста после перезагрузки страницы.
   Запуск: node tests/v1_08_80.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8180;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36';
const mkPhoto = async (p, jobId, n, via) => p.evaluate(async ([id, n, via]) => {
  const files = [];
  for (let i = 0; i < n; i++){ const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = ['#1CB0F6', '#58CC02', '#FF9600'][i % 3]; g.fillRect(0, 0, 640, 480);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .9)); files.push(new File([b], 'IMG_' + (i + 1) + '.jpg', { type: 'image/jpeg' })); }
  return window.App.cam.take(id, files, 'photo', { doc: 'job', via }); }, [jobId, n, via]);
const mkVideo = async (p, jobId) => p.evaluate(async id => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
  const stream = c.captureStream(15); const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm' });
  const parts = []; rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  let f = 0; const iv = setInterval(() => { g.fillStyle = f++ % 2 ? '#f00' : '#0f0'; g.fillRect(0, 0, 320, 240); }, 60);
  rec.start(200); await new Promise(r => setTimeout(r, 1500)); await new Promise(r => { rec.onstop = r; rec.stop(); }); clearInterval(iv);
  const blob = new Blob(parts, { type: 'video/webm' });
  return window.App.cam.take(id, [new File([blob], 'VID_1.webm', { type: 'video/webm' })], 'video', { doc: 'job', via: 'share' }); }, jobId);

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 }, permissions: ['camera', 'microphone'], userAgent: ANDROID_UA });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1500);

  console.log('— журнал Способа 2 —');
  const jobId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => !j.archived_at).id);
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(300);
  await p.evaluate(id => { const st = window.App.cam.st; window.App.way2Mark(); }, jobId);
  await p.evaluate(id => { /* запуск камеры телефона напрямую (в демо mediaShoot просит Supabase) */ localStorage.setItem('techlog_way2', JSON.stringify({ id, doc: 'job', kind: 'photo', ts: Date.now() })); }, jobId);
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('techlog_w2_sessions') || '[]'); return l.length; });
  // имитируем запуск: w2Begin через приватный путь — вызываем phoneCamLaunch-эквивалент: App.mediaShoot в демо блокируется, поэтому пишем сессию через take с предварительным w2Begin недоступно; используем публичный App.way2Url + событие видимости
  const s0 = await p.evaluate(id => { window.__w2 = true; return window.App.w2All().length; }, jobId);
  t('до запуска журнал Способа 2 пуст', s0 === 0);
  // запуск камеры: в демо через тест Способа 2 ниже; здесь проверяем формат записи после take
  await mkPhoto(p, jobId, 1, 'picker'); await p.waitForTimeout(1500);
  t('take без открытой сессии Способа 2 — журнал не трогает (нет ложных записей)', await p.evaluate(() => window.App.w2All().length === 0));

  console.log('— тест Способа 2: полуручной, имитация —');
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  t('кнопка «Тест Способа 2: камера телефона» в карточке', await p.evaluate(() => !!document.querySelector('#ct2-btn') && /Тест Способа 2/.test(document.querySelector('#ct2-btn').textContent)));
  await p.evaluate(() => window.App.camTest2());
  await p.waitForFunction(() => { const s = window.App.camTest2State(); return s.st && s.st.phase === 'photo-wait'; }, null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const ph = await p.evaluate(() => { const s = window.App.camTest2State().st; const bar = document.querySelector('#ct2-bar'); return { job: s.jobId, bar: bar ? bar.textContent : '', w2: window.App.w2All()[0], banner: !!document.querySelector('#way2-banner'), ls: !!localStorage.getItem('techlog_ct2') }; });
  t('фаза «ожидание 2 кадров»: инвойс CAMTEST создан, плашка с подсказкой и таймером, баннер «Снимаете камерой телефона», состояние в localStorage', ph.job && /Снимите 2 кадра/.test(ph.bar) && /осталось \d+:\d\d/.test(ph.bar) && ph.banner && ph.ls, JSON.stringify({ bar: ph.bar.slice(0, 60), banner: ph.banner }));
  t('журнал Способа 2: сессия «камера открыта» для CAMTEST, кадры ещё не вернулись', ph.w2 && ph.w2.job === ph.job && ph.w2.kind === 'photo' && !ph.w2.done, JSON.stringify(ph.w2));
  await mkPhoto(p, ph.job, 2, 'picker');
  await p.waitForFunction(() => { const s = window.App.camTest2State(); return s.st && s.st.phase === 'video-wait'; }, null, { timeout: 60000 });
  const w2p = await p.evaluate(() => window.App.w2All().find(x => x.kind === 'photo'));
  t('кадры пришли → сессия закрыта: путь «picker», 2 файла, байты, время', w2p && w2p.done && w2p.via === 'picker' && w2p.files.length === 2 && w2p.bytes > 1000 && w2p.elapsedMs >= 0, JSON.stringify(w2p));
  t('шаги фото пройдены, ждём ролик (плашка про ролик)', await p.evaluate(() => { const s = window.App.camTest2State().st; return s.steps.filter(x => x.ok).length >= 4 && /ролик/.test(document.querySelector('#ct2-bar').textContent); }));
  await mkVideo(p, ph.job);
  /* v1.08.81: «Сохранить» тест нажимает сам, затем открывает живую модалку отчёта */
  await p.waitForFunction(() => !!document.getElementById('ct-live'), null, { timeout: 90000 });
  const live = await p.evaluate(() => { const v = window.App.w2All().find(x => x.kind === 'video'); const sub = document.getElementById('ct-live-sub').textContent; const pre = document.getElementById('ct-live').textContent;
    return { via: v && v.via, sub, hasLines: /▶ Окружение/.test(pre) && /Сохранение документа \(автоматически\)/.test(pre), acts: [...document.querySelectorAll('#ct-live-acts .btn')].map(b => b.textContent.trim()) }; });
  t('ролик принят («share»), «Сохранить» нажато автоматически, открылась живая модалка «идёт отправка в фоне» со строками отчёта и кнопкой «Скрыть»', live.via === 'share' && /отправка фото и видео в фоне/.test(live.sub) && live.hasLines && live.acts.some(b => /Скрыть/.test(b)), JSON.stringify(live));
  await p.waitForFunction(() => { const s = window.App.camTest2State(); return !s.running; }, null, { timeout: 120000 }); await p.waitForTimeout(700);
  const done = await p.evaluate(() => { const c = window.App.tlogGet(); return { kind: c.kind, ok: c.ok, total: c.total, steps: c.steps.map(x => (x.ok ? '✓' : '✗') + x.name + (x.extra ? ' · ' + x.extra : '')), ct2: localStorage.getItem('techlog_ct2'), bar: !!document.querySelector('#ct2-bar'),
    modal: !!document.getElementById('overlay'), title: (document.querySelector('#overlay h3') || {}).textContent || '', btns: [...document.querySelectorAll('#overlay .btn')].map(b => b.textContent.trim()), preLast: (document.getElementById('ct-live') || {}).textContent || '' }; });
  console.log(done.steps.map(x => '     ' + x).join('\n'));
  t('тест завершён: все шаги ✓, «Страница дожила до сохранения — да, без перезагрузок», состояние снято, плашки нет', done.kind === 'camtest2' && done.ok === done.total && done.steps.some(x => /Страница дожила до сохранения · да, без перезагрузок/.test(x)) && !done.ct2 && !done.bar, JSON.stringify({ ok: done.ok, total: done.total }));
  t('та же модалка стала отчётом: заголовок «Тест завершён», кнопки Скачать/Копировать/Показать, строки до конца (удаление, итог)', done.modal && /Тест завершён/.test(done.title) && done.btns.some(b => /Скачать/.test(b)) && done.btns.some(b => /Копировать/.test(b)) && /Удаление инвойса/.test(done.preLast) && /тест съёмки: \d+ из \d+ шагов/.test(done.preLast), JSON.stringify({ title: done.title, btns: done.btns }));
  t('в отчёте — путь возврата кадров и «страница пережила»', done.steps.some(x => /Ожидание 2 кадров.*«Забрать кадры».*страница пережила/.test(x)) && done.steps.some(x => /Ожидание ролика.*«Поделиться»/.test(x)), done.steps.filter(x => /Ожидание/.test(x)).join(' | '));
  t('инвойс CAMTEST удалён', await p.evaluate(() => !JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.some(j => j.unit_number === 'CAMTEST')));
  t('в .txt журнала — блок «Способ 2 — последние съёмки» с обеими сессиями', await p.evaluate(() => { const txt = window.App.tlogGet().txt; return /--- Способ 2 — последние съёмки ---/.test(txt) && /Способ 2 · Фото/.test(txt) && /Способ 2 · Видео/.test(txt); }));
  await p.evaluate(() => window.App.closeModal());

  console.log('— перезагрузка посреди теста: продолжение с того же шага —');
  await p.evaluate(() => window.App.camTest2());
  await p.waitForFunction(() => { const s = window.App.camTest2State(); return s.st && s.st.phase === 'photo-wait'; }, null, { timeout: 30000 });
  const job2 = await p.evaluate(() => window.App.camTest2State().st.jobId);
  await p.reload(); await p.waitForTimeout(2500);
  const res = await p.evaluate(() => { const s = window.App.camTest2State(); const c = window.App.tlogGet(); return { running: s.running, phase: s.st && s.st.phase, reloads: s.st && s.st.reloads.length, tlogOpen: !c.finished && c.kind === 'camtest2', line: c.lines.map(l => l.text).find(l => /перезагрузилась на шаге/.test(l)) || '', bar: !!document.querySelector('#ct2-bar'), w2: (window.App.w2All()[0] || {}).reloaded,
    modal: !!document.getElementById('ct-live'), sub: (document.getElementById('ct-live-sub') || {}).textContent || '', cont: [...document.querySelectorAll('#ct-live-acts .btn')].map(b => b.textContent.trim()), pre: (document.getElementById('ct-live') || {}).textContent || '' }; });
  t('после перезагрузки тест продолжился на «photo-wait»: журнал теста открыт, строка про перезагрузку, плашка снова на экране, сессия Способа 2 помечена «перезагрузилась»', res.running && res.phase === 'photo-wait' && res.reloads === 1 && res.tlogOpen && /Ожидание 2 кадров/.test(res.line) && res.bar && res.w2 === true, JSON.stringify({ running: res.running, phase: res.phase, reloads: res.reloads }));
  t('«заглушка» после перезапуска: модалка с отчётом с самого начала и кнопкой «Продолжить»', res.modal && /перезагрузилась на шаге «Ожидание 2 кадров»/.test(res.sub) && res.cont.some(b => /Продолжить/.test(b)) && /▶ Окружение/.test(res.pre) && /▶ Инвойс CAMTEST/.test(res.pre), JSON.stringify({ sub: res.sub.slice(0, 80), cont: res.cont }));
  await p.evaluate(() => window.App.ctLiveHide()); await p.waitForTimeout(300);
  t('«Продолжить» закрывает модалку, плашка с подсказкой остаётся', await p.evaluate(() => !document.getElementById('overlay') && !!document.querySelector('#ct2-bar')));
  await mkPhoto(p, job2, 2, 'share');
  await p.waitForFunction(() => { const s = window.App.camTest2State(); return s.st && s.st.phase === 'video-wait'; }, null, { timeout: 60000 });
  await mkVideo(p, job2);
  await p.waitForFunction(() => !window.App.camTest2State().running, null, { timeout: 120000 }); await p.waitForTimeout(600);
  const d2 = await p.evaluate(() => { const c = window.App.tlogGet(); return { ok: c.ok, total: c.total, alive: c.steps.find(x => /дожила до сохранения/.test(x.name)) }; });
  t('шаг «Страница дожила до сохранения» — провален с диагностикой «перезагружалась (1 раз), последняя на шаге …», остальное прошло', d2.alive && d2.alive.ok === false && /перезагружалась \(1 раз\)/.test(d2.alive.extra) && /Ожидание 2 кадров/.test(d2.alive.extra) && d2.ok === d2.total - 1, JSON.stringify(d2));
  await p.evaluate(() => window.App.closeModal());

  console.log('— прерывание —');
  await p.evaluate(() => window.App.camTest2());
  await p.waitForFunction(() => { const s = window.App.camTest2State(); return s.st && s.st.phase === 'photo-wait'; }, null, { timeout: 30000 });
  await p.evaluate(() => window.App.camTest2Abort());
  await p.waitForFunction(() => !window.App.camTest2State().running, null, { timeout: 30000 }); await p.waitForTimeout(500);
  t('«Прервать тест»: тест остановлен, инвойс убран, состояние снято, модалка с (провальным) отчётом всё равно показана', await p.evaluate(() => !localStorage.getItem('techlog_ct2') && !document.querySelector('#ct2-bar') && !JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.some(j => j.unit_number === 'CAMTEST') && /прерван вручную/.test(window.App.tlogGet().txt) && !!document.getElementById('overlay') && /Тест завершён/.test(document.getElementById('overlay').textContent)));
  await p.evaluate(() => window.App.closeModal());

  console.log('— метрики: блок Способа 2 —');
  await p.evaluate(() => { window.App.go('settings'); }); await p.waitForTimeout(400);
  t('в карточке метрик — «Способ 2 — последние съёмки» со строками сессий', await p.evaluate(() => { const el = document.querySelector('#w2-log'); return !!el && /Способ 2 — последние съёмки/.test(el.textContent) && /Способ 2 · Фото/.test(el.textContent) && /«Забрать кадры»|«Поделиться»/.test(el.textContent); }));

  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
