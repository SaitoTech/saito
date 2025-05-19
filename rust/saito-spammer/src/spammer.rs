use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use log::info;
use saito_core::core::consensus::peers::peer::PeerStatus;
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::RwLock;

use saito_core::core::consensus::blockchain::Blockchain;
use saito_core::core::consensus::peers::peer_collection::PeerCollection;
use saito_core::core::consensus::transaction::Transaction;
use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::defs::Currency;
use saito_core::core::io::network_event::NetworkEvent;
use saito_core::core::msg::message::Message;
use saito_rust::io_event::IoEvent;

use crate::config_handler::SpammerConfigs;
use crate::transaction_generator::{GeneratorState, TransactionGenerator};

pub struct Spammer {
    sender_to_network: Sender<IoEvent>,
    // peer_lock: Arc<RwLock<PeerCollection>>,
    config_lock: Arc<RwLock<SpammerConfigs>>,
    bootstrap_done: bool,
    // sent_tx_count: u64,
    tx_generator: TransactionGenerator,
}

impl Spammer {
    pub async fn new(
        wallet_lock: Arc<RwLock<Wallet>>,
        peers_lock: Arc<RwLock<PeerCollection>>,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        sender_to_network: Sender<IoEvent>,
        sender: Sender<VecDeque<Transaction>>,
        configs_lock: Arc<RwLock<SpammerConfigs>>,
    ) -> Spammer {
        let tx_payment;
        let tx_fee;
        {
            let configs = configs_lock.read().await;
            tx_payment = configs.get_spammer_configs().tx_payment;
            tx_fee = configs.get_spammer_configs().tx_fee;
        }
        Spammer {
            sender_to_network,
            // peer_lock: peers_lock.clone(),
            config_lock: configs_lock.clone(),
            bootstrap_done: false,
            // sent_tx_count: 0,
            tx_generator: TransactionGenerator::create(
                wallet_lock.clone(),
                peers_lock.clone(),
                blockchain_lock.clone(),
                configs_lock.clone(),
                sender,
                tx_payment as Currency,
                tx_fee as Currency,
            )
            .await,
        }
    }

    async fn run(&mut self, mut receiver: Receiver<VecDeque<Transaction>>) {
        let mut work_done;
        let timer_in_milli;
        let burst_count;
        let stop_after;

        {
            let configs = self.config_lock.read().await;

            timer_in_milli = configs.get_spammer_configs().timer_in_milli;
            burst_count = configs.get_spammer_configs().burst_count;
            stop_after = configs.get_spammer_configs().stop_after;
        }

        let sender = self.sender_to_network.clone();
        let peer_lock = self.tx_generator.peer_lock.clone();
        tokio::spawn(async move {
            let mut total_count = 0;
            let mut count = burst_count;
            loop {
                {
                    let peers = peer_lock.read().await;
                    if let Some((index, peer)) = peers.index_to_peers.iter().next() {
                        if let PeerStatus::Connected = peer.peer_status {
                            // info!("peer count : {}", peers.index_to_peers.len());
                            // info!("peer status : {:?}", peer.peer_status);
                        } else {
                            info!("peer not connected. status : {:?}", peer.peer_status);
                            tokio::time::sleep(Duration::from_millis(timer_in_milli)).await;
                            continue;
                        }
                    }
                }
                if let Some(transactions) = receiver.recv().await {
                    info!(
                        "received {:?} txs to be sent. sender capacity : {:?} / {:?}",
                        transactions.len(),
                        sender.capacity(),
                        sender.max_capacity()
                    );
                    for tx in transactions {
                        count -= 1;
                        total_count += 1;
                        sender
                            .send(IoEvent {
                                event_processor_id: 0,
                                event_id: 0,
                                event: NetworkEvent::OutgoingNetworkMessageForAll {
                                    buffer: Message::Transaction(tx).serialize(),
                                    exceptions: vec![],
                                },
                            })
                            .await
                            .unwrap();

                        if count == 0 {
                            tokio::time::sleep(Duration::from_millis(timer_in_milli)).await;
                            count = burst_count;
                        }
                        if total_count == stop_after {
                            tokio::time::sleep(Duration::from_millis(10_000)).await;
                            info!("terminating spammer after sending : {:?} txs", total_count);
                            std::process::exit(0);
                        }
                    }
                    info!(
                        "sent all the txs received from generator : total count : {:?}",
                        total_count
                    );
                }
            }
        });
        tokio::task::yield_now().await;
        loop {
            work_done = false;

            if !self.bootstrap_done {
                // if self.tx_generator.get_state() != GeneratorState::Done  {
                //     self.tx_generator.check_blockchain_for_confirmation().await ;
                // }
                {
                    let peers = self.tx_generator.peer_lock.read().await;
                    if let Some((index, peer)) = peers.index_to_peers.iter().next() {
                        if let PeerStatus::Connected = peer.peer_status {
                            // info!("peer count : {}", peers.index_to_peers.len());
                            // info!("peer status : {:?}", peer.peer_status);
                            // to_public_key = peer.get_public_key().unwrap();
                        } else {
                            info!("peer not connected. status : {:?}", peer.peer_status);
                            tokio::time::sleep(Duration::from_millis(timer_in_milli)).await;
                            continue;
                        }
                    }
                }
                self.tx_generator.on_new_block().await;
                self.bootstrap_done = self.tx_generator.get_state() == GeneratorState::Done;
                work_done = true;
            }

            if !work_done {
                tokio::time::sleep(Duration::from_millis(timer_in_milli)).await;
            }
        }
    }
}

pub async fn run_spammer(
    wallet_lock: Arc<RwLock<Wallet>>,
    peers_lock: Arc<RwLock<PeerCollection>>,
    blockchain_lock: Arc<RwLock<Blockchain>>,
    sender_to_network: Sender<IoEvent>,
    configs_lock: Arc<RwLock<SpammerConfigs>>,
) {
    info!("starting the spammer");
    tokio::spawn(async move {
        let (sender, receiver) = tokio::sync::mpsc::channel::<VecDeque<Transaction>>(1000);
        let mut spammer = Spammer::new(
            wallet_lock,
            peers_lock,
            blockchain_lock,
            sender_to_network,
            sender,
            configs_lock,
        )
        .await;
        spammer.run(receiver).await;
    });
}
