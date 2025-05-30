use std::ops::Deref;
use std::sync::Arc;

use js_sys::{Array, JsString};
use log::{debug, error, warn};
use num_traits::FromPrimitive;
use tokio::sync::RwLock;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use saito_core::core::consensus::slip::{Slip, SlipType};
use saito_core::core::consensus::wallet::{Wallet, WalletSlip};
use saito_core::core::defs::{
    Currency, PrintForLog, SaitoPrivateKey, SaitoPublicKey, SaitoSignature, SaitoUTXOSetKey,
};
use saito_core::core::io::network::Network;
use saito_core::core::io::storage::Storage;

use crate::saitowasm::{string_array_to_base58_keys, string_to_hex, SAITO};
use crate::wasm_io_handler::WasmIoHandler;
use crate::wasm_transaction::WasmTransaction;

use hex;
use std::convert::TryInto;

/// Parse a hex string into a fixed-size UTXO set key
fn string_to_utxoset_key(s: &str) -> Result<SaitoUTXOSetKey, String> {
    let bytes = hex::decode(s).map_err(|e| format!("hex decode error: {}", e))?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| "invalid utxoset key length".into())
}

/// Parse a hex string into a 64-byte signature
fn string_to_signature(s: &str) -> Result<SaitoSignature, String> {
    let bytes = hex::decode(s).map_err(|e| format!("hex decode error: {}", e))?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| "invalid signature length".into())
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmWallet {
    pub(crate) wallet: Arc<RwLock<Wallet>>,
    pub(crate) network: Arc<Network>,
}

#[wasm_bindgen]
pub struct WasmWalletSlip {
    slip: WalletSlip,
}

#[wasm_bindgen]
impl WasmWallet {
    pub async fn save(&self) {
        let mut wallet = self.wallet.write().await;
        Wallet::save(&mut wallet, &(WasmIoHandler {})).await;
    }
    pub async fn reset(&mut self, keep_keys: bool) {
        self.wallet
            .write()
            .await
            .reset(
                &mut Storage::new(Box::new(WasmIoHandler {})),
                None,
                keep_keys,
            )
            .await;
    }

    pub async fn load(&mut self) {
        let mut wallet = self.wallet.write().await;
        Wallet::load(&mut wallet, &(WasmIoHandler {})).await;
    }

    pub async fn get_public_key(&self) -> JsString {
        let wallet = self.wallet.read().await;
        JsString::from(wallet.public_key.to_base58())
    }
    pub async fn set_public_key(&mut self, key: JsString) {
        let str: String = key.into();
        // if str.len() != 66 {
        //     error!(
        //         "invalid length : {:?} for public key string. expected 66",
        //         str.len()
        //     );
        //     return;
        // }
        let key = SaitoPublicKey::from_base58(str.as_str());
        if key.is_err() {
            error!("{:?}", key.err().unwrap());
            return;
        }
        let key = key.unwrap();
        // let key: SaitoPublicKey = key.try_into().unwrap();
        let mut wallet = self.wallet.write().await;
        wallet.public_key = key;
    }
    pub async fn get_private_key(&self) -> JsString {
        let wallet = self.wallet.read().await;
        JsString::from(wallet.private_key.to_hex())
    }
    pub async fn set_private_key(&mut self, key: JsString) {
        let str: String = key.into();
        if str.len() != 64 {
            error!(
                "invalid length : {:?} for public key string. expected 64",
                str.len()
            );
            return;
        }
        let key = hex::decode(str);
        if key.is_err() {
            error!("{:?}", key.err().unwrap());
            return;
        }
        let key = key.unwrap();
        let key: SaitoPrivateKey = key.try_into().unwrap();
        let mut wallet = self.wallet.write().await;
        wallet.private_key = key;
    }
    pub async fn get_balance(&self) -> Currency {
        let wallet = self.wallet.read().await;
        // info!("get balance : {:?}", wallet.get_available_balance());
        wallet.get_available_balance()
    }
    pub async fn get_pending_txs(&self) -> js_sys::Array {
        let wallet = self.wallet.read().await;
        let array = js_sys::Array::new_with_length(wallet.pending_txs.len() as u32);
        for (i, tx) in wallet.pending_txs.values().enumerate() {
            let t = WasmTransaction::from_transaction(tx.clone());
            array.set(i as u32, JsValue::from(t));
        }
        array
    }
    pub async fn get_slips(&self) -> js_sys::Array {
        let wallet = self.wallet.read().await;
        let slips = &wallet.slips;
        debug!("get slips. count : {:?}", slips.len());

        let array = js_sys::Array::new_with_length(slips.len() as u32);

        for (index, (_key, slip)) in slips.iter().enumerate() {
            array.set(
                index as u32,
                JsValue::from(WasmWalletSlip::new(slip.clone())),
            );
        }
        array
    }
    pub async fn add_slip(&mut self, slip: WasmWalletSlip) {
        let wallet_slip = slip.slip;
        let mut wallet = self.wallet.write().await;
        let slip = Slip::parse_slip_from_utxokey(&wallet_slip.utxokey).unwrap();
        wallet.add_slip(
            slip.block_id,
            slip.tx_ordinal,
            &slip,
            wallet_slip.lc,
            Some(self.network.deref()),
        );
    }

    pub async fn add_to_pending(&mut self, tx: &WasmTransaction) {
        let mut wallet = self.wallet.write().await;
        let mut tx = tx.clone().tx;
        tx.generate(&wallet.public_key, 0, 0);
        wallet.add_to_pending(tx);
    }

    pub async fn get_key_list(&self) -> Array {
        let wallet = self.wallet.read().await;
        let array = Array::new_with_length(wallet.key_list.len() as u32);
        for (i, key) in wallet.key_list.iter().enumerate() {
            array.set(i as u32, JsValue::from(key.to_base58()));
        }
        array
    }
    pub async fn set_key_list(&self, key_list: js_sys::Array) {
        let key_list: Vec<SaitoPublicKey> = string_array_to_base58_keys(key_list);

        let mut saito = SAITO.lock().await;
        saito
            .as_mut()
            .unwrap()
            .routing_thread
            .set_my_key_list(key_list)
            .await;
    }

    #[wasm_bindgen]
    pub async fn add_nft(
        &self,
        slip1_hex: String,
        slip2_hex: String,
        slip3_hex: String,
        id_hex: String,
        sig_hex: String,
    ) -> Result<(), JsValue> {
        let saito = SAITO.lock().await;
        let mut wallet = saito.as_ref().unwrap().context.wallet_lock.write().await;

        info!("inside wasm_wallet.rs add_nft");

        let slip1: SaitoUTXOSetKey = string_to_utxoset_key(&slip1_hex)
            .map_err(|e| JsValue::from_str(&format!("slip1 parse error: {}", e)))?;
        let slip2: SaitoUTXOSetKey = string_to_utxoset_key(&slip2_hex)
            .map_err(|e| JsValue::from_str(&format!("slip2 parse error: {}", e)))?;
        let slip3: SaitoUTXOSetKey = string_to_utxoset_key(&slip3_hex)
            .map_err(|e| JsValue::from_str(&format!("slip3 parse error: {}", e)))?;

        let id: Vec<u8> = hex::decode(&id_hex)
            .map_err(|e| JsValue::from_str(&format!("id hex decode error: {}", e)))?;
        let tx_sig: SaitoSignature = string_to_signature(&sig_hex)
            .map_err(|e| JsValue::from_str(&format!("signature parse error: {}", e)))?;

        wallet.add_nft(slip1, slip2, slip3, id, tx_sig);

        Ok(())
    }
}

impl WasmWallet {
    pub fn new_from(wallet: Arc<RwLock<Wallet>>, network: Network) -> WasmWallet {
        WasmWallet {
            wallet,
            network: Arc::new(network),
        }
    }
}

impl WasmWalletSlip {
    pub fn new(slip: WalletSlip) -> WasmWalletSlip {
        WasmWalletSlip { slip }
    }
}

#[wasm_bindgen]
impl WasmWalletSlip {
    pub fn get_utxokey(&self) -> js_sys::JsString {
        let key: String = self.slip.utxokey.to_hex();
        key.into()
    }
    pub fn set_utxokey(&mut self, key: js_sys::JsString) {
        if let Ok(key) = string_to_hex(key) {
            self.slip.utxokey = key;
        } else {
            warn!("failed parsing utxo key");
        }
    }
    pub fn get_amount(&self) -> Currency {
        self.slip.amount
    }
    pub fn set_amount(&mut self, amount: Currency) {
        self.slip.amount = amount;
    }
    pub fn get_block_id(&self) -> u64 {
        self.slip.block_id
    }
    pub fn set_block_id(&mut self, block_id: u64) {
        self.slip.block_id = block_id;
    }
    pub fn get_tx_ordinal(&self) -> u64 {
        self.slip.tx_ordinal
    }

    pub fn set_tx_ordinal(&mut self, ordinal: u64) {
        self.slip.tx_ordinal = ordinal;
    }

    pub fn get_slip_index(&self) -> u8 {
        self.slip.slip_index
    }

    pub fn set_slip_index(&mut self, index: u8) {
        self.slip.slip_index = index;
    }
    pub fn is_spent(&self) -> bool {
        self.slip.spent
    }
    pub fn set_spent(&mut self, spent: bool) {
        self.slip.spent = spent;
    }
    pub fn is_lc(&self) -> bool {
        self.slip.lc
    }
    pub fn set_lc(&mut self, lc: bool) {
        self.slip.lc = lc;
    }
    pub fn get_slip_type(&self) -> u8 {
        self.slip.slip_type as u8
    }
    pub fn set_slip_type(&mut self, slip_type: u8) {
        self.slip.slip_type = SlipType::from_u8(slip_type).unwrap_or(self.slip.slip_type);
    }
    #[wasm_bindgen(constructor)]
    pub fn new_() -> WasmWalletSlip {
        WasmWalletSlip {
            slip: WalletSlip::new(),
        }
    }
}
