use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
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
        _blockchain: Option<&Blockchain>,
    ) -> u8 {
        let Some(tx) = tx else {
            return 0;
        };
        if tx.from.is_empty() {
            return 0;
        }

        let nftid = context["script"]["nftid"].as_str().unwrap_or("");
        if nftid.is_empty() {
            return 0;
        }

        let witness = &context["witness"];
        if !witness.is_object() {
            return 0;
        }

        let utxokey1 = witness["utxokey1"].as_str().unwrap_or("");
        let utxokey2 = witness["utxokey2"].as_str().unwrap_or("");
        let utxokey3 = witness["utxokey3"].as_str().unwrap_or("");
        if utxokey1.is_empty() || utxokey2.is_empty() || utxokey3.is_empty() {
            return 0;
        }

        1
    }
}
