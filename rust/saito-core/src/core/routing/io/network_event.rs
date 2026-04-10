use crate::core::defs::{BlockId, SaitoHash, SaitoPublicKey};
use crate::core::process::version::Version;
use crate::core::routing::io::network::PeerDisconnectType;
use crate::core::routing::peers::peerv2::PeerV2;

#[derive(Debug)]
pub enum NetworkEvent {
    PeerMessageReceived {
        public_key: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    ConnectToPeer {
        url: String,
        // public_key: PeerIndex,
    },
    PeerConnectionResult {
        peer_id: u64,
    },
    PeerHandshakeResult {
        peer_id: u64,
        public_key: SaitoPublicKey,
    },
    AddStunPeer {
        public_key: SaitoPublicKey,
    },
    RemoveStunPeer {
        public_key: SaitoPublicKey,
    },
    PeerDisconnected {
        public_key: SaitoPublicKey,
        disconnect_type: PeerDisconnectType,
    },
    BlockFetchRequest {
        block_hash: SaitoHash,
        public_key: SaitoPublicKey,
        url: String,
        block_id: BlockId,
    },
    BlockFetched {
        block_hash: SaitoHash,
        block_id: BlockId,
        public_key: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    BlockFetchFailed {
        block_hash: SaitoHash,
        public_key: SaitoPublicKey,
        block_id: BlockId,
    },
    NewVersionDetected {
        public_key: SaitoPublicKey,
        version: Version,
    },
}
