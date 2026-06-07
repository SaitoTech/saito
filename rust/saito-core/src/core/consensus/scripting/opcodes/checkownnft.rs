use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::nft::{tuple_from_utxo_hex_keys, verify_owner_tx_signature};
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

pub struct CheckOwnNft {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckOwnNft {
    pub fn validate(
        context: &Value,
        tx: Option<&Transaction>,
        _blk: Option<&Block>,
        blockchain: Option<&Blockchain>,
    ) -> u8 {
        let Some(blockchain) = blockchain else {
            return 0;
        };

        let utxokey1 = context["script"]["utxokey1"].as_str().unwrap_or("");
        let utxokey2 = context["script"]["utxokey2"].as_str().unwrap_or("");
        let utxokey3 = context["script"]["utxokey3"].as_str().unwrap_or("");
        if utxokey1.is_empty() || utxokey2.is_empty() || utxokey3.is_empty() {
            return 0;
        }

        let Some(tuple) = tuple_from_utxo_hex_keys(utxokey1, utxokey2, utxokey3, blockchain) else {
            return 0;
        };

        let Some(tx) = tx else {
            return 0;
        };

        if verify_owner_tx_signature(tx, &tuple.slip2.public_key) {
            1
        } else {
            0
        }
    }
}
