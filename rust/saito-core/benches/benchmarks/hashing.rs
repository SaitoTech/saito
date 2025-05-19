use blake3::Hasher;
use criterion::{criterion_group, Criterion};

fn hash_fn_serial(buffer: &[u8]) {
    let mut hasher = Hasher::new();
    hasher.update(buffer);
    hasher.finalize();
}

fn hash_fn_parallel(buffer: &[u8]) {
    let mut hasher = Hasher::new();
    hasher.update_rayon(buffer);
    hasher.finalize();
}

pub fn hashing(c: &mut Criterion) {
    let buffer: Vec<u8> = vec![0; 10];
    c.bench_function("hashing 10Byte serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 10Byte parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 100];
    c.bench_function("hashing 100Byte serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 100Byte parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 1000];
    c.bench_function("hashing 1KB buffer serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 1KB buffer parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 10_000];
    c.bench_function("hashing 10KB buffer serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 10KB buffer parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 100_000];
    c.bench_function("hashing 100KB buffer serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 100KB buffer parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 1_000_000];
    c.bench_function("hashing 1MB buffer serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 1MB buffer parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 10_000_000];
    c.bench_function("hashing 10M serial", |b| b.iter(|| hash_fn_serial(&buffer)));
    c.bench_function("hashing 10M parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });

    let buffer: Vec<u8> = vec![0; 100_000_000];
    c.bench_function("hashing 100M serial", |b| {
        b.iter(|| hash_fn_serial(&buffer))
    });
    c.bench_function("hashing 100M parallel", |b| {
        b.iter(|| hash_fn_parallel(&buffer))
    });
}

criterion_group!(hashing_group, hashing);
