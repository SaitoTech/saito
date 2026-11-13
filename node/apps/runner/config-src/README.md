# Game runner configuration guide

Use this guide to update a runner's node connection, decision engine, chat engine,
or game settings. Run all commands from the repository's `node/` directory.
The implementation reference is [the runner README](../README.md).

## Files and ownership

| Location | Purpose |
| --- | --- |
| `apps/runner/config/agents.json` | Private named connections, including credentials. |
| `apps/runner/config/<name>.json` | Private game, daemon, or multi-seat settings. Any filename is allowed when passed to the CLI. |
| `apps/runner/config-src/` | Tracked examples and the source of this guide. Never add real credentials here. |
| `dataDir` in each game config | Wallet, saved games, encrypted deck state, logs and locks. Preserve it when changing engines or resuming. |

The entire `config/` directory is Git-ignored. Keep private JSON files at mode
0600. Update individual fields and preserve unrelated settings, especially
credentials and wallet paths. Do not print `agents.json`, the full resolved
configuration, or wallet files in terminal/chat output: they can contain secrets.

Setup creates missing files and migrates older root-level or `node/config/`
runner configs. It preserves existing settings, wallet paths and compatibility
links. It never overwrites existing configs, connections, or this guide:

```sh
node apps/runner/scripts/configure.js conquest settlers twilight paths daemon multi
```

Updating templates does not update existing private configs. Merge the requested
fields into those files explicitly. When maintaining this guide, update
`config-src/README.md` and the local `config/README.md` together.

## Named connections

`agents.json` contains a `connections` array. IDs must be unique and contain only
letters, digits, underscores or hyphens. Supported types are `codex`, `jev`, and
`heuristic`.

```json
{
  "connections": [
    {
      "id": "local-codex",
      "type": "codex",
      "executable": "codex",
      "timeoutMs": 120000,
      "env": {}
    },
    {
      "id": "jev",
      "type": "jev",
      "endpoint": "https://api.typesafe.ai/v1/systemone",
      "model": "jev-latest",
      "apiKeyEnv": "TYPESAFE_API_KEY",
      "timeoutMs": 120000
    },
    { "id": "heuristic", "type": "heuristic" }
  ]
}
```

For Codex, `executable` can be a command on PATH or an absolute path. Relative
paths containing `/` resolve beside the agents file. Optional `model` overrides
the CLI's model choice; `env` supplies string environment variables to the CLI.
Use the authentication supported by the installed CLI under the runner's account.

Jev authenticates with one bearer token. Set `apiKey` directly in its private
connection, or use the variable named by `apiKeyEnv` (default `TYPESAFE_API_KEY`).
Credential precedence is: nonempty `apiKey`, then the connection's `env` entry,
then the process environment. An unused Jev connection may omit credentials;
selecting it for a run requires a token. Jev endpoints require HTTPS, with HTTP
allowed only for loopback testing. Redirects are not followed.

All connections default to `timeoutMs: 120000`, `maxAttempts: 3`, and
`retryDelayMs: 30000`. The timeout must be at least 100 milliseconds; attempt and
retry-delay values must be positive integers. Availability failures use the
runner's retry policy and can eventually forfeit a game. Jev authentication and
invalid-response errors stop the run instead of selecting a fallback move.

## Game settings and engine selection

This example hosts a two-player Conquest game using Jev, with open chat disabled:

```json
{
  "peer": "wss://ksaito.hda0.net/wsopen",
  "game": "Conquest",
  "players": 2,
  "agent": "jev",
  "chatAgent": null,
  "dataDir": "../../../runner-data/conquest-jev-ksaito",
  "options": { "conquest_setup": "quick", "turn_limit": 0 },
  "pollMs": 250,
  "idleTimeoutMs": 1800000,
  "maxDecisions": 10000
}
```

The local test config, when present, is `conquest-jev-ksaito.json`. Its node is
**ksaito.hda0.net**, not ksaito.saito.io. Change `peer` for other deployments.
The peer must use `ws://` or `wss://`, end in `/wsopen`, and contain no credentials,
query, or fragment. Use a valid certificate for a secure endpoint.

| Setting | Meaning |
| --- | --- |
| `game` | Exact module name: `Conquest`, `Settlers`, `Twilight`, or `PathsOfGlory`. |
| `players` | Total seats: Conquest 2–6, Settlers 2–4, Twilight/PathsOfGlory exactly 2. Default 2. |
| `agent` | Default decision connection ID from `agents.json`. |
| `gameAgents` | Optional map of module names to decision connection IDs; overrides `agent` for those games, including the top-level game. |
| `chatAgent` | Independent LLM connection ID for open chat. Currently must be `codex`; omitted or `null` disables open chat. |
| `agentsFile` | Optional path to the registry, relative to this config. Default sibling `agents.json`. |
| `dataDir` | Wallet directory relative to the config file, or an absolute path. For configs in this folder, `../../../runner-data/<name>` means `node/runner-data/<name>`. |
| `pollMs` | Loop interval in milliseconds; default 250. |
| `idleTimeoutMs` | Standalone wait before opponents join; default 600000. Established games use the inactivity policy in the runner README. |
| `maxDecisions` | Successful selection limit per worker run; default 10000. Each individual discard selection counts. |

Programmed invitations, consent parsing, greetings and inactivity messages run in
code and need no LLM. Jev cannot provide open chat; selecting it as `chatAgent`
is rejected. Changing `gameAgents` does not change the chat engine.

Games must be unstaked, without a turn clock, open tables, or async dealing.
Conquest supports `conquest_setup: "quick"`. Settlers `game_length` is 5–20
(default 10). Twilight defaults to the original deck; see the runner README for
supported deck variants and card options. PathsOfGlory supports only the original
campaign. Joining/resuming uses the game's invitation or saved options.

Older configs can still use inline `decisionProvider` instead of named agents.
To migrate one, copy its provider settings into a named connection, remove
`decisionProvider`, and set `agent`. Do not combine `decisionProvider` with
`agent` or `gameAgents`. Legacy inline decisions can use a separate `chatAgent`.

## Daemon and multi-seat modes

A daemon can choose different engines by game:

```json
{
  "agent": "jev",
  "gameAgents": {
    "Conquest": "jev",
    "Settlers": "jev",
    "Twilight": "local-codex",
    "PathsOfGlory": "local-codex"
  },
  "chatAgent": "local-codex",
  "daemon": {
    "games": ["Conquest", "Settlers"],
    "mode": "ask",
    "joinDelayMs": 60000,
    "consentTimeoutMs": 600000,
    "refreshMs": 30000,
    "community": true
  }
}
```

This is a fragment to merge into a complete game config. `daemon.games` is the
allowlist; all allowed games need a resolvable engine. `delay` mode joins after
`joinDelayMs`; `ask` offers after five seconds and requires the host's consent.
`community` controls community consent messages. `players` still controls table
size across the daemon's allowed games. A daemon resumes unfinished games before
looking for another invitation.

For multi-seat play, set `players` to the total table size and `multi.seats` to the
number of bots. For example, `players: 4` and `multi.seats: 3` leaves one human
seat. `multi.maxConcurrentDecisions` defaults to 1 and limits simultaneous model
calls, including chat. `multi.joinTimeoutMs` defaults to 60000. All managed seats
use the selected game's engine, each with an isolated observation and wallet.

## Validate and run

After editing, validate without printing secrets, opening a wallet, or making a
network/model request. Replace the filename with the config you changed:

```sh
node - <<'JS'
const { loadConfig } = require('./apps/runner/lib/config');
loadConfig('apps/runner/config/conquest-jev-ksaito.json');
console.log('Configuration valid');
JS
```

With no other runner using that wallet, `doctor` checks startup and local provider
configuration. It may create/save the wallet. For Jev it checks token presence,
not remote authentication. It does not make a model call:

```sh
npm run runner -- doctor apps/runner/config/conquest-jev-ksaito.json
```

To test the selected engine, this command makes one real model request (which may
be billed) and prints only the provider and chosen test action. It does not open
a wallet, connect to Saito, or join a game:

```sh
node apps/runner/scripts/check-decision.js apps/runner/config/conquest-jev-ksaito.json
```

Config edits apply at process startup. Stop the specific runner cleanly before
restarting; do not kill the Saito server or other runners. Preserve `dataDir`,
wait for the process to release its lock, and resume unfinished games:

```sh
npm run runner -- resume apps/runner/config/conquest-jev-ksaito.json GAME_ID
# For a new invitation, after any previous game is complete:
npm run runner -- host apps/runner/config/conquest-jev-ksaito.json
# To join someone else's open invitation:
npm run runner -- join apps/runner/config/conquest-jev-ksaito.json INVITE_ID
# For a daemon or coordinated seats, use the matching mode:
npm run runner -- daemon apps/runner/config/daemon.json
npm run runner -- multi-resume apps/runner/config/multi.json
```

Do not delete a live `runner.lock`, reset a wallet, or change `dataDir` to work
around a lock or resume error. A distinct simultaneous runner needs a distinct
wallet directory. Do not launch hosting, matchmaking, or paid model probes merely
to validate an edit unless that operation is within the user's requested work.

## Implementation references

- [Config loader and validation](../lib/config.js)
- [Connection selection and precedence](../lib/agents.js)
- [Jev HTTP transport and authentication](../lib/providers/jev.js)
- [Shared decision format](../lib/providers/decision-format.js)
- [Config creation and migration](../scripts/configure.js)
- [Connection test](../scripts/check-decision.js)

Both model engines receive the same state and legal criteria. Answers use
`answers.move.choice`; the runner checks legality and stale state before applying
a move. Requests allow 1–255 choices, without truncation. Large compound decisions
must be decomposed into smaller selections; Settlers discards already choose one
resource at a time and submit the complete discard together.
