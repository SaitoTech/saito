use crate::core::defs::Timestamp;
use crate::core::network::msg::message::Message;
use crate::core::network::peers::Peers;
use ahash::HashMap;
use log::{debug, error, info, trace, warn};
use std::mem;
use std::time::Duration;

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
    RequestBlockchainMessageReceived,
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
    pub last_message_at: Timestamp,
    pub last_request_blockchain_block_id: u64,
    pub last_request_blockchain_timestamp: u64,
    pub last_request_blockchain_score: u32,
    pub request_blockchain_messages_received: u32,
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
    pub permissions: HashMap<u64, AccessPermission>,
    pub pending_records: HashMap<u64, PeerAccessRecords>,
}

impl Gatekeeper {
    pub fn reset(&mut self) {
        self.permissions.clear();
        self.pending_records.clear();
    }

    pub fn is_allowed(&self, peer_id: u64) -> bool {
        matches!(
            self.permissions.get(&peer_id),
            None | Some(AccessPermission::Allowed)
        )
    }

    pub fn is_denied(&self, peer_id: u64) -> bool {
        matches!(
            self.permissions.get(&peer_id),
            Some(AccessPermission::Denied)
        )
    }

    pub fn is_throttled(&self, peer_id: u64) -> bool {
        matches!(
            self.permissions.get(&peer_id),
            Some(AccessPermission::Throttled)
        )
    }

    pub fn add_record(
        &mut self,
        peer_id: u64,
        _message: &Message,
        record: AccessRecord,
        now: Timestamp,
    ) {
        let peer_record = self
            .pending_records
            .entry(peer_id)
            .or_insert(PeerAccessRecords {
                last_message_at: now,
                last_request_blockchain_block_id: 0,
                last_request_blockchain_timestamp: 0,
                last_request_blockchain_score: 0,
                request_blockchain_messages_received: 0,
                messages_received: 0,
                messages_received_started_at: now,
                invalid_blocks_received: 0,
                invalid_blocks_received_started_at: now,
            });

        peer_record.last_message_at = now;

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
            AccessRecord::RequestBlockchainMessageReceived => {
                peer_record.request_blockchain_messages_received += 1;
            } //_ => {}
        }
    }

    //
    // DDOS protection for costly sync-related requests.
    //
    // Records peer behavior and immediately decides whether to allow processing.
    //
    // Behavior model:
    // - meaningful forward sync progress reduces pressure
    // - repeated same-height requests increase pressure gradually
    // - regressions increase pressure sharply
    // - rapid-fire requests increase pressure
    // - pressure naturally decays over time
    //
    // Returns:
    // true  => allow request
    // false => deny request
    //
    pub fn add_costly_record(
        &mut self,
        peer_id: u64,
        message: &Message,
        record: AccessRecord,
        now: Timestamp,
    ) -> bool {
        self.add_record(peer_id, message, record, now);
        let Some(peer_record) = self.pending_records.get_mut(&peer_id) else {
            info!(
                "[SERVICE REFUSAL - COSTLY: gatekeeper refusing request from peer_id={}",
                peer_id
            );
            return false;
        };

        match record {
            AccessRecord::RequestBlockchainMessageReceived => {
                if let Message::RequestBlockchain(request) = message {
                    info!(
                        "[TEMP_SYNC_TRACE][SYNC] costly-check peer_id={} req_latest_id={} seen_count={} prev_latest_id={} prev_score={}",
                        peer_id,
                        request.latest_known_block_id,
                        peer_record.request_blockchain_messages_received,
                        peer_record.last_request_blockchain_block_id,
                        peer_record.last_request_blockchain_score
                    );
                    if peer_record.request_blockchain_messages_received > 50 {
                        info!(
               		    "[SERVICE REFUSAL - COSTLY: too many request blockchain msgs from peer_id={}",
            		    peer_id
            		);
                        return false;
                    }
                    if peer_record.last_request_blockchain_block_id == request.latest_known_block_id
                    {
                        peer_record.last_request_blockchain_score += 10;
                    } else {
                        if peer_record.last_request_blockchain_score > 5 {
                            peer_record.last_request_blockchain_score -= 5;
                        } else {
                            peer_record.last_request_blockchain_score = 0;
                        }
                    }
                    peer_record.last_request_blockchain_block_id = request.latest_known_block_id;
                    peer_record.last_request_blockchain_timestamp = now;
                    info!(
                        "[TEMP_SYNC_TRACE][SYNC] costly-check result peer_id={} req_latest_id={} new_score={}",
                        peer_id,
                        request.latest_known_block_id,
                        peer_record.last_request_blockchain_score
                    );
                    if peer_record.last_request_blockchain_score > 10 {
                        return false;
                    }
                }
                return true;
            }
            _ => {
                return true;
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
            .retain(|peer_id, _| peers.get_peer_by_id(*peer_id).is_some());
        self.permissions
            .retain(|peer_id, _| peers.get_peer_by_id(*peer_id).is_some());

        let pending = mem::take(&mut self.pending_records);

        for (peer_id, pending_record) in pending {
            if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                //
                // Pong can update too, so check
                //
                if pending_record.last_message_at > peer.last_message_at {
                    peer.last_message_at = pending_record.last_message_at;
                }
                peer.last_request_blockchain_block_id =
                    pending_record.last_request_blockchain_block_id;
                peer.last_request_blockchain_timestamp =
                    pending_record.last_request_blockchain_timestamp;
                peer.last_request_blockchain_score = pending_record.last_request_blockchain_score;
                peer.messages_received += pending_record.messages_received as u64;
                peer.invalid_blocks_received += pending_record.invalid_blocks_received;
            }

            // TODO: implement threshold-driven permission transitions.
            self.permissions
                .entry(peer_id)
                .or_insert(AccessPermission::Allowed);
        }
    }
}
