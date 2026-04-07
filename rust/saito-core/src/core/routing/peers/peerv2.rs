use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::process::version::Version;
use crate::core::routing::io::network_event::NetworkEvent;
use crate::core::util::configuration::{Configuration, Endpoint};
use crate::core::util::crypto::{generate_random_bytes, hash, sign, verify};
use log::{debug, error, info, trace, warn};
use std::io::{Error, ErrorKind};
use std::ops::Deref;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::peer_service::PeerService;

#[derive(Clone, Debug)]
pub enum PeerType {
    Default,
    Stun,
}

#[derive(Debug, Clone)]
pub struct PeerV2 {
    //
    // --- identity ---
    //
    pub id: u64,
    pub public_key: Option<SaitoPublicKey>,
    pub endpoint: Endpoint,

    //
    // --- lifecycle ---
    //
    pub is_verified: bool,
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
    pub challenge: Option<SaitoHash>,
    pub response: Option<HandshakeResponse>,

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
    pub block_fetch_url: String,
}

impl PeerV2 {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            public_key: None,
            endpoint: Endpoint::default(),
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
            challenge: None,
            response: None,
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
            block_fetch_url: "".to_string(),
        }
    }

    pub async fn get_handshake_challenge_buffer(&mut self) -> HandshakeChallenge {
        let challenge = HandshakeChallenge {
            challenge: hash(&generate_random_bytes(32).await),
        };
        self.challenge = Some(challenge.challenge);
        challenge
    }

    pub async fn process_handshake_challenge(
        &mut self,
        challenge: &HandshakeChallenge,
        current_time: Timestamp,
        services: &Vec<PeerService>,
        wallet: &Wallet,
        configs: &(dyn Configuration + Send + Sync),
    ) -> Result<HandshakeResponse, Error> {
        debug!("processing handshake challenge");
        let block_fetch_url;
        let is_lite;
        let endpoint;
        {
            if let Some(config) = configs.get_server_configs() {
                endpoint = config.endpoint.clone();
            } else {
                endpoint = Endpoint::default();
            }
            is_lite = configs.is_spv_mode();
            if is_lite {
                block_fetch_url = "".to_string();
            } else {
                block_fetch_url = configs.get_block_fetch_url();
            }
        }

        let response = HandshakeResponse {
            public_key: wallet.public_key,
            signature: sign(challenge.challenge.as_slice(), &wallet.private_key),
            challenge: hash(&generate_random_bytes(32).await),
            is_lite,
            block_fetch_url,
            services: services.clone(),
            wallet_version: wallet.wallet_version,
            core_version: wallet.core_version,
            endpoint: endpoint.clone(),
            timestamp: current_time,
        };
        self.challenge = Some(response.challenge);

        Ok(response)
    }

    pub fn process_handshake_response(
        &mut self,
        response: HandshakeResponse,
        current_time: Timestamp,
        services: &Vec<PeerService>,
        wallet: &Wallet,
        configs: &(dyn Configuration + Send + Sync),
    ) -> Result<Option<HandshakeResponse>, Error> {
        debug!(
            "processing handshake response from peer : {:?}",
            response.public_key.to_base58()
        );
        if !response.core_version.is_set() {
            debug!(
                "core version is not set in handshake response. expected : {:?}",
                wallet.core_version
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        // TODO : validate block fetch URL
        let sent_challenge = match self.challenge {
            Some(c) => c,
            None => {
                warn!(
                    "we don't have a challenge to verify for peer : {:?}",
                    response.public_key.to_base58()
                );
                return Err(Error::from(ErrorKind::InvalidInput));
            }
        };
        let result = verify(&sent_challenge, &response.signature, &response.public_key);
        if !result {
            warn!(
                "handshake failed. signature is not valid. sig : {:?} challenge : {:?} key : {:?}",
                response.signature.to_hex(),
                sent_challenge.to_hex(),
                response.public_key.to_base58()
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        let block_fetch_url;
        let is_lite;
        let endpoint;
        {
            if let Some(config) = configs.get_server_configs() {
                endpoint = config.endpoint.clone();
            } else {
                endpoint = Endpoint::default();
            }
            is_lite = configs.is_spv_mode();
            if is_lite {
                block_fetch_url = "".to_string();
            } else {
                block_fetch_url = configs.get_block_fetch_url();
            }
        }

        if let Some(existing_key) = self.public_key {
            if response.public_key != existing_key {
                warn!(
                    "peer public key mismatch: existing {} vs new {}",
                    existing_key.to_base58(),
                    response.public_key.to_base58()
                );
                return Err(Error::from(ErrorKind::InvalidInput));
            }
        }

        self.public_key = Some(response.public_key);
        self.response = Some(response.clone());

        if self.url.is_none() {
            // this is only called in initiator's side.
            // [1. A:challenge -> 2. B:response -> 3. A : response|B verified -> 4. B: A verified]
            // we only need to send a response for response is in above stage 3 (meaning the challenger).

            let response_new = HandshakeResponse {
                public_key: wallet.public_key,
                signature: sign(&response.challenge, &wallet.private_key),
                is_lite,
                block_fetch_url: block_fetch_url.to_string(),
                challenge: [0; 32],
                services: services.clone(),
                wallet_version: wallet.wallet_version,
                core_version: wallet.core_version,
                endpoint: endpoint.clone(),
                timestamp: current_time,
            };
            debug!(
                "sending handshake response for peer: {:?}",
                response.public_key.to_base58()
            );
            return Ok(Some(response_new));
        }
        self.challenge = None;

        Ok(None)
    }

    pub async fn process_incoming_buffer<F2, S>(
        &mut self,
        buffer: Vec<u8>,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync>>,
        timer: &Timer,
        services: &Vec<PeerService>,
        send_event: S,
    ) -> Result<Vec<u8>, Error>
    where
        S: FnOnce(NetworkEvent) -> F2,
        F2: std::future::Future<Output = ()>,
    {
        trace!(
            "PeerV2::process_msg_buffer_from_peer : {}",
            self.public_key.unwrap_or([0; 33]).to_base58()
        );

        //
        // if the handshake is completed, this is a peer message
        //
        if self.is_verified {
            let Some(public_key) = self.public_key else {
                error!("connected peer has no public key set; skipping message dispatch");
                return Err(Error::from(ErrorKind::InvalidData));
            };
            send_event(NetworkEvent::PeerMessageReceived { public_key, buffer }).await;
            Ok(vec![])

        //
        // otherwise, it must be the handshake
        //
        } else if self.challenge.is_some() {
            if let Message::HandshakeResponse(response) = Message::deserialize(buffer)? {
                let configs = configs.read().await;
                let wallet = wallet.read().await;

                if !wallet
                    .core_version
                    .is_same_minor_version(&response.core_version)
                {
                    warn!("peer : {:?} core version is not compatible. current core version : {:?} peer core version : {:?}",
                             response.public_key.to_base58(), wallet.core_version, response.core_version);

                    send_event(NetworkEvent::NewVersionDetected {
                        public_key: response.public_key,
                        version: response.wallet_version,
                    })
                    .await;
                } else {
                    return if let Ok(result) = self.process_handshake_response(
                        response.clone(),
                        timer.get_timestamp_in_ms(),
                        &services,
                        &wallet,
                        configs.deref(),
                    ) {
                        let mut buffer = vec![];
                        if let Some(response) = result {
                            // we need to send this response to the other side
                            buffer = Message::HandshakeResponse(response).serialize();
                        }
                        // now the handshake is complete. We need to alert the core
                        send_event(NetworkEvent::PeerConnectionResult {
                            result: Ok(self.clone()),
                        })
                        .await;
                        debug!(
                            "handshake completed for peer : {:?}",
                            self.public_key.unwrap_or([0; 33]).to_base58()
                        );
                        Ok(buffer)
                    } else {
                        warn!("failed handling the handshake response");
                        Err(Error::from(ErrorKind::InvalidInput))
                    };
                }
                Ok(vec![])
            } else {
                warn!(
                    "failed deserializing handshake response. ip : {}",
                    self.ip.as_ref().unwrap_or(&"unknown".to_string())
                );
                Err(Error::from(ErrorKind::InvalidInput))
            }
        } else if let Message::HandshakeChallenge(challenge) = Message::deserialize(buffer)? {
            let configs = configs.read().await;
            let wallet = wallet.read().await;
            if let Ok(response) = self
                .process_handshake_challenge(
                    &challenge,
                    timer.get_timestamp_in_ms(),
                    &services,
                    &wallet,
                    configs.deref(),
                )
                .await
            {
                debug!("sending handshake response to peer");
                return Ok(Message::HandshakeResponse(response).serialize());
            }
            Ok(vec![])
        } else {
            error!(
                "failed deserializing handshake challenge : {:?}",
                self.public_key.unwrap_or([0; 33]).to_base58(),
            );
            Err(Error::from(ErrorKind::InvalidInput))
        }
    }

    pub fn get_public_key(&self) -> SaitoPublicKey {
        self.public_key.unwrap()
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
        let response = self.response.as_ref().expect("handshake response missing");
        self.block_fetch_url = response.block_fetch_url.clone();

        self.public_key = Some(public_key);

        self.is_verified = true;
        self.is_connected = true;
        self.is_connecting = false;
        self.is_handshaking = false;

        self.services = response.services.clone();
        self.wallet_version = response.wallet_version;
        self.core_version = response.core_version;

        self.endpoint = response.endpoint.clone();

        self.connected_at = current_time;
        self.last_activity_at = current_time;
        self.last_message_at = current_time;
    }

    pub fn on_disconnect(&mut self, current_time: Timestamp) {
        // --- lifecycle ---
        self.is_connected = false;
        self.is_connecting = false;
        self.is_handshaking = false;
        self.is_verified = false;

        // --- timing ---
        self.last_activity_at = current_time;

        // --- handshake state ---
        self.challenge = None;
        self.response = None;
        self.handshake_challenge_sent = None;
        self.handshake_challenge_received = None;
        self.handshake_attempts = 0;
        self.handshake_attempts_failed = 0;

        // --- protocol state ---
        self.services.clear();
        self.requested_blocks_from_peer = false;
        self.requested_blocks_from_us = false;

        // --- sync state ---
        self.is_synced = false;

        // --- logging (safe) ---
        if let Some(pk) = &self.public_key {
            info!("peer {:?} disconnected at {}", pk.to_base58(), current_time);
        }
    }

    pub fn on_stun_connect(&mut self, public_key: SaitoPublicKey, current_time: Timestamp) {
        self.public_key = Some(public_key);
        self.is_verified = true;
        self.is_connected = true;
        self.is_connecting = false;
        self.is_handshaking = false;
        self.last_activity_at = current_time;
        self.last_message_at = current_time;
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

    pub fn get_block_fetch_url(
        &self,
        block_hash: SaitoHash,
        lite: bool,
        my_public_key: SaitoPublicKey,
    ) -> String {
        if lite {
            self.block_fetch_url.to_string()
                + "/lite-block/"
                + block_hash.to_hex().as_str()
                + "/"
                + my_public_key.to_base58().as_str()
        } else {
            self.block_fetch_url.to_string() + "/block/" + block_hash.to_hex().as_str()
        }
    }

    pub fn has_service(&self, service: PeerService) -> bool {
        self.services.contains(&service)
    }
}
