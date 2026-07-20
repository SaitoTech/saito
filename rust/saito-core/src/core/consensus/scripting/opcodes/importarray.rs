use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey, SaitoSignature};
use crate::core::util::crypto::{self, verify};
use serde_json::{json, Value};

use super::super::script::{canonical_json, resolve_ref};

/// IMPORTARRAY — verify a signed witness array and store it under `key` in
/// `context.__opcodes.importarray`.
///
/// Script shape:
/// ```json
/// {
///   "op": "IMPORTARRAY",
///   "key": "successors",
///   "publickey": "...",
///   "hash": "...",
///   "witness": {
///     "value": [{ "public_key": "...", "amount": 100 }],
///     "signature": "..."
///   }
/// }
/// ```
///
/// Signature digest: `HASH(canonical_json(value) | binding_hash)`.
pub struct ImportArray {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl ImportArray {
    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let key = context["script"]["key"].as_str().unwrap_or("").to_string();
        if key.is_empty() {
            return 0;
        }

        let signer_pubkey = resolve_ref(&context["script"]["publickey"], context, tx, blk);
        let binding_hash = resolve_ref(&context["script"]["hash"], context, tx, blk);

        let signer_pubkey = match signer_pubkey.as_str() {
            Some(s) if !s.is_empty() => s,
            _ => return 0,
        };
        let binding_hash = match binding_hash.as_str() {
            Some(s) if !s.is_empty() => s,
            _ => return 0,
        };

        let value = resolve_ref(&context["witness"]["value"], context, tx, blk);
        let signature = resolve_ref(&context["witness"]["signature"], context, tx, blk);

        if !value.is_array() {
            return 0;
        }

        let signature = match signature.as_str() {
            Some(s) if !s.is_empty() => s,
            _ => return 0,
        };

        let value_string = canonical_json(&value);
        let canonical_string = format!("{value_string}|{binding_hash}");
        let digest = crypto::hash(canonical_string.as_bytes()).to_hex();

        let Ok(sig) = SaitoSignature::from_hex(signature) else {
            return 0;
        };
        let Ok(pk) = SaitoPublicKey::from_base58(signer_pubkey) else {
            return 0;
        };

        if !verify(digest.as_bytes(), &sig, &pk) {
            return 0;
        }

        if !context
            .get("__opcodes")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"] = json!({});
        }
        if !context["__opcodes"]
            .get("importarray")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"]["importarray"] = json!({});
        }

        if let Some(importarray) = context["__opcodes"]["importarray"].as_object_mut() {
            importarray.insert(key, value);
        }

        1
    }
}
