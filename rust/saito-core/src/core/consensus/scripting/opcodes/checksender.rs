use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::PrintForLog;
use serde_json::Value;

pub struct CheckSender {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckSender {
    pub fn validate(context: &Value, tx: Option<&Transaction>, _blk: Option<&Block>) -> u8 {
        let publickey = context["script"]["publickey"].as_str().unwrap_or("");
        if publickey.is_empty() {
            return 0;
        }

        let Some(tx) = tx else {
            return 0;
        };

        let required = publickey.to_ascii_lowercase();

        for slip in &tx.from {
            if slip.public_key.to_base58().to_ascii_lowercase() == required {
                return 1;
            }
        }

        0
    }
}
