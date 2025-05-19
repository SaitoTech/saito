use js_sys::{Array, JsString, Uint8Array};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

use saito_core::core::consensus::wallet::NFT;

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct WasmNFT {
    pub(crate) nft: NFT,
}

#[wasm_bindgen]
impl WasmNFT {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmNFT {
        WasmNFT {
            nft: NFT::default(),
        }
    }

    #[wasm_bindgen(getter = slip1)]
    pub fn get_slip1(&self) -> Uint8Array {
        let buffer = Uint8Array::new_with_length(self.nft.slip1.len() as u32);
        buffer.copy_from(self.nft.slip1.as_slice());
        buffer
    }

    #[wasm_bindgen(getter = slip2)]
    pub fn get_slip2(&self) -> Uint8Array {
        let buffer = Uint8Array::new_with_length(self.nft.slip2.len() as u32);
        buffer.copy_from(self.nft.slip2.as_slice());
        buffer
    }

    #[wasm_bindgen(getter = slip3)]
    pub fn get_slip3(&self) -> Uint8Array {
        let buffer = Uint8Array::new_with_length(self.nft.slip3.len() as u32);
        buffer.copy_from(self.nft.slip3.as_slice());
        buffer
    }

    #[wasm_bindgen(getter = id)]
    pub fn get_id(&self) -> Uint8Array {
        let buffer = Uint8Array::new_with_length(self.nft.id.len() as u32);
        buffer.copy_from(self.nft.id.as_slice());
        buffer
    }

    #[wasm_bindgen(getter = tx_sig)]
    pub fn get_tx_sig(&self) -> Uint8Array {
        let buffer = Uint8Array::new_with_length(self.nft.tx_sig.len() as u32);
        buffer.copy_from(self.nft.tx_sig.as_slice());
        buffer
    }
}

impl WasmNFT {
    pub fn from_nft(nft: NFT) -> WasmNFT {
        WasmNFT { nft }
    }
}
