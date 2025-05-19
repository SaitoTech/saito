use saito_core::{core::consensus::hop::Hop, core::defs::PrintForLog};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmHop {
    pub(crate) hop: Hop,
}

impl WasmHop {
    pub fn from_hop(hop: Hop) -> WasmHop {
        WasmHop { hop: hop }
    }
}

#[wasm_bindgen]
impl WasmHop {
    #[wasm_bindgen(getter)]
    pub fn from(&self) -> String {
        self.hop.from.to_base58()
    }
    #[wasm_bindgen(getter)]
    pub fn sig(&self) -> String {
        self.hop.sig.to_base58()
    }
    #[wasm_bindgen(getter)]
    pub fn to(&self) -> String {
        self.hop.to.to_base58()
    }
}
