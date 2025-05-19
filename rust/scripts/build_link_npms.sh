#!/usr/bin/env bash

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

