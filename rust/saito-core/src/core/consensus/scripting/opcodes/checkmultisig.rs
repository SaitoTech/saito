use std::collections::HashSet;

use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey, SaitoSignature};
use crate::core::util::crypto::verify;
use serde_json::{json, Value};

pub struct CheckMultiSig {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckMultiSig {
    pub fn new() -> Self {
        Self {
            name: "CHECKMULTISIG".to_string(),
            description: "Verify M-of-N signatures".to_string(),
            script: r#"{
  "op": "CHECKMULTISIG",
  "m": 2,
  "publickeys": ["<publickey>", "<publickey>", "<publickey>"],
  "msg": "hello world"
}"#
            .to_string(),
            schema: json!({
                "publickeys": "array:string",
                "m": "number",
                "msg": "string",
                "witness": {
                    "signatures": "array:string"
                }
            }),
        }
    }

    pub fn validate(context: &mut Value, _tx: Option<&Transaction>, _blk: Option<&Block>) -> u8 {
        let publickeys = match context["script"]["publickeys"].as_array() {
            Some(keys) if !keys.is_empty() => keys,
            _ => return 0,
        };

        let signatures = match context["witness"]["signatures"].as_array() {
            Some(sigs) if !sigs.is_empty() => sigs,
            _ => return 0,
        };

        let threshold = match context["script"]["m"].as_u64() {
            Some(m) if m > 0 => m as usize,
            _ => match context["script"]["m"].as_i64() {
                Some(m) if m > 0 => m as usize,
                _ => publickeys.len(),
            },
        };

        let msg = context["script"]["msg"]
            .as_str()
            .filter(|s| !s.is_empty())
            .or_else(|| context["variables"]["message"].as_str())
            .unwrap_or("");

        let mut valid = 0usize;
        let mut used = HashSet::new();

        for signature in signatures {
            let Some(signature) = signature.as_str() else {
                continue;
            };

            for publickey in publickeys {
                let Some(publickey) = publickey.as_str() else {
                    continue;
                };

                if used.contains(publickey) {
                    continue;
                }

                let Ok(sig) = SaitoSignature::from_hex(signature) else {
                    continue;
                };
                let Ok(pk) = SaitoPublicKey::from_base58(publickey) else {
                    continue;
                };

                if verify(msg.as_bytes(), &sig, &pk) {
                    used.insert(publickey.to_string());
                    valid += 1;
                    break;
                }
            }

            if valid >= threshold {
                break;
            }
        }

        if valid >= threshold {
            1
        } else {
            0
        }
    }
}
