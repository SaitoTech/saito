use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::nft::{tuple_from_utxo_hex_keys, verify_owner_tx_signature};
use crate::core::consensus::slip::Slip;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoUTXOSetKey};
use log::info;
use serde_json::Value;

pub struct CheckOwnNft {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckOwnNft {
    fn request_id(tx: Option<&Transaction>) -> String {
        match tx {
            Some(t) => {
                let hex = t.signature.to_hex();
                if hex.len() >= 6 {
                    hex[..6].to_string()
                } else {
                    hex
                }
            }
            None => "no-tx".to_string(),
        }
    }

    fn log_slip(prefix: &str, slip: &Slip) {
        info!(
            "{} block={} tx={} slip={} type={:?} amount={}",
            prefix, slip.block_id, slip.tx_ordinal, slip.slip_index, slip.slip_type, slip.amount
        );
    }

    pub fn validate(
        context: &Value,
        tx: Option<&Transaction>,
        _blk: Option<&Block>,
        blockchain: Option<&Blockchain>,
    ) -> u8 {
        let req_id = Self::request_id(tx);
        info!("[CHECKOWNNFT {}] starting validation", req_id);

        let Some(blockchain) = blockchain else {
            info!("[CHECKOWNNFT {}] validation failed", req_id);
            return 0;
        };

        let utxokey1 = context["witness"]["utxokey1"].as_str().unwrap_or("");
        let utxokey2 = context["witness"]["utxokey2"].as_str().unwrap_or("");
        let utxokey3 = context["witness"]["utxokey3"].as_str().unwrap_or("");
        if utxokey1.is_empty() || utxokey2.is_empty() || utxokey3.is_empty() {
            info!("[CHECKOWNNFT {}] validation failed", req_id);
            return 0;
        }

        let Some(tuple) = tuple_from_utxo_hex_keys(utxokey1, utxokey2, utxokey3) else {
            info!("[CHECKOWNNFT {}] tuple construction failed", req_id);
            return 0;
        };

        let key1 = tuple.slip1.utxoset_key;
        let key2 = tuple.slip2.utxoset_key;

        Self::log_slip(
            &format!("[CHECKOWNNFT {}] checking key1", req_id),
            &tuple.slip1,
        );

        if !blockchain.is_slip_unlocked(&key1) {
            info!("[CHECKOWNNFT {}] key1 not unlocked", req_id);
            return 0;
        }

        if tuple.slip2.amount > 0 {
            Self::log_slip(
                &format!("[CHECKOWNNFT {}] checking key2", req_id),
                &tuple.slip2,
            );

            if !blockchain.is_slip_unlocked(&key2) {
                info!("[CHECKOWNNFT {}] key2 not unlocked", req_id);
                return 0;
            }
        }

        if let Some(tx) = tx {
            if verify_owner_tx_signature(tx, &tuple.slip2.public_key) {
                info!("[CHECKOWNNFT {}] validation succeeded", req_id);
                1
            } else {
                info!("[CHECKOWNNFT {}] owner signature invalid", req_id);
                0
            }
        } else {
            info!("[CHECKOWNNFT {}] missing transaction", req_id);
            0
        }
    }
}
