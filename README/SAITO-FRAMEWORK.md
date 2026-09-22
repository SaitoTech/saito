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
# Saito AI Development — Project Discovery and Requirements

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- How an AI agent should discover an existing Saito project
- How requirements should be gathered before implementation
- What must be understood before changing code
# Saito AI Development — Reference Implementation

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- Which implementations an AI agent should treat as references
- How to use a reference without copying unrelated behavior
- How reference code relates to the rest of the documentation
# Saito AI Development — Saito Security and Trust Model

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- Saito's security and trust model as it applies to development
- What an AI agent must not assume is trusted
- Boundaries an agent should respect when writing application code
# Saito Applications — Application Patterns and Use Cases

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- Recurring application patterns
- Use cases those patterns serve
- How to choose a pattern for a new application
# Saito Application Communication and Blockchain Synchronization

This document describes how Saito applications communicate.

It is deliberately not a generic "distributed systems" guide.

Saito applications can use several different communication mechanisms because applications have different requirements. A transaction may need to enter the blockchain because it represents value, ownership, authorization, security, or information that should be publicly broadcast. An application may instead need an off-chain request to obtain data from a peer. Two browser clients may need to establish a direct peer-to-peer connection and then communicate outside the blockchain entirely. A module may simply need to notify another object inside the same process.

The correct mechanism follows from what the application is trying to accomplish.

The most important development question is therefore not:

> "How do I synchronize this application?"

It is:

> "What information needs to move, between whom, and what properties does that communication need?"

The implementation should then use the smallest Saito-native mechanism that satisfies those requirements.

---

# 1. Start With the Application, Not the Network

When designing a feature, begin with what the user is trying to accomplish.

Ask:

    What information needs to move?

    Who needs to receive it?

    Does it need to be public?

    Does it need to be authenticated?

    Does it need to be protected by consensus?

    Does it represent value or ownership?

    Does it need to persist?

    Does somebody need to query it later?

    Does the recipient need to know that it exists?

    Does it need to be delivered to a particular public key?

    Does it need to be available to anyone who wants to listen?

    Does it need a direct high-bandwidth communication channel?

The answers determine the communication mechanism.

There is no universal Saito application communication pattern.

For example:

    financial exchange
        → blockchain transaction

    NFT creation
        → blockchain transaction

    spending a protected token
        → blockchain transaction

    signed public broadcast
        → blockchain transaction

    request for historical transaction data
        → off-chain peer request / Archive

    local application notification
        → app.connection

    direct browser-to-browser data transfer
        → peer connection / appropriate direct communication channel

The application should not force all of these problems into the same mechanism.

---

# 2. Transactions Are Not Merely Payments

A common mistake for developers coming from other blockchain ecosystems is to assume that blockchain transactions have a narrow purpose.

In Saito, transactions can carry application information.

A transaction can represent:

    financial exchange
    token spending
    NFT creation
    ownership changes
    application state changes
    signed information
    information broadcast to a public key
    information broadcast to parties who may be listening

This means that the question:

> "Should this be a transaction?"

cannot be answered simply by asking:

> "Is this a payment?"

Instead ask:

> "Does this information need the properties provided by an on-chain transaction?"

If it does, use a transaction.

If it does not, consider an off-chain mechanism.

---

# 3. The Cost of Putting Something On-Chain

Putting information into a blockchain transaction is not free.

The application should consider:

    transaction size
    fees
    block inclusion
    confirmation time
    consensus processing
    storage
    relevance to recipients
    blockchain bandwidth

If a feature requires only:

    "Tell another peer X"

there may be no reason to put X on-chain.

If the feature requires:

    "Everyone should be able to verify that X happened"

or:

    "This action changes ownership of an asset"

then an on-chain transaction may be appropriate.

The communication mechanism should match the required guarantee.

---

# 4. On-Chain Communication

An application transaction can be created using the wallet and then propagated through the network.

Conceptually:

    application
        ↓
    app.wallet
        ↓
    transaction
        ↓
    tx.msg
        ↓
    sign
        ↓
    app.network.propagateTransaction()
        ↓
    peers
        ↓
    blockchain

A typical application message contains:

    tx.msg.module
    tx.msg.request
    tx.msg.data

For example:

    tx.msg = {
      module: this.name,
      request: "request-tweet",
      data: {
        text: tweet_text
      }
    };

The exact transaction structure depends on the application.

The important point is that application data can be part of a blockchain transaction.

---

# 5. Off-Chain Communication

Not every application message needs consensus.

For off-chain communication, Saito provides peer-to-peer application messaging.

The application can use transaction-shaped peer messages such as:

    sendRequestAsTransaction()

The receiving module processes the request through:

    handlePeerTransaction()

Conceptually:

    Module A
        ↓
    transaction-shaped request
        ↓
    peer connection
        ↓
    Module B
        ↓
    handlePeerTransaction()

The transaction-shaped object does not become a blockchain transaction merely because it uses the Transaction data structure.

This distinction is important.

    transaction-shaped message
        ≠
    blockchain transaction

---

# 6. `sendRequestAsTransaction()`

`sendRequestAsTransaction()` is a Saito-native mechanism for sending an application request to another peer using a transaction-shaped message.

Conceptually:

    create transaction-shaped object
        ↓
    put request/data in message
        ↓
    send to peer
        ↓
    peer receives transaction
        ↓
    handlePeerTransaction()

This is useful when the application needs to communicate with another Saito node without publishing the message to the blockchain.

Examples include:

    requesting transaction data
    requesting application information
    communicating with an Archive service
    communicating with another application node
    game communication
    service requests

The exact API signature should always be checked against the current implementation.

Do not invent the argument structure from memory.

---

# 7. `handlePeerTransaction()`

Off-chain application messages are received through:

    handlePeerTransaction()

The module should explicitly identify the requests it understands.

For example:

    async handlePeerTransaction(app, tx, peer, mycallback) {

      let request = tx.returnMessage().request;

      if (request !== "redsquare-request-tweet") {
        return super.handlePeerTransaction(app, tx, peer, mycallback);
      }

      await this.transactions.receiveRequestTweetTransaction(tx, peer);

      return 1;
    }

The exact implementation varies.

The architectural principle is straightforward:

> A module should recognize its own application messages explicitly.

Do not build a giant generic dispatcher that attempts to understand every peer message in the application.

---

# 8. `tx.msg.module` and `tx.msg.request`

Saito application messages commonly distinguish:

    tx.msg.module
        which application owns the message

    tx.msg.request
        which operation the message represents

For example:

    tx.msg = {
      module: "RedSquare",
      request: "request-tweet",
      data: {
        ...
      }
    };

The request identifies the application operation.

This is especially important in `handlePeerTransaction()` because all modules can receive peer transactions and need to determine which messages belong to them.

On-chain handling similarly checks whether a transaction belongs to the module before processing it.

---

# 9. Request Names Should Describe the Operation

Application requests should normally have explicit names.

For example:

    request-tweet

is more useful than:

    request

because the request itself communicates its purpose.

The exact naming convention can vary between applications, particularly in existing code.

When creating new application protocols, use names that clearly identify the operation.

The important thing is semantic clarity rather than creating a universal naming registry.

---

# 10. Create and Receive Operations

Application transaction protocols often naturally produce pairs such as:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

The create function constructs the message.

The receive function interprets it.

This is a useful organizing principle because the two sides of the protocol remain easy to find.

For example:

    createRequestTweetTransaction()
        ↓
    tx.msg.request = "request-tweet"
        ↓
    send / propagate
        ↓
    receiveRequestTweetTransaction()
        ↓
    application behavior

The functions should contain meaningful application logic.

Do not create trivial wrappers simply to make every operation pass through several layers.

---

# 11. The Minimal Message

When designing communication, determine the minimum information the recipient actually needs.

For example, if the recipient needs a transaction signature to retrieve a transaction, the request may only need:

    {
      request: "request-tweet",
      sig: "..."
    }

Do not automatically serialize an entire domain object into every request.

Likewise, if the relevant information already exists in a transaction, do not create a second set of redundant fields merely because doing so looks convenient.

Prefer:

    tx
        ↓
    tx.returnMessage()
        ↓
    required field

over creating unnecessary intermediary copies.

---

# 12. Avoid Middleware Data Duplication

A common AI mistake is to take data that already exists in a transaction and repeatedly extract it into intermediary variables or objects.

For example, an AI may create:

    this.tweet_text
    this.tweet_author
    this.tweet_timestamp
    this.tweet_signature
    this.tweet_data

even though the transaction already contains those values.

This creates unnecessary state.

It also creates architectural cruft.

Once those intermediary variables exist, future code may begin treating them as independent sources of truth even though they are merely copies of transaction data.

Prefer keeping the transaction available when the transaction is the underlying source.

For example:

    this.tx = tx;

and then access the appropriate transaction data when necessary.

Extract fields into application-level properties when they have genuine semantic value for the domain object or make repeated application operations clearer.

Do not copy everything merely because it is available.

---

# 13. Large Transactions Make Duplication More Expensive

This problem becomes particularly important with large transactions.

If a transaction contains substantial application data, copying that data into multiple intermediary objects can unnecessarily increase memory usage.

For example:

    transaction
        ↓
    complete copied object
        ↓
    second copied object
        ↓
    UI representation

may consume substantially more memory than:

    transaction
        ↓
    domain object retains transaction
        ↓
    selected fields extracted when useful

The application should avoid unnecessary duplication.

This is both a performance issue and a code-architecture issue.

---

# 14. Direct Calls

Direct method calls are often the preferred mechanism when one object knows which other object should perform an operation.

For example:

    this.tweetManager.render()

or:

    this.main.showTweet(tweet)

or:

    this.mod.main.update(...)

This is particularly appropriate for hierarchical UI ownership.

The caller knows:

    who owns the operation
    what operation should happen
    what object should perform it

There is no need to broadcast an event.

---

# 15. `app.connection`

`app.connection` is useful for asynchronous local notification.

For example:

    app.connection.emit("wallet-updated");

Another object can listen:

    app.connection.on("wallet-updated", ...);

This is useful when multiple independent parts of the application may care that something happened.

Events can:

    update state
    initiate another operation
    invalidate data
    trigger synchronization
    notify another module
    trigger rendering

Rendering is only one possible consequence of an event.

---

# 16. The Global Nature of `app.connection`

`app.connection` has an important architectural property:

> It is process-wide.

Saito modules are not necessarily dormant when the user is looking at another application.

The modules loaded into the wallet are generally running.

When blockchain activity occurs, modules can inspect incoming transactions and respond to them.

Therefore, a global connection event can be observed by code belonging to another application.

This creates a serious UI hazard.

Imagine:

    User is using Application A.

    Application B is also loaded.

    Application B observes something interesting.

    Application B emits:
        app.connection.emit("something-happened")

    Application B's UI responds.

The user may suddenly see Application B's UI react while using Application A.

This is one reason global events are not the preferred mechanism for ordinary UI rendering.

---

# 17. Use UI Ownership for Rendering

For UI rendering, prefer hierarchical ownership.

For example:

    Main
      ↓
    Sidebar
      ↓
    ChatManager
      ↓
    ChatContacts

or:

    Main
      ↓
    TweetManager
      ↓
    Tweet

A component that owns another component can directly invoke the appropriate method.

For example:

    this.tweet_manager.render();

This makes the relationship explicit.

The component being rendered belongs to the current UI hierarchy.

It does not accidentally react because another module somewhere in the process emitted an event.

---

# 18. When `app.connection` Is Appropriate for UI

`app.connection` can still be useful when an asynchronous notification should reach multiple independent objects.

For example:

    wallet-updated

may be relevant to:

    wallet UI
    NFT UI
    token balance UI
    transaction history UI

The event can notify those systems that something changed.

The receiving component can then determine whether it needs to act.

This is different from using a global event to directly render arbitrary UI.

The principle is:

    event
        notification

    component ownership
        rendering/control

---

# 19. Events Do Not Need to Render

Do not assume:

    event
        ↓
    render()

An event can instead cause:

    refresh state
    fetch data
    invalidate a cache
    update an object
    start another operation
    record a notification
    trigger a wallet backup
    perform another application action

For example:

    wallet-updated
        ↓
    NFT component reloads NFTs

The NFT component may then decide whether it needs to render.

This separation makes the event mechanism more useful and less tightly coupled to UI behavior.

---

# 20. Local Module Communication

When one module needs another module's capability, use the appropriate module interface.

Possible mechanisms include:

    respondTo()
    returnModule()

These are local mechanisms.

They should not be confused with:

    app.network

or:

    returnServices()

The choice depends on whether the relationship is:

    capability-based

or:

    direct module dependency

The application should not create a generic service layer merely to mediate these relationships.

---

# 21. `respondTo()`

`respondTo()` exposes a capability to other modules.

Conceptually:

    Module A
        ↓
    "Can you provide capability X?"
        ↓
    Module B.respondTo(...)
        ↓
    capability

This is useful when the consumer cares about the capability rather than the provider's identity.

The consumer does not need to know the provider's internal implementation.

This can be especially useful for optional modules.

---

# 22. `returnModule()`

Direct module access can be appropriate when the application genuinely has a known dependency on another module.

For example:

    let mod = app.modules.returnModule("SomeModule");

The important point is that this is direct access.

Do not treat `returnModule()` as a universal dependency-injection architecture.

If a capability is optional or interchangeable, `respondTo()` may express the relationship better.

If the module is an explicit part of the application's architecture, direct access can be simpler.

---

# 23. Peer Services

Peer services are different from local module capabilities.

A module can advertise a service through:

    returnServices()

When another peer connects, it learns that the peer advertises that service.

The application can then receive:

    onPeerServiceUp()

This means:

    peer connected
        ↓
    peer advertised service
        ↓
    application learns service is available
        ↓
    application can make a request

A service advertisement is discovery information.

It is not proof that the peer is trustworthy or that the service will actually respond.

---

# 24. `onPeerServiceUp()` Is the Correct Place for Peer-Dependent Requests

One of the most important lifecycle rules for Saito applications is:

> Do not make peer-dependent requests from `initialize()` merely because the application has initialized.

When `initialize()` runs, the application may not yet have a connected peer that provides the required service.

The correct pattern is:

    initialize()
        ↓
    prepare application

then:

    peer connects
        ↓
    service is advertised
        ↓
    onPeerServiceUp()
        ↓
    make peer-dependent request

For example:

    async onPeerServiceUp(app, peer, service) {

      if (service !== "archive") {
        return;
      }

      // Now request archived data.
    }

This avoids a common web-application mistake.

A conventional frontend may assume:

    initialize
        ↓
    fetch("/api/data")

A Saito application cannot make that assumption.

The peer may not exist yet.

---

# 25. `initialize()` Is Not "Fetch Everything"

Do not turn module initialization into a collection of network requests.

Bad pattern:

    async initialize(app) {

      await super.initialize(app);

      await this.fetchArchive();
      await this.fetchRemoteState();
      await this.fetchContacts();
      await this.fetchSomethingElse();
    }

Those requests may depend on peers that are not yet connected.

Instead:

    initialize()
        ↓
    construct state / prepare module

    onPeerServiceUp()
        ↓
    request peer-dependent information

This is one of the most important differences between Saito applications and conventional client/server applications.

---

# 26. Peer Service Availability

A service advertisement means:

> This peer says it provides this service.

It does not guarantee:

    response
    completeness
    availability
    correctness
    permanence

A peer can disconnect.

A peer can fail to respond.

A peer can advertise a service but have incomplete data.

Applications that depend on off-chain services should therefore handle failure at the application level.

Saito maintains peer connectivity, but it does not automatically know what constitutes successful completion of every application's request.

---

# 27. Multiple Service Peers

If an application needs an off-chain service, it can keep track of multiple peers advertising that service.

For example:

    Archive peer A
    Archive peer B
    Archive peer C

The application can then choose among them.

This is application behavior, not a universal Saito synchronization layer.

The application may choose:

    first available
    round-robin
    preferred peer
    fallback peer
    another application-specific strategy

The appropriate strategy depends on the application's needs.

---

# 28. Archive

Archive is fundamentally a mechanism for persisting and retrieving transactions.

If a module wants a transaction to persist, it can save it.

Conceptually:

    transaction
        ↓
    app.storage.saveTransaction()

If it later wants to retrieve that transaction:

    app.storage.loadTransaction()

or load a collection of transactions through the appropriate storage API.

Archive can exist locally or be provided by another peer.

The application does not need to treat local and remote Archive as fundamentally different conceptual systems.

---

# 29. Archive Is Not "Application Synchronization"

Do not introduce a generic architecture called:

    SynchronizationManager

simply because an application retrieves data from Archive.

A social application may:

    render local cached tweets
        ↓
    ask Archive for additional tweets
        ↓
    add them to its local data
        ↓
    render more content

That is simply application data retrieval and caching.

The mechanism should be designed around what the UI and application need.

There is no requirement that every application implement a generalized synchronization protocol.

---

# 30. Caching Application Data

Applications can maintain local cached data when that makes the UI useful.

For example:

    RedSquare
        ↓
    locally available tweets
        ↓
    display immediately

The application can then retrieve additional transactions from Archive peers.

This can make the application responsive without requiring every page load to begin with a remote request.

The exact caching strategy belongs to the application.

It should not be elevated into a universal Saito architecture.

---

# 31. Local Data and Remote Data

An application may have both:

    locally cached information

and:

    remotely available information.

It can use local information immediately.

Then it can retrieve remote information when the appropriate peer becomes available.

The important UI question is what to display while waiting.

Possible choices include:

    show cached content immediately
    show a loading screen
    show a partial interface
    show cached content and append remote content
    wait until remote content is available

These are UI/UX decisions.

They should not be mistaken for a universal communication rule.

---

# 32. The UI Determines How Remote Data Is Incorporated

Suppose the UI has already displayed cached content and remote data arrives.

The application must decide:

    Should the UI append the new data?

    Should it replace the cached data?

    Should it ignore duplicates?

    Should it re-render?

    Should it update only a particular component?

    Is the user currently interacting with the displayed content?

These are application and UI decisions.

The network API does not answer them.

A well-designed component hierarchy makes these decisions easier to implement because the application can update the appropriate component rather than broadcasting a global UI event.

---

# 33. Search Can Change the Architecture

Some application features create much stronger infrastructure requirements than they initially appear to.

Consider:

    "Add search."

In a conventional website, a developer may assume:

    browser
        ↓
    server
        ↓
    SQL query

In a peer-to-peer application, the developer must ask:

> Who is going to answer this search?

If the browser cannot search its own complete dataset, some peer must maintain an index.

That can imply:

    search feature
        ↓
    indexed data
        ↓
    node database
        ↓
    query API
        ↓
    off-chain peer request

This is an architectural consequence of the feature.

The AI should recognize it rather than silently inventing a server.

---

# 34. SQL Queries Imply a Service

If an application requires a query such as:

    search tweets for "Saito"

some node must possess data that can answer the query.

That may require:

    SQL database
    search index
    full node
    Archive-like service
    another indexing service

The browser cannot magically query data that it does not possess.

If the application decides that a full node should answer the query, the application has implicitly created an off-chain service relationship.

That relationship should be explicit in the implementation.

---

# 35. Not Every Feature Needs a Database

The opposite mistake is also common.

An AI may hear:

    "The application needs data"

and immediately create:

    SQL database
    repository
    model
    service
    synchronization layer

This is unnecessary when the required information already exists in:

    transaction
    wallet
    blockchain
    Archive
    module memory
    another Saito API

Before creating a database, determine whether the application actually needs one.

---

# 36. Direct Peer-to-Peer Applications

Some applications do not need a central database at all.

For example, a video-call application might work conceptually as:

    User A
        ↓
    request / discovery
        ↓
    User B

then:

    User A ↔ User B
        direct peer connection
        encrypted data channel

Once the direct channel exists, the high-volume application data does not need to pass through the blockchain.

This is an important pattern for decentralized applications.

The Saito network can help establish the relationship.

The actual application data can then travel through an appropriate direct encrypted channel.

---

# 37. Discovery and Data Transfer Can Be Separate

An application does not have to use the same communication mechanism for:

    discovering another user

and:

    transferring application data

For example:

    Saito message
        ↓
    "Connect with me."

then:

    peer connection
        ↓
    encrypted direct channel

then:

    direct channel
        ↓
    video / audio / files / other data

This is often much more efficient than attempting to put the actual data into blockchain transactions.

---

# 38. Peer-to-Peer Channels

If an application needs direct browser-to-browser communication, it can establish the appropriate peer-to-peer connection.

For example, a browser application may use STUN/WebRTC-style connectivity to establish a direct path.

The application can then use the direct channel for:

    files
    media
    game data
    large messages
    other high-bandwidth information

The blockchain should not be treated as a universal data transport layer.

---

# 39. Blockchain Relevance and Light Clients

Saito light clients do not necessarily receive every transaction on the network.

A light client tracks a subset of public keys.

The blockchain synchronization process uses that information to determine which transactions are relevant to the client.

Therefore:

    full node
        receives full blocks

while:

    light client
        receives SPV-relevant blockchain information

This matters for application design.

An application should not assume that every user will automatically receive every transaction.

---

# 40. Making a Transaction Relevant to a User

If an application needs a particular user to receive a blockchain transaction, the application can make that user's public key relevant to the transaction.

One mechanism is to include the user's public key as a zero-fee output.

Conceptually:

    transaction
        ↓
    zero-fee output to user's public key
        ↓
    transaction becomes relevant to that key
        ↓
    light client receives it

This can be useful when the application wants to notify or deliver information to a particular user through the blockchain.

The transaction can therefore serve as both:

    application information

and:

    relevance signal for a light client.

---

# 41. Keychain Watch State

A light client can expand the set of public keys it tracks through the keychain.

An application can:

    add a contact
        ↓
    mark the address as watched
        ↓
    update the Saito Core/Rust layer
        ↓
    blockchain synchronization uses the expanded key set

This means an application can dynamically tell the blockchain synchronization layer:

> I am now interested in transactions involving this public key.

The application should use the existing keychain and synchronization mechanisms rather than building its own blockchain filtering system.

---

# 42. The Keychain Is Part of Blockchain Relevance

The keychain therefore has a role beyond contacts.

Watched public keys can influence which blockchain transactions a light client receives.

Conceptually:

    keychain
        ↓
    watched public keys
        ↓
    Core/Rust synchronization state
        ↓
    relevant blockchain transactions
        ↓
    application modules

This is different from:

    app.connection

and different from:

    Archive.

It is part of the mechanism by which the client determines which blockchain information it needs.

---

# 43. Blockchain Synchronization

"Saito synchronization" has a specific meaning in the codebase.

It generally refers to the process of bringing a node or light client up to date with the blockchain.

Conceptually:

    connect
        ↓
    blockchain synchronization
        ↓
    blocks / SPV information
        ↓
    relevant transactions
        ↓
    modules inspect transactions

This is fundamentally different from an application asking:

    "Give me the last 20 tweets."

The latter is an application data request.

Do not call every remote data request "blockchain synchronization."

---

# 44. Blockchain Synchronization and Application Processing

Once blockchain data arrives, modules determine whether they care about the transactions.

For example:

    block arrives
        ↓
    transaction
        ↓
    module onConfirmation()
        ↓
    application-specific processing

The blockchain synchronization layer gets the blockchain information to the client.

The application module decides what to do with relevant transactions.

This division should remain clear.

---

# 45. `onConfirmation()`

`onConfirmation()` is the normal module hook for blockchain transactions belonging to the application.

A typical module may check:

    tx.msg.module === this.name

and then:

    tx.msg.request

to determine what application operation occurred.

The application can then:

    update SQL
    update memory
    create domain objects
    trigger application behavior
    notify local components

The blockchain synchronization system does not decide what those application-specific consequences should be.

---

# 46. Blockchain Confirmation Is Different From Peer Response

A peer response means:

    another node answered a request.

A blockchain confirmation means:

    the transaction has been observed as part of the blockchain processing lifecycle.

These are different events.

For example:

    off-chain request
        ↓
    peer response

does not mean:

    blockchain confirmation

Likewise:

    blockchain transaction
        ↓
    confirmation

does not mean:

    an off-chain request/response occurred.

The application should use the appropriate mechanism for the operation.

---

# 47. Transaction Monitor

Blockchain operations can introduce unavoidable waiting.

A user may:

    click "send"
        ↓
    transaction created
        ↓
    transaction propagated
        ↓
    wait for block
        ↓
    wait for confirmation

During this period, the user may not know whether:

    the transaction was accepted
    the transaction is being processed
    the transaction is delayed
    the transaction failed
    the interface is broken

This uncertainty is a UX problem.

Saito provides the Transaction Monitor and related UI mechanisms to help manage this experience.

Applications should use these mechanisms where appropriate rather than inventing a completely separate transaction-waiting UI.

---

# 48. Waiting Is a Product Problem

Blockchain latency is not merely a network implementation detail.

For a user:

    "I clicked the button and nothing happened"

can feel like an application failure even when the blockchain is functioning correctly.

The application should therefore pay attention to critical waiting points.

Examples include:

    transaction submission
    blockchain confirmation
    NFT arrival
    token transfer
    wallet updates
    peer requests that may take time

The UI should communicate:

    what happened
    what is happening now
    what the user should expect
    whether the user needs to do anything

The Transaction Monitor is one of the Saito-native tools for this purpose.

---

# 49. Do Not Hide Waiting Behind Silent Requests

An AI may implement:

    await app.network.propagateTransaction(...)

and leave the user staring at an unchanged interface.

That is technically functional but poor application behavior.

If the user has initiated an operation whose completion depends on:

    blockchain processing
    remote peer response
    transaction confirmation

the UI should make that waiting state understandable.

Use the existing Saito UI infrastructure where appropriate.

---

# 50. Failure Handling

Saito attempts to maintain peer connectivity.

This does not mean that every application-level request is guaranteed to succeed.

For example:

    peer connects
        ↓
    peer advertises Archive
        ↓
    application requests transactions
        ↓
    peer disappears

The network may reconnect to peers.

But the application still has to determine:

    whether to retry
    whether to try another service peer
    whether to show an error
    whether to continue with cached data
    whether to show a loading state

Saito cannot know what "successful completion" means for every application.

---

# 51. Service Failure Is an Application Concern

If an application depends on a peer service, it should account for:

    no response
    malformed response
    unavailable peer
    stale data
    incomplete data
    disconnected peer

The application can maintain multiple service peers if redundancy is important.

There is no universal application-level retry architecture that should be inserted into every module.

---

# 52. Peer Connectivity Versus Application Reliability

Keep these concerns separate.

Saito networking attempts to maintain:

    peer connectivity

The application determines:

    request semantics
    expected response
    completeness
    retry policy
    fallback behavior
    user-facing failure state

Do not build a generic "reliable network service" merely because the application needs to retry one particular request.

Put the retry logic with the semantic operation that actually needs it.

---

# 53. Requesting One Transaction Versus Many

An application should understand what kind of request it is making.

A request for:

    one exact transaction

is different from:

    many historical transactions

The first may use an identifier such as:

    transaction signature

The second may require:

    pagination
    query parameters
    date/range information
    application-specific filtering
    Archive service

The API should reflect the actual question.

Do not invent a generalized synchronization abstraction when the application simply needs:

    "Give me this transaction."

or:

    "Give me the next batch of transactions."

---

# 54. Transaction Signatures as Identifiers

Transaction signatures are often useful application identifiers.

When a domain object is created from a transaction:

    transaction
        ↓
    transaction signature
        ↓
    domain-object ID

For example:

    Tweet ID
        =
    transaction signature

This makes it easy to refer to a particular object and retrieve its source transaction.

The transaction signature is effectively a unique identifier for the transaction.

---

# 55. Transaction Timestamps

Transaction timestamps have several uses, but should not automatically be interpreted as a reliable global application clock.

One important use is contributing to transaction uniqueness.

The transaction signature can then serve as a unique identifier.

Transactions may also carry timestamps that applications can display or use for local purposes.

But applications should not assume:

    transaction timestamp
        =
    authoritative global event time

Distributed applications often do not need such a global clock.

A node can legitimately record:

> I saw this transaction at this time.

That local observation can be useful for caching and presentation.

---

# 56. Do Not Build Global Time Assumptions Into Caches

If an application caches data, it may use local observation time.

For example:

    tweet
        ↓
    observed locally at 14:32

That does not imply:

    tweet globally occurred at 14:32.

Caching and presentation often need only local temporal information.

Do not create elaborate global synchronization logic merely because an application displays timestamps.

---

# 57. Application Data Retrieval Is Application Design

An application may need:

    newest tweets
    oldest tweets
    one specific tweet
    search results
    a user's history
    NFT metadata
    game state
    transaction history

These are different questions.

The communication protocol should be designed around the actual query.

For example:

    get transaction X

is different from:

    get recent transactions

which is different from:

    search all transactions matching Y.

Do not create a generic request system that hides these distinctions.

---

# 58. Search Requires an Answering Party

Search deserves special attention because it often exposes hidden assumptions in decentralized application designs.

Suppose a user asks:

    "Find every post containing Saito."

The browser can only answer that question if it has the relevant dataset.

If it does not, another node must answer.

That node may need:

    complete transaction history
    parsed application data
    SQL tables
    indexes
    search logic

The application has therefore created a service requirement.

A request might then look conceptually like:

    browser
        ↓
    off-chain request
        ↓
    peer providing search service
        ↓
    SQL/index query
        ↓
    results

This is not a flaw.

It is simply the consequence of the requested feature.

The AI should recognize this architectural implication rather than pretending that decentralized applications have unlimited access to arbitrary global queries.

---

# 59. P2P Alternatives to Centralized Queries

Some applications can avoid a database-backed query service.

For example, a peer-to-peer video application can establish a direct connection between participants.

Instead of:

    browser
        ↓
    central database
        ↓
    search/service endpoint

it can use:

    User A
        ↓
    discovery
        ↓
    User B
        ↓
    direct encrypted channel

The application design determines which architecture makes sense.

Saito does not require every decentralized application to have a full-node SQL backend.

---

# 60. UI-First Development

For Saito applications, it is often productive to start with the UI.

Begin by building:

    main UI component
        ↓
    child components
        ↓
    required displays
        ↓
    interactions

Then, whenever a component needs information, ask:

> Where does this information come from?

It may be:

    already in module memory
    in a cached transaction
    in the blockchain
    in Archive
    available from a peer
    stored in module SQL
    available through another module
    something that must be fetched

This allows the communication architecture to emerge from the actual application requirements.

---

# 61. Work Backward From What the UI Needs

Suppose a UI component needs:

    user's last ten posts

Start with:

    What does the component need?

Then ask:

    Does the module already have those posts?

If yes:

    render them.

If not:

    Can the module retrieve them from local storage?

If yes:

    load them.

If not:

    Does another peer provide them?

If yes:

    wait for onPeerServiceUp()
        ↓
    request them.

If the application needs the data permanently:

    save transactions appropriately.

This is generally more productive than designing an abstract synchronization protocol first.

---

# 62. UI Components Expose Missing Data Requirements

A useful consequence of UI-first development is that missing data becomes concrete.

For example:

    Tweet component
        needs:
            text
            author
            image
            timestamp

The developer can then determine:

    which values are already in tx
    which values are derived
    which values need caching
    which values need remote retrieval

This avoids prematurely building:

    DataService
    TweetRepository
    TweetSynchronizationManager

before knowing what the UI actually requires.

---

# 63. The AI Should Not Invent Middleware

A frequent AI failure is to insert intermediary functions between the UI and the actual data.

For example:

    getTweetText()
        ↓
    extractTweetText()
        ↓
    normalizeTweetText()
        ↓
    returnTweetText()
        ↓
    tx.msg.data.text

If there is no semantic reason for those layers to exist, they are harmful.

The data may already be directly available from:

    tx
    domain object
    module state

Use the existing structure.

Add a function when it represents a meaningful operation, not merely because an AI expects every field access to have a getter.

---

# 64. Avoid Middleware Variables

The same problem occurs when an AI creates:

    this.tweetText
    this.tweetAuthor
    this.tweetTimestamp
    this.tweetImages

simply because those values can be extracted from a transaction.

Those variables can become accidental architecture.

Other code starts depending on them.

Future AI agents then see them and assume:

> These are the canonical application fields.

The original transaction structure becomes obscured.

Keep the underlying transaction accessible.

Extract only what the application genuinely benefits from treating as a domain-level property.

---

# 65. Communication Should Follow Ownership

A useful general rule is:

    direct call
        when an object owns the operation

    app.connection event
        when independent local objects need asynchronous notification

    respondTo()
        when a local module capability is needed

    peer service
        when a remote node advertises a capability

    off-chain transaction request
        when a peer needs application information

    blockchain transaction
        when the information/action requires blockchain properties

    direct P2P channel
        when participants need high-bandwidth or continuous communication

These are not layers of one generic communication system.

They are different mechanisms for different problems.

---

# 66. Do Not Turn Every Communication Path Into a Service

A conventional architecture may encourage:

    controller
        ↓
    service
        ↓
    repository
        ↓
    transport

Saito applications do not require this structure.

For example:

    UI
        ↓
    app.network.sendRequestAsTransaction()

may be entirely appropriate if the UI owns the operation.

Likewise:

    component
        ↓
    mod.someFunction()

may be preferable to introducing a service object.

Add an abstraction when it expresses real application semantics.

Do not add one merely to make the architecture look conventional.

---

# 67. Do Not Use Polling When Lifecycle Events Exist

A common AI mistake is:

    setInterval(...)
        ↓
    check whether a peer exists
        ↓
    check whether a service exists
        ↓
    fetch data

when Saito already provides:

    onPeerServiceUp()

Use the lifecycle event.

The application can respond when the required service actually becomes available.

Polling should be used only when the application genuinely needs periodic polling.

---

# 68. Do Not Fetch During Initialization

This deserves repetition because it is a common AI-generated error.

Do not assume:

    initialize()
        ↓
    fetch remote content

The module may initialize before peers are available.

Instead:

    initialize()
        ↓
    prepare module

    onPeerServiceUp()
        ↓
    request remote content

This is one of the most important lifecycle rules for distributed Saito applications.

---

# 69. Do Not Create a Backend Because the UI Looks Like a Website

A Saito application may have:

    pages
    menus
    feeds
    search
    profiles
    forms
    buttons

and still not have a conventional backend.

The question is:

> What data does the UI actually require, and who can provide it?

Some features may require:

    Archive

Some may require:

    a module service

Some may require:

    blockchain transactions

Some may require:

    direct P2P communication

Some may be entirely local.

The visual similarity to a website does not determine the architecture.

---

# 70. Communication Design Is Flexible

There are multiple valid ways to implement a feature.

For example, an application might:

    retrieve data from Archive

or:

    communicate directly with another peer

or:

    publish information on-chain

or:

    maintain a local database

depending on what the feature requires.

The documentation should guide AI toward good choices without pretending there is always exactly one correct architecture.

The goal is:

> the simplest correct Saito-native implementation.

---

# 71. Avoid Premature Protocol Design

Protocol design is useful when the application actually requires a protocol.

It should not become a ritual that happens before every implementation.

A practical development process is often:

    build the main UI
        ↓
    identify required information
        ↓
    determine where that information can come from
        ↓
    add the minimum required communication
        ↓
    test the resulting flow
        ↓
    refine the protocol where necessary

This is often more productive than designing an abstract network protocol before the application requirements are visible.

---

# 72. The AI Should Ask "Who Has This Data?"

Whenever a component needs information, the AI should ask:

    Is it already in the transaction?

    Is it already in the domain object?

    Is it already cached by the module?

    Is it in local SQL?

    Is it in Archive?

    Is it on the blockchain?

    Is it available from another module?

    Is it available from a peer?

    Does somebody need to create a service to provide it?

This is much more useful than immediately creating a new storage or network layer.

---

# 73. The AI Should Ask "Why Does This Need to Move?"

Before creating a network request, ask:

    Why does the recipient need this information?

If the answer is:

    another local component needs to know

use a local mechanism.

If:

    another module provides the capability

use the module interface.

If:

    another node needs the data

use peer communication.

If:

    everyone who is relevant should receive it and it requires blockchain semantics

use an on-chain transaction.

If:

    two users need a continuous high-bandwidth connection

use an appropriate direct peer channel.

The communication mechanism should follow the requirement.

---

# 74. The AI Should Ask "What Is the Smallest Message?"

Do not send more than the recipient needs.

For example:

    "Retrieve transaction X"

may require only:

    X's signature.

It may not require:

    the entire Tweet
    the entire user profile
    all cached metadata
    every related transaction

Likewise, an on-chain transaction should contain only the application information necessary for its purpose.

Smaller messages are easier to reason about and cheaper to transmit and store.

---

# 75. The AI Should Preserve Existing Source Objects

If an application object originates from:

    transaction

keep the transaction available when it remains useful.

If an application object originates from:

    database row

retain the relationship to the row when appropriate.

If an application object represents:

    remote data

do not automatically copy every field into a second representation.

The application should maintain clear relationships between:

    source data
    domain representation
    cached data
    presentation data

without unnecessary duplication.

---

# 76. Communication and Memory Usage

Communication architecture affects memory architecture.

A large transaction can contain substantial application data.

If an AI:

    receives transaction
        ↓
    copies complete transaction
        ↓
    extracts fields
        ↓
    creates another copy
        ↓
    sends another copy to UI

memory use can grow unnecessarily.

Prefer retaining references to existing objects and extracting only the fields that have real application-level meaning.

This is particularly important in browser applications.

---

# 77. Blockchain Data Is Not Automatically Available Everywhere

A transaction appearing on the blockchain does not mean that every application instance has the complete transaction.

Full nodes receive full blocks.

Light clients receive information relevant to the public keys they are tracking.

Therefore:

    "the transaction is on-chain"

does not necessarily mean:

    "this browser has the transaction."

The application may need to:

    watch additional public keys
    retrieve historical transactions
    query Archive
    request data from another peer

depending on its requirements.

---

# 78. Adding a Contact Can Change What a Client Receives

Suppose a user starts following another public key.

The application can add that public key to the keychain and mark it as watched.

The client can then update the blockchain synchronization layer with the expanded set of watched keys.

Conceptually:

    add contact
        ↓
    mark public key watched
        ↓
    update Core/Rust synchronization state
        ↓
    future blockchain synchronization
        ↓
    transactions involving that key become relevant

This is a Saito-native way to expand the blockchain information available to a light client.

Do not create a separate blockchain polling mechanism for watched contacts.

---

# 79. Blockchain Synchronization Is Handled by Saito Core

The application should not implement its own blockchain synchronization protocol.

The Core/Rust/WASM layer is responsible for:

    blockchain synchronization
    block handling
    light-client relevance
    chain state

The application modules receive the relevant blockchain events and transactions and decide what those transactions mean to the application.

This is a major architectural boundary.

---

# 80. Application Caching Is Not Blockchain Synchronization

If RedSquare stores tweets locally and later asks an Archive peer for additional tweets, that does not mean RedSquare is implementing blockchain synchronization.

It is implementing application data availability and caching.

The distinction is:

    blockchain synchronization
        Core/Rust
        brings blockchain state to the client

    application caching
        module
        keeps useful application data available to the UI

    remote data retrieval
        module/network
        obtains application data from another peer

Do not collapse these into one concept.

---

# 81. Communication Patterns in Practice

A few common patterns illustrate the architecture.

## On-chain application action

    UI
      ↓
    module transaction function
      ↓
    app.wallet
      ↓
    sign
      ↓
    app.network.propagateTransaction()
      ↓
    blockchain
      ↓
    onConfirmation()
      ↓
    application state
      ↓
    UI

## Off-chain data request

    UI / module
      ↓
    wait for onPeerServiceUp()
      ↓
    app.network.sendRequestAsTransaction()
      ↓
    peer
      ↓
    handlePeerTransaction()
      ↓
    response
      ↓
    application state
      ↓
    UI

## Local asynchronous notification

    Module A
      ↓
    app.connection.emit()
      ↓
    Module B / component
      ↓
    update state or take action

## Direct UI ownership

    Main
      ↓
    TweetManager
      ↓
    Tweet
      ↓
    render()

## Direct P2P application

    User A
      ↓
    discovery / request
      ↓
    User B
      ↓
    direct encrypted peer channel
      ↓
    application data

These are different mechanisms.

None is the universal Saito communication pattern.

---

# 82. A Practical Decision Process

When implementing a feature, work from the user-visible requirement.

Start with the UI.

Determine what the UI needs.

Then ask:

    Where does the required information currently exist?

If it already exists:

    use it directly.

If it needs to be cached:

    cache it in the appropriate application-owned location.

If it exists in a transaction:

    use the transaction.

If the transaction needs to persist:

    save it appropriately.

If it needs to be retrieved later:

    use app.storage / Archive.

If another peer needs to provide information:

    use a peer request.

If the peer needs to advertise that it can provide the service:

    use returnServices() and onPeerServiceUp().

If the information requires blockchain security or consensus:

    use an on-chain transaction.

If two users need direct continuous communication:

    establish an appropriate peer-to-peer channel.

Only introduce additional infrastructure when the feature actually requires it.

---

# 83. Common AI Mistakes

The following mistakes should be actively avoided.

## Fetching from peers in `initialize()`

Wrong:

    initialize()
        ↓
    fetch remote data

because peers may not be connected.

Prefer:

    onPeerServiceUp()
        ↓
    fetch remote data

## Building a generic synchronization manager

Do not create:

    SyncManager
    SynchronizationService
    DataSyncController

unless the application itself genuinely has a semantic need for such an object.

Application data retrieval should remain application-specific.

## Building a REST backend

Do not automatically create:

    /api/tweets
    /api/search
    /api/messages

because the application looks like a website.

Determine whether the required functionality belongs in:

    blockchain
    Archive
    peer service
    direct P2P
    local state

## Creating excessive middleware

Do not create getters, extractors, normalizers, repositories, and services merely to move existing data from one object to another.

## Broadcasting UI events globally

Do not use `app.connection` as the ordinary UI rendering mechanism.

The event system is process-wide.

Use hierarchical component ownership for normal UI control.

## Copying transaction data unnecessarily

Do not duplicate large transaction objects into multiple intermediary structures without a semantic reason.

## Treating timestamps as global truth

Do not assume transaction timestamps provide a reliable global application clock.

## Assuming every client sees every transaction

Light clients only receive blockchain information relevant to the public keys they are tracking.

## Polling for peer availability

Do not repeatedly ask whether an Archive or other service peer exists when `onPeerServiceUp()` provides the relevant lifecycle event.

## Assuming service advertisements guarantee service availability

A peer advertising a service may still fail to respond.

## Treating Archive as magic synchronization

Archive is transaction persistence/retrieval infrastructure.

The application decides what information it needs and how to use retrieved transactions.

---

# 84. The Most Important Lifecycle Rule

For any operation that requires a remote peer:

    Do not assume the peer exists when initialize() runs.

Instead:

    initialize()
        ↓
    prepare the module

    peer connects
        ↓
    service becomes available
        ↓
    onPeerServiceUp()
        ↓
    request data

This rule prevents a large class of race conditions and failed initial loads.

---

# 85. The Most Important Data Rule

Before creating a new variable, object, database table, or service, ask:

> Is this information already available somewhere in the Saito application?

It may already exist in:

    tx
    domain object
    module state
    wallet
    keychain
    blockchain
    Archive
    app.storage
    another module
    remote peer

Do not create middleware merely to make existing information look more conventional.

---

# 86. The Most Important Communication Rule

Do not ask:

> "What communication architecture should I use?"

Ask:

> "What does this feature require?"

Then determine:

    what data moves
    who receives it
    why they need it
    whether it needs consensus
    whether it needs authentication
    whether it needs persistence
    whether it needs discovery
    whether it needs a direct connection

The mechanism follows from those requirements.

---

# 87. Final Mental Model

Saito applications have several communication mechanisms:

    Direct object call
        ↓
    one known object asks another object to act

    app.connection
        ↓
    asynchronous local notification

    respondTo()
        ↓
    local capability

    returnModule()
        ↓
    local direct module access

    returnServices()
        ↓
    advertise a network service

    onPeerServiceUp()
        ↓
    discover that a peer offers a service

    sendRequestAsTransaction()
        ↓
    off-chain transaction-shaped peer message

    handlePeerTransaction()
        ↓
    receive and process off-chain application messages

    propagateTransaction()
        ↓
    publish a transaction through the blockchain

    onConfirmation()
        ↓
    process blockchain-visible application activity

    app.storage
        ↓
    save/load transaction data

    blockchain synchronization
        ↓
    Saito Core brings relevant blockchain information to the client

    direct P2P channel
        ↓
    continuous/high-bandwidth communication between participants

These are not interchangeable abstractions.

The application should select among them according to what the feature actually requires.

---

# 88. Final AI Guidance

When modifying or creating a Saito application, the AI should proceed from the interface the user needs.

Start with the UI.

Identify what information the UI needs.

Find where that information already exists.

If it exists locally, use it.

If it needs caching, cache it.

If it exists in a transaction, use the transaction rather than copying it unnecessarily.

If the transaction needs persistence, use Saito storage.

If another peer needs to provide it, identify the relevant peer service.

Wait for `onPeerServiceUp()` before making peer-dependent requests.

Use `handlePeerTransaction()` for incoming off-chain application requests.

Use `app.connection` for intentional asynchronous local notifications, not as a universal UI rendering system.

Use direct component calls for hierarchical UI ownership.

Use `respondTo()` for local capabilities.

Use `returnModule()` for genuine direct module dependencies.

Use an on-chain transaction when the feature requires blockchain security, consensus, ownership, value transfer, or blockchain-visible publication.

Use off-chain transaction-shaped messages when the application needs peer communication without blockchain publication.

Use direct peer-to-peer channels when the application needs continuous or high-bandwidth communication between participants.

Do not create a server merely because the application resembles a website.

Do not create a database merely because data exists.

Do not create a synchronization manager merely because data comes from a peer.

Do not create middleware merely because an AI expects every value to have a getter.

Do not fetch from peers during initialization when peer availability is not established.

Do not assume a transaction timestamp is a global clock.

Do not assume a light client receives every blockchain transaction.

Do not assume a peer service advertisement guarantees a response.

Above all:

> Build the smallest communication mechanism that actually satisfies the application's requirements, using the Saito mechanisms that already exist.
# Saito Applications — Data and Persistence Practices

## Purpose

Saito applications do not need to follow the conventional Web 2 model in which a browser connects to a central server, the server owns the database, and the browser retrieves application objects from that database.

Saito provides mechanisms for applications to move, store, retrieve, cache, and validate information, but it does not prescribe a single application-data topology.

An application might:

- put information directly into blockchain transactions;
- exchange transactions or messages with another peer;
- connect to a server running the same module and use its database;
- retrieve transaction envelopes from an Archive service;
- maintain a local cache;
- use `app.options` for installation-local state;
- use direct peer-to-peer connections for large or continuous data;
- combine several of these approaches.

The application developer decides how the information should be distributed.

The framework's strong architectural preference is different: when an application communicates or stores data, it should use the standard Saito APIs and transaction/message conventions rather than inventing unnecessary middleware or a parallel application architecture.

This document explains how an AI should reason about application data, transactions, storage, caching, and persistence when developing Saito applications.

---

## 1. Start With the Data, Not the Database

When developing an application, do not begin by asking:

> What database should I create?

Begin by asking:

> What information is being created, who needs to receive it, who needs to retain it, and what does the user have to do for that information to become available?

This distinction is fundamental.

A search box, for example, may appear trivial in a conventional Web 2 application:

1. browser sends search request;
2. central server queries database;
3. server returns results.

In Saito, the important question comes first:

> Who is operating the index that contains the information being searched?

If users are expected to search the complete contents of a particular server's database, then the application can define a service provided by that server and use peer communication and database requests.

But there is no reason for Saito to assume that a universal server containing every application's data exists.

The same feature might instead be implemented using:

- blockchain transactions;
- transactions associated with a particular public key;
- a peer running the relevant module;
- an Archive service;
- locally cached transactions;
- direct communication between users;
- some combination of these.

The data-distribution design belongs to the application.

Saito provides the mechanisms through which the application implements that design.

---

## 2. User Agency Determines What the Application Needs

A useful way to design a Saito application is to identify the actions through which users express agency.

A user might:

- connect to a particular server;
- provide or know another user's public key;
- sign a message;
- create a transaction;
- send an NFT;
- transfer an access key;
- publish information;
- request information from a peer;
- accept an invitation;
- connect directly to another peer.

These actions tell the developer what information actually needs to move through the system.

For example, if two users need to exchange a signed document, there may be no reason to create a central database.

A small Saito application could:

1. obtain a message from one user;
2. partially sign it;
3. send it to another user through Saito;
4. have the second user sign it;
5. forward it to a third party;
6. eventually place the fully signed result on-chain.

This is a distributed workflow without a central application server or application database.

Likewise, if a game requires users to exchange large amounts of graphical or gameplay data, the application might establish a direct peer-to-peer connection and send the data there.

The important design question is therefore not:

> Where is my database?

It is:

> What must the users do, and what information must be available for them to accomplish it?

---

## 3. Saito Does Not Prescribe a Single Application Data Topology

Saito applications can distribute information in many different ways.

### Blockchain data

An application can put data directly into transactions.

The application can then identify transactions by properties such as:

- sender;
- recipient;
- public key;
- transaction signature;
- transaction type;
- application/module;
- request.

The client can observe relevant transactions through the normal blockchain/SPV mechanisms.

### Peer messages and transactions

An application can communicate directly with peers.

The information does not necessarily need to become blockchain state.

This is particularly useful when the application requires rapid interaction and blockchain confirmation would introduce unacceptable latency.

### Module servers

A node running a module can maintain a database and advertise a service.

Other peers can discover that service and request information from the node.

This is a legitimate Saito application architecture, but it is an application-level choice rather than a framework-wide assumption.

### Archive services

An Archive service can retain transaction envelopes and make them available to other peers.

Archive is therefore a database of transaction data.

An Archive record does not imply that the transaction is currently on-chain or in the longest chain.

If an application needs to establish whether a transaction is actually valid blockchain state, it must use the relevant blockchain/UTXO mechanisms rather than assuming that presence in Archive proves inclusion.

### Local state

Applications can maintain local state through:

- memory;
- `app.options`;
- localForage;
- browser Archive storage;
- other module-specific browser storage where appropriate.

The choice depends on what the data represents and how long it needs to survive.

### Direct peer-to-peer data

Saito can also be used to establish direct peer-to-peer connections, including STUN-based connections.

Once a direct data path exists, applications can exchange much larger quantities of information without placing every byte into transactions.

This is particularly useful for games, media, files, and other high-volume data.

---

## 4. Use `app.storage` Rather Than Depending Directly on Archive

`app.storage` is intended to abstract transaction storage from the particular module or service providing it.

The architectural model is:

    application
        ↓
    app.storage
        ↓
    module/service responding to the storage capability

The current implementation has tighter coupling to the Archive module than the intended abstraction would suggest. In the current code, `app.storage` directly obtains the Archive module for local storage.

That implementation coupling is acceptable as a current implementation detail.

It is not the architectural goal.

The intended design is that an application should be able to use `app.storage` without knowing whether the underlying capability is provided by:

- Archive;
- a different Archive implementation;
- another module;
- another service responding to the relevant capability.

Therefore, new application code should use `app.storage` rather than directly importing or depending on Archive internals merely because Archive happens to implement the current storage capability.

The important abstraction is the Saito API.

---

## 5. Persisting and Propagating Are Different Operations

Do not treat transaction storage and transaction propagation as the same operation.

A Saito transaction is a cryptographically signed transaction format.

Propagation means sending that transaction across the network.

Storage means retaining a transaction so that it can later be retrieved.

`app.storage` exists to provide storage/retrieval functionality.

`app.network` provides mechanisms for propagating transactions and communicating with peers.

A transaction can therefore be:

- propagated without being permanently archived;
- archived without being on-chain;
- on-chain without being present in a particular Archive;
- cached in memory;
- exchanged off-chain between peers.

Do not infer one of these properties from another.

In particular:

> Presence in Archive does not imply blockchain inclusion.

If an application needs to know whether a transaction represents current blockchain state, it must verify the relevant blockchain/UTXO conditions.

---

## 6. Transactions Are Application Data Objects

A Saito transaction should not be treated merely as a transport wrapper around application fields.

For many applications, the transaction itself is the application's primary data object.

A transaction can contain:

- payment information;
- NFT information;
- application messages;
- public data;
- encrypted data;
- requests;
- signed information;
- application-specific JSON;
- binary data.

The transaction can then be:

- passed between application functions;
- serialized;
- stored;
- retrieved;
- propagated;
- reconstructed;
- validated;
- displayed;
- used as the basis of a domain object.

This provides an important extensibility property.

Suppose a Tweet transaction initially contains:

    {
      text,
      image
    }

If application functions pass the transaction itself, adding a new field does not require every intermediate function to learn about the new field.

The transaction creation function can change.

Serialization automatically carries the new field.

Storage automatically carries the new field.

Deserialization automatically restores the new field.

The UI component can access the field when it actually needs it.

By contrast, if every function extracts and forwards individual variables:

    addTweet(title, text, image, author, ...)

then adding a new field requires changing a chain of middleware functions.

This is precisely the sort of architecture that becomes difficult for humans and AI systems to maintain.

---

## 7. Do Not Extract Transaction Fields Into Middleware

A major Saito development practice is:

> Pass the transaction rather than repeatedly unpacking the transaction into arguments.

Do not create middleware simply because the next function currently needs three fields from the transaction.

Prefer:

    addTweet(tx)

over something conceptually like:

    addTweet(title, text, image, author, timestamp, ...)

The latter creates an additional representation of the transaction.

That representation now has to be:

- named;
- documented;
- passed between functions;
- updated when the transaction format changes;
- kept consistent with the transaction;
- understood by future developers and AI systems.

Most of the time, that intermediate representation adds no semantic value.

If a component needs a particular field, it can access the transaction when it reaches the point where that field is actually meaningful.

This principle is especially valuable because Saito applications evolve.

A transaction can gain new fields without requiring the entire application call graph to change.

### The preferred flow

Prefer:

    transaction
        ↓
    application function
        ↓
    domain object/component
        ↓
    specific field used for rendering or behavior

Avoid:

    transaction
        ↓
    extractor
        ↓
    DTO
        ↓
    helper
        ↓
    service
        ↓
    controller
        ↓
    component
        ↓
    extracted field

The latter is conventional application middleware.

It is usually unnecessary in Saito.

---

## 8. Transaction Signatures Can Be Application Object IDs

Because transactions have cryptographic signatures, the signature is often an excellent identifier for an application object.

For example, an application can maintain:

    tweets[tx.signature] = tweet

A UI component can place the signature into its DOM identity:

    data-id="<transaction signature>"

When the user clicks the component, the event handler can recover the signature and retrieve the transaction from the application's cache.

This avoids placing every relevant data field into the DOM.

The pattern becomes:

    DOM event
        ↓
    transaction signature
        ↓
    module cache / transaction lookup
        ↓
    transaction
        ↓
    operation

This is particularly useful for interactive applications because it keeps the UI tied to the application's actual data object rather than to a parallel collection of copied values.

The transaction signature is therefore not merely a blockchain identifier. It can also be a convenient application-level object identifier.

---

## 9. Domain Objects Are for Semantic Organization

Saito does not require every transaction to become a domain object.

A domain object is useful when the application has a concept that developers naturally think about and manipulate.

Examples include:

- Tweet;
- SaitoNFT;
- Listing;
- Game;
- Chat group;
- invitation.

The purpose is semantic organization.

A developer should be able to look at the application and understand:

    Tweet.js
        → Tweet behavior and rendering

    Manager.js
        → Tweet manager behavior and rendering

    SaitoNFT.js
        → NFT behavior and presentation

This also provides a predictable location for future code.

If a new feature concerns the behavior of a Tweet, the developer or AI knows to look at the Tweet implementation.

This is preferable to scattering Tweet functionality across generic:

- models;
- repositories;
- controllers;
- services;
- data mappers;
- helpers.

A domain object does not mean that Saito has adopted an ORM-style model architecture.

It means that the application has a named concept worth organizing around.

---

## 10. Domain Objects May Also Be UI Components

A Saito domain object can legitimately contain UI behavior.

For example, a Tweet object may know how to:

- render itself;
- attach its events;
- interpret its transaction;
- update itself;
- expose information required by the surrounding manager.

Likewise, SaitoNFT can be both a representation of the NFT concept and a UI component associated with that concept.

This is intentional.

The distinction between “data model” and “UI component” should not be imported mechanically from other frameworks.

The useful question is:

> Does this object represent a coherent application concept with coherent behavior?

If yes, keeping that behavior together is often the simplest architecture.

---

## 11. Domain Organization Also Creates UI and CSS Boundaries

Semantic organization has a second benefit.

When application concepts are organized into coherent components, their CSS can be organized around the same concepts.

For example:

    web/
      css/
        mod-tweet.css
        mod-manager.css
        mod-manager-overlay.css

The corresponding code can live in semantically named components.

This creates a natural namespace for styling.

A Tweet's CSS belongs to the Tweet component.

A Manager's CSS belongs to the Manager component.

The CSS does not need to define generic global rules such as:

    .button { ... }

that accidentally modify unrelated modules.

Instead, styles can be scoped to the application's component namespace.

This is valuable both for developers and for AI systems because the semantic structure of the application tells the AI where related code belongs.

The result is not merely cleaner organization. It reduces accidental coupling between independently installed Saito modules.

Detailed CSS practices belong in the Saito CSS documentation, but the architectural principle belongs here:

> Semantic application boundaries should also provide natural boundaries for presentation code.

---

## 12. Retain the Transaction When the Transaction Matters

A domain object does not necessarily need to copy every transaction field.

Often the best pattern is:

    this.tx = tx

followed by copying only the small number of fields that make the object's behavior or rendering convenient.

Retaining the transaction is particularly useful when the application may later need to:

- inspect the original transaction;
- validate it;
- access fields that were not initially needed;
- modify permitted metadata;
- update transaction storage;
- rebroadcast it;
- serialize it again;
- retrieve related information.

Tweet is an example of this pattern.

SaitoNFT can also retain the transaction once it has fetched the underlying mint transaction.

This does not mean that every domain object must retain its transaction.

A Listing, for example, can be more naturally represented by a SQL inclusion record containing the information needed to manage current inventory.

The rule is semantic:

> Retain the transaction when the transaction itself remains a useful application object.

Do not retain it merely because every object is supposed to have one.

---

## 13. `tx.msg` Is Application Data

The message portion of a transaction is normally an application-defined object.

In many applications it is JSON, although transactions can also carry binary information.

Saito's core blockchain does not need to understand the semantics of this application data.

A full node is primarily concerned with the properties necessary for consensus, including whether:

- the transaction is valid;
- its cryptographic commitments validate;
- its inputs and outputs satisfy the protocol;
- the block containing it is valid.

The application message can then be interpreted by the modules that care about it.

A client receiving an SPV-relevant subset of blockchain transactions can identify the transactions relevant to its watched data and allow the appropriate modules to process them.

This separation is important:

> Blockchain consensus does not need to understand the application's domain model.

The module does.

---

## 14. `tx.optional` Provides Mutable, Unsigned Metadata

`tx.optional` is a special and useful part of the transaction format.

The transaction can be serialized and deserialized with its optional data intact.

However, the cryptographic transaction validation does not treat this field as part of the signed transaction contents.

Consequently, a transaction can acquire additional optional metadata without invalidating the original cryptographic signature.

For example, a RedSquare implementation can maintain:

- like counts;
- retweet counts;
- other application metadata.

The module can retrieve the transaction, update the optional metadata, and save the transaction again.

A later user receiving that serialized transaction receives both:

- the original cryptographically validated transaction;
- the additional unsigned metadata.

The metadata is useful, but it does not become cryptographically authoritative merely because it is attached to the transaction.

A receiving application cannot conclude from the transaction signature alone that the optional metadata was supplied by the original transaction creator.

If the application needs stronger guarantees, it can introduce its own cryptographic mechanism.

For example, optional metadata could reference:

- another blockchain transaction;
- a signed statement;
- an event that can independently be validated;
- another cryptographic commitment.

The important distinction is:

> The underlying transaction remains cryptographically verifiable even though `tx.optional` is mutable and unsigned.

---

## 15. Optional Data Can Function as a Distributed Cache

`tx.optional` creates an interesting application pattern.

Imagine a transaction identified by signature `S`.

A service receives events associated with `S` and maintains:

    S → number of likes

The service can load the transaction, update its optional metadata, and save it.

The next user who retrieves transaction `S` receives the updated metadata.

The transaction therefore becomes a convenient container for evolving application information.

The original transaction remains cryptographically meaningful.

The metadata can evolve independently.

The application receiving the transaction can decide whether and how much to trust the metadata.

This pattern can be used for things such as:

- social statistics;
- cached counters;
- oracle information;
- derived metadata;
- application-specific indexes.

For example, a server might update an oracle price associated with a transaction and attach additional information or a cryptographic signature identifying the source.

The important point is that the application is deliberately distinguishing:

    cryptographically committed transaction data

from:

    useful but independently supplied metadata.

---

## 16. Archive Is a Database, Not Blockchain State

Archive should be understood as a database containing transaction envelopes.

It is not the blockchain.

It is not consensus.

It is not proof that a transaction is currently in the longest chain.

A node may save transactions into Archive because:

- an application explicitly saved them;
- the Archive indexer stored them;
- a module uses Archive as its persistence mechanism;
- another peer requested that they be stored.

The fact that an Archive database contains a transaction does not establish that the transaction is currently confirmed on-chain.

If an application needs to determine whether a transaction is blockchain state, it must inspect the appropriate blockchain/UTXO information.

This distinction is especially important for NFTs and spendable assets.

An Archive can tell you that a transaction envelope exists.

The wallet/UTXO system can tell you about the corresponding spendable blockchain state.

These are different questions.

---

## 17. Archive Does Not Mean “Everything”

Applications should not assume that every transaction automatically appears in every Archive.

Archive has an indexer, but applications can opt out of automatic indexing and explicitly save the transactions they care about.

This means that if a node operator wants their node to function as an Archive service for a particular application, the module running on that node needs to save the relevant transaction envelopes to the node's Archive.

The service is therefore a combination of:

    peer running the service
        +
    application/module that actually stores the relevant data

A developer should not assume:

> I am running an Archive node, therefore every transaction my users need will automatically be available.

The module's data-retention behavior matters.

---

## 18. Archive Services Are Discovered, Not Assumed

A Saito application can discover peers providing an Archive or application-specific service.

The application can then request information from those peers.

This is different from assuming that every Saito application has access to a universal centralized database.

A peer service is an available capability.

It is not a guaranteed global authority.

If an application requires information from a particular server, then the application should make that dependency explicit.

If the application can function with any peer providing a service, it can discover an appropriate peer dynamically.

This is an important distinction for AI-generated applications because conventional Web 2 development tends to produce assumptions such as:

    const SERVER = "https://canonical-server.example";

Saito applications should not introduce such a dependency merely because it is familiar.

If a specific server is genuinely part of the application's design, then using it is perfectly legitimate.

The point is to make the architectural dependency intentional.

---

## 19. Module SQL Is Optional

Saito modules do not automatically need SQL.

Many applications have no module SQL at all.

SQL becomes useful when a particular node needs a relational or indexed representation of application data.

Typical reasons include:

- searching large datasets;
- joins;
- inventory;
- approvals;
- indexes;
- relational queries;
- longest-chain projections;
- operational summaries;
- large persistent caches.

Store and Registry are examples of applications where SQL provides useful node-side indexes and derived state.

This does not mean every application should create a database.

Before adding SQL, ask:

> Can this application simply retain the transaction objects in memory?

If yes, that may be the better implementation.

---

## 20. Memory Can Be the Correct Cache

Saito applications can maintain transaction objects in memory.

For example, an application may keep:

    transactions[signature] = tx

and use those objects directly.

For a small or moderate application, this can be extremely fast.

A module can load a bounded set of recent transactions when it becomes available and immediately provide them to the UI without querying a database.

A simple application may therefore have:

    blockchain / peer
          ↓
       transactions
          ↓
      module memory
          ↓
          UI

without introducing SQL at all.

The appropriate cache size and persistence strategy depend on application scale.

A module processing a small amount of information may need nothing more than an in-memory cache.

A high-volume application may need persistent SQL indexes or an Archive.

Do not add infrastructure before the application's scale and requirements justify it.

---

## 21. Off-Chain Transactions Can Solve Latency Problems

Blockchain confirmation is intentionally not the fastest possible communication mechanism.

An application such as a game may become unpleasant if every interaction requires waiting for blockchain confirmation.

For example:

    player A creates invitation
        ↓
    blockchain propagation
        ↓
    confirmation
        ↓
    player B receives invitation

can introduce significant latency.

Instead, players can exchange transaction-shaped application messages off-chain.

The same transaction format can still describe the invitation.

The application can decide whether the transaction should be:

- sent directly to another peer;
- broadcast as an off-chain transaction;
- cached in memory;
- stored in a database;
- eventually committed on-chain.

This allows the application to retain a consistent application-data representation while choosing the communication mechanism appropriate to the interaction.

---

## 22. A Transaction Can Move Through Multiple Storage Layers

A transaction does not have to belong exclusively to one storage mechanism.

A typical application may have:

    Transaction
        ↓
    in-memory cache
        ↓
    Archive
        ↓
    remote Archive service

while another application may have:

    Transaction
        ↓
    SQL-derived representation
        ↓
    module database

and another may have:

    Transaction
        ↓
    blockchain
        ↓
    wallet / UTXO state

These are not contradictory architectures.

They answer different application requirements.

The mistake is to create multiple representations without knowing why each representation exists.

---

## 23. SQL Should Represent a Concrete Application Requirement

When SQL is introduced, the AI should be able to explain why it exists.

Good reasons include:

> We need to find listings by several indexed properties.

> We need to maintain a node-local inventory projection.

> We need relational joins.

> We need to retain a large derived index across restarts.

> We need to maintain approval or moderation state that belongs to this node.

Bad reasons include:

> The application has data, therefore it needs a database.

> The UI has a list, therefore I need a table.

> The transaction has fields, therefore I should copy all of them into SQL.

> Web applications normally have models and databases.

The database should solve a demonstrated problem.

It should not exist merely because database-backed application development is familiar.

---

## 24. `app.options` Is Installation-Local State

`app.options` represents state belonging to the local installation.

It is appropriate for things such as:

- wallet information;
- keys;
- module installation state;
- preferences;
- cursors;
- local configuration;
- lightweight application state.

Some applications legitimately store substantial state there.

Game engines, for example, can persist the current game state through `app.options`.

Therefore the rule should not be:

> Never put large data in options.

The better rule is:

> Use `app.options` when the state belongs to this installation and the application has deliberately chosen options as its persistence mechanism.

Do not use `app.options` as a substitute for a queryable application database.

Do not put an application's entire transaction history there merely because it needs to persist.

---

## 25. Browser Persistence and Node Persistence Are Different

Module SQL is fundamentally a Node-side capability.

Browsers should not assume that the module's SQLite database exists locally.

Browser applications can instead use:

- `app.options`;
- localForage;
- browser Archive storage;
- module-specific browser storage;
- remote services;
- peer communication.

`app.storage` is intended to provide appropriate storage behavior across environments.

If a module genuinely needs a browser-side database, the module may define its own browser storage mechanism.

However, for many applications it is preferable to have nodes maintain the database and advertise a service that browsers can use.

This allows the browser to remain a client of an application service without requiring every browser installation to reproduce the server's database infrastructure.

---

## 26. Do Not Treat Cached Data as Permanent State

Memory caches disappear on restart.

Browser caches can be cleared.

Archive data can be pruned.

Remote peers can disappear.

A module should therefore understand what its cached information represents.

If the cache represents:

> information we observed

then losing it may simply mean that the application needs to fetch it again.

If the cache represents:

> current inventory according to the longest chain

then the module may need explicit reorganization handling.

If the cache represents:

> local UI state

then it may belong in options or browser storage.

The persistence mechanism should follow the meaning of the data.

---

## 27. Blockchain Reorganizations Matter Only When the Application Depends on Chain State

The default `ModTemplate.onChainReorganization` does not automatically undo application state.

This is intentional.

Not every application needs to treat a reorganization as an application-level deletion.

A module must decide whether its derived data represents blockchain state.

The key distinction is:

> Is this application recording that a transaction existed, or is it maintaining a projection of what the blockchain currently considers active?

These are different requirements.

A social application may retain a tweet even if the particular blockchain inclusion disappears.

An inventory application may need to reverse a listing if its inclusion leaves the longest chain.

---

## 28. Reorganization Is a Cache Problem When the Cache Tracks Consensus

Once an application maintains an off-chain representation of blockchain state, that representation is effectively a cache or projection of consensus.

The important lifecycle is then:

    onConfirmation
        ↓
    update application cache

and:

    onChainReorganization
        ↓
    update application cache

The exact behavior is application-specific.

A Store-style inventory may need to:

- retain old inclusion records;
- mark which inclusion is on the longest chain;
- restore an earlier listing if a purchase leaves the chain;
- rebuild summaries.

A social feed may simply retain the transaction because the application's concept does not depend on longest-chain inclusion.

Do not add reorganization code merely because the application uses transactions.

Add it when the application's derived state actually depends on blockchain state.

---

## 29. Do Not Delete Reorg Data Automatically

A reorganization does not necessarily mean that the corresponding application record should be deleted.

A transaction can leave the longest chain and later become relevant again through another fork.

For an inventory application, retaining inclusion information can therefore be more useful than deleting it.

A Store-style model can retain:

    signature
    block_hash
    inclusion metadata
    longest_chain flag

rather than deleting the row when the block leaves the chain.

This allows the application to represent both:

- the history of observed inclusions;
- the current longest-chain projection.

Whether this pattern is appropriate depends entirely on the application.

---

## 30. Store Is an Example of a Consensus-Dependent Projection

Store is useful as evidence for one particular pattern, but it should not be treated as the canonical Saito architecture.

Its database maintains application-specific inventory information derived from blockchain events.

A listing may therefore have multiple inclusion records, with the application tracking which inclusion belongs to the current longest chain.

This is appropriate because Store needs to answer questions such as:

> Is this asset currently available?

That question depends on blockchain state.

Store's SQL therefore represents a node-local projection of consensus rather than consensus itself.

Other applications may have no reason to maintain such a projection.

---

## 31. RedSquare Is an Example of a Different Requirement

RedSquare demonstrates another possible architecture.

Its transactions can be retained in Archive and memory, with application metadata attached to the transaction.

But RedSquare does not need to treat the longest-chain status of every tweet as the definition of whether the tweet is meaningful to the application.

A tweet can remain useful application data even if a particular blockchain inclusion disappears.

An application could also combine blockchain-derived tweets with tweets received through another private or application-specific input.

The important lesson is therefore not:

> Copy RedSquare.

It is:

> Determine whether your application's meaning depends on blockchain inclusion.

Existing Saito applications were built over time as the platform developed. They are valuable sources of implementation evidence and ideas, but they should not be treated as uniformly ideal implementations of current development practice.

---

## 32. Do Not Build a Second Transaction Store

If an application needs transaction persistence, first consider `app.storage`.

Do not automatically create:

- a Repository;
- a DataMapper;
- an ORM;
- a PersistenceManager;
- a TransactionStore;
- a CacheService;
- a generic StateManager.

These abstractions often add a layer without adding a capability.

A Saito module can normally:

- receive a transaction;
- keep it in memory;
- call `app.storage`;
- use module SQL when genuinely necessary;
- use `app.options` for local installation state.

That is often sufficient.

The application itself is already the semantic layer.

---

## 33. Do Not Build a Web 2 Backend by Reflex

A common AI failure mode is to interpret an application request as:

    React UI
        ↓
    REST API
        ↓
    Controller
        ↓
    Service
        ↓
    Repository
        ↓
    SQL database

This architecture may be appropriate for a particular Saito application if the application genuinely requires a server with a database.

It should not be assumed.

Saito applications can instead be:

    UI
        ↓
    transaction
        ↓
    peer

or:

    UI
        ↓
    transaction
        ↓
    blockchain

or:

    UI
        ↓
    app.storage
        ↓
    Archive service

or:

    UI
        ↓
    direct peer connection

or any combination of these.

The appropriate architecture follows the application's requirements.

---

## 34. The Module Is the Application Interface

Saito is not primarily a smart-contract platform in which developers place their application logic into a fixed contract interface and then build a separate client around that contract.

The module itself is the application interface.

The module determines:

- what transactions mean;
- what messages mean;
- what data is exchanged;
- what services it provides;
- what it stores;
- what it displays;
- what it considers relevant;
- how it combines on-chain and off-chain information.

Saito provides the underlying mechanisms.

The meaning comes from the module.

This is why existing modules should be studied as examples of what Saito can do, rather than treated as a fixed template for every new application.

---

## 35. Transaction Data Can Be Small or Extremely Large

Saito supports a range of application-data strategies.

A simple application might embed its entire data payload directly into a transaction.

A more complicated application might instead:

- store assets in the module itself;
- reference content hosted by a server;
- retrieve content from an application service;
- distribute content through an Archive;
- establish a direct P2P connection;
- put an access key into an NFT;
- use an NFT as a transferable reference to external content.

For example, a small game might include assets directly in the module.

A very large game might have hundreds of megabytes of assets. Distributing that entire module through mechanisms appropriate for a small application may be impractical.

The correct design therefore depends on:

- data size;
- distribution requirements;
- latency;
- availability;
- persistence;
- user workflow;
- whether the data needs to be transferable;
- whether the data needs to be cryptographically verifiable.

Do not assume that all application data belongs in transactions.

Do not assume that none of it does.

---

## 36. Transferable Data and Mutable Data Are Different Problems

An NFT can be useful for transferring something without putting the entire mutable object inside the NFT.

For example, an NFT could carry:

- an access key;
- an identifier;
- a reference;
- a document;
- some other transferable capability.

The recipient can then use that information to obtain or manipulate the associated resource.

This is different from an application in which users continuously modify a shared data object.

The first problem is primarily about transfer.

The second is about synchronization, distribution, and state management.

Do not force both problems into the same persistence architecture.

---

## 37. Cryptographic Verification and Application Metadata Are Different Layers

A Saito application should distinguish between:

    What the blockchain can cryptographically establish

and:

    What the application chooses to infer, cache, or display.

A transaction can cryptographically establish facts about:

- its creator;
- its signatures;
- its inputs;
- its outputs;
- its committed transaction data;
- its blockchain inclusion.

Application metadata can contain additional information.

That metadata can be useful without being cryptographically authoritative.

If stronger guarantees are required, the application can add signatures, references to other transactions, or other cryptographic mechanisms.

Do not make unsigned metadata authoritative merely because it is attached to a valid transaction.

---

## 38. Persistence Is Mostly a Scaling Concern

Do not make persistence architecture the first problem for a small application.

A small application can often work with:

- transactions;
- memory;
- `app.options`;
- simple Archive storage.

As data volume grows, the application may need:

- bounded caches;
- persistent Archive;
- SQL indexes;
- specialized databases;
- application services;
- direct P2P data channels.

Persistence decisions therefore depend partly on scale.

A module handling ten objects in memory has a different problem from a module handling millions of records.

Do not introduce large infrastructure merely because a larger application might eventually need it.

---

## 39. Current Implementation Versus Preferred Practice

The current repository contains several mechanisms that are real but should not automatically be copied into new development.

### Preferred architectural practices

Use:

- `app.storage` for transaction storage abstraction;
- Saito transaction objects as the primary data representation where appropriate;
- domain objects for semantic concepts;
- memory caches when sufficient;
- `app.options` for local installation state;
- module SQL when relational/indexed state is genuinely required;
- `onConfirmation` when application state must react to confirmed blockchain transactions;
- `onChainReorganization` when a derived cache depends on longest-chain state;
- `onPeerServiceUp` for peer-dependent retrieval;
- direct peer communication where appropriate;
- direct P2P channels for large/high-volume data where appropriate.

### Existing mechanisms that require caution

The repository also contains:

- direct peer SQL requests;
- legacy SQL caching;
- older database patterns;
- application-specific peer selection;
- legacy persistence conventions;
- applications with historical architectural compromises.

These are evidence of what Saito has supported, not automatically recommendations for new work.

An AI should inspect why an existing module uses a mechanism before reproducing it.

---

## 40. AI Development Rules

When implementing a new Saito application, an AI should follow these rules.

### Rule 1: Determine the data flow before creating storage

Identify:

- who creates the information;
- who consumes it;
- how users discover each other;
- whether the information needs blockchain security;
- whether it needs confirmation;
- whether it needs persistence;
- whether it needs low latency;
- whether a particular server is intentionally part of the design.

Do not begin with a database schema.

### Rule 2: Treat the transaction as the natural application object

When application data is already represented by a transaction, pass the transaction.

Do not unpack it into middleware arguments unless there is a genuine semantic reason.

### Rule 3: Avoid redundant representations

Do not create a second representation of a transaction merely to pass it between functions.

Copy fields when the resulting object has genuine semantic behavior or presentation value.

### Rule 4: Retain the transaction when it remains useful

Retain `this.tx` when the object may need to validate, inspect, modify, serialize, save, or rebroadcast the transaction.

Do not require every domain object to retain one.

### Rule 5: Use domain objects for concepts

Create `Tweet`, `Listing`, `SaitoNFT`, `Game`, or similar objects when the application has a concept worth organizing around.

Do not create models merely to satisfy a conventional framework architecture.

### Rule 6: Use `app.storage` rather than depending directly on Archive

The application should depend on the Saito storage API rather than the current implementation behind it.

### Rule 7: Do not confuse Archive with blockchain state

Archive is a database.

Archive presence does not imply blockchain inclusion.

Blockchain state must be checked through blockchain/UTXO mechanisms when that distinction matters.

### Rule 8: Do not create SQL without a reason

SQL is appropriate when the application has a concrete need for relational querying, indexing, inventory, derived state, or scale.

It is not the default persistence mechanism.

### Rule 9: Use memory when memory is sufficient

A transaction cache can be the simplest and fastest solution.

Do not create persistent infrastructure merely because persistence is theoretically possible.

### Rule 10: Treat reorganization handling as application-specific

Ask whether the application's derived state depends on longest-chain inclusion.

If it does, implement the appropriate confirmation and reorganization behavior.

If it does not, do not invent unnecessary rollback machinery.

### Rule 11: Make server dependencies explicit

If an application expects a server to provide a database or service, that is legitimate.

Do not introduce a central server simply because the UI contains queries.

### Rule 12: Preserve user agency

Identify the actions users need to take to make information available.

Do not silently assume a universal trusted authority exists.

### Rule 13: Use off-chain communication when latency matters

Do not force every application interaction through blockchain confirmation.

Transactions and messages can be exchanged off-chain.

Direct P2P channels can also be appropriate for high-volume data.

### Rule 14: Distinguish transfer from synchronization

An NFT carrying an access key, a transaction carrying a document, a peer message carrying a game invitation, and a database maintaining an inventory are different problems.

Choose the mechanism based on what the application actually needs.

### Rule 15: Prefer fewer layers

If the application can work with:

    transaction → module → component

do not turn it into:

    transaction → mapper → repository → service → controller → DTO → component.

Every additional layer creates another place where an AI can introduce inconsistent semantics.

---

## 41. A Practical Decision Process

When an AI receives a new Saito application requirement, it should work through the following questions.

First:

> What is the user actually trying to accomplish?

Second:

> What information must move between which participants?

Third:

> Does that information need blockchain consensus, or merely communication?

Fourth:

> If it needs blockchain state, what exactly needs to be on-chain?

Fifth:

> If it does not need blockchain confirmation, can it be sent as a Saito transaction or message off-chain?

Sixth:

> Does a particular server or peer intentionally own the required data?

Seventh:

> Could a module simply cache transaction objects in memory?

Eighth:

> Does the application require persistent or relational queries that justify SQL?

Ninth:

> Does the application need to reconstruct state after restart?

Tenth:

> Does the application's derived state depend on longest-chain status and therefore require reorganization handling?

Eleventh:

> Can the transaction itself remain the data object throughout the flow?

Twelfth:

> What domain concepts should be represented as semantic objects?

Only after these questions should the AI decide which storage and communication mechanisms are necessary.

---

## 42. The Saito Data Model in One View

A useful mental model is:

    User
      ↓
    application action
      ↓
    Transaction / Message
      ↓
    ┌───────────────────────────────────────┐
    │                                       │
    │ on-chain                              │ off-chain
    │                                       │
    ↓                                       ↓
    Blockchain                          Peer / Service
    │                                       │
    ↓                                       ↓
    Wallet / UTXO                       Memory / SQL / Archive
    │                                       │
    └───────────────┬───────────────────────┘
                    ↓
              Domain Object
                    ↓
                    UI

This is not a mandatory architecture.

It is a way of seeing the available mechanisms.

An application can use only some of them.

It can combine them.

It can bypass some of them.

The module determines the application's actual architecture.

---

## 43. Final Principle

Saito does not require every application to have a database, a server, an Archive, a blockchain data model, or even persistent application state.

Saito provides a set of mechanisms for communicating and representing information.

The developer's job is to determine:

- what information matters;
- who needs it;
- how users make it available;
- what needs cryptographic security;
- what needs blockchain consensus;
- what needs low latency;
- what needs persistence;
- what needs indexing;
- what can simply be cached;
- and what can be transferred directly between peers.

The AI should then implement the smallest Saito-native architecture that satisfies those requirements.

Most importantly, it should not import assumptions from conventional Web 2 development merely because those assumptions are familiar.

Do not begin with:

> Where is the server?

Do not begin with:

> What is the database?

Do not begin with:

> What model and repository should I create?

Begin with:

> What are the users trying to accomplish, what information must move for them to accomplish it, and what is the simplest way for a Saito module to make that happen?

Then use Saito's transaction, messaging, storage, peer, blockchain, wallet, module, and UI mechanisms to implement that design.
# Saito Application Domain Objects and Components

This document describes how Saito applications should organize domain objects, application objects, UI components, and other semantically meaningful internal components.

The purpose of this document is not to impose a rigid object-oriented framework inside every Saito module.

Saito deliberately leaves considerable freedom inside a module.

Instead, this document describes the patterns that have proven useful for building applications that remain understandable, extensible, and particularly suitable for AI-assisted development.

The central principle is:

> Organize the inside of a Saito application around the concepts that actually exist in the application.

A Saito module may contain:

    transactions
    database logic
    cryptographic logic
    domain objects
    UI components
    application state
    networking logic
    other specialized objects

These should be separated when doing so creates meaningful semantic boundaries.

Do not create abstractions merely because another software ecosystem commonly uses them.

The objective is not maximum abstraction.

The objective is maximum clarity.

---

# 1. The Module Is the Application

A Saito module is the application.

Its internal objects are parts of that application.

A useful conceptual structure is:

    Module
      │
      ├── transactions
      ├── domain objects
      ├── application state
      ├── database
      ├── specialized functionality
      └── UI components

This does not mean that every module needs all of these things.

A very small application may consist almost entirely of its main module file.

A larger application may contain dozens of meaningful objects.

The correct structure depends on the application's domain.

---

# 2. There Is No Universal Domain-Object Architecture

Saito does not require every application to use domain objects.

For example, a small tutorial module may simply have:

    <slug>.js
    lib/main.js

and have no `Game`, `Tweet`, `Listing`, or similar object.

That is perfectly valid.

Likewise, not every domain object needs the same constructor.

One application may have:

    new Game(app, mod, game_data)

Another may have:

    new Tweet(app, mod, tx)

Another may have:

    new Listing(data)

These represent different semantic situations.

The AI should not attempt to force all of them into one generic object model.

Instead, it should ask:

> What does this object represent, what information does it need, and who owns it?

---

# 3. `lib/` Is a Semantic Namespace

The `lib/` directory should not be understood as a framework-defined taxonomy.

It is a place for substantial application logic that is better organized outside the main module file.

For example:

    lib/database.js
    lib/transactions.js
    lib/P2SH.js
    lib/tweet.js
    lib/game.js

These files represent different concepts.

The important distinction is semantic.

For example:

    database.js

contains database-related behavior.

    transactions.js

contains transaction-related behavior.

    P2SH.js

contains specialized P2SH behavior.

    tweet.js

contains the application's Tweet concept.

The exact files an application needs depend entirely on the application.

---

# 4. Why Semantic Namespacing Matters

There is a practical reason to organize code this way.

AI systems perform better when the codebase provides obvious semantic boundaries.

If an application contains:

    2,000 lines of unrelated functions
        ↓
    one module file

then an AI asked to add database functionality has to determine:

    Where does database logic belong?
    Which functions are related?
    Which variables are database state?
    Which code is safe to modify?

If the application instead contains:

    lib/database.js
    lib/transactions.js
    lib/P2SH.js
    lib/tweet.js

then the conceptual structure is much easier to recover.

The same benefit applies to human developers.

Semantic files act as namespaces.

They tell the developer:

> This is where this category of behavior lives.

---

# 5. Semantic Organization Is Preferred, Not Mandatory

An application may deviate from these patterns.

That is acceptable.

For example, a small module may keep all transaction functions in:

    <slug>.js

because there are only two transaction types.

A larger module may move them into:

    lib/transactions.js

because there are many transaction types.

Neither structure is inherently required by Saito.

The important principle is:

> Use the simplest structure that keeps the application's concepts clear.

The preferred patterns exist to guide the AI toward a good initial architecture.

They are not restrictions on what an experienced developer may do.

---

# 6. Framework Convention Versus Application Convention

It is useful to distinguish two categories.

Framework conventions and requirements are things imposed by Saito itself.

Examples include:

    ModTemplate
    initialize()
    render()
    onConfirmation()
    handlePeerTransaction()
    app
    app.connection
    app.wallet
    app.network
    app.storage

Application conventions are patterns that have proven useful but are not required by the framework.

Examples include:

    lib/transactions.js
    lib/database.js
    lib/tweet.js
    lib/ui/
    domain objects
    UI component hierarchies
    Manager-style UI components

The AI should know the difference.

It should not invent a framework requirement where only a preferred application pattern exists.

At the same time, when creating a new module from scratch, the AI should generally follow the preferred patterns unless there is a reason not to.

---

# 7. The Preferred New-Application Principle

When creating a new application, the AI should aim for a structure that makes the application's concepts immediately visible.

For example:

    myapp/
        myapp.js
        lib/
            transactions.js
            database.js
            item.js
            ui/
                main.js
                sidebar.js

might be appropriate for one application.

Another might need only:

    myapp/
        myapp.js
        lib/
            main.js

Another might need:

    myapp/
        myapp.js
        lib/
            transactions.js
            P2SH.js
            order.js
            listing.js
            ui/
                main.js
                overlays/
                    purchase.js

The structure should emerge from the application's concepts.

Do not add directories or files simply because the template contains them.

---

# 8. Domain Objects Represent Application Concepts

A domain object should represent a meaningful thing in the application's conceptual model.

Examples include:

    Game
    Tweet
    Listing
    Order
    Player
    Invite
    Warehouse
    NFT

The name should be concrete.

A developer should be able to understand what the object represents without first understanding a generic object framework.

Prefer:

    Game

over:

    ApplicationEntity

Prefer:

    Tweet

over:

    ContentObject

Prefer:

    Listing

over:

    DataRecord

unless the generic concept genuinely exists in the application's domain.

---

# 9. Domain Objects Are Not Required

A module should not create a domain class merely because classes seem architecturally desirable.

For example, a simple application might receive a transaction and immediately process:

    tx.msg.data

without ever creating a persistent domain object.

That can be completely appropriate.

Create an object when the concept has enough identity, behavior, state, or reuse to benefit from being represented explicitly.

The AI should ask:

> Does this represent a meaningful thing in the application?

If the answer is no, do not create an object merely for architectural symmetry.

---

# 10. Domain Objects Can Be Different Kinds of Objects

A Saito application can legitimately contain several different kinds of object.

One common kind is an application/domain object:

    Game
    Tweet
    Player

Another is a transaction-backed object:

    Tweet(app, mod, tx)

Another may be a persistence-shaped object:

    Listing(data)

Another may be a UI-oriented organizational object:

    TweetManager
    ChatManager

These should not be forced into the same model.

The important thing is that each object has a recognizable purpose.

---

# 11. Application/Domain Objects Normally Receive `app` and `mod`

When an application object participates in the running Saito application, the preferred constructor pattern is:

    constructor(app, mod, data) {
      this.app = app;
      this.mod = mod;
      ...
    }

The exact third argument is application-specific.

It might be:

    data
    tx
    game_data
    another object

The important convention is that the object receives:

    app
    mod

because these provide access to the runtime and the owning application.

---

# 12. `app` and `mod` Have Different Meanings

`app` is the Saito runtime.

It provides access to framework facilities such as:

    app.wallet
    app.network
    app.connection
    app.modules
    app.storage
    app.keychain
    app.crypto
    app.blockchain

`mod` is the application module that owns the object.

It provides access to application-specific objects such as:

    this.mod.transactions
    this.mod.database
    this.mod.games
    this.mod.tweets
    this.mod.main

The distinction is:

    app
        Saito runtime

    mod
        owning application

This distinction should be preserved.

---

# 13. Always Passing `app` and `mod` Is a Useful Convention

Not every object will actually need both.

A UI component may only use `app`.

A particular domain object may only use `mod`.

A Saito-level UI component may have no need for `mod` at all.

Nevertheless, consistently passing the expected arguments is useful because it makes the object structure predictable.

For module-owned application components, prefer:

    constructor(app, mod, ...)

even if a particular implementation currently uses only one of them.

For Saito-level UI components under:

    node/lib/saito/ui/

the component may not need a module at all.

But maintaining the conventional argument structure where practical is useful because future requirements may change.

The purpose is consistency.

Consistency makes AI-generated code more predictable.

---

# 14. UI Components Should Normally Receive Their Owning Module

For a module-specific UI component, the expected `mod` is the module that owns the component.

For example:

    new Main(app, redsquare)

means:

    this.mod = redsquare

The component can therefore access:

    this.mod

and the objects owned by that application.

This is particularly important because UI components are intended to be somewhat self-contained.

A component should not need a separate global registry to discover its application.

---

# 15. Saito-Level UI Components Are Different

Saito itself has UI components under:

    node/lib/saito/ui/

These are framework-level components rather than components owned by a particular application.

They may need:

    app

without needing:

    mod

For example, a Saito header is framework UI.

It is not necessarily owned by the application that happens to display it.

Even so, maintaining consistent constructor conventions where practical is useful.

A component may not need `mod` today.

That does not mean the constructor pattern should become unpredictable.

---

# 16. The Third Constructor Argument Is Semantic

The third argument should be whatever object the component or domain object actually needs.

For example:

    new Game(app, mod, game_data)

or:

    new Tweet(app, mod, tx)

or:

    new Teaser(app, mod, game)

The third object might represent:

    source data
    transaction
    parent domain object
    configuration
    another application object

There is no universal requirement.

The important principle is:

> Pass the object that gives the component or domain object its semantic context.

---

# 17. Games May Have More Than One Relevant Module

Games can have additional complexity.

For example, an Arcade UI may need access to:

    Arcade module

and:

    Game module

These are different concepts.

A component may therefore encounter patterns involving:

    mod
    game_mod
    arcade

depending on what it is responsible for.

This is not a violation of the general rule.

The important question is:

> Which module owns the object, and which other module provides application behavior that the object needs?

Do not assume that there can only ever be one relevant module reference.

---

# 18. Do Not Treat Parameter Names as Sacred

Existing applications may use:

    this.mod
    this.arcade
    this.game_mod

depending on the relationship being expressed.

For new code, consistent naming is preferable.

For domain objects, `mod` should normally mean the owning module.

For UI components, a host-specific name may sometimes make the relationship clearer.

The AI should not rename existing parameters merely to enforce an abstract naming rule.

When modifying an existing application, follow the application's established terminology unless there is a specific reason to change it.

---

# 19. Transaction-Backed Domain Objects

A particularly useful Saito pattern is to create a domain object from a transaction.

For example:

    let tweet = new Tweet(app, mod, tx);

The object can then retain:

    this.tx = tx;

This gives the object access to the original transaction throughout its lifetime.

For example:

    tweet.tx.signature
    tweet.tx.msg
    tweet.tx.from
    tweet.tx.to

or whatever transaction information the application needs.

The transaction can therefore remain the authoritative protocol source associated with the domain object.

---

# 20. Why Retain the Transaction?

Retaining the transaction has an important practical benefit.

Without the transaction, a domain object may need to copy every useful transaction field into itself.

For example:

    this.signature
    this.module
    this.request
    this.data
    this.timestamp
    ...

If the object retains:

    this.tx

then the original protocol message remains available.

This means that additional transaction information can be inspected later without requiring another database lookup or another copy of the transaction data.

This is especially useful when objects are created directly from transactions retrieved from the database or blockchain.

---

# 21. Derived Fields Can Still Be Extracted

Keeping:

    this.tx

does not mean that every consumer should constantly reach into the transaction.

It can be useful to extract important application-facing fields.

For example:

    this.tx = tx;

    this.signature = tx.signature;
    this.text = tx.msg.data.text;
    this.username = tx.msg.data.username;

The purpose is not to duplicate everything.

The purpose is to make the object's useful interface explicit.

The object can therefore have:

    tx
        underlying protocol/source object

and:

    text
    username
    images
        application-facing fields

This can make the domain object easier to use and easier to understand.

---

# 22. Extract Fields When They Clarify the Object

A good question is:

> What information does this object conceptually contain?

If a Tweet conceptually contains:

    text
    username
    images

then those properties can reasonably exist directly on the Tweet.

The fact that they originated in:

    tx.msg.data

does not mean the Tweet should force every caller to know the transaction schema.

The transaction remains available for deeper inspection.

This creates two useful interfaces:

    Tweet
        application-level interface

    Tweet.tx
        underlying protocol representation

---

# 23. Do Not Copy Everything From a Transaction

The opposite mistake is to copy every transaction field into the domain object.

Do not automatically create:

    this.tx
    this.signature
    this.block_hash
    this.block_id
    this.message
    this.raw_data
    this.from
    this.to
    this.timestamp
    this.slips
    this.fee
    ...

unless those fields are genuinely useful to the object's conceptual interface.

The transaction is already retained.

Only extract fields that make the domain object clearer or more useful.

---

# 24. Transaction-Backed Objects Are Especially Useful for On-Chain Data

A common pattern is:

    database
       ↓
    transaction
       ↓
    domain object
       ↓
    UI

For example:

    Archive / module database
        ↓
    Tweet transaction
        ↓
    Tweet object
        ↓
    Tweet rendering

The object retains the transaction and can expose the application-level information needed by the UI.

This avoids forcing UI code to understand the raw transaction schema.

---

# 25. Transaction-Backed Does Not Mean Blockchain-Only

A transaction-backed object does not have to represent an irreversible blockchain object.

The transaction may be:

    on-chain

or:

    off-chain

depending on the application's protocol.

The important point is that the transaction is the source message from which the object was created.

The object may subsequently exist as local application state.

---

# 26. Domain Objects Can Also Be Created Without Transactions

Not every domain object comes from a transaction.

For example:

    new Game(app, mod, game_data)

may be created from application configuration.

Or:

    new Listing(data)

may be created from a database row.

The AI should not force every domain object through the transaction model.

The transaction-backed pattern is useful when the object's identity or content naturally originates in a transaction.

---

# 27. Persistence Objects Are a Different Pattern

Some application objects primarily represent persisted records.

For example:

    Listing(data)

may be constructed from a database row.

Such an object does not necessarily need:

    app
    mod
    tx

if its job is simply to represent a database record.

This is a legitimate pattern.

The AI should distinguish:

    domain object with runtime behavior

from:

    persistence-shaped record object

Do not force the latter to carry the entire Saito runtime.

---

# 28. Persistence Objects Can Be Deliberately Simple

A persistence object may reasonably look like:

    constructor(data = {}) {
      this.id = data.id;
      this.signature = data.signature;
      this.seller = data.seller;
      this.price = data.price;
      ...
    }

This can be useful when the object provides a semantic interface over database data.

The important question is whether the object represents a useful application concept.

If it does, the fact that it is largely a row-shaped object is not a problem.

---

# 29. A Domain Object Can Be Both Domain and UI

This is an important Saito pattern.

An object does not have to be exclusively:

    domain

or:

    UI

It can be both.

RedSquare's Tweet is an example.

Tweet is a core application concept.

It can also contain:

    render()
    attachEvents()

and therefore participate directly in the UI.

Conceptually:

    Tweet
      ├── application data
      ├── transaction
      ├── application behavior
      ├── render()
      └── attachEvents()

This is legitimate when the object is sufficiently central to the application that rendering itself is natural.

---

# 30. A UI Component Is Defined by Responsibility, Not Directory

The fact that an object is located in:

    lib/tweet.js

does not prevent it from being a UI component.

Likewise, the fact that something is under:

    lib/ui/

does not automatically make it architecturally superior.

A component is a UI component because it has a coherent presentation or interaction responsibility.

If an object has:

    render()
    attachEvents()

and those methods represent the object's UI behavior, it can reasonably be treated as a UI component.

Directory structure should help communicate that role, but directory structure is not the definition.

---

# 31. `lib/ui/` Is a Useful Convention for Larger UI Components

For larger applications, it is often useful to place UI components under:

    lib/ui/

For example:

    lib/ui/main.js
    lib/ui/sidebar.js
    lib/ui/manager.js
    lib/ui/overlays/purchase.js

This creates an obvious location for substantial presentation components.

But this is a preferred organization, not a framework requirement.

A core object such as Tweet may reasonably remain:

    lib/tweet.js

if it combines domain and UI responsibilities.

---

# 32. UI Components Can Be Hierarchical

A useful Saito UI structure is:

    Main
      ↓
    Sidebar
      ↓
    ChatManager
      ↓
    ChatContacts

or:

    Main
      ↓
    TweetManager
      ↓
    Tweet

Each component owns the components beneath it.

This allows a UI to be constructed hierarchically.

For example:

    Main.render()
        ↓
    Sidebar.render()
        ↓
    ChatManager.render()
        ↓
    ChatContacts.render()

This is valuable because each component can become a relatively self-contained black box.

---

# 33. "Manager" Is Not an Architectural Requirement

Names such as:

    Manager
    Sidebar
    Main
    Contacts
    Teaser

are application conventions.

A Manager can simply mean:

> A component that owns or renders multiple related components.

For example:

    ChatManager

may contain multiple chat-related UI components.

    TweetManager

may inspect the Tweets held by its module and render the Tweet layout.

    PlayerManager

may render multiple player components.

There is no requirement that a Saito application use the word "Manager."

Do not create a Manager class simply because another Saito application has one.

---

# 34. A Manager Can Be a UI Composition Object

The useful architectural property of a Manager is not its name.

It is that it provides a compositional boundary.

For example:

    Main
      ↓
    TweetManager
      ↓
    Tweet

The Main component does not need to know how Tweets are laid out.

The TweetManager does.

This creates a useful black box.

If the user asks:

> Change the way Tweets are displayed.

the AI can primarily modify TweetManager and Tweet.

The rest of the application can remain unchanged.

---

# 35. Components Should Encapsulate Their Internal UI Behavior

If a component owns:

    render()
    attachEvents()
    onClick()
    onSubmit()

then those methods should normally be used by the component itself or through a small, intentional public interface.

Other objects should not reach deep into its internals.

For example, avoid:

    main.tweet_manager.renderTweetHeader()
    main.tweet_manager.updateTweetDOM()
    main.tweet_manager.rebuildTweetButtons()

from unrelated code.

The TweetManager should own those operations.

Instead, expose a meaningful operation such as:

    tweetManager.render()

or:

    tweetManager.update()

if such an interface is actually needed.

---

# 36. Component Boundaries Are AI Context Boundaries

This is one of the reasons the component architecture is especially valuable for Saito.

A user may ask for a very local UI change:

    "Make the Tweet cards smaller."

Ideally, the AI can identify:

    Tweet
    Tweet UI component
    Tweet template
    relevant CSS

and modify those files.

It should not need to understand the entire RedSquare module.

Likewise:

    "Change the sidebar"

should primarily involve:

    Sidebar

and its relevant CSS.

This keeps AI modifications local.

---

# 37. Good Component Boundaries Prevent Architectural Drift

Without semantic boundaries, an AI may gradually put unrelated logic into whatever file it happens to be editing.

For example:

    Main
      ↓
    database code
      ↓
    transaction construction
      ↓
    peer handling
      ↓
    UI rendering
      ↓
    cryptography

Eventually the main file becomes impossible to reason about.

Semantic components prevent this drift.

If the AI knows:

    database logic → database.js

    transaction logic → transactions.js

    P2SH logic → P2SH.js

    Tweet logic → tweet.js

    UI layout → UI component

then a new feature has obvious places where its code can belong.

---

# 38. UI Changes Should Usually Stay Inside UI Boundaries

When a user asks for a UI modification, the AI should first look for the component responsible for that part of the interface.

For example:

    sidebar change
        → Sidebar

    Tweet presentation change
        → Tweet / Tweet UI

    purchase modal change
        → purchase overlay

    game teaser change
        → Teaser

The AI should avoid modifying unrelated module logic simply because it is convenient.

This is one of the main benefits of the component architecture.

---

# 39. Domain Objects Can Black-Box Application Behavior

A domain object can similarly isolate complexity.

For example:

    Tweet

can hide:

    transaction interpretation
    derived fields
    application state
    rendering
    event handling

from the rest of RedSquare.

Other code can treat it as:

    Tweet

rather than understanding every detail of how Tweets are constructed.

This is useful abstraction.

The difference between this and a generic service layer is that Tweet is a real application concept.

---

# 40. Do Not Create Abstractions Without a Concept

The AI should ask:

> What is the thing this abstraction represents?

Good answers:

    Tweet
    Game
    Listing
    Transaction
    Database
    P2SH
    Sidebar
    PurchaseOverlay

Suspicious answers:

    DataManager
    ObjectService
    GenericResolver
    ApplicationController
    UtilityManager
    ComponentDispatcher

The second group may occasionally be justified, but they should require an actual application reason.

---

# 41. Specialized `lib/` Objects Are Namespaces

A file such as:

    lib/database.js

provides a namespace for database behavior.

A file such as:

    lib/transactions.js

provides a namespace for transaction behavior.

A file such as:

    lib/P2SH.js

provides a namespace for P2SH behavior.

This is useful even if the object itself is not a traditional class.

The important thing is that related functions remain together.

For example:

    database.js

might contain:

    ensureSchema()
    saveSomething()
    loadSomething()
    deleteSomething()

while:

    transactions.js

might contain:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()
    createPurchaseTransaction()
    receivePurchaseTransaction()

This is semantic organization.

---

# 42. `database.js` Is a Good Example of Useful Namespacing

Suppose a module needs:

    ensureSchema()

and several functions that operate on its tables.

Putting them together in:

    lib/database.js

can be extremely useful.

The module can initialize the object and invoke:

    this.database.ensureSchema()

or use whatever direct organization the application adopts.

The important part is that all database-specific behavior has an obvious home.

A database object can also dynamically ensure that tables have the required structure.

This is especially useful for applications that need to evolve their local database schema without requiring a destructive reset.

This is a preferred technique, not a framework requirement.

---

# 43. Database Objects Are Not Domain Objects

Do not confuse:

    lib/database.js

with:

    lib/listing.js

The database object represents persistence behavior.

The Listing object represents an application concept.

They may interact:

    database
        ↓
    Listing

but they are not the same abstraction.

Likewise:

    node/mods/warehouse/warehouse.js

is a Saito module.

    node/mods/store/lib/warehouse.js

can be a Store-owned application object.

The name "warehouse" does not determine the architectural role.

The object's ownership and responsibility do.

---

# 44. Transaction Objects and Domain Objects Can Cooperate

A common application flow is:

    create transaction
        ↓
    propagate transaction
        ↓
    receive transaction
        ↓
    create domain object
        ↓
    store object
        ↓
    render object

For example:

    createRequestTweetTransaction()
        ↓
    peer / blockchain
        ↓
    receiveRequestTweetTransaction()
        ↓
    new Tweet(app, mod, tx)
        ↓
    mod.tweets
        ↓
    Tweet.render()

This makes the protocol and application model explicit.

---

# 45. The Transaction Pair Is a Strong Organizing Principle

Whenever an application communicates a particular kind of data, consider the pair:

    createXTransaction()
    receiveXTransaction()

These functions define the two sides of the same protocol.

For example:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

The pair should be easy to find.

If the application has many transaction types, grouping them in:

    lib/transactions.js

may be useful.

If there are only a few, they may remain in the main module.

The pair is more important than the file.

---

# 46. Transaction Request Names Should Be Explicit

A request should identify what is being requested.

For example:

    request-tweet

rather than:

    request

or:

    data

or:

    update

When the request is associated with a module, the broader peer protocol can identify it as:

    redsquare-request-tweet

The exact naming convention may vary with the application's existing protocol, but the request itself should be semantically explicit.

The important principle is:

> A developer should be able to understand the purpose of a network message by reading its request name.

---

# 47. Transaction Messages Should Make the Protocol Legible

A transaction message should make it possible to answer:

    Who is communicating?
    What are they communicating?
    What kind of request is this?
    Is this on-chain or off-chain?
    What function receives it?
    What domain object might it create or modify?

For example:

    module:
        RedSquare

    request:
        request-tweet

    data:
        tweet information

This is far easier to reason about than a generic:

    data:
        arbitrary payload

with the actual semantics hidden elsewhere.

---

# 48. The Protocol Should Be Designed Before the Implementation

When adding a meaningful network feature, the AI should first identify the messages.

For example:

    participant A
        ↓
    request-tweet
        ↓
    participant B

Then determine:

    What data is transmitted?

    Who creates the message?

    Who receives it?

    Is it on-chain?

    Is it off-chain?

    What function creates it?

    What function receives it?

    Does receiving it create or update a domain object?

This forces the developer to understand the protocol before implementing the code.

---

# 49. On-Chain and Off-Chain Communication Are Different Problems

A request that travels through the blockchain should normally be represented as an application transaction and handled through:

    onConfirmation()

A direct peer request is handled through:

    handlePeerTransaction()

The same conceptual application operation may have both forms.

For example:

    request-tweet

could theoretically exist as:

    on-chain transaction

or:

    off-chain peer request

depending on the application's requirements.

Do not assume that every message should go through the blockchain.

Do not assume that every message should remain off-chain.

The communication requirements determine the protocol.

---

# 50. Off-Chain Messages May Return Database Data

An off-chain message may request information rather than initiate a blockchain state transition.

For example:

    request-listing

could cause a peer to return:

    database row

or:

    application-derived data

The request should be named accordingly.

This is one reason explicit request names are important.

The AI should not hide such operations behind a generic RPC abstraction.

The application should make clear:

    what is being requested
    where the data comes from
    what is returned
    how the receiving module processes it

---

# 51. Communication Architecture Depends on the Application

Before designing a communication path, determine what the participants actually are.

Possibilities include:

    light client
        ↓
    server

    server
        ↓
    server

    light client
        ↓
    light client

These are different domain problems.

The correct communication pattern depends on:

    where the data lives
    who owns the data
    who needs it
    whether the data must be published on-chain
    whether peers can communicate directly
    whether a server acts as an archive or relay
    whether the participant has the full blockchain state

The AI should not assume a conventional web client/server architecture.

---

# 52. Saito Applications Do Not Automatically Have a Backend

A Saito browser application can contain substantial application logic.

The browser is not merely a thin frontend.

Likewise, a Node module is not necessarily a conventional backend API.

The architecture depends on the application's needs.

For example:

    browser
        ↓
    Saito peer

or:

    browser
        ↓
    server
        ↓
    other peer

or:

    server
        ↓
    server

may all be valid.

The module structure should support the actual communication model.

---

# 53. The AI Should Identify Where Data Lives

Before implementing a feature, determine the authoritative location of the data.

Possible locations include:

    blockchain
    transaction
    Archive
    module SQL
    app.options
    app.storage
    in-memory module state
    domain object
    remote peer
    external service

These are not interchangeable.

For example:

    transaction
        protocol source

    domain object
        application representation

    module SQL
        local application persistence

    Archive
        local/remote transaction archival

    blockchain
        consensus-visible publication

The AI should not invent a new database simply because it needs to store something.

---

# 54. Domain Objects Should Reflect Data Ownership

A domain object should make clear what data it owns and what data it references.

For example:

    Tweet
        this.tx
        this.text
        this.username
        this.images

The transaction remains available as the underlying protocol object.

The Tweet owns the application-level interpretation.

Likewise:

    Listing
        database-derived listing fields

may be appropriate when the Listing is primarily a local database representation.

The object model should follow data ownership.

---

# 55. Avoid Caching Other Modules' Data Without a Reason

A module should not automatically copy another module's data into:

    app.options
    localStorage
    arbitrary global objects

merely because it needs the information.

Instead, identify:

    who owns the data
    how it can be accessed
    whether it is authoritative
    whether it is derived

If a module genuinely needs its own derived index or cache, that is fine.

But the ownership should be explicit.

---

# 56. UI Components Should Read Application State, Not Invent It

A UI component may maintain temporary UI state:

    selected
    expanded
    visible
    editing

But it should not silently become the authoritative source of application data.

For example:

    mod.tweets

should remain the application-level collection of Tweets.

The TweetManager can render it.

The Tweet component can render one Tweet.

The UI should not create a second hidden Tweet database merely because it is convenient for rendering.

---

# 57. Components Can Maintain Presentation State

It is perfectly reasonable for a component to maintain state that exists only for presentation.

For example:

    this.expanded = false;

or:

    this.selected = null;

This state does not need to be persisted if it has no application meaning outside the UI.

The distinction is:

    application state
        meaningful to the application

    presentation state
        meaningful only to the current UI

Do not force transient presentation state into the database or blockchain.

---

# 58. Not Everything Needs to Be Persisted

A domain object can contain values that exist only in memory.

For example:

    render state
    cached calculation
    temporary UI state
    component references
    callbacks
    current selection

These do not need to appear in:

    blockchain
    SQL
    Archive

unless they have persistence requirements.

The AI should not assume that every object property needs a storage representation.

---

# 59. Components Can Be Black Boxes

A well-designed component should expose a small, understandable interface.

For example:

    render()
    attachEvents()
    update()

may be enough.

Its internal methods can remain internal.

This allows the rest of the module to treat it as a black box.

The benefit is especially strong when users frequently request UI modifications.

The AI can modify one component without needing to understand the entire application.

---

# 60. The Same Black-Box Principle Applies to Application Objects

A `Tweet` can be a black box for the rest of RedSquare.

Other code should be able to work with:

    Tweet

without understanding:

    transaction parsing
    database fields
    rendering internals
    DOM structure

Likewise, a `Database` object can hide:

    SQL
    schema details
    query construction

and a transaction namespace can hide:

    transaction construction details

This is useful abstraction because the boundary corresponds to a real concept.

---

# 61. Black Boxes Should Not Become Opaque

There is a difference between:

    coherent encapsulation

and:

    hidden architecture

A component should be easy to inspect.

Its name should communicate its responsibility.

Its methods should communicate its interface.

Its file should contain related behavior.

Do not create layers whose only purpose is to hide where something actually happens.

The AI should be able to trace:

    component
        ↓
    domain object
        ↓
    transaction

without following a chain of generic infrastructure.

---

# 62. Avoid Pointless Wrappers Around Domain Objects

For example, if:

    this.mod.tweets

already contains Tweet objects, do not create:

    TweetService

merely to retrieve them.

Likewise, if:

    this.mod.transactions

or module transaction methods already create transactions, do not create:

    TransactionService

merely to forward the calls.

A wrapper is justified when it represents a meaningful additional concept or behavior.

Otherwise, it creates unnecessary indirection.

---

# 63. Avoid Artificial Dependency Injection

A module already knows which objects it owns.

It can construct:

    new Tweet(app, this, tx)

or:

    new Database(app, this)

or:

    new Main(app, this)

There is usually no need for a dependency injection container.

Explicit construction is easier to inspect.

It also gives an AI a clear picture of the module's composition.

---

# 64. Direct Relationships Are Often Better Than Events

If one object needs another object to perform a specific operation, use a direct call.

For example:

    game.onClick()

If the application wants to announce that something happened so that multiple listeners can react, use:

    app.connection.emit(...)

These are different semantics.

A direct call means:

> I want this specific object to do something.

An event means:

> Something happened; interested parties may react.

Do not replace every direct relationship with an event bus.

---

# 65. Direct Calls and Events Can Be Used Together

A single operation can legitimately do both.

For example:

    Game.onClick()

may:

    perform the game operation

and then:

    app.connection.emit("game-updated")

The direct call performs the semantic action.

The event announces its consequence.

There is no contradiction.

The distinction is between:

    command

and:

    notification

---

# 66. Do Not Build a Generic Internal Event Bus

Saito already provides:

    app.connection

for process-local events.

Do not automatically introduce:

    EventBus
    EventManager
    MessageBus
    ApplicationDispatcher

inside the application.

Use the Saito mechanism when the application needs event notification.

Use direct calls when the application needs direct interaction.

---

# 67. UI Component Hierarchies Help AI Development

A component hierarchy such as:

    Main
      ↓
    Sidebar
      ↓
    ChatManager
      ↓
    ChatContacts

has a major practical benefit.

Each component can be understood independently.

The AI can reason:

    Main
        overall layout

    Sidebar
        sidebar layout

    ChatManager
        chat-related composition

    ChatContacts
        contact rendering

This creates natural boundaries for modifications.

---

# 68. UI Requests Should Map to Components

When a user asks:

    "Change the sidebar."

the AI should first identify:

    Sidebar

When a user asks:

    "Change the way Tweets are displayed."

it should identify:

    Tweet
    TweetManager
    Tweet template
    relevant CSS

When a user asks:

    "Change the purchase modal."

it should identify:

    purchase overlay

The architecture should make those relationships discoverable.

---

# 69. Components Reduce the Blast Radius of Changes

A UI change should ideally modify only:

    one component

or:

    a small group of closely related components

rather than:

    the entire module

This is especially important for AI-assisted development.

The more localized the change, the less opportunity there is for unrelated regressions.

Semantic component boundaries therefore provide a practical form of change isolation.

---

# 70. Do Not Over-Split Components

Componentization should not become another form of abstraction proliferation.

Do not create:

    TweetTitle
    TweetUsername
    TweetTimestamp
    TweetImage
    TweetButton

simply because each corresponds to an HTML element.

Create components when they have meaningful responsibilities or lifecycle.

The objective is cohesive components, not maximum component count.

---

# 71. A Core Domain Object Can Contain Its Own UI

If a domain concept is sufficiently central, it may reasonably contain:

    render()
    attachEvents()

For example:

    Tweet

may be both:

    application object

and:

    UI component

This can be especially useful when the UI representation is tightly coupled to the object's semantics.

The AI should not "correct" such an object by removing its rendering methods merely because another application uses a separate view object.

---

# 72. Separate Domain and UI When That Makes the Application Clearer

The opposite pattern is also legitimate.

For example:

    Game
        domain object

    Teaser
        UI component

This separation can be useful when:

    one domain object has multiple UI representations
    the UI is complex
    the domain object should remain presentation-independent
    several components use the same domain object

The choice should follow the application.

---

# 73. Arcade Provides a Useful Separate-UI Pattern

A conceptual Arcade structure is:

    Arcade
      ↓
    Game
      ↓
    Teaser

The Game represents the application concept.

The Teaser represents a particular UI representation of the Game.

The Teaser can call:

    game.onClick()

The Game can then perform application behavior and emit appropriate notifications.

This is a useful pattern for applications with catalog-like domain objects.

It is a preferred example, not a mandatory framework architecture.

---

# 74. RedSquare Provides a Useful Hybrid Pattern

RedSquare provides another legitimate pattern:

    RedSquare
      ↓
    Tweet
      ├── application state
      ├── transaction
      ├── derived fields
      └── render()

Tweet is sufficiently central to RedSquare that combining domain and UI behavior is useful.

The AI should recognize this as an intentional application architecture.

It should not mechanically split Tweet into:

    Tweet
    TweetView

unless the task actually calls for such a refactor.

---

# 75. Existing Applications Should Not Be "Corrected" Into the Preferred Pattern

An AI modifying an existing application should distinguish:

    existing application architecture

from:

    preferred architecture for new applications

If RedSquare uses:

    Tweet.render()

do not remove it simply because Arcade separates Game and Teaser.

If Store exposes transaction functions directly on the module, do not add:

    this.transactions

just to conform to an abstract diagram.

If Chat has its own component structure, do not migrate it merely because another module uses `lib/ui/`.

Existing architecture is part of the application.

Preserve it unless the task specifically requires architectural change.

---

# 76. Do Not Invent `this.transactions`

There is no universal Saito requirement for:

    this.transactions

A module may have:

    this.transactions

as a genuine transaction object.

Another module may have transaction methods directly on the module.

Another may mix functions from:

    lib/transactions.js

directly into the module.

The important requirement is semantic organization.

If the module has many transaction types, grouping them in `lib/transactions.js` can make them easier to understand.

The exact integration mechanism is an implementation choice.

---

# 77. The Important Transaction Convention Is the Pair

The strongest convention is:

    createXTransaction()
    receiveXTransaction()

not:

    this.transactions

The create/receive pair communicates the protocol.

The file or object containing the functions is secondary.

This is important because the pair forces the developer to think about:

    sender
    receiver
    message
    data
    protocol
    on-chain/off-chain status

---

# 78. Database, Transactions, and Cryptography Are Natural Namespaces

Some categories of functionality are sufficiently important that isolating them is usually useful.

Examples:

    database.js
    transactions.js
    P2SH.js
    crypto.js

These files are not required by Saito.

They are organizational tools.

Their value is that they answer:

> Where should this kind of functionality go?

before the AI begins adding arbitrary functions to the main module.

---

# 79. The AI Should Prefer Existing Semantic Namespaces

Before creating a new file, the AI should inspect the module.

If it finds:

    lib/database.js

database logic should normally go there.

If it finds:

    lib/transactions.js

transaction logic should normally go there.

If it finds:

    lib/tweet.js

Tweet-specific logic should normally go there.

Do not create:

    lib/new-database-helper.js

merely because the existing database object already contains the relevant functionality.

Extend the existing semantic namespace when appropriate.

---

# 80. Create a New Namespace When a New Concept Appears

Conversely, do not force unrelated functionality into an existing file merely because it already exists.

If an application acquires substantial P2SH logic, a:

    lib/P2SH.js

may be clearer than adding hundreds of P2SH functions to:

    lib/database.js

Likewise, if a new domain concept appears, it may deserve:

    lib/order.js

or:

    lib/listing.js

The boundary should correspond to the concept.

---

# 81. The Module's Main File Should Remain the Map

Even when most application behavior moves into `lib/`, the main module should remain understandable.

A developer should be able to see:

    constructor()
    initialize()
    render()
    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()

and understand the application's relationship to its internal objects.

The main file should tell the reader:

    what this module is

    what it listens for

    what it sends

    what it initializes

    what UI it owns

    what major objects it contains

The detailed implementation can live elsewhere.

---

# 82. Domain Objects Should Be Easy to Find

If the application has a concept called:

    Tweet

the developer should have a strong reason to look for:

    lib/tweet.js

If it has:

    Game

look for:

    lib/game.js

If it has:

    Listing

look for:

    lib/listing.js

The exact structure may vary in an existing application, but new applications should favor this predictability.

---

# 83. UI Objects Should Also Be Easy to Find

Likewise:

    Main
    Sidebar
    Teaser
    PurchaseOverlay

should have obvious homes.

For larger application-specific UI:

    lib/ui/main.js
    lib/ui/sidebar.js
    lib/ui/teaser.js
    lib/ui/overlays/purchase.js

can be useful.

For a core object that combines domain and UI:

    lib/tweet.js

may be more appropriate.

The semantic identity of the object determines the best location.

---

# 84. Templates Are Part of the UI Component Structure

A UI component may have a corresponding template.

For example:

    lib/tweet.js
    lib/tweet.template.js

or:

    lib/ui/teaser.js
    lib/ui/teaser.template.js

This can make the component's structure easy to understand.

The template should contain presentation markup.

The component should contain:

    render()
    attachEvents()
    interaction logic

The exact separation depends on the existing application.

---

# 85. CSS Should Follow the UI Component Where Practical

UI components often have corresponding CSS under:

    web/css/

For example:

    web/css/tweet.css
    web/css/teaser.css
    web/css/sidebar.css

This makes a UI change localized across:

    component
    template
    CSS

The build system can combine the CSS into the module's generated stylesheet.

This is particularly useful for AI-assisted UI work because the relevant files become easy to identify.

---

# 86. A User's UI Request Should Be Localizable

A good module structure should let the AI answer:

> Which files actually control this interface?

For example:

    "Change Tweet spacing."

might lead to:

    lib/tweet.js
    lib/tweet.template.js
    web/css/tweet.css

rather than:

    redsquare.js
    manager.js
    database.js
    transactions.js
    arbitrary global CSS

This is exactly the kind of localization the architecture should encourage.

---

# 87. Domain Objects Can Own Temporary Runtime State

A domain object may contain values that are created or manipulated only in memory.

For example:

    current selection
    render state
    cached transaction
    temporary calculation
    callback
    UI references

There is no requirement that every property be persisted.

The AI should distinguish:

    application state requiring persistence

from:

    runtime state

and:

    presentation state

---

# 88. Do Not Assume Every Object Property Belongs in SQL

The existence of:

    this.some_value

does not imply:

    SQL column

Likewise, a SQL column does not necessarily need to become a property of every object that reads the row.

Storage design and object design are related but distinct.

The AI should determine:

    what data must persist
    what data is derived
    what data is transient
    what data belongs only to presentation

before adding schema or object properties.

---

# 89. Do Not Assume Every Object Property Belongs on the Blockchain

Likewise, an application object can contain information that never belongs in a transaction.

For example:

    UI state
    cached DOM references
    local sorting information
    ephemeral status

may exist only locally.

The blockchain should contain only the data that the application protocol actually needs to publish or validate.

---

# 90. The Data Flow Should Be Explicit

A useful development exercise is to draw:

    source
      ↓
    object
      ↓
    storage
      ↓
    UI

or:

    UI
      ↓
    transaction
      ↓
    peer
      ↓
    receive function
      ↓
    object

This makes it much easier to determine where code belongs.

If the AI cannot explain where a piece of data comes from and where it goes, it should not immediately create another abstraction.

It should first understand the data flow.

---

# 91. Communication and Object Design Are Connected

A transaction often creates a domain object.

Therefore:

    protocol design
        ↓
    transaction message
        ↓
    domain object

should be considered together.

For example:

    request-tweet
        ↓
    tweet transaction
        ↓
    Tweet

This makes the application protocol and application model mutually intelligible.

---

# 92. Identify the Participants Before Designing Communication

For any feature involving network communication, identify:

    Who is sending?

    Who is receiving?

    Where does the sender get the data?

    Where does the receiver store the data?

    Is the communication on-chain or off-chain?

    Is the recipient a server, light client, or peer?

    Does the receiver need a full transaction or merely a database row?

These are domain questions.

They should be answered before selecting an implementation pattern.

---

# 93. Do Not Import Conventional Web Architecture Automatically

An AI trained on conventional web development may assume:

    frontend
        ↓
    REST API
        ↓
    backend
        ↓
    database

Saito does not require that architecture.

A Saito application may instead be:

    browser
        ↓
    Saito peer
        ↓
    blockchain

or:

    browser
        ↓
    Saito server
        ↓
    remote Saito peer

or:

    server
        ↓
    server

or:

    browser
        ↓
    browser

depending on the application.

The communication model is a domain decision.

---

# 94. AI Rules for Domain Objects

When creating or modifying a Saito application:

1. Do not assume every module needs domain objects.

2. Create an object when it represents a meaningful application concept.

3. Prefer concrete semantic names.

4. For module-owned application objects, normally provide:

       app
       mod

5. A third argument may provide:

       transaction
       source data
       parent object
       configuration
       other semantic context

6. If an object is created from a transaction, strongly consider retaining:

       this.tx = tx

7. Extract important application-facing fields from the transaction when doing so makes the object's interface clearer.

8. Do not copy every transaction field merely because it exists.

9. Do not assume every domain object is transaction-backed.

10. Do not assume every domain object is persisted.

11. Do not assume every domain object is a UI component.

12. Do allow a domain object to also be a UI component when that is natural.

13. Do not force all objects into the same constructor pattern.

14. Do not introduce generic object frameworks.

15. Keep semantic behavior with the object that represents the concept.

---

# 95. AI Rules for UI Components

When creating or modifying UI:

1. Identify the component responsible for the interface being changed.

2. Give module-specific UI components access to:

       app
       owning mod

3. Pass the relevant domain object into the component where appropriate.

4. Use hierarchical composition when it creates meaningful boundaries.

5. A component may contain:

       render()
       attachEvents()
       onClick()
       onSubmit()
       other meaningful UI behavior

6. Keep internal component functions inside the component whenever practical.

7. Expose a small meaningful interface rather than allowing unrelated code to manipulate internal rendering functions.

8. Use direct calls for direct commands.

9. Use `app.connection` for broader notifications.

10. Do not create a UI event bus merely to connect components.

11. Do not create a Manager merely because another module has one.

12. A Manager is simply one possible name for a component that manages or renders multiple child components.

13. Keep UI changes localized to the responsible component whenever possible.

14. Use `lib/ui/` as a preferred location for substantial application UI, not as an absolute framework requirement.

15. Do not remove a legitimate hybrid domain/UI object merely because another application separates domain and UI.

---

# 96. AI Rules for Semantic `lib/` Organization

When adding functionality:

1. First inspect the existing module structure.

2. If a meaningful semantic namespace already exists, use it.

3. Database functions belong together when practical.

4. Transaction functions belong together when practical.

5. Specialized cryptographic functionality should be isolated when substantial.

6. Domain concepts should have concrete files when they become substantial enough to warrant them.

7. UI components should be organized into coherent component files.

8. Do not create generic `helpers.js`, `utils.js`, or `manager.js` files merely to avoid deciding where code belongs.

9. Do not create a new file simply because a function is long.

10. Do not put unrelated functions together merely because they are all "helpers."

11. Choose file boundaries according to concepts.

---

# 97. AI Rules for Transaction Organization

When implementing network behavior:

1. Identify the messages exchanged between participants.

2. Give requests explicit names.

3. Prefer names that identify the module and operation.

4. Identify whether the communication is on-chain or off-chain.

5. Define the create and receive sides together.

6. Prefer paired names such as:

       createRequestTweetTransaction()
       receiveRequestTweetTransaction()

7. Keep the pair easy to find.

8. If there are many transaction types, consider `lib/transactions.js`.

9. If there are only a few transaction types, keeping them in the main module may be clearer.

10. Do not create a transaction manager merely because transactions exist.

11. The protocol pair is more important than the file in which it lives.

---

# 98. AI Rules for Data and Communication

Before implementing a feature, identify:

    where the data lives
    who owns it
    who needs it
    how it is transmitted
    what message carries it
    whether it is on-chain or off-chain
    where the receiver stores it
    what domain object represents it

Then determine the implementation.

Do not begin by asking:

    "What controller should I create?"

Begin by asking:

    "What are the participants, what are they communicating, and what does the data mean?"

---

# 99. The Preferred Mental Model

A useful model for an AI working on a Saito application is:

    Saito runtime
         │
         ▼
      Module
         │
         ├── protocol / transactions
         │
         ├── domain objects
         │
         ├── specialized namespaces
         │
         ├── application state
         │
         └── UI components

A transaction may produce:

    transaction
        ↓
    domain object
        ↓
    UI component

A UI action may produce:

    UI component
        ↓
    module-owned transaction function
        ↓
    transaction
        ↓
    peer / blockchain

A database request may produce:

    database
        ↓
    domain object
        ↓
    UI

These are simple, direct relationships.

---

# 100. The Core Principle

Saito does not require a rigid internal object architecture.

Instead, Saito applications should be organized around semantically coherent objects and files.

The preferred structure is one in which a developer or AI can quickly answer:

    What is this thing?

    Who owns it?

    What data does it represent?

    Where does that data come from?

    Where is that data stored?

    What messages create or modify it?

    Who receives those messages?

    Is the communication on-chain or off-chain?

    What component renders it?

    What code should change if its behavior changes?

A good Saito module makes these answers obvious.

The objective is therefore not:

    maximum abstraction

or:

    maximum class separation

or:

    maximum componentization

The objective is:

    semantic clarity
    direct relationships
    explicit protocols
    localized behavior
    understandable data flow

When these principles are followed, the module becomes easier for both humans and AI systems to extend.

A user can ask for a UI change and the AI can modify the relevant component.

A user can ask for a new transaction and the AI can identify the create/receive pair.

A user can ask for a database change and the AI can find the database namespace.

A user can ask about a Tweet and the AI can find the Tweet object.

A user can ask about network communication and the AI can identify the messages and their handlers.

That is the purpose of the internal structure: not to constrain what a Saito application can become, but to make the application understandable enough that both humans and AI can change it without losing track of how it works.
# Saito Applications — Existing Application Suite

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- The applications that ship with Saito
- What each application is for
- How the suite fits together
# Saito Applications — Games and the Saito Game Engine

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- What the Saito game engine provides
- How a game application is structured
- How games differ from ordinary Saito applications

# Saito Application and Module Directory Structure

## Purpose

A Saito application is also a Saito module. These terms are used interchangeably. "Module" emphasizes the fact that the application participates in the Saito module system; "application" emphasizes that a module can be a complete application, protocol, game, service, or user-facing interface.

The distinction is linguistic rather than architectural.

A Saito application should be organized according to a small number of established conventions. These conventions are important because the directory structure tells both Saito and developers where particular responsibilities belong.

For an AI developer, this document has a second purpose: it should make it possible to construct a new Saito application from scratch without importing the directory structures and architectural assumptions of conventional web frameworks.

The most important principle is:

> Create only the files and directories that the application actually needs.

The existence of a convention does not mean that every application should contain that directory.

A minimal application may consist of one JavaScript file. An application with a database needs `sql/`. An application with a substantial UI needs `lib/ui/` and `web/css/`. A game may need additional structures for cards, assets, or generated source. A headless protocol module may need none of these.

Do not add directories merely because they exist in other Saito applications.

In particular, an AI should not create SQL merely because other applications have SQL, should not create a web interface merely because other applications have `web/`, and should not create a testing framework merely because the application could theoretically have tests.

The goal is a small, intelligible application whose structure reflects what it actually does.

---

## 1. Where Applications Live

Source applications live under:

    node/mods/<application>/

For example:

    node/mods/tutorial01/
    node/mods/redsquare/
    node/mods/store/
    node/mods/chess/
    node/mods/imperium/

The directory name is normally a lowercase slug-like identifier.

Applications are not discovered by scanning `node/mods/`.

They become part of a Saito runtime because their entry file is explicitly listed in:

    node/config/modules.config.js

The configuration has separate `core` and `lite` module lists.

The server loads the `core` list.

The browser loads the `lite` list.

A module can therefore be available to the full Node server, the browser, or both.

A directory existing under `node/mods/` does not cause the module to load.

For example, this does not automatically load an application:

    node/mods/myapp/
        myapp.js

The application must also be registered in the appropriate section of `modules.config.js`.

The normal configuration looks conceptually like:

    core: [
        'myapp/myapp.js'
    ]

and, if the application is also part of the browser bundle:

    lite: [
        'myapp/myapp.js'
    ]

The configuration path is relative to:

    node/mods/

---

## 2. The Minimal Saito Application

The smallest valid Saito application is extremely small.

For example:

    node/mods/tutorial01/
        tutorial01.js

The entry file defines a class extending `ModTemplate`, gives the module its name/identity, and exports the constructor.

A module does not require:

- `web/`
- `sql/`
- `lib/`
- `package.json`
- `index.js`
- CSS
- images
- tests
- README files
- templates
- frontend/backend directories

unless the application actually needs them.

This is an important design principle.

Do not begin by creating a generic application skeleton containing every possible Saito directory. Begin with the smallest structure capable of implementing the application.

Then add directories when a real requirement appears.

For example:

A protocol-only module may need only:

    myapp/
        myapp.js

A UI application might grow into:

    myapp/
        myapp.js
        lib/
            ui/
        web/
            css/

An application requiring persistent Node-side SQL storage might additionally have:

    myapp/
        myapp.js
        sql/
            records.sql

A game may eventually have:

    mygame/
        mygame.js
        lib/
        web/
            css/
            img/

These are different applications, not different required stages of a universal module template.

---

## 3. The Main Module File

The normal entry-file convention is:

    <slug>/<slug>.js

Examples:

    redsquare/redsquare.js
    chat/chat.js
    store/store.js
    chess/chess.js
    tutorial01/tutorial01.js

The filename used by Saito is ultimately determined by `modules.config.js`. Other filenames are technically possible if the configuration explicitly points to them.

However, the normal convention should be followed unless there is a specific reason not to.

A new application should therefore normally look like:

    myapp/
        myapp.js

The main file exports the module constructor.

Conceptually:

    class MyApp extends ModTemplate {
        constructor(app) {
            super(app);
            this.name = "MyApp";
            this.slug = "myapp";
        }
    }

    module.exports = MyApp;

The exact implementation should follow the conventions of the current repository and the requirements of the application.

There is no special requirement for a file called `mod.js`.

An AI should not invent `mod.js` as a standard Saito entry point.

The important relationship is:

    modules.config.js
            |
            v
    node/mods/myapp/myapp.js
            |
            v
    exported module constructor
            |
            v
    new Module(app)

---

## 4. Module Name, Slug, Directory, and Filename

Saito has several related identifiers that should not be confused.

The directory identifies where the source application lives:

    node/mods/myapp/

The entry filename identifies the file loaded by `modules.config.js`:

    myapp.js

The module's `name` is its application/module identity.

The module's `slug` is normally the URL-friendly identifier used for paths and related framework conventions.

Historically, Saito generally generated the slug from the name.

For example:

    name: "RedSquare"
    slug: "redsquare"

or:

    name: "Twilight"
    slug: "twilight"

The exact name/slug relationship has evolved, and applications can specify the slug explicitly.

For new applications, follow the existing repository conventions.

In particular, avoid spaces in the filesystem directory name.

A good normal convention is therefore:

    directory: myapp
    entry file: myapp.js
    name: MyApp
    slug: myapp

The directory and entry filename normally correspond to the slug.

Do not assume that `this.name`, the directory, the entry filename, and the slug are technically the same value. Saito has historically kept these concepts distinct.

The distinction matters because:

- the directory determines filesystem paths;
- the configured entry path determines what gets loaded;
- `name` identifies the module;
- `slug` is used for URLs and commonly for the default database name.

An AI should understand the distinction but should not create unnecessary complexity around it.

Use the repository's established naming convention unless the application has a reason to diverge.

---

## 5. The `lib/` Directory

`lib/` is the normal location for substantial application source code that should not clutter the root module file.

It is an application convention rather than a special directory that the framework scans automatically.

For example:

    myapp/
        myapp.js
        lib/
            database.js
            transactions.js
            P2SH.js

The files should be organized semantically.

Good examples include:

    lib/database.js
    lib/transactions.js
    lib/P2SH.js
    lib/main.js

The purpose is to keep the main module class focused on module lifecycle and application integration while putting substantial implementation in appropriately named components.

Do not create many tiny helper files simply to make every function technically separate.

If a small function is naturally part of the code around it, keeping it inline is often clearer.

Prefer:

    lib/database.js
    lib/transactions.js

over a collection such as:

    lib/helpers/
        format.js
        validation.js
        string-utils.js
        object-utils.js
        transaction-helper.js
        database-helper.js

unless the application has actually become large enough to justify such organization.

The directory structure should communicate meaningful application concepts.

---

## 6. User Interfaces Belong in UI Components

A substantial Saito UI should not be implemented directly inside the main module file.

The main module's `render()` function is an entry point into the interface. It should not become the location where the entire interface is implemented.

For example, this is the preferred architectural direction:

    myapp/
        myapp.js
        lib/
            ui/
                main.js
                main.template.js
                overlays/
                    settings.js
                    settings.template.js

The main module can invoke the UI component:

    render() {
        this.main.render();
    }

The UI component then owns the complexity of rendering and interacting with that portion of the application.

This separation is particularly important for complex applications.

The purpose is not merely organizational. It allows an AI developer to reason about responsibilities:

- `myapp.js` is the application/module integration and lifecycle layer.
- `lib/ui/` contains UI components.
- UI templates contain the markup for those components.
- UI CSS belongs under `web/css/`.
- Application logic remains available to UI components through the module/application objects they receive.

UI components commonly receive references to both the application and module, allowing them to access Saito APIs and the application's underlying state and functions.

This is preferable to accumulating functions such as:

    showAlert()
    showSettings()
    showUserMenu()
    showConfirmation()
    renderSidebar()
    renderModal()
    updateEverything()

inside the main module file.

When an interface becomes substantial, move the responsibility into appropriately named UI components.

---

## 7. UI Component Organization

The most common organization for complex application interfaces is:

    lib/ui/

For example:

    lib/ui/main.js
    lib/ui/main.template.js

Overlays commonly live under:

    lib/ui/overlays/

For example:

    lib/ui/overlays/settings.js
    lib/ui/overlays/settings.template.js

Other application-specific UI groupings are possible.

Older applications contain structures such as:

    lib/overlays/
    lib/appspace/
    lib/email-appspace/

These should not automatically be copied into new applications.

`lib/appspace/` and `lib/email-appspace/` are historical structures associated with older application designs.

For new UI work, `lib/ui/` is the clearer default.

The same principle applies to template files.

A component can have a paired template:

    lib/ui/main.js
    lib/ui/main.template.js

There is no requirement for a framework-wide `templates/` directory inside every application.

---

## 8. HTML and Templates

Saito applications use several mechanisms for producing HTML.

The most common modern application pattern is for JavaScript components to return or construct HTML through paired template files.

For example:

    lib/ui/main.js
    lib/ui/main.template.js

The main module may also contain a small amount of HTML needed for its own entry point.

Some applications have a root:

    index.js

This is commonly an HTML factory used by the server for generating a document.

It is not an npm-style package entry point.

For example:

    myapp/
        myapp.js
        index.js

does not mean that `index.js` is the module loader entry point.

The module entry point is still whatever file is named in `modules.config.js`.

There is also a shared Saito default HTML template under the framework.

Do not create an `index.js` merely because a web application traditionally has one.

Create it when the application actually needs custom server-generated HTML.

---

## 9. The `web/` Directory

`web/` is optional.

It contains static resources associated with the application.

For example:

    myapp/
        myapp.js
        web/
            css/
            img/

If the application has no web assets, do not create `web/`.

When a module has a `web/` directory, Saito serves it under the module's slug.

For example:

    node/mods/redsquare/web/img/logo.png

is served conceptually as:

    /redsquare/img/logo.png

It is not normally served as:

    /mods/redsquare/web/img/logo.png

The URL uses the module slug.

The filesystem uses the module directory.

These are related but distinct concepts.

The global Saito web resources are separate:

    node/web/

These are served under:

    /saito/

For example:

    /saito/saito.js
    /saito/saito.css

An application can therefore use both its own web resources and shared Saito resources.

---

## 10. CSS Organization

Application CSS belongs under:

    web/css/

For example:

    myapp/
        web/
            css/
                myapp-base.css
                myapp-dashboard.css
                myapp-overlay.css

Saito's compile process combines the CSS source files into:

    web/style.css

The generated file is what the application normally references at runtime.

Conceptually:

    web/css/*.css
            |
            | npm run compile
            v
    web/style.css
            |
            v
    /<slug>/style.css

The exact CSS loading mechanism should follow the application's existing `this.styles` conventions.

For example:

    this.styles = [
        '/saito/saito.css',
        '/myapp/style.css'
    ];

Large applications commonly use multiple CSS files because individual UI components should have their own styles.

This is desirable.

Do not create one enormous CSS file merely because the runtime ultimately serves a generated `style.css`.

The source organization should reflect UI responsibility.

For example:

    web/css/
        myapp-base.css
        myapp-dashboard.css
        myapp-overlay-settings.css
        myapp-sidebar.css

is preferable for a complex application to putting every rule into the main module's JavaScript.

The generated:

    web/style.css

is a build artifact.

The source of truth is the CSS under:

    web/css/

---

## 11. JavaScript and Browser Code

Saito does not normally divide an application into conventional:

    frontend/
    backend/

directories.

Do not create them.

The same application JavaScript can run in both Node and the browser.

The distinction is normally made in code.

For example, functionality that should only run on a full Node server can check the browser state and return appropriately.

Browser-specific functionality includes things such as:

- `render()`
- DOM manipulation
- browser UI
- stylesheet attachment
- browser overlays

Node-specific functionality can include:

- `webServer`
- filesystem operations
- SQLite
- server-side processing

These responsibilities can coexist in the same module source tree.

The module itself determines which code should execute in which environment.

This is a fundamental Saito convention.

Do not import a conventional web-stack architecture in which the application is divided into an HTTP backend and a separate browser frontend unless there is a specific application requirement for doing so.

---

## 12. `web/js/` Is Not the Normal Application Architecture

A `web/js/` directory can exist and its contents can be served statically, but it is not the normal mechanism for implementing Saito application logic.

Application logic should normally live in the JavaScript source tree and be required from the module entry point.

For example:

    myapp.js
    lib/main.js
    lib/ui/main.js

The browser build includes the modules that are part of the application's require graph.

Simply creating:

    web/js/app.js

does not automatically make it part of the Saito application lifecycle.

If an additional static script is genuinely required, it can be explicitly attached through the application's script mechanisms.

Do not build a second JavaScript application inside `web/js/` without a reason.

---

## 13. Static Images and Other Assets

Static application assets normally live under:

    web/

Common examples include:

    web/img/
    web/font/

For example:

    myapp/
        web/
            img/
                logo.png
                background.png
            font/
                ...

The URL follows the module slug:

    /myapp/img/logo.png

Games often have substantial collections of images, fonts, cards, maps, and other assets under `web/`.

The existence of these directories does not imply that every application needs them.

Create them only when the application actually has static assets.

---

## 14. SQL and Application Databases

The `sql/` directory is optional.

Create it only when the application needs its own Node-side SQLite database.

For example:

    myapp/
        myapp.js
        sql/
            records.sql

The SQL source files are part of the module.

During module installation on a Node server, Saito reads the SQL files and initializes the application's database.

The resulting database is stored under:

    node/data/<dbname>.sq3

Normally the database name is derived from the module's slug, although applications can specify a database name explicitly.

For example:

    node/data/store.sq3
    node/data/registry.sq3

The important distinction is:

    node/mods/store/sql/
    
contains source SQL definitions,

while:

    node/data/store.sq3

is the runtime database.

Do not put source SQL databases under `node/data/`.

Do not create a `.sq3` file inside the module source directory.

---

## 15. Multiple SQL Files

A module can contain multiple SQL source files.

For example:

    sql/
        listings.sql
        orders.sql
        summary.sql

These files are executed into the same application database.

They do not produce one SQLite database per SQL file.

This means the structure can be used to separate logically distinct schema definitions or initialization steps while still maintaining a single application database.

Numbered SQL files are sometimes used for ordering or migration-like behavior.

For example:

    sql/archive1.sql
    sql/archive2.sql

This is an established repository practice, but it is not a general migration framework.

Do not invent a migration architecture unless the application actually needs one.

---

## 16. Database Persistence and `npm run compile`

The existence of an application database does not by itself determine whether that database survives a server rebuild or database cleanup.

The Saito build/compile configuration determines which databases are treated as persistent.

This matters for modules such as Registry.

A database can be required for normal operation while still being something that should survive a server reset.

The compile configuration contains the relevant persistent-database settings.

Therefore, when creating an application with persistent database state, an AI should not assume that simply creating:

    sql/

is sufficient to determine the application's desired lifecycle.

If the application's database contains state that must survive server destruction or reset, inspect the current compile configuration and follow the existing persistence convention.

This is a deployment/build concern rather than a reason to invent a new persistence directory inside the module.

---

## 17. Browser Storage Is Not Represented by a Directory

Browser persistence does not normally require a directory such as:

    browser-storage/
    indexeddb/
    local-storage/

Do not create such directories.

Saito's browser persistence mechanisms are accessed through APIs and databases rather than being represented as source-code directories.

Examples include:

- `app.options`
- Archive
- browser database mechanisms such as JsStore
- IndexedDB databases used by particular applications
- localForage where used by specific components

The application should use the appropriate Saito API rather than creating a directory to represent browser persistence.

---

## 18. `package.json`

Saito applications normally do not have their own `package.json`.

Dependencies are generally managed centrally in:

    node/package.json

Do not create:

    node/mods/myapp/package.json

simply because the application contains JavaScript.

A module-specific package can exist in unusual cases, but this is not the normal Saito architecture.

An AI should not import the npm package model into every Saito application.

The fact that one specialized module contains a `package.json` does not make it a general Saito requirement.

---

## 19. Tests

Tests are not part of the distributed Saito application.

A developer may create tests for a module, and repository-level tests exist under structures such as:

    node/tests/mods/<module-name>/

A test directory can also exist during development if that is useful.

However, tests should not be treated as a required part of the module's distributable source structure.

This distinction matters because Saito modules can be compiled into browser applications and into standalone dynamic modules.

Development dependencies such as test frameworks and Node-specific `assert` functionality can become problematic if they are accidentally pulled into a compiled application.

Therefore:

> Do not add tests to a module merely because a software project convention says every module should have tests.

If tests are needed, keep them outside the compiled application path or in an appropriate development-only location.

The exact location should be chosen according to the repository's testing conventions and the needs of the developer.

For distributed modules, do not assume that the test suite is part of the module payload.

---

## 20. No `frontend/` and `backend/` Directories

A Saito module is not conventionally structured as:

    myapp/
        frontend/
        backend/

This is foreign to the normal Saito architecture.

Saito applications use the same source tree for Node and browser execution.

The environment determines what executes.

For example:

    if (this.app.BROWSER) {
        // browser-specific behavior
    }

or equivalent current repository conventions may be used.

Server functionality can live on the module class:

    webServer()
    handlePeerTransaction()
    onConfirmation()

while browser functionality can live in:

    render()
    attachEvents()

and UI components under:

    lib/ui/

This allows an application to share Saito's runtime model rather than reconstructing a conventional web application stack.

---

## 21. Server-Side HTTP Handling

Saito applications do not normally create a:

    routes/

directory.

HTTP routes are generally registered through the module's `webServer()` functionality.

For example, an application can define custom Express routes inside its module.

A complex application may therefore have:

    myapp/
        myapp.js
        lib/
            images.js
        web/
            ...

without requiring:

    routes/
    controllers/
    middleware/
    api/

The server-side behavior remains part of the Saito module.

A module can override `webServer()` when it needs custom HTTP behavior.

Do not create a generic REST API layer unless the application actually requires one.

---

## 22. `controllers/`, `services/`, `repositories/`, and Similar Layers

These directory structures are not standard Saito architecture:

    controllers/
    services/
    repositories/
    models/
    middleware/
    api/

A module may technically use any directory that JavaScript can require, but Saito does not interpret these directories specially.

Do not introduce them simply because they are common in other software ecosystems.

In Saito, application responsibilities commonly remain directly on the module and on semantically meaningful classes in `lib/`.

For example:

    lib/database.js
    lib/transactions.js
    lib/ui/main.js

is preferable to inventing:

    controllers/
    services/
    repositories/
    models/

without an application-specific reason.

This is particularly important for AI-generated code.

An AI trained on conventional enterprise software may instinctively introduce layers such as repositories, service classes, controllers, dependency-injection containers, or generic managers.

Do not do this by default.

The Saito application should remain as direct and hackable as the problem permits.

---

## 23. Games Are Ordinary Saito Applications

Games are Saito modules.

They are not a separate type of application architecture.

A game generally extends `GameTemplate` or an appropriate game template rather than `ModTemplate`.

For example:

    chess/
        chess.js
        lib/
        web/

Large games can have much more elaborate structures:

    imperium/
        imperium.js
        lib/
        src/
        web/
            css/
            img/
            font/

The important point is that the additional complexity comes from the game itself.

It does not mean that every Saito application should have:

    src/
    web/img/
    web/font/
    lib/overlays/

Games often have:

    lib/overlays/

and other game-specific component organizations.

Follow the structure of the game being developed rather than treating a large game's directory tree as a universal Saito template.

---

## 24. The `src/` Directory

`src/` is not a universal Saito application requirement.

Some large games use it for application-specific source material or code-generation pipelines.

For example, a game may contain large numbers of cards or other source fragments that are combined into generated JavaScript.

This is useful when that particular application needs a compilation pipeline.

It should not be copied into ordinary applications merely because a large game contains it.

For a normal application:

    lib/

is the ordinary source organization.

Use:

    src/

when the application actually has a source-generation or application-specific compilation reason for it.

---

## 25. Shared Saito UI

Saito itself provides shared UI components under:

    node/lib/saito/ui/

Applications can require those components rather than copying them into the application.

For example, an application may use shared Saito headers, overlays, user components, or other framework UI.

Do not copy framework components into:

    node/mods/myapp/lib/

unless the application deliberately needs its own independent implementation.

The distinction is:

    node/lib/saito/ui/
        shared Saito framework components

versus:

    node/mods/myapp/lib/ui/
        application-specific components

This keeps application code focused on the application's own behavior.

---

## 26. Web Assets and Shared Saito Assets

Application web assets are served from:

    node/mods/<dirname>/web/

Shared Saito assets are served from:

    node/web/

The shared Saito directory provides resources under the `/saito/` URL path.

For example:

    /saito/saito.js
    /saito/saito.css

An application therefore commonly combines:

    /saito/saito.css

with:

    /<slug>/style.css

and can reference application-specific assets such as:

    /<slug>/img/example.png

Do not copy shared Saito assets into the application.

---

## 27. Build and Compilation

The Saito build system compiles the browser application from the modules listed in the `lite` configuration.

The module entry file is part of the JavaScript dependency graph.

Conceptually:

    modules.config.js
          |
          v
    lite module list
          |
          v
    module entry files
          |
          v
    required application components
          |
          v
    webpack
          |
          v
    /saito/saito.js

The application JavaScript is therefore not normally compiled as a completely independent browser package.

A module's `lib/` JavaScript is pulled into the application because the module entry point requires it.

This is why simply putting application logic into a static file under:

    web/js/

does not make it part of the normal Saito application lifecycle.

---

## 28. CSS Compilation

CSS has a related but separate compilation path.

Application source CSS lives under:

    web/css/

The compile process produces:

    web/style.css

The application normally loads the generated stylesheet through its slug URL:

    /<slug>/style.css

Therefore:

    web/css/myapp-base.css
    web/css/myapp-dashboard.css
    web/css/myapp-overlay.css

becomes a single runtime stylesheet:

    web/style.css

This does not mean that the source CSS files should be combined manually.

The source files should remain separated according to UI responsibility.

For complex interfaces, it is desirable for each major UI component to have an appropriately named CSS file.

---

## 29. Application Registration

A new application requires registration in:

    node/config/modules.config.js

The configuration determines whether it is loaded by the Node server, browser, or both.

The normal process is approximately:

    modules.config.js
          |
          v
    module path
          |
          v
    require(...)
          |
          v
    new Module(app)
          |
          v
    module initialization

The framework does not scan `node/mods/` and automatically discover every directory.

Therefore, when creating a new module, an AI should remember that creating the source files is not enough.

It must also determine whether the application belongs in the `core` list, the `lite` list, or both.

---

## 30. Runtime `.saito` Modules

Source applications in the repository and runtime-installed `.saito` applications are related but should not be confused.

A source application normally lives at:

    node/mods/<slug>/

A compiled `.saito` application is a distribution artifact.

Development builds can produce files such as:

    node/dist/mods/saito/<slug>.saito

Runtime-installed browser modules are stored through the browser's dynamic-module storage mechanism rather than being unpacked as ordinary directories under:

    node/mods/

The `.saito` format exists so that an application can be distributed as a compiled standalone package containing the components it requires.

The details of module distribution and dynamic installation are covered in the dedicated module-distribution documentation.

For normal application development, work on the source module under:

    node/mods/

Do not restructure the source repository around the `.saito` runtime format.

---

## 31. Dynamic Modules and the Source Tree

Dynamic modules are another reason not to assume that every application needs a conventional npm-style package structure.

A runtime-installed dynamic module is ultimately loaded from compiled application data rather than from a live source directory.

The dynamic-module system has its own compilation and runtime conventions.

An AI working on an ordinary source application should therefore not attempt to reproduce the dynamic-module storage architecture inside the module.

If the task specifically concerns `.saito` distribution or runtime installation, use the conventions documented for that subsystem.

---

## 32. Common Application Structures

The following examples illustrate the range of valid structures.

Minimal application:

    node/mods/tutorial01/
        tutorial01.js

Small UI application:

    node/mods/tutorial02/
        tutorial02.js
        lib/
            main.js
            main.template.js

Database-backed UI application:

    node/mods/store/
        store.js
        index.js
        sql/
            listings.sql
            orders.sql
            summary.sql
        lib/
            database.js
            images.js
            ui/
                ...
        web/
            css/
                ...
            img/
                ...

UI-heavy application:

    node/mods/redsquare/
        redsquare.js
        index.js
        lib/
            main.js
            ...
            ui/
                ...
        web/
            css/
                redsquare-base.css
                ...
        .shots/

Small game:

    node/mods/chess/
        chess.js
        lib/
            chess.js
            chessboard.js
            ...
        web/
            css/
                chess.css
            chessboard.css

Large game:

    node/mods/imperium/
        imperium.js
        lib/
            ...
        src/
            ...
        web/
            css/
            img/
            font/

These are examples, not templates.

Do not copy a larger application's entire tree when creating a smaller application.

---

## 33. Files and Directories That Should Not Be Assumed

The following are optional or application-specific:

    lib/
    lib/ui/
    lib/ui/overlays/
    web/
    web/css/
    web/img/
    web/font/
    sql/
    index.js
    src/
    README
    tests

The following should not be introduced as standard Saito architecture:

    frontend/
    backend/
    controllers/
    routes/
    repositories/
    services/
    models/
    middleware/
    api/
    package.json
    templates/
    mod.ts
    browser-storage/

A module can technically contain unusual structures, but they should have an explicit application-level reason.

The AI should not add them because they are common in other ecosystems.

---

## 34. Legacy and Special Structures

Some structures exist in the repository because of historical applications or specialized requirements.

Examples include:

    lib/email-appspace/
    lib/appspace/
    game-specific src/ pipelines
    react-components/
    nwasm/web/package.json
    .shots/

These should not automatically be treated as current framework conventions.

For example:

`lib/email-appspace/` is associated with an older application organization.

`lib/appspace/` is also a historical naming convention.

Large game `src/` pipelines are application-specific.

`react-components/` represents a particular React-based experiment rather than the default Saito UI architecture.

`nwasm/web/package.json` is a specialized exception rather than evidence that Saito applications are npm packages.

An AI should distinguish between:

    current framework convention

and:

    structure that happens to exist in an existing application.

The presence of a directory in an old application does not make it a recommended structure for new applications.

---

## 35. What the AI Should Do When Creating a New Application

When asked to create a Saito application, the AI should first determine what the application actually requires.

It should ask, conceptually:

Does this application need a persistent Node-side database?

If yes, create:

    sql/

and put the required `.sql` files there.

Does the application need a browser or web interface?

If yes, create:

    web/

and, for CSS:

    web/css/

Does the interface contain substantial UI logic?

If yes, create appropriately named components under:

    lib/ui/

Does a UI component require an overlay?

If yes, use:

    lib/ui/overlays/

Does the application need substantial non-UI application logic?

If yes, put it in semantically meaningful files under:

    lib/

Does the application require generated source or a specialized compilation process?

If yes, consider:

    src/

but only when the application actually needs it.

Does the application require tests?

If yes, create or use a development/test location appropriate to the repository, but do not treat tests as part of the distributed application.

Does the application need custom server-generated HTML?

If yes, an `index.js` HTML factory may be appropriate.

Otherwise, do not create it.

This conditional approach is more important than memorizing a fixed directory tree.

---

## 36. The Tutorial Module Should Be Small

The tutorial applications are particularly important because they teach developers and AI systems what a normal Saito application looks like.

A tutorial should not contain:

    sql/

unless the tutorial is teaching database usage.

It should not contain:

    web/

unless it is teaching web/UI functionality.

It should not contain:

    lib/ui/

unless the tutorial is teaching UI component architecture.

It should not contain tests merely because tests exist elsewhere in the repository.

It should not contain a package manager configuration.

It should not contain frontend/backend directories.

The tutorial should demonstrate exactly the concepts it intends to teach.

This prevents the tutorial from accidentally teaching an AI that every Saito module requires a large application scaffold.

---

## 37. The Main File Should Remain an Entry Point

The main module file is important, but it should not become a dumping ground.

For example:

    myapp.js

should naturally contain things such as:

- module construction;
- initialization;
- Saito lifecycle hooks;
- application-level state;
- transaction handling;
- peer communication;
- integration with Saito APIs;
- the entry point into rendering.

Complex UI implementation should move into UI components.

Complex database logic can move into `lib/database.js`.

Complex transaction construction/processing can move into `lib/transactions.js`.

Complex P2SH functionality can move into `lib/P2SH.js`.

The exact division should follow the application's semantics.

The objective is not to maximize the number of files.

The objective is to prevent unrelated responsibilities from accumulating in one file once the application becomes complex enough to justify separation.

---

## 38. A Useful Mental Model

A Saito application's directory structure can be understood as a set of optional capabilities.

The main file is the application entry point:

    myapp.js

`lib/` is application source organization:

    lib/
        database.js
        transactions.js

`lib/ui/` is application UI organization:

    lib/ui/
        main.js
        main.template.js

`web/` is static application web content:

    web/
        css/
        img/

`sql/` is source SQL for a Node-side application database:

    sql/
        records.sql

`src/` is specialized application source or generation material:

    src/

It is not a required hierarchy.

It is a vocabulary.

An AI should select from that vocabulary according to the application it is building.

---

## 39. AI Rules for Module Structure

When modifying or creating a Saito application:

1. Treat a Saito module as a complete Saito application, not as a small plugin by default.

2. Start with the smallest valid structure.

3. Normally use:

       <slug>/<slug>.js

   as the module entry file.

4. Register the entry file in `node/config/modules.config.js`.

5. Do not assume that every directory under `node/mods/` is loaded.

6. Do not create `mod.js` as a generic Saito convention.

7. Do not create `frontend/` and `backend/` directories.

8. Use the same source tree for Node and browser functionality.

9. Put substantial application source under `lib/` when separation improves clarity.

10. Put substantial UI components under `lib/ui/`.

11. Put UI overlays under `lib/ui/overlays/` when appropriate.

12. Keep complex UI out of the main module file. `render()` should serve as an entry point into the UI rather than becoming the implementation of the entire UI.

13. Keep HTML templates with their associated components when that improves clarity.

14. Put application CSS under `web/css/`.

15. Expect the compile process to produce `web/style.css`.

16. Give substantial UI components appropriately separated CSS source files.

17. Put application static assets under `web/`.

18. Reference application web resources through the module slug.

19. Use `sql/` only when the application actually requires a Node-side SQLite database.

20. Put SQL source in `sql/*.sql`, not runtime `.sq3` files.

21. Understand that the runtime database is normally stored as:

       node/data/<dbname>.sq3

22. Check the compile configuration when database persistence across server resets matters.

23. Do not create a browser-storage directory to represent IndexedDB or other browser persistence.

24. Do not create a module-level `package.json` unless there is a specific reason.

25. Do not create controllers, repositories, services, routes, models, or middleware directories merely because another ecosystem commonly uses them.

26. Do not add tests merely because the application could have tests. If tests are needed, keep them in an appropriate development-only location and do not accidentally compile them into the distributed application.

27. Do not add `src/` unless the application has a genuine source-generation or specialized compilation requirement.

28. Treat game-specific directory structures as game-specific rather than universal Saito conventions.

29. Treat old `appspace` structures, React experiments, and other unusual repository structures as historical or specialized unless the current application specifically requires them.

30. Do not copy the complete directory tree of a large Saito application into a small application.

31. Before creating any file or directory, be able to answer:

       What responsibility does this file or directory have?
       Does this application actually need that responsibility?

32. Prefer the simplest structure that correctly expresses the application.

---

## 40. The Core Principle

Saito's module structure is intentionally simple.

A module can be one file:

    myapp/
        myapp.js

or it can grow into a substantial application:

    myapp/
        myapp.js
        lib/
            database.js
            transactions.js
            ui/
                main.js
                main.template.js
                overlays/
        sql/
            records.sql
        web/
            css/
                myapp-base.css
                myapp-dashboard.css
                myapp-overlay.css
            img/

The second structure is not "more Saito."

It is simply the first structure plus the capabilities that the application actually requires.

The AI should therefore not begin by asking:

> What directories does a Saito module normally have?

It should ask:

> What does this application need to do, and which Saito conventions correspond to those responsibilities?

That distinction is fundamental.

The directory structure is intended to guide the AI toward Saito's architecture, not to force every application into the same template.

The correct Saito application is the smallest structure that clearly expresses the application's responsibilities while using Saito's native module, lifecycle, UI, storage, database, build, and runtime conventions.

# Saito Application Modules: Main Files and ModTemplate

This document defines how the main file of a Saito application should be structured, how it should relate to `ModTemplate`, and how application logic should be organized around lifecycle hooks, transactions, peer messages, domain objects, and UI components.

The goal is not merely to describe what the framework permits.

The goal is to establish the structure that an AI should normally produce when creating or modifying a Saito application.

Saito modules are intentionally conventional. The main module file should provide a compact map of how the application participates in the Saito runtime, while semantically meaningful application logic should be organized into objects and files that make the application easy to understand and debug.

The guiding principle is:

> The module is the application. Organize its internal parts semantically, but do not introduce layers merely to create indirection.

This means that Saito applications should generally prefer:

    app
      ↓
    module
      ├── transactions
      ├── domain objects
      ├── UI components
      ├── database
      └── other semantically meaningful objects

over:

    app
      ↓
    controller
      ↓
    service
      ↓
    manager
      ↓
    repository
      ↓
    module
      ↓
    actual logic

The latter structure may be familiar from other software ecosystems, but it is not the Saito architectural model.

---

## 1. The Main Module File Is the Application's Architectural Map

The main file is normally:

    node/mods/<slug>/<slug>.js

For example:

    node/mods/redsquare/redsquare.js
    node/mods/store/store.js
    node/mods/chat/chat.js

It extends `ModTemplate` and exports the module class.

The main file should contain the functions that explain how the application participates in Saito.

A well-structured main file should allow a developer to open one file and quickly answer questions such as:

- What is this application called?
- What is its slug?
- What does it initialize?
- What UI does it render?
- What blockchain messages does it listen for?
- What off-chain requests does it listen for?
- What peer services does it provide?
- What capabilities does it expose to other modules?
- Does it provide custom HTTP behavior?
- Where are the substantive application objects and transaction implementations?

The main file should therefore be relatively prescriptive in structure.

It should normally consist primarily of:

    constructor()
    installModule()
    initialize()
    render()
    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()
    returnServices()
    respondTo()
    webServer()

plus any other actual `ModTemplate` lifecycle hooks that the application genuinely needs.

Unused hooks should not be added merely because they exist on `ModTemplate`.

The main file is not intended to be a dumping ground for every function used by the application.

---

# 2. `ModTemplate` Is the Application Contract

A Saito application normally extends:

    ModTemplate

`ModTemplate` provides the generic Saito module behavior and establishes the lifecycle through which the application participates in the runtime.

Important lifecycle functions include:

    installModule()
    initialize()
    render()
    onConfirmation()
    onNewBlock()
    onChainReorganization()
    onPeerServiceUp()
    handlePeerTransaction()
    respondTo()
    returnServices()
    webServer()

There are additional hooks in the framework, but an application should implement only those that have a real semantic purpose.

The presence of a method on `ModTemplate` does not mean every module should override it.

The preferred rule is:

> Override the smallest set of Saito lifecycle methods necessary to express the application's behavior.

This is particularly important for AI-generated code.

An AI should not look at `ModTemplate` and copy its entire API into every new module.

---

# 3. The Main File Should Prefer Lifecycle Hooks Over Arbitrary Module Methods

The main class can contain application-specific methods when they genuinely belong to the module itself.

However, the preferred architecture is that the main class primarily expresses Saito lifecycle and protocol participation.

For example:

    constructor(app)

    initialize(app)

    render(app)

    onConfirmation(blk, tx, conf, app)

    handlePeerTransaction(app, tx, peer, mycallback)

    onPeerServiceUp(app, peer, service)

These functions describe how the application connects to Saito.

Substantial application behavior should generally be placed into semantically named objects in `lib/`.

For example:

    lib/
        transactions.js
        tweet.js
        database.js
        P2SH.js
        warehouse.js
        images.js

The exact files depend on the application.

The important rule is semantic organization.

Do not create a file merely because a file can be created.

Do not create a helper merely because a function can be extracted.

---

# 4. Avoid Pointless Helper Functions

One of the most important coding practices in Saito application development is to avoid pointless helper functions.

For example, this is generally undesirable:

    createTweetTransaction(data) {
      return this.transactions.createTweetTransaction(data);
    }

If the module already owns `this.transactions`, this function adds no semantic value.

It creates an unnecessary path:

    UI
      ↓
    mod.createTweetTransaction()
      ↓
    mod.transactions.createTweetTransaction()
      ↓
    actual implementation

The preferred structure is:

    UI
      ↓
    mod.transactions.createTweetTransaction()

The module is already the cohesive application object. There is no need to create a wrapper simply to make the module appear to expose a function that already belongs to one of its objects.

This is not an argument for making everything a separate object.

It is an argument for putting behavior in the object where it semantically belongs.

The AI should ask:

> Does this function provide a meaningful abstraction, or does it merely forward the call?

If it merely forwards the call, it should normally not exist.

---

# 5. Prefer Conceptual Organization Over Artificial Layering

A Saito module should be internally coherent.

If an application has transaction logic, it can have:

    this.transactions

If it has a database abstraction that is substantial enough to deserve one, it can have:

    this.database

If it has domain objects, it can have:

    this.tweets
    this.games
    this.orders

If it has a UI, it can have:

    this.main
    this.header
    this.sidebar

These objects should be attached directly to the module when they are persistent parts of the module.

For example:

    constructor(app) {
      super(app);

      this.transactions = new Transactions(app, this);
      this.tweets = [];
      this.main = null;
    }

Then other objects can use those objects directly:

    this.mod.transactions.createTweetTransaction(...)
    this.mod.tweets
    this.mod.main

There is no need for the module to become a collection of forwarding functions.

The module is the owner.

Its internal objects are its components.

---

# 6. The Constructor

The constructor is called when the module object is created.

It is therefore the appropriate place to establish persistent object structure and defaults.

A constructor may reasonably:

- call `super(app)`;
- establish module identity;
- establish default values;
- initialize persistent arrays or maps;
- construct persistent domain or transaction objects;
- establish event listeners that belong to the lifetime of the module;
- establish references to objects that the module will always own.

For example:

    constructor(app) {
      super(app);

      this.name = "RedSquare";
      this.slug = "redsquare";

      this.transactions = new Transactions(app, this);

      this.tweets = [];
      this.main = null;
    }

The important distinction is that construction is object setup, not complete application initialization.

The constructor should not assume that all of Saito has finished starting.

In particular, the constructor should not normally assume that:

- other modules have been initialized;
- SQL databases have been installed;
- peers exist;
- peer services are available;
- the blockchain has initialized;
- the application has a rendered DOM;
- the module is the active browser module.

Avoid constructor-time lookups such as:

    app.modules.returnModule("SomeModule")

when the lookup depends on module initialization order.

Likewise, do not perform browser rendering in the constructor.

---

# 7. Constructor Event Listeners

A constructor is also a reasonable place to attach listeners to `app.connection` when those listeners belong to the persistent lifetime of the module.

For example:

    constructor(app) {
      super(app);

      this.app.connection.on("some-event", (data) => {
        this.handleSomething(data);
      });
    }

The reason this can be appropriate is that the module object itself persists for the lifetime of the application.

This is different from attaching listeners to transient UI objects that may be repeatedly created and destroyed.

The AI should therefore distinguish:

    persistent module listener
        → constructor can be appropriate

from:

    DOM/component listener
        → component attachEvents()

The exact placement should follow the lifetime of the object receiving the listener.

---

# 8. `installModule()`

`installModule()` is for first-time installation.

It is especially relevant to Node-side module SQL.

If the module contains:

    sql/

then the installation system can create the module's database structures during installation.

This is different from `initialize()`.

Conceptually:

    installModule()
        first-time installation

    initialize()
        every startup

A module should not move normal startup behavior into `installModule()` merely because it happens to need a database.

Likewise, an AI should not add `sql/` merely because a database might someday be useful.

The existence of `sql/` is itself a meaningful architectural decision.

---

# 9. `initialize()` Means "Make the Module Functional"

`initialize()` runs when the application starts.

It is not screen initialization.

It is not equivalent to a web application's controller startup.

It makes the module ready to participate in Saito.

A normal ModTemplate application should generally call:

    await super.initialize(app);

unless there is a specific architectural reason not to.

The superclass initialization establishes important generic module state.

A typical pattern is:

    async initialize(app) {
      await super.initialize(app);

      // module-specific initialization
    }

The AI should treat failure to call `super.initialize(app)` as an exception requiring an explicit reason, not as a normal alternative style.

---

# 10. `initialize()` Must Not Be Confused With `render()`

A module can be initialized even when its UI is not currently visible.

This is fundamental to Saito's architecture.

For example:

    initialize()
        ↓
    module can receive messages
    module can receive transactions
    module can answer capabilities
    module can maintain application state

while:

    render()
        ↓
    browser UI is written or updated

The two responsibilities are different.

Do not put screen rendering into `initialize()` merely because the module is being initialized.

Likewise, do not assume that a module needs to be initialized only when its screen is opened.

---

# 11. Do Not Depend on Peers During `initialize()`

Peer availability is a later condition.

A module may be fully initialized before the network connection to a useful peer exists.

Therefore, operations that depend upon peers should generally be initiated from:

    onPeerServiceUp()

rather than from `initialize()`.

For example, avoid:

    async initialize(app) {
      await super.initialize(app);

      // immediately request something from peers
      await this.requestDataFromPeer();
    }

if the request assumes a peer or service that may not yet exist.

Prefer:

    async onPeerServiceUp(app, peer, service) {
      if (service === "my-service") {
        await this.requestDataFromPeer(peer);
      }
    }

This avoids startup races in which initialization succeeds but the network-dependent operation silently fails because peers have not yet become available.

---

# 12. `render()` Is the Browser UI Entry Point

For modern Saito applications, `render()` is the primary module-level UI entry point.

It should normally be thin.

Its purpose is to:

- determine which application components need to exist;
- create or register those components;
- invoke their rendering;
- establish application-level routing or screen state.

Substantial DOM implementation should normally live in `lib/ui/`.

A conceptual pattern is:

    async render() {
      if (!this.browser_active) return;

      if (!this.main) {
        this.main = new Main(this.app, this);
      }

      await super.render();
      await this.main.render();
    }

The exact implementation varies.

The architectural principle is more important:

> The module's `render()` method should identify and coordinate the UI rather than contain a giant implementation of the UI itself.

---

# 13. UI Components Receive `app` and `mod`

Application UI components normally receive:

    app
    mod

For example:

    constructor(app, mod) {
      this.app = app;
      this.mod = mod;
    }

This gives the component direct access to:

    this.app
    this.mod

The component can therefore use the application's own objects directly.

For example:

    this.mod.transactions.createTweetTransaction(...)
    this.mod.tweets
    this.mod.database
    this.mod.main

There is no need to create a UI service layer merely to mediate access to the module.

A component is part of the application.

It is not an external client of the application.

---

# 14. UI Components Can Call Module-Owned Objects Directly

Suppose the module creates a transaction object during initialization:

    this.transactions = new Transactions(app, this);

The UI should use:

    this.mod.transactions.createTweetTransaction(...)

rather than:

    this.mod.createTweetTransaction(...)

which then forwards to:

    this.mod.transactions.createTweetTransaction(...)

The latter is unnecessary indirection.

The same principle applies to domain objects.

If RedSquare has a `Tweet` object, that object already has:

    this.app
    this.mod
    this.tx

It can therefore use the module and its owned objects directly.

The module should not accumulate proxy methods simply because another object needs to access one of its internal objects.

---

# 15. `render()` May Run More Than Once

A Saito UI component should not assume that `render()` executes only once.

Components may be rendered repeatedly as application state changes.

Therefore, component rendering should generally be written so that it can update existing DOM rather than blindly creating duplicate structures.

Saito browser helpers and established component patterns should be used where appropriate.

The relevant mental model is:

    state changes
        ↓
    render()
        ↓
    component updates existing UI

rather than:

    render()
        ↓
    destroy everything
        ↓
    recreate the entire application

The exact implementation depends on the component.

---

# 16. `attachEvents()` and `initializeHTML()` Are Legacy Patterns

`ModTemplate` contains older UI lifecycle methods including:

    initializeHTML()
    attachEvents()

These exist because older Saito applications used a different UI organization.

For new application development, prefer:

    render()
    UI components
    component-level event attachment

rather than automatically implementing the old module-level methods.

Games and older modules may still use legacy lifecycle paths, especially through `GameTemplate`.

Do not rewrite a working legacy application merely because it uses an older lifecycle.

But do not copy legacy structure into a new application without a reason.

---

# 17. `onConfirmation()` Is the On-Chain Application Listener

`onConfirmation()` is how a module responds to blockchain transactions that belong to its application.

Conceptually:

    transaction
        ↓
    blockchain
        ↓
    confirmation
        ↓
    module.onConfirmation()

The module has effectively opted into the transaction through its application message.

A typical application transaction contains:

    tx.msg.module = this.name

and the module processes its own messages from `onConfirmation()`.

For example:

    async onConfirmation(blk, tx, conf, app) {

      if (conf != 0) return;

      if (tx.msg.module !== this.name) return;

      // process application transaction
    }

The precise confirmation policy depends on the application.

But the common Saito pattern is to use `conf == 0` when the application wants to process the transaction when it first enters the current longest chain.

This is not the same thing as an irreversible finality guarantee.

---

# 18. `onConfirmation()` Is Not a General Message Bus

An AI should not think of `onConfirmation()` as:

    "Here is a transaction; decide whether you want it."

It is more structured than that.

The blockchain callback is associated with application transactions, and the module normally determines whether the transaction belongs to it using the application message.

The common pattern is:

    tx.msg.module
        ↓
    module identity
        ↓
    application-specific request
        ↓
    receive function

For example:

    tx.msg.module = "RedSquare"
    tx.msg.request = "create tweet"

RedSquare can then process that transaction.

This is different from off-chain peer messages.

---

# 19. `handlePeerTransaction()` Is Intentionally More Flexible

`handlePeerTransaction()` is called for incoming off-chain peer transactions/messages.

The important architectural distinction is:

    onConfirmation()
        blockchain/application participation

    handlePeerTransaction()
        off-chain peer communication

The framework does not know in advance which module wants to receive an off-chain message.

Therefore, incoming peer messages are delivered to modules and each module inspects the request.

Conceptually:

    incoming peer message
          ↓
    all modules
          ↓
    each module checks request
          ↓
    matching module processes it

This is intentionally more flexible than `onConfirmation()`.

---

# 20. Off-Chain Requests Need Specific Names

Because every module can see a peer transaction, request names should be sufficiently specific to identify their purpose.

A useful convention is:

    <module>-<request>

or, for more structured application protocols:

    <module>-request-<operation>

For example:

    redsquare-request-tweet

This immediately communicates:

    RedSquare
        ↓
    request
        ↓
    tweet

The precise naming convention can follow the existing application, but the general principle is important:

> An off-chain request should be specific enough that a developer can identify its owning application and semantic purpose from the request name.

Avoid generic requests such as:

    update
    data
    request
    message

when they could collide conceptually with unrelated application protocols.

---

# 21. Off-Chain Requests Often Map to Transaction Pairs

An off-chain request can correspond closely to an on-chain transaction type.

For example:

    redsquare-request-tweet

may correspond to:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

The important architectural relationship is the pair:

    create
       ↕
    receive

The create function constructs the message that another Saito participant will receive.

The receive function defines what that message means when it arrives.

This pair should be easy to identify.

A developer reading:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

should immediately understand that these functions form the two ends of the same application protocol.

---

# 22. Transaction Create/Receive Functions Are Semantic Pairs

Transaction logic should be organized around these protocol pairs.

For example:

    createTweetTransaction()
    receiveTweetTransaction()

or:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

or:

    createPurchaseTransaction()
    receivePurchaseTransaction()

The names should communicate the relationship.

The receive function should make it immediately apparent which create function produces the transaction or message that it consumes.

This is particularly important in applications with many transaction types.

The pairing makes the protocol locally inspectable.

An AI should not create unrelated generic functions such as:

    processTransaction()
    handleMessage()
    executeRequest()

and then hide all transaction semantics behind a generic dispatcher unless the application genuinely requires such an abstraction.

---

# 23. Where Transaction Functions Belong

For a small module, transaction functions may live directly in the main module file.

This is common in Saito applications.

For example:

    onConfirmation()
    createTweetTransaction()
    receiveTweetTransaction()

may all exist in the main file if the module is small enough.

When an application has many transaction types, the transaction implementation can be moved into a semantically named object or file.

For example:

    lib/transactions.js

or, where the transaction system is large enough:

    lib/transactions/
        tweets.js
        orders.js
        listings.js

The reason for moving transaction logic is not that transaction logic is somehow supposed to belong to a separate architectural layer.

The reason is simply organizational scale.

Store is an example where transaction logic became sufficiently substantial to justify a dedicated transaction object/file, including transaction types involving P2SH.

The important rule is:

> Move transaction logic when the number or complexity of transaction types makes the main file difficult to understand, not because Saito requires a generic transaction layer.

---

# 24. Expose Transaction Objects Directly

If a module creates a transaction object, attach it directly to the module.

For example:

    initialize(app) {
      await super.initialize(app);

      this.transactions = new Transactions(app, this);
    }

A UI component can then use:

    this.mod.transactions.createTweetTransaction(...)

An off-chain handler can use:

    this.transactions.receiveRequestTweetTransaction(...)

The main module does not need:

    createTweetTransaction()
    receiveTweetTransaction()
    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

as forwarding methods if all those functions already belong to `this.transactions`.

The object itself is the semantic namespace.

This gives the application a clear internal structure without introducing an unnecessary abstraction layer.

---

# 25. Domain Objects Follow the Same Principle

RedSquare provides an important example.

A Tweet is not merely an anonymous object containing metadata.

It is a meaningful domain object.

A `Tweet` object can contain:

    this.app
    this.mod
    this.tx

and functions that operate on a Tweet.

The object therefore knows:

    what a Tweet is
    how it relates to the application
    what transaction produced it
    what application state it needs

Other components can then work with:

    tweet

rather than repeatedly reconstructing Tweet semantics from raw transaction data.

The same principle applies to other applications.

Examples include:

    Game
    Invite
    Order
    Listing
    Tweet
    Image
    Warehouse record

The object should represent a meaningful application concept.

Do not create classes for arbitrary data structures merely to satisfy an object-oriented pattern.

---

# 26. Domain Objects Can Use the Owning Module Directly

A domain object normally receives:

    app
    mod

For example:

    constructor(app, mod, tx) {
      this.app = app;
      this.mod = mod;
      this.tx = tx;
    }

Because `mod` is the owning module, the object can access the module's own objects directly.

For example:

    this.mod.transactions
    this.mod.database
    this.mod.tweets
    this.mod.main

This is preferable to creating additional proxy objects solely to make these relationships appear more formally separated.

The module is the cohesive application boundary.

Its internal objects are allowed to know about one another when that relationship is semantically meaningful.

---

# 27. The Module Should Be the Owner of Its Objects

A useful mental model is:

    Saito app
        │
        └── module
              │
              ├── transactions
              ├── domain objects
              ├── database
              ├── UI
              └── application state

The module owns these objects.

They are not independent services that happen to communicate with the module.

This means that the AI should generally prefer:

    this.transactions
    this.database
    this.main
    this.tweets

over global registries or dependency injection systems.

Likewise, a component should generally use:

    this.mod.transactions

rather than:

    TransactionService.getInstance(...)

---

# 28. `handlePeerTransaction()` Should Be Explicit

A typical pattern is:

    async handlePeerTransaction(app, tx, peer, mycallback) {

      let request = tx.returnMessage().request;

      if (request !== "redsquare-request-tweet") {
        return super.handlePeerTransaction(app, tx, peer, mycallback);
      }

      await this.transactions.receiveRequestTweetTransaction(tx, peer);

      return 1;
    }

The exact implementation varies.

The important part is that the request is explicitly inspected.

An AI should not write a giant generic handler that attempts to interpret every possible peer message.

It should identify the application's own request names and route them directly to the semantically appropriate function.

---

# 29. Call `super.handlePeerTransaction()` When Appropriate

`ModTemplate.handlePeerTransaction()` contains framework-level handling for certain built-in behaviors.

A module overriding it should therefore understand what the superclass does before replacing it.

A common pattern is:

    async handlePeerTransaction(app, tx, peer, mycallback) {

      // application-specific requests

      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

The exact ordering can depend on whether the application wants to intercept a request before superclass handling.

The AI should inspect the current superclass implementation rather than assuming that `super` is always required at the beginning or always required at the end.

The important principle is:

> Overriding a framework hook does not mean discarding the framework behavior hidden behind the superclass.

---

# 30. `onPeerServiceUp()` Is for Peer Availability

`onPeerServiceUp()` is different from `handlePeerTransaction()`.

The distinction is:

    onPeerServiceUp()
        "A peer with a relevant service is available."

    handlePeerTransaction()
        "A peer sent us an off-chain application message."

A module can use `returnServices()` to advertise services and `onPeerServiceUp()` to react when a peer advertising a relevant service becomes available.

This is where peer-dependent initialization belongs.

For example:

    async onPeerServiceUp(app, peer, service) {
      if (service !== "redsquare") return;

      // request remote data
    }

Do not attempt to solve peer discovery by performing network requests inside the constructor or ordinary `initialize()`.

---

# 31. `returnServices()` Advertises Module Services

A module can advertise network services through `returnServices()`.

These service names participate in peer discovery and coordination.

They should not be confused with:

    respondTo()

or:

    returnModule()

Those are local module interfaces.

The conceptual distinction is:

    returnServices()
        network-visible service capability

    respondTo()
        local synchronous capability interface

    returnModule()
        local direct module access

An AI should not collapse these into one generic "service" abstraction.

---

# 32. `respondTo()` Is a Local Capability Interface

`respondTo()` allows another module to ask this module whether it provides a particular capability.

For example:

    let result = app.modules.respondTo("some capability");

This is local module-to-module communication.

It is not a network message.

It is not an HTTP endpoint.

It is not a peer service.

It is appropriate when a module wants to expose a capability without requiring another module to know its internal implementation.

However, `respondTo()` should not be used merely because it sounds architecturally clean.

If the application has a direct, stable relationship where direct access is appropriate, direct module access may be simpler.

---

# 33. `returnModule()` Is Direct Module Access

When appropriate, modules can directly access another loaded module through the module system.

This creates stronger coupling than `respondTo()`.

That is not automatically bad.

The important question is whether the relationship is actually a direct application dependency.

Do not create `respondTo()` wrappers around everything simply to avoid direct access.

Likewise, do not introduce `returnModule()` dependencies casually when the application only needs a small capability that should be exposed more loosely.

Use the simplest relationship that correctly expresses the dependency.

---

# 34. `webServer()` Is Node-Side HTTP Integration

`webServer()` is used when a module needs to participate in Node's HTTP server.

It can be used for:

- custom HTTP routes;
- custom HTML;
- special server-side behavior;
- module-specific HTTP endpoints.

It is not the normal place for browser UI logic.

Static module assets under:

    web/

are handled through the Saito web serving system.

Do not create:

    routes/
    controllers/
    backend/
    api/

merely because another web framework commonly uses them.

If a module needs a custom HTTP route, implement the actual Saito `webServer()` integration and keep the code close to the module's actual responsibility.

---

# 35. Browser and Node Share the Module

A Saito application is not normally split into:

    frontend/
    backend/

The same module architecture can run in Node and browser environments.

The module can branch when capabilities genuinely differ:

    if (BROWSER == 0) {
      // Node-specific behavior
    }

or:

    if (this.browser_active) {
      // active browser UI
    }

But the application remains one Saito module.

Do not automatically build a REST API between browser and Node just because the application has browser UI.

The browser itself runs Saito application logic.

---

# 36. `browser_active` Is a UI State

A module may exist in the browser without being the active application.

`browser_active` determines whether the module is currently the active browser application.

Therefore, browser UI code should generally respect:

    this.browser_active

For example:

    async render() {
      if (!this.browser_active) return;

      // render active application UI
    }

Do not assume that every module loaded into a browser should render its UI.

A module may be loaded because it provides functionality to another application.

---

# 37. Database Logic

Module-specific SQL belongs in:

    sql/

and substantive database logic can belong in:

    lib/database.js

or another semantically appropriate file.

The module should use Saito's existing storage interfaces rather than introducing a new database abstraction layer.

For example:

    app.storage

is already a Saito storage interface.

If the module genuinely has a substantial database object, it may attach:

    this.database

and let that object encapsulate meaningful database operations.

Do not create:

    repository
    data-access-service
    database-manager
    persistence-controller

merely to wrap `app.storage`.

---

# 38. Application State Belongs Where It Is Semantically Owned

A module may maintain state in:

    this.tweets
    this.games
    this.groups
    this.orders

depending on its application.

This state should belong to the module or its domain objects.

Do not automatically create a state-management framework.

The existence of state does not imply the need for:

    Redux
    stores
    reducers
    state managers
    event buses

Saito applications generally work directly with the module's own state and the Saito runtime.

---

# 39. The Main File Should Not Become a Giant UI File

A module can be large.

There is no arbitrary line-count rule that says the main file must be tiny.

The important question is cohesion.

A substantial application may legitimately have a substantial main module.

But the main file should remain recognizable as the module's Saito integration layer.

It should not contain hundreds of unrelated DOM operations simply because the developer happened to start writing the UI there.

A useful distinction is:

    main module
        Saito lifecycle
        application protocol
        application ownership

    lib/
        domain logic
        transaction logic
        database logic
        substantial application logic

    lib/ui/
        DOM and presentation

This division makes the application easier for both humans and AI systems to understand.

---

# 40. The Main File Is Not a Controller

A common mistake for an AI trained on conventional web applications is to interpret the main Saito module as a controller.

It is not.

A Saito module is the application.

The main file is the application's primary runtime object.

It participates directly in:

    blockchain
    peer communication
    wallet
    storage
    UI
    application state
    other modules

Therefore, do not introduce:

    controller
        ↓
    service
        ↓
    repository
        ↓
    module

just because the main file has many responsibilities.

Those responsibilities are part of what it means to be a Saito module.

Split them into semantic objects when useful, but preserve the module as the ownership boundary.

---

# 41. The Main File Is Not a Generic Dispatcher

Likewise, do not create a generic dispatcher such as:

    ApplicationDispatcher

    TransactionDispatcher

    PeerMessageDispatcher

    EventDispatcher

unless the application genuinely requires such an object.

Saito already provides lifecycle entry points.

For example:

    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()
    respondTo()

These are already the framework's dispatch boundaries.

The application's responsibility is to interpret the messages it receives and invoke the appropriate semantic function.

For example:

    onConfirmation()
        ↓
    inspect tx.msg.request
        ↓
    receiveTweetTransaction()

That is sufficient for many applications.

---

# 42. Recommended Main-File Shape

A typical modern application can have a structure conceptually like:

    class Example extends ModTemplate {

      constructor(app) {
        super(app);

        this.name = "Example";
        this.slug = "example";

        this.transactions = new Transactions(app, this);
        this.main = null;
      }

      async initialize(app) {
        await super.initialize(app);

        // module-specific initialization
      }

      async render() {
        if (!this.browser_active) return;

        // establish/render UI components
        await super.render();
      }

      async onConfirmation(blk, tx, conf, app) {
        if (conf != 0) return;
        if (tx.msg.module !== this.name) return;

        // dispatch application transaction
      }

      async handlePeerTransaction(app, tx, peer, mycallback) {
        let request = tx.returnMessage().request;

        // inspect application-specific request

        return super.handlePeerTransaction(app, tx, peer, mycallback);
      }

      returnServices() {
        return [];
      }

      async onPeerServiceUp(app, peer, service) {
        // peer-dependent behavior
      }

      respondTo(type, obj) {
        // optional local capability
      }

      webServer(app, expressapp) {
        // optional Node HTTP behavior
      }
    }

This is a conceptual shape, not a mandatory template.

The AI should omit anything the application does not need.

---

# 43. What Belongs in the Main File

Good candidates include:

    constructor()
    installModule()
    initialize()
    render()
    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()
    returnServices()
    respondTo()
    webServer()

and genuinely module-level state that is necessary to understand the application.

The main file can also contain small application-specific methods when those methods are genuinely part of the module's own responsibilities.

But it should not accumulate forwarding methods merely to hide the actual object that implements the operation.

---

# 44. What Normally Belongs in `lib/`

Examples include:

    lib/transactions.js
    lib/database.js
    lib/tweet.js
    lib/game.js
    lib/order.js
    lib/warehouse.js
    lib/P2SH.js

The file names should communicate concepts.

A developer should be able to infer what a file does from its name.

Avoid:

    helpers.js
    utils.js
    common.js
    manager.js
    service.js

unless the name has a genuinely coherent semantic meaning in the application.

Generic helper files tend to become dumping grounds.

---

# 45. What Normally Belongs in `lib/ui/`

Application-specific UI belongs under:

    lib/ui/

Examples:

    lib/ui/main.js
    lib/ui/header.js
    lib/ui/sidebar.js
    lib/ui/overlays/
    lib/ui/overlays/payment-overlay.js

The exact organization depends on the application's size.

The important distinction is:

    lib/
        application/domain logic

    lib/ui/
        presentation and interaction

A UI component may still directly invoke application logic.

There is no requirement to insert a controller between UI and module.

For example:

    button click
        ↓
    this.mod.transactions.createTweetTransaction()
        ↓
    network propagation

can be a perfectly valid Saito application flow.

---

# 46. Do Not Create a UI Service Layer

An AI may be tempted to write:

    UI
      ↓
    UIController
      ↓
    ApplicationService
      ↓
    Module

This is normally unnecessary.

The UI is part of the module.

The component can use:

    this.app
    this.mod

directly.

If a component needs to create a transaction, it can call the module's transaction object.

If it needs application state, it can access the module's domain objects.

If it needs a Saito API, it can use `app.wallet`, `app.network`, `app.connection`, etc.

This directness is intentional.

---

# 47. Transaction Propagation Can Belong in the Appropriate Object

A UI component can sometimes create and propagate a transaction directly when that is the natural responsibility of the interaction.

For example:

    let tx = await this.mod.transactions.createTweetTransaction(data);

    await tx.sign();

    this.app.network.propagateTransaction(tx);

The exact transaction construction pattern depends on the application.

The important point is that no artificial controller is required simply because the transaction originates in a UI click.

The transaction object belongs to the module.

The UI is allowed to invoke it directly.

---

# 48. `onConfirmation()` and `handlePeerTransaction()` Should Be Easy to Find

One reason the main file should remain coherent is that these two functions reveal much of the application's network protocol.

A developer should be able to inspect:

    onConfirmation()

and understand:

    What blockchain messages does this application consume?

Then inspect:

    handlePeerTransaction()

and understand:

    What off-chain peer messages does this application consume?

This is valuable during debugging.

It is also valuable for AI systems trying to understand an unfamiliar module.

Do not bury these protocol entry points behind multiple layers of dispatch.

---

# 49. Transaction Naming Should Reveal Protocol Structure

Consider:

    createTweetTransaction()
    receiveTweetTransaction()

This immediately exposes a protocol pair.

Likewise:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

The names reveal:

    create
    ↓
    request
    ↓
    tweet

and:

    receive
    ↓
    request
    ↓
    tweet

This is preferable to names such as:

    processData()
    handlePayload()
    executeMessage()

where the actual application protocol is hidden.

Naming is part of the architecture.

---

# 50. Avoid One-Function Abstractions

The following pattern is usually a warning sign:

    async sendTweet(data) {
      return this.transactions.createTweetTransaction(data);
    }

or:

    receiveTweet(tx) {
      return this.transactions.receiveTweetTransaction(tx);
    }

or:

    async saveTweet(tweet) {
      return this.database.saveTweet(tweet);
    }

If the wrapper adds no semantic behavior, remove it.

Call the object that owns the behavior directly.

A wrapper is justified when it actually contributes something:

    validation
    state transition
    composition
    permission checking
    transaction sequencing
    protocol-specific coordination

But not merely because "all calls should go through the module."

The module is already the owner.

---

# 51. Avoid Helper Proliferation

Do not turn a meaningful operation into a chain of tiny functions such as:

    handleTweet()
      → prepareTweet()
      → normalizeTweet()
      → processTweet()
      → executeTweet()
      → saveTweet()
      → finalizeTweet()

when those functions merely divide one coherent operation into arbitrary pieces.

Saito development generally benefits from relatively substantial, semantically coherent functions.

The right question is:

> Does splitting this function make the concept easier to understand?

If yes, split it.

If no, keep the function together.

"Fatter functions and fewer of them" is often preferable to a forest of trivial helpers.

---

# 52. `super` Calls Should Be Deliberate

When overriding a ModTemplate function, determine what the superclass implementation actually does.

Especially important cases include:

    initialize()
    render()
    handlePeerTransaction()
    installModule()

For example, the normal pattern is:

    await super.initialize(app);

because the superclass establishes important module state.

Likewise, `super.render()` may perform framework-level style/script/component behavior.

Do not omit it merely because the subclass has its own rendering code.

Conversely, if a module intentionally replaces a framework behavior, the omission should be deliberate and understandable.

---

# 53. Games Are a Special Case

Saito games commonly use:

    GameTemplate

rather than treating every game as an ordinary ModTemplate application.

Game-specific lifecycle and UI patterns may therefore differ from the preferred modern ModTemplate pattern.

In particular, existing games may still use:

    initializeHTML()

or other game-specific lifecycle mechanisms.

Do not automatically migrate a game to the ordinary module UI architecture while making an unrelated game change.

The game architecture is documented separately in:

    SAITO-APPLICATIONS-GAMES-AND-THE-SAITO-GAME-ENGINE.md

The important rule for AI systems is:

> Do not assume that every ModTemplate convention applies identically to GameTemplate applications.

---

# 54. Legacy Applications Are Evidence, Not Always Templates

The Saito repository contains applications written at different points in the framework's history.

Examples include applications with:

    initializeHTML()
    attachEvents()
    this.events
    receiveEvent()
    large single-file implementations
    legacy appspace structures

These applications are useful for understanding compatibility.

They should not automatically be treated as the preferred architecture for new development.

The AI should distinguish:

    current preferred pattern

from:

    existing legacy implementation

and:

    compatibility behavior that must remain untouched

This distinction is especially important when modifying an old application.

A refactor should not accidentally convert a legacy application into a different architecture unless that refactor is actually intended.

---

# 55. Main-File Cohesion Is More Important Than File Size

There is no rule that says:

    "The main module must be less than N lines."

A large application may legitimately have a large main class.

The real question is:

> Does the main file remain a coherent representation of the module's participation in Saito?

A large but coherent module can be correct.

A tiny module containing ten layers of pointless forwarding functions can be badly structured.

The preferred direction is:

    coherent main module
        +
    semantically meaningful internal objects

not:

    tiny main module
        +
    enormous abstraction hierarchy

---

# 56. AI Implementation Rules

When creating or modifying a Saito application, an AI should follow these rules.

1. Extend `ModTemplate` unless the application belongs to another Saito application model such as `GameTemplate`.

2. Use the conventional main entry file:

       node/mods/<slug>/<slug>.js

3. Keep the main file focused on Saito lifecycle and application protocol participation.

4. Do not implement every `ModTemplate` method. Implement only the hooks the application actually needs.

5. In an ordinary ModTemplate application, call:

       await super.initialize(app);

   unless there is a specific reason not to.

6. Treat `initialize()` as application initialization, not UI initialization.

7. Do not depend on peer availability during `initialize()`.

8. Use `onPeerServiceUp()` for behavior that depends on peers or advertised services.

9. Keep `render()` as the browser UI entry point.

10. Keep substantial DOM/UI logic in `lib/ui/` rather than turning the main module into a giant UI implementation.

11. Give UI components `app` and `mod` so they can directly use the application's runtime and owned objects.

12. If the module owns a persistent object such as transactions, database, or domain state, attach it directly to the module:

        this.transactions = ...
        this.database = ...
        this.main = ...

13. Let other module-owned objects access those objects directly through `mod`.

14. Do not create a forwarding method solely to expose an object already attached to `mod`.

15. Organize transaction logic around create/receive pairs.

16. Make transaction names reveal their semantic relationship.

17. Keep transaction implementations in the main file when the module is small.

18. Move transaction implementations into `lib/transactions.js` or another semantically meaningful transaction file when transaction volume or complexity warrants it.

19. Do not create a transaction layer merely because "transactions should be separated."

20. `onConfirmation()` should reveal the application's on-chain message protocol.

21. `handlePeerTransaction()` should explicitly inspect application-specific off-chain requests.

22. Use specific request names that identify the module and operation.

23. Remember that `handlePeerTransaction()` is delivered to modules broadly; the module must determine whether a request belongs to it.

24. Do not treat `handlePeerTransaction()` as an HTTP controller.

25. Do not treat `onConfirmation()` as a generic event bus.

26. Do not introduce controllers, services, repositories, dispatchers, managers, resolvers, or middleware merely to wrap existing Saito functionality.

27. Use `app.wallet`, `app.network`, `app.connection`, `app.storage`, `app.keychain`, `app.crypto`, and other Saito APIs directly where appropriate.

28. Prefer direct module ownership over dependency-injection frameworks.

29. Prefer meaningful objects over generic helper collections.

30. Avoid `helpers.js`, `utils.js`, and similar dumping grounds unless they represent a genuinely coherent concept.

31. Avoid one- or two-line helper functions that merely forward calls.

32. Prefer fewer, semantically meaningful functions over large numbers of trivial helpers.

33. Do not confuse `returnServices()`, `respondTo()`, and `returnModule()`. They represent different kinds of relationships.

34. Do not create network APIs or REST controllers when direct Saito module communication is sufficient.

35. Do not split a module into frontend and backend directories merely because conventional web applications do so.

36. Preserve legacy structures when modifying existing applications unless the task specifically calls for architectural migration.

37. When inspecting an unfamiliar application, read the main module file first. It should provide the map for understanding the rest of the application.

---

# 57. The Core Mental Model

The most useful mental model for an AI working on a Saito application is:

    Saito Runtime
         │
         ▼
    Module
         │
         ├── lifecycle hooks
         │
         ├── transactions
         │
         ├── domain objects
         │
         ├── application state
         │
         ├── database
         │
         ├── UI components
         │
         └── peer protocol
         
The module is not a controller.

It is not a service.

It is not a repository.

It is not merely a frontend.

It is the application.

Its internal files and objects exist to keep that application semantically organized as it grows.

The framework provides the runtime boundaries.

The module provides the application.

The best Saito code therefore tends to have a recognizable shape:

    main module
        ↓
    clear Saito lifecycle hooks
        ↓
    direct access to semantically named module objects
        ↓
    direct application logic

rather than:

    main module
        ↓
    arbitrary abstraction layers
        ↓
    generic dispatchers
        ↓
    wrappers
        ↓
    actual application logic

The objective is not maximal abstraction.

The objective is a module whose structure makes its behavior obvious to the next developer — human or AI — who has to understand, debug, modify, or extend it.
# Saito Applications — NFTs and Scripting

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- NFT concepts used by Saito applications
- Scripting associated with NFTs
- How applications create, hold, and use NFTs
# Saito Development — Anti-Patterns and Legacy Code

## 1. Purpose

This document explains common architectural mistakes that an AI developer can make when working with Saito.

It has two purposes:

1. identify patterns that should generally not be introduced into new Saito modules;
2. teach an AI how to interpret existing Saito code without assuming that every existing pattern is a recommended pattern.

Saito contains applications written at different points in its development.

Some code demonstrates current preferred practices.

Some code reflects older APIs.

Some code exists because of application-specific requirements.

Some code is simply historical.

Therefore:

> Existing Saito code is evidence of how Saito has been implemented. It is not automatically a specification for how new Saito code should be implemented.

This distinction is particularly important for AI developers.

An AI can search the repository, find a pattern that appears repeatedly, and incorrectly conclude:

> "This is how Saito does this."

That conclusion may be wrong.

The AI should instead ask:

> "What architectural responsibility does this code serve, and is that responsibility actually required by the new application?"

---

# 2. Scope of Module Development

When an AI is helping a developer create or modify a Saito module, its normal scope is the module itself.

For a module named `foo`, the normal working area is:

    node/mods/foo/

The AI should not modify:

    node/lib/saito/
    node/web/saito/
    other modules
    Rust
    WASM
    framework infrastructure

merely because doing so would make the module easier to implement.

If the requested feature genuinely requires a framework change, that is a separate architectural decision and should be explicitly identified rather than silently bundled into module development.

In normal module development:

    framework
        ↓
    module

The module consumes the framework.

The module should not reshape the framework around its own implementation.

This is one of the most important boundaries an AI should preserve.

---

# 3. The Central Anti-Pattern: Inventing Layers

The most important architectural mistake to avoid is inventing unnecessary layers between pieces of data that already naturally fit together.

A conventional application may be structured like:

    database
        ↓
    repository
        ↓
    domain model
        ↓
    service
        ↓
    DTO
        ↓
    controller
        ↓
    API response
        ↓
    frontend model
        ↓
    UI

That architecture creates many opportunities to transform the same information.

Saito does not require this.

A Saito application can often use:

    transaction
        ↓
    database
        ↓
    transaction
        ↓
    UI

or:

    transaction
        ↓
    domain object
        ↓
    UI

or:

    database row
        ↓
    application object
        ↓
    UI

depending on the application's needs.

The AI should not introduce intermediate abstractions simply because they are familiar from conventional software architecture.

The question is not:

> "What layers can I put between these components?"

The question is:

> "What semantic boundary is actually required here?"

If no meaningful responsibility exists, the additional layer is probably unnecessary.

---

# 4. Data Should Keep the Same Names Across Boundaries

One of the most important Saito programming practices is consistency of data names.

If the same piece of information exists in several parts of the application, its field name should normally remain the same.

For example, suppose a transaction contains:

    tx.msg.data = {
        listing_id: "...",
        seller_public_key: "...",
        price: 100,
        nft_id: "..."
    }

The corresponding database representation should preferably use:

    listing_id
    seller_public_key
    price
    nft_id

The application object should use the same names.

The UI data attributes should use the same identifiers where appropriate.

The peer request and response should use the same semantic names.

There should normally be no need to translate:

    seller_public_key

into:

    sellerPublicKey

into:

    seller_key

into:

    ownerAddress

into:

    creator.publicKey

if all of these actually refer to the same thing.

The names themselves are part of the architecture.

---

# 5. Avoid Mapping Functions

A major warning sign is code whose primary purpose is translating one representation of an object into another representation of the same information.

For example:

    function databaseRowToListing(row) {
        return {
            listingId: row.listing_id,
            sellerPublicKey: row.seller_public_key,
            nftId: row.nft_id,
            askingPrice: row.price
        };
    }

followed by:

    function listingToDatabaseRow(listing) {
        return {
            listing_id: listing.listingId,
            seller_public_key: listing.sellerPublicKey,
            nft_id: listing.nftId,
            price: listing.askingPrice
        };
    }

This is often unnecessary in a Saito application.

If the fields already represent the same information, use the same names.

Prefer:

    {
        listing_id,
        seller_public_key,
        nft_id,
        price
    }

throughout the application.

The goal is not to eliminate every transformation.

A transformation is justified when it represents a real semantic change.

For example:

    raw transaction
        ↓
    application domain object

may involve interpretation.

But:

    database listing_id
        ↓
    JavaScript listingId
        ↓
    network listing_id

is often merely needless translation.

---

# 6. Transaction Data Should Be Naturally Persistable

Saito transactions are particularly well suited to this approach.

A transaction message can contain application data:

    tx.msg = {
        module: "store",
        request: "list-asset",
        data: {
            nft_id: "...",
            seller_public_key: "...",
            price: 100,
            description: "..."
        }
    };

The fields inside `data` should ideally be usable directly by the receiving application and, where appropriate, directly persisted into a database.

This makes the transaction a natural data interchange format.

For example:

    create transaction
        ↓
    tx.msg.data
        ↓
    database
        ↓
    retrieve transaction/data
        ↓
    consuming application
        ↓
    UI

There is no requirement for a chain of DTOs and translation layers.

The transaction itself can carry the application's data.

---

# 7. Adding a Field Should Be Cheap

This design has an important practical consequence.

Suppose an application adds:

    category

to its listing data.

The transaction creation function can change from:

    data: {
        nft_id,
        seller_public_key,
        price
    }

to:

    data: {
        nft_id,
        seller_public_key,
        price,
        category
    }

If the database stores the transaction in serialized form, the database may not need any schema change.

The receiving application automatically gets:

    category

because it received the updated transaction.

A UI component that consumes the transaction can use it immediately.

A database that indexes `category` may need a new column, but that is a separate decision based on whether indexing is actually necessary.

This is a major advantage of treating the transaction as the application's natural data object rather than treating it as merely a transport envelope.

---

# 8. Do Not Build Middleware Translators Between Equivalent Data

The following architecture should immediately attract scrutiny:

    Transaction
        ↓
    TransactionDTO
        ↓
    RequestModel
        ↓
    DatabaseModel
        ↓
    APIResponse
        ↓
    UIRowModel

If each object contains essentially the same information with different field names, the architecture is creating work rather than solving a problem.

The AI should ask:

> Are these genuinely different semantic objects?

If not, use the transaction or data object directly.

The preferred architecture is often closer to:

    transaction
        ↓
    database
        ↓
    transaction
        ↓
    UI

with domain objects introduced only where they provide genuine application meaning.

---

# 9. Do Not Import Web 2 Architecture by Habit

A Saito module is not automatically:

    React frontend
        ↓
    REST controller
        ↓
    service layer
        ↓
    repository
        ↓
    database

The Saito runtime already provides:

    app.wallet
    app.network
    app.blockchain
    app.storage
    app.modules
    app.keychain
    app.crypto
    app.options
    app.connection

and module-level mechanisms such as:

    respondTo()
    returnModule()
    returnServices()
    onPeerServiceUp()
    handlePeerTransaction()
    onConfirmation()

The module should use these mechanisms directly when they match the responsibility.

Do not introduce:

    WalletService
    NetworkService
    BlockchainService
    StorageService
    ModuleRegistry
    EventDispatcher
    PeerManager
    TransactionRepository

merely to wrap Saito APIs.

A wrapper is justified when it represents meaningful application semantics.

A wrapper that merely renames:

    app.wallet.createUnsignedTransaction()

as:

    this.walletService.createTransaction()

does not add useful architecture.

---

# 10. Avoid Generic Services

A class named:

    DataService

is usually a warning sign.

So are:

    NetworkService
    ApplicationService
    UtilityService
    CommonService
    HelperService
    ManagerService

These names often indicate that code has been moved out of a meaningful location without identifying what responsibility it actually owns.

Prefer semantic names:

    ListingManager
    TweetManager
    Database
    P2SH
    Transactions
    NFT
    Game

when those names correspond to real application concepts.

The question is:

> What does this object actually know how to do?

The answer should determine its name and location.

---

# 11. Avoid Repository Abstractions Unless There Is a Real Reason

A conventional application may use:

    ListingRepository

with methods such as:

    findById()
    findAll()
    save()
    update()
    delete()

There is nothing inherently wrong with this pattern.

But it should not be introduced automatically into a Saito module.

If the module has a database, it may simply have:

    lib/database.js

containing:

    ensureSchema()
    saveListing()
    loadListing()
    deleteListing()

or whatever semantic operations the application actually needs.

Likewise, if the application naturally works with transactions, the transaction itself may be the object passed through the system.

Do not introduce a repository merely because the application has a database.

---

# 12. Avoid Generic Controllers

A controller is not required simply because the application has user interactions.

A Saito module can directly implement:

    render()
    attachEvents()
    onClick()
    onPeerServiceUp()
    onConfirmation()
    handlePeerTransaction()

and delegate to domain objects or UI components.

A generic controller layer should only exist if the application actually has a meaningful controller responsibility.

Otherwise:

    UI event
        ↓
    application method

is often sufficient.

---

# 13. Avoid Generic Dispatchers

An AI may be tempted to create:

    EventDispatcher
    RequestDispatcher
    MessageDispatcher
    ActionDispatcher

to route operations that Saito already has mechanisms for.

For example, if an application receives:

    tx.msg.request

the receiving code can inspect that request directly.

If the module has:

    request-tweet
    request-listing
    request-purchase

then explicit handling of those requests is often clearer than constructing a generic dispatch framework.

The request names already provide the semantic dispatch mechanism.

Do not build an abstraction around an abstraction.

---

# 14. Avoid Generic Registries

A registry can be useful when the application genuinely needs dynamic registration.

But an AI should not create:

    ComponentRegistry
    ServiceRegistry
    HandlerRegistry
    DataRegistry
    ProviderRegistry

simply because several objects exist.

If a module has three UI components, the main module can construct them directly.

If a module has several transaction handlers, it can handle them directly or organize them semantically in a transactions file.

A registry is useful when registration itself is an application concept.

It is not useful merely because there are multiple objects.

---

# 15. Avoid Generic Event Buses

`app.connection` provides an important process-local event mechanism.

It should not become a universal replacement for direct function calls.

For ordinary hierarchical UI:

    Main
      ↓
    Header
      ↓
    Component

the parent can directly invoke the child.

Likewise, a child can invoke a method on an object it owns or has been given.

Use events when something genuinely needs asynchronous notification across components or modules.

Do not create:

    UIEventBus
    ComponentEventBus
    ApplicationEventBus

to avoid making an obvious direct call.

Global events can also create hidden dependencies.

An inactive UI component can accidentally react to an event generated elsewhere.

Use the simplest communication mechanism that matches the ownership relationship.

---

# 16. Do Not Turn Saito Synchronization Into a Generic Sync Manager

Saito already has blockchain synchronization.

Application data retrieval is a different problem.

An application may need:

    request newer tweets
    request older tweets
    request a listing
    retrieve a transaction
    query a module database
    obtain a file
    retrieve data from an Archive service

These are application-level operations.

Do not automatically create:

    SyncManager
    SynchronizationService
    UniversalDataSync
    PeerSyncController

and attempt to make every application data source conform to it.

Different data has different:

    ownership
    authority
    persistence
    availability
    freshness
    distribution

Application-specific requests should remain application-specific.

---

# 17. Do Not Poll for Peer Availability

An AI may write code such as:

    setInterval(() => {
        checkPeers();
    }, 1000);

to discover whether a service is available.

This is generally the wrong abstraction.

Saito provides peer service mechanisms such as:

    returnServices()
    onPeerServiceUp()

Use those mechanisms.

The peer network is responsible for maintaining peer connections.

The module should respond to service availability rather than continuously polling the network.

---

# 18. Do Not Perform Peer-Dependent Work in `initialize()`

Initialization should make the module functional.

It should not assume that the required peer service is already available.

This is a common mistake:

    async initialize(app) {
        await super.initialize(app);
        await this.fetchEverythingFromPeer();
    }

The peer may not yet be available.

Peer-dependent operations normally belong in:

    onPeerServiceUp()

or another appropriate network lifecycle path.

This distinction is important because Saito modules operate in a distributed environment.

---

# 19. Do Not Treat Archive as Blockchain Truth

Archive is a data service.

The existence of a transaction in an Archive database does not by itself establish that the transaction is currently part of the longest chain.

Likewise:

    database row exists

does not imply:

    blockchain state says this row is currently valid.

Applications must distinguish:

    blockchain consensus state

from:

    archived transaction data

and:

    module-derived database state.

This matters especially for applications whose correctness depends on current longest-chain state.

It matters less for applications such as social feeds where historical transaction data may remain meaningful even if a particular blockchain inclusion changes.

The AI should determine whether the application actually depends on consensus state before implementing reorganization logic.

---

# 20. Do Not Assume Every Peer Has Every Piece of Data

A Saito network does not imply:

    every peer
        ↓
    identical application database

Different peers can have:

    different archives
    different module databases
    different services
    different histories
    different availability

A service advertisement means that a peer claims to provide a capability.

It does not mean that every peer has that capability.

An application should therefore distinguish:

    blockchain data

from:

    locally available data

from:

    remotely retrievable data.

A remote request may fail.

The application should have an appropriate response to that possibility.

---

# 21. Do Not Assume That an Advertised Service Is Canonical

A peer advertising a service is not necessarily the owner of the application's truth.

For example:

    Archive service

means that the peer can provide archived transaction data.

It does not mean:

    this peer is the blockchain.

Likewise:

    Store service

means that the peer runs the Store application/service.

It does not automatically mean that its database is globally authoritative.

Service discovery tells an application where a capability may be available.

The application still needs to understand what the returned data means.

---

# 22. Do Not Put Data On-Chain Merely Because Saito Is a Blockchain

The blockchain is consensus infrastructure.

It is not a general-purpose database for arbitrary application content.

Do not store large files, large application databases, or high-frequency ephemeral UI state on-chain simply because it is possible.

Ask:

    Does this data need consensus?
    Does this action need blockchain security?
    Does the data need public publication?
    Does the data need transaction-level authorship?
    Is a database sufficient?
    Is a peer service sufficient?
    Can the data be transferred directly between peers?
    Can a hash, reference, or NFT identify the underlying data?

The right answer may involve the blockchain.

It may not.

---

# 23. Do Not Create SQL Without a Scaling Requirement

A module does not automatically need SQL.

Small applications can often use:

    in-memory state
    app.options
    app.storage
    Archive
    browser storage
    serialized transactions

SQL becomes useful when the application needs capabilities such as:

    indexing
    searching
    filtering
    large persistent datasets
    efficient queries
    derived application state

Do not create a database simply because conventional applications usually have one.

But do not avoid SQL when the application genuinely needs a database.

The correct question is:

> What operation requires this persistence mechanism?

---

# 24. Do Not Create a Second Identity System

Saito already has:

    app.wallet
    app.keychain
    app.crypto

An application should not create a second application-specific wallet or identity framework unless there is a genuine semantic reason.

For example, an application may have:

    player identity
    guild identity
    organization identity

that is meaningfully different from the user's Saito public key.

That can be legitimate.

But creating:

    UserWallet
    IdentityManager
    KeyManager

merely to wrap Saito wallet/keychain functions usually creates unnecessary duplication.

---

# 25. Do Not Treat `tx.optional` as Signed Data

Transaction optional data is mutable metadata.

It can be useful for application state that does not need to be part of the transaction's cryptographic identity.

For example:

    likes
    retweets
    oracle annotations
    local-derived metadata

may be stored as optional information.

But optional data should not be treated as though it were covered by the transaction signature.

If an application needs cryptographically authenticated metadata, it needs an appropriate signing mechanism.

The AI should never silently assume:

    tx.optional
        =
    signed transaction content

---

# 26. Do Not Treat Timestamps as Global Truth

A timestamp in application data does not automatically establish a globally authoritative ordering.

Distinguish between:

    blockchain ordering
    transaction metadata
    local observation time
    application event time
    UI display time

If an application needs an ordering guarantee, it should use the mechanism that actually provides that guarantee.

Do not introduce timestamps as a substitute for consensus.

---

# 27. Do Not Confuse Propagation With Confirmation

Sending a transaction into the network means that it has been propagated.

It does not necessarily mean that the transaction is:

    included in a block
    confirmed
    on the longest chain
    irreversible

Applications should distinguish:

    created
    signed
    propagated
    observed
    included
    confirmed

The exact lifecycle depends on the application.

A UI should not claim a stronger state than the underlying event establishes.

---

# 28. Do Not Add Reorganization Handling Everywhere

Reorganization handling is important when application correctness depends on blockchain inclusion.

It is not automatically required for every piece of application data.

For example:

    NFT ownership
    UTXO state
    spendability
    consensus-dependent marketplace state

may require careful reorganization handling.

A social post may not.

The AI should first determine:

> Does this application derive a truth that changes when a transaction leaves the longest chain?

If yes, reorganization handling may be necessary.

If no, adding elaborate reorg machinery may create unnecessary complexity.

---

# 29. Do Not Ignore Reorganizations Where They Matter

The opposite mistake is equally serious.

If a module's database says:

    asset is listed

because it observed a transaction that later leaves the longest chain, the database cannot automatically be assumed to remain a valid representation of current consensus.

Consensus-sensitive applications need an explicit strategy.

That strategy may involve:

    block hash
    inclusion history
    longest-chain status
    transaction signature
    UTXO state
    rebuilding derived state

The implementation should follow the actual application's correctness requirements.

Do not solve this problem generically for every module.

---

# 30. Do Not Make the Main Module a Dumping Ground

The main module file is the architectural map of the application.

It should contain the lifecycle and module-level responsibilities defined by its Saito template.

Do not turn it into a file containing:

    database implementation
    every transaction function
    every UI component
    every utility function
    every protocol handler
    every domain object
    every CSS-related operation

This produces a giant undifferentiated file.

When a responsibility becomes substantial, move it into a semantically named file.

Examples:

    lib/database.js
    lib/transactions.js
    lib/P2SH.js
    lib/tweet.js
    lib/listing.js
    lib/ui/...

The goal is not maximal fragmentation.

The goal is semantic organization.

---

# 31. Do Not Over-Fragment the Code Either

The opposite mistake is creating a new file or class for every few lines.

Avoid patterns such as:

    getPrice()
    getSeller()
    getNftId()
    getListing()
    formatPrice()
    extractPrice()
    mapListing()
    buildListing()
    normalizeListing()

when these functions contain trivial operations that could simply remain in the object that owns the data.

A useful Saito tendency is:

> Fatter functions, fewer functions, when the semantics remain clear.

A function should exist because it represents a meaningful operation, not because an AI believes every expression deserves a helper.

---

# 32. Avoid Getter and Extractor Creep

This pattern is especially dangerous in AI-generated code:

    getData()
    getUserData()
    getTransactionData()
    extractMessage()
    extractContent()
    getContentFromTransaction()
    normalizeContent()

Eventually the actual data flow becomes impossible to see.

Prefer direct access when the ownership is already clear.

For example:

    tx.msg.data.content

may be clearer than:

    this.getContentFromTransaction(tx)

A named function is appropriate when the operation has real semantics or non-trivial logic.

It is not appropriate merely to hide a property lookup.

---

# 33. Avoid "Helper" as a Garbage Category

A file called:

    helpers.js

often becomes a dumping ground.

Likewise:

    utils.js
    common.js
    misc.js
    shared.js

can become impossible to understand.

If a function concerns:

    database

put it in the database namespace.

If it concerns:

    transactions

put it with transaction behavior.

If it concerns:

    P2SH

put it with P2SH behavior.

If it concerns:

    a UI component

put it with that component.

Semantic placement is more useful than generic categorization.

---

# 34. Do Not Over-Componentize the UI

Saito encourages coherent UI components.

That does not mean every `<div>` needs a class.

A component should represent a meaningful visual or interaction responsibility.

Good boundaries might be:

    Header
    Tweet
    TweetManager
    Listing
    PlayerBox
    GameHud

Poor boundaries might be:

    TextWrapper
    LeftColumnContainer
    ButtonContainer
    DataRowWrapper
    GenericPanel

when these objects exist only because the AI mechanically decomposed the HTML.

The UI should be understandable as a visual hierarchy.

---

# 35. Do Not Put All UI in the Main Module

The opposite mistake is keeping an entire application interface inside:

    module.js

with hundreds or thousands of lines of HTML and event handling.

A module can construct:

    this.header
    this.main
    this.tweet_manager
    this.sidebar

and let those objects own their visual responsibilities.

The main module should remain the application-level coordinator.

The components should contain the details of their own presentation and interaction.

---

# 36. UI Components Should Not Invent a Separate Application State Model

A UI component can have local UI state:

    selected
    expanded
    editing
    loading
    visible

But it should not independently recreate the application's authoritative data model.

If the application already has:

    transaction
    listing
    tweet
    game

the UI should normally consume those objects.

Do not create:

    ListingViewModel
    TweetDTO
    TransactionDisplayModel

unless the transformation represents a real semantic need.

---

# 37. Use Transaction Signatures as Data Identifiers Where Appropriate

When a UI element represents transaction-backed data, the transaction signature can provide a natural identifier.

For example:

    <div class="tweet" data-id="TRANSACTION_SIGNATURE">

An event handler can recover the identifier:

    const sig = element.dataset.id;

and retrieve the relevant transaction or object from the module.

This is often better than copying the complete transaction into DOM attributes or constructing another UI-specific identifier.

The transaction signature is already a natural identity for the transaction.

Use it when it is the appropriate identity.

---

# 38. Do Not Duplicate Transaction Data Into Every Layer

Avoid:

    tx
        ↓
    txData
        ↓
    tweetData
        ↓
    tweetDTO
        ↓
    uiData

when all of these contain the same information.

Keep the transaction available.

If a domain object needs selected fields for convenience, that can be useful:

    this.tx = tx
    this.text = tx.msg.data.text

But the underlying transaction should not disappear merely because the application created another object.

This preserves extensibility.

If the transaction gains a new field later, the system can continue carrying the transaction without requiring every intermediate layer to be updated.

---

# 39. Do Not Copy Existing Code Blindly

Repository search is useful.

Blind imitation is not.

Suppose the AI finds:

    sendEvent()

in an existing module.

That does not establish that `sendEvent()` is the preferred mechanism for new code.

Suppose it finds:

    sendTransactionWithCallback()

in several modules.

That does not mean every new operation should use it.

Suppose it finds:

    this.someService

in an old application.

That does not mean a new module should introduce a service class.

Before copying an existing pattern, determine:

    What problem does this solve?
    Why does this code use it?
    Is the mechanism current?
    Is the mechanism application-specific?
    Is there a simpler Saito-native mechanism?
    Is this code merely historical?

---

# 40. Existing Applications Are Reference Material, Not Templates

Saito's existing applications can teach an AI:

    API usage
    transaction formats
    lifecycle hooks
    UI patterns
    database techniques
    game architecture
    peer communication
    practical edge cases

But an existing application should not automatically be treated as a template.

Different applications have different requirements.

A game may legitimately have:

    GameTemplate
    game state
    queue processing
    game-specific synchronization
    specialized UI

A social application does not need those mechanisms.

A marketplace may need:

    SQL
    listings
    UTXO tracking
    reorganization handling

A small utility module may need none of them.

The AI should copy the relevant idea, not the entire architecture.

---

# 41. Games Are a Particularly Important Legacy/Reference Case

Saito games contain specialized architecture.

They may use:

    GameTemplate
    game queues
    game state
    player state
    simultaneous actions
    game-specific UI
    settlement logic

These are appropriate for games.

They should not automatically become the architecture of ordinary modules.

Likewise, ordinary application patterns should not automatically be imposed on games.

The game engine is itself an application framework inside Saito and has its own conventions.

---

# 42. Do Not Treat Every Existing Pattern as Equally Current

When reading repository code, an AI should mentally classify patterns.

Useful categories include:

    preferred/current
    valid specialized pattern
    compatibility pattern
    historical pattern
    transitional pattern
    likely technical debt

The AI does not need to label every line of code.

The important point is that frequency is not the same as authority.

A pattern appearing in ten old modules may still be less appropriate for new code than a pattern appearing in one newer reference implementation.

---

# 43. Do Not Refactor Legacy Code During Module Development

When the task is:

> Build or modify this module.

the AI should normally modify only that module.

It should not decide:

> While I am here, I should modernize this other module.

It should not decide:

> This framework API is ugly, so I will rewrite it.

It should not decide:

> Several existing modules use an old pattern, so I should refactor them.

Those are separate tasks.

Legacy awareness exists to prevent imitation, not to create unsolicited refactoring work.

---

# 44. Do Not "Fix" the Framework to Avoid Understanding the Module

A common AI failure mode is:

    encounter unfamiliar framework behavior
        ↓
    modify framework
        ↓
    module becomes easier

This reverses the architectural relationship.

The preferred sequence is:

    understand framework capability
        ↓
    use framework capability
        ↓
    implement module behavior

If the framework genuinely lacks a required capability, identify that explicitly.

Do not alter framework internals merely because the existing API is unfamiliar.

---

# 45. Generated Files Are Not Source

Saito contains generated artifacts.

An AI should distinguish:

    source CSS
    generated CSS

and similarly distinguish generated build artifacts from authoritative source.

For example, module CSS source belongs under:

    web/css/

while compiled:

    web/style.css

is generated.

Do not make permanent changes directly to generated output.

Modify the source and rebuild.

The same principle applies to generated framework artifacts.

---

# 46. Do Not Use JavaScript to Replace CSS When CSS Is Enough

Responsive behavior should normally be implemented through CSS.

Do not write JavaScript merely to detect:

    mobile
    desktop
    viewport width

when a CSS media query can perform the same job.

JavaScript is appropriate when the application genuinely needs runtime measurement or behavior.

Examples include:

    dynamic HUD sizing
    visual viewport calculations
    canvas measurements
    runtime layout-dependent game behavior

But ordinary responsive styling belongs in CSS.

---

# 47. Do Not Create Global CSS for a Local Component

A component should normally have a distinctive root class.

For example:

    .tweet
        .header
        .body
        .footer

or:

    .listing
        .title
        .seller
        .price
        .actions

This makes ownership obvious.

Avoid generic selectors such as:

    .header
    .body
    .button
    .title
    .container

when they are intended to describe only one component.

Rooted component CSS reduces accidental interactions between applications.

---

# 48. Do Not Mechanically Prefix Every CSS Descendant

The opposite extreme is:

    .tweet
    .tweet-header
    .tweet-body
    .tweet-footer
    .tweet-footer-button
    .tweet-footer-button-label

when simple rooted descendants would be clearer:

    .tweet
        .header
        .body
        .footer
        .button

The component root establishes ownership.

CSS should communicate the component hierarchy rather than reproduce the entire hierarchy in every class name.

---

# 49. Do Not Treat Saito CSS Variables as Local Aliases

Saito CSS variables provide a shared vocabulary for things such as:

    typography
    spacing
    colors
    controls
    themes

Modules can build on these variables.

Do not create unnecessary aliases:

    --my-module-primary-color: var(--saito-primary-color);

unless the alias has a real semantic purpose.

If a module is supposed to inherit Saito themes, using the Saito variable directly allows that theme behavior to propagate naturally.

Module-specific variables are appropriate when they represent genuine module concepts or configurable state.

---

# 50. Do Not Turn Shared UI Into a Mini Design System

If a component is promoted into shared Saito UI, its CSS should remain focused on the component.

Do not introduce an entire parallel:

    spacing system
    typography system
    color system
    button framework

inside a single application component.

Shared components should use the existing Saito design system where appropriate.

Modules may still have their own visual language when that is part of the application's identity.

Games are a particularly clear example.

---

# 51. Do Not Force Games Into Ordinary Application Styling

Games may legitimately use:

    felt
    parchment
    faction colors
    card-specific typography
    board-specific layout
    specialized HUDs

They do not need to look like ordinary Saito applications.

The Saito design system provides infrastructure and shared UI where useful.

It does not require every application to have the same visual language.

---

# 52. Do Not Assume Every Application Needs the Same CSS Architecture

The general direction is:

    Saito design system
        ↓
    module integration/base CSS
        ↓
    component CSS

But this is a useful architectural model, not a command to create three CSS files for every module.

A small module may need only:

    web/css/foo-base.css

A larger module may have:

    foo-base.css
    foo-header.css
    foo-listing.css
    foo-overlay.css

The number of files should follow the actual UI structure.

---

# 53. Do Not Create an Abstraction Before the Second Real Use

AI systems often generalize too early.

They see:

    one listing

and create:

    GenericDataItem

They see:

    one network request

and create:

    RequestManager

They see:

    one database operation

and create:

    Repository

They see:

    one component

and create:

    ComponentFactory

This is usually premature.

Implement the actual requirement first.

If a second genuinely different use appears, look for the shared semantic structure.

If the abstraction still makes sense, introduce it.

---

# 54. Do Not Generalize by Renaming

This is especially common in generated code.

For example:

    saveListing()
    saveTweet()
    saveNFT()

may lead an AI to create:

    saveEntity(entity)

But the original functions may have different semantics.

Likewise:

    handlePurchase()
    handleListing()
    handleTransfer()

should not automatically become:

    handleAction()

Generic names often destroy useful information.

Specific names make application behavior discoverable.

---

# 55. Do Not Hide the Protocol

Network protocols should be visible in the code.

A developer should be able to identify:

    module
    request
    data

inside a transaction or peer request.

For example:

    tx.msg = {
        module: "redsquare",
        request: "request-tweet",
        data: {
            ...
        }
    };

This is preferable to hiding the actual protocol behind layers of generic calls such as:

    this.api.request(...)
    this.transport.dispatch(...)
    this.messageService.send(...)

The protocol is part of the application architecture.

Make it discoverable.

---

# 56. Do Not Invent Generic RPC for Saito Requests

A Saito module already has mechanisms for off-chain application communication.

If a module needs:

    request-listing

it can implement that request explicitly.

There is usually no need to create:

    RPCClient
    RPCServer
    RPCRequest
    RPCResponse
    RPCTransport

unless the application has a genuine protocol-level reason for doing so.

The Saito request itself is already a communication abstraction.

---

# 57. Do Not Hide `app` Behind Dependency Injection Containers

The Saito runtime is already represented by:

    app

Modules can directly access:

    app.wallet
    app.network
    app.storage
    app.blockchain
    app.modules
    app.keychain
    app.crypto
    app.connection

Do not create:

    Container
    DependencyManager
    ServiceLocator

to reproduce what `app` already provides.

Likewise, do not pass ten different framework objects through constructors simply to avoid storing:

    this.app

when the module architecture already expects the application runtime.

---

# 58. Do Not Confuse `respondTo()` With Remote Communication

`respondTo()` is a local capability mechanism.

It allows one module to discover functionality provided by another module in the same Saito process.

It does not send a message across the network.

Remote communication uses the appropriate peer/network mechanisms.

This distinction should remain visible.

---

# 59. Do Not Confuse `returnModule()` With a Generic Service Layer

`returnModule()` is useful when an application genuinely needs direct access to another module.

But it creates a direct dependency.

If the application only needs a capability, `respondTo()` may be more appropriate.

The AI should not create an additional service layer around `returnModule()` merely to make the dependency look more conventional.

---

# 60. Do Not Confuse `returnServices()` With a Registry

`returnServices()` advertises capabilities to peers.

It is service discovery.

It is not a global canonical registry of application state.

The AI should understand the distinction:

    returnServices()
        ↓
    "I provide this capability."

not:

    "I am the authoritative owner of all data associated with this capability."

---

# 61. Avoid Hidden Data Ownership

Every significant piece of data should have an understandable owner.

For example:

    transaction
        protocol data

    Listing
        application concept

    Database
        persistent module data

    app.options
        lightweight local options

    component
        temporary UI state

    blockchain
        consensus-visible state

A common anti-pattern is allowing the same piece of data to exist independently in:

    transaction
    global variable
    database
    module cache
    component
    localStorage

with no clear rule about which copy is authoritative.

Duplication may be necessary for caching.

But the ownership relationship should remain clear.

---

# 62. Do Not Create Caches Without Understanding the Source of Truth

Caching is often appropriate.

But a cache should answer:

    What is the source?
    When is this cache refreshed?
    What happens if it is stale?
    Can it be rebuilt?
    Is it authoritative?
    Is it merely a performance optimization?

For example:

    blockchain
        ↓
    module database
        ↓
    in-memory cache
        ↓
    UI

is reasonable if the database and cache are understood as derived state.

But:

    cache
        ↓
    mysterious truth

is not.

---

# 63. Avoid Copying Fields When Retaining the Original Object Is Better

Suppose a module receives:

    tx

and needs:

    nft_id
    seller_public_key
    price

It may be convenient to store:

    this.tx = tx

and expose selected fields:

    this.nft_id = tx.msg.data.nft_id
    this.seller_public_key = tx.msg.data.seller_public_key
    this.price = tx.msg.data.price

This can be useful.

But the original transaction should remain available when the domain object is transaction-backed.

This gives the application extensibility.

If a future transaction contains:

    royalty
    category
    expiration
    metadata

the object still has access to the transaction even if the convenience fields have not yet been added.

---

# 64. Do Not Make Every Domain Object a Wrapper Around a Wrapper

An AI may create:

    Transaction
        ↓
    TransactionData
        ↓
    ListingModel
        ↓
    ListingViewModel

when the application really needs:

    Listing(app, mod, tx)

The domain object should exist because "Listing" is a useful application concept.

It should not exist merely because the AI believes every layer needs an object.

---

# 65. Do Not Treat File Boundaries as Architectural Boundaries by Themselves

A separate file does not automatically mean a separate abstraction.

For example:

    lib/database.js

can simply be a semantic namespace for database behavior.

Likewise:

    lib/transactions.js

can contain transaction functions without requiring a giant transaction framework.

The important distinction is responsibility, not the number of classes.

---

# 66. Avoid Artificial Interfaces

Do not create interfaces or abstract base classes simply because conventional enterprise programming uses them.

For example:

    IDataProvider
    ITransactionRepository
    IModuleService
    IStorageAdapter

may be unnecessary if there is only one implementation and no meaningful substitution requirement.

Saito already has concrete runtime APIs and module contracts.

Use those contracts.

Add another interface only when it solves a real architectural problem.

---

# 67. Do Not Make Everything Configurable

AI-generated code often introduces configuration for values that are never expected to vary.

Avoid:

    options.ui.default_padding
    options.network.request_timeout
    options.database.cache_mode
    options.render.component_strategy

when the application has no real requirement for runtime configuration.

Configuration is useful when users, deployments, environments, or application instances genuinely need to vary behavior.

Otherwise it obscures the actual code.

---

# 68. Do Not Build Infrastructure for Hypothetical Scale

A module should not automatically receive:

    worker pools
    queues
    caching layers
    background job systems
    sharding
    replication
    distributed locks
    connection pools

because the AI imagines that the application might eventually become large.

Implement the actual application.

Introduce infrastructure when the actual workload requires it.

Saito applications can scale in many different ways, and not every application needs the same architecture.

---

# 69. Do Not Add Security Machinery Without a Security Requirement

The existence of cryptography in Saito does not mean every application needs:

    additional encryption layer
    custom key hierarchy
    token service
    authentication middleware
    custom signing framework

The application should first determine what needs protection.

Examples include:

    transaction authorship
    wallet keys
    private messages
    NFT ownership
    access-controlled data

Use the Saito primitives and existing mechanisms where appropriate.

Do not invent parallel security infrastructure without a specific requirement.

---

# 70. Do Not Confuse Application Logic With Framework Logic

A useful question is:

> Is this behavior required by Saito itself, or only by this application?

If the answer is:

    this application needs it

the default location is the module.

For example:

    listing rules
    tweet rendering
    marketplace approval
    game scoring
    poker settlement

are application concerns.

They do not belong in the framework merely because the framework makes them possible.

---

# 71. Do Not Modify Core to Avoid a Module-Level Decision

If an application needs:

    a particular database query
    a particular transaction format
    a particular UI behavior
    a particular peer request
    a particular cache

implement it in the module.

Do not add generic framework support unless multiple applications genuinely require the same capability and there is a clear framework-level abstraction.

The narrowest correct ownership is normally the best ownership.

---

# 72. Beware the "Perfect Architecture" Trap

AI systems are often rewarded for producing elaborate, internally consistent architectures.

That can be harmful.

A perfectly layered application may be harder to understand than a small module containing:

    one main module
    one transaction file
    one database file
    several UI components

The goal is not architectural maximalism.

The goal is:

    understandable
    correct
    maintainable
    Saito-native
    appropriately extensible

A small amount of duplication can be better than a complicated abstraction.

A direct call can be better than an event system.

A transaction can be better than a DTO.

A database object can be better than a repository/service stack.

---

# 73. The "Same Data, Same Name" Rule

When deciding whether two representations should be merged, use this question:

> Are these actually the same piece of information?

If yes, prefer the same name.

For example:

    nft_id

should normally remain:

    nft_id

across:

    transaction data
    database fields
    application objects
    peer messages
    DOM data attributes

where appropriate.

This gives the application a common vocabulary.

It also makes repository search dramatically more useful.

Searching for:

    nft_id

should find the places where that concept actually exists.

Searching for:

    nftId
    nft_identifier
    token_id
    assetIdentifier

creates unnecessary ambiguity if they all mean the same thing.

---

# 74. Shared Names Reduce Code

Consistent names eliminate entire categories of code.

Without shared names:

    transaction
        ↓
    mapper
        ↓
    database model
        ↓
    mapper
        ↓
    API model
        ↓
    mapper
        ↓
    UI model

With shared names:

    transaction
        ↓
    database
        ↓
    transaction
        ↓
    UI

The second architecture is not merely shorter.

It is easier to extend.

Adding a new field can naturally propagate through the system without requiring every layer to be updated.

---

# 75. Transactions Can Be the Application's Extensible Data Object

A transaction can serve simultaneously as:

    protocol message
    signed object
    transport object
    persisted object
    application data source
    UI data source

This does not mean every application should put all state into transactions.

It means that when the application already has a transaction containing the relevant data, there is often no reason to immediately extract that data into multiple incompatible representations.

Retaining the transaction gives downstream code access to future fields without requiring upstream code to anticipate every consumer.

---

# 76. Do Not Design Around an Artificial API Boundary

An AI may say:

> "The database layer should never know about transactions."

That is a conventional architectural rule.

It is not automatically a Saito rule.

If the database naturally stores serialized Saito transactions, then:

    database
        ↓
    transaction

may be the simplest and most extensible architecture.

Likewise, a UI component may reasonably receive a transaction directly.

Architecture should follow the semantics of the system rather than imported rules about what layers are "supposed" to know about one another.

---

# 77. Do Not Create a Mapping Layer Just to Preserve Layer Purity

This is an especially important warning for AI developers.

Suppose the transaction contains:

    tx.msg.data = {
        title,
        body,
        author_public_key
    }

and the database can store those fields directly.

Do not create:

    TransactionDataMapper

merely because:

> "The database layer should not know about transaction objects."

If the application benefits from storing the transaction directly, do that.

If a database query needs a specialized projection, create the projection because the query requires it.

Do not create it because architectural purity demands another layer.

---

# 78. Do Not Mistake Semantic Objects for Abstraction Layers

A `Tweet` object is useful because:

    Tweet

is an actual application concept.

A `TweetDTO` that merely renames:

    text → content
    public_key → author
    sig → id

is probably not.

A `Listing` object may be useful.

A `ListingDTO` and `ListingModel` and `ListingViewModel` may not be.

The test is:

> Does this object represent a different concept, or merely another spelling of the same concept?

---

# 79. When Existing Code Looks Strange, Ask Why

When repository code seems unnecessarily complicated, the AI should not immediately reproduce it.

It should investigate.

Possible explanations include:

    legacy API
    backward compatibility
    specialized application requirement
    historical implementation
    workaround for an old bug
    genuine framework constraint
    valid domain distinction

The correct response is not necessarily to remove it.

The correct response for module development is usually:

    understand it
        ↓
    avoid copying it unnecessarily
        ↓
    continue implementing the new module using current conventions

---

# 80. Legacy Code Should Inform, Not Dictate

A useful mental model is:

    existing code
        ↓
    evidence

not:

    existing code
        ↓
    specification

The AI should use existing code to learn:

    available APIs
    real signatures
    practical behavior
    edge cases
    compatibility constraints
    working examples

But it should use the architectural documentation to determine:

    preferred design
    ownership
    current conventions
    conceptual model

When the two differ, the difference itself is informative.

---

# 81. Do Not Silently Change Protocol Semantics

Even when implementing a new module, protocol-visible details should be treated carefully.

These can be architectural interfaces:

    tx.msg.module
    tx.msg.request
    field names
    transaction types
    public-key identifiers
    database schema
    service names
    CSS classes consumed by JavaScript
    data attributes

Do not rename them casually.

A field name may be used by:

    transaction creation
    transaction reception
    database persistence
    UI
    peer requests
    external applications

The shared vocabulary is part of the application's interface.

---

# 82. Do Not Rename Data Merely to Match Personal Style

Avoid changing:

    public_key

to:

    publicKey

or:

    nft_id

to:

    nftId

unless there is a real reason.

Consistency with the surrounding Saito application is more important than an AI's preferred naming convention.

The same applies to:

    request names
    module names
    database columns
    CSS classes
    data attributes

Names should be chosen semantically and then used consistently.

---

# 83. Avoid Broad Refactors During Feature Work

When adding a feature, an AI should avoid combining:

    feature implementation
    architectural rewrite
    naming cleanup
    database redesign
    UI redesign
    framework migration

into one change.

This makes debugging difficult and makes it impossible to know which change caused a regression.

Implement the requested behavior.

Make the smallest architectural changes necessary.

If a larger redesign is genuinely needed, identify it separately.

---

# 84. Do Not Optimize Before the Data Flow Is Correct

A common AI pattern is to introduce:

    caching
    batching
    memoization
    indexes
    worker threads
    prefetching

before the application has established the correct data flow.

First establish:

    where data originates
    how it moves
    who owns it
    what is authoritative
    how it is persisted
    how it reaches the UI

Then optimize the actual bottleneck.

---

# 85. Do Not Hide Errors Behind Generic Fallbacks

Avoid code such as:

    try {
        ...
    } catch {
        return {};
    }

or:

    if (!data) {
        return {};
    }

when an absent value represents an actual application error.

Generic fallbacks can make distributed bugs extremely difficult to diagnose.

The application should distinguish between:

    not found
    not yet available
    unavailable peer
    invalid data
    malformed transaction
    database failure
    genuine empty result

The error semantics should remain visible.

---

# 86. Do Not Assume Network Success Means Application Success

A request can be:

    sent
    received
    processed
    persisted
    displayed

These are different states.

Do not mark an operation complete merely because the request was propagated.

The application should identify the actual event that means:

> The operation has succeeded.

This is especially important for:

    payments
    NFTs
    marketplace actions
    game settlement
    blockchain transactions

---

# 87. Do Not Assume UI State Is Application Truth

The UI may say:

    loading
    selected
    pending
    visible
    confirmed

but these labels should correspond to actual application states.

Do not let:

    modal is closed

mean:

    transaction succeeded.

Do not let:

    row exists in DOM

mean:

    database contains the record.

The UI represents application state.

It does not create authoritative state merely by rendering it.

---

# 88. Do Not Create Global State to Solve Component Ownership

If a child component needs information from its parent, pass it or let the parent call the child.

Do not automatically create:

    window.appState
    window.currentListing
    globalSelectedTweet
    globalGameState

to make information accessible.

Saito modules already provide an application-level object and component ownership structure.

Use those relationships.

---

# 89. Avoid Accidental Coupling Through DOM Selectors

A component should generally own its DOM.

Avoid code where one component searches arbitrary parts of the application for:

    document.querySelector(".some-other-component .button")

when the relationship could be expressed through object ownership.

The parent should arrange children.

The child should manage its own internal elements.

This produces a clearer boundary between UI components.

---

# 90. Avoid CSS and JavaScript Contract Drift

Some CSS classes are effectively application interfaces because JavaScript depends on them.

For example:

    .tweet
    .tool.like
    #hud
    .saito-overlay
    data-id

If JavaScript selects an element by a class or data attribute, that selector is part of the component contract.

Do not rename CSS classes casually without searching their consumers.

Likewise, do not remove a data attribute simply because it appears unused in the HTML.

Search the JavaScript first.

---

# 91. Avoid Generated CSS Edits

If the module has:

    web/css/foo-base.css
    web/css/foo-tweet.css

and generates:

    web/style.css

edit the source files.

Do not manually patch:

    web/style.css

because the generated file will be regenerated.

The same principle applies to generated Saito framework CSS.

---

# 92. Avoid Treating Every CSS Override as Technical Debt

A module may legitimately need to override Saito styles.

The preferred place for ordinary module-level overrides is its base CSS.

For example:

    foo-base.css

can establish how the module integrates with the Saito page and design system.

An override is not automatically bad.

The question is whether the override is:

    deliberate
    local
    understandable
    required by the application's visual language

Unnecessary overrides should be removed.

Intentional overrides should remain.

---

# 93. Avoid Treating Every Difference From Saito UI as Wrong

Saito is permissionless application infrastructure.

Applications may have distinctive interfaces.

A game may need a radically different visual language.

A marketplace may need dense information presentation.

A social application may need feed-specific interactions.

The Saito design system provides reusable infrastructure.

It is not a requirement that every module look identical.

---

# 94. A Practical AI Test: Can You Explain Every Layer?

Before adding an abstraction, the AI should be able to answer:

> What responsibility does this layer own?

For example:

    Listing
        represents marketplace listing

good.

    ListingRepository
        retrieves listings

possibly useful.

    ListingService
        calls ListingRepository

requires justification.

    ListingController
        calls ListingService

requires further justification.

    ListingDTO
        renames Listing fields

probably unnecessary.

    ListingViewModel
        renames ListingDTO fields again

strong warning sign.

The more layers that exist, the stronger the justification should be.

---

# 95. A Practical AI Test: Can the Data Flow Be Drawn Simply?

If the feature is:

> Display a tweet retrieved from a Saito transaction.

A healthy architecture might be:

    transaction
        ↓
    Tweet
        ↓
    Tweet.render()

or:

    transaction
        ↓
    Tweet.render()

If the architecture is:

    transaction
        ↓
    decoder
        ↓
    mapper
        ↓
    repository
        ↓
    service
        ↓
    controller
        ↓
    DTO
        ↓
    view model
        ↓
    component

the AI should stop and ask why.

Complexity can be justified.

It should not be assumed.

---

# 96. A Practical AI Test: What Happens When a New Field Is Added?

This is one of the strongest tests for Saito architecture.

Suppose a transaction gains:

    category

Ask:

> How many files must change?

A good architecture may require:

    create transaction

and:

    UI

and perhaps:

    database schema

if the field needs indexing.

A poor architecture may require:

    transaction schema
    transaction DTO
    mapper
    repository model
    service model
    API response
    frontend model
    UI model
    serialization layer
    database mapping

The number of changes is a useful signal.

If adding one data field requires changing many translation layers, the architecture is probably creating unnecessary boundaries.

---

# 97. A Practical AI Test: Can Data Be Persisted Without Translation?

If:

    tx.msg.data

already contains the application's data, ask:

> Can this transaction or its data be stored directly?

If yes, consider doing so.

This can eliminate:

    field extraction
    mapping
    DTO construction
    serialization conversion
    reconstruction

The database may still maintain indexes or derived columns.

But the underlying transaction can remain the application's extensible data object.

---

# 98. A Practical AI Test: Can the UI Consume the Same Object?

If a UI component needs data that already exists in:

    tx.msg.data

ask:

> Why does the UI need another representation?

It may be perfectly reasonable for:

    Tweet

to receive:

    tx

and render:

    tx.msg.data.text

or for:

    Listing

to retain:

    this.tx

while exposing convenience fields.

The UI should not require a separate transport-to-view translation merely because it is a UI.

---

# 99. A Practical AI Test: Is This Abstraction Removing Complexity or Moving It?

A new class may make one file shorter while making the application harder to understand.

Ask:

> Did this abstraction actually remove complexity?

or:

> Did it move complexity into another file?

For example:

    this.saveListing()

might be cleaner than five SQL statements in the main module.

But:

    this.listingService.saveListing()

which calls:

    this.repository.save()

which calls:

    this.databaseAdapter.insert()

may merely relocate the same complexity.

Abstraction is valuable when it creates a meaningful semantic boundary.

---

# 100. A Practical AI Test: Is This Saito-Native?

Before implementing a feature using a familiar Web 2 pattern, ask:

    Is there already a Saito mechanism for this?

Examples:

    local capability
        → respondTo()

    direct module access
        → returnModule()

    peer service discovery
        → returnServices() / onPeerServiceUp()

    off-chain application request
        → Saito request mechanisms

    blockchain transaction
        → wallet / network

    local transaction storage
        → app.storage

    identity
        → app.wallet / app.keychain

    cryptography
        → app.crypto

    process-local event
        → app.connection

Use the existing mechanism when it fits.

---

# 101. AI Rules for Legacy Code

When examining existing Saito code, the AI should:

1. Treat existing code as evidence rather than automatic specification.
2. Identify whether a pattern is current, specialized, transitional, or historical before copying it.
3. Prefer documented Saito architecture over incidental repository patterns.
4. Inspect current API signatures rather than relying on remembered examples.
5. Search for consumers before changing protocol-visible names.
6. Preserve deliberate behavior when working within an existing module.
7. Avoid unsolicited refactoring outside the requested module.
8. Avoid modifying framework code merely to simplify module implementation.
9. Reuse existing patterns when they solve the same actual problem.
10. Prefer the simplest current Saito-native mechanism when several patterns are available.

---

# 102. AI Rules for New Module Development

When creating a new module, the AI should normally:

1. Work inside the module directory.
2. Start from the module directory conventions.
3. Use `ModTemplate` or the appropriate specialized template.
4. Keep the main module focused on lifecycle and module-level responsibilities.
5. Put substantial application concepts in semantic objects or files.
6. Build UI as coherent components.
7. Keep data names consistent across transaction, database, application, and UI boundaries.
8. Prefer transactions as naturally extensible data objects when appropriate.
9. Use direct Saito APIs rather than wrapping them unnecessarily.
10. Use explicit request names.
11. Use `respondTo()` for local capabilities.
12. Use `returnModule()` only for genuine direct dependencies.
13. Use `returnServices()` and `onPeerServiceUp()` for peer services.
14. Use off-chain requests for application data that does not need blockchain publication.
15. Use blockchain transactions when the application actually needs blockchain properties.
16. Use SQL when application scale or query requirements justify it.
17. Keep caches and derived state clearly identified as derived state.
18. Keep UI ownership hierarchical.
19. Use rooted component CSS.
20. Edit CSS source rather than generated output.
21. Avoid introducing speculative infrastructure.
22. Avoid creating mapping layers unless they represent real semantic transformations.

---

# 103. The Preferred Mental Model

A Saito module should often be understandable as:

    Saito runtime
          │
          ▼
       Module
          │
     ┌────┼────┐
     │    │    │
    data  UI  protocol
     │    │    │
     └────┼────┘
          │
      transactions
          │
     peers / chain

The module can contain:

    application logic
    transactions
    domain objects
    UI
    databases
    caches
    peer protocols

There is no requirement to insert generic layers between each of these responsibilities.

---

# 104. The Preferred Data Model

When application data is naturally transaction-shaped, a useful model is:

    create transaction
          │
          ▼
    tx.msg.data
          │
     ┌────┼────┐
     │    │    │
     ▼    ▼    ▼
   store  peer  UI
     │
     ▼
  database

The same field names should flow through the system.

For example:

    nft_id
    seller_public_key
    price
    description

remain:

    nft_id
    seller_public_key
    price
    description

rather than being repeatedly translated.

This allows the network edge, database edge, and UI edge to operate on the same conceptual data.

---

# 105. The Preferred Extension Model

When new information is added:

    old:
        nft_id
        seller_public_key
        price

    new:
        nft_id
        seller_public_key
        price
        category

the transaction creator adds the new field.

Downstream systems can receive it automatically.

A serialized transaction database may require no change.

A consuming application can begin using the new field.

A specialized database index can be added later if required.

This is a more extensible architecture than requiring every layer to have a separately maintained representation of the transaction.

---

# 106. The Goal Is Not Zero Abstraction

Saito does not prohibit abstraction.

Good abstractions include:

    Tweet
    Listing
    Database
    P2SH
    Transactions
    TweetManager
    Game
    meaningful UI components

These abstractions exist because they represent real concepts or responsibilities.

The anti-pattern is abstraction without semantic purpose.

The question is not:

> "Can this be abstracted?"

The question is:

> "Does abstraction make the application's actual structure clearer?"

---

# 107. The Goal Is Not Zero Duplication

Sometimes duplicating a small amount of data is useful.

For example:

    this.tx = tx
    this.price = tx.msg.data.price

can be perfectly reasonable.

The problem is not duplication itself.

The problem is losing the relationship between the copies.

The application should know:

    tx
        authoritative transaction object

    price
        convenient derived field

rather than having several independently mutable representations with unclear ownership.

---

# 108. The Goal Is Not Minimal Code at Any Cost

The simplest implementation is not necessarily the fewest lines.

A semantic class can make an application easier to understand.

A database object can keep SQL out of the main module.

A UI component can keep visual logic out of the application lifecycle.

A transaction function can make a protocol explicit.

These are useful boundaries.

"Simplest" means:

> the smallest architecture that expresses the actual responsibilities clearly.

It does not mean:

> put everything into one file.

---

# 109. Final Architectural Rule

When an AI is uncertain, prefer the architecture that preserves the application's natural objects and relationships.

Prefer:

    transaction
    data
    domain object
    component
    module
    database
    Saito runtime

over invented intermediate layers.

Prefer:

    same data
    same names

over repeated translation.

Prefer:

    direct calls

over unnecessary dispatch.

Prefer:

    explicit requests

over generic RPC.

Prefer:

    application-specific persistence

over universal synchronization.

Prefer:

    semantic files

over generic helpers.

Prefer:

    module ownership

over framework modification.

Prefer:

    current documented conventions

over blind imitation of legacy code.

And above all:

> Do not make the architecture more complicated merely because conventional software architecture provides a name for the complication.

Saito applications should use the simplest architecture that correctly expresses their actual data, protocol, persistence, network, and UI requirements.
# Saito Development — Build, Installation, and Configuration

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- Build and compilation workflow
- Installation and development environment setup
- Configuration and environment-specific behavior
- Generated files and build artifacts
- Common development setup issues
# Saito Development Coding Practices

This document describes the coding practices that should guide the development of Saito applications.

The purpose is not to impose a rigid software architecture or require every application to use the same collection of classes. The purpose is to help developers, and especially AI coding agents, produce applications that are simple, semantic, easy to understand, and easy to extend.

A well-structured Saito application should make its architecture visible in its source tree.

A developer should be able to look at the module directory, open the main module file, follow the named objects and functions into `lib/` and `lib/ui/`, and understand what the application is doing without first having to understand a framework invented by the application itself.

The guiding principle is:

> Implement the application with the smallest amount of structure that makes its behavior clear.

Saito already provides the platform. Application code should express the application.

---

## 1. The Main Module Is the Architectural Center

A Saito application has a main module file extending `ModTemplate`.

The main module should be the central framework-facing file and the high-level map of the application.

It normally contains:

- the module constructor
- initialization
- lifecycle hooks
- blockchain callbacks
- peer request handling
- service advertisement
- `respondTo()` capabilities
- top-level rendering
- ownership of major application objects
- high-level application coordination

The main file should make it possible to understand how the application connects to Saito.

It should not become a dumping ground for every function used by the application.

If a piece of logic has a clear semantic home elsewhere, put it there.

For example:

- database operations belong in the database implementation
- transaction construction belongs in transaction functions
- a Tweet's behavior belongs with the Tweet
- substantial UI behavior belongs in a UI component
- provider-specific logic belongs in its provider implementation

The main module should connect these things rather than reimplement them.

---

## 2. The Main File Should Be Easy to Read

The main module is one of the first files a developer or AI should be able to understand.

A useful main file should make the following questions easy to answer:

- What is this module?
- What objects does it own?
- What happens when it initializes?
- What blockchain events does it handle?
- What peer requests does it handle?
- What services does it provide?
- What capabilities does it expose to other modules?
- What does it render?
- Where does the application logic live?

The main module can be substantial.

The goal is not to make it artificially small.

The goal is to keep it conceptually coherent.

A 500-line module whose code clearly represents the application's framework integration can be better than a 100-line module surrounded by twenty unnecessary abstraction files.

---

## 3. `lib/` Is a Semantic Application Namespace

Application logic that does not belong directly in the main module should generally live in `lib/`.

The important point is that `lib/` is not a generic "stuff that didn't fit" directory.

Files should have meaningful names that tell the developer what they contain.

Examples include:

    lib/database.js
    lib/transactions.js
    lib/oauth.js
    lib/profile.js
    lib/tweet.js
    lib/listing.js
    lib/invite.js

The exact files depend on the application.

Do not create files merely to make the main module shorter.

Create them when they represent a coherent application concept or responsibility.

The source tree should therefore communicate the application.

For example:

    mymodule/
        mymodule.js
        lib/
            database.js
            transactions.js
            profile.js
            tweet.js
            ui/
                main.js
                tweet.js
                profile.js

already tells a developer something about the application before they open a single file.

---

## 4. `lib/ui/` Is for Substantial UI Components

Substantial UI responsibilities should normally be placed under:

    lib/ui/

A UI component should represent something that actually renders or controls a coherent part of the interface.

For example:

    lib/ui/main.js
    lib/ui/profile.js
    lib/ui/tweet.js
    lib/ui/listing.js

The exact organization is flexible.

A small module does not need to create a separate file for every piece of HTML.

The purpose of `lib/ui/` is to give substantial UI behavior an obvious home.

The main module can then remain focused on the framework and application lifecycle:

    render() {
        this.main.render();
    }

while the actual UI component contains the details of rendering and interaction.

---

## 5. Do Not Invent a Rigid Object Taxonomy

Saito does not require every application to contain:

    DomainObject
    Repository
    Service
    Controller
    View
    Manager
    Model

or any other fixed collection of architectural layers.

An application object can represent data, behavior, and visual identity at the same time.

For example, a Tweet can naturally be an object that:

- represents a Tweet
- contains Tweet data
- knows how to render the Tweet
- responds to interactions with the Tweet

There is nothing architecturally wrong with this.

A Tweet is both an application object and a UI component.

The important question is not:

> Is this object technically a domain object or a UI component?

The important question is:

> Does this object have a coherent responsibility, and can a developer easily understand what it does?

---

## 6. Separate Objects and UI Components When It Helps

There are also situations where separating an application object from its UI representation is useful.

This is particularly true when the same object has multiple substantially different visual representations.

For example:

    this.nft

might represent an NFT object while:

    NFTCard

renders one representation of that NFT.

Another component could render the same NFT differently.

In that situation, separating:

    NFT

from:

    NFTCard
    NFTDetail
    NFTPreview

may make the architecture clearer.

The rule is therefore not:

> Domain objects must never render themselves.

Nor is it:

> Every domain object must render itself.

The rule is:

> Separate the object from its UI representation when the separation makes multiple representations or substantially different responsibilities easier to understand.

Otherwise, a single coherent object may naturally own both its data and its visual identity.

---

## 7. Prefer Semantic Ownership

Code should live with the thing that conceptually owns it.

If the function is about a Tweet, look first at the Tweet.

If it is about a database, look in the database implementation.

If it creates or receives transactions, look in the transaction implementation.

If it renders a profile, look in the profile UI component.

If it manages a collection of Tweets, a Tweet manager may be appropriate.

The important question is:

> Where would a developer naturally look for this behavior?

The answer should usually determine where the function lives.

This is more important than achieving an abstractly "clean" class hierarchy.

---

## 8. Use Objects When They Represent Real Application Concepts

An application should create objects when an application concept has meaningful identity, behavior, or visual representation.

Examples include:

- Tweet
- NFT
- Listing
- Profile
- Game
- Invite
- Card
- Player
- Comment

An object can contain:

- application data
- derived state
- behavior
- rendering
- event handling

when those things naturally belong together.

Do not create a class merely because there is a data structure.

Likewise, do not leave a meaningful application entity scattered across unrelated functions merely because a class might seem unnecessary.

The question is whether the object makes the application easier to understand.

---

## 9. Keep Object Ownership Obvious

A typical Saito application object can receive:

    app
    mod
    data

For example:

    constructor(app, mod, data = {}) {
        this.app = app;
        this.mod = mod;
        this.data = data;
    }

The exact arguments depend on the object.

The important relationships are:

- `app` is the Saito application
- `mod` is the module that owns the object
- the remaining arguments contain application-specific information

The object should retain the relationships it actually needs.

Do not create additional layers merely to rename those relationships.

For example, do not introduce:

    this.application
    this.moduleManager

when the object really just needs:

    this.app
    this.mod

Simple relationships are easier to understand.

---

## 10. Do Not Copy Data Without a Reason

If an object receives a source object, do not automatically copy every field onto the object.

For example:

    constructor(app, mod, tweet_data) {
        this.app = app;
        this.mod = mod;
        this.tweet_data = tweet_data;

may be preferable to copying every field into:

    this.signature
    this.public_key
    this.text
    this.timestamp
    this.image
    this.reply_to
    this.retweet_of
    ...

unless those fields genuinely have independent object-level meaning.

Copy fields when doing so improves the object's interface or creates useful derived state.

Do not copy them merely because copying feels more object-oriented.

---

## 11. Application Objects Can Have Visual Identity

A Saito application object does not need to be separated from its visual representation merely because one is called "data" and the other is called "UI."

An object may naturally know how to render itself.

For example:

    tweet.render()

can be entirely appropriate.

The Tweet is the thing being represented.

Its rendering is part of its visual identity.

This can make the application's structure particularly intuitive:

    Tweet
        |
        +--- render()
        +--- attachEvents()
        +--- interaction methods

A user interacts with the Tweet.

The Tweet responds.

There is no need to introduce an interaction dispatcher simply to route the click back to the Tweet.

---

## 12. Multiple Representations Create a Reason to Separate UI

When an object has several substantially different visual representations, separation can become useful.

For example:

    NFT
        |
        +--- NFTCard
        +--- NFTDetail
        +--- NFTPreview

Each UI component can reference the same underlying NFT.

This gives the application a clear distinction:

    NFT

is the object.

    NFTCard

is one visual representation of it.

This is a useful reason to introduce UI components.

It is not a reason to introduce a UI abstraction for every object automatically.

---

## 13. Prefer Direct Behavior

When an object owns an interaction, let the interaction call the object.

For example:

    tweet.onClick()

is preferable to introducing:

    InteractionManager
        -> ClickDispatcher
            -> TweetHandler
                -> tweet.onClick()

The latter structure adds names and files without adding meaning.

Direct behavior makes the application easier to understand.

It also gives developers a useful mental model:

> I clicked this object, so this object's method ran.

That directness is an important part of Saito's programming model.

---

## 14. Avoid Middleware Cruft

Middleware is not prohibited in every possible application.

There are legitimate situations where an intermediate layer has a real responsibility.

But middleware should not be introduced merely to create another architectural boundary.

Be especially suspicious of chains such as:

    UI
      -> Handler
      -> Dispatcher
      -> Service
      -> Manager
      -> Application
      -> Object

when each layer simply forwards the request.

This creates code that looks sophisticated but makes the actual behavior harder to follow.

The test is:

> What does this layer actually do that could not be done by calling the underlying object directly?

If the answer is "nothing," remove the layer.

---

## 15. Avoid Generic Service, Adapter, Dispatcher, and Handler Layers

Names such as:

    Service
    Adapter
    Dispatcher
    Handler
    Controller
    Resolver
    Provider
    Manager

are not automatically bad.

They can describe real responsibilities.

The problem is creating these objects because the architecture seems more professional when it has more layers.

For example:

    GameHandler

does not automatically make sense.

If the object is actually a game, call it:

    Game

If it manages a collection of games, call it something that describes that responsibility.

If it handles a specific protocol request, give the function a name describing the request.

The source tree should communicate the application's concepts, not an abstract architecture vocabulary.

---

## 16. Avoid Pass-Through Functions

Do not create functions whose only purpose is to call another function with the same arguments.

For example, avoid:

    sendTweet(tweet) {
        return this.tweetManager.sendTweet(tweet);
    }

if the module adds no meaning.

Prefer:

    this.tweetManager.sendTweet(tweet);

Likewise, avoid:

    getWallet() {
        return this.app.wallet;
    }

when callers can use:

    this.app.wallet

directly.

A wrapper is justified when it adds meaningful application behavior, establishes meaningful ownership, or provides a genuinely useful abstraction.

A wrapper that only renames another function is usually unnecessary.

---

## 17. Use Saito APIs Directly

Saito already provides the application's runtime.

Use the existing APIs directly.

Examples include:

    app.wallet
    app.network
    app.blockchain
    app.storage
    app.modules
    app.keychain
    app.crypto
    app.connection
    app.options

Do not create:

    WalletService
    NetworkService
    BlockchainService
    StorageService
    CryptoService

merely to wrap those APIs.

The application should add its own semantics on top of Saito.

It should not recreate Saito's architecture inside the module.

---

## 18. Use the Transaction as an Application Data Object When Appropriate

One of Saito's useful architectural properties is that application data can map naturally onto transaction data.

An application object can conceptually travel through the network as transaction data.

For example:

    Tweet object
        ↓
    tx.msg.data
        ↓
    serialized transaction
        ↓
    network / blockchain
        ↓
    received transaction
        ↓
    reconstruct Tweet
        ↓
    Tweet UI

This is particularly powerful when the application object's fields map naturally onto transaction fields.

The same application code can therefore construct an object locally, serialize its relevant data into a transaction, transmit it, deserialize it on another node, and reconstruct the same application object.

This reduces the need for intermediate representations.

Do not automatically create:

    Object
        -> DTO
        -> RequestModel
        -> NetworkModel
        -> TransactionModel

when the application's object can map directly to the transaction.

---

## 19. Transactions Are Not Generic Middleware

Transactions have blockchain meaning in Saito.

They are not simply another generic transport object.

Use them when the application actually needs transaction semantics, such as:

- blockchain propagation
- authenticated application messages
- financial actions
- NFT operations
- scripts
- public application data
- other application operations that appropriately belong in Saito transactions

For off-chain application communication, use the appropriate Saito communication mechanisms instead.

The coding principle is:

> Use the simplest Saito communication mechanism that provides the required semantics.

Do not force everything into a transaction.

Do not create a custom middleware protocol merely because the transaction mechanism already exists.

---

## 20. `lib/transactions.js` Is a File Organization Pattern

An application may use:

    lib/transactions.js

to keep transaction creation and receipt functions together.

For example:

    createTweetTransaction()
    receiveTweetTransaction()

The filename describes the semantic purpose of the file.

It does not imply that the application must create:

    this.transactions

or:

    class Transactions

or:

    TransactionsManager

The transaction functions may be mixed into the module or otherwise called directly.

The important thing is that transaction behavior has an obvious place to find it.

---

## 21. Create and Receive Functions Should Be Explicit

When an application defines a transaction protocol, use explicit names for the two sides of the operation where appropriate.

For example:

    createTweetTransaction()
    receiveTweetTransaction()

or:

    createListingTransaction()
    receiveListingTransaction()

The name should tell the developer what the transaction does.

Avoid generic names such as:

    process()
    execute()
    handle()
    perform()

when a more specific name is available.

The code should communicate the application's protocol without requiring the developer to trace a generic dispatcher.

---

## 22. Framework Callbacks Should Be Thin but Meaningful

Saito lifecycle callbacks are entry points into the application.

For example:

    onConfirmation(blk, tx, conf)

should generally:

1. determine whether the transaction is relevant
2. perform the necessary framework-level checks
3. call the appropriate application operation

It should not become a giant function containing all of the application's transaction logic.

Likewise:

    handlePeerTransaction()

should identify the relevant request and dispatch to the appropriate application behavior.

The goal is not to make callbacks artificially short.

The goal is to make their role obvious.

---

## 23. Preserve Application Protocol Names

Names inside transaction and peer protocols are part of the application's communication architecture.

Examples include:

    tx.msg.module
    tx.msg.request

and peer request names.

These names should be explicit and descriptive.

For example:

    tx.msg.module === 'my-module'

followed by:

    tx.msg.request === 'create-listing'

makes the protocol visible in the source.

Do not replace this with an opaque generic dispatcher if explicit dispatch is sufficient.

When refactoring, do not casually rename protocol-visible strings.

Changing a local function name is a local code change.

Changing a transaction request name can change the application protocol.

---

## 24. Use `respondTo()` for Module Capabilities

When one module needs a capability provided by another module, `respondTo()` can expose that capability.

For example:

    respondTo(type, obj) {
        if (type === 'chat-manager') {
            return this.chat_manager;
        }

        return null;
    }

The important concept is that the module exposes a meaningful capability.

Do not create another registry or discovery system when `respondTo()` already expresses the required relationship.

Likewise, do not expose every internal object through `respondTo()` merely because it exists.

The capability should represent something another module legitimately needs.

---

## 25. Use Direct Module References When They Are Actually Appropriate

Sometimes a module genuinely needs another module.

A direct reference can be appropriate.

Other times, the consumer only needs a capability and should use `respondTo()`.

The question is:

> Does this code need this particular module, or does it need a capability?

Do not create indirection merely to avoid every direct dependency.

Do not create direct coupling merely because it is convenient.

Use the relationship that best describes the actual application requirement.

---

## 26. Use `app.connection` for Local Events When Appropriate

`app.connection` provides process-local application events.

It can be useful when multiple parts of an application need to respond to an asynchronous event.

It is not:

- a peer network
- a blockchain protocol
- a transaction transport
- a replacement for direct function calls

Do not create another event bus.

At the same time, do not use global events for every interaction.

If a parent directly owns a child component, a direct call is often clearer.

Use an event when the relationship is genuinely event-oriented.

---

## 27. Avoid Hidden Control Flow

A developer should be able to follow an important action through the source tree.

For example:

    button click
        ↓
    tweet.onClick()
        ↓
    createTweetTransaction()
        ↓
    app.network.propagateTransaction()

is easy to understand.

A chain such as:

    button click
        ↓
    UIEventManager
        ↓
    InteractionDispatcher
        ↓
    ApplicationRouter
        ↓
    TransactionService
        ↓
    TransactionFactory
        ↓
    WalletAdapter
        ↓
    app.wallet

is much harder to understand even if every individual class has a respectable name.

Avoid hidden control flow.

The application should make important paths visible.

---

## 28. Prefer Functions With Concrete Names

Function names should describe what they actually do.

Prefer:

    loadListings()
    saveListing()
    createTweetTransaction()
    receiveTweetTransaction()
    renderTweet()
    showProfile()
    updateProfile()
    sendInvite()

over:

    process()
    execute()
    handle()
    manage()
    run()
    perform()

Generic names are particularly dangerous in application code because they encourage additional abstraction around already-vague operations.

A function should help the reader understand the architecture before they read its body.

---

## 29. Avoid Function Proliferation

Do not split every operation into a sequence of tiny functions.

For example, avoid turning:

    renderTweet()

into:

    getTweet()
    extractTweet()
    getTweetHTML()
    buildTweetHTML()
    insertTweetHTML()
    attachTweetEvents()
    finalizeTweet()

when the actual operation is simple.

Functions should exist because they have a meaningful responsibility or are reused.

A useful rule is:

> Prefer fewer meaningful functions over many tiny functions whose only purpose is to make a file look modular.

This does not mean writing enormous functions.

It means keeping related behavior together when separating it does not improve understanding.

---

## 30. Helpers and Utilities Are Allowed

A generic helper file is not inherently bad.

If an application genuinely has several useful functions that do not belong naturally to another object, a file such as:

    lib/helpers.js

or:

    lib/utils.js

can be appropriate.

The problem is not the filename.

The problem is using it as a dumping ground for functions that actually belong somewhere else.

Before adding a helper, ask:

> Does this function have a better semantic owner?

If yes, put it there.

If not, a helper file is perfectly reasonable.

It is better to have a small coherent helper file than to distort the rest of the application in an attempt to eliminate every generic file.

---

## 31. Do Not Create Abstractions to Avoid One Imperfect File

It is acceptable for a small application to have:

    mymodule.js
    lib/helpers.js
    lib/ui/main.js

It does not need to become:

    mymodule.js
    lib/application.js
    lib/controller.js
    lib/service.js
    lib/manager.js
    lib/adapter.js
    lib/repository.js
    lib/helpers.js
    lib/ui/main.js
    lib/ui/controller.js
    lib/ui/manager.js

simply because the first structure is not perfectly symmetrical.

The objective is not architectural symmetry.

The objective is clarity.

---

## 32. Minimal Files Are a Feature

A tutorial application should not contain files that exist only because a framework convention says every application should have them.

If the application does not need:

- a database, do not create one
- a peer service, do not create one
- an OAuth provider, do not create one
- a separate domain class, do not create one
- a separate UI class, do not create one
- a helper file, do not create one
- a manager, do not create one
- a state machine, do not create one

The module directory should contain the files that the application actually needs.

This is particularly important for AI-generated applications.

An AI should not produce an impressive source tree for a simple application.

It should produce the simplest source tree that cleanly expresses the application.

---

## 33. Complexity Should Follow the Application

Different applications require different amounts of structure.

A tiny application may be:

    mymodule.js
    lib/
        ui/
            main.js

A larger application may be:

    mymodule.js
    lib/
        database.js
        transactions.js
        listings.js
        profiles.js
        ui/
            main.js
            listing.js
            profile.js

A large application may legitimately contain substantially more objects and files.

There is no target number of files.

The correct amount of structure is determined by the application's actual concepts and responsibilities.

---

## 34. Do Not Build Infrastructure for Hypothetical Future Requirements

AI systems are particularly prone to speculative architecture.

For example:

> We may eventually support three payment providers, so let's create a PaymentProvider interface and provider registry.

or:

> We may eventually have several kinds of games, so let's create a GameEngine abstraction.

or:

> We may eventually have multiple databases, so let's create a Repository interface.

Do not do this unless the current application actually requires it.

Implement the requirement that exists.

Leave room for future change by keeping current code clear, not by building infrastructure for imaginary requirements.

---

## 35. Refactor Toward Meaningful Ownership

Refactoring should improve semantic ownership.

A good refactor can turn:

    mymodule.js
        1200 lines of mixed code

into:

    mymodule.js
    lib/database.js
    lib/transactions.js
    lib/profile.js
    lib/ui/main.js
    lib/ui/profile.js

if those files correspond to real application concepts.

A bad refactor can turn:

    mymodule.js

into:

    controller.js
    service.js
    repository.js
    manager.js
    adapter.js
    handler.js
    dispatcher.js

without making the application easier to understand.

The difference is semantic ownership.

---

## 36. Do Not Move Code Merely to Make a File Smaller

A function should not be moved into `lib/` merely because the main module has become long.

Ask:

- What does this function represent?
- Who owns it?
- Would a developer naturally look for it in the new file?
- Does the new file have a coherent purpose?
- Does moving it make the application easier to understand?

If the answer is no, leave it where it is.

A long but coherent file is better than a collection of artificially small files.

---

## 37. Remove Unnecessary Abstractions During Refactoring

Refactoring is also an opportunity to simplify.

If the code contains:

    this.getTweetManager().getTweetService().saveTweet(tweet)

and the application really only needs:

    this.tweetManager.saveTweet(tweet)

simplify it.

If a wrapper exists only to call another function, remove it when safe.

If a manager exists only to hold one object, consider whether the manager is necessary.

If a dispatcher has only one destination, consider whether the dispatch layer is necessary.

If a helper belongs naturally to a component, move it there.

The objective is to reduce unnecessary cognitive distance between the thing being changed and the code that implements it.

---

## 38. Preserve Existing Behavior Unless the Task Changes It

When refactoring an existing application, preserve behavior unless the task explicitly calls for a behavior change.

Pay particular attention to:

- transaction semantics
- transaction request names
- peer request names
- recipients
- database behavior
- schema constraints
- `respondTo()` contracts
- DOM selectors
- CSS classes
- data attributes
- wallet behavior
- network behavior
- lifecycle behavior

A structural cleanup should not silently become a protocol rewrite.

If behavior needs to change, treat that as a separate requirement.

---

## 39. CSS and JavaScript Are Also Contracts

UI code has relationships outside the JavaScript file that contains it.

Classes such as:

    .tweet
    .header
    .body
    .footer

may be used by CSS.

Data attributes such as:

    data-id

may be used to recover an application object.

IDs may be used by event handlers.

Saito shared classes may be relied upon by framework CSS.

When refactoring UI code, search for these relationships before changing names.

Do not assume that a CSS class is merely presentation.

Do not assume that a data attribute is merely decoration.

The DOM can be part of the application's interface between its components.

---

## 40. Use the DOM to Preserve Object Identity When Appropriate

When rendering transaction- or object-backed UI, a useful pattern is to place the object's identifier on the root element.

For example:

    <div class="tweet" data-id="TRANSACTION_SIGNATURE">
        ...
    </div>

When an event occurs, the component can recover the identifier:

    let sig = e.currentTarget.closest('.tweet').dataset.id;

and retrieve the corresponding object again.

This avoids pushing the entire object through every event callback.

It also makes the relationship between the rendered UI and the underlying application object explicit.

This pattern is particularly useful for transaction-backed objects.

---

## 41. Keep the Transaction as a Useful Source Object

If a domain object originates from a Saito transaction, it can be useful to retain:

    this.tx = tx;

rather than copying every transaction field into the object.

The object can then selectively expose fields it needs for convenient access.

This preserves the relationship between:

    transaction
        ↔
    application object

and allows the application to retain information that may become useful later.

Again, this is a useful pattern, not a requirement for every object.

---

## 42. Use Existing Saito Modules as Evidence

Existing modules are useful for understanding how Saito applications work.

They can show:

- lifecycle usage
- transaction construction
- peer communication
- service advertisement
- database organization
- UI organization
- domain objects
- application-specific patterns

But existing code should not automatically be treated as a specification.

Some modules are old.

Some contain transitional architecture.

Some contain specialized solutions.

Some contain technical debt.

When examples disagree, determine the underlying principle rather than copying whichever implementation happens to be encountered first.

---

## 43. Prefer Current Principles Over Historical Patterns

The purpose of this documentation corpus is to teach an AI how to write good new Saito applications.

It is therefore more important to understand the desired architectural principles than to reproduce every pattern found in historical applications.

For example, an existing module may contain:

    Service
    Manager
    Dispatcher
    Repository

but that does not mean a new application should create those classes.

Likewise, an existing module may put substantial UI directly in the main file.

That does not mean new substantial UI must do the same.

Use existing code to understand the framework.

Use the architectural principles in these documents to decide how new code should be organized.

---

## 44. Do Not Modify the Framework to Solve an Application-Structure Problem

When application code becomes awkward, first ask whether the problem is in the application.

Do not immediately modify:

- Saito core
- shared networking
- wallet APIs
- module discovery
- shared UI
- blockchain infrastructure

to make a poorly structured application easier to implement.

A module should generally adapt to the Saito architecture rather than recreate or replace it.

Framework changes should be made when the framework genuinely lacks a capability required by multiple applications or by the platform itself.

---

## 45. Naming Conventions

Saito code commonly uses:

- `snake_case` for variables and instance properties
- `camelCase` for functions and methods

For example:

    this.current_game
    this.player_count
    this.active_player

and:

    createGame()
    receiveGame()
    renderBoard()
    loadListings()

This convention makes it immediately visible whether a name refers to a variable/property or an operation.

It is a readability convention rather than a requirement that overrides a developer's deliberate style.

If an application or developer has a different consistent convention, do not mechanically rewrite the code merely to satisfy this convention.

The important objective is consistency and readability.

---

## 46. Names Should Describe the Actual Concept

Prefer names that tell the reader what the thing represents.

Good names include:

    tweet
    nft
    listing
    profile
    game
    player
    database
    transactions
    createTweetTransaction
    receiveTweetTransaction
    renderTweet

Avoid names that describe architecture rather than meaning:

    processor
    handler
    manager
    service
    adapter
    resolver
    controller

unless the object genuinely has that responsibility.

A name should help a developer build an accurate mental model of the application.

---

## 47. Do Not Over-Abstract Small Operations

If a function is one or two lines and its meaning is already obvious at the call site, it may not need to exist.

For example:

    getWallet() {
        return this.app.wallet;
    }

does not add value.

Likewise:

    renderMain() {
        return this.main.render();
    }

may not be necessary.

Inline simple operations when doing so improves clarity.

Create a function when it:

- represents a meaningful operation
- is reused
- has nontrivial logic
- establishes a useful semantic boundary
- improves discoverability

---

## 48. Fat Components Are Often Better Than Fragmented Components

A coherent UI component can contain:

- rendering
- event attachment
- local state
- interaction methods
- child component ownership

For example:

    class Tweet {
        constructor(app, mod, tx) {
            ...
        }

        render() {
            ...
        }

        attachEvents() {
            ...
        }

        onClick() {
            ...
        }
    }

This can be easier to understand than splitting every operation into separate objects.

Likewise, a UI component may contain a meaningful amount of logic if that logic belongs to the component.

Do not fragment a component merely to make individual methods or files smaller.

---

## 49. Templates Should Describe Structure

When an application uses a template function, it should primarily describe the HTML structure.

For example:

    template() {
        return `
            <div class="tweet">
                <div class="header"></div>
                <div class="body"></div>
                <div class="footer"></div>
            </div>
        `;
    }

The JavaScript object should contain the application behavior.

Avoid putting substantial business logic inside template strings.

A template should help a developer see the visual structure of the component.

---

## 50. Event Methods Should Describe User Actions

When a UI component has an interaction method, the method name should make the interaction understandable.

Examples include:

    onClick()
    onSubmit()
    onDelete()
    onDragDrop()
    onSelect()
    onClose()

These names are useful because they describe what the user did.

Avoid inventing abstract names such as:

    processInteraction()
    handleComponentState()
    executeAction()

when the concrete user action is known.

The code should make the UI behavior intuitive.

---

## 51. Use Parent/Child Ownership

UI components can contain other UI components.

The parent should generally:

- construct children
- decide where children appear
- provide required data
- coordinate high-level behavior

The child should generally:

- render itself
- manage its internal UI
- manage its own internal event handling
- style itself

This creates a clear hierarchy.

For example:

    Main
      |
      +--- Header
      +--- Feed
      |     |
      |     +--- Tweet
      |
      +--- Sidebar

The parent arranges the children.

The children own their internal presentation.

This same relationship should be reflected in CSS where practical.

---

## 52. Use CSS and UI Ownership Consistently

A component's root class should make its ownership obvious.

For example:

    .tweet
        .header
        .body
        .footer

is easier to reason about than:

    .tweet-component
        .tweet-component-header
        .tweet-component-body
        .tweet-component-footer

The CSS should make it clear which component owns the styles.

The same principle applies to JavaScript.

If a component owns the behavior, its code should be easy to find.

---

## 53. Do Not Create Generic Global UI Infrastructure

Do not create an application-wide UI manager simply because several components need to communicate.

Prefer:

- direct parent/child calls
- component ownership
- Saito shared UI
- `app.connection` when a genuine asynchronous local event is required

A global event or UI layer should not become the default mechanism for ordinary rendering.

Global infrastructure makes the application harder to reason about because the source of an action becomes distant from the component that receives it.

---

## 54. Application State Should Have a Clear Owner

If a piece of state belongs to a component, keep it there.

If it belongs to the module, keep it on the module.

If it belongs to a domain object, keep it on that object.

If it belongs to Saito, use the Saito API.

Avoid storing the same state simultaneously in several objects simply because each object would find it convenient.

For example, do not maintain three independent copies of the current user when one object can be the source of truth.

Duplicated state creates synchronization problems and obscures ownership.

---

## 55. Persistence Is Optional

Do not create a database because an application is expected to look sophisticated.

A module may only need:

- in-memory state
- `app.options`
- transactions
- Archive-backed storage
- or another existing Saito mechanism

A SQL database should be introduced when the application actually needs persistent or indexed off-chain data.

The coding principle is:

> Add persistence because the application needs it, not because applications are expected to have databases.

---

## 56. Do Not Build a Generic Synchronization Layer

If an application needs to retrieve remote data, determine:

- who has the data
- what request is required
- what mechanism provides it
- where the result is cached
- what the source of truth is

Do not automatically create:

    SyncManager
    SyncService
    SyncController
    SyncQueue

simply because remote data is involved.

Saito already provides peer communication and blockchain synchronization.

Application-level retrieval is application-specific.

---

## 57. Do Not Build Generic State Machines or Registries Without a Need

State machines, registries, queues, routers, and dispatchers can all be legitimate.

They should exist because the application actually requires them.

Do not create them simply because they are common software patterns.

Before creating one, ask:

> What concrete problem does this object solve that direct application code cannot solve clearly?

If there is no strong answer, do not create it.

---

## 58. A Good Saito Application Is Easy to Trace

A developer should be able to follow an important operation through the source tree.

For example:

    user clicks Tweet
        ↓
    Tweet.onClick()
        ↓
    createTweetTransaction()
        ↓
    app.network.propagateTransaction()
        ↓
    another node receives transaction
        ↓
    receiveTweetTransaction()
        ↓
    Tweet object reconstructed
        ↓
    Tweet.render()

This is a useful Saito mental model.

The actual implementation may differ.

The important property is that the path from user action to application behavior to network transmission to reconstruction is understandable.

Avoid architecture that obscures this path.

---

## 59. The Source Tree Should Explain the Application

A good Saito module should make sense before every file is opened.

For example:

    mymodule/
        mymodule.js
        lib/
            database.js
            transactions.js
            profiles.js
            tweets.js
            ui/
                main.js
                profile.js
                tweet.js

The names communicate the application's structure.

A source tree like:

    mymodule/
        mymodule.js
        controller.js
        service.js
        manager.js
        adapter.js
        handler.js
        dispatcher.js
        resolver.js
        utils.js

does not communicate what the application actually does.

The first structure describes the application.

The second describes an architecture vocabulary.

Prefer the first.

---

## 60. The Main File and Source Tree Should Work Together

The ideal workflow for a developer encountering a Saito module is:

1. Open the module directory.
2. Identify the main module file.
3. Open the main module.
4. See which major application objects it owns.
5. Follow those objects into `lib/`.
6. Follow their visual representations into `lib/ui/`.
7. Find the specific function responsible for the behavior being changed.

The application should not require a developer to search the entire repository to determine where one feature lives.

Semantic organization is therefore a practical debugging and maintenance tool.

---

## 61. Code Should Be Optimized for Human and AI Discoverability

The same characteristics that help a human developer help an AI coding agent.

An AI should be able to infer:

- what an object represents
- what file owns it
- what function performs an operation
- what transaction carries the data
- what component renders it
- what framework callback invokes it

from names and structure.

This is one reason to avoid unnecessary indirection.

If a function is called:

    createListingTransaction()

the AI has a strong clue where listing transaction construction occurs.

If the same operation is called:

    process()

inside a generic service invoked through three other generic layers, the AI has to reconstruct the architecture before it can safely modify it.

Semantic names therefore reduce both human and AI error.

---

## 62. Prefer Explicitness Over Cleverness

Saito applications should generally favor straightforward code.

Prefer:

    if (tx.msg.module !== 'my-module') {
        return;
    }

over hiding module selection in an abstract dispatch mechanism when the direct version is sufficient.

Prefer:

    this.app.wallet.createUnsignedTransaction(...)

when the module genuinely needs the wallet.

Prefer:

    this.tweet.onClick()

when the Tweet owns the interaction.

Prefer:

    this.database.loadListings()

when the database owns the query.

The code should say what it is doing.

---

## 63. Avoid Architecture That Merely Looks Professional

A source tree containing many classes and interfaces can look sophisticated.

That does not make it better.

An architecture is useful when it makes the application easier to understand, modify, test, or extend.

An abstraction that merely adds:

- another file
- another class
- another function call
- another name
- another interface

without adding semantic value is usually harmful.

In Saito, this matters especially because the framework already provides substantial infrastructure.

Application code should not recreate conventional enterprise architecture on top of it.

---

## 64. The AI Should Resist Conventional Web Application Architecture

When asked to create a Saito application, an AI may instinctively produce:

    controllers/
    services/
    repositories/
    models/
    adapters/
    middleware/
    routes/
    stores/
    providers/

because those structures are common in other software ecosystems.

That is not the default Saito architecture.

Instead, begin with the actual application concepts.

Ask:

- What does the user interact with?
- What objects exist?
- What data must be transmitted?
- What transactions are needed?
- What peer requests are needed?
- What UI components exist?
- What persistence is actually required?
- Which Saito APIs already provide the required infrastructure?

Then create only the files required to implement those things.

---

## 65. Minimality Does Not Mean Avoiding Structure

The goal is not to put everything into one file.

Minimality means avoiding structure that does not solve a real problem.

A module with:

    mymodule.js
    lib/
        database.js
        transactions.js
        ui/
            main.js
            listing.js

may be more minimal than a single 2,000-line module if those files correspond to clear concepts.

Likewise, a 300-line main module may be perfectly acceptable if the module is genuinely simple and the code is coherent.

The correct question is not:

> How few lines or files can I produce?

It is:

> What is the smallest clear architecture that expresses this application?

---

## 66. When Complexity Appears, Give It a Name

If an application genuinely becomes complex, isolate the complexity according to what it actually is.

For example:

    lib/database.js

if database complexity becomes substantial.

    lib/transactions.js

if transaction construction and receipt become substantial.

    lib/oauth.js

if OAuth becomes substantial.

    lib/ui/profile.js

if profile presentation becomes substantial.

Do not call the file:

    service.js

unless it actually represents a service.

Give complexity the name of the thing that is becoming complex.

This allows developers to understand why the file exists.

---

## 67. Preserve the Ability to Move Between Representations

A useful Saito application often has a close relationship between:

- the application object
- its serialized data
- its transaction
- its UI representation

For example:

    Tweet
      ↕
    tx.msg.data
      ↕
    serialized transaction
      ↕
    received transaction
      ↕
    Tweet
      ↕
    Tweet UI

Keeping these relationships simple makes distributed applications easier to reason about.

Do not introduce unnecessary translation layers between each representation.

If a transformation is genuinely required, give it an explicit semantic name and place it where that transformation belongs.

---

## 68. Use Serialization and Deserialization as Natural Boundaries

When an application object needs to cross the network, serialization provides a natural boundary.

The serialized representation should contain the information needed to reconstruct the object.

The receiving side should be able to use the same application concepts to reconstruct the object.

This is one reason Saito applications can be especially intuitive when application objects map closely to transaction data.

The less unnecessary transformation between:

    object
        ↔
    transaction data

the easier the architecture is to understand.

---

## 69. Do Not Add Layers Between the Object and Its Interaction Without a Reason

If a Tweet has a like button, the interaction should be easy to trace.

It may be:

    Tweet
        -> onLike()
        -> createLikeTransaction()

or:

    Tweet
        -> module function
        -> createLikeTransaction()

depending on ownership.

It does not need to become:

    Tweet
        -> InteractionHandler
        -> LikeDispatcher
        -> LikeService
        -> TransactionBuilder
        -> TransactionFactory

unless the application has a concrete reason for each layer.

The more direct relationship is generally preferable.

---

## 70. Use Existing Saito Conventions Before Inventing New Ones

Before creating a new mechanism, inspect whether Saito already provides one.

Examples:

- module lifecycle → `ModTemplate`
- module capabilities → `respondTo()`
- direct module access → `returnModule()`
- peer services → `returnServices()`
- peer availability → `onPeerServiceUp()`
- local events → `app.connection`
- transactions → Saito transactions
- transaction propagation → `app.network`
- wallet operations → `app.wallet`
- application storage → `app.storage`
- shared overlays → Saito overlay
- shared UI → Saito UI components

Do not create a private replacement unless the existing mechanism genuinely cannot express the application's requirement.

---

## 71. Do Not Assume Every Application Needs Every Saito Hook

A module does not need to implement every available lifecycle function.

If the application does not need:

    onConfirmation()

do not create an empty implementation.

If it does not need:

    handlePeerTransaction()

do not create one.

If it does not provide a peer service, do not create `returnServices()` merely because other modules have it.

Only implement the framework hooks the application actually needs.

This keeps the main module meaningful.

---

## 72. Do Not Create Empty Architectural Files

Avoid files such as:

    database.js
    service.js
    manager.js
    controller.js

that contain only placeholders because an architecture diagram says those files should exist.

A file should exist because the application has something meaningful to put there.

This is especially important when generating tutorial applications.

A generated application should contain only the files required by the implementation.

---

## 73. Do Not Over-Engineer Tutorials

A tutorial application should be especially simple.

If a tutorial demonstrates:

- one transaction
- one UI component
- one object
- one peer request

then it should not contain:

    TransactionService
    TransactionRepository
    ApplicationController
    ObjectFactory
    EventDispatcher

The tutorial should demonstrate the actual Saito concepts directly.

This makes the tutorial useful both to humans and to AI agents learning how Saito applications are structured.

---

## 74. Use the Simplest Correct Saito-Native Implementation

When several implementations are possible, prefer the one that:

- uses existing Saito APIs
- has fewer unnecessary layers
- has clear ownership
- uses semantic filenames
- uses direct calls
- keeps protocol behavior visible
- keeps UI behavior near the UI that owns it
- preserves application objects where useful
- creates only necessary files
- avoids speculative infrastructure

This does not mean always choosing the shortest code.

It means choosing the smallest architecture that correctly expresses the application.

---

## 75. AI Development Checklist

When an AI is asked to create or modify a Saito application, it should first determine:

### Module structure

- What is the main `ModTemplate` extension?
- What files are actually needed?
- Which application concepts deserve their own files?
- Which UI components deserve their own files?

### Application objects

- What objects actually exist in the application?
- Does an object naturally have visual identity?
- Does it need separate UI representations?
- Who owns the object?
- What behavior belongs directly on the object?

### Transactions

- What application data needs to cross the network?
- Does it need transaction semantics?
- What are the create and receive operations?
- Can the application's object map naturally to transaction data?
- What should live in `lib/transactions.js`?

### UI

- What are the major UI components?
- Which components should live in `lib/ui/`?
- Which component owns each interaction?
- Can a user action call the relevant object directly?
- What DOM identifiers are needed to reconnect UI to application objects?

### Persistence

- Does the application actually need a database?
- If so, what does the database own?
- Is existing Saito storage sufficient?

### Communication

- Is the operation on-chain?
- Is it an off-chain peer request?
- Is it local component communication?
- Is `app.connection` appropriate?
- Is direct ownership simpler?

### Architecture

Before creating a new class or abstraction, ask:

> What concrete responsibility does this add?

Before creating a wrapper, ask:

> Why can't the underlying object be called directly?

Before creating a service, ask:

> What service-specific responsibility exists here?

Before creating a manager, ask:

> What collection or coordination responsibility does this object actually own?

Before creating a dispatcher, ask:

> Why can't the request be dispatched explicitly?

Before creating a repository, ask:

> What persistence abstraction is actually required?

Before creating a state machine, ask:

> What state complexity requires one?

Before creating a new file, ask:

> What concept will a developer expect to find in this file?

If the answer is weak, do not create the abstraction.

---

## 76. Final Development Principle

The goal of Saito application development is not to reproduce conventional software architecture inside a blockchain framework.

The goal is to use Saito's existing architecture to build applications whose own architecture is simple and obvious.

A good Saito module should make it easy to see:

- the main module
- the application objects
- the transaction functions
- the database, if one exists
- the UI components
- the peer interactions
- the Saito APIs being used

The application should not hide these relationships behind layers of middleware.

An object should be allowed to represent the thing it is.

A Tweet can be a Tweet and its visual representation.

An NFT can be an NFT while an NFT card provides one representation of it.

A transaction can carry the application's serialized data.

A receiving node can reconstruct the same application object.

A UI interaction can call the object that owns the interaction.

A module can expose a capability directly through Saito.

A database can own its own database operations.

A transaction file can contain the functions that create and receive transactions.

The source tree should tell the story of the application.

The code should tell the story of each operation.

And the AI should resist the temptation to add architecture merely because other software ecosystems taught it that more layers look professional.

> The best Saito code is usually the code in which the relationship between the thing the user sees, the object representing that thing, the transaction carrying that thing, and the function implementing its behavior is as direct and obvious as possible.
# Saito Development — Module Distribution and Runtime Installation

> This document is not yet fleshed out.
>
> Substantive documentation for this topic is planned and will be added later.

## Planned Scope

- How modules are packaged for distribution
- How a module is installed into a running Saito node
- Runtime loading of an installed module
- What distinguishes distribution from local development
# Saito Framework — Blockchain and Consensus

This document explains the Saito blockchain from the perspective of an application developer or AI coding agent.

The purpose is not to teach blockchain theory. The purpose is to establish the implementation patterns that applications should follow when they interact with the Saito consensus layer.

When implementing a Saito application, the important question is usually not:

> “How does the blockchain work?”

It is:

> “What does this application actually need the blockchain to do?”

An application may use the blockchain for decentralized publication, ordering, identity, ownership, value transfer, or consensus-sensitive state. It may instead communicate directly with peers, store data in a module database, use Archive services, or keep state locally.

Do not assume that because an application runs on Saito, all of its state belongs on the blockchain.

---

## 1. The Saito Blockchain in Application Terms

The Saito blockchain is the consensus layer that publishes transactions into blocks and determines the current longest chain.

At the lowest level, blocks compete to become part of the longest chain. Blocks collect transactions, and the transactions contain fees that provide an economic incentive for their inclusion and routing.

At the application level, the important consequence is that Saito provides a decentralized network through which applications can publish and communicate information without requiring a central application operator.

Applications and modules execute at the edge of the network.

The blockchain is therefore a capability available to applications, not a replacement for the application itself.

A useful mental model is:

    users
      ↓
    applications / modules
      ↓
    peer-to-peer network
      ↓
    transactions
      ↓
    blocks
      ↓
    longest-chain consensus

Applications can use the consensus layer selectively.

For example, an application might use:

- on-chain transactions for ownership or value;
- on-chain transactions for publicly published messages;
- off-chain transactions for direct peer communication;
- module SQL for application indexes;
- Archive for historical transaction storage;
- local memory for ephemeral state;
- an external service for data that does not need decentralized storage.

Do not turn an application requirement into blockchain state merely because a blockchain is available.

---

## 2. The First Development Question: What Does the Application Need?

When implementing a new application, first determine what property the application actually requires.

Ask:

- Does everyone need to receive this information?
- Does everyone need to agree on its ordering?
- Does ownership or value need to be enforced by consensus?
- Does the information need to survive independently of any one server?
- Does the application merely need to send a message to another peer?
- Does the application need a searchable local database?
- Does the application need private storage?
- Does the application need a local cache?
- Does the application need an external service?
- Does the application care if the underlying transaction is later removed from the longest chain?

These questions determine whether the blockchain should be involved and, if so, how.

A common mistake is to begin with:

> “I have data, therefore I should put it in a transaction and make it consensus state.”

Instead begin with:

> “What does this data need to accomplish?”

Then select the simplest Saito-native mechanism that provides those properties.

---

## 3. The Blockchain Is a Publication and Consensus Mechanism

A Saito transaction can be used as a decentralized publication mechanism.

For example, an application can publish:

- a message;
- a post;
- a game move;
- an ownership operation;
- an asset transfer;
- an identity-related event;
- encrypted application data;
- a request that other nodes should observe.

The fact that a transaction is published does not automatically mean that the application must treat it as permanent application state.

This distinction is important.

A game may receive a transaction containing a move and immediately process it. The application's purpose may simply be to receive the move.

A social application may publish a post so that peers can discover it.

A marketplace may need the transaction to establish an actual asset entitlement and therefore need to track its canonical chain status.

The appropriate treatment depends on what the application does with the transaction after receiving it.

---

## 4. On-Chain Transactions and Off-Chain Communication

Saito uses the same general transaction/message structures for several different communication patterns, but the transport path determines whether the message enters blockchain consensus.

There are two important paths.

### On-chain publication

A transaction propagated with the normal transaction propagation mechanism enters the blockchain transaction path:

    Transaction
        ↓
    network propagation
        ↓
    verification
        ↓
    mempool
        ↓
    block production
        ↓
    block validation
        ↓
    longest-chain selection
        ↓
    blockchain

The relevant application API is generally:

    app.network.propagateTransaction(tx)

An on-chain transaction can eventually become part of a block on the longest chain.

### Off-chain application communication

`sendRequest`, `sendRequestAsTransaction`, and `sendTransactionWithCallback` use Saito's application-message path.

Conceptually:

    JS Transaction
        ↓
    serialized transaction-shaped message
        ↓
    ApplicationMessage
        ↓
    peer
        ↓
    handlePeerTransaction()

This does not put the transaction into the mempool or blockchain.

The transaction-shaped object is being used as an application communication envelope.

Therefore:

> A Saito transaction object does not necessarily mean a blockchain transaction.

The transport mechanism matters.

---

## 5. Signed and Unsigned Off-Chain Messages

Off-chain application requests are unsigned by default.

For example, `sendRequest` / `sendRequestAsTransaction` can create a transaction-shaped message containing:

    {
      request: "...",
      data: ...
    }

and send it through the ApplicationMessage path without signing it.

An unsigned off-chain message should therefore not be treated as cryptographically authenticated merely because it is represented by a Saito `Transaction`.

If authentication is required, the application must use an appropriate signed transaction/message path.

The distinction is:

    Transaction object
        ≠
    signed transaction
        ≠
    on-chain transaction

These are separate properties.

If an application needs to prove who sent an off-chain request, explicitly verify the authentication mechanism being used.

Do not assume that `sendRequestAsTransaction()` automatically provides blockchain-style authentication.

---

## 6. The `tx.msg` Field

The application-level message is generally carried in the transaction's `msg` data.

This allows the same general transaction structure to carry application-specific information in multiple contexts.

For example:

    tx.msg = {
        module: "redsquare",
        request: "post",
        ...
    }

or:

    tx.msg = {
        module: "game",
        request: "move",
        ...
    }

The `msg` contents are application data.

They are not themselves UTXOs and they do not automatically become spendable blockchain state.

The application determines what the message means.

---

## 7. Confirmation Semantics

Saito's confirmation semantics are important because applications should not automatically import Bitcoin or Ethereum assumptions.

In the current implementation, `confnum === 0` means that the transaction has been included in a block that is currently part of the node's longest chain.

It does not mean that the transaction is irreversible.

Conceptually:

    conf = 0
        transaction first appears in a block
        that is currently on the longest chain

    conf = 1
        another block has subsequently extended that chain

    conf = 2
        another block has subsequently extended it again

and so on, subject to the configured `block_confirmation_limit`.

The default configuration normally causes applications to receive the `conf === 0` notification.

Therefore, the common application pattern is:

    onConfirmation(blk, tx, conf) {
        if (conf !== 0) return;

        ...
    }

This should be understood as:

> “This transaction is currently included in the longest chain as observed by this node.”

It should not be understood as:

> “This transaction can never disappear.”

---

## 8. Confirmation Is an Application Decision

Do not automatically wait for multiple confirmations simply because another blockchain system commonly does so.

Instead ask what the application needs.

For a message-oriented application:

    receive transaction
        ↓
    process message

may be sufficient.

For an application where the transaction establishes something that must later be spent or relied upon as canonical state:

    receive transaction
        ↓
    establish derived state
        ↓
    monitor canonical chain
        ↓
    reconcile if reorganization occurs

may be necessary.

The correct confirmation policy is therefore determined by application semantics.

---

## 9. Reorganizations

The longest chain can change.

Suppose the node currently has:

    A → B → C → D

and another branch eventually becomes the longest chain:

    A → B → E → F → G

The node must unwind the old branch and adopt the new one.

Transactions that were previously on the longest chain may therefore cease to be part of the current longest chain.

A transaction can consequently:

1. be included in the current longest chain;
2. later leave the longest chain during a reorganization;
3. subsequently be included again on the new longest chain;
4. or never be included again.

A block can similarly be orphaned.

The important application-level principle is:

> Blockchain inclusion is not automatically an irreversible application event.

---

## 10. What Core Does During a Reorganization

Consensus code is responsible for maintaining the canonical chain.

When the longest chain changes, Core:

- identifies the old chain;
- identifies the new chain;
- unwinds the old chain;
- applies the new chain;
- updates longest-chain status;
- updates the UTXO set;
- updates wallet-derived spendable state.

The blockchain therefore handles the consensus-level consequences of a reorganization automatically.

Application databases are different.

Core does not know what a module has done in response to `onConfirmation()`.

If a module receives:

    onConfirmation(..., tx, 0)

and inserts a row into its SQL database, Core does not automatically delete that row if the transaction is later orphaned.

This is one of the most important rules for application developers.

---

## 11. Derived Application State and Reorganizations

A module can build a database or index from blockchain transactions.

For example:

    blockchain transaction
          ↓
    module onConfirmation()
          ↓
    module SQL record

That SQL record is application-derived state.

It is not automatically consensus state.

If the application's correctness depends on the transaction remaining in the longest chain, the module must account for reorganizations.

The standard mechanism is:

    onChainReorganization(block_id, block_hash, lc)

The module can use this information to mark records as belonging to or no longer belonging to the longest chain.

This is what the Store and Registry modules do.

For example, Store maintains longest-chain information for blockchain-derived records. When a listing transaction moves off the longest chain, the Store can mark the corresponding database state inactive rather than continuing to treat the orphaned listing as canonical.

This allows the module's database to function as a projection of the current consensus state.

The database is not the consensus state itself.

---

## 12. Not Every Application Needs Reorganization Handling

Do not add elaborate reorganization machinery merely because a module observes blockchain transactions.

Consider what the transaction means.

Suppose a game receives:

    "Player A played card X."

If the purpose of the transaction is simply to communicate the move, the application may process it at confirmation 0.

The game may already have its own sequence numbers, move identifiers, queue state, or duplicate detection.

In that case, the application may not care whether the original publication later becomes orphaned.

By contrast, suppose a marketplace receives:

    "This NFT is now locked in this listing."

If the marketplace needs to spend that NFT later, then canonical chain status matters.

The application must know whether the UTXO it intends to spend is actually spendable in the current chain.

Therefore:

> Before implementing reorganization handling, determine what consequence the application attaches to blockchain inclusion.

---

## 13. Store as the Important Reorganization Pattern

The Saito Store provides a useful example of when reorganization handling matters.

A listing can contain P2SH/NFT-related UTXOs that the Store needs to use later.

The Store therefore maintains database state corresponding to blockchain-derived asset state.

When the relevant transaction enters the longest chain, the Store records it.

If the transaction later leaves the longest chain, the Store updates its database so that the old branch is no longer treated as canonical.

The reason for doing this is not abstract blockchain correctness.

The reason is operational:

> The Store needs to know which UTXOs it is actually entitled to spend.

This is the kind of reasoning an application developer should use.

Do not copy the Store's reorganization machinery into every module.

Determine whether the application has a similar dependency on canonical chain state.

---

## 14. Application State Is Not Consensus State

A useful distinction is:

    Consensus state
        ↓
    Core blockchain + UTXO state + wallet-derived spendable state

    Application state
        ↓
    module SQL + memory + Archive + local options + other services

Application state may be derived from consensus state, but it does not become consensus state merely because it was created in response to a blockchain transaction.

For example:

    tx
      ↓
    onConfirmation()
      ↓
    SQL INSERT

does not mean:

    SQL row = blockchain state

It means:

    SQL row = module's projection of blockchain/application events

The module owns that projection.

---

## 15. The UTXO Set

Saito uses a UTXO model rather than a globally shared account-state model.

Transactions contain input and output slips.

A slip identifies an output using information including:

- public key;
- amount;
- slip type;
- block ID;
- transaction ordinal;
- slip index.

Core constructs a unique UTXO-set key from the slip information.

The UTXO set is essentially a high-performance lookup structure containing currently spendable outputs.

When a transaction wants to spend an output, its input slip identifies the previous output.

Core reconstructs the corresponding UTXO key and checks the UTXO set.

Conceptually:

    transaction input
          ↓
    reconstruct UTXO key
          ↓
    UTXO lookup
          ↓
    spendable?
       /     \
     yes      no
      ↓        ↓
    valid    invalid

This is deliberately designed for efficient transaction processing.

Do not implement application-level UTXO tracking when Core already provides the authoritative UTXO machinery.

---

## 16. Wallet State Is Different from Module State

The wallet's spendable slips are derived from the canonical blockchain state.

The wallet therefore knows about things such as:

- spendable Saito slips;
- balance;
- NFTs;
- staking-related slips.

The wallet is not the application's general-purpose database.

Likewise, a module database is not the wallet.

Use:

    app.wallet

for wallet and spendable-asset operations.

Use module-local state/database mechanisms for application state.

Do not store an application's business records in the wallet simply because they are associated with transactions.

---

## 17. Blockchain, Wallet, Archive, SQL, and Memory Are Different Stores

A Saito application has several possible locations for information.

The current blockchain provides consensus history and current chain membership.

The UTXO set provides current spendability.

The wallet provides local wallet-derived state.

Archive provides transaction storage and retrieval on nodes that operate the Archive service.

Module SQL provides structured application state for that module on that node.

In-memory structures provide fast local application state.

`app.options` provides lightweight local persistent state.

Remote modules or services can provide data through peer requests.

These are not interchangeable.

In particular:

> There is no assumption that every Saito node contains a complete, universally queryable application database.

An application must know where the information it needs is expected to exist.

---

## 18. Data Availability Is an Architectural Decision

When an AI is asked to build an application, it should explicitly determine where the required data will live.

For each important piece of data, ask:

- Who creates it?
- Who needs to read it?
- Does everyone need it?
- Does every node need it?
- Does it need consensus?
- Does it need to survive independently of one node?
- Can it be regenerated?
- Does it need arbitrary search?
- Does it need privacy?
- Does it need to be spendable?
- Can it become stale?
- What happens if its source transaction is reorganized?

Do not assume that a peer can answer an arbitrary query simply because that peer is part of the Saito network.

Do not assume that a transaction published somewhere means every application node has a searchable database containing its contents.

---

## 19. The Blockchain Is Not a General-Purpose Application Database

A common architectural error is:

    "The data is important."
          ↓
    "Put it on the blockchain."
          ↓
    "Now we can query the blockchain like a database."

That is not the Saito application model.

The blockchain is optimized for consensus, transaction validation, chain construction, and decentralized publication.

Application search and indexing can be handled by:

- module databases;
- Archive;
- node-local indexes;
- application-specific services;
- remote module APIs;
- other storage systems.

An application should construct the index it actually needs.

For example:

    blockchain transactions
          ↓
    module
          ↓
    application-specific SQL index
          ↓
    fast application queries

The SQL index is a derived application structure.

If its correctness depends on canonical chain state, it must account for reorganizations.

---

## 20. There Is No Universal Application Database

A smart-contract-oriented development model can encourage an assumption that all users interact with one globally replicated application state machine.

Saito does not require that architecture.

A Saito application can instead compose:

    consensus
       +
    edge computation
       +
    P2P communication
       +
    node-local databases
       +
    Archive
       +
    external services

The blockchain can be used for only the operations that actually benefit from decentralized consensus.

The rest of the application can execute at the network edge.

This is one of the most important architectural differences to keep in mind when designing a Saito application.

Do not invent a centralized application server merely because that is how a conventional web application would be structured.

At the same time, do not put every application operation onto the blockchain merely because the blockchain exists.

Use each layer for the problem it solves.

---

## 21. Brief Note on Smart Contracts

Saito does not require the application to be implemented as one globally shared smart-contract state machine.

A developer familiar with smart-contract platforms may initially assume:

    users
      ↓
    API
      ↓
    shared contract
      ↓
    global application state

Saito can instead look like:

    users
      ↓
    modules / edge applications
      ↕
    P2P communication
      ↕
    optional blockchain consensus
      ↕
    optional Archive / databases / services

The blockchain can still enforce operations where decentralized consensus is useful.

The difference is that the entire application does not need to execute inside the consensus layer.

Program execution can remain at the edge.

This means an application can selectively use blockchain consensus for things such as:

- asset ownership;
- asset transfer;
- decentralized publication;
- ordering;
- consensus-sensitive events;
- identity-related operations;
- other operations where the application needs a common decentralized state.

Other application logic can remain local or peer-to-peer.

Detailed P2SH and scripting behavior belongs in the separate Saito scripting documentation.

---

## 22. Fees

Fees provide an economic mechanism for transaction inclusion and routing.

A wallet can have a default transaction fee. When an application creates a transaction through the wallet, the normal behavior is to attach the configured fee.

If the wallet cannot provide the necessary fee slips, the system can in many cases fall back to attempting a zero-fee transaction.

Zero-fee transactions can still be processed.

They should not, however, be assumed to receive the same inclusion expectations as transactions carrying fees.

Node operators can also configure policies governing which transactions they will process or produce.

Therefore:

> A fee expresses an economic expectation around transaction processing; it is not a requirement that every application transaction must carry a fee.

Many applications can initially operate without charging users transaction fees.

This is particularly useful for onboarding applications where users may not yet have assets or Saito available.

An application should not introduce a fee requirement unless the application's actual operation requires blockchain resources that justify it.

---

## 23. Transaction Identity

Transaction signatures are frequently useful as application-level identifiers.

For a signed transaction, the signature can serve as a practical identifier for the transaction.

Applications commonly use this when:

- identifying a post;
- identifying a game move;
- assigning a DOM ID;
- associating UI state with a transaction;
- referencing an NFT;
- creating parent/child relationships between transactions.

For example, a social application can represent a post using its transaction signature:

    post.id = tx.signature

A reply can then reference the original transaction:

    parent_id = original_tx.signature

This naturally creates a transaction tree.

However, do not treat transaction signatures as universally unique identifiers for every Saito message.

Unsigned transaction-shaped off-chain messages can have no meaningful unique signature. In particular, unsigned transactions can share a zero/default signature.

Also distinguish:

- transaction signature;
- block hash;
- block ID;
- transaction position;
- inclusion in a particular block;
- inclusion in the current longest chain.

These identify different things.

---

## 24. Transaction Signature Does Not Mean Canonical Inclusion

A signed transaction may have a stable signature while its chain inclusion changes.

For example:

    transaction S
        ↓
    block A
        ↓
    block A leaves longest chain
        ↓
    transaction S is no longer canonical
        ↓
    transaction S may later appear again elsewhere

The signature identifies the transaction.

It does not by itself identify which block currently makes the transaction canonical.

When an application cares about chain inclusion, store the relevant block information as well.

This is especially important for derived indexes.

The Store, for example, has reason to distinguish the transaction signature from the particular block inclusion represented by its database record.

---

## 25. Mempool

The mempool contains transactions that are pending inclusion in blocks.

It is not application state.

Do not build application logic that assumes:

> “If the transaction is in the mempool, the application can treat it as confirmed.”

Mempool contents can change.

Transactions can be:

- included in a block;
- rejected;
- discarded;
- recollected;
- replaced by chain/application behavior.

Normal modules should generally not depend on mempool state.

The blockchain and consensus layers own mempool behavior.

---

## 26. Core Owns Consensus

The blockchain implementation is owned by Saito Core.

Core is responsible for:

- validating blocks;
- validating transactions;
- maintaining the longest chain;
- maintaining the UTXO set;
- handling chain reorganizations;
- processing confirmation state;
- producing blocks;
- maintaining wallet-derived spendable state.

Modules do not implement consensus.

A module should use the APIs and lifecycle hooks exposed by the framework rather than reimplementing:

- chain selection;
- UTXO validation;
- transaction validation;
- block validation;
- confirmation tracking;
- mempool logic.

If application code appears to need its own copy of consensus logic, first determine whether the requirement is actually application-specific state that belongs in the module.

---

## 27. Longest Chain

Saito's longest-chain determination is not simply a matter of choosing the branch with the greatest block number.

The Core implementation considers chain length together with accumulated burnfee according to Saito's consensus rules.

Application developers generally should not reproduce this calculation.

Use the blockchain APIs and lifecycle hooks to determine the current chain state.

The application-level meaning is simply:

> The longest-chain state maintained by Core represents the node's current consensus view.

The details of chain selection belong to the consensus implementation rather than individual modules.

---

## 28. `onConfirmation()`

`onConfirmation()` is the principal module hook for reacting to transactions that have entered the blockchain.

A typical module implementation looks conceptually like:

    onConfirmation(blk, tx, conf) {
        if (conf !== 0) return;

        // process transaction
    }

The important meaning of `conf === 0` is:

> The transaction has been included in a block that this node currently considers part of the longest chain.

Do not interpret it as permanent finality.

If the module needs stronger guarantees, its implementation must explicitly adopt an appropriate confirmation policy or reorganization strategy.

---

## 29. `onNewBlock()`

`onNewBlock()` is a broader blockchain lifecycle hook.

Modules can receive notification when a block is added, including information about whether the block is part of the longest chain.

This is different from `onConfirmation()`.

`onConfirmation()` is concerned with transactions selected for module callback processing.

`onNewBlock()` is a block-level event.

Do not use `onNewBlock()` as a substitute for application-specific transaction processing unless that is actually what the module needs.

---

## 30. `onChainReorganization()`

Modules that maintain chain-sensitive derived state can implement:

    onChainReorganization(block_id, block_hash, lc)

The `lc` value indicates whether the affected block is entering or leaving the longest chain.

This allows a module to reconcile application state with changes in consensus.

A module should implement this when the correctness of its derived state depends on canonical chain membership.

It should not implement it merely because the module happens to observe blockchain transactions.

---

## 31. Derived Indexes

A common Saito application pattern is:

    transaction
        ↓
    onConfirmation()
        ↓
    application database
        ↓
    fast queries / UI

This is a valid and useful architecture.

The database is an index or projection.

It does not replace the blockchain.

When canonical chain membership matters:

    transaction
        ↓
    onConfirmation()
        ↓
    database record
        ↓
    onChainReorganization()
        ↓
    update canonical status

This is the pattern used by modules such as Store and Registry.

The module database can therefore mirror the relevant portion of consensus state without requiring the application to query the blockchain from scratch for every operation.

---

## 32. Do Not Assume Every Module Must Rebuild from the Chain

Current Saito modules do not uniformly reconstruct their application databases from the blockchain.

Some modules maintain chain-sensitive indexes.

Others intentionally maintain application state that is not reconciled against reorganizations.

This is an architectural distinction, not necessarily an implementation error.

The correct question is:

> Does the application's correctness depend on canonical chain membership?

If yes, the module needs a strategy for reconciliation.

If no, the module may be treating blockchain transactions primarily as published application messages.

---

## 33. Blockchain Data vs Application Data

When implementing a feature, distinguish these categories explicitly.

### Consensus data

Owned by Core:

- blocks;
- transactions in the chain;
- UTXO set;
- longest-chain state;
- spendable wallet state derived from the chain.

### Application data

Owned by the module or application:

- application records;
- indexes;
- UI state;
- cached data;
- game state;
- social feeds;
- marketplace records;
- module-specific SQL.

### Service data

Potentially maintained by:

- Archive;
- Vault;
- remote modules;
- external services.

Do not collapse these categories into a single concept of “the blockchain.”

---

## 34. Data Can Move Off-Chain

One of the most important Saito development patterns is that application data does not need to remain on-chain simply because the blockchain was involved in establishing it.

For example:

    on-chain NFT
          ↓
    points to large file
          ↓
    file stored off-chain
          ↓
    Archive / Vault provides access
          ↓
    application executes at edge

This allows applications to use the blockchain for the part of the problem where decentralized consensus is useful while moving large or application-specific data elsewhere.

Large application data should not automatically be embedded in consensus transactions.

---

## 35. Public and Private Data

Saito supports multiple data-publication patterns.

An application can publish information publicly on-chain.

It can publish encrypted information on-chain.

It can communicate privately with a particular peer.

It can store information in an Archive/Vault service.

It can combine these approaches.

These are different architectures.

For example:

    public blockchain transaction
        +
    encrypted payload
        +
    separately distributed key

is different from:

    private transaction
        ↓
    specific Archive server
        ↓
    server-controlled access

The latter does not become decentralized merely because the data is represented as a Saito transaction.

The choice depends on the application's requirements.

---

## 36. Archive Is Not the Blockchain

Archive is a storage and retrieval service.

It can index blockchain transactions and provide transaction retrieval.

It can also store application-specific data that is not publicly propagated through the blockchain.

Archive data is therefore not automatically:

- consensus state;
- present on every node;
- immutable;
- globally searchable;
- canonical after a blockchain reorganization.

An application should know which Archive or service node is expected to contain its data.

Do not assume that an Archive query is equivalent to querying the blockchain.

---

## 37. Node-Local Application Databases

Modules can maintain SQL databases containing application-specific information.

Examples include:

- Store;
- Registry;
- League;
- Bugs;
- other application modules.

These databases belong to the nodes running those modules.

They are not automatically replicated to every Saito node.

A remote peer may expose a service allowing another node to query its database, but that is an application-level service.

Therefore:

    "the network contains this data"

does not necessarily mean:

    "every node has a copy of this data"

and certainly does not mean:

    "every node exposes an arbitrary query interface for this data."

---

## 38. The Distributed Search Problem

One of the most important consequences of the architecture is that universal search is not automatic.

In a conventional web application:

    client
      ↓
    central server
      ↓
    central database
      ↓
    query

The developer can assume that the server has the database.

In a decentralized Saito application, there may be:

    node A
      ├── Archive
      ├── Module SQL
      └── local cache

    node B
      ├── different Archive
      ├── different module database
      └── different local cache

    node C
      └── no copy of the application data

An application therefore has to decide where its searchable data will come from.

Possible solutions include:

- local indexes;
- Archive services;
- remote module queries;
- peer discovery;
- replicated application data;
- external indexing services;
- blockchain traversal when the required data is genuinely consensus data.

Do not assume that Saito provides a universal application database.

---

## 39. Application Architecture Should Minimize Central Dependencies

A Saito module should be able to function without unnecessary dependencies on a particular remote server or module.

This does not mean that server-backed applications are prohibited.

A centralized or semi-centralized service can be entirely appropriate when the application's requirements call for it.

The important architectural question is whether the dependency is necessary.

Prefer:

    local capability
        +
    optional remote capability

over:

    mandatory central service
        +
    application cannot function without it

when the feature can reasonably be implemented without the dependency.

This also makes applications more resilient when peers are unavailable.

---

## 40. Edge Execution

Saito's application model allows substantial application execution to happen at the edge of the network.

A module can:

- receive blockchain transactions;
- receive off-chain messages;
- maintain local state;
- maintain a local database;
- query another peer;
- serve another module;
- communicate directly with users;
- selectively use blockchain consensus.

This means the blockchain does not need to execute every application operation.

The application can decide which operations actually require consensus.

This is a fundamental design advantage of the architecture and should guide application design.

---

## 41. What the Blockchain Should Be Used For

Use the blockchain when the application needs properties provided by decentralized consensus.

Typical examples include:

- transferring value;
- establishing ownership;
- creating spendable UTXOs;
- publishing information to the network;
- establishing a common ordering of events;
- establishing a decentralized record of an operation;
- operations whose validity depends on Core consensus rules.

Do not use the blockchain simply because:

> “This data is important.”

Importance alone is not a blockchain requirement.

---

## 42. What Should Usually Stay Out of Consensus

Application logic that does not need decentralized consensus can usually remain outside the blockchain.

Examples may include:

- UI state;
- local caches;
- derived search indexes;
- temporary session state;
- large files;
- application-specific SQL;
- peer-specific communication;
- computation that does not need every node to reproduce it.

Moving such operations out of consensus reduces unnecessary network and storage requirements and keeps the blockchain focused on the state that actually requires decentralized agreement.

---

## 43. Common Architectural Mistakes

When implementing Saito applications, avoid these assumptions.

### Mistake: The blockchain is the application's database

It is not.

Use application databases and indexes for application-specific queries.

### Mistake: Every transaction must be permanently confirmed

Not necessarily.

Some applications care about message delivery rather than permanent chain inclusion.

### Mistake: Confirmation 0 means finality

It does not.

It means current longest-chain inclusion on the node.

### Mistake: Core will undo module database writes after a reorganization

It will not automatically do so.

Modules must reconcile chain-derived application state themselves when necessary.

### Mistake: Every Saito node has every application's data

It does not.

Application databases, Archive contents, and indexes can be node-local.

### Mistake: A transaction-shaped message is necessarily an on-chain transaction

It is not.

ApplicationMessage traffic can carry serialized Saito transactions without entering consensus.

### Mistake: An off-chain request is automatically authenticated

It is not.

Unsigned off-chain requests are not Core-authenticated.

### Mistake: The wallet is the application database

It is not.

The wallet owns spendable asset state; modules own application state.

### Mistake: A transaction signature is always a globally unique identifier

It is not.

Signed transactions can use signatures as practical application identifiers, but unsigned transaction envelopes do not necessarily have unique signatures.

### Mistake: A peer can always answer arbitrary application queries

It cannot.

The application must know which peer/service maintains the required data and which API exposes it.

### Mistake: Everything should be decentralized

Not necessarily.

Saito supports decentralized, peer-to-peer, server-backed, and hybrid architectures.

The application should use the simplest architecture that satisfies its requirements.

---

## 44. Practical Decision Process for an AI Developer

When implementing a new feature, use this sequence.

### Step 1: Identify the data or operation

What exactly is being created, transferred, communicated, queried, or stored?

### Step 2: Determine whether consensus is actually required

Ask:

    Does the application need decentralized agreement about this?

If no, do not automatically put it on-chain.

### Step 3: Determine whether the information needs public publication

If yes, consider an on-chain transaction.

If only selected peers need it, consider off-chain communication.

### Step 4: Determine whether the information needs asset ownership or spendability

If yes, use the Core wallet/UTXO mechanisms rather than inventing application-level ownership tracking.

### Step 5: Determine where application state should live

Choose among:

- module memory;
- module SQL;
- Archive;
- local options;
- wallet;
- blockchain;
- remote service;
- external service.

### Step 6: Determine whether chain canonicality matters

Ask:

> If this transaction disappears from the longest chain, does the application's correctness change?

If no, confirmation 0 may be sufficient.

If yes, design reorganization handling.

### Step 7: Determine whether the application needs a searchable index

If yes, build or use an appropriate index.

Do not assume the blockchain itself is the application's query database.

### Step 8: Determine whether communication needs authentication

If yes, use an explicitly signed/authenticated mechanism.

Do not assume an unsigned `sendRequest` is authenticated.

### Step 9: Minimize unnecessary dependencies

Prefer local and module-native mechanisms before introducing mandatory remote services.

### Step 10: Only then implement

The implementation should follow the architecture determined above rather than forcing the feature into a conventional web-server or smart-contract pattern.

---

## 45. Canonical Patterns

### Pattern: Blockchain publication

Use when the network should receive a transaction as part of blockchain consensus.

    create transaction
          ↓
    sign
          ↓
    propagateTransaction
          ↓
    verification
          ↓
    mempool
          ↓
    block
          ↓
    longest chain
          ↓
    onConfirmation

### Pattern: Off-chain application message

Use when the application needs peer communication without blockchain inclusion.

    create transaction-shaped message
          ↓
    sendRequest / sendRequestAsTransaction
          ↓
    ApplicationMessage
          ↓
    handlePeerTransaction

Remember that authentication must be explicit.

### Pattern: Derived application index

Use when the application needs fast structured queries over blockchain-derived data.

    blockchain transaction
          ↓
    onConfirmation
          ↓
    module SQL
          ↓
    application queries

If canonical chain membership matters:

    onChainReorganization
          ↓
    reconcile index

### Pattern: Local application state

Use when the information is local to the user or node and does not require consensus.

    application
       ↓
    local state / app.options / module storage

Do not promote local state to blockchain state without a concrete reason.

### Pattern: Large or private data

Use when the application has data that should not be placed directly into public blockchain transactions.

    blockchain transaction
          ↓
    identifier / ownership / metadata
          ↓
    Archive / Vault / service
          ↓
    large or private data

The exact privacy and access-control mechanism depends on the application.

---

## 46. The Most Important Architectural Distinction

When an AI is implementing a Saito application, it should distinguish four different questions:

    1. Where is the information published?

    2. Where is the information stored?

    3. Where is the information indexed?

    4. Where is the information executed or interpreted?

These do not have to be the same place.

For example:

    Blockchain
        publishes ownership event

    UTXO set
        represents current spendability

    Module SQL
        indexes marketplace listings

    Archive
        stores/retrieves transaction data

    Browser module
        executes application logic

This separation is intentional.

Do not collapse all four responsibilities into a single database or smart contract.

---

## 47. Summary for AI Developers

When building a Saito application, remember:

1. The blockchain is the consensus and publication layer, not the application's universal database.

2. Modules execute application logic at the edge of the network.

3. Use on-chain transactions when decentralized consensus, publication, ordering, ownership, value, or another blockchain property is actually required.

4. Use off-chain application messages when the application primarily needs peer-to-peer communication.

5. A transaction-shaped message is not necessarily an on-chain transaction.

6. Unsigned off-chain requests are not automatically authenticated.

7. `onConfirmation(..., 0)` means that the transaction is currently included in the node's longest chain. It is not irreversible finality.

8. Reorganizations can remove transactions from the current longest chain.

9. Core reconciles the blockchain and UTXO/wallet state during reorganizations. It does not automatically undo module SQL or application state.

10. If application correctness depends on canonical chain membership, implement appropriate `onChainReorganization()` handling.

11. Module databases are derived application state, not consensus state.

12. The Store is an important example of an application that must track longest-chain state because its derived database determines which blockchain assets it can operate on.

13. Not every application needs reorganization handling. Message-oriented applications may only care that a transaction was received.

14. The UTXO set is Core-owned. Do not implement duplicate UTXO validation or spendability tracking inside modules.

15. The wallet is not the application's general-purpose database.

16. Archive is not the blockchain and is not automatically present on every node.

17. There is no universal application database shared by every Saito node.

18. If an application needs searchable data, build or use an appropriate application-specific index.

19. Transaction signatures are useful practical identifiers for signed transactions, but they are not universal identifiers for every transaction-shaped message.

20. Fees influence transaction inclusion expectations, but not every application needs to require users to pay fees.

21. Do not assume that every application should be decentralized. Saito supports decentralized, peer-to-peer, server-backed, and hybrid designs.

22. Do not assume that every application should use the blockchain for every operation.

23. Before implementing a feature, determine what property the application actually needs and choose the simplest Saito-native mechanism that provides it.

The fundamental implementation rule is:

> Use consensus where consensus is needed. Use peer-to-peer communication where communication is needed. Use application storage where application state is needed. Keep application execution at the edge whenever it does not need to be part of consensus.
# Saito Framework — Conceptual Architecture

## 1. Purpose

This document explains the conceptual architecture that application developers work with when building on Saito.

It is not a description of the Rust, WASM, JavaScript, and Node compilation/runtime stack. That architecture is covered separately in:

    Saito Framework — Core Architecture

The purpose here is to explain how a Saito application thinks about:

- applications and modules;
- the `app` runtime;
- transactions and messages;
- blockchain state;
- wallets and identity;
- peers and network communication;
- off-chain communication;
- application storage;
- local state and persistence;
- module databases;
- Archive services;
- keychain data;
- events and services;
- application lifecycle;
- optional module capabilities;
- data availability and distribution.

The most important conceptual difference from conventional web development is that a Saito application does not necessarily have one server containing the application's database.

A Saito application can execute on many peers.

Data can exist in multiple places.

Different pieces of data can have different persistence, availability, freshness, and authority requirements.

The application developer therefore has to decide not only:

> What data does this application need?

but also:

> Who needs the data, where can it be obtained, how long must it remain available, and what should happen if the original source is unavailable?

## 2. The Basic Saito Model

A Saito process contains one `app` runtime and a collection of modules.

Conceptually:

    Saito Process
    ┌───────────────────┐
    │       app         │
    │                   │
    │ wallet            │
    │ blockchain        │
    │ network           │
    │ modules           │
    │ storage           │
    │ keychain          │
    │ connection        │
    │ options           │
    │ core              │
    │ browser           │
    └─────────┬─────────┘
              │
       ┌──────┼──────┐
       │      │      │
    Module A Module B Module C
       │      │      │
       └──────┼──────┘
              │
        Saito peer network

A Saito application is normally a module.

The terms "application" and "module" are therefore closely related in Saito.

A module is an application because it participates in the Saito runtime and can provide application functionality to the user. It may provide a UI, but a UI is not required.

A module can instead provide:

- a protocol;
- a data service;
- a background service;
- a storage service;
- a game;
- a wallet-related feature;
- a communication system;
- a specialized application capability;
- or some combination of these.

The normal location for an application module is:

    node/mods/<module>/

The module normally extends `ModTemplate`, either directly or through a specialized Saito template.

The important conceptual model is therefore:

    Saito runtime
        │
        ├── app
        │
        └── modules
              ├── application A
              ├── application B
              ├── application C
              └── ...

This is not the same architecture as:

    browser frontend
            ↓
    REST API
            ↓
    application server
            ↓
    database

That architecture can be reproduced on Saito when appropriate, but it is not the fundamental Saito model.

## 3. The `app` Object

`app` is the central runtime object used by Saito applications.

A module receives the Saito application instance and normally stores it as:

    this.app

The application runtime exposes the major Saito facilities through `app`.

Common examples include:

    app.wallet
    app.blockchain
    app.network
    app.modules
    app.storage
    app.keychain
    app.options
    app.connection
    app.core

The `app` object should be thought of as the application's access point to the Saito runtime.

It is not a dependency-injection container, service registry, or generic framework abstraction.

The simplest mental model is:

    this.app
       │
       ├── wallet
       ├── blockchain
       ├── network
       ├── modules
       ├── storage
       ├── keychain
       ├── options
       ├── connection
       └── core

A module normally uses these facilities directly.

For example:

    let tx = await this.app.wallet.createUnsignedTransaction();

or:

    this.app.options

or:

    this.app.modules.respondTo(...)

Saito applications should generally prefer the existing Saito runtime APIs over creating additional layers around them.

Do not introduce a controller, service, repository, manager, dispatcher, or resolver merely to wrap an existing `app.*` API.

## 4. Applications and Modules

A Saito module is the application unit.

The basic scaffold is `ModTemplate`.

A module normally has a constructor that receives the Saito application:

    constructor(app) {
        super(app);
    }

The module can then participate in the Saito runtime through lifecycle functions and application APIs.

A module can contain:

    node/mods/example/
        example.js
        lib/
        web/
        sql/

The exact directory structure varies by application, but the important architectural principle is that the module owns its application logic.

A module may contain:

- domain objects;
- transaction creation and processing;
- peer communication;
- module-specific databases;
- UI components;
- application state;
- configuration;
- local indexes;
- blockchain event processing.

Domain objects normally belong under:

    lib/

UI components normally belong under:

    lib/ui/

Transaction construction and transaction-specific processing can belong under:

    lib/transactions/

The module itself remains the owner of the application domain.

The Saito framework provides the runtime; the module provides the application.

## 5. `ModTemplate`

`ModTemplate` is the basic scaffold and contract for Saito modules.

A module extending `ModTemplate` receives generic Saito functionality and application lifecycle hooks.

Important lifecycle methods include:

    installModule()
    initialize()
    render()
    attachEvents()
    onConfirmation()
    onNewBlock()
    onChainReorganization()
    onPeerServiceUp()
    handlePeerTransaction()
    respondTo()

Not every module needs every hook.

Some methods are legacy or transitional and should not automatically be copied into new applications merely because they exist in `ModTemplate`.

The general principle is:

> Use the smallest set of lifecycle hooks necessary for the application.

## 6. Module Installation and Initialization

`installModule()` is used for first-time module installation.

It is particularly relevant to persistent module infrastructure such as:

- creating module SQL tables;
- installing module-specific database structures;
- performing first-time setup.

It is different from `initialize()`.

`initialize()` runs whenever the module starts.

A useful distinction is:

    installModule()
        first-time installation

    initialize()
        every startup

For example, a module may create its database schema during installation and then load or initialize its runtime state during every startup.

A module should not assume that initialization only occurs when the user opens the module's UI.

The module may be running even when its page is not currently visible.

## 7. Browser and Node Run the Same Application Model

One of the most important Saito concepts is that the browser is not simply a dumb frontend for a server-side application.

The browser can run Saito itself.

The same module code can therefore execute:

    Node/full runtime
            │
            └── module

    Browser/lite runtime
            │
            └── same module

The capabilities available to the two environments are not identical.

For example, a Node process can have:

- filesystem access;
- server HTTP functionality;
- full-node capabilities;
- module SQL databases.

A browser does not necessarily have those capabilities.

The browser can nevertheless run the application module and participate in Saito communication using its local Saito runtime.

The browser therefore has an active role in the application architecture.

A developer should not automatically create:

    Browser UI
        ↓
    REST API
        ↓
    Server application

when the application can instead execute its logic locally and communicate directly with peers.

A server can still be used when that architecture makes sense.

## 8. Module UI Is Optional

A module does not have to provide a user interface.

Some modules are primarily:

- services;
- storage providers;
- protocol participants;
- background applications;
- data providers.

When a module does provide UI, the module's UI normally belongs to the module.

Shared, reusable Saito UI belongs in the Saito UI system.

The conceptual distinction is:

    Saito shared UI
        │
        ├── common application components
        ├── header
        ├── user interfaces
        ├── overlays
        └── other shared components

    Module UI
        │
        ├── application-specific components
        ├── application screens
        ├── domain-specific overlays
        └── application-specific controls

New applications should generally use module-owned UI components rather than building applications around the older `addComponent()` / `removeComponent()` model.

The application owns its UI behavior.

Shared components should be promoted into the Saito UI layer only when they genuinely represent reusable Saito-wide functionality.

## 9. Application Lifecycle

A simplified application lifecycle looks like:

    Saito runtime starts
            │
            ▼
    load app.options
            │
            ▼
    initialize wallet / keychain / runtime
            │
            ▼
    construct modules
            │
            ▼
    install module infrastructure if necessary
            │
            ▼
    module.initialize()
            │
            ▼
    module participates in:
            │
            ├── peer services
            ├── blockchain events
            ├── off-chain transactions
            ├── local events
            └── UI when active

The exact startup sequence differs between browser and Node environments, but the conceptual model is that modules become active participants in the Saito runtime.

A module does not need to be the currently visible application in order to be initialized and running.

## 10. Transactions Are the Common Application Message Object

A Saito transaction is not only an economic payment.

It is also a reusable structured communication object.

A transaction can contain application data in:

    tx.msg

A common convention is:

    tx.msg = {
        module: this.name,
        request: 'some request',
        data: {
            ...
        }
    };

The transaction can then be:

- propagated on-chain;
- sent directly to another peer;
- relayed;
- archived;
- stored locally;
- returned by an Archive;
- processed by a module.

This makes the transaction a useful common message format across multiple communication paths.

Conceptually:

                        Transaction
                             │
                 ┌───────────┴───────────┐
                 │                       │
             on-chain                 off-chain
                 │                       │
           block / ledger          peer message
                 │                       │
         onConfirmation()       handlePeerTransaction()

The same application message can therefore sometimes be processed regardless of whether it arrived:

    from a block

or:

    from a peer

For example:

    let txmsg = tx.returnMessage();

can provide the application-level JSON message in either case.

## 11. Transactions Are Not the Same as HTTP Requests

A transaction should not be mentally reduced to:

    HTTP request

It is a Saito object that can have:

- transaction metadata;
- sender and recipient slips;
- signatures;
- timestamps;
- application message data;
- optional encryption;
- on-chain use;
- off-chain use.

An off-chain transaction does not automatically become part of the blockchain.

Likewise, a transaction appearing on-chain does not automatically mean that every peer stores the complete transaction forever.

The transaction is the communication object.

The developer still has to decide:

    Where should it go?
    Who should receive it?
    Should it be signed?
    Should it be encrypted?
    Should it become blockchain state?
    Should it be archived?
    How long should it remain available?

These are separate decisions.

## 12. On-Chain Application Communication

On-chain application communication normally follows the blockchain lifecycle.

A module can create a transaction:

    let tx = await this.app.wallet.createUnsignedTransaction();

    tx.msg = {
        module: this.name,
        request: 'create something',
        data: {
            ...
        }
    };

    await tx.sign();

    this.app.network.propagateTransaction(tx);

When the transaction becomes part of a block, the receiving module can process it through:

    onConfirmation(blk, tx, confnum)

The module can use the confirmation number to determine when it considers the transaction sufficiently confirmed.

A common pattern is:

    if (confnum == 0) {
        // process the transaction
    }

although applications may intentionally wait for additional confirmations.

On-chain transactions are appropriate when the application needs properties associated with blockchain settlement, such as:

- value transfer;
- durable protocol events;
- cryptographically signed application actions;
- third-party signed data;
- key exchange;
- consensus-visible state transitions.

They should not be used merely because "blockchain" sounds like the appropriate database.

## 13. Off-Chain Application Communication

Saito also supports direct peer-to-peer application communication.

A module can send an application transaction to another peer without waiting for it to become part of a block.

Typical APIs include:

    sendRequest()
    sendRequestAsTransaction()
    sendTransactionWithCallback()

The exact APIs have evolved and several related forms exist.

The conceptual distinction is more important than the specific helper:

    on-chain communication
        → transaction enters blockchain processing

    off-chain communication
        → transaction is sent directly to a peer

Off-chain communication is useful when an application needs information quickly and does not require the request itself to become blockchain state.

Examples include:

- asking a peer for data;
- retrieving application records;
- requesting an Archive transaction;
- asking a module for information from its local database;
- lightweight application synchronization;
- querying a peer that advertises a particular service.

Off-chain messages may be unsigned by default.

Therefore:

> An unsigned off-chain message should not be treated as authenticated merely because it arrived through a Saito peer connection.

If the application needs cryptographic authentication, the transaction can be signed.

Encryption can also be used when the application needs confidentiality.

## 14. `handlePeerTransaction()`

A module receives off-chain application transactions through:

    handlePeerTransaction(tx, peer, mycallback)

The module examines the transaction and determines whether it handles the request.

A common pattern is:

    let txmsg = tx.returnMessage();

    if (txmsg.request === 'some request') {
        ...
    }

Modules conventionally use fields such as:

    tx.msg.module
    tx.msg.request
    tx.msg.data

to identify application messages.

The `module` field is a convention, not a universal type system enforced by the network.

The application can return data through the callback when the request is being used as a request/response interaction.

The important conceptual model is:

    Module A
       │
       │ off-chain transaction
       ▼
    Peer B
       │
       ▼
    Module B
       │
       │ query local state / database
       ▼
    callback response
       │
       ▼
    Module A

This can function much like a peer-to-peer application API without requiring an HTTP REST endpoint.

## 15. The Peer Is Not Necessarily the Originator

A module should not assume that the `peer` argument in `handlePeerTransaction()` is necessarily the identity that created or signed the transaction.

The peer represents the transport relationship through which the message arrived.

Messages can be relayed.

Therefore:

    peer identity

and:

    transaction sender / signer

are conceptually different.

When identity matters, the module should use the cryptographic identity contained in the transaction rather than assuming that the immediate network peer is the originator.

## 16. The Local Event System Is Different from the Network

`app.connection` is an in-process event system.

It is not the Saito peer network.

Conceptually:

    app.connection
        │
        └── local modules/components in this process

    app.network
        │
        └── remote Saito peers

An event such as:

    app.connection.emit(...)

does not automatically cross the network.

This distinction is extremely important.

Use the local connection when communicating between things running inside the same Saito process.

Use the network/transaction mechanisms when communicating with another peer.

Do not treat an event as a source of durable state.

Events are notifications.

The underlying state still belongs somewhere else.

## 17. `onConfirmation()`, `onNewBlock()`, and Reorganizations

Blockchain-aware modules have several important lifecycle hooks.

### `onConfirmation()`

Called when a transaction is encountered in a block.

Typical use:

    onConfirmation(blk, tx, confnum) {
        ...
    }

This is where a module commonly processes its on-chain transactions.

### `onNewBlock()`

Called when a new block becomes part of the current longest chain.

This is useful for modules that need block-level processing rather than transaction-level processing.

### `onChainReorganization()`

Modules that maintain chain-dependent indexes or databases need to consider reorganizations.

Conceptually:

    block enters longest chain
            ↓
    module adds / activates derived state

    block leaves longest chain
            ↓
    module removes / deactivates derived state

A module database is not automatically reverted when the blockchain reorganizes.

If a module maintains derived database state from blockchain transactions, it is the module's responsibility to make that state reorganization-aware.

This is especially important for:

- indexes;
- marketplaces;
- registries;
- UTXO-derived state;
- listings;
- chain-dependent caches.

## 18. Data Has Different Owners

One of the most important Saito architectural decisions is identifying who owns a piece of data.

Possible owners include:

    Blockchain
    Wallet / WASM
    Keychain
    Module runtime
    app.options
    Module SQL database
    Archive
    Remote peer
    External service

These are not interchangeable.

A developer should ask:

1. Who owns this data?
2. Who needs to read it?
3. Who is allowed to modify it?
4. Does it need to survive a restart?
5. Does it need to survive loss of the current peer?
6. Does it need to be available to other users?
7. Does it need blockchain-level verification?
8. How fresh does it need to be?
9. Can it be reconstructed?
10. What should happen if the original source is unavailable?

These questions should be answered before choosing a storage mechanism.

## 19. `app.options`

`app.options` is lightweight persistent application state.

It is used for many kinds of local state, including:

- configuration;
- wallet-related state;
- blockchain checkpoints;
- keychain information;
- module preferences;
- local application state;
- small caches;
- other persistent settings.

On a Node runtime it is persisted to disk.

In a browser it is persisted through browser storage.

The exact contents are therefore broader than a conventional "configuration file".

A useful mental model is:

    app.options
        =
    lightweight local persistent state

It is not:

    SQL database

and it is not:

    blockchain state

It should generally contain data that is:

- small;
- local;
- quickly accessible;
- convenient to serialize;
- useful for restoring application state.

For example:

    app.options.mymodule

can contain a module's lightweight persistent state.

A common pattern is:

    initialize() {
        this.load();
    }

where `load()` reads the module's portion of `app.options`.

Likewise, a module can update its state in `app.options` and persist the options.

### Do not use `app.options` as a general database

`app.options` contains important wallet and application state.

If modules put large datasets into it, the options object can become too large and cause serious problems.

It should not be used for:

- large transaction histories;
- images;
- large files;
- large application databases;
- data that can be reconstructed from a canonical source.

Use an appropriate storage mechanism instead.

## 20. Wallet and WASM State

The wallet is not merely a login system.

It manages cryptographic identity and wallet state, including keys and UTXO/slip information.

The wallet and underlying WASM state provide the authoritative runtime interface for things such as:

- private/public keys;
- spendable slips;
- balances;
- wallet transactions;
- NFT holdings;
- blockchain-related wallet state.

A useful mental model is:

    app.wallet
        │
        └── wallet API

    WASM wallet
        │
        └── underlying wallet / UTXO state

    app.options
        │
        └── persisted application representation/cache

The application should use wallet APIs rather than treating `app.options.wallet` as an independent wallet database.

For example:

    app.wallet.createUnsignedTransaction(...)

is a wallet operation.

The developer should not reconstruct wallet semantics by manipulating the serialized options representation directly.

## 21. Keychain

The keychain is separate from the wallet.

The wallet answers questions such as:

    Who am I?
    What keys do I control?
    What UTXOs do I own?

The keychain answers questions related to relationships with other identities, such as:

    Who are my contacts?
    What keys have I associated with them?
    What shared secrets exist?
    Which keys am I watching?

The distinction is:

    Wallet
        → my cryptographic identity and spendable state

    Keychain
        → relationships and cryptographic information about other identities

Applications should not use the keychain as a replacement for their own domain database.

Likewise, an application should not put contact/relationship information into an unrelated module's options storage.

## 22. Module SQL Databases

A module can own a SQL database.

Module SQL schemas are normally defined within the module and installed when the module is installed.

Conceptually:

    node/mods/example/sql/
            │
            ▼
    module database
            │
            ▼
    this.dbName

This is appropriate when an application needs structured, indexed data.

Examples include:

- search indexes;
- application-specific records;
- listings;
- cached information;
- structured server-side state;
- derived indexes.

A module database is application-owned state.

It is not automatically blockchain state.

For example:

    blockchain transaction
            │
            ▼
    module.onConfirmation()
            │
            ▼
    module SQL database

The database may contain a derived representation of blockchain information.

If the blockchain later reorganizes, the database does not automatically change.

The module must decide whether and how to update it.

### Module SQL is not necessarily available everywhere

A browser runtime may not have the same module SQL environment as a full Node runtime.

A module therefore cannot blindly assume:

    every browser
        =
    full server database

If an application needs remote database access, it must have a peer or service that actually provides that database.

## 23. `app.storage`

`app.storage` provides Saito storage abstractions.

Among the important APIs are:

    saveTransaction()
    loadTransaction()
    loadTransactions()

These APIs allow applications to work with transaction storage without hard-coding the implementation of the underlying storage service.

One important feature is that loading can be directed toward a peer.

Conceptually:

    app.storage.loadTransactions(...)
                 │
                 ├── local storage
                 │
                 └── remote peer

This means that a module does not necessarily need to know whether the transaction it wants is stored locally or on a remote Archive service.

The storage API can mediate the request.

## 24. Archive

Archive is a module that provides transaction storage and retrieval.

It should not be thought of as:

    the blockchain database

It is better understood as:

    a transaction storage service

A module can explicitly save transactions into an Archive and later request them.

For example:

    onConfirmation()
          │
          ▼
    module decides transaction is useful
          │
          ▼
    app.storage.saveTransaction(tx)
          │
          ▼
    Archive storage

Later:

    app.storage.loadTransactions(...)
          │
          ▼
    Archive
          │
          ▼
    transactions

Archive availability is therefore a property of storage infrastructure, not a guarantee that every blockchain transaction is permanently available everywhere.

A transaction appearing on-chain does not mean every node has archived it.

Likewise, an Archive can contain transaction information that is useful to applications without making that information blockchain state.

## 25. Local Archive and Remote Archive

One of the useful consequences of the storage abstraction is that a module can request data from another peer using essentially the same conceptual storage interface.

For example:

    Browser
       │
       │ load transactions
       ▼
    local Archive

or:

    Browser
       │
       │ load transactions
       ▼
    remote Archive peer

The application therefore does not have to treat "my local archive" and "someone else's archive" as completely different architectural systems.

This is particularly useful for applications such as social feeds.

A module may first use locally available transactions and then ask peers that provide Archive services for additional history.

RedSquare uses this kind of pattern for retrieving historical transaction data.

## 26. Storage Is a Choice, Not a Universal Rule

There is no single Saito storage mechanism that every application must use.

A module may choose among:

    app.options
    wallet / WASM state
    module SQL
    Archive
    blockchain
    local memory
    remote peer
    external storage

The appropriate choice depends on the application's requirements.

Saito recommends certain patterns because distributed application storage is easy to misunderstand.

The recommended patterns reduce common failures, but they do not eliminate application-level design choices.

The developer remains responsible for determining:

    authority
    persistence
    availability
    freshness
    distribution
    reconstruction

of the data.

## 27. Local State vs Shared Data

A fundamental question is:

> Is this data only for this user, or does it need to be available to other users?

Local state can often live in:

    app.options
    module runtime memory
    browser storage
    local database

Shared data requires some distribution mechanism.

Possible mechanisms include:

    blockchain
    Archive
    peer module database
    off-chain peer transaction
    external storage
    file/Vault service

The choice depends on the required guarantee.

For example:

    UI preference
        → app.options

    Current UI state
        → memory / component state

    Search index
        → module database

    Historical transaction
        → Archive

    Consensus-visible action
        → blockchain

    Remote database query
        → handlePeerTransaction()

    Private file
        → appropriate file/storage capability

These are examples, not mandatory rules.

The important point is to explicitly decide what the data needs.

## 28. Data Availability Is an Architectural Property

In a conventional server application, developers often assume:

    user
      ↓
    server
      ↓
    database

Therefore:

    database exists

is effectively assumed.

In a peer-to-peer application, this assumption is false.

The user may be connected to a collection of peers:

                 Peer A
                    │
                    │
            ┌───────┴───────┐
            │               │
         Peer B           Peer C
            │               │
            └───────┬───────┘
                    │
                  User

Those peers may:

- have different data;
- have different synchronization states;
- run different modules;
- maintain different databases;
- archive different transactions;
- be temporarily unavailable;
- prune old data;
- provide different services.

There is therefore no universal guarantee that:

    "I know this data exists somewhere on the network"

means:

    "I can retrieve it right now."

This is one of the most important architectural differences between Saito applications and conventional client/server applications.

## 29. The Local Cache Pattern

If an application depends on data but cannot guarantee that a remote source will always be available, a useful pattern is:

    remote source
          │
          ▼
    local cache
          │
          ▼
    application

The local cache can be updated whenever new data becomes available.

For example:

    peer service becomes available
            │
            ▼
    request data
            │
            ▼
    save locally
            │
            ▼
    application can continue using local copy

This is often preferable to making every application operation depend on a remote server being available.

The application can use the remote peer for synchronization and the local copy for normal operation.

The local copy may be authoritative for the application's immediate use without necessarily being authoritative for the underlying global state.

## 30. Peer Services

Peers can advertise services.

A module can respond to peer service availability through:

    onPeerServiceUp(...)

The application can inspect available peers and determine which peers provide useful capabilities.

For example:

    Peer
      ├── Archive
      ├── Store
      ├── Relay
      └── other module services

The service mechanism does not mean that every peer provides every application.

A module should therefore not assume that a desired service exists.

A common pattern is:

    peer service becomes available
            │
            ▼
    request application data
            │
            ▼
    receive response
            │
            ▼
    update local state

This is one of the mechanisms by which Saito applications synchronize data without requiring a central server.

## 31. Server-Style Architecture Is Still Possible

Saito does not prohibit conventional server-style application architecture.

If an application has:

    a known server
    +
    a known database
    +
    a stable client/server relationship

then using a module database and off-chain peer requests can be entirely appropriate.

Conceptually:

    Browser
       │
       │ peer transaction
       ▼
    Application server
       │
       ▼
    Module SQL database

This can provide a very stable application experience when the server running the module is reliably available.

Saito therefore allows developers to reproduce much of the traditional client/server model.

The difference is that the server is a Saito peer and communication can occur through Saito's peer network rather than requiring a separate HTTP application protocol.

## 32. Avoid Unnecessary Server Dependencies

Although server-style applications are possible, modules should avoid requiring a particular server unless the application genuinely needs it.

A module that only works because:

    "our server happens to have this database"

has introduced a dependency that may prevent the application from operating elsewhere.

A more distributed design might instead:

    publish data
            ↓
    peers receive data
            ↓
    peers cache data
            ↓
    applications use local copies

or:

    peer advertises service
            ↓
    application requests data
            ↓
    application caches result

or:

    transaction becomes blockchain-visible
            ↓
    Archive nodes store it
            ↓
    applications retrieve it

The correct architecture depends on the application's requirements.

## 33. Data Published Through Transactions

An application can use transactions to distribute data.

For example, a server or application can periodically create transactions containing information such as:

    price data
    oracle data
    application configuration
    public announcements
    state snapshots

Those transactions can be:

- sent off-chain;
- archived;
- propagated on-chain;
- retrieved from peers.

For example:

    data producer
          │
          ▼
    transaction containing data
          │
          ├── off-chain distribution
          │
          └── blockchain publication

The advantage of publishing on-chain is that the information becomes associated with blockchain history and cryptographic transaction identity.

The disadvantage is that someone still has to create and publish the transactions.

The blockchain does not magically generate application data.

## 34. Address-Based Data Feeds

Another design is to designate an address as the source of a particular application feed.

The application can listen for transactions sent to that address and update its local state when those transactions arrive.

Conceptually:

    data producer
          │
          ▼
    transaction → designated address
          │
          ▼
    Saito network
          │
          ▼
    application receives transaction
          │
          ▼
    local cache/index

This can be useful when users themselves are providing the data.

For example, an application might maintain a locally updated index based on transactions addressed to a known public key.

This approach has advantages and disadvantages.

Anyone may potentially send a transaction to the address, so the application must define how it determines which transactions are meaningful or authorized.

The important architectural lesson is that the network itself can be the mechanism by which application state is distributed, while each application maintains its own local representation.

## 35. Vault and File-Based Data

Applications can also store data as files rather than individual transactions.

Vault provides a higher-level mechanism around Archive/file storage.

This can support application designs in which:

    NFT / ownership
            │
            ▼
    access policy
            │
            ▼
    file

For example, access to a file could be controlled using NFT ownership or a payment/script mechanism.

This is useful for data that is too large or inconvenient to place directly inside transactions.

The important distinction is:

    transaction
        → metadata / authorization / reference

    file storage
        → large data

The exact design depends on the application.

An application should not create redundant metadata caches when the authoritative metadata is already attached to the NFT mint transaction or other canonical application object.

## 36. External Data Sources

A Saito application can also use data that exists outside Saito.

For example:

    Saito application
          │
          ├── blockchain
          ├── Saito peers
          ├── Archive
          ├── local database
          └── external website/API

There is no requirement that every byte of application data be stored on the Saito blockchain.

An application can fetch external information and cache or process it locally.

The fact that the application is decentralized does not require every dependency to be decentralized.

It does, however, mean that the developer should understand which parts of the application depend on external infrastructure.

## 37. Search Is a Distributed-System Problem

Search is a useful example of why data architecture matters.

In a conventional web application:

    user
      ↓
    search API
      ↓
    central search index
      ↓
    database

The developer can assume that the search index represents the application's available dataset.

In a peer-to-peer application there may be no single authoritative search database.

Instead:

    User
      │
      ├── local data
      ├── Peer A
      ├── Peer B
      ├── Peer C
      └── blockchain

Each peer may:

- have different transactions;
- have different indexes;
- archive different data;
- run different modules;
- be at different synchronization points;
- expose different services.

Therefore a query such as:

    "find every post matching X"

is not automatically well-defined.

The developer must first decide what corpus is being searched.

Possible interpretations include:

    my local archive
    my local database
    all data I have seen
    a particular Archive
    a particular peer
    known peers
    blockchain history
    an external index

A decentralized application must therefore define the scope and guarantees of search rather than assuming that "the database" exists.

## 38. Application State vs Derived State

Applications often maintain state derived from other sources.

For example:

    blockchain transaction
            │
            ▼
    module processing
            │
            ▼
    SQL index
            │
            ▼
    UI

The SQL index is not necessarily authoritative.

It may be a convenient representation that can be rebuilt from source data.

The developer should distinguish:

    source of truth

from:

    derived state

and:

    cache

For example:

    NFT mint transaction
        → source of NFT metadata

    Store database
        → Store's index of listings

    UI object
        → runtime representation

    app.options
        → local persistence/cache

Avoid maintaining multiple competing copies of the same authoritative information without a specific reason.

## 39. Consumer-Owned Indexes

When a module needs a classification or index of information owned by another system, the consumer should generally own that index.

For example:

    NFT mint transaction
            │
            ▼
    NFT metadata

    Application
            │
            ▼
    its own classification

The provider should not be forced to maintain application-specific indexes for every consumer.

This keeps modules independent.

The general principle is:

> The owner of a domain owns its canonical data; consumers own their own derived classifications and indexes.

## 40. Optional Modules and Capabilities

Modules should not normally hard-depend on optional modules.

Bad architecture:

    this.app.modules.returnModule('Vault').someFunction();

when the application cannot operate without Vault being installed.

A better architecture is capability-based:

    Consumer
        │
        │ request capability
        ▼
    respondTo()
        │
        ▼
    Provider, if available

This allows:

    Provider installed
        → capability available

    Provider absent
        → application continues without it

The important distinction is:

    framework infrastructure

versus:

    optional application module

A module can reasonably depend on core Saito facilities such as:

    wallet
    network
    storage
    blockchain

It should be cautious about depending directly on another optional application.

## 41. `respondTo()` as a Module Interface

`respondTo()` provides a simple way for modules to expose capabilities without creating hard dependencies.

Conceptually:

    Module A
        │
        │ "Do you provide capability X?"
        ▼
    Module B
        │
        └── respondTo('X')
                 │
                 ▼
              capability

This is preferable to introducing generic module dispatch infrastructure.

The interface should describe a real capability.

For example:

    arcade-games
    saito-header
    saito-nft-transfer

rather than a generic:

    dispatch
    execute
    handle
    action

The goal is to let applications remain installable and functional without optional providers.

## 42. `returnModule()` and Direct Module Access

Direct access to another module exists in the codebase and is sometimes useful.

However, it should not become the default mechanism for optional module integration.

The question should always be:

    Is this module guaranteed to exist?

If the answer is no, the application should generally use a capability interface such as `respondTo()`.

The existence of a method on another module is not by itself a reason to create a hard architectural dependency.

## 43. Services vs Modules

A module can advertise a service.

A service is therefore a capability that a peer can provide through the network.

This is different from `respondTo()`.

Conceptually:

    respondTo()
        → local module capability

    peer service
        → remote peer capability

A module can therefore have both:

    local composition
        ↓
    respondTo()

and:

    remote composition
        ↓
    peer service

The application should choose the mechanism appropriate to where the capability exists.

## 44. Application Data Flow

A useful generic Saito application flow is:

                         USER
                           │
                           ▼
                    MODULE / UI
                           │
                  create transaction
                           │
                           ▼
                       app.wallet
                           │
                           ▼
                    signed transaction
                           │
                  ┌────────┴────────┐
                  │                 │
              on-chain          off-chain
                  │                 │
                  ▼                 ▼
            blockchain          peer module
                  │                 │
                  ▼                 ▼
          onConfirmation()   handlePeerTransaction()
                  │                 │
                  └────────┬────────┘
                           ▼
                     module state
                           │
                 ┌─────────┼─────────┐
                 │         │         │
               memory    options    SQL
                 │         │         │
                 └─────────┼─────────┘
                           ▼
                           UI

The critical point is that the application decides which of these paths is appropriate.

There is no requirement that every application follow the same path.

## 45. A Data-Architecture Decision Process

When implementing a new feature, an AI or developer should first classify the data.

### Question 1: Is it local?

If only one user needs it, consider:

    component state
    module memory
    app.options
    local storage
    local database

### Question 2: Must other users obtain it?

If yes, determine how it will be distributed:

    blockchain
    Archive
    peer service
    module database
    off-chain transaction
    external storage

### Question 3: Does it require blockchain authority?

If yes, consider putting the authoritative event/state on-chain.

If not, do not automatically use the blockchain as a database.

### Question 4: Must it survive loss of the current node?

If yes, do not rely solely on local state.

Use an appropriate distributed or remote source.

### Question 5: Must it be available immediately?

If yes, consider:

    local cache
    local options
    local database
    remote off-chain request

rather than requiring blockchain confirmation.

### Question 6: Can it be reconstructed?

If yes, a local index/cache may be acceptable.

If no, identify where the durable copy must exist.

### Question 7: Is there a known server?

If yes, a module database plus peer requests may be appropriate.

If no, design around distributed availability rather than assuming a central database exists.

### Question 8: What happens if the peer is unavailable?

The application should have an explicit answer.

Possibilities include:

    use local cache
    try another peer
    wait
    display partial data
    reconstruct from blockchain
    fail gracefully

Do not leave this behavior implicit.

## 46. The Recommended Default for Historical Transactions

For historical transaction data, Saito's recommended pattern is generally to use the transaction storage abstraction:

    app.storage.saveTransaction()
    app.storage.loadTransaction()
    app.storage.loadTransactions()

with Archive nodes providing the storage service where appropriate.

This abstracts the details of where the transaction is stored.

A module can therefore think in terms of:

    save this transaction
    load this transaction

rather than hard-coding an Archive implementation.

The application still needs to understand that availability is not magical.

If a transaction has never been saved by an Archive and no peer has it, a request for that transaction may fail.

## 47. Historical Data Is Not Automatically Available

One of the most important assumptions to avoid is:

    "It was on the blockchain, therefore my application can retrieve it."

The blockchain and transaction archives solve different problems.

A blockchain provides consensus history.

An Archive provides application-oriented transaction storage and retrieval.

A module that needs a transaction available through Archive mechanisms should explicitly save it when appropriate.

The resulting architecture may be:

    transaction appears
            │
            ▼
    module.onConfirmation()
            │
            ├── process application state
            │
            └── save transaction to Archive

This gives the application a locally retrievable copy.

It can also make that data available to other peers through the Archive service.

## 48. Distributed Applications Should Expect Partial Availability

A Saito application should assume that peers can have different amounts of data.

For example:

    Peer A
        recent transactions

    Peer B
        old Archive data

    Peer C
        Store database

    Peer D
        no relevant module

The application may therefore need to combine sources.

A common pattern is:

    1. Check local state.
    2. Check local Archive/database.
    3. Check appropriate remote peers.
    4. Cache useful results locally.
    5. Fall back gracefully when data cannot be obtained.

This is particularly important for applications such as social feeds, search, marketplaces, and historical browsers.

## 49. Web Serving Does Not Define Application Authority

A Saito module can expose web content through the Node runtime.

For example:

    node/mods/example/web/

can be served by the Node application.

This can make an application appear to follow:

    browser
        ↓
    web server
        ↓
    application

But the web server does not necessarily contain the application's authoritative data.

The browser may load Saito and then execute the same module locally.

The module may subsequently obtain data from:

    local state
    remote peers
    Archive
    blockchain
    external services

The HTTP server may therefore function primarily as:

    bootstrap / delivery mechanism

rather than as:

    application authority

This distinction is fundamental to understanding Saito applications.

## 50. Dynamic Modules and Browser-Resident Applications

A module can also be installed dynamically into the browser.

This creates another important possibility:

    Saito website
          │
          ▼
    browser loads Saito
          │
          ▼
    dynamic module installed locally
          │
          ▼
    module executes in browser

The application does not necessarily need to exist as a server-side module on the server that delivered the page.

This makes it possible for an application to be distributed as code and executed locally while still using Saito networking and storage mechanisms.

A server may simply provide the initial entry point.

The apparent URL therefore does not necessarily tell you where the application's data or execution actually lives.

## 51. The 404 Bootstrap Pattern

A particularly unusual Saito pattern can arise when a browser requests an application that the server does not have installed.

The server may return its 404 page.

That page can still contain Saito and allow the browser to initialize the Saito runtime.

A dynamic module can then take over locally and render its own application.

Conceptually:

    Browser requests /some-app
            │
            ▼
    server does not have module
            │
            ▼
    404 / Saito bootstrap page
            │
            ▼
    Saito starts in browser
            │
            ▼
    dynamic application module
            │
            ▼
    application renders locally

This is another example of why a Saito application cannot always be understood by looking at the traditional server/frontend boundary.

The application may look like a website while actually being a peer-to-peer application running locally in the browser.

## 52. What the Blockchain Is and Is Not

The blockchain should be treated as the authoritative source for blockchain state.

It is not a general-purpose application database.

Use blockchain transactions when the application needs blockchain properties.

Do not put data on-chain simply because the application is decentralized.

For example:

    payment
        → blockchain

    signed public action
        → blockchain

    consensus-visible state transition
        → blockchain

    large image
        → usually not blockchain

    UI preference
        → app.options

    search index
        → module database

    historical transaction retrieval
        → Archive/storage

These are architectural defaults, not absolute restrictions.

## 53. Events Are Not State

An event tells another part of the application that something happened.

It does not necessarily preserve the thing that happened.

For example:

    app.connection.emit('something-updated');

does not itself provide durable application state.

The receiving component should obtain the current state from the appropriate source.

This is important because an AI may otherwise create event-driven systems in which:

    event
        =
    state

That is not the Saito model.

The event is a notification.

The application state remains in the object, database, transaction, blockchain, options, or other source that owns it.

## 54. Avoid Rebuilding Conventional Web Architecture

A developer coming from conventional web development may instinctively create:

    Controller
    Service
    Repository
    API
    Database
    Frontend
    Event bus
    Message dispatcher

Saito generally does not require these layers.

The normal architecture is closer to:

    Module
       │
       ├── domain objects
       ├── transaction functions
       ├── UI components
       ├── application state
       └── app.* APIs

Communication is handled through:

    transaction
    peer
    service
    respondTo
    local connection

rather than through a newly invented internal framework.

The preferred implementation is normally the smallest architecture that directly expresses the application's actual domain.

## 55. A Module Should Be Able to Stand Alone

A good Saito module should generally remain valid when unrelated optional modules are removed.

This is an important consequence of the distributed application model.

If:

    Module A

only works when:

    Module B

is installed, the developer should ask whether A really needs B or merely needs a capability that B happens to provide.

Prefer:

    A → capability

over:

    A → B

when B is optional.

This makes modules:

- easier to install;
- easier to distribute;
- easier to test;
- easier to reuse;
- more robust across different Saito installations.

## 56. Application Architecture Is a Set of Tradeoffs

There is no universally correct place to put application data.

For example, consider a price feed.

One implementation might use:

    server database
        ↓
    handlePeerTransaction()

Another might use:

    signed transaction
        ↓
    Archive

Another might use:

    signed transaction
        ↓
    blockchain

Another might use:

    external oracle
        ↓
    local cache

All can be legitimate.

The correct choice depends on:

    Who produces the data?
    Who consumes it?
    Who must trust it?
    How quickly does it change?
    How long must it survive?
    Does it need blockchain verification?
    Does it need global availability?
    Can it be reconstructed?
    Who provides the storage?
    What happens if that provider disappears?

Saito provides the mechanisms.

The module chooses the architecture.

## 57. A Mental Model for Saito Storage

A useful way to remember the major storage mechanisms is:

    app.options
        ↓
    small local persistent state

    wallet / WASM
        ↓
    cryptographic identity + UTXO/wallet state

    keychain
        ↓
    relationships with other identities

    module memory
        ↓
    current runtime/application state

    module SQL
        ↓
    structured application-owned data

    Archive
        ↓
    stored transactions

    blockchain
        ↓
    consensus-visible history/state

    peer module
        ↓
    remote application-owned data/service

    external storage
        ↓
    data outside Saito

These categories can overlap.

For example:

    blockchain transaction
            ↓
    Archive
            ↓
    local module cache
            ↓
    UI object

The same underlying information can therefore have multiple representations.

The developer should know which representation is authoritative and which are derived.

## 58. The AI Developer Rule

When an AI is asked to add a feature to Saito, it should not begin by choosing a database schema.

It should first determine:

    1. What is the application's domain object?
    2. Who owns the data?
    3. Who needs to see it?
    4. Is it local or shared?
    5. Does it need blockchain authority?
    6. Does it need persistence?
    7. Does it need remote availability?
    8. How fresh must it be?
    9. Can it be reconstructed?
    10. What happens if the preferred peer is unavailable?

Only then should it choose:

    app.options
    wallet
    keychain
    memory
    module SQL
    Archive
    blockchain
    peer request
    external storage

The AI should not assume that every application needs:

    database + API + server

Nor should it assume that every application needs:

    smart contract + on-chain storage

Both assumptions are conventional patterns imported from other ecosystems.

Saito provides a broader set of mechanisms.

## 59. Architectural Boundaries to Keep Clear

The following distinctions should remain explicit in Saito application code.

### `app` vs module

    app
        → Saito runtime

    module
        → application

### wallet vs keychain

    wallet
        → my identity and spendable state

    keychain
        → relationships with other identities

### network vs connection

    app.network
        → remote peers

    app.connection
        → local process events

### blockchain vs Archive

    blockchain
        → consensus-visible chain state

    Archive
        → stored/retrievable transactions

### options vs database

    app.options
        → lightweight local persistence

    module SQL
        → structured application database

### on-chain vs off-chain

    on-chain
        → blockchain processing

    off-chain
        → direct peer communication

### application state vs event

    state
        → information

    event
        → notification that something happened

### module vs optional module

    module
        → application

    optional module
        → capability that may or may not be installed

### peer vs transaction originator

    peer
        → transport relationship

    transaction signer
        → cryptographic origin

## 60. Practical Architecture Example

Suppose an application is a social application in which users publish posts.

A possible architecture is:

    User writes post
           │
           ▼
    Create transaction
           │
           ├── signed
           │
           ▼
    propagateTransaction()
           │
           ▼
    blockchain
           │
           ▼
    onConfirmation()
           │
           ├── update local application state
           │
           └── save transaction to Archive

A second user wants to view historical posts:

    UI
      │
      ▼
    local posts
      │
      ├── enough data?
      │
      └── no
           │
           ▼
    app.storage.loadTransactions()
           │
           ▼
    local / remote Archive
           │
           ▼
    posts

A third operation might use an off-chain peer request:

    User
      │
      ▼
    request peer for current information
      │
      ▼
    sendRequestAsTransaction()
      │
      ▼
    remote module
      │
      ▼
    handlePeerTransaction()
      │
      ▼
    module SQL database
      │
      ▼
    callback
      │
      ▼
    user

All three mechanisms can coexist in the same application.

## 61. Practical Architecture Example: Server-Backed Application

Suppose an application has a known operator who maintains the primary database.

The architecture can be:

    Browser
        │
        │ off-chain transaction
        ▼
    Application server peer
        │
        ▼
    Module SQL database

The server can answer requests through:

    handlePeerTransaction()

or the module's database request facilities.

The browser can cache responses locally.

This is effectively a client/server application implemented through Saito's peer architecture.

There is nothing inherently wrong with this design.

The important thing is to recognize that the server is an application peer, not a mandatory architectural layer imposed by Saito.

## 62. Practical Architecture Example: Distributed Application

Suppose there is no permanent application server.

The application might instead use:

    signed transactions
            │
            ▼
    Saito network
            │
            ├── user A
            ├── user B
            ├── Archive A
            ├── Archive B
            └── other peers

Each user can save useful transactions locally.

Archive nodes can retain historical transactions.

Peers can exchange information off-chain.

The application becomes more resilient to the disappearance of any particular server.

The tradeoff is that the application must explicitly deal with partial data availability.

## 63. The Most Important Question

For every nontrivial piece of data in a Saito application, ask:

> Where does this data live?

Then ask:

> Who needs to be able to retrieve it?

Then:

> What guarantees do they need?

Then:

> What happens if the preferred source is unavailable?

This sequence prevents many of the architectural mistakes that developers make when moving from centralized applications to peer-to-peer systems.

A server-based developer tends to assume:

    database exists

A blockchain developer may tend to assume:

    blockchain exists

A Saito developer needs to ask:

    which data,
    owned by whom,
    stored where,
    distributed how,
    available to whom,
    with what guarantees?

That is the central conceptual model for application data in Saito.

## 64. Summary

Saito applications are modules running inside a shared Saito runtime.

The runtime is exposed through `app`.

Modules use:

    app.wallet
    app.blockchain
    app.network
    app.storage
    app.keychain
    app.options
    app.modules
    app.connection
    app.core

Transactions provide a common structured communication object that can be used both on-chain and off-chain.

On-chain transactions are processed through the blockchain lifecycle, particularly `onConfirmation()`.

Off-chain transactions are delivered to modules through `handlePeerTransaction()`.

`app.connection` provides local process events and is not a peer network.

Data can live in:

    memory
    app.options
    wallet / WASM
    keychain
    module SQL
    Archive
    blockchain
    remote peers
    external storage

There is no single universal storage mechanism.

The blockchain is not a general-purpose database.

Archive is not the blockchain.

`app.options` is not a database.

A peer is not necessarily the transaction originator.

An event is not durable state.

A browser is not merely a remote frontend.

A module is not merely a controller.

Optional modules should be treated as optional capabilities rather than mandatory dependencies.

Most importantly, data availability is an explicit application architecture problem.

Before implementing a feature, determine:

    Who owns the data?
    Who needs it?
    Where does it live?
    How is it distributed?
    How persistent must it be?
    How fresh must it be?
    What is authoritative?
    Can it be reconstructed?
    What happens when the preferred source is unavailable?

Once those questions are answered, the appropriate Saito mechanism is usually much easier to identify.

The goal is not to force every application into one storage architecture.

The goal is to make the application's data ownership, persistence, distribution, and availability model explicit.
# Saito Framework — Core Architecture

## 1. Architecture Overview

Saito is a distributed application platform built around Saito Consensus.

`rust/saito-core` is the shared Rust implementation of the Saito protocol. It contains the consensus and network protocol logic used by different Saito client runtimes.

The repository contains two principal ways to host Core:

```text
                         SAITO-CORE
                     Saito Consensus
                           │
              ┌────────────┴────────────┐
              │                         │
       SAITO-RUST                  SAITO-WASM
       native host                WASM host
                                        │
                                   SAITO-JS
                                JS interface/runtime
                                        │
                                     NODE.JS
                              application runtime
                                        │
                                     MODULES
```

This is a dependency/hosting relationship, not a compilation sequence.

`Saito-Rust` and `Saito-WASM` both use the same `Saito-Core`. `Saito-Rust` is a native Rust client. `Saito-WASM` allows Core to run inside a JavaScript environment. `Saito-JS` exposes the WASM implementation to JavaScript. Node.js adds the application and module runtime.

A browser also uses the WASM path, normally with Core configured for light/SPV operation.

The central architectural rule is:

> Saito-Core implements the protocol. The surrounding layers provide the runtime environment and application platform.

---

## 2. Repository Components

| Component | Location | Primary role | Normal consumer |
|---|---|---|---|
| Saito-Core | `rust/saito-core/` | Saito Consensus and protocol implementation | Saito-Rust, Saito-WASM |
| Saito-Rust | `rust/saito-rust/` | Native Core host / full protocol client | Node operators |
| Saito-WASM | `rust/saito-wasm/` | Core host compiled for JavaScript environments | Saito-JS |
| Saito-JS | `rust/saito-js/` | JavaScript interface and runtime around WASM | Node.js, browser |
| Node.js | `node/` | Full application runtime and module platform | Module/application developers |
| Modules | `node/mods/` | Application-specific functionality | Saito users/developers |

The five major components are not equivalent layers.

Core is the protocol implementation.

Saito-Rust and Saito-WASM are runtime hosts for Core.

Saito-JS is the JavaScript interface/runtime around the WASM host.

Node.js is the application platform built on that runtime.

---

## 3. Saito-Core

### Definition

Saito-Core is the Rust implementation of Saito Consensus.

It is a library, not a user-facing application.

Source:

```text
rust/saito-core/src/
```

Important areas include:

```text
core/consensus/
core/network/
core/storage/
core/process/
consensus_thread.rs
routing_thread.rs
verification_thread.rs
mining_thread.rs
```

### Responsibilities

Core contains the protocol-level logic required for nodes to operate Saito Consensus, including:

- blockchain and chain state;
- blocks;
- transactions;
- slips and UTXO processing;
- transaction and block validation;
- mempool processing;
- peer protocol;
- synchronization;
- routing;
- verification;
- mining and block production;
- protocol-level wallet/UTXO operations.

Core also defines the protocol messages exchanged between peers.

### Core does not own

Core does not contain:

- Saito application modules;
- module UI;
- HTTP application serving;
- module-specific databases;
- application-specific business logic;
- the Node.js application runtime.

Those responsibilities belong to higher layers.

### Core as the protocol boundary

A useful test is:

> Would changing this behavior change how independent Saito nodes communicate, validate state, reach consensus, synchronize, or produce blocks?

If yes, the behavior may belong in Core.

If it is specific to an application, it normally belongs in a module instead.

---

## 4. Saito-Rust

Saito-Rust is a native Rust runtime for Saito-Core.

```text
saito-core
     │
     ▼
saito-rust
     │
     ├── native networking
     ├── native storage
     ├── native scheduling
     └── full protocol node
```

It can run Saito Consensus without Node.js.

It does not provide the Node module system or the Saito dApp/application platform.

Its source is primarily:

```text
rust/saito-rust/src/
```

The native runtime supplies Core with environment-specific facilities such as networking, filesystem storage, and scheduling.

Saito-Rust and Node+WASM are therefore alternative full protocol runtimes. They share Core but do not share the application layer.

The repository establishes that Node+WASM can operate as a full protocol node when not configured for SPV/browser mode, while Saito-Rust can operate as a full protocol node independently of Node.js.

---

## 5. Saito-WASM

Saito-WASM is the WebAssembly host through which Saito-Core executes in JavaScript environments.

```text
Saito-Core
    │
    ▼
Saito-WASM
    ├── Core runtime
    ├── WASM bindings
    ├── WASM I/O host
    └── JavaScript bridge
```

Source:

```text
rust/saito-wasm/src/
```

Saito-WASM instantiates the Core processing components, including routing, consensus, verification, and mining.

It exposes WASM-bindgen interfaces such as:

```text
initialize()
process_timer_event()
process_msg_buffer_from_peer()
```

and WASM representations of protocol objects such as:

```text
WasmWallet
WasmBlockchain
WasmTransaction
```

It also provides the JavaScript bridge through `WasmIoHandler` and `MsgHandler`.

Therefore:

> Saito-WASM is not merely generated binding glue. It is the WASM runtime/host through which Saito-Core operates inside a JavaScript environment.

Generated artifacts under:

```text
rust/saito-wasm/pkg/
```

should not be edited directly.

---

## 6. Saito-JS

Saito-JS is the JavaScript interface/runtime around Saito-WASM.

```text
JavaScript
    │
    ▼
Saito-JS
    │
    ▼
Saito-WASM
    │
    ▼
Saito-Core
```

Source:

```text
rust/saito-js/
```

Saito-JS is handwritten TypeScript. It is not equivalent to generated `wasm-bindgen` JavaScript.

Its responsibilities include:

- loading the WASM implementation;
- connecting JavaScript objects to WASM types;
- wrapping WASM protocol objects;
- providing the `getCore()` facade;
- managing JavaScript-side networking;
- managing JavaScript-side timers;
- implementing `SharedMethods`;
- translating Core I/O requests into JavaScript operations.

For example, the JavaScript networking path is conceptually:

```text
WebSocket
   ↓
Saito-JS
   ↓
Saito-WASM
   ↓
Saito-Core routing
```

The reverse path is:

```text
Saito-Core
   ↓
Saito-WASM I/O
   ↓
Saito-JS / SharedMethods
   ↓
WebSocket
```

Saito-JS therefore has two roles:

1. JavaScript interface to Core.
2. JavaScript-side runtime integration for Core.

It is not a second consensus implementation.

---

## 7. Node.js

Node.js is the Saito application runtime.

The Node implementation uses Saito-Core through the WASM/Saito-JS path:

```text
Saito-Core
    ↓
Saito-WASM
    ↓
Saito-JS
    ↓
Node Saito runtime
    ↓
Modules
```

Primary source:

```text
node/
```

Important areas include:

```text
node/apps/
node/lib/saito/
node/lib/templates/
node/mods/
node/config/
```

Node provides functionality that is outside the protocol implementation, including:

- module loading and lifecycle;
- application APIs;
- HTTP serving;
- WebSocket integration;
- module web content;
- application storage;
- module databases;
- keychain/application identity behavior;
- browser integration;
- Node-side wrappers around protocol objects.

For example, a module containing:

```text
node/mods/redsquare/web/
```

can have its web content served by the Node application runtime.

Node is therefore a full Saito client and application host, not merely a UI or API layer sitting in front of a separate Rust node.

---

## 8. Core I/O Boundary

Saito-Core must operate in multiple runtime environments. It therefore does not directly own environment-specific operations such as OS sockets or JavaScript timers.

The Core host supplies these operations through its I/O interface.

Conceptually:

```text
                 Saito-Core
                     │
                InterfaceIO
                     │
          ┌──────────┴──────────┐
          │                     │
    Saito-Rust              Saito-WASM
          │                     │
     native I/O            JavaScript I/O
```

Core requests host operations such as:

- send/connect/disconnect;
- fetch blocks;
- read/write persistent data;
- process application API calls;
- emit interface events;
- save/load wallet state;
- report supported services.

The host implements those operations.

This boundary allows the same Core protocol implementation to operate in native Rust and JavaScript/WASM environments.

Most application developers never need to work directly with `InterfaceIO`.

---

## 9. Core Networking and Routing

Core contains the protocol-level network implementation.

The distinction between the protocol message and the transport event is important.

### Network messages

`Message` represents the Saito peer wire protocol.

Examples include:

- handshake;
- transaction;
- block;
- blockchain request;
- block request;
- synchronization messages;
- service information;
- application messages.

These messages originate from another peer and are serialized for transmission.

### Network events

`NetworkEvent` represents events from the host/network environment, such as:

- peer connection;
- peer disconnection;
- received network buffer;
- block-fetch requests/results;
- transport-related events.

### Internal Core events

Core also has internal event types used to communicate between its processing components, including:

```text
RoutingEvent
ConsensusEvent
VerifyRequest
MiningEvent
```

These are not peer wire messages.

### Routing

The routing thread is the Core ingress/dispatch mechanism.

At a high level:

```text
Peer / host input
       ↓
Routing
       ├── verification
       ├── consensus
       ├── synchronization
       ├── blockchain processing
       └── application interface
```

The routing thread is not the consensus engine and not the mining engine. It routes protocol inputs to the appropriate Core subsystem.

Module developers do not interact with the routing thread directly.

---

## 10. `app` and the Node Saito API

Node exposes the Saito runtime to modules through `app`.

The principal developer-facing objects include:

```text
app.wallet
app.blockchain
app.network
app.modules
app.connection
```

These objects provide the normal application API.

The Node classes correspond semantically to the underlying protocol objects:

```text
Wallet
Blockchain
Transaction
Slip
Block
```

This correspondence is intentional.

A developer can reason about a `Transaction` or `Wallet` without needing to care whether a particular operation is ultimately implemented in Node JavaScript, Saito-JS, WASM, or Core.

Node-side classes may wrap or extend the underlying WASM/Saito-JS representations with application-specific behavior.

This is not a second implementation of consensus. It is the application-facing layer around the protocol objects.

---

## 11. `app.core`

`app.core` is the lower-level JavaScript facade over the WASM-hosted Core.

```text
app.core
   ↓
Saito-JS getCore()
   ↓
Saito-WASM
   ↓
Saito-Core
```

It is not the Rust `saito-core` crate.

Normal modules should generally use:

```text
app.wallet
app.network
app.blockchain
```

rather than calling `app.core` directly.

`app.core` is appropriate when an application needs a capability exposed by Core that is not provided through the normal Node abstraction.

Examples found in current modules include:

```text
app.core.network.getPeers()
app.core.blockchain.getBlock()
app.core.blockchain.getBlocks()
app.core.scripting.*
app.core.wallet.getPendingBalance()
```

Administrative and protocol-inspection applications naturally use more of `app.core` because they need direct access to protocol state.

The architectural rule is therefore:

> `app.*` is the normal application interface. `app.core` is the lower-level Core interface exposed when direct protocol functionality is required.

---

## 12. Full Node and Light Client

The same WASM/Core implementation can run in different configurations.

### Node full client

The Node server normally runs with:

```text
browser_mode = false
spv_mode = false
```

In this configuration it can participate directly in full Saito Consensus, including block production.

### Browser/light client

The browser path enables browser/SPV operation.

The browser uses the same Core implementation but with capabilities appropriate to a light client.

This changes protocol behavior such as block production and full-chain storage.

The browser also lacks many Node-specific capabilities, such as the server filesystem and Express HTTP server.

### Module implication

The same module can run in both environments.

Therefore module code must not assume that every runtime has every capability.

The correct response to an unavailable capability depends on the API involved; Saito does not provide a universal capability registry.

This runtime distinction is part of the application architecture and is covered more fully in the application/module documentation.

---

## 13. Distributed Application Model

A Saito module is distributed code.

The same module can execute on multiple peers:

```text
Peer A                         Peer B
Module A                       Module A
   │                              │
   └──── peer transaction ───────►│
                                  │
                            application logic
```

The browser is not merely a remote UI attached to a server-side copy of the module.

The same module code may execute in the browser and on a Node server.

Communication between module instances can occur through:

- on-chain transactions;
- off-chain peer-to-peer transaction messages.

A module commonly defines the structure of a transaction it creates and the logic that processes that transaction when received.

For example:

```text
createXTransaction()
        ↓
transaction/message
        ↓
peer network
        ↓
receiveXTransaction()
```

This is one of the most important architectural differences between Saito and conventional client/server application frameworks.

An AI should not automatically introduce REST controllers, server endpoints, RPC layers, or separate client/server application implementations when a Saito peer/message mechanism already provides the required communication.

---

## 14. Where New Code Belongs

The default location for new application functionality is a module:

```text
node/mods/<module>/
```

A module can contain its:

- application logic;
- transaction/message handling;
- UI;
- module-specific storage;
- application-specific domain objects.

The framework should normally be treated as infrastructure consumed by the module.

### Placement decision

| Requirement | Default location |
|---|---|
| New dApp/application feature | `node/mods/<module>/` |
| Module-specific UI | module UI/web files |
| Shared application/runtime capability | `node/lib/saito/` or appropriate framework component |
| Shared UI component | Saito UI component layer |
| New protocol/consensus behavior | `rust/saito-core/` |
| Core functionality exposed to WASM | `rust/saito-wasm/` |
| Core functionality exposed to JS | `rust/saito-js/` |
| Native protocol-runtime behavior | `rust/saito-rust/` |

The AI should choose the narrowest layer that owns the requested responsibility.

A module should not modify framework code merely to make its own implementation more convenient.

---

## 15. Architectural Invariants for AI Agents

The following assumptions should be treated as incorrect unless a specific task requires them.

### The stack is not:

```text
Core → Rust → WASM → JS → Node
```

Saito-Rust and Saito-WASM are sibling hosts of Saito-Core.

### Node does not require a separate Rust server

Node can run Core directly through WASM.

### WASM is not merely generated glue

Saito-WASM hosts the Core runtime and provides the WASM/JavaScript boundary.

### Saito-JS is not a consensus implementation

It provides the JavaScript interface/runtime around WASM.

### `app.core` is not the Rust crate

It is a JavaScript facade over the WASM-hosted Core.

### Modules should not normally reach Core directly

Use `app.wallet`, `app.network`, `app.blockchain`, and module APIs first.

### Browser and server are not separate application implementations

The same module can execute in both environments.

### Application logic does not normally belong in Core

If the feature is application-specific, implement it in the module.

### Generated artifacts are not authoritative source

Modify the source and rebuild generated output.

### Conventional web architecture should not be assumed

Do not introduce client/server duplication, REST middleware, controllers, service layers, repositories, or other abstractions unless the existing Saito architecture actually requires them.

---

## 16. Source and Build Relationships

The authoritative source relationships are:

```text
rust/saito-core/src/
        │
        ├──────────────► rust/saito-rust/
        │
        ▼
rust/saito-wasm/src/
        │
        ▼
rust/saito-js/
        │
        ▼
node/
        │
        ▼
node/mods/
```

The first branch is the native Rust runtime.

The second branch is the JavaScript/WASM runtime.

Important generated outputs include:

```text
rust/saito-wasm/pkg/
rust/saito-js/dist/
node/dist/
node/web/saito/saito.js
```

These are build outputs rather than the primary source of architecture.

For local development, the repository provides build/link mechanisms that rebuild the Rust/WASM/JS layers and connect them to Node. A change to Core therefore propagates through the WASM and JS layers before the Node application consumes it.

The exact build commands and development workflow belong in the Saito Build, Installation and Configuration document.

---

## 17. Architectural Decision Rule

When an AI receives a feature request, it should first classify the request before choosing a file to edit.

Use this sequence:

```text
Is this application-specific?
        │
       yes
        ↓
node/mods/<module>/

        no
        ↓
Is this a shared Node/application capability?
        │
       yes
        ↓
node/lib/...

        no
        ↓
Does it change Saito protocol/consensus behavior?
        │
       yes
        ↓
rust/saito-core/

        no
        ↓
Does it expose/host Core in WASM?
        │
       yes
        ↓
rust/saito-wasm/

        no
        ↓
Does it change the JS interface to Core?
        │
       yes
        ↓
rust/saito-js/
```

This is a placement heuristic, not a substitute for inspecting the existing implementation.

The default should be to make the smallest change in the narrowest layer that owns the responsibility.

---

## 18. Reference Map

| Concept | Primary implementation |
|---|---|
| Saito Consensus | `rust/saito-core/` |
| Core consensus | `rust/saito-core/src/core/consensus/` |
| Core networking | `rust/saito-core/src/core/network/` |
| Core routing | `rust/saito-core/src/routing_thread.rs` |
| Native Core runtime | `rust/saito-rust/` |
| WASM Core runtime | `rust/saito-wasm/` |
| JavaScript Core interface | `rust/saito-js/` |
| Node application runtime | `node/lib/saito/` |
| Node entry points | `node/apps/` |
| Module framework | `node/lib/templates/` |
| Applications | `node/mods/` |
| Normal wallet API | `app.wallet` |
| Normal network API | `app.network` |
| Normal blockchain API | `app.blockchain` |
| Lower-level Core facade | `app.core` |

## 19. Summary

Saito-Core is the shared implementation of Saito Consensus.

Saito-Rust hosts Core natively.

Saito-WASM hosts Core inside JavaScript environments.

Saito-JS exposes the WASM-hosted Core to JavaScript and supplies JavaScript-side runtime integration.

Node.js provides the full Saito application and module platform.

Modules provide application-specific behavior.

The normal development boundary is therefore:

```text
Protocol implementation
        ↓
Saito-Core

Runtime interface
        ↓
Saito-WASM / Saito-JS

Application platform
        ↓
Node.js

Application
        ↓
Module
```

For most feature development, start at the bottom of this application stack and move downward only when the required responsibility genuinely belongs to the framework or protocol.
# Saito Framework — Events and Services

## 1. Purpose

Saito applications communicate through several deliberately different mechanisms.

A module may need to:

- react to something that happened inside the current application;
- ask another installed module to provide a capability;
- access a specific installed module directly;
- communicate with another Saito node;
- discover which peers provide a particular service;
- send an off-chain application request;
- publish a transaction onto the blockchain;
- react to blockchain events.

These mechanisms are not interchangeable.

In particular:

- `app.connection` is a local event mechanism.
- `respondTo()` is an in-process capability interface between modules.
- `returnModule()` gives direct access to a named module instance.
- peer services are network-level advertisements made during the peer handshake.
- `sendRequestAsTransaction()` sends an off-chain transaction-shaped application request.
- `propagateTransaction()` attempts to publish a transaction through the blockchain.
- `onConfirmation()` reacts to blockchain inclusion.
- hierarchical `render()` / `attachEvents()` is generally preferable to using global events to coordinate ordinary UI composition.

A Saito developer, and especially an AI developer, should choose among these mechanisms according to what is actually being communicated and where it needs to go.

Saito does not have one universal event bus, RPC system, service registry, or dependency-injection layer.

---

## 2. The Core Communication Model

A useful high-level model is:

    LOCAL APPLICATION
    ├── app.connection
    │      Local events
    │
    ├── respondTo()
    │      Ask installed modules for a capability
    │
    └── returnModule()
           Direct access to a named module instance

    REMOTE NODE
    ├── Peer Services
    │      Peer announces capabilities during handshake
    │
    └── sendRequestAsTransaction()
           Off-chain transaction-shaped request
           ↓
           ApplicationMessage
           ↓
           handlePeerTransaction()

    BLOCKCHAIN
    └── propagateTransaction()
           Transaction gossip
           ↓
           Mempool
           ↓
           Block
           ↓
           onConfirmation()

These mechanisms have different semantics.

Do not replace one with another simply because they all involve "messages."

---

# 3. `app.connection`: Local Events

`app.connection` is the event mechanism for the current Saito application instance.

The implementation is a local JavaScript `EventEmitter`.

Conceptually:

    module/component
          │
          │ emit()
          ▼
    app.connection
          │
          ├── listener
          ├── listener
          └── listener

It does not send messages to other Saito nodes.

It does not serialize messages for network transmission.

It does not persist messages.

It does not put anything on the blockchain.

It is process-local in Node and browser-tab-local in the browser.

Any module or component with access to `app` can emit or listen for events.

For example:

    this.app.connection.emit('some-event', data);

and:

    this.app.connection.on('some-event', (data) => {
      ...
    });

The underlying implementation is `Connection extends EventEmitter`.

There is no network routing associated with `app.connection`.

If no listener exists, the event simply has no effect.

Listener execution follows normal EventEmitter semantics, including listener registration order and normal listener error behavior.

A practical concern is listener management. Adding listeners repeatedly during rendering can create leaked or duplicated listeners.

The connection object should therefore not be treated as a generic mechanism for continuously coordinating application state.

---

# 4. Core Events Can Reach `app.connection`

`app.connection` is not limited to events manually emitted by modules.

Saito Core can generate events that travel upward through the Saito stack.

The general path is:

    Saito Core
        ↓
    Saito WASM
        ↓
    Saito JS
        ↓
    Node/browser application
        ↓
    app.connection
        ↓
    modules/components

This allows application components to listen for events originating in lower layers of the framework.

This is one reason `app.connection` is useful.

Examples of events used in the application include events associated with:

- wallet updates;
- transaction saving;
- keychain changes;
- encryption/key exchange;
- opening chat;
- Registry updates;
- Store operations;
- relay messages;
- wallet payment events;
- blockchain/application state changes.

The exact event names and payloads are application APIs and should be inspected before use.

---

# 5. Legacy `sendEvent()` / `receiveEvent()`

Older Saito module code may use:

    sendEvent()
    receiveEvent()

These are legacy wrappers around the application's connection mechanism.

The current `ModTemplate` implementation marks these APIs as deprecated and directs developers toward:

    app.connection.emit()
    app.connection.on()

Existing modules still use the legacy functions, so an AI modifying existing code may encounter them.

Do not assume that seeing `sendEvent()` means there is a separate networking mechanism.

It is local event communication.

When writing new code, prefer the current `app.connection` interface.

---

# 6. Events Are Not a General UI Architecture

Saito makes it easy to use events to make UI components react to things.

That does not mean that every UI interaction should be implemented with global events.

A common legacy pattern is:

1. initialize a UI component;
2. register an event listener;
3. wait for some global event;
4. modify or display the component when the event arrives.

This can work, but it can also create difficult-to-understand behavior.

A Saito runtime can have many applications and modules active simultaneously.

For example, an application can create an overlay that listens for a global event even when the user is not actively using that application. If another module emits that event, the unused application's overlay may react.

This makes the behavior of the UI dependent on events that are not obviously related to the component's current state.

For ordinary UI composition, prefer hierarchical component rendering.

A typical pattern is:

    parent.render()
        ↓
    parent writes itself into DOM
        ↓
    child.render()
        ↓
    child writes itself into DOM
        ↓
    child.attachEvents()

A component should generally own its subcomponents.

`render()` establishes the component's current DOM representation.

`attachEvents()` establishes the interaction handlers associated with that representation.

This is generally easier to reason about than using global events to coordinate every UI component.

Events remain appropriate when there is an actual event to observe.

They are especially useful for specific application or framework events, including situations where a component genuinely needs to react to an event originating outside its rendering hierarchy.

The important distinction is:

> Events are available for communication. They are not a requirement that all communication become event-driven.

---

# 7. `respondTo()`: In-Process Module Capabilities

`respondTo()` is Saito's primary mechanism for asking installed modules whether one of them provides a particular capability.

It is local.

It is synchronous.

It does not communicate with another node.

It does not enter the blockchain.

It does not persist anything.

Conceptually:

    Consumer Module
          │
          │ "Who responds to X?"
          ▼
    app.modules
          │
          ├── Module A → null
          ├── Module B → object
          ├── Module C → null
          └── Module D → object

A module can implement:

    respondTo(request_type, obj)

and return an object when it supports that request type.

The default implementation returns `null`.

The request type is a string.

For example:

    respondTo('arcade-games', ...)

or:

    respondTo('user-menu', ...)

or:

    respondTo('redsquare-profile', ...)

The returned object is an application-defined interface.

There is no universal formal type system for these interfaces.

The consumer and provider need to agree on:

- the request string;
- the arguments;
- the returned object;
- the methods/properties exposed by that object.

This makes `respondTo()` similar to a private, informal module API.

---

# 8. Naming `respondTo()` Requests

Request names should make their purpose obvious.

Examples include:

    saito-header
    user-menu
    game-menu
    arcade-games
    crypto-logo
    media-request
    giphy
    saito-nft-media
    saito-return-key
    saito-moderation-app
    default-league
    redsquare-profile
    dream-controls

A useful convention is either:

    obvious-capability-name

or:

    module-name-capability

The latter is useful when the capability belongs clearly to a particular application.

For example:

    arcade-games

communicates that the Arcade application is exposing an interface for games.

The important principle is that the string is an API identifier.

Do not invent arbitrary request strings without understanding the interface expected by the provider.

---

# 9. `respondTo()` Can Have Multiple Providers

`respondTo()` does not necessarily identify one unique provider.

Several installed modules can respond to the same request.

The module system provides mechanisms for retrieving the responding modules or their response objects.

Conceptually:

    app.modules.respondTo(request, obj)

returns responding modules.

A related interface:

    app.modules.getRespondTos(request, obj)

returns response objects together with identifying information such as the module name.

Consumers may then choose how to use the results.

Examples include:

- combining multiple menu entries;
- iterating over all game providers;
- selecting the first available logo;
- collecting multiple UI components;
- selecting a particular implementation.

There is no universal priority system imposed by `respondTo()`.

The consumer defines the semantics.

Therefore an AI must inspect the actual consumer before assuming that only one module can respond.

---

# 10. `respondTo()` Is Not a Network Request

Do not confuse:

    respondTo()

with:

    sendRequestAsTransaction()

They operate at different layers.

`respondTo()` asks:

> Does an installed module in this application provide this capability?

`sendRequestAsTransaction()` asks:

> Can I send this application request to another Saito node?

The first is local and synchronous.

The second is networked and asynchronous.

They are not local and remote versions of the same API.

---

# 11. `returnModule()`: Direct Module Access

`returnModule()` returns the live instance of a named module.

Conceptually:

    app.modules.returnModule('Archive')

means:

    find the module whose name is "Archive"
    and return its module instance.

If the module is not present, it returns `null`.

This is fundamentally different from `respondTo()`.

`respondTo()` asks:

> Who provides this capability?

`returnModule()` asks:

> Give me this particular module instance.

The coupling is therefore much stronger.

For example:

    returnModule('Vault')

hardcodes the dependency on a module named `Vault`.

The consumer now knows that:

- a module named Vault exists;
- that module is expected to be installed;
- the desired functionality is exposed directly by that module instance.

---

# 12. `returnModule()` Should Usually Be Avoided for Dependencies

`returnModule()` is not inherently invalid.

There are legitimate cases where a module needs access to a specific module's methods.

However, new code should generally prefer a `respondTo()` interface when the goal is to allow one module to provide functionality to another.

A useful mental model is:

> `returnModule()` is the poor man's `respondTo()`.

The problem with direct module dependencies is that they make applications fragile.

If Module A contains:

    let mod = this.app.modules.returnModule('ModuleB');

then Module A has encoded an assumption that Module B exists.

Saito applications should not generally assume that arbitrary modules are installed.

The Saito runtime can contain different combinations of modules.

A missing optional module should not cause the entire application to crash.

If direct module access is genuinely necessary, check the result:

    let mod = this.app.modules.returnModule('ModuleB');

    if (mod) {
      ...
    }

Do not blindly invoke methods on an assumed module instance.

---

# 13. Why `respondTo()` Is Preferable

Suppose an application wants to allow other modules to add games.

A direct dependency might look conceptually like:

    let arcade = this.app.modules.returnModule('Arcade');

    arcade.addGame(...);

This requires the consumer to know that the Arcade module exists.

A capability interface instead allows the application to say:

    respondTo('arcade-games', ...)

The Arcade module can provide an object describing the interface.

The advantage is that the dependency becomes capability-based rather than module-name-based.

Other modules can implement the same interface if appropriate.

The consumer does not need to know which module provides it.

This is especially important in Saito because modules are applications that users and operators may install in different combinations.

---

# 14. `returnModule()` During Initialization

Direct module access becomes especially problematic during initialization.

Saito creates module instances and then initializes them.

Conceptually:

    create module A
    create module B
    create module C
    ...
    initialize module A
    initialize module B
    initialize module C
    ...

The precise module list and initialization sequence are controlled by the configured module set.

A module can therefore exist in the module array without having completed initialization.

During module initialization, another module may not yet have:

- initialized its database;
- established its internal state;
- initialized its UI;
- completed its own dependencies.

Directly calling another module during initialization can therefore create ordering problems.

Modules that provide foundational services to other modules can make this particularly visible.

Historically, developers have sometimes addressed this by carefully ordering modules in the configuration.

That can work, but it increases coupling.

The preferred architectural approach is to use the appropriate lifecycle mechanism and capability interface rather than assuming arbitrary initialization order.

---

# 15. Services in Saito

The word "service" has a specific meaning in Saito.

It should not be conflated with `respondTo()`.

It should not be conflated with `returnModule()`.

A Saito application can provide a network service.

Examples include:

    archive
    vault
    recovery

A module can expose services through its `returnServices()` implementation.

Conceptually:

    module
       ↓
    returnServices()
       ↓
    ["archive", "vault", ...]

The services are then incorporated into the peer's service information.

---

# 16. Peer Services

Peer services are network-level capability advertisements.

When two Saito nodes connect, the handshake communicates the services that the peer claims to provide.

Conceptually:

    Node A
       │
       │ handshake
       ▼
    Node B
       │
       └── services:
             ["archive", "vault"]

Node A can then record that Node B advertises those services.

This means:

> You can try sending requests associated with this service to this peer.

It does not mean:

> The peer has cryptographically proven that it actually operates this service.

The service list is an advertisement.

A malicious or malfunctioning peer can claim to provide a service and then fail to respond.

Applications must therefore tolerate the possibility that an advertised service is unavailable or nonfunctional.

---

# 17. Peer Services Are Not `respondTo()`

The same word "service" can appear around several different mechanisms, but these mechanisms should remain distinct.

`respondTo()`:

    local module
        ↓
    capability request
        ↓
    object / null

Peer service:

    remote peer
        ↓
    handshake service advertisement
        ↓
    application records peer
        ↓
    application sends request
        ↓
    remote module may respond

There is no single service registry connecting these concepts.

A peer service is a property advertised by a remote node.

A `respondTo()` interface is a capability provided by a module in the current application.

---

# 18. Service Advertisements Are Not Proof

A service advertisement is useful because it allows applications to coordinate.

For example:

> This peer says it runs Archive.

An application such as RedSquare can then consider that peer as a source of archived transactions.

But there is no cryptographic guarantee that the peer actually has the Archive module or will answer Archive requests.

The service announcement should therefore be understood as discovery information, not authorization or proof.

The application remains responsible for handling:

- no response;
- malformed response;
- unavailable service;
- temporary failure;
- a peer that advertises a service but does not actually provide it.

---

# 19. `onPeerServiceUp()`

Modules can respond to the appearance of advertised peer services through:

    onPeerServiceUp(app, peer, service)

This is particularly useful for applications that need to obtain data from remote service providers.

The sequence is approximately:

    peer connection
        ↓
    handshake
        ↓
    peer service information
        ↓
    onPeerServiceUp()
        ↓
    module records peer
        ↓
    module sends request

The event is therefore an important synchronization point.

Before a peer advertises the service, the application should not assume that the peer is ready to handle requests for that service.

---

# 20. The Archive Loading Pattern

A useful application pattern is:

    1. Render UI.
    2. Show loading state or cached local content.
    3. Connect to peers.
    4. Receive onPeerServiceUp() for Archive peers.
    5. Add suitable peers to the application's service-peer list.
    6. Request initial remote data.
    7. Process returned transactions.
    8. Update application state.
    9. Re-render.

This allows applications to start quickly using local information while waiting for remote service availability.

It is especially useful for applications such as social applications that fetch historical transactions from Archive nodes.

The UI decision after remote data arrives is application-specific.

If the user has already started interacting with the application, replacing the entire interface may be undesirable.

If the interface is still displaying a loading state, re-rendering with the newly retrieved data is usually straightforward.

This is an application-state/UI-design issue rather than a special property of the service mechanism.

---

# 21. Multiple Service Peers

Applications should not necessarily rely on one peer.

A service advertisement gives the application another potential source.

A module can maintain its own collection of peers that advertise a required service:

    this.peers

When making requests, it can choose among those peers.

A simple strategy is round-robin selection.

For example:

    Peer A → Archive request
    Peer B → next Archive request
    Peer C → next Archive request
    Peer A → next Archive request

This provides redundancy.

If one advertised service is unavailable, another service peer may still respond.

RedSquare provides an important example of this general pattern.

There is no global Saito mechanism that automatically handles service failure for every application.

The application decides how to handle unresponsive peers.

---

# 22. Services Are Primarily for Off-Chain Application Data

Peer services are generally not a mechanism for publishing information onto the blockchain.

They are commonly used for things such as:

- retrieving archived transactions;
- retrieving application data;
- interacting with Vault;
- querying a Registry-like service;
- obtaining other off-chain application functionality.

For example:

    peer advertises archive
        ↓
    application asks peer for transactions
        ↓
    peer returns transaction-shaped data

The service itself is not a blockchain consensus service.

The peer is advertising:

> I run an application service that can answer these requests.

This distinction is essential.

---

# 23. `app.network` and `app.core.network`

Modules should normally use the application-level network interface:

    app.network

The application network class provides the module-facing interface to network functionality.

It exposes operations such as:

- peer access;
- peer lookup;
- service information;
- transaction propagation;
- off-chain requests;
- request callbacks.

Underneath, much of the actual networking is implemented by Saito Core/WASM.

The lower-level object:

    app.core.network

is the Core/WASM networking implementation.

The existence of the lower-level API does not mean application modules should normally bypass `app.network`.

The wrapper exists to provide the application-facing abstraction.

---

# 24. `sendRequestAsTransaction()`

The preferred modern way to send an application request to another node is:

    sendRequestAsTransaction()

The name is intentional.

Saito uses transaction-shaped objects as a common envelope for application messages.

This allows application developers to reason about data consistently:

    tx.returnMessage()

can retrieve the message associated with the transaction-shaped request.

The important distinction is between:

    transaction-shaped request

and:

    blockchain-published transaction.

`sendRequestAsTransaction()` does not mean:

> put this transaction into the blockchain.

It means:

> send this request as a transaction-shaped off-chain application message.

Conceptually:

    create transaction
        ↓
    tx.msg = {
      request: ...,
      data: ...
    }
        ↓
    serialize transaction
        ↓
    ApplicationMessage
        ↓
    peer
        ↓
    handlePeerTransaction()

The request does not enter the mempool merely because it is represented by a `Transaction`.

---

# 25. Why Transaction-Shaped Off-Chain Messages Matter

Using a transaction-shaped object for application communication has important advantages in a permissionless network.

A transaction provides a standardized conceptual envelope for:

- sender identity;
- recipient identity;
- message data;
- transaction signatures;
- cryptographic verification;
- transaction metadata.

This means the same basic object can support both:

    off-chain application communication

and:

    on-chain publication.

This is particularly useful when an application needs to move from:

    "I received this message from someone"

to:

    "I can cryptographically verify that this identity authored this message."

It also allows application protocols to build on transaction and signature conventions rather than inventing an entirely separate authentication format for every application.

Therefore:

> A transaction-shaped message is not merely a naming convenience. It is a useful common application envelope for a permissionless network.

---

# 26. `sendRequestAsTransaction()` and Signatures

Off-chain requests are not necessarily signed.

The default behavior is unsigned.

When an application needs the request to be authenticated as coming from a particular transaction identity, the request can be signed.

Conceptually:

    unsigned request

means:

    the request arrived through this peer connection,
    but the application does not have transaction-level authorship proof.

A signed request provides an additional cryptographic identity assertion.

The exact API supports requesting signature behavior where required.

The application should therefore decide whether it needs:

- transport/peer authentication;
- transaction-level authorship authentication;
- neither.

These are different properties.

---

# 27. `sendRequest()` and Legacy Naming

Saito's network code continues to expose older request APIs.

In the current implementation, `sendRequest()` and `sendRequestAsTransaction()` ultimately use the same Core request mechanism.

The distinction in their arguments is primarily API shape, including peer object versus public-key targeting.

The older functions remain because existing modules use them and the network layer supports them.

For new application code, prefer:

    sendRequestAsTransaction()

when sending an off-chain application request.

The important conceptual distinction is not between two different wire protocols.

It is:

    request
        =
    off-chain communication

versus:

    propagateTransaction()
        =
    blockchain publication attempt

---

# 28. `sendTransactionWithCallback()`

`sendTransactionWithCallback()` is the lower-level mechanism for sending an existing transaction-shaped object through the off-chain ApplicationMessage path.

It does not automatically sign the transaction.

The caller supplies the transaction in whatever authentication state is appropriate.

The request is serialized and sent through Core networking.

A callback is associated with a request identifier.

Conceptually:

    transaction
        ↓
    ApplicationMessage
        ↓
    msg_index
        ↓
    remote peer
        ↓
    Result / Error
        ↓
    callback

This API is useful when the caller needs control over the transaction object itself.

For ordinary request/response application code, `sendRequestAsTransaction()` is generally easier to reason about.

---

# 29. ApplicationMessage

At the Core networking layer, off-chain requests use an ApplicationMessage.

The conceptual structure is:

    ApiMessage
        msg_index
        data

The `data` contains the serialized transaction-shaped application message.

The wire protocol distinguishes:

    Message::ApplicationMessage
    Message::Result
    Message::Error

The request path is therefore approximately:

    JavaScript Transaction
          ↓
    serialize
          ↓
    ApplicationMessage
          ↓
    network
          ↓
    remote application
          ↓
    handlePeerTransaction()
          ↓
    response
          ↓
    Result / Error
          ↓
    callback

This is fundamentally different from blockchain transaction propagation.

---

# 30. Blockchain Transactions Use a Different Path

Blockchain publication uses:

    app.network.propagateTransaction(tx)

The conceptual path is:

    Transaction
        ↓
    Message::Transaction
        ↓
    network gossip
        ↓
    mempool
        ↓
    block
        ↓
    longest-chain processing
        ↓
    onConfirmation()

This path is associated with blockchain publication and consensus.

`sendRequestAsTransaction()` uses:

    Transaction
        ↓
    ApplicationMessage
        ↓
    peer
        ↓
    handlePeerTransaction()

It does not enter the blockchain merely because it is transaction-shaped.

This distinction should always be explicit when modifying Saito code.

---

# 31. `handlePeerTransaction()`

Incoming off-chain transaction-shaped application messages are delivered through the module system.

The application receives the serialized request and dispatches it through loaded modules.

Conceptually:

    ApplicationMessage
        ↓
    deserialize
        ↓
    Transaction
        ↓
    handlePeerTransaction()
        ↓
    Module A
    Module B
    Module C
    ...

There is not a universal central router that maps every request string to exactly one module.

Modules commonly inspect:

    tx.returnMessage()

and determine whether the request belongs to them.

For example, Archive handles:

    archive

and Vault handles requests such as:

    vault add file

Modules can return an indication that they responded.

If no module responds, the request can ultimately produce a no-response result.

---

# 32. Multiple Modules Can Receive a Peer Transaction

An incoming peer transaction is not automatically routed to exactly one module.

Loaded modules may receive the request and decide whether it is relevant.

Therefore a module should quickly determine whether it should process a request.

A module that does not handle the request should not perform unnecessary work.

This matters particularly because every module in the application can potentially inspect incoming application messages.

An AI should not invent a centralized RPC dispatcher unless a specific application actually requires one.

Saito's native pattern is module-level request handling.

---

# 33. Peer Identity Is Not Automatically Transaction Authorship

A peer is the network participant through which a message was received.

The peer has an authenticated public key associated with the connection.

That does not automatically mean that the transaction-shaped message was cryptographically authored by that same identity.

An unsigned ApplicationMessage can arrive through an authenticated peer connection without containing a transaction signature proving authorship.

Therefore:

    peer.publicKey

and:

    tx.from
    tx.signature

represent different concepts.

If an application requires transaction-level authorship, it should use a signed transaction and verify the signature as appropriate.

---

# 34. Relay and Forwarded Peer Transactions

There is an additional complication: Saito supports relay-style communication.

A node can receive a peer transaction and forward it to another node.

This is particularly useful for applications such as games where multiple users may be connected through a server.

The resulting topology can be:

    Player A
        ↓
    Relay node
        ↓
    Player B

The relay node is the transport intermediary.

It is therefore important not to assume that the node from which an application receives a peer transaction is necessarily the ultimate author of the transaction.

The transaction's own cryptographic identity and the transport peer are separate pieces of information.

---

# 35. Off-Chain Gaming

The distinction between off-chain and on-chain communication is especially useful in games.

A game can process moves through off-chain peer transactions for speed.

Conceptually:

    Game move
        ↓
    sendRequestAsTransaction()
        ↓
    peer / relay
        ↓
    handlePeerTransaction()
        ↓
    game state update

The same game can retain the ability to use blockchain transactions where decentralized publication or asset ownership matters.

For example:

    game interaction
        → off-chain

    asset transfer
        → on-chain

    NFT creation
        → on-chain

This allows the blockchain to be used for the parts of the application that actually require decentralized ledger semantics without forcing every interaction into block production.

---

# 36. Peer Services and Data Retrieval

A common pattern for an application that needs remote data is:

    1. Application initializes.
    2. UI renders.
    3. Cached local data is displayed if available.
    4. Peers connect.
    5. Peer announces required service.
    6. onPeerServiceUp() fires.
    7. Application records the peer.
    8. Application sends an off-chain request.
    9. Application receives transaction-shaped data.
    10. Application updates its state.
    11. UI re-renders.

This is especially useful with Archive.

An application can display local cached information immediately and then use remote Archive peers to retrieve additional information.

The service announcement provides discovery.

The request provides the actual communication.

The returned transaction-shaped objects provide the data.

These are separate steps.

---

# 37. `onPeerServiceUp()` Is Not a Guarantee of Good Service

`onPeerServiceUp()` means that the peer advertised a service during the connection process.

It does not guarantee that:

- the peer will answer;
- the peer has complete data;
- the peer will return the requested object;
- the peer will remain online;
- the peer will follow the application's expected protocol.

Applications that depend on remote services should therefore maintain normal distributed-system failure handling.

A robust application can maintain multiple peers for the same service and choose among them when making requests.

---

# 38. Module Lifecycle

Saito modules have a lifecycle that matters for communication.

A simplified conceptual sequence is:

    construct application
        ↓
    construct modules
        ↓
    modules.initialize()
        ↓
    blockchain initialization
        ↓
    network initialization
        ↓
    peer handshake
        ↓
    peer services
        ↓
    browser/UI initialization and rendering

The exact internal order has implementation details, but the critical rule is:

> Module construction is not the same thing as module initialization.

A module may exist as an object before it has completed initialization.

Therefore a module should not assume during its constructor that another module has:

- initialized its database;
- established its internal state;
- initialized its UI;
- completed its own dependencies.

---

# 39. Choosing the Correct Lifecycle Hook

Different dependencies become available at different stages.

If a module needs another local module's capability, use the module system after modules have been initialized and prefer `respondTo()` where appropriate.

If a module needs a specific remote peer service, use:

    onPeerServiceUp()

If a module needs blockchain publication, use the blockchain APIs and lifecycle hooks.

If a component needs a DOM structure, use:

    render()
    attachEvents()

Do not solve lifecycle problems by blindly calling other modules from constructors.

---

# 40. Communication Mechanism Comparison

| Mechanism | Scope | Direction | Sync | Persistence | Coupling | Blockchain |
|---|---|---|---|---|---|---|
| `app.connection.on/emit` | Current application | Broadcast | Synchronous listener execution | No | Event name | No |
| `sendEvent/receiveEvent` | Current application | Broadcast | Synchronous | No | Legacy event API | No |
| `respondTo()` | Installed modules | Capability query | Synchronous | No | Capability string | No |
| `getRespondTos()` | Installed modules | Capability query | Synchronous | No | Capability string | No |
| `returnModule()` | Installed modules | Direct access | Synchronous | No | Module name | No |
| Peer service | Remote node | Advertisement | Connection lifecycle | Connection only | Service string | No |
| `sendRequestAsTransaction()` | Remote node | Request/response | Asynchronous | No | Request type + peer | No |
| `sendTransactionWithCallback()` | Remote node | Request/response | Asynchronous | No | Transaction/message | No |
| `handlePeerTransaction()` | Remote node → modules | Incoming request | Asynchronous | No | Request handler | No |
| `propagateTransaction()` | Saito network | Gossip/publication | Asynchronous | If included | Transaction | Yes |
| `onConfirmation()` | Local module | Blockchain notification | Asynchronous | Blockchain | Module callback | Yes |

The table should not be interpreted as saying that one mechanism is universally better than another.

The mechanism should follow the communication requirement.

---

# 41. Practical Decision Guide

When another local module needs to expose a capability:

    respondTo()

When the consumer genuinely needs the live instance of a particular module:

    returnModule()

but avoid creating unnecessary hard dependencies.

When something has happened inside the current application and another component should react:

    app.connection

When a UI component simply needs to compose and manage its child components:

    render()
    attachEvents()

When another Saito node provides a service:

    peer service
        +
    onPeerServiceUp()
        +
    sendRequestAsTransaction()

When sending an application request to another node:

    sendRequestAsTransaction()

When the request itself needs transaction-level authentication:

    sendRequestAsTransaction()
        with appropriate signature behavior

When information needs decentralized blockchain publication:

    propagateTransaction()

When a module needs to react to blockchain inclusion:

    onConfirmation()

When a module needs to react to a blockchain reorganization:

    onChainReorganization()

---

# 42. Preferred Communication Hierarchy

A useful Saito-native hierarchy is:

    UI component relationship
        ↓
    render() / attachEvents()

    Local application event
        ↓
    app.connection

    Local module capability
        ↓
    respondTo()

    Direct access to a known module
        ↓
    returnModule()
    [use sparingly]

    Remote application service
        ↓
    peer service
        ↓
    onPeerServiceUp()
        ↓
    sendRequestAsTransaction()

    Decentralized publication
        ↓
    propagateTransaction()
        ↓
    blockchain
        ↓
    onConfirmation()

This hierarchy is not a rigid framework rule.

It is a way of identifying what kind of communication is actually taking place.

---

# 43. Services Are Not a Generic Service Registry

Saito does not currently provide one universal service registry.

There are separate mechanisms:

    returnServices()
        ↓
    peer service advertisement

and:

    respondTo()
        ↓
    local module capability

and:

    returnModule()
        ↓
    direct module lookup

They should not be collapsed into one generic concept.

The same word "service" is used because modules can provide network capabilities, but the mechanisms operate at different levels.

---

# 44. `returnServices()`

A module can provide peer service advertisements through:

    returnServices()

The network layer collects service information from modules and communicates the resulting service list during the peer handshake.

Examples include services such as:

    archive
    vault
    recovery

The service name is simply a string identifier.

There is no universal implementation automatically associated with every possible service name.

A service becomes meaningful because applications agree on what requests that service accepts and what responses those requests produce.

---

# 45. Service Discovery Is Application Coordination

The purpose of a peer service announcement is coordination.

For example:

    Peer A:
        "I provide archive."

Peer B can then decide:

    "This peer may be useful as an Archive source."

The peer does not need to prove this cryptographically.

The application can test the service by sending a request.

If the peer responds appropriately, it is useful.

If it does not, the application can try another peer.

This makes peer services lightweight discovery information rather than a trusted registry.

---

# 46. Registry as a Service Pattern

The Registry module illustrates an important distinction.

Registry data can be published through blockchain transactions and stored/indexed in the Registry application's database.

The Registry can also provide off-chain request functionality.

A peer advertising a Registry-related service is effectively telling other nodes:

> I run the application that can answer these Registry requests.

The application can then query the service rather than reconstructing every piece of application data directly from the blockchain.

This illustrates a general Saito pattern:

    blockchain
        ↓
    decentralized publication

    service
        ↓
    application-specific access to data

The two mechanisms complement each other rather than competing with each other.

---

# 47. Archive as a Service Pattern

Archive is another important example.

A node running Archive can advertise the Archive service.

Other applications can discover that service and request historical transaction data.

The data being retrieved is not necessarily being freshly published onto the blockchain.

The service is providing access to an application-level data store/index.

This is one reason Saito applications should not assume that every node contains every piece of historical application data.

The application can locate an appropriate service provider through peer service advertisements.

---

# 48. Vault as a Service Pattern

Vault provides another example of the same principle.

A peer advertising Vault is indicating that it provides Vault-related off-chain functionality.

The service does not mean:

    "the blockchain itself contains my files."

It means:

    "this node provides the Vault application/service and can process the relevant off-chain requests."

Blockchain transactions can still be used separately for things such as:

- NFT creation;
- ownership;
- access-control information;
- cryptographic references.

The service and blockchain therefore perform different jobs.

---

# 49. Common Communication Mistakes

### Mistaking `app.connection` for networking

This will cause code to appear to work locally while doing nothing across nodes.

Use network request APIs for remote communication.

### Mistaking `respondTo()` for RPC

`respondTo()` does not leave the current application.

It discovers local module capabilities.

### Mistaking peer services for proof

A service advertisement is a claim made during the handshake.

Applications should handle the possibility that the peer does not actually provide the service.

### Mistaking `returnModule()` for a safe dependency mechanism

Direct module lookup creates hard dependencies.

Prefer capability interfaces where possible.

### Assuming all modules are initialized during construction

Module construction and module initialization are different stages.

### Assuming `sendRequestAsTransaction()` means blockchain publication

It does not.

It creates an off-chain transaction-shaped application request.

### Assuming off-chain requests are signed

They are unsigned by default.

Use signing when transaction-level authorship authentication is required.

### Assuming the peer is the transaction author

A peer identifies the transport connection.

Transaction authorship is represented separately.

### Using global events for all UI behavior

This can produce hidden dependencies and cause inactive applications/components to react to events.

Prefer component ownership and rendering for normal UI composition.

### Assuming an advertised service will always respond

Remote services can fail.

Maintain multiple providers when the application needs redundancy.

---

# 50. Legacy and Transitional Mechanisms

AI developers will encounter mechanisms that remain in the repository even though newer patterns are preferred.

Important examples include:

    sendEvent()
    receiveEvent()

These are deprecated wrappers around the connection event mechanism.

Existing modules may still use them.

Likewise, older request APIs remain available:

    sendRequest()

and:

    sendTransactionWithCallback()

These remain useful for compatibility and for cases where their API shape is appropriate.

New code should generally prefer the clearer:

    sendRequestAsTransaction()

when issuing an off-chain application request.

The existence of legacy APIs does not mean that they should be removed during unrelated development.

When modifying existing code, preserve compatibility unless there is a specific reason to migrate the mechanism.

---

# 51. Current vs Legacy

Current/preferred mechanisms include:

- `app.connection.on()` / `emit()`
- `respondTo()`
- `getRespondTos()`
- `returnServices()`
- `onPeerServiceUp()`
- `sendRequestAsTransaction()`
- `sendTransactionWithCallback()` where direct transaction control is required
- `propagateTransaction()`
- hierarchical `render()` / `attachEvents()` for ordinary UI composition

Legacy or transitional mechanisms include:

- `sendEvent()` / `receiveEvent()`
- older request APIs retained for compatibility
- automatic legacy database request handling
- direct `returnModule()` dependencies where a capability interface would be more appropriate

`returnModule()` itself is not deprecated.

Its use should be considered carefully because of the dependency it creates.

---

# 52. AI Development Rules

When modifying or extending Saito, an AI should follow these rules.

1. Do not create a generic event bus.

Saito already has `app.connection`.

2. Do not create a generic RPC framework.

Saito already has transaction-shaped off-chain requests.

3. Do not use `app.connection` for communication between Saito nodes.

Use network requests.

4. Do not use `respondTo()` for remote communication.

It is an in-process module capability interface.

5. Do not use `returnModule()` merely because it is the quickest way to access another module.

First ask whether the dependency can be expressed as a `respondTo()` interface.

6. Do not assume arbitrary modules are installed.

Modules are applications and different installations can contain different module sets.

7. Do not assume another module has initialized merely because its object exists.

Respect initialization order and lifecycle.

8. Do not interpret a peer service advertisement as cryptographic proof.

Treat it as a coordination mechanism.

9. Do not assume an advertised service will respond.

Handle service failure.

10. Do not assume a peer is the transaction author.

Transport identity and transaction authorship are separate.

11. Do not assume `sendRequestAsTransaction()` publishes to the blockchain.

It is an off-chain request.

12. Do not assume off-chain requests are signed.

Signature authentication must be explicitly required when needed.

13. Use transaction-shaped messages where appropriate.

Saito intentionally uses transaction objects as a common envelope for application communication.

14. Use the blockchain when decentralized publication or consensus is actually required.

Do not put ordinary application RPC into blocks merely because the application already uses transactions.

15. Prefer component rendering over global event-driven UI composition.

Use events where there is a meaningful event to observe.

16. When using remote services, react to `onPeerServiceUp()`.

Do not assume that a peer can provide a service before it advertises it.

17. When multiple peers provide a service, consider maintaining a local peer list and selecting among them.

Do not assume there is only one provider.

18. Read the actual `respondTo()` interface before consuming it.

The request string and returned object shape are application-defined.

19. Check the result of `returnModule()`.

Do not blindly dereference an optional module.

20. Preserve existing legacy APIs when modifying unrelated code.

Do not perform architectural migrations merely because legacy code is encountered.

---

# 53. Communication Architecture Summary

Saito's communication architecture can be summarized as follows:

    LOCAL EVENTS

    app.connection
        │
        ├── module events
        ├── component events
        └── Core-generated events

    LOCAL CAPABILITIES

    respondTo()
        │
        └── installed modules
              ↓
          object / null

    DIRECT LOCAL MODULE ACCESS

    returnModule()
        │
        └── named module instance

    REMOTE SERVICE DISCOVERY

    returnServices()
        │
        ↓
    peer handshake
        │
        ↓
    peer.services
        │
        ↓
    onPeerServiceUp()

    REMOTE APPLICATION COMMUNICATION

    sendRequestAsTransaction()
        │
        ↓
    transaction-shaped message
        │
        ↓
    ApplicationMessage
        │
        ↓
    remote peer
        │
        ↓
    handlePeerTransaction()
        │
        ↓
    module
        │
        ↓
    Result / Error
        │
        ↓
    callback

    BLOCKCHAIN PUBLICATION

    propagateTransaction()
        │
        ↓
    Message::Transaction
        │
        ↓
    mempool
        │
        ↓
    block
        │
        ↓
    onConfirmation()

These are separate mechanisms with different purposes.

The most important architectural distinction is:

> Saito does not have one universal way of communicating. It has different native mechanisms for local events, local module capabilities, remote services, off-chain application messages, and blockchain publication.

A correct Saito application chooses among them according to the actual boundary that the communication needs to cross.

# Saito Framework — PKI, Identity, Wallets and Cryptography

## Purpose

This document explains how Saito handles cryptographic identity, wallets, public keys, private keys, transactions, peer authentication, encryption, key exchange, contacts, and cryptographic functions.

The purpose is not to prescribe a single application architecture.

Saito provides a set of cryptographic and networking tools. Applications choose which tools they need based on their communication, privacy, authentication, ownership, and data-availability requirements.

An AI developer working with Saito should therefore begin by asking:

- Who needs to communicate?
- What identity needs to be known?
- Does the application need to establish authorship?
- Does it need privacy?
- What information should be publicly available?
- What information should only be available to particular participants?
- Where does the data need to exist?
- Does the application need a user's wallet identity, a module/operator identity, or another keypair?
- Is the communication on-chain or off-chain?
- Does the transaction itself need to be signed?

Do not begin by assuming that every application needs accounts, passwords, sessions, JWTs, a centralized authentication server, or a database-backed user identity system.

Saito provides cryptographic primitives and APIs that allow applications to construct the communication and identity model they actually require.

---

# 1. The Fundamental Identity Model

A Saito network identity is a public/private key pair.

The public key is the network address.

Saito does not derive the user's network address by hashing the public key. The public key itself is used as the address.

Conceptually:

    private key
        │
        ├── proves control
        │
        ▼
    public key
        │
        ├── network address
        ├── transaction sender/recipient identity
        ├── wallet identity
        ├── peer identity after handshake
        └── application identity where appropriate

The private key proves control of the public key.

The public key can be distributed freely.

The private key must remain under the control of whoever is supposed to control that identity.

The current Core wallet uses a secp256k1 keypair. The wallet public key is represented as a Base58 public-key address. The private key is represented internally as the corresponding private key material.

The Core wallet is the underlying owner of the user's Saito cryptographic identity.

---

# 2. Public Keys Are Addresses

A Saito transaction is addressed using public keys.

Transactions have inputs and outputs containing slips associated with public keys.

For example, conceptually:

    Alice public key
          │
          ▼
    transaction input
          │
          ▼
    transaction output
          │
          ▼
    Bob public key

The public key is therefore not merely a username or account identifier. It is part of the actual transaction and UTXO model.

If an output belongs to a public key, control of the corresponding private key is what permits the owner to spend it.

Applications should normally use public keys directly when they need to identify Saito users.

Do not introduce an unnecessary intermediary account identifier simply because conventional web applications use:

    user_id → account → public key

The natural Saito model is:

    public key → identity

Applications may add names, profiles, handles, or other metadata on top of that identity.

Those additional identifiers do not replace the underlying public-key identity.

---

# 3. Wallet Identity

The Saito wallet contains the user's cryptographic identity and provides the application API for working with it.

The normal application-facing interface is:

    app.wallet

An application should use `app.wallet` for wallet operations rather than reaching directly into lower-level wallet implementation details.

The wallet API provides functionality including:

- obtaining the public key;
- obtaining the private key where the application legitimately requires it;
- creating transactions;
- creating unsigned transactions;
- signing transactions;
- managing wallet slips;
- managing NFTs;
- managing fees;
- importing and exporting wallet information;
- interacting with other supported wallet functionality.

The architectural rule is broader than the wallet itself:

> Treat the appropriate `lib/saito` class as the API for that class of Saito functionality.

Saito's implementation is layered. Rust/WASM may contain the underlying implementation, but application developers should normally use the JavaScript-facing Saito APIs rather than duplicating those implementations.

For example:

    app.wallet
        → wallet functionality

    app.crypto
        → cryptographic functionality

    app.keychain
        → relationships with other public keys

    app.network
        → network and peer functionality

The existence of lower-level implementations does not mean an application should bypass the public application API.

---

# 4. The Wallet Is Not a Conventional Web Account

A Saito wallet should not be conceptualized as:

    username
    password
    server-side account
    session token
    JWT

The fundamental identity is the cryptographic keypair.

A username may exist as an application-level naming layer.

A profile may exist as application data.

A contact may exist in the local Keychain.

None of those replace the wallet's public/private key identity.

This distinction is especially important when adapting conventional web development patterns to Saito.

A developer coming from a server-client architecture may instinctively build:

    login()
       ↓
    authenticate user
       ↓
    create session
       ↓
    associate session with database user

Saito applications frequently do not need this architecture.

The wallet already provides the user's cryptographic identity.

---

# 5. The Wallet and `app.options`

The live wallet is implemented through the Saito Core/WASM wallet infrastructure.

`app.options.wallet` contains a persistent representation of wallet information.

This distinction matters:

    live wallet state
        ↓
    Core / WASM wallet

    persistent application state
        ↓
    app.options.wallet

`app.options` is a general persistence mechanism and configuration document. It is not a secure hardware-backed key vault.

The current implementation persists wallet private-key material in wallet options. Browser persistence uses the application's local storage mechanism, while Node environments persist options through their configured storage.

Therefore:

> Treat wallet private keys as sensitive local state even though the current Saito persistence architecture stores them in application options.

Applications should not create redundant copies of the wallet private key merely because they need to sign transactions.

Use the wallet API.

---

# 6. Private Keys

Saito does not impose a universal rule that modules may never access private keys.

Whether a module should access a private key is an application and trust decision.

For ordinary consumer applications, the normal pattern is:

    user's browser
          ↓
    user's wallet
          ↓
    module
          ↓
    signed transaction

The module operates using the user's wallet identity.

There are also legitimate situations where a module or server operator needs a separate keypair.

For example, a server-operated service can have:

    service private key
          ↓
    service public key
          ↓
    service address

Users can send transactions to that public key.

The service can process those transactions and publish responses signed by its own identity.

The Registry is an example of this pattern.

The important distinction is therefore not:

> Modules must never have private keys.

The useful distinction is:

> Whose identity does this private key represent, and why does the application need to control it?

A consumer application normally uses the user's wallet identity.

A server-operated service may legitimately have its own operator identity.

A module distributed to users should not contain the developer's private key. Anyone receiving the module would receive the key.

Public keys, by contrast, can generally be distributed freely and may be hardcoded into applications when they are intentionally part of an addressing or authorization policy.

---

# 7. Module Identity

Modules can have their own public/private keypair when the application's design requires one.

For example, a server-operated module might:

1. maintain a public/private keypair;
2. publish its public key;
3. listen for transactions sent to that public key;
4. process requests;
5. create response transactions;
6. sign those responses using the module's private key.

This is not a second kind of Saito identity.

It is simply another cryptographic identity controlled by a particular application or operator.

The key question is always:

> What entity is this keypair intended to represent?

Possible answers include:

- the current user;
- a server operator;
- a Registry service;
- a Store service;
- another application-controlled identity;
- a temporary or disposable application identity.

---

# 8. Public Keys as Application Addresses

A module may publish its public key as an address that users can send transactions to.

This enables a straightforward distributed application pattern:

    User
      │
      │ transaction to module public key
      ▼
    Module operator
      │
      │ process request
      ▼
    response transaction
      │
      ▼
    User / network

The module does not need to be a conventional centralized API server merely because it accepts requests.

It can participate in Saito's transaction and peer-to-peer communication system.

The Registry is an example.

---

# 9. The Registry Pattern

Saito operates a Registry module that provides human-readable usernames.

The Registry does not replace public-key identity.

Instead, it creates a cryptographically verifiable relationship between a username and a public key.

Conceptually:

    username
       │
       ▼
    public key

The Registry is operated using its own public/private keypair.

A user sends a request to the Registry asking to register a username.

The Registry:

1. receives the request;
2. checks whether the username is already registered;
3. creates a transaction stating that the public key has been registered under that username;
4. signs the transaction using the Registry's private key;
5. publishes the transaction;
6. maintains a database/cache for convenient lookup.

Other nodes can receive and observe the Registry's signed transactions.

The signed transaction provides a decentralized, cryptographically verifiable statement made by the Registry.

The important architectural lesson is not that every application should build its own Registry.

It is:

> Human-readable names can be layered over cryptographic identities by an application or service that publishes signed statements establishing those relationships.

Applications that want to display Saito usernames should generally use the existing Registry rather than inventing another username system.

---

# 10. Usernames Are an Overlay

The underlying identity remains:

    public key

A username is an additional label.

For example:

    public key
        ↓
    Registry lookup
        ↓
    username

Applications can use the public key internally while displaying the username to users.

This is particularly useful because public keys are excellent machine identities but poor human-facing labels.

The Registry therefore solves a presentation and naming problem without changing the underlying identity model.

---

# 11. RedSquare and Username Resolution

The Registry is also used as an infrastructure service by applications.

RedSquare provides an example of this pattern.

Content can be rendered with information identifying public keys in a format that allows the browser-side application to subsequently request corresponding usernames from the Registry.

The username lookup occurs after the initial content has loaded.

Conceptually:

    load content
         ↓
    identify public keys
         ↓
    request usernames
         ↓
    Registry response
         ↓
    replace/render username information

This is an important Saito application pattern:

> Application content does not have to block on every piece of human-readable metadata before it can render.

Names can be resolved after the underlying content has loaded.

An AI implementing username display should investigate the existing Registry integration and RedSquare implementation rather than creating a new username service.

---

# 12. The Registry Is a Pattern, Not a Special Rule

The Registry illustrates a more general application architecture:

    request
       ↓
    service node
       ↓
    process request
       ↓
    create signed response
       ↓
    publish response

The fact that the Registry signs its statements is meaningful because the Registry's public key is known.

The same general architecture can be used by other application services.

The Registry is therefore an example of a module/operator identity, not a new fundamental identity layer in Saito.

---

# 13. Transaction Signing

A transaction can be cryptographically signed by the wallet.

The normal application pattern is:

    create transaction
          ↓
    populate transaction data
          ↓
    sign transaction
          ↓
    propagate transaction

The transaction signature proves control of the corresponding private key.

The current implementation signs the transaction after packing its data. The transaction data therefore participates in the signature.

The practical consequence is important:

> If an application needs cryptographic proof that a particular identity authored a transaction, the transaction should be signed.

Do not create an application-specific signature protocol when the Saito transaction-signing mechanism already provides the required proof.

---

# 14. Transaction Signatures Are Not Automatically Present Everywhere

Not every transaction-shaped communication path necessarily produces a cryptographically signed transaction.

This is especially important for off-chain application communication.

Some Saito APIs can send transaction-shaped application messages without requiring a transaction signature.

For example, `sendRequest` can operate with `signature_required` set to false.

Therefore an AI should not reason:

> “This object is a Saito transaction, therefore it must have been signed by the person whose public key appears in `from`.”

That assumption is incorrect for unsigned communication paths.

If authorship matters, use the signed form.

The exact API and arguments should be checked in the current Saito implementation when implementing the feature.

---

# 15. Peer Authentication

Saito nodes have their own public/private keys.

The network layer maintains connections to peers.

During the network handshake, Saito Core can require the peer to cryptographically prove control of its private key.

After successful authentication, the peer connection is associated with the corresponding public key.

Applications can inspect the network's peer information and determine whether a peer has completed the authentication process.

The relevant functionality is exposed through the Core network infrastructure.

The important point is that peer authentication is a property of the network connection.

It answers a question such as:

> Has this network connection cryptographically demonstrated control of the private key associated with this public key?

Whether that information matters to an application depends entirely on what the application is doing.

---

# 16. Do Not Assume Peer Authentication Is Always Necessary

A peer can initially appear in the peer list before it has completed its cryptographic handshake.

This is normal network behavior.

An application performing an ordinary data fetch may not care whether the peer has been authenticated yet.

An application performing a security-sensitive operation may care.

Therefore the correct rule is not:

> Always reject unauthenticated peers.

Nor is it:

> Always trust every peer.

The correct rule is:

> Determine whether the operation requires authenticated peer identity, and check the network authentication state when it does.

For example, the Admin module has a reason to expose peer connection and authentication information because network administration is one of its purposes.

A module fetching ordinary application data may have no reason to care.

---

# 17. Peer Identity Is Not Transaction Authorship

A peer is the network connection through which information arrives.

That does not automatically establish that the peer is the author of every transaction or transaction-shaped message that it forwards.

Therefore:

> Never infer transaction authorship merely from the network peer that delivered the transaction.

A transaction's cryptographic identity should be established from the transaction itself when authorship matters.

Conceptually:

    peer connection
         │
         └── tells you about the network endpoint

    transaction signature
         │
         └── proves transaction authorship

These are different questions.

---

# 18. When Should an Application Require Authentication?

There is no universal answer.

The application should ask what it actually needs to know.

For example:

    “I need to fetch data.”
        → peer authentication may not matter.

    “I need to know which node I am connected to.”
        → inspect Core network peer authentication.

    “I need proof that this transaction was authored by Alice.”
        → require a valid transaction signature.

    “I need the contents to remain private.”
        → encrypt the transaction message.

    “I need both privacy and authorship.”
        → encrypt the message and sign the transaction.

This is preferable to imposing an authentication layer on every application operation.

---

# 19. Encryption Is a Separate Decision

Authentication and encryption solve different problems.

Encryption answers:

> Who can read this information?

Signing answers:

> Who cryptographically authorized or authored this information?

An application may need:

- neither;
- encryption only;
- signing only;
- both.

Do not assume that every public transaction should be encrypted.

Do not assume that every encrypted transaction is automatically signed.

Do not assume that signing provides confidentiality.

---

# 20. What Can Be Encrypted?

Saito transactions contain routing and ledger information as well as application data.

The application message/content can be encrypted.

The transaction's routing information and UTXO structure cannot simply be hidden by encrypting the transaction message.

Conceptually:

    transaction
    ├── routing / network information
    ├── UTXO inputs
    ├── UTXO outputs
    └── application message/data
                      ↑
                  encrypt this

The practical application pattern is therefore:

    transaction
         │
         ├── public transaction structure
         │
         └── encrypted application message
                         │
                         ▼
                    recipient decrypts

The encryption protects the application content rather than making the entire blockchain transaction invisible.

---

# 21. Encrypted Blockchain Communication

Saito can be used to send encrypted application data through blockchain transactions.

For example:

    Alice
      │
      │ create transaction
      │
      ├── public transaction structure
      │
      └── encrypted message
               │
               ▼
          Saito network
               │
               ▼
             Bob
               │
               ▼
           decrypt message

The encrypted transaction can therefore provide secure application communication over a decentralized blockchain network.

This is particularly useful for applications such as:

- private game moves;
- private chat;
- encrypted credentials or secrets;
- encrypted purchase information;
- other application-specific private data.

The decision to encrypt depends on the application's requirements.

---

# 22. Diffie-Hellman and Shared Secrets

Saito supports mechanisms for establishing shared secrets between participants.

One approach uses Diffie-Hellman/ECDH.

Conceptually:

    Alice private key + Bob public key
                  ↓
             shared secret

and:

    Bob private key + Alice public key
                  ↓
             same shared secret

The shared secret can then be used with symmetric encryption.

Saito has multiple existing mechanisms for this.

The Encrypt module supports explicit Diffie-Hellman key exchanges, including separate key material stored in the Keychain.

Saito's cryptographic APIs also expose shared-secret generation using wallet key material.

Applications should inspect the existing API and choose the mechanism appropriate to their use case rather than implementing their own key exchange.

---

# 23. Explicit Key Exchanges

The Encrypt module can establish a separate cryptographic relationship between two participants.

Conceptually:

    Alice
      │
      │ key-exchange request
      ▼
    Bob
      │
      │ response
      ▼
    Alice
      │
      ▼
    shared secret

The resulting encryption information can be associated with the corresponding Keychain entry.

This permits subsequent application messages to be encrypted for that relationship.

The explicit exchange is particularly useful when an application wants a persistent encryption relationship with another public-key identity.

---

# 24. Wallet-Key-Based Encryption

Saito also supports generating a shared secret from wallet key material and another user's public key.

This allows an application to derive encryption material without necessarily performing a separate explicit exchange first.

The exact behavior depends on the encryption API being used.

An application should therefore inspect the current `app.keychain` and encryption APIs rather than assuming that every encrypted relationship has been established through the Encrypt module's explicit exchange.

The important architectural concept is:

> Public-key identities can be used to establish symmetric encryption keys, allowing application messages to be encrypted for specific recipients.

---

# 25. Keychain

`app.keychain` is the Saito subsystem for maintaining information about other public-key identities and relationships with them.

A Keychain entry may contain information such as:

- public key;
- identifier/username;
- contact state;
- watched state;
- encryption-related key material;
- shared secrets;
- group/event information;
- other application-specific relationship metadata.

The Keychain is local application state.

It is not the blockchain's canonical identity registry.

It is not a certificate authority.

It does not mean that every public key in the Keychain is trusted.

An application can add a public key to its Keychain without proving that the corresponding person is trustworthy.

---

# 26. Adding a Contact Is Not the Same as Establishing Encryption

Adding a public key to the Keychain and establishing an encrypted communication channel are distinct operations.

For example:

    addKey(publicKey)
        ↓
    local relationship record

does not necessarily mean:

    addKey(publicKey)
        ↓
    DH exchange
        ↓
    shared secret
        ↓
    encrypted communication

The Encrypt module provides explicit key-exchange functionality when an application wants to establish such a relationship.

This distinction prevents an AI from assuming that “contact” automatically means “encrypted contact.”

---

# 27. `added` and `watched`

The Keychain can contain several different relationship states.

`added` can represent that a user has explicitly added a contact.

`watched` has different purposes and should not simply be interpreted as “friend” or “trusted person.”

Some Keychain state is associated with network/wallet monitoring and other application behaviors.

The important AI rule is:

> Do not collapse Keychain relationship fields into a single concept of trust.

If an application needs to know whether a user explicitly added another identity, use the appropriate contact state.

If it needs to know whether an identity is being watched or otherwise tracked, use the appropriate state for that function.

If it needs cryptographic confidentiality, check whether the required encryption relationship exists.

---

# 28. A Public Key Is Not Automatically Trusted

Anyone can know another person's public key.

Anyone can put a public key into a local Keychain.

Therefore:

    public key
        ≠
    trusted person

The public key establishes cryptographic identity.

Whether the application trusts that identity for a particular purpose is an application-level decision.

The Registry provides one example of an independently verifiable statement:

    Registry public key
          ↓
    signed statement
          ↓
    username → public key

That provides evidence of what the Registry asserted.

It does not magically turn every public key into a globally trusted human identity.

---

# 29. `app.crypto`

`app.crypto` exposes Saito's cryptographic functionality to application code.

A major reason to use these APIs is that important cryptographic operations are implemented in Rust and exposed through WASM.

This can provide substantially better performance than implementing the same operations purely in JavaScript.

Applications should therefore prefer the existing Saito cryptographic API rather than importing unrelated cryptographic libraries for functions Saito already provides.

The cryptographic subsystem includes functionality for operations such as:

- key generation;
- signing;
- signature verification;
- hashing;
- shared-secret generation;
- encryption-related operations;
- random-number/random-byte generation;
- other cryptographic primitives.

The exact API should always be checked against the current Saito source.

---

# 30. Cryptography Is Infrastructure, Not Application State

Cryptographic functions are tools.

They generate or transform cryptographic material.

They do not themselves define application state.

For example:

    generate private key
    generate randomness
    hash data
    sign data
    verify signature
    derive shared secret
    encrypt data
    decrypt data

These operations can be used by applications to construct their own protocols and state.

The cryptographic subsystem should therefore not be confused with:

- the blockchain;
- the wallet's application state;
- the Keychain;
- module SQL databases;
- the Registry;
- application-specific data structures.

---

# 31. Use Saito's Cryptographic APIs

An AI should generally prefer:

    app.crypto
    app.wallet
    app.keychain

over independently implementing equivalent cryptographic functionality.

This avoids:

- duplicate cryptographic implementations;
- inconsistent hashing;
- incompatible signing formats;
- unnecessary JavaScript cryptography;
- accidental divergence from Saito's transaction format;
- unnecessary dependencies.

There are existing legacy and specialized cases where modules directly use lower-level or third-party cryptographic libraries.

Those cases should not automatically be copied into new application code.

The AI should first determine whether the Saito API already provides the required functionality.

---

# 32. Saito Hashing

Saito's core hashing implementation uses Blake3.

Do not assume that SHA-256 is the Saito consensus hash merely because SHA-256 is common in other blockchain systems.

When an application needs a Saito-compatible hash, use the Saito cryptographic API or the corresponding Saito implementation.

For example:

    app.crypto.hash(...)

is preferable to introducing another hashing implementation without a reason.

---

# 33. Transaction Identity and Signatures

Transaction signatures are useful application identifiers.

Applications commonly use transaction signatures for:

- identifying transactions;
- linking application records;
- referencing previous application messages;
- constructing application-level trees;
- storing transaction-related records.

For example, RedSquare uses transaction signatures when working with tweet relationships.

However:

> A transaction signature is not necessarily a universal permanent identifier for every possible representation of an application event.

Chain inclusion and transaction identity are related but distinct concepts.

A reorganization can change whether a transaction is part of the current longest chain.

Applications that care about canonical chain inclusion must track that separately.

---

# 34. Wallet Identity vs Transaction Identity

These should not be confused.

Wallet identity:

    public key

Transaction identity:

    transaction signature

Chain inclusion:

    block / chain position

UTXO identity:

    slip information

Application record identity:

    whatever identifier the module chooses

These concepts can be related without being interchangeable.

For example:

    public key
        ↓
    author

    transaction signature
        ↓
    particular transaction

    block hash
        ↓
    particular block inclusion

An AI should not use one of these identifiers merely because it is convenient if the application actually needs another.

---

# 35. NFT Ownership

NFT ownership is ultimately represented through the relevant UTXO/slip state.

An application should not infer current NFT ownership merely by finding the original NFT mint transaction.

The current owner is represented by the current ownership state.

This is important because ownership can change through subsequent transactions.

Therefore:

> When determining current NFT ownership, use the current wallet/UTXO/NFT state or the appropriate Saito ownership mechanism rather than treating the original mint transaction as the current ownership record.

---

# 36. P2SH and Cryptographic Authorization

Saito P2SH provides another way to use cryptographic conditions.

A P2SH script can encode conditions that determine whether a particular UTXO can be spent.

The condition might involve:

- a public key;
- signatures;
- ownership;
- NFT ownership;
- transaction fields;
- other supported script predicates;
- combinations of conditions.

There is no single required pattern.

For example, a script might permit:

    Alice can spend

or:

    Alice OR Store can spend

or:

    anyone can spend if they provide
    the required counter-value

The appropriate design depends on the application's economic and messaging requirements.

Do not hardcode a public key merely because conventional smart-contract examples do.

A public key is one possible authorization condition among many.

---

# 37. Example: A Decentralized Exchange

A decentralized exchange could publish P2SH-controlled UTXOs whose spending condition effectively says:

> Anyone may spend this input if the transaction provides the required counter-value.

The exchange does not necessarily need to have a special operator public key.

The authorization condition itself can define the required exchange.

The important development process is:

1. determine what assets are being exchanged;
2. determine what constitutes a valid trade;
3. determine what information must be published;
4. determine who must be able to spend the UTXO;
5. determine what conditions must be cryptographically verifiable;
6. construct the appropriate transaction/P2SH mechanism.

Do not begin by assuming the application needs a conventional contract/account architecture.

---

# 38. Cryptographic Authorization Is Different from Encryption

A P2SH spending condition can authorize an operation.

It does not necessarily encrypt anything.

Similarly:

    signature
        → authorship/authentication

    P2SH
        → authorization condition

    encryption
        → confidentiality

These can be combined when necessary.

They should not be treated as interchangeable.

---

# 39. Communication Design Comes Before Cryptography

When implementing an application, determine the communication model first.

Ask:

    Who communicates with whom?

    What data is being communicated?

    Is the data public?

    Is it private?

    Who should be able to decrypt it?

    Does the recipient need proof of authorship?

    Does the network peer's identity matter?

    Does the data need to be on-chain?

    Does the application need the data permanently?

    Where will recipients retrieve it?

Only after answering these questions should the application choose:

    unsigned transaction
    signed transaction
    encrypted transaction
    authenticated peer connection
    explicit DH exchange
    P2SH authorization
    module/operator key
    public Registry identity
    or some combination

---

# 40. Public Application Data

Some applications intentionally publish information to everyone.

Examples include:

- social posts;
- public profiles;
- public market information;
- public application events.

For these applications, encrypting the application data would defeat the application's purpose.

The correct design may simply be:

    transaction
       ↓
    public application data
       ↓
    network
       ↓
    everyone can read it

The fact that encryption exists does not mean it should be used.

---

# 41. Private Application Data

Other applications need confidentiality.

Examples include:

- private chat;
- private game moves;
- private credentials;
- encrypted application secrets;
- private purchase information.

The application can encrypt the transaction's application message before publishing or transmitting it.

Conceptually:

    plaintext application message
              ↓
          encryption
              ↓
    encrypted transaction data
              ↓
          Saito network
              ↓
          recipient
              ↓
           decrypt

The blockchain can therefore serve as a decentralized communication and publication mechanism even when the application content itself is private.

---

# 42. The Application Should Decide Whether to Sign

The important question is not:

> “Are transactions supposed to be signed?”

The useful question is:

> “Does this particular operation require cryptographic proof of authorship?”

If yes, ensure the transaction is signed.

Some APIs require explicitly requesting a signature.

For example, off-chain request mechanisms can have a `signature_required` option.

An AI implementing a security-sensitive operation should inspect the actual API and make sure it has selected the signed path.

Do not assume that merely constructing a transaction-shaped object guarantees a cryptographic signature.

---

# 43. The Application Should Decide Whether to Encrypt

Likewise:

> “Should all transactions be encrypted?”

is the wrong question.

Instead ask:

> “Does the application data need confidentiality?”

If no:

    publish the application data

If yes:

    encrypt the application data for the intended recipient(s)

If authorship also matters:

    sign the transaction as well

This produces a much simpler design than creating a universal authentication/encryption layer.

---

# 44. Encryption and Signing Can Be Combined

An application may require both.

Conceptually:

    application message
          │
          ├── encrypt for recipient
          │
          ▼
    transaction data
          │
          ▼
       sign tx
          │
          ▼
      propagate

The recipient can then:

1. verify the transaction signature;
2. decrypt the application data;
3. process the application message.

The exact order and API calls should follow the existing Saito implementation.

For example, Saito provides wallet functionality for signing and encrypting transactions together.

---

# 45. Authenticated Peers vs Signed Transactions

These mechanisms answer different application questions.

A network handshake tells the software:

> This network connection has cryptographically demonstrated control of this public key.

A signed transaction tells the software:

> This transaction was cryptographically signed by the corresponding private key.

An application may need one, both, or neither.

Do not create an artificial hierarchy in which one is universally “stronger.”

Choose the mechanism according to the question the application needs to answer.

---

# 46. Network Connections Have a Small Authentication Window

When peers connect, they may initially appear in the peer list before completing the cryptographic handshake.

This does not necessarily indicate a security problem.

It simply means authentication has not yet been established.

If the application needs authenticated peer identity, it can inspect the Core network state and wait for or require successful authentication.

If it does not need that information, there is no reason to block ordinary network operations merely because the handshake has not yet completed.

---

# 47. Do Not Build a Conventional Authentication System Without a Requirement

A common mistake for an AI coming from conventional web development is to see a requirement such as:

> “We need to know who the user is.”

and immediately build:

    username
    password
    login endpoint
    session
    JWT
    user database

In Saito, first ask whether the application actually needs any of these.

The user already has a cryptographic identity.

If the application needs a human-readable name:

    use the Registry.

If the application needs proof that the user authored an operation:

    sign the transaction.

If the application needs encrypted communication:

    use Saito's encryption/DH mechanisms.

If the application needs a server-operated identity:

    create and manage an appropriate module/operator keypair.

If the application needs a local relationship with another public key:

    use the Keychain.

Do not build an account system merely because account systems are familiar.

---

# 48. The Keychain Is Not a Certificate Authority

A Keychain entry should not be interpreted as:

> “The Saito system has certified that this person is trustworthy.”

The Keychain is local application state.

It can contain:

    public key
    username/identifier
    contact state
    watched state
    encryption state
    shared secret
    group information
    application metadata

The application decides what those relationships mean.

---

# 49. Private-Key Risk Is Application-Specific

Saito allows applications to access wallet private-key functionality where appropriate.

That flexibility is intentional.

It allows developers to build applications with different trust and security models.

For example, an application may be deliberately disposable:

    create lightweight wallet
          ↓
    put small amount of funds in it
          ↓
    use application
          ↓
    abandon / destroy wallet

In such an application, the user may consciously accept a higher compromise risk in exchange for convenience.

Another application may hold significant assets and therefore require much stronger operational security.

Saito does not force every application into the same security model.

The developer and user decide what level of risk is appropriate.

The important requirement is that the consequences of the decision are understood.

---

# 50. Public Keys Can Be Distributed

Public keys are intended to be public.

It is therefore generally safe for applications to:

- publish public keys;
- include public keys in configuration;
- hardcode known service public keys;
- use public keys as transaction destinations;
- use public keys in authorization policies.

A distributed application may need to know the public key of a service it communicates with.

That does not require distributing the service's private key.

---

# 51. Never Distribute Operator Private Keys

The inverse rule is critical.

If a module contains a private key and the module is distributed to users, every user receives that private key.

That means the private key no longer identifies a single trusted operator.

Therefore:

> A distributed module may contain a known public key, but an operator's private key should remain under the operator's control.

Server-operated services should keep their private keys on the server or in whatever secure environment the operator chooses.

---

# 52. There Is No Single “Correct” Cryptographic Architecture

Saito provides tools rather than forcing every application into one pattern.

For example, an application might use:

    wallet identity
    +
    signed transactions
    +
    public application data

Another might use:

    wallet identity
    +
    encrypted transactions
    +
    signed transactions

Another might use:

    server/module identity
    +
    request transactions
    +
    signed service responses

Another might use:

    P2SH
    +
    UTXOs
    +
    cryptographic spending conditions

Another might combine all of these.

The correct architecture depends on the application's requirements.

An AI should resist the temptation to choose one familiar pattern and apply it everywhere.

---

# 53. Saito Is a Toolkit of Cryptographic and Communication Primitives

The right mental model is not:

> “Saito has one authentication system.”

It is:

> “Saito provides cryptographic identities, wallets, transactions, peer connections, encryption, key exchange, scripting, and application APIs that can be composed according to application requirements.”

The developer's job is to select the appropriate primitives.

The AI's job is to understand those primitives well enough not to introduce unnecessary infrastructure.

---

# 54. Common Mistakes for AI Developers

### Mistake 1: Creating usernames as the primary identity

Wrong:

    username → user account → public key

Preferred:

    public key → identity
        ↓
    Registry → optional username

### Mistake 2: Creating passwords and JWTs

Do not build conventional login infrastructure unless the application has a specific requirement that the Saito identity model does not address.

### Mistake 3: Treating every peer as authenticated

Peers may initially be connected before the cryptographic handshake completes.

Check network authentication if the application actually requires authenticated peer identity.

### Mistake 4: Treating peer identity as transaction authorship

The peer that delivered a transaction is not automatically its author.

When authorship matters, verify the transaction signature.

### Mistake 5: Assuming every transaction is signed

Some transaction/application-message APIs allow unsigned communication.

Explicitly select the signed path when cryptographic authorship is required.

### Mistake 6: Assuming encryption is automatic

If an application requires privacy, explicitly use the encryption mechanism appropriate to the communication path.

### Mistake 7: Assuming signing provides privacy

A signature authenticates/authors data. It does not make the data confidential.

### Mistake 8: Encrypting everything

Public applications should normally publish public information.

Encryption is a requirement-driven choice.

### Mistake 9: Implementing cryptography independently

Use `app.crypto`, `app.wallet`, `app.keychain`, and existing Saito encryption mechanisms before reaching for independent implementations.

### Mistake 10: Using SHA-256 because it is familiar

Saito's core hashing uses Blake3.

### Mistake 11: Treating Keychain entries as trusted identities

A public key can be added locally without proving anything about the person controlling it.

### Mistake 12: Distributing private operator keys

A distributed module must not contain the operator's private key.

### Mistake 13: Treating the Registry as the identity system

The Registry provides human-readable naming on top of public-key identity.

### Mistake 14: Assuming there is one correct cryptographic pattern

Different applications require different combinations of signing, encryption, peer authentication, P2SH, service identities, and public data.

---

# 55. Practical Decision Process for an AI

When implementing an application feature involving identity or cryptography, use this sequence.

### Step 1: Identify the parties

Who is communicating?

    user ↔ user
    user ↔ service
    node ↔ node
    module ↔ user
    public network

### Step 2: Identify the required identity

What identity actually matters?

    user's wallet public key
    remote peer public key
    module/operator public key
    Registry username
    application-specific identity

### Step 3: Determine whether authorship matters

If the application needs cryptographic proof of authorship:

    sign the transaction

Check the actual transaction API to ensure signing is enabled.

### Step 4: Determine whether privacy matters

If the application data is private:

    encrypt the application message

Do not attempt to encrypt the parts of the transaction that necessarily remain visible for routing and ledger operation.

### Step 5: Determine whether peer authentication matters

If the application specifically needs to know the identity of a connected node:

    inspect app.core.network / peer authentication state

Do not add an independent authentication protocol without a reason.

### Step 6: Determine whether a persistent encryption relationship is needed

If participants need repeated encrypted communication:

    investigate Keychain + Encrypt/DH

If one-off encryption is sufficient:

    use the appropriate existing Saito encryption API.

### Step 7: Determine whether human-readable names are needed

If the application needs Saito usernames:

    use the Registry

Do not create a second username registry.

### Step 8: Determine whether a module needs its own identity

If the module is operating as a service:

    create/use a module or operator keypair

If it is an ordinary consumer application:

    use the user's wallet identity unless there is a specific reason not to.

### Step 9: Determine the data lifecycle

Ask:

    Is this data public?
    Is it private?
    Is it on-chain?
    Is it off-chain?
    Who needs to retrieve it?
    How long must it remain available?
    Does it need cryptographic proof?
    Does it need encryption?

Cryptography should follow these requirements rather than precede them.

---

# 56. API Orientation

For normal application development, begin with these interfaces:

    app.wallet
    app.crypto
    app.keychain
    app.network
    app.core.network

Use:

    app.wallet
        for wallet identity and transaction operations

    app.crypto
        for cryptographic primitives

    app.keychain
        for local relationships with other identities and encryption state

    app.network
        for application-facing network operations

    app.core.network
        when the application specifically needs lower-level peer/network information such as authentication state

When an API does not provide the required operation, inspect the relevant `lib/saito` implementation and lower-level WASM/Core APIs.

Do not duplicate functionality that Saito already provides.

---

# 57. The AI's Core Mental Model

The simplest useful mental model is:

    Public key
        = Saito network identity

    Private key
        = proof/control of that identity

    Wallet
        = API for the user's cryptographic identity and assets

    Transaction
        = structured object for communicating and transferring value

    Transaction signature
        = cryptographic proof of transaction authorship

    Peer handshake
        = cryptographic proof of control of the peer's network identity

    Keychain
        = local relationships with other public keys

    Registry
        = service that binds human-readable names to public keys

    app.crypto
        = cryptographic primitives implemented through Saito's crypto stack

    Encryption
        = confidentiality for application content

    P2SH
        = programmable spending/authorization conditions

    Module/operator key
        = an additional cryptographic identity used when an application needs one

None of these should be collapsed into a generic “user account” abstraction.

---

# 58. Final Principle

Saito does not require developers to choose between a fixed set of identities, authentication systems, or encryption architectures.

It provides cryptographic primitives and communication mechanisms from which applications can construct the architecture they need.

The most important question for an AI developer is therefore not:

> “What is the standard way to authenticate a Saito user?”

It is:

> “What does this application need to know, who needs to know it, what needs to be proven, what needs to remain private, and where does the resulting data need to exist?”

From that answer, select the appropriate Saito primitives.

Use the wallet when the user's identity is required.

Use transaction signatures when authorship needs to be cryptographically established.

Use peer authentication when the identity of a network connection matters.

Use encryption when application content needs confidentiality.

Use Diffie-Hellman and the existing encryption facilities when participants need shared secrets.

Use the Keychain for local relationships with other public keys.

Use the Registry when human-readable Saito usernames are required.

Use module/operator keypairs when a service itself needs a cryptographic identity.

Use P2SH when authorization needs to be expressed as a cryptographically enforceable spending condition.

And use the existing Saito APIs rather than rebuilding these mechanisms through conventional web authentication, database, or cryptographic libraries.

The central development principle is:

> Saito gives the application a set of cryptographic and communication tools. The application chooses how to compose them according to its actual requirements.
# Saito Framework — Storage, Archive, Registry and Persistence

## Purpose

This document explains how Saito applications persist and retrieve data.

The most important principle is:

> Saito does not have a single application database.

Saito provides several different mechanisms for keeping and retrieving information. They serve different purposes, have different ownership boundaries, and have different availability characteristics.

The blockchain is not the application database.

It is also not useful to think of Saito primarily as either:

- a money system; or
- a database.

The blockchain provides decentralized publication, consensus, transaction processing, and UTXO state.

Application persistence is a separate concern.

Saito provides APIs that allow applications to persist transaction-shaped application data, maintain module-specific databases, store local state, communicate with Archive services, and publish information through the blockchain.

The correct storage mechanism depends on what the application is trying to accomplish.

---

# 1. The Fundamental Storage Model

The Saito application environment contains several distinct persistence mechanisms.

The important ones include:

- the blockchain and UTXO state;
- `app.options`;
- `app.storage`;
- Archive;
- module-owned SQL databases;
- browser-local databases;
- in-memory state;
- remote services;
- external storage.

These should not be treated as interchangeable.

A useful conceptual picture is:

    Blockchain
        │
        ├── decentralized publication
        ├── consensus
        ├── transactions
        └── UTXO state

    app.storage
        │
        └── application-facing persistence API
                │
                └── transaction persistence
                        │
                        └── Archive provider

    Module SQL
        │
        └── module-owned relational state

    app.options
        │
        └── local application/wallet state

    Memory
        │
        └── ephemeral process state

    External / remote services
        │
        └── application-specific persistence or data availability

There is no requirement that all application data use the same mechanism.

---

# 2. What `app.storage` Is

`app.storage` is a Saito application-level JavaScript facade.

It provides APIs that allow module developers to interact with persistence without directly implementing the underlying storage mechanism.

The central transaction-oriented methods include:

- `saveTransaction`
- `loadTransactions`
- `updateTransaction`
- `deleteTransaction`
- `deleteTransactions`
- `loadNFTTransactions`

`app.storage` also exposes other persistence-related functions, including options and lower-level database/file operations.

It is therefore important not to equate:

    app.storage
        =
    Archive
        =
    SQLite

They are different layers.

Conceptually:

    application/module
          │
          ▼
      app.storage
          │
          ▼
    persistence mechanism
          │
          ├── Archive
          ├── browser database
          ├── Node SQLite
          └── other implementation-specific storage

The current implementation has some important hardcoded coupling to Archive, described below.

---

# 3. `app.storage` Is a Facade, Not a Database

`app.storage` itself is not a SQLite database.

It is a class that exposes persistence-related APIs.

For transaction persistence, it delegates to the Archive module or communicates with an Archive service.

Other methods on the Storage class have different responsibilities.

For example:

- options are persisted through the options storage mechanism;
- module SQL is handled through Node's database facilities;
- browser dynamic-module data uses browser storage;
- transaction persistence is delegated to Archive.

Therefore:

> Do not ask “What database is `app.storage`?”

Ask:

> “Which persistence API do I need, and what implementation provides it?”

---

# 4. The Transaction Persistence API

The central transaction persistence model is:

    module
       │
       ▼
    app.storage.saveTransaction(...)
       │
       ├── local Archive
       │
       └── remote Archive request

and:

    module
       │
       ▼
    app.storage.loadTransactions(...)
       │
       ├── local Archive
       │
       └── remote Archive request

The application interacts with the storage API rather than directly querying the Archive database.

This is important because the Archive database schema is not supposed to become the application's direct database interface.

Applications work with transaction objects and Archive query fields.

---

# 5. Current Archive Integration

The conceptual goal is a storage abstraction, but the current implementation is not a completely generic provider registry.

For local persistence, `app.storage` currently looks specifically for a module named:

    Archive

using:

    app.modules.returnModule('Archive')

For remote persistence, it sends an application request using the request type:

    archive

The Archive module handles those requests.

Therefore the current implementation has two concrete coupling points:

    local:
        module name = Archive

    remote:
        request = archive

This is an important implementation detail.

An AI should not describe the current system as though Archive were selected through a generic `respondTo('storage')` plugin interface.

Archive does not currently implement storage through `respondTo`.

---

# 6. Local Transaction Persistence

When an application calls:

    app.storage.saveTransaction(tx, ...)

with localhost persistence, Storage attempts to find the Archive module.

Conceptually:

    app.storage.saveTransaction()
            │
            ▼
    returnModule('Archive')
            │
            ▼
    Archive.saveTransaction()

If the local Archive module is unavailable, the current Storage implementation does not automatically create another generic local persistence provider.

This is one reason Archive is normally included in the standard module configuration.

---

# 7. Remote Transaction Persistence

Storage can also communicate with an Archive running on another peer.

Conceptually:

    application
        │
        ▼
    app.storage.saveTransaction()
        │
        ▼
    sendRequestAsTransaction('archive', ...)
        │
        ▼
    remote peer
        │
        ▼
    Archive.handlePeerTransaction()
        │
        ▼
    Archive.saveTransaction()
        │
        ▼
    Archive database

The same application-facing storage API can therefore be used when the persistence provider is remote.

The caller does not need to issue SQL queries against the remote Archive database.

---

# 8. `app.storage` and `respondTo`

Saito uses `respondTo` as an important mechanism for some forms of module-level service discovery and in-process interfaces.

The current Archive persistence path is different.

Archive does not implement its storage interface through:

    respondTo('storage')

or:

    respondTo('archive')

Instead, the current implementation uses:

- the module name `Archive` for local access;
- the request string `archive` for remote communication.

This distinction matters when an AI is modifying the framework.

Do not assume every Saito service is implemented through `respondTo`.

Trace the actual API.

---

# 9. The Intended Abstraction Versus the Current Implementation

The Storage class provides an abstraction over persistence.

That abstraction allows application code to use:

    saveTransaction(...)
    loadTransactions(...)

without knowing the underlying SQL schema.

However, the current implementation is not completely provider-independent.

The local implementation explicitly looks for:

    Archive

and the remote protocol explicitly uses:

    archive

Therefore the correct description is:

> `app.storage` is the application-facing persistence facade for transaction storage. Its current transaction persistence implementation is coupled to the Archive module through a known module name and request protocol.

Do not incorrectly claim that developers can simply install any module implementing `respondTo` and have Storage automatically discover it.

That is not how the current implementation works.

---

# 10. Why the Storage Abstraction Exists

The application-level storage API provides an important separation even though the current provider selection is coupled.

A module can say:

    save this transaction

without needing to know:

- which SQLite table is used;
- how Archive indexes the record;
- whether the Archive is local or remote;
- how browser persistence differs from Node persistence;
- how the Archive database is physically implemented.

This is useful because the storage implementation can evolve without forcing every application to rewrite its transaction persistence code.

The stable application-facing interface is more important than direct access to the Archive schema.

---

# 11. `saveTransaction()` Does Not Mean “Put This on the Blockchain”

This is one of the most important distinctions in Saito.

When an application calls:

    app.storage.saveTransaction(tx)

it means approximately:

> The application wants this transaction object persisted through the transaction-storage mechanism.

It does not mean:

> This transaction is part of the blockchain.

`saveTransaction()` does not require the transaction to have been included in a block.

It does not perform a longest-chain check.

It does not establish that the transaction is canonical blockchain state.

It can persist transaction-shaped objects that were transmitted off-chain.

This distinction is fundamental.

---

# 12. A Transaction Can Be an Application Data Envelope

Saito uses the `Transaction` object in multiple contexts.

A transaction can be:

- created for blockchain publication;
- signed and propagated to the blockchain;
- sent through an off-chain ApplicationMessage;
- persisted by Archive;
- retrieved from Archive.

Therefore:

    Transaction object
        ≠
    blockchain inclusion

A useful mental model is:

> A Saito transaction is a structured application message/value-transfer object that can be used in both on-chain and off-chain contexts.

Blockchain publication is one possible use of the transaction object.

It is not the defining characteristic of the object.

---

# 13. On-Chain Transaction

When a transaction is propagated to the blockchain:

    Transaction
        │
        ▼
    propagateTransaction()
        │
        ▼
    mempool
        │
        ▼
    block
        │
        ▼
    longest chain

The blockchain then gives the transaction consensus significance.

Its inputs and outputs participate in the UTXO system.

Its application data can be processed by modules.

The transaction's inclusion can later be affected by reorganizations.

This is fundamentally different from simply saving a transaction to Archive.

---

# 14. Off-Chain Transaction Envelope

A transaction can also be serialized and transmitted through Saito's off-chain application communication system.

Conceptually:

    Transaction
        │
        ▼
    serialize
        │
        ▼
    ApplicationMessage
        │
        ▼
    peer
        │
        ▼
    module

That object does not automatically enter the mempool or blockchain.

The application can nevertheless persist it using:

    app.storage.saveTransaction()

This provides a powerful pattern:

    transaction-shaped application data
            +
    peer-to-peer communication
            +
    persistent Archive storage

without requiring blockchain publication.

---

# 15. `saveTransaction()` Does Not Require a Signature

The Storage layer does not require that the transaction have a signature.

A transaction can therefore be saved even when its signature is empty.

This is consistent with Saito's distinction between:

- transaction-shaped application communication;
- cryptographically signed transactions;
- blockchain-published transactions.

If an application needs proof of authorship, it must use the appropriate signing mechanism.

Persistence itself does not provide authorship.

---

# 16. Archive

Archive is a normal Saito module.

It extends `ModTemplate`.

It maintains persistent transaction/application data and provides the implementation used by the current `app.storage` transaction API.

In Node, Archive uses SQLite.

In the browser, Archive can use a browser database implementation.

Conceptually:

    app.storage
        │
        ▼
      Archive
        │
        ├── Node → SQLite
        │
        └── Browser → browser database

Archive is therefore a module providing a persistence service.

It is not part of blockchain consensus.

---

# 17. Archive Is Not Canonical Blockchain State

An Archive record is not authoritative merely because it is stored in Archive.

Archive is controlled by the node/operator running the Archive module.

A node can:

- run Archive;
- not run Archive;
- modify its Archive implementation;
- use different persistence policies;
- store different application data.

The blockchain's consensus state is controlled by Saito Core and the longest-chain/UTXO rules.

Archive is not.

Therefore:

> Archive data is application/service data, not consensus state.

---

# 18. Archive Is Not Mandatory at the Core Level

The standard Saito configuration includes Archive.

However, Storage checks whether the Archive module exists rather than assuming that it is intrinsically part of Core consensus.

If Archive is absent, transaction persistence through the normal Storage/Archive path may simply fail to produce the expected persisted record.

An AI should therefore distinguish:

    Archive is normally installed
        from
    Archive is a consensus requirement

They are not the same thing.

---

# 19. Local and Remote Archive

Archive can operate locally or remotely.

Local:

    browser/node
        ↓
    local Archive
        ↓
    local database

Remote:

    application
        ↓
    app.storage
        ↓
    peer
        ↓
    Archive request
        ↓
    remote Archive
        ↓
    remote database

The application-facing API can remain the same.

This makes Archive useful for both:

- local persistence;
- service-provider persistence.

A browser can therefore persist application data locally or ask a remote peer to persist it.

---

# 20. Archive Availability Is Not Universal

Because Archive is a module, its data is not automatically available from every Saito node.

If one node runs Archive and another does not, they do not necessarily have the same Archive database.

Likewise, two Archive operators may contain different records.

Therefore:

> Data existing in an Archive somewhere on the network does not mean that every Saito node can query that data locally.

Applications that need remote data must have a mechanism for obtaining it.

That mechanism may involve:

- a remote Archive;
- peer requests;
- blockchain publication;
- another application service;
- external storage.

---

# 21. Archive Fields

Archive provides a transaction-oriented storage model rather than asking applications to manipulate its database schema directly.

The Storage layer provides default fields such as:

    field1 = module
    field2 = sender
    field3 = recipient

Applications can provide additional/overridden fields.

Examples include:

- application identifiers;
- game IDs;
- transaction steps;
- NFT identifiers;
- application-specific indexes.

The exact meaning of these fields depends on how the application uses them.

The important pattern is:

    transaction
       +
    application-defined index fields
       ↓
    Archive
       ↓
    query by those fields

Applications should generally use the Archive API rather than directly querying the Archive SQLite database.

---

# 22. Archive Is a Queryable Transaction Store

Archive allows applications to save transaction-shaped data and later query it.

For example:

    saveTransaction(
        tx,
        {
            field1: "MyModule",
            field4: "object-id"
        }
    )

can later be queried using corresponding fields.

This allows applications to create application-specific indexes over persisted transaction envelopes.

Archive therefore provides more than simple “save this transaction” functionality.

It provides a lightweight application-data persistence and retrieval service around transaction objects.

---

# 23. Archive Does Not Define Application Semantics

Archive does not decide what an application record means.

The application does.

For example:

    field1 = "RedSquare"

may mean a social post.

    field1 = "Vault"

may mean a file.

    field4 = game ID

may identify a particular game.

Archive simply persists and indexes the supplied data according to its interface.

Therefore:

> Archive is a persistence mechanism, not an application state machine.

---

# 24. Module-Owned SQL Databases

Saito modules can also maintain their own SQL databases.

This is different from using:

    app.storage.saveTransaction()

A module can contain SQL schema files under its module directory.

The module installation process can create a module-specific database.

Conceptually:

    node
      │
      ├── module A
      │      └── module-A.sq3
      │
      ├── module B
      │      └── module-B.sq3
      │
      └── Archive
             └── archive.sq3

Each module's SQL database belongs to that module.

Two nodes running the same module generally have independent database files.

---

# 25. Module SQL and Archive Serve Different Purposes

A useful distinction is:

    app.storage / Archive
        → persist and retrieve Transaction envelopes

    module SQL
        → implement the module's own query model

For example, Store may maintain relational tables for listings, inventory, approvals, or other application state.

Registry maintains its own relational database for username records.

These databases are not simply alternate views of the Archive schema.

They are module-owned application databases.

There can be overlap.

Archive itself uses SQL.

The distinction is therefore about the API and ownership boundary rather than whether SQL exists somewhere underneath.

---

# 26. Module SQL Is Not Consensus State

A module's SQLite database does not become consensus state simply because it stores information derived from blockchain transactions.

For example:

    blockchain transaction
          ↓
    module onConfirmation()
          ↓
    SQL INSERT

does not make the SQL row part of blockchain consensus.

The blockchain remains the source of consensus about blockchain state.

The SQL row is the module's representation of that information.

---

# 27. SQL Databases Are Node-Local

If two nodes run the same module:

    Node A
      └── module.sq3

    Node B
      └── module.sq3

these are separate databases.

The framework does not automatically replicate arbitrary module SQL databases between nodes.

If an application needs information to be available on multiple nodes, it must use an appropriate synchronization/publication mechanism.

Possible mechanisms include:

- blockchain publication;
- off-chain peer communication;
- multiple Archive providers;
- application-specific replication.

There is no generic:

    replicateThisDatabase()

operation.

---

# 28. `app.options`

`app.options` is fundamentally local application state.

It contains important persistent information including things such as:

- wallet public key;
- wallet private key;
- wallet slips;
- NFT references;
- Keychain information;
- encryption secrets;
- module preferences;
- game/application state;
- other local configuration and persistent state.

It is persisted locally.

In browsers, this involves browser-local persistence.

On Node, it is persisted through the node's local options mechanism.

It is not automatically replicated as consensus state between Saito nodes.

---

# 29. `app.options` Is Closest to the Wallet/Application File

A useful mental model is:

    app.options
        =
    persistent local state/configuration for this installation

It contains the user's wallet and related local state, so it should be treated as sensitive local application data.

It is not:

    a blockchain database
    a shared network database
    a consensus state store
    an Archive database

Another node's `app.options` is its own local state.

---

# 30. What Belongs in `app.options`

There is no hard universal size rule enforced by the framework.

However, lightweight local information is a natural fit.

Examples include:

- application preferences;
- settings;
- small persistent UI state;
- wallet-related state;
- Keychain state;
- local application preferences.

Applications should not assume that everything in `app.options` is tiny.

Some existing applications store larger state there, including game state.

Therefore:

> “Small data belongs in options” is a useful convention, not a framework-enforced rule.

The AI should examine the actual application requirements rather than blindly applying a size threshold.

---

# 31. Larger Persistent Data

When an application has larger persistent application data, it can use transaction persistence through:

    app.storage.saveTransaction()

This can place the data into local or remote Archive storage.

This is especially useful for:

- files;
- posts;
- application records;
- historical transaction-shaped messages;
- other data naturally represented as transaction envelopes.

Applications can also use module SQL when their data requires a relational query model.

The appropriate choice depends on the application's requirements.

---

# 32. Blockchain Publication and Storage Are Different

An application does not have to publish every piece of persistent data to the blockchain.

For example:

    private file
        ↓
    off-chain transaction
        ↓
    Archive
        ↓
    persistent file

can provide persistent application data without blockchain publication.

Likewise:

    application preference
        ↓
    app.options

requires no blockchain transaction.

And:

    marketplace database
        ↓
    module SQL

does not require every database row to exist on-chain.

Therefore:

> Persistence does not imply blockchain publication.

---

# 33. Blockchain Publication Has a Different Purpose

The blockchain is valuable when the application needs decentralized publication and consensus.

For example, an application may want information to become publicly observable through the Saito network.

Examples include:

- social posts;
- NFT creation;
- Registry registrations;
- marketplace events;
- application messages that need decentralized publication.

In these situations:

    application data
        ↓
    transaction
        ↓
    blockchain
        ↓
    decentralized publication

The blockchain is not being used because it is the cheapest place to store arbitrary bytes.

It is being used because publication through the consensus system has value.

---

# 34. Blockchain Storage Is Expensive

For ordinary bulk storage, blockchain publication is generally inappropriate.

If an application simply needs inexpensive bulk storage, conventional storage such as object storage may be more appropriate.

The blockchain's value is not that it provides cheap storage.

Its value comes from properties such as:

- decentralized publication;
- consensus;
- transaction ordering;
- UTXO ownership;
- cryptographic verification;
- permissionless network participation.

Therefore:

> Do not put application data on-chain merely because the application needs persistence.

First determine why blockchain publication is valuable.

---

# 35. Blockchain Publication Can Bootstrap Other Data Systems

An application may publish a small amount of information on-chain and have other nodes or services index it.

For example:

    on-chain application transaction
             ↓
        network observers
             ↓
        application index
             ↓
        searchable interface

The application can therefore use blockchain publication as a decentralized source of information while keeping large or derived data elsewhere.

A service can monitor the blockchain, extract application information, and make it available through its own database or API.

This does not require the blockchain itself to function as the application's database.

---

# 36. NFTs and Application Distribution

Application data may also be published through NFTs.

For example, if an application is distributed as an NFT, the NFT can serve as a blockchain-published object through which other applications and indexes discover the application.

In this situation, blockchain publication is useful because the application data needs to be:

- discoverable;
- distributed;
- associated with an NFT;
- indexed by other participants.

Again, the purpose is publication and distribution, not cheap general-purpose storage.

---

# 37. Vault: Transaction-Shaped Data Without Blockchain Publication

Vault provides an important example of the distinction between transactions and blockchain transactions.

A Vault file can be placed into a transaction-shaped object.

Conceptually:

    file
      ↓
    transaction envelope
      ↓
    sign
      ↓
    send off-chain
      ↓
    Archive
      ↓
    persistent file

The file transaction is not necessarily propagated to the blockchain.

Instead, it is sent through Saito's off-chain application communication mechanism to the Archive node.

The Archive then persists it.

This demonstrates that:

> A Saito transaction object can be used as a persistent application-data envelope without being included in the blockchain.

---

# 38. Vault Access Control

Vault can associate the stored file with a cryptographic access condition.

The file transaction contains an access script and associated access information.

The Archive stores the relevant access information and can evaluate whether a request satisfies the required condition.

The default access pattern uses P2SH-style script conditions involving NFT ownership.

Conceptually:

    file
      │
      ├── transaction envelope
      │
      └── access condition
                │
                ▼
             Archive
                │
                ▼
          access decision

The access condition is not the same thing as encryption.

The current Vault add-file path stores the file bytes in the serialized transaction data rather than encrypting the file bytes with AES.

The protection comes from the Archive's access-control mechanism.

---

# 39. Vault Demonstrates a General Pattern

The Vault architecture demonstrates that an application can combine:

- transaction-shaped application data;
- off-chain peer communication;
- persistent Archive storage;
- cryptographic authorization;
- separate on-chain transactions representing ownership.

For example:

    private application data
          ↓
    off-chain transaction
          ↓
    Archive

while:

    ownership
       ↓
    NFT
       ↓
    blockchain

The two layers can interact without requiring the private data itself to be placed on-chain.

---

# 40. Archive Data Is Not Automatically Reorg-Sensitive

Archive stores records that applications ask it to store.

It does not automatically remove a record because the underlying transaction later leaves the longest chain.

Archive records can contain block information when the caller provides it, but Archive does not itself turn every record into a longest-chain projection.

Therefore:

> Whether an Archive record should disappear or change after a blockchain reorganization is an application-level question.

This is an important distinction from the storage mechanism itself.

---

# 41. Reorganization Sensitivity Belongs to Application Semantics

Suppose:

    transaction
        ↓
    onConfirmation()
        ↓
    SQL/Archive write

and later the transaction leaves the longest chain.

The database write is not automatically undone.

Whether the record remains valid depends on what the application intended the record to mean.

For example:

    “I have seen this transaction”

may remain useful after a reorganization.

But:

    “This listing is currently backed by a longest-chain UTXO”

may need to change.

Therefore:

> Reorganization sensitivity is a property of what application data means, not a property of SQL, Archive, or another storage technology.

---

# 42. Reorg-Aware Module Databases

Some modules explicitly track blockchain inclusion in their own SQL state.

Store and Registry provide examples of modules maintaining chain-related state in their databases.

They can use information such as:

    in_longest_chain
    block hash
    block identifier

to determine whether their derived records represent current blockchain state.

This logic belongs to those modules.

It is not automatically provided by Archive.

---

# 43. Archive Does Not Replace Module SQL

An application should not use Archive merely because Archive exists.

If a module needs a relational database containing application-specific structures such as:

    listings
    approvals
    inventory
    indexes
    joins
    operational state

then module SQL may be the appropriate mechanism.

Archive is especially natural when the application wants to persist and retrieve transaction-shaped records.

The two mechanisms can also be used together.

For example:

    blockchain/application event
          ↓
    Archive
          +
    module SQL index

The choice depends on the application's requirements.

---

# 44. Registry Persistence

The Registry demonstrates the module-SQL pattern.

The Registry receives registration activity through Saito communication.

It maintains its own database containing registration information.

That database is used to answer queries such as:

    public key → username

The Registry database is not itself blockchain consensus state.

The Registry can also publish signed registration transactions.

This produces two related but distinct forms of information:

    Registry SQL
        → convenient local/service lookup

    signed Registry transaction
        → decentralized publication of the Registry's assertion

The latter can be observed and independently processed by other participants.

---

# 45. Registry Does Not Make Its Database Universal

A node does not automatically possess the Registry's SQL database merely because the Registry exists somewhere on the network.

A node can:

- run Registry;
- query a Registry service;
- observe Registry transactions;
- maintain its own Registry-derived database;
- implement another indexing strategy.

The Registry module is a service/application implementation.

The blockchain provides a mechanism through which its signed statements can be published.

---

# 46. Data Availability

One of the most important questions for a Saito application is:

> Where is the data, and how can this participant obtain it?

Possible answers include:

    local app.options

    local Archive

    remote Archive

    module SQL

    blockchain

    peer application message

    external storage

    in-memory application state

These have different availability characteristics.

A piece of data being available somewhere in the Saito ecosystem does not mean that every node can immediately query it.

---

# 47. Do Not Assume Every Node Has Every Application Database

A common assumption from conventional server applications is:

    application
        ↓
    central database
        ↓
    every request can query the same records

Saito does not have that assumption.

Different nodes can have:

- different modules installed;
- different Archive contents;
- different module SQL state;
- different local options;
- different caches;
- different external service connections.

If an application requires data that may not be locally available, it needs an appropriate retrieval mechanism.

---

# 48. Replication Is Application-Specific

Saito does not provide a generic mechanism saying:

    replicate this application database to every node

If data needs to be replicated, the application can choose an appropriate mechanism.

Possible approaches include:

    blockchain publication
        ↓
    decentralized propagation

or:

    off-chain request
        ↓
    multiple peers
        ↓
    independent persistence

or:

    remote Archive
        ↓
    multiple service providers

or another application-specific protocol.

The important point is:

> Replication is a requirement the application must satisfy; it is not an automatic property of module SQL or Archive.

---

# 49. Local Caches

Applications may maintain local caches.

A cache can improve:

- performance;
- responsiveness;
- query speed;
- UI rendering.

But the AI should not automatically assume that cached data is authoritative.

The application must determine what the cache represents and what happens when it becomes stale.

For some applications, the cache may be disposable.

For others, it may contain valuable local history.

For others, it may represent derived blockchain state that must be reconciled after reorganization.

---

# 50. There Is No Formal Universal Data Authority Taxonomy

Saito's code does not impose a universal classification such as:

    canonical
    derived
    local

for every kind of application data.

Core does have explicit concepts around:

    longest chain
    UTXO state
    block state
    `in_longest_chain`

Modules then build their own application databases and interpretations.

Therefore an AI should not mechanically classify every database row using a framework-wide authority taxonomy.

Instead, determine:

> What does this particular record represent, and what information makes it valid?

That question determines whether it needs:

- blockchain confirmation;
- reorganization handling;
- synchronization;
- local persistence;
- Archive persistence;
- SQL indexing;
- no persistence at all.

---

# 51. Persistence Does Not Imply Authority

A record can be persistent without being authoritative.

For example:

    Archive row
        = persistent application record

but:

    blockchain state
        = consensus state

Similarly:

    SQL listing
        = persistent Store state

but:

    underlying UTXO
        = blockchain state

And:

    app.options preference
        = persistent local preference

but:

    no consensus meaning

Storage duration and authority are separate concepts.

---

# 52. Persistence Does Not Imply Replication

A record can be persistent on one node without existing elsewhere.

For example:

    browser Archive
        ↓
    local browser database

can survive browser sessions without being replicated to other nodes.

Likewise:

    module SQL
        ↓
    Node A

does not imply:

    module SQL
        ↓
    Node B

The application must explicitly arrange for replication if it needs it.

---

# 53. Publication Does Not Imply Convenient Retrieval

A transaction can be published to the blockchain without making arbitrary application queries cheap or permanently available.

Blockchain history may be:

- pruned;
- incomplete on lightweight clients;
- inconvenient to query directly;
- represented through module-specific indexes.

Applications that need convenient historical retrieval may therefore use:

- Archive;
- module SQL;
- external services;
- application-specific indexes.

The blockchain's publication function and the application's retrieval requirements are different concerns.

---

# 54. `app.storage` Is Not a Replacement for Module SQL

Use `app.storage` when the application's persistence model naturally consists of transaction-shaped records.

Use module SQL when the application needs its own relational data model.

For example:

    transaction history
        → app.storage / Archive

while:

    marketplace inventory
        → Store SQL

or:

    username index
        → Registry SQL

This is not a strict rule.

A module can combine mechanisms when appropriate.

---

# 55. An Application Can Combine Storage Mechanisms

A sophisticated application may use several mechanisms simultaneously.

For example:

    blockchain transaction
          │
          ├── consensus/publication
          │
          └── module processing
                    │
                    ├── Archive
                    │
                    ├── module SQL
                    │
                    └── memory/cache

This is normal.

The important question is what each representation means.

Do not assume that one persistence mechanism must contain everything.

---

# 56. The Storage API Does Not Decide Application Architecture

`app.storage` provides persistence functionality.

It does not decide:

- whether the data should be on-chain;
- whether it should be private;
- whether it should be replicated;
- whether it should be indexed;
- whether it should be reorg-sensitive;
- whether it should be cached;
- whether it should be deleted;
- whether it should be served remotely.

Those are application requirements.

The AI must determine them from the feature being implemented.

---

# 57. Storage Selection Process

When implementing a new feature, ask:

### What data am I storing?

Is it:

- local preferences;
- transaction-shaped application data;
- relational module state;
- blockchain state;
- large files;
- ephemeral computation?

### Who needs the data?

- only this browser;
- this node;
- another peer;
- a service provider;
- many nodes;
- the entire network?

### Does the data need decentralized publication?

If yes, consider blockchain publication.

If no, there may be no reason to publish it on-chain.

### Does the data need convenient historical retrieval?

If yes, consider Archive or a module-specific index.

### Does the data require relational queries?

If yes, module SQL may be appropriate.

### Does the data need to survive local restart?

If yes, use an appropriate persistent local mechanism.

### Does the data need to survive blockchain reorganization?

Only if the application's semantics require the record to track longest-chain state.

---

# 58. Choosing `app.options`

Use `app.options` naturally for local application state such as:

- preferences;
- settings;
- wallet-related state;
- Keychain state;
- lightweight local application information.

Do not assume that `app.options` is a general database.

Do not use it merely because it is easy to serialize arbitrary objects.

If the application has substantial queryable transaction data, consider transaction persistence or module SQL instead.

---

# 59. Choosing `app.storage`

Use `app.storage` when the application wants to persist transaction-shaped application records through Saito's transaction storage interface.

Typical pattern:

    transaction
        ↓
    app.storage.saveTransaction()
        ↓
    Archive

Later:

    app.storage.loadTransactions()
        ↓
    Archive
        ↓
    transaction records

This is particularly useful when the application's data is naturally represented as Saito transactions.

---

# 60. Choosing Module SQL

Use module SQL when the module needs its own relational application data model.

Examples:

- marketplace records;
- approval states;
- indexes;
- lookup tables;
- operational metadata;
- application-specific relationships.

The module owns the schema.

The module owns the meaning of the records.

The database is local to the node running that module.

---

# 61. Choosing Blockchain Publication

Use blockchain publication when the application needs the properties of decentralized publication and consensus.

Examples include:

- public application events;
- ownership changes;
- Registry statements;
- NFTs;
- economically significant transactions;
- information other nodes should be able to observe through blockchain propagation.

Do not use blockchain publication merely because the application needs persistence.

---

# 62. Choosing Off-Chain Communication

Use off-chain communication when the application needs to send information to peers without necessarily publishing it to the blockchain.

This is particularly useful for:

- requests;
- responses;
- private application data;
- service communication;
- large data;
- information whose persistence is provided by Archive.

The application can then choose whether the received information should be persisted.

For example:

    off-chain request
        ↓
    service
        ↓
    saveTransaction()
        ↓
    Archive

---

# 63. Choosing External Storage

There is no requirement that every large object be placed into Archive.

An application can use external storage when that better fits the requirement.

For example:

- object storage;
- content delivery systems;
- application-specific databases;
- external services.

The blockchain can publish references or authorization information without storing the entire payload.

The right question is always:

> What does the application need the Saito network to do?

not:

> How can I put all of this data into Saito?

---

# 64. Common Storage Mistakes

### Mistake 1: Calling the blockchain the application database

The blockchain is not a general-purpose application database.

It provides decentralized publication, consensus, transactions, and UTXO state.

### Mistake 2: Assuming persistence requires blockchain publication

Archive, module SQL, app.options, and external storage can all persist information without putting it on-chain.

### Mistake 3: Assuming a transaction is always a blockchain transaction

Transaction-shaped objects can be sent off-chain and persisted through Archive.

### Mistake 4: Treating Archive as consensus state

Archive is a module.

Its database is not blockchain consensus.

### Mistake 5: Assuming every node has Archive data

Archive is node/module dependent.

### Mistake 6: Querying Archive's SQLite schema directly

Use the application-facing Storage/Archive APIs.

### Mistake 7: Treating module SQL as replicated state

Module SQL is normally local to the node.

### Mistake 8: Assuming SQL state automatically follows reorganizations

Database writes made by modules are not automatically reversed by Core.

### Mistake 9: Putting all application state in `app.options`

Options are local persistent state, not a general relational database.

### Mistake 10: Assuming large data automatically belongs in one specific storage layer

The application must determine its availability, persistence, query, privacy, and publication requirements.

### Mistake 11: Assuming stored data is authoritative

Persistence and authority are separate concepts.

### Mistake 12: Assuming data published on-chain is automatically convenient to query

Applications often need indexes or Archive services for efficient retrieval.

---

# 65. AI Development Rule: Follow the Data

When an AI is asked to implement a feature involving data, it should first trace the data lifecycle.

Ask:

    Where is this data created?

    Who needs it?

    Does it need to be public?

    Does it need to be private?

    Does it need blockchain publication?

    Does it need persistence?

    Does it need to survive restart?

    Does it need to survive a reorganization?

    Does it need relational queries?

    Does it need to be available on other nodes?

    Does it need to be available to lightweight clients?

    Is it a transaction-shaped object?

    Is it merely local state?

The answers determine the persistence mechanism.

Do not start by choosing a database.

---

# 66. AI Development Rule: Do Not Invent a Server Database

An AI coming from conventional web development may instinctively create:

    frontend
        ↓
    API controller
        ↓
    service
        ↓
    repository
        ↓
    database

Saito often does not require this architecture.

The application may instead use:

    module
        ↓
    app.storage
        ↓
    Archive

or:

    module
        ↓
    module SQL

or:

    module
        ↓
    transaction
        ↓
    blockchain

or:

    module
        ↓
    off-chain request
        ↓
    remote module

The simplest correct Saito-native architecture should be preferred.

---

# 67. AI Development Rule: Do Not Invent a Universal Storage Layer

Saito already has storage mechanisms.

Do not create another generic:

    StorageService
    Repository
    DatabaseManager
    PersistenceController
    DataStore

merely to make the architecture look conventional.

First determine whether the feature can use:

    app.storage
    app.options
    module SQL
    blockchain
    peer communication
    Archive
    existing application services

If an additional abstraction is genuinely required, establish that requirement first.

---

# 68. AI Development Rule: Follow Existing Module Boundaries

If a module already owns a particular database or service, use its existing APIs.

For example:

- do not directly query Registry's SQLite database;
- do not directly query Archive's SQLite database;
- do not create a second username database if the application needs Registry names;
- do not duplicate Store's application state in another persistence system without a reason.

The module that owns the data should generally own the interface through which other modules consume it.

---

# 69. AI Development Rule: Understand Locality

Whenever a feature reads data, determine where that data exists.

For example:

    app.options
        → this local installation

    module SQL
        → this node/module

    local Archive
        → this Archive instance

    remote Archive
        → remote Archive provider

    blockchain
        → consensus/publication network state

    peer request
        → data provided by another participant

Do not assume that because a record exists in one place, every Saito participant can access it.

---

# 70. AI Development Rule: Understand Publication

Whenever a feature writes data, determine whether the application wants:

    local persistence

or:

    service persistence

or:

    peer distribution

or:

    blockchain publication

These are different operations.

A call to:

    app.storage.saveTransaction()

is not equivalent to:

    propagateTransaction()

The first requests persistence.

The second publishes a transaction through the blockchain network.

---

# 71. AI Development Rule: Understand Reorganization Semantics

When storing information derived from blockchain transactions, ask:

> Does the meaning of this record depend on the transaction remaining in the longest chain?

If no:

    normal historical persistence may be sufficient.

If yes:

    the module needs explicit reorganization handling.

Do not expect Archive, SQL, or `app.storage` to automatically reverse application state.

---

# 72. AI Development Rule: Understand Transaction Envelopes

When an application has data that can naturally be represented by a Saito transaction, consider whether the transaction object itself can serve as the application-data envelope.

It can potentially be:

    created
    signed
    transmitted off-chain
    persisted
    retrieved
    published on-chain

depending on the application.

Do not assume that creating a Transaction object commits the application to blockchain publication.

---

# 73. AI Development Rule: Do Not Confuse Storage With Consensus

Storage answers:

> Where can I save and retrieve this information?

Consensus answers:

> What state does the network collectively recognize as part of the blockchain?

These are different questions.

A database row does not become consensus state because it is durable.

A transaction does not become consensus state because it exists in an Archive.

A local option does not become network state because it is persistent.

A blockchain transaction does not become a convenient query database merely because it was published.

---

# 74. Summary

Saito does not have one universal application database.

The blockchain provides decentralized publication, consensus, transactions, and UTXO state.

`app.options` provides local persistent application/wallet state.

`app.storage` provides an application-facing persistence API, particularly for transaction-shaped data.

Archive is the current module that provides the main transaction persistence implementation behind `app.storage`.

Module SQL provides module-owned relational application state.

Off-chain transaction envelopes can be persisted without blockchain publication.

Vault demonstrates how a signed transaction-shaped object can carry private application data to an Archive provider without being propagated to the blockchain.

Registry demonstrates how a module can maintain its own SQL database while also publishing signed statements through blockchain transactions.

Replication is application-specific.

Data availability is application-specific.

Reorganization handling is application-specific.

The blockchain is not a general-purpose database.

The central architectural principle is:

> Use the blockchain when the application needs decentralized publication and consensus. Use the appropriate persistence mechanism when the application needs storage. Do not confuse the two.

And the corresponding AI development principle is:

> Determine what the application needs the data to do before choosing where to put it.

# Saito UI Components and Application Interfaces

This document describes how Saito applications should structure their user interfaces.

The purpose is not to define a UI framework. Saito does not require React, Vue, a virtual DOM, a component base class, a UI store, or a formal component lifecycle.

Instead, Saito applications should be constructed from ordinary JavaScript objects that represent meaningful pieces of the interface.

The central principle is:

> A UI component is an object that renders something to the page and owns the behavior associated with that part of the interface.

The preferred architecture is to create domain objects and substantial, self-contained UI components, while keeping the module's main file small and recognizable as a Saito module.

This is particularly important for AI-generated code. A good Saito application should make it obvious where a UI change belongs, should keep related behavior together, and should prevent the main module file from becoming a large collection of unrelated rendering and helper functions.


## 1. Saito Does Not Have a Generic Component Framework

There is no general Saito `Component` base class that application developers should inherit from.

There is no requirement to create:

    Component
    SaitoComponent
    SaitoComponentTemplate

or a similar hierarchy.

Saito does contain specialized UI infrastructure, including things such as `UIModTemplate`, `SaitoOverlay`, and game-specific UI objects. These are real pieces of the framework, but they should not be mistaken for a universal component architecture.

Ordinary application UI should normally use ordinary JavaScript classes.

For example:

    class Main {

      constructor(app, mod) {
        this.app = app;
        this.mod = mod;
      }

      render() {
        ...
      }

      attachEvents() {
        ...
      }
    }

The important properties are not inheritance or framework registration.

The important properties are:

    app
    mod
    render()
    ownership
    coherent responsibility

A UI component exists because it represents a meaningful part of the interface, not because it belongs to a particular framework class.


## 2. What Counts as a UI Component

If an object renders something visually to the page, it can be treated as a UI component.

This remains true even if the object is also a domain object.

For example, a Tweet object can contain:

    application data
    transaction data
    application behavior
    render()
    attachEvents()

That is a legitimate UI component.

Another application may instead separate the underlying domain object from its visual representations:

    SaitoNFT
        domain object

    SaitoNFTCard
        card UI

    SaitoNFTOverlay
        detailed UI

    SaitoNFTOtherOverlay
        another representation

That is also legitimate.

The distinction is not:

    domain object OR UI component

It can be:

    domain object AND UI component

or:

    domain object
        +
    one or more UI components

The appropriate structure depends on how the application uses the object.

The important question is:

> Where should the behavior and rendering responsibility live so that the application remains understandable and easy to modify?


## 3. UI Components Should Normally Receive `app` and `mod`

For module-owned UI components, prefer:

    constructor(app, mod, ...)

For example:

    class Main {

      constructor(app, mod) {
        this.app = app;
        this.mod = mod;
      }

    }

`app` is the Saito runtime.

`mod` is the application module that owns the component.

This gives a component direct access to the Saito runtime and to the application's own objects without introducing a dependency-injection framework or service layer.

For example:

    this.app.wallet
    this.app.network
    this.app.connection

and:

    this.mod.database
    this.mod.tweets
    this.mod.transactions
    this.mod.main

are ordinary and appropriate dependencies.

A component should not need a global registry to discover its application.

Saito-level framework UI may not need `mod`. For example, a shared Saito UI object may only require `app`.

The convention is primarily for module-owned application objects.


## 4. UI Components Should Be Substantial and Self-Contained

The preferred Saito UI component is not merely a thin wrapper around another function.

A component should contain the behavior associated with the piece of UI that it represents.

For example, if a component displays a purchase interface and contains:

    Buy button
    price
    NFT information
    loading state
    confirmation behavior

then the component should generally contain the code that handles those interactions.

The goal is for the component to be understandable as a unit.

For example:

    PurchaseOverlay
        render()
        attachEvents()
        onClick()
        ...
    
rather than:

    Main
        showPurchaseOverlay()
        getPurchaseButton()
        handlePurchaseButton()
        processPurchase()
        updatePurchaseHTML()
        showPurchaseAlert()
        ...

The latter approach causes the module's main file to become a collection of UI implementation details.

The former keeps the UI responsibility where it belongs.


## 5. The Main Module File Should Remain Small

The module's main JavaScript file is the architectural map of the application.

It should primarily contain the functions defined by `ModTemplate` and the application's participation in the Saito lifecycle.

Typical functions include:

    constructor()
    installModule()
    initialize()
    render()
    attachEvents()
    onConfirmation()
    onNewBlock()
    onChainReorganization()
    onPeerServiceUp()
    handlePeerTransaction()
    respondTo()
    returnServices()
    returnModule()
    webServer()

Not every module needs all of these.

The principle is:

> Keep the main module focused on being a Saito module.

The main module should make it possible to understand:

    what the module is
    what it initializes
    what it listens for
    what it sends
    what major objects it owns
    what UI it renders

Detailed application behavior should normally live in domain objects, transaction files, database objects, and UI components.

It is possible to add functions to the main module when there is a genuine reason.

The problem is not the existence of additional functions.

The problem is allowing the main module to become the place where all application behavior accumulates.


## 6. Keep AI-Generated Code Out of `mod.js` When It Belongs Elsewhere

One of the most important rules for AI-assisted development is:

> Do not put application behavior into `mod.js` merely because the AI needs somewhere to put it.

A common failure mode is:

    mod.js
        render UI
        parse HTML
        handle buttons
        manage overlays
        update individual objects
        contain helper functions
        manipulate CSS
        process transactions
        access databases
        manage page state
        coordinate unrelated components

This produces what can be thought of as "Frankencode": a module that technically works but has accumulated unrelated responsibilities because the AI kept adding the next function to the same file.

The better structure is:

    mod.js
        Saito lifecycle
        application composition

    lib/domain-object.js
        domain behavior

    lib/ui/main.js
        main page UI

    lib/ui/sidebar.js
        sidebar UI

    lib/ui/overlay.js
        overlay UI

    lib/transactions.js
        transaction behavior

    lib/database.js
        database behavior

    web/
        templates and CSS

This makes changes local.

If the user asks:

> Change the purchase overlay.

the AI should be able to find the purchase overlay and modify it.

It should not need to modify the module's main file merely because the overlay is part of the application.


## 7. Think About the Application as a UI First

For applications with substantial interfaces, begin by understanding the visible structure.

Think about:

    What is on the page?

    What are the major regions?

    What belongs inside each region?

    Which object should render each region?

    Which components contain which other components?

    Which components are rendered immediately?

    Which components appear later?

    Which components are updated when data arrives?

This is especially useful in Saito because rendering does not necessarily happen as one complete operation.

A simplified sequence may be:

    initialize
        ↓
    render initial UI
        ↓
    peer becomes available
        ↓
    remote data arrives
        ↓
    confirmation arrives
        ↓
    UI changes
        ↓
    another event changes application state
        ↓
    UI updates again

The exact sequence is application-specific.

The important point is that the UI is not necessarily a static page generated once at initialization.

Live Saito applications receive data and events after the initial render.


## 8. Compose the UI Hierarchically

A useful Saito pattern is hierarchical UI ownership.

For example:

    Main
      ├── Header
      ├── Sidebar
      └── Content
            └── TweetManager
                  └── Tweet

Or:

    Main
      ├── Menu
      ├── ListingManager
      └── PurchaseOverlay

Or:

    Main
      └── Game
            ├── PlayerPanel
            ├── Board
            └── Controls

The parent constructs and owns the children.

The child knows how to render and manage its own region.

This allows:

    Main.render()

to conceptually become:

    this.header.render();
    this.main.render();
    this.sidebar.render();

The exact object names do not matter.

The architectural principle is that the UI should have recognizable ownership boundaries.


## 9. The Page Entry Point

A normal web application has an `index.js` entry point that can handle page-level concerns.

For example, it may provide:

    social graph information
    metadata for shared links
    preview images
    short-link handling
    other web-server/page concerns

These concerns belong at the page entry point rather than being mixed into application UI components.

The body normally provides the application's Saito container.

A typical structure is conceptually:

    body
        module-name
            saito-container

The module's main UI component can then render its interface into that container.

For example:

    new Main(app, mod, '#saito-container')

followed by:

    main.render()

The precise implementation may vary.

The important architectural distinction is:

    index.js
        page-level web concerns

    main UI component
        application interface

    subordinate components
        individual UI regions

Saito's 404 handling can also provide the Saito page/container structure. New applications should follow the existing repository conventions rather than inventing a separate page bootstrapping architecture.


## 10. Render Is the Core UI Operation

A UI component should have a `render()` function.

At minimum:

    render()

is the defining operation of a component.

Rendering normally means producing HTML and inserting it into the appropriate part of the DOM.

Saito commonly uses the browser helpers for this:

    app.browser.addElementToSelector()
    app.browser.replaceElementBySelector()
    app.browser.replaceElementContentBySelector()

There is no requirement for a virtual DOM.

A component can simply create HTML and write it into the page.

For example:

    render() {
      let html = this.template();
      this.app.browser.addElementToSelector(this.container, html);
    }

The exact browser API should follow the existing Saito implementation and surrounding application code.


## 11. `attachEvents()` Is a Valid and Preferred Pattern

Saito applications use multiple event-binding patterns.

Do not treat the existence of multiple patterns as a reason to introduce a new framework.

A particularly useful pattern is:

    render()
    attachEvents()

For example:

    render() {
      let html = this.template();
      this.app.browser.replaceElementBySelector(this.container, html);
      this.attachEvents();
    }

    attachEvents() {
      ...
    }

This makes the relationship explicit:

    render the interface
        ↓
    attach behavior to the interface

A component may also perform event binding directly inside `render()` when that is simpler.

Both approaches are valid.

For new code, when event binding is substantial enough to deserve its own function, prefer:

    render()
    attachEvents()

rather than scattering event-binding logic throughout unrelated functions.


## 12. Render the UI, Then Bind Its Behavior

A component should normally render the DOM before trying to attach listeners to elements in that DOM.

Conceptually:

    render()
        ↓
    HTML exists
        ↓
    attachEvents()
        ↓
    user can interact

For example:

    render() {
      this.app.browser.replaceElementBySelector(
        this.container,
        this.template()
      );

      this.attachEvents();
    }

The event handlers should belong to the component that owns the UI.

This avoids a common anti-pattern where the main module reaches into a child component's DOM and attaches behavior to it.


## 13. Use Event Delegation When It Simplifies Dynamic UI

Event delegation is particularly useful for lists of objects that can be added, removed, or re-rendered.

For example, a manager can render:

    <article data-id="TRANSACTION_SIGNATURE">
        ...
    </article>

and listen on the stable parent container.

When a click occurs, the manager can obtain the transaction signature and recover the relevant object.

Conceptually:

    user clicks article
        ↓
    read data-id
        ↓
    identify transaction
        ↓
    recover domain object
        ↓
    perform action

This avoids needing to attach a new listener to every object whenever the list changes.

It is especially useful for:

    feeds
    lists
    galleries
    inventories
    transaction lists
    game elements
    dynamically generated controls


## 14. Transaction Signatures Make Excellent DOM Data IDs

When a UI element corresponds to a Saito transaction, the transaction signature is often the natural identifier to put into the DOM.

For example:

    data-id="transaction-signature"

The manager can then recover the object when the event fires.

Conceptually:

    data-id
        ↓
    transaction signature
        ↓
    mod.getTweet(signature)
        ↓
    Tweet
        ↓
    action

This is preferable to creating an unrelated UI identifier when the transaction signature already uniquely identifies the application object.

The same principle can apply to other stable application identifiers.

The important point is to use an identifier that lets the component recover the underlying object without copying the entire object into the DOM.


## 15. Keep the Underlying Transaction Available

When a domain object is created from a transaction, it is often useful to retain:

    this.tx = tx

The transaction is the protocol object.

The domain object is the application's representation of that transaction.

For example:

    Tweet
        this.tx
        this.text
        this.username
        this.images

The UI component can then work with the Tweet while the underlying transaction remains available.

This is particularly valuable when the UI is identified by transaction signature.

The transaction remains the stable object connecting:

    protocol
    application object
    UI


## 16. Domain Objects and UI Components Can Be Combined

There is no requirement to split every object into:

    Model
    View
    Controller

Saito applications should not automatically reproduce MVC because an AI recognizes a UI.

A central domain object may naturally contain its own rendering behavior.

For example:

    Tweet
        constructor(app, mod, tx)
        render()
        attachEvents()

This can be an excellent structure when the Tweet is itself the natural unit of UI behavior.

Alternatively:

    Tweet
        application object

    TweetCard
        UI representation

may be more appropriate when the same Tweet needs multiple visual representations.

The decision should follow the application.

Do not split an object simply to satisfy a theoretical architecture.

Do not combine objects simply to avoid creating a second component.

Use the boundary that makes the application easiest to understand and modify.


## 17. Multiple UI Representations Are Normal

A domain object can have several UI representations.

For example:

    SaitoNFT
        ↓
        ├── NFT card
        ├── full-data overlay
        ├── purchase overlay
        ├── selection overlay
        └── other application-specific views

Each representation can be a separate UI component.

This is useful when the same underlying object appears in different contexts.

The domain object owns the application concept.

The UI component owns a particular visual representation.


## 18. Components Should Own Their Own Actions

A component should contain the actions associated with its interface.

For example, if a component has:

    Invite button

then the component should normally contain the code handling that click.

If it has:

    Drag-and-drop area

the component should normally contain the drag-and-drop behavior.

If it has:

    Submit button

the component should normally contain the submit behavior.

Conceptually:

    class GameInvite {

      render() {
        ...
        this.attachEvents();
      }

      attachEvents() {
        ...
      }

      onClick() {
        ...
      }
    }

This keeps the behavior next to the UI that invokes it.


## 19. Name Functions Around User Interaction

Functions inside UI components should preferably reflect recognizable UI actions.

Good examples include:

    onClick()
    onSubmit()
    onDragDrop()
    onClose()
    onSelect()
    onChange()

These names describe what happened from the user's perspective.

They make it easier for a developer or AI to understand the component.

Avoid inventing elaborate helper functions merely because the AI needs somewhere to put two lines of code.

For example, avoid:

    propagateSelectedTransaction()

if the only purpose of that function is:

    this.app.network.propagateTransaction(tx);

and it is only called from one click handler.

Instead, it may be clearer to handle that operation directly inside the relevant interaction.

The goal is not to prohibit helper functions.

The goal is to create them when they represent meaningful reusable behavior, rather than creating them automatically.


## 20. Avoid Helper Function Creep

AI-generated code frequently produces functions like:

    getCurrentModule()
    getTweetData()
    processButtonClick()
    updateComponent()
    performAction()
    executeOperation()
    handleData()
    callModuleFunction()

where each function contains only one or two lines.

This makes code longer without making it more understandable.

For example, this:

    handleSubmit() {
      this.submitTransaction();
    }

    submitTransaction() {
      this.mod.sendTransaction(this.tx);
    }

may be worse than simply putting the meaningful operation in `handleSubmit()` if there is no second caller and no independent concept.

Likewise, this:

    getDatabase() {
      return this.mod.database;
    }

is normally unnecessary.

The component already has:

    this.mod

Use it.

Prefer:

    this.mod.database

over:

    this.getDatabase()

unless the function represents meaningful behavior.

A good rule for AI is:

> Do not create a helper function merely to avoid writing a short expression.

Create a function when it gives the application a meaningful semantic boundary.


## 21. Do Not Move UI Logic Back Into the Module

A common mistake is to create a component but then leave its behavior in the module.

For example:

    Main.renderPurchaseButton()

followed by:

    mod.showPurchaseAlert()
    mod.handlePurchaseClick()
    mod.updatePurchaseHTML()

This defeats the purpose of the component.

Instead:

    PurchaseComponent
        render()
        attachEvents()
        onClick()
        ...

The module should construct the component and provide it with the application context.

The component should own the details of its interface.


## 22. Avoid Extracting UI State Into Module Helpers

Another common AI pattern is to have the module inspect HTML and reconstruct its understanding of the UI.

For example:

    mod.getSelectedElement()
    mod.getButtonFromHTML()
    mod.extractCurrentState()
    mod.parseRenderedData()

This creates two representations of the same thing:

    UI component
        actual interface

    module helper
        AI-generated interpretation of interface

Eventually the HTML changes but the helper is not updated.

The application then contains stale assumptions about its own UI.

The component that owns the interface should normally also own the logic needed to understand and manipulate that interface.


## 23. A Component Should Be a Localized Black Box

A useful component exposes a small interface to its parent.

For example:

    render()

may be enough.

Or:

    render()
    update()

Or:

    render()
    attachEvents()

The parent should not need to understand the component's internal DOM structure.

For example:

    Main
        ↓
    PurchaseOverlay

should not require Main to know:

    which button exists
    which CSS class identifies it
    how the overlay handles confirmation
    how the overlay updates its HTML

Those details belong to PurchaseOverlay.

This is valuable for both humans and AI.

If a user asks to change the purchase interface, the AI can inspect the purchase component rather than searching through the entire module.


## 24. Parent Components Own Child Components

A parent component should normally construct and own its children.

For example:

    class Main {

      constructor(app, mod) {
        this.app = app;
        this.mod = mod;

        this.sidebar = new Sidebar(app, mod);
        this.content = new Content(app, mod);
      }

      render() {
        ...
        this.sidebar.render();
        this.content.render();
      }
    }

This creates a visible ownership tree.

It is preferable to having unrelated components discover each other through global registries.

The parent knows:

    what it owns
    where it renders
    when it renders

The child knows:

    how it renders
    how it behaves
    what data it displays


## 25. Callbacks Are Useful for Child-to-Parent Interaction

A child component may need to notify its parent about an interaction.

A callback is often sufficient.

For example:

    new Menu(app, mod, {
      onNavigate: (page) => {
        ...
      }
    });

The child can remain focused on its UI while the parent decides what navigation means.

Callbacks are often preferable to introducing a global event merely to communicate between two objects that already have an explicit parent-child relationship.


## 26. Use `app.connection` for Genuine Cross-Component or Cross-Module Events

`app.connection` is an application-wide event mechanism.

It is useful when one component or module needs to listen for an event generated elsewhere.

For example:

    component A
        ↓
    app.connection
        ↓
    component B

This is appropriate when the participants are not naturally parent and child.

It can also be appropriate for events that genuinely represent application-wide notifications.

It should not automatically replace direct method calls.

If:

    Main

owns:

    Sidebar

then it is generally simpler for Main and Sidebar to communicate directly.

Do not turn every UI interaction into a global event.

Global events make it harder to determine where behavior originates and where it will be received.


## 27. Be Careful With Global UI Events

Because `app.connection` is process-wide, an event can be observed by components that are not visually related.

For example, a background module could emit an event and cause another module's UI to open an overlay.

That may be intentional.

But it can also create surprising coupling.

A useful distinction is:

    direct method/callback
        explicit component relationship

    app.connection
        cross-boundary event

Use the mechanism that reflects the actual relationship.


## 28. Templates Should Primarily Contain HTML

A component may have a template file.

For example:

    lib/ui/main.js
    lib/ui/main.template.js

or:

    lib/tweet.js
    lib/tweet.template.js

The template should primarily describe the HTML structure.

For example:

    module.exports = (data) => `
      <div class="tweet">
        ...
      </div>
    `;

The template tells the developer:

    what HTML exists
    what DOM structure exists
    which elements are present
    which data is displayed

The JavaScript component tells the developer:

    what the component does
    when it renders
    how it reacts to interaction
    how it updates
    how it communicates with the module


## 29. Keep Application Logic in the JavaScript Component

Templates can contain presentation branching when necessary.

But substantial application behavior should not be moved into templates merely because it is possible.

Avoid turning the template into another application logic layer.

For example, network calls, database access, transaction construction, and complex application state management should not be hidden inside template functions.

A developer examining:

    component.js

should be able to understand the component's behavior.

A developer examining:

    component.template.js

should be able to understand the component's HTML structure.


## 30. Keep UI Logic Close to the User Interaction

Suppose a component contains:

    <button>
        Accept
    </button>

The code handling that action should be close to the component and preferably recognizable as an interaction.

For example:

    attachEvents() {
      ...
      button.onclick = () => {
        this.onClick();
      };
    }

    onClick() {
      ...
    }

The important thing is that a developer can find the behavior by examining the component.

Do not scatter the behavior through unrelated module helpers unless the behavior is genuinely shared or belongs to another domain concept.


## 31. CSS Should Correspond to the Component Structure

The HTML template defines the DOM.

The CSS defines how that DOM is presented.

The JavaScript defines behavior.

A useful organization is therefore:

    component.js
    component.template.js
    component.css

For example:

    lib/ui/sidebar.js
    lib/ui/sidebar.template.js
    web/css/sidebar.css

or:

    lib/tweet.js
    lib/tweet.template.js
    web/css/redsquare-tweet.css

The exact file naming convention can vary.

The important principle is localization.

If a developer wants to modify a component, the relevant:

    JavaScript
    HTML
    CSS

should be easy to find.


## 32. Use a Component or Page Root as the Styling Context

The UI should normally provide a recognizable root element for the component or page.

The internal elements can then be styled relative to that root.

Conceptually:

    .my-component {
        ...
    }

    .my-component .header {
        ...
    }

    .my-component .content {
        ...
    }

The purpose is to create a styling context.

The goal is not to invent elaborate namespace conventions for every selector.

The goal is also not to create a giant collection of generic global styles that can accidentally affect unrelated applications.

Follow the existing Saito CSS conventions for the application being modified.

When creating a new application, give major UI regions a clear root so their styling remains localized.


## 33. Do Not Over-Define Typography and Spacing

Applications should be able to accept Saito's existing defaults where appropriate.

Do not unnecessarily specify:

    font-size
    line-height
    margin
    padding
    font-family
    letter-spacing

on every component merely because an AI believes every component needs explicit styling.

If the Saito defaults already provide the desired typography or spacing, use them.

Application-specific CSS should describe actual application requirements rather than reproducing a complete design system inside every module.

The goal is to allow applications to inherit Saito's defaults while still permitting deliberate application-specific styling.


## 34. Responsive Behavior Should Normally Be CSS

Responsive behavior should generally be handled through the component's CSS and responsive layout rules.

Use media queries and structural CSS when the problem is:

    width
    spacing
    columns
    visibility
    stacking
    typography
    layout

JavaScript should be used when responsive behavior genuinely requires runtime information or behavior that CSS cannot provide.

For example, JavaScript may be appropriate when:

    an interaction changes based on measured dimensions
    a game HUD must calculate available play area
    a component must respond to runtime state rather than merely viewport size

Do not use JavaScript to reproduce layout behavior that CSS already handles naturally.


## 35. Do Not Build a Virtual DOM

Saito's ordinary application UI does not require:

    React
    Vue
    virtual DOM
    JSX
    component reconciliation
    global UI state stores

A Saito component can render HTML directly.

The application can then update or replace the relevant DOM region when necessary.

This is intentionally simple.

The simplicity is useful because the UI code is directly connected to:

    HTML
    DOM
    CSS
    application objects


## 36. Do Not Create a Global UI Store

Application state should remain with the application objects that own it.

For example:

    mod.tweets

can remain the application collection of Tweets.

A TweetManager can render those Tweets.

A Tweet can render itself.

There is normally no need to create:

    UIStore
    ReduxStore
    GlobalViewState
    ComponentRegistry

simply to move state around the application.

A component may maintain presentation state such as:

    this.expanded
    this.selected
    this.editing

but that does not make the component the authoritative owner of the application's underlying data.


## 37. Do Not Turn Components Into Hidden Databases

A UI component may cache data when there is a reason to do so.

But the component should not silently create a second authoritative representation of application state.

For example, if:

    mod.tweets

contains the application's Tweet objects, do not create another unrelated Tweet collection inside the UI merely because rendering is easier that way.

The component can maintain:

    rendered state
    selection state
    temporary state
    presentation state

without becoming the application's database.


## 38. Data Should Flow Through Domain Objects

A useful Saito pattern is:

    transaction
        ↓
    domain object
        ↓
    UI component

For example:

    transaction
        ↓
    Tweet
        ↓
    TweetCard

The transaction remains the protocol object.

The domain object gives the application a meaningful representation.

The UI component gives the object a visual representation.

This makes UI changes easier because the UI can operate on meaningful objects rather than repeatedly parsing raw transaction structures.


## 39. Pass Transactions Rather Than Reconstructing Their Data

When application data comes from a transaction, prefer passing the transaction object through the application rather than extracting a large collection of fields into middleware.

For example:

    addTweet(tx)

can construct or update the Tweet representation from the transaction.

This allows changes to the transaction format to propagate naturally through:

    serialization
    storage
    application object
    UI

Instead of requiring every intermediary layer to know the transaction's complete structure.

The UI component can use the domain object.

The domain object can retain the transaction.

This keeps the protocol object available without forcing every UI layer to understand it.


## 40. UI Updates May Be Triggered by Saito Events

A component may render before the data it ultimately displays exists.

For example:

    render initial page
        ↓
    peer connection becomes available
        ↓
    request data
        ↓
    receive transaction
        ↓
    create domain object
        ↓
    render component

Or:

    render purchase UI
        ↓
    blockchain confirmation
        ↓
    update purchase state
        ↓
    update component

This is normal Saito behavior.

Do not assume that all application data exists at `initialize()` time.

Do not assume that all remote data exists when the first UI render occurs.


## 41. Initial Rendering and Live Updates Are Different Concerns

A component may initially render:

    loading
    empty
    placeholder

and later replace or enrich that content.

For example:

    render()
        ↓
    show loading state
        ↓
    data arrives
        ↓
    update()

This is preferable to blocking the entire application while waiting for optional remote data.

The exact pattern depends on the component.

Some components can render synchronously.

Others may need asynchronous work.

The important principle is that the component should own the behavior associated with its own loading and update states.


## 42. Avoid Network Calls in Templates

A template should generally transform data into HTML.

It should not become a network layer.

Avoid patterns such as:

    template()
        fetch data
        query peer
        access database
        modify application state
        return HTML

Instead:

    component
        obtains data
        prepares state
        calls template
        renders HTML

This keeps the data flow visible in the component's JavaScript file.


## 43. Components May Perform Application Operations

A UI component is not required to be purely presentational.

A component can legitimately:

    call module methods
    create transactions
    request data
    update application state
    communicate with peers
    open overlays
    modify its own DOM

when those operations are part of the behavior represented by that component.

The important distinction is ownership.

A purchase component can purchase.

A chat component can send a chat message.

A game component can perform a game action.

A Tweet component can handle Tweet interaction.

The module should not become the universal controller for all of these operations.


## 44. Managers Are Useful but Not Mandatory

Names such as:

    Manager
    Main
    Sidebar
    Teaser
    Card
    Overlay

are conventions rather than framework requirements.

A Manager is useful when it represents a meaningful composition boundary.

For example:

    TweetManager
        renders many Tweets
        handles feed behavior
        manages list interaction

The module may own the Tweet collection while the Manager owns the presentation of that collection.

There is no requirement that every list have a Manager.

Do not create a Manager merely because another Saito application has one.

Create one when it gives the application a useful boundary.


## 45. A Manager Can Own List Interaction Without Owning the Data

For example:

    mod.tweets
        application collection

    TweetManager
        UI composition

    Tweet
        individual object

The Manager can determine:

    which Tweets are visible
    where they appear
    how scrolling works
    which DOM element was clicked
    which Tweet corresponds to a data ID

while the module remains the owner of the application's Tweet collection.

This separation gives the UI a useful boundary without inventing another database.


## 46. Overlays Are UI Components

An overlay is simply another UI responsibility.

Saito provides `SaitoOverlay`, but application overlays may be ordinary objects built around it.

For example:

    PurchaseOverlay
    ProfileOverlay
    NFTOverlay
    SettingsOverlay

may each have:

    constructor()
    render()
    attachEvents()
    onClose()
    ...

An overlay should own its own presentation and interaction behavior.

If an overlay needs to notify its parent, callbacks are often sufficient.

Do not require the main module to contain every overlay's implementation merely because the overlay belongs to the module.


## 47. Game UI Is a Special Case, Not a Different Philosophy

Games have specialized framework infrastructure such as:

    GameTemplate
    GameHud
    SaitoOverlay

Game UI is often more stateful and interactive than ordinary application UI.

The game module may own a long-lived HUD and other game-specific UI objects.

This does not require ordinary web-style MVC.

The same basic principle still applies:

    game module
        owns game application state

    game UI components
        render and manage their own visual responsibilities

The exact game architecture should follow the Saito Game Engine conventions rather than being imported from a generic web framework.


## 48. Use the Existing Saito UI Patterns

Saito contains multiple generations of UI code.

Some applications use:

    render()
    attachEvents()

Some components use:

    render()

with events bound directly.

Some older components communicate through:

    app.connection

Some newer components use direct ownership and callbacks.

Some domain objects render themselves.

Other domain objects have separate cards and overlays.

These differences do not mean that Saito requires all applications to be rewritten into one rigid pattern.

When creating new code, prefer the clearer and more localized modern pattern:

    hierarchical ownership
    substantial UI components
    render()
    attachEvents() when useful
    direct calls and callbacks
    app.connection for genuine cross-boundary events
    transaction/domain objects as application data
    localized CSS and templates


## 49. Do Not Copy Legacy Architecture Merely Because It Exists

Existing Saito applications are valuable sources of examples.

They are not all canonical implementations.

An AI should distinguish:

    current preferred direction
    legitimate specialized patterns
    older patterns
    historical compatibility code

For example, an older application may use global events extensively.

That does not mean a new application should.

Another application may put rendering directly into its main module.

That does not mean a new application should.

Another may use a domain object that renders itself.

That may still be an excellent pattern.

The AI should understand the reason for the structure rather than copying the syntax mechanically.


## 50. Localize Changes

One of the major benefits of this architecture is that a UI request should usually map to a small set of files.

For example:

    "Change how Tweets are displayed."

might lead to:

    lib/tweet.js
    lib/tweet.template.js
    web/css/redsquare-tweet.css

A request such as:

    "Change the sidebar."

might lead to:

    lib/ui/sidebar.js
    lib/ui/sidebar.template.js
    web/css/sidebar.css

A request such as:

    "Change the purchase overlay."

might lead to:

    lib/ui/overlays/purchase.js
    lib/ui/overlays/purchase.template.js
    web/css/purchase.css

The exact files depend on the application.

The architectural goal is:

> A change should be localized to the object that owns the behavior.


## 51. This Architecture Is Especially Useful for AI

AI systems tend to create abstractions when they cannot identify where behavior belongs.

If the main module is responsible for everything, an AI may respond to every new requirement by adding another helper function to the module.

That produces:

    more functions
    more indirection
    more duplicated state
    more stale assumptions
    larger files
    harder review

A component-oriented Saito application gives the AI clearer boundaries.

For example:

    user asks to change NFT card
        ↓
    find NFT card component
        ↓
    inspect its template
        ↓
    inspect its CSS
        ↓
    modify those files

The AI does not need to understand the entire application to make a localized UI change.


## 52. UI Components Should Be Easy for AI to Inspect

A good component should make its responsibility obvious from its file.

A developer should be able to open:

    purchase.js

and understand:

    what it renders
    what data it receives
    what actions it supports
    what happens when the user interacts with it

The AI should not have to follow:

    UI service
        ↓
    controller
        ↓
    presenter
        ↓
    view model
        ↓
    repository
        ↓
    component adapter

to determine what a button does.

Those layers are not inherently forbidden.

They simply should not be introduced without a genuine architectural reason.


## 53. Prefer Fewer, Fatter Functions Over Fragmentation

When a function represents a coherent action, it is often better to keep its implementation together.

For example:

    onClick() {
      const tx = this.mod.createPurchaseTransaction(this.nft);
      this.app.network.propagateTransaction(tx);
      this.showWaitingState();
    }

may be easier to understand than:

    onClick() {
      this.createPurchase();
    }

    createPurchase() {
      this.prepareTransaction();
    }

    prepareTransaction() {
      this.buildTransaction();
    }

    buildTransaction() {
      ...
    }

If those functions have no independent meaning and no reuse requirement, the additional layers make the code harder to follow.

This does not mean long functions are always good.

It means that functions should be split because the resulting boundaries represent meaningful concepts, not because an AI assumes every operation deserves a helper.


## 54. Extract a Function When It Creates a Real Boundary

A helper function is justified when:

    it is reused
    it represents a meaningful domain concept
    it isolates substantial complexity
    it creates a useful test boundary
    it is independently understandable
    it separates a genuinely different responsibility

For example:

    createPurchaseTransaction()

may be appropriate if transaction creation is substantial application logic used in multiple places.

But:

    getDatabase()
        return this.mod.database

usually is not.

The goal is semantic organization, not maximum function count.


## 55. Do Not Create Controllers, Services, or View Models Automatically

A conventional web AI may attempt to create:

    Controller
    Service
    Repository
    ViewModel
    Presenter
    Store
    Dispatcher

before implementing a feature.

Do not do this automatically.

First determine whether the application already has a meaningful object that owns the responsibility.

Often the answer will be:

    module
    domain object
    UI component
    transaction file
    database object

Use those existing semantic boundaries.

Create a new object when a new meaningful concept actually appears.


## 56. A UI Component Can Call Its Module Directly

If a component needs an operation provided by its owning module, it can call the module.

For example:

    this.mod.someApplicationOperation()

There is no need to create:

    ApplicationService

merely to forward the call.

Likewise, if the operation belongs to a Saito runtime API:

    this.app.wallet
    this.app.network
    this.app.storage
    this.app.keychain

can be used directly.

The application already has explicit access to these objects.


## 57. Keep the Component's Data Model Understandable

A UI component should receive the data it needs in a recognizable form.

For example:

    new Tweet(app, mod, tx)

or:

    new NFTCard(app, mod, nft)

or:

    new ListingCard(app, mod, listing)

is clearer than passing a large anonymous collection of unrelated values.

The component should not need to reconstruct its domain object from scattered pieces of state if the application already has a meaningful object representing it.


## 58. Do Not Duplicate the Domain Model in the UI

Avoid:

    Transaction
        ↓
    DTO
        ↓
    ViewModel
        ↓
    UIState
        ↓
    HTML

unless the application genuinely needs those additional concepts.

Saito applications should normally preserve the useful relationship:

    transaction
        ↓
    domain object
        ↓
    UI component

A component may derive display-specific values.

That does not require inventing a second application model.


## 59. The DOM Is Part of the Component's Interface

A component's template defines its DOM structure.

For example:

    <div class="purchase">
        <div class="purchase-header">...</div>
        <div class="purchase-body">...</div>
        <button class="purchase-button">...</button>
    </div>

The component's JavaScript can then operate on that structure.

The CSS styles it.

This gives the developer a straightforward mapping:

    JavaScript
        behavior

    template
        DOM

    CSS
        presentation

Keeping these relationships visible is especially useful when modifying applications with AI.


## 60. Avoid Child Components Manipulating Unrelated Parent DOM

A child component should normally write into its own container.

If:

    Main

owns:

    Sidebar

then Sidebar should manipulate the Sidebar region.

It should not arbitrarily reach into:

    Main
    Header
    Content
    Footer

and modify their DOM.

If it needs to request a parent-level action, use:

    callback
    direct parent method

or, when the relationship is genuinely cross-boundary:

    app.connection

This keeps DOM ownership understandable.


## 61. Avoid Document-Global Selectors When a Component Container Exists

Prefer selecting relative to the component's own container.

For example:

    this.container.querySelector(...)

or the appropriate Saito browser helper.

Avoid assuming that an element with a particular ID exists globally if the component already has a clear root.

Global IDs and selectors are sometimes necessary for application shells or framework infrastructure.

They should not become the default mechanism for every component.


## 62. Components Can Be Rendered at Different Times

A component may be rendered:

    immediately during Main.render()

or:

    after user interaction

or:

    after a transaction arrives

or:

    after a peer response

or:

    after blockchain confirmation

or:

    after another component requests it

The architecture should not assume that all components are created and rendered simultaneously.

This is one of the important differences between Saito applications and static web pages.


## 63. Initialization Is Not Rendering

`initialize()` is part of the Saito module lifecycle.

It should not be treated as the application's screen-rendering phase.

The module may initialize before:

    peers are connected
    remote data is available
    the page is visible
    confirmations have occurred

Rendering belongs in the UI lifecycle.

Network-dependent work belongs in the appropriate Saito networking hooks or application operations.

The UI should then update when the data it needs becomes available.


## 64. Do Not Assume the Network Is Available During Initial Render

A component may render before peer connectivity exists.

For example:

    initialize()
        ↓
    render()
        ↓
    peer service becomes available
        ↓
    request data
        ↓
    receive response
        ↓
    update UI

This is normal.

Do not make initial rendering depend on a peer being immediately available unless the application genuinely requires it.


## 65. Do Not Poll for UI Availability

A component should not repeatedly ask:

    Is the peer available yet?

or:

    Is the other component rendered yet?

using arbitrary polling loops.

Use Saito lifecycle hooks and explicit component ownership.

When peer services become available, use the relevant Saito mechanism.

When a parent owns a child, the parent knows when it renders the child.

When an application-wide event genuinely needs to cross boundaries, use `app.connection`.


## 66. Use Saito's Existing Browser Utilities

Saito provides browser helpers for common DOM operations.

Use the existing utilities rather than creating another generic DOM abstraction.

For example:

    app.browser.addElementToSelector()
    app.browser.replaceElementBySelector()
    app.browser.replaceElementContentBySelector()

The exact API should be checked against the current implementation before writing code.

Do not create:

    DomService
    UIService
    RenderService

merely to wrap these functions.


## 67. Shared UI Should Be Promoted Only When It Is Actually Shared

A module-specific component should normally stay inside the module.

For example:

    node/mods/example/lib/ui/

is appropriate for application-specific UI.

A component should move into the Saito framework UI layer only when it represents genuinely reusable Saito-wide functionality.

Do not modify framework UI merely because two application components happen to look similar.

The narrowest appropriate ownership boundary is usually preferable.


## 68. Component Directory Structure Should Reflect Meaning

There is no mandatory directory structure for UI components.

Useful structures include:

    lib/
        tweet.js
        database.js

or:

    lib/
        ui/
            main.js
            sidebar.js
            manager.js
            overlays/
                purchase.js

A core domain object that also renders may reasonably remain:

    lib/tweet.js

A substantial application-specific UI may reasonably live under:

    lib/ui/

The important thing is that developers and AI can predict where meaningful objects are located.


## 69. Do Not Create a UI Directory Merely to Satisfy a Rule

`lib/ui/` is an organizational convention.

It is not a requirement.

If an object is naturally:

    Tweet

then:

    lib/tweet.js

may be better than:

    lib/ui/tweet.js

if Tweet is both a central domain concept and a UI component.

If an object is clearly:

    PurchaseOverlay

then:

    lib/ui/overlays/purchase.js

may communicate its role more clearly.

Choose the location according to semantic responsibility.


## 70. The Application Should Be Understandable by Drawing It

A useful design exercise is to draw the page.

For example:

    Application
    ├── Header
    ├── Sidebar
    │   ├── User
    │   └── Navigation
    └── Main
        ├── Toolbar
        └── TweetManager
            ├── Tweet
            ├── Tweet
            └── Tweet

Or:

    Store
    ├── Menu
    ├── Browse
    │   ├── ListingCard
    │   ├── ListingCard
    │   └── ListingCard
    └── PurchaseOverlay

If the UI can be drawn clearly, the object structure often becomes obvious.

Then implementation becomes:

    parent owns child
    child renders child
    child owns its interactions

This is often a better starting point than designing a set of abstract software layers.


## 71. Let the UI Structure Guide Application Structure

When beginning a new application, identify:

    page
    major regions
    components
    domain objects
    interactions
    data sources

Then construct the application around those objects.

For example:

    index.js
        page shell

    mod.js
        Saito module lifecycle

    Main
        main application UI

    Sidebar
        sidebar UI

    Game
        domain object

    GameBoard
        game UI

    Player
        domain object

    PlayerCard
        player UI

    transactions.js
        protocol operations

This gives both the developer and AI a clear map.


## 72. The Main Module Composes the Application

The module should normally construct its major objects.

For example:

    this.main = new Main(app, this);

    this.database = new Database(app, this);

    this.transactions = new Transactions(app, this);

Then:

    render() {
      this.main.render();
    }

The main module therefore remains the place where application composition can be understood.

But the implementation of those objects remains in their own files.


## 73. Keep the Module as the Application Map

A developer should be able to inspect the module and see something like:

    constructor()
        creates application objects

    initialize()
        initializes application

    render()
        renders Main

    onConfirmation()
        responds to blockchain events

    handlePeerTransaction()
        responds to application messages

    onPeerServiceUp()
        responds to available services

This provides a concise map of the application.

The detailed UI implementation is elsewhere.

The detailed transaction implementation is elsewhere.

The detailed database implementation is elsewhere.

This is much easier to review than a module containing hundreds of application-specific helper methods.


## 74. UI Components Should Not Become Miniature Frameworks

A component should be substantial enough to own its responsibility.

But it should not create its own generic framework.

Avoid:

    ComponentBase
    ComponentRegistry
    ComponentFactory
    ComponentLifecycleManager
    ComponentEventBus
    ComponentStateStore

unless the application has an actual requirement for such infrastructure.

Most Saito components only need:

    constructor
    render
    attachEvents
    interaction functions
    perhaps update methods

Keep the architecture concrete.


## 75. Do Not Over-Abstract Simple UI Operations

If a button needs to call a module method, call it.

If a component needs to access the wallet, use:

    this.app.wallet

If it needs a module database, use:

    this.mod.database

If it needs to propagate a transaction, use the Saito networking API.

Do not create a chain of wrappers merely because conventional enterprise software often does so.

The Saito architecture is deliberately direct.


## 76. Component Boundaries Should Correspond to User-Visible Responsibility

Good boundaries often correspond to things a user can identify.

For example:

    Header
    Sidebar
    Profile
    Tweet
    Listing
    Purchase
    Chat
    GameBoard
    PlayerPanel
    Settings

These are useful concepts because they map to visible application behavior.

A function such as:

    DataCoordinator

is less useful if its only purpose is to pass data between two UI elements.

Prefer boundaries that correspond to real application concepts.


## 77. UI Components Are Good Review Boundaries

A developer reviewing:

    PurchaseOverlay

should be able to understand the purchase UI without reading the entire application.

A developer reviewing:

    Tweet

should be able to understand how a Tweet is displayed and interacted with.

A developer reviewing:

    Sidebar

should be able to understand the sidebar.

This improves human code review and AI code modification at the same time.


## 78. Keep Behavior With the Object It Describes

A useful general rule is:

> Put behavior beside the object that gives the behavior meaning.

Examples:

    Tweet
        Tweet behavior

    Listing
        Listing behavior

    PurchaseOverlay
        purchase UI behavior

    GameBoard
        board UI behavior

    Transactions
        transaction construction/handling

    Database
        database behavior

The main module coordinates these objects.

It should not absorb their behavior.


## 79. Keep Transaction Behavior With Transactions

If an operation is specifically about constructing or processing transactions, it can belong in:

    lib/transactions.js

or another semantic transaction file.

For example:

    createTweetTransaction()
    receiveTweetTransaction()
    createPurchaseTransaction()

can be appropriate when those are substantial transaction concepts.

The UI component can call the transaction operation.

The transaction implementation should not be reproduced inside the UI merely because a button triggers it.


## 80. Keep Domain Behavior With Domain Objects

If behavior belongs to:

    Tweet

put it in Tweet.

If behavior belongs to:

    Listing

put it in Listing.

If behavior belongs to:

    Game

put it in Game.

This gives AI a predictable location for modifications.

The goal is not to force every function into a separate file.

The goal is to make semantic ownership obvious.


## 81. Use UI Components to Prevent Main-File Growth

The most important architectural benefit of this approach is containment.

Without UI components:

    every new UI feature
        ↓
    mod.js

With UI components:

    new UI feature
        ↓
    identify responsible component
        ↓
    modify component

This means that an application can grow without continuously increasing the complexity of its main module.

It also means an AI can make a UI change without touching unrelated application infrastructure.


## 82. AI Rules for Creating a New UI Component

When a new visible feature is requested:

1. Identify what the user will see.

2. Identify the coherent visual region responsible for it.

3. Determine whether an existing component already owns that region.

4. If not, create a component.

5. Give a module-owned component `app` and `mod`.

6. Give it a `render()` function.

7. Add `attachEvents()` when event binding is substantial enough to benefit from separation.

8. Put interaction behavior inside the component.

9. Put HTML structure in the template when a separate template is useful.

10. Put component-specific styling in the appropriate CSS file.

11. Let the parent construct and own the component.

12. Avoid putting the component's implementation into `mod.js`.

13. Avoid creating helper functions unless they represent meaningful behavior.

14. Avoid creating generic UI infrastructure.

15. Use existing Saito browser and application APIs.


## 83. AI Rules for Modifying Existing UI

Before changing UI:

1. Find the component that renders the affected interface.

2. Find its template.

3. Find its CSS.

4. Find its parent.

5. Determine where its data comes from.

6. Determine how it is currently rendered.

7. Determine how its events are attached.

8. Determine whether it is reused in multiple contexts.

9. Modify the narrowest appropriate component.

10. Do not move the implementation into the main module merely because that is convenient.

11. Preserve the existing component ownership structure unless the requested change genuinely requires changing it.


## 84. AI Rules for Event Handling

When adding interaction:

1. Determine which component owns the UI element.

2. Prefer handling the interaction in that component.

3. Use `render()` followed by `attachEvents()` when a separate binding phase is useful.

4. Use direct event handlers when that is simpler.

5. Use event delegation for dynamic lists when appropriate.

6. Put stable application identifiers such as transaction signatures into DOM data attributes when useful.

7. Recover the underlying object from the identifier rather than duplicating the entire object in the DOM.

8. Use callbacks for explicit parent-child communication.

9. Use `app.connection` when the event genuinely crosses component or module boundaries.

10. Do not create a global event for a relationship that is already explicit.


## 85. AI Rules for Templates

When creating a template:

1. Make the HTML structure obvious.

2. Keep substantial application logic out of the template.

3. Do not put database access in the template.

4. Do not put network operations in the template.

5. Do not put transaction construction in the template.

6. Do not create large helper systems inside the template.

7. Allow simple presentation branching where it improves the generated HTML.

8. Keep the main behavior in the component JavaScript file.


## 86. AI Rules for CSS

When styling a component:

1. Identify the component's root.

2. Style the component relative to that root.

3. Reuse Saito defaults when they already provide the desired typography and spacing.

4. Do not specify every font size and margin unnecessarily.

5. Avoid introducing a complete custom design system into a module unless the application requires one.

6. Keep component-specific styling near the component's CSS.

7. Prefer CSS media queries for responsive layout.

8. Use JavaScript for responsive behavior only when runtime logic is genuinely necessary.

9. Avoid generic global selectors that can unintentionally affect unrelated application UI.


## 87. AI Rules for Domain Objects and UI Components

When deciding whether to combine or separate a domain object and UI component:

Use one object when:

    the domain object naturally represents its own UI
    the UI is tightly coupled to that object
    the object is normally displayed in one primary form

Use multiple UI components when:

    the same domain object has multiple representations
    different screens require different layouts
    an overlay requires a different interaction model
    the UI needs different behavior in different contexts

For example:

    Tweet
        may render itself

while:

    SaitoNFT
        NFTCard
        NFTOverlay
        PurchaseOverlay
        SelectionOverlay

may be more appropriate.

Neither structure is inherently required.


## 88. AI Rules for Application Composition

A useful default structure is:

    index.js
        page-level concerns

    mod.js
        Saito module lifecycle and composition

    Main
        application UI

    subordinate UI components
        visual regions

    domain objects
        application concepts

    transactions
        transaction operations

    database/storage objects
        persistence

    templates
        HTML structure

    CSS
        presentation

This is a default, not a rigid framework.

The application may legitimately differ when its domain requires another structure.


## 89. The Main Test for Good UI Architecture

Ask:

> If a user asks to change this particular part of the interface, can I identify the small set of files that own it?

If the answer is yes, the architecture is probably localized.

If the answer is:

    "We need to modify mod.js, the controller,
     the UI service, the view model, the repository,
     and three unrelated helpers"

then the application may have introduced unnecessary abstraction.

Saito UI should make changes local whenever possible.


## 90. The Main Test for AI-Generated Code

Ask:

> Did the AI put this code where the concept actually belongs?

If the answer is:

    UI behavior → UI component
    domain behavior → domain object
    transaction behavior → transaction code
    persistence → database/storage object
    module lifecycle → mod.js
    HTML → template
    styling → CSS

then the architecture is probably healthy.

If the answer is:

    everything → mod.js

the AI has probably failed to identify the application's semantic boundaries.


## 91. Preferred Saito UI Shape

A strong default for a new application is:

    index.js
        ↓
    Saito page/container
        ↓
    Main UI component
        ↓
    major UI components
        ↓
    subordinate UI components
        ↓
    domain objects

with:

    mod.js
        ↓
    Saito lifecycle
    application composition
    protocol/event entry points

and:

    transactions.js
        ↓
    transaction behavior

    database.js
        ↓
    persistence behavior

    component.template.js
        ↓
    HTML structure

    component.css
        ↓
    presentation

This is not a framework that every application must implement literally.

It is a useful mental model for keeping responsibilities local.


## 92. Saito's UI Architecture Is Deliberately Concrete

The preferred architecture is not based on maximizing abstraction.

It is based on making the application's actual objects visible.

A developer should be able to see:

    Main
    Sidebar
    Tweet
    Listing
    Game
    Player
    PurchaseOverlay

and understand what each one means.

The application should not hide those concepts behind generic infrastructure.

The best abstraction is usually the one that corresponds to a real application concept.


## 93. Final AI Guidance

When implementing Saito UI, remember:

    A UI component is an object that renders something.

    It normally receives app and mod.

    It should normally have render().

    render() followed by attachEvents() is a preferred practical pattern.

    render() alone is also valid when simpler.

    A domain object may also be a UI component.

    A domain object may instead have several UI components.

    Parent components should normally construct and own children.

    Components should own their own interaction behavior.

    Callbacks are useful for explicit parent-child communication.

    app.connection is useful for genuine cross-component or cross-module events.

    Transaction signatures are useful DOM data IDs.

    Templates should primarily describe HTML.

    JavaScript should contain component behavior.

    CSS should style the component's HTML structure.

    Saito defaults should be reused rather than overridden unnecessarily.

    Responsive layout should normally be handled with CSS.

    The main module should remain the Saito lifecycle and application map.

    Do not turn mod.js into the application's universal controller.

    Do not create helper functions merely to wrap one or two lines.

    Do not create controllers, services, repositories, view models, or UI stores without a real need.

    Do not duplicate the domain model in the UI.

    Do not introduce a component framework when ordinary objects are sufficient.

    Keep substantial behavior in domain objects and UI components.

    Keep changes localized.

The objective is simple:

> Build Saito applications out of recognizable application objects, substantial UI components, and direct Saito APIs, while keeping the main module small enough that a human or AI can understand it at a glance.
# Saito UI CSS Practices

This document describes how CSS should be written in Saito applications and shared Saito UI components.

Saito already has a design system. Applications should generally consume that design system rather than recreating it. At the same time, Saito is a permissionless application platform: modules are free to define their own visual identity and behavior when the application requires it.

The goal of these practices is therefore not to restrict what an application can look like.

The goal is to make applications that:

- work naturally with Saito's existing UI,
- remain compatible with other modules running in the same browser,
- can participate in Saito-wide themes,
- keep CSS localized and understandable,
- avoid unnecessary duplication,
- make component ownership obvious,
- remain easy for humans and AI to modify,
- and do not accumulate CSS abstractions merely because an AI believes every application needs its own design system.


## 1. Saito Already Has a Design System

Saito provides a shared visual language through its core CSS.

The design system includes things such as:

- typography
- colours
- spacing values
- buttons
- form controls
- borders
- radii
- cards
- overlays
- shell elements
- shared UI components
- global CSS variables

The core CSS is primarily found under:

    node/web/saito/css-imports/

and is compiled into:

    node/web/saito/saito.css

The source files are the files developers should modify.

The generated `saito.css` file should not be edited manually.


## 2. Applications Should Consume Saito Rather Than Recreate It

If Saito already provides a suitable variable, class, control, or visual behavior, use it.

For example:

    color: var(--saito-foreground);
    border-color: var(--saito-border);
    background: var(--saito-card);
    gap: var(--saito-space-md);

rather than creating:

    --my-foreground: var(--saito-foreground);
    --my-border: var(--saito-border);
    --my-card: var(--saito-card);
    --my-gap: var(--saito-space-md);

The second form adds an unnecessary abstraction layer.

It also makes the application less responsive to changes in the Saito design system.

The preferred relationship is:

    Saito design system
        ↓
    application consumes Saito

not:

    Saito design system
        ↓
    application copies Saito into its own design system
        ↓
    components consume the copy


## 3. Saito CSS Is Also a Theme Interface

Saito's CSS variables are deliberately designed so that applications can share the same visual language.

This has an important consequence.

A module that consumes:

    --saito-foreground
    --saito-background
    --saito-card
    --saito-primary
    --saito-border
    --saito-space-md
    --saito-radius

can potentially respond naturally when the Saito theme changes.

This is one reason not to replace Saito variables with module-specific aliases.

For example:

    color: var(--saito-foreground);

allows the application to participate in future Saito themes.

Whereas:

    --my-text: var(--saito-foreground);

adds another layer without providing additional meaning.

The objective is for applications that adopt Saito's visual language to remain visually coherent when the underlying Saito theme changes.


## 4. Applications Do Not Have to Include `saito.css`

Including Saito CSS is recommended, but it is not a universal requirement.

An application may have its own complete visual language.

However, applications commonly use Saito UI infrastructure such as:

- Saito Header
- Saito Sidebar
- slide-in menu
- wallet UI
- overlays
- shared Saito components
- shared game UI

When those components are used, including:

    /saito/saito.css

allows the shared components to receive their intended styling.

This is particularly important because Saito UI can appear as a result of user interaction even when it was not part of the application's initial screen.

For example, an application may use the Saito Header. A user may then open the wallet or slide-in menu. Those interfaces depend on Saito CSS.

Therefore, an ordinary application will generally want to include Saito CSS when it uses Saito UI.


## 5. Module CSS Can Override Saito CSS

Module CSS is allowed to override Saito CSS.

This is important.

The rule is not:

> Module CSS may never change typography, colours, borders, or other presentation.

The rule is:

> Saito provides the default visual language. A module may deliberately override it when the application's own interface requires something different.

For example, an application may deliberately have:

- a different title size,
- a different card treatment,
- a distinctive colour,
- a specialized border,
- a game-specific visual style,
- an application-specific control treatment.

That is legitimate.

The important question is whether the declaration represents a deliberate application requirement or merely recreates something Saito already provides.

If an application overrides a Saito base rule, put that override in the module's base CSS file.


## 6. Base CSS Is the Module's Integration Boundary

A module should normally have a base stylesheet such as:

    redsquare-base.css
    store-base.css
    poker-base.css

The base stylesheet is the appropriate place for rules that integrate the application with Saito's global page and UI environment.

Examples include:

- `#saito-container`
- page-level layout
- body/module classes
- header integration
- Saito shell positioning
- application-wide typography adjustments
- deliberate overrides of Saito CSS
- application-wide responsive behavior
- page-level layout changes

This provides a very useful boundary.

If a module needs to change a Saito-wide rule, the change should be visible in one predictable place.

For example:

    Saito CSS
        ↓
    module base CSS
        ↓
    module components

This makes changes to foundational styling conspicuous.

It also makes it easier to review an application for changes that might affect its interaction with Saito's shared UI.


## 7. Why Base CSS Matters

A rule such as:

    body.redsquare-body p {
        font-size: inherit;
    }

is fundamentally different from:

    .tweet .body {
        display: grid;
    }

The first changes how the application integrates with Saito's global typography.

The second describes the internal structure of a Tweet.

The first belongs in the base stylesheet.

The second belongs in the Tweet stylesheet.

This distinction makes the architecture visible.

If an AI needs to override a Saito-wide rule, it should have a predictable place to look and a predictable place to put the change.


## 8. Component CSS Should Be Organized Around UI Components

The preferred organization is:

    one component
        ↓
    one root namespace
        ↓
    one component CSS file

For example:

    redsquare-tweet.css
        .tweet

    redsquare-manager.css
        .manager

    redsquare-profile.css
        .profile

The exact filename depends on the module.

The important principle is semantic ownership.

If a developer wants to understand Tweet styling, the Tweet CSS should be the obvious place to look.

If there is a Tweet JavaScript object, the relationship should be easy to discover:

    tweet.js
    tweet.template.js
    redsquare-tweet.css

or, where the component is part of a larger manager:

    redsquare-manager.js
    redsquare-manager.template.js
    redsquare-manager.css


## 9. Give Components a Distinctive Root

A component should normally have a distinctive root class.

For example:

    .tweet
    .manager
    .profile
    .listing-detail
    .purchase
    .store

The root identifies the component.

Its descendants can then use short semantic names:

    .tweet .header
    .tweet .body
    .tweet .footer
    .tweet .controls

rather than:

    .tweet .tweet-header
    .tweet .tweet-body
    .tweet .tweet-footer
    .tweet .tweet-controls

The root already establishes the namespace.

Repeating the component name in every descendant is unnecessary.


## 10. Short Descendant Names Reinforce UI Hierarchy

Short descendant names are not merely a CSS convenience.

They make the visual and semantic hierarchy of the UI visible in the code.

For example:

    .tweet
        .header
        .body
        .footer

tells a developer that Header, Body, and Footer are parts of Tweet.

Similarly:

    .manager
        .header
        .content
        .status

tells a developer that those elements belong to Manager.

The component root is therefore doing architectural work.

It tells the developer:

> These elements belong to this component.

This is especially useful for AI because the semantic ownership boundary is encoded directly in the DOM and CSS.


## 11. The Component Root Should Be the Closest Semantic Owner

If CSS concerns Tweet, look first in Tweet's CSS.

If there is no Tweet CSS because Tweet is rendered as part of another component, look in the CSS associated with the component that actually owns that UI.

The important rule is:

> Put a declaration in the CSS file whose component most closely corresponds to what the declaration describes.

Do not put Tweet internals into Manager CSS merely because Manager happens to render Tweets.

Do not put Profile internals into Sidebar CSS merely because Sidebar contains Profile.


## 12. Parents Arrange Children; Children Style Themselves

A parent component normally controls where its children appear.

For example:

    Manager
        decides where Tweets are placed

while:

    Tweet
        decides how a Tweet is internally arranged

Similarly:

    Sidebar
        decides where Profile appears

while:

    Profile
        decides how Profile is rendered

This means Manager CSS can contain:

    .manager {
        display: flex;
        flex-direction: column;
        gap: var(--saito-space-md);
    }

But Manager CSS should not normally contain:

    .manager .tweet .header {
        ...
    }

because that makes Manager responsible for the internals of Tweet.


## 13. Do Not Cross Component Ownership Boundaries

Avoid selectors such as:

    .manager .tweet .header
    .manager .tweet .body
    .sidebar .profile .body .text

These selectors make one component responsible for another component's internals.

This creates fragile coupling.

If Tweet changes its internal structure, Manager CSS must change.

Instead, the parent can communicate context through a state or presentation class on the child's root.

For example:

    .tweet.focused
    .tweet.embedded
    .tweet.chain-next
    .tweet.chain-prev

The Tweet component then interprets those states in its own CSS.

This keeps the knowledge of Tweet's internal structure inside Tweet.


## 14. Parent Context Should Be Expressed on the Child Root

Suppose a Tweet needs a different layout when embedded.

Prefer:

    <article class="tweet embedded">

with:

    .tweet.embedded {
        ...
    }

rather than:

    .profile .manager .tweet .body {
        ...
    }

The parent can establish the context.

The child owns the interpretation.

This produces a clean relationship:

    parent
        says what context the child is in

    child
        decides what that context means internally


## 15. Components Should Remain Independently Renderable

A useful consequence of this architecture is that a component should be able to render independently.

Tweet should not need to know whether it is inside:

    RedSquare
    Notifications
    Profile
    Search
    another application

in order to understand its own internal layout.

Likewise, Profile should not need to know which Sidebar contains it.

This reduces coupling and makes components reusable in different application contexts.


## 16. Selector Specificity Should Be Minimal

Prefer the shortest selector that correctly expresses ownership.

For example:

    .tweet

is preferable to:

    body.redsquare-body .manager .tweet

when `.tweet` is sufficient.

A longer selector is justified when it solves a real problem, such as overriding a Saito rule.

It should not be added merely to be safe.

Every additional level of specificity creates another dependency that future CSS must understand.


## 17. Specificity Is Sometimes Necessary

Saito applications exist inside a shared browser environment.

Sometimes an application genuinely needs to override Saito CSS.

In that situation, additional specificity may be appropriate.

For example:

    body.redsquare-body #saito-header {
        ...
    }

may be necessary because the module is deliberately changing the Saito header in the RedSquare context.

This is different from writing:

    body.redsquare-body .manager .tweet .header {
        ...
    }

when `.tweet .header` would already be sufficient.

The rule is:

> Use additional specificity to solve an actual cascade problem, not as defensive programming.


## 18. Do Not Increase Specificity "Just in Case"

Avoid:

    body.redsquare-body .manager .tweet .header .title

when:

    .tweet .title

or:

    .tweet .header

would work.

Avoid adding:

    html
    body
    module-root
    parent
    component
    descendant

to every selector.

Deep selectors make CSS harder to override and harder for AI to reason about.


## 19. Trust the Cascade and Inheritance

Saito already provides a base CSS environment.

For example, Saito's base CSS establishes:

- box sizing
- default margins and padding
- body typography
- heading typography
- base colours
- shared variables

Do not repeat these declarations automatically.

If Saito already establishes:

    box-sizing: border-box;

there is normally no reason for every component to repeat:

    box-sizing: border-box;

Likewise, do not add:

    margin: 0;
    padding: 0;
    width: 100%;

to every component simply because those declarations are familiar defensive CSS.


## 20. Add Declarations Because They Do Something

A component may legitimately need:

    width: 100%;

or:

    min-width: 0;

or:

    box-sizing: border-box;

if removing the declaration demonstrably changes its behavior.

For example, `min-width: 0` can be necessary for a flex child that otherwise refuses to shrink.

That is a real layout requirement.

The problem is not the declaration itself.

The problem is adding it without understanding why it is necessary.


## 21. Minimal CSS Means Fewer Unnecessary Rules

The objective of CSS simplification is not merely to reorganize existing declarations into prettier files.

The objective is to remove unnecessary CSS.

Prefer:

    fewer selectors
    fewer declarations
    fewer overrides
    fewer variables
    fewer aliases
    fewer resets
    fewer special cases

Do not preserve a declaration merely because it has always existed.

At the same time, do not delete a declaration merely because it looks redundant.

First determine what behavior it provides.


## 22. Delete, Then Add Back What Is Actually Necessary

When cleaning a large stylesheet, a useful approach is:

    identify the component
        ↓
    remove unnecessary CSS
        ↓
    inspect the result
        ↓
    restore only what is actually required

This is often more effective than trying to reason about every historical declaration individually.

The important constraint is to preserve the intended visual result unless the task explicitly asks for a design change.


## 23. Do Not "Modernize" During CSS Cleanup

CSS cleanup is not an excuse to redesign the application.

Do not change:

    font sizes
    colours
    spacing
    visual hierarchy
    component appearance

merely because another design would look more modern.

If the task is simplification, simplify.

If the task is redesign, redesign.

Keep those objectives separate.


## 24. Custom Properties Should Represent Real Concepts

Saito provides the application's primary CSS variable system.

Modules may also define custom properties when the variable represents a real application concept.

Legitimate examples include:

    --store-user-rhythm

when a layout value is deliberately shared and changed at a breakpoint.

Games may have variables such as:

    --conquest-continent-...

when they represent genuine game-specific theme configuration.

A component may also use a custom property for runtime state when JavaScript needs to communicate a value to CSS.

For example, an overlay can expose viewport measurements through CSS variables.


## 25. Do Not Create Variables Merely to Avoid Repeating a Literal

Avoid:

    .tweet {
        --tweet-padding: 1.6rem;
        padding: var(--tweet-padding);
    }

if nothing else needs to override or consume `--tweet-padding`.

Use:

    .tweet {
        padding: 1.6rem;
    }

The variable has added no semantic value.

Likewise, do not create:

    --tweet-current-pad-x
    --tweet-current-pad-y
    --tweet-border-size

merely because the values occur in one component.


## 26. Do Not Create Module Copies of Saito Variables

Avoid:

    --rs-text: var(--saito-foreground);
    --rs-border: var(--saito-border);
    --rs-space-sm: var(--saito-space-sm);

These are aliases, not meaningful application concepts.

Use the Saito variable directly.

This also ensures that applications naturally participate in Saito themes.


## 27. Module Variables Can Be Legitimate

The prohibition is not against all module variables.

A module variable is appropriate when it represents a real concept.

For example:

    --store-user-rhythm

is meaningful if several Store layouts depend on that rhythm and the value intentionally changes at a breakpoint.

Likewise, a game may define:

    --conquest-continent-primary

if it is part of the game's actual theming system.

The test is:

> Does this variable represent a meaningful application concept, configuration point, theme value, or runtime value?

If not, use an ordinary CSS declaration.


## 28. Use the Actual Saito CSS as the Source of Truth

Do not assume that Saito variables follow a perfectly uniform naming scheme.

For example, Saito currently has variables such as:

    --saito-space-xs
    --saito-space-sm
    --saito-space-md
    --saito-space-lg
    --saito-space-xl
    --saito-space-xxl

and typography variables such as:

    --font-size-large
    --font-size-medium
    --font-size-tiny

The typography variables do not all use the `--saito-` prefix.

An AI should inspect the actual current Saito CSS before introducing or assuming a variable.

Do not invent:

    --font-size-small

merely because a conventional design system would normally have one.

Likewise, do not assume that every variable mentioned in an old application still exists.

The live Saito CSS is the authority.


## 29. Typography Defaults Should Usually Be Inherited

Saito establishes default typography.

Applications should generally allow those defaults to flow into their components.

Do not define:

    font-family

on every component.

Do not assign a new font size to every element.

Do not create a module-wide typography system simply because the application contains text.

Instead, ask:

> Is this element supposed to use the Saito default?

If yes, do nothing.

A component may define its own typography when the typography is intrinsic to the component.

For example:

    title
    price
    metadata
    game score
    specialized label

may reasonably have deliberate sizes.

The principle is not "never set font-size."

The principle is:

> Do not redefine typography unnecessarily.


## 30. Application-Wide Typography Overrides Belong in Base CSS

If an application deliberately establishes a different typography scale, that belongs in the module's base CSS.

For example, RedSquare's base CSS adjusts the page's typography because its feed and Saito shell require a particular relationship between the root font size and application content.

That is an application-wide integration decision.

It does not belong scattered across:

    tweet.css
    manager.css
    profile.css
    menu.css

The base stylesheet provides a visible place to understand that the application has deliberately changed the global typography environment.


## 31. Component-Specific Typography Belongs to the Component

If a Tweet's metadata needs a particular size, that can belong in Tweet CSS.

If a Store listing's price needs a particular size, that can belong in Listing CSS.

If a game score needs a particular size, that can belong in the game component.

The important distinction is:

    application-wide typography
        → base CSS

    component-specific typography
        → component CSS

    generic Saito typography
        → Saito CSS


## 32. Do Not Over-Define Spacing

Saito provides a spacing scale.

Use it where it represents the application's shared rhythm:

    gap: var(--saito-space-md);

But component-specific spacing can be an ordinary CSS value.

For example:

    padding: 1.2rem 1.6rem;

may be perfectly appropriate if it is intrinsic to that component.

Do not create:

    --tweet-padding-small
    --tweet-padding-medium
    --tweet-padding-large

unless those values represent a real reusable concept in the application.


## 33. Colours Should Normally Use Saito Variables

When an application wants the standard Saito visual language, use:

    var(--saito-background)
    var(--saito-foreground)
    var(--saito-card)
    var(--saito-primary)
    var(--saito-secondary)
    var(--saito-muted)
    var(--saito-muted-foreground)
    var(--saito-accent)
    var(--saito-destructive)
    var(--saito-border)
    var(--saito-ring)

This allows the application to participate in Saito themes.

Do not create a private colour palette merely by renaming these variables.


## 34. Deliberate Application Identity Is Allowed

An application may deliberately depart from the Saito visual language.

For example:

    poker felt
    game board colours
    faction colours
    parchment panels
    specialized map themes
    application-specific branding

These are legitimate because they communicate something intrinsic to the application.

A game in particular may require a substantially different visual language from a social application.

The goal is not to make every Saito application look identical.


## 35. Games Are a Specialized CSS Environment

Game applications are still Saito modules, but their visual requirements are different.

Games may legitimately define:

    board colours
    felt
    parchment
    faction colours
    map themes
    specialized cards
    player areas
    game-specific controls

Game CSS is commonly scoped under a game root such as:

    .game.poker
    .game.texas

Shared game infrastructure can provide common structures such as:

    GameHud
    player boxes
    card fans
    overlays
    game layout

The individual game then owns its board and game-specific visual identity.


## 36. Do Not Force Game Visuals Into the Saito Design System

A poker table should not be redesigned as a generic Saito card simply because Saito provides cards.

A strategy game's board should not be forced into the same visual language as a social feed.

Use Saito styling for genuinely shared UI.

Use game CSS for game identity.

This distinction is important because games often have stronger visual requirements than ordinary application modules.


## 37. Shared Saito UI Is Different From Module CSS

Shared UI under:

    node/web/saito/css-imports/ui/

sits between the Saito design system and application modules.

Examples include:

    SaitoOverlay
    SaitoHeader
    SaitoSidebar
    SaitoProfile
    SaitoNFT
    shared game UI

Shared components should provide reusable structure and behavior without becoming miniature design systems.

A shared component may define:

    layout
    positioning
    component-specific interaction
    lifecycle
    intrinsic visual structure

But it should generally consume the Saito design system for generic:

    typography
    buttons
    inputs
    form controls
    common colours
    spacing conventions


## 38. Shared Components May Have Intrinsic Presentation

The distinction is between generic and intrinsic presentation.

Intrinsic presentation is presentation that exists because of what the component actually is.

Examples:

    overlay backdrop
    overlay panel positioning
    calendar grid
    cropper handles
    media tile arrangement
    transaction-monitor status stack
    game HUD layout

Generic presentation is presentation that could apply to many unrelated components.

Examples:

    standard button padding
    standard input border
    generic body typography
    generic Saito colour
    generic form spacing

Intrinsic presentation belongs to the component.

Generic presentation belongs to the Saito design system.


## 39. Do Not Turn Shared Components Into Miniature Design Systems

Avoid a shared component defining:

    its own font system
    its own button system
    its own input system
    its own colour palette
    its own spacing scale
    its own border system

unless that visual system is genuinely intrinsic to the component.

For example, a shared overlay should normally provide:

    backdrop
    panel
    position
    size
    close behavior

while its contents use Saito controls.


## 40. Application CSS May Style Saito Components in Context

A module can legitimately adjust how a shared Saito component integrates into its page.

For example:

    .saito-overlay:has(> .listing-detail) {
        ...
    }

can be appropriate when Store needs its overlay to accommodate a particular Store panel.

Likewise, a module may adjust the placement of the Saito Header in its page.

The important distinction is between:

    contextual integration

and:

    rewriting the shared component itself.

If the module is simply positioning the shared component in its own application, that belongs in module base/integration CSS.


## 41. CSS Files Should Be Isolated by Component

The repository organizes CSS into files partly because those boundaries may become useful architectural boundaries in the future.

A component may eventually be promoted from:

    module-specific UI

to:

    shared Saito UI

If its CSS is already isolated, this migration is much easier.

For example:

    redsquare-tweet.css

can potentially evolve independently from:

    redsquare-manager.css

because Tweet's styling is already localized.

This is another reason to avoid putting all application CSS into one enormous file.


## 42. Do Not Edit Generated CSS

Module source CSS normally lives under:

    mods/<module>/web/css/

and is compiled into:

    mods/<module>/web/style.css

Saito source CSS lives under:

    node/web/saito/css-imports/

and is compiled into:

    node/web/saito/saito.css

The generated files are regenerated automatically when the software is compiled.

Therefore:

> Edit the source CSS, not the generated CSS.

Do not manually edit:

    web/style.css

or:

    saito.css

Those files are outputs.

A manual change will be lost when the software is compiled again.


## 43. CSS Source Files Should Be Discoverable

The source file organization should make it easy to find CSS by semantic responsibility.

For example:

    redsquare-base.css
    redsquare-manager.css
    redsquare-tweet.css
    redsquare-profile.css

allows a developer to predict where a change belongs.

Likewise:

    store-base.css
    store-main.css
    store-teaser.css
    store-listing-detail.css

communicates the application's UI structure.

The exact naming convention may differ between modules, especially older modules and games.

The important principle is semantic discoverability.


## 44. CSS and JavaScript Are Coupled Through the DOM

CSS class names are not necessarily cosmetic.

JavaScript may use:

    querySelector()
    closest()
    classList
    event delegation
    data attributes

to interact with the same DOM.

For example:

    .tweet
    .tool.like
    .back
    .feed-status

may be used by JavaScript.

Similarly:

    data-id

may contain a transaction signature used to recover the underlying application object.

Therefore, an AI should not rename CSS classes casually.


## 45. Before Renaming a Class, Search the JavaScript

Before changing:

    .tweet

to:

    .post

search for:

    querySelector('.tweet')
    closest('.tweet')
    classList.contains('tweet')
    event delegation
    template output
    CSS selectors passed to browser helpers

Do the same for IDs and data attributes.

If a class is used by JavaScript, update the JavaScript together with the CSS and HTML.

A visual refactor that silently breaks event handling is not a successful CSS refactor.


## 46. Data Attributes Are Often Behavioral Identifiers

Classes can identify both:

    presentation

and:

    behavior

while data attributes often identify the underlying object.

For example:

    data-id="transaction-signature"

may identify the Saito transaction associated with a rendered object.

Do not replace such identifiers merely because they do not appear to have styling significance.

They may be part of the application's event architecture.


## 47. Responsive Behavior Should Normally Be CSS

For ordinary applications, responsive layout should generally be handled through CSS.

Use:

    @media

for:

    columns
    stacking
    visibility
    spacing
    widths
    typography
    layout
    navigation changes

Do not write JavaScript merely to reproduce a media query.


## 48. JavaScript Is Appropriate When Runtime Measurement Is Actually Required

JavaScript may be appropriate when CSS alone cannot express the behavior.

Examples include:

    measuring the available game viewport
    responding to visual viewport changes
    changing a game HUD according to actual dimensions
    synchronizing runtime state with CSS variables

The important distinction is:

    CSS
        layout based on CSS concepts

    JavaScript
        runtime behavior requiring application state or measurement


## 49. Do Not Invent a Global Breakpoint System

Saito applications do not require every module to use the same set of breakpoints.

Existing applications have different needs.

RedSquare, Store, overlays, and games may use different breakpoints because their layouts differ.

An AI should inspect the relevant application CSS before inventing a breakpoint.

Do not introduce a new global breakpoint scale merely because one would look cleaner.


## 50. Use the Component's CSS for Its Responsive Layout

If a Tweet changes layout at a particular width, that belongs in Tweet CSS.

If Store's main layout changes, that belongs in Store main/base CSS.

If the entire application shell changes, that belongs in the module base CSS.

This follows the same ownership rule as ordinary layout:

    application shell
        → base CSS

    component layout
        → component CSS

    shared Saito UI
        → shared Saito CSS


## 51. Avoid Generic Global Selectors

A module should avoid styling generic selectors such as:

    .header
    .body
    .title
    .content

without an appropriate component root or page context.

A rule such as:

    .tweet .header

is understandable because Tweet owns it.

A rule such as:

    .header {
        ...
    }

may unintentionally affect unrelated UI.

Use the component root to establish the CSS namespace.


## 52. A Root Namespace Is Better Than Excessive Prefixing

There are two ways to prevent collisions:

    .tweet-header
    .tweet-body
    .tweet-footer

or:

    .tweet
        .header
        .body
        .footer

Prefer the second pattern for component internals.

The root provides the namespace.

This keeps HTML and CSS readable and makes the component hierarchy obvious.


## 53. Legacy Code Does Not Define the Preferred Pattern

The Saito repository contains multiple generations of CSS.

Some applications:

- predate the current conventions,
- use more heavily prefixed selectors,
- use larger global stylesheets,
- contain duplicated controls,
- use older game-specific naming,
- or contain CSS that is still loaded for compatibility.

An AI should not infer that every existing pattern is recommended simply because it exists.


## 54. RedSquare Is a Useful Reference Implementation

RedSquare's cleaned CSS is particularly useful for understanding the preferred ordinary-application direction.

Important patterns include:

    redsquare-base.css
    redsquare-manager.css
    redsquare-tweet.css
    redsquare-profile.css

with roots such as:

    .manager
    .tweet
    .profile

and descendants such as:

    .header
    .body
    .footer
    .controls

RedSquare also uses Saito variables directly rather than creating a second RedSquare design-token layer.


## 55. Store Demonstrates Legitimate Complexity and Remaining Debt

Store is useful for a different reason.

It demonstrates that real applications may need:

    application-specific typography
    specialized layouts
    responsive values
    contextual control changes

It also contains examples of CSS that could be simplified.

An AI should therefore not copy every Store rule as best practice.

Instead, ask which declarations represent:

    genuine Store requirements

and which represent:

    duplication of Saito styling

This distinction is more important than mechanically copying the repository's existing syntax.


## 56. Games Demonstrate a Different Visual Language

Games are another legitimate exception.

Poker, Texas, and strategy games may define:

    board appearance
    felt
    faction colours
    parchment
    map themes
    specialized panels
    game-specific typography

That is not necessarily a failure to consume Saito.

The game is an application with a visual identity appropriate to its domain.

Shared Saito/game infrastructure should still be reused where appropriate, particularly for common shell and HUD functionality.


## 57. Do Not Create CSS Abstractions Without a Real Need

Avoid automatically creating:

    design tokens
    utility classes
    CSS mixins
    component factories
    styling services
    theme wrappers
    generated class systems

because an AI believes CSS should be abstracted.

Saito already provides a design system.

Module CSS should remain concrete and understandable.

If two components happen to have:

    padding: 1rem;

that does not automatically justify:

    --shared-component-padding

or:

    .standard-padding

Use abstractions when they represent a real application concept or when the existing Saito architecture already provides the abstraction.


## 58. Prefer Obvious CSS Over Clever CSS

The ideal module stylesheet is not the most sophisticated stylesheet.

It is the stylesheet where a developer can look at a rule and immediately understand:

    what it affects
    why it exists
    which component owns it

For example:

    .tweet {
        display: grid;
        grid-template-columns: 4rem 1fr;
    }

is obvious.

A chain of variables, utility classes, mixins, and nested selectors that eventually produces the same layout is harder to review and harder for AI to modify.


## 59. CSS Should Reflect the UI Hierarchy

The UI architecture and CSS architecture should reinforce one another.

If the UI is:

    Main
        Header
        Sidebar
        TweetManager
            Tweet

then CSS should make those boundaries visible.

For example:

    .manager
        manager layout

    .tweet
        tweet layout

The CSS should not flatten all of those responsibilities into:

    .main .sidebar .manager .tweet .body ...

The visual hierarchy should be reflected in the code hierarchy.


## 60. A Component's CSS Should Not Need to Know Its Parent

A component should generally be able to define its internal structure without knowing whether it is inside:

    Main
    Sidebar
    Profile
    Store
    Search

If a component needs a different presentation in a different context, communicate that context through an explicit state or modifier on its root.

For example:

    .tweet.embedded

rather than:

    .profile .feed .tweet .body


## 61. CSS Cleanup Should Preserve Behavior

When reducing CSS:

- preserve DOM structure unless the task requires changing it,
- preserve JavaScript selectors,
- preserve data attributes,
- preserve event behavior,
- preserve intended visual identity,
- preserve responsive behavior.

CSS cleanup is successful when unnecessary code disappears without unintended behavior changing.


## 62. If a Rule Is Removed, Know What Replaced It

Before deleting a declaration, determine whether the resulting behavior comes from:

    Saito CSS
    browser default
    inheritance
    another component rule
    another module rule

If nothing replaces it and the UI changes, the declaration was not redundant.

This is particularly important when working with Saito because the design system is already providing substantial base styling.


## 63. If Two Rules Render the Same Result, Prefer the Simpler One

Suppose both:

    .tweet {
        box-sizing: border-box;
    }

and:

    /* no declaration */

produce the same result because Saito already sets `box-sizing`.

The second is preferable.

Likewise, if:

    color: var(--saito-foreground);

is inherited correctly, do not repeat it on every descendant.


## 64. Do Not Preserve Historical CSS Merely Because It Exists

A repository may contain:

    old resets
    duplicate variables
    obsolete selectors
    compatibility rules
    old component names
    unused declarations

The existence of a declaration is not evidence that it is necessary.

Investigate before preserving it.

At the same time, historical code may contain subtle compatibility behavior.

Do not remove it blindly.

The right question is:

> What behavior does this rule provide today?


## 65. CSS Review Questions for AI

Before adding CSS, ask:

    Does Saito already provide this?

    Does inheritance already provide this?

    Is this component-specific?

    Is this application-wide?

    Does this belong in base CSS?

    Does this belong in the component CSS?

    Is this a genuine visual identity decision?

    Is this merely duplicating a Saito control?

    Is this selector crossing an ownership boundary?

    Is this specificity actually necessary?

    Is this variable a real concept?

    Would a literal be clearer?

    Does JavaScript depend on this class?

    Does this need JavaScript, or can CSS handle it?


## 66. CSS Review Questions for Cleanup

Before keeping an existing rule, ask:

    What changes if I remove it?

    Does Saito already provide the same declaration?

    Does inheritance already provide the same result?

    Is this rule an old workaround?

    Is this rule overriding Saito deliberately?

    Is the override documented or obvious?

    Does the rule belong in base CSS?

    Is this component styling another component's internals?

    Is this variable actually necessary?

    Is this selector more specific than necessary?


## 67. AI Implementation Rules

When creating CSS for a new Saito application:

1. Inspect Saito's current CSS first.

2. Determine which Saito design-system variables and classes already solve the problem.

3. Decide whether the application will include Saito CSS.

4. If it uses Saito UI, normally include Saito CSS.

5. Create the module's base stylesheet for page-level and Saito integration.

6. Put component CSS into isolated component files.

7. Give each component a distinctive root class.

8. Use short semantic descendant names.

9. Let parents arrange children.

10. Let components style their own internals.

11. Use modifier classes on component roots to communicate context.

12. Keep selectors as short as possible.

13. Use additional specificity only when it solves a real cascade problem.

14. Use Saito variables directly.

15. Create module variables only for meaningful application concepts, configuration, theme values, or runtime state.

16. Do not create aliases for Saito variables.

17. Do not recreate Saito buttons, forms, typography, spacing, or colours unnecessarily.

18. Allow deliberate application-specific visual identity.

19. Use CSS for ordinary responsive layout.

20. Use JavaScript for runtime measurement or behavior when CSS is insufficient.

21. Never manually edit generated CSS.

22. Before renaming a class, search JavaScript for dependencies on it.

23. Keep CSS ownership aligned with UI ownership.

24. Keep CSS obvious rather than clever.


## 68. AI Rules for Existing Applications

When modifying an existing Saito application:

1. Find the module's base CSS.

2. Find the component CSS associated with the affected UI.

3. Inspect Saito CSS before adding an override.

4. Determine whether the existing rule is deliberate application identity or inherited technical debt.

5. Do not copy an older application's CSS pattern automatically.

6. Check whether JavaScript uses the affected class or selector.

7. Preserve transaction/data identifiers.

8. Preserve component ownership.

9. Prefer changing the smallest responsible CSS file.

10. If an application-wide Saito rule must change, put the override in base CSS.

11. If a component's internal presentation must change, put the rule in that component's CSS.

12. If the rule is generic and Saito should own it, consider whether the correct change belongs in Saito rather than the module.

13. Do not create a module design system merely because the existing CSS is inconsistent.

14. Remove unnecessary CSS when the task is cleanup, but preserve deliberate visual identity.


## 69. AI Rules for Shared Saito UI

When modifying shared Saito UI:

1. Determine whether the rule is generic or intrinsic.

2. Generic appearance belongs in the Saito design system.

3. Intrinsic component layout belongs in the component.

4. Do not recreate generic buttons.

5. Do not recreate generic inputs.

6. Do not recreate generic typography.

7. Do not create a parallel spacing system.

8. Use Saito variables directly.

9. Keep the component's CSS isolated.

10. Remember that applications may consume the component from many contexts.

11. Avoid making application-specific assumptions inside shared components.

12. Preserve the shared component's ability to participate in Saito themes.


## 70. AI Rules for Games

When modifying game CSS:

1. Identify the game root.

2. Keep game-specific visual identity inside the game CSS.

3. Reuse shared Saito/game infrastructure where appropriate.

4. Do not force board presentation into generic Saito card styling.

5. Keep game components independently understandable.

6. Use CSS for ordinary responsive game layout.

7. Use JavaScript when the game genuinely needs runtime viewport measurement.

8. Do not assume ordinary application CSS conventions completely describe game CSS.


## 71. AI Rules for Generated Stylesheets

Never make permanent edits directly to:

    node/web/saito/saito.css

or:

    mods/<module>/web/style.css

These files are generated.

Modify:

    node/web/saito/css-imports/*.css

or:

    mods/<module>/web/css/*.css

and then allow the normal compilation process to regenerate the output.


## 72. Final Principle

The goal of Saito CSS is not to make every application visually identical.

The goal is to provide a shared foundation that applications can consume, extend, and deliberately depart from without creating unnecessary architectural problems.

The preferred relationship is:

    Saito design system
        ↓
    module base / integration CSS
        ↓
    UI component CSS
        ↓
    component DOM

with:

    parent components
        arrange children

    child components
        own their internals

    Saito
        provides shared visual language

    applications
        provide application-specific identity

    games
        may provide substantially different visual languages

The most important rule for AI-assisted development is:

> Use Saito where Saito already solves the problem. Put application-specific styling in the component or module that actually owns it. Keep component boundaries visible in the CSS. Put Saito-wide overrides in base CSS. Do not create another design system unless the application genuinely needs one.

Good Saito CSS should be easy to locate, easy to understand, easy to theme, and easy to change without forcing an AI or human developer to understand unrelated parts of the application.
# Saito Responsive and Mobile UI Practices

## Purpose

Saito does not have a centralized responsive or mobile UI framework.

Responsive behavior is instead distributed across three layers:

1. The Saito UI and CSS system provides responsive behavior for shared components.
2. Individual applications control how their own page layouts adapt.
3. Games have a separate responsive model because boards, HUDs, and game controls often need viewport measurement and scaling that ordinary applications do not.

The important principle for developers and AI coding agents is therefore not to search for a generic Saito "mobile framework." There isn't one.

Instead, determine which part of the interface is responsible for the behavior and implement the responsive behavior at that level.

CSS should normally handle changes in layout, stacking, visibility, spacing, and sizing. JavaScript should be used when the application needs information that CSS cannot provide, such as the actual visual viewport, a change in the host element for a component, or the scale and position of a game board.

The repository contains recurring breakpoint values, particularly 600px, 620px, and 768px. These values have different meanings and should not be treated as interchangeable global breakpoints.

---

## 1. Saito Does Not Have a Formal Responsive Framework

There is no centralized responsive API comparable to a frontend framework's breakpoint system.

There is no general set of classes such as:

    hide-on-mobile
    show-on-mobile
    mobile-column
    desktop-only

There is also no single shared breakpoint variable that every application uses.

The shared Saito CSS contains several responsive rules, but applications still own the responsive behavior of their own pages.

This is deliberate in at least part of the architecture. The shared page-layout CSS contains a commented-out rule that would otherwise collapse the standard three-column Saito page layout:

    @media screen and (max-width: 900px) {
        .saito-container {
            padding: 0;
            grid-template-columns: 1fr;
        }
        ...
    }

The comment explains that this should be handled module by module.

This is an important architectural distinction:

> Saito provides responsive behavior for shared UI components, but does not impose one responsive page layout on every application.

An application may therefore have a very different mobile layout from another application while still using the same Saito UI components.

---

## 2. The Three Responsive Layers

Responsive behavior can generally be understood as three layers.

### Saito design-system and shared UI layer

This includes things such as:

- the Saito header
- the application menu
- overlays
- buttons
- inputs
- chat
- sidebars
- floating controls
- other shared UI

These components have their own responsive CSS and, where necessary, their own JavaScript.

An application using a Saito overlay should normally inherit the overlay's mobile behavior rather than recreate it.

### Application integration layer

Each application decides how its page is arranged.

This includes:

- number of columns
- page widths
- sidebar behavior
- mobile navigation
- whether panels disappear
- whether panels are replaced
- page-specific viewport handling
- application-specific safe-area padding

The application should implement these rules in its own base/page CSS and associated components.

### Component layer

Individual components control their own internal layout.

A component should normally have a distinctive root class and short descendant names, for example:

    .tweet
      .header
      .body
      .footer

Responsive rules affecting the tweet should generally live with the tweet's CSS rather than in an unrelated parent stylesheet.

The parent controls where the component is placed.

The component controls how it behaves inside that space.

This preserves the component ownership model used elsewhere in Saito.

---

## 3. CSS Is the Default Mechanism

For ordinary responsive behavior, prefer CSS.

CSS is the appropriate mechanism for things such as:

- changing the number of columns
- stacking elements
- reducing padding
- changing widths
- hiding secondary controls
- converting a sidebar into a bottom navigation bar
- changing typography
- changing spacing
- adapting buttons
- making an overlay full-screen
- adjusting component internals
- responding to viewport width
- responding to viewport orientation where appropriate

For example, an application may change from:

    grid-template-columns: 80px minmax(0, 1fr) 300px;

to:

    grid-template-columns: 1fr;

at a mobile breakpoint.

There is usually no reason for JavaScript to calculate the viewport width and manually apply those styles.

Use JavaScript when the application needs to do something that CSS alone cannot accomplish.

---

## 4. JavaScript Has Specific Responsive Responsibilities

There are several legitimate reasons for responsive JavaScript in Saito.

### Visual viewport handling

Mobile browsers change the visual viewport when:

- the virtual keyboard opens
- browser chrome changes
- the visible area changes without the layout viewport changing

Saito uses `window.visualViewport` in several places for this reason.

The common pattern is:

1. observe `visualViewport`
2. measure the visible viewport
3. write the result into a CSS custom property
4. let CSS consume that property

For example, an application may establish:

    --application-page-viewport-height

and then use it from CSS.

This is preferable to moving an entire layout system into JavaScript merely because mobile browsers have unusual viewport behavior.

### Changing the component host

Sometimes mobile behavior changes which component is displayed or where a component is mounted.

This cannot always be expressed as CSS.

RedSquare is an example. Its mobile interface has separate hosts for feed, chat, and settings:

    .manager[data-mobile-view="feed"]
    .redsquare-mobile-chat
    .redsquare-mobile-settings

The application uses JavaScript to select the active view.

This is an application-state decision rather than merely a visual CSS decision.

### Game board measurement and scaling

Games are another legitimate use.

A game board may have an intrinsic coordinate system and need to be fitted into the available viewport.

JavaScript can measure the actual board and viewport and calculate a scale.

That is fundamentally different from using JavaScript merely to ask whether the screen is 600px wide.

---

## 5. Do Not Confuse Viewport Width with a Mobile Device

Saito has `app.browser.isMobileBrowser()`.

This is a user-agent/device test.

It is not a responsive breakpoint.

It is not equivalent to:

    window.innerWidth <= 600

The distinction matters.

A desktop browser window can be resized below 600px without becoming a mobile device according to `isMobileBrowser()`.

Conversely, a phone can have a viewport wider than 600px in some situations.

`isMobileBrowser()` is therefore appropriate when behavior genuinely depends on device characteristics or mobile-browser interaction.

Examples in the repository include:

- mobile-specific sharing behavior
- shortened anonymous usernames
- mobile game presentation choices
- mobile chat behavior
- interaction behavior

It should not be used simply to decide whether a page should have one column.

For layout, use CSS media queries or, when JavaScript genuinely needs the state, viewport measurements/media queries.

---

## 6. Important Breakpoints

Saito does not have one formal breakpoint system, but several values recur.

The most important values are:

### 600px

600px is the recurring narrow/mobile layout boundary.

It is used for things such as:

- RedSquare's one-column layout
- RedSquare's bottom navigation
- chat becoming full-screen
- mobile overlay subform behavior
- shared button sizing
- game HUD classification
- various mobile controls
- game splash behavior

When creating an ordinary application that needs a mobile layout, 600px is therefore an important existing Saito convention.

It should not, however, be treated as a universal law. Application-specific layouts can require other values.

### 620px

620px is primarily associated with Saito header and floating-control chrome.

For example:

- hamburger panel width
- header padding
- floating plus button
- header icon sizing

620px is close to 600px but represents a different existing set of design decisions.

Do not mechanically replace every 620px rule with 600px.

### 768px

768px has a different role.

The shared Saito CSS uses it for:

- root font-size changes
- heading/paragraph size changes
- full-screen overlays
- input and related UI behavior

The overlay JavaScript also uses 768px as the point at which visual viewport measurements become relevant.

Thus:

    600px

and:

    768px

should not be treated as two names for the same concept.

600px is predominantly a narrow/mobile application layout boundary.

768px is an important shared Saito UI and typography boundary.

### Other values

Other breakpoints occur in individual applications and components:

- 375px
- 400px
- 420px
- 480px
- 525px
- 650px
- 660px
- 700px
- 720px
- 800px
- 820px
- 900px
- 992px
- 1000px
- 1200px

These should not automatically be interpreted as members of a global Saito breakpoint system.

Many exist because a particular component has a particular layout problem.

A developer should therefore inspect the existing component and its surrounding CSS before introducing or changing a breakpoint.

---

## 7. Shared Saito UI Already Handles Much of Mobile Behavior

Applications should take advantage of responsive behavior already implemented by shared Saito UI.

Do not reimplement behavior that the shared component already owns unless the application genuinely needs a different presentation.

### Header

The Saito header changes behavior around 620px.

The hamburger panel becomes full-width and the header padding and logo dimensions change.

The game header is separate and has additional behavior around 600px and short landscape viewports.

The header's use of `isMobileBrowser()` is not its primary layout mechanism.

### Slide-in menu

The ordinary application menu is part of the Saito header system.

At mobile widths it can become a full-width panel.

Applications should not create their own replacement for this simply because the application is being viewed on a phone.

If an application has a different navigation concept, that is an application-level component and should be implemented separately.

RedSquare's navigation is an example of such application-specific UI.

### Overlays

Saito overlays already have mobile behavior.

At widths up to 768px, an overlay becomes effectively full-screen:

- viewport-sized
- no normal desktop border radius
- no normal desktop shadow
- contained scrolling
- safe-area handling
- visual viewport support

The overlay uses:

    100dvh

as part of its modern viewport handling and can consume a dynamically supplied visual viewport height.

An application should therefore normally use `SaitoOverlay` rather than building an independent mobile modal system.

An application can still override the shared behavior when a particular overlay needs a different presentation.

Store does this for listing detail overlays.

### Buttons

Shared Saito buttons reduce their minimum widths at 600px and allow button rows to wrap.

This is an example of a shared component handling its own mobile adaptation.

Application CSS may customize the visual appearance, but should not unnecessarily duplicate the entire responsive behavior.

### Chat

Chat has a distinct mobile interaction mode.

At 600px it becomes full-screen and uses visual viewport dimensions.

The implementation also has JavaScript behavior because mobile chat needs to respond to the virtual keyboard and browser viewport.

This is a legitimate case where CSS and JavaScript cooperate.

---

## 8. Application Page Layouts Are Application-Owned

The standard Saito page container can support multi-column layouts, but the shared stylesheet does not force every application into one mobile transformation.

An application should decide what its mobile information architecture should be.

Possible strategies include:

- collapsing columns
- removing secondary columns
- converting a sidebar into a bottom bar
- replacing a panel with a full-screen view
- allowing a component to scroll independently
- using an overlay
- preserving the same structure but tightening spacing

The correct choice depends on the application.

Do not introduce a generic responsive controller or layout manager merely to standardize this behavior.

The application already owns the page structure.

---

## 9. RedSquare as a Reference Application

RedSquare is a useful current example of how an ordinary Saito application can implement responsive behavior.

It should be treated as a reference implementation, not as a framework.

Its base CSS changes the page layout at several widths.

At approximately 1200px:

    --saito-width: 1000px

and the columns become narrower.

At approximately 820px:

- the right sidebar is removed
- the available page height is tied to a visual viewport variable

At 600px:

- the page becomes one column
- bottom navigation space is reserved
- mobile views are selected
- safe-area space is respected

Its menu component independently changes shape.

At desktop sizes it is a side navigation.

At smaller sizes it becomes an icon-oriented menu.

At 600px it becomes a fixed bottom navigation bar.

The menu owns its own presentation in:

    redsquare-menu.css

The page owns the overall layout in:

    redsquare-base.css

Tweets own their own responsive behavior in their component CSS.

This is the preferred ownership relationship.

The parent page should not contain hundreds of selectors describing how tweets behave on mobile.

---

## 10. Mobile View Switching

RedSquare demonstrates an important distinction between responsive styling and responsive application state.

On mobile, RedSquare has separate views for:

- feed
- chat
- settings

The application uses JavaScript to select which view is active.

The views are associated with:

    data-mobile-view

and the inactive views use the `hidden` attribute.

This is different from simply changing CSS from three columns to one column.

If an application genuinely changes which interface is active, JavaScript state is appropriate.

Do not create JavaScript merely to reproduce a CSS layout change.

The distinction is:

    CSS:
    "These three elements should now stack."

versus:

    JavaScript:
    "The user is now viewing the chat screen rather than the feed screen."

---

## 11. Component-Owned Responsive CSS

Responsive rules should normally remain close to the component they affect.

For example:

    .tweet {
        ...
    }

    @media (max-width: 600px) {
        .tweet {
            ...
        }
    }

is generally preferable to having an unrelated application-wide stylesheet reach into the tweet's internal elements.

The component's CSS can control:

- its internal spacing
- its typography
- its internal layout
- its mobile stacking
- its mobile controls
- its own overflow behavior

The parent should control:

- where the component is placed
- the size of its containing region
- the overall page grid
- whether the component is shown
- whether the component occupies a column, row, panel, etc.

This is the same component ownership principle used elsewhere in Saito.

A parent may still apply a modifier through the component's root when context genuinely changes its presentation.

For example:

    .tweet.embedded

or:

    .tweet.focused

can legitimately affect the component's presentation.

The important point is that the relationship remains visible through the component root.

---

## 12. Page-Level Versus Component-Level Responsive Behavior

A useful distinction is:

### Page-level responsive behavior

This includes:

- number of columns
- sidebar removal
- navigation placement
- page width
- page height
- overall scrolling
- mobile view selection

This belongs in the application's base/page architecture.

### Component-level responsive behavior

This includes:

- card stacking
- tweet formatting
- button arrangement
- internal spacing
- image sizing
- local typography
- internal overflow

This belongs in the component's CSS.

### Shared-component responsive behavior

This includes:

- overlays
- header
- buttons
- shared inputs
- chat
- shared navigation

This belongs in the Saito shared UI implementation.

Avoid moving rules between these levels simply to make one file appear cleaner.

The location of the rule should follow ownership.

---

## 13. Viewport Height and Mobile Browser Chrome

Mobile width is not the only responsive problem.

Mobile browsers can change the visible viewport when:

- the address bar expands or contracts
- the keyboard opens
- browser chrome changes
- orientation changes

Saito uses modern viewport units in combination with `visualViewport` where necessary.

The principal units encountered in current code are:

    100dvh
    100svh

`100dvh` is useful when an interface needs to track the dynamic visible viewport.

`100svh` is useful where the smallest stable viewport is preferable, such as certain full-screen panels.

Older code also uses:

    100vh

especially in games and splash pages.

Do not mechanically replace every occurrence of `100vh`.

Some of these rules are legacy, while others are part of specialized game layouts. Inspect the surrounding behavior before changing them.

---

## 14. The Virtual Keyboard

The virtual keyboard is a particularly important case because it changes the visual viewport without necessarily changing the application's ordinary layout assumptions.

Saito handles this in several places by observing:

    window.visualViewport

and writing CSS variables.

For example, an application can maintain a variable representing the currently visible page height and let CSS consume it.

This is preferable to continuously calculating pixel positions for every element in JavaScript.

The general pattern is:

    visualViewport
        ↓
    JavaScript measurement
        ↓
    CSS custom property
        ↓
    CSS layout

This keeps the actual layout in CSS.

RedSquare uses this pattern for its page viewport.

Saito overlays use it for their viewport dimensions.

Chat uses it for its full-screen mobile interface.

---

## 15. Safe-Area Insets

Interfaces that place controls against the physical edge of a mobile display may need safe-area handling.

Saito uses:

    env(safe-area-inset-top)
    env(safe-area-inset-right)
    env(safe-area-inset-bottom)
    env(safe-area-inset-left)

where appropriate.

Examples include:

- overlay close controls
- RedSquare bottom navigation
- mobile compose controls
- Store page padding
- chat footer controls

Safe-area handling is not applied globally to every element.

Use it where the UI actually touches an edge that may be obscured by device hardware or system UI.

---

## 16. Scrolling

Saito generally does not rely on the document body as the application's primary scrolling surface.

The shared base CSS fixes the body to the viewport:

    position: fixed;
    height: 100dvh;
    width: 100vw;
    overflow: hidden;

Scrolling is instead provided by application containers and component bodies.

This is important when building mobile layouts.

Do not assume:

    body {
        overflow-y: auto;
    }

is the correct Saito architecture.

Instead, determine which container owns the application's scrollable content.

Examples include:

- `.saito-container`
- overlay bodies
- Store's application container
- feed containers
- chat content regions

This makes fixed headers, bottom navigation, overlays, and application panels easier to control.

---

## 17. Touch and Pointer Interaction

There is no general Saito application-wide touch event layer for ordinary controls.

Ordinary UI continues to use normal click and DOM event handling.

Touch-specific behavior appears primarily where the interaction genuinely requires it.

Games are the main example.

Game boards can use:

- pointer events
- drag handling
- board panning
- scaling
- orientation changes

A mobile interface should not automatically introduce separate `touchstart`, `touchmove`, and `touchend` implementations for ordinary buttons or navigation.

Use normal interaction mechanisms unless the UI genuinely requires gesture-specific behavior.

---

## 18. Games Have a Different Responsive Model

Games should not be forced into the same responsive architecture as ordinary applications.

A normal application primarily needs to rearrange UI.

A game often needs to preserve a spatial environment.

For example:

- a game board has intrinsic dimensions
- pieces have coordinates
- cards may have fixed aspect ratios
- a HUD occupies a defined region
- the board may need to scale rather than reflow
- the player may need to pan or zoom
- orientation may fundamentally change the available playing area

This is why game code legitimately uses more JavaScript measurement than ordinary Saito applications.

---

## 19. Game Root and Scaling

Game pages use a distinct root:

    html.game

The game layout establishes a 12px root font size and adjusts the Saito spacing and typography variables accordingly.

This is necessary because much game UI was authored around a different rem scale.

The game root should therefore not be treated as an accidental duplicate of ordinary Saito page CSS.

It is a separate visual environment.

Games also have their own header dimensions and game-specific responsive CSS.

---

## 20. Game HUD Responsiveness

The game HUD provides a clear example of CSS and JavaScript working together.

`GameHud.checkSizeAndOrientation()` determines whether the interface is:

- desktop
- mobile portrait
- mobile landscape

It uses viewport dimensions and orientation.

It then adds classes such as:

    hud-long
    hud-square
    hud-vertical

The CSS uses those classes to determine the actual layout.

This is a good pattern when the application needs to classify a complex responsive state that cannot conveniently be represented by one CSS rule.

The JavaScript determines the state.

The CSS renders the state.

Do not reproduce this pattern for a normal page whose layout can simply be expressed with media queries.

---

## 21. Game Board Scaling

Game boards sometimes need actual geometric scaling.

For example, the game card system calculates a board ratio from:

    getBoundingClientRect()

and uses that ratio when positioning pieces.

The mobile game hammer similarly measures the viewport and applies scaling and panning to the game board.

This is not ordinary responsive page layout.

It is part of the game's coordinate system.

Game developers should therefore distinguish:

    responsive layout

from:

    game-world scaling

The first normally belongs to CSS.

The second may legitimately belong to JavaScript.

---

## 22. Game Orientation

Games make much greater use of orientation than ordinary applications.

Game CSS contains rules for combinations such as:

    max-width: 600px
    max-height: 600px
    orientation: portrait
    orientation: landscape

The reason is that the playable area can change substantially between portrait and landscape.

Ordinary applications should not automatically adopt orientation-specific layouts simply because games do.

Use orientation queries when orientation actually changes the application's information architecture or available working area.

---

## 23. Mobile Game Themes

Some games use `isMobileBrowser()` to choose between different visual implementations.

For example, Poker, Texas, and Blackjack can select a flatter mobile theme instead of the desktop three-dimensional table.

This is a legitimate device-specific decision.

It is not a general responsive-layout pattern.

A desktop browser resized to a narrow window can remain on the desktop theme because the code is answering a different question:

> Is this running on a mobile browser?

rather than:

> Is the viewport narrow?

These concepts should remain separate.

---

## 24. Responsive Overlays in Games

Games have additional overlay rules beyond ordinary Saito overlays.

Game overlay CSS contains rules around:

- 800px
- 600px
- portrait/landscape
- available width
- available height

Some game overlays change their preferred dimension depending on orientation.

This is appropriate when the content itself is game-specific.

Do not assume that every game overlay should be replaced with the ordinary application overlay layout.

---

## 25. Store as Another Ordinary Application Pattern

Store provides a useful contrast to RedSquare.

Store generally does not replace its desktop interface with a separate mobile application state.

Instead it:

- tightens page padding
- changes spacing
- adapts overlays
- applies safe-area padding
- allows its content container to scroll

For example, Store changes its user rhythm at approximately 900px and changes overlay behavior around 600px.

This demonstrates that there is no requirement for every application to adopt RedSquare's mobile view-switching model.

The application's information architecture determines the appropriate implementation.

---

## 26. Responsive CSS Should Be Scoped

Prefer selectors that make ownership obvious.

For example:

    .redsquare .menu {
        ...
    }

or:

    .tweet {
        ...
    }

with responsive rules close to the component's normal declarations.

Avoid creating broad selectors that unintentionally affect unrelated modules.

This is particularly important in Saito because many applications can exist within the same runtime and can use shared Saito UI.

A module's responsive behavior should not accidentally alter another module's interface.

The module base stylesheet is the appropriate place for application-level integration and overrides.

Component styles should remain close to the components they own.

---

## 27. Saito CSS Variables and Responsive Themes

Saito applications should generally use existing Saito CSS variables where they represent meaningful design concepts.

For example:

    var(--saito-space-lg)
    var(--saito-space-xxl)

and other Saito variables can automatically participate in Saito themes.

This matters because Saito UI can be themed, including through application/NFT-based themes.

A module using Saito variables directly can therefore adapt naturally when the underlying Saito theme changes.

Do not create aliases merely to rename Saito variables:

    --my-module-large-space: var(--saito-space-lg);

unless the module concept genuinely differs from the Saito concept.

Responsive CSS should likewise avoid unnecessary abstraction layers.

---

## 28. Custom Properties for Responsive State

CSS custom properties are useful when JavaScript has measured something that CSS needs to consume.

Good examples include:

    --saito-overlay-viewport-height
    --redsquare-page-viewport-height
    --chat-viewport-height

These variables represent actual concepts.

They are not merely renamed versions of existing properties.

This is an important distinction.

Do not create a custom property such as:

    --my-module-mobile-width: 600px;

simply to avoid writing `600px`.

A custom property is useful when it represents meaningful configuration, theme state, component state, or a value supplied dynamically by JavaScript.

---

## 29. Responsive Typography

Saito's shared CSS changes the root font size at approximately 768px.

This affects ordinary rem-based sizing.

There are also more specialized compensations in components such as the header.

Games use a separate 12px root and adjust their token values accordingly.

Developers should therefore inspect the actual Saito CSS before introducing new typography breakpoints.

Do not assume that a framework-style scale such as:

    1200
    992
    768
    576

exists throughout Saito.

It does not.

Individual components may contain values that resemble conventional frontend breakpoints, but those values often belong only to that component.

---

## 30. Avoid Creating a Generic Responsive Abstraction

A common AI mistake would be to see several modules using:

    600px

and respond by creating:

    ResponsiveManager
    BreakpointService
    MobileLayoutManager
    ResponsiveController

or a centralized breakpoint registry.

That would add architecture without solving a demonstrated problem.

Saito's existing model is simpler:

- shared components own shared responsive behavior
- applications own application layout
- components own component layout
- games own game scaling

If several components eventually require a genuinely shared behavior, that behavior can be promoted into Saito's shared UI.

Do not create a framework merely because several CSS files contain similar media queries.

---

## 31. Avoid Using JavaScript for CSS Problems

Do not write:

    if (window.innerWidth < 600) {
        element.style.width = ...
        element.style.display = ...
        element.style.margin = ...
    }

when a media query can express the same behavior.

This creates several problems:

- layout logic becomes difficult to discover
- resize handling becomes necessary
- CSS and JavaScript can disagree
- component ownership becomes less clear
- other developers cannot understand the responsive behavior by reading the stylesheet

Prefer:

    @media (max-width: 600px) {
        ...
    }

when the behavior is purely presentational.

Use JavaScript only when the responsive state actually affects application behavior or when the browser exposes information that CSS cannot conveniently provide.

---

## 32. Avoid Using CSS for Application State

The opposite mistake is also possible.

If the application genuinely has different screens or rendering hosts, do not attempt to represent the entire application state using increasingly complicated selectors.

RedSquare's feed/chat/settings distinction is a good example.

The application knows which view the user is in.

JavaScript should manage that state.

CSS should determine how the selected view is presented.

---

## 33. Avoid Treating Every Existing Pattern as Canonical

The repository contains legacy CSS and transitional implementations.

Some examples include:

- older `100vh` rules
- unusual component-specific breakpoint sets
- duplicated 600px logic
- old pixel-based game layout rules
- JavaScript listeners whose effects have since become less important
- components with their own typography systems

Existing code is evidence of what Saito has needed to support, but not every existing implementation is a model for new code.

When modifying an existing component:

1. preserve behavior that is intentional
2. identify which rules are actually required
3. remove unnecessary duplication when safe
4. avoid expanding legacy patterns into new parts of the application

---

## 34. The 600px / 620px / 768px Distinction

One particularly important rule for AI agents is:

> Do not collapse Saito's recurring breakpoint values into a single generic "mobile breakpoint."

The three most important values have different responsibilities.

600px is commonly the narrow application layout boundary.

620px is primarily shared header and floating-control chrome.

768px is used for shared typography and full-screen overlay behavior.

Changing one does not imply that the others should change.

If a new requirement says "make this mobile," inspect the component and determine which existing behavior it belongs to.

---

## 35. When to Add a New Breakpoint

Before adding a breakpoint, ask:

1. What visual or interaction problem does the breakpoint solve?
2. Which component owns that problem?
3. Can CSS flexbox or grid solve it without another breakpoint?
4. Is the behavior already handled by shared Saito CSS?
5. Does the component actually need a different layout at that width?
6. Would an existing Saito breakpoint provide the required behavior?
7. Is the new value genuinely specific to the component?

Do not add a breakpoint merely because another framework commonly uses that width.

Saito has accumulated several component-specific breakpoints over time. New code should avoid increasing that fragmentation unnecessarily.

---

## 36. Responsive Development Should Follow Component Ownership

A practical development pattern is:

1. Establish the page's normal desktop structure.
2. Identify the major responsive transformation.
3. Put the page-level transformation in the application's base CSS.
4. Let each component handle its own internal transformation.
5. Use existing Saito shared UI behavior rather than duplicating it.
6. Add JavaScript only where responsive behavior changes application state or requires measurement.
7. Test the resulting interaction on narrow viewports and mobile devices.
8. Preserve the component boundaries while adapting the layout.

This is not a mandatory framework sequence.

It is a useful way to reason about where responsive behavior belongs.

---

## 37. AI Development Rules

When modifying or creating responsive Saito UI:

- Assume responsive behavior is primarily CSS unless there is a concrete reason otherwise.
- Inspect the component's existing CSS before adding responsive rules.
- Use the Saito shared UI's responsive behavior when using shared components.
- Treat the application base CSS as the owner of page-level layout.
- Treat component CSS as the owner of component-level layout.
- Keep selectors scoped to the component or application that owns them.
- Use existing Saito CSS variables when they represent the desired concept.
- Do not create CSS variable aliases merely to rename existing Saito variables.
- Do not create a generic responsive manager or breakpoint service.
- Do not use `isMobileBrowser()` as a substitute for a viewport breakpoint.
- Do not use JavaScript to reproduce a CSS media query.
- Use JavaScript when responsive behavior changes application state.
- Use `visualViewport` when the actual visible viewport matters.
- Use safe-area insets when controls touch device edges.
- Preserve Saito's container-based scrolling model.
- Treat games as a specialized responsive environment.
- Do not copy game board scaling techniques into ordinary applications.
- Do not assume that every recurring breakpoint is a global Saito breakpoint.
- Do not assume that existing legacy CSS is canonical.
- Inspect the actual Saito CSS before changing typography or spacing behavior.
- Preserve deliberate application-specific behavior.

---

## 38. Practical Decision Guide

When the requirement is:

**"The columns should collapse on a narrow screen."**

Use CSS in the application's base stylesheet.

**"The card should stack its internal elements on mobile."**

Use the card's own CSS.

**"The Saito overlay should become full-screen."**

Use `SaitoOverlay`; its shared CSS already handles this.

**"The user should switch from the feed to the chat screen."**

Use application state and JavaScript.

**"The keyboard is covering the bottom of the interface."**

Consider `visualViewport` and a CSS custom property.

**"The bottom navigation needs to avoid the iPhone safe area."**

Use the appropriate `env(safe-area-inset-bottom)` value.

**"The game board needs to shrink while preserving its coordinate system."**

Use game-specific measurement and scaling.

**"The UI should look different because the device is a phone."**

Determine whether this is actually a device-capability question. If so, `isMobileBrowser()` may be appropriate.

**"The UI should become one column below 600px."**

Use a media query unless the application needs JavaScript state associated with that transition.

**"Several modules use 600px, so let's create a global BreakpointManager."**

Do not do this without a demonstrated architectural need.

---

## 39. Reference Implementations

The following files are particularly useful when implementing responsive behavior.

### Shared Saito CSS

`node/web/saito/css-imports/saito-base.css`

Useful for:

- root typography
- page viewport
- body behavior
- global responsive foundations

`node/web/saito/css-imports/saito-page-layout.css`

Useful for:

- standard page layout
- understanding why page-level responsive collapse remains application-owned

`node/web/saito/css-imports/ui/saito-header.css`

Useful for:

- header responsiveness
- hamburger behavior
- mobile header sizing

`node/web/saito/css-imports/ui/saito-overlay.css`

Useful for:

- full-screen mobile overlays
- safe-area handling
- dynamic viewport behavior

`node/web/saito/css-imports/ui/saito-input.css`

Useful for:

- shared input behavior

`node/web/saito/css-imports/saito-buttons.css`

Useful for:

- shared mobile button sizing and wrapping

`node/web/saito/css-imports/saito-chat.css`

Useful for:

- full-screen mobile chat
- mobile viewport behavior

### RedSquare

`node/mods/redsquare/web/css/redsquare-base.css`

Useful for:

- application-level responsive layout
- page grid changes
- mobile safe-area handling
- visual viewport integration

`node/mods/redsquare/web/css/redsquare-menu.css`

Useful for:

- component-owned mobile navigation
- desktop sidebar to mobile bottom-bar transformation

`node/mods/redsquare/web/css/redsquare-tweet.css`

Useful for:

- component-local responsive behavior

`node/mods/redsquare/lib/main.js`

Useful for:

- mobile view state
- visual viewport handling
- component host changes

### Store

`node/mods/store/web/css/store-base.css`

Useful for:

- application-level responsive integration
- safe-area handling
- overlay customization
- an alternative to RedSquare's mobile view-switching model

### Games

`node/web/saito/css-imports/game-layout.css`

Useful for:

- game-specific root sizing
- game layout
- orientation-specific behavior

`node/lib/saito/ui/game-hud/game-hud.js`

Useful for:

- game viewport classification
- portrait/landscape HUD behavior

`node/lib/saito/ui/game-hammer-mobile/game-hammer-mobile.js`

Useful for:

- board panning and scaling

`node/lib/templates/gametemplate-src/gametemplate-cards.js`

Useful for:

- board-relative scaling and coordinate calculations

`node/lib/saito/browser.ts`

Useful for understanding:

- `isMobileBrowser()`
- the distinction between device detection and viewport detection

---

## 40. Final Principle

Saito responsive design is not a separate framework layered on top of the application architecture.

It is an extension of the existing ownership model.

Shared Saito components handle their own shared responsive behavior.

Applications handle their own page structure.

Components handle their own internal layout.

Games handle their own spatial scaling and specialized interaction.

CSS should do as much of the work as possible.

JavaScript should be introduced when the application needs actual state, measurement, or interaction information that CSS cannot provide.

The goal is not to make every Saito application respond identically to a phone.

The goal is to let each application remain structurally coherent while adapting its own interface to the available space and interaction environment.

For AI-generated code, the most important rule is therefore:

> Do not invent a generic responsive architecture for Saito. Find the owner of the responsive behavior, use CSS where CSS is sufficient, use Saito's existing shared behavior where it applies, and introduce JavaScript only when the application genuinely needs state or measurement that CSS cannot provide.
