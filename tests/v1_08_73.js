/* v1.08.73 — камера в приложении, приёмник файлов (intake), «Поделиться → TechLog».
   Камера — фейковое устройство Chromium (--use-fake-device-for-media-stream).
   Запуск: node tests/v1_08_73.js [порт] (демо-режим). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8173;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, vp, mode, errs){
  const ctx = await br.newContext({ viewport: vp, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(m => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', m); }, mode);
  await p.reload(); await p.waitForTimeout(1500);
  return p;
}
const firstJob = p => p.evaluate(() => { const st = JSON.parse(localStorage.getItem('techlog_state_v1')); return st.jobs.find(j => !j.archived_at).id; });
const tiles = (p, sel) => p.evaluate(s => document.querySelectorAll(s).length, sel);
const intake = p => p.evaluate(async () => (await window.App.cam.intakeAll()).map(r => ({ iid: r.iid, src: r.src || '', kind: r.kind, job: r.job_id, size: r.file && r.file.size })));

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];

  console.log('— телефон: камера в приложении —');
  {
    const p = await boot(br, { width: 414, height: 850 }, 'mobile', errs);
    t('режим камеры по умолчанию — «В приложении», камера доступна', await p.evaluate(() => localStorage.getItem('techlog_cam_mode') === null && window.App.cam.can()));
    const jobId = await firstJob(p);
    await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(500);
    t('в полосе документа кнопки «Камера» · «Родная камера» · «Видео»', await p.evaluate(() => {
      const b = [...document.querySelectorAll('.media-card .btn')].map(x => x.textContent.trim());
      return b.some(x => /^Камера/.test(x)) && b.some(x => /Родная камера/.test(x)) && b.some(x => /Видео/.test(x)); }));
    t('подпись «съёмка сейчас: камера в приложении»', await p.evaluate(() => /камера в приложении/.test(document.querySelector('.media-card').textContent)));
    await p.evaluate(id => window.App.cam.open(id, 'photo', 'job'), jobId);
    await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.srcObject && v.videoWidth > 0; }, null, { timeout: 15000 });
    t('оверлей камеры открыт, поток идёт, шапка с адресом документа', await p.evaluate(() => {
      const el = document.querySelector('#camin'); const v = el.querySelector('video');
      return !!el && v.videoWidth > 0 && document.documentElement.classList.contains('tl-camin') && /Unit/.test(el.querySelector('.camin-title').textContent); }));
    t('кнопки: затвор, «Готово», крестик; счётчик 0/лимит', await p.evaluate(() => {
      const el = document.querySelector('#camin');
      return !!el.querySelector('.camin-shutter') && !!el.querySelector('.camin-done') && /^0\/\d+$/.test(el.querySelector('.camin-cnt').textContent); }));
    const shSize = await p.evaluate(() => { const r = document.querySelector('.camin-shutter').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    t('затвор — крупная цель (≥ 60 px)', shSize[0] >= 60 && shSize[1] >= 60, shSize.join('×'));
    await p.evaluate(() => window.App.cam.shot());
    await p.waitForFunction(() => !window.App.cam.st().busy, null, { timeout: 15000 });
    t('второе нажатие во время съёмки не создаёт двойной кадр (busy)', await p.evaluate(() => { const s = window.App.cam.st(); s.busy = true; window.App.cam.shot(); s.busy = false; return s.shots === 1; }));
    await p.evaluate(() => window.App.cam.shot());
    await p.waitForFunction(() => !window.App.cam.st().busy, null, { timeout: 15000 });
    await p.waitForTimeout(2500);
    const st = await p.evaluate(() => { const s = window.App.cam.st(); return { shots: s.shots, cnt: document.querySelector('.camin-cnt').textContent, last: !!document.querySelector('.camin-last img').getAttribute('src') }; });
    t('два кадра: счётчик 2/N, последний кадр показан', st.shots === 2 && /^2\//.test(st.cnt) && st.last, JSON.stringify(st));
    await p.evaluate(() => window.App.cam.close()); await p.waitForTimeout(600);
    t('камера закрыта, класс снят, поток остановлен', await p.evaluate(() => !document.querySelector('#camin') && !document.documentElement.classList.contains('tl-camin') && !window.App.cam.st().stream));
    const loc = await tiles(p, '.media-card .mth.loc');
    t('оба кадра встали в очередь документа (плитки в полосе)', loc >= 2, 'плиток ' + loc);
    const ik = await intake(p);
    t('приёмник пуст после разбора', ik.length === 0, JSON.stringify(ik));
    t('в очереди — фото jpeg с превью', await p.evaluate(async () => {
      const d = await new Promise((r, j) => { const o = indexedDB.open('tl-media', 2); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
      const rows = await new Promise((r, j) => { const tx = d.transaction('outbox', 'readonly'); const q = tx.objectStore('outbox').getAll(); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      d.close();
      return rows.length >= 2 && rows.every(x => x.kind === 'photo' && x.mime === 'image/jpeg' && x.blob && x.blob.size > 1000 && x.thumb && x.thumb.size > 100); }));

    console.log('— телефон: видео в приложении —');
    await p.evaluate(id => window.App.cam.open(id, 'video', 'job'), jobId);
    await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.srcObject && v.videoWidth > 0; }, null, { timeout: 15000 });
    t('оверлей видео: красный затвор, подсказка «до 90 с»', await p.evaluate(() => !!document.querySelector('#camin.vid .camin-shutter.rec') && /90/.test(document.querySelector('.camin-left').textContent)));
    await p.evaluate(() => window.App.cam.shot()); await p.waitForTimeout(1800);
    t('идёт запись: таймер виден, затвор «on»', await p.evaluate(() => { const s = window.App.cam.st(); const tm = document.querySelector('.camin-timer'); return !!s.rec && tm && tm.style.display !== 'none' && /\d:\d\d/.test(tm.textContent) && document.querySelector('.camin-shutter').classList.contains('on'); }));
    await p.evaluate(() => window.App.cam.shot()); await p.waitForTimeout(4000);
    const vq = await p.evaluate(async () => {
      const d = await new Promise((r, j) => { const o = indexedDB.open('tl-media', 2); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
      const rows = await new Promise((r, j) => { const tx = d.transaction('outbox', 'readonly'); const q = tx.objectStore('outbox').getAll(); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      d.close();
      const v = rows.filter(x => x.kind === 'video');
      return v.map(x => ({ mime: x.mime, size: x.blob && x.blob.size, dur: x.dur, thumb: !!(x.thumb && x.thumb.size), name: x.name })); });
    t('ролик встал в очередь (mp4/webm, размер > 0, имя TL_…)', vq.length === 1 && vq[0].size > 1000 && /^TL_\d{8}_\d{6}\.(mp4|webm)$/.test(vq[0].name), JSON.stringify(vq));
    await p.evaluate(() => window.App.cam.close()); await p.waitForTimeout(300);
    t('плитка видео в полосе (с превью или значком)', await p.evaluate(() => [...document.querySelectorAll('.media-card .mth.loc')].some(el => el.querySelector('.mvid'))));

    console.log('— приёмник: доразбор при запуске —');
    await p.evaluate(async id => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
      g.fillStyle = '#1CB0F6'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('intake', 40, 240);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
      await window.App.cam.intakePut({ iid: 'test-intake-1', doc: 'job', job_id: id, repair_id: null, kind: 'photo',
        file: new File([b], 'intake.jpg', { type: 'image/jpeg' }), name: 'intake.jpg', type: 'image/jpeg', cam: true, at: Date.now() });
    }, jobId);
    const before = await tiles(p, '.media-card .mth.loc');
    const restored = await p.evaluate(() => window.App.cam.recover());
    await p.waitForTimeout(1500);
    const after = await tiles(p, '.media-card .mth.loc');
    t('запись приёмника доразобрана: +1 плитка, приёмник пуст, вернул 1', restored === 1 && after === before + 1 && (await intake(p)).length === 0, JSON.stringify({ before, after, restored }));
    t('тост «кадры не пропали: восстановлено 1»', await p.evaluate(() => /восстановлено 1/.test(document.getElementById('toasts').textContent)));

    console.log('— «Поделиться → TechLog»: модалка выбора документа —');
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
    await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').fillRect(0, 0, 320, 240);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
      const rows = [{ iid: 'test-share-1', src: 'share', doc: 'job', job_id: null, repair_id: null, kind: 'photo',
        file: new File([b], 'shared.jpg', { type: 'image/jpeg' }), name: 'shared.jpg', type: 'image/jpeg', cam: false, at: Date.now() }];
      for (const r of rows) await window.App.cam.intakePut(r);
      window.App.cam.shareModal(rows);
    });
    await p.waitForTimeout(400);
    const md = await p.evaluate(() => { const o = document.getElementById('overlay'); if (!o) return null;
      return { title: o.querySelector('h3').textContent, q: (o.querySelector('.ask-text') || {}).textContent, docs: [...o.querySelectorAll('.share-doc')].map(b => b.textContent.trim()), drop: !!o.querySelector('#share-drop') }; });
    t('модалка: заголовок, «Куда положить: 1 фото?», документ «открыт недавно» первым, «Не сохранять»', md && /Файлы из телефона/.test(md.title) && /1 фото/.test(md.q) && md.docs.length >= 1 && /открыт недавно/.test(md.docs[0]) && md.drop, JSON.stringify(md));
    await p.evaluate(() => document.querySelector('.share-doc').click()); await p.waitForTimeout(2000);
    t('выбор документа: документ открыт, кадр в полосе, приёмник пуст', await p.evaluate(() => document.querySelector('.media-card .mth.loc') && !document.getElementById('overlay')) && (await intake(p)).length === 0);

    console.log('— «Поделиться → TechLog»: POST через service worker —');
    const swOk = await p.evaluate(async () => {
      try{ const reg = await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; return !!reg; }catch(e){ return false; } });
    if (swOk){
      await p.reload(); await p.waitForTimeout(1500);
      const r = await p.evaluate(async () => {
        if (!navigator.serviceWorker.controller) return { ctrl: false };
        const c = document.createElement('canvas'); c.width = 200; c.height = 150; c.getContext('2d').fillRect(0, 0, 200, 150);
        const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
        const fd = new FormData(); fd.append('media', new File([b], 'sw-share.jpg', { type: 'image/jpeg' })); fd.append('title', 'x');
        const res = await fetch('./share-target', { method: 'POST', body: fd });
        const rows = await window.App.cam.intakeAll();
        const shared = rows.filter(x => x.src === 'share');
        for (const x of shared) await window.App.cam.intakeDel(x.iid);
        return { ctrl: true, redirected: res.redirected, url: res.url, shared: shared.map(x => ({ kind: x.kind, name: x.name, size: x.file && x.file.size })) }; });
      t('service worker принял POST ./share-target: редирект на ?share=1, файл лежит в приёмнике с src=share', r.ctrl && /share=1&n=1/.test(r.url) && r.shared.length === 1 && r.shared[0].kind === 'photo' && r.shared[0].size > 100, JSON.stringify(r));
      await p.evaluate(async () => { const regs = await navigator.serviceWorker.getRegistrations(); for (const g of regs) await g.unregister(); });
    } else t('service worker зарегистрирован для проверки share-target', false);

    console.log('— настройки «Съёмка» —');
    await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
    const seg = await p.evaluate(() => { const b = [...document.querySelectorAll('.cam-seg button')].map(x => x.textContent.trim()); return b; });
    t('три режима камеры: В приложении · Родная · Быстрая; и подсказка «Поделиться»', seg.includes('В приложении') && seg.includes('Родная') && seg.includes('Быстрая') && await p.evaluate(() => /Поделиться/.test(document.body.textContent)), seg.join(' | '));
    await p.evaluate(() => window.App.camMode('full')); await p.waitForTimeout(200);
    t('режим переключается и сохраняется на устройстве', await p.evaluate(() => localStorage.getItem('techlog_cam_mode') === 'full' && document.querySelector('.cam-seg button.on').textContent.trim() === 'Родная'));
    await p.close();
  }

  console.log('— ПК: та же камера —');
  {
    const p = await boot(br, { width: 1400, height: 900 }, 'desktop', errs);
    const jobId = await firstJob(p);
    await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(500);
    await p.evaluate(id => window.App.cam.open(id, 'photo', 'job'), jobId);
    await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
    await p.evaluate(() => window.App.cam.shot()); await p.waitForTimeout(2000);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    t('ПК: кадр снят, Esc закрывает камеру, плитка в полосе', await p.evaluate(() => !document.querySelector('#camin') && document.querySelectorAll('.media-card .mth.loc').length >= 1));
    await p.close();
  }

  console.log('— файлы сборки —');
  {
    const fs = require('fs'), path = require('path');
    const root = path.join(__dirname, '..');
    const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
    t('манифест: share_target (POST multipart, files=media) и launch_handler', man.share_target && man.share_target.method === 'POST' && man.share_target.params.files[0].name === 'media' && man.launch_handler && man.launch_handler.client_mode === 'navigate-existing');
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    t('sw.js: обработчик POST share-target пишет в tl-media/intake', /share-target/.test(sw) && /createObjectStore\('intake'/.test(sw) && /MDB_VER = 2/.test(sw));
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    t('app.js: воркер отпускает сэмплы mp4box; таймауты видео; intake в mediaTakeFiles', /releaseUsedSamples\(id, samples\[samples.length - 1\].number \+ 1\)/.test(app) && /M_VMETA_MS = 8000/.test(app) && /await intakePut\(\{ iid, doc/.test(app));
  }

  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
