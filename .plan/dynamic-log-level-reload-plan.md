# Dynamic Log Level Reload Plan

## Goal

Allow log verbosity to be changed while a node is already running for both:

- the native Rust node in `rust/saito-rust`
- the Node-hosted wasm node in `node/`

The goal is operational control without restart, so debugging can be turned up temporarily and then reduced again without disrupting peer connections or replay state.

## Current State

- `node/scripts/start.ts` reads `SAITO_LOG_LEVEL` or a CLI log-level argument only at startup and passes the parsed value into wasm initialization.
- `rust/saito-js/saito.ts` accepts a `LogLevel` during `Saito.initialize(...)`, but does not expose any setter after startup.
- `rust/saito-wasm/src/saitowasm.rs` maps the startup log-level number and calls `log::set_max_level(...)` during `initialize(...)`.
- `rust/saito-rust/src/main.rs` builds a `tracing_subscriber::EnvFilter` from `RUST_LOG` once in `setup_log()` and installs it with `.init()`.
- Neither runtime keeps a reload handle or exposes an authenticated runtime control path for updating log verbosity after the process has started.

## Main Findings

### 1. Native Rust and wasm logging are controlled differently

The native Rust node uses `tracing_subscriber` filters, while the wasm path uses the `log` crate max level.

Implication:

- dynamic log-level change needs two implementations, not one shared switch
- the public control surface can be unified, but the internals cannot be identical

### 2. Node-hosted log control only changes Rust/wasm logs today

The Node startup path passes log level into wasm, but there is no equivalent runtime control over ordinary Node-side `console.log` or `console.error` usage.

Implication:

- adding a wasm log-level setter alone will not fully govern all logs emitted by the Node process
- either this limitation should be accepted for phase one, or Node-side logging should be centralized behind a logger abstraction

### 3. Native Rust setup is close to supporting live reload

The current Rust node already constructs an `EnvFilter` in one place.

Implication:

- the cleanest path is to replace one-time filter initialization with `tracing_subscriber::reload`
- this avoids rebuilding the subscriber or relying on environment-variable mutation after startup

### 4. Runtime log control needs an explicit and authenticated control surface

Neither runtime currently has a dedicated safe API for mutating process-wide verbosity.

Implication:

- the implementation is not just a logger change; it also needs an operator entry point
- if exposed over HTTP, it must be scoped carefully and protected from unauthenticated use

## Recommended Approach

### 1. Define one shared runtime log-level model

Create one canonical mapping for the supported levels:

- `error`
- `warn`
- `info`
- `debug`
- `trace`

Keep the existing numeric mapping used by wasm startup and the string mapping used by Node CLI consistent.

Why:

- the operational interface should behave the same across both runtimes even though the underlying logging systems differ

### 2. Add live reload support to the native Rust node with `tracing_subscriber::reload`

Refactor `rust/saito-rust/src/main.rs` so `setup_log()` installs the filter through a reload layer and stores a global reload handle for later updates.

Recommended shape:

- keep the current default directive behavior
- preserve the explicit crate/module overrides already added in `setup_log()`
- expose a helper such as `set_runtime_log_level(level: &str)` that rebuilds and reloads the filter

Why:

- this is the standard way to mutate tracing filter state at runtime
- it avoids trying to re-run subscriber initialization after the process has started

### 3. Add a wasm-exported setter for Node-hosted runtime changes

Add a new exported function in `rust/saito-wasm/src/saitowasm.rs`, for example:

- `set_log_level(log_level_num: u8)`

Behavior:

- map the numeric value to the existing log enum
- call `log::set_max_level(...)`
- return an error on invalid values

Then expose it through:

- `rust/saito-js/saito.ts`
- the generated `saito-js` runtime wrapper used by Node

Why:

- the Node-hosted wasm runtime already sets log level globally during initialization using the same mechanism
- adding a small exported setter is the least invasive way to support runtime changes

### 4. Add a single operator-facing control path per runtime

Do not require direct code injection or console access.

Recommended first-phase control surface:

- an authenticated admin API endpoint on the Node side
- a native Rust admin endpoint or CLI/signal-triggered control path on the Rust side

Recommended API shape:

- `POST /admin/log-level`
- body: `{ "level": "debug" }`

Behavior:

- validate the level against the canonical set
- apply it to the running process
- return the new effective level

Why:

- operators need a deterministic runtime interface, not a debugger-only mechanism

### 5. Treat Node-side JavaScript logs as a separate phase-one decision

There are many direct `console.log` and `console.error` calls in Node code.

Recommended options:

- phase one: document that runtime log-level changes affect wasm/core logs only, while raw JS console calls are unchanged
- phase two: introduce a central Node logger and migrate Node-owned logs behind it

Recommendation:

- keep phase one focused on runtime core logs first
- only attempt full Node-log governance if operationally necessary after the first implementation lands

Why:

- trying to unify every JS console call in the same change is much larger and less predictable than enabling core log control first

### 6. Preserve noisy third-party overrides deliberately

The Rust node currently forces several external crates to `info` in `setup_log()`.

Recommended behavior:

- keep those directives unless the operator explicitly asks to override them too
- only change the saito/default application verbosity by default

Why:

- otherwise switching to `debug` or `trace` could flood logs with unrelated transport and framework output

### 7. Add observability for runtime changes

Whenever log level changes at runtime:

- emit a clear log entry with old and new level
- record who initiated the change if the API surface provides that context
- expose the current effective level in a read endpoint if an admin API is added

Why:

- changing process-wide verbosity is an operational event and should be visible in logs

## Suggested File Targets

- `rust/saito-rust/src/main.rs`
  - replace one-time tracing filter installation with a reloadable filter and store the reload handle
- `rust/saito-wasm/src/saitowasm.rs`
  - add a runtime `set_log_level(...)` export alongside startup `initialize(...)`
- `rust/saito-js/saito.ts`
  - expose a TypeScript method that calls the new wasm log-level setter
- `node/scripts/start.ts`
  - keep startup parsing as-is, but wire in the runtime control path once the setter exists
- `node/lib/saito/core/server.ts`
  - likely place to attach a Node admin endpoint for runtime log-level changes
- any Rust-side admin/control module used by the running native node
  - add an authenticated or explicitly local-only runtime control route if HTTP control is chosen

## Verification Plan

### Native Rust verification

- start `saito-rust` at `info`
- invoke runtime change to `debug`
- verify new `debug!` messages begin appearing without restart
- reduce back to `info` and confirm `debug!` output stops
- verify the existing noisy third-party module directives remain constrained unless intentionally changed

### Node-hosted wasm verification

- start `node/` with `info`
- invoke runtime change to `debug`
- verify wasm/core debug logs begin appearing without restart
- reduce back to `info` and confirm they stop
- confirm peer connections and app state remain intact during the change

### Safety verification

- reject invalid log levels cleanly
- ensure repeated log-level changes do not panic or leak resources
- verify unauthorized callers cannot change process-wide verbosity if an HTTP endpoint is used

## Recommendation

Implement this in two stages.

Stage one:

- add native Rust reloadable tracing filters
- add wasm runtime `set_log_level(...)`
- expose one authenticated operator control path in each runtime
- document that Node raw `console.*` output is not fully governed yet

Stage two, only if needed:

- introduce a centralized Node logger abstraction
- migrate Node-owned logs away from direct `console.*`
- make runtime log-level changes govern both core wasm logs and Node-owned logs uniformly

This keeps the first pass small, useful, and operationally safe while leaving room for a more complete Node-side logging cleanup later.