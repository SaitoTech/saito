use std::io::Error;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::core::consensus::blockchain::Blockchain;
use crate::core::consensus::mempool::Mempool;
use crate::core::consensus::wallet::Wallet;
use crate::core::defs::{BlockId, Currency};
use crate::core::process::run_task::RunTask;
use crate::core::util::configuration::Configuration;

#[derive(Clone)]
pub struct Context {
    pub blockchain_lock: Arc<RwLock<Blockchain>>,
    pub mempool_lock: Arc<RwLock<Mempool>>,
    pub wallet_lock: Arc<RwLock<Wallet>>,
    pub config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
}

impl Context {
    pub fn new(
        config_lock: Arc<RwLock<dyn Configuration + Send + Sync>>,
        wallet_lock: Arc<RwLock<Wallet>>,
        genesis_period: BlockId,
        social_stake: Currency,
        social_stake_period: BlockId,
    ) -> Context {
        Context {
            blockchain_lock: Arc::new(RwLock::new(Blockchain::new(
                wallet_lock.clone(),
                genesis_period,
                social_stake,
                social_stake_period,
            ))),
            mempool_lock: Arc::new(RwLock::new(Mempool::new(wallet_lock.clone()))),
            wallet_lock,
            config_lock,
        }
    }
    pub async fn init(&self, _task_runner: &dyn RunTask) -> Result<(), Error> {
        Ok(())
    }
}
