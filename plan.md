# Saito WASM / JS Improvement TODOs

## Constraints

- Single-instance runtime support is enough for this pass.
- `rust/saito-js/package.json` version is script-managed before publish and should not be treated as a source-of-truth compatibility value.
- Prefer targeted correctness fixes over large architectural rewrites.

## Phase 1: External Input And Crash Barriers

1. [x] `Critical | P0` Harden network-facing wasm entrypoints by replacing `unwrap()`-based parsing in block fetch and block-fetch-failure paths with explicit validation and `JsValue` errors.
2. [x] `High | P0` Add async error handling to the web socket receive path in `rust/saito-js/lib/custom/shared_methods.web.ts` so rejected `process_msg_buffer_from_peer(...)` calls are surfaced and handled.
3. [x] `Critical | P0` Convert golden ticket deserialization in `rust/saito-core/src/core/consensus/golden_ticket.rs` from panic-based parsing to `Result`-based validation.
4. [x] `Critical | P0` Harden `rust/saito-core/src/core/consensus/block.rs` deserialization against truncated or undersized buffers before fixed-offset header slicing.
5. [x] `High | P0` Validate `SaitoUTXOSetKey` length and layout before fixed-offset parsing in `rust/saito-core/src/core/consensus/slip.rs::parse_slip_from_utxokey(...)`.
6. [x] `Critical | P0` Remove panic-prone missing-block lookups in `rust/saito-core/src/core/consensus/blockchain.rs` reorg and block-deletion paths.
7. [x] `Critical | P0` Replace panic-based checkpoint replay failure handling in `rust/saito-core/src/core/consensus/blockchain.rs` so malformed checkpoint slips fail initialization cleanly.
8. [x] `High | P1` Replace panic-on-disk-write behavior in `rust/saito-core/src/core/routing/io/storage.rs` with returned errors and explicit recovery or logging.
9. [x] `High | P1` Replace startup issuance-file slip-type panics in `rust/saito-core/src/core/routing/io/storage.rs` with structured configuration or parse errors.
10. [x] `High | P1` Replace the golden-ticket invariant panic in `rust/saito-core/src/core/consensus/mempool.rs` with explicit rejection and diagnostics.
11. [x] `High | P1` Validate fixed-length network message decoding in paths such as `rust/saito-core/src/core/msg/block_request.rs` and routing message dispatch so malformed peer input is rejected without panicking.
12. [x] `Medium | P1` Validate transaction-construction assumptions in `rust/saito-core/src/core/consensus/transaction.rs`, including mismatched key or payment vectors and malformed NFT UUID decoding.
13. [x] `High | P1` Make wallet setter APIs return structured failures instead of only logging and returning silently on invalid key input.

### Phase 1 Validation

14. [x] `High | Validation` Add `saito-wasm` tests for invalid `process_fetched_block` inputs: invalid public key string, short hash, long hash, and valid control case.
15. [x] `High | Validation` Add `saito-wasm` tests for invalid `process_failed_block_fetch` inputs: invalid public key string, short hash, long hash, and valid control case.
16. [x] `High | Validation` Add `saito-wasm` tests for wallet setter rejection paths: invalid base58 public key, invalid-length private key, non-hex private key, and unchanged state after rejection.
17. [x] `High | Validation` Add `saito-core` tests for malformed golden ticket buffers: short buffer, long buffer, wrong-sized key segment, and valid control case.
18. [x] `High | Validation` Add `saito-core` tests for block deserialization with short header buffers, truncated transaction metadata, and a valid control case.
19. [x] `Medium | Validation` Add `saito-core` tests for malformed UTXO-set keys passed into slip parsing paths.
20. [x] `High | Validation` Add `saito-core` tests for reorg comparison when `new_chain[0]` or an `old_chain` block hash is missing from `self.blocks`.
21. [x] `High | Validation` Add `saito-core` tests for block deletion when the target block hash is absent from `self.blocks`.
22. [x] `High | Validation` Add `saito-core` tests for malformed checkpoint slips so startup reports a recoverable load error instead of panicking.
23. [x] `Medium | Validation` Add `saito-core` tests that misplaced golden-ticket transactions are rejected by mempool insertion without crashing.
24. [x] `Medium | Validation` Add `saito-core` tests for issuance-file parsing with unsupported slip types and invalid entries.
25. [x] `Medium | Validation` Add `saito-core` tests for malformed block-request or similar fixed-length network message buffers.
26. [x] `Medium | Validation` Add `saito-core` tests for mismatched transaction-construction inputs and malformed NFT UUID payloads.

## Phase 2: Peer Lifecycle And Routing Resilience

27. [x] `Critical | P1` Eliminate unwraps of optional peer `public_key`, `url`, and handshake `response` before handshake completion across `rust/saito-core/src/core/routing_thread.rs` and `rust/saito-core/src/core/routing/peers/network_peer.rs`.
28. [x] `High | P1` Make stale-peer cleanup and disconnect paths in `rust/saito-core/src/core/routing/peers/peer_collection.rs` tolerant of races and network I/O failures.
29. [x] `High | P1` Guard block-fetch candidate selection and peer-add flows against partially initialized peers instead of assuming peer metadata is present.
30. [x] `High | P1` Reject malformed peer public keys in static or runtime config loading without panicking.
31. [x] `High | P1` Replace unwrap-based routing-message deserialization in `rust/saito-core/src/core/routing_thread.rs` with explicit error handling and peer-level diagnostics.
32. [x] `Medium | P1` Replace runtime config-save unwraps in routing paths with logged recoverable failures.
33. [x] `Medium | P2` Remove sender-queue and dropped-channel assumptions in routing dispatch so missing senders or queues fail cleanly.

### Phase 2 Validation

34. [x] `High | Validation` Add `saito-core` tests for partially initialized peers flowing through add, fetch, and disconnect paths.
35. [x] `Medium | Validation` Add `saito-core` tests for stale-peer cleanup races and disconnect I/O failures.
36. [x] `High | Validation` Add `saito-core` tests for malformed routing messages so decode failures do not panic the routing thread.
37. [x] `Medium | Validation` Add `saito-core` tests for malformed configured peer keys and runtime peer reload failures.
38. [x] `Low | Validation` Add `saito-core` tests for routing config-save failure and dropped sender-queue behavior.

## Phase 3: Wallet And Runtime State Correctness

39. [x] `Critical | P1` Add a small internal helper in `rust/saito-wasm/src/saitowasm.rs` to sync singleton wallet state from the active runtime.
40. [x] `Critical | P1` Call that wallet-sync helper from `initialize_runtime(...)` and from wallet mutation paths that affect signing identity.
41. [x] `High | P1` Guard `WasmTransaction::sign()` against a missing `hash_for_signature` — either regenerate it or return an error instead of silently signing with an absent hash.
42. [x] `High | P1` Review `WasmWallet::set_key_list`, `WasmWallet::add_nft`, and `WasmBlockchain::reset` for hidden global-state mutation.
43. [x] `High | P1` For each of those methods, either route behavior through the intended runtime state explicitly or make the singleton-only behavior obvious in naming or documentation.
44. [x] `High | P1` Harden golden-ticket propagation and config-access paths in `rust/saito-core/src/core/consensus_thread.rs` so missing state or config does not panic.
45. [x] `Medium | P1` Validate pending-transaction shape in `rust/saito-core/src/core/consensus/wallet.rs`, including empty `tx.from` and missing `hash_for_signature`, instead of relying on assertions and unwraps.
46. [x] `High | P1` Guard against drift between `slips`, `unspent_slips`, and `staking_slips` in `rust/saito-core/src/core/consensus/wallet.rs` so transaction generation and staking selection reject inconsistent state instead of panicking.
47. [x] `High | P1` Remove remaining wallet `parse_slip_from_utxokey(...).unwrap()` assumptions from staking selection, cleanup, NFT exposure, and internal `WalletSlip::to_slip()` conversion paths.
48. [x] `Medium | P2` Replace wallet persistence unwraps in `rust/saito-core/src/core/consensus/wallet.rs` load and save flows with returned errors or explicit fallback handling.
49. [x] `Medium | P2` Replace snapshot-import assertions in `rust/saito-core/src/core/consensus/wallet.rs::update_from_balance_snapshot(...)` with structured validation and error reporting.

### Phase 3 Validation

50. [x] `High | Validation` Add `saito-wasm` regression tests for signing after wallet key mutation so signatures follow the latest active key.
51. [x] `Medium | Validation` Add `saito-wasm` tests for object methods with hidden or global coupling once their intended state ownership is fixed: `set_key_list`, `add_nft`, and blockchain `reset`.
52. [x] `High | Validation` Add `saito-core` tests for golden-ticket propagation when the mempool golden-ticket entry for the latest block is absent.
53. [x] `Medium | Validation` Add `saito-core` tests for missing consensus config during active consensus-thread setup or processing.
54. [x] `Medium | Validation` Add `saito-core` tests that input-less or malformed pending transactions are rejected without panicking wallet state updates.
55. [x] `Medium | Validation` Add `saito-core` tests for wallet collection drift so missing `slips` entries behind tracked UTXO keys fail cleanly.
56. [x] `Medium | Validation` Add `saito-core` tests for malformed UTXO keys in staking, NFT display, and wallet cleanup paths.
57. [x] `Low | Validation` Add `saito-core` tests for wallet load or save failure propagation and invalid balance-snapshot entries.

## Phase 4: JS And WASM API Boundary Consistency

58. [ ] `High | P1` Make `rust/saito-js/saito.ts::sendTransactionWithCallback(...)` return the resolved callback or send result instead of always resolving to `undefined`.
59. [ ] `High | P1` Delete pending callback entries from `Saito.promises` on both success and error paths in `rust/saito-js/lib/custom/custom_shared_methods.ts`.
60. [ ] `Medium | P1` Add timeout or cancellation cleanup for `waitForReply` and callback-based API requests so orphaned promises do not accumulate indefinitely.
61. [ ] `High | P1` Replace panic-based JS-callable setters and reply helpers in `rust/saito-wasm` with validated `JsValue` errors: block setters, API success or error key parsing, and similar boundary helpers.
62. [ ] `High | P1` Standardize invalid-input behavior across `WasmSlip`, `WasmTransaction`, and `WasmPeer::set_services(...)` so JS-facing setters reject malformed values consistently instead of mixing panics, silent returns, and falsey fallbacks.
63. [ ] `Medium | P1` Fix the `processFetchedBlock` TypeScript contract in `rust/saito-js/saito.ts` so `public_key` is typed as `string`.
64. [ ] `Medium | P1` Rebuild `rust/saito-js/dist` so generated declarations match the corrected runtime contract.
65. [ ] `Medium | P1` Recheck wasm host bridge tests and test doubles for agreement with the corrected `public_key: string` contract.
66. [ ] `Medium | P1` Make `rust/saito-wasm/src/wasm_block.rs::convert_keylist(...)` distinguish invalid JS input from a legitimate empty key list.
67. [ ] `Medium | P1` Standardize peer-key parsing behavior across JS-callable routing helpers such as `remove_stun_peer_impl(...)` and `process_peer_disconnection_impl(...)`.
68. [ ] `Medium | P1` Guard wasm public entrypoints against missing consensus config or uninitialized runtime state instead of unwrapping configuration access.
69. [ ] `Low | P2` Validate fixed-size typed-array inputs and preserve better parse diagnostics in lower-level wrappers such as `WasmNFT`, `WasmConfiguration`, and related conversion helpers.
70. [ ] `Low | P2` Validate JS type expectations such as `nft_type.as_string()` before unwrap-based conversion in wasm-exposed helpers.
71. [ ] `Medium | P2` Add runtime guards or clearer failures for wrapper classes whose constructors depend on static wasm `Type` assignments being initialized first.
72. [ ] `Medium | P2` Replace `HOST_BRIDGE.read().unwrap()` and `.write().unwrap()` poisoning assumptions in `rust/saito-wasm/src/wasm_host_bridge.rs` with explicit recovery or failure handling.
73. [ ] `Low | P2` Replace the bare runtime-initialization panic in `rust/saito-wasm/src/saitowasm.rs` with a descriptive error return or at least an actionable failure message.

### Phase 4 Validation

74. [ ] `High | Validation` Add `saito-js` tests for callback reply flows that verify returned callback values are propagated to callers.
75. [ ] `High | Validation` Add `saito-js` tests that pending callback entries are removed after both success and error replies.
76. [ ] `Medium | Validation` Add `saito-js` tests for reply timeout or cancellation cleanup.
77. [ ] `High | Validation` Add `saito-wasm` tests that invalid JS input to block setters and API reply helpers returns errors rather than panicking.
78. [ ] `High | Validation` Add `saito-wasm` tests that invalid values passed through `WasmSlip`, `WasmTransaction`, and `WasmPeer::set_services(...)` follow a single documented failure contract.
79. [ ] `Medium | Validation` Add `saito-wasm` tests for invalid key lists, invalid stun-peer keys, missing runtime-config access, non-string NFT types, and fixed-size typed-array validation in wrapper helpers.
80. [ ] `Medium | Validation` Run targeted tests for wasm host bridge typings and runtime bridge behavior.
81. [ ] `Low | Validation` Add a `saito-wasm` test covering host-bridge swap or read behavior after a simulated poisoned or failed lock path, if the recovery strategy is implemented.

## Phase 5: Packaging, Release Hygiene, And Deferred Boundaries

82. [ ] `Medium | P2` Replace checked-in package version values with an explicit placeholder or tag that signals “not publish truth”.
83. [ ] `Medium | P2` Update the publish or versioning script so it rewrites that placeholder deterministically before packing or publishing.
84. [ ] `Low | P2` Add a short note near the release automation or package metadata explaining that committed version values are intentionally non-authoritative.
85. [ ] `Medium | P3` Inventory `saito-js` imports that depend on `saito-wasm/pkg/node` or `saito-wasm/pkg/web` internal layout.
86. [ ] `Medium | P3` Define a thinner stable entry surface for `saito-wasm` where it reduces packaging fragility without disrupting the current build flow.
87. [ ] `Low | P3` Defer broader package-shape refactors unless they materially improve correctness or release reliability.
88. [ ] `Medium | P2` Fix confirmed bug in standalone `get_peers()`: array is pre-allocated to `is_connected()` count but filled with all peers regardless of connection state, causing a size mismatch. Decide whether it should return only connected peers or all known peers.

### Phase 5 Validation

89. [ ] `Medium | Validation` Verify publish automation rewrites placeholder package versions before packaging.
90. [ ] `Low | Validation` Add a deferred `saito-wasm` regression test for `get_peers()` once the connected-vs-all peer contract is decided.

## Cross-Phase Validation

91. [x] `Required | Validation` Run `cargo test -p saito-core` for the targeted core changes.
92. [x] `Required | Validation` Run `cargo test -p saito-wasm` for the targeted wasm changes.
93. [x] `Required | Validation` Run `npm run build` in `rust/saito-wasm`.
94. [x] `Required | Validation` Run `npm run build` in `rust/saito-js`.

## Non-Goals For Now

- Do not implement full support for multiple concurrent wasm runtimes in this pass.
- Do not remove the global singleton entirely in this pass.
- Do not take on unrelated Node or Rust boundary refactors unless they are required by the correctness fixes above.
