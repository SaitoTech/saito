#!/usr/bin/env bash
# Link local saito-wasm + saito-js into this node app (dev substitute for npm packages).
# Layout: rust workspace is a sibling of this app's parent (e.g. saito-all/rust next to saito-all/node),
# or set SAITO_RUST_ROOT to the rust workspace directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_APP="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${YELLOW}[linklocal]${NC} $*"; }
ok() { echo -e "${GREEN}[linklocal] OK:${NC} $*"; }
err() { echo -e "${RED}[linklocal] ERROR:${NC} $*" >&2; }

die() {
  err "$1"
  err "linklocal failed."
  exit 1
}

resolve_rust_dir() {
  if [[ -n "${SAITO_RUST_ROOT:-}" ]]; then
    if [[ ! -f "${SAITO_RUST_ROOT}/saito-wasm/Cargo.toml" ]]; then
      die "SAITO_RUST_ROOT=${SAITO_RUST_ROOT} does not look like the rust workspace (missing saito-wasm/Cargo.toml)."
    fi
    (cd "${SAITO_RUST_ROOT}" && pwd)
    return
  fi
  local sibling
  sibling="$(cd "${NODE_APP}/../rust" 2>/dev/null && pwd)" || true
  if [[ -n "${sibling:-}" && -f "${sibling}/saito-wasm/Cargo.toml" ]]; then
    echo "${sibling}"
    return
  fi
  local nested="${NODE_APP}/rust"
  if [[ -f "${nested}/saito-wasm/Cargo.toml" ]]; then
    (cd "${nested}" && pwd)
    return
  fi
  die "Could not find rust workspace. Clone it next to this repo (../rust from ${NODE_APP}) or set SAITO_RUST_ROOT."
}

setup_macos_llvm() {
  local os
  os="$(uname -s)"
  if [[ "${os}" != "Darwin" ]]; then
    info "Not macOS: leaving CC/AR unset (use system toolchain)."
    return 0
  fi
  local cc_path=""
  for cand in /opt/homebrew/opt/llvm/bin/clang /usr/local/opt/llvm/bin/clang; do
    if [[ -x "${cand}" ]]; then
      cc_path="${cand}"
      break
    fi
  done
  if [[ -z "${cc_path}" ]]; then
    die "macOS: Homebrew LLVM clang not found. Install: brew install llvm"
  fi
  local llvm_bin="${cc_path%/*}"
  export CC="${cc_path}"
  if [[ -x "${llvm_bin}/llvm-ar" ]]; then
    export AR="${llvm_bin}/llvm-ar"
  fi
  ok "macOS: using CC=${CC}"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found in PATH: $1"
}

main() {
  info "Node app: ${NODE_APP}"
  local RUST_DIR
  RUST_DIR="$(resolve_rust_dir)"
  ok "Rust workspace: ${RUST_DIR}"

  require_cmd cargo
  require_cmd npm

  setup_macos_llvm

  info "Running cargo build (workspace)…"
  (cd "${RUST_DIR}" && cargo build) || die "cargo build failed"

  info "Building and linking saito-wasm…"
  (
    cd "${RUST_DIR}/saito-wasm"
    npm install || die "npm install failed in saito-wasm"
    npm run build || die "npm run build failed in saito-wasm"
    npm link || die "npm link failed in saito-wasm"
  )
  ok "saito-wasm is globally linked"

  info "Building and linking saito-js…"
  (
    cd "${RUST_DIR}/saito-js"
    npm install || die "npm install failed in saito-js"
    npm link saito-wasm || die "npm link saito-wasm failed in saito-js"
    npm run build || die "npm run build failed in saito-js"
    [[ -d dist ]] || die "saito-js/dist missing after build (tsc output)."
    cp -f package.json dist/package.json || die "Could not copy package.json into saito-js/dist"
    cd dist
    npm link || die "npm link failed in saito-js/dist"
  )
  ok "saito-js is globally linked (from dist/)"

  info "Attaching linked saito-js to this app…"
  rm -rf "${NODE_APP}/node_modules/saito-js"
  (cd "${NODE_APP}" && npm link saito-js) || die "npm link saito-js failed in node app"

  ok "Local saito-js is linked into ${NODE_APP}."
  echo ""
  echo -e "${GREEN}[linklocal]${NC} ${BOLD}Success.${NC} You can build the client JavaScript from this directory with:"
  echo -e "           ${BOLD}npm run compile${NC}"
  echo ""
}

main "$@"
