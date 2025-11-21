use crate::core::consensus::peers::congestion_controller::CongestionStatsDisplay;
use crate::core::io::interface_io::InterfaceIO;
use crate::core::util::configuration::BlockchainConfig;
use log::{error, info, warn};
use serde::Serialize;
use std::io::{Error, ErrorKind};
use std::path::Path;

pub const BLOCKCHAIN_CONFIG_PATH: &str = "./data/state/blockchain.json";
pub const CONGESTION_CONFIG_PATH: &str = "./data/state/congestion.json";
pub struct ConfigManager {}

impl ConfigManager {
    pub async fn write_blockchain_configs(
        blockchain_config: &BlockchainConfig,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Result<(), Error> {
        io_handler.ensure_directory_exists("./data/state")?;
        let json_bytes = serde_json::to_vec_pretty(&blockchain_config)?;
        io_handler
            .write_value(BLOCKCHAIN_CONFIG_PATH, &json_bytes)
            .await
            .or_else(|e| {
                error!("Failed to write blockchain config: {}", e);
                Err(e)
            })
    }
    pub async fn write_congestion_data(
        congestion_data: &CongestionStatsDisplay,
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Result<(), Error> {
        io_handler.ensure_directory_exists("./data/state")?;
        let json_bytes = serde_json::to_vec_pretty(&congestion_data)?;
        io_handler
            .write_value(CONGESTION_CONFIG_PATH, &json_bytes)
            .await
            .or_else(|e| {
                error!("Failed to write congestion data: {}", e);
                Err(e)
            })
    }

    pub async fn read_blockchain_configs(
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Result<BlockchainConfig, Error> {
        if !io_handler.is_existing_file(BLOCKCHAIN_CONFIG_PATH).await {
            return Ok(BlockchainConfig::default());
        }
        io_handler.ensure_directory_exists("./data/state")?;
        let buffer = io_handler
            .read_value(BLOCKCHAIN_CONFIG_PATH)
            .await
            .or_else(|e| {
                warn!("Error reading config file: {}", BLOCKCHAIN_CONFIG_PATH);
                error!("{}", e);
                Err(e)
            })?;

        let configs = serde_json::from_slice::<BlockchainConfig>(&buffer).or_else(|e| {
            error!("Error reading config file: {}", BLOCKCHAIN_CONFIG_PATH);
            error!("{}", e);
            Err(e)
        })?;

        Ok(configs)
    }
    pub async fn read_congestion_data(
        io_handler: &(dyn InterfaceIO + Send + Sync),
    ) -> Result<CongestionStatsDisplay, Error> {
        if !io_handler.is_existing_file(CONGESTION_CONFIG_PATH).await {
            return Ok(Default::default());
        }
        io_handler.ensure_directory_exists("./data/state")?;
        let buffer = io_handler
            .read_value(CONGESTION_CONFIG_PATH)
            .await
            .or_else(|e| {
                warn!("Error reading config file: {}", CONGESTION_CONFIG_PATH);
                error!("{}", e);
                Err(e)
            })?;

        let configs = serde_json::from_slice::<CongestionStatsDisplay>(&buffer).or_else(|e| {
            error!("Error reading config file: {}", CONGESTION_CONFIG_PATH);
            error!("{}", e);
            Err(e)
        })?;

        Ok(configs)
    }
}
