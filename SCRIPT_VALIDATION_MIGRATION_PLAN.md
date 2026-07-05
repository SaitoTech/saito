# Script Validation Migration Plan

**Goal:** Migrate script validation from the legacy JavaScript Scripting module to the Rust P2SH validator exposed through the WASM bridge.

**Status:** Architecture and migration planning only. No code changes in this document.

**Date:** 2026-07-05

---

## Executive Summary

The Saito network validates P2SH access scripts in Rust (`Script::validate` in `saito-core`, invoked from `Transaction::validate` for on-chain spends). JavaScript reaches this engine today only through `app.core.scripting.evaluate()` → WASM `evaluate_script()`, which passes **script JSON only** — no transaction, block, or P2SH index.

A separate **legacy off-chain access-control model** used by Archive, Vault, and Stack depends on a **`Scripting` module that is declared as a dependency but does not exist in this repository**. Those modules call a six-argument API:

```
evaluate(access_hash, access_script, access_witness, vars, request_tx, block)
```

That API expects **locking script and witness as separate payloads**, which differs from the Rust model where witness data is **embedded inside the script JSON** on opcode nodes and stripped before hashing.

Migration requires:

1. **Extending the WASM bridge** to accept optional transaction context (and optionally block / P2SH index).
2. **Introducing a shared JS adapter** that merges external witness into executable script JSON, verifies access hashes via Rust `hash()`, and calls the extended bridge.
3. **Migrating Archive, Vault, Stack, and NWASM (via Vault)** to the adapter and Rust-aligned script/witness formats.
4. **Leaving on-chain Rust validation, Rustscript, and Store paths unchanged** (they already use the new model).

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ON-CHAIN (consensus)                                                    │
│ Transaction::validate() → script.validate(tx, None, blockchain, idx)    │
│ Witness: embedded in txmsg.access_scripts[] JSON strings                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ WASM BRIDGE (partial context)                                           │
│ app.core.scripting.evaluate(scriptJson)                                 │
│   → evaluate_script(json) → script.validate(None, None, blockchain, None│
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ LEGACY OFF-CHAIN (broken — module missing)                              │
│ returnModule('Scripting').evaluate(hash, script, witness, vars, tx, blk)│
│ Used by: Archive, Vault, Stack                                          │
│ Witness: separate JSON array/object, not embedded in script             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Rust `Script::validate` signature

```rust
pub fn validate(
    &self,
    tx: Option<&Transaction>,
    blk: Option<&Block>,
    blockchain: Option<&Blockchain>,
    current_p2sh_idx: Option<usize>,
) -> u8  // 1 = pass, 0 = fail
```

### Context requirements by opcode (selected)

| Opcode | Requires `tx` | Requires `blockchain` | Requires `blk` | Witness location |
|--------|---------------|----------------------|----------------|------------------|
| CHECKSIG / CHECKMULTISIG | For `tx.*` msg refs | No | No | `witness.signatures` |
| CHECKHASH | No | No | No | `witness.input` |
| CHECKOWNNFT | **Yes** (signature check) | **Yes** | No | Reads utxokeys from **`script`**, not `witness` |
| CHECKOWNNFTWHERE | **Yes** | **Yes** | No | `witness.utxokey1/2/3` |
| CHECKPATHHOP | **Yes** (path verify) | No | No | `witness.hops` |
| IMPORTFIELD | **Yes** (sig verify) | No | No | `witness.{field}`, `witness.signature` |
| CHECKSENDER / CHECKRECIPIENT | **Yes** | No | No | N/A |
| CHECKOWN / CHECKOWNNFT* | **Yes** | **Yes** | No | varies |
| CHECKTIME | No | No | **Yes** | N/A |

**Important semantic gap:** Vault uses `CHECKOWNNFT` with utxokeys in external witness. Rust `CheckOwnNft` reads utxokeys from `context["script"]`, not `context["witness"]`, and ignores `nftid`. Vault standard keys must migrate to **`CHECKOWNNFTWHERE`** (Stack's pattern).

---

## WORK PACKAGE 1 — Extend the WASM Validation Bridge

### 1.1 Current API

#### JavaScript (`rust/saito-js/saito.ts`)

| Method | Signature | Behavior |
|--------|-----------|----------|
| `evaluate` | `(script: any) => Promise<number>` | Stringifies object if needed; returns `0` or `1` |
| `hash` | `(script: any) => string` | Blake3 hash of canonical locking script (witness stripped) |
| `address` | `(script: any) => string` | `00` + hash hex |

#### WASM (`rust/saito-wasm/src/saitowasm.rs`)

| Export | Signature | Behavior |
|--------|-----------|----------|
| `evaluate_script` | `(json: JsString) -> u8` | Parses script JSON; calls `validate(None, None, Some(blockchain), None)` |
| `get_script_hash` | `(json: JsString) -> String` | `Script::from_json().hash()` |
| `get_script_address` | `(json: JsString) -> String` | `Script::from_json().address_hex()` |

#### Rust core

| Symbol | Location | Role |
|--------|----------|------|
| `Script::validate` | `rust/saito-core/src/core/consensus/scripting/script.rs` | Canonical evaluator |
| On-chain caller | `rust/saito-core/src/core/consensus/transaction.rs:1110` | Full context: `Some(tx), None, Some(blockchain), Some(array_idx)` |

There is **no** `script.validate()` method exposed to JavaScript by name. The JS surface is `core.scripting.evaluate`.

### 1.2 Desired API

#### Recommended JavaScript API

```typescript
scripting: {
  evaluate: (
    script: object | string,
    context?: {
      tx?: Transaction | Uint8Array;   // prefer Transaction.serialize()
      blk?: Uint8Array;                // optional; rarely needed off-chain
      p2sh_idx?: number;               // default 0
    }
  ) => Promise<number>;

  hash: (script: object | string) => string;
  address: (script: object | string) => string;

  // Off-chain adapter for Archive/Vault/Stack legacy call shape
  evaluateAccess: (
    access_hash: string,
    access_script: string | object,
    access_witness: string | object,
    options?: {
      request_tx?: Transaction;
      vars?: object;                   // reserved; Rust uses context.variables sparingly
      p2sh_idx?: number;
    }
  ) => Promise<boolean>;
}
```

#### Recommended WASM export

```rust
pub async fn evaluate_script(
    json: JsString,
    tx_bytes: Option<Uint8Array>,   // Transaction::deserialize_from_net
    p2sh_idx: Option<u32>,          // default 0
    blk_bytes: Option<Uint8Array>,  // optional Block::deserialize_from_net (future)
) -> u8
```

#### Transaction context format: **serialized network bytes (`Uint8Array`)**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| Serialized bytes | **Recommended** | `WasmTransaction.deserialize` already exists; matches on-chain representation; no partial JSON tx schema to maintain |
| Transaction object (JS) | Supported at JS layer | JS adapter calls `tx.serialize()` before WASM |
| Transaction object (WasmTransaction) | Possible alternative | Could add overload accepting `&WasmTransaction` to avoid re-parse |
| JsValue | Avoid | Unstructured; hard to validate |
| JSON | Avoid | No stable Transaction JSON round-trip in WASM today |

**Block context:** defer unless CHECKTIME off-chain validation is required. Archive/Vault/Stack do not use CHECKTIME today.

### 1.3 Bridge evolution — file modifications

---

**FILE:** `rust/saito-wasm/src/saitowasm.rs`

**FUNCTION:** `evaluate_script` (extend); optionally add `evaluate_script_with_context`

**PURPOSE:** Deserialize optional tx bytes; pass `Some(&tx)` and `Some(p2sh_idx)` into `Script::validate`.

**RATIONALE:** Off-chain modules (Archive access checks, Vault file download, Stack post load) pass a **request transaction** so CHECKOWNNFTWHERE, CHECKPATHHOP, CHECKSENDER, and signature opcodes can verify `tx.signature` against NFT custody keys.

**RISK LEVEL:** medium

**DEPENDENCIES:** None (first in chain). Requires WASM rebuild and saito-js republish.

---

**FILE:** `rust/saito-js/saito.ts`

**FUNCTION:** `getCore().scripting.evaluate` (extend signature)

**PURPOSE:** Accept optional context object; serialize `Transaction` to `Uint8Array` via existing `serialize()`; forward to extended WASM export.

**RATIONALE:** Single JS entry point for all Rust validation; backward compatible if context is omitted.

**RISK LEVEL:** low

**DEPENDENCIES:** WASM export change.

---

**FILE:** `node/lib/saito/scripting-access.js` *(new shared module)*

**FUNCTION:** `mergeWitnessIntoScript`, `evaluateAccess`, `hashAccessScript`

**PURPOSE:** Shared adapter implementing legacy six-arg semantics on top of Rust:

1. Parse locking script and external witness.
2. Walk script tree; embed witness fragments on target opcode nodes (CHECKOWNNFTWHERE, CHECKPATHHOP, CHECKHASH, CHECKSIG, IMPORTFIELD, etc.).
3. Verify `app.core.scripting.hash(lockingScript) === access_hash`.
4. Call `app.core.scripting.evaluate(executable, { tx: request_tx })`.

**RATIONALE:** Archive, Vault, and Stack all use separate witness transport. Centralizing merge logic avoids three divergent implementations and matches Rust P2SH semantics.

**RISK LEVEL:** high (witness merge correctness for chained AND scripts)

**DEPENDENCIES:** Extended `evaluate`; opcode-level witness mapping spec (see WP2/WP3).

---

**FILE:** `node/mods/scripting/scripting.js` *(new thin module)*

**FUNCTION:** Module class registering `name = 'Scripting'`

**PURPOSE:** Satisfy existing `dependencies = ['Scripting']` declarations; delegate `evaluate`, `hash`, `canonicalize`, `generateWitnessFromScript` to shared adapter + `app.core.scripting`.

**RATIONALE:** Minimizes churn in Archive/Vault/Stack call sites during first migration phase; can deprecate module later.

**RISK LEVEL:** low

**DEPENDENCIES:** `scripting-access.js`; extended WASM bridge.

---

**FILE:** `rust/saito-wasm/pkg/**` and `rust/saito-js/lib/**` *(generated)*

**FUNCTION:** N/A

**PURPOSE:** Rebuild artifacts after WASM/TS changes.

**RATIONALE:** Binding sync.

**RISK LEVEL:** low

**DEPENDENCIES:** Source changes above.

---

### 1.4 Existing callers of `evaluate()` — impact analysis

| Caller | File | Current call | After bridge extension |
|--------|------|--------------|------------------------|
| Rustscript UI | `node/mods/rustscript/lib/ui/main.js:618` | `evaluate(scriptJson)` | **Unchanged** — no tx context needed for editor preview |
| Store listing script | `node/mods/store/lib/scripting.js:129` | `evaluate(executable)` with embedded witness | **Unchanged** — already embeds witness; skips evaluate when `msg` starts with `tx.` |
| Store fulfillment trace | `node/mods/store/lib/fulfillment-trace.js:388` | `evaluate(executable)` | **Unchanged** |
| Archive load filter | `archive.js:836` | `scripting_mod.evaluate(...)` 6-arg | **Update** — use adapter (WP2) or new Scripting shim |
| Archive delete gate | `archive.js:943` | same | **Update** (WP2) |
| Vault access file | `vault.js:140` | same | **Update** (WP3) |
| *(none)* | WASM `evaluate_script` | internal | **Extend** — optional tx bytes |

**Hash / address callers (unchanged):** Rustscript publish flows, Store helpers, Vault/Stack if migrated to `app.core.scripting.hash`.

---

## WORK PACKAGE 2 — Archive Module Migration

### 2.1 Current validation flow

Archive protects rows where `data.owner` (access hash) is set. Two call sites in `node/mods/archive/archive.js`:

#### A. `loadTransactions(obj)` (~794–860)

**Trigger:** `this.access_hash == 1` and row has `r.owner`.

**Inputs from request object:**

| Field | Source |
|-------|--------|
| `access_script` | `obj.access_script` or deserialized from archived tx `txmsg.access_script` |
| `access_hash` | `obj.access_hash` or from archived tx |
| `access_witness` | `obj.access_witness` |
| `request_tx` | `obj.request_tx` (5th arg to evaluate) |

**Gate:** Row included only if `access_hash === r.owner` AND `scripting_mod.evaluate(...)` is truthy.

**Entry points:**

- `handlePeerTransaction` archive load (~377)
- Vault file download → `loadTransactions` (~169 in vault.js)
- Stack private post load → `loadTransactions` with `access_witness`
- `loadTransactionsWithCallback` (~618)

#### B. `deleteTransaction(tx, obj)` (~918–964)

**Trigger:** Existing row has `owner` set.

**Gate:** Requires `access_script`, `access_witness`, matching `access_hash`; calls same `evaluate`; denies delete if false or Scripting missing.

### 2.2 Target validation flow

```
Request (access_hash, access_script, access_witness, request_tx)
  → scripting-access.mergeWitnessIntoScript(script, witness)
  → app.core.scripting.hash(lockingView) === access_hash
  → app.core.scripting.evaluate(executable, { tx: request_tx })
  → include row / allow delete if result === 1
```

Locking view for hash verification = script **without** embedded witness (Rust `Script::hash()` already strips witness recursively).

### 2.3 Semantic differences

| Aspect | Legacy (missing JS Scripting) | Rust validator |
|--------|------------------------------|----------------|
| Return value | boolean | `1` / `0` (adapter converts) |
| Hash algorithm | Unknown (module missing); orphan `SaitoScripting.generate` uses `app.crypto.hash` on buggy canonical JSON | Blake3 on Rust canonical JSON (sorted keys, witness stripped) |
| Witness placement | Separate argument | Embedded on opcode nodes |
| Transaction context | 5th parameter `request_tx` | Must be passed through WASM |
| Opcodes supported | Orphan class: CHECKSIG, CHECKMULTISIG, CHECKOWN, CHECKEXPIRY only | Full Rust opcode set including CHECKOWNNFTWHERE, CHECKPATHHOP, IMPORTFIELD, CHECKFIELD, etc. |
| Failure mode today | Scripting null → **fail closed** (row denied) | Same if adapter not installed |
| Error detail | console.warn in orphan class | Returns `0` only; no structured error (preserve fail-closed) |

**Migration note:** Existing archived `access_hash` values were computed with the missing module's hash. If historical hashes used a different canonicalization than Rust, **existing protected rows may fail validation** after migration. Audit production hash samples before cutover; may require re-indexing `owner` fields or dual-hash fallback during transition.

### 2.4 File modifications

---

**FILE:** `node/mods/archive/archive.js`

**FUNCTION:** `loadTransactions`

**PURPOSE:** Replace `returnModule('Scripting').evaluate(...)` with `evaluateAccess(...)` from shared adapter (or Scripting shim).

**RATIONALE:** Core read gate for all access-controlled archive rows.

**RISK LEVEL:** high

**DEPENDENCIES:** WP1 adapter; witness merge spec.

---

**FILE:** `node/mods/archive/archive.js`

**FUNCTION:** `deleteTransaction`

**PURPOSE:** Same replacement for delete authorization path.

**RATIONALE:** Must match load path semantics.

**RISK LEVEL:** high

**DEPENDENCIES:** WP1 adapter.

---

**FILE:** `node/lib/saito/scripting-access.js`

**FUNCTION:** `mergeWitnessIntoScript` — Stack array witness format

**PURPOSE:** Map legacy witness array `[{utxokey1,2,3}, {hops}, {duration, signature}]` onto nested CHECKOWNNFTWHERE / CHECKPATHHOP / IMPORTFIELD nodes in Stack access scripts.

**RATIONALE:** Stack passes witness to Archive via `loadTransactions`; Archive does not construct witness itself.

**RISK LEVEL:** high

**DEPENDENCIES:** WP1; Stack witness format documented in WP5.

---

**FILE:** `node/mods/stack/stack.js`

**FUNCTION:** `hashAccessScript`, `resolveStackAccessData`

**PURPOSE:** Switch from `scripting_mod.hash(canonicalize(...))` to `app.core.scripting.hash(scriptObject)`; optionally reformat witness to embedded form before sending to Archive.

**RATIONALE:** Stack is the primary producer of complex access scripts consumed by Archive. Hash must match Rust before Archive gate passes.

**RISK LEVEL:** high (hash migration / existing posts)

**DEPENDENCIES:** WP1 hash via Rust; may be scheduled with WP2.

---

## WORK PACKAGE 3 — Vault Module Migration

### 3.1 Current script and witness construction

#### Upload — `createVaultAddFileTransaction` (`vault.js:211–247`)

**Standard script:**

```json
{ "op": "CHECKOWNNFT", "nftid": "<nft_id>" }
```

**Hash:** `scripting_mod.hash(JSON.stringify(access_script_obj))`

**Stored in:** file tx `msg.access_script`, `msg.access_hash`; Archive row `owner = access_hash`.

**Custom script:** User JSON from `ScriptingKey` overlay (`lib/ui/overlays/scripting.js`); **bug:** string passed to `createVaultAddFileTransaction` is double-JSON-stringified (~232).

#### Download — `sendAccessFileRequest` (`vault.js:249–330`)

**Standard witness:**

```json
[{ "utxokey1": "...", "utxokey2": "...", "utxokey3": "..." }]
```

**Custom witness:** raw user JSON string from `witness.js` overlay.

**Server validation — `handlePeerTransaction` (`vault.js:125–153):**

```javascript
scripting_mod.evaluate(access_hash, access_script, access_witness, {}, tx, null)
```

Uses the **vault access file request transaction** as `request_tx` for signature verification.

### 3.2 Comparison with Rust P2SH format

| Aspect | Vault today | Rust P2SH (canonical) |
|--------|-------------|----------------------|
| Script opcode | `CHECKOWNNFT` + `nftid` | Should use `CHECKOWNNFTWHERE` + `where` clauses (see Stack) |
| Utxokeys | External witness array | `witness.utxokey1/2/3` on CHECKOWNNFTWHERE node |
| `nftid` in script | Present | Ignored by Rust `CheckOwnNft` |
| Hash input | Raw `JSON.stringify` | Canonical JSON, witness stripped |
| Witness transport | Separate `access_witness` field | Embedded in script for evaluation; may remain separate on wire if adapter merges |
| On-chain P2SH | Not used for vault files | `txmsg.access_scripts[]` with embedded witness |

### 3.3 Non-compliance inventory

1. **`CHECKOWNNFT` with external utxokeys** — Rust reads utxokeys from `script`, not `witness`; will always fail unless script is changed.
2. **Array-shaped witness** — Rust expects object fields on opcode `witness`, not top-level array.
3. **`scripting_mod.hash` on non-canonical JSON** — may not match Rust hash used for verification.
4. **Custom script double-encoding** — `JSON.stringify` of already-string script (~232).
5. **`generateWitnessFromScript` missing** — witness overlay cannot prepopulate templates.
6. **No local evaluate before send** — custom key path only hashes; invalid witness reaches server.

### 3.4 Required format changes

#### Script hashes

**Must change** for standard vault keys when switching to `CHECKOWNNFTWHERE` locking scripts. Existing archived files keyed by old hash **will not match** new scripts unless dual-validation or re-upload migration is planned.

#### Unlocking scripts

Off-chain vault access is **not** P2SH spend unlocking. No `txmsg.access_scripts[]` change for vault file retrieval. **No on-chain unlocking script change** unless vault later moves to P2SH-locked slips.

#### Witness insertion (target)

Standard vault key after migration:

```json
{
  "op": "CHECKOWNNFTWHERE",
  "where": [
    { "field": "type", "operator": "==", "value": "vault" },
    { "field": "creator", "operator": "==", "value": "<nft_creator_pubkey>" }
  ],
  "witness": {
    "utxokey1": "...",
    "utxokey2": "...",
    "utxokey3": "..."
  }
}
```

Wire format may still send `access_script` (locking) and `access_witness` separately; adapter merges before evaluate.

#### Signatures

`verify_owner_tx_signature(tx, custody_public_key)` in Rust requires the **request transaction** (`vault access file` tx) to carry a valid signature from the NFT custody slip owner. **`request_tx` must be passed to WASM evaluate** — already intended in Vault's evaluate call.

### 3.5 File modifications

---

**FILE:** `node/mods/vault/vault.js`

**FUNCTION:** `createVaultAddFileTransaction`

**PURPOSE:** Replace `CHECKOWNNFT` with `CHECKOWNNFTWHERE` template; use `app.core.scripting.hash`; fix custom script string parsing before stringify.

**RATIONALE:** Align locking script with Rust semantics; fix double-encoding bug.

**RISK LEVEL:** high (breaking hash for existing vault files)

**DEPENDENCIES:** WP1 hash; creator pubkey available at mint time.

---

**FILE:** `node/mods/vault/vault.js`

**FUNCTION:** `sendAccessFileRequest`

**PURPOSE:** Build Rust-compatible witness; optional client-side `evaluateAccess` preflight; use `app.core.scripting.hash`.

**RATIONALE:** Prevent denied access after network round-trip.

**RISK LEVEL:** medium

**DEPENDENCIES:** WP1 adapter.

---

**FILE:** `node/mods/vault/vault.js`

**FUNCTION:** `handlePeerTransaction` (`vault access file`)

**PURPOSE:** Replace `scripting_mod.evaluate` with `evaluateAccess` + extended Rust validate.

**RATIONALE:** Server-side gate before Archive load.

**RISK LEVEL:** high

**DEPENDENCIES:** WP1, WP2 Archive path.

---

**FILE:** `node/mods/vault/lib/ui/overlays/scripting.js`

**FUNCTION:** `ScriptingKey.attachEvents`

**PURPOSE:** Hash via `app.core.scripting.hash`; default template aligned with Rust CHECKHASH schema (`witness.input`).

**RATIONALE:** Custom crystal keys must hash identically to server verification.

**RISK LEVEL:** medium

**DEPENDENCIES:** WP1.

---

**FILE:** `node/mods/vault/lib/ui/overlays/witness.js`

**FUNCTION:** `Witness.render`

**PURPOSE:** Replace `generateWitnessFromScript` with adapter helper that emits Rust-shaped witness JSON for CHECKHASH / CHECKOWNNFTWHERE templates.

**RATIONALE:** UX for custom keys.

**RISK LEVEL:** low

**DEPENDENCIES:** `scripting-access.js` witness templates.

---

**FILE:** `node/mods/vault/lib/ui/overlays/file-upload.js`

**FUNCTION:** `mintNFT` callback path

**PURPOSE:** Pass script object (not pre-stringified) to `createVaultAddFileTransaction`.

**RATIONALE:** Fix double-encoding for custom scripts.

**RISK LEVEL:** low

**DEPENDENCIES:** `createVaultAddFileTransaction` fix.

---

**FILE:** `node/mods/vault/lib/ui/overlays/load-nfts.js`

**FUNCTION:** Download click handlers

**PURPOSE:** Update comments/UX; jade keys still require utxokey witness under CHECKOWNNFTWHERE model.

**RATIONALE:** Documentation accuracy; no behavioral stub.

**RISK LEVEL:** low

**DEPENDENCIES:** `sendAccessFileRequest` changes.

---

## WORK PACKAGE 4 — NWASM Migration

### 4.1 Audit findings

NWASM (`node/mods/nwasm/nwasm.js`) has **no direct** calls to `Scripting`, `validate`, or `app.core.scripting`.

**Indirect dependency chain:**

```
NWASM loadRomFile (vault NFT ROM)
  → vault_mod.sendAccessFileRequest(vault_data, callback)   [nwasm.js:580–593]
    → Vault Scripting evaluate / hash                          [WP3]
      → Archive loadTransactions on success                  [WP2]
```

**Other NWASM notes (out of scope for scripting migration unless desired):**

- Borrow/loan UI in `lib/ui/main.js` references `item.num == 0` but `createItem` never sets loan fields — stub only.
- Peer ROM load sends `library collection` with empty callback — not scripting-related.
- ROM integrity: XOR encryption + archive storage only; no script validation.

### 4.2 Required modifications

NWASM migration is **fully satisfied by WP3 (Vault)**. One optional NWASM-specific change:

---

**FILE:** `node/mods/nwasm/nwasm.js`

**FUNCTION:** `loadRomFile` (vault branch ~573–593)

**PURPOSE:** Pass `file_access_script` from NFT metadata into `vault_data` if present (crystal-key vault ROMs); surface evaluate errors to user.

**RATIONALE:** Custom vault scripts on NFT-bound ROMs may require witness overlay path already implemented in Vault UI.

**RISK LEVEL:** low

**DEPENDENCIES:** WP3 Vault migration.

---

**FILE:** `node/mods/nwasm/nwasm.js`

**FUNCTION:** `dependencies`

**PURPOSE:** No change required — `'Vault'` dependency remains correct.

**RATIONALE:** Scripting access flows through Vault.

**RISK LEVEL:** n/a

**DEPENDENCIES:** None.

---

### 4.3 Chained script execution, witness, context, transaction availability

| Concern | NWASM impact |
|---------|--------------|
| Chained script execution | Only via Vault custom scripts (CHECKHASH, AND trees); merged in adapter |
| Witness construction | Provided by Vault `sendAccessFileRequest` or witness overlay |
| Validation context | `vault access file` tx must reach Rust evaluate |
| Transaction availability | NWASM callback receives decrypted ROM bytes after Vault+Archive succeed — no change to tx pipeline |

---

## WORK PACKAGE 5 — Compatibility Audit

### 5.1 Search results classification

#### A. `script.validate(` — Rust only

| Location | Classification | Why |
|----------|----------------|-----|
| `rust/saito-core/.../transaction.rs:1110` | **Leave unchanged** | Production on-chain P2SH gate |
| `rust/saito-core/.../scripting/script.rs` (definition + tests) | **Leave unchanged** | Core implementation |
| `rust/saito-wasm/.../saitowasm.rs:877` | **Migrate immediately** | Extend with tx context (WP1) |
| Opcode `::validate` in `opcodes/*.rs` | **Leave unchanged** | Internal dispatch |

#### B. `app.core.scripting.evaluate` / WASM path

| Location | Classification | Why |
|----------|----------------|-----|
| `rust/saito-js/saito.ts:526–530` | **Migrate immediately** | Extend API (WP1) |
| `node/mods/rustscript/lib/ui/main.js:618` | **Leave unchanged** | Works without tx context |
| `node/mods/store/lib/scripting.js:129` | **Leave unchanged** | Already Rust-aligned |
| `node/mods/store/lib/fulfillment-trace.js:388` | **Leave unchanged** | Same |

#### C. `returnModule('Scripting')` — legacy module API

| Location | Function | Classification | Why |
|----------|----------|----------------|-----|
| `node/mods/archive/archive.js:833,940` | load/delete gates | **Migrate immediately** | Broken today; WP2 |
| `node/mods/vault/vault.js:130,215,253` | access/hash | **Migrate immediately** | Broken today; WP3 |
| `node/mods/vault/lib/ui/overlays/scripting.js:20` | hash | **Migrate immediately** | WP3 |
| `node/mods/vault/lib/ui/overlays/witness.js:38` | generateWitnessFromScript | **Migrate immediately** | WP3 |
| `node/mods/stack/stack.js:673,839` | hash/canonicalize | **Migrate immediately** | WP2/WP5 — hash must match Rust |

#### D. `new Scripting` / `Scripting` class

| Location | Classification | Why |
|----------|----------------|-----|
| `node/lib/saito/ui/saito-scripting/saito-scripting.js` | **Migrate later** (deprecate/remove) | Orphan dead code; superseded by Rust. Keep until all callers migrated, then delete |
| `node/mods/vault/.../file-upload.js` `ScriptingKeyOverlay` | **Leave unchanged** | UI class name only; not Scripting module |
| `node/mods/explorer/lib/address-index.js` `isScriptingPublicKey` | **Leave unchanged** | P2SH address detection (hex prefix `00`); unrelated to validator |
| `node/mods/rustscript/.../welcome.template.js` | **Leave unchanged** | Marketing copy |

#### E. `scripting_mod.evaluate(` six-arg pattern

All instances in Archive and Vault — **migrate immediately** (WP2, WP3).

#### F. Unrelated `validate(` matches

| Location | Classification | Why |
|----------|----------------|-----|
| `Transaction::validate`, `Block::validate`, `Slip::validate`, `GoldenTicket::validate` | **Leave unchanged** | Consensus, not scripting |
| `node/mods/mixin/...` WAValidator | **Leave unchanged** | Third-party address validation |
| `node/mods/nwasm/web/n64wasm.js` WebGL validate | **Leave unchanged** | Emulator |
| `node/mods/rustscript/lib/ui/script_validate.js` | **Leave unchanged** | UI structural validation only |
| `node/web/saito/saito.js` bundle | **Leave unchanged** | Regenerated from sources |

#### G. `app.core.scripting.hash` / `.address` (already Rust)

Rustscript, Store — **leave unchanged**.

---

## Witness Merge Specification (cross-cutting)

Required for adapter implementation. External witness → embedded target:

| Legacy witness shape | Target opcode | Embedded witness fields |
|---------------------|---------------|-------------------------|
| `{ utxokey1, utxokey2, utxokey3 }` | `CHECKOWNNFTWHERE` | same keys on node.witness |
| `{ hops: [...] }` | `CHECKPATHHOP` | `witness.hops` |
| `{ duration, signature }` | `IMPORTFIELD` | `witness.duration`, `witness.signature` |
| `{ input: "..." }` | `CHECKHASH` | `witness.input` |
| `{ signature }` or `{ signatures: [] }` | `CHECKSIG` / `CHECKMULTISIG` | same |
| Array of above objects | Walk `AND` tree in order | Map index 0 → first requiring witness opcode, etc. |

Stack's array witness format must follow deterministic opcode-tree walk order matching script definition in `node/mods/stack/lib/access/access-scripts.js`.

---

## Implementation Order

Recommended sequence minimizing broken dependencies:

| Phase | Work | Packages | Exit criteria |
|-------|------|----------|---------------|
| **1** | Extend WASM `evaluate_script` with optional tx bytes + p2sh_idx | WP1 | Unit test: CHECKOWNNFTWHERE passes with tx + blockchain + embedded witness |
| **2** | Extend `saito-js` `scripting.evaluate` context parameter | WP1 | JS can pass `Transaction.serialize()` |
| **3** | Implement `scripting-access.js` (merge + evaluateAccess + hash) | WP1 | Rustscript-style embedded witness tests pass |
| **4** | Add thin `Scripting` module shim | WP1 | `returnModule('Scripting')` non-null |
| **5** | Migrate Stack `hashAccessScript` to Rust hash | WP2/WP5 | New posts get Rust-compatible access_hash |
| **6** | Migrate Archive load/delete gates | WP2 | Private Stack posts load from archive |
| **7** | Migrate Vault script templates to CHECKOWNNFTWHERE | WP3 | New vault uploads hash + validate |
| **8** | Migrate Vault download + server validate + UI overlays | WP3 | NWASM vault ROM load works end-to-end |
| **9** | NWASM vault_data passthrough (optional) | WP4 | Crystal-key vault ROMs load |
| **10** | Remove/archive `SaitoScripting` orphan | WP5 | No references remain |
| **11** | Hash migration decision for legacy content | WP2/WP3 | Document re-upload or dual-hash policy |

**Parallelization:** Phases 5–7 can begin after phase 4 if feature-flagged. Phase 6 depends on 3–5. Phase 8 depends on 6–7.

---

## Risk Register

| Risk | Level | Mitigation |
|------|-------|------------|
| Historical `access_hash` incompatible with Rust canonical hash | **High** | Sample production hashes; dual-validation window or content re-index |
| Vault CHECKOWNNFT → CHECKOWNNFTWHERE breaks existing files | **High** | Version field in vault msg; support both opcodes during transition |
| Witness merge bugs on chained Stack scripts | **High** | Port Rust script.rs tests to JS adapter; integration tests per template in `access-scripts.js` |
| Missing `request_tx` in Archive peer load | **Medium** | Ensure Vault/Stack always set `obj.request_tx` |
| CHECKOWNNFT Rust reads script not witness | **Medium** | Do not use CHECKOWNNFT for new vault keys; document opcode quirk |
| WASM rebuild / bundle drift | **Low** | `./scripts/build_link_npms.sh` in CI |

---

## Future Implementation Change Format

When implementation begins, **every code change** must be documented as:

```
FILE
<path>

LINES
<start>-<end>

OLD CODE
<exact existing code>

REPLACEMENT CODE
<exact new code>
```

This plan intentionally omits code blocks of that form. The modifications listed above are the complete inventory to be executed through that format.

---

## Appendix A — Key file index

| Path | Role |
|------|------|
| `rust/saito-core/src/core/consensus/scripting/script.rs` | `Script::validate`, hash, resolve_ref |
| `rust/saito-core/src/core/consensus/transaction.rs` | On-chain P2SH validation |
| `rust/saito-core/src/core/consensus/scripting/opcodes/*.rs` | Opcode validators |
| `rust/saito-wasm/src/saitowasm.rs` | WASM exports |
| `rust/saito-wasm/src/wasm_transaction.rs` | Tx serialize/deserialize for bridge |
| `rust/saito-js/saito.ts` | JS core scripting API |
| `node/lib/saito/ui/saito-scripting/saito-scripting.js` | Orphan legacy evaluator |
| `node/mods/archive/archive.js` | Archive access gates |
| `node/mods/vault/vault.js` | Vault script lifecycle |
| `node/mods/stack/stack.js` | Stack access hash + witness |
| `node/mods/stack/lib/access/access-scripts.js` | Stack script templates |
| `node/mods/nwasm/nwasm.js` | Vault-indirect ROM access |
| `node/mods/rustscript/` | Reference new-model implementation |
| `node/mods/store/lib/scripting.js` | Reference P2SH witness merge |

## Appendix B — Glossary

| Term | Meaning |
|------|---------|
| Locking script | Script JSON with all `witness` fields removed (used for hash) |
| Executable script | Locking script with witness embedded for evaluation |
| access_hash | Blake3 hash of locking script stored as Archive row `owner` |
| request_tx | Transaction presented as proof (e.g. vault access file request) |
| P2SH index | Index among `from` slips with `public_key[0] == 0x00` |
