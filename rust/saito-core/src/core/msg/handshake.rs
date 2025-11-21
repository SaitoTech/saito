use std::io::{Error, ErrorKind};

use log::{debug, info, trace, warn};

use crate::core::consensus::peers::peer_service::PeerService;
use crate::core::defs::{SaitoHash, SaitoPublicKey, SaitoSignature, Timestamp};
use crate::core::process::version::Version;
use crate::core::util::configuration::Endpoint;
use crate::core::util::serialize::Serialize;

const HANDSHAKE_CHALLENGE_SIZE: usize = 32;
const HANDSHAKE_RESPONSE_MIN_SIZE: usize = 152; // Minimum size of the handshake response buffer

#[derive(Debug)]
pub struct HandshakeChallenge {
    pub challenge: SaitoHash,
}

#[derive(Debug, Clone)]
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
    pub timestamp: Timestamp,
}

impl Serialize<Self> for HandshakeChallenge {
    fn serialize(&self) -> Vec<u8> {
        let buffer = [self.challenge.to_vec()].concat();
        return buffer;
    }
    fn deserialize(buffer: &Vec<u8>) -> Result<Self, Error> {
        if buffer.len() != HANDSHAKE_CHALLENGE_SIZE {
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
            self.timestamp.to_be_bytes().to_vec(),
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

        if buffer.len() < HANDSHAKE_RESPONSE_MIN_SIZE {
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
            timestamp: Timestamp::from_be_bytes(
                buffer[137..145]
                    .try_into()
                    .or(Err(Error::from(ErrorKind::InvalidInput)))?,
            ),
            is_lite: buffer[145] != 0,
            block_fetch_url: "".to_string(),
            services: vec![],
            endpoint: Default::default(),
        };
        if response.signature == [0; 64] {
            warn!("Handshake response signature is empty, this is likely an error");
            return Err(Error::from(ErrorKind::InvalidData));
        }
        let url_length = u16::from_be_bytes(
            buffer[146..148]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        ) as usize;

        let services_buffer_len = u16::from_be_bytes(
            buffer[148..150]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        ) as usize;

        let endpoint_buffer_len = u16::from_be_bytes(
            buffer[150..152]
                .try_into()
                .or(Err(Error::from(ErrorKind::InvalidInput)))?,
        ) as usize;

        // if we detect a block fetch url, we will retrieve it
        if buffer.len() < HANDSHAKE_RESPONSE_MIN_SIZE + url_length {
            warn!(
                "cannot read block fetch url of size : {:?} from buffer size : {:?}",
                url_length,
                buffer.len()
            );
            return Err(Error::from(ErrorKind::InvalidData));
        }
        trace!("reading URL with length : {:?}", url_length);
        response.block_fetch_url = String::from_utf8(
            buffer
                .get(HANDSHAKE_RESPONSE_MIN_SIZE..(HANDSHAKE_RESPONSE_MIN_SIZE + url_length))
                .ok_or(Error::other("couldn't read url buffer"))?
                .to_vec(),
        )
        .map_err(|err| {
            warn!("failed decoding block fetch url. {:?}", err);
            Error::from(ErrorKind::InvalidData)
        })?;

        trace!("block fetch url read as : {:?}", response.block_fetch_url);
        // if we detect services, we deserialize that too
        if buffer.len() > (HANDSHAKE_RESPONSE_MIN_SIZE + url_length) {
            trace!("reading peer services");
            let start = HANDSHAKE_RESPONSE_MIN_SIZE + url_length;
            let end = start + services_buffer_len;
            let service_buffer = buffer
                .get(start..end)
                .ok_or(Error::other("couldn't read peer services buffer"))?
                .to_vec();

            let services = PeerService::deserialize_services(service_buffer).map_err(|err| {
                let len = buffer.len() - (HANDSHAKE_RESPONSE_MIN_SIZE + url_length);
                warn!(
                    "Deserializing failed for handshake response, remaining buffer of size :{:?} cannot be parsed for peer services", len);
                warn!("failed deserializing peer services. {:?}", err);
                Error::from(ErrorKind::InvalidData)
            })?;
            trace!("{:?} services read from handshake response", services.len());
            response.services = services;
        }

        // if we have endpoint, we deserialize that
        if buffer.len() > HANDSHAKE_RESPONSE_MIN_SIZE + url_length + services_buffer_len {
            trace!("reading endpoint data");
            let start = HANDSHAKE_RESPONSE_MIN_SIZE + url_length + services_buffer_len;
            let endpoint_buffer = buffer
                .get(start..start + endpoint_buffer_len)
                .ok_or(Error::other("failed reading endpoint buffer"))?
                .to_vec();
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

        let result = HandshakeChallenge::deserialize(&vec![0; 31]);
        assert!(
            result.is_err(),
            "Deserialization should fail for invalid buffer length"
        );

        let result = HandshakeChallenge::deserialize(&vec![0; 33]);
        assert!(
            result.is_err(),
            "Deserialization should fail for invalid buffer length"
        );

        let result = HandshakeChallenge::deserialize(&vec![0; 32]);
        assert!(
            result.is_ok(),
            "Deserialization should pass for valid buffer length"
        );

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
            timestamp: 0,
        };
        let buffer = response.serialize();
        assert_eq!(buffer.len(), 187);
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

        let response = HandshakeResponse::deserialize(&vec![0; 151]);
        assert!(
            response.is_err(),
            "Deserialization should fail for invalid buffer length"
        );
        let response = HandshakeResponse::deserialize(&vec![0; 152]);
        assert!(
            response.is_err(),
            "Deserialization should fail for invalid buffer content"
        );
        let response = HandshakeResponse::deserialize(&vec![0; 153]);
        assert!(
            response.is_err(),
            "Deserialization should fail for invalid buffer content"
        );
        let response = HandshakeResponse::deserialize(&vec![0; 187]);
        assert!(
            response.is_err(),
            "Deserialization should fail for invalid buffer content"
        );
    }
}
