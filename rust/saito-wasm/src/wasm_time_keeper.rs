use saito_core::core::defs::Timestamp;
use saito_core::core::process::keep_time::KeepTime;

pub struct WasmTimeKeeper {}

impl KeepTime for WasmTimeKeeper {
    fn get_timestamp_in_ms(&self) -> Timestamp {
        js_sys::Date::now() as Timestamp
    }
}
