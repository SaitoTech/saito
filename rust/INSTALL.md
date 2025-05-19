# saito-rust-workspace
<todo: introduction>

# Node Setup and Installation

## Required Software:

1. cargo / rust [download](https://www.rust-lang.org/tools/install)
2. wasm-pack [download](https://rustwasm.github.io/wasm-pack/installer/)

You will need standard build-tools to compile and install the above software packages. These 
are bundled with X-Code in Mac and are included with most Linux distributions. On Ubuntu you
can install them as follows:

```
   On ubuntu: sudo apt-get update && sudo apt install build-essential pkg-config libssl-dev
```

## Download Saito

git clone git@github.com:SaitoTech/saito-rust-workspace.git

> Use https for deployment.

## Install Saito

1. Navigate into the directory: `cd saito-rust-workspace/`
2. Run `cp config/saito.config.template.json config/saito.config.json` and do the necessary changes in saito.config.json.
3. run `RUST_LOG=debug cargo run`

#### Environment Variables

- RUST_LOG - `error,warn,info,debug,trace` Log level of the node
- GEN_TX - If this is "1" will generate test transactions within the node

## Compiling WASM code

1. Go to saito-wasm directory
2. Execute `wasm-pack build --debug --target browser`


