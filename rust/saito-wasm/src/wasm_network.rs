use wasm_bindgen::prelude::*;
use js_sys::{Array, JsString};
use wasm_bindgen::JsValue;

use crate::wasm_network_api::WasmNetworkApi;
use crate::wasm_peer::WasmPeer;
use crate::saitowasm::{SAITO, string_to_key};
use crate::wasm_transaction::WasmTransaction;

use log::{warn, trace, debug};
use saito_core::core::defs::SaitoPublicKey;
use saito_core::core::consensus_thread::ConsensusEvent;
use saito_core::core::defs::PrintForLog;
use saito_core::core::process::process_event::ProcessEvent;

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


    #[wasm_bindgen(js_name = propagateTransaction)]
    pub async fn propagate_transaction(&self, wtx: WasmTransaction) {
        trace!("propagate_transaction");

        let mut saito = SAITO.lock().await;
        let mut tx = wtx.clone().tx;

        {
            let wallet = saito
                .as_ref()
                .unwrap()
                .routing_thread
                .wallet_lock
                .read()
                .await;

            tx.generate(&wallet.public_key, 0, 0);
        }

        debug!(
            "propagating transaction: {} input: {}, output : {}",
            tx.signature.to_hex(),
            tx.from
                .iter()
                .map(|slip| format!("{}", slip))
                .collect::<Vec<String>>()
                .join(", "),
            tx.to
                .iter()
                .map(|slip| format!("{}", slip))
                .collect::<Vec<String>>()
                .join(", "),
        );
   
        saito
            .as_mut()
            .unwrap()
            .consensus_thread
            .process_event(ConsensusEvent::NewTransaction { transaction: tx })
            .await;


        //crate::saitowasm::process_new_transaction(wtx).await;


    }

}


