use std::fmt::{Debug, Formatter};
use std::io::{Error, ErrorKind};

use async_trait::async_trait;
use js_sys::{Array, BigInt, Boolean, Uint8Array};
use log::{error, trace};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::defs::{BlockId, PrintForLog, SaitoHash, SaitoPublicKey};
use saito_core::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};
use saito_core::core::routing::peers::peer_service::PeerService;

use crate::wasm_peer_service::{WasmPeerService, WasmPeerServiceList};

pub struct WasmIoHandler {}

#[async_trait]
impl InterfaceIO for WasmIoHandler {
    async fn send_message_by_peer_id(&self, peer_id: u64, buffer: &[u8]) -> Result<(), Error> {
        let array = js_sys::Uint8Array::from(buffer);
        MsgHandler::send_message_by_peer_id(peer_id, &array);
        Ok(())
    }

    async fn send_message(&self, public_key: SaitoPublicKey, buffer: &[u8]) -> Result<(), Error> {
        trace!("WasmIoHandler::send_message : {:?}", public_key.to_base58());

        let array = js_sys::Uint8Array::new_with_length(buffer.len() as u32);
        array.copy_from(buffer);

        // let async_fn =
        MsgHandler::send_message(public_key.to_base58(), &array);
        // let promise = js_sys::Promise::resolve(async_fn);
        // let result = wasm_bindgen_futures::JsFuture::from(async_fn).await;
        drop(array);

        Ok(())
    }

    async fn send_message_to_all(
        &self,
        buffer: &[u8],
        peer_exceptions: Vec<SaitoPublicKey>,
    ) -> Result<(), Error> {
        let array = js_sys::Uint8Array::new_with_length(buffer.len() as u32);
        array.copy_from(buffer);

        let arr2 = js_sys::Array::new_with_length(peer_exceptions.len() as u32);

        for (i, ex) in peer_exceptions.iter().enumerate() {
            let res = ex.to_base58();
            let res = JsValue::from(res);

            arr2.set(i as u32, res);
        }

        MsgHandler::send_message_to_all(&array, &arr2);

        drop(array);
        drop(arr2);

        Ok(())
    }

    async fn connect_to_peer(&mut self, url: String) -> Result<(), Error> {
        trace!("connect_to_peer with url : {:?}", url);

        MsgHandler::connect_to_peer(url).expect("TODO: panic message");

        Ok(())
    }

    async fn disconnect_from_peer(&self, public_key: SaitoPublicKey) -> Result<(), Error> {
        trace!("disconnect from peer : {:?}", public_key.to_base58());
        MsgHandler::disconnect_from_peer(public_key.to_base58()).expect("TODO: panic message");
        Ok(())
    }

    async fn fetch_block_from_peer(
        &self,
        block_hash: SaitoHash,
        public_key: SaitoPublicKey,
        url: &str,
        block_id: BlockId,
    ) -> Result<(), Error> {
        let hash = js_sys::Uint8Array::new_with_length(32);
        hash.copy_from(block_hash.as_slice());
        let result = MsgHandler::fetch_block_from_peer(
            &hash,
            public_key.to_base58(),
            url.to_string(),
            BigInt::from(block_id),
        );
        if result.is_err() {
            error!(
                "failed fetching block : {:?} from peer. {:?}",
                block_hash.to_hex(),
                result.err().unwrap()
            );
            return Err(Error::from(ErrorKind::Other));
        }

        Ok(())
    }

    async fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
        let array = js_sys::Uint8Array::new_with_length(value.len() as u32);
        array.copy_from(value);

        MsgHandler::write_value(key.to_string(), &array);
        drop(array);

        Ok(())
    }

    async fn append_value(&mut self, key: &str, value: &[u8]) -> Result<(), Error> {
        let array = js_sys::Uint8Array::new_with_length(value.len() as u32);
        array.copy_from(value);

        MsgHandler::append_value(key.to_string(), &array);
        drop(array);

        Ok(())
    }

    async fn flush_data(&mut self, key: &str) -> Result<(), Error> {
        MsgHandler::flush_data(key.to_string());

        Ok(())
    }

    async fn read_value(&self, key: &str) -> Result<Vec<u8>, Error> {
        let result = MsgHandler::read_value(key.to_string());
        if result.is_err() {
            error!("couldn't read value for key: {:?}", key);
            return Err(Error::from(ErrorKind::Other));
        }

        let result = result.unwrap();
        let v = result.to_vec();
        drop(result);
        Ok(v)
    }

    async fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
        let result = MsgHandler::load_block_file_list();
        if result.is_err() {
            return Err(Error::from(ErrorKind::Other));
        }

        let result = result.unwrap();
        let result = Array::try_from(result);
        if result.is_err() {
            return Err(Error::from(ErrorKind::Other));
        }
        let result = result.unwrap();

        let mut v = vec![];
        for i in 0..result.length() {
            let res = result.get(i);
            let res = js_sys::JsString::from(res).as_string().unwrap();
            v.push(res);
        }

        Ok(v)
    }

    async fn is_existing_file(&self, key: &str) -> bool {
        let result = MsgHandler::is_existing_file(key.to_string());
        if result.is_err() {
            return false;
        }

        let result = result.unwrap();
        result.into()
    }

    async fn remove_value(&self, key: &str) -> Result<(), Error> {
        let _ = MsgHandler::remove_value(key.to_string());

        Ok(())
    }

    fn get_block_dir(&self) -> String {
        "data/blocks/".to_string()
    }
    fn get_checkpoint_dir(&self) -> String {
        "data/checkpoints/".to_string()
    }

    fn ensure_directory_exists(&self, block_dir_path: &str) -> Result<(), std::io::Error> {
        let result = MsgHandler::ensure_directory_exists(block_dir_path.to_string());
        if result.is_err() {
            error!("{:?}", result.err().unwrap());
            return Err(Error::from(ErrorKind::Other));
        }
        Ok(())
    }

    async fn process_api_call(&self, buffer: Vec<u8>, msg_index: u32, public_key: SaitoPublicKey) {
        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        MsgHandler::process_api_call(buf, msg_index, public_key.to_base58());
    }

    async fn process_api_success(
        &self,
        buffer: Vec<u8>,
        msg_index: u32,
        public_key: SaitoPublicKey,
    ) {
        // let tx = Transaction::deserialize_from_net(&buffer);
        // let buffer = tx.data;
        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        MsgHandler::process_api_success(buf, msg_index, public_key.to_base58());
    }

    async fn process_api_error(&self, buffer: Vec<u8>, msg_index: u32, public_key: SaitoPublicKey) {
        // let tx = Transaction::deserialize_from_net(&buffer);
        // let buffer = tx.data;

        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        MsgHandler::process_api_error(buf, msg_index, public_key.to_base58());
    }

    fn send_interface_event(&self, event: InterfaceEvent) {
        match event {
            InterfaceEvent::PeerHandshakeComplete(public_key) => {
                MsgHandler::send_interface_event(
                    "handshake_complete".to_string(),
                    public_key.to_base58(),
                );
            }
            InterfaceEvent::PeerConnectionDropped(public_key) => {
                MsgHandler::send_interface_event(
                    "peer_disconnect".to_string(),
                    public_key.to_base58(),
                );
            }
            InterfaceEvent::PeerConnected(public_key) => {
                MsgHandler::send_interface_event(
                    "peer_connect".to_string(),
                    public_key.to_base58(),
                );
            }
            InterfaceEvent::BlockAddSuccess(hash, block_id) => {
                MsgHandler::send_block_success(hash.to_hex(), BigInt::from(block_id));
            }
            InterfaceEvent::WalletUpdate() => {
                MsgHandler::send_wallet_update();
            }
            InterfaceEvent::NewVersionDetected(index, version) => {
                MsgHandler::send_new_version_alert(
                    format!(
                        "{:?}.{:?}.{:?}",
                        version.major, version.minor, version.patch
                    )
                    .to_string(),
                    index.to_base58(),
                );
            }

            InterfaceEvent::StunPeerConnected(public_key) => {
                MsgHandler::send_interface_event(
                    "stun peer connect".to_string(),
                    public_key.to_base58(),
                );
            }
            InterfaceEvent::StunPeerDisconnected(public_key) => {
                MsgHandler::send_interface_event(
                    "stun peer disconnect".to_string(),
                    public_key.to_base58(),
                );
            }
            InterfaceEvent::BlockFetchStatus(count) => {
                MsgHandler::send_block_fetch_status_event(count);
            }
            InterfaceEvent::NewChainDetected() => {
                MsgHandler::send_new_chain_detected_event();
            }
        }
    }

    async fn save_wallet(&self, _wallet: &mut Wallet) -> Result<(), Error> {
        MsgHandler::save_wallet();
        // TODO : return error state
        Ok(())
    }

    async fn load_wallet(&self, _wallet: &mut Wallet) -> Result<(), Error> {
        MsgHandler::load_wallet();
        // TODO : return error state
        Ok(())
    }

    // async fn save_blockchain(&self) -> Result<(), Error> {
    //     MsgHandler::save_blockchain();
    //     // TODO : return error state
    //     Ok(())
    // }
    //
    // async fn load_blockchain(&self) -> Result<(), Error> {
    //     MsgHandler::load_blockchain();
    //     // TODO : return error state
    //     Ok(())
    // }

    fn get_my_services(&self) -> Vec<PeerService> {
        let mut result: WasmPeerServiceList = MsgHandler::get_my_services();
        result
            .services
            .drain(..)
            .map(|s: WasmPeerService| s.service)
            .collect()
    }
}

impl Debug for WasmIoHandler {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RustIoHandler")
            // .field("handler_id", &self.handler_id)
            .finish()
    }
}

#[wasm_bindgen(module = "/js/msg_handler.js")]
extern "C" {
    pub type MsgHandler;

    #[wasm_bindgen(static_method_of = MsgHandler)]
    fn send_message_by_peer_id(peer_id: u64, buffer: &js_sys::Uint8Array);

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
    pub fn save_blockchain();
    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn load_blockchain();

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn get_my_services() -> WasmPeerServiceList;

    #[wasm_bindgen(static_method_of = MsgHandler)]
    pub fn send_new_version_alert(version: String, public_key: String);
}
