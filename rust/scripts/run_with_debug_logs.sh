#!/usr/bin/env bash

clear;rm -rf data/blocks/*;git pull;RUST_LOG=debug cargo run --release