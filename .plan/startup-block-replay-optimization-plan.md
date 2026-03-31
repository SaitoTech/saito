# Startup Block Replay Optimization Plan

## Goal

Reduce time to fully replay the blockchain and become consensus-ready on startup for both:

- the native Rust node in `rust/`
- the Node-hosted wasm node in `node/`

The main finding is that both startup paths share the same expensive core replay work in Rust, so the highest-value optimizations should target the Rust consensus and storage path first rather than the Node host process.

## Current State

- `ConsensusThread::on_init()` in `rust/saito-core/src/core/consensus_thread.rs` loads the block filename list, drains it in batches of 10,000, loads blocks from disk into the mempool, and then integrates them into the blockchain.
- `Storage::load_block_name_list()` in `rust/saito-core/src/core/routing/io/storage.rs` sorts the filename list before replay.
- `RustIOHandler::load_block_file_list()` in `rust/saito-rust/src/rust_io_handler.rs` also sorts the block files, but by repeatedly calling `fs::metadata(...).modified()` during sort.
- `Storage::load_blocks_from_disk()` in `rust/saito-core/src/core/routing/io/storage.rs` performs a strict serial loop of:
  - read block file
  - deserialize block
  - call `block.generate()`
  - enqueue block in mempool
- `Blockchain::add_blocks_from_mempool()` in `rust/saito-core/src/core/consensus/blockchain.rs` drains the queue, sorts the blocks, and adds them one-by-one through normal chain integration.
- During replay, the blockchain path still performs normal runtime side effects such as interface events, router notifications, pruning, and wallet persistence behavior.
- The Node startup path mainly hosts file I/O, websocket, and module bootstrap behavior; the expensive historical replay work still happens in Rust/wasm.

## Main Findings

### 1. Startup cost is primarily in shared Rust replay

The Node-hosted wasm node does not have an independent high-cost block reconstruction path. Its startup cost is dominated by the same Rust replay logic used by the native Rust node.

Implication:

- Optimizing the Rust replay path improves both runtimes.

### 2. There is avoidable work before replay even begins

The native Rust startup path sorts block filenames twice:

- once in `rust/saito-rust/src/rust_io_handler.rs` using metadata-heavy ordering
- again in `rust/saito-core/src/core/routing/io/storage.rs` using `list.sort()`

Implication:

- the metadata-heavy sort is likely wasted work unless chronological ordering is required and the later lexical sort is wrong
- this is a cheap early win compared with deeper replay changes

### 3. Block loading is still fully serial

`Storage::load_blocks_from_disk()` currently does disk read, decode, generation, and mempool insertion one file at a time.

Implication:

- startup pays full serialized I/O plus CPU cost across thousands of blocks
- bounded parallelism is a realistic second-stage optimization once determinism requirements are explicit

### 4. Historical replay still pays live-runtime side effects

After each successful add, the blockchain path can still:

- emit interface events
- notify the router
- propagate blocks
- prune blocks

At the end of each replay batch it also saves wallet state.

Implication:

- startup is doing work needed for live operation, not just state reconstruction
- a startup-only replay mode should remove or defer this work

### 5. Persisted summary state exists, but executable state is still rebuilt from raw blocks

The code persists summary blockchain data such as `last_block_id`, `last_block_hash`, and `fork_id`, but startup still reconstructs executable chain state by replaying the block corpus.

Implication:

- if replay optimization is still insufficient after phase one, the next step should be snapshot or warm-start state, not more micro-optimizing around the edges

## Recommended Approach

### 1. Add startup phase timing first

Instrument startup so replay time is broken down into:

- block file discovery and ordering
- block read, deserialize, and generate
- blockchain integration and finalization

Target files:

- `rust/saito-core/src/core/consensus_thread.rs`
- `rust/saito-core/src/core/routing/io/storage.rs`
- `rust/saito-core/src/core/consensus/blockchain.rs`

Why:

- current logging shows coarse progress but not which phase is actually dominant on real datasets

### 2. Remove redundant sorting and metadata-heavy filename ordering

Pick one canonical ordering source for startup block replay.

Recommended direction:

- keep a single sort in `Storage::load_block_name_list()`
- remove the metadata sort from `RustIOHandler::load_block_file_list()` unless there is a proven replay requirement that depends on mtime ordering

Why:

- it is lower risk than deeper replay changes and should immediately cut unnecessary filesystem work

### 3. Add a startup replay mode to suppress nonessential side effects

Thread a `startup_replay` or similar flag through the historical load path so replay can intentionally skip or defer work that is only required during live operation.

First candidates:

- interface events in `handle_successful_block_addition(...)`
- router blockchain-updated notifications during initial replay
- outbound block propagation
- other live-only notification paths triggered during historical load

Why:

- speeding up unnecessary work is worse than not doing it at all

### 4. Defer pruning during startup replay

`prune_blocks_after_add_block()` is currently called in the hot path after successful block addition.

Recommended direction:

- disable per-block pruning during startup replay
- run pruning once after replay completes, or at coarse batch boundaries with explicit memory limits

Why:

- the code already contains a TODO noting that startup pruning is problematic
- pruning is not required to reconstruct correctness during every step of historical replay

### 5. Reduce wallet overhead during replay

Audit whether every startup mode truly needs full wallet update and persistence behavior.

Recommended direction:

- if some deployments are routing-only or do not need wallet reconstruction, add an explicit config gate to skip it
- if wallet reconstruction is required, persist once after startup rather than after each replay batch

Why:

- wallet work and repeated save behavior add startup latency without improving replay determinism

### 6. Optimize the serial block loading pipeline

After phase timing and side-effect cleanup, improve `Storage::load_blocks_from_disk()`.

Recommended direction:

- split read, decode, and generate into explicitly measured stages
- evaluate bounded parallel read/decode/generate for startup batches only
- restore deterministic order before blockchain integration

Why:

- this is likely the largest remaining pure throughput opportunity after wasted side effects are removed

### 7. Tune replay batch size only after the above

The current batch size is 10,000 files.

Recommended direction:

- do not tune batch size until sorting, side effects, and block-load throughput are measured

Why:

- batch-size changes without phase timing are guesswork and can hide the real bottleneck

### 8. Add a repeatable startup benchmark

Create a repeatable benchmark run against a fixed block corpus and record:

- total startup replay time
- per-phase timings
- peak memory if possible

Run it for both:

- native Rust startup
- Node/wasm startup

Why:

- both paths should improve together if the shared replay path is the actual bottleneck

### 9. Treat snapshots as phase two if replay is still too slow

If phase-one replay optimizations are not enough, move to a warm-start snapshot design.

Recommended direction:

- persist enough state to resume chain execution from a recent durable point
- replay only the tail blocks after that checkpoint or snapshot

Why:

- rebuilding executable state from thousands of raw blocks on every boot has a hard scalability limit

## Suggested File Targets

- `rust/saito-core/src/core/consensus_thread.rs`
  - startup orchestration and replay batching in `on_init()`
- `rust/saito-core/src/core/routing/io/storage.rs`
  - filename loading and the serial `load_blocks_from_disk()` path
- `rust/saito-rust/src/rust_io_handler.rs`
  - current metadata-heavy block filename sort
- `rust/saito-core/src/core/consensus/blockchain.rs`
  - `add_blocks_from_mempool()`, side effects, wallet save behavior, and pruning
- `rust/saito-core/src/core/routing_thread.rs`
  - blockchain summary persistence that defines the current startup state boundary
- `node/lib/saito/core/server.ts`
  - confirm Node host responsibilities, though not the main replay bottleneck

## Verification Plan

### Correctness verification

- confirm final chain tip, fork id, and last block hash match baseline after each optimization
- verify startup on the same block corpus is deterministic across repeated runs
- verify Node/wasm startup and native Rust startup converge to the same final chain state

### Performance verification

- capture baseline startup and per-phase timings before changes
- measure timing after removing redundant sorting
- measure timing after startup-only side-effect suppression
- measure timing after pruning deferral and wallet persistence changes
- measure timing after any bounded-parallel block-load changes

### Safety verification

- verify peers still connect and sync correctly after startup completes
- verify no required live events were silently lost by startup replay suppression
- verify memory use remains acceptable if pruning is deferred

## Recommendation

Do the work in this order:

1. add startup phase timing
2. remove redundant sorting
3. add startup replay mode and suppress live-only side effects
4. defer pruning and reduce wallet save frequency
5. optimize block read, decode, and generate throughput
6. only then revisit batch size
7. if still too slow, move to snapshots or warm-start state

That order fixes waste before adding complexity and keeps the first optimization pass focused on changes that should benefit both runtimes immediately.