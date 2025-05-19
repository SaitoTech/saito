import Saito from "../../saito";

import CustomSharedMethods from "./custom_shared_methods";

export default class WebSharedMethods extends CustomSharedMethods {
    connectToPeer(url: string, peer_index: bigint): void {
        try {
            console.log("connecting to " + url + "....");
            let socket = new WebSocket(url);
            socket.binaryType = "arraybuffer";
            Saito.getInstance().addNewSocket(socket, peer_index);

            socket.onmessage = (event: MessageEvent) => {
                try {
                    Saito.getLibInstance().process_msg_buffer_from_peer(new Uint8Array(event.data), peer_index);
                } catch (error) {
                    console.error(error);
                }
            };

            socket.onopen = () => {
                try {
                    Saito.getLibInstance().process_new_peer(peer_index, url);
                    console.log("connected to : " + url + " with peer index : " + peer_index);
                } catch (error) {
                    console.error(error);
                }
            };
            socket.onclose = () => {
                try {
                    console.log("socket.onclose : " + peer_index);
                    Saito.getLibInstance().process_peer_disconnection(peer_index);
                } catch (error) {
                    console.error(error);
                }
            };
            socket.onerror = (error) => {
                try {
                    console.error(`socket.onerror ${peer_index}: `, error);
                    Saito.getInstance().removeSocket(peer_index);
                } catch (error) {
                    console.error(error);
                }
            }
        } catch (e) {
            console.error("error occurred while opening socket : ", e)
        }
    }

    disconnectFromPeer(peerIndex: bigint): void {
        console.log("disconnect from peer : " + peerIndex);
        Saito.getInstance().removeSocket(peerIndex);
    }

    fetchBlockFromPeer(url: string): Promise<Uint8Array> {
        console.log("fetching block from url : " + url);
        return fetch(url)
            .then((res: any) => {
                return res.arrayBuffer();
            })
            .then((buffer: ArrayBuffer) => {
                console.log("block fetched from : " + url + "with size : " + buffer.byteLength);
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
                console.log("item not found for key : " + key);
                return new Uint8Array();
            }
            let buffer = Buffer.from(data, "base64");
            return new Uint8Array(buffer);
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

    sendMessage(peerIndex: bigint, buffer: Uint8Array): void {
        try {
            if (Saito.getInstance().stunManager.isStunPeer(peerIndex)) {
                const stunPeer = Saito.getInstance().stunManager.getStunPeer(peerIndex);
                if (stunPeer) {
                    //@ts-ignore
                    const {peerConnection, publicKey} = stunPeer;
                    //@ts-ignore
                    const dc = peerConnection.dc;
                    if (dc) {
                        if (dc.readyState === 'open') {
                            console.log(`Sending message to STUN peer ${peerIndex} via data channel`);
                            try {
                                dc.send(buffer);
                            } catch (error) {
                                console.error(`Error sending message to STUN peer ${peerIndex} via data channel:`, error);
                            }
                        } else {
                            console.warn(`Data channel for STUN peer ${peerIndex} is not open. Current state: ${dc.readyState}`);
                        }
                    } else {
                        console.warn(`Data channel for STUN peer ${peerIndex} is not initialized`);
                    }
                } else {
                    console.warn(`STUN peer ${peerIndex} not found`);
                }
                return;
            }

            let socket = Saito.getInstance().getSocket(peerIndex);
            if (socket) {
                socket.send(buffer);
            } else {
                console.error(`No WebSocket found for peer ${peerIndex}`);
            }
        } catch (e) {
            console.error(e);
        }
    }

    sendMessageToAll(buffer: Uint8Array, exceptions: Array<bigint>): void {
        // console.debug("sending message to  all with size : " + buffer.byteLength);
        // console.info(' --- Sending to All ---')
        Saito.getInstance().sockets.forEach((socket, key) => {
            if (exceptions.includes(key)) {
                return;
            }
            try {
                if (socket.readyState !== socket.OPEN) {
                    console.error("Blocked Socket Send Before Open");
                } else {
                    socket.send(buffer);
                }
            } catch (err) {
                console.error("Socket Send Error: " + err);
            }
        });
    }

    writeValue(key: string, value: Uint8Array): void {
        try {
            localStorage.setItem(key, Buffer.from(value).toString("base64"));
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

    sendInterfaceEvent(event: String, peerIndex: bigint, public_key: string) {
        throw new Error("Method not implemented.");
    }
}
