use crate::core::defs::{SaitoPublicKey, Timestamp};
use crate::core::network::peers::Peers;
use ahash::HashMap;
use std::mem;
use std::time::Duration;

pub type PeerId = SaitoPublicKey;

const MESSAGE_WINDOW: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;
const INVALID_BLOCK_WINDOW: Timestamp = Duration::from_secs(3600).as_millis() as Timestamp;

//
// AccessPermission defines all of the states in which a peer
// can be labelled, thus limited access or regulating how the
// routing_thread.rs handles requests from it.
//
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessPermission {
    Allowed,
    Throttled,
    Denied,
}

//
// AccessRecord defines all of the variables that are tracked
// peer-by-peer. They are provided in the gatekeeper.record()
// function to track what is incremented when the record()
// function is called..
//
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessRecord {
    MessageReceived,
    InvalidBlockReceived,
}

//
// stores the specific variables that are tracked for each
// peer_id. This is where the variables are incremented and
// saved locally before they are written into the peer
// periodically by the monitor_peers loop.
//
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PeerAccessRecords {
    pub messages_received: u32,
    pub messages_received_started_at: Timestamp,
    pub invalid_blocks_received: u32,
    pub invalid_blocks_received_started_at: Timestamp,
}

//
// the Gatekeeper consists of two hashmaps that stores the
// default Permission (level) of each peer as well as
// records that it updates. The records are eventually
// synced into the peer itself. So it is a slightly-
// delayed update.
//
#[derive(Debug, Default)]
pub struct Gatekeeper {
    pub permissions: HashMap<PeerId, AccessPermission>,
    pub pending_records: HashMap<PeerId, PeerAccessRecords>,
}

impl Gatekeeper {
    pub fn reset(&mut self) {
        self.permissions.clear();
        self.pending_records.clear();
    }

    pub fn is_allowed(&self, peer_id: PeerId) -> bool {
        matches!(
            self.permissions.get(&peer_id),
            None | Some(AccessPermission::Allowed)
        )
    }

    pub fn is_denied(&self, peer_id: PeerId) -> bool {
        matches!(
            self.permissions.get(&peer_id),
            Some(AccessPermission::Denied)
        )
    }

    pub fn is_throttled(&self, peer_id: PeerId) -> bool {
        matches!(
            self.permissions.get(&peer_id),
            Some(AccessPermission::Throttled)
        )
    }

    pub fn add_record(&mut self, peer_id: PeerId, record: AccessRecord, now: Timestamp) {
        let peer_record = self
            .pending_records
            .entry(peer_id)
            .or_insert(PeerAccessRecords {
                messages_received: 0,
                messages_received_started_at: now,
                invalid_blocks_received: 0,
                invalid_blocks_received_started_at: now,
            });

        match record {
            AccessRecord::MessageReceived => {
                if now.saturating_sub(peer_record.messages_received_started_at) > MESSAGE_WINDOW {
                    peer_record.messages_received = 0;
                    peer_record.messages_received_started_at = now;
                }
                peer_record.messages_received += 1;
            }
            AccessRecord::InvalidBlockReceived => {
                if now.saturating_sub(peer_record.invalid_blocks_received_started_at)
                    > INVALID_BLOCK_WINDOW
                {
                    peer_record.invalid_blocks_received = 0;
                    peer_record.invalid_blocks_received_started_at = now;
                }
                peer_record.invalid_blocks_received += 1;
            }
        }
    }

    //
    // !!! IMPORTANT !!!
    //
    // this function runs intermittently -- and loops through the peers and
    // checks whether they should be upgraded or downgraded based on the
    // information in them.
    //
    pub fn monitor_peers(&mut self, peers: &mut Peers, _now: Timestamp) {
        self.pending_records
            .retain(|peer_id, _| peers.get_peer_by_public_key(peer_id).is_some());
        self.permissions
            .retain(|peer_id, _| peers.get_peer_by_public_key(peer_id).is_some());

        let pending = mem::take(&mut self.pending_records);

        for (peer_id, pending_record) in pending {
            if let Some(_peer) = peers.get_peer_by_public_key_mut(&peer_id) {
                // Keep this commented until peer-side fields are finalized.
                // _peer.messages_received += pending_record.messages_received as u64;
                // _peer.invalid_blocks += pending_record.invalid_blocks_received;
            }

            // TODO: implement threshold-driven permission transitions.
            self.permissions
                .entry(peer_id)
                .or_insert(AccessPermission::Allowed);
        }
    }
}
