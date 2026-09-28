# Saito Module Distribution and Runtime Installation

## Purpose

This document explains how Saito applications move from source code in a module directory to software that can actually be used by a browser or distributed to other users.

The important distinction is that Saito has more than one way to distribute an application.

A module begins as source code in a directory under `mods/`. From that same source, it can be:

- run on a Saito node directly;
- compiled into the browser's `saito.js` distribution;
- compiled into a standalone `.saito` dynamic module;
- distributed to users as a standalone application;
- distributed inside an NFT;
- distributed through a Vault or another application-specific access mechanism.

These are not interchangeable forms of distribution.

The correct distribution strategy depends on what the application does, what services it requires, whether it is open source or commercial, whether it needs secrets, and whether it needs a particular server-side environment.

The purpose of this document is to give an AI enough context to understand those choices and to help a developer move an application through the appropriate stages of development and distribution.

---

## 1. A Saito module starts as a directory

A Saito module is fundamentally a directory placed under the Saito `mods/` directory.

The directory contains the source code and other files needed by the application.

The module's directory structure determines what Saito can do with it. This is why module directory conventions matter: compilation, browser distribution, database creation, web serving, and other behavior are derived from the files that exist inside the module.

The normal starting point for development is therefore:

    mods/
      mymodule/
        mymodule.js
        web/
        lib/
        ...

The exact files should be kept to the minimum necessary for the application.

Do not begin by constructing a large generic application framework around the module. Start with the smallest coherent module that implements the requested behavior.

The module directory is the source from which the different Saito distributions are produced.

---

## 2. One source can produce several forms of distribution

The same module source can participate in several different distribution paths.

Conceptually:

    mods/<module>/
          |
          +--> Saito node module
          |
          +--> browser module compiled into saito.js
          |
          +--> standalone .saito dynamic module
          |
          +--> distributable application
                    |
                    +--> direct distribution
                    +--> NFT
                    +--> Vault
                    +--> other application-specific mechanism

These paths solve different problems.

A normal compiled module assumes that the application is part of the Saito distribution being served by the node.

A `.saito` dynamic module is intended to be independently distributed and installed by a browser.

A dynamic module can therefore be useful even when the connected server did not compile that module into its own `saito.js`.

That distinction is central to understanding Saito application distribution.

---

## 3. Normal modules and `modules.config.js`

Saito has a configuration describing the modules that belong to the different runtime distributions.

In particular, `modules.config.js` contains sets of modules for the core and lite/browser distributions.

When a module is included in the appropriate configuration, the compilation process can include it in the resulting Saito distribution.

For browser distribution, the modules selected for the lite distribution are compiled through Webpack into a single `saito.js`.

Conceptually:

    mods/
      mymodule/
        mymodule.js
        ...

              |
              v

    modules.config.js

              |
              v

          Webpack

              |
              v

          saito.js

The resulting `saito.js` is what a browser visiting that Saito server can receive and execute.

This means that successfully creating a module is not enough. A browser-facing module also has to survive the browser compilation process.

---

## 4. The first meaningful development milestone

For an AI developing a new application, the first goal should normally be to get the ordinary module working.

The basic progression is:

    1. Create the minimal module directory.
    2. Implement the module and its UI.
    3. Put the module under mods/.
    4. Configure the node so the module is included in the appropriate distribution.
    5. Compile Saito.
    6. Start the local node.
    7. Visit the node from a browser.
    8. Verify that the browser receives the compiled saito.js.
    9. Verify that the application actually runs.

This tests substantially more than merely executing the JavaScript on Node.

It tests whether the application can participate in the browser distribution that Saito actually provides to users.

An AI should therefore not assume that:

> "The module runs on the Node server, so the application is finished."

The browser compilation step is an important part of Saito application development.

---

## 5. Why the browser compilation matters

The browser does not normally receive every source file in `mods/`.

Instead, the configured browser modules are compiled into the browser distribution.

This has several consequences.

A file can be valid JavaScript for Node and still cause problems when Webpack processes the module.

A stray file in a module directory can therefore break compilation even if that file is not conceptually part of the application's runtime.

Minification and bundling can also expose problems that are not visible when executing individual source files.

Terser errors are one example of failures that can result from unexpected files entering the compilation process.

This is one reason the module directory conventions matter.

Directories such as `docs/` and, in some applications, `source/` are used for material that should not participate in the browser bundle.

The AI should inspect the repository's current compilation configuration rather than assuming that every directory has the same treatment in every version of Saito.

The general principle is:

> Keep executable module source separate from documentation, source material, tests, generated material, and other files that are not intended to enter the browser bundle.

---

## 6. A successful browser compilation is an important test

For ordinary application development, the AI should normally test the application in the following environment:

    module source
        ↓
    local Saito node
        ↓
    compiled browser distribution
        ↓
    browser visits local node
        ↓
    browser executes application

This is usually more important than immediately producing a `.saito` file.

If the user is simply developing an application, the AI should not automatically jump to dynamic-module distribution.

Dynamic compilation is a later distribution step.

---

## 7. What `saito.js` represents

The browser's `saito.js` is a compiled distribution of the modules selected for the browser/lite environment.

It is useful to think of it as an executable distribution rather than as the application's source code.

A server can provide a browser with a `saito.js` containing the modules it wants the browser to use.

However, the broader design direction is that users should not necessarily have to trust or use the exact JavaScript distribution supplied by a remote server.

Because the complete source can be compiled into JavaScript, a user can theoretically obtain or build their own browser distribution.

For example, a user could eventually:

- use the distribution supplied by the server;
- build a distribution themselves;
- load a distribution from another location;
- load a distribution from local storage or a local file.

The platform therefore has the potential to give users meaningful control over what executable software they load.

The current implementation does not necessarily provide a polished workflow for every one of these possibilities. The architectural principle is nevertheless important.

---

## 8. Dynamic `.saito` modules are different

A `.saito` dynamic module is not simply another copy of a normal module.

It exists because the browser compilation environment has limitations around third-party applications and the Saito WASM dependencies they require.

A dynamically distributed application therefore needs to carry the dependencies it needs with it.

A `.saito` dynamic module is consequently much more self-contained than an ordinary module compiled into the main `saito.js`.

Conceptually:

    ordinary browser module

        application code
              +
        dependencies supplied by
        the main Saito distribution


    .saito dynamic module

        application code
              +
        Saito dependencies
              +
        required binary/WASM material
              +
        compiled application bundle

The dynamic module can therefore contain a substantial amount of code that would otherwise already exist in the main Saito distribution.

This is why `.saito` applications can be relatively large. A dynamic application can be around 10 MB or more depending on what it contains.

This size is not necessarily evidence of a poorly designed application. It is partly a consequence of the self-contained distribution model.

---

## 9. Why dynamic modules carry their dependencies

An application may need to know about Saito objects such as transactions, wallets, blockchain state, cryptographic functionality, or WASM-backed functionality.

When the application is compiled into the main `saito.js`, those dependencies can be provided by the main bundle.

A standalone dynamic module cannot assume that those exact components exist in the same compiled bundle.

The dynamic module therefore carries the dependencies required to execute itself.

The important distinction is:

    main saito.js
        → shared compiled environment

    .saito module
        → independently distributable compiled environment

An AI should not attempt to "simplify" a `.saito` module by removing dependencies merely because equivalent-looking dependencies already exist in the browser's main Saito distribution.

The reason for the duplication is precisely to make the dynamic module independently loadable.

---

## 10. Installing a dynamic module

A dynamic module can be distributed as a standalone `.saito` file.

A typical user-facing installation flow is:

    receive .saito file
          ↓
    drag and drop into Saito
          ↓
    browser stores the application
          ↓
    application appears among installed modules
          ↓
    user enables it
          ↓
    browser refresh
          ↓
    application initializes

Dynamic modules can also be obtained through other application mechanisms.

For example, an NFT can contain or provide access to a `.saito` application. A Vault can provide an application to a user who possesses an appropriate access key.

The `.saito` file is therefore the executable distribution format; the NFT, Vault, Store, or other application can be the mechanism by which the user obtains it.

---

## 11. Installed and active are separate states

The browser's module configuration distinguishes between whether a module is installed and whether it is active.

The Admin interface exposes module information including states such as:

- Installed
- Active

A module can therefore exist on the user's machine without being active.

If the user disables a module, Saito should not initialize and run that module.

This distinction is important because installing executable software and choosing to execute it are different user actions.

An AI should preserve this distinction rather than treating installation as automatic activation.

---

## 12. Enabling an application does not automatically restart the browser

When a user enables a dynamic application, Saito does not immediately restart the browser and execute the newly installed code.

Instead, the user is told that the application will start the next time the browser is refreshed.

This is deliberate.

A Saito application can potentially:

- make blockchain transactions;
- access the user's wallet;
- use the user's private key when the application requires wallet functionality;
- communicate with other Saito services;
- modify the user's local application environment.

Automatically restarting and immediately executing newly installed executable software would therefore remove an important point of user control.

The intended interaction is deliberately simple but explicit:

    install
       ↓
    enable
       ↓
    user knows the application will run
       ↓
    refresh
       ↓
    application starts

This is an example of an important Saito UX/security philosophy:

> Powerful operations should remain easy to perform, but the platform should preserve small, explicit points at which the user understands that a consequential action is about to occur.

Do not "improve" this behavior by automatically restarting the application after a dynamic module is enabled.

---

## 13. Dynamic installation does not guarantee application functionality

Successfully installing a `.saito` module only establishes that the executable application can be loaded.

It does not guarantee that the Saito node to which the browser is connected provides the services the application needs.

This distinction is extremely important.

Consider an application that:

- sends `handlePeerTransaction` requests;
- expects a server-side SQL database;
- uses a module service;
- retrieves application-specific HTML or assets from a server;
- expects a particular peer service;
- relies on an Archive;
- expects another Saito module to be present;
- uses a particular server API.

A user can install the `.saito` file successfully, but the connected server may not provide those capabilities.

The result is:

    application code
        ✓ installed

    application executable
        ✓ loaded

    required network/service environment
        ? may or may not exist

Therefore:

> Code distribution and application-service availability are separate problems.

This is one of the most important things an AI needs to understand when helping build Saito applications.

---

## 14. Browser applications can depend on servers

Saito applications are not necessarily self-contained browser applications.

A browser application may use a Saito server to:

- receive requests;
- query a database;
- return application data;
- provide application-specific services;
- store or retrieve cached data;
- mediate access to external systems;
- perform operations requiring server-held credentials.

For example, a module may use a database and `handlePeerTransaction` to process requests from browsers.

In that case, distributing the browser portion of the application as a `.saito` file does not distribute the database.

Nor does it cause every Saito server to acquire the database.

The application must still connect to a server that provides the relevant service.

This is why an AI should determine the application's data and service architecture before deciding how it should be distributed.

---

## 15. The connected server can be part of the application's architecture

A useful Saito application may deliberately divide functionality between the browser and a server.

For example:

    Browser
       |
       | Saito transaction/request
       v
    Server module
       |
       +--> database
       |
       +--> external API
       |
       +--> server-held credentials
       |
       +--> application logic

The browser may contain the user interface and client-side logic while the server provides data or privileged services.

The server can process requests in `handlePeerTransaction()` and decide whether and how to execute them.

This is not inherently a failure of decentralization.

It is an application architecture decision.

Saito provides the communication and identity/transaction infrastructure; the application determines what services it needs and where those services should live.

---

## 16. Server-held secrets should not be distributed to browsers

A dynamic module is executable code.

Anything placed in the browser should therefore be treated as accessible to the user.

Do not put confidential API keys, server credentials, or other secrets into a `.saito` module merely because the application needs them.

If an application requires a secret API key, a common architecture is:

    Browser
       |
       | request
       v
    Saito server
       |
       | uses secret API key
       v
    external service

The browser requests the operation through the application's Saito communication mechanism.

The server receives the request and can determine whether it is legitimate, authorized, moderated, rate-limited, or otherwise acceptable before using the protected credential.

This is one reason an application that appears to be "just a browser application" may actually require a server component.

---

## 17. `handlePeerTransaction()` can provide the server boundary

When an application uses Saito transaction-shaped communication, the server can receive application-specific requests through the module's transaction handling.

For example, a browser can send a transaction containing a request to an application service.

The server's module can receive that request in `handlePeerTransaction()` and decide what to do.

The server can apply application-specific logic such as:

- determining whether the request is well formed;
- checking the user's identity;
- checking permissions;
- applying moderation;
- deciding whether the requested operation is legitimate;
- accessing a database;
- using server-held credentials;
- returning application-specific data.

The exact design depends on the application.

Do not create a generic "API service layer" merely because the application has server functionality. Use the Saito module's existing communication mechanisms and put the logic in the appropriate semantic part of the module.

---

## 18. A dynamic module can use the node it connects to in different ways

A dynamic application does not have only one possible relationship with its host node.

It can operate as its own application, communicate with services provided by the connected node, or integrate with other modules already running in the browser.

For example, a dynamic module may use a slug that does not exist on the connected server.

If the browser requests that application's normal URL, the server may return the default Saito 404 page.

The dynamic module can potentially use that page as the canvas into which it installs its own interface.

This allows a dynamically installed application to have a user-facing entry point even when the server itself has no server-side module corresponding to that application.

The important distinction is:

    server knows application
        → server can provide application-specific route/service

    server does not know application
        → dynamic browser application may still provide its own UI

But the second case does not magically create server-side functionality.

---

## 19. Dynamic modules can integrate with other modules

A dynamically installed application may also interact with modules already running in the browser.

Saito's module architecture provides mechanisms such as `respondTo()` and `returnModule()` for module capabilities and direct module access.

A dynamic application may therefore be designed to extend or interact with an existing Saito application rather than operating as an isolated application.

For example, an application could discover whether another module is installed and browser-active, and then integrate with it.

Module lifecycle timing matters here.

A dependency that must exist before the application initializes should not be assumed to be available merely because the application has been installed.

If availability depends on peer/module state established after initialization, a later lifecycle point such as `onPeerServiceUp()` may be more appropriate.

The AI should inspect the actual module lifecycle and existing patterns rather than introducing a generic plugin-registration system.

---

## 20. Dynamic applications can modify or extend existing UI

A dynamically installed application can potentially:

- provide its own page;
- add UI to an existing Saito page;
- communicate with another module;
- respond to capabilities exposed by another module;
- modify the interface of another application when the architecture deliberately allows it.

For example, an application could determine that RedSquare is installed and browser-active and then provide additional functionality associated with RedSquare.

This is powerful and should be treated as an application architecture decision, not as an invitation to indiscriminately modify other modules.

The AI should first determine:

- which module owns the UI;
- what capability is being extended;
- whether the existing module exposes an appropriate interface;
- whether the integration should be direct or event-based;
- whether the integration should happen during initialization or after peer/module availability is established.

Avoid inventing a universal extension framework where the existing Saito module APIs already provide the necessary mechanism.

---

## 21. Dynamic modules are especially useful for independent distribution

The major benefit of `.saito` distribution is that the application does not have to be rebuilt into every server's main `saito.js`.

This makes several distribution models possible.

A developer can compile the application into a `.saito` file and provide that file directly to users.

The user can then install it locally.

The same file can potentially be distributed through another Saito application.

For example:

    Developer
       |
       | compile
       v
    application.saito
       |
       +--> direct download
       |
       +--> drag and drop
       |
       +--> NFT
       |
       +--> Vault
       |
       +--> other distribution mechanism

The dynamic module is therefore an executable application artifact.

---

## 22. NFT distribution

An application can be distributed through an NFT.

A typical development flow is:

    module source
        ↓
    working normal module
        ↓
    working browser compilation
        ↓
    compile .saito dynamic module
        ↓
    verify .saito installation
        ↓
    create NFT containing the application
        ↓
    distribute/sell NFT

The Saito NFT mechanism can therefore serve as a distribution mechanism for software.

For example, a user can go through the NFT interface, create a new NFT, select the Saito application functionality, and provide the compiled Saito application.

The resulting NFT can then be distributed through the Saito Store or another mechanism.

This creates an important connection between the NFT system and application distribution:

> The NFT can provide ownership or access to the application artifact; the `.saito` file is the executable distribution artifact.

The exact ownership, transfer, access, and scripting semantics belong in the NFT and P2SH documentation.

---

## 23. Vault-based distribution

An application does not have to be publicly distributed as an unencrypted NFT.

Another possible architecture is to put the application into a Vault and distribute access keys.

Conceptually:

    application.saito
          ↓
        Vault
          ↓
    access key / access NFT
          ↓
       authorized user
          ↓
    retrieve application
          ↓
    install .saito
          ↓
       run app

This can be useful when access should be controlled.

The application itself can remain protected until the user has the appropriate access.

The AI should understand this as one possible distribution architecture rather than treating NFTs as the only way to distribute applications.

---

## 24. Public applications, commercial applications, and protected applications

There is no single distribution model appropriate for every application.

For an open-source application, distributing the compiled `.saito` application publicly may be entirely appropriate.

For a free or freemium application, the application can also be publicly obtainable while access to particular services or features is controlled elsewhere.

For a commercial application, the developer may want to control who receives the executable.

Several approaches are possible:

- distribute the executable openly and monetize services;
- distribute the executable through an NFT purchase;
- provide the executable to holders of an access NFT;
- encrypt the application for particular keys;
- store the application in a Vault;
- distribute only an application shell while keeping sensitive functionality on a server.

The AI should select among these based on the user's actual requirements.

Do not assume that an NFT automatically provides software confidentiality.

---

## 25. Code published to the blockchain is not automatically secret

If executable application code is placed on a public blockchain in plaintext, users may be able to recover that code.

Publishing an application as an NFT therefore does not, by itself, prevent other users from obtaining and running the application.

This may be perfectly acceptable for open-source and freemium applications.

If confidentiality or access control is important, the application needs a different distribution architecture.

For example, the application could be encrypted for authorized keys and distributed only to those users.

Alternatively, the executable could remain inside a controlled Vault and users could receive access through an NFT or other access mechanism.

The AI should ask what the user actually wants to protect:

- the source code;
- the compiled executable;
- access to the application;
- access to a service;
- API credentials;
- application data;
- ownership rights.

These are different security problems and may require different architectures.

---

## 26. API keys and executable distribution

An application that requires an API key should not simply embed that key in a `.saito` file.

The browser is controlled by the user.

Therefore:

    secret API key
         ↓
    browser bundle

is generally not a secret.

Instead, if the application needs a protected external service, a server can hold the credential:

    .saito application
          |
          | request
          v
    Saito server module
          |
          | secret credential
          v
    external API

The server can use the Saito request as the boundary at which it evaluates whether the operation should be performed.

This is a normal application architecture and should be considered when planning distribution.

---

## 27. Development versus publication

The AI should distinguish between developing an application and publishing an application.

During development, the important question is:

> Does the application work correctly in the environment in which it is intended to run?

For most ordinary module development, this means:

    source module
        ↓
    local node
        ↓
    compile
        ↓
    browser
        ↓
    test

The developer does not normally need to produce a `.saito` file for every iteration.

The `.saito` compilation is primarily relevant when the application needs independent runtime distribution.

Therefore:

> Producing a `.saito` module should normally be a later step, after ordinary browser compilation and application testing succeed.

---

## 28. Recommended AI development progression

When asked to build a new Saito application, an AI should generally work through these stages.

### Stage 1: Build the minimal module

Create the smallest module directory needed for the application.

Use the established Saito module structure.

Implement the UI components and application logic in their appropriate semantic locations.

Do not add unnecessary framework layers, generic managers, services, or abstractions.

### Stage 2: Make the module run locally

Place the module under `mods/`.

Configure the local Saito node as necessary.

Start the local node and verify that the application can run.

### Stage 3: Compile the browser distribution

Add the module to the appropriate browser/lite configuration.

Run the repository's current compilation process.

Verify that compilation succeeds.

Then open the application in a browser against the local node.

### Stage 4: Test the browser application

Verify that:

- the application appears;
- its UI renders;
- its module lifecycle executes;
- its transactions work;
- its peer communication works;
- its database/service requests work if applicable;
- its assets load;
- its browser-specific dependencies work.

A module that only works when directly executed on Node has not yet passed this stage.

### Stage 5: Compile a `.saito` module when distribution requires it

Only after the ordinary application works should the AI normally compile a dynamic `.saito` module.

Verify that the dynamic compilation succeeds.

Then install the generated `.saito` file in a browser.

### Stage 6: Test independent installation

Verify:

    .saito file
        ↓
    installation
        ↓
    Installed = yes
        ↓
    Active = yes
        ↓
    browser refresh
        ↓
    application initializes

Then test whether the application actually functions against the intended server environment.

### Stage 7: Choose a distribution mechanism

Only after the dynamic module works should the AI help package it for a larger distribution strategy.

Depending on the user's goals, that could mean:

- direct distribution;
- NFT distribution;
- Saito Store publication;
- Vault-based access;
- encrypted distribution;
- server-backed commercial application;
- another application-specific mechanism.

---

## 29. Do not confuse compilation success with application success

There are several distinct tests.

A successful JavaScript compilation proves that the source can be bundled.

It does not prove that:

- the application initializes correctly;
- the browser UI works;
- the server provides the required services;
- the database exists;
- peer requests work;
- another module is available;
- a dynamic module can be installed;
- the application has an appropriate distribution model.

Likewise, successful `.saito` compilation proves that a standalone dynamic artifact can be produced.

It does not prove that the application will function against every Saito server.

The AI should therefore test each layer separately.

---

## 30. Module directory structure affects distribution

Because the module directory is the source for multiple compilation paths, unnecessary files can have consequences.

The AI should understand the difference between:

- runtime source;
- browser source;
- documentation;
- tests;
- generated files;
- source assets;
- server-only material;
- files intended to be excluded from Webpack.

A module should not become a dumping ground for unrelated files.

If a test or experimental file causes the browser compilation or minification process to fail, the correct response is normally to fix the module structure or compilation inclusion rather than to create increasingly complicated build exceptions.

The repository's actual Webpack configuration should be inspected before deciding which directories are excluded.

---

## 31. A module can be server-dependent or browser-independent

This distinction should be made early in application design.

A module may be largely self-contained:

    browser
       ↓
    application
       ↓
    local Saito functionality

Or it may require a specific server:

    browser
       ↓
    application
       ↓
    Saito request
       ↓
    application server
       ↓
    database / API / service

Or it may combine both:

    browser
       ↓
    local application functionality
       +
    remote Saito services
       +
    other installed modules

A `.saito` distribution does not eliminate these distinctions.

If an application requires a particular server-side module, distributing only the `.saito` browser application is insufficient.

The AI should identify server dependencies explicitly.

---

## 32. The absence of a server module can be intentional

A dynamic application does not necessarily need a server-side module.

For example, a dynamic application may provide its own UI and operate using functionality already available in the browser.

It can potentially use a route that the server does not recognize and install its UI into the browser's page.

It can also communicate with other modules that are already present.

This can make `.saito` applications unusually portable.

However, the AI should not assume that portability is automatic.

The application's actual dependencies determine how portable it is.

---

## 33. Dynamic applications and other Saito modules

When a dynamic application depends on another application, the AI should prefer existing Saito module mechanisms.

For example:

- `respondTo()` can expose a capability;
- `returnModule()` can provide direct access to a module when that dependency is genuinely appropriate;
- `onPeerServiceUp()` can be used when peer/service availability is the relevant lifecycle event;
- `app.connection` can provide asynchronous notifications when an event-oriented relationship is appropriate.

Do not invent a generic plugin registry simply because the application is dynamically installed.

The fact that a module is dynamically distributed does not require a new architectural layer.

---

## 34. User control is part of runtime security

Saito applications are deliberately powerful.

A module can potentially interact with:

- the user's wallet;
- private keys;
- blockchain transactions;
- local storage;
- other Saito modules;
- remote services.

The runtime installation process therefore deliberately includes explicit user actions.

Installation is one action.

Activation is another.

Refresh and execution are another.

This is not accidental friction.

It gives the user a clear boundary between:

> "I have obtained this executable application"

and:

> "I am allowing this application to execute in my Saito environment."

AI-generated UX should preserve this distinction.

Do not automatically execute newly installed applications merely because doing so appears more convenient.

---

## 35. Distribution should follow the user's requirements

When helping a user publish an application, the AI should first determine what the user is actually trying to accomplish.

Examples:

### Open-source application

A public `.saito` file may be sufficient.

### Free or freemium application

The executable can potentially be distributed publicly while premium functionality is provided through application services, NFTs, access rights, or another mechanism.

### Paid application

An NFT can represent the purchase or access right and can provide the user with the application.

### Restricted application

The application can be distributed through a Vault or encrypted for authorized keys.

### Application requiring secrets

Keep the secrets on a server and expose the required functionality through Saito application communication.

### Application requiring a specialized database

Provide the corresponding server-side module/service and distribute the browser application separately.

### Application intended to modify or extend an existing Saito application

Determine what module is being extended and use its available interfaces rather than assuming that independent browser distribution means independent functionality.

The correct answer depends on the application.

---

## 36. What an AI should inspect when helping with distribution

Before attempting dynamic compilation, an AI should inspect the repository's current implementation.

In particular, it should identify:

- the module's directory;
- its slug;
- its main module file;
- `modules.config.js`;
- the current Webpack configuration;
- the scripts that compile ordinary modules;
- the scripts that produce `.saito` modules;
- the dynamic-module installation code;
- the browser storage used for installed modules;
- the Admin module's module-management interface;
- the current module-loading code;
- any exclusions for `docs`, `source`, tests, or other directories;
- the application's server-side dependencies;
- any NFT code used to distribute Saito applications;
- any Vault mechanisms used to protect application files.

Do not guess the names or behavior of build scripts when the repository can be inspected directly.

This document describes the architectural model; the repository determines the current command syntax and implementation details.

---

## 37. What an AI should do when compilation fails

When ordinary compilation fails, first determine whether the failure is caused by the module itself or by the surrounding build environment.

Useful questions include:

- Did the module compile before this file was added?
- Did a new file enter the Webpack input?
- Is the file intended for Node rather than the browser?
- Is the file documentation or test material that should not be bundled?
- Is a dependency browser-compatible?
- Is the error coming from Webpack, Terser, WASM, or application initialization?
- Is the dynamic module compilation failing separately from ordinary browser compilation?

Do not immediately modify global build configuration to accommodate one module.

A module's directory structure and dependencies should be checked first.

---

## 38. The two major distribution environments

It is useful to think about Saito applications as operating in two broad environments.

### Compiled distribution

The application is included in the node's configured modules and compiled into the Saito browser distribution.

    module directory
        ↓
    modules.config.js
        ↓
    compile
        ↓
    saito.js
        ↓
    browser

This is the normal development and node-controlled distribution path.

### Dynamic distribution

The application is compiled into a standalone `.saito` artifact and installed independently by the browser.

    module directory
        ↓
    dynamic compilation
        ↓
    application.saito
        ↓
    browser installation
        ↓
    installed module
        ↓
    user activates
        ↓
    browser refresh
        ↓
    application runs

These environments can use the same application source but have different distribution characteristics.

---

## 39. The important architectural distinction

The most important thing for an AI to understand is that Saito separates:

1. application source;
2. application compilation;
3. browser distribution;
4. executable dynamic distribution;
5. server-side services;
6. user authorization to execute the application.

These are related but distinct concerns.

A `.saito` file answers:

> "How can this executable application be distributed and loaded?"

It does not answer:

> "Where does this application's database live?"

It does not answer:

> "Which server provides its services?"

It does not answer:

> "Who is authorized to use it?"

It does not answer:

> "Where are its secrets?"

It does not answer:

> "What other Saito modules must be installed?"

Those questions belong to application architecture and distribution design.

---

## 40. AI rules

When developing or distributing a Saito application, an AI should follow these rules.

1. Start with the module directory under `mods/`.

2. Keep the initial module structure minimal.

3. Get the normal module working before attempting dynamic distribution.

4. Compile the browser distribution and test the application through a browser visiting the local Saito node.

5. Treat browser compilation as a real application test, not merely a packaging step.

6. Inspect the repository's Webpack configuration and excluded directories before adding files such as tests, documentation, generated files, or experiments.

7. Do not assume that Node-compatible code is browser-compatible.

8. Do not compile a `.saito` merely because the user asked for a module. Determine whether independent distribution is actually needed.

9. When `.saito` distribution is required, compile it only after ordinary browser development works.

10. Test the generated `.saito` by actually installing it in a browser.

11. Remember that an installed dynamic module is not automatically active.

12. Do not automatically restart or refresh the browser after enabling a dynamic module.

13. Preserve the explicit user action before executable code begins running.

14. Do not assume that a dynamic module's successful installation means the connected server provides its required services.

15. Identify server-side dependencies explicitly.

16. Do not put secret API keys or server credentials into browser-distributed application code.

17. Use server-side modules and Saito transaction communication when protected credentials or server-only services are required.

18. Understand that plaintext executable code distributed publicly can potentially be recovered and run by others.

19. Choose NFT, Vault, encryption, server-side services, or other distribution mechanisms according to the user's actual requirements.

20. Do not treat NFTs as a universal software licensing mechanism.

21. Do not invent a generic dynamic-module framework when existing Saito module APIs already provide the necessary integration.

22. When extending another application, identify the module that owns the relevant capability and use its existing interfaces.

23. Inspect the current repository scripts before giving exact build commands.

24. Distinguish compilation problems from runtime problems and service-availability problems.

25. Remember that the same module source can produce multiple distributions with different dependencies and security properties.

---

## 41. Practical mental model

When an AI is asked:

> "Build me a Saito application."

the initial question should not be:

> "How do I create a `.saito` file?"

The initial question should be:

> "What kind of Saito application is this, and where does its functionality need to run?"

Then work outward:

    What does the application do?
              ↓
    What belongs in the module?
              ↓
    What must run in the browser?
              ↓
    What must run on a Saito server?
              ↓
    What data/services does it require?
              ↓
    Can the ordinary module compile?
              ↓
    Does the browser distribution work?
              ↓
    Does independent .saito distribution make sense?
              ↓
    How should users obtain it?
              ↓
    Does it need NFT/Vault/encryption/access control?
              ↓
    What explicit user action should activate it?

This is the intended development and distribution progression.

The goal is not merely to produce a file that compiles.

The goal is to produce an application that can be developed, tested, distributed, installed, and operated in the environment for which it was actually designed.
