// Service worker: always load the newest version of the game's files.
// GitHub Pages lets browsers reuse files for 10 minutes, so right after an update a phone could run a
// mix of old and new files. Here every file is fetched fresh first (a quick check with the server;
// unchanged files aren't downloaded again); only without a connection the last copy is used.

const CACHE = 'tamagoji';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // e.g. the logo font
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
