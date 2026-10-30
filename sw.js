/* GharSansar service worker.
 * Bump VERSION on every release: old caches are deleted on activate so returning visitors never stay on an old UI.
 * - HTML / CSS / JS / JSON catalogue: network-first (always fresh when online, cached copy when offline).
 * - Product photos and brand assets: stale-while-revalidate (fast, and replaced photos refresh in the background).
 */
const VERSION = 'v3-20261029';
const CORE_CACHE = `gharsansar-core-${VERSION}`;
const MEDIA_CACHE = `gharsansar-media-${VERSION}`;
const MAX_MEDIA_ENTRIES = 260;

const CRITICAL_FILES = ['./', './index.html', './css/styles.css', './js/app.js', './data/products.json', './data/categories.json'];
const OPTIONAL_FILES = [
  './data/image-index.json',
  './manifest.webmanifest',
  './assets/brand/logo.svg',
  './assets/brand/product-placeholder.svg',
  './assets/brand/icons/icon-192.png',
  './assets/brand/icons/icon-512.png',
  './assets/banners/gharsansar-hero.svg',
  './assets/banners/mini-diya.svg',
  './assets/categories/home-living.svg',
  './assets/categories/artificial-jewellery.svg',
  './assets/categories/gifts-hampers.svg',
  './assets/categories/festive-decor.svg',
];
const abs = path => new URL(path, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(CRITICAL_FILES.map(abs));                       // install fails (and retries) if the app shell can't be cached
    await Promise.allSettled(OPTIONAL_FILES.map(path => cache.add(abs(path))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([CORE_CACHE, MEDIA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => (n.startsWith('gharsansar-') || n.startsWith('aangan-finds-')) && !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}
async function staleWhileRevalidate(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async response => {
    if (response && response.ok && response.status === 200) {
      await cache.put(request, response.clone());
      trimCache(cache);
    }
    return response;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}
async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_MEDIA_ENTRIES) await Promise.all(keys.slice(0, keys.length - MAX_MEDIA_ENTRIES).map(k => cache.delete(k)));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                      // fonts and other third-party requests go straight to the network
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CORE_CACHE, abs('./index.html')));
    return;
  }
  const path = url.pathname;
  if (/\/(data\/.*\.json|css\/.*\.css|js\/.*\.js)$/.test(path) || path.endsWith('/manifest.webmanifest')) {
    event.respondWith(networkFirst(request, CORE_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
