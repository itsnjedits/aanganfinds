/* GharSansar PWA cache — bump on each release. Product photos are optional until added to product_images/. */
const CACHE_NAME = 'gharsansar-v2-20261029';
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
  "./assets/brand/product-placeholder.svg",
  "./assets/brand/icons/icon-192.png",
  "./assets/brand/icons/icon-512.png",
  "./assets/banners/gharsansar-hero.svg",
  "./assets/banners/mini-diya.svg",
  "./assets/categories/home-living.svg",
  "./assets/categories/artificial-jewellery.svg",
  "./assets/categories/gifts-hampers.svg",
  "./assets/categories/festive-decor.svg"
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
    await Promise.all(names.filter(name => (name.startsWith('gharsansar-') || name.startsWith('aangan-finds-')) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/data/products.json') || url.pathname.endsWith('/data/categories.json') || url.pathname.endsWith('/data/image-index.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try { const response = await fetch(request); if (response.ok) cache.put(request, response.clone()); return response; }
      catch (error) { return (await cache.match(request)) || Response.error(); }
    })());
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { const response = await fetch(request); const cache = await caches.open(CACHE_NAME); if (response.ok) cache.put(request, response.clone()); return response; }
      catch (error) { const cache = await caches.open(CACHE_NAME); return (await cache.match(request)) || (await cache.match(new URL('./index.html', self.registration.scope).href)) || Response.error(); }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request); if (cached) return cached;
    try { const response = await fetch(request); if (response.ok) cache.put(request, response.clone()); return response; }
    catch (error) { return Response.error(); }
  })());
});
