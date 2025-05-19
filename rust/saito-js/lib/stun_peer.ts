import Saito from "../saito";

export class StunManager {

    constructor(private saitoInstance: Saito) {
        this.saitoInstance = saitoInstance
    }

    private stunPeers: Map<bigint, { peerConnection: RTCPeerConnection, publicKey: string }> = new Map();

    public async addStunPeer(publicKey: string, peerConnection: RTCPeerConnection): Promise<bigint> {
        const peerIndex = await Saito.getLibInstance().get_next_peer_index();
        const dataChannelOptions: RTCDataChannelInit = {
            ordered: true,
            protocol: 'saito',
        };
        const dc = peerConnection.createDataChannel('core-channel', dataChannelOptions);


        //@ts-ignore
        peerConnection.dc = dc;
        peerConnection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            dataChannel.onmessage = (messageEvent) => {
                // Handle incoming messages
                if (messageEvent.data instanceof ArrayBuffer) {
                    const buffer = new Uint8Array(messageEvent.data);
                    Saito.getInstance().processMsgBufferFromPeer(buffer, peerIndex);
                    console.log('Received message via stun data channel from ', publicKey, ' with peer index ', peerIndex);
                } else {
                    console.warn('Received unexpected data type from STUN peer', peerIndex, messageEvent);
                }
            };

            dataChannel.onopen = () => {
                console.log('Data channel is open for STUN peer', peerIndex);
                let existingPeerIndex = this.findPeerIndexByPublicKey(publicKey);
                if (existingPeerIndex !== null) {
                    console.log(`Replacing existing STUN peer with index: ${existingPeerIndex} for public key: ${publicKey}`);
                    // remove stun peer from local map
                    this.removeStunPeer(existingPeerIndex);
                }

                this.stunPeers.set(peerIndex, { peerConnection, publicKey });
                console.log(`Data channel opened and STUN peer added with index: ${peerIndex} and public key: ${publicKey}`);
                Saito.getLibInstance().process_stun_peer(peerIndex, publicKey);
            };

            dataChannel.onerror = (error: any) => {
                console.error('Data channel error for STUN peer', peerIndex, error);
                if (error.error) {
                    console.error('Error name:', error.error.name);
                    console.error('Error message:', error.error.message);
                }
                // Check the data channel state
                console.log('Data channel state after error:', dataChannel.readyState);
                // Attempt to recover or reconnect
                if (dataChannel.readyState === 'closed') {
                    // console.log('Attempting to reopen data channel for STUN peer', peerIndex);
                    // this.reopenDataChannel(peerIndex, peerConnection);
                }
                dataChannel.onclose = () => {
                    console.log('Data channel closed for STUN peer', peerIndex);
                    this.removeStunPeer(peerIndex);
                };
            }


        };

        console.log(`Added STUN peer with index: ${peerIndex} and public key: ${publicKey}`);
        return peerIndex;


    }

    private removeStunPeer(peerIndex: bigint) {
        if (this.stunPeers.has(peerIndex)) {
            this.stunPeers.delete(peerIndex);
            console.log(`Removed STUN peer with index: ${peerIndex}`);

        } else {
            console.warn(`Attempt to remove non-existent STUN peer with index: ${peerIndex}`);
        }
        Saito.getLibInstance().remove_stun_peer(peerIndex);
    }

    private findPeerIndexByPublicKey(publicKey: string): bigint | null {
        for (const [index, peer] of this.stunPeers) {
            if (peer.publicKey === publicKey) {
                return index;
            }
        }
        return null;
    }
    public getStunPeers(): Map<bigint, { peerConnection: RTCPeerConnection, publicKey: string }> {
        return this.stunPeers;
    }

    public getStunPeer(index: bigint): { peerConnection: RTCPeerConnection, publicKey: string } | undefined {
        return this.stunPeers.get(index);
    }

    public isStunPeer(index: bigint): boolean {
        return this.stunPeers.has(index);
    }

}

export default StunManager;