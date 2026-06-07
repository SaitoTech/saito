use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::defs::{PrintForLog, SaitoUTXOSetKey};
use crate::core::util::crypto::{hash, verify_signature};
use serde_json::Value;

pub struct CheckOwn {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckOwn {
    pub fn validate(
        context: &Value,
        tx: Option<&Transaction>,
        _blk: Option<&Block>,
        blockchain: Option<&Blockchain>,
    ) -> u8 {
        let utxokey = context["script"]["utxokey"].as_str().unwrap_or("");
        if utxokey.is_empty() {
            return 0;
        }

        let mut is_slip_spendable = false;
        if let (Some(blockchain), Ok(key)) = (blockchain, SaitoUTXOSetKey::from_hex(utxokey)) {
            is_slip_spendable = blockchain.is_slip_unlocked(&key);
        }

        let mut sig_ok = false;
        if let Some(tx) = tx {
            let hash_for_signature = match tx.hash_for_signature {
                Some(h) => h,
                None => {
                    if matches!(tx.transaction_type, TransactionType::SPV) {
                        tx.signature[0..32].try_into().expect("signature prefix is 32 bytes")
                    } else {
                        hash(&tx.serialize_for_signature())
                    }
                }
            };

            if !hash_for_signature.iter().all(|&b| b == 0)
                && !tx.from.is_empty()
                && verify_signature(&hash_for_signature, &tx.signature, &tx.from[0].public_key)
            {
                sig_ok = true;
            }
        }

        // JS: return (is_slip_spendable && sig_ok) || true;
        let _ = (is_slip_spendable, sig_ok);
        1
    }
}
