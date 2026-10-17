const API_URL = "https://api.spaceflightnewsapi.net/v4/articles/?limit=12";
const $ = (id) => document.getElementById(id);
const FAVORITES_KEY = "cosmobitacora_favorites_v1";
const NOTES_KEY = "cosmobitacora_notes_v1"; // Clave heredada para migración a IndexedDB
const QUEUE_KEY = "cosmobitacora_sync_queue_v1"; // Clave heredada para migración a IndexedDB
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
  $("message").style.background = type === "error" ? "#fff0ed" : "#fff5e8";
  $("message").style.color = type === "error" ? "#8c392b" : "#80552c";
}

function hideMessage() {
  $("message").classList.add("hidden");
}

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

/**
 * Registra o envía una nota:
 * 1. Guarda siempre de forma segura en IndexedDB (persistencia local offline-first).
 * 2. Si hay conexión: intenta el envío inmediato a la API REST. Si tiene éxito, limpia de la cola y marca sincronizada.
 * 3. Si no hay conexión (o falla la red): la nota queda protegida en IndexedDB y se activa Background Sync o listener online.
 */
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

  // Paso 1: Guardar localmente en IndexedDB
  try {
    await CosmoDB.saveNote(note);
    await CosmoDB.addToSyncQueue(queueRecord);
  } catch (dbError) {
    console.error("Error al persistir:", dbError);
    showMessage("No se pudo guardar: " + dbError.message, "error");
    return;
  }

  $("noteForm").reset();
  await renderJournal();
  await updateCounters();

  // Paso 2: Evaluar si hay conexión de red
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

      // Paso 3a: Envío exitoso -> Limpiar registro de la cola y marcar como sincronizado
      await CosmoDB.removeFromSyncQueue(note.id);
      await CosmoDB.markNotesAsSynced(note.id);

      showMessage("Nota guardada localmente y sincronizada con éxito en el servidor.");
      await renderJournal();
      await updateCounters();
      await loadServerRecords();
    } catch (networkError) {
      console.warn("Fallo el envío directo al servidor:", networkError);
      showMessage("Nota protegida. Falló el envío inmediato; se reintentará automáticamente.", "error");
      await requestBackgroundSync();
    }
  } else {
    // Paso 3b: Sin conexión -> Datos seguros en IndexedDB y se activa Background Sync
    showMessage("Modo sin conexión: la nota quedó guardada. Se sincronizará automáticamente cuando vuelva internet.");
    await requestBackgroundSync();
  }
}

/**
 * Sincronización manual accionada por el botón "Sincronizar pendientes":
 * Lee todos los registros pendientes de IndexedDB y los envía al backend.
 */
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
    // Limpiar de la cola de sincronización y actualizar estado en IndexedDB
    await CosmoDB.removeManyFromSyncQueue(ids);
    await CosmoDB.markNotesAsSynced(ids);

    showMessage(`Sincronización completada. Nuevos registros: ${result.added}. Duplicados ignorados: ${result.duplicatesIgnored}.`);
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

/**
 * Solicita al Service Worker registrar una tarea de Background Sync
 */
async function requestBackgroundSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register("sync-notes");
    } catch (err) {
      console.warn("[App] No se pudo registrar Background Sync:", err);
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

// Migración de datos existentes en localStorage hacia IndexedDB
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
    console.warn("Aviso durante la migración de localStorage a IndexedDB:", err);
  }
}

// Event Listeners de la interfaz
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("refreshBtn").addEventListener("click", loadArticles);
$("noteForm").addEventListener("submit", addNote);
$("syncBtn").addEventListener("click", syncPending);
$("loadServerBtn").addEventListener("click", loadServerRecords);

// Escuchar cambios de conectividad
window.addEventListener("online", async () => {
  updateConnection();
  const pending = await CosmoDB.countPending();
  if (pending > 0) {
    showMessage(`Conexión recuperada. Sincronizando ${pending} registro(s) pendientes de IndexedDB...`);
    await syncPending();
  } else {
    showMessage("Conexión recuperada.");
  }
  await loadArticles();
});

window.addEventListener("offline", () => {
  updateConnection();
  showMessage("Sin conexión. Puedes consultar contenido guardado y crear notas (se guardarán en IndexedDB).", "error");
});

// Escuchar mensajes del Service Worker cuando ejecute sincronización en segundo plano
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async (event) => {
    if (event.data && event.data.type === "SYNC_COMPLETED") {
      showMessage(`Sincronización en segundo plano completada (${event.data.count} nuevo(s) registro(s)).`);
      await renderJournal();
      await updateCounters();
      await loadServerRecords();
    }
  });
}

async function boot() {
  updateConnection();

  // Asegurar persistencia y migrar registros previos a IndexedDB
  await migrateLegacyLocalStorage();

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (error) {
      console.error("No se pudo registrar el Service Worker", error);
    }
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
