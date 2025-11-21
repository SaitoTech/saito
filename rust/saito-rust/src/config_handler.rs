use log::{debug, error, info};
use saito_core::core::consensus::peers::congestion_controller::CongestionStatsDisplay;
use saito_core::core::util::configuration::{
    BlockchainConfig, Configuration, ConsensusConfig, Endpoint, PeerConfig, Server, WalletConfig,
};
use serde::{Deserialize, Serialize};
use std::io::{Error, ErrorKind};
use std::path::Path;

// crypto for optional config encryption
use aes_gcm::{aead::Aead, aead::KeyInit, Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use pbkdf2::pbkdf2_hmac_array;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

fn get_default_consensus() -> Option<ConsensusConfig> {
    Some(ConsensusConfig::default())
}

#[derive(Deserialize, Debug, Serialize)]
pub struct NodeConfigurations {
    server: Server,
    peers: Vec<PeerConfig>,
    #[serde(skip)]
    lite: bool,
    spv_mode: Option<bool>,
    #[serde(default = "get_default_consensus")]
    consensus: Option<ConsensusConfig>,
    /// these skipped values are written into a separate file
    #[serde(skip)]
    blockchain: Option<BlockchainConfig>,
    /// these skipped values are written into a separate file
    #[serde(skip)]
    congestion: Option<CongestionStatsDisplay>,
    #[serde(skip)]
    config_path: String,
    wallet: Option<WalletConfig>,
}

impl Default for NodeConfigurations {
    fn default() -> Self {
        NodeConfigurations {
            server: Server {
                host: "127.0.0.1".to_string(),
                port: 12101,
                protocol: "http".to_string(),
                endpoint: Endpoint {
                    host: "127.0.0.1".to_string(),
                    port: 12101,
                    protocol: "http".to_string(),
                },
                verification_threads: 4,
                channel_size: 1000,
                stat_timer_in_ms: 5000,
                thread_sleep_time_in_ms: 10,
                block_fetch_batch_size: 10,
                reconnection_wait_time: 10,
            },
            peers: vec![],
            lite: false,
            spv_mode: Some(false),
            consensus: Some(ConsensusConfig::default()),
            blockchain: Some(BlockchainConfig::default()),
            congestion: None,
            config_path: String::from("config/config.json"),
            wallet: None,
        }
    }
}

// Simple header to mark encrypted configs
const ENC_HEADER: &str = "ENC1:";

fn derive_key_from_pass(pass: &str) -> aes_gcm::Key<Aes256Gcm> {
    // PBKDF2 with SHA-256, fixed application salt, 100k iterations, 32-byte key
    const SALT: &[u8] = b"saito-config";
    const ITERATIONS: u32 = 100_000;
    let dk: [u8; 32] = pbkdf2_hmac_array::<Sha256, 32>(pass.as_bytes(), SALT, ITERATIONS);
    aes_gcm::Key::<Aes256Gcm>::from_slice(&dk).to_owned()
}

fn encrypt_bytes(pass: &str, plaintext: &[u8]) -> Result<String, Error> {
    let key = derive_key_from_pass(pass);
    let cipher = Aes256Gcm::new(&key);
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| std::io::Error::from(ErrorKind::Other))?;
    // store nonce + ciphertext base64 with header
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    let b64 = BASE64.encode(&out);
    Ok(format!("{}{}", ENC_HEADER, b64))
}

fn decrypt_bytes(pass: &str, data: &str) -> Result<Vec<u8>, Error> {
    let b64 = if let Some(rest) = data.strip_prefix(ENC_HEADER) {
        rest
    } else {
        data
    };
    let raw = BASE64
        .decode(b64)
        .map_err(|_| std::io::Error::from(ErrorKind::InvalidInput))?;
    if raw.len() < 12 {
        return Err(std::io::Error::from(ErrorKind::InvalidInput));
    }
    let (nonce_bytes, ct) = raw.split_at(12);
    let key = derive_key_from_pass(pass);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::from_slice(nonce_bytes);
    match cipher.decrypt(nonce, ct) {
        Ok(plaintext) => Ok(plaintext),
        Err(_) => Err(std::io::Error::from(ErrorKind::InvalidInput)),
    }
}

fn looks_like_json(s: &str) -> bool {
    let trimmed = s.trim_start();
    trimmed.starts_with('{') || trimmed.starts_with('[')
}

impl Configuration for NodeConfigurations {
    fn get_server_configs(&self) -> Option<&Server> {
        Some(&self.server)
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
        let endpoint = &self.get_server_configs().unwrap().endpoint;
        endpoint.protocol.to_string()
            + "://"
            + endpoint.host.as_str()
            + ":"
            + endpoint.port.to_string().as_str()
    }

    fn is_spv_mode(&self) -> bool {
        self.spv_mode.is_some() && self.spv_mode.unwrap()
    }

    fn is_browser(&self) -> bool {
        false
    }

    fn replace(&mut self, config: &dyn Configuration) {
        self.server = config.get_server_configs().cloned().unwrap();
        self.peers = config.get_peer_configs().clone();
        self.spv_mode = Some(config.is_spv_mode());
        self.lite = config.is_spv_mode();
        self.consensus = config.get_consensus_config().cloned();
        self.congestion = config.get_congestion_data().cloned();
        self.blockchain = config.get_blockchain_configs().cloned();
        self.wallet = config.get_wallet_configs().cloned();
    }

    fn get_consensus_config(&self) -> Option<&ConsensusConfig> {
        self.consensus.as_ref()
    }

    fn get_congestion_data(&self) -> Option<&CongestionStatsDisplay> {
        self.congestion.as_ref()
    }

    fn set_congestion_data(&mut self, congestion_data: Option<CongestionStatsDisplay>) {
        self.congestion = congestion_data;
    }
    fn save(&self) -> Result<(), Error> {
        let config_file_path = self.get_config_path();
        let json_bytes = serde_json::to_vec_pretty(&self)?;
        if let Ok(pass) = std::env::var("SAITO_PASS") {
            let enc = encrypt_bytes(&pass, &json_bytes)?;
            std::fs::write(config_file_path, enc.as_bytes())?;
        } else {
            let file = std::fs::File::create(config_file_path)?;
            serde_json::to_writer_pretty(&file, &self)?;
        }
        Ok(())
    }
    fn get_config_path(&self) -> String {
        self.config_path.clone()
    }
    fn set_config_path(&mut self, path: String) {
        self.config_path = path;
    }

    fn get_wallet_configs(&self) -> Option<&WalletConfig> {
        self.wallet.as_ref()
    }

    fn get_consensus_config_mut(&mut self) -> Option<&mut ConsensusConfig> {
        self.consensus.as_mut()
    }

    fn get_wallet_configs_mut(&mut self) -> Option<&mut WalletConfig> {
        if self.wallet.is_none() {
            self.wallet = Some(WalletConfig::default());
        }
        self.wallet.as_mut()
    }

    fn set_blockchain_configs(&mut self, config: Option<BlockchainConfig>) {
        self.blockchain = config;
    }
}

pub struct ConfigHandler {}

impl ConfigHandler {
    pub fn load_configs(config_file_path: String) -> Result<NodeConfigurations, Error> {
        debug!(
            "loading configurations from path : {:?} current_dir = {:?}",
            config_file_path,
            std::env::current_dir()
        );
        let path = Path::new(config_file_path.as_str());
        if !path.exists() {
            info!("writing default config file to : {:?}", config_file_path);
            if path.parent().is_some() {
                std::fs::create_dir_all(path.parent().unwrap())?;
            }
            let mut configs = NodeConfigurations::default();
            configs.set_config_path(config_file_path.clone());
            configs.save()?;
        }
        // Read file; supports encrypted or plaintext
        let raw = std::fs::read_to_string(config_file_path.clone())?;
        let content = if raw.starts_with(ENC_HEADER) {
            let pass = std::env::var("SAITO_PASS").map_err(|_| {
                error!("SAITO_PASS not set for encrypted config file");
                std::io::Error::from(ErrorKind::InvalidInput)
            })?;
            let decrypted = decrypt_bytes(&pass, &raw)?;
            String::from_utf8(decrypted)
                .map_err(|_| std::io::Error::from(ErrorKind::InvalidInput))?
        } else if looks_like_json(&raw) {
            raw
        } else if let Ok(pass) = std::env::var("SAITO_PASS") {
            // Try decrypting even without header
            match decrypt_bytes(&pass, &raw) {
                Ok(bytes) => String::from_utf8(bytes)
                    .map_err(|_| std::io::Error::from(ErrorKind::InvalidInput))?,
                Err(_) => {
                    error!("failed loading configs: unrecognized format and decryption failed");
                    return Err(std::io::Error::from(ErrorKind::InvalidInput));
                }
            }
        } else {
            error!("failed loading configs: unrecognized format and SAITO_PASS not set");
            return Err(std::io::Error::from(ErrorKind::InvalidInput));
        };

        let configs = serde_json::from_str::<NodeConfigurations>(&content);

        if configs.is_err() {
            error!("failed loading configs. {:?}", configs.err().unwrap());
            return Err(std::io::Error::from(ErrorKind::InvalidInput));
        }
        let mut configs = configs.unwrap();
        configs.set_config_path(config_file_path.clone());

        Ok(configs)
    }
}

#[cfg(test)]
mod test {
    use std::io::ErrorKind;

    use saito_core::core::util::configuration::Configuration;

    use crate::config_handler::ConfigHandler;

    #[test]
    #[ignore]
    fn load_config_from_existing_file() {
        let path = String::from("src/test/data/config_handler_tests.json");
        let result = ConfigHandler::load_configs(path);
        assert!(result.is_ok());
        let configs = result.unwrap();
        assert_eq!(
            configs.get_server_configs().unwrap().host,
            String::from("localhost")
        );
        assert_eq!(configs.get_server_configs().unwrap().port, 12101);
        assert_eq!(
            configs.get_server_configs().unwrap().protocol,
            String::from("http")
        );
        assert_eq!(
            configs.get_server_configs().unwrap().endpoint.host,
            String::from("localhost")
        );
        assert_eq!(configs.get_server_configs().unwrap().endpoint.port, 12101);
        assert_eq!(
            configs.get_server_configs().unwrap().endpoint.protocol,
            String::from("http")
        );
    }

    #[test]
    #[ignore]
    fn load_config_from_bad_file_format() {
        let path = String::from("src/test/data/config_handler_tests_bad_format.xml");
        let result = ConfigHandler::load_configs(path);
        assert!(result.is_err());
        assert_eq!(result.err().unwrap().kind(), ErrorKind::InvalidInput);
    }

    // FIX : this test is creating a new config file. so it should be deleted after the test since this test will fail if run again
    #[ignore]
    #[test]
    fn load_config_from_non_existing_file() {
        // pretty_env_logger::init();
        let path = String::from("config/new_file_to_write.json");
        let result = ConfigHandler::load_configs(path);
        assert!(result.is_ok());
    }
}
