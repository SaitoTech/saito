//! blockr: Download and decode a Saito block from a URL

use saito_core::core::consensus::block::Block;
use std::env;
use std::process;
use reqwest::Client;
use serde::Serialize;
use serde_json;
use tokio;
use bs58;
use hex;

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
    pub transactions_count: usize,
    // Add more fields as needed
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
            transactions_count: block.transactions.len(),
        }
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Parse command line arguments
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: blockr <url>");
        process::exit(1);
    }
    let url = &args[1];

    // Download the data
    let client = Client::new();
    let response = client.get(url).send().await;
    let bytes = match response {
        Ok(resp) => match resp.bytes().await {
            Ok(b) => b,
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
            eprintln!("The specified url does not appear to return Saito block data");
            process::exit(1);
        }
    }
} 