<<<<<<< HEAD
use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::PrintForLog;
use crate::core::util::crypto;
use serde_json::Value;

pub struct CheckHash {
    pub name: String,
    pub description: String,
    pub script: String,
=======
//! CHECKHASH opcode behavior.
//!
//! Eventually: `script.validate()` → `CheckHash::execute(script, node)`.

use serde_json::Value;

use super::super::Script;

/// CHECKHASH opcode definition and execution entry point.
pub struct CheckHash {
    /// Opcode name.
    pub name: String,
    /// Human-readable description.
    pub description: String,
    /// Example JSON script.
    pub script: String,
    /// Schema definition.
>>>>>>> d0f828fa (fix: rustscript rust implementation)
    pub schema: Value,
}

impl CheckHash {
<<<<<<< HEAD
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
=======
    /// Construct default opcode metadata.
    pub fn new() -> Self {
        todo!()
    }

    /// Run CHECKHASH at `node` within `script`.
    pub fn execute(script: &Script, node: &Value) -> u8 {
        todo!()
>>>>>>> d0f828fa (fix: rustscript rust implementation)
    }
}
