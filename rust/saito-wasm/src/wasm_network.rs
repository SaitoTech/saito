use wasm_bindgen::prelude::*;
use js_sys::{Array, JsString};
use wasm_bindgen::JsValue;

use crate::wasm_network_api::WasmNetworkApi;
use crate::wasm_peer::WasmPeer;
use crate::saitowasm::{SAITO, string_to_key};

use saito_core::core::defs::SaitoPublicKey;
use log::warn;

#[wasm_bindgen]
pub struct WasmNetwork;

#[wasm_bindgen]
impl WasmNetwork {

    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmNetwork {
        WasmNetwork {}
    }

    #[wasm_bindgen(getter)]
    pub fn api(&self) -> WasmNetworkApi {
        WasmNetworkApi {}
    }

    // -------------------------
    // getPeers (EXACT COPY)
    // -------------------------
    #[wasm_bindgen(js_name = getPeers)]
    pub async fn get_peers(&self) -> Array {
        let saito = SAITO.lock().await;

        let peers = saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .peer_lock
            .read()
            .await;

let connected_peers: Vec<_> = peers
    .peers
    .values()
    .filter(|peer| peer.is_connected())
    .cloned()
    .collect();

let array = Array::new_with_length(connected_peers.len() as u32);

for (index, peer) in connected_peers.into_iter().enumerate() {
    array.set(index as u32, JsValue::from(WasmPeer::new_from_peer(peer)));
}

        array
    }

    // -------------------------
    // getPeer (EXACT COPY)
    // -------------------------
    #[wasm_bindgen(js_name = getPeer)]
    pub async fn get_peer(&self, key: JsString) -> Option<WasmPeer> {
        let key: SaitoPublicKey = string_to_key(key).ok()?;

        let saito = SAITO.lock().await;

        let peers = saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .peer_lock
            .read()
            .await;

        let peer = peers.peers.get(&key);

        if peer.is_none() {
            warn!("peer not found");
            return None;
        }

        let peer = peer.cloned().unwrap();

        Some(WasmPeer::new_from_peer(peer))
    }
}


