use log::error;
use serde::Serialize;
use serde_wasm_bindgen::Serializer;
use wasm_bindgen::JsValue;

pub fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    let serializer = Serializer::new().serialize_large_number_types_as_bigints(true);
    value.serialize(&serializer).map_err(|e| {
        error!("WASM serialize failed: {e}");
        JsValue::from_str(&format!("serialization failed: {e}"))
    })
}
