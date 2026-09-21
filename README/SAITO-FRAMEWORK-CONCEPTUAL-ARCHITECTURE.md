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
