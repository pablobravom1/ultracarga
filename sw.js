// UltraCarga — service worker mínimo, solo para que la app sea instalable
// y cargue rápido. No cachea datos de Supabase, solo el "cascarón" de la app.
const CACHE_NAME = 'ultracarga-v2';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia "network-first": siempre intenta traer la versión más nueva de
// la app primero (así los cambios que subimos se ven al instante), y solo
// usa la copia guardada si no hay conexión.
self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return; // no tocar Supabase ni CDNs

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
