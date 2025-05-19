use crate::core::defs::SaitoHash;

//
// This is an index with shorthand information on the block_ids and hashes of the blocks
// in the longest-chain.
//
// The BlockRing is a fixed size Vector which can be made contiguous and theoretically
// made available for fast-access through a slice with the same lifetime as the vector
// itself.
//
#[derive(Debug, Default)]
pub struct RingItem {
    pub lc_pos: Option<usize>,
    pub block_hashes: Vec<SaitoHash>,
    pub block_ids: Vec<u64>,
}

impl RingItem {
    pub fn add_block(&mut self, block_id: u64, hash: SaitoHash) {
        self.block_hashes.push(hash);
        self.block_ids.push(block_id);
    }

    pub fn contains_block_hash(&self, hash: SaitoHash) -> bool {
        self.block_hashes.iter().any(|&i| i == hash)
    }

    pub fn delete_block(&mut self, block_id: u64, hash: SaitoHash) {
        let mut new_block_hashes: Vec<SaitoHash> = vec![];
        let mut new_block_ids: Vec<u64> = vec![];
        let mut index_loop = 0;
        let mut new_lc_pos = Some(0);

        for i in 0..self.block_ids.len() {
            if self.block_ids[i] == block_id && self.block_hashes[i] == hash {
            } else {
                new_block_hashes.push(self.block_hashes[i]);
                new_block_ids.push(self.block_ids[i]);
                if self.lc_pos == Some(i) {
                    new_lc_pos = Some(index_loop);
                }
                index_loop += 1;
            }
        }

        self.block_hashes = new_block_hashes;
        self.block_ids = new_block_ids;
        self.lc_pos = new_lc_pos;
    }

    pub fn on_chain_reorganization(&mut self, hash: SaitoHash, lc: bool) {
        if !lc {
            self.lc_pos = None;
        } else {
            self.lc_pos = self.block_hashes.iter().position(|b_hash| b_hash == &hash);
        }
    }
}

#[cfg(test)]
mod tests {

    use crate::core::consensus::block::Block;
    use crate::core::consensus::ringitem::RingItem;

    #[test]
    fn ringitem_new_test() {
        let ringitem = RingItem::default();
        assert_eq!(ringitem.block_hashes.len() as u64, 0);
        assert_eq!(ringitem.block_ids.len() as u64, 0);
        assert_eq!(ringitem.lc_pos, None);
    }

    #[test]
    fn ringitem_add_and_delete_block() {
        let mut ringitem = RingItem::default();
        let mut block = Block::new();
        block.generate_hash();
        let block_id = block.id;
        let block_hash = block.hash;

        assert_eq!(ringitem.contains_block_hash(block_hash), false);
        assert_eq!(ringitem.block_hashes.len() as u64, 0);
        assert_eq!(ringitem.block_ids.len() as u64, 0);

        ringitem.add_block(block.id, block.hash);

        assert_eq!(ringitem.contains_block_hash(block_hash), true);
        assert_eq!(ringitem.block_hashes.len() as u64, 1);
        assert_eq!(ringitem.block_ids.len() as u64, 1);

        ringitem.delete_block(block_id, block_hash);

        assert_eq!(ringitem.contains_block_hash(block_hash), false);
        assert_eq!(ringitem.block_hashes.len() as u64, 0);
        assert_eq!(ringitem.block_ids.len() as u64, 0);
    }
}
