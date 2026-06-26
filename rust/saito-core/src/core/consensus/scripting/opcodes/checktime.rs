use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

pub struct CheckTime {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckTime {
    pub fn validate(context: &Value, _tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let Some(blk) = blk else {
            return 0;
        };

        let operator = context["script"]["operator"].as_str().unwrap_or("");
        if operator.is_empty() {
            return 0;
        }

        let timestamp_raw = &context["script"]["timestamp"];
        let script_ts = if let Some(n) = timestamp_raw.as_u64() {
            n
        } else if let Some(n) = timestamp_raw.as_i64() {
            if n < 0 {
                return 0;
            }
            n as u64
        } else if let Some(s) = timestamp_raw.as_str() {
            let Ok(ts) = s.parse::<u64>() else {
                return 0;
            };
            ts
        } else {
            return 0;
        };

        let ok = match operator {
            "==" => blk.timestamp == script_ts,
            "!=" => blk.timestamp != script_ts,
            "<" => blk.timestamp < script_ts,
            "<=" => blk.timestamp <= script_ts,
            ">" => blk.timestamp > script_ts,
            ">=" => blk.timestamp >= script_ts,
            _ => return 0,
        };

        if ok {
            1
        } else {
            0
        }
    }
}
