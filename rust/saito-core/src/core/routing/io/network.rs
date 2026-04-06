use log::{debug, error, info, trace, warn};
use std::io::Error;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::process::version::Version;
use crate::core::routing::io::interface_io::InterfaceEvent;
use crate::core::routing::io::interface_io::InterfaceIO;
use crate::core::routing::peers::congestion_controller::CongestionType;
use crate::core::routing::peers::peer::PeerStatus;
use crate::core::routing::peers::peer_service::PeerService;
use crate::core::routing::peers::peers::Peers;
use crate::core::routing::peers::peerv2::PeerV2;
use crate::core::util::configuration::Configuration;

#[derive(Debug)]
pub enum PeerDisconnectType {
    /// If the peer was disconnected without our intervention
    ExternalDisconnect,
    /// If we disconnected the peer
    InternalDisconnect,
}

// #[derive(Debug)]
pub struct Network {
    // TODO : manage peers from network
    pub peer_lock: Arc<RwLock<Peers>>,
    pub io_interface: Box<dyn InterfaceIO + Send + Sync>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub timer: Timer,
}

impl Network {
    pub fn new(
        io_handler: Box<dyn InterfaceIO + Send + Sync>,
        peer_lock: Arc<RwLock<Peers>>,
        wallet_lock: Arc<RwLock<Wallet>>,
        timer: Timer,
    ) -> Network {
        Network {
            peer_lock,
            io_interface: io_handler,
            wallet_lock,
            timer,
        }
    }
    pub async fn propagate_block(&self, block: &Block) {
        debug!("propagating block : {:?}", block.hash.to_hex());

        let mut excluded_peers = vec![];
        // finding block sender to avoid resending the block to that node
        if let Some(index) = block.routed_from_peer.as_ref() {
            excluded_peers.push(*index);
        }

        {
            let mut peers = self.peer_lock.write().await;
            for (index, peer) in peers.peers.iter_mut() {
                if !peer.is_connected() {
                    excluded_peers.push(*index);
                    continue;
                }
                peer.stats.sent_block_headers += 1;
                peer.stats.last_sent_block_header_at = self.timer.get_timestamp_in_ms();
                peer.stats.last_received_block_header = block.hash.to_hex();
            }
        }

        debug!("sending block : {:?} to peers", block.hash.to_hex());
        let message = Message::BlockReference(block.hash, block.id);
        let serialized = message.serialize();
        self.io_interface
            .send_message_to_all(serialized.as_slice(), excluded_peers)
            .await
            .unwrap();
    }

    pub async fn propagate_transaction(&self, transaction: &Transaction) {
        // TODO : return if tx is not valid

        let mut peers = self.peer_lock.write().await;
        let mut wallet = self.wallet_lock.write().await;

        let public_key = wallet.public_key;

        if transaction
            .from
            .first()
            .expect("from slip should exist")
            .public_key
            == public_key
        {
            if let TransactionType::GoldenTicket = transaction.transaction_type {
            } else {
                wallet.add_to_pending(transaction.clone());
            }
        }

        for (index, peer) in peers.peers.iter_mut() {
            if !peer.is_connected() {
                continue;
            }
            let public_key = peer.get_public_key();
            if transaction.is_in_path(&public_key) {
                continue;
            }

            peer.stats.sent_txs += 1;
            peer.stats.last_sent_tx_at = self.timer.get_timestamp_in_ms();
            peer.stats.last_sent_tx = transaction.signature.to_hex();

            let mut transaction = transaction.clone();
            transaction.add_hop(&wallet.private_key, &wallet.public_key, &public_key);
            let message = Message::Transaction(transaction);
            let serialized = message.serialize();
            _ = self
                .io_interface
                .send_message(*index, serialized.as_slice())
                .await
                .inspect_err(|e| error!("{}", e));
        }
    }

    pub async fn update_peer_timestamp(&self, public_key: SaitoPublicKey, timestamp: Timestamp) {
        let mut peers = self.peer_lock.write().await;
        peers.update_peer_timer(public_key, timestamp).await;
    }

    pub async fn record_received_transaction(
        &self,
        public_key: SaitoPublicKey,
        transaction: &Transaction,
        timestamp: Timestamp,
    ) {
        let mut peers = self.peer_lock.write().await;
        if let Some(peer_v2) = peers.get_peer_by_public_key_mut(&public_key) {
            peer_v2.on_transaction_received(timestamp);
        }
    }

    pub async fn record_failed_block_fetch(
        &self,
        public_key: SaitoPublicKey,
        timestamp: Timestamp,
    ) {
        let mut peers = self.peer_lock.write().await;
        peers.add_congestion_event(public_key, CongestionType::FailedBlockFetches, timestamp);
    }

    pub async fn record_incoming_message(&self, public_key: SaitoPublicKey, timestamp: Timestamp) {
        let mut peers = self.peer_lock.write().await;
        peers.add_congestion_event(public_key, CongestionType::IncomingMessages, timestamp);
        if let Some(peer_v2) = peers.get_peer_by_public_key_mut(&public_key) {
            peer_v2.on_message_received(timestamp);
        }
    }

    pub async fn add_peer(
        &mut self,
        mut peer: PeerV2,
        wallet_lock: Arc<RwLock<Wallet>>,
        current_time: Timestamp,
    ) -> Option<SaitoPublicKey> {
        let public_key = match peer.public_key {
            Some(k) => k,
            None => {
                warn!("handle_new_peer: received peer with no public key (incomplete handshake); dropping");
                return None;
            }
        };

        {
            let mut peers = self.peer_lock.write().await;

            if peers.is_peer_blacklisted(public_key, current_time) {
                warn!(
                    "peer : {:?} is blacklisted. not connecting to it. ip : {:?}",
                    public_key.to_base58(),
                    peer.ip.as_deref().unwrap_or("unknown")
                );
                return Some(public_key);
            }

            info!("adding new peer : {}", public_key.to_base58());
            peer.on_handshake_complete(public_key, current_time);

            let _ = self
                .io_interface
                .send_message_to_all(
                    Message::KeyList(wallet.key_list.to_vec())
                        .serialize()
                        .as_slice(),
                    vec![],
                )
                .await;

            self.io_interface
                .send_interface_event(InterfaceEvent::PeerHandshakeComplete(public_key));

            peers.add_congestion_event(public_key, CongestionType::PeerConnections, current_time);
            peers.peers_v2.insert(peer.id, peer);
        }

        Some(public_key)
    }

    pub async fn cleanup_peers(&self, current_time: Timestamp) {
        let mut peers = self.peer_lock.write().await;

        peers
            .disconnect_stale_peers(current_time, self.io_interface.as_ref())
            .await;

        peers.remove_disconnected_peers(current_time);
    }

    pub async fn process_services_message(
        &self,
        public_key: SaitoPublicKey,
        services: Vec<PeerService>,
    ) {
        let mut peers = self.peer_lock.write().await;
        peers.process_peer_services(services, public_key).await;
    }

    pub async fn handle_key_list_update(
        &self,
        public_key: SaitoPublicKey,
        key_list: Vec<SaitoPublicKey>,
        timestamp: Timestamp,
    ) {
        let mut peers = self.peer_lock.write().await;

        if let Err(e) = peers
            .handle_received_key_list(public_key, key_list, timestamp)
            .await
        {
            error!("Received key list error: {:?}", e);
        }
    }

    pub async fn add_stun_peer(&self, public_key: SaitoPublicKey, timestamp: Timestamp) {
        let mut peers = self.peer_lock.write().await;
        peers
            .handle_new_stun_peer(public_key, timestamp, &self.io_interface)
            .await;
    }

    pub async fn remove_stun_peer(&self, public_key: SaitoPublicKey) {
        let mut peers = self.peer_lock.write().await;
        peers.remove_stun_peer(public_key, &self.io_interface).await;
    }

    pub async fn request_blockchain_on_connect(
        &self,
        public_key: SaitoPublicKey,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        is_browser: bool,
    ) -> bool {
        let blockchain = blockchain_lock.read().await;

        if blockchain.get_latest_block().is_none() && !is_browser {
            // request genesis block
            info!(
                "requesting genesis block from peer : {:?}",
                public_key.to_base58()
            );

            self.send_message(public_key, Message::RequestGenesisBlockReference())
                .await;

            return true; // waiting_for_genesis_block = true
        }

        drop(blockchain);

        info!(
            "requesting blockchain from peer : {:?} after handshake",
            public_key.to_base58()
        );

        // NOTE: we do NOT move request_blockchain_from_peer yet
        // so routing_thread still calls it

        false
    }

    pub async fn initialize_static_peers(
        &mut self,
        configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        let configs = configs_lock.read().await;

        for peer in configs.get_peer_configs().iter() {
            let peer_url = peer.get_url();

            if let Err(err) = self.io_interface.connect_to_peer(peer_url.clone()).await {
                error!(
                    "failed connecting to configured peer {:?}: {:?}",
                    peer_url, err
                );
            }
        }
    }

    pub async fn ping(&mut self) {
        let current_time = self.timer.get_timestamp_in_ms();
        let mut peers = self.peer_lock.write().await;
        for (_, peer) in peers.peers.iter_mut() {
            peer.send_ping(current_time, self.io_interface.as_ref())
                .await;
        }
    }

    pub async fn manage_congested_peers(&mut self) {
        let peers = self.peer_lock.write().await;
        let current_time = self.timer.get_timestamp_in_ms();
        let congested_peers: Vec<SaitoPublicKey> = peers.get_congested_peers(current_time);
        drop(peers);

        for public_key in congested_peers {
            warn!(
                "peer : {:?} is congested. so disconnecting...",
                public_key.to_base58()
            );
            if let Err(e) = self
                .disconnect_from_peer(public_key, "Peer is congested")
                .await
            {
                error!("{:?}", e);
            }
        }
    }

    pub async fn send_key_list(&self, key_list: &[SaitoPublicKey]) {
        trace!(
            "sending key list to all the peers {:?}",
            key_list
                .iter()
                .map(|key| key.to_base58())
                .collect::<Vec<String>>()
        );

        {
            let peers = self.peer_lock.read().await;

            let exclusions = peers
                .peers
                .values()
                .filter_map(|peer| {
                    if !matches!(peer.peer_status, PeerStatus::Connected) {
                        Some(peer.public_key)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();

            self.io_interface
                .send_message_to_all(
                    Message::KeyList(key_list.to_vec()).serialize().as_slice(),
                    exclusions,
                )
                .await
                .unwrap();
        }
    }

    pub async fn record_received_block_header(
        &self,
        public_key: SaitoPublicKey,
        block_hash: &SaitoHash,
        timestamp: Timestamp,
    ) {
        let mut peers = self.peer_lock.write().await;
        if let Some(peer_v2) = peers.get_peer_by_public_key_mut(&public_key) {
            peer_v2.on_block_received(timestamp);
        }
    }

    pub async fn connect_to_static_peers(&mut self, current_time: Timestamp) {
        trace!("connecting to static peers");

        let mut peers = self.peer_lock.write().await;

        for (public_key, peer) in &mut peers.peers {
            let url = match peer.url.as_ref() {
                Some(u) => u.clone(),
                None => {
                    trace!(
                        "peer : {} doesn't have a url. so not connecting to it",
                        public_key.to_base58()
                    );
                    continue;
                }
            };

            if let PeerStatus::Disconnected(connect_time, period) = &mut peer.peer_status {
                if current_time < *connect_time {
                    continue;
                }

                info!(
                    "trying to connect to static peer : {:?} with {:?}",
                    public_key.to_base58(),
                    url
                );

                if let Err(err) = self.io_interface.connect_to_peer(url).await {
                    error!(
                        "failed connecting to static peer {:?}: {:?}",
                        public_key.to_base58(),
                        err
                    );
                }

                if *period < 10_000 {
                    *period *= 2;
                }

                *connect_time = current_time + *period;
            }
        }
    }

    pub async fn send_message(&self, public_key: SaitoPublicKey, message: Message) {
        let buffer = message.serialize();

        if let Err(err) = self
            .io_interface
            .send_message(public_key, buffer.as_slice())
            .await
        {
            error!(
                "failed sending message to peer {:?}: {:?}",
                public_key.to_base58(),
                err
            );
        }
    }

    pub async fn get_peer_key_list(
        &self,
        public_key: SaitoPublicKey,
    ) -> Option<Vec<SaitoPublicKey>> {
        let peers = self.peer_lock.read().await;
        if let Some(peer) = peers.peers.get(&public_key) {
            let mut keys = vec![peer.public_key];
            keys.extend(peer.key_list.clone());
            Some(keys)
        } else {
            None
        }
    }

    pub async fn handle_peer_disconnect(
        &mut self,
        public_key: SaitoPublicKey,
        disconnect_type: PeerDisconnectType,
    ) {
        info!(
            "handling peer disconnect, public_key = {}",
            public_key.to_base58()
        );

        if let PeerDisconnectType::ExternalDisconnect = disconnect_type {
            info!("peer disconnected externally, cleaning up locally created peer");

            if let Err(err) = self.cleanup_disconnected_peer(public_key).await {
                error!(
                    "failed local cleanup disconnect for peer {:?}: {:?}",
                    public_key.to_base58(),
                    err
                );
            }
        }

        let mut peers = self.peer_lock.write().await;
        if let Some(peer) = peers.peers.get_mut(&public_key) {
            self.io_interface
                .send_interface_event(InterfaceEvent::PeerConnectionDropped(peer.get_public_key()));

            peer.mark_as_disconnected(self.timer.get_timestamp_in_ms());
        } else {
            error!("unknown peer : {:?} disconnected", public_key.to_base58());
        }

        if let Some(peer_v2) = peers.get_peer_by_public_key_mut(&public_key) {
            peer_v2.on_disconnect(self.timer.get_timestamp_in_ms());
        }
    }

    pub async fn should_request_blockchain(
        &self,
        public_key: SaitoPublicKey,
        wallet_version: Version,
        core_version: Version,
    ) -> Option<bool> {
        let peers = self.peer_lock.read().await;

        if let Some(peer) = peers.peers.get(&public_key) {
            let should_request = wallet_version > peer.wallet_version
                || (wallet_version == peer.wallet_version && core_version > peer.core_version);

            Some(should_request)
        } else {
            None
        }
    }

    pub async fn disconnect_from_peer(
        &self,
        public_key: SaitoPublicKey,
        message: &str,
    ) -> Result<(), Error> {
        self.send_message(public_key, Message::Disconnect(message.to_string()))
            .await;

        self.io_interface
            .disconnect_from_peer(public_key)
            .await
            .inspect_err(|err| {
                error!(
                    "failed disconnecting from peer : {}. {}",
                    public_key.to_base58(),
                    err
                )
            })
    }

    pub async fn cleanup_disconnected_peer(&self, public_key: SaitoPublicKey) -> Result<(), Error> {
        self.io_interface
            .disconnect_from_peer(public_key)
            .await
            .inspect_err(|err| {
                error!(
                    "failed local cleanup disconnect for peer {:?}: {:?}",
                    public_key.to_base58(),
                    err
                )
            })
    }
}
