const API_URL = "https://api.spaceflightnewsapi.net/v4/articles/?limit=12";
const $ = (id) => document.getElementById(id);
const FAVORITES_KEY = "cosmobitacora_favorites_v1";
const NOTES_KEY = "cosmobitacora_notes_v1";
const QUEUE_KEY = "cosmobitacora_sync_queue_v1";
let articles = [];
let currentView = "noticias";

function safeRead(key, fallback = []) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; }
  catch { return fallback; }
}
function safeWrite(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
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
function hideMessage() { $("message").classList.add("hidden"); }

async function loadArticles() {
  hideMessage();
  $("newsGrid").innerHTML = '<div class="empty">Buscando noticias espaciales…</div>';
  if (!navigator.onLine) {
    articles = safeRead("cosmobitacora_cached_articles_v1");
    if (articles.length) {
      showMessage("Estás sin conexión. Se muestran las noticias guardadas anteriormente en este dispositivo.");
      renderView();
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
    articles = (data.results || []).map(a => ({
      id: String(a.id),
      title: a.title || "Noticia espacial",
      summary: a.summary || "",
      image: a.image_url || "",
      url: a.url || "#",
      published: a.published_at || "",
      source: a.news_site || "Spaceflight News"
    }));
    safeWrite("cosmobitacora_cached_articles_v1", articles);
    renderView();
  } catch (error) {
    articles = safeRead("cosmobitacora_cached_articles_v1");
    if (articles.length) {
      showMessage("No se pudo contactar la API. Se muestran las noticias guardadas localmente.");
      renderView();
    } else {
      $("newsGrid").innerHTML = '<div class="empty">No fue posible obtener noticias. Revisa la conexión e inténtalo de nuevo.</div>';
      showMessage("Error al consultar la API externa: " + error.message, "error");
    }
  }
}

function renderView() {
  updateCounters();
  $("newsGrid").classList.toggle("hidden", currentView === "bitacora");
  $("journalPanel").classList.toggle("hidden", currentView !== "bitacora");
  $("sourceBadge").textContent = navigator.onLine ? "API externa · en vivo" : "Contenido local";
  if (currentView === "bitacora") { renderJournal(); return; }
  let list = articles;
  if (currentView === "favoritos") {
    const ids = new Set(safeRead(FAVORITES_KEY).map(x => String(x.id)));
    list = articles.filter(a => ids.has(String(a.id)));
    $("sectionEyebrow").textContent = "TU COLECCIÓN";
    $("sectionTitle").textContent = "Noticias favoritas";
  } else {
    $("sectionEyebrow").textContent = "ACTUALIDAD ESPACIAL";
    $("sectionTitle").textContent = "Últimas noticias";
  }
  if (!list.length) {
    $("newsGrid").innerHTML = `<div class="empty">${currentView === "favoritos" ? "Aún no guardas favoritos. Presiona “Guardar” en una noticia." : "No hay noticias disponibles."}</div>`;
    return;
  }
  $("newsGrid").innerHTML = list.map(a => {
    const saved = safeRead(FAVORITES_KEY).some(x => String(x.id) === String(a.id));
    const date = a.published ? new Date(a.published).toLocaleDateString("es-MX", { year:"numeric", month:"short", day:"numeric" }) : "Fecha no disponible";
    return `<article class="news-card">
      ${a.image ? `<img class="news-image" src="${escapeHTML(a.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<div class="news-image placeholder">✦</div>`}
      <div class="news-body"><div class="card-meta">${escapeHTML(a.source)} · ${escapeHTML(date)}</div>
      <h3>${escapeHTML(a.title)}</h3><p>${escapeHTML(summarize(a.summary || "Consulta la publicación original para conocer más detalles.", 155))}</p>
      <div class="card-actions"><button class="small-btn ${saved ? "saved" : ""}" data-fav="${escapeHTML(a.id)}">${saved ? "★ Guardada" : "☆ Guardar"}</button><a class="small-btn link" href="${escapeHTML(a.url)}" target="_blank" rel="noopener noreferrer">Leer noticia ↗</a></div></div></article>`;
  }).join("");
  $("newsGrid").querySelectorAll("[data-fav]").forEach(btn => btn.addEventListener("click", () => toggleFavorite(btn.dataset.fav)));
}
function toggleFavorite(id) {
  const favorites = safeRead(FAVORITES_KEY);
  const existing = favorites.some(x => String(x.id) === String(id));
  let next;
  if (existing) next = favorites.filter(x => String(x.id) !== String(id));
  else {
    const article = articles.find(x => String(x.id) === String(id));
    if (!article) return;
    next = [...favorites, article];
  }
  safeWrite(FAVORITES_KEY, next);
  renderView();
}
function updateCounters() {
  $("favCount").textContent = safeRead(FAVORITES_KEY).length;
  $("pendingCount").textContent = safeRead(QUEUE_KEY).length;
}
function renderJournal() {
  $("sectionEyebrow").textContent = "ALMACENAMIENTO LOCAL Y REMOTO";
  $("sectionTitle").textContent = "Mi bitácora";
  const notes = safeRead(NOTES_KEY);
  $("journalList").innerHTML = notes.length ? notes.slice().reverse().map(n => `<article class="journal-item"><h4>${escapeHTML(n.title)}</h4><p>${escapeHTML(n.detail || "Sin descripción")}</p><small>${escapeHTML(new Date(n.createdAt).toLocaleString("es-MX"))} · ${n.synced ? "Sincronizado" : "Pendiente de sincronizar"}</small></article>`).join("") : '<div class="empty">Todavía no hay notas. Puedes crear una incluso sin conexión.</div>';
}
function addNote(event) {
  event.preventDefault();
  const title = $("noteTitle").value.trim();
  const detail = $("noteDetail").value.trim();
  if (!title) return;
  const note = { id: makeId(), type: "nota", title, detail, createdAt: new Date().toISOString(), synced: false };
  const notes = safeRead(NOTES_KEY); notes.push(note); safeWrite(NOTES_KEY, notes);
  const queue = safeRead(QUEUE_KEY); queue.push({ id: note.id, type: note.type, title: note.title, detail: note.detail, createdAt: note.createdAt }); safeWrite(QUEUE_KEY, queue);
  $("noteForm").reset();
  showMessage(navigator.onLine ? "Nota guardada en el dispositivo. Puedes sincronizarla con el servidor." : "Nota guardada sin conexión. Se enviará cuando recuperes internet.");
  renderJournal(); updateCounters();
}
async function syncPending() {
  const queue = safeRead(QUEUE_KEY);
  if (!queue.length) { showMessage("No hay registros pendientes de sincronización."); return; }
  if (!navigator.onLine) { showMessage("No hay conexión. Los registros siguen guardados en este dispositivo.", "error"); return; }
  $("syncBtn").disabled = true; $("syncBtn").textContent = "Sincronizando…";
  try {
    const response = await fetch("/api/sync", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ records:queue }) });
    if (!response.ok) throw new Error(`Servidor respondió ${response.status}`);
    const result = await response.json();
    const ids = new Set(queue.map(x => x.id));
    safeWrite(QUEUE_KEY, safeRead(QUEUE_KEY).filter(x => !ids.has(x.id)));
    safeWrite(NOTES_KEY, safeRead(NOTES_KEY).map(n => ids.has(n.id) ? { ...n, synced:true } : n));
    showMessage(`Sincronización completada. Nuevos registros: ${result.added}. Duplicados ignorados: ${result.duplicatesIgnored}.`);
    renderJournal(); updateCounters();
    await loadServerRecords();
  } catch (error) {
    showMessage("No se pudo sincronizar. Los datos siguen guardados y puedes reintentar. " + error.message, "error");
  } finally {
    $("syncBtn").disabled = false; $("syncBtn").textContent = "⇅ Sincronizar pendientes";
  }
}
async function loadServerRecords() {
  if (!navigator.onLine) { $("serverList").innerHTML = '<p class="empty">El servidor no está disponible sin conexión.</p>'; return; }
  try {
    const response = await fetch("/api/sync");
    if (!response.ok) throw new Error("No se pudieron consultar los registros.");
    const data = await response.json();
    $("serverList").innerHTML = data.records.length ? data.records.slice().reverse().map(r => `<div class="server-record"><strong>${escapeHTML(r.title)}</strong><br><span>${escapeHTML(r.detail || "Sin descripción")}</span><br><small>Recibido: ${escapeHTML(new Date(r.syncedAt).toLocaleString("es-MX"))}</small></div>`).join("") : "<p>Aún no hay registros recibidos.</p>";
  } catch (error) { $("serverList").textContent = error.message; }
}
function setView(view) {
  currentView = view;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  hideMessage();
  renderView();
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
$("refreshBtn").addEventListener("click", loadArticles);
$("noteForm").addEventListener("submit", addNote);
$("syncBtn").addEventListener("click", syncPending);
$("loadServerBtn").addEventListener("click", loadServerRecords);
window.addEventListener("online", () => { updateConnection(); if (safeRead(QUEUE_KEY).length) showMessage("Conexión recuperada. Pulsa “Sincronizar pendientes” para enviar tus notas."); loadArticles(); });
window.addEventListener("offline", () => { updateConnection(); showMessage("Sin conexión. Puedes consultar contenido guardado y crear notas.", "error"); });
window.addEventListener("storage", updateCounters);

async function boot() {
  updateConnection();
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("/service-worker.js"); }
    catch (error) { console.error("No se pudo registrar el Service Worker", error); }
  }
  await loadArticles();
  setTimeout(() => {
    $("splash").classList.add("fade");
    setTimeout(() => { $("splash").classList.add("hidden"); $("app").classList.remove("hidden"); }, 500);
  }, 700);
}
boot();
