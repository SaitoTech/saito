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
