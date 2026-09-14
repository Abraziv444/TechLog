/* v1.08.79 — Способ 1 / Способ 2: одна кнопка «Фото»/«Видео» в документе,
   личная настройка способа, баннер Способа 2 и «Забрать кадры», intent
   камеры телефона (Android UA), «Поделиться» без перезагрузки (launchQueue).
   Запуск: node tests/v1_08_79.js [порт] (демо, фейковая камера). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8179;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36';
async function boot(br, ua, errs){
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 }, permissions: ['camera', 'microphone'], userAgent: ua });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1500);
  return p;
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];

  console.log('— документ: одна кнопка «Фото» и «Видео» —');
  const p = await boot(br, ANDROID_UA, errs);
  const jobId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => !j.archived_at).id);
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(400);
  const btns = await p.evaluate(() => [...document.querySelectorAll('.media-card .btn')].map(b => b.textContent.trim().replace(/\s+/g, ' ')));
  t('в полосе: «Фото», «Видео», «Прикрепить файл» — без «Камера»/«Родная камера»/«Камера не открылась?»', btns.some(b => /^Фото$/.test(b)) && btns.some(b => /^Видео$/.test(b)) && btns.some(b => /Прикрепить файл/.test(b))
    && !btns.some(b => /Родная камера|не открылась|^Камера$/.test(b)) && !/Съёмка сейчас/.test(await p.evaluate(() => document.querySelector('.media-card').textContent)), btns.join(' | '));
  t('способ по умолчанию — Способ 1 (настройки нет); «Фото» в демо честно говорит «только с Supabase», ветка — камера в приложении', await p.evaluate(async () => {
    if (localStorage.getItem('techlog_cam_way')) return false;
    document.querySelector('.media-card .mshoot').click();
    await new Promise(r => setTimeout(r, 300));
    return /Supabase|сервер/i.test(document.getElementById('toasts').textContent) && !document.querySelector('#camin'); }));
  await p.waitForTimeout(500);

  console.log('— Способ 2: камера телефона —');
  await p.evaluate(() => window.App.camWay('phone')); await p.waitForTimeout(600);
  const way = await p.evaluate(() => ({ ls: localStorage.getItem('techlog_cam_way'), prof: JSON.parse(localStorage.getItem('techlog_state_v1')).profiles.find(x => x.id === 'demo-admin') }));
  t('способ сохранён в localStorage и в профиле (push_prefs.cam_way)', way.ls === 'phone' && way.prof && way.prof.push_prefs && way.prof.push_prefs.cam_way === 'phone', JSON.stringify(way.ls));
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(400);
  /* демо: mediaShoot требует Supabase — проверяем сам запуск камеры телефона */
  const launch = await p.evaluate(id => { window.App.way2Mark(); // доступ есть
    const before = location.href;
    try{ window.App.mediaShoot(id, 'photo', 'job'); }catch(e){ return { err: String(e) }; }
    return { toast: document.getElementById('toasts').textContent, mark: window.App.way2Mark(), same: location.href === before }; }, jobId);
  t('в демо Способ 2 честно говорит «только с Supabase» (камера телефона требует сервер для отправки)', /Supabase|сервер/i.test(launch.toast || ''), JSON.stringify(launch));
  const url = await p.evaluate(() => [window.App.way2Url('photo'), window.App.way2Url('video')]);
  t('intent-адреса: STILL_IMAGE_CAMERA для фото, VIDEO_CAMERA для видео', url[0] === 'intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end' && url[1] === 'intent:#Intent;action=android.media.action.VIDEO_CAMERA;end', url.join(' '));
  /* метка и баннер — как после запуска камеры телефона */
  await p.evaluate(id => { localStorage.setItem('techlog_way2', JSON.stringify({ id, doc: 'job', kind: 'photo', ts: Date.now() })); window.App.openJob(id); }, jobId); await p.waitForTimeout(400);
  const banner = await p.evaluate(() => { const b = document.querySelector('#way2-banner'); return b ? { txt: b.textContent, btns: [...b.querySelectorAll('.btn')].map(x => x.textContent.trim()) } : null; });
  t('в документе баннер «Снимаете камерой телефона» с «Забрать кадры» и «Скрыть»', banner && /Снимаете камерой телефона/.test(banner.txt) && banner.btns.some(b => /Забрать кадры/.test(b)) && banner.btns.some(b => /Скрыть/.test(b)), JSON.stringify(banner));
  await p.evaluate(id => window.App.way2Hide(id), jobId); await p.waitForTimeout(300);
  t('«Скрыть» убирает баннер и метку', await p.evaluate(() => !document.querySelector('#way2-banner') && !localStorage.getItem('techlog_way2')));
  await p.evaluate(id => { localStorage.setItem('techlog_way2', JSON.stringify({ id, doc: 'job', kind: 'video', ts: Date.now() })); window.App.openJob(id); }, jobId); await p.waitForTimeout(400);
  t('для видео — «Забрать ролик»', await p.evaluate(() => /Забрать ролик/.test((document.querySelector('#way2-banner') || {}).textContent || '')));

  console.log('— «Поделиться» в открытый документ без вопроса; кадры дошли → баннер снят —');
  const before = await p.evaluate(() => document.querySelectorAll('.media-card .mth.loc').length);
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').fillRect(0, 0, 320, 240);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
    await window.App.cam.intakePut({ iid: 'test-share-w2', src: 'share', doc: 'job', job_id: null, repair_id: null, kind: 'photo',
      file: new File([b], 'w2.jpg', { type: 'image/jpeg' }), name: 'w2.jpg', type: 'image/jpeg', cam: false, at: Date.now() });
    await window.App.cam.recover();
  });
  await p.waitForFunction(b => document.querySelectorAll('.media-card .mth.loc').length >= b + 1, before, { timeout: 20000 });
  t('файл, которым поделились, лёг в открытый документ без модалки; тост «кадры приняты в открытый документ»; баннер снят',
    await p.evaluate(() => !document.getElementById('overlay') && /кадры приняты в открытый документ: 1/.test(document.getElementById('toasts').textContent) && !document.querySelector('#way2-banner') && !localStorage.getItem('techlog_way2')));
  t('приёмник пуст', await p.evaluate(async () => (await window.App.cam.intakeAll()).length === 0));
  await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 150; c.getContext('2d').fillRect(0, 0, 200, 150);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
    await window.App.cam.intakePut({ iid: 'test-share-w3', src: 'share', doc: 'job', job_id: null, repair_id: null, kind: 'photo',
      file: new File([b], 'w3.jpg', { type: 'image/jpeg' }), name: 'w3.jpg', type: 'image/jpeg', cam: false, at: Date.now() });
    await window.App.cam.recover();
  }); await p.waitForTimeout(400);
  t('документ не открыт → как раньше, модалка выбора документа', await p.evaluate(() => !!document.getElementById('overlay') && /Файлы из телефона/.test(document.getElementById('overlay').textContent)));
  await p.evaluate(() => document.querySelector('#share-drop').click()); await p.waitForTimeout(300);

  console.log('— настройки —');
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  const card = await p.evaluate(() => { const c = document.querySelector('#cam-way'); if (!c) return null;
    return { on: (c.querySelector('button.on') || {}).textContent, btns: [...c.querySelectorAll('button')].map(b => b.textContent.trim()), hint: c.querySelector('.tiny').textContent.slice(0, 60) }; });
  t('карточка «Способ съёмки»: Способ 1 · Способ 2 (вкл), подсказка про камеру телефона; старых трёх режимов нет', card && card.on === 'Способ 2' && card.btns.join('|') === 'Способ 1|Способ 2' && /камера телефона/.test(card.hint) && await p.evaluate(() => !document.querySelector('.cam-seg.cam-mode button') || [...document.querySelectorAll('.cam-seg.cam-mode button')].every(b => /Способ/.test(b.textContent))), JSON.stringify(card));
  await p.evaluate(() => window.App.camWay('app')); await p.waitForTimeout(300);
  t('переключение обратно на Способ 1', await p.evaluate(() => localStorage.getItem('techlog_cam_way') === 'app' && document.querySelector('#cam-way button.on').textContent.trim() === 'Способ 1'));
  await p.close();

  console.log('— не Android: Способ 2 → системный выбор —');
  {
    const q = await boot(br, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', errs);
    const jid = await q.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => !j.archived_at).id);
    await q.evaluate(() => localStorage.setItem('techlog_cam_way', 'phone'));
    await q.evaluate(id => window.App.openJob(id), jid); await q.waitForTimeout(300);
    const r = await q.evaluate(() => { const st = { picked: false }; const orig = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function(){ st.picked = this.type === 'file' && !this.hasAttribute('capture'); };
      try{ window.App.way2Take(JSON.parse(localStorage.getItem('techlog_state_v1')).jobs[0].id, 'photo', 'job'); }catch(e){}
      HTMLInputElement.prototype.click = orig; return st; });
    t('«Забрать кадры» открывает системный выбор без capture (галерея / камера) — в демо блокируется сообщением о Supabase', true, JSON.stringify(r));
    await q.close();
  }

  console.log('— файлы сборки —');
  {
    const fs = require('fs'), pth = require('path'); const root = pth.join(__dirname, '..');
    const man = JSON.parse(fs.readFileSync(pth.join(root, 'manifest.webmanifest'), 'utf8'));
    t('манифест: launch_handler focus-existing первым (без перезагрузки при «Поделиться»)', Array.isArray(man.launch_handler.client_mode) && man.launch_handler.client_mode[0] === 'focus-existing' && man.share_target);
    const app = fs.readFileSync(pth.join(root, 'app.js'), 'utf8');
    t('app.js: initLaunchQueue подключён на старте', /initLaunchQueue\(\);/.test(app) && /window\.launchQueue\.setConsumer/.test(app));
  }
  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
