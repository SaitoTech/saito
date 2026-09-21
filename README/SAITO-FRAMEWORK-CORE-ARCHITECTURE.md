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
