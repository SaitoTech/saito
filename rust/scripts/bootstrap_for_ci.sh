#!/usr/bin/env bash
set -euo pipefail

# Script to setup the basic requirements for running a saito rust node
#curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sudo apt update
sudo NEEDRESTART_MODE=a apt install -y build-essential libssl-dev pkg-config clang gcc-multilib python-is-python3
#cargo install flamegraph
# Reuse the binary installed by the workflow; retain a pinned fallback for
# callers that do not install wasm-pack separately.
if ! command -v wasm-pack >/dev/null 2>&1; then
    cargo install --locked --version 0.12.1 wasm-pack
fi
wasm-pack --version
rustup target add wasm32-unknown-unknown

# setup the saito-rust/config.json file from the template and run `cargo run`
