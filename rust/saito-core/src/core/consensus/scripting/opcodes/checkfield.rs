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
    pub fn validate(context: &Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let operator = context["script"]["operator"].as_str().unwrap_or("");
        let field = &context["script"]["field"];
        let value = &context["script"]["value"];

        if operator.is_empty() || field.is_null() || value.is_null() {
            return 0;
        }

        let left = resolve_ref(field, context, tx, blk);
        let right = resolve_ref(value, context, tx, blk);

        match left {
            Value::Number(left_num) => {
                let Some(left_num) = left_num.as_u64() else {
                    return 0;
                };

                let Some(right_num) = right.as_u64() else {
                    return 0;
                };

                match operator {
                    "==" => return (left_num == right_num) as u8,
                    "!=" => return (left_num != right_num) as u8,
                    "<" => return (left_num < right_num) as u8,
                    "<=" => return (left_num <= right_num) as u8,
                    ">" => return (left_num > right_num) as u8,
                    ">=" => return (left_num >= right_num) as u8,
                    _ => return 0,
                }
            }

            Value::String(left_str) => {
                let left_str: &str = &left_str;
                let Some(right_str) = right.as_str() else {
                    return 0;
                };

                match operator {
                    "==" => return (left_str == right_str) as u8,
                    "!=" => return (left_str != right_str) as u8,
                    "<" => return (left_str < right_str) as u8,
                    "<=" => return (left_str <= right_str) as u8,
                    ">" => return (left_str > right_str) as u8,
                    ">=" => return (left_str >= right_str) as u8,
                    _ => return 0,
                }
            }

            Value::Bool(left_bool) => {
                let Some(right_bool) = right.as_bool() else {
                    return 0;
                };

                match operator {
                    "==" => return (left_bool == right_bool) as u8,
                    "!=" => return (left_bool != right_bool) as u8,
                    _ => return 0,
                }
            }

            Value::Null => {
                return 0;
            }

            _ => {
                return 0;
            }
        }
    }
}
