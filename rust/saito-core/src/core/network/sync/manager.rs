use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockHash, BlockId, PrintForLog, SaitoHash, Timestamp};
use crate::core::network::interface_io::InterfaceEvent;
use crate::core::network::msg::blockchain::{
    is_supported_sync_type, Blockchain as BlockchainWire, RequestBlockchain, SYNC_TYPE_FULL,
    SYNC_TYPE_SPV, MAX_BLOCKCHAIN_CHUNK,
};
use crate::core::network::msg::message::Message;
use crate::core::network::network::Network;
use crate::core::util::configuration::Configuration;
use log::{debug, error, info, trace, warn};
use std::collections::BTreeMap;
use std::io::Error;
use tokio::sync::RwLock;

pub const MAX_CONCURRENT_BLOCK_FETCHES: usize = 10;
pub const MAX_BLOCK_FETCH_RETRIES: u32 = 20;
pub const BLOCK_FETCH_RETRY_DELAY_MS: Timestamp = 0;


//
// the queue for managing downloads
//
pub struct BlockFetchQueue {
    entries: BTreeMap<(BlockId, SaitoHash), BlockFetchEntry>,
}

//
// entries in the queue
//
#[derive(Debug, Clone)]
pub struct BlockFetchEntry {
    pub block_id: BlockId,
    pub block_hash: BlockHash,
    pub peer_ids: Vec<u64>,
    pub retry_count: u32,
    pub last_attempt_at: Timestamp,
    pub fetch_active: bool,
    pub fetch_peer_id: Option<u64>,
}


impl BlockFetchQueue {

    pub fn new() -> Self {
        Self {
            entries: BTreeMap::new(),
        }
    }

    //
    // add entries to the queue
    //
    pub fn add(&mut self, block_id: BlockId, block_hash: SaitoHash, peer_id: u64) {
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
                        fetch_active: false,
                        fetch_peer_id: None,
                    },
                );
            }
        }
    }

    //
    // remove entries from the queue
    //
    pub fn remove(&mut self, block_hash: SaitoHash) {
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

    /// Successful fetch: remove the entry.
    pub fn on_fetch_success(&mut self, block_hash: SaitoHash) {
        debug!("on_fetch_success : {:?}", block_hash.to_hex());
        self.remove(block_hash);
    }

    /// After a failed fetch attempt: clear fetch active flag, bump retries, or drop the entry.
    pub fn on_fetch_fail(
        &mut self,
        block_id: BlockId,
        block_hash: BlockHash,
        peer_id: u64,
        now: Timestamp,
    ) {
        warn!(
            "on_fetch_fail : {:?}-{:?} peer {}",
            block_id,
            block_hash.to_hex(),
            peer_id
        );
        let Some(entry) = self.entries.get_mut(&(block_id, block_hash)) else {
            debug!(
                "on_fetch_fail: no queue entry for {:?}",
                block_hash.to_hex()
            );
            return;
        };
        if !entry.fetch_active {
            debug!("on_fetch_fail: entry has no active fetch; ignoring duplicate failure");
            return;
        }
        if entry.fetch_peer_id != Some(peer_id) {
            debug!(
                "on_fetch_fail: stale peer {} (expected {:?})",
                peer_id, entry.fetch_peer_id
            );
            return;
        }

        entry.fetch_active = false;
        entry.fetch_peer_id = None;
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
}

pub struct SyncManager {
    pub queue: BlockFetchQueue,
}

impl SyncManager {

    pub fn new() -> Self {
        Self {
            queue: BlockFetchQueue::new(),
        }
    }

    pub async fn fetch(
        &mut self,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
        network: &Network,
        wallet_lock: Arc<RwLock<Wallet>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) -> bool {

        let mut work_done = false;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as Timestamp)
            .unwrap_or(0);

        let items_being_fetched = self
            .queue
            .entries
            .values()
            .filter(|e| e.fetch_active)
            .count() as BlockId;

        network
            .io_interface
            .send_interface_event(InterfaceEvent::BlockFetchStatus(items_being_fetched));

        loop {

            let items_being_fetched = self
                .queue
                .entries
                .values()
                .filter(|e| e.fetch_active)
                .count();

            if items_being_fetched >= MAX_CONCURRENT_BLOCK_FETCHES {
                break;
            }

            let mut next_fetch: Option<(BlockId, SaitoHash, u64)> = None;
            for (key, entry) in self.queue.entries.iter() {

                if entry.fetch_active || entry.peer_ids.is_empty() {
                    continue;
                }
                if entry.retry_count >= MAX_BLOCK_FETCH_RETRIES {
                    continue;
                }
                if entry.last_attempt_at != 0
                    && now.saturating_sub(entry.last_attempt_at) < BLOCK_FETCH_RETRY_DELAY_MS
                {
                    continue;
                }
                let selected_peer_id =
                    entry.peer_ids[(entry.retry_count as usize) % entry.peer_ids.len()];
                next_fetch = Some((key.0, key.1, selected_peer_id));
                break;
            }

            let Some((block_id, block_hash, selected_peer_id)) = next_fetch else {
                break;
            };

            let block_already_exists = {
                let blockchain = blockchain_lock.read().await;
                if blockchain.is_block_indexed(block_hash) {
                    true
                } else {
                    let mempool = mempool_lock.read().await;
                    mempool
                        .blocks_queue
                        .iter()
                        .any(|b| b.hash == block_hash)
                }
            };

            if block_already_exists {
                self.queue.remove(block_hash);
                continue;
            }

            let my_public_key = {
                let wallet = wallet_lock.read().await;
                wallet.public_key
            };

            if let Some(e) = self.queue.entries.get_mut(&(block_id, block_hash)) {
                e.fetch_active = true;
                e.fetch_peer_id = Some(selected_peer_id);
                e.last_attempt_at = now;
            }
            work_done = true;

            let url: String;

            {
                let peers = network.peer_lock.read().await;

                if let Some(peer) = peers.get_peer_by_id(selected_peer_id) {
                    if peer.block_fetch_url.is_empty() {
                        warn!(
                            "dropping block fetch: peer {:?} has no fetch URL for block {:?}",
                            selected_peer_id,
                            block_hash.to_hex()
                        );
                        self.queue
                            .on_fetch_fail(block_id, block_hash, selected_peer_id, now);
                        continue;
                    }

                    let configs = config_lock.read().await;
                    let lite = configs.is_spv_mode();

                    url = peer.get_block_fetch_url(block_hash, lite, my_public_key);
                } else {
                    warn!(
                        "dropping block fetch: peer {:?} not found for block {:?}",
                        selected_peer_id,
                        block_hash.to_hex()
                    );
                    self.queue
                        .on_fetch_fail(block_id, block_hash, selected_peer_id, now);
                    continue;
                }
            }

            if network
                .io_interface
                .fetch_block_from_peer(
                    block_hash,
                    selected_peer_id,
                    url.as_str(),
                    block_id,
                )
                .await
                .is_err()
            {
                warn!(
                    "fetch_block_from_peer failed immediately for block {:?}-{:?} from peer {:?}",
                    block_id,
                    block_hash.to_hex(),
                    selected_peer_id
                );

                self.queue
                    .on_fetch_fail(block_id, block_hash, selected_peer_id, now);
            }
        }

        work_done
    }


    /// Sends [`Message::RequestBlockchain`] (full or SPV) using the latest chain head at call time.
    ///
    /// When not in browser mode, every call builds a fresh [`RequestBlockchain`] and sends it.
    /// Callers may invoke this repeatedly; peers respond with current sync state (including an
    /// empty chunk when our head already matches theirs). Throttle at the caller if needed.
    pub async fn send_request_blockchain_message(
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
        let latest_known_block_id = blockchain.get_latest_block_id();
        let latest_known_block_hash = blockchain.get_latest_block_hash();
        let fork_id = blockchain
            .generate_fork_id(latest_known_block_id)
            .or(blockchain.fork_id)
            .unwrap_or([0; 32]);
        drop(blockchain);

        network
            .send_message_by_peer_id(
                peer_id,
                Message::RequestBlockchain(RequestBlockchain {
                    latest_known_block_id,
                    latest_known_block_hash,
                    fork_id,
                    sync_type,
                }),
            )
            .await;

        trace!(
            "RequestBlockchain sent to peer {} (latest_block_id {})",
            peer_id, latest_known_block_id
        );
    }

    pub async fn process_request_blockchain_message(
        &self,
        request: RequestBlockchain,
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
                "process_request_blockchain_message: unsupported sync_type {} from peer {}",
                request.sync_type, peer_id
            );
            return Ok(());
        }

        let mut insane_fork = false;
        let mut shared_ancestor = 0u64;
        let mut our_latest_id = 0u64;
        let mut our_latest_hash = [0u8; 32];
        let mut our_fork_id = [0u8; 32];
        let mut shared_ancestor_block_hash = [0u8; 32];
        let mut ordered_refs: Vec<(BlockId, BlockHash)> = Vec::new();

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
                shared_ancestor = lsa;
                our_latest_id = blockchain.get_latest_block_id();
                our_latest_hash = blockchain.get_latest_block_hash();
                our_fork_id = blockchain
                    .generate_fork_id(our_latest_id)
                    .or(blockchain.fork_id)
                    .unwrap_or([0; 32]);
                shared_ancestor_block_hash = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(shared_ancestor)
                    .unwrap_or([0; 32]);

                // Stateless chunk: derived only from request + our chain (no per-peer cursor).
                let start_block_id = std::cmp::max(
                    shared_ancestor.saturating_add(1),
                    request.latest_known_block_id.saturating_add(1),
                );
                let end_block_id = std::cmp::min(
                    start_block_id.saturating_add((MAX_BLOCKCHAIN_CHUNK as u64).saturating_sub(1)),
                    our_latest_id,
                );

                if start_block_id <= our_latest_id && start_block_id <= end_block_id {
                    let mut next_id = start_block_id;
                    while next_id <= end_block_id && ordered_refs.len() < MAX_BLOCKCHAIN_CHUNK {
                        if let Some(h) = blockchain
                            .blockring
                            .get_longest_chain_block_hash_at_block_id(next_id)
                        {
                            ordered_refs.push((next_id, h));
                        }
                        next_id = next_id.saturating_add(1);
                    }
                }
            }
        }

        if insane_fork {
            info!(
                "RequestBlockchain: disconnecting peer {} (no shared ancestor / insane fork)",
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

        network
            .send_message_by_peer_id(
                peer_id,
                Message::Blockchain(BlockchainWire {
                    latest_known_block_id: our_latest_id,
                    latest_known_block_hash: our_latest_hash,
                    fork_id: our_fork_id,
                    shared_ancestor_block_id: shared_ancestor,
                    shared_ancestor_block_hash,
                    payload_earliest_block_id: payload_earliest_id,
                    payload_earliest_block_hash: payload_earliest_hash,
                    payload_latest_block_id: payload_latest_id,
                    payload_latest_block_hash: payload_latest_hash,
                    payload: ordered_refs,
                }),
            )
            .await;

        Ok(())
    }

    pub async fn process_blockchain_message(
        &mut self,
        cs: BlockchainWire,
        peer_id: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
    ) -> Result<(), Error> {
        let mut send_follow_up = false;
        {
            let blockchain = blockchain_lock.read().await;
            let mempool = mempool_lock.read().await;
            if cs.payload_latest_block_id < cs.latest_known_block_id {
                send_follow_up = true;
            }
            for (block_id, block_hash) in &cs.payload {
                if blockchain.is_block_indexed(*block_hash) {
                    continue;
                }
                if mempool.blocks_queue.iter().any(|b| b.hash == *block_hash) {
                    continue;
                }
                self.queue.add(*block_id, *block_hash, peer_id);
            }
        }

        if send_follow_up {
            self.send_request_blockchain_message(
                peer_id,
                blockchain_lock.clone(),
                config_lock.clone(),
                network,
            )
            .await;
        }

        Ok(())
    }

    
}

