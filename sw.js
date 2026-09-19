/* TechLog service worker */
const VERSION = '1.09.06';
const CACHE = 'techlog-' + VERSION;
const CDN_CACHE = 'techlog-cdn-v1';
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './terms.html',
  './styles.css',
  './desktop.css',
  './compact.css',
  './app.js',
  './config.js',
  './ui.js',
  './viewmode.js',
  './desktop.js',
  './uidiag.js',
  './uishots.js',
  './proposal-tips.js',
  './vendor/mp4box.all.min.js',
  './vendor/mp4-muxer.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-64.png',
  './icons/apple-touch-icon-180.png',
  './dictionary/index.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    /* v1.07.50: cache:'reload' — ассеты новой версии всегда с сети, иначе
       HTTP-кэш хостинга (max-age=600) мог подложить старые файлы в кэш. */
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('techlog-') && k !== CACHE && k !== CDN_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((cl) => cl.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* v1.08.73: Web Share Target. Снял родной камерой → «Поделиться» → TechLog:
   система шлёт POST на ./share-target с файлами. Кладём их в IndexedDB
   tl-media/intake (то же хранилище, что и приёмник приложения) и ведём на
   оболочку с ?share=1 — приложение спросит, в какой документ положить.
   Страница при этом не ждёт камеру в фоне, выгружать нечего. */
const MDB_VER = 2;
function swIntakeDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('tl-media', MDB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'qid' });
      if (!d.objectStoreNames.contains('intake')) d.createObjectStore('intake', { keyPath: 'iid' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}
async function swIntakePut(rows) {
  const d = await swIntakeDb();
  await new Promise((res, rej) => {
    const tx = d.transaction('intake', 'readwrite'); const st = tx.objectStore('intake');
    rows.forEach((r) => st.put(r));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  d.close();
}
async function swShareTarget(req) {
  let n = 0;
  try {
    const fd = await req.formData();
    const files = fd.getAll('media').filter((f) => f && typeof f === 'object' && f.size > 0);
    const now = Date.now();
    const rows = files.map((f, i) => ({ iid: 'sh' + now.toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 7),
      src: 'share', doc: 'job', job_id: null, repair_id: null,
      kind: /^image\//.test(f.type) ? 'photo' : /^video\//.test(f.type) ? 'video' : 'file',
      file: f, name: f.name || '', type: f.type || '', cam: false, at: now }));
    if (rows.length) await swIntakePut(rows);
    n = rows.length;
  } catch (_e) { n = 0; }
  return Response.redirect(new URL('./index.html?share=1&n=' + n, self.location.href).href, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith(swShareTarget(req));
    return;
  }
  if (req.method !== 'GET') return;

  // version.json — только из сети. Фолбэк в кэш был мёртвым (файл не
  // прекэшится, а ?ts= всё равно не совпал бы) и прятал настоящую ошибку;
  // v1.08.43: честный провал — приложение называет причину само.
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Навигация: network-first, офлайн — из кеша.
  // v1.08.60: под ключ './index.html' кладём только саму оболочку. Раньше сюда
  // попадала любая навигация — в том числе учебник, открытый во <iframe>, и
  // privacy/terms — и офлайн вместо приложения мог подняться учебник.
  // Учебники (dictionary/) обслуживает своя ветка ниже.
  if (req.mode === 'navigate' && !url.pathname.includes('/dictionary/')) {
    const shell = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    const key = shell ? './index.html' : req;
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(key).then((hit) => hit || (shell ? undefined : caches.match('./index.html'))))
    );
    return;
  }

  // Свой JS/CSS: network-first (после деплоя код всегда свежий), офлайн — из кеша
  if (url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname)) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // v1.08.51: учебные файлы (dictionary/: каталог, тесты JSON, учебники) —
  // stale-while-revalidate: отдаём из кэша мгновенно (и офлайн), но в фоне
  // подтягиваем свежий файл — обновлённый тест доедет без смены версии.
  if (url.origin === self.location.origin && url.pathname.includes('/dictionary/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // Остальные свои статики (иконки, манифест): cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // CDN (supabase-js, jsPDF, шрифты): stale-while-revalidate
  if (/jsdelivr|cdnjs|gstatic|googleapis/.test(url.host)) {
    e.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});

/* v1.08.33: Web Push. Данные приходят JSON'ом {title, body, url}. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_e) { d = { title: 'TechLog', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'TechLog', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: d.url || './' },
    tag: 'techlog-' + (d.title || ''),
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
