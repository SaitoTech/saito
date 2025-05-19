#!/usr/bin/env bash

clear;rm -rf data/blocks/*;git pull;RUST_LOG=info perf record --call-graph dwarf,65000 -F 999 cargo run --release