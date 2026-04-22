const CACHE_NAME  = 'polonix-v0.9.7';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/css/style.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // 外部オリジン・APIはスルー
  if (url.origin !== location.origin) return;
  if (url.hostname.includes('ondigitalocean.app')) return;
  if (url.hostname.startsWith('api.')) return;

  // JSファイルはキャッシュしない（?v=N で管理）
  if (url.pathname.endsWith('.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network First: 成功したレスポンスをキャッシュ、失敗時にフォールバック
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, copy))
            .catch(() => { /* キャッシュ失敗は無視 */ });
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match(OFFLINE_URL))
      )
  );
});
