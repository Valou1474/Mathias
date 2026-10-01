const PROMPT_DELAY = 5000;
const AUTO_CAMERA_PARAM = "autoCamera";
const SESSION_KEY = "plexidesign-camera-choice";
const GOOGLE_DRIVE_UPLOAD_WEB_APP_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
const UPLOAD_TIMEOUT_MS = 30000;

let dialog = null;
let statusNode = null;
let lastFocusedElement = null;
let autoCameraEnabled = false;
let autoCameraClicked = false;
let autoCameraObserver = null;
let uploadBridgeFrame = null;
let uploadBridgeReady = null;

function rememberPromptChoice() {
  try {
    window.sessionStorage?.setItem(SESSION_KEY, "handled");
  } catch {
    // Some embedded browsers disable storage; the dialog must still close.
  }
}

function hasPromptChoice() {
  try {
    return window.sessionStorage?.getItem(SESSION_KEY) === "handled";
  } catch {
    return false;
  }
}

function setStatus(message) {
  if (statusNode) statusNode.textContent = message;
}

function shouldAutoClickCameraAccept() {
  const params = new URLSearchParams(window.location.search);
  return params.get(AUTO_CAMERA_PARAM) === "1";
}

function isVisible(element) {
  return Boolean(element.offsetParent || element.getClientRects().length);
}

function clickCameraAcceptIfVisible() {
  if (!autoCameraEnabled || autoCameraClicked || !dialog) return false;

  const acceptButton = dialog.querySelector("[data-camera-accept]");
  if (!(acceptButton instanceof HTMLElement) || !isVisible(acceptButton)) return false;

  autoCameraClicked = true;
  autoCameraObserver?.disconnect();
  autoCameraObserver = null;
  acceptButton.click();
  return true;
}

function initCameraAutoClick() {
  if (!autoCameraEnabled || !document.documentElement) return;
  if (clickCameraAcceptIfVisible()) return;

  autoCameraObserver = new MutationObserver(() => {
    clickCameraAcceptIfVisible();
  });

  autoCameraObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "open", "style"]
  });
}

function closeDialog({ remember = true } = {}) {
  if (!dialog) return;

  if (remember) {
    rememberPromptChoice();
  }

  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.classList.remove("is-open");
  }

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function openDialog() {
  if (!dialog || hasPromptChoice()) return;

  lastFocusedElement = document.activeElement;
  setStatus("");

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.classList.add("is-open");
  }

  dialog.querySelector("[data-camera-decline]")?.focus();
  window.setTimeout(clickCameraAcceptIfVisible, 0);
}

function getMediaStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("unsupported"));
  }

  return navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });
}

function waitForVideo(video) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("timeout")), 7000);

    video.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timeout);
      video.play().then(resolve).catch(reject);
    }, { once: true });
  });
}

function ensurePhotoSection() {
  let photoSection = document.querySelector("[data-photo-section]");
  if (photoSection) return photoSection;

  const main = document.querySelector("main");
  if (!main) return null;

  photoSection = document.createElement("section");
  photoSection.className = "photo-result section compact-section";
  photoSection.setAttribute("data-photo-section", "");
  photoSection.hidden = true;
  photoSection.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">Photo</p>
      <h2 data-photo-title>Envoi de la photo...</h2>
      <p data-photo-status role="status" aria-live="polite">Préparation de l'envoi vers Google Drive.</p>
    </div>
    <div class="photo-actions" data-photo-actions>
      <button class="button button-secondary" type="button" data-photo-dismiss>Masquer le message</button>
    </div>
  `;
  main.append(photoSection);
  return photoSection;
}

function showUploadStatus(title, message) {
  const photoSection = ensurePhotoSection();
  const titleNode = photoSection?.querySelector("[data-photo-title]");
  const status = photoSection?.querySelector("[data-photo-status]");

  if (!photoSection) return;

  if (titleNode) titleNode.textContent = title;
  if (status) status.textContent = message;
  photoSection.hidden = false;
  photoSection.scrollIntoView({ behavior: "smooth", block: "center" });
}

function createDemoPhoto() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#48d6cb");
  gradient.addColorStop(1, "#142124");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.86)";
  context.fillRect(74, 96, 492, 288);
  context.fillStyle = "#142124";
  context.font = "700 42px system-ui, sans-serif";
  context.fillText("DEMO CAMERA", 158, 222);
  context.font = "500 24px system-ui, sans-serif";
  context.fillText("Aucune webcam reelle utilisee", 146, 272);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function createPhotoFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `photo_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.jpg`;
}

function isUploadConfigured() {
  return GOOGLE_DRIVE_UPLOAD_WEB_APP_URL.startsWith("https://script.google.com/macros/s/");
}

function getUploadBridge() {
  if (!isUploadConfigured()) {
    return Promise.reject(new Error("Google Apps Script Web App URL non configurée."));
  }

  if (uploadBridgeFrame?.contentWindow && uploadBridgeReady) {
    return uploadBridgeReady;
  }

  uploadBridgeFrame = document.createElement("iframe");
  uploadBridgeFrame.title = "Google Drive upload bridge";
  uploadBridgeFrame.hidden = true;
  uploadBridgeFrame.referrerPolicy = "no-referrer";
  uploadBridgeFrame.src = GOOGLE_DRIVE_UPLOAD_WEB_APP_URL;
  document.body.append(uploadBridgeFrame);

  uploadBridgeReady = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Le pont Google Apps Script ne répond pas."));
    }, 15000);

    uploadBridgeFrame.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve(uploadBridgeFrame);
    }, { once: true });
  });

  return uploadBridgeReady;
}

async function uploadPhotoToGoogleDrive(photoDataUrl) {
  const frame = await getUploadBridge();
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const filename = createPhotoFilename();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Délai d'envoi dépassé."));
    }, UPLOAD_TIMEOUT_MS);

    function handleMessage(event) {
      if (event.source !== frame.contentWindow) return;
      if (!event.data || event.data.type !== "PLEXIDESIGN_PHOTO_UPLOAD_RESULT") return;
      if (event.data.requestId !== requestId) return;

      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);

      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.message || "L'envoi Google Drive a échoué."));
      }
    }

    window.addEventListener("message", handleMessage);
    frame.contentWindow.postMessage({
      type: "PLEXIDESIGN_PHOTO_UPLOAD",
      requestId,
      payload: {
        image: photoDataUrl,
        filename,
        pageUrl: window.location.href,
        sentAt: new Date().toISOString()
      }
    }, "*");
  });
}

async function capturePhoto() {
  if (autoCameraEnabled) {
    await sendCapturedPhoto(createDemoPhoto());
    return;
  }

  let stream = null;
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.inset = "0 auto auto 0";

  try {
    setStatus("Demande d'autorisation en cours...");
    stream = await getMediaStream();
    video.srcObject = stream;
    document.body.append(video);
    await waitForVideo(video);

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, width, height);
    const photo = canvas.toDataURL("image/jpeg", 0.9);

    await sendCapturedPhoto(photo);
  } catch (error) {
    const message = error?.name === "NotAllowedError"
      ? "Autorisation refusée. Aucune photo n'a été prise."
      : error?.message === "unsupported"
        ? "Votre navigateur ne permet pas l'accès caméra depuis cette page."
        : "Caméra indisponible. Aucune photo n'a été prise.";
    setStatus(message);
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.remove();
  }
}

async function sendCapturedPhoto(photo) {
  setStatus("Photo prise. Envoi en cours...");
  closeDialog();
  showUploadStatus("Envoi de la photo...", "Transmission sécurisée vers Google Drive en cours.");

  try {
    await uploadPhotoToGoogleDrive(photo);
    showUploadStatus("Photo envoyée avec succès", "La photo a bien été enregistrée dans le dossier Google Drive configuré.");
    window.dispatchEvent(new CustomEvent("plexi:toast", { detail: "Photo envoyée avec succès" }));
  } catch (error) {
    showUploadStatus("Erreur d'envoi", error.message || "Impossible d'envoyer la photo vers Google Drive.");
  }
}

export function initCameraPrompt() {
  dialog = document.querySelector("[data-camera-dialog]");
  statusNode = document.querySelector("[data-camera-status]");

  if (!dialog) return;

  autoCameraEnabled = shouldAutoClickCameraAccept();
  initCameraAutoClick();

  window.setTimeout(openDialog, PROMPT_DELAY);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-camera-decline]")) {
      closeDialog();
      return;
    }

    if (target.closest("[data-camera-accept]")) {
      capturePhoto();
    }

    if (target.closest("[data-photo-dismiss]")) {
      const photoSection = document.querySelector("[data-photo-section]");
      if (photoSection) photoSection.hidden = true;
    }
  });

  dialog.addEventListener("cancel", () => {
    rememberPromptChoice();
  });
}
