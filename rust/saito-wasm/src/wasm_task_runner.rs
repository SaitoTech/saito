use std::pin::Pin;

use saito_core::core::process::run_task::RunTask;

pub struct WasmTaskRunner {}

impl RunTask for WasmTaskRunner {
    fn run(&self, task: Pin<Box<dyn Fn() -> () + Send + 'static>>) {
        println!("WasmTaskRunner.run");
        task();
    }
}
