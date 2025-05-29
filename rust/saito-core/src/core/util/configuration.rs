use std::fmt::Debug;

use crate::core::defs::Currency;
use crate::core::defs::{BlockId, Timestamp};
use serde::Deserialize;
use serde::Serialize;

#[derive(Deserialize, Serialize, Debug, Clone, Eq, PartialEq)]
pub struct PeerConfig {
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub synctype: String,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
    pub protocol: String,
}
fn get_default_genesis_period() -> Timestamp {
    #[cfg(test)]
    return 10;

    #[cfg(not(test))]
    return 100_000;
}
fn get_default_heartbeat_period_ms() -> Timestamp {
    5_000
}
fn get_default_prune_after_blocks() -> u64 {
    8
}
fn get_default_max_staker_recursions() -> BlockId {
    3
}
fn get_default_block_fetch_batch_size() -> u64 {
    1000
}
fn get_default_thread_sleep_time() -> Timestamp {
    5_000
}
fn get_default_reconnection_wait_time() -> Timestamp {
    10_000
}
fn get_default_stat_timer() -> Timestamp {
    1_000
}
fn get_default_social_stake() -> Timestamp {
    return 0;
}
fn get_default_social_stake_period() -> Timestamp {
    return 60;
}
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Server {
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub protocol: String,
    pub endpoint: Endpoint,
    #[serde(default)]
    pub verification_threads: u16,
    #[serde(default)]
    pub channel_size: u64,
    #[serde(default = "get_default_stat_timer")]
    pub stat_timer_in_ms: Timestamp,
    #[serde(default = "get_default_thread_sleep_time")]
    pub thread_sleep_time_in_ms: Timestamp,
    #[serde(default = "get_default_block_fetch_batch_size")]
    pub block_fetch_batch_size: u64,
    #[serde(default = "get_default_reconnection_wait_time")]
    pub reconnection_wait_time: Timestamp,
}

#[derive(Deserialize, Debug, Clone, Serialize, Default)]
pub struct BlockchainConfig {
    #[serde(default)]
    pub last_block_hash: String,
    #[serde(default)]
    pub last_block_id: BlockId,
    #[serde(default)]
    pub last_timestamp: Timestamp,
    #[serde(default)]
    pub genesis_block_id: BlockId,
    #[serde(default)]
    pub genesis_timestamp: Timestamp,
    #[serde(default)]
    pub lowest_acceptable_timestamp: Timestamp,
    #[serde(default)]
    pub lowest_acceptable_block_hash: String,
    #[serde(default)]
    pub lowest_acceptable_block_id: BlockId,
    #[serde(default)]
    pub fork_id: String,
    #[serde(skip)]
    pub initial_loading_completed: bool,
    #[serde(default = "get_default_issuance_writing_block_interval")]
    pub issuance_writing_block_interval: BlockId,
}

pub fn get_default_issuance_writing_block_interval() -> BlockId {
    10
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct ConsensusConfig {
    #[serde(default = "get_default_genesis_period")]
    pub genesis_period: Timestamp,
    #[serde(default = "get_default_heartbeat_period_ms")]
    pub heartbeat_interval: Timestamp,
    #[serde(default = "get_default_prune_after_blocks")]
    pub prune_after_blocks: u64,
    #[serde(default = "get_default_max_staker_recursions")]
    pub max_staker_recursions: BlockId,
    #[serde(default = "get_default_social_stake")]
    pub default_social_stake: Currency,
    #[serde(default = "get_default_social_stake_period")]
    pub default_social_stake_period: BlockId,
}

impl Default for ConsensusConfig {
    fn default() -> Self {
        ConsensusConfig {
            genesis_period: get_default_genesis_period(),
            heartbeat_interval: get_default_heartbeat_period_ms(),
            prune_after_blocks: 8,
            max_staker_recursions: 3,
            default_social_stake: get_default_social_stake(),
            default_social_stake_period: get_default_social_stake_period(),
        }
    }
}

pub trait Configuration: Debug {
    fn get_server_configs(&self) -> Option<&Server>;
    fn get_peer_configs(&self) -> &Vec<PeerConfig>;
    fn get_blockchain_configs(&self) -> &BlockchainConfig;
    fn get_block_fetch_url(&self) -> String;
    fn is_spv_mode(&self) -> bool;
    fn is_browser(&self) -> bool;
    fn replace(&mut self, config: &dyn Configuration);
    fn get_consensus_config(&self) -> Option<&ConsensusConfig>;
}

impl ConsensusConfig {
    pub fn get_ring_buffer_length(&self) -> BlockId {
        self.genesis_period * 2
    }
}
