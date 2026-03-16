# Copilot Instructions for Saito

## Git — NEVER commit or push without explicit permission

- **Do NOT run `git commit`, `git push`, `git reset --hard`, `git rebase`, `git merge`, `git tag`, or any other command that modifies git history or the remote, unless the user explicitly asks you to.**
- Always show the user the diff / changed files and ask for confirmation before staging or committing anything.
- You may freely use read-only git commands (`git status`, `git log`, `git diff`, `git show`, etc.).

## Never edit installed packages

- **Do NOT edit any files inside `node_modules/`, `~/.cargo/registry/`, `~/.cargo/git/`, or any other package manager cache/store.**
- Editing installed packages does not fix issues in this codebase and will be silently overwritten on the next install.
- If a bug appears to be in a dependency, report it and find a workaround in our own code (e.g. patch, wrapper, or version pin).

## Destructive operations — always ask first

- Do not delete files, drop database tables, or run `rm -rf` without explicit user confirmation.
- Do not use `--force` or `--no-verify` flags without explaining the risk and getting approval.

## Project structure

- `node/` is the main application workspace for the Node.js stack. Most app-layer work happens here.
- `node/mods/` contains end-user modules and applications such as `arcade`, `chess`, `chat`, `redsquare`, and other feature modules.
- `node/lib/` contains shared Node-side framework code, templates, helpers, UI components, and core runtime pieces such as the web server and storage.
- `node/config/` contains build/config templates and default runtime config files.
- `node/web/` contains static web assets served by the Node.js server.

- `rust/` contains the Rust workspace for the protocol/core implementation.
- `rust/saito-rust/` is the Rust node binary.
- `rust/saito-core/` contains core consensus, routing, blockchain, and utility logic used by the Rust implementation.
- `rust/saito-wasm/` contains the WASM bridge used by the Node/browser stack.
- `rust/saito-js/` contains the JS/TS wrapper layer around the Rust/WASM pieces.

- `e2e/` contains the Playwright end-to-end harness, fixtures, temporary node bootstrapping logic, and browser/API tests.
- `docs/` and `node/docs/` contain architecture and feature documentation. Prefer updating existing docs when behavior changes.
- `scripts/` contains repository-level helper scripts.
- `data/` contains local runtime data and should generally be treated as environment/state, not source.

- If the user asks for application or UI changes, start in `node/mods/` and then trace shared behavior into `node/lib/` as needed.
- If the user asks for protocol, routing, peer, consensus, or Rust node behavior, start in `rust/saito-rust/` and `rust/saito-core/`.
- If the user asks for WASM or Node↔Rust bridge issues, inspect `rust/saito-wasm/`, `rust/saito-js/`, and the corresponding callers in `node/`.
- If the user asks about test failures, check `e2e/` first for harness issues before assuming the product code is broken.

