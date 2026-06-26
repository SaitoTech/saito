use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey, SaitoSignature};
use crate::core::util::crypto::{hash, verify};
use serde_json::Value;

/// Verify witness routing hops using the same canonical message format as the
/// JavaScript `verifyRoutingPath` implementation (`to|value|binding_hash`).
pub(crate) fn verify_witness_routing_path(
    hops: &[Value],
    start_publickey: &str,
    binding_hash: &str,
) -> bool {
    if hops.is_empty() || start_publickey.is_empty() {
        return false;
    }

    let mut expected_signer = start_publickey;

    for hop in hops {
        let Some(to) = hop.get("to").and_then(|v| v.as_str()) else {
            return false;
        };
        let Some(value) = hop.get("value").and_then(|v| v.as_str()) else {
            return false;
        };
        let Some(sig_hex) = hop.get("sig").and_then(|v| v.as_str()) else {
            return false;
        };

        let canonical_string = format!("{to}|{value}|{binding_hash}");
        let digest = hash(canonical_string.as_bytes()).to_hex();

        let Ok(sig) = SaitoSignature::from_hex(sig_hex) else {
            return false;
        };
        let Ok(pk) = SaitoPublicKey::from_base58(expected_signer) else {
            return false;
        };

        if !verify(digest.as_bytes(), &sig, &pk) {
            return false;
        }

        expected_signer = to;
    }

    true
}

pub struct CheckPath {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckPath {
    pub fn validate(context: &Value, _tx: Option<&Transaction>, _blk: Option<&Block>) -> u8 {
        let start_publickey = context["script"]["publickey"].as_str().unwrap_or("");
        if start_publickey.is_empty() {
            return 0;
        }

        let binding_hash = context["script"]["hash"].as_str().unwrap_or("");

        let hops = match context["witness"]["hops"].as_array() {
            Some(hops) if !hops.is_empty() => hops,
            _ => return 0,
        };

        if verify_witness_routing_path(hops, start_publickey, binding_hash) {
            1
        } else {
            0
        }
    }
}
