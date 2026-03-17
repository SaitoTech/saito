#!/usr/bin/env bash

# Script to setup the basic requirements for running a saito rust node
#curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sudo apt update
sudo NEEDRESTART_MODE=a apt install -y build-essential libssl-dev pkg-config clang gcc-multilib python-is-python3
#cargo install flamegraph
cargo install --locked --version 0.14.0 wasm-pack
cargo install --locked --version 0.2.114 wasm-bindgen-cli
rustup target add wasm32-unknown-unknown

# setup the saito-rust/config.json file from the template and run `cargo run`
