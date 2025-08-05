use crate::core::consensus::peers::rate_limiter::RateLimiter;
use crate::core::defs::Timestamp;
use ahash::HashMap;
use log::info;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CongestionType {
    ReceivedKeyLists,
    CompletedHandshakes,
    FailedHandshakes,
    IncomingMessages,
    ReceivedInvalidBlocks,
    ReceivedValidBlocks,
    ReceivedInvalidTransactions,
    ReceivedValidTransactions,
    PeerConnections,
    FailedBlockFetches,
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub enum PeerCongestionStatus {
    NoAction,
    Throttle(Timestamp /*Expiry Time */),
    Blacklist(Timestamp /*Expiry Time */),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerCongestionControls {
    pub controls: HashMap<CongestionType, RateLimiter>,
    pub statuses: HashMap<CongestionType, PeerCongestionStatus>,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CongestionStatsDisplay {
    pub congestion_controls_by_key: HashMap<String, PeerCongestionControls>,
    pub congestion_controls_by_ip: HashMap<String, PeerCongestionControls>,
}
impl Default for PeerCongestionControls {
    fn default() -> Self {
        let mut controls: HashMap<CongestionType, RateLimiter> = HashMap::default();
        controls.insert(
            CongestionType::ReceivedKeyLists,
            RateLimiter::new(1_000_000, Duration::from_secs(60)),
        );
        controls.insert(
            CongestionType::CompletedHandshakes,
            RateLimiter::new(1_000_000, Duration::from_secs(60)),
        );
        controls.insert(
            CongestionType::IncomingMessages,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        controls.insert(
            CongestionType::ReceivedInvalidBlocks,
            RateLimiter::new(1_000_000, Duration::from_secs(3600)),
        );
        controls.insert(
            CongestionType::FailedHandshakes,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        controls.insert(
            CongestionType::ReceivedValidBlocks,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        controls.insert(
            CongestionType::ReceivedInvalidTransactions,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        controls.insert(
            CongestionType::ReceivedValidTransactions,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        controls.insert(
            CongestionType::PeerConnections,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        controls.insert(
            CongestionType::FailedBlockFetches,
            RateLimiter::new(1_000_000, Duration::from_secs(1)),
        );
        Self {
            controls: controls,
            statuses: Default::default(),
        }
    }
}

impl PeerCongestionControls {
    pub fn increase(&mut self, congestion_type: CongestionType, current_time: Timestamp) {
        if let Some(rate_limiter) = self.controls.get_mut(&congestion_type) {
            rate_limiter.increase();
            if rate_limiter.has_limit_exceeded(current_time) {
                let result = Self::decide_status(congestion_type, current_time);
                self.statuses.insert(congestion_type, result);
                info!(
                    "Congestion status updated for {:?} to {:?}",
                    congestion_type, result
                );
            }
        }
    }

    pub fn get_congestion_status(&self, current_time: Timestamp) -> PeerCongestionStatus {
        let mut current_status = PeerCongestionStatus::NoAction;

        for (congestion_type, status) in &self.statuses {
            match status {
                PeerCongestionStatus::Throttle(expiry_time) => {
                    if *expiry_time < current_time {
                        continue;
                    }
                    current_status = status.clone();
                }
                // If any status is Blacklist, we return it immediately
                PeerCongestionStatus::Blacklist(expiry_time) => {
                    if *expiry_time < current_time {
                        continue;
                    }
                    return status.clone();
                }
                _ => {}
            }
        }

        current_status
    }

    fn decide_status(
        congestion_type: CongestionType,
        current_time: Timestamp,
    ) -> PeerCongestionStatus {
        // Define the throttling and blacklisting durations for each congestion type
        match congestion_type {
            CongestionType::ReceivedKeyLists => {
                PeerCongestionStatus::Throttle(current_time + 60_000)
            }
            CongestionType::CompletedHandshakes => {
                PeerCongestionStatus::Throttle(current_time + 60_000)
            }
            CongestionType::IncomingMessages => {
                PeerCongestionStatus::Throttle(current_time + 1_000)
            }
            CongestionType::ReceivedInvalidBlocks => {
                PeerCongestionStatus::Blacklist(current_time + 3_600_000)
            }
            CongestionType::FailedHandshakes => {
                PeerCongestionStatus::Throttle(current_time + 1_000)
            }
            CongestionType::ReceivedValidBlocks => {
                PeerCongestionStatus::Throttle(current_time + 1_000)
            }
            CongestionType::ReceivedInvalidTransactions => {
                PeerCongestionStatus::Throttle(current_time + 1_000)
            }
            CongestionType::ReceivedValidTransactions => {
                PeerCongestionStatus::Throttle(current_time + 1_000)
            }
            CongestionType::PeerConnections => PeerCongestionStatus::Throttle(current_time + 1_000),
            CongestionType::FailedBlockFetches => {
                PeerCongestionStatus::Throttle(current_time + 1_000)
            }
        }
    }
}
