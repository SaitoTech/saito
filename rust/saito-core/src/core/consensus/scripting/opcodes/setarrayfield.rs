use crate::core::consensus::block::Block;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

use super::super::script::resolve_ref;

/// SETARRAYFIELD — write a field on each destination object from a parallel
/// source list (with last-value / scalar broadcasting).
///
/// Script shape:
/// ```json
/// {
///   "op": "SETARRAYFIELD",
///   "destination": "context.constitution",
///   "source": "__opcodes.importarray.successors",
///   "field": "owner"
/// }
/// ```
///
/// For each destination index `i`:
/// `destination[i][field] = source[min(i, source.len()-1)]`
///
/// A scalar source broadcasts as a one-element list. Empty source arrays fail.
///
/// Destinations must be `context.*` paths that resolve to arrays of objects.
pub struct SetArrayField {
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

fn get_context_path_mut<'a>(root: &'a mut Value, path: &str) -> Option<&'a mut Value> {
    let segments = path_segments(path);
    if segments.is_empty() {
        return None;
    }

    let mut current = root;
    for segment in &segments {
        if let Ok(index) = segment.parse::<usize>() {
            let arr = current.as_array_mut()?;
            current = arr.get_mut(index)?;
        } else {
            current = current.get_mut(segment)?;
        }
    }
    Some(current)
}

/// P2SH slip filter matching resolve_p2sh_slip_field / SETARRAY / ARRAYIFY.
fn is_p2sh_slip(slip: &Slip) -> bool {
    if slip.slip_type == SlipType::Bound {
        return false;
    }
    slip.public_key[0] == 0x00
}

fn slips_to_values(slips: &[Slip]) -> Option<Vec<Value>> {
    let value = serde_json::to_value(slips).ok()?;
    value.as_array().map(|a| a.clone())
}

fn p2sh_slips_to_values(slips: &[Slip]) -> Option<Vec<Value>> {
    let filtered: Vec<&Slip> = slips.iter().filter(|s| is_p2sh_slip(s)).collect();
    let value = serde_json::to_value(filtered).ok()?;
    value.as_array().map(|a| a.clone())
}

fn resolve_special_collection(name: &str, tx: Option<&Transaction>) -> Option<Vec<Value>> {
    match name {
        "tx.from" => tx.and_then(|t| slips_to_values(&t.from)),
        "tx.to" => tx.and_then(|t| slips_to_values(&t.to)),
        "tx.path" => tx.and_then(|t| {
            serde_json::to_value(&t.path)
                .ok()
                .and_then(|v| v.as_array().map(|a| a.clone()))
        }),
        "tx.from.p2sh" => tx.and_then(|t| p2sh_slips_to_values(&t.from)),
        "tx.to.p2sh" => tx.and_then(|t| p2sh_slips_to_values(&t.to)),
        _ => None,
    }
}

/// Resolve source to a non-empty list of values (array elements or one scalar).
fn resolve_source_values(
    source: &Value,
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> Option<Vec<Value>> {
    let resolved = resolve_ref(source, context, tx, blk);
    if let Some(arr) = resolved.as_array() {
        if arr.is_empty() {
            return None;
        }
        return Some(arr.clone());
    }

    if let Some(s) = source.as_str() {
        match s {
            "tx.from" | "tx.to" | "tx.path" | "tx.from.p2sh" | "tx.to.p2sh" => {
                let values = resolve_special_collection(s, tx)?;
                if values.is_empty() {
                    return None;
                }
                return Some(values);
            }
            _ => {}
        }
    }

    // scalar broadcast
    Some(vec![resolved])
}

impl SetArrayField {
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

        let field = context["script"]["field"]
            .as_str()
            .unwrap_or("")
            .to_string();
        if field.is_empty() {
            return 0;
        }

        if context["script"].get("source").is_none() {
            return 0;
        }

        let Some(source_values) =
            resolve_source_values(&context["script"]["source"].clone(), context, tx, blk)
        else {
            return 0;
        };

        let Some(dest_value) = get_context_path_mut(context, &path) else {
            return 0;
        };

        let Some(dest_arr) = dest_value.as_array_mut() else {
            return 0;
        };

        if !dest_arr.iter().all(|e| e.is_object()) {
            return 0;
        }

        let last_idx = source_values.len() - 1;
        for (i, elem) in dest_arr.iter_mut().enumerate() {
            let src_idx = if i < source_values.len() { i } else { last_idx };
            let Value::Object(map) = elem else {
                return 0;
            };
            map.insert(field.clone(), source_values[src_idx].clone());
        }

        1
    }
}
