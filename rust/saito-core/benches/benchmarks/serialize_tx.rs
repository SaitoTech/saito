use criterion::{black_box, criterion_group, Criterion};
use saito_core::core::consensus::{slip::Slip, transaction::Transaction};

fn generate_tx(input_slip_count: u64, output_slip_count: u64, buffer_size: u64) -> Transaction {
    let mut tx = Transaction::default();

    for _ in 0..input_slip_count {
        let slip = Slip::default();
        tx.from.push(slip);
    }

    for _ in 0..output_slip_count {
        let slip = Slip::default();
        tx.to.push(slip);
    }

    tx.data = vec![1; buffer_size as usize];
    tx
}

pub fn serialize_tx(c: &mut Criterion) {
    let tx = generate_tx(0, 0, 0);
    c.bench_function("serializing tx with 0 slips and empty buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });

    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and empty buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });

    let tx = generate_tx(0, 0, 1_000);

    c.bench_function("serializing tx with 0 slips and 1KB buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and 1KB buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(0, 0, 10_000);

    c.bench_function("serializing tx with 0 slips and 10KB buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and 10KB buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(0, 0, 100_000);

    c.bench_function("serializing tx with 0 slips and 100KB buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and 100KB buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(0, 0, 1_000_000);
    c.bench_function("serializing tx with 0 slips and 1MB buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and 1MB buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(0, 0, 10_000_000);
    c.bench_function("serializing tx with 0 slips and 10MB buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and 10MB buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(0, 0, 100_000_000);
    c.bench_function("serializing tx with 0 slips and 100MB buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 0 slips and 100MB buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(1, 1, 0);
    c.bench_function("serializing tx with 1 slip each and empty buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 1 slips and empty buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(10, 10, 0);
    c.bench_function("serializing tx with 10 slips each and empty buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 10 slips and empty buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
    let tx = generate_tx(100, 100, 0);
    c.bench_function("serializing tx with 100 slips each and empty buffer", |b| {
        b.iter(|| {
            black_box(tx.serialize_for_net());
        });
    });
    let buffer = tx.serialize_for_net();
    c.bench_function("deserializing tx with 100 slips and empty buffer", |b| {
        b.iter(|| {
            black_box(Transaction::deserialize_from_net(&buffer));
        });
    });
}
criterion_group!(serializing_tx_group, serialize_tx);
