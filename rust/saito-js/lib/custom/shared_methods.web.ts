import Saito from "../../saito";

import CustomSharedMethods from "./custom_shared_methods";
import NetworkPeer from "../network_peer";

export default class WebSharedMethods extends CustomSharedMethods {

  async connectToPeer(url: string): Promise<void> {
    try {
      const trimmed = typeof url === 'string' ? url.trim() : '';
      const looksLikeWs = /^wss?:\/\//i.test(trimmed);
      console.log('[SAITO CONNECT] connectToPeer (browser)', {
        hasUrl: trimmed.length > 0,
        urlLength: trimmed.length,
        looksLikeWebSocketUrl: looksLikeWs,
        willOpenWebSocket: trimmed.length > 0 && looksLikeWs,
        url: trimmed || '(empty)'
      });
      if (!trimmed || !looksLikeWs) {
        console.log(
          '[SAITO CONNECT] skipping WebSocket open: need a non-empty ws: or wss: URL from core.'
        );
        return;
      }
      console.info('[SAITO STEP 2] connectToPeer called url=', trimmed);
      console.debug('connecting to ' + trimmed + '....');
      let socket = new WebSocket(trimmed);
      console.info("[SAITO STEP 3] WebSocket constructed url=", trimmed, "readyState=", socket.readyState);
      socket.binaryType = "arraybuffer";

      // handle handshake here
      let peer = await NetworkPeer.create(trimmed);
      peer.socket = socket;
      Saito.getInstance().peersByPeerId.set(peer.peerId, peer);


      socket.onmessage = (event: MessageEvent) => {
        try {
          let buffer = Buffer.from(event.data);
          console.info(
            "[SAITO STEP 10] browser socket.onmessage byteLength=",
            buffer.byteLength,
            "url=",
            trimmed
          );


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
    return Saito.getLibInstance()
      .process_msg_buffer_from_peer(buffer, peer.instance);
  })
  .then((buffer: any) => {
    if (buffer && buffer.byteLength > 0) {
      socket.send(buffer);
    }

    if (peer.publicKey) {
      const current = Saito.getInstance().peers.get(peer.publicKey);
      if (!current) {
        console.info("added peer : " + peer.publicKey + ", url : " + peer.url);
        Saito.getInstance().peers.set(peer.publicKey, peer);
      } else if (current.peerId !== peer.peerId) {
        console.info(
          "updated peer mapping : " +
            peer.publicKey +
            " old peer_id=" +
            current.peerId.toString() +
            " new peer_id=" +
            peer.peerId.toString()
        );
        Saito.getInstance().peers.set(peer.publicKey, peer);
      }
    }
  })
  .catch((error: any) => {
    console.error(
      "processing incoming message buffer failed for peer : " +
        peer.publicKey,
      error
    );
  });

        } catch (error) {
          console.error("processing incoming message buffer failed.", error);
        }
      };

      socket.onopen = async () => {
        try {
          console.log('[SAITO CONNECT] WebSocket open — peer will register with core', {
            url: trimmed,
            readyState: socket.readyState
          });
          console.info("[SAITO STEP 4] socket.onopen url=", trimmed, "readyState=", socket.readyState);
          console.info(
            "[SAITO STEP 5a] before process_new_peer peerId=",
            peer.peerId,
            "typeof peerId=",
            typeof peer.peerId
          );
	  Saito.getLibInstance().process_new_peer(peer.peerId, true);
          console.info("[SAITO STEP 5b] after process_new_peer peerId=", peer.peerId);
	  await peer.syncFromRust();
          console.log('[SAITO CONNECT] handshake path: process_new_peer + syncFromRust for', trimmed);
          console.debug("connected to : " + trimmed);
        } catch (error) {
          console.error(error);
        }
      };
      socket.onclose = () => {
        try {
          console.debug("socket.onclose : " + trimmed + " , key : " + peer.peerId);
          Saito.getInstance().disconnectPeer(peer);
          Saito.getLibInstance().process_peer_disconnection(peer.peerId);
        } catch (error) {
          console.error(error);
        }
      };
      socket.onerror = (error) => {
        try {
          console.error(`socket.onerror ${peer.peerId}: `, error);
          Saito.getInstance().disconnectPeer(peer);
          Saito.getLibInstance().process_peer_disconnection(peer.peerId);
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
    Saito.getInstance().removeSocket(peer_id);
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
      if (Saito.getInstance().stunManager.isStunPeer(publicKey)) {
        const stunPeer = Saito.getInstance().stunManager.getStunPeer(publicKey);
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

      let socket = Saito.getInstance().getSocket(publicKey);
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
const networkPeer = Saito.getInstance().peersByPeerId.get(peerId);

const stunPeer =
  networkPeer && networkPeer.publicKey
    ? Saito.getInstance().stunManager.getStunPeer(networkPeer.publicKey)
    : undefined;

      if (stunPeer) {
        // @ts-ignore
        const dc = stunPeer.peerConnection.dc;
        if (dc && dc.readyState === "open") {
          dc.send(buffer);
          return;
        }
      }
  
      let socket = Saito.getInstance().getSocketByPeerId(peerId);
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
    Saito.getInstance().peers.forEach((peer, key) => {
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

  sendInterfaceEvent(event: String, peer_id: bigint, public_key: string) {
    throw new Error("Method not implemented.");
  }
}
