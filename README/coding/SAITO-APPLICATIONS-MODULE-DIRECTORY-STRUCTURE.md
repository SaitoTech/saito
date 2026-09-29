
# Saito Application and Module Directory Structure

## Purpose

A Saito application is also a Saito module. These terms are used interchangeably. "Module" emphasizes the fact that the application participates in the Saito module system; "application" emphasizes that a module can be a complete application, protocol, game, service, or user-facing interface.

The distinction is linguistic rather than architectural.

A Saito application should be organized according to a small number of established conventions. These conventions are important because the directory structure tells both Saito and developers where particular responsibilities belong.

For an AI developer, this document has a second purpose: it should make it possible to construct a new Saito application from scratch without importing the directory structures and architectural assumptions of conventional web frameworks.

The most important principle is:

> Create only the files and directories that the application actually needs.

The existence of a convention does not mean that every application should contain that directory.

A minimal application may consist of one JavaScript file. An application with a database needs `sql/`. An application with a substantial UI needs `lib/ui/` and `web/css/`. A game may need additional structures for cards, assets, or generated source. A headless protocol module may need none of these.

Do not add directories merely because they exist in other Saito applications.

In particular, an AI should not create SQL merely because other applications have SQL, should not create a web interface merely because other applications have `web/`, and should not create a testing framework merely because the application could theoretically have tests.

The goal is a small, intelligible application whose structure reflects what it actually does.

---

## 1. Where Applications Live

Source applications live under:

    node/mods/<application>/

For example:

    node/mods/tutorial01/
    node/mods/redsquare/
    node/mods/store/
    node/mods/chess/
    node/mods/imperium/

The directory name is normally a lowercase slug-like identifier.

Applications are not discovered by scanning `node/mods/`.

They become part of a Saito runtime because their entry file is explicitly listed in:

    node/config/modules.config.js

The configuration has separate `core` and `lite` module lists.

The server loads the `core` list.

The browser loads the `lite` list.

A module can therefore be available to the full Node server, the browser, or both.

A directory existing under `node/mods/` does not cause the module to load.

For example, this does not automatically load an application:

    node/mods/myapp/
        myapp.js

The application must also be registered in the appropriate section of `modules.config.js`.

The normal configuration looks conceptually like:

    core: [
        'myapp/myapp.js'
    ]

and, if the application is also part of the browser bundle:

    lite: [
        'myapp/myapp.js'
    ]

The configuration path is relative to:

    node/mods/

---

## 2. The Minimal Saito Application

The smallest valid Saito application is extremely small.

For example:

    node/mods/tutorial01/
        tutorial01.js

The entry file defines a class extending `ModTemplate`, gives the module its name/identity, and exports the constructor.

A module does not require:

- `web/`
- `sql/`
- `lib/`
- `package.json`
- `index.js`
- CSS
- images
- tests
- README files
- templates
- frontend/backend directories

unless the application actually needs them.

This is an important design principle.

Do not begin by creating a generic application skeleton containing every possible Saito directory. Begin with the smallest structure capable of implementing the application.

Then add directories when a real requirement appears.

For example:

A protocol-only module may need only:

    myapp/
        myapp.js

A UI application might grow into:

    myapp/
        myapp.js
        lib/
            ui/
        web/
            css/

An application requiring persistent Node-side SQL storage might additionally have:

    myapp/
        myapp.js
        sql/
            records.sql

A game may eventually have:

    mygame/
        mygame.js
        lib/
        web/
            css/
            img/

These are different applications, not different required stages of a universal module template.

---

## 3. The Main Module File

The normal entry-file convention is:

    <slug>/<slug>.js

Examples:

    redsquare/redsquare.js
    chat/chat.js
    store/store.js
    chess/chess.js
    tutorial01/tutorial01.js

The filename used by Saito is ultimately determined by `modules.config.js`. Other filenames are technically possible if the configuration explicitly points to them.

However, the normal convention should be followed unless there is a specific reason not to.

A new application should therefore normally look like:

    myapp/
        myapp.js

The main file exports the module constructor.

Conceptually:

    class MyApp extends ModTemplate {
        constructor(app) {
            super(app);
            this.name = "MyApp";
            this.slug = "myapp";
        }
    }

    module.exports = MyApp;

The exact implementation should follow the conventions of the current repository and the requirements of the application.

There is no special requirement for a file called `mod.js`.

An AI should not invent `mod.js` as a standard Saito entry point.

The important relationship is:

    modules.config.js
            |
            v
    node/mods/myapp/myapp.js
            |
            v
    exported module constructor
            |
            v
    new Module(app)

---

## 4. Module Name, Slug, Directory, and Filename

Saito has several related identifiers that should not be confused.

The directory identifies where the source application lives:

    node/mods/myapp/

The entry filename identifies the file loaded by `modules.config.js`:

    myapp.js

The module's `name` is its application/module identity.

The module's `slug` is normally the URL-friendly identifier used for paths and related framework conventions.

Historically, Saito generally generated the slug from the name.

For example:

    name: "RedSquare"
    slug: "redsquare"

or:

    name: "Twilight"
    slug: "twilight"

The exact name/slug relationship has evolved, and applications can specify the slug explicitly.

For new applications, follow the existing repository conventions.

In particular, avoid spaces in the filesystem directory name.

A good normal convention is therefore:

    directory: myapp
    entry file: myapp.js
    name: MyApp
    slug: myapp

The directory and entry filename normally correspond to the slug.

Do not assume that `this.name`, the directory, the entry filename, and the slug are technically the same value. Saito has historically kept these concepts distinct.

The distinction matters because:

- the directory determines filesystem paths;
- the configured entry path determines what gets loaded;
- `name` identifies the module;
- `slug` is used for URLs and commonly for the default database name.

An AI should understand the distinction but should not create unnecessary complexity around it.

Use the repository's established naming convention unless the application has a reason to diverge.

---

## 5. The `lib/` Directory

`lib/` is the normal location for substantial application source code that should not clutter the root module file.

It is an application convention rather than a special directory that the framework scans automatically.

For example:

    myapp/
        myapp.js
        lib/
            database.js
            transactions.js
            P2SH.js

The files should be organized semantically.

Good examples include:

    lib/database.js
    lib/transactions.js
    lib/P2SH.js
    lib/main.js

The purpose is to keep the main module class focused on module lifecycle and application integration while putting substantial implementation in appropriately named components.

Do not create many tiny helper files simply to make every function technically separate.

If a small function is naturally part of the code around it, keeping it inline is often clearer.

Prefer:

    lib/database.js
    lib/transactions.js

over a collection such as:

    lib/helpers/
        format.js
        validation.js
        string-utils.js
        object-utils.js
        transaction-helper.js
        database-helper.js

unless the application has actually become large enough to justify such organization.

The directory structure should communicate meaningful application concepts.

---

## 6. User Interfaces Belong in UI Components

A substantial Saito UI should not be implemented directly inside the main module file.

The main module's `render()` function is an entry point into the interface. It should not become the location where the entire interface is implemented.

For example, this is the preferred architectural direction:

    myapp/
        myapp.js
        lib/
            ui/
                main.js
                main.template.js
                overlays/
                    settings.js
                    settings.template.js

The main module can invoke the UI component:

    render() {
        this.main.render();
    }

The UI component then owns the complexity of rendering and interacting with that portion of the application.

This separation is particularly important for complex applications.

The purpose is not merely organizational. It allows an AI developer to reason about responsibilities:

- `myapp.js` is the application/module integration and lifecycle layer.
- `lib/ui/` contains UI components.
- UI templates contain the markup for those components.
- UI CSS belongs under `web/css/`.
- Application logic remains available to UI components through the module/application objects they receive.

UI components commonly receive references to both the application and module, allowing them to access Saito APIs and the application's underlying state and functions.

This is preferable to accumulating functions such as:

    showAlert()
    showSettings()
    showUserMenu()
    showConfirmation()
    renderSidebar()
    renderModal()
    updateEverything()

inside the main module file.

When an interface becomes substantial, move the responsibility into appropriately named UI components.

---

## 7. UI Component Organization

The most common organization for complex application interfaces is:

    lib/ui/

For example:

    lib/ui/main.js
    lib/ui/main.template.js

Overlays commonly live under:

    lib/ui/overlays/

For example:

    lib/ui/overlays/settings.js
    lib/ui/overlays/settings.template.js

Other application-specific UI groupings are possible.

Older applications contain structures such as:

    lib/overlays/
    lib/appspace/
    lib/email-appspace/

These should not automatically be copied into new applications.

`lib/appspace/` and `lib/email-appspace/` are historical structures associated with older application designs.

For new UI work, `lib/ui/` is the clearer default.

The same principle applies to template files.

A component can have a paired template:

    lib/ui/main.js
    lib/ui/main.template.js

There is no requirement for a framework-wide `templates/` directory inside every application.

---

## 8. HTML and Templates

Saito applications use several mechanisms for producing HTML.

The most common modern application pattern is for JavaScript components to return or construct HTML through paired template files.

For example:

    lib/ui/main.js
    lib/ui/main.template.js

The main module may also contain a small amount of HTML needed for its own entry point.

Some applications have a root:

    index.js

This is commonly an HTML factory used by the server for generating a document.

It is not an npm-style package entry point.

For example:

    myapp/
        myapp.js
        index.js

does not mean that `index.js` is the module loader entry point.

The module entry point is still whatever file is named in `modules.config.js`.

There is also a shared Saito default HTML template under the framework.

Do not create an `index.js` merely because a web application traditionally has one.

Create it when the application actually needs custom server-generated HTML.

---

## 9. The `web/` Directory

`web/` is optional.

It contains static resources associated with the application.

For example:

    myapp/
        myapp.js
        web/
            css/
            img/

If the application has no web assets, do not create `web/`.

When a module has a `web/` directory, Saito serves it under the module's slug.

For example:

    node/mods/redsquare/web/img/logo.png

is served conceptually as:

    /redsquare/img/logo.png

It is not normally served as:

    /mods/redsquare/web/img/logo.png

The URL uses the module slug.

The filesystem uses the module directory.

These are related but distinct concepts.

The global Saito web resources are separate:

    node/web/

These are served under:

    /saito/

For example:

    /saito/saito.js
    /saito/saito.css

An application can therefore use both its own web resources and shared Saito resources.

---

## 10. CSS Organization

Application CSS belongs under:

    web/css/

For example:

    myapp/
        web/
            css/
                myapp-base.css
                myapp-dashboard.css
                myapp-overlay.css

Saito's compile process combines the CSS source files into:

    web/style.css

The generated file is what the application normally references at runtime.

Conceptually:

    web/css/*.css
            |
            | npm run compile
            v
    web/style.css
            |
            v
    /<slug>/style.css

The exact CSS loading mechanism should follow the application's existing `this.styles` conventions.

For example:

    this.styles = [
        '/saito/saito.css',
        '/myapp/style.css'
    ];

Large applications commonly use multiple CSS files because individual UI components should have their own styles.

This is desirable.

Do not create one enormous CSS file merely because the runtime ultimately serves a generated `style.css`.

The source organization should reflect UI responsibility.

For example:

    web/css/
        myapp-base.css
        myapp-dashboard.css
        myapp-overlay-settings.css
        myapp-sidebar.css

is preferable for a complex application to putting every rule into the main module's JavaScript.

The generated:

    web/style.css

is a build artifact.

The source of truth is the CSS under:

    web/css/

---

## 11. JavaScript and Browser Code

Saito does not normally divide an application into conventional:

    frontend/
    backend/

directories.

Do not create them.

The same application JavaScript can run in both Node and the browser.

The distinction is normally made in code.

For example, functionality that should only run on a full Node server can check the browser state and return appropriately.

Browser-specific functionality includes things such as:

- `render()`
- DOM manipulation
- browser UI
- stylesheet attachment
- browser overlays

Node-specific functionality can include:

- `webServer`
- filesystem operations
- SQLite
- server-side processing

These responsibilities can coexist in the same module source tree.

The module itself determines which code should execute in which environment.

This is a fundamental Saito convention.

Do not import a conventional web-stack architecture in which the application is divided into an HTTP backend and a separate browser frontend unless there is a specific application requirement for doing so.

---

## 12. `web/js/` Is Not the Normal Application Architecture

A `web/js/` directory can exist and its contents can be served statically, but it is not the normal mechanism for implementing Saito application logic.

Application logic should normally live in the JavaScript source tree and be required from the module entry point.

For example:

    myapp.js
    lib/main.js
    lib/ui/main.js

The browser build includes the modules that are part of the application's require graph.

Simply creating:

    web/js/app.js

does not automatically make it part of the Saito application lifecycle.

If an additional static script is genuinely required, it can be explicitly attached through the application's script mechanisms.

Do not build a second JavaScript application inside `web/js/` without a reason.

---

## 13. Static Images and Other Assets

Static application assets normally live under:

    web/

Common examples include:

    web/img/
    web/font/

For example:

    myapp/
        web/
            img/
                logo.png
                background.png
            font/
                ...

The URL follows the module slug:

    /myapp/img/logo.png

Games often have substantial collections of images, fonts, cards, maps, and other assets under `web/`.

The existence of these directories does not imply that every application needs them.

Create them only when the application actually has static assets.

---

## 14. SQL and Application Databases

The `sql/` directory is optional.

Create it only when the application needs its own Node-side SQLite database.

For example:

    myapp/
        myapp.js
        sql/
            records.sql

The SQL source files are part of the module.

During module installation on a Node server, Saito reads the SQL files and initializes the application's database.

The resulting database is stored under:

    node/data/<dbname>.sq3

Normally the database name is derived from the module's slug, although applications can specify a database name explicitly.

For example:

    node/data/store.sq3
    node/data/registry.sq3

The important distinction is:

    node/mods/store/sql/
    
contains source SQL definitions,

while:

    node/data/store.sq3

is the runtime database.

Do not put source SQL databases under `node/data/`.

Do not create a `.sq3` file inside the module source directory.

---

## 15. Multiple SQL Files

A module can contain multiple SQL source files.

For example:

    sql/
        listings.sql
        orders.sql
        summary.sql

These files are executed into the same application database.

They do not produce one SQLite database per SQL file.

This means the structure can be used to separate logically distinct schema definitions or initialization steps while still maintaining a single application database.

Numbered SQL files are sometimes used for ordering or migration-like behavior.

For example:

    sql/archive1.sql
    sql/archive2.sql

This is an established repository practice, but it is not a general migration framework.

Do not invent a migration architecture unless the application actually needs one.

---

## 16. Database Persistence and `npm run compile`

The existence of an application database does not by itself determine whether that database survives a server rebuild or database cleanup.

The Saito build/compile configuration determines which databases are treated as persistent.

This matters for modules such as Registry.

A database can be required for normal operation while still being something that should survive a server reset.

The compile configuration contains the relevant persistent-database settings.

Therefore, when creating an application with persistent database state, an AI should not assume that simply creating:

    sql/

is sufficient to determine the application's desired lifecycle.

If the application's database contains state that must survive server destruction or reset, inspect the current compile configuration and follow the existing persistence convention.

This is a deployment/build concern rather than a reason to invent a new persistence directory inside the module.

---

## 17. Browser Storage Is Not Represented by a Directory

Browser persistence does not normally require a directory such as:

    browser-storage/
    indexeddb/
    local-storage/

Do not create such directories.

Saito's browser persistence mechanisms are accessed through APIs and databases rather than being represented as source-code directories.

Examples include:

- `app.options`
- Archive
- browser database mechanisms such as JsStore
- IndexedDB databases used by particular applications
- localForage where used by specific components

The application should use the appropriate Saito API rather than creating a directory to represent browser persistence.

---

## 18. `package.json`

Saito applications normally do not have their own `package.json`.

Dependencies are generally managed centrally in:

    node/package.json

Do not create:

    node/mods/myapp/package.json

simply because the application contains JavaScript.

A module-specific package can exist in unusual cases, but this is not the normal Saito architecture.

An AI should not import the npm package model into every Saito application.

The fact that one specialized module contains a `package.json` does not make it a general Saito requirement.

---

## 19. Tests

Tests are not part of the distributed Saito application.

A developer may create tests for a module, and repository-level tests exist under structures such as:

    node/tests/mods/<module-name>/

A test directory can also exist during development if that is useful.

However, tests should not be treated as a required part of the module's distributable source structure.

This distinction matters because Saito modules can be compiled into browser applications and into standalone dynamic modules.

Development dependencies such as test frameworks and Node-specific `assert` functionality can become problematic if they are accidentally pulled into a compiled application.

Therefore:

> Do not add tests to a module merely because a software project convention says every module should have tests.

If tests are needed, keep them outside the compiled application path or in an appropriate development-only location.

The exact location should be chosen according to the repository's testing conventions and the needs of the developer.

For distributed modules, do not assume that the test suite is part of the module payload.

---

## 20. No `frontend/` and `backend/` Directories

A Saito module is not conventionally structured as:

    myapp/
        frontend/
        backend/

This is foreign to the normal Saito architecture.

Saito applications use the same source tree for Node and browser execution.

The environment determines what executes.

For example:

    if (this.app.BROWSER) {
        // browser-specific behavior
    }

or equivalent current repository conventions may be used.

Server functionality can live on the module class:

    webServer()
    handlePeerTransaction()
    onConfirmation()

while browser functionality can live in:

    render()
    attachEvents()

and UI components under:

    lib/ui/

This allows an application to share Saito's runtime model rather than reconstructing a conventional web application stack.

---

## 21. Server-Side HTTP Handling

Saito applications do not normally create a:

    routes/

directory.

HTTP routes are generally registered through the module's `webServer()` functionality.

For example, an application can define custom Express routes inside its module.

A complex application may therefore have:

    myapp/
        myapp.js
        lib/
            images.js
        web/
            ...

without requiring:

    routes/
    controllers/
    middleware/
    api/

The server-side behavior remains part of the Saito module.

A module can override `webServer()` when it needs custom HTTP behavior.

Do not create a generic REST API layer unless the application actually requires one.

---

## 22. `controllers/`, `services/`, `repositories/`, and Similar Layers

These directory structures are not standard Saito architecture:

    controllers/
    services/
    repositories/
    models/
    middleware/
    api/

A module may technically use any directory that JavaScript can require, but Saito does not interpret these directories specially.

Do not introduce them simply because they are common in other software ecosystems.

In Saito, application responsibilities commonly remain directly on the module and on semantically meaningful classes in `lib/`.

For example:

    lib/database.js
    lib/transactions.js
    lib/ui/main.js

is preferable to inventing:

    controllers/
    services/
    repositories/
    models/

without an application-specific reason.

This is particularly important for AI-generated code.

An AI trained on conventional enterprise software may instinctively introduce layers such as repositories, service classes, controllers, dependency-injection containers, or generic managers.

Do not do this by default.

The Saito application should remain as direct and hackable as the problem permits.

---

## 23. Games Are Ordinary Saito Applications

Games are Saito modules.

They are not a separate type of application architecture.

A game generally extends `GameTemplate` or an appropriate game template rather than `ModTemplate`.

For example:

    chess/
        chess.js
        lib/
        web/

Large games can have much more elaborate structures:

    imperium/
        imperium.js
        lib/
        src/
        web/
            css/
            img/
            font/

The important point is that the additional complexity comes from the game itself.

It does not mean that every Saito application should have:

    src/
    web/img/
    web/font/
    lib/overlays/

Games often have:

    lib/overlays/

and other game-specific component organizations.

Follow the structure of the game being developed rather than treating a large game's directory tree as a universal Saito template.

---

## 24. The `src/` Directory

`src/` is not a universal Saito application requirement.

Some large games use it for application-specific source material or code-generation pipelines.

For example, a game may contain large numbers of cards or other source fragments that are combined into generated JavaScript.

This is useful when that particular application needs a compilation pipeline.

It should not be copied into ordinary applications merely because a large game contains it.

For a normal application:

    lib/

is the ordinary source organization.

Use:

    src/

when the application actually has a source-generation or application-specific compilation reason for it.

---

## 25. Shared Saito UI

Saito itself provides shared UI components under:

    node/lib/saito/ui/

Applications can require those components rather than copying them into the application.

For example, an application may use shared Saito headers, overlays, user components, or other framework UI.

Do not copy framework components into:

    node/mods/myapp/lib/

unless the application deliberately needs its own independent implementation.

The distinction is:

    node/lib/saito/ui/
        shared Saito framework components

versus:

    node/mods/myapp/lib/ui/
        application-specific components

This keeps application code focused on the application's own behavior.

---

## 26. Web Assets and Shared Saito Assets

Application web assets are served from:

    node/mods/<dirname>/web/

Shared Saito assets are served from:

    node/web/

The shared Saito directory provides resources under the `/saito/` URL path.

For example:

    /saito/saito.js
    /saito/saito.css

An application therefore commonly combines:

    /saito/saito.css

with:

    /<slug>/style.css

and can reference application-specific assets such as:

    /<slug>/img/example.png

Do not copy shared Saito assets into the application.

---

## 27. Build and Compilation

The Saito build system compiles the browser application from the modules listed in the `lite` configuration.

The module entry file is part of the JavaScript dependency graph.

Conceptually:

    modules.config.js
          |
          v
    lite module list
          |
          v
    module entry files
          |
          v
    required application components
          |
          v
    webpack
          |
          v
    /saito/saito.js

The application JavaScript is therefore not normally compiled as a completely independent browser package.

A module's `lib/` JavaScript is pulled into the application because the module entry point requires it.

This is why simply putting application logic into a static file under:

    web/js/

does not make it part of the normal Saito application lifecycle.

---

## 28. CSS Compilation

CSS has a related but separate compilation path.

Application source CSS lives under:

    web/css/

The compile process produces:

    web/style.css

The application normally loads the generated stylesheet through its slug URL:

    /<slug>/style.css

Therefore:

    web/css/myapp-base.css
    web/css/myapp-dashboard.css
    web/css/myapp-overlay.css

becomes a single runtime stylesheet:

    web/style.css

This does not mean that the source CSS files should be combined manually.

The source files should remain separated according to UI responsibility.

For complex interfaces, it is desirable for each major UI component to have an appropriately named CSS file.

---

## 29. Application Registration

A new application requires registration in:

    node/config/modules.config.js

The configuration determines whether it is loaded by the Node server, browser, or both.

The normal process is approximately:

    modules.config.js
          |
          v
    module path
          |
          v
    require(...)
          |
          v
    new Module(app)
          |
          v
    module initialization

The framework does not scan `node/mods/` and automatically discover every directory.

Therefore, when creating a new module, an AI should remember that creating the source files is not enough.

It must also determine whether the application belongs in the `core` list, the `lite` list, or both.

---

## 30. Runtime `.saito` Modules

Source applications in the repository and runtime-installed `.saito` applications are related but should not be confused.

A source application normally lives at:

    node/mods/<slug>/

A compiled `.saito` application is a distribution artifact.

Development builds can produce files such as:

    node/dist/mods/saito/<slug>.saito

Runtime-installed browser modules are stored through the browser's dynamic-module storage mechanism rather than being unpacked as ordinary directories under:

    node/mods/

The `.saito` format exists so that an application can be distributed as a compiled standalone package containing the components it requires.

The details of module distribution and dynamic installation are covered in the dedicated module-distribution documentation.

For normal application development, work on the source module under:

    node/mods/

Do not restructure the source repository around the `.saito` runtime format.

---

## 31. Dynamic Modules and the Source Tree

Dynamic modules are another reason not to assume that every application needs a conventional npm-style package structure.

A runtime-installed dynamic module is ultimately loaded from compiled application data rather than from a live source directory.

The dynamic-module system has its own compilation and runtime conventions.

An AI working on an ordinary source application should therefore not attempt to reproduce the dynamic-module storage architecture inside the module.

If the task specifically concerns `.saito` distribution or runtime installation, use the conventions documented for that subsystem.

---

## 32. Common Application Structures

The following examples illustrate the range of valid structures.

Minimal application:

    node/mods/tutorial01/
        tutorial01.js

Small UI application:

    node/mods/tutorial02/
        tutorial02.js
        lib/
            main.js
            main.template.js

Database-backed UI application:

    node/mods/store/
        store.js
        index.js
        sql/
            listings.sql
            orders.sql
            summary.sql
        lib/
            database.js
            images.js
            ui/
                ...
        web/
            css/
                ...
            img/
                ...

UI-heavy application:

    node/mods/redsquare/
        redsquare.js
        index.js
        lib/
            main.js
            ...
            ui/
                ...
        web/
            css/
                redsquare-base.css
                ...
        .shots/

Small game:

    node/mods/chess/
        chess.js
        lib/
            chess.js
            chessboard.js
            ...
        web/
            css/
                chess.css
            chessboard.css

Large game:

    node/mods/imperium/
        imperium.js
        lib/
            ...
        src/
            ...
        web/
            css/
            img/
            font/

These are examples, not templates.

Do not copy a larger application's entire tree when creating a smaller application.

---

## 33. Files and Directories That Should Not Be Assumed

The following are optional or application-specific:

    lib/
    lib/ui/
    lib/ui/overlays/
    web/
    web/css/
    web/img/
    web/font/
    sql/
    index.js
    src/
    README
    tests

The following should not be introduced as standard Saito architecture:

    frontend/
    backend/
    controllers/
    routes/
    repositories/
    services/
    models/
    middleware/
    api/
    package.json
    templates/
    mod.ts
    browser-storage/

A module can technically contain unusual structures, but they should have an explicit application-level reason.

The AI should not add them because they are common in other ecosystems.

---

## 34. Legacy and Special Structures

Some structures exist in the repository because of historical applications or specialized requirements.

Examples include:

    lib/email-appspace/
    lib/appspace/
    game-specific src/ pipelines
    react-components/
    nwasm/web/package.json
    .shots/

These should not automatically be treated as current framework conventions.

For example:

`lib/email-appspace/` is associated with an older application organization.

`lib/appspace/` is also a historical naming convention.

Large game `src/` pipelines are application-specific.

`react-components/` represents a particular React-based experiment rather than the default Saito UI architecture.

`nwasm/web/package.json` is a specialized exception rather than evidence that Saito applications are npm packages.

An AI should distinguish between:

    current framework convention

and:

    structure that happens to exist in an existing application.

The presence of a directory in an old application does not make it a recommended structure for new applications.

---

## 35. What the AI Should Do When Creating a New Application

When asked to create a Saito application, the AI should first determine what the application actually requires.

It should ask, conceptually:

Does this application need a persistent Node-side database?

If yes, create:

    sql/

and put the required `.sql` files there.

Does the application need a browser or web interface?

If yes, create:

    web/

and, for CSS:

    web/css/

Does the interface contain substantial UI logic?

If yes, create appropriately named components under:

    lib/ui/

Does a UI component require an overlay?

If yes, use:

    lib/ui/overlays/

Does the application need substantial non-UI application logic?

If yes, put it in semantically meaningful files under:

    lib/

Does the application require generated source or a specialized compilation process?

If yes, consider:

    src/

but only when the application actually needs it.

Does the application require tests?

If yes, create or use a development/test location appropriate to the repository, but do not treat tests as part of the distributed application.

Does the application need custom server-generated HTML?

If yes, an `index.js` HTML factory may be appropriate.

Otherwise, do not create it.

This conditional approach is more important than memorizing a fixed directory tree.

---

## 36. The Tutorial Module Should Be Small

The tutorial applications are particularly important because they teach developers and AI systems what a normal Saito application looks like.

A tutorial should not contain:

    sql/

unless the tutorial is teaching database usage.

It should not contain:

    web/

unless it is teaching web/UI functionality.

It should not contain:

    lib/ui/

unless the tutorial is teaching UI component architecture.

It should not contain tests merely because tests exist elsewhere in the repository.

It should not contain a package manager configuration.

It should not contain frontend/backend directories.

The tutorial should demonstrate exactly the concepts it intends to teach.

This prevents the tutorial from accidentally teaching an AI that every Saito module requires a large application scaffold.

---

## 37. The Main File Should Remain an Entry Point

The main module file is important, but it should not become a dumping ground.

For example:

    myapp.js

should naturally contain things such as:

- module construction;
- initialization;
- Saito lifecycle hooks;
- application-level state;
- transaction handling;
- peer communication;
- integration with Saito APIs;
- the entry point into rendering.

Complex UI implementation should move into UI components.

Complex database logic can move into `lib/database.js`.

Complex transaction construction/processing can move into `lib/transactions.js`.

Complex P2SH functionality can move into `lib/P2SH.js`.

The exact division should follow the application's semantics.

The objective is not to maximize the number of files.

The objective is to prevent unrelated responsibilities from accumulating in one file once the application becomes complex enough to justify separation.

---

## 38. A Useful Mental Model

A Saito application's directory structure can be understood as a set of optional capabilities.

The main file is the application entry point:

    myapp.js

`lib/` is application source organization:

    lib/
        database.js
        transactions.js

`lib/ui/` is application UI organization:

    lib/ui/
        main.js
        main.template.js

`web/` is static application web content:

    web/
        css/
        img/

`sql/` is source SQL for a Node-side application database:

    sql/
        records.sql

`src/` is specialized application source or generation material:

    src/

It is not a required hierarchy.

It is a vocabulary.

An AI should select from that vocabulary according to the application it is building.

---

## 39. AI Rules for Module Structure

When modifying or creating a Saito application:

1. Treat a Saito module as a complete Saito application, not as a small plugin by default.

2. Start with the smallest valid structure.

3. Normally use:

       <slug>/<slug>.js

   as the module entry file.

4. Register the entry file in `node/config/modules.config.js`.

5. Do not assume that every directory under `node/mods/` is loaded.

6. Do not create `mod.js` as a generic Saito convention.

7. Do not create `frontend/` and `backend/` directories.

8. Use the same source tree for Node and browser functionality.

9. Put substantial application source under `lib/` when separation improves clarity.

10. Put substantial UI components under `lib/ui/`.

11. Put UI overlays under `lib/ui/overlays/` when appropriate.

12. Keep complex UI out of the main module file. `render()` should serve as an entry point into the UI rather than becoming the implementation of the entire UI.

13. Keep HTML templates with their associated components when that improves clarity.

14. Put application CSS under `web/css/`.

15. Expect the compile process to produce `web/style.css`.

16. Give substantial UI components appropriately separated CSS source files.

17. Put application static assets under `web/`.

18. Reference application web resources through the module slug.

19. Use `sql/` only when the application actually requires a Node-side SQLite database.

20. Put SQL source in `sql/*.sql`, not runtime `.sq3` files.

21. Understand that the runtime database is normally stored as:

       node/data/<dbname>.sq3

22. Check the compile configuration when database persistence across server resets matters.

23. Do not create a browser-storage directory to represent IndexedDB or other browser persistence.

24. Do not create a module-level `package.json` unless there is a specific reason.

25. Do not create controllers, repositories, services, routes, models, or middleware directories merely because another ecosystem commonly uses them.

26. Do not add tests merely because the application could have tests. If tests are needed, keep them in an appropriate development-only location and do not accidentally compile them into the distributed application.

27. Do not add `src/` unless the application has a genuine source-generation or specialized compilation requirement.

28. Treat game-specific directory structures as game-specific rather than universal Saito conventions.

29. Treat old `appspace` structures, React experiments, and other unusual repository structures as historical or specialized unless the current application specifically requires them.

30. Do not copy the complete directory tree of a large Saito application into a small application.

31. Before creating any file or directory, be able to answer:

       What responsibility does this file or directory have?
       Does this application actually need that responsibility?

32. Prefer the simplest structure that correctly expresses the application.

---

## 40. The Core Principle

Saito's module structure is intentionally simple.

A module can be one file:

    myapp/
        myapp.js

or it can grow into a substantial application:

    myapp/
        myapp.js
        lib/
            database.js
            transactions.js
            ui/
                main.js
                main.template.js
                overlays/
        sql/
            records.sql
        web/
            css/
                myapp-base.css
                myapp-dashboard.css
                myapp-overlay.css
            img/

The second structure is not "more Saito."

It is simply the first structure plus the capabilities that the application actually requires.

The AI should therefore not begin by asking:

> What directories does a Saito module normally have?

It should ask:

> What does this application need to do, and which Saito conventions correspond to those responsibilities?

That distinction is fundamental.

The directory structure is intended to guide the AI toward Saito's architecture, not to force every application into the same template.

The correct Saito application is the smallest structure that clearly expresses the application's responsibilities while using Saito's native module, lifecycle, UI, storage, database, build, and runtime conventions.

