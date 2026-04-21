use crate::core::defs::{BlockHash, BlockId, Timestamp};
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

pub const REQUEST_BLOCK_REFERENCE_WIRE_LEN: usize = 8 + 32;
pub const BLOCK_REFERENCE_WIRE_LEN: usize = 8 + 32 + 8 + 4 + 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlockReference {
    pub block_id: BlockId,
    pub block_hash: BlockHash,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockReference {
    pub block_id: BlockId,
    pub block_hash: BlockHash,
    pub timestamp: Timestamp,
    pub transactions: u32,
    pub has_golden_ticket: bool,
}

impl Serialize<Self> for RequestBlockReference {
    fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(REQUEST_BLOCK_REFERENCE_WIRE_LEN);
        out.extend_from_slice(&self.block_id.to_be_bytes());
        out.extend_from_slice(self.block_hash.as_slice());
        out
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != REQUEST_BLOCK_REFERENCE_WIRE_LEN {
            warn!(
                "Deserializing RequestBlockReference failed, expected {} bytes, got {}",
                REQUEST_BLOCK_REFERENCE_WIRE_LEN,
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        Ok(RequestBlockReference {
            block_id: u64::from_be_bytes(
                buffer[0..8]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ),
            block_hash: buffer[8..40]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        })
    }
}

impl Serialize<Self> for BlockReference {
    fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(BLOCK_REFERENCE_WIRE_LEN);
        out.extend_from_slice(&self.block_id.to_be_bytes());
        out.extend_from_slice(self.block_hash.as_slice());
        out.extend_from_slice(&self.timestamp.to_be_bytes());
        out.extend_from_slice(&self.transactions.to_be_bytes());
        out.push(self.has_golden_ticket as u8);
        out
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != BLOCK_REFERENCE_WIRE_LEN {
            warn!(
                "Deserializing BlockReference failed, expected {} bytes, got {}",
                BLOCK_REFERENCE_WIRE_LEN,
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        Ok(BlockReference {
            block_id: u64::from_be_bytes(
                buffer[0..8]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ),
            block_hash: buffer[8..40]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
            timestamp: u64::from_be_bytes(
                buffer[40..48]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ),
            transactions: u32::from_be_bytes(
                buffer[48..52]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ),
            has_golden_ticket: buffer[52] != 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_block_reference_roundtrip() {
        let r = RequestBlockReference {
            block_id: 10,
            block_hash: [1; 32],
        };
        let buf = r.serialize();
        assert_eq!(buf.len(), REQUEST_BLOCK_REFERENCE_WIRE_LEN);
        let r2 = RequestBlockReference::deserialize(&buf).unwrap();
        assert_eq!(r, r2);
    }

    #[test]
    fn block_reference_roundtrip() {
        let r = BlockReference {
            block_id: 22,
            block_hash: [2; 32],
            timestamp: 1_234_567,
            transactions: 17,
            has_golden_ticket: true,
        };
        let buf = r.serialize();
        assert_eq!(buf.len(), BLOCK_REFERENCE_WIRE_LEN);
        let r2 = BlockReference::deserialize(&buf).unwrap();
        assert_eq!(r, r2);
    }
}
