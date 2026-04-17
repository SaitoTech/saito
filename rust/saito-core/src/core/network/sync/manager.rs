use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockHash, BlockId, PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::network::interface_io::InterfaceEvent;
use crate::core::network::msg::block_request::BlockchainRequest;
use crate::core::network::msg::chainsync::{
    is_supported_sync_type, ChainSync, RequestChainSync, SYNC_TYPE_FULL, SYNC_TYPE_SPV,
};
use crate::core::network::msg::ghost_chain_sync::GhostChainSync;
use crate::core::network::msg::message::Message;
use crate::core::network::network::Network;
use crate::core::network::sync::chain::{
    build_blockchain_response, validate_parsed_blockchain, MAX_CHAIN_SYNC_CHUNK,
};
use crate::core::util::configuration::Configuration;
use log::{debug, error, info, trace, warn};
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::io::Error;
use tokio::sync::RwLock;

// ---------------------------------------------------------------------------
// Block fetch queue policy (Phase 1)
// ---------------------------------------------------------------------------

/// Maximum block bodies fetched concurrently across all peers.
pub const MAX_CONCURRENT_BLOCK_FETCHES: usize = 10;

/// After this many failed attempts for one block, drop the queue entry.
pub const MAX_BLOCK_FETCH_RETRIES: u32 = 20;

/// Minimum milliseconds after a failed attempt before the block is eligible for
/// another fetch. With value `0`, the next `fetch_next_blocks` pass may retry
/// immediately (same behavior as a tight poll loop).
pub const BLOCK_FETCH_RETRY_DELAY_MS: Timestamp = 0;

fn timestamp_ms_now() -> Timestamp {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as Timestamp)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------

/// **Legacy:** streams [`Message::BlockReference`] after [`BlockchainRequest`].
/// Canonical chain sync uses [`Message::RequestChainSync`] / [`Message::ChainSync`].
pub struct BlockchainSendResults {
    pub start_id: BlockId,
    pub end_id: BlockId,
    pub peer_id: u64,
}

/// One block the node intends to fetch; peers are candidates for HTTP fetch.
#[derive(Debug, Clone)]
pub struct BlockFetchEntry {
    pub block_id: BlockId,
    pub block_hash: BlockHash,
    pub peer_ids: Vec<u64>,
    pub retry_count: u32,
    pub last_attempt_at: Timestamp,
    pub in_flight: bool,
    pub in_flight_peer_id: Option<u64>,
}

/// Ordered global queue of blocks to fetch (`block_id` ascending, then `block_hash`).
/// Queue key is `(block_id, block_hash)` so iteration order matches scheduling preference.
pub struct BlockFetchQueue {
    entries: BTreeMap<(BlockId, SaitoHash), BlockFetchEntry>,
}

impl BlockFetchQueue {
    pub fn new() -> Self {
        info!(
            "BlockFetchQueue: max concurrent block fetches = {}",
            MAX_CONCURRENT_BLOCK_FETCHES
        );
        Self {
            entries: BTreeMap::new(),
        }
    }

    pub fn queue_len(&self) -> usize {
        self.entries.len()
    }

    /// Iterate entries in queue order (ascending `block_id`, then `block_hash`).
    pub fn iter_queue(&self) -> impl Iterator<Item = (&(BlockId, SaitoHash), &BlockFetchEntry)> {
        self.entries.iter()
    }

    /// Enqueue or merge `peer_id` into the entry for this block identity.
    pub fn enqueue_block(&mut self, block_id: BlockId, block_hash: SaitoHash, peer_id: u64) {
        debug!(
            "enqueue_block : {:?}-{:?} peer {}",
            block_id,
            block_hash.to_hex(),
            peer_id
        );
        let key = (block_id, block_hash);
        match self.entries.get_mut(&key) {
            Some(entry) => {
                if !entry.peer_ids.contains(&peer_id) {
                    entry.peer_ids.push(peer_id);
                }
            }
            None => {
                self.entries.insert(
                    key,
                    BlockFetchEntry {
                        block_id,
                        block_hash,
                        peer_ids: vec![peer_id],
                        retry_count: 0,
                        last_attempt_at: 0,
                        in_flight: false,
                        in_flight_peer_id: None,
                    },
                );
            }
        }
    }

    /// Remove every queue row matching `block_hash` (normally one).
    pub fn remove_block(&mut self, block_hash: SaitoHash) {
        trace!("remove_block : {:?}", block_hash.to_hex());
        let keys: Vec<(BlockId, SaitoHash)> = self
            .entries
            .keys()
            .filter(|(_, h)| *h == block_hash)
            .copied()
            .collect();
        for k in keys {
            self.entries.remove(&k);
        }
    }

    /// Mark a started HTTP fetch (`in_flight`, chosen peer, timestamp).
    pub fn mark_fetch_started(
        &mut self,
        block_id: BlockId,
        block_hash: SaitoHash,
        peer_id: u64,
        now: Timestamp,
    ) {
        if let Some(e) = self.entries.get_mut(&(block_id, block_hash)) {
            e.in_flight = true;
            e.in_flight_peer_id = Some(peer_id);
            e.last_attempt_at = now;
        }
    }

    /// Successful fetch: remove the entry.
    pub fn complete_fetch(&mut self, block_hash: SaitoHash) {
        debug!("complete_fetch : {:?}", block_hash.to_hex());
        self.remove_block(block_hash);
    }

    /// Record a failed fetch attempt; may clear in_flight, bump retries, or drop the entry.
    pub fn record_fetch_failure(
        &mut self,
        block_id: BlockId,
        block_hash: BlockHash,
        peer_id: u64,
        now: Timestamp,
    ) {
        warn!(
            "record_fetch_failure : {:?}-{:?} peer {}",
            block_id,
            block_hash.to_hex(),
            peer_id
        );
        let Some(entry) = self.entries.get_mut(&(block_id, block_hash)) else {
            debug!(
                "record_fetch_failure: no queue entry for {:?}",
                block_hash.to_hex()
            );
            return;
        };
        if !entry.in_flight {
            debug!("record_fetch_failure: entry not in flight; ignoring duplicate failure");
            return;
        }
        if entry.in_flight_peer_id != Some(peer_id) {
            debug!(
                "record_fetch_failure: stale peer {} (expected {:?})",
                peer_id, entry.in_flight_peer_id
            );
            return;
        }

        entry.in_flight = false;
        entry.in_flight_peer_id = None;
        entry.last_attempt_at = now;
        entry.retry_count = entry.retry_count.saturating_add(1);

        if entry.retry_count >= MAX_BLOCK_FETCH_RETRIES {
            error!(
                "dropping block {:?}-{:?} from fetch queue after {} failures",
                block_id,
                block_hash.to_hex(),
                entry.retry_count
            );
            self.entries.remove(&(block_id, block_hash));
        }
    }

    /// Select up to `max_new` new fetches in **queue order** (ascending `block_id`).
    /// Marks selected entries in-flight and returns `(peer_id, hash, block_id)` for dispatch.
    pub fn select_next_fetch_batch(
        &mut self,
        max_new: usize,
        now: Timestamp,
    ) -> Vec<(u64, SaitoHash, BlockId)> {
        if max_new == 0 {
            return vec![];
        }

        let in_flight_count = self
            .entries
            .values()
            .filter(|e| e.in_flight)
            .count();
        let capacity = MAX_CONCURRENT_BLOCK_FETCHES.saturating_sub(in_flight_count);
        let limit = max_new.min(capacity);
        if limit == 0 {
            return vec![];
        }

        let keys_to_start: Vec<(BlockId, SaitoHash)> = self
            .entries
            .iter()
            .filter(|(_, e)| {
                if e.in_flight || e.peer_ids.is_empty() {
                    return false;
                }
                if e.last_attempt_at == 0 {
                    return true;
                }
                now.saturating_sub(e.last_attempt_at) >= BLOCK_FETCH_RETRY_DELAY_MS
            })
            .take(limit)
            .map(|(k, _)| *k)
            .collect();

        let mut out = Vec::new();
        for key in keys_to_start {
            let Some(entry) = self.entries.get_mut(&key) else {
                continue;
            };
            if entry.in_flight || entry.peer_ids.is_empty() {
                continue;
            }
            let idx = (entry.retry_count as usize) % entry.peer_ids.len();
            let peer_id = entry.peer_ids[idx];
            entry.in_flight = true;
            entry.in_flight_peer_id = Some(peer_id);
            entry.last_attempt_at = now;
            out.push((peer_id, key.1, entry.block_id));
        }
        out
    }

    pub fn get_fetching_block_count(&self) -> BlockId {
        self.entries.values().filter(|e| e.in_flight).count() as BlockId
    }

    pub fn get_stats(&self) -> Vec<String> {
        if self.entries.is_empty() {
            return vec![];
        }
        let &(lowest_id, _) = self.entries.keys().next().unwrap();
        let &(highest_id, _) = self.entries.keys().next_back().unwrap();
        let fetching = self.entries.values().filter(|e| e.in_flight).count();
        let stat = format!(
            "{} - entries: {:?} lowest_id: {:?} highest_id: {:?} in_flight: {:?}",
            format!("{:width$}", "routing::block_fetch_queue", width = 40),
            self.entries.len(),
            lowest_id,
            highest_id,
            fetching
        );
        vec![stat]
    }
}

/// Per-peer state for chunked outbound [`Message::ChainSync`] replies.
#[derive(Clone, Debug)]
struct ChainSyncSendState {
    last_peer_fork_id: SaitoHash,
    out_cursor: BlockId,
}

pub struct SyncManager {
    pub state: BlockFetchQueue,
    /// **Legacy:** queued ranges for [`Self::send_block_reference`].
    pub blockchain_send_results: Vec<BlockchainSendResults>,
    /// Responder-side cursor for chunked `ChainSync` (canonical).
    chain_sync_send_by_peer: HashMap<u64, ChainSyncSendState>,
}

impl SyncManager {
    pub fn new() -> Self {
        Self {
            state: BlockFetchQueue::new(),
            blockchain_send_results: vec![],
            chain_sync_send_by_peer: HashMap::new(),
        }
    }

    pub fn clear_blockchain_peer(&mut self, peer_id: u64) {
        self.chain_sync_send_by_peer.remove(&peer_id);
    }

    pub fn build_request_blockchain_from_blockchain(
        blockchain: &Blockchain,
        sync_type: u8,
    ) -> RequestChainSync {
        let fork_id = blockchain
            .generate_fork_id(blockchain.get_latest_block_id())
            .or(blockchain.fork_id)
            .unwrap_or([0; 32]);
        RequestChainSync {
            latest_known_block_id: blockchain.get_latest_block_id(),
            latest_known_block_hash: blockchain.get_latest_block_hash(),
            fork_id,
            sync_type,
        }
    }

    pub async fn send_request_blockchain_to_peer(
        &self,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
    ) {
        let configs = config_lock.read().await;
        if configs.is_browser() {
            return;
        }
        let sync_type = if configs.is_spv_mode() {
            SYNC_TYPE_SPV
        } else {
            SYNC_TYPE_FULL
        };
        drop(configs);

        let blockchain = blockchain_lock.read().await;
        let req = Self::build_request_blockchain_from_blockchain(&blockchain, sync_type);
        drop(blockchain);

        network
            .send_message_by_peer_id(peer_id, Message::RequestChainSync(req))
            .await;
    }

    pub async fn process_request_blockchain_message(
        &mut self,
        request: RequestChainSync,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
    ) -> Result<(), Error> {
        let configs = config_lock.read().await;
        if configs.is_browser() {
            return Ok(());
        }
        drop(configs);

        if !is_supported_sync_type(request.sync_type) {
            warn!(
                "process_request_chain_sync_message: unsupported sync_type {} from peer {}",
                request.sync_type, peer_id
            );
            return Ok(());
        }

        let mut insane_fork = false;
        let mut last_shared_ancestor = 0u64;
        let mut our_latest_id = 0u64;
        let mut our_latest_hash = [0u8; 32];
        let mut our_fork_id = [0u8; 32];
        let mut shared_ancestor_block_hash = [0u8; 32];

        {
            let blockchain = blockchain_lock.read().await;

            let mut lsa =
                blockchain.generate_last_shared_ancestor(request.latest_known_block_id, request.fork_id);

            if request.latest_known_block_id > 0
                && request.latest_known_block_id
                    < blockchain.genesis_block_id.saturating_sub(100)
                && (lsa == 0 || lsa < blockchain.genesis_block_id)
                && blockchain.get_latest_block_id() > 0
            {
                insane_fork = true;
            } else {
                if lsa == 0 {
                    lsa = blockchain.genesis_block_id;
                }
                last_shared_ancestor = lsa;
                our_latest_id = blockchain.get_latest_block_id();
                our_latest_hash = blockchain.get_latest_block_hash();
                our_fork_id = blockchain
                    .generate_fork_id(our_latest_id)
                    .or(blockchain.fork_id)
                    .unwrap_or([0; 32]);
                shared_ancestor_block_hash = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(last_shared_ancestor)
                    .unwrap_or([0; 32]);
            }
        }

        if insane_fork {
            info!(
                "RequestChainSync: disconnecting peer {} (no shared ancestor / insane fork)",
                peer_id
            );
            {
                if let Some(peer) = network.peer_lock.write().await.get_peer_by_id_mut(peer_id) {
                    peer.url = None;
                }
            }
            let _ = network
                .disconnect_from_peer(
                    peer_id,
                    "Cannot find a shared ancestor block to sync 2 nodes",
                )
                .await;
            return Ok(());
        }

        let send_from = {
            let state = self
                .chain_sync_send_by_peer
                .entry(peer_id)
                .or_insert(ChainSyncSendState {
                    last_peer_fork_id: request.fork_id,
                    out_cursor: last_shared_ancestor,
                });
            if state.last_peer_fork_id != request.fork_id {
                state.last_peer_fork_id = request.fork_id;
                state.out_cursor = last_shared_ancestor;
            }
            state.out_cursor.max(last_shared_ancestor)
        };

        let ordered_refs = {
            let blockchain = blockchain_lock.read().await;
            let mut refs = Vec::new();
            let mut next_id = send_from.saturating_add(1);
            while next_id <= our_latest_id && refs.len() < MAX_CHAIN_SYNC_CHUNK {
                if let Some(h) = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(next_id)
                {
                    refs.push((next_id, h));
                }
                next_id = next_id.saturating_add(1);
            }
            refs
        };

        let (payload_earliest_id, payload_earliest_hash, payload_latest_id, payload_latest_hash) =
            if ordered_refs.is_empty() {
                (
                    our_latest_id,
                    our_latest_hash,
                    our_latest_id,
                    our_latest_hash,
                )
            } else {
                let first = ordered_refs[0];
                let last = *ordered_refs.last().unwrap();
                (first.0, first.1, last.0, last.1)
            };

        let new_out_cursor = if ordered_refs.is_empty() {
            our_latest_id
        } else {
            payload_latest_id
        };

        if let Some(st) = self.chain_sync_send_by_peer.get_mut(&peer_id) {
            st.out_cursor = new_out_cursor;
        }

        let cs = build_blockchain_response(
            our_latest_id,
            our_latest_hash,
            our_fork_id,
            last_shared_ancestor,
            shared_ancestor_block_hash,
            payload_earliest_id,
            payload_earliest_hash,
            payload_latest_id,
            payload_latest_hash,
            ordered_refs,
        )?;

        network
            .send_message_by_peer_id(peer_id, Message::ChainSync(cs))
            .await;

        Ok(())
    }

    pub async fn process_blockchain_message(
        &mut self,
        cs: ChainSync,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
    ) -> Result<(), Error> {
        validate_parsed_blockchain(&cs)?;

        let mut send_follow_up = false;
        {
            let blockchain = blockchain_lock.read().await;
            if cs.payload_latest_block_id < cs.latest_known_block_id {
                send_follow_up = true;
            }
            for (block_id, block_hash) in &cs.block_references {
                if blockchain.get_block(block_hash).is_none() {
                    self.state.enqueue_block(*block_id, *block_hash, peer_id);
                }
            }
        }

        if send_follow_up {
            let configs = config_lock.read().await;
            if configs.is_browser() {
                return Ok(());
            }
            let sync_type = if configs.is_spv_mode() {
                SYNC_TYPE_SPV
            } else {
                SYNC_TYPE_FULL
            };
            drop(configs);

            let blockchain = blockchain_lock.read().await;
            let req = Self::build_request_blockchain_from_blockchain(&blockchain, sync_type);
            drop(blockchain);

            network
                .send_message_by_peer_id(peer_id, Message::RequestChainSync(req))
                .await;
        }

        Ok(())
    }

    pub fn get_stats(&self) -> Vec<String> {
        self.state.get_stats()
    }

    pub async fn process_block_reference_message(
        &mut self,
        block_hash: SaitoHash,
        block_id: u64,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        wallet_lock: Arc<RwLock<Wallet>>,
        network: &Network,
    ) {
        debug!(
            "processing incoming block hash : {:?}-{:?} from peer : {:?}",
            block_id,
            block_hash.to_hex(),
            peer_id
        );

        {
            let blockchain = blockchain_lock.read().await;
            if !blockchain.blocks.is_empty() && blockchain.lowest_acceptable_block_id >= block_id {
                debug!(
                "skipping block header : {:?}-{:?} from peer : {:?} since our lowest acceptable id : {:?}",
                block_id,
                block_hash.to_hex(),
                peer_id,
                blockchain.lowest_acceptable_block_id
            );
                return;
            }
            if block_id < std::cmp::max(1, blockchain.genesis_block_id) {
                debug!(
                "skipping block header : {:?}-{:?} from peer : {:?} since it's earlier than our genesis block id : {}",
                block_id,
                block_hash.to_hex(),
                peer_id,
                blockchain.genesis_block_id
            );
                return;
            }
        }

        let wallet = wallet_lock.read().await;
        let wallet_version = wallet.wallet_version;
        let core_version = wallet.core_version;
        drop(wallet);

        match network
            .should_request_blockchain(peer_id, wallet_version, core_version)
            .await
        {
            Some(true) => {
                // NOTE: we cannot call request_blockchain_from_peer here (still in RoutingThread)
            }
            Some(false) => {}
            None => {
                warn!(
                    "couldn't find peer : {:?} for processing block header hash",
                    peer_id
                );
            }
        }

        self.state
            .enqueue_block(block_id, block_hash, peer_id);
    }

    /// **Legacy:** ghost-chain payload for SPV / pre-`RequestChainSync` flows.
    pub async fn generate_ghost_chain(
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
            last_shared_ancestor = std::cmp::max(block_id, blockchain.genesis_block_id);
        }

        let start = blockchain
            .blockring
            .get_longest_chain_block_hash_at_block_id(last_shared_ancestor)
            .unwrap_or([0; 32]);

        let latest_block_id = blockchain.blockring.get_latest_block_id();

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
                    block.has_keylist_txs(&peer_key_list),
                    block.pre_hash.to_hex(),
                    block.previous_block_hash.to_hex()
                );

                    debug_assert_eq!(
                        block.hash,
                        crate::core::util::crypto::hash(block.serialize_for_hash().as_slice())
                    );

                    ghost.txs.push(block.has_keylist_txs(&sender_only_key_list));
                }
            }
        }

        ghost
    }

    /// **Legacy:** drains [`Self::blockchain_send_results`] via [`Message::BlockReference`].
    pub async fn send_block_reference(
        &mut self,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        network: &Network,
    ) {
        if self.blockchain_send_results.is_empty() {
            return;
        }

        let blockchain = blockchain_lock.read().await;

        for entry in self.blockchain_send_results.iter_mut() {
            let start = entry.start_id;
            let end = std::cmp::min(entry.end_id, entry.start_id + 100);

            entry.start_id = end + 1;

            for block_id in start..=end {
                if let Some(block_hash) = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(block_id)
                {
                    network
                        .send_message_by_peer_id(
                            entry.peer_id,
                            Message::BlockReference(block_hash, block_id),
                        )
                        .await;
                }
            }
        }

        self.blockchain_send_results
            .retain(|entry| entry.start_id <= entry.end_id);
    }

    /// **Legacy:** inbound [`Message::RequestBlockchain`] — queues [`BlockchainSendResults`].
    /// Canonical: [`Self::process_request_chain_sync_message`].
    pub async fn process_blockchain_request_message(
        &mut self,
        request: BlockchainRequest,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        network: &Network,
    ) -> Result<(), Error> {
        info!(
            "processing incoming blockchain request : {:?}-{:?}-{:?} from peer : {:?}",
            request.latest_block_id,
            request.latest_block_hash.to_hex(),
            request.fork_id.to_hex(),
            peer_id
        );

        let blockchain = blockchain_lock.read().await;

        {
            let mut peers = network.peer_lock.write().await;

            if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                if peer.requested_blocks_from_us {
                    info!("peer : {:?} already requested the blockchain from us once. Not processing this request again until a reconnection", peer_id);
                    return Ok(());
                }
                peer.requested_blocks_from_us = true;
            } else {
                error!(
                    "Cannot find the peer : {} to process the incoming blockchain request",
                    peer_id
                );

                if let Err(e) = network
                    .disconnect_from_peer(peer_id, "cannot find peer details")
                    .await
                {
                    error!("error disconnecting from peer : {}. {}", peer_id, e);
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
            peer_id,
            request.latest_block_id,
            request.latest_block_hash.to_hex(),
            blockchain.get_latest_block_id(),
            blockchain.get_latest_block_hash().to_hex(),
            last_shared_ancestor,
            blockchain.genesis_block_id
    );

        if request.latest_block_id > 0
            && request.latest_block_id < blockchain.genesis_block_id.saturating_sub(100)
            && (last_shared_ancestor == 0 || last_shared_ancestor < blockchain.genesis_block_id)
            && blockchain.get_latest_block_id() > 0
        {
            info!("peer : {:?} has latest block : {}-{}. our latest block : {}-{}. cannot find a shared ancestor. Therefore disconnecting the peer",
            peer_id,
            request.latest_block_id,
            request.latest_block_hash.to_hex(),
            blockchain.get_latest_block_id(),
            blockchain.get_latest_block_hash().to_hex());
            {
                if let Some(peer) = network.peer_lock.write().await.get_peer_by_id_mut(peer_id) {
                    peer.url = None;
                }
            }

            if let Err(e) = network
                .disconnect_from_peer(
                    peer_id,
                    "Cannot find a shared ancestor block to sync 2 nodes",
                )
                .await
            {
                error!("error disconnecting from peer : {}. {}", peer_id, e);
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

        info!(
            "queueing {} block headers to be sent to peer : {}. from : {} to : {}",
            blockchain.blockring.get_latest_block_id() + 1 - last_shared_ancestor,
            peer_id,
            last_shared_ancestor,
            blockchain.blockring.get_latest_block_id()
        );

        if !self
            .blockchain_send_results
            .iter()
            .any(|r| r.peer_id == peer_id)
        {
            self.blockchain_send_results.push(BlockchainSendResults {
                start_id: last_shared_ancestor,
                end_id: blockchain.blockring.get_latest_block_id() + 1,
                peer_id: peer_id,
            });
        }

        info!("queued block headers for peer : {}", peer_id);

        Ok(())
    }

    /// **Legacy:** sends [`Message::RequestBlockchain`] or [`Message::RequestGhostChain`].
    /// Canonical initial pull: [`Self::send_request_blockchain_to_peer`].
    pub async fn request_blockchain_from_peer(
        &self,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
    ) {
        let configs = config_lock.read().await;
        let blockchain = blockchain_lock.read().await;

        {
            let mut peers = network.peer_lock.write().await;
            if let Some(peer) = peers.get_peer_by_id_mut(peer_id) {
                if peer.requested_blocks_from_peer {
                    info!("we already requested blockchain from peer : {}. so not requesting again until a reconnection",peer_id);
                    return;
                }
                peer.requested_blocks_from_peer = true;
            } else {
                warn!(
                    "Cannot request blockchain from non existent peer : {}",
                    peer_id
                );
            }
        }

        info!(
            "requesting blockchain from peer : {:?} latest_block_id : {:?}, last_block_id : {:?}",
            peer_id,
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
            debug!("sending ghost chain request to peer : {:?}", peer_id);
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
            debug!("sending blockchain request to peer : {:?}", peer_id);
        }

        let is_spv_mode = configs.is_spv_mode();

        drop(blockchain);
        drop(configs);

        network
            .send_message_by_peer_id(
                peer_id,
                if is_spv_mode {
                    Message::RequestGhostChain(
                        request.latest_block_id,
                        request.latest_block_hash,
                        request.fork_id,
                    )
                } else {
                    Message::RequestBlockchain(request)
                },
            )
            .await;

        trace!("blockchain request sent to peer : {:?}", peer_id);
    }

    pub async fn fetch_next_blocks(
        &mut self,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
        network: &Network,
        wallet_lock: Arc<RwLock<Wallet>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) -> bool {
        let mut work_done = false;
        let now = timestamp_ms_now();

        let batch = self
            .state
            .select_next_fetch_batch(MAX_CONCURRENT_BLOCK_FETCHES, now);

        let fetching_count = self.state.get_fetching_block_count();

        network
            .io_interface
            .send_interface_event(InterfaceEvent::BlockFetchStatus(fetching_count as BlockId));

        for (peer_id, hash, block_id) in batch {
            work_done = true;

            let block_exists;
            let my_public_key;

            {
                let blockchain = blockchain_lock.read().await;
                if blockchain.is_block_indexed(hash) {
                    block_exists = true;
                } else {
                    let mempool = mempool_lock.read().await;
                    block_exists = mempool.blocks_queue.iter().any(|b| b.hash == hash);
                }
            }

            {
                let wallet = wallet_lock.read().await;
                my_public_key = wallet.public_key;
            }

            if block_exists {
                self.state.remove_block(hash);
                continue;
            }

            let url: String;

            {
                let peers = network.peer_lock.read().await;

                if let Some(peer) = peers.get_peer_by_id(peer_id) {
                    if peer.block_fetch_url.is_empty() {
                        warn!(
                            "dropping block fetch: peer {:?} has no fetch URL for block {:?}",
                            peer_id,
                            hash.to_hex()
                        );
                        self.state.record_fetch_failure(block_id, hash, peer_id, now);
                        continue;
                    }

                    let configs = config_lock.read().await;
                    let lite = configs.is_spv_mode();

                    url = peer.get_block_fetch_url(hash, lite, my_public_key);
                } else {
                    warn!(
                        "dropping block fetch: peer {:?} not found for block {:?}",
                        peer_id,
                        hash.to_hex()
                    );
                    self.state.record_fetch_failure(block_id, hash, peer_id, now);
                    continue;
                }
            }

            if network
                .io_interface
                .fetch_block_from_peer(hash, peer_id, url.as_str(), block_id)
                .await
                .is_err()
            {
                warn!(
                    "fetch_block_from_peer failed immediately for block {:?}-{:?} from peer {:?}",
                    block_id,
                    hash.to_hex(),
                    peer_id
                );

                self.state.record_fetch_failure(block_id, hash, peer_id, now);
            }
        }

        work_done
    }

    pub async fn process_block_fetch_failed_event(
        &mut self,
        block_hash: SaitoHash,
        peer_id: u64,
        block_id: BlockId,
        _network: &Network,
        current_time: Timestamp,
    ) {
        self.state
            .record_fetch_failure(block_id, block_hash, peer_id, current_time);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[serial_test::serial]
    async fn enqueue_dedupes_and_merges_peers() {
        let mut q = BlockFetchQueue::new();
        q.enqueue_block(1, [1u8; 32], 100);
        q.enqueue_block(1, [1u8; 32], 200);
        assert_eq!(q.queue_len(), 1);
        let batch = q.select_next_fetch_batch(1, 1);
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].0, 100);
    }

    #[test]
    fn select_respects_global_concurrency() {
        let mut q = BlockFetchQueue::new();
        let now = 1_000_000u64;
        for i in 1..=15u64 {
            q.enqueue_block(i, [i as u8; 32], 1);
        }
        let b1 = q.select_next_fetch_batch(MAX_CONCURRENT_BLOCK_FETCHES, now);
        assert_eq!(b1.len(), MAX_CONCURRENT_BLOCK_FETCHES);
        let b2 = q.select_next_fetch_batch(MAX_CONCURRENT_BLOCK_FETCHES, now);
        assert!(b2.is_empty());
        assert_eq!(q.get_fetching_block_count(), MAX_CONCURRENT_BLOCK_FETCHES as BlockId);
    }

    #[test]
    fn failure_rotates_and_drops_at_limit() {
        let mut q = BlockFetchQueue::new();
        let h = [7u8; 32];
        q.enqueue_block(42, h, 10);
        q.enqueue_block(42, h, 20);
        let now = 5u64;
        let batch = q.select_next_fetch_batch(1, now);
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].0, 10);
        q.record_fetch_failure(42, h, 10, now);
        assert_eq!(q.queue_len(), 1);
        let batch2 = q.select_next_fetch_batch(1, now);
        assert_eq!(batch2.len(), 1);
        assert_eq!(batch2[0].0, 20);
    }
}
