use std::collections::VecDeque;
use std::time::Duration;

use async_trait::async_trait;
use log::info;
use serde::Serialize;

use crate::core::defs::Timestamp;
use crate::core::io::interface_io::InterfaceIO;
use crate::core::io::network_event::NetworkEvent;
use crate::core::process::process_event::ProcessEvent;

const STAT_FILENAME: &str = "./data/saito.stats";
const STAT_FILE_WRITE_INTERVAL: u64 = 5_000; // in milliseconds

#[derive(Default, Debug, Clone, Serialize)]
pub struct PeerStatEntry {
    pub public_key: String,
    pub ip_address: String,
    pub is_lite_mode: bool,
    pub connection_status: String,
}
#[derive(Default, Debug, Clone, Serialize)]
pub struct PeerStat {
    pub peer_count: u64,
    pub connected_peers: u64,
    pub disconnected_peers: u64,
    pub connecting_peers: u64,
    pub peers: Vec<PeerStatEntry>,
}

#[derive(Default, Debug, Clone, Serialize)]
pub struct WalletStat {
    pub wallet_balance: u64,
    pub wallet_address: String,
}
#[derive(Default, Debug, Clone, Serialize)]
pub struct MiningStat {
    pub mining_difficulty: u64,
}
#[derive(Default, Debug, Clone, Serialize)]
pub struct BlockchainStat {
    pub longest_chain_length: u64,
    pub latest_block_hash: String,
}

#[derive(Default, Debug, Clone, Serialize)]
pub struct MempoolStat {
    pub mempool_size: u64,
}

#[derive(Debug, Clone)]
pub enum StatEvent {
    StringStat(String),
    PeerStat(PeerStat),
    WalletStat(WalletStat),
    MiningStat(MiningStat),
    BlockchainStat(BlockchainStat),
    MempoolStat(MempoolStat),
}

pub struct StatThread {
    pub stat_queue: VecDeque<String>,
    pub io_interface: Box<dyn InterfaceIO + Send + Sync>,
    pub enabled: bool,
    pub current_peer_state: PeerStat,
    pub current_wallet_state: WalletStat,
    pub current_mining_state: MiningStat,
    pub current_blockchain_state: BlockchainStat,
    pub current_mempool_state: MempoolStat,
    pub file_write_timer: Timestamp,
}

impl StatThread {
    pub async fn new(io_interface: Box<dyn InterfaceIO + Send + Sync>) -> StatThread {
        StatThread {
            io_interface,
            stat_queue: VecDeque::new(),
            enabled: true,
            current_peer_state: Default::default(),
            current_wallet_state: Default::default(),
            current_mining_state: Default::default(),
            current_blockchain_state: Default::default(),
            current_mempool_state: Default::default(),
            file_write_timer: 0,
        }
    }
}

#[async_trait]
impl ProcessEvent<StatEvent> for StatThread {
    async fn process_network_event(&mut self, _event: NetworkEvent) -> Option<()> {
        None
    }

    async fn process_timer_event(&mut self, duration: Duration) -> Option<()> {
        let mut work_done = false;
        if !self.enabled {
            return None;
        }

        self.file_write_timer += duration.as_millis() as Timestamp;
        if self.file_write_timer >= STAT_FILE_WRITE_INTERVAL {
            for stat in self.stat_queue.drain(..) {
                let stat = stat + "\r\n";
                self.io_interface
                    .append_value(STAT_FILENAME, stat.as_bytes())
                    .await
                    .unwrap();
                work_done = true;
            }
            self.file_write_timer = 0;
        }

        if work_done {
            self.io_interface.flush_data(STAT_FILENAME).await.unwrap();
            return Some(());
        }
        None
    }

    async fn process_event(&mut self, event: StatEvent) -> Option<()> {
        if !self.enabled {
            return None;
        }
        match event {
            StatEvent::StringStat(stat) => {
                self.stat_queue.push_back(stat);
            }
            StatEvent::PeerStat(stat) => {
                self.current_peer_state = stat;
            }
            StatEvent::WalletStat(state) => {
                self.current_wallet_state = state;
            }
            StatEvent::MiningStat(stat) => {
                self.current_mining_state = stat;
            }
            StatEvent::BlockchainStat(stat) => {
                self.current_blockchain_state = stat;
            }
            StatEvent::MempoolStat(stat) => {
                self.current_mempool_state = stat;
            }
        }
        Some(())
    }

    async fn on_init(&mut self) {
        info!("initializing stat thread");
        if !self.enabled {
            info!("stat thread is off");
            return;
        }
        self.io_interface
            .write_value(STAT_FILENAME, vec![].as_slice())
            .await
            .unwrap();
        info!("stat thread is on");
    }

    async fn on_stat_interval(&mut self, _current_time: Timestamp) {}

    fn is_ready_to_process(&self) -> bool {
        true
    }
}
