use std::sync::Arc;

use log::{debug, error, warn};
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::transaction::{Transaction, TransactionType};
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{PrintForLog, SaitoHash, SaitoPublicKey, Timestamp};
use crate::core::msg::message::Message;
use crate::core::process::keep_time::Timer;
use crate::core::routing::io::interface_io::InterfaceIO;
use crate::core::routing::peers::peer_collection::PeerCollection;

#[derive(Debug)]
pub enum PeerDisconnectType {
    /// If the peer was disconnected without our intervention
    ExternalDisconnect,
    /// If we disconnected the peer
    InternalDisconnect,
}

// #[derive(Debug)]
pub struct Network {
    // TODO : manage peers from network
    pub peer_lock: Arc<RwLock<PeerCollection>>,
    pub io_interface: Box<dyn InterfaceIO + Send + Sync>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub timer: Timer,
}

impl Network {
    pub fn new(
        io_handler: Box<dyn InterfaceIO + Send + Sync>,
        peer_lock: Arc<RwLock<PeerCollection>>,
        wallet_lock: Arc<RwLock<Wallet>>,
        timer: Timer,
    ) -> Network {
        Network {
            peer_lock,
            io_interface: io_handler,
            wallet_lock,
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
            for (index, peer) in peers.peers.iter_mut() {
                if !peer.is_connected() {
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
	let serialized = message.serialize();
        self.io_interface
            .send_message_to_all(serialized.as_slice(), excluded_peers)
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

        for (index, peer) in peers.peers.iter_mut() {
            if !peer.is_connected() {
                continue;
            }
            let public_key = peer.get_public_key();
            if transaction.is_in_path(&public_key) {
                continue;
            }

            peer.stats.sent_txs += 1;
            peer.stats.last_sent_tx_at = self.timer.get_timestamp_in_ms();
            peer.stats.last_sent_tx = transaction.signature.to_hex();

            let mut transaction = transaction.clone();
            transaction.add_hop(&wallet.private_key, &wallet.public_key, &public_key);
            let message = Message::Transaction(transaction);
	    let serialized = message.serialize();
            _ = self
                .io_interface
                .send_message(*index, serialized.as_slice())
                .await
                .inspect_err(|e| error!("{}", e));
        }
    }



pub async fn update_peer_timestamp(
    &self,
    public_key: SaitoPublicKey,
    timestamp: Timestamp,
) {
    let mut peers = self.peer_lock.write().await;
    peers
        .update_peer_timer(public_key, timestamp)
        .await;
}


pub async fn record_received_transaction(
    &self,
    public_key: SaitoPublicKey,
    transaction: &Transaction,
    timestamp: Timestamp,
) {
    let mut peers = self.peer_lock.write().await;

    if let Some(peer) = peers.peers.get_mut(&public_key) {
        peer.stats.received_txs += 1;
        peer.stats.last_received_tx_at = timestamp;
        peer.stats.last_received_tx = transaction.signature.to_hex();
    } else {
        warn!(
            "Received transaction from peer {:?} does not exist",
            public_key.to_base58()
        );
    }
}


pub async fn record_received_block_header(
    &self,
    public_key: SaitoPublicKey,
    block_hash: &SaitoHash,
    timestamp: Timestamp,
) {
    let mut peers = self.peer_lock.write().await;

    if let Some(peer) = peers.peers.get_mut(&public_key) {
        peer.stats.received_block_headers += 1;
        peer.stats.last_received_block_header_at = timestamp;
        peer.stats.last_received_block_header = block_hash.to_hex();
    } else {
        warn!(
            "Received block header from peer {:?} does not exist",
            public_key.to_base58()
        );
    }
}

pub async fn send_message(
    &self,
    public_key: SaitoPublicKey,
    message: Message,
) {
    let buffer = message.serialize();

    if let Err(err) = self
        .io_interface
        .send_message(public_key, buffer.as_slice())
        .await
    {
        error!(
            "failed sending message to peer {:?}: {:?}",
            public_key.to_base58(),
            err
        );
    }
}



}
