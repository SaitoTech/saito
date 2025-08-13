use crate::core::defs::SaitoHash;
use std::io::{Error, ErrorKind};

use crate::core::util::serialize::Serialize;

#[derive(Debug)]
pub struct BlockchainRequest {
    pub(crate) latest_block_id: u64,
    pub(crate) latest_block_hash: SaitoHash,
    pub(crate) fork_id: SaitoHash,
}

impl Serialize<Self> for BlockchainRequest {
    fn serialize(&self) -> Vec<u8> {
        [
            self.latest_block_id.to_be_bytes().as_slice(),
            self.latest_block_hash.as_slice(),
            self.fork_id.as_slice(),
        ]
        .concat()
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != 72 {
            return Err(Error::from(ErrorKind::InvalidData));
        }
        Ok(BlockchainRequest {
            latest_block_id: u64::from_be_bytes(buffer[0..8].to_vec().try_into().unwrap()),
            latest_block_hash: buffer[8..40].to_vec().try_into().unwrap(),
            fork_id: buffer[40..72].to_vec().try_into().unwrap(),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::core::msg::block_request::BlockchainRequest;
    use crate::core::util::crypto::generate_random_bytes;
    use crate::core::util::serialize::Serialize;

    #[tokio::test]
    #[serial_test::serial]
    async fn test_serialize_with_full_fork_id() {
        let request = BlockchainRequest {
            latest_block_id: 10,
            latest_block_hash: generate_random_bytes(32).await.try_into().unwrap(),
            fork_id: generate_random_bytes(32).await.try_into().unwrap(),
        };
        let buffer = request.serialize();
        assert_eq!(buffer.len(), 72);
        let new_request = BlockchainRequest::deserialize(&buffer);
        assert!(new_request.is_ok());
        let new_request = new_request.unwrap();
        assert_eq!(request.latest_block_id, new_request.latest_block_id);
        assert_eq!(request.latest_block_hash, new_request.latest_block_hash);
        assert_eq!(request.fork_id, new_request.fork_id);
    }
}
