use std::sync::Arc;

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockHash, BlockId, PrintForLog, SaitoHash, Timestamp};
use crate::core::network::msg::block::BlockReference;
use crate::core::network::msg::blockchain::{
    is_supported_sync_type, Blockchain as BlockchainPeerMessage, RequestBlockchain,
    MAX_BLOCKCHAIN_CHUNK, SYNC_TYPE_FULL, SYNC_TYPE_SPV,
};
use crate::core::network::msg::message::Message;
use crate::core::network::network::Network;
use crate::core::process::keep_time::Timer;
use crate::core::util::configuration::Configuration;
use log::{error, info, trace, warn};
use std::collections::{BTreeMap, HashMap};
use std::io::{Error, ErrorKind};
use tokio::sync::RwLock;

pub const MAX_CONCURRENT_BLOCK_FETCHES: usize = 10;
pub const MAX_BLOCK_FETCH_RETRIES: u32 = 20;
pub const BLOCK_FETCH_RETRY_DELAY_MS: Timestamp = 250;
pub type FetchDispatcher = Arc<dyn Fn(SaitoHash, u64, String, BlockId) + Send + Sync + 'static>;

//
// The SyncManager is responsible for downloading blocks and handling the initial chain-sync
// when clients connect to the network. It does this by maintaining a queue of blocks to download
// and handling inbound and outbound requests to sync the chain, using the Peer Messages:
//
//   RequestBlockchain
//   Blockchain
//
// The functions in this file fall into two parts. The first handle Queue management, the
// second process_* handle inbound request for chain-sync data and outbound serving of the
// requests received from peers.
//
#[derive(Debug, Clone)]
pub struct QueueItem {
    pub block_id: BlockId,
    pub block_hash: BlockHash,
    pub peer_ids: Vec<u64>,
    pub retry_count: u32,
    pub last_attempt_at: Timestamp,
    pub fetch_active: bool,
    pub fetch_peer_id: Option<u64>,
}

pub struct SyncManager {
    pub(crate) queue: BTreeMap<(BlockId, SaitoHash), QueueItem>,
    timer: Arc<Timer>,
    peer_fetch_urls: HashMap<u64, String>,
    block_fetch_url: Option<String>,
    blockchain_lock: Arc<RwLock<Blockchain>>,
    mempool_lock: Arc<RwLock<Mempool>>,
    wallet_lock: Arc<RwLock<Wallet>>,
    spv_fetch: bool,
}

impl SyncManager {
    pub fn new(
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
        wallet_lock: Arc<RwLock<Wallet>>,
        timer: Arc<Timer>,
        spv_fetch: bool,
        block_fetch_url: Option<String>,
    ) -> Self {
        Self {
            queue: BTreeMap::new(),
            peer_fetch_urls: HashMap::new(),
            timer,
            blockchain_lock,
            mempool_lock,
            wallet_lock,
            spv_fetch,
            block_fetch_url,
        }
    }

    //
    // add item to queue
    //
    pub async fn add(
        &mut self,
        network: &Network,
        block_reference: BlockReference,
        peer_id: u64,
    ) -> bool {
        let block_id = block_reference.block_id;
        let block_hash = block_reference.block_hash;
        let my_public_key = {
            let wallet = self.wallet_lock.read().await;
            wallet.public_key
        };

        if !self.peer_fetch_urls.contains_key(&peer_id) {
            let peers = network.peer_lock.read().await;
            if let Some(peer) = peers.get_peer_by_id(peer_id) {
                let peer_block_fetch_url =
                    peer.get_block_fetch_url([0; 32], self.spv_fetch, my_public_key);

                if peer_block_fetch_url.is_empty() {
                    return false;
                }

                self.peer_fetch_urls.insert(peer_id, peer_block_fetch_url);
            }
        }

        //
        // add if not already in queue
        //
        let blockchain = self.blockchain_lock.read().await;
        let mempool = self.mempool_lock.read().await;
        if blockchain.is_block_indexed(block_hash) {
            info!("[BLOCK_FETCH_TRACE][FETCH] block is indexed...");
        } else if mempool.blocks_queue.iter().any(|b| b.hash == block_hash) {
            info!("[BLOCK_FETCH_TRACE][FETCH] block is in mempool...");
        } else {
            info!("[BLOCK_FETCH_TRACE][FETCH] block inserting into queue...");

            let key = (block_id, block_hash);
            match self.queue.get_mut(&key) {
                Some(entry) => {
                    if !entry.peer_ids.contains(&peer_id) {
                        entry.peer_ids.push(peer_id);
                    }
                }
                None => {
                    self.queue.insert(
                        key,
                        QueueItem {
                            block_id,
                            block_hash,
                            peer_ids: vec![peer_id],
                            retry_count: 0,
                            last_attempt_at: 0,
                            fetch_active: false,
                            fetch_peer_id: None,
                        },
                    );
                    return true;
                }
            }
        }
        return false;
    }

    //
    // remove item from queue
    //
    pub fn remove(&mut self, block_hash: SaitoHash) {
        let keys: Vec<(BlockId, SaitoHash)> = self
            .queue
            .keys()
            .filter(|(_, h)| *h == block_hash)
            .copied()
            .collect();
        for k in keys {
            self.queue.remove(&k);
        }
    }

    //
    //
    //
    pub(crate) fn on_fetch_url_unavailable(&mut self, peer_id: u64, now: Timestamp) {
        self.peer_fetch_urls.remove(&peer_id);
        let keys: Vec<(BlockId, SaitoHash)> = self.queue.keys().copied().collect();

        for key in keys {
            let mut remove_entry = false;

            if let Some(entry) = self.queue.get_mut(&key) {
                entry.peer_ids.retain(|p| *p != peer_id);

                if entry.fetch_peer_id == Some(peer_id) {
                    entry.fetch_active = false;
                    entry.fetch_peer_id = None;
                    entry.last_attempt_at = now;
                }

                if entry.peer_ids.is_empty() {
                    remove_entry = true;
                }
            }

            if remove_entry {
                self.queue.remove(&key);
            }
        }
    }

    //
    //
    //
    pub(crate) fn on_fetch_fail(
        &mut self,
        block_id: BlockId,
        block_hash: BlockHash,
        peer_id: u64,
        now: Timestamp,
    ) {
        let Some(entry) = self.queue.get_mut(&(block_id, block_hash)) else {
            return;
        };
        if !entry.fetch_active {
            return;
        }
        if entry.fetch_peer_id != Some(peer_id) {
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
            self.queue.remove(&(block_id, block_hash));
        }
    }

    pub async fn fetch(&mut self, network: &Network, fetch_dispatcher: &FetchDispatcher) -> bool {
        let mut work_done = false;
        let now = self.timer.get_timestamp_in_ms();
        let max_concurrent_fetches = {
            let blockchain = self.blockchain_lock.read().await;
            if blockchain.blockring.is_empty() {
                1
            } else {
                MAX_CONCURRENT_BLOCK_FETCHES
            }
        };

        loop {
            let items_being_fetched = self.queue.values().filter(|e| e.fetch_active).count();

            if items_being_fetched >= max_concurrent_fetches {
                break;
            }

            let mut next_fetch: Option<(BlockId, SaitoHash, u64)> = None;
            for (key, entry) in self.queue.iter() {
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

            if let Some(e) = self.queue.get_mut(&(block_id, block_hash)) {
                e.fetch_active = true;
                e.fetch_peer_id = Some(selected_peer_id);
                e.last_attempt_at = now;
            }
            work_done = true;
            let my_public_key = {
                let wallet = self.wallet_lock.read().await;
                wallet.public_key
            };

            let (peer_found, url) = {
                let peers = network.peer_lock.read().await;
                match peers.get_peer_by_id(selected_peer_id) {
                    Some(peer) => (
                        true,
                        peer.get_block_fetch_url(block_hash, self.spv_fetch, my_public_key),
                    ),
                    None => (false, String::new()),
                }
            };

            if !peer_found {
                warn!(
                    "dropping block fetch: peer {:?} not found for block {:?}",
                    selected_peer_id,
                    block_hash.to_hex()
                );
                self.on_fetch_fail(block_id, block_hash, selected_peer_id, now);
                continue;
            }

            //
            // no url to fetch blocks? mark as complete
            //
            // note that on_fetch_url_unavailable will delete peer and possibly block if no fallback peers available
            //
            if url.is_empty() {
                warn!(
                    "peer {:?} has no fetch URL, disabling sync attempts",
                    selected_peer_id
                );

                {
                    let mut peers = network.peer_lock.write().await;
                    if let Some(peer) = peers.get_peer_by_id_mut(selected_peer_id) {
                        peer.on_sync_complete();
                    }
                }

                self.on_fetch_url_unavailable(selected_peer_id, now);
                continue;
            }

            let is_block_url = url.contains("/block/") || url.contains("/lite-block/");
            if !is_block_url {
                self.on_fetch_fail(block_id, block_hash, selected_peer_id, now);
                continue;
            }

            fetch_dispatcher(block_hash, selected_peer_id, url.clone(), block_id);
        }

        work_done
    }

    /////////////////////////////
    // PEER MESSAGE PROCESSING //
    /////////////////////////////

    pub(crate) async fn send_request_blockchain_message(
        &self,
        peer_id: u64,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
    ) {
        let (sync_type, config_last_block_id, config_last_block_hash, config_fork_id) = {
            let configs = config_lock.read().await;
            let sync_type = if configs.is_spv_mode() {
                SYNC_TYPE_SPV
            } else {
                SYNC_TYPE_FULL
            };
            let blockchain_configs = configs.get_blockchain_configs();
            let config_last_block_id = blockchain_configs.last_block_id;
            let config_last_block_hash =
                SaitoHash::from_hex(blockchain_configs.last_block_hash.as_str()).unwrap_or([0; 32]);
            let config_fork_id =
                SaitoHash::from_hex(blockchain_configs.fork_id.as_str()).unwrap_or([0; 32]);
            (
                sync_type,
                config_last_block_id,
                config_last_block_hash,
                config_fork_id,
            )
        };

        let (live_latest_known_block_id, live_latest_known_block_hash, live_fork_id) = {
            let blockchain = self.blockchain_lock.read().await;
            let live_latest_known_block_id = blockchain.get_latest_block_id();
            let live_latest_known_block_hash = blockchain.get_latest_block_hash();
            let live_fork_id = blockchain
                .generate_fork_id(live_latest_known_block_id)
                .or(blockchain.fork_id)
                .unwrap_or([0; 32]);
            (
                live_latest_known_block_id,
                live_latest_known_block_hash,
                live_fork_id,
            )
        };

        let mut latest_known_block_id = live_latest_known_block_id;
        let mut latest_known_block_hash = live_latest_known_block_hash;
        let mut fork_id = live_fork_id;

        // fallback to persisted config if live chain is empty
        if latest_known_block_id == 0 && config_last_block_id > 0 {
            latest_known_block_id = config_last_block_id;
            latest_known_block_hash = config_last_block_hash;
            fork_id = config_fork_id;
        }

        let my_public_key = {
            let wallet = self.wallet_lock.read().await;
            wallet.public_key
        };

        info!("SEND BLOCKCHAIN REQUEST: to peer...");
        info!(" -- to peer_id => {}", peer_id);
        info!(" -- my latest_known_block_id => {}", latest_known_block_id);
        info!(
            " -- my latest_known_block_hash => {:?}",
            latest_known_block_hash.to_hex()
        );
        info!(" -- my fork_id => {:?}", fork_id.to_hex());
        info!(" -- for sync_type => {}", sync_type);
        info!(" -- for public_key => {:?}", my_public_key.to_base58());

        network
            .send_message_by_peer_id(
                peer_id,
                Message::RequestBlockchain(RequestBlockchain {
                    latest_known_block_id,
                    latest_known_block_hash,
                    fork_id,
                    sync_type,
                    public_key: my_public_key,
                    keylist: vec![my_public_key],
                }),
            )
            .await;

        trace!(
            "RequestBlockchain sent to peer {} (latest_block_id {})",
            peer_id,
            latest_known_block_id
        );
    }

    pub(crate) async fn process_request_blockchain_message(
        &self,
        request: RequestBlockchain,
        peer_id: u64,
        network: &Network,
    ) -> Result<(), Error> {
        let requested_sync_type = request.sync_type;
        if !is_supported_sync_type(requested_sync_type) {
            warn!(
                "received RequestBlockchain with unsupported sync_type {} from peer {}",
                requested_sync_type, peer_id
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let peer_latest_known_block_id = request.latest_known_block_id;
        let peer_latest_known_block_hash = request.latest_known_block_hash;
        let peer_fork_id = request.fork_id;
        let requested_public_key = request.public_key;
        let mut requested_keylist = request.keylist;
        if requested_keylist.is_empty() {
            requested_keylist.push(requested_public_key);
        }
        let our_latest_id: u64;
        let our_latest_hash: [u8; 32];
        let our_fork_id: [u8; 32];
        let mut shared_ancestor_block_id: u64;
        let mut shared_ancestor_block_hash: [u8; 32];
        let calculated_shared_ancestor_block_id: u64;
        let calculated_shared_ancestor_block_hash: [u8; 32];
        let mut ordered_refs: Vec<BlockReference> = Vec::new();
        let mut send_response_starting_from_block_id: u64;

        {
            let blockchain = self.blockchain_lock.read().await;

            //
            // cache our latest consensus information
            //
            our_latest_id = blockchain.get_latest_block_id();
            our_latest_hash = blockchain.get_latest_block_hash();
            our_fork_id = blockchain
                .generate_fork_id(our_latest_id)
                .or(blockchain.fork_id)
                .unwrap_or([0; 32]);

            //
            // find shared ancestor with peer chain
            //
            let peer_tip_matches_our_chain = peer_latest_known_block_id > 0
                && blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(peer_latest_known_block_id)
                    .map(|block_hash| block_hash == peer_latest_known_block_hash)
                    .unwrap_or(false);

            if peer_tip_matches_our_chain {
                shared_ancestor_block_id = peer_latest_known_block_id;
                shared_ancestor_block_hash = peer_latest_known_block_hash;
            } else {
                calculated_shared_ancestor_block_id = blockchain
                    .generate_last_shared_ancestor(peer_latest_known_block_id, peer_fork_id);
                calculated_shared_ancestor_block_hash = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(calculated_shared_ancestor_block_id)
                    .unwrap_or([0; 32]);
                shared_ancestor_block_id = calculated_shared_ancestor_block_id;
                shared_ancestor_block_hash = calculated_shared_ancestor_block_hash;
            }

            //
            // determine starting block for sync to peer
            //
            send_response_starting_from_block_id = blockchain.genesis_block_id;
            if peer_latest_known_block_id == 0 {
                if requested_sync_type == SYNC_TYPE_FULL {
                    send_response_starting_from_block_id = blockchain.genesis_block_id;
                }
                if requested_sync_type == SYNC_TYPE_SPV {
                    send_response_starting_from_block_id =
                        std::cmp::max(blockchain.genesis_block_id, our_latest_id.saturating_sub(9));
                }
            } else if shared_ancestor_block_id > 0 {
                //
                // peer shares ancestry with us, continue sync
                // immediately after shared ancestor
                //
                send_response_starting_from_block_id = shared_ancestor_block_id.saturating_add(1);

                //
                // never go below genesis floor
                //
                send_response_starting_from_block_id = std::cmp::max(
                    blockchain.genesis_block_id,
                    send_response_starting_from_block_id,
                );
            } else if shared_ancestor_block_id == 0 {
                send_response_starting_from_block_id =
                    std::cmp::max(blockchain.genesis_block_id, our_latest_id.saturating_sub(9));
                shared_ancestor_block_id = 0;
                shared_ancestor_block_hash = [0; 32];
            }

            //
            // generate block references (payload)
            //
            let mut block_id = send_response_starting_from_block_id;
            while block_id <= our_latest_id && ordered_refs.len() < MAX_BLOCKCHAIN_CHUNK {
                if let Some(block_hash) = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(block_id)
                {
                    if let Some(block) = blockchain.get_block(&block_hash) {
                        let mut transactions: u32 = 0;
                        if requested_sync_type == SYNC_TYPE_SPV {
                            transactions = if block.has_keylist_txs(&requested_keylist) {
                                1
                            } else {
                                0
                            };
                        }
                        ordered_refs.push(BlockReference {
                            block_id,
                            block_hash,
                            timestamp: block.timestamp,
                            transactions,
                            has_golden_ticket: block.has_golden_ticket,
                        });
                    }
                }
                block_id = block_id.saturating_add(1);
            }
        }

        //
        // now generate tthe response
        //
        let first_ref = ordered_refs.first();
        let last_ref = ordered_refs.last();

        network
            .send_message_by_peer_id(
                peer_id,
                Message::Blockchain(BlockchainPeerMessage {
                    latest_known_block_id: our_latest_id,
                    latest_known_block_hash: our_latest_hash,
                    fork_id: our_fork_id,
                    shared_ancestor_block_id,
                    shared_ancestor_block_hash,
                    payload_earliest_block_id: first_ref.map_or(our_latest_id, |r| r.block_id),
                    payload_earliest_block_hash: first_ref
                        .map_or(our_latest_hash, |r| r.block_hash),
                    payload_latest_block_id: last_ref.map_or(our_latest_id, |r| r.block_id),
                    payload_latest_block_hash: last_ref.map_or(our_latest_hash, |r| r.block_hash),
                    block_fetch_url: self.block_fetch_url.clone(),
                    payload: ordered_refs.clone(),
                }),
            )
            .await;

        Ok(())
    }

    pub(crate) async fn process_blockchain_message(
        &mut self,
        cs: BlockchainPeerMessage,
        peer_id: u64,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        network: &Network,
        fetch_dispatcher: &FetchDispatcher,
    ) -> Result<(), Error> {
        let is_spv_mode = {
            let configs = config_lock.read().await;
            configs.is_spv_mode()
        };

        if cs.shared_ancestor_block_id == 0 || cs.shared_ancestor_block_hash == [0; 32] {
            warn!(
            "received Blockchain without shared ancestor signal peer_id={} shared_ancestor_id={} shared_ancestor_hash={}",
            peer_id,
            cs.shared_ancestor_block_id,
            cs.shared_ancestor_block_hash.to_hex()
        );
        }

        let mut previous_block_id = cs.shared_ancestor_block_id;
        let mut previous_block_hash = cs.shared_ancestor_block_hash;
        let mut did_queue_any_blocks = false;

        let is_local_chain_empty = {
            let blockchain = self.blockchain_lock.read().await;
            blockchain.blocks.is_empty()
        };
        {
            let mut peers = network.peer_lock.write().await;
            if let Some(peer) = peers.peers.get_mut(&peer_id) {
                if cs.block_fetch_url.is_some() {
                    info!(
                        "peer {} provided block fetch URL: {}",
                        peer_id,
                        cs.block_fetch_url.as_ref().unwrap()
                    );
                    peer.url = cs.block_fetch_url.clone();
                }
            }
        }

        let mut should_add_block = true;

        for (i, block_reference) in cs.payload.iter().enumerate() {
            should_add_block = true;

            info!(
                "received blockchain message 1 : {}-{}-{}",
                block_reference.block_id,
                previous_block_id,
                cs.payload.len()
            );
            //
            // only process sequential blocks
            //
            if block_reference.block_id != (previous_block_id + 1) {
                if previous_block_id == 0 {
                    //
                    // fresh wallet may join from first returned block
                    //
                    if !is_local_chain_empty {
                        should_add_block = false;
                    }
                } else {
                    should_add_block = false;
                }
            }

            if !should_add_block {
                continue;
            }

            //
            // full nodes always download
            //
            if !is_spv_mode {
                if self.add(network, block_reference.clone(), peer_id).await {
                    did_queue_any_blocks = true;
                }

                previous_block_id = block_reference.block_id;
                previous_block_hash = block_reference.block_hash;
                continue;
            }

            //
            // SPV MODE
            // Always fully fetch the final block in the chunk.
            // Earlier blocks only fetched if tx-relevant.
            //
            let is_last_block_in_chunk = i + 1 == cs.payload.len();

            if block_reference.transactions > 0 || is_last_block_in_chunk {
                if self.add(network, block_reference.clone(), peer_id).await {
                    did_queue_any_blocks = true;
                }

                previous_block_id = block_reference.block_id;
                previous_block_hash = block_reference.block_hash;
                continue;
            }

            //
            // otherwise add ghost block
            //
            {
                let mut blockchain = self.blockchain_lock.write().await;

                blockchain.add_ghost_block_without_transactions(
                    block_reference.block_id,
                    block_reference.timestamp,
                    block_reference.has_golden_ticket,
                    block_reference.block_hash,
                    previous_block_hash,
                );
            }

            previous_block_id = block_reference.block_id;
            previous_block_hash = block_reference.block_hash;
        }

        if !did_queue_any_blocks
            && self.queue.is_empty()
            && cs.payload_latest_block_id < cs.latest_known_block_id
            && cs.shared_ancestor_block_id != 0
        {
            self.send_request_blockchain_message(peer_id, config_lock.clone(), network)
                .await;
        } else if !did_queue_any_blocks && self.queue.is_empty() {
            let mut peers = network.peer_lock.write().await;
            if let Some(peer) = peers.peers.get_mut(&peer_id) {
                peer.on_sync_complete();
            }
        }

        self.fetch(network, fetch_dispatcher).await;

        Ok(())
    }

    pub async fn advance_chain_sync_if_ready(
        &mut self,
        network: &Network,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        if !self.queue.is_empty() {
            info!(" -- no -- queue is not empty");

            return;
        }

        let peer_id = {
            let peers = network.peer_lock.read().await;
            peers
                .peers
                .values()
                .find(|p| p.is_syncing && !p.is_synced)
                .map(|p| p.id)
        };

        let Some(peer_id) = peer_id else {
            info!(" -- no -- cannot find peer from peer_id");
            return;
        };

        let mut peers = network.peer_lock.write().await;
        let Some(peer) = peers.peers.get_mut(&peer_id) else {
            info!(" -- no -- cannot get writeable peer");
            return;
        };

        if peer.should_continue_chain_sync() {
            info!(" -- yes -- should continue chain sync");
            drop(peers);
            self.send_request_blockchain_message(peer_id, config_lock, network)
                .await;
            return;
        }

        info!(" -- no -- should we mark as sync complete?");

        //
        // update peer if needed, requires return; after peer drop in closure above
        //
        if peer.last_request_blockchain_chunksize > 0 && !peer.last_request_blockchain_has_more {
            info!(" --    -- yes -- mark as sync complete");
            peer.on_sync_complete();
        }
    }
}
