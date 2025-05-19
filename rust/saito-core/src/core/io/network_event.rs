use crate::core::defs::{BlockId, PeerIndex, SaitoHash, SaitoPublicKey};
use crate::core::io::network::PeerDisconnectType;

#[derive(Debug)]
pub enum NetworkEvent {
    OutgoingNetworkMessage {
        peer_index: u64,
        buffer: Vec<u8>,
    },
    OutgoingNetworkMessageForAll {
        buffer: Vec<u8>,
        exceptions: Vec<u64>,
    },
    IncomingNetworkMessage {
        peer_index: u64,
        buffer: Vec<u8>,
    },
    ConnectToPeer {
        url: String,
        peer_index: PeerIndex,
    },
    DisconnectFromPeer {
        peer_index: u64,
    },
    PeerConnectionResult {
        result: Result<(u64, Option<String>), std::io::Error>,
    },
    AddStunPeer {
        peer_index: u64,
        public_key: SaitoPublicKey,
    },
    RemoveStunPeer {
        peer_index: u64,
    },
    PeerDisconnected {
        peer_index: u64,
        disconnect_type: PeerDisconnectType,
    },
    BlockFetchRequest {
        block_hash: SaitoHash,
        peer_index: u64,
        url: String,
        block_id: BlockId,
    },
    BlockFetched {
        block_hash: SaitoHash,
        block_id: BlockId,
        peer_index: PeerIndex,
        buffer: Vec<u8>,
    },
    BlockFetchFailed {
        block_hash: SaitoHash,
        peer_index: u64,
        block_id: BlockId,
    },
}
