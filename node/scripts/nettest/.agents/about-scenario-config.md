# About Saito Nettest Scenario Configuration

This file records how to author `config/options.conf` and scenario data for multi-node nettest scenarios.

Sources inspected:

- `/opt/saito/node/config/.template.options.conf`
- `/opt/saito/node/scripts/start.ts`
- `/opt/saito/node/scripts/nukelocal.js`
- `/opt/saito/rust/saito-core/src/core/util/configuration.rs`
- `/opt/saito/rust/saito-core/src/core/consensus_thread.rs`
- `/opt/saito/rust/saito-core/src/core/consensus/mempool.rs`
- `/opt/saito/rust/saito-core/src/core/consensus/burnfee.rs`
- `/opt/saito/rust/saito-core/src/core/consensus/wallet.rs`
- `/opt/saito/rust/saito-core/src/core/routing_thread.rs`
- `/opt/saito/rust/saito-rust/src/config_handler.rs`
- existing nettest scenarios under `/opt/saito/node/scripts/nettest/scenarios/`

## Scenario config file

Each nettest node should have:

```text
scripts/nettest/scenarios/<scenario>/<node_number>/config/options.conf
scripts/nettest/scenarios/<scenario>/<node_number>/config/modules.config.js
```

`options.conf` is the durable source. `npm run nuke dev` deletes/recreates `config/options` from `config/options.conf`, so do not rely on prebuilt `config/options` in scenarios.

## Minimal useful `options.conf` shape

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 12101,
    "protocol": "http",
    "endpoint": {
      "host": "127.0.0.1",
      "port": 12101,
      "protocol": "http"
    },
    "verification_threads": 4,
    "channel_size": 10000,
    "stat_timer_in_ms": 5000,
    "reconnection_wait_time": 10000,
    "thread_sleep_time_in_ms": 10,
    "block_fetch_batch_size": 10
  },
  "peers": [],
  "spv_mode": false,
  "browser_mode": false,
  "consensus": {
    "genesis_period": 80640,
    "heartbeat_interval": 30000,
    "prune_after_blocks": 99,
    "max_staker_recursions": 3,
    "default_social_stake": 0,
    "default_social_stake_period": 100,
    "block_confirmation_limit": 5,
    "recollect_discarded_txs_mode": 2,
    "disable_block_production": false
  },
  "blockchain": {
    "last_block_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "last_block_id": 0,
    "last_timestamp": 0,
    "genesis_block_id": 0,
    "genesis_timestamp": 0,
    "lowest_acceptable_timestamp": 0,
    "lowest_acceptable_block_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "lowest_acceptable_block_id": 0,
    "fork_id": "0000000000000000000000000000000000000000000000000000000000000000",
    "issuance_writing_block_interval": 10
  },
  "wallet": {
    "privateKey": "<32-byte hex private key>",
    "publicKey": "<base58 public key>"
  }
}
```

Existing nettest scenarios omit the `consensus` block in places. That works because defaults are supplied, but scenario authoring should include `consensus` explicitly when controlling block production, staking, heartbeat/block timing, or genesis-window behavior.

## Endpoints and peers

`server` identifies the node itself. For nettest use unique loopback hosts/ports per node:

- node1: `127.0.0.1:12101`
- node2: `127.0.0.2:12102`
- node3: `127.0.0.3:12103`

Both `server.host/port/protocol` and `server.endpoint.host/port/protocol` should be set consistently.

Static peers are listed in `peers`:

```json
"peers": [
  {
    "host": "127.0.0.1",
    "port": 12101,
    "protocol": "http",
    "synctype": "full"
  }
]
```

The Rust config struct is:

```rust
pub struct PeerConfig {
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub synctype: String,
}
```

`PeerConfig::get_url()` converts peer protocol to a websocket URL:

- `http` => `ws://<host>:<port>/wsopen`
- `https` => `wss://<host>:<port>/wsopen`

During routing initialization, each configured peer is connected using `connect_to_peer(peer.get_url())`.

Practical topology guidance:

- For a hub-and-spoke test, set the fresh genesis node `peers: []`; set every other node to peer to that node.
- Node1 is not required to be peerless when it is using preloaded/snapshot blocks or syncing from disk/another peer.
- For a mesh, list all desired peers except self.
- To test isolated nodes or separate partitions, leave `peers` empty for nodes/partitions that should not connect.
- `synctype` is carried in config and exposed by JS wrappers. Existing scenarios use `"full"`; use `"full"` unless testing sync-type behavior specifically.

## Genesis block behavior

On startup, non-browser nodes load blocks from disk. If a node has no configured peers and no block files on disk, it sets `generate_genesis_block = true` and produces a genesis block.

Important consequence:

- A bootstrap node with no peers and no blocks will create genesis.
- A peer node with configured peers and no blocks will not create its own genesis; after handshake, it asks a peer for the genesis block / blockchain.
- To make all nodes share a fresh chain, usually let node1 have no peers and have other nodes peer to node1.
- Node1 can have peers if it is syncing from disk / preloaded blocks rather than being the fresh genesis producer. In snapshot/preloaded-chain scenarios, node1 does not need to be peerless as long as its `data/blocks/` and `blockchain` state are consistent with the intended chain.
- To make independent genesis chains / partitions, give each fresh partition a no-peer, no-block genesis node.

## Permitting or preventing block creation

Two controls matter:

### Config-level block production gate

`consensus.disable_block_production`:

- `false` permits normal block production.
- `true` prevents normal block production.

The template at `/opt/saito/node/config/.template.options.conf` has:

```json
"disable_block_production": true
```

`nukelocal.js` and admin setup flip it to `false` for local block-producing setups.

The consensus code checks this before producing normal blocks:

```rust
if (produce_without_limits || (!configs.is_browser() && !configs.is_spv_mode()))
    && !blockchain.blocks.is_empty()
    && !disable_block_production
{
    produce_block(...)
}
```

Scenario rule:

- Set `disable_block_production: false` on nodes that should create blocks.
- Set `disable_block_production: true` on observer/follower nodes that should sync but not produce.

### Timer-level production gate

The WASM/JS API exposes:

```ts
S.getInstance().disableProducingBlocksByTimer();
wallet.disableProducingBlocksByTimer();
```

This sets `consensus_thread.produce_blocks_by_timer = false`. It is a runtime API, not currently a scenario `options.conf` field. Use config-level `disable_block_production` for scenario files.

## Block timing / heartbeat

There are two separate timing concepts:

### Timer tick for attempting production

`BLOCK_PRODUCING_TIMER` in `consensus_thread.rs` is hardcoded to 1000ms. The consensus thread tries to bundle a block about once per second when timer production is enabled.

### Target heartbeat for burnfee / block-time economics

`consensus.heartbeat_interval` controls burnfee/routing-work requirements. Default from config is 30000ms.

The burnfee code says:

- if elapsed time since previous block >= `2 * heartbeat_interval`, routing work needed is 0.
- otherwise required routing work is based on previous burnfee / elapsed time.
- burnfee for the new block adjusts by `sqrt(heartbeat / timestamp_difference)`.

Scenario rule:

- To make blocks easier/faster in tests, use a smaller `heartbeat_interval`, or ensure enough elapsed time/routing work.
- To slow or harden block production, use a larger `heartbeat_interval` and/or require routing work through transactions.
- Remember the node attempts production about every 1s, but actual successful bundling depends on transaction availability, golden-ticket rules, burnfee/routing-work, and disable flags.

## Genesis period and pruning

`consensus.genesis_period` is a block-count window used throughout consensus:

- default: `80640` outside tests
- default in some tests: `10` or `100`
- `ConsensusConfig::get_ring_buffer_length()` returns `genesis_period * 2`
- old blocks are purged based around `latest_block_id - genesis_period * 2`
- transaction/slip validity uses `(latest_block_id + 1).saturating_sub(genesis_period)` as a lower valid block bound
- staking transaction creation uses this lower bound to ignore too-old slips.

Scenario rule:

- Use production-like `80640` unless testing pruning/genesis-window behavior.
- For short tests that need pruning/slip expiry behavior quickly, set `genesis_period` small, e.g. 10 or 20.
- If using staking with a small genesis period, ensure funded slips are not older than the valid window when they are needed.

`consensus.prune_after_blocks` also exists and is passed into `Blockchain::new`. Existing templates use 99. Keep default unless testing pruning.

## Staking / block stake

Staking is controlled by:

```json
"default_social_stake": <amount>,
"default_social_stake_period": <blocks>
```

These initialize the blockchain's social stake requirement and period.

Practical behavior:

- `default_social_stake: 0` effectively disables staking requirements for block production.
- If `default_social_stake` is nonzero, block production tries to include a `BlockStake` transaction.
- The wallet creates that staking transaction by selecting suitable slips.
- It first tries unlocked staking slips, then normal unspent slips.
- If it cannot collect at least the required amount, staking transaction creation fails and block bundling fails.
- Staking slips must be unlocked according to the latest unlocked stake block id and must not be too old relative to the genesis-period validity window.

Scenario rule:

- For simple block-producing tests, set:

```json
"default_social_stake": 0,
"default_social_stake_period": 0
```

or keep period nonzero with amount 0.

- For staking tests, fund each block-producing node's wallet public key in `data/issuance/issuance` with enough value to cover:

```text
default_social_stake * expected staking needs + normal transaction funds
```

- Existing test helper patterns fund staking with `staking_requirement * staking_period` plus additional funds.

## Issuance files and funded wallets

Scenarios normally put issuance data under:

```text
<scenario>/<node>/data/issuance/issuance
<scenario>/<node>/data/issuance/issuance.keys   # optional human-readable private/public keys
```

Existing nettest issuance format is TSV/whitespace-separated:

```text
<amount> <public_key> <slip_type>
```

Examples:

```text
1000000000000000 wDwNGzgx1yn2N21gHiHs43USRiXPx9H9NAcef1UZjLRX Normal
1000000000000000 zYCCXRZt2DyPD9UmxRfwFgLTNAqCd5VE8RuNneg4aNMK Normal
```

Slip types seen:

- `Normal`
- `VipOutput` in `issuance.orig`-style files

For nettest scenario authoring, use `Normal` unless explicitly testing VIP/output conversion behavior.

The node's wallet keypair comes from `options.conf`:

```json
"wallet": {
  "privateKey": "27deb14beba851a64a4a2fe285d7690481bc0baddd8de37c1078396692f938c0",
  "publicKey": "sHF2msLugQX1SFBwWmm9q6ZCWKBdgYgfBGQWoZopaQdG"
}
```

On startup, the node reads `wallet.privateKey`; if `wallet.publicKey` is provided, it validates/uses it. If no private key is provided, a keypair is generated and written back to config, which is not good for reproducible nettest scenarios.

Scenario rule:

- Always provide deterministic `wallet.privateKey` and matching `wallet.publicKey` for each node.
- Fund any wallet that must create blocks, stake, or send transactions by adding its public key to `data/issuance/issuance`.
- Keep an `issuance.keys` file with private/public keys for test users and node wallets when useful. Nettest displays node1's `issuance.keys` after deploy/reset.

## Blockchain section

For a fresh scenario with no preloaded blocks, use zero values:

```json
"blockchain": {
  "last_block_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "last_block_id": 0,
  "last_timestamp": 0,
  "genesis_block_id": 0,
  "genesis_timestamp": 0,
  "lowest_acceptable_timestamp": 0,
  "lowest_acceptable_block_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "lowest_acceptable_block_id": 0,
  "fork_id": "0000000000000000000000000000000000000000000000000000000000000000",
  "issuance_writing_block_interval": 10
}
```

For snapshot/preloaded-block scenarios, keep this section consistent with copied `data/blocks/` and the chain state in the snapshot.

## Recommended scenario patterns

### Basic two-node producing network

For a fresh chain, node1 is usually the genesis producer:

node1:

- `peers: []` for fresh genesis creation. If node1 has preloaded blocks / disk state and is intended to sync from disk or another peer, it may have peers.
- `disable_block_production: false`
- funded wallet
- no blocks, zero blockchain state for fresh genesis; or consistent copied `data/blocks/` plus `blockchain` state for preloaded/snapshot scenarios

node2:

- `peers: [{ host: "127.0.0.1", port: 12101, protocol: "http", synctype: "full" }]`
- `disable_block_production: true` if follower-only, or `false` if it should also produce.
- funded wallet only if it will produce/stake/send.

### No-block-production observer network

- Set all nodes `disable_block_production: true`.
- Be aware that if node1 has no peers and no blocks it may still be in genesis-producing path; for pure observer testing, provide a peer or preloaded blocks, or test/verify behavior carefully.

### Fast local block tests without staking

```json
"consensus": {
  "genesis_period": 20,
  "heartbeat_interval": 1000,
  "prune_after_blocks": 99,
  "max_staker_recursions": 3,
  "default_social_stake": 0,
  "default_social_stake_period": 0,
  "block_confirmation_limit": 1,
  "recollect_discarded_txs_mode": 2,
  "disable_block_production": false
}
```

### Staking tests

- Set `default_social_stake` to the required block-stake amount.
- Set `default_social_stake_period` to desired stake lock period.
- Fund producer wallets with enough issuance.
- Use a large enough `genesis_period` that stake/funding slips remain valid during the test.

## Verification APIs for scenarios

The running node exposes useful HTTP endpoints that can be used in nettest verification scripts.

### `/balance/`

Example:

```bash
curl -s http://127.0.0.1:12101/balance/
curl -s http://127.0.0.2:12102/balance/
```

This exports the UTXO set / balance state. Use it to verify:

- two nodes agree on the money supply / UTXO set;
- issuance was correctly made in the genesis block;
- expected funded public keys exist after genesis;
- staking or transaction tests have not accidentally created divergent balance state.

For multi-node tests, compare normalized `/balance/` output across nodes that should be on the same chain. If testing partitions/forks, compare within the intended partition and document expected divergence across partitions.

### `/options`

Example:

```bash
curl -s http://127.0.0.1:12101/options
curl -s http://127.0.0.2:12102/options
```

This returns JSON node information, including useful sync/config state such as peers and latest-block information. Use it to verify:

- peer configuration / discovered peers are as expected;
- latest block id/hash match between nodes that should be synchronized;
- a node has loaded or advanced to the expected block height;
- scenario options were applied correctly.

Practical verification pattern:

1. `npm run nettest endpoints` to list node URLs.
2. Query `/options` on all nodes and compare latest block fields for nodes that should sync.
3. Query `/balance/` on all nodes and compare UTXO/money-supply state for nodes that should agree.
4. If values differ, inspect `scripts/nettest/nodes/<n>/saito.log` and peer topology.

## Checklist for generating a new scenario

For each node:

1. Pick unique `server.host` and `server.port`.
2. Set `server.endpoint` to match.
3. Set `peers` to define topology and partitions.
4. Set `wallet.privateKey` and `wallet.publicKey` deterministically.
5. Add the wallet public key to issuance if it must have funds.
6. Set `consensus.disable_block_production` according to whether the node should produce.
7. Set `default_social_stake` / `default_social_stake_period` according to staking requirements.
8. Set `heartbeat_interval` for block-time economics.
9. Set `genesis_period` for the desired history/slip-validity/pruning window.
10. Use zeroed `blockchain` state for fresh-chain scenarios, or consistent snapshot values with copied blocks for preloaded-chain scenarios.
11. Keep `modules.config.js` appropriate for spam/admin/apps needed by the test.

After creating the scenario, deploy with:

```bash
cd /opt/saito/node
npm run nettest deploy <scenario> <branch> --noconfirm
npm run nettest start
npm run nettest endpoints
npm run nettest status
```

For Rust/WASM tests:

```bash
npm run nettest deploy <scenario> <branch> --noconfirm local
```
