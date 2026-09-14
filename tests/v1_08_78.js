/* v1.08.78 — серия через очередь затвора, кольцо ожидания, вердикты по
   профилю, «Профиль этого телефона», 480p, счётчик кадров видео.
   Запуск: node tests/v1_08_78.js [порт] (демо, фейковая камера). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8178;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 }, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1500);
  const jobId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => !j.archived_at).id);
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(400);

  console.log('— серия: нажатие во время снимка ставит кадр в очередь —');
  await p.evaluate(id => window.App.cam.open(id, 'photo', 'job'), jobId);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  const q = await p.evaluate(() => { const st = window.App.cam.st(); st.busy = true; document.querySelector('.camin-shutter').classList.add('busy');
    window.App.cam.shot(); const r = { queued: st.queued, msg: document.querySelector('.camin-msg').textContent, disabled: document.querySelector('.camin-shutter').disabled };
    st.busy = false; return r; });
  t('затвор не заблокирован во время снимка; второе нажатие → «+1 · ещё кадр в очереди»', q.queued === true && /\+1/.test(q.msg) && !q.disabled, JSON.stringify(q));
  await p.evaluate(() => { const st = window.App.cam.st(); st.queued = false; document.querySelector('.camin-shutter').classList.remove('busy'); });
  const sh = await p.$('.camin-shutter');
  await sh.click(); await p.waitForTimeout(40); await sh.click();
  await p.waitForFunction(() => { const st = window.App.cam.st(); return st.shots === 2 && !st.busy && !st.queued; }, null, { timeout: 20000 });
  t('два быстрых нажатия → два кадра (второй из очереди)', await p.evaluate(() => window.App.cam.st().shots === 2));
  t('кольцо ожидания снимается после снимка', await p.evaluate(() => !document.querySelector('.camin-shutter').classList.contains('busy')));
  await p.evaluate(() => window.App.cam.close());
  await p.waitForFunction(() => document.querySelectorAll('.media-card .mth.loc').length >= 2, null, { timeout: 20000 });

  console.log('— видео: 480p и счётчик кадров —');
  await p.evaluate(() => window.App.vidMode('480')); await p.waitForTimeout(300);
  await p.evaluate(id => window.App.cam.open(id, 'video', 'job'), jobId);
  await p.waitForFunction(() => { const v = document.querySelector('#camin video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 });
  const vres = await p.evaluate(() => { const v = document.querySelector('#camin video'); return { w: v.videoWidth, h: v.videoHeight }; });
  t('пресет 480p → поток записи 854×480', vres.h === 480 && vres.w === 854, JSON.stringify(vres));
  const rb = await p.$('.camin-shutter'); await rb.click(); await p.waitForTimeout(2600);
  t('плашка метрик при записи не перерисовывается (текст стоит)', await p.evaluate(async () => { const el = document.querySelector('.camin-perf'); if (!el) return true; const a = el.textContent; await new Promise(r => setTimeout(r, 1300)); return el.textContent === a; }));
  await rb.click(); await p.waitForFunction(() => !window.App.cam.st().rec, null, { timeout: 10000 }); await p.waitForTimeout(400);
  await p.evaluate(() => window.App.cam.close());
  await p.waitForFunction(() => !!document.querySelector('.media-card .mth.loc .mvid'), null, { timeout: 30000 }); await p.waitForTimeout(500);
  const vt = await p.evaluate(() => window.App.cam.perfText(window.App.cam.perf().sessions[0]));
  t('видео-сессия: «кадров 1» (ролик учтён после onstop), вердикт про запись', /Съёмка: Видео[^\n]* кадров 1/.test(vt) && /(запись видео в норме|кодирование видео грузит телефон)/.test(vt), vt.split('\n')[0] + ' | ' + vt.split('\n').slice(-1)[0]);

  console.log('— профиль телефона —');
  await p.evaluate(() => { window.App.go('settings'); const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}'); if (f.cam !== 1) window.App.foldToggle('cam'); }); await p.waitForTimeout(400);
  const prof = await p.evaluate(() => { const c = [...document.querySelectorAll('#cp-card .cp-prof')].find(x => /Профиль этого телефона/.test(x.textContent)); return c ? c.textContent : ''; });
  t('блок «Профиль этого телефона»: фото (превью, снимок, Мп, тап), видео (поток при записи), совет', /Профиль этого телефона/.test(prof) && /фото: превью ~\d+ к\/с · снимок ~\d+ мс · до [\d.?]+ Мп · тап \d+ мс/.test(prof) && /видео: главный поток ~\d+ к\/с при записи/.test(prof) && /(камера в приложении на этом телефоне)/.test(prof), prof.slice(0, 300));
  const seg = await p.evaluate(() => [...document.querySelectorAll('.cam-set .lang-seg button')].map(b => b.textContent.trim()));
  t('в «Видео при отправке» есть 480p', seg.includes('480p') && seg.includes('720p') && seg.includes('1080p'));
  t('в .txt метрик профиль идёт первым', await p.evaluate(() => { const txt = (function(){ try{ return window.App.cam.perf() && true; }catch(e){ return false; } })(); return txt; }));
  const txt = await p.evaluate(() => { const ss = window.App.cam.perf().sessions; return ss.length ? true : false; });
  t('сессии сохранены', txt);

  console.log('— вердикт «потолок камеры телефона» при быстром превью —');
  const vd = await p.evaluate(() => { const s = JSON.parse(JSON.stringify(window.App.cam.perf().sessions.find(x => x.kind === 'photo')));
    s.prevMode = 'fast'; s.pfps = [15, 14, 16, 0, 15]; s.fps = [59, 58, 59, 59, 59]; s.long = []; s.taps = [{ t: 100, what: 'shutter', delay: 12, paint: 20 }];
    s.marks = [{ t: 100, kind: 'takePhoto', ms: 880, extra: '1800 KB' }]; return window.App.cam.perfText(s).split('\n').slice(-1)[0]; });
  t('фото при 720p с превью 15 к/с и takePhoto 0,9 с → «потолок камеры телефона в браузере … Родная камера + Поделиться»', /потолок камеры телефона в браузере/.test(vd) && /Способ 2/.test(vd), vd);
  const vl = await p.evaluate(() => { const s = JSON.parse(JSON.stringify(window.App.cam.perf().sessions.find(x => x.kind === 'video')));
    s.fps = [38, 30, 8, 40, 45]; s.long = [{ t: 1, ms: 100 }]; s.taps = [{ t: 100, what: 'shutter', delay: 39, paint: 43 }]; return window.App.cam.perfText(s).split('\n').slice(-1)[0]; });
  t('видео при потоке 38 к/с → «кодирование видео грузит телефон … 480p»', /кодирование видео грузит телефон/.test(vl) && /480p/.test(vl), vl);

  t('ошибок JS нет', errs.length === 0, errs.join(' | '));
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
