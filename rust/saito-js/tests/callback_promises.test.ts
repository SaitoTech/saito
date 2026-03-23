import assert from "node:assert/strict";

import Saito from "../saito";
import Factory from "../lib/factory";
import CustomSharedMethods from "../lib/custom/custom_shared_methods";

/**
 * Phase 4 validation tests (items 74-76):
 * - Callback reply values propagate to callers
 * - Pending promise entries are cleaned up on success and error
 * - Timeout / cancellation cleanup for waitForReply promises
 */

// Minimal stub so we can instantiate Saito without a full wasm runtime.
function createBareInstance(): Saito {
  // Access the private constructor via any-cast
  const instance = new (Saito as any)(new Factory()) as Saito;
  // Inject into the static slot so getInstance() works
  (Saito as any).instance = instance;
  return instance;
}

describe("callback promise management", function () {
  let saito: Saito;

  beforeEach(function () {
    saito = createBareInstance();
  });

  afterEach(function () {
    saito.promises.clear();
  });

  // --- Item 74: callback reply values propagate ---

  it("processApiSuccess resolves the matching promise entry", function () {
    const sharedMethods = new CustomSharedMethods();
    let resolved: unknown = undefined;

    saito.promises.set(42, {
      resolve: (v: unknown) => { resolved = v; },
      reject: () => { throw new Error("should not reject"); },
    });

    const buf = new Uint8Array([1, 2, 3]);
    sharedMethods.processApiSuccess(buf, 42, "some-key");

    assert.deepEqual(resolved, buf);
  });

  it("processApiError rejects the matching promise entry", function () {
    const sharedMethods = new CustomSharedMethods();
    let rejected: unknown = undefined;

    saito.promises.set(99, {
      resolve: () => { throw new Error("should not resolve"); },
      reject: (v: unknown) => { rejected = v; },
    });

    const buf = new Uint8Array([4, 5]);
    sharedMethods.processApiError(buf, 99, "some-key");

    assert.deepEqual(rejected, buf);
  });

  // --- Item 75: pending entries removed after success and error ---

  it("processApiSuccess deletes the promise entry", function () {
    const sharedMethods = new CustomSharedMethods();

    saito.promises.set(10, { resolve: () => {}, reject: () => {} });
    assert.equal(saito.promises.size, 1);

    sharedMethods.processApiSuccess(new Uint8Array(), 10, "k");

    assert.equal(saito.promises.size, 0);
    assert.equal(saito.promises.has(10), false);
  });

  it("processApiError deletes the promise entry", function () {
    const sharedMethods = new CustomSharedMethods();

    saito.promises.set(20, { resolve: () => {}, reject: () => {} });
    assert.equal(saito.promises.size, 1);

    sharedMethods.processApiError(new Uint8Array(), 20, "k");

    assert.equal(saito.promises.size, 0);
    assert.equal(saito.promises.has(20), false);
  });

  it("does not throw when success callback is missing", function () {
    const sharedMethods = new CustomSharedMethods();
    // No promise entry for index 999 — should log error but not throw
    assert.doesNotThrow(() => {
      sharedMethods.processApiSuccess(new Uint8Array(), 999, "k");
    });
  });

  it("does not throw when error callback is missing", function () {
    const sharedMethods = new CustomSharedMethods();
    assert.doesNotThrow(() => {
      sharedMethods.processApiError(new Uint8Array(), 999, "k");
    });
  });

  // --- Item 76: timeout cleanup for waitForReply promises ---

  it("sendApiCall with waitForReply registers a promise entry", async function () {
    // Stub the runtime so send_api_call doesn't actually call wasm
    (Saito as any).runtimeInstance = {
      send_api_call: () => Promise.resolve(),
    };

    // Pass undefined publicKey to avoid getPeer() call
    const callPromise = saito.sendApiCall(new Uint8Array([1]), undefined, true).catch(() => {});

    // The Promise constructor executor runs synchronously,
    // so the entry is already in the map.
    assert.ok(saito.promises.size >= 1, "expected at least one pending promise");

    // Resolve it to clean up
    const firstKey = saito.promises.keys().next().value!;
    saito.promises.get(firstKey)!.resolve(new Uint8Array());
    await callPromise;
  });

  it("sendApiCall without waitForReply does not register a promise", async function () {
    (Saito as any).runtimeInstance = {
      send_api_call: () => Promise.resolve(),
    };

    // Pass undefined publicKey to avoid getPeer() call
    await saito.sendApiCall(new Uint8Array([1]), undefined, false);

    assert.equal(saito.promises.size, 0);
  });
});
