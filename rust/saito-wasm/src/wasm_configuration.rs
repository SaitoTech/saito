use std::io::{Error, ErrorKind};

use figment::providers::{Format, Json};
use figment::Figment;
use log::error;
use saito_core::core::consensus::peers::congestion_controller::CongestionStatsDisplay;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use saito_core::core::util::configuration::{
    BlockchainConfig, Configuration, ConsensusConfig, Endpoint, PeerConfig, Server, WalletConfig,
};
fn get_default_consensus() -> Option<ConsensusConfig> {
    Some(ConsensusConfig::default())
}
#[wasm_bindgen]
#[derive(Deserialize, Debug)]
pub struct WasmConfiguration {
    server: Option<Server>,
    peers: Vec<PeerConfig>,
    #[serde(skip)]
    blockchain: Option<BlockchainConfig>,
    spv_mode: bool,
    browser_mode: bool,
    #[serde(default = "get_default_consensus")]
    consensus: Option<ConsensusConfig>,
    #[serde(skip)]
    congestion: Option<CongestionStatsDisplay>,
    wallet: Option<WalletConfig>,
}

#[wasm_bindgen]
impl WasmConfiguration {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmConfiguration {
        WasmConfiguration {
            server: Some(Server {
                host: "localhost".to_string(),
                port: 12100,
                protocol: "http".to_string(),
                endpoint: Endpoint {
                    host: "localhost".to_string(),
                    port: 12101,
                    protocol: "http".to_string(),
                },
                verification_threads: 2,
                channel_size: 1000,
                stat_timer_in_ms: 10000,
                reconnection_wait_time: 10000,
                thread_sleep_time_in_ms: 10,
                block_fetch_batch_size: 0,
            }),
            peers: vec![],
            blockchain: None,
            spv_mode: false,
            browser_mode: false,
            consensus: Some(ConsensusConfig::default()),
            congestion: None,
            wallet: Default::default(),
        }
    }
}

impl WasmConfiguration {
    pub fn new_from_json(json: &str) -> Result<WasmConfiguration, std::io::Error> {
        // info!("new from json : {:?}", json);
        let configs = Figment::new()
            .merge(Json::string(json))
            .extract::<WasmConfiguration>();
        if configs.is_err() {
            error!(
                "failed parsing json string to configs. {:?}",
                configs.err().unwrap()
            );
            return Err(Error::from(ErrorKind::InvalidInput));
        }
        let configs = configs.unwrap();
        Ok(configs)
    }
}

impl Configuration for WasmConfiguration {
    fn get_server_configs(&self) -> Option<&Server> {
        self.server.as_ref()
    }

    fn get_peer_configs(&self) -> &Vec<PeerConfig> {
        &self.peers
    }

    fn get_blockchain_configs(&self) -> Option<&BlockchainConfig> {
        self.blockchain.as_ref()
    }

    fn get_blockchain_configs_mut(&mut self) -> Option<&mut BlockchainConfig> {
        self.blockchain.as_mut()
    }

    fn get_block_fetch_url(&self) -> String {
        if self.get_server_configs().is_none() {
            return "".to_string();
        }
        let endpoint = &self.get_server_configs().unwrap().endpoint;
        endpoint.protocol.to_string()
            + "://"
            + endpoint.host.as_str()
            + ":"
            + endpoint.port.to_string().as_str()
    }
    fn is_spv_mode(&self) -> bool {
        self.spv_mode
    }

    fn is_browser(&self) -> bool {
        self.browser_mode
    }

    fn replace(&mut self, config: &dyn Configuration) {
        self.server = config.get_server_configs().cloned();
        self.peers = config.get_peer_configs().clone();
        self.spv_mode = config.is_spv_mode();
        self.browser_mode = config.is_browser();
        self.blockchain = config.get_blockchain_configs().cloned();
        self.consensus = config.get_consensus_config().cloned();
        self.congestion = config.get_congestion_data().cloned();
    }

    fn get_consensus_config(&self) -> Option<&ConsensusConfig> {
        self.consensus.as_ref()
    }

    fn get_consensus_config_mut(&mut self) -> Option<&mut ConsensusConfig> {
        self.consensus.as_mut()
    }

    fn get_congestion_data(&self) -> Option<&CongestionStatsDisplay> {
        self.congestion.as_ref()
    }

    fn set_congestion_data(&mut self, congestion_data: Option<CongestionStatsDisplay>) {
        self.congestion = congestion_data;
    }

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
