const CACHE_PREFIX = 'hesabu-shell-';
const CACHE = CACHE_PREFIX + 'v7';
const OFFLINE_URL = '/offline.html';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/hesabu-mark.svg', '/app-icon.svg', OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async (path) => {
      try { const response = await fetch(path, { cache: 'reload' }); if (response.ok) await cache.put(path, response); } catch {}
    }));
    try {
      const response = await fetch('/', { cache: 'reload' });
      if (response.ok) {
        await cache.put('/', response.clone());
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map(match => match[1]).filter(path => path.startsWith('/') && !path.startsWith('//'));
        await Promise.all(assets.map(async path => {
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
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Authenticated business records and all writes stay outside the service-worker cache.
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
        return (await caches.match(request)) || (await caches.match('/')) ||
          (await caches.match(OFFLINE_URL)) || new Response('Hesabu is offline. Reconnect once to load the app.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  if (/.(?:js|css|svg|png|webp|woff2?)$/i.test(url.pathname) || url.pathname === '/manifest.json') {
    const update = caches.open(CACHE).then(cache => fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    event.waitUntil(update.then(() => undefined).catch(() => undefined));
    event.respondWith(caches.match(request).then(cached => cached || update).catch(() => Response.error()));
  }
});
