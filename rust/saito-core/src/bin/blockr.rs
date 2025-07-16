//! blockr: Download and decode a Saito block from a URL

use saito_core::core::consensus::block::Block;
use saito_core::core::consensus::transaction::{Transaction, TransactionType};
use saito_core::core::consensus::slip::{Slip, SlipType};
use std::env;
use std::process;
use reqwest::Client;
use serde::Serialize;
use serde_json;
use tokio;
use bs58;
use hex;
use base64;
use std::fs;
use std::path::Path;

// Custom serializers for human-readable output
fn as_base58<S>(bytes: &[u8; 33], serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&bs58::encode(bytes).into_string())
}
fn as_hex32<S>(bytes: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&hex::encode(bytes))
}
fn as_hex64<S>(bytes: &[u8; 64], serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&hex::encode(bytes))
}
fn as_base64<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&base64::encode(bytes))
}

// Wrapper for Slip
#[derive(Serialize)]
struct SlipJson<'a> {
    #[serde(serialize_with = "as_base58")]
    pub public_key: &'a [u8; 33],
    pub amount: u64,
    pub slip_type: SlipType,
    pub slip_index: u8,
    pub block_id: u64,
    pub tx_ordinal: u64,
}
impl<'a> From<&'a Slip> for SlipJson<'a> {
    fn from(slip: &'a Slip) -> Self {
        SlipJson {
            public_key: &slip.public_key,
            amount: slip.amount,
            slip_type: slip.slip_type,
            slip_index: slip.slip_index,
            block_id: slip.block_id,
            tx_ordinal: slip.tx_ordinal,
        }
    }
}

// Wrapper for Transaction
#[derive(Serialize)]
struct TransactionJson<'a> {
    pub timestamp: u64,
    pub transaction_type: TransactionType,
    #[serde(serialize_with = "as_hex64")]
    pub signature: &'a [u8; 64],
    pub from: Vec<SlipJson<'a>>,
    pub to: Vec<SlipJson<'a>>,
    #[serde(serialize_with = "as_base64", skip_serializing_if = "Vec::is_empty")]
    pub data: Vec<u8>,
    pub total_in: u64,
    pub total_out: u64,
    pub total_fees: u64,
    pub total_work_for_me: u64,
    pub cumulative_fees: u64,
    pub txs_replacements: u32,
}
impl<'a> From<&'a Transaction> for TransactionJson<'a> {
    fn from(tx: &'a Transaction) -> Self {
        TransactionJson {
            timestamp: tx.timestamp,
            transaction_type: tx.transaction_type,
            signature: &tx.signature,
            from: tx.from.iter().map(SlipJson::from).collect(),
            to: tx.to.iter().map(SlipJson::from).collect(),
            data: tx.data.clone(),
            total_in: tx.total_in,
            total_out: tx.total_out,
            total_fees: tx.total_fees,
            total_work_for_me: tx.total_work_for_me,
            cumulative_fees: tx.cumulative_fees,
            txs_replacements: tx.txs_replacements,
        }
    }
}

// Wrapper for Block
#[derive(Serialize)]
struct BlockJson<'a> {
    pub id: u64,
    pub timestamp: u64,
    #[serde(serialize_with = "as_hex32")]
    pub previous_block_hash: &'a [u8; 32],
    #[serde(serialize_with = "as_base58")]
    pub creator: &'a [u8; 33],
    #[serde(serialize_with = "as_hex32")]
    pub merkle_root: &'a [u8; 32],
    #[serde(serialize_with = "as_hex64")]
    pub signature: &'a [u8; 64],
    pub graveyard: u64,
    pub treasury: u64,
    pub total_fees: u64,
    pub total_fees_new: u64,
    pub total_fees_atr: u64,
    pub total_fees_cumulative: u64,
    pub avg_total_fees: u64,
    pub avg_total_fees_new: u64,
    pub avg_total_fees_atr: u64,
    pub total_payout_routing: u64,
    pub total_payout_mining: u64,
    pub total_payout_treasury: u64,
    pub total_payout_graveyard: u64,
    pub total_payout_atr: u64,
    pub avg_payout_routing: u64,
    pub avg_payout_mining: u64,
    pub avg_payout_treasury: u64,
    pub avg_payout_graveyard: u64,
    pub avg_payout_atr: u64,
    pub avg_fee_per_byte: u64,
    pub fee_per_byte: u64,
    pub avg_nolan_rebroadcast_per_block: u64,
    pub burnfee: u64,
    pub difficulty: u64,
    pub previous_block_unpaid: u64,
    pub transactions: Vec<TransactionJson<'a>>,
}
impl<'a> From<&'a Block> for BlockJson<'a> {
    fn from(block: &'a Block) -> Self {
        BlockJson {
            id: block.id,
            timestamp: block.timestamp,
            previous_block_hash: &block.previous_block_hash,
            creator: &block.creator,
            merkle_root: &block.merkle_root,
            signature: &block.signature,
            graveyard: block.graveyard,
            treasury: block.treasury,
            total_fees: block.total_fees,
            total_fees_new: block.total_fees_new,
            total_fees_atr: block.total_fees_atr,
            total_fees_cumulative: block.total_fees_cumulative,
            avg_total_fees: block.avg_total_fees,
            avg_total_fees_new: block.avg_total_fees_new,
            avg_total_fees_atr: block.avg_total_fees_atr,
            total_payout_routing: block.total_payout_routing,
            total_payout_mining: block.total_payout_mining,
            total_payout_treasury: block.total_payout_treasury,
            total_payout_graveyard: block.total_payout_graveyard,
            total_payout_atr: block.total_payout_atr,
            avg_payout_routing: block.avg_payout_routing,
            avg_payout_mining: block.avg_payout_mining,
            avg_payout_treasury: block.avg_payout_treasury,
            avg_payout_graveyard: block.avg_payout_graveyard,
            avg_payout_atr: block.avg_payout_atr,
            avg_fee_per_byte: block.avg_fee_per_byte,
            fee_per_byte: block.fee_per_byte,
            avg_nolan_rebroadcast_per_block: block.avg_nolan_rebroadcast_per_block,
            burnfee: block.burnfee,
            difficulty: block.difficulty,
            previous_block_unpaid: block.previous_block_unpaid,
            transactions: block.transactions.iter().map(TransactionJson::from).collect(),
        }
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Parse command line arguments
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: blockr <url-or-filepath>");
        process::exit(1);
    }
    let input = &args[1];

    let bytes: Vec<u8>;
    if Path::new(input).exists() && Path::new(input).is_file() {
        // Read from file
        match fs::read(input) {
            Ok(b) => bytes = b,
            Err(_) => {
                eprintln!("Failed to read file: {}", input);
                process::exit(1);
            }
        }
    } else {
        // Download the data from URL
        let client = Client::new();
        let response = client.get(input).send().await;
        bytes = match response {
            Ok(resp) => match resp.bytes().await {
                Ok(b) => b.to_vec(),
                Err(_) => {
                    eprintln!("The specified url does not appear to return Saito block data");
                    process::exit(1);
                }
            },
            Err(_) => {
                eprintln!("The specified url does not appear to return Saito block data");
                process::exit(1);
            }
        };
    }

    // Try to deserialize as a Saito block
    let block = Block::deserialize_from_net(&bytes);
    match block {
        Ok(ref block) => {
            let block_json = BlockJson::from(block);
            match serde_json::to_string_pretty(&block_json) {
                Ok(json) => println!("{}", json),
                Err(_) => {
                    eprintln!("Failed to serialize block to JSON");
                    process::exit(1);
                }
            }
        }
        Err(_) => {
            eprintln!("The specified input does not appear to contain Saito block data");
            process::exit(1);
        }
    }
} 