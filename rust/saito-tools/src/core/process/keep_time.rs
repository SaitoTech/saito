use crate::core::defs::Timestamp;
use std::sync::Arc;

/// Provides the current time in a implementation agnostic way into the core logic library. Since the core logic lib can be used on rust
/// application as well as WASM, it needs to get the time via this trait implementation.

pub trait KeepTime {
    fn get_timestamp_in_ms(&self) -> Timestamp;
}

#[derive(Clone)]
pub struct Timer {
    pub time_reader: Arc<dyn KeepTime + Sync + Send>,
    pub hasten_multiplier: u64,
    pub start_time: Timestamp,
}

impl Timer {
    pub fn get_timestamp_in_ms(&self) -> Timestamp {
        assert_ne!(
            self.hasten_multiplier, 0,
            "hasten multiplier should be positive"
        );

        let current_time = self.time_reader.get_timestamp_in_ms();

        self.start_time + (current_time - self.start_time) * self.hasten_multiplier
    }
}
