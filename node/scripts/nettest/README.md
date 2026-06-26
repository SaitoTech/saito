# Saito Network Testing Tool

`nettest` is a local multi-node Saito test harness. It deploys filesystem-defined scenarios into throwaway node directories, manages the nodes with PM2, and provides helper commands for endpoints, logs, reset, snapshotting, and scenario discovery.

Run all commands from the node app directory:

```bash
cd /opt/saito/node
npm run nettest <command>
```

## What nettest does

- Deploy repeatable Saito network scenarios from `scripts/nettest/scenarios/<scenario>/`.
- Clone the Saito checkout into per-node throwaway directories under `scripts/nettest/nodes/<n>/`.
- Copy each scenario node's `config/` and `data/` into its deployed node.
- Run `npm install` and `npm run nuke dev` for each deployed node.
- Re-copy scenario `data/` after compile, because `nuke dev` clears runtime/block state.
- Create stopped PM2 processes named `node1`, `node2`, etc.
- Start, stop, reset, inspect, and snapshot local test networks.

In the current monorepo layout, `/opt/saito` is the git root and `/opt/saito/node` is the JS/node app. Nettest deploy clones the full monorepo into each deployed node folder, so deployed app paths usually look like:

```text
scripts/nettest/nodes/1/node/
scripts/nettest/nodes/2/node/
```

and local Rust/WASM tests can use the sibling Rust workspace in each deployed monorepo clone.

## Commands

### Basic operations

<<<<<<< HEAD
```bash
npm run nettest help
npm run nettest install
npm run nettest clear
npm run nettest start
npm run nettest stop
=======
- `install` - Checks and installs required dependencies (pm2)
- `clear` - Stops all pm2 processes and deletes all node folders
- `start` - Starts the network in sequence (node1 first, then others)
- `stop` - Stops all running nodes
- `status` - Shows current pm2 process status

### Scenario Management

- `list` - Shows available scenarios with their descriptions
- `whatis <scenario>` - Displays detailed description of a specific scenario
- `deploy <scenario> <branch> [--noconfirm] [local]` - Sets up test nodes based on scenario configuration
  - `scenario`: Name of the scenario folder in scripts/nettest/scenarios/
  - `branch`: Git branch to use for node deployment
  - `--noconfirm`: Skip the prompt to start network after deployment
  - `local`: Run `npm run linklocal` after `npm install` in each deployed node, for testing local Rust/WASM updates
- `reset <scenario>` - Resets configuration for all nodes in a scenario
- `snapshot` - Creates a new scenario from the current network state
  - Prompts for scenario name and description
  - Copies configuration and issuance files
  - Optionally includes blockchain data

### Monitoring

- `logs <node_number>` - Displays live logs for specified node
- `endpoints` - Lists all node endpoints in the network

## Scenarios

Scenarios are predefined network configurations stored in `scripts/nettest/scenarios/`. Each scenario contains:
- Node configurations
- Module configurations
- Optional blockchain data
- README.md with scenario description

### Creating New Scenarios

You can create new scenarios in two ways:
1. Manually create directories and configuration files in `scripts/nettest/scenarios/`
2. Use `nettest snapshot` to save current network state as a new scenario

### Scenario Structure

```
scripts/nettest/scenarios/
└── example_scenario/
    ├── README.md
    ├── 1/
    │   ├── config/
    │   │   ├── options.conf
    │   │   └── modules.config.js
    │   └── data/
    │       ├── issuance/
    │       └── blocks/
    ├── 2/
    │   └── ...
    └── 3/
        └── ...
```

## Examples

Deploy a basic test network:
```
npm run nettest deploy base main
```

Deploy a basic test network without prompting and with local Rust/WASM packages linked into each node:
```
npm run nettest deploy base main --noconfirm local
```

View network status:
```
>>>>>>> ef847abe (added README.md)
npm run nettest status
npm run nettest endpoints
```

- `install` checks for PM2 and installs it if needed.
- `clear` deletes all PM2 processes and removes all deployed node folders under `scripts/nettest/nodes/`.
- `start` starts `node1`, waits 15 seconds, then starts the remaining PM2 processes.
- `stop` stops all PM2 processes.
- `status` shows PM2 status.
- `endpoints` prints each deployed node endpoint from `config/options` or `config/options.conf`.

Warning: `clear` and `deploy` currently run `pm2 delete all`, not only nettest PM2 processes.

### Scenario management

```bash
npm run nettest list
npm run nettest whatis <scenario>
npm run nettest deploy <scenario> <branch> [--noconfirm] [local]
npm run nettest reset <scenario>
npm run nettest snapshot
```

- `list` shows available scenario directories and the first README line for each.
- `whatis <scenario>` prints the full scenario README.
- `deploy <scenario> <branch> [--noconfirm] [local]` clears the existing deployment, clones the requested branch for each scenario node, installs/builds each node, copies scenario config/data, and creates stopped PM2 processes.
- `reset <scenario>` stops nodes and re-copies scenario config/data into an existing deployment without recloning, reinstalling, or recompiling.
- `snapshot` creates a new scenario from the current deployed network state.

Use `--noconfirm` for scripted deploys that should leave nodes stopped until an explicit `start`.

Use the final `local` argument when testing local Rust/core/WASM changes:

```bash
npm run nettest deploy <scenario> <branch> --noconfirm local
```

In local mode, deploy runs `npm run linklocal` inside each deployed node after `npm install` and before `npm run nuke dev`, so the node app uses local `saito-js` / `saito-wasm` packages instead of registry packages. Verify the symlinks inside deployed nodes when the test depends on Rust/WASM changes.

### Logs

```bash
npm run nettest logs <node_number>
```

This tails the deployed node's `saito.log`. For automated analysis, prefer bounded reads of:

```text
scripts/nettest/nodes/<n>/node/saito.log
```

or PM2 logs under:

```text
/root/.pm2/logs/node<n>-out.log
/root/.pm2/logs/node<n>-error.log
```

## Scenario structure

Scenarios live under:

```text
scripts/nettest/scenarios/<scenario>/
```

Each numbered directory is one Saito node:

```text
scripts/nettest/scenarios/example/
  README.md
  1/
    config/
      options.conf
      modules.config.js
    data/
      issuance/
      blocks/        # optional preloaded chain state
  2/
    config/
      options.conf
      modules.config.js
    data/
      issuance/      # optional
      blocks/        # optional
```

Scenario source-of-truth files:

- `config/options.conf`: durable node configuration. `npm run nuke dev` regenerates `config/options` from this file.
- `config/modules.config.js`: node/lite module selection.
- `data/issuance/`: initial issuance and useful test keys.
- `data/blocks/`: optional preloaded `.sai` blocks.
- `README.md`: scenario purpose, topology, expected behaviour, and verification notes.

Keep scenario configs deterministic: use fixed wallet private/public keys, explicit endpoints, deliberate peer topology, and explicit consensus settings when testing block production, staking, timing, pruning, or forks.

## Versioned scenarios and local working scenarios

The repository currently tracks these shared scenarios:

- `atr`
- `base`
- `blonger`
- `fork`

The `.gitignore` intentionally ignores `scripts/nettest/scenarios/*` by default and then manually re-includes the shared scenarios above. This prevents snapshots and experimental scenarios from being committed accidentally. To promote a new scenario into the repository, add an explicit negated include for that scenario in `.gitignore`, then `git add` the scenario directory.

Deployed node directories under `scripts/nettest/nodes/` are always throwaway runtime output and should not be committed.

## Creating or updating a scenario

1. Pick a scenario name and node count.
2. Create `scripts/nettest/scenarios/<scenario>/README.md`.
3. For each node, create:
   - `config/options.conf`
   - `config/modules.config.js`
   - optional `data/issuance/`
   - optional `data/blocks/`
4. Set unique endpoints, for example:
   - node1: `127.0.0.1:12101`
   - node2: `127.0.0.2:12102`
   - node3: `127.0.0.3:12103`
5. Set peers deliberately. For a simple fresh-chain hub, node1 usually has `peers: []`, and other nodes peer to node1 using `synctype: "full"`.
6. Set consensus fields deliberately when they matter, especially:
   - `disable_block_production`
   - `heartbeat_interval`
   - `genesis_period`
   - `default_social_stake`
   - `default_social_stake_period`
7. Fund any block-producing, staking, or transaction-sending wallet in `data/issuance/issuance`.
8. Validate JSON in every `options.conf`.
9. Run:

```bash
npm run nettest list
npm run nettest whatis <scenario>
npm run nettest deploy <scenario> <branch> --noconfirm
npm run nettest start
npm run nettest endpoints
npm run nettest status
```

For Rust/WASM tests, append `local` to the deploy command.

## Reset vs deploy

Use `deploy` when you need a fresh clone, dependency install, compile, or branch change.

Use `reset` when deployed nodes already exist and you only need to re-copy scenario config/data. `reset` preserves generated build config such as `config/build`, because PM2 `npm start` and compile scripts depend on it.

## Troubleshooting

If a deploy or run fails:

1. Check `scripts/nettest/nettest.log`.
2. Check PM2 status:

```bash
npm run nettest status
```

3. Check endpoints:

```bash
npm run nettest endpoints
```

4. Check a bounded section of node logs:

```bash
tail -n 200 scripts/nettest/nodes/1/node/saito.log
```

5. Query node HTTP APIs when nodes are running:

```bash
curl -s http://127.0.0.1:12101/options
curl -s http://127.0.0.1:12101/balance/
```

Use `/options` to verify peer configuration and latest block state. Use `/balance/` to compare UTXO/money-supply state across nodes that should agree.

## Agent notes

The `.agents/` folder contains reusable notes for humans and AI agents working with nettest:

- `about-nettest.md`: implementation and workflow notes.
- `about-saito.md`: Saito build/compile behaviour relevant to nettest.
- `about-rust-linklocal.md`: local Rust/WASM linking workflow.
- `about-scenario-config.md`: scenario config semantics and patterns.
- `about-log-analysis-and-reports.md`: log-analysis and report-production workflow.

Read those notes before changing scenarios, running destructive deploys, or producing reports from PM2/browser logs.

## License

This tool is part of the Saito project and shares its licensing.
