const CACHE = 'hesabu-shell-v5';
const OFFLINE_URL = '/offline.html';
const SHELL = ['/', '/index.html', '/manifest.json', '/hesabu-mark.svg', '/app-icon.svg', OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try { const response = await fetch(url, { cache: 'reload' }); if (response.ok) await cache.put(url, response); } catch {}
    }));
    // Cache the exact same-origin bundles referenced by the app document.
    try {
      const response = await fetch('/', { cache: 'reload' });
      if (response.ok) {
        await cache.put('/', response.clone());
        const html = await response.text();
        const paths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1]).filter((path) => path.startsWith('/') && !path.startsWith('//'));
        await Promise.all(paths.map(async (path) => {
          try { const asset = await fetch(path, { cache: 'reload' }); if (asset.ok) await cache.put(path, asset); } catch {}
        }));
      }
    } catch {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('hesabu-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache Supabase/API calls, authenticated data, or writes.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('/', response.clone());
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  // App bundles and local assets use cache-first with background refresh.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    return (await refresh) || Response.error();
  })());
});
