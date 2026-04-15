use log::{error, info, trace, warn};
use std::io::Error;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::network::interface_io::InterfaceEvent;
use crate::core::network::interface_io::InterfaceIO;
use crate::core::network::msg::chainsync::RequestChainSync;
use crate::core::network::msg::message::Message;
use crate::core::network::msg::services::RequestServices;
use crate::core::network::peer::Peer;
use crate::core::network::peers::Peers;
use crate::core::network::service::Service;
use crate::core::process::keep_time::Timer;
use crate::core::process::version::Version;
use crate::core::util::configuration::Configuration;

const RECONNECTION_PERIOD: Timestamp = 5_000;
const HANDSHAKE_TIMEOUT: Timestamp = 15_000; // 15 seconds

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
        let mut excluded_peers: Vec<u64> = vec![];

        for peer in peers.peers_v2.values() {
            if peer.id == block.routed_from_peer_id {
                excluded_peers.push(peer.id);
            } else {
                if !peer.is_connected {
                    excluded_peers.push(peer.id);
                }
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

    pub async fn cleanup_peers(&self, current_time: Timestamp) {
        let mut peers = self.peer_lock.write().await;

        peers
            .disconnect_stale_peers(current_time, self.io_interface.as_ref())
            .await;

        peers.remove_disconnected_peers(current_time);
    }

    pub async fn set_peer_key_list(&self, peer_id: u64, key_list: Vec<SaitoPublicKey>) {
        let mut peers = self.peer_lock.write().await;
        if let Err(e) = peers.set_peer_key_list(peer_id, key_list).await {
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

    pub async fn initialize(&mut self, configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>) {
        let peer_urls = {
            let configs = configs_lock.read().await;
            configs
                .get_peer_configs()
                .iter()
                .map(|peer| peer.get_url())
                .collect::<Vec<_>>()
        };

        for peer_url in peer_urls {
            self.connect_to_peer(peer_url).await;
        }
    }

    pub async fn connect_to_peer(&mut self, peer_url: String) {
        if let Err(err) = self.io_interface.connect_to_peer(peer_url.clone()).await {
            error!(
                "failed connecting to configured peer {:?}: {:?}",
                peer_url, err
            );
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

    pub async fn send_key_list(&self, keys: Vec<SaitoPublicKey>) {
        let peers = self.peer_lock.read().await;

        let mut excluded_peers: Vec<u64> = vec![];

        for peer in peers.peers_v2.values() {
            if !peer.is_connected {
                excluded_peers.push(peer.id);
            }
        }

        drop(peers);

        let message = Message::KeyList(keys);
        let serialized = message.serialize();

        let _ = self
            .io_interface
            .send_message_to_all(serialized.as_slice(), excluded_peers)
            .await;
    }

    pub async fn monitor_peers(&mut self, current_time: Timestamp) -> bool {
        //
        // in order to avoid .await while holding the peer lock, we collect
        // references for the peer_ids that we want to send, and send at the
        // end once we have iterated through all of the peers.
        //
        let mut request_services_for: Vec<u64> = vec![];
        let mut request_sync_for: Vec<u64> = vec![];

        let mut work_done = false;

        //
        // PASS 1: monitor / mutate peer lifecycle state
        //
        {
            let mut peers = self.peer_lock.write().await;

            for peer in peers.peers_v2.values_mut() {
                //
                // STUCK HANDSHAKE DETECTION
                //
                if peer.is_connected && !peer.is_verified {
                    if peer.last_activity_at + HANDSHAKE_TIMEOUT < current_time {
                        warn!("Peer stuck in handshake, resetting");
                        peer.on_disconnect(current_time);
                        work_done = true;
                        continue;
                    }
                }

                //
                // NO PEER SERVICES
                //
                if !peer.is_services_fetching && !peer.is_services_fetched && peer.is_connected {
                    peer.is_services_fetching = true;
                    request_services_for.push(peer.id);
                    work_done = true;
                }

                //
                // SYNCING
                //
                if peer.is_connected && !peer.is_syncing && !peer.is_synced {
                    peer.is_syncing = true;
                    request_sync_for.push(peer.id);
                    work_done = true;
                }

                //
                // NEXT SKIP ACTIVE CONNECTIONS
                //
                if peer.is_connected || peer.is_connecting {
                    continue;
                }

                //
                // ALL THAT IS LEFT ARE PROBLEMATIC / DISCONNECTS / RECONNECTS NEEDED
                //
                if peer.last_activity_at + RECONNECTION_PERIOD > current_time {
                    continue;
                }

                let Some(url) = peer.url.clone() else {
                    continue;
                };

                trace!(
                    "attempting reconnection to peer {:?} at {}",
                    peer.public_key
                        .map(|pk| pk.to_base58())
                        .unwrap_or("unknown".to_string()),
                    url
                );

                peer.is_connecting = true;
                peer.last_activity_at = current_time;
                work_done = true;
            }
        }

        //
        // PASS 2: execute reconnects outside lock
        //
        {
            let reconnect_targets = {
                let peers = self.peer_lock.read().await;

                peers
                    .peers_v2
                    .values()
                    .filter(|peer| {
                        peer.is_connecting
                            && !peer.is_connected
                            && peer.last_activity_at == current_time
                    })
                    .filter_map(|peer| peer.url.clone())
                    .collect::<Vec<_>>()
            };

            for url in reconnect_targets {
                if let Err(err) = self.io_interface.connect_to_peer(url.clone()).await {
                    error!("failed reconnecting to peer {}: {:?}", url, err);
                }
            }
        }

        //
        // PASS 3: cleanup stale/disconnected peers
        //
        self.cleanup_peers(current_time).await;

        //
        // send
        //
        for peer_id in request_services_for {
            self.send_message_by_peer_id(peer_id, Message::RequestServices(RequestServices {}))
                .await;
        }

        //
        // sync
        //
        for peer_id in request_sync_for {
            self.send_message_by_peer_id(
                peer_id,
                Message::RequestChainSync(RequestChainSync {
                    latest_block_id: 0,
                    latest_block_hash: [0; 32],
                }),
            )
            .await;
        }

        work_done
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

    pub async fn send_message_by_peer_id(&self, peer_id: u64, message: Message) {
        let buffer = message.serialize();

        if let Err(err) = self
            .io_interface
            .send_message_by_peer_id(peer_id, buffer.as_slice())
            .await
        {
            log::warn!("failed to send message to peer_id {}: {:?}", peer_id, err);
        }
    }

    pub async fn handle_peer_disconnect(
        &mut self,
        peer_id: u64,
        disconnect_type: PeerDisconnectType,
    ) {
        info!("handling peer disconnect, peer_id = {}", peer_id);

        //
        // instruction socket-layer to disconnect
        //
        if let PeerDisconnectType::ExternalDisconnect = disconnect_type {
            let _ = self
                .io_interface
                .disconnect_from_peer(peer_id)
                .await
                .inspect_err(|err| {
                    error!(
                        "failed local cleanup disconnect for peer {:?}: {:?}",
                        peer_id, err
                    )
                });
        }

        let mut peers = self.peer_lock.write().await;
        if let Some(peer_v2) = peers.get_peer_by_id_mut(peer_id) {
            let public_key = peer_v2.get_public_key();
            self.io_interface
                .send_interface_event(InterfaceEvent::PeerConnectionDropped(public_key));
            peer_v2.on_disconnect(self.timer.get_timestamp_in_ms());
        }
    }

    pub async fn should_request_blockchain(
        &self,
        peer_id: u64,
        wallet_version: Version,
        core_version: Version,
    ) -> Option<bool> {
        let peers = self.peer_lock.read().await;

        if let Some(peer) = peers.get_peer_by_id(peer_id) {
            let should_request = wallet_version > peer.wallet_version
                || (wallet_version == peer.wallet_version && core_version > peer.core_version);
            Some(should_request)
        } else {
            None
        }
    }

    pub async fn disconnect_from_peer(&self, peer_id: u64, message: &str) -> Result<(), Error> {
        self.send_message_by_peer_id(peer_id, Message::Disconnect(message.to_string()))
            .await;

        self.io_interface
            .disconnect_from_peer(peer_id)
            .await
            .inspect_err(|err| error!("failed disconnecting from peer : {}. {}", peer_id, err))
    }
}
