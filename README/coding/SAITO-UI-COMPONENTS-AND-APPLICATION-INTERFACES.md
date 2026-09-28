# Saito UI Components and Application Interfaces

This document describes how Saito applications should structure their user interfaces.

The purpose is not to define a UI framework. Saito does not require React, Vue, a virtual DOM, a component base class, a UI store, or a formal component lifecycle.

Instead, Saito applications should be constructed from ordinary JavaScript objects that represent meaningful pieces of the interface.

The central principle is:

> A UI component is an object that renders something to the page and owns the behavior associated with that part of the interface.

The preferred architecture is to create domain objects and substantial, self-contained UI components, while keeping the module's main file small and recognizable as a Saito module.

This is particularly important for AI-generated code. A good Saito application should make it obvious where a UI change belongs, should keep related behavior together, and should prevent the main module file from becoming a large collection of unrelated rendering and helper functions.


## 1. Saito Does Not Have a Generic Component Framework

There is no general Saito `Component` base class that application developers should inherit from.

There is no requirement to create:

    Component
    SaitoComponent
    SaitoComponentTemplate

or a similar hierarchy.

Saito does contain specialized UI infrastructure, including things such as `UIModTemplate`, `SaitoOverlay`, and game-specific UI objects. These are real pieces of the framework, but they should not be mistaken for a universal component architecture.

Ordinary application UI should normally use ordinary JavaScript classes.

For example:

    class Main {

      constructor(app, mod) {
        this.app = app;
        this.mod = mod;
      }

      render() {
        ...
      }

      attachEvents() {
        ...
      }
    }

The important properties are not inheritance or framework registration.

The important properties are:

    app
    mod
    render()
    ownership
    coherent responsibility

A UI component exists because it represents a meaningful part of the interface, not because it belongs to a particular framework class.


## 2. What Counts as a UI Component

If an object renders something visually to the page, it can be treated as a UI component.

This remains true even if the object is also a domain object.

For example, a Tweet object can contain:

    application data
    transaction data
    application behavior
    render()
    attachEvents()

That is a legitimate UI component.

Another application may instead separate the underlying domain object from its visual representations:

    SaitoNFT
        domain object

    SaitoNFTCard
        card UI

    SaitoNFTOverlay
        detailed UI

    SaitoNFTOtherOverlay
        another representation

That is also legitimate.

The distinction is not:

    domain object OR UI component

It can be:

    domain object AND UI component

or:

    domain object
        +
    one or more UI components

The appropriate structure depends on how the application uses the object.

The important question is:

> Where should the behavior and rendering responsibility live so that the application remains understandable and easy to modify?


## 3. UI Components Should Normally Receive `app` and `mod`

For module-owned UI components, prefer:

    constructor(app, mod, ...)

For example:

    class Main {

      constructor(app, mod) {
        this.app = app;
        this.mod = mod;
      }

    }

`app` is the Saito runtime.

`mod` is the application module that owns the component.

This gives a component direct access to the Saito runtime and to the application's own objects without introducing a dependency-injection framework or service layer.

For example:

    this.app.wallet
    this.app.network
    this.app.connection

and:

    this.mod.database
    this.mod.tweets
    this.mod.transactions
    this.mod.main

are ordinary and appropriate dependencies.

A component should not need a global registry to discover its application.

Saito-level framework UI may not need `mod`. For example, a shared Saito UI object may only require `app`.

The convention is primarily for module-owned application objects.


## 4. UI Components Should Be Substantial and Self-Contained

The preferred Saito UI component is not merely a thin wrapper around another function.

A component should contain the behavior associated with the piece of UI that it represents.

For example, if a component displays a purchase interface and contains:

    Buy button
    price
    NFT information
    loading state
    confirmation behavior

then the component should generally contain the code that handles those interactions.

The goal is for the component to be understandable as a unit.

For example:

    PurchaseOverlay
        render()
        attachEvents()
        onClick()
        ...
    
rather than:

    Main
        showPurchaseOverlay()
        getPurchaseButton()
        handlePurchaseButton()
        processPurchase()
        updatePurchaseHTML()
        showPurchaseAlert()
        ...

The latter approach causes the module's main file to become a collection of UI implementation details.

The former keeps the UI responsibility where it belongs.


## 5. The Main Module File Should Remain Small

The module's main JavaScript file is the architectural map of the application.

It should primarily contain the functions defined by `ModTemplate` and the application's participation in the Saito lifecycle.

Typical functions include:

    constructor()
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
    returnServices()
    returnModule()
    webServer()

Not every module needs all of these.

The principle is:

> Keep the main module focused on being a Saito module.

The main module should make it possible to understand:

    what the module is
    what it initializes
    what it listens for
    what it sends
    what major objects it owns
    what UI it renders

Detailed application behavior should normally live in domain objects, transaction files, database objects, and UI components.

It is possible to add functions to the main module when there is a genuine reason.

The problem is not the existence of additional functions.

The problem is allowing the main module to become the place where all application behavior accumulates.


## 6. Keep AI-Generated Code Out of `mod.js` When It Belongs Elsewhere

One of the most important rules for AI-assisted development is:

> Do not put application behavior into `mod.js` merely because the AI needs somewhere to put it.

A common failure mode is:

    mod.js
        render UI
        parse HTML
        handle buttons
        manage overlays
        update individual objects
        contain helper functions
        manipulate CSS
        process transactions
        access databases
        manage page state
        coordinate unrelated components

This produces what can be thought of as "Frankencode": a module that technically works but has accumulated unrelated responsibilities because the AI kept adding the next function to the same file.

The better structure is:

    mod.js
        Saito lifecycle
        application composition

    lib/domain-object.js
        domain behavior

    lib/ui/main.js
        main page UI

    lib/ui/sidebar.js
        sidebar UI

    lib/ui/overlay.js
        overlay UI

    lib/transactions.js
        transaction behavior

    lib/database.js
        database behavior

    web/
        templates and CSS

This makes changes local.

If the user asks:

> Change the purchase overlay.

the AI should be able to find the purchase overlay and modify it.

It should not need to modify the module's main file merely because the overlay is part of the application.


## 7. Think About the Application as a UI First

For applications with substantial interfaces, begin by understanding the visible structure.

Think about:

    What is on the page?

    What are the major regions?

    What belongs inside each region?

    Which object should render each region?

    Which components contain which other components?

    Which components are rendered immediately?

    Which components appear later?

    Which components are updated when data arrives?

This is especially useful in Saito because rendering does not necessarily happen as one complete operation.

A simplified sequence may be:

    initialize
        ↓
    render initial UI
        ↓
    peer becomes available
        ↓
    remote data arrives
        ↓
    confirmation arrives
        ↓
    UI changes
        ↓
    another event changes application state
        ↓
    UI updates again

The exact sequence is application-specific.

The important point is that the UI is not necessarily a static page generated once at initialization.

Live Saito applications receive data and events after the initial render.


## 8. Compose the UI Hierarchically

A useful Saito pattern is hierarchical UI ownership.

For example:

    Main
      ├── Header
      ├── Sidebar
      └── Content
            └── TweetManager
                  └── Tweet

Or:

    Main
      ├── Menu
      ├── ListingManager
      └── PurchaseOverlay

Or:

    Main
      └── Game
            ├── PlayerPanel
            ├── Board
            └── Controls

The parent constructs and owns the children.

The child knows how to render and manage its own region.

This allows:

    Main.render()

to conceptually become:

    this.header.render();
    this.main.render();
    this.sidebar.render();

The exact object names do not matter.

The architectural principle is that the UI should have recognizable ownership boundaries.


## 9. The Page Entry Point

A normal web application has an `index.js` entry point that can handle page-level concerns.

For example, it may provide:

    social graph information
    metadata for shared links
    preview images
    short-link handling
    other web-server/page concerns

These concerns belong at the page entry point rather than being mixed into application UI components.

The body normally provides the application's Saito container.

A typical structure is conceptually:

    body
        module-name
            saito-container

The module's main UI component can then render its interface into that container.

For example:

    new Main(app, mod, '#saito-container')

followed by:

    main.render()

The precise implementation may vary.

The important architectural distinction is:

    index.js
        page-level web concerns

    main UI component
        application interface

    subordinate components
        individual UI regions

Saito's 404 handling can also provide the Saito page/container structure. New applications should follow the existing repository conventions rather than inventing a separate page bootstrapping architecture.


## 10. Render Is the Core UI Operation

A UI component should have a `render()` function.

At minimum:

    render()

is the defining operation of a component.

Rendering normally means producing HTML and inserting it into the appropriate part of the DOM.

Saito commonly uses the browser helpers for this:

    app.browser.addElementToSelector()
    app.browser.replaceElementBySelector()
    app.browser.replaceElementContentBySelector()

There is no requirement for a virtual DOM.

A component can simply create HTML and write it into the page.

For example:

    render() {
      let html = this.template();
      this.app.browser.addElementToSelector(this.container, html);
    }

The exact browser API should follow the existing Saito implementation and surrounding application code.


## 11. `attachEvents()` Is a Valid and Preferred Pattern

Saito applications use multiple event-binding patterns.

Do not treat the existence of multiple patterns as a reason to introduce a new framework.

A particularly useful pattern is:

    render()
    attachEvents()

For example:

    render() {
      let html = this.template();
      this.app.browser.replaceElementBySelector(this.container, html);
      this.attachEvents();
    }

    attachEvents() {
      ...
    }

This makes the relationship explicit:

    render the interface
        ↓
    attach behavior to the interface

A component may also perform event binding directly inside `render()` when that is simpler.

Both approaches are valid.

For new code, when event binding is substantial enough to deserve its own function, prefer:

    render()
    attachEvents()

rather than scattering event-binding logic throughout unrelated functions.


## 12. Render the UI, Then Bind Its Behavior

A component should normally render the DOM before trying to attach listeners to elements in that DOM.

Conceptually:

    render()
        ↓
    HTML exists
        ↓
    attachEvents()
        ↓
    user can interact

For example:

    render() {
      this.app.browser.replaceElementBySelector(
        this.container,
        this.template()
      );

      this.attachEvents();
    }

The event handlers should belong to the component that owns the UI.

This avoids a common anti-pattern where the main module reaches into a child component's DOM and attaches behavior to it.


## 13. Use Event Delegation When It Simplifies Dynamic UI

Event delegation is particularly useful for lists of objects that can be added, removed, or re-rendered.

For example, a manager can render:

    <article data-id="TRANSACTION_SIGNATURE">
        ...
    </article>

and listen on the stable parent container.

When a click occurs, the manager can obtain the transaction signature and recover the relevant object.

Conceptually:

    user clicks article
        ↓
    read data-id
        ↓
    identify transaction
        ↓
    recover domain object
        ↓
    perform action

This avoids needing to attach a new listener to every object whenever the list changes.

It is especially useful for:

    feeds
    lists
    galleries
    inventories
    transaction lists
    game elements
    dynamically generated controls


## 14. Transaction Signatures Make Excellent DOM Data IDs

When a UI element corresponds to a Saito transaction, the transaction signature is often the natural identifier to put into the DOM.

For example:

    data-id="transaction-signature"

The manager can then recover the object when the event fires.

Conceptually:

    data-id
        ↓
    transaction signature
        ↓
    mod.getTweet(signature)
        ↓
    Tweet
        ↓
    action

This is preferable to creating an unrelated UI identifier when the transaction signature already uniquely identifies the application object.

The same principle can apply to other stable application identifiers.

The important point is to use an identifier that lets the component recover the underlying object without copying the entire object into the DOM.


## 15. Keep the Underlying Transaction Available

When a domain object is created from a transaction, it is often useful to retain:

    this.tx = tx

The transaction is the protocol object.

The domain object is the application's representation of that transaction.

For example:

    Tweet
        this.tx
        this.text
        this.username
        this.images

The UI component can then work with the Tweet while the underlying transaction remains available.

This is particularly valuable when the UI is identified by transaction signature.

The transaction remains the stable object connecting:

    protocol
    application object
    UI


## 16. Domain Objects and UI Components Can Be Combined

There is no requirement to split every object into:

    Model
    View
    Controller

Saito applications should not automatically reproduce MVC because an AI recognizes a UI.

A central domain object may naturally contain its own rendering behavior.

For example:

    Tweet
        constructor(app, mod, tx)
        render()
        attachEvents()

This can be an excellent structure when the Tweet is itself the natural unit of UI behavior.

Alternatively:

    Tweet
        application object

    TweetCard
        UI representation

may be more appropriate when the same Tweet needs multiple visual representations.

The decision should follow the application.

Do not split an object simply to satisfy a theoretical architecture.

Do not combine objects simply to avoid creating a second component.

Use the boundary that makes the application easiest to understand and modify.


## 17. Multiple UI Representations Are Normal

A domain object can have several UI representations.

For example:

    SaitoNFT
        ↓
        ├── NFT card
        ├── full-data overlay
        ├── purchase overlay
        ├── selection overlay
        └── other application-specific views

Each representation can be a separate UI component.

This is useful when the same underlying object appears in different contexts.

The domain object owns the application concept.

The UI component owns a particular visual representation.


## 18. Components Should Own Their Own Actions

A component should contain the actions associated with its interface.

For example, if a component has:

    Invite button

then the component should normally contain the code handling that click.

If it has:

    Drag-and-drop area

the component should normally contain the drag-and-drop behavior.

If it has:

    Submit button

the component should normally contain the submit behavior.

Conceptually:

    class GameInvite {

      render() {
        ...
        this.attachEvents();
      }

      attachEvents() {
        ...
      }

      onClick() {
        ...
      }
    }

This keeps the behavior next to the UI that invokes it.


## 19. Name Functions Around User Interaction

Functions inside UI components should preferably reflect recognizable UI actions.

Good examples include:

    onClick()
    onSubmit()
    onDragDrop()
    onClose()
    onSelect()
    onChange()

These names describe what happened from the user's perspective.

They make it easier for a developer or AI to understand the component.

Avoid inventing elaborate helper functions merely because the AI needs somewhere to put two lines of code.

For example, avoid:

    propagateSelectedTransaction()

if the only purpose of that function is:

    this.app.network.propagateTransaction(tx);

and it is only called from one click handler.

Instead, it may be clearer to handle that operation directly inside the relevant interaction.

The goal is not to prohibit helper functions.

The goal is to create them when they represent meaningful reusable behavior, rather than creating them automatically.


## 20. Avoid Helper Function Creep

AI-generated code frequently produces functions like:

    getCurrentModule()
    getTweetData()
    processButtonClick()
    updateComponent()
    performAction()
    executeOperation()
    handleData()
    callModuleFunction()

where each function contains only one or two lines.

This makes code longer without making it more understandable.

For example, this:

    handleSubmit() {
      this.submitTransaction();
    }

    submitTransaction() {
      this.mod.sendTransaction(this.tx);
    }

may be worse than simply putting the meaningful operation in `handleSubmit()` if there is no second caller and no independent concept.

Likewise, this:

    getDatabase() {
      return this.mod.database;
    }

is normally unnecessary.

The component already has:

    this.mod

Use it.

Prefer:

    this.mod.database

over:

    this.getDatabase()

unless the function represents meaningful behavior.

A good rule for AI is:

> Do not create a helper function merely to avoid writing a short expression.

Create a function when it gives the application a meaningful semantic boundary.


## 21. Prefer semantic operations over implementation wrappers

A function in UI Components should normally represent a meaningful operation in the visual abstraction in which it is used. Do not create functions merely to forward arguments, return another function's result, return a DOM element, move data between layers, or separate consecutive implementation steps.

Before introducing a helper, ask whether it gives the caller or the component a meaningful new abstraction. If the answer is no, keep the operation in the existing function, and access data needed inline from the source that would otherwise be fetched from the wrapper.

In particular, avoid chains in which a public operation delegates to a wrapper, which delegates to another wrapper, which finally performs the actual work. A short function that directly performs its operation is preferable to several small functions that merely divide the implementation into steps.

Internal helpers are appropriate when they represent a meaningful operation, enforce a non-obvious invariant, or encapsulate genuinely shared non-trivial behavior. They are not justified merely because extracting a few lines makes individual functions appear shorter.

The purpose of this principle is to make clear that decomposition and abstraction are not synonymous. A UI component should not accumulate wrapper functions simply to make its implementation appear more modular.

As an example of the intended style, if a UI component needs to update one of its own DOM elements, it should normally locate that element and perform the update directly in the semantic public operation rather than introducing a chain such as:

    updateMenu()
        → menuNode()
        → defaultMenuNode()
        → querySelector()

Likewise, if a component creates a DOM element itself, code within that component should be able to locate and use that element directly when needed. A separate accessor function is not justified merely because it returns the element.

This principle is particularly intended to prevent small UI components from developing internal middleware layers, trivial DOM accessors, or rendering pipelines whose functions do not represent meaningful operations.


## 22. Do Not Move UI Logic Back Into the Module

A common mistake is to create a component but then leave its behavior in the module.

For example:

    Main.renderPurchaseButton()

followed by:

    mod.showPurchaseAlert()
    mod.handlePurchaseClick()
    mod.updatePurchaseHTML()

This defeats the purpose of the component.

Instead:

    PurchaseComponent
        render()
        attachEvents()
        onClick()
        ...

The module should construct the component and provide it with the application context.

The component should own the details of its interface.


## 23. Avoid Extracting UI State Into Module Helpers

Another common AI pattern is to have the module inspect HTML and reconstruct its understanding of the UI.

For example:

    mod.getSelectedElement()
    mod.getButtonFromHTML()
    mod.extractCurrentState()
    mod.parseRenderedData()

This creates two representations of the same thing:

    UI component
        actual interface

    module helper
        AI-generated interpretation of interface

Eventually the HTML changes but the helper is not updated.

The application then contains stale assumptions about its own UI.

The component that owns the interface should normally also own the logic needed to understand and manipulate that interface.


## 24. A Component Should Be a Localized Black Box

A useful component exposes a small interface to its parent.

For example:

    render()

may be enough.

Or:

    render()
    update()

Or:

    render()
    attachEvents()

The parent should not need to understand the component's internal DOM structure.

For example:

    Main
        ↓
    PurchaseOverlay

should not require Main to know:

    which button exists
    which CSS class identifies it
    how the overlay handles confirmation
    how the overlay updates its HTML

Those details belong to PurchaseOverlay.

This is valuable for both humans and AI.

If a user asks to change the purchase interface, the AI can inspect the purchase component rather than searching through the entire module.


## 25. Parent Components Own Child Components

A parent component should normally construct and own its children.

For example:

    class Main {

      constructor(app, mod) {
        this.app = app;
        this.mod = mod;

        this.sidebar = new Sidebar(app, mod);
        this.content = new Content(app, mod);
      }

      render() {
        ...
        this.sidebar.render();
        this.content.render();
      }
    }

This creates a visible ownership tree.

It is preferable to having unrelated components discover each other through global registries.

The parent knows:

    what it owns
    where it renders
    when it renders

The child knows:

    how it renders
    how it behaves
    what data it displays


## The Main UI Owns the Application UI

For anything more complicated than a trivial single-screen module, the top-level UI should normally be a top-level UI object.

A common structure is:

    ModTemplate
        |
        v
      Main UI
      /      \
   Header    Body
              |
        child UI components

Header and Body are examples of major visual regions. They do not have to be literal classes. The important thing is ownership.

The module may construct the Main UI:

    this.main = new Main(app, this);

and its `render()` may delegate:

    this.main.render();

Main then owns the visual structure beneath it. It can construct or coordinate Header, Body, Splash, Prepare, a document surface, Settings, and so on, according to the application.

The module remains responsible for Saito lifecycle hooks and application or domain state. It does not need to become the owner of every visual transition merely because it is the ModTemplate.

Distinguish application state from presentation state.

    this.document

may legitimately live on the module, because the document is application or domain state.

These are normally presentation state, and they normally belong to the UI component that owns the surfaces:

    which UI surface is currently displayed
    whether the splash screen or the editor is visible
    which application view is active
    which child UI component should render

Not every value called a screen, a view, or a mode has to leave the module. The question is what the state represents, and which object owns the behavior that uses it.

Use this heuristic:

> If a method's primary job is to decide which visual component or visual surface should render, first ask which UI component owns that visual hierarchy before putting the method on the ModTemplate.

For a multi-surface application, this is an undesirable default:

    mod.showSplash()
    mod.showPrepare()
    mod.showDocument()
    mod.showSettings()

The module gradually becomes the UI router.

Prefer:

    main.showSplash()
    main.showPrepare()
    main.showDocument()
    main.showSettings()

or, where ownership is deeper:

    body.showPrepare()
    body.showDocument()

The names are illustrative. The issue is ownership, not the word `show`. A method named `openDocument()`, `selectView()`, `reject()`, or `beginSigning()` has the same problem when its main purpose is to manipulate the UI hierarchy.

A child that needs to change a parent-owned surface should normally talk to its UI parent:

    Splash -> Main -> Prepare

is preferable to:

    Splash -> ModTemplate -> Prepare

when Main owns those surfaces.

A child may still call the module. `mod` is how a component reaches application state, Saito APIs, transactions, storage, and the network.

    mod reference = application and runtime access

It is not:

    mod reference = automatic UI ownership

Main is an ordinary UI component. It is not a controller, service, or router, and it does not require a component framework.

A trivial single-screen module does not need an artificial Main. Establish this ownership when there is a real UI hierarchy, not as ceremony.


## 26. Callbacks Are Useful for Child-to-Parent Interaction

A child component may need to notify its parent about an interaction.

A callback is often sufficient.

For example:

    new Menu(app, mod, {
      onNavigate: (page) => {
        ...
      }
    });

The child can remain focused on its UI while its UI parent decides what navigation means.

That parent is the UI component that owns the surfaces involved. It is not automatically the ModTemplate. See "The Main UI Owns the Application UI."

Callbacks are often preferable to introducing a global event merely to communicate between two objects that already have an explicit parent-child relationship.


## 27. Use `app.connection` for Genuine Cross-Component or Cross-Module Events

`app.connection` is an application-wide event mechanism.

It is useful when one component or module needs to listen for an event generated elsewhere.

For example:

    component A
        ↓
    app.connection
        ↓
    component B

This is appropriate when the participants are not naturally parent and child.

It can also be appropriate for events that genuinely represent application-wide notifications.

It should not automatically replace direct method calls.

If:

    Main

owns:

    Sidebar

then it is generally simpler for Main and Sidebar to communicate directly.

Do not turn every UI interaction into a global event.

Global events make it harder to determine where behavior originates and where it will be received.


## 28. Be Careful With Global UI Events

Because `app.connection` is process-wide, an event can be observed by components that are not visually related.

For example, a background module could emit an event and cause another module's UI to open an overlay.

That may be intentional.

But it can also create surprising coupling.

A useful distinction is:

    direct method/callback
        explicit component relationship

    app.connection
        cross-boundary event

Use the mechanism that reflects the actual relationship.


## 29. Templates Should Primarily Contain HTML

A component may have a template file.

For example:

    lib/ui/main.js
    lib/ui/main.template.js

or:

    lib/tweet.js
    lib/tweet.template.js

The template should primarily describe the HTML structure.

For example:

    module.exports = (data) => `
      <div class="tweet">
        ...
      </div>
    `;

The template tells the developer:

    what HTML exists
    what DOM structure exists
    which elements are present
    which data is displayed

The JavaScript component tells the developer:

    what the component does
    when it renders
    how it reacts to interaction
    how it updates
    how it communicates with the module


## 30. Keep Application Logic in the JavaScript Component

Templates can contain presentation branching when necessary.

But substantial application behavior should not be moved into templates merely because it is possible.

Avoid turning the template into another application logic layer.

For example, network calls, database access, transaction construction, and complex application state management should not be hidden inside template functions.

A developer examining:

    component.js

should be able to understand the component's behavior.

A developer examining:

    component.template.js

should be able to understand the component's HTML structure.


## 31. Keep UI Logic Close to the User Interaction

Suppose a component contains:

    <button>
        Accept
    </button>

The code handling that action should be close to the component and preferably recognizable as an interaction.

For example:

    attachEvents() {
      ...
      button.onclick = () => {
        this.onClick();
      };
    }

    onClick() {
      ...
    }

The important thing is that a developer can find the behavior by examining the component.

Do not scatter the behavior through unrelated module helpers unless the behavior is genuinely shared or belongs to another domain concept.


## 32. CSS Should Correspond to the Component Structure

The HTML template defines the DOM.

The CSS defines how that DOM is presented.

The JavaScript defines behavior.

A useful organization is therefore:

    component.js
    component.template.js
    component.css

For example:

    lib/ui/sidebar.js
    lib/ui/sidebar.template.js
    web/css/sidebar.css

or:

    lib/tweet.js
    lib/tweet.template.js
    web/css/redsquare-tweet.css

The exact file naming convention can vary.

The important principle is localization.

If a developer wants to modify a component, the relevant:

    JavaScript
    HTML
    CSS

should be easy to find.


## 33. Use a Component or Page Root as the Styling Context

The UI should normally provide a recognizable root element for the component or page.

The internal elements can then be styled relative to that root.

Conceptually:

    .my-component {
        ...
    }

    .my-component .header {
        ...
    }

    .my-component .content {
        ...
    }

The purpose is to create a styling context.

The goal is not to invent elaborate namespace conventions for every selector.

The goal is also not to create a giant collection of generic global styles that can accidentally affect unrelated applications.

Follow the existing Saito CSS conventions for the application being modified.

When creating a new application, give major UI regions a clear root so their styling remains localized.


## 34. Do Not Over-Define Typography and Spacing

Applications should be able to accept Saito's existing defaults where appropriate.

Do not unnecessarily specify:

    font-size
    line-height
    margin
    padding
    font-family
    letter-spacing

on every component merely because an AI believes every component needs explicit styling.

If the Saito defaults already provide the desired typography or spacing, use them.

Application-specific CSS should describe actual application requirements rather than reproducing a complete design system inside every module.

The goal is to allow applications to inherit Saito's defaults while still permitting deliberate application-specific styling.


## 35. Responsive Behavior Should Normally Be CSS

Responsive behavior should generally be handled through the component's CSS and responsive layout rules.

Use media queries and structural CSS when the problem is:

    width
    spacing
    columns
    visibility
    stacking
    typography
    layout

JavaScript should be used when responsive behavior genuinely requires runtime information or behavior that CSS cannot provide.

For example, JavaScript may be appropriate when:

    an interaction changes based on measured dimensions
    a game HUD must calculate available play area
    a component must respond to runtime state rather than merely viewport size

Do not use JavaScript to reproduce layout behavior that CSS already handles naturally.


## 36. Do Not Build a Virtual DOM

Saito's ordinary application UI does not require:

    React
    Vue
    virtual DOM
    JSX
    component reconciliation
    global UI state stores

A Saito component can render HTML directly.

The application can then update or replace the relevant DOM region when necessary.

This is intentionally simple.

The simplicity is useful because the UI code is directly connected to:

    HTML
    DOM
    CSS
    application objects


## 37. Do Not Create a Global UI Store

Application state should remain with the application objects that own it.

For example:

    mod.tweets

can remain the application collection of Tweets.

A TweetManager can render those Tweets.

A Tweet can render itself.

There is normally no need to create:

    UIStore
    ReduxStore
    GlobalViewState
    ComponentRegistry

simply to move state around the application.

A component may maintain presentation state such as:

    this.expanded
    this.selected
    this.editing

but that does not make the component the authoritative owner of the application's underlying data.


## 38. Do Not Turn Components Into Hidden Databases

A UI component may cache data when there is a reason to do so.

But the component should not silently create a second authoritative representation of application state.

For example, if:

    mod.tweets

contains the application's Tweet objects, do not create another unrelated Tweet collection inside the UI merely because rendering is easier that way.

The component can maintain:

    rendered state
    selection state
    temporary state
    presentation state

without becoming the application's database.


## 39. Data Should Flow Through Domain Objects

A useful Saito pattern is:

    transaction
        ↓
    domain object
        ↓
    UI component

For example:

    transaction
        ↓
    Tweet
        ↓
    TweetCard

The transaction remains the protocol object.

The domain object gives the application a meaningful representation.

The UI component gives the object a visual representation.

This makes UI changes easier because the UI can operate on meaningful objects rather than repeatedly parsing raw transaction structures.


## 40. Pass Transactions Rather Than Reconstructing Their Data

When application data comes from a transaction, prefer passing the transaction object through the application rather than extracting a large collection of fields into middleware.

For example:

    addTweet(tx)

can construct or update the Tweet representation from the transaction.

This allows changes to the transaction format to propagate naturally through:

    serialization
    storage
    application object
    UI

Instead of requiring every intermediary layer to know the transaction's complete structure.

The UI component can use the domain object.

The domain object can retain the transaction.

This keeps the protocol object available without forcing every UI layer to understand it.


## 41. UI Updates May Be Triggered by Saito Events

A component may render before the data it ultimately displays exists.

For example:

    render initial page
        ↓
    peer connection becomes available
        ↓
    request data
        ↓
    receive transaction
        ↓
    create domain object
        ↓
    render component

Or:

    render purchase UI
        ↓
    blockchain confirmation
        ↓
    update purchase state
        ↓
    update component

This is normal Saito behavior.

Do not assume that all application data exists at `initialize()` time.

Do not assume that all remote data exists when the first UI render occurs.


## 42. Initial Rendering and Live Updates Are Different Concerns

A component may initially render:

    loading
    empty
    placeholder

and later replace or enrich that content.

For example:

    render()
        ↓
    show loading state
        ↓
    data arrives
        ↓
    update()

This is preferable to blocking the entire application while waiting for optional remote data.

The exact pattern depends on the component.

Some components can render synchronously.

Others may need asynchronous work.

The important principle is that the component should own the behavior associated with its own loading and update states.


## 43. Avoid Network Calls in Templates

A template should generally transform data into HTML.

It should not become a network layer.

Avoid patterns such as:

    template()
        fetch data
        query peer
        access database
        modify application state
        return HTML

Instead:

    component
        obtains data
        prepares state
        calls template
        renders HTML

This keeps the data flow visible in the component's JavaScript file.


## 44. Components May Perform Application Operations

A UI component is not required to be purely presentational.

A component can legitimately:

    call module methods
    create transactions
    request data
    update application state
    communicate with peers
    open overlays
    modify its own DOM

when those operations are part of the behavior represented by that component.

The important distinction is ownership.

A purchase component can purchase.

A chat component can send a chat message.

A game component can perform a game action.

A Tweet component can handle Tweet interaction.

The module should not become the universal controller for all of these operations.

Calling the module for application state, a transaction, or a Saito API is normal. Calling the module to decide which surface is visible is a different question. That decision normally belongs to the UI component that owns the surfaces.


## 45. Managers Are Useful but Not Mandatory

Names such as:

    Manager
    Main
    Sidebar
    Teaser
    Card
    Overlay

are conventions rather than framework requirements.

A Manager is useful when it represents a meaningful composition boundary.

For example:

    TweetManager
        renders many Tweets
        handles feed behavior
        manages list interaction

The module may own the Tweet collection while the Manager owns the presentation of that collection.

There is no requirement that every list have a Manager.

Do not create a Manager merely because another Saito application has one.

Create one when it gives the application a useful boundary.


## 46. A Manager Can Own List Interaction Without Owning the Data

For example:

    mod.tweets
        application collection

    TweetManager
        UI composition

    Tweet
        individual object

The Manager can determine:

    which Tweets are visible
    where they appear
    how scrolling works
    which DOM element was clicked
    which Tweet corresponds to a data ID

while the module remains the owner of the application's Tweet collection.

This separation gives the UI a useful boundary without inventing another database.


## 47. Overlays Are UI Components

An overlay is simply another UI responsibility.

Saito provides `SaitoOverlay`, but application overlays may be ordinary objects built around it.

For example:

    PurchaseOverlay
    ProfileOverlay
    NFTOverlay
    SettingsOverlay

may each have:

    constructor()
    render()
    attachEvents()
    onClose()
    ...

An overlay should own its own presentation and interaction behavior.

If an overlay needs to notify its parent, callbacks are often sufficient.

Do not require the main module to contain every overlay's implementation merely because the overlay belongs to the module.


## 48. Game UI Is a Special Case, Not a Different Philosophy

Games have specialized framework infrastructure such as:

    GameTemplate
    GameHud
    SaitoOverlay

Game UI is often more stateful and interactive than ordinary application UI.

The game module may own a long-lived HUD and other game-specific UI objects.

This does not require ordinary web-style MVC.

The same basic principle still applies:

    game module
        owns game application state

    game UI components
        render and manage their own visual responsibilities

The exact game architecture should follow the Saito Game Engine conventions rather than being imported from a generic web framework.


## 49. Use the Existing Saito UI Patterns

Saito contains multiple generations of UI code.

Some applications use:

    render()
    attachEvents()

Some components use:

    render()

with events bound directly.

Some older components communicate through:

    app.connection

Some newer components use direct ownership and callbacks.

Some domain objects render themselves.

Other domain objects have separate cards and overlays.

These differences do not mean that Saito requires all applications to be rewritten into one rigid pattern.

When creating new code, prefer the clearer and more localized modern pattern:

    hierarchical ownership
    substantial UI components
    render()
    attachEvents() when useful
    direct calls and callbacks
    app.connection for genuine cross-boundary events
    transaction/domain objects as application data
    localized CSS and templates


## 50. Do Not Copy Legacy Architecture Merely Because It Exists

Existing Saito applications are valuable sources of examples.

They are not all canonical implementations.

An AI should distinguish:

    current preferred direction
    legitimate specialized patterns
    older patterns
    historical compatibility code

For example, an older application may use global events extensively.

That does not mean a new application should.

Another application may put rendering directly into its main module.

That does not mean a new application should.

Another may use a domain object that renders itself.

That may still be an excellent pattern.

The AI should understand the reason for the structure rather than copying the syntax mechanically.


## 51. Localize Changes

One of the major benefits of this architecture is that a UI request should usually map to a small set of files.

For example:

    "Change how Tweets are displayed."

might lead to:

    lib/tweet.js
    lib/tweet.template.js
    web/css/redsquare-tweet.css

A request such as:

    "Change the sidebar."

might lead to:

    lib/ui/sidebar.js
    lib/ui/sidebar.template.js
    web/css/sidebar.css

A request such as:

    "Change the purchase overlay."

might lead to:

    lib/ui/overlays/purchase.js
    lib/ui/overlays/purchase.template.js
    web/css/purchase.css

The exact files depend on the application.

The architectural goal is:

> A change should be localized to the object that owns the behavior.


## 52. This Architecture Is Especially Useful for AI

AI systems tend to create abstractions when they cannot identify where behavior belongs.

If the main module is responsible for everything, an AI may respond to every new requirement by adding another helper function to the module.

That produces:

    more functions
    more indirection
    more duplicated state
    more stale assumptions
    larger files
    harder review

A component-oriented Saito application gives the AI clearer boundaries.

For example:

    user asks to change NFT card
        ↓
    find NFT card component
        ↓
    inspect its template
        ↓
    inspect its CSS
        ↓
    modify those files

The AI does not need to understand the entire application to make a localized UI change.


## 53. UI Components Should Be Easy for AI to Inspect

A good component should make its responsibility obvious from its file.

A developer should be able to open:

    purchase.js

and understand:

    what it renders
    what data it receives
    what actions it supports
    what happens when the user interacts with it

The AI should not have to follow:

    UI service
        ↓
    controller
        ↓
    presenter
        ↓
    view model
        ↓
    repository
        ↓
    component adapter

to determine what a button does.

Those layers are not inherently forbidden.

They simply should not be introduced without a genuine architectural reason.


## 54. Prefer Fewer, Fatter Functions Over Fragmentation

When a function represents a coherent action, it is often better to keep its implementation together.

For example:

    onClick() {
      const tx = this.mod.createPurchaseTransaction(this.nft);
      this.app.network.propagateTransaction(tx);
      this.showWaitingState();
    }

may be easier to understand than:

    onClick() {
      this.createPurchase();
    }

    createPurchase() {
      this.prepareTransaction();
    }

    prepareTransaction() {
      this.buildTransaction();
    }

    buildTransaction() {
      ...
    }

If those functions have no independent meaning and no reuse requirement, the additional layers make the code harder to follow.

This does not mean long functions are always good.

It means that functions should be split because the resulting boundaries represent meaningful concepts, not because an AI assumes every operation deserves a helper.


## 55. Extract a Function When It Creates a Real Boundary

A helper function is justified when:

    it is reused
    it represents a meaningful domain concept
    it isolates substantial complexity
    it creates a useful test boundary
    it is independently understandable
    it separates a genuinely different responsibility

For example:

    createPurchaseTransaction()

may be appropriate if transaction creation is substantial application logic used in multiple places.

But:

    getDatabase()
        return this.mod.database

usually is not.

The goal is semantic organization, not maximum function count.


## 56. Do Not Create Controllers, Services, or View Models Automatically

A conventional web AI may attempt to create:

    Controller
    Service
    Repository
    ViewModel
    Presenter
    Store
    Dispatcher

before implementing a feature.

Do not do this automatically.

First determine whether the application already has a meaningful object that owns the responsibility.

Often the answer will be:

    module
    domain object
    UI component
    transaction file
    database object

Use those existing semantic boundaries.

Create a new object when a new meaningful concept actually appears.


## 57. A UI Component Can Call Its Module Directly

If a component needs an operation provided by its owning module, it can call the module.

For example:

    this.mod.someApplicationOperation()

There is no need to create:

    ApplicationService

merely to forward the call.

Likewise, if the operation belongs to a Saito runtime API:

    this.app.wallet
    this.app.network
    this.app.storage
    this.app.keychain

can be used directly.

The application already has explicit access to these objects.


## 58. Keep the Component's Data Model Understandable

A UI component should receive the data it needs in a recognizable form.

For example:

    new Tweet(app, mod, tx)

or:

    new NFTCard(app, mod, nft)

or:

    new ListingCard(app, mod, listing)

is clearer than passing a large anonymous collection of unrelated values.

The component should not need to reconstruct its domain object from scattered pieces of state if the application already has a meaningful object representing it.


## 59. Do Not Duplicate the Domain Model in the UI

Avoid:

    Transaction
        ↓
    DTO
        ↓
    ViewModel
        ↓
    UIState
        ↓
    HTML

unless the application genuinely needs those additional concepts.

Saito applications should normally preserve the useful relationship:

    transaction
        ↓
    domain object
        ↓
    UI component

A component may derive display-specific values.

That does not require inventing a second application model.


## 60. The DOM Is Part of the Component's Interface

A component's template defines its DOM structure.

For example:

    <div class="purchase">
        <div class="purchase-header">...</div>
        <div class="purchase-body">...</div>
        <button class="purchase-button">...</button>
    </div>

The component's JavaScript can then operate on that structure.

The CSS styles it.

This gives the developer a straightforward mapping:

    JavaScript
        behavior

    template
        DOM

    CSS
        presentation

Keeping these relationships visible is especially useful when modifying applications with AI.


## 61. Avoid Child Components Manipulating Unrelated Parent DOM

A child component should normally write into its own container.

If:

    Main

owns:

    Sidebar

then Sidebar should manipulate the Sidebar region.

It should not arbitrarily reach into:

    Main
    Header
    Content
    Footer

and modify their DOM.

If it needs to request a parent-level action, use:

    callback
    direct parent method

or, when the relationship is genuinely cross-boundary:

    app.connection

This keeps DOM ownership understandable.


## 62. Avoid Document-Global Selectors When a Component Container Exists

Prefer selecting relative to the component's own container.

For example:

    this.container.querySelector(...)

or the appropriate Saito browser helper.

Avoid assuming that an element with a particular ID exists globally if the component already has a clear root.

Global IDs and selectors are sometimes necessary for application shells or framework infrastructure.

They should not become the default mechanism for every component.


## 63. Components Can Be Rendered at Different Times

A component may be rendered:

    immediately during Main.render()

or:

    after user interaction

or:

    after a transaction arrives

or:

    after a peer response

or:

    after blockchain confirmation

or:

    after another component requests it

The architecture should not assume that all components are created and rendered simultaneously.

This is one of the important differences between Saito applications and static web pages.


## 64. Initialization Is Not Rendering

`initialize()` is part of the Saito module lifecycle.

It should not be treated as the application's screen-rendering phase.

The module may initialize before:

    peers are connected
    remote data is available
    the page is visible
    confirmations have occurred

Rendering belongs in the UI lifecycle.

Network-dependent work belongs in the appropriate Saito networking hooks or application operations.

The UI should then update when the data it needs becomes available.


## 65. Do Not Assume the Network Is Available During Initial Render

A component may render before peer connectivity exists.

For example:

    initialize()
        ↓
    render()
        ↓
    peer service becomes available
        ↓
    request data
        ↓
    receive response
        ↓
    update UI

This is normal.

Do not make initial rendering depend on a peer being immediately available unless the application genuinely requires it.


## 66. Do Not Poll for UI Availability

A component should not repeatedly ask:

    Is the peer available yet?

or:

    Is the other component rendered yet?

using arbitrary polling loops.

Use Saito lifecycle hooks and explicit component ownership.

When peer services become available, use the relevant Saito mechanism.

When a parent owns a child, the parent knows when it renders the child.

When an application-wide event genuinely needs to cross boundaries, use `app.connection`.


## 67. Use Saito's Existing Browser Utilities

Saito provides browser helpers for common DOM operations.

Use the existing utilities rather than creating another generic DOM abstraction.

For example:

    app.browser.addElementToSelector()
    app.browser.replaceElementBySelector()
    app.browser.replaceElementContentBySelector()

The exact API should be checked against the current implementation before writing code.

Do not create:

    DomService
    UIService
    RenderService

merely to wrap these functions.


## 68. Shared UI Should Be Promoted Only When It Is Actually Shared

A module-specific component should normally stay inside the module.

For example:

    node/mods/example/lib/ui/

is appropriate for application-specific UI.

A component should move into the Saito framework UI layer only when it represents genuinely reusable Saito-wide functionality.

Do not modify framework UI merely because two application components happen to look similar.

The narrowest appropriate ownership boundary is usually preferable.


## 69. Component Directory Structure Should Reflect Meaning

There is no mandatory directory structure for UI components.

Useful structures include:

    lib/
        tweet.js
        database.js

or:

    lib/
        ui/
            main.js
            sidebar.js
            manager.js
            overlays/
                purchase.js

A core domain object that also renders may reasonably remain:

    lib/tweet.js

A substantial application-specific UI may reasonably live under:

    lib/ui/

The important thing is that developers and AI can predict where meaningful objects are located.


## 70. Do Not Create a UI Directory Merely to Satisfy a Rule

`lib/ui/` is an organizational convention.

It is not a requirement.

If an object is naturally:

    Tweet

then:

    lib/tweet.js

may be better than:

    lib/ui/tweet.js

if Tweet is both a central domain concept and a UI component.

If an object is clearly:

    PurchaseOverlay

then:

    lib/ui/overlays/purchase.js

may communicate its role more clearly.

Choose the location according to semantic responsibility.


## 71. The Application Should Be Understandable by Drawing It

A useful design exercise is to draw the page.

For example:

    Application
    ├── Header
    ├── Sidebar
    │   ├── User
    │   └── Navigation
    └── Main
        ├── Toolbar
        └── TweetManager
            ├── Tweet
            ├── Tweet
            └── Tweet

Or:

    Store
    ├── Menu
    ├── Browse
    │   ├── ListingCard
    │   ├── ListingCard
    │   └── ListingCard
    └── PurchaseOverlay

If the UI can be drawn clearly, the object structure often becomes obvious.

Then implementation becomes:

    parent owns child
    child renders child
    child owns its interactions

This is often a better starting point than designing a set of abstract software layers.


## 72. Let the UI Structure Guide Application Structure

When beginning a new application, identify:

    page
    major regions
    components
    domain objects
    interactions
    data sources

Then construct the application around those objects.

For example:

    index.js
        page shell

    mod.js
        Saito module lifecycle

    Main
        main application UI

    Sidebar
        sidebar UI

    Game
        domain object

    GameBoard
        game UI

    Player
        domain object

    PlayerCard
        player UI

    transactions.js
        protocol operations

This gives both the developer and AI a clear map.


## 73. The Main Module Composes the Application

The module should normally construct its major application objects, including the top-level UI object.

For example:

    this.main = new Main(app, this);

    this.database = new Database(app, this);

    this.transactions = new Transactions(app, this);

Then:

    render() {
      this.main.render();
    }

The module remains the application map. The UI hierarchy remains the UI ownership map.

Main should normally construct and own the UI beneath it:

    Main
      -> Header
      -> Body
           -> Splash
           -> Prepare
           -> Document

The module may construct Header, Body, Splash, and Prepare directly when the application is simple. The problem appears when the module becomes the owner of that visual hierarchy and accumulates the methods that switch among those surfaces.

The implementation of these objects remains in their own files.


## 74. Keep the Module as the Application Map

A developer should be able to inspect the module and see something like:

    constructor()
        creates application objects

    initialize()
        initializes application

    render()
        renders Main

    onConfirmation()
        responds to blockchain events

    handlePeerTransaction()
        responds to application messages

    onPeerServiceUp()
        responds to available services

This provides a concise map of the application.

The detailed UI implementation is elsewhere.

The detailed transaction implementation is elsewhere.

The detailed database implementation is elsewhere.

This is much easier to review than a module containing hundreds of application-specific helper methods.


## 75. UI Components Should Not Become Miniature Frameworks

A component should be substantial enough to own its responsibility.

But it should not create its own generic framework.

Avoid:

    ComponentBase
    ComponentRegistry
    ComponentFactory
    ComponentLifecycleManager
    ComponentEventBus
    ComponentStateStore

unless the application has an actual requirement for such infrastructure.

Most Saito components only need:

    constructor
    render
    attachEvents
    interaction functions
    perhaps update methods

Keep the architecture concrete.


## 76. Do Not Over-Abstract Simple UI Operations

If a button needs to call a module method, call it.

If a component needs to access the wallet, use:

    this.app.wallet

If it needs a module database, use:

    this.mod.database

If it needs to propagate a transaction, use the Saito networking API.

Do not create a chain of wrappers merely because conventional enterprise software often does so.

The Saito architecture is deliberately direct.


## 77. Component Boundaries Should Correspond to User-Visible Responsibility

Good boundaries often correspond to things a user can identify.

For example:

    Header
    Sidebar
    Profile
    Tweet
    Listing
    Purchase
    Chat
    GameBoard
    PlayerPanel
    Settings

These are useful concepts because they map to visible application behavior.

A function such as:

    DataCoordinator

is less useful if its only purpose is to pass data between two UI elements.

Prefer boundaries that correspond to real application concepts.


## 78. UI Components Are Good Review Boundaries

A developer reviewing:

    PurchaseOverlay

should be able to understand the purchase UI without reading the entire application.

A developer reviewing:

    Tweet

should be able to understand how a Tweet is displayed and interacted with.

A developer reviewing:

    Sidebar

should be able to understand the sidebar.

This improves human code review and AI code modification at the same time.


## 79. Keep Behavior With the Object It Describes

A useful general rule is:

> Put behavior beside the object that gives the behavior meaning.

Examples:

    Tweet
        Tweet behavior

    Listing
        Listing behavior

    PurchaseOverlay
        purchase UI behavior

    GameBoard
        board UI behavior

    Transactions
        transaction construction/handling

    Database
        database behavior

The main module coordinates these objects.

It should not absorb their behavior.


## 80. Keep Transaction Behavior With Transactions

If an operation is specifically about constructing or processing transactions, it can belong in:

    lib/transactions.js

or another semantic transaction file.

For example:

    createTweetTransaction()
    receiveTweetTransaction()
    createPurchaseTransaction()

can be appropriate when those are substantial transaction concepts.

The UI component can call the transaction operation.

The transaction implementation should not be reproduced inside the UI merely because a button triggers it.


## 81. Keep Domain Behavior With Domain Objects

If behavior belongs to:

    Tweet

put it in Tweet.

If behavior belongs to:

    Listing

put it in Listing.

If behavior belongs to:

    Game

put it in Game.

This gives AI a predictable location for modifications.

The goal is not to force every function into a separate file.

The goal is to make semantic ownership obvious.


## 82. Use UI Components to Prevent Main-File Growth

The most important architectural benefit of this approach is containment.

Without UI components:

    every new UI feature
        ↓
    mod.js

With UI components:

    new UI feature
        ↓
    identify responsible component
        ↓
    modify component

This means that an application can grow without continuously increasing the complexity of its main module.

It also means an AI can make a UI change without touching unrelated application infrastructure.


## 83. AI Rules for Creating a New UI Component

When a new visible feature is requested:

1. Identify what the user will see.

2. Identify the coherent visual region responsible for it.

3. Determine whether an existing component already owns that region.

4. If not, create a component.

5. Give a module-owned component `app` and `mod`.

6. Give it a `render()` function.

7. Add `attachEvents()` when event binding is substantial enough to benefit from separation.

8. Put interaction behavior inside the component.

9. Put HTML structure in the template when a separate template is useful.

10. Put component-specific styling in the appropriate CSS file.

11. Let the parent construct and own the component.

12. Avoid putting the component's implementation into `mod.js`.

13. Avoid creating helper functions unless they represent meaningful behavior.

14. Avoid creating generic UI infrastructure.

15. Use existing Saito browser and application APIs.


## 84. AI Rules for Modifying Existing UI

Before changing UI:

1. Find the component that renders the affected interface.

2. Find its template.

3. Find its CSS.

4. Find its parent.

5. Determine where its data comes from.

6. Determine how it is currently rendered.

7. Determine how its events are attached.

8. Determine whether it is reused in multiple contexts.

9. Modify the narrowest appropriate component.

10. Do not move the implementation into the main module merely because that is convenient.

11. Preserve the existing component ownership structure unless the requested change genuinely requires changing it.


## 85. AI Rules for Event Handling

When adding interaction:

1. Determine which component owns the UI element.

2. Prefer handling the interaction in that component.

3. Use `render()` followed by `attachEvents()` when a separate binding phase is useful.

4. Use direct event handlers when that is simpler.

5. Use event delegation for dynamic lists when appropriate.

6. Put stable application identifiers such as transaction signatures into DOM data attributes when useful.

7. Recover the underlying object from the identifier rather than duplicating the entire object in the DOM.

8. Use callbacks for explicit parent-child communication.

9. Use `app.connection` when the event genuinely crosses component or module boundaries.

10. Do not create a global event for a relationship that is already explicit.


## 86. AI Rules for Templates

When creating a template:

1. Make the HTML structure obvious.

2. Keep substantial application logic out of the template.

3. Do not put database access in the template.

4. Do not put network operations in the template.

5. Do not put transaction construction in the template.

6. Do not create large helper systems inside the template.

7. Allow simple presentation branching where it improves the generated HTML.

8. Keep the main behavior in the component JavaScript file.


## 87. AI Rules for CSS

When styling a component:

1. Identify the component's root.

2. Style the component relative to that root.

3. Reuse Saito defaults when they already provide the desired typography and spacing.

4. Do not specify every font size and margin unnecessarily.

5. Avoid introducing a complete custom design system into a module unless the application requires one.

6. Keep component-specific styling near the component's CSS.

7. Prefer CSS media queries for responsive layout.

8. Use JavaScript for responsive behavior only when runtime logic is genuinely necessary.

9. Avoid generic global selectors that can unintentionally affect unrelated application UI.


## 88. AI Rules for Domain Objects and UI Components

When deciding whether to combine or separate a domain object and UI component:

Use one object when:

    the domain object naturally represents its own UI
    the UI is tightly coupled to that object
    the object is normally displayed in one primary form

Use multiple UI components when:

    the same domain object has multiple representations
    different screens require different layouts
    an overlay requires a different interaction model
    the UI needs different behavior in different contexts

For example:

    Tweet
        may render itself

while:

    SaitoNFT
        NFTCard
        NFTOverlay
        PurchaseOverlay
        SelectionOverlay

may be more appropriate.

Neither structure is inherently required.


## 89. AI Rules for Application Composition

A useful default structure is:

    index.js
        page-level concerns

    mod.js
        Saito module lifecycle and composition

    Main
        application UI

    subordinate UI components
        visual regions

    domain objects
        application concepts

    transactions
        transaction operations

    database/storage objects
        persistence

    templates
        HTML structure

    CSS
        presentation

This is a default, not a rigid framework.

The application may legitimately differ when its domain requires another structure.


## 90. The Main Test for Good UI Architecture

Ask:

> If a user asks to change this particular part of the interface, can I identify the small set of files that own it?

If the answer is yes, the architecture is probably localized.

If the answer is:

    "We need to modify mod.js, the controller,
     the UI service, the view model, the repository,
     and three unrelated helpers"

then the application may have introduced unnecessary abstraction.

Saito UI should make changes local whenever possible.


## 91. The Main Test for AI-Generated Code

Ask:

> Did the AI put this code where the concept actually belongs?

If the answer is:

    UI behavior → UI component
    domain behavior → domain object
    transaction behavior → transaction code
    persistence → database/storage object
    module lifecycle → mod.js
    HTML → template
    styling → CSS

then the architecture is probably healthy.

If the answer is:

    everything → mod.js

the AI has probably failed to identify the application's semantic boundaries.


## 92. Preferred Saito UI Shape

A strong default for a new application is:

    index.js
        ↓
    Saito page/container
        ↓
    Main UI component
        ↓
    major UI components
        ↓
    subordinate UI components
        ↓
    domain objects

with:

    mod.js
        ↓
    Saito lifecycle
    application composition
    protocol/event entry points

and:

    transactions.js
        ↓
    transaction behavior

    database.js
        ↓
    persistence behavior

    component.template.js
        ↓
    HTML structure

    component.css
        ↓
    presentation

This is not a framework that every application must implement literally.

It is a useful mental model for keeping responsibilities local.


## 93. Saito's UI Architecture Is Deliberately Concrete

The preferred architecture is not based on maximizing abstraction.

It is based on making the application's actual objects visible.

A developer should be able to see:

    Main
    Sidebar
    Tweet
    Listing
    Game
    Player
    PurchaseOverlay

and understand what each one means.

The application should not hide those concepts behind generic infrastructure.

The best abstraction is usually the one that corresponds to a real application concept.


## 94. Final AI Guidance

When implementing Saito UI, remember:

    A UI component is an object that renders something.

    It normally receives app and mod.

    It should normally have render().

    render() followed by attachEvents() is a preferred practical pattern.

    render() alone is also valid when simpler.

    A domain object may also be a UI component.

    A domain object may instead have several UI components.

    Parent components should normally construct and own children.

    Components should own their own interaction behavior.

    Callbacks are useful for explicit parent-child communication.

    app.connection is useful for genuine cross-component or cross-module events.

    Transaction signatures are useful DOM data IDs.

    Templates should primarily describe HTML.

    JavaScript should contain component behavior.

    CSS should style the component's HTML structure.

    Saito defaults should be reused rather than overridden unnecessarily.

    Responsive layout should normally be handled with CSS.

    The main module should remain the Saito lifecycle and application map.

    The UI hierarchy remains the UI ownership map.

    For a multi-surface application, the top-level UI component owns which surface is displayed.

    Do not turn mod.js into the application's universal controller or its UI router.

    A Main UI component is ordinary component ownership, not a controller layer.

    Do not create controllers, services, repositories, view models, or UI stores without a real need.

    Do not duplicate the domain model in the UI.

    Do not introduce a component framework when ordinary objects are sufficient.

    Keep substantial behavior in domain objects and UI components.

    Keep changes localized.

The objective is simple:

> Build Saito applications out of recognizable application objects, substantial UI components, and direct Saito APIs, while keeping the main module small enough that a human or AI can understand it at a glance.
