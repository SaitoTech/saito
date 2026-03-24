use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use futures::stream::{SplitSink, SplitStream};
use futures::{SinkExt, StreamExt, TryStreamExt};
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
use saito_core::core::msg::message::Message;
use saito_core::core::process::keep_time::Timer;
use saito_core::core::routing::io::network::PeerDisconnectType;
use saito_core::core::routing::io::network_event::NetworkEvent;
use saito_core::core::routing::peers::io_event::IoEvent;
use saito_core::core::routing::peers::network_peer::NetworkPeer;
use saito_core::core::routing::peers::peer_collection::PeerCollection;
use saito_core::core::routing::peers::peer_service::PeerService;
use saito_core::core::util::configuration::Configuration;
use saito_core::core::util::serialize::Serialize;
// use crate::{IoEvent, NetworkEvent, TimeKeeper};

type SocketSender = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, tungstenite::Message>;
type SocketReceiver = SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>;

pub struct NetworkController {
    currently_queried_urls: Arc<Mutex<HashSet<String>>>,
    network_peers: HashMap<SaitoPublicKey, (NetworkPeer, Option<PeerSender>)>,
    services: Vec<PeerService>,
    pub sender_to_core: Sender<IoEvent>,
}

impl NetworkController {
    pub async fn send(connection: &mut PeerSender, buffer: Vec<u8>) -> bool {
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

    pub async fn send_outgoing_message(&mut self, public_key: &SaitoPublicKey, buffer: Vec<u8>) {
        let buf_len = buffer.len();

        // let mut sockets = sockets.lock().await;
        if let Some((_network_peer, sender)) = self.network_peers.get_mut(public_key) {
            if let Some(sender) = sender {
                if !Self::send(sender, buffer).await {
                    warn!(
                        "failed sending buffer of size : {:?} to peer : {:?}",
                        buf_len,
                        public_key.to_base58()
                    );

                    // sockets.remove(&public_key);
                }
            }
        } else {
            error!(
                "Cannot find the corresponding sender socket, key : {:?}",
                public_key.to_base58()
            );
        }
    }

    pub async fn connect_to_peer(
        network_controller: Arc<RwLock<NetworkController>>,
        url: String,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
        timer: &Timer,
    ) {
        // TODO : handle connecting to an already connected (via incoming connection) node.

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

            // let network_peer: NetworkPeer = {
            //     let network_controller = network_controller.read().await;
            //
            //     let mut selected_peer = None;
            //     for (key, (peer, _)) in network_controller.network_peers.iter() {
            //         if let Some(url2) = peer.url.as_ref() {
            //             if url == *url2 {
            //                 selected_peer = Some(peer);
            //             }
            //         }
            //     }
            //     if let Some(peer) = selected_peer {
            //         peer.clone()
            //     } else {
            //         NetworkPeer::new(Some(url))
            //     }
            // };

            let mut network_peer = NetworkPeer::new(Some(url));
            network_peer.ip = ip;

            NetworkController::handle_new_connection(
                network_peer,
                PeerSender::Tungstenite(socket_sender),
                PeerReceiver::Tungstenite(socket_receiver),
                network_controller,
                wallet,
                configs,
                timer,
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

    pub async fn send_to_all(&mut self, buffer: Vec<u8>, exceptions: Vec<SaitoPublicKey>) {
        trace!("sending buffer of size : {:?} to all", buffer.len());
        let _peers_with_errors: Vec<SaitoPublicKey> = Default::default();

        for (key, (_, sender)) in self.network_peers.iter_mut() {
            if exceptions.contains(&key) {
                continue;
            }
            if let Some(sender) = sender.as_mut() {
                trace!(
                    "sending buffer of size : {:?} to peer : {:?}",
                    buffer.len(),
                    key.to_base58()
                );
                if !Self::send(sender, buffer.clone()).await {
                    warn!(
                        "failed sending buffer (all) of size : {:?} to peer : {:?}",
                        buffer.len(),
                        key.to_base58()
                    );
                }
            }
        }

        // trace!("message sent to all");
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
        mut network_peer: NetworkPeer,
        mut sender: PeerSender,
        receiver: PeerReceiver,
        network_controller: Arc<RwLock<NetworkController>>,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
        timer: &Timer,
    ) {
        if network_peer.url.is_none() {
            // we send the handshake challenge to the peer if we received this connection
            debug!(
                "sending handshake challenge to peer : {}",
                network_peer.ip.as_ref().cloned().unwrap_or_default()
            );
            let challenge = network_peer.get_handshake_challenge_buffer().await;
            let buffer = Message::HandshakeChallenge(challenge).serialize();
            NetworkController::send(&mut sender, buffer).await;
        }

        // {
        //
        //     sockets.lock().await.insert(public_key, sender);
        // }

        NetworkController::receive_message_from_peer(
            receiver,
            network_peer,
            sender,
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
    pub async fn disconnect_socket_by_key(&mut self, public_key: SaitoPublicKey) {
        info!("disconnecting peer : {:?}", public_key.to_base58());
        if let Some((_peer, sender)) = self.network_peers.remove(&public_key) {
            if let Some(sender) = sender {
                match sender {
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
        }

        self.sender_to_core
            .send(IoEvent {
                event_processor_id: 1,
                // event_id: 0,
                event: NetworkEvent::PeerDisconnected {
                    public_key,
                    disconnect_type: PeerDisconnectType::InternalDisconnect,
                },
            })
            .await
            .expect("sending failed");
    }
    pub async fn receive_message_from_peer(
        receiver: PeerReceiver,
        mut peer: NetworkPeer,
        socket: PeerSender,
        wallet: Arc<RwLock<Wallet>>,
        configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
        timer: Timer,
        network_controller: Arc<RwLock<NetworkController>>,
    ) {
        debug!("starting new task for reading from peer",);
        tokio::spawn(async move {
            debug!("new thread started for peer receiving");

            let network_controller_clone = network_controller.clone();
            let wallet_clone = wallet.clone();
            let configs_clone = configs.clone();
            let socket_lock = Arc::new(Mutex::new(Some(socket)));

            match receiver {
                PeerReceiver::Warp(mut receiver) => loop {
                    let result = receiver.next().await;
                    if result.is_none() {
                        trace!("no message received");
                        continue;
                    }
                    let result = result.unwrap();
                    if result.is_err() {
                        // TODO : handle peer disconnections
                        warn!("failed receiving message [1] : {:?}", result.err().unwrap());
                        let mut network_controller = network_controller_clone.write().await;
                        if let Some(socket) = socket_lock.lock().await.take() {
                            network_controller.disconnect_socket(socket).await;
                        } else {
                            if let Some(public_key) = peer.public_key {
                                network_controller
                                    .disconnect_socket_by_key(public_key)
                                    .await;
                            } else {
                                warn!("socket was not found for peer");
                            }
                        }
                        // NetworkController::disconnect_socket(sockets, sender).await;
                        break;
                    }
                    let result = result.unwrap();

                    if result.is_binary() {
                        let buffer = result.into_bytes();
                        trace!("received buffer of size : {:?}", buffer.len());
                        let network_controller_for_closure = network_controller_clone.clone();
                        let socket_lock_for_closure = socket_lock.clone();

                        let services = if peer.is_connected() {
                            vec![]
                        } else {
                            network_controller_clone.read().await.services.clone()
                        };
                        let result = peer
                            .process_incoming_buffer(
                                buffer,
                                // &mut public_key,
                                wallet_clone.clone(),
                                configs_clone.clone(),
                                &timer,
                                &services,
                                |event| {
                                    let network_controller = network_controller_for_closure.clone();
                                    let socket_lock = socket_lock_for_closure.clone();
                                    async move {
                                        let mut peer_to_store = None;
                                        if let NetworkEvent::PeerConnectionResult {
                                            result: Ok(ref peer),
                                        } = event
                                        {
                                            peer_to_store = Some(peer.clone());
                                        }

                                        let message = IoEvent {
                                            event_processor_id: 1,
                                            event,
                                        };
                                        let mut network_controller =
                                            network_controller.write().await;

                                        if let Some(peer) = peer_to_store {
                                            if let Some(public_key) = peer.public_key {
                                                if !network_controller
                                                    .network_peers
                                                    .contains_key(&public_key)
                                                {
                                                    let socket = socket_lock.lock().await.take();
                                                    network_controller
                                                        .network_peers
                                                        .insert(public_key, (peer, socket));
                                                }
                                            }
                                        }

                                        network_controller
                                            .sender_to_core
                                            .send(message)
                                            .await
                                            .expect("sending failed");
                                    }
                                },
                            )
                            .await;
                        if !result.is_ok() {
                            info!("disconnecting socket since we couldn't process the received buffer");
                            let mut network_controller = network_controller_clone.write().await;
                            if let Some(socket) = socket_lock.lock().await.take() {
                                network_controller.disconnect_socket(socket).await;
                            } else {
                                if let Some(public_key) = peer.public_key {
                                    network_controller
                                        .disconnect_socket_by_key(public_key)
                                        .await;
                                } else {
                                    warn!("socket was not found for peer");
                                }
                            }
                        } else {
                            let buffer = result.unwrap();
                            if !buffer.is_empty() {
                                if let Some(socket) = socket_lock.lock().await.as_mut() {
                                    NetworkController::send(socket, buffer).await;
                                } else {
                                    network_controller_clone
                                        .write()
                                        .await
                                        .send_outgoing_message(&peer.public_key.unwrap(), buffer)
                                        .await;
                                }
                            }
                        }
                    } else if result.is_close() {
                        warn!("connection closed by remote peer",);
                        let mut network_controller = network_controller_clone.write().await;
                        if let Some(socket) = socket_lock.lock().await.take() {
                            network_controller.disconnect_socket(socket).await;
                        } else {
                            if let Some(public_key) = peer.public_key {
                                network_controller
                                    .disconnect_socket_by_key(public_key)
                                    .await;
                            } else {
                                warn!("socket was not found for peer");
                            }
                        }
                        break;
                    }
                },
                PeerReceiver::Tungstenite(mut receiver) => loop {
                    let result = receiver.next().await;
                    if result.is_none() {
                        trace!("no message received");
                        continue;
                    }
                    let result = result.unwrap();
                    if result.is_err() {
                        warn!("failed receiving message [2] : {:?}", result.err().unwrap());
                        let mut network_controller = network_controller_clone.write().await;
                        if let Some(socket) = socket_lock.lock().await.take() {
                            network_controller.disconnect_socket(socket).await;
                        } else {
                            if let Some(public_key) = peer.public_key {
                                network_controller
                                    .disconnect_socket_by_key(public_key)
                                    .await;
                            } else {
                                warn!("socket was not found for peer");
                            }
                        }
                        break;
                    }
                    let result = result.unwrap();
                    match result {
                        tokio_tungstenite::tungstenite::Message::Binary(buffer) => {
                            trace!("received buffer of size : {:?}", buffer.len());
                            let network_controller_for_closure = network_controller_clone.clone();
                            let socket_lock_for_closure = socket_lock.clone();
                            let services = if peer.is_connected() {
                                vec![]
                            } else {
                                network_controller_clone.read().await.services.clone()
                            };
                            let result = peer
                                .process_incoming_buffer(
                                    buffer,
                                    // &mut public_key,
                                    wallet_clone.clone(),
                                    configs_clone.clone(),
                                    &timer,
                                    &services,
                                    |event| {
                                        let network_controller =
                                            network_controller_for_closure.clone();
                                        let socket_lock = socket_lock_for_closure.clone();
                                        async move {
                                            let mut peer_to_store = None;
                                            if let NetworkEvent::PeerConnectionResult {
                                                result: Ok(ref peer),
                                            } = event
                                            {
                                                peer_to_store = Some(peer.clone());
                                            }

                                            let message = IoEvent {
                                                event_processor_id: 1,
                                                event,
                                            };
                                            // TODO : this lock needs to be removed probably for performance
                                            let mut network_controller =
                                                network_controller.write().await;

                                            if let Some(peer) = peer_to_store {
                                                if let Some(public_key) = peer.public_key {
                                                    if !network_controller
                                                        .network_peers
                                                        .contains_key(&public_key)
                                                    {
                                                        let socket =
                                                            socket_lock.lock().await.take();
                                                        debug!(
                                                            "adding network peer : {:?}",
                                                            public_key.to_base58()
                                                        );
                                                        network_controller
                                                            .network_peers
                                                            .insert(public_key, (peer, socket));
                                                    }
                                                }
                                            }
                                            network_controller
                                                .sender_to_core
                                                .send(message)
                                                .await
                                                .expect("sending failed");
                                        }
                                    },
                                )
                                .await;
                            if !result.is_ok() {
                                info!("disconnecting socket since we couldn't process the received buffer");
                                let mut network_controller = network_controller_clone.write().await;
                                if let Some(socket) = socket_lock.lock().await.take() {
                                    network_controller.disconnect_socket(socket).await;
                                } else {
                                    if let Some(public_key) = peer.public_key {
                                        network_controller
                                            .disconnect_socket_by_key(public_key)
                                            .await;
                                    } else {
                                        warn!("socket was not found for peer");
                                    }
                                }
                            } else {
                                let buffer = result.unwrap();
                                if !buffer.is_empty() {
                                    if let Some(socket) = socket_lock.lock().await.as_mut() {
                                        NetworkController::send(socket, buffer).await;
                                    } else {
                                        network_controller_clone
                                            .write()
                                            .await
                                            .send_outgoing_message(
                                                &peer.public_key.unwrap(),
                                                buffer,
                                            )
                                            .await;
                                    }
                                }
                            }
                        }
                        tokio_tungstenite::tungstenite::Message::Close(_) => {
                            info!("socket for peer was closed");
                            let mut network_controller = network_controller_clone.write().await;
                            if let Some(socket) = socket_lock.lock().await.take() {
                                network_controller.disconnect_socket(socket).await;
                            } else {
                                if let Some(public_key) = peer.public_key {
                                    network_controller
                                        .disconnect_socket_by_key(public_key)
                                        .await;
                                } else {
                                    warn!("socket was not found for peer");
                                }
                            }
                            break;
                        }
                        _ => {
                            // Not handling these scenarios
                        }
                    }
                },
            }
            // debug!(
            //     "listening thread existed for peer : {:?}",
            //     public_key.unwrap_or([0; 33]).to_base58()
            // );
        });
    }

    // async fn handle_received_buffer(
    //     peer: &mut NetworkPeer,
    //     mut socket: &mut PeerSender,
    //     wallet: Arc<RwLock<Wallet>>,
    //     configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
    //     timer: &Timer,
    //     public_key: &mut Option<SaitoPublicKey>,
    //     network_controller: &mut NetworkController,
    //     buffer: Vec<u8>,
    // ) -> bool {
    //     peer.process_incoming_buffer(
    //         buffer,
    //         network_controller.sender_to_core.clone(),
    //         public_key,
    //         wallet,
    //         configs,
    //         timer,
    //         &network_controller.services,
    //         async |buffer| {
    //             NetworkController::send(&mut socket, buffer).await;
    //         },
    //     )
    //     .await
    //     .is_ok()
    // }
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
    mut receiver: Receiver<IoEvent>,
    sender_to_core: Sender<IoEvent>,
    configs_lock: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
    _blockchain_lock: Arc<RwLock<Blockchain>>,
    sender_to_stat: Sender<StatEvent>,
    peers_lock: Arc<RwLock<PeerCollection>>,
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

    let network_controller_lock = Arc::new(RwLock::new(NetworkController {
        // sockets: Arc::new(Mutex::new(HashMap::new())),
        sender_to_core,
        currently_queried_urls: Arc::new(Default::default()),
        network_peers: Default::default(),
        services: vec![],
    }));
    let time_keeper = timer.clone();

    let server_handle = run_websocket_server(
        sender_clone.clone(),
        network_controller_lock.clone(),
        port,
        host,
        public_key,
        peers_lock,
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
                            NetworkEvent::OutgoingNetworkMessageForAll { buffer, exceptions } => {

                                    let mut network_controller = network_controller_lock.write().await;

                                network_controller.send_to_all( buffer, exceptions).await;
                                outgoing_messages.increment();
                            }
                            NetworkEvent::OutgoingNetworkMessage {
                                public_key,
                                buffer,
                            } => {

                                    let mut network_controller = network_controller_lock.write().await;
                                network_controller.send_outgoing_message(&public_key, buffer).await;
                                outgoing_messages.increment();
                            }
                            NetworkEvent::ConnectToPeer {url,  } => {
                                NetworkController::connect_to_peer(
                                    network_controller_lock.clone(),
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

                            NetworkEvent::DisconnectFromPeer { public_key } => {
                                    let mut network_controller = network_controller_lock.write().await;
                                network_controller.disconnect_socket_by_key(
                                  public_key
                                )
                                .await
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
                            sender_to_stat.send(StatEvent::StringStat(stat)).await.unwrap();

                            let stat = format!(
                                "{} - {} - capacity : {:?} / {:?}",
                                StatVariable::format_timestamp(time_keeper.get_timestamp_in_ms()),
                                format!("{:width$}", "network::channel_outgoing", width = 40),
                                sender_to_network.capacity(),
                                sender_to_network.max_capacity()
                            );
                            sender_to_stat.send(StatEvent::StringStat(stat)).await.unwrap();
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
    peers_lock: Arc<RwLock<PeerCollection>>,
    wallet: Arc<RwLock<Wallet>>,
    configs: Arc<RwLock<dyn Configuration + Send + Sync + 'static>>,
    timer: &Timer,
) -> JoinHandle<()> {
    info!("running websocket server on {:?}", port);

    let timer = timer.clone();
    let configs_wrapper = ConfigsWrapper { configs };
    tokio::spawn(async move {
        info!("starting websocket server");
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
                    debug!("incoming connection received");
                    let ws = ws.max_message_size(10_000_000_000);
                    let ws = ws.max_frame_size(10_000_000_000);

                    ws.on_upgrade(move |socket| async move {
                        debug!("socket connection established");

                        let (sender, receiver) = socket.split();

                        let mut network_peer = NetworkPeer::new(None);
                        network_peer.ip = addr.map(|a| a.ip().to_string());
                        NetworkController::handle_new_connection(
                            network_peer,
                            PeerSender::Warp(sender),
                            PeerReceiver::Warp(receiver),
                            network_controller,
                            wallet,
                            configs.configs,
                            &timer,
                        )
                        .await
                    })
                },
            );
        let http_route = warp::path!("block" / String).and_then(|block_hash: String| async move {
            // debug!("serving block : {:?}", block_hash);
            let mut buffer: Vec<u8> = Default::default();
            let result = fs::read_dir(BLOCKS_DIR_PATH.to_string());
            if result.is_err() {
                debug!("no blocks found");
                return Err(warp::reject::not_found());
            }
            let paths: Vec<_> = result
                .unwrap()
                .map(|r| r.unwrap())
                .filter(|r| {
                    let filename = r.file_name().into_string().unwrap();
                    if !filename.contains(BLOCK_FILE_EXTENSION) {
                        return false;
                    }
                    if !filename.contains(block_hash.as_str()) {
                        return false;
                    }
                    // debug!("selected file : {:?}", filename);
                    true
                })
                .collect();

            if paths.is_empty() {
                return Err(warp::reject::not_found());
            }
            let path = paths.first().unwrap();
            let file_path = BLOCKS_DIR_PATH.to_string()
                + "/"
                + path.file_name().into_string().unwrap().as_str();
            let result = File::open(file_path.as_str()).await;
            if result.is_err() {
                error!("failed opening file : {:?}", result.err().unwrap());
                return Err(warp::reject::not_found());
            }
            let mut file = result.unwrap();

            let result = file.read_to_end(&mut buffer).await;
            if result.is_err() {
                error!("failed reading file : {:?}", result.err().unwrap());
                return Err(warp::reject::not_found());
            }
            drop(file);

            let _buffer_len = buffer.len();
            let result = Ok(warp::reply::with_status(buffer, StatusCode::OK));
            // debug!("served block with : {:?} length", buffer_len);
            result
        });

        // TODO : review this code
        let opt = warp::path::param::<String>()
            .map(Some)
            .or_else(|_| async { Ok::<(Option<String>,), std::convert::Infallible>((None,)) });
        let lite_route = warp::path!("lite-block" / String / ..)
            .and(opt)
            .and(warp::path::end())
            .and(warp::any().map(move || peers_lock.clone()))
            .and_then(
                move |block_hash: String,
                      key: Option<String>,
                      peer_lock: Arc<RwLock<PeerCollection>>| async move {
                    // debug!("serving lite block : {:?}", block_hash);

                    let key1;
                    if key.is_some() {
                        key1 = key.unwrap();
                    } else {
                        warn!("key is not set to request lite blocks");
                        return Err(warp::reject::reject());
                    }

                    let key;
                    if key1.is_empty() {
                        key = public_key;
                    } else {
                        let result: Result<SaitoPublicKey, String>;
                        if key1.len() == 66 {
                            result = SaitoPublicKey::from_hex(key1.as_str());
                        } else {
                            result = SaitoPublicKey::from_base58(key1.as_str());
                        }
                        if result.is_err() {
                            warn!("key : {:?} couldn't be decoded", key1);
                            return Err(warp::reject::reject());
                        }

                        let result = result.unwrap();
                        if result.len() != 33 {
                            warn!("key length : {:?} is not for public key", result.len());
                            return Err(warp::reject::reject());
                        }
                        key = result;
                    }
                    let mut keylist;
                    {
                        let peers = peer_lock.read().await;
                        let peer = peers.peers.get(&key);
                        if peer.is_none() {
                            debug!(
                                "lite block requester : {:?} is not connected as a peer",
                                key.to_hex()
                            );
                            keylist = vec![key];
                        } else {
                            keylist = peer.as_ref().unwrap().key_list.clone();
                            keylist.push(key);
                        }
                    }

                    let mut buffer: Vec<u8> = Default::default();
                    let result = fs::read_dir(BLOCKS_DIR_PATH.to_string());
                    if result.is_err() {
                        debug!("no blocks found");
                        return Err(warp::reject::not_found());
                    }
                    let paths: Vec<_> = result
                        .unwrap()
                        .map(|r| r.unwrap())
                        .filter(|r| {
                            let filename = r.file_name().into_string().unwrap();
                            if !filename.contains(BLOCK_FILE_EXTENSION) {
                                return false;
                            }
                            if !filename.contains(block_hash.as_str()) {
                                return false;
                            }
                            true
                        })
                        .collect();

                    if paths.is_empty() {
                        return Err(warp::reject::not_found());
                    }
                    let path = paths.first().unwrap();
                    let file_path = BLOCKS_DIR_PATH.to_string()
                        + "/"
                        + path.file_name().into_string().unwrap().as_str();
                    let result = File::open(file_path.as_str()).await;
                    if result.is_err() {
                        error!("failed opening file : {:?}", result.err().unwrap());
                        return Err(warp::reject::not_found());
                    }
                    let mut file = result.unwrap();

                    let result = file.read_to_end(&mut buffer).await;
                    if result.is_err() {
                        error!("failed reading file : {:?}", result.err().unwrap());
                        return Err(warp::reject::not_found());
                    }
                    drop(file);

                    let block = Block::deserialize_from_net(&buffer);
                    if block.is_err() {
                        error!("failed parsing buffer into a block");
                        return Err(warp::reject::not_found());
                    }
                    let mut block = block.unwrap();
                    if block.generate().is_err() {
                        error!("failed generating block : {}", block_hash);
                        return Err(warp::reject::not_found());
                    }
                    let block = block.generate_lite_block(keylist);
                    let buffer = block.serialize_for_net(BlockType::Full);
                    Ok(warp::reply::with_status(buffer, StatusCode::OK))
                },
            );
        let routes = http_route.or(ws_route).or(lite_route);
        // let (_, server) =
        //     warp::serve(ws_route).bind_with_graceful_shutdown(([127, 0, 0, 1], port), async {
        //         // tokio::signal::ctrl_c().await.ok();
        //     });
        // server.await;
        let address =
            SocketAddr::from_str((host + ":" + port.to_string().as_str()).as_str()).unwrap();
        warp::serve(routes).run(address).await;
    })
}

#[cfg(test)]
mod tests {
    use futures::SinkExt;
    use log::info;

    use saito_core::core::msg::handshake::HandshakeChallenge;
    use saito_core::core::msg::message::Message;
    use saito_core::core::util::crypto::generate_random_bytes;
    use tokio_tungstenite::connect_async;

    // #[tokio::test]
    // #[serial_test::serial]
    // async fn multi_peer_perf_test() {
    //     // pretty_env_logger::init();
    //     let url = "ws://127.0.0.1:12101/wsopen";
    //
    //     info!("url = {:?}", url);
    //
    //     let mut sockets = vec![];
    //     let it = 10000;
    //     for i in 0..it {
    //         let result = connect_async(url).await;
    //         if result.is_err() {
    //             println!("{:?}", result.err().unwrap());
    //             return;
    //         }
    //         let result = result.unwrap();
    //         let mut socket = result.0;
    //
    //         let challenge = HandshakeChallenge {
    //             challenge: generate_random_bytes(32).await.try_into().unwrap(),
    //         };
    //         // challenge_for_peer = Some(challenge.challenge);
    //         let message = Message::HandshakeChallenge(challenge);
    //
    //         socket
    //             .send(tokio_tungstenite::tungstenite::Message::Binary(
    //                 message.serialize(),
    //             ))
    //             .await
    //             .unwrap();
    //
    //         sockets.push(socket);
    //
    //         // let (socket_sender, socket_receiver): (SocketSender, SocketReceiver) = socket.split();
    //         info!("connecting ... : {:?}", i);
    //     }
    // }
}
