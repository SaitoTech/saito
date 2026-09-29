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
