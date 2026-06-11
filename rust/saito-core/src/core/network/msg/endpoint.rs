use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

#[derive(Debug)]
pub struct RequestEndpoint {}

impl Serialize<Self> for RequestEndpoint {
    fn serialize(&self) -> Vec<u8> {
        vec![]
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if !buffer.is_empty() {
            warn!(
                "Deserializing RequestEndpoint failed, expected empty buffer but got {:?}",
                buffer.len()
            );

            return Err(Error::from(ErrorKind::InvalidData));
        }

        Ok(RequestEndpoint {})
    }
}
