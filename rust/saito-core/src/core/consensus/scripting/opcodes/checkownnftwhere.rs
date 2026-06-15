use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::nft::{
    get_creator, get_id, get_type, tuple_from_utxo_hex_keys, verify_owner_tx_signature,
};
use crate::core::consensus::transaction::Transaction;
use serde_json::{json, Value};

pub struct CheckOwnNftWhere {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckOwnNftWhere {
    pub fn validate(
        context: &mut Value,
        tx: Option<&Transaction>,
        _blk: Option<&Block>,
        blockchain: Option<&Blockchain>,
    ) -> u8 {
        let witness = &context["witness"];
        if !witness.is_object() {
            return 0;
        }

        let utxokey1 = witness["utxokey1"].as_str().unwrap_or("");
        let utxokey2 = witness["utxokey2"].as_str().unwrap_or("");
        let utxokey3 = witness["utxokey3"].as_str().unwrap_or("");
        if utxokey1.is_empty() || utxokey2.is_empty() || utxokey3.is_empty() {
            return 0;
        }

        let Some(blockchain) = blockchain else {
            return 0;
        };

        let Some(tuple) = tuple_from_utxo_hex_keys(utxokey1, utxokey2, utxokey3, blockchain) else {
            return 0;
        };

        if !context
            .get("__opcodes")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"] = json!({});
        }
        context["__opcodes"]["checkownnftwhere"] = json!({
            "nft_id": get_id(&tuple)
        });

        let Some(tx) = tx else {
            return 0;
        };

        if !verify_owner_tx_signature(tx, &tuple.slip2.public_key) {
            return 0;
        }

        let creator = get_creator(&tuple);
        let nft_type = get_type(&tuple);

        if let Some(where_clauses) = context["script"]["where"].as_array() {
            for clause in where_clauses {
                if !clause.is_object() {
                    return 0;
                }

                let field = clause["field"].as_str().unwrap_or("");
                let lhs = if field == "creator" {
                    creator.as_str()
                } else if field == "type" {
                    nft_type.as_str()
                } else {
                    return 0;
                };

                let rhs = &clause["value"];
                let operator = clause["operator"].as_str().unwrap_or("");

                match operator {
                    "==" => {
                        let Some(rhs) = rhs.as_str() else {
                            return 0;
                        };
                        if lhs != rhs {
                            return 0;
                        }
                    }
                    "!=" => {
                        let Some(rhs) = rhs.as_str() else {
                            return 0;
                        };
                        if lhs == rhs {
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
