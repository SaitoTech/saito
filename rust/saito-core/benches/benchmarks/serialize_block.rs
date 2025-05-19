use criterion::{black_box, criterion_group, Criterion};
use saito_core::core::consensus::{
    block::{Block, BlockType},
    slip::Slip,
    transaction::Transaction,
};

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

fn generate_block(block_size: u64, buffer_size: u64) -> Block {
    let mut block = Block::new();
    let count = block_size / buffer_size;
    for _ in 0..count {
        let tx = generate_tx(1, 1, buffer_size);
        block.add_transaction(tx);
    }
    block
}

pub fn serialize_block(c: &mut Criterion) {
    let block = generate_block(1_000_000, 1_000);
    c.bench_function("serializing 1MB block with 1KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 1MB block with 1KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(1_000_000, 10_000);
    c.bench_function("serializing 1MB block with 10KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 1MB block with 10KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(1_000_000, 100_000);
    c.bench_function("serializing 1MB block with 100KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 1MB block with 100KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(10_000_000, 1_000);
    c.bench_function("serializing 10MB block with 1KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 10MB block with 1KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(10_000_000, 10_000);
    c.bench_function("serializing 10MB block with 10KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 10MB block with 10KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(10_000_000, 100_000);
    c.bench_function("serializing 10MB block with 100KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 10MB block with 100KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(10_000_000, 1_000_000);
    c.bench_function("serializing 10MB block with 1MB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 10MB block with 1MB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(1_000_000, 10_000_000);
    c.bench_function("serializing 10MB block with 10MB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 10MB block with 10MB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(100_000_000, 1_000);
    c.bench_function("serializing 100MB block with 1KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 100MB block with 1KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(100_000_000, 10_000);
    c.bench_function("serializing 100MB block with 10KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 100MB block with 10KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(100_000_000, 100_000);
    c.bench_function("serializing 100MB block with 100KB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 100MB block with 100KB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(100_000_000, 1_000_000);
    c.bench_function("serializing 100MB block with 1MB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 100MB block with 1MB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(100_000_000, 10_000_000);
    c.bench_function("serializing 100MB block with 10MB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 100MB block with 10MB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    let block = generate_block(100_000_000, 100_000_000);
    c.bench_function("serializing 100MB block with 100MB transaction", |b| {
        b.iter(|| {
            black_box(block.serialize_for_net(BlockType::Full));
        });
    });
    let buffer = block.serialize_for_net(BlockType::Full);
    c.bench_function("deserializing 100MB block with 100MB transaction", |b| {
        b.iter(|| {
            black_box(Block::deserialize_from_net(&buffer));
        });
    });
    // let block = generate_block(1_000_000_000, 1_000);
    // c.bench_function("serializing 1GB block with 1KB transaction", |b| {
    //     b.iter(|| {
    //         black_box(block.serialize_for_net(BlockType::Full));
    //     });
    // });
    // let buffer = block.serialize_for_net(BlockType::Full);
    // c.bench_function("deserializing 1GB block with 1KB transaction", |b| {
    //     b.iter(|| {
    //         black_box(Block::deserialize_from_net(&buffer));
    //     });
    // });
    // let block = generate_block(1_000_000_000, 10_000);
    // c.bench_function("serializing 1GB block with 10KB transaction", |b| {
    //     b.iter(|| {
    //         black_box(block.serialize_for_net(BlockType::Full));
    //     });
    // });
    // let buffer = block.serialize_for_net(BlockType::Full);
    // c.bench_function("deserializing 1GB block with 10KB transaction", |b| {
    //     b.iter(|| {
    //         black_box(Block::deserialize_from_net(&buffer));
    //     });
    // });
    // let block = generate_block(1_000_000_000, 100_000);
    // c.bench_function("serializing 1GB block with 100KB transaction", |b| {
    //     b.iter(|| {
    //         black_box(block.serialize_for_net(BlockType::Full));
    //     });
    // });
    // let buffer = block.serialize_for_net(BlockType::Full);
    // c.bench_function("deserializing 1GB block with 100KB transaction", |b| {
    //     b.iter(|| {
    //         black_box(Block::deserialize_from_net(&buffer));
    //     });
    // });
    // let block = generate_block(1_000_000_000, 1_000_000);
    // c.bench_function("serializing 1GB block with 1MB transaction", |b| {
    //     b.iter(|| {
    //         black_box(block.serialize_for_net(BlockType::Full));
    //     });
    // });
    // let buffer = block.serialize_for_net(BlockType::Full);
    // c.bench_function("deserializing 1GB block with 1MB transaction", |b| {
    //     b.iter(|| {
    //         black_box(Block::deserialize_from_net(&buffer));
    //     });
    // });
    // let block = generate_block(1_000_000_000, 10_000_000);
    // c.bench_function("serializing 1GB block with 10MB transaction", |b| {
    //     b.iter(|| {
    //         black_box(block.serialize_for_net(BlockType::Full));
    //     });
    // });
    // let buffer = block.serialize_for_net(BlockType::Full);
    // c.bench_function("deserializing 1GB block with 10MB transaction", |b| {
    //     b.iter(|| {
    //         black_box(Block::deserialize_from_net(&buffer));
    //     });
    // });
    // let block = generate_block(1_000_000_000, 100_000_000);
    // c.bench_function("serializing 1GB block with 100MB transaction", |b| {
    //     b.iter(|| {
    //         black_box(block.serialize_for_net(BlockType::Full));
    //     });
    // });
    // let buffer = block.serialize_for_net(BlockType::Full);
    // c.bench_function("deserializing 1GB block with 100MB transaction", |b| {
    //     b.iter(|| {
    //         black_box(Block::deserialize_from_net(&buffer));
    //     });
    // });
}
criterion_group!(serializing_block_group, serialize_block);
