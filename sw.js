// Civil News Hub Service Worker (PWA Offline & Instant Load Support)
const CACHE_NAME = 'civil-news-hub-v1.1.97';
const STATIC_ASSETS = [
  './',
  './index.html',
  './mobile.html',
  './static/cnh_data_bundle.js',
  './static/data_adapter.js',
  './static/cnh_chat_core.js',
  './static/cnh_chatbot.js',
  './static/favicon.svg',
  './static/ai_robot_avatar.png',
  './static/ai_robot_head_only.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache prefetch error:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 로컬 개발 환경(localhost / 127.0.0.1)에서는 캐시를 무조건 우회하여 실시간 로컬 파일 즉시 반영
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 데이터(json/api) 요청: 네트워크 우선 (최신성 유지), 실패 시 캐시 폴백
  if (url.pathname.includes('/data/') || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // HTML 네비게이션 요청: 네트워크 우선 (항상 최신 DOM 및 스크립트 버전 즉시 반영), 오프라인 시에만 캐시 폴백
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '/mobile') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 정적 자산: 캐시 우선 (초고속 렌더링), 부재 시 네트워크 fetch
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 백그라운드에서 캐시 갱신 (stale-while-revalidate)
        fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkRes));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request);
    })
  );
});
