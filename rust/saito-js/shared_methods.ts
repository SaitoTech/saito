import Wallet from "./lib/wallet";
import Blockchain from "./lib/blockchain";
import PeerServiceList from "./lib/peer_service_list";
import Saito from "./saito";

const TYPED_LEAF_TAG_KEY = "$t";
const TYPED_LEAF_VALUE_KEY = "v";
const BIGINT_TYPED_LEAF = "bigint";

function interfaceEventPayloadReviver(_key: string, value: any): any {
  if (
    value &&
    typeof value === "object" &&
    value[TYPED_LEAF_TAG_KEY] === BIGINT_TYPED_LEAF &&
    typeof value[TYPED_LEAF_VALUE_KEY] === "string"
  ) {
    return BigInt(value[TYPED_LEAF_VALUE_KEY]);
  }
  return value;
}

export function parseInterfaceEventPayload(payload_json: string): any {
  return payload_json ? JSON.parse(payload_json, interfaceEventPayloadReviver) : null;
}

/*
 * shared_methods.browser.ts and shared_methods.server.ts are runtime bridge implementations
 * owned by saito-js. They previously imported concrete Node runtime classes from
 * node/lib/saito/*, which inverted package boundaries and forced rust/saito-js builds to
 * typecheck node runtime internals. This contract intentionally captures only the runtime
 * surface that shared_methods.* actually uses, so bridge code can preserve behavior while
 * depending on a minimal, local interface instead of the full Node application implementation.
 */
export interface SaitoRuntimeApp {
  options: {
    wallet?: {
      publicKey?: string;
      privateKey?: string;
      balance?: string | bigint | number;
    };
  };
  wallet: {
    getPublicKey(): Promise<string>;
    getPrivateKey(): Promise<string>;
    getBalance(): Promise<string | bigint | number>;
  };
  connection: {
    emit(eventName: string, ...args: any[]): void;
  };
  modules: {
    handlePeerTransaction(
      tx: any,
      peer: any,
      callback: (response: any) => Promise<void>
    ): Promise<void>;
    handlePeerTransactionBuffer(
      buffer: Uint8Array,
      peer: any,
      callback: (response: any) => Promise<void>
    ): Promise<void>;
  };
  network: {
    getPeer(publicKey: string): Promise<any>;
    getServices(): any[];
  };
  core: {
    network: {
      getPeer(publicKey: string): Promise<any>;
      api: {
        success(buffer: Uint8Array, msgIndex: number, publicKey: string): Promise<void>;
      };
    };
  };
}

export function processApiError(
  buffer: Uint8Array,
  msgIndex: number,
  publicKey: string
): void {
  const saito = Saito.getInstance();
  let promise = saito.promises.get(msgIndex);
  if (promise) {
    promise.reject(buffer);
    saito.promises.delete(msgIndex);
  } else {
    console.error(
      "callback not found for callback index : " + msgIndex + " from peer : " + publicKey
    );
  }
}

export function processApiSuccess(
  buffer: Uint8Array,
  msgIndex: number,
  publicKey: string
): void {
  const saito = Saito.getInstance();
  let promise = saito.promises.get(msgIndex);
  if (promise) {
    promise.resolve(buffer);
    saito.promises.delete(msgIndex);
  } else {
    console.error(
      "callback not found for callback index : " + msgIndex + " from peer : " + publicKey
    );
  }
}

export default interface SharedMethods {

  emitInterfaceEvent(event_name: string, payload_json: string): void;

  sendMessageByPeerId(peer_id: bigint, buffer: Uint8Array): void;

  sendMessage(public_key: string, buffer: Uint8Array): void;

  sendMessageToAll(buffer: Uint8Array, exceptions: Array<string>): void;

  connectToPeer(url: string): void;

  writeValue(key: string, value: Uint8Array): void;

  appendValue(key: string, value: Uint8Array): void;

  flushData(key: string): void;

  ensureDirExists(path: string): void;

  readValue(key: string): Uint8Array;

  loadBlockFileList(): Array<string>;

  isExistingFile(key: string): boolean;

  removeValue(key: string): void;

  disconnectFromPeer(peer_id: bigint): void;

  fetchBlockFromPeer(url: string): Promise<Uint8Array>;

  processApiCall(buffer: Uint8Array, msgIndex: number, public_key: string): Promise<void>;

  processApiSuccess(buffer: Uint8Array, msgIndex: number, public_key: string): void;

  processApiError(buffer: Uint8Array, msgIndex: number, public_key: string): void;

  saveWallet(wallet: Wallet): void;

  loadWallet(wallet: Wallet): void;

  saveBlockchain(blockchain: Blockchain): void;

  loadBlockchain(blockchain: Blockchain): void;

  getMyServices(): PeerServiceList;

}
