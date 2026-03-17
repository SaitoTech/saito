import assert from "node:assert/strict";

import { createWasmHostBridge, installWasmHostBridge, uninstallWasmHostBridge } from "../lib/wasm_host_bridge";

describe("wasm host bridge", function () {
  it("installs a bridge on globalThis", function () {
    const sharedMethods = {
      sendMessage() {},
      sendMessageToAll() {},
      connectToPeer() {},
      writeValue() {},
      appendValue() {},
      flushData() {},
      ensureDirExists() {},
      readValue() {
        return new Uint8Array();
      },
      loadBlockFileList() {
        return [];
      },
      isExistingFile() {
        return false;
      },
      removeValue() {},
      disconnectFromPeer() {},
      fetchBlockFromPeer() {
        return Promise.resolve(new Uint8Array());
      },
      processApiCall() {
        return Promise.resolve();
      },
      processApiSuccess() {},
      processApiError() {},
      sendInterfaceEvent() {},
      sendBlockFetchStatus() {},
      sendNewVersionAlert() {},
      sendBlockSuccess() {},
      sendWalletUpdate() {},
      saveWallet() {},
      loadWallet() {},
      saveBlockchain() {},
      loadBlockchain() {},
      getMyServices() {
        return { instance: { services: [] } };
      },
      sendNewChainDetectedEvent() {},
    };

    const bridge = installWasmHostBridge(sharedMethods as any, () => ({}));

    assert.equal(globalThis.__saito_wasm_bridge__, bridge);

    uninstallWasmHostBridge();
    assert.equal(globalThis.__saito_wasm_bridge__, undefined);
  });

  it("routes block fetch results back into the wasm lib instance", async function () {
    let fetched: unknown[] = [];
    const bridge = createWasmHostBridge(
      {
        sendMessage() {},
        sendMessageToAll() {},
        connectToPeer() {},
        writeValue() {},
        appendValue() {},
        flushData() {},
        ensureDirExists() {},
        readValue() {
          return new Uint8Array();
        },
        loadBlockFileList() {
          return [];
        },
        isExistingFile() {
          return false;
        },
        removeValue() {},
        disconnectFromPeer() {},
        fetchBlockFromPeer() {
          return Promise.resolve(new Uint8Array([7, 8, 9]));
        },
        processApiCall() {
          return Promise.resolve();
        },
        processApiSuccess() {},
        processApiError() {},
        sendInterfaceEvent() {},
        sendBlockFetchStatus() {},
        sendNewVersionAlert() {},
        sendBlockSuccess() {},
        sendWalletUpdate() {},
        saveWallet() {},
        loadWallet() {},
        saveBlockchain() {},
        loadBlockchain() {},
        getMyServices() {
          return { instance: { services: [] } };
        },
        sendNewChainDetectedEvent() {},
      } as any,
      () => ({
        process_fetched_block(buffer: Uint8Array, hash: Uint8Array, blockId: bigint, publicKey: string) {
          fetched = [Array.from(buffer), Array.from(hash), blockId, publicKey];
        },
        process_failed_block_fetch() {
          throw new Error("unexpected fetch failure");
        },
      }),
    );

    bridge.fetch_block_from_peer(new Uint8Array([1, 2]), "peer", "http://peer", BigInt(4));
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(fetched, [[7, 8, 9], [1, 2], BigInt(4), "peer"]);
  });
});
