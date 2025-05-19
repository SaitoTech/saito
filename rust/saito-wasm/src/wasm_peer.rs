use js_sys::{Array, JsString};
use log::warn;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use crate::wasm_peer_service::WasmPeerService;
use saito_core::core::consensus::peers::peer::Peer;
use saito_core::core::defs::{PeerIndex, PrintForLog};

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmPeer {
    peer: Peer,
}

#[wasm_bindgen]
impl WasmPeer {
    #[wasm_bindgen(getter = public_key)]
    pub fn get_public_key(&self) -> JsString {
        if self.peer.get_public_key().is_none() {
            warn!("peer : {:?} public key is not set", self.peer.index);
            return JsString::from([0; 33].to_base58());
        }
        self.peer.get_public_key().unwrap().to_base58().into()
    }
    #[wasm_bindgen(getter = key_list)]
    pub fn get_key_list(&self) -> Array {
        let array = Array::new_with_length(self.peer.key_list.len() as u32);
        for (i, key) in self.peer.key_list.iter().enumerate() {
            array.set(i as u32, JsValue::from(key.to_base58()));
        }
        array
    }

    #[wasm_bindgen(getter = peer_index)]
    pub fn get_peer_index(&self) -> u64 {
        self.peer.index
    }
    #[wasm_bindgen(constructor)]
    pub fn new(peer_index: PeerIndex) -> WasmPeer {
        WasmPeer {
            peer: Peer::new(peer_index),
        }
    }
    #[wasm_bindgen(getter = sync_type)]
    pub fn get_sync_type(&self) -> JsString {
        if self.peer.block_fetch_url.is_empty() {
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
        self.peer.has_service(service.into())
    }

    #[wasm_bindgen(getter = status)]
    pub fn get_status(&self) -> JsString {
        match self.peer.peer_status {
            saito_core::core::consensus::peers::peer::PeerStatus::Connected => "connected",
            saito_core::core::consensus::peers::peer::PeerStatus::Disconnected(_, _) => {
                "disconnected"
            }
            saito_core::core::consensus::peers::peer::PeerStatus::Connecting => "connecting",
        }
        .into()
    }

    // pub fn set_ip(&mut self, ip: JsString) {
    //     let s = ip.as_string();
    //     if s.is_none() {
    //         debug!("cannot parse ip string : {:?}", ip);
    //         return;
    //     }
    //     let s: String = s.unwrap();
    //     if let Ok(address) = IpAddr::from_str(&s) {
    //         self.peer.ip_address = Some(address);
    //     }
    // }
}

impl WasmPeer {
    pub fn new_from_peer(peer: Peer) -> WasmPeer {
        WasmPeer { peer }
    }
}
