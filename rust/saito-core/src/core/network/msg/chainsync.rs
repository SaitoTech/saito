use crate::core::defs::{PrintForLog, SaitoHash};
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

#[derive(Debug)]
pub struct RequestChainSync {
    pub latest_block_id: u64,
    pub latest_block_hash: SaitoHash,
}

#[derive(Debug)]
pub struct ChainSync {}

impl Serialize<Self> for RequestChainSync {
    fn serialize(&self) -> Vec<u8> {
        [
            self.latest_block_id.to_be_bytes().as_slice(),
            self.latest_block_hash.as_slice(),
        ]
        .concat()
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        const REQUEST_SYNC_SIZE: usize = 8 + 32 + 32;

        if buffer.len() != REQUEST_SYNC_SIZE {
            warn!(
                "Deserializing RequestChainSync failed, expected {} bytes but got {}",
                REQUEST_SYNC_SIZE,
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        Ok(RequestChainSync {
            latest_block_id: u64::from_be_bytes(
                buffer[0..8].try_into().or(Err(ErrorKind::InvalidData))?,
            ),
            latest_block_hash: buffer[8..40].try_into().or(Err(ErrorKind::InvalidData))?,
        })
    }
}

impl Serialize<Self> for ChainSync {
    fn serialize(&self) -> Vec<u8> {
        vec![]
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if !buffer.is_empty() {
            warn!(
                "Deserializing ChainSync failed, expected empty buffer but got {}",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        Ok(ChainSync {})
    }
}
