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

`mod` is the application module.

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
        the application and its runtime state

Passing `mod` into a UI component gives that component access to the Saito module. It does not make the module the UI parent, and it does not mean the module owns the component's visual behavior.

Object construction does not by itself establish UI ownership. If the module constructs Main, and Main constructs Body, and Body constructs Prepare, then Main is the UI parent of Body and Body is the UI parent of Prepare.

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

Object construction does not by itself establish that ownership. The ModTemplate may create Main, while Main remains the UI parent of the components Main creates.

For example:

    Main
      -> Header
      -> Body
           -> Splash
           -> Prepare
           -> Document

If Splash changes the surface to Prepare, the normal first question is which UI component owns Splash and Prepare. If Body owns them, Body should normally own that transition.

Do not automatically create:

    mod.showPrepare()

merely because the component has a `mod` reference. `mod` is application and runtime access. It is not automatic UI ownership.

A simple application may still use the module for a UI action. That is a reasonable choice when there is no real UI hierarchy. It is a poor default once several surfaces exist.

A Main UI object is a UI component. It is not an enterprise-style controller.

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
        meaningful to the UI that displays it

Which surface is displayed is presentation state of the UI component that owns those surfaces. The domain object being displayed can still live on the module.

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
