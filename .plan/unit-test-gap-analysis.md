# Unit Test Coverage Gap Analysis

## Scope

This document identifies source-owned unit test gaps across the Saito repository and recommends concrete scenarios to add coverage for.

It is intentionally focused on unit and narrow component-level tests, not broad end-to-end flows.

## Current Coverage Snapshot

- Rust core has meaningful embedded tests in several consensus and routing modules, including `block.rs`, `blockchain.rs`, `transaction.rs`, `consensus_thread.rs`, `routing_thread.rs`, `peer_collection.rs`, `block_request.rs`, `ghost_chain_sync.rs`, and `api_message.rs`.
- `rust/saito-core/src/core/routing/blockchain_sync_state.rs` has some tests, but they do not fully cover the newer sync-floor and retry-selection behavior.
- `rust/saito-wasm` has very light direct test coverage. Most bridge behavior is effectively untested.
- `rust/saito-js/tests` has only two source tests, with active coverage mainly around wrappers and value mapping.
- `node/lib` has very little effective unit coverage. There are only a handful of spec files, and representative ones like `node/lib/saito/block.spec.ts`, `node/lib/saito/transaction.spec.ts`, and `node/lib/saito/core/storage-core.spec.ts` are largely commented out.
- `node/mods` appears to have no source-owned unit/spec files despite containing a large amount of application logic.
- Some e2e coverage exists in `e2e` and `rust/saito-e2e`, but at least one consensus test is a placeholder: `rust/saito-e2e/tests/consensus/atr.spec.ts`.

## Main Findings

### 1. The highest-risk runtime bridge code has little or no direct unit coverage

Primary files:

- `node/lib/saito/core/server.ts`
- `node/mods/relay/relay.js`
- `rust/saito-js/saito.ts`
- `rust/saito-wasm/src/saitowasm.rs`
- `rust/saito-wasm/src/wasm_io_handler.rs`

Why this matters:

- These files contain the JS <-> wasm <-> Rust boundary behavior.
- They handle socket lifecycle, peer disconnects, relay forwarding, callback registration, and interface event delivery.
- Recent debugging work showed that regressions here can terminate the node without obvious traces.

Coverage gaps:

- Deferred interface-event delivery and listener isolation in `NodeSharedMethods.emitAsync(...)`.
- Closed-socket pruning in `sendMessage(...)` and `sendMessageToAll(...)`.
- Promise rejection handling in websocket `close` and `error` paths.
- `processApiCall(...)` success, deserialize-failure, callback-failure, and no-peer behavior.
- Relay forwarding behavior when one peer is disconnected, when no peer matches, and when one forward fails while another succeeds.
- `saito-js` callback bookkeeping for `sendApiCall(...)` and `sendTransactionWithCallback(...)`.
- Wasm bridge behavior around `send_api_call`, `process_api_call`, and peer-disconnect handling.

Recommended tests:

- `server.ts`: emits `add-block-success`, `wallet-updated`, and `new-chain-detected` asynchronously rather than synchronously.
- `server.ts`: removes stale sockets when `readyState !== OPEN`.
- `server.ts`: does not crash when `process_peer_disconnection(...)` rejects.
- `server.ts`: `processApiCall(...)` sends API success on success and logs but survives deserialize failures.
- `relay.js`: forwards only to matching peers returned by `app.network.getPeers()`.
- `relay.js`: returns `peer not found` when no peer matches the relayed recipients.
- `relay.js`: preserves behavior when one forward promise rejects.
- `saito.ts`: `sendApiCall(...)` rejects for missing or disconnected peers.
- `saito.ts`: `sendApiCall(...)` with `waitForReply=true` registers and resolves the correct callback index.
- `saito.ts`: `sendTransactionWithCallback(...)` invokes callback with decoded message on success and error object on failure.

### 2. Node core serialization and storage tests exist mostly as dead or commented-out files

Primary files:

- `node/lib/saito/block.spec.ts`
- `node/lib/saito/transaction.spec.ts`
- `node/lib/saito/core/storage-core.spec.ts`

Why this matters:

- The specs suggest these were once intended as direct unit coverage for block and transaction serialization, hashing, signing, and storage.
- In their current state they do not protect runtime behavior.

Coverage gaps:

- Block serialize/deserialize round-trips.
- Transaction serialize/deserialize round-trips.
- Signature generation and verification.
- Storage persistence and block reload behavior.
- Compatibility between Rust-generated blocks and Node-side decoding.

Recommended tests:

- Re-activate source-level block round-trip tests using the current `saito-js` wrappers instead of the older commented test harness.
- Re-activate transaction sign/verify coverage with current key handling.
- Add storage tests for save, reload, missing file, malformed file, and cross-runtime compatibility.

### 3. Message parsing and protocol envelope coverage is incomplete relative to risk

Primary files:

- `rust/saito-core/src/core/msg/message.rs`
- `rust/saito-core/src/core/msg/api_message.rs`
- `rust/saito-core/src/core/msg/block_request.rs`
- `rust/saito-core/src/core/msg/ghost_chain_sync.rs`

Why this matters:

- `message.rs` is the main message envelope for network traffic.
- Several specific payload types have tests, but the top-level `Message` enum encode/decode matrix is complex and can regress silently.

Coverage gaps:

- Full variant-by-variant serialize/deserialize round-trips in `message.rs`.
- Negative tests for every fixed-size branch, not just selected ones.
- Cross-check that type tags map to the expected variant for `ApplicationMessage`, `Result`, `Error`, `KeyListUpdate`, `GenesisBlockHeader`, and `ForcedDisconnection`.

Recommended tests:

- A table-driven round-trip suite for every `Message` variant.
- Negative tests for invalid lengths for fixed-size variants.
- Negative tests for malformed UTF-8 in `ForcedDisconnection`.
- Boundary tests for empty payloads and minimally valid API payloads.

### 4. Sync-state selection and retry behavior needs more targeted tests than it currently has

Primary files:

- `rust/saito-core/src/core/routing/blockchain_sync_state.rs`
- `rust/saito-core/src/core/routing_thread.rs`
- `rust/saito-core/src/core/consensus/blockchain.rs`

Why this matters:

- These files coordinate queued block fetches, retry behavior, fetch-floor logic, and parent-miss recovery.
- Some coverage already exists, but not enough around the newer fetch-floor behavior or ordering decisions.

Coverage gaps:

- `get_sync_fetch_floor_block_id()` for all combinations of empty, received-only, queued-only, and both-present states.
- Retry-state transitions from `Failed` back into selection.
- Batch-size fairness with mixed `Queued`, `Fetching`, `Fetched`, and `Failed` entries.
- Interaction between routing-thread refresh points and blockchain sync-floor updates.
- Parent-missing behavior when the prior block is above or below the current fetch floor.

Recommended tests:

- Direct unit tests for `get_sync_fetch_floor_block_id()`.
- Queue-selection tests with mixed statuses and multiple peers.
- Retry-cap behavior when retry count reaches the max threshold.
- Routing-thread tests that verify refresh is triggered when entries are added, removed, or processed.
- Blockchain tests for parent-request vs reject decisions around `sync_fetch_floor_block_id`.

### 5. Complex module logic in `node/mods` has almost no unit coverage

Primary examples:

- `node/mods/fileshare/fileshare.js`
- `node/mods/relay/relay.js`
- `node/mods/redsquare/redsquare.js`
- `node/mods/imperium/imperium.js`

Why this matters:

- These modules contain substantial state machines and data transformation logic.
- Today they are largely protected only by manual usage and e2e coverage.

Coverage gaps by module:

`fileshare.js`

- `calcSize(...)` unit conversions and rounding behavior.
- `transferStats(...)` initial timestamp, max rate, and percentage calculations.
- `handlePeerTransaction(...)` branches for permission, denial, stop, update, share-file, and read-receipt requests.
- `interrupt(...)` and `reset(...)` behavior with navigation locking and missing file IDs.
- `addFileUploader(...)` rejection of empty files and state initialization for valid files.

`relay.js`

- Covered above in the bridge section, but deserves its own focused unit suite because it is central to many real-time modules.

`redsquare.js`

- Notification update behavior driven by connection events.
- Menu responder behavior for `user-menu`, `saito-header`, and `saito-floating-menu`.
- Request routing logic around orphan edit processing and post creation triggers.

`imperium.js`

- This file contains a large amount of pure or mostly-pure board-state mutation logic that is very suitable for unit tests.
- Good candidates are unit import defaults, storage/capacity calculations, unit load/unload helpers, and fleet/ground-force counting helpers.

Recommended tests:

- Start with pure helpers and state mutations first. They are cheaper to test than browser-driven flows.
- Build small fixture factories for sector, planet, ship, and unit objects instead of relying on full app initialization.

### 6. `rust/saito-js` has wrapper tests, but not enough behavioral tests around async coordination

Primary files:

- `rust/saito-js/tests/wrappers.test.ts`
- `rust/saito-js/saito.ts`

Why this matters:

- Existing tests validate wrapper construction and message packing, which is useful.
- The runtime failures we investigated happened in async send/callback coordination, not in the simple value-wrapper layer.

Coverage gaps:

- Promise resolution ordering for callback-based sends.
- Error propagation from `sendApiError(...)` and `process_api_error(...)`.
- Callback registry cleanup after success and error.
- Integration of `getPeer(...)` status checks with send behavior.

Recommended tests:

- Add focused tests with a fake wasm host that records `send_api_call`, `send_api_success`, and `send_api_error` invocations.
- Verify callback promise resolution, rejection, and cleanup semantics.

### 7. Existing e2e coverage has obvious placeholders and should not be treated as unit coverage

Primary files:

- `rust/saito-e2e/tests/consensus/atr.spec.ts`
- `rust/saito-e2e/tests/consensus/node-sync.spec.ts`
- `e2e/tests/smoke.spec.ts`

Why this matters:

- These tests validate bootstrapping and multi-node behavior, but they do not replace deterministic unit suites.
- The empty ATR test is a signal that some intended coverage does not exist yet.

Recommended follow-up:

- Keep e2e focused on cross-process confidence.
- Move protocol logic, serialization, queue selection, and module branch behavior into unit/component tests.

## Recommended Test Additions By Priority

### P0: Regressions that can terminate or wedge a node

- `node/lib/saito/core/server.ts`
- `node/mods/relay/relay.js`
- `rust/saito-js/saito.ts`
- `rust/saito-wasm/src/saitowasm.rs`

### P1: Protocol correctness and sync behavior

- `rust/saito-core/src/core/msg/message.rs`
- `rust/saito-core/src/core/routing/blockchain_sync_state.rs`
- `rust/saito-core/src/core/routing_thread.rs`
- `rust/saito-core/src/core/consensus/blockchain.rs`

### P2: Re-enable dormant Node core tests

- `node/lib/saito/block.spec.ts`
- `node/lib/saito/transaction.spec.ts`
- `node/lib/saito/core/storage-core.spec.ts`

### P3: High-value application modules with almost no direct tests

- `node/mods/fileshare/fileshare.js`
- `node/mods/redsquare/redsquare.js`
- `node/mods/imperium/imperium.js`

## Suggested Implementation Order

1. Add a small `server.ts` and `relay.js` suite around disconnects, stale sockets, async event emission, and relay forwarding failures.
2. Add `rust/saito-js` fake-host tests for `sendApiCall(...)`, callback bookkeeping, and error propagation.
3. Add `Message` round-trip and invalid-payload coverage in `message.rs`.
4. Expand `blockchain_sync_state.rs` coverage for fetch-floor and retry-state behavior.
5. Rebuild the commented-out Node core serialization/storage suites using the current wrappers.
6. Add pure-helper tests in `fileshare.js` and `imperium.js` before attempting larger browser-oriented module tests.

## Notes

- Do not count generated `dist` files, bundled code, or vendored dependencies as meaningful test coverage.
- Prefer small fixture builders and fake transport/wasm hosts over full app bootstraps where possible.
- For the bridge path, the most valuable tests are the ones that simulate partial failure and re-entrancy risk, not just happy-path serialization.