use std::io::{Error, ErrorKind};
use std::ops::{Deref, DerefMut};
use std::sync::Arc;
use std::time::Duration;

use crate::wasm_balance_snapshot::WasmBalanceSnapshot;
use crate::wasm_block::WasmBlock;
use crate::wasm_blockchain::WasmBlockchain;
use crate::wasm_configuration::WasmConfiguration;
use crate::wasm_host_log::init_logging;
use crate::wasm_io_handler::WasmIoHandler;
use crate::wasm_network_peer::WasmNetworkPeer;
use crate::wasm_nft::WasmNFT;
use crate::wasm_peer::WasmPeer;
use crate::wasm_slip::WasmSlip;
use crate::wasm_stats::WasmStats;
use crate::wasm_time_keeper::WasmTimeKeeper;
use crate::wasm_transaction::WasmTransaction;
use crate::wasm_wallet::WasmWallet;
use js_sys::{Array, JsString, Uint8Array};
use lazy_static::lazy_static;
use log::{debug, error, info, trace, warn};
use saito_core::core::consensus::blockchain::Blockchain;
use saito_core::core::consensus::context::Context;
use saito_core::core::consensus::mempool::Mempool;
use saito_core::core::consensus::transaction::{Transaction, TransactionType};
use saito_core::core::consensus::wallet::{DetailedNFT, Wallet};
use saito_core::core::consensus_thread::{ConsensusEvent, ConsensusStats, ConsensusThread};
use saito_core::core::defs::{
    BlockId, Currency, PrintForLog, SaitoPrivateKey, SaitoPublicKey, SaitoUTXOSetKey, StatVariable,
    Timestamp, CHANNEL_SAFE_BUFFER, STAT_BIN_COUNT,
};
use saito_core::core::mining_thread::{MiningEvent, MiningThread};
use saito_core::core::msg::api_message::ApiMessage;
use saito_core::core::msg::message::Message;
use saito_core::core::process::keep_time::Timer;
use saito_core::core::process::process_event::ProcessEvent;
use saito_core::core::process::version::Version;
use saito_core::core::routing::blockchain_sync_state::BlockchainSyncState;
use saito_core::core::routing::io::network::{Network, PeerDisconnectType};
use saito_core::core::routing::io::network_event::NetworkEvent;
use saito_core::core::routing::io::storage::Storage;
use saito_core::core::routing::peers::congestion_controller::CongestionStatsDisplay;
use saito_core::core::routing::peers::peer_collection::PeerCollection;
use saito_core::core::routing_thread::{RoutingEvent, RoutingStats, RoutingThread};
use saito_core::core::stat_thread::{StatEvent, StatThread};
use saito_core::core::util::configuration::Configuration;
use saito_core::core::util::crypto::{generate_keypair_from_private_key, generate_keys, sign};
use saito_core::core::verification_thread::{VerificationThread, VerifyRequest};
use secp256k1::SECP256K1;
use std::convert::TryInto;
use tokio::sync::mpsc::Receiver;
use tokio::sync::{Mutex, RwLock};
use wasm_bindgen::prelude::*;

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
    pub static ref SAITO: Mutex<Option<SaitoWasm>> = Mutex::new(Some(new_with_configuration(
        Arc::new(RwLock::new(WasmConfiguration::new())),
        1,
        true,
        100_000,
        0,
        60,
        false,
        6,
        6,
        10,
    )));
}

pub fn new_with_configuration(
    configuration: Arc<RwLock<dyn Configuration + Send + Sync>>,
    haste_multiplier: u64,
    enable_stats: bool,
    genesis_period: BlockId,
    social_stake: Currency,
    social_stake_period: BlockId,
    delete_old_blocks: bool,
    prune_after_blocks: BlockId,
    block_confirmation_limit: BlockId,
    block_fetch_batch_size: u64,
) -> SaitoWasm {
    info!("creating new saito wasm instance");
    console_error_panic_hook::set_once();

    let wallet = Arc::new(RwLock::new(Wallet::new([0; 32], [0; 33])));

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
            prune_after_blocks,
            block_confirmation_limit,
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
        start_time: WasmTimeKeeper::current_time_in_ms(),
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
                timer.clone(),
            ),
            storage: Storage::new(Box::new(WasmIoHandler {})),
            reconnection_timer: 0,
            peer_removal_timer: 0,
            last_emitted_block_fetch_count: 0,
            stats: RoutingStats::new(sender_to_stat.clone()),
            senders_to_verification: vec![sender_to_verification.clone()],
            last_verification_thread_index: 0,
            stat_sender: sender_to_stat.clone(),
            blockchain_sync_state: BlockchainSyncState::new(block_fetch_batch_size as usize),
            congestion_check_timer: 0,
            received_ghost_chain: None,
            waiting_for_genesis_block: false,
            message_sending_timer: 0,
            blockchain_send_results: Default::default(),
            new_peers: vec![],
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
            timer: timer.clone(),
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

impl SaitoWasm {
    async fn apply_private_key(&self, private_key: SaitoPrivateKey) {
        let mut configs = self.context.config_lock.write().await;
        let mut wallet = self.context.wallet_lock.write().await;
        let keys = if private_key != [0; 32] {
            generate_keypair_from_private_key(private_key.as_slice())
        } else {
            generate_keys()
        };
        wallet.private_key = keys.1;
        wallet.public_key = keys.0;
        if let Some(wallet_config) = configs.get_wallet_configs_mut() {
            wallet_config.privateKey = keys.1.to_hex();
            wallet_config.publicKey = keys.0.to_base58();
        }
        info!("current core version : {:?}", wallet.core_version);
    }

    async fn initialize_threads(&mut self) {
        self.stat_thread.on_init().await;
        self.mining_thread.on_init().await;
        self.verification_thread.on_init().await;
        self.routing_thread.on_init().await;
        self.consensus_thread.on_init().await;
    }

    async fn create_transaction_impl(
        &self,
        public_key: JsString,
        amount: u64,
        fee: u64,
        force_merge: bool,
    ) -> Result<WasmTransaction, JsValue> {
        trace!("create_transaction : {:?}", public_key.to_string());
        let mut wallet = self.context.wallet_lock.write().await;
        let key = string_to_key(public_key).or(Err(JsValue::from(
            "Failed parsing public key string to key",
        )))?;

        let configs = self.routing_thread.config_lock.read().await;
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
        let blockchain = self.context.blockchain_lock.read().await;
        let latest_block_id = blockchain.get_latest_block_id();

        let transaction = Transaction::create(
            &mut wallet,
            key,
            amount,
            fee,
            force_merge,
            Some(&self.consensus_thread.network),
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

        Ok(WasmTransaction::from_transaction(transaction.unwrap()))
    }

    async fn create_transaction_with_multiple_payments_impl(
        &self,
        public_keys: js_sys::Array,
        amounts: js_sys::BigUint64Array,
        fee: u64,
    ) -> Result<WasmTransaction, JsValue> {
        let mut wallet = self.context.wallet_lock.write().await;

        let configs = self.routing_thread.config_lock.read().await;
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
        let blockchain = self.context.blockchain_lock.read().await;
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
            Some(&self.consensus_thread.network),
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

        Ok(WasmTransaction::from_transaction(transaction.unwrap()))
    }

    async fn propagate_transaction_impl(&mut self, tx: &WasmTransaction) {
        trace!("propagate_transaction");

        let mut tx = tx.clone().tx;
        {
            let wallet = self.routing_thread.wallet_lock.read().await;
            tx.generate(&wallet.public_key, 0, 0);
        }
        debug!(
            "propagating transaction: {} input: {}, output : {}",
            tx.signature.to_hex(),
            tx.from
                .iter()
                .map(|slip| format!("{}", slip))
                .collect::<Vec<String>>()
                .join(", "),
            tx.to
                .iter()
                .map(|slip| format!("{}", slip))
                .collect::<Vec<String>>()
                .join(", "),
        );
        self.consensus_thread
            .process_event(ConsensusEvent::NewTransaction { transaction: tx })
            .await;
    }

    async fn get_mempool_txs_impl(&self) -> js_sys::Array {
        let mempool = self.consensus_thread.mempool_lock.read().await;
        let txs = js_sys::Array::new_with_length(mempool.transactions.len() as u32);
        for (index, (_, tx)) in mempool.transactions.iter().enumerate() {
            let wasm_tx = WasmTransaction::from_transaction(tx.clone());
            txs.set(index as u32, JsValue::from(wasm_tx));
        }

        txs
    }

    async fn process_new_peer_impl(&mut self, peer: WasmNetworkPeer) {
        self.routing_thread
            .process_network_event(NetworkEvent::PeerConnectionResult {
                result: Ok(peer.get_peer().clone()),
            })
            .await;
    }

    async fn process_stun_peer_impl(&mut self, public_key: JsString) -> Result<(), JsValue> {
        debug!("processing stun peer with public key: {:?} ", public_key);
        let key: SaitoPublicKey = string_to_key(public_key.into())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse public key: {}", e)))?;

        self.routing_thread
            .process_network_event(NetworkEvent::AddStunPeer { public_key: key })
            .await;
        Ok(())
    }

    async fn remove_stun_peer_impl(&mut self, public_key: JsString) {
        let key: SaitoPublicKey = string_to_key(public_key).unwrap();
        debug!(
            "removing stun peer with index: {:?} from netowrk ",
            key.to_base58()
        );
        self.routing_thread
            .process_network_event(NetworkEvent::RemoveStunPeer { public_key: key })
            .await;
    }

    async fn process_peer_disconnection_impl(&mut self, key: JsString) {
        let key = string_to_key(key);
        if key.is_err() {
            return;
        }
        let key: SaitoPublicKey = key.unwrap();
        debug!("process_peer_disconnection : {:?}", key.to_base58());
        self.routing_thread
            .process_network_event(NetworkEvent::PeerDisconnected {
                public_key: key,
                disconnect_type: PeerDisconnectType::ExternalDisconnect,
            })
            .await;
    }

    async fn process_msg_buffer_from_peer_impl(
        &mut self,
        buffer: js_sys::Uint8Array,
        peer: &mut WasmNetworkPeer,
    ) -> js_sys::Uint8Array {
        let buffer = buffer.to_vec();
        trace!("process_msg_buffer_from_peer : {}", buffer.len());
        let network_peer = peer.get_peer_mut();
        let wallet = self.context.wallet_lock.clone();
        let configs = self.context.config_lock.clone();
        let timer = self.routing_thread.timer.clone();
        let services = if network_peer.is_connected() {
            vec![]
        } else {
            self.routing_thread.network.io_interface.get_my_services()
        };

        trace!("buffer size : {}", buffer.len());
        let routing_thread = &mut self.routing_thread;
        let buffer = network_peer
            .process_incoming_buffer(
                buffer,
                wallet,
                configs,
                &timer,
                &services,
                |event| async move {
                    routing_thread.process_network_event(event).await;
                },
            )
            .await;
        if buffer.is_err() {
            error!(
                "process_msg_buffer_from_peer failed. {}",
                buffer.err().unwrap()
            );
            js_sys::Uint8Array::new_with_length(0)
        } else {
            let buffer = buffer.unwrap();

            trace!("return buffer size : {}", buffer.len());
            let array = js_sys::Uint8Array::new_with_length(buffer.len() as u32);
            array.copy_from(buffer.as_slice());
            array
        }
    }

    async fn process_fetched_block_impl(
        &mut self,
        buffer: js_sys::Uint8Array,
        hash: js_sys::Uint8Array,
        block_id: BlockId,
        key: JsString,
    ) {
        let key = string_to_key(key).unwrap();
        self.routing_thread
            .process_network_event(NetworkEvent::BlockFetched {
                block_hash: hash.to_vec().try_into().unwrap(),
                block_id,
                public_key: key,
                buffer: buffer.to_vec(),
            })
            .await;
    }

    async fn process_failed_block_fetch_impl(
        &mut self,
        hash: js_sys::Uint8Array,
        block_id: u64,
        key: JsString,
    ) {
        let key = string_to_key(key).unwrap();
        self.routing_thread
            .process_network_event(NetworkEvent::BlockFetchFailed {
                block_hash: hash.to_vec().try_into().unwrap(),
                public_key: key,
                block_id,
            })
            .await;
    }

    async fn process_timer_event_impl(&mut self, duration_in_ms: u64) {
        let duration = Duration::from_millis(duration_in_ms);
        const EVENT_LIMIT: u32 = 100;
        let mut event_counter = 0;

        while let Ok(event) = self.receiver_for_router.try_recv() {
            let _result = self.routing_thread.process_event(event).await;
            event_counter += 1;
            if event_counter >= EVENT_LIMIT {
                break;
            }
            if !self.routing_thread.is_ready_to_process() {
                break;
            }
        }

        self.routing_thread.process_timer_event(duration).await;

        event_counter = 0;
        while let Ok(event) = self.receiver_for_consensus.try_recv() {
            let _result = self.consensus_thread.process_event(event).await;
            event_counter += 1;
            if event_counter >= EVENT_LIMIT {
                break;
            }
            if !self.consensus_thread.is_ready_to_process() {
                break;
            }
        }

        self.consensus_thread.process_timer_event(duration).await;

        event_counter = 0;
        while let Ok(event) = self.receiver_for_verification.try_recv() {
            let _result = self.verification_thread.process_event(event).await;
            event_counter += 1;
            if event_counter >= EVENT_LIMIT {
                break;
            }
            if !self.verification_thread.is_ready_to_process() {
                break;
            }
        }

        self.verification_thread.process_timer_event(duration).await;

        event_counter = 0;
        while let Ok(event) = self.receiver_for_miner.try_recv() {
            let _result = self.mining_thread.process_event(event).await;
            event_counter += 1;
            if event_counter >= EVENT_LIMIT {
                break;
            }
            if !self.mining_thread.is_ready_to_process() {
                break;
            }
        }

        self.mining_thread.process_timer_event(duration).await;

        self.stat_thread.process_timer_event(duration).await;

        event_counter = 0;
        while let Ok(event) = self.receiver_for_stats.try_recv() {
            let _result = self.stat_thread.process_event(event).await;
            event_counter += 1;
            if event_counter >= EVENT_LIMIT {
                break;
            }
            if !self.stat_thread.is_ready_to_process() {
                break;
            }
        }
    }

    async fn process_stat_interval_impl(&mut self, current_time: Timestamp) {
        self.routing_thread.on_stat_interval(current_time).await;
        self.consensus_thread.on_stat_interval(current_time).await;
        self.verification_thread
            .on_stat_interval(current_time)
            .await;
        self.mining_thread.on_stat_interval(current_time).await;
    }

    async fn send_api_call_impl(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        let key: SaitoPublicKey = string_to_key(key).unwrap_or([0; 33]);
        trace!("send_api_call : {:?}", key.to_base58());
        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };
        let message = Message::ApplicationMessage(api_message);
        let buffer = message.serialize();
        if key == [0; 33] {
            self.routing_thread
                .network
                .io_interface
                .send_message_to_all(buffer.as_slice(), vec![])
                .await
                .unwrap();
        } else {
            self.routing_thread
                .network
                .io_interface
                .send_message(key, buffer.as_slice())
                .await
                .unwrap();
        }
    }

    async fn send_api_success_impl(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        let key: SaitoPublicKey = string_to_key(key).unwrap();
        trace!("send_api_success : {:?}", key.to_base58());
        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };
        let message = Message::Result(api_message);
        let buffer = message.serialize();

        self.routing_thread
            .network
            .io_interface
            .send_message(key, buffer.as_slice())
            .await
            .unwrap();
    }

    async fn send_api_error_impl(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        let key: SaitoPublicKey = string_to_key(key).unwrap();

        trace!("send_api_error : {:?}", key.to_base58());
        let api_message = ApiMessage {
            msg_index,
            data: buffer.to_vec(),
        };
        let message = Message::Error(api_message);
        let buffer = message.serialize();

        self.routing_thread
            .network
            .io_interface
            .send_message(key, buffer.as_slice())
            .await
            .unwrap();
    }

    async fn create_bound_transaction_impl(
        &mut self,
        num: u64,
        deposit: u64,
        tx_msg: Uint8Array,
        recipient_public_key: JsString,
        nft_type: JsString,
    ) -> Result<WasmTransaction, JsValue> {
        let genesis_period = {
            let configs = self.routing_thread.config_lock.read().await;
            configs.get_consensus_config().unwrap().genesis_period
        };
        let latest_block_id = {
            let blockchain = self.context.blockchain_lock.read().await;
            blockchain.get_latest_block_id()
        };
        let serialized_msg: Vec<u8> = tx_msg.to_vec();
        let key = string_to_key(recipient_public_key)
            .map_err(|_| JsValue::from_str("Failed parsing public key"))?;

        let transaction = {
            let mut wallet = self.context.wallet_lock.write().await;
            wallet
                .create_bound_transaction(
                    num,
                    deposit,
                    serialized_msg,
                    &key,
                    Some(&self.consensus_thread.network),
                    latest_block_id,
                    genesis_period,
                    nft_type.as_string().unwrap(),
                )
                .await
                .map_err(|e| {
                    error!("failed creating transaction: {:?}", e);
                    JsValue::from_str("Failed creating transaction")
                })?
        };

        Ok(WasmTransaction::from_transaction(transaction))
    }

    async fn create_send_bound_transaction_impl(
        &mut self,
        amt: u64,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        recipient_public_key: JsString,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        let s1: SaitoUTXOSetKey = string_to_hex(slip1_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip1_utxo_key"))?;
        let s2: SaitoUTXOSetKey = string_to_hex(slip2_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip2_utxo_key"))?;
        let s3: SaitoUTXOSetKey = string_to_hex(slip3_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip3_utxo_key"))?;
        let serialized_msg: Vec<u8> = tx_msg.to_vec();
        let key = string_to_key(recipient_public_key)
            .map_err(|_| JsValue::from_str("Bad recipient_public_key"))?;

        let tx = {
            let mut wallet = self.context.wallet_lock.write().await;
            wallet
                .create_send_bound_transaction(amt, s1, s2, s3, &key, serialized_msg)
                .await
                .map_err(|_| JsValue::from_str("create_send_bound_transaction failed"))?
        };

        Ok(WasmTransaction::from_transaction(tx))
    }

    async fn create_split_bound_transaction_impl(
        &mut self,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        left_count: u32,
        right_count: u32,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        let s1: SaitoUTXOSetKey = string_to_hex(slip1_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip1_utxo_key"))?;
        let s2: SaitoUTXOSetKey = string_to_hex(slip2_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip2_utxo_key"))?;
        let s3: SaitoUTXOSetKey = string_to_hex(slip3_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip3_utxo_key"))?;
        let serialized_msg: Vec<u8> = tx_msg.to_vec();

        let tx = {
            let mut wallet = self.context.wallet_lock.write().await;
            wallet
                .create_split_bound_transaction(s1, s2, s3, left_count, right_count, serialized_msg)
                .map_err(|e| JsValue::from_str(&e.to_string()))?
        };

        Ok(WasmTransaction::from_transaction(tx))
    }

    async fn create_atomize_bound_transaction_impl(
        &mut self,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        let s1: SaitoUTXOSetKey = string_to_hex(slip1_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip1_utxo_key"))?;
        let s2: SaitoUTXOSetKey = string_to_hex(slip2_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip2_utxo_key"))?;
        let s3: SaitoUTXOSetKey = string_to_hex(slip3_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip3_utxo_key"))?;
        let serialized_msg: Vec<u8> = tx_msg.to_vec();

        let tx = {
            let mut wallet = self.context.wallet_lock.write().await;
            wallet
                .create_atomize_bound_transaction(s1, s2, s3, serialized_msg)
                .map_err(|e| JsValue::from_str(&e.to_string()))?
        };

        Ok(WasmTransaction::from_transaction(tx))
    }

    async fn create_merge_bound_transaction_impl(
        &mut self,
        nft_id_hex: String,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        let id_bytes: Vec<u8> = hex::decode(&nft_id_hex)
            .map_err(|e| JsValue::from_str(&format!("nft_id hex decode error: {}", e)))?;
        let serialized_msg: Vec<u8> = tx_msg.to_vec();

        let tx = {
            let mut wallet = self.context.wallet_lock.write().await;
            wallet
                .create_merge_bound_transaction(id_bytes, serialized_msg)
                .map_err(|e| JsValue::from_str(&e.to_string()))?
        };

        Ok(WasmTransaction::from_transaction(tx))
    }

    async fn create_remove_bound_transaction_impl(
        &mut self,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        let s1: SaitoUTXOSetKey = string_to_hex(slip1_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip1_utxo_key"))?;
        let s2: SaitoUTXOSetKey = string_to_hex(slip2_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip2_utxo_key"))?;
        let s3: SaitoUTXOSetKey = string_to_hex(slip3_utxo_key)
            .map_err(|_| JsValue::from_str("Invalid slip3_utxo_key"))?;
        let serialized_msg: Vec<u8> = tx_msg.to_vec();

        let tx = {
            let mut wallet = self.context.wallet_lock.write().await;
            wallet
                .create_remove_bound_transaction(s1, s2, s3, serialized_msg)
                .await
                .map_err(|_| JsValue::from_str("create_remove_bound_transaction failed"))?
        };

        Ok(WasmTransaction::from_transaction(tx))
    }

    async fn get_nft_list_impl(&self) -> Result<Array, JsValue> {
        let wallet = self.context.wallet_lock.read().await;
        let detailed_nfts: Vec<DetailedNFT> = wallet.get_nft_list();
        let js_array = Array::new_with_length(detailed_nfts.len() as u32);

        for (id, nft) in detailed_nfts.into_iter().enumerate() {
            let mut w = WasmNFT::new();
            let id_arr = Uint8Array::from(nft.id.as_slice());
            w.set_id(&id_arr);
            let sig_arr = Uint8Array::from(nft.tx_sig.as_ref());
            w.set_tx_sig(&sig_arr);
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

    async fn get_latest_block_hash_impl(&self) -> JsString {
        debug!("get_latest_block_hash");
        let blockchain = self.context.blockchain_lock.read().await;
        blockchain.get_latest_block_hash().to_hex().into()
    }

    async fn get_block_impl(&self, block_hash: JsString) -> Result<WasmBlock, JsValue> {
        let block_hash = string_to_hex(block_hash).or(Err(JsValue::from(
            "Failed parsing block hash string to key",
        )))?;
        let blockchain = self.routing_thread.blockchain_lock.read().await;
        let result = blockchain.get_block(&block_hash);
        if result.is_none() {
            warn!("block {:?} not found", block_hash.to_hex());
            return Err(JsValue::from("block not found"));
        }
        Ok(WasmBlock::from_block(result.cloned().unwrap()))
    }

    async fn get_peers_impl(&self) -> Array {
        let peers = self.routing_thread.network.peer_lock.read().await;
        let array = Array::new_with_length(peers.peers.len() as u32);
        let mut array_index = 0;
        for peer in peers.peers.values() {
            array.set(
                array_index,
                JsValue::from(WasmPeer::new_from_peer(peer.clone())),
            );
            array_index += 1;
        }
        array
    }

    async fn get_peer_impl(&self, key: JsString) -> Option<WasmPeer> {
        let key: SaitoPublicKey = string_to_key(key).ok()?;
        let peers = self.routing_thread.network.peer_lock.read().await;
        let peer = peers.peers.get(&key);
        if peer.is_none() {
            warn!("peer not found");
            return None;
        }
        Some(WasmPeer::new_from_peer(peer.cloned().unwrap()))
    }

    async fn get_account_slips_impl(&self, public_key: JsString) -> Result<Array, JsValue> {
        let blockchain = self.routing_thread.blockchain_lock.read().await;
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

    async fn get_balance_snapshot_impl(&self, keys: js_sys::Array) -> WasmBalanceSnapshot {
        let configs = self.routing_thread.config_lock.read().await;
        let keys: Vec<SaitoPublicKey> = string_array_to_base58_keys(keys);
        let blockchain = self.routing_thread.blockchain_lock.read().await;
        let snapshot = blockchain.get_balance_snapshot(keys, configs.deref());
        WasmBalanceSnapshot::new(snapshot)
    }

    async fn update_from_balance_snapshot_impl(&self, snapshot: WasmBalanceSnapshot) {
        let mut wallet = self.routing_thread.wallet_lock.write().await;
        wallet.update_from_balance_snapshot(
            snapshot.get_snapshot(),
            Some(&self.routing_thread.network),
        );
    }

    async fn set_wallet_version_impl(&self, major: u8, minor: u8, patch: u16) {
        let mut wallet = self.wallet.wallet.write().await;
        wallet.wallet_version = Version {
            major,
            minor,
            patch,
        };
    }

    async fn write_issuance_file_impl(&mut self, threshold: Currency) {
        let blockchain_lock = self.routing_thread.blockchain_lock.clone();
        let storage = &mut self.consensus_thread.storage;
        let blockchain = blockchain_lock.write().await;
        blockchain
            .write_issuance_file(threshold, "./data/issuance.file", storage)
            .await;
    }

    async fn disable_producing_blocks_by_timer_impl(&mut self) {
        self.consensus_thread.produce_blocks_by_timer = false;
    }

    async fn produce_block_with_gt_impl(&mut self) -> bool {
        let config_lock = self.routing_thread.config_lock.clone();
        let blockchain_lock = self.blockchain.blockchain_lock.clone();
        let mempool_lock = self.consensus_thread.mempool_lock.clone();
        let wallet_lock = self.wallet.wallet.clone();

        let configs = config_lock.read().await;
        let blockchain = blockchain_lock.read().await;
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
        let latest_block_id = blockchain.get_latest_block_id();

        let mut mempool = mempool_lock.write().await;
        let (public_key, private_key) = {
            let wallet = wallet_lock.read().await;
            (wallet.public_key, wallet.private_key)
        };

        let gt_tx: Transaction;
        {
            let miner = &mut self.mining_thread;
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
                    gt_tx = Wallet::create_golden_ticket_transaction(gt, &public_key, &private_key)
                        .await;
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

        let timestamp = self.consensus_thread.timer.get_timestamp_in_ms();
        info!("waiting till a block is produced");
        for _ in 0..1000 {
            if let Some(block) = self
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
                self.consensus_thread
                    .process_event(ConsensusEvent::BlockFetched {
                        public_key: [0; 33],
                        block,
                    })
                    .await;
                return true;
            }
        }
        warn!("couldn't produce block");
        false
    }

    async fn produce_block_without_gt_impl(&mut self) -> bool {
        let config_lock = self.routing_thread.config_lock.clone();
        let blockchain_lock = self.blockchain.blockchain_lock.clone();
        let mempool_lock = self.consensus_thread.mempool_lock.clone();
        let wallet_lock = self.wallet.wallet.clone();

        let configs = config_lock.read().await;
        let blockchain = blockchain_lock.read().await;
        let genesis_period = configs.get_consensus_config().unwrap().genesis_period;
        let latest_block_id = blockchain.get_latest_block_id();
        let mut mempool = mempool_lock.write().await;
        let (public_key, private_key) = {
            let wallet = wallet_lock.read().await;
            (wallet.public_key, wallet.private_key)
        };
        info!(
            "clearing {:?} gts from mempool...",
            mempool.golden_tickets.len()
        );
        mempool.golden_tickets.clear();
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
        let timestamp = self.consensus_thread.timer.get_timestamp_in_ms();
        info!("waiting till a block is produced");
        for _ in 0..1000 {
            if let Some(block) = self
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
                self.consensus_thread
                    .process_event(ConsensusEvent::BlockFetched {
                        public_key: [0; 33],
                        block,
                    })
                    .await;
                return true;
            }
        }
        warn!("couldn't produce block");
        false
    }

    fn get_stats_impl(&self) -> Result<JsString, JsValue> {
        let stat_thread = &self.stat_thread;
        let stat = WasmStats {
            current_wallet_state: stat_thread.current_wallet_state.clone(),
            current_blockchain_state: stat_thread.current_blockchain_state.clone(),
            current_mempool_state: stat_thread.current_mempool_state.clone(),
            current_mining_state: stat_thread.current_mining_state.clone(),
        };
        let str = serde_json::to_string(&stat)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize stats: {}", e)))?;
        Ok(str.into())
    }

    async fn get_congestion_stats_impl(&self) -> Result<JsString, JsValue> {
        let peers = self.routing_thread.network.peer_lock.read().await;
        let stats = CongestionStatsDisplay {
            congestion_controls_by_key: peers
                .congestion_controls_by_key
                .iter()
                .map(|(key, control)| (key.to_base58(), control.clone()))
                .collect(),
            congestion_controls_by_ip: peers.congestion_controls_by_ip.clone(),
        };
        let str = serde_json::to_string(&stats)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize peer stats: {}", e)))?;
        Ok(str.into())
    }

    async fn get_confirmations_impl(&self) -> Result<JsValue, JsValue> {
        let configs = self.routing_thread.config_lock.read().await;
        let str = serde_json::to_string(&configs.get_blockchain_configs().confirmations).map_err(
            |e| {
                JsValue::from_str(&format!(
                    "Failed to serialize blockchain confirmations configs: {}",
                    e
                ))
            },
        )?;
        Ok(str.into())
    }

    async fn start_from_received_ghost_chain_impl(&mut self) {
        if let Some((chain, public_key)) = self.routing_thread.received_ghost_chain.take() {
            self.routing_thread
                .process_ghost_chain(chain, public_key)
                .await;
        }
    }
}

#[wasm_bindgen]
impl SaitoWasm {
    pub async fn create_transaction(
        &self,
        public_key: JsString,
        amount: u64,
        fee: u64,
        force_merge: bool,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_transaction_impl(public_key, amount, fee, force_merge)
            .await
    }

    pub async fn create_transaction_with_multiple_payments(
        &self,
        public_keys: js_sys::Array,
        amounts: js_sys::BigUint64Array,
        fee: u64,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_transaction_with_multiple_payments_impl(public_keys, amounts, fee)
            .await
    }

    pub async fn propagate_transaction(&mut self, tx: &WasmTransaction) {
        self.propagate_transaction_impl(tx).await;
    }

    pub fn get_wallet(&self) -> WasmWallet {
        self.wallet.clone()
    }

    pub fn get_blockchain(&self) -> WasmBlockchain {
        self.blockchain.clone()
    }

    pub async fn get_mempool_txs(&self) -> js_sys::Array {
        self.get_mempool_txs_impl().await
    }

    pub async fn create_bound_transaction(
        &mut self,
        num: u64,
        deposit: u64,
        tx_msg: Uint8Array,
        fee: u64,
        recipient_public_key: JsString,
        nft_type: JsString,
    ) -> Result<WasmTransaction, JsValue> {
        let _ = fee;
        self.create_bound_transaction_impl(num, deposit, tx_msg, recipient_public_key, nft_type)
            .await
    }

    pub async fn create_send_bound_transaction(
        &mut self,
        amt: u64,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        recipient_public_key: JsString,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_send_bound_transaction_impl(
            amt,
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            recipient_public_key,
            tx_msg,
        )
        .await
    }

    pub async fn create_split_bound_transaction(
        &mut self,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        left_count: u32,
        right_count: u32,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_split_bound_transaction_impl(
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            left_count,
            right_count,
            tx_msg,
        )
        .await
    }

    pub async fn create_atomize_bound_transaction(
        &mut self,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_atomize_bound_transaction_impl(
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            tx_msg,
        )
        .await
    }

    pub async fn create_merge_bound_transaction(
        &mut self,
        nft_id_hex: String,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_merge_bound_transaction_impl(nft_id_hex, tx_msg)
            .await
    }

    pub async fn create_remove_bound_transaction(
        &mut self,
        slip1_utxo_key: JsString,
        slip2_utxo_key: JsString,
        slip3_utxo_key: JsString,
        tx_msg: Uint8Array,
    ) -> Result<WasmTransaction, JsValue> {
        self.create_remove_bound_transaction_impl(
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            tx_msg,
        )
        .await
    }

    pub async fn get_nft_list(&self) -> Result<Array, JsValue> {
        self.get_nft_list_impl().await
    }

    pub async fn get_latest_block_hash(&self) -> JsString {
        self.get_latest_block_hash_impl().await
    }

    pub async fn get_block(&self, block_hash: JsString) -> Result<WasmBlock, JsValue> {
        self.get_block_impl(block_hash).await
    }

    pub async fn get_peers(&self) -> Array {
        self.get_peers_impl().await
    }

    pub async fn get_peer(&self, key: JsString) -> Option<WasmPeer> {
        self.get_peer_impl(key).await
    }

    pub async fn get_account_slips(&self, public_key: JsString) -> Result<Array, JsValue> {
        self.get_account_slips_impl(public_key).await
    }

    pub async fn get_balance_snapshot(&self, keys: js_sys::Array) -> WasmBalanceSnapshot {
        self.get_balance_snapshot_impl(keys).await
    }

    pub async fn update_from_balance_snapshot(&self, snapshot: WasmBalanceSnapshot) {
        self.update_from_balance_snapshot_impl(snapshot).await;
    }

    pub async fn set_wallet_version(&self, major: u8, minor: u8, patch: u16) {
        self.set_wallet_version_impl(major, minor, patch).await;
    }

    pub async fn write_issuance_file(&mut self, threshold: Currency) {
        self.write_issuance_file_impl(threshold).await;
    }

    pub async fn disable_producing_blocks_by_timer(&mut self) {
        self.disable_producing_blocks_by_timer_impl().await;
    }

    pub async fn produce_block_with_gt(&mut self) -> bool {
        self.produce_block_with_gt_impl().await
    }

    pub async fn produce_block_without_gt(&mut self) -> bool {
        self.produce_block_without_gt_impl().await
    }

    pub fn get_stats(&self) -> Result<JsString, JsValue> {
        self.get_stats_impl()
    }

    pub async fn get_congestion_stats(&self) -> Result<JsString, JsValue> {
        self.get_congestion_stats_impl().await
    }

    pub async fn get_confirmations(&self) -> Result<JsValue, JsValue> {
        self.get_confirmations_impl().await
    }

    pub async fn start_from_received_ghost_chain(&mut self) {
        self.start_from_received_ghost_chain_impl().await;
    }

    pub async fn process_new_peer(&mut self, peer: WasmNetworkPeer) {
        self.process_new_peer_impl(peer).await;
    }

    pub async fn process_stun_peer(&mut self, public_key: JsString) -> Result<(), JsValue> {
        self.process_stun_peer_impl(public_key).await
    }

    pub async fn remove_stun_peer(&mut self, public_key: JsString) {
        self.remove_stun_peer_impl(public_key).await;
    }

    pub async fn process_peer_disconnection(&mut self, key: JsString) {
        self.process_peer_disconnection_impl(key).await;
    }

    pub async fn process_msg_buffer_from_peer(
        &mut self,
        buffer: js_sys::Uint8Array,
        peer: &mut WasmNetworkPeer,
    ) -> js_sys::Uint8Array {
        self.process_msg_buffer_from_peer_impl(buffer, peer).await
    }

    pub async fn process_fetched_block(
        &mut self,
        buffer: js_sys::Uint8Array,
        hash: js_sys::Uint8Array,
        block_id: BlockId,
        key: JsString,
    ) {
        self.process_fetched_block_impl(buffer, hash, block_id, key)
            .await;
    }

    pub async fn process_failed_block_fetch(
        &mut self,
        hash: js_sys::Uint8Array,
        block_id: u64,
        key: JsString,
    ) {
        self.process_failed_block_fetch_impl(hash, block_id, key)
            .await;
    }

    pub async fn process_timer_event(&mut self, duration_in_ms: u64) {
        self.process_timer_event_impl(duration_in_ms).await;
    }

    pub async fn process_stat_interval(&mut self, current_time: Timestamp) {
        self.process_stat_interval_impl(current_time).await;
    }

    pub async fn send_api_call(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        self.send_api_call_impl(buffer, msg_index, key).await;
    }

    pub async fn send_api_success(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        self.send_api_success_impl(buffer, msg_index, key).await;
    }

    pub async fn send_api_error(&self, buffer: Uint8Array, msg_index: u32, key: JsString) {
        self.send_api_error_impl(buffer, msg_index, key).await;
    }
}

async fn initialize_runtime_inner(
    config_json: JsString,
    private_key: JsString,
    log_level_num: u8,
    hasten_multiplier: u64,
    delete_old_blocks: bool,
) -> Result<SaitoWasm, JsValue> {
    let log_level = match log_level_num {
        0 => log::Level::Error,
        1 => log::Level::Warn,
        2 => log::Level::Info,
        3 => log::Level::Debug,
        4 => log::Level::Trace,
        _ => log::Level::Info,
    };

    init_logging(log_level);

    trace!("trace test");
    debug!("debug test");
    info!("initializing saito-wasm  2");

    info!("setting configs...");
    let str: String = config_json.into();
    let configuration = match WasmConfiguration::new_from_json(str.as_str()) {
        Ok(config) => config,
        Err(err) => {
            error!("failed parsing configs. {:?}", err);
            WasmConfiguration::new()
        }
    };

    let enable_stats = !configuration.is_browser();
    info!("config loaded");

    let consensus_config = configuration.get_consensus_config().unwrap();
    let genesis_period = consensus_config.genesis_period;
    let social_stake = consensus_config.default_social_stake;
    let social_stake_period = consensus_config.default_social_stake_period;
    let prune_after_blocks = consensus_config.prune_after_blocks;
    let block_confirmation_limit = consensus_config.block_confirmation_limit;
    let block_fetch_batch_size = configuration
        .get_server_configs()
        .map(|config| config.block_fetch_batch_size)
        .unwrap_or(10);

    info!("genesis_period = {:?}", genesis_period);
    info!("social_stake = {:?}", social_stake);
    let shared_configuration: Arc<RwLock<dyn Configuration + Send + Sync>> =
        Arc::new(RwLock::new(configuration));
    let mut saito = new_with_configuration(
        shared_configuration,
        hasten_multiplier,
        enable_stats,
        genesis_period,
        social_stake,
        social_stake_period,
        delete_old_blocks,
        prune_after_blocks,
        block_confirmation_limit,
        block_fetch_batch_size,
    );

    let private_key: SaitoPrivateKey = string_to_hex(private_key).or(Err(JsValue::from(
        "Failed parsing private key string to key",
    )))?;
    saito.apply_private_key(private_key).await;
    saito.initialize_threads().await;

    Ok(saito)
}

#[wasm_bindgen]
pub async fn initialize_runtime(
    config_json: JsString,
    private_key: JsString,
    log_level_num: u8,
    hasten_multiplier: u64,
    delete_old_blocks: bool,
) -> Result<SaitoWasm, JsValue> {
    let runtime = initialize_runtime_inner(
        config_json,
        private_key,
        log_level_num,
        hasten_multiplier,
        delete_old_blocks,
    )
    .await?;

    // Sync the wallet keys into the global SAITO so that free functions like
    // WasmTransaction::sign (which use SAITO) get the correct keypair.
    let (public_key, private_key) = {
        let wallet = runtime.context.wallet_lock.read().await;
        (wallet.public_key, wallet.private_key)
    };
    {
        let saito = SAITO.lock().await;
        if let Some(s) = saito.as_ref() {
            let mut w = s.context.wallet_lock.write().await;
            w.public_key = public_key;
            w.private_key = private_key;
        }
    }

    Ok(runtime)
}

#[wasm_bindgen]
pub async fn initialize(
    config_json: JsString,
    private_key: JsString,
    log_level_num: u8,
    hasten_multiplier: u64,
    delete_old_blocks: bool,
) -> Result<JsValue, JsValue> {
    let runtime = initialize_runtime_inner(
        config_json,
        private_key,
        log_level_num,
        hasten_multiplier,
        delete_old_blocks,
    )
    .await?;

    let mut saito = SAITO.lock().await;
    saito.replace(runtime);

    Ok(JsValue::from("initialized"))
}

#[wasm_bindgen]
pub async fn create_transaction(
    public_key: JsString,
    amount: u64,
    fee: u64,
    force_merge: bool,
) -> Result<WasmTransaction, JsValue> {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .create_transaction_impl(public_key, amount, fee, force_merge)
        .await
}

#[wasm_bindgen]
pub async fn create_transaction_with_multiple_payments(
    public_keys: js_sys::Array,
    amounts: js_sys::BigUint64Array,
    fee: u64,
    _force_merge: bool,
) -> Result<WasmTransaction, JsValue> {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .create_transaction_with_multiple_payments_impl(public_keys, amounts, fee)
        .await
}

#[wasm_bindgen]
pub async fn create_bound_transaction(
    num: u64,
    deposit: u64,
    tx_msg: Uint8Array,
    _fee: u64,
    recipient_public_key: JsString,
    nft_type: JsString,
) -> Result<WasmTransaction, JsValue> {
    let mut saito_guard = SAITO.lock().await;
    saito_guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("SAITO not initialized"))?
        .create_bound_transaction_impl(num, deposit, tx_msg, recipient_public_key, nft_type)
        .await
}

#[wasm_bindgen]
pub async fn create_send_bound_transaction(
    amt: u64,
    slip1_utxo_key: JsString,
    slip2_utxo_key: JsString,
    slip3_utxo_key: JsString,
    recipient_public_key: JsString,
    tx_msg: Uint8Array,
) -> Result<WasmTransaction, JsValue> {
    let mut saito_guard = SAITO.lock().await;
    saito_guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("SAITO not initialized"))?
        .create_send_bound_transaction_impl(
            amt,
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            recipient_public_key,
            tx_msg,
        )
        .await
}

#[wasm_bindgen]
pub async fn create_split_bound_transaction(
    slip1_utxo_key: JsString,
    slip2_utxo_key: JsString,
    slip3_utxo_key: JsString,
    left_count: u32,
    right_count: u32,
    tx_msg: Uint8Array,
) -> Result<WasmTransaction, JsValue> {
    let mut saito_guard = SAITO.lock().await;
    saito_guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("SAITO not initialized"))?
        .create_split_bound_transaction_impl(
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            left_count,
            right_count,
            tx_msg,
        )
        .await
}

#[wasm_bindgen]
pub async fn create_atomize_bound_transaction(
    slip1_utxo_key: JsString,
    slip2_utxo_key: JsString,
    slip3_utxo_key: JsString,
    tx_msg: Uint8Array,
) -> Result<WasmTransaction, JsValue> {
    let mut saito_guard = SAITO.lock().await;
    saito_guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("SAITO not initialized"))?
        .create_atomize_bound_transaction_impl(
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            tx_msg,
        )
        .await
}

#[wasm_bindgen]
pub async fn create_merge_bound_transaction(
    nft_id_hex: String,
    tx_msg: Uint8Array,
) -> Result<WasmTransaction, JsValue> {
    let mut saito_guard = SAITO.lock().await;
    saito_guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("SAITO not initialized"))?
        .create_merge_bound_transaction_impl(nft_id_hex, tx_msg)
        .await
}

#[wasm_bindgen]
pub async fn create_remove_bound_transaction(
    slip1_utxo_key: JsString,
    slip2_utxo_key: JsString,
    slip3_utxo_key: JsString,
    tx_msg: Uint8Array, // ADD THIS
) -> Result<WasmTransaction, JsValue> {
    let mut saito_guard = SAITO.lock().await;
    saito_guard
        .as_mut()
        .ok_or_else(|| JsValue::from_str("SAITO not initialized"))?
        .create_remove_bound_transaction_impl(
            slip1_utxo_key,
            slip2_utxo_key,
            slip3_utxo_key,
            tx_msg,
        )
        .await
}

#[wasm_bindgen]
pub async fn get_nft_list() -> Result<Array, JsValue> {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_nft_list_impl().await
}

#[wasm_bindgen]
pub async fn get_latest_block_hash() -> JsString {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_latest_block_hash_impl().await
}

#[wasm_bindgen]
pub async fn get_block(block_hash: JsString) -> Result<WasmBlock, JsValue> {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_block_impl(block_hash).await
}

#[wasm_bindgen]
pub async fn process_new_peer(peer: WasmNetworkPeer) {
    let mut saito = SAITO.lock().await;
    saito.as_mut().unwrap().process_new_peer_impl(peer).await;
}

#[wasm_bindgen]
pub async fn process_stun_peer(public_key: JsString) -> Result<(), JsValue> {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .process_stun_peer_impl(public_key)
        .await
}

#[wasm_bindgen]
pub async fn remove_stun_peer(public_key: JsString) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .remove_stun_peer_impl(public_key)
        .await;
}
//
// #[wasm_bindgen]
// pub async fn get_next_public_key() -> BigInt {
//     let mut saito = SAITO.lock().await;
//     let mut peers = saito
//         .as_mut()
//         .unwrap()
//         .routing_thread
//         .network
//         .peer_lock
//         .write()
//         .await;
//
//     BigInt::from(peers.peer_counter.get_next_index())
// }

#[wasm_bindgen]
pub async fn process_peer_disconnection(key: JsString) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .process_peer_disconnection_impl(key)
        .await;
}

#[wasm_bindgen]
pub async fn process_msg_buffer_from_peer(
    buffer: js_sys::Uint8Array,
    peer: &mut WasmNetworkPeer,
) -> js_sys::Uint8Array {
    let mut saito1 = SAITO.lock().await;
    saito1
        .as_mut()
        .unwrap()
        .process_msg_buffer_from_peer_impl(buffer, peer)
        .await
}

#[wasm_bindgen]
pub async fn process_fetched_block(
    buffer: js_sys::Uint8Array,
    hash: js_sys::Uint8Array,
    block_id: BlockId,
    key: JsString,
) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .process_fetched_block_impl(buffer, hash, block_id, key)
        .await;
}

#[wasm_bindgen]
pub async fn process_failed_block_fetch(hash: js_sys::Uint8Array, block_id: u64, key: JsString) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .process_failed_block_fetch_impl(hash, block_id, key)
        .await;
}

#[wasm_bindgen]
pub async fn process_timer_event(duration_in_ms: u64) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .process_timer_event_impl(duration_in_ms)
        .await;
}

#[wasm_bindgen]
pub async fn process_stat_interval(current_time: Timestamp) {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .process_stat_interval_impl(current_time)
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
        .peers
        .iter()
        .filter(|(_, peer)| peer.is_connected())
        .count();
    let array = Array::new_with_length(valid_peer_count as u32);
    let mut array_index = 0;
    for (_i, (_public_key, peer)) in peers.peers.iter().enumerate() {
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
pub async fn get_peer(key: JsString) -> Option<WasmPeer> {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_peer_impl(key).await
}

#[wasm_bindgen]
pub async fn get_account_slips(public_key: JsString) -> Result<Array, JsValue> {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .get_account_slips_impl(public_key)
        .await
}

#[wasm_bindgen]
pub async fn get_balance_snapshot(keys: js_sys::Array) -> WasmBalanceSnapshot {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .get_balance_snapshot_impl(keys)
        .await
}

#[wasm_bindgen]
pub async fn update_from_balance_snapshot(snapshot: WasmBalanceSnapshot) {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .update_from_balance_snapshot_impl(snapshot)
        .await;
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
    let mut saito = SAITO.lock().await;
    saito.as_mut().unwrap().propagate_transaction_impl(tx).await;
}

#[wasm_bindgen]
pub async fn send_api_call(buffer: Uint8Array, msg_index: u32, key: JsString) {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .send_api_call_impl(buffer, msg_index, key)
        .await;
}

#[wasm_bindgen]
pub async fn send_api_success(buffer: Uint8Array, msg_index: u32, key: JsString) {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .send_api_success_impl(buffer, msg_index, key)
        .await;
}

#[wasm_bindgen]
pub async fn send_api_error(buffer: Uint8Array, msg_index: u32, key: JsString) {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .send_api_error_impl(buffer, msg_index, key)
        .await;
}

#[wasm_bindgen]
pub async fn get_wallet() -> WasmWallet {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_wallet()
}

#[wasm_bindgen]
pub async fn get_blockchain() -> WasmBlockchain {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_blockchain()
}

#[wasm_bindgen]
pub async fn get_mempool_txs() -> js_sys::Array {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_mempool_txs_impl().await
}

#[wasm_bindgen]
pub async fn set_wallet_version(major: u8, minor: u8, patch: u16) {
    let saito = SAITO.lock().await;
    saito
        .as_ref()
        .unwrap()
        .set_wallet_version_impl(major, minor, patch)
        .await;
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
    saito
        .as_mut()
        .unwrap()
        .write_issuance_file_impl(threshold)
        .await;
}

#[wasm_bindgen]
pub async fn disable_producing_blocks_by_timer() {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .disable_producing_blocks_by_timer_impl()
        .await;
}
#[wasm_bindgen]
pub async fn produce_block_with_gt() -> bool {
    let mut saito = SAITO.lock().await;
    saito.as_mut().unwrap().produce_block_with_gt_impl().await
}

#[wasm_bindgen]
pub async fn produce_block_without_gt() -> bool {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .produce_block_without_gt_impl()
        .await
}

#[wasm_bindgen]
pub async fn get_stats() -> Result<JsString, JsValue> {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_stats_impl()
}

// #[wasm_bindgen]
// pub async fn get_peer_stats() -> Result<JsString, JsValue> {
//     let saito = SAITO.lock().await;
//     let peers = &saito
//         .as_ref()
//         .unwrap()
//         .routing_thread
//         .network
//         .peer_lock
//         .read()
//         .await;
//
//     let str = serde_json::to_string(peers.deref())
//         .map_err(|e| JsValue::from_str(&format!("Failed to serialize peer stats: {}", e)))?;
//     Ok(str.into())
// }

#[wasm_bindgen]
pub async fn get_congestion_stats() -> Result<JsString, JsValue> {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_congestion_stats_impl().await
}

#[wasm_bindgen]
pub async fn get_confirmations() -> Result<JsValue, JsValue> {
    let saito = SAITO.lock().await;
    saito.as_ref().unwrap().get_confirmations_impl().await
}

#[wasm_bindgen]
pub async fn start_from_received_ghost_chain() {
    let mut saito = SAITO.lock().await;
    saito
        .as_mut()
        .unwrap()
        .start_from_received_ghost_chain_impl()
        .await;
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
