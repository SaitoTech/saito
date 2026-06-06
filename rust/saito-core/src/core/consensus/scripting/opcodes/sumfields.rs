use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use serde_json::{json, Value};

use super::super::script::resolve_ref;

pub struct SumFields {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl SumFields {
    pub fn validate(
        context: &mut Value,
        tx: Option<&Transaction>,
        blk: Option<&Block>,
    ) -> u8 {

        let a = &context["script"]["a"];
        let b = &context["script"]["b"];
        let into_val = &context["script"]["into"];

        if a.is_null() || b.is_null() || into_val.is_null() {
            return 0;
        }

        let left = resolve_ref(a, context, tx, blk);
        let right = resolve_ref(b, context, tx, blk);

        let Some(left_num) = left.as_u64() else {
            return 0;
        };
        let Some(right_num) = right.as_u64() else {
            return 0;
        };

        let key = into_val.as_str().unwrap_or("").to_string();
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
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
            .get("sumfields")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"]["sumfields"] = json!({});
        }

        if let Some(sumfields) = context["__opcodes"]["sumfields"].as_object_mut() {
            sumfields.insert(key, json!(left_num + right_num));
        }

        1
    }
}
