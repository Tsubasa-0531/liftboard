// sw.js — Service Worker（独立アプリ版のみ）。
// 1) プッシュ通知の受信と表示 2) オフラインでも画面が開くようにアプリ本体をキャッシュ。
// キャッシュは「ネット優先」：更新を公開すると次に開いたとき最新版になる。
const CACHE = 'liftboard-v3';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/calc.js', 'js/catalog.js', 'js/body.js', 'js/store.js',
  'js/store-supabase.js', 'js/config.js', 'js/coach.js', 'js/programs.js', 'js/demo.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // DB通信は素通し
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Lift Board', {
    body: d.body || '', tag: d.tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { w.navigate(target).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
