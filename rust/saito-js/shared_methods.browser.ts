import SharedMethods, {
  parseInterfaceEventPayload,
  processApiError,
  processApiSuccess,
  type SaitoRuntimeApp,
} from "./shared_methods";
import PeerServiceList from "./lib/peer_service_list";
import NetworkPeer from "./lib/network_peer";
import SaitoJs from "./saito";

export class BrowserSharedMethods implements SharedMethods {
  app: SaitoRuntimeApp;

  constructor(app: SaitoRuntimeApp) {
    this.app = app;
  }

  async connectToPeer(url: string): Promise<void> {
    try {
      const trimmed = typeof url === "string" ? url.trim() : "";
      const looksLikeWs = /^wss?:\/\//i.test(trimmed);
      console.log("[SAITO CONNECT] connectToPeer (browser)", {
        hasUrl: trimmed.length > 0,
        urlLength: trimmed.length,
        looksLikeWebSocketUrl: looksLikeWs,
        willOpenWebSocket: trimmed.length > 0 && looksLikeWs,
        url: trimmed || "(empty)",
      });
      if (!trimmed || !looksLikeWs) {
        console.log(
          "[SAITO CONNECT] skipping WebSocket open: need a non-empty ws: or wss: URL from core."
        );
        return;
      }
      let socket = new WebSocket(trimmed);
      socket.binaryType = "arraybuffer";

      // handle handshake here
      let peer = await NetworkPeer.create(trimmed);
      peer.socket = socket;
      SaitoJs.getInstance().peersByPeerId.set(peer.peerId, peer);

      socket.onmessage = (event: MessageEvent) => {
        try {
          let buffer = Buffer.from(event.data);

          //
          // initialize per-peer queue once
          //
          // this prevents multiple msgs being processed
          // simultaneously, which can now happen if msgs
          // arrive at essentially the same time and there
          // is an await inside, locking the peer that needs
          // to have its instance sent inside
          //
          const inflight = peer._inflight ?? Promise.resolve();

          peer._inflight = inflight
            .then(() => {
              return SaitoJs.getLibInstance().process_msg_buffer_from_peer(buffer, peer.instance);
            })
            .then((buffer: any) => {
              if (buffer && buffer.byteLength > 0) {
                socket.send(buffer);
              }
              if (peer.publicKey) {
                const current = SaitoJs.getInstance().peers.get(peer.publicKey);
                if (!current) {
                  console.info("added peer : " + peer.publicKey + ", url : " + peer.url);
                  SaitoJs.getInstance().peers.set(peer.publicKey, peer);
                } else if (current.peerId !== peer.peerId) {
                  SaitoJs.getInstance().peers.set(peer.publicKey, peer);
                }
              }
            })
            .catch((error: any) => {
              console.error(
                "processing incoming message buffer failed for peer : " + peer.publicKey,
                error
              );
            });
        } catch (error) {
          console.error("processing incoming message buffer failed.", error);
        }
      };

      socket.onopen = async () => {
        try {
          SaitoJs.getLibInstance().process_new_peer(peer.peerId, true);
          await peer.syncFromRust();
        } catch (error) {
          console.error(error);
        }
      };

      socket.onclose = () => {
        try {
          console.debug("socket.onclose : " + trimmed + " , key : " + peer.peerId);
          SaitoJs.getInstance().disconnectPeer(peer);
          SaitoJs.getLibInstance().process_peer_disconnection(peer.peerId);
        } catch (error) {
          console.error(error);
        }
      };
      socket.onerror = (error) => {
        try {
          console.error(`socket.onerror ${peer.peerId}: `, error);
          SaitoJs.getInstance().disconnectPeer(peer);
          SaitoJs.getLibInstance().process_peer_disconnection(peer.peerId);
        } catch (error) {
          console.error(error);
        }
      };
    } catch (e) {
      console.error("error occurred while opening socket : ", e);
    }
  }

  disconnectFromPeer(peer_id: bigint): void {
    console.debug("disconnect from peer : " + peer_id);
    SaitoJs.getInstance().removeSocket(peer_id);
  }

  fetchBlockFromPeer(url: string): Promise<Uint8Array> {
    console.info("[TRACE_SYNC] fetch_block_http_get url=", url);
    console.debug("fetching block from url : " + url);
    let pathname = "";
    try {
      pathname = new URL(url).pathname || "";
    } catch (_e) {
      pathname = "";
    }
    const isBlockPath = pathname.includes("/block/") || pathname.includes("/lite-block/");
    if (!isBlockPath) {
      console.log(
        "%c[TRACE_SYNC][WARNING] Rejecting invalid block fetch URL (missing /block/ or /lite-block/ path): " +
          url,
        "color:#ff3b30;font-weight:700"
      );
      return Promise.reject(new Error("invalid block fetch URL shape"));
    }
    if (pathname.includes("/block/") && !pathname.includes("/lite-block/")) {
      console.log(
        "%c[TRACE_SYNC][WARNING] Fetching FULL block endpoint for browser sync (likely SPV key fallback): " +
          url,
        "color:#ff3b30;font-weight:700"
      );
    }
    return fetch(url)
      .then((res: any) => {
        console.info(
          "[TRACE_SYNC] fetch_block_http_response url=%s status=%s ok=%s content_type=%s content_length=%s",
          url,
          res?.status,
          res?.ok,
          res?.headers?.get?.("content-type"),
          res?.headers?.get?.("content-length")
        );
        return res.arrayBuffer();
      })
      .then((buffer: ArrayBuffer) => {
        const bytes = new Uint8Array(buffer);
        const prefix = Array.from(bytes.slice(0, 32))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        let parsed = "n/a";
        if (bytes.length >= 20) {
          const view = new DataView(buffer);
          const txs = view.getUint32(0, false);
          const blockId = Number(view.getBigUint64(4, false));
          const ts = Number(view.getBigUint64(12, false));
          parsed = `txs=${txs} block_id=${blockId} ts=${ts}`;
        }
        console.info(
          "[TRACE_SYNC] fetch_block_http_bytes url=%s bytes=%s prefix32=%s parsed_header=%s",
          url,
          bytes.byteLength,
          prefix,
          parsed
        );
        console.debug("block fetched from : " + url + "with size : " + bytes.byteLength);
        return bytes;
      })
      .catch((err: any) => {
        console.error("failed fetching block : ", err);
        throw err;
      });
  }

  isExistingFile(key: string): boolean {
    try {
      return !!localStorage.getItem(key);
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  loadBlockFileList(): Array<string> {
    try {
      return [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  readValue(key: string): Uint8Array {
    try {
      let data = localStorage.getItem(key);
      if (!data) {
        console.debug("item not found for key : " + key);
        return new Uint8Array();
      }
      try {
        let buffer = Buffer.from(data, "utf-8");
        return new Uint8Array(buffer);
      } catch (e) {
        // TODO : remove these lines after running for a while in prod
        let buffer = Buffer.from(data, "base64");
        return new Uint8Array(buffer);
      }
    } catch (error) {
      console.error(error);
    }
    return new Uint8Array();
  }

  removeValue(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(e);
    }
  }

  sendMessage(publicKey: string, buffer: Uint8Array): void {
    try {
      if (SaitoJs.getInstance().stunManager.isStunPeer(publicKey)) {
        const stunPeer = SaitoJs.getInstance().stunManager.getStunPeer(publicKey);
        if (stunPeer) {
          //@ts-ignore
          const { peerConnection, publicKey } = stunPeer;
          //@ts-ignore
          const dc = peerConnection.dc;
          if (dc) {
            if (dc.readyState === "open") {
              console.debug(`Sending message to STUN peer ${publicKey} via data channel`);
              try {
                dc.send(buffer);
              } catch (error) {
                console.error(
                  `Error sending message to STUN peer ${publicKey} via data channel:`,
                  error
                );
              }
            } else {
              console.warn(
                `Data channel for STUN peer ${publicKey} is not open. Current state: ${dc.readyState}`
              );
            }
          } else {
            console.warn(`Data channel for STUN peer ${publicKey} is not initialized`);
          }
        } else {
          console.warn(`STUN peer ${publicKey} not found`);
        }
        return;
      }

      let socket = SaitoJs.getInstance().getSocket(publicKey);
      if (socket) {
        socket.send(buffer);
      } else {
        console.error(`No WebSocket found for peer ${publicKey}`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  sendMessageByPeerId(peerId: bigint, buffer: Uint8Array): void {
    try {
      const networkPeer = SaitoJs.getInstance().peersByPeerId.get(peerId);

      const stunPeer =
        networkPeer && networkPeer.publicKey
          ? SaitoJs.getInstance().stunManager.getStunPeer(networkPeer.publicKey)
          : undefined;

      if (stunPeer) {
        // @ts-ignore
        const dc = stunPeer.peerConnection.dc;
        if (dc && dc.readyState === "open") {
          dc.send(buffer);
          return;
        }
      }

      let socket = SaitoJs.getInstance().getSocketByPeerId(peerId);
      if (socket) {
        socket.send(buffer);
      } else {
        console.error(`No transport found for peerId ${peerId.toString()}`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  sendMessageToAll(buffer: Uint8Array, exceptions: Array<string>): void {
    // console.debug("sending message to all with size: " + buffer.byteLength);
    // console.info(' --- Sending to All ---')
    SaitoJs.getInstance().peers.forEach((peer, key) => {
      if (exceptions.includes(key)) {
        return;
      }
      try {
        let socket = peer.socket;
        if (!socket) {
          return;
        }
        // @ts-ignore
        if (socket.readyState !== socket.OPEN) {
          console.error("Blocked Socket Send Before Open");
        } else {
          // @ts-ignore
          socket.send(buffer);
        }
      } catch (err) {
        console.error("Socket Send Error: " + err);
      }
    });
  }

  writeValue(key: string, value: Uint8Array): void {
    try {
      localStorage.setItem(key, Buffer.from(value).toString("utf-8"));
    } catch (error) {
      console.error(error);
    }
  }

  appendValue(key: string, value: Uint8Array): void {
    // TODO : check if this needs implementing. might be not needed for web
  }

  flushData(key: string): void {
    // TODO : check if this needs implementing. might be not needed for web
  }

  async processApiCall(buffer: Uint8Array, msgIndex: number, publicKey: string): Promise<void> {
    const mycallback = async (response_object: any) => {
      try {
        await this.app.core.network.api.success(
          Buffer.from(JSON.stringify(response_object), "utf-8"),
          msgIndex,
          publicKey
        );
      } catch (error) {
        console.error(error);
      }
    };
    let peer = await this.app.network.getPeer(publicKey);
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
      if (event_name === "on-transaction-pending") {
        console.info("[tx-pending-trace] app.connection.emit(on-transaction-pending) complete");
      }
      const listenerCount =
        typeof this.app.connection.listenerCount === "function"
          ? this.app.connection.listenerCount(event_name)
          : null;
      console.info("[tx-pending-trace] app.connection.emit(on-transaction-pending)", {
        branch,
        listenerCount,
        ...extra,
      });
    };

    if (payload === null) {
      logPendingEmit("payload-null");
      this.app.connection.emit(event_name);
      return;
    }

    if (Array.isArray(payload)) {
      this.app.connection.emit(event_name, ...payload);
      return;
    }

    this.app.connection.emit(event_name, payload);
  }

  async saveWallet() {
    console.info("[SAVE_TRACE] browser saveWallet called app_option_slips=???");
    this.app.options.wallet ??= {};
    this.app.options.wallet.publicKey = await this.app.wallet.getPublicKey();
    this.app.options.wallet.privateKey = await this.app.wallet.getPrivateKey();
    this.app.options.wallet.balance = await this.app.wallet.getBalance();
    console.info("[SAVE_TRACE] browser saveWallet completed!!!");
  }

  async loadWallet() {
    console.info("[LOAD_TRACE] loading wallet (browser loadWallet not implemented)");
    throw new Error("Method not implemented.");
  }

  async saveBlockchain() {
    throw new Error("Method not implemented.");
  }

  async loadBlockchain() {
    throw new Error("Method not implemented.");
  }

  getMyServices() {
    let list = new PeerServiceList();
    let result = this.app.network.getServices();
    result.forEach((s) => list.push(s));
    return list;
  }

  ensureDirExists(path: string): void {}

  sendInterfaceEvent(event: String, peer_id: bigint, public_key: string) {
    throw new Error("Method not implemented.");
  }
}
