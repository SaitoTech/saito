# Saito game runner

A Node.js player application with its own entry point, wallet and configuration.
It uses the native `saito-js` core in SPV mode and this checkout's actual game
modules. It connects to an existing Saito node over WebSocket. It does not run a
full node, download a browser bundle, or need Chromium on the runner's VPS.

Conquest supports 2–6 players and Settlers 2–4. Twilight Struggle and Paths of Glory
each support two. Games must be unstaked and have no turn clock. Set `players` to the total number of seats (default 2).
The decision provider can use a locally installed and authenticated Codex
CLI, or the included deterministic heuristic for fast test runs.

## Install dependencies on Ubuntu/Debian

Copy `apps/runner/scripts/install-vm.sh` to the VM and run `bash install-vm.sh` as root or
a user with sudo access. The script works without an existing checkout: it clones
`SaitoTech/saito` branch `2610/game-runner` into `/opt/saito`, then installs Node 22,
build dependencies, Codex CLI, PM2 and locked npm dependencies in `/opt/saito/node`.
Reruns update a matching checkout with a fast-forward-only pull. It prints the
manual login and runner startup commands after installation. Active runner configs
live in `config/` (for example, `/opt/saito/node/config/daemon.json` on the VM).

To migrate existing configs without reinstalling dependencies:

```sh
node apps/runner/scripts/configure.js
```

This creates `config/daemon.json` or moves an existing root-level `daemon.json`
there, preserving settings and the exact wallet directory. Existing root-level
Conquest, Settlers, Twilight, Paths and multi-seat configs are migrated too.
An old config path becomes a link to its new location so existing PM2 commands
continue working. Edit the file under `config/` thereafter. Existing destination
files are never overwritten; conflicting old/new files require choosing one.
Templates live in `apps/runner/config/`; generated configs and links are Git-ignored.
New configs keep wallet data under `node/runner-data/`, outside `config/`.

## Run

Use an installed checkout with its existing npm dependencies and compatible
`saito-js` / `saito-wasm` packages. No browser compilation or chain reset is needed.
Run these commands from `node/`:

```sh
node apps/runner/scripts/configure.js conquest
# Or use: node apps/runner/scripts/configure.js settlers twilight paths
# Edit peer, dataDir and decisionProvider.executable for this machine.
npm run runner -- doctor ./config/conquest.json
npm run runner -- list ./config/conquest.json
npm run runner -- host ./config/conquest.json
# On another player machine, with a different config/dataDir:
npm run runner -- join ./config/opponent.json INVITE_ID
# After stopping or restarting:
npm run runner -- resume ./config/conquest.json GAME_ID
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
`timeoutMs` limits a model call; `idleTimeoutMs` bounds standalone waits before a game has opponents;
`maxDecisions` bounds successful decision attempts. Engine availability failures
use the recovery policy below; invalid output and other errors still stop visibly.
The runner never substitutes a heuristic move for a failed model call. No wagering, async dealing, observer play or timed play is supported.

## Multiple bot seats in one game

```sh
node apps/runner/scripts/configure.js multi
# Edit peer, dataDir and decisionProvider.executable.
# Host a four-player Settlers game: three bots, one open seat for you.
npm run runner -- multi-host ./config/multi.json
# Alternatively, put those three bots into an existing four-player invite:
npm run runner -- multi-join ./config/multi.json INVITE_ID
# After stopping, a provider error, or a restart:
npm run runner -- multi-resume ./config/multi.json
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
Once joined, the inactivity warning and cancellation policy below applies.
`maxDecisions` applies separately to each worker run.

Invites and signed joins are saved before sending; restarting reuses them.
`multi-resume` also works after only some bots joined. Repeating `multi-host` or
the same `multi-join` command resumes its unfinished session. It never silently
starts a replacement game. Keep the same peer, game, player count, seat count and
data directory when resuming; model settings may change. A completed session can
be followed by a new `multi-host`/`multi-join` using the same wallets.

Ctrl-C stops all managed workers and releases their locks. An unrecoverable worker
failure stops the other managed seats too and preserves their state for resume.
Engine availability failures follow the retry/forfeit policy below.
Already-signed joins cannot be rolled back locally. The supervisor checks for
duplicate/replaced wallets and refuses to occupy a seat belonging to a different
unfinished game. Back up the entire `dataDir`, including all seat directories.
All managed seats must finish and agree on the winner before the supervisor
reports `multi-complete`. Logs include a `seat` field to distinguish bot activity.

## Daemon: watch, join, play, repeat

```sh
node apps/runner/scripts/configure.js daemon
# Edit peer, dataDir and the local Codex executable.
npm run runner -- daemon ./config/daemon.json
```

The daemon checks the current Arcade invite list at startup and after finishing
each game, as well as watching live updates and refreshing periodically. In ask
mode it waits five seconds after first seeing an eligible invite before offering
to take it, one host at a time, and waits
for a `yes` before joining. Invites that temporarily disappeared are reconsidered
when they return if their host has not already been asked. Declined, unanswered
expired requests and completed invites are not asked again.
It plays one match at a time, then returns to watching. `daemon.games` is its
allowlist (`Conquest`, `Settlers`, `Twilight`, `PathsOfGlory`); the top-level `game` is still used
by the other CLI commands. Invitations must match `players`, be unstaked, without
a turn clock or async dealing. Twilight accepts original, optional, late-war and saito decks. Invites from
the bot itself, full/expired/cancelled invites, and invites directed to another
wallet are skipped. Availability is checked again before signing a join.

Choose either behavior in the config:

| Setting | Behavior |
| --- | --- |
| `daemon.mode: "delay"` | Join after `joinDelayMs` from first seeing an eligible invite. Default delay: 60 seconds. Sends no invitation-consent messages. |
| `daemon.mode: "ask"` | Wait five seconds from first seeing the invite, then send the host `I am a bot. Should I take your Conquest invite? Reply yes or no.` (using the invited game's name). Join only on approval. |
| `daemon.consentTimeoutMs` | Stop waiting for permission after this interval; default 10 minutes. Silence never authorizes a join. |
| `daemon.community` | In ask mode, also ask in Saito Community Chat if the host has spoken there since creating the invite. Default `true`. |
| `daemon.refreshMs` | Refresh Arcade and available Community Chat history; default 30 seconds. |

Ask mode handles one invitation at a time. The host can reply `yes` or `no` in
either the direct conversation or Community Chat; no invitation code is needed.
Replies are acknowledged in the same channel. Only signed messages from that
host sent after the question in that channel count. Chat history establishes
presence only, since the server returns summaries rather than original signed
transactions. The daemon checks both history and new messages for host activity.
Set `community: false` for direct messages only. Invitation responses are fixed; waiting and consent parsing use no AI
model calls. In-game conversation is described below. Direct messages use Saito Chat's normal encryption and relay APIs.

Timers, declines, expired requests and the current match persist in the wallet's
options. Restarting with `daemon` resumes an unfinished supported game before
looking for another. Requests are marked before sending to avoid repeating a
question after a crash; a crash exactly during delivery can leave an unanswered
request which will expire. Community history availability depends on the peer's
Chat service. An idle match follows the inactivity policy below. A signed join
awaiting acceptance stays reserved and reports `waiting-for-opponent` at each
`idleTimeoutMs` interval. Invalid model output, game errors and decision limits
stop the daemon visibly with state saved; engine availability failures recover as
described below.

The command stays in the foreground; Ctrl-C stops its child and releases the
wallet lock. Use a process manager on a VPS if it should survive terminal logout.
The supervisor runs one native child at a time: an Arcade/Chat monitor, then a
fresh game process, then another monitor. They use the same wallet sequentially.
This resets each game's globals and callbacks without two clients sharing a
wallet connection. No browser is needed for monitoring or playing.

## Engine and connection recovery

A model-call timeout, failed engine process startup, or nonzero engine exit is
reported as `engine-unavailable` and retried. `decisionProvider.maxAttempts`
defaults to **3** (including the initial attempt); `decisionProvider.retryDelayMs`
defaults to **30000**. The existing `timeoutMs` still limits each individual call.
Retries do not spend the move decision limit, and each retry uses the current
decision rather than applying an answer to an obsolete game position.

After a failure the runner probes Saito with a fresh Arcade RPC (up to ten
seconds). If Saito does not answer, it reports `waiting-for-network`, pauses
engine attempts, and checks again after the retry delay. A general connection
outage resets the engine failure budget: losing laptop/VM networking alone does
not cause a forfeit. Incoming transactions continue to be processed while waiting.
Ctrl-C interrupts these waits. Daemon bootstrap connection failures, HTTP 5xx
responses and initial Arcade discovery timeouts also retry in a fresh worker.

If Saito is reachable but the engine fails all three attempts, the runner sends
each opponent a fixed direct message explaining that its engine is unavailable
and it cannot continue, then sends a signed **forfeit** awarding the other
players the win. This notice needs no model call. A failed notice is retried;
previously sent notices are recorded to avoid repeating them. The terminal
transaction remains in the outbox for retransmission for 24 hours. The daemon
waits five minutes before accepting another invitation after an engine forfeit.
This is distinct from inactivity cancellation, which awards no winner.

Malformed model output, game-rule errors and invalid configuration still stop
visibly. The startup executable check still runs before opening/joining a game.
Future engine providers should set error code `ENGINE_UNAVAILABLE` for
availability failures to use this same recovery policy. Chat-only model failures
remain nonfatal and do not by themselves forfeit a game.

## In-game chat

Once the player roster is accepted, each runner sends every opponent a direct
message: `GLHF! I'm a Saito runner bot. Have fun!` Greetings are recorded per game
and opponent, so restarting the daemon or resuming the match does not repeat them.
An existing saved match receives a greeting the first time it runs with this feature.

During the match, the runner answers new signed direct messages from opponents.
It uses the configured Codex executable/model for short, friendly replies (at
most 500 characters), with the game name and up to eight recent messages from
that opponent. It does not send the wallet, private cards, game state or other
opponents' conversations to the chat prompt. The heuristic test provider uses a
fixed friendly acknowledgement instead.

Chat replies run in the background, with one request at a time per runner and
at least ten seconds between requests. Multi-seat chat uses the same model
capacity limit as moves. Messages arriving while a move is being chosen are
processed on the next play-loop iteration. Public Community Chat and nonplayer
messages are ignored during games. Automated runner messages are marked and do
not trigger replies, invitation consent or inactivity extensions.

Handled message signatures and a short conversation history persist with the
wallet. Greetings and replies are claimed before sending/model work to avoid
repeat messages after a crash; interruption during delivery can lose that message.
Chat failures are reported as `chat-error` and do not stop gameplay. Pending chat
is cancelled on shutdown, and late answers are discarded after game completion.
Chat cannot submit moves or change the game; only the explicit inactivity reply
policy below grants extra time. Its extension acknowledgement suppresses a second
conversational reply to the same message.

## Inactive opponents

All playing modes send a direct Chat warning after five minutes without game
progress while the runner has no decision to make. Chat is enabled for playing
even when the daemon uses delayed joining rather than asking for consent.

- Without a reply or move, the game is cancelled one minute after the warning.
- A signed direct reply from an opponent received within that minute grants one
  five-minute extension, measured from receipt. The runner acknowledges it.
- Further chat does not extend that deadline. A move/game progress resets the
  inactivity cycle; the runner's own decisions also clear a pending warning.
- At a table with several opponents, each receives the warning; any opponent's
  timely direct reply grants the single extension for the table.

Warnings, deadlines and extensions persist across restarts. Old messages, public
Chat messages and messages from nonplayers do not count as replies. This does not
use AI calls. Cancellation uses a signed gameover with reason `cancellation` and
no winner. The daemon then returns to matchmaking; standalone play finishes.
Cancellation and forfeit transactions remain available for retransmission for 24 hours while
the runner is running, including during daemon matchmaking, so an opponent who
reconnects can receive the result. Delivery still depends on the network. Retries use the original signed recipients,
even in watch mode with no game module loaded. Worker failures report their original
stack trace through the supervisor.

These timers replace `idleTimeoutMs` for established games. Before an opponent
joins, the existing standalone timeout / daemon reservation behavior still applies.

## Source layout

```text
apps/runner/
  index.ts              CLI entry point and command coordination
  config/               Example JSON configurations
  lib/                  Runtime, storage, play loop, chat and recovery
    daemon/             Invitation policy, supervisor and worker
    multi/              Multi-seat coordinator, processes and workers
    games/              Game-specific adapters
    providers/          Decision engines and executable checks
  scripts/              Configuration setup and VM installation
  README.md
```

`npm run runner` still starts `index.ts`. Setup scripts live under `scripts/`:
use `node apps/runner/scripts/configure.js` from `node/`. The templates in
`apps/runner/config/` are inputs to that script; machine-specific configurations
remain in `node/config/`, and wallets remain in their configured data directories.
Runner tests and native match harnesses live in `tests/apps/runner/`.

## How it works

- `index.ts` is the CLI. `lib/runtime.js` boots native SPV networking, Relay, Arcade and
  the chosen module. Normal Arcade open/join/accept transactions establish a game.
- `lib/games/conquest.js`, `lib/games/settlers.js` and `lib/games/twilight.js` contain the
  runner's adapters, exposing observations and enumerated legal action candidates.
  They call the real game modules under `mods/` and their move methods
  and queue, including encrypted decks and Conquest's battle commitment protocol.
- `lib/loop.js` gives an observation to a provider, checks its revision again and
  submits an allowed choice. Network intake continues while the model thinks.
  Stale answers are discarded. A model cannot supply arbitrary queue commands.
- `lib/providers/codex.js` invokes `codex exec` with a JSON output schema, an isolated
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
Twilight supports `options.deck` values `original`, `optional`, `late-war` and
`saito`. Hosting defaults to `original`; an invitation without a deck field uses
the game engine’s optional-card behavior. Joining and resuming use the invitation
or saved game options, independently of the hosting default. Its adapter uses JSDOM and the
repository's jQuery to invoke the existing country, card and menu callbacks inside
Node. It loads no remote scripts or assets and still uses native SPV networking.
This compatibility bridge is necessary because Twilight's card rules and click
handlers are intertwined. Offered targets are checked by those same handlers;
rejected targets are suppressed until the position changes. Confirmations are
explicit choices. Saito Edition includes dynamic deck changes and mid/late-war
card selections; Late War uses the module's scenario setup and victory rules.
The provider sees public variant event markers, its own hand, and cards revealed
or offered to that seat by the game. A reveal is labelled with its game step;
it is historical information, not a claim about the opponent's current hand.

Individual card additions/removals can be supplied in `options`, using the game
wizard's card IDs (for example, `"peronism": 1`). The engine checks key presence,
so omit a card option to leave it unchanged; setting it to `0` does not disable
it. Custom combinations use the same callbacks but are not exhaustively tested.
`endofhistory` and `coldwarcrazies` are not supported named presets; their cards
can be selected individually, except `berlinairlift` and `titostalin`, whose
existing event handlers are incomplete and are explicitly rejected.
Timed, staked and async-dealing games remain
unsupported.

Paths of Glory uses `game: "PathsOfGlory"` and the original campaign. Its local
DOM bridge invokes the existing card, operations, movement, combat, retreat,
reinforcement and replacement callbacks, including loss-assignment panels. Each
seat sees the public map, tracks and event markers plus its own hand. Separate
native processes hold the two encrypted decks; neither the coordinator nor the
other seat's model receives a private hand. Synchronous legacy confirmations are
paused and surfaced as yes/no choices. Unknown or stale targets fail visibly.

To run both sides with the local Codex CLI:

```sh
node apps/runner/scripts/configure.js paths
# Set decisionProvider.executable to your installed Codex binary.
npm run runner -- multi-host ./config/paths.json
npm run runner -- multi-resume ./config/paths.json
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

Use Ctrl-C for a clean stop. The CLI reports `stopping`, waits for its workers,
releases the wallet lock, then reports `stopped`. Allow up to ten seconds if an
operation is stuck. Repeated Ctrl-C and signals forwarded by npm do not bypass
this cleanup; a normal Ctrl-C restart does not require deleting a lock.
Daemon workers also exit within ten seconds of losing
their supervisor. If a crash leaves `runner.lock`, the error reports the owner PID
and whether it is still running. A lock does not stop a process: deleting a live
runner's lock can allow two processes to write the same wallet. Verify that the
owner and any orphan `daemon-worker.js` / `multi-worker.js` processes for that
runner have exited before removing a stale lock and resuming. Back up the entire
private directory; losing a wallet or encrypted deck can prevent a game finishing.
The runner never reads the full node's `config/options` or chain directory.
Framework debug logging is suppressed by the CLI because it can contain deck
material. stdout contains structured progress events, not prompts or private hands.

## Verification

```sh
npm run test:runner
node tests/apps/runner/match.cjs Conquest --restart
# Verify cancellation also completes when the runner is the guest:
node tests/apps/runner/match.cjs Conquest --cancel-guest
node tests/apps/runner/match.cjs Twilight --forfeit-guest
node tests/apps/runner/match.cjs Settlers --restart
node tests/apps/runner/match.cjs Twilight --restart
node tests/apps/runner/match.cjs Twilight --deck optional --restart
node tests/apps/runner/match.cjs Twilight --deck late-war --restart
node tests/apps/runner/match.cjs Twilight --deck saito --restart-often
# Custom card options, using the same option keys as the browser wizard:
node tests/apps/runner/match.cjs Twilight --deck optional --options '{"peronism":1}' --restart
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
