use std::io::{Error, ErrorKind};

use figment::providers::{Format, Json};
use figment::Figment;
use saito_core::core::consensus::peers::congestion_controller::CongestionStatsDisplay;
use serde::Deserialize;

use log::{debug, error};
use saito_core::core::util::configuration::{
    BlockchainConfig, Configuration, ConsensusConfig, Endpoint, PeerConfig, Server, WalletConfig,
};

#[derive(Deserialize, Debug, Clone)]
pub struct Spammer {
    pub timer_in_milli: u64,
    pub burst_count: u32,
    pub tx_size: u64,
    pub tx_count: u64,
    pub tx_payment: u64,
    pub tx_fee: u64,
    pub stop_after: u64,
}
fn get_default_consensus() -> Option<ConsensusConfig> {
    Some(ConsensusConfig::default())
}
#[derive(Deserialize, Debug, Clone)]
pub struct SpammerConfigs {
    server: Server,
    peers: Vec<PeerConfig>,
    spammer: Spammer,
    #[serde(skip)]
    lite: bool,
    #[serde(default = "get_default_consensus")]
    consensus: Option<ConsensusConfig>,
    blockchain: Option<BlockchainConfig>,
    wallet: Option<WalletConfig>,
}

impl SpammerConfigs {
    pub fn new() -> SpammerConfigs {
        SpammerConfigs {
            server: Server {
                host: "127.0.0.1".to_string(),
                port: 0,
                protocol: "http".to_string(),
                endpoint: Endpoint {
                    host: "127.0.0.1".to_string(),
                    port: 0,
                    protocol: "http".to_string(),
                },
                verification_threads: 4,
                channel_size: 0,
                stat_timer_in_ms: 0,
                reconnection_wait_time: 10000,
                thread_sleep_time_in_ms: 10,
                block_fetch_batch_size: 0,
            },
            peers: vec![],
            spammer: Spammer {
                timer_in_milli: 0,
                burst_count: 0,
                tx_size: 0,
                tx_count: 0,
                tx_payment: 0,
                tx_fee: 0,
                stop_after: 0,
            },
            lite: false,
            consensus: Some(ConsensusConfig::default()),
            blockchain: None,
            wallet: Default::default(),
        }
    }

    pub fn get_spammer_configs(&self) -> &Spammer {
        &self.spammer
    }
}

impl Configuration for SpammerConfigs {
    fn get_server_configs(&self) -> Option<&Server> {
        Some(&self.server)
    }

    fn get_peer_configs(&self) -> &Vec<PeerConfig> {
        &self.peers
    }

    fn get_blockchain_configs(&self) -> std::option::Option<&BlockchainConfig> {
        self.blockchain.as_ref()
    }
    fn get_blockchain_configs_mut(&mut self) -> std::option::Option<&mut BlockchainConfig> {
        self.blockchain.as_mut()
    }
    fn get_block_fetch_url(&self) -> String {
        let endpoint = &self.get_server_configs().unwrap().endpoint;
        endpoint.protocol.to_string()
            + "://"
            + endpoint.host.as_str()
            + ":"
            + endpoint.port.to_string().as_str()
            + "/block/"
    }

    fn is_spv_mode(&self) -> bool {
        false
    }

    fn is_browser(&self) -> bool {
        false
    }

    fn replace(&mut self, config: &dyn Configuration) {
        self.server = config.get_server_configs().cloned().unwrap();
        self.peers = config.get_peer_configs().clone();
        self.lite = config.is_spv_mode();
        self.consensus = config.get_consensus_config().cloned();
    }

    fn get_consensus_config(&self) -> Option<&ConsensusConfig> {
        self.consensus.as_ref()
    }

    fn get_consensus_config_mut(&mut self) -> Option<&mut ConsensusConfig> {
        self.consensus.as_mut()
    }

    fn get_congestion_data(&self) -> Option<&CongestionStatsDisplay> {
        None
    }

    fn set_congestion_data(&mut self, congestion_data: Option<CongestionStatsDisplay>) {}

    fn set_blockchain_configs(&mut self, config: Option<BlockchainConfig>) {
        self.blockchain = config;
    }

    fn get_config_path(&self) -> String {
        String::new()
    }

    fn set_config_path(&mut self, path: String) {}

    fn save(&self) -> Result<(), std::io::Error> {
        Ok(())
    }

    fn get_wallet_configs(&self) -> Option<&WalletConfig> {
        self.wallet.as_ref()
    }

    fn get_wallet_configs_mut(&mut self) -> Option<&mut WalletConfig> {
        if self.wallet.is_none() {
            self.wallet = Some(WalletConfig::default());
        }
        self.wallet.as_mut()
    }
}

pub struct ConfigHandler {}

impl ConfigHandler {
    pub fn load_configs(config_file_path: String) -> Result<SpammerConfigs, Error> {
        debug!(
            "loading configurations from path : {:?} current_dir = {:?}",
            config_file_path,
            std::env::current_dir()
        );
        // TODO : add prompt with user friendly format
        let configs = Figment::new()
            .merge(Json::file(config_file_path))
            .extract::<SpammerConfigs>();

        if configs.is_err() {
            error!("{:?}", configs.err().unwrap());
            return Err(std::io::Error::from(ErrorKind::InvalidInput));
        }

        Ok(configs.unwrap())
    }
}
