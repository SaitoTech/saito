use std::pin::Pin;

pub type RunnableTask = Pin<Box<dyn Fn() + Send + 'static>>;

/// Runs a given task to completion in a platform agnostic way. In multithreaded environments can be run concurrently and in single threaded
/// environments will run on the same thread.
pub trait RunTask {
    // fn run(&self, task: Pin<Box<dyn Future<Output = ()> + Send + 'static>>);
    fn run(&self, task: RunnableTask);
}
