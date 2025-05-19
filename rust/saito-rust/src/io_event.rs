use std::sync::Mutex;

use lazy_static::lazy_static;

use saito_core::core::io::network_event::NetworkEvent;

#[derive(Debug)]
pub struct IoEvent {
    pub event_processor_id: u8,
    pub event_id: u64,
    pub event: NetworkEvent,
}

lazy_static! {
    static ref EVENT_COUNTER: Mutex<u64> = Mutex::new(0);
}

impl IoEvent {
    pub fn new(event: NetworkEvent) -> IoEvent {
        let mut value = EVENT_COUNTER.lock().unwrap();
        *value = *value + 1;
        assert_ne!(*value, 0);
        // trace!("new event created : {:?}", *value);
        IoEvent {
            event_processor_id: 0,
            event_id: value.clone(),
            event,
        }
    }
}
