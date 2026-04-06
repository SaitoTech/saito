import SharedMethods from "../../shared_methods";
import Saito from "../../saito";
import PeerServiceList from "../peer_service_list";

export default class CustomSharedMethods implements SharedMethods {
  sendBlockFetchStatus(count: bigint): void {
    throw new Error("Method not implemented.");
  }

  flushData(key: string): void {
    throw new Error("Method not implemented.");
  }

  appendValue(key: string, value: Uint8Array): void {
    throw new Error("Method not implemented.");
  }

  sendWalletUpdate(): void {
    throw new Error("Method not implemented.");
  }

  sendBlockSuccess(hash: String, blockId: bigint): void {
    throw new Error("Method not implemented.");
  }

  getMyServices(): PeerServiceList {
    return new PeerServiceList();
  }

  processApiCall(buffer: Uint8Array, msgIndex: number, publicKey: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  connectToPeer(url: string): void {
    throw new Error("Method not implemented.");
  }

  disconnectFromPeer(publicKey: string): void {
    throw new Error("Method not implemented.");
  }

  fetchBlockFromPeer(url: string): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }

  isExistingFile(key: string): boolean {
    throw new Error("Method not implemented.");
  }

  loadBlockFileList(): Array<string> {
    throw new Error("Method not implemented.");
  }

  processApiError(buffer: Uint8Array, msgIndex: number, publicKey: string): void {
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

  processApiSuccess(buffer: Uint8Array, msgIndex: number, publicKey: string): void {
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

  ensureDirExists(path: string): void {
    throw new Error("Method not implemented");
  }

  readValue(key: string): Uint8Array {
    throw new Error("Method not implemented.");
  }

  removeValue(key: string): void {
    throw new Error("Method not implemented.");
  }

  sendMessage(publicKey: string, buffer: Uint8Array): void {
    throw new Error("Method not implemented.");
  }

  sendMessageToAll(buffer: Uint8Array, exceptions: Array<string>): void {
    throw new Error("Method not implemented.");
  }

  writeValue(key: string, value: Uint8Array): void {
    throw new Error("Method not implemented.");
  }

  sendInterfaceEvent(event: String, public_key: string): void {
    throw new Error("Method not implemented.");
  }

  saveWallet(): void {
    throw new Error("Method not implemented.");
  }

  loadWallet(): void {
    throw new Error("Method not implemented.");
  }

  saveBlockchain(): void {
    throw new Error("Method not implemented.");
  }

  loadBlockchain(): void {
    throw new Error("Method not implemented.");
  }

  sendNewVersionAlert(major: number, minor: number, patch: number, publicKey: string): void {
    throw new Error("Method not implemented");
  }
  sendNewChainDetectedEvent(): void {
    throw new Error("Method not implemented.");
  }
}
