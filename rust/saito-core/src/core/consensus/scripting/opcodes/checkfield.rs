use super::super::script::resolve_ref;
use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

pub struct CheckField {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckField {
    /// CHECKFIELD — compare a resolved field value against a scalar or value list.
    ///
    /// Script shapes:
    /// ```json
    /// { "op": "CHECKFIELD", "field": "db.type", "operator": "==", "value": "UPDATE" }
    /// { "op": "CHECKFIELD", "field": "db.type", "operator": "IN",  "value": ["UPDATE", "CREATE"] }
    /// { "op": "CHECKFIELD", "field": "db.type", "operator": "NOT", "value": ["DELETE"] }
    /// ```
    ///
    /// Operators:
    /// - `==` / `equals`, `!=`, `<`, `<=`, `>`, `>=` — scalar comparisons (typed)
    /// - `IN` — resolved field equals at least one list element
    /// - `NOT` — resolved field equals none of the list elements
    pub fn validate(context: &Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let operator = context["script"]["operator"].as_str().unwrap_or("");
        let field = &context["script"]["field"];
        let value = &context["script"]["value"];

        if operator.is_empty() || field.is_null() || value.is_null() {
            return 0;
        }

        let left = resolve_ref(field, context, tx, blk);
        let right = resolve_ref(value, context, tx, blk);

        match operator {
            "IN" => {
                if left.is_null() {
                    return 0;
                }
                let Some(arr) = right.as_array() else {
                    return 0;
                };
                for item in arr {
                    let candidate = resolve_ref(item, context, tx, blk);
                    if values_equal(&left, &candidate) {
                        return 1;
                    }
                }
                return 0;
            }
            "NOT" => {
                if left.is_null() {
                    return 0;
                }
                let Some(arr) = right.as_array() else {
                    return 0;
                };
                for item in arr {
                    let candidate = resolve_ref(item, context, tx, blk);
                    if values_equal(&left, &candidate) {
                        return 0;
                    }
                }
                return 1;
            }
            _ => {}
        }

        match left {
            Value::Number(left_num) => {
                let Some(left_num) = left_num.as_u64() else {
                    return 0;
                };

                let Some(right_num) = right.as_u64() else {
                    return 0;
                };

                match operator {
                    "==" | "equals" => (left_num == right_num) as u8,
                    "!=" => (left_num != right_num) as u8,
                    "<" => (left_num < right_num) as u8,
                    "<=" => (left_num <= right_num) as u8,
                    ">" => (left_num > right_num) as u8,
                    ">=" => (left_num >= right_num) as u8,
                    _ => 0,
                }
            }

            Value::String(left_str) => {
                let left_str: &str = &left_str;
                let Some(right_str) = right.as_str() else {
                    return 0;
                };

                match operator {
                    "==" | "equals" => (left_str == right_str) as u8,
                    "!=" => (left_str != right_str) as u8,
                    "<" => (left_str < right_str) as u8,
                    "<=" => (left_str <= right_str) as u8,
                    ">" => (left_str > right_str) as u8,
                    ">=" => (left_str >= right_str) as u8,
                    _ => 0,
                }
            }

            Value::Bool(left_bool) => {
                let Some(right_bool) = right.as_bool() else {
                    return 0;
                };

                match operator {
                    "==" | "equals" => (left_bool == right_bool) as u8,
                    "!=" => (left_bool != right_bool) as u8,
                    _ => 0,
                }
            }

            Value::Null => 0,

            _ => 0,
        }
    }
}

/// Equality used by CHECKFIELD `==` / `IN` / `NOT` — typed like the scalar path.
fn values_equal(left: &Value, right: &Value) -> bool {
    match left {
        Value::Number(left_num) => {
            let Some(left_num) = left_num.as_u64() else {
                return false;
            };
            right.as_u64().map(|r| left_num == r).unwrap_or(false)
        }
        Value::String(left_str) => right.as_str().map(|r| left_str == r).unwrap_or(false),
        Value::Bool(left_bool) => right.as_bool().map(|r| *left_bool == r).unwrap_or(false),
        _ => false,
    }
}
