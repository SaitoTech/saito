#!/usr/bin/env bash

clear;rm -rf data/blocks/*;git pull;RUST_LOG=trace cargo run --release