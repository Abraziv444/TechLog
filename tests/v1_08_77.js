/* v1.08.77 — режим превью камеры (Быстрое/Максимум), режим и «снимок до» в
   метриках, экспорт метрик (.txt), «нет тапов» в тестовой сводке.
   Запуск: node tests/v1_08_77.js [порт] (демо, фейковая камера). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8177;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
const openCam = async (p, jobId, kind) => {
  await p.evaluate(([id, k]) => window.App.cam.open(id, k, 'job'), [jobId, kind]);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  await p.waitForTimeout(1300);
  return p.evaluate(() => { const v = document.querySelector('#camin video'); const st = window.App.cam.st(); return { w: v.videoWidth, h: v.videoHeight, mode: st.prevMode, prev: window.App.cam.perf().preview }; });
};
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 }, permissions: ['camera', 'microphone'], acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1500);
  const jobId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => !j.archived_at).id);
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(400);

  console.log('— превью: быстрое по умолчанию, максимум по настройке —');
  const f = await openCam(p, jobId, 'photo');
  t('по умолчанию «быстрое»: поток 1280×720 (фейковая камера отдаёт запрошенное), режим в сессии', f.mode === 'fast' && f.w === 1280 && f.h === 720 && /^1280×720/.test(f.prev), JSON.stringify(f));
  await p.evaluate(() => window.App.cam.shot()); await p.waitForFunction(() => !window.App.cam.st().busy, null, { timeout: 15000 });
  await p.evaluate(() => window.App.cam.close()); await p.waitForTimeout(1500);
  const s1 = await p.evaluate(() => { const s = window.App.cam.perf().sessions[0]; return { mode: s.prevMode, pm: s.photoMax, txt: window.App.cam.perfText(s) }; });
  t('в сводке: «превью 1280×720@… (быстрое)» и «снимок до W×H» (ImageCapture есть)', /превью 1280×720[^ ]* \(быстрое\)/.test(s1.txt) && /снимок до \d+×\d+/.test(s1.txt) && s1.mode === 'fast' && /\d+×\d+/.test(s1.pm), s1.txt.split('\n')[0]);
  await p.evaluate(() => window.App.camPrev('max')); await p.waitForTimeout(300);
  const m = await openCam(p, jobId, 'photo');
  const lsPrev = await p.evaluate(() => localStorage.getItem('techlog_cam_prev'));
  t('«Максимум»: запрошено 4096×3072 — поток больше 1280×720, режим max, настройка сохранена', m.mode === 'max' && m.w > 1280 && lsPrev === 'max', JSON.stringify(m));
  await p.evaluate(() => window.App.cam.close()); await p.waitForTimeout(600);
  const vmx = await openCam(p, jobId, 'video');
  t('видео при «максимум» — по пресету (1080p)', vmx.h === 1080 || vmx.w === 1920, JSON.stringify(vmx));
  await p.evaluate(() => window.App.cam.close()); await p.waitForTimeout(400);
  await p.evaluate(() => window.App.camPrev('fast')); await p.waitForTimeout(300);
  const vf = await openCam(p, jobId, 'video');
  t('видео при «быстрое» — 720p', vf.h === 720 && vf.w === 1280, JSON.stringify(vf));
  const sh = await p.$('.camin-shutter'); await sh.click(); await p.waitForTimeout(1500); await sh.click();
  await p.waitForFunction(() => !window.App.cam.st().rec, null, { timeout: 10000 });
  await p.evaluate(() => window.App.cam.close());
  await p.waitForFunction(() => !!document.querySelector('.media-card .mth.loc .mvid'), null, { timeout: 30000 });
  const vq = await p.evaluate(async () => {
    const d = await new Promise((r, j) => { const o = indexedDB.open('tl-media', 2); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
    const rows = await new Promise((r, j) => { const tx = d.transaction('outbox', 'readonly'); const q = tx.objectStore('outbox').getAll(); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    d.close(); const v = rows.find(x => x.kind === 'video'); return v ? { size: v.blob.size, dur: v.dur } : null; });
  t('ролик 720p записан и разобран после «Готово»', vq && vq.size > 1000, JSON.stringify(vq));

  console.log('— настройки: переключатель и экспорт метрик —');
  await p.evaluate(() => { window.App.go('settings'); const fd = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (fd.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  const card = await p.evaluate(() => { const c = document.querySelector('#cam-prev'); if (!c) return null;
    return { on: (c.querySelector('button.on') || {}).textContent, btns: [...c.querySelectorAll('button')].map(b => b.textContent.trim()), hint: c.querySelector('.tiny').textContent.slice(0, 40) }; });
  t('карточка «Превью камеры в приложении»: Быстрое (вкл) · Максимум, подсказка', card && card.on === 'Быстрое' && card.btns.join('|') === 'Быстрое|Максимум' && /1280×720/.test(card.hint), JSON.stringify(card));
  t('у метрик — Скачать .txt и Копировать', await p.evaluate(() => { const c = document.querySelector('#cp-card'); const b = [...c.querySelectorAll('.btn')].map(x => x.textContent.trim()); return b.some(x => /Скачать \.txt/.test(x)) && b.some(x => /Копировать метрики/.test(x)); }));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => window.App.camPerfSave())]);
  const body = require('fs').readFileSync(await dl.path(), 'utf8');
  t('techlog-cam-metrics-дата.txt: шапка с версией, две последние сессии', /^techlog-cam-metrics-\d{4}-\d\d-\d\d_\d\d-\d\d\.txt$/.test(dl.suggestedFilename()) && /^TechLog 1\.\d\d\.\d+ — Метрики отклика камеры/.test(body) && (body.match(/Съёмка: /g) || []).length === 2, dl.suggestedFilename());
  t('ручные тапы по затвору — в сводке цифры, а не «нет тапов»', /тап→обработчик: \d+ \/ \d+ \/ \d+ ms/.test(body.split('Съёмка: Видео')[1] || ''), (body.split('Съёмка: Видео')[1] || '').split('\n')[3]);

  console.log('— тест съёмки: «нет — снимки программные» —');
  await p.evaluate(() => window.App.camTest());
  await p.waitForFunction(() => !window.App.camTestState().busy, null, { timeout: 180000 }); await p.waitForTimeout(500);
  const ct = await p.evaluate(() => window.App.camTestState().txt);
  t('в отчёте теста «тап→обработчик: нет — снимки программные (тест)»', /тап→обработчик: нет — снимки программные \(тест\)/.test(ct) && /тест съёмки: (\d+) из \1 шагов/.test(ct));
  await p.evaluate(() => window.App.closeModal());

  console.log('— файлы сборки —');
  {
    const fs = require('fs'), pth = require('path'); const root = pth.join(__dirname, '..');
    const app = fs.readFileSync(pth.join(root, 'app.js'), 'utf8');
    t('портретное видео по короткой стороне; mfa null-guard; bouncie без ⛔', /target\.h \/ Math\.min\(dw, dh\)/.test(app) && /\(\(data && data\.totp\) \|\| \[\]\)\.find/.test(app) && /BN\.notedOff/.test(app));
    t('версии синхронны', (() => { const v = JSON.parse(fs.readFileSync(pth.join(root, 'version.json'), 'utf8')).version; return app.includes(`const APP_VERSION = '${v}'`) && fs.readFileSync(pth.join(root, 'sw.js'), 'utf8').includes(`const VERSION = '${v}'`); })());
  }
  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
