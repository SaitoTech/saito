use std::fmt::{Debug, Formatter};
use std::io::Error;

use async_trait::async_trait;
use log::{error, trace};

use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::defs::{BlockId, PrintForLog, SaitoHash, SaitoPublicKey};
use saito_core::core::routing::io::interface_io::{InterfaceEvent, InterfaceIO};
use saito_core::core::routing::peers::peer_service::PeerService;

use crate::wasm_host_bridge::current_host_bridge;

pub struct WasmIoHandler {}

#[async_trait]
impl InterfaceIO for WasmIoHandler {
    async fn send_message(&self, public_key: SaitoPublicKey, buffer: &[u8]) -> Result<(), Error> {
        trace!("WasmIoHandler::send_message : {:?}", public_key.to_base58());
        current_host_bridge().send_message(public_key.to_base58(), buffer)
    }

    async fn send_message_to_all(
        &self,
        buffer: &[u8],
        peer_exceptions: Vec<SaitoPublicKey>,
    ) -> Result<(), Error> {
        current_host_bridge().send_message_to_all(
            buffer,
            peer_exceptions
                .into_iter()
                .map(|exception| exception.to_base58())
                .collect(),
        )
    }

    async fn connect_to_peer(&mut self, url: String) -> Result<(), Error> {
        trace!("connect_to_peer with url : {:?}", url);
        current_host_bridge().connect_to_peer(url)
    }

    async fn disconnect_from_peer(&self, public_key: SaitoPublicKey) -> Result<(), Error> {
        trace!("disconnect from peer : {:?}", public_key.to_base58());
        current_host_bridge().disconnect_from_peer(public_key.to_base58())
    }

    async fn fetch_block_from_peer(
        &self,
        block_hash: SaitoHash,
        public_key: SaitoPublicKey,
        url: &str,
        block_id: BlockId,
    ) -> Result<(), Error> {
        let result = current_host_bridge().fetch_block_from_peer(
            block_hash,
            public_key.to_base58(),
            url,
            block_id,
        );
        if result.is_err() {
            error!(
                "failed fetching block : {:?} from peer",
                block_hash.to_hex()
            );
        }
        result
    }

    async fn write_value(&self, key: &str, value: &[u8]) -> Result<(), Error> {
        current_host_bridge().write_value(key, value)
    }

    async fn append_value(&mut self, key: &str, value: &[u8]) -> Result<(), Error> {
        current_host_bridge().append_value(key, value)
    }

    async fn flush_data(&mut self, key: &str) -> Result<(), Error> {
        current_host_bridge().flush_data(key)
    }

    async fn read_value(&self, key: &str) -> Result<Vec<u8>, Error> {
        current_host_bridge().read_value(key)
    }

    async fn load_block_file_list(&self) -> Result<Vec<String>, Error> {
        current_host_bridge().load_block_file_list()
    }

    async fn is_existing_file(&self, key: &str) -> bool {
        current_host_bridge().is_existing_file(key)
    }

    async fn remove_value(&self, key: &str) -> Result<(), Error> {
        current_host_bridge().remove_value(key)
    }

    fn get_block_dir(&self) -> String {
        "data/blocks/".to_string()
    }
    fn get_checkpoint_dir(&self) -> String {
        "data/checkpoints/".to_string()
    }

    fn ensure_directory_exists(&self, block_dir_path: &str) -> Result<(), std::io::Error> {
        current_host_bridge().ensure_directory_exists(block_dir_path)
    }

    async fn process_api_call(&self, buffer: Vec<u8>, msg_index: u32, public_key: SaitoPublicKey) {
        current_host_bridge().process_api_call(buffer, msg_index, public_key.to_base58());
    }

    async fn process_api_success(
        &self,
        buffer: Vec<u8>,
        msg_index: u32,
        public_key: SaitoPublicKey,
    ) {
        current_host_bridge().process_api_success(buffer, msg_index, public_key.to_base58());
    }

    async fn process_api_error(&self, buffer: Vec<u8>, msg_index: u32, public_key: SaitoPublicKey) {
        current_host_bridge().process_api_error(buffer, msg_index, public_key.to_base58());
    }

    fn send_interface_event(&self, event: InterfaceEvent) {
        match event {
            InterfaceEvent::PeerHandshakeComplete(public_key) => {
                current_host_bridge()
                    .send_interface_event("handshake_complete", public_key.to_base58());
            }
            InterfaceEvent::PeerConnectionDropped(public_key) => {
                current_host_bridge()
                    .send_interface_event("peer_disconnect", public_key.to_base58());
            }
            InterfaceEvent::PeerConnected(public_key) => {
                current_host_bridge().send_interface_event("peer_connect", public_key.to_base58());
            }
            InterfaceEvent::BlockAddSuccess(hash, block_id) => {
                current_host_bridge().send_block_success(hash.to_hex(), block_id);
            }
            InterfaceEvent::WalletUpdate() => {
                current_host_bridge().send_wallet_update();
            }
            InterfaceEvent::NewVersionDetected(index, version) => {
                current_host_bridge().send_new_version_alert(
                    format!(
                        "{:?}.{:?}.{:?}",
                        version.major, version.minor, version.patch
                    )
                    .to_string(),
                    index.to_base58(),
                );
            }

            InterfaceEvent::StunPeerConnected(public_key) => {
                current_host_bridge()
                    .send_interface_event("stun peer connect", public_key.to_base58());
            }
            InterfaceEvent::StunPeerDisconnected(public_key) => {
                current_host_bridge()
                    .send_interface_event("stun peer disconnect", public_key.to_base58());
            }
            InterfaceEvent::BlockFetchStatus(count) => {
                current_host_bridge().send_block_fetch_status_event(count);
            }
            InterfaceEvent::NewChainDetected() => {
                current_host_bridge().send_new_chain_detected_event();
            }
        }
    }

    async fn save_wallet(&self, _wallet: &mut Wallet) -> Result<(), Error> {
        current_host_bridge().save_wallet();
        Ok(())
    }

    async fn load_wallet(&self, _wallet: &mut Wallet) -> Result<(), Error> {
        current_host_bridge().load_wallet();
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
        current_host_bridge().get_my_services()
    }
}

impl Debug for WasmIoHandler {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RustIoHandler")
            // .field("handler_id", &self.handler_id)
            .finish()
    }
}
