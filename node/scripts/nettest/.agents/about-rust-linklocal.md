# About Local Rust/WASM Linking for Saito Nettest

This note documents how to test local Rust changes in the JS/node Saito application used by nettest.

## Key idea

The JS node app depends on the npm package `saito-js`, which itself depends on `saito-wasm`. `saito-wasm` is built from the Rust workspace and exposes Rust/Saito core through WASM. The node app imports `saito-js` throughout the codebase, for example:

```ts
import S, { initialize as initS } from 'saito-js/index.node';
import { initialize as initSaito } from 'saito-js/index.web';
import SaitoBlock from 'saito-js/lib/block';
```

So there are two different testing modes:

1. JS-only changes in `/opt/saito/node`:
   - use normal npm-installed dependencies from `package.json` / `package-lock.json`.
   - `saito-js` and `saito-wasm` come from npm, currently declared in the node app as `saito-js` dependency.

2. Rust/core/WASM changes in `/opt/saito/rust`:
   - build local Rust/WASM packages and link them into `/opt/saito/node`.
   - use `npm run linklocal` / `./scripts/link-local.sh` when available.
   - after linking, run `npm run compile` or nettest deploy/build flows so the JS app uses the locally linked Rust/WASM code.

## Important repository layout

Expected local layout:

```text
/opt/saito/
  node/       # JS/node Saito app and nettest framework
  rust/       # Rust workspace: saito-core, saito-wasm, saito-js, saito-rust
```

The linklocal script resolves the Rust workspace using either:

- `SAITO_RUST_ROOT`, if set; or
- sibling path `../rust` from the node app; or
- nested path `<node app>/rust`.

On this machine, the Rust workspace is:

```text
/opt/saito/rust
```

## Current checkout note

The current `/opt/saito/node` branch inspected was `prod`. In this checkout, `package.json` did not currently contain `linklocal`, and `/opt/saito/node/scripts/link-local.sh` was not present.

Git history does contain the script and package entry in commit:

```text
f2ff93c8 added linklocal script
```

That commit added this package script:

```json
"linklocal": "bash scripts/link-local.sh"
```

Branches containing that commit included remote branches such as `origin/develop`, `origin/master`, `origin/rustscript`, and others.

If the command is unavailable in a checkout, either switch to a branch containing it, cherry-pick/restore the script, or run the equivalent Rust workspace build/link procedure manually.

## What `scripts/link-local.sh` does

The script from git history performs this workflow:

1. Resolve the node app directory from the script location.
2. Resolve the Rust workspace from `SAITO_RUST_ROOT`, sibling `../rust`, or nested `rust`.
3. Require `cargo` and `npm`.
4. On macOS only, set `CC` and optionally `AR` to Homebrew LLVM tools.
5. Run a full Rust workspace build:

```bash
cd <rust workspace>
cargo build
```

6. Build and globally link `saito-wasm`:

```bash
cd <rust workspace>/saito-wasm
npm install
npm run build
npm link
```

7. Build and globally link `saito-js`, linked against local `saito-wasm`:

```bash
cd <rust workspace>/saito-js
npm install
npm link saito-wasm
npm run build
cp -f package.json dist/package.json
cd dist
npm link
```

8. Attach the linked local `saito-js` into the node app:

```bash
rm -rf <node app>/node_modules/saito-js
cd <node app>
npm link saito-js
```

9. Tell the user to rebuild the client JS with:

```bash
npm run compile
```

## Equivalent older Rust workspace helper

The Rust workspace also contains:

```text
/opt/saito/rust/scripts/build_link_npms.sh
```

This script performs the core package-linking sequence:

```bash
cd /opt/saito/rust/saito-wasm
npm install
npm run build
npm link

cd /opt/saito/rust/saito-js
npm install
npm link saito-wasm
npm run build
cd dist
npm link
```

The newer node-side `link-local.sh` is more complete because it also:

- runs `cargo build` first;
- resolves the Rust workspace automatically;
- supports `SAITO_RUST_ROOT`;
- handles macOS LLVM environment setup;
- copies `saito-js/package.json` into `saito-js/dist` before linking;
- removes existing `node_modules/saito-js` and links the node app to local `saito-js`.

## How this affects nettest

Nettest deploy clones from the node app directory into per-node folders under:

```text
/opt/saito/node/scripts/nettest/nodes/<node_number>/
```

Then each clone runs:

```bash
npm install
npm run nuke dev
```

Because `npm install` inside a fresh clone normally installs dependencies from npm, local `npm link` state in the parent node app may not automatically carry into every cloned nettest node.

Therefore, for Rust/WASM nettest scenarios, verify how the nettest-deployed nodes receive local `saito-js`:

- If the nettest framework or branch has been updated to run `npm run linklocal` inside each deployed node, use that.
- If not, the skill/test workflow should link local `saito-js` inside each deployed node after clone/install and before compile/start, or modify nettest deployment to support Rust-local mode.
- Always verify with `node_modules/saito-js` symlink checks inside the deployed node(s) before trusting that local Rust code is in use.

Useful symlink check:

```bash
node -p "const fs=require('fs'); for (const p of ['node_modules/saito-js','node_modules/saito-wasm']) { try { const s=fs.lstatSync(p); console.log(p, s.isSymbolicLink() ? '-> '+fs.readlinkSync(p) : 'not-symlink'); } catch(e){ console.log(p,'missing'); } }"
```

## Practical guidance

For JS-only tests:

```bash
cd /opt/saito/node
npm install
npm run nettest deploy <scenario> <branch> --noconfirm
npm run nettest start
```

For Rust/WASM tests when `linklocal` exists:

```bash
cd /opt/saito/node
npm run nettest deploy <scenario> <branch> --noconfirm local
```

This causes nettest deploy to create/use a local Rust workspace path first. In the `/opt/saito` monorepo layout it creates:

```text
/opt/saito/node/scripts/nettest/nodes/rust -> /opt/saito/rust
```

and exports `SAITO_RUST_ROOT` so each deployed node app can resolve the Rust workspace even though the deployed app itself is only the `node/` subdirectory. It then runs `npm run linklocal` in each deployed node after `npm install` and before `npm run nuke dev`. Local mode waits for each node setup to finish before starting the next node setup to avoid concurrent npm-link/Rust-WASM build races.

Then confirm the deployed nettest node(s) are using local linked `saito-js`, especially if testing Rust changes. If not, link inside the deployed node clone(s) or adjust the nettest deploy script to invoke linklocal in Rust-local mode.

## Build prerequisites

For Rust/WASM local linking:

- `cargo`
- `npm`
- `wasm-pack`
- standard native build tools
- on macOS, Homebrew LLVM may be required and the script sets `CC`/`AR` if available.

`saito-wasm/package.json` builds both web and nodejs WASM targets:

```json
"build": "cross-env WASM_BINDGEN_WEAKREF=1 npm run build-web && npm run build-nodejs",
"build-web": "wasm-pack build --target web --out-dir ./pkg/web --out-name index --dev",
"build-nodejs": "wasm-pack build --target nodejs --out-dir ./pkg/node --out-name index --dev"
```

`saito-js/package.json` builds with:

```json
"build": "tsc"
```

## Rule of thumb

- Testing JS changes: normal npm package flow is enough.
- Testing Rust consensus/core/WASM changes: run local Rust/WASM linklocal flow and verify the node(s) are using linked `saito-js` / `saito-wasm` rather than registry packages.
