use std::any::Any;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use log::{debug, info, trace, warn};
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::transaction::Transaction;
use crate::core::consensus::wallet::Wallet;
use crate::core::consensus_thread::ConsensusEvent;
use crate::core::defs::{BlockHash, BlockId, PrintForLog, Timestamp, CHANNEL_SAFE_BUFFER};
use crate::core::network::events::NetworkEvent;
use crate::core::network::peers::Peers;
use crate::core::process::keep_time::Timer;
use crate::core::process::process_event::ProcessEvent;

#[derive(Debug)]
pub enum VerifyRequest {
    Transaction(Transaction),
    Block(Vec<u8>, u64, BlockHash, BlockId),
}

pub struct VerificationThread {
    pub sender_to_consensus: Sender<ConsensusEvent>,
    pub blockchain_lock: Arc<RwLock<Blockchain>>,
    pub peer_lock: Arc<RwLock<Peers>>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub timer: Timer,
}

impl VerificationThread {
    pub async fn verify_transaction(&mut self, mut transaction: Transaction) {
        trace!("verifying tx : {:?}", transaction.signature.to_hex());

        let is_valid = {
            let blockchain = self.blockchain_lock.read().await;
            let wallet = self.wallet_lock.read().await;
            let public_key = wallet.public_key;
            transaction.generate(&public_key, 0, 0);
            let is_valid = transaction.validate(&blockchain.utxoset, &blockchain, true);
            is_valid
        };

        if !is_valid {
            debug!(
                "transaction : {:?} not valid",
                transaction.signature.to_hex()
            );
            return;
        }

        self.sender_to_consensus
            .send(ConsensusEvent::NewTransaction { transaction })
            .await
            .unwrap();
    }

    pub async fn verify_block(
        &mut self,
        buffer: &[u8],
        peer_id: u64,
        block_hash: BlockHash,
        block_id: BlockId,
    ) {
        // debug!("verifying block buffer of size : {:?}", buffer.len());
        let buffer_len = buffer.len();
        info!(
            "[TRACE_SYNC][SERDE] verify_block_start peer_id={} expected_block_id={} expected_block_hash={} bytes={}",
            peer_id,
            block_id,
            block_hash.to_hex(),
            buffer_len
        );
        let result = Block::deserialize_from_net(buffer);
        if result.is_err() {
            warn!(
                "failed verifying block buffer with length : {:?}",
                buffer_len
            );
            info!(
                "[TRACE_SYNC] verify_failed reason=deserialize peer_id={} expected_block_id={} expected_block_hash={} bytes={}",
                peer_id,
                block_id,
                block_hash.to_hex(),
                buffer_len
            );
            return;
        }

        let mut block = result.unwrap();
        info!(
            "[TRACE_SYNC][SERDE] verify_block_deserialize_ok peer_id={} block_id={} block_hash={} tx_count={} bytes={}",
            peer_id,
            block.id,
            block.hash.to_hex(),
            block.transactions.len(),
            buffer_len
        );
        block.routed_from_peer_id = peer_id;
        block.generate().unwrap();

        if block.id != block_id || block.hash != block_hash {
            warn!(
                "block : {:?}-{:?} fetched. but deserialized block's hash is : {:?}-{:?}",
                block.id,
                block.hash.to_hex(),
                block_id,
                block_hash.to_hex()
            );
            info!(
                "[TRACE_SYNC] verify_failed reason=id_hash_mismatch peer_id={} expected={}::{} got={}::{}",
                peer_id,
                block_id,
                block_hash.to_hex(),
                block.id,
                block.hash.to_hex()
            );
            return;
        }

        debug!(
            "block : {:?}-{:?} deserialized from buffer from peer : {:?}",
            block.id,
            block.hash.to_hex(),
            peer_id
        );

        self.sender_to_consensus
            .send(ConsensusEvent::BlockFetched { peer_id, block })
            .await
            .unwrap();
        info!(
            "[TRACE_SYNC] verify_ok_submitted_to_consensus peer_id={} block_id={} block_hash={}",
            peer_id,
            block_id,
            block_hash.to_hex()
        );
    }
}

#[async_trait]
impl ProcessEvent<VerifyRequest> for VerificationThread {
    async fn process_network_event(&mut self, _event: NetworkEvent) -> Option<()> {
        unreachable!();
    }

    async fn process_timer_event(&mut self, _duration: Duration) -> Option<()> {
        None
    }

    async fn process_event(&mut self, request: VerifyRequest) -> Option<()> {
        trace!(
            "verification thread processing event : {:?}",
            request.type_id()
        );
        match request {
            VerifyRequest::Transaction(transaction) => {
                self.verify_transaction(transaction).await;
            }
            VerifyRequest::Block(block, peer_id, block_hash, block_id) => {
                self.verify_block(block.as_slice(), peer_id, block_hash, block_id)
                    .await;
            }
        }

        Some(())
    }

    async fn on_init(&mut self) {}

    async fn on_stat_interval(&mut self, _current_time: Timestamp) {}

    fn is_ready_to_process(&self) -> bool {
        self.sender_to_consensus.capacity() > CHANNEL_SAFE_BUFFER
    }
}
