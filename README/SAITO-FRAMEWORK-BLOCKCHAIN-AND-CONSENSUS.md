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
