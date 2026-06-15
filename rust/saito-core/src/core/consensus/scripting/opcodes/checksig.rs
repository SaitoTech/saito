use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPublicKey, SaitoSignature};
use crate::core::util::crypto::verify;
use serde_json::{json, Value};

pub struct CheckSig {
    pub name: String,
    pub description: String,
    pub script: String,
    pub schema: Value,
}

impl CheckSig {
    pub fn new() -> Self {
        Self {
            name: "CHECKSIG".to_string(),
            description: "Verify a signature against a message.".to_string(),
            script: r#"{
  "op": "CHECKSIG",
  "publickey": "xM2vUs5XCpNjYjcgxk4yVhybDcayk3tnwZNWrFg7jRGs",
  "msg": "hello",
  "witness": {
    "signature": "feb62fe225dd4b15e7ac6fe472c046715e77e8f01b93d501300353104630fdce3abdf31ad517c4d7f062d24d715d72ad66e0770d27d3e5c6b98f58151bd65b0c"
  }
}"#
            .to_string(),
            schema: json!({
                "publickey": "string",
                "msg": "string",
                "witness": {
                    "signature": "string"
                }
            }),
        }
    }

    pub fn validate(context: &mut Value, _tx: Option<&Transaction>, _blk: Option<&Block>) -> u8 {
        let publickey = context["script"]["publickey"].as_str().unwrap_or("");

        let message = context["script"]["msg"].as_str().unwrap_or("");

        let signature = context["witness"]["signature"].as_str().unwrap_or("");

        if publickey.is_empty() || message.is_empty() || signature.is_empty() {
            return 0;
        }

        let Ok(sig) = SaitoSignature::from_hex(signature) else {
            return 0;
        };
        let Ok(pk) = SaitoPublicKey::from_base58(publickey) else {
            return 0;
        };

        if verify(message.as_bytes(), &sig, &pk) {
            1
        } else {
            0
        }
    }
}
