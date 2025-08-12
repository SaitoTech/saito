use crate::core::defs::{PrintForLog, SaitoHash, Timestamp};
use std::fmt::{Debug, Formatter};

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
    pub fn deserialize(buffer: Vec<u8>) -> GhostChainSync {
        let start: SaitoHash = buffer[0..32].to_vec().try_into().unwrap();
        let count: usize = u32::from_be_bytes(buffer[32..36].try_into().unwrap()) as usize;
        let mut prehashes: Vec<SaitoHash> = vec![];
        let mut previous_block_hashes = vec![];
        let mut block_ids = vec![];
        let mut block_ts = vec![];
        let mut txs = vec![];
        let mut gts = vec![];

        let buffer = &buffer[36..buffer.len()];
        let buf = buffer[0..(count * 32)].to_vec();
        for i in 0..count {
            prehashes.push(buf[i * 32..(i + 1) * 32].try_into().unwrap());
        }
        let buf = buffer[(count * 32)..(count * 64)].to_vec();
        for i in 0..count {
            previous_block_hashes.push(buf[i * 32..(i + 1) * 32].try_into().unwrap());
        }
        let buf = buffer[(count * 64)..(count * 72)].to_vec();
        for i in 0..count {
            block_ids.push(u64::from_be_bytes(
                buf[i * 8..(i + 1) * 8].try_into().unwrap(),
            ));
        }
        let buf = buffer[(count * 72)..(count * 80)].to_vec();
        for i in 0..count {
            block_ts.push(Timestamp::from_be_bytes(
                buf[i * 8..(i + 1) * 8].try_into().unwrap(),
            ));
        }
        let buf = buffer[(count * 80)..(count * 81)].to_vec();
        for i in 0..count {
            txs.push(buf[i] != 0);
        }
        let buf = buffer[(count * 81)..(count * 82)].to_vec();
        for i in 0..count {
            gts.push(buf[i] != 0);
        }

        GhostChainSync {
            start,
            prehashes,
            previous_block_hashes,
            block_ids,
            block_ts,
            txs,
            gts,
        }
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
    use crate::core::msg::ghost_chain_sync::GhostChainSync;

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
        let chain2 = GhostChainSync::deserialize(buffer);
        assert_eq!(chain.start, chain2.start);
        assert_eq!(chain.prehashes, chain2.prehashes);
        assert_eq!(chain.previous_block_hashes, chain2.previous_block_hashes);
        assert_eq!(chain.block_ids, chain2.block_ids);
        assert_eq!(chain.block_ts, chain2.block_ts);
        assert_eq!(chain.txs, chain2.txs);
        assert_eq!(chain.gts, chain2.gts);
    }
}
