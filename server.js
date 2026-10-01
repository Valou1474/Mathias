import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import nodemailer from "nodemailer";

const root = resolve(".");
const port = Number(process.env.PORT || 5173);
const photoEmailTo = "valentin.leblanc@ecoles-epsi.net";
const maxBodyBytes = 7 * 1024 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function loadEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    let body = "";

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        rejectBody(new Error("payload-too-large"));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolveBody(JSON.parse(body || "{}"));
      } catch {
        rejectBody(new Error("invalid-json"));
      }
    });

    req.on("error", rejectBody);
  });
}

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error("smtp-not-configured");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

function parsePhotoDataUrl(image) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(image || "");
  if (!match) return null;

  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length < 1000 || buffer.length > 5 * 1024 * 1024) return null;
  return buffer;
}

async function handlePhotoEmail(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { message: "Méthode non autorisée." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const image = parsePhotoDataUrl(body.image);

    if (body.consent !== true) {
      json(res, 400, { message: "Consentement requis avant l'envoi." });
      return;
    }

    if (!image) {
      json(res, 400, { message: "Photo invalide ou trop volumineuse." });
      return;
    }

    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: photoEmailTo,
      subject: "Photo PlexiDesign - exercice cybersécurité",
      text: [
        "Une photo a été envoyée depuis PlexiDesign avec consentement explicite.",
        `Destination affichée côté site : ${photoEmailTo}.`,
        `Date navigateur : ${body.sentAt || "non fournie"}.`
      ].join("\n"),
      attachments: [
        {
          filename: "photo-plexidesign.png",
          content: image,
          contentType: "image/png"
        }
      ]
    });

    json(res, 200, { ok: true });
  } catch (error) {
    const message = error.message === "smtp-not-configured"
      ? "Serveur SMTP non configuré."
      : "Impossible d'envoyer l'email.";
    json(res, 500, { message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = contentTypes[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

loadEnvFile();

createServer((req, res) => {
  if (req.url?.startsWith("/api/photo-email")) {
    handlePhotoEmail(req, res);
    return;
  }

  serveStatic(req, res);
}).listen(port, () => {
  console.log(`PlexiDesign running on http://127.0.0.1:${port}`);
});
