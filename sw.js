// ═══════════════════════════════════════════════════════════════
// ICFSN 2026 法國・摩納哥旅遊 — Service Worker
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'icfsn2026-v39';
const RUNTIME_CACHE = 'icfsn2026-runtime-v39';

// 安裝時預先快取的核心資源
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  // React / Babel CDN（離線備用）
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
];

// ── Install ──────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => !allowedCaches.includes(name))
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 只處理 GET 請求
  if (request.method !== 'GET') return;

  // API 請求（Anthropic）→ Network only，不快取
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // 核心 HTML → Network first，失敗時回退快取（確保拿到最新版）
  if (request.mode === 'navigate' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 靜態資源（圖示、manifest）→ Cache first
  if (
    url.pathname.match(/\.(png|svg|ico|json|webp|jpg|jpeg|gif|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // CDN JS 資源 → Stale-while-revalidate
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // 其餘請求 → Network first，失敗回快取
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Background Sync（預留）────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-diary') {
    // 日記離線同步（可擴充）
    console.log('[SW] Background sync: diary');
  }
});

// ── Push Notifications（預留）────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'ICFSN 2026', {
      body: data.body || '旅遊提醒',
      icon: './icon-192.png',
      badge: './icon-192.png',
    })
  );
});
