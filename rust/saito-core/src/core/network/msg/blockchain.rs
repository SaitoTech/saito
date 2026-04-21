//! Wire types for [`crate::core::network::msg::message::Message::RequestBlockchain`] /
//! [`crate::core::network::msg::message::Message::Blockchain`].
//!
//! ## Wire layout
//!
//! **`RequestBlockchain`** — variable length, minimum **110** bytes:
//! - `latest_known_block_id`: `u64` big-endian
//! - `latest_known_block_hash`: 32 bytes
//! - `fork_id`: 32 bytes
//! - `sync_type`: `u8` (see `SYNC_TYPE_*` constants)
//! - `public_key`: 33 bytes
//! - `key_count`: `u32` BE
//! - `key_count` × 33-byte public keys (`keylist`)
//!
//! **`Blockchain`** — fixed **192**-byte header, then payload references:
//! - `latest_known_block_id`: `u64` BE
//! - `latest_known_block_hash`: 32 bytes
//! - `fork_id`: 32 bytes
//! - `shared_ancestor_block_id`: `u64` BE
//! - `shared_ancestor_block_hash`: 32 bytes
//! - `payload_earliest_block_id` / `payload_earliest_block_hash`: `u64` + 32
//! - `payload_latest_block_id` / `payload_latest_block_hash`: `u64` + 32
//! - `reference_count`: `u32` BE
//! - `reference_count` × serialized `BlockReference`
//!
//! ### Empty chunk (`reference_count == 0`)
//!
//! There are no `BlockReference` entries. `payload_earliest_*` / `payload_latest_*`
//! still describe bounds for that chunk on the wire.
//!
//! ### Ordered payload (`reference_count > 0`)
//!
//! Each entry is a `BlockReference` the recipient may queue for fetch;
//! the sync manager skips hashes already on disk or in the mempool queue.

use crate::core::defs::{BlockHash, BlockId, ForkId, SaitoHash, SaitoPublicKey};
use crate::core::network::msg::block::{BlockReference, BLOCK_REFERENCE_WIRE_LEN};
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

pub const SYNC_TYPE_FULL: u8 = 0;
pub const SYNC_TYPE_SPV: u8 = 1;
/// Ghost-chain style payload (legacy mode on wire).
pub const SYNC_TYPE_GHOST: u8 = 2;

/// Maximum `reference_count` / payload entries per [`Blockchain`] message.
pub const MAX_BLOCKCHAIN_CHUNK: usize = 128;

/// Returns true if `v` is one of the supported [`SYNC_TYPE_*`] wire values.
pub fn is_supported_sync_type(v: u8) -> bool {
    matches!(v, SYNC_TYPE_FULL | SYNC_TYPE_SPV | SYNC_TYPE_GHOST)
}

/// Minimum byte length of a serialized [`RequestBlockchain`] (without keylist entries).
pub const REQUEST_BLOCKCHAIN_MIN_WIRE_LEN: usize = 8 + 32 + 32 + 1 + 33 + 4;

/// Byte length of the fixed header of a serialized [`Blockchain`] (before count + payload).
pub const BLOCKCHAIN_HEADER_WIRE_LEN: usize = 8 + 32 + 32 + 8 + 32 + 8 + 32 + 8 + 32;

fn read_u64_be(buf: &[u8], off: usize) -> Result<u64, Error> {
    Ok(u64::from_be_bytes(
        buf[off..off + 8]
            .try_into()
            .map_err(|_| ErrorKind::InvalidData)?,
    ))
}

fn read_u32_be(buf: &[u8], off: usize) -> Result<u32, Error> {
    Ok(u32::from_be_bytes(
        buf[off..off + 4]
            .try_into()
            .map_err(|_| ErrorKind::InvalidData)?,
    ))
}

fn read_hash(buf: &[u8], off: usize) -> Result<SaitoHash, Error> {
    if buf.len() < off + 32 {
        return Err(Error::from(ErrorKind::InvalidData));
    }
    buf[off..off + 32]
        .try_into()
        .map_err(|_| Error::from(ErrorKind::InvalidData))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlockchain {
    pub latest_known_block_id: BlockId,
    pub latest_known_block_hash: BlockHash,
    pub fork_id: ForkId,
    pub sync_type: u8,
    pub public_key: SaitoPublicKey,
    pub keylist: Vec<SaitoPublicKey>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Blockchain {
    pub latest_known_block_id: BlockId,
    pub latest_known_block_hash: BlockHash,
    pub fork_id: ForkId,
    pub shared_ancestor_block_id: BlockId,
    pub shared_ancestor_block_hash: BlockHash,
    pub payload_earliest_block_id: BlockId,
    pub payload_earliest_block_hash: BlockHash,
    pub payload_latest_block_id: BlockId,
    pub payload_latest_block_hash: BlockHash,
    pub payload: Vec<BlockReference>,
}

impl Blockchain {
    /// Total wire size for this payload (header + count + payload references).
    pub fn wire_len(&self) -> usize {
        BLOCKCHAIN_HEADER_WIRE_LEN + 4 + self.payload.len() * BLOCK_REFERENCE_WIRE_LEN
    }
}

impl Serialize<Self> for RequestBlockchain {
    fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(
            REQUEST_BLOCKCHAIN_MIN_WIRE_LEN + self.keylist.len().saturating_mul(33),
        );
        let key_count: u32 = u32::try_from(self.keylist.len()).unwrap_or_else(|_| {
            panic!(
                "RequestBlockchain: keylist length {} exceeds u32::MAX",
                self.keylist.len()
            );
        });
        out.extend_from_slice(&self.latest_known_block_id.to_be_bytes());
        out.extend_from_slice(self.latest_known_block_hash.as_slice());
        out.extend_from_slice(self.fork_id.as_slice());
        out.push(self.sync_type);
        out.extend_from_slice(self.public_key.as_slice());
        out.extend_from_slice(&key_count.to_be_bytes());
        for key in &self.keylist {
            out.extend_from_slice(key.as_slice());
        }
        out
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() < REQUEST_BLOCKCHAIN_MIN_WIRE_LEN {
            warn!(
                "Deserializing RequestBlockchain: expected at least {} bytes, got {}",
                REQUEST_BLOCKCHAIN_MIN_WIRE_LEN,
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let sync_type = buffer[72];
        if !is_supported_sync_type(sync_type) {
            warn!(
                "Deserializing RequestBlockchain: unsupported sync_type {}",
                sync_type
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let key_count = read_u32_be(buffer, 106)? as usize;
        let expected_len = REQUEST_BLOCKCHAIN_MIN_WIRE_LEN + key_count.saturating_mul(33);
        if buffer.len() != expected_len {
            warn!(
                "Deserializing RequestBlockchain: length mismatch (got {}, expected {} for {} keys)",
                buffer.len(),
                expected_len,
                key_count
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let mut keylist = Vec::with_capacity(key_count);
        let mut off = 110;
        for _ in 0..key_count {
            keylist.push(
                buffer[off..off + 33]
                    .try_into()
                    .map_err(|_| Error::from(ErrorKind::InvalidData))?,
            );
            off += 33;
        }
        Ok(RequestBlockchain {
            latest_known_block_id: read_u64_be(buffer, 0)?,
            latest_known_block_hash: read_hash(buffer, 8)?,
            fork_id: read_hash(buffer, 40)?,
            sync_type,
            public_key: buffer[73..106]
                .try_into()
                .map_err(|_| Error::from(ErrorKind::InvalidData))?,
            keylist,
        })
    }
}

impl Serialize<Self> for Blockchain {
    fn serialize(&self) -> Vec<u8> {
        let n = self.payload.len();
        let count: u32 = u32::try_from(n).unwrap_or_else(|_| {
            panic!("Blockchain: payload length {} exceeds u32::MAX", n);
        });

        let mut out =
            Vec::with_capacity(BLOCKCHAIN_HEADER_WIRE_LEN + 4 + n * BLOCK_REFERENCE_WIRE_LEN);
        out.extend_from_slice(&self.latest_known_block_id.to_be_bytes());
        out.extend_from_slice(self.latest_known_block_hash.as_slice());
        out.extend_from_slice(self.fork_id.as_slice());
        out.extend_from_slice(&self.shared_ancestor_block_id.to_be_bytes());
        out.extend_from_slice(self.shared_ancestor_block_hash.as_slice());
        out.extend_from_slice(&self.payload_earliest_block_id.to_be_bytes());
        out.extend_from_slice(self.payload_earliest_block_hash.as_slice());
        out.extend_from_slice(&self.payload_latest_block_id.to_be_bytes());
        out.extend_from_slice(self.payload_latest_block_hash.as_slice());
        out.extend_from_slice(&count.to_be_bytes());

        for reference in &self.payload {
            out.extend_from_slice(reference.serialize().as_slice());
        }
        out
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() < BLOCKCHAIN_HEADER_WIRE_LEN + 4 {
            warn!(
                "Deserializing Blockchain: buffer too short ({} < {})",
                buffer.len(),
                BLOCKCHAIN_HEADER_WIRE_LEN + 4
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        let latest_known_block_id = read_u64_be(buffer, 0)?;
        let latest_known_block_hash = read_hash(buffer, 8)?;
        let fork_id = read_hash(buffer, 40)?;
        let shared_ancestor_block_id = read_u64_be(buffer, 72)?;
        let shared_ancestor_block_hash = read_hash(buffer, 80)?;
        let payload_earliest_block_id = read_u64_be(buffer, 112)?;
        let payload_earliest_block_hash = read_hash(buffer, 120)?;
        let payload_latest_block_id = read_u64_be(buffer, 152)?;
        let payload_latest_block_hash = read_hash(buffer, 160)?;

        let reference_count = read_u32_be(buffer, 192)? as usize;
        if reference_count > MAX_BLOCKCHAIN_CHUNK {
            warn!(
                "Deserializing Blockchain: reference_count {} exceeds MAX_BLOCKCHAIN_CHUNK ({})",
                reference_count, MAX_BLOCKCHAIN_CHUNK
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let body_len = BLOCKCHAIN_HEADER_WIRE_LEN
            + 4
            + reference_count.saturating_mul(BLOCK_REFERENCE_WIRE_LEN);
        if buffer.len() != body_len {
            warn!(
                "Deserializing Blockchain: length mismatch (got {}, expected {} for {} refs)",
                buffer.len(),
                body_len,
                reference_count
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        let mut payload = Vec::with_capacity(reference_count);
        let mut off = 196;
        for _ in 0..reference_count {
            let end = off + BLOCK_REFERENCE_WIRE_LEN;
            let reference = BlockReference::deserialize(&buffer[off..end].to_vec())?;
            off = end;
            payload.push(reference);
        }

        Ok(Blockchain {
            latest_known_block_id,
            latest_known_block_hash,
            fork_id,
            shared_ancestor_block_id,
            shared_ancestor_block_hash,
            payload_earliest_block_id,
            payload_earliest_block_hash,
            payload_latest_block_id,
            payload_latest_block_hash,
            payload,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::util::serialize::Serialize;

    #[test]
    fn request_blockchain_roundtrip() {
        let r = RequestBlockchain {
            latest_known_block_id: 42,
            latest_known_block_hash: [1u8; 32],
            fork_id: [2u8; 32],
            sync_type: SYNC_TYPE_SPV,
            public_key: [9u8; 33],
            keylist: vec![[10u8; 33], [11u8; 33]],
        };
        let buf = r.serialize();
        assert_eq!(buf.len(), REQUEST_BLOCKCHAIN_MIN_WIRE_LEN + (2 * 33));
        let r2 = RequestBlockchain::deserialize(&buf).unwrap();
        assert_eq!(r, r2);
    }

    #[test]
    fn blockchain_roundtrip_with_payload() {
        let c = Blockchain {
            latest_known_block_id: 100,
            latest_known_block_hash: [3u8; 32],
            fork_id: [4u8; 32],
            shared_ancestor_block_id: 10,
            shared_ancestor_block_hash: [5u8; 32],
            payload_earliest_block_id: 11,
            payload_earliest_block_hash: [6u8; 32],
            payload_latest_block_id: 13,
            payload_latest_block_hash: [7u8; 32],
            payload: vec![
                BlockReference {
                    block_id: 11,
                    block_hash: [6u8; 32],
                    timestamp: 1000,
                    transactions: 5,
                    has_golden_ticket: false,
                },
                BlockReference {
                    block_id: 12,
                    block_hash: [8u8; 32],
                    timestamp: 1001,
                    transactions: 4,
                    has_golden_ticket: true,
                },
                BlockReference {
                    block_id: 13,
                    block_hash: [7u8; 32],
                    timestamp: 1002,
                    transactions: 3,
                    has_golden_ticket: false,
                },
            ],
        };
        let buf = c.serialize();
        assert_eq!(buf.len(), c.wire_len());
        let c2 = Blockchain::deserialize(&buf).unwrap();
        assert_eq!(c, c2);
    }

    #[test]
    fn request_blockchain_rejects_unknown_sync_type() {
        let mut buf = vec![0u8; REQUEST_BLOCKCHAIN_MIN_WIRE_LEN];
        buf[72] = 99;
        assert!(RequestBlockchain::deserialize(&buf).is_err());
    }

    #[test]
    fn blockchain_rejects_reference_count_over_max() {
        let mut buf = vec![0u8; BLOCKCHAIN_HEADER_WIRE_LEN + 4];
        buf[192..196].copy_from_slice(&(129u32).to_be_bytes());
        assert!(Blockchain::deserialize(&buf).is_err());
    }
}
