use crate::core::defs::{SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::process::version::Version;

use super::network_peer::NetworkPeer;
use super::peer::PeerType;
use super::peer_service::PeerService;

#[derive(Debug)]
pub struct PeerV2 {
    //
    // --- identity ---
    //
    pub id: u64,
    pub public_key: Option<SaitoPublicKey>,
    pub is_verified: bool,

    //
    // --- lifecycle ---
    //
    pub is_connected: bool,
    pub is_connecting: bool,
    pub is_handshaking: bool,
    pub is_synced: bool,

    //
    // --- connection metadata ---
    //
    pub ip: Option<String>,
    pub url: Option<String>,
    pub key_list: Vec<SaitoPublicKey>,

    //
    // --- handshake ---
    //
    pub handshake_challenge_sent: Option<SaitoHash>,
    pub handshake_challenge_received: Option<SaitoHash>,
    pub handshake_attempts: u32,
    pub handshake_attempts_failed: u32,

    //
    // --- protocol state ---
    //
    pub services: Vec<PeerService>,
    pub peer_type: PeerType,
    pub wallet_version: Version,
    pub core_version: Version,

    //
    // --- timing ---
    //
    pub connected_at: Timestamp,
    pub last_activity_at: Timestamp,
    pub last_message_at: Timestamp,
    pub last_block_at: Timestamp,
    pub last_transaction_at: Timestamp,

    //
    // --- volume counters (lifetime) ---
    //
    pub messages_received: u64,
    pub messages_sent: u64,

    pub blocks_received: u64,
    pub blocks_sent: u64,

    pub transactions_received: u64,
    pub transactions_sent: u64,

    //
    // --- short-term load tracking ---
    //
    pub recent_message_window_start: Timestamp,
    pub recent_message_count: u32,
    pub recent_transaction_count: u32,
    pub recent_block_count: u32,

    //
    // --- error / failure signals ---
    //
    pub invalid_messages: u32,
    pub invalid_blocks: u32,
    pub invalid_transactions: u32,
    pub dropped_requests: u32,

    //
    // --- sync / protocol flags ---
    //
    pub requested_blocks_from_us: bool,
    pub requested_blocks_from_peer: bool,

    //
    // --- legacy bridge ---
    //
    pub legacy_network_peer: Option<NetworkPeer>,
}

impl PeerV2 {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            public_key: None,
            is_verified: false,
            is_connected: false,
            is_connecting: true,
            is_handshaking: false,
            is_synced: false,
            ip: None,
            url: None,
	    key_list: Vec::new(),
            handshake_challenge_sent: None,
            handshake_challenge_received: None,
            handshake_attempts: 0,
            handshake_attempts_failed: 0,
            services: Vec::new(),
            peer_type: PeerType::Default,
            wallet_version: Version::default(),
            core_version: Version::default(),
            connected_at: 0,
            last_activity_at: 0,
            last_message_at: 0,
            last_block_at: 0,
            last_transaction_at: 0,
            messages_received: 0,
            messages_sent: 0,
            blocks_received: 0,
            blocks_sent: 0,
            transactions_received: 0,
            transactions_sent: 0,
            recent_message_window_start: 0,
            recent_message_count: 0,
            recent_transaction_count: 0,
            recent_block_count: 0,
            invalid_messages: 0,
            invalid_blocks: 0,
            invalid_transactions: 0,
            dropped_requests: 0,
            requested_blocks_from_us: false,
            requested_blocks_from_peer: false,
            legacy_network_peer: None,
        }
    }

pub fn is_connected(&self) -> bool {
    self.is_connected
}

    pub fn on_handshake_complete(&mut self, public_key: SaitoPublicKey, current_time: Timestamp) {
        self.public_key = Some(public_key);
        self.is_verified = true;

        self.is_connected = true;
        self.is_connecting = false;
        self.is_handshaking = false;

        self.connected_at = current_time;
        self.last_activity_at = current_time;
    }

    pub fn on_disconnect(&mut self, current_time: Timestamp) {
        self.is_connected = false;
        self.is_connecting = false;
        self.is_handshaking = false;
        self.last_activity_at = current_time;
        self.requested_blocks_from_peer = false;
        self.requested_blocks_from_us = false;
        self.services.clear();
    }

    pub fn on_stun_connect(&mut self, public_key: SaitoPublicKey, current_time: Timestamp) {
        self.on_handshake_complete(public_key, current_time);
        self.peer_type = PeerType::Stun;
    }

    pub fn on_message_received(&mut self, now: Timestamp) {
        self.messages_received += 1;
        self.last_message_at = now;
        self.last_activity_at = now;
        self.recent_message_count += 1;
    }

    pub fn on_transaction_received(&mut self, now: Timestamp) {
        self.transactions_received += 1;
        self.last_transaction_at = now;
        self.last_activity_at = now;
        self.recent_transaction_count += 1;
    }

    pub fn on_block_received(&mut self, now: Timestamp) {
        self.blocks_received += 1;
        self.last_block_at = now;
        self.last_activity_at = now;
        self.recent_block_count += 1;
    }
}
