use std::sync::Arc;

use js_sys::{BigUint64Array, Function, JsString};
use log::info;
use std::cell::RefCell;
use tokio::sync::RwLock;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use crate::saitowasm::{string_to_key, SAITO};
use saito_core::core::consensus::blockchain::{Blockchain, BlockchainObserver};
use saito_core::core::defs::{
    BlockHash, BlockId, PrintForLog, SaitoHash, SaitoUTXOSetKey, UTXO_KEY_LENGTH,
};

struct JsBlockchainObserver;

thread_local! {
    static REORG_FN: RefCell<Option<Function>> = RefCell::new(None);
    static ADD_BLOCK_FN: RefCell<Option<Function>> = RefCell::new(None);
    static CONFIRM_FN: RefCell<Option<Function>> = RefCell::new(None);
}

impl BlockchainObserver for JsBlockchainObserver {
    fn on_chain_reorg(&self, block_id: BlockId, block_hash: &BlockHash, longest_chain: bool) {
        let hash = block_hash.to_hex();
        REORG_FN.with(|cell| {
            if let Some(f) = cell.borrow().as_ref() {
                let _ = f.call3(
                    &JsValue::NULL,
                    &JsValue::from(block_id),
                    &JsValue::from(hash),
                    &JsValue::from(longest_chain),
                );
            }
        });
    }

    fn on_add_block_success(&self, block_id: BlockId, block_hash: &BlockHash) {
        let hash = block_hash.to_hex();
        ADD_BLOCK_FN.with(|cell| {
            if let Some(f) = cell.borrow().as_ref() {
                let _ = f.call2(
                    &JsValue::NULL,
                    &JsValue::from(block_id),
                    &JsValue::from(hash),
                );
            }
        });
    }
    fn on_block_confirmation(
        &self,
        block_id: BlockId,
        block_hash: &BlockHash,
        confirmations: &[BlockId],
    ) {
        let hash = block_hash.to_hex();
        CONFIRM_FN.with(|cell| {
            if let Some(f) = cell.borrow().as_ref() {
                let confs = BigUint64Array::from(confirmations);
                let _ = f.call3(
                    &JsValue::NULL,
                    &JsValue::from(block_id),
                    &JsValue::from(hash),
                    &confs.into(),
                );
            }
        })
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmBlockchain {
    pub(crate) blockchain_lock: Arc<RwLock<Blockchain>>,
}

#[wasm_bindgen]
impl WasmBlockchain {
    pub async fn reset(&self) {
        {
            let saito = SAITO.lock().await;
            let mut configs = saito
                .as_ref()
                .unwrap()
                .routing_thread
                .config_lock
                .write()
                .await;
            configs.get_blockchain_configs_mut().confirmations.clear();
            configs.set_congestion_data(None);
        }
        let mut blockchain = self.blockchain_lock.write().await;
        blockchain.reset().await;
        blockchain.save().await;
    }

    pub async fn get_last_block_id(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.last_block_id
    }
    pub async fn get_last_timestamp(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.last_timestamp
    }
    pub async fn get_longest_chain_hash_at(&self, id: BlockId) -> JsString {
        let blockchain = self.blockchain_lock.read().await;
        let hash = blockchain
            .blockring
            .get_longest_chain_block_hash_at_block_id(id)
            .unwrap_or([0; 32]);
        hash.to_hex().into()
    }
    pub async fn get_last_block_hash(&self) -> JsString {
        let blockchain = self.blockchain_lock.read().await;
        let hash = blockchain.last_block_hash;
        hash.to_hex().into()
    }
    pub async fn get_last_burnfee(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.last_burnfee
    }
    pub async fn get_genesis_block_id(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.genesis_block_id
    }
    pub async fn get_genesis_timestamp(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.genesis_timestamp
    }
    pub async fn get_lowest_acceptable_timestamp(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.lowest_acceptable_timestamp
    }
    pub async fn get_lowest_acceptable_block_hash(&self) -> JsString {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.lowest_acceptable_block_hash.to_hex().into()
    }
    pub async fn get_lowest_acceptable_block_id(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.lowest_acceptable_block_id
    }
    pub async fn get_latest_block_id(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.get_latest_block_id()
    }

    pub async fn get_fork_id(&self) -> JsString {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.fork_id.unwrap_or([0; 32]).to_hex().into()
    }
    pub async fn set_fork_id(&self, hash: JsString) {
        let mut blockchain = self.blockchain_lock.write().await;
        if let Ok(fork_id) = string_to_key::<SaitoHash>(hash) {
            info!("setting fork id : {:?}", fork_id.to_hex());
            blockchain.set_fork_id(fork_id);
        }
    }

    pub async fn get_longest_chain_hash_at_id(&self, block_id: u64) -> JsString {
        let blockchain = self.blockchain_lock.read().await;
        let hash = blockchain
            .blockring
            .get_longest_chain_block_hash_at_block_id(block_id)
            .unwrap_or([0; 32]);
        hash.to_hex().into()
    }
    pub async fn get_hashes_at_id(&self, block_id: u64) -> js_sys::Array {
        let blockchain = self.blockchain_lock.read().await;
        let hashes = blockchain.blockring.get_block_hashes_at_block_id(block_id);
        let arr = js_sys::Array::new_with_length(hashes.len() as u32);
        for (index, hash) in hashes.iter().enumerate() {
            let str: JsString = hash.to_hex().into();
            arr.set(index as u32, JsValue::from(str));
        }
        arr
    }

    pub async fn set_safe_to_prune_transaction(&self, block_id: u64) {
        let mut blockchain = self.blockchain_lock.write().await;
        return blockchain.set_safe_to_prune_transaction(block_id);
    }

    pub async fn get_prune_after_blocks(&self) -> BlockId {
        self.blockchain_lock.read().await.prune_after_blocks
    }
    pub async fn get_block_confirmation_limit(&self) -> BlockId {
        self.blockchain_lock.read().await.block_confirmation_limit
    }
    pub async fn register_callback(
        &self,
        reorg_cb: js_sys::Function,
        add_block_cb: js_sys::Function,
        confirm_cb: js_sys::Function,
    ) {
        // Store the JS functions in thread-local slots to keep them alive
        REORG_FN.with(|cell| {
            *cell.borrow_mut() = Some(reorg_cb.clone());
        });
        ADD_BLOCK_FN.with(|cell| {
            *cell.borrow_mut() = Some(add_block_cb.clone());
        });
        CONFIRM_FN.with(|cell| {
            *cell.borrow_mut() = Some(confirm_cb.clone());
        });

        // Register a lightweight observer that will call the thread-local functions
        let mut blockchain = self.blockchain_lock.write().await;
        blockchain.register_observer(Box::new(JsBlockchainObserver));
    }

    pub async fn is_slip_spendable(&self, utxokey_hex: JsString) -> bool {
        let hex_str = utxokey_hex.as_string().unwrap_or_default();

        //
        // Decode plain hex string into bytes
        //
        let bytes = match hex::decode(&hex_str) {
            Ok(b) => b,
            Err(e) => {
                log::warn!("is_slip_spendable: failed to decode hex: {:?}", e);
                return false;
            }
        };

        //
        // Check exact UTXO key length
        //
        if bytes.len() != UTXO_KEY_LENGTH {
            log::warn!(
                "is_slip_spendable: invalid utxo key length: {}, expected {}",
                bytes.len(),
                UTXO_KEY_LENGTH
            );
            return false;
        }

        // Convert Vec<u8> [u8; 59]
        let mut key: SaitoUTXOSetKey = [0; UTXO_KEY_LENGTH];
        key.copy_from_slice(&bytes);

        // Call blockchain.is_slip_unlocked
        let blockchain = self.blockchain_lock.read().await;
        blockchain.is_slip_unlocked(&key)
    }
}
