const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "sync-records.json");
const PUSH_FILE = path.join(DATA_DIR, "push-subscriptions.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(PUSH_FILE)) {
  fs.writeFileSync(PUSH_FILE, "[]", "utf8");
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

app.use(express.json({ limit: "1mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    setHeaders(res, filePath) {
      const name = path.basename(filePath);

      if (name === "service-worker.js" || name.endsWith(".html")) {
        // El service worker y el HTML siempre se revalidan.
        res.setHeader("Cache-Control", "no-cache");
      } else if (/\.(svg|png|jpe?g|webp|ico|woff2?)$/i.test(name)) {
        res.setHeader("Cache-Control", "public, max-age=2592000");
      } else {
        res.setHeader(
          "Cache-Control",
          "public, max-age=86400, stale-while-revalidate=604800"
        );
      }
    }
  })
);

function readSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(PUSH_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeSubscriptions(subscriptions) {
  fs.writeFileSync(
    PUSH_FILE,
    JSON.stringify(subscriptions, null, 2),
    "utf8"
  );
}

function readRecords() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeRecords(records) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(records, null, 2),
    "utf8"
  );
}

async function sendPushToSubscribers(payload) {
  const subscriptions = readSubscriptions();
  let sent = 0;
  const invalidEndpoints = new Set();

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify(payload)
        );
        sent++;
      } catch (error) {
        console.error(
          "[Push] Error al enviar:",
          error.statusCode || error.message
        );

        if (error.statusCode === 404 || error.statusCode === 410) {
          invalidEndpoints.add(subscription.endpoint);
        }
      }
    })
  );

  if (invalidEndpoints.size > 0) {
    writeSubscriptions(
      readSubscriptions().filter(
        (subscription) => !invalidEndpoints.has(subscription.endpoint)
      )
    );
  }

  return { sent };
}

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (pushConfigured) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn("[Push] Faltan claves VAPID.");
}

app.get("/api/push/public-key", (_req, res) => {
  if (!pushConfigured) {
    return res.status(503).json({
      error: "Las notificaciones push no están configuradas."
    });
  }

  res.set("Cache-Control", "no-store");
  res.json({ publicKey: vapidPublicKey });
});

app.post("/api/push/subscribe", (req, res) => {
  if (!pushConfigured) {
    return res.status(503).json({
      error: "Las notificaciones push no están configuradas."
    });
  }

  const subscription = req.body;

  if (
    !subscription ||
    !subscription.endpoint ||
    !subscription.keys ||
    !subscription.keys.p256dh ||
    !subscription.keys.auth
  ) {
    return res.status(400).json({
      error: "La suscripción push no es válida."
    });
  }

  const subscriptions = readSubscriptions();
  const exists = subscriptions.some(
    (item) => item.endpoint === subscription.endpoint
  );

  if (!exists) {
    subscriptions.push(subscription);
    writeSubscriptions(subscriptions);
  }

  res.status(201).json({
    ok: true,
    message: "Suscripción push guardada."
  });
});

app.post("/api/push/test", async (_req, res) => {
  if (!pushConfigured) {
    return res.status(503).json({
      error: "Las notificaciones push no están configuradas."
    });
  }

  const subscriptions = readSubscriptions();

  if (!subscriptions.length) {
    return res.status(404).json({
      error: "No hay dispositivos suscritos."
    });
  }

  const payload = JSON.stringify({
    title: "CosmoBitácora",
    body: "Notificación push recibida desde el servidor",
    url: "/"
  });

  let sent = 0;
  const invalidEndpoints = new Set();

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (error) {
      console.error("[Push] Error de envío:", error.statusCode);
      if (error.statusCode === 404 || error.statusCode === 410) {
        invalidEndpoints.add(subscription.endpoint);
      }
    }
  }

  if (invalidEndpoints.size) {
    writeSubscriptions(
      readSubscriptions().filter(
        (item) => !invalidEndpoints.has(item.endpoint)
      )
    );
  }

  res.json({
    ok: true,
    sent,
    removedExpired: invalidEndpoints.size,
    message: `Notificaciones enviadas: ${sent}.`
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ExploraPWA Sync API" });
});

app.get("/api/sync", (_req, res) => {
  res.json({ records: readRecords() });
});

app.post("/api/sync", async (req, res) => {
  const incoming = Array.isArray(req.body.records)
    ? req.body.records
    : [];

  if (!incoming.length) {
    return res.status(400).json({
      error: "Envía records como arreglo."
    });
  }

  const records = readRecords();
  const added = [];
  let updated = 0;

  for (const item of incoming) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id.trim()
    ) {
      continue;
    }

    const safe = {
      id: item.id,
      type: String(item.type || "nota").slice(0, 40),
      title: String(item.title || item.titulo || "Registro sin título").slice(0, 180),
      detail: String(item.detail || item.descripcion || "").slice(0, 2000),
      prioridad: String(item.prioridad || "media").slice(0, 20),
      fechaRegistro: String(item.fechaRegistro || item.createdAt || new Date().toISOString()),
      fechaLimite: item.fechaLimite ? String(item.fechaLimite) : null,
      estado: item.estado ? String(item.estado).slice(0, 30) : null,
      latitud: typeof item.latitud === "number" ? item.latitud : null,
      longitud: typeof item.longitud === "number" ? item.longitud : null,
      createdAt: String(item.createdAt || item.fechaRegistro || new Date().toISOString()),
      updatedAt: String(item.updatedAt || new Date().toISOString()),
      syncedAt: new Date().toISOString()
    };

    const existingIndex = records.findIndex((r) => r.id === safe.id);

    if (existingIndex >= 0) {
      records[existingIndex] = safe;
      updated++;
    } else {
      records.push(safe);
      added.push(safe);
    }
  }

  writeRecords(records);

  let pushSent = 0;

  if (added.length > 0 && pushConfigured) {
    const title =
      added.length === 1
        ? "Registro sincronizado"
        : "Registros sincronizados";

    const body =
      added.length === 1
        ? `Se sincronizó "${added[0].title}".`
        : `Se sincronizaron ${added.length} registros.`;

    const result = await sendPushToSubscribers({
      title,
      body,
      url: "/"
    });

    pushSent = result.sent;
  }

  res.json({
    ok: true,
    received: incoming.length,
    added: added.length,
    updated,
    total: records.length,
    pushSent,
    message: `Agregados: ${added.length}. Actualizados: ${updated}.`
  });
});

app.delete("/api/sync/:id", (req, res) => {
  const { id } = req.params;
  const records = readRecords();
  const filtered = records.filter((record) => record.id !== id);

  if (filtered.length !== records.length) {
    writeRecords(filtered);
    return res.json({ ok: true, deleted: id });
  }

  res.json({ ok: true, deleted: null });
});

app.listen(PORT, () => {
  console.log(`ExploraPWA disponible en http://localhost:${PORT}`);
});
