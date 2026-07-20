use crate::core::consensus::block::Block;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

use super::super::script::resolve_ref;

/// ARRAYIFY — replace a context value with an array of deep clones of itself.
///
/// Script shape:
/// ```json
/// {
///   "op": "ARRAYIFY",
///   "reference": "context.constitution",
///   "dimension": 2
/// }
/// ```
///
/// `dimension` may be a numeric literal, a normal resolve_ref result (array
/// length, object key count, or number), or the special collection refs
/// `tx.from` / `tx.to` / `tx.path` / `tx.from.p2sh` / `tx.to.p2sh`.
///
/// Destinations must be `context.*` paths. Writes to `script.*`, `witness.*`,
/// `tx.*`, and `blk.*` are rejected.
pub struct Arrayify {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

fn is_forbidden_write_path(path: &str) -> bool {
    path == "script"
        || path.starts_with("script.")
        || path == "witness"
        || path.starts_with("witness.")
        || path == "tx"
        || path.starts_with("tx.")
        || path == "blk"
        || path.starts_with("blk.")
}

/// Normalize `foo[0].bar` into dotted segments compatible with resolve_ref lookup.
fn path_segments(path: &str) -> Vec<String> {
    let normalized = path.replace('[', ".").replace(']', "");
    normalized
        .split('.')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn get_context_path(root: &Value, path: &str) -> Option<Value> {
    let segments = path_segments(path);
    if segments.is_empty() {
        return None;
    }

    let mut current = root;
    for segment in &segments {
        if let Ok(index) = segment.parse::<usize>() {
            current = current.get(index)?;
        } else {
            current = current.get(segment)?;
        }
    }
    Some(current.clone())
}

fn set_context_path(root: &mut Value, path: &str, value: Value) -> bool {
    let segments = path_segments(path);
    if segments.is_empty() {
        return false;
    }

    let last = segments.len() - 1;
    let mut current = root;

    for (i, segment) in segments.iter().enumerate() {
        if i == last {
            if let Ok(index) = segment.parse::<usize>() {
                let Some(arr) = current.as_array_mut() else {
                    return false;
                };
                if index >= arr.len() {
                    return false;
                }
                arr[index] = value;
                return true;
            }

            if !current.is_object() {
                *current = Value::Object(serde_json::Map::new());
            }
            if let Value::Object(map) = current {
                map.insert(segment.clone(), value);
                return true;
            }
            return false;
        }

        if let Ok(index) = segment.parse::<usize>() {
            let Some(arr) = current.as_array_mut() else {
                return false;
            };
            if index >= arr.len() {
                return false;
            }
            current = &mut arr[index];
            continue;
        }

        if !current.is_object() {
            *current = Value::Object(serde_json::Map::new());
        }

        let Value::Object(map) = current else {
            return false;
        };

        if !map.contains_key(segment) {
            map.insert(segment.clone(), Value::Object(serde_json::Map::new()));
        }

        current = map.get_mut(segment).unwrap();
    }

    false
}

fn dimension_from_value(value: &Value) -> Option<usize> {
    match value {
        Value::Number(n) => {
            let Some(u) = n.as_u64() else {
                return None;
            };
            usize::try_from(u).ok()
        }
        Value::Array(arr) => Some(arr.len()),
        Value::Object(map) => Some(map.len()),
        _ => None,
    }
}

/// Count P2SH slips using the same filter as resolve_p2sh_slip_field.
fn count_p2sh_slips(slips: &[Slip]) -> usize {
    let mut count = 0usize;
    for slip in slips {
        if slip.slip_type == SlipType::Bound {
            continue;
        }
        if slip.public_key[0] != 0x00 {
            continue;
        }
        count += 1;
    }
    count
}

fn resolve_dimension(
    dimension: &Value,
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> Option<usize> {
    let resolved = resolve_ref(dimension, context, tx, blk);
    if let Some(n) = dimension_from_value(&resolved) {
        return Some(n);
    }

    //
    // special collection refs — only after normal resolve_ref fails to yield
    // a usable dimension
    //
    let Some(s) = dimension.as_str() else {
        return None;
    };

    match s {
        "tx.from" => tx.map(|t| t.from.len()),
        "tx.to" => tx.map(|t| t.to.len()),
        "tx.path" => tx.map(|t| t.path.len()),
        "tx.from.p2sh" => tx.map(|t| count_p2sh_slips(&t.from)),
        "tx.to.p2sh" => tx.map(|t| count_p2sh_slips(&t.to)),
        _ => None,
    }
}

impl Arrayify {
    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let reference = context["script"]["reference"]
            .as_str()
            .unwrap_or("")
            .to_string();
        if reference.is_empty() {
            return 0;
        }

        let Some(path) = reference.strip_prefix("context.") else {
            return 0;
        };
        let path = path.to_string();
        if path.is_empty() || is_forbidden_write_path(&path) {
            return 0;
        }

        if context["script"].get("dimension").is_none() {
            return 0;
        }

        let Some(dimension) = resolve_dimension(
            &context["script"]["dimension"].clone(),
            context,
            tx,
            blk,
        ) else {
            return 0;
        };

        let Some(original) = get_context_path(context, &path) else {
            return 0;
        };

        let mut clones = Vec::with_capacity(dimension);
        for _ in 0..dimension {
            clones.push(original.clone());
        }

        if set_context_path(context, &path, Value::Array(clones)) {
            1
        } else {
            0
        }
    }
}
