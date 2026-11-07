"use strict";

// Importar las funciones de IndexedDB para la sincronización en segundo plano.
importScripts("/idb-helper.js");

const CACHE_NAME = "cosmobitacora-static-v6";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/idb-helper.js",
  "/app.js",
  "/manifest.json",
  "/icons/icon.svg"
];

// ==========================================
// INSTALACIÓN
// ==========================================

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ==========================================
// ACTIVACIÓN
// ==========================================

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ==========================================
// SOLICITUDES Y MODO OFFLINE
// ==========================================

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  // No guardar respuestas de APIs en la caché estática.
  if (url.hostname === "api.spaceflightnewsapi.net") {
    return;
  }

  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Navegación: intentar obtener la versión actual y,
  // si falla la red, usar el index.html almacenado.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => cache.put("/index.html", copy));
          }

          return response;
        })
        .catch(async () => {
          return (
            await caches.match("/index.html")
          ) || Response.error();
        })
    );

    return;
  }

  // Para los recursos locales, utilizar primero la caché.
  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(request);

        if (
          response.ok &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();

          const cache = await caches.open(CACHE_NAME);

          await cache.put(request, copy);
        }

        return response;
      } catch (error) {
        if (request.destination === "image") {
          return Response.error();
        }

        throw error;
      }
    })
  );
});

// ==========================================
// SINCRONIZACIÓN EN SEGUNDO PLANO DE NOTAS
// ==========================================

self.addEventListener("sync", event => {
  if (
    event.tag === "sync-notes" ||
    event.tag === "cosmobitacora-sync"
  ) {
    event.waitUntil(syncPendingNotes());
  }
});

async function syncPendingNotes() {
  const queue = await self.CosmoDB.getSyncQueue();

  if (!queue.length) {
    return;
  }

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      records: queue
    })
  });

  if (!response.ok) {
    throw new Error("No se pudieron sincronizar las notas.");
  }

  const result = await response.json();

  const ids = queue.map(item => item.id);

  await self.CosmoDB.removeManyFromSyncQueue(ids);

  await self.CosmoDB.markNotesAsSynced(ids);

  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });

  for (const client of clients) {
    client.postMessage({
      type: "SYNC_COMPLETED",
      count: result.added ?? queue.length,
      duplicatesIgnored: result.duplicatesIgnored ?? 0,
      ids
    });
  }
}

// ==========================================
// NOTIFICACIONES PUSH
// ==========================================

self.addEventListener("push", event => {
  let data = {
    title: "CosmoBitácora",
    body: "Tienes una nueva notificación.",
    url: "/"
  };

  if (event.data) {
    try {
      data = {
        ...data,
        ...event.data.json()
      };
    } catch {
      data.body = event.data.text();
    }
  }

  const target = new URL(
    data.url || "/",
    self.location.origin
  );

  // Evitar redirecciones de notificaciones a sitios externos.
  if (target.origin !== self.location.origin) {
    target.href = self.location.origin + "/";
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: "cosmobitacora-push",
      data: {
        url: target.href
      }
    })
  );
});

// ==========================================
// CLIC EN UNA NOTIFICACIÓN
// ==========================================

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetUrl = new URL(
        event.notification.data?.url || "/",
        self.location.origin
      ).href;

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of windows) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});