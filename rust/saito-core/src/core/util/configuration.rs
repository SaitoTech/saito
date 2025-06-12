use std::fmt::{Debug, Display};

use crate::core::defs::Currency;
use crate::core::defs::{BlockId, Timestamp};
use log::error;
use serde::Deserialize;
use serde::Serialize;

#[derive(Deserialize, Serialize, Debug, Clone, Eq, PartialEq)]
pub struct PeerConfig {
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub synctype: String,
}

impl Display for PeerConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{{ host: {}, port: {}, protocol: {}, synctype: {} }}",
            self.host, self.port, self.protocol, self.synctype
        )
    }
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone, Default)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
    pub protocol: String,
}

impl crate::core::util::serialize::Serialize<Self> for Endpoint {
    fn serialize(&self) -> Vec<u8> {
        vec![
            (self.host.len() as u16).to_be_bytes().to_vec(),
            self.port.to_be_bytes().to_vec(),
            (self.protocol.len() as u16).to_be_bytes().to_vec(),
            self.host.as_bytes().to_vec(),
            self.protocol.as_bytes().to_vec(),
        ]
        .concat()
    }

    fn deserialize(buffer: &Vec<u8>) -> Result<Self, std::io::Error> {
        let header_len = 6; // 2 bytes for host length, 2 bytes for port, 2 bytes for protocol length
        if buffer.len() < header_len {
            error!("Buffer too short for Endpoint header: {}", buffer.len());
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Buffer too short for Endpoint header",
            ));
        }

        let host_len = u16::from_be_bytes([buffer[0], buffer[1]]) as usize;
        let port = u16::from_be_bytes([buffer[2], buffer[3]]);
        let protocol_len = u16::from_be_bytes([buffer[4], buffer[5]]) as usize;

        if buffer.len() < header_len + host_len + protocol_len {
            error!(
                "Buffer too short for host or protocol: {}. expected size : {}",
                buffer.len(),
                header_len + host_len + protocol_len
            );
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Buffer too short for host or protocol",
            ));
        }

        let host = String::from_utf8(buffer[header_len..header_len + host_len].to_vec())
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid UTF-8"))?;
        let protocol = String::from_utf8(
            buffer[header_len + host_len..header_len + host_len + protocol_len].to_vec(),
        )
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid UTF-8"))?;

        Ok(Endpoint {
            host,
            port,
            protocol,
        })
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::util::serialize::Serialize;

    #[test]
    fn test_endpoint_serialization() {
        let endpoint = Endpoint {
            host: "localhost".to_string(),
            port: 8080,
            protocol: "http".to_string(),
        };
        let serialized = endpoint.serialize();
        let deserialized =
            <Endpoint as crate::core::util::serialize::Serialize<_>>::deserialize(&serialized)
                .unwrap();
        assert_eq!(endpoint.host, deserialized.host);
        assert_eq!(endpoint.port, deserialized.port);
        assert_eq!(endpoint.protocol, deserialized.protocol);
    }
}
