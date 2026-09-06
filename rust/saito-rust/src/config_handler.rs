use log::{debug, error, info, warn};
use saito_core::core::defs::{PrintForLog, SaitoPrivateKey};
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
use sha2::Sha256;

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
    #[serde(default)]
    blockchain: BlockchainConfig,
    /// these skipped values are written into a separate file
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
            blockchain: BlockchainConfig::default(),
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

fn is_valid_private_key(value: &str) -> bool {
    SaitoPrivateKey::from_hex(value).is_ok()
}

fn saito_pass() -> Option<String> {
    std::env::var("SAITO_PASS").ok()
}

/// the config file itself is plaintext json. only the wallet private key is encrypted at rest,
/// and only when a password is set. an empty key is left alone since there's nothing to protect.
fn encrypt_private_key_for_saving(
    value: &mut serde_json::Value,
    pass: Option<&str>,
) -> Result<(), Error> {
    let pass = match pass {
        Some(pass) => pass,
        None => return Ok(()),
    };
    let private_key = match value.pointer("/wallet/privateKey").and_then(|k| k.as_str()) {
        Some(key) => key,
        None => return Ok(()),
    };
    if private_key.is_empty() || private_key.starts_with(ENC_HEADER) {
        return Ok(());
    }
    let encrypted = encrypt_bytes(pass, private_key.as_bytes())?;
    value["wallet"]["privateKey"] = serde_json::Value::String(encrypted);
    Ok(())
}

/// counterpart of [`encrypt_private_key_for_saving`]. a key which already parses as a private key
/// is used as-is, anything else is assumed to be ciphertext and needs the password to unlock.
fn decrypt_private_key_after_loading(
    configs: &mut NodeConfigurations,
    pass: Option<&str>,
) -> Result<(), Error> {
    let wallet = match configs.wallet.as_mut() {
        Some(wallet) => wallet,
        None => return Ok(()),
    };
    if wallet.private_key.is_empty() || is_valid_private_key(&wallet.private_key) {
        return Ok(());
    }

    let pass = pass.ok_or_else(|| {
        error!(
            "the wallet private key in the config file is encrypted but SAITO_PASS is not set. \
             set SAITO_PASS to the password it was encrypted with, or replace the privateKey \
             value with a plaintext key."
        );
        Error::from(ErrorKind::InvalidInput)
    })?;

    let decrypted = decrypt_bytes(pass, &wallet.private_key)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .filter(|key| is_valid_private_key(key))
        .ok_or_else(|| {
            error!(
                "could not decrypt the wallet private key in the config file. SAITO_PASS is \
                 most likely incorrect. the config file has not been modified."
            );
            Error::from(ErrorKind::InvalidInput)
        })?;

    wallet.private_key = decrypted;
    Ok(())
}

/// write via a sibling temp file so an interrupted save can't leave a half-written config behind
fn write_config_file(path: &str, contents: &[u8]) -> Result<(), Error> {
    let temp_path = format!("{}.tmp", path);
    std::fs::write(&temp_path, contents)?;
    std::fs::rename(&temp_path, path)
}

impl Configuration for NodeConfigurations {
    fn get_server_configs(&self) -> Option<&Server> {
        Some(&self.server)
    }

    fn get_peer_configs(&self) -> &Vec<PeerConfig> {
        &self.peers
    }

    fn get_blockchain_configs(&self) -> &BlockchainConfig {
        &self.blockchain
    }
    fn get_blockchain_configs_mut(&mut self) -> &mut BlockchainConfig {
        &mut self.blockchain
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
        self.blockchain = config.get_blockchain_configs().clone();
        self.wallet = config.get_wallet_configs().cloned();
    }

    fn get_consensus_config(&self) -> Option<&ConsensusConfig> {
        self.consensus.as_ref()
    }

    fn save(&self) -> Result<(), Error> {
        let config_file_path = self.get_config_path();
        let mut value = serde_json::to_value(self)?;
        encrypt_private_key_for_saving(&mut value, saito_pass().as_deref())?;
        let json = serde_json::to_string_pretty(&value)?;
        write_config_file(&config_file_path, json.as_bytes())
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

    //     fn set_blockchain_configs(&mut self, config: Option<BlockchainConfig>) {
    //         self.blockchain = config;
    //     }
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
        let pass = saito_pass();

        // Read file; plaintext json, or a legacy fully encrypted config we migrate away from
        let raw = std::fs::read_to_string(config_file_path.clone())?;
        let content = if looks_like_json(&raw) {
            raw
        } else {
            let pass = pass.as_deref().ok_or_else(|| {
                error!(
                    "the config file is not json and SAITO_PASS is not set. legacy fully \
                     encrypted config files need SAITO_PASS to be read."
                );
                std::io::Error::from(ErrorKind::InvalidInput)
            })?;
            // legacy format : the whole file was encrypted, with or without the ENC1: header
            let decrypted = decrypt_bytes(pass, &raw).map_err(|_| {
                error!("failed loading configs: unrecognized format and decryption failed");
                std::io::Error::from(ErrorKind::InvalidInput)
            })?;
            warn!(
                "loaded a legacy fully encrypted config file. it will be rewritten as plaintext \
                 json with only the wallet private key encrypted on the next save."
            );
            String::from_utf8(decrypted)
                .map_err(|_| std::io::Error::from(ErrorKind::InvalidInput))?
        };

        let configs = serde_json::from_str::<NodeConfigurations>(&content);

        if configs.is_err() {
            error!("failed loading configs. {:?}", configs.err().unwrap());
            return Err(std::io::Error::from(ErrorKind::InvalidInput));
        }
        let mut configs = configs.unwrap();
        configs.set_config_path(config_file_path.clone());
        decrypt_private_key_after_loading(&mut configs, pass.as_deref())?;

        Ok(configs)
    }
}

#[cfg(test)]
mod test {
    use std::io::ErrorKind;

    use saito_core::core::util::configuration::{Configuration, WalletConfig};

    use super::*;

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

    const TEST_PRIVATE_KEY: &str =
        "854702489d49c7fb2334005b903580c7a48fe81121ff16ee6d1a528ad32f235d";

    #[test]
    fn private_key_validation() {
        assert!(is_valid_private_key(TEST_PRIVATE_KEY));
        assert!(!is_valid_private_key(""));
        assert!(!is_valid_private_key("not a key"));
        // right length, wrong alphabet
        assert!(!is_valid_private_key(&"z".repeat(64)));
        // right alphabet, wrong length
        assert!(!is_valid_private_key(&TEST_PRIVATE_KEY[..62]));
        // ciphertext must never be mistaken for a key
        let encrypted = encrypt_bytes("pass", TEST_PRIVATE_KEY.as_bytes()).unwrap();
        assert!(!is_valid_private_key(&encrypted));
    }

    #[test]
    fn private_key_encryption_round_trip() {
        let encrypted = encrypt_bytes("correct horse", TEST_PRIVATE_KEY.as_bytes()).unwrap();
        assert!(encrypted.starts_with(ENC_HEADER));

        let decrypted = decrypt_bytes("correct horse", &encrypted).unwrap();
        assert_eq!(String::from_utf8(decrypted).unwrap(), TEST_PRIVATE_KEY);

        assert!(decrypt_bytes("wrong pass", &encrypted).is_err());
    }

    #[test]
    fn saved_private_key_is_encrypted_in_place() {
        let mut value = serde_json::json!({
            "server": { "host": "127.0.0.1" },
            "wallet": { "publicKey": "abc", "privateKey": TEST_PRIVATE_KEY }
        });

        encrypt_private_key_for_saving(&mut value, Some("hunter2")).unwrap();

        // the rest of the config stays readable
        assert_eq!(value["server"]["host"], "127.0.0.1");
        assert_eq!(value["wallet"]["publicKey"], "abc");

        let stored = value["wallet"]["privateKey"].as_str().unwrap();
        assert_ne!(stored, TEST_PRIVATE_KEY);
        assert!(stored.starts_with(ENC_HEADER));
        assert_eq!(
            String::from_utf8(decrypt_bytes("hunter2", stored).unwrap()).unwrap(),
            TEST_PRIVATE_KEY
        );
    }

    #[test]
    fn saved_private_key_is_plaintext_without_pass() {
        let mut value = serde_json::json!({
            "wallet": { "privateKey": TEST_PRIVATE_KEY }
        });

        encrypt_private_key_for_saving(&mut value, None).unwrap();

        assert_eq!(value["wallet"]["privateKey"], TEST_PRIVATE_KEY);
    }

    #[test]
    fn saving_never_double_encrypts() {
        let encrypted = encrypt_bytes("hunter2", TEST_PRIVATE_KEY.as_bytes()).unwrap();
        let mut value = serde_json::json!({
            "wallet": { "privateKey": encrypted }
        });

        encrypt_private_key_for_saving(&mut value, Some("hunter2")).unwrap();

        assert_eq!(value["wallet"]["privateKey"], encrypted);
    }

    fn configs_with_private_key(private_key: &str) -> NodeConfigurations {
        NodeConfigurations {
            wallet: Some(WalletConfig {
                public_key: String::new(),
                private_key: private_key.to_string(),
            }),
            ..Default::default()
        }
    }

    #[test]
    fn plaintext_private_key_loads_unchanged() {
        // a plaintext key is used as-is whether or not a password is set
        for pass in [Some("hunter2"), None] {
            let mut configs = configs_with_private_key(TEST_PRIVATE_KEY);
            decrypt_private_key_after_loading(&mut configs, pass).unwrap();
            assert_eq!(
                configs.get_wallet_configs().unwrap().private_key,
                TEST_PRIVATE_KEY
            );
        }
    }

    #[test]
    fn encrypted_private_key_loads_with_correct_pass() {
        let encrypted = encrypt_bytes("hunter2", TEST_PRIVATE_KEY.as_bytes()).unwrap();
        let mut configs = configs_with_private_key(&encrypted);

        decrypt_private_key_after_loading(&mut configs, Some("hunter2")).unwrap();

        assert_eq!(
            configs.get_wallet_configs().unwrap().private_key,
            TEST_PRIVATE_KEY
        );
    }

    #[test]
    fn encrypted_private_key_fails_without_pass() {
        let encrypted = encrypt_bytes("hunter2", TEST_PRIVATE_KEY.as_bytes()).unwrap();
        let mut configs = configs_with_private_key(&encrypted);

        let result = decrypt_private_key_after_loading(&mut configs, None);

        assert_eq!(result.unwrap_err().kind(), ErrorKind::InvalidInput);
        // the in-memory key is untouched, so nothing can be written back over the config
        assert_eq!(configs.get_wallet_configs().unwrap().private_key, encrypted);
    }

    #[test]
    fn encrypted_private_key_fails_with_wrong_pass() {
        let encrypted = encrypt_bytes("hunter2", TEST_PRIVATE_KEY.as_bytes()).unwrap();
        let mut configs = configs_with_private_key(&encrypted);

        let result = decrypt_private_key_after_loading(&mut configs, Some("hunter3"));

        assert_eq!(result.unwrap_err().kind(), ErrorKind::InvalidInput);
        assert_eq!(configs.get_wallet_configs().unwrap().private_key, encrypted);
    }

    #[test]
    fn empty_private_key_is_left_alone() {
        let mut configs = configs_with_private_key("");
        decrypt_private_key_after_loading(&mut configs, None).unwrap();
        assert_eq!(configs.get_wallet_configs().unwrap().private_key, "");
    }
}
