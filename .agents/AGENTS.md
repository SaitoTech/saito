# Saito Codex Instructions

Use this file as the combined project and Codex runtime guide. Keep context small: read only what is needed, make narrow changes, and verify concretely.

## Shell

- RTK is optional. If `rtk` is available and useful for reducing command output, you may prefix shell commands with it.
- Examples: `git status` or `rtk git status`, `cargo test` or `rtk cargo test`, `npm run build` or `rtk npm run build`.
- Useful optional RTK meta commands: `rtk gain`, `rtk gain --history`, `rtk proxy <cmd>`.
- If `rg` is unavailable in the environment, use `find` and `grep` without installing unrelated tooling.

## Core Rules

- State key assumptions before non-trivial work; ask when intent, design, or risk is unclear.
- Implement the minimum code that solves the request. No speculative features, abstractions, or broad cleanup.
- Touch only files required by the task. Match local style even when a different style seems preferable.
- Every changed line should trace to the user's request.
- Define success with a concrete check, then verify it before claiming completion.

## Code Comments

- Add comments where they materially improve maintainability: non-obvious invariants, protocol or consensus reasoning, security assumptions, scale limits, ordering/idempotency requirements, tricky edge cases, or intent that is hard to recover from the code alone.
- Prefer precise, local comments near the relevant code. Use Rust doc comments for public APIs and durable contracts when they help future callers.
- Do not add comments that restate obvious code, narrate simple assignments, or compensate for confusing names or structure that can be clarified directly.
- When changing behavior, update nearby stale comments in the same scope so comments remain trustworthy.

## Saito Module Component Architecture

These rules apply to Saito application modules (Arcade, RedSquare, etc.). They
exist to prevent “protocol layers” and middleware variables from growing between
components that should interact directly.

### Prefer direct relationships

If component A naturally needs behavior from component B, call B. Do not insert
a resolver, dispatcher, registry, or generic action object unless a concrete
requirement cannot be expressed otherwise.

### Components own their behavior

Domain objects expose ordinary methods with obvious names. Example (Arcade):

- Library titles are `Game` objects (`onClick` performs selection).
- Visual tiles are `Teaser` objects; a Teaser holds a `Game` and calls `game.onClick()`.
- There is no separate `TeaserCard` or `card-interaction` protocol module.

### Naming

- Instance variables use **snake_case**.
- Method and API names should be concrete domain terms (`addGame`, `render`, `onClick`).
- Do not invent middleware property names (`module_select`, `arcadeInteraction`,
  `selection_mode`, `payload`, `handler`) merely to ferry data between callers.

### Extending another module

Prefer existing module interfaces (`respondTo`, direct functions on objects the
module already owns) over introducing a generic callback/dispatch framework
inside a consumer module.

### Arcade-specific detail

See `SAITO-MODULE-CODING-PRACTICES.md` (repo root) for module domain-object,
`addX()`, and direct-relationship rules. Arcade-local notes also live in
`node/mods/arcade/docs/coding-practices.md`.

## Saito Module CSS Development Practices

Reusable instructions for writing and simplifying CSS in Saito application modules (e.g. RedSquare). Derived from architectural guidance used during the RedSquare CSS cleanup.

These rules apply to **module CSS** that sits on top of Saito. Saito is the design system; the module is an application that consumes it. These rules override any conflicting CSS or general development guidance elsewhere in this file.

### 1. Roles

**Saito owns appearance and shared UI.**

Saito already owns:

- typography
- colours
- spacing scales
- buttons
- forms
- avatars
- notification badges
- cards
- overlays
- global CSS variables
- common UI behaviour

**The module consumes those.**

It must not:

- recreate them
- rename them
- invent another abstraction layer on top of them

Unacceptable:

```css
--rs-layer-recessed: var(--saito-surface-color);
```

Correct:

```css
background: var(--saito-surface-color);
```

Rule of thumb: **If Saito already has a variable, use it directly.**

Do not invent aliases.
Do not invent semantic design tokens.
Do not create variables “for future flexibility.”

### 2. What module CSS is for

Module CSS exists almost entirely to **position components**.

It should primarily define:

- layout
- positioning
- orientation
- flex / grid
- visibility
- overflow
- gaps / alignment
- responsive behaviour
- relationships between components

It should **not** redefine appearance.

If a declaration affects typography, colour, radius, buttons, inputs, cards, shadows, hover colours, or form styling, it probably belongs in Saito, not the module.

Before adding any rule, ask:

1. Does this exist because the module needs a layout?
2. Or am I recreating something Saito already provides?

If Saito already provides it, delete the rule.

### 3. Component ownership

#### One file, one component, one namespace

Each UI component owns:

- its HTML structure
- its CSS
- its descendants
- its presentation

Each CSS file owns exactly one component / namespace:

| File | Namespace |
|------|-----------|
| `…-manager.css` | `.manager` |
| `…-tweet.css` | `.tweet` |
| `…-profile.css` | `.profile` |

#### Short descendant names

The namespace comes from the root. Descendants must **not** repeat the component name.

Good:

```css
.tweet .header
.tweet .footer
.tweet .controls
```

Bad:

```css
.tweet-header
.tweet-footer
.tweet-controls
```

HTML should match: `class="header"` inside `class="tweet"`, not `class="tweet-header"`.

#### Parents own layout; children own themselves

- Manager decides **where** Tweets appear.
- Tweet decides **how** a Tweet is rendered.
- Sidebar decides **where** Profile appears.
- Profile decides **how** a Profile is rendered.

Buttons and inputs should never know where they live.
Tweets should never know whether they sit inside Notifications or Profiles.

#### Do not cross ownership boundaries

No component styles inside another component.

Bad:

```css
.manager .tweet .header
.manager .tweet .body
.sidebar .profile .body .text
```

Instead, the parent adds **state/modifier classes on the child’s root**. The child interprets those modifiers.

Good:

```css
.tweet.focused
.tweet.embedded
.tweet.chain-next
.tweet.chain-prev
```

If a selector nests several component names, it is probably violating ownership.

Prefer moving layout responsibility **upward**. Each component should be independently renderable.

#### Base / integration CSS

Overrides of generic Saito styling (page shell, `#saito-container`, integration with `saito.css`) belong in a **base** stylesheet for the module — not scattered through component files.

### 4. Specificity

Prefer short selectors.

Prefer:

```css
.tweet
```

instead of:

```css
body.redsquare-body .manager .tweet
```

unless the longer selector is **genuinely required** to override Saito.

Rules:

- Every level of selector nesting must justify itself.
- Do not increase specificity merely to be safe.
- Increase specificity only when necessary to override an existing rule.
- Delete specificity that no longer serves a purpose.

Shared generic names (`.header`, `.body`, `.avatar`) may need a single parent scope (`.manager .header`). Unique class names should stand alone (`.tweet`, `.feed-status`).

### 5. Cascade, inheritance, and minimal declarations

Trust the cascade.
Trust inheritance.
Trust Saito.

Selectors should contain only the declarations that make that selector unique.

Bad (defensive defaults):

```css
.profile {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

Good (unless a removed declaration demonstrably fixes rendering):

```css
.profile {
  display: flex;
  flex-direction: column;
}
```

Minimal CSS is preferred over explicit CSS.
Prefer inheritance over overriding.
Prefer relying on Saito over recreating Saito.

Delete any declaration that merely restates Saito’s appearance or the browser/Saito reset.

### 6. CSS custom properties

#### A custom property is not a local variable

Do **not** create variables simply to avoid repeating a literal.
Do **not** create variables so modifier classes can assign different values.

Discouraged (variables as local mutable state):

```css
.tweet {
  --tweet-current-pad-x: 1.6rem;
  padding: var(--tweet-current-pad-y) var(--tweet-current-pad-x);
}

.tweet.embedded {
  --tweet-current-pad-x: 1.2rem;
}
```

Preferred (explicit layouts):

```css
.tweet {
  padding: 1.2rem 1.6rem;
}

.tweet.embedded {
  padding: 1rem 1.2rem;
}
```

#### When a custom property may exist

For each variable, ask:

1. Is this **overriding a variable defined by Saito**?
2. Is this **exposing configuration** that another component is expected to override?
3. Is this representing **browser or runtime state**?

If the answer to all three is “no”, remove the variable and use a literal.

Earlier formulation of the same idea:

1. Saito defines a variable that is incorrect for this context, and the module overrides it; **or**
2. A value is shared between multiple rules **and** changing it represents a meaningful module concept.

Otherwise use a literal.

Never create variables because they “might” become configurable or “look cleaner.”
If a value is not overridden anywhere, it almost certainly should not be a variable.

**Modules must not invent their own variable system.**
Inherit Saito variables where appropriate; otherwise use ordinary CSS declarations.

Unacceptable aliases (rename-only):

```css
--rs-layer-base
--rs-layer-raised
--rs-border
--rs-text
--rs-space-sm
```

Use the Saito variable directly.

### 7. Simplification over reorganization

The task is not to make CSS look more organized.
The task is to make it **substantially smaller**.

Delete:

- unnecessary CSS
- redundant CSS
- duplicate CSS
- aliases
- unjustified variables
- useless specificity
- defensive resets
- unnecessary comments

Expect:

- fewer selectors
- fewer declarations
- fewer CSS variables
- fewer overrides
- fewer resets
- fewer comments
- fewer aliases

The ideal module stylesheet is surprisingly small.
The objective is not clever CSS. The objective is **obvious CSS**.

**If removing a rule produces identical rendering, that rule should not exist.**

**If two implementations render identically, the one with fewer lines is the correct implementation.**

### 8. Visual and behavioural constraints

When refactoring or reducing CSS:

- Preserve rendered appearance (visually identical unless the task explicitly changes design).
- Do not redesign, “modernize,” or tweak spacing/colours/typography under the guise of cleanup.
- Do not break JavaScript that depends on class names, `querySelector` / `closest`, event delegation, data attributes, or DOM structure. Update JS when renaming classes; behaviour must remain identical.

### 9. Working method

1. Assume every declaration is unnecessary until proven.
2. Prefer delete-then-add-back over incremental trimming when reducing large stylesheets.
3. Add back only the minimum declaration or specificity that fixes a proven regression.
4. Do not reorganize for its own sake while reducing.
5. Keep ownership boundaries clean while deleting.

Before keeping a rule, ask:

- Does this change layout/positioning the module uniquely needs?
- Does Saito already provide this?
- Does inheritance already provide this?
- Is this crossing a component boundary?
- Is this specificity only “to be safe”?
- Is this variable only a local rename or mutable local state?

If the answer fails those tests, delete it.

### 10. Quick checklist

- [ ] Using Saito tokens/classes directly (no module aliases)
- [ ] Layout/positioning only; appearance from Saito
- [ ] One CSS file → one component namespace
- [ ] Short descendants; no `component-part` prefixing
- [ ] Parents arrange; children render; no deep cross-component selectors
- [ ] Shortest selector that works; specificity only to beat Saito when required
- [ ] No defensive width/margin/box-sizing resets unless proven necessary
- [ ] No custom properties except Saito overrides / real shared config / runtime state
- [ ] Modifier layouts written as explicit declarations, not variable reassignment
- [ ] Fewer lines than before for the same rendering
- [ ] JS selectors and behaviour still correct

## Rust Locking

- When adding, changing, or debugging lock-related Rust code, follow the `LOCK_ORDER_*` constants in `saito-core/src/core/defs.rs` whenever multiple locks may be acquired.
- Current lock order constants include network controller, sockets, configs, blockchain, mempool, peers, and wallet. Acquire multiple locks in ascending `LOCK_ORDER_*` order.
- Avoid holding locks across awaits, callbacks, channel sends, network I/O, disk I/O, or other work that can re-enter locked paths unless the existing pattern proves it is safe.
- When introducing a new shared lock that may be acquired with existing locks, add a matching `LOCK_ORDER_*` constant and document its relative position so future maintenance does not create deadlocks.
- If a deadlock or lock contention bug is suspected, inspect every multi-lock call path before changing timing, sleeps, retries, or channel behavior.

## Local Node Operations

- Local runtime configuration lives under `saito-rust/config/`; templates include `config.template.json` and `blockchain.config.template.json`.
- Local data lives under `saito-rust/data/`; generated block data should not be committed.
- Use existing scripts in `scripts/` for setup, build/link, version, and local run workflows when they match the task.
- Do not stop, clean, or recreate local node data unless the task explicitly requires it or the user approves the destructive step.

## Safety

- Do not run `git commit`, `git push`, `git reset --hard`, `git rebase`, `git merge`, `git tag`, or remote/history-changing commands unless explicitly asked.
- Show the diff and ask before staging or committing. Read-only git commands are fine.
- Do not delete files, use `--force`, use `--no-verify`, or run destructive commands without explicit approval.
- Do not edit `node_modules/`, `target/`, `saito-wasm/pkg/`, package-manager caches, `~/.cargo/registry/`, or `~/.cargo/git/`.
- Treat generated local configuration, local blockchain data, and build artifacts as environment state unless the task explicitly targets them.

## Project Map

- Rust workspace: repo root; workspace members are `saito-core`, `saito-wasm`, `saito-rust`, and `saito-spammer`.
- `saito-core/`: shared protocol and runtime logic for Saito consensus, blocks, transactions, mempool, blockchain state, networking abstractions, storage abstractions, and test utilities.
- `saito-rust/`: native node runtime; wires `saito-core` to Tokio, websocket networking, HTTP block fetches, disk-backed storage, config loading, logging, and process lifecycle.
- `saito-wasm/`: WASM bindings around `saito-core` for JavaScript/browser and Node.js embedding.
- `saito-js/`: TypeScript/JavaScript wrapper package around the WASM build.
- `saito-spammer/`: traffic/load generator that depends on `saito-core` and `saito-rust`.
- `saito-e2e/`: Playwright end-to-end tests.
- `scripts/`: workspace setup, bootstrap, build/link, logging run scripts, version update, and CI bootstrap helpers.
- `wiki/`: internal architecture and design notes, including `codebase-structure.md`, `consensus-design.md`, and `node-architecture.md`.

## Important Code Areas

- Core consensus: `saito-core/src/core/consensus/`
- Chain state and reorg handling: `saito-core/src/core/consensus/blockchain.rs`
- Mempool and bundling rules: `saito-core/src/core/consensus/mempool.rs`
- Transaction, slip, wallet, burn fee, golden ticket, and merkle logic: `saito-core/src/core/consensus/`
- Shared event loop contracts: `saito-core/src/core/process/`
- Network messages and peer state: `saito-core/src/core/network/`
- Core orchestration threads: `saito-core/src/core/consensus_thread.rs`, `routing_thread.rs`, `verification_thread.rs`, and `mining_thread.rs`
- Native runtime entrypoint: `saito-rust/src/main.rs`
- Native network controller: `saito-rust/src/network_controller.rs`
- Native I/O bridge: `saito-rust/src/rust_io_handler.rs`
- Runtime loop helper: `saito-rust/src/run_thread.rs`
- WASM wrapper: `saito-wasm/src/saitowasm.rs`
- Browser-compatible I/O bridge: `saito-wasm/src/wasm_io_handler.rs`

## Commands

- Full Rust tests: `cargo test --workspace -- --test-threads=1`.
- Targeted Rust test: `cargo test <test_name> -- --test-threads=1`.
- Rust formatting check: `cargo fmt --all -- --check`.
- Rust lint check: `cargo clippy --workspace --all-targets`.
- Native node run: `cd saito-rust && cargo run`.
- Debug node run: `./scripts/run_with_debug_logs.sh`.
- Trace node run: `./scripts/run_with_trace_logs.sh`.
- WASM build: `cd saito-wasm && npm run build`.
- WASM web build only: `cd saito-wasm && npm run build-web`.
- WASM tests: `cd saito-wasm && npm test`.
- JS wrapper build: `cd saito-js && npm run build`.
- JS wrapper tests: `cd saito-js && npm test`.
- E2E tests: `cd saito-e2e && npm test`.
- E2E targeted: `cd saito-e2e && npx playwright test <path-or-grep> --reporter=line`.
- Build and link local npm packages: `./scripts/build_link_npms.sh`.
- Linux bootstrap: `./scripts/bootstrap_linux.sh`.
- macOS bootstrap: `./scripts/bootstrap_mac.sh`.

## Workflow

- Bug fixes: find the real root cause, add or identify the narrowest failing test first, fix minimally, rerun the target test, then run the appropriate broader gate.
- Development/refactors: read the task and nearby code, make the smallest compatible change, add tests proportional to risk, and update directly affected docs only.
- E2E failures: isolate with Rust unit tests, WASM tests, JS wrapper tests, or narrower Playwright specs when possible; avoid blocking reporter modes.
- For task documents or wiki pages, update progress/status only for the task being implemented.
- For generated WASM or JS package output, prefer source changes and rebuilds over manual edits to generated artifacts.

## Engineering Checks

- For consensus, routing, storage, networking, or distributed-state changes, make source of truth, consistency, retry/idempotency, ordering, and schema/contract evolution explicit.
- For production paths, require bounded work, intentional timeouts/retries, observable failures, and no unbounded queues or hidden resource growth.
- For refactors, preserve observable behavior; characterize current behavior first when tests are weak or behavior is unclear.
- For WASM and JS wrapper changes, verify that native Rust behavior and exported binding behavior remain aligned.
- For storage or configuration changes, consider migration, defaults, local templates, and compatibility with existing node data.

## Saito Design Rule

Saito targets long-lived decentralized operation. For protocol, consensus, routing, storage, wallet, issuance, network, or core architecture changes, check whether the design still works as the network grows and remains live over long time horizons. Flag linear unbounded state, full-dataset requirements, missing pruning, short retention without archival/audit paths, schema or version choices without migrations, cryptography without rotation/upgrade paths, economic assumptions that fail over time, operator workflows that require permanent central coordination, or assumptions that need sharding, delegation, summaries, or layer-specific handling.
