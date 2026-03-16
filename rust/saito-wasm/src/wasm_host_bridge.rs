use std::io::{Error, ErrorKind};
use std::sync::{Arc, RwLock};

use js_sys::{Array, BigInt, Boolean, Uint8Array};
use lazy_static::lazy_static;
use saito_core::core::defs::{BlockId, PrintForLog, SaitoHash};
use saito_core::core::routing::peers::peer_service::PeerService;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use crate::wasm_peer_service::{WasmPeerService, WasmPeerServiceList};

pub trait WasmHostBridge: Send + Sync {
    fn send_message(&self, public_key: String, buffer: &[u8]) -> Result<(), Error>;
    fn send_message_to_all(&self, buffer: &[u8], exceptions: Vec<String>) -> Result<(), Error>;
    fn connect_to_peer(&self, url: String) -> Result<(), Error>;
    fn disconnect_from_peer(&self, public_key: String) -> Result<(), Error>;
    fn fetch_block_from_peer(
        &self,
        block_hash: SaitoHash,
        public_key: String,
        url: &str,
        block_id: BlockId,
    ) -> Result<(), Error>;
    fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error>;
    fn append_value(&self, key: &str, value: &[u8]) -> Result<(), Error>;
    fn flush_data(&self, key: &str) -> Result<(), Error>;
    fn read_value(&self, key: &str) -> Result<Vec<u8>, Error>;
    fn load_block_file_list(&self) -> Result<Vec<String>, Error>;
    fn is_existing_file(&self, key: &str) -> bool;
    fn remove_value(&self, key: &str) -> Result<(), Error>;
    fn ensure_directory_exists(&self, path: &str) -> Result<(), Error>;
    fn process_api_call(&self, buffer: Vec<u8>, msg_index: u32, public_key: String);
    fn process_api_success(&self, buffer: Vec<u8>, msg_index: u32, public_key: String);
    fn process_api_error(&self, buffer: Vec<u8>, msg_index: u32, public_key: String);
    fn send_interface_event(&self, event: &str, public_key: String);
    fn send_block_success(&self, hash: String, block_id: BlockId);
    fn send_wallet_update(&self);
    fn send_block_fetch_status_event(&self, count: BlockId);
    fn send_new_chain_detected_event(&self);
    fn save_wallet(&self);
    fn load_wallet(&self);
    fn get_my_services(&self) -> Vec<PeerService>;
    fn send_new_version_alert(&self, version: String, public_key: String);
}

lazy_static! {
    static ref HOST_BRIDGE: RwLock<Arc<dyn WasmHostBridge>> =
        RwLock::new(Arc::new(JsWasmHostBridge {}));
}

pub fn current_host_bridge() -> Arc<dyn WasmHostBridge> {
    HOST_BRIDGE.read().unwrap().clone()
}

pub(crate) fn swap_host_bridge(host_bridge: Arc<dyn WasmHostBridge>) -> Arc<dyn WasmHostBridge> {
    let mut guard = HOST_BRIDGE.write().unwrap();
    std::mem::replace(&mut *guard, host_bridge)
}

pub struct JsWasmHostBridge {}

impl WasmHostBridge for JsWasmHostBridge {
    fn send_message(&self, public_key: String, buffer: &[u8]) -> Result<(), Error> {
        let array = Uint8Array::new_with_length(buffer.len() as u32);
        array.copy_from(buffer);
        MsgHandler::send_message(public_key, &array);
        Ok(())
    }

    fn send_message_to_all(&self, buffer: &[u8], exceptions: Vec<String>) -> Result<(), Error> {
        let array = Uint8Array::new_with_length(buffer.len() as u32);
        array.copy_from(buffer);
        let arr2 = Array::new_with_length(exceptions.len() as u32);

        for (i, exception) in exceptions.iter().enumerate() {
            arr2.set(i as u32, JsValue::from(exception));
        }

        MsgHandler::send_message_to_all(&array, &arr2);
        Ok(())
    }

    fn connect_to_peer(&self, url: String) -> Result<(), Error> {
        MsgHandler::connect_to_peer(url).map_err(|_| Error::from(ErrorKind::Other))?;
        Ok(())
    }

    fn disconnect_from_peer(&self, public_key: String) -> Result<(), Error> {
        MsgHandler::disconnect_from_peer(public_key).map_err(|_| Error::from(ErrorKind::Other))?;
        Ok(())
    }

    fn fetch_block_from_peer(
        &self,
        block_hash: SaitoHash,
        public_key: String,
        url: &str,
        block_id: BlockId,
    ) -> Result<(), Error> {
        let hash = Uint8Array::new_with_length(32);
        hash.copy_from(block_hash.as_slice());
        MsgHandler::fetch_block_from_peer(
            &hash,
            public_key,
            url.to_string(),
            BigInt::from(block_id),
        )
        .map_err(|_| Error::from(ErrorKind::Other))?;
        Ok(())
    }

    fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
        let array = Uint8Array::new_with_length(value.len() as u32);
        array.copy_from(value);
        MsgHandler::write_value(key.to_string(), &array);
        Ok(())
    }

    fn append_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
        let array = Uint8Array::new_with_length(value.len() as u32);
        array.copy_from(value);
        MsgHandler::append_value(key.to_string(), &array);
        Ok(())
    }

    fn flush_data(&self, key: &str) -> Result<(), Error> {
        MsgHandler::flush_data(key.to_string());
        Ok(())
    }

    fn read_value(&self, key: &str) -> Result<Vec<u8>, Error> {
        let result =
            MsgHandler::read_value(key.to_string()).map_err(|_| Error::from(ErrorKind::Other))?;
        Ok(result.to_vec())
    }

    fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
        let result =
            MsgHandler::load_block_file_list().map_err(|_| Error::from(ErrorKind::Other))?;
        let result = Array::try_from(result).map_err(|_| Error::from(ErrorKind::Other))?;

        let mut values = vec![];
        for i in 0..result.length() {
            let res = result.get(i);
            let res = js_sys::JsString::from(res)
                .as_string()
                .ok_or_else(|| Error::from(ErrorKind::InvalidData))?;
            values.push(res);
        }

        Ok(values)
    }

    fn is_existing_file(&self, key: &str) -> bool {
        MsgHandler::is_existing_file(key.to_string())
            .map(Boolean::from)
            .map(bool::from)
            .unwrap_or(false)
    }

    fn remove_value(&self, key: &str) -> Result<(), Error> {
        MsgHandler::remove_value(key.to_string()).map_err(|_| Error::from(ErrorKind::Other))?;
        Ok(())
    }

    fn ensure_directory_exists(&self, path: &str) -> Result<(), Error> {
        MsgHandler::ensure_directory_exists(path.to_string())
            .map_err(|_| Error::from(ErrorKind::Other))?;
        Ok(())
    }

    fn process_api_call(&self, buffer: Vec<u8>, msg_index: u32, public_key: String) {
        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        MsgHandler::process_api_call(buf, msg_index, public_key);
    }

    fn process_api_success(&self, buffer: Vec<u8>, msg_index: u32, public_key: String) {
        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        MsgHandler::process_api_success(buf, msg_index, public_key);
    }

    fn process_api_error(&self, buffer: Vec<u8>, msg_index: u32, public_key: String) {
        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        MsgHandler::process_api_error(buf, msg_index, public_key);
    }

    fn send_interface_event(&self, event: &str, public_key: String) {
        MsgHandler::send_interface_event(event.to_string(), public_key);
    }

    fn send_block_success(&self, hash: String, block_id: BlockId) {
        MsgHandler::send_block_success(hash, BigInt::from(block_id));
    }

    fn send_wallet_update(&self) {
        MsgHandler::send_wallet_update();
    }

    fn send_block_fetch_status_event(&self, count: BlockId) {
        MsgHandler::send_block_fetch_status_event(count);
    }

    fn send_new_chain_detected_event(&self) {
        MsgHandler::send_new_chain_detected_event();
    }

    fn save_wallet(&self) {
        MsgHandler::save_wallet();
    }

    fn load_wallet(&self) {
        MsgHandler::load_wallet();
    }

    fn get_my_services(&self) -> Vec<PeerService> {
        let mut result: WasmPeerServiceList = MsgHandler::get_my_services();
        result
            .services
            .drain(..)
            .map(|s: WasmPeerService| s.service)
            .collect()
    }

    fn send_new_version_alert(&self, version: String, public_key: String) {
        MsgHandler::send_new_version_alert(version, public_key);
    }
}

#[wasm_bindgen(module = "/js/msg_handler.js")]
extern "C" {
    pub type MsgHandler;

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_message(public_key: String, buffer: &Uint8Array);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_message_to_all(buffer: &Uint8Array, exceptions: &Array);

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn connect_to_peer(url: String) -> Result<JsValue, js_sys::Error>;

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn write_value(key: String, value: &Uint8Array);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn append_value(key: String, value: &Uint8Array);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn flush_data(key: String);

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn ensure_directory_exists(path: String) -> Result<(), js_sys::Error>;

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn read_value(key: String) -> Result<Uint8Array, js_sys::Error>;

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn load_block_file_list() -> Result<Array, js_sys::Error>;

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn is_existing_file(key: String) -> Result<Boolean, js_sys::Error>;

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn remove_value(key: String) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn disconnect_from_peer(public_key: String) -> Result<JsValue, js_sys::Error>;

    #[wasm_bindgen(static_method_of = MsgHandler, catch)]
    pub fn fetch_block_from_peer(
        hash: &Uint8Array,
        public_key: String,
        url: String,
        block_id: BigInt,
    ) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn process_api_call(buffer: Uint8Array, msg_index: u32, public_key: String);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn process_api_success(buffer: Uint8Array, msg_index: u32, public_key: String);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn process_api_error(buffer: Uint8Array, msg_index: u32, public_key: String);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_interface_event(event: String, public_key: String);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_block_success(hash: String, block_id: BigInt);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_wallet_update();

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_block_fetch_status_event(count: BlockId);

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_new_chain_detected_event();

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn save_wallet();

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn load_wallet();

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn get_my_services() -> WasmPeerServiceList;

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_new_version_alert(version: String, public_key: String);
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use saito_core::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};

    use super::*;
    use crate::wasm_io_handler::WasmIoHandler;

    #[derive(Default)]
    struct MockState {
        sent_messages: Vec<(String, Vec<u8>)>,
        interface_events: Vec<(String, String)>,
        block_success: Vec<(String, BlockId)>,
        wallet_updates: usize,
    }

    struct MockHostBridge {
        state: Arc<Mutex<MockState>>,
    }

    impl MockHostBridge {
        fn new(state: Arc<Mutex<MockState>>) -> Self {
            Self { state }
        }
    }

    impl WasmHostBridge for MockHostBridge {
        fn send_message(&self, public_key: String, buffer: &[u8]) -> Result<(), Error> {
            self.state
                .lock()
                .unwrap()
                .sent_messages
                .push((public_key, buffer.to_vec()));
            Ok(())
        }

        fn send_message_to_all(
            &self,
            _buffer: &[u8],
            _exceptions: Vec<String>,
        ) -> Result<(), Error> {
            Ok(())
        }

        fn connect_to_peer(&self, _url: String) -> Result<(), Error> {
            Ok(())
        }
        fn disconnect_from_peer(&self, _public_key: String) -> Result<(), Error> {
            Ok(())
        }
        fn fetch_block_from_peer(
            &self,
            _block_hash: SaitoHash,
            _public_key: String,
            _url: &str,
            _block_id: BlockId,
        ) -> Result<(), Error> {
            Ok(())
        }
        fn write_value(&self, _key: &str, _value: &[u8]) -> Result<(), Error> {
            Ok(())
        }
        fn append_value(&self, _key: &str, _value: &[u8]) -> Result<(), Error> {
            Ok(())
        }
        fn flush_data(&self, _key: &str) -> Result<(), Error> {
            Ok(())
        }
        fn read_value(&self, _key: &str) -> Result<Vec<u8>, Error> {
            Ok(vec![])
        }
        fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
            Ok(vec![])
        }
        fn is_existing_file(&self, _key: &str) -> bool {
            false
        }
        fn remove_value(&self, _key: &str) -> Result<(), Error> {
            Ok(())
        }
        fn ensure_directory_exists(&self, _path: &str) -> Result<(), Error> {
            Ok(())
        }
        fn process_api_call(&self, _buffer: Vec<u8>, _msg_index: u32, _public_key: String) {}
        fn process_api_success(&self, _buffer: Vec<u8>, _msg_index: u32, _public_key: String) {}
        fn process_api_error(&self, _buffer: Vec<u8>, _msg_index: u32, _public_key: String) {}

        fn send_interface_event(&self, event: &str, public_key: String) {
            self.state
                .lock()
                .unwrap()
                .interface_events
                .push((event.to_string(), public_key));
        }

        fn send_block_success(&self, hash: String, block_id: BlockId) {
            self.state
                .lock()
                .unwrap()
                .block_success
                .push((hash, block_id));
        }

        fn send_wallet_update(&self) {
            self.state.lock().unwrap().wallet_updates += 1;
        }

        fn send_block_fetch_status_event(&self, _count: BlockId) {}
        fn send_new_chain_detected_event(&self) {}
        fn save_wallet(&self) {}
        fn load_wallet(&self) {}
        fn get_my_services(&self) -> Vec<PeerService> {
            vec![]
        }
        fn send_new_version_alert(&self, _version: String, _public_key: String) {}
    }

    #[tokio::test]
    async fn wasm_io_handler_delegates_send_message_to_host_bridge() {
        let state = Arc::new(Mutex::new(MockState::default()));
        let previous = swap_host_bridge(Arc::new(MockHostBridge::new(state.clone())));

        let handler = WasmIoHandler {};
        let public_key = [1; 33];
        handler.send_message(public_key, &[7, 8, 9]).await.unwrap();

        swap_host_bridge(previous);

        let state = state.lock().unwrap();
        assert_eq!(state.sent_messages.len(), 1);
        assert_eq!(state.sent_messages[0].0, public_key.to_base58());
        assert_eq!(state.sent_messages[0].1, vec![7, 8, 9]);
    }

    #[test]
    fn wasm_io_handler_delegates_interface_events_to_host_bridge() {
        let state = Arc::new(Mutex::new(MockState::default()));
        let previous = swap_host_bridge(Arc::new(MockHostBridge::new(state.clone())));

        let handler = WasmIoHandler {};
        let public_key = [2; 33];
        handler.send_interface_event(InterfaceEvent::PeerConnected(public_key));
        handler.send_interface_event(InterfaceEvent::WalletUpdate());
        handler.send_interface_event(InterfaceEvent::BlockAddSuccess([3; 32], 44));

        swap_host_bridge(previous);

        let state = state.lock().unwrap();
        assert_eq!(
            state.interface_events,
            vec![("peer_connect".to_string(), public_key.to_base58())]
        );
        assert_eq!(state.wallet_updates, 1);
        assert_eq!(state.block_success, vec![([3; 32].to_hex(), 44)]);
    }
}
