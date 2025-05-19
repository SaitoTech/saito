use std::cmp::max;
use std::collections::VecDeque;
use std::fmt::Debug;
use std::io::Error;
use std::sync::Arc;

use ahash::{AHashMap, HashMap};
use log::{debug, error, info, trace, warn};
use rayon::prelude::*;
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

use crate::core::consensus::block::{Block, BlockType};
use crate::core::consensus::blockring::BlockRing;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::{Wallet, WalletUpdateStatus, WALLET_NOT_UPDATED};
use crate::core::defs::{
    BlockHash, BlockId, Currency, ForkId, PrintForLog, SaitoHash, SaitoPublicKey, SaitoUTXOSetKey,
    Timestamp, UtxoSet, MIN_GOLDEN_TICKETS_DENOMINATOR, MIN_GOLDEN_TICKETS_NUMERATOR,
    PROJECT_PUBLIC_KEY,
};
use crate::core::io::interface_io::InterfaceEvent;
use crate::core::io::network::Network;
use crate::core::io::storage::Storage;
use crate::core::mining_thread::MiningEvent;
use crate::core::routing_thread::RoutingEvent;
use crate::core::util::balance_snapshot::BalanceSnapshot;
use crate::core::util::configuration::Configuration;
use crate::{drain, iterate};

pub fn bit_pack(top: u32, bottom: u32) -> u64 {
    ((top as u64) << 32) + (bottom as u64)
}

pub fn bit_unpack(packed: u64) -> (u32, u32) {
    // Casting from a larger integer to a smaller integer (e.g. u32 -> u8) will truncate, no need to mask this
    let bottom = packed as u32;
    let top = (packed >> 32) as u32;
    (top, bottom)
}

const FORK_ID_WEIGHTS: [u64; 16] = [
    0, 10, 10, 10, 10, 10, 25, 25, 100, 300, 500, 4000, 10000, 20000, 50000, 100000,
];

// pub const DEFAULT_SOCIAL_STAKE: Currency = 2_000_000 * NOLAN_PER_SAITO;
// pub const DEFAULT_SOCIAL_STAKE: Currency = 0;

// pub const DEFAULT_SOCIAL_STAKE_PERIOD: BlockId = 60;

#[derive(Debug)]
pub enum AddBlockResult {
    BlockAddedSuccessfully(
        BlockHash,
        bool, /*is in the longest chain ?*/
        WalletUpdateStatus,
    ),
    BlockAlreadyExists,
    FailedButRetry(
        Block,
        bool, /*fetch previous block*/
        bool, /*fetch whole blockchain*/
    ),
    FailedNotValid,
}

#[derive(Debug)]
pub enum WindingResult {
    Wind(usize, bool, WalletUpdateStatus),
    Unwind(usize, bool, Vec<SaitoHash>, WalletUpdateStatus),
    FinishWithSuccess(WalletUpdateStatus),
    FinishWithFailure,
}

#[derive(Debug)]
pub struct Blockchain {
    pub utxoset: UtxoSet,
    pub blockring: BlockRing,
    pub blocks: AHashMap<SaitoHash, Block>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub genesis_block_id: u64,
    pub fork_id: Option<SaitoHash>,
    pub last_block_hash: SaitoHash,
    pub last_block_id: u64,
    pub last_timestamp: u64,
    pub last_burnfee: Currency,

    pub genesis_timestamp: u64,
    genesis_block_hash: SaitoHash,
    pub lowest_acceptable_timestamp: u64,
    pub lowest_acceptable_block_hash: SaitoHash,
    pub lowest_acceptable_block_id: u64,

    pub social_stake_requirement: Currency,
    pub social_stake_period: u64,
    pub genesis_period: BlockId,

    pub checkpoint_found: bool,
    pub initial_token_supply: Currency,
    pub last_issuance_written_on: BlockId,
}

impl Blockchain {
    #[allow(clippy::new_without_default)]
    pub fn new(
        wallet_lock: Arc<RwLock<Wallet>>,
        genesis_period: BlockId,
        social_stake: Currency,
        social_stake_period: BlockId,
    ) -> Self {
        info!("initializing blockchain with genesis period : {:?}, social_stake : {:?}, social_stake_period : {:?}", genesis_period,social_stake,social_stake_period);
        Blockchain {
            utxoset: AHashMap::new(),
            blockring: BlockRing::new(genesis_period),
            blocks: AHashMap::new(),
            wallet_lock,
            genesis_block_id: 0,
            fork_id: None,
            last_block_hash: [0; 32],
            last_block_id: 0,
            last_timestamp: 0,
            last_burnfee: 0,
            genesis_timestamp: 0,
            genesis_block_hash: [0; 32],
            lowest_acceptable_timestamp: 0,
            lowest_acceptable_block_hash: [0; 32],
            lowest_acceptable_block_id: 0,
            // blocks_fetching: Default::default(),
            social_stake_requirement: social_stake,
            social_stake_period,
            genesis_period,
            checkpoint_found: false,
            initial_token_supply: 0,
            last_issuance_written_on: 0,
        }
    }
    pub fn init(&mut self) -> Result<(), Error> {
        Ok(())
    }

    pub fn set_fork_id(&mut self, fork_id: SaitoHash) {
        debug!("setting fork id as : {:?}", fork_id.to_hex());
        self.fork_id = Some(fork_id);
    }

    // #[async_recursion]
    pub async fn add_block(
        &mut self,
        mut block: Block,
        storage: &mut Storage,
        mempool: &mut Mempool,
        configs: &(dyn Configuration + Send + Sync),
    ) -> AddBlockResult {
        if block.generate().is_err() {
            error!(
                "block metadata generation failed. not adding block : {:?}",
                block.hash.to_hex()
            );
            return AddBlockResult::FailedNotValid;
        }

        debug!(
            "adding block {:?} of type : {:?} with id : {:?} with latest id : {:?} with tx count (gt/spv/total) : {:?}/{:?}/{:?}",
            block.hash.to_hex(),
            block.block_type,
            block.id,
            self.get_latest_block_id(),
            block
            .transactions
            .iter()
            .filter(|tx| tx.transaction_type == TransactionType::GoldenTicket)
            .count(),
            block
            .transactions
            .iter()
            .filter(|tx| tx.transaction_type == TransactionType::SPV)
            .count(),
            block.transactions.len()
        );

        // start by extracting some variables that we will use
        // repeatedly in the course of adding this block to the
        // blockchain and our various indices.
        let block_hash = block.hash;
        let block_id = block.id;
        let latest_block_hash = self.blockring.get_latest_block_hash();

        // sanity checks
        if self.blocks.contains_key(&block_hash) {
            error!(
                "block : {:?}-{:?} already exists in blockchain. not adding",
                block.id,
                block.hash.to_hex()
            );
            return AddBlockResult::BlockAlreadyExists;
        }

        // get missing block
        if !self.blockring.is_empty() && self.get_block(&block.previous_block_hash).is_none() {
            if block.previous_block_hash == [0; 32] {
                info!(
                    "hash is empty for parent of block : {:?}",
                    block.hash.to_hex()
                );
            } else if configs.get_blockchain_configs().initial_loading_completed
                || self.checkpoint_found
            {
                let previous_block_fetched = iterate!(mempool.blocks_queue, 100)
                    .any(|b| block.previous_block_hash == b.hash);
                let genesis_period = configs.get_consensus_config().unwrap().genesis_period;

                return if !previous_block_fetched {
                    if block.id > max(1, self.get_latest_block_id().saturating_sub(genesis_period))
                    {
                        let block_diff_before_fetching_chain: BlockId =
                            std::cmp::min(1000, genesis_period);
                        if block.id.abs_diff(self.get_latest_block_id())
                            < block_diff_before_fetching_chain
                        {
                            debug!(
                                "need to fetch previous block : {:?}-{:?}",
                                block.id - 1,
                                block.previous_block_hash.to_hex()
                            );

                            AddBlockResult::FailedButRetry(block, true, false)
                        } else {
                            info!("block : {:?}-{:?} is too distant with the current latest block : id={:?}. so need to fetch the whole blockchain from the peer to make sure this is not an attack",
                            block.id,block.hash.to_hex(),self.get_latest_block_id());
                            AddBlockResult::FailedButRetry(block, false, true)
                        }
                    } else {
                        debug!(
                            "block : {:?}-{:?} is too old to be added to the blockchain",
                            block.id,
                            block.hash.to_hex()
                        );
                        AddBlockResult::FailedNotValid
                    }
                } else {
                    debug!(
                        "previous block : {:?} is in the mempool. not fetching",
                        block.previous_block_hash.to_hex()
                    );
                    AddBlockResult::FailedButRetry(block, false, false)
                };
            }
        }

        // pre-validation
        //
        // this would be a great place to put in a pre-validation check
        // once we are finished implementing Saito Classic. Goal would
        // be a fast form of lite-validation just to determine that it
        // is worth going through the more general effort of evaluating
        // this block for consensus.
        //

        // save block to disk
        //
        // we have traditionally saved blocks to disk AFTER validating them
        // but this can slow down block propagation. So it may be sensible
        // to start a save earlier-on in the process so that we can relay
        // the block faster serving it off-disk instead of fetching it
        // repeatedly from memory. Exactly when to do this is left as an
        // optimization exercise.

        // insert block into hashmap and index
        //
        // the blockring is a BlockRing which lets us know which blocks (at which depth)
        // form part of the longest-chain. We also use the BlockRing to track information
        // on network congestion (how many block candidates exist at various depths and
        // in the future potentially the amount of work on each viable fork chain.
        //
        // we are going to transfer ownership of the block into the HashMap that stores
        // the block next, so we insert it into our BlockRing first as that will avoid
        // needing to borrow the value back for insertion into the BlockRing.
        // TODO : check if this "if" condition can be moved to an assert
        if !self
            .blockring
            .contains_block_hash_at_block_id(block_id, block_hash)
        {
            self.blockring.add_block(&block);
        }

        // blocks are stored in a hashmap indexed by the block_hash. we expect all
        // all block_hashes to be unique, so simply insert blocks one-by-one on
        // arrival if they do not exist.

        if !self.blocks.contains_key(&block_hash) {
            self.blocks.insert(block_hash, block);
        } else {
            error!(
                "BLOCK IS ALREADY IN THE BLOCKCHAIN, WHY ARE WE ADDING IT????? {:?}",
                block.hash.to_hex()
            );
            return AddBlockResult::BlockAlreadyExists;
        }

        // find shared ancestor of new_block with old_chain
        let mut old_chain: Vec<[u8; 32]> = Vec::new();
        let mut am_i_the_longest_chain = false;

        let (shared_ancestor_found, shared_block_hash, mut new_chain) =
            self.calculate_new_chain_for_add_block(block_hash);

        // and get existing current chain for comparison
        if shared_ancestor_found {
            old_chain =
                self.calculate_old_chain_for_add_block(latest_block_hash, shared_block_hash);
        } else {
            debug!(
                "block without parent. block : {}-{:?}, latest : {:?}",
                block_id,
                block_hash.to_hex(),
                latest_block_hash.to_hex()
            );

            // we have a block without a parent.
            //
            // if this is our first block, the blockring will have no entry yet
            // and block_ring_lc_pos (longest_chain_position) will be pointing
            // at None. We use this to determine if we are a new chain instead
            // of creating a separate variable to manually track entries.
            if self.blockring.is_empty() {

                // no need for action as fall-through will result in proper default
                // behavior. we have the comparison here to separate expected from
                // unexpected / edge-case issues around block receipt.
            } else {
                // if this not our first block, handle edge-case around receiving
                // block 503 before block 453 when block 453 is our expected proper
                // next block and we are getting blocks out-of-order because of
                // connection or network issues.
                if latest_block_hash != [0; 32]
                    && latest_block_hash == self.get_latest_block_hash()
                    && (block_id
                        > self
                            .get_latest_block_id()
                            .saturating_sub(self.genesis_period))
                {
                    info!("blocks received out-of-order issue. handling edge case...");

                    let disconnected_block_id = self.get_latest_block_id();
                    debug!("disconnected id : {:?}", disconnected_block_id);
                    debug!(
                        "disconnecting blocks from : {:?} to : {:?}",
                        block_id + 1,
                        disconnected_block_id
                    );

                    for i in block_id + 1..=disconnected_block_id {
                        if let Some(disconnected_block_hash) =
                            self.blockring.get_longest_chain_block_hash_at_block_id(i)
                        {
                            if disconnected_block_hash != [0; 32] {
                                self.blockring.on_chain_reorganization(
                                    i,
                                    disconnected_block_hash,
                                    false,
                                );
                                trace!("checking block id : {:?}", i);
                                let disconnected_block =
                                    self.get_mut_block(&disconnected_block_hash);
                                if let Some(disconnected_block) = disconnected_block {
                                    trace!("in longest chain set to false");
                                    disconnected_block.in_longest_chain = false;
                                }
                            }
                        }
                    }

                    // new_chain.clear();
                    // new_chain.push(block_hash);
                    am_i_the_longest_chain = false;
                }
            }
            old_chain =
                self.calculate_old_chain_upto_length(latest_block_hash, new_chain.len() as BlockId);
        }

        // at this point we should have a shared ancestor or not
        // find out whether this new block is claiming to require chain-validation
        if !am_i_the_longest_chain
            && (block_id
                > self
                    .get_latest_block_id()
                    .saturating_sub(self.genesis_period))
            && self.is_new_chain_the_longest_chain(&new_chain, &old_chain)
        {
            debug!(
                "new chain is the longest chain. changing am I the longest chain? {:?}. current block id : {} latest block id : {} genesis_period : {}",
                block_hash.to_hex(),
                block_id,
                self.get_latest_block_id(),
                self.genesis_period
            );
            am_i_the_longest_chain = true;
        }

        // now update blockring so it is not empty
        //
        // we do this down here instead of automatically on
        // adding a block, as we want to have the above check
        // for handling the edge-case of blocks received in the
        // wrong order. the longest_chain check also requires a
        // first-block-received check that is conducted against
        // the blockring.
        //
        self.blockring.empty = false;

        // validate
        //
        // blockchain validate "validates" the new_chain by unwinding the old
        // and winding the new, which calling validate on any new previously-
        // unvalidated blocks. When the longest-chain status of blocks changes
        // the function on_chain_reorganization is triggered in blocks and
        // with the BlockRing. We fail if the newly-preferred chain is not
        // viable.
        if am_i_the_longest_chain {
            debug!(
                "this is the longest chain, adding block : {:?}",
                block_hash.to_hex()
            );
            self.blocks.get_mut(&block_hash).unwrap().in_longest_chain = true;

            // debug!(
            //     "Full block count before= {:?}",
            //     self.blocks
            //         .iter()
            //         .filter(|(_, block)| matches!(block.block_type, BlockType::Full))
            //         .count()
            // );

            let (does_new_chain_validate, wallet_updated) = self
                .validate(new_chain.as_slice(), old_chain.as_slice(), storage, configs)
                .await;

            // debug!(
            //     "Full block count after= {:?} wallet_updated= {:?}",
            //     self.blocks
            //         .iter()
            //         .filter(|(_, block)| matches!(block.block_type, BlockType::Full))
            //         .count(),
            //     wallet_updated
            // );

            if does_new_chain_validate {
                // crash if total supply has changed
                self.check_total_supply(configs).await;

                self.add_block_success(block_hash, storage, mempool, configs)
                    .await;

                AddBlockResult::BlockAddedSuccessfully(block_hash, true, wallet_updated)
            } else {
                warn!(
                    "new chain doesn't validate with hash : {:?}",
                    block_hash.to_hex()
                );
                self.blocks.get_mut(&block_hash).unwrap().in_longest_chain = false;
                self.add_block_failure(&block_hash, mempool).await;
                AddBlockResult::FailedNotValid
            }
        } else {
            debug!("this is not the longest chain");
            self.add_block_success(block_hash, storage, mempool, configs)
                .await;
            AddBlockResult::BlockAddedSuccessfully(
                block_hash,
                false, /*not in longest_chain*/
                WALLET_NOT_UPDATED,
            )
        }
    }

    fn calculate_old_chain_for_add_block(
        &mut self,
        latest_block_hash: SaitoHash,
        shared_block_hash: SaitoHash,
    ) -> Vec<SaitoHash> {
        let mut old_chain: Vec<[u8; 32]> = Vec::new();
        let mut old_chain_hash = latest_block_hash;

        while shared_block_hash != old_chain_hash {
            if self.blocks.contains_key(&old_chain_hash) {
                old_chain.push(old_chain_hash);
                old_chain_hash = self
                    .blocks
                    .get(&old_chain_hash)
                    .unwrap()
                    .previous_block_hash;
                if old_chain_hash == [0; 32] {
                    break;
                }
            } else {
                break;
            }
        }

        old_chain
    }

    fn calculate_old_chain_upto_length(
        &mut self,
        latest_block_hash: SaitoHash,
        length: BlockId,
    ) -> Vec<SaitoHash> {
        let mut old_chain: Vec<[u8; 32]> = Vec::new();
        let mut old_chain_hash = latest_block_hash;

        while old_chain.len() <= length as usize {
            if self.blocks.contains_key(&old_chain_hash) {
                old_chain.push(old_chain_hash);
                old_chain_hash = self
                    .blocks
                    .get(&old_chain_hash)
                    .unwrap()
                    .previous_block_hash;
                if old_chain_hash == [0; 32] {
                    break;
                }
            } else {
                break;
            }
        }

        old_chain
    }

    fn calculate_new_chain_for_add_block(
        &mut self,
        block_hash: SaitoHash,
    ) -> (bool, SaitoHash, Vec<SaitoHash>) {
        let mut new_chain: Vec<SaitoHash> = Vec::new();
        let mut shared_ancestor_found = false;
        let mut new_chain_hash = block_hash;

        while !shared_ancestor_found {
            if let Some(block) = self.blocks.get(&new_chain_hash) {
                if block.in_longest_chain {
                    shared_ancestor_found = true;
                    trace!(
                        "shared ancestor found : {:?} at id : {:?}",
                        new_chain_hash.to_hex(),
                        block.id
                    );
                    break;
                } else if new_chain_hash == [0; 32] {
                    break;
                }
                new_chain.push(new_chain_hash);
                new_chain_hash = block.previous_block_hash;
            } else {
                break;
            }
        }

        (shared_ancestor_found, new_chain_hash, new_chain)
    }

    async fn add_block_success(
        &mut self,
        block_hash: SaitoHash,
        storage: &mut Storage,
        mempool: &mut Mempool,
        configs: &(dyn Configuration + Send + Sync),
    ) {
        debug!("add_block_success : {:?}", block_hash.to_hex());

        let block_id;
        let block_type;
        let tx_count;
        // save to disk
        {
            let block = self.get_block(&block_hash).unwrap();
            block_id = block.id;
            block_type = block.block_type;
            tx_count = block.transactions.len();
            if block.block_type != BlockType::Header
                && !configs.is_browser()
                && !configs.is_spv_mode()
            {
                // TODO : this will have an impact when the block sizes are getting large or there are many forks. need to handle this
                storage.write_block_to_disk(block).await;

                let writing_interval = configs
                    .get_blockchain_configs()
                    .issuance_writing_block_interval;

                if writing_interval > 0
                    && block_id >= self.last_issuance_written_on + writing_interval
                {
                    debug!("writing interval : {:?} last issuance written on : {:?}, writing for current block : {}", writing_interval, self.last_issuance_written_on, block_id);
                    self.write_issuance_file(0, "", storage).await;
                    self.last_issuance_written_on = block_id;
                }
            } else if block.block_type == BlockType::Header {
                debug!(
                    "block : {:?} not written to disk as type : {:?}",
                    block.hash.to_hex(),
                    block.block_type
                );
            }

            if let Some(fork_id) = self.generate_fork_id(block_id) {
                if fork_id != [0; 32] {
                    self.set_fork_id(fork_id);
                }
            }

            self.set_safe_to_prune_transaction(block_id);
        }

        // TODO: clean up mempool - I think we shouldn't cleanup mempool here.
        //  because that's already happening in send_blocks_to_blockchain
        //  So who is in charge here?
        //  is send_blocks_to_blockchain calling add_block or
        //  is blockchain calling mempool.on_chain_reorganization?
        self.remove_block_transactions(&block_hash, mempool);

        // ensure pruning of next block OK will have the right CVs
        self.prune_blocks_after_add_block(storage, configs).await;
        debug!(
            "block {:?} added successfully. type : {:?} tx count = {:?}",
            block_hash.to_hex(),
            block_type,
            tx_count
        );
    }

    pub async fn write_issuance_file(
        &self,
        threshold: Currency,
        issuance_file_path: &str,
        storage: &mut Storage,
    ) {
        info!("utxo size : {:?}", self.utxoset.len());

        let data = self.get_utxoset_data();

        info!("{:?} entries in utxo to write to file", data.len());
        let latest_block = self.get_latest_block().unwrap();
        let issuance_path: String;

        if issuance_file_path.is_empty() {
            issuance_path = format!(
                "./data/issuance/archive/block_{}_{}_{}.issuance",
                latest_block.timestamp,
                latest_block.hash.to_hex(),
                latest_block.id
            );
        } else {
            issuance_path = issuance_file_path.to_string();
        }

        info!("opening file : {:?}", issuance_path);

        let mut buffer: Vec<u8> = vec![];
        let slip_type = "Normal";
        let mut aggregated_value = 0;
        let mut total_written_lines = 0;
        for (key, value) in &data {
            if value < &threshold {
                aggregated_value += value;
            } else {
                total_written_lines += 1;
                let key_base58 = key.to_base58();

                let s = format!("{}\t{}\t{}\n", value, key_base58, slip_type);
                let buf = s.as_bytes();
                buffer.extend(buf);
            };
        }

        // add remaining value
        if aggregated_value > 0 {
            total_written_lines += 1;
            let s = format!(
                "{}\t{}\t{}\n",
                aggregated_value,
                PROJECT_PUBLIC_KEY.to_string(),
                slip_type
            );
            let buf = s.as_bytes();
            buffer.extend(buf);
        }

        storage
            .io_interface
            .ensure_block_directory_exists("./data/issuance/archive");

        storage
            .io_interface
            .write_value(issuance_path.as_str(), buffer.as_slice())
            .await
            .expect("issuance file should be written");

        info!("total written lines : {:?}", total_written_lines);
    }

    fn remove_block_transactions(&self, block_hash: &SaitoHash, mempool: &mut Mempool) {
        mempool
            .transactions
            .retain(|_, tx| tx.validate_against_utxoset(&self.utxoset));
        let block = self.get_block(block_hash).unwrap();
        // we call delete_tx after removing invalidated txs, to make sure routing work is calculated after removing all the txs
        mempool.delete_transactions(&block.transactions);
    }

    async fn prune_blocks_after_add_block(
        &mut self,
        storage: &mut Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) {
        if self.get_latest_block_id() > configs.get_consensus_config().unwrap().genesis_period {
            if let Some(pruned_block_hash) =
                self.blockring.get_longest_chain_block_hash_at_block_id(
                    self.get_latest_block_id()
                        - configs.get_consensus_config().unwrap().genesis_period,
                )
            {
                let block = self.get_mut_block(&pruned_block_hash).unwrap();

                block
                    .upgrade_block_to_block_type(BlockType::Pruned, storage, configs.is_spv_mode())
                    .await;
            }
        }
    }

    async fn add_block_failure(&mut self, block_hash: &SaitoHash, mempool: &mut Mempool) {
        info!("add block failed : {:?}", block_hash.to_hex());

        mempool.delete_block(block_hash);
        let block = self.blocks.remove(block_hash);

        if block.is_none() {
            error!(
                "block : {:?} is not found in blocks collection. couldn't handle block failure.",
                block_hash.to_hex()
            );
            return;
        }

        let mut block = block.unwrap();
        self.blockring.delete_block(block.id, block.hash);
        self.add_block_transactions_back(mempool, &mut block).await;
    }

    async fn add_block_transactions_back(&mut self, mempool: &mut Mempool, block: &mut Block) {
        let wallet = mempool.wallet_lock.read().await;
        let public_key = wallet.public_key;
        if block.creator == public_key {
            let transactions = &mut block.transactions;
            let prev_count = transactions.len();

            let transactions: Vec<Transaction> = drain!(transactions, 10)
                .filter(|tx| {
                    // TODO : what other types should be added back to the mempool
                    if tx.transaction_type == TransactionType::Normal {
                        // TODO : is there a way to not validate these again ?
                        return tx.validate(&self.utxoset, self, true);
                    }
                    false
                })
                .collect();
            // transactions.retain(|tx| tx.validate(&self.utxoset));
            info!(
                "adding {:?} transactions back to mempool. dropped {:?} invalid transactions",
                transactions.len(),
                (prev_count - transactions.len())
            );
            for tx in transactions {
                mempool.transactions.insert(tx.signature, tx);
            }
            mempool.new_tx_added = true;
        }
    }

    pub fn generate_fork_id(&self, block_id: u64) -> Option<ForkId> {
        let mut fork_id: ForkId = [0; 32];
        let mut current_block_id = block_id;

        // roll back to last even 10 blocks
        current_block_id = current_block_id - (current_block_id % 10);
        trace!(
            "generate_fork_id : {:?} -> {:?}",
            block_id,
            current_block_id
        );

        // loop backwards through blockchain
        for (i, weight) in FORK_ID_WEIGHTS.iter().enumerate() {
            if current_block_id <= *weight {
                debug!(
                    "generating fork id for block : {:?}. current_id : {:?} is less than weight : {:?}",
                    block_id,
                    current_block_id, weight
                );
                break;
            }
            current_block_id -= weight;

            // index to update

            let index = 2 * i;
            if let Some(block_hash) = self
                .blockring
                .get_longest_chain_block_hash_at_block_id(current_block_id)
            {
                fork_id[index] = block_hash[index];
                fork_id[index + 1] = block_hash[index + 1];
            } else {
                debug!(
                    "no block at block id : {:?} in the longest chain",
                    current_block_id
                );
                break;
                // return None;
            }
        }

        Some(fork_id)
    }

    pub fn generate_last_shared_ancestor(
        &self,
        peer_latest_block_id: u64,
        fork_id: SaitoHash,
    ) -> u64 {
        let my_latest_block_id = self.get_latest_block_id();

        debug!(
            "generate last shared ancestor : peer_latest_id : {:?}, fork_id : {:?} my_latest_id : {:?}",
            peer_latest_block_id,
            fork_id.to_hex(),
            my_latest_block_id
        );

        if peer_latest_block_id >= my_latest_block_id {
            if let Some(value) = self.generate_last_shared_ancestor_when_peer_ahead(
                peer_latest_block_id,
                fork_id,
                my_latest_block_id,
            ) {
                return value;
            }
        } else if let Some(value) = self.generate_last_shared_ancestor_when_peer_behind(
            peer_latest_block_id,
            fork_id,
            my_latest_block_id,
        ) {
            return value;
        }

        debug!("no shared ancestor found. returning 0");
        // no match? return 0 -- no shared ancestor
        0
    }

    fn generate_last_shared_ancestor_when_peer_behind(
        &self,
        peer_latest_block_id: u64,
        fork_id: SaitoHash,
        my_latest_block_id: u64,
    ) -> Option<u64> {
        let mut block_id = peer_latest_block_id;
        block_id = block_id - (block_id % 10);

        debug!(
            "generate_last_shared_ancestor_when_peer_behind peer_block_id : {:?}, my_block_id : {:?}",
            peer_latest_block_id,
            my_latest_block_id
        );
        for (index, weight) in FORK_ID_WEIGHTS.iter().enumerate() {
            if block_id < *weight {
                trace!(
                    "my_block_id : {:?} is less than weight : {:?}. returning 0",
                    block_id,
                    weight
                );
                return Some(0);
            }
            block_id -= weight;
            trace!(
                "block_id : {:?} , weight : {:?} , index : {:?}",
                block_id,
                weight,
                index
            );

            // index in fork_id hash
            let index = 2 * index;

            // compare input hash to my hash
            if let Some(block_hash) = self
                .blockring
                .get_longest_chain_block_hash_at_block_id(block_id)
            {
                trace!(
                    "comparing {:?} vs {:?} at block_id : {}",
                    hex::encode(&fork_id[index..=index + 1]),
                    hex::encode(&block_hash[index..=index + 1]),
                    block_id
                );
                if fork_id[index] == block_hash[index]
                    && fork_id[index + 1] == block_hash[index + 1]
                {
                    return Some(block_id);
                }
            } else {
                trace!("cannot find longest chain hash for : {:?}", block_id);
            }
        }
        None
    }

    fn generate_last_shared_ancestor_when_peer_ahead(
        &self,
        peer_latest_block_id: u64,
        fork_id: SaitoHash,
        my_latest_block_id: u64,
    ) -> Option<u64> {
        let mut block_id = my_latest_block_id;
        // roll back to last even 10 blocks
        block_id = block_id - (block_id % 10);
        debug!(
            "generate_last_shared_ancestor_when_peer_ahead peer_block_id : {:?}, my_block_id : {:?}",
            peer_latest_block_id,
            my_latest_block_id
        );

        // their fork id
        for (index, weight) in FORK_ID_WEIGHTS.iter().enumerate() {
            if block_id < *weight {
                trace!(
                    "peer_block_id : {:?} is less than weight : {:?}. returning 0",
                    block_id,
                    weight
                );
                return Some(0);
            }
            block_id -= weight;
            trace!(
                "block_id : {:?} , weight : {:?} , index : {:?}",
                block_id,
                weight,
                index
            );

            // index in fork_id hash
            let index = 2 * index;

            // compare input hash to my hash
            if let Some(block_hash) = self
                .blockring
                .get_longest_chain_block_hash_at_block_id(block_id)
            {
                trace!(
                    "comparing {:?} vs {:?} at block_id : {}",
                    hex::encode(&fork_id[index..=index + 1]),
                    hex::encode(&block_hash[index..=index + 1]),
                    block_id
                );
                if fork_id[index] == block_hash[index]
                    && fork_id[index + 1] == block_hash[index + 1]
                {
                    return Some(block_id);
                }
            } else {
                trace!("cannot find longest chain hash for : {:?}", block_id);
            }
        }
        None
    }
    fn print(&self, count: u64, configs: &(dyn Configuration + Send + Sync)) {
        let latest_block_id = self.get_latest_block_id();
        let mut current_id = latest_block_id;

        let mut min_id = 0;
        if latest_block_id > count {
            min_id = latest_block_id - count;
        }
        debug!("------------------------------------------------------");
        while current_id > 0 && current_id >= min_id {
            if current_id < (2 * configs.get_consensus_config().unwrap().genesis_period) {
                break;
            }

            if let Some(hash) = self
                .blockring
                .get_longest_chain_block_hash_at_block_id(current_id)
            {
                if hash == [0; 32] {
                    break;
                }
                debug!("{} - {:?}", current_id, hash.to_hex());
                current_id -= 1;
            } else {
                break;
            }
        }
        debug!("------------------------------------------------------");
    }

    pub fn get_latest_block(&self) -> Option<&Block> {
        let block_hash = self.blockring.get_latest_block_hash();
        self.blocks.get(&block_hash)
    }

    pub fn get_latest_block_hash(&self) -> SaitoHash {
        self.blockring.get_latest_block_hash()
    }

    pub fn get_latest_block_id(&self) -> BlockId {
        self.blockring.get_latest_block_id()
    }

    pub fn get_latest_unlocked_stake_block_id(&self) -> BlockId {
        // if we have any time to unlock slips
        if self.get_latest_block_id() > self.social_stake_period {
            // we check for next block's id
            self.get_latest_block_id() + 1 - self.social_stake_period
        } else {
            0
        }
    }

    pub fn get_block_sync(&self, block_hash: &SaitoHash) -> Option<&Block> {
        self.blocks.get(block_hash)
    }

    pub fn get_block(&self, block_hash: &SaitoHash) -> Option<&Block> {
        self.blocks.get(block_hash)
    }

    pub fn get_mut_block(&mut self, block_hash: &SaitoHash) -> Option<&mut Block> {
        self.blocks.get_mut(block_hash)
    }

    pub fn is_block_indexed(&self, block_hash: SaitoHash) -> bool {
        self.blocks.contains_key(&block_hash)
    }

    pub fn contains_block_hash_at_block_id(&self, block_id: u64, block_hash: SaitoHash) -> bool {
        self.blockring
            .contains_block_hash_at_block_id(block_id, block_hash)
    }

    fn is_new_chain_the_longest_chain(
        &self,
        new_chain: &[SaitoHash],
        old_chain: &[SaitoHash],
    ) -> bool {
        trace!("checking for longest chain");
        if self.blockring.is_empty() {
            return true;
        }
        if old_chain.len() > new_chain.len() {
            warn!(
                "WARN: old chain length : {:?} is greater than new chain length : {:?}",
                old_chain.len(),
                new_chain.len()
            );
            return false;
        }

        if self.blockring.get_latest_block_id() >= self.blocks.get(&new_chain[0]).unwrap().id {
            debug!(
                "blockring latest : {:?} >= new chain block id : {:?}",
                self.blockring.get_latest_block_id(),
                self.blocks.get(&new_chain[0]).unwrap().id
            );
            return false;
        }

        let mut old_bf: Currency = 0;
        let mut new_bf: Currency = 0;

        for hash in old_chain.iter() {
            old_bf += self.blocks.get(hash).unwrap().burnfee;
        }
        for hash in new_chain.iter() {
            if let Some(x) = self.blocks.get(hash) {
                new_bf += x.burnfee;
            } else {
                trace!(
                    "block : {:?} in the new chain cannot be found",
                    hash.to_hex()
                );
                return false;
            }
            //new_bf += self.blocks.get(hash).unwrap().get_burnfee();
        }
        trace!(
            "old chain len : {:?} new chain len : {:?} old_bf : {:?} new_bf : {:?}",
            old_chain.len(),
            new_chain.len(),
            old_bf,
            new_bf
        );

        // new chain must have more accumulated work AND be longer
        old_chain.len() < new_chain.len() && old_bf <= new_bf
    }

    /// when new_chain and old_chain are generated the block_hashes are added
    /// to their vectors from tip-to-shared-ancestors. if the shared ancestors
    /// is at position [0] in our blockchain for instance, we may receive:
    ///
    /// new_chain --> adds the hashes in this order
    /// [5] [4] [3] [2] [1]
    ///
    /// old_chain --> adds the hashes in this order
    /// [4] [3] [2] [1]
    ///
    /// unwinding requires starting from the BEGINNING of the vector, while
    /// winding requires starting from th END of the vector. the loops move
    /// in opposite directions.
    async fn validate(
        &mut self,
        new_chain: &[SaitoHash],
        old_chain: &[SaitoHash],
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) -> (bool, WalletUpdateStatus) {
        debug!(
            "validating chains. latest : {:?} new_chain_len : {:?} old_chain_len : {:?}",
            self.get_latest_block_id(),
            new_chain.len(),
            old_chain.len()
        );

        let previous_block_hash;
        let mut wallet_update_status = WALLET_NOT_UPDATED;
        let has_gt;
        {
            let block = self.blocks.get(new_chain[0].as_ref()).unwrap();
            previous_block_hash = block.previous_block_hash;
            has_gt = block.has_golden_ticket;
        }

        // ensure new chain has adequate mining support to be considered as
        // a viable chain. we handle this check here as opposed to handling
        // it in wind_chain as we only need to check once for the entire chain
        if !self.is_golden_ticket_count_valid(
            previous_block_hash,
            has_gt,
            configs.is_browser(),
            configs.is_spv_mode(),
        ) {
            debug!("gt count is not valid");
            return (false, WALLET_NOT_UPDATED);
        }

        if old_chain.is_empty() {
            let mut result: WindingResult =
                WindingResult::Wind(new_chain.len() - 1, false, WALLET_NOT_UPDATED);
            loop {
                match result {
                    WindingResult::Wind(current_wind_index, wind_failure, wallet_status) => {
                        wallet_update_status |= wallet_status;

                        result = self
                            .wind_chain(
                                new_chain,
                                old_chain,
                                current_wind_index,
                                wind_failure,
                                storage,
                                configs,
                            )
                            .await;
                    }
                    WindingResult::Unwind(
                        current_unwind_index,
                        wind_failure,
                        old_chain,
                        wallet_status,
                    ) => {
                        wallet_update_status |= wallet_status;
                        result = self
                            .unwind_chain(
                                new_chain,
                                old_chain.as_slice(),
                                current_unwind_index,
                                wind_failure,
                                storage,
                                configs,
                            )
                            .await;
                    }
                    WindingResult::FinishWithSuccess(wallet_updated) => {
                        return (true, wallet_update_status | wallet_updated)
                    }
                    WindingResult::FinishWithFailure => return (false, wallet_update_status),
                }
            }
        } else if !new_chain.is_empty() {
            let mut result = WindingResult::Unwind(0, true, old_chain.to_vec(), WALLET_NOT_UPDATED);
            loop {
                match result {
                    WindingResult::Wind(current_wind_index, wind_failure, wallet_status) => {
                        wallet_update_status |= wallet_status;
                        result = self
                            .wind_chain(
                                new_chain,
                                old_chain,
                                current_wind_index,
                                wind_failure,
                                storage,
                                configs,
                            )
                            .await;
                    }
                    WindingResult::Unwind(
                        current_wind_index,
                        wind_failure,
                        old_chain,
                        wallet_status,
                    ) => {
                        wallet_update_status |= wallet_status;
                        result = self
                            .unwind_chain(
                                new_chain,
                                old_chain.as_slice(),
                                current_wind_index,
                                wind_failure,
                                storage,
                                configs,
                            )
                            .await;
                    }
                    WindingResult::FinishWithSuccess(wallet_updated) => {
                        return (true, wallet_update_status | wallet_updated);
                    }
                    WindingResult::FinishWithFailure => {
                        return (false, wallet_update_status);
                    }
                }
            }
        } else {
            warn!("lengths are inappropriate");
            (false, wallet_update_status)
        }
    }

    pub fn is_golden_ticket_count_valid(
        &self,
        previous_block_hash: SaitoHash,
        current_block_has_golden_ticket: bool,
        is_browser: bool,
        is_spv: bool,
    ) -> bool {
        is_golden_ticket_count_valid_(
            previous_block_hash,
            current_block_has_golden_ticket,
            is_browser || is_spv,
            |hash| self.get_block_sync(&hash),
        )
    }

    // when new_chain and old_chain are generated the block_hashes are added
    // to their vectors from tip-to-shared-ancestors. if the shared ancestors
    // is at position [0] for instance, we may receive:
    //
    // new_chain --> adds the hashes in this order
    //   [5] [4] [3] [2] [1]
    //
    // old_chain --> adds the hashes in this order
    //   [4] [3] [2] [1]
    //
    // unwinding requires starting from the BEGINNING of the vector, while
    // winding requires starting from the END of the vector. the loops move
    // in opposite directions. the argument current_wind_index is the
    // position in the vector NOT the ordinal number of the block_hash
    // being processed. we start winding with current_wind_index 4 not 0.
    async fn wind_chain(
        &mut self,
        new_chain: &[SaitoHash],
        old_chain: &[SaitoHash],
        current_wind_index: usize,
        wind_failure: bool,
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) -> WindingResult {
        // trace!(" ... blockchain.wind_chain strt: {:?}", create_timestamp());

        debug!(
            "wind_chain: current_wind_index : {:?} new_chain_len: {:?} old_chain_len: {:?} failed : {:?}",
            current_wind_index,new_chain.len(),old_chain.len(), wind_failure
        );

        // if we are winding a non-existent chain with a wind_failure it
        // means our wind attempt failed, and we should move directly into
        // add_block_failure() by returning false.
        if wind_failure && new_chain.is_empty() {
            return WindingResult::FinishWithFailure;
        }

        // winding the chain requires us to have certain data associated
        // with the block and the transactions, particularly the tx hashes
        // that we need to generate the slip UUIDs and create the tx sigs.
        //
        // we fetch the block mutably first in order to update these vars.
        // we cannot just send the block mutably into our regular validate()
        // function because of limitatins imposed by Rust on mutable data
        // structures. So validation is "read-only" and our "write" actions
        // happen first.
        let block_hash = new_chain.get(current_wind_index).unwrap();

        debug!("winding hash: {:?}", block_hash.to_hex());
        self.upgrade_blocks_for_wind_chain(storage, configs, block_hash)
            .await;

        let block = self.blocks.get(block_hash).unwrap();
        if block.has_checkpoint {
            info!("block has checkpoint. cannot wind over this block");
            return WindingResult::FinishWithFailure;
        }
        let does_block_validate;
        {
            debug!("winding hash validates: {:?}", block_hash.to_hex());
            let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
            let validate_against_utxo = self.has_total_supply_loaded(genesis_period);

            does_block_validate = block
                .validate(self, &self.utxoset, configs, storage, validate_against_utxo)
                .await;

            if !does_block_validate {
                debug!("latest_block_id = {:?}", self.get_latest_block_id());
                debug!("genesis_block_id = {:?}", self.genesis_block_id);
                debug!(
                    "genesis_period = {:?}",
                    configs.get_consensus_config().unwrap().genesis_period
                );
            }
        }

        let mut wallet_updated = WALLET_NOT_UPDATED;

        if does_block_validate {
            // blockring update
            self.blockring
                .on_chain_reorganization(block.id, block.hash, true);

            // TODO - wallet update should be optional, as core routing nodes
            //  will not want to do the work of scrolling through the block and
            //  updating their wallets by default. wallet processing can be
            //  more efficiently handled by lite-nodes.
            {
                let mut wallet = self.wallet_lock.write().await;

                wallet_updated |= wallet.on_chain_reorganization(
                    block,
                    true,
                    configs.get_consensus_config().unwrap().genesis_period,
                );
            }
            let block_id = block.id;

            // utxoset update
            {
                let block = self.blocks.get_mut(block_hash).unwrap();
                block.on_chain_reorganization(&mut self.utxoset, true);
            }

            wallet_updated |= self
                .on_chain_reorganization(block_id, *block_hash, true, storage, configs)
                .await;

            // we have received the first entry in new_blocks() which means we
            // have added the latest tip. if the variable wind_failure is set
            // that indicates that we ran into an issue when winding the new_chain
            // and what we have just processed is the old_chain (being rewound)
            // so we should exit with failure.
            //
            // otherwise we have successfully wound the new chain, and exit with
            // success.
            if current_wind_index == 0 {
                if wind_failure {
                    return WindingResult::FinishWithFailure;
                }
                return WindingResult::FinishWithSuccess(wallet_updated);
            }

            WindingResult::Wind(current_wind_index - 1, false, wallet_updated)
        } else {
            // we have had an error while winding the chain. this requires us to
            // unwind any blocks we have already wound, and rewind any blocks we
            // have unwound.
            //
            // we set wind_failure to "true" so that when we reach the end of
            // the process of rewinding the old-chain, our wind_chain function
            // will know it has rewound the old chain successfully instead of
            // successfully added the new chain.
            error!(
                "ERROR: this block : {:?} : {:?} does not validate!",
                block.id,
                block.hash.to_hex()
            );
            if current_wind_index == new_chain.len() - 1 {
                // this is the first block we have tried to add
                // and so we can just roll out the older chain
                // again as it is known good.
                //
                // note that old and new hashes are swapped
                // and the old chain is set as null because
                // we won't move back to it. we also set the
                // resetting_flag to 1 so we know to fork
                // into addBlockToBlockchainFailure
                //
                // true -> force -> we had issues, is failure
                //
                // new_chain --> hashes are still in this order
                //   [5] [4] [3] [2] [1]
                //
                // we are at the beginning of our own vector so we have nothing
                // to unwind. Because of this, we start WINDING the old chain back
                // which requires us to start at the END of the new chain vector.
                if !old_chain.is_empty() {
                    debug!("old chain len: {}", old_chain.len());
                    WindingResult::Wind(old_chain.len() - 1, true, wallet_updated)
                } else {
                    debug!("old chain is empty. finishing with failure");
                    WindingResult::FinishWithFailure
                }
            } else {
                let mut chain_to_unwind: Vec<SaitoHash> = vec![];

                // if we run into a problem winding our chain after we have
                // wound any blocks, we take the subset of the blocks we have
                // already pushed through on_chain_reorganization (i.e. not
                // including this block!) and put them onto a new vector we
                // will unwind in turn.
                for i in current_wind_index + 1..new_chain.len() {
                    chain_to_unwind.push(new_chain[i]);
                }

                // chain to unwind is now something like this...
                //
                //  [3] [2] [1]
                //
                // unwinding starts from the BEGINNING of the vector
                WindingResult::Unwind(0, true, chain_to_unwind, wallet_updated)
            }
        }
    }

    ///  ensure previous blocks that may be needed to calculate the staking
    ///  tables or the nolan that are potentially falling off the chain have
    ///  full access to their transaction data.
    ///
    /// # Arguments
    ///
    /// * `storage`:
    /// * `configs`:
    /// * `block_hash`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    async fn upgrade_blocks_for_wind_chain(
        &mut self,
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
        block_hash: &SaitoHash,
    ) {
        debug!(
            "upgrading blocks for wind chain... : {:?}",
            block_hash.to_hex()
        );
        let block = self.get_mut_block(block_hash).unwrap();

        block
            .upgrade_block_to_block_type(BlockType::Full, storage, configs.is_spv_mode())
            .await;

        let latest_block_id: BlockId = block.id;
        for i in 1..configs
            .get_consensus_config()
            .unwrap()
            .max_staker_recursions
        {
            if i >= latest_block_id {
                break;
            }
            let bid = latest_block_id - i;
            if let Some(previous_block_hash) =
                self.blockring.get_longest_chain_block_hash_at_block_id(bid)
            {
                if self.is_block_indexed(previous_block_hash) {
                    let block = self.get_mut_block(&previous_block_hash).unwrap();
                    block
                        .upgrade_block_to_block_type(
                            BlockType::Full,
                            storage,
                            configs.is_spv_mode(),
                        )
                        .await;
                }
            }
        }
    }

    fn has_total_supply_loaded(&self, genesis_period: BlockId) -> bool {
        let has_genesis_block = self
            .blockring
            .get_longest_chain_block_hash_at_block_id(1)
            .is_some();
        let latest_block_id = self.get_latest_block_id();
        let mut has_genesis_period_of_blocks = false;
        if latest_block_id > genesis_period {
            let result = self
                .blockring
                .get_longest_chain_block_hash_at_block_id(latest_block_id - genesis_period);
            has_genesis_period_of_blocks = result.is_some();
        }
        has_genesis_block || has_genesis_period_of_blocks
    }

    // when new_chain and old_chain are generated the block_hashes are pushed
    // to their vectors from tip-to-shared-ancestors. if the shared ancestors
    // is at position [0] for instance, we may receive:
    //
    // new_chain --> adds the hashes in this order
    //   [5] [4] [3] [2] [1]
    //
    // old_chain --> adds the hashes in this order
    //   [4] [3] [2] [1]
    //
    // unwinding requires starting from the BEGINNING of the vector, while
    // winding requires starting from the END of the vector. the first
    // block we have to remove in the old_chain is thus at position 0, and
    // walking up the vector from there until we reach the end.
    //
    async fn unwind_chain(
        &mut self,
        new_chain: &[SaitoHash],
        old_chain: &[SaitoHash],
        current_unwind_index: usize,
        wind_failure: bool,
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) -> WindingResult {
        debug!(
            "unwind_chain: current_wind_index : {:?} new_chain_len: {:?} old_chain_len: {:?} failed : {:?}",
            current_unwind_index,new_chain.len(),old_chain.len(), wind_failure
        );
        let block_id;
        let block_hash;
        let mut wallet_updated = WALLET_NOT_UPDATED;
        {
            let block = self
                .blocks
                .get_mut(&old_chain[current_unwind_index])
                .unwrap();
            if block.has_checkpoint {
                info!("block has checkpoint. cannot unwind over this block");
                return WindingResult::FinishWithFailure;
            }
            block
                .upgrade_block_to_block_type(BlockType::Full, storage, configs.is_spv_mode())
                .await;
            block_id = block.id;
            block_hash = block.hash;

            debug!(
                "unwinding hash: {:?} w/id {:?}",
                block_hash.to_hex(),
                block_id
            );
            // utxoset update
            block.on_chain_reorganization(&mut self.utxoset, false);

            // blockring update
            self.blockring
                .on_chain_reorganization(block.id, block.hash, false);

            // wallet update
            let mut wallet = self.wallet_lock.write().await;
            wallet_updated |= wallet.on_chain_reorganization(
                block,
                false,
                configs.get_consensus_config().unwrap().genesis_period,
            );
        }
        wallet_updated |= self
            .on_chain_reorganization(block_id, block_hash, false, storage, configs)
            .await;
        if current_unwind_index == old_chain.len() - 1 {
            // start winding new chain
            //
            // new_chain --> adds the hashes in this order
            //   [5] [4] [3] [2] [1]
            //
            // old_chain --> adds the hashes in this order
            //   [4] [3] [2] [1]
            //
            // winding requires starting at the END of the vector and rolling
            // backwards until we have added block #5, etc.
            WindingResult::Wind(new_chain.len() - 1, wind_failure, wallet_updated)
        } else {
            // continue unwinding,, which means
            //
            // unwinding requires moving FORWARD in our vector (and backwards in
            // the blockchain). So we increment our unwind index.
            WindingResult::Unwind(
                current_unwind_index + 1,
                wind_failure,
                old_chain.to_vec(),
                wallet_updated,
            )
        }
    }

    /// keeps any blockchain variables like fork_id or genesis_period
    /// tracking variables updated as the chain gets new blocks. also
    /// pre-loads any blocks needed to improve performance.
    pub async fn on_chain_reorganization(
        &mut self,
        block_id: u64,
        block_hash: SaitoHash,
        longest_chain: bool,
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) -> WalletUpdateStatus {
        debug!(
            "blockchain.on_chain_reorganization : block_id = {:?} block_hash = {:?}",
            block_id,
            block_hash.to_hex()
        );

        let mut wallet_updated: WalletUpdateStatus = WALLET_NOT_UPDATED;
        // skip out if earlier than we need to be vis-à-vis last_block_id
        if self.last_block_id >= block_id {
            debug!(
                "last block id : {:?} is later than this block id : {:?}. skipping reorg",
                self.last_block_id, block_id
            );
            self.downgrade_blockchain_data(configs).await;
            return true;
        }

        if longest_chain {
            let block = self.blocks.get(&block_hash);
            if let Some(block) = block {
                self.last_block_id = block_id;
                self.last_block_hash = block.hash;
                self.last_timestamp = block.timestamp;
                self.last_burnfee = block.burnfee;

                if self.lowest_acceptable_timestamp == 0 {
                    self.lowest_acceptable_block_id = block_id;
                    self.lowest_acceptable_block_hash = block.hash;
                    self.lowest_acceptable_timestamp = block.timestamp;
                }
            } else {
                warn!("block not found for hash : {:?}", block_hash.to_hex());
            }

            // update genesis period, purge old data
            wallet_updated |= self.update_genesis_period(storage, configs).await;

            // generate fork_id
            if let Some(fork_id) = self.generate_fork_id(block_id) {
                if fork_id != [0; 32] {
                    self.set_fork_id(fork_id);
                }
            } else {
                debug!(
                    "cannot set fork id as fork id cannot be generated for block id : {:?}",
                    block_id
                );
            }
        }

        self.downgrade_blockchain_data(configs).await;

        wallet_updated
    }

    async fn update_genesis_period(
        &mut self,
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) -> WalletUpdateStatus {
        // we need to make sure this is not a random block that is disconnected
        // from our previous genesis_id. If there is no connection between it
        // and us, then we cannot delete anything as otherwise the provision of
        // the block may be an attack on us intended to force us to discard
        // actually useful data.
        //
        // so we check that our block is the head of the longest-chain and only
        // update the genesis period when that is the case.
        let latest_block_id = self.get_latest_block_id();
        let block_limit = configs.get_consensus_config().unwrap().genesis_period * 2 + 1;
        debug!(
            "latest block id : {:?} block limit : {:?}. upgrading genesis_period. : {:?}",
            latest_block_id,
            block_limit,
            latest_block_id >= block_limit
        );
        if latest_block_id >= block_limit {
            // prune blocks
            let purge_bid =
                latest_block_id - (configs.get_consensus_config().unwrap().genesis_period * 2);
            self.genesis_block_id =
                latest_block_id - configs.get_consensus_config().unwrap().genesis_period;
            debug!("genesis block id set as : {:?}", self.genesis_block_id);

            // in either case, we are OK to throw out everything below the
            // lowest_block_id that we have found. we use the purge_id to
            // handle purges.
            if purge_bid > 0 {
                return self.delete_blocks(purge_bid, storage).await;
            }
        }

        WALLET_NOT_UPDATED
        //TODO: we already had in update_genesis_period() in self method - maybe no need to call here?
        // self.downgrade_blockchain_data().await;
    }

    /// deletes all blocks at a single block_id
    async fn delete_blocks(
        &mut self,
        delete_block_id: u64,
        storage: &Storage,
    ) -> WalletUpdateStatus {
        info!("removing blocks from disk at id {}", delete_block_id);

        let mut block_hashes_copy: Vec<SaitoHash> = vec![];

        {
            let block_hashes = self.blockring.get_block_hashes_at_block_id(delete_block_id);
            for hash in block_hashes {
                block_hashes_copy.push(hash);
            }
        }

        trace!("number of hashes to remove {}", block_hashes_copy.len());

        let mut wallet_update_status = WALLET_NOT_UPDATED;
        for hash in block_hashes_copy {
            let status = self.delete_block(delete_block_id, hash, storage).await;
            wallet_update_status |= status;
        }
        wallet_update_status
    }

    /// deletes a single block
    async fn delete_block(
        &mut self,
        delete_block_id: u64,
        delete_block_hash: SaitoHash,
        storage: &Storage,
    ) -> WalletUpdateStatus {
        let wallet_update_status;
        // ask block to delete itself / utxo-wise
        {
            let block = self.blocks.get(&delete_block_hash).unwrap();
            let block_filename = storage.generate_block_filepath(block);

            // remove slips from wallet
            {
                let mut wallet = self.wallet_lock.write().await;

                wallet_update_status = wallet.delete_block(block);
            }
            // removes utxoset data
            block.delete(&mut self.utxoset).await;

            // deletes block from disk
            storage
                .delete_block_from_disk(block_filename.as_str())
                .await;
        }

        // ask blockring to remove
        self.blockring
            .delete_block(delete_block_id, delete_block_hash);

        // remove from block index
        if self.blocks.contains_key(&delete_block_hash) {
            self.blocks.remove_entry(&delete_block_hash);
        }

        wallet_update_status
    }

    async fn downgrade_blockchain_data(&mut self, configs: &(dyn Configuration + Send + Sync)) {
        // downgrade blocks still on the chain
        if configs.get_consensus_config().unwrap().prune_after_blocks > self.get_latest_block_id() {
            return;
        }
        let prune_blocks_at_block_id =
            self.get_latest_block_id() - configs.get_consensus_config().unwrap().prune_after_blocks;
        let mut block_hashes_copy: Vec<SaitoHash> = vec![];
        debug!(
            "downgrading blockchain data. latest block id : {:?}. prune blocks at : {:?}",
            self.get_latest_block_id(),
            prune_blocks_at_block_id
        );

        {
            let block_hashes = self
                .blockring
                .get_block_hashes_at_block_id(prune_blocks_at_block_id);
            for hash in block_hashes {
                block_hashes_copy.push(hash);
            }
        }

        for hash in block_hashes_copy {
            // ask the block to remove its transactions
            {
                let block = self.get_mut_block(&hash);
                if let Some(block) = block {
                    if block.safe_to_prune_transactions {
                        block
                            .downgrade_block_to_block_type(BlockType::Pruned, configs.is_spv_mode())
                            .await;
                    }
                } else {
                    warn!("block : {:?} not found to downgrade", hash.to_hex());
                }
            }
        }
    }
    pub async fn add_blocks_from_mempool(
        &mut self,
        mempool_lock: Arc<RwLock<Mempool>>,
        network: Option<&Network>,
        storage: &mut Storage,
        sender_to_miner: Option<Sender<MiningEvent>>,
        sender_to_router: Option<Sender<RoutingEvent>>,
        configs: &(dyn Configuration + Send + Sync),
    ) {
        debug!("adding blocks from mempool to blockchain");
        let mut blocks: VecDeque<Block>;
        {
            let mut mempool = mempool_lock.write().await;

            blocks = mempool.blocks_queue.drain(..).collect();
            blocks.make_contiguous().sort_by(|a, b| a.id.cmp(&b.id));

            debug!("blocks to add : {:?}", blocks.len());
            while let Some(block) = blocks.pop_front() {
                let peer_index = block.routed_from_peer;
                let block_id = block.id;
                let result = self.add_block(block, storage, &mut mempool, configs).await;
                match result {
                    AddBlockResult::BlockAddedSuccessfully(
                        block_hash,
                        in_longest_chain,
                        wallet_updated,
                    ) => {
                        let sender_to_miner = if blocks.is_empty() {
                            sender_to_miner.clone()
                        } else {
                            None
                        };

                        // check for any checkpoint data and process them
                        if let Some(checkpoints) =
                            storage.load_checkpoint_file(&block_hash, block_id).await
                        {
                            let mut wallet = self.wallet_lock.write().await;
                            for key in checkpoints {
                                if let Some((key, _)) = self.utxoset.remove_entry(&key) {
                                    if let Ok(slip) = Slip::parse_slip_from_utxokey(&key) {
                                        wallet.delete_slip(&slip, None);
                                        let block = self.blocks.get_mut(&block_hash).unwrap();
                                        block.graveyard += slip.amount;
                                        block.has_checkpoint = true;
                                        self.checkpoint_found = true;
                                        info!("skipping slip : {} according to the checkpoint file : {}-{}",
                                            slip,block_id,block_hash.to_hex());
                                    } else {
                                        error!("Key : {:?} in checkpoint file : {}-{} cannot be parsed to a slip", key.to_hex(),block_id,block_hash.to_hex());
                                        panic!("cannot continue loading blocks");
                                    }
                                }
                            }
                        }

                        // TODO : to fix blocks being pruned before js processing them, pass a parameter in add_block to not prune and then prune manually after adding all.
                        //  need to do that in batches to make sure too much memory is not being used.
                        self.handle_successful_block_addition(
                            network,
                            sender_to_miner,
                            sender_to_router.clone(),
                            configs.is_spv_mode(),
                            block_hash,
                            in_longest_chain,
                            wallet_updated,
                        )
                        .await;
                    }
                    AddBlockResult::BlockAlreadyExists => {}
                    AddBlockResult::FailedButRetry(block, fetch_prev_block, fetch_blockchain) => {
                        Self::handle_failed_block_to_be_retried(
                            sender_to_router.clone(),
                            &mut mempool,
                            block,
                            fetch_prev_block,
                            fetch_blockchain,
                        )
                        .await;
                    }
                    AddBlockResult::FailedNotValid => {
                        if let Some(peer_index) = peer_index {
                            let mut peers = network.unwrap().peer_lock.write().await;
                            if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
                                peer.invalid_block_limiter.increase();
                            }
                        }
                    }
                }
            }

            if sender_to_miner.is_some() {
                self.print(10, configs);
            }

            debug!(
                "added blocks to blockchain. added back : {:?}",
                mempool.blocks_queue.len()
            );
        }

        let mut wallet = self.wallet_lock.write().await;
        Wallet::save(&mut wallet, storage.io_interface.as_ref()).await;
    }

    async fn handle_successful_block_addition(
        &mut self,
        network: Option<&Network>,
        sender_to_miner: Option<Sender<MiningEvent>>,
        sender_to_router: Option<Sender<RoutingEvent>>,
        is_spv_mode: bool,
        block_hash: BlockHash,
        in_longest_chain: bool,
        wallet_updated: WalletUpdateStatus,
    ) {
        let block = self
            .blocks
            .get(&block_hash)
            .expect("block should be here since it was added successfully");

        if sender_to_miner.is_some() && in_longest_chain {
            debug!("sending longest chain block added event to miner : hash : {:?} difficulty : {:?} channel_capacity : {:?}",
                block_hash.to_hex(), block.difficulty, sender_to_miner.as_ref().unwrap().capacity());
            sender_to_miner
                .unwrap()
                .send(MiningEvent::LongestChainBlockAdded {
                    hash: block_hash,
                    difficulty: block.difficulty,
                    block_id: block.id,
                })
                .await
                .unwrap();
        }

        if let Some(network) = network {
            network
                .io_interface
                .send_interface_event(InterfaceEvent::BlockAddSuccess(block_hash, block.id));

            if wallet_updated {
                network
                    .io_interface
                    .send_interface_event(InterfaceEvent::WalletUpdate());
            } else {
                debug!("not updating wallet for block : {:?}", block_hash.to_hex());
            }

            if !is_spv_mode {
                network.propagate_block(block).await;
            }
        }

        if let Some(sender) = sender_to_router {
            debug!("sending blockchain updated event to router. channel_capacity : {:?} block_hash : {:?}", sender.capacity(),block_hash.to_hex());
            sender
                .send(RoutingEvent::BlockchainUpdated(block_hash))
                .await
                .unwrap();
        }
    }

    async fn handle_failed_block_to_be_retried(
        sender_to_router: Option<Sender<RoutingEvent>>,
        mempool: &mut Mempool,
        block: Block,
        fetch_prev_block: bool,
        fetch_blockchain: bool,
    ) {
        debug!("adding block : {:?} back to mempool so it can be processed again after the previous block : {:?} is added",
                                    block.hash.to_hex(),
                                    block.previous_block_hash.to_hex());

        if let Some(sender) = sender_to_router.as_ref() {
            if fetch_blockchain {
                sender
                    .send(RoutingEvent::BlockchainRequest(
                        block.routed_from_peer.unwrap(),
                    ))
                    .await
                    .expect("sending blockchain request failed");
            } else if fetch_prev_block {
                sender
                    .send(RoutingEvent::BlockFetchRequest(
                        block.routed_from_peer.unwrap_or(0),
                        block.previous_block_hash,
                        block.id - 1,
                    ))
                    .await
                    .expect("sending block fetch request failed");
            }
        }

        mempool.add_block(block);
    }

    pub fn add_ghost_block(
        &mut self,
        id: u64,
        previous_block_hash: SaitoHash,
        ts: Timestamp,
        pre_hash: SaitoHash,
        gt: bool,
        hash: SaitoHash,
    ) {
        debug!(
            "adding ghost block : {:?}-{:?} prev_block : {:?} ts : {:?}",
            id,
            hash.to_hex(),
            previous_block_hash.to_hex(),
            ts
        );
        let ring_buffer_size = self.blockring.get_ring_buffer_size();
        let mut block = Block::new();
        block.id = id;
        block.previous_block_hash = previous_block_hash;
        block.timestamp = ts;
        block.has_golden_ticket = gt;
        block.pre_hash = pre_hash;
        block.hash = hash;
        block.block_type = BlockType::Ghost;

        if self.is_block_indexed(hash) {
            warn!("block :{:?} exists in blockchain", hash.to_hex());
            return;
        }
        if !self.blockring.contains_block_hash_at_block_id(id, hash) {
            self.blockring.add_block(&block);
            self.blockring.lc_pos = Some((id % ring_buffer_size) as usize);
            self.blockring.ring[(id % ring_buffer_size) as usize].lc_pos = Some(0);
        } else {
            debug!("didn't add ghost block : {:?}-{:?}", id, hash.to_hex());
        }
        self.blocks.insert(hash, block);
    }

    pub async fn reset(&mut self) {
        self.last_burnfee = 0;
        self.last_timestamp = 0;
        self.last_block_id = 0;
        self.last_block_hash = [0; 32];
        self.genesis_timestamp = 0;
        self.genesis_block_hash = [0; 32];
        self.genesis_block_id = 0;
        self.lowest_acceptable_block_id = 0;
        self.lowest_acceptable_timestamp = 0;
        self.lowest_acceptable_block_hash = [0; 32];
        self.fork_id = Some([0; 32]);
        self.save().await;
    }

    pub async fn save(&self) {
        // TODO : what should be done here in rust code?
    }
    pub fn get_utxoset_data(&self) -> HashMap<SaitoPublicKey, Currency> {
        let mut data: HashMap<SaitoPublicKey, Currency> = Default::default();
        self.utxoset.iter().for_each(|(key, value)| {
            if !value {
                return;
            }
            let slip = Slip::parse_slip_from_utxokey(key).unwrap();
            *data.entry(slip.public_key).or_default() += slip.amount;
        });
        data
    }
    pub fn get_slips_for(&self, public_key: SaitoPublicKey) -> Vec<Slip> {
        let mut slips: Vec<Slip> = Default::default();
        self.utxoset
            .iter()
            .filter(|(_, value)| **value)
            .for_each(|(key, _)| {
                let slip = Slip::parse_slip_from_utxokey(key).unwrap();
                if slip.public_key == public_key {
                    slips.push(slip);
                }
            });
        slips
    }
    pub fn get_balance_snapshot(
        &self,
        keys: Vec<SaitoPublicKey>,
        configs: &(dyn Configuration + Send + Sync),
    ) -> BalanceSnapshot {
        let latest_block_id = self.get_latest_block_id();
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;

        let mut snapshot = BalanceSnapshot {
            latest_block_id: latest_block_id,
            latest_block_hash: self.get_latest_block_hash(),
            timestamp: self.last_timestamp,
            slips: vec![],
        };
        // TODO : calling this will be a huge performance hit for the node. so need to refactor the design.
        self.utxoset
            .iter()
            .filter(|(_, value)| **value)
            .for_each(|(key, _)| {
                let slip = Slip::parse_slip_from_utxokey(key).unwrap();

                //
                // Skip any Bound‐type slips
                //
                if slip.slip_type == SlipType::Bound {
                    return;
                }

                //
                // Check if UTXO is valid (not from an off-chain block)
                //
                if slip.block_id < latest_block_id.saturating_sub(genesis_period) {
                    return;
                }

                //
                // if no keys provided we get the full picture
                //
                if keys.is_empty() || keys.contains(&slip.public_key) {
                    snapshot.slips.push(slip);
                }
            });

        snapshot
    }
    pub fn is_slip_unlocked(&self, utxo_key: &SaitoUTXOSetKey) -> bool {
        let latest_unlocked_block_id = self.get_latest_unlocked_stake_block_id();
        let result = Slip::parse_slip_from_utxokey(utxo_key);
        if result.is_err() {
            warn!("cannot parse utxo key  : {:?}", utxo_key.to_hex());
            return false;
        }
        let slip = result.unwrap();
        let result = self.utxoset.get(utxo_key);
        if result.is_none() {
            warn!(
                "slip not found. : {:?}-{:?}-{:?} type: {:?} amount : {:?}",
                slip.block_id, slip.tx_ordinal, slip.slip_index, slip.slip_type, slip.amount
            );
            return false;
        }
        let spendable = result.unwrap();
        if !spendable {
            return false;
        }
        if let SlipType::BlockStake = slip.slip_type {
            if slip.block_id > latest_unlocked_block_id {
                return false;
            }
        }

        true
    }

    pub fn set_safe_to_prune_transaction(&mut self, block_id: u64) {
        let block_hash_option = self.blockring.get_block_hash_by_block_id(block_id);

        if let Some(block_hash) = block_hash_option {
            if let Some(block) = self.blocks.get_mut(&block_hash) {
                block.safe_to_prune_transactions = true;
            }
        }
    }
    pub fn calculate_current_supply(&self) -> Currency {
        let mut current_supply = Currency::default();
        self.utxoset.iter().for_each(|(key, value)| {
            if !value {
                return;
            }
            let slip = Slip::parse_slip_from_utxokey(key).unwrap();
            current_supply += slip.amount;
        });

        if let Some(latest_block) = self.get_latest_block() {
            current_supply += latest_block.graveyard;
            current_supply += latest_block.treasury;
            current_supply += latest_block.previous_block_unpaid;
            current_supply += latest_block.total_fees;
        } else {
            debug!("latest block not found in blockchain to calculate total supply");
            return 0;
        }
        current_supply
    }
    pub async fn check_total_supply(&mut self, configs: &(dyn Configuration + Send + Sync)) {
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;

        if !self.has_total_supply_loaded(genesis_period) {
            debug!("total supply not loaded yet. skipping check");
            return;
        }

        if configs.is_browser() || configs.is_spv_mode() {
            debug!("skipping total supply check in spv mode");
            return;
        }

        let latest_block = self
            .get_latest_block()
            .expect("There should be a latest block in blockchain");

        let mut current_supply = 0;
        let amount_in_utxo = self
            .utxoset
            .iter()
            .filter(|(_, &spent)| spent)
            .filter_map(|(key, &spent)| {
                let slip = Slip::parse_slip_from_utxokey(key).ok()?;

                //
                // Skip any Bound‐type slips
                //
                if slip.slip_type == SlipType::Bound {
                    return None;
                }

                //
                // skip old UTXOs outside the genesis window
                if slip.block_id < latest_block.id.saturating_sub(genesis_period) {
                    return None;
                }

                trace!(
                    "Utxo : {:?} : {} : {:?}, block : {}-{}-{}, valid : {}",
                    slip.public_key.to_base58(),
                    slip.amount,
                    slip.slip_type,
                    slip.block_id,
                    slip.tx_ordinal,
                    slip.slip_index,
                    spent
                );

                Some(slip.amount)
            })
            .sum::<Currency>();

        current_supply += amount_in_utxo;

        current_supply += latest_block.graveyard;
        current_supply += latest_block.treasury;
        current_supply += latest_block.previous_block_unpaid;
        current_supply += latest_block.total_fees;

        if self.initial_token_supply == 0 {
            info!(
                "initial token supply is not set. setting it to current supply : {}",
                current_supply
            );
            self.initial_token_supply = current_supply;
        }

        if current_supply != self.initial_token_supply {
            let latest_block = self.get_latest_block().unwrap();
            warn!(
                "diff : {}",
                self.initial_token_supply as i64 - current_supply as i64
            );
            warn!("Current supply is {}", current_supply);
            warn!("Initial token supply is {}", self.initial_token_supply);
            warn!(
                "Social Stake Requirement is {}",
                self.social_stake_requirement
            );
            warn!("Graveyard is {}", latest_block.graveyard);
            warn!("Treasury is {}", latest_block.treasury);
            warn!("Unpaid fees is {}", latest_block.previous_block_unpaid);
            warn!("Total Fees ATR is {}", latest_block.total_fees_atr);
            warn!("Total Fees New is {}", latest_block.total_fees_new);
            warn!("Total Fee is {}", latest_block.total_fees);
            warn!("Amount in utxo {}", amount_in_utxo);

            warn!("latest block : {}", latest_block);
            warn!(
                "current supply : {:?} doesn't equal to initial supply : {:?}",
                current_supply, self.initial_token_supply
            );
            latest_block.print_all();
            panic!("cannot continue with invalid total supply");
        }
        debug!(
            "total supply check passed. current supply : {:?} initial supply : {:?}",
            current_supply, self.initial_token_supply
        );
    }
}

pub fn generate_fork_id_weights(genesis_period: BlockId) -> [u64; 16] {
    const LENGTH: BlockId = 100_000;
    [
        0,
        max((10 * genesis_period) / LENGTH, 1),
        max((10 * genesis_period) / LENGTH, 1),
        max((10 * genesis_period) / LENGTH, 1),
        max((10 * genesis_period) / LENGTH, 1),
        max((10 * genesis_period) / LENGTH, 1),
        max((25 * genesis_period) / LENGTH, 1),
        max((25 * genesis_period) / LENGTH, 1),
        max((100 * genesis_period) / LENGTH, 1),
        max((300 * genesis_period) / LENGTH, 1),
        max((500 * genesis_period) / LENGTH, 1),
        max((4000 * genesis_period) / LENGTH, 1),
        max((10000 * genesis_period) / LENGTH, 1),
        max((20000 * genesis_period) / LENGTH, 1),
        max((50000 * genesis_period) / LENGTH, 1),
        genesis_period,
    ]
}

fn is_golden_ticket_count_valid_<'a, F: Fn(SaitoHash) -> Option<&'a Block>>(
    previous_block_hash: SaitoHash,
    current_block_has_golden_ticket: bool,
    bypass: bool,
    get_block: F,
) -> bool {
    let mut golden_tickets_found = 0;
    let mut required_tickets = 0;
    let mut search_depth_index = 0;
    let mut latest_block_hash = previous_block_hash;

    for _ in 0..MIN_GOLDEN_TICKETS_DENOMINATOR - 1 {
        if let Some(block) = get_block(latest_block_hash) {
            search_depth_index += 1;
            debug!(
                "searching for golden tickets : block id : {:?} hash : {:?} has_golden_ticket : {:?} search_depth : {:?}",
                block.id, block.hash.to_hex(), block.has_golden_ticket,search_depth_index
            );
            // the latest block will not have has_golden_ticket set yet
            // so it is possible we undercount the latest block. this
            // is dealt with by manually checking for the existence of
            // a golden ticket if we only have 1 golden ticket below.
            if block.has_golden_ticket {
                golden_tickets_found += 1;
            }
            // if i == 0 {
            //     // 3/7 => [1,2,3,4,5,6 + 7(current)]. but we only check the first 6 since we start from previous block.
            //     // if we only have 5 blocks, we need 1 golden ticket. if we have 6 blocks, we need 2 golden tickets. if current block has golden ticket, we need 3 golden tickets.
            //     required_tickets = MIN_GOLDEN_TICKETS_NUMERATOR
            //         .saturating_sub(MIN_GOLDEN_TICKETS_DENOMINATOR.saturating_sub(block.id));
            // }
            latest_block_hash = block.previous_block_hash;
        } else {
            break;
        }
    }
    // 2/6 => [1,2,3,4,5 + 6(current)]. but we only check the first 5 since we start from previous block.
    // if we only have 4 blocks, we need 1 golden ticket. if we have 5 blocks, we need 2 golden tickets (including the gt at hand). because we calculate only upto the previous block and then consider the current block's gt
    required_tickets = MIN_GOLDEN_TICKETS_NUMERATOR
        .saturating_sub(MIN_GOLDEN_TICKETS_DENOMINATOR.saturating_sub(search_depth_index + 1));

    if current_block_has_golden_ticket {
        golden_tickets_found += 1;
    }
    // if search_depth_index < MIN_GOLDEN_TICKETS_DENOMINATOR - MIN_GOLDEN_TICKETS_NUMERATOR {
    //     // we need to check for search_depth here because we need to have at least MIN_GOLDEN_TICKETS_DENOMINATOR blocks loaded before we can check for golden tickets
    //     debug!(
    //         "returning true since search depth {} is not enough. current_block_has_golden_ticket : {:?} golden_tickets_found : {:?} required_tickets : {}",
    //         search_depth_index, current_block_has_golden_ticket, golden_tickets_found, required_tickets
    //     );
    //     return true;
    // }
    // else if search_depth_index == MIN_GOLDEN_TICKETS_DENOMINATOR - 1 {
    //     // we only have enough blocks to check for a single golden ticket
    //     debug!(
    //         "search depth is exactly MIN_GOLDEN_TICKETS_DENOMINATOR - 1. current_block_has_golden_ticket : {:?} golden_tickets_found : {:?} required_tickets : {}",
    //         current_block_has_golden_ticket, golden_tickets_found, required_tickets
    //     );
    //     required_tickets = 1;
    // }
    // TODO : uncomment above after fixing and remove this
    if search_depth_index < MIN_GOLDEN_TICKETS_DENOMINATOR - MIN_GOLDEN_TICKETS_NUMERATOR {
        // we need to check for search_depth here because we need to have at least MIN_GOLDEN_TICKETS_DENOMINATOR blocks loaded before we can check for golden tickets
        debug!(
            "returning true since search depth {} is not enough. current_block_has_golden_ticket : {:?} golden_tickets_found : {:?} required_tickets : {}",
            search_depth_index, current_block_has_golden_ticket, golden_tickets_found, required_tickets
        );
        return true;
    }

    if golden_tickets_found < required_tickets {
        info!(
            "not enough golden tickets : found = {:?} depth = {:?} current_block_has_golden_ticket : {:?} required_tickets : {}",
            golden_tickets_found, search_depth_index, current_block_has_golden_ticket, required_tickets
        );
        // TODO : browsers might want to implement this check somehow
        if !bypass {
            return false;
        }
    }
    debug!(
        "found enough golden tickets : found = {:?} depth = {:?} current_block_has_golden_ticket : {:?} required_tickets : {}",
        golden_tickets_found, search_depth_index, current_block_has_golden_ticket, required_tickets
    );
    true
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::block::Block;
    use crate::core::consensus::blockchain::{
        bit_pack, bit_unpack, is_golden_ticket_count_valid_, AddBlockResult, Blockchain,
    };
    use crate::core::consensus::slip::Slip;
    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::{ForkId, PrintForLog, SaitoHash, SaitoPublicKey, NOLAN_PER_SAITO};
    use crate::core::io::storage::Storage;
    use crate::core::util::crypto::{generate_keys, hash};
    use crate::core::util::test::node_tester::test::NodeTester;
    use crate::core::util::test::test_manager::test::TestManager;
    use ahash::HashMap;
    use log::{debug, error, info};
    use std::fs;
    use std::ops::Deref;
    use std::sync::Arc;

    use tokio::sync::RwLock;

    // fn init_testlog() {
    //     let _ = pretty_env_logger::try_init();
    // }

    #[tokio::test]
    async fn test_blockchain_init() {
        let keys = generate_keys();

        let wallet = Arc::new(RwLock::new(Wallet::new(keys.1, keys.0)));
        let blockchain = Blockchain::new(wallet, 1_000, 0, 60);

        assert_eq!(blockchain.fork_id, None);
        assert_eq!(blockchain.genesis_block_id, 0);
    }

    #[tokio::test]
    async fn test_add_block() {
        let keys = generate_keys();
        let wallet = Arc::new(RwLock::new(Wallet::new(keys.1, keys.0)));
        let blockchain = Blockchain::new(wallet, 1_000, 0, 60);

        assert_eq!(blockchain.fork_id, None);
        assert_eq!(blockchain.genesis_block_id, 0);
    }

    #[test]
    //
    // code that packs/unpacks two 32-bit values into one 64-bit variable
    //
    fn bit_pack_test() {
        let top = 157171715;
        let bottom = 11661612;
        let packed = bit_pack(top, bottom);
        assert_eq!(packed, 157171715 * (u64::pow(2, 32)) + 11661612);
        let (new_top, new_bottom) = bit_unpack(packed);
        assert_eq!(top, new_top);
        assert_eq!(bottom, new_bottom);

        let top = u32::MAX;
        let bottom = u32::MAX;
        let packed = bit_pack(top, bottom);
        let (new_top, new_bottom) = bit_unpack(packed);
        assert_eq!(top, new_top);
        assert_eq!(bottom, new_bottom);

        let top = 0;
        let bottom = 1;
        let packed = bit_pack(top, bottom);
        let (new_top, new_bottom) = bit_unpack(packed);
        assert_eq!(top, new_top);
        assert_eq!(bottom, new_bottom);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn initialize_blockchain_test() {
        let mut t = TestManager::default();

        // create first block, with 100 VIP txs with 1_000_000_000 NOLAN each
        t.initialize(100, 1_000_000_000).await;
        // t.wait_for_mining_event().await;

        {
            let blockchain = t.blockchain_lock.read().await;
            assert_eq!(1, blockchain.get_latest_block_id());
        }
        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;
    }

    #[tokio::test]
    #[serial_test::serial]
    //
    // test we can produce five blocks in a row
    //
    async fn add_five_good_blocks() {
        // let filter = tracing_subscriber::EnvFilter::from_default_env();
        // let fmt_layer = tracing_subscriber::fmt::Layer::default().with_filter(filter);
        //
        // tracing_subscriber::registry().with(fmt_layer).init();

        let mut t = TestManager::default();
        let block1;
        let block1_id;
        let block1_hash;
        let ts;

        //
        // block 1
        //
        t.initialize(100, 200_000_000_000_000).await;

        {
            let blockchain = t.blockchain_lock.write().await;
            block1 = blockchain.get_latest_block().unwrap();
            block1_id = block1.id;
            block1_hash = block1.hash;
            ts = block1.timestamp;

            assert_eq!(blockchain.get_latest_block_hash(), block1_hash);
            assert_eq!(blockchain.get_latest_block_id(), block1_id);
            assert_eq!(blockchain.get_latest_block_id(), 1);
        }

        //
        // block 2
        //
        let mut block2 = t
            .create_block(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block2.generate().unwrap(); // generate hashes

        let block2_hash = block2.hash;
        let block2_id = block2.id;

        t.add_block(block2).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_eq!(blockchain.get_latest_block_hash(), block2_hash);
            assert_eq!(blockchain.get_latest_block_id(), block2_id);
            assert_eq!(blockchain.get_latest_block_id(), 2);
        }

        //
        // block 3
        //
        let mut block3 = t
            .create_block(
                block2_hash, // hash of parent block
                ts + 240000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block3.generate().unwrap(); // generate hashes

        let block3_hash = block3.hash;
        let block3_id = block3.id;

        t.add_block(block3).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_eq!(blockchain.get_latest_block_hash(), block3_hash);
            assert_eq!(blockchain.get_latest_block_id(), block3_id);
            assert_eq!(blockchain.get_latest_block_id(), 3);
        }

        //
        // block 4
        //
        let mut block4 = t
            .create_block(
                block3_hash, // hash of parent block
                ts + 360000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block4.generate().unwrap(); // generate hashes

        let block4_hash = block4.hash;
        let block4_id = block4.id;

        t.add_block(block4).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_eq!(blockchain.get_latest_block_hash(), block4_hash);
            assert_eq!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_id(), 4);
        }

        //
        // block 5
        //
        let mut block5 = t
            .create_block(
                block4_hash, // hash of parent block
                ts + 480000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block5.generate().unwrap(); // generate hashes

        let block5_hash = block5.hash;
        let block5_id = block5.id;

        t.add_block(block5).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(blockchain.get_latest_block_hash(), block4_hash);
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
            assert_eq!(blockchain.get_latest_block_id(), 5);
        }

        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;

        {
            let wallet = t.wallet_lock.read().await;
            let count = wallet.get_unspent_slip_count();
            assert_ne!(count, 0);
            let balance = wallet.get_available_balance();
            assert_ne!(balance, 0);
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    //
    // test we do not add blocks because of insufficient mining
    //
    async fn insufficient_golden_tickets_test() {
        // let filter = tracing_subscriber::EnvFilter::from_default_env();
        // let fmt_layer = tracing_subscriber::fmt::Layer::default().with_filter(filter);
        //
        // tracing_subscriber::registry().with(fmt_layer).init();
        // pretty_env_logger::init();

        let mut t = TestManager::default();
        let block1;
        let block1_id;
        let block1_hash;
        let ts;

        //
        // block 1
        //
        t.initialize(100, 200_000_000_000_000).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            block1 = blockchain.get_latest_block().unwrap();
            block1_id = block1.id;
            block1_hash = block1.hash;
            ts = block1.timestamp;

            assert_eq!(blockchain.get_latest_block_hash(), block1_hash);
            assert_eq!(blockchain.get_latest_block_id(), block1_id);
            assert_eq!(blockchain.get_latest_block_id(), 1);
        }

        //
        // block 2
        //
        let mut block2 = t
            .create_block(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block2.generate().unwrap(); // generate hashes

        let block2_hash = block2.hash;
        let block2_id = block2.id;

        t.add_block(block2).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_eq!(blockchain.get_latest_block_hash(), block2_hash);
            assert_eq!(blockchain.get_latest_block_id(), block2_id);
            assert_eq!(blockchain.get_latest_block_id(), 2);
        }

        //
        // block 3
        //
        let mut block3 = t
            .create_block(
                block2_hash, // hash of parent block
                ts + 240000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block3.generate().unwrap(); // generate hashes

        let block3_hash = block3.hash;
        let block3_id = block3.id;

        t.add_block(block3).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_eq!(blockchain.get_latest_block_hash(), block3_hash);
            assert_eq!(blockchain.get_latest_block_id(), block3_id);
            assert_eq!(blockchain.get_latest_block_id(), 3);
        }

        //
        // block 4
        //
        let mut block4 = t
            .create_block(
                block3_hash, // hash of parent block
                ts + 360000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block4.generate().unwrap(); // generate hashes

        let block4_hash = block4.hash;
        let block4_id = block4.id;

        t.add_block(block4).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_eq!(blockchain.get_latest_block_hash(), block4_hash);
            assert_eq!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_id(), 4);
        }

        //
        // block 5
        //
        let mut block5 = t
            .create_block(
                block4_hash, // hash of parent block
                ts + 480000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block5.generate().unwrap(); // generate hashes

        let block5_hash = block5.hash;
        let block5_id = block5.id;

        t.add_block(block5).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(blockchain.get_latest_block_hash(), block4_hash);
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
            assert_eq!(blockchain.get_latest_block_id(), 5);
        }

        //
        // block 6
        //
        let mut block6 = t
            .create_block(
                block5_hash, // hash of parent block
                ts + 600000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block6.generate().unwrap(); // generate hashes

        let block6_hash = block6.hash;
        let block6_id = block6.id;

        t.add_block(block6).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(
                blockchain.get_latest_block_hash().to_hex(),
                block3_hash.to_hex()
            );
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(
                blockchain.get_latest_block_hash().to_hex(),
                block4_hash.to_hex()
            );
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
            assert_eq!(
                blockchain.get_latest_block_hash().to_hex(),
                block5_hash.to_hex()
            );
            assert_ne!(blockchain.get_latest_block_hash(), block6_hash);
            assert_ne!(blockchain.get_latest_block_id(), block6_id);
            assert_eq!(blockchain.get_latest_block_id(), 5);
        }

        //
        // block 7
        //
        let mut block7 = t
            .create_block(
                block5_hash, // hash of parent block
                ts + 720000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block7.generate().unwrap(); // generate hashes

        let block7_hash = block7.hash;
        let block7_id = block7.id;

        t.add_block(block7).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(blockchain.get_latest_block_hash(), block4_hash);
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_ne!(blockchain.get_latest_block_hash(), block5_hash);
            assert_ne!(blockchain.get_latest_block_id(), block5_id);
            assert_ne!(blockchain.get_latest_block_hash(), block6_hash);
            // assert_ne!(blockchain.get_latest_block_id(), block6_id);
            assert_eq!(blockchain.get_latest_block_hash(), block7_hash);
            assert_eq!(blockchain.get_latest_block_id(), block7_id);
            assert_eq!(blockchain.get_latest_block_id(), 6);
        }

        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;
    }

    // tests if utxo hashmap persists after a blockchain reset
    #[tokio::test]
    #[serial_test::serial]
    async fn balance_hashmap_persists_after_blockchain_reset_test() {
        // pretty_env_logger::init();
        let mut t: TestManager = TestManager::default();
        let file_path = t.issuance_path;
        let slips = t
            .storage
            .get_token_supply_slips_from_disk_path(file_path)
            .await;

        // start blockchain with existing issuance and some value to my public key
        t.initialize_from_slips_and_value(slips.clone(), 200_000_000_000_000)
            .await;

        // add a few transactions
        let public_keys = [
            "s8oFPjBX97NC2vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR",
            // "s9adoFPjBX972vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR",
            // "s223oFPjBX97NC2bmE5Kd2oHWUShuSTUuZwSB1U4wsPR",
        ];

        let mut last_param = 120000;
        for &public_key_string in &public_keys {
            let public_key = Storage::decode_str(public_key_string).unwrap();
            let mut to_public_key: SaitoPublicKey = [0u8; 33];
            to_public_key.copy_from_slice(&public_key);
            t.transfer_value_to_public_key(to_public_key, 500, last_param)
                .await
                .unwrap();
            last_param += 120000;
        }

        // save utxo balance map on issuance file
        let balance_map = t.balance_map().await;
        match t
            .storage
            .write_utxoset_to_disk_path(balance_map.clone(), 1, file_path)
            .await
        {
            Ok(_) => {
                debug!("store file ok");
            }
            Err(e) => {
                error!("Error: {:?}", e);
            }
        }

        // reset blockchain
        let mut t: TestManager = TestManager::default();
        let slips = t
            .storage
            .get_token_supply_slips_from_disk_path(t.issuance_path)
            .await;

        let issuance_hashmap = t.convert_issuance_to_hashmap(t.issuance_path).await;

        // initialize from existing slips
        t.initialize_from_slips(slips.clone()).await;

        let balance_map_after_reset = t.balance_map().await;

        assert_eq!(issuance_hashmap, balance_map_after_reset);
    }

    // test we do not add blocks because of insufficient mining
    #[tokio::test]
    #[serial_test::serial]
    async fn seven_blocks_with_sufficient_golden_tickets_test() {
        // pretty_env_logger::init();
        let mut t = TestManager::default();
        let block1;
        let block1_id;
        let block1_hash;
        let ts;

        // block 1
        t.initialize(100, 200_000_000_000_000).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            block1 = blockchain.get_latest_block().unwrap();
            block1_hash = block1.hash;
            block1_id = block1.id;
            ts = block1.timestamp;

            assert_eq!(blockchain.get_latest_block_hash(), block1_hash);
            assert_eq!(blockchain.get_latest_block_id(), block1_id);
            assert_eq!(blockchain.get_latest_block_id(), 1);
            assert_eq!(block1.transactions.len(), 100);
        }

        //
        // block 2
        //
        let mut block2 = t
            .create_block(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block2.generate().unwrap(); // generate hashes

        let block2_hash = block2.hash;
        let block2_id = block2.id;

        t.add_block(block2).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_eq!(blockchain.get_latest_block_hash(), block2_hash);
            assert_eq!(blockchain.get_latest_block_id(), block2_id);
            assert_eq!(blockchain.get_latest_block_id(), 2);
        }

        //
        // block 3
        //
        let mut block3 = t
            .create_block(
                block2_hash, // hash of parent block
                ts + 240000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block3.generate().unwrap(); // generate hashes

        let block3_hash = block3.hash;
        let block3_id = block3.id;

        t.add_block(block3).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_eq!(blockchain.get_latest_block_hash(), block3_hash);
            assert_eq!(blockchain.get_latest_block_id(), block3_id);
            assert_eq!(blockchain.get_latest_block_id(), 3);
        }

        //
        // block 4
        //
        let mut block4 = t
            .create_block(
                block3_hash, // hash of parent block
                ts + 360000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block4.generate().unwrap(); // generate hashes

        let block4_hash = block4.hash;
        let block4_id = block4.id;

        t.add_block(block4).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_eq!(blockchain.get_latest_block_hash(), block4_hash);
            assert_eq!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_id(), 4);
        }

        //
        // block 5
        //
        let mut block5 = t
            .create_block(
                block4_hash, // hash of parent block
                ts + 480000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block5.generate().unwrap(); // generate hashes

        let block5_hash = block5.hash;
        let block5_id = block5.id;

        t.add_block(block5).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(blockchain.get_latest_block_hash(), block4_hash);
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
            assert_eq!(blockchain.get_latest_block_id(), 5);
        }

        //
        // block 6
        //
        let mut block6 = t
            .create_block(
                block5_hash, // hash of parent block
                ts + 600000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block6.generate().unwrap(); // generate hashes

        let block6_hash = block6.hash;
        let block6_id = block6.id;

        t.add_block(block6).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(blockchain.get_latest_block_hash(), block4_hash);
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_ne!(blockchain.get_latest_block_hash(), block5_hash);
            assert_ne!(blockchain.get_latest_block_id(), block5_id);
            assert_eq!(blockchain.get_latest_block_hash(), block6_hash);
            assert_eq!(blockchain.get_latest_block_id(), block6_id);
            assert_eq!(blockchain.get_latest_block_id(), 6);
        }

        //
        // block 7
        //
        let mut block7 = t
            .create_block(
                block6_hash, // hash of parent block
                ts + 720000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block7.generate().unwrap(); // generate hashes

        let block7_hash = block7.hash;
        let block7_id = block7.id;

        t.add_block(block7).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            assert_ne!(blockchain.get_latest_block_hash(), block1_hash);
            assert_ne!(blockchain.get_latest_block_id(), block1_id);
            assert_ne!(blockchain.get_latest_block_hash(), block2_hash);
            assert_ne!(blockchain.get_latest_block_id(), block2_id);
            assert_ne!(blockchain.get_latest_block_hash(), block3_hash);
            assert_ne!(blockchain.get_latest_block_id(), block3_id);
            assert_ne!(blockchain.get_latest_block_hash(), block4_hash);
            assert_ne!(blockchain.get_latest_block_id(), block4_id);
            assert_ne!(blockchain.get_latest_block_hash(), block5_hash);
            assert_ne!(blockchain.get_latest_block_id(), block5_id);
            assert_ne!(blockchain.get_latest_block_hash(), block6_hash);
            assert_ne!(blockchain.get_latest_block_id(), block6_id);
            assert_eq!(blockchain.get_latest_block_hash(), block7_hash);
            assert_eq!(blockchain.get_latest_block_id(), block7_id);
            assert_eq!(blockchain.get_latest_block_id(), 7);
        }

        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn block_add_test_staking() {
        // pretty_env_logger::init();

        debug!("testing block_add_test_staking");

        let mut t = TestManager::default();
        t.enable_staking(2_000_000 * NOLAN_PER_SAITO).await;
        let block1;
        let block1_hash;
        let ts;

        t.initialize(100, 200_000_000_000_000).await;
        t.enable_staking(2_000_000 * NOLAN_PER_SAITO).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            if blockchain.social_stake_requirement == 0 {
                // this test won't pass if staking is not available
                return;
            }

            assert_eq!(blockchain.blocks.len(), 1);

            block1 = blockchain.get_latest_block().unwrap();
            block1_hash = block1.hash;
            ts = block1.timestamp;
        }

        // block 2
        let mut block2 = t
            .create_block_with_staking(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
                false,
            )
            .await;

        block2.generate().unwrap();

        let block2_hash = block2.hash;
        assert!(!block2.has_staking_transaction);

        let result = t.add_block(block2).await;
        assert!(matches!(result, AddBlockResult::FailedNotValid));

        {
            let blockchain = t.blockchain_lock.read().await;
            assert_eq!(blockchain.blocks.len(), 1);

            assert_eq!(blockchain.get_latest_block_hash(), block1_hash);
            assert_eq!(blockchain.get_latest_block_id(), 1);
        }

        let mut block2 = t
            .create_block(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;

        block2.generate().unwrap(); // generate hashes

        assert!(block2.has_staking_transaction);

        let block2_hash = block2.hash;
        let result = t.add_block(block2).await;
        assert!(matches!(
            result,
            AddBlockResult::BlockAddedSuccessfully(_, _, _)
        ));

        {
            let blockchain = t.blockchain_lock.read().await;
            assert_eq!(blockchain.blocks.len(), 2);

            assert_eq!(blockchain.get_latest_block_hash(), block2_hash);
            assert_eq!(blockchain.get_latest_block_id(), 2);
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    // add 6 blocks including 4 block reorg
    async fn basic_longest_chain_reorg_test() {
        // pretty_env_logger::init();

        let mut t = TestManager::default();
        let block1;
        let block1_hash;
        let ts;

        // block 1
        t.initialize(100, 200_000_000_000_000).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            block1 = blockchain.get_latest_block().unwrap();
            block1_hash = block1.hash;
            ts = block1.timestamp;
        }

        // block 2
        let mut block2 = t
            .create_block(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;

        block2.generate().unwrap(); // generate hashes

        let block2_hash = block2.hash;
        let block2_id = block2.id;

        t.add_block(block2).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            assert_eq!(blockchain.get_latest_block_hash(), block2_hash);
            assert_eq!(blockchain.get_latest_block_id(), block2_id);
        }

        // block 3
        let mut block3 = t
            .create_block(
                block2_hash, // hash of parent block
                ts + 240000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block3.generate().unwrap(); // generate hashes
        let block3_hash = block3.hash;
        let _block3_id = block3.id;
        t.add_block(block3).await;

        // block 4
        let mut block4 = t
            .create_block(
                block3_hash, // hash of parent block
                ts + 360000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block4.generate().unwrap(); // generate hashes
        let block4_hash = block4.hash;
        let _block4_id = block4.id;
        t.add_block(block4).await;

        // block 5
        let mut block5 = t
            .create_block(
                block4_hash, // hash of parent block
                ts + 480000, // timestamp
                1,           // num transactions
                0,           // amount
                0,           // fee
                false,       // mine golden ticket
            )
            .await;
        block5.generate().unwrap(); // generate hashes
        let block5_hash = block5.hash;
        let block5_id = block5.id;
        t.add_block(block5).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
        }

        //  block3-2
        let mut block3_2 = t
            .create_block(
                block2_hash, // hash of parent block
                ts + 240000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block3_2.generate().unwrap(); // generate hashes
        let block3_2_hash = block3_2.hash;
        let _block3_2_id = block3_2.id;
        t.add_block(block3_2).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
        }

        //  block4-2
        let mut block4_2 = t
            .create_block(
                block3_2_hash, // hash of parent block
                ts + 360000,   // timestamp
                0,             // num transactions
                0,             // amount
                0,             // fee
                true,          // mine golden ticket
            )
            .await;
        block4_2.generate().unwrap(); // generate hashes
        let block4_2_hash = block4_2.hash;
        let _block4_2_id = block4_2.id;
        t.add_block(block4_2).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
        }

        //  block5-2
        let mut block5_2 = t
            .create_block(
                block4_2_hash, // hash of parent block
                ts + 480000,   // timestamp
                1,             // num transactions
                0,             // amount
                0,             // fee
                false,         // mine golden ticket
            )
            .await;
        block5_2.generate().unwrap(); // generate hashes
        let block5_2_hash = block5_2.hash;
        let _block5_2_id = block5_2.id;
        t.add_block(block5_2).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            assert_eq!(blockchain.get_latest_block_hash(), block5_hash);
            assert_eq!(blockchain.get_latest_block_id(), block5_id);
        }

        //  block6_2
        let mut block6_2 = t
            .create_block(
                block5_2_hash, // hash of parent block
                ts + 600000,   // timestamp
                0,             // num transactions
                0,             // amount
                0,             // fee
                true,          // mine golden ticket
            )
            .await;
        block6_2.generate().unwrap(); // generate hashes
        let block6_2_hash = block6_2.hash;
        let block6_2_id = block6_2.id;
        t.add_block(block6_2).await;

        {
            let blockchain = t.blockchain_lock.read().await;

            assert_eq!(blockchain.get_latest_block_hash(), block6_2_hash);
            assert_eq!(blockchain.get_latest_block_id(), block6_2_id);
            assert_eq!(blockchain.get_latest_block_id(), 6);
        }

        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;
    }

    /// Loading blocks into a blockchain which were created from another blockchain instance
    #[tokio::test]
    #[serial_test::serial]
    async fn load_blocks_from_another_blockchain_test() {
        // pretty_env_logger::init();
        let mut t = TestManager::default();
        let mut t2 = TestManager::default();
        let block1;
        let block1_id;
        let block1_hash;
        let ts;

        // block 1
        t.initialize(100, 1_000_000_000).await;
        t2.disable_staking().await;

        {
            let blockchain = t.blockchain_lock.write().await;

            block1 = blockchain.get_latest_block().unwrap();
            block1_id = block1.id;
            block1_hash = block1.hash;
            ts = block1.timestamp;
        }

        // block 2
        let mut block2 = t
            .create_block(
                block1_hash, // hash of parent block
                ts + 120000, // timestamp
                0,           // num transactions
                0,           // amount
                0,           // fee
                true,        // mine golden ticket
            )
            .await;
        block2.generate().unwrap(); // generate hashes

        let block2_hash = block2.hash;
        let _block2_id = block2.id;

        t.add_block(block2).await;

        let list = t2.storage.load_block_name_list().await.unwrap();
        t2.storage
            .load_blocks_from_disk(list.as_slice(), t2.mempool_lock.clone())
            .await;
        {
            let configs = t2.config_lock.read().await;
            let mut blockchain2 = t2.blockchain_lock.write().await;

            blockchain2
                .add_blocks_from_mempool(
                    t2.mempool_lock.clone(),
                    Some(&t2.network),
                    &mut t2.storage,
                    Some(t2.sender_to_miner.clone()),
                    None,
                    configs.deref(),
                )
                .await;
        }

        {
            let blockchain1 = t.blockchain_lock.read().await;
            let blockchain2 = t2.blockchain_lock.read().await;

            assert_eq!(blockchain1.blocks.len(), 2);
            assert_eq!(blockchain2.blocks.len(), 2);

            let block1_chain1 = blockchain1.get_block(&block1_hash).unwrap();
            let block1_chain2 = blockchain2.get_block(&block1_hash).unwrap();

            let block2_chain1 = blockchain1.get_block(&block2_hash).unwrap();
            let block2_chain2 = blockchain2.get_block(&block2_hash).unwrap();

            for (block_new, block_old) in [
                (block1_chain2, block1_chain1),
                (block2_chain2, block2_chain1),
            ] {
                assert_eq!(block_new.hash, block_old.hash);
                assert_eq!(block_new.has_golden_ticket, block_old.has_golden_ticket);
                assert_eq!(block_new.previous_block_hash, block_old.previous_block_hash);
                assert_eq!(block_new.block_type, block_old.block_type);
                assert_eq!(block_new.signature, block_old.signature);
            }
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn fork_id_test() {
        // pretty_env_logger::init();

        let mut t = TestManager::default();
        let mut block1;
        let mut block1_id;
        let mut block1_hash;
        let mut ts;

        t.initialize_with_timestamp(100, 200_000_000_000_000, 10_000_000)
            .await;

        for _i in (0..20).step_by(1) {
            {
                let blockchain = t.blockchain_lock.read().await;

                block1 = blockchain.get_latest_block().unwrap();
                block1_hash = block1.hash;
                block1_id = block1.id;
                ts = block1.timestamp;
            }

            let mut block = t
                .create_block(
                    block1_hash, // hash of parent block
                    ts + 120000, // timestamp
                    0,           // num transactions
                    0,           // amount
                    0,           // fee
                    true,        // mine golden ticket
                )
                .await;
            block.generate().unwrap(); // generate hashes

            let _block_hash = block.hash;
            let _block_id = block.id;

            t.add_block(block).await;

            let _result = t.receiver_in_miner.try_recv();
        }

        {
            let blockchain = t.blockchain_lock.read().await;

            let fork_id = blockchain.generate_fork_id(15).unwrap();
            assert_eq!(fork_id[2..], [0; 30]);

            let fork_id = blockchain.generate_fork_id(20).unwrap();
            assert_eq!(fork_id[4..], [0; 28]);
        }
    }

    //create a test genesis block and test store state and reload from the same file
    #[tokio::test]
    #[serial_test::serial]
    async fn test_genesis_inout() {
        //init_testlog();

        let mut t = TestManager::default();
        //generate a test genesis block
        t.create_test_gen_block(1000).await;
        {
            let blockchain = t.blockchain_lock.read().await;

            let block1 = blockchain.get_latest_block().unwrap();
            assert_eq!(block1.id, 1);
            assert!(block1.timestamp > 1687867265673);
            assert_eq!(block1.transactions.len(), 1);
        }

        //create the balance map
        let bmap = t.balance_map().await;

        //store it
        let filepath = "./utxoset_test";

        match t
            .storage
            .write_utxoset_to_disk_path(bmap, 1, filepath)
            .await
        {
            Ok(_) => {
                debug!("store file ok");
            }
            Err(e) => {
                error!("Error: {:?}", e);
            }
        }

        //now assume the stored map is issued as issued, pass it in

        //convert_issuance_into_slip
        let slips: Vec<Slip> = t
            .storage
            .get_token_supply_slips_from_disk_path(filepath)
            .await;
        assert_eq!(slips.len(), 1);

        //TODO more tests on slips

        //clean up the testing file
        let _ = fs::remove_file(filepath);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn ghost_chain_hash_test() {
        // pretty_env_logger::init();
        let mut t = TestManager::default();
        let block1;
        let parent_block_hash;
        let parent_block_id;
        let mut ts;

        // block 1
        t.initialize(100, 200_000_000_000_000).await;

        {
            let blockchain = t.blockchain_lock.write().await;

            block1 = blockchain.get_latest_block().unwrap();
            parent_block_hash = block1.hash;
            parent_block_id = block1.id;
            ts = block1.timestamp;
        }

        for _i in 0..10 {
            let mut block2 = t
                .create_block(
                    parent_block_hash, // hash of parent block
                    ts + 120000,       // timestamp
                    10,                // num transactions
                    0,                 // amount
                    0,                 // fee
                    false,             // mine golden ticket
                )
                .await;
            block2.id = parent_block_id + 1;
            info!("block generate : {:?}", block2.id);
            block2.generate().unwrap(); // generate hashes
            block2.sign(&t.wallet_lock.read().await.private_key);
            ts = block2.timestamp;

            let buf = [
                block2.previous_block_hash.as_slice(),
                block2.pre_hash.as_slice(),
            ]
            .concat();
            let calculate_hash = hash(&buf);
            assert_eq!(block2.hash, calculate_hash);
        }
        // TODO : check ghost chain data here
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn ghost_chain_content_test() {
        NodeTester::delete_data().await.unwrap();
        let mut tester = NodeTester::default();
        tester
            .init_with_staking(2_000_000 * NOLAN_PER_SAITO, 60, 100_000 * NOLAN_PER_SAITO)
            .await
            .unwrap();

        let fork_id_1: ForkId = tester.get_fork_id(1).await;
        tester.wait_till_block_id_with_txs(10, 10, 0).await.unwrap();
        let fork_id_1_after: ForkId = tester.get_fork_id(1).await;
        assert_eq!(fork_id_1, fork_id_1_after);

        // only testing if the fork id is not changing when the blockchain is updated
        let fork_id = tester.get_fork_id(10).await;
        tester
            .wait_till_block_id_with_txs(100, 10, 0)
            .await
            .unwrap();
        let fork_id_after = tester.get_fork_id(10).await;
        assert_eq!(fork_id, fork_id_after);

        {}
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn test_fork_id_difference() {
        // pretty_env_logger::init()
        NodeTester::delete_data().await.unwrap();
        let mut tester = NodeTester::default();
        tester
            .init_with_staking(2_000_000 * NOLAN_PER_SAITO, 60, 100_000 * NOLAN_PER_SAITO)
            .await
            .unwrap();

        let fork_id_1 = tester.get_fork_id(1).await;

        tester.wait_till_block_id_with_txs(10, 10, 0).await.unwrap();

        let fork_id_10 = tester.get_fork_id(10).await;
        assert_ne!(fork_id_1.to_hex(), fork_id_10.to_hex());

        tester
            .wait_till_block_id_with_txs(100, 10, 10)
            .await
            .unwrap();

        let fork_id_100 = tester.get_fork_id(100).await;
        assert_ne!(fork_id_10.to_hex(), fork_id_100.to_hex());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn test_block_generation_without_fees() {
        // pretty_env_logger::init();
        NodeTester::delete_data().await.unwrap();
        let mut tester = NodeTester::default();
        tester
            .init_with_staking(0, 60, 100_000 * NOLAN_PER_SAITO)
            .await
            .unwrap();

        tester.wait_till_block_id_with_txs(100, 0, 0).await.unwrap()
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn test_block_generation_with_fees() {
        // pretty_env_logger::init();
        NodeTester::delete_data().await.unwrap();
        let mut tester = NodeTester::default();
        tester
            .init_with_staking(0, 60, 100_000 * NOLAN_PER_SAITO)
            .await
            .unwrap();

        tester.wait_till_block_id_with_txs(5, 0, 10).await.unwrap()
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_all_gts() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = true;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = true;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = true;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = true;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = true;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = true;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(result);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_no_gts() {
        // pretty_env_logger::init();
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 16;
        block.has_golden_ticket = false;
        block.hash = [8; 32];
        block.previous_block_hash = [7; 32];
        blocks.insert(block.hash, block);

        // let result = is_golden_ticket_count_valid_([6; 32], false, false, |block_hash| {
        //     blocks.get(&block_hash)
        // });
        // assert!(result);
        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);

        let result = is_golden_ticket_count_valid_([8; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_gt_in_block_and_in_hand() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = true;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], true, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_one_gt() {
        // pretty_env_logger::init();
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = true;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_one_gt_in_hand() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], true, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_2_gt() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = true;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = true;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_3_gt() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 98;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 99;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 100;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 101;
        block.has_golden_ticket = true;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 102;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 103;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[ignore]
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_faraway_gt() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = true;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = true;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[ignore]
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_faraway_gt_with_one_in_hand() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = true;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], true, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_faraway_gt_with_one_in_hand_2() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 10;
        block.has_golden_ticket = true;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 11;
        block.has_golden_ticket = true;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 12;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 13;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 14;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 15;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], true, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(result);
    }
    #[ignore]
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_early_blocks() {
        // pretty_env_logger::init();
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 1;
        block.has_golden_ticket = true;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 2;
        block.has_golden_ticket = true;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 3;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 4;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 5;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 6;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_early_blocks_2() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 1;
        block.has_golden_ticket = false;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 2;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 3;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 4;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], false, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(result);
    }
    #[ignore]
    #[tokio::test]
    #[serial_test::serial]
    async fn is_golden_ticket_count_valid_test_early_blocks_3() {
        let mut blocks: HashMap<SaitoHash, Block> = Default::default();
        let mut block = Block::new();
        block.id = 1;
        block.has_golden_ticket = true;
        block.hash = [2; 32];
        block.previous_block_hash = [1; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 2;
        block.has_golden_ticket = false;
        block.hash = [3; 32];
        block.previous_block_hash = [2; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 3;
        block.has_golden_ticket = false;
        block.hash = [4; 32];
        block.previous_block_hash = [3; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 4;
        block.has_golden_ticket = false;
        block.hash = [5; 32];
        block.previous_block_hash = [4; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 5;
        block.has_golden_ticket = false;
        block.hash = [6; 32];
        block.previous_block_hash = [5; 32];
        blocks.insert(block.hash, block);

        let mut block = Block::new();
        block.id = 6;
        block.has_golden_ticket = false;
        block.hash = [7; 32];
        block.previous_block_hash = [6; 32];
        blocks.insert(block.hash, block);

        let result = is_golden_ticket_count_valid_([7; 32], true, false, |block_hash| {
            blocks.get(&block_hash)
        });
        assert!(!result);
    }
}
