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

