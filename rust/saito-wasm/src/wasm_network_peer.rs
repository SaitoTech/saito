use js_sys::JsString;
use log::info;
use saito_core::core::defs::PrintForLog;
use saito_core::core::network::msg::message::Message;
use wasm_bindgen::prelude::wasm_bindgen;

use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_PEER_ID: AtomicU64 = AtomicU64::new(1);
fn generate_peer_id() -> u64 {
    NEXT_PEER_ID.fetch_add(1, Ordering::Relaxed)
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmNetworkPeer {
    peer_id: u64,
}

#[wasm_bindgen]
impl WasmNetworkPeer {
    pub fn get_id(&self) -> u64 {
        self.peer_id
    }

    pub async fn get_public_key(&self) -> JsString {
        let mut saito = crate::saitowasm::SAITO.lock().await;
        let saito = saito.as_mut().unwrap();

        let peers = saito.routing_thread.network.peer_lock.read().await;

        let Some(peer) = peers.get_peer_by_id(self.peer_id) else {
            return "".into();
        };

        match peer.public_key {
            Some(pk) => pk.to_base58().into(),
            None => "".into(),
        }
    }
    pub async fn get_url(&self) -> JsString {
        let mut saito = crate::saitowasm::SAITO.lock().await;
        let saito = saito.as_mut().unwrap();

        let peers = saito.routing_thread.network.peer_lock.read().await;

        let Some(peer) = peers.get_peer_by_id(self.peer_id) else {
            return "".into();
        };

        match &peer.url {
            Some(url) => url.clone().into(),
            None => "".into(),
        }
    }

    #[wasm_bindgen(constructor)]
    pub fn new_peer(peer_id: u64) -> WasmNetworkPeer {
        Self { peer_id }
    }

    pub async fn get_handshake_challenge_buffer(&mut self) -> js_sys::Uint8Array {
        let mut saito = crate::saitowasm::SAITO.lock().await;
        let saito = saito.as_mut().unwrap();

        let mut peers = saito.routing_thread.network.peer_lock.write().await;

        let Some(peer) = peers.get_peer_by_id_mut(self.peer_id) else {
            return js_sys::Uint8Array::new_with_length(0);
        };

        peer.handshake_nonce = Some(saito_core::core::util::crypto::hash(
            &saito_core::core::util::crypto::generate_random_bytes(32).await,
        ));

        info!(
            "[SAITO STEP 6] wasm get_handshake_challenge_buffer building RequestHandshake peer_id={}",
            self.peer_id
        );
        let buffer = Message::RequestHandshake(
            saito_core::core::network::msg::handshake::RequestHandshake {
                nonce: peer.handshake_nonce.unwrap(),
            },
        )
        .serialize();

        js_sys::Uint8Array::from(buffer.as_slice())
    }
}

impl WasmNetworkPeer {
    pub fn new(peer_id: u64) -> WasmNetworkPeer {
        Self { peer_id }
    }
}
