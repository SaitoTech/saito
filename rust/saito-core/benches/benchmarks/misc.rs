use criterion::{criterion_group, Criterion};

use saito_core::core::util::crypto::generate_random_bytes;

fn extend() {
    let buffer = [0; 33];
    let buffer2 = [0; 32];
    let mut v = vec![];
    v.extend(buffer);
    v.extend(buffer2);
    assert!(v.len() > 0);
}

fn append() {
    let mut buffer = vec![0; 33];
    let mut buffer2 = vec![0; 32];
    let mut v = vec![];
    v.append(&mut buffer);
    v.append(&mut buffer2);
    assert!(!v.is_empty());
}

fn concat() {
    let buffer = [0; 33];
    let buffer2 = [0; 32];
    let buffer = [buffer.as_slice(), buffer2.as_slice()].concat();
    assert!(!buffer.is_empty());
}

fn join() {
    let buffer = [0; 33];
    let buf2 = [0; 32];

    let buffer = [buffer.as_slice(), buf2.as_slice()].join(&0);
    assert!(!buffer.is_empty());
}

async fn gen_random_bytes(len: u64) {
    let buf = generate_random_bytes(len).await;
    assert_eq!(buf.len(), len as usize);
}

pub fn misc(c: &mut Criterion) {
    c.bench_function("extend", |b| b.iter(|| extend()));
    c.bench_function("append", |b| b.iter(|| append()));
    c.bench_function("concat", |b| b.iter(|| concat()));
    c.bench_function("join", |b| b.iter(|| join()));
    c.bench_function("gen_random_bytes_1", |b| b.iter(|| gen_random_bytes(1)));
    c.bench_function("gen_random_bytes_10", |b| b.iter(|| gen_random_bytes(10)));
    c.bench_function("gen_random_bytes_100", |b| b.iter(|| gen_random_bytes(100)));
    c.bench_function("gen_random_bytes_1000", |b| {
        b.iter(|| gen_random_bytes(1000))
    });
    c.bench_function("gen_random_bytes_1000000", |b| {
        b.iter(|| gen_random_bytes(1000000))
    });
}

criterion_group!(misc_group, misc);
