# Saito Codex Instructions

Use this file as the combined project and Codex runtime guide. Keep context small: read only what is needed, make narrow changes, and verify concretely.

## Shell

- RTK is optional. If `rtk` is available and useful for reducing command output, you may prefix shell commands with it.
- Examples: `git status` or `rtk git status`, `cargo test` or `rtk cargo test`, `npm run build` or `rtk npm run build`.
- Useful optional RTK meta commands: `rtk gain`, `rtk gain --history`, `rtk proxy <cmd>`.
- If `rg` is unavailable in the environment, use `find` and `grep` without installing unrelated tooling.

## Core Rules

- State key assumptions before non-trivial work; ask when intent, design, or risk is unclear.
- Implement the minimum code that solves the request. No speculative features, abstractions, or broad cleanup.
- Touch only files required by the task. Match local style even when a different style seems preferable.
- Every changed line should trace to the user's request.
- Define success with a concrete check, then verify it before claiming completion.

## Code Comments

- Add comments where they materially improve maintainability: non-obvious invariants, protocol or consensus reasoning, security assumptions, scale limits, ordering/idempotency requirements, tricky edge cases, or intent that is hard to recover from the code alone.
- Prefer precise, local comments near the relevant code. Use Rust doc comments for public APIs and durable contracts when they help future callers.
- Do not add comments that restate obvious code, narrate simple assignments, or compensate for confusing names or structure that can be clarified directly.
- When changing behavior, update nearby stale comments in the same scope so comments remain trustworthy.

## Rust Locking

- When adding, changing, or debugging lock-related Rust code, follow the `LOCK_ORDER_*` constants in `saito-core/src/core/defs.rs` whenever multiple locks may be acquired.
- Current lock order constants include network controller, sockets, configs, blockchain, mempool, peers, and wallet. Acquire multiple locks in ascending `LOCK_ORDER_*` order.
- Avoid holding locks across awaits, callbacks, channel sends, network I/O, disk I/O, or other work that can re-enter locked paths unless the existing pattern proves it is safe.
- When introducing a new shared lock that may be acquired with existing locks, add a matching `LOCK_ORDER_*` constant and document its relative position so future maintenance does not create deadlocks.
- If a deadlock or lock contention bug is suspected, inspect every multi-lock call path before changing timing, sleeps, retries, or channel behavior.

## Local Node Operations

- Local runtime configuration lives under `saito-rust/config/`; templates include `config.template.json` and `blockchain.config.template.json`.
- Local data lives under `saito-rust/data/`; generated block data should not be committed.
- Use existing scripts in `scripts/` for setup, build/link, version, and local run workflows when they match the task.
- Do not stop, clean, or recreate local node data unless the task explicitly requires it or the user approves the destructive step.

## Safety

- Do not run `git commit`, `git push`, `git reset --hard`, `git rebase`, `git merge`, `git tag`, or remote/history-changing commands unless explicitly asked.
- Show the diff and ask before staging or committing. Read-only git commands are fine.
- Do not delete files, use `--force`, use `--no-verify`, or run destructive commands without explicit approval.
- Do not edit `node_modules/`, `target/`, `saito-wasm/pkg/`, package-manager caches, `~/.cargo/registry/`, or `~/.cargo/git/`.
- Treat generated local configuration, local blockchain data, and build artifacts as environment state unless the task explicitly targets them.

## Project Map

- Rust workspace: repo root; workspace members are `saito-core`, `saito-wasm`, `saito-rust`, and `saito-spammer`.
- `saito-core/`: shared protocol and runtime logic for Saito consensus, blocks, transactions, mempool, blockchain state, networking abstractions, storage abstractions, and test utilities.
- `saito-rust/`: native node runtime; wires `saito-core` to Tokio, websocket networking, HTTP block fetches, disk-backed storage, config loading, logging, and process lifecycle.
- `saito-wasm/`: WASM bindings around `saito-core` for JavaScript/browser and Node.js embedding.
- `saito-js/`: TypeScript/JavaScript wrapper package around the WASM build.
- `saito-spammer/`: traffic/load generator that depends on `saito-core` and `saito-rust`.
- `saito-e2e/`: Playwright end-to-end tests.
- `scripts/`: workspace setup, bootstrap, build/link, logging run scripts, version update, and CI bootstrap helpers.
- `wiki/`: internal architecture and design notes, including `codebase-structure.md`, `consensus-design.md`, and `node-architecture.md`.

## Important Code Areas

- Core consensus: `saito-core/src/core/consensus/`
- Chain state and reorg handling: `saito-core/src/core/consensus/blockchain.rs`
- Mempool and bundling rules: `saito-core/src/core/consensus/mempool.rs`
- Transaction, slip, wallet, burn fee, golden ticket, and merkle logic: `saito-core/src/core/consensus/`
- Shared event loop contracts: `saito-core/src/core/process/`
- Network messages and peer state: `saito-core/src/core/network/`
- Core orchestration threads: `saito-core/src/core/consensus_thread.rs`, `routing_thread.rs`, `verification_thread.rs`, and `mining_thread.rs`
- Native runtime entrypoint: `saito-rust/src/main.rs`
- Native network controller: `saito-rust/src/network_controller.rs`
- Native I/O bridge: `saito-rust/src/rust_io_handler.rs`
- Runtime loop helper: `saito-rust/src/run_thread.rs`
- WASM wrapper: `saito-wasm/src/saitowasm.rs`
- Browser-compatible I/O bridge: `saito-wasm/src/wasm_io_handler.rs`

## Commands

- Full Rust tests: `cargo test --workspace -- --test-threads=1`.
- Targeted Rust test: `cargo test <test_name> -- --test-threads=1`.
- Rust formatting check: `cargo fmt --all -- --check`.
- Rust lint check: `cargo clippy --workspace --all-targets`.
- Native node run: `cd saito-rust && cargo run`.
- Debug node run: `./scripts/run_with_debug_logs.sh`.
- Trace node run: `./scripts/run_with_trace_logs.sh`.
- WASM build: `cd saito-wasm && npm run build`.
- WASM web build only: `cd saito-wasm && npm run build-web`.
- WASM tests: `cd saito-wasm && npm test`.
- JS wrapper build: `cd saito-js && npm run build`.
- JS wrapper tests: `cd saito-js && npm test`.
- E2E tests: `cd saito-e2e && npm test`.
- E2E targeted: `cd saito-e2e && npx playwright test <path-or-grep> --reporter=line`.
- Build and link local npm packages: `./scripts/build_link_npms.sh`.
- Linux bootstrap: `./scripts/bootstrap_linux.sh`.
- macOS bootstrap: `./scripts/bootstrap_mac.sh`.

## Workflow

- Bug fixes: find the real root cause, add or identify the narrowest failing test first, fix minimally, rerun the target test, then run the appropriate broader gate.
- Development/refactors: read the task and nearby code, make the smallest compatible change, add tests proportional to risk, and update directly affected docs only.
- E2E failures: isolate with Rust unit tests, WASM tests, JS wrapper tests, or narrower Playwright specs when possible; avoid blocking reporter modes.
- For task documents or wiki pages, update progress/status only for the task being implemented.
- For generated WASM or JS package output, prefer source changes and rebuilds over manual edits to generated artifacts.

## Engineering Checks

- For consensus, routing, storage, networking, or distributed-state changes, make source of truth, consistency, retry/idempotency, ordering, and schema/contract evolution explicit.
- For production paths, require bounded work, intentional timeouts/retries, observable failures, and no unbounded queues or hidden resource growth.
- For refactors, preserve observable behavior; characterize current behavior first when tests are weak or behavior is unclear.
- For WASM and JS wrapper changes, verify that native Rust behavior and exported binding behavior remain aligned.
- For storage or configuration changes, consider migration, defaults, local templates, and compatibility with existing node data.

## Saito Design Rule

Saito targets long-lived decentralized operation. For protocol, consensus, routing, storage, wallet, issuance, network, or core architecture changes, check whether the design still works as the network grows and remains live over long time horizons. Flag linear unbounded state, full-dataset requirements, missing pruning, short retention without archival/audit paths, schema or version choices without migrations, cryptography without rotation/upgrade paths, economic assumptions that fail over time, operator workflows that require permanent central coordination, or assumptions that need sharding, delegation, summaries, or layer-specific handling.
