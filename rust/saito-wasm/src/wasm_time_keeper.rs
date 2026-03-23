use saito_core::core::defs::Timestamp;
use saito_core::core::process::timer::KeepTime;

#[cfg(target_arch = "wasm32")]
fn current_timestamp_in_ms() -> Timestamp {
    js_sys::Date::now() as Timestamp
}

#[cfg(not(target_arch = "wasm32"))]
fn current_timestamp_in_ms() -> Timestamp {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_millis() as Timestamp
}

pub struct WasmTimeKeeper {}

impl WasmTimeKeeper {
    pub fn current_time_in_ms() -> Timestamp {
        current_timestamp_in_ms()
    }
}

impl KeepTime for WasmTimeKeeper {
    fn get_timestamp_in_ms(&self) -> Timestamp {
        Self::current_time_in_ms()
    }
}
