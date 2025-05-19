use log::debug;

use saito_core::core::process::run_task::{RunTask, RunnableTask};

pub struct RustTaskRunner {}

impl RunTask for RustTaskRunner {
    fn run(&self, task: RunnableTask) {
        let handle = tokio::runtime::Handle::current();
        handle.spawn_blocking(move || {
            debug!("new thread started");
            task();
        });
    }
}
