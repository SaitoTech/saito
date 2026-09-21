# Saito Application Modules: Main Files and ModTemplate

This document defines how the main file of a Saito application should be structured, how it should relate to `ModTemplate`, and how application logic should be organized around lifecycle hooks, transactions, peer messages, domain objects, and UI components.

The goal is not merely to describe what the framework permits.

The goal is to establish the structure that an AI should normally produce when creating or modifying a Saito application.

Saito modules are intentionally conventional. The main module file should provide a compact map of how the application participates in the Saito runtime, while semantically meaningful application logic should be organized into objects and files that make the application easy to understand and debug.

The guiding principle is:

> The module is the application. Organize its internal parts semantically, but do not introduce layers merely to create indirection.

This means that Saito applications should generally prefer:

    app
      ↓
    module
      ├── transactions
      ├── domain objects
      ├── UI components
      ├── database
      └── other semantically meaningful objects

over:

    app
      ↓
    controller
      ↓
    service
      ↓
    manager
      ↓
    repository
      ↓
    module
      ↓
    actual logic

The latter structure may be familiar from other software ecosystems, but it is not the Saito architectural model.

---

## 1. The Main Module File Is the Application's Architectural Map

The main file is normally:

    node/mods/<slug>/<slug>.js

For example:

    node/mods/redsquare/redsquare.js
    node/mods/store/store.js
    node/mods/chat/chat.js

It extends `ModTemplate` and exports the module class.

The main file should contain the functions that explain how the application participates in Saito.

A well-structured main file should allow a developer to open one file and quickly answer questions such as:

- What is this application called?
- What is its slug?
- What does it initialize?
- What UI does it render?
- What blockchain messages does it listen for?
- What off-chain requests does it listen for?
- What peer services does it provide?
- What capabilities does it expose to other modules?
- Does it provide custom HTTP behavior?
- Where are the substantive application objects and transaction implementations?

The main file should therefore be relatively prescriptive in structure.

It should normally consist primarily of:

    constructor()
    installModule()
    initialize()
    render()
    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()
    returnServices()
    respondTo()
    webServer()

plus any other actual `ModTemplate` lifecycle hooks that the application genuinely needs.

Unused hooks should not be added merely because they exist on `ModTemplate`.

The main file is not intended to be a dumping ground for every function used by the application.

---

# 2. `ModTemplate` Is the Application Contract

A Saito application normally extends:

    ModTemplate

`ModTemplate` provides the generic Saito module behavior and establishes the lifecycle through which the application participates in the runtime.

Important lifecycle functions include:

    installModule()
    initialize()
    render()
    onConfirmation()
    onNewBlock()
    onChainReorganization()
    onPeerServiceUp()
    handlePeerTransaction()
    respondTo()
    returnServices()
    webServer()

There are additional hooks in the framework, but an application should implement only those that have a real semantic purpose.

The presence of a method on `ModTemplate` does not mean every module should override it.

The preferred rule is:

> Override the smallest set of Saito lifecycle methods necessary to express the application's behavior.

This is particularly important for AI-generated code.

An AI should not look at `ModTemplate` and copy its entire API into every new module.

---

# 3. The Main File Should Prefer Lifecycle Hooks Over Arbitrary Module Methods

The main class can contain application-specific methods when they genuinely belong to the module itself.

However, the preferred architecture is that the main class primarily expresses Saito lifecycle and protocol participation.

For example:

    constructor(app)

    initialize(app)

    render(app)

    onConfirmation(blk, tx, conf, app)

    handlePeerTransaction(app, tx, peer, mycallback)

    onPeerServiceUp(app, peer, service)

These functions describe how the application connects to Saito.

Substantial application behavior should generally be placed into semantically named objects in `lib/`.

For example:

    lib/
        transactions.js
        tweet.js
        database.js
        P2SH.js
        warehouse.js
        images.js

The exact files depend on the application.

The important rule is semantic organization.

Do not create a file merely because a file can be created.

Do not create a helper merely because a function can be extracted.

---

# 4. Avoid Pointless Helper Functions

One of the most important coding practices in Saito application development is to avoid pointless helper functions.

For example, this is generally undesirable:

    createTweetTransaction(data) {
      return this.transactions.createTweetTransaction(data);
    }

If the module already owns `this.transactions`, this function adds no semantic value.

It creates an unnecessary path:

    UI
      ↓
    mod.createTweetTransaction()
      ↓
    mod.transactions.createTweetTransaction()
      ↓
    actual implementation

The preferred structure is:

    UI
      ↓
    mod.transactions.createTweetTransaction()

The module is already the cohesive application object. There is no need to create a wrapper simply to make the module appear to expose a function that already belongs to one of its objects.

This is not an argument for making everything a separate object.

It is an argument for putting behavior in the object where it semantically belongs.

The AI should ask:

> Does this function provide a meaningful abstraction, or does it merely forward the call?

If it merely forwards the call, it should normally not exist.

---

# 5. Prefer Conceptual Organization Over Artificial Layering

A Saito module should be internally coherent.

If an application has transaction logic, it can have:

    this.transactions

If it has a database abstraction that is substantial enough to deserve one, it can have:

    this.database

If it has domain objects, it can have:

    this.tweets
    this.games
    this.orders

If it has a UI, it can have:

    this.main
    this.header
    this.sidebar

These objects should be attached directly to the module when they are persistent parts of the module.

For example:

    constructor(app) {
      super(app);

      this.transactions = new Transactions(app, this);
      this.tweets = [];
      this.main = null;
    }

Then other objects can use those objects directly:

    this.mod.transactions.createTweetTransaction(...)
    this.mod.tweets
    this.mod.main

There is no need for the module to become a collection of forwarding functions.

The module is the owner.

Its internal objects are its components.

---

# 6. The Constructor

The constructor is called when the module object is created.

It is therefore the appropriate place to establish persistent object structure and defaults.

A constructor may reasonably:

- call `super(app)`;
- establish module identity;
- establish default values;
- initialize persistent arrays or maps;
- construct persistent domain or transaction objects;
- establish event listeners that belong to the lifetime of the module;
- establish references to objects that the module will always own.

For example:

    constructor(app) {
      super(app);

      this.name = "RedSquare";
      this.slug = "redsquare";

      this.transactions = new Transactions(app, this);

      this.tweets = [];
      this.main = null;
    }

The important distinction is that construction is object setup, not complete application initialization.

The constructor should not assume that all of Saito has finished starting.

In particular, the constructor should not normally assume that:

- other modules have been initialized;
- SQL databases have been installed;
- peers exist;
- peer services are available;
- the blockchain has initialized;
- the application has a rendered DOM;
- the module is the active browser module.

Avoid constructor-time lookups such as:

    app.modules.returnModule("SomeModule")

when the lookup depends on module initialization order.

Likewise, do not perform browser rendering in the constructor.

---

# 7. Constructor Event Listeners

A constructor is also a reasonable place to attach listeners to `app.connection` when those listeners belong to the persistent lifetime of the module.

For example:

    constructor(app) {
      super(app);

      this.app.connection.on("some-event", (data) => {
        this.handleSomething(data);
      });
    }

The reason this can be appropriate is that the module object itself persists for the lifetime of the application.

This is different from attaching listeners to transient UI objects that may be repeatedly created and destroyed.

The AI should therefore distinguish:

    persistent module listener
        → constructor can be appropriate

from:

    DOM/component listener
        → component attachEvents()

The exact placement should follow the lifetime of the object receiving the listener.

---

# 8. `installModule()`

`installModule()` is for first-time installation.

It is especially relevant to Node-side module SQL.

If the module contains:

    sql/

then the installation system can create the module's database structures during installation.

This is different from `initialize()`.

Conceptually:

    installModule()
        first-time installation

    initialize()
        every startup

A module should not move normal startup behavior into `installModule()` merely because it happens to need a database.

Likewise, an AI should not add `sql/` merely because a database might someday be useful.

The existence of `sql/` is itself a meaningful architectural decision.

---

# 9. `initialize()` Means "Make the Module Functional"

`initialize()` runs when the application starts.

It is not screen initialization.

It is not equivalent to a web application's controller startup.

It makes the module ready to participate in Saito.

A normal ModTemplate application should generally call:

    await super.initialize(app);

unless there is a specific architectural reason not to.

The superclass initialization establishes important generic module state.

A typical pattern is:

    async initialize(app) {
      await super.initialize(app);

      // module-specific initialization
    }

The AI should treat failure to call `super.initialize(app)` as an exception requiring an explicit reason, not as a normal alternative style.

---

# 10. `initialize()` Must Not Be Confused With `render()`

A module can be initialized even when its UI is not currently visible.

This is fundamental to Saito's architecture.

For example:

    initialize()
        ↓
    module can receive messages
    module can receive transactions
    module can answer capabilities
    module can maintain application state

while:

    render()
        ↓
    browser UI is written or updated

The two responsibilities are different.

Do not put screen rendering into `initialize()` merely because the module is being initialized.

Likewise, do not assume that a module needs to be initialized only when its screen is opened.

---

# 11. Do Not Depend on Peers During `initialize()`

Peer availability is a later condition.

A module may be fully initialized before the network connection to a useful peer exists.

Therefore, operations that depend upon peers should generally be initiated from:

    onPeerServiceUp()

rather than from `initialize()`.

For example, avoid:

    async initialize(app) {
      await super.initialize(app);

      // immediately request something from peers
      await this.requestDataFromPeer();
    }

if the request assumes a peer or service that may not yet exist.

Prefer:

    async onPeerServiceUp(app, peer, service) {
      if (service === "my-service") {
        await this.requestDataFromPeer(peer);
      }
    }

This avoids startup races in which initialization succeeds but the network-dependent operation silently fails because peers have not yet become available.

---

# 12. `render()` Is the Browser UI Entry Point

For modern Saito applications, `render()` is the primary module-level UI entry point.

It should normally be thin.

Its purpose is to:

- determine which application components need to exist;
- create or register those components;
- invoke their rendering;
- establish application-level routing or screen state.

Substantial DOM implementation should normally live in `lib/ui/`.

A conceptual pattern is:

    async render() {
      if (!this.browser_active) return;

      if (!this.main) {
        this.main = new Main(this.app, this);
      }

      await super.render();
      await this.main.render();
    }

The exact implementation varies.

The architectural principle is more important:

> The module's `render()` method should identify and coordinate the UI rather than contain a giant implementation of the UI itself.

---

# 13. UI Components Receive `app` and `mod`

Application UI components normally receive:

    app
    mod

For example:

    constructor(app, mod) {
      this.app = app;
      this.mod = mod;
    }

This gives the component direct access to:

    this.app
    this.mod

The component can therefore use the application's own objects directly.

For example:

    this.mod.transactions.createTweetTransaction(...)
    this.mod.tweets
    this.mod.database
    this.mod.main

There is no need to create a UI service layer merely to mediate access to the module.

A component is part of the application.

It is not an external client of the application.

---

# 14. UI Components Can Call Module-Owned Objects Directly

Suppose the module creates a transaction object during initialization:

    this.transactions = new Transactions(app, this);

The UI should use:

    this.mod.transactions.createTweetTransaction(...)

rather than:

    this.mod.createTweetTransaction(...)

which then forwards to:

    this.mod.transactions.createTweetTransaction(...)

The latter is unnecessary indirection.

The same principle applies to domain objects.

If RedSquare has a `Tweet` object, that object already has:

    this.app
    this.mod
    this.tx

It can therefore use the module and its owned objects directly.

The module should not accumulate proxy methods simply because another object needs to access one of its internal objects.

---

# 15. `render()` May Run More Than Once

A Saito UI component should not assume that `render()` executes only once.

Components may be rendered repeatedly as application state changes.

Therefore, component rendering should generally be written so that it can update existing DOM rather than blindly creating duplicate structures.

Saito browser helpers and established component patterns should be used where appropriate.

The relevant mental model is:

    state changes
        ↓
    render()
        ↓
    component updates existing UI

rather than:

    render()
        ↓
    destroy everything
        ↓
    recreate the entire application

The exact implementation depends on the component.

---

# 16. `attachEvents()` and `initializeHTML()` Are Legacy Patterns

`ModTemplate` contains older UI lifecycle methods including:

    initializeHTML()
    attachEvents()

These exist because older Saito applications used a different UI organization.

For new application development, prefer:

    render()
    UI components
    component-level event attachment

rather than automatically implementing the old module-level methods.

Games and older modules may still use legacy lifecycle paths, especially through `GameTemplate`.

Do not rewrite a working legacy application merely because it uses an older lifecycle.

But do not copy legacy structure into a new application without a reason.

---

# 17. `onConfirmation()` Is the On-Chain Application Listener

`onConfirmation()` is how a module responds to blockchain transactions that belong to its application.

Conceptually:

    transaction
        ↓
    blockchain
        ↓
    confirmation
        ↓
    module.onConfirmation()

The module has effectively opted into the transaction through its application message.

A typical application transaction contains:

    tx.msg.module = this.name

and the module processes its own messages from `onConfirmation()`.

For example:

    async onConfirmation(blk, tx, conf, app) {

      if (conf != 0) return;

      if (tx.msg.module !== this.name) return;

      // process application transaction
    }

The precise confirmation policy depends on the application.

But the common Saito pattern is to use `conf == 0` when the application wants to process the transaction when it first enters the current longest chain.

This is not the same thing as an irreversible finality guarantee.

---

# 18. `onConfirmation()` Is Not a General Message Bus

An AI should not think of `onConfirmation()` as:

    "Here is a transaction; decide whether you want it."

It is more structured than that.

The blockchain callback is associated with application transactions, and the module normally determines whether the transaction belongs to it using the application message.

The common pattern is:

    tx.msg.module
        ↓
    module identity
        ↓
    application-specific request
        ↓
    receive function

For example:

    tx.msg.module = "RedSquare"
    tx.msg.request = "create tweet"

RedSquare can then process that transaction.

This is different from off-chain peer messages.

---

# 19. `handlePeerTransaction()` Is Intentionally More Flexible

`handlePeerTransaction()` is called for incoming off-chain peer transactions/messages.

The important architectural distinction is:

    onConfirmation()
        blockchain/application participation

    handlePeerTransaction()
        off-chain peer communication

The framework does not know in advance which module wants to receive an off-chain message.

Therefore, incoming peer messages are delivered to modules and each module inspects the request.

Conceptually:

    incoming peer message
          ↓
    all modules
          ↓
    each module checks request
          ↓
    matching module processes it

This is intentionally more flexible than `onConfirmation()`.

---

# 20. Off-Chain Requests Need Specific Names

Because every module can see a peer transaction, request names should be sufficiently specific to identify their purpose.

A useful convention is:

    <module>-<request>

or, for more structured application protocols:

    <module>-request-<operation>

For example:

    redsquare-request-tweet

This immediately communicates:

    RedSquare
        ↓
    request
        ↓
    tweet

The precise naming convention can follow the existing application, but the general principle is important:

> An off-chain request should be specific enough that a developer can identify its owning application and semantic purpose from the request name.

Avoid generic requests such as:

    update
    data
    request
    message

when they could collide conceptually with unrelated application protocols.

---

# 21. Off-Chain Requests Often Map to Transaction Pairs

An off-chain request can correspond closely to an on-chain transaction type.

For example:

    redsquare-request-tweet

may correspond to:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

The important architectural relationship is the pair:

    create
       ↕
    receive

The create function constructs the message that another Saito participant will receive.

The receive function defines what that message means when it arrives.

This pair should be easy to identify.

A developer reading:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

should immediately understand that these functions form the two ends of the same application protocol.

---

# 22. Transaction Create/Receive Functions Are Semantic Pairs

Transaction logic should be organized around these protocol pairs.

For example:

    createTweetTransaction()
    receiveTweetTransaction()

or:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

or:

    createPurchaseTransaction()
    receivePurchaseTransaction()

The names should communicate the relationship.

The receive function should make it immediately apparent which create function produces the transaction or message that it consumes.

This is particularly important in applications with many transaction types.

The pairing makes the protocol locally inspectable.

An AI should not create unrelated generic functions such as:

    processTransaction()
    handleMessage()
    executeRequest()

and then hide all transaction semantics behind a generic dispatcher unless the application genuinely requires such an abstraction.

---

# 23. Where Transaction Functions Belong

For a small module, transaction functions may live directly in the main module file.

This is common in Saito applications.

For example:

    onConfirmation()
    createTweetTransaction()
    receiveTweetTransaction()

may all exist in the main file if the module is small enough.

When an application has many transaction types, the transaction implementation can be moved into a semantically named object or file.

For example:

    lib/transactions.js

or, where the transaction system is large enough:

    lib/transactions/
        tweets.js
        orders.js
        listings.js

The reason for moving transaction logic is not that transaction logic is somehow supposed to belong to a separate architectural layer.

The reason is simply organizational scale.

Store is an example where transaction logic became sufficiently substantial to justify a dedicated transaction object/file, including transaction types involving P2SH.

The important rule is:

> Move transaction logic when the number or complexity of transaction types makes the main file difficult to understand, not because Saito requires a generic transaction layer.

---

# 24. Expose Transaction Objects Directly

If a module creates a transaction object, attach it directly to the module.

For example:

    initialize(app) {
      await super.initialize(app);

      this.transactions = new Transactions(app, this);
    }

A UI component can then use:

    this.mod.transactions.createTweetTransaction(...)

An off-chain handler can use:

    this.transactions.receiveRequestTweetTransaction(...)

The main module does not need:

    createTweetTransaction()
    receiveTweetTransaction()
    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

as forwarding methods if all those functions already belong to `this.transactions`.

The object itself is the semantic namespace.

This gives the application a clear internal structure without introducing an unnecessary abstraction layer.

---

# 25. Domain Objects Follow the Same Principle

RedSquare provides an important example.

A Tweet is not merely an anonymous object containing metadata.

It is a meaningful domain object.

A `Tweet` object can contain:

    this.app
    this.mod
    this.tx

and functions that operate on a Tweet.

The object therefore knows:

    what a Tweet is
    how it relates to the application
    what transaction produced it
    what application state it needs

Other components can then work with:

    tweet

rather than repeatedly reconstructing Tweet semantics from raw transaction data.

The same principle applies to other applications.

Examples include:

    Game
    Invite
    Order
    Listing
    Tweet
    Image
    Warehouse record

The object should represent a meaningful application concept.

Do not create classes for arbitrary data structures merely to satisfy an object-oriented pattern.

---

# 26. Domain Objects Can Use the Owning Module Directly

A domain object normally receives:

    app
    mod

For example:

    constructor(app, mod, tx) {
      this.app = app;
      this.mod = mod;
      this.tx = tx;
    }

Because `mod` is the owning module, the object can access the module's own objects directly.

For example:

    this.mod.transactions
    this.mod.database
    this.mod.tweets
    this.mod.main

This is preferable to creating additional proxy objects solely to make these relationships appear more formally separated.

The module is the cohesive application boundary.

Its internal objects are allowed to know about one another when that relationship is semantically meaningful.

---

# 27. The Module Should Be the Owner of Its Objects

A useful mental model is:

    Saito app
        │
        └── module
              │
              ├── transactions
              ├── domain objects
              ├── database
              ├── UI
              └── application state

The module owns these objects.

They are not independent services that happen to communicate with the module.

This means that the AI should generally prefer:

    this.transactions
    this.database
    this.main
    this.tweets

over global registries or dependency injection systems.

Likewise, a component should generally use:

    this.mod.transactions

rather than:

    TransactionService.getInstance(...)

---

# 28. `handlePeerTransaction()` Should Be Explicit

A typical pattern is:

    async handlePeerTransaction(app, tx, peer, mycallback) {

      let request = tx.returnMessage().request;

      if (request !== "redsquare-request-tweet") {
        return super.handlePeerTransaction(app, tx, peer, mycallback);
      }

      await this.transactions.receiveRequestTweetTransaction(tx, peer);

      return 1;
    }

The exact implementation varies.

The important part is that the request is explicitly inspected.

An AI should not write a giant generic handler that attempts to interpret every possible peer message.

It should identify the application's own request names and route them directly to the semantically appropriate function.

---

# 29. Call `super.handlePeerTransaction()` When Appropriate

`ModTemplate.handlePeerTransaction()` contains framework-level handling for certain built-in behaviors.

A module overriding it should therefore understand what the superclass does before replacing it.

A common pattern is:

    async handlePeerTransaction(app, tx, peer, mycallback) {

      // application-specific requests

      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

The exact ordering can depend on whether the application wants to intercept a request before superclass handling.

The AI should inspect the current superclass implementation rather than assuming that `super` is always required at the beginning or always required at the end.

The important principle is:

> Overriding a framework hook does not mean discarding the framework behavior hidden behind the superclass.

---

# 30. `onPeerServiceUp()` Is for Peer Availability

`onPeerServiceUp()` is different from `handlePeerTransaction()`.

The distinction is:

    onPeerServiceUp()
        "A peer with a relevant service is available."

    handlePeerTransaction()
        "A peer sent us an off-chain application message."

A module can use `returnServices()` to advertise services and `onPeerServiceUp()` to react when a peer advertising a relevant service becomes available.

This is where peer-dependent initialization belongs.

For example:

    async onPeerServiceUp(app, peer, service) {
      if (service !== "redsquare") return;

      // request remote data
    }

Do not attempt to solve peer discovery by performing network requests inside the constructor or ordinary `initialize()`.

---

# 31. `returnServices()` Advertises Module Services

A module can advertise network services through `returnServices()`.

These service names participate in peer discovery and coordination.

They should not be confused with:

    respondTo()

or:

    returnModule()

Those are local module interfaces.

The conceptual distinction is:

    returnServices()
        network-visible service capability

    respondTo()
        local synchronous capability interface

    returnModule()
        local direct module access

An AI should not collapse these into one generic "service" abstraction.

---

# 32. `respondTo()` Is a Local Capability Interface

`respondTo()` allows another module to ask this module whether it provides a particular capability.

For example:

    let result = app.modules.respondTo("some capability");

This is local module-to-module communication.

It is not a network message.

It is not an HTTP endpoint.

It is not a peer service.

It is appropriate when a module wants to expose a capability without requiring another module to know its internal implementation.

However, `respondTo()` should not be used merely because it sounds architecturally clean.

If the application has a direct, stable relationship where direct access is appropriate, direct module access may be simpler.

---

# 33. `returnModule()` Is Direct Module Access

When appropriate, modules can directly access another loaded module through the module system.

This creates stronger coupling than `respondTo()`.

That is not automatically bad.

The important question is whether the relationship is actually a direct application dependency.

Do not create `respondTo()` wrappers around everything simply to avoid direct access.

Likewise, do not introduce `returnModule()` dependencies casually when the application only needs a small capability that should be exposed more loosely.

Use the simplest relationship that correctly expresses the dependency.

---

# 34. `webServer()` Is Node-Side HTTP Integration

`webServer()` is used when a module needs to participate in Node's HTTP server.

It can be used for:

- custom HTTP routes;
- custom HTML;
- special server-side behavior;
- module-specific HTTP endpoints.

It is not the normal place for browser UI logic.

Static module assets under:

    web/

are handled through the Saito web serving system.

Do not create:

    routes/
    controllers/
    backend/
    api/

merely because another web framework commonly uses them.

If a module needs a custom HTTP route, implement the actual Saito `webServer()` integration and keep the code close to the module's actual responsibility.

---

# 35. Browser and Node Share the Module

A Saito application is not normally split into:

    frontend/
    backend/

The same module architecture can run in Node and browser environments.

The module can branch when capabilities genuinely differ:

    if (BROWSER == 0) {
      // Node-specific behavior
    }

or:

    if (this.browser_active) {
      // active browser UI
    }

But the application remains one Saito module.

Do not automatically build a REST API between browser and Node just because the application has browser UI.

The browser itself runs Saito application logic.

---

# 36. `browser_active` Is a UI State

A module may exist in the browser without being the active application.

`browser_active` determines whether the module is currently the active browser application.

Therefore, browser UI code should generally respect:

    this.browser_active

For example:

    async render() {
      if (!this.browser_active) return;

      // render active application UI
    }

Do not assume that every module loaded into a browser should render its UI.

A module may be loaded because it provides functionality to another application.

---

# 37. Database Logic

Module-specific SQL belongs in:

    sql/

and substantive database logic can belong in:

    lib/database.js

or another semantically appropriate file.

The module should use Saito's existing storage interfaces rather than introducing a new database abstraction layer.

For example:

    app.storage

is already a Saito storage interface.

If the module genuinely has a substantial database object, it may attach:

    this.database

and let that object encapsulate meaningful database operations.

Do not create:

    repository
    data-access-service
    database-manager
    persistence-controller

merely to wrap `app.storage`.

---

# 38. Application State Belongs Where It Is Semantically Owned

A module may maintain state in:

    this.tweets
    this.games
    this.groups
    this.orders

depending on its application.

This state should belong to the module or its domain objects.

Do not automatically create a state-management framework.

The existence of state does not imply the need for:

    Redux
    stores
    reducers
    state managers
    event buses

Saito applications generally work directly with the module's own state and the Saito runtime.

---

# 39. The Main File Should Not Become a Giant UI File

A module can be large.

There is no arbitrary line-count rule that says the main file must be tiny.

The important question is cohesion.

A substantial application may legitimately have a substantial main module.

But the main file should remain recognizable as the module's Saito integration layer.

It should not contain hundreds of unrelated DOM operations simply because the developer happened to start writing the UI there.

A useful distinction is:

    main module
        Saito lifecycle
        application protocol
        application ownership

    lib/
        domain logic
        transaction logic
        database logic
        substantial application logic

    lib/ui/
        DOM and presentation

This division makes the application easier for both humans and AI systems to understand.

---

# 40. The Main File Is Not a Controller

A common mistake for an AI trained on conventional web applications is to interpret the main Saito module as a controller.

It is not.

A Saito module is the application.

The main file is the application's primary runtime object.

It participates directly in:

    blockchain
    peer communication
    wallet
    storage
    UI
    application state
    other modules

Therefore, do not introduce:

    controller
        ↓
    service
        ↓
    repository
        ↓
    module

just because the main file has many responsibilities.

Those responsibilities are part of what it means to be a Saito module.

Split them into semantic objects when useful, but preserve the module as the ownership boundary.

---

# 41. The Main File Is Not a Generic Dispatcher

Likewise, do not create a generic dispatcher such as:

    ApplicationDispatcher

    TransactionDispatcher

    PeerMessageDispatcher

    EventDispatcher

unless the application genuinely requires such an object.

Saito already provides lifecycle entry points.

For example:

    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()
    respondTo()

These are already the framework's dispatch boundaries.

The application's responsibility is to interpret the messages it receives and invoke the appropriate semantic function.

For example:

    onConfirmation()
        ↓
    inspect tx.msg.request
        ↓
    receiveTweetTransaction()

That is sufficient for many applications.

---

# 42. Recommended Main-File Shape

A typical modern application can have a structure conceptually like:

    class Example extends ModTemplate {

      constructor(app) {
        super(app);

        this.name = "Example";
        this.slug = "example";

        this.transactions = new Transactions(app, this);
        this.main = null;
      }

      async initialize(app) {
        await super.initialize(app);

        // module-specific initialization
      }

      async render() {
        if (!this.browser_active) return;

        // establish/render UI components
        await super.render();
      }

      async onConfirmation(blk, tx, conf, app) {
        if (conf != 0) return;
        if (tx.msg.module !== this.name) return;

        // dispatch application transaction
      }

      async handlePeerTransaction(app, tx, peer, mycallback) {
        let request = tx.returnMessage().request;

        // inspect application-specific request

        return super.handlePeerTransaction(app, tx, peer, mycallback);
      }

      returnServices() {
        return [];
      }

      async onPeerServiceUp(app, peer, service) {
        // peer-dependent behavior
      }

      respondTo(type, obj) {
        // optional local capability
      }

      webServer(app, expressapp) {
        // optional Node HTTP behavior
      }
    }

This is a conceptual shape, not a mandatory template.

The AI should omit anything the application does not need.

---

# 43. What Belongs in the Main File

Good candidates include:

    constructor()
    installModule()
    initialize()
    render()
    onConfirmation()
    handlePeerTransaction()
    onPeerServiceUp()
    returnServices()
    respondTo()
    webServer()

and genuinely module-level state that is necessary to understand the application.

The main file can also contain small application-specific methods when those methods are genuinely part of the module's own responsibilities.

But it should not accumulate forwarding methods merely to hide the actual object that implements the operation.

---

# 44. What Normally Belongs in `lib/`

Examples include:

    lib/transactions.js
    lib/database.js
    lib/tweet.js
    lib/game.js
    lib/order.js
    lib/warehouse.js
    lib/P2SH.js

The file names should communicate concepts.

A developer should be able to infer what a file does from its name.

Avoid:

    helpers.js
    utils.js
    common.js
    manager.js
    service.js

unless the name has a genuinely coherent semantic meaning in the application.

Generic helper files tend to become dumping grounds.

---

# 45. What Normally Belongs in `lib/ui/`

Application-specific UI belongs under:

    lib/ui/

Examples:

    lib/ui/main.js
    lib/ui/header.js
    lib/ui/sidebar.js
    lib/ui/overlays/
    lib/ui/overlays/payment-overlay.js

The exact organization depends on the application's size.

The important distinction is:

    lib/
        application/domain logic

    lib/ui/
        presentation and interaction

A UI component may still directly invoke application logic.

There is no requirement to insert a controller between UI and module.

For example:

    button click
        ↓
    this.mod.transactions.createTweetTransaction()
        ↓
    network propagation

can be a perfectly valid Saito application flow.

---

# 46. Do Not Create a UI Service Layer

An AI may be tempted to write:

    UI
      ↓
    UIController
      ↓
    ApplicationService
      ↓
    Module

This is normally unnecessary.

The UI is part of the module.

The component can use:

    this.app
    this.mod

directly.

If a component needs to create a transaction, it can call the module's transaction object.

If it needs application state, it can access the module's domain objects.

If it needs a Saito API, it can use `app.wallet`, `app.network`, `app.connection`, etc.

This directness is intentional.

---

# 47. Transaction Propagation Can Belong in the Appropriate Object

A UI component can sometimes create and propagate a transaction directly when that is the natural responsibility of the interaction.

For example:

    let tx = await this.mod.transactions.createTweetTransaction(data);

    await tx.sign();

    this.app.network.propagateTransaction(tx);

The exact transaction construction pattern depends on the application.

The important point is that no artificial controller is required simply because the transaction originates in a UI click.

The transaction object belongs to the module.

The UI is allowed to invoke it directly.

---

# 48. `onConfirmation()` and `handlePeerTransaction()` Should Be Easy to Find

One reason the main file should remain coherent is that these two functions reveal much of the application's network protocol.

A developer should be able to inspect:

    onConfirmation()

and understand:

    What blockchain messages does this application consume?

Then inspect:

    handlePeerTransaction()

and understand:

    What off-chain peer messages does this application consume?

This is valuable during debugging.

It is also valuable for AI systems trying to understand an unfamiliar module.

Do not bury these protocol entry points behind multiple layers of dispatch.

---

# 49. Transaction Naming Should Reveal Protocol Structure

Consider:

    createTweetTransaction()
    receiveTweetTransaction()

This immediately exposes a protocol pair.

Likewise:

    createRequestTweetTransaction()
    receiveRequestTweetTransaction()

The names reveal:

    create
    ↓
    request
    ↓
    tweet

and:

    receive
    ↓
    request
    ↓
    tweet

This is preferable to names such as:

    processData()
    handlePayload()
    executeMessage()

where the actual application protocol is hidden.

Naming is part of the architecture.

---

# 50. Avoid One-Function Abstractions

The following pattern is usually a warning sign:

    async sendTweet(data) {
      return this.transactions.createTweetTransaction(data);
    }

or:

    receiveTweet(tx) {
      return this.transactions.receiveTweetTransaction(tx);
    }

or:

    async saveTweet(tweet) {
      return this.database.saveTweet(tweet);
    }

If the wrapper adds no semantic behavior, remove it.

Call the object that owns the behavior directly.

A wrapper is justified when it actually contributes something:

    validation
    state transition
    composition
    permission checking
    transaction sequencing
    protocol-specific coordination

But not merely because "all calls should go through the module."

The module is already the owner.

---

# 51. Avoid Helper Proliferation

Do not turn a meaningful operation into a chain of tiny functions such as:

    handleTweet()
      → prepareTweet()
      → normalizeTweet()
      → processTweet()
      → executeTweet()
      → saveTweet()
      → finalizeTweet()

when those functions merely divide one coherent operation into arbitrary pieces.

Saito development generally benefits from relatively substantial, semantically coherent functions.

The right question is:

> Does splitting this function make the concept easier to understand?

If yes, split it.

If no, keep the function together.

"Fatter functions and fewer of them" is often preferable to a forest of trivial helpers.

---

# 52. `super` Calls Should Be Deliberate

When overriding a ModTemplate function, determine what the superclass implementation actually does.

Especially important cases include:

    initialize()
    render()
    handlePeerTransaction()
    installModule()

For example, the normal pattern is:

    await super.initialize(app);

because the superclass establishes important module state.

Likewise, `super.render()` may perform framework-level style/script/component behavior.

Do not omit it merely because the subclass has its own rendering code.

Conversely, if a module intentionally replaces a framework behavior, the omission should be deliberate and understandable.

---

# 53. Games Are a Special Case

Saito games commonly use:

    GameTemplate

rather than treating every game as an ordinary ModTemplate application.

Game-specific lifecycle and UI patterns may therefore differ from the preferred modern ModTemplate pattern.

In particular, existing games may still use:

    initializeHTML()

or other game-specific lifecycle mechanisms.

Do not automatically migrate a game to the ordinary module UI architecture while making an unrelated game change.

The game architecture is documented separately in:

    SAITO-APPLICATIONS-GAMES-AND-THE-SAITO-GAME-ENGINE.md

The important rule for AI systems is:

> Do not assume that every ModTemplate convention applies identically to GameTemplate applications.

---

# 54. Legacy Applications Are Evidence, Not Always Templates

The Saito repository contains applications written at different points in the framework's history.

Examples include applications with:

    initializeHTML()
    attachEvents()
    this.events
    receiveEvent()
    large single-file implementations
    legacy appspace structures

These applications are useful for understanding compatibility.

They should not automatically be treated as the preferred architecture for new development.

The AI should distinguish:

    current preferred pattern

from:

    existing legacy implementation

and:

    compatibility behavior that must remain untouched

This distinction is especially important when modifying an old application.

A refactor should not accidentally convert a legacy application into a different architecture unless that refactor is actually intended.

---

# 55. Main-File Cohesion Is More Important Than File Size

There is no rule that says:

    "The main module must be less than N lines."

A large application may legitimately have a large main class.

The real question is:

> Does the main file remain a coherent representation of the module's participation in Saito?

A large but coherent module can be correct.

A tiny module containing ten layers of pointless forwarding functions can be badly structured.

The preferred direction is:

    coherent main module
        +
    semantically meaningful internal objects

not:

    tiny main module
        +
    enormous abstraction hierarchy

---

# 56. AI Implementation Rules

When creating or modifying a Saito application, an AI should follow these rules.

1. Extend `ModTemplate` unless the application belongs to another Saito application model such as `GameTemplate`.

2. Use the conventional main entry file:

       node/mods/<slug>/<slug>.js

3. Keep the main file focused on Saito lifecycle and application protocol participation.

4. Do not implement every `ModTemplate` method. Implement only the hooks the application actually needs.

5. In an ordinary ModTemplate application, call:

       await super.initialize(app);

   unless there is a specific reason not to.

6. Treat `initialize()` as application initialization, not UI initialization.

7. Do not depend on peer availability during `initialize()`.

8. Use `onPeerServiceUp()` for behavior that depends on peers or advertised services.

9. Keep `render()` as the browser UI entry point.

10. Keep substantial DOM/UI logic in `lib/ui/` rather than turning the main module into a giant UI implementation.

11. Give UI components `app` and `mod` so they can directly use the application's runtime and owned objects.

12. If the module owns a persistent object such as transactions, database, or domain state, attach it directly to the module:

        this.transactions = ...
        this.database = ...
        this.main = ...

13. Let other module-owned objects access those objects directly through `mod`.

14. Do not create a forwarding method solely to expose an object already attached to `mod`.

15. Organize transaction logic around create/receive pairs.

16. Make transaction names reveal their semantic relationship.

17. Keep transaction implementations in the main file when the module is small.

18. Move transaction implementations into `lib/transactions.js` or another semantically meaningful transaction file when transaction volume or complexity warrants it.

19. Do not create a transaction layer merely because "transactions should be separated."

20. `onConfirmation()` should reveal the application's on-chain message protocol.

21. `handlePeerTransaction()` should explicitly inspect application-specific off-chain requests.

22. Use specific request names that identify the module and operation.

23. Remember that `handlePeerTransaction()` is delivered to modules broadly; the module must determine whether a request belongs to it.

24. Do not treat `handlePeerTransaction()` as an HTTP controller.

25. Do not treat `onConfirmation()` as a generic event bus.

26. Do not introduce controllers, services, repositories, dispatchers, managers, resolvers, or middleware merely to wrap existing Saito functionality.

27. Use `app.wallet`, `app.network`, `app.connection`, `app.storage`, `app.keychain`, `app.crypto`, and other Saito APIs directly where appropriate.

28. Prefer direct module ownership over dependency-injection frameworks.

29. Prefer meaningful objects over generic helper collections.

30. Avoid `helpers.js`, `utils.js`, and similar dumping grounds unless they represent a genuinely coherent concept.

31. Avoid one- or two-line helper functions that merely forward calls.

32. Prefer fewer, semantically meaningful functions over large numbers of trivial helpers.

33. Do not confuse `returnServices()`, `respondTo()`, and `returnModule()`. They represent different kinds of relationships.

34. Do not create network APIs or REST controllers when direct Saito module communication is sufficient.

35. Do not split a module into frontend and backend directories merely because conventional web applications do so.

36. Preserve legacy structures when modifying existing applications unless the task specifically calls for architectural migration.

37. When inspecting an unfamiliar application, read the main module file first. It should provide the map for understanding the rest of the application.

---

# 57. The Core Mental Model

The most useful mental model for an AI working on a Saito application is:

    Saito Runtime
         │
         ▼
    Module
         │
         ├── lifecycle hooks
         │
         ├── transactions
         │
         ├── domain objects
         │
         ├── application state
         │
         ├── database
         │
         ├── UI components
         │
         └── peer protocol
         
The module is not a controller.

It is not a service.

It is not a repository.

It is not merely a frontend.

It is the application.

Its internal files and objects exist to keep that application semantically organized as it grows.

The framework provides the runtime boundaries.

The module provides the application.

The best Saito code therefore tends to have a recognizable shape:

    main module
        ↓
    clear Saito lifecycle hooks
        ↓
    direct access to semantically named module objects
        ↓
    direct application logic

rather than:

    main module
        ↓
    arbitrary abstraction layers
        ↓
    generic dispatchers
        ↓
    wrappers
        ↓
    actual application logic

The objective is not maximal abstraction.

The objective is a module whose structure makes its behavior obvious to the next developer — human or AI — who has to understand, debug, modify, or extend it.
