use js_sys::{Array, JsString, Uint8Array};
use log::error;
use num_traits::FromPrimitive;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use saito_core::core::consensus::block::{Block, BlockType};
use saito_core::core::defs::{Currency, PrintForLog, SaitoPublicKey, Timestamp};

use crate::saitowasm::{string_to_hex, string_to_key};
use crate::wasm_transaction::WasmTransaction;

#[wasm_bindgen]
pub struct WasmBlock {
    block: Block,
}

#[wasm_bindgen]
impl WasmBlock {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmBlock {
        WasmBlock {
            block: Block::new(),
        }
    }
    #[wasm_bindgen(getter = transactions)]
    pub fn get_transactions(&self) -> Array {
        let mut txs: Vec<WasmTransaction> = self
            .block
            .transactions
            .iter()
            .map(|tx| WasmTransaction::from_transaction(tx.clone()))
            .collect();
        let array = js_sys::Array::new_with_length(txs.len() as u32);
        for (i, tx) in txs.drain(..).enumerate() {
            array.set(i as u32, JsValue::from(tx));
        }
        array
    }

    #[wasm_bindgen(getter = avg_fee_per_byte)]
    pub fn avg_fee_per_byte(&self) -> u64 {
        self.block.avg_fee_per_byte
    }

    #[wasm_bindgen(getter = burnfee)]
    pub fn burnfee(&self) -> u64 {
        self.block.burnfee
    }

    #[wasm_bindgen(getter = total_fees)]
    pub fn total_fees(&self) -> u64 {
        self.block.total_fees
    }

    #[wasm_bindgen(getter = total_fees_cumulative)]
    pub fn total_fees_cumulative(&self) -> u64 {
        self.block.total_fees_cumulative
    }

    #[wasm_bindgen(getter = difficulty)]
    pub fn difficulty(&self) -> u64 {
        self.block.difficulty
    }

    #[wasm_bindgen(getter = total_rebroadcast_slips)]
    pub fn total_rebroadcast_slips(&self) -> u64 {
        self.block.total_rebroadcast_slips
    }

    #[wasm_bindgen(getter = total_rebroadcast_nolan)]
    pub fn total_rebroadcast_nolan(&self) -> u64 {
        self.block.total_rebroadcast_nolan
    }

    #[wasm_bindgen(getter =  avg_nolan_rebroadcast_per_block)]
    pub fn avg_nolan_rebroadcast_per_block(&self) -> u64 {
        self.block.avg_nolan_rebroadcast_per_block
    }

    #[wasm_bindgen(getter = rebroadcast_hash)]
    pub fn rebroadcast_hash(&self) -> JsString {
        // Convert the byte array to a JsValue
        // JsValue::from_serde(&self.block.rebroadcast_hash).unwrap()
        self.block.rebroadcast_hash.to_hex().into()
    }

    // TODO -- deprecated
    #[wasm_bindgen(getter = avg_income)]
    pub fn avg_income(&self) -> u64 {
        self.block.avg_total_fees
    }

    #[wasm_bindgen(getter = avg_total_fees)]
    pub fn avg_total_fees(&self) -> u64 {
        self.block.avg_total_fees
    }

    #[wasm_bindgen(getter = id)]
    pub fn get_id(&self) -> u64 {
        self.block.id
    }
    #[wasm_bindgen(setter = id)]
    pub fn set_id(&mut self, id: u64) {
        self.block.id = id;
    }
    #[wasm_bindgen(getter = timestamp)]
    pub fn get_timestamp(&self) -> Timestamp {
        self.block.timestamp
    }
    #[wasm_bindgen(setter = timestamp)]
    pub fn set_timestamp(&mut self, timestamp: Timestamp) {
        self.block.timestamp = timestamp;
    }
    #[wasm_bindgen(getter = previous_block_hash)]
    pub fn get_previous_block_hash(&self) -> JsString {
        self.block.previous_block_hash.to_hex().into()
    }
    #[wasm_bindgen(setter = previous_block_hash)]
    pub fn set_previous_block_hash(&mut self, hash: JsString) {
        self.block.previous_block_hash = string_to_hex(hash).unwrap();
    }
    #[wasm_bindgen(setter = creator)]
    pub fn set_creator(&mut self, key: JsString) {
        self.block.creator = string_to_key(key).unwrap();
    }
    #[wasm_bindgen(getter = creator)]
    pub fn get_creator(&self) -> JsString {
        self.block.creator.to_base58().into()
    }
    #[wasm_bindgen(getter = type)]
    pub fn get_type(&self) -> u8 {
        self.block.block_type as u8
    }
    #[wasm_bindgen(setter = type)]
    pub fn set_type(&mut self, t: u8) {
        self.block.block_type = BlockType::from_u8(t).unwrap();
    }
    #[wasm_bindgen(getter = hash)]
    pub fn get_hash(&self) -> JsString {
        self.block.hash.to_hex().into()
    }

    #[wasm_bindgen(getter = in_longest_chain)]
    pub fn in_longest_chain(&self) -> bool {
        self.block.in_longest_chain
    }

    #[wasm_bindgen(getter = force_loaded)]
    pub fn force_loaded(&self) -> bool {
        self.block.force_loaded
    }

    #[wasm_bindgen(getter = file_name)]
    pub fn get_file_name(&self) -> JsString {
        self.block.get_file_name().into()
    }

    pub fn serialize(&self) -> Uint8Array {
        let buffer = self.block.serialize_for_net(BlockType::Full);
        let buf = Uint8Array::new_with_length(buffer.len() as u32);
        buf.copy_from(buffer.as_slice());
        buf
    }
    pub fn deserialize(&mut self, buffer: Uint8Array) -> Result<JsValue, JsValue> {
        let buffer = buffer.to_vec();
        let mut block = Block::deserialize_from_net(&buffer).or(Err(JsValue::from("failed")))?;

        block.generate().or(Err(JsValue::from("failed")))?;
        self.block = block;

        Ok(JsValue::from(""))
    }
    pub fn has_keylist_txs(&self, keylist: Array) -> bool {
        let keylist = Self::convert_keylist(keylist);
        self.block.has_keylist_txs(&keylist)
    }
    pub fn generate_lite_block(&self, keylist: Array) -> WasmBlock {
        let keylist = Self::convert_keylist(keylist);
        let block = self.block.generate_lite_block(keylist);
        WasmBlock::from_block(block)
    }

    #[wasm_bindgen(getter)]
    pub fn treasury(&self) -> Currency {
        self.block.treasury
    }
    #[wasm_bindgen(getter)]
    pub fn graveyard(&self) -> Currency {
        self.block.graveyard
    }

    #[wasm_bindgen(getter = total_fees_new)]
    pub fn total_fees_new(&self) -> Currency {
        self.block.total_fees_new
    }

    #[wasm_bindgen(getter = total_fees_atr)]
    pub fn total_fees_atr(&self) -> Currency {
        self.block.total_fees_atr
    }

    #[wasm_bindgen(getter = avg_total_fees_new)]
    pub fn avg_total_fees_new(&self) -> Currency {
        self.block.avg_total_fees_new
    }

    #[wasm_bindgen(getter = avg_total_fees_atr)]
    pub fn avg_total_fees_atr(&self) -> Currency {
        self.block.avg_total_fees_atr
    }

    #[wasm_bindgen(getter = total_payout_routing)]
    pub fn total_payout_routing(&self) -> Currency {
        self.block.total_payout_routing
    }

    #[wasm_bindgen(getter = total_payout_mining)]
    pub fn total_payout_mining(&self) -> Currency {
        self.block.total_payout_mining
    }

    #[wasm_bindgen(getter = total_payout_treasury)]
    pub fn total_payout_treasury(&self) -> Currency {
        self.block.total_payout_treasury
    }

    #[wasm_bindgen(getter = total_payout_graveyard)]
    pub fn total_payout_graveyard(&self) -> Currency {
        self.block.total_payout_graveyard
    }

    #[wasm_bindgen(getter = avg_payout_routing)]
    pub fn avg_payout_routing(&self) -> Currency {
        self.block.avg_payout_routing
    }

    #[wasm_bindgen(getter = avg_payout_treasury)]
    pub fn avg_payout_treasury(&self) -> Currency {
        self.block.avg_payout_treasury
    }

    #[wasm_bindgen(getter = avg_payout_graveyard)]
    pub fn avg_payout_graveyard(&self) -> Currency {
        self.block.avg_payout_graveyard
    }

    #[wasm_bindgen(getter = avg_payout_atr)]
    pub fn avg_payout_atr(&self) -> Currency {
        self.block.avg_payout_atr
    }

    #[wasm_bindgen(getter = fee_per_byte)]
    pub fn fee_per_byte(&self) -> Currency {
        self.block.fee_per_byte
    }

    #[wasm_bindgen(getter = previous_block_unpaid)]
    pub fn previous_block_unpaid(&self) -> Currency {
        self.block.previous_block_unpaid
    }

    #[wasm_bindgen(getter = total_work)]
    pub fn total_work(&self) -> Currency {
        self.block.total_work
    }

    #[wasm_bindgen(getter = has_golden_ticket)]
    pub fn has_golden_ticket(&self) -> bool {
        self.block.has_golden_ticket
    }

    #[wasm_bindgen(getter = has_issuance_transaction)]
    pub fn has_issuance_transaction(&self) -> bool {
        self.block.has_issuance_transaction
    }

    #[wasm_bindgen(getter = issuance_transaction_index)]
    pub fn issuance_transaction_index(&self) -> u64 {
        self.block.issuance_transaction_index
    }

    #[wasm_bindgen(getter = has_fee_transaction)]
    pub fn has_fee_transaction(&self) -> bool {
        self.block.has_fee_transaction
    }

    #[wasm_bindgen(getter = has_staking_transaction)]
    pub fn has_staking_transaction(&self) -> bool {
        self.block.has_staking_transaction
    }

    #[wasm_bindgen(getter = golden_ticket_index)]
    pub fn golden_ticket_index(&self) -> u64 {
        self.block.golden_ticket_index
    }

    #[wasm_bindgen(getter = fee_transaction_index)]
    pub fn fee_transaction_index(&self) -> u64 {
        self.block.fee_transaction_index
    }

    #[wasm_bindgen(getter = total_payout_atr)]
    pub fn total_payout_atr(&self) -> u64 {
        self.block.total_payout_atr
    }

    #[wasm_bindgen(getter = avg_payout_mining)]
    pub fn avg_payout_mining(&self) -> u64 {
        self.block.avg_payout_mining
    }
}

impl WasmBlock {
    pub fn from_block(block: Block) -> WasmBlock {
        WasmBlock { block }
    }

    pub fn convert_keylist(keylist: Array) -> Vec<SaitoPublicKey> {
        let mut keys = vec![];
        for i in 0..(keylist.length() as u32) {
            // TODO : check data types/lengths before this to avoid attacks
            let key = keylist.get(i).as_string();
            if key.is_none() {
                // error!("couldn't convert value : {:?} to string", keylist.get(i));
                return vec![];
                // continue;
            }
            let key = key.unwrap();
            let key = SaitoPublicKey::from_base58(key.as_str());

            if key.is_err() {
                error!("key : {:?}", keylist.get(i));
                error!("error decoding key list : {:?}", key.err().unwrap());
                return vec![];
            }
            keys.push(key.unwrap());
        }
        keys
    }
}
