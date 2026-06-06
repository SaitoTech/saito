use crate::core::consensus::transaction::Transaction;
use crate::core::consensus::block::Block;
use crate::core::defs::PrintForLog;
use crate::core::util::crypto;
use serde_json::Value;

pub const TEST_SCRIPT: &str = r#"{
  "op": "CHECKHASH",
  "hash": "ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f",
  "witness": {
    "input": "hello"
  }
}"#;

pub mod opcodes {
    #[path = "checkhash.rs"]
    mod checkhash;
    pub use checkhash::CheckHash;
}

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

    pub fn parse(&mut self, json: &str) {
        self.json = serde_json::from_str(json).expect("parse: invalid JSON");
    }

    pub fn validate(&self, tx: Option<&Transaction>, blk: Option<&Block>) -> u8 {
        let mut context = json!({
            "script": {},
            "witness": {},
            "variables": {}
        });

        fn eval(
            node: &Value,
            context: &mut Value,
            tx: Option<&Transaction>,
            blk: Option<&Block>,
        ) -> u8 {
            let op = node["op"].as_str().unwrap_or("").to_uppercase();

            //
            // logical operators
            //
            match op.as_str() {
                "AND" => {
                    let args = node["args"].as_array().unwrap_or(&Vec::new());

                    for child in args {
                        if eval(child, context, tx, blk) == 0 {
                            return 0;
                        }
                    }

                    return 1;
                }

                "OR" => {
                    let args = node["args"].as_array().unwrap_or(&Vec::new());

                    for child in args {
                        if eval(child, context, tx, blk) == 1 {
                            return 1;
                        }
                    }

                    return 0;
                }

                "NOT" => {
                    let args = node["args"].as_array().unwrap_or(&Vec::new());

                    if args.is_empty() {
                        return 1;
                    }

                    return if eval(&args[0], context, tx, blk) == 1 {
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

                _ => {
                    return 0;
                }
            }
        }

        eval(&self.json, &mut context, tx, blk)
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
