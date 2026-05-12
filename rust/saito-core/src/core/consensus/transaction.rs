use ahash::AHashSet;
use std::fmt::{Display, Formatter};
use std::io::{Error, ErrorKind};

use crate::core::consensus::blockchain::Blockchain;
use log::{debug, error, trace, warn};
use num_derive::FromPrimitive;
use num_traits::FromPrimitive;
use primitive_types::U256;
use serde::{Deserialize, Serialize};

use rayon::iter::{IndexedParallelIterator, IntoParallelRefIterator, ParallelIterator};

use crate::core::consensus::hop::{Hop, HOP_SIZE};
use crate::core::consensus::slip::{Slip, SlipType, SLIP_SIZE};
use crate::core::defs::{
    Currency, PrintForLog, SaitoHash, SaitoPrivateKey, SaitoPublicKey, SaitoSignature,
    SaitoUTXOSetKey, Timestamp, UtxoSet, UTXO_KEY_LENGTH,
};
use crate::core::util::crypto::{hash, sign, verify, verify_signature};
use crate::iterate;

pub const TRANSACTION_SIZE: usize = 93;

#[derive(Serialize, Deserialize, Debug, Copy, PartialEq, Clone, FromPrimitive)]
pub enum TransactionType {
    Normal = 0,
    /// Paying for the network
    Fee = 1,
    GoldenTicket = 2,
    ATR = 3,
    /// VIP transactions deprecated on mainnet
    Vip = 4,
    SPV = 5,
    /// Issues funds for an address at the start of the network
    Issuance = 6,
    BlockStake = 7,
    Bound = 8,
}

#[serde_with::serde_as]
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Transaction {
    // the bulk of the consensus transaction data
    pub timestamp: Timestamp,
    pub from: Vec<Slip>,
    pub to: Vec<Slip>,
    // #[serde(with = "serde_bytes")] TODO : check this for performance
    pub data: Vec<u8>,
    pub transaction_type: TransactionType,
    pub txs_replacements: u32,
    #[serde_as(as = "[_; 64]")]
    pub signature: SaitoSignature,
    pub path: Vec<Hop>,

    // hash used for merkle_root (does not include signature)
    pub hash_for_signature: Option<SaitoHash>,

    /// total nolan in input slips
    pub total_in: Currency,
    /// total nolan in output slips
    pub total_out: Currency,
    /// total fees
    pub total_fees: Currency,
    /// total work to creator
    pub total_work_for_me: Currency,
    /// cumulative fees for this tx-in-block
    pub cumulative_fees: Currency,
    #[serde(skip)]
    pub routed_from_peer_id: u64,
}

impl Display for Transaction {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "++++++++++++++++++++++++++++++++++++++++++++++++++")?;
        writeln!(
            f,
            "Tx : {{ type : {:?}, data_size : {:?}, timestamp : {:?}, signature : {:?}, hash : {:?}, total_in : {:?}, total_out : {:?}, total_fees : {:?}, total_work_for_me : {:?}, cumulative_fees : {:?}, from slips : count : {:?} }}",
            self.transaction_type,
            self.data.len(),
            self.timestamp,
            self.signature.to_hex(),
            self.hash_for_signature.unwrap_or_default().to_hex(),
            self.total_in,
            self.total_out,
            self.total_fees,
            self.total_work_for_me,
            self.cumulative_fees,
            self.from.len()
        )?;
        if !self.from.is_empty() {
            writeln!(f, "---------------------------------------------")?;
        }
        writeln!(f, " from slips : count : {:?}", self.from.len())?;
        for slip in self.from.iter() {
            writeln!(f, "{}", slip)?;
        }
        if !self.to.is_empty() {
            writeln!(f, "---------------------------------------------")?;
        }
        writeln!(f, " to slips : count : {:?}", self.to.len())?;
        for slip in self.to.iter() {
            writeln!(f, "{}", slip)?;
        }
        if !self.path.is_empty() {
            writeln!(f, "---------------------------------------------")?;
        }
        writeln!(f, " path :  length : {:?}", self.path.len())?;
        for hop in self.path.iter() {
            writeln!(f, "{}", hop)?;
        }
        writeln!(f, "}}")?;
        writeln!(f, "++++++++++++++++++++++++++++++++++++++++++++++++++")
    }
}

impl Default for Transaction {
    fn default() -> Self {
        Self {
            timestamp: 0,
            from: vec![],
            to: vec![],
            data: vec![],
            transaction_type: TransactionType::Normal,
            txs_replacements: 1,
            signature: [0; 64],
            hash_for_signature: None,
            path: vec![],
            total_in: 0,
            total_out: 0,
            total_fees: 0,
            total_work_for_me: 0,
            cumulative_fees: 0,
            routed_from_peer_id: 0,
        }
    }
}

impl Transaction {
    pub fn add_hop(
        &mut self,
        my_private_key: &SaitoPrivateKey,
        my_public_key: &SaitoPublicKey,
        to_public_key: &SaitoPublicKey,
    ) {
        debug_assert_ne!(my_public_key, to_public_key, "cannot add hop to self");
        let hop = Hop::generate(my_private_key, my_public_key, to_public_key, self);
        self.path.push(hop);
    }

    /// add input slip
    ///
    /// # Arguments
    ///
    /// * `input_slip`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn add_from_slip(&mut self, input_slip: Slip) {
        if self.from.len() < u8::MAX as usize {
            self.from.push(input_slip);
        } else {
            warn!("cannot add more input slips to the transaction");
        }
    }

    /// add output slip
    ///
    /// # Arguments
    ///
    /// * `output_slip`:
    ///
    /// returns: ()
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn add_to_slip(&mut self, output_slip: Slip) {
        if self.to.len() < u8::MAX as usize {
            self.to.push(output_slip);
        } else {
            warn!("cannot add more output slips to the transaction");
        }
    }

    ///
    ///
    /// # Arguments
    ///
    /// * `to_publickey`:
    /// * `with_amount`:
    ///
    /// returns: Transaction
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn create_issuance_transaction(
        to_public_key: SaitoPublicKey,
        with_amount: Currency,
    ) -> Transaction {
        let mut transaction = Transaction::default();
        transaction.transaction_type = TransactionType::Issuance;
        let mut output = Slip::default();
        output.public_key = to_public_key;
        output.amount = with_amount;
        output.slip_type = SlipType::Normal;
        transaction.add_to_slip(output);
        transaction
    }

    /// create rebroadcast transaction
    ///
    /// # Arguments
    ///
    /// * `transaction_to_rebroadcast`:
    /// * `output_slip_to_rebroadcast`:
    /// * `with_fee`:
    /// * `with_staking_subsidy`:
    ///
    /// returns: Transaction
    ///
    /// # Examples
    ///
    /// ```
    ///
    /// ```
    pub fn create_rebroadcast_transaction(
        transaction_to_rebroadcast: &Transaction,
        to_slip: Slip,
        from_slip: Slip,
    ) -> Transaction {
        debug!(
            "creating rebroadcast transaction \nfrom : {} \nto : {} \ntx_to_rebroadcast: {}",
            from_slip, to_slip, transaction_to_rebroadcast
        );
        let mut transaction = Transaction::default();

        transaction.transaction_type = TransactionType::ATR;

        // if this is the FIRST time we are rebroadcasting, we copy the
        // original transaction into the message field in serialized
        // form. this preserves the original message and its signature
        // in perpetuity.
        //
        // if this is the SECOND or subsequent rebroadcast, we do not
        // copy the ATR tx (no need for a meta-tx) and rather just update
        // the message field with the original transaction (which is
        // by definition already in the previous TX message space.
        if transaction_to_rebroadcast.transaction_type == TransactionType::ATR {
            transaction.data = transaction_to_rebroadcast.data.to_vec();
        } else {
            transaction.data = transaction_to_rebroadcast.serialize_for_net().to_vec();
        }

        transaction.add_from_slip(from_slip);

        // add the output slip
        debug_assert_eq!(to_slip.slip_type, SlipType::ATR);
        transaction.add_to_slip(to_slip);

        transaction.generate_total_fees(0, 0);

        // signature is the ORIGINAL signature. this transaction
        // will fail its signature check and then get analysed as
        // a rebroadcast transaction because of its transaction type.
        transaction.signature = transaction_to_rebroadcast.signature;

        debug!("generated rebroadcast transaction: {}", transaction);

        transaction
    }

    //
    // Create a single ATR transaction by rebroadcasting
    // exactly the 3 slips from `from_group` as inputs
    // and the 3 slips from `to_group` as outputs
    //
    pub fn create_rebroadcast_bound_transaction(
        transaction_to_rebroadcast: &Transaction,
        from_group: Vec<(Slip, Slip, Slip)>,
        to_group: Vec<(Slip, Slip, Slip)>,
    ) -> Transaction {
        let mut tx = Transaction::default();
        tx.transaction_type = TransactionType::ATR;

        //
        // Preserve original data on first rebroadcast, otherwise carry forward previous ATR data
        //
        tx.data = if transaction_to_rebroadcast.transaction_type == TransactionType::ATR {
            transaction_to_rebroadcast.data.clone()
        } else {
            transaction_to_rebroadcast.serialize_for_net()
        };

        //
        // Attach exactly the 3 “from” slips as inputs
        //
        for (slip1, slip2, slip3) in &from_group {
            tx.add_from_slip(slip1.clone());
            tx.add_from_slip(slip2.clone());
            tx.add_from_slip(slip3.clone());
        }

        //
        // Attach exactly the 3 “to” slips as outputs
        //
        for (slip1, slip2, slip3) in &to_group {
            tx.add_to_slip(slip1.clone());
            tx.add_to_slip(slip2.clone());
            tx.add_to_slip(slip3.clone());
        }

        //
        // Compute any fees (none by default for ATR)
        //
        tx.generate_total_fees(0, 0);

        //
        // Carry over the original signature so this will be recognized as a rebroadcast
        //
        tx.signature = transaction_to_rebroadcast.signature.clone();

        tx
    }

    //
    // removes utxoset entries when block is deleted
    //
    pub async fn delete(&self, utxoset: &mut UtxoSet) -> bool {
        self.from.iter().for_each(|input| {
            input.delete(utxoset);
        });
        self.to.iter().for_each(|output| {
            output.delete(utxoset);
        });

        true
    }

    /// Deserialize from bytes to a Transaction.
    /// [len of inputs - 4 bytes - u32]
    /// [len of outputs - 4 bytes - u32]
    /// [len of message - 4 bytes - u32]
    /// [len of path - 4 bytes - u32]
    /// [signature - 64 bytes - Secp25k1 sig]
    /// [timestamp - 8 bytes - u64]
    /// [transaction type - 1 byte]
    /// [input][input][input]...
    /// [output][output][output]...
    /// [message]
    /// [hop][hop][hop]...
    pub fn deserialize_from_net(bytes: &[u8]) -> Result<Transaction, Error> {
        // trace!(
        //     "deserializing tx from buffer with length : {:?}",
        //     bytes.len()
        // );
        if bytes.len() < TRANSACTION_SIZE {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let inputs_len: u32 = u32::from_be_bytes(
            bytes[0..4]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        if inputs_len > u8::MAX as u32 {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let outputs_len: u32 = u32::from_be_bytes(
            bytes[4..8]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        if outputs_len > u8::MAX as u32 {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let message_len: usize = u32::from_be_bytes(
            bytes[8..12]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        ) as usize;
        let path_len: usize = u32::from_be_bytes(
            bytes[12..16]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        ) as usize;
        let signature: SaitoSignature = bytes[16..80]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let timestamp: Timestamp = Timestamp::from_be_bytes(
            bytes[80..88]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let replaces_txs = u32::from_be_bytes(
            bytes[88..92]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let transaction_type: TransactionType =
            FromPrimitive::from_u8(bytes[92]).ok_or(Error::from(ErrorKind::InvalidData))?;
        let start_of_inputs = TRANSACTION_SIZE;
        let start_of_outputs = start_of_inputs + inputs_len as usize * SLIP_SIZE;
        let start_of_message = start_of_outputs + outputs_len as usize * SLIP_SIZE;
        let start_of_path = start_of_message + message_len;
        let mut inputs: Vec<Slip> = vec![];
        for n in 0..inputs_len {
            let start_of_data: usize = start_of_inputs + n as usize * SLIP_SIZE;
            let end_of_data: usize = start_of_data + SLIP_SIZE;
            let input = Slip::deserialize_from_net(
                &bytes
                    .get(start_of_data..end_of_data)
                    .ok_or(Error::other(
                        "failed reading inputs from transaction buffer",
                    ))?
                    .to_vec(),
            )?;
            inputs.push(input);
        }
        let mut outputs: Vec<Slip> = vec![];
        for n in 0..outputs_len {
            let start_of_data: usize = start_of_outputs + n as usize * SLIP_SIZE;
            let end_of_data: usize = start_of_data + SLIP_SIZE;
            let output = Slip::deserialize_from_net(
                &bytes
                    .get(start_of_data..end_of_data)
                    .ok_or(Error::other(
                        "failed reading outputs from transaction buffer",
                    ))?
                    .to_vec(),
            )?;
            outputs.push(output);
        }
        let message = bytes
            .get(start_of_message..start_of_message + message_len)
            .ok_or(Error::other(
                "failed reading message buffer from transaction",
            ))?
            .try_into()
            .or(Err(Error::other(
                "failed converting message buffer to a u8 vector",
            )))?;
        let mut path: Vec<Hop> = vec![];
        for n in 0..path_len {
            let start_of_data: usize = start_of_path + n * HOP_SIZE;
            let end_of_data: usize = start_of_data + HOP_SIZE;
            let hop = Hop::deserialize_from_net(
                &bytes
                    .get(start_of_data..end_of_data)
                    .ok_or(Error::other("failed reading hops from tx buffer"))?
                    .to_vec(),
            )?;
            path.push(hop);
        }

        let mut transaction = Transaction::default();
        transaction.timestamp = timestamp;
        transaction.from = inputs;
        transaction.to = outputs;
        transaction.data = message;
        transaction.txs_replacements = replaces_txs;
        transaction.transaction_type = transaction_type;
        transaction.signature = signature;
        transaction.path = path;
        Ok(transaction)
    }

    pub fn is_fee_transaction(&self) -> bool {
        self.transaction_type == TransactionType::Fee
    }
    pub fn is_staking_transaction(&self) -> bool {
        self.transaction_type == TransactionType::BlockStake
    }

    pub fn is_atr_transaction(&self) -> bool {
        self.transaction_type == TransactionType::ATR
    }

    pub fn is_normal_transaction(&self) -> bool {
        self.transaction_type == TransactionType::Normal
    }

    pub fn is_golden_ticket(&self) -> bool {
        self.transaction_type == TransactionType::GoldenTicket
    }

    pub fn is_issuance_transaction(&self) -> bool {
        self.transaction_type == TransactionType::Issuance
    }

    // generates
    //
    // when the block is created, block.generate() is called to fill in all the
    // dynamic data related to the block creator. that function in turn calls tx.generate()
    // to ensure that transaction data is generated properly. this includes:
    //
    // tx.hash -> needed to generate merkle root
    // tx.fees -> needed to calculate payouts
    // tx.work -> needed to confirm adequate routing work
    //
    pub fn generate(&mut self, public_key: &SaitoPublicKey, tx_index: u64, block_id: u64) -> bool {
        // ensure hash exists for signing
        self.generate_hash_for_signature();

        // nolan_in, nolan_out, total fees
        self.generate_total_fees(tx_index, block_id);

        // routing work for asserted public_key (creator)
        self.generate_total_work(public_key);

        true
    }

    // calculate cumulative fee share in block
    pub fn generate_cumulative_fees(&mut self, cumulative_fees: Currency) -> Currency {
        self.cumulative_fees = cumulative_fees + self.total_fees;
        self.cumulative_fees
    }

    // calculate total fees in block
    pub fn generate_total_fees(&mut self, tx_index: u64, block_id: u64) {
        // calculate nolan in / out, fees
        // generate utxoset key for every slip
        let nolan_in = self
            .from
            .iter_mut()
            .map(|slip| {
                slip.generate_utxoset_key();
                if let SlipType::Bound = slip.slip_type {
                    // we are not counting the value in Bound slips
                    return 0;
                }
                slip.amount
            })
            .sum::<Currency>();

        let nolan_out = self
            .to
            .iter_mut()
            .enumerate()
            .map(|(index, slip)| {
                if slip.slip_type != SlipType::ATR || slip.slip_type != SlipType::Bound {
                    slip.block_id = block_id;
                    slip.tx_ordinal = tx_index;
                    slip.slip_index = index as u8;
                }
                slip.generate_utxoset_key();
                if let SlipType::Bound = slip.slip_type {
                    // we are not counting the value in Bound slips
                    return 0;
                }
                slip.amount
            })
            .sum::<Currency>();

        self.total_in = nolan_in;
        self.total_out = nolan_out;
        self.total_fees = 0;

        //
        // note that this is not validation code, permitting this. we may have
        // some transactions that do insert NOLAN, such as during testing of
        // monetary policy. All sanity checks need to be in the validate()
        // function.
        //
        if nolan_in > nolan_out {
            self.total_fees = nolan_in - nolan_out;
        }
    }
    /// calculate cumulative routing work in block
    pub fn generate_total_work(&mut self, public_key: &SaitoPublicKey) {
        //
        // if there is no routing path, then the transaction contains
        // no usable work for producing a block, and any payout associated
        // with the transaction will simply be issued to the creator of
        // the transaction itself.
        //
        if self.path.is_empty() {
            self.total_work_for_me = 0;
            return;
        }

        // something is wrong if we are not the last routing node
        let last_hop = &self.path[self.path.len() - 1];
        if last_hop.to.ne(public_key) {
            trace!(
                "tx : {:?} last hop : {} is not current node : {}",
                self.signature.to_hex(),
                last_hop.to.to_base58(),
                public_key.to_base58()
            );
            self.total_work_for_me = 0;
            return;
        }

        let total_fees = self.total_fees;
        let mut routing_work_available_to_public_key = total_fees;

        //
        // first hop gets ALL the routing work, so we start
        // halving from the 2nd hop in the routing path
        //
        for i in 1..self.path.len() {
            // TODO : check if this check required here since txs already validated at this point
            if self.path[i].from != self.path[i - 1].to {
                self.total_work_for_me = 0;
                warn!(
                    "tx : {:?} from and to not matching. to : {:?} from : {:?}",
                    self.signature.to_hex(),
                    self.path[i - 1].to.to_base58(),
                    self.path[i].from.to_base58()
                );
                return;
            }

            // otherwise halve the work
            let half_of_routing_work: Currency = routing_work_available_to_public_key / 2;
            routing_work_available_to_public_key -= half_of_routing_work;
        }
        self.total_work_for_me = routing_work_available_to_public_key;
    }

    //
    // generate hash used for signing the tx
    //
    pub fn generate_hash_for_signature(&mut self) {
        if let TransactionType::SPV = self.transaction_type {
            self.hash_for_signature = Some(self.signature[0..32].to_vec().try_into().unwrap());
        } else {
            self.hash_for_signature = Some(hash(&self.serialize_for_signature()));
        }
    }

    pub fn get_winning_routing_node(&self, random_hash: SaitoHash) -> SaitoPublicKey {
        //
        // if there are no routing paths, we return the sender of
        // the payment, as they're got all the routing work by
        // definition. this is the edge-case where sending a tx
        // can make you money.
        //
        if self.path.is_empty() {
            return if !self.from.is_empty() {
                self.from[0].public_key
            } else {
                //
                // if there is no routing path and there are no FROM UTXO then this is a
                // fee transaction or issuance transaction. in these cases we choose to
                // graveyard the payout as this should encourage winners to move their
                // payouts, which reinforces the longest chain.
                [0; 33]
            };
        }

        // no winning transaction should have no fees unless the
        // entire block has no fees, in which case we have a block
        // without any fee-paying transactions.
        //
        // burn these fees for the sake of safety.
        //
        if self.total_fees == 0 {
            return [0; 33];
        }

        //
        // if we have a routing path, we calculate the total amount
        // of routing work that it is possible for this transaction
        // to contain (2x the fee).
        //
        // aggregate routing work is only calculated in this function
        // as it is only needed when determining payouts. it should
        // not be confused with total_work which represents the amount
        // of work available in the transaction itself.
        //
        let mut aggregate_routing_work: Currency = self.total_fees;
        let mut routing_work_this_hop: Currency = aggregate_routing_work;
        let mut work_by_hop: Vec<Currency> = vec![];
        work_by_hop.push(aggregate_routing_work);

        for _i in 1..self.path.len() {
            let new_routing_work_this_hop: Currency = routing_work_this_hop / 2;
            aggregate_routing_work += new_routing_work_this_hop;
            routing_work_this_hop = new_routing_work_this_hop;
            work_by_hop.push(aggregate_routing_work);
        }

        //
        // find winning routing node
        //
        let x = U256::from_big_endian(&random_hash);
        let z = U256::from_big_endian(&aggregate_routing_work.to_be_bytes());
        let zy = x.div_mod(z).1;
        let winning_routing_work_in_nolan: Currency = zy.low_u64();

        for i in 0..work_by_hop.len() {
            if winning_routing_work_in_nolan <= work_by_hop[i] {
                return self.path[i].to;
            }
        }

        warn!(
            "winning routing node not found in path; routing work calculations may be inconsistent"
        );
        [0; 33]
    }

    /// Runs when the chain is re-organized
    pub fn on_chain_reorganization(&self, utxoset: &mut UtxoSet, longest_chain: bool) {
        trace!(
            "tx reorg : {:?} with {} inputs and {} outputs",
            self.signature.to_hex(),
            self.from.len(),
            self.to.len()
        );
        let mut input_slip_spendable = true;
        let mut output_slip_spendable = false;

        if longest_chain {
            input_slip_spendable = false;
            output_slip_spendable = true;
        }

        self.from
            .iter()
            .for_each(|input| input.on_chain_reorganization(utxoset, input_slip_spendable));
        self.to
            .iter()
            .for_each(|output| output.on_chain_reorganization(utxoset, output_slip_spendable));
    }

    /// [len of inputs - 4 bytes - u32]
    /// [len of outputs - 4 bytes - u32]
    /// [len of message - 4 bytes - u32]
    /// [len of path - 4 bytes - u32]
    /// [signature - 64 bytes - Secp25k1 sig]
    /// [timestamp - 8 bytes - u64]
    /// [transaction type - 1 byte]
    /// [input][input][input]...
    /// [output][output][output]...
    /// [message]
    /// [hop][hop][hop]...
    pub fn serialize_for_net(&self) -> Vec<u8> {
        self.serialize_for_net_with_hop(None)
    }

    pub(crate) fn serialize_for_net_with_hop(&self, opt_hop: Option<Hop>) -> Vec<u8> {
        let mut path_len = self.path.len();
        if opt_hop.is_some() {
            path_len += 1;
        }
        if self.from.len() > u8::MAX as usize {
            error!("ERROR: transaction has too many inputs");
            return vec![];
        }
        if self.to.len() > u8::MAX as usize {
            error!("ERROR: transaction has too many outputs");
            return vec![];
        }
        let inputs = self
            .from
            .iter()
            .map(|slip| slip.serialize_for_net())
            .collect::<Vec<_>>()
            .concat();
        let outputs = self
            .to
            .iter()
            .map(|slip| slip.serialize_for_net())
            .collect::<Vec<_>>()
            .concat();
        let hops = self
            .path
            .iter()
            .map(|hop| hop.serialize_for_net())
            .collect::<Vec<_>>()
            .concat();

        let mut buffer: Vec<u8> = [
            (self.from.len() as u32).to_be_bytes().as_slice(),
            (self.to.len() as u32).to_be_bytes().as_slice(),
            (self.data.len() as u32).to_be_bytes().as_slice(),
            (path_len as u32).to_be_bytes().as_slice(),
            self.signature.as_slice(),
            self.timestamp.to_be_bytes().as_slice(),
            self.txs_replacements.to_be_bytes().as_slice(),
            (self.transaction_type as u8).to_be_bytes().as_slice(),
            inputs.as_slice(),
            outputs.as_slice(),
            self.data.as_slice(),
            hops.as_slice(),
        ]
        .concat();

        if let Some(hop) = opt_hop {
            buffer.extend(hop.serialize_for_net());
        }
        buffer
    }

    /// Returns the size of the serialized transaction buffer without serializing
    pub fn get_serialized_size(&self) -> usize {
        TRANSACTION_SIZE
            + (SLIP_SIZE * self.from.len())
            + (SLIP_SIZE * self.to.len())
            + (HOP_SIZE * self.path.len())
            + self.data.len()
    }

    pub fn serialize_for_signature(&self) -> Vec<u8> {
        // fastest known way that isn't bincode ??

        let inputs = self
            .from
            .iter()
            .map(|slip| slip.serialize_input_for_signature())
            .collect::<Vec<_>>()
            .concat();

        let outputs = self
            .to
            .iter()
            .map(|slip| slip.serialize_output_for_signature())
            .collect::<Vec<_>>()
            .concat();

        [
            self.timestamp.to_be_bytes().as_slice(),
            inputs.as_slice(),
            outputs.as_slice(),
            self.txs_replacements.to_be_bytes().as_slice(),
            (self.transaction_type as u32).to_be_bytes().as_slice(),
            self.data.as_slice(),
        ]
        .concat()
    }

    pub fn sign(&mut self, private_key: &SaitoPrivateKey) {
        // we set slip ordinals when signing
        for (i, output) in self.to.iter_mut().enumerate() {
            output.slip_index = i as u8;
        }

        let buffer = self.serialize_for_signature();
        let hash_for_signature = hash(&buffer);
        self.hash_for_signature = Some(hash_for_signature);
        self.signature = sign(&buffer, private_key);
    }

    pub fn validate(
        &self,
        utxoset: &UtxoSet,
        blockchain: &Blockchain,
        validate_against_utxo: bool,
    ) -> bool {
        //
        // there are various types of transactions which have different validation
        // requirements. the most significant difference is between transactions that
        // are implicit or created by the block producer (ATR / Fee) and transactions
        // that are created by users and must be cryptographically signed, etc...

        //
        // Fee Transactions are validated in block.validate() because they must match
        // the fee transaction that block.generate_consensus_values() would create given
        // the contents of the block. for this reason, and because there can only be
        // a single fee transaction per block, we do not need to do further work to
        // validate them here.
        //

        if self.from.len() > u8::MAX as usize {
            error!("ERROR: transaction has too many inputs");
            return false;
        }
        if self.to.len() > u8::MAX as usize {
            error!("ERROR: transaction has too many outputs");
            return false;
        }

        if self
            .from
            .iter()
            .map(|slip| slip.utxoset_key)
            .collect::<Vec<_>>()
            .len()
            != self.from.len()
        {
            error!("ERROR: transaction : {} has duplicate inputs", self);
            return false;
        }

        // Fee Transactions are validated in the block class. There can only
        // be one per block, and they are checked by ensuring the transaction hash
        // matches our self-generated safety check. We do not need to validate
        // their input slips as their input slips are records of what to do
        // when reversing/unwinding the chain and have been spent previously.
        if self.transaction_type == TransactionType::Fee {
            return true;
        }

        //
        // SPV transactions are "ghost" transactions which are included in SPV/lite-
        // blocks. these transactions are not permitted to create outputs, and are
        // not processed by full-nodes, so cannot be included in valid full-blocks
        // or consensus.
        //
        if self.transaction_type == TransactionType::SPV {
            if self.total_fees > 0 {
                error!("ERROR: SPV transaction contains invalid hash");
                return false;
            }

            return true;
        }

        //
        // BlockStake transactions are a special class of transactions that are
        // affixed to blocks in order to propose them. This is used to add a form
        // of "social slashing" -- attackers who wish to spend their own money in
        // a "joyride" attack can be slashed as needed if the network must be
        // forked to deal with problems created by malicious participants at low
        // levels of fee-throughput.
        //
        if let TransactionType::BlockStake = self.transaction_type {
            let mut total_stakes = 0;

            for slip in self.to.iter() {
                if !matches!(slip.slip_type, SlipType::BlockStake)
                    && !matches!(slip.slip_type, SlipType::Normal)
                {
                    error!("staking transaction outputs are not staking");
                    return false;
                }

                if matches!(slip.slip_type, SlipType::BlockStake) {
                    total_stakes += slip.amount;
                }
            }

            if total_stakes < blockchain.social_stake_requirement {
                warn!(
                    "Not enough funds staked. expected: {:?}, staked: {:?}",
                    blockchain.social_stake_requirement, total_stakes
                );
                return false;
            }

            let mut unique_keys: AHashSet<SaitoUTXOSetKey> = Default::default();

            if validate_against_utxo {
                for slip in self.from.iter() {
                    if slip.utxoset_key == [0; UTXO_KEY_LENGTH] {
                        error!("utxo set key is empty");
                        return false;
                    }
                    if !blockchain.is_slip_unlocked(&slip.utxoset_key) {
                        error!("slip is not unlocked. slip : {}", slip);
                        return false;
                    }
                    let utxo_slip = match Slip::parse_slip_from_utxokey(&slip.utxoset_key) {
                        Ok(s) => s,
                        Err(e) => {
                            error!("failed to parse utxoset_key during validation: {:?}", e);
                            return false;
                        }
                    };
                    if utxo_slip.amount != slip.amount {
                        error!(
                            "slip amount doesn't match with the utxo amount : {}. slip : {}",
                            utxo_slip.amount, slip
                        );
                        return false;
                    }

                    unique_keys.insert(slip.utxoset_key);
                }
                if unique_keys.len() != self.from.len() {
                    error!("same utxo is used twice in the transaction. unique count : {} from_slip count : {}. tx : {}", unique_keys.len(), self.from.len(), self.signature.to_hex());
                    // same utxo is used twice in the transaction
                    return false;
                }
            }

            return true;
        }

        //
        // User-Originated Transactions
        //
        // most transactions are identifiable by the public_key that
        // has signed their input transaction, but some transactions
        // do not have senders as they are auto-generated as part of
        // the block itself.
        //
        // ATR transactions
        // FEE transactions
        // ISSUANCE transactions
        //
        // the following validation rules cover user-originated txs
        // where we expect that the inputs are coming from valid
        // SAITO tokens that exist on the network.
        //
        // the first set of validation criteria is applied only to
        // validation criteria for the remaining classes of txs are
        // further down iin this function.
        //
        if self.transaction_type != TransactionType::ATR
            && self.transaction_type != TransactionType::Issuance
        {
            //
            // must have sender
            //
            if self.from.is_empty() {
                error!("ERROR 582039: less than 1 input in transaction");
                return false;
            }

            //
            // must have valid signature
            //
            // in order to validate the signature, we need to know which publickey
            // is supposed to have created it. extracting the right key is slightly
            // different for NFT transactions than normal ones, as BOUND / NFT txs
            // have their information stored in tuplies where slip2 contains the
            // publickey of the sender. So we are extracting the right publickey
            // here, as a prerequisite to validating the signature...
            //
            if let Some(hash_for_signature) = &self.hash_for_signature {
                let sig: SaitoSignature = self.signature;

                //
                // in order to check the for bound (NFT) txs, the "owner" is in the normal slip (slip2),
                //
                let public_key: SaitoPublicKey = if self.transaction_type == TransactionType::Bound
                {
                    //
                    // if this is a CREATE-bound transaction, the first input is Noral
                    //
                    let is_create = self.from[0].slip_type == SlipType::Normal
                        && self.to.len() >= 3
                        && self.to[0].slip_type == SlipType::Bound
                        && self.to[1].slip_type == SlipType::Normal
                        && self.to[2].slip_type == SlipType::Bound;

                    if is_create {
                        //
                        // return nft creator
                        //
                        self.from[0].public_key
                    } else {
                        //
                        // in SPLIT / MERGE / SEND sender is slip2 in first NFT tuplie
                        //
                        if self.from.len() < 3 {
                            return false;
                        }

                        let a = &self.from[0];
                        let b = &self.from[1];
                        let c = &self.from[2];

                        if !(a.slip_type == SlipType::Bound
                            && (b.slip_type == SlipType::Normal || b.slip_type == SlipType::ATR)
                            && c.slip_type == SlipType::Bound)
                        {
                            return false;
                        }

                        b.public_key
                    }
                } else {
                    //
                    // owner of first from slip is signer for everything else
                    //
                    self.from[0].public_key
                };

                //
                // we can now verify that the signature is valid...
                //
                if !verify_signature(hash_for_signature, &sig, &public_key) {
                    error!(
                        "tx verification failed : hash = {:?}, sig = {:?}, pub_key = {:?}",
                        hash_for_signature.to_hex(),
                        sig.to_hex(),
                        public_key.to_base58()
                    );
                    return false;
                }
            } else {
                //
                // we reach here if we have not already calculated the hash
                // that is checked by the signature. while we could auto-gen
                // it here, we choose to throw an error to raise visibility of
                // unexpected behavior.
                //
                error!("ERROR 757293: there is no hash for signature in a transaction");
                return false;
            }

            //
            // validate routing path sigs
            //
            // it strengthens censorship-resistance and anti-MEV properties in the network
            // if we refuse to let nodes include transactions that have not been routed to
            // them. nonetheless, while we may add this restriction, it will also mean that
            // the server will need to cryptographically sign the transactions that it is
            // sending to itself, so for now we accept transactions WITHOUT routing paths
            // but require that any transaction WITH a routing path must have a cryptograph-
            // ically valid path.
            //
            if !self.validate_routing_path() {
                error!("ERROR 482033: routing paths do not validate, transaction invalid");
                return false;
            }

            //
            // validate tokens are not created out of thin air
            //
            if self.total_out > self.total_in && self.transaction_type != TransactionType::Fee {
                error!("ERROR 802394: transaction spends more than it has available");
                return false;
            }
        }

        //
        // fee transactions
        //
        if self.transaction_type == TransactionType::Fee {}

        //
        // atr transactions
        //
        if self.transaction_type == TransactionType::ATR {}

        //
        // normal transactions
        //
        if self.transaction_type == TransactionType::Normal {}

        //
        // golden ticket transactions
        //
        if self.transaction_type == TransactionType::GoldenTicket {}

        //
        // NFT transactions (bound)
        //
        if self.transaction_type == TransactionType::Bound {
            //
            // the first thing we do is collect information about the NFT tuples
            // contained nft validation state
            //
            let mut nft_uuid: Option<SaitoPublicKey> = None;
            let mut nft_sender: Option<SaitoPublicKey> = None;
            let mut nft_amount_in: Currency = 0;
            let mut nft_amount_out: Currency = 0;
            let mut nft_tuples_in: usize = 0;
            let mut nft_tuples_out: usize = 0;
            let mut saito_amount_in: Currency = 0;
            let mut saito_amount_out: Currency = 0;

            //
            // input NFT tuples
            //
            let mut idx = 0;
            while idx + 2 < self.from.len() {
                let a = &self.from[idx];
                let b = &self.from[idx + 1];
                let c = &self.from[idx + 2];

                //
                // tuple found
                //
                if a.slip_type == SlipType::Bound
                    && (b.slip_type == SlipType::Normal || b.slip_type == SlipType::ATR)
                    && c.slip_type == SlipType::Bound
                {
                    //
                    // enforce that NFTs exist
                    //
                    if a.amount == 0 {
                        error!("3. bound tx invalid: nft slip1 input with zero-amount");
                        return false;
                    }

                    //
                    // enforce canonical tuple structure
                    //
                    if c.amount != 0 {
                        error!("bound tx invalid: tuple slip3 amount nonzero");
                        return false;
                    }

                    //
                    // enforce UUID consistency
                    //
                    let tuple_uuid = c.public_key;

                    match nft_uuid {
                        None => {
                            nft_uuid = Some(tuple_uuid);
                        }
                        Some(existing_uuid) => {
                            if existing_uuid != tuple_uuid {
                                error!("bound tx invalid: multiple nft uuids detected");
                                return false;
                            }
                        }
                    }

                    //
                    // no funny business
                    //
                    match nft_sender {
                        None => {
                            nft_sender = Some(b.public_key);
                        }
                        Some(existing_sender) => {
                            if existing_sender != b.public_key {
                                error!(
                                    "bound tx invalid: multiple nft from different owners detected"
                                );
                                return false;
                            }
                        }
                    }

                    //
                    // accumulate totals
                    //
                    nft_amount_in += a.amount;
                    saito_amount_in += b.amount;
                    nft_tuples_in += 1;

                    idx += 3;
                    continue;
                }

                //
                // no bound slips outside tuples allowed...
                //
                if a.slip_type == SlipType::Bound {
                    error!("bound tx invalid: malformed input tuple");
                    return false;
                }

                idx += 1;
            }

            //
            // output NFT tuples
            //
            let mut idx = 0;
            while idx + 2 < self.to.len() {
                let a = &self.to[idx];
                let b = &self.to[idx + 1];
                let c = &self.to[idx + 2];

                //
                // tuple found
                //
                if a.slip_type == SlipType::Bound
                    && (b.slip_type == SlipType::Normal || b.slip_type == SlipType::ATR)
                    && c.slip_type == SlipType::Bound
                {
                    //
                    // enforce that NFTs exist
                    //
                    if a.amount == 0 {
                        error!("2. bound tx invalid: nft slip1 input with zero-amount");
                        return false;
                    }

                    //
                    // enforce canonical tuple structure
                    //
                    if c.amount != 0 {
                        error!("bound tx invalid: tuple slip3 amount nonzero");
                        return false;
                    }

                    //
                    // enforce UUID consistency
                    //
                    let tuple_uuid = c.public_key;

                    match nft_uuid {
                        None => {
                            nft_uuid = Some(tuple_uuid);
                        }
                        Some(existing_uuid) => {
                            if existing_uuid != tuple_uuid {
                                error!("bound tx invalid: multiple nft uuids detected");
                                return false;
                            }
                        }
                    }

                    //
                    // accumulate totals
                    //
                    nft_amount_out += a.amount;
                    saito_amount_out += b.amount;
                    nft_tuples_out += 1;

                    idx += 3;
                    continue;
                }

                //
                // no more bound slips outside tuplies....
                //
                if a.slip_type == SlipType::Bound {
                    error!("bound tx invalid: malformed output tuple");
                    return false;
                }

                idx += 1;
            }

            //
            // the validation rules that apply to NFTs / Bound transactions depend
            // on whether the user is creating a new NFT or whether the transaction
            // is simplying transferring NFTs that have already been created. So...
            //

            //
            // is this a “new NFT”?
            //
            if nft_tuples_in == 0 && nft_tuples_out > 0 {
                //
                // at least one funding input
                //
                if self.from.is_empty() {
                    error!("Create-bound transaction: no funding input found");
                    return false;
                }

                //
                // that input is not SlipType::Bound
                //
                if self.from[0].slip_type == SlipType::Bound {
                    error!(
                        "Create-bound transaction: first input cannot be Bound (found {:?})",
                        self.from[0].slip_type
                    );
                    return false;
                }

                //
                // that input has non-zero Saito
                //
                if self.to[0].amount == 0 {
                    error!(
                        "Create-bound transaction: slip1 amount ({}) = 0",
                        self.to[0].amount
                    );
                    return false;
                }

                //
                // at least 1 output tuple exists
                //
                if nft_amount_out == 0 {
                    error!("Create-bound transaction: nft_amount_out must be > 0");
                    return false;
                }

                //
                // NFT UUID is set properly in output
                //
                let funding_input = &self.from[0];
                let parsed_nft_uuid: SaitoPublicKey = match nft_uuid {
                    Some(uuid) => uuid,
                    None => {
                        error!("Create-bound TX: missing NFT UUID in output tuple");
                        return false;
                    }
                };
                let mut expected_nft_uuid: SaitoPublicKey = parsed_nft_uuid;
                // bytes 0..8   = block_id
                expected_nft_uuid[0..8].copy_from_slice(&funding_input.block_id.to_be_bytes());
                // bytes 8..16  = tx_ordinal
                expected_nft_uuid[8..16].copy_from_slice(&funding_input.tx_ordinal.to_be_bytes());
                // byte 16      = slip_index
                expected_nft_uuid[16] = funding_input.slip_index;
                // bytes 17..33 = nft_type payload (already present in parsed_nft_uuid, preserved above)
                if expected_nft_uuid != parsed_nft_uuid {
                    error!(
                        "Create-bound TX: NFT UUID identifiers do not match consumed funding input"
                    );
                    return false;
                }

            //
            // this is an existing NFT
            //
            } else {
                //
                // nft amount conserved
                //
                if nft_amount_in != nft_amount_out {
                    error!("Bound TX invalid: NFT amount mismatch");
                    return false;
                }

                //
                // must consume at least one nft tuple
                //
                if nft_tuples_in == 0 {
                    error!("Bound TX invalid: no input NFT tuples");
                    return false;
                }

                //
                // must produce at least one nft tuple
                //
                if nft_tuples_out == 0 {
                    error!("Bound TX invalid: no output NFT tuples");
                    return false;
                }
            }
        } else {
            //
            // the only other type of transaction that is permitted to have Bound Slips
            // are ATR transactions.
            //
            if self.transaction_type != TransactionType::ATR {
                if self
                    .from
                    .iter()
                    .any(|slip| slip.slip_type == SlipType::Bound)
                    || self.to.iter().any(|slip| slip.slip_type == SlipType::Bound)
                {
                    error!("Non-ATR and Non-Bound Transaction has Bound UTXO");
                    return false;
                }
            }
        }

        //
        // the following validation criteria apply to all transactions, including
        // those auto-generated and included in blocks such as ATR transactions
        // and fee transactions.
        //

        //
        // all transactions must have outputs
        //
        if self.to.is_empty() {
            error!("ERROR 582039: less than 1 output in transaction");
            return false;
        }

        //
        // any UTXO spent must be spendable (in hashmap)
        //
        return if validate_against_utxo {
            let inputs_validate = self.validate_against_utxoset(utxoset);
            inputs_validate
        } else {
            true
        };
    }

    pub fn validate_against_utxoset(&self, utxoset: &UtxoSet) -> bool {
        if self.transaction_type == TransactionType::Fee
            || self.transaction_type == TransactionType::ATR
        {
            return true;
        }
        // if inputs exist, they must validate against the UTXOSET
        // if they claim to spend tokens. if the slip has no spendable
        // tokens it will pass this check, which is conducted inside
        // the slip-level validation logic.
        iterate!(self.from, 100).all(|input| input.validate(utxoset))
    }

    pub fn validate_routing_path(&self) -> bool {
        self.path.iter().enumerate().all(|(index, hop)| {
            let bytes: Vec<u8> = [self.signature.as_slice(), hop.to.as_slice()].concat();

            // check sig is valid
            if !verify(bytes.as_slice(), &hop.sig, &hop.from) {
                warn!("signature is not valid");
                return false;
            }

            if hop.from == hop.to {
                return false;
            }
            // check path is continuous
            if index > 0 && hop.from != self.path[index - 1].to {
                warn!(
                    "from {:?}: {:?} not matching with previous to {:?}: {:?}. path length = {:?}",
                    index,
                    hop.from.to_base58(),
                    index - 1,
                    self.path[index - 1].to.to_base58(),
                    self.path.len()
                );
                for hop in self.path.iter() {
                    debug!(
                        "hop : {:?} --> {:?}",
                        hop.from.to_base58(),
                        hop.to.to_base58()
                    );
                }
                return false;
            }
            true
        })
    }
    pub fn is_in_path(&self, public_key: &SaitoPublicKey) -> bool {
        if self.is_from(public_key) {
            return true;
        }
        for hop in &self.path {
            if hop.from.eq(public_key) {
                return true;
            }
        }
        false
    }
    pub fn is_from(&self, public_key: &SaitoPublicKey) -> bool {
        iterate!(self.from, 10).any(|input| input.public_key.eq(public_key))
    }
    pub fn is_to(&self, public_key: &SaitoPublicKey) -> bool {
        iterate!(self.to, 10).any(|slip| slip.public_key.eq(public_key))
    }

    //
    // Returns true if the given slice of slips at `i` forms a
    // Bound–Normal–Bound triple (an NFT group).
    //
    pub fn is_nft(&self, slips: &[Slip], i: usize) -> bool {
        if i + 2 >= slips.len() {
            return false;
        }
        let a = &slips[i];
        let b = &slips[i + 1];
        let c = &slips[i + 2];
        a.slip_type == SlipType::Bound
            && c.slip_type == SlipType::Bound
            && (b.slip_type == SlipType::Normal || b.slip_type == SlipType::ATR)
    }
}

#[cfg(test)]
mod tests {
    use crate::core::defs::{PrintForLog, SaitoPrivateKey, SaitoPublicKey};
    use crate::core::util::crypto::generate_keys;

    use super::*;

    #[test]
    fn transaction_new_test() {
        let tx = Transaction::default();
        assert_eq!(tx.timestamp, 0);
        assert_eq!(tx.from, vec![]);
        assert_eq!(tx.to, vec![]);
        assert_eq!(tx.data, Vec::<u8>::new());
        assert_eq!(tx.transaction_type, TransactionType::Normal);
        assert_eq!(tx.signature, [0; 64]);
        assert_eq!(tx.hash_for_signature, None);
        assert_eq!(tx.total_in, 0);
        assert_eq!(tx.total_out, 0);
        assert_eq!(tx.total_fees, 0);
        assert_eq!(tx.cumulative_fees, 0);
    }

    #[test]
    fn serialize_for_signature_test() {
        let tx = Transaction::default();
        assert_eq!(
            tx.serialize_for_signature(),
            vec![0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]
        );
    }

    #[test]
    fn serialize_for_signature_with_data_test() {
        let mut tx = Transaction::default();
        tx.timestamp = 1637034582;
        tx.transaction_type = TransactionType::ATR;
        tx.data = vec![
            123, 34, 116, 101, 115, 116, 34, 58, 34, 116, 101, 115, 116, 34, 125,
        ];

        let mut input_slip = Slip::default();
        input_slip.public_key = <SaitoPublicKey>::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8bcc",
        )
        .unwrap();
        input_slip.block_id = 0;
        input_slip.tx_ordinal = 0;
        input_slip.amount = 123;
        input_slip.slip_index = 10;
        input_slip.slip_type = SlipType::ATR;

        let mut output_slip = Slip::default();
        output_slip.public_key = <SaitoPublicKey>::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8bcc",
        )
        .unwrap();
        output_slip.block_id = 0;
        output_slip.tx_ordinal = 0;
        output_slip.amount = 345;
        output_slip.slip_index = 23;
        output_slip.slip_type = SlipType::Normal;

        tx.from.push(input_slip);
        tx.to.push(output_slip);

        // assert_eq!(
        //     tx.serialize_for_signature(),
        //     vec![
        //         0, 0, 1, 125, 38, 221, 98, 138, 220, 246, 204, 235, 116, 113, 127, 152, 195, 247,
        //         35, 148, 89, 187, 54, 253, 205, 143, 53, 14, 237, 191, 204, 251, 235, 247, 192,
        //         176, 22, 31, 205, 139, 204, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 123, 10,
        //         1, 220, 246, 204, 235, 116, 113, 127, 152, 195, 247, 35, 148, 89, 187, 54, 253,
        //         205, 143, 53, 14, 237, 191, 204, 251, 235, 247, 192, 176, 22, 31, 205, 139, 204, 0,
        //         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 89, 23, 0, 0, 0, 0, 1, 0, 0, 0, 3, 123,
        //         34, 116, 101, 115, 116, 34, 58, 34, 116, 101, 115, 116, 34, 125,
        //     ]
        // );
    }

    #[test]
    fn tx_sign_with_data() {
        let mut tx = Transaction::default();
        tx.timestamp = 1637034582;
        tx.transaction_type = TransactionType::ATR;
        tx.data = vec![
            123, 34, 116, 101, 115, 116, 34, 58, 34, 116, 101, 115, 116, 34, 125,
        ];

        let mut input_slip = Slip::default();
        input_slip.public_key = SaitoPublicKey::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8bcc",
        )
        .unwrap();
        input_slip.block_id = 0;
        input_slip.tx_ordinal = 0;
        input_slip.amount = 123;
        input_slip.slip_index = 10;
        input_slip.slip_type = SlipType::ATR;

        let mut output_slip = Slip::default();
        output_slip.public_key = SaitoPublicKey::from_hex(
            "dcf6cceb74717f98c3f7239459bb36fdcd8f350eedbfccfbebf7c0b0161fcd8bcc",
        )
        .unwrap();
        output_slip.block_id = 0;
        output_slip.tx_ordinal = 0;
        output_slip.amount = 345;
        output_slip.slip_index = 23;
        output_slip.slip_type = SlipType::Normal;

        tx.from.push(input_slip);
        tx.to.push(output_slip);

        tx.sign(
            &SaitoPrivateKey::from_hex(
                "854702489d49c7fb2334005b903580c7a48fe81121ff16ee6d1a528ad32f235d",
            )
            .unwrap(),
        );

        assert_eq!(tx.signature.len(), 64);
        // assert_eq!(
        //     tx.signature,
        //     [
        //         203, 125, 72, 56, 0, 215, 56, 221, 191, 48, 192, 230, 105, 221, 214, 165, 246, 220,
        //         45, 225, 64, 217, 69, 164, 26, 143, 154, 162, 121, 162, 244, 203, 30, 194, 204,
        //         166, 141, 17, 201, 156, 108, 170, 210, 112, 200, 93, 223, 59, 21, 157, 35, 107,
        //         104, 186, 159, 190, 28, 159, 119, 29, 99, 200, 241, 99
        //     ]
        // );
    }

    #[test]
    fn transaction_generate_cumulative_fees_test() {
        let mut tx = Transaction::default();
        tx.generate_cumulative_fees(1_0000);
        assert_eq!(tx.cumulative_fees, 1_0000);
    }

    #[test]
    fn serialize_for_net_and_deserialize_from_net_test() {
        let mock_input = Slip::default();
        let mock_output = Slip::default();
        let mock_hop = Hop::default();

        let mut mock_tx = Transaction::default();
        let mut mock_path: Vec<Hop> = vec![];
        mock_path.push(mock_hop);
        let ctimestamp = 0;

        mock_tx.timestamp = ctimestamp;
        mock_tx.add_from_slip(mock_input);
        mock_tx.add_to_slip(mock_output);
        mock_tx.data = vec![104, 101, 108, 108, 111];
        mock_tx.transaction_type = TransactionType::Normal;
        mock_tx.signature = [1; 64];
        mock_tx.path = mock_path;

        let serialized_tx = mock_tx.serialize_for_net();

        let deserialized_tx = Transaction::deserialize_from_net(&serialized_tx).unwrap();
        assert_eq!(mock_tx, deserialized_tx);
    }
    #[test]
    fn slip_count_test() {
        let mock_output = Slip::default();
        let mock_hop = Hop::default();
        let mut mock_tx = Transaction::default();
        for i in 0..1000 {
            let mut mock_input = Slip::default();
            mock_input.amount = i;
            mock_tx.from.push(mock_input);
        }
        for i in 0..1000 {
            let mut mock_output = Slip::default();
            mock_output.amount = i;
            mock_tx.to.push(mock_output);
        }

        let serialized_tx = mock_tx.serialize_for_net();
        assert_eq!(serialized_tx.len(), 0);
    }
}
