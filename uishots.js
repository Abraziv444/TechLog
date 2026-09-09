/* =====================================================================
   TechLog · uishots.js — «Снимки всех экранов» (v1.08.07)
   ---------------------------------------------------------------------
   Автоматический прогон по всем страницам приложения со снимками экрана.
   Всё складывается в ZIP и СРАЗУ уходит в загрузки браузера: ничего не
   отправляется ни в приложение, ни в базу, ни на Диск — файл живёт только
   на устройстве.

   Как снимается картинка. В браузере нет способа «сфотографировать» свою
   страницу из JavaScript: html2canvas и подобные перерисовывают вёрстку
   заново и врут в мелочах. Поэтому берём настоящий кадр — через
   getDisplayMedia: один раз спрашиваем разрешение и выбираем «эта
   вкладка», дальше кадры снимаются молча. Если страница выше окна,
   прокручиваем её и склеиваем полосы на одном холсте — получается снимок
   всего содержимого, а не только видимой части.

   Если пользователь откажет в доступе к экрану, прогон всё равно
   состоится: в архив попадут сведения об окружении и размеры содержимого
   каждой страницы, только без картинок.

   ZIP собираем руками, без библиотек: метод «без сжатия» (PNG и так сжат),
   локальные заголовки + центральный каталог + CRC-32.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- ZIP без сжатия ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF;
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0, now = new Date();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, sum = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true);                                  // без сжатия
      lh.setUint16(10, dosTime(now), true); lh.setUint16(12, dosDate(now), true);
      lh.setUint32(14, sum, true); lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime(now), true); ch.setUint16(14, dosDate(now), true);
      ch.setUint32(16, sum, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    var cSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  /* ---------- снимок экрана ---------- */
  var stream = null, video = null;
  function stopStream() {
    try { (stream ? stream.getTracks() : []).forEach(function (t) { t.stop(); }); } catch (e) {}
    stream = null; video = null;
  }
  function startStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia)
      return Promise.reject(new Error('браузер не умеет снимать экран'));
    return navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 30 }, audio: false, preferCurrentTab: true
    }).then(function (s) {
      stream = s;
      video = document.createElement('video');
      video.srcObject = s; video.muted = true; video.playsInline = true;
      return video.play().then(function () {
        return new Promise(function (r) { setTimeout(r, 350); });   // пусть кадр устоится
      });
    });
  }
  function grab() {                        // один кадр видимой части
    var w = video.videoWidth, h = video.videoHeight;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(video, 0, 0, w, h);
    return c;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Снимок ВСЕГО содержимого: прокручиваем и склеиваем полосы */
  function shotFull(maxSlices) {
    var docH = document.documentElement.scrollHeight;
    var winH = window.innerHeight;
    var slices = Math.min(maxSlices || 6, Math.max(1, Math.ceil(docH / winH)));
    var y0 = window.scrollY, out = null, ctx = null, scale = 1, i = 0;
    return next();
    function next() {
      window.scrollTo(0, i * winH);
      return wait(260).then(function () {
        var c = grab();
        if (!out) {
          scale = c.height / winH;                       // экранных пикселей на CSS-пиксель
          out = document.createElement('canvas');
          out.width = c.width;
          out.height = Math.round(Math.min(docH, slices * winH) * scale);
          ctx = out.getContext('2d');
        }
        var top = Math.round(i * winH * scale);
        var left = Math.max(0, Math.min(docH - winH, i * winH) - i * winH) * scale;
        ctx.drawImage(c, 0, top - left);
        if (++i < slices) return next();
        window.scrollTo(0, y0);
        return out;
      });
    }
  }
  function png(canvas) {
    return new Promise(function (res) {
      canvas.toBlob(function (b) {
        if (!b) return res(null);
        b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); });
      }, 'image/png');
    });
  }

  /* ---------- обход страниц ---------- */
  function A() { return window.App || {}; }
  function screensList() {
    try {
      return [].slice.call(document.querySelectorAll('.tabbar .tab')).map(function (b) {
        var m = /App\.go\('([^']+)'\)/.exec(b.getAttribute('onclick') || '');
        return m ? m[1] : null;
      }).filter(Boolean);
    } catch (e) { return ['home']; }
  }
  function dirTabs() {
    try {
      return [].slice.call(document.querySelectorAll('#dir-tabs .tabbtn')).map(function (b) {
        var m = /App\.dirTab\('([^']+)'\)/.exec(b.getAttribute('onclick') || '');
        return m ? { id: m[1], name: (b.textContent || '').trim() } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }
  function envText(pages) {
    var d = document.documentElement, n = navigator;
    var L = [];
    L.push('TechLog · снимки всех экранов');
    L.push('снято: ' + new Date().toISOString());
    L.push('версия приложения: ' + (window.APP_VERSION || '—'));
    L.push('');
    L.push('— браузер и устройство —');
    L.push('userAgent: ' + n.userAgent);
    L.push('платформа: ' + (n.userAgentData && n.userAgentData.platform || n.platform || '—') +
           ' · язык: ' + (n.language || '—') + ' · ядер: ' + (n.hardwareConcurrency || '—') +
           ' · память: ' + (n.deviceMemory ? n.deviceMemory + ' ГБ' : '—'));
    L.push('окно: ' + innerWidth + '×' + innerHeight + ' · экран: ' + screen.width + '×' + screen.height +
           ' · dpr: ' + (devicePixelRatio || 1) + ' · ориентация: ' + (innerWidth > innerHeight ? 'альбомная' : 'книжная'));
    L.push('режим: ' + (d.classList.contains('tl-desktop') ? 'ПК' : 'телефон') +
           ' · шрифт: ' + getComputedStyle(d).fontSize +
           ' · тема: ' + (matchMedia('(prefers-color-scheme: dark)').matches ? 'тёмная' : 'светлая'));
    L.push('');
    L.push('— страницы —');
    pages.forEach(function (p) {
      L.push(p.file + '  ·  ' + p.label +
             '  ·  содержимое ' + p.w + '×' + p.h + ' px' +
             (p.shot ? ('  ·  снимок ' + p.px) : '  ·  без снимка'));
    });
    return L.join('\n');
  }

  /* ---------- главный прогон ---------- */
  function runShots(onStep) {
    var A0 = A(), files = [], pages = [], back = (A0.curScreen && A0.curScreen()) || 'home';
    var withShots = false;
    var enc = new TextEncoder();
    var stops = [];

    screensList().forEach(function (scr) {
      stops.push({ label: scr, go: function () { A0.go(scr); } });
    });

    return startStream()
      .then(function () { withShots = true; })
      .catch(function (e) { withShots = false; try { console.warn('снимки недоступны:', e && e.message); } catch (e2) {} })
      .then(function () {
        /* вкладки справочников добираем уже на месте */
        try { A0.go('dirs'); } catch (e) {}
        return wait(260);
      })
      .then(function () {
        dirTabs().forEach(function (tb) {
          stops.push({ label: 'справочник · ' + tb.name,
                       go: function () { A0.go('dirs'); A0.dirTab(tb.id); } });
        });
        return stops.reduce(function (p, st, idx) {
          return p.then(function () {
            if (onStep) onStep(st.label, idx + 1, stops.length);
            try { st.go(); } catch (e) {}
            return wait(320).then(function () {
              var w = document.documentElement.scrollWidth, h = document.documentElement.scrollHeight;
              var file = String(idx + 1).padStart(2, '0') + '-' +
                         st.label.replace(/[^\wа-яА-Я.-]+/g, '-').slice(0, 40);
              if (!withShots) { pages.push({ file: file + ' (без снимка)', label: st.label, w: w, h: h, shot: false }); return; }
              return shotFull(6).then(function (canvas) {
                return png(canvas).then(function (bytes) {
                  if (!bytes) { pages.push({ file: file, label: st.label, w: w, h: h, shot: false }); return; }
                  files.push({ name: file + '.png', data: bytes });
                  pages.push({ file: file + '.png', label: st.label, w: w, h: h, shot: true,
                               px: canvas.width + '×' + canvas.height });
                });
              });
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        stopStream();
        try { A0.go(back); } catch (e) {}
        files.unshift({ name: 'info.txt', data: enc.encode(envText(pages)) });
        var blob = zip(files);
        var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'techlog-shots-' + stamp + '.zip';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
        return { pages: pages.length, shots: files.length - 1, bytes: blob.size, withShots: withShots };
      })
      .catch(function (e) {
        stopStream();
        try { A0.go(back); } catch (e2) {}
        throw e;
      });
  }

  window.UIShots = { run: runShots, zip: zip, crc32: crc32 };
})();
