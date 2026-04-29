use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::network::service::Service;
use crate::core::process::version::Version;
use crate::core::util::configuration::Endpoint;
use log::{info, warn};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PeerType {
    Default,
    Stun,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Peer {
    //
    // --- identity ---
    //
    pub id: u64,
    #[serde(with = "crate::core::defs::saito_public_key_serde::option")]
    pub public_key: Option<SaitoPublicKey>,
    pub endpoint: Endpoint,

    //
    // --- lifecycle ---
    //
    pub is_verified: bool,
    pub is_connected: bool,
    pub is_connecting: bool,
    pub is_handshaking: bool,
    pub is_syncing: bool,
    pub is_synced: bool,
    pub is_services_fetching: bool,
    pub is_services_fetched: bool,

    //
    // --- connection metadata ---
    //
    pub ip: Option<String>,
    pub url: Option<String>,
    #[serde(with = "crate::core::defs::saito_public_key_serde::vec")]
    pub key_list: Vec<SaitoPublicKey>,
    pub disconnect_on_stale: bool,

    //
    // --- handshake ---
    //
    pub handshake_nonce: Option<SaitoHash>,

    //
    // --- protocol state ---
    //
    pub services: Vec<Service>,
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
    // --- statistics and congestion tracking ---
    //
    pub last_request_blockchain_block_id: u64,
    pub last_request_blockchain_timestamp: u64,
    pub last_request_blockchain_score: u32,

    pub messages_received: u64,
    pub messages_sent: u64,
    pub blocks_received: u64,
    pub blocks_sent: u64,
    pub transactions_received: u64,
    pub transactions_sent: u64,
    pub invalid_messages_received: u32,
    pub invalid_blocks_received: u32,
    pub invalid_transactions_received: u32,
    pub dropped_requests: u32,

    //
    // --- short-term load tracking ---
    //
    pub recent_message_window_start: Timestamp,
    pub recent_message_count: u32,
    pub recent_transaction_count: u32,
    pub recent_block_count: u32,

    //
    // --- sync / protocol flags ---
    //
    pub requested_blocks_from_us: bool,
}

impl Peer {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            public_key: None,
            endpoint: Endpoint::default(),
            is_verified: false,
            is_connected: false,
            is_connecting: true,
            is_handshaking: false,
            is_syncing: false,
            is_synced: false,
            is_services_fetching: false,
            is_services_fetched: false,
            ip: None,
            url: None,
            key_list: Vec::new(),
            disconnect_on_stale: true,
            handshake_nonce: None,
            services: Vec::new(),
            peer_type: PeerType::Default,
            wallet_version: Version::default(),
            core_version: Version::default(),
            connected_at: 0,
            last_activity_at: 0,
            last_message_at: 0,
            last_block_at: 0,
            last_transaction_at: 0,
            last_request_blockchain_block_id: 0,
            last_request_blockchain_timestamp: 0,
            last_request_blockchain_score: 0,
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
            invalid_messages_received: 0,
            invalid_blocks_received: 0,
            invalid_transactions_received: 0,
            dropped_requests: 0,
            requested_blocks_from_us: false,
        }
    }

    pub fn on_connect(&mut self, current_time: Timestamp) {
        self.is_connected = true;
        self.is_connecting = false;
        self.is_verified = false;
        self.is_handshaking = false;

        self.connected_at = current_time;
        self.last_activity_at = current_time;
        self.last_message_at = current_time;
    }

    pub fn on_handshake_complete(&mut self, public_key: SaitoPublicKey, current_time: Timestamp) {
        info!("ON HANDSHAKE COMPLETE: received handshake request");
        self.public_key = Some(public_key);
        self.is_verified = true;
        self.is_handshaking = false;
        self.handshake_nonce = None;

        self.connected_at = current_time;
        self.last_activity_at = current_time;
        self.last_message_at = current_time;
    }

    pub fn on_disconnect(&mut self, current_time: Timestamp) {
        let prev_connected = self.is_connected;
        let prev_syncing = self.is_syncing;
        let prev_synced = self.is_synced;
        let prev_services_fetching = self.is_services_fetching;
        let prev_services_fetched = self.is_services_fetched;

        // --- lifecycle ---
        self.is_connected = false;
        self.is_connecting = false;
        self.is_handshaking = false;
        self.is_verified = false;

        self.is_syncing = false;
        self.is_synced = false;

        // --- services ---
        self.services.clear();
        self.is_services_fetching = false;
        self.is_services_fetched = false;

        // --- timing ---
        self.last_activity_at = current_time;

        // --- handshake state ---
        self.handshake_nonce = None;

        // --- protocol state ---
        self.services.clear();
        self.requested_blocks_from_us = false;

        // --- sync state ---
        self.is_syncing = false;
        self.is_synced = false;

        // --- logging (safe) ---
        info!(
            "[TEMP_SYNC_TRACE][SYNC] peer disconnect reset peer_id={} connected:{}->{} syncing:{}->{} synced:{}->{} services_fetching:{}->{} services_fetched:{}->{} at={}",
            self.id,
            prev_connected,
            self.is_connected,
            prev_syncing,
            self.is_syncing,
            prev_synced,
            self.is_synced,
            prev_services_fetching,
            self.is_services_fetching,
            prev_services_fetched,
            self.is_services_fetched,
            current_time
        );
        if let Some(pk) = &self.public_key {
            info!("peer {:?} disconnected at {}", pk.to_base58(), current_time);
        }
    }

    pub fn on_sync_complete(&mut self) {
        self.is_syncing = false;
        self.is_synced = true;
    }

    pub fn on_stun_connect(&mut self, public_key: SaitoPublicKey, current_time: Timestamp) {
        self.public_key = Some(public_key);
        self.is_connected = true;
        self.is_connecting = false;
        self.last_activity_at = current_time;
        self.last_message_at = current_time;
        self.peer_type = PeerType::Stun;
    }

    pub fn get_public_key(&self) -> SaitoPublicKey {
        self.public_key.unwrap_or([0; 33])
    }

    pub fn get_block_fetch_url(
        &self,
        block_hash: SaitoHash,
        lite: bool,
        my_public_key: SaitoPublicKey,
    ) -> String {
        let mut base = String::new();

        // Prefer deriving from peer.url (typically ws(s)://host:port/wsopen).
        if let Some(url) = &self.url {
            if let Some((scheme, rest)) = url.split_once("://") {
                let authority = rest.split('/').next().unwrap_or_default(); // host[:port]
                if !authority.is_empty() {
                    let http_scheme = match scheme {
                        "wss" => "https",
                        "ws" => "http",
                        "https" => "https",
                        "http" => "http",
                        _ => "",
                    };
                    if !http_scheme.is_empty() {
                        base = format!("{}://{}", http_scheme, authority);
                    }
                }
            }
        }

        if base.is_empty() && !self.endpoint.host.is_empty() && self.endpoint.port > 0 {
            let http_scheme = match self.endpoint.protocol.as_str() {
                "wss" | "https" => "https",
                _ => "http",
            };
            base = format!(
                "{}://{}:{}",
                http_scheme, self.endpoint.host, self.endpoint.port
            );
        }

        // If no block-specific metadata is provided, return only the base fetch URL.
        // This supports callers that want to cache/inspect the base endpoint.
        let missing_hash = block_hash == [0; 32];
        let missing_lite_pk = lite && my_public_key == [0; 33];
        if missing_hash {
            return base;
        }

        if missing_lite_pk {
            warn!(
                "[TRACE_SYNC] missing_spv_public_key_fallback_to_full_block_url base={} block_hash={}",
                base,
                block_hash.to_hex()
            );
            return format!("{}/block/{}", base, block_hash.to_hex());
        }

        if lite {
            format!(
                "{}/lite-block/{}/{}",
                base,
                block_hash.to_hex(),
                my_public_key.to_base58()
            )
        } else {
            format!("{}/block/{}", base, block_hash.to_hex())
        }
    }

    pub fn has_service(&self, service: Service) -> bool {
        self.services.contains(&service)
    }
}
