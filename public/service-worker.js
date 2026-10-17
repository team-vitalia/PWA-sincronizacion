const CACHE_NAME = "cosmobitacora-static-v1";
const APP_SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.json", "/icons/icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  // API externa: intenta red primero; los artículos se guardan en localStorage por la app.
  if (url.hostname === "api.spaceflightnewsapi.net") return;
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached || caches.match("/index.html"));
      return cached || network;
    })
  );
});
