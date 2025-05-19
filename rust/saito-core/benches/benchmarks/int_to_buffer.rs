use criterion::{black_box, criterion_group, Criterion};

use byteorder::{BigEndian, ByteOrder};

fn u64_std_test() {
    black_box(for _i in 0..100000 {
        let number: u64 = 10000;
        let buffer = number.to_be_bytes();
        assert_eq!(buffer.len(), 8);
        let number = u64::from_be_bytes(buffer);
        assert_eq!(number, 10000);
    })
}

fn u64_byteorder_test() {
    for _i in 0..100 {
        let number: u64 = 10000;
        let mut buf = [0; 8];
        BigEndian::write_u64(&mut buf, number);
        assert_eq!(buf.len(), 8);
        let number = BigEndian::read_u64(&buf);
        assert_eq!(number, 10000);
    }
}

pub fn int_to_buffer(c: &mut Criterion) {
    c.bench_function("u64_std_test", |b| b.iter(|| black_box(u64_std_test())));
    // c.bench_function("u64_byteorder_test", |b| b.iter(|| u64_byteorder_test()));
}

criterion_group!(int_to_buffer_group, int_to_buffer);
