use std::any::Any;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use log::{debug, trace, warn};
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

use crate::core::consensus::block::Block;
use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::transaction::Transaction;
use crate::core::consensus::wallet::Wallet;
use crate::core::consensus_thread::ConsensusEvent;
use crate::core::defs::{
    BlockHash, BlockId, PrintForLog, SaitoPublicKey, StatVariable, Timestamp, CHANNEL_SAFE_BUFFER,
};
use crate::core::network::events::NetworkEvent;
use crate::core::network::peers::Peers;
use crate::core::process::keep_time::Timer;
use crate::core::process::process_event::ProcessEvent;

use super::stat_thread::StatEvent;

#[derive(Debug)]
pub enum VerifyRequest {
    Transaction(Transaction),
    // Transactions(VecDeque<Transaction>),
    Block(Vec<u8>, SaitoPublicKey, BlockHash, BlockId),
}

pub struct VerificationThread {
    pub sender_to_consensus: Sender<ConsensusEvent>,
    pub blockchain_lock: Arc<RwLock<Blockchain>>,
    pub peer_lock: Arc<RwLock<Peers>>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub processed_txs: StatVariable,
    pub processed_blocks: StatVariable,
    pub processed_msgs: StatVariable,
    pub invalid_txs: StatVariable,
    pub stat_sender: Sender<StatEvent>,
    pub timer: Timer,
}

impl VerificationThread {
    pub async fn verify_tx(&mut self, mut transaction: Transaction) {
        trace!("verifying tx : {:?}", transaction.signature.to_hex());
        let blockchain = self.blockchain_lock.read().await;
        let mut peers = self.peer_lock.write().await;
        let wallet = self.wallet_lock.read().await;
        let public_key = wallet.public_key;
        transaction.generate(&public_key, 0, 0);

        // TODO : should we skip validation against utxo if we don't have the full utxo ?
        if !transaction.validate(&blockchain.utxoset, &blockchain, true) {
            debug!(
                "transaction : {:?} not valid",
                transaction.signature.to_hex()
            );
            self.processed_txs.increment();
            return;
        }

        self.processed_txs.increment();
        self.processed_msgs.increment();
        self.sender_to_consensus
            .send(ConsensusEvent::NewTransaction { transaction })
            .await
            .unwrap();
    }
    pub async fn verify_block(
        &mut self,
        buffer: &[u8],
        public_key: SaitoPublicKey,
        block_hash: BlockHash,
        block_id: BlockId,
    ) {
        // debug!("verifying block buffer of size : {:?}", buffer.len());
        let buffer_len = buffer.len();
        let result = Block::deserialize_from_net(buffer);
        if result.is_err() {
            warn!(
                "failed verifying block buffer with length : {:?}",
                buffer_len
            );
            return;
        }

        let mut block = result.unwrap();
        block.routed_from_peer = Some(public_key);

        block.generate().unwrap();

        if block.id != block_id || block.hash != block_hash {
            warn!(
                "block : {:?}-{:?} fetched. but deserialized block's hash is : {:?}-{:?}",
                block.id,
                block.hash.to_hex(),
                block_id,
                block_hash.to_hex()
            );
            return;
        }

        debug!(
            "block : {:?}-{:?} deserialized from buffer from peer : {:?}",
            block.id,
            block.hash.to_hex(),
            public_key.to_base58()
        );

        self.processed_blocks.increment();
        self.processed_msgs.increment();

        self.sender_to_consensus
            .send(ConsensusEvent::BlockFetched { public_key, block })
            .await
            .unwrap();
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
                self.verify_tx(transaction).await;
            }
            VerifyRequest::Block(block, public_key, block_hash, block_id) => {
                self.verify_block(block.as_slice(), public_key, block_hash, block_id)
                    .await;
            } // VerifyRequest::Transactions(mut txs) => {
              //     self.verify_txs(&mut txs).await;
              // }
        }

        Some(())
    }

    async fn on_init(&mut self) {}

    async fn on_stat_interval(&mut self, current_time: Timestamp) {
        self.processed_msgs.calculate_stats(current_time).await;
        self.invalid_txs.calculate_stats(current_time).await;
        self.processed_txs.calculate_stats(current_time).await;
        self.processed_blocks.calculate_stats(current_time).await;
    }

    fn is_ready_to_process(&self) -> bool {
        self.sender_to_consensus.capacity() > CHANNEL_SAFE_BUFFER
    }
}
