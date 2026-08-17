use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use serde_json::{json, Value};

use super::super::script::{resolve_ref, Script};

/// SCRIPTHASH — resolve a JSON script tree and store `Script::hash()` under
/// `context.__opcodes.scripthash.<into>`.
///
/// Script shape:
/// ```json
/// {
///   "op": "SCRIPTHASH",
///   "source": "context.rental_script",
///   "into": "hash"
/// }
/// ```
///
/// This opcode is a thin adapter: it does not strip witnesses, canonicalize,
/// or hash itself. It constructs `Script { json: resolved }` and calls
/// `Script::hash()` directly so future changes to that function are inherited.
pub struct ScriptHash {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl ScriptHash {
    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let source = &context["script"]["source"];
        let into_val = &context["script"]["into"];

        if source.is_null() || into_val.is_null() {
            return 0;
        }

        let key = into_val.as_str().unwrap_or("").to_string();
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return 0;
        }

        let resolved = resolve_ref(source, context, tx, blk);

        // Access scripts are JSON objects. Reject non-objects so an unresolved
        // string path (resolve_ref's literal fallback) is not hashed as text.
        if !resolved.is_object() {
            return 0;
        }

        let script = Script { json: resolved };
        let hash = script.hash();

        if !context
            .get("__opcodes")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"] = json!({});
        }
        if !context["__opcodes"]
            .get("scripthash")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"]["scripthash"] = json!({});
        }

        if let Some(scripthash) = context["__opcodes"]["scripthash"].as_object_mut() {
            scripthash.insert(key, json!(hash));
        }

        1
    }
}
