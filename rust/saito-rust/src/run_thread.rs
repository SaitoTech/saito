use std::fmt::Debug;
use std::panic;
use std::time::{Duration, Instant};

use log::debug;
use log::info;
use tokio::select;
use tokio::sync::mpsc::Receiver;
use tokio::task::JoinHandle;

use saito_core::core::io::network_event::NetworkEvent;
use saito_core::core::process::keep_time::{KeepTime, Timer};
use saito_core::core::process::process_event::ProcessEvent;

pub async fn receive_event<T>(receiver: &mut Option<Receiver<T>>) -> Option<T> {
    if let Some(receiver) = receiver.as_mut() {
        return receiver.recv().await;
    }
    // tokio::time::sleep(Duration::from_secs(1_000_000)).await;
    None
}

/// Runs a permanent thread with an event loop
///
/// This thread will have,
/// 1. an event loop which processes incoming events
/// 2. a timer functionality which fires for each iteration of the event loop
///
/// If any work is done in the event loop, it will immediately begin the next iteration after this one.
/// If no work is done in the current iteration, it will go to sleep **thread_sleep_time_in_ms** amount of time
///
/// # Arguments
///
/// * `event_processor`:
/// * `network_event_receiver`:
/// * `event_receiver`:
/// * `stat_timer_in_ms`:
/// * `thread_sleep_time_in_ms`:
///
/// returns: JoinHandle<()>
///
/// # Examples
///
/// ```
///
/// ```
pub async fn run_thread<T>(
    mut event_processor: Box<(dyn ProcessEvent<T> + Send + 'static)>,
    mut network_event_receiver: Option<Receiver<NetworkEvent>>,
    mut event_receiver: Option<Receiver<T>>,
    stat_timer_in_ms: u64,
    thread_name: &str,
    thread_sleep_time_in_ms: u64,
    time_keeper_origin: &Timer,
) -> JoinHandle<()>
where
    T: Send + Debug + 'static,
{
    let time_keeper = time_keeper_origin.clone();
    let t_name = thread_name.to_string();
    tokio::task::Builder::new()
        .name(thread_name)
        .spawn(async move {
            info!("new thread started");
            // let mut work_done;
            let mut last_stat_time = Instant::now();
            let time_keeper = time_keeper.clone();

            event_processor.on_init().await;
            let mut interval =
                tokio::time::interval(Duration::from_millis(thread_sleep_time_in_ms));
            let mut stat_interval = tokio::time::interval(Duration::from_millis(stat_timer_in_ms));

            loop {
                let ready = event_processor.is_ready_to_process();
                if !ready{
                    debug!("event processor : {:?} not ready. channels are filled",t_name);
                }
                select! {
                        result = receive_event(&mut event_receiver), if event_receiver.is_some() && ready=>{
                            if result.is_some() {
                                let event = result.unwrap();
                                event_processor.process_event(event).await;
                            }
                        }
                        result = receive_event(&mut network_event_receiver), if network_event_receiver.is_some() && ready=>{
                            if result.is_some() {
                                let event: NetworkEvent = result.unwrap();
                                event_processor.process_network_event(event).await;
                            }
                        }
                        _ = interval.tick()=>{
                                event_processor
                                   .process_timer_event(interval.period())
                                   .await;
                        }
                        _ = stat_interval.tick()=>{
                            {
                                let current_instant = Instant::now();

                                let duration = current_instant.duration_since(last_stat_time);
                                if duration > Duration::from_millis(stat_timer_in_ms) {
                                    last_stat_time = current_instant;
                                    event_processor
                                        .on_stat_interval(time_keeper.get_timestamp_in_ms())
                                        .await;
                                }
                            }
                        }
                    }
            }
        })
        .unwrap()
}
