use super::stat_thread::StatEvent;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::blockchain_sync_state::BlockchainSyncState;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::peers::congestion_controller::{
    CongestionStatsDisplay, CongestionType, PeerCongestionControls,
};
use crate::core::consensus::peers::peer::PeerStatus;
use crate::core::consensus::peers::peer_service::PeerService;
use crate::core::consensus::wallet::Wallet;
use crate::core::consensus_thread::ConsensusEvent;
use crate::core::defs::{
    BlockHash, BlockId, PeerIndex, PrintForLog, SaitoHash, SaitoPublicKey, StatVariable, Timestamp,
    CHANNEL_SAFE_BUFFER, STAT_BIN_COUNT,
};
use crate::core::io::interface_io::InterfaceEvent;
use crate::core::io::network::{Network, PeerDisconnectType};
use crate::core::io::network_event::NetworkEvent;
use crate::core::io::storage::Storage;
use crate::core::mining_thread::MiningEvent;
use crate::core::msg::block_request::BlockchainRequest;
use crate::core::msg::ghost_chain_sync::GhostChainSync;
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::process::process_event::ProcessEvent;
use crate::core::process::version::Version;
use crate::core::util;
use crate::core::util::config_manager::ConfigManager;
use crate::core::util::configuration::Configuration;
use crate::core::util::crypto::hash;
use crate::core::verification_thread::VerifyRequest;
use ahash::HashMap;
use async_trait::async_trait;
use log::{debug, error, info, trace, warn};
use std::cmp::max;
use std::io::Error;
use std::ops::Deref;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

const RECONNECTION_PERIOD: Timestamp = Duration::from_secs(2).as_millis() as Timestamp;

#[derive(Debug)]
pub enum RoutingEvent {
    BlockchainUpdated(BlockHash, bool),
    BlockFetchRequest(PeerIndex, BlockHash, BlockId),
    BlockchainRequest(PeerIndex),
}

pub struct StaticPeer {
    pub peer_details: util::configuration::PeerConfig,
    pub peer_index: u64,
}

pub struct RoutingStats {
    pub received_transactions: StatVariable,
    pub received_blocks: StatVariable,
    pub total_incoming_messages: StatVariable,
}

impl RoutingStats {
    pub fn new(sender: Sender<StatEvent>) -> Self {
        RoutingStats {
            received_transactions: StatVariable::new(
                "routing::received_txs".to_string(),
                STAT_BIN_COUNT,
                sender.clone(),
            ),
            received_blocks: StatVariable::new(
                "routing::received_blocks".to_string(),
                STAT_BIN_COUNT,
                sender.clone(),
            ),
            total_incoming_messages: StatVariable::new(
                "routing::incoming_msgs".to_string(),
                STAT_BIN_COUNT,
                sender,
            ),
        }
    }
}

/// Manages peers and routes messages to correct controller
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
    pub message_sending_timer: Timestamp,
    pub last_emitted_block_fetch_count: BlockId,
    pub stats: RoutingStats,
    pub senders_to_verification: Vec<Sender<VerifyRequest>>,
    pub last_verification_thread_index: usize,
    pub stat_sender: Sender<StatEvent>,
    pub blockchain_sync_state: BlockchainSyncState,
    /// if we receive a ghost chain with a gap between our latest block id and starting block id of the received ghost chain,
    /// we emit an event and store the received chain until the user handles the event. TODO : handle this functionality after JS functions are implemented.
    pub received_ghost_chain: Option<(GhostChainSync, PeerIndex)>,
    pub waiting_for_genesis_block: bool,
}

impl RoutingThread {
    ///
    ///
    /// # Arguments
    ///
    /// * `peer_index`:
    /// * `message`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn process_incoming_message(&mut self, peer_index: PeerIndex, message: Message) {
        self.network.update_peer_timer(peer_index).await;
        match message {
            Message::HandshakeChallenge(challenge) => {
                debug!("received handshake challenge from peer : {:?}", peer_index);
                self.network
                    .handle_handshake_challenge(
                        peer_index,
                        challenge,
                        self.wallet_lock.clone(),
                        self.config_lock.clone(),
                    )
                    .await;
            }
            Message::HandshakeResponse(response) => {
                trace!("received handshake response from peer : {:?}", peer_index);

                let is_browser = {
                    let configs = self.config_lock.read().await;
                    configs.is_browser()
                };
                {
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.find_peer_by_address_mut(&response.public_key) {
                        if let PeerStatus::Connected = peer.peer_status {
                            info!("Received handshake response for an existing peer : {}-{:?}. Sending Ping to check if the current peer connection is live. New peer : {}",
                                peer.index,
                                response.public_key.to_base58(),
                                peer_index);
                            peer.send_ping(
                                self.timer.get_timestamp_in_ms(),
                                self.network.io_interface.as_ref(),
                            )
                            .await;
                            let old_peer_index = peer.index;
                            peers.pending_handshake_responses.push((
                                peer_index,
                                old_peer_index,
                                response,
                                self.timer.get_timestamp_in_ms(),
                            ));
                            return;
                        }
                    }
                }

                self.network
                    .handle_handshake_response(
                        peer_index,
                        response,
                        self.wallet_lock.clone(),
                        self.blockchain_lock.clone(),
                        self.config_lock.clone(),
                    )
                    .await;

                let blockchain = self.blockchain_lock.read().await;
                if blockchain.get_latest_block().is_none() && !is_browser {
                    // we don't have any blocks in the blockchain yet. so we need to get the genesis block from this peer
                    self.network
                        .request_genesis_block_from_peer(peer_index)
                        .await;

                    self.waiting_for_genesis_block = true;
                } else {
                    drop(blockchain);
                    info!(
                        "requesting blockchain from peer : {:?} after handshake",
                        peer_index
                    );
                    // start block syncing here
                    self.network
                        .request_blockchain_from_peer(peer_index, self.blockchain_lock.clone())
                        .await;
                }
            }

            Message::Transaction(mut transaction) => {
                trace!(
                    "received transaction : {} from peer : {:?}",
                    transaction.signature.to_hex(),
                    peer_index
                );
                transaction.routed_from_peer = Some(peer_index);
                {
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
                        peer.stats.received_txs += 1;
                        peer.stats.last_received_tx_at = self.timer.get_timestamp_in_ms();
                        peer.stats.last_received_tx = transaction.signature.to_hex();
                    } else {
                        warn!(
                            "Received transaction from peer {:?} does not exist",
                            peer_index
                        );
                    }
                }
                self.stats.received_transactions.increment();
                self.send_to_verification_thread(VerifyRequest::Transaction(transaction))
                    .await;
            }
            Message::BlockchainRequest(request) => {
                trace!(
                    "received blockchain request from peer : {:?} with block id : {:?} and hash : {:?}",
                    peer_index,
                    request.latest_block_id,
                    request.latest_block_hash.to_hex()
                );
                {
                    let configs = self.config_lock.read().await;
                    if configs.is_browser() || configs.is_spv_mode() {
                        // not processing incoming blockchain request. since we cannot provide any blocks
                        return;
                    }
                }
                _ = self
                    .process_incoming_blockchain_request(request, peer_index)
                    .await;
            }
            Message::BlockHeaderHash(hash, block_id) => {
                if self.waiting_for_genesis_block {
                    info!("Won't process received block header : {:?}-{:?} since we are waiting for a genesis block",block_id, hash.to_hex());
                    // since we request the blockchain anyway, we don't have to keep this received header in memory
                    return;
                }
                debug!(
                    "received block header hash from peer : {:?} with block id : {:?} and hash : {:?}",
                    peer_index,
                    block_id,
                    hash.to_hex()
                );
                {
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
                        peer.stats.received_block_headers += 1;
                        peer.stats.last_received_block_header_at = self.timer.get_timestamp_in_ms();
                        peer.stats.last_received_block_header = hash.to_hex();
                    } else {
                        warn!(
                            "Received block header from peer {:?} does not exist",
                            peer_index
                        );
                    }
                }
                self.process_incoming_block_hash(hash, block_id, peer_index)
                    .await;
            }
            Message::Ping() => {
                self.network
                    .io_interface
                    .send_message(peer_index, Message::Pong().serialize().as_slice())
                    .await
                    .unwrap();
            }
            Message::Pong() => {
                // not processing this
            }
            Message::SPVChain() => {}
            Message::Services(services) => {
                self.process_peer_services(services, peer_index).await;
            }
            Message::GhostChain(chain) => {
                self.process_ghost_chain(chain, peer_index).await;
            }
            Message::GhostChainRequest(block_id, block_hash, fork_id) => {
                self.process_ghost_chain_request(block_id, block_hash, fork_id, peer_index)
                    .await;
            }
            Message::ApplicationMessage(api_message) => {
                trace!(
                    "processing application msg with buffer size : {:?} from peer : {:?}",
                    api_message.data.len(),
                    peer_index
                );
                self.network
                    .io_interface
                    .process_api_call(api_message.data, api_message.msg_index, peer_index)
                    .await;
            }
            Message::Result(api_message) => {
                self.network
                    .io_interface
                    .process_api_success(api_message.data, api_message.msg_index, peer_index)
                    .await;
            }
            Message::Error(api_message) => {
                self.network
                    .io_interface
                    .process_api_error(api_message.data, api_message.msg_index, peer_index)
                    .await;
            }
            Message::KeyListUpdate(key_list) => {
                _ = self
                    .network
                    .handle_received_key_list(peer_index, key_list)
                    .await
                    .inspect_err(|e| {
                        error!("Received key list error: {:?}", e);
                    });
            }
            Message::Block(_) => {
                error!("received block message");
                unreachable!();
            }
            Message::GenesisBlockRequest() => {
                let blockchain = self.blockchain_lock.read().await;
                info!(
                    "Received genesis block request from peer : {:?}. current genesis block id : {:?}",
                    peer_index,
                    blockchain.genesis_block_id
                );
                if blockchain.genesis_block_id != 0 {
                    let genesis_block_hash = blockchain
                        .blockring
                        .get_longest_chain_block_hash_at_block_id(blockchain.genesis_block_id)
                        .unwrap();
                    let buffer = Message::GenesisBlockHeader(
                        genesis_block_hash,
                        blockchain.genesis_block_id,
                    )
                    .serialize();
                    self.network
                        .io_interface
                        .send_message(peer_index, buffer.as_slice())
                        .await
                        .unwrap();
                } else {
                    warn!(
                        "We don't have a genesis block id set to alert the peer : {:?}",
                        peer_index
                    );
                }
            }
            Message::GenesisBlockHeader(hash, block_id) => {
                info!(
                    "Received genesis block header : {:?}-{:?} from peer : {:?}",
                    block_id,
                    hash.to_hex(),
                    peer_index,
                );
                {
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
                        peer.stats.received_block_headers += 1;
                        peer.stats.last_received_block_header_at = self.timer.get_timestamp_in_ms();
                        peer.stats.last_received_block_header = hash.to_hex();
                    } else {
                        warn!(
                            "Received block header from peer {:?} does not exist",
                            peer_index
                        );
                    }
                }
                self.process_incoming_block_hash(hash, block_id, peer_index)
                    .await;
            }
            Message::ForcedDisconnection(message) => {
                warn!(
                    "Received forced disconnection message: {:?}. from peer : {}",
                    message, peer_index
                );
                // let mut peers = self.network.peer_lock.write().await;
                // if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
                //     // we remove the static peer config to make sure we don't connect again to the peer
                //     peer.static_peer_config = None;
                // }
            }
        }
    }
    /// Processes a received ghost chain request from a peer to sync itself with the blockchain
    ///
    /// # Arguments
    ///
    /// * `block_id`:
    /// * `block_hash`:
    /// * `fork_id`:
    /// * `peer_index`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn process_ghost_chain_request(
        &self,
        block_id: u64,
        block_hash: SaitoHash,
        fork_id: SaitoHash,
        peer_index: u64,
    ) {
        debug!("processing ghost chain request from peer : {:?}. block_id : {:?} block_hash: {:?} fork_id: {:?}",
            peer_index,
            block_id,
            block_hash.to_hex(),
            fork_id.to_hex()
        );
        let blockchain = self.blockchain_lock.read().await;
        let mut peer_key_list: Vec<SaitoPublicKey> = vec![];
        {
            let peers = self.network.peer_lock.read().await;
            if let Some(peer) = peers.find_peer_by_index(peer_index) {
                peer_key_list.push(peer.public_key.unwrap());
                peer_key_list.append(&mut peer.key_list.clone());
            } else {
                warn!(
                    "couldn't find peer : {:?} for processing ghost chain request",
                    peer_index
                );
            }
        }

        let ghost = Self::generate_ghost_chain(
            block_id,
            fork_id,
            &blockchain,
            peer_key_list,
            &self.storage,
        )
        .await;

        debug!("sending ghost chain to peer : {:?}", peer_index);
        // debug!("ghost : {:?}", ghost);
        let buffer = Message::GhostChain(ghost).serialize();
        self.network
            .io_interface
            .send_message(peer_index, buffer.as_slice())
            .await
            .unwrap();
    }

    pub(crate) async fn generate_ghost_chain(
        block_id: u64,
        fork_id: SaitoHash,
        blockchain: &Blockchain,
        peer_key_list: Vec<SaitoPublicKey>,
        storage: &Storage,
    ) -> GhostChainSync {
        debug!(
            "generating ghost chain for block_id : {:?} fork_id : {:?}",
            block_id,
            fork_id.to_hex()
        );
        let mut last_shared_ancestor;

        if block_id == 0 || block_id < blockchain.genesis_block_id {
            // this means the peer is starting from beginning
            // since ghost chain is only used by lite clients, we only need to send the last 10 blocks.
            last_shared_ancestor = blockchain.get_latest_block_id().saturating_sub(10);
        } else {
            last_shared_ancestor = blockchain.generate_last_shared_ancestor(block_id, fork_id);
        }

        debug!("last_shared_ancestor 1 : {:?}", last_shared_ancestor);

        debug!(
            "peer key list: {:?}",
            peer_key_list
                .iter()
                .map(|pk| pk.to_base58())
                .collect::<Vec<String>>()
        );

        if last_shared_ancestor == 0 {
            // if we cannot find the last shared ancestor in a long chain, we just need to sync from peer's block id or the genesis block id if it's too far behind.
            last_shared_ancestor = std::cmp::max(block_id, blockchain.genesis_block_id);
        }

        let start = blockchain
            .blockring
            .get_longest_chain_block_hash_at_block_id(last_shared_ancestor)
            .unwrap_or([0; 32]);

        let latest_block_id = blockchain.blockring.get_latest_block_id();
        debug!("latest_block_id : {:?}", latest_block_id);
        debug!("last_shared_ancestor : {:?}", last_shared_ancestor);
        debug!("start : {:?}", start.to_hex());

        let mut ghost = GhostChainSync {
            start,
            prehashes: vec![],
            previous_block_hashes: vec![],
            block_ids: vec![],
            block_ts: vec![],
            txs: vec![],
            gts: vec![],
        };
        for i in (last_shared_ancestor + 1)..=latest_block_id {
            if let Some(hash) = blockchain
                .blockring
                .get_longest_chain_block_hash_at_block_id(i)
            {
                let block = blockchain.get_block(&hash);
                if let Some(block) = block {
                    if ghost.start == [0; 32] && ghost.gts.is_empty() {
                        // we only set the start if we are at the beginning of the ghost chain
                        ghost.start = block.previous_block_hash;
                    }

                    ghost.gts.push(block.has_golden_ticket);
                    ghost.block_ts.push(block.timestamp);
                    ghost.prehashes.push(block.pre_hash);
                    ghost.previous_block_hashes.push(block.previous_block_hash);
                    ghost.block_ids.push(block.id);

                    // let mut clone = block.clone();
                    // if !clone
                    //     .upgrade_block_to_block_type(BlockType::Full, storage, false)
                    //     .await
                    // {
                    //     warn!(
                    //         "couldn't upgrade block : {:?}-{:?} for ghost chain generation",
                    //         clone.id,
                    //         clone.hash.to_hex()
                    //     );
                    // }
                    debug!(
                        "pushing block : {:?} at index : {:?} has txs : {:?} pre_hash : {} prev_block_hash : {}",
                        block.hash.to_hex(),
                        i,
                        // clone.transactions.len(),
                        block.has_keylist_txs(&peer_key_list),
                        block.pre_hash.to_hex(),
                        block.previous_block_hash.to_hex()
                    );
                    debug_assert_eq!(
                        block.hash,
                        crate::core::util::crypto::hash(block.serialize_for_hash().as_slice())
                    );
                    // whether this block has any txs which the peer will be interested in
                    ghost.txs.push(block.has_keylist_txs(&peer_key_list));
                }
            }
        }
        ghost
    }

    async fn handle_new_peer(&mut self, peer_index: u64, ip: Option<String>) {
        trace!("handling new peer : {:?}", peer_index);
        self.network.handle_new_peer(peer_index, ip).await;
    }

    async fn handle_new_stun_peer(&mut self, peer_index: u64, public_key: SaitoPublicKey) {
        trace!("handling new stun peer : {:?}", peer_index);
        self.network
            .handle_new_stun_peer(peer_index, public_key)
            .await;
    }

    async fn remove_stun_peer(&mut self, peer_index: u64) {
        trace!("removing stun peer : {:?}", peer_index);
        self.network.remove_stun_peer(peer_index).await;
    }

    async fn handle_peer_disconnect(
        &mut self,
        peer_index: u64,
        disconnect_type: PeerDisconnectType,
    ) {
        trace!("handling peer disconnect, peer_index = {}", peer_index);
        self.network
            .handle_peer_disconnect(peer_index, disconnect_type)
            .await;
    }
    pub async fn set_my_key_list(&mut self, mut key_list: Vec<SaitoPublicKey>) {
        let mut wallet = self.wallet_lock.write().await;
        trace!(
            "updating my key list : {:?} from : {:?}",
            key_list
                .iter()
                .map(|k| k.to_base58())
                .collect::<Vec<String>>(),
            wallet
                .key_list
                .iter()
                .map(|k| k.to_base58())
                .collect::<Vec<String>>()
        );

        key_list.sort();
        // check if key list is different from what we already have
        if key_list.len() != wallet.key_list.len()
            || wallet
                .key_list
                .iter()
                .zip(key_list.iter())
                .any(|(a, b)| a != b)
        {
            trace!(
                "updating my key list : {:?} from : {:?}",
                key_list
                    .iter()
                    .map(|k| k.to_base58())
                    .collect::<Vec<String>>(),
                wallet
                    .key_list
                    .iter()
                    .map(|k| k.to_base58())
                    .collect::<Vec<String>>()
            );
            wallet.set_key_list(key_list);
            self.network.send_key_list(&wallet.key_list).await;
        }
    }

    pub async fn process_incoming_blockchain_request(
        &mut self,
        request: BlockchainRequest,
        peer_index: u64,
    ) -> Result<(), Error> {
        info!(
            "processing incoming blockchain request : {:?}-{:?}-{:?} from peer : {:?}",
            request.latest_block_id,
            request.latest_block_hash.to_hex(),
            request.fork_id.to_hex(),
            peer_index
        );
        // TODO : can we ignore the functionality if it's a lite node ?

        let blockchain = self.blockchain_lock.read().await;

        {
            let mut peers = self.network.peer_lock.write().await;
            if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
                if peer.requested_blockchain_from_us {
                    info!("peer : {:?} already requested the blockchain from us once. Not processing this request again until a reconnection", peer_index);
                    return Ok(());
                }
                peer.requested_blockchain_from_us = true;
            } else {
                error!("Cannot find the peer for index : {} to process the incoming blockchain request", peer_index);

                _ = self
                    .network
                    .disconnect_from_peer(peer_index, "cannot find peer details")
                    .await
                    .inspect_err(|e| {
                        error!("error disconnecting from peer : {}. {}", peer_index, e)
                    });
            }
        }

        let mut last_shared_ancestor =
            blockchain.generate_last_shared_ancestor(request.latest_block_id, request.fork_id);
        debug!(
            "last shared ancestor = {:?} latest_id = {:?}",
            last_shared_ancestor,
            blockchain.blockring.get_latest_block_id()
        );

        if last_shared_ancestor == 0 {
            last_shared_ancestor = blockchain.genesis_block_id;
        }
        // if request.latest_block_id > 0
        //     && last_shared_ancestor == 0
        //     && blockchain.get_latest_block_id() > 0
        // {
        //     info!("peer : {:?} has latest block : {}-{}. our latest block : {}-{}. cannot find a shared ancestor. Therefore disconnecting the peer",
        //         peer_index,
        //         request.latest_block_id,
        //         request.latest_block_hash.to_hex(),
        //         blockchain.get_latest_block_id(),
        //         blockchain.get_latest_block_hash().to_hex());
        //     {
        //         if let Some(peer) = self
        //             .network
        //             .peer_lock
        //             .write()
        //             .await
        //             .index_to_peers
        //             .get_mut(&peer_index)
        //         {
        //             peer.static_peer_config = None;
        //         }
        //     }
        //     self.network
        //         .disconnect_from_peer(
        //             peer_index,
        //             "Cannot find a shared ancestor block to sync 2 nodes",
        //         )
        //         .await
        //         .inspect_err(|e| {
        //             error!("error disconnecting from peer : {}. {}", peer_index, e);
        //         })?;
        //     return Ok(());
        // }

        // TODO : this should be handled as a separate task which can be completed over multiple iterations to reduce the impact for single threaded operations
        // and preventing against DOS attacks
        for i in last_shared_ancestor..(blockchain.blockring.get_latest_block_id() + 1) {
            if let Some(block_hash) = blockchain
                .blockring
                .get_longest_chain_block_hash_at_block_id(i)
            {
                debug!(
                    "sending (queueing) block header hash: {:?}-{:?} to peer : {:?}",
                    i,
                    block_hash.to_hex(),
                    peer_index
                );
                let buffer = Message::BlockHeaderHash(block_hash, i).serialize();
                _ = self.network.queue_to_send(buffer, peer_index).await;
            } else {
                continue;
            }
        }
        Ok(())
    }
    async fn process_incoming_block_hash(
        &mut self,
        block_hash: SaitoHash,
        block_id: u64,
        peer_index: u64,
    ) {
        debug!(
            "processing incoming block hash : {:?}-{:?} from peer : {:?}",
            block_id,
            block_hash.to_hex(),
            peer_index
        );
        {
            // trace!("locking blockchain 6");
            let blockchain = self.blockchain_lock.read().await;
            if !blockchain.blocks.is_empty() && blockchain.lowest_acceptable_block_id >= block_id {
                debug!("skipping block header : {:?}-{:?} from peer : {:?} since our lowest acceptable id : {:?}",
                    block_id,
                    block_hash.to_hex(),
                    peer_index,
                    blockchain.lowest_acceptable_block_id);
                return;
            }
            if block_id < max(1, blockchain.genesis_block_id) {
                debug!("skipping block header : {:?}-{:?} from peer : {:?} since it's earlier than our genesis block id : {}",
                    block_id,
                    block_hash.to_hex(),
                    peer_index,
                    blockchain.genesis_block_id);
                return;
            }
        }
        // trace!("releasing blockchain 6");

        let peers = self.network.peer_lock.read().await;
        let wallet = self.wallet_lock.read().await;

        if let Some(peer) = peers.index_to_peers.get(&peer_index) {
            // TODO : check if this check can be removed from here, since network.rs also have the same check
            if wallet.wallet_version > peer.wallet_version
                && peer.wallet_version != Version::new(0, 0, 0)
            {
                warn!(
                    "Not Fetching Block: {:?} from peer :{:?} since peer version is old. expected: {:?} actual {:?} ",
                    block_hash.to_hex(), peer.index, wallet.wallet_version, peer.wallet_version
                );
                return;
            }
        }

        drop(peers);
        drop(wallet);

        self.blockchain_sync_state
            .add_entry(
                block_hash,
                block_id,
                peer_index,
                self.network.peer_lock.clone(),
            )
            .await;

        // self.fetch_next_blocks().await;
    }

    async fn fetch_next_blocks(&mut self) -> bool {
        let mut work_done = false;
        {
            let blockchain = self.blockchain_lock.read().await;
            self.blockchain_sync_state
                .build_peer_block_picture(&blockchain);
        }

        let map = self.blockchain_sync_state.get_blocks_to_fetch_per_peer();

        let fetching_count = self.blockchain_sync_state.get_fetching_block_count();
        // trace!("fetching next blocks : {:?} from peers", fetching_count);
        self.network
            .io_interface
            .send_interface_event(InterfaceEvent::BlockFetchStatus(fetching_count as BlockId));

        let mut fetched_blocks: Vec<(PeerIndex, SaitoHash)> = Default::default();
        for (peer_index, vec) in map {
            for (hash, block_id) in vec.iter().rev() {
                work_done = true;
                let result = self
                    .network
                    .process_incoming_block_hash(
                        *hash,
                        *block_id,
                        peer_index,
                        self.blockchain_lock.clone(),
                        self.mempool_lock.clone(),
                    )
                    .await;
                if result.is_some() {
                    fetched_blocks.push((peer_index, *hash));
                } else {
                    // if we already have the block added don't need to request it from peer
                    self.blockchain_sync_state.remove_entry(*hash);
                }
            }
        }
        work_done
    }
    async fn send_to_verification_thread(&mut self, request: VerifyRequest) {
        // waiting till we get an acceptable sender
        let sender_count = self.senders_to_verification.len();
        let mut trials = 0;
        loop {
            trials += 1;
            self.last_verification_thread_index += 1;
            let sender_index: usize = self.last_verification_thread_index % sender_count;
            let sender = self
                .senders_to_verification
                .get(sender_index)
                .expect("sender should be here as we are using the modulus on index");

            if sender.capacity() > 0 {
                trace!("sending to verification thread : {:?}", sender_index);
                sender.send(request).await.unwrap();

                return;
            }
            trace!(
                "verification thread sender : {:?} is full. capacity : {:?} max capacity : {:?}",
                sender_index,
                sender.capacity(),
                sender.max_capacity()
            );
            if trials == sender_count {
                // todo : if all the channels are full, we should wait here. cannot sleep to support wasm interface
                trials = 0;
            }
        }
    }
    pub async fn process_ghost_chain(&mut self, chain: GhostChainSync, peer_index: u64) {
        debug!("processing ghost chain from peer : {:?}", peer_index);

        let mut previous_block_hash = chain.start;
        let mut configs = self.config_lock.write().await;
        let mut blockchain = self.blockchain_lock.write().await;
        let mut mempool = self.mempool_lock.write().await;
        let mut lowest_id_to_reorg = 0;
        let mut lowest_hash_to_reorg = [0; 32];
        let mut need_blocks_fetched = false;
        for i in 0..chain.prehashes.len() {
            let buf = [
                previous_block_hash.as_slice(),
                chain.prehashes[i].as_slice(),
            ]
            .concat();
            let block_hash = hash(&buf);
            if chain.txs[i] {
                debug!(
                    "ghost block : {:?} has txs for me. fetching from peer : {:?}",
                    block_hash.to_hex(),
                    peer_index
                );
                self.blockchain_sync_state
                    .add_entry(
                        block_hash,
                        chain.block_ids[i],
                        peer_index,
                        self.network.peer_lock.clone(),
                    )
                    .await;
                need_blocks_fetched = true;
            } else {
                if !need_blocks_fetched {
                    lowest_id_to_reorg = chain.block_ids[i];
                    lowest_hash_to_reorg = block_hash;
                }
                debug!(
                    "ghost block : {:?} doesn't have txs for me. not fetching",
                    block_hash.to_hex()
                );
                blockchain.add_ghost_block(
                    chain.block_ids[i],
                    chain.previous_block_hashes[i],
                    chain.block_ts[i],
                    chain.prehashes[i],
                    chain.gts[i],
                    block_hash,
                );
            }
            previous_block_hash = block_hash;
        }
        debug!(
            "calling reorg with lowest values : {:?}-{:?}",
            lowest_id_to_reorg,
            lowest_hash_to_reorg.to_hex()
        );

        if lowest_id_to_reorg != 0 {
            blockchain.blockring.on_chain_reorganization(
                lowest_id_to_reorg,
                lowest_hash_to_reorg,
                true,
            );
            blockchain
                .on_chain_reorganization(
                    lowest_id_to_reorg,
                    lowest_hash_to_reorg,
                    true,
                    &self.storage,
                    configs.deref(),
                    &mut mempool,
                    Option::from(&self.network),
                )
                .await;

            if let Some(fork_id) = blockchain.generate_fork_id(blockchain.last_block_id) {
                if fork_id != [0; 32] {
                    blockchain.set_fork_id(fork_id);
                }
            } else {
                // blockchain.set_fork_id([0; 32]);
                trace!(
                    "fork id not generated for last block id : {:?} after ghost chain processing",
                    blockchain.last_block_id
                );
            }
            self.network
                .io_interface
                .send_interface_event(InterfaceEvent::BlockAddSuccess(
                    lowest_hash_to_reorg,
                    lowest_id_to_reorg,
                ));
        }
        configs
            .get_blockchain_configs_mut()
            .expect("blockchain config should exist here")
            .initial_loading_completed = true;
    }

    // TODO : remove if not required
    async fn process_peer_services(&mut self, services: Vec<PeerService>, peer_index: u64) {
        let mut peers = self.network.peer_lock.write().await;
        let peer = peers.index_to_peers.get_mut(&peer_index);
        if peer.is_some() {
            let peer = peer.unwrap();
            peer.services = services;
        } else {
            warn!("peer {:?} not found to update services", peer_index);
        }
    }

    async fn manage_congested_peers(&mut self) {
        let peers = self.network.peer_lock.write().await;
        let current_time = self.timer.get_timestamp_in_ms();
        let congested_peers: Vec<PeerIndex> = peers.get_congested_peers(current_time);
        drop(peers);

        for peer_index in congested_peers {
            warn!("peer : {:?} is congested. so disconnecting...", peer_index);
            _ = self
                .network
                .disconnect_from_peer(peer_index, "Peer is congested")
                .await
                .inspect_err(|e| error!("{:?}", e));
        }
    }
}

#[async_trait]
impl ProcessEvent<RoutingEvent> for RoutingThread {
    async fn process_network_event(&mut self, event: NetworkEvent) -> Option<()> {
        match event {
            NetworkEvent::IncomingNetworkMessage { peer_index, buffer } => {
                trace!(
                    "processing incoming network message from peer : {:?} of size : {}",
                    peer_index,
                    buffer.len()
                );
                {
                    // TODO : move this before deserialization to avoid spending CPU time on it. moved here to just print message type
                    let mut peers = self.network.peer_lock.write().await;
                    let time: u64 = self.timer.get_timestamp_in_ms();
                    peers.add_congestion_event(peer_index, CongestionType::IncomingMessages, time);
                }
                let buffer_len = buffer.len();
                let message = Message::deserialize(buffer);
                if message.is_err() {
                    warn!(
                        "failed deserializing msg from peer : {:?} with buffer size : {:?}. disconnecting peer",
                        peer_index, buffer_len
                    );
                    error!("error : {:?}", message.err().unwrap());
                    self.network
                        .disconnect_from_peer(
                            peer_index,
                            format!(
                                "Failed deserializing message with buffer size : {}",
                                buffer_len
                            )
                            .as_str(),
                        )
                        .await
                        .unwrap();
                    return None;
                }
                let message = message.unwrap();

                self.stats.total_incoming_messages.increment();
                self.process_incoming_message(peer_index, message).await;
                return Some(());
            }
            NetworkEvent::PeerConnectionResult { result } => {
                if result.is_ok() {
                    let (peer_index, ip) = result.unwrap();
                    let time = self.timer.get_timestamp_in_ms();

                    {
                        let peers = self.network.peer_lock.read().await;
                        if peers.is_peer_blacklisted(peer_index, time) {
                            warn!(
                                "peer : {:?} is blacklisted. not connecting to it. ip : {:?}",
                                peer_index,
                                ip.as_deref().unwrap_or("unknown")
                            );
                            return Some(());
                        }
                    }
                    self.handle_new_peer(peer_index, ip).await;
                    {
                        let mut peers = self.network.peer_lock.write().await;
                        peers.add_congestion_event(
                            peer_index,
                            CongestionType::PeerConnections,
                            time,
                        );
                    }
                    return Some(());
                }
            }
            NetworkEvent::AddStunPeer {
                peer_index,
                public_key,
            } => {
                self.handle_new_stun_peer(peer_index, public_key).await;
                return Some(());
            }
            NetworkEvent::RemoveStunPeer { peer_index } => {
                self.remove_stun_peer(peer_index).await;
                return Some(());
            }
            NetworkEvent::PeerDisconnected {
                peer_index,
                disconnect_type,
            } => {
                self.handle_peer_disconnect(peer_index, disconnect_type)
                    .await;
                return Some(());
            }
            NetworkEvent::BlockFetched {
                block_hash,
                block_id,
                peer_index,
                buffer,
            } => {
                debug!("block received : {:?}", block_hash.to_hex());

                self.send_to_verification_thread(VerifyRequest::Block(
                    buffer, peer_index, block_hash, block_id,
                ))
                .await;

                self.blockchain_sync_state.mark_as_fetched(block_hash);

                // self.fetch_next_blocks().await;

                return Some(());
            }
            NetworkEvent::BlockFetchFailed {
                block_hash,
                peer_index,
                block_id,
            } => {
                debug!("block fetch failed : {:?}", block_hash.to_hex());

                {
                    let mut peers = self.network.peer_lock.write().await;
                    let time = self.timer.get_timestamp_in_ms();
                    peers.add_congestion_event(
                        peer_index,
                        CongestionType::FailedBlockFetches,
                        time,
                    );
                }

                self.blockchain_sync_state
                    .mark_as_failed(block_id, block_hash, peer_index);
            }
            _ => unreachable!(),
        }
        debug!("network event processed");
        None
    }

    async fn process_timer_event(&mut self, duration: Duration) -> Option<()> {
        // trace!("processing timer event : {:?}", duration.as_micros());

        let duration_value: Timestamp = duration.as_millis() as Timestamp;

        let mut work_done = false;

        self.reconnection_timer = self.reconnection_timer.saturating_add(duration_value);

        let current_time = self.timer.get_timestamp_in_ms();
        if self.reconnection_timer >= RECONNECTION_PERIOD {
            self.network.connect_to_static_peers(current_time).await;
            self.network.send_pings().await;
            self.reconnection_timer = 0;
            self.fetch_next_blocks().await;
            {
                let wallet = self.wallet_lock.read().await;
                self.network.send_key_list(&wallet.key_list).await;
            }

            work_done = true;
        }

        const MESSAGES_SENDING_PERIOD: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;
        self.message_sending_timer += duration_value;
        if self.message_sending_timer >= MESSAGES_SENDING_PERIOD {
            self.message_sending_timer = 0;
            _ = self.network.send_messages_in_buffer().await;
        }

        const CONGESTION_CHECK_PERIOD: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;
        self.congestion_check_timer += duration_value;
        if self.congestion_check_timer >= CONGESTION_CHECK_PERIOD {
            self.manage_congested_peers().await;

            let mut configs = self.config_lock.write().await;
            let peers = self.network.peer_lock.read().await;
            let congestion_data = CongestionStatsDisplay {
                congestion_controls_by_key: peers
                    .congestion_controls_by_key
                    .iter()
                    .map(|(key, value)| (key.to_base58(), value.clone()))
                    .collect(),
                congestion_controls_by_ip: peers.congestion_controls_by_ip.clone(),
            };
            drop(peers);
            ConfigManager::write_congestion_data(
                &congestion_data,
                self.network.io_interface.deref(),
            )
            .await
            .unwrap_or_else(|e| {
                error!("failed to write congestion data : {:?}", e);
            });

            configs.set_congestion_data(Some(congestion_data));
            self.congestion_check_timer = 0;
            work_done = true;
        }

        const PEER_REMOVAL_TIMER_PERIOD: Timestamp =
            Duration::from_secs(5).as_millis() as Timestamp;
        self.peer_removal_timer += duration_value;
        if self.peer_removal_timer >= PEER_REMOVAL_TIMER_PERIOD {
            self.peer_removal_timer = 0;
            let mut selected_responses = vec![];
            {
                let peer_lock = self.network.peer_lock.clone();
                let mut peers = peer_lock.write().await;

                peers.pending_handshake_responses.retain(
                    |(new_peer_index, _old_peer_index, response, added_time)| {
                        if added_time + PEER_REMOVAL_TIMER_PERIOD < current_time {
                            selected_responses.push((*new_peer_index, response.clone()));
                            return false;
                        } else {
                            return true;
                        }
                    },
                );
            }
            for (new_peer_index, response) in selected_responses {
                {
                    // TODO : bad practice to get peer lock multiple times within this function. Need to find a better way. Need to handle it this way because below handle_handshake_response is locking resources
                    // need to disconnect the old peer here
                    let mut peers = self.network.peer_lock.write().await;
                    if let Some(peer) = peers.find_peer_by_address_mut(&response.public_key) {
                        peer.mark_as_disconnected(self.timer.get_timestamp_in_ms());
                        _ = self
                            .network
                            .disconnect_from_peer(
                                peer.index,
                                "already reconnected with a different socket",
                            )
                            .await;
                    }
                }
                self.network
                    .handle_handshake_response(
                        new_peer_index,
                        response.clone(),
                        self.wallet_lock.clone(),
                        self.blockchain_lock.clone(),
                        self.config_lock.clone(),
                    )
                    .await;
            }
            let mut peers = self.network.peer_lock.write().await;

            peers.disconnect_stale_peers(current_time);
            peers.remove_disconnected_peers(current_time);

            work_done = true;
        }

        if work_done {
            return Some(());
        }
        None
    }

    async fn process_event(&mut self, event: RoutingEvent) -> Option<()> {
        match event {
            RoutingEvent::BlockchainUpdated(block_hash, initial_sync) => {
                trace!(
                    "received blockchain update event : {:?}",
                    block_hash.to_hex()
                );

                self.blockchain_sync_state.remove_entry(block_hash);
                self.fetch_next_blocks().await;
                {
                    let mut configs = self.config_lock.write().await;
                    let blockchain = self.blockchain_lock.read().await;
                    let blockchain_configs = configs
                        .get_blockchain_configs_mut()
                        .expect("blockchain config should exist here");

                    blockchain_configs.last_block_hash = blockchain.last_block_hash.to_hex();
                    blockchain_configs.last_block_id = blockchain.last_block_id;
                    blockchain_configs.last_timestamp = blockchain.last_timestamp;
                    blockchain_configs.genesis_block_id = blockchain.genesis_block_id;
                    blockchain_configs.genesis_timestamp = blockchain.genesis_timestamp;
                    blockchain_configs.lowest_acceptable_timestamp =
                        blockchain.lowest_acceptable_timestamp;
                    blockchain_configs.lowest_acceptable_block_hash =
                        blockchain.lowest_acceptable_block_hash.to_hex();
                    blockchain_configs.lowest_acceptable_block_id =
                        blockchain.lowest_acceptable_block_id;
                    blockchain_configs.fork_id = blockchain.fork_id.unwrap_or_default().to_hex();

                    ConfigManager::write_blockchain_configs(
                        blockchain_configs,
                        self.network.io_interface.deref(),
                    )
                    .await
                    .unwrap_or_else(|e| {
                        error!(
                            "Error writing blockchain configs after a blockchain updated event, {}",
                            e
                        );
                    });
                }
                if initial_sync {
                    // we set this to false here since now we know the genesis block is added already.
                    self.waiting_for_genesis_block = false;

                    info!("since initial sync is done, we will request the chain from peers");
                    // since we added the initial block, we will request the rest of the blocks from peers
                    // FIXME : This could cause a performance issue if we have many peers sending a lot of block headers to us which we cannot process fast enough
                    let mut peer_list = vec![];
                    {
                        let peers = self.network.peer_lock.read().await;
                        for (peer_index, peer) in &peers.index_to_peers {
                            if let PeerStatus::Connected = peer.peer_status {
                                peer_list.push(*peer_index);
                            }
                        }
                    }
                    for peer_index in &peer_list {
                        self.network
                            .request_blockchain_from_peer(*peer_index, self.blockchain_lock.clone())
                            .await;
                    }
                }
            }

            RoutingEvent::BlockFetchRequest(peer_index, block_hash, block_id) => {
                trace!(
                    "
                    received block fetch request from peer : {:?} for block : {:?}-{:?}",
                    peer_index,
                    block_hash.to_hex(),
                    block_id
                );
                self.blockchain_sync_state
                    .add_entry(
                        block_hash,
                        block_id,
                        peer_index,
                        self.network.peer_lock.clone(),
                    )
                    .await;
            }
            RoutingEvent::BlockchainRequest(peer_index) => {
                info!(
                    "requesting blockchain from peer : {:?} after block add failure",
                    peer_index
                );
                self.network
                    .request_blockchain_from_peer(peer_index, self.blockchain_lock.clone())
                    .await;
            }
        }
        None
    }

    async fn on_init(&mut self) {
        assert!(!self.senders_to_verification.is_empty());
        self.reconnection_timer = RECONNECTION_PERIOD;

        let congestion_data =
            ConfigManager::read_congestion_data(self.network.io_interface.deref())
                .await
                .map(|result| Some(result))
                .unwrap_or_else(|e| {
                    error!("Couldn't read congestion data on load up. {:?}", e);
                    None
                });

        {
            let mut configs = self.config_lock.write().await;
            let mut peers = self.network.peer_lock.write().await;
            configs.set_congestion_data(congestion_data);

            if let Some(display) = configs.get_congestion_data() {
                peers.congestion_controls_by_ip = display.congestion_controls_by_ip.clone();
                peers.congestion_controls_by_key = display
                    .congestion_controls_by_key
                    .iter()
                    .map(|(key, value)| {
                        (
                            SaitoPublicKey::from_base58(key.as_str()).unwrap(),
                            value.clone(),
                        )
                    })
                    .collect::<HashMap<SaitoPublicKey, PeerCongestionControls>>();
            }
        }

        // connect to peers
        self.network
            .initialize_static_peers(self.config_lock.clone())
            .await;
    }
    async fn on_stat_interval(&mut self, current_time: Timestamp) {
        self.stats
            .received_transactions
            .calculate_stats(current_time)
            .await;
        self.stats
            .received_blocks
            .calculate_stats(current_time)
            .await;
        self.stats
            .total_incoming_messages
            .calculate_stats(current_time)
            .await;

        let stat = format!(
            "{} - {} - capacity : {:?} / {:?}",
            StatVariable::format_timestamp(current_time),
            format!("{:width$}", "consensus::channel", width = 40),
            self.sender_to_consensus.capacity(),
            self.sender_to_consensus.max_capacity()
        );
        self.stat_sender
            .send(StatEvent::StringStat(stat))
            .await
            .unwrap();
        for (index, sender) in self.senders_to_verification.iter().enumerate() {
            let stat = format!(
                "{} - {} - capacity : {:?} / {:?}",
                StatVariable::format_timestamp(current_time),
                format!(
                    "{:width$}",
                    format!("verification_{:?}::channel", index),
                    width = 40
                ),
                sender.capacity(),
                sender.max_capacity()
            );
            self.stat_sender
                .send(StatEvent::StringStat(stat))
                .await
                .unwrap();
        }

        let stats = self.blockchain_sync_state.get_stats();
        for stat in stats {
            self.stat_sender
                .send(StatEvent::StringStat(stat))
                .await
                .unwrap();
        }

        let peers = self.network.peer_lock.read().await;
        let peer_count = 0;
        let peers_in_handshake = 0;

        let stat = format!(
            "{} - {} - total peers : {:?}. in handshake : {:?}",
            StatVariable::format_timestamp(current_time),
            format!("{:width$}", "peers::state", width = 40),
            peer_count,
            peers_in_handshake,
        );
        self.stat_sender
            .send(StatEvent::StringStat(stat))
            .await
            .unwrap();
    }

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
    use crate::core::defs::NOLAN_PER_SAITO;
    use crate::core::routing_thread::RoutingThread;
    use crate::core::util::crypto::generate_keys;
    use crate::core::util::test::node_tester::test::NodeTester;

    #[tokio::test]
    #[serial_test::serial]
    async fn test_ghost_chain_gen() {
        // pretty_env_logger::init();
        NodeTester::delete_data().await.unwrap();
        let peer_public_key = generate_keys().0;
        let mut tester = NodeTester::new(1000, None, None);
        tester
            .init_with_staking(0, 60, 100_000 * NOLAN_PER_SAITO)
            .await
            .unwrap();

        tester.wait_till_block_id_with_txs(100, 0, 0).await.unwrap();

        {
            let fork_id = tester.get_fork_id(50).await;
            let blockchain = tester.routing_thread.blockchain_lock.read().await;

            let ghost_chain = RoutingThread::generate_ghost_chain(
                50,
                fork_id,
                &blockchain,
                vec![peer_public_key],
                &tester.routing_thread.storage,
            )
            .await;

            assert_eq!(ghost_chain.block_ids.len(), 50);
            assert_eq!(ghost_chain.block_ts.len(), 50);
            assert_eq!(ghost_chain.gts.len(), 50);
            assert_eq!(ghost_chain.prehashes.len(), 50);
            assert_eq!(ghost_chain.previous_block_hashes.len(), 50);
            assert!(ghost_chain.txs.iter().all(|x| !(*x)));
        }

        {
            let tx = tester
                .create_transaction(100, 10, peer_public_key)
                .await
                .unwrap();
            tester.add_transaction(tx).await;
        }

        tester.wait_till_block_id(101).await.unwrap();

        tester
            .wait_till_block_id_with_txs(105, 10, 0)
            .await
            .unwrap();

        {
            let block_id = 101;
            let fork_id = tester.get_fork_id(block_id).await;
            let blockchain = tester.routing_thread.blockchain_lock.read().await;
            let ghost_chain = RoutingThread::generate_ghost_chain(
                block_id,
                fork_id,
                &blockchain,
                vec![peer_public_key],
                &tester.routing_thread.storage,
            )
            .await;

            assert_eq!(ghost_chain.block_ids.len(), 5);
            assert_eq!(ghost_chain.block_ts.len(), 5);
            assert_eq!(ghost_chain.gts.len(), 5);
            assert_eq!(ghost_chain.prehashes.len(), 5);
            assert_eq!(ghost_chain.previous_block_hashes.len(), 5);
            assert_eq!(ghost_chain.txs.iter().filter(|x| **x).count(), 1);
        }
    }
}
