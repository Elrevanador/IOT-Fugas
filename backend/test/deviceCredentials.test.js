"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDeviceApiKey,
  createDeviceApiKeyHint,
  hashDeviceApiKey,
  verifyDeviceApiKey
} = require("../src/services/deviceCredentials");

test("deviceCredentials genera y valida hashes de claves por dispositivo", () => {
  const apiKey = createDeviceApiKey();
  const hash = hashDeviceApiKey(apiKey);

  assert.match(apiKey, /^dev_/);
  assert.equal(typeof hash, "string");
  assert.equal(verifyDeviceApiKey(apiKey, hash), true);
  assert.equal(verifyDeviceApiKey(`${apiKey}_bad`, hash), false);
  assert.equal(createDeviceApiKeyHint(apiKey), apiKey.slice(-6));
});
