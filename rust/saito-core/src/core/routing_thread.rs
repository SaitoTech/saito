use super::stat_thread::StatEvent;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::wallet::Wallet;
use crate::core::consensus_thread::ConsensusEvent;
use crate::core::defs::{
    BlockHash, BlockId, PrintForLog, SaitoHash, SaitoPublicKey, StatVariable, Timestamp,
    CHANNEL_SAFE_BUFFER, STAT_BIN_COUNT,
};
use crate::core::mining_thread::MiningEvent;
use crate::core::msg::block_request::BlockchainRequest;
use crate::core::msg::ghost_chain_sync::GhostChainSync;
use crate::core::msg::handshake::HandshakeResponse;
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::process::process_event::ProcessEvent;
use crate::core::routing::blockchain_sync_state::BlockchainSyncState;
use crate::core::routing::io::interface_io::InterfaceEvent;
use crate::core::routing::io::network::Network;
use crate::core::routing::io::network_event::NetworkEvent;
use crate::core::routing::io::storage::Storage;
use crate::core::routing::peers::congestion_controller::{
    CongestionStatsDisplay, CongestionType, PeerCongestionControls,
};
use crate::core::routing::peers::network_peer::NetworkPeer;
use crate::core::routing::peers::peer::{Peer, PeerStatus};
use crate::core::util;
use crate::core::util::config_manager::ConfigManager;
use crate::core::util::configuration::{Configuration, InitialLoadingStatus};
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

const RECONNECTION_PERIOD: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;

#[derive(Debug)]
pub enum RoutingEvent {
    BlockchainUpdated(BlockHash, bool),
    BlockFetchRequest(SaitoPublicKey, BlockHash, BlockId),
    BlockchainRequest(SaitoPublicKey),
}

pub struct StaticPeer {
    pub peer_details: util::configuration::PeerConfig,
    pub public_key: u64,
}

pub struct RoutingStats {
    pub received_transactions: StatVariable,
    pub received_blocks: StatVariable,
    pub total_incoming_messages: StatVariable,
}

pub struct BlockchainSendResults {
    pub start_id: BlockId,
    pub end_id: BlockId,
    pub peer_idx: SaitoPublicKey,
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
    pub message_sending_timer: Timestamp,
    pub last_emitted_block_fetch_count: BlockId,
    pub stats: RoutingStats,
    pub senders_to_verification: Vec<Sender<VerifyRequest>>,
    pub last_verification_thread_index: usize,
    pub stat_sender: Sender<StatEvent>,
    pub blockchain_sync_state: BlockchainSyncState,
    /// if we receive a ghost chain with a gap between our latest block id and starting block id of the received ghost chain,
    /// we emit an event and store the received chain until the user handles the event. TODO : handle this functionality after JS functions are implemented.
    pub received_ghost_chain: Option<(GhostChainSync, SaitoPublicKey)>,
    pub waiting_for_genesis_block: bool,
    pub blockchain_send_results: Vec<BlockchainSendResults>,
    pub new_peers: Vec<NetworkPeer>,
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
    async fn process_peer_message(&mut self, public_key: SaitoPublicKey, message: Message) {

	self.network
	    .update_peer_timestamp(
	        public_key,
	        self.timer.get_timestamp_in_ms(),
	    )
	    .await;

        match message {
            Message::HandshakeChallenge(_challenge) => {
                // debug!("received handshake challenge from peer : {:?}", public_key);
            }
            Message::HandshakeResponse(_response) => {
                // trace!("received handshake response from peer : {:?}", public_key);
            }
            Message::Transaction(mut transaction) => {
                trace!(
                    "received transaction : {} from peer : {:?}",
                    transaction.signature.to_hex(),
                    public_key.to_base58()
                );
                transaction.routed_from_peer = Some(public_key);
		self.network
    			.record_received_transaction(
    			    public_key,
    			    &transaction,
    			    self.timer.get_timestamp_in_ms(),
    			)
			.await;
                self.stats.received_transactions.increment();
                self.send_to_verification_thread(VerifyRequest::Transaction(transaction))
                    .await;
            }
            Message::BlockchainRequest(request) => {
                trace!(
                    "received blockchain request from peer : {:?} with block id : {:?} and hash : {:?}",
                    public_key.to_base58(),
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
		if let Err(e) = self
		    .process_incoming_blockchain_request(request, public_key)
		    .await
		{
		    error!(
		        "failed processing incoming blockchain request from peer {}: {}",
		        public_key.to_base58(),
		        e
		    );
		}
            }
            Message::BlockHeaderHash(hash, block_id) => {
                if self.waiting_for_genesis_block {
                    info!("Won't process received block header : {:?}-{:?} since we are waiting for a genesis block",block_id, hash.to_hex());
                    // since we request the blockchain anyway, we don't have to keep this received header in memory
                    return;
                }
                debug!(
                    "received block header hash from peer : {:?} with block id : {:?} and hash : {:?}",
                    public_key.to_base58(),
                    block_id,
                    hash.to_hex()
                );
		self.network
		    .record_received_block_header(
		        public_key,
		        &hash,
		        self.timer.get_timestamp_in_ms(),
		    )
		    .await;
                self.process_incoming_block_hash(hash, block_id, public_key)
                    .await;
            }
            Message::Ping() => {
                trace!("received ping from peer : {:?}", public_key.to_base58());
		self.network
		    .send_message(public_key, Message::Pong())
		    .await;
            }
            Message::Pong() => {
                // not processing this
            }
            Message::SPVChain() => {}
            Message::Services(services) => {
                let mut peers = self.network.peer_lock.write().await;
                peers.process_peer_services(services, public_key).await;
            }
            Message::GhostChain(chain) => {
                self.process_ghost_chain(chain, public_key).await;
            }
            Message::GhostChainRequest(block_id, block_hash, fork_id) => {
                self.process_ghost_chain_request(block_id, block_hash, fork_id, public_key)
                    .await;
            }
            Message::ApplicationMessage(api_message) => {
                trace!(
                    "processing application msg with buffer size : {:?} from peer : {:?}",
                    api_message.data.len(),
                    public_key.to_base58()
                );
                self.network
                    .io_interface
                    .process_api_call(api_message.data, api_message.msg_index, public_key)
                    .await;
            }
            Message::Result(api_message) => {
                self.network
                    .io_interface
                    .process_api_success(api_message.data, api_message.msg_index, public_key)
                    .await;
            }
            Message::Error(api_message) => {
                self.network
                    .io_interface
                    .process_api_error(api_message.data, api_message.msg_index, public_key)
                    .await;
            }
            Message::KeyListUpdate(key_list) => {
                // Lock peers to write
                let mut peers = self.network.peer_lock.write().await;
		if let Err(e) = peers
		    .handle_received_key_list(
		        public_key,
		        key_list,
		        self.timer.get_timestamp_in_ms(),
		    )
		    .await
		{
		    error!("Received key list error: {:?}", e);
		}
            }
            Message::Block(_) => {
                error!("received block message");
                unreachable!();
            }
            Message::GenesisBlockRequest() => {
                let blockchain = self.blockchain_lock.read().await;
                info!(
                    "Received genesis block request from peer : {:?}. current genesis block id : {:?}",
                    public_key.to_base58(),
                    blockchain.genesis_block_id
                );
                if blockchain.genesis_block_id != 0 {
                    if let Some(genesis_block_hash) = blockchain
                        .blockring
                        .get_longest_chain_block_hash_at_block_id(blockchain.genesis_block_id)
                    {
			self.network
			    .send_message(
			        public_key,
			        Message::GenesisBlockHeader(
			            genesis_block_hash,
			            blockchain.genesis_block_id,
			        ),
			    )
			    .await;
		    }
                } else {
                    warn!(
                        "We don't have a genesis block id set to alert the peer : {:?}",
                        public_key.to_base58()
                    );
                }
            }
            Message::GenesisBlockHeader(hash, block_id) => {
                info!(
                    "Received genesis block header : {:?}-{:?} from peer : {:?}",
                    block_id,
                    hash.to_hex(),
                    public_key.to_base58(),
                );
		self.network
		    .record_received_block_header(
		        public_key,
		        &hash,
		        self.timer.get_timestamp_in_ms(),
		    )
		    .await;
                self.process_incoming_block_hash(hash, block_id, public_key)
                    .await;
            }
            Message::ForcedDisconnection(message) => {
                warn!(
                    "Received forced disconnection message: {:?}. from peer : {}",
                    message,
                    public_key.to_base58()
                );
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
    /// * `public_key`:
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
        public_key: SaitoPublicKey,
    ) {
        debug!("processing ghost chain request from peer : {:?}. block_id : {:?} block_hash: {:?} fork_id: {:?}",
            public_key.to_base58(),
            block_id,
            block_hash.to_hex(),
            fork_id.to_hex()
        );
        let blockchain = self.blockchain_lock.read().await;

	let peer_key_list = match self.network.get_peer_key_list(public_key).await {
	    Some(keys) => keys,
	    None => {
	        warn!(
	            "couldn't find peer : {:?} for processing ghost chain request",
	            public_key.to_base58()
	        );
	        return;
	    }
	};

        debug!(
            "peer key list: {:?}",
            peer_key_list
                .iter()
                .map(|pk| pk.to_base58())
                .collect::<Vec<String>>()
        );

        let ghost = Self::generate_ghost_chain(block_id, fork_id, &blockchain, peer_key_list).await;
        debug!("sending ghost chain to peer : {:?}", public_key.to_base58());
	self.network
	    .send_message(public_key, Message::GhostChain(ghost))
	    .await;
    }

    pub(crate) async fn generate_ghost_chain(
        block_id: u64,
        fork_id: SaitoHash,
        blockchain: &Blockchain,
        peer_key_list: Vec<SaitoPublicKey>,
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

        //
        // DEBUGGING - to test server load stability, we restrict temporarily to processing
        // only the sender's actual key. This can be relaxed once we no longer need to run
        // saito node on a single server with throttled network throughput limits.
        //
        let sender_only_key_list: Vec<SaitoPublicKey> =
            peer_key_list.iter().take(1).cloned().collect();

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
                    ghost.txs.push(block.has_keylist_txs(&sender_only_key_list));
                    //
                    // note the above -- we we temporarily processing only the key of the peer itself
                    //
                    //ghost.txs.push(block.has_keylist_txs(&peer_key_list));
                }
            }
        }
        ghost
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
            self.send_key_list(&wallet.key_list).await;
        }
    }

    pub async fn process_incoming_blockchain_request(
        &mut self,
        request: BlockchainRequest,
        public_key: SaitoPublicKey,
    ) -> Result<(), Error> {
        info!(
            "processing incoming blockchain request : {:?}-{:?}-{:?} from peer : {:?}",
            request.latest_block_id,
            request.latest_block_hash.to_hex(),
            request.fork_id.to_hex(),
            public_key.to_base58()
        );
        // TODO : can we ignore the functionality if it's a lite node ?

        let blockchain = self.blockchain_lock.read().await;

        {
            let mut peers = self.network.peer_lock.write().await;
            if let Some(peer) = peers.peers.get_mut(&public_key) {
                if peer.requested_blockchain_from_us {
                    info!("peer : {:?} already requested the blockchain from us once. Not processing this request again until a reconnection", public_key.to_base58());
                    return Ok(());
                }
                peer.requested_blockchain_from_us = true;
            } else {
                error!(
                    "Cannot find the peer : {} to process the incoming blockchain request",
                    public_key.to_base58()
                );

		if let Err(e) = self
		    .network
		    .disconnect_from_peer(public_key, "cannot find peer details")
		    .await
		{
		    error!(
		        "error disconnecting from peer : {}. {}",
		        public_key.to_base58(),
		        e
		    );
		}

            }
        }

        let mut last_shared_ancestor =
            blockchain.generate_last_shared_ancestor(request.latest_block_id, request.fork_id);

        debug!(
            "last shared ancestor = {:?} latest_id = {:?}",
            last_shared_ancestor,
            blockchain.blockring.get_latest_block_id()
        );

        debug!("peer : {:?} has latest block : {}-{}. our latest block : {}-{}. last shared ancestor = {:?}. genesis_id : {}",
                public_key.to_base58(),
                request.latest_block_id,
                request.latest_block_hash.to_hex(),
                blockchain.get_latest_block_id(),
                blockchain.get_latest_block_hash().to_hex(),
                last_shared_ancestor,
                blockchain.genesis_block_id
        );

        if request.latest_block_id > 0
            // adding a 1000 block buffer to cater for when the node moves after sending the genesis block
            && request.latest_block_id < blockchain.genesis_block_id.saturating_sub(100)
            && (last_shared_ancestor == 0 || last_shared_ancestor < blockchain.genesis_block_id)
            && blockchain.get_latest_block_id() > 0
        {
            info!("peer : {:?} has latest block : {}-{}. our latest block : {}-{}. cannot find a shared ancestor. Therefore disconnecting the peer",
                public_key.to_base58(),
                request.latest_block_id,
                request.latest_block_hash.to_hex(),
                blockchain.get_latest_block_id(),
                blockchain.get_latest_block_hash().to_hex());
            {
                if let Some(peer) = self
                    .network
                    .peer_lock
                    .write()
                    .await
                    .peers
                    .get_mut(&public_key)
                {
                    peer.url = None;
                }
            }

	    if let Err(e) = self
		.network
    		.disconnect_from_peer(
    		    public_key,
    		    "Cannot find a shared ancestor block to sync 2 nodes",
    		)
    		.await
		{
		    error!(
		        "error disconnecting from peer : {}. {}",
		        public_key.to_base58(),
		        e
		    );
		}


            return Ok(());
        }

        if last_shared_ancestor == 0 {
            debug!(
                "since last shared ancestor = {:?} we set it to genesis block id : {}",
                last_shared_ancestor, blockchain.genesis_block_id
            );
            last_shared_ancestor = blockchain.genesis_block_id;
        }

        // TODO : this should be handled as a separate task which can be completed over multiple iterations to reduce the impact for single threaded operations
        // and preventing against DOS attacks
        info!(
            "queueing {} block headers to be sent to peer : {}. from : {} to : {}",
            blockchain.blockring.get_latest_block_id() + 1 - last_shared_ancestor,
            public_key.to_base58(),
            last_shared_ancestor,
            blockchain.blockring.get_latest_block_id()
        );
        if !self
            .blockchain_send_results
            .iter()
            .any(|r| r.peer_idx == public_key)
        {
            self.blockchain_send_results.push(BlockchainSendResults {
                start_id: last_shared_ancestor,
                end_id: blockchain.blockring.get_latest_block_id() + 1,
                peer_idx: public_key,
            });
        }
        info!("queued block headers for peer : {}", public_key.to_base58());
        Ok(())
    }
    async fn process_incoming_block_hash(
        &mut self,
        block_hash: SaitoHash,
        block_id: u64,
        public_key: SaitoPublicKey,
    ) {
        debug!(
            "processing incoming block hash : {:?}-{:?} from peer : {:?}",
            block_id,
            block_hash.to_hex(),
            public_key.to_base58()
        );
        {
            // trace!("locking blockchain 6");
            let blockchain = self.blockchain_lock.read().await;
            if !blockchain.blocks.is_empty() && blockchain.lowest_acceptable_block_id >= block_id {
                debug!("skipping block header : {:?}-{:?} from peer : {:?} since our lowest acceptable id : {:?}",
                    block_id,
                    block_hash.to_hex(),
                    public_key.to_base58(),
                    blockchain.lowest_acceptable_block_id);
                return;
            }
            if block_id < max(1, blockchain.genesis_block_id) {
                debug!("skipping block header : {:?}-{:?} from peer : {:?} since it's earlier than our genesis block id : {}",
                    block_id,
                    block_hash.to_hex(),
                    public_key.to_base58(),
                    blockchain.genesis_block_id);
                return;
            }
        }
        // trace!("releasing blockchain 6");

	let wallet = self.wallet_lock.read().await;
	let wallet_version = wallet.wallet_version;
	let core_version = wallet.core_version;
	drop(wallet);

	match self
	    .network
	    .should_request_blockchain(
  	        public_key,
    		wallet_version,
    		core_version,
	    )
	    .await
	{
	    Some(true) => {
		self.request_blockchain_from_peer(
		    public_key,
		    self.blockchain_lock.clone(),
		)
		.await;
	    }
	    Some(false) => {}
	    None => {
	        warn!(
	            "couldn't find peer : {:?} for processing block header hash",
	            public_key.to_base58()
	        );
	    }
	}

        self.blockchain_sync_state
            .add_entry(
                block_hash,
                block_id,
                public_key,
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

        let mut fetched_blocks: Vec<(SaitoPublicKey, SaitoHash)> = Default::default();
        for (public_key, vec) in map {
            for (hash, block_id) in vec.iter().rev() {
                work_done = true;
                let result = self
                    .process_incoming_block_hash_(
                        *hash,
                        *block_id,
                        public_key,
                        self.blockchain_lock.clone(),
                        self.mempool_lock.clone(),
                    )
                    .await;
                if result.is_some() {
                    fetched_blocks.push((public_key, *hash));
                } else {
                    // if we already have the block added don't need to request it from peer
                    self.blockchain_sync_state.remove_entry(*hash);
                }
            }
        }
        work_done
    }
    pub async fn process_incoming_block_hash_(
        &mut self,
        block_hash: SaitoHash,
        block_id: BlockId,
        public_key: SaitoPublicKey,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
    ) -> Option<()> {
        trace!(
            "fetching block : {:?}-{:?} from peer : {:?}",
            block_id,
            block_hash.to_hex(),
            public_key.to_base58()
        );
        let block_exists;
        let my_public_key;

        {
            // trace!("locking blockchain 2");
            let blockchain = blockchain_lock.read().await;
            if blockchain.is_block_indexed(block_hash) {
                block_exists = true;
            } else {
                let mempool = mempool_lock.read().await;
                block_exists = mempool.blocks_queue.iter().any(|b| b.hash == block_hash);
            }
        }
        // trace!("releasing blockchain 2");
        {
            let wallet = self.wallet_lock.read().await;
            my_public_key = wallet.public_key;
        }
        if block_exists {
            debug!(
                "block : {:?}-{:?} already exists in chain. not fetching",
                block_id,
                block_hash.to_hex()
            );
            return None;
        }
        let url;
        {
            let configs = self.config_lock.read().await;
            let peers = self.network.peer_lock.read().await;

            if let Some(peer) = peers.peers.get(&public_key) {
                if peer.block_fetch_url.is_empty() {
                    debug!(
                        "won't fetch block : {:?} from peer : {:?} since no url found",
                        block_hash.to_hex(),
                        public_key.to_base58()
                    );
                    return None;
                }
                url = peer.get_block_fetch_url(block_hash, configs.is_spv_mode(), my_public_key);
            } else {
                warn!(
                    "peer : {:?} is not in peer list. cannot generate the block fetch url",
                    public_key.to_base58()
                );
                return None;
            }
        }

        debug!(
            "fetching block for incoming hash : {:?}-{:?}",
            block_id,
            block_hash.to_hex()
        );

        if self
            .network
            .io_interface
            .fetch_block_from_peer(block_hash, public_key, url.as_str(), block_id)
            .await
            .is_err()
        {
            // failed fetching block from peer
            warn!(
                "failed fetching block : {:?} for block hash. so unmarking block as fetching",
                block_hash.to_hex()
            );
        }
        Some(())
    }

    pub async fn request_blockchain_from_peer(
        &self,
        public_key: SaitoPublicKey,
        blockchain_lock: Arc<RwLock<Blockchain>>,
    ) {
        let configs = self.config_lock.read().await;
        let blockchain = blockchain_lock.read().await;
        {
            let mut peers = self.network.peer_lock.write().await;
            if let Some(peer) = peers.peers.get_mut(&public_key) {
                if peer.requested_blockchain_from_peer {
                    info!("we already requested blockchain from peer : {}. so not requesting again until a reconnection",public_key.to_base58());
                    return;
                }
                peer.requested_blockchain_from_peer = true;
            } else {
                warn!(
                    "Cannot request blockchain from non existent peer : {}",
                    public_key.to_base58()
                );
            }
        }

        info!(
            "requesting blockchain from peer : {:?} latest_block_id : {:?}, last_block_id : {:?}",
            public_key.to_base58(),
            blockchain.get_latest_block_id(),
            blockchain.last_block_id,
        );

        let request;

        if configs.is_spv_mode() {
            {
                debug!(
                    "blockchain last block id : {:?}, latest block id : {:?}",
                    blockchain.last_block_id,
                    blockchain.get_latest_block_id()
                );
                if blockchain.last_block_id >= blockchain.get_latest_block_id() {
                    let fork_id = blockchain.fork_id.unwrap_or([0; 32]);
                    debug!(
                        "blockchain request 1 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                        blockchain.last_block_id,
                        blockchain.last_block_hash.to_hex(),
                        fork_id.to_hex()
                    );
                    request = BlockchainRequest {
                        latest_block_id: blockchain.last_block_id,
                        latest_block_hash: blockchain.last_block_hash,
                        fork_id,
                    };
                } else if let Some(fork_id) =
                    blockchain.generate_fork_id(blockchain.get_latest_block_id())
                {
                    debug!(
                        "blockchain request 2 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                        blockchain.get_latest_block_id(),
                        blockchain.get_latest_block_hash().to_hex(),
                        fork_id.to_hex()
                    );
                    request = BlockchainRequest {
                        latest_block_id: blockchain.get_latest_block_id(),
                        latest_block_hash: blockchain.get_latest_block_hash(),
                        fork_id,
                    };
                } else {
                    debug!(
                        "blockchain request 3 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                        blockchain.get_latest_block_id(),
                        blockchain.get_latest_block_hash().to_hex(),
                        [0; 32]
                    );
                    request = BlockchainRequest {
                        latest_block_id: blockchain.get_latest_block_id(),
                        latest_block_hash: blockchain.get_latest_block_hash(),
                        fork_id: [0; 32],
                    };
                }
            }
            debug!(
                "sending ghost chain request to peer : {:?}",
                public_key.to_base58()
            );
        } else {
            if let Some(fork_id) = blockchain.generate_fork_id(blockchain.get_latest_block_id()) {
                request = BlockchainRequest {
                    latest_block_id: blockchain.get_latest_block_id(),
                    latest_block_hash: blockchain.get_latest_block_hash(),
                    fork_id,
                };
                debug!(
                    "blockchain request 4 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                    blockchain.get_latest_block_id(),
                    blockchain.get_latest_block_hash().to_hex(),
                    fork_id.to_hex()
                );
            } else {
                request = BlockchainRequest {
                    latest_block_id: blockchain.get_latest_block_id(),
                    latest_block_hash: blockchain.get_latest_block_hash(),
                    fork_id: [0; 32],
                };
                debug!(
                    "blockchain request 5 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                    blockchain.get_latest_block_id(),
                    blockchain.get_latest_block_hash().to_hex(),
                    [0; 32]
                );
            }
            debug!(
                "sending blockchain request to peer : {:?}",
                public_key.to_base58()
            );
        }
        // need to drop the reference here to avoid deadlocks.

	let is_spv_mode = configs.is_spv_mode();

        // we need blockchain lock till here to avoid integrity issues
        drop(blockchain);
        drop(configs);
        // trace!("releasing blockchain 1");

	self.network
	    .send_message(
	        public_key,
	        if is_spv_mode {
	            Message::GhostChainRequest(
	                request.latest_block_id,
	                request.latest_block_hash,
	                request.fork_id,
	            )
	        } else {
	            Message::BlockchainRequest(request)
	        },
	    )
	    .await;

        trace!(
            "blockchain request sent to peer : {:?}",
            public_key.to_base58()
        );
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
            let peers = self.network.peer_lock.read().await;
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
            self.network
                .io_interface
                .send_message_to_all(
                    Message::KeyListUpdate(key_list.to_vec())
                        .serialize()
                        .as_slice(),
                    exclusions,
                )
                .await
                .unwrap();
        }
    }

    pub async fn handle_handshake_response(
        &mut self,
        public_key: SaitoPublicKey,
        response: HandshakeResponse,
        _wallet_lock: Arc<RwLock<Wallet>>,
        _blockchain_lock: Arc<RwLock<Blockchain>>,
        _configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        let mut peers = self.network.peer_lock.write().await;
        // let public_key;
        let current_time = self.timer.get_timestamp_in_ms();
        let _endpoint = response.endpoint.clone();

        // we need to make sure there isn't a peer with the same public key currently connected
        for (_, peer) in peers.peers.iter_mut() {
            let key = &peer.get_public_key();
            if response.public_key == *key {
                if let PeerStatus::Connected = peer.peer_status {
                    info!(
                        "already connected to peer : {}. not handling the handshake response",
                        key.to_base58()
                    );
                    // we disconnect here. should not impact the other peer since it also sees an established connection to us.
                    // self.io_interface
                    //     .disconnect_from_peer(public_key)
                    //     .await
                    //     .unwrap();
                    peers.print_current_peers();
                    return;
                }
            }
        }

        peers.print_current_peers();

        peers.add_congestion_event(
            public_key,
            CongestionType::CompletedHandshakes,
            current_time,
        );
        drop(peers);
        self.network
            .io_interface
            .send_interface_event(InterfaceEvent::PeerConnected(public_key));
    }

    async fn send_to_verification_thread(&mut self, request: VerifyRequest) {
        // waiting till we get an acceptable sender
        let sender_count = self.senders_to_verification.len();
        if sender_count == 0 {
            error!("no verification-thread senders configured; dropping request");
            return;
        }
        let mut trials = 0;
        loop {
            trials += 1;
            self.last_verification_thread_index += 1;
            let sender_index: usize = self.last_verification_thread_index % sender_count;
            let Some(sender) = self.senders_to_verification.get(sender_index) else {
                error!(
                    "verification-thread sender index {} missing out of {} senders; dropping request",
                    sender_index, sender_count
                );
                return;
            };

            if sender.capacity() > 0 {
                trace!("sending to verification thread : {:?}", sender_index);
                if let Err(err) = sender.send(request).await {
                    error!(
                        "failed sending request to verification thread {}: {:?}",
                        sender_index, err
                    );
                }

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
    pub async fn process_ghost_chain(&mut self, chain: GhostChainSync, public_key: SaitoPublicKey) {
        debug!(
            "processing ghost chain from peer : {:?}",
            public_key.to_base58()
        );

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
                    public_key.to_base58()
                );
                self.blockchain_sync_state
                    .add_entry(
                        block_hash,
                        chain.block_ids[i],
                        public_key,
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

        if !need_blocks_fetched {
            configs.get_blockchain_configs_mut().initial_loading_status =
                InitialLoadingStatus::Completed;
        }
    }


    async fn send_block_headers(&mut self) {
        if self.blockchain_send_results.is_empty() {
            return;
        }
        let blockchain = self.blockchain_lock.read().await;
        for entry in self.blockchain_send_results.iter_mut() {
            let start = entry.start_id;
            let end = std::cmp::min(entry.end_id, entry.start_id + 100); // sending max 100 block headers at a time to avoid congestion
            entry.start_id = end + 1;
            for block_id in start..=end {
                if let Some(block_hash) = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(block_id)
                {
		    self.network
		        .send_message(
    			    entry.peer_idx,
    			    Message::BlockHeaderHash(block_hash, block_id),
    			)
    			.await;
                }
            }
        }
        self.blockchain_send_results
            .retain(|entry| entry.start_id <= entry.end_id);
    }
    pub async fn initialize_static_peers(
        &mut self,
        configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        let configs = configs_lock.read().await;

        for peer in configs.get_peer_configs().iter() {
            let peer_url = peer.get_url();
            if let Err(err) = self
                .network
                .io_interface
                .connect_to_peer(peer_url.clone())
                .await
            {
                error!(
                    "failed connecting to configured peer {:?}: {:?}",
                    peer_url, err
                );
            }
        }

        // let mut peers = self.network.peer_lock.write().await;
        // peers.initialize_static_peers(configs.deref()).await;
    }

    async fn handle_new_peer(&mut self, network_peer: NetworkPeer) -> Option<()> {
        let time = self.timer.get_timestamp_in_ms();
        let is_browser = {
            let configs = self.config_lock.read().await;
            configs.is_browser()
        };

        let public_key = match network_peer.public_key {
            Some(k) => k,
            None => {
                warn!("handle_new_peer: received peer with no public key (incomplete handshake); dropping");
                return None;
            }
        };

        {
            let mut peers = self.network.peer_lock.write().await;
            if peers.is_peer_blacklisted(public_key, time) {
                warn!(
                    "peer : {:?} is blacklisted. not connecting to it. ip : {:?}",
                    public_key.to_base58(),
                    network_peer.ip.as_deref().unwrap_or("unknown")
                );
                return Some(());
            }
            let mut peer = Peer::new(public_key);
            // peer.ip_address = network_peer.ip;
	    if let Err(err) = peer
	        .handle_new_peer(
    		    network_peer,
        	    self.wallet_lock.clone(),
        	    &self.network.io_interface,
        	    self.timer.get_timestamp_in_ms(),
    	   	)
    		.await
	    {
    		error!(
    		    "failed finalizing newly connected peer {:?}: {:?}",
    		    public_key.to_base58(),
    		    err
    		);
    		return None;
	    }
            peers.add_congestion_event(peer.public_key, CongestionType::PeerConnections, time);
            info!("adding new peer : {}", peer.public_key.to_base58());
            peers.peers.insert(peer.public_key, peer);
        }

        let blockchain = self.blockchain_lock.read().await;
        if blockchain.get_latest_block().is_none() && !is_browser {
            // we don't have any blocks in the blockchain yet. so we need to get the genesis block from this peer
            info!(
                "requesting genesis block from peer : {:?}",
                public_key.to_base58()
            );
	    self.network
	        .send_message(public_key, Message::GenesisBlockRequest())
	        .await;
            self.waiting_for_genesis_block = true;
        } else {
            drop(blockchain);
            info!(
                "requesting blockchain from peer : {:?} after handshake",
                public_key.to_base58()
            );
            // start block syncing here
            self.request_blockchain_from_peer(public_key, self.blockchain_lock.clone())
                .await;
        }

        return Some(());
    }
}

#[async_trait]
impl ProcessEvent<RoutingEvent> for RoutingThread {
    async fn process_network_event(&mut self, event: NetworkEvent) -> Option<()> {
        match event {
            NetworkEvent::IncomingNetworkMessage { public_key, buffer } => {
                trace!(
                    "processing incoming network message from peer : {:?} of size : {}",
                    public_key.to_base58(),
                    buffer.len()
                );
                {
                    // TODO : move this before deserialization to avoid spending CPU time on it. moved here to just print message type
                    let mut peers = self.network.peer_lock.write().await;
                    let time: u64 = self.timer.get_timestamp_in_ms();
                    peers.add_congestion_event(public_key, CongestionType::IncomingMessages, time);
                }
                let buffer_len = buffer.len();
                let message = match Message::deserialize(buffer) {
                    Ok(message) => message,
                    Err(err) => {
                        error!(
                            "failed deserializing msg from peer : {:?} with buffer size : {:?}. Check for any version mismatches or data corruptions",
                            public_key.to_base58(), buffer_len
                        );
                        error!(
                            "deserialization error from peer {:?}: {:?}",
                            public_key.to_base58(),
                            err
                        );
                        // NOTE : not disconnecting here to support newer npm versions having new types of messages
                        return None;
                    }
                };

                self.stats.total_incoming_messages.increment();
                self.process_peer_message(public_key, message).await;
                return Some(());
            }
            NetworkEvent::PeerConnectionResult { result } => match result {
                Ok(network_peer) => {
                    info!(
                        "adding new peer : {} to be processed",
                        network_peer.public_key.unwrap_or([0; 33]).to_base58()
                    );
                    self.new_peers.push(network_peer);
                }
                Err(err) => {
                    warn!("peer connection result returned error: {:?}", err);
                }
            },
            NetworkEvent::AddStunPeer { public_key } => {
                debug!(
                    "Adding STUN peer with public key: {}",
                    public_key.to_base58()
                );
                let mut peers = self.network.peer_lock.write().await;
                peers
                    .handle_new_stun_peer(
                        public_key,
                        self.timer.get_timestamp_in_ms(),
                        &self.network.io_interface,
                    )
                    .await;
                return Some(());
            }
            NetworkEvent::RemoveStunPeer { public_key } => {
                let mut peers = self.network.peer_lock.write().await;
                peers
                    .remove_stun_peer(public_key, &self.network.io_interface)
                    .await;
                return Some(());
            }
            NetworkEvent::PeerDisconnected {
                public_key,
                disconnect_type,
            } => {
                self
		    .network
		    .handle_peer_disconnect(public_key, disconnect_type)
                    .await;
                return Some(());
            }
            NetworkEvent::BlockFetched {
                block_hash,
                block_id,
                public_key,
                buffer,
            } => {
                debug!("block received : {:?}", block_hash.to_hex());

                self.send_to_verification_thread(VerifyRequest::Block(
                    buffer, public_key, block_hash, block_id,
                ))
                .await;

                self.blockchain_sync_state.mark_as_fetched(block_hash);

                // self.fetch_next_blocks().await;

                return Some(());
            }
            NetworkEvent::BlockFetchFailed {
                block_hash,
                public_key,
                block_id,
            } => {
                debug!(
                    "block fetch failed : {:?}-{:?}",
                    block_id,
                    block_hash.to_hex()
                );

                {
                    let mut peers = self.network.peer_lock.write().await;
                    let time = self.timer.get_timestamp_in_ms();
                    peers.add_congestion_event(
                        public_key,
                        CongestionType::FailedBlockFetches,
                        time,
                    );
                }

                self.blockchain_sync_state
                    .mark_as_failed(block_id, block_hash, public_key);
            }
            _ => unreachable!(),
        }
        // debug!("network event processed");
        None
    }

    async fn process_timer_event(&mut self, duration: Duration) -> Option<()> {
        // trace!("processing timer event : {:?}", duration.as_micros());

        let duration_value: Timestamp = duration.as_millis() as Timestamp;

        let mut work_done = false;

        {
            let peers = self.new_peers.drain(..).collect::<Vec<_>>();
            for peer in peers {
                let _ = self.handle_new_peer(peer).await;
            }
        }

        self.reconnection_timer = self.reconnection_timer.saturating_add(duration_value);

        let current_time = self.timer.get_timestamp_in_ms();
        if self.reconnection_timer >= RECONNECTION_PERIOD {
            self.network.connect_to_static_peers(current_time).await;
            self.network.ping().await;
            self.reconnection_timer = 0;
            self.fetch_next_blocks().await;

            work_done = true;
        }

        const MESSAGES_SENDING_PERIOD: Timestamp = Duration::from_secs(1).as_millis() as Timestamp;
        self.message_sending_timer += duration_value;
        if self.message_sending_timer >= MESSAGES_SENDING_PERIOD {
            self.message_sending_timer = 0;
            self.send_block_headers().await;

            work_done = true;
        }

        const CONGESTION_CHECK_PERIOD: Timestamp = Duration::from_secs(10).as_millis() as Timestamp;
        self.congestion_check_timer += duration_value;
        if self.congestion_check_timer >= CONGESTION_CHECK_PERIOD {
            self.network.manage_congested_peers().await;
            {
                let wallet = self.wallet_lock.read().await;
                self.send_key_list(&wallet.key_list).await;
            }
            let mut configs = self.config_lock.write().await;
            if !configs.is_browser() {
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
            }
            ConfigManager::write_confirmation_data(
                configs.get_blockchain_configs().confirmations.as_ref(),
                self.network.io_interface.deref(),
            )
            .await
            .unwrap_or_else(|e| {
                error!("failed to write confirmation data : {:?}", e);
            });
            self.congestion_check_timer = 0;
            work_done = true;
        }

        const PEER_REMOVAL_TIMER_PERIOD: Timestamp =
            Duration::from_secs(5).as_millis() as Timestamp;
        self.peer_removal_timer += duration_value;
        if self.peer_removal_timer >= PEER_REMOVAL_TIMER_PERIOD {
            self.peer_removal_timer = 0;
            let mut peers = self.network.peer_lock.write().await;

            peers
                .disconnect_stale_peers(current_time, self.network.io_interface.deref())
                .await;
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
                    let confs = {
                        let blockchain_configs = configs.get_blockchain_configs_mut();

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
                        blockchain_configs.fork_id =
                            blockchain.fork_id.unwrap_or_default().to_hex();

                        let confs = blockchain_configs.confirmations.clone();
                        blockchain_configs.confirmations.clear();
                        confs
                    };

                    let save_result = configs.save();

                    let blockchain_configs = configs.get_blockchain_configs_mut();
                    blockchain_configs.confirmations = confs;
                    if let Err(err) = save_result {
                        error!("failed saving blockchain configs after update: {:?}", err);
                    }
                }
                if initial_sync {
                    {
                        let configs = self.config_lock.read().await;
                        let mut blockchain = self.blockchain_lock.write().await;

                        let block_id = max(
                            blockchain.get_latest_block_id().saturating_sub(
                                configs.get_consensus_config().unwrap().genesis_period,
                            ),
                            1,
                        );
                        blockchain.genesis_block_id = block_id;
                        info!(
                            "setting genesis block id to the received genesis block id : {}",
                            blockchain.genesis_block_id
                        );
                    }

                    // we set this to false here since now we know the genesis block is added already.
                    self.waiting_for_genesis_block = false;

                    info!("since initial sync is done, we will request the chain from peers");
                    // since we added the initial block, we will request the rest of the blocks from peers
                    // FIXME : This could cause a performance issue if we have many peers sending a lot of block headers to us which we cannot process fast enough
                    let mut peer_list = vec![];
                    {
                        let peers = self.network.peer_lock.read().await;
                        for (public_key, peer) in &peers.peers {
                            if let PeerStatus::Connected = peer.peer_status {
                                peer_list.push(*public_key);
                            }
                        }
                    }
                    for public_key in &peer_list {
                        self.request_blockchain_from_peer(
                            *public_key,
                            self.blockchain_lock.clone(),
                        )
                        .await;
                    }
                }
            }

            RoutingEvent::BlockFetchRequest(public_key, block_hash, block_id) => {
                trace!(
                    "
                    received block fetch request from peer : {:?} for block : {:?}-{:?}",
                    public_key,
                    block_hash.to_hex(),
                    block_id
                );
                self.blockchain_sync_state
                    .add_entry(
                        block_hash,
                        block_id,
                        public_key,
                        self.network.peer_lock.clone(),
                    )
                    .await;
            }
            RoutingEvent::BlockchainRequest(public_key) => {
                info!(
                    "requesting blockchain from peer : {:?} after block add failure",
                    public_key
                );
                self.request_blockchain_from_peer(public_key, self.blockchain_lock.clone())
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
            let mut peers = self.network.peer_lock.write().await;
            configs.set_congestion_data(congestion_data);

            if let Some(display) = configs.get_congestion_data() {
                peers.congestion_controls_by_ip = display.congestion_controls_by_ip.clone();
                peers.congestion_controls_by_key = display
                    .congestion_controls_by_key
                    .iter()
                    .filter_map(
                        |(key, value)| match SaitoPublicKey::from_base58(key.as_str()) {
                            Ok(public_key) => Some((public_key, value.clone())),
                            Err(err) => {
                                error!(
                                    "ignoring malformed public key in congestion data: {:?} ({:?})",
                                    key, err
                                );
                                None
                            }
                        },
                    )
                    .collect::<HashMap<SaitoPublicKey, PeerCongestionControls>>();
            }
            if let Some(confirmation_data) = confirmation_data {
                configs.get_blockchain_configs_mut().confirmations = confirmation_data;
            }
        }

        // connect to peers
        self.initialize_static_peers(self.config_lock.clone()).await;
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

        let _peers = self.network.peer_lock.read().await;
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
    use crate::core::consensus::transaction::Transaction;
    use crate::core::defs::Timestamp;
    use crate::core::defs::NOLAN_PER_SAITO;
    use crate::core::defs::SaitoPublicKey;
    use crate::core::process::process_event::ProcessEvent;
    use crate::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};
    use crate::core::routing::io::network::PeerDisconnectType;
    use crate::core::routing::io::network_event::NetworkEvent;
    use crate::core::routing::peers::congestion_controller::{
        CongestionStatsDisplay, PeerCongestionControls,
    };
    use crate::core::routing::peers::network_peer::NetworkPeer;
    use crate::core::routing::peers::peer::{Peer, PeerStatus};
    use crate::core::routing_thread::RoutingThread;
    use crate::core::util::config_manager::CONGESTION_CONFIG_PATH;
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
        async fn send_message(&self, _public_key: [u8; 33], _buffer: &[u8]) -> Result<(), Error> {
            Ok(())
        }

	async fn disconnect_from_peer(&self, _public_key: SaitoPublicKey) -> Result<(), Error> {
	    Ok(())
	}

        async fn send_message_to_all(
            &self,
            _buffer: &[u8],
            _excluded_peers: Vec<[u8; 33]>,
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
            _public_key: [u8; 33],
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

        async fn process_api_call(&self, _buffer: Vec<u8>, _msg_index: u32, _public_key: [u8; 33]) {
        }

        async fn process_api_success(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: [u8; 33],
        ) {
        }

        async fn process_api_error(
            &self,
            _buffer: Vec<u8>,
            _msg_index: u32,
            _public_key: [u8; 33],
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

        fn get_my_services(&self) -> Vec<crate::core::routing::peers::peer_service::PeerService> {
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

        fn get_congestion_data(&self) -> Option<&CongestionStatsDisplay> {
            None
        }

        fn set_congestion_data(&mut self, _congestion_data: Option<CongestionStatsDisplay>) {}

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

    #[tokio::test]
    #[serial_test::serial]
    #[ignore]
    async fn test_ghost_chain_common_key_marks_all_blocks_as_relevant() {
        // Regression test for Bug 2: if peer_key_list contains a key that
        // participates in the transaction slips of every block (e.g. the
        // routing node's own public key, which appears in the from/to slips
        // of every fee-bearing transaction it routes), then
        // generate_ghost_chain sets txs[i] = true for ALL those blocks.
        // A browser peer that merely watches the routing node key would then
        // fetch the entire chain instead of only the blocks that contain
        // transactions directly involving the peer.
        NodeTester::delete_data().await.unwrap();
        let unrelated_peer_key = generate_keys().0;
        let mut tester = NodeTester::new(1000, None, None);
        tester
            .init_with_staking(0, 60, 100_000 * NOLAN_PER_SAITO)
            .await
            .unwrap();

        // Produce 11 blocks each containing a transaction whose from and to
        // slips both use the node's own public key.  This guarantees the node
        // key is present in keys_invloved for every one of these blocks.
        // Note: with genesis_period=1000 and latest_block_id=11,
        // generate_ghost_chain(block_id=0) sets
        //   last_shared_ancestor = max(0, genesis_block_id=1) → 1
        // so the resulting ghost chain covers blocks 2..=11 = 10 entries.
        tester
            .wait_till_block_id_with_txs(11, 100, 10)
            .await
            .unwrap();

        let node_public_key = tester.get_public_key().await;
        // Simulate a brand-new browser peer that has no blocks yet.
        let peer_block_id: u64 = 0;
        let peer_fork_id = [0u8; 32];

        // Case 1 – only the browser peer's own (unrelated) key in peer_key_list.
        // The peer has no transactions in the chain, so no blocks should be
        // flagged for fetching.
        {
            let blockchain = tester.routing_thread.blockchain_lock.read().await;
            let ghost_chain = RoutingThread::generate_ghost_chain(
                peer_block_id,
                peer_fork_id,
                &blockchain,
                vec![unrelated_peer_key],
            )
            .await;
            assert_eq!(ghost_chain.txs.len(), 10);
            assert!(
                ghost_chain.txs.iter().all(|x| !(*x)),
                "expected no blocks to be relevant when only the peer's own key is watched"
            );
        }

        // Case 2 – the peer also watches the routing node's public key.
        // Because the node key is present in transaction slips of every block,
        // all blocks are now flagged txs=true.  The browser would download the
        // entire chain even though it has no transactions of its own.
        // This is Bug 2: a single commonly-held key poisons the ghost chain
        // filter for all blocks.
        {
            let blockchain = tester.routing_thread.blockchain_lock.read().await;
            let ghost_chain = RoutingThread::generate_ghost_chain(
                peer_block_id,
                peer_fork_id,
                &blockchain,
                vec![unrelated_peer_key, node_public_key],
            )
            .await;
            assert_eq!(ghost_chain.txs.len(), 10);
            assert!(
                ghost_chain.txs.iter().all(|x| *x),
                "Bug 2: expected all {} blocks to be marked relevant when the routing \
                 node key is watched, but only {}/{} were flagged",
                ghost_chain.txs.len(),
                ghost_chain.txs.iter().filter(|x| **x).count(),
                ghost_chain.txs.len(),
            );
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn handle_new_peer_drops_connection_without_public_key() {
        let mut tester = NodeTester::default();
        let peer = NetworkPeer::new(Some("ws://example.test/wsopen".to_string()));

        let result = tester.routing_thread.handle_new_peer(peer).await;

        assert!(result.is_none());
        let peers = tester.routing_thread.network.peer_lock.read().await;
        assert!(peers.peers.is_empty());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn handle_new_peer_drops_connection_without_handshake_response() {
        let mut tester = NodeTester::default();
        let mut peer = NetworkPeer::new(Some("ws://example.test/wsopen".to_string()));
        peer.public_key = Some(generate_keys().0);

        let result = tester.routing_thread.handle_new_peer(peer).await;

        assert!(result.is_none());
        let peers = tester.routing_thread.network.peer_lock.read().await;
        assert!(peers.peers.is_empty());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn process_incoming_block_hash_skips_peer_without_fetch_url() {
        let mut tester = NodeTester::default();
        let public_key = generate_keys().0;

        {
            let mut peers = tester.routing_thread.network.peer_lock.write().await;
            peers.peers.insert(public_key, Peer::new(public_key));
        }

        let result = tester
            .routing_thread
            .process_incoming_block_hash_(
                [7; 32],
                1,
                public_key,
                tester.routing_thread.blockchain_lock.clone(),
                tester.routing_thread.mempool_lock.clone(),
            )
            .await;

        assert!(result.is_none());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn handle_peer_disconnect_marks_minimally_initialized_peer_disconnected() {
        let mut tester = NodeTester::default();
        let public_key = generate_keys().0;

        {
            let mut peers = tester.routing_thread.network.peer_lock.write().await;
            peers.peers.insert(public_key, Peer::new(public_key));
        }

        tester
            .routing_thread
            .network
	    .handle_peer_disconnect(public_key, PeerDisconnectType::InternalDisconnect)
            .await;

        let peers = tester.routing_thread.network.peer_lock.read().await;
        let peer = peers
            .peers
            .get(&public_key)
            .expect("peer should still exist");
        assert!(matches!(peer.peer_status, PeerStatus::Disconnected(_, _)));
        assert_ne!(peer.disconnected_at, Timestamp::MAX);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn malformed_network_messages_do_not_panic_routing_thread() {
        let mut tester = NodeTester::default();
        let public_key = generate_keys().0;

        let result = tester
            .routing_thread
            .process_network_event(NetworkEvent::IncomingNetworkMessage {
                public_key,
                buffer: vec![255, 0, 1],
            })
            .await;

        assert!(result.is_none());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn on_init_ignores_malformed_congestion_public_keys() {
        let mut tester = NodeTester::default();
        let state = Arc::new(Mutex::new(TestHarnessIoState::default()));
        let mut congestion_controls_by_key = HashMap::default();
        congestion_controls_by_key.insert(
            "not-a-valid-key".to_string(),
            PeerCongestionControls::default(),
        );
        let malformed = CongestionStatsDisplay {
            congestion_controls_by_key,
            congestion_controls_by_ip: HashMap::default(),
        };
        state.lock().unwrap().stored_values.insert(
            CONGESTION_CONFIG_PATH.to_string(),
            serde_json::to_vec(&malformed).unwrap(),
        );
        install_test_io(&mut tester, state);

        tester.routing_thread.on_init().await;

        let peers = tester.routing_thread.network.peer_lock.read().await;
        assert!(peers.congestion_controls_by_key.is_empty());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn initialize_static_peers_continues_after_connect_failures() {
        let mut tester = NodeTester::default();
        let state = Arc::new(Mutex::new(TestHarnessIoState {
            fail_connect: true,
            ..Default::default()
        }));
        install_test_io(&mut tester, state.clone());

        let mut config = TestHarnessConfig::default();
        config.peers = vec![PeerConfig {
            host: "peer.example".to_string(),
            port: 443,
            protocol: "https".to_string(),
            synctype: "full".to_string(),
        }];
        install_test_config(&mut tester, config);

        let config_lock = tester.routing_thread.config_lock.clone();
        tester
            .routing_thread
            .initialize_static_peers(config_lock)
            .await;

        let attempts = state.lock().unwrap().connect_attempts.clone();
        assert_eq!(
            attempts,
            vec![peer_url_from_config(&PeerConfig {
                host: "peer.example".to_string(),
                port: 443,
                protocol: "https".to_string(),
                synctype: "full".to_string(),
            })]
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
            .process_event(
                crate::core::routing_thread::RoutingEvent::BlockchainUpdated([1; 32], false),
            )
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
