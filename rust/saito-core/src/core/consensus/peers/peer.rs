use crate::core::consensus::peers::peer_service::PeerService;
use crate::core::consensus::peers::rate_limiter::RateLimiter;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{
    PeerIndex, PrintForLog, SaitoHash, SaitoPublicKey, Timestamp, WS_KEEP_ALIVE_PERIOD,
};
use crate::core::io::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
use crate::core::msg::message::Message;
use crate::core::process::version::Version;
use crate::core::util;
use crate::core::util::configuration::Configuration;
use crate::core::util::crypto::{generate_random_bytes, sign, verify};
use log::{debug, info, trace, warn};
use serde::{Serialize, Serializer};
use serde_with::serde_as;
use std::cmp::Ordering;
use std::fmt::Display;
use std::io::{Error, ErrorKind};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

#[derive(Clone, Debug, Serialize)]
pub enum PeerType {
    Default,
    Stun,
}

#[derive(Clone, Debug, Serialize)]
pub enum PeerStatus {
    Disconnected(
        Timestamp, /*next connection time*/
        Timestamp, /*reconnection period*/
    ),
    Connecting,
    Connected,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct PeerStats {
    pub received_block_headers: u64,
    pub last_received_block_header: String,
    pub last_received_block_header_at: Timestamp,
    pub received_txs: u64,
    pub last_received_tx: String,
    pub last_received_tx_at: Timestamp,
    pub received_messages: u64,
    pub last_received_message_at: Timestamp,
    pub sent_messages: u64,
    pub last_sent_message_at: Timestamp,
    pub sent_block_headers: u64,
    pub last_sent_block_header: String,
    pub last_sent_block_header_at: Timestamp,
    pub sent_txs: u64,
    pub last_sent_tx: String,
    pub last_sent_tx_at: Timestamp,
    pub connected_at: Timestamp,
}

fn vec_of_arrays_as_base58<S>(vec: &Vec<[u8; 33]>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let hex_vec: Vec<String> = vec.iter().map(|arr| arr.to_base58()).collect();
    serializer.collect_seq(hex_vec)
}
fn option_as_base58<S>(bytes: &Option<[u8; 33]>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&bytes.unwrap_or([0; 33]).to_base58())
}

// TODO : since we are keeping the peers against a peer index, once a peer is reconnected, we will lose the stats from the previous connection.

#[serde_with::serde_as]
#[derive(Debug, Clone, Serialize)]
pub struct Peer {
    pub index: PeerIndex,
    pub peer_status: PeerStatus,
    pub block_fetch_url: String,
    // if this is None(), it means an incoming connection. else a connection which we started from the data from config file
    pub static_peer_config: Option<util::configuration::PeerConfig>,
    pub challenge_for_peer: Option<SaitoHash>,
    #[serde(serialize_with = "vec_of_arrays_as_base58")]
    pub key_list: Vec<SaitoPublicKey>,
    pub services: Vec<PeerService>,
    pub last_msg_at: Timestamp,
    pub disconnected_at: Timestamp,
    pub wallet_version: Version,
    pub core_version: Version,
    // NOTE: we are currently mapping 1 peer = 1 socket = 1 public key. But in the future we need to support multiple peers per public key
    // so some of these limiters might have to be handled from a different place than the peer. (Eg : Account struct?)
    pub key_list_limiter: RateLimiter,
    pub handshake_limiter: RateLimiter,
    pub message_limiter: RateLimiter,
    pub invalid_block_limiter: RateLimiter,
    #[serde(serialize_with = "option_as_base58")]
    pub public_key: Option<SaitoPublicKey>,
    pub peer_type: PeerType,
    pub ip_address: Option<String>,
    pub stats: PeerStats,
}

impl Peer {
    pub fn new(peer_index: PeerIndex) -> Peer {
        Peer {
            index: peer_index,
            peer_status: PeerStatus::Disconnected(0, 1_000),
            block_fetch_url: "".to_string(),
            static_peer_config: None,
            challenge_for_peer: None,
            key_list: vec![],
            services: vec![],
            last_msg_at: 0,
            disconnected_at: Timestamp::MAX,
            wallet_version: Default::default(),
            core_version: Default::default(),
            key_list_limiter: RateLimiter::builder(100, Duration::from_secs(60)),
            handshake_limiter: RateLimiter::builder(100, Duration::from_secs(60)),
            message_limiter: RateLimiter::builder(100_000, Duration::from_secs(1)),
            invalid_block_limiter: RateLimiter::builder(10, Duration::from_secs(3600)),
            public_key: None,
            peer_type: PeerType::Default,
            ip_address: None,
            stats: PeerStats::default(),
        }
    }

    pub fn new_stun(
        peer_index: PeerIndex,
        public_key: SaitoPublicKey,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Peer {
        let mut peer = Peer::new(peer_index);
        peer.peer_type = PeerType::Stun;
        peer.public_key = Some(public_key);
        peer.peer_status = PeerStatus::Connected;
        peer.services = io_handler.get_my_services();
        peer
    }

    pub fn is_stun_peer(&self) -> bool {
        matches!(self.peer_type, PeerType::Stun)
    }

    pub fn has_key_list_limit_exceeded(&mut self, current_time: Timestamp) -> bool {
        self.key_list_limiter.has_limit_exceeded(current_time)
    }
    pub fn has_handshake_limit_exceeded(&mut self, current_time: Timestamp) -> bool {
        self.handshake_limiter.has_limit_exceeded(current_time)
    }

    pub fn has_message_limit_exceeded(&mut self, current_time: Timestamp) -> bool {
        self.message_limiter.has_limit_exceeded(current_time)
    }

    pub fn has_invalid_block_limit_exceeded(&mut self, current_time: Timestamp) -> bool {
        self.invalid_block_limiter.has_limit_exceeded(current_time)
    }
    pub fn get_limited_till(&mut self, current_time: Timestamp) -> Option<Timestamp> {
        let result = None;

        if self.has_key_list_limit_exceeded(current_time) {
            if self.key_list_limiter.has_limit_exceeded(current_time) {}
        }

        result
    }

    pub fn get_url(&self) -> String {
        if let Some(config) = self.static_peer_config.as_ref() {
            let mut protocol: String = String::from("ws");
            if config.protocol == "https" {
                protocol = String::from("wss");
            }
            protocol
                + "://"
                + config.host.as_str()
                + ":"
                + config.port.to_string().as_str()
                + "/wsopen"
        } else {
            "".to_string()
        }
    }
    pub async fn initiate_handshake(
        &mut self,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Result<(), Error> {
        debug!("initiating handshake : {:?}", self.index);

        let challenge = HandshakeChallenge {
            challenge: generate_random_bytes(32).await.try_into().unwrap(),
        };
        debug!(
            "generated challenge : {:?} for peer : {:?}",
            challenge.challenge.to_hex(),
            self.index
        );
        self.challenge_for_peer = Some(challenge.challenge);
        let message = Message::HandshakeChallenge(challenge);
        io_handler
            .send_message(self.index, message.serialize().as_slice())
            .await?;
        debug!("handshake challenge sent for peer: {:?}", self.index);

        Ok(())
    }

    pub async fn handle_handshake_challenge(
        &mut self,
        challenge: HandshakeChallenge,
        io_handler: &(dyn InterfaceIO + Send + Sync),
        wallet_lock: Arc<RwLock<Wallet>>,
        configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) -> Result<(), Error> {
        debug!(
            "handling handshake challenge : {:?} for peer : {:?}",
            challenge.challenge.to_hex(),
            self.index,
        );
        let block_fetch_url;
        let is_lite;
        {
            let configs = configs_lock.read().await;

            is_lite = configs.is_spv_mode();
            if is_lite {
                block_fetch_url = "".to_string();
            } else {
                block_fetch_url = configs.get_block_fetch_url();
            }
        }

        let wallet = wallet_lock.read().await;
        let response = HandshakeResponse {
            public_key: wallet.public_key,
            signature: sign(challenge.challenge.as_slice(), &wallet.private_key),
            challenge: generate_random_bytes(32).await.try_into().unwrap(),
            is_lite,
            block_fetch_url,
            services: io_handler.get_my_services(),
            wallet_version: wallet.wallet_version,
            core_version: wallet.core_version,
        };
        debug!(
            "handshake challenge : {:?} generated for peer : {:?}",
            response.challenge.to_hex(),
            self.index
        );

        self.challenge_for_peer = Some(response.challenge);
        io_handler
            .send_message(
                self.index,
                Message::HandshakeResponse(response).serialize().as_slice(),
            )
            .await?;
        debug!("first handshake response sent for peer: {:?}", self.index);

        Ok(())
    }
    pub async fn handle_handshake_response(
        &mut self,
        response: HandshakeResponse,
        io_handler: &(dyn InterfaceIO + Send + Sync),
        wallet_lock: Arc<RwLock<Wallet>>,
        configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        current_time: Timestamp,
    ) -> Result<(), Error> {
        debug!(
            "handling handshake response :{:?} for peer : {:?} with address : {:?}",
            response.challenge.to_hex(),
            self.index,
            response.public_key.to_base58()
        );
        if !response.core_version.is_set() {
            debug!(
                "core version is not set in handshake response. expected : {:?}",
                wallet_lock.read().await.core_version
            );
            self.mark_as_disconnected(current_time);
            io_handler.disconnect_from_peer(self.index).await?;
            return Err(Error::from(ErrorKind::InvalidInput));
        }
        if self.challenge_for_peer.is_none() {
            warn!(
                "we don't have a challenge to verify for peer : {:?}",
                self.index
            );
            self.mark_as_disconnected(current_time);
            io_handler.disconnect_from_peer(self.index).await?;
            return Err(Error::from(ErrorKind::InvalidInput));
        }
        // TODO : validate block fetch URL
        let sent_challenge = self.challenge_for_peer.unwrap();
        let result = verify(&sent_challenge, &response.signature, &response.public_key);
        if !result {
            warn!(
                "handshake failed. signature is not valid. sig : {:?} challenge : {:?} key : {:?}",
                response.signature.to_hex(),
                sent_challenge.to_hex(),
                response.public_key.to_base58()
            );
            self.mark_as_disconnected(current_time);
            io_handler.disconnect_from_peer(self.index).await?;
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        let block_fetch_url;
        let is_lite;
        {
            let configs = configs_lock.read().await;

            is_lite = configs.is_spv_mode();
            if is_lite {
                block_fetch_url = "".to_string();
            } else {
                block_fetch_url = configs.get_block_fetch_url();
            }
        }
        let wallet = wallet_lock.read().await;

        if !wallet
            .core_version
            .is_same_minor_version(&response.core_version)
        {
            warn!("peer : {:?} core version is not compatible. current core version : {:?} peer core version : {:?}",
                self.index, wallet.core_version, response.core_version);
            io_handler.send_interface_event(InterfaceEvent::NewVersionDetected(
                self.index,
                response.wallet_version,
            ));
            self.mark_as_disconnected(current_time);
            io_handler.disconnect_from_peer(self.index).await?;
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        if self.public_key.is_some() {
            assert_eq!(
                response.public_key,
                self.public_key.unwrap(),
                "This peer instance is to handle a peer with a different public key"
            );
        }

        self.block_fetch_url = response.block_fetch_url;
        self.services = response.services;
        self.wallet_version = response.wallet_version;
        self.core_version = response.core_version;
        self.peer_status = PeerStatus::Connected;
        self.public_key = Some(response.public_key);

        debug!(
            "my version : {:?} peer version : {:?}",
            wallet.wallet_version, response.wallet_version
        );
        if wallet.wallet_version < response.wallet_version {
            io_handler.send_interface_event(InterfaceEvent::NewVersionDetected(
                self.index,
                response.wallet_version,
            ));
        }

        if self.static_peer_config.is_none() {
            // this is only called in initiator's side.
            // [1. A:challenge -> 2. B:response -> 3. A : response|B verified -> 4. B: A verified]
            // we only need to send a response for response is in above stage 3 (meaning the challenger).

            let response = HandshakeResponse {
                public_key: wallet.public_key,
                signature: sign(&response.challenge, &wallet.private_key),
                is_lite,
                block_fetch_url: block_fetch_url.to_string(),
                challenge: [0; 32],
                services: io_handler.get_my_services(),
                wallet_version: wallet.wallet_version,
                core_version: wallet.core_version,
            };
            io_handler
                .send_message(
                    self.index,
                    Message::HandshakeResponse(response).serialize().as_slice(),
                )
                .await?;
            debug!("second handshake response sent for peer: {:?}", self.index);
        } else {
            info!(
                "handshake completed for peer : {:?}",
                self.get_public_key().unwrap().to_base58()
            );
        }
        self.challenge_for_peer = None;

        io_handler.send_interface_event(InterfaceEvent::PeerHandshakeComplete(self.index));

        Ok(())
    }
    /// Since each peer have a different url for a block to be fetched, this function will generate the correct url from a given block hash
    ///
    /// # Arguments
    ///
    /// * `block_hash`: hash of the block to be fetched
    ///
    /// returns: String
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn get_block_fetch_url(
        &self,
        block_hash: SaitoHash,
        lite: bool,
        my_public_key: SaitoPublicKey,
    ) -> String {
        // TODO : generate the url with proper / escapes,etc...
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
    pub async fn send_ping(
        &mut self,
        current_time: Timestamp,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) {
        if self.last_msg_at + WS_KEEP_ALIVE_PERIOD < current_time {
            self.last_msg_at = current_time;
            trace!("sending ping to peer : {:?}", self.index);
            io_handler
                .send_message(self.index, Message::Ping().serialize().as_slice())
                .await
                .unwrap();
        }
    }
    pub fn has_service(&self, service: String) -> bool {
        self.services.iter().any(|s| s.service == service)
    }

    pub fn compare_version(&self, version: &Version) -> Option<Ordering> {
        // for peer versions, if the version is not set we still consider it as a valid peer
        // TODO : this could lead to an attack. need to provide different versions for different layer components
        if !version.is_set() || !self.wallet_version.is_set() {
            return Some(Ordering::Equal);
        }
        self.wallet_version.partial_cmp(version)
    }

    pub fn is_static_peer(&self) -> bool {
        self.static_peer_config.is_some()
    }
    pub fn get_public_key(&self) -> Option<SaitoPublicKey> {
        self.public_key
    }

    pub fn mark_as_disconnected(&mut self, disconnected_at: Timestamp) {
        self.challenge_for_peer = None;
        self.services = vec![];
        info!(
            "marking peer : {:?} as disconnected. at : {:?}",
            self.index, disconnected_at
        );
        self.disconnected_at = disconnected_at;

        if let PeerStatus::Disconnected(_, _) = self.peer_status {
        } else {
            self.peer_status = PeerStatus::Disconnected(0, 1_000);
        }
    }

    /// Copies data from an old peer instance to a new reconnected peer
    ///
    /// # Arguments
    ///
    /// * `peer`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub(crate) fn join_as_reconnection(&mut self, peer: Peer) {
        assert!(
            !matches!(peer.peer_status, PeerStatus::Connected),
            "Old peer should not be already connected"
        );
        info!(
            "joining peer : {:?} to peer : {:?} as a reconnection",
            peer.index, self.index
        );

        self.message_limiter = peer.message_limiter;
        self.handshake_limiter = peer.handshake_limiter;
        self.key_list_limiter = peer.key_list_limiter;
        self.disconnected_at = Timestamp::MAX;

        self.static_peer_config = peer.static_peer_config;
    }
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::peers::peer::{Peer, PeerStatus};
    use crate::core::process::version::Version;
    use std::cmp::Ordering;

    #[test]
    fn peer_new_test() {
        let peer = Peer::new(1);

        assert_eq!(peer.index, 1);
        assert_eq!(peer.get_public_key(), None);
        assert!(matches!(
            peer.peer_status,
            PeerStatus::Disconnected(0, 1_000)
        ));
        assert_eq!(peer.block_fetch_url, "".to_string());
        assert_eq!(peer.static_peer_config, None);
        assert_eq!(peer.challenge_for_peer, None);
    }

    #[test]
    fn peer_compare_test() {
        let peer_1 = Peer::new(1);
        let mut peer_2 = Peer::new(2);
        let mut peer_3 = Peer::new(3);
        let mut peer_4 = Peer::new(4);

        assert_eq!(peer_1.wallet_version, Version::new(0, 0, 0));

        peer_2.wallet_version = Version::new(0, 0, 1);

        peer_3.wallet_version = Version::new(0, 1, 0);

        peer_4.wallet_version = Version::new(1, 0, 0);

        assert_eq!(
            peer_1.compare_version(&peer_2.wallet_version),
            Some(Ordering::Equal)
        );
        assert_eq!(
            peer_2.compare_version(&peer_1.wallet_version),
            Some(Ordering::Equal)
        );

        assert_eq!(
            peer_3.compare_version(&peer_2.wallet_version),
            Some(Ordering::Greater)
        );
        assert_eq!(
            peer_2.compare_version(&peer_3.wallet_version),
            Some(Ordering::Less)
        );

        assert_eq!(
            peer_3.compare_version(&peer_4.wallet_version),
            Some(Ordering::Less)
        );
        assert_eq!(
            peer_4.compare_version(&peer_3.wallet_version),
            Some(Ordering::Greater)
        );

        assert_eq!(
            peer_3.compare_version(&peer_3.wallet_version),
            Some(Ordering::Equal)
        );
        assert_eq!(
            peer_1.compare_version(&peer_1.wallet_version),
            Some(Ordering::Equal)
        );
    }
}
