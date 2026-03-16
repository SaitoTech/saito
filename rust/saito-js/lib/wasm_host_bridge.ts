import SharedMethods from "../shared_methods";

export interface SaitoWasmHostBridge {
  send_message(publicKey: string, buffer: Uint8Array): void;
  send_message_to_all(buffer: Uint8Array, exceptions: Array<string>): void;
  connect_to_peer(url: string): void;
  write_value(key: string, value: Uint8Array): void;
  append_value(key: string, value: Uint8Array): void;
  flush_data(key: string): void;
  ensure_directory_exists(path: string): void;
  read_value(key: string): Uint8Array;
  load_block_file_list(): Array<string>;
  is_existing_file(key: string): boolean;
  remove_value(key: string): void;
  disconnect_from_peer(publicKey: string): void;
  fetch_block_from_peer(hash: Uint8Array, publicKey: string, url: string, blockId: bigint): void;
  process_api_call(buffer: Uint8Array, msgIndex: number, publicKey: string): Promise<void>;
  process_api_success(buffer: Uint8Array, msgIndex: number, publicKey: string): void;
  process_api_error(buffer: Uint8Array, msgIndex: number, publicKey: string): void;
  send_interface_event(event: string, publicKey: string): void;
  send_block_fetch_status_event(count: bigint): void;
  send_block_success(hash: string, blockId: bigint): void;
  send_wallet_update(): void;
  save_wallet(wallet: unknown): void;
  load_wallet(wallet: unknown): void;
  save_blockchain(blockchain: unknown): void;
  load_blockchain(blockchain: unknown): void;
  get_my_services(): unknown;
  send_new_version_alert(major: number, minor: number, patch: number, publicKey: string): void;
  send_new_chain_detected_event(): void;
}

declare global {
  var __saito_wasm_bridge__: SaitoWasmHostBridge | undefined;
}

export function createWasmHostBridge(
  sharedMethods: SharedMethods,
  getLibInstance: () => any,
): SaitoWasmHostBridge {
  return {
    send_message: (publicKey: string, buffer: Uint8Array) => {
      sharedMethods.sendMessage(publicKey, buffer);
    },
    send_message_to_all: (buffer: Uint8Array, exceptions: Array<string>) => {
      sharedMethods.sendMessageToAll(buffer, exceptions);
    },
    connect_to_peer: (url: string) => {
      sharedMethods.connectToPeer(url);
    },
    write_value: (key: string, value: Uint8Array) => {
      sharedMethods.writeValue(key, value);
    },
    append_value: (key: string, value: Uint8Array) => {
      sharedMethods.appendValue(key, value);
    },
    flush_data: (key: string) => {
      sharedMethods.flushData(key);
    },
    ensure_directory_exists: (path: string) => {
      sharedMethods.ensureDirExists(path);
    },
    read_value: (key: string) => {
      return sharedMethods.readValue(key);
    },
    load_block_file_list: () => {
      return sharedMethods.loadBlockFileList();
    },
    is_existing_file: (key: string) => {
      return sharedMethods.isExistingFile(key);
    },
    remove_value: (key: string) => {
      sharedMethods.removeValue(key);
    },
    disconnect_from_peer: (publicKey: string) => {
      sharedMethods.disconnectFromPeer(publicKey);
    },
    fetch_block_from_peer: (hash: Uint8Array, publicKey: string, url: string, blockId: bigint) => {
      sharedMethods
        .fetchBlockFromPeer(url)
        .then((buffer: Uint8Array) => {
          return getLibInstance().process_fetched_block(buffer, hash, blockId, publicKey);
        })
        .catch((error: any) => {
          console.log(
            "failed fetching block for url : " +
              url +
              " from peer : " +
              publicKey +
              ", block id = " +
              blockId,
          );
          console.error(error);
          return getLibInstance().process_failed_block_fetch(hash, blockId, publicKey);
        });
    },
    process_api_call: (buffer: Uint8Array, msgIndex: number, publicKey: string) => {
      return sharedMethods.processApiCall(buffer, msgIndex, publicKey).then(() => {});
    },
    process_api_success: (buffer: Uint8Array, msgIndex: number, publicKey: string) => {
      return sharedMethods.processApiSuccess(buffer, msgIndex, publicKey);
    },
    process_api_error: (buffer: Uint8Array, msgIndex: number, publicKey: string) => {
      return sharedMethods.processApiError(buffer, msgIndex, publicKey);
    },
    send_interface_event: (event: string, publicKey: string) => {
      return sharedMethods.sendInterfaceEvent(event, publicKey);
    },
    send_block_fetch_status_event: (count: bigint) => {
      return sharedMethods.sendBlockFetchStatus(count);
    },
    send_block_success: (hash: string, blockId: bigint) => {
      return sharedMethods.sendBlockSuccess(hash, blockId);
    },
    send_wallet_update: () => {
      return sharedMethods.sendWalletUpdate();
    },
    save_wallet: (wallet: unknown) => {
      return sharedMethods.saveWallet(wallet as any);
    },
    load_wallet: (wallet: unknown) => {
      return sharedMethods.loadWallet(wallet as any);
    },
    save_blockchain: (blockchain: unknown) => {
      return sharedMethods.saveBlockchain(blockchain as any);
    },
    load_blockchain: (blockchain: unknown) => {
      return sharedMethods.loadBlockchain(blockchain as any);
    },
    get_my_services: () => {
      return sharedMethods.getMyServices().instance;
    },
    send_new_version_alert: (major: number, minor: number, patch: number, publicKey: string) => {
      return sharedMethods.sendNewVersionAlert(major, minor, patch, publicKey);
    },
    send_new_chain_detected_event: () => {
      return sharedMethods.sendNewChainDetectedEvent();
    },
  };
}

export function installWasmHostBridge(
  sharedMethods: SharedMethods,
  getLibInstance: () => any,
): SaitoWasmHostBridge {
  const bridge = createWasmHostBridge(sharedMethods, getLibInstance);
  globalThis.__saito_wasm_bridge__ = bridge;
  return bridge;
}

export function uninstallWasmHostBridge(): void {
  delete globalThis.__saito_wasm_bridge__;
}
