use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::slip::Slip;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoUTXOSetKey};
use serde_json::{json, Value};

pub struct CheckOwnNftWhere {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

fn slip_from_utxo_key_hex(hex: &str) -> Option<Slip> {
    let key = SaitoUTXOSetKey::from_hex(hex).ok()?;
    Slip::parse_slip_from_utxokey(&key).ok()
}

fn js_strict_equal(lhs: Option<&str>, rhs: &Value) -> bool {
    match lhs {
        None => rhs.is_null(),
        Some(l) => rhs.as_str() == Some(l),
    }
}

impl CheckOwnNftWhere {
    pub fn validate(
        context: &mut Value,
        tx: Option<&Transaction>,
        _blk: Option<&Block>,
        _blockchain: Option<&Blockchain>,
    ) -> u8 {
        let witness = &context["witness"];
        if !witness.is_object() {
            return 0;
        }

        let utxo1 = witness["utxokey1"].as_str().unwrap_or("");
        let utxo2 = witness["utxokey2"].as_str().unwrap_or("");
        let utxo3 = witness["utxokey3"].as_str().unwrap_or("");
        if utxo1.is_empty() || utxo2.is_empty() || utxo3.is_empty() {
            return 0;
        }

        let Some(slip1) = slip_from_utxo_key_hex(utxo1) else {
            return 0;
        };
        let Some(slip2) = slip_from_utxo_key_hex(utxo2) else {
            return 0;
        };
        let Some(_slip3) = slip_from_utxo_key_hex(utxo3) else {
            return 0;
        };

        let nft_id = utxo3
            .get(..66.min(utxo3.len()))
            .unwrap_or(utxo3)
            .to_ascii_lowercase();

        if !context
            .get("__opcodes")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"] = json!({});
        }
        context["__opcodes"]["checkownnftwhere"] = json!({
            "nft_id": nft_id
        });

        if let Some(tx) = tx {
            if !tx.from.is_empty() {
                let sender = tx.from[0].public_key.to_base58();
                let slip2_public_key = slip2.public_key.to_base58();
                if sender != slip2_public_key {
                    return 0;
                }
            }
        }

        // context.app.wallet.extractNFTType is unavailable in the Rust evaluator.
        let nft_type: Option<&str> = None;
        let creator = slip1.public_key.to_base58();

        if let Some(where_clauses) = context["script"]["where"].as_array() {
            for clause in where_clauses {
                if !clause.is_object() {
                    return 0;
                }

                let field = clause["field"].as_str().unwrap_or("");
                let lhs = if field == "creator" {
                    Some(creator.as_str())
                } else if field == "type" {
                    nft_type
                } else {
                    return 0;
                };

                let rhs = &clause["value"];
                let operator = clause["operator"].as_str().unwrap_or("");

                match operator {
                    "==" => {
                        if !js_strict_equal(lhs, rhs) {
                            return 0;
                        }
                    }
                    "!=" => {
                        if js_strict_equal(lhs, rhs) {
                            return 0;
                        }
                    }
                    _ => return 0,
                }
            }
        }

        1
    }
}
