use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
use crate::core::routing::peers::peer_service::PeerService;
use crate::core::util::configuration::{Configuration, Endpoint};
use crate::core::util::crypto::{generate_random_bytes, hash, sign, verify};
use log::{info, warn};
use std::io::{Error, ErrorKind};

#[derive(Debug, Clone)]
pub struct NetworkPeer {
    pub challenge: Option<SaitoHash>,
    pub response: Option<HandshakeResponse>,
    pub public_key: Option<SaitoPublicKey>,
    pub url: Option<String>,
    pub ip: Option<String>,
}

impl NetworkPeer {
    pub fn new(url: Option<String>) -> Self {
        Self {
            challenge: None,
            response: None,
            public_key: None,
            url,
            ip: None,
        }
    }
    pub async fn get_handshake_challenge_buffer(&mut self) -> HandshakeChallenge {
        let challenge = HandshakeChallenge {
            challenge: hash(&generate_random_bytes(32).await),
        };
        self.challenge = Some(challenge.challenge);
        challenge
    }
    pub async fn process_handshake_challenge(
        &mut self,
        challenge: &HandshakeChallenge,
        current_time: Timestamp,
        services: &Vec<PeerService>,
        wallet: &Wallet,
        configs: &(dyn Configuration + Send + Sync),
    ) -> Result<HandshakeResponse, Error> {
        let block_fetch_url;
        let is_lite;
        let endpoint;
        {
            if let Some(config) = configs.get_server_configs() {
                endpoint = config.endpoint.clone();
            } else {
                endpoint = Endpoint::default();
            }
            is_lite = configs.is_spv_mode();
            if is_lite {
                block_fetch_url = "".to_string();
            } else {
                block_fetch_url = configs.get_block_fetch_url();
            }
        }

        let response = HandshakeResponse {
            public_key: wallet.public_key,
            signature: sign(challenge.challenge.as_slice(), &wallet.private_key),
            challenge: hash(&generate_random_bytes(32).await),
            is_lite,
            block_fetch_url,
            services: services.clone(),
            wallet_version: wallet.wallet_version,
            core_version: wallet.core_version,
            endpoint: endpoint.clone(),
            timestamp: current_time,
        };
        self.challenge = Some(response.challenge);

        Ok(response)
    }
    pub fn process_handshake_response(
        &mut self,
        response: HandshakeResponse,
        current_time: Timestamp,
        services: &Vec<PeerService>,
        // io_handler: &(dyn InterfaceIO + Send + Sync),
        wallet: &Wallet,
        configs: &(dyn Configuration + Send + Sync),
    ) -> Result<Option<HandshakeResponse>, Error> {
        if !response.core_version.is_set() {
            // debug!(
            //     "core version is not set in handshake response. expected : {:?}",
            //     wallet.core_version
            // );
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        if self.challenge.is_none() {
            warn!(
                "we don't have a challenge to verify for peer : {:?}",
                response.public_key.to_base58()
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        }
        // TODO : validate block fetch URL
        let sent_challenge = self.challenge.unwrap();
        let result = verify(&sent_challenge, &response.signature, &response.public_key);
        if !result {
            warn!(
                "handshake failed. signature is not valid. sig : {:?} challenge : {:?} key : {:?}",
                response.signature.to_hex(),
                sent_challenge.to_hex(),
                response.public_key.to_base58()
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        let block_fetch_url;
        let is_lite;
        let endpoint;
        {
            if let Some(config) = configs.get_server_configs() {
                endpoint = config.endpoint.clone();
            } else {
                endpoint = Endpoint::default();
            }
            is_lite = configs.is_spv_mode();
            if is_lite {
                block_fetch_url = "".to_string();
            } else {
                block_fetch_url = configs.get_block_fetch_url();
            }
        }

        if self.public_key.is_some() {
            assert_eq!(
                response.public_key,
                self.public_key.unwrap(),
                "This peer instance is to handle a peer with a different public key. current : {} new : {}",
                self.public_key.unwrap().to_base58(),
                response.public_key.to_base58()
            );
        }

        // self.block_fetch_url = response.block_fetch_url;
        // self.services = response.services;
        // self.wallet_version = response.wallet_version;
        // self.core_version = response.core_version;
        // self.peer_status = PeerStatus::Connected;
        self.public_key = Some(response.public_key);
        // self.endpoint = response.endpoint.clone();
        // self.connected_at_peer_time = response.timestamp;
        // self.connected_at_my_time = current_time;

        // debug!(
        //     "my version : {:?} peer version : {:?}",
        //     wallet.wallet_version, response.wallet_version
        // );
        // if wallet.wallet_version < response.wallet_version {
        //     io_handler.send_interface_event(InterfaceEvent::NewVersionDetected(
        //         response.public_key,
        //         response.wallet_version,
        //     ));
        // }
        self.response = Some(response.clone());

        if self.url.is_none() {
            // this is only called in initiator's side.
            // [1. A:challenge -> 2. B:response -> 3. A : response|B verified -> 4. B: A verified]
            // we only need to send a response for response is in above stage 3 (meaning the challenger).

            let response_new = HandshakeResponse {
                public_key: wallet.public_key,
                signature: sign(&response.challenge, &wallet.private_key),
                is_lite,
                block_fetch_url: block_fetch_url.to_string(),
                challenge: [0; 32],
                services: services.clone(),
                wallet_version: wallet.wallet_version,
                core_version: wallet.core_version,
                endpoint: endpoint.clone(),
                timestamp: current_time,
            };
            return Ok(Some(response_new));
            // io_handler
            //     .send_message(
            //         self.index,
            //         Message::HandshakeResponse(response).serialize().as_slice(),
            //     )
            //     .await?;
            // debug!("second handshake response sent for peer: {:?}", self.index);
        } else {
            info!(
                "handshake completed for peer : {:?}",
                self.public_key.unwrap().to_base58()
            );
        }
        self.challenge = None;

        return Ok(None);
        // io_handler
        //     .send_message_to_all(
        //         Message::KeyListUpdate(wallet.key_list.to_vec())
        //             .serialize()
        //             .as_slice(),
        //         vec![],
        //     )
        //     .await
        //     .unwrap();
        //
        // io_handler.send_interface_event(InterfaceEvent::PeerHandshakeComplete(self.index));
    }
}
