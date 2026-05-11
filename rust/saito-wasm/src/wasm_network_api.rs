use crate::saitowasm::{string_to_key, SAITO};

use js_sys::{JsString, Uint8Array};
use log::trace;
use saito_core::core::defs::PrintForLog;
use saito_core::core::defs::SaitoPublicKey;
use saito_core::core::network::msg::api_message::ApiMessage;
use saito_core::core::network::msg::message::Message;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmNetworkApi;

#[wasm_bindgen]
impl WasmNetworkApi {
    #[wasm_bindgen(js_name = send)]
    pub async fn send(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        let key: SaitoPublicKey = string_to_key(key).unwrap_or([0; 33]);

        trace!("send_api_call : {:?}", key.to_base58());

        let saito = SAITO.lock().await;

        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };

        let message = Message::ApplicationMessage(api_message);
        let serialized = message.serialize();

        if key == [0; 33] {
            saito
                .as_ref()
                .unwrap()
                .routing_thread
                .network
                .io_interface
                .send_message_to_all(serialized.as_slice(), vec![])
                .await
                .unwrap();
        } else {
            saito
                .as_ref()
                .unwrap()
                .routing_thread
                .network
                .io_interface
                .send_message(key, serialized.as_slice())
                .await
                .unwrap();
        }
    }

    #[wasm_bindgen(js_name = success)]
    pub async fn success(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        let key: SaitoPublicKey = string_to_key(key).unwrap();
        trace!("send_api_success : {:?}", key.to_base58());

        let saito = SAITO.lock().await;

        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };

        let message = Message::Result(api_message);
        let serialized = message.serialize();

        saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .io_interface
            .send_message(key, serialized.as_slice())
            .await
            .unwrap();
    }

    #[wasm_bindgen(js_name = error)]
    pub async fn error(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        let key: SaitoPublicKey = string_to_key(key).unwrap();
        trace!("send_api_error : {:?}", key.to_base58());

        let saito = SAITO.lock().await;

        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };

        let message = Message::Error(api_message);
        let serialized = message.serialize();

        saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .io_interface
            .send_message(key, serialized.as_slice())
            .await
            .unwrap();
    }
}
