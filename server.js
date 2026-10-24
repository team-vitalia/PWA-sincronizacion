const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "sync-records.json");
// Crear la carpeta antes de crear los archivos de datos.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));


/* ACTIVIDAD 10: CONFIGURACIÓN DE NOTIFICACIONES PUSH */

const PUSH_FILE = path.join(DATA_DIR, "push-subscriptions.json");

if (!fs.existsSync(PUSH_FILE)) {
  fs.writeFileSync(PUSH_FILE, "[]", "utf8");
}

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


/* ACTIVIDAD 10: ENVÍO AUTOMÁTICO DE NOTIFICACIONES PUSH */

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

        // Eliminar suscripciones que ya no existen.
        if (
          error.statusCode === 404 ||
          error.statusCode === 410
        ) {
          invalidEndpoints.add(subscription.endpoint);
        }
      }
    })
  );

  if (invalidEndpoints.size > 0) {
    writeSubscriptions(
      readSubscriptions().filter(
        (subscription) =>
          !invalidEndpoints.has(subscription.endpoint)
      )
    );
  }

  return { sent };
}


const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

const pushConfigured =
  Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (pushConfigured) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn(
    "[Push] Faltan claves VAPID. Configura el archivo .env."
  );
}

// Entregar al navegador únicamente la clave pública.
app.get("/api/push/public-key", (_req, res) => {
  if (!pushConfigured) {
    return res.status(503).json({
      error: "Las notificaciones push no están configuradas."
    });
  }

  res.set("Cache-Control", "no-store");
  res.json({ publicKey: vapidPublicKey });
});

// Guardar la suscripción creada por el navegador.
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

// Enviar una notificación de prueba a las suscripciones guardadas.
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
    body: "¡Notificación push recibida desde el servidor!",
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

      // 404 y 410 indican que la suscripción ya no es válida.
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


if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");

function readRecords() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return []; }
}
function writeRecords(records) {
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), "utf8");
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ExploraPWA Sync API" }));

// Idempotencia: cada registro tiene un id creado por el cliente. Si se reenvía,
// el servidor no lo duplica.
//1

/* ACTIVIDAD 10: SINCRONIZAR NOTAS Y NOTIFICAR POR PUSH */

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
  const knownIds = new Set(records.map((record) => record.id));

  const added = [];
  let duplicates = 0;

  for (const item of incoming) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id.trim()
    ) {
      continue;
    }

    // No volver a registrar ni notificar registros duplicados.
    if (knownIds.has(item.id)) {
      duplicates++;
      continue;
    }

    const safe = {
      id: item.id,
      type: String(item.type || "nota").slice(0, 40),
      title: String(item.title || "Registro sin título").slice(0, 180),
      detail: String(item.detail || "").slice(0, 2000),
      createdAt: String(item.createdAt || new Date().toISOString()),
      syncedAt: new Date().toISOString()
    };

    records.push(safe);
    knownIds.add(safe.id);
    added.push(safe);
  }

  // Guardar primero los registros en el servidor.
  writeRecords(records);

  let pushSent = 0;

  // Enviar push solamente cuando hay registros nuevos.
  if (added.length > 0 && pushConfigured) {
    const title =
      added.length === 1
        ? "¡Nota sincronizada en CosmoBitácora!"
        : "¡Notas sincronizadas en CosmoBitácora!";

    const body =
      added.length === 1
        ? `El servidor recibió la nota "${added[0].title}".`
        : `El servidor recibió ${added.length} notas nuevas.`;

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
    duplicatesIgnored: duplicates,
    total: records.length,
    pushSent,
    message:
      added.length > 0
        ? `Registros nuevos: ${added.length}. Push enviados: ${pushSent}.`
        : "No hay registros nuevos; no se enviaron notificaciones push."
  });
});


app.get("/api/sync", (_req, res) => res.json({ records: readRecords() }));

app.listen(PORT, () => console.log(`ExploraPWA disponible en http://localhost:${PORT}`));
