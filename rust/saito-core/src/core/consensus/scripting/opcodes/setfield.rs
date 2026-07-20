use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use serde_json::Value;

use super::super::script::resolve_ref;

/// SETFIELD — copy a resolved value into a writable location in the
/// execution context.
///
/// Script shape:
/// ```json
/// {
///   "op": "SETFIELD",
///   "reference": "context.constitution.owner",
///   "value": "__opcodes.importfield.owner"
/// }
/// ```
///
/// Destinations must be `context.*` paths. Writes to `script.*`, `witness.*`,
/// `tx.*`, and `blk.*` are rejected.
pub struct SetField {
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

impl SetField {
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

        if context["script"].get("value").is_none() {
            return 0;
        }

        let value = resolve_ref(&context["script"]["value"].clone(), context, tx, blk);

        if set_context_path(context, &path, value) {
            1
        } else {
            0
        }
    }
}
