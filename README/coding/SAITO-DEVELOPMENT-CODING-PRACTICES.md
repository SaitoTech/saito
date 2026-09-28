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
