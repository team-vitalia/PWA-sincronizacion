try {
  importScripts("/idb-helper.js");
} catch (e) {
}

const CACHE_STATIC_NAME = "cosmobitacora-static-v3";
const CACHE_IMAGES_NAME = "cosmobitacora-images-v1";
const CACHE_API_NAME = "cosmobitacora-api-v1";

const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/idb-helper.js",
  "/app.js",
  "/manifest.json",
  "/icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const allowedCaches = [CACHE_STATIC_NAME, CACHE_IMAGES_NAME, CACHE_API_NAME];
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => !allowedCaches.includes(key))
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).catch(() => caches.match("/index.html"));
      })
    );
    return;
  }

  if (request.destination === "image" || url.pathname.match(/\.(png|jpg|jpeg|svg|webp)$/i)) {
    event.respondWith(
      caches.open(CACHE_IMAGES_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => null);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  if (url.hostname === "api.spaceflightnewsapi.net") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_API_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_STATIC_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        }).catch(() => cachedResponse || caches.match("/index.html"));

        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-notes" || event.tag === "cosmobitacora-sync") {
    event.waitUntil(syncPendingNotes());
  }
});

async function syncPendingNotes() {
  if (!self.CosmoDB) {
    return;
  }

  try {
    const queue = await self.CosmoDB.getSyncQueue();
    if (!queue || !queue.length) {
      return;
    }

    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: queue })
    });

    if (!response.ok) {
      throw new Error(`El servidor respondió con código HTTP ${response.status}`);
    }

    const result = await response.json();
    const ids = queue.map((item) => item.id);

    await self.CosmoDB.removeManyFromSyncQueue(ids);
    await self.CosmoDB.markNotesAsSynced(ids);

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: "SYNC_COMPLETED",
        count: result.added !== undefined ? result.added : queue.length,
        duplicatesIgnored: result.duplicatesIgnored || 0,
        ids: ids
      });
    }
  } catch (error) {
    throw error;
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: "Alerta del Universo",
      body: event.data.text()
    };
  }

  const options = {
    body: payload.body || "Nuevo evento astronómico registrado.",
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    tag: payload.tag || "celestial-alert",
    renotify: true,
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(payload.title || "CosmoBitácora Alerta", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";

  if (event.action === "dismiss") {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
