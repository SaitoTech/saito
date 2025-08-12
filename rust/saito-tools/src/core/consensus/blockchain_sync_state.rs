use std::cmp::Ordering;
use std::collections::VecDeque;
use std::sync::Arc;

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::peers::peer_collection::PeerCollection;
use ahash::HashMap;
use log::{debug, error, info, trace, warn};
use tokio::sync::RwLock;

use crate::core::defs::{BlockHash, BlockId, PeerIndex, PrintForLog, SaitoHash};

#[derive(Debug)]
enum BlockStatus {
    Queued,
    Fetching,
    Fetched,
    Failed,
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
    received_block_picture: HashMap<PeerIndex, VecDeque<(BlockId, SaitoHash)>>,
    /// These are the blocks which we have to fetch from each of our peers
    blocks_to_fetch: HashMap<PeerIndex, VecDeque<BlockData>>,
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
        // trace!("building peer block picture");
        // for every block picture received from a peer, we sort and create a list of sequential hashes to fetch from peers
        for (peer_index, received_picture_from_peer) in self.received_block_picture.iter_mut() {
            // need to sort before sequencing
            received_picture_from_peer.make_contiguous().sort_by(
                |(id_a, hash_a), (id_b, hash_b)| {
                    if id_a == id_b {
                        return hash_a.cmp(hash_b);
                    }
                    id_a.cmp(id_b)
                },
            );

            let blocks_to_fetch_from_peer = self.blocks_to_fetch.entry(*peer_index).or_default();
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
                        trace!(
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
                trace!(
                    "{:?} blocks selected (total : {:?}) for peer : {:?}",
                    counter,
                    blocks_to_fetch_from_peer.len(),
                    peer_index
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
    pub fn get_blocks_to_fetch_per_peer(
        &mut self,
    ) -> HashMap<PeerIndex, Vec<(SaitoHash, BlockId)>> {
        // trace!("getting block to be fetched per each peer",);
        let mut selected_blocks_per_peer: HashMap<PeerIndex, Vec<(SaitoHash, BlockId)>> =
            Default::default();

        // for each peer check if we can fetch block
        for (peer_index, deq) in self.blocks_to_fetch.iter_mut() {
            // TODO : sorting this array can be a performance hit. need to check

            assert_ne!(
                *peer_index, 0,
                "peer index 0 should not enter this list since we handle it at add_entry"
            );

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
                        trace!("currently fetching : {:?}-{:?} from peer : {:?} with retry_count : {:?}",block_data.block_id,block_data.block_hash.to_hex(),peer_index, block_data.retry_count);
                    }
                    BlockStatus::Fetched => {}
                    BlockStatus::Failed => {}
                }
            }

            let mut allowed_quota = self.batch_size - fetching_count;

            for block_data in deq.iter_mut() {
                // we peers concurrent fetches to this amount
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
                            peer_index
                        );
                        allowed_quota -= 1;
                        selected_blocks_per_peer
                            .entry(*peer_index)
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
                                trace!(
                                    "selecting failed entry : {:?}-{:?} for peer : {:?}",
                                    block_data.block_id,
                                    block_data.block_hash.to_hex(),
                                    peer_index
                                );
                                allowed_quota -= 1;
                                block_data.status = BlockStatus::Queued;
                            }
                            Ordering::Equal => {
                                error!("ignoring block : {:?}-{:?} from peer : {:?} since we have repeatedly failed to fetch it",
                                block_data.block_id,
                                block_data.block_hash.to_hex(),
                                peer_index);

                                // increasing this so the error is only printed once per block per peer
                                block_data.retry_count += 1;
                            }
                            Ordering::Greater => {}
                        }
                    }
                }
            }

            trace!(
                "peer : {:?} to be fetched {:?} blocks. first : {:?} last : {:?} fetching : {:?} failed : {:?} queued : {:?}",
                peer_index,
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
    /// * `peer_index`:
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
        for (peer_index, deq) in self.blocks_to_fetch.iter_mut() {
            for block_data in deq {
                if hash.eq(&block_data.block_hash) {
                    block_data.status = BlockStatus::Fetched;
                    trace!(
                        "block : {:?} marked as fetched from peer : {:?}",
                        block_data.block_hash.to_hex(),
                        peer_index
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
    /// * `peer_index`:
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
    /// * `peer_index`:
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
        peer_index: PeerIndex,
        peer_lock: Arc<RwLock<PeerCollection>>,
    ) {
        trace!(
            "add entry : {:?} - {:?} from {:?}",
            block_hash.to_hex(),
            block_id,
            peer_index
        );
        if peer_index == 0 {
            // this means we don't have which peer to request this block from
            let peers = peer_lock.read().await;
            debug!("block : {:?}-{:?} is requested without a peer. request the block from all the peers", block_id,block_hash.to_hex());

            for (index, peer) in peers.index_to_peers.iter() {
                if peer.block_fetch_url.is_empty() {
                    continue;
                }
                self.received_block_picture
                    .entry(*index)
                    .or_default()
                    .push_back((block_id, block_hash));
            }
        } else {
            self.received_block_picture
                .entry(peer_index)
                .or_default()
                .push_back((block_id, block_hash));
        }
    }
    /// Removes entry when the hash is added to the blockchain. If so we can move the block ceiling up.
    ///
    /// # Arguments
    ///
    /// * `block_hash`:
    /// * `peer_index`:
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
        for (peer_index, vec) in self.blocks_to_fetch.iter() {
            let res = self.received_block_picture.get(peer_index);
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
                peer_index,
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
    /// * `peer_index`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn mark_as_failed(&mut self, id: BlockId, hash: BlockHash, peer_index: PeerIndex) {
        warn!(
            "failed to fetch block : {:?}-{:?} from peer : {:?}",
            id,
            hash.to_hex(),
            peer_index
        );

        if let Some(deq) = self.blocks_to_fetch.get_mut(&peer_index) {
            let data = deq
                .iter_mut()
                .find(|data| data.block_id == id && data.block_hash == hash);
            match data {
                None => {
                    debug!("we are marking a block {:?}-{:?} from peer : {:?} as failed to fetch. But we don't have such a block or it's already fetched",id,hash.to_hex(),peer_index);
                }
                Some(data) => {
                    data.status = BlockStatus::Failed;
                }
            }
        } else {
            debug!("we are marking a block {:?}-{:?} from peer : {:?} as failed to fetch. But we don't have such a peer",id,hash.to_hex(),peer_index);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::blockchain_sync_state::BlockchainSyncState;
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
                    1,
                    t.peer_lock.clone(),
                )
                .await;
        }
        for i in 4..state.batch_size + 50 {
            state
                .add_entry(
                    [(i + 101) as u8; 32],
                    (i + 1) as BlockId,
                    1,
                    t.peer_lock.clone(),
                )
                .await;
        }

        state.build_peer_block_picture(t.blockchain_lock.read().await.deref());
        let mut result = state.get_blocks_to_fetch_per_peer();
        assert_eq!(result.len(), 1);
        let vec = result.get_mut(&1);
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
        let vec = result.get_mut(&1).unwrap();
        assert_eq!(vec.len(), 3);
        // TODO : fix this
        // assert!(vec.contains(&[8; 32]));
        // assert!(vec.contains(&[108; 32]));
        // assert!(vec.contains(&[9; 32]));
    }
}
