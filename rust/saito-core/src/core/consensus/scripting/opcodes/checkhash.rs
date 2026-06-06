use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::PrintForLog;
use crate::core::util::crypto;
use serde_json::Value;

pub struct CheckHash {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckHash {
    pub fn execute(context: &mut Value, _tx: Option<&Transaction>, _blk: Option<&Block>) -> u8 {
        let hash = context["script"]["hash"].as_str().unwrap_or("");
        let input = context["witness"]["input"].as_str().unwrap_or("");

        if hash.is_empty() || input.is_empty() {
            return 0;
        }

        let computed = crypto::hash(input.as_bytes()).to_hex();
        if computed == hash {
            1
        } else {
            0
        }
    }
}
