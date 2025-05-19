use std::collections::vec_deque::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use ahash::AHashMap;
use log::{debug, info, trace, warn};
use primitive_types::U256;
use rayon::prelude::*;
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::burnfee::BurnFee;
use crate::core::consensus::golden_ticket::GoldenTicket;
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::SaitoUTXOSetKey;
use crate::core::defs::{
    Currency, PrintForLog, SaitoHash, SaitoPublicKey, SaitoSignature, StatVariable, Timestamp,
};
use crate::core::io::storage::Storage;
use crate::core::util::configuration::Configuration;
use crate::core::util::crypto::hash;
use crate::iterate;

//
// In addition to responding to global broadcast messages, the
// mempool has a local broadcast channel it uses to coordinate
// attempts to bundle blocks and notify itself when a block has
// been produced.
//
#[derive(Clone, Debug)]
pub enum MempoolMessage {
    LocalTryBundleBlock,
    LocalNewBlock,
}

/// The `Mempool` holds unprocessed blocks and transactions and is in control of
/// discerning when the node is allowed to create a block. It bundles the block and
/// sends it to the `Blockchain` to be added to the longest-chain. New `Block`s
/// received over the network are queued in the `Mempool` before being added to
/// the `Blockchain`
#[derive(Debug)]
pub struct Mempool {
    pub blocks_queue: VecDeque<Block>,
    pub transactions: AHashMap<SaitoSignature, Transaction>,
    pub golden_tickets: AHashMap<SaitoHash, (Transaction, bool)>,
    // vector so we just copy it over
    routing_work_in_mempool: Currency,
    pub new_tx_added: bool,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub utxo_map: AHashMap<SaitoUTXOSetKey, u64>,
}

impl Mempool {
    #[allow(clippy::new_without_default)]
    pub fn new(wallet_lock: Arc<RwLock<Wallet>>) -> Self {
        Mempool {
            blocks_queue: VecDeque::new(),
            transactions: Default::default(),
            golden_tickets: Default::default(),
            routing_work_in_mempool: 0,
            new_tx_added: false,
            wallet_lock,
            utxo_map: AHashMap::new(),
        }
    }

    pub fn add_block(&mut self, block: Block) {
        debug!(
            "mempool add block : {:?}-{:?}",
            block.id,
            block.hash.to_hex()
        );
        let hash_to_insert = block.hash;
        if !iterate!(self.blocks_queue, 100).any(|block| block.hash == hash_to_insert) {
            self.blocks_queue.push_back(block);
        } else {
            debug!("block not added to mempool as it was already there");
        }
    }
    pub async fn add_golden_ticket(&mut self, golden_ticket: Transaction) {
        let gt = GoldenTicket::deserialize_from_net(&golden_ticket.data);
        debug!(
            "adding golden ticket : {:?} target : {:?} public_key : {:?}",
            hash(&golden_ticket.serialize_for_net()).to_hex(),
            gt.target.to_hex(),
            gt.public_key.to_base58()
        );
        // TODO : should we replace others' GT with our GT if targets are similar ?
        if self.golden_tickets.contains_key(&gt.target) {
            debug!(
                "similar golden ticket already exists : {:?}",
                gt.target.to_hex()
            );
            return;
        }
        self.golden_tickets
            .insert(gt.target, (golden_ticket, false));

        debug!("golden ticket added to mempool");
    }
    pub async fn add_transaction_if_validates(
        &mut self,
        mut transaction: Transaction,
        blockchain: &Blockchain,
    ) {
        trace!(
            "add transaction if validates : {:?}",
            transaction.signature.to_hex()
        );
        let public_key;
        let tx_valid;
        {
            let wallet = self.wallet_lock.read().await;
            public_key = wallet.public_key;
            transaction.generate(&public_key, 0, 0);

            tx_valid = transaction.validate(&blockchain.utxoset, blockchain, true);
        }

        // validate
        if tx_valid {
            self.add_transaction(transaction).await;
        } else {
            debug!(
                "transaction not valid : {:?}",
                transaction.signature.to_hex()
            );
        }
    }
    pub async fn add_transaction(&mut self, transaction: Transaction) {
        // trace!(
        //     "add_transaction {:?} : type = {:?}",
        //     transaction.signature.to_hex(),
        //     transaction.transaction_type
        // );

        debug_assert!(transaction.hash_for_signature.is_some());

        for input in transaction.from.iter() {
            let utxo_key = input.utxoset_key;
            if self.utxo_map.contains_key(&utxo_key) && input.amount > 0 {
                // Duplicate input found, reject transaction
                warn!(
                    "duplicate input : \n{} found in transaction : \n{}",
                    input, transaction
                );
                return;
            }
        }

        // this assigns the amount of routing work that this transaction
        // contains to us, which is why we need to provide our public_key
        // so that we can calculate routing work.
        //

        // generates hashes, total fees, routing work for me, etc.
        // transaction.generate(&self.public_key, 0, 0);

        if !self.transactions.contains_key(&transaction.signature) {
            self.routing_work_in_mempool += transaction.total_work_for_me;
            // trace!(
            //     "routing work available in mempool : {:?} after adding work : {:?} from tx with fees : {:?}",
            //     self.routing_work_in_mempool, transaction.total_work_for_me, transaction.total_fees
            // );
            if let TransactionType::GoldenTicket = transaction.transaction_type {
                panic!("golden tickets should be in gt collection");
            } else {
                self.transactions
                    .insert(transaction.signature, transaction.clone());
                self.new_tx_added = true;

                for input in transaction.from.iter() {
                    let utxo_key = input.utxoset_key;
                    self.utxo_map.insert(utxo_key, 1);
                }
            }
        }
    }

    pub async fn bundle_block(
        &mut self,
        blockchain: &Blockchain,
        current_timestamp: Timestamp,
        gt_tx: Option<Transaction>,
        configs: &(dyn Configuration + Send + Sync),
        storage: &Storage,
    ) -> Option<Block> {
        let previous_block_hash: SaitoHash;
        let public_key;
        let private_key;
        let block_timestamp_gap;
        {
            let wallet = self.wallet_lock.read().await;
            previous_block_hash = blockchain.get_latest_block_hash();
            let previous_block_timestamp = match blockchain.get_latest_block() {
                None => 0,
                Some(block) => block.timestamp,
            };

            assert!(
                current_timestamp > previous_block_timestamp,
                "current timestamp = {:?} should be larger than previous block timestamp : {:?}",
                StatVariable::format_timestamp(current_timestamp),
                StatVariable::format_timestamp(previous_block_timestamp)
            );
            block_timestamp_gap =
                Duration::from_millis(current_timestamp - previous_block_timestamp).as_secs();
            public_key = wallet.public_key;
            private_key = wallet.private_key;
        }
        let mempool_work = self
            .can_bundle_block(blockchain, current_timestamp, &gt_tx, configs, &public_key)
            .await?;
        info!(
            "bundling block with {:?} txs with work : {:?} with a gap of {:?} seconds. timestamp : {:?}",
            self.transactions.len(),
            mempool_work,
            block_timestamp_gap,
            current_timestamp
        );

        let staking_tx;
        {
            let mut wallet = self.wallet_lock.write().await;

            staking_tx = wallet
                .create_staking_transaction(
                    blockchain.social_stake_requirement,
                    blockchain.get_latest_unlocked_stake_block_id(),
                    (blockchain.get_latest_block_id() + 1)
                        .saturating_sub(configs.get_consensus_config().unwrap().genesis_period),
                )
                .ok()?;
        }
        self.add_transaction_if_validates(staking_tx, blockchain)
            .await;

        let mut block = Block::create(
            &mut self.transactions,
            previous_block_hash,
            blockchain,
            current_timestamp,
            &public_key,
            &private_key,
            gt_tx,
            configs,
            storage,
        )
        .await
        .ok()?;
        block.generate().ok()?;
        debug!(
            "block generated with work : {:?} and burnfee : {:?} gts : {:?}",
            block.total_work,
            block.burnfee,
            block
                .transactions
                .iter()
                .filter(|tx| matches!(tx.transaction_type, TransactionType::GoldenTicket))
                .count()
        );
        // assert_eq!(block.total_work, mempool_work);
        self.new_tx_added = false;
        self.routing_work_in_mempool = 0;

        for tx in &block.transactions {
            for input in &tx.from {
                let utxo_key = input.utxoset_key;
                self.utxo_map.remove(&utxo_key);
            }
        }

        Some(block)
    }

    pub async fn bundle_genesis_block(
        &mut self,
        blockchain: &mut Blockchain,
        current_timestamp: Timestamp,
        configs: &(dyn Configuration + Send + Sync),
        storage: &Storage,
    ) -> Block {
        debug!("bundling genesis block...");
        let public_key;
        let private_key;

        let wallet = self.wallet_lock.read().await;
        public_key = wallet.public_key;
        private_key = wallet.private_key;

        let mut block = Block::create(
            &mut self.transactions,
            [0; 32],
            blockchain,
            current_timestamp,
            &public_key,
            &private_key,
            None,
            configs,
            storage,
        )
        .await
        .unwrap();
        block.generate().unwrap();
        self.new_tx_added = false;
        self.routing_work_in_mempool = 0;

        block
    }

    pub async fn can_bundle_block(
        &self,
        blockchain: &Blockchain,
        current_timestamp: Timestamp,
        gt_tx: &Option<Transaction>,
        configs: &(dyn Configuration + Send + Sync),
        public_key: &SaitoPublicKey,
    ) -> Option<Currency> {
        if blockchain.blocks.is_empty() {
            warn!("Not generating #1 block. Waiting for blocks from peers");
            return None;
        }
        if !self.blocks_queue.is_empty() {
            trace!("there are blocks in queue. so cannot bundle new block");
            return None;
        }
        if self.transactions.is_empty() || !self.new_tx_added {
            trace!("there are no transactions in queue to bundle new block");
            return None;
        }
        if !blockchain.is_golden_ticket_count_valid(
            blockchain.get_latest_block_hash(),
            gt_tx.is_some(),
            configs.is_browser(),
            configs.is_spv_mode(),
        ) {
            debug!("waiting till more golden tickets come in");
            return None;
        }

        if let Some(previous_block) = blockchain.get_latest_block() {
            let work_available = self.get_routing_work_available();
            let work_needed = BurnFee::return_routing_work_needed_to_produce_block_in_nolan(
                previous_block.burnfee,
                current_timestamp,
                previous_block.timestamp,
                configs.get_consensus_config().unwrap().heartbeat_interval,
            );
            let time_elapsed = current_timestamp - previous_block.timestamp;

            let mut h: Vec<u8> = vec![];
            h.append(&mut public_key.to_vec());
            h.append(&mut previous_block.hash.to_vec());
            let h = hash(h.as_slice());
            let value = U256::from(h);
            let value: Timestamp =
                (value.low_u128() % Duration::from_secs(5).as_millis()) as Timestamp;
            // random hack to make sure nodes are not generating forks when fees are zero
            if current_timestamp < previous_block.timestamp + value {
                return None;
            }
            // info!("aaaa value = {:?}", value);

            let result = work_available >= work_needed;
            if result {
                info!(
                "last ts: {:?}, this ts: {:?}, work available: {:?}, work needed: {:?}, time_elapsed : {:?} can_bundle : {:?}",
                previous_block.timestamp, current_timestamp, work_available, work_needed, time_elapsed, true
                );
            } else {
                info!(
                "last ts: {:?}, this ts: {:?}, work available: {:?}, work needed: {:?}, time_elapsed : {:?} can_bundle : {:?}",
                previous_block.timestamp, current_timestamp, work_available, work_needed, time_elapsed, false
                );
            }
            if result {
                return Some(work_available);
            }
            None
        } else {
            Some(0)
        }
    }

    pub fn delete_block(&mut self, block_hash: &SaitoHash) {
        debug!("deleting block from mempool : {:?}", block_hash.to_hex());

        self.golden_tickets.remove(block_hash);
        // self.blocks_queue.retain(|block| !block.hash.eq(block_hash));
    }

    pub fn delete_transactions(&mut self, transactions: &Vec<Transaction>) {
        for transaction in transactions {
            if let TransactionType::GoldenTicket = transaction.transaction_type {
                let gt = GoldenTicket::deserialize_from_net(&transaction.data);
                self.golden_tickets.remove(&gt.target);
            } else {
                self.transactions.remove(&transaction.signature);
            }
        }

        self.routing_work_in_mempool = 0;

        // add routing work from remaining tx
        for (_, transaction) in &self.transactions {
            self.routing_work_in_mempool += transaction.total_work_for_me;
        }
    }

    ///
    /// Calculates the work available in mempool to produce a block
    ///
    pub fn get_routing_work_available(&self) -> Currency {
        self.routing_work_in_mempool
    }
}

#[cfg(test)]
mod tests {
    use std::ops::Deref;
    use std::sync::Arc;

    use tokio::sync::RwLock;

    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::{SaitoPrivateKey, SaitoPublicKey};
    use crate::core::util::test::test_manager::test::{create_timestamp, TestManager};

    use super::*;

    // #[test]
    // fn mempool_new_test() {
    //     let mempool = Mempool::new([0; 33], [0; 32]);
    //     assert_eq!(mempool.blocks_queue, VecDeque::new());
    // }
    //
    // #[test]
    // fn mempool_add_block_test() {
    //     let mut mempool = Mempool::new([0; 33], [0; 32]);
    //     let block = Block::new();
    //     mempool.add_block(block.clone());
    //     assert_eq!(Some(block), mempool.blocks_queue.pop_front())
    // }

    #[tokio::test]
    #[serial_test::serial]
    async fn mempool_bundle_blocks_test() {
        let mempool_lock: Arc<RwLock<Mempool>>;
        let wallet_lock: Arc<RwLock<Wallet>>;
        let blockchain_lock: Arc<RwLock<Blockchain>>;
        let public_key: SaitoPublicKey;
        let private_key: SaitoPrivateKey;
        let mut t = TestManager::default();

        {
            t.initialize(100, 720_000).await;
            // t.wait_for_mining_event().await;

            wallet_lock = t.get_wallet_lock();
            mempool_lock = t.get_mempool_lock();
            blockchain_lock = t.get_blockchain_lock();
        }

        {
            let wallet = wallet_lock.read().await;

            public_key = wallet.public_key;
            private_key = wallet.private_key;
        }

        let ts = create_timestamp();

        let configs = t.config_lock.read().await;
        let blockchain = blockchain_lock.read().await;
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
        let latest_block_id = blockchain.get_latest_block_id();

        let mut mempool = mempool_lock.write().await;

        let _txs = Vec::<Transaction>::new();

        assert_eq!(mempool.get_routing_work_available(), 0);

        for _i in 0..5 {
            let mut tx = Transaction::default();

            {
                let mut wallet = wallet_lock.write().await;

                let (inputs, outputs) =
                    wallet.generate_slips(720_000, None, latest_block_id, genesis_period);
                tx.from = inputs;
                tx.to = outputs;
                // _i prevents sig from being identical during test
                // and thus from being auto-rejected from mempool
                tx.timestamp = ts + 120000 + _i;
                tx.generate(&public_key, 0, 0);
                tx.sign(&private_key);
            }
            let wallet = wallet_lock.read().await;
            tx.add_hop(&wallet.private_key, &wallet.public_key, &[1; 33]);
            tx.generate(&public_key, 0, 0);
            mempool.add_transaction(tx).await;
        }

        assert_eq!(mempool.transactions.len(), 5);
        assert_eq!(mempool.get_routing_work_available(), 0);

        // TODO : FIX THIS TEST
        // assert_eq!(
        //     mempool.can_bundle_block(blockchain_lock.clone(), ts).await,
        //     false
        // );

        assert!(mempool
            .can_bundle_block(
                &blockchain,
                ts + 120000,
                &None,
                configs.deref(),
                &public_key,
            )
            .await
            .is_some());
    }
}
