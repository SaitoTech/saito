use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use futures::stream::{SplitSink, SplitStream};
use futures::{SinkExt, StreamExt};
use log::{debug, error, info, trace, warn};
use reqwest::Client;
use saito_core::core::stat_thread::StatEvent;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::select;
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio::time::Instant;
use tokio_tungstenite::{connect_async, tungstenite, MaybeTlsStream, WebSocketStream};
use warp::http::StatusCode;
use warp::ws::{WebSocket, Ws};
use warp::Filter;

use crate::rust_io_handler::BLOCKS_DIR_PATH;
use saito_core::core::consensus::block::{Block, BlockType};
use saito_core::core::consensus::blockchain::Blockchain;
use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::defs::{
    BlockId, PrintForLog, SaitoHash, SaitoPublicKey, StatVariable, BLOCK_FILE_EXTENSION,
    STAT_BIN_COUNT,
};
use saito_core::core::network::msg::message::Message;
use saito_core::core::process::keep_time::Timer;
use saito_core::core::network::network::PeerDisconnectType;
use saito_core::core::network::events::NetworkEvent;
use saito_core::core::network::events::IoEvent;
use saito_core::core::network::service::Service;
use saito_core::core::network::peers::Peers;
use saito_core::core::network::peer::Peer;
use saito_core::core::util::configuration::Configuration;

//
// ID for PEERS (unique, monotonic)
//
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_PEER_ID: AtomicU64 = AtomicU64::new(1);
pub fn generate_peer_id() -> u64 {
    NEXT_PEER_ID.fetch_add(1, Ordering::Relaxed)
}

type SocketSender = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, tungstenite::Message>;
type SocketReceiver = SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>;

pub struct NetworkController {
    currently_queried_urls: Arc<Mutex<HashSet<String>>>,
    // Transport single source of truth: every live socket is keyed by peer_id only.
    sockets_by_peer_id: HashMap<u64, PeerSender>,
    // Temporary bridge for current InterfaceIO(public_key, ...). Valid after handshake.
    peer_id_by_public_key: HashMap<SaitoPublicKey, u64>,
    pub sender_to_core: Sender<IoEvent>,
}

impl NetworkController {
    pub fn new(sender_to_core: Sender<IoEvent>) -> Self {
        Self {
            currently_queried_urls: Arc::new(Default::default()),
            sockets_by_peer_id: Default::default(),
            peer_id_by_public_key: Default::default(),
            sender_to_core,
        }
    }

    pub async fn send_on_socket(connection: &mut PeerSender, buffer: Vec<u8>) -> bool {
        trace!("sending buffer of size : {:?} to peer", buffer.len());
        let mut send_failed = false;
        // TODO : can be better optimized if we buffer the messages and flush once per timer event
        match connection {
            PeerSender::Warp(sender) => {
                if let Err(error) = sender.send(warp::ws::Message::binary(buffer)).await {
                    error!("Error sending message.  Reason {}", error);
                    send_failed = true;
                }
            }
            PeerSender::Tungstenite(sender) => {
                if let Err(error) = sender
                    .send(tokio_tungstenite::tungstenite::Message::Binary(buffer))
                    .await
                {
                    error!("Error sending message.  Reason {}", error);
                    send_failed = true;
                }
            }
        }

        !send_failed
    }

    pub fn resolve_peer_id_by_public_key(&self, public_key: &SaitoPublicKey) -> Option<u64> {
        self.peer_id_by_public_key.get(public_key).copied()
    }

    pub fn resolve_peer_ids_by_public_keys(&self, public_keys: &[SaitoPublicKey]) -> Vec<u64> {
        public_keys
            .iter()
            .filter_map(|k| self.peer_id_by_public_key.get(k).copied())
            .collect()
    }

    pub fn register_socket(&mut self, peer_id: u64, sender: PeerSender) {
        self.sockets_by_peer_id.insert(peer_id, sender);
    }

    pub async fn register_public_key_mapping(&mut self, public_key: SaitoPublicKey, peer_id: u64) {
        if let Some(previous_peer_id) = self.peer_id_by_public_key.insert(public_key, peer_id) {
            if previous_peer_id != peer_id {
                if let Some(old_sender) = self.sockets_by_peer_id.remove(&previous_peer_id) {
                    // Reconnect safety: close stale sender belonging to replaced peer_id.
                    self.disconnect_socket(old_sender).await;
                }
            }
        }
    }

    pub async fn send(&mut self, peer_id: u64, buffer: Vec<u8>) -> bool {
        let buf_len = buffer.len();
        if let Some(sender) = self.sockets_by_peer_id.get_mut(&peer_id) {
            if !Self::send_on_socket(sender, buffer).await {
                warn!(
                    "failed sending buffer of size : {:?} to peer_id : {:?}",
                    buf_len, peer_id
                );
                return false;
            }
            true
        } else {
            warn!("cannot find sender socket for peer_id : {:?}", peer_id);
            false
        }
    }

    pub async fn connect_to_peer(
        network_controller: Arc<RwLock<NetworkController>>,
        peers_lock: Arc<RwLock<Peers>>,
        url: String,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
        timer: &Timer,
    ) {
        debug!("connecting to peer : {:?}", url);

        let result = connect_async(url.clone()).await;
        if result.is_ok() {
            let result = result.unwrap();
            let socket: WebSocketStream<MaybeTlsStream<TcpStream>> = result.0;

            let ip = match socket.get_ref() {
                MaybeTlsStream::NativeTls(s) => {
                    if let Ok(socket_address) = s.get_ref().get_ref().get_ref().peer_addr() {
                        Some(socket_address.ip().to_string())
                    } else {
                        None
                    }
                }
                MaybeTlsStream::Plain(t) => {
                    if let Ok(socket_address) = t.peer_addr() {
                        Some(socket_address.ip().to_string())
                    } else {
                        None
                    }
                }
                _ => None,
            };

            let (socket_sender, socket_receiver): (SocketSender, SocketReceiver) = socket.split();

            info!("connected to peer : {:?}", url,);

            let mut network_peer = Peer::new(generate_peer_id());
            network_peer.url = Some(url);
            network_peer.ip = ip;
            network_peer.on_connect(timer.get_timestamp_in_ms());

            NetworkController::handle_new_connection(
                network_peer,
                PeerSender::Tungstenite(socket_sender),
                PeerReceiver::Tungstenite(socket_receiver),
                network_controller,
                wallet,
                configs,
                timer,
                peers_lock,
            )
            .await;
        } else {
            warn!(
                "failed connecting to : {:?}, reason {:?}",
                url,
                result.err().unwrap()
            );
        }
    }

    pub async fn broadcast(&mut self, buffer: Vec<u8>, excluded_peer_ids: &[u64]) {
        trace!("sending buffer of size : {:?} to all", buffer.len());
        let excluded: HashSet<u64> = excluded_peer_ids.iter().copied().collect();
        for (peer_id, sender) in &mut self.sockets_by_peer_id {
            if excluded.contains(peer_id) {
                continue;
            }
            trace!(
                "sending buffer of size : {:?} to peer_id : {:?}",
                buffer.len(),
                peer_id
            );
            if !Self::send_on_socket(sender, buffer.clone()).await {
                warn!(
                    "failed sending buffer (all) of size : {:?} to peer_id : {:?}",
                    buffer.len(),
                    peer_id
                );
            }
        }
    }
    pub async fn fetch_block(
        block_hash: SaitoHash,
        public_key: SaitoPublicKey,
        url: String,
        // event_id: u64,
        sender_to_core: Sender<IoEvent>,
        current_queries: Arc<Mutex<HashSet<String>>>,
        client: Client,
        block_id: BlockId,
    ) {
        debug!("fetching block : {:?}", url);

        {
            // since the block sizes can be large, we need to make sure same block is not fetched multiple times before first fetch finishes.
            let mut queries = current_queries.lock().await;
            if queries.contains(&url) {
                debug!("url : {:?} is already being fetched", url);
                return;
            }
            queries.insert(url.clone());
        }
        let block_fetch_timeout_in_ms = 10_000;
        let result = client
            .get(url.clone())
            .timeout(Duration::from_millis(block_fetch_timeout_in_ms))
            .send()
            .await;
        if result.is_err() {
            // TODO : should we retry here?
            warn!("failed fetching : {:?}", url);
            let mut queries = current_queries.lock().await;
            queries.remove(&url);
            sender_to_core
                .send(IoEvent {
                    event_processor_id: 1,
                    // event_id,
                    event: NetworkEvent::BlockFetchFailed {
                        block_hash,
                        public_key,
                        block_id,
                    },
                })
                .await
                .unwrap();
            return;
        }
        let response = result.unwrap();
        if !matches!(response.status(), StatusCode::OK) {
            warn!(
                "failed fetching block : {:?}, with error code : {:?} from url : {:?}",
                block_hash.to_hex(),
                response.status(),
                url
            );
            let mut queries = current_queries.lock().await;
            queries.remove(&url);
            sender_to_core
                .send(IoEvent {
                    event_processor_id: 1,
                    // event_id,
                    event: NetworkEvent::BlockFetchFailed {
                        block_hash,
                        public_key,
                        block_id,
                    },
                })
                .await
                .unwrap();
            return;
        }
        let result = response.bytes().await;
        if result.is_err() {
            warn!("failed getting byte buffer from fetching block : {:?}", url);
            let mut queries = current_queries.lock().await;
            queries.remove(&url);
            sender_to_core
                .send(IoEvent {
                    event_processor_id: 1,
                    // event_id,
                    event: NetworkEvent::BlockFetchFailed {
                        block_hash,
                        public_key,
                        block_id,
                    },
                })
                .await
                .unwrap();
            return;
        }
        let result = result.unwrap();
        let buffer = result.to_vec();

        debug!(
            "block buffer received with size : {:?} for url : {:?}",
            buffer.len(),
            url
        );
        // RustIOHandler::set_event_response(event_id, FutureState::BlockFetched(block));
        sender_to_core
            .send(IoEvent {
                event_processor_id: 1,
                // event_id,
                event: NetworkEvent::BlockFetched {
                    block_hash,
                    block_id,
                    public_key,
                    buffer,
                },
            })
            .await
            .unwrap();
        {
            // since we have already fetched the block, we will remove it from the set.
            let mut queries = current_queries.lock().await;
            queries.remove(&url);
        }
        // debug!("block buffer sent to blockchain controller");
    }
    pub async fn handle_new_connection(
        network_peer: Peer,
        sender: PeerSender,
        receiver: PeerReceiver,
        network_controller: Arc<RwLock<NetworkController>>,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
        timer: &Timer,
        peers_lock: Arc<RwLock<Peers>>,
    ) {
        let peer_id = network_peer.id;
        {
            let mut peers = peers_lock.write().await;
            peers.peers_v2.insert(peer_id, network_peer);
        }
        {
            let mut controller = network_controller.write().await;
            controller.register_socket(peer_id, sender);
        }

        let handshake_buffer = {
            let mut peers = peers_lock.write().await;
            let Some(p) = peers.get_peer_by_id_mut(peer_id) else {
                warn!(
                    "handle_new_connection: peer_id {} missing after insert; closing socket",
                    peer_id
                );
                let mut controller = network_controller.write().await;
                controller.disconnect(peer_id).await;
                return;
            };

            if p.url.is_none() {
                debug!(
                    "sending handshake request to peer : {}",
                    p.ip.as_ref().cloned().unwrap_or_default()
                );

                p.handshake_nonce = Some(saito_core::core::util::crypto::hash(
                    &saito_core::core::util::crypto::generate_random_bytes(32).await,
                ));

                Some(
                    Message::RequestHandshake(saito_core::core::network::msg::handshake::RequestHandshake {
                        nonce: p.handshake_nonce.unwrap(),
                    })
                    .serialize(),
                )
            } else {
                None
            }
        };

        if let Some(buffer) = handshake_buffer {
            let _ = network_controller.write().await.send(peer_id, buffer).await;
        }

        NetworkController::receive_message_from_peer(
            receiver,
            peer_id,
            peers_lock,
            wallet,
            configs,
            timer.clone(),
            network_controller,
        )
        .await;
    }

    pub async fn disconnect_socket(&mut self, connection: PeerSender) {
        debug!("disconnecting socket");
        match connection {
            PeerSender::Warp(mut sender) => {
                let _ = sender.close().await.or_else(|e| {
                    error!("Failed disconnecting socket. Reason {:?}", e);
                    Err(e)
                });
            }
            PeerSender::Tungstenite(mut sender) => {
                let _ = sender.close().await.or_else(|e| {
                    error!("Failed disconnecting socket. Reason {:?}", e);
                    Err(e)
                });
            }
        }
    }
    pub async fn disconnect(&mut self, peer_id: u64) {

      if let Some(sender) = self.sockets_by_peer_id.remove(&peer_id) {
          self.disconnect_socket(sender).await;
      }
      self.peer_id_by_public_key.retain(|_k, v| *v != peer_id);
        if let Err(e) = self
          .sender_to_core
          .send(IoEvent {
            event_processor_id: 1,
            event: NetworkEvent::PeerDisconnected {
              peer_id,
              disconnect_type: PeerDisconnectType::InternalDisconnect,
            },
          })
          .await
        {
          warn!(
            "sender_to_core send failed (peer_id={} op=disconnect_notify err={})",
            peer_id, e
          );
        }
    }

    pub async fn receive_message_from_peer(
        receiver: PeerReceiver,
        peer_id: u64,
        peers_lock: Arc<RwLock<Peers>>,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
        timer: Timer,
        network_controller: Arc<RwLock<NetworkController>>,
    ) {
        debug!("starting new task for reading from peer");

        tokio::spawn(async move {
            debug!("new thread started for peer receiving");

            let network_controller_clone = network_controller.clone();
            let wallet_clone = wallet.clone();
            let configs_clone = configs.clone();
            let peers_lock_clone = peers_lock;

            match receiver {
                PeerReceiver::Warp(mut receiver) => loop {
                    let result = receiver.next().await;
                    if result.is_none() {
                        continue;
                    }

                    let result = result.unwrap();

                    if result.is_err() {
                        warn!(
                            "failed receiving message [warp]: {:?}",
                            result.err().unwrap()
                        );

                        let mut network_controller = network_controller_clone.write().await;

                        network_controller.disconnect(peer_id).await;

                        break;
                    }

                    let result = result.unwrap();

                    if result.is_binary() {
                        let buffer = result.into_bytes();

                        let send_result = network_controller_clone
                            .write()
                            .await
                            .sender_to_core
                            .send(IoEvent {
                                event_processor_id: 1,
                                event: NetworkEvent::PeerBufferReceived { peer_id, buffer },
                            })
                            .await;

                        if let Err(e) = send_result {
                            warn!(
                                "sender_to_core send failed (peer_id={} op=peer_buffer_received err={})",
                                peer_id,
                                e
                            );

                            let mut network_controller = network_controller_clone.write().await;
                            network_controller.disconnect(peer_id).await;

                            break;
                        }
                    } else if result.is_close() {
                        warn!("warp connection closed by remote peer");

                        let mut network_controller = network_controller_clone.write().await;
                        network_controller.disconnect(peer_id).await;

                        break;
                    }
                },

                PeerReceiver::Tungstenite(mut receiver) => loop {
                    let result = receiver.next().await;
                    if result.is_none() {
                        continue;
                    }

                    let result = result.unwrap();

                    if result.is_err() {
                        warn!(
                            "failed receiving message [tungstenite]: {:?}",
                            result.err().unwrap()
                        );

                        let mut network_controller = network_controller_clone.write().await;
                        network_controller.disconnect(peer_id).await;

                        break;
                    }

                    match result.unwrap() {
                        tokio_tungstenite::tungstenite::Message::Binary(buffer) => {
                            let send_result = network_controller_clone
                                .write()
                                .await
                                .sender_to_core
                                .send(IoEvent {
                                    event_processor_id: 1,
                                    event: NetworkEvent::PeerBufferReceived { peer_id, buffer },
                                })
                                .await;

                            if let Err(e) = send_result {
                                warn!(
                                "sender_to_core send failed (peer_id={} op=peer_buffer_received err={})",
                                peer_id,
                                e
                            );

                                let mut network_controller = network_controller_clone.write().await;
                                network_controller.disconnect(peer_id).await;

                                break;
                            }
                        }

                        tokio_tungstenite::tungstenite::Message::Close(_) => {
                            warn!("tungstenite connection closed");

                            let mut network_controller = network_controller_clone.write().await;
                            network_controller.disconnect(peer_id).await;

                            break;
                        }

                        _ => {}
                    }
                },
            }
        });
    }
}

///
///
/// # Arguments
///
/// * `receiver`:
/// * `sender_to_core`:
/// * `configs_lock`:
/// * `blockchain_lock`:
/// * `sender_to_stat`:
/// * `peers_lock`:
/// * `sender_to_network`: sender for this thread. only used for reading performance stats
///
/// returns: ()
///
/// # Examples
///
/// ```
///
/// ```
// TODO : refactor to use ProcessEvent trait
pub async fn run_network_controller(
    network_controller_lock: Arc<RwLock<NetworkController>>,
    mut receiver: Receiver<IoEvent>,
    sender_to_core: Sender<IoEvent>,
    configs_lock: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
    _blockchain_lock: Arc<RwLock<Blockchain>>,
    sender_to_stat: Sender<StatEvent>,
    peers_lock: Arc<RwLock<Peers>>,
    sender_to_network: Sender<IoEvent>,
    timer: &Timer,
    wallet: Arc<RwLock<Wallet>>,
) -> (JoinHandle<()>, JoinHandle<()>) {
    info!("running network handler");

    let host;
    let url;
    let port;
    let public_key;
    {
        let configs = configs_lock.read().await;

        url = configs.get_server_configs().unwrap().host.clone()
            + ":"
            + configs
                .get_server_configs()
                .unwrap()
                .port
                .to_string()
                .as_str();
        port = configs.get_server_configs().unwrap().port;
        host = configs.get_server_configs().unwrap().host.clone();

        // trace!("locking blockchain 9");
        // let blockchain = blockchain_lock.read().await;
        let wallet = wallet.read().await;
        public_key = wallet.public_key;
    }
    // trace!("releasing blockchain 9");

    info!("starting server on : {:?}", url);
    let sender_clone = sender_to_core.clone();

    {
        let mut controller = network_controller_lock.write().await;
        controller.sender_to_core = sender_to_core;
    }
    let time_keeper = timer.clone();

    let server_handle = run_websocket_server(
        sender_clone.clone(),
        network_controller_lock.clone(),
        port,
        host,
        public_key,
        peers_lock.clone(),
        wallet.clone(),
        configs_lock.clone(),
        timer,
    );

    let controller_handle = tokio::spawn(async move {
        let mut outgoing_messages = StatVariable::new(
            "network::outgoing_msgs".to_string(),
            STAT_BIN_COUNT,
            sender_to_stat.clone(),
        );
        let stat_timer_in_ms;
        {
            let configs_temp = configs_lock.read().await;
            stat_timer_in_ms = configs_temp.get_server_configs().unwrap().stat_timer_in_ms;
        }
        let mut stat_interval = tokio::time::interval(Duration::from_millis(stat_timer_in_ms));

        let io_pool = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(10)
            .enable_io()
            .enable_time()
            .thread_name("saito-io-thread-pool")
            .build()
            .unwrap();

        let mut last_stat_on: Instant = Instant::now();
        loop {
            select! {
                            result = receiver.recv()=>{
                                if result.is_some() {
                                    let event = result.unwrap();
                                    let interface_event = event.event;
                                    match interface_event {
                                        NetworkEvent::ConnectToPeer {url,  } => {

            NetworkController::connect_to_peer(
                network_controller_lock.clone(),
                peers_lock.clone(),
                url,
                wallet.clone(),
                configs_lock.clone(),
                &time_keeper,
            )
            .await;
                                        }

                                        NetworkEvent::BlockFetchRequest {
                                            block_hash,
                                            public_key,
                                            url,
                                            block_id,
                                        } => {
                                            let sender;
                                            let current_queries;
                                            {
                                                let network_controller = network_controller_lock.read().await;

                                                sender = network_controller.sender_to_core.clone();
                                                current_queries = network_controller.currently_queried_urls.clone();
                                            }
                                            // starting new thread to stop io controller from getting blocked
                                            io_pool.spawn(async move {
                                                let client = reqwest::Client::new();

                                                NetworkController::fetch_block(
                                                    block_hash,
                                                    public_key,
                                                    url,
                                                    sender,
                                                    current_queries,
                                                    client,
                                                    block_id,
                                                )
                                                .await
                                            });
                                        }

                                        _ => unreachable!()
                                    }
                                }
                            }
                            _ = stat_interval.tick() => {
                                {
                                    if Instant::now().duration_since(last_stat_on)
                                        > Duration::from_millis(stat_timer_in_ms)
                                    {
                                        last_stat_on = Instant::now();
                                        outgoing_messages
                                            .calculate_stats(time_keeper.get_timestamp_in_ms())
                                            .await;
                                        let network_controller = network_controller_lock.read().await;

                                        let stat = format!(
                                            "{} - {} - capacity : {:?} / {:?}",
                                            StatVariable::format_timestamp(time_keeper.get_timestamp_in_ms()),
                                            format!("{:width$}", "network::channel_to_core", width = 40),
                                            network_controller.sender_to_core.capacity(),
                                            network_controller.sender_to_core.max_capacity()
                                        );
                                        if let Err(e) =
                                            sender_to_stat.send(StatEvent::StringStat(stat)).await
                                        {
                                            warn!(
                                                "sender_to_stat send failed (op=network_channel_to_core_stat err={})",
                                                e
                                            );
                                        }

                                        let stat = format!(
                                            "{} - {} - capacity : {:?} / {:?}",
                                            StatVariable::format_timestamp(time_keeper.get_timestamp_in_ms()),
                                            format!("{:width$}", "network::channel_outgoing", width = 40),
                                            sender_to_network.capacity(),
                                            sender_to_network.max_capacity()
                                        );
                                        if let Err(e) =
                                            sender_to_stat.send(StatEvent::StringStat(stat)).await
                                        {
                                            warn!(
                                                "sender_to_stat send failed (op=network_channel_outgoing_stat err={})",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                        }
        }
    });
    (server_handle, controller_handle)
}

pub enum PeerSender {
    Warp(SplitSink<WebSocket, warp::ws::Message>),
    Tungstenite(SocketSender),
}

pub enum PeerReceiver {
    Warp(SplitStream<WebSocket>),
    Tungstenite(SocketReceiver),
}

#[derive(Clone)]
struct ConfigsWrapper {
    configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
}

fn run_websocket_server(
    _sender_clone: Sender<IoEvent>,
    io_controller: Arc<RwLock<NetworkController>>,
    port: u16,
    host: String,
    public_key: SaitoPublicKey,
    peers_lock: Arc<RwLock<Peers>>,
    wallet: Arc<RwLock<Wallet>>,
    configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
    timer: &Timer,
) -> JoinHandle<()> {
    info!("running websocket server on {:?}", port);

    let timer = timer.clone();
    let configs_wrapper = ConfigsWrapper { configs };

    // Separate `Arc` clones so ws and lite routes each own a capture for warp filters.
    let peers_lock_for_ws = peers_lock.clone();
    let peers_lock_for_lite = peers_lock.clone();

    tokio::spawn(async move {
        info!("starting websocket server");

        // ---------------- WS ROUTE ----------------
        let ws_route = warp::path("wsopen")
            .and(warp::ws())
            .and(warp::addr::remote())
            .and(warp::any().map(move || io_controller.clone()))
            .and(warp::any().map(move || wallet.clone()))
            .and(warp::any().map(move || configs_wrapper.clone()))
            .and(warp::any().map(move || timer.clone()))
            .map(
                move |ws: Ws,
                      addr: Option<SocketAddr>,
                      network_controller: Arc<RwLock<NetworkController>>,
                      wallet: Arc<RwLock<Wallet>>,
                      configs: ConfigsWrapper,
                      timer: Timer| {
                    let peers_lock = peers_lock_for_ws.clone();

                    debug!("incoming connection received");
                    let ws = ws.max_message_size(10_000_000_000);
                    let ws = ws.max_frame_size(10_000_000_000);

                    ws.on_upgrade(move |socket| async move {
                        debug!("socket connection established");

                        let (sender, receiver) = socket.split();

                        let mut network_peer = Peer::new(generate_peer_id());
                        network_peer.url = None;
                        network_peer.ip = addr.map(|a| a.ip().to_string());
                        network_peer.on_connect(timer.get_timestamp_in_ms());

                        NetworkController::handle_new_connection(
                            network_peer,
                            PeerSender::Warp(sender),
                            PeerReceiver::Warp(receiver),
                            network_controller,
                            wallet,
                            configs.configs,
                            &timer,
                            peers_lock,
                        )
                        .await
                    })
                },
            );

        // ---------------- HTTP ROUTE ----------------
        let http_route = warp::path!("block" / String).and_then(|block_hash: String| async move {
            let mut buffer: Vec<u8> = Default::default();
            let result = fs::read_dir(BLOCKS_DIR_PATH.to_string());
            if result.is_err() {
                return Err(warp::reject::not_found());
            }
            let paths: Vec<_> = result
                .unwrap()
                .map(|r| r.unwrap())
                .filter(|r| {
                    let filename = r.file_name().into_string().unwrap();
                    filename.contains(BLOCK_FILE_EXTENSION)
                        && filename.contains(block_hash.as_str())
                })
                .collect();

            if paths.is_empty() {
                return Err(warp::reject::not_found());
            }

            let path = paths.first().unwrap();
            let file_path = BLOCKS_DIR_PATH.to_string()
                + "/"
                + path.file_name().into_string().unwrap().as_str();

            let mut file = File::open(file_path.as_str())
                .await
                .map_err(|_| warp::reject::not_found())?;
            file.read_to_end(&mut buffer)
                .await
                .map_err(|_| warp::reject::not_found())?;

            Ok(warp::reply::with_status(buffer, StatusCode::OK))
        });

        // ---------------- LITE ROUTE ----------------
        let opt = warp::path::param::<String>()
            .map(Some)
            .or_else(|_| async { Ok::<(Option<String>,), std::convert::Infallible>((None,)) });

        let lite_route =
            warp::path!("lite-block" / String / ..)
                .and(opt)
                .and(warp::path::end())
                .and(warp::any().map(move || peers_lock_for_lite.clone()))
                .and_then(
                    move |block_hash: String,
                          key: Option<String>,
                          peer_lock: Arc<RwLock<Peers>>| async move {
                        let key = if let Some(key1) = key {
                            if key1.is_empty() {
                                public_key
                            } else {
                                let parsed = if key1.len() == 66 {
                                    SaitoPublicKey::from_hex(key1.as_str())
                                } else {
                                    SaitoPublicKey::from_base58(key1.as_str())
                                }
                                .map_err(|_| warp::reject::reject())?;

                                if parsed.len() != 33 {
                                    return Err(warp::reject::reject());
                                }
                                parsed
                            }
                        } else {
                            return Err(warp::reject::reject());
                        };

                        let keylist = {
                            let peers = peer_lock.read().await;
                            peers
                                .get_peer_by_public_key(&key)
                                .map(|p| p.key_list.clone())
                                .unwrap_or_default()
                        };

                        let mut buffer: Vec<u8> = Default::default();
                        let result = fs::read_dir(BLOCKS_DIR_PATH.to_string());
                        if result.is_err() {
                            return Err(warp::reject::not_found());
                        }

                        let paths: Vec<_> = result
                            .unwrap()
                            .map(|r| r.unwrap())
                            .filter(|r| {
                                let filename = r.file_name().into_string().unwrap();
                                filename.contains(BLOCK_FILE_EXTENSION)
                                    && filename.contains(block_hash.as_str())
                            })
                            .collect();

                        if paths.is_empty() {
                            return Err(warp::reject::not_found());
                        }

                        let path = paths.first().unwrap();
                        let file_path = BLOCKS_DIR_PATH.to_string()
                            + "/"
                            + path.file_name().into_string().unwrap().as_str();

                        let mut file = File::open(file_path.as_str())
                            .await
                            .map_err(|_| warp::reject::not_found())?;
                        file.read_to_end(&mut buffer)
                            .await
                            .map_err(|_| warp::reject::not_found())?;

                        let mut block = Block::deserialize_from_net(&buffer)
                            .map_err(|_| warp::reject::not_found())?;

                        block.generate().map_err(|_| warp::reject::not_found())?;

                        let block = block.generate_lite_block(keylist);
                        let buffer = block.serialize_for_net(BlockType::Full);

                        Ok(warp::reply::with_status(buffer, StatusCode::OK))
                    },
                );

        let routes = http_route.or(ws_route).or(lite_route);

        let address =
            SocketAddr::from_str((host + ":" + port.to_string().as_str()).as_str()).unwrap();
        warp::serve(routes).run(address).await;
    })
}
