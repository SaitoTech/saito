use std::collections::HashSet;

use super::super::script::{resolve_ref, resolved_value_to_message_string,  get_p2sh_auth_hash};
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

    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {

	let publickeys = match context["script"]["publickeys"].as_array() {
	    Some(keys) if !keys.is_empty() => keys.clone(),
	    _ => return 0,
	};

        let signatures = match context["witness"]["signatures"].as_array() {
	    Some(sigs) if !sigs.is_empty() => sigs.clone(),
            _ => return 0,
        };

        let threshold = match context["script"]["m"].as_u64() {
            Some(m) if m > 0 => m as usize,
            _ => match context["script"]["m"].as_i64() {
                Some(m) if m > 0 => m as usize,
                _ => publickeys.len(),
            },
        };

        let script_msg = &context["script"]["msg"];
        let has_script_msg = script_msg
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(!script_msg.is_null());

        let msg = if has_script_msg {
            let resolved = resolve_ref(script_msg, context, tx, blk);
            resolved_value_to_message_string(&resolved)
        } else {
            context["variables"]["message"]
                .as_str()
                .unwrap_or("")
                .to_string()
        };


	let Some(p2sh_auth_hash) = get_p2sh_auth_hash(context, tx) else {
	    return 0;
	};

	let p2sh_auth_message = format!("{msg}|{p2sh_auth_hash}");

        let mut valid = 0usize;
        let mut used = HashSet::new();

        for signature in &signatures {
            let Some(signature) = signature.as_str() else {
                continue;
            };

            for publickey in &publickeys {
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

		if verify(p2sh_auth_message.as_bytes(), &sig, &pk) {
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
