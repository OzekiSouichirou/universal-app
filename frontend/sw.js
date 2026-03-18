const CACHE_NAME = 'polonix-v0.7.3';
const OFFLINE_URL = '/offline.html';
const STATIC_ASSETS = [
  '/home.html', '/board.html', '/calendar.html', '/timetable.html',
  '/profile.html', '/feedback.html',
  '/css/style.css',
  '/js/auth.js', '/js/home.js', '/js/board.js', '/js/calendar.js',
  '/js/timetable.js', '/js/profile.js', '/js/feedback.js',
  '/offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match(OFFLINE_URL))
      )
  );
});
