# Saito game runner

A Node.js player application with its own entry point, wallet and configuration.
It uses the native `saito-js` core in SPV mode and this checkout's actual game
modules. It connects to an existing Saito node over WebSocket. It does not run a
full node, download a browser bundle, or need Chromium on the runner's VPS.

Conquest, Settlers and Twilight Struggle currently support two-player, unstaked games without turn
clocks. The decision provider can use a locally installed and authenticated Codex
CLI, or the included deterministic heuristic for fast test runs.

## Run

Use an installed checkout with its existing npm dependencies and compatible
`saito-js` / `saito-wasm` packages. No browser compilation or chain reset is needed.
Run these commands from `node/`:

```sh
cp apps/runner/config.example.json /path/to/conquest.json
# Or copy settlers.example.json or twilight.example.json from apps/runner/.
# Edit peer, dataDir and decisionProvider.executable for this machine.
npm run runner -- doctor /path/to/conquest.json
npm run runner -- list /path/to/conquest.json
npm run runner -- host /path/to/conquest.json
# On another player machine, with a different config/dataDir:
npm run runner -- join /path/to/opponent.json INVITE_ID
# After stopping or restarting:
npm run runner -- resume /path/to/conquest.json GAME_ID
```

`host` publishes an Arcade invitation, prints its ID and waits for an opponent.
A normal browser player can join it. To restrict the opponent, set
`options.desired_opponent_publickey` to their public key. `join` accepts an exact
open invite ID from `list`; short Arcade share URLs are not accepted. Hosting and
joining both continue playing until game completion, a configured limit, a
provider error, or Ctrl-C. `resume` can omit the game ID when there is exactly one
unfinished game of that module. One active game and one process per data directory
are supported. Separate simultaneous players need separate data directories.

`doctor` boots the native core, saves a wallet if needed and checks the configured
Codex executable. It does not test login or call the model. Log into Codex under
the same OS account first. If `codex` is absent from PATH, set `executable` to its
absolute path. Relative executable paths and `dataDir` resolve relative to the
configuration file. Optional `decisionProvider.model` selects a model; otherwise
Codex uses its local default. No API key is required by this application.
Commands that play games check that the configured executable starts before
connecting or joining. This checks availability, not login or model access.
`spawn codex ENOENT` means `codex` was not found on PATH; set the executable's
absolute path and rerun `daemon` with the same `dataDir` to resume the saved game.

To use the fast test policy, set `decisionProvider.type` to `heuristic`.
`timeoutMs` limits a model call; `idleTimeoutMs` stops a game that is not progressing;
`maxDecisions` bounds a run. Provider failures stop visibly without substituting a
heuristic move. No wagering, async dealing, observer play or timed play is supported.

## Daemon: watch, join, play, repeat

```sh
cp apps/runner/daemon.example.json /path/to/daemon.json
# Edit peer, dataDir and the local Codex executable.
npm run runner -- daemon /path/to/daemon.json
```

The daemon watches live Arcade updates and refreshes the invite list periodically.
It plays one match at a time, then returns to watching. `daemon.games` is its
allowlist (`Conquest`, `Settlers`, `Twilight`); the top-level `game` is still used
by the other CLI commands. Invitations must be for two players, unstaked, without
a turn clock or async dealing. Twilight requires the original deck. Invites from
the bot itself, full/expired/cancelled invites, and invites directed to another
wallet are skipped. Availability is checked again before signing a join.

Choose either behavior in the config:

| Setting | Behavior |
| --- | --- |
| `daemon.mode: "delay"` | Join after `joinDelayMs` from first seeing an eligible invite. Default delay: 60 seconds. Sends no chat messages. |
| `daemon.mode: "ask"` | Send the host `I am a bot. Should I take your Conquest invite? Reply yes or no.` (using the invited game's name). Join only on approval. |
| `daemon.consentTimeoutMs` | Stop waiting for permission after this interval; default 10 minutes. Silence never authorizes a join. |
| `daemon.community` | In ask mode, also ask in Saito Community Chat if the host has spoken there since creating the invite. Default `true`. |
| `daemon.refreshMs` | Refresh Arcade and available Community Chat history; default 30 seconds. |

Ask mode handles one invitation at a time. The host can reply `yes` or `no` in
either the direct conversation or Community Chat; no invitation code is needed.
Replies are acknowledged in the same channel. Only signed messages from that
host sent after the question in that channel count. Chat history establishes
presence only, since the server returns summaries rather than original signed
transactions. The daemon checks both history and new messages for host activity.
Set `community: false` for direct messages only. These are fixed invitation
responses, not a general chat assistant; waiting and consent parsing use no AI
model calls. Direct messages use Saito Chat's normal encryption and relay APIs.

Timers, declines, expired requests and the current match persist in the wallet's
options. Restarting with `daemon` resumes an unfinished supported game before
looking for another. Requests are marked before sending to avoid repeating a
question after a crash; a crash exactly during delivery can leave an unanswered
request which will expire. Community history availability depends on the peer's
Chat service. Games remain reserved while an opponent is idle: `idleTimeoutMs`
reports `waiting-for-opponent` instead of abandoning the match. A signed join
awaiting acceptance also stays reserved. Provider errors and decision limits
stop the daemon visibly with state saved; restart it after resolving the cause.

The command stays in the foreground; Ctrl-C stops its child and releases the
wallet lock. Use a process manager on a VPS if it should survive terminal logout.
The supervisor runs one native child at a time: an Arcade/Chat monitor, then a
fresh game process, then another monitor. They use the same wallet sequentially.
This resets each game's globals and callbacks without two clients sharing a
wallet connection. No browser is needed for monitoring or playing.

## How it works

- `index.ts` is the CLI. `runtime.js` boots native SPV networking, Relay, Arcade and
  the chosen module. Normal Arcade open/join/accept transactions establish a game.
- `games/conquest.js`, `games/settlers.js` and `games/twilight.js` contain the
  runner's adapters, exposing observations and enumerated legal action candidates.
  They call the real game modules under `mods/` and their move methods
  and queue, including encrypted decks and Conquest's battle commitment protocol.
- `loop.js` gives an observation to a provider, checks its revision again and
  submits an allowed choice. Network intake continues while the model thinks.
  Stale answers are discarded. A model cannot supply arbitrary queue commands.
- `providers/codex.js` invokes `codex exec` with a JSON output schema, an isolated
  working directory, a read-only sandbox, a timeout and bounded output. It passes
  the player's hand and public board information, excluding wallet keys, deck
  encryption keys, RNG state and opponents' private card identities. Opponent
  resource counts are visible; their individual resources are not sent.
- Presentation sinks disable screen-only methods. Small shared GameTemplate
  changes enable headless transaction processing, saves and queue continuation.
  Settlers scoring and settlement availability now use game state instead of DOM
  state. Browser gameplay continues using its usual presentation.

Adapters expose a useful finite action menu, not every strategy expressible in a
browser. Conquest offers blitz attacks and minimal/maximal deployments/occupations.
Settlers supports initial placement, building/upgrading, bank trades, development
cards, discards, robber movement and theft. It does not propose or accept trades
between players. Discard candidates are capped at 1,024 for unusually large hands.
Twilight currently supports the original deck. Its adapter uses JSDOM and the
repository's jQuery to invoke the existing country, card and menu callbacks inside
Node. It loads no remote scripts or assets and still uses native SPV networking.
This compatibility bridge is necessary because Twilight's card rules and click
handlers are intertwined. Offered targets are checked by those same handlers;
rejected targets are suppressed until the position changes. Confirmations are
explicit choices. Community decks and variants have not been enabled.

Use browser clients built from the same checkout. Twilight's changes also fix
end-of-round terminal queue ordering and Olympic Games dice synchronization.
An older hosted browser bundle can keep dealing after a winning military-ops
penalty; deploying the updated browser bundle is needed for that fix. Live browser
validation loaded the corresponding local game/framework methods into the client.

The heuristic is a test opponent, not a competitive AI.

## Persistence and stopping

The private directory contains `options.json`, isolated native-core files and a
`runner.lock`. Options include the wallet key, encrypted-deck state, checkpoints,
outstanding decisions, unsigned move drafts and a signed transaction outbox.
Twilight saves a decision-start checkpoint and a journal of local choices to
reconstruct callback closures after restart. A checkpoint that crosses an
unexpected network step fails visibly rather than replaying against the wrong
position.
Writes replace the options file atomically. Signed moves are persisted before
sending and resent while awaiting receipt. Game steps suppress duplicate moves.
Restart preserves the original wallet and battle secrets. Recovery still depends
on peers or the chain delivering missing moves; a general historical replay API
is not included.

Use Ctrl-C for a clean stop. If a machine crash leaves `runner.lock`, verify that
the old process is gone before removing that lock and resuming. Back up the entire
private directory; losing a wallet or encrypted deck can prevent a game finishing.
The runner never reads the full node's `config/options` or chain directory.
Framework debug logging is suppressed by the CLI because it can contain deck
material. stdout contains structured progress events, not prompts or private hands.

## Verification

```sh
npm run test:runner
node tests/apps/runner/match.cjs Conquest --restart
node tests/apps/runner/match.cjs Settlers --restart
node tests/apps/runner/match.cjs Twilight --restart
# Stress recovery, including pauses while the opponent owns the next choice:
node tests/apps/runner/match.cjs Twilight --restart-often
# Optional: one real Codex choice, then heuristic play to completion:
node tests/apps/runner/match.cjs Conquest --codex /absolute/path/to/codex
```

The match harness starts two real native players in separate processes, creates
an invite, joins, exchanges signed transactions, performs normal deck encryption
and plays to the ordinary victory condition. `--restart` kills and replaces a
player mid-game from its saved directory. `--restart-often` repeats this every
40 decision cycles; Twilight additionally checks that each restart preserves
VP, DEFCON, influence, hand and RNG. It checks final winner, public board,
resources and RNG agreement. Settlers tile-art variants are deliberately excluded
because the existing game chooses those images locally. Transport in this harness
is reliable IPC; it is not a replacement for browser/relay/network testing.
Artifacts are printed under a private temporary directory and include wallet
state. The focused tests cover model output validation/timeouts, stale choices,
exclusive wallet use, settlement distance, discards, blocked roads and scoring.
Daemon tests also cover delayed selection, cancellation races, consent/refusal,
expiry, restart deduplication, game handoffs and idle waiting. The Chat transport
test boots two real native wallets and exchanges encrypted DMs and signed public
messages, including rejection of a forged signature.

The runner's provider interface is `choose(decision, abortSignal) -> choiceId`.
A future Jev or other provider can implement that interface without changing
networking or game rules. Additional games need a module-specific adapter; raw
moves alone do not describe the legal choices or hidden information for all games.

The Codex integration follows the CLI's [non-interactive mode](https://developers.openai.com/codex/noninteractive)
interface; authentication and model availability are managed by the local Codex installation.
