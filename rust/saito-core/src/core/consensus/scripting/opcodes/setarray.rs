use crate::core::consensus::block::Block;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

use super::super::script::resolve_ref;

/// SETARRAY — replace a context location with a deep clone of a source array.
///
/// Script shape:
/// ```json
/// {
///   "op": "SETARRAY",
///   "destination": "context.successors",
///   "source": "__opcodes.importarray.successors"
/// }
/// ```
///
/// `source` is resolved via resolve_ref. If unresolved, the special collection
/// refs `tx.from` / `tx.to` / `tx.path` / `tx.from.p2sh` / `tx.to.p2sh` resolve
/// to the corresponding arrays.
///
/// Destinations must be `context.*` paths. Writes to `script.*`, `witness.*`,
/// `tx.*`, and `blk.*` are rejected.
pub struct SetArray {
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

/// P2SH slip filter matching resolve_p2sh_slip_field / ARRAYIFY.
fn is_p2sh_slip(slip: &Slip) -> bool {
    if slip.slip_type == SlipType::Bound {
        return false;
    }
    slip.public_key[0] == 0x00
}

fn slips_to_value(slips: &[Slip]) -> Option<Value> {
    serde_json::to_value(slips).ok()
}

fn p2sh_slips_to_value(slips: &[Slip]) -> Option<Value> {
    let filtered: Vec<&Slip> = slips.iter().filter(|s| is_p2sh_slip(s)).collect();
    serde_json::to_value(filtered).ok()
}

fn resolve_source_array(
    source: &Value,
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> Option<Value> {
    let resolved = resolve_ref(source, context, tx, blk);
    if resolved.is_array() {
        return Some(resolved);
    }

    //
    // special collection refs — only after normal resolve_ref fails to yield
    // an array
    //
    let Some(s) = source.as_str() else {
        return None;
    };

    match s {
        "tx.from" => tx.and_then(|t| slips_to_value(&t.from)),
        "tx.to" => tx.and_then(|t| slips_to_value(&t.to)),
        "tx.path" => tx.and_then(|t| serde_json::to_value(&t.path).ok()),
        "tx.from.p2sh" => tx.and_then(|t| p2sh_slips_to_value(&t.from)),
        "tx.to.p2sh" => tx.and_then(|t| p2sh_slips_to_value(&t.to)),
        _ => None,
    }
}

impl SetArray {
    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let destination = context["script"]["destination"]
            .as_str()
            .unwrap_or("")
            .to_string();
        if destination.is_empty() {
            return 0;
        }

        let Some(path) = destination.strip_prefix("context.") else {
            return 0;
        };
        let path = path.to_string();
        if path.is_empty() || is_forbidden_write_path(&path) {
            return 0;
        }

        if context["script"].get("source").is_none() {
            return 0;
        }

        let Some(source_array) =
            resolve_source_array(&context["script"]["source"].clone(), context, tx, blk)
        else {
            return 0;
        };

        if !source_array.is_array() {
            return 0;
        }

        // Value::clone is a deep copy of the JSON tree
        let cloned = source_array.clone();

        if set_context_path(context, &path, cloned) {
            1
        } else {
            0
        }
    }
}
