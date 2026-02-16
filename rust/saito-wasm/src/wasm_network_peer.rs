use js_sys::JsString;
use saito_core::core::defs::PrintForLog;
use saito_core::core::routing::peers::network_peer::NetworkPeer;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmNetworkPeer {
    peer: NetworkPeer,
}

#[wasm_bindgen]
impl WasmNetworkPeer {
    pub fn get_public_key(&self) -> JsString {
        self.peer.public_key.unwrap().to_base58().into()
    }
}

impl WasmNetworkPeer {
    pub fn new(peer: NetworkPeer) -> WasmNetworkPeer {
        Self { peer }
    }
    pub fn get_peer(&self) -> NetworkPeer {
        self.peer.clone()
    }
}
