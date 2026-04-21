use std::sync::Arc;

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::defs::{BlockHash, BlockId, PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::network::msg::block::{BlockReference};
use crate::core::network::msg::blockchain::{
    is_supported_sync_type, Blockchain as BlockchainPeerMessage, RequestBlockchain, MAX_BLOCKCHAIN_CHUNK,
    SYNC_TYPE_FULL, SYNC_TYPE_SPV,
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
pub const BLOCK_FETCH_RETRY_DELAY_MS: Timestamp = 0;

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
    blockchain_lock: Arc<RwLock<Blockchain>>,
    mempool_lock: Arc<RwLock<Mempool>>,
    my_public_key: SaitoPublicKey,
    spv_fetch: bool,
}

impl SyncManager {
    pub fn new(
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
        timer: Arc<Timer>,
        my_public_key: SaitoPublicKey,
        spv_fetch: bool,
    ) -> Self {
        Self {
            queue: BTreeMap::new(),
            peer_fetch_urls: HashMap::new(),
            timer,
            blockchain_lock,
            mempool_lock,
            my_public_key,
            spv_fetch,
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
    ) {

	let block_id = block_reference.block_id;
	let block_hash = block_reference.block_hash;

        if !self.peer_fetch_urls.contains_key(&peer_id) {
            let peers = network.peer_lock.read().await;
            if let Some(peer) = peers.get_peer_by_id(peer_id) {
                self.peer_fetch_urls
                    .insert(peer_id, peer.block_fetch_url.clone());
            }
        }

        let should_merge = {
            let blockchain = self.blockchain_lock.read().await;
            let mempool = self.mempool_lock.read().await;
            if blockchain.is_block_indexed(block_hash) {
                info!(
                    "[TEMP_SYNC_TRACE][FETCH] queue skip indexed peer_id={} block_id={} block_hash={}",
                    peer_id,
                    block_id,
                    block_hash.to_hex()
                );
                false
            } else if mempool.blocks_queue.iter().any(|b| b.hash == block_hash) {
                info!(
                    "[TEMP_SYNC_TRACE][FETCH] queue skip mempool-duplicate peer_id={} block_id={} block_hash={}",
                    peer_id,
                    block_id,
                    block_hash.to_hex()
                );
                false
            } else {
                true
            }
        };
        if should_merge {
            let key = (block_id, block_hash);
            match self.queue.get_mut(&key) {
                Some(entry) => {
                    if !entry.peer_ids.contains(&peer_id) {
                        entry.peer_ids.push(peer_id);
                        info!(
                            "[TEMP_SYNC_TRACE][FETCH] block queued merge-peer peer_id={} block_id={} block_hash={} peers_n={}",
                            peer_id,
                            block_id,
                            block_hash.to_hex(),
                            entry.peer_ids.len()
                        );
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
                    info!(
                        "[TEMP_SYNC_TRACE][FETCH] block queued new peer_id={} block_id={} block_hash={}",
                        peer_id,
                        block_id,
                        block_hash.to_hex()
                    );
                }
            }
        }
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
            info!(
                "[TEMP_SYNC_TRACE][FETCH] fetch fail dropped peer_id={} block_id={} block_hash={} retries={}",
                peer_id,
                block_id,
                block_hash.to_hex(),
                entry.retry_count
            );
            error!(
                "dropping block {:?}-{:?} from fetch queue after {} failures",
                block_id,
                block_hash.to_hex(),
                entry.retry_count
            );
            self.queue.remove(&(block_id, block_hash));
        }
    }

    pub async fn fetch(&mut self, network: &Network) -> bool {
        let mut work_done = false;
        let now = self.timer.get_timestamp_in_ms();
        loop {
            let items_being_fetched = self.queue.values().filter(|e| e.fetch_active).count();

            if items_being_fetched >= MAX_CONCURRENT_BLOCK_FETCHES {
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

            let url: String = match self.peer_fetch_urls.get(&selected_peer_id) {
                Some(base) if !base.is_empty() => {
                    if self.spv_fetch {
                        base.clone()
                            + "/lite-block/"
                            + block_hash.to_hex().as_str()
                            + "/"
                            + self.my_public_key.to_base58().as_str()
                    } else {
                        base.clone() + "/block/" + block_hash.to_hex().as_str()
                    }
                }
                Some(_) => {
                    info!(
                        "[TEMP_SYNC_TRACE][FETCH] fetch fail no-url peer_id={} block_id={} block_hash={}",
                        selected_peer_id,
                        block_id,
                        block_hash.to_hex()
                    );
                    warn!(
                        "dropping block fetch: peer {:?} has no fetch URL for block {:?}",
                        selected_peer_id,
                        block_hash.to_hex()
                    );
                    self.on_fetch_fail(block_id, block_hash, selected_peer_id, now);
                    continue;
                }
                None => {
                    info!(
                        "[TEMP_SYNC_TRACE][FETCH] fetch fail peer-not-in-url-map peer_id={} block_id={} block_hash={}",
                        selected_peer_id,
                        block_id,
                        block_hash.to_hex()
                    );
                    warn!(
                        "dropping block fetch: peer {:?} not found for block {:?}",
                        selected_peer_id,
                        block_hash.to_hex()
                    );
                    self.on_fetch_fail(block_id, block_hash, selected_peer_id, now);
                    continue;
                }
            };

            info!(
                "[TEMP_SYNC_TRACE][FETCH] fetch begin peer_id={} block_id={} block_hash={}",
                selected_peer_id,
                block_id,
                block_hash.to_hex()
            );

            if network
                .io_interface
                .fetch_block_from_peer(block_hash, selected_peer_id, url.as_str(), block_id)
                .await
                .is_err()
            {
                info!(
                    "[TEMP_SYNC_TRACE][FETCH] fetch fail immediate-io peer_id={} block_id={} block_hash={}",
                    selected_peer_id,
                    block_id,
                    block_hash.to_hex()
                );
                warn!(
                    "fetch_block_from_peer failed immediately for block {:?}-{:?} from peer {:?}",
                    block_id,
                    block_hash.to_hex(),
                    selected_peer_id
                );

                self.on_fetch_fail(block_id, block_hash, selected_peer_id, now);
            }
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
        let configs = config_lock.read().await;
        let sync_type = if configs.is_spv_mode() {
            SYNC_TYPE_SPV
        } else {
            SYNC_TYPE_FULL
        };
        drop(configs);

        let blockchain = self.blockchain_lock.read().await;
        let latest_known_block_id = blockchain.get_latest_block_id();
        let latest_known_block_hash = blockchain.get_latest_block_hash();
        let fork_id = blockchain
            .generate_fork_id(latest_known_block_id)
            .or(blockchain.fork_id)
            .unwrap_or([0; 32]);
        drop(blockchain);

        info!(
            "[TEMP_SYNC_TRACE][SYNC] send RequestBlockchain peer_id={} latest_known_block_id={} sync_type={}",
            peer_id, latest_known_block_id, sync_type
        );

        network
            .send_message_by_peer_id(
                peer_id,
                Message::RequestBlockchain(RequestBlockchain {
                    latest_known_block_id,
                    latest_known_block_hash,
                    fork_id,
                    sync_type,
                    public_key: self.my_public_key,
                    keylist: vec![self.my_public_key],
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
            shared_ancestor_block_id = blockchain
                .generate_last_shared_ancestor(peer_latest_known_block_id, peer_fork_id);
            shared_ancestor_block_hash = blockchain
                .blockring
                .get_longest_chain_block_hash_at_block_id(shared_ancestor_block_id)
                .unwrap_or([0; 32]);

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
            } else if shared_ancestor_block_id == 0 {
                send_response_starting_from_block_id =
                    std::cmp::max(blockchain.genesis_block_id, our_latest_id.saturating_sub(9));
                shared_ancestor_block_id = send_response_starting_from_block_id.saturating_sub(1);
                shared_ancestor_block_hash = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(shared_ancestor_block_id)
                    .unwrap_or([0; 32]);
            } else {
                if shared_ancestor_block_id < blockchain.genesis_block_id {
                    shared_ancestor_block_id = blockchain.genesis_block_id;
                    shared_ancestor_block_hash = blockchain
                        .blockring
                        .get_longest_chain_block_hash_at_block_id(shared_ancestor_block_id)
                        .unwrap_or([0; 32]);
                }
                send_response_starting_from_block_id = std::cmp::max(
                    shared_ancestor_block_id.saturating_add(1),
                    peer_latest_known_block_id.saturating_add(1),
                );
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
        info!(
            "[TEMP_SYNC_TRACE][SYNC] send Blockchain response peer_id={} chunk_blocks={} our_latest_id={} shared_ancestor={}",
            peer_id, ordered_refs.len(), our_latest_id, shared_ancestor_block_id
        );

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
                    payload_earliest_block_hash: first_ref.map_or(our_latest_hash, |r| r.block_hash),
                    payload_latest_block_id: last_ref.map_or(our_latest_id, |r| r.block_id),
                    payload_latest_block_hash: last_ref.map_or(our_latest_hash, |r| r.block_hash),
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
        info!(
            "[TEMP_SYNC_TRACE][SYNC] process Blockchain peer_id={} payload_n={} payload_latest_id={} remote_latest_id={} mode={}",
            peer_id,
            cs.payload.len(),
            cs.payload_latest_block_id,
            cs.latest_known_block_id,
            if is_spv_mode { "spv" } else { "full" }
        );
        for block_reference in &cs.payload {
            if !is_spv_mode {
                self.add(network, block_reference.clone(), peer_id).await;
                continue;
            }

            if block_reference.transactions > 0 {
                self.add(network, block_reference.clone(), peer_id).await;
                continue;
            }

            let ghost_metadata = {
                let blockchain = self.blockchain_lock.read().await;
                blockchain.get_block(&block_reference.block_hash).and_then(|block| {
                    if block.id == block_reference.block_id
                        && block.timestamp == block_reference.timestamp
                        && block.pre_hash != [0; 32]
                    {
                        Some((
                            block.id,
                            block.previous_block_hash,
                            block.timestamp,
                            block.pre_hash,
                            block.has_golden_ticket,
                            block.hash,
                        ))
                    } else {
                        None
                    }
                })
            };

            if let Some((id, previous_block_hash, ts, pre_hash, gt, hash)) = ghost_metadata {
                let mut blockchain = self.blockchain_lock.write().await;
                blockchain.add_ghost_block(id, previous_block_hash, ts, pre_hash, gt, hash);
            } else {
                warn!(
                    "cannot trust ghost insertion metadata for block {}-{} from peer {}; falling back to fetch",
                    block_reference.block_id,
                    block_reference.block_hash.to_hex(),
                    peer_id
                );
                self.add(network, block_reference.clone(), peer_id).await;
            }
        }
        self.fetch(network).await;

        Ok(())
    }
}
