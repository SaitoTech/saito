use saito_core::core::defs::Timestamp;
use std::time::{SystemTime, UNIX_EPOCH};

use saito_core::core::process::keep_time::KeepTime;

#[derive(Clone)]
pub struct TimeKeeper {}

impl KeepTime for TimeKeeper {
    fn get_timestamp_in_ms(&self) -> Timestamp {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as Timestamp
    }
}
