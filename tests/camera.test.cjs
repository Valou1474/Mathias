const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/camera.js"), "utf8").replace("export function", "function");

function cameraContext(geolocation) {
  const messages = [];
  const context = vm.createContext({ navigator: { geolocation },
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
