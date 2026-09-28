
# Saito Development: Build, Installation, and Configuration

This document explains how to develop Saito applications locally, how the Saito runtime and browser bundle are built, how local blockchain state is established, and when Rust/WASM development is actually required.

The intended audience is a developer — or an AI coding agent assisting a developer — working on a Saito application or module.

The most important principle is:

> Ordinary Saito application development should be possible without requiring the developer to modify or rebuild Saito Core.

Saito contains both a JavaScript application/runtime environment and a Rust/WASM core implementation. They are related, but they are not the same development task.

---

## 1. The normal Saito application-development environment

A developer building an ordinary Saito application normally works from:

    saito/
        node/
            mods/
            lib/
            config/
            scripts/
            ...

The `node/` directory contains the JavaScript Saito runtime, module system, browser build, web server, and application environment.

For ordinary application development, the normal workflow is:

    clone the repository
        ↓
    install Node dependencies
        ↓
    compile Saito
        ↓
    start the local node
        ↓
    open the browser
        ↓
    use the Admin module to configure the local node

The developer should not normally need to understand or modify the Rust implementation merely to build an application.

The repository's public installation documentation also separates ordinary Node development from full-stack Rust/WASM development. :contentReference[oaicite:2]{index=2}

---

## 2. Getting the repository

A normal development checkout begins by cloning the Saito repository.

From the repository:

    cd saito/node
    npm install

`npm install` installs the Node-side dependencies, including the packaged Saito JavaScript/WASM dependencies used by the Node runtime.

The normal application developer should not manually build the Rust implementation just because they are developing a module.

If the task is ordinary module development, begin with the Node environment.

---

## 3. Start with the local development node

After installing dependencies, compile Saito and start the Node server.

The exact command used to compile may depend on the development task. The important conceptual sequence is:

    compile
        ↓
    start server
        ↓
    browser

Compilation prepares the browser-side Saito bundle.

Starting the server runs the Node-side Saito application.

These are separate operations.

Do not assume that starting the server automatically recompiles the browser bundle.

Likewise, do not assume that changing browser-side JavaScript automatically changes the code already compiled into the browser bundle.

---

## 4. Use the Admin module to configure the node

The intended human-development workflow is to get the software running first and then use the Saito Admin module to configure the node.

This is important.

Saito has many configuration files and command-line options. Developers should not normally be forced to understand all of them merely to begin application development.

The Admin module is intended to help configure the running node for different purposes, including:

- local development;
- running a node against the live network;
- network configuration;
- other node-level settings.

The configuration files remain important to understand when an application or development task actually requires them, but they should not be treated as the first interface through which every developer must configure Saito.

An AI assisting a developer should prefer the normal Admin workflow when the task can be accomplished through Admin rather than immediately instructing the developer to edit configuration files manually.

---

## 5. Local development versus live-network operation

There are two important operating targets:

    local development blockchain

and:

    live Saito network

These are not different "levels" of development. They are different targets.

A developer working on an application that needs to create transactions, NFTs, test confirmations, test block production, or otherwise exercise blockchain behavior will generally want a local blockchain.

A live-network node is appropriate when the developer actually intends to participate in the production network.

Do not treat the live network as the default development environment.

For application development, a local blockchain provides important capabilities that are difficult or impossible to reproduce safely on the live network.

---

## 6. Why local blockchain state matters

A local development blockchain can begin from the genesis state.

This is useful because the local chain can be initialized with the development issuance configuration.

The issuance information is stored under the repository's data/issuance configuration.

When the local blockchain starts from the beginning, the development issuance can provide SAITO to designated addresses.

This means a developer can have private keys corresponding to accounts that already contain development tokens.

Those accounts can then be imported into the browser wallet and used to test applications.

This is particularly useful for applications involving:

- payments;
- NFTs;
- staking;
- block production;
- transaction confirmation;
- applications that require a funded account.

An AI should understand that a local test account having no SAITO is often not an application bug. The local chain may simply need to be reset to its development genesis state or the appropriate development key imported.

---

## 7. `nuke local` and local blockchain reset

Saito contains several reset and setup commands.

These commands are not interchangeable.

In particular, local development can use a reset that returns the local blockchain to its development starting state while preserving the appropriate local configuration/wallet state.

The developer may therefore intentionally reset the blockchain during application development.

This is useful when testing behavior from a clean chain:

    reset local chain
        ↓
    start from development genesis
        ↓
    receive development issuance
        ↓
    import/use the corresponding development wallet
        ↓
    test application

Do not assume that resetting the blockchain is inherently a mistake.

For local blockchain application development, resetting the chain can be exactly the desired operation.

However, an AI must understand what a particular reset command destroys before recommending it.

The distinction is:

    intentional local blockchain reset

versus:

    destructive reset of the developer's entire environment

Do not recommend a generic destructive reset simply because an application failed to compile or load.

---

## 8. Development tokens and issuance

Local development often depends on the development issuance configuration.

The developer should know which private keys receive the development SAITO allocation.

Those keys are useful for testing applications locally.

For example:

    local genesis
        ↓
    development issuance
        ↓
    funded development address
        ↓
    import private key into browser
        ↓
    application can spend/test SAITO

The developer may need to import one of these private keys into the browser wallet when testing.

This is especially important when an application creates transactions, NFTs, or other blockchain objects.

The live network does not provide this development issuance mechanism.

---

## 9. Block production during local development

Applications that interact with the blockchain generally need blocks to be produced.

A local development environment can therefore be configured to produce blocks without requiring the developer to participate in the live network's staking/production environment.

The exact production/staking configuration is part of node configuration and may be controlled through Admin or configuration state.

The important distinction is:

    local development

does not need to reproduce every economic/security condition of the production network merely to let an application test transactions.

If an application specifically tests block production, staking, routing, or consensus behavior, those requirements become part of the application's test environment.

Do not unnecessarily impose live-network block-production requirements on ordinary application development.

---

## 10. What `compile` actually does

Compilation has two important roles.

First, it prepares browser-side JavaScript.

Second, it packages the modules that have been selected for browser distribution into the browser-side Saito bundle.

This means that adding a module to:

    node/mods/

does not by itself make that module available to browsers.

The Node process can discover and load a module from the module directory.

The browser cannot simply execute arbitrary files sitting in the server's `mods/` directory.

The browser receives the compiled client bundle.

The basic relationship is:

    mods/
        ↓
    module configuration
        ↓
    compile
        ↓
    browser bundle
        ↓
    browser client

This distinction is fundamental to Saito development.

---

## 11. `modules.config.js`

The module configuration determines which modules are available in different parts of the Saito runtime and which modules are included in the browser distribution.

The configuration has historically distinguished between:

    core

and:

    lite

The exact current configuration should always be inspected in:

    node/config/modules.config.js

Do not rely on a remembered example if the current repository differs.

Conceptually:

    core
        modules available to the Node/server runtime

    lite
        modules compiled for browser/lite clients

A module that exists only in `mods/` is not automatically available to browsers.

A module that needs to be part of the browser application must be included in the appropriate browser compilation configuration.

---

## 12. Why compilation can fail because of files inside a module

This is particularly important for AI coding agents.

A module directory is not simply a collection of arbitrary Node files.

Some files can be encountered by the compilation process even when they are not explicitly imported by the application's normal runtime path.

The browser bundle is built using Webpack and browser-compatible code.

A file that is perfectly valid for Node.js can nevertheless cause browser compilation to fail if the bundler encounters a construct that is not supported in the browser build.

For example, a development test file or auxiliary script may use Node-specific functionality such as:

    assert

or other Node-only dependencies.

That file may appear harmless because the application itself never imports it directly.

But if the compilation process encounters it, it can break the browser bundle.

Therefore:

> Do not put arbitrary development files inside a module directory without understanding how the Saito compilation process discovers and handles them.

This is one reason Saito modules have conventional directory structures.

It is also one reason tests and auxiliary development artifacts need to be placed carefully.

---

## 13. Dynamic `.saito` modules

Saito also supports dynamically distributed applications in `.saito` form.

A `.saito` module is an application package that can be distributed and installed dynamically rather than being manually placed into the repository's `mods/` directory.

This is distinct from ordinary source development.

During source development:

    mods/<module>/
        ↓
    Node can load module
        ↓
    module configuration
        ↓
    compile
        ↓
    browser receives compiled application

For dynamic distribution:

    compiled .saito application
        ↓
    installation
        ↓
    local browser/module storage
        ↓
    application becomes available dynamically

An AI working on a normal module should not confuse these two mechanisms.

The module source directory is the development environment.

The `.saito` package is a distribution/install mechanism.

---

## 14. Source files versus generated files

Saito generates browser/build artifacts.

Developers should normally modify source files rather than generated output.

For example, module CSS source lives under:

    mods/<module>/web/css/

while the compiled module stylesheet may be generated as:

    mods/<module>/web/style.css

Likewise, the main Saito browser bundle is generated by the compilation process.

The general rule is:

    source
        ↓
    compile
        ↓
    generated artifact

If a generated file contains something that needs to change, find the source file and change that instead.

An AI should not edit generated artifacts merely because they are easier to find.

---

## 15. Browser JavaScript compilation

When a module's browser-side JavaScript changes, the browser must receive an updated compiled bundle.

The normal conceptual workflow is:

    modify module
        ↓
    compile
        ↓
    reload browser

Starting the Node server is not a substitute for compiling the browser bundle.

An AI should inspect the current package scripts before deciding exactly which compile command to run.

Do not invent a Webpack watch or hot-reload workflow that does not exist.

---

## 16. Development compilation

Saito's compile commands can accept a development flag.

The repository's current documentation describes the development flag as producing non-minified JavaScript with source maps and linking CSS source files rather than concatenating them. :contentReference[oaicite:3]{index=3}

This is useful for browser debugging.

The conceptual distinction is:

    normal compile
        → production-oriented browser bundle

    development compile
        → easier browser debugging
        → source maps
        → unminified JavaScript
        → development-friendly CSS loading

The exact behavior should be confirmed against the current compile script rather than assumed from older documentation.

Do not make `compile dev` a mandatory requirement for every application developer.

Use it when the developer benefits from the development build.

---

## 17. CSS compilation

Saito module CSS is source code.

Typical source structure:

    mods/<module>/web/css/
        component.css
        base.css
        ...

The compilation process produces the browser-facing stylesheet.

Do not edit generated stylesheet output directly.

When developing CSS, inspect the current compile behavior to determine whether the development build or normal build is appropriate.

The important rule for an AI is:

> Edit CSS source; let the Saito build system generate the browser-facing CSS.

---

## 18. Node-side module code versus browser-side module code

A Saito module can contain code that executes in different environments.

Some code runs in the Node/server environment.

Some code runs in the browser.

Some module code is compiled into the browser bundle.

This distinction matters when writing code.

A Node-compatible dependency is not automatically browser-compatible.

Likewise, a file that can be required by Node may still break the browser bundle if Webpack encounters unsupported dependencies.

When adding a dependency or file, an AI should ask:

    Is this code executed by Node?
    Is this code compiled for the browser?
    Is this dependency browser-compatible?

Do not assume that "Node.js supports it" means "the Saito browser bundle supports it."

---

## 19. The Node/npm Saito dependency

Normal module development generally uses the Saito JavaScript/WASM implementation supplied through the Node package environment.

This is the simplest development path.

A developer does not need to build Rust merely because a Saito application uses Saito's WASM functionality.

The normal relationship is:

    application
        ↓
    Saito JavaScript runtime
        ↓
    packaged Saito WASM/core dependency

The developer only needs to rebuild and locally link the Rust/WASM packages when the development task actually modifies those packages.

---

## 20. When Rust/WASM development is required

Rust/WASM development becomes relevant when the developer is modifying Saito Core or the Rust/WASM implementation itself.

Examples include work involving:

- consensus;
- core blockchain behavior;
- Rust routing;
- Saito WASM;
- native Rust node behavior;
- changes that must be reflected in the underlying Rust implementation.

The development path then becomes substantially different.

Conceptually:

    rust/
        saito-core
        saito-wasm
        saito-js
        ...

Changes to these packages must be built before the Node application can use the new implementation.

---

## 21. Local Rust/WASM linking

When developing against locally modified Rust/WASM code, the local packages must be built and linked into the Node environment.

The repository contains scripts and package-level commands for this purpose.

The important dependency chain is:

    Rust source
        ↓
    saito-wasm
        ↓
    saito-js
        ↓
    Node's saito-js dependency
        ↓
    browser/server compilation

If the Rust source changes but the local WASM and JavaScript packages have not been rebuilt, the Node application is still using the previous implementation.

Similarly, changing the local package is not enough if the Node project is still linked against the published package.

The repository's installation documentation describes the local-link workflow for full-stack development. :contentReference[oaicite:4]{index=4}

When working on Rust/WASM, inspect the current scripts:

    rust/scripts/
    rust/saito-wasm/
    rust/saito-js/
    node/

and use the repository's current linking/build process.

Do not rely on an old command copied from a historical README if the current package scripts provide a different workflow.

---

## 22. Application development does not imply Rust development

An AI should not unnecessarily move an application developer into the Rust development workflow.

If the developer says:

    "I want to build a Saito application."

the default assumption should be:

    Node/module development.

If the developer says:

    "I need to modify Saito consensus."

or:

    "I changed the Rust WASM implementation."

then the Rust/WASM workflow becomes relevant.

The existence of Rust inside the Saito repository does not make Rust a prerequisite for application development.

---

## 23. Configuration files

Saito has configuration files that can be edited directly.

Important configuration includes:

    node/config/modules.config.js

and the node's options/configuration files.

The configuration documentation describes `modules.config.js` as controlling which modules run on the server and which modules are compiled for lite clients. It describes the options configuration as controlling node settings such as network configuration and wallet information. :contentReference[oaicite:5]{index=5}

These files are important when the developer actually needs to configure them.

However:

> Do not make manual configuration-file editing the default workflow when an existing Saito application or Admin interface already provides the required configuration.

The purpose of the development handbook is to let developers get productive without requiring them to understand every low-level configuration mechanism.

---

## 24. The repository is a living system

Saito's build system has accumulated commands and modes for different historical and technical requirements.

Not every `npm run` command is part of the normal application-development workflow.

Some commands exist for:

- legacy workflows;
- special development cases;
- package publishing;
- resets;
- testing;
- Rust development;
- production deployment;
- specific debugging situations.

An AI should not interpret every command in `package.json` as a recommended workflow.

Instead:

1. Understand what the developer is trying to do.
2. Identify which environment is involved.
3. Inspect the current script.
4. Use the smallest existing command that accomplishes the task.

Do not introduce a new build system merely because the existing one is unusual.

Do not replace Saito's build process with a conventional Webpack/Vite/etc. workflow unless the project explicitly requires it.

---

## 25. Do not assume conventional Node conventions apply to the browser bundle

This is an important AI-specific warning.

An AI may know that a particular Node.js technique is valid and therefore use it in a Saito module.

That is not sufficient.

The module may subsequently be compiled into the browser bundle.

Therefore the relevant question is not:

    "Does Node support this?"

It is:

    "Does the environment in which this module will actually execute support this?"

and, for browser code:

    "Can Webpack compile this dependency into the Saito browser bundle?"

This distinction should be checked whenever adding:

- dependencies;
- test libraries;
- Node-specific modules;
- filesystem access;
- native modules;
- assertions;
- server-only utilities;
- development scripts.

---

## 26. Module files are part of the build environment

Do not assume that files inside a module directory are invisible merely because the application does not explicitly import them.

The compile system has its own discovery and bundling behavior.

A file that should not participate in browser compilation should not simply be placed inside the module and assumed to be ignored.

Use the repository's established directory conventions.

If a module needs:

- tests;
- development scripts;
- documentation;
- fixtures;
- build artifacts;

determine where those files can safely live before adding them.

This is particularly important for AI-generated code, because an AI may create additional helper files that appear harmless but affect compilation.

---

## 27. Admin is the normal configuration interface for humans

The desired human workflow is intentionally higher-level than the underlying implementation.

A developer should generally be able to:

    install repository
        ↓
    compile/start Saito
        ↓
    open browser
        ↓
    open Admin
        ↓
    configure local development node

rather than beginning with:

    edit options.conf
    edit modules.config.js
    edit issuance files
    manually configure peers
    manually configure wallet
    manually configure ports

Those lower-level mechanisms remain important for development and troubleshooting, but they should not be the default onboarding path.

An AI should similarly prefer the application's existing configuration mechanisms before asking the user to edit low-level configuration files.

---

## 28. Local development is intentionally different from production

A local development node can be configured to make development convenient.

For example, it may:

- start from a clean local blockchain;
- use development issuance;
- use development accounts;
- produce blocks locally;
- use a configuration that would not be appropriate on the live network.

This is not an approximation of production. It is a development environment.

The developer should be able to test application behavior without acquiring production SAITO or configuring a production node.

When an application specifically needs to test production behavior, production-network development becomes a different task.

---

## 29. What an AI should do before changing the build environment

When assisting with Saito development, an AI should first determine:

    Is this an application/module change?
    Is this Node-side code?
    Is this browser-side code?
    Is this CSS?
    Is this configuration?
    Is this Rust/WASM?
    Does the change need a new browser compilation?
    Does it need a local blockchain reset?
    Does it need a new Rust/WASM build?

Then use the existing repository mechanisms.

For ordinary module development, the default path is:

    node/
        ↓
    mods/
        ↓
    compile
        ↓
    start/restart Node
        ↓
    browser

For Rust/WASM development:

    rust source
        ↓
    rebuild/link WASM
        ↓
    rebuild/link saito-js
        ↓
    Node compilation
        ↓
    browser/server

Do not mix these workflows unnecessarily.

---

## 30. Build troubleshooting for AI agents

The AI should first inspect the repository's current scripts and source before inventing a solution.

Useful questions include:

### The browser does not show my module

Check:

- Is the module included in the relevant module configuration?
- Was the browser bundle compiled after the change?
- Is the module's directory structure correct?
- Is the module's entry file named correctly?
- Is the Node server serving the current compiled bundle?

### The Node server sees the module but the browser does not

This often means the module is available to the Node runtime but has not been included in the browser compilation configuration.

Inspect:

    node/config/modules.config.js

and the compile process.

### Compilation fails after adding a seemingly unrelated file

Inspect the files recently added to the module.

Consider whether Webpack is encountering:

- Node-only dependencies;
- unsupported modules;
- test libraries;
- assertions;
- native modules;
- server-only code.

Do not assume that the file is irrelevant simply because it is not imported by the application's main module.

### Browser behavior does not change after editing JavaScript

Check whether the browser bundle was recompiled.

Starting the Node server is not equivalent to recompiling browser JavaScript.

### Rust changes do not appear in the application

Check whether:

- `saito-wasm` was rebuilt;
- `saito-js` was rebuilt;
- the local packages are linked;
- Node is using the local package rather than the published package;
- the browser bundle was recompiled.

---

## 31. The build model an AI should remember

The essential model is:

    Source module
        ↓
    Node runtime
        ↓
    module configuration
        ↓
    browser compilation
        ↓
    Saito browser bundle
        ↓
    browser client

And, when Rust is being modified:

    Rust source
        ↓
    saito-wasm
        ↓
    saito-js
        ↓
    Node dependency
        ↓
    Saito browser/server compilation

A module being present on disk is not the same thing as a module being available to the browser.

A Rust source change is not the same thing as a changed Node dependency.

A running Node server is not the same thing as a freshly compiled browser bundle.

These distinctions explain most of the build behavior an application developer needs to understand.

---

## 32. Recommended AI behavior

When developing an application, an AI should:

- Work inside the module/application repository unless the task explicitly requires changes elsewhere.
- Treat `node/` as the normal development environment for Saito applications.
- Use the existing Saito build and startup scripts.
- Inspect current scripts before inventing commands.
- Understand whether a change affects Node, browser code, CSS, configuration, or Rust/WASM.
- Recompile browser code when browser-side source changes require it.
- Edit source CSS rather than generated CSS.
- Treat `modules.config.js` as part of the browser/server distribution mechanism.
- Remember that files inside module directories can affect compilation.
- Avoid adding Node-only dependencies to code that will be bundled for browsers.
- Use a local development blockchain when testing blockchain-dependent applications.
- Use development issuance/accounts when testing applications that require SAITO.
- Reset the local blockchain when a clean development chain is actually useful.
- Use Admin for normal node configuration where possible.
- Inspect the current implementation rather than trusting stale documentation.
- Use the Rust/WASM workflow only when the task actually requires changes to Rust/WASM.
- Preserve the repository's existing build architecture.

An AI should not:

- Require Rust for ordinary module development.
- Assume every `npm run` command is a normal developer command.
- Run destructive reset commands merely because something failed.
- Edit generated browser bundles directly.
- Edit generated CSS directly.
- Assume Node-compatible code is browser-compatible.
- Assume adding a module to `mods/` automatically makes it available to browsers.
- Assume starting the server recompiles browser code.
- Introduce a conventional Webpack/Vite build system to replace Saito's existing compilation process.
- Ask the developer to manually configure low-level files when the Admin module already provides the necessary interface.
- Treat stale README instructions as more authoritative than the current scripts and configuration.

---

## 33. Current versus historical documentation

Saito's repository and wiki contain documentation written at different points in the project's development.

The current codebase contains historical commands and workflows that remain useful in particular circumstances.

The existence of a command does not mean that it is the preferred workflow for a new application developer.

When documentation and implementation appear to disagree, inspect:

1. `package.json` scripts;
2. current build scripts;
3. current configuration;
4. current module behavior;
5. current Admin functionality.

Then determine which mechanism is actually used by the current system.

Do not blindly copy an old tutorial or README command into a new application.

---

## 34. Platform assumptions

The documented development environment is primarily macOS/Linux.

Saito's repository contains shell-based development and build tooling that assumes these environments.

Windows development is not the primary supported workflow described here.

An AI should not invent a separate Windows build process unless the user specifically asks for one and the required tooling can be established.

---

## 35. The practical developer workflow

For an ordinary human developer starting a Saito application project, the intended experience is:

    1. Clone Saito.

    2. Enter node/.

    3. Install dependencies.

    4. Compile/start the local Saito environment.

    5. Open Saito in the browser.

    6. Use Admin to configure the local development node.

    7. Develop the application in mods/<module>/.

    8. Compile when browser-side application changes need to enter the browser bundle.

    9. Use the local blockchain and development issuance when the application requires transactions, SAITO, NFTs, or other blockchain behavior.

    10. Only enter the Rust/WASM development workflow if the application task actually requires changing Saito Core or the underlying WASM implementation.

The command details matter, but this workflow matters more.

The goal of Saito's development environment is to let an application developer begin building an application without first becoming a Saito Core developer.
