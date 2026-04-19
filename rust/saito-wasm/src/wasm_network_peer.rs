use js_sys::JsString;
use saito_core::core::defs::PrintForLog;
use wasm_bindgen::prelude::wasm_bindgen;

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
}

impl WasmNetworkPeer {
    pub fn new(peer_id: u64) -> WasmNetworkPeer {
        Self { peer_id }
    }
}
