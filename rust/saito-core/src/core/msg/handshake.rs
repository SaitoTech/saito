use std::io::{Error, ErrorKind};

use log::{debug, info, trace, warn};

use crate::core::consensus::peers::peer_service::PeerService;
use crate::core::defs::{SaitoHash, SaitoPublicKey, SaitoSignature};
use crate::core::process::version::Version;
use crate::core::util::configuration::Endpoint;
use crate::core::util::serialize::Serialize;

#[derive(Debug)]
pub struct HandshakeChallenge {
    pub challenge: SaitoHash,
}

#[derive(Debug)]
pub struct HandshakeResponse {
    pub public_key: SaitoPublicKey,
    pub signature: SaitoSignature,
    pub is_lite: bool,
    pub block_fetch_url: String,
    pub challenge: SaitoHash,
    pub services: Vec<PeerService>,
    pub wallet_version: Version,
    pub core_version: Version,
    pub endpoint: Endpoint,
}

impl Serialize<Self> for HandshakeChallenge {
    fn serialize(&self) -> Vec<u8> {
        let buffer = [self.challenge.to_vec()].concat();
        return buffer;
    }
    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() < 32 {
            warn!(
                "Deserializing Handshake Challenge, buffer size is :{:?}",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        let mut challenge = HandshakeChallenge { challenge: [0; 32] };
        challenge.challenge = buffer[0..32]
            .to_vec()
            .try_into()
            .or(Err(Error::from(ErrorKind::InvalidInput)))?;

        Ok(challenge)
    }
}

impl Serialize<Self> for HandshakeResponse {
    fn serialize(&self) -> Vec<u8> {
        let services_buffer = PeerService::serialize_services(&self.services);
        let endpoint_buffer = self.endpoint.serialize();
        let buffer = [
            self.core_version.serialize(),
            self.wallet_version.serialize(),
            self.public_key.to_vec(),
            self.signature.to_vec(),
            self.challenge.to_vec(),
            (self.is_lite as u8).to_be_bytes().to_vec(),
            (self.block_fetch_url.len() as u16).to_be_bytes().to_vec(),
            (services_buffer.len() as u16).to_be_bytes().to_vec(),
            (endpoint_buffer.len() as u16).to_be_bytes().to_vec(),
            self.block_fetch_url.as_bytes().to_vec(),
            services_buffer,
            endpoint_buffer,
        ]
        .concat();
        info!("handshake response buffer size : {}", buffer.len());
        buffer
    }
    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        debug!("deserializing handshake buffer : {:?}", buffer.len());

        const MIN_LEN: usize = 144;

        if buffer.len() < MIN_LEN {
            warn!(
                "Deserializing failed for handshake response, buffer size is :{:?}",
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }

        let mut response = HandshakeResponse {
            core_version: Version::deserialize(&buffer[0..4].to_vec())?,
            wallet_version: Version::deserialize(&buffer[4..8].to_vec())?,
            public_key: buffer[8..41]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
            signature: buffer[41..105]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
            challenge: buffer[105..137]
                .to_vec()
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
            is_lite: buffer[137] != 0,
            block_fetch_url: "".to_string(),
            services: vec![],
            endpoint: Default::default(),
        };
        let url_length = u16::from_be_bytes(
            buffer[138..140]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        ) as usize;

        let services_buffer_len = u16::from_be_bytes(
            buffer[140..142]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        ) as usize;

        let endpoint_buffer_len = u16::from_be_bytes(
            buffer[142..144]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        ) as usize;

        // if we detect a block fetch url, we will retrieve it
        if url_length > 0 {
            if buffer.len() < MIN_LEN + url_length {
                warn!(
                    "cannot read block fetch url of size : {:?} from buffer size : {:?}",
                    url_length,
                    buffer.len()
                );
                return Err(Error::from(ErrorKind::InvalidData));
            }
            trace!("reading URL with length : {:?}", url_length);
            let result = String::from_utf8(buffer[MIN_LEN..(MIN_LEN + url_length)].to_vec());
            if result.is_err() {
                warn!(
                    "failed decoding block fetch url. {:?}",
                    result.err().unwrap()
                );
                return Err(Error::from(ErrorKind::InvalidData));
            }

            response.block_fetch_url = result.unwrap();
            trace!("block fetch url read as : {:?}", response.block_fetch_url);
        }
        // if we detect services, we deserialize that too
        if buffer.len() > (MIN_LEN + url_length) {
            trace!("reading peer services");
            let start = MIN_LEN + url_length;
            let end = start + services_buffer_len;
            let service_buffer = buffer[start..end].to_vec();

            let services = PeerService::deserialize_services(service_buffer);
            if services.is_err() {
                let len = buffer.len() - (MIN_LEN + url_length);
                warn!(
                "Deserializing failed for handshake response, remaining buffer of size :{:?} cannot be parsed for peer services", len);
                return Err(Error::from(ErrorKind::InvalidData));
            }
            let services = services.unwrap();
            trace!("{:?} services read from handshake response", services.len());
            response.services = services;
        }

        // if we have endpoint, we deserialize that
        if buffer.len() > MIN_LEN + url_length + services_buffer_len {
            trace!("reading endpoint data");
            let start = MIN_LEN + url_length + services_buffer_len;
            let endpoint_buffer = buffer[start..start + endpoint_buffer_len].to_vec();
            let endpoint = <Endpoint as crate::core::util::serialize::Serialize<_>>::deserialize(
                &endpoint_buffer,
            )?;
            response.endpoint = endpoint;
        }

        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
    use crate::core::process::version::Version;
    use crate::core::util::configuration::Endpoint;
    use crate::core::util::serialize::Serialize;

    #[test]
    fn test_handshake() {
        let crypto = secp256k1::Secp256k1::new();

        let (_secret_key_1, _public_key_1) =
            crypto.generate_keypair(&mut secp256k1::rand::thread_rng());
        let (secret_key_2, public_key_2) =
            crypto.generate_keypair(&mut secp256k1::rand::thread_rng());
        let challenge = HandshakeChallenge {
            challenge: rand::random(),
        };
        let buffer = challenge.serialize();
        assert_eq!(buffer.len(), 32);
        let challenge2 = HandshakeChallenge::deserialize(&buffer).expect("deserialization failed");
        assert_eq!(challenge.challenge, challenge2.challenge);

        let signature = crypto.sign_ecdsa(
            &secp256k1::Message::from_slice(&challenge.challenge).unwrap(),
            &secret_key_2,
        );
        let response = HandshakeResponse {
            public_key: public_key_2.serialize(),
            signature: signature.serialize_compact(),
            challenge: rand::random(),
            is_lite: false,
            block_fetch_url: "http://url/test2".to_string(),
            services: vec![],
            wallet_version: Version {
                major: 1,
                minor: 2,
                patch: 3,
            },
            core_version: Version::new(10, 20, 30),
            endpoint: Endpoint {
                host: "localhost".to_string(),
                port: 8080,
                protocol: "http".to_string(),
            },
        };
        let buffer = response.serialize();
        assert_eq!(buffer.len(), 179);
        let response2 = HandshakeResponse::deserialize(&buffer).expect("deserialization failed");
        assert_eq!(response.challenge, response2.challenge);
        assert_eq!(response.public_key, response2.public_key);
        assert_eq!(response.block_fetch_url, response2.block_fetch_url);

        assert_eq!(response.signature, response2.signature);
        assert_eq!(response.wallet_version, response2.wallet_version);
        assert_eq!(response.core_version, response2.core_version);

        assert_eq!(response.endpoint.host, response2.endpoint.host);
        assert_eq!(response.endpoint.port, response2.endpoint.port);
        assert_eq!(response.endpoint.protocol, response2.endpoint.protocol);
    }
}
