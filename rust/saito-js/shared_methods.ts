import Wallet from "./lib/wallet";
import Blockchain from "./lib/blockchain";
import PeerServiceList from "./lib/peer_service_list";

export default interface SharedMethods {
    sendMessage(peerIndex: bigint, buffer: Uint8Array): void;

    sendMessageToAll(buffer: Uint8Array, exceptions: Array<bigint>): void;

    connectToPeer(url: string, peer_index: bigint): void;

    writeValue(key: string, value: Uint8Array): void;

    appendValue(key: string, value: Uint8Array): void;

    flushData(key: string): void;

    ensureBlockDirExists(path: string): void;

    readValue(key: string): Uint8Array;

    loadBlockFileList(): Array<string>;

    isExistingFile(key: string): boolean;

    removeValue(key: string): void;

    disconnectFromPeer(peerIndex: bigint): void;

    fetchBlockFromPeer(url: string): Promise<Uint8Array>;

    processApiCall(buffer: Uint8Array, msgIndex: number, peerIndex: bigint): Promise<void>;

    processApiSuccess(buffer: Uint8Array, msgIndex: number, peerIndex: bigint): void;

    processApiError(buffer: Uint8Array, msgIndex: number, peerIndex: bigint): void;

    sendInterfaceEvent(event: String, peerIndex: bigint, public_key: string): void;

    sendBlockFetchStatus(count: bigint): void;

    sendNewVersionAlert(major: number, minor: number, patch: number, peerIndex: bigint): void;

    sendBlockSuccess(hash: String, blockId: bigint): void;

    sendWalletUpdate(): void;

    saveWallet(wallet: Wallet): void;

    loadWallet(wallet: Wallet): void;

    saveBlockchain(blockchain: Blockchain): void;

    loadBlockchain(blockchain: Blockchain): void;

    getMyServices(): PeerServiceList;
}
