use std::cmp::Ordering;
use std::collections::VecDeque;
use std::sync::Arc;

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockHash, BlockId, PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::network::interface_io::InterfaceEvent;
use crate::core::network::msg::block_request::BlockchainRequest;
use crate::core::network::msg::ghost_chain_sync::GhostChainSync;
use crate::core::network::msg::message::Message;
use crate::core::network::network::Network;
use crate::core::network::peers::Peers;
use crate::core::util::configuration::Configuration;
use ahash::HashMap;
use log::{debug, error, info, trace, warn};
use std::io::Error;
use tokio::sync::RwLock;

#[derive(Debug)]
enum BlockStatus {
    Queued,
    Fetching,
    Fetched,
    Failed,
}

    
pub struct BlockchainSendResults {
    pub start_id: BlockId,
    pub end_id: BlockId,
    pub peer_id: u64,
}   

struct BlockData {
    block_hash: BlockHash,
    block_id: BlockId,
    status: BlockStatus,
    retry_count: u32,
}

/// How many times should we retry before giving up on that block for that peer
const MAX_RETRIES_PER_BLOCK: u32 = 500;

/// Maintains the state for fetching blocks from other peers into this peer.
/// Tries to fetch the blocks in the most resource efficient way possible.
pub struct BlockchainSyncState {
    /// These are the blocks we have received from each of our peers
    received_block_picture: HashMap<u64, VecDeque<(BlockId, SaitoHash)>>,
    /// These are the blocks which we have to fetch from each of our peers
    blocks_to_fetch: HashMap<u64, VecDeque<BlockData>>,
    /// Maximum amount of blocks which can be fetched concurrently from a peer. If this number is too high, the peer's performance might get affected or the requests might be rejected
    batch_size: usize,
}

impl BlockchainSyncState {
    pub fn new(batch_size: usize) -> BlockchainSyncState {
        info!(
            "max concurrent block fetches per peer is set as {:?}",
            batch_size
        );
        BlockchainSyncState {
            received_block_picture: Default::default(),
            blocks_to_fetch: Default::default(),
            batch_size,
        }
    }

    /// Builds the list of blocks to be fetched from each peer. Blocks fetched are in order if in the same fork,
    /// or at the same level for multiple forks to make sure the blocks fetched can be processed most efficiently
    pub(crate) fn build_peer_block_picture(&mut self, blockchain: &Blockchain) {
        trace!(
            "building peer block picture. total : {}",
            self.received_block_picture
                .iter()
                .map(|x| x.1.len())
                .sum::<usize>()
        );
        // for every block picture received from a peer, we sort and create a list of sequential hashes to fetch from peers
        for (peer_id, received_picture_from_peer) in self.received_block_picture.iter_mut() {
            // need to sort before sequencing
            received_picture_from_peer.make_contiguous().sort_by(
                |(id_a, hash_a), (id_b, hash_b)| {
                    if id_a == id_b {
                        return hash_a.cmp(hash_b);
                    }
                    id_a.cmp(id_b)
                },
            );

            let blocks_to_fetch_from_peer = self.blocks_to_fetch.entry(peer_id).or_default();
            let mut counter = 0;

            loop {
                if received_picture_from_peer.is_empty() {
                    // have added all the received block hashes to the fetching list
                    break;
                }

                let (id, hash) = received_picture_from_peer
                    .pop_front()
                    .expect("failed popping front from received picture");

                if blockchain.blocks.contains_key(&hash) {
                    // not fetching blocks we already have
                    continue;
                }

                let block_data = BlockData {
                    block_hash: hash,
                    block_id: id,
                    status: BlockStatus::Queued,
                    retry_count: 0,
                };

                let already_exists = blocks_to_fetch_from_peer.iter().any(|b| {
                    let exists =
                        b.block_hash == block_data.block_hash && b.block_id == block_data.block_id;
                    if exists {
                        debug!(
                            "block : {:?}-{:?} already in the queue to be fetched with status : {:?} / retry_count : {:?}",
                            b.block_id,
                            b.block_hash.to_hex(),
                            b.status,
                            b.retry_count
                        );
                    }
                    exists
                });

                if !already_exists {
                    counter += 1;
                    blocks_to_fetch_from_peer.push_back(block_data);
                }
            }
            if counter > 0 {
                debug!(
                    "{:?} blocks selected (total : {:?}/{:?}) for peer : {:?}",
                    counter,
                    blocks_to_fetch_from_peer.len(),
                    received_picture_from_peer.len(),
                    peer_id
                );
            }
        }
        // removing empty lists from memory
        self.received_block_picture.retain(|_, map| !map.is_empty());
        self.blocks_to_fetch.retain(|_, vec| !vec.is_empty());
    }
    pub fn get_fetching_block_count(&self) -> BlockId {
        self.blocks_to_fetch
            .values()
            .map(|v| v.len() as BlockId)
            .sum::<BlockId>()
    }

    /// Generates the list of blocks which needs to be fetched next. A list is generated per each peer since we can fetch from multiple peers concurrently.
    pub fn get_blocks_to_fetch_per_peer(&mut self) -> HashMap<u64, Vec<(SaitoHash, BlockId)>> {
        trace!("getting block to be fetched per each peer",);
        let mut selected_blocks_per_peer: HashMap<u64, Vec<(SaitoHash, BlockId)>> =
            Default::default();

        // for each peer check if we can fetch block
        for (peer_id, deq) in self.blocks_to_fetch.iter_mut() {
            // we need to sort the list to make sure we are fetching the next in sequence blocks.
            // otherwise our memory will grow since we need to keep those fetched blocks in memory.
            // we need to sort this here because some previous block hashes can be received out of sequence
            deq.make_contiguous().sort_by(|a, b| {
                if a.block_id == b.block_id {
                    return a.block_hash.cmp(&b.block_hash);
                }
                a.block_id.cmp(&b.block_id)
            });

            let mut fetching_count = 0;

            // TODO : we don't need to iterate through this list multiple times. refactor !!!
            //  (can collect more than required and drop larger block ids if there are too many)
            for block_data in deq.iter_mut() {
                match block_data.status {
                    BlockStatus::Queued => {}
                    BlockStatus::Fetching => {
                        fetching_count += 1;
                    }
                    BlockStatus::Fetched => {}
                    BlockStatus::Failed => {}
                }
            }

            let mut allowed_quota = self.batch_size - fetching_count;

            for block_data in deq.iter_mut() {
                // we limit concurrent fetches to this amount
                if allowed_quota == 0 {
                    // we have reached allowed concurrent fetches quota.
                    break;
                }

                match block_data.status {
                    BlockStatus::Queued => {
                        trace!(
                            "selecting entry : {:?}-{:?} for peer : {:?}",
                            block_data.block_id,
                            block_data.block_hash.to_hex(),
                            peer_id
                        );
                        allowed_quota -= 1;
                        selected_blocks_per_peer
                            .entry(peer_id)
                            .or_default()
                            .push((block_data.block_hash, block_data.block_id));
                        block_data.status = BlockStatus::Fetching;
                    }
                    BlockStatus::Fetching => {}
                    BlockStatus::Fetched => {}
                    BlockStatus::Failed => {
                        match block_data.retry_count.cmp(&MAX_RETRIES_PER_BLOCK) {
                            Ordering::Less => {
                                block_data.retry_count += 1;
                                debug!(
                                    "selecting failed entry : {:?}-{:?} for peer : {:?}",
                                    block_data.block_id,
                                    block_data.block_hash.to_hex(),
                                    peer_id
                                );
                                allowed_quota -= 1;
                                block_data.status = BlockStatus::Queued;
                            }
                            Ordering::Equal => {
                                error!("ignoring block : {:?}-{:?} from peer : {:?} since we have repeatedly failed to fetch it",
                                block_data.block_id,
                                block_data.block_hash.to_hex(),
                                peer_id);

                                // increasing this so the error is only printed once per block per peer
                                block_data.retry_count += 1;
                            }
                            Ordering::Greater => {}
                        }
                    }
                }
            }

            debug!(
                "peer : {:?} to be fetched {:?} blocks. first : {:?} last : {:?} fetching : {:?} failed : {:?} queued : {:?}",
                peer_id,
                deq.len(),
                deq.front().unwrap().block_id,
                deq.back().unwrap().block_id,
                deq.iter()
                    .filter(|b| matches!(b.status, BlockStatus::Fetching))
                    .count(),
                deq.iter()
                    .filter(|b| matches!(b.status, BlockStatus::Failed))
                    .count(),
                deq.iter()
                    .filter(|b| matches!(b.status, BlockStatus::Queued))
                    .count()
            );
        }

        selected_blocks_per_peer
    }

    /// Mark the block state as "fetched"
    ///
    /// # Arguments
    ///
    /// * `hash`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn mark_as_fetched(&mut self, hash: SaitoHash) {
        debug!("marking block : {:?} as fetched", hash.to_hex());
        for (peer_id, deq) in self.blocks_to_fetch.iter_mut() {
            for block_data in deq {
                if hash.eq(&block_data.block_hash) {
                    block_data.status = BlockStatus::Fetched;
                    trace!(
                        "block : {:?} marked as fetched from peer : {:?}",
                        block_data.block_hash.to_hex(),
                        peer_id
                    );
                    break;
                }
            }
        }

        self.remove_fetched_blocks();
    }

    /// Removes all the entries related to fetched blocks and removes any empty collections from memory
    ///
    /// # Arguments
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    fn remove_fetched_blocks(&mut self) {
        let mut counter = 0;
        self.blocks_to_fetch.retain(|_, res| {
            res.retain(|b| {
                if matches!(b.status, BlockStatus::Fetched) {
                    counter += 1;
                    return false;
                }
                true
            });
            !res.is_empty()
        });
        trace!("{:?} fetched blocks removed from sync state", counter);
    }
    /// Adds an entry to this data structure which will be fetched later after prioritizing.
    ///
    /// # Arguments
    ///
    /// * `block_hash`:
    /// * `block_id`:
    /// * `peer_id`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub async fn add_entry(
        &mut self,
        block_hash: SaitoHash,
        block_id: BlockId,
        peer_id: u64,
        peer_lock: Arc<RwLock<Peers>>,
    ) {
        debug!(
            "adding sync state entry : {:?} - {:?} from {:?}",
            block_hash.to_hex(),
            block_id,
            peer_id
        );
        self.received_block_picture
            .entry(peer_id)
            .or_default()
            .push_back((block_id, block_hash));
    }

    /// Removes entry when the hash is added to the blockchain. If so we can move the block ceiling up.
    ///
    /// # Arguments
    ///
    /// * `block_hash`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn remove_entry(&mut self, block_hash: SaitoHash) {
        trace!("removing entry : {:?} from peer", block_hash.to_hex());
        for (_, deq) in self.blocks_to_fetch.iter_mut() {
            deq.retain(|block_data| block_data.block_hash != block_hash);
        }

        self.blocks_to_fetch.retain(|_, deq| !deq.is_empty());
    }

    pub fn get_stats(&self) -> Vec<String> {
        let mut stats = vec![];
        for (peer_id, vec) in self.blocks_to_fetch.iter() {
            let res = self.received_block_picture.get(peer_id);
            let mut count = 0;
            if let Some(deq) = res {
                count = deq.len();
            }
            let mut highest_id = 0;
            let last = vec.back();
            if let Some(block_data) = last {
                highest_id = block_data.block_id;
            }
            let mut lowest_id = 0;
            let first = vec.front();
            if first.is_some() {
                lowest_id = first.unwrap().block_id;
            }
            let fetching_blocks_count = vec
                .iter()
                .filter(|block_data| matches!(block_data.status, BlockStatus::Fetching))
                .count();
            let stat = format!(
                "{} - peer : {:?} lowest_id: {:?} fetching_count : {:?} ordered_till : {:?} unordered_block_ids : {:?}",
                format!("{:width$}", "routing::sync_state", width = 40),
                peer_id,
                lowest_id,
                fetching_blocks_count,
                highest_id,
                count
            );
            stats.push(stat);
        }
        // let stat = format!(
        //     "{} - block_fetch_ceiling : {:?}",
        //     format!("{:width$}", "routing::sync_state", width = 40),
        //     self.block_fetch_ceiling
        // );
        // stats.push(stat);
        stats
    }

    /// Mark the blocks which we couldn't fetch from the peer. After a sevaral retries we will stop fetching the block until we fetch it from another peer.
    ///
    /// # Arguments
    ///
    /// * `id`:
    /// * `hash`:
    /// * `peer_id`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn mark_as_failed(&mut self, id: BlockId, hash: BlockHash, peer_id: u64) {
        warn!(
            "failed to fetch block : {:?}-{:?} from peer : {:?}",
            id,
            hash.to_hex(),
            peer_id
        );

        if let Some(deq) = self.blocks_to_fetch.get_mut(peer_id) {
            let data = deq
                .iter_mut()
                .find(|data| data.block_id == id && data.block_hash == hash);
            match data {
                None => {
                    debug!("we are marking a block {:?}-{:?} from peer : {:?} as failed to fetch. But we don't have such a block or it's already fetched",id,hash.to_hex(),peer_id);
                }
                Some(data) => {
                    data.status = BlockStatus::Failed;
                }
            }
        } else {
            debug!("we are marking a block {:?}-{:?} from peer : {:?} as failed to fetch. But we don't have such a peer",id,hash.to_hex(),peer_id);
        }
    }
}

pub struct SyncManager {
    pub state: BlockchainSyncState,
    pub blockchain_send_results: Vec<BlockchainSendResults>,
}

impl SyncManager {
    pub fn new(batch_size: usize) -> Self {
        Self {
            state: BlockchainSyncState::new(batch_size),
	    blockchain_send_results: vec![],
        }
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
            .add_entry(block_hash, block_id, peer_id, network.peer_lock.clone())
            .await;
    }

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

    pub async fn send_block_headers(
        &self,
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

        self.blockchain_send_results.retain(|entry| entry.start_id <= entry.end_id);
    }

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
                if let Some(peer_v2) = network
                    .peer_lock
                    .write()
                    .await
                    .get_peer_by_id_mut(peer_id)
                {
                    peer_v2.url = None;
                }
            }

            if let Err(e) = network
                .disconnect_from_peer(
                    peer_id,
                    "Cannot find a shared ancestor block to sync 2 nodes",
                )
                .await
            {
                error!(
                    "error disconnecting from peer : {}. {}",
                    peer_id,
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

        info!(
            "queueing {} block headers to be sent to peer : {}. from : {} to : {}",
            blockchain.blockring.get_latest_block_id() + 1 - last_shared_ancestor,
            peer_id,
            last_shared_ancestor,
            blockchain.blockring.get_latest_block_id()
        );

        if !self.blockchain_send_results
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
            debug!(
                "sending ghost chain request to peer : {:?}",
                peer_id
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
                peer_id
            );
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

        trace!(
            "blockchain request sent to peer : {:?}",
            peer_id
        );
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

        {
            let blockchain = blockchain_lock.read().await;
            self.state.build_peer_block_picture(&blockchain);
        }

        let map = self.state.get_blocks_to_fetch_per_peer();

        let fetching_count = self.state.get_fetching_block_count();

        network
            .io_interface
            .send_interface_event(InterfaceEvent::BlockFetchStatus(fetching_count as BlockId));

        let mut fetched_blocks: Vec<(u64, SaitoHash)> = Default::default();

        for (peer_id, vec) in map {
            for (hash, block_id) in vec.iter().rev() {
                work_done = true;

                let block_exists;
                let my_public_key;

                {
                    let blockchain = blockchain_lock.read().await;
                    if blockchain.is_block_indexed(*hash) {
                        block_exists = true;
                    } else {
                        let mempool = mempool_lock.read().await;
                        block_exists = mempool.blocks_queue.iter().any(|b| b.hash == *hash);
                    }
                }

                {
                    let wallet = wallet_lock.read().await;
                    my_public_key = wallet.public_key;
                }

                if block_exists {
                    self.state.remove_entry(*hash);
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
                            self.state.remove_entry(*hash);
                            continue;
                        }

                        let configs = config_lock.read().await;
                        let lite = configs.is_spv_mode();

                        url = peer.get_block_fetch_url(*hash, lite, my_public_key);
                    } else {
                        warn!(
                            "dropping block fetch: peer {:?} not found for block {:?}",
                            peer_id,
                            hash.to_hex()
                        );
                        self.state.remove_entry(*hash);
                        continue;
                    }
                }

                if network
                    .io_interface
                    .fetch_block_from_peer(*hash, peer_id, url.as_str(), *block_id)
                    .await
                    .is_err()
                {
                    warn!(
        		"fetch_block_from_peer failed immediately for block {:?}-{:?} from peer {:?}",
        		block_id,
        		hash.to_hex(),
        		peer_id
    		    );

                    self.state.mark_as_failed(*block_id, *hash, peer_id);
                } else {
                    fetched_blocks.push((peer_id, *hash));
                }
            }
        }

        work_done
    }

    pub async fn process_block_fetch_failed_event(
        &mut self,
        block_hash: SaitoHash,
        peer_id: u64,
        block_id: BlockId,
        network: &Network,
        current_time: Timestamp,
    ) {
        self.state.mark_as_failed(block_id, block_hash, peer_id);
    }
}

#[cfg(test)]
mod tests {
    use super::BlockchainSyncState;
    use crate::core::defs::BlockId;
    use crate::core::util::test::test_manager::test::TestManager;
    use std::ops::Deref;

    #[tokio::test]
    #[serial_test::serial]
    async fn multiple_forks_from_multiple_peers_test() {
        let t = TestManager::default();
        let mut state = BlockchainSyncState::new(10);
        for i in 0..state.batch_size + 50 {
            state
                .add_entry(
                    [(i + 1) as u8; 32],
                    (i + 1) as BlockId,
                    [1; 33],
                    t.peer_lock.clone(),
                )
                .await;
        }
        for i in 4..state.batch_size + 50 {
            state
                .add_entry(
                    [(i + 101) as u8; 32],
                    (i + 1) as BlockId,
                    [1; 33],
                    t.peer_lock.clone(),
                )
                .await;
        }

        state.build_peer_block_picture(t.blockchain_lock.read().await.deref());
        let mut result = state.get_blocks_to_fetch_per_peer();
        assert_eq!(result.len(), 1);
        let vec = result.get_mut(&[1; 33]);
        assert!(vec.is_some());
        let vec = vec.unwrap();
        assert_eq!(vec.len(), state.batch_size);
        assert_eq!(state.batch_size, 10);
        let mut fetching = vec![];
        for i in 0..4 {
            let (entry, _) = vec.get(i).unwrap();
            assert_eq!(*entry, [(i + 1) as u8; 32]);
            fetching.push((1, [(i + 1) as u8; 32]));
        }
        let mut value = 4;
        for index in (4..10).step_by(2) {
            value += 1;
            let (entry, _) = vec.get(index).unwrap();
            assert_eq!(*entry, [(value) as u8; 32]);
            fetching.push((1, [(value) as u8; 32]));

            let (entry, _) = vec.get(index + 1).unwrap();
            assert_eq!(*entry, [(value + 100) as u8; 32]);
            fetching.push((1, [(value + 100) as u8; 32]));
        }
        state.build_peer_block_picture(t.blockchain_lock.read().await.deref());
        let result = state.get_blocks_to_fetch_per_peer();
        assert_eq!(result.len(), 0);

        state.remove_entry([1; 32]);
        state.remove_entry([5; 32]);
        state.remove_entry([106; 32]);
        state.build_peer_block_picture(t.blockchain_lock.read().await.deref());
        let mut result = state.get_blocks_to_fetch_per_peer();
        assert_eq!(result.len(), 1);
        let vec = result.get_mut(&[1; 33]).unwrap();
        assert_eq!(vec.len(), 3);
        // TODO : fix this
        // assert!(vec.contains(&[8; 32]));
        // assert!(vec.contains(&[108; 32]));
        // assert!(vec.contains(&[9; 32]));
    }
}
