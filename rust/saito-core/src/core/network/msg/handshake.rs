use crate::core::defs::{SaitoHash, SaitoPublicKey, SaitoSignature};
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

const REQUEST_HANDSHAKE_SIZE: usize = 32;
const HANDSHAKE_SIZE: usize = 129;

#[derive(Debug)]
pub struct RequestHandshake {
    pub nonce: SaitoHash,
}

#[derive(Debug)]
pub struct Handshake {
    pub public_key: SaitoPublicKey,
    pub signature: SaitoSignature,
    pub counter_nonce: SaitoHash,
}

impl Serialize<Self> for RequestHandshake {
    fn serialize(&self) -> Vec<u8> {
        self.nonce.to_vec()
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != REQUEST_HANDSHAKE_SIZE {
            warn!(
                "Deserializing RequestHandshake failed, buffer size is {:?}",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        Ok(RequestHandshake {
            nonce: buffer[0..32]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        })
    }
}

impl Serialize<Self> for Handshake {
    fn serialize(&self) -> Vec<u8> {
        [
            self.public_key.to_vec(),
            self.signature.to_vec(),
            self.counter_nonce.to_vec(),
        ]
        .concat()
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != HANDSHAKE_SIZE {
            warn!(
                "Deserializing Handshake failed, buffer size is {:?}",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        Ok(Handshake {
            public_key: buffer[0..33]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,

            signature: buffer[33..97]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,

            counter_nonce: buffer[97..129]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        })
    }
}
