# About Nettest

Path: `/opt/saito/node/scripts/nettest/`
Driver script: `/opt/saito/node/scripts/nettest.sh`
NPM entrypoint: from `/opt/saito/node`, run `npm run nettest <command>`.

## Purpose

`nettest` is a local Saito network test rig for deploying, resetting, starting, stopping, and inspecting multi-node Saito test networks. It uses filesystem-defined scenarios and PM2-managed node processes.

It is intended to let developers and testers spin up repeatable Saito node configurations, observe behavior, inspect logs/endpoints, and snapshot new scenarios from a configured local network.

## Main commands

Run these from `/opt/saito/node`:

```bash
npm run nettest install
npm run nettest clear
npm run nettest deploy <scenario> <branch> [--noconfirm] [local]
npm run nettest reset <scenario>
npm run nettest start
npm run nettest stop
npm run nettest status
npm run nettest logs <node_number>
npm run nettest endpoints
npm run nettest snapshot
npm run nettest list
npm run nettest whatis <scenario>
```

## Scenario structure

Scenarios live under:

```text
/opt/saito/node/scripts/nettest/scenarios/<scenario>/
```

Each numbered directory is one node:

```text
scenarios/example/
  README.md
  1/
    config/
      options.conf
      modules.config.js
    data/
      issuance/
      blocks/        # optional
  2/
    config/
      options.conf
      modules.config.js
    data/
      issuance/      # optional
      blocks/        # optional
```

The scenario README describes the scenario. `nettest list` shows the first line, and `nettest whatis <scenario>` prints the full README.

## Deployment behavior

`npm run nettest deploy <scenario> <branch> [--noconfirm] [local]`:

1. Checks/creates the nettest folder structure.
2. Confirms the scenario directory exists.
3. Clears the existing nettest deployment:
   - `pm2 delete all` if PM2 exists.
   - Deletes all folders under `scripts/nettest/nodes/`.
4. For each numeric node folder in the scenario:
   - Recreates the Saito node app under `scripts/nettest/nodes/<node_number>`.
   - In a legacy checkout where the node app is also the git root, this is a direct clone of `<PROJECT_DIR>`.
   - In the current monorepo layout (`/opt/saito` git root with node app in `/opt/saito/node`), deploy clones the git root to a temporary directory and copies only the `node/` subdirectory into the target nettest node.
   - Copies scenario `data/` into node `data/`, if present.
   - Copies scenario `config/` into node `config/`, if present.
   - Runs `npm install` inside the node clone.
   - If the deploy option `local` is provided, prepares the local Rust workspace before node setup:
     - respects an existing `SAITO_RUST_ROOT` if it points to a directory;
     - otherwise, in the monorepo layout, creates `scripts/nettest/nodes/rust -> /opt/saito/rust` and exports `SAITO_RUST_ROOT` to that path so deployed node apps can find sibling `../rust`.
   - If the deploy option `local` is provided, runs `npm run linklocal` inside the node clone immediately after `npm install` and before `npm run nuke dev`. In local mode, node setup is waited on sequentially to avoid concurrent npm-link/Rust-WASM build races across nodes.
   - Runs `npm run nuke dev` inside the node clone.
   - Re-copies scenario `data/` after nuke, because compile/nuke clears runtime data.
   - Copies scenario `data/blocks/` if present.
   - Creates a stopped PM2 process named `node<node_number>` using `npm start`, merged logs, log file `./saito.log`.
5. Displays issuance keys from node1 if present at `data/issuance/issuance.keys`.
6. Unless `--noconfirm` is provided, prompts whether to start the network.

## Start behavior

`npm run nettest start`:

1. Requires PM2.
2. Starts `node1` first.
3. Waits 15 seconds.
4. Starts all PM2 processes.
5. Prints endpoints parsed from each node's `config/options` or `config/options.conf`.

This staged start helps node1 initialize before peers connect.

## Reset behavior

`npm run nettest reset <scenario>`:

1. Stops all PM2 processes.
2. For each scenario node:
   - Clears deployed node `config/*`.
   - Clears deployed node `data/*`.
   - Re-copies scenario `data/` and `config/`.
   - Copies `data/blocks/` if present.
3. Displays issuance.
4. Does not reclone, reinstall, or rebuild. It assumes the nodes already exist under `scripts/nettest/nodes/`.

## Snapshot behavior

`npm run nettest snapshot`:

1. Prompts for a new scenario name.
2. Prompts for a README description.
3. Creates `scripts/nettest/scenarios/<name>/`.
4. For each existing deployed node:
   - Copies `config/options.conf`.
   - Copies `config/modules.config.js`.
   - Copies `data/issuance/*`.
   - Optionally copies `data/blocks/*` after prompting per node.

This is the built-in way to turn a manually configured running network into a reusable scenario.

## Existing scenarios observed

### base

README: two nodes with no blocks. Spammer and appsuite installed on node1. No spammer on node2.

Observed:
- node1 endpoint: `http://127.0.0.1:12101/`
- node2 endpoint: `http://127.0.0.2:12102/`
- node2 peers to node1 using `synctype: full`.
- node1 has a larger app/module set including spam.
- node2 has a minimal module set including spam.
- node1 includes test issuance files with 12 funded keys.

### atr

README: two nodes with no blocks. Minimal apps and no spammer installed on node1 and node2.

Observed:
- node1 endpoint: `http://127.0.0.1:12101/`
- node2 endpoint: `http://127.0.0.2:12102/`
- node2 peers to node1 using `synctype: full`.
- module config excludes spam.
- uses base-style issuance files on node1.

### fork

README: two nodes with the same chain for ten blocks then both fork for ten blocks. Both nodes running spammer, only node1 running appsuite.

Observed:
- Similar endpoint and peer topology to base.
- Includes `issuance.tsv` and `issuance.orig` in addition to base-style issuance files.
- No `data/blocks/` directories were visible during inspection, so the README may describe intended behavior, generated behavior, or a scenario that is incomplete/stale unless block state is produced elsewhere.

## Important implementation details

- Deployed node clones live under:
  `/opt/saito/node/scripts/nettest/nodes/<node_number>/`
- PM2 process names are `node1`, `node2`, etc.
- Node logs are at each deployed clone's `saito.log`.
- Nettest's own log is:
  `/opt/saito/node/scripts/nettest/nettest.log`
- Endpoint parsing supports both:
  - `config/options`
  - `config/options.conf`
- Scenario config should normally use `options.conf` as the durable source.
- Scenario module config should normally use `modules.config.js`.

## Destructive behavior / safety notes

- `nettest clear` and `nettest deploy` run `pm2 delete all`, not only nettest PM2 processes.
- `nettest clear` deletes all deployed nettest node folders under `scripts/nettest/nodes/`.
- `nettest deploy` reclones and rebuilds nodes, so it is heavy.
- `nettest reset` clears deployed node config/data but does not rebuild.
- Avoid using nettest on a machine with unrelated PM2 processes unless this behavior is acceptable or the script is changed.

## Known TODOs from `todo.md`

- Add support for Rust nodes in scenarios.
- Add support for specifying consensus variables in scenarios.

## Rust/WASM local-link testing note

For tests involving new Rust/core/WASM code, the JS node app must use locally built `saito-js` / `saito-wasm` instead of npm registry packages. The intended command, when present in the checkout, is:

```bash
cd /opt/saito/node
SAITO_RUST_ROOT=/opt/saito/rust npm run linklocal
```

This builds/links Rust WASM packages into the node app. See detailed notes:

```text
/opt/saito/node/scripts/nettest/.agents/about-rust-linklocal.md
```

Scenario configuration details for block production, staking, issuance/wallets, block timing/genesis period, and peers are documented in:

```text
/opt/saito/node/scripts/nettest/.agents/about-scenario-config.md
```

For JS-only updates, normal npm-installed packages are sufficient.

Caveat: nettest deploy creates fresh node clones and runs `npm install`, so verify local Rust/WASM linkage inside deployed `scripts/nettest/nodes/<n>` directories before trusting that a nettest run is exercising local Rust changes.

## Implications for future Hermes skill

When asked to set up a Saito nettest scenario, prefer this workflow:

1. Clarify or infer:
   - scenario name
   - number of nodes
   - branch
   - topology / peer relationships
   - endpoints / ports
   - module sets per node
   - issuance requirements
   - whether blocks/state should be included
   - expected verification checks
2. Create or modify a scenario directory under `scripts/nettest/scenarios/<scenario>/` or sync it from an external scenario repository.
3. Write a clear `README.md` for the scenario.
4. Ensure each node has `config/options.conf` and `config/modules.config.js`.
5. Include `data/issuance/` and optional `data/blocks/` as needed.
6. Run from `/opt/saito/node`:
   `npm run nettest deploy <scenario> <branch> --noconfirm`
7. Start and verify:
   - `npm run nettest start`
   - `npm run nettest endpoints`
   - `npm run nettest status`
   - query `/options` on each node to compare peers and latest block id/hash
   - query `/balance/` on each node to compare UTXO/money supply and verify issuance
   - inspect `saito.log` files and expected conditions.
8. Stop or clear when done if requested.

A separate shared scenario repository can mirror the `scenarios/<scenario>/...` structure and be copied or symlinked into `/opt/saito/node/scripts/nettest/scenarios/` before running tests.
