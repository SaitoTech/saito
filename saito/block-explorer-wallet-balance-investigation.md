# Block Explorer Wallet Balance Investigation

**Date:** 2026-06-12  
**Symptom reported:** When the blockchain loads from disk (`blockchain.is_loading`), the Block Explorer does not show updated wallet balances.

**Scope:** Classic Block Explorer module (`node/mods/explorer/explorer.js`), which is the active explorer in `node/config/modules.config.js`. The React-based `explorerc` module exists but is not enabled in the default module list.

---

## 1. What the "Check balance (by wallet)" search does

### UI entry point

The index page renders a form in `returnInputBalanceHTML()`:

- **Form action:** `GET /explorer/balance`
- **Query parameter:** `pubkey` (the wallet public key entered by the user)

The balance result page (`returnBalanceHTML`) renders placeholder values (`-`) for Saito and Nolan, then runs client-side JavaScript:

```javascript
checkBalance("<pubkey>");
```

### Client-side data fetch

`node/mods/explorer/web/utils.js`:

| Function | Behavior |
|----------|----------|
| `checkBalance(pubkey)` | Calls `balanceAPI()` (see bug below), parses the response into a map of pubkey → nolan total, and fills `.balance-saito` / `.balance-nolan` if the searched key is present. |
| `balanceAPI(pubkey)` | `fetch('/balance/' + pubkey)` — returns raw text, not JSON. |
| `checkAllBalance()` | Same pipeline with an empty key → `fetch('/balance/')` for all holders. |

**Response format:** The `/balance/` endpoint returns a text snapshot (not JSON):

1. First line: snapshot filename (`<timestamp>-<block_id>-<block_hash>.snap`)
2. Following lines: one slip per line — `pubkey block_id tx_ordinal slip_index amount slip_type`

`balanceAPI` aggregates column 4 (`amount`) per pubkey (nolan units), then `checkBalance` divides by 100,000,000 for Saito display.

### Server endpoint

`node/lib/saito/core/server.ts` registers:

```
GET /balance/:keys?
```

- Keys are semicolon-separated in the path (e.g. `/balance/key1;key2`).
- 66-character hex keys are converted to base58 before lookup.
- Handler calls `S.getInstance().getBalanceSnapshot(keys)` and returns `snapshot.toString()`.

### Rust / WASM source of truth

`saito-wasm` → `get_balance_snapshot` → `Blockchain::get_balance_snapshot` in `rust/saito-core/src/core/consensus/blockchain.rs`.

**There is no separate on-disk balance cache read by the explorer.** Each `/balance/` request builds a `BalanceSnapshot` on the fly from the in-memory **`blockchain.utxoset`** (the live UTXO set).

Filtering applied when building the snapshot:

- Only spendable UTXO entries (`utxoset` value is `true`)
- Skips `SlipType::Bound` slips
- Skips slips where `slip.block_id < latest_block_id - genesis_period` (pruning window)
- If specific keys were requested, only matching pubkeys are included; empty key list = full snapshot (within the pruning window)

---

## 2. How the balance data is populated (not a separate explorer cache)

The explorer does **not** read from a dedicated balance archive or data-cache module. Balance data comes from the core UTXO set, which is rebuilt as blocks are processed.

### In-memory UTXO set (`blockchain.utxoset`)

Populated during chain reorganization when blocks are added to the longest chain:

```
add_block → validate → wind_chain → block.on_chain_reorganization(&mut utxoset, true)
```

Each transaction's `on_chain_reorganization` adds output slips and marks input slips spent in `utxoset`.

### Disk load path (`blockchain.is_loading`)

During node startup, `ConsensusThread::on_init` (`rust/saito-core/src/core/consensus_thread.rs`):

1. Sets `blockchain.is_loading = true`, `blockchain.is_loaded = false`
2. Loads block files from `./data/blocks/` in batches (up to 10,000 per batch)
3. Sorts queued blocks by block id
4. Calls `blockchain.add_blocks_from_mempool(...)` for each batch
5. On completion: `is_loading = false`, `is_loaded = true`

UTXO updates happen inside `wind_chain` as each batch is processed — the same path used for live blocks.

### Related on-disk artifacts (not used by explorer)

These are written by the core for other purposes and are **not** queried by the explorer balance search:

| Artifact | Writer | Path |
|----------|--------|------|
| Issuance archive snapshots | `Blockchain::write_issuance_file` during `add_block_success` when `issuance_writing_block_interval` is met | `./data/issuance/archive/block_<timestamp>_<hash>_<id>.issuance` |
| Issuance file (latest) | Same mechanism / CLI tools | `./data/issuance.file` |
| UTXO state file | `Storage::write_utxoset_to_disk` (tests / tooling) | `./data/issuance/utxodata` |
| Checkpoint files | Loaded during disk import | `./data/checkpoints/<id>-<hash>.chk` |

The `archive` Saito module (`node/mods/archive/archive.js`) is unrelated to wallet balance serving.

---

## 3. Is the population logic running? Should it work?

**Yes — the UTXO population logic runs during disk load and should produce correct balances once loading completes.**

Tracking chain:

| Stage | Component | What it does |
|-------|-----------|--------------|
| Startup | `initS()` / WASM `initialize()` | Awaits `consensus_thread.on_init()` — **full disk load finishes here** |
| Per batch | `load_blocks_from_disk` | Deserializes blocks into mempool queue (`force_loaded = true`) |
| Per batch | `add_blocks_from_mempool` | Sorts by block id, calls `add_block` for each |
| Per block (longest chain) | `wind_chain` | Updates blockring, wallet, and **`utxoset`** |
| Per block (longest chain) | `add_block_success` | May write issuance archive; triggers confirmation callbacks |
| HTTP query | `get_balance_snapshot` | Reads current `utxoset` under a blockchain read lock |

### Node.js startup ordering (important)

In `node/apps/server/index.ts`:

```
await initS(...)        // includes full disk load (is_loading true → false)
await app.init()        // web server starts listening (explorer becomes reachable)
S.getInstance().start() // timer / event loops
```

The explorer HTTP server starts **after** disk loading completes. Under normal node startup, users should not be able to query `/balance/` while `is_loading` is still true.

`is_loading` is only set to `true` in one place in the entire codebase: `consensus_thread.rs` during `on_init`.

---

## 4. Findings: why balances may appear wrong or stale

### Primary finding: no separate cache — live UTXO set is the data source

The explorer balance search is wired correctly at the server level to the live UTXO set. There is no background job or archive file that the explorer should be reading but isn't. If balances are wrong, the issue is either (a) `utxoset` is incomplete or filtered at query time, or (b) the client/server request path has a defect.

### Finding A — `is_loading` and lock contention (if queried during load)

`on_init` holds **`blockchain_lock` write** and **`config_lock` write** for the entire disk-load loop. `get_balance_snapshot` needs read locks on both.

If anything could call `/balance/` while `is_loading` is true (non-standard startup, future parallel init, or native node with concurrent HTTP), those requests would **block** until loading finishes. The UI would show `-` (initial placeholders) until `checkBalance` completes or times out.

Under the current node startup sequence this should not occur in practice because the web server starts after `initS()` returns.

### Finding B — client bug in `checkBalance` (confirmed)

In `node/mods/explorer/web/utils.js`:

```javascript
async function checkBalance(pubkey = '') {
  if (pubkey) {
    let balance = await balanceAPI();  // BUG: pubkey not passed
```

`balanceAPI(pubkey)` supports filtering via `/balance/<pubkey>`, but `checkBalance` always fetches `/balance/` (full snapshot). This still works if the full snapshot contains the searched key, but:

- Forces a full UTXO scan on every single-wallet lookup (expensive on large chains)
- If the server returned a truncated or empty response under load/error, the key would not appear and the UI would stay at `-`

**Recommended fix (not applied in this report):** `let balance = await balanceAPI(pubkey);`

### Finding C — genesis-period pruning filter at query time

`get_balance_snapshot` excludes slips with `block_id < latest_block_id - genesis_period`. This is intentional pruning behavior, not a loading bug. Balances that depend only on very old slips outside the window will show as zero in the explorer even when historically correct.

### Finding D — fast-path `add_block` may skip UTXO updates for out-of-order blocks

In `blockchain.add_block`, when the blockring is non-empty and `block_id < get_latest_block_id()`:

```rust
self.add_block_success(block_hash, ...).await;
return AddBlockResult::BlockAddedSuccessfully(..., false /* not in longest_chain */, ...);
```

This path **skips `wind_chain`** and therefore **does not call `on_chain_reorganization` on the UTXO set**. Blocks loaded from disk are sorted by id before insertion, so sequential startup load should not hit this path often. It could matter for fork blocks or out-of-order file lists.

### Finding E — issuance archive is populated but unused by explorer

`write_issuance_file` runs during `add_block_success` on the longest chain when `issuance_writing_block_interval` blocks have elapsed (default: 10 in config templates). These `./data/issuance/archive/` files are a point-in-time export of `get_utxoset_data()`, not the explorer's data source. If someone expected the explorer to read these archives during load, that expectation does not match the implementation.

---

## Summary table

| Question | Answer |
|----------|--------|
| What does the search field query? | Client `fetch('/balance/' + pubkey)` → server `getBalanceSnapshot` → live `blockchain.utxoset` |
| Is there a separate data-cache/archive for explorer balances? | **No.** Issuance archive files exist but are not used by the explorer. |
| Is UTXO population running during disk load? | **Yes**, via `add_blocks_from_mempool` → `wind_chain` → `on_chain_reorganization` |
| Should it work after load completes? | **Yes**, assuming `utxoset` was built correctly and slips are within the genesis-period window |
| Why might it fail during `is_loading`? | Under normal node startup the explorer is not yet reachable; if queried concurrently, write-lock blocks reads and UI shows `-` |
| Most likely actionable bugs | (1) `checkBalance` not passing pubkey to `balanceAPI`; (2) possible fast-path skip of UTXO updates for out-of-order blocks |

---

## Key file references

| File | Role |
|------|------|
| `node/mods/explorer/explorer.js` | Explorer routes, balance page HTML |
| `node/mods/explorer/web/utils.js` | `checkBalance`, `balanceAPI` client logic |
| `node/lib/saito/core/server.ts` | `GET /balance/:keys?` HTTP handler |
| `rust/saito-js/saito.ts` | `getBalanceSnapshot()` JS wrapper |
| `rust/saito-wasm/src/saitowasm.rs` | WASM `get_balance_snapshot` export |
| `rust/saito-core/src/core/consensus/blockchain.rs` | `get_balance_snapshot`, `get_utxoset_data`, `write_issuance_file` |
| `rust/saito-core/src/core/consensus_thread.rs` | Disk load, `is_loading` flag |
| `rust/saito-core/src/core/util/balance_snapshot.rs` | Snapshot text format |
| `node/apps/server/index.ts` | Startup order (`initS` before web server) |

---

## Recommended next steps (for implementers)

1. Fix `checkBalance` to pass `pubkey` into `balanceAPI(pubkey)` so lookups are filtered server-side.
2. Reproduce with logging: compare `utxoset.len()` and `get_balance_snapshot` row count after disk load vs. a known-good pubkey balance from `app.wallet.getBalance()` for the local node key.
3. If balances are still wrong after load (not during), inspect whether affected blocks were added via the `block_id < get_latest_block_id()` fast path without `wind_chain`.
4. If live progress during long disk loads is required in the future, release the blockchain write lock between batches in `on_init` so `/balance/` can serve partial UTXO state.
