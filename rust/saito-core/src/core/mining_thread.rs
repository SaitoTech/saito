use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use log::info;
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

use crate::core::consensus::golden_ticket::GoldenTicket;
use crate::core::consensus::wallet::Wallet;
use crate::core::consensus_thread::ConsensusEvent;
use crate::core::defs::{
    BlockId, PrintForLog, SaitoHash, SaitoPublicKey, StatVariable, Timestamp, CHANNEL_SAFE_BUFFER,
};
use crate::core::io::network_event::NetworkEvent;
use crate::core::process::keep_time::Timer;
use crate::core::process::process_event::ProcessEvent;
use crate::core::util::configuration::Configuration;
use crate::core::util::crypto::{generate_random_bytes, hash};

use super::stat_thread::StatEvent;

#[derive(Debug)]
pub enum MiningEvent {
    LongestChainBlockAdded {
        hash: SaitoHash,
        difficulty: u64,
        block_id: BlockId,
    },
}

/// Manages the miner
pub struct MiningThread {
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub sender_to_mempool: Sender<ConsensusEvent>,
    pub timer: Timer,
    pub miner_active: bool,
    pub target: SaitoHash,
    pub target_id: BlockId,
    pub difficulty: u64,
    pub public_key: SaitoPublicKey,
    pub mined_golden_tickets: u64,
    pub stat_sender: Sender<StatEvent>,
    pub config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    // todo : make this private and init using configs
    pub enabled: bool,
    pub mining_iterations: u32,
    pub mining_start: Timestamp,
}

impl MiningThread {
    pub async fn mine(&mut self) -> Option<GoldenTicket> {
        // assert!(self.miner_active, "Miner is not active");
        if self.public_key == [0; 33] {
            let wallet = self.wallet_lock.read().await;
            if wallet.public_key == [0; 33] {
                // wallet not initialized yet
                return None;
            }
            self.public_key = wallet.public_key;
            info!("node public key = {:?}", self.public_key.to_base58());
        }

        let random_bytes = hash(&generate_random_bytes(32).await);
        // The new way of validation will be wasting a GT instance if the validation fails
        // old way used a static method instead
        let gt = GoldenTicket::create(self.target, random_bytes, self.public_key);
        if gt.validate(self.difficulty) {
            info!(
                "golden ticket found. sending to mempool. previous block : {:?}:{:?}\n random : {:?} key : {:?} solution : {:?}\n for difficulty : {:?}\n spent_time : {:?}",
                self.target_id,
                gt.target.to_hex(),
                gt.random.to_hex(),
                gt.public_key.to_base58(),
                hash(&gt.serialize_for_net()).to_hex(),
                self.difficulty,
                self.timer.get_timestamp_in_ms()-self.mining_start
            );

            return Some(gt);
        }
        None
    }
}

#[async_trait]
impl ProcessEvent<MiningEvent> for MiningThread {
    async fn process_network_event(&mut self, _event: NetworkEvent) -> Option<()> {
        unreachable!();
    }

    async fn process_timer_event(&mut self, _duration: Duration) -> Option<()> {
        if !self.enabled {
            return None;
        }
        if self.enabled && self.miner_active {
            for _ in 0..self.mining_iterations {
                if let Some(gt) = self.mine().await {
                    self.miner_active = false;
                    self.mined_golden_tickets += 1;
                    info!(
                        "sending mined gt target: {:?} to consensus thread. channel_capacity : {:?}",
                        gt.target.to_hex(),
                        self.sender_to_mempool.capacity()
                    );
                    self.sender_to_mempool
                        .send(ConsensusEvent::NewGoldenTicket { golden_ticket: gt })
                        .await
                        .expect("sending to mempool failed");
                    return Some(());
                }
            }
            return Some(());
        }

        None
    }

    async fn process_event(&mut self, event: MiningEvent) -> Option<()> {
        if !self.enabled {
            return None;
        }
        match event {
            MiningEvent::LongestChainBlockAdded {
                hash,
                difficulty,
                block_id,
            } => {
                info!(
                    "Activating miner with hash : {:?} and difficulty : {:?} for block_id : {:?}",
                    hash.to_hex(),
                    difficulty,
                    block_id
                );
                self.difficulty = difficulty;
                self.target = hash;
                self.target_id = block_id;
                self.miner_active = true;
                self.mining_start = self.timer.get_timestamp_in_ms();
                Some(())
            }
        }
    }

    async fn on_init(&mut self) {
        let configs = self.config_lock.read().await;
        info!("is spv mode = {:?}", configs.is_spv_mode());
        self.enabled = !configs.is_spv_mode();
        info!("miner is enabled = {:?}", self.enabled);
        let wallet = self.wallet_lock.read().await;
        self.public_key = wallet.public_key;
        info!("node public key = {:?}", self.public_key.to_base58());
    }

    async fn on_stat_interval(&mut self, current_time: Timestamp) {
        if !self.enabled {
            return;
        }

        let stat = format!("{} - {} - total : {:?}, current difficulty : {:?}, miner_active : {:?}, current target : {:?} ",
                           StatVariable::format_timestamp(current_time),
                           format!("{:width$}", "mining::golden_tickets", width = 40),
                           self.mined_golden_tickets,
                           self.difficulty,
                           self.miner_active,
                           self.target.to_hex());
        self.stat_sender
            .send(StatEvent::StringStat(stat))
            .await
            .unwrap();
    }

    fn is_ready_to_process(&self) -> bool {
        self.sender_to_mempool.capacity() > CHANNEL_SAFE_BUFFER
    }
}
