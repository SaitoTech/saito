import SharedMethods, {
  parseInterfaceEventPayload,
  processApiError,
  processApiSuccess,
  type SaitoRuntimeApp,
} from "./shared_methods";
import S from "./index.node";
import PeerServiceList from "./lib/peer_service_list";
import NetworkPeer from "./lib/network_peer";
import fs from "fs";
import ws from "ws";
import fetch from "node-fetch";

export class ServerSharedMethods implements SharedMethods {
  public app: SaitoRuntimeApp;

  constructor(app: SaitoRuntimeApp) {
    this.app = app;
  }

  sendMessage(publicKey: string, buffer: Uint8Array): void {
    try {
      // console.log('sending message : '+buffer.byteLength+' bytes to peer : '+publicKey);
      let socket = S.getInstance().getSocket(publicKey);
      if (socket) {
        socket.send(buffer);
      } else {
        // console.warn('socket not found for peer : '+publicKey+'. Cannot send the buffer : '+buffer.byteLength+' bytes.');
      }
    } catch (e) {
      // console.error(e);
    }
  }

  sendMessageByPeerId(peerId: bigint, buffer: Uint8Array): void {
    try {
      let socket = S.getInstance().getSocketByPeerId(peerId);
      if (socket) {
        socket.send(buffer);
      }
    } catch (e) {
      // console.error(e);
    }
  }

  sendMessageToAll(buffer: Uint8Array, exceptions: string[]): void {
    S.getInstance().peers.forEach((peer, key) => {
      if (exceptions.includes(key)) {
        return;
      }
      try {
        let socket = peer.socket;
        if (socket) {
          socket.send(buffer);
        }
      } catch (error) {
        // console.error(error);
      }
    });
  }

  async connectToPeer(url: string): Promise<void> {
    try {
      console.log("connecting to " + url + "....");

      let socket = new ws.WebSocket(url);
      // S.getInstance().addNewSocket(socket, peer_index);

      let peer = await NetworkPeer.create(url);
      peer.socket = socket;
      S.getInstance().peersByPeerId.set(peer.peerId, peer);

      // initialize per-peer chain once (safe if repeated)
      if (!peer._inflight) {
        peer._inflight = Promise.resolve();
      }

      socket.on("message", (buffer: any) => {
        try {
          const inflight = peer._inflight ?? Promise.resolve();
          peer._inflight = inflight
            .then(() => {
              return S.getLibInstance().process_msg_buffer_from_peer(buffer, peer.instance);
            })
            .then(async (buffer: any) => {
              if (buffer && buffer.byteLength > 0) {
                socket.send(buffer);
              }
              if (!peer.publicKey) {
                await peer.syncFromRust();
              }
            })
            .catch((err: any) => {
              console.error("server process_msg_buffer_from_peer failed:", err);
            });
        } catch (err) {
          console.error("server socket.on('message') handler threw:", err);
        }
      });

      socket.on("close", () => {
        try {
          S.getInstance().disconnectPeer(peer);
          S.getLibInstance().process_peer_disconnection(peer.peerId);
        } catch (e) {
          console.error(
            `failed processing socket close from peer : ${peer.peerId} from url : ${url}`,
            e
          );
        }
      });

      socket.on("error", (error) => {
        console.error(`received socket error from peer : ${peer.peerId} from url : ${url}`, error);
        try {
          S.getInstance().disconnectPeer(peer);
          S.getLibInstance().process_peer_disconnection(peer.peerId);
        } catch (e) {
          console.error(`failed processing error from peer : ${peer.peerId} from url : ${url}`, e);
        }
      });
      socket.on("open", () => {
        try {
          S.getLibInstance().process_new_peer(peer.peerId, true);
        } catch (e) {
          console.error(
            `failed processing socket open from peer : ${peer.publicKey} from url : ${url}`,
            e
          );
        }
      });
    } catch (e) {
      console.error(`error from peer from url : ${url}`, e);
    }
  }

  writeValue(key: string, value: Uint8Array): void {
    try {
      fs.writeFileSync(key, value);
    } catch (error) {
      // console.error(error);
    }
  }

  appendValue(key: string, value: Uint8Array): void {
    try {
      fs.appendFileSync(key, value);
    } catch (error) {
      // console.error(error);
    }
  }

  flushData(key: string): void {}

  readValue(key: string): Uint8Array {
    try {
      return fs.readFileSync(key);
    } catch (error) {
      // console.error(error);
      return new Uint8Array();
    }
  }

  loadBlockFileList(): string[] {
    try {
      let files = fs.readdirSync("data/blocks/");
      files = files.filter((file: string) => file.endsWith(".sai"));
      return files;
    } catch (e) {
      console.log("cwd : ", process.cwd());
      // console.error(e);
      return [];
    }
  }

  isExistingFile(key: string): boolean {
    try {
      let result = fs.existsSync(key);
      return !!result;
    } catch (error) {
      // console.error(error);
      return false;
    }
  }

  removeValue(key: string): void {
    try {
      fs.rmSync(key);
    } catch (e) {
      // console.error(e);
    }
  }

  disconnectFromPeer(peer_id: bigint): void {
    S.getInstance().removeSocket(peer_id);
  }

  fetchBlockFromPeer(url: string): Promise<Uint8Array> {
    console.log("fetching block from peer: " + url);
    return fetch(url)
      .then((res: any) => {
        return res.arrayBuffer();
      })
      .then((buffer: ArrayBuffer) => {
        console.log("block data fetched for " + url + " with size : " + buffer.byteLength);
        return new Uint8Array(buffer);
      })
      .catch((err) => {
        console.error("Error fetching block: " + url, err);
        throw "failed fetching block";
      });
  }

  async processApiCall(buffer: Uint8Array, msgIndex: number, publicKey: string): Promise<void> {
    const mycallback = async (response_object: any) => {
      // console.log("response_object ", response_object);
      await this.app.core.network.api.success(
        response_object ? Buffer.from(JSON.stringify(response_object), "utf-8") : Buffer.alloc(0),
        msgIndex,
        publicKey
      );
    };
    let peer = await this.app.core.network.getPeer(publicKey);
    await this.app.modules.handlePeerTransactionBuffer(buffer, peer, mycallback);
  }

  processApiError(buffer: Uint8Array, msgIndex: number, publicKey: string): void {
    processApiError(buffer, msgIndex, publicKey);
  }

  processApiSuccess(buffer: Uint8Array, msgIndex: number, publicKey: string): void {
    processApiSuccess(buffer, msgIndex, publicKey);
  }

  emitInterfaceEvent(event_name: string, payload_json: string) {
    const payload = parseInterfaceEventPayload(payload_json);

    if (payload === null) {
      this.app.connection.emit(event_name);
      return;
    }

    if (Array.isArray(payload)) {
      this.app.connection.emit(event_name, ...payload);
      return;
    }

    this.app.connection.emit(event_name, payload);
  }

  async saveWallet(): Promise<void> {
    if (this.app.options.wallet && this.app.wallet) {
      this.app.options.wallet.publicKey = await this.app.wallet.getPublicKey();
      this.app.options.wallet.privateKey = await this.app.wallet.getPrivateKey();
      this.app.options.wallet.balance = await this.app.wallet.getBalance();
    }
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

  getMyServices() {
    let list = new PeerServiceList();
    let result = this.app.network.getServices();
    result.forEach((s) => list.push(s));
    return list;
  }

  ensureDirExists(path: string): void {
    if (fs.existsSync(path)) {
      return;
    }
    fs.mkdirSync(path);
  }
}
