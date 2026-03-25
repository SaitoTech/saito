# Rust Wiki

This directory contains design-oriented documentation for the Rust implementation of Saito.

## Documents

- [Consensus Design](./consensus-design.md)
- [Node Architecture](./node-architecture.md)
- [Codebase Structure](./codebase-structure.md)

## Scope

These notes focus on the Rust workspace under `rust/`:

- `saito-core` contains the shared consensus, routing, message, and utility code.
- `saito-rust` wraps `saito-core` in a native node runtime.
- `saito-wasm` reuses the same core in a browser or embedded WASM runtime.
- `saito-spammer` is an auxiliary workload generator used for testing and benchmarking.

The documents are intended as a practical map for engineers reading or modifying the Rust codebase.