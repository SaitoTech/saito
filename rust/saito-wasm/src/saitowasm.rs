use std::io::{Error, ErrorKind};
use std::ops::{Deref, DerefMut};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use crate::wasm_balance_snapshot::WasmBalanceSnapshot;
use crate::wasm_block::WasmBlock;
use crate::wasm_blockchain::WasmBlockchain;
use crate::wasm_configuration::WasmConfiguration;
use crate::wasm_io_handler::WasmIoHandler;
use crate::wasm_nft::WasmNFT;
use crate::wasm_peer::WasmPeer;
use crate::wasm_slip::WasmSlip;
use crate::wasm_stats::WasmStats;
use crate::wasm_time_keeper::WasmTimeKeeper;
use crate::wasm_transaction::WasmTransaction;
use crate::wasm_wallet::WasmWallet;
use js_sys::{Array, BigInt, JsString, Uint8Array};
use lazy_static::lazy_static;
use log::{debug, error, info, trace, warn, Level, Log, Metadata, Record};
use saito_core::core::consensus::blockchain::Blockchain;
use saito_core::core::consensus::blockchain_sync_state::BlockchainSyncState;
use saito_core::core::consensus::context::Context;
use saito_core::core::consensus::mempool::Mempool;
use saito_core::core::consensus::peers::peer_collection::PeerCollection;
use saito_core::core::consensus::transaction::{Transaction, TransactionType};
use saito_core::core::consensus::wallet::{DetailedNFT, Wallet};
use saito_core::core::consensus_thread::{ConsensusEvent, ConsensusStats, ConsensusThread};
use saito_core::core::defs::{
    BlockId, Currency, PeerIndex, PrintForLog, SaitoPrivateKey, SaitoPublicKey, SaitoUTXOSetKey,
    StatVariable, Timestamp, CHANNEL_SAFE_BUFFER, STAT_BIN_COUNT,
};
use saito_core::core::io::network::{Network, PeerDisconnectType};
use saito_core::core::io::network_event::NetworkEvent;
use saito_core::core::io::storage::Storage;
use saito_core::core::mining_thread::{MiningEvent, MiningThread};
use saito_core::core::msg::api_message::ApiMessage;
use saito_core::core::msg::message::Message;
use saito_core::core::process::keep_time::Timer;
use saito_core::core::process::process_event::ProcessEvent;
use saito_core::core::process::version::Version;
use saito_core::core::routing_thread::{RoutingEvent, RoutingStats, RoutingThread};
use saito_core::core::stat_thread::{StatEvent, StatThread};
use saito_core::core::util::configuration::Configuration;
use saito_core::core::util::crypto::{generate_keypair_from_private_key, sign};
use saito_core::core::verification_thread::{VerificationThread, VerifyRequest};
use secp256k1::SECP256K1;
use serde::Serialize;
use std::convert::TryInto;
use tokio::sync::mpsc::Receiver;
use tokio::sync::{Mutex, RwLock};
use wasm_bindgen::prelude::*;
use web_sys::console;

#[wasm_bindgen]
pub struct SaitoWasm {
    pub(crate) routing_thread: RoutingThread,
    consensus_thread: ConsensusThread,
    mining_thread: MiningThread,
    verification_thread: VerificationThread,
    stat_thread: StatThread,
    receiver_for_router: Receiver<RoutingEvent>,
    receiver_for_consensus: Receiver<ConsensusEvent>,
    receiver_for_miner: Receiver<MiningEvent>,
    receiver_for_verification: Receiver<VerifyRequest>,
    receiver_for_stats: Receiver<StatEvent>,
    pub(crate) context: Context,
    wallet: WasmWallet,
    blockchain: WasmBlockchain,
}

lazy_static! {
    pub static ref SAITO: Mutex<Option<SaitoWasm>> =
        Mutex::new(Some(new(1, true, 100_000, 0, 60, false)));
    static ref CONFIGS: Arc<RwLock<dyn Configuration + Send + Sync>> =
        Arc::new(RwLock::new(WasmConfiguration::new()));
    static ref PRIVATE_KEY: Mutex<String> = Mutex::new("".to_string());
}

pub fn new(
    haste_multiplier: u64,
    enable_stats: bool,
    genesis_period: BlockId,
    social_stake: Currency,
    social_stake_period: BlockId,
    delete_old_blocks: bool,
) -> SaitoWasm {
    info!("creating new saito wasm instance");
    console_error_panic_hook::set_once();

    let wallet = Arc::new(RwLock::new(Wallet::new([0; 32], [0; 33])));

    let configuration: Arc<RwLock<dyn Configuration + Send + Sync>> = CONFIGS.clone();

    let channel_size = 1_000_000;

    if channel_size < CHANNEL_SAFE_BUFFER * 2 {
        error!(
            "channel_size < CHANNEL_SAFE_BUFFER x 2 : {:?}",
            CHANNEL_SAFE_BUFFER * 2
        );
        panic!("cannot continue");
    }

    let peers = Arc::new(RwLock::new(PeerCollection::default()));
    let context = Context {
        blockchain_lock: Arc::new(RwLock::new(Blockchain::new(
            wallet.clone(),
            genesis_period,
            social_stake,
            social_stake_period,
        ))),
        mempool_lock: Arc::new(RwLock::new(Mempool::new(wallet.clone()))),
        wallet_lock: wallet.clone(),
        config_lock: configuration.clone(),
    };

    let (sender_to_consensus, receiver_in_mempool) = tokio::sync::mpsc::channel(channel_size);
    let (sender_to_blockchain, receiver_in_blockchain) = tokio::sync::mpsc::channel(channel_size);
    let (sender_to_miner, receiver_in_miner) = tokio::sync::mpsc::channel(channel_size);
    let (sender_to_stat, receiver_in_stats) = tokio::sync::mpsc::channel(channel_size);
    let (sender_to_verification, receiver_in_verification) =
        tokio::sync::mpsc::channel(channel_size);

    let timer = Timer {
        time_reader: Arc::new(WasmTimeKeeper {}),
        hasten_multiplier: haste_multiplier,
        start_time: js_sys::Date::now() as Timestamp,
    };

    SaitoWasm {
        routing_thread: RoutingThread {
            blockchain_lock: context.blockchain_lock.clone(),
            mempool_lock: context.mempool_lock.clone(),
            sender_to_consensus: sender_to_consensus.clone(),
            sender_to_miner: sender_to_miner.clone(),
            config_lock: context.config_lock.clone(),
            timer: timer.clone(),
            wallet_lock: wallet.clone(),
            network: Network::new(
                Box::new(WasmIoHandler {}),
                peers.clone(),
                context.wallet_lock.clone(),
                context.config_lock.clone(),
                timer.clone(),
            ),
            storage: Storage::new(Box::new(WasmIoHandler {})),
            reconnection_timer: 0,
            peer_removal_timer: 0,
            peer_file_write_timer: 0,
            last_emitted_block_fetch_count: 0,
            stats: RoutingStats::new(sender_to_stat.clone()),
            senders_to_verification: vec![sender_to_verification.clone()],
            last_verification_thread_index: 0,
            stat_sender: sender_to_stat.clone(),
            blockchain_sync_state: BlockchainSyncState::new(10),
        },
        consensus_thread: ConsensusThread {
            mempool_lock: context.mempool_lock.clone(),
            blockchain_lock: context.blockchain_lock.clone(),
            wallet_lock: context.wallet_lock.clone(),
            generate_genesis_block: false,
            sender_to_router: sender_to_blockchain.clone(),
            sender_to_miner: sender_to_miner.clone(),
            block_producing_timer: 0,
            timer: timer.clone(),
            network: Network::new(
                Box::new(WasmIoHandler {}),
                peers.clone(),
                context.wallet_lock.clone(),
                configuration.clone(),
                timer.clone(),
            ),
            storage: Storage::new(Box::new(WasmIoHandler {})),
            stats: ConsensusStats::new(sender_to_stat.clone()),
            txs_for_mempool: vec![],
            stat_sender: sender_to_stat.clone(),
            config_lock: configuration.clone(),
            produce_blocks_by_timer: true,
            delete_old_blocks,
        },
        mining_thread: MiningThread {
            wallet_lock: context.wallet_lock.clone(),
            sender_to_mempool: sender_to_consensus.clone(),
            timer: timer.clone(),
            miner_active: false,
            target: [0; 32],
            target_id: 0,
            difficulty: 0,
            public_key: [0; 33],
            mined_golden_tickets: 0,
            stat_sender: sender_to_stat.clone(),
            config_lock: configuration.clone(),
            enabled: true,
            mining_iterations: 1_000,
            mining_start: 0,
        },
        verification_thread: VerificationThread {
            sender_to_consensus: sender_to_consensus.clone(),
            blockchain_lock: context.blockchain_lock.clone(),
            peer_lock: peers.clone(),
            wallet_lock: wallet.clone(),
            processed_txs: StatVariable::new(
                "verification::processed_txs".to_string(),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            processed_blocks: StatVariable::new(
                "verification::processed_blocks".to_string(),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            processed_msgs: StatVariable::new(
                "verification::processed_msgs".to_string(),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            invalid_txs: StatVariable::new(
                "verification::invalid_txs".to_string(),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            stat_sender: sender_to_stat.clone(),
        },
        stat_thread: StatThread {
            stat_queue: Default::default(),
            io_interface: Box::new(WasmIoHandler {}),
            enabled: enable_stats,
            current_wallet_state: Default::default(),
            current_mining_state: Default::default(),
            current_blockchain_state: Default::default(),
            current_mempool_state: Default::default(),
            file_write_timer: 0,
        },
        receiver_for_router: receiver_in_blockchain,
        receiver_for_consensus: receiver_in_mempool,
        receiver_for_miner: receiver_in_miner,
        receiver_for_verification: receiver_in_verification,
        wallet: WasmWallet::new_from(
            context.wallet_lock.clone(),
            Network::new(
                Box::new(WasmIoHandler {}),
                peers.clone(),
                context.wallet_lock.clone(),
                configuration.clone(),
                timer.clone(),
            ),
        ),
        blockchain: WasmBlockchain {
            blockchain_lock: context.blockchain_lock.clone(),
        },
        context,
        receiver_for_stats: receiver_in_stats,
    }
}

struct WasmLogger {}

impl Log for WasmLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        log(record)
    }

    fn flush(&self) {}
}
pub(crate) struct Style<'s> {
    pub trace: &'s str,
    pub debug: &'s str,
    pub info: &'s str,
    pub warn: &'s str,
    pub error: &'s str,
    pub file_line: &'s str,
    pub text: &'s str,
}

impl Style<'static> {
    /// Returns default style values.
    pub const fn default() -> Self {
        macro_rules! bg_color {
            ($color:expr) => {
                concat!("color: white; padding: 0 3px; background: ", $color, ";")
            };
        }

        Style {
            trace: bg_color!("gray"),
            debug: bg_color!("blue"),
            info: bg_color!("green"),
            warn: bg_color!("orange"),
            error: bg_color!("darkred"),
            file_line: "font-weight: bold; color: inherit",
            text: "background: inherit; color: inherit",
        }
    }
}
const STYLE: Style<'static> = Style::default();

pub fn log(record: &Record) {
    let console_log = match record.level() {
        Level::Error => console::error_4,
        Level::Warn => console::warn_4,
        Level::Info => console::info_4,
        Level::Debug => console::debug_4,
        Level::Trace => console::debug_4,
    };

    let message = {
        let message = format!(
            "%c%c%c{text}",
            // level = record.level(),
            // file = record.file().unwrap_or_else(|| record.target()),
            // line = record
            //     .line()
            //     .map_or_else(|| "[Unknown]".to_string(), |line| line.to_string()),
            text = record.args(),
        );
        JsValue::from(&message)
    };

    let level_style = {
        let style_str = match record.level() {
            Level::Trace => STYLE.trace,
            Level::Debug => STYLE.debug,
            Level::Info => STYLE.info,
            Level::Warn => STYLE.warn,
            Level::Error => STYLE.error,
        };

        JsValue::from(style_str)
    };

    let file_line_style = JsValue::from_str(STYLE.file_line);
    let text_style = JsValue::from_str(STYLE.text);
    console_log(&message, &level_style, &file_line_style, &text_style);
}

#[wasm_bindgen]
pub async fn initialize(
    json: JsString,
    private_key: JsString,
    log_level_num: u8,
    hasten_multiplier: u64,
    delete_old_blocks: bool,
) -> Result<JsValue, JsValue> {
    // TODO : move these parameters to a config object to clean the interface

    let log_level = match log_level_num {
        0 => log::Level::Error,
        1 => log::Level::Warn,
        2 => log::Level::Info,
        3 => log::Level::Debug,
        4 => log::Level::Trace,
        _ => log::Level::Info,
    };

    log::set_logger(&WasmLogger {}).unwrap();
    log::set_max_level(log_level.to_level_filter());

    // console_log::init_with_level(log_level).unwrap();

    trace!("trace test");
    debug!("debug test");
    info!("initializing saito-wasm  2");

    let mut enable_stats = true;
    let mut genesis_period = 100_000;
    let mut social_stake = 0;
    let mut social_stake_period = 60;
    {
        info!("setting configs...");
        let mut configs = CONFIGS.write().await;
        info!("config lock acquired");

        let str: String = json.into();
        let config = WasmConfiguration::new_from_json(str.as_str());

        if config.is_err() {
            error!("failed parsing configs. {:?}", config.err().unwrap());
        } else {
            let config = config.unwrap();
            if config.is_browser() {
                enable_stats = false;
            }
            info!("config : {:?}", config);
            configs.replace(&config);
            genesis_period = configs.get_consensus_config().unwrap().genesis_period;
            social_stake = configs.get_consensus_config().unwrap().default_social_stake;
            social_stake_period = configs
                .get_consensus_config()
                .unwrap()
                .default_social_stake_period;
        }
    }

    let mut saito = SAITO.lock().await;

    info!("genesis_period = {:?}", genesis_period);
    info!("social_stake = {:?}", social_stake);
    saito.replace(new(
        hasten_multiplier,
        enable_stats,
        genesis_period,
        social_stake,
        social_stake_period,
        delete_old_blocks,
    ));

    let private_key: SaitoPrivateKey = string_to_hex(private_key).or(Err(JsValue::from(
        "Failed parsing private key string to key",
    )))?;
    {
        let mut wallet = saito.as_ref().unwrap().context.wallet_lock.write().await;
        if private_key != [0; 32] {
            let keys = generate_keypair_from_private_key(private_key.as_slice());
            wallet.private_key = keys.1;
            wallet.public_key = keys.0;
        }
        info!("current core version : {:?}", wallet.core_version);
    }

    saito.as_mut().unwrap().stat_thread.on_init().await;
    saito.as_mut().unwrap().mining_thread.on_init().await;
    saito.as_mut().unwrap().verification_thread.on_init().await;
    saito.as_mut().unwrap().routing_thread.on_init().await;
    saito.as_mut().unwrap().consensus_thread.on_init().await;

    Ok(JsValue::from("initialized"))
}

#[wasm_bindgen]
pub async fn create_transaction(
    public_key: JsString,
    amount: u64,
    fee: u64,
    force_merge: bool,
) -> Result<WasmTransaction, JsValue> {
    trace!("create_transaction : {:?}", public_key.to_string());
    let saito = SAITO.lock().await;
    let mut wallet = saito.as_ref().unwrap().context.wallet_lock.write().await;
    let key = string_to_key(public_key).or(Err(JsValue::from(
        "Failed parsing public key string to key",
    )))?;

    let config_lock = saito.as_ref().unwrap().routing_thread.config_lock.clone();
    let configs = config_lock.read().await;
    let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
    let blockchain = saito.as_ref().unwrap().context.blockchain_lock.read().await;
    let latest_block_id = blockchain.get_latest_block_id();

    let transaction = Transaction::create(
        &mut wallet,
        key,
        amount,
        fee,
        force_merge,
        Some(&saito.as_ref().unwrap().consensus_thread.network),
        latest_block_id,
        genesis_period,
    );
    if transaction.is_err() {
        error!(
            "failed creating transaction. {:?}",
            transaction.err().unwrap()
        );
        return Err(JsValue::from("Failed creating transaction"));
    }
    let transaction = transaction.unwrap();
    let wasm_transaction = WasmTransaction::from_transaction(transaction);
    Ok(wasm_transaction)
}

#[wasm_bindgen]
pub async fn create_transaction_with_multiple_payments(
    public_keys: js_sys::Array,
    amounts: js_sys::BigUint64Array,
    fee: u64,
    _force_merge: bool,
) -> Result<WasmTransaction, JsValue> {
    let saito = SAITO.lock().await;
    let mut wallet = saito.as_ref().unwrap().context.wallet_lock.write().await;

    let config_lock = saito.as_ref().unwrap().routing_thread.config_lock.clone();
    let configs = config_lock.read().await;
    let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
    let blockchain = saito.as_ref().unwrap().context.blockchain_lock.read().await;
    let latest_block_id = blockchain.get_latest_block_id();

    let keys: Vec<SaitoPublicKey> = string_array_to_base58_keys(public_keys);
    let amounts: Vec<Currency> = amounts.to_vec();

    if keys.len() != amounts.len() {
        return Err(JsValue::from("keys and payments have different counts"));
    }

    let transaction = Transaction::create_with_multiple_payments(
        &mut wallet,
        keys,
        amounts,
        fee,
        Some(&saito.as_ref().unwrap().consensus_thread.network),
        latest_block_id,
        genesis_period,
    );
    if transaction.is_err() {
        error!(
            "failed creating transaction. {:?}",
            transaction.err().unwrap()
        );
        return Err(JsValue::from("Failed creating transaction"));
    }
    let transaction = transaction.unwrap();
    let wasm_transaction = WasmTransaction::from_transaction(transaction);
    Ok(wasm_transaction)
}

#[wasm_bindgen]
pub async fn create_bound_transaction(
    amt: u64,
    bid: u64,
    tid: u64,
    sid: u64,
    num: u32,
    deposit: u64,
    change: u64,
    data: String,
    fee: u64,
    recipient_public_key: JsString,
    nft_type: JsString,
) -> Result<WasmTransaction, JsValue> {
    let saito = SAITO.lock().await;
    let config_lock = saito.as_ref().unwrap().routing_thread.config_lock.clone();
    let configs = config_lock.read().await;
    let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
    let blockchain = saito.as_ref().unwrap().context.blockchain_lock.read().await;
    let latest_block_id = blockchain.get_latest_block_id();
    let mut wallet = saito.as_ref().unwrap().context.wallet_lock.write().await;

    info!("Received in saitowasm.rs:");
    info!("Amount: {}", amt);
    info!("Bid: {}", bid);
    info!("Tid: {}", tid);
    info!("Sid: {}", sid);
    info!("Num: {}", num);
    info!("Deposit: {}", deposit);
    info!("Change: {}", change);
    info!("Image data JSON: {}", data);
    info!("fee: {}", fee);
    info!("recipient_public_key: {}", recipient_public_key);

    // Convert the `data` string into a JSON object
    let serialized_data = match serde_json::to_vec(&data) {
        Ok(vec) => vec,
        Err(e) => {
            error!("Failed to serialize data: {}", e);
            return Err(JsValue::from_str("Failed to serialize data"));
        }
    };

    // Convert Vec<u8> into Vec<u32>
    let serialized_data_u32: Vec<u32> = serialized_data
        .chunks(4)
        .map(|chunk| {
            let mut bytes = [0u8; 4];
            for (i, &byte) in chunk.iter().enumerate() {
                bytes[i] = byte;
            }
            u32::from_le_bytes(bytes)
        })
        .collect();

    let key = string_to_key(recipient_public_key).or(Err(JsValue::from(
        "Failed parsing public key string to key",
    )))?;

    let transaction = wallet
        .create_bound_transaction(
            amt,
            bid,
            tid,
            sid,
            deposit,
            serialized_data_u32,
            &key,
            Some(&saito.as_ref().unwrap().consensus_thread.network),
            latest_block_id,
            genesis_period,
            nft_type.as_string().unwrap(),
        )
        .await;

    if transaction.is_err() {
        error!(
            "failed creating transaction. {:?}",
            transaction.err().unwrap()
        );
        return Err(JsValue::from("Failed creating transaction"));
    }

    let transaction = transaction.unwrap();

    info!("wasm transaction: {:}", transaction);
    let wasm_transaction = WasmTransaction::from_transaction(transaction);

    Ok(wasm_transaction)
}

#[wasm_bindgen]
pub async fn create_send_bound_transaction(
    amt: u64,
    slip1_utxo_key: JsString,
    slip2_utxo_key: JsString,
    slip3_utxo_key: JsString,
    data: String,
    recipient_public_key: JsString,
) -> Result<WasmTransaction, JsValue> {
    let saito = SAITO.lock().await;
    let mut wallet = saito.as_ref().unwrap().context.wallet_lock.write().await;

    let s1: SaitoUTXOSetKey =
        string_to_hex(slip1_utxo_key).map_err(|_| JsValue::from_str("Invalid slip1_utxo_key"))?;
    let s2: SaitoUTXOSetKey =
        string_to_hex(slip2_utxo_key).map_err(|_| JsValue::from_str("Invalid slip2_utxo_key"))?;
    let s3: SaitoUTXOSetKey =
        string_to_hex(slip3_utxo_key).map_err(|_| JsValue::from_str("Invalid slip3_utxo_key"))?;

    let serialized_data: Vec<u8> =
        serde_json::to_vec(&data).map_err(|_| JsValue::from_str("Failed to serialize data"))?;
    let serialized_data_u32: Vec<u32> = serialized_data
        .chunks(4)
        .map(|chunk| {
            let mut b = [0u8; 4];
            b[..chunk.len()].copy_from_slice(chunk);
            u32::from_le_bytes(b)
        })
        .collect();

    let key = string_to_key(recipient_public_key)
        .map_err(|_| JsValue::from_str("Bad recipient_public_key"))?;

    let tx = wallet
        .create_send_bound_transaction(amt, s1, s2, s3, serialized_data_u32, &key)
        .await
        .map_err(|_| JsValue::from_str("create_send_bound_transaction failed"))?;

    Ok(WasmTransaction::from_transaction(tx))
}

#[wasm_bindgen]
pub async fn get_nft_list() -> Result<Array, JsValue> {
    let saito = SAITO.lock().await;
    let wallet = saito.as_ref().unwrap().context.wallet_lock.read().await;

    let detailed_nfts: Vec<DetailedNFT> = wallet.get_nft_list();

    let js_array = Array::new_with_length(detailed_nfts.len() as u32);

    //
    // for each DetailedNFT, build a WasmNFT
    //
    for (id, nft) in detailed_nfts.into_iter().enumerate() {
        let mut w = WasmNFT::new();

        let id_arr = Uint8Array::from(nft.id.as_slice());
        w.set_id(&id_arr);

        let sig_arr = Uint8Array::from(nft.tx_sig.as_ref());
        w.set_tx_sig(&sig_arr);

        //
        // Slip to WasmSlip
        //
        let ws1 = WasmSlip::new_from_slip(nft.slip1);
        w.set_slip1(&ws1);
        let ws2 = WasmSlip::new_from_slip(nft.slip2);
        w.set_slip2(&ws2);
        let ws3 = WasmSlip::new_from_slip(nft.slip3);
        w.set_slip3(&ws3);

        js_array.set(id as u32, w.into());
    }

    Ok(js_array)
}

#[wasm_bindgen]
pub async fn get_latest_block_hash() -> JsString {
    debug!("get_latest_block_hash");
    let saito = SAITO.lock().await;
    let blockchain = saito.as_ref().unwrap().context.blockchain_lock.read().await;
    let hash = blockchain.get_latest_block_hash();

    hash.to_hex().into()
}

#[wasm_bindgen]
pub async fn get_block(block_hash: JsString) -> Result<WasmBlock, JsValue> {
    let block_hash = string_to_hex(block_hash).or(Err(JsValue::from(
        "Failed parsing block hash string to key",
    )))?;

    let saito = SAITO.lock().await;
    let blockchain = saito
        .as_ref()
        .unwrap()
        .routing_thread
        .blockchain_lock
        .read()
        .await;

    let result = blockchain.get_block(&block_hash);

    if result.is_none() {
        warn!("block {:?} not found", block_hash.to_hex());
        return Err(JsValue::from("block not found"));
    }
    let block = result.cloned().unwrap();

    Ok(WasmBlock::from_block(block))
}

#[wasm_bindgen]
pub async fn process_new_peer(peer_index: PeerIndex, ip: JsString) {
    debug!("process_new_peer : {:?} - {:?}", peer_index, ip);
    let mut saito = SAITO.lock().await;
    let s = ip.as_string();
    if s.is_none() {
        debug!("cannot parse ip string : {:?}", ip);
        return;
    }
    let ip = s;

    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::PeerConnectionResult {
            result: Ok((peer_index, ip)),
        })
        .await;
}

#[wasm_bindgen]
pub async fn process_stun_peer(peer_index: PeerIndex, public_key: JsString) -> Result<(), JsValue> {
    debug!(
        "processing stun peer with index: {:?} and public key: {:?} ",
        peer_index, public_key
    );
    let mut saito = SAITO.lock().await;
    let key: SaitoPublicKey = string_to_key(public_key.into())
        .map_err(|e| JsValue::from_str(&format!("Failed to parse public key: {}", e)))?;

    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::AddStunPeer {
            peer_index,
            public_key: key,
        })
        .await;
    Ok(())
}

#[wasm_bindgen]
pub async fn remove_stun_peer(peer_index: PeerIndex) {
    debug!(
        "removing stun peer with index: {:?} from netowrk ",
        peer_index
    );
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::RemoveStunPeer { peer_index })
        .await;
}

#[wasm_bindgen]
pub async fn get_next_peer_index() -> BigInt {
    let mut saito = SAITO.lock().await;
    let mut peers = saito
        .as_mut()
        .unwrap()
        .routing_thread
        .network
        .peer_lock
        .write()
        .await;

    BigInt::from(peers.peer_counter.get_next_index())
}

#[wasm_bindgen]
pub async fn process_peer_disconnection(peer_index: u64) {
    debug!("process_peer_disconnection : {:?}", peer_index);
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::PeerDisconnected {
            peer_index,
            disconnect_type: PeerDisconnectType::ExternalDisconnect,
        })
        .await;
}

#[wasm_bindgen]
pub async fn process_msg_buffer_from_peer(buffer: js_sys::Uint8Array, peer_index: u64) {
    let mut saito = SAITO.lock().await;
    let buffer = buffer.to_vec();

    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::IncomingNetworkMessage { peer_index, buffer })
        .await;
}

#[wasm_bindgen]
pub async fn process_fetched_block(
    buffer: js_sys::Uint8Array,
    hash: js_sys::Uint8Array,
    block_id: BlockId,
    peer_index: PeerIndex,
) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::BlockFetched {
            block_hash: hash.to_vec().try_into().unwrap(),
            block_id,
            peer_index,
            buffer: buffer.to_vec(),
        })
        .await;
}

#[wasm_bindgen]
pub async fn process_failed_block_fetch(hash: js_sys::Uint8Array, block_id: u64, peer_index: u64) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .process_network_event(NetworkEvent::BlockFetchFailed {
            block_hash: hash.to_vec().try_into().unwrap(),
            peer_index,
            block_id,
        })
        .await;
}

#[wasm_bindgen]
pub async fn process_timer_event(duration_in_ms: u64) {
    let mut saito = SAITO.lock().await;
    let saito = saito.as_mut().unwrap();

    let duration = Duration::from_millis(duration_in_ms);
    const EVENT_LIMIT: u32 = 100;
    let mut event_counter = 0;

    while let Ok(event) = saito.receiver_for_router.try_recv() {
        let _result = saito.routing_thread.process_event(event).await;
        event_counter += 1;
        if event_counter >= EVENT_LIMIT {
            break;
        }
        if !saito.routing_thread.is_ready_to_process() {
            break;
        }
    }

    saito.routing_thread.process_timer_event(duration).await;

    event_counter = 0;
    while let Ok(event) = saito.receiver_for_consensus.try_recv() {
        let _result = saito.consensus_thread.process_event(event).await;
        event_counter += 1;
        if event_counter >= EVENT_LIMIT {
            break;
        }
        if !saito.consensus_thread.is_ready_to_process() {
            break;
        }
    }

    saito.consensus_thread.process_timer_event(duration).await;

    event_counter = 0;
    while let Ok(event) = saito.receiver_for_verification.try_recv() {
        let _result = saito.verification_thread.process_event(event).await;
        event_counter += 1;
        if event_counter >= EVENT_LIMIT {
            break;
        }
        if !saito.verification_thread.is_ready_to_process() {
            break;
        }
    }

    saito
        .verification_thread
        .process_timer_event(duration)
        .await;

    event_counter = 0;
    while let Ok(event) = saito.receiver_for_miner.try_recv() {
        let _result = saito.mining_thread.process_event(event).await;
        event_counter += 1;
        if event_counter >= EVENT_LIMIT {
            break;
        }
        if !saito.mining_thread.is_ready_to_process() {
            break;
        }
    }

    saito.mining_thread.process_timer_event(duration).await;

    saito.stat_thread.process_timer_event(duration).await;

    event_counter = 0;
    while let Ok(event) = saito.receiver_for_stats.try_recv() {
        let _result = saito.stat_thread.process_event(event).await;
        event_counter += 1;
        if event_counter >= EVENT_LIMIT {
            break;
        }
        if !saito.stat_thread.is_ready_to_process() {
            break;
        }
    }
}

#[wasm_bindgen]
pub async fn process_stat_interval(current_time: Timestamp) {
    let mut saito = SAITO.lock().await;

    saito
        .as_mut()
        .unwrap()
        .routing_thread
        .on_stat_interval(current_time)
        .await;

    saito
        .as_mut()
        .unwrap()
        .consensus_thread
        .on_stat_interval(current_time)
        .await;

    saito
        .as_mut()
        .unwrap()
        .verification_thread
        .on_stat_interval(current_time)
        .await;

    saito
        .as_mut()
        .unwrap()
        .mining_thread
        .on_stat_interval(current_time)
        .await;
}

#[wasm_bindgen]
pub fn hash(buffer: Uint8Array) -> JsString {
    let buffer: Vec<u8> = buffer.to_vec();
    let hash = saito_core::core::util::crypto::hash(&buffer);
    let str = hash.to_hex();
    let str: js_sys::JsString = str.into();
    str
}

#[wasm_bindgen]
pub fn sign_buffer(buffer: Uint8Array, private_key: JsString) -> Result<JsString, JsValue> {
    let buffer = buffer.to_vec();
    let key = string_to_hex(private_key).or(Err(JsValue::from(
        "Failed parsing private key string to key",
    )))?;
    let result = sign(&buffer, &key);

    let signature = result.to_hex();
    Ok(signature.into())
}

#[wasm_bindgen]
pub fn verify_signature(buffer: Uint8Array, signature: JsString, public_key: JsString) -> bool {
    let sig = string_to_hex(signature);
    if sig.is_err() {
        error!("signature is invalid");
        return false;
    }
    let sig = sig.unwrap();
    let key = string_to_key(public_key);
    if key.is_err() {
        error!(
            "failed parsing public key from string. {:?}",
            key.err().unwrap()
        );
        return false;
    }
    let buffer = buffer.to_vec();
    let h = saito_core::core::util::crypto::hash(&buffer);
    saito_core::core::util::crypto::verify_signature(&h, &sig, &key.unwrap())
}

#[wasm_bindgen]
pub async fn get_peers() -> Array {
    let saito = SAITO.lock().await;
    let peers = saito
        .as_ref()
        .unwrap()
        .routing_thread
        .network
        .peer_lock
        .read()
        .await;
    let valid_peer_count = peers
        .index_to_peers
        .iter()
        .filter(|(_index, peer)| peer.get_public_key().is_some())
        .count();
    let array = Array::new_with_length(valid_peer_count as u32);
    let mut array_index = 0;
    for (_i, (_peer_index, peer)) in peers.index_to_peers.iter().enumerate() {
        if peer.get_public_key().is_none() {
            continue;
        }
        let peer = peer.clone();
        array.set(
            array_index as u32,
            JsValue::from(WasmPeer::new_from_peer(peer)),
        );
        array_index += 1;
    }
    array
}

#[wasm_bindgen]
pub async fn get_peer(peer_index: u64) -> Option<WasmPeer> {
    let saito = SAITO.lock().await;
    let peers = saito
        .as_ref()
        .unwrap()
        .routing_thread
        .network
        .peer_lock
        .read()
        .await;
    let peer = peers.find_peer_by_index(peer_index);
    if peer.is_none() || peer.unwrap().get_public_key().is_none() {
        warn!("peer not found");
        return None;
    }
    let peer = peer.cloned().unwrap();
    Some(WasmPeer::new_from_peer(peer))
}

#[wasm_bindgen]
pub async fn get_account_slips(public_key: JsString) -> Result<Array, JsValue> {
    let saito = SAITO.lock().await;
    let blockchain = saito
        .as_ref()
        .unwrap()
        .routing_thread
        .blockchain_lock
        .read()
        .await;
    let key = string_to_key(public_key).or(Err(JsValue::from(
        "Failed parsing public key string to key",
    )))?;
    let mut slips = blockchain.get_slips_for(key);
    let array = js_sys::Array::new_with_length(slips.len() as u32);

    for (index, slip) in slips.drain(..).enumerate() {
        let wasm_slip = WasmSlip::new_from_slip(slip);
        array.set(index as u32, JsValue::from(wasm_slip));
    }

    Ok(array)
}

#[wasm_bindgen]
pub async fn get_balance_snapshot(keys: js_sys::Array) -> WasmBalanceSnapshot {
    let saito = SAITO.lock().await;
    let config_lock = saito.as_ref().unwrap().routing_thread.config_lock.clone();
    let configs = config_lock.read().await;
    let keys: Vec<SaitoPublicKey> = string_array_to_base58_keys(keys);

    let blockchain = saito
        .as_ref()
        .unwrap()
        .routing_thread
        .blockchain_lock
        .read()
        .await;
    let snapshot = blockchain.get_balance_snapshot(keys, configs.deref());

    WasmBalanceSnapshot::new(snapshot)
}

#[wasm_bindgen]
pub async fn update_from_balance_snapshot(snapshot: WasmBalanceSnapshot) {
    let saito = SAITO.lock().await;
    let mut wallet = saito
        .as_ref()
        .unwrap()
        .routing_thread
        .wallet_lock
        .write()
        .await;
    wallet.update_from_balance_snapshot(
        snapshot.get_snapshot(),
        Some(&saito.as_ref().unwrap().routing_thread.network),
    );
}

#[wasm_bindgen]
pub fn generate_private_key() -> JsString {
    info!("generate_private_key");
    let (_, private_key) = generate_keys_wasm();
    private_key.to_hex().into()
}

#[wasm_bindgen]
pub fn generate_public_key(private_key: JsString) -> Result<JsString, JsValue> {
    info!("generate_public_key");
    let private_key: SaitoPrivateKey = string_to_hex(private_key).or(Err(JsValue::from(
        "Failed parsing private key string to key",
    )))?;
    let (public_key, _) = generate_keypair_from_private_key(&private_key);
    Ok(public_key.to_base58().into())
}

#[wasm_bindgen]
pub async fn propagate_transaction(tx: &WasmTransaction) {
    trace!("propagate_transaction");

    let mut saito = SAITO.lock().await;
    let mut tx = tx.clone().tx;
    {
        let wallet = saito
            .as_ref()
            .unwrap()
            .routing_thread
            .wallet_lock
            .read()
            .await;
        tx.generate(&wallet.public_key, 0, 0);
    }
    saito
        .as_mut()
        .unwrap()
        .consensus_thread
        .process_event(ConsensusEvent::NewTransaction { transaction: tx })
        .await;
}

#[wasm_bindgen]
pub async fn send_api_call(buffer: Uint8Array, msg_index: u32, peer_index: PeerIndex) {
    trace!("send_api_call : {:?}", peer_index);
    let saito = SAITO.lock().await;
    let api_message = ApiMessage {
        msg_index,
        data: buffer.to_vec(),
    };
    let message = Message::ApplicationMessage(api_message);
    let buffer = message.serialize();
    if peer_index == 0 {
        saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .io_interface
            .send_message_to_all(buffer.as_slice(), vec![])
            .await
            .unwrap();
    } else {
        saito
            .as_ref()
            .unwrap()
            .routing_thread
            .network
            .io_interface
            .send_message(peer_index, buffer.as_slice())
            .await
            .unwrap();
    }
}

#[wasm_bindgen]
pub async fn send_api_success(buffer: Uint8Array, msg_index: u32, peer_index: PeerIndex) {
    trace!("send_api_success : {:?}", peer_index);
    let saito = SAITO.lock().await;
    let api_message = ApiMessage {
        msg_index,
        data: buffer.to_vec(),
    };
    let message = Message::Result(api_message);
    let buffer = message.serialize();

    saito
        .as_ref()
        .unwrap()
        .routing_thread
        .network
        .io_interface
        .send_message(peer_index, buffer.as_slice())
        .await
        .unwrap();
}

#[wasm_bindgen]
pub async fn send_api_error(buffer: Uint8Array, msg_index: u32, peer_index: PeerIndex) {
    trace!("send_api_error : {:?}", peer_index);
    let saito = SAITO.lock().await;
    let api_message = ApiMessage {
        msg_index,
        data: buffer.to_vec(),
    };
    let message = Message::Error(api_message);
    let buffer = message.serialize();

    saito
        .as_ref()
        .unwrap()
        .routing_thread
        .network
        .io_interface
        .send_message(peer_index, buffer.as_slice())
        .await
        .unwrap();
}

#[wasm_bindgen]
pub async fn get_wallet() -> WasmWallet {
    let saito = SAITO.lock().await;
    return saito.as_ref().unwrap().wallet.clone();
}

#[wasm_bindgen]
pub async fn get_blockchain() -> WasmBlockchain {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().blockchain.clone()
}

#[wasm_bindgen]
pub async fn get_mempool_txs() -> js_sys::Array {
    let saito = SAITO.lock().await;
    let mempool = saito
        .as_ref()
        .unwrap()
        .consensus_thread
        .mempool_lock
        .read()
        .await;
    let txs = js_sys::Array::new_with_length(mempool.transactions.len() as u32);
    for (index, (_, tx)) in mempool.transactions.iter().enumerate() {
        let wasm_tx = WasmTransaction::from_transaction(tx.clone());
        txs.set(index as u32, JsValue::from(wasm_tx));
    }

    txs
}

#[wasm_bindgen]
pub async fn set_wallet_version(major: u8, minor: u8, patch: u16) {
    let saito = SAITO.lock().await;
    let mut wallet = saito.as_ref().unwrap().wallet.wallet.write().await;
    wallet.wallet_version = Version {
        major,
        minor,
        patch,
    };
}

#[wasm_bindgen]
pub fn is_valid_public_key(key: JsString) -> bool {
    let result = string_to_key(key);
    if result.is_err() {
        return false;
    }
    let key: SaitoPublicKey = result.unwrap();
    saito_core::core::util::crypto::is_valid_public_key(&key)
}

#[wasm_bindgen]
pub async fn write_issuance_file(threshold: Currency) {
    let mut saito = SAITO.lock().await;
    let _configs_lock = saito.as_mut().unwrap().routing_thread.config_lock.clone();
    let _mempool_lock = saito.as_mut().unwrap().routing_thread.mempool_lock.clone();
    let blockchain_lock = saito
        .as_mut()
        .unwrap()
        .routing_thread
        .blockchain_lock
        .clone();
    let mut storage = &mut saito.as_mut().unwrap().consensus_thread.storage;
    // let _list = storage.load_block_name_list().await.unwrap();

    let blockchain = blockchain_lock.write().await;
    blockchain
        .write_issuance_file(threshold, "./data/issuance.file", &mut storage)
        .await;
}

#[wasm_bindgen]
pub async fn disable_producing_blocks_by_timer() {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .consensus_thread
        .produce_blocks_by_timer = false;
    // saito.as_mut().unwrap().mining_thread.enabled = true;
}
#[wasm_bindgen]
pub async fn produce_block_with_gt() -> bool {
    let mut saito = SAITO.lock().await;

    let config_lock = saito.as_ref().unwrap().routing_thread.config_lock.clone();
    let blockchain_lock = saito.as_ref().unwrap().blockchain.blockchain_lock.clone();
    let mempool_lock = saito
        .as_ref()
        .unwrap()
        .consensus_thread
        .mempool_lock
        .clone();
    let wallet_lock = saito.as_ref().unwrap().wallet.wallet.clone();

    let configs = config_lock.read().await;
    let blockchain = blockchain_lock.read().await;

    let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
    let latest_block_id = blockchain.get_latest_block_id();

    let mut mempool = mempool_lock.write().await;
    let public_key;
    let private_key;
    {
        let wallet = wallet_lock.read().await;
        public_key = wallet.public_key;
        private_key = wallet.private_key;
    }

    let gt_tx: Transaction;

    {
        let miner = &mut saito.as_mut().unwrap().mining_thread;
        if miner.target == [0; 32] {
            let blockchain = blockchain_lock.read().await;
            if let Some(block) = blockchain.get_latest_block() {
                miner.difficulty = block.difficulty;
                miner.target = block.hash;
                miner.target_id = block.id;
            } else {
                warn!("couldn't find the latest block");
            }
        }
        info!("mining for a gt. target : {:?}", miner.target.to_hex());

        loop {
            if let Some(gt) = miner.mine().await {
                info!("gt found : {:?}", gt.target.to_hex());

                let transaction =
                    Wallet::create_golden_ticket_transaction(gt, &public_key, &private_key).await;

                gt_tx = transaction;
                break;
            }
        }
    }

    {
        let mut wallet = wallet_lock.write().await;
        if let Ok(mut tx) = Transaction::create(
            &mut wallet,
            public_key,
            0,
            0,
            false,
            None,
            latest_block_id,
            genesis_period,
        ) {
            drop(wallet);
            info!("created tx");
            tx.transaction_type = TransactionType::Vip;
            tx.sign(&private_key);
            info!("tx signed");
            mempool.add_transaction_if_validates(tx, &blockchain).await;
            info!("Tx added to mempool");
        }
    }

    let timestamp = saito
        .as_ref()
        .unwrap()
        .consensus_thread
        .timer
        .get_timestamp_in_ms();

    info!("waiting till a block is produced");
    for _ in 0..1000 {
        if let Some(block) = saito
            .as_mut()
            .unwrap()
            .consensus_thread
            .produce_block(
                timestamp,
                Some(&gt_tx),
                mempool.deref_mut(),
                blockchain.deref(),
                configs.deref(),
            )
            .await
        {
            info!("produced block with gt");
            drop(mempool);
            drop(blockchain);
            drop(configs);
            saito
                .as_mut()
                .unwrap()
                .consensus_thread
                .process_event(ConsensusEvent::BlockFetched {
                    peer_index: 0,
                    block,
                })
                .await;
            return true;
        }
    }
    warn!("couldn't produce block");
    false
}

#[wasm_bindgen]
pub async fn produce_block_without_gt() -> bool {
    let mut saito = SAITO.lock().await;

    let config_lock = saito.as_ref().unwrap().routing_thread.config_lock.clone();
    let blockchain_lock = saito.as_ref().unwrap().blockchain.blockchain_lock.clone();
    let mempool_lock = saito
        .as_ref()
        .unwrap()
        .consensus_thread
        .mempool_lock
        .clone();
    let wallet_lock = saito.as_ref().unwrap().wallet.wallet.clone();

    let configs = config_lock.read().await;
    let blockchain = blockchain_lock.read().await;

    let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
    let latest_block_id = blockchain.get_latest_block_id();

    let mut mempool = mempool_lock.write().await;
    let public_key;
    let private_key;
    {
        let wallet = wallet_lock.read().await;
        public_key = wallet.public_key;
        private_key = wallet.private_key;
    }
    {
        info!(
            "clearing {:?} gts from mempool...",
            mempool.golden_tickets.len()
        );
        mempool.golden_tickets.clear();
    }
    {
        let mut wallet = wallet_lock.write().await;
        if let Ok(mut tx) = Transaction::create(
            &mut wallet,
            public_key,
            0,
            0,
            false,
            None,
            latest_block_id,
            genesis_period,
        ) {
            drop(wallet);
            info!("created tx");
            tx.transaction_type = TransactionType::Vip;
            tx.sign(&private_key);
            info!("tx signed");
            mempool.add_transaction_if_validates(tx, &blockchain).await;
            info!("Tx added to mempool");
        }
    }

    let timestamp = saito
        .as_ref()
        .unwrap()
        .consensus_thread
        .timer
        .get_timestamp_in_ms();

    info!("waiting till a block is produced");
    for _ in 0..1000 {
        if let Some(block) = saito
            .as_mut()
            .unwrap()
            .consensus_thread
            .produce_block(
                timestamp,
                None,
                mempool.deref_mut(),
                blockchain.deref(),
                configs.deref(),
            )
            .await
        {
            info!("produced block with gt");
            drop(mempool);
            drop(blockchain);
            drop(configs);
            saito
                .as_mut()
                .unwrap()
                .consensus_thread
                .process_event(ConsensusEvent::BlockFetched {
                    peer_index: 0,
                    block,
                })
                .await;
            return true;
        }
    }
    warn!("couldn't produce block");
    false
}

#[wasm_bindgen]
pub async fn get_stats() -> Result<JsString, JsValue> {
    let saito = SAITO.lock().await;
    let stat_thread = &saito.as_ref().unwrap().stat_thread;
    let stat = WasmStats {
        // current_peer_state: stat_thread.current_peer_state.clone(),
        current_wallet_state: stat_thread.current_wallet_state.clone(),
        current_blockchain_state: stat_thread.current_blockchain_state.clone(),
        current_mempool_state: stat_thread.current_mempool_state.clone(),
        current_mining_state: stat_thread.current_mining_state.clone(),
    };

    let str = serde_json::to_string(&stat)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize stats: {}", e)))?;
    Ok(str.into())
}

#[wasm_bindgen]
pub async fn get_peer_stats() -> Result<JsString, JsValue> {
    let saito = SAITO.lock().await;
    let peers = &saito
        .as_ref()
        .unwrap()
        .routing_thread
        .network
        .peer_lock
        .read()
        .await;

    let str = serde_json::to_string(peers.deref())
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize peer stats: {}", e)))?;
    Ok(str.into())
}

pub fn generate_keys_wasm() -> (SaitoPublicKey, SaitoPrivateKey) {
    let (mut secret_key, mut public_key) =
        SECP256K1.generate_keypair(&mut rand::rngs::OsRng::default());
    while public_key.serialize().to_base58().len() != 44 {
        // sometimes secp256k1 address is too big to store in 44 base-58 digits
        let keypair_tuple = SECP256K1.generate_keypair(&mut rand::rngs::OsRng::default());
        secret_key = keypair_tuple.0;
        public_key = keypair_tuple.1;
    }
    let mut secret_bytes = [0u8; 32];
    for i in 0..32 {
        secret_bytes[i] = secret_key[i];
    }
    (public_key.serialize(), secret_bytes)
}

pub fn string_to_key<T: TryFrom<Vec<u8>> + PrintForLog<T>>(key: JsString) -> Result<T, Error>
where
    <T as TryFrom<Vec<u8>>>::Error: std::fmt::Debug,
{
    let str = key.as_string();
    if str.is_none() {
        error!("cannot convert wasm string to rust string");
        return Err(Error::from(ErrorKind::InvalidInput));
    }

    let str = str.unwrap();
    if str.is_empty() {
        // debug!("cannot convert empty string to key");
        return Err(Error::from(ErrorKind::InvalidInput));
    }

    let key = T::from_base58(str.as_str());
    if key.is_err() {
        // error!(
        //     "failed parsing key : {:?}. str : {:?}",
        //     key.err().unwrap(),
        //     str
        // );
        return Err(Error::from(ErrorKind::InvalidInput));
    }
    let key = key.unwrap();
    Ok(key)
}

pub fn string_to_hex<T: TryFrom<Vec<u8>> + PrintForLog<T>>(key: JsString) -> Result<T, Error>
where
    <T as TryFrom<Vec<u8>>>::Error: std::fmt::Debug,
{
    let str = key.as_string();
    if str.is_none() {
        // error!("cannot convert wasm string to rust string");
        return Err(Error::from(ErrorKind::InvalidInput));
    }

    let str = str.unwrap();
    if str.is_empty() {
        debug!("cannot convert empty string to hex");
        return Err(Error::from(ErrorKind::InvalidInput));
    }

    let key = T::from_hex(str.as_str());
    if key.is_err() {
        error!(
            "failed parsing hex : {:?}. str : {:?}",
            key.err().unwrap(),
            str
        );
        return Err(Error::from(ErrorKind::InvalidInput));
    }
    let key = key.unwrap();
    Ok(key)
}

pub fn string_array_to_base58_keys<T: TryFrom<Vec<u8>> + PrintForLog<T>>(
    array: js_sys::Array,
) -> Vec<T> {
    let array: Vec<T> = array
        .to_vec()
        .drain(..)
        .filter_map(|key| {
            let key: String = key.as_string()?;
            let key = T::from_base58(key.as_str());
            if key.is_err() {
                return None;
            }
            let key: T = key.unwrap();
            Some(key)
        })
        .collect();
    array
}

// #[cfg(test)]
// mod test {
//     use js_sys::JsString;
//     use saito_core::common::defs::SaitoPublicKey;
//
//     use crate::saitowasm::string_to_key;
//
//     #[test]
//     fn string_to_key_test() {
//         let empty_key = [
//             0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
//             0, 0, 0, 0,
//         ];
//         let key = string_to_key(JsString::from(""));
//         assert!(key.is_ok());
//         let key: SaitoPublicKey = key.unwrap();
//         assert_eq!(key, empty_key);
//     }
// }
