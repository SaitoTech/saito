use criterion::criterion_main;

mod benchmarks;

criterion_main! {
    benchmarks::hashing::hashing_group,
    benchmarks::serialize_tx::serializing_tx_group,
    benchmarks::serialize_block::serializing_block_group,
    benchmarks::misc::misc_group,
    benchmarks::tx_sign::tx_sign_group,
    benchmarks::int_to_buffer::int_to_buffer_group,
}
