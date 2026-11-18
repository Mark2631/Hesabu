const CACHE_PREFIX = 'hesabu-shell-';
const CACHE = 'hesabu-shell-v6';
const APP_SHELL = ['/', '/manifest.json', '/hesabu-mark.svg', '/app-icon.svg', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok) await cache.put(path, response);
      } catch {}
    }));
    try {
      const response = await fetch('/', { cache: 'reload' });
      if (response.ok) {
        const html = await response.clone().text();
        await cache.put('/', response);
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1])
          .filter((path) => path.startsWith('/') && !path.startsWith('//'));
        await Promise.all(assets.map(async (path) => {
          try {
            const asset = await fetch(path, { cache: 'reload' });
            if (asset.ok) await cache.put(path, asset);
          } catch {}
        }));
      }
    } catch {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) ||
          (await caches.match('/offline.html')) ||
          new Response('Hesabu is offline. Reconnect once to load the app.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  if (/\.(?:js|css|svg|png|webp|woff2?)$/i.test(url.pathname) || url.pathname === '/manifest.json') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(async (response) => {
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
        return response;
      }).catch(() => null);
      return cached || await network || Response.error();
    })());
  }
});
