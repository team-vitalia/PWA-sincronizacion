(function (global) {
  const DB_NAME = "CosmoBitacoraDB";
  const DB_VERSION = 2;

  const STORES = {
    NOTES: "notes",
    SYNC_QUEUE: "sync_queue",
    TASKS: "tasks"
  };

  let dbPromise = null;

  function openDB() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const idb =
        global.indexedDB ||
        global.mozIndexedDB ||
        global.webkitIndexedDB ||
        global.msIndexedDB;

      if (!idb) {
        reject(new Error("IndexedDB no está disponible."));
        return;
      }

      const request = idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORES.NOTES)) {
          const notesStore = db.createObjectStore(STORES.NOTES, { keyPath: "id" });
          notesStore.createIndex("by_createdAt", "createdAt", { unique: false });
          notesStore.createIndex("by_synced", "synced", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: "id" });
          queueStore.createIndex("by_createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.TASKS)) {
          const tasksStore = db.createObjectStore(STORES.TASKS, { keyPath: "id" });
          tasksStore.createIndex("by_fechaLimite", "fechaLimite", { unique: false });
          tasksStore.createIndex("by_estado", "estado", { unique: false });
          tasksStore.createIndex("by_synced", "synced", { unique: false });
        }
      };

      request.onsuccess = event => {
        const db = event.target.result;

        db.onclose = () => {
          dbPromise = null;
        };

        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };

        resolve(db);
      };

      request.onerror = event => {
        dbPromise = null;
        reject(event.target.error || new Error("Error al abrir IndexedDB."));
      };

      request.onblocked = () => {
        console.warn("Actualización bloqueada de IndexedDB.");
      };
    });

    return dbPromise;
  }

  async function saveNote(note) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.NOTES], "readwrite");
      tx.objectStore(STORES.NOTES).put(note);
      tx.oncomplete = () => resolve(note);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function getNote(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.NOTES], "readonly");
      const request = tx.objectStore(STORES.NOTES).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllNotes() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.NOTES], "readonly");
      const request = tx.objectStore(STORES.NOTES).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteNote(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.NOTES], "readwrite");
      tx.objectStore(STORES.NOTES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function markNotesAsSynced(ids) {
    if (!ids) return;
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.NOTES], "readwrite");
      const store = tx.objectStore(STORES.NOTES);
      for (const id of list) {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) {
            store.put({
              ...request.result,
              synced: true
            });
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function addToSyncQueue(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], "readwrite");
      tx.objectStore(STORES.SYNC_QUEUE).put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function getSyncQueue() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], "readonly");
      const request = tx.objectStore(STORES.SYNC_QUEUE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function removeFromSyncQueue(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], "readwrite");
      tx.objectStore(STORES.SYNC_QUEUE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function removeManyFromSyncQueue(ids) {
    if (!ids) return;
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], "readwrite");
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      for (const id of list) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function countPending() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], "readonly");
      const request = tx.objectStore(STORES.SYNC_QUEUE).count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveTask(task) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.TASKS], "readwrite");
      tx.objectStore(STORES.TASKS).put(task);
      tx.oncomplete = () => resolve(task);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function getAllTasks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.TASKS], "readonly");
      const request = tx.objectStore(STORES.TASKS).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function getTask(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.TASKS], "readonly");
      const request = tx.objectStore(STORES.TASKS).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteTask(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.TASKS], "readwrite");
      tx.objectStore(STORES.TASKS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function markTaskAsSynced(id, synced = true) {
    const task = await getTask(id);
    if (!task) return null;
    task.synced = synced;
    return saveTask(task);
  }

  global.CosmoDB = {
    openDB,
    saveNote,
    getNote,
    getAllNotes,
    deleteNote,
    markNotesAsSynced,
    addToSyncQueue,
    getSyncQueue,
    removeFromSyncQueue,
    removeManyFromSyncQueue,
    countPending,
    saveTask,
    getAllTasks,
    getTask,
    deleteTask,
    markTaskAsSynced,
    STORES
  };
})(typeof self !== "undefined" ? self : this);
