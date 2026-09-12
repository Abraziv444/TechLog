/* v1.08.47 — сжатие видео, политика доставки, копия в «Загрузки».
   Запуск: node tests/v1_08_47.js [порт] (демо-режим, сервер уже поднят).
   E2E сжатия гоняется по-настоящему: исходный mp4 собирается прямо в
   странице (VideoEncoder + vendor/mp4-muxer), затем скармливается тому же
   mVidShrink, что работает в очереди. В headless-сборке без H.264 лестница
   кодеков опускается на VP9 — это тоже штатная ступень. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8156;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 414, height: 850 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', 'mobile'); });
  await p.reload(); await p.waitForTimeout(1300);

  console.log('— настройки: «Видео при отправке» и «Копия в Загрузки» —');
  {
    await p.evaluate(() => { window.App.go('settings');
      const f = JSON.parse(localStorage.getItem('techlog_fold') || '{}');
      if (!f.cam) window.App.foldToggle && window.App.foldToggle('cam'); });
    await p.waitForTimeout(600);
    const ui = await p.evaluate(() => {
      const seg = [...document.querySelectorAll('#app .cam-seg')]
        .find(s => s.querySelector('[onclick*="vidMode"]'));
      return {
        seg: !!seg,
        test: !!document.querySelector('#app [onclick="App.vidTest()"]'),
        copy: !!document.querySelector('#app input[onchange*="copyDl"]'),
        on1080: seg && (seg.querySelector('.on') || {}).textContent,
      };
    });
    t('сег «Как снято / 1080p / 720p» на месте, активен 1080p',
      ui.seg && /1080/.test(ui.on1080 || ''), JSON.stringify(ui));
    t('кнопка «Проверить сжатие» и галочка копии на месте', ui.test && ui.copy, JSON.stringify(ui));
    await p.evaluate(() => {
      [...document.querySelectorAll('#app .cam-seg [onclick*="vidMode"]')]
        .find(b => /720/.test(b.textContent)).click();
    });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => localStorage.getItem('techlog_vid_mode'));
    t('клик 720p запоминается на устройстве', m === '720', m);
    await p.evaluate(() => {
      const c = document.querySelector('#app input[onchange*="copyDl"]');
      c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(300);
    const cd = await p.evaluate(() => localStorage.getItem('techlog_copy_dl'));
    t('галочка копии выключается', cd === '0', cd);
    await p.evaluate(() => { localStorage.setItem('techlog_vid_mode', '1080');
      localStorage.setItem('techlog_copy_dl', '1'); });
  }

  console.log('— политика доставки (крючки) —');
  {
    const r = await p.evaluate(() => {
      const mk = (kind, kb) => ({ kind, blob: new Blob([new Uint8Array(kb * 1024)]) });
      const out = {};
      localStorage.removeItem('techlog_relay_day');
      out.smallPhoto = window.App._mt.relayOk(mk('photo', 100));
      out.bigPhoto = window.App._mt.relayOk(mk('photo', 400));
      out.video = window.App._mt.relayOk(mk('video', 100));
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('techlog_relay_day', JSON.stringify({ d: today, n: 10 }));
      out.capped = window.App._mt.relayOk(mk('photo', 100));
      localStorage.setItem('techlog_relay_day', JSON.stringify({ d: today, n: 9 }));
      out.ninth = window.App._mt.relayOk(mk('photo', 100));
      localStorage.removeItem('techlog_relay_day');
      return out;
    });
    t('фото ≤250 КБ — посредник разрешён', r.smallPhoto === true, JSON.stringify(r));
    t('крупное фото — только напрямую', r.bigPhoto === false);
    t('видео — только напрямую, всегда', r.video === false);
    t('10 фото за день ушло — посредник закрыт', r.capped === false);
    t('девять ушло — десятое ещё можно', r.ninth === true);
  }

  console.log('— копия в «Загрузки» —');
  {
    const dl = new Promise(res => p.once('download', d => res(d.suggestedFilename())));
    await p.evaluate(() => window.App._mt.saveCopy(
      new File([new Uint8Array(2048)], 'IMG_x.jpg', { type: 'image/jpeg' })));
    const name = await Promise.race([dl, new Promise(r => setTimeout(() => r(null), 4000))]);
    t('файл уезжает в загрузки с именем TL_дата_время.jpg',
      !!name && /^TL_\d{8}_\d{6}\.jpg$/.test(name), name);
  }

  console.log('— сжатие: живой прогон через воркер —');
  {
    const res = await p.evaluate(async () => {
      /* исходник собираем сами: VideoEncoder → mp4-muxer (vp9, 320×240) */
      const src = await (await fetch('vendor/mp4-muxer.js')).text();
      const MX = new Function(src + '; return Mp4Muxer;')();
      const cfgs = [
        { codec: 'avc1.42001f', mux: 'avc', avc: { format: 'avc' } },
        { codec: 'vp09.00.10.08', mux: 'vp9' },
      ];
      let pick = null;
      for (const c of cfgs){
        try{ const s = await VideoEncoder.isConfigSupported({ codec: c.codec,
          width: 320, height: 240, bitrate: 400000, framerate: 15 });
          if (s.supported){ pick = c; break; } }catch(e){}
      }
      if (!pick) return { skip: 'no encoder in this build' };
      const target = new MX.ArrayBufferTarget();
      const mux = new MX.Muxer({ target, fastStart: 'in-memory',
        video: { codec: pick.mux, width: 320, height: 240 } });
      const enc = new VideoEncoder({
        output: (ch, meta) => mux.addVideoChunk(ch, meta),
        error: e => { throw e; } });
      const ec = { codec: pick.codec, width: 320, height: 240,
        bitrate: 400000, framerate: 15 };
      if (pick.avc) ec.avc = pick.avc;
      enc.configure(ec);
      const cv = new OffscreenCanvas(320, 240), g = cv.getContext('2d');
      for (let i = 0; i < 16; i++){
        g.fillStyle = `hsl(${i * 22},70%,50%)`; g.fillRect(0, 0, 320, 240);
        g.fillStyle = '#fff'; g.fillRect(10 + i * 15, 100, 40, 40);
        const vf = new VideoFrame(cv, { timestamp: i * 66666, duration: 66666 });
        enc.encode(vf, { keyFrame: i === 0 }); vf.close();
      }
      await enc.flush(); mux.finalize();
      const srcBlob = new Blob([target.buffer], { type: 'video/mp4' });
      const pcts = [];
      const r = await window.App._mt.shrink({ blob: srcBlob, dur: 1 }, x => pcts.push(x));
      let sig = '';
      if (r && r.blob){
        const head = new Uint8Array(await r.blob.slice(4, 8).arrayBuffer());
        sig = String.fromCharCode(...head);
      }
      return { srcKb: Math.round(srcBlob.size / 1024), out: r && r.blob ? r.blob.size : 0,
               skipFlag: !!(r && r.skip), err: r && r.err, sig, pcts: pcts.length };
    });
    if (res.skip){
      console.log('  (в этой сборке нет ни одного кодировщика — пропуск, ' + res.skip + ')');
    } else {
      t('пережатый файл получен и это mp4 (ftyp)',
        res.out > 500 && res.sig === 'ftyp', JSON.stringify(res));
      t('сжатие не «упало» и не потеряло данные', !res.err, res.err);
    }
  }

  console.log('— сжатие: битый файл не роняет приложение —');
  {
    const r = await p.evaluate(async () => {
      const bad = new Blob([new Uint8Array(4096).fill(7)], { type: 'video/mp4' });
      const out = await window.App._mt.shrink({ blob: bad, dur: 1 }, () => {});
      return { err: !!(out && out.err), blob: !!(out && out.blob) };
    });
    t('мусор на входе → аккуратный {err}, оригинал остаётся', r.err && !r.blob, JSON.stringify(r));
  }

  console.log('— самопроверка кнопкой —');
  {
    await p.evaluate(() => window.App.vidTest());
    let toast = '';
    for (let i = 0; i < 60; i++){
      await p.waitForTimeout(500);
      toast = await p.evaluate(() => (document.getElementById('toasts') || {}).textContent || '');
      if (/Сжатие работает|Сжатие недоступно|webm/i.test(toast)) break;
    }
    t('самопроверка отчиталась тостом', /Сжатие работает|Сжатие недоступно|webm/i.test(toast),
      toast.slice(0, 80));
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
