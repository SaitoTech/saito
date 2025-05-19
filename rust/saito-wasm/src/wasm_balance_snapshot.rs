use js_sys::{Array, JsString};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use saito_core::core::util::balance_snapshot::BalanceSnapshot;

#[wasm_bindgen]
pub struct WasmBalanceSnapshot {
    snapshot: BalanceSnapshot,
}

impl WasmBalanceSnapshot {
    pub fn new(snapshot: BalanceSnapshot) -> WasmBalanceSnapshot {
        WasmBalanceSnapshot { snapshot }
    }
    pub fn get_snapshot(self) -> BalanceSnapshot {
        self.snapshot
    }
}

#[wasm_bindgen]
impl WasmBalanceSnapshot {
    pub fn get_file_name(&self) -> JsString {
        self.snapshot.get_file_name().into()
    }
    pub fn get_entries(&self) -> Array {
        let rows = self.snapshot.get_rows();
        let array = js_sys::Array::new_with_length(rows.len() as u32);
        for (index, row) in rows.iter().enumerate() {
            let entry: JsString = row.to_string().into();
            array.set(index as u32, JsValue::from(entry));
        }
        array
    }
    pub fn from_string(str: JsString) -> Result<WasmBalanceSnapshot, JsValue> {
        let str: String = str.into();
        let result = str.try_into();
        if result.is_err() {
            // log::info!("str = {:?}", str);
            return Err(JsValue::from("failed converting string to snapshot"));
        }
        let snapshot: BalanceSnapshot = result.unwrap();
        let snapshot = WasmBalanceSnapshot::new(snapshot);

        Ok(snapshot)
    }

    pub fn to_string(&self) -> JsString {
        self.snapshot.to_string().into()
    }
}
