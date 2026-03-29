use crate::saitowasm::{SAITO, string_to_key};

use saito_core::core::defs::PrintForLog;
use saito_core::core::msg::api_message::ApiMessage;
use saito_core::core::msg::message::Message;
use saito_core::core::defs::SaitoPublicKey;
use log::trace;
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
        let key: SaitoPublicKey = string_to_key(key).unwrap_or([0; 33]);

        trace!("send_api_call : {:?}", key.to_base58());

        let saito = SAITO.lock().await;

        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };

        let message = Message::ApplicationMessage(api_message);

        if key == [0; 33] {
            saito
                .as_ref()
                .unwrap()
                .routing_thread
                .network
                .io_interface
                .send_message_to_all(message.serialize().as_slice(), vec![])
                .await
                .unwrap();
        } else {
            saito
                .as_ref()
                .unwrap()
                .routing_thread
                .network
                .io_interface
                .send_message(key, message.serialize().as_slice())
                .await
                .unwrap();
        }
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

