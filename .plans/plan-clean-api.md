# Clean API Plan: Separate saito-js from saito-wasm

## Goal

Make `saito-wasm` language-independent enough that it exposes a stable, minimal host-facing ABI, while `saito-js` becomes one consumer-specific adapter instead of the place where the runtime contract is defined.

The end state should be:

- `saito-wasm` owns the core runtime ABI and generated artifacts.
- `saito-js` owns JavaScript ergonomics, wrappers, runtime bootstrapping, and host integrations.
- Other language bindings can target the same runtime contract without inheriting the `saito-js` object model or callback conventions.

## Current Coupling

The current split is not clean for three reasons:

1. `saito-js` imports generated `saito-wasm/pkg/*` paths directly.
2. `saito-js` public wrapper types are parameterized by concrete `Wasm*` classes from `saito-wasm/pkg/node/index`.
3. `saito-wasm` itself is not language-neutral; it embeds JavaScript-specific host contracts and JS value types in the exported runtime surface.

Concrete examples in the current tree:

- `rust/saito-js/index.node.ts` and `rust/saito-js/index.web.ts` dynamically import `saito-wasm/pkg/node` and `saito-wasm/pkg/web` directly.
- `rust/saito-js/lib/*.ts` imports `WasmTransaction`, `WasmBlock`, `WasmWallet`, and related types from `saito-wasm/pkg/node/index`.
- `rust/saito-wasm/src/wasm_io_handler.rs` binds directly to `/js/msg_handler.js` via `#[wasm_bindgen(module = "/js/msg_handler.js")]`.
- `rust/saito-wasm/src/wasm_time_keeper.rs` uses `js_sys::Date::now()`.
- `rust/saito-wasm/src/saitowasm.rs` and related files expose many `js_sys::*`, `web_sys`, and `wasm_bindgen` types as part of the effective API shape.

## Design Principle

The clean boundary is not "Rust vs TypeScript". The clean boundary is:

- Runtime core and host ABI in `saito-wasm`
- Language-specific adapters in separate packages such as `saito-js`

That means `saito-wasm` should stop assuming:

- JavaScript callback names
- JS global state such as `global.shared_methods`
- JS-native collection and function types in the stable contract
- JS-specific runtime services for time, logging, storage, and networking

## Target Architecture

### 1. Split `saito-wasm` into two conceptual layers

Inside `saito-wasm`, define two layers even if they ship from one crate initially:

- `runtime-core-api`
	- Stable host-neutral operations and data contracts
	- No JS module imports
	- No `global.shared_methods`
	- No package-path-specific assumptions from `saito-js`
- `wasm-js-adapter`
	- `wasm_bindgen` exports
	- Conversion between host-neutral runtime types and JS values
	- Current JS callback bridge implementation

This can later become two crates if needed, but the first step is architectural separation, not immediate crate proliferation.

### 2. Define an explicit host capability interface

Move the runtime’s external dependencies behind a capability-oriented host interface:

- networking
	- `send_message`
	- `send_message_to_peer_set`
	- `connect_to_peer`
	- `disconnect_from_peer`
	- `fetch_block`
- storage
	- `read`
	- `write`
	- `append`
	- `remove`
	- `flush`
	- `list_block_files`
	- `ensure_dir`
- lifecycle/events
	- `emit_interface_event`
	- `emit_block_fetch_status`
	- `emit_wallet_update`
	- `emit_version_alert`
	- `emit_chain_detected`
- time
	- `now_ms`
- logging
	- optional sink or log callback

For the wasm build, these capabilities can still be implemented with `wasm_bindgen`, but the runtime should depend on the trait/interface, not on JS glue.

### 3. Define stable value-oriented DTOs at the boundary

Any type that crosses the package boundary should be a stable data contract, not a direct generated `Wasm*` class dependency.

Examples:

- `TransactionDTO`
- `BlockHeaderDTO`
- `PeerDTO`
- `WalletSnapshotDTO`
- `ServiceDTO`
- `ApiResultDTO`

Rules:

- Prefer bytes, strings, integers, arrays, and structs over host-specific objects.
- Keep ownership and lifecycle on one side of the boundary.
- Avoid leaking internal `Wasm*` classes into `saito-js` public typing.

`saito-js` can still wrap runtime handles internally, but its public API should depend on its own interfaces/types, not generated wasm-bindgen classes.

### 4. Separate handles from snapshots

The current API mixes long-lived runtime objects and serializable data. Clean that up by splitting:

- handles
	- opaque runtime references for operations
- snapshots
	- plain serializable state for inspection and transport

Examples:

- `WasmWallet` becomes an internal adapter detail
- `WalletHandle` is an opaque runtime reference
- `WalletSnapshotDTO` is what external consumers read or persist

This matters because other language bindings are much more likely to interoperate with opaque handles plus DTOs than with JS-generated classes.

## Implementation Phases

## Phase 0: Inventory and freeze the public surface

Objective:

- Document every import from `saito-wasm/pkg/*` inside `saito-js`
- Document every exported `Wasm*` type that appears in `saito-js` public typings
- Document every JS-specific host callback that `saito-wasm` expects

Deliverables:

- API inventory document
- dependency graph of `saito-js -> saito-wasm/pkg/*`
- categorized list of boundary calls:
	- bootstrapping
	- runtime control
	- I/O
	- events
	- data model access

Success criteria:

- No hidden cross-package imports remain undocumented
- The team agrees which APIs are public, internal, or legacy

## Phase 1: Introduce a host-neutral runtime interface inside `saito-wasm`

Objective:

- Move direct JS assumptions behind internal traits/adapters

Work:

1. Extract `WasmIoHandler` responsibilities into a host trait implemented by a JS adapter.
2. Extract time access behind a host-neutral clock trait.
3. Isolate logging so the runtime does not require `web_sys::console`.
4. Ensure runtime initialization accepts capabilities/config instead of relying on JS globals.

Expected code movement:

- JS bridge logic stays in wasm-specific adapter modules
- core runtime orchestration stops importing JS glue directly

Success criteria:

- The runtime can be reasoned about without reading `/js/msg_handler.js`
- Replacing the host adapter no longer changes core runtime code

## Phase 2: Replace package-path imports with a loader boundary in `saito-js`

Objective:

- Stop scattering direct imports of `saito-wasm/pkg/node` and `saito-wasm/pkg/web` across `saito-js`

Work:

1. Add one internal loader module in `saito-js`, for example:
	 - `runtime/load-node.ts`
	 - `runtime/load-web.ts`
	 - or one `runtime/load.ts` with environment dispatch
2. Centralize all dynamic import and wasm initialization there.
3. Export a small typed runtime interface from the loader instead of raw generated modules.

Success criteria:

- `index.node.ts` and `index.web.ts` do not directly define the package-path contract
- `lib/*.ts` no longer imports `saito-wasm/pkg/node/index` directly
- Changing artifact layout in `saito-wasm` only affects the loader layer

## Phase 3: Remove `Wasm*` types from the `saito-js` public surface

Objective:

- Make `saito-js` public types independent from generated wasm-bindgen classes

Work:

1. Define local TypeScript interfaces for the runtime handles `saito-js` needs.
2. Change wrapper generics from concrete `Wasm*` imports to local adapter interfaces.
3. Keep generated `Wasm*` classes internal to the loader/adapter modules.

Example direction:

- current: `Transaction extends WasmWrapper<WasmTransaction>`
- target: `Transaction extends RuntimeWrapper<TransactionHandle>`

Where `TransactionHandle` is defined by `saito-js`, not re-exported from generated wasm output.

Success criteria:

- `npm pack` of `saito-js` does not expose `saito-wasm/pkg/node/index` in its `.d.ts` surface
- `saito-js` can be typed and consumed without referencing generated wasm package internals

## Phase 4: Create a stable minimal runtime API in `saito-wasm`

Objective:

- Expose a consciously designed API rather than the entire current generated class graph

Recommended surface:

- bootstrap
	- `create_runtime(config, host_caps)`
	- `start()`
	- `shutdown()`
- runtime control
	- `process_timer_event()`
	- `process_network_message()`
	- `process_fetched_block()`
	- `process_peer_disconnection()`
- queries
	- `get_latest_block_hash()`
	- `get_wallet_snapshot()`
	- `get_block(block_hash)`
	- `get_balance_snapshot(keys)`
- builders/utilities
	- `create_transaction(request)`
	- `serialize_transaction(handle)`
	- `deserialize_transaction(bytes)`
	- `hash(bytes)`
	- `sign(bytes, private_key)`
	- `verify(bytes, signature, public_key)`

Anything beyond that should be justified as either:

- necessary for performance
- necessary for UI ergonomics in one adapter
- or internal only

Success criteria:

- Consumers can use the runtime without binding to every `Wasm*` object type
- The API can be mapped by another language binding with predictable effort

## Phase 5: Keep `saito-js` as an adapter package

Objective:

- Make `saito-js` the JavaScript-friendly SDK, not the canonical definition of the runtime contract

Responsibilities of `saito-js` after the split:

- environment-specific module loading
- JS callback integration
- wrapper classes and convenience methods
- JSON conversion helpers
- browser/node shims
- event emitter integration

Responsibilities that should not remain in `saito-js`:

- defining the only host ABI the runtime understands
- forcing direct dependency on generated `pkg/*` layout throughout the package
- leaking generated wasm-bindgen types into the public SDK surface

## Phase 6: Prepare for additional bindings

Objective:

- Validate that the new contract can serve at least one non-JS consumer model

Work:

1. Produce a binding guide from the stable runtime API.
2. Add one thin proof-of-concept consumer that is not `saito-js` shaped.
3. Verify that host callbacks, error handling, and DTOs are sufficient without JS-specific assumptions.

This does not require shipping another language immediately. The point is to test whether the boundary is genuinely neutral.

## Packaging Plan

Short term:

- Keep package names as-is to reduce churn.
- Reorganize internals first.

Medium term:

- Consider publishing `saito-wasm` as the low-level runtime package.
- Position `saito-js` as the SDK package on top.

Possible final package roles:

- `saito-wasm`
	- low-level runtime artifacts and stable ABI
- `saito-js`
	- JS SDK and wrappers
- optional future packages
	- `saito-node-host`
	- `saito-web-host`
	- `saito-ffi-schema` or shared contract definitions if needed

Do not split packages further until the API boundary is stabilized, otherwise packaging changes will hide architectural problems instead of solving them.

## Key Refactors

### Refactor A: Replace global callback wiring

Current pattern:

- `saito-js` writes `globalThis.shared_methods`
- `saito-wasm` imports `/js/msg_handler.js`
- runtime calls fixed JS callback names

Target pattern:

- `saito-js` passes a host capability object into the runtime bootstrap layer
- wasm adapter owns translation to internal runtime traits
- callback names are not part of the core runtime design

### Refactor B: Replace generated-type coupling in wrappers

Current pattern:

- wrappers import `WasmBlock`, `WasmTransaction`, `WasmWallet`, etc.

Target pattern:

- wrappers depend on local interfaces or opaque handles
- only the adapter layer knows the concrete generated classes

### Refactor C: Separate DTO APIs from handle APIs

Current pattern:

- getters often return JS-native arrays and object graphs tied to wasm-bindgen types

Target pattern:

- mutation and high-performance operations use handles
- inspection, persistence, and interop use DTOs

### Refactor D: Make initialization explicit

Current pattern:

- initialization combines module loading, wasm boot, host registration, static type assignment, and runtime bootstrap in one flow

Target pattern:

- step 1: load runtime artifact
- step 2: construct host adapter
- step 3: create runtime instance
- step 4: bind JS wrappers
- step 5: start runtime loops

## Risks

1. Performance regressions if DTO conversion is introduced in hot paths.
2. API churn for existing `saito-js` consumers.
3. wasm-bindgen limitations may still force some JS-specific adapter code.
4. Partial migration could leave two competing APIs alive too long.

Mitigations:

- Keep high-frequency operations handle-based.
- Add compatibility shims in `saito-js` for one transition period.
- Treat generated wasm-bindgen output as adapter-internal, not public contract.
- Deprecate old entrypoints with a written timeline.

## Acceptance Criteria

The split is successful when all of the following are true:

1. `saito-js` has exactly one internal loading boundary for `saito-wasm` artifacts.
2. `saito-js` public typings do not import from `saito-wasm/pkg/*`.
3. `saito-wasm` core runtime logic does not depend directly on `/js/msg_handler.js`, `global.shared_methods`, or `js_sys::Date::now()`.
4. Host services are expressed as explicit capabilities/traits.
5. Another binding can be designed from the documented runtime contract without copying the `saito-js` wrapper architecture.

## Execution Checklist

This section turns the plan into an ordered implementation checklist with concrete file-by-file tasks.

## Milestone 1: Stop Further Coupling in `saito-js`

Goal:

- [ ] centralize wasm loading
- [ ] isolate direct `pkg/*` imports
- [ ] create a local runtime typing layer in `saito-js`

### 1. Add a dedicated runtime loader layer

Files to add:


- [ ] `rust/saito-js/runtime/load-node.ts`
	- import and initialize `saito-wasm/pkg/node`
	- return a normalized runtime module interface
- [ ] `rust/saito-js/runtime/load-web.ts`
	- import and initialize `saito-wasm/pkg/web`
	- return the same normalized runtime module interface
- [ ] `rust/saito-js/runtime/load.ts`
	- optional shared loader contract and environment dispatch
- [ ] `rust/saito-js/runtime/types.ts`
	- define `SaitoRuntimeModule` and internal runtime handle interfaces

Files to update:

- [ ] `rust/saito-js/index.node.ts`
	- replace direct `import("saito-wasm/pkg/node")`
	- consume the loader interface instead
- [ ] `rust/saito-js/index.web.ts`
	- replace direct `import("saito-wasm/pkg/web")`
	- consume the loader interface instead

Done when:

- [ ] all module loading is in one internal runtime loader directory
- [ ] `index.node.ts` and `index.web.ts` do not reference `pkg/node` or `pkg/web`

### 2. Define local runtime-handle interfaces

Files to add:

- [ ] `rust/saito-js/runtime/handles.ts`
	- declare local interfaces such as:
		- `TransactionHandle`
		- `BlockHandle`
		- `WalletHandle`
		- `PeerHandle`
		- `BlockchainHandle`
		- `PeerServiceHandle`
		- `BalanceSnapshotHandle`
		- `NetworkPeerHandle`

Files to update:

- [ ] `rust/saito-js/lib/wasm_wrapper.ts`
	- retarget generic constraints to local handle interfaces
- [ ] `rust/saito-js/saito.ts`
	- consume the normalized runtime type instead of `any` where possible

Done when:

- [ ] the wrapper layer can be typed without importing generated `Wasm*` classes directly

### 3. Remove direct `Wasm*` imports from wrapper files

Files to update first pass:

- [ ] `rust/saito-js/lib/transaction.ts`
- [ ] `rust/saito-js/lib/block.ts`
- [ ] `rust/saito-js/lib/slip.ts`
- [ ] `rust/saito-js/lib/peer.ts`
- [ ] `rust/saito-js/lib/network_peer.ts`
- [ ] `rust/saito-js/lib/peer_service.ts`
- [ ] `rust/saito-js/lib/peer_service_list.ts`
- [ ] `rust/saito-js/lib/wallet.ts`
- [ ] `rust/saito-js/lib/blockchain.ts`
- [ ] `rust/saito-js/lib/balance_snapshot.ts`
- [ ] `rust/saito-js/lib/hop.ts`
- [ ] `rust/saito-js/lib/nft.ts`

Task in each file:

- [ ] remove `import type { Wasm... } from "saito-wasm/pkg/node/index"`
- [ ] replace with imports from local runtime handle/type files
- [ ] keep runtime behavior unchanged

Done when:

- [ ] `grep` for `saito-wasm/pkg/node/index` in `rust/saito-js/lib/**` returns no source matches

### 4. Add a single runtime registration point

Files to add:

- [ ] `rust/saito-js/runtime/register-types.ts`
	- assign runtime constructors to `Transaction.Type`, `Block.Type`, `Wallet.Type`, and related wrapper statics

Files to update:

- [ ] `rust/saito-js/index.node.ts`
- [ ] `rust/saito-js/index.web.ts`

Task:

- [ ] move constructor registration out of the two entrypoints into one shared runtime registration function

Done when:

- [ ] type registration logic exists in one place only

### 5. Verification for Milestone 1

Files/commands:

- [ ] `rust/saito-js/package.json`
	- use existing build/test commands for validation

Checks:

- [ ] run `npm run build` in `rust/saito-js`
- [ ] run `npm test` in `rust/saito-js` if current tests are stable
- [ ] inspect emitted `.d.ts` files under `rust/saito-js/dist/**`
- [ ] verify public typings no longer reference `saito-wasm/pkg/node/index`

## Milestone 2: Extract JS Host Glue Inside `saito-wasm`

Goal:

- [ ] move JS-specific host bindings to an adapter layer
- [ ] make the runtime depend on traits/capabilities instead of JS modules

### 6. Introduce host capability traits in Rust

Files to add:

- [ ] `rust/saito-wasm/src/host/mod.rs`
	- module root for host-neutral traits and adapters
- [ ] `rust/saito-wasm/src/host/io.rs`
	- define host I/O trait
- [ ] `rust/saito-wasm/src/host/time.rs`
	- define clock trait
- [ ] `rust/saito-wasm/src/host/events.rs`
	- define event emission trait if split from I/O
- [ ] `rust/saito-wasm/src/host/log.rs`
	- optional logging abstraction

Files to update:

- [ ] `rust/saito-wasm/src/lib.rs`
	- export the new host module

Task:

- [ ] codify the runtime dependencies as internal Rust traits first
- [ ] do not change external JS behavior yet

Done when:

- [ ] the core runtime can be constructed against traits instead of concrete JS glue types

### 7. Move JS bridge code into an adapter module

Files to add:

- [ ] `rust/saito-wasm/src/js/mod.rs`
- [ ] `rust/saito-wasm/src/js/msg_handler_adapter.rs`
	- wrap the current `/js/msg_handler.js` bridge
- [ ] `rust/saito-wasm/src/js/time_adapter.rs`
	- wrap JS time access

Files to update:

- [ ] `rust/saito-wasm/src/wasm_io_handler.rs`
	- shrink into adapter or replace entirely with host trait implementation
- [ ] `rust/saito-wasm/src/wasm_time_keeper.rs`
	- move JS-specific timestamp sourcing behind the new adapter
- [ ] `rust/saito-wasm/src/lib.rs`
	- wire new modules

Task:

- [ ] make JS-specific bindings live only under `src/js/**`

Done when:

- [ ] `wasm_io_handler.rs` and `wasm_time_keeper.rs` are either deleted, reduced to thin adapters, or renamed into the adapter layer

### 8. Decouple runtime construction from JS globals

Files to update:

- [ ] `rust/saito-wasm/src/saitowasm.rs`
	- stop directly constructing runtime dependencies with JS-specific concrete types
	- inject host trait implementations during runtime construction

Likely supporting files:

- [ ] `rust/saito-wasm/src/wasm_configuration.rs`
- [ ] `rust/saito-wasm/src/wasm_stats.rs`
- [ ] `rust/saito-wasm/src/wasm_blockchain.rs`
- [ ] `rust/saito-wasm/src/wasm_wallet.rs`

Task:

- [ ] ensure runtime orchestration depends on host-neutral abstractions
- [ ] keep wasm-bindgen exports as a separate layer around that runtime

Done when:

- [ ] the runtime can be initialized without reading `/js/msg_handler.js` to understand its core flow

### 9. Replace direct JS time and logging assumptions

Files to update:

- [ ] `rust/saito-wasm/src/wasm_time_keeper.rs`
- [ ] `rust/saito-wasm/src/saitowasm.rs`

Task:

- [ ] replace `js_sys::Date::now()` usage with a clock abstraction
- [ ] replace any core dependency on `web_sys::console` with a logging abstraction or runtime-local logging setup

Done when:

- [ ] JS time and console access appear only in adapter code

### 10. Verification for Milestone 2

Files/commands:

- [ ] `rust/saito-wasm/Cargo.toml`
- [ ] `rust/saito-wasm/package.json`

Checks:

- [ ] run `cargo test -p saito-wasm` from `rust/` if available and meaningful
- [ ] run `npm run build` in `rust/saito-wasm`
- [ ] confirm core runtime files no longer import `/js/msg_handler.js`
- [ ] confirm JS-specific imports are isolated to adapter modules

## Milestone 3: Design the Stable Runtime API

Goal:

- [ ] replace the accidental generated object graph with a deliberate runtime contract

### 11. Define bootstrap and runtime control surface

Files to add:

- [ ] `rust/saito-wasm/src/api/mod.rs`
- [ ] `rust/saito-wasm/src/api/runtime.rs`
	- runtime construction and control entrypoints

Files to update:

- [ ] `rust/saito-wasm/src/saitowasm.rs`
	- move orchestration logic toward the API layer

Task:

- [ ] define the stable set of runtime operations
- [ ] identify what remains internal-only

Done when:

- [ ] runtime lifecycle operations are grouped under a deliberate API module

### 12. Define DTOs for snapshots and requests

Files to add:

- [ ] `rust/saito-wasm/src/api/dto.rs`
	- DTOs such as:
		- `TransactionDTO`
		- `TransactionRequestDTO`
		- `BlockHeaderDTO`
		- `WalletSnapshotDTO`
		- `PeerDTO`
		- `ServiceDTO`
		- `ApiResultDTO`

Files to update:

- [ ] `rust/saito-wasm/src/wasm_transaction.rs`
- [ ] `rust/saito-wasm/src/wasm_block.rs`
- [ ] `rust/saito-wasm/src/wasm_wallet.rs`
- [ ] `rust/saito-wasm/src/wasm_peer.rs`
- [ ] `rust/saito-wasm/src/wasm_peer_service.rs`
- [ ] `rust/saito-wasm/src/wasm_balance_snapshot.rs`

Task:

- [ ] identify which current getters should become DTO snapshots
- [ ] keep handle-based methods only where needed for performance or mutation

Done when:

- [ ] there is a clear split between handle objects and serializable DTOs

### 13. Introduce a small exported wasm-bindgen facade

Files to add:

- [ ] `rust/saito-wasm/src/api/js_exports.rs`
	- expose the minimal JS-facing facade for the stable runtime API

Files to update:

- [ ] `rust/saito-wasm/src/lib.rs`
	- export the facade module

Task:

- [ ] keep the wasm-bindgen export set small and stable
- [ ] prevent the full internal class graph from becoming the public contract by default

Done when:

- [ ] consumers can use the runtime through the facade without touching most `Wasm*` implementation types

### 14. Verification for Milestone 3

Checks:

- [ ] document every exported API symbol intended to be public
- [ ] confirm the export list is smaller and easier to map than the current generated graph
- [ ] ensure `saito-js` can adapt to the facade without needing direct `Wasm*` imports in public types

## Milestone 4: Convert `saito-js` into a Pure SDK Layer

Goal:

- [ ] make `saito-js` a convenience package built on top of the stable runtime API

### 15. Move JS host registration into adapter modules

Files to add:

- [ ] `rust/saito-js/runtime/host/node-host.ts`
- [ ] `rust/saito-js/runtime/host/web-host.ts`
- [ ] `rust/saito-js/runtime/host/shared.ts`

Files to update:

- [ ] `rust/saito-js/saito.ts`
- [ ] `rust/saito-js/shared_methods.ts`
- [ ] `rust/saito-js/index.node.ts`
- [ ] `rust/saito-js/index.web.ts`

Task:

- [ ] stop writing raw `globalThis.shared_methods` in the entrypoints
- [ ] construct a host capability adapter and pass it through the loader/bootstrap path

Done when:

- [ ] host registration is explicit and local to runtime bootstrapping

### 16. Add SDK-owned DTO and facade types

Files to add:

- [ ] `rust/saito-js/runtime/dto.ts`
- [ ] `rust/saito-js/runtime/public-types.ts`

Files to update:

- [ ] `rust/saito-js/saito.ts`
- [ ] `rust/saito-js/configs.ts`
- [ ] wrapper files under `rust/saito-js/lib/**`

Task:

- [ ] define the public `saito-js` API in SDK-owned types
- [ ] avoid re-exporting implementation details from `saito-wasm`

Done when:

- [ ] the SDK public surface is owned by `saito-js`

### 17. Audit packaging outputs

Files to inspect/update if needed:

- [ ] `rust/saito-js/package.json`
- [ ] `rust/saito-js/tsconfig.json`
- [ ] `rust/saito-js/.npmignore`
- [ ] `rust/saito-js/index.node.ts`
- [ ] `rust/saito-js/index.web.ts`

Task:

- [ ] ensure packaged declarations and exports expose only SDK-facing types
- [ ] avoid leaking generated wasm artifact internals in package output

Done when:

- [ ] packed output does not expose `pkg/*` implementation paths in declarations or exports

### 18. Verification for Milestone 4

Checks:

- [ ] run `npm run build` in `rust/saito-js`
- [ ] inspect generated declarations in `rust/saito-js/dist/**`
- [ ] run `npm pack` in `rust/saito-js` and inspect tarball contents if needed

## Milestone 5: Documentation and Migration

Goal:

- [ ] make the new boundary explicit and adoptable

### 19. Write the API inventory and migration docs

Files to add:

- [ ] `rust/saito-js/docs/runtime-boundary.md`
- [ ] `rust/saito-wasm/docs/host-abi.md`
- [ ] `rust/saito-wasm/docs/binding-guide.md`

Task:

- [ ] document the runtime facade
- [ ] document host capabilities
- [ ] document which legacy `Wasm*` exports are transitional or internal

Done when:

- [ ] a new contributor can identify the supported boundary without reading implementation files

### 20. Add deprecation notes for legacy entrypoints

Files to update:

- [ ] `rust/saito-js/README.md` if present later
- [ ] `rust/saito-wasm/package.json`
- [ ] `rust/saito-js/package.json`
- [ ] relevant source files with transitional exports

Task:

- [ ] mark old pathways as transitional
- [ ] define the removal timeline once the new facade is stable

Done when:

- [ ] the repo has one clearly preferred integration path

## Fast Audit Checklist

Use this as the recurring PR checklist during implementation:

- [ ] `rust/saito-js/index.node.ts` has no direct `pkg/node` import
- [ ] `rust/saito-js/index.web.ts` has no direct `pkg/web` import
- [ ] `rust/saito-js/lib/**` has no direct `saito-wasm/pkg/node/index` imports
- [ ] `rust/saito-js/dist/**/*.d.ts` does not expose `saito-wasm/pkg/*`
- [ ] `rust/saito-wasm/src/saitowasm.rs` depends on host abstractions, not JS glue directly
- [ ] `rust/saito-wasm/src/wasm_io_handler.rs` is replaced or reduced to adapter-only logic
- [ ] `rust/saito-wasm/src/wasm_time_keeper.rs` is replaced or reduced to adapter-only logic
- [ ] JS-specific bindings live under a dedicated adapter namespace such as `src/js/**`
- [ ] DTOs are distinct from runtime handles
- [ ] `saito-js` public types are owned by `saito-js`
- [ ] `saito-wasm` exports a minimal documented facade
- [ ] build/test/package validation passes for both packages

## Suggested Commit Sequence

Use small commits in this order:

- [ ] Add `saito-js` runtime loader and registration layer.
- [ ] Replace wrapper imports with local handle interfaces.
- [ ] Introduce `saito-wasm` host trait modules.
- [ ] Move JS bridge logic into adapter modules.
- [ ] Refactor runtime construction to use host abstractions.
- [ ] Add runtime facade and DTO layer.
- [ ] Switch `saito-js` to the new facade.
- [ ] Audit declaration output and packaging.
- [ ] Add docs and deprecation notes.

## Recommended Order of Execution

- [ ] Inventory and classify the current boundary.
- [ ] Add a loader boundary in `saito-js` to stop further spread of direct `pkg/*` imports.
- [ ] Introduce host traits/capabilities in `saito-wasm` and move JS glue behind them.
- [ ] Replace `Wasm*` public typing leakage in `saito-js`.
- [ ] Shrink `saito-wasm` to a stable minimal API surface.
- [ ] Add compatibility shims and migration notes.
- [ ] Validate with a second consumer model.

## Practical First Milestone

If this is implemented incrementally, the first milestone should be:

- [ ] centralize wasm loading in `saito-js`
- [ ] stop importing `saito-wasm/pkg/node/index` from wrapper classes
- [ ] define local runtime handle interfaces in `saito-js`
- [ ] extract JS host callbacks in `saito-wasm` behind one adapter module

That milestone does not solve full language independence, but it creates the seam needed for the rest of the migration.

## Non-Goals

- Rewriting the consensus/runtime logic
- Eliminating wasm-bindgen immediately
- Shipping a second language SDK in the same change
- Optimizing every wrapper API before the boundary is cleaned up

## Summary

To cleanly divide `saito-js` and `saito-wasm`, treat `saito-wasm` as the low-level runtime with a small stable host ABI, and treat `saito-js` as one adapter/SDK built on top of that ABI. The critical work is not renaming packages. It is removing direct generated-type coupling, isolating JS-specific host glue, and designing a stable runtime contract that does not assume JavaScript as the only consumer.
