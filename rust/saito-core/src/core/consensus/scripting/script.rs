use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey};
use crate::core::util::crypto;
use log::info;
use serde_json::{json, Value};

#[cfg(target_arch = "wasm32")]
use js_sys;

use super::opcodes::{
    Arrayify, CheckField, CheckHash, CheckKey, CheckMultiSig, CheckOwn, CheckOwnNft,
    CheckOwnNftWhere, CheckPath, CheckPathHop, CheckRecipient, CheckSender, CheckSig, CheckTime,
    ImportArray, ImportField, ScriptHash, SetArray, SetArrayField, SetField, SumFields,
};

/// Canonical JSON serialization used by script hashing and signed imports.
///
/// Objects emit keys in sorted order. Arrays preserve element order. Scalars
/// use the same encoding as `Script::hash`.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => {
            if *b {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        Value::Number(n) => serde_json::to_string(&Value::Number(n.clone())).unwrap(),
        Value::String(s) => serde_json::to_string(s).unwrap(),
        Value::Array(arr) => {
            let mut out = String::from('[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonical_json(item));
            }
            out.push(']');
            out
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut out = String::from('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).unwrap());
                out.push(':');
                out.push_str(&canonical_json(&map[*key]));
            }
            out.push('}');
            out
        }
    }
}

pub const TEST_SCRIPT: &str = r#"{
  "op": "CHECKHASH",
  "hash": "ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f",
  "witness": {
    "input": "hello"
  }
}"#;

pub struct Script {
    pub json: Value,
}

impl Script {
    pub fn new() -> Self {
        Self { json: Value::Null }
    }

    pub fn create(&mut self, text: &str) {
        todo!()
    }

    pub fn from_json(json: &str) -> Self {
        let mut script = Script::new();
        script.parse(json);
        script
    }

    pub fn merge_witness(script: &Value, witness: &Value) -> Value {
        let mut merged = script.clone();

        let witness_items = match witness.as_array() {
            Some(v) => v,
            None => return merged,
        };

        let mut witness_index: usize = 0;

        fn walk(node: &mut Value, witness_items: &Vec<Value>, witness_index: &mut usize) {
            //
            // recurse through logical operators
            //
            if let Some(op) = node.get("op").and_then(|v| v.as_str()) {
                match op.to_uppercase().as_str() {
                    "AND" | "OR" => {
                        if let Some(args) = node.get_mut("args").and_then(|v| v.as_array_mut()) {
                            for child in args.iter_mut() {
                                walk(child, witness_items, witness_index);
                            }
                        }

                        return;
                    }

                    "NOT" => {
                        if let Some(args) = node.get_mut("args").and_then(|v| v.as_array_mut()) {
                            if let Some(child) = args.get_mut(0) {
                                walk(child, witness_items, witness_index);
                            }
                        }

                        return;
                    }

                    _ => {}
                }
            }

            //
            // already contains witness
            //
            if node
                .get("witness")
                .and_then(|v| v.as_object())
                .map(|o| !o.is_empty())
                .unwrap_or(false)
            {
                return;
            }

            //
            // no remaining witness
            //
            if *witness_index >= witness_items.len() {
                return;
            }

            //
            // witness entry must be an object
            //
            let Some(witness_object) = witness_items[*witness_index].as_object() else {
                *witness_index += 1;
                return;
            };

            //
            // consume this witness
            //
            *witness_index += 1;

            let Some(node_object) = node.as_object_mut() else {
                return;
            };

            node_object.insert("witness".to_string(), Value::Object(witness_object.clone()));
        }

        walk(&mut merged, witness_items, &mut witness_index);

        merged
    }

    pub fn parse(&mut self, json: &str) {
        self.json = serde_json::from_str(json).expect("parse: invalid JSON");
    }

    pub fn validate(
        &self,
        tx: Option<&Transaction>,
        blk: Option<&Block>,
        blockchain: Option<&Blockchain>,
        current_p2sh_idx: Option<usize>,
    ) -> u8 {
        self.validate_with_context(tx, blk, blockchain, current_p2sh_idx, None)
    }

    pub fn validate_with_context(
        &self,
        tx: Option<&Transaction>,
        blk: Option<&Block>,
        blockchain: Option<&Blockchain>,
        current_p2sh_idx: Option<usize>,
        supplied_context: Option<&Value>,
    ) -> u8 {
        /*
        // 1) Start from caller-supplied context when it is a JSON object.
        // 2) Then overwrite Rust-authoritative fields.
         */

        let mut context = match supplied_context {
            Some(Value::Object(_)) => supplied_context.unwrap().clone(),
            _ => json!({}),
        };

        // Engine-managed structural keys: always reset.
        context["script"] = json!({});
        context["witness"] = json!({});
        context["variables"] = json!({});

        // These are not JSON context keys in this engine; they are separate
        // validate/eval parameters. Strip any caller-supplied collisions.
        if let Some(obj) = context.as_object_mut() {
            obj.remove("tx");
            obj.remove("blk");
            obj.remove("blockchain");
        }

        /*
        // set authoritative context variables
         */
>>>>>>> nwasm_arcade_refactor

        //
        // set context variables
        //
        if let Some(idx) = current_p2sh_idx {
            context["__current_p2sh_idx"] = json!(idx);
        }

        // NOW is node/block time for access checks, not the request tx timestamp.
        // Archive evaluates with a request tx and no block; using tx.timestamp would
        // let requesters backdate past expires_at. Prefer block time when present,
        // otherwise the evaluating node's wall clock.
        let now_ms = if let Some(blk) = blk {
            blk.timestamp
        } else {
            #[cfg(target_arch = "wasm32")]
            {
                js_sys::Date::now() as u64
            }

            #[cfg(not(target_arch = "wasm32"))]
            {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64
            }
        };

        context["NOW"] = json!(now_ms);

        if let Some(tx) = tx {
            if let Some(slip) = tx.from.first() {
                context["REQUESTER"] = json!(slip.public_key.to_base58());
            }
        } else {
            if let Some(obj) = context.as_object_mut() {
                obj.remove("REQUESTER");
            }
        }

        fn eval(
            node: &Value,
            context: &mut Value,
            tx: Option<&Transaction>,
            blk: Option<&Block>,
            blockchain: Option<&Blockchain>,
            path: &str,
        ) -> u8 {
            let op = node["op"].as_str().unwrap_or("").to_uppercase();
            if op.is_empty() {
                return 0;
            }

            //
            // logical operators
            //
            match op.as_str() {
                "AND" => {
                    let default_args = Vec::new();
                    let args = node["args"].as_array().unwrap_or(&default_args);
                    for (i, child) in args.iter().enumerate() {
                        let child_path = format!("{}.AND[{}]", path, i);
                        let child_result = eval(child, context, tx, blk, blockchain, &child_path);
                        if child_result == 0 {
                            return 0;
                        }
                    }

                    return 1;
                }

                "OR" => {
                    let default_args = Vec::new();
                    let args = node["args"].as_array().unwrap_or(&default_args);
                    for (i, child) in args.iter().enumerate() {
                        let child_path = format!("{}.OR[{}]", path, i);
                        let child_result = eval(child, context, tx, blk, blockchain, &child_path);
                        if child_result == 1 {
                            return 1;
                        }
                    }

                    return 0;
                }

                "NOT" => {
                    let default_args = Vec::new();
                    let args = node["args"].as_array().unwrap_or(&default_args);

                    if args.is_empty() {
                        return 1;
                    }

                    let child_path = format!("{}.NOT[0]", path);
                    let inner = eval(&args[0], context, tx, blk, blockchain, &child_path);
                    let result = if inner == 1 { 0 } else { 1 };
                    return result;
                }

                _ => {}
            }

            //
            // refresh "script" and "witness"
            //
            // Object `reference` embeds witness values into the locking script.
            // String `reference` is a normal script parameter (e.g. SETFIELD / ARRAYIFY).
            //
            context["script"] = json!({});
            context["witness"] = json!({});
            if let Some(reference) = node.get("reference") {
                if reference.is_object() {
                    context["witness"] = reference.clone();
                }
            }
            if let Some(witness) = node.get("witness") {
                if let (Some(dst), Some(src)) =
                    (context["witness"].as_object_mut(), witness.as_object())
                {
                    for (k, v) in src {
                        dst.insert(k.clone(), v.clone());
                    }
                }
            }
            if let Some(obj) = node.as_object() {
                let script_obj = context["script"].as_object_mut().unwrap();

                for (k, v) in obj {
                    if k == "op" {
                        continue;
                    }

                    if k == "witness" {
                        continue;
                    }

                    if k == "reference" && v.is_object() {
                        continue;
                    }

                    script_obj.insert(k.clone(), v.clone());
                }
            }

            //
            // opcode dispatch
            //
            let result = match op.as_str() {
                "CHECKHASH" => {
                    let expected = context["script"]["hash"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let input = context["witness"]["input"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let computed = if input.is_empty() {
                        String::new()
                    } else {
                        crypto::hash(input.as_bytes()).to_hex()
                    };
                    let r = CheckHash::execute(context, tx, blk);
                    if r == 0 {
                    }
                    r
                }

                "CHECKSIG" => CheckSig::validate(context, tx, blk),
                "CHECKMULTISIG" => CheckMultiSig::validate(context, tx, blk),
                "IMPORTFIELD" => ImportField::validate(context, tx, blk),
                "IMPORTARRAY" => ImportArray::validate(context, tx, blk),
                "SUMFIELDS" => SumFields::validate(context, tx, blk),
                "SCRIPTHASH" => ScriptHash::validate(context, tx, blk),
                "SETFIELD" => SetField::validate(context, tx, blk),
                "SETARRAY" => SetArray::validate(context, tx, blk),
                "SETARRAYFIELD" => SetArrayField::validate(context, tx, blk),
                "ARRAYIFY" => Arrayify::validate(context, tx, blk),
                "CHECKFIELD" => CheckField::validate(context, tx, blk),
                "CHECKOWN" => CheckOwn::validate(context, tx, blk, blockchain),
                "CHECKOWNNFT" => CheckOwnNft::validate(context, tx, blk, blockchain),
                "CHECKOWNNFTWHERE" => CheckOwnNftWhere::validate(context, tx, blk, blockchain),
                "CHECKSENDER" => CheckSender::validate(context, tx, blk),
                "CHECKRECIPIENT" => CheckRecipient::validate(context, tx, blk),
                "CHECKPATH" => CheckPath::validate(context, tx, blk),
                "CHECKPATHHOP" => CheckPathHop::validate(context, tx, blk),
                "CHECKTIME" => CheckTime::validate(context, tx, blk),

                _ => {
                    0
                }
            };

            if result == 1 {
            } else {
            }
            result
        }

        let final_result = eval(&self.json, &mut context, tx, blk, blockchain, "root");
        final_result
    }

    //
    // the "script hash" is HASH(canonical_json(script)) after every "witness"
    // key has been removed. Nested args and opcode fields are part of identity.
    // Witness / routing hops are not.
    //
    pub fn hash(&self) -> String {
        let mut data = self.json.clone();
        let mut pending: Vec<&mut Value> = vec![&mut data];

        while let Some(node) = pending.pop() {
            match node {
                Value::Array(arr) => {
                    for item in arr.iter_mut() {
                        pending.push(item);
                    }
                }
                Value::Object(map) => {
                    map.remove("witness");
                    for (_, val) in map.iter_mut() {
                        pending.push(val);
                    }
                }
                _ => {}
            }
        }

        crypto::hash(canonical_json(&data).as_bytes()).to_hex()
    }

    pub fn address(&self) -> SaitoPublicKey {
        let hash_hex = self.hash();
        let hash_bytes = hex::decode(hash_hex).expect("script hash should be valid hex");

        let mut address: SaitoPublicKey = [0; 33];

        address[0] = 0x00;
        address[1..33].copy_from_slice(&hash_bytes[..32]);

        address
    }

    /// Script commitment as hex: `00` + 32-byte script hash (66 characters).
    pub fn address_hex(&self) -> String {
        format!("00{}", self.hash())
    }

    pub fn get(&self, path: &str) -> Value {
        let parts: Vec<&str> = path.split('.').filter(|s| !s.is_empty()).collect();
        if parts.is_empty() {
            return self.json.clone();
        }
        let mut current = &self.json;
        for part in parts {
            match current {
                Value::Object(map) => match map.get(part) {
                    Some(v) => current = v,
                    None => return Value::Null,
                },
                _ => return Value::Null,
            }
        }
        current.clone()
    }

    pub fn get_string(&self, path: &str) -> String {
        match self.get(path).as_str() {
            Some(s) => s.to_string(),
            None => String::new(),
        }
    }

    pub fn get_integer(&self, path: &str) -> u64 {
        self.get(path).as_u64().unwrap_or(0)
    }

    pub fn get_boolean(&self, path: &str) -> bool {
        self.get(path).as_bool().unwrap_or(false)
    }

    pub fn set(&mut self, path: &str, value: Value) {
        let parts: Vec<&str> = path.split('.').filter(|s| !s.is_empty()).collect();
        if parts.is_empty() {
            self.json = value;
            return;
        }
        set_at(&mut self.json, &parts, value);
    }

    pub fn set_string(&mut self, path: &str, value: String) {
        self.set(path, Value::String(value));
    }

    pub fn set_integer(&mut self, path: &str, value: u64) {
        self.set(path, Value::Number(value.into()));
    }

    pub fn set_boolean(&mut self, path: &str, value: bool) {
        self.set(path, Value::Bool(value));
    }

    pub fn print(&self) {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use crate::core::defs::PrintForLog;
    use serde_json::{json, Value};

    use super::Script;

    fn loan_script(creator: &str, renter: &str, expires_at: u64) -> Value {
        json!({
            "op": "OR",
            "args": [
                {
                    "op": "AND",
                    "args": [
                        { "op": "CHECKSENDER", "publickey": renter },
                        { "op": "CHECKFIELD", "field": "NOW", "operator": "<", "value": expires_at }
                    ]
                },
                {
                    "op": "AND",
                    "args": [
                        { "op": "CHECKSENDER", "publickey": creator },
                        { "op": "CHECKFIELD", "field": "NOW", "operator": ">", "value": expires_at }
                    ]
                }
            ]
        })
    }

    fn file_script(checkpathhop: Value) -> Value {
        json!({
            "op": "OR",
            "args": [
                { "op": "CHECKSENDER", "publickey": "creator-pk" },
                {
                    "op": "AND",
                    "args": [
                        checkpathhop,
                        { "op": "CHECKFIELD", "field": "db.type", "operator": "==", "value": "UPDATE" }
                    ]
                }
            ]
        })
    }

    fn checkpathhop_config(
        publickey: &str,
        selector: &str,
        binding_hash: &str,
        delegated: i64,
        witness: Option<Value>,
    ) -> Value {
        let mut node = json!({
            "op": "CHECKPATHHOP",
            "selector": selector,
            "where": [{ "field": "value.delegated", "operator": "==", "value": delegated }],
            "publickey": publickey,
            "hash": binding_hash
        });
        if let Some(w) = witness {
            node["witness"] = w;
        }
        node
    }

    #[test]
    fn hash_nested_checksig_publickey_changes_digest() {
        let alice = json!({
            "op": "AND",
            "args": [{
                "op": "CHECKSIG",
                "publickey": "Alice",
                "msg": "hello"
            }]
        });
        let bob = json!({
            "op": "AND",
            "args": [{
                "op": "CHECKSIG",
                "publickey": "Bob",
                "msg": "hello"
            }]
        });
        assert_ne!(
            Script { json: alice }.hash(),
            Script { json: bob }.hash()
        );
    }

    #[test]
    fn hash_nested_checkhash_value_changes_digest() {
        let a = json!({
            "op": "AND",
            "args": [
                {
                    "op": "AND",
                    "args": [
                        { "op": "CHECKSIG", "publickey": "pk", "msg": "text" },
                        { "op": "CHECKHASH", "hash": "hash-a" }
                    ]
                },
                { "op": "CHECKHASH", "hash": "hash-outer" }
            ]
        });
        let mut b = a.clone();
        b["args"][0]["args"][1]["hash"] = json!("hash-b");
        assert_ne!(Script { json: a }.hash(), Script { json: b }.hash());
    }

    #[test]
    fn hash_loan_script_renter_changes_digest() {
        assert_ne!(
            Script {
                json: loan_script("creator", "renter-a", 1000)
            }
            .hash(),
            Script {
                json: loan_script("creator", "renter-b", 1000)
            }
            .hash()
        );
    }

    #[test]
    fn hash_loan_script_expires_at_changes_digest() {
        assert_ne!(
            Script {
                json: loan_script("creator", "renter", 1000)
            }
            .hash(),
            Script {
                json: loan_script("creator", "renter", 2000)
            }
            .hash()
        );
    }

    #[test]
    fn hash_file_script_ignores_checkpathhop_witness() {
        let locking = checkpathhop_config("creator-pk", "FIRST", "", 0, None);
        let with_witness = checkpathhop_config(
            "creator-pk",
            "FIRST",
            "",
            0,
            Some(json!({
                "hops": [{
                    "to": "renter-pk",
                    "sig": "sig-bytes",
                    "value": "eyJleHBpcmVzX2F0IjoxLCJkZWxlZ2F0ZWQiOjB9"
                }]
            })),
        );
        let other_witness = checkpathhop_config(
            "creator-pk",
            "FIRST",
            "",
            0,
            Some(json!({
                "hops": [{
                    "to": "other-renter",
                    "sig": "different-sig",
                    "value": "eyJleHBpcmVzX2F0IjoyLCJkZWxlZ2F0ZWQiOjF9"
                }]
            })),
        );
        let h_none = Script {
            json: file_script(locking),
        }
        .hash();
        let h_wit = Script {
            json: file_script(with_witness),
        }
        .hash();
        let h_other = Script {
            json: file_script(other_witness),
        }
        .hash();
        assert_eq!(h_none, h_wit);
        assert_eq!(h_wit, h_other);
    }

    #[test]
    fn hash_file_script_includes_checkpathhop_configuration() {
        let base = checkpathhop_config("creator-pk", "FIRST", "", 0, None);
        let pk = checkpathhop_config("other-creator", "FIRST", "", 0, None);
        let selector = checkpathhop_config("creator-pk", "LAST", "", 0, None);
        let binding = checkpathhop_config("creator-pk", "FIRST", "binding", 0, None);
        let where_v = checkpathhop_config("creator-pk", "FIRST", "", 1, None);
        let h_base = Script {
            json: file_script(base),
        }
        .hash();
        assert_ne!(
            h_base,
            Script {
                json: file_script(pk)
            }
            .hash()
        );
        assert_ne!(
            h_base,
            Script {
                json: file_script(selector)
            }
            .hash()
        );
        assert_ne!(
            h_base,
            Script {
                json: file_script(binding)
            }
            .hash()
        );
        assert_ne!(
            h_base,
            Script {
                json: file_script(where_v)
            }
            .hash()
        );
    }

    #[test]
    fn hash_does_not_mutate_original_witness() {
        let json = json!({
            "op": "CHECKPATHHOP",
            "publickey": "creator-pk",
            "selector": "FIRST",
            "hash": "",
            "witness": { "hops": [{ "to": "renter" }] }
        });
        let script = Script { json: json.clone() };
        let _ = script.hash();
        assert_eq!(script.json, json);
        assert_eq!(script.json["witness"]["hops"][0]["to"], "renter");
    }

    #[test]
    fn validate_checkhash_fixture_returns_success() {
        let mut script = Script::new();
        script.parse(super::TEST_SCRIPT);
        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_checksig_fixture_returns_success() {
        let mut script = Script::new();
        script.parse(
            r#"{
  "op": "CHECKSIG",
  "publickey": "xM2vUs5XCpNjYjcgxk4yVhybDcayk3tnwZNWrFg7jRGs",
  "msg": "hello",
  "witness": {
    "signature": "feb62fe225dd4b15e7ac6fe472c046715e77e8f01b93d501300353104630fdce3abdf31ad517c4d7f062d24d715d72ad66e0770d27d3e5c6b98f58151bd65b0c"
  }
}"#,
        );
        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_checksig_invalid_signature_returns_failure() {
        let mut script = Script::new();
        script.parse(
            r#"{
  "op": "CHECKSIG",
  "publickey": "xM2vUs5XCpNjYjcgxk4yVhybDcayk3tnwZNWrFg7jRGs",
  "msg": "hello",
  "witness": {
    "signature": "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
  }
}"#,
        );
        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkmultisig_three_publickeys_m_omitted_two_signatures_fails() {
        let (pk1, sk1) = crate::core::util::crypto::generate_keys();
        let (pk2, sk2) = crate::core::util::crypto::generate_keys();
        let (pk3, _) = crate::core::util::crypto::generate_keys();
        let msg = "multisig threshold default";
        let sig1 = crate::core::util::crypto::sign(msg.as_bytes(), &sk1).to_hex();
        let sig2 = crate::core::util::crypto::sign(msg.as_bytes(), &sk2).to_hex();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKMULTISIG",
                "publickeys": [pk1.to_base58(), pk2.to_base58(), pk3.to_base58()],
                "msg": msg,
                "witness": {
                    "signatures": [sig1, sig2]
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkmultisig_empty_publickeys_fails() {
        let mut script = Script::new();
        script.parse(
            r#"{
  "op": "CHECKMULTISIG",
  "m": 1,
  "publickeys": [],
  "msg": "hello",
  "witness": {
    "signatures": ["feb62fe225dd4b15e7ac6fe472c046715e77e8f01b93d501300353104630fdce3abdf31ad517c4d7f062d24d715d72ad66e0770d27d3e5c6b98f58151bd65b0c"]
  }
}"#,
        );
        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkmultisig_empty_signatures_fails() {
        let mut script = Script::new();
        script.parse(
            r#"{
  "op": "CHECKMULTISIG",
  "m": 1,
  "publickeys": ["xM2vUs5XCpNjYjcgxk4yVhybDcayk3tnwZNWrFg7jRGs"],
  "msg": "hello",
  "witness": {
    "signatures": []
  }
}"#,
        );
        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkmultisig_duplicate_signatures_cannot_reuse_publickey() {
        let (pk1, sk1) = crate::core::util::crypto::generate_keys();
        let msg = "duplicate signature reuse";
        let sig1 = crate::core::util::crypto::sign(msg.as_bytes(), &sk1).to_hex();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKMULTISIG",
                "m": 2,
                "publickeys": [pk1.to_base58()],
                "msg": msg,
                "witness": {
                    "signatures": [sig1.clone(), sig1]
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkmultisig_two_of_three_succeeds() {
        let (pk1, sk1) = crate::core::util::crypto::generate_keys();
        let (pk2, sk2) = crate::core::util::crypto::generate_keys();
        let (pk3, _) = crate::core::util::crypto::generate_keys();
        let msg = "two of three success";
        let sig1 = crate::core::util::crypto::sign(msg.as_bytes(), &sk1).to_hex();
        let sig2 = crate::core::util::crypto::sign(msg.as_bytes(), &sk2).to_hex();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKMULTISIG",
                "m": 2,
                "publickeys": [pk1.to_base58(), pk2.to_base58(), pk3.to_base58()],
                "msg": msg,
                "witness": {
                    "signatures": [sig1, sig2]
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_checkmultisig_two_of_three_insufficient_signatures_fails() {
        let (pk1, sk1) = crate::core::util::crypto::generate_keys();
        let (pk2, _) = crate::core::util::crypto::generate_keys();
        let (pk3, _) = crate::core::util::crypto::generate_keys();
        let msg = "two of three failure";
        let sig1 = crate::core::util::crypto::sign(msg.as_bytes(), &sk1).to_hex();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKMULTISIG",
                "m": 2,
                "publickeys": [pk1.to_base58(), pk2.to_base58(), pk3.to_base58()],
                "msg": msg,
                "witness": {
                    "signatures": [sig1]
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_importfield_signed_witness_succeeds() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "binding123";
        let duration = 42;
        let canonical = format!("{duration}|{binding_hash}");
        let digest = crate::core::util::crypto::hash(canonical.as_bytes()).to_hex();
        let sig = crate::core::util::crypto::sign(digest.as_bytes(), &sk).to_hex();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTFIELD",
                "key": "duration",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "value": duration,
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_importfield_invalid_signature_fails() {
        let (pk, _) = crate::core::util::crypto::generate_keys();

        let mut script = Script::new();
        script.parse(&serde_json::to_string(&json!({
            "op": "IMPORTFIELD",
            "key": "duration",
            "publickey": pk.to_base58(),
            "hash": "binding123",
            "witness": {
                "value": 42,
                "signature": "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
            }
        })).unwrap());

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_sumfields_adds_into_opcodes() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SUMFIELDS",
                "a": 10,
                "b": 5,
                "into": "expiry"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_sumfields_invalid_into_key_fails() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SUMFIELDS",
                "a": 1,
                "b": 2,
                "into": "bad-key"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_sumfields_missing_operand_fails() {
        let mut script = Script::new();
        script.parse(r#"{"op":"SUMFIELDS","b":2,"into":"expiry"}"#);

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_scripthash_matches_script_hash_for_literal_object() {
        let tree = json!({
            "op": "CHECKSENDER",
            "publickey": "alice"
        });
        let expected = Script {
            json: tree.clone(),
        }
        .hash();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SCRIPTHASH",
                        "source": tree,
                        "into": "hash"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.scripthash.hash",
                        "operator": "==",
                        "value": expected
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_scripthash_resolves_context_rental_script() {
        let tree = json!({
            "op": "CHECKSENDER",
            "publickey": "bob"
        });
        let expected = Script {
            json: tree.clone(),
        }
        .hash();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.rental_script",
                        "value": tree
                    },
                    {
                        "op": "SCRIPTHASH",
                        "source": "context.rental_script",
                        "into": "hash"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.scripthash.hash",
                        "operator": "==",
                        "value": expected
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_scripthash_matches_script_hash_with_nested_witness() {
        let tree = json!({
            "op": "AND",
            "args": [
                {
                    "op": "CHECKSENDER",
                    "publickey": "alice",
                    "witness": { "ignored": true }
                },
                {
                    "op": "CHECKFIELD",
                    "field": "NOW",
                    "operator": ">",
                    "value": 0,
                    "witness": { "also": "ignored" }
                }
            ],
            "witness": { "outer": 1 }
        });
        let expected = Script {
            json: tree.clone(),
        }
        .hash();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.rental_script",
                        "value": tree
                    },
                    {
                        "op": "SCRIPTHASH",
                        "source": "context.rental_script",
                        "into": "hash"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.scripthash.hash",
                        "operator": "==",
                        "value": expected
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_scripthash_setfield_nested_edit_changes_hash() {
        let template = json!({
            "op": "OR",
            "args": [
                {
                    "op": "CHECKSENDER",
                    "publickey": "PLACEHOLDER"
                },
                {
                    "op": "CHECKSENDER",
                    "publickey": "alice"
                }
            ]
        });

        let mut expected_tree = template.clone();
        expected_tree["args"][0]["publickey"] = json!("bob");
        let expected = Script {
            json: expected_tree,
        }
        .hash();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.rental_script",
                        "value": template
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.rental_script.args[0].publickey",
                        "value": "bob"
                    },
                    {
                        "op": "SCRIPTHASH",
                        "source": "context.rental_script",
                        "into": "hash"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.scripthash.hash",
                        "operator": "==",
                        "value": expected
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_scripthash_does_not_mutate_source_tree() {
        let tree = json!({
            "op": "CHECKSENDER",
            "publickey": "alice",
            "witness": { "keep": true }
        });

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.rental_script",
                        "value": tree.clone()
                    },
                    {
                        "op": "SCRIPTHASH",
                        "source": "context.rental_script",
                        "into": "hash"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "rental_script.witness.keep",
                        "operator": "==",
                        "value": true
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "rental_script.publickey",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_scripthash_missing_source_fails() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SCRIPTHASH",
                "into": "hash"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_scripthash_invalid_into_key_fails() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SCRIPTHASH",
                "source": { "op": "CHECKSENDER", "publickey": "alice" },
                "into": "bad-key"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_scripthash_unresolved_path_fails() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SCRIPTHASH",
                "source": "context.rental_script",
                "into": "hash"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkfield_greater_than_succeeds() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKFIELD",
                "field": 20,
                "operator": ">",
                "value": 10
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_checkfield_unknown_operator_fails() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKFIELD",
                "field": 1,
                "operator": "???",
                "value": 2
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_checkfield_equals_alias_succeeds() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKFIELD",
                "field": 5,
                "operator": "equals",
                "value": 5
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_importfield_sumfields_checkfield_chain_succeeds() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "chain-binding";
        let duration = 7;
        let canonical = format!("{duration}|{binding_hash}");
        let digest = crate::core::util::crypto::hash(canonical.as_bytes()).to_hex();
        let sig = crate::core::util::crypto::sign(digest.as_bytes(), &sk).to_hex();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "IMPORTFIELD",
                        "key": "duration",
                        "publickey": pk.to_base58(),
                        "hash": binding_hash,
                        "witness": {
                            "value": duration,
                            "signature": sig
                        }
                    },
                    {
                        "op": "SUMFIELDS",
                        "a": 3,
                        "b": "__opcodes.importfield.duration",
                        "into": "expiry"
                    },

                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.sumfields.expiry",
                        "operator": "==",
                        "value": 10
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    fn sign_importarray_value(
        value: &Value,
        binding_hash: &str,
        sk: &crate::core::defs::SaitoPrivateKey,
    ) -> String {
        let value_string = super::canonical_json(value);
        let canonical = format!("{value_string}|{binding_hash}");
        let digest = crate::core::util::crypto::hash(canonical.as_bytes()).to_hex();
        crate::core::util::crypto::sign(digest.as_bytes(), sk).to_hex()
    }

    #[test]
    fn validate_importarray_signed_witness_succeeds() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "array-binding";
        let value = json!([
            { "public_key": "alice", "amount": 100 },
            { "public_key": "bob", "amount": 50 }
        ]);
        let sig = sign_importarray_value(&value, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "key": "successors",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "value": value,
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_importarray_invalid_signature_fails() {
        let (pk, _) = crate::core::util::crypto::generate_keys();

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "key": "successors",
                "publickey": pk.to_base58(),
                "hash": "array-binding",
                "witness": {
                    "value": [{ "public_key": "alice", "amount": 100 }],
                    "signature": "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_importarray_missing_key_fails() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "array-binding";
        let value = json!([{ "public_key": "alice", "amount": 100 }]);
        let sig = sign_importarray_value(&value, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "value": value,
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_importarray_missing_value_fails() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "array-binding";
        let value = json!([{ "public_key": "alice", "amount": 100 }]);
        let sig = sign_importarray_value(&value, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "key": "successors",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_importarray_empty_array_succeeds() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "empty-array-binding";
        let value = json!([]);
        let sig = sign_importarray_value(&value, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "key": "successors",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "value": value,
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_importarray_nested_object_arrays_succeeds() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "nested-array-binding";
        let value = json!([
            {
                "public_key": "alice",
                "meta": { "tier": 1, "tags": ["a", "b"] },
                "amount": 100
            },
            {
                "public_key": "bob",
                "meta": { "tier": 2, "tags": ["c"] },
                "amount": 50
            }
        ]);
        let sig = sign_importarray_value(&value, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "key": "successors",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "value": value,
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_importarray_canonical_serialization_is_key_order_independent() {
        let left = json!([{ "amount": 100, "public_key": "alice" }]);
        let right = json!([{ "public_key": "alice", "amount": 100 }]);
        assert_eq!(super::canonical_json(&left), super::canonical_json(&right));

        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "canonical-binding";
        let sig = sign_importarray_value(&left, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "IMPORTARRAY",
                "key": "successors",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "value": right,
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setfield_literal_into_opcodes_succeeds() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setfield.owner",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setfield.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setfield_copies_resolved_reference() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SUMFIELDS",
                        "a": 10,
                        "b": 5,
                        "into": "expiry"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setfield.version",
                        "value": "__opcodes.sumfields.expiry"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setfield.version",
                        "operator": "==",
                        "value": 15
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setfield_rejects_script_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETFIELD",
                "reference": "context.script.hash",
                "value": "tampered"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setfield_rejects_witness_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETFIELD",
                "reference": "context.witness.signature",
                "value": "tampered"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setfield_rejects_tx_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETFIELD",
                "reference": "tx.from.0.amount",
                "value": 1
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setfield_rejects_blk_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETFIELD",
                "reference": "blk.timestamp",
                "value": 1
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setfield_rejects_missing_context_prefix() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETFIELD",
                "reference": "__opcodes.setfield.owner",
                "value": "alice"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setfield_missing_value_fails() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETFIELD",
                "reference": "context.constitution.owner"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setfield_nested_object_and_array_index_succeeds() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setfield.children",
                        "value": [{ "reference": "old" }, { "reference": "keep" }]
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setfield.children[0].reference",
                        "value": "new"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setfield.children.0.reference",
                        "operator": "==",
                        "value": "new"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setfield_constitution_path_succeeds() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.constitution.owner",
                        "value": "alice"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setfield.owner",
                        "value": 1
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setfield.owner",
                        "operator": "==",
                        "value": 1
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_literal_dimension_succeeds() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice", "version": 1 }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": 2
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_deep_copies_are_independent() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "nested": { "v": 1 } }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": 2
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto.0.nested.v",
                        "value": 99
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.nested.v",
                        "operator": "==",
                        "value": 99
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.nested.v",
                        "operator": "==",
                        "value": 1
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_dimension_from_array_length() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.sizes",
                        "value": [1, 2, 3]
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "__opcodes.arrayify.sizes"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.2.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_dimension_from_object_key_count() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.meta",
                        "value": { "a": 1, "b": 2 }
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "bob" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "__opcodes.arrayify.meta"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.owner",
                        "operator": "==",
                        "value": "bob"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_tx_to_p2sh_dimension() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();

        let mut p2sh0 = Slip::default();
        p2sh0.slip_type = SlipType::Normal;
        p2sh0.public_key[0] = 0x00;
        p2sh0.public_key[1] = 0x11;

        let mut p2sh1 = Slip::default();
        p2sh1.slip_type = SlipType::Normal;
        p2sh1.public_key[0] = 0x00;
        p2sh1.public_key[1] = 0x22;

        let mut p2sh2 = Slip::default();
        p2sh2.slip_type = SlipType::Normal;
        p2sh2.public_key[0] = 0x00;
        p2sh2.public_key[1] = 0x33;

        let mut normal = Slip::default();
        normal.slip_type = SlipType::Normal;
        normal.public_key[0] = 0x01;

        tx.to.push(p2sh0);
        tx.to.push(normal);
        tx.to.push(p2sh1);
        tx.to.push(p2sh2);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.to.p2sh"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.2.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto.3.owner",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );

        // three P2SH outs => indices 0..2 exist; writing index 3 must fail
        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.to.p2sh"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.2.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_tx_from_p2sh_dimension() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();

        let mut p2sh0 = Slip::default();
        p2sh0.slip_type = SlipType::Normal;
        p2sh0.public_key[0] = 0x00;

        let mut p2sh1 = Slip::default();
        p2sh1.slip_type = SlipType::Normal;
        p2sh1.public_key[0] = 0x00;
        p2sh1.public_key[1] = 0x02;

        let mut normal = Slip::default();
        normal.slip_type = SlipType::Normal;
        normal.public_key[0] = 0x01;

        tx.from.push(p2sh0);
        tx.from.push(normal);
        tx.from.push(p2sh1);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.from.p2sh"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto.2.owner",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.from.p2sh"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_tx_from_dimension() {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.from.push(Slip::default());
        tx.from.push(Slip::default());
        tx.from.push(Slip::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.from"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.2.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto.3.owner",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.from"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.2.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_tx_to_dimension() {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.to.push(Slip::default());
        tx.to.push(Slip::default());
        tx.to.push(Slip::default());
        tx.to.push(Slip::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.to"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.3.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto.4.owner",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.to"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.3.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_tx_path_dimension() {
        use crate::core::consensus::hop::Hop;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.path.push(Hop::default());
        tx.path.push(Hop::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.path"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto.2.owner",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "context.__opcodes.arrayify.proto",
                        "dimension": "tx.path"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.arrayify.proto.1.owner",
                        "operator": "==",
                        "value": "alice"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_arrayify_rejects_script_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "ARRAYIFY",
                "reference": "context.script.hash",
                "dimension": 2
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_arrayify_rejects_missing_target() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "ARRAYIFY",
                "reference": "context.constitution",
                "dimension": 2
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_arrayify_rejects_missing_context_prefix() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.arrayify.proto",
                        "value": { "owner": "alice" }
                    },
                    {
                        "op": "ARRAYIFY",
                        "reference": "__opcodes.arrayify.proto",
                        "dimension": 2
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarray_copies_context_array() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.src",
                        "value": [{ "id": 1 }, { "id": 2 }]
                    },
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "__opcodes.setarray.src"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.dst.0.id",
                        "operator": "==",
                        "value": 1
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.dst.1.id",
                        "operator": "==",
                        "value": 2
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarray_replaces_existing_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst",
                        "value": [{ "id": "old" }]
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.src",
                        "value": [{ "id": "new0" }, { "id": "new1" }]
                    },
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "__opcodes.setarray.src"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.dst.0.id",
                        "operator": "==",
                        "value": "new0"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.dst.1.id",
                        "operator": "==",
                        "value": "new1"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarray_deep_copy_is_independent() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.src",
                        "value": [{ "nested": { "v": 1 } }]
                    },
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "__opcodes.setarray.src"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst.0.nested.v",
                        "value": 99
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.dst.0.nested.v",
                        "operator": "==",
                        "value": 99
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.src.0.nested.v",
                        "operator": "==",
                        "value": 1
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarray_from_importarray() {
        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let binding_hash = "setarray-import";
        let value = json!([
            { "public_key": "alice", "amount": 100 },
            { "public_key": "bob", "amount": 50 }
        ]);
        let sig = sign_importarray_value(&value, binding_hash, &sk);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "IMPORTARRAY",
                        "key": "successors",
                        "publickey": pk.to_base58(),
                        "hash": binding_hash,
                        "witness": {
                            "value": value,
                            "signature": sig
                        }
                    },
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.copied",
                        "source": "__opcodes.importarray.successors"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.copied.0.amount",
                        "operator": "==",
                        "value": 100
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.copied.1.amount",
                        "operator": "==",
                        "value": 50
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarray_from_tx_from() {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.from.push(Slip::default());
        tx.from.push(Slip::default());
        tx.from.push(Slip::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "tx.from"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst.3",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "tx.from"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.marker",
                        "value": 1
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.setarray.marker",
                        "operator": "==",
                        "value": 1
                    }
                ]
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarray_from_tx_to() {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.to.push(Slip::default());
        tx.to.push(Slip::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "tx.to"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst.2",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAY",
                "destination": "context.__opcodes.setarray.dst",
                "source": "tx.to"
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarray_from_tx_path() {
        use crate::core::consensus::hop::Hop;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.path.push(Hop::default());
        tx.path.push(Hop::default());
        tx.path.push(Hop::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "tx.path"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst.3",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAY",
                "destination": "context.__opcodes.setarray.dst",
                "source": "tx.path"
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarray_from_tx_from_p2sh() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();

        let mut p2sh0 = Slip::default();
        p2sh0.slip_type = SlipType::Normal;
        p2sh0.public_key[0] = 0x00;

        let mut p2sh1 = Slip::default();
        p2sh1.slip_type = SlipType::Normal;
        p2sh1.public_key[0] = 0x00;
        p2sh1.public_key[1] = 0x02;

        let mut normal = Slip::default();
        normal.slip_type = SlipType::Normal;
        normal.public_key[0] = 0x01;

        tx.from.push(p2sh0);
        tx.from.push(normal);
        tx.from.push(p2sh1);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "tx.from.p2sh"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst.2",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAY",
                "destination": "context.__opcodes.setarray.dst",
                "source": "tx.from.p2sh"
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarray_from_tx_to_p2sh() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();

        let mut p2sh0 = Slip::default();
        p2sh0.slip_type = SlipType::Normal;
        p2sh0.public_key[0] = 0x00;

        let mut normal = Slip::default();
        normal.slip_type = SlipType::Normal;
        normal.public_key[0] = 0x01;

        let mut p2sh1 = Slip::default();
        p2sh1.slip_type = SlipType::Normal;
        p2sh1.public_key[0] = 0x00;
        p2sh1.public_key[1] = 0x03;

        tx.to.push(p2sh0);
        tx.to.push(normal);
        tx.to.push(p2sh1);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "tx.to.p2sh"
                    },
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.dst.2",
                        "value": "overflow"
                    }
                ]
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 0);

        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAY",
                "destination": "context.__opcodes.setarray.dst",
                "source": "tx.to.p2sh"
            }))
            .unwrap(),
        );
        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarray_rejects_script_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.src",
                        "value": [1, 2]
                    },
                    {
                        "op": "SETARRAY",
                        "destination": "context.script.hash",
                        "source": "__opcodes.setarray.src"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarray_rejects_non_array_source() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.setarray.src",
                        "value": { "not": "array" }
                    },
                    {
                        "op": "SETARRAY",
                        "destination": "context.__opcodes.setarray.dst",
                        "source": "__opcodes.setarray.src"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarray_rejects_missing_source() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAY",
                "destination": "context.__opcodes.setarray.dst",
                "source": "__opcodes.setarray.missing"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarrayfield_equal_lengths() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["alice", "bob"],
                        "field": "owner"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.1.owner",
                        "operator": "==",
                        "value": "bob"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_source_shorter_repeats_last() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["alice", "bob"],
                        "field": "owner"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.1.owner",
                        "operator": "==",
                        "value": "bob"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.2.owner",
                        "operator": "==",
                        "value": "bob"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_scalar_broadcast() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": 5,
                        "field": "percentage"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.percentage",
                        "operator": "==",
                        "value": 5
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.2.percentage",
                        "operator": "==",
                        "value": 5
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_overwrites_existing_field() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{ "owner": "old", "keep": 1 }]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["new"],
                        "field": "owner"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.owner",
                        "operator": "==",
                        "value": "new"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.keep",
                        "operator": "==",
                        "value": 1
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_creates_missing_field() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{ "keep": 1 }]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["alice"],
                        "field": "owner"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.owner",
                        "operator": "==",
                        "value": "alice"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.keep",
                        "operator": "==",
                        "value": 1
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_from_tx_from() {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.from.push(Slip::default());
        tx.from.push(Slip::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "tx.from",
                        "field": "slip"
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["a", "b"],
                        "field": "tag"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.tag",
                        "operator": "==",
                        "value": "a"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.1.tag",
                        "operator": "==",
                        "value": "b"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_from_tx_to() {
        use crate::core::consensus::slip::Slip;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.to.push(Slip::default());
        tx.to.push(Slip::default());
        tx.to.push(Slip::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "tx.to",
                        "field": "slip"
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "ok",
                        "field": "tag"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.2.tag",
                        "operator": "==",
                        "value": "ok"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_from_tx_path() {
        use crate::core::consensus::hop::Hop;
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();
        tx.path.push(Hop::default());
        tx.path.push(Hop::default());

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "tx.path",
                        "field": "hop"
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["x", "y"],
                        "field": "tag"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.tag",
                        "operator": "==",
                        "value": "x"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.1.tag",
                        "operator": "==",
                        "value": "y"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_from_tx_from_p2sh() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();

        let mut p2sh0 = Slip::default();
        p2sh0.slip_type = SlipType::Normal;
        p2sh0.public_key[0] = 0x00;

        let mut normal = Slip::default();
        normal.slip_type = SlipType::Normal;
        normal.public_key[0] = 0x01;

        let mut p2sh1 = Slip::default();
        p2sh1.slip_type = SlipType::Normal;
        p2sh1.public_key[0] = 0x00;
        p2sh1.public_key[1] = 0x02;

        tx.from.push(p2sh0);
        tx.from.push(normal);
        tx.from.push(p2sh1);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}, {}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "tx.from.p2sh",
                        "field": "slip"
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["p0", "p1"],
                        "field": "tag"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.tag",
                        "operator": "==",
                        "value": "p0"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.1.tag",
                        "operator": "==",
                        "value": "p1"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_from_tx_to_p2sh() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut tx = Transaction::default();

        let mut p2sh0 = Slip::default();
        p2sh0.slip_type = SlipType::Normal;
        p2sh0.public_key[0] = 0x00;

        let mut normal = Slip::default();
        normal.slip_type = SlipType::Normal;
        normal.public_key[0] = 0x01;

        tx.to.push(p2sh0);
        tx.to.push(normal);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "tx.to.p2sh",
                        "field": "slip"
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": "only",
                        "field": "tag"
                    },
                    {
                        "op": "CHECKFIELD",
                        "field": "__opcodes.saf.dest.0.tag",
                        "operator": "==",
                        "value": "only"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_setarrayfield_rejects_script_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAYFIELD",
                "destination": "context.script.hash",
                "source": ["a"],
                "field": "owner"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarrayfield_rejects_non_object_elements() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": ["not-object"]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": ["alice"],
                        "field": "owner"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarrayfield_rejects_empty_source_array() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "AND",
                "args": [
                    {
                        "op": "SETFIELD",
                        "reference": "context.__opcodes.saf.dest",
                        "value": [{}]
                    },
                    {
                        "op": "SETARRAYFIELD",
                        "destination": "context.__opcodes.saf.dest",
                        "source": [],
                        "field": "owner"
                    }
                ]
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn validate_setarrayfield_rejects_missing_destination() {
        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "SETARRAYFIELD",
                "destination": "context.__opcodes.saf.missing",
                "source": ["alice"],
                "field": "owner"
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(None, None, None, None), 0);
    }

    #[test]
    fn address_hex_is_00_prefix_plus_hash() {
        let script = Script::from_json(super::TEST_SCRIPT);
        let hash = script.hash();
        assert!(!hash.is_empty());
        assert_eq!(script.address_hex(), format!("00{hash}"));
        assert_eq!(script.address_hex().len(), 66);
    }

    #[test]
    fn resolve_ref_p2sh_utxoset_key_returns_hex() {
        use super::{resolve_ref, resolved_value_to_message_string};
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut custody = Slip::default();
        custody.slip_type = SlipType::Normal;
        custody.public_key[0] = 0x00;
        custody.public_key[1] = 0xab;
        custody.generate_utxoset_key();
        let expected = custody.utxoset_key.to_hex();

        let mut tx = Transaction::default();
        tx.from.push(custody);

        let context = json!({ "script": {}, "witness": {}, "variables": {} });
        let resolved = resolve_ref(
            &json!("tx.from.p2sh.utxoset_key"),
            &context,
            Some(&tx),
            None,
        );
        assert_eq!(resolved_value_to_message_string(&resolved), expected);
    }

    #[test]
    fn resolve_ref_p2sh_prefers_custody_over_marker() {
        use super::{resolve_ref, resolved_value_to_message_string};
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let mut custody = Slip::default();
        custody.slip_type = SlipType::Normal;
        custody.public_key[0] = 0x00;
        custody.public_key[1] = 0xcd;
        custody.amount = 5;
        custody.generate_utxoset_key();
        let expected = custody.utxoset_key.to_hex();

        let mut marker = Slip::default();
        marker.slip_type = SlipType::P2SH;
        marker.public_key = custody.public_key;
        marker.amount = 0;
        marker.generate_utxoset_key();

        let mut tx = Transaction::default();
        tx.from.push(custody);
        tx.from.push(marker);

        let context = json!({ "script": {}, "witness": {}, "variables": {} });
        let resolved = resolve_ref(
            &json!("tx.from.p2sh.utxoset_key"),
            &context,
            Some(&tx),
            None,
        );
        assert_eq!(resolved_value_to_message_string(&resolved), expected);
    }

    #[test]
    fn resolve_ref_p2sh_missing_slip_returns_empty_string() {
        use super::{resolve_ref, resolved_value_to_message_string};
        use crate::core::consensus::transaction::Transaction;

        let tx = Transaction::default();
        let context = json!({ "script": {}, "witness": {}, "variables": {} });
        let resolved = resolve_ref(
            &json!("tx.from.p2sh.utxoset_key"),
            &context,
            Some(&tx),
            None,
        );
        assert_eq!(resolved_value_to_message_string(&resolved), "");
    }

    #[test]
    fn validate_checkmultisig_contextual_p2sh_msg_succeeds() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let mut custody = Slip::default();
        custody.slip_type = SlipType::Normal;
        custody.public_key[0] = 0x00;
        custody.public_key[1] = 0xef;
        custody.generate_utxoset_key();
        let msg = custody.utxoset_key.to_hex();
        let sig = crate::core::util::crypto::sign(msg.as_bytes(), &sk).to_hex();

        let mut tx = Transaction::default();
        tx.from.push(custody);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKMULTISIG",
                "m": 1,
                "publickeys": [pk.to_base58()],
                "msg": "tx.from.p2sh.utxoset_key",
                "witness": {
                    "signatures": [sig]
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }

    #[test]
    fn validate_checksig_contextual_p2sh_msg_succeeds() {
        use crate::core::consensus::slip::{Slip, SlipType};
        use crate::core::consensus::transaction::Transaction;

        let (pk, sk) = crate::core::util::crypto::generate_keys();
        let mut custody = Slip::default();
        custody.slip_type = SlipType::Normal;
        custody.public_key[0] = 0x00;
        custody.public_key[1] = 0xef;
        custody.generate_utxoset_key();
        let msg = custody.utxoset_key.to_hex();
        let sig = crate::core::util::crypto::sign(msg.as_bytes(), &sk).to_hex();

        let mut tx = Transaction::default();
        tx.from.push(custody);

        let mut script = Script::new();
        script.parse(
            &serde_json::to_string(&json!({
                "op": "CHECKSIG",
                "publickey": pk.to_base58(),
                "msg": "tx.from.p2sh.utxoset_key",
                "witness": {
                    "signature": sig
                }
            }))
            .unwrap(),
        );

        assert_eq!(script.validate(Some(&tx), None, None, None), 1);
    }
}

fn set_at(target: &mut Value, path: &[&str], value: Value) {
    if path.len() == 1 {
        if let Value::Object(map) = target {
            map.insert(path[0].to_string(), value);
        } else {
            let mut map = serde_json::Map::new();
            map.insert(path[0].to_string(), value);
            *target = Value::Object(map);
        }
        return;
    }
    if !target.is_object() {
        *target = Value::Object(serde_json::Map::new());
    }
    if let Value::Object(map) = target {
        let entry = map
            .entry(path[0].to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !entry.is_object() {
            *entry = Value::Object(serde_json::Map::new());
        }
        set_at(entry, &path[1..], value);
    }
}

fn resolve_p2sh_slip_field(slips: &[Slip], field: &str, p2sh_ordinal: usize) -> Value {
    let mut ordinal = 0usize;

    for slip in slips {
        if slip.slip_type == SlipType::Bound {
            continue;
        }

        if slip.public_key[0] != 0x00 {
            continue;
        }

        if ordinal != p2sh_ordinal {
            ordinal += 1;
            continue;
        }

        return match field {
            "utxoset_key" => Value::String(slip.utxoset_key.to_hex()),
            "public_key" => Value::String(slip.public_key.to_base58()),
            _ => Value::String(String::new()),
        };
    }

    Value::String(String::new())
}

/// Returns the cached P2SH authorization hash.
///
/// The hash is computed lazily the first time CHECKSIG or CHECKMULTISIG
/// requests it, then cached in:
///
///     context["__p2sh_auth_hash"]
///
/// The hash is Blake3 over the concatenation of every output slip's
/// serialize_output_for_signature() bytes.
pub(crate) fn get_p2sh_auth_hash(
    context: &mut Value,
    tx: Option<&Transaction>,
) -> Option<String> {

    if let Some(existing) = context
        .get("__p2sh_auth_hash")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return Some(existing.to_string());
    }

    let tx = tx?;

    let mut buffer = Vec::new();
    for slip in tx.to.iter() {
        buffer.extend(slip.serialize_output_for_signature());
    }
    let p2sh_auth_hash = crypto::hash(&buffer).to_hex();
    context["__p2sh_auth_hash"] =
        Value::String(p2sh_auth_hash.clone());

    Some(p2sh_auth_hash)
}



pub(crate) fn resolved_value_to_message_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => {
            if let Some(u) = n.as_u64() {
                u.to_string()
            } else if let Some(i) = n.as_i64() {
                i.to_string()
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

pub(crate) fn resolve_ref(
    value: &Value,
    context: &Value,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
) -> Value {
    //
    // literals remain literals
    //
    let Some(path) = value.as_str() else {
        return value.clone();
    };

    //
    // helper for walking serde_json::Value trees
    //
    fn lookup(root: &Value, path: &str) -> Option<Value> {
        let mut current = root;

        for part in path.split('.') {
            if let Ok(index) = part.parse::<usize>() {
                current = current.get(index)?;
            } else {
                current = current.get(part)?;
            }
        }

        Some(current.clone())
    }

    //
    // script.*
    //
    if let Some(remainder) = path.strip_prefix("script.") {
        return lookup(&context["script"], remainder).unwrap_or(Value::Null);
    }

    //
    // witness.*
    //
    if let Some(remainder) = path.strip_prefix("witness.") {
        return lookup(&context["witness"], remainder).unwrap_or(Value::Null);
    }

    //
    // vars.*
    //
    if let Some(remainder) = path.strip_prefix("vars.") {
        return lookup(&context["vars"], remainder).unwrap_or(Value::Null);
    }

    //
    // tx.*
    //
    if let Some(remainder) = path.strip_prefix("tx.") {
        if let Some(tx) = tx {
            if let Some(field) = remainder.strip_prefix("from.p2sh.") {
                let p2sh_ordinal = context
                    .get("__current_p2sh_idx")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize;

                let resolved = resolve_p2sh_slip_field(&tx.from, field, p2sh_ordinal);
                if field == "utxoset_key" {
                    info!(
    		        "RUSTSCRIPT DEREFERENCE\n\nExpression:\n    tx.from.p2sh.utxoset_key\n\nResolved Value:\n    {}",
    		        resolved_value_to_message_string(&resolved)
    		    );
                }
                return resolved;
            }
            if let Some(field) = remainder.strip_prefix("to.p2sh.") {
                return resolve_p2sh_slip_field(&tx.to, field, 0);
            }

            let tx_json = serde_json::to_value(tx).unwrap_or(Value::Null);

            return lookup(&tx_json, remainder).unwrap_or(Value::Null);
        }

        return Value::Null;
    }

    //
    // blk.*
    //
    if let Some(remainder) = path.strip_prefix("blk.") {
        if let Some(blk) = blk {
            let blk_json = serde_json::to_value(blk).unwrap_or(Value::Null);

            return lookup(&blk_json, remainder).unwrap_or(Value::Null);
        }

        return Value::Null;
    }

    //
    // __opcodes.*
    //
    if let Some(remainder) = path.strip_prefix("__opcodes.") {
        return lookup(&context["__opcodes"], remainder).unwrap_or(Value::Null);
    }

    //
    // NOW and REQUESTER
    //
    if let Some(resolved) = context.get(path) {
        return resolved.clone();
    }

    //
    // not a reference:
    // treat as literal string
    //
    value.clone()
}
