use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey, SaitoSignature};
use crate::core::util::crypto::{self, verify};
use serde_json::{json, Value};

use super::super::script::resolve_ref;

pub struct ImportField {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => {
            if let Some(u) = n.as_u64() {
                Some(u.to_string())
            } else if let Some(i) = n.as_i64() {
                Some(i.to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

impl ImportField {
    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let field_name = context["script"]["field"]
            .as_str()
            .unwrap_or("")
            .to_string();
        if field_name.is_empty() {
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

        let value = resolve_ref(&context["witness"][&field_name], context, tx, blk);
        let signature = resolve_ref(&context["witness"]["signature"], context, tx, blk);

        if !value.is_string() && !value.is_number() {
            return 0;
        }

        let signature = match signature.as_str() {
            Some(s) if !s.is_empty() => s,
            _ => return 0,
        };

        let Some(value_string) = value_to_string(&value) else {
            return 0;
        };
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
            .get("importfield")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"]["importfield"] = json!({});
        }

        if let Some(importfield) = context["__opcodes"]["importfield"].as_object_mut() {
            importfield.insert(field_name, value);
        }

        1
    }
}
