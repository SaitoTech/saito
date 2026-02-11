use crate::core::defs::{BlockId, SaitoHash, SaitoPublicKey};
use crate::core::process::version::Version;
use crate::core::routing::io::network::PeerDisconnectType;
use crate::core::routing::peers::network_peer::NetworkPeer;

#[derive(Debug)]
pub enum NetworkEvent {
    OutgoingNetworkMessage {
        peer_index: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    OutgoingNetworkMessageForAll {
        buffer: Vec<u8>,
        exceptions: Vec<SaitoPublicKey>,
    },
    IncomingNetworkMessage {
        public_key: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    ConnectToPeer {
        url: String,
        // peer_index: PeerIndex,
    },
    DisconnectFromPeer {
        peer_index: SaitoPublicKey,
    },
    PeerConnectionResult {
        result: Result<NetworkPeer, std::io::Error>,
    },
    AddStunPeer {
        public_key: SaitoPublicKey,
    },
    RemoveStunPeer {
        peer_index: SaitoPublicKey,
    },
    PeerDisconnected {
        public_key: SaitoPublicKey,
        disconnect_type: PeerDisconnectType,
    },
    BlockFetchRequest {
        block_hash: SaitoHash,
        peer_index: SaitoPublicKey,
        url: String,
        block_id: BlockId,
    },
    BlockFetched {
        block_hash: SaitoHash,
        block_id: BlockId,
        peer_index: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    BlockFetchFailed {
        block_hash: SaitoHash,
        peer_index: SaitoPublicKey,
        block_id: BlockId,
    },
    NewVersionDetected {
        public_key: SaitoPublicKey,
        version: Version,
    },
}
