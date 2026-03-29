use wasm_bindgen::prelude::*;
use crate::wasm_network_api::WasmNetworkApi;

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
}

