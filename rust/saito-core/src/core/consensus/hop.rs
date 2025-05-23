use std::fmt::Display;
use std::io::{Error, ErrorKind};

use serde::{Deserialize, Serialize};

use crate::core::consensus::transaction::Transaction;
use crate::core::defs::{PrintForLog, SaitoPrivateKey, SaitoPublicKey, SaitoSignature};
use crate::core::util::crypto::sign;

pub const HOP_SIZE: usize = 130;

#[serde_with::serde_as]
#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct Hop {
    #[serde_as(as = "[_; 33]")]
    pub from: SaitoPublicKey,
    #[serde_as(as = "[_; 33]")]
    pub to: SaitoPublicKey,
    #[serde_as(as = "[_; 64]")]
    pub sig: SaitoSignature,
}
impl Display for Hop {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        writeln!(f, "Hop : {{")?;
        writeln!(f, " from : {}", self.from.to_base58())?;
        writeln!(f, " to : {}", self.to.to_base58())?;
        writeln!(f, " sig: {}", self.sig.to_hex())?;
        writeln!(f, "}}")
    }
}
impl Default for Hop {
    fn default() -> Self {
        Hop {
            from: [0; 33],
            to: [0; 33],
            sig: [0; 64],
        }
    }
}

impl Hop {
    pub fn generate(
        my_private_key: &SaitoPrivateKey,
        my_public_key: &SaitoPublicKey,
        to_public_key: &SaitoPublicKey,
        tx: &Transaction,
    ) -> Hop {
        let mut hop = Hop::default();

        // msg-to-sign is hash of transaction signature + next_peer.public_key
        let buffer: Vec<u8> = [tx.signature.as_slice(), to_public_key.as_slice()].concat();

        hop.from = my_public_key.clone();
        hop.to = to_public_key.clone();
        hop.sig = sign(buffer.as_slice(), &my_private_key);

        hop
    }

    pub fn deserialize_from_net(bytes: &Vec<u8>) -> Result<Hop, Error> {
        if bytes.len() != HOP_SIZE {
            return Err(Error::from(ErrorKind::InvalidInput));
        }
        let from: SaitoPublicKey = bytes[..33]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let to: SaitoPublicKey = bytes[33..66]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;
        let sig: SaitoSignature = bytes[66..130]
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidData)))?;

        let mut hop = Hop::default();
        hop.from = from;
        hop.to = to;
        hop.sig = sig;

        Ok(hop)
    }

    pub fn serialize_for_net(&self) -> Vec<u8> {
        let vbytes: Vec<u8> = [
            self.from.as_slice(),
            self.to.as_slice(),
            self.sig.as_slice(),
        ]
        .concat();
        // vbytes.extend(&self.from);
        // vbytes.extend(&self.to);
        // vbytes.extend(&self.sig);
        vbytes
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio::sync::RwLock;

    use crate::core::consensus::hop::Hop;
    use crate::core::consensus::wallet::Wallet;
    use crate::core::defs::SaitoPublicKey;
    use crate::core::util::crypto::{generate_keys, verify};

    use super::*;

    #[test]
    fn hop_new_test() {
        let hop = Hop::default();
        assert_eq!(hop.from, [0; 33]);
        assert_eq!(hop.to, [0; 33]);
        assert_eq!(hop.sig, [0; 64]);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn generate_test() {
        let keys = generate_keys();
        let wallet = Arc::new(RwLock::new(Wallet::new(keys.1, keys.0)));
        let sender_public_key: SaitoPublicKey;

        {
            let wallet = wallet.read().await;

            sender_public_key = wallet.public_key;
        }

        let tx = Transaction::default();
        let (receiver_public_key, _receiver_private_key) = generate_keys();

        let wallet = wallet.read().await;
        let hop = Hop::generate(
            &wallet.private_key,
            &wallet.public_key,
            &receiver_public_key,
            &tx,
        );

        assert_eq!(hop.from, sender_public_key);
        assert_eq!(hop.to, receiver_public_key);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn serialize_and_deserialize_test() {
        let keys = generate_keys();
        let wallet = Arc::new(RwLock::new(Wallet::new(keys.1, keys.0)));
        let mut tx = Transaction::default();
        {
            let wallet = wallet.read().await;
            tx.sign(&wallet.private_key);
        }
        let (receiver_public_key, _receiver_private_key) = generate_keys();

        let wallet = wallet.read().await;
        let hop = Hop::generate(
            &wallet.private_key,
            &wallet.public_key,
            &receiver_public_key,
            &tx,
        );

        let hop2 = Hop::deserialize_from_net(&hop.serialize_for_net()).unwrap();

        assert_eq!(hop.from, hop2.from);
        assert_eq!(hop.to, hop2.to);
        assert_eq!(hop.sig, hop2.sig);

        let mut buffer = vec![];
        buffer.extend(tx.signature.to_vec());
        buffer.extend(hop.to.to_vec());
        let result = verify(buffer.as_slice(), &hop.sig, &hop.from);
        assert!(result);

        let result = Hop::deserialize_from_net(&vec![]);
        assert!(result.is_err());
    }
}
