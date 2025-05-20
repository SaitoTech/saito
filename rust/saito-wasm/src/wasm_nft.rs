use crate::wasm_slip::WasmSlip;
use js_sys::Uint8Array;
use saito_core::core::consensus::wallet::DetailedNFT;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct WasmNFT {
    pub(crate) nft: DetailedNFT,
}

#[wasm_bindgen]
impl WasmNFT {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmNFT {
        WasmNFT {
            nft: DetailedNFT::default(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> Uint8Array {
        Uint8Array::from(self.nft.id.as_slice())
    }

    #[wasm_bindgen(setter)]
    pub fn set_id(&mut self, arr: &Uint8Array) {
        let mut v = vec![0u8; arr.length() as usize];
        arr.copy_to(&mut v);
        self.nft.id = v;
    }

    #[wasm_bindgen(getter = tx_sig)]
    pub fn tx_sig(&self) -> Uint8Array {
        Uint8Array::from(self.nft.tx_sig.as_ref())
    }

    #[wasm_bindgen(setter = tx_sig)]
    pub fn set_tx_sig(&mut self, arr: &Uint8Array) {
        let mut a = [0u8; 64];
        arr.copy_to(&mut a);
        self.nft.tx_sig = a;
    }

    #[wasm_bindgen(getter)]
    pub fn slip1(&self) -> WasmSlip {
        WasmSlip::new_from_slip(self.nft.slip1.clone())
    }

    #[wasm_bindgen(setter)]
    pub fn set_slip1(&mut self, ws: &WasmSlip) {
        self.nft.slip1 = ws.slip.clone();
    }

    #[wasm_bindgen(getter)]
    pub fn slip2(&self) -> WasmSlip {
        WasmSlip::new_from_slip(self.nft.slip2.clone())
    }

    #[wasm_bindgen(setter)]
    pub fn set_slip2(&mut self, ws: &WasmSlip) {
        self.nft.slip2 = ws.slip.clone();
    }

    #[wasm_bindgen(getter)]
    pub fn slip3(&self) -> WasmSlip {
        WasmSlip::new_from_slip(self.nft.slip3.clone())
    }

    #[wasm_bindgen(setter)]
    pub fn set_slip3(&mut self, ws: &WasmSlip) {
        self.nft.slip3 = ws.slip.clone();
    }
}

impl WasmNFT {
    pub fn new_from_nft(nft: DetailedNFT) -> WasmNFT {
        WasmNFT { nft }
    }
}
