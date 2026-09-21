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

