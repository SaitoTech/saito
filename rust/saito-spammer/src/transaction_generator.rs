use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use log::{debug, info};
use rayon::prelude::*;
use saito_core::core::consensus::peers::peer::PeerStatus;
use tokio::sync::mpsc::Sender;
use tokio::sync::RwLock;

use saito_core::core::consensus::blockchain::Blockchain;
use saito_core::core::consensus::peers::peer_collection::PeerCollection;
use saito_core::core::consensus::slip::{Slip, SLIP_SIZE};
use saito_core::core::consensus::transaction::Transaction;
use saito_core::core::consensus::wallet::Wallet;
use saito_core::core::defs::{Currency, SaitoPrivateKey, SaitoPublicKey};
use saito_core::core::process::keep_time::KeepTime;
use saito_core::core::util::crypto::generate_random_bytes;
use saito_core::drain;
use saito_rust::time_keeper::TimeKeeper;
use tracing_subscriber::field::debug;

use crate::config_handler::SpammerConfigs;
use saito_core::core::util::configuration::Configuration;

#[derive(Clone, PartialEq)]
pub enum GeneratorState {
    CreatingSlips,
    WaitingForBlockChainConfirmation,
    Done,
}

pub struct TransactionGenerator {
    pub state: GeneratorState,
    wallet_lock: Arc<RwLock<Wallet>>,
    blockchain_lock: Arc<RwLock<Blockchain>>,
    expected_slip_count: u64,
    tx_size: u64,
    tx_count: u64,
    time_keeper: Box<TimeKeeper>,
    public_key: SaitoPublicKey,
    private_key: SaitoPrivateKey,
    sender: Sender<VecDeque<Transaction>>,
    tx_payment: Currency,
    tx_fee: Currency,
    pub peer_lock: Arc<RwLock<PeerCollection>>,
    configuration_lock: Arc<RwLock<SpammerConfigs>>,
}

impl TransactionGenerator {
    pub async fn create(
        wallet_lock: Arc<RwLock<Wallet>>,
        peers_lock: Arc<RwLock<PeerCollection>>,
        blockchain_lock: Arc<RwLock<Blockchain>>,
        configuration_lock: Arc<RwLock<SpammerConfigs>>,
        sender: Sender<VecDeque<Transaction>>,
        tx_payment: Currency,
        tx_fee: Currency,
    ) -> Self {
        let tx_size;
        let tx_count;
        {
            let configs = configuration_lock.read().await;

            tx_size = configs.get_spammer_configs().tx_size;
            tx_count = configs.get_spammer_configs().tx_count;
        }

        let mut res = TransactionGenerator {
            state: GeneratorState::CreatingSlips,
            wallet_lock: wallet_lock.clone(),
            blockchain_lock: blockchain_lock.clone(),
            expected_slip_count: 1,
            tx_size,
            tx_count,
            time_keeper: Box::new(TimeKeeper {}),
            public_key: [0; 33],
            private_key: [0; 32],
            sender,
            tx_payment,
            tx_fee,
            peer_lock: peers_lock.clone(),
            configuration_lock,
        };
        {
            let wallet = wallet_lock.read().await;
            res.public_key = wallet.public_key;
            res.private_key = wallet.private_key;
        }
        res
    }

    pub fn get_state(&self) -> GeneratorState {
        self.state.clone()
    }
    pub async fn on_new_block(&mut self) {
        match self.state {
            GeneratorState::CreatingSlips => {
                self.create_slips().await;
            }
            GeneratorState::WaitingForBlockChainConfirmation => {
                if self.check_blockchain_for_confirmation().await {
                    self.create_test_transactions().await;
                    self.state = GeneratorState::Done;
                } else {
                    tokio::time::sleep(Duration::from_millis(1_000)).await;
                }
            }
            GeneratorState::Done => {}
        }
    }

    async fn create_slips(&mut self) {
        info!(
            "creating slips for spammer. expect : {:?}",
            self.expected_slip_count
        );
        let output_slips_per_input_slip: u8 = 100;
        let unspent_slip_count;
        let available_balance;

        {
            let wallet = self.wallet_lock.read().await;

            unspent_slip_count = wallet.get_unspent_slip_count();
            available_balance = wallet.get_available_balance();
        }

        if unspent_slip_count < self.tx_count && unspent_slip_count >= self.expected_slip_count {
            info!(
                "Creating new slips, current = {:?}, target = {:?} balance = {:?}",
                unspent_slip_count, self.tx_count, available_balance
            );

            let total_nolans_requested_per_slip =
                available_balance / unspent_slip_count as Currency;
            let mut total_output_slips_created: u64 = 0;

            let mut to_public_key = [0; 33];

            {
                let peers = self.peer_lock.read().await;

                if peers.index_to_peers.is_empty() {
                    info!("not yet connected to a node");
                    return;
                }

                if let Some((index, peer)) = peers.index_to_peers.iter().next() {
                    if let PeerStatus::Connected = peer.peer_status {
                        to_public_key = peer.get_public_key().unwrap();
                    } else {
                        info!("peer not connected. status : {:?}", peer.peer_status);
                        return;
                    }
                }
                assert_eq!(peers.address_to_peers.len(), 1usize, "we have assumed connecting to a single node. move add_hop to correct place if not.");
                assert_ne!(to_public_key, self.public_key);
            }
            let mut txs: VecDeque<Transaction> = Default::default();
            for _i in 0..unspent_slip_count {
                let transaction = self
                    .create_slip_transaction(
                        output_slips_per_input_slip,
                        total_nolans_requested_per_slip,
                        &mut total_output_slips_created,
                        &to_public_key,
                    )
                    .await;

                // txs.push_back(transaction);
                txs.push_back(transaction);

                if total_output_slips_created >= self.tx_count {
                    info!(
                        "Slip creation completed, current = {:?}, target = {:?}",
                        total_output_slips_created, self.tx_count
                    );
                    info!("changing state to 'WaitingForBlockChainConfirmation'");
                    self.state = GeneratorState::WaitingForBlockChainConfirmation;
                    break;
                }
            }
            info!("{:?} slip creation txs generated", txs.len());
            self.sender.send(txs).await.unwrap();

            // self.expected_slip_count = total_output_slips_created;

            info!(
                "New slips created, current = {:?}, target = {:?}",
                total_output_slips_created, self.tx_count
            );
        } else {
            if unspent_slip_count >= self.tx_count {
                self.state = GeneratorState::WaitingForBlockChainConfirmation;
                info!("changing state to 'WaitingForBlockChainConfirmation' since we have enough slips");
                return;
            }
            info!(
                "not enough slips. unspent slip count : {:?} tx count : {:?} expected slips : {:?}",
                unspent_slip_count, self.tx_count, self.expected_slip_count
            );
            tokio::time::sleep(Duration::from_millis(1_000)).await;
        }
    }

    async fn create_slip_transaction(
        &mut self,
        output_slips_per_input_slip: u8,
        total_nolans_requested_per_slip: Currency,
        total_output_slips_created: &mut u64,
        to_public_key: &SaitoPublicKey,
    ) -> Transaction {
        let payment_amount =
            total_nolans_requested_per_slip / output_slips_per_input_slip as Currency;

        let genesis_period;
        let latest_block_id;
        {
            genesis_period = self.get_genesis_period().await;
            latest_block_id = self.get_latest_block_id().await;
        }

        let mut wallet = self.wallet_lock.write().await;

        let mut transaction = Transaction::default();

        let (input_slips, output_slips) = wallet.generate_slips(
            total_nolans_requested_per_slip,
            None,
            latest_block_id,
            genesis_period,
        );

        for slip in input_slips {
            transaction.add_from_slip(slip);
        }
        for slip in output_slips {
            transaction.add_to_slip(slip);
        }

        for _c in 0..output_slips_per_input_slip {
            let mut output = Slip::default();
            output.public_key = self.public_key;
            output.amount = payment_amount;
            transaction.add_to_slip(output);
            *total_output_slips_created += 1;
        }

        let remaining_bytes: i64 =
            self.tx_size as i64 - (*total_output_slips_created + 1) as i64 * SLIP_SIZE as i64;

        if remaining_bytes > 0 {
            transaction.data = generate_random_bytes(remaining_bytes as u64).await;
        }

        transaction.timestamp = self.time_keeper.get_timestamp_in_ms();
        transaction.generate(&self.public_key, 0, 0);
        transaction.sign(&self.private_key);
        transaction.add_hop(&wallet.private_key, &wallet.public_key, to_public_key);

        transaction
    }

    pub async fn check_blockchain_for_confirmation(&mut self) -> bool {
        info!("checking for blockchain confirmation...");
        let unspent_slip_count;
        {
            let wallet = self.wallet_lock.read().await;
            unspent_slip_count = wallet.get_unspent_slip_count();
        }

        if unspent_slip_count >= self.tx_count {
            info!(
                "New slips detected on the blockchain, current = {:?}, target = {:?}",
                unspent_slip_count, self.tx_count
            );
            info!("changing state to 'Generation Done'");
            self.state = GeneratorState::Done;
            return true;
        }
        info!(
            "unspent slips : {:?} tx count : {:?}",
            unspent_slip_count, self.tx_count
        );
        false
    }

    pub async fn create_test_transactions(&mut self) {
        info!("creating test transactions : {:?}", self.tx_count);

        let time_keeper = TimeKeeper {};
        let wallet = self.wallet_lock.clone();
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1000);
        let public_key = self.public_key;
        let count = self.tx_count;
        let required_balance = (self.tx_payment + self.tx_fee) * count as Currency;
        let payment = self.tx_payment;
        let fee = self.tx_fee;

        let genesis_period = self.get_genesis_period().await;
        let latest_block_id = self.get_latest_block_id().await;

        tokio::spawn(async move {
            info!(
                "creating test transactions from new thread : count = {:?}",
                count
            );
            let sender = sender.clone();
            loop {
                let mut work_done = false;
                {
                    // let blockchain = lock_for_write!(blockchain, LOCK_ORDER_BLOCKCHAIN);
                    let mut wallet = wallet.write().await;

                    if wallet.get_available_balance() >= required_balance {
                        // assert_ne!(blockchain.utxoset.len(), 0);
                        let mut vec = VecDeque::with_capacity(count as usize);
                        for i in 0..count {
                            if i % 100_000 == 0 {
                                info!("creating test transactions : {:?}", i);
                            }
                            let transaction = Transaction::create(
                                &mut wallet,
                                public_key,
                                payment,
                                fee,
                                false,
                                None,
                                latest_block_id,
                                genesis_period,
                            );
                            if transaction.is_err() {
                                debug!("transaction creation failed. {:?}", transaction);
                                break;
                            }
                            let mut transaction = transaction.unwrap();
                            transaction.generate_total_fees(0, 0);
                            if (transaction.total_in == 0 || transaction.total_out == 0)
                                && (payment + fee != 0)
                            {
                                debug!("transaction not added since not enough funds. in : {:?} out : {:?}. current balance : {:?}, required : {:?}", transaction.total_in, transaction.total_out,wallet.get_available_balance(), required_balance);
                                break;
                            }
                            vec.push_back(transaction);
                        }
                        if !vec.is_empty() {
                            info!("sending generated {:?} txs to spammer. sender capacity : {:?} / {:?}",vec.len(),sender.capacity(),sender.max_capacity());
                            sender.send(vec).await.unwrap();
                            work_done = true;
                        }
                    } else {
                        info!("not enough balance in wallet to create spam txs");
                    }
                }
                if !work_done {
                    tokio::time::sleep(Duration::from_millis(1_000)).await;
                }
            }
        });
        tokio::task::yield_now().await;

        let mut to_public_key = [0; 33];

        {
            let peers = self.peer_lock.read().await;

            if let Some((index, peer)) = peers.index_to_peers.iter().next() {
                // if let PeerStatus::Connected = peer.peer_status {
                info!("peer count : {}", peers.index_to_peers.len());
                info!("peer status : {:?}", peer.peer_status);
                to_public_key = peer.get_public_key().unwrap();
                // } else {
                //     info!("peer not connected. status : {:?}", peer.peer_status);
                // }
            }
            // assert_eq!(peers.address_to_peers.len(), 1 as usize, "we have assumed connecting to a single node. move add_hop to correct place if not.");
            assert_ne!(to_public_key, self.public_key);
        }

        while let Some(mut transactions) = receiver.recv().await {
            let sender = self.sender.clone();
            let tx_size = self.tx_size;
            info!(
                "received {:?} unsigned txs from generator",
                transactions.len()
            );

            let txs: VecDeque<Transaction> = drain!(transactions, 100)
                .map(|mut transaction| {
                    transaction.data = vec![0; tx_size as usize]; //;generate_random_bytes(tx_size as u64);
                    transaction.timestamp = time_keeper.get_timestamp_in_ms();
                    transaction.generate(&public_key, 0, 0);
                    transaction.sign(&self.private_key);
                    transaction.add_hop(&self.private_key, &self.public_key, &to_public_key);

                    transaction
                })
                .collect();
            info!("sending {:?} signed txs to spammer", txs.len());
            sender.send(txs).await.unwrap();
        }

        // info!("Test transactions created, count : {:?}", txs.len());
    }

    async fn get_latest_block_id(&self) -> u64 {
        let blockchain = self.blockchain_lock.read().await;
        blockchain.blockring.get_latest_block_id()
    }

    async fn get_genesis_period(&self) -> u64 {
        let config_guard = self.configuration_lock.read().await;

        let config: &dyn Configuration = &*config_guard;

        if let Some(consensus_config) = config.get_consensus_config() {
            let period = consensus_config.genesis_period;
            // println!("genesis_period: {:?}", period);
            period
        } else {
            println!("No consensus config available.");
            // Default value if consensus config is not available
            1000
        }
    }
}
