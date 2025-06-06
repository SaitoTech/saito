use saito_core::core::stat_thread::{BlockchainStat, MempoolStat, MiningStat, WalletStat};
use serde::Serialize;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
#[derive(Serialize)]
pub struct WasmStats {
    pub(crate) current_wallet_state: WalletStat,
    pub(crate) current_mining_state: MiningStat,
    pub(crate) current_blockchain_state: BlockchainStat,
    pub(crate) current_mempool_state: MempoolStat,
}
