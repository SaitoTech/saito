use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::slip::{Slip, SlipType};
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey};
use crate::core::util::crypto;
use serde_json::{json, Value};

use super::opcodes::{
    CheckField, CheckHash, CheckMultiSig, CheckOwn, CheckOwnNft, CheckOwnNftWhere, CheckPath,
    CheckPathHop, CheckRecipient, CheckSender, CheckSig, CheckTime, ImportField, SumFields,
};

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
        let mut context = json!({
            "script": {},
            "witness": {},
            "variables": {}
        });

    	if let Some(idx) = current_p2sh_idx {
            context["__current_p2sh_idx"] = json!(idx);
    	}

        fn eval(
            node: &Value,
            context: &mut Value,
            tx: Option<&Transaction>,
            blk: Option<&Block>,
            blockchain: Option<&Blockchain>,
        ) -> u8 {
            let op = node["op"].as_str().unwrap_or("").to_uppercase();

            //
            // logical operators
            //
            match op.as_str() {
                "AND" => {
                    let default_args = Vec::new();
                    let args = node["args"].as_array().unwrap_or(&default_args);

                    for child in args {
                        if eval(child, context, tx, blk, blockchain) == 0 {
                            return 0;
                        }
                    }

                    return 1;
                }

                "OR" => {
                    let default_args = Vec::new();
                    let args = node["args"].as_array().unwrap_or(&default_args);

                    for child in args {
                        if eval(child, context, tx, blk, blockchain) == 1 {
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

                    return if eval(&args[0], context, tx, blk, blockchain) == 1 {
                        0
                    } else {
                        1
                    };
                }

                _ => {}
            }

            //
            // refresh "script" and "witness"
            //
            context["script"] = json!({});
            context["witness"] = json!({});
            if let Some(reference) = node.get("reference") {
                context["witness"] = reference.clone();
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

                    if k == "reference" {
                        continue;
                    }

                    script_obj.insert(k.clone(), v.clone());
                }
            }

            //
            // opcode dispatch
            //
            match op.as_str() {
                "CHECKHASH" => {
                    return CheckHash::execute(context, tx, blk);
                }

                "CHECKSIG" => {
                    return CheckSig::validate(context, tx, blk);
                }

                "CHECKMULTISIG" => {
                    return CheckMultiSig::validate(context, tx, blk);
                }

                "IMPORTFIELD" => {
                    return ImportField::validate(context, tx, blk);
                }

                "SUMFIELDS" => {
                    return SumFields::validate(context, tx, blk);
                }

                "CHECKFIELD" => {
                    return CheckField::validate(context, tx, blk);
                }

                "CHECKOWN" => {
                    return CheckOwn::validate(context, tx, blk, blockchain);
                }

                "CHECKOWNNFT" => {
                    return CheckOwnNft::validate(context, tx, blk, blockchain);
                }

                "CHECKOWNNFTWHERE" => {
                    return CheckOwnNftWhere::validate(context, tx, blk, blockchain);
                }

                "CHECKSENDER" => {
                    return CheckSender::validate(context, tx, blk);
                }

                "CHECKRECIPIENT" => {
                    return CheckRecipient::validate(context, tx, blk);
                }

                "CHECKPATH" => {
                    return CheckPath::validate(context, tx, blk);
                }

                "CHECKPATHHOP" => {
                    return CheckPathHop::validate(context, tx, blk);
                }

                "CHECKTIME" => {
                    return CheckTime::validate(context, tx, blk);
                }

                _ => {
                    return 0;
                }
            }
        }

        eval(&self.json, &mut context, tx, blk, blockchain)
    }

    //
    // the "script hash" is the hash of the canonical script, which is the JSON
    // string representation of the script without the user-proviced witness
    // data. this function takes the script and returns the hash value of the
    // script.
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

        //
        // generate an objective string
        //
        let mut canonical = String::new();
        let mut stack: Vec<(&Value, u8, usize, Option<Vec<String>>, bool)> =
            vec![(&data, 0, 0, None, false)];
        while !stack.is_empty() {
            let top = stack.len() - 1;
            let state = stack[top].1;
            if state == 0 {
                match stack[top].0 {
                    Value::Null => {
                        canonical.push_str("null");
                        stack.pop();
                    }
                    Value::Bool(b) => {
                        canonical.push_str(if *b { "true" } else { "false" });
                        stack.pop();
                    }
                    Value::Number(n) => {
                        canonical
                            .push_str(&serde_json::to_string(&Value::Number(n.clone())).unwrap());
                        stack.pop();
                    }
                    Value::String(s) => {
                        canonical.push_str(&serde_json::to_string(s).unwrap());
                        stack.pop();
                    }
                    Value::Array(_) => {
                        stack[top].1 = 1;
                        canonical.push('[');
                    }
                    Value::Object(map) => {
                        let mut sorted_keys: Vec<String> = map.keys().cloned().collect();
                        sorted_keys.sort();
                        stack[top].1 = 1;
                        stack[top].3 = Some(sorted_keys);
                        canonical.push('{');
                    }
                    _ => {
                        stack.pop();
                    }
                }
            } else if stack[top].4 {
                let idx = stack[top].2;
                let arr_len = match stack[top].0 {
                    Value::Array(a) => a.len(),
                    _ => 0,
                };
                if idx >= arr_len {
                    canonical.push(']');
                    stack.pop();
                } else if let Value::Array(a) = stack[top].0 {
                    if idx > 0 {
                        canonical.push(',');
                    }
                    let child = &a[idx];
                    stack[top].2 = idx + 1;
                    stack.push((child, 0, 0, None, false));
                } else {
                    stack.pop();
                }
            } else {
                let idx = stack[top].2;
                let key_list = stack[top].3.clone();
                if let (Value::Object(map), Some(keys)) = (stack[top].0, key_list) {
                    if idx >= keys.len() {
                        canonical.push('}');
                        stack.pop();
                    } else {
                        if idx > 0 {
                            canonical.push(',');
                        }
                        let key = keys[idx].clone();
                        canonical.push_str(&serde_json::to_string(&key).unwrap());
                        canonical.push(':');
                        stack[top].2 = idx + 1;
                        if let Some(child) = map.get(&key) {
                            stack.push((child, 0, 0, None, false));
                        }
                    }
                } else {
                    stack.pop();
                }
            }
        }

        //
        // return hash as hex
        //
        crypto::hash(canonical.as_bytes()).to_hex()
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
    use serde_json::json;

    use super::Script;

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
                "field": "duration",
                "publickey": pk.to_base58(),
                "hash": binding_hash,
                "witness": {
                    "duration": duration,
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
            "field": "duration",
            "publickey": pk.to_base58(),
            "hash": "binding123",
            "witness": {
                "duration": 42,
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
                        "field": "duration",
                        "publickey": pk.to_base58(),
                        "hash": binding_hash,
                        "witness": {
                            "duration": duration,
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

    		let p2sh_ordinal =
    		    context
    		        .get("__current_p2sh_idx")
    		        .and_then(|v| v.as_u64())
    		        .unwrap_or(0) as usize;

    		return resolve_p2sh_slip_field(
    		    &tx.from,
    		    field,
    		    p2sh_ordinal,
    		);

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
    // not a reference:
    // treat as literal string
    //
    value.clone()
}
