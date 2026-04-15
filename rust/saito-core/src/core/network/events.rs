use crate::core::defs::{BlockId, SaitoHash, SaitoPublicKey};
use crate::core::process::version::Version;
use crate::core::network::network::PeerDisconnectType;
use crate::core::network::peer::Peer;

#[derive(Debug)]
pub enum NetworkEvent {
    PeerMessageReceived {
        public_key: SaitoPublicKey,
        buffer: Vec<u8>,
    },
    PeerBufferReceived {
        peer_id: u64,
        buffer: Vec<u8>,
    },
    ConnectToPeer {
        url: String,
        // public_key: PeerIndex,
    },
    PeerConnectionResult {
        peer_id: u64,
    },
    AddStunPeer {
        public_key: SaitoPublicKey,
    },
    RemoveStunPeer {
        public_key: SaitoPublicKey,
    },
    PeerDisconnected {
        peer_id: u64,
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

// TODO: transitional envelope; replace with typed command/event channels.
#[derive(Debug)]
pub struct IoEvent {
    pub event_processor_id: u8,
    pub event: NetworkEvent,
}

impl IoEvent {
    pub fn new(event: NetworkEvent) -> IoEvent {
        IoEvent {
            event_processor_id: 0,
            event,
        }
    }
}
