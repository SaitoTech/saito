use js_sys::{Array, JsString};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use crate::wasm_peer_service::WasmPeerService;
use saito_core::core::defs::PrintForLog;
use saito_core::core::network::peer::Peer;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmPeer {
    peer: Peer,
}

#[wasm_bindgen]
impl WasmPeer {
    #[wasm_bindgen(getter = public_key)]
    pub fn get_public_key(&self) -> JsString {
        self.peer.get_public_key().to_base58().into()
    }
    #[wasm_bindgen(getter = key_list)]
    pub fn get_key_list(&self) -> Array {
        let array = Array::new_with_length(self.peer.key_list.len() as u32);
        for (i, key) in self.peer.key_list.iter().enumerate() {
            array.set(i as u32, JsValue::from(key.to_base58()));
        }
        array
    }
    //
    // #[wasm_bindgen(constructor)]
    // pub fn new(public_key: PeerIndex) -> WasmPeer {
    //     WasmPeer {
    //         peer: Peer::new(public_key),
    //     }
    // }
    #[wasm_bindgen(getter = sync_type)]
    pub fn get_sync_type(&self) -> JsString {
        if self.peer.get_block_fetch_url().is_empty() {
            return "lite".into();
        }
        return "full".into();
    }
    #[wasm_bindgen(getter = services)]
    pub fn get_services(&self) -> JsValue {
        let arr = js_sys::Array::new_with_length(self.peer.services.len() as u32);
        for (i, service) in self.peer.services.iter().enumerate() {
            arr.set(
                i as u32,
                JsValue::from(WasmPeerService {
                    service: service.clone(),
                }),
            );
        }
        JsValue::from(arr)
    }
    #[wasm_bindgen(setter = services)]
    pub fn set_services(&mut self, services: JsValue) {
        let mut services: Vec<WasmPeerService> = serde_wasm_bindgen::from_value(services).unwrap();
        let services = services.drain(..).map(|s| s.service).collect();

        // let mut ser = vec![];
        // for i in 0..services.length() {
        //     let str = WasmPeerService::from(services.at(i as i32));
        //     ser.push(str.service);
        // }
        self.peer.services = services;
    }
    pub fn has_service(&self, service: JsString) -> bool {
        let needle = service.as_string().unwrap_or_default();
        self.peer.services.iter().any(|s| s.service == needle)
    }

    #[wasm_bindgen(getter = status)]
    pub fn get_status(&self) -> JsString {
        if self.peer.is_connected {
            "connected".into()
        } else if self.peer.is_connecting {
            "connecting".into()
        } else {
            "disconnected".into()
        }
    }
}

impl WasmPeer {
    pub fn new_from_peer(peer: Peer) -> WasmPeer {
        WasmPeer { peer }
    }
}
