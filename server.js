const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "sync-records.json");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

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
app.post("/api/sync", (req, res) => {
  const incoming = Array.isArray(req.body.records) ? req.body.records : [];
  if (!incoming.length) return res.status(400).json({ error: "Envía records como arreglo." });

  const records = readRecords();
  const knownIds = new Set(records.map(r => r.id));
  const added = [];
  let duplicates = 0;

  for (const item of incoming) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) continue;
    if (knownIds.has(item.id)) { duplicates++; continue; }
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
    added.push(safe.id);
  }
  writeRecords(records);
  res.json({ ok: true, received: incoming.length, added: added.length, duplicatesIgnored: duplicates, total: records.length });
});

app.post("/api/subscribe", (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Suscripción inválida." });
  }
  res.json({ ok: true, message: "Suscripción registrada exitosamente." });
});

app.get("/api/sync", (_req, res) => res.json({ records: readRecords() }));

app.listen(PORT, () => console.log(`ExploraPWA disponible en http://localhost:${PORT}`));
