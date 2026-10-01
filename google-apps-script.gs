const DRIVE_FOLDER_ID = "PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE";

const ALLOWED_ORIGINS = [
  "https://valou1474.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function doGet() {
  return HtmlService
    .createHtmlOutput(getBridgeHtml())
    .setTitle("PlexiDesign Google Drive Upload")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function savePhoto(payload) {
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID === "PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE") {
    throw new Error("ID du dossier Google Drive non configuré.");
  }

  if (!payload || typeof payload.image !== "string") {
    throw new Error("Photo manquante.");
  }

  const match = payload.image.match(/^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Format invalide. Envoyez une image JPEG en base64.");
  }

  const bytes = Utilities.base64Decode(match[1]);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Photo vide ou trop volumineuse.");
  }

  const filename = sanitizeFilename(payload.filename || createPhotoFilename());
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const blob = Utilities.newBlob(bytes, MimeType.JPEG, filename);
  const file = folder.createFile(blob);

  return {
    ok: true,
    fileId: file.getId(),
    filename: file.getName()
  };
}

function createPhotoFilename() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || "Europe/Paris",
    "'photo_'yyyy-MM-dd_HH-mm-ss'.jpg'"
  );
}

function sanitizeFilename(filename) {
  const safe = String(filename)
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

  return safe.toLowerCase().endsWith(".jpg") ? safe : `${safe}.jpg`;
}

function getBridgeHtml() {
  const allowedOrigins = JSON.stringify(ALLOWED_ORIGINS);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PlexiDesign Upload Bridge</title>
  </head>
  <body>
    <script>
      const ALLOWED_ORIGINS = ${allowedOrigins};

      window.addEventListener("message", (event) => {
        const data = event.data || {};

        if (data.type !== "PLEXIDESIGN_PHOTO_UPLOAD") return;

        if (!ALLOWED_ORIGINS.includes(event.origin)) {
          event.source.postMessage({
            type: "PLEXIDESIGN_PHOTO_UPLOAD_RESULT",
            requestId: data.requestId,
            ok: false,
            message: "Origine non autorisée : " + event.origin
          }, event.origin);
          return;
        }

        google.script.run
          .withSuccessHandler((result) => {
            event.source.postMessage({
              type: "PLEXIDESIGN_PHOTO_UPLOAD_RESULT",
              requestId: data.requestId,
              ok: true,
              result
            }, event.origin);
          })
          .withFailureHandler((error) => {
            event.source.postMessage({
              type: "PLEXIDESIGN_PHOTO_UPLOAD_RESULT",
              requestId: data.requestId,
              ok: false,
              message: error && error.message ? error.message : "Erreur Google Apps Script."
            }, event.origin);
          })
          .savePhoto(data.payload);
      });
    </script>
  </body>
</html>`;
}
