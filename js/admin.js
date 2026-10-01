const AUTH_KEY = "plexidesign-admin-auth";

const loginForm = document.querySelector("[data-admin-login]");
const panel = document.querySelector("[data-admin-panel]");
const grid = document.querySelector("[data-admin-grid]");
const statusNode = document.querySelector("[data-admin-status]");
const countNode = document.querySelector("[data-admin-count]");
const refreshButton = document.querySelector("[data-admin-refresh]");
const logoutButton = document.querySelector("[data-admin-logout]");

const objectUrls = new Set();
const photoBlobs = new Map();

function setStatus(message, type = "info") {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.dataset.status = type;
}

function encodeBasic(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function getCredentials() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCredentials(username, password) {
  window.sessionStorage.setItem(AUTH_KEY, JSON.stringify({ username, password }));
}

function clearCredentials() {
  window.sessionStorage.removeItem(AUTH_KEY);
}

function getAuthHeaders() {
  const credentials = getCredentials();
  if (!credentials) return null;

  return {
    Authorization: `Basic ${encodeBasic(credentials.username, credentials.password)}`
  };
}

async function adminFetch(url, options = {}) {
  const headers = getAuthHeaders();
  if (!headers) {
    throw new Error("Connexion admin requise.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    clearCredentials();
    throw new Error("Identifiants admin invalides.");
  }

  return response;
}

function showLogin() {
  if (loginForm) loginForm.hidden = false;
  if (panel) panel.hidden = true;
}

function showPanel() {
  if (loginForm) loginForm.hidden = true;
  if (panel) panel.hidden = false;
}

function clearObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
  photoBlobs.clear();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

async function loadImage(photo, img, downloadButton) {
  try {
    const response = await adminFetch(photo.imageUrl);
    if (!response.ok) throw new Error("Image introuvable.");

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.add(objectUrl);
    photoBlobs.set(photo.id, { blob, objectUrl });
    img.src = objectUrl;
    downloadButton.disabled = false;
  } catch (error) {
    img.alt = error.message || "Image impossible à charger.";
  }
}

async function downloadPhoto(photo) {
  let cached = photoBlobs.get(photo.id);

  if (!cached) {
    const response = await adminFetch(photo.imageUrl);
    if (!response.ok) throw new Error("Téléchargement impossible.");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.add(objectUrl);
    cached = { blob, objectUrl };
    photoBlobs.set(photo.id, cached);
  }

  const link = document.createElement("a");
  link.href = cached.objectUrl;
  link.download = photo.filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function renderEmptyState() {
  if (!grid) return;

  const empty = document.createElement("div");
  empty.className = "admin-empty";
  empty.textContent = "Aucune photo enregistrée pour le moment.";
  grid.append(empty);
}

function renderPhotos(photos) {
  clearObjectUrls();
  if (!grid) return;

  grid.replaceChildren();

  if (countNode) {
    countNode.textContent = `${photos.length} photo${photos.length > 1 ? "s" : ""} affichée${photos.length > 1 ? "s" : ""}`;
  }

  if (!photos.length) {
    renderEmptyState();
    return;
  }

  photos.forEach((photo) => {
    const card = document.createElement("article");
    card.className = "admin-photo-card";

    const media = document.createElement("div");
    media.className = "admin-photo-media";

    const img = document.createElement("img");
    img.alt = photo.filename;
    img.loading = "lazy";
    media.append(img);

    const content = document.createElement("div");
    content.className = "admin-photo-content";

    const title = document.createElement("h3");
    title.textContent = photo.filename;

    const meta = document.createElement("p");
    meta.textContent = `${formatDate(photo.createdAt)} - ${formatBytes(photo.sizeBytes)}`;

    const page = document.createElement("p");
    page.className = "admin-photo-page";
    page.textContent = photo.pageUrl ? `Page : ${photo.pageUrl}` : "Page inconnue";

    const actions = document.createElement("div");
    actions.className = "admin-photo-actions";

    const downloadButton = document.createElement("button");
    downloadButton.className = "button button-secondary";
    downloadButton.type = "button";
    downloadButton.textContent = "Télécharger";
    downloadButton.disabled = true;
    downloadButton.addEventListener("click", async () => {
      try {
        await downloadPhoto(photo);
      } catch (error) {
        setStatus(error.message || "Téléchargement impossible.", "error");
      }
    });

    actions.append(downloadButton);
    content.append(title, meta, page, actions);
    card.append(media, content);
    grid.append(card);

    loadImage(photo, img, downloadButton);
  });
}

async function loadPhotos() {
  showPanel();
  setStatus("Chargement des photos...");

  try {
    const response = await adminFetch("/api/photos?limit=120");
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      throw new Error(result.message || "Impossible de charger les photos.");
    }

    renderPhotos(result.photos || []);
    setStatus("Galerie à jour.", "success");
  } catch (error) {
    setStatus(error.message || "Erreur de chargement.", "error");
    showLogin();
  }
}

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    setStatus("Identifiant et mot de passe requis.", "error");
    return;
  }

  saveCredentials(username, password);
  loadPhotos();
});

refreshButton?.addEventListener("click", () => {
  loadPhotos();
});

logoutButton?.addEventListener("click", () => {
  clearCredentials();
  clearObjectUrls();
  showLogin();
});

if (getCredentials()) {
  loadPhotos();
} else {
  showLogin();
}
