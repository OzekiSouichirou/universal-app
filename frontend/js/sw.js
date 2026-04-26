const CACHE_NAME  = 'polonix-v0.9.9';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/css/style.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => null))
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

  // JS/CSS/HTMLは常にネットワーク優先（キャッシュしない・オフライン時のみフォールバック）
  if (url.pathname.match(/\.(js|css|html)$/) || url.pathname === '/') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then(cached => cached || caches.match(OFFLINE_URL))
      )
    );
    return;
  }

  // それ以外（画像など）はCache First
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
