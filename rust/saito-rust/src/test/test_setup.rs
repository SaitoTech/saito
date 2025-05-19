#[cfg(test)]
#[ctor::ctor]
fn init_tests() {
    // initialize a logger only for tests (to capture info and trace logs based on RUST_LOG)
    pretty_env_logger::init();
    std::fs::create_dir_all("data").unwrap();
}
