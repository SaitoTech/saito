use ahash::AHashMap;
use log::{debug, error, info, trace, warn};
use num_derive::FromPrimitive;
use num_traits::Zero;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::convert::TryInto;
use std::fmt::{Display, Formatter};
use std::io::{Error, ErrorKind};
use std::ops::Rem;
use std::{i128, mem};

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::burnfee::BurnFee;
use crate::core::consensus::golden_ticket::GoldenTicket;
use crate::core::consensus::hop::HOP_SIZE;
use crate::core::consensus::merkle::MerkleTree;
use crate::core::consensus::slip::{Slip, SlipType, SLIP_SIZE};
use crate::core::consensus::transaction::{Transaction, TransactionType, TRANSACTION_SIZE};
use crate::core::defs::{
    BlockId, Currency, PeerIndex, PrintForLog, SaitoHash, SaitoPrivateKey, SaitoPublicKey,
    SaitoSignature, SaitoUTXOSetKey, Timestamp, UtxoSet, BLOCK_FILE_EXTENSION,
};
use crate::core::io::storage::Storage;
use crate::core::util::configuration::Configuration;
use crate::core::util::crypto::{hash, sign, verify_signature};
use crate::iterate;

pub const BLOCK_HEADER_SIZE: usize = 389;

//
// ConsensusValues is an object that is generated that contains all of the
// variables that a block SHOULD contain given its position in the chain
// and its set of transactions.
//
// This object is returned by the functino generate_consensus_values() and
// used to populate the variables in the block. It is also used to validate
// the information in blocks. We strive to keep the names of the variables
// in this object consistent with the names of the variables in the blocks
// themselves so it is easy to know which values are used to check which
// values in the block.
//
#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct ConsensusValues {
    // expected transaction containing outbound payments
    pub fee_transaction: Option<Transaction>,

    // number of staking transactions if exist
    pub st_num: u8,
    // index of staking transaction if exists
    pub st_index: Option<usize>,
    // number of issuance transactions if exists
    pub it_num: u8,
    // index of issuance transactions if exists
    pub it_index: Option<usize>,
    // number of FEE in transactions if exists
    pub ft_num: u8,
    // index of FEE in transactions if exists
    pub ft_index: Option<usize>,
    // number of GT in transactions if exists
    pub gt_num: u8,
    // index of GT in transactions if exists
    pub gt_index: Option<usize>,

    // total fees -- new and atr transactions
    pub total_fees: Currency,
    // total fees -- only new transactions
    pub total_fees_new: Currency,
    // total fees -- only atr transactions
    pub total_fees_atr: Currency,
    // total fees -- only fees from txs in block
    pub total_fees_cumulative: Currency,

    // smoothed avg fees -- new and atr transactions
    pub avg_total_fees: Currency,
    // smoothed avg fees -- only new transactions
    pub avg_total_fees_new: Currency,
    // smoothed avg fees -- only atr transactions
    pub avg_total_fees_atr: Currency,

    // total size in bytes
    pub total_bytes_new: u64,

    // total amount paid to routers
    pub total_payout_routing: Currency,
    // total amount paid to routers
    pub total_payout_mining: Currency,
    // total amount paid to treasury
    pub total_payout_treasury: Currency,
    // total amount paid to graveyard
    pub total_payout_graveyard: Currency,
    // total amount paid to atr/utxo
    pub total_payout_atr: Currency,

    // smoothed avg routing payout
    pub avg_payout_routing: Currency,
    // smoothed avg mining payout
    pub avg_payout_mining: Currency,
    // smoothed avg treasury payout
    pub avg_payout_treasury: Currency,
    // smoothed avg graveyard payout
    pub avg_payout_graveyard: Currency,
    // smoothed avg atr payout
    pub avg_payout_atr: Currency,

    // smoothed avg fee per byte (last epoch)
    pub avg_fee_per_byte: Currency,

    // avg byte fees paid by all txs (single block)
    pub fee_per_byte: Currency,

    // expected burnfee
    pub burnfee: Currency,
    // expected difficulty
    pub difficulty: u64,

    // number of rebroadcast slips
    pub total_rebroadcast_slips: u64,
    // total inputs rebroadcast
    pub total_rebroadcast_nolan: Currency,
    // rebroadcast txs
    pub rebroadcasts: Vec<Transaction>,
    // all ATR txs hashed together
    pub rebroadcast_hash: [u8; 32],
    // average of SAITO rebroadcast (inputs) each block
    pub avg_nolan_rebroadcast_per_block: Currency,

    pub total_rebroadcast_fees_nolan: Currency,

    pub total_rebroadcast_staking_payouts_nolan: Currency,

    pub total_fees_paid_by_nonrebroadcast_atr_transactions: Currency,

    pub expected_difficulty: u64,
}

impl Display for ConsensusValues {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "ConsensusValues {{ fee_transaction: {:?}, st_num: {}, st_index: {:?}, it_num: {}, it_index: {:?}, ft_num: {}, ft_index: {:?}, gt_num: {}, gt_index: {:?}, total_fees: {}, total_fees_new: {}, total_fees_atr: {}, total_fees_cumulative: {}, avg_total_fees: {}, avg_total_fees_new: {}, avg_total_fees_atr: {}, total_bytes_new: {}, total_payout_routing: {}, total_payout_mining: {}, total_payout_treasury: {}, total_payout_graveyard: {}, total_payout_atr: {}, avg_payout_routing: {}, avg_payout_mining: {}, avg_payout_treasury: {}, avg_payout_graveyard: {}, avg_payout_atr: {}, avg_fee_per_byte: {}, fee_per_byte: {}, burnfee: {}, difficulty: {}, rebroadcasts: {:?}, total_rebroadcast_slips: {}, total_rebroadcast_nolan: {}, rebroadcast_hash: {:?}, avg_nolan_rebroadcast_per_block: {}, total_rebroadcast_fees_nolan: {}, total_rebroadcast_staking_payouts_nolan: {}, total_fees_paid_by_nonrebroadcast_atr_transactions: {}, expected_difficulty: {} }}",
            self.fee_transaction,
            self.st_num,
            self.st_index,
            self.it_num,
            self.it_index,
            self.ft_num,
            self.ft_index,
            self.gt_num,
            self.gt_index,
            self.total_fees,
            self.total_fees_new,
            self.total_fees_atr,
            self.total_fees_cumulative,
            self.avg_total_fees,
            self.avg_total_fees_new,
            self.avg_total_fees_atr,
            self.total_bytes_new,
            self.total_payout_routing,
            self.total_payout_mining,
            self.total_payout_treasury,
            self.total_payout_graveyard,
            self.total_payout_atr,
            self.avg_payout_routing,
            self.avg_payout_mining,
            self.avg_payout_treasury,
            self.avg_payout_graveyard,
            self.avg_payout_atr,
            self.avg_fee_per_byte,
            self.fee_per_byte,
            self.burnfee,
            self.difficulty,
            self.rebroadcasts.len(),
            self.total_rebroadcast_slips,
            self.total_rebroadcast_nolan,
            self.rebroadcast_hash.to_hex(),
            self.avg_nolan_rebroadcast_per_block,
            self.total_rebroadcast_fees_nolan,
            self.total_rebroadcast_staking_payouts_nolan,
            self.total_fees_paid_by_nonrebroadcast_atr_transactions,
            self.expected_difficulty)
    }
}

impl ConsensusValues {
    #[allow(clippy::too_many_arguments)]
    pub fn new() -> ConsensusValues {
        ConsensusValues {
            fee_transaction: None,

            st_num: 0,
            st_index: None,
            it_num: 0,
            it_index: None,
            ft_num: 0,
            ft_index: None,
            gt_num: 0,
            gt_index: None,

            total_fees: 5000,
            total_fees_new: 0,
            total_fees_atr: 0,
            total_fees_cumulative: 0,

            avg_total_fees: 0,
            avg_total_fees_new: 0,
            avg_total_fees_atr: 0,

            total_bytes_new: 0,

            total_payout_routing: 0,
            total_payout_mining: 0,
            total_payout_treasury: 0,
            total_payout_graveyard: 0,
            total_payout_atr: 0,

            avg_payout_routing: 0,
            avg_payout_mining: 0,
            avg_payout_treasury: 0,
            avg_payout_graveyard: 0,
            avg_payout_atr: 0,

            avg_fee_per_byte: 0,
            fee_per_byte: 0,

            burnfee: 1,
            difficulty: 1,

            rebroadcasts: vec![],
            total_rebroadcast_slips: 0,
            total_rebroadcast_nolan: 0,
            rebroadcast_hash: [0; 32],
            avg_nolan_rebroadcast_per_block: 0,

            total_rebroadcast_fees_nolan: 0,

            total_rebroadcast_staking_payouts_nolan: 0,

            total_fees_paid_by_nonrebroadcast_atr_transactions: 0,

            expected_difficulty: 0,
        }
    }
}

impl Default for ConsensusValues {
    fn default() -> ConsensusValues {
        ConsensusValues {
            fee_transaction: None,

            st_num: 0,
            st_index: None,
            it_num: 0,
            it_index: None,
            ft_num: 0,
            ft_index: None,
            gt_num: 0,
            gt_index: None,

            total_fees: 0,
            total_fees_new: 0,
            total_fees_atr: 0,
            total_fees_cumulative: 0,

            avg_total_fees: 0,
            avg_total_fees_new: 0,
            avg_total_fees_atr: 0,

            total_bytes_new: 0,

            total_payout_routing: 0,
            total_payout_mining: 0,
            total_payout_treasury: 0,
            total_payout_graveyard: 0,
            total_payout_atr: 0,

            avg_payout_routing: 0,
            avg_payout_mining: 0,
            avg_payout_treasury: 0,
            avg_payout_graveyard: 0,
            avg_payout_atr: 0,

            avg_fee_per_byte: 0,
            fee_per_byte: 0,

            burnfee: 1,
            difficulty: 1,

            rebroadcasts: vec![],
            total_rebroadcast_slips: 0,
            total_rebroadcast_nolan: 0,
            rebroadcast_hash: [0; 32],
            avg_nolan_rebroadcast_per_block: 0,
            total_rebroadcast_fees_nolan: 0,

            total_rebroadcast_staking_payouts_nolan: 0,

            total_fees_paid_by_nonrebroadcast_atr_transactions: 0,

            expected_difficulty: 0,
        }
    }
}

///
/// BlockType is a human-readable indicator of the state of the block
/// with particular attention to its state of pruning and the amount of
/// data that is available. It is used by some functions to fetch blocks
/// that require certain types of data, such as the full set of transactions
/// or the UTXOSet
///
/// Hash - a ghost block sent to lite-clients primarily for SPV mode
/// Header - the header of the block without transaction data
/// Full - the full block including transactions and signatures
///
#[derive(Serialize, Deserialize, Debug, Copy, PartialEq, Clone, FromPrimitive)]
pub enum BlockType {
    Ghost = 0,
    Header = 1,
    Pruned = 2,
    Full = 3,
}

#[serde_with::serde_as]
#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct Block {
    /// Consensus Level Variables
    ///
    /// these are the variables that are serialized into the block header
    /// and distributed with every block. validating a block requires
    /// confirming that all of these values are correct given the content
    /// in the block itself.
    ///
    pub id: BlockId,
    pub timestamp: Timestamp,
    pub previous_block_hash: [u8; 32],
    #[serde_as(as = "[_; 33]")]
    pub creator: [u8; 33],
    pub merkle_root: [u8; 32],
    #[serde_as(as = "[_; 64]")]
    pub signature: [u8; 64],
    pub graveyard: Currency,
    pub treasury: Currency,

    pub total_fees: Currency,
    pub total_fees_new: Currency,
    pub total_fees_atr: Currency,
    pub total_fees_cumulative: Currency,
    pub avg_total_fees: Currency,
    pub avg_total_fees_new: Currency,
    pub avg_total_fees_atr: Currency,
    pub total_payout_routing: Currency,
    pub total_payout_mining: Currency,
    pub total_payout_treasury: Currency,
    pub total_payout_graveyard: Currency,
    pub total_payout_atr: Currency,
    pub avg_payout_routing: Currency,
    pub avg_payout_mining: Currency,
    pub avg_payout_treasury: Currency,
    pub avg_payout_graveyard: Currency,
    pub avg_payout_atr: Currency,
    pub avg_fee_per_byte: Currency,
    pub fee_per_byte: Currency,
    pub avg_nolan_rebroadcast_per_block: Currency,
    pub burnfee: Currency,
    pub difficulty: u64,
    pub previous_block_unpaid: Currency,

    /// Transactions
    ///
    /// these are all of the transactions that are found a full-block.
    /// lite-blocks may only contain subsets of these transactions, which
    /// can be validated independently.
    ///
    pub transactions: Vec<Transaction>,

    /// Non-Consensus Values
    ///
    /// these values are needed when creating or validating a block but are
    /// generated from the block-data and are not included in the block-header
    /// and must be created by running block.generate() which fills in most
    /// of these values.
    ///
    /// the pre_hash is the hash created from all of the contents of this
    /// block. it is then hashed with the previous_block_hash (in header)
    /// to generate the unique hash for this block. this hash is not incl.
    /// in the consensus variables as it can be independently generated.
    ///
    pub pre_hash: SaitoHash,
    /// hash of block, combines pre_hash and previous_block_hash
    pub hash: SaitoHash,

    /// total routing work in block for block creator
    pub total_work: Currency,
    /// is block on longest chain
    pub in_longest_chain: bool,
    // has golden ticket
    pub has_golden_ticket: bool,
    // has issuance transaction
    pub has_issuance_transaction: bool,
    // issuance transaction index
    pub issuance_transaction_index: u64,
    // has fee transaction
    pub has_fee_transaction: bool,
    pub has_staking_transaction: bool,
    // golden ticket index
    pub golden_ticket_index: u64,
    // fee transaction index
    pub fee_transaction_index: u64,
    // number of rebroadcast slips
    pub total_rebroadcast_slips: u64,
    // number of rebroadcast txs
    pub total_rebroadcast_nolan: Currency,
    // all ATR txs hashed together
    pub rebroadcast_hash: [u8; 32],
    // the state of the block w/ pruning etc
    pub block_type: BlockType,
    pub cv: ConsensusValues,
    // vector of staker slips spent this block - used to prevent withdrawals and payouts same block
    #[serde(skip)]
    pub slips_spent_this_block: AHashMap<SaitoUTXOSetKey, u64>,
    #[serde(skip)]
    pub created_hashmap_of_slips_spent_this_block: bool,
    #[serde(skip)]
    pub routed_from_peer: Option<PeerIndex>,
    #[serde(skip)]
    pub transaction_map: AHashMap<SaitoPublicKey, bool>,
    #[serde(skip)]
    pub force_loaded: bool,
    // used for checking, before pruning txs from block on downgrade
    pub safe_to_prune_transactions: bool,
    /// this block has a checkpoint. therefore we cannot reorg past this block.
    pub has_checkpoint: bool,
}

impl Display for Block {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "Block {{ id: {}, timestamp: {}, previous_block_hash: {:?}, creator: {:?}, merkle_root: {:?}, signature: {:?}, graveyard: {}, treasury: {}, total_fees: {}, total_fees_new: {}, total_fees_atr: {}, avg_total_fees: {}, avg_total_fees_new: {}, avg_total_fees_atr: {}, total_payout_routing: {}, total_payout_mining: {}, total_payout_treasury: {}, total_payout_graveyard: {}, total_payout_atr: {}, avg_payout_routing: {}, avg_payout_mining: {}, avg_payout_treasury: {}, avg_payout_graveyard: {}, avg_payout_atr: {}, avg_fee_per_byte: {}, fee_per_byte: {}, avg_nolan_rebroadcast_per_block: {}, burnfee: {}, difficulty: {}, previous_block_unpaid: {}, hash: {:?}, total_work: {}, in_longest_chain: {}, has_golden_ticket: {}, has_issuance_transaction: {}, issuance_transaction_index: {}, has_fee_transaction: {}, has_staking_transaction: {}, golden_ticket_index: {}, fee_transaction_index: {}, total_rebroadcast_slips: {}, total_rebroadcast_nolan: {}, rebroadcast_hash: {}, block_type: {:?}, cv: {}, routed_from_peer: {:?} ",
            self.id,
            self.timestamp,
            self.previous_block_hash.to_hex(),
            self.creator.to_base58(),
            self.merkle_root.to_hex(),
            self.signature.to_hex(),
            self.graveyard,
            self.treasury,
            self.total_fees,
            self.total_fees_new,
            self.total_fees_atr,
            self.avg_total_fees,
            self.avg_total_fees_new,
            self.avg_total_fees_atr,
            self.total_payout_routing,
            self.total_payout_mining,
            self.total_payout_treasury,
            self.total_payout_graveyard,
            self.total_payout_atr,
            self.avg_payout_routing,
            self.avg_payout_mining,
            self.avg_payout_treasury,
            self.avg_payout_graveyard,
            self.avg_payout_atr,
            self.avg_fee_per_byte,
            self.fee_per_byte,
            self.avg_nolan_rebroadcast_per_block,
            self.burnfee,
            self.difficulty,
            self.previous_block_unpaid,
            self.hash.to_hex(),
            self.total_work,
            self.in_longest_chain,
            self.has_golden_ticket,
            self.has_issuance_transaction,
            self.issuance_transaction_index,
            self.has_fee_transaction,
            self.has_staking_transaction,
            self.golden_ticket_index,
            self.fee_transaction_index,
            self.total_rebroadcast_slips,
            self.total_rebroadcast_nolan,
            self.rebroadcast_hash.to_hex(),
            self.block_type,
            self.cv,
            self.routed_from_peer,
        ).unwrap();
        // writeln!(f, " transactions : ").unwrap();
        // for (index, tx) in self.transactions.iter().enumerate() {
        //     writeln!(f, "tx {} : {}", index, tx).unwrap();
        // }
        writeln!(f, "}}")
    }
}

impl Block {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Block {
        Block {
            id: 0,
            timestamp: 0,
            previous_block_hash: [0; 32],
            creator: [0; 33],
            merkle_root: [0; 32],
            signature: [0; 64],
            graveyard: 0,
            treasury: 0,
            previous_block_unpaid: 0,
            total_fees: 0,
            total_fees_new: 0,
            total_fees_atr: 0,
            total_fees_cumulative: 0,
            avg_total_fees: 0,
            avg_total_fees_new: 0,
            avg_total_fees_atr: 0,
            total_payout_routing: 0,
            total_payout_mining: 0,
            total_payout_treasury: 0,
            total_payout_graveyard: 0,
            total_payout_atr: 0,
            avg_payout_routing: 0,
            avg_payout_mining: 0,
            avg_payout_treasury: 0,
            avg_payout_graveyard: 0,
            avg_payout_atr: 0,
            avg_fee_per_byte: 0,
            fee_per_byte: 0,
            burnfee: 0,
            difficulty: 0,
            avg_nolan_rebroadcast_per_block: 0,

            transactions: vec![],
            pre_hash: [0; 32],
            hash: [0; 32],
            total_work: 0,
            in_longest_chain: false,
            has_golden_ticket: false,
            has_fee_transaction: false,
            has_staking_transaction: false,
            has_issuance_transaction: false,
            issuance_transaction_index: 0,
            golden_ticket_index: 0,
            fee_transaction_index: 0,
            total_rebroadcast_slips: 0,
            total_rebroadcast_nolan: 0,
            // must be initialized zeroed-out for proper hashing
            rebroadcast_hash: [0; 32],
            //filename: String::new(),
            block_type: BlockType::Full,
            // hashmap of all SaitoUTXOSetKeys of the slips in the block
            slips_spent_this_block: AHashMap::new(),
            created_hashmap_of_slips_spent_this_block: false,
            routed_from_peer: None,
            transaction_map: Default::default(),
            cv: ConsensusValues::default(),
            force_loaded: false,
            safe_to_prune_transactions: false,
            has_checkpoint: false,
        }
    }

    pub fn add_transaction(&mut self, tx: Transaction) {
        self.transactions.push(tx);
    }

    //
    // returns valid block
    //
    pub async fn create(
        transactions: &mut AHashMap<SaitoSignature, Transaction>,
        previous_block_hash: SaitoHash,
        blockchain: &Blockchain,
        current_timestamp: Timestamp,
        public_key: &SaitoPublicKey,
        private_key: &SaitoPrivateKey,
        golden_ticket: Option<Transaction>,
        configs: &(dyn Configuration + Send + Sync),
        storage: &Storage,
    ) -> Result<Block, Error> {
        debug!(
            "Block::create : previous block hash : {:?}",
            previous_block_hash.to_hex()
        );

        let mut previous_block_id = 0;
        let mut _previous_block_timestamp = 0;
        let mut previous_block_graveyard = 0;
        let mut previous_block_treasury = 0;
        let mut previous_block_total_fees = 0;
        let mut _previous_block_avg_total_fees = 0;
        let mut _previous_block_avg_total_fees_new = 0;
        let mut _previous_block_avg_total_fees_atr = 0;
        let mut _previous_block_avg_payout_routing = 0;
        let mut _previous_block_avg_payout_mining = 0;
        let mut _previous_block_avg_payout_treasury = 0;
        let mut _previous_block_avg_payout_graveyard = 0;
        let mut _previous_block_avg_payout_atr = 0;
        let mut _previous_block_avg_fee_per_byte = 0;

        if let Some(previous_block) = blockchain.blocks.get(&previous_block_hash) {
            previous_block_id = previous_block.id;
            previous_block_total_fees = previous_block.total_fees;
            _previous_block_timestamp = previous_block.timestamp;
            previous_block_graveyard = previous_block.graveyard;
            previous_block_treasury = previous_block.treasury;
            _previous_block_avg_total_fees = previous_block.avg_total_fees;
            _previous_block_avg_total_fees_new = previous_block.avg_total_fees_new;
            _previous_block_avg_total_fees_atr = previous_block.avg_total_fees_atr;
            _previous_block_avg_payout_routing = previous_block.avg_payout_routing;
            _previous_block_avg_payout_mining = previous_block.avg_payout_mining;
            _previous_block_avg_payout_treasury = previous_block.avg_payout_treasury;
            _previous_block_avg_payout_graveyard = previous_block.avg_payout_graveyard;
            _previous_block_avg_payout_atr = previous_block.avg_payout_atr;
            _previous_block_avg_fee_per_byte = previous_block.avg_fee_per_byte;
        }

        //
        // create block
        //
        let mut block = Block::new();

        //
        // fill in default values
        //
        block.id = previous_block_id + 1;
        block.previous_block_hash = previous_block_hash;
        block.timestamp = current_timestamp;
        block.creator = *public_key;

        //
        // previous block unpaid
        //
        if golden_ticket.is_some() {
            block.previous_block_unpaid = 0;
        } else {
            block.previous_block_unpaid = previous_block_total_fees;
        }

        //
        // golden ticket
        //
        if let Some(gt) = golden_ticket {
            block.transactions.push(gt);
        }

        //
        // normal transactions
        //
        block.transactions.reserve(transactions.len());
        let iter = transactions.drain().map(|(_, tx)| tx);
        block.transactions.extend(iter);
        transactions.clear();

        //
        // consensus values
        //
        let mut cv: ConsensusValues = block
            .generate_consensus_values(blockchain, storage, configs)
            .await;
        block.cv = cv.clone();

        //
        // total fees new
        //
        block.total_fees_new = cv.total_fees_new;

        //
        // total fees atr
        //
        block.total_fees_atr = cv.total_fees_atr;

        //
        // total fees cumulative
        //
        block.total_fees_cumulative = cv.total_fees_cumulative;

        //
        // total fees
        //
        block.total_fees = block.total_fees_new + block.total_fees_atr;

        //
        // avg total fees
        //
        block.avg_total_fees = cv.avg_total_fees;

        //
        // avg total fees new
        //
        block.avg_total_fees_new = cv.avg_total_fees_new;

        //
        // avg total fees atr
        //
        block.avg_total_fees_atr = cv.avg_total_fees_atr;

        //
        // payout routing
        //
        block.total_payout_routing = cv.total_payout_routing;

        //
        // avg payout mining
        //
        block.total_payout_mining = cv.total_payout_mining;

        //
        // avg payout treasury
        //
        block.total_payout_treasury = cv.total_payout_treasury;

        //
        // avg payout graveyard
        //
        block.total_payout_graveyard = cv.total_payout_graveyard;

        //
        // avg payout atr
        //
        block.total_payout_atr = cv.total_payout_atr;

        //
        // avg payout routing
        //
        block.avg_payout_routing = cv.avg_payout_routing;

        //
        // avg payout mining
        //
        block.avg_payout_mining = cv.avg_payout_mining;

        //
        // avg payout treasury
        //
        block.avg_payout_treasury = cv.avg_payout_treasury;

        //
        // avg payout graveyard
        //
        block.avg_payout_graveyard = cv.avg_payout_graveyard;

        //
        // avg payout atr
        //
        block.avg_payout_atr = cv.avg_payout_atr;

        //
        // fee per byte
        //
        block.avg_fee_per_byte = cv.avg_fee_per_byte;

        //
        // fee per byte
        //
        block.fee_per_byte = cv.fee_per_byte;

        //
        // nolan rebroadcast per block
        //
        block.avg_nolan_rebroadcast_per_block = cv.avg_nolan_rebroadcast_per_block;

        //
        // burn fee
        //
        block.burnfee = cv.burnfee;

        //
        // difficulty
        //
        block.difficulty = cv.difficulty;

        //
        // treasury
        //
        block.treasury = previous_block_treasury + cv.total_payout_treasury - cv.total_payout_atr;

        //
        // graveyard
        //
        block.graveyard = previous_block_graveyard + cv.total_payout_graveyard;

        //
        // ATR transactions
        //
        let rlen = cv.rebroadcasts.len();

        //
        // TODO - can we remove this section and skip right ahead to appending the atr txs? we run
        // generate() down below at the end of this function, so why are we generating the hash and
        // the merkle-root here?
        //
        // and why do we run it below AFTER we sign the block? if we can eliminate the need for this
        // loop through the transaction set and the redundant creation of the tx hashes and the
        // block merkle-root that would be an improvement to the efficiency of block creation.
        //
        let _tx_hashes_generated = cv.rebroadcasts[0..rlen]
            .iter_mut()
            .enumerate()
            .all(|(index, tx)| tx.generate(public_key, index as u64, block.id));

        //
        // add ATR transactions
        //
        if rlen > 0 {
            block.transactions.append(&mut cv.rebroadcasts);
        }

        //
        // fee transaction
        //
        if cv.fee_transaction.is_some() {
            let mut fee_tx = cv.fee_transaction.unwrap();
            let hash_for_signature: SaitoHash = hash(&fee_tx.serialize_for_signature());
            fee_tx.hash_for_signature = Some(hash_for_signature);
            fee_tx.sign(private_key);
            block.add_transaction(fee_tx);
        }

        //
        // create hashmap of slips_spent_this_block (used to avoid doublespends)
        //
        if !block.created_hashmap_of_slips_spent_this_block {
            debug!(
                "creating hashmap of slips spent this block : {}...",
                block.id
            );

            for transaction in &block.transactions {
                if transaction.transaction_type != TransactionType::Fee {
                    for input in transaction.from.iter() {
                        if input.amount == 0 {
                            continue;
                        }

                        let value = block
                            .slips_spent_this_block
                            .entry(input.get_utxoset_key())
                            .and_modify(|e| *e += 1)
                            .or_insert(1);

                        if *value > 1 && input.amount > 0 {
                            warn!(
                                "double-spend detected in block {} : {} in block.create()",
                                block.id, input
                            );
                            return Err(Error::new(
                                ErrorKind::InvalidData,
                                "double-spend detected",
                            ));
                        }
                    }
                }
                block.created_hashmap_of_slips_spent_this_block = true;
            }
        }
        block.created_hashmap_of_slips_spent_this_block = true;

        //
        // generate merkle root
        //
        block.merkle_root = block.generate_merkle_root(configs.is_browser(), configs.is_spv_mode());

        //
        // the "pre-hash" is a hash value created from all of the consensus-data and is
        // signed by the block creator to generate the signature. the signature is then
        // part of the block data that is used to generate the final block hash.
        //
        block.generate_pre_hash();
        block.sign(private_key);

        //
        // finally run generate()
        //
        block.generate()?;

        Ok(block)
    }

    //
    // runs when block deleted
    //
    pub async fn delete(&self, utxoset: &mut UtxoSet) -> bool {
        for tx in &self.transactions {
            tx.delete(utxoset).await;
        }
        true
    }

    /// Deserialize from bytes to a Block.
    /// [len of transactions - 4 bytes - u32]
    /// [id - 8 bytes - u64]
    /// [timestamp - 8 bytes - u64]
    /// [previous_block_hash - 32 bytes - SHA 256 hash]
    /// [creator - 33 bytes - Secp25k1 pubkey compact format]
    /// [merkle_root - 32 bytes - SHA 256 hash
    /// [signature - 64 bytes - Secp25k1 sig]
    /// [graveyard - 8 bytes - u64]
    /// [treasury - 8 bytes - u64]
    /// [burnfee - 8 bytes - u64]
    /// [difficulty - 8 bytes - u64]
    /// [avg_total_fees - 8 bytes - u64]
    /// [avg_fee_per_byte - 8 bytes - u64]
    /// [avg_nolan_rebroadcast_per_block - 8 bytes - u64]
    /// [previous_block_unpaid - 8 bytes - u64]

    /// [avg_total_fees - 8 bytes - u64]
    /// [avg_total_fees_new - 8 bytes - u64]
    /// [avg_total_fees_atr - 8 bytes - u64]
    /// [avg_payout_routing - 8 bytes - u64]
    /// [avg_payout_mining - 8 bytes - u64]
    /// [avg_payout_treasury - 8 bytes - u64]
    /// [avg_payout_graveyard - 8 bytes - u64]
    /// [avg_payout_atr - 8 bytes - u64]
    /// [total_payout_routing - 8 bytes - u64]
    /// [total_payout_mining - 8 bytes - u64]
    /// [total_payout_treasury - 8 bytes - u64]
    /// [total_payout_graveyard - 8 bytes - u64]
    /// [total_payout_atr - 8 bytes - u64]
    /// [total_fees - 8 bytes - u64]
    /// [total_fees_new - 8 bytes - u64]
    /// [total_fees_atr - 8 bytes - u64]
    /// [fee_per_byte - 8 bytes - u64]
    /// [total_fees_cumulative - 8 bytes - u64]

    /// [transaction][transaction][transaction]...
    pub fn deserialize_from_net(bytes: &[u8]) -> Result<Block, Error> {
        if bytes.len() < BLOCK_HEADER_SIZE {
            warn!(
                "block buffer is smaller than header length. length : {:?}",
                bytes.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let transactions_len: u32 = u32::from_be_bytes(
            bytes[0..4]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let id: u64 = u64::from_be_bytes(
            bytes[4..12]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let timestamp: Timestamp = Timestamp::from_be_bytes(
            bytes[12..20]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let previous_block_hash: SaitoHash = bytes[20..52]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let creator: SaitoPublicKey = bytes[52..85]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let merkle_root: SaitoHash = bytes[85..117]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let signature: SaitoSignature = bytes[117..181]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;

        let graveyard: Currency = Currency::from_be_bytes(bytes[181..189].try_into().unwrap());
        let treasury: Currency = Currency::from_be_bytes(bytes[189..197].try_into().unwrap());
        let burnfee: Currency = Currency::from_be_bytes(bytes[197..205].try_into().unwrap());
        let difficulty: u64 = u64::from_be_bytes(bytes[205..213].try_into().unwrap());
        let avg_total_fees: Currency = Currency::from_be_bytes(bytes[213..221].try_into().unwrap()); // dupe below
        let avg_fee_per_byte: Currency =
            Currency::from_be_bytes(bytes[221..229].try_into().unwrap());
        let avg_nolan_rebroadcast_per_block: Currency =
            Currency::from_be_bytes(bytes[229..237].try_into().unwrap());
        let previous_block_unpaid: Currency =
            Currency::from_be_bytes(bytes[237..245].try_into().unwrap());
        let avg_total_fees: Currency = Currency::from_be_bytes(bytes[245..253].try_into().unwrap());
        let avg_total_fees_new: Currency =
            Currency::from_be_bytes(bytes[253..261].try_into().unwrap());
        let avg_total_fees_atr: Currency =
            Currency::from_be_bytes(bytes[261..269].try_into().unwrap());
        let avg_payout_routing: Currency =
            Currency::from_be_bytes(bytes[269..277].try_into().unwrap());
        let avg_payout_mining: Currency =
            Currency::from_be_bytes(bytes[277..285].try_into().unwrap());
        let avg_payout_treasury: Currency =
            Currency::from_be_bytes(bytes[285..293].try_into().unwrap());
        let avg_payout_graveyard: Currency =
            Currency::from_be_bytes(bytes[293..301].try_into().unwrap());
        let avg_payout_atr: Currency = Currency::from_be_bytes(bytes[301..309].try_into().unwrap());
        let total_payout_routing: Currency =
            Currency::from_be_bytes(bytes[309..317].try_into().unwrap());
        let total_payout_mining: Currency =
            Currency::from_be_bytes(bytes[317..325].try_into().unwrap());
        let total_payout_treasury: Currency =
            Currency::from_be_bytes(bytes[325..333].try_into().unwrap());
        let total_payout_graveyard: Currency =
            Currency::from_be_bytes(bytes[333..341].try_into().unwrap());
        let total_payout_atr: Currency =
            Currency::from_be_bytes(bytes[341..349].try_into().unwrap());
        let total_fees: Currency = Currency::from_be_bytes(bytes[349..357].try_into().unwrap());
        let total_fees_new: Currency = Currency::from_be_bytes(bytes[357..365].try_into().unwrap());
        let total_fees_atr: Currency = Currency::from_be_bytes(bytes[365..373].try_into().unwrap());
        let fee_per_byte: Currency = Currency::from_be_bytes(bytes[373..381].try_into().unwrap());
        let total_fees_cumulative: Currency =
            Currency::from_be_bytes(bytes[381..389].try_into().unwrap());

        let mut transactions = vec![];
        let mut start_of_transaction_data = BLOCK_HEADER_SIZE;
        for _n in 0..transactions_len {
            if bytes.len() < start_of_transaction_data + 16 {
                warn!(
                    "block buffer is invalid to read transaction metadata. length : {:?}, end_of_tx_data : {:?}",
                    bytes.len(),
                    start_of_transaction_data+16
                );
                return Err(Error::from(ErrorKind::InvalidData));
            }
            let inputs_len: u32 = u32::from_be_bytes(
                bytes[start_of_transaction_data..start_of_transaction_data + 4]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            );
            let outputs_len: u32 = u32::from_be_bytes(
                bytes[start_of_transaction_data + 4..start_of_transaction_data + 8]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            );
            let message_len: usize = u32::from_be_bytes(
                bytes[start_of_transaction_data + 8..start_of_transaction_data + 12]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ) as usize;
            let path_len: usize = u32::from_be_bytes(
                bytes[start_of_transaction_data + 12..start_of_transaction_data + 16]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ) as usize;
            let total_len = inputs_len
                .checked_add(outputs_len)
                .ok_or(Error::from(ErrorKind::InvalidData))?;
            let end_of_transaction_data = start_of_transaction_data
                + TRANSACTION_SIZE
                + (total_len as usize * SLIP_SIZE)
                + message_len
                + path_len * HOP_SIZE;

            if bytes.len() < end_of_transaction_data {
                warn!(
                    "block buffer is invalid to read transaction data. length : {:?}, end of tx data : {:?}, tx_count : {:?}",
                    bytes.len(), end_of_transaction_data, transactions_len
                );
                return Err(Error::from(ErrorKind::InvalidData));
            }
            let transaction = Transaction::deserialize_from_net(
                &bytes[start_of_transaction_data..end_of_transaction_data].to_vec(),
            )?;
            transactions.push(transaction);
            start_of_transaction_data = end_of_transaction_data;
        }

        let mut block = Block::new();
        block.id = id;
        block.timestamp = timestamp;
        block.previous_block_hash = previous_block_hash;
        block.creator = creator;
        block.merkle_root = merkle_root;
        block.signature = signature;
        block.graveyard = graveyard;
        block.treasury = treasury;
        block.burnfee = burnfee;
        block.difficulty = difficulty;
        block.avg_total_fees = avg_total_fees;
        block.avg_fee_per_byte = avg_fee_per_byte;
        block.avg_nolan_rebroadcast_per_block = avg_nolan_rebroadcast_per_block;
        block.previous_block_unpaid = previous_block_unpaid;
        block.avg_total_fees = avg_total_fees;
        block.avg_total_fees_new = avg_total_fees_new;
        block.avg_total_fees_atr = avg_total_fees_atr;
        block.avg_payout_routing = avg_payout_routing;
        block.avg_payout_mining = avg_payout_mining;
        block.avg_payout_treasury = avg_payout_treasury;
        block.avg_payout_graveyard = avg_payout_graveyard;
        block.avg_payout_atr = avg_payout_atr;
        block.total_payout_routing = total_payout_routing;
        block.total_payout_mining = total_payout_mining;
        block.total_payout_treasury = total_payout_treasury;
        block.total_payout_graveyard = total_payout_graveyard;
        block.total_payout_atr = total_payout_atr;
        block.total_fees = total_fees;
        block.total_fees_new = total_fees_new;
        block.total_fees_atr = total_fees_atr;
        block.fee_per_byte = fee_per_byte;
        block.total_fees_cumulative = total_fees_cumulative;

        block.transactions = transactions.to_vec();

        // trace!("block.deserialize tx length = {:?}", transactions_len);
        if transactions_len == 0 && !(block.id == 1 && previous_block_hash == [0; 32]) {
            block.block_type = BlockType::Header;
        }

        Ok(block)
    }

    /// downgrade block
    pub async fn downgrade_block_to_block_type(
        &mut self,
        block_type: BlockType,
        _is_spv: bool,
    ) -> bool {
        debug!(
            "downgrading BLOCK_ID {:?} to type : {:?}",
            self.id, block_type
        );

        if self.block_type == block_type {
            return true;
        }

        // if the block type needed is full and we are not,
        // load the block if it exists on disk.
        //
        if block_type == BlockType::Pruned {
            self.transactions = vec![];
            self.block_type = BlockType::Pruned;
            return true;
        }

        false
    }

    //
    // find winning router in block path
    //
    pub fn find_winning_router(&self, random_number: SaitoHash) -> SaitoPublicKey {
        let winner_pubkey: SaitoPublicKey;

        // find winning nolan
        let x = primitive_types::U256::from_big_endian(&random_number);
        // fee calculation should be the same used in block when
        // generating the fee transaction.
        let y = self.total_fees;

        // if there are no fees, payout to burn address
        if y == 0 {
            winner_pubkey = [0; 33];
            return winner_pubkey;
        }

        let z = primitive_types::U256::from_big_endian(&y.to_be_bytes());
        let zy = x.rem(z);
        let winning_nolan: Currency = std::cmp::max(zy.low_u64(), 1);

        // we may need function-timelock object if we need to recreate
        // an ATR transaction to pick the winning routing node.
        let winning_tx_placeholder: Transaction;

        //
        // winning TX contains the winning nolan
        //
        // either a fee-paying transaction or an ATR transaction
        let mut tx: Option<&Transaction> = None;
        for transaction in &self.transactions {
            if transaction.cumulative_fees >= winning_nolan {
                tx = Some(transaction);
                break;
            }
        }

        // If no valid transaction is found, payout to burn address and return early
        if tx.is_none() {
            winner_pubkey = [0; 33];
            return winner_pubkey;
        }

        // Safe to unwrap since we know it's `Some`
        let mut winning_tx = tx.unwrap();

        //
        // if winner is atr, we take inside TX
        //

        if winning_tx.transaction_type == TransactionType::ATR {
            let tmptx = winning_tx.data.to_vec();
            winning_tx_placeholder =
                Transaction::deserialize_from_net(&tmptx).expect("buffer to be valid");
            winning_tx = &winning_tx_placeholder;
        } else {
            assert_ne!(
                winning_tx.cumulative_fees,
                Currency::zero(),
                "winning tx doesn't have fees {}",
                winning_tx
            );
        }
        // hash random number to pick routing node
        winner_pubkey = winning_tx.get_winning_routing_node(hash(random_number.as_ref()));
        winner_pubkey
    }

    // generate
    //
    // this function generates all of the ancillary data needed to process or
    // validate blocks. this includes the various hashes and other dynamic
    // values that are not provided on the creation of the block object itself
    // but must be calculated from information such as the set of transactions
    // and the presence / absence of golden tickets, etc.
    //
    // - transaction_hashmap - used to identify which addresses have txs in block
    // - merkle_root - root of tx tree

    // we first calculate as much information as we can in parallel before
    // sweeping through the transactions to find out what percentage of the
    // cumulative block fees they contain.
    //
    pub fn generate(&mut self) -> Result<(), Error> {
        let creator_public_key = &self.creator;

        //self.total_rebroadcast_nolan = 0;
        self.total_rebroadcast_slips = 0;
        self.rebroadcast_hash = [0; 32];

        //
        // allow transactions to generate themselves
        //
        let mut tx_index: u64 = 0;
        for tx in self.transactions.iter_mut() {
            tx.generate(creator_public_key, tx_index, self.id);
            if let TransactionType::SPV = tx.transaction_type {
                tx_index += tx.txs_replacements as u64;
            } else {
                tx_index += 1;
            }
        }

        self.generate_transaction_hashmap();

        if self.merkle_root == [0; 32] {
            self.merkle_root = self.generate_merkle_root(false, false);
        }

        self.generate_pre_hash();
        self.generate_hash();

        // trace!(" ... block.prevalid - pst hash:  {:?}", create_timestamp());

        // we need to calculate the cumulative figures AFTER the
        // original figures.
        let mut cumulative_fees = 0;
        let mut total_work = 0;

        let mut has_golden_ticket = false;
        let mut has_fee_transaction = false;

        let mut has_issuance_transaction = false;
        let mut issuance_transaction_index = 0;
        let mut golden_ticket_index = 0;
        let mut fee_transaction_index = 0;

        // we have to do a single sweep through all of the transactions in
        // non-parallel to do things like generate the cumulative order of the
        // transactions in the block for things like work and fee calculations
        // for the lottery.
        //
        // we take advantage of the sweep to perform other pre-validation work
        // like counting up our ATR transactions and generating the hash
        // commitment for all of our rebroadcasts.
        for i in 0..self.transactions.len() {
            let transaction = &mut self.transactions[i];

            cumulative_fees = transaction.generate_cumulative_fees(cumulative_fees);

            total_work += transaction.total_work_for_me;

            // update slips_spent_this_block so that we have a record of
            // how many times input slips are spent in this block. we will
            // use this later to ensure there are no duplicates.
            //
            // we skip the fee transaction as otherwise we have trouble
            // validating the staker slips if we have received a block from
            // someone else -- i.e. we will think the slip is spent in the
            // block when generating the FEE TX to check against the in-block
            // fee tx.
            if !self.created_hashmap_of_slips_spent_this_block
                && transaction.transaction_type != TransactionType::Fee
            {
                for input in transaction.from.iter() {
                    if input.amount == 0 {
                        continue;
                    }

                    let value = self
                        .slips_spent_this_block
                        .entry(input.get_utxoset_key())
                        .and_modify(|e| *e += 1)
                        .or_insert(1);
                    if *value > 1 && input.amount > 0 {
                        warn!(
                            "double-spend detected in block {} : {} in block.generate()",
                            self.id, input
                        );
                        return Err(Error::new(ErrorKind::InvalidData, "double-spend detected"));
                    }
                }
                self.created_hashmap_of_slips_spent_this_block = true;
            }

            // also check the transactions for golden ticket and fees
            match transaction.transaction_type {
                TransactionType::Issuance => {
                    has_issuance_transaction = true;
                    issuance_transaction_index = i as u64;
                }
                TransactionType::Fee => {
                    has_fee_transaction = true;
                    fee_transaction_index = i as u64;
                }
                TransactionType::GoldenTicket => {
                    has_golden_ticket = true;
                    golden_ticket_index = i as u64;
                }
                TransactionType::ATR => {
                    let mut vbytes: Vec<u8> = vec![];
                    vbytes.extend(&self.rebroadcast_hash);
                    vbytes.extend(&transaction.serialize_for_signature());
                    self.rebroadcast_hash = hash(&vbytes);

                    for slip in transaction.to.iter() {
                        if matches!(slip.slip_type, SlipType::ATR) {
                            self.total_rebroadcast_slips += 1;
                            // deprecated
                            //self.total_rebroadcast_nolan += slip.amount;
                        }
                    }
                }
                TransactionType::BlockStake => {
                    self.has_staking_transaction = true;
                }
                _ => {}
            };
        }
        self.has_fee_transaction = has_fee_transaction;
        self.has_golden_ticket = has_golden_ticket;
        self.has_issuance_transaction = has_issuance_transaction;
        self.fee_transaction_index = fee_transaction_index;
        self.golden_ticket_index = golden_ticket_index;
        self.issuance_transaction_index = issuance_transaction_index;
        self.total_work = total_work;

        Ok(())
    }

    pub fn generate_hash(&mut self) -> SaitoHash {
        let hash_for_hash = hash(&self.serialize_for_hash());
        self.hash = hash_for_hash;
        hash_for_hash
    }

    pub fn generate_merkle_root(&self, is_browser: bool, is_spv: bool) -> SaitoHash {
        if self.transactions.is_empty() && (is_browser || is_spv) {
            return self.merkle_root;
        }

        let merkle_root_hash: SaitoHash;
        if let Some(tree) = MerkleTree::generate(&self.transactions) {
            merkle_root_hash = tree.get_root_hash();
        } else {
            merkle_root_hash = [0; 32];
        }

        debug!(
            "generated the merkle root, Tx Count: {:?}, root = {:?}",
            self.transactions.len(),
            merkle_root_hash.to_hex()
        );

        merkle_root_hash
    }

    //
    // generate_consensus_values examines a block in the context of the blockchain
    // in order to determine the dynamic values that need to be inserted into the
    // block or validated.
    //
    pub async fn generate_consensus_values(
        &self,
        blockchain: &Blockchain,
        storage: &Storage,
        configs: &(dyn Configuration + Send + Sync),
    ) -> ConsensusValues {
        //
        // we will reference these variables
        //
        let mut cv = ConsensusValues::new();
        let mut previous_block_treasury: Currency = 0;
        let mut previous_block_avg_nolan_rebroadcast_per_block: Currency = 0;
        let mut previous_block_avg_fee_per_byte: Currency = 0;
        let mut previous_block_avg_total_fees: Currency = 0;
        let mut previous_block_avg_total_fees_new: Currency = 0;
        let mut previous_block_avg_total_fees_atr: Currency = 0;
        let mut previous_block_avg_payout_routing: Currency = 0;
        let mut previous_block_avg_payout_mining: Currency = 0;
        let previous_block_avg_payout_treasury: Currency = 0;
        let previous_block_avg_payout_graveyard: Currency = 0;
        let previous_block_avg_payout_atr: Currency = 0;
        let mut total_number_of_non_fee_transactions = 0;

        //
        // tx fees and sizes and indices
        //
        for (index, transaction) in self.transactions.iter().enumerate() {
            //
            // Normal
            // Fee
            // GoldenTicket
            // ATR
            // SPV
            // Issuance
            // BlockStake
            //

            if transaction.is_fee_transaction() {
                cv.ft_num += 1;
                cv.ft_index = Some(index);
            } else {
                //
                // the fee transaction is the last transaction in the block, so we
                // count the number of non-fee transactions in order to know the
                // tx_ordinal of the fee transaction, which is needed in order to
                // make the slips in that transaction spendable when we insert them
                // into the hashmap.
                //
                total_number_of_non_fee_transactions += 1;
            }

            if (transaction.is_golden_ticket() || transaction.is_normal_transaction())
                && !transaction.is_atr_transaction()
            {
                cv.total_bytes_new += transaction.get_serialized_size() as u64;
                cv.total_fees_new += transaction.total_fees;
            }

            if transaction.is_golden_ticket() {
                cv.gt_num += 1;
                cv.gt_index = Some(index);
            }

            if transaction.is_staking_transaction() {
                cv.st_num += 1;
                cv.st_index = Some(index);
            }

            if transaction.is_issuance_transaction() {
                cv.it_num += 1;
                cv.it_index = Some(index);
            }
        }

        //
        // burn fee and difficulty
        //
        if let Some(previous_block) = blockchain.blocks.get(&self.previous_block_hash) {
            //
            // reference variables
            //
            previous_block_treasury = previous_block.treasury;
            previous_block_avg_nolan_rebroadcast_per_block =
                previous_block.avg_nolan_rebroadcast_per_block;
            previous_block_avg_fee_per_byte = previous_block.avg_fee_per_byte;
            previous_block_avg_total_fees = previous_block.avg_total_fees;
            previous_block_avg_total_fees_new = previous_block.avg_total_fees_new;
            previous_block_avg_total_fees_atr = previous_block.avg_total_fees_atr;
            previous_block_avg_payout_routing = previous_block.avg_payout_routing;
            previous_block_avg_payout_mining = previous_block.avg_payout_mining;

            //
            // burn fee
            //
            cv.burnfee = BurnFee::calculate_burnfee_for_block(
                previous_block.burnfee,
                self.timestamp,
                previous_block.timestamp,
                configs.get_consensus_config().unwrap().heartbeat_interval,
            );

            if cv.burnfee == 0 {
                cv.burnfee = 1;
            }

            //
            // difficulty
            //
            cv.difficulty = previous_block.difficulty;
            if previous_block.has_golden_ticket {
                if cv.gt_num > 0 {
                    cv.difficulty += 1;
                }
            } else if cv.gt_num == 0 && cv.difficulty > 0 {
                cv.difficulty -= 1;
            }
        } else {
            cv.burnfee = self.burnfee;
            cv.difficulty = self.difficulty;
        }

        //
        // total fees cumulative
        //
        // cumulative fees are set as the total number of new fees, unless atr transactions
        // exist in which case we will update this value to include the fees paid by the
        // subset of ATR transactions which rebroadcast, etc.
        cv.total_fees_cumulative = cv.total_fees_new;

        //
        // automatic transaction rebroadcasts / atr
        //
        // note that we do not rebroadcast the block that is "falling off" the genesis-loop
        // but the block that precedes this. we make this decision to avoid the need to
        // track whether the ATR transactions were included in this block, since anything
        // more than a genesis-period old is unspendable.
        //
        if self.id > (configs.get_consensus_config().unwrap().genesis_period + 1) {
            if let Some(pruned_block_hash) = blockchain
                .blockring
                .get_longest_chain_block_hash_at_block_id(
                    self.id - (configs.get_consensus_config().unwrap().genesis_period + 1),
                )
            {
                if let Some(pruned_block) = blockchain.blocks.get(&pruned_block_hash) {
                    if let Ok(mut atr_block) = storage
                        .load_block_from_disk(
                            storage.generate_block_filepath(pruned_block).as_str(),
                        )
                        .await
                    {
                        atr_block.generate().unwrap();
                        assert_ne!(
                            atr_block.block_type,
                            BlockType::Pruned,
                            "block should be fetched fully before this"
                        );

                        //
                        // estimate amount looping around chain
                        //
                        let total_utxo_staked =
                            configs.get_consensus_config().unwrap().genesis_period
                                * previous_block_avg_nolan_rebroadcast_per_block;

                        //
                        // divide the treasury
                        //
                        let expected_atr_payout = if total_utxo_staked > 0 {
                            previous_block_treasury / total_utxo_staked
                        } else {
                            0
                        };

                        //
                        // +1 gives us payout multiplier
                        //
                        let expected_atr_multiplier = 1 + expected_atr_payout;

                        //
                        // loop through block to find eligible transactions
                        //
                        for transaction in &atr_block.transactions {
                            let mut outputs = vec![];
                            let mut total_nolan_eligible_for_atr_payout: Currency = 0;

                            //
                            // Collect eligible slips from transaction outputs
                            //
                            // Scan through each slip in transaction.to[], looking for either:
                            // 1) An NFT-bound triple: [Bound, Normal, Bound], which we validate and
                            //    collect as a group (only the middle "payload" slip counts toward payout).
                            //
                            // 2) A regular slip, which we validate and collect individually.
                            // We accumulate total_nolan_eligible_for_atr_payout as we go.
                            //
                            let mut i = 0;

                            while i < transaction.to.len() {
                                let slip = &transaction.to[i];

                                //
                                // Check for an NFT-bound group: [Bound, Normal, Bound]
                                //
                                if slip.slip_type == SlipType::Bound && i + 2 < transaction.to.len()
                                {
                                    let slip1 = &transaction.to[i];
                                    let slip2 = &transaction.to[i + 1];
                                    let slip3 = &transaction.to[i + 2];

                                    if slip2.slip_type != SlipType::Bound
                                        && slip3.slip_type == SlipType::Bound
                                    {
                                        //
                                        // Validate each slip in the group
                                        //
                                        if slip1.validate(&blockchain.utxoset)
                                            && slip2.validate(&blockchain.utxoset)
                                            && slip3.validate(&blockchain.utxoset)
                                        {
                                            trace!(
                                                "NFT group eligible: {}, {}, {}",
                                                slip1,
                                                slip2,
                                                slip3
                                            );
                                            outputs.push(slip1);
                                            outputs.push(slip2);
                                            outputs.push(slip3);

                                            //
                                            // Only the middle "payload" slip counts toward payout
                                            //
                                            total_nolan_eligible_for_atr_payout += slip2.amount;
                                        }

                                        //
                                        // Skip past the triple nft group
                                        //
                                        i += 3;
                                        continue;
                                    }
                                }

                                //
                                // Fallback to single-slip case
                                //
                                if slip.validate(&blockchain.utxoset) {
                                    trace!("Regular slip eligible: {}", slip);
                                    outputs.push(slip);
                                    total_nolan_eligible_for_atr_payout += slip.amount;
                                }

                                //
                                // skip single slip
                                //
                                i += 1;
                            }

                            //
                            //  Process collected slips for ATR rebroadcast
                            //
                            // Iterate through the 'outputs', handling each item as either:
                            //
                            // - An NFT-bound triple (three slips): we unpack them, compute payout on the
                            //   middle slip, and create a special rebroadcast transaction.
                            //
                            // - A single slip: we compute payout and call create_rebroadcast_transaction.
                            //
                            if !outputs.is_empty() {
                                let tx_size = transaction.get_serialized_size() as u64;
                                let atr_fee = tx_size * previous_block_avg_fee_per_byte;

                                let mut j = 0;
                                while j < outputs.len() {
                                    let output = outputs[j];

                                    //
                                    // NFT-bound triple detection
                                    // Check if this and the next two slips form [Bound, Normal, Bound]
                                    //
                                    let is_nft_triple = output.slip_type == SlipType::Bound
                                        && j + 2 < outputs.len()
                                        && outputs[j + 1].slip_type != SlipType::Bound
                                        && outputs[j + 2].slip_type == SlipType::Bound;

                                    if is_nft_triple {
                                        //
                                        // Unpack the three slips
                                        //
                                        let slip1 = outputs[j];
                                        let slip2 = outputs[j + 1];
                                        let slip3 = outputs[j + 2];

                                        //
                                        // Compute payout based on the payload slip2
                                        //
                                        let atr_payout_for_slip =
                                            slip2.amount * expected_atr_multiplier;
                                        let surplus_payout_to_subtract_from_treasury =
                                            atr_payout_for_slip - slip2.amount;
                                        let atr_fee_for_slip = atr_fee;

                                        if atr_payout_for_slip > atr_fee {
                                            cv.total_rebroadcast_nolan += slip2.amount;
                                            cv.total_rebroadcast_slips += 1;

                                            //
                                            // Prepare input slips
                                            //
                                            let mut input1 = slip1.clone();
                                            let mut input2 = slip2.clone();
                                            let mut input3 = slip3.clone();

                                            //
                                            // for fee accounting of payload
                                            //
                                            input2.amount = atr_payout_for_slip;

                                            //
                                            // Prepare output slips, only payload slip carries ATR amount
                                            //
                                            let mut output1 = slip1.clone();
                                            let mut output2 = slip2.clone();
                                            let mut output3 = slip3.clone();

                                            output2.slip_type = SlipType::ATR;
                                            output2.amount = atr_payout_for_slip - atr_fee;

                                            //
                                            // Create a special rebroadcast for triple NFT group
                                            //
                                            let rebroadcast_tx =
                                                Transaction::create_rebroadcast_bound_transaction(
                                                    transaction,
                                                    output1,
                                                    input2.clone(),
                                                    output3,
                                                );

                                            cv.total_payout_atr +=
                                                surplus_payout_to_subtract_from_treasury;
                                            cv.total_fees_atr += atr_fee;

                                            //
                                            // Update cumulative ATR hash
                                            //
                                            let mut vbytes = Vec::new();
                                            vbytes.extend(&cv.rebroadcast_hash);
                                            vbytes
                                                .extend(&rebroadcast_tx.serialize_for_signature());
                                            cv.rebroadcast_hash = hash(&vbytes);

                                            cv.rebroadcasts.push(rebroadcast_tx);
                                        } else {
                                            //
                                            // Payload slip didn't cover fee
                                            //
                                            cv.total_rebroadcast_nolan += slip2.amount;
                                            cv.total_fees_atr += slip2.amount;
                                            cv.total_fees_paid_by_nonrebroadcast_atr_transactions +=
                                                slip2.amount;
                                            trace!("we don't rebroadcast slip in tx - {:?} since atr_payout_for_slip = {:?} atr_fee = {:?} \n{}",transaction.hash_for_signature.unwrap().to_hex(),atr_payout_for_slip,atr_fee,output);
                                        }

                                        //
                                        // Skip past the entire NFT group
                                        //
                                        j += 3;
                                    } else {
                                        //
                                        //  Single-slip case
                                        //
                                        let atr_payout_for_slip =
                                            output.amount * expected_atr_multiplier;
                                        let surplus_payout_to_subtract_from_treasury =
                                            atr_payout_for_slip - output.amount;
                                        let atr_fee_for_slip = atr_fee;

                                        if atr_payout_for_slip > atr_fee {
                                            cv.total_rebroadcast_nolan += output.amount;
                                            cv.total_rebroadcast_slips += 1;

                                            //
                                            // clone the slip, update the amount
                                            //
                                            let mut slip = output.clone();
                                            slip.slip_type = SlipType::ATR;
                                            slip.amount = atr_payout_for_slip - atr_fee_for_slip;

                                            //
                                            // we update the "input" slip so that it
                                            // will result in cumulative fees being
                                            // calculated correctly when the TX is
                                            // examined....
                                            //
                                            let mut from_slip = output.clone();
                                            from_slip.amount = atr_payout_for_slip;

                                            //
                                            // track payouts and fees
                                            //
                                            cv.total_payout_atr +=
                                                surplus_payout_to_subtract_from_treasury;
                                            cv.total_fees_atr += atr_fee_for_slip;

                                            //
                                            // create our ATR rebroadcast transaction
                                            //
                                            let rebroadcast_tx =
                                                Transaction::create_rebroadcast_transaction(
                                                    transaction,
                                                    slip,
                                                    from_slip,
                                                );

                                            //
                                            // update rebroadcast_hash (all ATRs)
                                            //
                                            let mut vbytes: Vec<u8> = vec![];
                                            vbytes.extend(&cv.rebroadcast_hash);
                                            vbytes
                                                .extend(&rebroadcast_tx.serialize_for_signature());
                                            cv.rebroadcast_hash = hash(&vbytes);
                                            cv.rebroadcasts.push(rebroadcast_tx);
                                        } else {
                                            //
                                            // Slip didn't cover fee
                                            //

                                            //
                                            // this UTXO will be worth less than zero if the atr_payout is
                                            // added and then the atr_fee is deducted. so we do not rebroadcast
                                            // it but collect the dust as a fee paid to the blockchain by the
                                            // utxo with gratitude for its release.
                                            //
                                            cv.total_rebroadcast_nolan += output.amount;
                                            cv.total_fees_atr += output.amount;
                                            cv.total_fees_paid_by_nonrebroadcast_atr_transactions +=
                                                output.amount;
                                            trace!("we don't rebroadcast slip in tx - {:?} since atr_payout_for_slip = {:?} atr_fee = {:?} \n{}",transaction.hash_for_signature.unwrap().to_hex(),atr_payout_for_slip,atr_fee,output);
                                        }

                                        //
                                        // skip one slip
                                        //
                                        j += 1;
                                    }
                                }
                            }
                        }

                        //
                        // total fees cumulative
                        //
                        // cumulative fees are set as the total number of new fees, unless atr transactions
                        // exist in which case we will update this value to include the fees paid by the
                        // subset of ATR transactions which rebroadcast, etc.
                        cv.total_fees_cumulative = cv.total_fees_new + cv.total_fees_atr
                            - cv.total_fees_paid_by_nonrebroadcast_atr_transactions;

                        //
                        // if ATR payouts are too large, adjust payout downwards
                        //
                        // because we are approximating the amount of the treasury to pay based on our
                        // expectation of how many UTXO are looping through the chain, we can hit a problem
                        // if this block has a very large amount of SAITO -- enough to blow out the payout
                        // to a much larger portion of the treasury than desireable.
                        //
                        // we handle this by limiting the amount of the treasury that we will issue each
                        // block to no more than 5% of the amount in the treasury. this prevents attackers
                        // from flushing the treasury out to their own wallet by massively increasing the
                        // amount of SAITO being rebroadcast in a single block.
                        //
                        if cv.total_payout_atr > (self.treasury as f64 * 0.05) as u64 {
                            let max_total_payout = (self.treasury as f64 * 0.05) as u64;
                            let unadjusted_total_nolan = cv.total_rebroadcast_nolan;
                            let adjusted_atr_payout_multiplier =
                                max_total_payout / unadjusted_total_nolan;
                            let adjusted_output_multiplier = 1 + adjusted_atr_payout_multiplier;
                            let _adjusted_total_rebroadcast_staking_payouts_nolan: Currency = 0;
                            let _adjusted_total_rebroadcast_fees_nolan: Currency = 0;

                            //
                            // we re-determine our multiplier for the ATR payout based on our
                            // max_total_payout divided by the unadjusted_total_nolan that we
                            // are rebroadcasting.
                            //
                            // TODO - fee handling is complicated with _atr and _cumulative
                            //
                            cv.total_payout_atr = 0;

                            for rebroadcast_tx in &mut cv.rebroadcasts {
                                //
                                // update the amount that is in the output transaction according
                                // to the amount in the input transaction. since this isn't a common
                                // edge-case and cannot be systematically abused we're going to forgo
                                // the rebroadcast fee in this case, and assume it is covered by the
                                // reduced payout.
                                //

                                //
                                // Determine whether this is an NFT‐group ATR (3 slips) or a single‐slip ATR.
                                // [Bound, Normal, Bound]
                                //
                                if rebroadcast_tx.to.len() == 3
                                    && rebroadcast_tx.from.len() == 3
                                    && rebroadcast_tx.from[0].slip_type == SlipType::Bound
                                    && rebroadcast_tx.from[1].slip_type != SlipType::Bound
                                    && rebroadcast_tx.from[2].slip_type == SlipType::Bound
                                {
                                    let input_amount = rebroadcast_tx.from[1].amount;

                                    //
                                    // Calculate the new output amount
                                    //
                                    let new_output_amount =
                                        input_amount * adjusted_output_multiplier;

                                    //
                                    // Update the ATR output slip
                                    //
                                    rebroadcast_tx.to[1].amount = new_output_amount;

                                    cv.total_payout_atr += rebroadcast_tx.to[1].amount;
                                    cv.total_payout_atr -= input_amount;
                                } else {
                                    //
                                    // Single‐slip ATR: payload is the only slip at index 0
                                    //
                                    let input_amount = rebroadcast_tx.from[0].amount;
                                    let new_output_amount =
                                        input_amount * adjusted_output_multiplier;
                                    rebroadcast_tx.to[0].amount = new_output_amount;

                                    cv.total_payout_atr += rebroadcast_tx.to[0].amount;
                                    cv.total_payout_atr -= input_amount;
                                }
                            }

                            cv.total_fees_atr = 0;
                        }
                    } else {
                        error!(
                            "couldn't load block for ATR from disk. block hash : {:?}",
                            pruned_block.hash.to_hex()
                        );
                    }
                } // block
            }
        } // if at least 1 genesis period deep

        //
        // total fees
        //
        cv.total_fees = cv.total_fees_new + cv.total_fees_atr;

        //
        // fee_per_byte
        //
        if cv.total_bytes_new > 0 {
            cv.fee_per_byte = cv.total_fees_new / cv.total_bytes_new as Currency;
        }

        //
        // avg_fee_per_byte
        //
        let adjustment = (previous_block_avg_fee_per_byte as i128 - cv.fee_per_byte as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_fee_per_byte = (previous_block_avg_fee_per_byte as i128 - adjustment) as Currency;

        //
        // avg_total_fees
        //
        let adjustment = (previous_block_avg_total_fees as i128 - cv.total_fees as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_total_fees = (previous_block_avg_total_fees as i128 - adjustment) as Currency;

        //
        // avg_total_fees_new
        //
        let adjustment = (previous_block_avg_total_fees_new as i128 - cv.total_fees_new as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_total_fees_new =
            (previous_block_avg_total_fees_new as i128 - adjustment) as Currency;

        //
        // avg_total_fees_atr
        //
        let adjustment = (previous_block_avg_total_fees_atr as i128 - cv.total_fees_atr as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_total_fees_atr =
            (previous_block_avg_total_fees_atr as i128 - adjustment) as Currency;

        //
        // average nolan rebroadcast per block
        //
        // note that we cannot move this above the ATR section as we use the
        // value of this variable (from the last block) to figure out what the
        // ATR payout should be in this block.
        //
        let adjustment = (previous_block_avg_nolan_rebroadcast_per_block as i128
            - cv.total_rebroadcast_nolan as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_nolan_rebroadcast_per_block =
            (previous_block_avg_nolan_rebroadcast_per_block as i128 - adjustment) as Currency;

        //
        // calculate payouts
        //
        let mut miner_publickey: SaitoPublicKey = [0; 33];
        let mut miner_payout: Currency = 0;
        let mut router1_payout: Currency = 0;
        let mut router1_publickey: SaitoPublicKey = [0; 33];
        let mut router2_payout: Currency = 0;
        let mut router2_publickey: SaitoPublicKey = [0; 33];
        let mut treasury_contribution: Currency = 0;
        let mut graveyard_contribution: Currency = 0;

        //
        // if this block contains a golden ticket
        //
        if let Some(gt_index) = cv.gt_index {
            //
            // golden ticket needed to process payout
            //
            let golden_ticket: GoldenTicket =
                GoldenTicket::deserialize_from_net(&self.transactions[gt_index].data);
            let mut next_random_number = hash(golden_ticket.random.as_ref());

            //
            // load the previous block
            //
            if let Some(previous_block) = blockchain.blocks.get(&self.previous_block_hash) {
                debug!(
                    "previous block : {:?}-{:?} exists!",
                    previous_block.id,
                    previous_block.hash.to_hex()
                );

                //
                // half to miner (capped @ 1.5x)
                //
                let expected_miner_payout = previous_block.total_fees / 2;
                let maximum_miner_payout = (previous_block.avg_total_fees as f64 * 1.5) as u64;
                if expected_miner_payout > maximum_miner_payout {
                    graveyard_contribution += expected_miner_payout - maximum_miner_payout;
                    miner_payout = maximum_miner_payout;
                    debug!(
                        "block : {} miner payout set as maximum payout : {}. expected payout : {}",
                        self.id, miner_payout, expected_miner_payout
                    );
                } else {
                    miner_payout = expected_miner_payout;
                    debug!(
                        "block : {} miner payout set as expected payout : {}. maximum payout : {}",
                        self.id, miner_payout, maximum_miner_payout
                    );
                }
                miner_publickey = golden_ticket.public_key;

                //
                // half to router (capped @ 1.5x)
                //
                let expected_router_payout = previous_block.total_fees - expected_miner_payout;
                let maximum_router_payout = (previous_block.avg_total_fees as f64 * 1.5) as u64;
                if expected_router_payout > maximum_router_payout {
                    graveyard_contribution += expected_router_payout - maximum_router_payout;
                    router1_payout = maximum_router_payout;
                    debug!(
                        "block : {} router1 payout set as maximum payout : {}. expected payout : {}",
                        self.id, router1_payout, expected_router_payout
                    );
                } else {
                    router1_payout = expected_router_payout;
                    debug!(
                        "block : {} router1 payout set as expected payout : {}. maximum payout : {}",
                        self.id, router1_payout, maximum_router_payout
                    );
                }
                router1_publickey = previous_block.find_winning_router(next_random_number);

                //
                // finding a router consumes 2 hashes
                //
                next_random_number = hash(next_random_number.as_ref());
                next_random_number = hash(next_random_number.as_ref());

                //
                // if the previous block ALSO HAD a golden ticket there is no need for further
                // action as that previous block has already contributed its tokens to the
                // treasury and routing node.
                //
                if previous_block.has_golden_ticket {
                    //
                    // do nothing
                    //
                } else {
                    //
                    // recurse and payout previous block
                    //
                    if let Some(previous_previous_block) =
                        blockchain.blocks.get(&previous_block.previous_block_hash)
                    {
                        //
                        // half to treasury (capped)
                        //
                        // we sanity check that the fees in the block are not greater than 1.5x the total
                        // average fees processed by the blockchain. this is a sanity-check against
                        // attackers who might try to create extremely deep-hop routing chains in order
                        // to increase their chance of payout.
                        //
                        let expected_treasury_contribution2 =
                            previous_previous_block.total_fees / 2;
                        let maximum_treasury_contribution2 =
                            (previous_block.avg_total_fees as f64 * 1.5) as u64;
                        if expected_treasury_contribution2 > maximum_treasury_contribution2 {
                            treasury_contribution += maximum_treasury_contribution2;
                            graveyard_contribution +=
                                expected_treasury_contribution2 - maximum_treasury_contribution2;
                        } else {
                            treasury_contribution += expected_treasury_contribution2;
                        }

                        //
                        // half to router (capped @ 1.5)
                        //
                        let expected_router2_payout =
                            previous_previous_block.total_fees - expected_treasury_contribution2;
                        // note avg used is previous block for consistency with state
                        let maximum_router2_payout =
                            (previous_block.avg_total_fees as f64 * 1.5) as u64;
                        if expected_router2_payout > maximum_router2_payout {
                            graveyard_contribution +=
                                expected_router2_payout - maximum_router2_payout;
                            router2_payout = maximum_router2_payout;
                        } else {
                            router2_payout = expected_router2_payout;
                        }
                        router2_publickey =
                            previous_previous_block.find_winning_router(next_random_number);

                        //
                        // finding a router consumes 2 hashes
                        //
                        next_random_number = hash(next_random_number.as_slice());
                        next_random_number = hash(next_random_number.as_slice());
                    }
                }
            } else {
                info!(
                    "previous block : {:?} not found for block : {:?} at index : {:?}",
                    self.previous_block_hash.to_hex(),
                    self.hash.to_hex(),
                    self.id
                );
            }

            //
            // now create fee transactions
            //
            let mut slip_index = 0;
            let mut transaction = Transaction::default();
            transaction.transaction_type = TransactionType::Fee;
            transaction.timestamp = self.timestamp;

            if miner_publickey != [0; 33] && miner_payout > 0 {
                let mut output = Slip::default();
                output.public_key = miner_publickey;
                output.amount = miner_payout;
                output.slip_type = SlipType::MinerOutput;
                output.slip_index = slip_index;
                output.tx_ordinal = total_number_of_non_fee_transactions + 1;
                output.block_id = self.id;
                transaction.add_to_slip(output.clone());
                slip_index += 1;
            } else {
                debug!(
                    "miner_publickey is not set or payout is zero. Not adding to fee transaction"
                );
            }

            if router1_payout > 0 {
                if router1_publickey != [0; 33] {
                    let mut output = Slip::default();
                    output.public_key = router1_publickey;
                    output.amount = router1_payout;
                    output.slip_type = SlipType::RouterOutput;
                    output.slip_index = slip_index;
                    output.tx_ordinal = total_number_of_non_fee_transactions + 1;
                    output.block_id = self.id;
                    transaction.add_to_slip(output.clone());
                    slip_index += 1;
                } else {
                    graveyard_contribution += router1_payout;
                }
            } else {
                debug!(
                    "router1_publickey is not set or payout is zero. Not adding to fee transaction"
                );
            }

            if router2_payout > 0 {
                if router2_publickey != [0; 33] {
                    let mut output = Slip::default();
                    output.public_key = router2_publickey;
                    output.amount = router2_payout;
                    output.slip_type = SlipType::RouterOutput;
                    output.slip_index = slip_index;
                    output.tx_ordinal = total_number_of_non_fee_transactions + 1;
                    output.block_id = self.id;
                    transaction.add_to_slip(output.clone());
                    slip_index += 1;
                } else {
                    graveyard_contribution += router2_payout;
                }
            } else {
                debug!(
                    "router2_publickey is not set or payout is zero. Not adding to fee transaction"
                );
            }

            cv.total_payout_mining = miner_payout;
            cv.total_payout_routing = router1_payout + router2_payout;
            cv.fee_transaction = Some(transaction);
        } else {
            //
            // if there is no golden ticket AND the previous block was not paid out then
            // we should collect the funds that are lost and add them to our graveyard.
            //
            if let Some(previous_block) = blockchain.blocks.get(&self.previous_block_hash) {
                if previous_block.has_golden_ticket {
                    // do nothing, already paid out
                } else {
                    // our previous_previous_block is about to disappear, which means
                    // we should make note that these funds are slipping into our graveyard
                    if let Some(previous_previous_block) =
                        blockchain.blocks.get(&previous_block.previous_block_hash)
                    {
                        graveyard_contribution += previous_block.previous_block_unpaid;
                    }
                }
            }
        }

        //
        // treasury and graveyard
        //
        cv.total_payout_treasury = treasury_contribution;
        cv.total_payout_graveyard = graveyard_contribution;

        //
        // average routing payout
        //
        let adjustment = (previous_block_avg_payout_routing as i128
            - cv.total_payout_routing as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_payout_routing =
            (previous_block_avg_payout_routing as i128 - adjustment) as Currency;

        //
        // average mining payout
        //
        let adjustment = (previous_block_avg_payout_mining as i128
            - cv.total_payout_mining as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_payout_mining = (previous_block_avg_payout_mining as i128 - adjustment) as Currency;

        //
        // average treasury payout
        //
        let adjustment = (previous_block_avg_payout_treasury as i128
            - cv.total_payout_treasury as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_payout_treasury =
            (previous_block_avg_payout_treasury as i128 - adjustment) as Currency;

        //
        // average graveyard payout
        //
        let adjustment = (previous_block_avg_payout_graveyard as i128
            - cv.total_payout_graveyard as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_payout_graveyard =
            (previous_block_avg_payout_graveyard as i128 - adjustment) as Currency;

        //
        // average atr payout
        //
        let adjustment = (previous_block_avg_payout_atr as i128 - cv.total_payout_atr as i128)
            / configs.get_consensus_config().unwrap().genesis_period as i128;
        cv.avg_payout_atr = (previous_block_avg_payout_atr as i128 - adjustment) as Currency;

        cv
    }

    pub fn generate_pre_hash(&mut self) {
        self.pre_hash = hash(&self.serialize_for_signature());
    }

    pub fn on_chain_reorganization(&mut self, utxoset: &mut UtxoSet, longest_chain: bool) -> bool {
        debug!(
            "block : on chain reorg : {:?} - {:?}",
            self.id,
            self.hash.to_hex()
        );
        for tx in &self.transactions {
            tx.on_chain_reorganization(utxoset, longest_chain);
        }
        self.in_longest_chain = longest_chain;
        true
    }

    // we may want to separate the signing of the block from the setting of the necessary hash
    // we do this together out of convenience only

    pub fn sign(&mut self, private_key: &SaitoPrivateKey) {
        // we set final data
        self.signature = sign(&self.serialize_for_signature(), private_key);
    }

    // serialize the pre_hash and the signature_for_source into a
    // bytes array that can be hashed and then have the hash set.
    pub fn serialize_for_hash(&self) -> Vec<u8> {
        [
            self.previous_block_hash.as_slice(),
            self.pre_hash.as_slice(),
        ]
        .concat()
    }

    // serialize major block components for block signature
    // this will manually calculate the merkle_root if necessary
    // but it is advised that the merkle_root be already calculated
    // to avoid speed issues.
    pub fn serialize_for_signature(&self) -> Vec<u8> {
        [
            self.id.to_be_bytes().as_slice(),
            self.timestamp.to_be_bytes().as_slice(),
            self.previous_block_hash.as_slice(),
            self.creator.as_slice(),
            self.merkle_root.as_slice(),
            self.graveyard.to_be_bytes().as_slice(),
            self.treasury.to_be_bytes().as_slice(),
            self.burnfee.to_be_bytes().as_slice(),
            self.difficulty.to_be_bytes().as_slice(),
            self.avg_fee_per_byte.to_be_bytes().as_slice(),
            self.avg_nolan_rebroadcast_per_block
                .to_be_bytes()
                .as_slice(),
            self.previous_block_unpaid.to_be_bytes().as_slice(),
            self.avg_total_fees.to_be_bytes().as_slice(),
            self.avg_total_fees_new.to_be_bytes().as_slice(),
            self.avg_total_fees_atr.to_be_bytes().as_slice(),
            self.avg_payout_routing.to_be_bytes().as_slice(),
            self.avg_payout_mining.to_be_bytes().as_slice(),
        ]
        .concat()
    }

    /// Serialize a Block for transport or disk.
    /// [len of transactions - 4 bytes - u32]
    /// [id - 8 bytes - u64]
    /// [timestamp - 8 bytes - u64]
    /// [previous_block_hash - 32 bytes - SHA 256 hash]
    /// [creator - 33 bytes - Secp25k1 pubkey compact format]
    /// [merkle_root - 32 bytes - SHA 256 hash
    /// [signature - 64 bytes - Secp25k1 sig]
    /// [graveyard - 8 bytes - u64]
    /// [treasury - 8 bytes - u64]
    /// [burnfee - 8 bytes - u64]
    /// [difficulty - 8 bytes - u64]
    /// [avg_total_fees - 8 bytes - u64]
    /// [avg_fee_per_byte - 8 bytes - u64]
    /// [avg_nolan_rebroadcast_per_block - 8 bytes - u64]
    /// [previous_block_unpaid - 8 bytes - u64]
    /// [avg_total_fees - 8 bytes - u64]		// note the duplicate here, is because added in group
    /// [avg_total_fees_new - 8 bytes - u64]
    /// [avg_total_fees_atr - 8 bytes - u64]
    /// [avg_payout_routing - 8 bytes - u64]
    /// [avg_payout_mining - 8 bytes - u64]
    /// [avg_payout_treasury - 8 bytes - u64]
    /// [avg_payout_graveyard - 8 bytes - u64]
    /// [avg_payout_atr - 8 bytes - u64]
    /// [total_fees - 8 bytes - u64]
    /// [total_fees_new - 8 bytes - u64]
    /// [total_fees_atr - 8 bytes - u64]
    /// [fee_per_byte - 8 bytes - u64]
    /// [total_fees_cumulative - 8 bytes - u64]

    /// [transaction][transaction][transaction]...
    pub fn serialize_for_net(&self, block_type: BlockType) -> Vec<u8> {
        let mut tx_len_buffer: Vec<u8> = vec![];

        // block headers do not get tx data
        if block_type == BlockType::Header {
            tx_len_buffer.extend(&0_u32.to_be_bytes());
        } else {
            tx_len_buffer.extend(&(self.transactions.iter().len() as u32).to_be_bytes());
        }
        let mut tx_buf = vec![];
        if block_type != BlockType::Header {
            // block headers do not get tx data
            tx_buf = iterate!(self.transactions, 10)
                .map(|transaction| transaction.serialize_for_net())
                .collect::<Vec<_>>()
                .concat();
        }

        let buffer = [
            tx_len_buffer.as_slice(),
            self.id.to_be_bytes().as_slice(),
            self.timestamp.to_be_bytes().as_slice(),
            self.previous_block_hash.as_slice(),
            self.creator.as_slice(),
            self.merkle_root.as_slice(),
            self.signature.as_slice(),
            self.graveyard.to_be_bytes().as_slice(),
            self.treasury.to_be_bytes().as_slice(),
            self.burnfee.to_be_bytes().as_slice(),
            self.difficulty.to_be_bytes().as_slice(),
            self.avg_total_fees.to_be_bytes().as_slice(),
            self.avg_fee_per_byte.to_be_bytes().as_slice(),
            self.avg_nolan_rebroadcast_per_block
                .to_be_bytes()
                .as_slice(),
            self.previous_block_unpaid.to_be_bytes().as_slice(),
            self.avg_total_fees.to_be_bytes().as_slice(),
            self.avg_total_fees_new.to_be_bytes().as_slice(),
            self.avg_total_fees_atr.to_be_bytes().as_slice(),
            self.avg_payout_routing.to_be_bytes().as_slice(),
            self.avg_payout_mining.to_be_bytes().as_slice(),
            self.avg_payout_treasury.to_be_bytes().as_slice(),
            self.avg_payout_graveyard.to_be_bytes().as_slice(),
            self.avg_payout_atr.to_be_bytes().as_slice(),
            self.total_payout_routing.to_be_bytes().as_slice(),
            self.total_payout_mining.to_be_bytes().as_slice(),
            self.total_payout_treasury.to_be_bytes().as_slice(),
            self.total_payout_graveyard.to_be_bytes().as_slice(),
            self.total_payout_atr.to_be_bytes().as_slice(),
            self.total_fees.to_be_bytes().as_slice(),
            self.total_fees_new.to_be_bytes().as_slice(),
            self.total_fees_atr.to_be_bytes().as_slice(),
            self.fee_per_byte.to_be_bytes().as_slice(),
            self.total_fees_cumulative.to_be_bytes().as_slice(),
            tx_buf.as_slice(),
        ]
        .concat();

        buffer
    }

    pub async fn update_block_to_block_type(
        &mut self,
        block_type: BlockType,
        storage: &Storage,
        is_browser: bool,
    ) -> bool {
        if self.block_type == block_type {
            return true;
        }

        if block_type == BlockType::Full {
            return self
                .upgrade_block_to_block_type(block_type, storage, is_browser)
                .await;
        }

        if block_type == BlockType::Pruned {
            return self
                .downgrade_block_to_block_type(block_type, is_browser)
                .await;
        }

        false
    }

    // if the block is not at the proper type, try to upgrade it to have the
    // data that is necessary for blocks of that type if possible. if this is
    // not possible, return false. if it is possible, return true once upgraded.
    pub async fn upgrade_block_to_block_type(
        &mut self,
        block_type: BlockType,
        storage: &Storage,
        is_spv: bool,
    ) -> bool {
        debug!(
            "upgrading block : {:?}-{:?} of type : {:?} to type : {:?}",
            self.id,
            self.hash.to_hex(),
            self.block_type,
            block_type
        );
        if self.block_type == block_type {
            trace!("block type is already {:?}", self.block_type);
            return true;
        }

        //
        // TODO - if the block does not exist on disk, we have to
        //  attempt a remote fetch.
        //

        //
        // if the block type needed is full and we are not,
        // load the block if it exists on disk.
        //
        if block_type == BlockType::Full {
            if is_spv {
                debug!("cannot upgrade block to full in spv mode");
                return false;
            }
            let new_block = storage
                .load_block_from_disk(storage.generate_block_filepath(self).as_str())
                .await;
            if new_block.is_err() {
                error!(
                    "block not found in disk to upgrade : {:?}",
                    self.hash.to_hex()
                );
                return false;
            }
            let mut new_block = new_block.unwrap();

            debug!(
                "upgraded tx counts : {:?} vs {:?}",
                self.transactions.len(),
                new_block.transactions.len()
            );
            // in-memory swap copying txs in block from mempool
            mem::swap(&mut new_block.transactions, &mut self.transactions);

            // transactions need hashes
            if self.generate().is_err() {
                error!("failed to generate block after upgrade");
                return false;
            }
            self.block_type = BlockType::Full;

            return true;
        }

        false
    }

    pub fn generate_lite_block(&self, keylist: Vec<SaitoPublicKey>) -> Block {
        debug!(
            "generating lite block for keys : {:?} for block : {:?}-{:?}",
            keylist.iter().map(hex::encode).collect::<Vec<String>>(),
            self.id,
            self.hash.to_hex()
        );

        let mut pruned_txs: Vec<Transaction> = iterate!(&self.transactions, 10)
            .map(|tx| {
                if tx
                    .from
                    .iter()
                    .any(|slip| keylist.contains(&slip.public_key))
                    || tx.to.iter().any(|slip| keylist.contains(&slip.public_key))
                    || tx.is_golden_ticket()
                {
                    tx.clone()
                } else {
                    Transaction {
                        timestamp: tx.timestamp,
                        from: vec![],
                        to: vec![],
                        data: vec![],
                        transaction_type: TransactionType::SPV,
                        txs_replacements: 1,
                        signature: tx.signature,
                        path: vec![],
                        hash_for_signature: tx.hash_for_signature,
                        total_in: 0,
                        total_out: 0,
                        total_fees: 0,
                        total_work_for_me: 0,
                        cumulative_fees: 0,
                    }
                }
            })
            .collect();

        let mut i = 0;
        while i + 1 < pruned_txs.len() {
            if pruned_txs[i].transaction_type == TransactionType::SPV
                && pruned_txs[i + 1].transaction_type == TransactionType::SPV
                && pruned_txs[i].txs_replacements == pruned_txs[i + 1].txs_replacements
            {
                pruned_txs[i].txs_replacements *= 2;
                let combined_hash = hash(
                    &[
                        pruned_txs[i].hash_for_signature.unwrap(),
                        pruned_txs[i + 1].hash_for_signature.unwrap(),
                    ]
                    .concat(),
                );
                pruned_txs[i].hash_for_signature = Some(combined_hash);
                pruned_txs.remove(i + 1);
            } else {
                i += 2;
            }
        }

        // Create the block with pruned transactions
        let mut block = Block::new();

        block.transactions = pruned_txs;
        block.id = self.id;
        block.timestamp = self.timestamp;
        block.previous_block_hash = self.previous_block_hash;
        block.creator = self.creator;
        block.burnfee = self.burnfee;
        block.difficulty = self.difficulty;
        block.graveyard = self.graveyard;
        block.treasury = self.treasury;
        block.signature = self.signature;
        block.avg_fee_per_byte = self.avg_fee_per_byte;
        block.avg_nolan_rebroadcast_per_block = self.avg_nolan_rebroadcast_per_block;
        block.previous_block_unpaid = self.previous_block_unpaid;
        block.avg_total_fees = self.avg_total_fees;
        block.avg_total_fees_new = self.avg_total_fees_new;
        block.avg_total_fees_atr = self.avg_total_fees_atr;
        block.avg_payout_routing = self.avg_payout_routing;
        block.avg_payout_mining = self.avg_payout_mining;
        block.avg_payout_treasury = self.avg_payout_treasury;
        block.avg_payout_graveyard = self.avg_payout_graveyard;
        block.avg_payout_atr = self.avg_payout_atr;
        block.total_payout_routing = self.total_payout_routing;
        block.total_payout_mining = self.total_payout_mining;
        block.total_payout_treasury = self.total_payout_treasury;
        block.total_payout_graveyard = self.total_payout_graveyard;
        block.total_payout_atr = self.total_payout_atr;
        block.total_fees = self.total_fees;
        block.total_fees_new = self.total_fees_new;
        block.total_fees_atr = self.total_fees_atr;
        block.fee_per_byte = self.fee_per_byte;
        block.hash = self.hash;
        block.total_fees_cumulative = self.total_fees_cumulative;

        block.merkle_root = self.generate_merkle_root(true, true);

        block
    }

    pub async fn validate(
        &self,
        blockchain: &Blockchain,
        utxoset: &UtxoSet,
        configs: &(dyn Configuration + Send + Sync),
        storage: &Storage,
        validate_against_utxo: bool,
    ) -> bool {
        //
        // TODO SYNC : Add the code to check whether this is the genesis block and skip validations
        //
        assert!(self.id > 0);
        if configs.is_spv_mode() {
            self.generate_consensus_values(blockchain, storage, configs)
                .await;
            return true;
        }

        //
        // "ghost blocks" are blocks that simply contain the block hash, they are used
        // by lite-clients to sync the chain without validating all of the transactions
        // in situations where users want to make that trade-off. for that reasons, if
        // we have a Ghost Block we automatically validate it.
        //
        if let BlockType::Ghost = self.block_type {
            return true;
        }

        //
        // all valid blocks with ID > 1 must have at least one transaction
        //
        if self.transactions.is_empty() && self.id != 1 && !blockchain.blocks.is_empty() {
            error!("ERROR 424342: block does not validate as it has no transactions",);
            return false;
        }

        //
        // all valid blocks must be signed by their creator
        //
        if !verify_signature(&self.pre_hash, &self.signature, &self.creator) {
            error!("ERROR 582039: block is not signed by creator or signature does not validate",);
            return false;
        }

        info!("validate block : {:?}-{:?}", self.id, self.hash.to_hex());

        //
        // generate "consensus values"
        //
        let cv = self
            .generate_consensus_values(blockchain, storage, configs)
            .await;
        trace!("consensus values generated : {}", cv);

        if validate_against_utxo {
            //
            // total_fees
            //
            if cv.total_fees != self.total_fees {
                error!(
                    "total_fees actual: {:?} expected : {:?}",
                    self.total_fees, cv.total_fees
                );
                return false;
            }

            //
            // total_fees_new
            //
            if cv.total_fees_new != self.total_fees_new {
                error!(
                    "total_fees_new actual: {:?} expected : {:?}",
                    self.total_fees_new, cv.total_fees_new
                );
                return false;
            }

            //
            // total_fees_atr
            //
            if cv.total_fees_atr != self.total_fees_atr {
                error!(
                    "total_fees_atr actual: {:?} expected : {:?}",
                    self.total_fees_atr, cv.total_fees_atr
                );
                return false;
            }

            //
            // total_fees_cumulative
            //
            if cv.total_fees_cumulative != self.total_fees_cumulative {
                error!(
                    "total_fees_cumulative actual: {:?} expected : {:?}",
                    self.total_fees_cumulative, cv.total_fees_cumulative
                );
                return false;
            }

            //
            // avg_total_fees
            //
            if cv.avg_total_fees != self.avg_total_fees {
                error!(
                    "avg_total_fees actual: {:?} expected : {:?}",
                    self.avg_total_fees, cv.avg_total_fees
                );
                return false;
            }

            //
            // avg_total_fees_new
            //
            if cv.avg_total_fees_new != self.avg_total_fees_new {
                error!(
                    "avg_total_fees_new actual: {:?} expected : {:?}",
                    self.avg_total_fees_new, cv.avg_total_fees_new
                );
                return false;
            }

            //
            // avg_total_fees_atr
            //
            if cv.avg_total_fees_atr != self.avg_total_fees_atr {
                error!(
                    "avg_total_fees_atr error: {:?} expected : {:?}",
                    self.avg_total_fees_atr, cv.avg_total_fees_atr
                );
                return false;
            }

            //
            // total_payout_routing
            //
            if cv.total_payout_routing != self.total_payout_routing {
                error!(
                    "total_payout_routing error: {:?} expected : {:?}",
                    self.total_payout_routing, cv.total_payout_routing
                );
                return false;
            }

            //
            // total_payout_mining
            //
            if cv.total_payout_mining != self.total_payout_mining {
                error!(
                    "total_payout_mining actual: {:?} expected : {:?}",
                    self.total_payout_mining, cv.total_payout_mining
                );
                return false;
            }

            //
            // total_payout_treasury
            //
            if cv.total_payout_treasury != self.total_payout_treasury {
                error!(
                    "total_payout_treasury actual: {:?} expected : {:?}",
                    self.total_payout_treasury, cv.total_payout_treasury
                );
                return false;
            }

            //
            // total_payout_graveyard
            //
            if cv.total_payout_graveyard != self.total_payout_graveyard {
                error!(
                    "total_payout_graveyard actual: {:?} expected : {:?}",
                    self.total_payout_graveyard, cv.total_payout_graveyard
                );
                return false;
            }

            //
            // total_payout_atr
            //
            if cv.total_payout_atr != self.total_payout_atr {
                error!(
                    "total_payout_atr actual: {:?} expected : {:?}",
                    self.total_payout_atr, cv.total_payout_atr
                );
                return false;
            }

            //
            // avg_payout_routing
            //
            if cv.avg_payout_routing != self.avg_payout_routing {
                error!(
                    "avg_payout_routing actual: {:?} expected : {:?}",
                    self.avg_payout_routing, cv.avg_payout_routing
                );
                return false;
            }

            //
            // avg_payout_mining
            //
            if cv.avg_payout_mining != self.avg_payout_mining {
                error!(
                    "avg_payout_mining actual: {:?} expected : {:?}",
                    self.avg_payout_mining, cv.avg_payout_mining
                );
                return false;
            }

            //
            // total_payout_treasury
            //
            if cv.avg_payout_treasury != self.avg_payout_treasury {
                error!(
                    "avg_payout_treasury actual: {:?} expected : {:?}",
                    self.avg_payout_treasury, cv.avg_payout_treasury
                );
                return false;
            }

            //
            // avg_payout_graveyard
            //
            if cv.avg_payout_graveyard != self.avg_payout_graveyard {
                error!(
                    "avg_payout_graveyard actual: {:?} expected : {:?}",
                    self.avg_payout_graveyard, cv.avg_payout_graveyard
                );
                return false;
            }

            //
            // total_payout_atr
            //
            if cv.avg_payout_atr != self.avg_payout_atr {
                error!(
                    "avg_payout_atr actual: {:?} expected : {:?}",
                    self.avg_payout_atr, cv.avg_payout_atr
                );
                return false;
            }

            //
            // avg_fee_per_byte
            //
            if cv.avg_fee_per_byte != self.avg_fee_per_byte {
                error!(
                    "ERROR 202392: avg_fee_per_byte is invalid. expected: {:?} vs actual : {:?}",
                    cv.avg_fee_per_byte, self.avg_fee_per_byte
                );
                return false;
            }

            //
            // fee_per_byte
            //
            if cv.fee_per_byte != self.fee_per_byte {
                error!(
                    "ERROR 202392: fee_per_byte is invalid. expected: {:?} vs actual : {:?}",
                    cv.fee_per_byte, self.fee_per_byte
                );
                return false;
            }

            //
            // consensus values -> difficulty (mining/payout unlock difficulty)
            //
            if cv.avg_nolan_rebroadcast_per_block != self.avg_nolan_rebroadcast_per_block {
                error!(
                "ERROR 202392: avg_nolan_rebroadcast_per_block is invalid. expected: {:?} vs actual : {:?}",
                cv.avg_nolan_rebroadcast_per_block, self.avg_nolan_rebroadcast_per_block
            );
                return false;
            }
        }

        //
        // burnfee
        //
        if cv.burnfee != self.burnfee {
            error!(
                "block is misreporting its burnfee. current : {:?} expected : {:?}",
                self.burnfee, cv.burnfee
            );
            return false;
        }

        //
        // difficulty
        //
        if cv.difficulty != self.difficulty {
            error!(
                "ERROR 202392: difficulty is invalid. expected: {:?} vs actual : {:?}",
                cv.difficulty, self.difficulty
            );
            return false;
        }

        //
        // issuance transactions (only possible in block #1)
        //
        if cv.it_num > 0 && self.id > 1 {
            error!("ERROR: blockchain contains issuance after block 1 in chain",);
            return false;
        }

        //
        // social staking transactions (if required)
        //
        if blockchain.social_stake_requirement != 0 && cv.st_num != 1 && self.id > 1 {
            error!(
                "block : {:?} does not have a staking transaction",
                self.hash.to_hex()
            );
            return false;
        }

        //
        // validation of the following requires a previous-block to exist
        //
        if let Some(previous_block) = blockchain.blocks.get(&self.previous_block_hash) {
            //
            // ghost blocks
            //
            if let BlockType::Ghost = previous_block.block_type {
                return true;
            }

            //
            // treasury
            //
            let mut expected_treasury = previous_block.treasury;
            expected_treasury += cv.total_payout_treasury;
            expected_treasury -= cv.total_payout_atr;
            if validate_against_utxo && self.treasury != expected_treasury {
                error!(
                    "ERROR 820391: treasury does not validate: {} expected versus {} found",
                    expected_treasury, self.treasury,
                );
                return false;
            }

            //
            // graveyard
            //
            let mut expected_graveyard = previous_block.graveyard;
            expected_graveyard += cv.total_payout_graveyard;
            if validate_against_utxo && self.graveyard != expected_graveyard {
                error!(
                    "ERROR 123243: graveyard does not validate: {} expected versus {} found",
                    expected_graveyard, self.graveyard,
                );
                return false;
            }

            //
            // validate routing work required
            //
            let amount_of_routing_work_needed: Currency =
                BurnFee::return_routing_work_needed_to_produce_block_in_nolan(
                    previous_block.burnfee,
                    self.timestamp,
                    previous_block.timestamp,
                    configs.get_consensus_config().unwrap().heartbeat_interval,
                );
            if self.total_work < amount_of_routing_work_needed {
                error!("Error 510293: block lacking adequate routing work from creator. actual : {:?} expected : {:?}",self.total_work, amount_of_routing_work_needed);
                return false;
            }

            //
            // validate golden ticket
            //
            // the golden ticket is a special kind of transaction that stores the
            // solution to the network-payment lottery in the transaction message
            // field. it targets the hash of the previous block, which is why we
            // tackle it's validation logic here.
            //
            // first we reconstruct the ticket, then calculate that the solution
            // meets our consensus difficulty criteria. note that by this point in
            // the validation process we have already examined the fee transaction
            // which was generated using this solution. If the solution is invalid
            // we find that out now, and it invalidates the block.
            //
            if let Some(gt_index) = cv.gt_index {
                let golden_ticket: GoldenTicket =
                    GoldenTicket::deserialize_from_net(&self.transactions[gt_index].data);

                //
                // we already have a golden ticket, but create a new one pulling the
                // target hash from our previous block to ensure that this ticket is
                // actually valid in the context of our blockchain, and not just
                // internally consistent in the blockchain of the sender.
                //
                let gt = GoldenTicket::create(
                    previous_block.hash,
                    golden_ticket.random,
                    golden_ticket.public_key,
                );

                //
                // if there is a golden ticket, our previous_block_unpaid should be
                // zero, as we will have issued payment in this block.
                //
                if self.previous_block_unpaid != 0 {
                    error!("ERROR 720351: golden ticket but previous block incorrect");
                    return false;
                }

                //
                // we confirm that the golden ticket is targetting the block hash
                // of the previous block. the solution is invalid if it is not
                // current with the state of the chain..
                trace!("validating gt...");
                if !gt.validate(previous_block.difficulty) {
                    error!(
                        "ERROR 801923: Golden Ticket solution does not validate against previous_block_hash : {:?}, difficulty : {:?}, random : {:?}, public_key : {:?} target : {:?}",
                        previous_block.hash.to_hex(),
                        previous_block.difficulty,
                        gt.random.to_hex(),
                        gt.public_key.to_base58(),
                        gt.target.to_hex()
                    );
                    let solution = hash(&gt.serialize_for_net());
                    let solution_num = primitive_types::U256::from_big_endian(&solution);

                    error!(
                        "solution : {:?} leading zeros : {:?}",
                        solution.to_hex(),
                        solution_num.leading_zeros()
                    );
                    return false;
                }
                trace!("gt validated !");
            } else {
                //
                // if there is no golden ticket, our previous block's total_fees will
                // be stored in this block as previous_block_unpaid. this simplifies
                // smoothing payouts, and assists with monitoring that the total token
                // supply has not changed.
                //
                if self.previous_block_unpaid != previous_block.total_fees {
                    error!("ERROR 572983: previous_block_unpaid value incorrect");
                    return false;
                }
            }
            // trace!(" ... golden ticket: (validated)  {:?}", create_timestamp());
        }

        //
        // validate atr
        //
        // Automatic Transaction Rebroadcasts are removed programmatically from
        // an earlier block in the blockchain and rebroadcast into the latest
        // block, with a fee being deducted to keep the data on-chain. In order
        // to validate ATR we need to make sure we have the correct number of
        // transactions (and ONLY those transactions!) included in our block.
        //
        // we do this by comparing the total number of ATR slips and nolan
        // which we counted in the generate_metadata() function, with the
        // expected number given the consensus values we calculated earlier.
        //
        if validate_against_utxo && cv.total_rebroadcast_slips != self.total_rebroadcast_slips {
            error!(
                "ERROR 624442: rebroadcast slips total incorrect. expected : {:?} actual : {:?}",
                cv.total_rebroadcast_slips, self.total_rebroadcast_slips
            );
            return false;
        }
        // deprecated -- Jan 20, 2025
        //if cv.total_rebroadcast_nolan != self.total_rebroadcast_nolan {
        //    error!(
        //        "ERROR 294018: rebroadcast nolan amount incorrect. expected : {:?} actual : {:?}",
        //        cv.total_rebroadcast_nolan, self.total_rebroadcast_nolan
        //    );
        //    return false;
        //}
        if validate_against_utxo && cv.rebroadcast_hash != self.rebroadcast_hash {
            error!("ERROR 123422: hash of rebroadcast transactions incorrect. expected : {:?} actual : {:?}",cv.rebroadcast_hash.to_hex(), self.rebroadcast_hash.to_hex());
            return false;
        }

        //
        // merkle root
        //
        if self.merkle_root == [0; 32]
            && self.merkle_root
                != self.generate_merkle_root(configs.is_browser(), configs.is_spv_mode())
        {
            error!("merkle root is unset or is invalid false 1");
            return false;
        }

        //
        // fee transaction
        //
        // because the fee transaction that is created by generate_consensus_values is
        // produced without knowledge of the block in which it will be put, we need to
        // update that transaction with this information prior to hashing it in order
        // for the hash-comparison to work.
        //
        if cv.ft_num > 0 {
            if let (Some(ft_index), Some(fee_transaction_expected)) =
                (cv.ft_index, cv.fee_transaction)
            {
                if cv.gt_index.is_none() {
                    error!("ERROR 48203: block has fee transaction but no golden ticket");
                    return false;
                }

                //
                // the fee transaction is hashed to compare it with the one in the block
                //
                let fee_transaction_in_block = self.transactions.get(ft_index).unwrap();
                let hash1 = hash(&fee_transaction_expected.serialize_for_signature());
                let hash2 = hash(&fee_transaction_in_block.serialize_for_signature());

                if validate_against_utxo && hash1 != hash2 {
                    error!(
                        "ERROR 892032: block {} fee transaction doesn't match cv-expected fee transaction",
                        self.id
                    );
                    error!(
                        "expected = {:?}",
                        &fee_transaction_expected.serialize_for_signature()
                    );
                    error!(
                        "actual   = {:?}",
                        &fee_transaction_in_block.serialize_for_signature()
                    );
                    if let Some(gt_index) = cv.gt_index {
                        let golden_ticket: GoldenTicket =
                            GoldenTicket::deserialize_from_net(&self.transactions[gt_index].data);
                        error!("gt.publickey = {:?}", golden_ticket.public_key.to_hex());
                    }

                    return false;
                }
            }
        }

        //
        // validate transactions
        //
        // validating transactions requires checking that the signatures are valid,
        // the routing paths are valid, and all of the input slips are pointing
        // to spendable tokens that exist in our UTXOSET. this logic is separate
        // from the validation of block-level variables, so is handled in the
        // transaction objects.
        //
        // this is one of the most computationally intensive parts of processing a
        // block which is why we handle it in parallel. the exact logic needed to
        // examine a transaction may depend on the transaction itself, as we have
        // some specific types (Fee / ATR / etc.) that are generated automatically
        // and may have different requirements.
        //
        // the validation logic for transactions is contained in the transaction
        // class, and the validation logic for slips is contained in the slips
        // class. Note that we are passing in a read-only copy of our UTXOSet so
        // as to determine spendability.

        trace!(
            "validating transactions ... count : {:?}",
            self.transactions.len()
        );
        let mut new_slips_map = std::collections::HashMap::new();
        let transactions_valid = self.transactions.iter().all(|tx: &Transaction| -> bool {
            let valid_tx = tx.validate(utxoset, blockchain, validate_against_utxo);
            // validate double-spend inputs
            if valid_tx && tx.transaction_type != TransactionType::Fee {
                for input in tx.from.iter() {
                    if input.amount == 0 || input.slip_type == SlipType::Bound {
                        continue;
                    }
                    let utxo_key = input.get_utxoset_key();

                    if new_slips_map.contains_key(&utxo_key) {
                        error!(
                            "double-spend detected in block {} : {} in block.validate()",
                            self.id,
                            Slip::parse_slip_from_utxokey(&utxo_key).unwrap()
                        );
                        return false;
                    }

                    new_slips_map.insert(utxo_key, 1);
                }
            }
            true
        });

        if !transactions_valid {
            error!("ERROR 579128: Invalid transactions found, block validation failed");
        }
        trace!("transactions validation complete");

        transactions_valid
    }

    pub fn generate_transaction_hashmap(&mut self) {
        if !self.transaction_map.is_empty() {
            return;
        }
        for tx in self.transactions.iter() {
            for slip in tx.from.iter() {
                self.transaction_map.insert(slip.public_key, true);
            }
            for slip in tx.to.iter() {
                self.transaction_map.insert(slip.public_key, true);
            }
        }
    }
    pub fn has_keylist_txs(&self, keylist: &Vec<SaitoPublicKey>) -> bool {
        for key in keylist {
            if self.transaction_map.contains_key(key) {
                return true;
            }
        }
        false
    }

    pub fn get_file_name(&self) -> String {
        let timestamp = self.timestamp;
        let block_hash = self.hash;

        timestamp.to_string() + "-" + block_hash.to_hex().as_str() + BLOCK_FILE_EXTENSION
    }
    pub fn print_all(&self) {
        info!(
            "Block {{ id: {}, timestamp: {}, previous_block_hash: {:?}, creator: {:?}, merkle_root: {:?}, signature: {:?}, graveyard: {}, treasury: {}, total_fees: {}, total_fees_new: {}, total_fees_atr: {}, avg_total_fees: {}, avg_total_fees_new: {}, avg_total_fees_atr: {}, total_payout_routing: {}, total_payout_mining: {}, total_payout_treasury: {}, total_payout_graveyard: {}, total_payout_atr: {}, avg_payout_routing: {}, avg_payout_mining: {}, avg_payout_treasury: {}, avg_payout_graveyard: {}, avg_payout_atr: {}, avg_fee_per_byte: {}, fee_per_byte: {}, avg_nolan_rebroadcast_per_block: {}, burnfee: {}, difficulty: {}, previous_block_unpaid: {}, hash: {:?}, total_work: {}, in_longest_chain: {}, has_golden_ticket: {}, has_issuance_transaction: {}, issuance_transaction_index: {}, has_fee_transaction: {}, has_staking_transaction: {}, golden_ticket_index: {}, fee_transaction_index: {}, total_rebroadcast_slips: {}, total_rebroadcast_nolan: {}, rebroadcast_hash: {}, block_type: {:?}, cv: {}, routed_from_peer: {:?} ",
            self.id,
            self.timestamp,
            self.previous_block_hash.to_hex(),
            self.creator.to_base58(),
            self.merkle_root.to_hex(),
            self.signature.to_hex(),
            self.graveyard,
            self.treasury,
            self.total_fees,
            self.total_fees_new,
            self.total_fees_atr,
            self.avg_total_fees,
            self.avg_total_fees_new,
            self.avg_total_fees_atr,
            self.total_payout_routing,
            self.total_payout_mining,
            self.total_payout_treasury,
            self.total_payout_graveyard,
            self.total_payout_atr,
            self.avg_payout_routing,
            self.avg_payout_mining,
            self.avg_payout_treasury,
            self.avg_payout_graveyard,
            self.avg_payout_atr,
            self.avg_fee_per_byte,
            self.fee_per_byte,
            self.avg_nolan_rebroadcast_per_block,
            self.burnfee,
            self.difficulty,
            self.previous_block_unpaid,
            self.hash.to_hex(),
            self.total_work,
            self.in_longest_chain,
            self.has_golden_ticket,
            self.has_issuance_transaction,
            self.issuance_transaction_index,
            self.has_fee_transaction,
            self.has_staking_transaction,
            self.golden_ticket_index,
            self.fee_transaction_index,
            self.total_rebroadcast_slips,
            self.total_rebroadcast_nolan,
            self.rebroadcast_hash.to_hex(),
            self.block_type,
            self.cv,
            self.routed_from_peer,
        );
        info!(" transactions : ");
        for (index, tx) in self.transactions.iter().enumerate() {
            info!("tx {} : {}", index, tx);
        }
    }
}

#[cfg(test)]
mod tests {
    use ahash::AHashMap;
    use futures::future::join_all;
    use log::info;

    use crate::core::consensus::block::{Block, BlockType};

    use crate::core::consensus::merkle::MerkleTree;
    use crate::core::consensus::slip::{Slip, SlipType};
    use crate::core::consensus::transaction::{Transaction, TransactionType};
    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::{
        Currency, PrintForLog, SaitoHash, SaitoPrivateKey, SaitoPublicKey, NOLAN_PER_SAITO,
    };
    use crate::core::io::storage::Storage;
    use crate::core::util::crypto::{generate_keys, verify_signature};
    use crate::core::util::test::node_tester::test::NodeTester;
    use crate::core::util::test::test_manager::test::TestManager;

    #[test]
    fn block_new_test() {
        let block = Block::new();
        assert_eq!(block.id, 0);
        assert_eq!(block.timestamp, 0);
        assert_eq!(block.previous_block_hash, [0; 32]);
        assert_eq!(block.creator, [0; 33]);
        assert_eq!(block.merkle_root, [0; 32]);
        assert_eq!(block.signature, [0; 64]);
        assert_eq!(block.graveyard, 0);
        assert_eq!(block.burnfee, 0);
        assert_eq!(block.difficulty, 0);
        assert_eq!(block.transactions, vec![]);
        assert_eq!(block.pre_hash, [0; 32]);
        assert_eq!(block.hash, [0; 32]);
        assert_eq!(block.total_fees, 0);
        assert_eq!(block.total_work, 0);
        assert_eq!(block.in_longest_chain, false);
        assert_eq!(block.has_golden_ticket, false);
        assert_eq!(block.has_issuance_transaction, false);
        assert_eq!(block.issuance_transaction_index, 0);
        assert_eq!(block.has_fee_transaction, false);
        assert_eq!(block.fee_transaction_index, 0);
        assert_eq!(block.golden_ticket_index, 0);
        assert_eq!(block.total_rebroadcast_slips, 0);
        assert_eq!(block.total_rebroadcast_nolan, 0);
        assert_eq!(block.rebroadcast_hash, [0; 32]);
        assert_eq!(block.block_type, BlockType::Full);
        assert_eq!(block.slips_spent_this_block, AHashMap::new());
        assert_eq!(block.created_hashmap_of_slips_spent_this_block, false);
        assert_eq!(block.routed_from_peer, None);
    }

    #[test]
    fn block_generate_test() {
        let mut block = Block::new();
        block.generate().unwrap();

        // block hashes should have updated
        assert_ne!(block.pre_hash, [0; 32]);
        assert_ne!(block.hash, [0; 32]);
        assert_ne!(block.pre_hash, [0; 32]);
        assert_ne!(block.hash, [0; 32]);
        assert_eq!(block.pre_hash, block.pre_hash);
        assert_eq!(block.hash, block.hash);
    }

    #[test]
    fn block_signature_test() {
        let mut block = Block::new();

        block.id = 10;
        block.timestamp = 1637034582;
        block.previous_block_hash = <SaitoHash>::from_hex(
            "bcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8b",
        )
        .unwrap();
        block.merkle_root = <SaitoHash>::from_hex(
            "ccf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8b",
        )
        .unwrap();
        block.creator = <SaitoPublicKey>::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8bcc",
        )
        .unwrap();
        block.burnfee = 50000000;
        block.difficulty = 0;
        block.graveyard = 0;
        block.treasury = 0;
        block.signature = <[u8; 64]>::from_hex("c9a6c2d0bf884be6933878577171a3c8094c2bf6e0bc1b4ec3535a4a55224d186d4d891e254736cae6c0d2002c8dfc0ddfc7fcdbe4bc583f96fa5b273b9d63f4").unwrap();

        let serialized_body = block.serialize_for_signature();
        assert_eq!(serialized_body.len(), 209);

        block.creator = <SaitoPublicKey>::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8bcc",
        )
        .unwrap();

        block.sign(
            &<SaitoHash>::from_hex(
                "854702489d49c7fb2334005b903580c7a48fe81121ff16ee6d1a528ad32f235d",
            )
            .unwrap(),
        );

        assert_eq!(block.signature.len(), 64);
    }

    #[test]
    fn block_serialization_and_deserialization_test() {
        // pretty_env_logger::init();
        let mock_input = Slip::default();
        let mock_output = Slip::default();

        let mut mock_tx = Transaction::default();
        mock_tx.timestamp = 0;
        mock_tx.add_from_slip(mock_input.clone());
        mock_tx.add_to_slip(mock_output.clone());
        mock_tx.data = vec![104, 101, 108, 111];
        mock_tx.transaction_type = TransactionType::Normal;
        mock_tx.signature = [1; 64];

        let mut mock_tx2 = Transaction::default();
        mock_tx2.timestamp = 0;
        mock_tx2.add_from_slip(mock_input);
        mock_tx2.add_to_slip(mock_output);
        mock_tx2.data = vec![];
        mock_tx2.transaction_type = TransactionType::Normal;
        mock_tx2.signature = [2; 64];

        let timestamp = 0;

        let mut block = Block::new();
        block.id = 1;
        block.timestamp = timestamp;
        block.previous_block_hash = [1; 32];
        block.creator = [2; 33];
        block.merkle_root = [0; 32];
        block.signature = [4; 64];
        block.graveyard = 1_000_000;
        block.burnfee = 2;
        block.difficulty = 3;
        block.transactions = vec![mock_tx, mock_tx2];
        block.generate().unwrap();

        let serialized_block = block.serialize_for_net(BlockType::Full);
        let deserialized_block = Block::deserialize_from_net(&serialized_block).unwrap();

        let serialized_block_header = block.serialize_for_net(BlockType::Header);
        let deserialized_block_header =
            Block::deserialize_from_net(&serialized_block_header).unwrap();

        assert_eq!(
            block.serialize_for_net(BlockType::Full),
            deserialized_block.serialize_for_net(BlockType::Full)
        );

        assert_eq!(deserialized_block.id, 1);
        assert_eq!(deserialized_block.timestamp, timestamp);
        assert_eq!(deserialized_block.previous_block_hash, [1; 32]);
        assert_eq!(deserialized_block.creator, [2; 33]);
        assert_ne!(deserialized_block.merkle_root, [0; 32]);
        assert_eq!(deserialized_block.signature, [4; 64]);
        assert_eq!(deserialized_block.graveyard, 1_000_000);
        assert_eq!(deserialized_block.burnfee, 2);
        assert_eq!(deserialized_block.difficulty, 3);

        assert_eq!(
            deserialized_block_header.serialize_for_net(BlockType::Full),
            deserialized_block.serialize_for_net(BlockType::Header)
        );

        assert_eq!(deserialized_block_header.id, 1);
        assert_eq!(deserialized_block_header.timestamp, timestamp);
        assert_eq!(deserialized_block_header.previous_block_hash, [1; 32]);
        assert_eq!(deserialized_block_header.creator, [2; 33]);
        assert_ne!(deserialized_block_header.merkle_root, [0; 32]);
        assert_eq!(deserialized_block_header.signature, [4; 64]);
        assert_eq!(deserialized_block_header.graveyard, 1_000_000);
        assert_eq!(deserialized_block_header.burnfee, 2);
        assert_eq!(deserialized_block_header.difficulty, 3);

        let mut lite_block = block.generate_lite_block(vec![]);
        lite_block.generate().unwrap();
        assert_eq!(block.id, lite_block.id);
        assert_eq!(block.timestamp, lite_block.timestamp);
        assert_eq!(
            block.previous_block_hash.to_hex(),
            lite_block.previous_block_hash.to_hex()
        );
        assert_eq!(block.creator, lite_block.creator);
        assert_eq!(block.graveyard, lite_block.graveyard);
        assert_eq!(block.treasury, lite_block.treasury);
        assert_eq!(block.burnfee, lite_block.burnfee);
        assert_eq!(block.difficulty, lite_block.difficulty);
        assert_eq!(block.avg_total_fees, lite_block.avg_total_fees);
        assert_eq!(block.avg_fee_per_byte, lite_block.avg_fee_per_byte);
        assert_eq!(
            block.avg_nolan_rebroadcast_per_block,
            lite_block.avg_nolan_rebroadcast_per_block
        );
        assert_eq!(
            block.previous_block_unpaid,
            lite_block.previous_block_unpaid
        );
        assert_eq!(block.merkle_root.to_hex(), lite_block.merkle_root.to_hex());

        assert_eq!(block.pre_hash.to_hex(), lite_block.pre_hash.to_hex());
        assert_eq!(block.hash.to_hex(), lite_block.hash.to_hex());
    }

    #[test]
    fn block_sign_and_verify_test() {
        let keys = generate_keys();

        let wallet = Wallet::new(keys.1, keys.0);
        let mut block = Block::new();
        block.creator = wallet.public_key;
        block.generate().unwrap();
        block.sign(&wallet.private_key);
        block.generate_hash();

        assert_eq!(block.creator, wallet.public_key);
        assert!(verify_signature(
            &block.pre_hash,
            &block.signature,
            &block.creator,
        ));
        assert_ne!(block.hash, [0; 32]);
        assert_ne!(block.signature, [0; 64]);
    }

    #[test]
    fn block_merkle_root_test() {
        let mut block = Block::new();
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);

        let transactions: Vec<Transaction> = (0..5)
            .map(|_| {
                let mut transaction = Transaction::default();
                transaction.sign(&wallet.private_key);
                transaction
            })
            .collect();

        block.transactions = transactions;
        block.merkle_root = block.generate_merkle_root(false, false);

        assert_eq!(block.merkle_root.len(), 32);
        assert_ne!(block.merkle_root, [0; 32]);
    }

    #[tokio::test]
    #[serial_test::serial]
    // downgrade and upgrade a block with transactions
    async fn block_downgrade_upgrade_test() {
        let mut t = TestManager::default();
        let wallet_lock = t.wallet_lock.clone();
        let mut block = Block::new();
        let transactions = join_all((0..5).map(|_| async {
            let mut transaction = Transaction::default();
            let wallet = wallet_lock.read().await;

            transaction.sign(&wallet.private_key);
            transaction
        }))
        .await
        .to_vec();

        block.transactions = transactions;
        block.generate().unwrap();

        // save to disk
        t.storage.write_block_to_disk(&mut block).await;

        assert_eq!(block.transactions.len(), 5);
        assert_eq!(block.block_type, BlockType::Full);

        let serialized_full_block = block.serialize_for_net(BlockType::Full);
        block
            .update_block_to_block_type(BlockType::Pruned, &t.storage, false)
            .await;

        assert_eq!(block.transactions.len(), 0);
        assert_eq!(block.block_type, BlockType::Pruned);

        block
            .update_block_to_block_type(BlockType::Full, &t.storage, false)
            .await;

        assert_eq!(block.transactions.len(), 5);
        assert_eq!(block.block_type, BlockType::Full);
        assert_eq!(
            serialized_full_block,
            block.serialize_for_net(BlockType::Full)
        );
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn generate_lite_block_test() {
        let mut t = TestManager::default();

        // test blocks with transactions
        // Block 1
        // perform transaction to wallet public key
        t.initialize(100, 200_000_000_000_000).await;
        let block1 = t.get_latest_block().await;
        let public_key: SaitoPublicKey;
        {
            let wallet = t.wallet_lock.read().await;
            public_key = wallet.public_key;
        }
        let lite_block = block1.generate_lite_block(vec![public_key]);
        assert_eq!(lite_block.hash, block1.hash);
        assert_eq!(lite_block.signature, block1.signature);

        // Second Block
        // perform a transaction to public key
        let public_key =
            Storage::decode_str("s8oFPjBX97NC2vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR").unwrap();
        let mut to_public_key: SaitoPublicKey = [0u8; 33];
        to_public_key.copy_from_slice(&public_key);
        t.transfer_value_to_public_key(to_public_key, 500, block1.timestamp + 120000)
            .await
            .unwrap();
        let block2 = t.get_latest_block().await;
        let mut lite_block2 = block2.generate_lite_block(vec![to_public_key]);
        assert_eq!(lite_block2.signature, block2.clone().signature);
        assert_eq!(lite_block2.hash, block2.hash);
        assert_eq!(lite_block2.merkle_root, block2.merkle_root);
        assert_eq!(lite_block2.difficulty, block2.difficulty);
        assert_eq!(lite_block2.id, block2.id);
        assert_eq!(lite_block2.block_type, BlockType::Full);

        lite_block2.generate().unwrap();
        assert_eq!(lite_block2.signature, block2.clone().signature);
        assert_eq!(lite_block2.hash, block2.hash);

        let buffer = lite_block2.serialize_for_net(BlockType::Pruned);
        let mut block2 = Block::deserialize_from_net(&buffer).unwrap();
        block2.generate().unwrap();
        assert_eq!(lite_block2.signature, block2.clone().signature);
        assert_eq!(lite_block2.hash, block2.hash);

        // block 3
        // Perform no transaction
        let block2_hash = block2.hash;
        let mut block3 = t
            .create_block(
                block2_hash,               // hash of parent block
                block2.timestamp + 120000, // timestamp
                0,                         // num transactions
                0,                         // amount
                0,                         // fee
                true,                      // mine golden ticket
            )
            .await;
        block3.generate().unwrap(); // generate hashes
        dbg!(block3.id);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn verify_spv_transaction_in_lite_block_test() {
        let mut t = TestManager::default();

        // Initialize the test manager
        t.initialize(100, 100000).await;

        // Retrieve the latest block
        let mut block = t.get_latest_block().await;

        // Get the wallet's keys
        let private_key: SaitoPrivateKey;
        let public_key: SaitoPublicKey;
        {
            let wallet = t.wallet_lock.read().await;

            public_key = wallet.public_key;
            private_key = wallet.private_key;
        }

        // Set up the recipient's public key
        let _public_key = "27UK2MuBTdeARhYp97XBnCovGkEquJjkrQntCgYoqj6GC";
        let mut to_public_key: SaitoPublicKey = [0u8; 33];

        // Create VIP transactions
        for _ in 0..50 {
            let public_key_ = Storage::decode_str(_public_key).unwrap();
            to_public_key.copy_from_slice(&public_key_);
            let mut tx = Transaction::default();
            tx.transaction_type = TransactionType::Normal;
            let mut output = Slip::default();
            output.public_key = to_public_key;
            output.amount = 0;
            output.slip_type = SlipType::Normal;
            tx.add_to_slip(output);
            tx.generate(&public_key, 0, 0);
            tx.sign(&private_key);
            // dbg!(&tx.hash_for_signature);
            block.add_transaction(tx);
        }

        {
            let configs = t.config_lock.read().await;
            block.merkle_root =
                block.generate_merkle_root(configs.is_browser(), configs.is_spv_mode());
        }

        // Generate and sign the block
        block.generate().unwrap();
        block.sign(&private_key);

        // Generate a lite block from the full block, using the public keys for SPV transactions
        let lite_block = block.generate_lite_block(vec![public_key]);

        // Find the SPV transaction in the lite block
        let _spv_tx = lite_block
            .transactions
            .iter()
            .find(|&tx| tx.transaction_type == TransactionType::SPV)
            .expect("No SPV transaction found")
            .clone();

        // Generate a Merkle tree from the block transactions
        let _merkle_tree = MerkleTree::generate(&lite_block.transactions)
            .expect("Failed to generate Merkle tree for block");

        dbg!(
            lite_block.generate_merkle_root(false, false),
            block.generate_merkle_root(false, false)
        );
    }

    #[tokio::test]
    #[ignore]
    #[serial_test::serial]
    async fn avg_fee_per_byte_test() {
        // pretty_env_logger::init();
        let mut t = TestManager::default();

        // Initialize the test manager
        t.initialize(250, 200_000_000_000_000).await;

        let latest_block = t.get_latest_block().await;

        let mut block = t
            .create_block(
                latest_block.hash,
                latest_block.timestamp + 40000,
                100,
                1000,
                1_000_000,
                true,
            )
            .await;

        block.generate().unwrap();

        let mut tx_size = 0;
        let mut total_fees = 0;

        for tx in &block.transactions {
            if !tx.is_fee_transaction() {
                tx_size += tx.serialize_for_net().len();
                total_fees += tx.total_fees;
            }
        }

        info!(
            "avg fee per byte 1: {:?} total fees = {:?} tx size = {:?} tx count = {:?}",
            block.avg_fee_per_byte,
            total_fees,
            tx_size,
            block.transactions.len()
        );
        assert_eq!(block.avg_fee_per_byte, total_fees / tx_size as Currency);

        let mut block = t
            .create_block(
                latest_block.hash,
                latest_block.timestamp + 140000,
                100,
                1000,
                1_000_000,
                false,
            )
            .await;

        block.generate().unwrap();

        let mut tx_size = 0;
        let mut total_fees = 0;

        for tx in &block.transactions {
            if !tx.is_fee_transaction() {
                tx_size += tx.serialize_for_net().len();
                total_fees += tx.total_fees;
            }
        }
        info!(
            "avg fee per byte 2: {:?} total fees = {:?} tx size = {:?} tx count = {:?}",
            block.avg_fee_per_byte,
            total_fees,
            tx_size,
            block.transactions.len()
        );
        assert_eq!(block.avg_fee_per_byte, total_fees / tx_size as Currency);
    }

    #[ignore]
    #[tokio::test]
    #[serial_test::serial]
    async fn atr_test() {
        // pretty_env_logger::init();

        // create test manager
        let mut t = TestManager::default();

        t.initialize_with_timestamp(100, 10000, 0).await;
        let genesis_period = t
            .config_lock
            .read()
            .await
            .get_consensus_config()
            .unwrap()
            .genesis_period;
        // check if epoch length is 10
        assert_eq!(genesis_period, 100, "Genesis period is not 10");

        // create 10 blocks
        for _i in 0..genesis_period {
            let mut block = t
                .create_block(
                    t.latest_block_hash,
                    t.get_latest_block().await.timestamp + 10_000,
                    10,
                    100,
                    10,
                    true,
                )
                .await;
            block.generate().unwrap();
            t.add_block(block).await;
        }

        // check consensus values for 10th block
        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;

        let latest_block = t.get_latest_block().await;
        let cv = latest_block.cv;

        println!("cv : {:?} \n", cv);

        assert_eq!(cv.rebroadcasts.len(), 0);
        assert_eq!(cv.avg_nolan_rebroadcast_per_block, 0);

        // add 11th block
        let mut block = t
            .create_block(
                t.latest_block_hash,
                t.get_latest_block().await.timestamp + 10_000,
                10,
                100,
                10,
                true,
            )
            .await;
        block.generate().unwrap();
        t.add_block(block).await;

        // check consensus values for 11th block
        t.check_blockchain().await;
        t.check_utxoset().await;
        t.check_token_supply().await;

        let latest_block = t.get_latest_block().await;
        let cv = latest_block.cv;

        println!("cv2 : {:?}", cv);

        // TODO : check the values in the below asserts
        // assert_eq!(cv.avg_total_fees, 3471);
        // assert_eq!(cv.total_fees, 5100);
        // assert_eq!(cv.burnfee, 1104854);
        assert_eq!(cv.rebroadcasts.len(), 1);
        assert_eq!(cv.avg_nolan_rebroadcast_per_block, 10);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn atr_test_2() {
        pretty_env_logger::init();
        NodeTester::delete_data().await.unwrap();
        let mut tester = NodeTester::default();

        let public_key = tester.get_public_key().await;
        tester
            .set_staking_requirement(2_000_000 * NOLAN_PER_SAITO, 60)
            .await;
        let issuance = vec![
            (public_key.to_base58(), 100 * 2_000_000 * NOLAN_PER_SAITO),
            (public_key.to_base58(), 100_000 * NOLAN_PER_SAITO),
            (
                "27UK2MuBTdeARhYp97XBnCovGkEquJjkrQntCgYoqj6GC".to_string(),
                50_000 * NOLAN_PER_SAITO,
            ),
        ];
        tester.set_issuance(issuance).await.unwrap();

        tester.init().await.unwrap();
        // atr rebroadcasts on genesis_period + 1
        let genesis_period = (tester
            .routing_thread
            .config_lock
            .read()
            .await
            .get_consensus_config()
            .unwrap()
            .genesis_period)
            + 1;
        tester.wait_till_block_id(1).await.unwrap();

        for i in 1..genesis_period {
            let tx = tester.create_transaction(10, 0, public_key).await.unwrap();
            tester.add_transaction(tx).await;
            tester.wait_till_block_id(i + 1).await.unwrap();
        }

        let wallet = tester.consensus_thread.wallet_lock.read().await;
        let have_atr_slips = wallet
            .slips
            .iter()
            .any(|(_, slip)| slip.slip_type == SlipType::ATR);
        assert!(!have_atr_slips);
        drop(wallet);

        tester.wait_till_block_id(genesis_period).await.unwrap();
        {
            let wallet = tester.consensus_thread.wallet_lock.read().await;
            let atr_slip_count = wallet
                .slips
                .iter()
                .filter(|(_, slip)| matches!(slip.slip_type, SlipType::ATR))
                .count();
            assert_eq!(atr_slip_count, 0);
        }

        {
            let tx = tester.create_transaction(10, 0, public_key).await.unwrap();
            tester.add_transaction(tx).await;

            tester.wait_till_block_id(genesis_period + 1).await.unwrap();

            let wallet = tester.consensus_thread.wallet_lock.read().await;
            let atr_slip_count = wallet
                .slips
                .iter()
                .filter(|(_, slip)| matches!(slip.slip_type, SlipType::ATR))
                .count();
            // wallet only has slips owned by that public key
            assert_eq!(atr_slip_count, 0);
        }
        {
            let blockchain = tester.consensus_thread.blockchain_lock.read().await;
            let block = blockchain.get_latest_block().unwrap();
            assert_eq!(blockchain.get_latest_block_id(), genesis_period + 1);
            assert_eq!(block.id, genesis_period + 1);
            let mut have_atr_tx = false;
            for tx in block.transactions.iter() {
                if tx.transaction_type == TransactionType::ATR {
                    have_atr_tx = true;
                }
            }
            assert!(have_atr_tx);
        }

        {
            let tx = tester.create_transaction(10, 0, public_key).await.unwrap();
            tester.add_transaction(tx).await;

            tester.wait_till_block_id(genesis_period + 2).await.unwrap();

            let wallet = tester.consensus_thread.wallet_lock.read().await;
            let atr_slip_count = wallet
                .slips
                .iter()
                .filter(|(_, slip)| matches!(slip.slip_type, SlipType::ATR))
                .count();
            assert_eq!(atr_slip_count, 1);
        }
        {
            let blockchain = tester.consensus_thread.blockchain_lock.read().await;
            let block = blockchain.get_latest_block().unwrap();
            assert_eq!(blockchain.get_latest_block_id(), genesis_period + 2);
            assert_eq!(block.id, genesis_period + 2);
            let mut have_atr_tx = false;
            for tx in block.transactions.iter() {
                if tx.transaction_type == TransactionType::ATR {
                    have_atr_tx = true;
                }
            }
            assert!(have_atr_tx);
        }
    }
}
