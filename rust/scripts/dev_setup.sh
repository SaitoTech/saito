#!/usr/bin/env sh

# Get the directory where the script is located
SCRIPT_DIR=$(dirname "$0")

BASE_PATH="$SCRIPT_DIR/../saito-rust"

echo "$BASE_PATH"

# Setup config
CONFIG_PATH="$BASE_PATH/config/config.json"
if [ ! -f "$BASE_PATH/config/config.json" ]; then
  cp "$BASE_PATH/config/config.template.json" "$BASE_PATH/config/config.json"
  echo "./config/config.json has been created from ./config/config.template.json."
    if grep -q '"peers": \[' "$CONFIG_PATH"; then
    awk '
    BEGIN {print_mode=1}
    /"peers": \[/ {print_mode=0; print "\"peers\": []"; next}
    /]/ {if (print_mode == 0) {print_mode=1; next}}
    {if (print_mode == 1) print}
    ' "$CONFIG_PATH" > temp && mv temp "$CONFIG_PATH"
    echo "Configured as an isolated node with empty peers array."
  fi
else
  echo "config.json already exists. No changes made."
fi



# Create blocks folder
if [ ! -d "$BASE_PATH/data/blocks" ]; then
  mkdir -p "$BASE_PATH/data/blocks"
  echo "blocks folder has been created."
else
  echo "blocks folder already exists. No changes made."
fi

# Setup issuance
if [ ! -f "$BASE_PATH/data/issuance" ]; then
  cp "$BASE_PATH/data/issuance/issuance.template" "$BASE_PATH/data/issuance/issuance"
  echo "./issuance/issuance  has been created from issuance/issuance.template."
else
  echo "issuance file already exists. No changes made."
fi

# Install packages
OS="$(uname)"
case "$OS" in
  Darwin)
    echo "Running bootstrap_mac.sh for macOS"
    "$SCRIPT_DIR/bootstrap_mac.sh" || { echo "Installation aborted by user. Exiting."; exit 1; }
    ;;
  Linux)
    echo "Running bootstrap_linux.sh for Linux"
    "$SCRIPT_DIR/bootstrap_linux.sh" || { echo "Installation aborted by user. Exiting."; exit 1; }
    ;;
  *)
    echo "Unsupported operating system: $OS"
    exit 1
    ;;
esac


source "$HOME/.cargo/env" 2>/dev/null

# Installing wasm-pack
sudo apt update
sudo NEEDRESTART_MODE=a apt install -y build-essential libssl-dev pkg-config clang gcc-multilib python-is-python3
#cargo install flamegraph
cargo install --version 0.12.0 wasm-pack
rustup target add wasm32-unknown-unknown

# Start node
cd "$BASE_PATH"

OS_NAME=$(uname)

echo "OS = ${OS_NAME}"

# Script to build and link saito-wasm and saito-js packages
if [[ "$OS_NAME" = "Darwin" ]]; then
  echo "Setting clang path..."
  # check the wiki for installing clang
  # https://github.com/SaitoTech/saito-rust-workspace/blob/develop/LINK_MAC.md
  export CC=/opt/homebrew/opt/llvm/bin/clang
else
  # add for other OSes if needed
  echo "Not setting env variables"
fi

cd ..

echo "Building saito-wasm"
cd saito-wasm || (echo "cannot find saito-wasm directory" && exit -1)
npm install || (echo "failed installing npm packages" && exit -1)
npm run build || (echo "failed building saito-wasm package" && exit -1)
npm link || (echo "failed linking saito-wasm" && exit -1)
echo "saito-wasm linked successfully"
cd .. || (echo "cannot find parent directory" && exit -1)

echo "Building saito-js"
cd saito-js || (echo "cannot find saito-js directory" && exit -1)
npm install || (echo "failed installing npm packages" && exit -1)
npm link saito-wasm || (echo "failed linking saito-wasm to saito-js" && exit -1)
npm run build || (echo "failed building saito-wasm" && exit -1)
cd dist || (echo "cannot find dist folder" && exit -1)
npm link || (echo "failed linking saito-js" && exit -1)
echo "Linking finished successfully"

cd $SCRIPT_DIR