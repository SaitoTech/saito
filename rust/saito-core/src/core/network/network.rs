use log::{error, info, trace, warn};
use std::io::Error;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoPublicKey, Timestamp};
use crate::core::network::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::network::msg::block::BlockReference;
use crate::core::network::msg::message::Message;
use crate::core::network::msg::services::RequestServices;
use crate::core::network::peers::Peers;
use crate::core::process::keep_time::Timer;
use crate::core::util::configuration::Configuration;
use serde_json::json;

const RECONNECTION_PERIOD: Timestamp = 5_000;
const HANDSHAKE_TIMEOUT: Timestamp = 15_000; // 15 seconds
const PEER_STALE_PERIOD: Timestamp = 300_000; // see peers 6 minutes

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

        for peer in peers.peers.values() {
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
        let message = Message::BlockReference(BlockReference {
            block_hash: block.hash,
            block_id: block.id,
            timestamp: block.timestamp,
            transactions: block.transactions.len() as u32,
            has_golden_ticket: block.has_golden_ticket,
        });
        let serialized = message.serialize();
        let _ = self
            .io_interface
            .send_message_to_all(serialized.as_slice(), excluded_peers)
            .await;
    }

    pub async fn propagate_transaction(&self, transaction: &Transaction) {
        // --- STEP 1: read wallet ---
        let (wallet_public_key, wallet_private_key) = {
            let wallet = self.wallet_lock.read().await;
            (wallet.public_key, wallet.private_key)
        };

        // --- STEP 2: update wallet if needed ---
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

                self.io_interface
                    .send_interface_event(InterfaceEvent::OnTransactionPending())
            }
        }

        // --- STEP 3: collect send targets (NO AWAIT HERE) ---
        let targets: Vec<(SaitoPublicKey, Vec<u8>)> = {
            let mut peers = self.peer_lock.write().await;

            let mut out = Vec::new();

            for peer in peers.peers.values_mut() {
                let Some(peer_public_key) = peer.public_key else {
                    continue;
                };

                if !peer.is_connected {
                    continue;
                }

                if transaction.is_in_path(&peer_public_key) {
                    continue;
                }

                // update stats
                peer.transactions_sent += 1;
                peer.last_transaction_at = self.timer.get_timestamp_in_ms();

                // prepare tx
                let mut tx = transaction.clone();
                tx.add_hop(&wallet_private_key, &wallet_public_key, &peer_public_key);

                let message = Message::Transaction(tx);
                let serialized = message.serialize();

                out.push((peer_public_key, serialized));
            }

            out
        }; // LOCK DROPPED HERE

        let peer_send_count = targets.len();

        // --- STEP 4: send outside lock ---
        for (peer_public_key, buffer) in targets {
            let _ = self
                .io_interface
                .send_message(peer_public_key, buffer.as_slice())
                .await;
        }

        let sender = transaction
            .from
            .first()
            .map(|s| s.public_key.to_base58())
            .unwrap_or_default();
        let receiver = transaction
            .to
            .first()
            .map(|s| s.public_key.to_base58())
            .unwrap_or_default();
        let signature = transaction.signature.to_hex();

        let sent_payload = serde_json::to_string(&json!({
            "transaction_signature": signature,
            "signature": signature,
            "sender": sender,
            "receiver": receiver,
            "peer_send_count": peer_send_count,
        }))
        .unwrap_or_else(|_| "{}".to_string());

    }

    pub async fn cleanup_peers(&self, current_time: Timestamp) {
        // STEP 1: collect stale peer IDs
        let stale_peer_ids: Vec<u64> = {
            let peers = self.peer_lock.read().await;

            peers
                .peers
                .values()
                .filter(|peer| {
                    peer.disconnect_on_stale
                        && peer.is_connected
                        && peer.last_message_at + PEER_STALE_PERIOD < current_time
                })
                .map(|peer| peer.id)
                .collect()
        };

        // STEP 2: disconnect outside lock
        for peer_id in &stale_peer_ids {
            let _ = self.io_interface.disconnect_from_peer(*peer_id).await;
        }

        // STEP 3: apply state changes
        let mut peers = self.peer_lock.write().await;

        for peer_id in stale_peer_ids {
            if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                peer.on_disconnect(current_time);
            }
        }

        peers.remove_disconnected_peers(current_time);
    }

    pub async fn set_peer_key_list(&self, peer_id: u64, key_list: Vec<SaitoPublicKey>) {
        let mut peers = self.peer_lock.write().await;
        if let Err(e) = peers.set_peer_key_list(peer_id, key_list).await {
            error!("Received key list error: {:?}", e);
        }
    }

    pub async fn add_stun_peer(
        &self,
        peer_id: u64,
        public_key: SaitoPublicKey,
        timestamp: Timestamp,
    ) {
        let mut peers = self.peer_lock.write().await;
        peers
            .add_stun_peer(peer_id, public_key, timestamp, &self.io_interface)
            .await;
    }

    pub async fn remove_stun_peer(&self, peer_id: u64, public_key: SaitoPublicKey) {
        let mut peers = self.peer_lock.write().await;
        peers
            .remove_stun_peer(peer_id, public_key, &self.io_interface)
            .await;
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

        info!(
            "[SAITO PEERS] network.initialize outbound peer_urls count={}",
            peer_urls.len()
        );
        for peer_url in peer_urls {
            info!(
                "[SAITO PEERS] network.initialize connect_to_peer url_len={}",
                peer_url.len()
            );
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

        for peer in peers.peers.values() {
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

        for peer in peers.peers.values() {
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
        // store peer_ids to avoid holding lock
        //
        let mut request_services_for: Vec<u64> = vec![];
        let mut work_done = false;

        //
        // PASS 1: monitor / mutate peer lifecycle state
        //
        {
            let mut peers = self.peer_lock.write().await;

            for peer in peers.peers.values_mut() {
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
        // IDENTIFY PEERS for reconnection
        //
        {
            let reconnect_targets = {
                let peers = self.peer_lock.read().await;

                peers
                    .peers
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
        // REMOVE STALE PEERS
        //
        self.cleanup_peers(current_time).await;

        //
        // REQUEST SERVICES (non-locking from queued peers)
        //
        for peer_id in request_services_for {
            self.send_message_by_peer_id(peer_id, Message::RequestServices(RequestServices {}))
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
        if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
            if let Some(public_key) = peer.public_key {
                self.io_interface
                    .send_interface_event(InterfaceEvent::PeerConnectionDropped(
                        peer_id, public_key,
                    ));
            }
            peer.on_disconnect(self.timer.get_timestamp_in_ms());
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
