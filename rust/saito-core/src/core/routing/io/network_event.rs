use crate::core::defs::{BlockId, SaitoHash, SaitoPublicKey};
use crate::core::process::version::Version;
use crate::core::routing::io::network::PeerDisconnectType;
use crate::core::routing::peers::network_peer::NetworkPeer;

#[derive(Debug)]
pub enum NetworkEvent {
    SendMessageToPeer {
        public_key: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    SendMessageToAllPeers {
        buffer: Vec<u8>,
        exceptions: Vec<SaitoPublicKey>,
    },
    PeerMessageReceived {
        public_key: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    ConnectToPeer {
        url: String,
        // public_key: PeerIndex,
    },
    DisconnectFromPeer {
        public_key: SaitoPublicKey,
    },
    PeerConnectionResult {
        result: Result<NetworkPeer, std::io::Error>,
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
