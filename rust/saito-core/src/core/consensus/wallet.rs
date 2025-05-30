use ahash::{AHashMap, AHashSet};
use log::{debug, info, trace, warn};
use std::fmt::Display;
use std::io::{Error, ErrorKind};

use crate::core::consensus::block::Block;
use crate::core::consensus::golden_ticket::GoldenTicket;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::defs::{
    BlockId, Currency, PrintForLog, SaitoHash, SaitoPrivateKey, SaitoPublicKey, SaitoSignature,
    SaitoUTXOSetKey, UTXO_KEY_LENGTH,
};
use crate::core::io::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::io::network::Network;
use crate::core::io::storage::Storage;
use crate::core::process::version::{read_pkg_version, Version};
use crate::core::util::balance_snapshot::BalanceSnapshot;
use crate::core::util::crypto::{generate_keys, hash, sign};

pub const WALLET_SIZE: usize = 65;

pub type WalletUpdateStatus = bool;
pub const WALLET_UPDATED: WalletUpdateStatus = true;
pub const WALLET_NOT_UPDATED: WalletUpdateStatus = false;

/// The `WalletSlip` stores the essential information needed to track which
/// slips are spendable and managing them as they move onto and off of the
/// longest-chain.
///
/// Please note that the wallet in this Saito Rust client is intended primarily
/// to hold the public/private_key and that slip-spending and tracking code is
/// not coded in a way intended to be robust against chain-reorganizations but
/// rather for testing of basic functions like transaction creation. Slips that
/// are spent on one fork are not recaptured on chains, for instance, and once
/// a slip is spent it is marked as spent.
///
#[derive(Clone, Debug, PartialEq)]
pub struct WalletSlip {
    pub utxokey: SaitoUTXOSetKey,
    pub amount: Currency,
    pub block_id: u64,
    pub tx_ordinal: u64,
    pub lc: bool,
    pub slip_index: u8,
    pub spent: bool,
    pub slip_type: SlipType,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NFT {
    pub slip1: SaitoUTXOSetKey,
    pub slip2: SaitoUTXOSetKey,
    pub slip3: SaitoUTXOSetKey,
    pub id: Vec<u8>,
    pub tx_sig: SaitoSignature,
}

impl Default for NFT {
    fn default() -> Self {
        Self {
            slip1: [0; UTXO_KEY_LENGTH], // bound
            slip2: [0; UTXO_KEY_LENGTH], // normal
            slip3: [0; UTXO_KEY_LENGTH], // bound
            id: vec![],
            tx_sig: [0; 64],
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DetailedNFT {
    pub slip1: Slip,
    pub slip2: Slip,
    pub slip3: Slip,
    pub id: Vec<u8>,
    pub tx_sig: SaitoSignature,
}

impl Default for DetailedNFT {
    fn default() -> Self {
        DetailedNFT {
            slip1: Slip::default(),
            slip2: Slip::default(),
            slip3: Slip::default(),
            id: Vec::new(),
            tx_sig: [0u8; 64],
        }
    }
}

/// The `Wallet` manages the public and private keypair of the node and holds the
/// slips that are used to form transactions on the network.
#[derive(Clone, Debug, PartialEq)]
pub struct Wallet {
    pub public_key: SaitoPublicKey,
    pub private_key: SaitoPrivateKey,
    pub slips: AHashMap<SaitoUTXOSetKey, WalletSlip>,
    pub unspent_slips: AHashSet<SaitoUTXOSetKey>,
    pub staking_slips: AHashSet<SaitoUTXOSetKey>,
    pub filename: String,
    pub filepass: String,
    available_balance: Currency,
    pub pending_txs: AHashMap<SaitoHash, Transaction>,
    // TODO : this version should be removed. only added as a temporary hack to allow SLR app version to be easily upgraded in browsers
    pub wallet_version: Version,
    pub core_version: Version,
    pub key_list: Vec<SaitoPublicKey>,
    pub nfts: Vec<NFT>,
}

impl Wallet {
    pub fn new(private_key: SaitoPrivateKey, public_key: SaitoPublicKey) -> Wallet {
        info!("generating new wallet...");
        // let (public_key, private_key) = generate_keys();

        Wallet {
            public_key,
            private_key,
            slips: AHashMap::new(),
            unspent_slips: AHashSet::new(),
            staking_slips: Default::default(),
            filename: "default".to_string(),
            filepass: "password".to_string(),
            available_balance: 0,
            pending_txs: Default::default(),
            wallet_version: Default::default(),
            core_version: read_pkg_version(),
            key_list: vec![],
            nfts: Vec::new(),
        }
    }

    pub async fn load(wallet: &mut Wallet, io: &(dyn InterfaceIO + Send + Sync)) {
        info!("loading wallet...");
        let result = io.load_wallet(wallet).await;
        if result.is_err() {
            warn!("loading wallet failed. saving new wallet");
            // TODO : check error code
            io.save_wallet(wallet).await.unwrap();
        } else {
            info!("wallet loaded");
            io.send_interface_event(InterfaceEvent::WalletUpdate());
        }
    }
    pub async fn save(wallet: &mut Wallet, io: &(dyn InterfaceIO + Send + Sync)) {
        trace!("saving wallet");
        io.save_wallet(wallet).await.unwrap();
        trace!("wallet saved");
    }

    pub async fn reset(
        &mut self,
        _storage: &mut Storage,
        network: Option<&Network>,
        keep_keys: bool,
    ) {
        info!("resetting wallet");
        if !keep_keys {
            let keys = generate_keys();
            self.public_key = keys.0;
            self.private_key = keys.1;
        }

        self.pending_txs.clear();
        self.available_balance = 0;
        self.slips.clear();
        self.unspent_slips.clear();
        self.staking_slips.clear();
        if let Some(network) = network {
            network
                .io_interface
                .send_interface_event(InterfaceEvent::WalletUpdate());
        }
    }

    /// [private_key - 32 bytes]
    /// [public_key - 33 bytes]
    pub fn serialize_for_disk(&self) -> Vec<u8> {
        let mut vbytes: Vec<u8> = vec![];

        vbytes.extend(&self.private_key);
        vbytes.extend(&self.public_key);

        // TODO : should we write key list here for rust nodes ?

        vbytes
    }

    /// [private_key - 32 bytes]
    /// [public_key - 33 bytes]
    pub fn deserialize_from_disk(&mut self, bytes: &[u8]) {
        self.private_key = bytes[0..32].try_into().unwrap();
        self.public_key = bytes[32..65].try_into().unwrap();
    }

    pub fn on_chain_reorganization(
        &mut self,
        block: &Block,
        lc: bool,
        genesis_period: BlockId,
    ) -> WalletUpdateStatus {
        let mut wallet_changed = WALLET_NOT_UPDATED;
        debug!("tx count : {}", block.transactions.len());
        let mut tx_index = 0;
        if lc {
            for tx in block.transactions.iter() {
                //
                // outputs
                //
                let mut i = 0;
                while i < tx.to.len() {
                    let output = &tx.to[i];
                    //
                    // if the output is a bound slip, then we are expecting
                    // the 2nd slip to be NORMAL and the 3rd slip to be another
                    // bound slip.
                    //

                    //
                    // is this an NFT ?
                    //
                    // note that we do not need to validate that the NFT meets the
                    // criteria here as we only process blocks that pass validation
                    // requirements. so we are just doing a superficial check to
                    // make sure that we will not be "skipping" any normal slips
                    // before inserting into the wallet
                    //
                    let is_this_an_nft = tx.is_nft(&tx.to, i);

                    //
                    // NFT slips are added to a separate data-storage space, so that
                    // they will not be affected by the normal workings of the wallet
                    //
                    if is_this_an_nft {
                        let slip1 = &tx.to[i];
                        let slip2 = &tx.to[i + 1];
                        let slip3 = &tx.to[i + 2];

                        //
                        // `nft_id` = UTXO key of the second bound slip (`slip2`)
                        //
                        // Use it to:
                        // 1. Reconstruct the original UTXO via `parse_slip_from_utxokey(nft_id)`,
                        //    since its public key packs block ID, tx ID, and slip index.
                        // 2. Transfer the NFT by passing only `nft_id`, which lets us pull
                        //    the three slips (slip1, linked slip, slip2) for `create_send_bound()`.
                        //
                        let nft = NFT {
                            slip1: slip1.utxoset_key,       // bound
                            slip2: slip2.utxoset_key,       // normal
                            slip3: slip3.utxoset_key,       // bound
                            id: slip2.utxoset_key.to_vec(), // derive NFT id from second Bound slip’s key
                            tx_sig: tx.signature,
                        };
                        self.nfts.push(nft);

                        i += 3;
                    } else {
                        //
                        // normal transaction
                        //
                        if output.amount > 0 && output.public_key == self.public_key {
                            wallet_changed |= WALLET_UPDATED;
                            self.add_slip(block.id, tx_index, output, true, None);
                        }

                        i += 1;
                    }
                }

                //
                // inputs
                //
                let mut i = 0;
                while i < tx.from.len() {
                    let input = &tx.from[i];

                    //
                    // if the output is a bound slip, then we are expecting
                    // the 2nd slip to be NORMAL and the 3rd slip to be another
                    // bound slip.
                    //
                    let is_this_an_nft = tx.is_nft(&tx.from, i);

                    //
                    // NFT slips are removed from the existing NFT storage
                    // area, as we have received new versions and need to
                    // update our NFT storage.
                    //
                    if is_this_an_nft == true {
                        if i == 0 && input.slip_type == SlipType::Bound && tx.from.len() >= 3 {
                            let nft_id = &tx.from[2].utxoset_key;

                            if let Some(pos) =
                                self.nfts.iter().position(|nft| nft.id == nft_id.to_vec())
                            {
                                self.nfts.remove(pos);
                                debug!(
                                    "Send-bound NFT input group detected. Removed NFT with id: {:?}",
                                    nft_id.to_hex()
                                );
                            }
                        }

                        i += 3;
                    } else {
                        //
                        // otherwise we have a normal transaction
                        //

                        //
                        // normal slip must be addressed to us
                        //
                        if input.public_key == self.public_key {
                            //
                            // with non-zero amount
                            //
                            if input.amount > 0 {
                                wallet_changed |= WALLET_UPDATED;
                                self.delete_slip(input, None);
                            }

                            //
                            // also delete from pending
                            //
                            if self.delete_pending_transaction(tx) {
                                wallet_changed |= WALLET_UPDATED;
                            }
                        }

                        i += 1;
                    }
                }

                if let TransactionType::SPV = tx.transaction_type {
                    tx_index += tx.txs_replacements as u64;
                } else {
                    tx_index += 1;
                }

                if block.id > genesis_period {
                    self.remove_old_slips(block.id - genesis_period);
                }
            }
        } else {
            //
            // we're unwinding (block not in longest chain),
            // so outputs → delete, inputs → add, NFT logic reversed
            //
            for tx in block.transactions.iter() {
                //
                // outputs (reverse of lc’s outputs)
                //
                let mut i = 0;
                while i < tx.to.len() {
                    let output = &tx.to[i];

                    let is_this_an_nft = tx.is_nft(&tx.to, i);

                    if is_this_an_nft {
                        //
                        // remove from NFT storage
                        //
                        let slip2 = &tx.to[i + 1];
                        let nft_id = slip2.utxoset_key.to_vec();
                        if let Some(pos) = self.nfts.iter().position(|n| n.id == nft_id) {
                            self.nfts.remove(pos);
                            debug!(
                                "Unwound NFT output group, removed id: {:?}",
                                slip2.utxoset_key.to_hex()
                            );
                        }
                        i += 3;
                    } else {
                        //
                        // normal output → delete
                        //
                        if output.amount > 0 && output.public_key == self.public_key {
                            wallet_changed |= WALLET_UPDATED;
                            self.delete_slip(output, None);
                        }
                        i += 1;
                    }
                }

                //
                // inputs (reverse of lc’s inputs)
                //
                let mut i = 0;
                while i < tx.from.len() {
                    let input = &tx.from[i];

                    //
                    // NFT group check
                    //
                    let is_this_an_nft = tx.is_nft(&tx.from, i);

                    if is_this_an_nft {
                        //
                        // re-add old NFT
                        //
                        let slip1 = &tx.from[i];
                        let slip2 = &tx.from[i + 1];
                        let slip3 = &tx.from[i + 2];

                        let nft = NFT {
                            slip1: slip1.utxoset_key,
                            slip2: slip2.utxoset_key,
                            slip3: slip3.utxoset_key,
                            id: slip2.utxoset_key.to_vec(),
                            tx_sig: tx.signature,
                        };

                        self.nfts.push(nft);

                        debug!(
                            "Unwound NFT input group, re‑added id: {:?}",
                            slip2.utxoset_key.to_hex()
                        );

                        i += 3;
                    } else {
                        //
                        // normal input → add back
                        //
                        if input.amount > 0 && input.public_key == self.public_key {
                            wallet_changed |= WALLET_UPDATED;
                            self.add_slip(block.id, tx_index, input, true, None);
                        }
                        i += 1;
                    }
                }

                //
                // advance index exactly as in lc
                //
                if let TransactionType::SPV = tx.transaction_type {
                    tx_index += tx.txs_replacements as u64;
                } else {
                    tx_index += 1;
                }
            }
        }

        debug!("wallet changed ? {:?}", wallet_changed);

        wallet_changed
    }

    // removes all slips in block when pruned / deleted
    pub fn delete_block(&mut self, block: &Block) -> WalletUpdateStatus {
        let mut wallet_changed = WALLET_NOT_UPDATED;
        for tx in block.transactions.iter() {
            for input in tx.from.iter() {
                if input.public_key == self.public_key {
                    wallet_changed = WALLET_UPDATED;
                }
                self.delete_slip(input, None);
            }
            for output in tx.to.iter() {
                if output.amount > 0 {
                    self.delete_slip(output, None);
                }
            }
        }

        wallet_changed
    }

    pub fn remove_old_slips(&mut self, block_id: BlockId) {
        let mut keys_to_remove = vec![];
        for (key, slip) in self.slips.iter() {
            if slip.block_id < block_id {
                keys_to_remove.push(*key);
            }
        }

        for key in keys_to_remove {
            let slip = Slip::parse_slip_from_utxokey(&key).unwrap();
            debug!("removing old slip : {}", slip);
            self.delete_slip(&slip, None);
        }
    }

    pub fn add_slip(
        &mut self,
        block_id: u64,
        tx_index: u64,
        slip: &Slip,
        lc: bool,
        network: Option<&Network>,
    ) {
        if self.slips.contains_key(&slip.get_utxoset_key()) {
            debug!("wallet already has slip : {}", slip);
            return;
        }
        let mut wallet_slip = WalletSlip::new();
        assert_ne!(block_id, 0);
        wallet_slip.utxokey = slip.get_utxoset_key();
        wallet_slip.amount = slip.amount;
        wallet_slip.slip_index = slip.slip_index;
        wallet_slip.block_id = block_id;
        wallet_slip.tx_ordinal = tx_index;
        wallet_slip.lc = lc;
        wallet_slip.slip_type = slip.slip_type;

        if let SlipType::BlockStake = slip.slip_type {
            self.staking_slips.insert(wallet_slip.utxokey);
        } else if let SlipType::Bound = slip.slip_type {
        } else {
            self.available_balance += slip.amount;
            self.unspent_slips.insert(wallet_slip.utxokey);
        }

        trace!(
            "adding slip of type : {:?} with value : {:?} to wallet : {:?} \nslip : {}",
            wallet_slip.slip_type,
            wallet_slip.amount,
            wallet_slip.utxokey.to_hex(),
            Slip::parse_slip_from_utxokey(&wallet_slip.utxokey).unwrap()
        );
        self.slips.insert(wallet_slip.utxokey, wallet_slip);
        if let Some(network) = network {
            network
                .io_interface
                .send_interface_event(InterfaceEvent::WalletUpdate());
        }
    }

    pub fn delete_slip(&mut self, slip: &Slip, network: Option<&Network>) {
        trace!(
            "deleting slip : {:?} with value : {:?} from wallet",
            slip.utxoset_key.to_hex(),
            slip.amount
        );
        if let Some(removed_slip) = self.slips.remove(&slip.utxoset_key) {
            let in_unspent_list = self.unspent_slips.remove(&slip.utxoset_key);
            if in_unspent_list {
                self.available_balance -= removed_slip.amount;
            } else {
                self.staking_slips.remove(&slip.utxoset_key);
            }
            if let Some(network) = network {
                network
                    .io_interface
                    .send_interface_event(InterfaceEvent::WalletUpdate());
            }
        }
    }

    pub fn get_available_balance(&self) -> Currency {
        self.available_balance
    }

    pub fn get_unspent_slip_count(&self) -> u64 {
        self.unspent_slips.len() as u64
    }

    // the nolan_requested is omitted from the slips created - only the change
    // address is provided as an output. so make sure that any function calling
    // this manually creates the output for its desired payment
    pub fn generate_slips(
        &mut self,
        nolan_requested: Currency,
        network: Option<&Network>,
        latest_block_id: u64,
        genesis_period: u64,
    ) -> (Vec<Slip>, Vec<Slip>) {
        let mut inputs: Vec<Slip> = Vec::new();
        let mut nolan_in: Currency = 0;
        let mut nolan_out: Currency = 0;
        let my_public_key = self.public_key;

        // grab inputs
        let mut keys_to_remove = Vec::new();
        let mut unspent_slips;
        #[cfg(test)]
        {
            // this part is compiled for tests to make sure selected slips are predictable. otherwise we will get random slips from a hashset
            unspent_slips = self.unspent_slips.iter().collect::<Vec<&SaitoUTXOSetKey>>();
            unspent_slips.sort_by(|slip, slip2| {
                let slip = Slip::parse_slip_from_utxokey(slip).unwrap();
                let slip2 = Slip::parse_slip_from_utxokey(slip2).unwrap();
                slip.amount.cmp(&slip2.amount)
            });
        }
        #[cfg(not(test))]
        {
            unspent_slips = &self.unspent_slips;
        }

        for key in unspent_slips {
            let slip = self.slips.get_mut(key).expect("slip should be here");

            // Prevent using slips from blocks earlier than (latest_block_id - (genesis_period-1)
            if slip.block_id <= latest_block_id.saturating_sub(genesis_period - 1) {
                debug!("Balance in process of rebroadcasting. Please wait 2 blocks and retry...");
                continue;
            }

            if nolan_in >= nolan_requested {
                break;
            }

            nolan_in += slip.amount;

            let mut input = Slip::default();
            input.public_key = my_public_key;
            input.amount = slip.amount;
            input.block_id = slip.block_id;
            input.tx_ordinal = slip.tx_ordinal;
            input.slip_index = slip.slip_index;
            input.slip_type = slip.slip_type;
            inputs.push(input);

            slip.spent = true;
            self.available_balance -= slip.amount;

            trace!(
                "marking slip : {:?} with value : {:?} as spent",
                slip.utxokey.to_hex(),
                slip.amount
            );
            keys_to_remove.push(slip.utxokey);
        }

        for key in keys_to_remove {
            self.unspent_slips.remove(&key);
        }

        // create outputs
        if nolan_in > nolan_requested {
            nolan_out = nolan_in - nolan_requested;
        }

        if nolan_in < nolan_requested {
            warn!(
                "Trying to spend more than available. requested : {:?}, available : {:?}",
                nolan_requested, nolan_in
            );
        }

        let mut outputs: Vec<Slip> = Vec::new();
        // add change address
        let output = Slip {
            public_key: my_public_key,
            amount: nolan_out,
            ..Default::default()
        };
        outputs.push(output);

        // ensure not empty
        if inputs.is_empty() {
            let input = Slip {
                public_key: my_public_key,
                amount: 0,
                block_id: 0,
                tx_ordinal: 0,
                ..Default::default()
            };
            inputs.push(input);
        }
        if outputs.is_empty() {
            let output = Slip {
                public_key: my_public_key,
                amount: 0,
                block_id: 0,
                tx_ordinal: 0,
                ..Default::default()
            };
            outputs.push(output);
        }
        if let Some(network) = network {
            network
                .io_interface
                .send_interface_event(InterfaceEvent::WalletUpdate());
        }

        (inputs, outputs)
    }

    pub fn sign(&self, message_bytes: &[u8]) -> SaitoSignature {
        sign(message_bytes, &self.private_key)
    }

    pub async fn create_bound_transaction(
        &mut self,
        nft_input_amount: Currency,   // amount in input slip creating NFT
        nft_uuid_block_id: u64,       // block_id in input slip creating NFT
        nft_uuid_transaction_id: u64, // transaction_id in input slip creating NFT
        nft_uuid_slip_id: u64,        // slip_id in input slip creating NFT
        nft_create_deposit_amt: Currency, // AMOUNT to deposit in slip2 (output)
        nft_data: Vec<u32>,           // DATA field to attach to TX
        recipient: &SaitoPublicKey,   // receiver
        network: Option<&Network>,
        latest_block_id: u64,
        genesis_period: u64,
        nft_type: String,
    ) -> Result<Transaction, Error> {
        let mut transaction = Transaction::default();
        transaction.transaction_type = TransactionType::Bound;

        //
        // all NFTs have a UUID that is created from the UTXO slip that the
        // creator selects as an input value. this is because each slip is
        // guaranteed to be unique, which means that the NFT is guaranteed
        // to be unique -- no-one else will be able to create an NFT with
        // the same values.
        //
        // here we recreate the input slip given the values provided to us
        // by the application calling this function. this slip is expected
        // to be valid. if it is not we will error-out.
        //
        let input_slip = Slip {
            public_key: self.public_key,         // Wallet's own public key (creator)
            amount: nft_input_amount,            // The amount from the provided input UTXO
            block_id: nft_uuid_block_id,         // Block id from the NFT UUID parameters
            slip_index: nft_uuid_slip_id as u8,  // Slip index from the NFT UUID parameters
            tx_ordinal: nft_uuid_transaction_id, // Transaction ordinal from the NFT UUID parameters
            ..Default::default()
        };

        //
        // now we compute the unique UTXO key for the input slip. since every
        // slip will have a unique UTXO key, this is the UUID for the NFT. by
        // assigning each NFT the UUID from the slip that is used to create it,
        // we ensure that each NFT will have an unforgeable ID.
        //
        let utxo_key = input_slip.get_utxoset_key(); // Compute the unique UTXO key for the input slip

        //
        // check that our wallet has this slip available. this check avoids
        // issues where the slip we are using to create our NFT has already
        // been spent for some reason. note that this is a safety check for
        // US rather than a security check for the network, since double-spends
        // are not possible, so users cannot "re-spend" UTXO to create
        // duplicate NFTs after their initial NFTs have been created.
        //
        if !self.unspent_slips.contains(&utxo_key) {
            info!("UTXO Key not found: {:?}", utxo_key);
            return Err(Error::new(
                ErrorKind::NotFound,
                format!("UTXO not found: {:?}", utxo_key),
            ));
        }

        //
        // CREATE-NFTs Transactions have the following structure
        //
        // input slip #1 -- provides UUID
        //
        // output slip #1 -- special NFT slip #1
        // output slip #2 -- normal slip
        // output slip #3 -- special NFT slip #2
        // output slip #4, #5 -- change addresses etc.
        //
        // the special NFT slips #1 and #3 are formatted in a way that their "publickey"
        // does not contain the publickey of the holder, but the information necessary
        // to recreate the original NFT UUID (i.e. the slip that was originally spent
        // to create the NFT.
        //
        // specifically, note that UTXOs have the following format:
        //
        // public_key (33 bytes)
        // block_id (8 bytes)
        // transaction_id (8 bytes)
        // slip_id (1 byte)
        // amount (8 bytes)
        // type (1 byte)
        //
        // as UTXO are transferred between addresses (and loop around the chain) the
        // block_id, slip_id and transaction_id all need to be updated. this is why
        // we require NFTs to have TWO bound slips -- the first provides the
        // publickey of the original NFT UUID slip. the second re-purposes the publickey
        // space to provide the original block_id, transaction_id, and slip_id.
        //
        // if the NFT is fractional, the "amount" of the NFT is stored in the first
        // slip. the second slip should always have an amount of 0. the amounts in
        // these two slips will never be interpreted as L1 SAITO tokens, and cannot
        // be used to pay network fees, etc.
        //
        // these two slips can then move around the network (updating their block,
        // transaction and slip IDS as they are transferred) without our losing the
        // ability to recreate the original slip regardless of how many times they
        // have been transferred, split or merged.
        //

        //
        // Output [0] - slip 1
        //
        // since we are creating the NFT, we set ourselves as the publickey of the
        // first output slip, since this will also be the publickey that is in the
        // input slip that we are spending to create the NFT.
        //
        let output_slip1 = Slip {
            public_key: self.public_key,
            amount: nft_create_deposit_amt,
            slip_type: SlipType::Bound,
            ..Default::default()
        };

        //
        // Output [1] - slip2
        //
        // the second slip is a normal output which will need to be spent in order
        // to move the NFT, and will loop around the chain with it, paying any
        // rebroadcasting fees and receiving any ATR payout.
        //
        // the publickey is set to the address of whoever will own the NFT that we
        // create here.
        //
        let output_slip2 = Slip {
            public_key: *recipient,
            amount: nft_create_deposit_amt,
            ..Default::default()
        };

        //
        // Output [2] - slip3
        //
        // our third slip is another "bound" NFT slip that will be unspendable unless
        // moved together with the slip2. since slip1 contains the publickey of the
        // original UTXO that was spent to create the transaction, this slip re-uses
        // the publickey data-field to store the other necessary information.
        //
        //   - "nft_uuid_data" consists:
        //
        //       • 8 bytes of nft_uuid_block_id,
        //       • 8 bytes of nft_uuid_transaction_id,
        //       • 1 byte of nft_uuid_slip_id (totaling 17 bytes)
        //       • 16 bytes padded by remainder of recipient's public key
        //
        // the transaction includes a copy of the NFT UUID at the head of the
        // transaction MSG field. Whenever the NFT is send between addresses
        // this field is recreated using the two non-normal bound slips that
        // encode the UTXO that was used to create the NFT originally.
        //
        // accordingly, we merge these fields into a new "publickey"
        //

        let uuid_pubkey = Wallet::create_nft_uuid(&input_slip, &nft_type);

        //
        // and create the slip with this "artificially-created" publickey
        //
        let output_slip3 = Slip {
            public_key: uuid_pubkey,
            amount: 0,
            slip_type: SlipType::Bound,
            ..Default::default()
        };

        //
        // change slip
        //
        // we now examine the inputs (and the amount that slip2 contains
        // to determine if we need to add additional inputs/outputs to provide
        // more SAITO to the NFT or to capture any surplus amount as a change
        // address.
        //
        let mut additional_input_slips: Vec<Slip> = Vec::new();
        let mut change_slip_opt: Option<Slip> = None;

        //
        // too much money? we need a change address
        //
        if nft_input_amount > nft_create_deposit_amt {
            let change_slip_amt = nft_input_amount - nft_create_deposit_amt;
            change_slip_opt = Some(Slip {
                public_key: self.public_key, // Return the change to the creator's address
                amount: change_slip_amt,
                slip_type: SlipType::Normal,
                ..Default::default()
            });

        //
        // too little money? we need extra inputs + change address
        //
        } else if nft_input_amount < nft_create_deposit_amt {
            let additional_needed = nft_create_deposit_amt - nft_input_amount;
            let (generated_inputs, generated_outputs) =
                self.generate_slips(additional_needed, network, latest_block_id, genesis_period);
            additional_input_slips = generated_inputs;
            if let Some(first_generated_output) = generated_outputs.into_iter().next() {
                change_slip_opt = Some(first_generated_output);
            } else {
                return Err(Error::new(
                    ErrorKind::Other,
                    "Failed to generate change slip via generate_slips",
                ));
            }
        }

        //
        // now we create the transaction...
        //
        // ... add inputs
        //
        transaction.add_from_slip(input_slip);
        for slip in additional_input_slips {
            transaction.add_from_slip(slip);
        }

        //
        // ... add outputs
        //
        transaction.add_to_slip(output_slip1);
        transaction.add_to_slip(output_slip2);
        transaction.add_to_slip(output_slip3);

        //
        // ... add change slip
        //
        if let Some(change) = change_slip_opt {
            transaction.add_to_slip(change);
        }

        //
        // ... hash and sign
        //
        let hash_for_signature: SaitoHash = hash(&transaction.serialize_for_signature());
        transaction.hash_for_signature = Some(hash_for_signature);
        transaction.sign(&self.private_key);

        //
        // ...and return
        //
        Ok(transaction)
    }

    pub async fn create_send_bound_transaction(
        &mut self,
        nft_amount: Currency,
        slip1_utxokey: SaitoUTXOSetKey,
        slip2_utxokey: SaitoUTXOSetKey,
        slip3_utxokey: SaitoUTXOSetKey,
        nft_data: Vec<u32>,
        recipient_public_key: &SaitoPublicKey,
    ) -> Result<Transaction, Error> {
        //
        // create our Bound-type transaction for this transfer
        //
        let mut transaction = Transaction::default();
        transaction.transaction_type = TransactionType::Bound;

        //
        // locate NFT from our repository of NFT slips
        //
        let pos = self
            .nfts
            .iter()
            .position(|nft| {
                nft.slip1 == slip1_utxokey
                    && nft.slip2 == slip2_utxokey
                    && nft.slip3 == slip3_utxokey
            })
            .ok_or_else(|| Error::new(ErrorKind::NotFound, "NFT not found"))?;
        let old_nft = self.nfts.remove(pos);

        //
        //
        // extract the 3 input slips
        //
        // slip #1 - bound
        // slip #2 - normal
        // slip #3 - bound
        //
        // validation rules require all three slips to move together in order
        // for an NFT transfer to be considered valid by network rules. lucky
        // for us, our NFT repository stores this information.
        //
        let input_slip1 = Slip::parse_slip_from_utxokey(&slip1_utxokey)?;
        let input_slip2 = Slip::parse_slip_from_utxokey(&slip2_utxokey)?;
        let input_slip3 = Slip::parse_slip_from_utxokey(&slip3_utxokey)?;

        //
        // generate the 3 output slips
        //
        let output_slip1 = input_slip1.clone();
        let mut output_slip2 = input_slip2.clone();
        let output_slip3 = input_slip3.clone();

        //
        // update recipient of output_slip2
        //
        output_slip2.public_key = recipient_public_key.clone();

        //
        // add slips
        //
        transaction.add_from_slip(input_slip1.clone());
        transaction.add_from_slip(input_slip2.clone());
        transaction.add_from_slip(input_slip3.clone());
        transaction.add_to_slip(output_slip1);
        transaction.add_to_slip(output_slip2);
        transaction.add_to_slip(output_slip3);

        //
        // finalize transaction
        //
        let hash_for_signature: SaitoHash = hash(&transaction.serialize_for_signature());
        transaction.hash_for_signature = Some(hash_for_signature);
        transaction.sign(&self.private_key);
        let tx_sig = transaction.signature.clone();

        Ok(transaction)
    }

    //
    // Constructs a 33-byte “UUID” for an NFT based on:
    //   1. The unique coordinates of the UTXO slip used to mint the NFT
    //      (block ID, transaction ordinal, slip index)
    //   2. A short, up-to-16‑byte string identifier (`nft_type`) that lets
    //      us tag or categorize the NFT.
    //
    // By embedding both pieces of data in a fixed 33-byte array, we ensure:
    //  The NFT is globally unique (no two UTXOs share the same coords)
    //  We carry along an easy-to-read type tag in the final bytes
    //
    // Layout of the 33 bytes:
    //   [0..8)   = block ID (8 bytes, big-endian)
    //   [8..16)  = tx ordinal (8 bytes, big-endian)
    //   [16]     = slip index (1 byte)
    //   [17..33) = `nft_type` string (up to 16 bytes, UTF‑8; padded or truncated)
    //
    pub fn create_nft_uuid(input_slip: &Slip, nft_type: &str) -> [u8; 33] {
        //
        // 1: Encode the UTXO coordinates (17 bytes total)
        // Every slip in the blockchain is uniquely identified by:
        //   which block it came from (block_id)
        //   the index of the transaction within that block (tx_ordinal)
        //   which slip number inside that transaction (slip_index)
        //
        // By concatenating these, we get a 17-byte “fingerprint” that no
        // one else can duplicate unless they somehow create an identical UTXO.
        //
        let mut uuid = Vec::with_capacity(33);
        uuid.extend(&input_slip.block_id.to_be_bytes()); //  8 bytes
        uuid.extend(&input_slip.tx_ordinal.to_be_bytes()); //  8 bytes
        uuid.push(input_slip.slip_index); //  1 byte

        //
        // 2: Embed the `nft_type` label into the remaining 16 bytes
        // We take the UTF‑8 bytes of the provided `nft_type` string, then:
        //  If it’s shorter than 16 bytes, pad with zeros (null bytes).
        //  If it’s longer, truncate to the first 16 bytes.
        //
        // This way, anyone reading the UUID can extract those final bytes
        // categorizing the NFT.
        //
        let mut tbytes = nft_type.as_bytes().to_vec();
        if tbytes.len() < 16 {
            // Pad with zero bytes to reach exactly 16
            tbytes.resize(16, 0);
        } else if tbytes.len() > 16 {
            // Truncate to the first 16 bytes
            tbytes.truncate(16);
        }
        uuid.extend(&tbytes); // Now uuid.len() == 17 + 16 = 33

        //
        // 3: At this point, `uuid` is exactly 33 bytes long. We can safely
        // turn it into a `[u8; 33]` for use as a Slip.public_key.
        //
        uuid.try_into().expect("NFT UUID must be exactly 33 bytes")
    }

    pub async fn create_golden_ticket_transaction(
        golden_ticket: GoldenTicket,
        public_key: &SaitoPublicKey,
        private_key: &SaitoPrivateKey,
    ) -> Transaction {
        let mut transaction = Transaction::default();

        // for now we'll use bincode to de/serialize
        transaction.transaction_type = TransactionType::GoldenTicket;
        transaction.data = golden_ticket.serialize_for_net();

        let mut input1 = Slip::default();
        input1.public_key = *public_key;
        input1.amount = 0;
        input1.block_id = 0;
        input1.tx_ordinal = 0;

        let mut output1 = Slip::default();
        output1.public_key = *public_key;
        output1.amount = 0;
        output1.block_id = 0;
        output1.tx_ordinal = 0;

        transaction.add_from_slip(input1);
        transaction.add_to_slip(output1);

        let hash_for_signature: SaitoHash = hash(&transaction.serialize_for_signature());
        transaction.hash_for_signature = Some(hash_for_signature);

        transaction.sign(private_key);

        transaction
    }
    pub fn add_to_pending(&mut self, tx: Transaction) {
        assert_eq!(tx.from.first().unwrap().public_key, self.public_key);
        assert_ne!(tx.transaction_type, TransactionType::GoldenTicket);
        assert!(tx.hash_for_signature.is_some());
        self.pending_txs.insert(tx.hash_for_signature.unwrap(), tx);
    }

    pub fn delete_pending_transaction(&mut self, tx: &Transaction) -> bool {
        let hash = tx.hash_for_signature.unwrap();
        if self.pending_txs.remove(&hash).is_some() {
            true
        } else {
            // debug!("Transaction not found in pending_txs");
            false
        }
    }

    pub fn update_from_balance_snapshot(
        &mut self,
        snapshot: BalanceSnapshot,
        network: Option<&Network>,
    ) {
        // need to reset balance and slips to avoid failing integrity from forks
        self.unspent_slips.clear();
        self.slips.clear();
        self.available_balance = 0;

        snapshot.slips.iter().for_each(|slip| {
            assert_ne!(slip.utxoset_key, [0; UTXO_KEY_LENGTH]);
            let wallet_slip = WalletSlip {
                utxokey: slip.utxoset_key,
                amount: slip.amount,
                block_id: slip.block_id,
                tx_ordinal: slip.tx_ordinal,
                lc: true,
                slip_index: slip.slip_index,
                spent: false,
                slip_type: slip.slip_type,
            };
            let result = self.slips.insert(slip.utxoset_key, wallet_slip);
            if result.is_none() {
                self.unspent_slips.insert(slip.utxoset_key);
                self.available_balance += slip.amount;
                info!("slip key : {:?} with value : {:?} added to wallet from snapshot for address : {:?}",
                    slip.utxoset_key.to_hex(),
                    slip.amount,
                    slip.public_key.to_base58());
            } else {
                info!(
                    "slip with utxo key : {:?} was already available",
                    slip.utxoset_key.to_hex()
                );
            }
        });

        if let Some(network) = network {
            network
                .io_interface
                .send_interface_event(InterfaceEvent::WalletUpdate());
        }
    }
    pub fn set_key_list(&mut self, key_list: Vec<SaitoPublicKey>) {
        self.key_list = key_list;
    }

    pub fn create_staking_transaction(
        &mut self,
        staking_amount: Currency,
        latest_unlocked_block_id: BlockId,
        last_valid_slips_in_block_id: BlockId,
    ) -> Result<Transaction, Error> {
        debug!(
            "creating staking transaction with amount : {:?}",
            staking_amount
        );

        let mut transaction: Transaction = Transaction {
            transaction_type: TransactionType::BlockStake,
            ..Default::default()
        };

        let (inputs, outputs) = self.find_slips_for_staking(
            staking_amount,
            latest_unlocked_block_id,
            last_valid_slips_in_block_id,
        )?;

        for input in inputs {
            transaction.add_from_slip(input);
        }
        for output in outputs {
            transaction.add_to_slip(output);
        }

        let hash_for_signature: SaitoHash = hash(&transaction.serialize_for_signature());
        transaction.hash_for_signature = Some(hash_for_signature);

        transaction.sign(&self.private_key);

        Ok(transaction)
    }

    fn find_slips_for_staking(
        &mut self,
        staking_amount: Currency,
        latest_unlocked_block_id: BlockId,
        last_valid_slips_in_block_id: BlockId,
    ) -> Result<(Vec<Slip>, Vec<Slip>), std::io::Error> {
        debug!(
            "finding slips for staking : {:?} latest_unblocked_block_id: {:?} staking_slip_count: {:?}",
            staking_amount, latest_unlocked_block_id, self.staking_slips.len()
        );

        let mut selected_staking_inputs: Vec<Slip> = vec![];
        let mut collected_amount: Currency = 0;
        let mut unlocked_slips_to_remove = vec![];

        for key in self.staking_slips.iter() {
            let slip = self.slips.get(key).unwrap();
            if !slip.is_staking_slip_unlocked(latest_unlocked_block_id) {
                // slip cannot be used for staking yet
                continue;
            }
            if slip.block_id < last_valid_slips_in_block_id {
                // slip is too old
                continue;
            }

            collected_amount += slip.amount;

            unlocked_slips_to_remove.push(*key);
            selected_staking_inputs.push(slip.to_slip());

            if collected_amount >= staking_amount {
                // we have enough staking slips
                break;
            }
        }

        let mut should_break_slips = false;
        if collected_amount < staking_amount {
            debug!("not enough funds in staking slips. searching in normal slips. current_balance : {:?}", self.available_balance);
            let required_from_unspent_slips = staking_amount - collected_amount;
            let mut collected_from_unspent_slips: Currency = 0;
            let mut unspent_slips_to_remove = vec![];

            let mut unspent_slips = self.unspent_slips.iter().collect::<Vec<&SaitoUTXOSetKey>>();
            unspent_slips.sort_by(|slip, slip2| {
                let slip = Slip::parse_slip_from_utxokey(slip).unwrap();
                let slip2 = Slip::parse_slip_from_utxokey(slip2).unwrap();
                slip2.amount.cmp(&slip.amount)
            });
            for key in unspent_slips {
                let slip = self.slips.get(key).unwrap();

                collected_from_unspent_slips += slip.amount;

                selected_staking_inputs.push(slip.to_slip());
                unspent_slips_to_remove.push(*key);

                if collected_from_unspent_slips >= required_from_unspent_slips {
                    // if we only have a single slip, and we access it for staking, we need to break it into multiple slips
                    should_break_slips = self.unspent_slips.len() == 1;
                    break;
                }
            }

            if collected_from_unspent_slips < required_from_unspent_slips {
                warn!("insufficient funds to stake block. requested: {:?}, collected: {:?} required_from_unspent: {:?}",
                    staking_amount,collected_amount,required_from_unspent_slips);
                warn!("wallet balance : {:?}", self.available_balance);
                return Err(Error::from(ErrorKind::NotFound));
            }

            for key in unspent_slips_to_remove {
                self.unspent_slips.remove(&key);
            }
            collected_amount += collected_from_unspent_slips;
            self.available_balance -= collected_from_unspent_slips;
        }

        for key in unlocked_slips_to_remove {
            self.staking_slips.remove(&key);
        }

        let mut outputs = vec![];

        let mut output: Slip = Default::default();
        output.amount = staking_amount;
        output.slip_type = SlipType::BlockStake;
        output.public_key = self.public_key;
        outputs.push(output);

        if collected_amount > staking_amount {
            let amount = collected_amount - staking_amount;
            let mut remainder = amount;
            let mut slip_count = 1;
            if should_break_slips {
                slip_count = 2;
            }
            {
                let mut output: Slip = Default::default();
                output.amount = amount / slip_count;
                remainder -= output.amount;
                output.slip_type = SlipType::Normal;
                output.public_key = self.public_key;
                outputs.push(output);
            }
            if remainder > 0 {
                let mut output: Slip = Default::default();
                output.amount = remainder;
                output.slip_type = SlipType::Normal;
                output.public_key = self.public_key;
                outputs.push(output);
            }
        }

        Ok((selected_staking_inputs, outputs))
    }

    pub fn get_nft_list(&self) -> Vec<DetailedNFT> {
        self.nfts
            .iter()
            .map(|nft| {
                //
                // parse each utxokey back into a Slip
                //
                let s1 = Slip::parse_slip_from_utxokey(&nft.slip1)
                    .expect("bound utxokey must parse to Slip");
                let s2 = Slip::parse_slip_from_utxokey(&nft.slip2)
                    .expect("normal utxokey must parse to Slip");
                let s3 = Slip::parse_slip_from_utxokey(&nft.slip3)
                    .expect("bound utxokey must parse to Slip");

                DetailedNFT {
                    id: nft.id.clone(),
                    tx_sig: nft.tx_sig,
                    slip1: s1,
                    slip2: s2,
                    slip3: s3,
                }
            })
            .collect()
    }

    pub fn add_nft(
        &mut self,
        slip1: SaitoUTXOSetKey,
        slip2: SaitoUTXOSetKey,
        slip3: SaitoUTXOSetKey,
        id: Vec<u8>,
        tx_sig: SaitoSignature,
    ) {
        let nft = NFT {
            slip1,
            slip2,
            slip3,
            id,
            tx_sig,
        };
        self.nfts.push(nft);

        info!("wallet nfts: {:?}", self.nfts);
    }
}

impl WalletSlip {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        WalletSlip {
            utxokey: [0; UTXO_KEY_LENGTH],
            amount: 0,
            block_id: 0,
            tx_ordinal: 0,
            lc: true,
            slip_index: 0,
            spent: false,
            slip_type: SlipType::Normal,
        }
    }

    /// Checks if this staking slip is unlocked and can be used again
    ///
    /// # Arguments
    ///
    /// * `latest_unlocked_block_id`: latest block id for which the staking slips are unlocked
    ///
    /// returns: bool True if this is a staking slip AND can be staked again
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn is_staking_slip_unlocked(&self, latest_unlocked_block_id: BlockId) -> bool {
        matches!(self.slip_type, SlipType::BlockStake) && self.block_id <= latest_unlocked_block_id
    }

    fn to_slip(&self) -> Slip {
        Slip::parse_slip_from_utxokey(&self.utxokey)
            .expect("since we already have a wallet slip, utxo key should be valid")
    }
}

impl Display for WalletSlip {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "WalletSlip : utxokey : {:?}, amount : {:?}, block_id : {:?}, tx_ordinal : {:?}, lc : {:?}, slip_index : {:?}, spent : {:?}, slip_type : {:?}", self.utxokey.to_hex(), self.amount, self.block_id, self.tx_ordinal, self.lc, self.slip_index, self.spent, self.slip_type)
    }
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::SaitoPublicKey;
    use crate::core::io::storage::Storage;
    use crate::core::util::crypto::generate_keys;
    use crate::core::util::test::test_manager::test::TestManager;

    use super::*;

    #[test]
    fn wallet_new_test() {
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);
        assert_ne!(wallet.public_key, [0; 33]);
        assert_ne!(wallet.private_key, [0; 32]);
        assert_eq!(wallet.serialize_for_disk().len(), WALLET_SIZE);
    }

    // tests value transfer to other addresses and verifies the resulting utxo hashmap
    #[tokio::test]
    #[serial_test::serial]
    async fn wallet_transfer_to_address_test() {
        let mut t = TestManager::default();
        t.initialize(100, 100000).await;

        let mut last_param = 120000;

        let public_keys = [
            "s8oFPjBX97NC2vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR",
            "s9adoFPjBX972vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR",
            "s223oFPjBX97NC2bmE5Kd2oHWUShuSTUuZwSB1U4wsPR",
        ];

        for &public_key_string in &public_keys {
            let public_key = Storage::decode_str(public_key_string).unwrap();
            let mut to_public_key: SaitoPublicKey = [0u8; 33];
            to_public_key.copy_from_slice(&public_key);
            t.transfer_value_to_public_key(to_public_key, 500, last_param)
                .await
                .unwrap();
            let balance_map = t.balance_map().await;
            let their_balance = *balance_map.get(&to_public_key).unwrap();
            assert_eq!(500, their_balance);

            last_param += 120000;
        }

        let my_balance = t.get_balance().await;

        let expected_balance = 10000000 - 500 * public_keys.len() as u64; // 500 is the amount transferred each time
        assert_eq!(expected_balance, my_balance);
    }

    // Test if transfer is possible even with issufficient funds
    #[tokio::test]
    #[serial_test::serial]
    async fn transfer_with_insufficient_funds_failure_test() {
        // pretty_env_logger::init();
        let mut t = TestManager::default();
        t.initialize(100, 200_000_000_000_000).await;
        let public_key_string = "s8oFPjBX97NC2vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR";
        let public_key = Storage::decode_str(public_key_string).unwrap();
        let mut to_public_key: SaitoPublicKey = [0u8; 33];
        to_public_key.copy_from_slice(&public_key);

        // Try transferring more than what the wallet contains
        let result = t
            .transfer_value_to_public_key(to_public_key, 200_000_000_000_000_000, 120000)
            .await;
        assert!(result.is_err());
    }

    // tests transfer of exact amount
    #[tokio::test]
    #[serial_test::serial]
    async fn test_transfer_with_exact_funds() {
        // pretty_env_logger::init();
        let mut t = TestManager::default();
        {
            let mut blockchain = t.blockchain_lock.write().await;
            blockchain.social_stake_requirement = 0;
        }
        t.initialize(1, 500).await;

        let public_key_string = "s8oFPjBX97NC2vbm9E5Kd2oHWUShuSTUuZwSB1U4wsPR";
        let public_key = Storage::decode_str(public_key_string).unwrap();
        let mut to_public_key: SaitoPublicKey = [0u8; 33];
        to_public_key.copy_from_slice(&public_key);

        t.transfer_value_to_public_key(to_public_key, 500, 120000)
            .await
            .unwrap();

        let balance_map = t.balance_map().await;

        let their_balance = *balance_map.get(&to_public_key).unwrap();
        assert_eq!(500, their_balance);
        let my_balance = t.get_balance().await;
        assert_eq!(0, my_balance);
    }

    #[test]
    fn wallet_serialize_and_deserialize_test() {
        let keys = generate_keys();
        let wallet1 = Wallet::new(keys.1, keys.0);
        let keys = generate_keys();
        let mut wallet2 = Wallet::new(keys.1, keys.0);
        let serialized = wallet1.serialize_for_disk();
        wallet2.deserialize_from_disk(&serialized);
        assert_eq!(wallet1, wallet2);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn find_staking_slips_with_normal_slips() {
        let t = TestManager::default();

        let mut wallet = t.wallet_lock.write().await;

        let mut slip = Slip {
            public_key: wallet.public_key,
            amount: 1_000_000,
            slip_type: SlipType::Normal,
            ..Slip::default()
        };
        slip.generate_utxoset_key();
        wallet.add_slip(1, 1, &slip, true, Some(&t.network));
        assert_eq!(wallet.available_balance, 1_000_000);

        let result = wallet.find_slips_for_staking(1_000_000, 1, 0);
        assert!(result.is_ok());
        let (inputs, outputs) = result.unwrap();
        assert_eq!(inputs.len(), 1);
        assert_eq!(outputs.len(), 1);
        assert_eq!(outputs[0].amount, 1_000_000);
        assert_eq!(outputs[0].slip_type, SlipType::BlockStake);

        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 0);
        assert_eq!(wallet.available_balance, 0);

        let result = wallet.find_slips_for_staking(1_000, 2, 0);
        assert!(result.is_err());

        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 0);

        let mut slip = Slip {
            public_key: wallet.public_key,
            amount: 1_000,
            ..Slip::default()
        };
        slip.generate_utxoset_key();
        wallet.add_slip(1, 2, &slip, true, Some(&t.network));

        let result = wallet.find_slips_for_staking(1_000_000, 2, 0);
        assert!(result.is_err());
        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 1);
    }
    #[tokio::test]
    #[serial_test::serial]
    async fn find_staking_slips_with_normal_slips_with_extra_funds() {
        let t = TestManager::default();

        let mut wallet = t.wallet_lock.write().await;

        let mut slip = Slip {
            public_key: wallet.public_key,
            amount: 2_500_000,
            slip_type: SlipType::Normal,
            ..Slip::default()
        };
        slip.generate_utxoset_key();
        wallet.add_slip(1, 1, &slip, true, Some(&t.network));
        assert_eq!(wallet.available_balance, 2_500_000);

        let result = wallet.find_slips_for_staking(1_000_000, 1, 0);
        assert!(result.is_ok());
        let (inputs, outputs) = result.unwrap();
        assert_eq!(inputs.len(), 1);
        assert_eq!(outputs.len(), 3);
        assert_eq!(outputs[0].amount, 1_000_000);
        assert_eq!(outputs[0].slip_type, SlipType::BlockStake);

        assert_eq!(outputs[1].amount, 750_000);
        assert_eq!(outputs[1].slip_type, SlipType::Normal);

        assert_eq!(outputs[2].amount, 750_000);
        assert_eq!(outputs[2].slip_type, SlipType::Normal);

        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 0);
        assert_eq!(wallet.available_balance, 0);

        let result = wallet.find_slips_for_staking(1_000, 2, 0);
        assert!(result.is_err());

        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 0);

        let mut slip = Slip {
            public_key: wallet.public_key,
            amount: 1_000,
            ..Slip::default()
        };
        slip.generate_utxoset_key();
        wallet.add_slip(1, 2, &slip, true, Some(&t.network));

        let result = wallet.find_slips_for_staking(1_000_000, 2, 0);
        assert!(result.is_err());
        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 1);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn find_staking_slips_with_staking_slips() {
        let t = TestManager::default();

        let mut wallet = t.wallet_lock.write().await;

        let mut slip = Slip {
            public_key: wallet.public_key,
            amount: 1_000_000,
            slip_type: SlipType::BlockStake,
            ..Slip::default()
        };
        slip.generate_utxoset_key();
        wallet.add_slip(1, 1, &slip, true, Some(&t.network));
        assert_eq!(wallet.available_balance, 0);

        let result = wallet.find_slips_for_staking(1_000_000, 1, 0);
        assert!(result.is_ok());
        let (inputs, outputs) = result.unwrap();
        assert_eq!(inputs.len(), 1);
        assert_eq!(outputs[0].amount, 1_000_000);
        assert_eq!(outputs[0].slip_type, SlipType::BlockStake);

        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 0);
        assert_eq!(wallet.available_balance, 0);

        let result = wallet.find_slips_for_staking(1_000, 2, 0);
        assert!(result.is_err());

        assert_eq!(wallet.staking_slips.len(), 0);
        assert_eq!(wallet.unspent_slips.len(), 0);
    }

    // #[tokio::test]
    // #[serial_test::serial]
    // async fn save_and_restore_wallet_test() {
    //     info!("current dir = {:?}", std::env::current_dir().unwrap());
    //
    //     let _t = TestManager::new();
    //
    //     let keys = generate_keys();
    //     let mut wallet = Wallet::new(keys.1, keys.0);
    //     let public_key1 = wallet.public_key.clone();
    //     let private_key1 = wallet.private_key.clone();
    //
    //     let mut storage = Storage {
    //         io_interface: Box::new(TestIOHandler::new()),
    //     };
    //     wallet.save(&mut storage).await;
    //
    //     let keys = generate_keys();
    //     wallet = Wallet::new(keys.1, keys.0);
    //
    //     assert_ne!(wallet.public_key, public_key1);
    //     assert_ne!(wallet.private_key, private_key1);
    //
    //     wallet.load(&mut storage).await;
    //
    //     assert_eq!(wallet.public_key, public_key1);
    //     assert_eq!(wallet.private_key, private_key1);
    // }
}
