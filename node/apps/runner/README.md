# Saito game runner

A Node.js player application with its own entry point, wallet and configuration.
It uses the native `saito-js` core in SPV mode and this checkout's actual game
modules. It connects to an existing Saito node over WebSocket. It does not run a
full node, download a browser bundle, or need Chromium on the runner's VPS.

Conquest supports 2–6 players and Settlers 2–4. Twilight Struggle and Paths of Glory
each support two. Games must be unstaked and have no turn clock. Set `players` to the total number of seats (default 2).
The decision provider can use a locally installed and authenticated Codex
CLI, or the included deterministic heuristic for fast test runs.

## Run

Use an installed checkout with its existing npm dependencies and compatible
`saito-js` / `saito-wasm` packages. No browser compilation or chain reset is needed.
Run these commands from `node/`:

```sh
cp apps/runner/config.example.json /path/to/conquest.json
# Or copy settlers.example.json, twilight.example.json or paths.example.json from apps/runner/.
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
The multi-seat supervisor below manages those directories and processes for you.

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

## Multiple bot seats in one game

```sh
cp apps/runner/multi.example.json /path/to/multi.json
# Edit peer, dataDir and decisionProvider.executable.
# Host a four-player Settlers game: three bots, one open seat for you.
npm run runner -- multi-host /path/to/multi.json
# Alternatively, put those three bots into an existing four-player invite:
npm run runner -- multi-join /path/to/multi.json INVITE_ID
# After stopping, a provider error, or a restart:
npm run runner -- multi-resume /path/to/multi.json
```

`players` is the total table size; `multi.seats` is how many wallets the runner
controls. For three bots and one human, use `players: 4` and `multi.seats: 3`.
For an entirely automated match, make those numbers equal. Hosting uses the first
bot as the host, joins the others in order, and leaves the remaining seats open.
Joining an existing invitation first checks that all configured bots can fit.
These commands use an explicit game/invitation and run one match; they do not
watch for new games or use daemon chat consent. The ordinary `daemon` command
still controls one seat.

Each bot gets a native child process and its own wallet/checkpoints under
`dataDir/seats/bot-1/`, `bot-2/`, etc. The same seat names and wallets are reused
on resume. A small `multi-session.json` records the invitation ID, public keys,
roles and completion status. It contains no hands, deck secrets or model prompts.
Bot labels identify wallets; the game engine still assigns their in-game seat order.
The supervisor never merges the seats' observations: each worker invokes the
configured provider with only its own observation, just like the single player.
Model calls are independent; bots do not collaborate or share hidden hands.

`multi.maxConcurrentDecisions` limits concurrent decisions across the bot seats
(default 1). This lets all seats use the same local Codex installation without
starting a model call for every simultaneous discard. Network intake continues
while a seat waits for capacity, and stale choices are discarded.
`multi.joinTimeoutMs` bounds discovery and acknowledgement waits (default 60 seconds).
Once joined, an idle opponent causes a progress report instead of abandoning the
game. `maxDecisions` applies separately to each worker run.

Invites and signed joins are saved before sending; restarting reuses them.
`multi-resume` also works after only some bots joined. Repeating `multi-host` or
the same `multi-join` command resumes its unfinished session. It never silently
starts a replacement game. Keep the same peer, game, player count, seat count and
data directory when resuming; model settings may change. A completed session can
be followed by a new `multi-host`/`multi-join` using the same wallets.

Ctrl-C stops all managed workers and releases their locks. A worker/provider
failure stops the other managed seats too and preserves their state for resume.
Already-signed joins cannot be rolled back locally. The supervisor checks for
duplicate/replaced wallets and refuses to occupy a seat belonging to a different
unfinished game. Back up the entire `dataDir`, including all seat directories.
All managed seats must finish and agree on the winner before the supervisor
reports `multi-complete`. Logs include a `seat` field to distinguish bot activity.

## Daemon: watch, join, play, repeat

```sh
cp apps/runner/daemon.example.json /path/to/daemon.json
# Edit peer, dataDir and the local Codex executable.
npm run runner -- daemon /path/to/daemon.json
```

The daemon watches live Arcade updates and refreshes the invite list periodically.
It plays one match at a time, then returns to watching. `daemon.games` is its
allowlist (`Conquest`, `Settlers`, `Twilight`, `PathsOfGlory`); the top-level `game` is still used
by the other CLI commands. Invitations must match `players`, be unstaked, without
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

Paths of Glory uses `game: "PathsOfGlory"` and the original campaign. Its local
DOM bridge invokes the existing card, operations, movement, combat, retreat,
reinforcement and replacement callbacks, including loss-assignment panels. Each
seat sees the public map, tracks and event markers plus its own hand. Separate
native processes hold the two encrypted decks; neither the coordinator nor the
other seat's model receives a private hand. Synchronous legacy confirmations are
paused and surfaced as yes/no choices. Unknown or stale targets fail visibly.

To run both sides with the local Codex CLI:

```sh
cp apps/runner/paths.example.json ./paths.json
# Set decisionProvider.executable to your installed Codex binary.
npm run runner -- multi-host ./paths.json
npm run runner -- multi-resume ./paths.json
```

Use `host`, `join` or `daemon` with the same game name for a single bot against a
human. The heuristic is a smoke-test policy; completing a match does not establish
strong play or exhaustive coverage of every card interaction.

Paths browser opponents need the updated game sources: victory screens now send
the terminal game transaction, and campaign end/armistice use the standard campaign
thresholds in [GMT rules 5.5 and 16.2](https://www.gmtgames.com/living_rules/POG_Rules-2010.pdf).
The loss panel also keeps destroyed army tokens disabled when a corps replaces them.
Salonika excludes corps already at the destination, and an empty mandated offensive
is treated as fulfilled without assigning an undefined variable. Later-card tests
also corrected Army of Islam reinforcements and offensive bonuses that replayed
operations. Siege cancellation uses snapshot undo instead of reloading the browser;
unit callbacks and the runner journal are restored with it.
Moving out of a fort preserves its current ownership, including countries that
joined after setup; resetting these to neutral caused asymmetric siege rolls and
eventually corrupted encrypted card shuffles.
Reinforcements retain the same stack order on both seats, and Landwehr can pass
its optional repairs without an undefined variable.
This is the original campaign, without tournament bidding or optional historical
endgame modifiers. Testing/variant decks are rejected.

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
Twilight and Paths of Glory save a decision-start checkpoint and a journal of local choices to
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
# Three coordinated bots plus a separate fourth native player:
node tests/apps/runner/multi-match.cjs Settlers --restart
node tests/apps/runner/multi-match.cjs Settlers --join
node tests/apps/runner/multi-match.cjs Conquest
# Both Paths of Glory seats, using the production coordinator:
node tests/apps/runner/paths-match.cjs --restart
# One real Codex choice per seat (and again after a restart), then heuristic play:
node tests/apps/runner/paths-match.cjs --restart --codex /absolute/path/to/codex
# Optional public-position and hashed RNG diagnostics in the private seat logs:
RUNNER_PATHS_TRACE=1 node tests/apps/runner/paths-match.cjs --restart
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
The multi-seat harness runs the actual supervisor and native workers, using a
separate fourth player to exercise a partly automated table. Settlers uses a
five-point target to keep this coordination test short. It checks all four seats'
winner, public board and RNG agreement. `--restart` pauses the group mid-game and
resumes the same wallets; `--join` makes the independent player host the invite.
Its reliable IPC transport replays messages missed
during the pause; live recovery still depends on peer/chain delivery.

The runner's provider interface is `choose(decision, abortSignal) -> choiceId`.
A future Jev or other provider can implement that interface without changing
networking or game rules. Additional games need a module-specific adapter; raw
moves alone do not describe the legal choices or hidden information for all games.

The Codex integration follows the CLI's [non-interactive mode](https://developers.openai.com/codex/noninteractive)
interface; authentication and model availability are managed by the local Codex installation.
