#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

step() {
  echo -e "\n${BOLD}${YELLOW}▶ $1${NC}"
}

pass() {
  echo -e "${GREEN}  ✔ $1${NC}"
}

warn_msg() {
  echo -e "${YELLOW}  ! $1${NC}"
}

die() {
  echo -e "${RED}  ✘ $1${NC}"
  echo -e "\n${RED}${BOLD}Aborting — fix the issue above before pushing.${NC}"
  exit 1
}

# ─── 1. Dependency policy ────────────────────────────────────────────

step "Checking fixed dependency versions"
(cd "$REPO_ROOT" && node scripts/check_fixed_dependency_versions.js) || die "Dependency version policy failed"
pass "Dependency versions fixed"

# ─── 2. Format all code ──────────────────────────────────────────────

step "Formatting Rust code (cargo fmt)"
(cd "$REPO_ROOT/rust" && cargo fmt --all) || die "Rust formatting failed"
pass "Rust formatted"

step "Formatting Node code (prettier --write)"
(cd "$REPO_ROOT/node" && npx prettier --write ./lib) || die "Node formatting failed"
pass "Node formatted"

step "Formatting WASM code (prettier --write)"
(cd "$REPO_ROOT/rust/saito-wasm" && npx prettier --write .) || die "WASM formatting failed"
pass "WASM formatted"

step "Formatting Saito Js code (prettier --write)"
(cd "$REPO_ROOT/rust/saito-js" && npx prettier --write .) || die "Saito Js formatting failed"
pass "Saito Js formatted"

# ─── 3. Compile, test, and build ─────────────────────────────────────

step "Compiling Rust workspace (cargo check)"
(cd "$REPO_ROOT/rust" && cargo check --workspace) || die "Rust compilation failed"
pass "Rust compilation OK"

# ─── 4. Unit tests ───────────────────────────────────────────────────

step "Running Rust unit tests (cargo test)"
(cd "$REPO_ROOT/rust" && cargo test -- --test-threads=1) || die "Rust tests failed"
pass "Rust tests passed"

# ─── 5. Build saito-wasm ───────────────────────────────────────────

step "Building saito-wasm (npm run build)"
(cd "$REPO_ROOT/rust/saito-wasm" && npm run build) || die "WASM build failed"
pass "WASM build succeeded"

step "Building saito-js (npm run build)"
(cd "$REPO_ROOT/rust/saito-js" && npm run build) || die "Saito Js build failed"
pass "Saito Js build succeeded"

# ─── 6. Lint ──────────────────────────────────────────────────────────

step "Linting Rust code (cargo clippy)"
if (cd "$REPO_ROOT/rust" && cargo clippy --workspace); then
  pass "Clippy completed"
else
  warn_msg "Clippy reported issues; continuing because compilation, tests, and builds are the blocking gate"
fi

# step "Linting Node (eslint)"
# if (cd "$REPO_ROOT/node" && npx eslint .); then
#   pass "ESLint OK"
# else
#   warn_msg "ESLint reported issues; continuing because compilation, tests, and builds are the blocking gate"
# fi

# ─── Done ─────────────────────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}All checks passed — safe to push!${NC}"
