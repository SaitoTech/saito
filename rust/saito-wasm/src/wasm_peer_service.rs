use js_sys::JsString;
use saito_core::core::consensus::peers::peer_service::PeerService;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub struct WasmPeerServiceList {
    pub(crate) services: Vec<WasmPeerService>,
}

#[wasm_bindgen]
#[derive(Clone, Serialize, Deserialize)]
pub struct WasmPeerService {
    pub(crate) service: PeerService,
}

#[wasm_bindgen]
impl WasmPeerService {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmPeerService {
        WasmPeerService {
            service: PeerService {
                service: "".to_string(),
                domain: "".to_string(),
                name: "".to_string(),
            },
        }
    }
    #[wasm_bindgen(setter=service)]
    pub fn set_service(&mut self, value: JsString) {
        self.service.service = value.into();
    }

    #[wasm_bindgen(getter=service)]
    pub fn get_service(&self) -> JsString {
        self.service.service.clone().into()
    }

    #[wasm_bindgen(setter=name)]
    pub fn set_name(&mut self, value: JsString) {
        self.service.name = value.into();
    }
    #[wasm_bindgen(getter=name)]
    pub fn get_name(&self) -> JsString {
        self.service.name.clone().into()
    }
    #[wasm_bindgen(setter=domain)]
    pub fn set_domain(&mut self, value: JsString) {
        self.service.domain = value.into();
    }
    #[wasm_bindgen(getter=domain)]
    pub fn get_domain(&self) -> JsString {
        self.service.domain.clone().into()
    }
}

#[wasm_bindgen]
impl WasmPeerServiceList {
    pub fn push(&mut self, service: WasmPeerService) {
        self.services.push(service);
    }
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmPeerServiceList {
        WasmPeerServiceList { services: vec![] }
    }
}
