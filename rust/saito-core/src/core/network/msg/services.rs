use crate::core::network::service::Service;
use crate::core::util::serialize::Serialize;
use log::warn;
use std::io::{Error, ErrorKind};

#[derive(Debug)]
pub struct RequestServices {}

#[derive(Debug)]
pub struct Services {
    pub services: Vec<Service>,
}

impl Serialize<Self> for RequestServices {
    fn serialize(&self) -> Vec<u8> {
        vec![]
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if !buffer.is_empty() {
            warn!(
                "Deserializing RequestServices failed, expected empty buffer but got {:?}",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        Ok(RequestServices {})
    }
}

impl Serialize<Self> for Services {
    fn serialize(&self) -> Vec<u8> {
        Service::serialize(&self.services)
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        let services = Service::deserialize(buffer.clone())?;

        Ok(Services { services })
    }
}
