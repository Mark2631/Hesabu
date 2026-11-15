const CACHE = 'hesabu-shell-v3';
const SHELL = ['/', '/manifest.json', '/hesabu-mark.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const response = await fetch('/');
      if (response.ok) {
        const html = await response.clone().text();
        const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1])
          .filter((path) => path.startsWith('/') && !path.startsWith('//'));
        await Promise.all(assetPaths.map(async (path) => {
          try {
            const asset = await fetch(path, { cache: 'reload' });
            if (asset.ok) await cache.put(path, asset);
          } catch {
            // Optional assets must not block installation.
          }
        }));
      }
    } catch {
      // Keep the basic shell available when the first network request fails.
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key.startsWith('hesabu-shell-') && key !== CACHE).map((key) => caches.delete(key)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match('/'))));
});
