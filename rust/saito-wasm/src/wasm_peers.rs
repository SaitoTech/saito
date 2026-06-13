use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use serde::Serialize;
use serde_wasm_bindgen::Serializer;
use crate::saitowasm::{string_to_key, SAITO};

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmPeers {}

#[wasm_bindgen]
impl WasmPeers {
    pub fn get(&self, public_key: Option<String>) -> JsValue {
        let saito = SAITO.blocking_lock();

        let peers = saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .peer_lock
            .blocking_read();

	let serializer = Serializer::new()
          .serialize_large_number_types_as_bigints(true);


        match public_key {
            Some(pk) => {

                // ✅ convert String → JsString
                let js_pk = JsValue::from_str(&pk);

                // ✅ parse key (handle Result)
                let key: Result<[u8; 33], _> = string_to_key(js_pk.into());

                match key {
                    Ok(key_bytes) => {
                        if let Some(peer) = peers.get_peer_by_public_key(&key_bytes) {
                            peer.serialize(&serializer).unwrap()
                        } else {
                            JsValue::NULL
                        }
                    }
                    Err(_) => JsValue::NULL,
                }
            }
            None => (&*peers).serialize(&serializer).unwrap()
        }
    }
}
