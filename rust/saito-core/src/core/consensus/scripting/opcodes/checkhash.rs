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
    pub schema: Value,
}

impl CheckHash {
    /// Construct default opcode metadata.
    pub fn new() -> Self {
        todo!()
    }

    /// Run CHECKHASH at `node` within `script`.
    pub fn execute(script: &Script, node: &Value) -> u8 {
        todo!()
    }
}
