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
use crate::core::routing::peers::peer_service::PeerService;
use crate::core::routing::peers::peers::Peers;
use crate::core::routing::peers::peerv2::PeerV2;
use crate::core::util::configuration::Configuration;

const RECONNECTION_PERIOD: Timestamp = 5_000;

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
        let peers = self.peer_lock.read().await;

        let mut excluded_peers: Vec<SaitoPublicKey> = vec![];

        // --- exclude sender (preserve original behavior) ---
        if let Some(sender) = block.routed_from_peer {
            excluded_peers.push(sender);
        }

        // --- exclude disconnected / uninitialized peers ---
        for peer in peers.peers_v2.values() {
            let Some(pk) = peer.public_key else {
                continue;
            };

            if !peer.is_connected {
                excluded_peers.push(pk);
            }
        }

        drop(peers);

        // --- correct message type (post-refactor) ---
        let message = Message::BlockReference(block.hash, block.id);
        let serialized = message.serialize();

        let _ = self
            .io_interface
            .send_message_to_all(serialized.as_slice(), excluded_peers)
            .await;
    }

    pub async fn propagate_transaction(&self, transaction: &Transaction) {
        // --- STEP 1: read wallet (no write lock yet) ---
        let (wallet_public_key, wallet_private_key) = {
            let wallet = self.wallet_lock.read().await;
            (wallet.public_key, wallet.private_key)
        };

        // --- STEP 2: conditionally update wallet ---
        if transaction
            .from
            .first()
            .expect("from slip should exist")
            .public_key
            == wallet_public_key
        {
            if !matches!(transaction.transaction_type, TransactionType::GoldenTicket) {
                let mut wallet = self.wallet_lock.write().await;
                wallet.add_to_pending(transaction.clone());
            }
        }

        // --- STEP 3: lock peers ---
        let mut peers = self.peer_lock.write().await;

        for peer in peers.peers_v2.values_mut() {
            let Some(peer_public_key) = peer.public_key else {
                continue;
            };

            if !peer.is_connected {
                continue;
            }

            if transaction.is_in_path(&peer_public_key) {
                continue;
            }

            // --- update peer stats ---
            peer.transactions_sent += 1;
            peer.last_transaction_at = self.timer.get_timestamp_in_ms();

            // --- prepare transaction ---
            let mut tx = transaction.clone();
            tx.add_hop(&wallet_private_key, &wallet_public_key, &peer_public_key);

            let message = Message::Transaction(tx);
            let serialized = message.serialize();

            // --- send ---
            let _ = self
                .io_interface
                .send_message(peer_public_key, serialized.as_slice())
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
        &self,
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

            let wallet_version;
            let wallet_keylist;

            {
                let wallet = wallet_lock.read().await;
                wallet_version = wallet.wallet_version;
                wallet_keylist = wallet.key_list.to_vec();
            }

            if wallet_version < peer.wallet_version {
                self.io_interface
                    .send_interface_event(InterfaceEvent::NewVersionDetected(
                        public_key,
                        peer.wallet_version,
                    ));
            }

            let _ = self
                .io_interface
                .send_message_to_all(
                    Message::KeyList(wallet_keylist).serialize().as_slice(),
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

    pub async fn ping(&self) {
        let peers = self.peer_lock.read().await;

        let mut targets: Vec<SaitoPublicKey> = vec![];

        for peer in peers.peers_v2.values() {
            let Some(pk) = peer.public_key else {
                continue;
            };
            if !peer.is_connected {
                continue;
            }
            targets.push(pk);
        }

        drop(peers);

        let message = Message::Ping();
        let serialized = message.serialize();

        for pk in targets {
            let _ = self
                .io_interface
                .send_message(pk, serialized.as_slice())
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

    pub async fn send_key_list(&self, keys: Vec<SaitoPublicKey>) {
        let peers = self.peer_lock.read().await;

        let mut exclusions: Vec<SaitoPublicKey> = vec![];

        for peer in peers.peers_v2.values() {
            let Some(pk) = peer.public_key else {
                continue;
            };

            // exclude non-connected peers
            if !peer.is_connected {
                exclusions.push(pk);
            }
        }

        drop(peers);

        let message = Message::KeyList(keys);
        let serialized = message.serialize();

        let _ = self
            .io_interface
            .send_message_to_all(serialized.as_slice(), exclusions)
            .await;
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
        let mut peers = self.peer_lock.write().await;

        for peer in peers.peers_v2.values_mut() {
            let Some(url) = peer.url.clone() else {
                continue;
            };

            // Skip already connected or connecting peers
            if peer.is_connected || peer.is_connecting {
                continue;
            }

            // Basic backoff using last_activity_at
            if peer.last_activity_at + RECONNECTION_PERIOD > current_time {
                continue;
            }

            trace!(
                "attempting reconnection to peer {:?} at {}",
                peer.public_key
                    .map(|pk| pk.to_base58())
                    .unwrap_or("unknown".to_string()),
                url
            );

            peer.is_connecting = true;
            peer.last_activity_at = current_time;

            if let Err(err) = self.io_interface.connect_to_peer(url).await {
                error!("failed reconnecting to peer: {:?}", err);
                peer.is_connecting = false;
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

        if let Some(peer) = peers.get_peer_by_public_key(&public_key) {
            let mut keys = vec![public_key];
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

        //
        // instruction socket-layer to disconnect
        //
        if let PeerDisconnectType::ExternalDisconnect = disconnect_type {
            info!("peer disconnected externally, cleaning up locally created peer");

            self.io_interface
                .disconnect_from_peer(public_key)
                .await
                .inspect_err(|err| {
                    error!(
                        "failed local cleanup disconnect for peer {:?}: {:?}",
                        public_key.to_base58(),
                        err
                    )
                });
        }

        let mut peers = self.peer_lock.write().await;
        if let Some(peer_v2) = peers.get_peer_by_public_key_mut(&public_key) {
            self.io_interface
                .send_interface_event(InterfaceEvent::PeerConnectionDropped(public_key));
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

        if let Some(peer) = peers.get_peer_by_public_key(&public_key) {
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
}
