use js_sys::JsString;
use saito_core::core::consensus::block::ConsensusValues;
use saito_core::core::consensus::transaction::Transaction;
use saito_core::core::defs::PrintForLog;
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

use crate::wasm_transaction::WasmTransaction;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmConsensusValues {
    pub(crate) cv: ConsensusValues,
}

#[wasm_bindgen]
impl WasmConsensusValues {
    #[wasm_bindgen(getter = it_num)]
    pub fn it_num(&self) -> u8 {
        self.cv.it_num
    }

    // #[wasm_bindgen(getter= fee_transaction)]
    pub fn fee_transaction(&self) -> JsValue {
        if let Some(tx) = &self.cv.fee_transaction {
            let tx = WasmTransaction::from_transaction(tx.clone());
            JsValue::from(tx)
        } else {
            let tx = WasmTransaction {
                tx: Transaction::default(),
            };
            JsValue::from(tx)
        }
    }

    #[wasm_bindgen(getter = it_index)]
    pub fn it_index(&self) -> u32 {
        if let Some(it_index) = self.cv.it_index {
            it_index as u32
        } else {
            0
        }
    }

    // #[wasm_bindgen(getter = block_payout)]
    // pub fn get_block_payout(&self) -> Array {
    //     let mut block_payout: Vec<WasmBlockPayout> = self
    //         .cv
    //         .block_payout
    //         .iter()
    //         .map(|bp| WasmBlockPayout::from_block_payout(bp.clone()))
    //         .collect();
    //     let array = js_sys::Array::new_with_length(block_payout.len() as u32);
    //
    //     for (i, bpo) in block_payout.drain(..).enumerate() {
    //         array.set(i as u32, JsValue::from(bpo));
    //     }
    //     array
    // }

    #[wasm_bindgen(getter = ft_num)]
    pub fn ft_num(&self) -> u8 {
        self.cv.ft_num
    }

    #[wasm_bindgen(getter = ft_index)]
    pub fn ft_index(&self) -> u32 {
        if let Some(ft_index) = self.cv.ft_index {
            ft_index as u32
        } else {
            0
        }
    }

    #[wasm_bindgen(getter = gt_index)]
    pub fn gt_index(&self) -> u32 {
        if let Some(gt_index) = self.cv.gt_index {
            gt_index as u32
        } else {
            0
        }
    }

    #[wasm_bindgen(getter = total_fees)]
    pub fn total_fees(&self) -> u64 {
        self.cv.total_fees
    }

    #[wasm_bindgen(getter = expected_difficulty)]
    pub fn expected_difficulty(&self) -> u64 {
        self.cv.expected_difficulty
    }

    #[wasm_bindgen(getter = total_rebroadcast_slips)]
    pub fn total_rebroadcast_slips(&self) -> u64 {
        self.cv.total_rebroadcast_slips
    }

    #[wasm_bindgen(getter = total_rebroadcast_nolan)]
    pub fn total_rebroadcast_nolan(&self) -> u64 {
        self.cv.total_rebroadcast_nolan
    }

    #[wasm_bindgen(getter = total_rebroadcast_fees_nolan)]
    pub fn total_rebroadcast_fees_nolan(&self) -> u64 {
        self.cv.total_rebroadcast_fees_nolan
    }

    #[wasm_bindgen(getter = total_rebroadcast_staking_payouts_nolan)]
    pub fn total_rebroadcast_staking_payouts_nolan(&self) -> u64 {
        self.cv.total_rebroadcast_staking_payouts_nolan
    }

    #[wasm_bindgen(getter = rebroadcast_hash)]
    pub fn rebroadcast_hash(&self) -> JsString {
        // Convert the byte array to a JsValue
        // JsValue::from_serde(&self.cv.rebroadcast_hash).unwrap()
        self.cv.rebroadcast_hash.to_hex().into()
    }

    // #[wasm_bindgen(getter = block_payout)]
    // pub fn block_payout(&self) -> JsValue {
    //     // assuming you can convert Vec<BlockPayout> to a JsValue
    //     // this might require a method or utility to convert properly
    //     JsValue::from_serde(&self.cv.block_payout).unwrap()
    // }

    #[wasm_bindgen(getter = avg_income)]
    pub fn avg_income(&self) -> u64 {
        self.cv.avg_total_fees
    }

    #[wasm_bindgen(getter = avg_total_fees)]
    pub fn avg_total_fees(&self) -> u64 {
        self.cv.avg_total_fees
    }
}

impl WasmConsensusValues {
    pub fn from_cv(cv: ConsensusValues) -> WasmConsensusValues {
        WasmConsensusValues { cv }
    }
}
