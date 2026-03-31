# Ghost Chain Review

## Scope

This review covers the current ghost-chain path across both the Rust runtime and the Node-facing adapter layer.

Primary Rust sources:

- `rust/saito-core/src/core/routing_thread.rs`
- `rust/saito-core/src/core/msg/ghost_chain_sync.rs`
- `rust/saito-core/src/core/consensus/blockchain.rs`
- `rust/saito-wasm/src/saitowasm.rs`

Node-side checks:

- `node/lib/saito/networkapi.ts`
- `rust/saito-js/lib/block.ts`
- `rust/saito-wasm/src/saitowasm.rs`

Important conclusion up front: there is not a second, independent ghost-chain implementation under `node/lib/`. The active logic lives in Rust, and Node reaches it through the wasm/js binding layer.

## Findings

### 1. High: ghost-chain relevance filtering still ignores watched key-list entries beyond the peer key

Current behavior:

- `process_ghost_chain_request(...)` builds `peer_key_list` from the peer public key plus `peer.key_list`.
- `generate_ghost_chain(...)` then narrows that list to `sender_only_key_list` with an inline debugging note.
- `ghost.txs` is populated from `block.has_keylist_txs(&sender_only_key_list)`, not the full watched key list.

Why this matters:

- A lite client can watch more than its own public key.
- Blocks containing transactions relevant to watched addresses but not the peer's own key will be marked as uninteresting.
- That means `process_ghost_chain(...)` can skip fetching blocks the client actually needs.

Recommended improvement:

- Restore `ghost.txs` to use the full `peer_key_list`.
- If the reduced filtering is still needed for operational reasons, hide it behind an explicit config flag and document it as a correctness tradeoff instead of leaving it as temporary debug behavior.

### 2. High: incoming ghost chains are applied with almost no structural validation before they mutate chain state

Current behavior:

- `GhostChainSync::deserialize(...)` validates buffer length and array sizing only.
- `process_ghost_chain(...)` trusts the decoded vectors and immediately:
  - derives each block hash from the rolling `previous_block_hash` plus `prehash`,
  - enqueues real block fetches when `txs[i]` is true,
  - inserts ghost blocks into the blockchain when `txs[i]` is false,
  - may trigger `on_chain_reorganization(...)` using the first all-ghost boundary.
- There is no explicit validation that:
  - `block_ids` are monotonic,
  - `previous_block_hashes[i]` actually matches the rolling chain being reconstructed,
  - timestamps are plausible or ordered,
  - the advertised `start` anchor is actually sensible relative to the local chain.

Why this matters:

- A malformed or malicious peer can push inconsistent ghost metadata into the local blockring before any full block body is fetched.
- The code computes the block hash from one linkage source, but stores `previous_block_hashes[i]` separately in `add_ghost_block(...)`, so inconsistent metadata can be recorded without being rejected.
- Even if later full-block fetches correct the state, the interim reorg and blockring mutation are being driven by unverified summary data.

Recommended improvement:

- Add a structural validation pass before `process_ghost_chain(...)` mutates blockchain state.
- Reject chains where linkage, block-id ordering, or vector contents are inconsistent.
- Prefer a fail-closed path that logs and drops the ghost chain instead of partially applying it.

### 3. Medium: ghost-chain generation is still a linear scan over the fork gap, and the current workaround for that load is correctness-reducing

Current behavior:

- `generate_ghost_chain(...)` walks every longest-chain block from `last_shared_ancestor + 1` to the latest block.
- For each block it evaluates `block.has_keylist_txs(...)`.
- The file already contains a comment explaining that the implementation was temporarily restricted to the sender key to reduce load on a throttled server.

Why this matters:

- The performance issue is real: ghost-chain generation cost scales with sync gap and lite-peer traffic.
- The current mitigation is to reduce correctness rather than to improve the data path.
- That makes the system harder to reason about because the review result is now "partially correct by design when under load".

Recommended improvement:

- Fix the scaling issue at the source instead of keeping the sender-only shortcut.
- Options include:
  - caching per-block involved-key summaries that are cheap to query,
  - precomputing watched-key bloom/filter-like summaries,
  - bounding ghost-chain generation work per request and chunking large responses,
  - moving expensive generation off the hot routing path if it becomes measurable.

### 4. Low: Node ownership of ghost-chain behavior is currently opaque

Current behavior:

- The actual protocol implementation is in Rust.
- `rust/saito-wasm/src/saitowasm.rs` exposes `start_from_received_ghost_chain()` as a host-facing hook.
- `node/lib/saito/networkapi.ts` still contains only commented legacy message enum values for `SPVChain`, `GhostChain`, and `GhostChainRequest`.

Why this matters:

- There is no active Node ghost-chain algorithm to audit separately, which is fine.
- But the codebase makes that easy to misunderstand because the old Node-facing protocol surface is still present as comments while the real logic moved into Rust.
- This is more of a maintainability risk than a runtime bug.

Recommended improvement:

- Remove stale commented protocol definitions from `node/lib/saito/networkapi.ts`, or replace them with a note that ghost-chain handling is owned by Rust core.
- Add one short design or adapter note near the Node bootstrapping path so future work does not accidentally reintroduce a second implementation.

### 5. High: ghost-chain sync has no effective size cap once a shared ancestor is found or inferred

Current behavior:

- `request_blockchain_from_peer(...)` sends `GhostChainRequest(...)` for SPV/browser peers.
- `generate_ghost_chain(...)` only limits the response to roughly the last 10 blocks when the requester reports `block_id == 0` or a pre-genesis height.
- Otherwise it computes `last_shared_ancestor`, and if that returns `0`, it falls back to `max(block_id, genesis_block_id)`.
- It then emits every longest-chain block from `last_shared_ancestor + 1` through the current tip.

Why this matters:

- There is no protocol-level rule that limits browser/lite sync to about 100 blocks.
- If a browser comes back with a stale local tip, or if shared-ancestor detection lands too low, the peer can legitimately enqueue thousands of blocks from one ghost-chain response.
- This matches the reported symptom much more closely than the full-node header-sync path, which does have explicit chunking.

Recommended improvement:

- Add an explicit cap or paging mechanism to ghost-chain responses for SPV/browser sync.
- Treat "latest picture" sync as a bounded window instead of "everything since the inferred ancestor".
- Log the requested `block_id`, derived `last_shared_ancestor`, and generated ghost-chain length so oversized sync ranges are visible in production.

### 6. Medium: shared-ancestor fallback can widen sync ranges more than expected

Current behavior:

- `generate_last_shared_ancestor(...)` returns `0` when fork-id sampling cannot find a match.
- `generate_ghost_chain(...)` then converts that `0` into `max(block_id, genesis_block_id)` before walking forward to the current tip.

Why this matters:

- This avoids syncing from genesis, which is good, but it still means the response size is anchored to the requester's reported height rather than to a bounded sync window.
- If the requester has an old saved height, or if fork-id sampling fails during an otherwise normal reconnect, the resulting ghost-chain diff can still be very large.
- In practice, that makes browser backlog size depend on stale local persistence and ancestor-detection accuracy, not on a fixed SPV target size.

Recommended improvement:

- Keep the ancestor fallback, but combine it with a hard maximum ghost-chain span per response.
- Add diagnostics for the no-match path so it is possible to confirm whether large browser syncs are being driven by repeated fork-id misses.

## Suggested Implementation Order

1. Remove the `sender_only_key_list` correctness shortcut or guard it behind an explicit config.
2. Validate incoming ghost-chain structure before adding ghost blocks or triggering reorg.
3. Add a bounded or paged ghost-chain response so browser sync size is controlled even when the shared ancestor is old or uncertain.
4. Improve ghost-chain generation performance so correctness is no longer traded away for throughput.
5. Clean up stale Node-side protocol surface comments to make ownership obvious.

## Notes

- No code changes were made in this pass.
- The Node review for ghost chains mainly confirmed that runtime behavior is Rust-owned; the material issues are in the Rust core path, not in a separate Node implementation.
- The browser overfetch symptom is at least partly consistent with current design: the ghost-chain path has no built-in 100-block cap once sync starts from a nonzero height.