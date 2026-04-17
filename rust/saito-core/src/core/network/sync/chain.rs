//! Helpers for canonical chain sync payloads (`RequestChainSync` / `ChainSync`).
//! Wire structs and `Serialize` live in [`crate::core::network::msg::chainsync`].

use crate::core::defs::{BlockHash, BlockId, PrintForLog};
use crate::core::network::msg::chainsync::ChainSync;
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

/// Re-export: max references per `ChainSync` chunk (wire + builder cap).
pub use crate::core::network::msg::chainsync::MAX_CHAIN_SYNC_CHUNK;

/// Build a `ChainSync` value for serialization. Enforces [`MAX_CHAIN_SYNC_CHUNK`].
pub fn build_blockchain_response(
    latest_known_block_id: BlockId,
    latest_known_block_hash: BlockHash,
    fork_id: BlockHash,
    shared_ancestor_block_id: BlockId,
    shared_ancestor_block_hash: BlockHash,
    payload_earliest_block_id: BlockId,
    payload_earliest_block_hash: BlockHash,
    payload_latest_block_id: BlockId,
    payload_latest_block_hash: BlockHash,
    ordered_block_references: Vec<(BlockId, BlockHash)>,
) -> Result<ChainSync, Error> {
    if ordered_block_references.len() > MAX_CHAIN_SYNC_CHUNK {
        warn!(
            "build_blockchain_response: {} refs exceeds MAX_CHAIN_SYNC_CHUNK ({})",
            ordered_block_references.len(),
            MAX_CHAIN_SYNC_CHUNK
        );
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "chain sync reference list exceeds MAX_CHAIN_SYNC_CHUNK",
        ));
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
        block_references: ordered_block_references,
    })
}

/// Validate a deserialized [`ChainSync`] (bounds + strictly ascending references + gap logs).
pub fn validate_parsed_blockchain(cs: &ChainSync) -> Result<(), Error> {
    validate_blockchain_bounds(cs)?;
    validate_references_strictly_ascending_and_log_gaps(cs)?;
    Ok(())
}

/// Deserialize wire bytes and run [`validate_parsed_blockchain`].
pub fn parse_blockchain(buffer: &[u8]) -> Result<ChainSync, Error> {
    let v = buffer.to_vec();
    let cs = ChainSync::deserialize(&v)?;
    validate_parsed_blockchain(&cs)?;
    Ok(cs)
}

/// Reject when payload earliest/latest metadata does not match the reference list ends.
pub fn validate_blockchain_bounds(cs: &ChainSync) -> Result<(), Error> {
    let refs = &cs.block_references;
    if refs.is_empty() {
        if cs.payload_earliest_block_id != cs.payload_latest_block_id
            || cs.payload_earliest_block_hash != cs.payload_latest_block_hash
        {
            warn!(
                "validate_blockchain_bounds: empty refs but earliest {:?}-{:?} != latest {:?}-{:?}",
                cs.payload_earliest_block_id,
                cs.payload_earliest_block_hash.to_hex(),
                cs.payload_latest_block_id,
                cs.payload_latest_block_hash.to_hex()
            );
            return Err(Error::new(
                ErrorKind::InvalidData,
                "empty ChainSync references: earliest/latest metadata must agree",
            ));
        }
        return Ok(());
    }

    let (first_id, first_hash) = &refs[0];
    let (last_id, last_hash) = &refs[refs.len() - 1];

    if *first_id != cs.payload_earliest_block_id || *first_hash != cs.payload_earliest_block_hash {
        warn!(
            "validate_blockchain_bounds: first ref {:?}-{:?} != payload_earliest {:?}-{:?}",
            first_id,
            first_hash.to_hex(),
            cs.payload_earliest_block_id,
            cs.payload_earliest_block_hash.to_hex()
        );
        return Err(Error::new(
            ErrorKind::InvalidData,
            "ChainSync first reference does not match payload_earliest metadata",
        ));
    }

    if *last_id != cs.payload_latest_block_id || *last_hash != cs.payload_latest_block_hash {
        warn!(
            "validate_blockchain_bounds: last ref {:?}-{:?} != payload_latest {:?}-{:?}",
            last_id,
            last_hash.to_hex(),
            cs.payload_latest_block_id,
            cs.payload_latest_block_hash.to_hex()
        );
        return Err(Error::new(
            ErrorKind::InvalidData,
            "ChainSync last reference does not match payload_latest metadata",
        ));
    }

    Ok(())
}

fn validate_references_strictly_ascending_and_log_gaps(cs: &ChainSync) -> Result<(), Error> {
    let refs = &cs.block_references;
    if refs.len() < 2 {
        return Ok(());
    }
    for w in refs.windows(2) {
        let (a_id, a_hash) = w[0];
        let (b_id, b_hash) = w[1];
        if b_id <= a_id {
            warn!(
                "ChainSync references not strictly ascending by block_id: {} -> {}",
                a_id, b_id
            );
            return Err(Error::new(
                ErrorKind::InvalidData,
                "ChainSync block_references must be strictly ascending by block_id",
            ));
        }
        if b_id > a_id.saturating_add(1) {
            warn!(
                "ChainSync gap in block_id sequence: {} ({:?}) -> {} ({:?})",
                a_id,
                a_hash.to_hex(),
                b_id,
                b_hash.to_hex()
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::network::msg::chainsync::{RequestChainSync, SYNC_TYPE_FULL};

    fn sample_header_refs(
        refs: Vec<(BlockId, BlockHash)>,
    ) -> (
        BlockId,
        BlockHash,
        BlockHash,
        BlockId,
        BlockHash,
        BlockId,
        BlockHash,
        BlockId,
        BlockHash,
    ) {
        let earliest = refs.first().map(|r| r.0).unwrap_or(5);
        let earliest_h = refs.first().map(|r| r.1).unwrap_or([10u8; 32]);
        let latest = refs.last().map(|r| r.0).unwrap_or(5);
        let latest_h = refs.last().map(|r| r.1).unwrap_or([10u8; 32]);
        (
            100,
            [1u8; 32],
            [2u8; 32],
            1,
            [3u8; 32],
            earliest,
            earliest_h,
            latest,
            latest_h,
        )
    }

    #[test]
    fn parse_accepts_valid_chunk() {
        let (lid, lh, fk, sa_id, sa_h, pe_id, pe_h, pl_id, pl_h) =
            sample_header_refs(vec![(5, [10u8; 32]), (6, [11u8; 32])]);
        let cs = build_blockchain_response(
            lid, lh, fk, sa_id, sa_h, pe_id, pe_h, pl_id, pl_h, vec![(5, [10u8; 32]), (6, [11u8; 32])],
        )
        .unwrap();
        let buf = cs.serialize();
        let parsed = parse_blockchain(&buf).unwrap();
        assert_eq!(parsed.block_references.len(), 2);
    }

    #[test]
    fn parse_rejects_bounds_mismatch() {
        let cs = build_blockchain_response(
            100,
            [1u8; 32],
            [2u8; 32],
            1,
            [3u8; 32],
            5,
            [10u8; 32],
            6,
            [11u8; 32],
            vec![(5, [10u8; 32]), (6, [99u8; 32])], // last hash wrong vs payload_latest
        )
        .unwrap();
        let buf = cs.serialize();
        assert!(parse_blockchain(&buf).is_err());
    }

    #[test]
    fn parse_rejects_non_ascending_ids() {
        let cs = build_blockchain_response(
            100,
            [1u8; 32],
            [2u8; 32],
            1,
            [3u8; 32],
            5,
            [10u8; 32],
            5,
            [10u8; 32],
            vec![(5, [10u8; 32]), (5, [11u8; 32])],
        )
        .unwrap();
        let buf = cs.serialize();
        assert!(parse_blockchain(&buf).is_err());
    }

    #[test]
    fn build_rejects_too_many_refs() {
        let refs: Vec<_> = (0..MAX_CHAIN_SYNC_CHUNK + 1)
            .map(|i| (i as u64, [i as u8; 32]))
            .collect();
        let r = build_blockchain_response(0, [0; 32], [0; 32], 0, [0; 32], 0, [0; 32], 0, [0; 32], refs);
        assert!(r.is_err());
    }

    #[test]
    fn request_roundtrip_still_ok() {
        let r = RequestChainSync {
            latest_known_block_id: 9,
            latest_known_block_hash: [7u8; 32],
            fork_id: [8u8; 32],
            sync_type: SYNC_TYPE_FULL,
        };
        let b = r.serialize();
        let r2 = RequestChainSync::deserialize(&b).unwrap();
        assert_eq!(r.latest_known_block_id, r2.latest_known_block_id);
        assert_eq!(r.sync_type, r2.sync_type);
    }
}
