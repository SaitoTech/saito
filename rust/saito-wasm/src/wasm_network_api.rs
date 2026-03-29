use wasm_bindgen::prelude::*;
use js_sys::{Uint8Array, JsString};
use crate::saitowasm::{
    send_api_call,
    send_api_success,
    send_api_error,
};


#[wasm_bindgen]
pub struct WasmNetworkApi;

#[wasm_bindgen]
impl WasmNetworkApi {

    #[wasm_bindgen(js_name = send)]
    pub async fn send(
        &self,
        buffer: Uint8Array,
        msg_index: u32,
        key: JsString,
    ) {
        send_api_call(buffer, msg_index, key).await;
    }

    #[wasm_bindgen(js_name = success)]
    pub async fn success(
        &self,
        buffer: Uint8Array,
        msg_index: u32,
        key: JsString,
    ) {
        send_api_success(buffer, msg_index, key).await;
    }

    #[wasm_bindgen(js_name = error)]
    pub async fn error(
        &self,
        buffer: Uint8Array,
        msg_index: u32,
        key: JsString,
    ) {
        send_api_error(buffer, msg_index, key).await;
    }
}

