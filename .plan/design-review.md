# Saito Codebase Design Review

**Date:** 2025-01-XX  
**Scope:** Full-stack review covering `rust/` (saito-core, saito-wasm, saito-rust, saito-js) and `node/` (host, modules, lib)  
**Focus areas:** Readability, Maintainability, Security, Performance, Robustness

---

## Executive Summary

The Saito codebase implements a hybrid architecture: a Rust consensus core compiled to both native binary and WebAssembly, bridged into a Node.js host through `saito-wasm` and `saito-js`. The design is fundamentally sound—separating consensus from IO, supporting multiple deployment targets—but has accumulated significant technical debt across both stacks. The most critical issues are security-related (code injection via `eval()`, panic-inducing `unwrap()` chains at the wasm boundary) and robustness-related (silent error swallowing, missing graceful shutdown).

### Severity Summary

| Severity | Count | Examples |
|----------|-------|---------|
| CRITICAL | 11 | `eval()` in modules.ts, `rawSQL` handler, 10 GB WS limit, SQL injection, wasm boundary unwraps |
| HIGH | 26 | Unmaintained crypto deps, missing security headers, open CORS, no rate limiting, singleton coupling |
| MEDIUM | 36+ | Dead code, naming inconsistencies, excessive allocations, mixed imports, no DB migrations |

---

## 1. Security

### CRITICAL: Remote Code Execution via `eval()` in Module Loading

**File:** `node/lib/saito/modules.ts` L184  
**Finding:** `eval()` is called on base64-decoded content received from the network during dynamic module installation. An attacker who can influence the module payload can execute arbitrary code on the node.

**Recommendation:** Replace `eval()` with a sandboxed module loader or, at minimum, validate and signature-check module payloads before execution. Consider using `vm.runInNewContext()` with restricted globals as an interim step.

### CRITICAL: Bare unwraps at Wasm Boundary

**Files:**
- `rust/saito-wasm/src/wasm_transaction.rs` L43 — `string_to_hex(value).unwrap()` in `set_signature()`
- `rust/saito-wasm/src/wasm_slip.rs` L75-76 — `string_to_hex(value).unwrap()` in `set_utxo_key()`
- `rust/saito-core/src/core/util/crypto.rs` L60-65 — `SecretKey::from_slice().unwrap()`, `Message::from_slice().unwrap()` in `sign()`
- `rust/saito-core/src/core/util/crypto.rs` L130-140 — `Signature::from_compact().unwrap()` in `verify_many()`

**Impact:** Any malformed hex string from the JS side panics the wasm runtime, crashing the entire Node process. The crypto unwraps mean a corrupted key or message will also crash.

**Recommendation:** Replace all boundary-facing `unwrap()` calls with `map_err()` returning `JsValue` errors, or use `wasm_bindgen`'s `Result<T, JsValue>` return type.

### CRITICAL: Panic on Initialization

**File:** `rust/saito-wasm/src/saitowasm.rs` L110  
**Finding:** `panic!("channel size should be > 0")` fires if channel capacity is zero, and `log::set_logger().unwrap()` on L345 panics if `initialize()` is called twice (e.g. during hot-reload or error recovery).

**Recommendation:** Return a `Result` from `initialize()` instead of panicking. Guard against double-initialization with `log::set_logger().ok()` or a global init flag.

### HIGH: Unvalidated HTTP Route Parameters

**File:** `node/lib/saito/core/server.ts` L580-600  
**Finding:** The `/blocks/:bhash/:pkey` route passes `bhash` directly into filesystem operations (`'./data/blocks/' + blk.file_name`) without sanitizing the parameter. While `getBlock()` likely filters this, a path-traversal attack could expose arbitrary files if that lookup is bypassed.

**Recommendation:** Validate `bhash` against a strict hex/base58 regex before use. Apply `path.basename()` to any filename used in `fs.createReadStream()`.

### HIGH: XSS Risk in innerHTML Usage

**Finding:** Multiple modules across `node/mods/` use `innerHTML` assignment with string interpolation, injecting user-supplied data without escaping.

**Recommendation:** Adopt a DOM builder helper or sanitize all interpolated values with a function like:
```js
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
```

### HIGH: Unsigned Relay Transactions

**File:** `node/mods/relay/relay.js`  
**Finding:** Relay-forwarded transactions are not re-verified after deserialization. A compromised relay could inject or modify transaction payloads.

**Recommendation:** Verify transaction signatures on receipt before processing.

### CRITICAL: Arbitrary SQL Execution via `rawSQL` Handler

**File:** `node/lib/templates/modtemplate.js` L694  
**Finding:** The `rawSQL` transaction handler accepts a SQL string from the transaction message (`txmsg.data.sql`) and executes it directly via `queryDatabase()`. Any peer can send a transaction with `request: 'rawSQL'` and execute arbitrary reads against any module database. The only check is matching the module name.

```js
if (txreq === 'rawSQL') {
  let sql = txmsg?.data?.sql;
  rows = await this.app.storage.queryDatabase(sql, params, dbname);
}
```

**Recommendation:** Remove the `rawSQL` handler entirely. Replace with a whitelist of named queries per module, each with parameterized inputs.

### CRITICAL: SQL Injection in League Module

**File:** `node/mods/league/league.js` L1253  
**Finding:** `getPlayersFromLeague()` interpolates public keys directly into SQL via template literals: `` sql2 += `'${pk}', ` ``. While public keys are normally hex, any caller passing a crafted string achieves SQL injection.

**Recommendation:** Use parameterized `IN (?, ?, ...)` clause with placeholder generation.

### CRITICAL: 10 GB WebSocket Message Limit (DoS)

**File:** `rust/saito-rust/src/network_controller.rs` L1009-1010  
**Finding:** `max_message_size(10_000_000_000)` and `max_frame_size(10_000_000_000)` allow a single peer to force the node to allocate up to 10 GB of memory per message. A single malicious connection can OOM-kill the node.

**Recommendation:** Reduce to a reasonable bound (e.g. 32 MB or `max_block_size + margin`). The Node.js `ws` server similarly lacks an explicit `maxPayload` setting.

### HIGH: No HTTP Security Headers

**File:** `node/lib/saito/core/server.ts` L34  
**Finding:** The Express server uses `cors()` with no origin restrictions and has zero security headers — no `helmet`, no CSP, no `X-Frame-Options`, no `Strict-Transport-Security`, no `X-Content-Type-Options`.

**Recommendation:** Add `helmet` middleware with a strict CSP. Restrict CORS to known origins.

### HIGH: Unbounded HTTP Body Parsing

**File:** `node/lib/saito/core/server.ts` L571-572  
**Finding:** `bodyParser.json()` and `bodyParser.urlencoded({ extended: true })` are configured with no size limits. A single POST with a multi-GB body can exhaust memory.

**Recommendation:** Add `{ limit: '1mb' }` (or appropriate bound) to both parsers.

### HIGH: No Rate Limiting on HTTP or WebSocket

**Finding:** Neither the Node.js Express server nor the WebSocket endpoint implements rate limiting. The Rust side has a `RateLimiter` in `peer_collection.rs` but Node has no equivalent.

**Recommendation:** Add `express-rate-limit` middleware. Implement per-IP connection throttling on the WebSocket server.

### HIGH: Non-CSPRNG for Handshake Challenges

**File:** `rust/saito-core/src/core/util/crypto.rs` L88-100  
**Finding:** `generate_random_bytes()` uses `rand::thread_rng()` with comment "Don't have to be cryptographically secure" — but these bytes are used for peer handshake challenges. A predictable challenge allows handshake replay attacks.

**Recommendation:** Use `OsRng` (OS-provided CSPRNG) for all security-relevant random generation.

### HIGH: Unmaintained/Vulnerable Dependencies

**Files:** `node/package.json`, `rust/saito-core/Cargo.toml`  
**Findings:**
- `node-cryptojs-aes` v0.4.0 — unmaintained since 2014, wraps CryptoJS with known padding oracle issues
- `sanitizer` v0.1.3 — deprecated, known bypass vectors
- `marked` v4.3.0 — multiple XSS CVEs fixed in v5+
- Rust `block-modes` v0.8.1 — deprecated, replaced by `cbc`/`cfb`/`ofb` crates
- Rust `aes` v0.7.5 — pre-1.0, current is 0.8.x
- No `npm audit`, Dependabot, or Renovate configuration

**Recommendation:** Replace `node-cryptojs-aes` with Node.js built-in `crypto`. Upgrade `marked` to current. Migrate Rust crates to current RustCrypto releases. Add automated dependency scanning.

### MEDIUM: Malicious peer `block_fetch_url` Redirect

**Finding:** During handshake, the remote peer's `block_fetch_url` is accepted and used to construct HTTP URLs for block downloads. A malicious peer could redirect block fetches to an arbitrary host.

**Recommendation:** Validate `block_fetch_url` against known/trusted origins or resolve against the peer's actual IP.

### MEDIUM: Fixed PBKDF2 Salt for Config Encryption

**File:** `rust/saito-rust/src/config_handler.rs`  
**Finding:** Config encryption uses a fixed salt `b"saito-config"`. Identical passwords produce identical derived keys across all installations.

**Recommendation:** Generate and store a random salt per config file.

---

## 2. Robustness

### CRITICAL: No Graceful Shutdown

**File:** `node/lib/saito/core/server.ts` L460-500  
**Finding:** `process.on('uncaughtException')` and `process.on('unhandledRejection')` log errors but do not trigger flush/shutdown. Node has no `SIGTERM`/`SIGINT` handler for draining connections, flushing blocks, or closing databases.

**Recommendation:** Implement a shutdown sequence:
1. Stop accepting new connections
2. Drain in-flight requests (timeout after N seconds)
3. Flush pending blocks and wallet state
4. Close database handles
5. Exit cleanly

### HIGH: Silent Error Swallowing

**Finding:** 30+ instances across the Node codebase of `catch (err) {}` or `catch (err) { /* empty */ }`. Errors during wallet operations, module initialization, and network IO are silently discarded, making debugging extremely difficult.

**Notable locations:**
- `node/lib/saito/app.ts` L140-155 — entire `init()` catch swallows the real error and prints a generic message
- Multiple module `initialize()` methods
- Network reconnection handlers

**Recommendation:** At minimum, log all caught errors with context. Replace empty catches with `console.error()` calls. For critical operations (wallet, blockchain), re-throw or bubble up error state.

### HIGH: Event Listener Memory Leaks

**File:** `node/lib/saito/connection.ts` L1-30  
**Finding:** The `Connection` EventEmitter has `maxListeners` set to 200 (with a commented-out debug helper). Modules call `app.connection.on()` in render paths but never call `.off()`. Over time, duplicate listeners accumulate. The 200 limit masks the problem instead of solving it.

**Recommendation:** Implement listener cleanup in module `detach()` or `onPeerDisconnect()`. Consider using `AbortSignal` with `once()` where applicable.

### HIGH: Wallet Slip Race Conditions (Rust)

**Finding:** The wallet's slip tracking is protected by `RwLock` but individual operations (check-then-spend) are not atomic. Under concurrent transaction creation, the same slip could be double-spent locally before the lock is reacquired.

**Recommendation:** Use a reservation/claim pattern for slip spending, or hold the write lock across the full check-and-mark-spent operation.

### MEDIUM: Missing JSON.parse Safety

**Finding:** Multiple `JSON.parse()` calls across the Node codebase lack `try/catch` wrappers. Malformed data from network peers, localStorage, or config files will throw unhandled exceptions.

**Recommendation:** Wrap all `JSON.parse()` calls, especially those handling external data, in try/catch blocks.

### MEDIUM: Database Connection Management

**File:** `node/lib/saito/core/storage-core.ts`  
**Finding:** `returnDatabaseByName()` uses array scan (O(n)) instead of Map lookup, and creates unlimited database connections with no pool/limit. No WAL mode is enabled on any SQLite connections — concurrent reads block on writes.

**Recommendation:** Switch to `Map` for DB lookup, add max connection count, and enable `PRAGMA journal_mode=WAL` on connection open.

### MEDIUM: Module Route Conflicts

**Finding:** Module `webServer()` callbacks receive the raw Express app. A misbehaving module can override routes from other modules or the core server. No authentication or authorization middleware is applied to module-registered routes.

**Recommendation:** Use Express sub-routers per module with namespace isolation. Add shared auth middleware at the server level.

### MEDIUM: Fire-and-Forget Database Operations

**Finding:** Some module event handlers call `queryDatabase()` without `await`, creating race conditions where the handler completes before the DB write lands.

**Recommendation:** Ensure all DB operations in event handlers are properly awaited.

---

## 3. Maintainability

### HIGH: Global Singleton Pattern (Rust ↔ Wasm)

**File:** `rust/saito-wasm/src/saitowasm.rs`  
**Finding:** The wasm layer uses a `static mut SAITO` singleton accessed with `unsafe` blocks throughout. This makes unit testing very difficult (no way to create isolated instances), prevents running multiple nodes in one process, and is inherently unsafe in concurrent contexts.

**Recommendation:** Refactor toward a handle-based API: `initialize()` returns an opaque handle, all subsequent calls take that handle. This enables testing and removes `unsafe`.

### HIGH: `app` Object God Pattern (Node)

**Finding:** Nearly every Node class takes `app` as a constructor argument and accesses arbitrary properties through it. This creates invisible coupling between all components and makes it impossible to understand dependencies from type signatures.

**Example:** A module can freely access `app.wallet`, `app.blockchain`, `app.network`, `app.server`, `app.connection`, `app.crypto`, `app.keychain`—an unbounded dependency surface.

**Recommendation:** Inject specific dependencies rather than the entire `app` object. Start by defining interfaces for the services each component actually needs.

### HIGH: Excessive `any` Types (Node)

**Finding:** TypeScript's type system is largely bypassed. Key structures like `Saito.app`, module base classes, and the server use `any` pervasively. The `tsconfig.json` does not enforce `strict` mode.

**Recommendation:** Enable `strict: true` incrementally. Start with new files and gradually type existing code. Priority targets: wallet, transaction, and network interfaces.

### MEDIUM: Dead and Commented-Out Code

**Finding:** Substantial dead code remains:
- `node/lib/saito/core/server.ts` L620-680: entire `/json-blocks/` route commented out (~60 lines)
- Multiple `// TODO` comments referencing unimplemented features
- Unused imports across module files

**Recommendation:** Remove dead code; it can be recovered from version control. Convert actionable TODOs to issues.

### MEDIUM: Mixed Import Styles (Node)

**Finding:** The Node codebase mixes `require()` and ES `import` even within single files. Module loading in `app.ts` L110 uses `require()` with string interpolation (dynamic require), while other files use ES imports.

**Recommendation:** Standardize on ES imports. Use `import()` for dynamic loading.

### MEDIUM: Naming Inconsistencies (Rust)

**Finding:** Mixed naming conventions:
- `blockchain_configs` vs `blockchain_config` (singular/plural disagreement)
- `event_processor` vs `consensus_event_processor` (inconsistent prefixing)
- Public fields vs getter methods used interchangeably

**Recommendation:** Adopt consistent naming and document conventions. Use `clippy::pedantic` to catch style issues.

### MEDIUM: No Database Migration System

**Finding:** Schema changes are ad-hoc `CREATE TABLE IF NOT EXISTS` calls in module code. There is no versioned migration framework, making schema evolution error-prone.

**Recommendation:** Add a lightweight migration framework (version-tracked SQL files per module).

### MEDIUM: Exact-Pinned Rust Dependencies

**File:** `rust/saito-core/Cargo.toml`  
**Finding:** All Rust dependencies pinned with `=` prefix (e.g. `=1.37.0`), preventing even security patch updates.

**Recommendation:** Use semver-compatible ranges (`~1.37`) for non-breaking patches. Commit `Cargo.lock` for build reproducibility.

### LOW: No Automated Dependency Scanning

**Finding:** No Dependabot, Renovate, or `npm audit` CI step configured. Vulnerable dependencies accumulate silently.

**Recommendation:** Add automated dependency scanning to CI.

---

## 4. Performance

### HIGH: Redundant Block File Sorting on Startup

**Files:**
- `rust/saito-rust/src/rust_io_handler.rs` — `load_block_file_list()` sorts by `fs::metadata().modified()` (expensive per-file stat)
- `rust/saito-core/src/core/routing/io/storage.rs` — `load_blocks_from_disk()` re-sorts the same list by filename

**Impact:** On a node with 100K+ block files, startup pays for two full sorts plus 100K+ `stat()` syscalls.

**Recommendation:** Sort once by filename (which embeds the timestamp). See `.plan/startup-block-replay-optimization-plan.md` for the full optimization plan.

### HIGH: Serial Block Deserialization on Startup

**File:** `rust/saito-core/src/core/routing/io/storage.rs`  
**Finding:** `load_blocks_from_disk()` reads and deserializes blocks one at a time in a loop. Each block triggers a full `add_block` pipeline including validation, UTXO updates, and wallet saves.

**Recommendation:** Implement read-ahead with a dedicated IO thread and batch UTXO/wallet updates. See `.plan/startup-block-replay-optimization-plan.md`.

### MEDIUM: Excessive `.to_vec()` Allocations in Serialization (Rust)

**Finding:** Block and transaction serialization repeatedly calls `.to_vec()` on slices, creating unnecessary intermediate allocations. The serialization path is hot during block production and validation.

**Recommendation:** Use `extend_from_slice()` directly into a pre-allocated buffer. Profile with `dhat` or `perf` to confirm impact before optimizing.

### MEDIUM: Lock Contention in Consensus Thread (Rust)

**File:** `rust/saito-core/src/core/consensus_thread.rs`  
**Finding:** The consensus thread acquires `blockchain` and `wallet` write locks for the full duration of block processing. This blocks all read operations (including peer serving) during block addition.

**Recommendation:** Investigate lock-free reads for block serving (e.g. `ArcSwap` for the tip reference) and reduce write lock duration.

### MEDIUM: Synchronous File I/O in Async Paths (Node)

**Files:** `node/lib/saito/core/server.ts` — `loadBlockFileList()` uses `fs.readdirSync()`  
**Finding:** Synchronous filesystem calls block the Node.js event loop during startup and block serving.

**Recommendation:** Replace `readdirSync` with `fs.promises.readdir`. Audit other sync FS calls.

---

## 5. Readability

### MEDIUM: Large Monolithic Files

**Finding:** Several files exceed 1000 lines with mixed responsibilities:
- `rust/saito-core/src/core/consensus/blockchain.rs` — ~2500 lines covering chain state, validation, reorgs, pruning, and mining
- `node/lib/saito/core/server.ts` — ~700 lines covering HTTP, WebSocket, shared methods, and block serving
- `rust/saito-wasm/src/saitowasm.rs` — ~500 lines covering initialization, event dispatch, and all wasm exports

**Recommendation:** Extract logical units: `BlockValidator`, `ChainState`, `Pruner` from blockchain.rs; `HttpRoutes`, `WsLifecycle` from server.ts.

### MEDIUM: Inconsistent Error Message Quality

**Finding:** Error messages range from detailed (`"Block doesn't exist. cannot serve block. hash : " + bhash`) to opaque (`"error"`) to absent (empty catch blocks). No structured logging format.

**Recommendation:** Adopt structured logging with consistent fields: `{component, operation, error, context}`.

### MEDIUM: Magic Numbers and Hardcoded Values

**Finding:**
- `connection.ts` L10: `setMaxListeners(200)` — unexplained threshold
- Various timeout values scattered without constants
- Channel buffer sizes hardcoded in `saitowasm.rs`

**Recommendation:** Extract to named constants with documenting comments.

### LOW: Commented-Out Debug Code

**Finding:** Multiple files contain commented-out `console.log` and `setInterval` debug helpers (e.g. `connection.ts` L18-30, `server.ts` scattered). This adds noise without value.

**Recommendation:** Remove or gate behind a debug flag.

---

## 6. Testing

### HIGH: Minimal Node.js Test Coverage

**Finding:** The Node test suite has only 2 test suites (binary.spec.ts, transaction.spec.ts) with 7 tests total. Module code — including all SQL handling, relay logic, and module lifecycle — has zero unit tests.

**Recommendation:** Add module-level unit tests, prioritizing the SQL-handling code paths (rawSQL, sendPeerDatabaseRequest) and relay forwarding.

### HIGH: No Integration Tests for Core Protocol

**Finding:** The only integration test is a single Playwright smoke test that loads the homepage. No coverage exists for WebSocket protocol, peer handshake, block sync, or transaction propagation.

**Recommendation:** Add protocol-level integration tests using the multi-node e2e harness.

### MEDIUM: No Fuzz Testing for Deserialization

**Finding:** Rust tests exist (`cargo test -p saito-core`) but no fuzzing targets for deserialization or network message parsing — the primary attack surface.

**Recommendation:** Add `cargo-fuzz` targets for `Block::deserialize_from_net`, `Transaction::deserialize_from_net`, and message parsing.

### MEDIUM: No Security Regression Tests

**Finding:** None of the SQL injection vectors, rawSQL handler, or eval() calls have negative security tests verifying they reject malicious input.

**Recommendation:** Add negative security tests for all identified injection vectors.

---

## Prioritized Action Items

### Phase 1 — Critical Security & Robustness (Immediate)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Remove `rawSQL` handler from modtemplate.js | S | Eliminates arbitrary SQL execution from peers |
| 2 | Remove or sandbox `eval()` in modules.ts | S | Eliminates RCE vector |
| 3 | Reduce WS max_message_size to ~32 MB | S | Prevents trivial OOM DoS |
| 4 | Fix SQL injection in league.js (parameterized queries) | S | Prevents SQL injection |
| 5 | Replace wasm boundary `unwrap()` with `Result` returns | M | Prevents wasm panics from crashing Node |
| 6 | Guard against double-init panic in saitowasm.rs | S | Prevents crash on hot-reload |
| 7 | Add `helmet` + restrict CORS + limit body parsers | S | Basic HTTP hardening |
| 8 | Add input validation to HTTP routes (bhash, pkey) | S | Prevents path traversal |
| 9 | Implement graceful shutdown handler | M | Prevents data loss on SIGTERM |

### Phase 2 — High-Priority Quality (Next Sprint)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 10 | Replace empty catch blocks with error logging | M | Makes debugging possible |
| 11 | Add listener cleanup (`.off()`) to module lifecycle | M | Prevents memory leaks |
| 12 | Validate relay transaction signatures on receipt | S | Prevents relay injection |
| 13 | Replace unmaintained crypto/sanitizer deps | M | Removes known-vulnerable code |
| 14 | Use CSPRNG (`OsRng`) for handshake challenges | S | Prevents challenge prediction |
| 15 | Add rate limiting to HTTP and WebSocket | S | DoS resistance |
| 16 | Sanitize innerHTML usage across modules | L | Prevents XSS |
| 17 | Eliminate redundant block file sorting on startup | S | Faster startup |

### Phase 3 — Architecture (Planned)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 18 | Refactor SAITO singleton to handle-based API | L | Enables testing, removes unsafe |
| 19 | Introduce dependency injection to replace `app` god object | XL | Reduces coupling |
| 20 | Enable TypeScript strict mode incrementally | L | Catches type errors at compile time |
| 21 | Replace rawSQL with named query API per module | M | Secure module DB access |
| 22 | Add DB migration framework | M | Reliable schema evolution |
| 23 | Module route isolation (Express sub-routers) | M | Prevents route conflicts |
| 24 | Break up monolithic files (blockchain.rs, server.ts) | L | Improves navigability |
| 25 | Standardize on ES imports | M | Consistency |

### Phase 4 — Performance & Testing (As Needed)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 26 | Implement read-ahead block loading on startup | L | Faster cold start |
| 27 | Pre-allocate serialization buffers | M | Reduces GC pressure |
| 28 | Reduce write lock duration in consensus thread | M | Better concurrency |
| 29 | Replace sync FS calls with async equivalents | S | Unblocks event loop |
| 30 | Enable SQLite WAL mode | S | Better concurrent DB access |
| 31 | Add fuzz targets for deserialization | M | Catch parsing crashes |
| 32 | Add protocol-level integration tests | L | Verify handshake/sync |

---

## Cross-References

- [startup-block-replay-optimization-plan.md](.plan/startup-block-replay-optimization-plan.md) — detailed startup perf plan
- [dynamic-log-level-reload-plan.md](.plan/dynamic-log-level-reload-plan.md) — live log level changes
- [unit-test-gap-analysis.md](.plan/unit-test-gap-analysis.md) — test coverage gaps
- [peer-protocol-versioning-plan.md](.plan/peer-protocol-versioning-plan.md) — protocol evolution
- [bidirectional-static-peer-config-plan.md](.plan/bidirectional-static-peer-config-plan.md) — peer identity
