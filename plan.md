# Saito WASM / JS Improvement TODOs

## Constraints

- Single-instance runtime support is enough for this pass.
- `rust/saito-js/package.json` version is script-managed before publish and should not be treated as a source-of-truth compatibility value.
- Prefer targeted correctness fixes over large architectural rewrites.

## Phase 1: External Input And Crash Barriers

1. [ ] `Critical | P0` Harden network-facing wasm entrypoints by replacing `unwrap()`-based parsing in block fetch and block-fetch-failure paths with explicit validation and `JsValue` errors.
2. [ ] `High | P0` Add async error handling to the web socket receive path in `rust/saito-js/lib/custom/shared_methods.web.ts` so rejected `process_msg_buffer_from_peer(...)` calls are surfaced and handled. (Note: no Node.js equivalent of `shared_methods.web.ts` exists — only the web variant and the abstract `custom_shared_methods.ts` base. If a Node runtime path is added later, it will need the same `.catch()` treatment.)
3. [ ] `Critical | P0` Convert golden ticket deserialization in `rust/saito-core/src/core/consensus/golden_ticket.rs` from panic-based parsing to `Result`-based validation.
4. [ ] `Critical | P0` Harden `rust/saito-core/src/core/consensus/block.rs` deserialization against truncated or undersized buffers before fixed-offset header slicing.
5. [ ] `High | P0` Validate `SaitoUTXOSetKey` length and layout before fixed-offset parsing in `rust/saito-core/src/core/consensus/slip.rs::parse_slip_from_utxokey(...)`.
6. [ ] `Critical | P0` Remove panic-prone missing-block lookups in `rust/saito-core/src/core/consensus/blockchain.rs` reorg and block-deletion paths.
7. [ ] `Critical | P0` Replace the active `panic!("cannot continue loading blocks")` at line 2413 in `rust/saito-core/src/core/consensus/blockchain.rs` with a recoverable error. (Note: the checkpoint total-supply panic at line 2887 is already commented out.)
8. [ ] `High | P1` Replace panic-on-disk-write behavior in `rust/saito-core/src/core/routing/io/storage.rs` with returned errors and explicit recovery or logging.
9. [ ] `High | P1` Replace startup issuance-file slip-type panics in `rust/saito-core/src/core/routing/io/storage.rs` with structured configuration or parse errors.
10. [ ] `High | P1` Replace the golden-ticket invariant panic in `rust/saito-core/src/core/consensus/mempool.rs` with explicit rejection and diagnostics.
11. [ ] `High | P1` Validate fixed-length network message decoding in all `rust/saito-core/src/core/msg/` types so malformed peer input is rejected without panicking. Known affected files:
    - `block_request.rs` — 5 `try_into().unwrap()` on fixed offsets
    - `ghost_chain_sync.rs` — 6 `try_into().unwrap()` on external buffer slicing
    - `api_message.rs` — 1 `try_into().unwrap()` on buffer parse without length check
    - `handshake.rs` — `.unwrap()` on `secp256k1::Message::from_slice()` with peer-supplied challenge data (first message from an unauthenticated peer)
    - `message.rs` — network message envelope deserialization (verify bounds checking is complete)
11a. [ ] `Critical | P0` Replace chained `.unwrap()` calls in `rust/saito-core/src/core/routing/peers/peer_service.rs` (lines ~35–37, 70, 73, 85, 93, 136–151) on fields parsed during `deserialize_services(buffer)`. A malformed peer service list in a network packet crashes the node. Directly reachable via `Message::Services`.
11b. [ ] `Critical | P0` Replace triple `.unwrap()` on version string parsing in `rust/saito-core/src/core/process/version.rs` (line ~25). A malformed version string in a peer handshake message causes immediate panic. Reachable from any connecting peer.
11c. [ ] `High | P0` Replace `.unwrap()` on `peer.response` in `rust/saito-core/src/core/routing/peers/peer.rs` (line ~152) in the `handle_new_peer()` path. A peer sending a handshake without a response field crashes the connection handler.
11d. [ ] `High | P1` Replace `.unwrap()` calls on tree node navigation and hash operations in `rust/saito-core/src/core/consensus/merkle.rs` (lines ~63, 113, 137, 146–147, 156, 189–190). An empty transaction list or malformed merkle proof panics during block validation.
11e. [ ] `High | P1` Replace `.unwrap()` calls on key/signature parsing in `rust/saito-core/src/core/util/crypto.rs` (lines ~64, 132–133, 166–167). `SecretKey::from_slice().unwrap()`, `Message::from_slice().unwrap()`, and `Signature::from_compact().unwrap()` panic on invalid key material from config or malformed signatures in network messages.
11f. [ ] `Medium | P1` Replace `.unwrap()` calls on deque/vec operations in `rust/saito-core/src/core/routing/blockchain_sync_state.rs` (lines ~238–239, 403, 513–538). Empty deque or vec after removal panics the sync state machine under race conditions.
11g. [ ] `Medium | P1` Replace `.unwrap()` on endpoint deserialization in `rust/saito-core/src/core/util/configuration.rs` (line ~294). A malformed config file crashes the node at startup.
11h. [ ] `Medium | P1` Replace chained `.get(N).unwrap()` on token parsing in `rust/saito-core/src/core/util/balance_snapshot.rs` (lines ~90–92, 174–176, 276–307, 360–369). A corrupted or format-changed snapshot file crashes the node.
12. [ ] `Medium | P1` Validate transaction-construction assumptions in `rust/saito-core/src/core/consensus/transaction.rs`, including mismatched key or payment vectors and malformed NFT UUID decoding.
13. [ ] `High | P1` Make wallet setter APIs return structured failures instead of only logging and returning silently on invalid key input. Note: `set_private_key` in `wasm_wallet.rs` also has a hidden panic — `key.try_into().unwrap()` after length check — that must be replaced.

### Phase 1 Validation

14. [ ] `High | Validation` Add `saito-wasm` tests for invalid `process_fetched_block` inputs: invalid public key string, short hash, long hash, and valid control case.
15. [ ] `High | Validation` Add `saito-wasm` tests for invalid `process_failed_block_fetch` inputs: invalid public key string, short hash, long hash, and valid control case.
16. [ ] `High | Validation` Add `saito-wasm` tests for wallet setter rejection paths: invalid base58 public key, invalid-length private key, non-hex private key, valid-hex-but-wrong-size private key (hidden `try_into().unwrap()` path), and unchanged state after rejection.
17. [ ] `High | Validation` Add `saito-core` tests for malformed golden ticket buffers: short buffer, long buffer, wrong-sized key segment, and valid control case.
18. [ ] `High | Validation` Add `saito-core` tests for block deserialization with short header buffers, truncated transaction metadata, and a valid control case.
19. [ ] `Medium | Validation` Add `saito-core` tests for malformed UTXO-set keys passed into slip parsing paths.
20. [ ] `High | Validation` Add `saito-core` tests for reorg comparison when `new_chain[0]` or an `old_chain` block hash is missing from `self.blocks`.
21. [ ] `High | Validation` Add `saito-core` tests for block deletion when the target block hash is absent from `self.blocks`.
22. [ ] `High | Validation` Add `saito-core` tests for block-loading failure paths (line 2413 panic replacement) so startup reports a recoverable load error instead of panicking.
23. [ ] `Medium | Validation` Add `saito-core` tests that misplaced golden-ticket transactions are rejected by mempool insertion without crashing.
24. [ ] `Medium | Validation` Add `saito-core` tests for issuance-file parsing with unsupported slip types and invalid entries.
25. [ ] `Medium | Validation` Add `saito-core` tests for malformed fixed-length network message buffers across all `msg/` types: `block_request`, `ghost_chain_sync`, `api_message`, `message`, and `handshake`.
25a. [ ] `Critical | Validation` Add `saito-core` tests for malformed peer service buffers (validates item 11a) and malformed version strings in handshake (validates item 11b).
25b. [ ] `High | Validation` Add `saito-core` tests for handshake without response field (validates item 11c) and merkle tree operations on empty/malformed transaction lists (validates item 11d).
25c. [ ] `High | Validation` Add `saito-core` tests for invalid key material and malformed signatures passed to crypto utility functions (validates item 11e).
25d. [ ] `Medium | Validation` Add `saito-core` tests for corrupted balance snapshot files and malformed config endpoint entries (validates items 11g, 11h).
26. [ ] `Medium | Validation` Add `saito-core` tests for mismatched transaction-construction inputs and malformed NFT UUID payloads.

## Phase 2: Peer Lifecycle And Routing Resilience

27. [ ] `Critical | P1` Eliminate unwraps of optional peer `public_key`, `url`, and handshake `response` before handshake completion across `rust/saito-core/src/core/routing_thread.rs` and `rust/saito-core/src/core/routing/peers/network_peer.rs`.
28. [ ] `High | P1` Make stale-peer cleanup and disconnect paths in `rust/saito-core/src/core/routing/peers/peer_collection.rs` tolerant of races and network I/O failures.
29. [ ] `High | P1` Guard block-fetch candidate selection and peer-add flows against partially initialized peers instead of assuming peer metadata is present. This includes `self.challenge.unwrap()` in `network_peer.rs` (line 117), which panics if a peer hasn't completed the challenge exchange.
30. [ ] `High | P1` Reject malformed peer public keys in static or runtime config loading without panicking.
31. [ ] `High | P1` Replace unwrap-based routing-message deserialization in `rust/saito-core/src/core/routing_thread.rs` with explicit error handling and peer-level diagnostics.
32. [ ] `Medium | P1` Replace runtime config-save unwraps in routing paths with logged recoverable failures.
33. [ ] `Medium | P2` Remove sender-queue and dropped-channel assumptions in routing dispatch so missing senders or queues fail cleanly. Also applies to `mining_thread.rs` (line ~170): `stat_sender.send().await.unwrap()` panics if the stats channel is dropped.
33a. [ ] `High | P1` Fix confirmed crash-risk bug in `get_peers()` (`saitowasm.rs` line 1262): array is pre-allocated to `is_connected()` count but the fill loop iterates **all** peers without filtering, causing JS array size inconsistency. Either filter the loop to connected-only or allocate for all peers — the current code is always wrong regardless of intended semantics. (Moved here from Phase 5 — this is a peer-lifecycle bug, not a packaging concern.)

### Phase 2 Validation

34. [ ] `High | Validation` Add `saito-core` tests for partially initialized peers flowing through add, fetch, and disconnect paths.
35. [ ] `Medium | Validation` Add `saito-core` tests for stale-peer cleanup races and disconnect I/O failures.
36. [ ] `High | Validation` Add `saito-core` tests for malformed routing messages so decode failures do not panic the routing thread.
37. [ ] `Medium | Validation` Add `saito-core` tests for malformed configured peer keys and runtime peer reload failures.
38. [ ] `Low | Validation` Add `saito-core` tests for routing config-save failure and dropped sender-queue behavior.
38a. [ ] `High | Validation` Add a `saito-wasm` regression test for `get_peers()` with a mix of connected and disconnected peers to verify array consistency (validates item 33a).

## Phase 3: Wallet And Runtime State Correctness

39. [ ] `Critical | P1` Add a small internal helper in `rust/saito-wasm/src/saitowasm.rs` to sync singleton wallet state from the active runtime.
40. [ ] `Critical | P1` Call that wallet-sync helper from `initialize(...)` and from wallet mutation paths that affect signing identity. (Note: the exported function is `initialize(...)`, not `initialize_runtime(...)`.)
41. [ ] `High | P1` Guard `WasmTransaction::sign()` against a missing `hash_for_signature` — either regenerate it or return an error instead of silently signing with an absent hash.
42. [ ] `High | P1` Review `WasmWallet::set_key_list`, `WasmWallet::add_nft`, and `WasmBlockchain::reset` for hidden global-state mutation.
43. [ ] `High | P1` For each of those methods, either route behavior through the intended runtime state explicitly or make the singleton-only behavior obvious in naming or documentation.
44. [ ] `High | P1` Harden golden-ticket propagation and config-access paths in `rust/saito-core/src/core/consensus_thread.rs` so missing state or config does not panic.
44a. [ ] `High | P1` Triage the 219 `unwrap()` calls in `consensus_thread.rs` — the highest density in the codebase — and replace safety-critical ones with proper error handling. The 3 active `panic!` sites (line 1074: "couldn't create tx"; lines 1583 and 1616: "Failed to read directory") must be converted to recoverable errors.
45. [ ] `Medium | P1` Validate pending-transaction shape in `rust/saito-core/src/core/consensus/wallet.rs`, including empty `tx.from` and missing `hash_for_signature`, instead of relying on assertions and unwraps.
46. [ ] `High | P1` Guard against drift between `slips`, `unspent_slips`, and `staking_slips` in `rust/saito-core/src/core/consensus/wallet.rs` so transaction generation and staking selection reject inconsistent state instead of panicking.
47. [ ] `High | P1` Remove remaining wallet `parse_slip_from_utxokey(...).unwrap()` assumptions from staking selection, cleanup, NFT exposure, and internal `WalletSlip::to_slip()` conversion paths.
48. [ ] `Medium | P2` Replace wallet persistence unwraps in `rust/saito-core/src/core/consensus/wallet.rs` load and save flows with returned errors or explicit fallback handling.
49. [ ] `Medium | P2` Replace snapshot-import assertions in `rust/saito-core/src/core/consensus/wallet.rs::update_from_balance_snapshot(...)` with structured validation and error reporting.

### Phase 3 Validation

50. [ ] `High | Validation` Add `saito-wasm` regression tests for signing after wallet key mutation so signatures follow the latest active key.
51. [ ] `Medium | Validation` Add `saito-wasm` tests for object methods with hidden or global coupling once their intended state ownership is fixed: `set_key_list`, `add_nft`, and blockchain `reset`.
52. [ ] `High | Validation` Add `saito-core` tests for golden-ticket propagation when the mempool golden-ticket entry for the latest block is absent.
53. [ ] `Medium | Validation` Add `saito-core` tests for missing consensus config during active consensus-thread setup or processing.
53a. [ ] `High | Validation` Add `saito-core` tests for the 3 `panic!` sites in `consensus_thread.rs`: failed tx creation (line 1074) and failed directory reads (lines 1583, 1616), validating item 44a. Note: `consensus_thread.rs` already has a `#[cfg(test)] mod tests` with `total_supply_test` and `total_supply_test_with_atr` — new tests should extend this module.
54. [ ] `Medium | Validation` Add `saito-core` tests that input-less or malformed pending transactions are rejected without panicking wallet state updates.
55. [ ] `Medium | Validation` Add `saito-core` tests for wallet collection drift so missing `slips` entries behind tracked UTXO keys fail cleanly.
56. [ ] `Medium | Validation` Add `saito-core` tests for malformed UTXO keys in staking, NFT display, and wallet cleanup paths.
57. [ ] `Low | Validation` Add `saito-core` tests for wallet load or save failure propagation and invalid balance-snapshot entries.

## Phase 4: JS And WASM API Boundary Consistency

58. [ ] `High | P1` Make `rust/saito-js/saito.ts::sendTransactionWithCallback(...)` return the resolved callback or send result instead of always resolving to `undefined`.
59. [ ] `High | P1` Delete pending callback entries from `Saito.promises` on both success and error paths in `rust/saito-js/lib/custom/custom_shared_methods.ts`.
60. [ ] `Medium | P1` Add timeout or cancellation cleanup for `waitForReply` and callback-based API requests so orphaned promises do not accumulate indefinitely.
61. [ ] `High | P1` Replace panic-based JS-callable setters and reply helpers in `rust/saito-wasm` with validated `JsValue` errors: block setters, API success or error key parsing, and similar boundary helpers.
62. [ ] `High | P1` Standardize invalid-input behavior across `WasmSlip`, `WasmTransaction`, and `WasmPeer::set_services(...)` so JS-facing setters reject malformed values consistently instead of mixing panics, silent returns, and falsey fallbacks. Specific panic sites: `WasmSlip::set_utxo_key` (`string_to_hex(key).unwrap()`), `WasmTransaction::set_signature` (`string_to_hex(signature).unwrap()`), and `WasmPeer::set_services` (`serde_wasm_bindgen::from_value(services).unwrap()`).
63. [ ] `Medium | P1` Fix the `processFetchedBlock` TypeScript contract in `rust/saito-js/saito.ts` so `public_key` is typed as `string`.
64. [ ] `Medium | P1` Rebuild `rust/saito-js/dist` so generated declarations match the corrected runtime contract.
65. [ ] `Medium | P1` Update the JS-side host bridge test (`rust/saito-js/dist/tests/wasm_host_bridge.test.js`) and test doubles for agreement with the corrected `public_key: string` contract. (Note: this is the JS test file — the Rust-side `wasm_host_bridge.rs` does not exist. The existing test already passes `"peer"` as a string for `publicKey`, so it may only need a type-assertion update.)
66. [ ] `Medium | P1` Make `rust/saito-wasm/src/wasm_block.rs::convert_keylist(...)` distinguish invalid JS input from a legitimate empty key list.
67. [ ] `Medium | P1` Standardize peer-key parsing behavior across JS-callable routing helpers. Specifically, `remove_stun_peer(...)` panics on invalid key via bare `.unwrap()`, while `process_peer_disconnection(...)` already handles errors gracefully. Align `remove_stun_peer` to the graceful pattern. (Note: actual function names have no `_impl` suffix.)
68. [ ] `Medium | P1` Guard wasm public entrypoints against missing consensus config or uninitialized runtime state instead of unwrapping configuration access.
68a. [ ] `High | P1` Replace the 8 `unwrap()` calls in `rust/saito-wasm/src/wasm_io_handler.rs` (lines ~94–190) that panic on JS I/O errors (logging, value conversion). This is the I/O bridge between WASM and JS — panics here crash the runtime on recoverable I/O failures.
68b. [ ] `Medium | P1` Replace the 3 `unwrap()` calls in `rust/saito-wasm/src/wasm_configuration.rs` (lines ~90–120) on config parsing and endpoint access so a malformed JS config returns an error instead of crashing the runtime.
68c. [ ] `Medium | P1` Replace the unchecked `try_into().unwrap()` in `rust/saito-wasm/src/wasm_balance_snapshot.rs` (line ~42) with length validation — same pattern as the slip/block deserializers.
68d. [ ] `High | P1` Replace `.as_ref().unwrap()` on the `SAITO` singleton Option in `rust/saito-wasm/src/wasm_blockchain.rs` (line ~81). Any call to `reset()` before `initialize()` panics the WASM runtime. Apply the same guard pattern needed across all `SAITO.lock().await` + `.unwrap()` sites.
68e. [ ] `Low | P2` Replace the `is_none()` check + `.unwrap()` anti-pattern in `rust/saito-wasm/src/wasm_network_peer.rs` (lines ~19–27) with `match` or `.map_or()` for `get_public_key()` and `get_url()`. Not a crash risk today but error-prone under refactoring.
69. [ ] `Low | P2` Validate fixed-size typed-array inputs and preserve better parse diagnostics in lower-level wrappers such as `WasmNFT`, `WasmConfiguration`, and related conversion helpers.
70. [ ] `Low | P2` Validate JS type expectations such as `nft_type.as_string()` before unwrap-based conversion in wasm-exposed helpers.
71. [ ] `Medium | P2` Add runtime guards or clearer failures for wrapper classes whose constructors depend on static wasm `Type` assignments being initialized first.
72. ~`Medium | P2` Replace `HOST_BRIDGE.read().unwrap()` and `.write().unwrap()` poisoning assumptions in `rust/saito-wasm/src/wasm_host_bridge.rs` with explicit recovery or failure handling.~ **REMOVED — `wasm_host_bridge.rs` does not exist in the current codebase. No `HOST_BRIDGE` static found anywhere in `saito-wasm/src/`.**
73. [ ] `Low | P2` Replace the bare runtime-initialization panic in `rust/saito-wasm/src/saitowasm.rs` with a descriptive error return or at least an actionable failure message.
73a. [ ] `Medium | P1` Guard against double-init crash: `log::set_logger(...).unwrap()` in `initialize()` panics opaquely if called more than once (e.g., hot-module-reload or test scenarios). Add an `is_err()` guard or `set_logger_racy`.
73b. [ ] `Medium | P1` Add `.catch()` to the unhandled `.register_callback().then(() => {})` promise chain in `rust/saito-js/lib/blockchain.ts` (line ~21) so a failed WASM callback registration surfaces an error instead of becoming an unhandled rejection.
73c. [ ] `Critical | P1` Add error handling to the WASM module import in `rust/saito-js/index.node.ts` (line ~44): `await import("saito-wasm/pkg/node")` has no `try/catch` — if the WASM module fails to load, the entire initialization crashes unhandled.
73d. [ ] `Critical | P1` Add `.catch()` to the WASM import chain in `rust/saito-js/index.web.ts` (lines ~40–68): `import("saito-wasm/pkg/web").then(s => s.default().then(...))` has no error handler — a failed WASM load or init produces an unhandled rejection with no recovery path.
73e. [ ] `High | P1` Add null/undefined guards before `.map()` on WASM-returned arrays in `rust/saito-js/lib/wallet.ts` (`getSlips()`, `getPendingTxs()`), `rust/saito-js/lib/transaction.ts` (`to`, `from`, `routing_path` getters), and `rust/saito-js/lib/block.ts` (`transactions` getter). If WASM returns `null`/`undefined`, `.map()` throws a TypeError.
73f. [ ] `Medium | P1` Validate JSON input shape in `rust/saito-js/lib/transaction.ts` constructor (lines ~25–38) and `rust/saito-js/lib/slip.ts` constructor (lines ~22–30) before accessing properties like `json.to`, `json.from`, `json.buffer`. Undefined properties crash with TypeErrors.
73g. [ ] `Medium | P1` Fix `rust/saito-js/lib/nft.ts` slip getters (lines ~20–26) that use `(this.instance as any).slipN` — these bypass type safety and return `undefined` if the WASM property is absent, causing downstream crashes.
73h. [ ] `Low | P2` Validate WASM constructor input in `rust/saito-js/lib/stun_peer.ts` (line ~23) — `new NetworkPeer()` is created without a WasmNetworkPeer instance; if the WASM constructor doesn't handle `undefined`, this crashes.

### Phase 4 Validation

> **Existing test coverage:** `rust/saito-js/dist/tests/callback_promises.test.js` and `rust/saito-js/dist/tests/wasm_host_bridge.test.js` already exist. Items 74–76 should extend or replace these rather than creating parallel test files. `rust/saito-js/tests/wrappers.test.ts` contains test doubles (`FakeWasmTransaction`, `FakeWasmWallet`, etc.) that can be reused.

74. [ ] `High | Validation` Add `saito-js` tests for callback reply flows that verify returned callback values are propagated to callers.
75. [ ] `High | Validation` Add `saito-js` tests that pending callback entries are removed after both success and error replies.
76. [ ] `Medium | Validation` Add `saito-js` tests for reply timeout or cancellation cleanup.
76a. [ ] `Critical | Validation` Add `saito-js` tests that `index.node.ts` and `index.web.ts` WASM import failures are caught and produce a usable error (validates items 73c, 73d).
76b. [ ] `High | Validation` Add `saito-js` tests that WASM-returned null/undefined arrays don't crash `.map()` in wallet, transaction, and block wrappers (validates item 73e).
76c. [ ] `Medium | Validation` Add `saito-js` tests that transaction/slip constructors handle missing or malformed JSON fields without crashing (validates item 73f).
77. [ ] `High | Validation` Add `saito-wasm` tests that invalid JS input to block setters and API reply helpers returns errors rather than panicking.
78. [ ] `High | Validation` Add `saito-wasm` tests that invalid values passed through `WasmSlip`, `WasmTransaction`, and `WasmPeer::set_services(...)` follow a single documented failure contract.
79. [ ] `Medium | Validation` Add `saito-wasm` tests for invalid key lists, invalid stun-peer keys, missing runtime-config access, non-string NFT types, and fixed-size typed-array validation in wrapper helpers.
79a. [ ] `High | Validation` Add `saito-wasm` tests for `wasm_io_handler.rs` failure paths: JS I/O errors during block write, file load, and logging should return errors without panicking.
79b. [ ] `Medium | Validation` Add `saito-wasm` tests for malformed config input to `wasm_configuration.rs` and undersized buffers to `wasm_balance_snapshot.rs`.
79c. [ ] `High | Validation` Add `saito-wasm` test that `wasm_blockchain.rs::reset()` returns gracefully when called before `initialize()` (validates item 68d).
80. ~`Medium | Validation` Run targeted tests for wasm host bridge typings and runtime bridge behavior.~ **REMOVED — no `wasm_host_bridge.rs` exists.**
81. ~`Low | Validation` Add a `saito-wasm` test covering host-bridge swap or read behavior after a simulated poisoned or failed lock path, if the recovery strategy is implemented.~ **REMOVED — no `wasm_host_bridge.rs` exists.**
81a. [ ] `Medium | Validation` Add a `saito-wasm` test that calling `initialize()` twice does not panic (covers item 73a).

## Phase 5: Packaging, Release Hygiene, And Deferred Boundaries

82. [ ] `Medium | P2` Replace checked-in package version values with an explicit placeholder or tag that signals “not publish truth”.
83. [ ] `Medium | P2` Update the publish or versioning script so it rewrites that placeholder deterministically before packing or publishing.
84. [ ] `Low | P2` Add a short note near the release automation or package metadata explaining that committed version values are intentionally non-authoritative.
85. [ ] `Medium | P3` Inventory `saito-js` imports that depend on `saito-wasm/pkg/node` or `saito-wasm/pkg/web` internal layout.
86. [ ] `Medium | P3` Define a thinner stable entry surface for `saito-wasm` where it reduces packaging fragility without disrupting the current build flow.
87. [ ] `Low | P3` Defer broader package-shape refactors unless they materially improve correctness or release reliability.
88. **MOVED to item 33a** (Phase 2 — Peer Lifecycle) — `get_peers()` crash-risk bug is a peer-lifecycle issue, not a packaging concern.

### Phase 5 Validation

89. [ ] `Medium | Validation` Verify publish automation rewrites placeholder package versions before packaging.
90. **MOVED to item 38a** (Phase 2 Validation) — `get_peers()` regression test.

## Cross-Phase Validation

91. [ ] `Required | Validation` Run `cargo test -p saito-core` for the targeted core changes.
92. [ ] `Required | Validation` Run `cargo test -p saito-wasm` for the targeted wasm changes.
93. [ ] `Required | Validation` Run `npm run build` in `rust/saito-wasm`.
94. [ ] `Required | Validation` Run `npm run build` in `rust/saito-js`.
95. [ ] `Required | Validation` Run `cargo clippy -p saito-core -p saito-wasm -- -D clippy::unwrap_used` as a catch-all after all `unwrap()`→`Result` conversions.

## Audit Notes

The following observations were confirmed by codebase audit on 2026-03-24:

- **All file paths verified.** Every file referenced in this plan exists at the stated path, with the sole exception of `wasm_host_bridge.rs` (items 72, 80, 81 — struck through above).
- **All described bugs confirmed.** Items 1–6, 8–12, 27–31, 44–49, 58–66, 88 were independently verified against the current source. Items 11a–11h, 68d, 73c–73h were confirmed in a second audit pass.
- **Highest-risk files by `unwrap()` density:** `consensus_thread.rs` (219), `saitowasm.rs` (125), `blockchain.rs` (117), `block.rs` (95), `routing_thread.rs` (38), `wallet.rs` (25).
- **Newly identified crash-from-network paths (second audit):**
  - `peer_service.rs` — malformed service list from any peer crashes the node (item 11a)
  - `version.rs` — malformed version string in handshake crashes the node (item 11b)
  - `peer.rs` — missing handshake response field crashes the connection handler (item 11c)
  - `crypto.rs` — invalid key/signature material panics signature verification (item 11e)
- **JS-side crash paths (second audit):**
  - `index.node.ts` and `index.web.ts` — WASM import failure crashes entire initialization with no recovery (items 73c, 73d)
  - Multiple `.map()` calls on WASM-returned arrays with no null guard (item 73e)
- **`storage.rs` line 263** `panic!("Invalid slip type")` is reachable via externally-sourced issuance file data — not just internal state corruption. This is an input-validation gap covered by item 9.
- **`wallet.rs` balance snapshot** (line 1894) uses `.get(&to_public_key).unwrap()` after building a map — if a key was inserted but then the map logic diverges, this panics in a balance-critical path. Covered by item 49.
- **No `unsafe` blocks found** in saito-wasm or saito-core.
- **No raw pointer or unchecked type coercion** in any `#[wasm_bindgen]` exported function.

## Non-Goals For Now

- Do not implement full support for multiple concurrent wasm runtimes in this pass.
- Do not remove the global singleton entirely in this pass.
- Do not take on unrelated Node or Rust boundary refactors unless they are required by the correctness fixes above.