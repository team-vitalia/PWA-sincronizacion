"use strict";

const API_URL =
  "https://api.spaceflightnewsapi.net/v4/articles/?limit=12";

const $ = id => document.getElementById(id);

const FAVORITES_KEY = "cosmobitacora_favorites_v1";
const NOTES_KEY = "cosmobitacora_notes_v1";
const QUEUE_KEY = "cosmobitacora_sync_queue_v1";

let articles = [];
let currentView = "noticias";
let editingTaskId = null;

let currentTaskLocation = {
  latitude: null,
  longitude: null
};

// ==========================================
// UTILIDADES
// ==========================================

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
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function summarize(text = "", max = 145) {
  const clean = String(text)
    .replace(/<[^>]*>/g, "")
    .trim();

  return clean.length > max
    ? clean.slice(0, max).trim() + "…"
    : clean;
}

function showMessage(text, type = "info") {
  const message = $("message");

  message.textContent = text;
  message.classList.remove("hidden");

  message.style.background =
    type === "error" ? "#fff0ed" : "#fff5e8";

  message.style.color =
    type === "error" ? "#8c392b" : "#80552c";
}

function hideMessage() {
  $("message").classList.add("hidden");
}

function updateConnection() {
  const online = navigator.onLine;

  $("connectionDot").classList.toggle("offline", !online);

  $("connectionText").textContent = online
    ? "Con conexión"
    : "Modo sin conexión";
}

// ==========================================
// NOTICIAS ESPACIALES
// ==========================================

async function loadArticles() {
  hideMessage();

  $("newsGrid").innerHTML =
    '<div class="empty">Buscando noticias espaciales…</div>';

  if (!navigator.onLine) {
    articles = safeRead("cosmobitacora_cached_articles_v1");

    if (articles.length) {
      showMessage(
        "Estás sin conexión. Se muestran las noticias guardadas en este dispositivo."
      );

      await renderView();
    } else {
      $("newsGrid").innerHTML =
        '<div class="empty">No hay noticias guardadas todavía. Conéctate una vez para descargar contenido.</div>';

      showMessage(
        "Sin internet y sin noticias en caché. La interfaz sigue disponible.",
        "error"
      );
    }

    return;
  }

  try {
    const response = await fetch(API_URL, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`La API respondió ${response.status}`);
    }

    const data = await response.json();

    articles = (data.results || []).map(article => ({
      id: String(article.id),
      title: article.title || "Noticia espacial",
      summary: article.summary || "",
      image: article.image_url || "",
      url: article.url || "#",
      published: article.published_at || "",
      source: article.news_site || "Spaceflight News"
    }));

    safeWrite("cosmobitacora_cached_articles_v1", articles);

    await renderView();
  } catch (error) {
    articles = safeRead("cosmobitacora_cached_articles_v1");

    if (articles.length) {
      showMessage(
        "No se pudo contactar la API. Se muestran las noticias guardadas localmente."
      );

      await renderView();
    } else {
      $("newsGrid").innerHTML =
        '<div class="empty">No fue posible obtener noticias.</div>';

      showMessage(
        "Error al consultar la API externa: " + error.message,
        "error"
      );
    }
  }
}

async function renderView() {
  await updateCounters();

  $("newsGrid").classList.toggle(
    "hidden",
    currentView === "bitacora" ||
    currentView === "tareas"
  );

  $("journalPanel").classList.toggle(
    "hidden",
    currentView !== "bitacora"
  );

  $("tasksPanel").classList.toggle(
    "hidden",
    currentView !== "tareas"
  );

  $("sourceBadge").textContent =
    currentView === "tareas"
      ? "IndexedDB · local"
      : navigator.onLine
        ? "API externa · en vivo"
        : "Contenido local";

  if (currentView === "tareas") {
    $("sectionEyebrow").textContent =
      "ORGANIZACIÓN Y SEGUIMIENTO";

    $("sectionTitle").textContent = "Mis tareas";

    await renderTasks();
    await notifyPendingTasks();

    return;
  }

  if (currentView === "bitacora") {
    await renderJournal();
    return;
  }

  let list = articles;

  if (currentView === "favoritos") {
    const ids = new Set(
      safeRead(FAVORITES_KEY).map(item => String(item.id))
    );

    list = articles.filter(
      article => ids.has(String(article.id))
    );

    $("sectionEyebrow").textContent = "TU COLECCIÓN";
    $("sectionTitle").textContent = "Noticias favoritas";
  } else {
    $("sectionEyebrow").textContent = "ACTUALIDAD ESPACIAL";
    $("sectionTitle").textContent = "Últimas noticias";
  }

  if (!list.length) {
    $("newsGrid").innerHTML = `
      <div class="empty">
        ${
          currentView === "favoritos"
            ? "Aún no guardas favoritos."
            : "No hay noticias disponibles."
        }
      </div>
    `;

    return;
  }

  $("newsGrid").innerHTML = list.map(article => {
    const saved = safeRead(FAVORITES_KEY).some(
      item => String(item.id) === String(article.id)
    );

    const date = article.published
      ? new Date(article.published).toLocaleDateString("es-MX")
      : "Fecha no disponible";

    return `
      <article class="news-card">
        ${
          article.image
            ? `<img class="news-image"
                    src="${escapeHTML(article.image)}"
                    alt=""
                    loading="lazy"
                    onerror="this.style.display='none'">`
            : '<div class="news-image placeholder">✦</div>'
        }

        <div class="news-body">
          <div class="card-meta">
            ${escapeHTML(article.source)} · ${escapeHTML(date)}
          </div>

          <h3>${escapeHTML(article.title)}</h3>

          <p>
            ${escapeHTML(
              summarize(
                article.summary ||
                "Consulta la publicación original para conocer más detalles.",
                155
              )
            )}
          </p>

          <div class="card-actions">
            <button
              class="small-btn ${saved ? "saved" : ""}"
              data-fav="${escapeHTML(article.id)}"
              type="button">
              ${saved ? "★ Guardada" : "☆ Guardar"}
            </button>

            <a
              class="small-btn link"
              href="${escapeHTML(article.url)}"
              target="_blank"
              rel="noopener noreferrer">
              Leer noticia ↗
            </a>
          </div>
        </div>
      </article>
    `;
  }).join("");

  $("newsGrid").querySelectorAll("[data-fav]").forEach(button => {
    button.addEventListener("click", () => {
      toggleFavorite(button.dataset.fav);
    });
  });
}

async function toggleFavorite(id) {
  const favorites = safeRead(FAVORITES_KEY);

  const exists = favorites.some(
    item => String(item.id) === String(id)
  );

  let next;

  if (exists) {
    next = favorites.filter(
      item => String(item.id) !== String(id)
    );
  } else {
    const article = articles.find(
      item => String(item.id) === String(id)
    );

    if (!article) return;

    next = [...favorites, article];
  }

  safeWrite(FAVORITES_KEY, next);

  await renderView();
}

// ==========================================
// CONTADORES Y BITÁCORA
// ==========================================

async function updateCounters() {
  $("favCount").textContent =
    safeRead(FAVORITES_KEY).length;

  try {
    $("pendingCount").textContent =
      await CosmoDB.countPending();
  } catch {
    $("pendingCount").textContent = "0";
  }

  try {
    const tasks = await CosmoDB.getAllTasks();

    $("taskCount").textContent = tasks.filter(
      task => !task.deleted && task.estado !== "completada"
    ).length;
  } catch {
    $("taskCount").textContent = "0";
  }
}

async function renderJournal() {
  $("sectionTitle").textContent = "Mi bitácora";

  try {
    const notes = await CosmoDB.getAllNotes();

    $("journalList").innerHTML = notes.length
      ? notes.slice().reverse().map(note => `
          <article class="journal-item">
            <h4>${escapeHTML(note.title)}</h4>

            <p>
              ${escapeHTML(note.detail || "Sin descripción")}
            </p>

            <small>
              ${escapeHTML(
                new Date(note.createdAt).toLocaleString("es-MX")
              )}

              ·

              <span class="sync-status ${
                note.synced ? "synced" : "pending"
              }">
                ${
                  note.synced
                    ? "Sincronizado"
                    : "Pendiente de sincronizar"
                }
              </span>
            </small>
          </article>
        `).join("")
      : '<div class="empty">Todavía no hay notas. Puedes crear una incluso sin conexión.</div>';
  } catch (error) {
    $("journalList").innerHTML = `
      <div class="empty">
        Error al consultar IndexedDB:
        ${escapeHTML(error.message)}
      </div>
    `;
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
  } catch (error) {
    showMessage(
      "No se pudo guardar la nota: " + error.message,
      "error"
    );

    return;
  }

  $("noteForm").reset();

  await notifyNoteSavedLocally(note.title);
  await renderJournal();
  await updateCounters();

  if (!navigator.onLine) {
    showMessage(
      "Nota guardada localmente. Se sincronizará cuando vuelva internet."
    );

    await requestBackgroundSync();

    return;
  }

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: [queueRecord]
      })
    });

    if (!response.ok) {
      throw new Error("Error del servidor.");
    }

    await response.json();

    await CosmoDB.removeFromSyncQueue(note.id);
    await CosmoDB.markNotesAsSynced(note.id);

    showMessage("Nota guardada y sincronizada correctamente.");

    await renderJournal();
    await updateCounters();
    await loadServerRecords();
  } catch (error) {
    showMessage(
      "La nota está guardada localmente. La sincronización queda pendiente.",
      "error"
    );

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
    showMessage(
      "Sin conexión. Los registros permanecen guardados localmente.",
      "error"
    );

    await requestBackgroundSync();

    return;
  }

  $("syncBtn").disabled = true;
  $("syncBtn").textContent = "Sincronizando…";

  try {
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
      throw new Error("No se pudo sincronizar.");
    }

    const result = await response.json();

    const ids = queue.map(item => item.id);

    await CosmoDB.removeManyFromSyncQueue(ids);
    await CosmoDB.markNotesAsSynced(ids);

    showMessage(
      `Sincronización completada. Nuevos registros: ${
        result.added ?? 0
      }. Duplicados ignorados: ${
        result.duplicatesIgnored ?? 0
      }.`
    );

    await renderJournal();
    await updateCounters();
    await loadServerRecords();
  } catch (error) {
    showMessage(
      "Los registros continúan guardados localmente: " +
      error.message,
      "error"
    );

    await requestBackgroundSync();
  } finally {
    $("syncBtn").disabled = false;
    $("syncBtn").textContent = "⇅ Sincronizar pendientes";
  }
}

async function requestBackgroundSync() {
  if (
    "serviceWorker" in navigator &&
    "SyncManager" in window
  ) {
    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.sync.register("sync-notes");
    } catch (error) {
      console.warn(
        "No se pudo registrar Background Sync:",
        error
      );
    }
  }
}

async function loadServerRecords() {
  if (!navigator.onLine) {
    $("serverList").innerHTML =
      '<p class="empty">El servidor no está disponible sin conexión.</p>';

    return;
  }

  try {
    const response = await fetch("/api/sync");

    if (!response.ok) {
      throw new Error("No se pudieron consultar los registros.");
    }

    const data = await response.json();

    $("serverList").innerHTML = data.records.length
      ? data.records.slice().reverse().map(record => `
          <div class="server-record">
            <strong>${escapeHTML(record.title)}</strong><br>

            <span>
              ${escapeHTML(record.detail || "Sin descripción")}
            </span><br>

            <small>
              Recibido:
              ${escapeHTML(
                new Date(record.syncedAt).toLocaleString("es-MX")
              )}
            </small>
          </div>
        `).join("")
      : "<p>Aún no hay registros recibidos por el servidor.</p>";
  } catch (error) {
    $("serverList").textContent = error.message;
  }
}

// ==========================================
// ACTIVIDAD 12: LISTADO DE TAREAS
// ==========================================

async function renderTasks() {
  const allTasks = await CosmoDB.getAllTasks();

  const tasks = allTasks
    .filter(task => !task.deleted)
    .sort(
      (a, b) =>
        new Date(a.fechaLimite) - new Date(b.fechaLimite)
    );

  $("taskCount").textContent = tasks.filter(
    task => task.estado !== "completada"
  ).length;

  const list = $("taskList");

  if (!tasks.length) {
    list.innerHTML = `
      <div class="empty">
        No tienes tareas registradas.
        Utiliza el formulario para crear la primera.
      </div>
    `;

    return;
  }

  list.innerHTML = tasks.map(task => {
    const dueDate = new Date(task.fechaLimite);

    const overdue =
      task.estado !== "completada" &&
      dueDate.getTime() < Date.now();

    const hasLocation =
      Number.isFinite(task.latitud) &&
      Number.isFinite(task.longitud);

    const location = hasLocation
      ? `${task.latitud.toFixed(6)}, ${task.longitud.toFixed(6)}`
      : "Sin ubicación";

    const safeState = String(task.estado)
      .replace(/\s/g, "-");

    return `
      <article class="task-card">
        <div class="task-card-heading">
          <h3>${escapeHTML(task.titulo)}</h3>

          <span class="task-state state-${escapeHTML(safeState)}">
            ${escapeHTML(task.estado)}
          </span>
        </div>

        <p>
          ${escapeHTML(task.descripcion || "Sin descripción")}
        </p>

        <p>
          <strong>Fecha límite:</strong>
          ${escapeHTML(dueDate.toLocaleString("es-MX"))}
        </p>

        <p>
          <strong>Ubicación:</strong>
          ${escapeHTML(location)}
        </p>

        <p>
          <strong>Sincronización:</strong>

          <span class="sync-status ${
            task.synced ? "synced" : "pending"
          }">
            ${task.synced ? "Sincronizada" : "Pendiente"}
          </span>
        </p>

        ${
          overdue
            ? '<p class="task-overdue">Esta tarea está vencida.</p>'
            : ""
        }

        <div class="task-card-actions">
          <button
            class="small-btn"
            data-edit-task="${escapeHTML(task.id)}"
            type="button">
            Editar
          </button>

          <button
            class="small-btn"
            data-toggle-task="${escapeHTML(task.id)}"
            type="button">
            ${
              task.estado === "completada"
                ? "Marcar pendiente"
                : "Marcar completada"
            }
          </button>
        </div>
      </article>
    `;
  }).join("");
}

// ==========================================
// ACTIVIDAD 12: REGISTRAR Y EDITAR TAREAS
// ==========================================

async function saveTaskFromForm(event) {
  event.preventDefault();

  const title = $("taskTitle").value.trim();
  const dueValue = $("taskDueDate").value;

  if (
    !title ||
    !dueValue ||
    Number.isNaN(new Date(dueValue).getTime())
  ) {
    showMessage(
      "Escribe un título y una fecha límite válida.",
      "error"
    );

    return;
  }

  const oldTask = editingTaskId
    ? await CosmoDB.getTask(editingTaskId)
    : null;

  const task = {
    id: editingTaskId || makeId(),

    type: "tarea",

    titulo: title,

    descripcion: $("taskDescription").value.trim(),

    fechaLimite: new Date(dueValue).toISOString(),

    estado: $("taskStatus").value,

    latitud: currentTaskLocation.latitude,

    longitud: currentTaskLocation.longitude,

    createdAt: oldTask
      ? oldTask.createdAt
      : new Date().toISOString(),

    updatedAt: new Date().toISOString(),

    synced: false,

    deleted: false
  };

  try {
    // Primero se guarda localmente.
    await CosmoDB.saveTask(task);

    $("taskForm").reset();

    editingTaskId = null;

    currentTaskLocation = {
      latitude: null,
      longitude: null
    };

    $("taskFormTitle").textContent = "Registrar una tarea";

    $("taskLocationStatus").textContent =
      "La ubicación es opcional.";

    await renderTasks();
    await updateCounters();

    // El aviso no debe impedir que la tarea se guarde.
    await notifyTaskSaved(task.titulo);

    if (navigator.onLine) {
      try {
        await syncOneTask(task);

        showMessage(
          "Tarea guardada localmente y sincronizada con el servidor."
        );
      } catch (error) {
        console.warn("Sincronización pendiente:", error);

        showMessage(
          "La tarea quedó guardada localmente. " +
          "La sincronización sigue pendiente.",
          "error"
        );
      }
    } else {
      showMessage(
        "Tarea guardada en este dispositivo. " +
        "Se sincronizará cuando vuelva internet."
      );
    }

    await renderTasks();
    await updateCounters();
  } catch (error) {
    console.error(error);

    showMessage(
      "No se pudo guardar la tarea: " + error.message,
      "error"
    );
  }
}

async function editTask(id) {
  const task = await CosmoDB.getTask(id);

  if (!task) return;

  editingTaskId = task.id;

  $("taskTitle").value = task.titulo;

  $("taskDescription").value =
    task.descripcion || "";

  $("taskStatus").value = task.estado;

  const date = new Date(task.fechaLimite);

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  $("taskDueDate").value =
    localDate.toISOString().slice(0, 16);

  currentTaskLocation = {
    latitude: task.latitud ?? null,
    longitude: task.longitud ?? null
  };

  $("taskLocationStatus").textContent =
    task.latitud != null && task.longitud != null
      ? "La tarea tiene una ubicación registrada."
      : "La ubicación es opcional.";

  $("taskFormTitle").textContent = "Editar tarea";

  $("taskForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function toggleTaskState(id) {
  const task = await CosmoDB.getTask(id);

  if (!task) return;

  task.estado =
    task.estado === "completada"
      ? "pendiente"
      : "completada";

  task.updatedAt = new Date().toISOString();
  task.synced = false;

  await CosmoDB.saveTask(task);
  await renderTasks();

  if (navigator.onLine) {
    try {
      await syncOneTask(task);
    } catch (error) {
      console.warn(
        "La actualización queda pendiente:",
        error
      );
    }
  }

  await renderTasks();
  await updateCounters();
}

// ==========================================
// ACTIVIDAD 12: GEOLOCALIZACIÓN
// ==========================================

function getTaskLocation() {
  const status = $("taskLocationStatus");

  if (!("geolocation" in navigator)) {
    status.textContent =
      "Tu navegador no admite geolocalización. Puedes guardar sin ubicación.";

    return;
  }

  status.textContent =
    "Solicitando permiso para obtener la ubicación...";

  navigator.geolocation.getCurrentPosition(
    position => {
      currentTaskLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      status.textContent =
        `Ubicación obtenida: ${
          position.coords.latitude.toFixed(6)
        }, ${
          position.coords.longitude.toFixed(6)
        }`;
    },

    error => {
      currentTaskLocation = {
        latitude: null,
        longitude: null
      };

      const messages = {
        1: "Permiso denegado. Puedes guardar sin ubicación.",
        2: "Ubicación no disponible. Puedes guardar sin ubicación.",
        3: "Tiempo de espera agotado. Puedes guardar sin ubicación."
      };

      status.textContent =
        messages[error.code] ||
        "No se pudo obtener la ubicación. Puedes guardar sin ella.";
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

// ==========================================
// ACTIVIDAD 12: SINCRONIZACIÓN
// ==========================================

async function syncOneTask(task) {
  const response = await fetch("/api/sync", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      records: [
        {
          id: task.id,
          type: "tarea",

          title: task.titulo,
          detail: task.descripcion,

          fechaLimite: task.fechaLimite,
          estado: task.estado,

          latitud: task.latitud,
          longitud: task.longitud,

          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        }
      ]
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok) {
    throw new Error(
      result.error ||
      "El servidor no confirmó la sincronización."
    );
  }

  // El servidor confirmó la operación.
  task.synced = true;

  await CosmoDB.saveTask(task);

  return result;
}

async function syncPendingTasks() {
  if (!navigator.onLine) {
    showMessage(
      "No hay conexión. Las tareas siguen guardadas localmente.",
      "error"
    );

    return;
  }

  const tasks = (await CosmoDB.getAllTasks()).filter(
    task => !task.deleted && !task.synced
  );

  if (!tasks.length) {
    showMessage("No hay tareas pendientes de sincronización.");
    return;
  }

  $("syncTasksBtn").disabled = true;
  $("syncTasksBtn").textContent = "Sincronizando…";

  let succeeded = 0;

  try {
    for (const task of tasks) {
      try {
        await syncOneTask(task);
        succeeded++;
      } catch (error) {
        console.warn(
          "Tarea pendiente de sincronización:",
          task.id,
          error
        );
      }
    }

    await renderTasks();
    await updateCounters();

    showMessage(
      `Sincronización de tareas: ${succeeded} de ${tasks.length} completadas${
        succeeded < tasks.length
          ? ". Algunas siguen pendientes."
          : "."
      }`,
      succeeded === tasks.length ? "info" : "error"
    );
  } finally {
    $("syncTasksBtn").disabled = false;
    $("syncTasksBtn").textContent = "⇅ Sincronizar tareas";
  }
}

// ==========================================
// ACTIVIDAD 12: NOTIFICACIONES
// ==========================================

async function notifyTaskSaved(title) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    await registration.showNotification("Tarea guardada", {
      body: `Se guardó la tarea: ${title}`,
      icon: "/icons/icon.svg",
      tag: `task-saved-${makeId()}`,
      data: {
        url: "/"
      }
    });
  } catch (error) {
    console.warn(
      "No se pudo mostrar el aviso de tarea:",
      error
    );
  }
}

async function notifyPendingTasks() {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const tasks = (await CosmoDB.getAllTasks()).filter(
    task => !task.deleted && task.estado !== "completada"
  );

  if (!tasks.length) return;

  try {
    const registration = await navigator.serviceWorker.ready;

    await registration.showNotification(
      "Tienes tareas pendientes",
      {
        body: `Tienes ${tasks.length} tarea(s) sin completar.`,
        icon: "/icons/icon.svg",
        tag: "pending-tasks",
        data: {
          url: "/"
        }
      }
    );
  } catch (error) {
    console.warn(
      "No se pudo mostrar el aviso de tareas pendientes:",
      error
    );
  }
}

// ==========================================
// NOTIFICACIONES LOCALES EXISTENTES
// ==========================================

async function notifyNoteSavedLocally(title) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    await registration.showNotification(
      "Nota guardada en CosmoBitácora",
      {
        body: `La nota "${title}" se guardó en este dispositivo.`,
        icon: "/icons/icon.svg",
        tag: `nota-local-${Date.now()}`,
        data: {
          url: "/"
        }
      }
    );
  } catch (error) {
    console.warn(
      "No se pudo mostrar la notificación:",
      error
    );
  }
}

async function activateNotification() {
  const message = $("deviceMessage");

  if (!("Notification" in window)) {
    message.textContent =
      "Este navegador no admite notificaciones.";

    return;
  }

  if (!("serviceWorker" in navigator)) {
    message.textContent =
      "Este navegador no admite Service Workers.";

    return;
  }

  try {
    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      message.textContent =
        "No se concedió el permiso para notificaciones.";

      return;
    }

    const registration = await navigator.serviceWorker.ready;

    await registration.showNotification("CosmoBitácora", {
      body: "Ya puedes recibir avisos de tu aplicación.",
      icon: "/icons/icon.svg",
      data: {
        url: "/"
      }
    });

    message.textContent =
      "Notificación enviada correctamente.";
  } catch (error) {
    message.textContent =
      "No se pudo mostrar la notificación: " + error.message;
  }
}

// ==========================================
// GEOLOCALIZACIÓN GENERAL EXISTENTE
// ==========================================

function getDeviceLocation() {
  const message = $("deviceMessage");
  const result = $("locationResult");

  if (!("geolocation" in navigator)) {
    message.textContent =
      "Este navegador no admite geolocalización.";

    return;
  }

  message.textContent =
    "Solicitando permiso para consultar la ubicación...";

  navigator.geolocation.getCurrentPosition(
    position => {
      $("latitudeValue").textContent =
        position.coords.latitude.toFixed(6);

      $("longitudeValue").textContent =
        position.coords.longitude.toFixed(6);

      $("accuracyValue").textContent =
        Math.round(position.coords.accuracy);

      result.classList.remove("hidden");

      message.textContent =
        "Ubicación obtenida correctamente.";
    },

    error => {
      result.classList.add("hidden");

      const messages = {
        1: "Permiso de ubicación denegado.",
        2: "La ubicación no está disponible.",
        3: "Se agotó el tiempo de espera."
      };

      message.textContent =
        messages[error.code] || "No se pudo obtener la ubicación.";
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

// ==========================================
// NOTIFICACIONES PUSH EXISTENTES
// ==========================================

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat(
    (4 - base64String.length % 4) % 4
  );

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = window.atob(base64);

  return Uint8Array.from(
    raw,
    character => character.charCodeAt(0)
  );
}

async function subscribeToPush() {
  const message = $("deviceMessage");

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    message.textContent =
      "Este navegador no admite notificaciones push.";

    return;
  }

  if (!window.isSecureContext) {
    message.textContent =
      "Las notificaciones push requieren HTTPS o localhost.";

    return;
  }

  try {
    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      message.textContent =
        "No se autorizó el envío de notificaciones.";

      return;
    }

    const keyResponse = await fetch("/api/push/public-key");

    if (!keyResponse.ok) {
      throw new Error("No se pudo obtener la clave VAPID.");
    }

    const { publicKey } = await keyResponse.json();

    const registration = await navigator.serviceWorker.ready;

    let subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,

        applicationServerKey:
          urlBase64ToUint8Array(publicKey)
      });
    }

    const saveResponse = await fetch("/api/push/subscribe", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(subscription)
    });

    if (!saveResponse.ok) {
      throw new Error(
        "No se pudo guardar la suscripción en el servidor."
      );
    }

    message.textContent =
      "Suscripción push registrada correctamente.";
  } catch (error) {
    message.textContent =
      "Error al suscribirse: " + error.message;
  }
}

async function sendPushTest() {
  const message = $("deviceMessage");

  if (!navigator.onLine) {
    message.textContent =
      "Necesitas conexión para solicitar el envío.";

    return;
  }

  try {
    const response = await fetch("/api/push/test", {
      method: "POST"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Falló el envío.");
    }

    message.textContent = result.message;
  } catch (error) {
    message.textContent =
      "No se pudo enviar la notificación: " + error.message;
  }
}

// ==========================================
// CAMBIAR DE SECCIÓN
// ==========================================

async function setView(view) {
  currentView = view;

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  hideMessage();

  await renderView();
}

// ==========================================
// MIGRACIÓN DE DATOS EXISTENTES
// ==========================================

async function migrateLegacyLocalStorage() {
  try {
    const oldNotes = safeRead(NOTES_KEY, []);
    const oldQueue = safeRead(QUEUE_KEY, []);

    for (const note of oldNotes) {
      await CosmoDB.saveNote(note);
    }

    if (oldNotes.length) {
      localStorage.removeItem(NOTES_KEY);
    }

    for (const item of oldQueue) {
      await CosmoDB.addToSyncQueue(item);
    }

    if (oldQueue.length) {
      localStorage.removeItem(QUEUE_KEY);
    }
  } catch (error) {
    console.warn(
      "Aviso durante la migración de datos:",
      error
    );
  }
}

// ==========================================
// EVENTOS
// ==========================================

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

$("refreshBtn").addEventListener("click", loadArticles);

$("noteForm").addEventListener("submit", addNote);

$("syncBtn").addEventListener("click", syncPending);

$("loadServerBtn").addEventListener(
  "click",
  loadServerRecords
);

$("notificationBtn").addEventListener(
  "click",
  activateNotification
);

$("locationBtn").addEventListener(
  "click",
  getDeviceLocation
);

$("pushSubscribeBtn").addEventListener(
  "click",
  subscribeToPush
);

$("pushTestBtn").addEventListener(
  "click",
  sendPushTest
);

// Eventos de tareas.
$("taskForm").addEventListener(
  "submit",
  saveTaskFromForm
);

$("taskLocationBtn").addEventListener(
  "click",
  getTaskLocation
);

$("syncTasksBtn").addEventListener(
  "click",
  syncPendingTasks
);

$("cancelTaskBtn").addEventListener("click", () => {
  editingTaskId = null;

  currentTaskLocation = {
    latitude: null,
    longitude: null
  };

  $("taskForm").reset();

  $("taskFormTitle").textContent =
    "Registrar una tarea";

  $("taskLocationStatus").textContent =
    "La ubicación es opcional.";
});

$("taskList").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-task]");
  const toggleButton = event.target.closest("[data-toggle-task]");

  if (editButton) {
    editTask(editButton.dataset.editTask);
  }

  if (toggleButton) {
    toggleTaskState(toggleButton.dataset.toggleTask);
  }
});

// ==========================================
// CONEXIÓN Y SINCRONIZACIÓN
// ==========================================

window.addEventListener("online", async () => {
  updateConnection();

  try {
    const pending = await CosmoDB.countPending();

    if (pending > 0) {
      showMessage(
        `Conexión recuperada. Sincronizando ${pending} registro(s).`
      );

      await syncPending();
    }

    await syncPendingTasks();
    await loadArticles();
  } catch (error) {
    console.error("Error al recuperar conexión:", error);
  }
});

window.addEventListener("offline", () => {
  updateConnection();

  showMessage(
    "Sin conexión. Puedes consultar los datos guardados y crear tareas.",
    "error"
  );
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async event => {
    if (event.data?.type === "SYNC_COMPLETED") {
      showMessage(
        `Sincronización en segundo plano completada: ${
          event.data.count
        } registro(s).`
      );

      await renderJournal();
      await updateCounters();
      await loadServerRecords();
    }
  });
}

// ==========================================
// INICIAR APLICACIÓN
// ==========================================

async function boot() {
  updateConnection();

  try {
    await CosmoDB.openDB();

    await migrateLegacyLocalStorage();

    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register(
        "/service-worker.js"
      );
    }

    await loadArticles();

    await updateCounters();

    await renderTasks();
  } catch (error) {
    console.error("Error al iniciar la aplicación:", error);

    showMessage(
      "La aplicación se inició con un error: " + error.message,
      "error"
    );
  }

  setTimeout(() => {
    $("splash").classList.add("fade");

    setTimeout(() => {
      $("splash").classList.add("hidden");
      $("app").classList.remove("hidden");
    }, 500);
  }, 700);
}

boot();