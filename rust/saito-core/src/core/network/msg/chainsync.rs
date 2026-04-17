//! Wire types for `Message::RequestChainSync` / `Message::ChainSync`.
//!
//! ## Wire layout
//!
//! **RequestChainSync** — fixed **73** bytes:
//! - `latest_known_block_id`: `u64` big-endian
//! - `latest_known_block_hash`: 32 bytes
//! - `fork_id`: 32 bytes
//! - `sync_type`: `u8` (see `SYNC_TYPE_*` constants)
//!
//! **ChainSync** — fixed **192**-byte header, then a reference block:
//! - `latest_known_block_id`: `u64` BE
//! - `latest_known_block_hash`: 32 bytes
//! - `fork_id`: 32 bytes
//! - `shared_ancestor_block_id`: `u64` BE
//! - `shared_ancestor_block_hash`: 32 bytes
//! - `payload_earliest_block_id` / `payload_earliest_block_hash`: `u64` + 32
//! - `payload_latest_block_id` / `payload_latest_block_hash`: `u64` + 32
//! - `reference_count`: `u32` BE
//! - `reference_count` × (`block_id`: `u64` BE + `block_hash`: 32 bytes)
//!
//! ### Empty `ChainSync` chunk (`reference_count == 0`)
//!
//! There are no `(block_id, hash)` tuples. Higher-level validation (e.g. in
//! `sync::chain::validate_chain_sync_bounds`) requires `payload_earliest_*` and
//! `payload_latest_*` to agree so the chunk describes a single logical position
//! with no references to fetch in this message.
//!
//! ### Ordered references (`reference_count > 0`)
//!
//! On the wire, pairs are stored in transmission order. After deserialize,
//! `sync::chain::parse_chain_sync` enforces **strictly increasing** `block_id`
//! (each id must be greater than the previous). Equal or decreasing ids are
//! invalid. Gaps between ids are permitted and are only logged, not rejected.

use crate::core::defs::{BlockHash, BlockId, ForkId, SaitoHash};
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

/// `RequestChainSync.sync_type` / related: full-node style sync.
pub const SYNC_TYPE_FULL: u8 = 0;
/// SPV / lite client.
pub const SYNC_TYPE_SPV: u8 = 1;
/// Ghost-chain style payload (legacy mode on wire).
pub const SYNC_TYPE_GHOST: u8 = 2;

/// Maximum `reference_count` allowed on the wire for a single [`ChainSync`]
/// payload. Enforced in [`ChainSync::deserialize`] as well as in builders.
pub const MAX_CHAIN_SYNC_CHUNK: usize = 128;

/// Returns true if `v` is one of the supported [`SYNC_TYPE_*`] wire values.
pub fn is_supported_sync_type(v: u8) -> bool {
    matches!(v, SYNC_TYPE_FULL | SYNC_TYPE_SPV | SYNC_TYPE_GHOST)
}

/// Byte length of a serialized [`RequestChainSync`].
pub const REQUEST_CHAINSYNC_WIRE_LEN: usize = 8 + 32 + 32 + 1;

/// Byte length of the fixed header of a serialized [`ChainSync`] (before reference list).
pub const CHAINSYNC_HEADER_WIRE_LEN: usize = 8 + 32 + 32 + 8 + 32 + 8 + 32 + 8 + 32;

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
pub struct RequestChainSync {
    pub latest_known_block_id: BlockId,
    pub latest_known_block_hash: BlockHash,
    pub fork_id: ForkId,
    pub sync_type: u8,
}

/// Wire payload for [`crate::core::network::msg::message::Message::ChainSync`].
///
/// **Canonical responder semantics:** `latest_known_block_id` /
/// `latest_known_block_hash` are the **sender's chain tip**. The receiver may
/// issue another [`RequestChainSync`] when `payload_latest_block_id <
/// latest_known_block_id` (chunked sync not yet covering the sender's tip).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChainSync {
    pub latest_known_block_id: BlockId,
    pub latest_known_block_hash: BlockHash,
    pub fork_id: ForkId,
    pub shared_ancestor_block_id: BlockId,
    pub shared_ancestor_block_hash: BlockHash,
    pub payload_earliest_block_id: BlockId,
    pub payload_earliest_block_hash: BlockHash,
    pub payload_latest_block_id: BlockId,
    pub payload_latest_block_hash: BlockHash,
    /// Ordered block references for this chunk (`block_id`, `block_hash`).
    ///
    /// **Wire / validation:** When non-empty, `parse_chain_sync` requires
    /// `block_id` to be **strictly increasing** from first entry to last (no
    /// duplicates, no equal ids). See module docs for empty-chunk semantics.
    pub block_references: Vec<(BlockId, BlockHash)>,
}

impl ChainSync {
    /// Total wire size for this payload (header + count + references).
    pub fn wire_len(&self) -> usize {
        CHAINSYNC_HEADER_WIRE_LEN + 4 + self.block_references.len() * (8 + 32)
    }
}

impl Serialize<Self> for RequestChainSync {
    fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(REQUEST_CHAINSYNC_WIRE_LEN);
        out.extend_from_slice(&self.latest_known_block_id.to_be_bytes());
        out.extend_from_slice(self.latest_known_block_hash.as_slice());
        out.extend_from_slice(self.fork_id.as_slice());
        out.push(self.sync_type);
        debug_assert_eq!(out.len(), REQUEST_CHAINSYNC_WIRE_LEN);
        out
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != REQUEST_CHAINSYNC_WIRE_LEN {
            warn!(
                "Deserializing RequestChainSync: expected {} bytes, got {}",
                REQUEST_CHAINSYNC_WIRE_LEN,
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let sync_type = buffer[72];
        if !is_supported_sync_type(sync_type) {
            warn!(
                "Deserializing RequestChainSync: unsupported sync_type {}",
                sync_type
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        Ok(RequestChainSync {
            latest_known_block_id: read_u64_be(buffer, 0)?,
            latest_known_block_hash: read_hash(buffer, 8)?,
            fork_id: read_hash(buffer, 40)?,
            sync_type,
        })
    }
}

impl Serialize<Self> for ChainSync {
    fn serialize(&self) -> Vec<u8> {
        let n = self.block_references.len();
        let count: u32 = u32::try_from(n).unwrap_or_else(|_| {
            panic!("ChainSync: block_references length {} exceeds u32::MAX", n);
        });

        let mut out = Vec::with_capacity(CHAINSYNC_HEADER_WIRE_LEN + 4 + n * 40);
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

        for (id, hash) in &self.block_references {
            out.extend_from_slice(&id.to_be_bytes());
            out.extend_from_slice(hash.as_slice());
        }
        out
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() < CHAINSYNC_HEADER_WIRE_LEN + 4 {
            warn!(
                "Deserializing ChainSync: buffer too short ({} < {})",
                buffer.len(),
                CHAINSYNC_HEADER_WIRE_LEN + 4
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
        if reference_count > MAX_CHAIN_SYNC_CHUNK {
            warn!(
                "Deserializing ChainSync: reference_count {} exceeds MAX_CHAIN_SYNC_CHUNK ({})",
                reference_count, MAX_CHAIN_SYNC_CHUNK
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let body_len = CHAINSYNC_HEADER_WIRE_LEN + 4 + reference_count.saturating_mul(8 + 32);
        if buffer.len() != body_len {
            warn!(
                "Deserializing ChainSync: length mismatch (got {}, expected {} for {} refs)",
                buffer.len(),
                body_len,
                reference_count
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        let mut block_references = Vec::with_capacity(reference_count);
        let mut off = 196;
        for _ in 0..reference_count {
            let id = read_u64_be(buffer, off)?;
            off += 8;
            let hash = read_hash(buffer, off)?;
            off += 32;
            block_references.push((id, hash));
        }

        Ok(ChainSync {
            latest_known_block_id,
            latest_known_block_hash,
            fork_id,
            shared_ancestor_block_id,
            shared_ancestor_block_hash,
            payload_earliest_block_id,
            payload_earliest_block_hash,
            payload_latest_block_id,
            payload_latest_block_hash,
            block_references,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::util::serialize::Serialize;

    #[test]
    fn request_chainsync_roundtrip() {
        let r = RequestChainSync {
            latest_known_block_id: 42,
            latest_known_block_hash: [1u8; 32],
            fork_id: [2u8; 32],
            sync_type: SYNC_TYPE_SPV,
        };
        let buf = r.serialize();
        assert_eq!(buf.len(), REQUEST_CHAINSYNC_WIRE_LEN);
        let r2 = RequestChainSync::deserialize(&buf).unwrap();
        assert_eq!(r, r2);
    }

    #[test]
    fn chainsync_roundtrip_with_refs() {
        let c = ChainSync {
            latest_known_block_id: 100,
            latest_known_block_hash: [3u8; 32],
            fork_id: [4u8; 32],
            shared_ancestor_block_id: 10,
            shared_ancestor_block_hash: [5u8; 32],
            payload_earliest_block_id: 11,
            payload_earliest_block_hash: [6u8; 32],
            payload_latest_block_id: 13,
            payload_latest_block_hash: [7u8; 32],
            block_references: vec![
                (11, [6u8; 32]),
                (12, [8u8; 32]),
                (13, [7u8; 32]),
            ],
        };
        let buf = c.serialize();
        assert_eq!(buf.len(), c.wire_len());
        let c2 = ChainSync::deserialize(&buf).unwrap();
        assert_eq!(c, c2);
    }

    #[test]
    fn request_chainsync_rejects_unknown_sync_type() {
        let mut buf = vec![0u8; REQUEST_CHAINSYNC_WIRE_LEN];
        buf[72] = 99;
        assert!(RequestChainSync::deserialize(&buf).is_err());
    }

    #[test]
    fn chainsync_rejects_reference_count_over_max() {
        // Header + count only; count 129 exceeds MAX_CHAIN_SYNC_CHUNK before tail is parsed.
        let mut buf = vec![0u8; CHAINSYNC_HEADER_WIRE_LEN + 4];
        buf[192..196].copy_from_slice(&(129u32).to_be_bytes());
        assert!(ChainSync::deserialize(&buf).is_err());
    }
}
