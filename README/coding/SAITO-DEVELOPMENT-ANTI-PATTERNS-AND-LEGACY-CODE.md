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

If a module has three UI components, the main module can construct them directly when the application is simple. Once those components form a visual hierarchy, the module should normally construct the top-level UI object, and that object should construct the components beneath it.

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

A module can construct its top-level UI and let that UI own the visual hierarchy beneath it.

For a simple module, constructing several UI objects directly is fine. For a multi-surface application, the usual shape is `this.main`, with Main owning Header, Body, and the surfaces under them. Directly attaching every screen to the module, and then adding the methods that switch among them, is the UI-router problem described next.

The module remains the application map. The UI hierarchy remains the UI ownership map.

The components should contain the details of their own presentation and interaction.

---

# Do Not Turn the ModTemplate Into a UI Router

A common AI-generated failure is to accumulate methods such as:

    showSplash()
    showSettings()
    showDocument()
    showPurchase()
    reject()
    openView()

on the ModTemplate.

The problem is not the number of lines, and it is not the presence of a method whose name starts with `show`.

The problem is that the ModTemplate gradually becomes the owner of a UI hierarchy that should be owned by UI components.

Prefer:

    ModTemplate
      -> Main UI
           -> Header
           -> Body
                -> application UI

The UI owner should normally decide which child surface is displayed.

This is a default for applications with a meaningful UI hierarchy, not an absolute ban on UI methods in ModTemplate. Simple single-screen modules and specialized cases may reasonably keep small UI behavior in the module when that is the simplest design.

Do not solve this by introducing Controller, ViewManager, ScreenManager, Router, UIService, or similar abstractions unless the application genuinely requires them.

The solution is ordinary Saito component composition.

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
