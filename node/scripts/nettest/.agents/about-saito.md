# About Saito Build/Compile Behavior Relevant to Nettest

Primary script inspected:

```text
/opt/saito/node/scripts/compile
```

NPM scripts from `/opt/saito/node/package.json`:

```json
"nuke": " ./scripts/compile nuke",
"reset": " ./scripts/compile reset",
"compile": " ./scripts/compile recompile",
"start": "NODE_OPTIONS='--max-old-space-size=8192' ts-node -T --files --project config/build/tsconfig.json ./scripts/start.ts --",
"nettest": "bash scripts/nettest.sh"
```

Nettest deploy runs this inside each cloned node:

```bash
npm run nuke dev
```

which expands to:

```bash
./scripts/compile nuke dev
```

## Purpose of `scripts/compile`

The compile script is Saito's combined build/reset/bundling driver. It does more than compile code. Depending on its arguments, it can:

- ensure required config/data directories exist
- create default config files if missing
- rebuild CSS
- update `dist/build.json`
- run TypeScript compilation
- reset runtime data
- reset persistent app/database state
- rebuild the lite-client bundler directory
- run webpack
- prepend boot code into the generated browser bundle
- reset issuance for local/prod setup modes

## Project paths

Inside the script:

```bash
SCRIPT_DIR="/opt/saito/node/scripts"
PROJECT_DIR="/opt/saito/node"
```

For a nettest-deployed node clone, the same script runs with `PROJECT_DIR` equal to that clone directory, e.g.:

```text
/opt/saito/node/scripts/nettest/nodes/1
/opt/saito/node/scripts/nettest/nodes/2
```

Important paths relative to each node/project:

```text
config/options.conf
config/options
config/modules.config.js
config/.template.options.conf
config/.template.modules.config.js
data/blocks/
data/state/
data/issuance/
dist/build.json
dist/ts/
dist/bundler/default/
web/saito/saito.js
web/saito/game.css
web/saito/saito.css
mods/*/web/style.css
```

## Initial behavior common to compile modes

At startup, the script:

1. Prints build mode: `Builing Lite Client ($1 $2)`.
2. Ensures `dist/build.json` exists, creating it with build number `0` if missing.
3. Ensures `data/blocks/` exists.
4. Ensures `data/state/` exists.
5. Ensures minimal config files:
   - if `config/options.conf` is missing, copies `config/.template.options.conf`
   - if `config/modules.config.js` is missing, copies `config/.template.modules.config.js`
6. Rebuilds module CSS from `mods/*/web/css/` into `mods/*/web/style.css`.
7. Rebuilds global CSS:
   - `web/saito/game.css`
   - `web/saito/saito.css`
8. Ensures these directories exist:
   - `dist/ts`
   - `dist/dyn`
   - `dist/bundler`
9. Updates `dist/build.json` unless running in dev mode.

In dev mode, CSS files are linked through `@import` statements. In non-dev mode, CSS files are concatenated.

## Major modes

### `compile nuke dev`

This is the key nettest deployment mode.

Flow:

```text
remove dist/ts/*
run tsc
reset_nonpersistent
reset_persistent
reset_bundler
run webpack
post_compile
```

Command inside script:

```bash
tsc -p config/build/tsconfig.json
node config/build/webpack.config.cjs $2 $3
```

For `nuke dev`, webpack receives `dev` as an argument.

This is a deep reset and rebuild. It clears runtime state, block data, many DBs, generated JS, bundler output, and persistent app DBs.

### `compile reset` or `compile dev`

Flow:

```text
run tsc
reset_nonpersistent
reset_bundler
run webpack
post_compile
```

This resets blockchain/nonpersistent runtime state and rebuilds the bundler, but does not call `reset_persistent`.

### `compile recompile`

Flow:

```text
reset_bundler
run webpack
post_compile
```

This is a lighter rebuild. It does not clear runtime data or persistent DBs.

### `compile setupprod`

Nuke-like flow that backs up `config/options`, resets state, rebuilds, then:

```bash
cp data/issuance/issuance.orig data/issuance/issuance
mv config/options.bk config/options
```

### `compile setuplocal`

Nuke-like flow that backs up `config/options`, resets state, rebuilds, then:

```bash
cp data/issuance/issuance.localdev data/issuance/issuance
mv config/options.bk config/options
```

### `compile nukelocal`

Runs:

```bash
npm run setuplocal
```

## Helper functions

### `post_compile`

Prepends boot code into the generated browser bundle:

```bash
cp lib/saito/boot.js web/saito/saito2.js
cat web/saito/saito.js >> web/saito/saito2.js
mv -f web/saito/saito2.js web/saito/saito.js
```

### `reset_nonpersistent`

This clears generated and runtime state while preserving some persistent data.

Important actions:

- Deletes `web/saito/saito.js`.
- Backs up `data/*.sq3` into `data/backup/`.
- Deletes:
  - `data/devtools.sq3`
  - `data/log.txt`
  - `data/*.sq3-journal`
  - `data/blocks/*.sai`
  - `data/shashmaps/*.smap`
  - `data/blocks/*.zip`
  - `data/blocks/*.segadd`
  - `data/tmp/*.sai`
  - `data/tmp/*.zip`
  - `config/options`
  - `data/peer_state.txt`
  - `mods/devtools/mods/*`
  - `mods/devtools/bundler/mods/*`
  - `mods/devtools/bundler/dist/*`
  - `mods/devtools/bundler/*.js`
  - `mods/devtools/bundler/*.json`
  - `logs/*`
  - `data/state/*`
- Recreates `mods/devtools/mods`.
- If `data/rewards.sq3` exists, runs:
  `update users set latest_tx = -1;`
- Recreates `config/options` from `config/options.conf` if present.

Important nettest implication:

`config/options.conf` is the durable scenario source. `config/options` is regenerated by compile from `options.conf`.

### `reset_persistent`

This deletes more persistent state:

- backs up `data/*.sq3`
- deletes:
  - `data/memento.sq3`
  - `data/migration.sq3`
  - `data/assetstore.sq3`
  - `data/store.sq3`
  - `data/registry.sq3`
  - `data/league.sq3`
  - `web/client.options`
  - everything in `data/blocks/`

Commented-out deletes indicate archive/warehouse DBs may intentionally be preserved or under consideration.

### `reset_bundler`

This rebuilds `dist/bundler/default`.

Flow:

1. Deletes `dist/bundler`.
2. Creates:
   - `dist/bundler/default/mods`
   - `dist/bundler/default/dist`
3. Copies into bundler:
   - `lib`
   - `config`
   - `apps`
   - `dist/build.json`
4. Removes `*.spec.js` files from copied lib paths.
5. Calls `copy_lite_mods_to_bundler_directory`.
6. Removes unnecessary files/directories from copied module directories:
   - `web`
   - `sql`
   - `www`
   - `src`
   - `docs`
   - `compile`
   - README / markdown / install / license files

### `copy_lite_mods_to_bundler_directory`

This parses `config/modules.config.js` line-by-line.

Behavior:

- Starts collecting module names after a line containing `lite`.
- Ignores lines containing `//`.
- Extracts the module folder name from strings like:
  `'chat/chat.js'`
- Copies matching source module directories from:
  `mods/<module>`
  to:
  `dist/bundler/default/mods/<module>`

Important limitations:

- Parsing is simple shell text parsing, not JavaScript parsing.
- The `lite` section in `modules.config.js` should be kept simple and conventional.
- Avoid unexpected formatting if scenario-specific bundling matters.

## Relationship between nettest and compile

Nettest deploy copies scenario files before running `npm run nuke dev`, then copies scenario data again after nuke.

This matters because `compile nuke dev` does destructive resets:

- It deletes `config/options`, then recreates it from `config/options.conf`.
- It deletes block files and other runtime data.
- It deletes persistent DBs via `reset_persistent`.
- It rebuilds the bundler based on `config/modules.config.js`.

Therefore, when creating nettest scenarios:

1. Put durable node options in:
   `config/options.conf`
2. Do not rely on a prebuilt `config/options` file.
3. Put node-specific module selection in:
   `config/modules.config.js`
4. If block data is part of a scenario, keep it under:
   `data/blocks/`
   because nettest re-copies data after nuke.
5. If issuance is part of a scenario, keep it under:
   `data/issuance/`
6. Expect deployment to rebuild each node clone from source.

## Caveats noticed

- The script prints `Builing` instead of `Building`.
- `reset_nonpersistent` fallback uses `config/.templates.options.conf`, while startup uses `config/.template.options.conf`. The plural `templates` path may be a typo if `options.conf` is missing.
- `compile nuke dev` is destructive to node runtime state.
- `modules.config.js` parser is line-oriented and fragile.
- `reset_nonpersistent` comments say registry/balance databases are not deleted, but `reset_persistent` deletes `registry.sq3`.

## Rust/WASM vs JS testing mode

The JS node app imports Saito core functionality through the npm package `saito-js`, which depends on `saito-wasm`. `saito-wasm` is built from the Rust workspace.

For JS-only updates in `/opt/saito/node`, the normal npm-installed packages are sufficient.

For Rust/core/WASM updates in `/opt/saito/rust`, use the local-link workflow before testing so the node app uses locally built `saito-js` / `saito-wasm` instead of the published npm packages. The intended node-side command is:

```bash
cd /opt/saito/node
SAITO_RUST_ROOT=/opt/saito/rust npm run linklocal
```

or directly, when the script exists:

```bash
./scripts/link-local.sh
```

The current inspected `prod` checkout did not have `scripts/link-local.sh` or a `linklocal` package script, but git history contains them in commit `f2ff93c8 added linklocal script`. See:

```text
/opt/saito/node/scripts/nettest/.agents/about-rust-linklocal.md
```

For scenario-authoring specifics around block production, staking, issuance/wallet keys, heartbeat/genesis period, and peers, see:

```text
/opt/saito/node/scripts/nettest/.agents/about-scenario-config.md
```

Important nettest caveat: nettest deploy creates fresh clones under `scripts/nettest/nodes/<n>` and runs `npm install`, so parent-app `npm link` state may not automatically carry into deployed test nodes. For Rust/WASM tests, use:

```bash
npm run nettest deploy <scenario> <branch> --noconfirm local
```

The final `local` argument runs `npm run linklocal` inside each deployed node immediately after `npm install` and before `npm run nuke dev`. Local mode waits for each node setup to finish before starting the next node setup to avoid concurrent npm-link/Rust-WASM build races.

## Practical guidance for future nettest work

When using Hermes to set up and run Saito nettest scenarios:

- Treat `options.conf` and `modules.config.js` as the primary scenario config files.
- Remember that `npm run nuke dev` will regenerate `config/options` from `options.conf`.
- Keep test blockchain data and issuance under scenario `data/` so nettest can re-copy it after compile clears data.
- Use `npm run nettest deploy <scenario> <branch> --noconfirm` for a clean deployment.
- Use `npm run nettest reset <scenario>` only when nodes have already been deployed and only config/data need to be reset.
- Use `npm run nettest start`, `status`, `endpoints`, and `logs <node>` to verify behavior.
- For Rust/WASM changes, run and verify the local-link workflow; do not assume npm registry packages include the latest Rust code.
- For JS-only changes, normal npm files/packages are enough unless the test explicitly depends on unreleased Rust/WASM behavior.
- Be careful with machines running unrelated PM2 apps because nettest clears all PM2 processes.
