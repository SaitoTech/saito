import Wallet from "./lib/wallet";
import Blockchain from "./lib/blockchain";
import PeerServiceList from "./lib/peer_service_list";

export default interface SharedMethods {

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

  sendInterfaceEvent(event: String, public_key: string): void;

  sendBlockFetchStatus(count: bigint): void;

  sendNewVersionAlert(major: number, minor: number, patch: number, public_key: string): void;

  sendBlockSuccess(hash: String, blockId: bigint): void;

  sendWalletUpdate(): void;

  saveWallet(wallet: Wallet): void;

  loadWallet(wallet: Wallet): void;

  saveBlockchain(blockchain: Blockchain): void;

  loadBlockchain(blockchain: Blockchain): void;

  getMyServices(): PeerServiceList;

  sendNewChainDetectedEvent(): void;
}
