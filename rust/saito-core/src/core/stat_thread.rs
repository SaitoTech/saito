use std::collections::VecDeque;
use std::time::Duration;

use async_trait::async_trait;
use log::info;

use crate::core::defs::Timestamp;
use crate::core::io::interface_io::InterfaceIO;
use crate::core::io::network_event::NetworkEvent;
use crate::core::process::process_event::ProcessEvent;

const STAT_FILENAME: &str = "./data/saito.stats";

pub struct StatThread {
    pub stat_queue: VecDeque<String>,
    pub io_interface: Box<dyn InterfaceIO + Send + Sync>,
    pub enabled: bool,
}

impl StatThread {
    pub async fn new(io_interface: Box<dyn InterfaceIO + Send + Sync>) -> StatThread {
        StatThread {
            io_interface,
            stat_queue: VecDeque::new(),
            enabled: true,
        }
    }
}

#[async_trait]
impl ProcessEvent<String> for StatThread {
    async fn process_network_event(&mut self, _event: NetworkEvent) -> Option<()> {
        None
    }

    async fn process_timer_event(&mut self, _duration: Duration) -> Option<()> {
        let mut work_done = false;
        if !self.enabled {
            return None;
        }

        for stat in self.stat_queue.drain(..) {
            let stat = stat + "\r\n";
            self.io_interface
                .append_value(STAT_FILENAME, stat.as_bytes())
                .await
                .unwrap();
            work_done = true;
        }
        if work_done {
            self.io_interface.flush_data(STAT_FILENAME).await.unwrap();
            return Some(());
        }
        None
    }

    async fn process_event(&mut self, event: String) -> Option<()> {
        if !self.enabled {
            return None;
        }
        self.stat_queue.push_back(event);
        Some(())
    }

    async fn on_init(&mut self) {
        info!("initializing stat thread");
        if !self.enabled {
            info!("stat thread is off");
            return;
        }
        self.io_interface
            .write_value(STAT_FILENAME, vec![].as_slice())
            .await
            .unwrap();
        info!("stat thread is on");
    }

    async fn on_stat_interval(&mut self, _current_time: Timestamp) {}

    fn is_ready_to_process(&self) -> bool {
        true
    }
}
