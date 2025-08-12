use std::convert::TryInto;

use serde::{Deserialize, Serialize};

use crate::core::defs::{SaitoHash, SaitoPublicKey};
use crate::core::util::crypto::hash;

#[serde_with::serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoldenTicket {
    pub target: SaitoHash,
    pub(crate) random: SaitoHash,
    #[serde_as(as = "[_; 33]")]
    pub(crate) public_key: SaitoPublicKey,
}

impl GoldenTicket {
    #[allow(clippy::new_without_default)]

    pub fn new(target: SaitoHash, random: SaitoHash, public_key: SaitoPublicKey) -> Self {
        return Self {
            target,
            random,
            public_key,
        };
    }

    pub fn create(
        previous_block_hash: SaitoHash,
        random_bytes: SaitoHash,
        public_key: SaitoPublicKey,
    ) -> GoldenTicket {
        GoldenTicket::new(previous_block_hash, random_bytes, public_key)
    }

    pub fn deserialize_from_net(bytes: &Vec<u8>) -> GoldenTicket {
        assert_eq!(bytes.len(), 97);
        let target: SaitoHash = bytes[0..32].try_into().unwrap();
        let random: SaitoHash = bytes[32..64].try_into().unwrap();
        let public_key: SaitoPublicKey = bytes[64..97].try_into().unwrap();
        GoldenTicket::new(target, random, public_key)
    }

    pub fn serialize_for_net(&self) -> Vec<u8> {
        let vbytes: Vec<u8> = [
            self.target.as_slice(),
            self.random.as_slice(),
            self.public_key.as_slice(),
        ]
        .concat();
        vbytes
    }

    pub fn validate(&self, difficulty: u64) -> bool {
        let solution_hash = hash(&self.serialize_for_net());

        GoldenTicket::validate_hashing_difficulty(&solution_hash, difficulty)
    }

    pub fn validate_hashing_difficulty(solution_hash: &SaitoHash, difficulty: u64) -> bool {
        let solution = primitive_types::U256::from_big_endian(solution_hash);

        solution.leading_zeros() >= difficulty as u32
    }
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::golden_ticket::GoldenTicket;
    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey};
    use crate::core::util::crypto::{generate_keys, generate_random_bytes, hash};
    use log::info;

    #[test]
    #[serial_test::serial]
    fn golden_ticket_validate_hashing_difficulty() {
        let hash: SaitoHash = [0u8; 32];
        let mut hash2: SaitoHash = [255u8; 32];

        assert!(GoldenTicket::validate_hashing_difficulty(&hash, 0));
        assert!(GoldenTicket::validate_hashing_difficulty(&hash, 10));
        assert!(GoldenTicket::validate_hashing_difficulty(&hash, 256));
        assert_eq!(
            GoldenTicket::validate_hashing_difficulty(&hash, 1000000),
            false
        );

        assert!(GoldenTicket::validate_hashing_difficulty(&hash2, 0));
        assert_eq!(GoldenTicket::validate_hashing_difficulty(&hash2, 10), false);
        assert_eq!(
            GoldenTicket::validate_hashing_difficulty(&hash2, 256),
            false
        );

        hash2[0] = 15u8;

        assert!(GoldenTicket::validate_hashing_difficulty(&hash2, 3));
        assert!(GoldenTicket::validate_hashing_difficulty(&hash2, 4));
        assert_eq!(GoldenTicket::validate_hashing_difficulty(&hash2, 5), false);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn golden_ticket_extremes_test() {
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);

        let random = hash(&generate_random_bytes(32).await);
        let target = hash(random.as_ref());
        let public_key = wallet.public_key;

        let gt = GoldenTicket::create(target, random, public_key);

        assert!(gt.validate(0));
        assert!(!gt.validate(256));
    }
    #[test]
    #[serial_test::serial]
    fn gt_against_slr() {
        let buffer = hex::decode("844702489d49c7fb2334005b903580c7a48fe81121ff16ee6d1a528ad32f235e03bf1a4714cfc7ae33d3f6e860c23191ddea07bcb1bfa6c85bc124151ad8d4ce03cb14a56ddc769932baba62c22773aaf6d26d799b548c8b8f654fb92d25ce7610").unwrap();
        assert_eq!(buffer.len(), 97);

        let result = GoldenTicket::deserialize_from_net(&buffer);
        assert_eq!(
            result.target.to_hex(),
            "844702489d49c7fb2334005b903580c7a48fe81121ff16ee6d1a528ad32f235e"
        );
        assert_eq!(
            result.random.to_hex(),
            "03bf1a4714cfc7ae33d3f6e860c23191ddea07bcb1bfa6c85bc124151ad8d4ce"
        );
        assert_eq!(
            result.public_key.to_hex(),
            "03cb14a56ddc769932baba62c22773aaf6d26d799b548c8b8f654fb92d25ce7610"
        );

        assert!(result.validate(0));
    }

    #[test]
    #[serial_test::serial]
    fn gt_against_slr_2() {
        // pretty_env_logger::init();

        assert_eq!(primitive_types::U256::one().leading_zeros(), 255);
        assert_eq!(primitive_types::U256::zero().leading_zeros(), 256);
        let sol =
            SaitoHash::from_hex("4523d0eb05233434b42de74a99049decb6c4347da2e7cde9fb49330e905da1e2")
                .unwrap();
        info!("sss = {:?}", sol);
        assert_eq!(
            primitive_types::U256::from_big_endian(sol.as_ref()).leading_zeros(),
            1
        );

        let gt = GoldenTicket {
            target: SaitoHash::from_hex(
                "6bc717fdd325b39383923e21c00aedf04efbc2d8ae6ba092e86b984ba45daf5f",
            )
            .unwrap(),
            random: SaitoHash::from_hex(
                "e41eed52c0d1b261654bd7bc7c15996276714e79bf837e129b022f9c04a97e49",
            )
            .unwrap(),
            public_key: SaitoPublicKey::from_hex(
                "02262b7491f6599ed3f4f60315d9345e9ef02767973663b9764b52842306da461c",
            )
            .unwrap(),
        };

        let result = gt.validate(1);

        assert!(result);
    }
}
