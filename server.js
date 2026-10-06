const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const express = require("express");
const initSqlJs = require("sql.js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "photos.sqlite");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-moi";

if (!process.env.ADMIN_PASSWORD) {
  console.warn("Attention: ADMIN_PASSWORD n'est pas defini. Mot de passe admin par defaut: change-moi");
}

fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: "8mb" }));

let db = null;

function persistDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DATABASE_PATH, Buffer.from(data));
}

function all(sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];

  try {
    statement.bind(params);
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  persistDatabase();
}

function insert(sql, params = []) {
  db.run(sql, params);
  const row = get("SELECT last_insert_rowid() AS id");
  persistDatabase();
  return row ? Number(row.id) : null;
}

function timingSafeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBasicAuth(header) {
  if (!header || !header.startsWith("Basic ")) return null;

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return null;

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

function requireAdmin(req, res, next) {
  const credentials = readBasicAuth(req.get("authorization"));
  const isValid = credentials
    && timingSafeTextEqual(credentials.username, ADMIN_USER)
    && timingSafeTextEqual(credentials.password, ADMIN_PASSWORD);

  if (!isValid) {
    res.set("WWW-Authenticate", 'Basic realm="PlexiDesign Admin"');
    res.status(401).json({ ok: false, message: "Identifiants admin invalides." });
    return;
  }

  next();
}

function parseImageDataUrl(image) {
  if (typeof image !== "string") {
    throw new Error("Image manquante.");
  }

  const match = image.match(/^data:(image\/jpe?g|image\/png);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("Format image invalide. Utilise JPEG ou PNG en base64.");
  }

  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Image vide.");
  }

  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new Error("Image trop lourde. Taille maximale: 5 Mo.");
  }

  return {
    buffer,
    mimeType,
    extension: mimeType === "image/png" ? ".png" : ".jpg"
  };
}

function formatDateForFilename(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

function createUniqueFilename(extension, date = new Date()) {
  const base = `photo_${formatDateForFilename(date)}`;
  let filename = `${base}${extension}`;
  let counter = 2;

  while (get("SELECT 1 FROM photos WHERE filename = ?", [filename])) {
    filename = `${base}_${counter}${extension}`;
    counter += 1;
  }

  return filename;
}

function createImageUrl(id) {
  return `/api/photos/${id}/image`;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, database: path.basename(DATABASE_PATH) });
});

app.post("/api/photos", (req, res) => {
  try {
    const { image, pageUrl, sentAt } = req.body || {};
    const parsed = parseImageDataUrl(image);
    const now = new Date();
    const filename = createUniqueFilename(parsed.extension, now);
    const createdAt = now.toISOString();

    const id = insert(`
      INSERT INTO photos (filename, mime_type, image, size_bytes, page_url, user_agent, client_sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      filename,
      parsed.mimeType,
      new Uint8Array(parsed.buffer),
      parsed.buffer.length,
      typeof pageUrl === "string" ? pageUrl.slice(0, 500) : null,
      req.get("user-agent") || null,
      typeof sentAt === "string" ? sentAt.slice(0, 80) : null,
      createdAt
    ]);

    res.status(201).json({
      ok: true,
      id,
      filename,
      createdAt
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message || "Impossible d'enregistrer la photo."
    });
  }
});

app.get("/api/photos", requireAdmin, (req, res) => {
  const rawLimit = Number(req.query.limit || 80);
  const limit = Math.min(150, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 80));
  const rows = all(`
    SELECT id, filename, mime_type, size_bytes, page_url, client_sent_at, created_at
    FROM photos
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `, [limit]);

  res.json({
    ok: true,
    photos: rows.map((photo) => ({
      id: photo.id,
      filename: photo.filename,
      mimeType: photo.mime_type,
      sizeBytes: photo.size_bytes,
      pageUrl: photo.page_url,
      clientSentAt: photo.client_sent_at,
      createdAt: photo.created_at,
      imageUrl: createImageUrl(photo.id)
    }))
  });
});

app.get("/api/photos/:id/image", requireAdmin, (req, res) => {
  const photo = get(
    "SELECT id, filename, mime_type, image, size_bytes, created_at FROM photos WHERE id = ?",
    [Number(req.params.id)]
  );

  if (!photo) {
    res.status(404).json({ ok: false, message: "Photo introuvable." });
    return;
  }

  const image = Buffer.from(photo.image);

  res.set({
    "Content-Type": photo.mime_type,
    "Content-Length": image.length,
    "Content-Disposition": `inline; filename="${photo.filename}"`,
    "Cache-Control": "no-store"
  });
  res.send(image);
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  index: "index.html"
}));

app.use((req, res) => {
  res.status(404).send("Page introuvable.");
});

async function start() {
  const wasmDirectory = path.dirname(require.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDirectory, file)
  });

  if (fs.existsSync(DATABASE_PATH)) {
    db = new SQL.Database(fs.readFileSync(DATABASE_PATH));
  } else {
    db = new SQL.Database();
  }

  const schema = fs.readFileSync(path.join(__dirname, "database", "schema.sql"), "utf8");
  run(schema);

  app.listen(PORT, HOST, () => {
    console.log(`PlexiDesign demarre sur http://${HOST}:${PORT}`);
    console.log(`Page admin: http://${HOST}:${PORT}/admin.html`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
