use js_sys::JsString;
use wasm_bindgen::prelude::*;
use crate::wasm_network_api::WasmNetworkApi;
use crate::wasm_peer::WasmPeer;

#[wasm_bindgen]
pub struct WasmNetwork;

#[wasm_bindgen]
impl WasmNetwork {

    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmNetwork {
        WasmNetwork {}
    }

    #[wasm_bindgen(getter)]
    pub fn api(&self) -> WasmNetworkApi {
        WasmNetworkApi {}
    }

    #[wasm_bindgen(js_name = getPeers)]
    pub async fn get_peers(&self) -> js_sys::Array {
        crate::saitowasm::get_peers().await
    }

    #[wasm_bindgen(js_name = getPeer)]
    pub async fn get_peer(&self, key: JsString) -> Option<WasmPeer> {
        crate::saitowasm::get_peer(key).await
    }
}

