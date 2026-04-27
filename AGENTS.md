# Saito Codex Instructions

Use this file as the combined project and Codex runtime guide. Keep context small: read only what is needed, make narrow changes, and verify concretely.

## Shell

- Prefix shell commands with `rtk`.
- If `rtk` is not available, use the direct command without the prefix.
- Examples: `rtk git status`, `rtk cargo test`, `rtk npm run build`, `rtk npx playwright test --reporter=line`.
- Useful meta commands: `rtk gain`, `rtk gain --history`, `rtk proxy <cmd>`.

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

## Rust Concurrency

- When adding, changing, or debugging lock-related Rust code, inspect the relevant `saito-core` call paths before changing timing, sleeps, retries, or channel behavior.
- Avoid holding locks across awaits, callbacks, channel sends, or other work that can re-enter consensus, routing, verification, mining, storage, or networking paths unless the existing pattern proves it is safe.
- If introducing a new shared lock that may be acquired with existing locks, document the intended ordering near the lock definition or shared utility so future maintenance does not create deadlocks.
- For suspected deadlocks or lock contention, trace every multi-lock path first and prefer a minimal ordering or lifetime fix over broad scheduling changes.

## Local Network Operations

- Prefer targeted node, module, or scenario commands over stopping and rebuilding the whole local environment.
- Use `rtk npm run dev`, `rtk npm run dev-server`, `rtk npm run nettest`, and `rtk npm run nukelocal` from `node/` only when the task calls for local node behavior.
- Do not reset local data, run `nuke`, or remove generated blockchain/module state unless the task explicitly requires it or the user approves.

## Safety

- Do not run `git commit`, `git push`, `git reset --hard`, `git rebase`, `git merge`, `git tag`, or remote/history-changing commands unless explicitly asked.
- Show the diff and ask before staging or committing. Read-only git commands are fine.
- Do not delete files, use `--force`, use `--no-verify`, or run destructive commands without explicit approval.
- Do not edit `node_modules/`, `~/.cargo/registry/`, `~/.cargo/git/`, generated package-manager caches, or vendored third-party browser libraries under `node/web/saito/lib/` unless the task is specifically about those assets.
- Treat generated WASM/package output under `rust/saito-wasm/pkg/` carefully; update it only when the request requires regenerated bindings.

## Project Map

- Repository root: coordination files, GitHub workflows, hooks, and this guide.
- Rust workspace: `rust/`; members are `saito-core`, `saito-rust`, `saito-spammer`, and `saito-wasm`.
- Rust consensus/core: `rust/saito-core/src/core/`, including consensus, networking, storage, routing, verification, mining, and utilities.
- Rust node binary: `rust/saito-rust/`.
- Rust spammer/load tooling: `rust/saito-spammer/`.
- WASM bindings: `rust/saito-wasm/`, with generated web/node packages in `rust/saito-wasm/pkg/`.
- TypeScript wrapper package: `rust/saito-js/`.
- Node application and modules: `node/`; modules live in `node/mods/`, core libraries in `node/lib/`, config in `node/config/`, browser assets in `node/web/`, scripts in `node/scripts/`.
- Node documentation: `node/docs/`.
- Rust documentation/wiki: `rust/wiki/`.
- E2E tests: `rust/saito-e2e/` with Playwright tests under `rust/saito-e2e/tests/`.
- Node network scenarios: `node/scripts/nettest/scenarios/`.
- Rust test utilities: `rust/saito-core/src/core/util/test/`.

## Commands

- Rust format check: `rtk cargo fmt --check --verbose` from `rust/`.
- Rust build: `rtk cargo build --verbose` from `rust/`.
- Rust tests: `rtk cargo test --verbose` from `rust/`.
- Targeted Rust test: `rtk cargo test <test_name>` from `rust/`.
- WASM dev build: `rtk npm run build` from `rust/saito-wasm/`.
- WASM production build: `rtk npm run build-prod` from `rust/saito-wasm/`.
- Saito JS wrapper build: `rtk npm run build` from `rust/saito-js/`.
- Saito JS wrapper tests: `rtk npm test` from `rust/saito-js/`.
- Node app compile/reset: `rtk npm run reset` from `node/`.
- Node app tests: `rtk npm test` from `node/`.
- Node prettier check used by CI: `rtk npx prettier --check ./lib` from `node/`.
- Node ESLint: `rtk npx eslint . --config .eslintrc.js` from `node/`.
- Node local dev: `rtk npm run dev` or `rtk npm run dev-server` from `node/`.
- Node network tests: `rtk npm run nettest` from `node/`.
- E2E tests: `rtk npx playwright test --reporter=line` from `rust/saito-e2e/`.
- Targeted E2E: `rtk npx playwright test tests/<path>.spec.ts --reporter=line` from `rust/saito-e2e/`.

## Workflow

- Bug fixes: find the real root cause, add or identify the narrowest failing test first, fix minimally, rerun the target test, then run the appropriate broader gate.
- Development/refactors: read the task and nearby code, make the smallest compatible change, add tests proportional to risk, and update directly affected docs only.
- Consensus, routing, storage, networking, wallet, block, transaction, mempool, and WASM binding changes require extra care because Rust and browser/node clients share behavior.
- JS module work should stay within the affected module or library surface. Avoid recompiling or rewriting unrelated generated browser bundles unless verification requires it.
- E2E failures: isolate with unit or scenario tests when possible; avoid blocking reporter modes.
- For task documents, update progress/status only for the task being implemented.

## Engineering Checks

- For data/distributed changes, make source of truth, consistency, retry/idempotency, ordering, and schema/contract evolution explicit.
- For production paths, require bounded work, intentional timeouts/retries, observable failures, and no unbounded queues or hidden resource growth.
- For refactors, preserve observable behavior; characterize current behavior first when tests are weak or behavior is unclear.
- For browser-facing code, verify both build-time behavior and runtime assumptions about module loading, generated assets, and local storage/database state.

## Saito Design Rule

Saito targets global scale and long-lived network continuity. For protocol, consensus, routing, storage, economy, or core architecture changes, check whether the design still works at very large participant counts and when the network remains live for decades. Flag linear unbounded state, full-dataset requirements, missing pruning, short retention without archival/audit paths, schema or version choices without migrations, cryptography without rotation/upgrade paths, economic assumptions that fail over time, operator workflows that require permanent central coordination, or assumptions that need sharding, delegation, summaries, or layer-2 paths.
