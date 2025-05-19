use std::cmp::min;
use std::collections::VecDeque;
use std::fmt::Debug;
use std::ops::Deref;
use std::panic;
use std::path::Path;
use std::process;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use clap::{crate_version, App, Arg};
use log::info;
use log::{debug, error};
use saito_rust::run_thread::run_thread;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::select;
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing_subscriber::filter::Directive;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::Layer;

use saito_core::core::consensus::blockchain::Blockchain;
use saito_core::core::consensus::blockchain_sync_state::BlockchainSyncState;
use saito_core::core::consensus::context::Context;
use saito_core::core::consensus::peers::peer_collection::PeerCollection;
use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::consensus_thread::{ConsensusEvent, ConsensusStats, ConsensusThread};
use saito_core::core::defs::{
    Currency, PrintForLog, SaitoPrivateKey, SaitoPublicKey, StatVariable, CHANNEL_SAFE_BUFFER,
    PROJECT_PUBLIC_KEY, STAT_BIN_COUNT,
};
use saito_core::core::io::network::Network;
use saito_core::core::io::network_event::NetworkEvent;
use saito_core::core::io::storage::Storage;
use saito_core::core::mining_thread::{MiningEvent, MiningThread};
use saito_core::core::process::keep_time::{KeepTime, Timer};
use saito_core::core::process::process_event::ProcessEvent;
use saito_core::core::routing_thread::{RoutingEvent, RoutingStats, RoutingThread};
use saito_core::core::stat_thread::StatThread;
use saito_core::core::util::configuration::Configuration;
use saito_core::core::util::crypto::generate_keys;
use saito_core::core::verification_thread::{VerificationThread, VerifyRequest};
use saito_rust::config_handler::{ConfigHandler, NodeConfigurations};
use saito_rust::io_event::IoEvent;
use saito_rust::network_controller::run_network_controller;
use saito_rust::rust_io_handler::RustIOHandler;
use saito_rust::time_keeper::TimeKeeper;

const ROUTING_EVENT_PROCESSOR_ID: u8 = 1;
const CONSENSUS_EVENT_PROCESSOR_ID: u8 = 2;
const _MINING_EVENT_PROCESSOR_ID: u8 = 3;

async fn run_verification_thread(
    mut event_processor: Box<VerificationThread>,
    mut event_receiver: Receiver<VerifyRequest>,
    stat_timer_in_ms: u64,
    thread_name: &str,
    thread_sleep_time_in_ms: u64,
    time_keeper_origin: &Timer,
) -> JoinHandle<()> {
    let time_keeper = time_keeper_origin.clone();
    tokio::task::Builder::new()
        .name(thread_name)
        .spawn(async move {
            info!("verification thread started");
            // let mut work_done;
            let mut stat_timer = Instant::now();
            let batch_size = 10000;

            event_processor.on_init().await;
            let mut queued_requests = vec![];
            let mut requests = VecDeque::new();
            let mut interval =
                tokio::time::interval(Duration::from_millis(thread_sleep_time_in_ms));
            let mut stat_interval = tokio::time::interval(Duration::from_millis(stat_timer_in_ms));

            loop {
                loop {
                    select! {
                        result = event_receiver.recv() =>{
                            if result.is_some() {
                                let request = result.unwrap();
                                // if let VerifyRequest::Block(..) = &request {
                                //     queued_requests.push(request);
                                //     break;
                                // }else if let VerifyRequest::Transaction(tx) = request {
                                //     requests.push_back(tx);
                                // }else if let VerifyRequest::Transactions(..) = &request {
                                //     queued_requests.push(request);
                                //     break;
                                // }
                                queued_requests.push(request);
                                break;
                            } else {
                                break;
                            }
                            // if requests.len() == batch_size {
                            //     break;
                            // }
                        }
                        _ = interval.tick()=>{

                        }
                        _ = stat_interval.tick()=>{
                            {
                                let current_instant = Instant::now();
                                let duration = current_instant.duration_since(stat_timer);
                                if duration > Duration::from_millis(stat_timer_in_ms) {
                                    stat_timer = current_instant;
                                    event_processor
                                        .on_stat_interval(time_keeper.get_timestamp_in_ms())
                                        .await;
                                }
                            }
                        }
                    }
                }
                if !requests.is_empty() {
                    event_processor
                        .processed_msgs
                        .increment_by(requests.len() as u64);
                    event_processor.verify_txs(&mut requests).await;
                }
                for request in queued_requests.drain(..) {
                    event_processor.process_event(request).await;
                }
            }
        })
        .unwrap()
}

async fn run_mining_event_processor(
    context: &Context,
    sender_to_mempool: &Sender<ConsensusEvent>,
    receiver_for_miner: Receiver<MiningEvent>,
    stat_timer_in_ms: u64,
    thread_sleep_time_in_ms: u64,
    channel_size: usize,
    sender_to_stat: Sender<String>,
    time_keeper_origin: &Timer,
) -> (Sender<NetworkEvent>, JoinHandle<()>) {
    let mining_event_processor = MiningThread {
        wallet_lock: context.wallet_lock.clone(),
        sender_to_mempool: sender_to_mempool.clone(),
        timer: time_keeper_origin.clone(),
        miner_active: false,
        target: [0; 32],
        target_id: 0,
        difficulty: 0,
        public_key: [0; 33],
        mined_golden_tickets: 0,
        stat_sender: sender_to_stat.clone(),
        config_lock: context.config_lock.clone(),
        enabled: true,
        mining_iterations: 10_000,
        mining_start: 0,
    };

    let (interface_sender_to_miner, interface_receiver_for_miner) =
        tokio::sync::mpsc::channel::<NetworkEvent>(channel_size);

    debug!("running miner thread");
    let miner_handle = run_thread(
        Box::new(mining_event_processor),
        Some(interface_receiver_for_miner),
        Some(receiver_for_miner),
        stat_timer_in_ms,
        "saito-mining",
        thread_sleep_time_in_ms,
        time_keeper_origin,
    )
    .await;
    (interface_sender_to_miner, miner_handle)
}

async fn run_consensus_event_processor(
    context: &Context,
    peer_lock: Arc<RwLock<PeerCollection>>,
    receiver_for_blockchain: Receiver<ConsensusEvent>,
    sender_to_routing: &Sender<RoutingEvent>,
    sender_to_miner: Sender<MiningEvent>,
    sender_to_network_controller: Sender<IoEvent>,
    stat_timer_in_ms: u64,
    thread_sleep_time_in_ms: u64,
    channel_size: usize,
    sender_to_stat: Sender<String>,
    time_keeper_origin: &Timer,
) -> (Sender<NetworkEvent>, JoinHandle<()>) {
    let consensus_event_processor = ConsensusThread {
        mempool_lock: context.mempool_lock.clone(),
        blockchain_lock: context.blockchain_lock.clone(),
        wallet_lock: context.wallet_lock.clone(),
        generate_genesis_block: false,
        sender_to_router: sender_to_routing.clone(),
        sender_to_miner: sender_to_miner.clone(),
        // sender_global: global_sender.clone(),
        timer: time_keeper_origin.clone(),

        network: Network::new(
            Box::new(RustIOHandler::new(
                sender_to_network_controller.clone(),
                CONSENSUS_EVENT_PROCESSOR_ID,
            )),
            peer_lock.clone(),
            context.wallet_lock.clone(),
            context.config_lock.clone(),
            time_keeper_origin.clone(),
        ),
        block_producing_timer: 0,
        storage: Storage::new(Box::new(RustIOHandler::new(
            sender_to_network_controller.clone(),
            CONSENSUS_EVENT_PROCESSOR_ID,
        ))),
        stats: ConsensusStats::new(sender_to_stat.clone()),
        txs_for_mempool: Vec::new(),
        stat_sender: sender_to_stat.clone(),
        config_lock: context.config_lock.clone(),
        produce_blocks_by_timer: true,
        delete_old_blocks: true,
    };
    let (interface_sender_to_blockchain, _interface_receiver_for_mempool) =
        tokio::sync::mpsc::channel::<NetworkEvent>(channel_size);
    debug!("running mempool thread");
    let blockchain_handle = run_thread(
        Box::new(consensus_event_processor),
        None,
        Some(receiver_for_blockchain),
        stat_timer_in_ms,
        "saito-consensus",
        thread_sleep_time_in_ms,
        time_keeper_origin,
    )
    .await;

    (interface_sender_to_blockchain, blockchain_handle)
}

async fn run_routing_event_processor(
    sender_to_io_controller: Sender<IoEvent>,
    configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    context: &Context,
    peers_lock: Arc<RwLock<PeerCollection>>,
    sender_to_mempool: &Sender<ConsensusEvent>,
    receiver_for_routing: Receiver<RoutingEvent>,
    sender_to_miner: &Sender<MiningEvent>,
    senders: Vec<Sender<VerifyRequest>>,
    stat_timer_in_ms: u64,
    thread_sleep_time_in_ms: u64,
    channel_size: usize,
    sender_to_stat: Sender<String>,
    fetch_batch_size: usize,
    time_keeper_origin: &Timer,
) -> (Sender<NetworkEvent>, JoinHandle<()>) {
    let (sender, _receiver) = tokio::sync::mpsc::channel::<IoEvent>(channel_size);
    let routing_event_processor = RoutingThread {
        blockchain_lock: context.blockchain_lock.clone(),
        mempool_lock: context.mempool_lock.clone(),
        sender_to_consensus: sender_to_mempool.clone(),
        sender_to_miner: sender_to_miner.clone(),
        timer: time_keeper_origin.clone(),
        config_lock: configs_lock.clone(),
        wallet_lock: context.wallet_lock.clone(),

        network: Network::new(
            Box::new(RustIOHandler::new(
                sender_to_io_controller.clone(),
                ROUTING_EVENT_PROCESSOR_ID,
            )),
            peers_lock.clone(),
            context.wallet_lock.clone(),
            configs_lock.clone(),
            time_keeper_origin.clone(),
        ),
        storage: Storage::new(Box::new(RustIOHandler::new(sender, 1))),
        reconnection_timer: 0,
        peer_removal_timer: 0,
        peer_file_write_timer: 0,
        last_emitted_block_fetch_count: 0,
        stats: RoutingStats::new(sender_to_stat.clone()),
        senders_to_verification: senders,
        last_verification_thread_index: 0,
        stat_sender: sender_to_stat.clone(),
        blockchain_sync_state: BlockchainSyncState::new(fetch_batch_size),
    };

    let (interface_sender_to_routing, interface_receiver_for_routing) =
        tokio::sync::mpsc::channel::<NetworkEvent>(channel_size);

    debug!("running blockchain thread");
    let routing_handle = run_thread(
        Box::new(routing_event_processor),
        Some(interface_receiver_for_routing),
        Some(receiver_for_routing),
        stat_timer_in_ms,
        "saito-routing",
        thread_sleep_time_in_ms,
        time_keeper_origin,
    )
    .await;

    (interface_sender_to_routing, routing_handle)
}

async fn run_verification_threads(
    sender_to_consensus: Sender<ConsensusEvent>,
    blockchain_lock: Arc<RwLock<Blockchain>>,
    peer_lock: Arc<RwLock<PeerCollection>>,
    wallet_lock: Arc<RwLock<Wallet>>,
    stat_timer_in_ms: u64,
    thread_sleep_time_in_ms: u64,
    verification_thread_count: u16,
    sender_to_stat: Sender<String>,
    time_keeper_origin: &Timer,
) -> (Vec<Sender<VerifyRequest>>, Vec<JoinHandle<()>>) {
    let mut senders = vec![];
    let mut thread_handles = vec![];

    for i in 0..verification_thread_count {
        let (sender, receiver) = tokio::sync::mpsc::channel(1_000_000);
        senders.push(sender);
        let verification_thread = VerificationThread {
            sender_to_consensus: sender_to_consensus.clone(),
            blockchain_lock: blockchain_lock.clone(),
            peer_lock: peer_lock.clone(),
            wallet_lock: wallet_lock.clone(),
            processed_txs: StatVariable::new(
                format!("verification_{:?}::processed_txs", i),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            processed_blocks: StatVariable::new(
                format!("verification_{:?}::processed_blocks", i),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            processed_msgs: StatVariable::new(
                format!("verification_{:?}::processed_msgs", i),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            invalid_txs: StatVariable::new(
                format!("verification_{:?}::invalid_txs", i),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            ),
            stat_sender: sender_to_stat.clone(),
        };

        let thread_handle = run_verification_thread(
            Box::new(verification_thread),
            receiver,
            stat_timer_in_ms,
            format!("saito-verification-{:?}", i).as_str(),
            thread_sleep_time_in_ms,
            time_keeper_origin,
        )
        .await;
        thread_handles.push(thread_handle);
    }

    (senders, thread_handles)
}

// TODO : to be moved to routing event processor
fn run_loop_thread(
    mut receiver: Receiver<IoEvent>,
    network_event_sender_to_routing_ep: Sender<NetworkEvent>,
    stat_timer_in_ms: u64,
    _thread_sleep_time_in_ms: u64,
    sender_to_stat: Sender<String>,
    time_keeper_origin: &Timer,
) -> JoinHandle<()> {
    let time_keeper = time_keeper_origin.clone();
    tokio::task::Builder::new()
        .name("saito-looper")
        .spawn(async move {
            let mut incoming_msgs = StatVariable::new(
                "network::incoming_msgs".to_string(),
                STAT_BIN_COUNT,
                sender_to_stat.clone(),
            );
            let mut stat_interval = tokio::time::interval(Duration::from_millis(stat_timer_in_ms));

            let mut last_stat_on: Instant = Instant::now();
            loop {
                select! {
                    result = receiver.recv()=>{
                        if result.is_some() {
                            let command = result.unwrap();
                            incoming_msgs.increment();
                            match command.event_processor_id {
                                ROUTING_EVENT_PROCESSOR_ID => {
                                    network_event_sender_to_routing_ep
                                        .send(command.event)
                                        .await
                                        .unwrap();
                                }

                                _ => {
                                    unreachable!()
                                }
                            }
                        }
                    }
                    _ = stat_interval.tick()=>{
                        {
                            if Instant::now().duration_since(last_stat_on)
                                > Duration::from_millis(stat_timer_in_ms)
                            {
                                last_stat_on = Instant::now();
                                incoming_msgs
                                    .calculate_stats(time_keeper.get_timestamp_in_ms())
                                    .await;
                            }
                        }
                    }
                }
            }
        })
        .unwrap()
}

fn setup_log() {
    // switch to this for instrumentation
    // console_subscriber::init();

    let filter = tracing_subscriber::EnvFilter::builder()
        .with_default_directive(tracing_subscriber::filter::LevelFilter::INFO.into())
        .from_env_lossy();
    let filter = filter.add_directive(Directive::from_str("tokio_tungstenite=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("tungstenite=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("mio::poll=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("hyper::proto=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("hyper::client=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("want=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("reqwest::async_impl=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("reqwest::connect=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("warp::filters=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("tokio::task=info").unwrap());
    let filter = filter.add_directive(Directive::from_str("runtime::resource=info").unwrap());

    // let filter = filter.add_directive(Directive::from_str("saito_stats=info").unwrap());

    let fmt_layer = tracing_subscriber::fmt::Layer::default().with_filter(filter);
    // let fmt_layer = fmt_layer.with_filter(FilterFn::new(|meta| {
    //     !meta.target().contains("waker.clone") && !meta.target().contains("waker.drop") &&
    // }));

    tracing_subscriber::registry().with(fmt_layer).init();
}

fn setup_hook() {
    ctrlc::set_handler(move || {
        info!("shutting down the node");
        process::exit(0);
    })
    .expect("Error setting Ctrl-C handler");

    let orig_hook = panic::take_hook();
    panic::set_hook(Box::new(move |panic_info| {
        if let Some(location) = panic_info.location() {
            error!(
                "panic occurred in file '{}' at line {}, exiting ..",
                location.file(),
                location.line()
            );
        } else {
            error!("panic occurred but can't get location information, exiting ..");
        }

        // invoke the default handler and exit the process
        orig_hook(panic_info);
        process::exit(99);
    }));
}

async fn run_node(
    configs_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
    hasten_multiplier: u64,
) {
    info!("Running saito with config {:?}", configs_lock.read().await);

    let channel_size;
    let thread_sleep_time_in_ms;
    let stat_timer_in_ms;
    let verification_thread_count;
    let fetch_batch_size;
    let genesis_period;
    let social_stake;
    let social_stake_period;
    {
        let configs = configs_lock.read().await;

        channel_size = configs.get_server_configs().unwrap().channel_size as usize;
        assert!(channel_size > CHANNEL_SAFE_BUFFER * 2);
        thread_sleep_time_in_ms = configs
            .get_server_configs()
            .unwrap()
            .thread_sleep_time_in_ms;
        stat_timer_in_ms = configs.get_server_configs().unwrap().stat_timer_in_ms;
        verification_thread_count = configs.get_server_configs().unwrap().verification_threads;
        fetch_batch_size = configs.get_server_configs().unwrap().block_fetch_batch_size as usize;
        genesis_period = configs.get_consensus_config().unwrap().genesis_period;
        social_stake = configs.get_consensus_config().unwrap().default_social_stake;
        social_stake_period = configs
            .get_consensus_config()
            .unwrap()
            .default_social_stake_period;
        assert_ne!(fetch_batch_size, 0);
    }

    let (event_sender_to_loop, event_receiver_in_loop) =
        tokio::sync::mpsc::channel::<IoEvent>(channel_size);

    let (sender_to_network_controller, receiver_in_network_controller) =
        tokio::sync::mpsc::channel::<IoEvent>(channel_size);

    info!("running saito controllers");

    let keys = generate_keys();
    let wallet_lock = Arc::new(RwLock::new(Wallet::new(keys.1, keys.0)));
    {
        let mut wallet = wallet_lock.write().await;
        Wallet::load(
            &mut wallet,
            &(RustIOHandler::new(
                sender_to_network_controller.clone(),
                ROUTING_EVENT_PROCESSOR_ID,
            )),
        )
        .await;
        info!("current core version : {:?}", wallet.core_version);
    }

    let time_keeper = Timer {
        time_reader: Arc::new(TimeKeeper {}),
        hasten_multiplier,
        start_time: TimeKeeper {}.get_timestamp_in_ms(),
    };
    let context = Context::new(
        configs_lock.clone(),
        wallet_lock,
        genesis_period,
        social_stake,
        social_stake_period,
    );

    let peers_lock = Arc::new(RwLock::new(PeerCollection::default()));

    let (sender_to_consensus, receiver_for_consensus) =
        tokio::sync::mpsc::channel::<ConsensusEvent>(channel_size);

    let (sender_to_routing, receiver_for_routing) =
        tokio::sync::mpsc::channel::<RoutingEvent>(channel_size);

    let (sender_to_miner, receiver_for_miner) =
        tokio::sync::mpsc::channel::<MiningEvent>(channel_size);
    let (sender_to_stat, receiver_for_stat) = tokio::sync::mpsc::channel::<String>(channel_size);

    let (senders, verification_handles) = run_verification_threads(
        sender_to_consensus.clone(),
        context.blockchain_lock.clone(),
        peers_lock.clone(),
        context.wallet_lock.clone(),
        stat_timer_in_ms,
        thread_sleep_time_in_ms,
        verification_thread_count,
        sender_to_stat.clone(),
        &time_keeper,
    )
    .await;

    let (network_event_sender_to_routing, routing_handle) = run_routing_event_processor(
        sender_to_network_controller.clone(),
        configs_lock.clone(),
        &context,
        peers_lock.clone(),
        &sender_to_consensus,
        receiver_for_routing,
        &sender_to_miner,
        senders,
        stat_timer_in_ms,
        thread_sleep_time_in_ms,
        channel_size,
        sender_to_stat.clone(),
        fetch_batch_size,
        &time_keeper,
    )
    .await;

    let (_network_event_sender_to_consensus, blockchain_handle) = run_consensus_event_processor(
        &context,
        peers_lock.clone(),
        receiver_for_consensus,
        &sender_to_routing,
        sender_to_miner,
        sender_to_network_controller.clone(),
        stat_timer_in_ms,
        thread_sleep_time_in_ms,
        channel_size,
        sender_to_stat.clone(),
        &time_keeper,
    )
    .await;

    let (_network_event_sender_to_mining, miner_handle) = run_mining_event_processor(
        &context,
        &sender_to_consensus,
        receiver_for_miner,
        stat_timer_in_ms,
        thread_sleep_time_in_ms,
        channel_size,
        sender_to_stat.clone(),
        &time_keeper,
    )
    .await;
    let stat_handle = run_thread(
        Box::new(
            StatThread::new(Box::new(RustIOHandler::new(
                sender_to_network_controller.clone(),
                ROUTING_EVENT_PROCESSOR_ID,
            )))
            .await,
        ),
        None,
        Some(receiver_for_stat),
        stat_timer_in_ms,
        "saito-stats",
        thread_sleep_time_in_ms,
        &time_keeper,
    )
    .await;
    let loop_handle: JoinHandle<()> = run_loop_thread(
        event_receiver_in_loop,
        network_event_sender_to_routing,
        stat_timer_in_ms,
        thread_sleep_time_in_ms,
        sender_to_stat.clone(),
        &time_keeper,
    );

    let (server_handle, controller_handle) = run_network_controller(
        receiver_in_network_controller,
        event_sender_to_loop.clone(),
        configs_lock.clone(),
        context.blockchain_lock.clone(),
        sender_to_stat.clone(),
        peers_lock.clone(),
        sender_to_network_controller.clone(),
        &time_keeper,
    )
    .await;

    let _result = tokio::join!(
        routing_handle,
        blockchain_handle,
        miner_handle,
        loop_handle,
        server_handle,
        controller_handle,
        stat_handle,
        futures::future::join_all(verification_handles)
    );
}

pub async fn run_utxo_to_issuance_converter(threshold: Currency) {
    info!("running saito controllers");
    let public_key: SaitoPublicKey =
        hex::decode("03145c7e7644ab277482ba8801a515b8f1b62bcd7e4834a33258f438cd7e223849")
            .unwrap()
            .try_into()
            .unwrap();
    let private_key: SaitoPrivateKey =
        hex::decode("ddb4ba7e5d70c2234f035853902c6bc805cae9163085f2eac5e585e2d6113ccd")
            .unwrap()
            .try_into()
            .unwrap();

    let configs_lock: Arc<RwLock<NodeConfigurations>> =
        Arc::new(RwLock::new(NodeConfigurations::default()));

    let configs_clone: Arc<RwLock<dyn Configuration + Send + Sync>> = configs_lock.clone();

    let wallet = Arc::new(RwLock::new(Wallet::new(private_key, public_key)));
    {
        let mut wallet = wallet.write().await;
        let (sender, _receiver) = tokio::sync::mpsc::channel::<IoEvent>(100);
        Wallet::load(&mut wallet, &(RustIOHandler::new(sender, 1))).await;
    }
    let context = Context::new(
        configs_clone.clone(),
        wallet,
        configs_clone
            .read()
            .await
            .get_consensus_config()
            .unwrap()
            .genesis_period,
        configs_clone
            .read()
            .await
            .get_consensus_config()
            .unwrap()
            .default_social_stake,
        configs_clone
            .read()
            .await
            .get_consensus_config()
            .unwrap()
            .default_social_stake_period,
    );

    let (sender_to_network_controller, _receiver_in_network_controller) =
        tokio::sync::mpsc::channel::<IoEvent>(100000);
    let mut storage = Storage::new(Box::new(RustIOHandler::new(
        sender_to_network_controller.clone(),
        0,
    )));
    let list = storage.load_block_name_list().await.unwrap();

    let page_size = 100;
    let pages = list.len() / page_size;
    let configs = configs_lock.read().await;

    let mut blockchain = context.blockchain_lock.write().await;

    for current_page in 0..pages {
        let start = current_page * page_size;
        let end = min(start + page_size, list.len());
        storage
            .load_blocks_from_disk(&list[start..end], context.mempool_lock.clone())
            .await;

        tokio::task::yield_now().await;

        blockchain
            .add_blocks_from_mempool(
                context.mempool_lock.clone(),
                None,
                &mut storage,
                None,
                None,
                configs.deref(),
            )
            .await;
        // blockchain.utxoset.shrink_to_fit();
        // blockchain.blocks.shrink_to_fit();
    }

    info!("utxo size : {:?}", blockchain.utxoset.len());

    let data = blockchain.get_utxoset_data();

    info!("{:?} entries in utxo to write to file", data.len());
    let issuance_path: String = "./data/issuance.file".to_string();
    info!("opening file : {:?}", issuance_path);

    let path = Path::new(issuance_path.as_str());
    if path.parent().is_some() {
        tokio::fs::create_dir_all(path.parent().unwrap())
            .await
            .expect("failed creating directory structure");
    }

    let file = File::create(issuance_path.clone()).await;
    if file.is_err() {
        error!("error opening file. {:?}", file.err().unwrap());
        File::create(issuance_path)
            .await
            .expect("couldn't create file");
        return;
    }
    let mut file = file.unwrap();

    let slip_type = "Normal";
    let mut aggregated_value = 0;
    let mut total_written_lines = 0;
    for (key, value) in &data {
        if value < &threshold {
            // PROJECT_PUBLIC_KEY.to_string()
            aggregated_value += value;
        } else {
            total_written_lines += 1;
            let key_base58 = key.to_base58();

            file.write_all(format!("{}\t{}\t{}\n", value, key_base58, slip_type).as_bytes())
                .await
                .expect("failed writing to issuance file");
        };
    }

    // add remaining value
    if aggregated_value > 0 {
        total_written_lines += 1;
        file.write_all(
            format!(
                "{}\t{}\t{}\n",
                aggregated_value,
                PROJECT_PUBLIC_KEY.to_string(),
                slip_type
            )
            .as_bytes(),
        )
        .await
        .expect("failed writing to issuance file");
    }

    file.flush()
        .await
        .expect("failed flushing issuance file data");

    info!("total written lines : {:?}", total_written_lines);
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let matches = App::new("saito-rust")
        .version(crate_version!())
        .arg(
            Arg::with_name("config")
                .long("config")
                .value_name("FILE")
                .help("Sets a custom config file")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("mode")
                .long("mode")
                .value_name("MODE")
                .default_value("node")
                .possible_values(["node", "utxo-issuance", "hastened"])
                .help("Sets the mode for execution")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("utxo_threshold")
                .long("threshold")
                .value_name("UTXO_THRESHOLD")
                .help("Threshold for selecting utxo for issuance file")
                .takes_value(true),
        )
        .arg(
            Arg::with_name("haste_multiplier")
                .long("haste_multiplier")
                .value_name("HASTE_MULTIPLIER")
                .help("How many times the time is compressed")
                .default_value("100")
                .takes_value(true),
        )
        .get_matches();

    let program_mode = matches.value_of("mode").unwrap_or("node");

    setup_log();

    setup_hook();

    if program_mode == "node" {
        let config_file = matches.value_of("config").unwrap_or("config/config.json");
        info!("Using config file: {}", config_file.to_string());
        let configs = ConfigHandler::load_configs(config_file.to_string());
        if configs.is_err() {
            error!("failed loading configs. {:?}", configs.err().unwrap());
            return Ok(());
        }

        let configs: Arc<RwLock<dyn Configuration + Send + Sync>> =
            Arc::new(RwLock::new(configs.unwrap()));

        run_node(configs, 1).await;
    } else if program_mode == "utxo-issuance" {
        let threshold_str = matches.value_of("utxo_threshold");
        let mut threshold: Currency = 25_000;
        if threshold_str.is_some() {
            let result = String::from(threshold_str.unwrap()).parse();
            if result.is_err() {
                error!("cannot parse threshold : {:?}", threshold_str);
            } else {
                threshold = result.unwrap();
            }
        }
        info!(
            "running the program in utxo to issuance converter mode with threshold : {:?}",
            threshold
        );

        run_utxo_to_issuance_converter(threshold).await;
    } else if program_mode == "hastened" {
        let multiplier_str = matches.value_of("haste_multiplier");
        let result = String::from(multiplier_str.unwrap()).parse();
        let mut multiplier = 10;
        if result.is_err() {
            error!("cannot parse hasten multiplier : {:?}", multiplier_str);
        } else {
            multiplier = result.unwrap();
        }
        info!("running the node hastened by : {:?} times", multiplier);

        let config_file = matches.value_of("config").unwrap_or("config/config.json");
        info!("Using config file: {}", config_file.to_string());
        let configs = ConfigHandler::load_configs(config_file.to_string());
        if configs.is_err() {
            error!("failed loading configs. {:?}", configs.err().unwrap());
            return Ok(());
        }

        let configs: Arc<RwLock<dyn Configuration + Send + Sync>> =
            Arc::new(RwLock::new(configs.unwrap()));

        run_node(configs, multiplier).await;
    }

    Ok(())
}
