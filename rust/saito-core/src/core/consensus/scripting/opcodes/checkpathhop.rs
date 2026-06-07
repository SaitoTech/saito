use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use base64::Engine;
use serde_json::{json, Value};

use super::super::script::resolve_ref;
use super::checkpath::verify_witness_routing_path;

struct DecodedHop {
    to: String,
    sig: String,
    value: Value,
}

fn decode_hops(hops: &[Value]) -> Option<Vec<DecodedHop>> {
    let mut decoded = Vec::with_capacity(hops.len());

    for hop in hops {
        let to = hop.get("to").and_then(|v| v.as_str())?.to_string();
        let sig = hop.get("sig").and_then(|v| v.as_str())?.to_string();
        let value_b64 = hop.get("value").and_then(|v| v.as_str())?;

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(value_b64)
            .ok()?;
        let utf8 = String::from_utf8(bytes).ok()?;
        let parsed: Value = serde_json::from_str(&utf8).ok()?;

        decoded.push(DecodedHop {
            to,
            sig,
            value: parsed,
        });
    }

    Some(decoded)
}

fn lookup_field(hop: &DecodedHop, field: &str) -> Option<Value> {
    let mut parts = field.split('.');
    let first = parts.next()?;

    let mut current = match first {
        "to" => json!(hop.to),
        "sig" => json!(hop.sig),
        "value" => hop.value.clone(),
        _ => return None,
    };

    for part in parts {
        current = current.get(part)?.clone();
    }

    Some(current)
}

fn resolve_rhs(context: &Value, value: &Value) -> Value {
    if let Some(key) = value.as_str() {
        if let Some(v) = context.get(key) {
            return v.clone();
        }
    }
    value.clone()
}

fn coerce_value(value: &Value, ty: Option<&str>) -> Value {
    let Some(ty) = ty else {
        return value.clone();
    };

    match ty {
        "number" => {
            if let Some(n) = value.as_f64() {
                return json!(n);
            }
            if let Some(n) = value.as_u64() {
                return json!(n as f64);
            }
            if let Some(n) = value.as_i64() {
                return json!(n as f64);
            }
            if let Some(s) = value.as_str() {
                if let Ok(n) = s.parse::<f64>() {
                    return json!(n);
                }
            }
            json!(f64::NAN)
        }
        "string" => json!(value.as_str().unwrap_or("").to_string()),
        "boolean" => {
            if value.is_boolean() {
                return value.clone();
            }
            if let Some(s) = value.as_str() {
                if s == "true" {
                    return json!(true);
                }
                if s == "false" {
                    return json!(false);
                }
            }
            if let Some(n) = value.as_u64() {
                if n == 1 {
                    return json!(true);
                }
                if n == 0 {
                    return json!(false);
                }
            }
            json!(false)
        }
        _ => value.clone(),
    }
}

fn values_equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(l), Value::Number(r)) => {
            if let (Some(lf), Some(rf)) = (l.as_f64(), r.as_f64()) {
                lf == rf
            } else {
                false
            }
        }
        (Value::String(l), Value::String(r)) => l == r,
        (Value::Bool(l), Value::Bool(r)) => l == r,
        _ => false,
    }
}

fn compare_values(left: &Value, right: &Value, operator: &str) -> Option<bool> {
    match operator {
        "==" => Some(values_equal(left, right)),
        "!=" => Some(!values_equal(left, right)),
        "<" | "<=" | ">" | ">=" => {
            let lf = left.as_f64()?;
            let rf = right.as_f64()?;
            Some(match operator {
                "<" => lf < rf,
                "<=" => lf <= rf,
                ">" => lf > rf,
                ">=" => lf >= rf,
                _ => return None,
            })
        }
        _ => None,
    }
}

fn evaluate_condition(hop: &DecodedHop, condition: &Value, context: &Value) -> Option<bool> {
    let field = condition.get("field").and_then(|v| v.as_str())?;
    let operator = condition.get("operator").and_then(|v| v.as_str())?;
    let rhs_raw = condition.get("value")?;
    let ty = condition.get("type").and_then(|v| v.as_str());

    let lhs_raw = lookup_field(hop, field)?;
    let rhs_resolved = resolve_rhs(context, rhs_raw);
    let left = coerce_value(&lhs_raw, ty);
    let right = coerce_value(&rhs_resolved, ty);

    compare_values(&left, &right, operator)
}

pub struct CheckPathHop {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckPathHop {
    pub fn validate(context: &mut Value, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let hops = match context["witness"]["hops"].as_array() {
            Some(hops) if !hops.is_empty() => hops,
            _ => return 0,
        };

        let start_publickey = resolve_ref(&context["script"]["publickey"], context, tx, blk);
        let start_publickey = match start_publickey.as_str() {
            Some(s) if !s.is_empty() => s,
            _ => return 0,
        };

        let binding_hash = resolve_ref(&context["script"]["hash"], context, tx, blk);
        let binding_hash = binding_hash.as_str().unwrap_or("");

        if !verify_witness_routing_path(hops, start_publickey, binding_hash) {
            return 0;
        }

        let Some(decoded) = decode_hops(hops) else {
            return 0;
        };

        let where_clauses = context["script"]["where"].as_array();
        let filtered: Vec<&DecodedHop> = if let Some(clauses) = where_clauses {
            if clauses.is_empty() {
                decoded.iter().collect()
            } else {
                decoded
                    .iter()
                    .filter(|hop| {
                        clauses
                            .iter()
                            .all(|clause| evaluate_condition(hop, clause, context) == Some(true))
                    })
                    .collect()
            }
        } else {
            decoded.iter().collect()
        };

        if filtered.is_empty() {
            return 0;
        }

        let selector = context["script"]["selector"].as_str().unwrap_or("");
        let selected: Vec<&DecodedHop> = match selector {
            "FIRST" => vec![filtered[0]],
            "LAST" => vec![filtered[filtered.len() - 1]],
            "ONLY" => {
                if filtered.len() != 1 {
                    return 0;
                }
                vec![filtered[0]]
            }
            "ANY" => filtered,
            _ => return 0,
        };

        if let Some(assert_clauses) = context["script"]["assert"].as_array() {
            if !assert_clauses.is_empty() {
                let mut assertion_satisfied = false;

                for hop in &selected {
                    for clause in assert_clauses {
                        match evaluate_condition(hop, clause, context) {
                            Some(true) => assertion_satisfied = true,
                            Some(false) => return 0,
                            None => return 0,
                        }
                    }
                }

                if !assertion_satisfied {
                    return 0;
                }
            }
        }

        let winning_hop = selected[0];

        if !context
            .get("__opcodes")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"] = json!({});
        }
        if !context["__opcodes"]
            .get("checkpathhop")
            .map(|v| v.is_object())
            .unwrap_or(false)
        {
            context["__opcodes"]["checkpathhop"] = json!({});
        }

        context["__opcodes"]["checkpathhop"]["hop"] = json!({
            "to": winning_hop.to,
            "sig": winning_hop.sig,
            "value": winning_hop.value
        });

        1
    }
}
