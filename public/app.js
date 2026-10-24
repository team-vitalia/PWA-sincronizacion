const API_URL = "https://api.spaceflightnewsapi.net/v4/articles/?limit=12";
const $ = (id) => document.getElementById(id);
const FAVORITES_KEY = "cosmobitacora_favorites_v1";
const NOTES_KEY = "cosmobitacora_notes_v1";
const QUEUE_KEY = "cosmobitacora_sync_queue_v1";
const VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

let articles = [];
let currentView = "noticias";

function safeRead(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function summarize(text = "", max = 145) {
  const clean = String(text).replace(/<[^>]*>/g, "").trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
}

function updateConnection() {
  const online = navigator.onLine;
  $("connectionDot").classList.toggle("offline", !online);
  $("connectionText").textContent = online ? "Con conexión" : "Modo sin conexión";
}

function showMessage(text, type = "info") {
  $("message").textContent = text;
  $("message").classList.remove("hidden");
  $("message").style.background = type === "error" ? "#fff0ed" : (type === "success" ? "#eaf8f4" : "#fff5e8");
  $("message").style.color = type === "error" ? "#8c392b" : (type === "success" ? "#207865" : "#80552c");
}

function hideMessage() {
  $("message").classList.add("hidden");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker no es soportado en este entorno de navegación.");
  }

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener("statechange", () => {
        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent("swUpdateAvailable"));
        }
      });
    });

    return registration;
  } catch (error) {
    throw new Error(`Fallo en el registro del Service Worker: ${error.message}`);
  }
}

const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    throw new Error("La API de notificaciones no es soportada en este navegador.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`Permiso de notificaciones no concedido: ${permission}`);
  }

  return permission;
};

const triggerAstronomicalNotification = async (astronomicalEvent) => {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const notificationOptions = {
    body: astronomicalEvent.description,
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    tag: `astro-event-${astronomicalEvent.id}`,
    renotify: true,
    data: {
      url: astronomicalEvent.detailsUrl || "#inicio",
      timestamp: Date.now()
    },
    actions: [
      { action: "observe", title: "Ver Coordenadas" },
      { action: "dismiss", title: "Descartar" }
    ]
  };

  await registration.showNotification(astronomicalEvent.title, notificationOptions);
  return true;
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const subscribeToAstronomicalAlerts = async (publicVapidKey) => {
  await requestNotificationPermission();
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });
  }

  const response = await fetch("/api/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(subscription)
  });

  if (!response.ok) {
    throw new Error(`Fallo al registrar la suscripción push en el servidor: ${response.status}`);
  }

  return await response.json();
};

const getCelestialObserverPosition = async () => {
  if (!("geolocation" in navigator)) {
    throw new Error("El dispositivo no cuenta con hardware de geolocalización compatible.");
  }

  if ("permissions" in navigator) {
    try {
      const permissionStatus = await navigator.permissions.query({ name: "geolocation" });
      if (permissionStatus.state === "denied") {
        throw new Error("El acceso a la ubicación satelital ha sido bloqueado en los ajustes del navegador.");
      }
    } catch (e) {
    }
  }

  const geolocationOptions = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  };

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const telemetryData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude || 0,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp
        };
        resolve(telemetryData);
      },
      (error) => {
        let failureReason = "Error desconocido al capturar coordenadas.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            failureReason = "Permiso denegado por el usuario para obtener la posición geográfica.";
            break;
          case error.POSITION_UNAVAILABLE:
            failureReason = "La posición satelital del sensor GNSS no se encuentra disponible.";
            break;
          case error.TIMEOUT:
            failureReason = "El tiempo límite de espera para adquirir la señal de ubicación expiró.";
            break;
        }
        reject(new Error(failureReason));
      },
      geolocationOptions
    );
  });
};

const calculateLocalHorizontalCoordinates = (latitude, longitude, rightAscension, declination) => {
  const now = new Date();
  const jd = (now.getTime() / 86400000) + 2440587.5;
  const d = jd - 2451545.0;
  let gmst = 280.46061837 + 360.98564736629 * d;
  gmst = ((gmst % 360) + 360) % 360;

  let lst = gmst + longitude;
  lst = ((lst % 360) + 360) % 360;

  const ha = ((lst - rightAscension) * Math.PI) / 180;
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;

  const sinAltitude = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
  const altitude = Math.asin(sinAltitude);

  const cosAzimuth = (Math.sin(decRad) - Math.sin(altitude) * Math.sin(latRad)) / (Math.cos(altitude) * Math.cos(latRad));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));

  if (Math.sin(ha) > 0) {
    azimuth = 2 * Math.PI - azimuth;
  }

  return {
    altitudeDegrees: (altitude * 180) / Math.PI,
    azimuthDegrees: (azimuth * 180) / Math.PI
  };
};

async function loadArticles() {
  hideMessage();
  $("newsGrid").innerHTML = '<div class="empty">Buscando noticias espaciales…</div>';
  if (!navigator.onLine) {
    articles = safeRead("cosmobitacora_cached_articles_v1");
    if (articles.length) {
      showMessage("Estás sin conexión. Se muestran las noticias guardadas anteriormente en este dispositivo.");
      await renderView();
    } else {
      $("newsGrid").innerHTML = '<div class="empty">No hay noticias guardadas todavía. Conéctate una vez para descargar contenido.</div>';
      showMessage("Sin internet y sin noticias en caché. La interfaz sigue disponible.", "error");
    }
    return;
  }

  try {
    const response = await fetch(API_URL, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`La API respondió ${response.status}`);
    const data = await response.json();
    articles = (data.results || []).map((a) => ({
      id: String(a.id),
      title: a.title || "Noticia espacial",
      summary: a.summary || "",
      image: a.image_url || "",
      url: a.url || "#",
      published: a.published_at || "",
      source: a.news_site || "Spaceflight News"
    }));
    safeWrite("cosmobitacora_cached_articles_v1", articles);
    await renderView();
  } catch (error) {
    articles = safeRead("cosmobitacora_cached_articles_v1");
    if (articles.length) {
      showMessage("No se pudo contactar la API. Se muestran las noticias guardadas localmente.");
      await renderView();
    } else {
      $("newsGrid").innerHTML = '<div class="empty">No fue posible obtener noticias. Revisa la conexión e inténtalo de nuevo.</div>';
      showMessage("Error al consultar la API externa: " + error.message, "error");
    }
  }
}

async function renderView() {
  await updateCounters();
  $("newsGrid").classList.toggle("hidden", currentView === "bitacora");
  $("journalPanel").classList.toggle("hidden", currentView !== "bitacora");
  $("sourceBadge").textContent = navigator.onLine ? "API externa · en vivo" : "Contenido local";

  if (currentView === "bitacora") {
    await renderJournal();
    return;
  }

  let list = articles;
  if (currentView === "favoritos") {
    const ids = new Set(safeRead(FAVORITES_KEY).map((x) => String(x.id)));
    list = articles.filter((a) => ids.has(String(a.id)));
    $("sectionEyebrow").textContent = "TU COLECCIÓN";
    $("sectionTitle").textContent = "Noticias favoritas";
  } else {
    $("sectionEyebrow").textContent = "ACTUALIDAD ESPACIAL";
    $("sectionTitle").textContent = "Últimas noticias";
  }

  if (!list.length) {
    $("newsGrid").innerHTML = `<div class="empty">${
      currentView === "favoritos"
        ? "Aún no guardas favoritos. Presiona “Guardar” en una noticia."
        : "No hay noticias disponibles."
    }</div>`;
    return;
  }

  $("newsGrid").innerHTML = list.map((a) => {
    const saved = safeRead(FAVORITES_KEY).some((x) => String(x.id) === String(a.id));
    const date = a.published
      ? new Date(a.published).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })
      : "Fecha no disponible";

    return `<article class="news-card">
      ${a.image ? `<img class="news-image" src="${escapeHTML(a.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="news-image placeholder">✦</div>`}
      <div class="news-body">
        <div class="card-meta">${escapeHTML(a.source)} · ${escapeHTML(date)}</div>
        <h3>${escapeHTML(a.title)}</h3>
        <p>${escapeHTML(summarize(a.summary || "Consulta la publicación original para conocer más detalles.", 155))}</p>
        <div class="card-actions">
          <button class="small-btn ${saved ? "saved" : ""}" data-fav="${escapeHTML(a.id)}">${saved ? "★ Guardada" : "☆ Guardar"}</button>
          <a class="small-btn link" href="${escapeHTML(a.url)}" target="_blank" rel="noopener noreferrer">Leer noticia ↗</a>
        </div>
      </div>
    </article>`;
  }).join("");

  $("newsGrid").querySelectorAll("[data-fav]").forEach((btn) =>
    btn.addEventListener("click", () => toggleFavorite(btn.dataset.fav))
  );
}

async function toggleFavorite(id) {
  const favorites = safeRead(FAVORITES_KEY);
  const existing = favorites.some((x) => String(x.id) === String(id));
  let next;
  if (existing) {
    next = favorites.filter((x) => String(x.id) !== String(id));
  } else {
    const article = articles.find((x) => String(x.id) === String(id));
    if (!article) return;
    next = [...favorites, article];
  }
  safeWrite(FAVORITES_KEY, next);
  await renderView();
}

async function updateCounters() {
  $("favCount").textContent = safeRead(FAVORITES_KEY).length;
  try {
    const pending = await CosmoDB.countPending();
    $("pendingCount").textContent = pending;
  } catch (e) {
    $("pendingCount").textContent = "0";
  }
}

async function renderJournal() {
  $("sectionTitle").textContent = "Mi bitácora";

  try {
    const notes = await CosmoDB.getAllNotes();
    $("journalList").innerHTML = notes.length
      ? notes.slice().reverse().map((n) => `
          <article class="journal-item">
            <h4>${escapeHTML(n.title)}</h4>
            <p>${escapeHTML(n.detail || "Sin descripción")}</p>
            <small>
              ${escapeHTML(new Date(n.createdAt).toLocaleString("es-MX"))} · 
              <span class="sync-status ${n.synced ? "synced" : "pending"}">
                ${n.synced ? "Sincronizado" : "Guardado (Pendiente de sincronizar)"}
              </span>
            </small>
          </article>
        `).join("")
      : '<div class="empty">Todavía no hay notas. Puedes crear una incluso sin conexión; se guardará localmente.</div>';
  } catch (error) {
    $("journalList").innerHTML = `<div class="empty">Error al consultar IndexedDB: ${escapeHTML(error.message)}</div>`;
  }
}

async function addNote(event) {
  event.preventDefault();
  const title = $("noteTitle").value.trim();
  const detail = $("noteDetail").value.trim();
  if (!title) return;

  const note = {
    id: makeId(),
    type: "nota",
    title,
    detail,
    createdAt: new Date().toISOString(),
    synced: false
  };

  const queueRecord = {
    id: note.id,
    type: note.type,
    title: note.title,
    detail: note.detail,
    createdAt: note.createdAt
  };

  try {
    await CosmoDB.saveNote(note);
    await CosmoDB.addToSyncQueue(queueRecord);
  } catch (dbError) {
    showMessage("No se pudo guardar: " + dbError.message, "error");
    return;
  }

  $("noteForm").reset();
  await renderJournal();
  await updateCounters();

  if (navigator.onLine) {
    showMessage("Guardado. Enviando al servidor...");
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: [queueRecord] })
      });

      if (!response.ok) {
        throw new Error(`El servidor respondió con código HTTP ${response.status}`);
      }

      await CosmoDB.removeFromSyncQueue(note.id);
      await CosmoDB.markNotesAsSynced(note.id);

      showMessage("Nota guardada localmente y sincronizada con éxito en el servidor.", "success");
      await renderJournal();
      await updateCounters();
      await loadServerRecords();
    } catch (networkError) {
      showMessage("Nota protegida localmente. Falló el envío inmediato; se sincronizará luego.", "error");
      await requestBackgroundSync();
    }
  } else {
    showMessage("Modo sin conexión: la nota quedó guardada. Se sincronizará automáticamente cuando vuelva internet.");
    await requestBackgroundSync();
  }
}

async function syncPending() {
  const queue = await CosmoDB.getSyncQueue();
  if (!queue.length) {
    showMessage("No hay registros pendientes de sincronización.");
    return;
  }

  if (!navigator.onLine) {
    showMessage(`Sin conexión. Hay ${queue.length} registro(s) listos para sincronizar.`, "error");
    await requestBackgroundSync();
    return;
  }

  $("syncBtn").disabled = true;
  $("syncBtn").textContent = "Sincronizando…";

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: queue })
    });

    if (!response.ok) throw new Error(`El servidor respondió con código HTTP ${response.status}`);
    const result = await response.json();

    const ids = queue.map((x) => x.id);
    await CosmoDB.removeManyFromSyncQueue(ids);
    await CosmoDB.markNotesAsSynced(ids);

    showMessage(`Sincronización completada. Nuevos registros: ${result.added}. Duplicados ignorados: ${result.duplicatesIgnored}.`, "success");
    await renderJournal();
    await updateCounters();
    await loadServerRecords();
  } catch (error) {
    showMessage("No se pudo sincronizar. Los datos continúan guardados localmente: " + error.message, "error");
    await requestBackgroundSync();
  } finally {
    $("syncBtn").disabled = false;
    $("syncBtn").textContent = "⇅ Sincronizar pendientes";
  }
}

async function requestBackgroundSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("sync-notes");
    } catch (err) {
    }
  }
}

async function loadServerRecords() {
  if (!navigator.onLine) {
    $("serverList").innerHTML = '<p class="empty">El servidor no está disponible sin conexión.</p>';
    return;
  }
  try {
    const response = await fetch("/api/sync");
    if (!response.ok) throw new Error("No se pudieron consultar los registros del servidor.");
    const data = await response.json();
    $("serverList").innerHTML = data.records.length
      ? data.records.slice().reverse().map((r) => `
          <div class="server-record">
            <strong>${escapeHTML(r.title)}</strong><br>
            <span>${escapeHTML(r.detail || "Sin descripción")}</span><br>
            <small>Recibido: ${escapeHTML(new Date(r.syncedAt).toLocaleString("es-MX"))}</small>
          </div>
        `).join("")
      : "<p>Aún no hay registros recibidos por el servidor.</p>";
  } catch (error) {
    $("serverList").textContent = error.message;
  }
}

async function setView(view) {
  currentView = view;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  hideMessage();
  await renderView();
}

async function migrateLegacyLocalStorage() {
  try {
    const oldNotes = safeRead(NOTES_KEY, []);
    const oldQueue = safeRead(QUEUE_KEY, []);

    if (oldNotes.length) {
      for (const note of oldNotes) {
        await CosmoDB.saveNote(note);
      }
      localStorage.removeItem(NOTES_KEY);
    }

    if (oldQueue.length) {
      for (const item of oldQueue) {
        await CosmoDB.addToSyncQueue(item);
      }
      localStorage.removeItem(QUEUE_KEY);
    }
  } catch (err) {
  }
}

document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("refreshBtn").addEventListener("click", loadArticles);
$("noteForm").addEventListener("submit", addNote);
$("syncBtn").addEventListener("click", syncPending);
$("loadServerBtn").addEventListener("click", loadServerRecords);

const btnLocateStars = $("btnLocateStars");
if (btnLocateStars) {
  btnLocateStars.addEventListener("click", async () => {
    btnLocateStars.disabled = true;
    showMessage("Calibrando sensores astronómicos del dispositivo...", "info");

    try {
      const position = await getCelestialObserverPosition();
      const coordsText = `Latitud: ${position.latitude.toFixed(4)}° | Longitud: ${position.longitude.toFixed(4)}° | Precisión: ±${Math.round(position.accuracy)}m`;
      $("observerCoordinates").textContent = coordsText;

      const vegaCoordinates = calculateLocalHorizontalCoordinates(
        position.latitude,
        position.longitude,
        279.234,
        38.783
      );

      $("targetStarCoords").innerHTML = `<strong>Astro de referencia (Vega):</strong> Azimut: ${vegaCoordinates.azimuthDegrees.toFixed(2)}° | Elevación: ${vegaCoordinates.altitudeDegrees.toFixed(2)}°`;
      $("telemetryStatus").classList.remove("hidden");

      await triggerAstronomicalNotification({
        id: "vega-lock",
        title: "Bóveda Celeste Calibrada",
        description: `Vega localizada a ${vegaCoordinates.altitudeDegrees.toFixed(1)}° sobre el horizonte local.`,
        detailsUrl: "#inicio"
      });

      showMessage("Mapa estelar orientado con éxito según tu posición.", "success");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      btnLocateStars.disabled = false;
    }
  });
}

const btnSubscribeAlerts = $("btnSubscribeAlerts");
if (btnSubscribeAlerts) {
  btnSubscribeAlerts.addEventListener("click", async () => {
    btnSubscribeAlerts.disabled = true;
    showMessage("Estableciendo enlace de suscripción a eventos espaciales...", "info");

    try {
      await subscribeToAstronomicalAlerts(VAPID_PUBLIC_KEY);
      showMessage("Alertas de eventos astronómicos activadas correctamente.", "success");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      btnSubscribeAlerts.disabled = false;
    }
  });
}

window.addEventListener("online", async () => {
  updateConnection();
  const pending = await CosmoDB.countPending();
  if (pending > 0) {
    showMessage(`Conexión recuperada. Sincronizando ${pending} registro(s) pendientes de IndexedDB...`, "info");
    await syncPending();
  } else {
    showMessage("Conexión recuperada.", "success");
  }
  await loadArticles();
});

window.addEventListener("offline", () => {
  updateConnection();
  showMessage("Sin conexión. Puedes consultar contenido guardado y crear notas (se guardarán en IndexedDB).", "error");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async (event) => {
    if (event.data && event.data.type === "SYNC_COMPLETED") {
      showMessage(`Sincronización en segundo plano completada (${event.data.count} nuevo(s) registro(s)).`, "success");
      await renderJournal();
      await updateCounters();
      await loadServerRecords();
    }
  });
}

async function boot() {
  updateConnection();
  await migrateLegacyLocalStorage();

  try {
    await registerServiceWorker();
  } catch (error) {
  }

  await loadArticles();
  await updateCounters();

  setTimeout(() => {
    $("splash").classList.add("fade");
    setTimeout(() => {
      $("splash").classList.add("hidden");
      $("app").classList.remove("hidden");
    }, 500);
  }, 700);
}

boot();
