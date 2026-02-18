#!/bin/bash
# Builds a single dynamic module: webpack bundle + base64 into dyn_mod.js.
# Expects: entry point path (e.g. arcade/arcade.js) and extracted module tree in config/tmp_mod/.
# Safe to run from any directory: project root is resolved from this script's location.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

node "${PROJECT_DIR}/config/build/webpack.config.dynmod.cjs" --entrypoint="$1"
base64 -i "${PROJECT_DIR}/dist/dyn/web/dyn.module.js" > "${PROJECT_DIR}/dist/dyn/web/base.txt"
printf "$(cat "${PROJECT_DIR}/dist/dyn/web/base.txt")" >> "${PROJECT_DIR}/dist/dyn_mod.js"
