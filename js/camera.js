const PROMPT_DELAY = 5000;
const SESSION_KEY = "plexidesign-camera-choice";

let dialog = null;
let statusNode = null;
let lastFocusedElement = null;

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
      <h2>Merci ! Voici votre photo.</h2>
    </div>
    <div class="photo-frame">
      <img data-photo-output alt="Photo prise avec votre accord">
    </div>
    <div class="photo-actions" data-photo-actions>
      <button class="button button-secondary" type="button" data-photo-delete>Supprimer la photo</button>
    </div>
  `;
  main.append(photoSection);
  return photoSection;
}

async function capturePhoto() {
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
    const photo = canvas.toDataURL("image/png");

    const photoSection = ensurePhotoSection();
    const photoOutput = document.querySelector("[data-photo-output]");
    if (photoSection && photoOutput) {
      photoOutput.src = photo;
      photoSection.hidden = false;
      photoSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    setStatus("Photo prise.");
    closeDialog();
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

export function initCameraPrompt() {
  dialog = document.querySelector("[data-camera-dialog]");
  statusNode = document.querySelector("[data-camera-status]");

  if (!dialog) return;

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

    if (target.closest("[data-photo-delete]")) {
      const photoSection = document.querySelector("[data-photo-section]");
      const photoOutput = document.querySelector("[data-photo-output]");
      if (photoOutput) photoOutput.removeAttribute("src");
      if (photoSection) photoSection.hidden = true;
      window.dispatchEvent(new CustomEvent("plexi:toast", { detail: "Photo supprimée" }));
    }
  });

  dialog.addEventListener("cancel", () => {
    rememberPromptChoice();
  });
}
