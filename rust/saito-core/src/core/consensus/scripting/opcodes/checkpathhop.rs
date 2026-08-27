use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use base64::Engine;
use serde_json::{json, Value};

use super::super::script::resolve_ref;
use super::checkpath::verify_witness_routing_path;

struct DecodedHop {
    /// Signer of this hop: start publickey for hop 0, else previous hop's `to`.
    from: String,
    to: String,
    sig: String,
    value: Value,
}

fn decode_hops(hops: &[Value], start_publickey: &str) -> Option<Vec<DecodedHop>> {
    let mut decoded = Vec::with_capacity(hops.len());
    let mut expected_from = start_publickey.to_string();

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
            from: expected_from.clone(),
            to: to.clone(),
            sig,
            value: parsed,
        });
        expected_from = to;
    }

    Some(decoded)
}

fn lookup_field(hop: &DecodedHop, field: &str) -> Option<Value> {
    let mut parts = field.split('.');
    let first = parts.next()?;

    let mut current = match first {
        "from" => json!(hop.from),
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

fn evaluate_condition(
    hop: &DecodedHop,
    condition: &Value,
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> Option<bool> {
    let field = condition.get("field").and_then(|v| v.as_str())?;
    let operator = condition.get("operator").and_then(|v| v.as_str())?;
    let rhs_raw = condition.get("value")?;
    let ty = condition.get("type").and_then(|v| v.as_str());

    let lhs_raw = lookup_field(hop, field)?;
    let rhs_resolved = resolve_ref(rhs_raw, context, tx, blk);
    let left = coerce_value(&lhs_raw, ty);
    let right = coerce_value(&rhs_resolved, ty);

    compare_values(&left, &right, operator)
}

fn hop_satisfies_assertions(
    hop: &DecodedHop,
    assert_clauses: &[Value],
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> bool {
    for clause in assert_clauses {
        match evaluate_condition(hop, clause, context, tx, blk) {
            Some(true) => continue,
            Some(false) | None => return false,
        }
    }
    true
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

        let Some(decoded) = decode_hops(hops, start_publickey) else {
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
                        clauses.iter().all(|clause| {
                            evaluate_condition(hop, clause, context, tx, blk) == Some(true)
                        })
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
        let assert_clauses = context["script"]["assert"]
            .as_array()
            .map(|clauses| clauses.as_slice())
            .unwrap_or(&[]);

        let winning_hop: &DecodedHop = match selector {
            "FIRST" => {
                let hop = filtered[0];
                if !assert_clauses.is_empty()
                    && !hop_satisfies_assertions(hop, assert_clauses, context, tx, blk)
                {
                    return 0;
                }
                hop
            }
            "LAST" => {
                let hop = filtered[filtered.len() - 1];
                if !assert_clauses.is_empty()
                    && !hop_satisfies_assertions(hop, assert_clauses, context, tx, blk)
                {
                    return 0;
                }
                hop
            }
            "ONLY" => {
                if filtered.len() != 1 {
                    return 0;
                }
                let hop = filtered[0];
                if !assert_clauses.is_empty()
                    && !hop_satisfies_assertions(hop, assert_clauses, context, tx, blk)
                {
                    return 0;
                }
                hop
            }
            "ANY" => {
                if assert_clauses.is_empty() {
                    filtered[0]
                } else {
                    let mut matched: Option<&DecodedHop> = None;
                    for hop in &filtered {
                        if hop_satisfies_assertions(hop, assert_clauses, context, tx, blk) {
                            matched = Some(hop);
                            break;
                        }
                    }
                    match matched {
                        Some(hop) => hop,
                        None => return 0,
                    }
                }
            }
            _ => return 0,
        };

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
            "from": winning_hop.from,
            "to": winning_hop.to,
            "sig": winning_hop.sig,
            "value": winning_hop.value
        });

        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::defs::PrintForLog;
    use crate::core::util::crypto::{generate_keys, hash, sign};
    use serde_json::json;

    fn make_signed_hop(
        to: &crate::core::defs::SaitoPublicKey,
        value_json: &Value,
        signer_sk: &crate::core::defs::SaitoPrivateKey,
        binding_hash: &str,
    ) -> Value {
        let value_b64 = base64::engine::general_purpose::STANDARD
            .encode(serde_json::to_string(value_json).unwrap().as_bytes());
        let canonical = format!("{}|{}|{}", to.to_base58(), value_b64, binding_hash);
        let digest = hash(canonical.as_bytes()).to_hex();
        let sig = sign(digest.as_bytes(), signer_sk).to_hex();

        json!({
            "to": to.to_base58(),
            "value": value_b64,
            "sig": sig
        })
    }

    fn checkpathhop_context(
        start_pk: &crate::core::defs::SaitoPublicKey,
        binding_hash: &str,
        hops: Vec<Value>,
        selector: &str,
        where_clauses: Value,
        assert_clauses: Value,
    ) -> Value {
        json!({
            "script": {
                "publickey": start_pk.to_base58(),
                "hash": binding_hash,
                "selector": selector,
                "where": where_clauses,
                "assert": assert_clauses
            },
            "witness": {
                "hops": hops
            }
        })
    }

    fn two_hop_fixture() -> (
        crate::core::defs::SaitoPublicKey,
        crate::core::defs::SaitoPrivateKey,
        crate::core::defs::SaitoPublicKey,
        crate::core::defs::SaitoPrivateKey,
        crate::core::defs::SaitoPublicKey,
        crate::core::defs::SaitoPrivateKey,
        String,
        Vec<Value>,
    ) {
        let (pk0, sk0) = generate_keys();
        let (pk1, sk1) = generate_keys();
        let (pk2, sk2) = generate_keys();
        let binding_hash = "checkpathhop-test-binding".to_string();

        let hop0_value = json!({ "role": "relay", "score": 1 });
        let hop1_value = json!({ "role": "target", "score": 2 });

        let hop0 = make_signed_hop(&pk1, &hop0_value, &sk0, &binding_hash);
        let hop1 = make_signed_hop(&pk2, &hop1_value, &sk1, &binding_hash);

        (pk0, sk0, pk1, sk1, pk2, sk2, binding_hash, vec![hop0, hop1])
    }

    #[test]
    fn any_succeeds_when_first_filtered_hop_satisfies_assert() {
        let (pk0, _sk0, pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "ANY",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "relay"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 1);
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["to"].as_str(),
            Some(pk1.to_base58().as_str())
        );
    }

    #[test]
    fn any_succeeds_when_only_later_filtered_hop_satisfies_assert() {
        let (pk0, _sk0, _pk1, _sk1, pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "ANY",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "target"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 1);
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["to"].as_str(),
            Some(pk2.to_base58().as_str())
        );
    }

    #[test]
    fn any_fails_when_no_filtered_hop_satisfies_assert() {
        let (pk0, _sk0, _pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "ANY",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "missing"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 0);
    }

    #[test]
    fn first_requires_first_filtered_hop_to_satisfy_assert() {
        let (pk0, _sk0, pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "FIRST",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "relay"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 1);
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["to"].as_str(),
            Some(pk1.to_base58().as_str())
        );
    }

    #[test]
    fn first_fails_when_first_filtered_hop_does_not_satisfy_assert() {
        let (pk0, _sk0, _pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "FIRST",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "target"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 0);
    }

    #[test]
    fn last_requires_last_filtered_hop_to_satisfy_assert() {
        let (pk0, _sk0, _pk1, _sk1, pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "LAST",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "target"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 1);
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["to"].as_str(),
            Some(pk2.to_base58().as_str())
        );
    }

    #[test]
    fn last_fails_when_last_filtered_hop_does_not_satisfy_assert() {
        let (pk0, _sk0, _pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "LAST",
            json!([]),
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "relay"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 0);
    }

    #[test]
    fn only_requires_exactly_one_filtered_hop() {
        let (pk0, _sk0, pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "ONLY",
            json!([{
                "field": "value.role",
                "operator": "==",
                "value": "relay"
            }]),
            json!([{
                "field": "value.score",
                "operator": "==",
                "value": 1,
                "type": "number"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 1);
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["to"].as_str(),
            Some(pk1.to_base58().as_str())
        );
    }

    #[test]
    fn only_fails_when_more_than_one_hop_matches_where() {
        let (pk0, _sk0, _pk1, _sk1, _pk2, _sk2, binding_hash, hops) = two_hop_fixture();

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            hops,
            "ONLY",
            json!([]),
            json!([{
                "field": "value.score",
                "operator": ">",
                "value": 0,
                "type": "number"
            }]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 0);
    }

    #[test]
    fn where_from_selects_last_creator_signed_hop() {
        let (pk0, sk0, pk1, sk1, _pk2, _sk2, binding_hash, _) = two_hop_fixture();
        // Creator → Mid → Creator → Renter  (Creator signs hops 0 and 2)
        let (pk3, _sk3) = generate_keys();
        let hop0 = make_signed_hop(
            &pk1,
            &json!({ "timestamp": 1, "file_id": "f1", "expires_at": 9_000_000_000_000u64 }),
            &sk0,
            &binding_hash,
        );
        let hop1 = make_signed_hop(
            &pk0,
            &json!({ "timestamp": 2, "file_id": "f1", "expires_at": 9_000_000_000_000u64 }),
            &sk1,
            &binding_hash,
        );
        let hop2 = make_signed_hop(
            &pk3,
            &json!({
                "timestamp": 3,
                "file_id": "file-final",
                "expires_at": 9_000_000_000_000u64
            }),
            &sk0,
            &binding_hash,
        );

        let mut context = checkpathhop_context(
            &pk0,
            &binding_hash,
            vec![hop0, hop1, hop2],
            "LAST",
            json!([{
                "field": "from",
                "operator": "==",
                "value": pk0.to_base58()
            }]),
            json!([]),
        );

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 1);
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["to"].as_str(),
            Some(pk3.to_base58().as_str())
        );
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["from"].as_str(),
            Some(pk0.to_base58().as_str())
        );
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["value"]["file_id"].as_str(),
            Some("file-final")
        );
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["value"]["timestamp"].as_u64(),
            Some(3)
        );
        assert_eq!(
            context["__opcodes"]["checkpathhop"]["hop"]["value"]["expires_at"].as_u64(),
            Some(9_000_000_000_000)
        );
    }

    #[test]
    fn tampered_value_fails_signature_verification() {
        let (pk0, sk0, pk1, _sk1, _pk2, _sk2, binding_hash, _) = two_hop_fixture();
        let mut hop = make_signed_hop(
            &pk1,
            &json!({
                "timestamp": 1,
                "file_id": "good-file",
                "expires_at": 9_000_000_000_000u64
            }),
            &sk0,
            &binding_hash,
        );
        // Requester mutates the signed base64 payload without resigning.
        let bad_value = base64::engine::general_purpose::STANDARD.encode(
            serde_json::to_string(&json!({
                "timestamp": 1,
                "file_id": "other-file",
                "expires_at": 9_000_000_000_000u64
            }))
            .unwrap()
            .as_bytes(),
        );
        hop["value"] = json!(bad_value);

        let mut context =
            checkpathhop_context(&pk0, &binding_hash, vec![hop], "LAST", json!([]), json!([]));

        assert_eq!(CheckPathHop::validate(&mut context, None, None), 0);
    }

    /// Full Creator → Renter rental constitution (direct hop only).
    fn rental_script(creator: &str) -> Value {
        json!({
            "op": "OR",
            "args": [
                {
                    "op": "CHECKSENDER",
                    "publickey": creator
                },
                {
                    "op": "AND",
                    "args": [
                        {
                            "op": "CHECKPATHHOP",
                            "selector": "LAST",
                            "where": [{
                                "field": "from",
                                "operator": "==",
                                "value": creator
                            }],
                            "publickey": creator,
                            "hash": "",
                            "witness": { "hops": [] }
                        },
                        {
                            "op": "CHECKFIELD",
                            "field": "__opcodes.checkpathhop.hop.to",
                            "operator": "==",
                            "value": "REQUESTER"
                        },
                        {
                            "op": "CHECKFIELD",
                            "field": "__opcodes.checkpathhop.hop.value.timestamp",
                            "operator": ">",
                            "value": 0
                        },
                        {
                            "op": "CHECKFIELD",
                            "field": "NOW",
                            "operator": "<",
                            "value": "__opcodes.checkpathhop.hop.value.expires_at"
                        }
                    ]
                }
            ]
        })
    }

    fn requester_tx(
        pk: &crate::core::defs::SaitoPublicKey,
    ) -> crate::core::consensus::transaction::Transaction {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;
        let mut tx = Transaction::default();
        let mut slip = Slip::default();
        slip.public_key = *pk;
        tx.from.push(slip);
        tx
    }

    #[test]
    fn rental_creator_passes_first_branch() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, _sk) = generate_keys();
        let creator = creator_pk.to_base58();
        let tx = requester_tx(&creator_pk);

        let mut script = Script::new();
        script.json = rental_script(&creator);

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn rental_valid_creator_to_renter_hop_passes_before_expiry() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _renter_sk) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": now + 60_000
            }),
            &creator_sk,
            "",
        );

        let mut tree = rental_script(&creator);
        tree["args"][1]["args"][0]["witness"]["hops"] = json!([hop]);

        let mut script = Script::new();
        script.json = tree;
        let tx = requester_tx(&renter_pk);

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn rental_expired_hop_fails() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": 1,
                "file_id": "file-abc",
                "expires_at": now.saturating_sub(60_000).max(1)
            }),
            &creator_sk,
            "",
        );

        let mut tree = rental_script(&creator);
        tree["args"][1]["args"][0]["witness"]["hops"] = json!([hop]);

        let mut script = Script::new();
        script.json = tree;

        assert_eq!(
            script.validate(Some(&requester_tx(&renter_pk)), None, None, None),
            0
        );
    }

    #[test]
    fn rental_unauthorized_requester_fails() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let (other_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": now + 60_000
            }),
            &creator_sk,
            "",
        );

        let mut tree = rental_script(&creator);
        tree["args"][1]["args"][0]["witness"]["hops"] = json!([hop]);

        let mut script = Script::new();
        script.json = tree;

        assert_eq!(
            script.validate(Some(&requester_tx(&other_pk)), None, None, None),
            0
        );
    }

    #[test]
    fn rental_tampered_json_value_fails() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": now + 60_000
            }),
            &creator_sk,
            "",
        );
        hop["value"] = json!(base64::engine::general_purpose::STANDARD.encode(
            serde_json::to_string(&json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": now + 3_600_000
            }))
            .unwrap()
            .as_bytes(),
        ));

        let mut tree = rental_script(&creator);
        tree["args"][1]["args"][0]["witness"]["hops"] = json!([hop]);

        let mut script = Script::new();
        script.json = tree;

        assert_eq!(
            script.validate(Some(&requester_tx(&renter_pk)), None, None, None),
            0
        );
    }

    /// Matches Vault FILE_TX access script:
    ///   OR( CHECKSENDER(creator),
    ///       AND( CHECKPATHHOP FIRST delegated==0, DB_UPDATE_SCHEMA ) )
    /// DB_UPDATE_SCHEMA =
    ///   OR( AND(hop.to==REQUESTER, NOW<expires_at, CHECKKEY db!=owner),
    ///       AND(CHECKSENDER(creator), NOW>expires_at) )
    fn vault_file_tx_constitution(creator: &str) -> Value {
        json!({
            "op": "OR",
            "args": [
                {
                    "op": "CHECKSENDER",
                    "publickey": creator
                },
                {
                    "op": "AND",
                    "args": [
                        {
                            "op": "CHECKPATHHOP",
                            "selector": "FIRST",
                            "where": [{
                                "field": "value.delegated",
                                "operator": "==",
                                "value": 0
                            }],
                            "publickey": creator,
                            "hash": "",
                            "witness": { "hops": [] }
                        },
                        {
                            "op": "OR",
                            "args": [
                                {
                                    "op": "AND",
                                    "args": [
                                        {
                                            "op": "CHECKFIELD",
                                            "field": "__opcodes.checkpathhop.hop.to",
                                            "operator": "==",
                                            "value": "REQUESTER"
                                        },
                                        {
                                            "op": "CHECKFIELD",
                                            "field": "NOW",
                                            "operator": "<",
                                            "value": "__opcodes.checkpathhop.hop.value.expires_at"
                                        },
                                        {
                                            "op": "CHECKKEY",
                                            "field": "db",
                                            "operator": "!=",
                                            "key": "owner"
                                        }
                                    ]
                                },
                                {
                                    "op": "AND",
                                    "args": [
                                        {
                                            "op": "CHECKSENDER",
                                            "publickey": creator
                                        },
                                        {
                                            "op": "CHECKFIELD",
                                            "field": "NOW",
                                            "operator": ">",
                                            "value": "__opcodes.checkpathhop.hop.value.expires_at"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        })
    }

    fn attach_path_hop(tree: &mut Value, hop: Value) {
        tree["args"][1]["args"][0]["witness"]["hops"] = json!([hop]);
    }

    /// Case 5: CREATOR — top-level CHECKSENDER; no path required.
    #[test]
    fn vault_constitution_creator_passes_without_path() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let mut script = Script::new();
        script.json = vault_file_tx_constitution(&creator);

        // Even with empty db / no hops, creator outer branch succeeds.
        let ctx = json!({ "db": { "type": "UPDATE", "owner": "hello" } });
        assert_eq!(
            script.validate_with_context(
                Some(&requester_tx(&creator_pk)),
                None,
                None,
                None,
                Some(&ctx)
            ),
            1
        );
    }

    /// Case 1: RENTER + valid path + before expiry + db WITHOUT owner → PASS
    #[test]
    fn vault_constitution_renter_non_owner_update_passes() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": now + 60_000,
                "delegated": 0
            }),
            &creator_sk,
            "",
        );

        let mut tree = vault_file_tx_constitution(&creator);
        attach_path_hop(&mut tree, hop);

        let mut script = Script::new();
        script.json = tree;

        // Archive-shaped context for a non-owner metadata update
        let ctx = json!({
            "db": {
                "type": "UPDATE",
                "updated_at": now,
                "field5": "allowed"
            }
        });

        assert_eq!(
            script.validate_with_context(
                Some(&requester_tx(&renter_pk)),
                None,
                None,
                None,
                Some(&ctx)
            ),
            1
        );
    }

    /// Case 2: RENTER + valid path + before expiry + db.owner = "hello" → FAIL
    #[test]
    fn vault_constitution_renter_owner_hello_update_fails() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": now + 60_000,
                "delegated": 0
            }),
            &creator_sk,
            "",
        );

        let mut tree = vault_file_tx_constitution(&creator);
        attach_path_hop(&mut tree, hop);

        let mut script = Script::new();
        script.json = tree;

        // Exact Archive checkout shape for owner: "hello"
        let ctx = json!({
            "db": {
                "type": "UPDATE",
                "owner": "hello",
                "updated_at": now
            }
        });

        assert_eq!(
            script.validate_with_context(
                Some(&requester_tx(&renter_pk)),
                None,
                None,
                None,
                Some(&ctx)
            ),
            0,
            "CHECKKEY(db != owner) must fail when context.db contains owner"
        );
    }

    /// Case 3: RENTER + expired path → FAIL
    #[test]
    fn vault_constitution_renter_expired_fails() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": 1,
                "file_id": "file-abc",
                "expires_at": now.saturating_sub(60_000).max(1),
                "delegated": 0
            }),
            &creator_sk,
            "",
        );

        let mut tree = vault_file_tx_constitution(&creator);
        attach_path_hop(&mut tree, hop);

        let mut script = Script::new();
        script.json = tree;

        let ctx = json!({
            "db": {
                "type": "UPDATE",
                "updated_at": now,
                "field5": "allowed"
            }
        });

        assert_eq!(
            script.validate_with_context(
                Some(&requester_tx(&renter_pk)),
                None,
                None,
                None,
                Some(&ctx)
            ),
            0
        );
    }

    /// Case 4: Invalid CHECKPATHHOP (empty hops) → FAIL for renter
    #[test]
    fn vault_constitution_invalid_path_fails_for_renter() {
        use crate::core::consensus::scripting::script::Script;

        let (creator_pk, _) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // No hops attached — CHECKPATHHOP fails
        let mut script = Script::new();
        script.json = vault_file_tx_constitution(&creator);

        let ctx = json!({
            "db": {
                "type": "UPDATE",
                "updated_at": now,
                "field5": "allowed"
            }
        });

        assert_eq!(
            script.validate_with_context(
                Some(&requester_tx(&renter_pk)),
                None,
                None,
                None,
                Some(&ctx)
            ),
            0
        );
    }

    /// Vault-defined LOAN_SCRIPT template (matches node/mods/vault/lib/contracts/loan.js).
    fn loan_script_template(creator: &str) -> Value {
        json!({
            "op": "OR",
            "args": [
                {
                    "op": "AND",
                    "args": [
                        { "op": "CHECKSENDER", "publickey": "LOAN_RENTER_PLACEHOLDER" },
                        { "op": "CHECKFIELD", "field": "NOW", "operator": "<", "value": 0 }
                    ]
                },
                {
                    "op": "AND",
                    "args": [
                        { "op": "CHECKSENDER", "publickey": creator },
                        { "op": "CHECKFIELD", "field": "NOW", "operator": ">", "value": 0 }
                    ]
                }
            ]
        })
    }

    fn instantiate_loan_script(creator: &str, renter: &str, expires_at: u64) -> Value {
        let mut loan = loan_script_template(creator);
        *loan
            .pointer_mut("/args/0/args/0/publickey")
            .expect("loan renter publickey") = json!(renter);
        *loan
            .pointer_mut("/args/0/args/1/value")
            .expect("loan renter expiry") = json!(expires_at);
        *loan
            .pointer_mut("/args/1/args/1/value")
            .expect("loan creator expiry") = json!(expires_at);
        loan
    }

    /// DB_UPDATE_LOGIC matching node/mods/vault/lib/contracts/rental.js
    fn db_update_logic(creator: &str) -> Value {
        json!({
            "op": "AND",
            "args": [
                {
                    "op": "SETFIELD",
                    "reference": "context.loan_script",
                    "value": loan_script_template(creator)
                },
                {
                    "op": "SETFIELD",
                    "reference": "context.loan_script.args[0].args[0].publickey",
                    "value": "__opcodes.checkpathhop.hop.to"
                },
                {
                    "op": "SETFIELD",
                    "reference": "context.loan_script.args[0].args[1].value",
                    "value": "__opcodes.checkpathhop.hop.value.expires_at"
                },
                {
                    "op": "SETFIELD",
                    "reference": "context.loan_script.args[1].args[1].value",
                    "value": "__opcodes.checkpathhop.hop.value.expires_at"
                },
                {
                    "op": "SCRIPTHASH",
                    "source": "context.loan_script",
                    "into": "hash"
                },
                {
                    "op": "CHECKFIELD",
                    "field": "db.type",
                    "operator": "==",
                    "value": "UPDATE"
                },
                {
                    "op": "CHECKKEY",
                    "field": "db",
                    "operator": "==",
                    "key": "owner"
                },
                {
                    "op": "CHECKKEY",
                    "field": "db",
                    "operator": "IN",
                    "key": ["type", "owner", "updated_at"]
                },
                {
                    "op": "CHECKFIELD",
                    "field": "db.owner",
                    "operator": "==",
                    "value": "__opcodes.scripthash.hash"
                }
            ]
        })
    }

    fn vault_file_tx_loan_update(creator: &str) -> Value {
        json!({
            "op": "OR",
            "args": [
                { "op": "CHECKSENDER", "publickey": creator },
                {
                    "op": "AND",
                    "args": [
                        {
                            "op": "CHECKPATHHOP",
                            "selector": "FIRST",
                            "where": [{
                                "field": "value.delegated",
                                "operator": "==",
                                "value": 0
                            }],
                            "publickey": creator,
                            "hash": "",
                            "witness": { "hops": [] }
                        },
                        db_update_logic(creator)
                    ]
                }
            ]
        })
    }

    fn loan_eval_fixture(
        expires_offset_ms: i64,
    ) -> (
        crate::core::defs::SaitoPublicKey,
        crate::core::defs::SaitoPublicKey,
        String,
        u64,
        Value,
        crate::core::consensus::transaction::Transaction,
    ) {
        let (creator_pk, creator_sk) = generate_keys();
        let (renter_pk, _) = generate_keys();
        let creator = creator_pk.to_base58();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let expires_at = if expires_offset_ms >= 0 {
            now + expires_offset_ms as u64
        } else {
            now.saturating_sub((-expires_offset_ms) as u64).max(1)
        };

        let hop = make_signed_hop(
            &renter_pk,
            &json!({
                "timestamp": now,
                "file_id": "file-abc",
                "expires_at": expires_at,
                "delegated": 0
            }),
            &creator_sk,
            "",
        );
        let mut tree = vault_file_tx_loan_update(&creator);
        attach_path_hop(&mut tree, hop);
        (
            creator_pk,
            renter_pk,
            creator,
            expires_at,
            tree,
            requester_tx(&renter_pk),
        )
    }

    #[test]
    fn vault_loan_update_db_type_not_update_fails() {
        use crate::core::consensus::scripting::script::Script;
        let (_c, renter_pk, creator, expires_at, tree, tx) = loan_eval_fixture(60_000);
        let expected = Script {
            json: instantiate_loan_script(&creator, &renter_pk.to_base58(), expires_at),
        }
        .hash();
        let ctx = json!({ "db": { "type": "DELETE", "owner": expected } });
        let mut script = Script::new();
        script.json = tree;
        assert_eq!(
            script.validate_with_context(Some(&tx), None, None, None, Some(&ctx)),
            0
        );
    }

    #[test]
    fn vault_loan_update_wrong_owner_hash_fails() {
        use crate::core::consensus::scripting::script::Script;
        let (_c, _r, _creator, _exp, tree, tx) = loan_eval_fixture(60_000);
        let ctx = json!({
            "db": { "type": "UPDATE", "owner": "hello", "updated_at": 1 }
        });
        let mut script = Script::new();
        script.json = tree;
        assert_eq!(
            script.validate_with_context(Some(&tx), None, None, None, Some(&ctx)),
            0
        );
    }

    #[test]
    fn vault_loan_update_correct_owner_hash_passes() {
        use crate::core::consensus::scripting::script::Script;
        let (_c, renter_pk, creator, expires_at, tree, tx) = loan_eval_fixture(60_000);
        let expected = Script {
            json: instantiate_loan_script(&creator, &renter_pk.to_base58(), expires_at),
        }
        .hash();
        let ctx = json!({
            "db": { "type": "UPDATE", "owner": expected, "updated_at": 1 }
        });
        let mut script = Script::new();
        script.json = tree;
        assert_eq!(
            script.validate_with_context(Some(&tx), None, None, None, Some(&ctx)),
            1
        );
    }

    #[test]
    fn vault_loan_update_extra_db_field_fails() {
        use crate::core::consensus::scripting::script::Script;
        let (_c, renter_pk, creator, expires_at, tree, tx) = loan_eval_fixture(60_000);
        let expected = Script {
            json: instantiate_loan_script(&creator, &renter_pk.to_base58(), expires_at),
        }
        .hash();
        let ctx = json!({
            "db": { "type": "UPDATE", "owner": expected, "updated_at": 1, "field5": "extra" }
        });
        let mut script = Script::new();
        script.json = tree;
        assert_eq!(
            script.validate_with_context(Some(&tx), None, None, None, Some(&ctx)),
            0
        );
    }

    #[test]
    fn vault_loan_update_hash_follows_hop_to_not_caller_script() {
        use crate::core::consensus::scripting::script::Script;
        let (_c, renter_pk, creator, expires_at, tree, tx) = loan_eval_fixture(60_000);
        let wrong_tree = instantiate_loan_script(&creator, "NOT_THE_RENTER", expires_at);
        let right_tree = instantiate_loan_script(&creator, &renter_pk.to_base58(), expires_at);
        assert_ne!(
            serde_json::to_string(&wrong_tree).unwrap(),
            serde_json::to_string(&right_tree).unwrap(),
            "instantiated loan JSON must differ for different renters"
        );
        let wrong = Script { json: wrong_tree }.hash();
        let right = Script { json: right_tree }.hash();
        assert_ne!(wrong, right);
        let ctx_wrong = json!({ "db": { "type": "UPDATE", "owner": wrong } });
        let ctx_injected = json!({
            "db": { "type": "UPDATE", "owner": right },
            "loan_script": instantiate_loan_script(&creator, "NOT_THE_RENTER", expires_at)
        });
        let mut script = Script::new();
        script.json = tree.clone();
        assert_eq!(
            script.validate_with_context(Some(&tx), None, None, None, Some(&ctx_wrong)),
            0
        );
        // Caller-supplied context.loan_script is overwritten by SETFIELD of the Vault template.
        let mut script2 = Script::new();
        script2.json = tree;
        assert_eq!(
            script2.validate_with_context(Some(&tx), None, None, None, Some(&ctx_injected)),
            1
        );
    }

    #[test]
    fn vault_loan_update_changing_expires_at_changes_hash() {
        use crate::core::consensus::scripting::script::Script;
        let (_c, renter_pk, creator, expires_at, tree, tx) = loan_eval_fixture(60_000);
        let other_hash = Script {
            json: instantiate_loan_script(
                &creator,
                &renter_pk.to_base58(),
                expires_at.saturating_add(1_000_000),
            ),
        }
        .hash();
        let ctx = json!({ "db": { "type": "UPDATE", "owner": other_hash } });
        let mut script = Script::new();
        script.json = tree;
        assert_eq!(
            script.validate_with_context(Some(&tx), None, None, None, Some(&ctx)),
            0
        );
    }
}
