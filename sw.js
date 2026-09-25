/* TechLog service worker */
const VERSION = '1.09.55';
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
  './vendor/supabase.umd.js',      // v1.09.12: офлайн-запуск — библиотеки свои, не с CDN
  './vendor/jspdf.umd.min.js',
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/images/marker-icon.png',
  './vendor/images/marker-icon-2x.png',
  './vendor/images/marker-shadow.png',
  './vendor/fonts/nunito-cyrillic.woff2',   // v1.09.55: свой шрифт — офлайн и с первой секунды
  './vendor/fonts/nunito-latin.woff2',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-64.png',
  './icons/badge-96.png',
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
      /* v1.09.12: <link>/<script> без crossorigin дают «непрозрачный» ответ (status 0, ok=false) —
         раньше он в кэш не попадал вовсе, и шрифт с CDN офлайн не поднимался */
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});

/* v1.08.33: Web Push. v1.09.22: данные {title, body, url, kind, tag, lines[], n, ts}.
   · СТОПКА: всё с одинаковым tag (личная переписка с одним человеком, одна группа, общий чат) складывается в ОДНО
     уведомление — «Иван (3)» и последние строки, как в привычных мессенджерах; новое сообщение звучит заново (renotify).
   · ЗНАЧОК: счётчик непрочитанных пушей чата живёт в IndexedDB воркера и ставится на значок приложения даже при
     закрытом TechLog; приложение при открытии ставит точное число само.
   · ЖУРНАЛ: время и вид последнего полученного пуша — для экрана «Доставка уведомлений».
   · КНОПКИ: «Открыть» и «Закрыть» (Android, ПК; на iPhone кнопок в веб-уведомлениях нет). */
function tlIdb(){ return new Promise((res, rej) => { const r = indexedDB.open('techlog-push', 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function tlKvGet(k){ try{ const db = await tlIdb(); return await new Promise((res) => { const q = db.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => { db.close(); res(q.result); }; q.onerror = () => { db.close(); res(undefined); }; }); }catch(e){ return undefined; } }
async function tlKvSet(k, v){ try{ const db = await tlIdb(); await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); db.close(); }catch(e){} }
async function tlBadge(delta, abs){
  let n = abs != null ? abs : ((+(await tlKvGet('badge')) || 0) + delta); if (!(n > 0)) n = 0;
  await tlKvSet('badge', n);
  try{ if (self.navigator && self.navigator.setAppBadge){ if (n) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge(); } }catch(e){}
  return n;
}
/* чистая функция стопки — её же проверяет автотест: прежние строки + новые, не больше шести, счётчик суммируется */
function tlStack(prevData, d){
  let lines = Array.isArray(d.lines) && d.lines.length ? d.lines.map(String) : [String(d.body || '')], count = +d.n || lines.length;
  if (prevData){ lines = (Array.isArray(prevData.lines) ? prevData.lines : []).concat(lines).slice(-6); count += (+prevData.count || 0); }
  const base = String(d.title || 'TechLog').replace(/\s\(\d+\)$/, '');
  return { lines, count, title: count > 1 ? base + ' (' + count + ')' : base, body: lines.slice(-5).join('\n') };
}
/* v1.09.38: значок уведомления. badge (маленький в строке состояния Android) — ТОЛЬКО одноцветный силуэт на прозрачном фоне:
   Android берёт у картинки одну прозрачность, и цветная квадратная иконка превращалась в белый квадрат — «иконки нет».
   Большая иконка — полным адресом от области воркера: так её находит и уведомление, показанное без открытого окна. */
const TL_ICON = new URL('./icons/icon-192.png', self.registration.scope).href;
const TL_BADGE = new URL('./icons/badge-96.png', self.registration.scope).href;
async function tlShowPush(d){
  const tag = String(d.tag || ('techlog-' + (d.title || ''))), chat = d.kind === 'chat';
  let prevData = null;
  if (chat){ try{ const prev = await self.registration.getNotifications({ tag }); if (prev && prev.length){ prevData = prev[0].data || {}; prev.forEach(n => n.close()); } }catch(e){} }
  const st = chat ? tlStack(prevData, d) : { lines: [String(d.body || '')], count: 1, title: String(d.title || 'TechLog'), body: String(d.body || '') };
  const opts = { body: st.body, icon: TL_ICON, badge: TL_BADGE, tag, renotify: true,
    timestamp: +d.ts || Date.now(), data: { url: d.url || './', kind: d.kind || '', lines: st.lines, count: st.count, tag },
    actions: [{ action: 'open', title: 'Открыть' }, { action: 'close', title: 'Закрыть' }] };
  try{ await self.registration.showNotification(st.title, opts); }
  catch(e){ delete opts.actions; await self.registration.showNotification(st.title, opts); }        // платформа без кнопок
}
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_e) { d = { title: 'TechLog', body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    await tlKvSet('last', { at: Date.now(), kind: d.kind || '', title: String(d.title || '').slice(0, 80), url: d.url || '' });
    let list = []; try{ list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }catch(_e){}
    /* v1.09.13: открытому приложению пуш показываем и внутри (подсказка + «Открыть день / документ / чат») */
    list.forEach((c) => { try { c.postMessage({ type: 'PUSH', title: d.title || '', body: d.body || '', url: d.url || './', kind: d.kind || '' }); } catch (_e) {} });
    if (d.kind === 'chat' && !list.some(c => c.visibilityState === 'visible')) await tlBadge(+d.n || 1);
    /* v1.09.23 (ревью): TechLog открыт и в фокусе — сообщение чата уже показано подсказкой внутри приложения, системное
       уведомление поверх него — лишний шум (так же ведут себя мессенджеры). Остальные виды уведомлений и любые пуши на
       iPhone показываются ВСЕГДА: iOS отзывает подписку у «тихих» пушей, а Chrome требует уведомление, когда окно не в фокусе. */
    const ios = /iPhone|iPad|iPod/.test((self.navigator && self.navigator.userAgent) || '');
    if (d.kind === 'chat' && !ios && list.some(c => c.focused && c.visibilityState === 'visible')) return;
    await tlShowPush(d);
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'close') return;
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    /* v1.09.13: у живого окна страница не перезагружается — ссылку (?day=… / ?doc=… / ?chat=…) отдаём ему сообщением */
    for (const c of list) { if ('focus' in c) { try { c.postMessage({ type: 'OPEN_URL', url }); } catch (_e) {} return c.focus(); } }
    return clients.openWindow(url);
  }));
});
/* v1.09.22: браузер сам сменил адрес подписки (бывает после обновлений и чисток) — раньше пуши молча умирали навсегда.
   Подписываемся заново тем же ключом и помечаем «нужно передать серверу»: у воркера нет входа пользователя, поэтому
   новый адрес отправит приложение при ближайшем запуске (pbSyncSub). Открытым окнам сообщаем сразу. */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try{
      const key = (e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey) || (await tlKvGet('vapid'));
      if (key) await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await tlKvSet('resub', { at: Date.now(), old: e.oldSubscription ? e.oldSubscription.endpoint : '' });
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => { try { c.postMessage({ type: 'PUSH_RESUB' }); } catch (_e) {} });
    }catch(_e){}
  })());
});
/* приложение сообщает воркеру точное число непрочитанного и ключ подписки; отдаёт журнал последнего пуша */
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'BADGE') e.waitUntil(tlBadge(0, +m.n || 0));
  if (m.type === 'VAPID' && m.key) e.waitUntil(tlKvSet('vapid', m.key));
  if (m.type === 'PUSH_LAST' && e.ports && e.ports[0]) e.waitUntil((async () => { e.ports[0].postMessage({ last: await tlKvGet('last'), resub: await tlKvGet('resub'), badge: await tlKvGet('badge') }); })());
});
