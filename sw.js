/* Static PWA cache. Bump CACHE_NAME when shipping a new site version. */
const CACHE_NAME = 'aangan-finds-v1.2.0';
const APP_FILES = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./data/products.json",
  "./data/categories.json",
  "./data/image-index.json",
  "./manifest.webmanifest",
  "./assets/brand/logo.svg",
  "./assets/brand/icons/icon-192.png",
  "./assets/brand/icons/icon-512.png",
  "./assets/banners/diwali-hero.svg",
  "./assets/banners/mini-diya.svg",
  "./product_images/AF-JW-001-1.jpg",
  "./product_images/AF-JW-002-1.jpg",
  "./product_images/AF-JW-002-2.jpg",
  "./product_images/AF-JW-003-1.jpg",
  "./product_images/AF-JW-004-1.jpg",
  "./product_images/AF-JW-004-2.jpg",
  "./product_images/AF-JW-005-1.jpg",
  "./product_images/AF-JW-005-2.jpg",
  "./product_images/AF-JW-006-1.jpg",
  "./product_images/AF-JW-006-2.jpg",
  "./product_images/AF-JW-007-1.jpg",
  "./product_images/AF-JW-007-2.jpg",
  "./product_images/AF-JW-008-1.jpg",
  "./product_images/AF-JW-008-2.jpg",
  "./product_images/AF-JW-009-1.jpg",
  "./product_images/AF-JW-009-2.jpg",
  "./product_images/AF-JW-010-1.jpg",
  "./product_images/AF-JW-010-2.jpg",
  "./product_images/AF-JW-011-1.jpg",
  "./product_images/AF-JW-012-1.jpg",
  "./product_images/AF-JW-012-2.jpg",
  "./product_images/AF-JW-013-1.jpg",
  "./product_images/AF-JW-013-2.jpg",
  "./product_images/AF-JW-014-1.jpg",
  "./product_images/AF-JW-014-2.jpg",
  "./product_images/AF-JW-015-1.jpg",
  "./product_images/AF-JW-015-2.jpg",
  "./product_images/AF-JW-016-1.jpg",
  "./product_images/AF-JW-016-2.jpg",
  "./product_images/AF-JW-017-1.jpg",
  "./product_images/AF-JW-017-2.jpg",
  "./product_images/AF-JW-018-1.jpg",
  "./product_images/AF-JW-019-1.jpg",
  "./product_images/AF-JW-019-2.jpg",
  "./product_images/AF-JW-020-1.jpg",
  "./product_images/AF-JW-020-2.jpg",
  "./product_images/AF-JW-021-1.jpg",
  "./product_images/AF-JW-021-2.jpg",
  "./product_images/AF-JW-022-1.jpg",
  "./product_images/AF-JW-022-2.jpg",
  "./product_images/AF-JW-023-1.jpg",
  "./product_images/AF-JW-023-2.jpg",
  "./product_images/AF-JW-024-1.jpg",
  "./product_images/AF-JW-025-1.jpg",
  "./product_images/AF-JW-025-2.jpg",
  "./product_images/AF-JW-026-1.jpg",
  "./product_images/AF-JW-026-2.jpg",
  "./product_images/AF-JW-027-1.jpg",
  "./product_images/AF-JW-027-2.jpg",
  "./product_images/AF-JW-028-1.jpg",
  "./product_images/AF-JW-028-2.jpg",
  "./product_images/AF-JW-029-1.jpg",
  "./product_images/AF-JW-030-1.jpg",
  "./product_images/AF-JW-031-1.jpg",
  "./product_images/AF-JW-032-1.jpg",
  "./product_images/AF-JW-032-2.jpg",
  "./product_images/AF-JW-033-1.jpg",
  "./product_images/AF-JW-034-1.jpg",
  "./product_images/AF-JW-034-2.jpg"
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = APP_FILES.map(path => new URL(path, self.registration.scope).href);
    await cache.addAll(urls);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('aangan-finds-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Keep the product catalogue fresh when online, with the last cached version as fallback.
  if (url.pathname.endsWith('/data/products.json') || url.pathname.endsWith('/data/categories.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) || (await cache.match(new URL('./index.html', self.registration.scope).href)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});
