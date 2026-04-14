use crate::core::defs::{PrintForLog, SaitoHash, Timestamp};
use log::warn;
use std::fmt::{Debug, Formatter};
use std::io::{Error, ErrorKind};

pub struct GhostChainSync {
    pub start: SaitoHash,
    pub prehashes: Vec<SaitoHash>,
    pub previous_block_hashes: Vec<SaitoHash>,
    pub block_ids: Vec<u64>,
    pub block_ts: Vec<Timestamp>,
    pub txs: Vec<bool>,
    pub gts: Vec<bool>,
}

impl GhostChainSync {
    pub fn serialize(&self) -> Vec<u8> {
        [
            self.start.as_slice(),
            (self.prehashes.len() as u32).to_be_bytes().as_slice(),
            self.prehashes.concat().as_slice(),
            self.previous_block_hashes.concat().as_slice(),
            self.block_ids
                .iter()
                .map(|id| id.to_be_bytes().to_vec())
                .collect::<Vec<Vec<u8>>>()
                .concat()
                .as_slice(),
            self.block_ts
                .iter()
                .map(|id| id.to_be_bytes().to_vec())
                .collect::<Vec<Vec<u8>>>()
                .concat()
                .as_slice(),
            self.txs
                .iter()
                .map(|id| (*id as u8).to_be_bytes().to_vec())
                .collect::<Vec<Vec<u8>>>()
                .concat()
                .as_slice(),
            self.gts
                .iter()
                .map(|id| (*id as u8).to_be_bytes().to_vec())
                .collect::<Vec<Vec<u8>>>()
                .concat()
                .as_slice(),
        ]
        .concat()
    }
    pub fn deserialize(buffer: Vec<u8>) -> Result<GhostChainSync, Error> {
        if buffer.len() < 36 {
            warn!("ghost chain sync buffer too short: {} bytes", buffer.len());
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let start: SaitoHash = buffer[0..32]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let count: usize = u32::from_be_bytes(
            buffer[32..36]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidData)))?,
        ) as usize;
        let required = count
            .checked_mul(82)
            .ok_or(Error::from(ErrorKind::InvalidData))?;
        if buffer.len() < 36 + required {
            warn!(
                "ghost chain sync buffer too short for {} entries: {} bytes, need {}",
                count,
                buffer.len(),
                36 + required
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let mut prehashes: Vec<SaitoHash> = vec![];
        let mut previous_block_hashes = vec![];
        let mut block_ids = vec![];
        let mut block_ts = vec![];
        let mut txs = vec![];
        let mut gts = vec![];

        let tail = &buffer[36..];
        for i in 0..count {
            prehashes.push(
                tail[i * 32..(i + 1) * 32]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            );
        }
        for i in 0..count {
            previous_block_hashes.push(
                tail[(count * 32) + i * 32..(count * 32) + (i + 1) * 32]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            );
        }
        for i in 0..count {
            let offset = count * 64 + i * 8;
            block_ids.push(u64::from_be_bytes(
                tail[offset..offset + 8]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ));
        }
        for i in 0..count {
            let offset = count * 72 + i * 8;
            block_ts.push(Timestamp::from_be_bytes(
                tail[offset..offset + 8]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidData)))?,
            ));
        }
        for i in 0..count {
            txs.push(tail[count * 80 + i] != 0);
        }
        for i in 0..count {
            gts.push(tail[count * 81 + i] != 0);
        }

        Ok(GhostChainSync {
            start,
            prehashes,
            previous_block_hashes,
            block_ids,
            block_ts,
            txs,
            gts,
        })
    }
}

impl Debug for GhostChainSync {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GhostChainSync")
            .field("start", &self.start.to_hex())
            .field(
                "prehashes",
                &self
                    .prehashes
                    .iter()
                    .map(|h| h.to_hex())
                    .collect::<Vec<String>>(),
            )
            .field(
                "prev_block_hashes",
                &self
                    .previous_block_hashes
                    .iter()
                    .map(|h| h.to_hex())
                    .collect::<Vec<String>>(),
            )
            .field("block_ids", &self.block_ids)
            .field("block_ts", &self.block_ts)
            .field("txs", &self.txs)
            .field("gts", &self.gts)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use crate::core::network::msg::ghost_chain_sync::GhostChainSync;

    #[test]
    fn serialize_test() {
        let chain = GhostChainSync {
            start: [1; 32],
            prehashes: vec![[2; 32], [3; 32]],
            previous_block_hashes: vec![[4; 32], [5; 32]],
            block_ids: vec![10, 20],
            block_ts: vec![100, 200],
            txs: vec![false, true],
            gts: vec![true, false],
        };
        let buffer = chain.serialize();
        let chain2 = GhostChainSync::deserialize(buffer).expect("deserialization failed");
        assert_eq!(chain.start, chain2.start);
        assert_eq!(chain.prehashes, chain2.prehashes);
        assert_eq!(chain.previous_block_hashes, chain2.previous_block_hashes);
        assert_eq!(chain.block_ids, chain2.block_ids);
        assert_eq!(chain.block_ts, chain2.block_ts);
        assert_eq!(chain.txs, chain2.txs);
        assert_eq!(chain.gts, chain2.gts);
    }

    // Item 25: reject buffers too short to contain the 36-byte header.
    #[test]
    fn deserialize_rejects_empty_buffer() {
        assert!(GhostChainSync::deserialize(vec![]).is_err());
    }

    #[test]
    fn deserialize_rejects_short_header() {
        assert!(GhostChainSync::deserialize(vec![0u8; 35]).is_err());
    }

    // Item 25: reject buffers where the entry count exceeds available data.
    #[test]
    fn deserialize_rejects_count_larger_than_remaining_bytes() {
        // header: 36 bytes, count = 1, so requires 36 + 82 = 118 bytes total.
        // Provide exactly 36 bytes — too short for 1 entry.
        let mut buf = vec![0u8; 36];
        buf[32..36].copy_from_slice(&1u32.to_be_bytes()); // count = 1
        assert!(GhostChainSync::deserialize(buf).is_err());
    }

    // Item 25: u32::MAX count causes checked_mul to overflow and returns Err.
    #[test]
    fn deserialize_rejects_overflow_count() {
        let mut buf = vec![0u8; 36];
        buf[32..36].copy_from_slice(&u32::MAX.to_be_bytes());
        assert!(GhostChainSync::deserialize(buf).is_err());
    }
}
