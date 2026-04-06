use js_sys::JsString;
use saito_core::core::defs::PrintForLog;
use saito_core::core::msg::message::Message;
use saito_core::core::routing::peers::peerv2::PeerV2;
use wasm_bindgen::prelude::wasm_bindgen;

use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_PEER_ID: AtomicU64 = AtomicU64::new(1);
fn generate_peer_id() -> u64 {
    NEXT_PEER_ID.fetch_add(1, Ordering::Relaxed)
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmNetworkPeer {
    peer: PeerV2,
}

#[wasm_bindgen]
impl WasmNetworkPeer {
    pub fn get_public_key(&self) -> JsString {
        if self.peer.public_key.is_none() {
            return "".into();
        }
        self.peer.public_key.unwrap().to_base58().into()
    }
    pub fn get_url(&self) -> JsString {
        if self.peer.url.is_none() {
            return "".into();
        }
        self.peer.url.as_ref().unwrap().clone().into()
    }

    #[wasm_bindgen(constructor)]
    pub fn new_peer(url: Option<String>) -> WasmNetworkPeer {
        let mut peer = PeerV2::new(generate_peer_id());
        peer.url = None;
        Self { peer }
    }
    pub async fn get_handshake_challenge_buffer(&mut self) -> js_sys::Uint8Array {
        let challenge = self.peer.get_handshake_challenge_buffer().await;
        let buffer = Message::HandshakeChallenge(challenge).serialize();
        js_sys::Uint8Array::from(buffer.as_slice())
    }
}

impl WasmNetworkPeer {
    pub fn new(peer: PeerV2) -> WasmNetworkPeer {
        Self { peer }
    }
    pub fn get_peer(&self) -> &PeerV2 {
        &self.peer
    }
    pub fn get_peer_mut(&mut self) -> &mut PeerV2 {
        &mut self.peer
    }
}
