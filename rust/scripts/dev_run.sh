#!/usr/bin/env bash

clear;rm -rf data/blocks/*;git pull;RUST_LOG=info cargo run --release