use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp, WS_KEEP_ALIVE_PERIOD};
use crate::core::msg::message::Message;
use crate::core::process::version::Version;
use crate::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::routing::peers::peer_service::PeerService;
use crate::core::routing::peers::peerv2::PeerV2;
use crate::core::util::configuration::Endpoint;
use log::{debug, error, info, trace};
use serde::Serialize;
use std::cmp::Ordering;
use std::io::{Error, ErrorKind};
use std::sync::Arc;
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

// #[serde_with::serde_as]
#[derive(Debug, Clone)]
pub struct Peer {
    pub peer_status: PeerStatus,
    pub block_fetch_url: String,
    // if this is None(), it means an incoming connection. else a connection which we started from the data from config file
    // pub static_peer_config: Option<util::configuration::PeerConfig>,
    pub challenge_for_peer: Option<SaitoHash>,
    // #[serde(serialize_with = "vec_of_arrays_as_base58")]
    pub key_list: Vec<SaitoPublicKey>,
    pub services: Vec<PeerService>,
    pub last_msg_sent_at: Timestamp,
    pub last_msg_received_at: Timestamp,
    pub connected_at_my_time: Timestamp,
    pub connected_at_peer_time: Timestamp,
    pub disconnected_at: Timestamp,
    pub wallet_version: Version,
    pub core_version: Version,
    // NOTE: we are currently mapping 1 peer = 1 socket = 1 public key. But in the future we need to support multiple peers per public key
    // #[serde(with = "BigArray")]
    pub public_key: SaitoPublicKey,
    pub peer_type: PeerType,
    pub ip_address: Option<String>,
    pub stats: PeerStats,
    pub endpoint: Endpoint,
    /// peer requested blockchain from us
    pub requested_blockchain_from_us: bool,
    /// we requested blockchain from the peer
    pub requested_blockchain_from_peer: bool,
    pub url: Option<String>,
}

impl Peer {
    pub fn new(public_key: SaitoPublicKey) -> Peer {
        Peer {
            peer_status: PeerStatus::Disconnected(0, 1_000),
            block_fetch_url: "".to_string(),
            // static_peer_config: None,
            challenge_for_peer: None,
            key_list: vec![],
            services: vec![],
            last_msg_sent_at: 0,
            disconnected_at: Timestamp::MAX,
            wallet_version: Default::default(),
            core_version: Default::default(),
            public_key,
            peer_type: PeerType::Default,
            ip_address: None,
            stats: PeerStats::default(),
            endpoint: Endpoint::default(),
            connected_at_my_time: 0,
            connected_at_peer_time: 0,
            last_msg_received_at: 0,
            requested_blockchain_from_us: false,
            requested_blockchain_from_peer: false,
            url: None,
        }
    }

    pub fn new_stun(
        public_key: SaitoPublicKey,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Peer {
        let mut peer = Peer::new(public_key);
        peer.peer_type = PeerType::Stun;
        peer.peer_status = PeerStatus::Connected;
        peer.services = io_handler.get_my_services();
        peer
    }

    pub fn is_stun_peer(&self) -> bool {
        matches!(self.peer_type, PeerType::Stun)
    }

    pub async fn handle_new_peer(
        &mut self,
        peer: PeerV2,
        wallet_lock: Arc<RwLock<Wallet>>,
        io_handler: &Box<dyn InterfaceIO + Send + Sync>,
        current_time: Timestamp,
    ) -> Result<(), Error> {
        let wallet = wallet_lock.read().await;

        let Some(response) = peer.response else {
            error!(
                "cannot finalize peer {} without completed handshake response",
                self.public_key.to_base58()
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        };
        self.public_key = response.public_key;
        // if !wallet
        //     .core_version
        //     .is_same_minor_version(&response.core_version)
        // {
        //     warn!("peer : {:?} core version is not compatible. current core version : {:?} peer core version : {:?}",
        //         self.public_key, wallet.core_version, response.core_version);
        //     io_handler.send_interface_event(InterfaceEvent::NewVersionDetected(
        //         self.public_key,
        //         response.wallet_version,
        //     ));
        //     self.mark_as_disconnected(current_time);
        //     io_handler.disconnect_from_peer(self.public_key).await?;
        //     return Err(Error::from(ErrorKind::InvalidInput));
        // }

        self.block_fetch_url = response.block_fetch_url;
        self.services = response.services;
        self.wallet_version = response.wallet_version;
        self.core_version = response.core_version;
        self.peer_status = PeerStatus::Connected;
        self.public_key = response.public_key;
        self.endpoint = response.endpoint.clone();
        self.connected_at_peer_time = response.timestamp;
        self.connected_at_my_time = current_time;
        self.last_msg_received_at = current_time;
        self.last_msg_sent_at = current_time;
        self.url = peer.url;

        debug!(
            "my version : {:?} peer version : {:?}",
            wallet.wallet_version, response.wallet_version
        );
        if wallet.wallet_version < response.wallet_version {
            io_handler.send_interface_event(InterfaceEvent::NewVersionDetected(
                self.public_key,
                response.wallet_version,
            ));
        }

        debug!(
            "sending key list : {} to peer : {:?}",
            wallet
                .key_list
                .iter()
                .map(|k| k.to_base58())
                .collect::<Vec<String>>()
                .join(","),
            self.public_key.to_base58()
        );

        let _ = io_handler
            .send_message_to_all(
                Message::KeyList(wallet.key_list.to_vec())
                    .serialize()
                    .as_slice(),
                vec![],
            )
            .await
            .or_else(|e| {
                error!("error sending key list to peer : {:?}", e);
                Err(e)
            });

        io_handler.send_interface_event(InterfaceEvent::PeerHandshakeComplete(self.public_key));

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
        if self.last_msg_sent_at + WS_KEEP_ALIVE_PERIOD < current_time {
            self.last_msg_sent_at = current_time;
            if matches!(self.peer_status, PeerStatus::Disconnected(_, _)) {
                trace!(
                    "peer : {} is disconnected. not sending ping",
                    self.public_key.to_base58()
                );
                return;
            }
            trace!("sending ping to peer : {:?}", self.public_key.to_base58());
            let serialized = Message::Ping().serialize();
            io_handler
                .send_message(self.public_key, serialized.as_slice())
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

    // pub fn is_static_peer(&self) -> bool {
    //     self.static_peer_config.is_some()
    // }
    pub fn get_public_key(&self) -> SaitoPublicKey {
        self.public_key
    }
    pub fn is_connected(&self) -> bool {
        matches!(self.peer_status, PeerStatus::Connected)
    }

    pub fn mark_as_disconnected(&mut self, disconnected_at: Timestamp) {
        self.challenge_for_peer = None;
        self.services = vec![];
        self.requested_blockchain_from_us = false;
        self.requested_blockchain_from_peer = false;
        info!(
            "marking peer : {:?} as disconnected. at : {:?}",
            self.public_key.to_base58(),
            disconnected_at
        );
        self.disconnected_at = disconnected_at;

        if let PeerStatus::Disconnected(_, _) = self.peer_status {
        } else {
            self.peer_status = PeerStatus::Disconnected(0, 1_000);
        }
    }

    // /// Copies data from an old peer instance to a new reconnected peer
    // ///
    // /// # Arguments
    // ///
    // /// * `peer`:
    // ///
    // /// returns: ()
    // ///
    // /// # Examples
    // ///
    // /// ```
    // ///
    // /// ```
    // pub(crate) fn join_as_reconnection(&mut self, mut peer: Peer) {
    //     assert!(
    //         !matches!(peer.peer_status, PeerStatus::Connected),
    //         "Old peer should not be already connected"
    //     );
    //     info!(
    //         "joining peer : {:?} to peer : {:?} as a reconnection",
    //         peer.public_key.to_base58(),
    //         self.public_key.to_base58()
    //     );
    //
    //     if self.static_peer_config.is_none() {
    //         self.static_peer_config = peer.static_peer_config;
    //     }
    //     self.requested_blockchain_from_us = false;
    //     self.requested_blockchain_from_peer = false;
    //
    //     peer.static_peer_config = None;
    // }
}

#[cfg(test)]
mod tests {
    use crate::core::process::version::Version;
    use crate::core::routing::peers::peer::{Peer, PeerStatus};
    use std::cmp::Ordering;

    #[test]
    fn peer_new_test() {
        let peer = Peer::new([1; 33]);

        // assert_eq!(peer.index, 1);
        assert_eq!(peer.get_public_key(), [1; 33]);
        assert!(matches!(
            peer.peer_status,
            PeerStatus::Disconnected(0, 1_000)
        ));
        assert_eq!(peer.block_fetch_url, "".to_string());
        assert_eq!(peer.url, None);
        assert_eq!(peer.challenge_for_peer, None);
    }

    #[test]
    fn peer_compare_test() {
        let peer_1 = Peer::new([1; 33]);
        let mut peer_2 = Peer::new([2; 33]);
        let mut peer_3 = Peer::new([3; 33]);
        let mut peer_4 = Peer::new([4; 33]);

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
