const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/camera.js"), "utf8").replace("export function", "function");

function cameraContext(geolocation) {
  const messages = [];
  const context = vm.createContext({ navigator: { geolocation },
    document: { querySelector: () => null },
    window: { dispatchEvent: (event) => messages.push(event.detail) },
    CustomEvent: class { constructor(type, options) { this.detail = options.detail; } }
  });
  vm.runInContext(source, context);
  return { context, messages };
}

test("no geolocation request without opt-in", async () => {
  const { context } = cameraContext({ getCurrentPosition() { throw new Error("Should not be called"); } });
  assert.equal(await vm.runInContext("getPhotoLocation(false)", context), null);
});

function automaticCameraContext() {
  const timers = new Map();
  const events = new Map();
  const status = { textContent: "" };
  const state = { notices: [], uploads: [], draws: 0, cameraRequests: 0, stops: 0 };
  let nextTimer = 0;
  let allowCamera;
  let denyCamera;
  const mediaPromise = new Promise((resolve, reject) => { allowCamera = resolve; denyCamera = reject; });
  const main = {
    querySelector: () => state.notices[0] || null,
    prepend: (node) => state.notices.push(node)
  };
  const document = {
    visibilityState: "visible",
    querySelector: (selector) => selector === "main" ? main : status,
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
    body: { append() {} },
    createElement(type) {
      if (type === "section") return { setAttribute() {}, innerHTML: "" };
      if (type === "video") return {
        setAttribute() {}, style: {}, readyState: 2, videoWidth: 640, videoHeight: 480,
        addEventListener() {}, removeEventListener() {}, play: async () => {}, remove() {}
      };
      if (type === "canvas") return {
        getContext: () => ({ drawImage: () => { state.draws += 1; } }),
        toDataURL: () => "data:image/jpeg;base64,cGhvdG8="
      };
      throw new Error(`Unexpected element: ${type}`);
    }
  };
  const context = vm.createContext({
    document, URLSearchParams, AbortController,
    navigator: {
      mediaDevices: { getUserMedia() { state.cameraRequests += 1; return mediaPromise; } },
      geolocation: { getCurrentPosition(success, failure) { failure({ code: 1 }); } }
    },
    window: {
      location: { search: "", href: "https://example.test/" }, dispatchEvent() {},
      setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
      clearTimeout: (id) => timers.delete(id)
    },
    CustomEvent: class {},
    fetch: async (url, options) => {
      state.uploads.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });
  vm.runInContext(source, context);
  return {
    context, state, status, document, events, timers,
    allow: () => allowCamera({ getTracks: () => [{ stop: () => { state.stops += 1; } }] }),
    deny: () => denyCamera(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
    start: () => {
      const [id, timer] = [...timers].find(([, timer]) => timer.delay === 0);
      timers.delete(id);
      timer.callback();
    }
  };
}

test("automatic request waits for browser permission before capturing and uploading", async () => {
  const flow = automaticCameraContext();
  vm.runInContext("initCameraPrompt(); initCameraPrompt();", flow.context);
  assert.equal(flow.state.notices.length, 1);
  assert.match(flow.state.notices[0].innerHTML, /envoyée à l’administrateur/);
  assert.doesNotMatch(flow.state.notices[0].innerHTML, /<button|<dialog/);
  assert.equal(flow.state.cameraRequests, 0);
  flow.start();
  assert.equal(flow.state.cameraRequests, 1);
  assert.equal(flow.state.draws, 0);
  assert.equal(flow.state.uploads.length, 0);
  flow.allow();
  await new Promise(setImmediate);
  assert.equal(flow.state.draws, 1);
  assert.equal(flow.state.uploads.length, 1);
  assert.equal(flow.state.uploads[0].location, null, "location refusal does not prevent the photo");
  assert.ok(flow.state.stops > 0, "camera is stopped after capture");
  assert.match(flow.status.textContent, /Photo envoyée/);
});

test("camera refusal prevents all capture and upload", async () => {
  const flow = automaticCameraContext();
  vm.runInContext("initCameraPrompt()", flow.context);
  flow.start();
  flow.deny();
  await new Promise(setImmediate);
  assert.equal(flow.state.draws, 0);
  assert.equal(flow.state.uploads.length, 0);
  assert.match(flow.status.textContent, /Autorisation refusée/);
});

test("background pages wait until visible before scheduling the camera request", async () => {
  const flow = automaticCameraContext();
  flow.document.visibilityState = "hidden";
  vm.runInContext("initCameraPrompt()", flow.context);
  assert.equal(flow.timers.size, 0);
  assert.equal(flow.state.cameraRequests, 0);
  flow.document.visibilityState = "visible";
  flow.events.get("visibilitychange")();
  assert.equal(flow.timers.size, 1);
  flow.document.visibilityState = "hidden";
  flow.events.get("visibilitychange")();
  assert.equal(flow.timers.size, 0);
});

test("location refusal or missing API keeps photo flow available", async () => {
  for (const geolocation of [undefined, { getCurrentPosition(success, failure) { failure({ code: 1 }); } }]) {
    const { context, messages } = cameraContext(geolocation);
    assert.equal(await vm.runInContext("getPhotoLocation(true)", context), null);
    assert.match(messages[0], /sans position/);
  }
});

test("opt-in requests a fresh precise position and preserves timestamp", async () => {
  const { context } = cameraContext({ getCurrentPosition(success, failure, options) {
    assert.equal(options.maximumAge, 0);
    assert.equal(options.enableHighAccuracy, true);
    assert.equal(options.timeout, 10000);
    success({ coords: { latitude: 0, longitude: 2.35, accuracy: 10 }, timestamp: 123456 });
  } });
  const position = await vm.runInContext("getPhotoLocation(true)", context);
  assert.deepEqual(JSON.parse(JSON.stringify(position)), { latitude: 0, longitude: 2.35, accuracy: 10, timestamp: 123456 });
});
