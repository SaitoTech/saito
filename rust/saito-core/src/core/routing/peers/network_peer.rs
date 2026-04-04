use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::routing::io::network_event::NetworkEvent;
use crate::core::routing::peers::peer_service::PeerService;
use crate::core::util::configuration::{Configuration, Endpoint};
use crate::core::util::crypto::{generate_random_bytes, hash, sign, verify};
use log::{debug, error, info, trace, warn};
use std::io::{Error, ErrorKind};
use std::ops::Deref;
use std::sync::Arc;
use tokio::sync::RwLock;

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
        info!("creating network peer : {:?}", url);
        Self {
            challenge: None,
            response: None,
            public_key: None,
            url,
            ip: None,
        }
    }
    pub fn is_connected(&self) -> bool {
        self.response.is_some()
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
        debug!("processing handshake challenge");
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
        wallet: &Wallet,
        configs: &(dyn Configuration + Send + Sync),
    ) -> Result<Option<HandshakeResponse>, Error> {
        debug!(
            "processing handshake response from peer : {:?}",
            response.public_key.to_base58()
        );
        if !response.core_version.is_set() {
            debug!(
                "core version is not set in handshake response. expected : {:?}",
                wallet.core_version
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        }

        // TODO : validate block fetch URL
        let sent_challenge = match self.challenge {
            Some(c) => c,
            None => {
                warn!(
                    "we don't have a challenge to verify for peer : {:?}",
                    response.public_key.to_base58()
                );
                return Err(Error::from(ErrorKind::InvalidInput));
            }
        };
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

        if let Some(existing_key) = self.public_key {
            if response.public_key != existing_key {
                warn!(
                    "peer public key mismatch: existing {} vs new {}",
                    existing_key.to_base58(),
                    response.public_key.to_base58()
                );
                return Err(Error::from(ErrorKind::InvalidInput));
            }
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
            debug!(
                "sending handshake response for peer: {:?}",
                response.public_key.to_base58()
            );
            return Ok(Some(response_new));
            // io_handler
            //     .send_message(
            //         self.index,
            //         Message::HandshakeResponse(response).serialize().as_slice(),
            //     )
            //     .await?;
            // debug!("second handshake response sent for peer: {:?}", self.index);
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
    pub async fn process_incoming_buffer<F2, S>(
        &mut self,
        buffer: Vec<u8>,
        // public_key: &mut Option<SaitoPublicKey>,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync>>,
        timer: &Timer,
        services: &Vec<PeerService>,
        send_event: S,
    ) -> Result<Vec<u8>, Error>
    where
        S: FnOnce(NetworkEvent) -> F2,
        F2: std::future::Future<Output = ()>,
    {
        trace!(
            "NetworkPeer::process_msg_buffer_from_peer : {}",
            self.public_key.unwrap_or([0; 33]).to_base58()
        );
        if self.is_connected() {
            let Some(public_key) = self.public_key else {
                error!("connected peer has no public key set; skipping message dispatch");
                return Err(Error::from(ErrorKind::InvalidData));
            };
            send_event(NetworkEvent::PeerMessageReceived { public_key, buffer }).await;
            Ok(vec![])
        } else {
            if self.challenge.is_some() {
                // let message = Message::deserialize(buffer)?;

                if let Message::HandshakeResponse(response) = Message::deserialize(buffer)? {
                    let configs = configs.read().await;
                    let wallet = wallet.read().await;

                    if !wallet
                        .core_version
                        .is_same_minor_version(&response.core_version)
                    {
                        warn!("peer : {:?} core version is not compatible. current core version : {:?} peer core version : {:?}",
                                 response.public_key.to_base58(), wallet.core_version, response.core_version);

                        send_event(NetworkEvent::NewVersionDetected {
                            public_key: response.public_key,
                            version: response.wallet_version,
                        })
                        .await;
                    } else {
                        return if let Ok(result) = self.process_handshake_response(
                            response.clone(),
                            timer.get_timestamp_in_ms(),
                            &services,
                            &wallet,
                            configs.deref(),
                        ) {
                            let mut buffer = vec![];
                            if let Some(response) = result {
                                // we need to send this response to the other side
                                buffer = Message::HandshakeResponse(response).serialize();
                            }
                            // now the handshake is complete. We need to alert the core
                            send_event(NetworkEvent::PeerConnectionResult {
                                result: Ok(self.clone()),
                            })
                            .await;
                            debug!(
                                "handshake completed for peer : {:?}",
                                self.public_key.unwrap_or([0; 33]).to_base58()
                            );
                            Ok(buffer)
                        } else {
                            warn!("failed handling the handshake response");
                            Err(Error::from(ErrorKind::InvalidInput))
                        };
                    }
                    Ok(vec![])
                } else {
                    warn!(
                        "failed deserializing handshake response. ip : {}",
                        self.ip.as_ref().unwrap_or(&"unknown".to_string())
                    );
                    Err(Error::from(ErrorKind::InvalidInput))
                }
            } else {
                if let Message::HandshakeChallenge(challenge) = Message::deserialize(buffer)? {
                    let configs = configs.read().await;
                    let wallet = wallet.read().await;
                    if let Ok(response) = self
                        .process_handshake_challenge(
                            &challenge,
                            timer.get_timestamp_in_ms(),
                            &services,
                            &wallet,
                            configs.deref(),
                        )
                        .await
                    {
                        debug!("sending handshake response to peer");
                        return Ok(Message::HandshakeResponse(response).serialize());
                    }
                    Ok(vec![])
                } else {
                    error!(
                        "failed deserializing handshake challenge : {:?}",
                        self.public_key.unwrap_or([0; 33]).to_base58(),
                        // hex::encode(buffer)
                    );
                    Err(Error::from(ErrorKind::InvalidInput))
                }
            }
        }
    }
}
