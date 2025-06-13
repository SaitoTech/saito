use std::io::{Error, ErrorKind};
use std::sync::Arc;

use log::{debug, error, info, trace, warn};
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::peers::peer::{Peer, PeerStatus};
use crate::core::consensus::peers::peer_collection::{CongestionType, PeerCollection};
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockId, PeerIndex, PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::io::interface_io::{InterfaceEvent, InterfaceIO};
use crate::core::msg::block_request::BlockchainRequest;
use crate::core::msg::handshake::{HandshakeChallenge, HandshakeResponse};
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::process::version::Version;

#[derive(Debug)]
pub enum PeerDisconnectType {
    /// If the peer was disconnected without our intervention
    ExternalDisconnect,
    /// If we disconnected the peer
    InternalDisconnect,
}
use crate::core::util::configuration::Configuration;

// #[derive(Debug)]
pub struct Network {
    // TODO : manage peers from network
    pub peer_lock: Arc<RwLock<PeerCollection>>,
    pub io_interface: Box<dyn InterfaceIO + Send + Sync>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    pub timer: Timer,
}

impl Network {
    pub fn new(
        io_handler: Box<dyn InterfaceIO + Send + Sync>,
        peer_lock: Arc<RwLock<PeerCollection>>,
        wallet_lock: Arc<RwLock<Wallet>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        timer: Timer,
    ) -> Network {
        Network {
            peer_lock,
            io_interface: io_handler,
            wallet_lock,
            config_lock,
            timer,
        }
    }
    pub async fn propagate_block(&self, block: &Block) {
        debug!("propagating block : {:?}", block.hash.to_hex());

        let mut excluded_peers = vec![];
        // finding block sender to avoid resending the block to that node
        if let Some(index) = block.routed_from_peer.as_ref() {
            excluded_peers.push(*index);
        }

        {
            let mut peers = self.peer_lock.write().await;
            for (index, peer) in peers.index_to_peers.iter_mut() {
                if peer.get_public_key().is_none() {
                    excluded_peers.push(*index);
                    continue;
                }
                peer.stats.sent_block_headers += 1;
                peer.stats.last_sent_block_header_at = self.timer.get_timestamp_in_ms();
                peer.stats.last_received_block_header = block.hash.to_hex();
            }
        }

        debug!("sending block : {:?} to peers", block.hash.to_hex());
        let message = Message::BlockHeaderHash(block.hash, block.id);
        self.io_interface
            .send_message_to_all(message.serialize().as_slice(), excluded_peers)
            .await
            .unwrap();
    }

    pub async fn propagate_transaction(&self, transaction: &Transaction) {
        // TODO : return if tx is not valid

        let mut peers = self.peer_lock.write().await;
        let mut wallet = self.wallet_lock.write().await;

        let public_key = wallet.public_key;

        if transaction
            .from
            .first()
            .expect("from slip should exist")
            .public_key
            == public_key
        {
            if let TransactionType::GoldenTicket = transaction.transaction_type {
            } else {
                wallet.add_to_pending(transaction.clone());
            }
        }

        for (index, peer) in peers.index_to_peers.iter_mut() {
            if peer.get_public_key().is_none() {
                continue;
            }
            let public_key = peer.get_public_key().unwrap();
            if transaction.is_in_path(&public_key) {
                continue;
            }

            peer.stats.sent_txs += 1;
            peer.stats.last_sent_tx_at = self.timer.get_timestamp_in_ms();
            peer.stats.last_sent_tx = transaction.signature.to_hex();

            let mut transaction = transaction.clone();
            transaction.add_hop(&wallet.private_key, &wallet.public_key, &public_key);
            let message = Message::Transaction(transaction);
            self.io_interface
                .send_message(*index, message.serialize().as_slice())
                .await
                .unwrap();
        }
    }

    pub async fn handle_peer_disconnect(
        &mut self,
        peer_index: u64,
        disconnect_type: PeerDisconnectType,
    ) {
        debug!("handling peer disconnect, peer_index = {}", peer_index);

        if let PeerDisconnectType::ExternalDisconnect = disconnect_type {
            self.io_interface
                .disconnect_from_peer(peer_index)
                .await
                .unwrap();
        }

        let mut peers = self.peer_lock.write().await;
        if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
            if peer.get_public_key().is_some() {
                // calling here before removing the peer from collections
                self.io_interface
                    .send_interface_event(InterfaceEvent::PeerConnectionDropped(
                        peer_index,
                        peer.get_public_key().unwrap(),
                    ));
            }

            peer.mark_as_disconnected(self.timer.get_timestamp_in_ms());
        } else {
            error!("unknown peer : {:?} disconnected", peer_index);
        }
    }
    pub async fn handle_new_peer(&mut self, peer_index: u64, ip_addr: Option<String>) {
        // TODO : if an incoming peer is same as static peer, handle the scenario;
        let mut peers = self.peer_lock.write().await;
        if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
            debug!("static peer : {:?} connected", peer_index);
            peer.peer_status = PeerStatus::Connecting;
            peer.ip_address = ip_addr;
        } else {
            debug!("new peer added : {:?}", peer_index);
            let mut peer = Peer::new(peer_index);
            peer.peer_status = PeerStatus::Connecting;
            peer.ip_address = ip_addr;
            peers.index_to_peers.insert(peer_index, peer);
        }

        if let Some(peer) = peers.find_peer_by_index_mut(peer_index) {
            if peer.static_peer_config.is_none() {
                peer.initiate_handshake(self.io_interface.as_ref())
                    .await
                    .unwrap();
            }
        }

        debug!("current peer count = {:?}", peers.index_to_peers.len());
    }

    pub async fn handle_handshake_challenge(
        &self,
        peer_index: u64,
        challenge: HandshakeChallenge,
        wallet_lock: Arc<RwLock<Wallet>>,
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        let mut peers = self.peer_lock.write().await;

        let peer = peers.index_to_peers.get_mut(&peer_index);
        if peer.is_none() {
            error!(
                "peer not found for index : {:?}. cannot handle handshake challenge",
                peer_index
            );
            return;
        }
        let peer = peer.unwrap();
        let current_time = self.timer.get_timestamp_in_ms();

        // TODO : handshake should be rate limited using IP and not peer index
        // let control = peers.get_congestion_controls_for_index(peer_index);
        // TODO : this rate check is done after a lock is acquired which is not ideal
        // peer.handshake_limiter.increase();
        // if peer.has_handshake_limit_exceeded(current_time) {
        //     warn!(
        //         "peer {:?} exceeded rate peers for handshake challenge",
        //         peer_index
        //     );
        //     return;
        // }

        peer.handle_handshake_challenge(
            challenge,
            self.io_interface.as_ref(),
            wallet_lock.clone(),
            config_lock,
        )
        .await
        .unwrap();
    }
    pub async fn handle_handshake_response(
        &mut self,
        peer_index: u64,
        response: HandshakeResponse,
        wallet_lock: Arc<RwLock<Wallet>>,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        let mut peers = self.peer_lock.write().await;
        let public_key;
        let current_time = self.timer.get_timestamp_in_ms();
        {
            let control = peers.get_congestion_controls_for_index(peer_index);
            if let Some(control) = control {
                control.increase(CongestionType::Handshake);
                if control.has_limit_exceeded(CongestionType::Handshake, current_time) {
                    warn!(
                        "peer {:?} exceeded rate peers for handshake challenge",
                        peer_index
                    );
                    return;
                }
            }
        }
        {
            let peer = peers.index_to_peers.get_mut(&peer_index);
            if peer.is_none() {
                error!(
                    "peer not found for index : {:?}. cannot handle handshake response",
                    peer_index
                );
                return;
            }
            let peer: &mut Peer = peer.unwrap();
            let result = peer
                .handle_handshake_response(
                    response,
                    self.io_interface.as_ref(),
                    wallet_lock.clone(),
                    configs_lock.clone(),
                    current_time,
                )
                .await;
            if result.is_err() || peer.get_public_key().is_none() {
                info!(
                    "disconnecting peer : {:?} as handshake response was not handled",
                    peer_index
                );
                self.io_interface
                    .disconnect_from_peer(peer_index)
                    .await
                    .unwrap();
                return;
            }
            public_key = peer.get_public_key().unwrap();
            debug!(
                "peer : {:?} handshake successful for peer : {:?}",
                peer.index,
                public_key.to_base58()
            );
        }
        if let Some(old_peer) = peers.remove_reconnected_peer(&public_key) {
            // if we already have the public key, and it's disconnected, we will consider this as a reconnection.
            // so we will remove the old peer and add those data into new peer
            // else we will reject the new connection
            let peer = peers
                .find_peer_by_index_mut(peer_index)
                .expect("peer should exist here since it was accessed previously");
            peer.join_as_reconnection(old_peer);
        } else {
            peers.address_to_peers.insert(public_key, peer_index);
        }

        for (index, peer) in &peers.index_to_peers {
            if peer.public_key.is_none() {
                continue;
            }
            debug!(
                "peer : {:?} with key : {:?} is currently connected : {:?}",
                index,
                peer.public_key.unwrap().to_base58(),
                peer.peer_status
            );
        }

        self.io_interface
            .send_interface_event(InterfaceEvent::PeerConnected(peer_index));
        // start block syncing here
        self.request_blockchain_from_peer(peer_index, blockchain_lock.clone())
            .await;
    }
    pub async fn handle_received_key_list(
        &mut self,
        peer_index: PeerIndex,
        key_list: Vec<SaitoPublicKey>,
    ) -> Result<(), Error> {
        trace!(
            "handler received key list of length : {:?} from peer : {:?}",
            key_list.len(),
            peer_index
        );

        let current_time = self.timer.get_timestamp_in_ms();
        // Lock peers to write
        let mut peers = self.peer_lock.write().await;

        {
            let control = peers
                .get_congestion_controls_for_index(peer_index)
                .expect("peer should exist");
            control.increase(CongestionType::KeyList);
            if control.has_limit_exceeded(CongestionType::KeyList, current_time) {
                debug!(
                    "peer {} exceeded the rate for key list",
                    peer_index,
                    // peer.public_key.unwrap().to_base58()
                );
                return Err(Error::from(ErrorKind::Other));
            }
        }

        if let Some(peer) = peers.index_to_peers.get_mut(&peer_index) {
            // Check rate peers

            trace!(
                "handling received keylist of length : {:?} from peer : {:?}",
                key_list.len(),
                peer_index
            );
            peer.key_list = key_list;
            Ok(())
        } else {
            error!(
                "peer not found for index : {:?}. cannot handle received key list",
                peer_index
            );
            Err(Error::from(ErrorKind::NotFound))
        }
    }

    pub async fn send_key_list(&self, key_list: &[SaitoPublicKey]) {
        debug!(
            "sending key list to all the peers {:?}",
            key_list
                .iter()
                .map(|key| key.to_base58())
                .collect::<Vec<String>>()
        );

        self.io_interface
            .send_message_to_all(
                Message::KeyListUpdate(key_list.to_vec())
                    .serialize()
                    .as_slice(),
                vec![],
            )
            .await
            .unwrap();
    }

    pub(crate) async fn request_blockchain_from_peer(
        &self,
        peer_index: u64,
        blockchain_lock: Arc<RwLock<Blockchain>>,
    ) {
        let configs = self.config_lock.read().await;
        // trace!("locking blockchain 1");
        let blockchain = blockchain_lock.read().await;
        let buffer: Vec<u8>;
        debug!(
            "requesting blockchain from peer : {:?} latest_block_id : {:?}, last_block_id : {:?}",
            peer_index,
            blockchain.get_latest_block_id(),
            blockchain.last_block_id
        );

        if configs.is_spv_mode() {
            let request;
            {
                debug!(
                    "blockchain last block id : {:?}, latest block id : {:?}",
                    blockchain.last_block_id,
                    blockchain.get_latest_block_id()
                );
                if blockchain.last_block_id >= blockchain.get_latest_block_id() {
                    let fork_id = blockchain.fork_id.unwrap_or([0; 32]);
                    debug!(
                        "blockchain request 1 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                        blockchain.last_block_id,
                        blockchain.last_block_hash.to_hex(),
                        fork_id.to_hex()
                    );
                    request = BlockchainRequest {
                        latest_block_id: blockchain.last_block_id,
                        latest_block_hash: blockchain.last_block_hash,
                        fork_id,
                    };
                } else if let Some(fork_id) =
                    blockchain.generate_fork_id(blockchain.get_latest_block_id())
                {
                    debug!(
                        "blockchain request 2 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                        blockchain.get_latest_block_id(),
                        blockchain.get_latest_block_hash().to_hex(),
                        fork_id.to_hex()
                    );
                    request = BlockchainRequest {
                        latest_block_id: blockchain.get_latest_block_id(),
                        latest_block_hash: blockchain.get_latest_block_hash(),
                        fork_id,
                    };
                } else {
                    debug!(
                        "blockchain request 3 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                        blockchain.get_latest_block_id(),
                        blockchain.get_latest_block_hash().to_hex(),
                        [0; 32]
                    );
                    request = BlockchainRequest {
                        latest_block_id: blockchain.get_latest_block_id(),
                        latest_block_hash: blockchain.get_latest_block_hash(),
                        fork_id: [0; 32],
                    };
                }
            }
            debug!("sending ghost chain request to peer : {:?}", peer_index);
            buffer = Message::GhostChainRequest(
                request.latest_block_id,
                request.latest_block_hash,
                request.fork_id,
            )
            .serialize();
        } else {
            let request;
            if let Some(fork_id) = blockchain.generate_fork_id(blockchain.get_latest_block_id()) {
                request = BlockchainRequest {
                    latest_block_id: blockchain.get_latest_block_id(),
                    latest_block_hash: blockchain.get_latest_block_hash(),
                    fork_id,
                };
                debug!(
                    "blockchain request 4 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                    blockchain.get_latest_block_id(),
                    blockchain.get_latest_block_hash().to_hex(),
                    fork_id.to_hex()
                );
            } else {
                request = BlockchainRequest {
                    latest_block_id: blockchain.get_latest_block_id(),
                    latest_block_hash: blockchain.get_latest_block_hash(),
                    fork_id: [0; 32],
                };
                debug!(
                    "blockchain request 5 : latest_id: {:?} latest_hash: {:?} fork_id: {:?}",
                    blockchain.get_latest_block_id(),
                    blockchain.get_latest_block_hash().to_hex(),
                    [0; 32]
                );
            }
            debug!("sending blockchain request to peer : {:?}", peer_index);
            buffer = Message::BlockchainRequest(request).serialize();
        }
        // need to drop the reference here to avoid deadlocks.
        // We need blockchain lock till here to avoid integrity issues
        drop(blockchain);
        drop(configs);
        // trace!("releasing blockchain 1");

        self.io_interface
            .send_message(peer_index, buffer.as_slice())
            .await
            .unwrap();
        trace!("blockchain request sent to peer : {:?}", peer_index);
    }
    pub async fn process_incoming_block_hash(
        &mut self,
        block_hash: SaitoHash,
        block_id: BlockId,
        peer_index: PeerIndex,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        mempool_lock: Arc<RwLock<Mempool>>,
    ) -> Option<()> {
        trace!(
            "fetching block : {:?}-{:?} from peer : {:?}",
            block_id,
            block_hash.to_hex(),
            peer_index
        );
        let block_exists;
        let my_public_key;

        {
            // trace!("locking blockchain 2");
            let blockchain = blockchain_lock.read().await;
            if blockchain.is_block_indexed(block_hash) {
                block_exists = true;
            } else {
                let mempool = mempool_lock.read().await;
                block_exists = mempool.blocks_queue.iter().any(|b| b.hash == block_hash);
            }
        }
        // trace!("releasing blockchain 2");
        {
            let wallet = self.wallet_lock.read().await;
            my_public_key = wallet.public_key;
        }
        if block_exists {
            debug!(
                "block : {:?}-{:?} already exists in chain. not fetching",
                block_id,
                block_hash.to_hex()
            );
            return None;
        }
        let url;
        {
            let configs = self.config_lock.read().await;
            let peers = self.peer_lock.read().await;
            let wallet = self.wallet_lock.read().await;

            if let Some(peer) = peers.index_to_peers.get(&peer_index) {
                if wallet.wallet_version > peer.wallet_version
                    && peer.wallet_version != Version::new(0, 0, 0)
                {
                    warn!(
                    "Not Fetching Block: {:?} from peer :{:?} since peer version is old. expected: {:?} actual {:?} ",
                    block_hash.to_hex(), peer.index, wallet.wallet_version, peer.wallet_version
                );
                    return None;
                }

                if peer.block_fetch_url.is_empty() {
                    debug!(
                        "won't fetch block : {:?} from peer : {:?} since no url found",
                        block_hash.to_hex(),
                        peer_index
                    );
                    return None;
                }
                url = peer.get_block_fetch_url(block_hash, configs.is_spv_mode(), my_public_key);
            } else {
                warn!(
                    "peer : {:?} is not in peer list. cannot generate the block fetch url",
                    peer_index
                );
                return None;
            }
        }

        debug!(
            "fetching block for incoming hash : {:?}-{:?}",
            block_id,
            block_hash.to_hex()
        );

        if self
            .io_interface
            .fetch_block_from_peer(block_hash, peer_index, url.as_str(), block_id)
            .await
            .is_err()
        {
            // failed fetching block from peer
            warn!(
                "failed fetching block : {:?} for block hash. so unmarking block as fetching",
                block_hash.to_hex()
            );
        }
        Some(())
    }

    pub async fn initialize_static_peers(
        &mut self,
        configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    ) {
        let configs = configs_lock.read().await;
        let mut peers = self.peer_lock.write().await;

        // TODO : can create a new disconnected peer with a is_static flag set. so we don't need to keep the static peers separately
        configs
            .get_peer_configs()
            .clone()
            .drain(..)
            .for_each(|config| {
                let mut peer = Peer::new(peers.peer_counter.get_next_index());

                peer.static_peer_config = Some(config);

                peers.index_to_peers.insert(peer.index, peer);
            });

        info!("added {:?} static peers", peers.index_to_peers.len());
    }

    pub async fn handle_new_stun_peer(
        &mut self,
        peer_index: PeerIndex,
        public_key: SaitoPublicKey,
    ) {
        debug!(
            "Adding STUN peer with index: {} and public key: {}",
            peer_index,
            public_key.to_base58()
        );
        let mut peers = self.peer_lock.write().await;
        if peers.index_to_peers.contains_key(&peer_index) {
            error!(
                "Failed to add STUN peer: Peer with index {} already exists",
                peer_index
            );
            return;
        }
        let peer = Peer::new_stun(peer_index, public_key, self.io_interface.as_ref());
        peers.index_to_peers.insert(peer_index, peer);
        peers.address_to_peers.insert(public_key, peer_index);
        debug!("STUN peer added successfully");
        self.io_interface
            .send_interface_event(InterfaceEvent::StunPeerConnected(peer_index));
    }

    pub async fn remove_stun_peer(&mut self, peer_index: PeerIndex) {
        debug!("Removing STUN peer with index: {}", peer_index);
        let mut peers = self.peer_lock.write().await;
        let peer_public_key: SaitoPublicKey;
        if let Some(peer) = peers.index_to_peers.remove(&peer_index) {
            if let Some(public_key) = peer.get_public_key() {
                peer_public_key = public_key;
                peers.address_to_peers.remove(&public_key);
                debug!("STUN peer removed from network successfully");
                self.io_interface
                    .send_interface_event(InterfaceEvent::StunPeerDisconnected(
                        peer_index,
                        peer_public_key,
                    ));
            }
        } else {
            error!(
                "Failed to remove STUN peer: Peer with index {} not found",
                peer_index
            );
        }
    }

    pub async fn connect_to_static_peers(&mut self, current_time: Timestamp) {
        // trace!("connecting to static peers...");
        let mut peers = self.peer_lock.write().await;
        for (peer_index, peer) in &mut peers.index_to_peers {
            let url = peer.get_url();
            if let PeerStatus::Disconnected(connect_time, period) = &mut peer.peer_status {
                if current_time < *connect_time {
                    continue;
                }
                if let Some(config) = peer.static_peer_config.as_ref() {
                    info!(
                        "trying to connect to static peer : {:?} with {:?}",
                        peer_index, config
                    );
                    self.io_interface
                        .connect_to_peer(url, peer.index)
                        .await
                        .unwrap();
                    *period *= 2;
                    *connect_time = current_time + *period;
                }
            }
        }
    }

    pub async fn send_pings(&mut self) {
        let current_time = self.timer.get_timestamp_in_ms();
        let mut peers = self.peer_lock.write().await;
        for (_, peer) in peers.index_to_peers.iter_mut() {
            if peer.get_public_key().is_some() {
                peer.send_ping(current_time, self.io_interface.as_ref())
                    .await;
            }
        }
    }

    pub async fn update_peer_timer(&mut self, peer_index: PeerIndex) {
        let mut peers = self.peer_lock.write().await;
        let peer = peers.index_to_peers.get_mut(&peer_index);
        if peer.is_none() {
            return;
        }
        let peer = peer.unwrap();
        peer.last_msg_at = self.timer.get_timestamp_in_ms();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::util::{configuration::PeerConfig, test::test_manager};
    use rand::Rng;

    // #[serial_test::serial]
    // #[tokio::test]
    // async fn test_keylist_rate_limiter() {
    //     let mut t1 = test_manager::test::TestManager::default();
    //     let limit: u64 = 10;
    //     let peer2_index: u64 = 0;
    //     let mut peer2;

    //     {
    //         let mut peers = t1.network.peer_lock.write().await;

    //         peer2 = Peer::new(peer2_index);

    //         peer2.key_list_limiter.set_limit(limit);
    //         let peer_data = PeerConfig {
    //             host: String::from(""),
    //             port: 8080,
    //             protocol: String::from(""),
    //             synctype: String::from(""),
    //             // is_main: true,
    //         };

    //         peer2.static_peer_config = Some(peer_data);
    //         peers.index_to_peers.insert(peer2_index, peer2.clone());
    //         println!("peer count = {:?}", peers.index_to_peers.len());
    //     }

    //     for i in 0..40 {
    //         let key_list: Vec<SaitoPublicKey> = (0..11)
    //             .map(|_| {
    //                 let mut key = [0u8; 33];
    //                 rand::thread_rng().fill(&mut key[..]);
    //                 key
    //             })
    //             .collect();

    //         let result = t1
    //             .network
    //             .handle_received_key_list(peer2_index, key_list)
    //             .await;

    //         dbg!(&result);

    //         if i < limit {
    //             assert!(result.is_ok(), "Expected Ok, got {:?}", result);
    //         } else {
    //             assert!(result.is_err(), "Expected Err, got {:?}", result);
    //         }
    //     }
    //     dbg!(peer2);
    // }
}
