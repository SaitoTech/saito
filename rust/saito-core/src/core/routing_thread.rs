use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::transaction::Transaction;
use crate::core::consensus::wallet::Wallet;
use crate::core::consensus_thread::ConsensusEvent;
use crate::core::defs::{
    BlockHash, BlockId, PrintForLog, SaitoPublicKey, Timestamp, CHANNEL_SAFE_BUFFER,
};
use crate::core::mining_thread::MiningEvent;
use crate::core::network::events::NetworkEvent;
use crate::core::network::gatekeeper::AccessRecord;
use crate::core::network::gatekeeper::Gatekeeper;
use crate::core::network::interface_io::InterfaceEvent;
use crate::core::network::msg::block::BlockReference;
use crate::core::network::msg::blockchain::MAX_BLOCKCHAIN_CHUNK;
use crate::core::network::msg::handshake::{Handshake, RequestHandshake};
use crate::core::network::msg::message::Message;
use crate::core::network::msg::services::RequestServices;
use crate::core::network::msg::services::Services;
use crate::core::network::network::Network;
use crate::core::network::sync::{FetchDispatcher, SyncManager};
use crate::core::process::keep_time::Timer;
use crate::core::process::process_event::ProcessEvent;
use crate::core::storage::storage::Storage;
use crate::core::util::config_manager::ConfigManager;
use crate::core::util::configuration::Configuration;
use crate::core::util::crypto::hash;
use crate::core::util::crypto::{generate_random_bytes, sign, verify};
use crate::core::verification_thread::VerifyRequest;
use async_trait::async_trait;
use log::{debug, error, info, warn};
use std::cmp::max;
use std::ops::Deref;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

const RECONNECTION_PERIOD: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;
const GATEKEEPER_MONITOR_PERIOD: Timestamp = Duration::from_secs(30).as_millis() as Timestamp;

#[derive(Debug)]
pub enum RoutingEvent {
    OnAddBlockSuccess(BlockHash),
    MissingBlock(u64, BlockHash, BlockId),
    BlockchainRequest(u64),
    KeyListUpdated(Vec<SaitoPublicKey>),
}

/// Manages peers and routes messages to correct controller
///
///
/// There are three primary types of messages and events that are produced
/// and processed by this thread:
///
/// * peer messages --> process_peer_message()
/// * system events --> process_network_event()
/// * system events --> process_timer_event()
/// * system events --> process_event()
///
/// Peer Messages are initiated by other nodes on the network and communicated
/// to a node through the network socket. System events are broadcast by other
/// threads or components in the Saito software stack (JS, WASM, Rust). And
/// timer actions are triggered by the passage of time but not specific messages
/// or events.
///
pub struct RoutingThread {
    pub blockchain_lock: Arc<RwLock<Blockchain>>,
    pub mempool_lock: Arc<RwLock<Mempool>>,
    pub sender_to_consensus: Sender<ConsensusEvent>,
    pub sender_to_miner: Sender<MiningEvent>,
    pub config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    pub timer: Timer,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub network: Network,
    pub storage: Storage,
    pub reconnection_timer: Timestamp,
    pub peer_removal_timer: Timestamp,
    pub congestion_check_timer: Timestamp,
    pub gatekeeper_monitor_timer: Timestamp,
    pub message_sending_timer: Timestamp,
    pub last_emitted_block_fetch_count: BlockId,
    pub senders_to_verification: Vec<Sender<VerifyRequest>>,
    pub last_verification_thread_index: usize,
    pub sync: Arc<RwLock<SyncManager>>,
    pub gatekeeper: Gatekeeper,
    pub fetch_dispatcher: FetchDispatcher,
}

impl RoutingThread {
    ///
    ///
    /// # Arguments
    ///
    /// * `public_key`:
    /// * `message`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    ///
    /// Note that message names follow a distinct format. If the message is a request for
    /// data or an object, the name of the message is Message::Request[Object]. If the
    /// message name is Message::[Object] it is the provision of that information by the
    /// peer. Thus "KeyList" sends the latest KeyList. We do not need KeyListUpdate, etc.
    ///
    async fn process_peer_message(&mut self, peer_id: u64, message: Message) {
        //
        // this will update our gatekeeper (buffer) which will periodically sweep the information
        // back into the peer, allowing rapid responses to messages without the need to unlock
        // the peers simply to update network-access statistics.
        //
        self.gatekeeper.add_record(
            peer_id,
            &message,
            AccessRecord::MessageReceived,
            self.timer.get_timestamp_in_ms(),
        );

        match message {
            Message::RequestHandshake(_challenge) => {
                info!("HANDSHAKE REQUEST: received handshake request...");
                self.process_request_handshake_message(peer_id, _challenge)
                    .await;
            }
            Message::Handshake(response) => {
                info!("HANDSHAKE RESPONSE: received handshake response...");
                self.process_handshake_message(peer_id, response).await;
            }
            Message::Block(_) => {
                // ...
            }
            Message::Transaction(transaction) => {
                self.process_transaction_message(peer_id, transaction).await;
            }
            Message::RequestBlockchain(ref request) => {
                info!("BLOCKCHAIN REQUEST: received blockchain request...");
                info!(" -- peer_id => {}", peer_id);
                info!(
                    " -- latest_known_block_id => {}",
                    request.latest_known_block_id
                );
                info!(
                    " -- latest_known_block_hash => {}",
                    request.latest_known_block_hash.to_hex()
                );
                info!(" -- fork_id => {}", request.fork_id.to_hex());
                info!(" -- sync_type => {}", request.sync_type);
                info!(" -- public_key => {}", request.public_key.to_base58());
                info!(" -- keylist_len => {}", request.keylist.len());
                for (i, key) in request.keylist.iter().enumerate() {
                    info!(" -- keylist[{}] => {}", i, key.to_base58());
                }

                if !self.gatekeeper.add_costly_record(
                    peer_id,
                    &message,
                    AccessRecord::RequestBlockchainMessageReceived,
                    self.timer.get_timestamp_in_ms(),
                ) {
                    return;
                }

                let sync = self.sync.read().await;
                if let Err(e) = sync
                    .process_request_blockchain_message(request.clone(), peer_id, &self.network)
                    .await
                {
                    error!("process_request_blockchain_message error: {:?}", e);
                }
            }
            Message::Blockchain(chaindata) => {
                let chunk_len = chaindata.payload.len();
                let has_more = chaindata.payload_latest_block_id < chaindata.latest_known_block_id;
                let target_block_id = chaindata.latest_known_block_id;
                let shared_ancestor_block_id = chaindata.shared_ancestor_block_id;
                let shared_ancestor_block_hash = chaindata.shared_ancestor_block_hash;
                let latest_known_block_id = {
                    let blockchain = self.blockchain_lock.read().await;
                    blockchain.get_latest_block_id()
                };

                info!("BLOCKCHAIN RESPONSE: received blockchain response...");
                info!(" -- blocks => {}", chunk_len);

                {
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                        peer.on_sync_chunk_received(chunk_len, has_more);
                    }
                }
                let mut sync = self.sync.write().await;
                if let Err(e) = sync
                    .process_blockchain_message(
                        chaindata,
                        peer_id,
                        self.config_lock.clone(),
                        &self.network,
                        &self.fetch_dispatcher,
                    )
                    .await
                {
                    error!(
                        "failed processing Blockchain Peer Message {}: {}",
                        peer_id, e
                    );
                } else {
                    drop(sync);
                    let current_block_id = {
                        let blockchain = self.blockchain_lock.read().await;
                        blockchain.get_latest_block_id()
                    };
                    let is_sync_possible =
                        shared_ancestor_block_id != 0 && shared_ancestor_block_hash != [0; 32];
                    self.network.io_interface.send_interface_event(
                        InterfaceEvent::OnBlockchainReceived {
                            current_block_id,
                            target_block_id,
                            is_sync_possible,
                            shared_ancestor_block_id,
                            shared_ancestor_block_hash,
                            latest_known_block_id,
                        },
                    );
                }
            }
            Message::BlockReference(block_reference) => {
                self.process_block_reference_message(peer_id, block_reference)
                    .await;
            }
            Message::RequestBlockReference(_) => {}
            Message::Ping() => {
                self.network
                    .send_message_by_peer_id(peer_id, Message::Pong())
                    .await;
            }
            Message::Pong() => {
                //
                // update peer last_message_at immediately
                //
                let now = self.timer.get_timestamp_in_ms();
                let mut peers = self.network.peer_lock.write().await;
                if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                    peer.last_message_at = now;
                    peer.last_activity_at = now;
                }
            }
            Message::Services(data) => {
                let mut emit_key: Option<SaitoPublicKey> = None;
                {
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                        peer.services = data.services;
                        peer.is_services_fetching = false;
                        peer.is_services_fetched = true;
                        emit_key = peer.public_key;
                    }
                }
                if let Some(public_key) = emit_key {
                    self.network.io_interface.send_interface_event(
                        InterfaceEvent::OnPeerServicesUp(peer_id, public_key),
                    );
                }
            }
            Message::RequestServices(_) => {
                let services = self.network.io_interface.get_my_services();
                self.network
                    .send_message_by_peer_id(peer_id, Message::Services(Services { services }))
                    .await;
            }
            Message::RequestEndpoint(_) => {
                let config = self.config_lock.read().await;
                if let Some(server) = config.get_server_configs() {
                    self.network
                        .send_message_by_peer_id(
                            peer_id,
                            Message::Endpoint(server.endpoint.clone()),
                        )
                        .await;
                }
            }
            Message::Endpoint(endpoint) => {
                let mut peers = self.network.peer_lock.write().await;
                if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                    peer.endpoint = endpoint;
                }
            }

            Message::RequestGenesisBlockReference() => {
                self.process_request_genesis_block_reference_message(peer_id)
                    .await;
            }
            Message::GenesisBlockReference(block_reference) => {
                self.process_genesis_block_reference_message(peer_id, block_reference)
                    .await;
            }
            Message::ApplicationMessage(api_message) => {
                let public_key = {
                    let peers = self.network.peer_lock.read().await;
                    peers.get_peer_by_id(peer_id).and_then(|p| p.public_key)
                };
                if let Some(public_key) = public_key {
                    self.network
                        .io_interface
                        .process_api_call(api_message.data, api_message.msg_index, public_key)
                        .await;
                } else {
                    warn!("dropping transaction from unidentified peer_id {}", peer_id);
                }
            }
            Message::Result(api_message) => {
                let public_key = {
                    let peers = self.network.peer_lock.read().await;
                    peers.get_peer_by_id(peer_id).and_then(|p| p.public_key)
                };
                if let Some(public_key) = public_key {
                    self.network
                        .io_interface
                        .process_api_success(api_message.data, api_message.msg_index, public_key)
                        .await;
                } else {
                    warn!("dropping transaction from unidentified peer_id {}", peer_id);
                }
            }
            Message::Error(api_message) => {
                let public_key = {
                    let peers = self.network.peer_lock.read().await;
                    peers.get_peer_by_id(peer_id).and_then(|p| p.public_key)
                };
                if let Some(public_key) = public_key {
                    self.network
                        .io_interface
                        .process_api_error(api_message.data, api_message.msg_index, public_key)
                        .await;
                } else {
                    warn!("dropping transaction from unidentified peer_id {}", peer_id);
                }
            }
            Message::KeyList(key_list) => {
                self.network.set_peer_key_list(peer_id, key_list).await;
            }
            Message::Disconnect(message) => {
                warn!(
                    "Received disconnection message: {:?}. from peer : {}",
                    message, peer_id
                );
            }
        }
    }

    pub async fn process_peer_buffer(&mut self, peer_id: u64, buffer: Vec<u8>) {
        // Step 1: deserialize buffer → Message
        let message = match Message::deserialize(buffer) {
            Ok(msg) => msg,
            Err(err) => {
                log::warn!(
                    "failed to deserialize message from peer {}: {:?}",
                    peer_id,
                    err
                );
                return;
            }
        };

        // Step 2: forward into normal message handling
        self.process_peer_message(peer_id, message).await;
    }

    //
    // support functions that execute peer messages that require more complicated
    // logic or execution across multiple threads or system components.
    //
    async fn process_transaction_message(&mut self, peer_id: u64, mut transaction: Transaction) {
        transaction.routed_from_peer_id = peer_id;
        self.send_to_verification_thread(VerifyRequest::Transaction(transaction))
            .await;
    }

    async fn process_block_reference_message(
        &mut self,
        peer_id: u64,
        block_reference: BlockReference,
    ) {
        //
        // sync from peer if needed
        //
        {
            let mut peers = self.network.peer_lock.write().await;
            let peer = peers.get_peer_by_id_mut(peer_id).unwrap();

            if peer.is_syncing {
                return;
            }

            if !peer.is_synced {
                peer.is_syncing = true;
                drop(peers);

                let sync = self.sync.read().await;
                sync.send_request_blockchain_message(
                    peer_id,
                    self.config_lock.clone(),
                    &self.network,
                )
                .await;

                return;
            }
        }

        //
        // otherwise, should we queue for download?
        //
        if self
            .should_dispatch_block_reference_from_peer_to_sync_manager(peer_id, &block_reference)
            .await
        {
            let mut sync = self.sync.write().await;
            if sync.add(&self.network, block_reference, peer_id).await {
                sync.fetch(&self.network, &self.fetch_dispatcher).await;
            }
        }
    }

    //
    // this is called when we receive references to individual blocks as opposed to
    // chain-sync requests. It checks whether the request fits the criteria for
    // getting sent to the block sync queue.
    //
    async fn should_dispatch_block_reference_from_peer_to_sync_manager(
        &self,
        peer_id: u64,
        block_reference: &BlockReference,
    ) -> bool {
        let block_id = block_reference.block_id;
        let block_hash = block_reference.block_hash;

        let active_chain_sync = {
            let peers = self.network.peer_lock.read().await;
            if peers.get_peer_by_id(peer_id).is_none() {
                return false;
            }
            peers.peers.values().any(|p| p.is_connected && p.is_syncing)
        };

        let blockchain = self.blockchain_lock.read().await;
        if blockchain.is_block_indexed(block_hash) {
            return false;
        }
        if active_chain_sync
            && block_id
                > blockchain
                    .get_latest_block_id()
                    .saturating_add(MAX_BLOCKCHAIN_CHUNK as BlockId)
        {
            return false;
        }
        if !blockchain.blocks.is_empty() && blockchain.lowest_acceptable_block_id >= block_id {
            return false;
        }
        if block_id < max(1, blockchain.genesis_block_id) {
            return false;
        }
        drop(blockchain);

        let mempool = self.mempool_lock.read().await;
        if mempool.blocks_queue.iter().any(|b| b.hash == block_hash) {
            return false;
        }

        true
    }
    async fn process_request_handshake_message(&mut self, peer_id: u64, request: RequestHandshake) {
        let (public_key, private_key) = {
            let wallet = self.wallet_lock.read().await;
            (wallet.public_key, wallet.private_key)
        };

        let counter_nonce = {
            let mut peers = self.network.peer_lock.write().await;

            let Some(peer) = peers.get_peer_by_id_mut(peer_id) else {
                warn!(
                    "process_request_handshake_message: unknown peer_id {}",
                    peer_id
                );
                return;
            };

            if peer.is_verified {
                [0; 32]
            } else {
                let random_bytes: Vec<u8> = generate_random_bytes(32).await;
                let nonce = hash(random_bytes.as_slice());
                peer.handshake_nonce = Some(nonce);
                nonce
            }
        };

        self.network
            .send_message_by_peer_id(
                peer_id,
                Message::Handshake(Handshake {
                    public_key,
                    signature: sign(&request.nonce, &private_key),
                    counter_nonce,
                }),
            )
            .await;
    }

    async fn process_handshake_message(&mut self, peer_id: u64, handshake: Handshake) {
        let had_pending_nonce;
        let counter_nonce = handshake.counter_nonce;

        {
            let mut peers = self.network.peer_lock.write().await;

            let Some(peer) = peers.get_peer_by_id_mut(peer_id) else {
                warn!("process_handshake_message: unknown peer_id {}", peer_id);
                return;
            };

            let Some(expected_nonce) = peer.handshake_nonce else {
                warn!(
                    "process_handshake_message: peer {} sent unsolicited handshake",
                    peer_id
                );
                return;
            };

            had_pending_nonce = true;

            if !verify(&expected_nonce, &handshake.signature, &handshake.public_key) {
                warn!(
                    "process_handshake_message: invalid signature from peer_id {}",
                    peer_id
                );
                return;
            }

            peer.on_handshake_complete(handshake.public_key, self.timer.get_timestamp_in_ms());
            self.network.io_interface.send_interface_event(
                InterfaceEvent::OnPeerHandshakeComplete(peer_id, handshake.public_key),
            );
        }

        if had_pending_nonce && counter_nonce != [0; 32] {
            let (public_key, private_key) = {
                let wallet = self.wallet_lock.read().await;
                (wallet.public_key, wallet.private_key)
            };

            self.network
                .send_message_by_peer_id(
                    peer_id,
                    Message::Handshake(Handshake {
                        public_key,
                        signature: sign(&counter_nonce, &private_key),
                        counter_nonce: [0; 32],
                    }),
                )
                .await;
        }
    }

    async fn process_request_genesis_block_reference_message(&mut self, peer_id: u64) {
        let blockchain = self.blockchain_lock.read().await;

        if blockchain.genesis_block_id != 0 {
            if let Some(genesis_block_hash) = blockchain
                .blockring
                .get_longest_chain_block_hash_at_block_id(blockchain.genesis_block_id)
            {
                let (timestamp, transactions, has_golden_ticket) =
                    if let Some(genesis_block) = blockchain.get_block(&genesis_block_hash) {
                        (
                            genesis_block.timestamp,
                            genesis_block.transactions.len() as u32,
                            genesis_block.has_golden_ticket,
                        )
                    } else {
                        (0, 0, false)
                    };

                self.network
                    .send_message_by_peer_id(
                        peer_id,
                        Message::GenesisBlockReference(
                            //
                            // timestamp , transactions, has_golden_ticket placeholders
                            //
                            BlockReference {
                                block_id: blockchain.genesis_block_id,
                                block_hash: genesis_block_hash,
                                timestamp,
                                transactions,
                                has_golden_ticket,
                            },
                        ),
                    )
                    .await;
            }
        } else {
            warn!(
                "We don't have a genesis block id set to alert the peer : {:?}",
                peer_id
            );
        }
    }

    async fn process_genesis_block_reference_message(
        &mut self,
        peer_id: u64,
        block_reference: BlockReference,
    ) {
        if self
            .should_dispatch_block_reference_from_peer_to_sync_manager(peer_id, &block_reference)
            .await
        {
            let mut sync = self.sync.write().await;
            if sync.add(&self.network, block_reference, peer_id).await {
                sync.fetch(&self.network, &self.fetch_dispatcher).await;
            }
        }
    }

    pub async fn process_key_list_updated_event(&mut self, key_list: Vec<SaitoPublicKey>) {
        let changed = {
            let mut wallet = self.wallet_lock.write().await;
            wallet.set_key_list(key_list)
        };
        if changed {
            let wallet = self.wallet_lock.read().await;
            self.network.send_key_list(wallet.key_list.clone()).await;
        }
    }

    pub async fn send_to_verification_thread(&mut self, request: VerifyRequest) {
        let sender_count = self.senders_to_verification.len();

        if sender_count == 0 {
            error!("no verification-thread senders configured; dropping request");
            return;
        }

        self.last_verification_thread_index = self.last_verification_thread_index.saturating_add(1);

        let sender_index = self.last_verification_thread_index % sender_count;

        let Some(sender) = self.senders_to_verification.get(sender_index) else {
            return;
        };

        if let Err(err) = sender.send(request).await {
            error!(
                "failed sending request to verification thread {}: {:?}",
                sender_index, err
            );
        }
    }

    async fn process_message_sending_timer_event(&mut self, duration_value: Timestamp) -> bool {
        const MESSAGES_SENDING_PERIOD: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;
        self.message_sending_timer = self.message_sending_timer.saturating_add(duration_value);
        if self.message_sending_timer >= MESSAGES_SENDING_PERIOD {
            self.message_sending_timer %= MESSAGES_SENDING_PERIOD;
        }
        false
    }
}

#[async_trait]
impl ProcessEvent<RoutingEvent> for RoutingThread {
    async fn process_network_event(&mut self, event: NetworkEvent) -> Option<()> {
        match event {
            NetworkEvent::PeerBufferReceived { peer_id, buffer } => {
                self.process_peer_buffer(peer_id, buffer).await;
                return Some(());
            }
            NetworkEvent::PeerConnectionResult {
                peer_id,
                initiate_handshake,
            } => {
                let mut send_handshake = None;
                let mut should_request_sync = false;

                {
                    let mut peers = self.network.peer_lock.write().await;

                    let Some(peer) = peers.get_peer_by_id_mut(peer_id) else {
                        warn!("PeerConnectionResult: unknown peer_id {}", peer_id);
                        return None;
                    };

                    peer.on_connect(self.timer.get_timestamp_in_ms());
                    peer.disconnect_on_stale = !initiate_handshake;

                    if initiate_handshake {
                        let nonce = hash(&generate_random_bytes(32).await);
                        peer.handshake_nonce = Some(nonce);
                        send_handshake =
                            Some(Message::RequestHandshake(RequestHandshake { nonce }));

                        if !peer.is_syncing && !peer.is_synced {
                            peer.is_syncing = true;
                            should_request_sync = true;
                        }
                    }
                }

                if let Some(msg) = send_handshake {
                    self.network.send_message_by_peer_id(peer_id, msg).await;
                }

                self.network
                    .send_message_by_peer_id(peer_id, Message::RequestServices(RequestServices {}))
                    .await;

                //
                // share endpoint
                //
                {
                    let config = self.config_lock.read().await;
                    if let Some(server) = config.get_server_configs() {
                        self.network
                            .send_message_by_peer_id(
                                peer_id,
                                Message::Endpoint(server.endpoint.clone()),
                            )
                            .await;
                    }
                }

                self.network
                    .send_message_by_peer_id(peer_id, Message::RequestServices(RequestServices {}))
                    .await;

                if should_request_sync {
                    let sync = self.sync.read().await;
                    sync.send_request_blockchain_message(
                        peer_id,
                        self.config_lock.clone(),
                        &self.network,
                    )
                    .await;
                }

                return Some(());
            }
            NetworkEvent::AddStunPeer {
                peer_id,
                public_key,
            } => {
                self.network
                    .add_stun_peer(peer_id, public_key, self.timer.get_timestamp_in_ms())
                    .await;
                return Some(());
            }
            NetworkEvent::RemoveStunPeer {
                peer_id,
                public_key,
            } => {
                self.network.remove_stun_peer(peer_id, public_key).await;
                return Some(());
            }
            NetworkEvent::PeerDisconnected {
                peer_id,
                disconnect_type,
            } => {
                self.network
                    .handle_peer_disconnect(peer_id, disconnect_type)
                    .await;
                return Some(());
            }
            NetworkEvent::BlockFetched {
                block_hash,
                block_id,
                peer_id,
                buffer,
            } => {
                debug!("block received : {:?}", block_hash.to_hex());

                self.send_to_verification_thread(VerifyRequest::Block(
                    buffer, peer_id, block_hash, block_id,
                ))
                .await;

                let mut sync = self.sync.write().await;
                sync.remove(block_hash);

                return Some(());
            }
            NetworkEvent::BlockFetchFailed {
                block_hash,
                peer_id,
                block_id,
            } => {
                let time = self.timer.get_timestamp_in_ms();

                let mut sync = self.sync.write().await;
                sync.on_fetch_fail(block_id, block_hash, peer_id, time);
            }
            _ => unreachable!(),
        }
        // debug!("network event processed");
        None
    }

    async fn process_timer_event(&mut self, duration: Duration) -> Option<()> {
        let duration_value: Timestamp = duration.as_millis() as Timestamp;
        let mut work_done = false;

        let current_time = self.timer.get_timestamp_in_ms();

        self.gatekeeper_monitor_timer =
            self.gatekeeper_monitor_timer.saturating_add(duration_value);

        if self.gatekeeper_monitor_timer >= GATEKEEPER_MONITOR_PERIOD {
            let mut peers = self.network.peer_lock.write().await;
            self.gatekeeper.monitor_peers(&mut peers, current_time);
            self.gatekeeper_monitor_timer %= GATEKEEPER_MONITOR_PERIOD;
            work_done = true;
        }

        work_done |= self.network.monitor_peers(current_time).await;

        work_done |= self
            .process_message_sending_timer_event(duration_value)
            .await;

        if work_done {
            return Some(());
        }

        None
    }

    async fn process_event(&mut self, event: RoutingEvent) -> Option<()> {
        match event {
            RoutingEvent::OnAddBlockSuccess(block_hash) => {
                let mut sync = self.sync.write().await;
                sync.remove(block_hash);
                sync.fetch(&self.network, &self.fetch_dispatcher).await;

                if sync.queue.is_empty() {
                    let is_latest_block = {
                        let blockchain = self.blockchain_lock.read().await;
                        blockchain.get_latest_block_hash() == block_hash
                    };
                    if !is_latest_block {
                        return None;
                    }
                    sync.advance_chain_sync_if_ready(&self.network, self.config_lock.clone())
                        .await;
                }
            }
            RoutingEvent::MissingBlock(peer_id, block_hash, block_id) => {
                //
                // do not fetch missing blocks if we are syncing or the peer who is reporting
                // the missing block is not synced.
                //
                let skip_missing_fetch = {
                    let peers = self.network.peer_lock.read().await;
                    peers.peers.values().any(|p| p.is_connected && p.is_syncing) || {
                        let peer = peers.get_peer_by_id(peer_id).unwrap();
                        peer.is_syncing || !peer.is_synced
                    }
                };

                //
                // if any nodes are syncing and connected, we want to let them finish
                // before we start combing backwards from downloaded blocks, as this
                // will disrupt the block fetch process...
                //
                if skip_missing_fetch {
                    return None;
                }

                let mut sync = self.sync.write().await;
                sync.add(
                    &self.network,
                    BlockReference {
                        block_id,
                        block_hash,
                        timestamp: 0,
                        transactions: 0,
                        has_golden_ticket: false,
                    },
                    peer_id,
                )
                .await;
                sync.fetch(&self.network, &self.fetch_dispatcher).await;
            }
            RoutingEvent::BlockchainRequest(peer_id) => {
                info!(
                    "RoutingEvent::BlockchainRequest -- requesting blockchain from peer {:?} (after block add failure?)",
                    peer_id
                );
                let sync = self.sync.read().await;
                sync.send_request_blockchain_message(
                    peer_id,
                    self.config_lock.clone(),
                    &self.network,
                )
                .await;
            }
            RoutingEvent::KeyListUpdated(key_list) => {
                self.process_key_list_updated_event(key_list).await;
            }
        }
        None
    }

    async fn on_init(&mut self) {
        assert!(!self.senders_to_verification.is_empty());
        self.reconnection_timer = RECONNECTION_PERIOD;

        self.gatekeeper.reset();

        let confirmation_data =
            ConfigManager::read_confirmation_data(self.network.io_interface.deref())
                .await
                .map(|result| Some(result))
                .unwrap_or_else(|e| {
                    error!("Couldn't read confirmation data on load up. {:?}", e);
                    None
                });

        {
            let mut configs = self.config_lock.write().await;
            if let Some(confirmation_data) = confirmation_data {
                configs.get_blockchain_configs_mut().confirmations = confirmation_data;
            }
        }

        //
        // initialize outbound conditions to peers
        //
        self.network.initialize(self.config_lock.clone()).await;
    }
    async fn on_stat_interval(&mut self, _current_time: Timestamp) {}

    fn is_ready_to_process(&self) -> bool {
        self.sender_to_miner.capacity() > CHANNEL_SAFE_BUFFER
            && self.sender_to_consensus.capacity() > CHANNEL_SAFE_BUFFER
            && self
                .senders_to_verification
                .iter()
                .all(|sender| sender.capacity() > CHANNEL_SAFE_BUFFER)
    }
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::transaction::Transaction;
    use crate::core::defs::SaitoPublicKey;
    use crate::core::defs::Timestamp;
    use crate::core::network::events::NetworkEvent;
    use crate::core::network::interface_io::{InterfaceEvent, InterfaceIO};
    use crate::core::network::network::PeerDisconnectType;
    use crate::core::process::process_event::ProcessEvent;
    use crate::core::routing_thread::RoutingThread;
    use crate::core::util::config_manager::CONFIRMATION_CONFIG_PATH;
    use crate::core::util::configuration::Endpoint;
    use crate::core::util::configuration::{
        BlockchainConfig, Configuration, ConsensusConfig, PeerConfig, Server, WalletConfig,
    };
    use crate::core::util::crypto::generate_keys;
    use crate::core::util::test::node_tester::test::{NodeTester, TestConfiguration};
    use crate::core::verification_thread::VerifyRequest;
    use ahash::HashMap;
    use async_trait::async_trait;
    use std::fmt::{Debug, Formatter};
    use std::io::{Error, ErrorKind};
    use std::sync::{Arc, Mutex};
    use tokio::sync::RwLock;

    #[derive(Debug, Default)]
    struct TestHarnessIoState {
        connect_attempts: Vec<String>,
        stored_values: HashMap<String, Vec<u8>>,
        fail_connect: bool,
    }

    #[derive(Debug, Clone)]
    struct TestHarnessIo {
        state: Arc<Mutex<TestHarnessIoState>>,
    }

    impl TestHarnessIo {
        fn new(state: Arc<Mutex<TestHarnessIoState>>) -> Self {
            Self { state }
        }
    }

    #[async_trait]
    impl InterfaceIO for TestHarnessIo {
        async fn send_message_by_peer_id(
            &self,
            _peer_id: u64,
            _buffer: &[u8],
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn send_message(&self, _public_key: [u8; 33], _buffer: &[u8]) -> Result<(), Error> {
            Ok(())
        }

        async fn disconnect_from_peer(&self, _peer_id: u64) -> Result<(), Error> {
            Ok(())
        }

        async fn send_message_to_all(
            &self,
            _buffer: &[u8],
            _excluded_peers: Vec<u64>,
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn connect_to_peer(&mut self, url: String) -> Result<(), Error> {
            let mut state = self.state.lock().unwrap();
            state.connect_attempts.push(url);
            if state.fail_connect {
                return Err(Error::new(ErrorKind::ConnectionRefused, "connect failed"));
            }
            Ok(())
        }

        async fn fetch_block_from_peer(
            &self,
            _block_hash: [u8; 32],
            _peer_id: u64,
            _url: &str,
            _block_id: u64,
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
            self.state
                .lock()
                .unwrap()
                .stored_values
                .insert(key.to_string(), value.to_vec());
            Ok(())
        }

        async fn append_value(&mut self, key: &str, value: &[u8]) -> Result<(), Error> {
            let mut state = self.state.lock().unwrap();
            state
                .stored_values
                .entry(key.to_string())
                .or_default()
                .extend_from_slice(value);
            Ok(())
        }

        async fn flush_data(&mut self, _key: &str) -> Result<(), Error> {
            Ok(())
        }

        async fn read_value(&self, key: &str) -> Result<Vec<u8>, Error> {
            self.state
                .lock()
                .unwrap()
                .stored_values
                .get(key)
                .cloned()
                .ok_or_else(|| Error::new(ErrorKind::NotFound, "value not found"))
        }

        async fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
            Ok(vec![])
        }

        async fn is_existing_file(&self, key: &str) -> bool {
            self.state.lock().unwrap().stored_values.contains_key(key)
        }

        async fn remove_value(&self, key: &str) -> Result<(), Error> {
            self.state.lock().unwrap().stored_values.remove(key);
            Ok(())
        }

        fn get_block_dir(&self) -> String {
            "./data/test/blocks".to_string()
        }

        fn get_checkpoint_dir(&self) -> String {
            "./data/test/checkpoints".to_string()
        }

        fn ensure_directory_exists(&self, _block_dir: &str) -> Result<(), Error> {
            Ok(())
        }

        async fn process_api_call(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: SaitoPublicKey,
        ) {
        }

        async fn process_api_success(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: SaitoPublicKey,
        ) {
        }

        async fn process_api_error(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: SaitoPublicKey,
        ) {
        }

        fn send_interface_event(&self, _event: InterfaceEvent) {}

        async fn save_wallet(
            &self,
            _wallet: &mut crate::core::consensus::wallet::Wallet,
        ) -> Result<(), Error> {
            Ok(())
        }

        async fn load_wallet(
            &self,
            _wallet: &mut crate::core::consensus::wallet::Wallet,
        ) -> Result<(), Error> {
            Ok(())
        }

        fn get_my_services(&self) -> Vec<crate::core::network::service::Service> {
            vec![]
        }
    }

    #[derive(Clone)]
    struct TestHarnessConfig {
        server: Option<Server>,
        peers: Vec<PeerConfig>,
        blockchain: BlockchainConfig,
        spv_mode: bool,
        browser_mode: bool,
        consensus: Option<ConsensusConfig>,
        config_path: String,
        save_should_fail: bool,
    }

    impl Default for TestHarnessConfig {
        fn default() -> Self {
            let base = TestConfiguration::default();
            Self {
                server: base.get_server_configs().cloned(),
                peers: base.get_peer_configs().clone(),
                blockchain: base.get_blockchain_configs().clone(),
                spv_mode: base.is_spv_mode(),
                browser_mode: base.is_browser(),
                consensus: base.get_consensus_config().cloned(),
                config_path: String::new(),
                save_should_fail: false,
            }
        }
    }

    impl Debug for TestHarnessConfig {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            f.debug_struct("TestHarnessConfig")
                .field("server", &self.server)
                .field("peers", &self.peers)
                .field("blockchain", &self.blockchain)
                .field("spv_mode", &self.spv_mode)
                .field("browser_mode", &self.browser_mode)
                .field("consensus", &self.consensus)
                .field("config_path", &self.config_path)
                .field("save_should_fail", &self.save_should_fail)
                .finish()
        }
    }

    impl Configuration for TestHarnessConfig {
        fn get_server_configs(&self) -> Option<&Server> {
            self.server.as_ref()
        }

        fn get_peer_configs(&self) -> &Vec<PeerConfig> {
            &self.peers
        }

        fn get_blockchain_configs(&self) -> &BlockchainConfig {
            &self.blockchain
        }

        fn get_blockchain_configs_mut(&mut self) -> &mut BlockchainConfig {
            &mut self.blockchain
        }

        fn get_block_fetch_url(&self) -> String {
            self.server
                .as_ref()
                .map(|server| {
                    peer_url_from_config(&PeerConfig {
                        host: server.endpoint.host.clone(),
                        port: server.endpoint.port,
                        protocol: server.endpoint.protocol.clone(),
                        synctype: "full".to_string(),
                    })
                })
                .unwrap_or_default()
        }

        fn is_spv_mode(&self) -> bool {
            self.spv_mode
        }

        fn is_browser(&self) -> bool {
            self.browser_mode
        }

        fn replace(&mut self, config: &dyn Configuration) {
            self.server = config.get_server_configs().cloned();
            self.peers = config.get_peer_configs().clone();
            self.blockchain = config.get_blockchain_configs().clone();
            self.spv_mode = config.is_spv_mode();
            self.browser_mode = config.is_browser();
            self.consensus = config.get_consensus_config().cloned();
        }

        fn get_consensus_config(&self) -> Option<&ConsensusConfig> {
            self.consensus.as_ref()
        }

        fn get_consensus_config_mut(&mut self) -> Option<&mut ConsensusConfig> {
            self.consensus.as_mut()
        }

        fn get_config_path(&self) -> String {
            self.config_path.clone()
        }

        fn set_config_path(&mut self, path: String) {
            self.config_path = path;
        }

        fn save(&self) -> Result<(), Error> {
            if self.save_should_fail {
                return Err(Error::new(ErrorKind::Other, "save failed"));
            }
            Ok(())
        }

        fn get_wallet_configs(&self) -> Option<&WalletConfig> {
            None
        }

        fn get_wallet_configs_mut(&mut self) -> Option<&mut WalletConfig> {
            None
        }
    }

    fn install_test_io(tester: &mut NodeTester, state: Arc<Mutex<TestHarnessIoState>>) {
        tester.routing_thread.network.io_interface = Box::new(TestHarnessIo::new(state.clone()));
        tester.routing_thread.storage.io_interface = Box::new(TestHarnessIo::new(state));
    }

    fn install_test_config(tester: &mut NodeTester, config: TestHarnessConfig) {
        tester.routing_thread.config_lock = Arc::new(RwLock::new(config));
    }

    fn peer_url_from_config(peer: &PeerConfig) -> String {
        let protocol = if peer.protocol == "https" {
            "wss"
        } else {
            "ws"
        };
        format!("{}://{}:{}/wsopen", protocol, peer.host, peer.port)
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn malformed_network_messages_do_not_panic_routing_thread() {
        let mut tester = NodeTester::default();

        let result = tester
            .routing_thread
            .process_network_event(NetworkEvent::PeerBufferReceived {
                peer_id: 1,
                buffer: vec![255, 0, 1],
            })
            .await;

        assert!(result.is_some());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn on_init_ignores_malformed_confirmation_data() {
        let mut tester = NodeTester::default();
        let state = Arc::new(Mutex::new(TestHarnessIoState::default()));

        state
            .lock()
            .unwrap()
            .stored_values
            .insert(CONFIRMATION_CONFIG_PATH.to_string(), b"not-json".to_vec());
        install_test_io(&mut tester, state);

        let mut config = TestHarnessConfig::default();
        config.blockchain.confirmations = vec![(11, [3; 32], 5)];
        install_test_config(&mut tester, config);

        tester.routing_thread.on_init().await;

        let config = tester.routing_thread.config_lock.read().await;
        assert_eq!(
            config.get_blockchain_configs().confirmations,
            vec![(11, [3; 32], 5)]
        );
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn blockchain_updated_tolerates_config_save_failures() {
        let mut tester = NodeTester::default();
        let mut config = TestHarnessConfig::default();
        config.save_should_fail = true;
        config.blockchain.confirmations = vec![(7, [9; 32], 3)];
        install_test_config(&mut tester, config);

        tester
            .routing_thread
            .process_event(crate::core::routing_thread::RoutingEvent::OnAddBlockSuccess([1; 32]))
            .await;

        let config = tester.routing_thread.config_lock.read().await;
        assert_eq!(
            config.get_blockchain_configs().confirmations,
            vec![(7, [9; 32], 3)]
        );
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn send_to_verification_thread_returns_when_sender_is_dropped() {
        let mut tester = NodeTester::default();
        let (sender, receiver) = tokio::sync::mpsc::channel(1);
        drop(receiver);
        tester.routing_thread.senders_to_verification = vec![sender];

        tester
            .routing_thread
            .send_to_verification_thread(VerifyRequest::Transaction(Transaction::default()))
            .await;
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn send_to_verification_thread_returns_when_no_senders_exist() {
        let mut tester = NodeTester::default();
        tester.routing_thread.senders_to_verification.clear();

        tester
            .routing_thread
            .send_to_verification_thread(VerifyRequest::Transaction(Transaction::default()))
            .await;
    }
}
