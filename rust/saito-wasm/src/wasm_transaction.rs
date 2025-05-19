use js_sys::{Array, JsString, Uint8Array};
use num_traits::FromPrimitive;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use saito_core::core::consensus::transaction::{Transaction, TransactionType};
use saito_core::core::defs::{Currency, PrintForLog, Timestamp};

use crate::saitowasm::{string_to_hex, string_to_key, SAITO};
use crate::wasm_hop::WasmHop;
use crate::wasm_slip::WasmSlip;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmTransaction {
    pub(crate) tx: Transaction,
}

#[wasm_bindgen]
impl WasmTransaction {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmTransaction {
        WasmTransaction {
            tx: Transaction::default(),
        }
    }
    #[wasm_bindgen(getter = signature)]
    pub fn signature(&self) -> js_sys::JsString {
        self.tx.signature.to_hex().into()
    }

    #[wasm_bindgen(getter = routing_path)]
    pub fn get_routing_path(&self) -> Array {
        self.tx
            .path
            .iter()
            .map(|path| JsValue::from(WasmHop::from_hop(path.clone())))
            .collect::<Array>()
    }

    #[wasm_bindgen(setter = signature)]
    pub fn set_signature(&mut self, signature: JsString) {
        self.tx.signature = string_to_hex(signature).unwrap();
    }

    pub fn add_to_slip(&mut self, slip: WasmSlip) {
        self.tx.add_to_slip(slip.slip.clone());
    }

    pub fn add_from_slip(&mut self, slip: WasmSlip) {
        self.tx.add_from_slip(slip.slip.clone());
    }

    #[wasm_bindgen(getter = txs_replacements)]
    pub fn get_txs_replacements(&self) -> u32 {
        self.tx.txs_replacements
    }
    #[wasm_bindgen(setter = txs_replacements)]
    pub fn set_txs_replacements(&mut self, r: u32) {
        self.tx.txs_replacements = r;
    }

    #[wasm_bindgen(getter)]
    pub fn to(&self) -> Array {
        let mut slips: Vec<WasmSlip> = self
            .tx
            .to
            .iter()
            .map(|slip| WasmSlip::new_from_slip(slip.clone()))
            .collect();
        let array = js_sys::Array::new_with_length(slips.len() as u32);
        for (i, slip) in slips.drain(..).enumerate() {
            array.set(i as u32, JsValue::from(slip));
        }
        array
    }

    #[wasm_bindgen(getter)]
    pub fn from(&self) -> Array {
        let mut slips: Vec<WasmSlip> = self
            .tx
            .from
            .iter()
            .map(|slip| WasmSlip::new_from_slip(slip.clone()))
            .collect();
        let array = js_sys::Array::new_with_length(slips.len() as u32);
        for (i, slip) in slips.drain(..).enumerate() {
            array.set(i as u32, JsValue::from(slip));
        }
        array
    }

    pub fn is_from(&self, key: JsString) -> bool {
        let key = string_to_key(key);
        if key.is_err() {
            return false;
        }
        return self.tx.is_from(&key.unwrap());
    }
    pub fn is_to(&self, key: JsString) -> bool {
        let key = string_to_key(key);
        if key.is_err() {
            return false;
        }
        return self.tx.is_to(&key.unwrap());
    }

    #[wasm_bindgen(getter = data)]
    pub fn get_data(&self) -> js_sys::Uint8Array {
        let buffer = js_sys::Uint8Array::new_with_length(self.tx.data.len() as u32);
        buffer.copy_from(self.tx.data.as_slice());

        buffer
    }
    #[wasm_bindgen(setter = data)]
    pub fn set_data(&mut self, buffer: Uint8Array) {
        self.tx.data = buffer.to_vec();
    }

    #[wasm_bindgen(getter = timestamp)]
    pub fn get_timestamp(&self) -> Timestamp {
        self.tx.timestamp
    }
    #[wasm_bindgen(setter = timestamp)]
    pub fn set_timestamp(&mut self, timestamp: Timestamp) {
        self.tx.timestamp = timestamp;
    }

    pub async fn sign(&mut self) {
        let saito = SAITO.lock().await;
        let wallet = saito.as_ref().unwrap().context.wallet_lock.read().await;
        self.tx.sign(&wallet.private_key);
    }

    #[wasm_bindgen(getter = type)]
    pub fn get_type(&self) -> u8 {
        self.tx.transaction_type as u8
    }
    #[wasm_bindgen(setter = type)]
    pub fn set_type(&mut self, t: u8) {
        self.tx.transaction_type =
            TransactionType::from_u8(t).expect("invalid value for transaction type");
    }
    #[wasm_bindgen(getter = total_fees)]
    pub fn total_fees(&self) -> Currency {
        self.tx.total_fees
    }
    pub fn serialize(&self) -> Uint8Array {
        let buffer = self.tx.serialize_for_net();
        let res = Uint8Array::new_with_length(buffer.len() as u32);
        res.copy_from(buffer.as_slice());
        return res;
    }
    pub fn deserialize(buffer: Uint8Array) -> Result<WasmTransaction, JsValue> {
        let tx = Transaction::deserialize_from_net(&buffer.to_vec());
        if tx.is_err() {
            return Err(JsValue::from("transaction deserialization failed"));
        }
        let tx = WasmTransaction::from_transaction(tx.unwrap());
        Ok(tx)
    }
}

impl WasmTransaction {
    pub fn from_transaction(transaction: Transaction) -> WasmTransaction {
        WasmTransaction { tx: transaction }
    }
}
