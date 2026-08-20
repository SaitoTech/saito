use std::sync::Arc;

use crate::saitowasm::{string_to_hex, string_to_key, SAITO};
use crate::wasm_block::WasmBlock;
use js_sys::{Array, BigUint64Array, Function, JsString};
use log::{info, warn};
use saito_core::core::consensus::blockchain::{Blockchain, BlockchainObserver};
use saito_core::core::defs::{
    BlockHash, BlockId, PrintForLog, SaitoHash, SaitoUTXOSetKey, UTXO_KEY_LENGTH,
};
use serde::Serialize;
use serde_wasm_bindgen::Serializer;
use std::cell::RefCell;
use tokio::sync::RwLock;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

struct JsBlockchainObserver;

thread_local! {
    static REORG_FN: RefCell<Option<Function>> = RefCell::new(None);
    static ADD_BLOCK_FN: RefCell<Option<Function>> = RefCell::new(None);
    static CONFIRM_FN: RefCell<Option<Function>> = RefCell::new(None);
}

impl BlockchainObserver for JsBlockchainObserver {
    fn on_chain_reorganization(
        &self,
        block_id: BlockId,
        block_hash: &BlockHash,
        longest_chain: bool,
    ) {
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
    pub fn get(&self) -> JsValue {
        let saito = SAITO.blocking_lock();

        let blockchain = saito
            .as_ref()
            .unwrap()
            .routing_thread
            .blockchain_lock
            .blocking_read();

        let serializer = Serializer::new().serialize_large_number_types_as_bigints(true);
        blockchain.serialize(&serializer).unwrap()
    }

    pub async fn get_blocks(&self, count: u32, include_offchain: bool) -> Result<Array, JsValue> {
        let blockchain = self.blockchain_lock.read().await;

        let latest = blockchain.blockring.get_latest_block_id();

        let blocks = Array::new();

        for offset in 0..count {
            if latest < offset as u64 {
                break;
            }

            let block_id = latest - offset as u64;

            if include_offchain {
                let hashes = blockchain.blockring.get_block_hashes_at_block_id(block_id);

                for hash in hashes {
                    if let Some(mem_block) = blockchain.get_block(&hash) {
                        let mut block = mem_block.clone();
                        block.transactions.clear();
                        blocks.push(&JsValue::from(WasmBlock::from_block(block)));
                    }
                }
            } else {
                if let Some(hash) = blockchain
                    .blockring
                    .get_longest_chain_block_hash_at_block_id(block_id)
                {
                    if let Some(mem_block) = blockchain.get_block(&hash) {
                        let mut block = mem_block.clone();
                        block.transactions.clear();
                        blocks.push(&JsValue::from(WasmBlock::from_block(block)));
                    }
                }
            }
        }

        Ok(blocks)
    }

    pub async fn get_block(
        &self,
        block_hash: JsString,
        include_transactions: bool,
    ) -> Result<WasmBlock, JsValue> {
        let block_hash = string_to_hex(block_hash).or(Err(JsValue::from(
            "Failed parsing block hash string to key",
        )))?;

        let blockchain = self.blockchain_lock.read().await;
        let result = blockchain.get_block(&block_hash);
        if result.is_none() {
            warn!("block {:?} not found", block_hash.to_hex());
            return Err(JsValue::from("block not found"));
        }
        let mem_block = result.unwrap();

        //
        // return header-only if requested
        //
        if !include_transactions {
            let mut block = mem_block.clone();
            block.transactions.clear();
            return Ok(WasmBlock::from_block(block));
        }

        //
        // or full block with transactions (if exists)
        //
        if !mem_block.transactions.is_empty() {
            return Ok(WasmBlock::from_block(mem_block.clone()));
        }

        //
        // if we hit here, the user has requested transactions
        // but those do not exist on the block we have access
        // to from the blockchain (likely loaded from the header)
        // so we need to fetch the block from disk if available
        //
        let filepath = {
            let saito = SAITO.lock().await;
            let storage = &saito.as_ref().unwrap().routing_thread.storage;
            storage.generate_block_filepath(mem_block)
        };

        //
        // release blockchain lock before disk I/O.
        //
        drop(blockchain);

        //
        // and fetch from disk
        //
        let saito = SAITO.lock().await;
        let storage = &saito.as_ref().unwrap().routing_thread.storage;

        let mut block = storage
            .load_block_from_disk(filepath.as_str())
            .await
            .map_err(|_| JsValue::from("transactions unavailable"))?;

        block
            .generate()
            .map_err(|_| JsValue::from("failed to generate block"))?;

        Ok(WasmBlock::from_block(block))
    }

    pub async fn get_block_by_id(
        &self,
        block_id: u64,
        include_transactions: bool,
    ) -> Result<WasmBlock, JsValue> {
        let blockchain = self.blockchain_lock.read().await;

        let block_hash = blockchain
            .blockring
            .get_longest_chain_block_hash_at_block_id(block_id)
            .ok_or_else(|| JsValue::from("block not found"))?;

        drop(blockchain);

        self.get_block(block_hash.to_hex().into(), include_transactions)
            .await
    }

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
