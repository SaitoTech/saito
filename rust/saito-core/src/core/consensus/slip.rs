use std::fmt::{Display, Formatter};
use std::io::{Error, ErrorKind};

use log::{debug, error, trace};
use num_derive::{FromPrimitive, ToPrimitive};
use num_traits::{FromPrimitive, ToPrimitive};
use serde::{Deserialize, Serialize};

use crate::core::defs::{
    Currency, PrintForLog, SaitoPublicKey, SaitoUTXOSetKey, UtxoSet, UTXO_KEY_LENGTH,
};

/// The size of a serialized slip in bytes.
pub const SLIP_SIZE: usize = 59;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Eq, PartialEq, FromPrimitive, ToPrimitive)]
pub enum SlipType {
    Normal = 0,
    ATR = 1,
    VipInput = 2,
    VipOutput = 3,
    MinerInput = 4,
    MinerOutput = 5,
    RouterInput = 6,
    RouterOutput = 7,
    BlockStake = 8,
    Bound = 9,
}

#[serde_with::serde_as]
#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct Slip {
    #[serde_as(as = "[_; 33]")]
    pub public_key: SaitoPublicKey,
    pub amount: Currency,
    pub slip_index: u8,
    pub block_id: u64,
    pub tx_ordinal: u64,
    pub slip_type: SlipType,
    #[serde_as(as = "[_; 59]")]
    pub utxoset_key: SaitoUTXOSetKey,
    // TODO : Check if this can be removed with Option<>
    pub is_utxoset_key_set: bool,
}
impl Display for Slip {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "Slip {{ key: {}, type: {:?}, amount: {}, location: {}-{}-{}, utxoset_key: {} }}",
            self.public_key.to_base58(),
            self.slip_type,
            self.amount,
            self.block_id,
            self.tx_ordinal,
            self.slip_index,
            self.utxoset_key.to_hex()
        )
    }
}
impl Default for Slip {
    fn default() -> Self {
        Self {
            public_key: [0; 33],
            amount: 0,
            slip_index: 0,
            block_id: 0,
            tx_ordinal: 0,
            slip_type: SlipType::Normal,
            // uuid: [0; 32],
            utxoset_key: [0; UTXO_KEY_LENGTH],
            is_utxoset_key_set: false,
        }
    }
}

impl Slip {
    /// runs when block is purged for good or staking slip deleted
    pub fn delete(&self, utxoset: &mut UtxoSet) -> bool {
        if self.get_utxoset_key() == [0; UTXO_KEY_LENGTH] {
            error!("ERROR 572034: asked to remove a slip without its utxoset_key properly set!");
            return false;
        }
        debug!("deleting slip from utxo : {}", self);
        utxoset.remove_entry(&self.get_utxoset_key());
        true
    }

    pub fn deserialize_from_net(bytes: &Vec<u8>) -> Result<Slip, Error> {
        if bytes.len() != SLIP_SIZE {
            return Err(Error::from(ErrorKind::InvalidInput));
        }
        let public_key: SaitoPublicKey = bytes[..33]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let amount: Currency = Currency::from_be_bytes(
            bytes[33..41]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let block_id: u64 = u64::from_be_bytes(
            bytes[41..49]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let tx_ordinal: u64 = u64::from_be_bytes(
            bytes[49..57]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        );
        let slip_index: u8 = bytes[57];
        let slip_type: SlipType =
            SlipType::from_u8(bytes[58]).ok_or(Error::from(ErrorKind::InvalidData))?;
        let mut slip = Slip::default();

        slip.public_key = public_key;
        slip.amount = amount;
        slip.block_id = block_id;
        slip.tx_ordinal = tx_ordinal;
        slip.slip_index = slip_index;
        slip.slip_type = slip_type;

        Ok(slip)
    }

    pub fn generate_utxoset_key(&mut self) {
        self.utxoset_key = self.get_utxoset_key();
        self.is_utxoset_key_set = true;
    }

    pub fn get_utxoset_key(&self) -> SaitoUTXOSetKey {
        [
            self.public_key.as_slice(),                               // length = 33
            self.block_id.to_be_bytes().as_slice(),                   // length = 8
            self.tx_ordinal.to_be_bytes().as_slice(),                 // length = 8
            self.slip_index.to_be_bytes().as_slice(),                 // length = 1
            self.amount.to_be_bytes().as_slice(),                     // length = 8
            self.slip_type.to_u8().unwrap().to_be_bytes().as_slice(), // length = 1
        ]
        .concat()
        .try_into()
        .unwrap()
    }

    pub fn parse_slip_from_utxokey(key: &SaitoUTXOSetKey) -> Result<Slip, Error> {
        let mut slip = Slip::default();
        slip.public_key = key[0..33].to_vec().try_into().unwrap();
        slip.block_id = u64::from_be_bytes(key[33..41].try_into().unwrap());
        slip.tx_ordinal = u64::from_be_bytes(key[41..49].try_into().unwrap());
        slip.slip_index = key[49];
        slip.amount = u64::from_be_bytes(key[50..58].try_into().unwrap());
        slip.slip_type = SlipType::from_u8(key[58]).ok_or(Error::from(ErrorKind::InvalidData))?;

        slip.utxoset_key = *key;
        slip.is_utxoset_key_set = true;

        Ok(slip)
    }

    pub fn on_chain_reorganization(&self, utxoset: &mut UtxoSet, spendable: bool) {
        if self.amount > 0 {
            if spendable {
                trace!(
                    "adding slip to utxo : {:?}-{:?}-{:?} with value : {:?} key: {:?}",
                    self.block_id,
                    self.tx_ordinal,
                    self.slip_index,
                    self.amount,
                    self.utxoset_key.to_hex()
                );
                utxoset.insert(self.utxoset_key, spendable);
            } else {
                trace!(
                    "removing slip from utxo : {:?}-{:?}-{:?} with value : {:?} key: {:?}",
                    self.block_id,
                    self.tx_ordinal,
                    self.slip_index,
                    self.amount,
                    self.utxoset_key.to_hex()
                );
                utxoset.remove(&self.utxoset_key);
            }
        }
    }

    pub fn serialize_for_net(&self) -> Vec<u8> {
        let bytes: Vec<u8> = [
            self.public_key.as_slice(),
            self.amount.to_be_bytes().as_slice(),
            self.block_id.to_be_bytes().as_slice(),
            self.tx_ordinal.to_be_bytes().as_slice(),
            self.slip_index.to_be_bytes().as_slice(),
            self.slip_type.to_u8().unwrap().to_be_bytes().as_slice(),
        ]
        .concat();
        assert_eq!(bytes.len(), SLIP_SIZE);
        bytes
    }

    pub fn serialize_input_for_signature(&self) -> Vec<u8> {
        [
            self.public_key.as_slice(),
            self.amount.to_be_bytes().as_slice(),
            // self.block_id.to_be_bytes().as_slice(),
            // self.tx_ordinal.to_be_bytes().as_slice(),
            self.slip_index.to_be_bytes().as_slice(),
            self.slip_type.to_u8().unwrap().to_be_bytes().as_slice(),
        ]
        .concat()
    }

    pub fn serialize_output_for_signature(&self) -> Vec<u8> {
        [
            self.public_key.as_slice(),
            self.amount.to_be_bytes().as_slice(),
            // self.block_id.to_be_bytes().as_slice(),
            // self.tx_ordinal.to_be_bytes().as_slice(),
            self.slip_index.to_be_bytes().as_slice(),
            self.slip_type.to_u8().unwrap().to_be_bytes().as_slice(),
        ]
        .concat()
    }

    pub fn validate(&self, utxoset: &UtxoSet) -> bool {
        if self.amount > 0 {
            match utxoset.get(&self.utxoset_key) {
                Some(value) => {
                    if *value {
                        true
                    } else {
                        // debug!() since method is used to check when cleaning up mempool
                        debug!(
                            "in utxoset but invalid: value is {} at {:?}, block : {:?} tx : {:?} index : {:?}",
                            *value,
                            self.utxoset_key.to_hex(),
                            self.block_id,
                            self.tx_ordinal,
                            self.slip_index
                        );
                        false
                    }
                }
                None => {
                    // debug!() since method is used to check when cleaning up mempool
                    debug!(
                        "not in utxoset so invalid. value is returned false: {:?} slip type : {:?} block : {:?} tx : {:?} index : {:?} and amount : {:?}",
                        self.utxoset_key.to_hex(),
                        self.slip_type,
                        self.block_id,
                        self.tx_ordinal,
                        self.slip_index,
                        self.amount
                    );
                    false
                }
            }
        } else {
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio::sync::RwLock;

    use crate::core::consensus::blockchain::Blockchain;
    use crate::core::consensus::wallet::Wallet;
    use crate::core::util::crypto::generate_keys;

    use super::*;

    #[test]
    fn slip_new_test() {
        let mut slip = Slip::default();
        assert_eq!(slip.public_key, [0; 33]);
        assert_eq!(slip.block_id, 0);
        assert_eq!(slip.tx_ordinal, 0);
        assert_eq!(slip.amount, 0);
        assert_eq!(slip.slip_type, SlipType::Normal);
        assert_eq!(slip.slip_index, 0);

        slip.public_key = [1; 33];
        assert_eq!(slip.public_key, [1; 33]);

        slip.amount = 100;
        assert_eq!(slip.amount, 100);

        slip.slip_index = 1;
        assert_eq!(slip.slip_index, 1);

        slip.slip_type = SlipType::MinerInput;
        assert_eq!(slip.slip_type, SlipType::MinerInput);
    }

    #[test]
    fn slip_serialize_for_signature_test() {
        let slip = Slip::default();
        assert_eq!(
            slip.serialize_input_for_signature(),
            vec![0; SLIP_SIZE - 16]
        );
        assert_eq!(
            slip.serialize_output_for_signature(),
            vec![0; SLIP_SIZE - 16]
        );
        assert_eq!(slip.serialize_for_net(), vec![0; SLIP_SIZE]);
    }

    #[test]
    fn slip_get_utxoset_key_test() {
        let mut slip = Slip::default();
        assert_eq!(slip.get_utxoset_key(), [0; UTXO_KEY_LENGTH]);

        slip.slip_type = SlipType::BlockStake;
        slip.amount = 123;
        slip.is_utxoset_key_set = true;
        slip.block_id = 10;
        slip.tx_ordinal = 20;
        slip.slip_index = 30;
        slip.public_key = [1; 33];

        let utxokey = slip.get_utxoset_key();

        let slip2 = Slip::parse_slip_from_utxokey(&utxokey).unwrap();

        assert_eq!(slip.slip_type, slip2.slip_type);
        assert_eq!(slip.amount, slip2.amount);
        assert!(slip2.is_utxoset_key_set);
        assert_eq!(slip.block_id, slip2.block_id);
        assert_eq!(slip.tx_ordinal, slip2.tx_ordinal);
        assert_eq!(slip.slip_index, slip2.slip_index);
        assert_eq!(slip.public_key, slip2.public_key);
    }

    #[test]
    fn slip_serialization_for_net_test() {
        let slip = Slip::default();
        let serialized_slip = slip.serialize_for_net();
        assert_eq!(serialized_slip.len(), SLIP_SIZE);
        let deserilialized_slip = Slip::deserialize_from_net(&serialized_slip).unwrap();
        assert_eq!(slip, deserilialized_slip);
        let result = Slip::deserialize_from_net(&vec![]);
        assert!(result.is_err());
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn slip_addition_and_removal_from_utxoset() {
        let keys = generate_keys();
        let wallet_lock = Arc::new(RwLock::new(Wallet::new(keys.1, keys.0)));
        let blockchain_lock = Arc::new(RwLock::new(Blockchain::new(
            wallet_lock.clone(),
            1000,
            0,
            60,
        )));
        let mut blockchain = blockchain_lock.write().await;

        let mut slip = Slip::default();
        slip.amount = 100_000;
        slip.block_id = 10;
        slip.tx_ordinal = 20;
        {
            let wallet = wallet_lock.read().await;
            slip.public_key = wallet.public_key;
        }
        slip.generate_utxoset_key();

        // add to utxoset
        slip.on_chain_reorganization(&mut blockchain.utxoset, true);
        assert!(blockchain.utxoset.contains_key(&slip.get_utxoset_key()));

        // remove from utxoset
        // TODO: Repair this test
        // slip.purge(&mut blockchain.utxoset);
        // assert_eq!(
        //     blockchain.utxoset.contains_key(&slip.get_utxoset_key()),
        //     false
        // );
    }
}
