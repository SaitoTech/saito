# Lite Block Generation And Sync Review

## Scope

This review covers lite-block generation, serving, and sync-related behavior across both Rust and Node.

Primary Rust sources:

- `rust/saito-core/src/core/consensus/block.rs`
- `rust/saito-core/src/core/routing/blockchain_sync_state.rs`
- `rust/saito-core/src/core/routing/peers/peer.rs`
- `rust/saito-rust/src/network_controller.rs`
- `rust/saito-js/lib/block.ts`
- `rust/saito-wasm/src/wasm_block.rs`

Primary Node sources:

- `node/lib/saito/core/server.ts`
- `node/lib/saito/core/storage-core.ts`
- `node/lib/saito/blockchain.ts`

The generation logic itself is Rust-owned. Node mainly advertises lite sync endpoints and serves lite blocks through the `saito-js` / wasm wrapper layer.

## Findings

### 1. High: `generate_lite_block(...)` only partially collapses contiguous SPV runs

Current behavior:

- Non-relevant transactions are replaced with SPV placeholders with `txs_replacements = 1`.
- A single `while` pass then merges adjacent SPV placeholders only when the two neighboring entries have equal replacement counts.
- On a successful merge, the right entry is removed.
- On a mismatch, the loop advances by two.

Why this matters:

- Long runs of hidden transactions are not fully canonicalized.
- Example: four consecutive hidden transactions become `[2, 1, 1]` instead of `[2, 2]` after one pass.
- That means lite-block size is larger than necessary, and the final compressed transaction structure depends on this one-pass loop rather than on a clear canonical reduction rule.
- Because lite blocks are later used for merkle-root-sensitive behavior, this compaction step should be especially deterministic and easy to reason about.

Recommended improvement:

- Rework compaction into a deterministic multi-pass or stack-based reducer that keeps merging until no eligible adjacent SPV pairs remain.
- Add tests for long contiguous SPV runs, especially 4, 8, and mixed visible/hidden transaction layouts.

### 2. High: lite-block endpoints allow caller-supplied public keys even when the caller is not authenticated as that peer

Current behavior:

- Rust route: `network_controller.rs` accepts `/lite-block/:hash/:key?` and, if the key is not an active peer, uses `vec![key]` as the requested key list.
- Node route: `server.ts` does the same for `/lite-block/:bhash/:pkey?`.
- In both cases, the caller can probe any public key without first proving ownership of the websocket peer associated with that key.

Why this matters:

- The response reveals whether a block contains transactions relevant to an arbitrary address set, or directly returns those transactions if it does.
- That creates a privacy leak and makes the endpoint useful for address-interest probing, not just for syncing an authenticated lite peer.
- The exposure exists in both the native Rust HTTP server and the Node/Express server.

Recommended improvement:

- Tie lite-block key selection to the authenticated peer session instead of trusting a URL parameter by default.
- If public query-by-key is intentionally supported, make that an explicit opt-in configuration and document the privacy tradeoff.

### 3. Medium: lite blocks are still serialized and surfaced as full blocks

Current behavior:

- `Block::new()` defaults `block_type` to `BlockType::Full`.
- `generate_lite_block(...)` never changes `block.block_type`.
- Rust HTTP serving uses `serialize_for_net(BlockType::Full)` for `/lite-block/...`.
- Node serving uses `liteblock.serialize()`, which flows from the same Rust-generated lite block with a default full block type.

Why this matters:

- The object is semantically a filtered/pruned lite representation, not a genuine full block.
- Treating it as full on the wire makes downstream behavior rely on implicit knowledge of SPV placeholder transactions rather than on an explicit block type.
- That increases the chance of future feature regressions when code assumes `Full` means "contains the complete original transaction set".

Recommended improvement:

- Decide on one explicit network meaning for lite blocks.
- Either:
  - mark generated lite blocks as `Pruned` (or another explicit lite-capable type), or
  - document why full-type serialization is required and add tests that pin the behavior.

### 4. Medium: disk lookup for lite-block serving uses substring filename matching instead of exact block file resolution

Current behavior:

- Rust server scans `data/blocks` and selects files whose filename `contains(block_hash)`.
- Node server does the same with `filename.includes(bsh)`.

Why this matters:

- It is a brittle lookup rule.
- It works only because current filenames happen to embed the full hash in a predictable way.
- Any future file naming drift, auxiliary files, or malformed filenames can cause the wrong block file to match.

Recommended improvement:

- Resolve the exact expected block filename instead of doing substring scans.
- If scanning is unavoidable, validate the filename format and match the full hash token exactly.

### 5. Medium: lite-block generation does repeated linear membership checks against `Vec` key lists

Current behavior:

- `generate_lite_block(...)` checks each input and output slip with `keylist.contains(...)`.
- That is repeated across every transaction in the block.
- Node routes inherit the same behavior because they eventually call the same Rust `generate_lite_block(...)` implementation through wasm/js.

Why this matters:

- Request cost scales with both transaction count and watched-key count.
- This is on the request path for both the Rust HTTP server and the Node HTTP server.
- Larger watched key lists will make lite-block serving progressively more expensive.

Recommended improvement:

- Convert the incoming key list to a `HashSet` once per request before scanning transactions.
- Keep the external API unchanged and optimize internally.

### 6. Low: Node lite-block route comments have drifted from the current runtime contract

Current behavior:

- `server.ts` still contains a comment describing `hasKeylistTransactions` as returning `1 / 0 / -1`.
- The active Rust/wasm/js path is boolean all the way through:
  - Rust `Block::has_keylist_txs(...) -> bool`
  - wasm `has_keylist_txs(...) -> bool`
  - `rust/saito-js/lib/block.ts` returns `boolean`

Why this matters:

- The runtime behavior is fine.
- But the stale comment makes the server fast-path logic harder to trust and easier to accidentally break in future edits.

Recommended improvement:

- Update the comment to match the real boolean behavior, or remove it if the history is no longer useful.

## Suggested Implementation Order

1. Fix SPV compaction so lite-block reduction is deterministic and complete.
2. Decide whether caller-supplied lite-block key queries are allowed; if not, bind them to authenticated peer state.
3. Make lite-block wire semantics explicit instead of inheriting `BlockType::Full` by default.
4. Replace substring-based block-file lookup with exact resolution.
5. Convert membership tests to a set-based lookup during lite-block generation.
6. Clean up stale Node comments/documentation around the serving path.

## Notes

- No code changes were made in this pass.
- For lite-block behavior, Node is mostly a serving and integration layer; the generation algorithm and most substantive correctness questions remain in the Rust core implementation.