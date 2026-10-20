const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const initSqlJs = require("sql.js");

const root = path.resolve(__dirname, "..");
const auth = { Authorization: `Basic ${Buffer.from("test-admin:test-password").toString("base64")}` };
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=";

async function startServer(databasePath, trustProxy = "") {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: databasePath,
      ADMIN_USER: "test-admin", ADMIN_PASSWORD: "test-password", TRUST_PROXY: trustProxy },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Startup timeout: ${errors}`)); }, 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("PlexiDesign demarre")) { clearTimeout(timer); resolve(); }
    });
  });
  return {
    request: (url, options) => fetch(`http://127.0.0.1:${port}${url}`, options),
    stop: async () => { if (child.exitCode !== null) return; const done = once(child, "exit"); child.kill(); await done; }
  };
}

test("migration, metadata, authentication, private files and persistent deletion", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "plexidesign-test-"));
  const databasePath = path.join(temporary, "photos.sqlite");
  let server;
  try {
    // Reproduce the original schema and preserve an existing photo during migration.
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE photos (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL, image BLOB NOT NULL, size_bytes INTEGER NOT NULL,
      page_url TEXT, user_agent TEXT, client_sent_at TEXT, created_at TEXT NOT NULL)`);
    db.run("INSERT INTO photos (filename, mime_type, image, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)",
      ["old.png", "image/png", new Uint8Array([1, 2, 3]), 3, new Date().toISOString()]);
    fs.writeFileSync(databasePath, Buffer.from(db.export()));
    db.close();
    server = await startServer(databasePath);

    assert.equal((await server.request("/api/photos")).status, 401);
    for (const url of ["/data/photos.sqlite", "/database/schema.sql", "/server.js", "/node_modules/express/package.json", "/package.json"]) {
      assert.equal((await server.request(url)).status, 404, url);
    }
    for (const url of ["/", "/contact.html", "/admin", "/js/camera.js", "/css/style.css"]) {
      assert.equal((await server.request(url)).status, 200, url);
    }
    let listing = await (await server.request("/api/photos", { headers: auth })).json();
    assert.equal(listing.photos.length, 1);
    assert.equal(listing.photos[0].filename, "old.png");
    assert.equal(listing.photos[0].location, null);
    assert.equal(listing.photos[0].ipAddress, null);

    const timestamp = Date.now();
    const payload = { image, sentAt: new Date(timestamp).toISOString(),
      location: { latitude: 0, longitude: 2.35, accuracy: 12, timestamp } };
    const upload = await server.request("/api/photos", { method: "POST", headers: {
      "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.12"
    }, body: JSON.stringify(payload) });
    assert.equal(upload.status, 201);
    const saved = await upload.json();
    listing = await (await server.request("/api/photos", { headers: auth })).json();
    const photo = listing.photos.find((item) => item.id === saved.id);
    assert.equal(photo.ipAddress, "127.0.0.1", "untrusted forwarding header ignored");
    assert.deepEqual(photo.location, { latitude: 0, longitude: 2.35, accuracy: 12, recordedAt: new Date(timestamp).toISOString() });
    assert.equal(photo.clientSentAt, payload.sentAt);
    assert.equal((await server.request(photo.imageUrl)).status, 401);
    const downloaded = await server.request(photo.imageUrl, { headers: auth });
    assert.equal(downloaded.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(image.split(",")[1], "base64"));

    for (const location of [null, { latitude: 91, longitude: 0, accuracy: 1, timestamp },
      { latitude: "0", longitude: 0, accuracy: 1, timestamp }]) {
      const response = await server.request("/api/photos", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, location }) });
      assert.equal(response.status, location === null ? 201 : 400);
      if (location === null) {
        const created = await response.json();
        const withoutLocation = (await (await server.request("/api/photos", { headers: auth })).json()).photos.find((item) => item.id === created.id);
        assert.equal(withoutLocation.location, null);
      }
    }
    assert.equal((await server.request(`/api/photos/${saved.id}`, { method: "DELETE" })).status, 401);
    assert.equal((await server.request("/api/photos/invalid", { method: "DELETE", headers: auth })).status, 400);
    assert.equal((await server.request(`/api/photos/${saved.id}`, { method: "DELETE", headers: auth })).status, 200);
    assert.equal((await server.request(photo.imageUrl, { headers: auth })).status, 404);
    assert.equal((await server.request(`/api/photos/${saved.id}`, { method: "DELETE", headers: auth })).status, 404);

    await server.stop();
    server = await startServer(databasePath, "loopback");
    listing = await (await server.request("/api/photos", { headers: auth })).json();
    assert.equal(listing.photos.some((item) => item.id === saved.id), false, "deletion survives restart");
    assert.equal(listing.photos.some((item) => item.filename === "old.png"), true);
    const proxyUpload = await (await server.request("/api/photos", { method: "POST", headers: {
      "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.12"
    }, body: JSON.stringify({ image }) })).json();
    listing = await (await server.request("/api/photos", { headers: auth })).json();
    assert.equal(listing.photos.find((item) => item.id === proxyUpload.id).ipAddress, "198.51.100.12");
  } finally {
    if (server) await server.stop();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
