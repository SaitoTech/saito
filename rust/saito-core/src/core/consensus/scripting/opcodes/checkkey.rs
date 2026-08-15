use super::super::script::resolve_ref;
use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

pub struct CheckKey {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckKey {
    /// CHECKKEY — test object key presence / allowlists / denylists.
    ///
    /// Script shapes:
    /// ```json
    /// { "op": "CHECKKEY", "field": "db", "operator": "==", "key": "field5" }
    /// { "op": "CHECKKEY", "field": "db", "operator": "IN",  "key": ["field1", "field2"] }
    /// { "op": "CHECKKEY", "field": "db", "operator": "NOT", "key": ["owner", "preserve"] }
    /// ```
    ///
    /// Operators:
    /// - `==` — named key is present
    /// - `!=` — named key is absent
    /// - `IN` — every key present on the object is in the supplied list
    /// - `NOT` — no key present on the object is in the supplied list
    ///
    /// Missing objects, non-objects, and non-string keys fail closed (return 0),
    /// matching CHECKFIELD's Null / type-mismatch behavior.
    pub fn validate(context: &Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let operator = context["script"]["operator"].as_str().unwrap_or("");
        let field = &context["script"]["field"];
        let key = &context["script"]["key"];

        if operator.is_empty() || field.is_null() || key.is_null() {
            return 0;
        }

        let object = resolve_ref(field, context, tx, blk);
        let key_arg = resolve_ref(key, context, tx, blk);

        let Some(map) = object.as_object() else {
            return 0;
        };

        match operator {
            "==" => {
                let Some(key_str) = key_arg.as_str() else {
                    return 0;
                };
                map.contains_key(key_str) as u8
            }
            "!=" => {
                let Some(key_str) = key_arg.as_str() else {
                    return 0;
                };
                (!map.contains_key(key_str)) as u8
            }
            "IN" => {
                let Some(allowed) = resolve_key_name_list(&key_arg, context, tx, blk) else {
                    return 0;
                };
                for object_key in map.keys() {
                    if !allowed.iter().any(|a| a == object_key) {
                        return 0;
                    }
                }
                1
            }
            "NOT" => {
                let Some(forbidden) = resolve_key_name_list(&key_arg, context, tx, blk) else {
                    return 0;
                };
                for name in forbidden {
                    if map.contains_key(&name) {
                        return 0;
                    }
                }
                1
            }
            _ => 0,
        }
    }
}

fn resolve_key_name_list(
    key_arg: &Value,
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> Option<Vec<String>> {
    let arr = key_arg.as_array()?;
    let mut names = Vec::with_capacity(arr.len());
    for item in arr {
        let resolved = resolve_ref(item, context, tx, blk);
        let s = resolved.as_str()?;
        names.push(s.to_string());
    }
    Some(names)
}
