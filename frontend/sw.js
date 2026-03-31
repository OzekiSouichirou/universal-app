const CACHE_NAME = 'polonix-v0.9.0';
const OFFLINE_URL = '/offline.html';

// キャッシュする静的アセット（JSはクエリ付きで管理するためキャッシュしない）
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/css/style.css',
];

// install: 必要最小限のキャッシュのみ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// activate: 古いキャッシュを全削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// fetch: Network First戦略
// JSファイル(?v=N付き)は常にネットワークから取得
// その他はネットワーク優先、失敗時にキャッシュ
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // JSファイルはキャッシュしない（?v=Nで管理）
  if (url.pathname.endsWith('.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // APIリクエストはキャッシュしない
  if (url.pathname.startsWith('/api') || url.hostname.includes('onrender.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match(OFFLINE_URL))
      )
  );
});
