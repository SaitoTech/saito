import Saito from "../../saito";

import CustomSharedMethods from "./custom_shared_methods";
import NetworkPeer from "../network_peer";

export default class WebSharedMethods extends CustomSharedMethods {
  connectToPeer(url: string): void {
    try {
      console.debug("connecting to " + url + "....");
      let socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";

      // handle handshake here
      let peer = new NetworkPeer(undefined, url);
      peer.socket = socket;

      // Saito.getInstance().addNewSocket(socket, public_key);

      socket.onmessage = (event: MessageEvent) => {
        try {
          let buffer = Buffer.from(event.data);

          Saito.getLibInstance()
            .process_msg_buffer_from_peer(buffer, peer.instance)
            .then((buffer: any) => {
              if (buffer && buffer.byteLength > 0) {
                socket.send(buffer);
              }
              if (peer.publicKey) {
                if (!Saito.getInstance().peers.has(peer.publicKey)) {
                  console.info("added peer : " + peer.publicKey + ", url : " + peer.url);
                  Saito.getInstance().peers.set(peer.publicKey, peer);
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

      socket.onopen = () => {
        try {
          // Saito.getLibInstance().process_new_peer(public_key, url);
          console.debug("connected to : " + url);
        } catch (error) {
          console.error(error);
        }
      };
      socket.onclose = () => {
        try {
          console.debug("socket.onclose : " + url + " , key : " + peer.publicKey);
          Saito.getLibInstance().process_peer_disconnection(peer.publicKey);
        } catch (error) {
          console.error(error);
        }
      };
      socket.onerror = (error) => {
        try {
          console.error(`socket.onerror ${peer.publicKey}: `, error);
          Saito.getInstance().removeSocket(peer.publicKey);
        } catch (error) {
          console.error(error);
        }
      };
    } catch (e) {
      console.error("error occurred while opening socket : ", e);
    }
  }

  disconnectFromPeer(publicKey: string): void {
    console.debug("disconnect from peer : " + publicKey);
    Saito.getInstance().removeSocket(publicKey);
  }

  fetchBlockFromPeer(url: string): Promise<Uint8Array> {
    console.debug("fetching block from url : " + url);
    return fetch(url)
      .then((res: any) => {
        return res.arrayBuffer();
      })
      .then((buffer: ArrayBuffer) => {
        console.debug("block fetched from : " + url + "with size : " + buffer.byteLength);
        return new Uint8Array(buffer);
      })
      .catch((err) => {
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

  sendInterfaceEvent(event: String, public_key: string) {
    throw new Error("Method not implemented.");
  }
}
