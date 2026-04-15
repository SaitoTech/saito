import Saito from "../saito";
import NetworkPeer from "./network_peer";

export class StunManager {
  constructor(private saitoInstance: Saito) {
    this.saitoInstance = saitoInstance;
  }

  private stunPeers: Map<string, { peerConnection: RTCPeerConnection; publicKey: string }> =
    new Map();

  public async addStunPeer(publicKey: string, peerConnection: RTCPeerConnection): Promise<string> {
    // const peerIndex = await Saito.getLibInstance().get_next_public_key();
    const dataChannelOptions: RTCDataChannelInit = {
      ordered: true,
      protocol: "saito",
    };
    const dc = peerConnection.createDataChannel("core-channel", dataChannelOptions);

    //@ts-ignore
    peerConnection.dc = dc;
    peerConnection.ondatachannel = async (event) => {
      const dataChannel = event.channel;
      const peer = await NetworkPeer.create();
      let peer = Saito.getInstance().peers.get(publicKey);
      if (!peer) {
        peer = await NetworkPeer.create();
      }

      dataChannel.onmessage = (messageEvent) => {
        // Handle incoming messages
        if (messageEvent.data instanceof ArrayBuffer) {
          const buffer = new Uint8Array(messageEvent.data);
	  Saito.getLibInstance().process_msg_buffer_from_peer(buffer, peer.instance);
          console.log("Received message via stun data channel from ", publicKey);
        } else {
          console.warn("Received unexpected data type from STUN peer", publicKey, messageEvent);
        }
      };

      dataChannel.onopen = () => {
        console.log("Data channel is open for STUN peer", publicKey);
        let existingPeerIndex = this.findPeerIndexByPublicKey(publicKey);
        if (existingPeerIndex !== null) {
          console.log(
            `Replacing existing STUN peer with index: ${existingPeerIndex} for public key: ${publicKey}`
          );
          // remove stun peer from local map
          this.removeStunPeer(existingPeerIndex);
        }

        this.stunPeers.set(publicKey, { peerConnection, publicKey });
        console.log(`Data channel opened and STUN peer added with public key: ${publicKey}`);

if (!Saito.getInstance().peers.has(publicKey)) {
  Saito.getLibInstance().process_stun_peer(peer.peerId, publicKey);
}


      };

      dataChannel.onerror = (error: any) => {
        console.error("Data channel error for STUN peer", publicKey, error);
        if (error.error) {
          console.error("Error name:", error.error.name);
          console.error("Error message:", error.error.message);
        }
        // Check the data channel state
        console.log("Data channel state after error:", dataChannel.readyState);
        // Attempt to recover or reconnect
        if (dataChannel.readyState === "closed") {
          // console.log('Attempting to reopen data channel for STUN peer', peerIndex);
          // this.reopenDataChannel(peerIndex, peerConnection);
        }
        dataChannel.onclose = () => {
          console.log("Data channel closed for STUN peer", publicKey);
          this.removeStunPeer(publicKey);
        };
      };
    };

    console.log(`Added STUN peer with public key: ${publicKey}`);
    return publicKey;
  }

  private removeStunPeer(publicKey: string) {
    if (this.stunPeers.has(publicKey)) {
      this.stunPeers.delete(publicKey);
      console.log(`Removed STUN peer with index: ${publicKey}`);
    } else {
      console.warn(`Attempt to remove non-existent STUN peer with index: ${publicKey}`);
    }
const peer = Saito.getInstance().peers.get(publicKey);
if (peer) {
  Saito.getLibInstance().remove_stun_peer(peer.peerId, publicKey);
}
  }

  private findPeerIndexByPublicKey(publicKey: string): string | null {
    for (const [index, peer] of this.stunPeers) {
      if (peer.publicKey === publicKey) {
        return index;
      }
    }
    return null;
  }
  public getStunPeers(): Map<string, { peerConnection: RTCPeerConnection; publicKey: string }> {
    return this.stunPeers;
  }

  public getStunPeer(
    publicKey: string
  ): { peerConnection: RTCPeerConnection; publicKey: string } | undefined {
    return this.stunPeers.get(publicKey);
  }

  public isStunPeer(publicKey: string): boolean {
    return this.stunPeers.has(publicKey);
  }
}

export default StunManager;
