use js_sys::JsString;
use saito_core::core::defs::PrintForLog;
use saito_core::core::routing::peers::network_peer::NetworkPeer;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmNetworkPeer {
    peer: NetworkPeer,
}

#[wasm_bindgen]
impl WasmNetworkPeer {
    pub fn get_public_key(&self) -> JsString {
        if self.peer.public_key.is_none() {
            return "".into();
        }
        self.peer.public_key.unwrap().to_base58().into()
    }

    #[wasm_bindgen(constructor)]
    pub fn new_peer() -> WasmNetworkPeer {
        Self {
            peer: NetworkPeer {
                challenge: None,
                response: None,
                public_key: None,
                url: None,
                ip: None,
            },
        }
    }
    pub fn get_handshake_challenge_buffer(&mut self) -> js_sys::Uint8Array {
        let buffer = self.peer.get_handshake_challenge_buffer();
        js_sys::Uint8Array::from(&buffer)
    }
}

impl WasmNetworkPeer {
    pub fn new(peer: NetworkPeer) -> WasmNetworkPeer {
        Self { peer }
    }
    pub fn get_peer(&self) -> &NetworkPeer {
        &self.peer
    }
    pub fn get_peer_mut(&mut self) -> &mut NetworkPeer {
        &mut self.peer
    }
}
