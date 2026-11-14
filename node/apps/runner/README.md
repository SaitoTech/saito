# Saito game runner

A Node.js player application with its own entry point, wallet and configuration.
It uses the native `saito-js` core in SPV mode and this checkout's actual game
modules. It connects to an existing Saito node over WebSocket. It does not run a
full node, download a browser bundle, or need Chromium on the runner's VPS.

Conquest supports 2–6 players and Settlers 2–4. Twilight Struggle and Paths of Glory
each support two. Games must be unstaked and have no turn clock. Set `players` to the total number of seats (default 2).
The decision provider can use a locally installed and authenticated Codex
CLI, the Jev HTTP API, or the included deterministic heuristic for fast test runs.

## Install dependencies on Ubuntu/Debian

Copy `apps/runner/scripts/install-vm.sh` to the VM and run `bash install-vm.sh` as root or
a user with sudo access. The script works without an existing checkout: it clones
`SaitoTech/saito` branch `2610/game-runner` into `/opt/saito`, then installs Node 22,
build dependencies, Codex CLI, PM2 and locked npm dependencies in `/opt/saito/node`.
Reruns update a matching checkout with a fast-forward-only pull. It prints the
manual login and runner startup commands after installation. Active runner configs
live in `apps/runner/config/` (for example, `/opt/saito/node/apps/runner/config/daemon.json` on the VM).

To migrate existing configs without reinstalling dependencies:

```sh
node apps/runner/scripts/configure.js
```

This creates `apps/runner/config/daemon.json` or moves an existing root-level `daemon.json`
there, preserving settings and the exact wallet directory. Existing root-level
Conquest, Settlers, Twilight, Paths and multi-seat configs are migrated too.
An old config path becomes a link to its new location so existing PM2 commands
continue working. Edit the file under `apps/runner/config/` thereafter. Existing destination
files are never overwritten; conflicting old/new files require choosing one.
Templates live in `apps/runner/config-src/`; generated configs and links are Git-ignored.
Configs previously under `node/config/` are migrated with compatibility links too.
New configs keep wallet data under `node/runner-data/`, outside `config/`.

A field reference and update workflow is in [the configuration guide](config-src/README.md).
Setup also installs it as `config/README.md` without replacing an existing copy.

## Private agent connections

Setup creates `apps/runner/config/agents.json` alongside the game configs. The
entire `config/` directory is Git-ignored, including custom filenames and backups;
only `config-src/` contains tracked templates. Generated files have mode 0600.
Never put real credentials in templates.

`agents.json` contains an array of named connections:

```json
{
  "connections": [
    { "id": "local-codex", "type": "codex", "executable": "codex", "env": {} },
    { "id": "other-account", "type": "codex", "executable": "/path/to/provider-wrapper", "env": { "MY_PROVIDER_API_KEY": "replace-locally" } },
    { "id": "heuristic", "type": "heuristic" }
  ]
}
```

Each game config selects a connection with `"agent": "local-codex"`.
The daemon also has a `gameAgents` map from game names to connection IDs; those
entries override `agent` for game decisions, including resumed games.
Open chat uses a separate `chatAgent` connection; it does not follow `gameAgents`. Multi-seat runs use the selected game's connection for every seat.
Set `"chatAgent": "local-codex"` to enable open chat with an LLM connection, or
`"chatAgent": null` to disable it. Omitting `chatAgent` also disables open chat,
including in legacy inline-provider configs. Templates explicitly enable it.
Unknown IDs, duplicate IDs, non-LLM chat agents and invalid connection settings fail at config load.

Connections support the existing provider settings (`type`, `executable`, `model`,
`timeoutMs`, `maxAttempts`, `retryDelayMs`) plus `env`. Environment entries override
the inherited environment only in the provider subprocess, so API keys need not
appear in command arguments. Use the variable names required by your installed
CLI or wrapper; a wrapper must implement the same CLI contract as the Codex provider.
Connection types are `codex`, `jev`, and `heuristic`. Jev calls TypeSafe directly
over HTTP; it does not use the CLI or a middleware service. Configs use sibling `agents.json` by default; `agentsFile` can specify
another file relative to the game config. Restart runners after editing settings.

Existing inline `decisionProvider` configs remain supported and migration preserves
them. To switch one, move its provider settings into a connection in `agents.json`,
remove `decisionProvider`, and set `agent`. Do not combine inline settings with
named agents. Setup never overwrites existing configs or `agents.json`.

## Jev connections and shared decision format

The `jev` connection template uses TypeSafe's `https://api.typesafe.ai/v1/systemone`
endpoint and `jev-latest`. Add your token to the **private** `config/agents.json`
connection as `"apiKey": "your-token"`, or set `TYPESAFE_API_KEY` in the runner
process environment. `apiKeyEnv` can select another variable; a connection's `env`
map takes precedence over the process environment, and `apiKey` takes precedence
over both. The API authenticates with one bearer token, not a public/private key pair.
Never put a real token in `config-src/`.

Select `"agent": "jev"` in the game config. For daemon play, change the relevant
`gameAgents` entries too, as they override `agent`. Keep `"chatAgent": "local-codex"`
for open chat, or set it to `null` for only programmed messages. Jev cannot be
selected as an open-chat connection. Existing config files are never overwritten
by setup; copy the new connection entry from the template when upgrading.

Both model providers use the same `state` and `questions.move` payload. Its
`criteria` maps legal choice IDs to their action objects, optional labels and
computed consequences. Local heuristic scores are excluded. Jev receives it with
its configured `model` in the HTTP request; Codex receives it as JSON with an output schema. Both answers
are read from `answers.move.choice`, with `answers.move.type` equal to `choice`.
The same validator rejects unknown IDs. The existing game loop also rejects
answers for a decision that became stale while the engine was thinking. Jev's
extra probabilities, confidence and usage fields are accepted but not used to
apply moves; Codex need not invent corresponding statistics. This replaces the
old Codex `{ "choiceId": "..." }` output contract, including for custom CLI wrappers.

Each model request allows 1–255 choices. Larger menus fail visibly without
truncation; adapters must present successive small decisions, as Settlers does
for discards. Conquest also splits menus by action type, origin and target when
they exceed its conservative 48,000-byte request budget. Backtracking is available;
grouping does not drop policy-eligible candidates. No heuristic is substituted when a model fails.

Jev requests use `timeoutMs` for the whole request, including reading the body.
Cancellation stops the HTTP request. Network errors, timeouts, HTTP 408/429 and
5xx errors use the existing `maxAttempts`/`retryDelayMs` recovery policy (which
can eventually forfeit a game). Authentication, other 4xx errors and malformed
answers stop visibly. Error logs exclude remote response bodies and credentials.
Redirects are rejected, responses are capped at 1 MiB, and endpoints require HTTPS
except for loopback HTTP used in tests.

`doctor` checks that the selected Jev connection has a token; it does not validate
that token remotely or incur a model call. To make one real decision request
without opening a wallet, connecting to Saito or joining a game:

```sh
node apps/runner/scripts/check-decision.js apps/runner/config/conquest.json
```

This uses the game config's selected connection and prints only the provider and
chosen test action (`win` or `lose`). It tests connectivity and answer formatting,
not playing strength. Run once with Jev and once with Codex to compare the paths.

Protocol references: [TypeSafe System One API](https://docs.typesafe.ai/api/system-one),
[Choice requests and answers](https://docs.typesafe.ai/primitives/choice), and
[Codex structured output](https://learn.chatgpt.com/docs/non-interactive-mode#-create-structured-outputs-with-a-schema).

## Run

Use an installed checkout with its existing npm dependencies and compatible
`saito-js` / `saito-wasm` packages. No browser compilation or chain reset is needed.
Run these commands from `node/`:

```sh
node apps/runner/scripts/configure.js conquest
# Or use: node apps/runner/scripts/configure.js settlers twilight paths
# Edit peer, dataDir and agent; set the executable in agents.json for this machine.
npm run runner -- doctor ./apps/runner/config/conquest.json
npm run runner -- list ./apps/runner/config/conquest.json
npm run runner -- host ./apps/runner/config/conquest.json
# On another player machine, with a different config/dataDir:
npm run runner -- join ./apps/runner/config/opponent.json INVITE_ID
# After stopping or restarting:
npm run runner -- resume ./apps/runner/config/conquest.json GAME_ID
```

`host` publishes an Arcade invitation, prints its ID and waits for an opponent.
A reused wallet waits for that exact invitation's game before playing; a loaded
completed match from an earlier session does not end the new host session.
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
configuration file (connection executable paths resolve relative to `agents.json`).
Optional connection `model` selects a model; otherwise Codex uses its local default.
Commands that play games check that the configured executable starts before
connecting or joining. This checks availability, not login or model access.
`spawn codex ENOENT` means `codex` was not found on PATH; set the executable's
absolute path and rerun `daemon` with the same `dataDir` to resume the saved game.

To use the fast test policy, set `agent` to `heuristic`.
`timeoutMs` limits a model call; `idleTimeoutMs` bounds standalone waits before a game has opponents;
`maxDecisions` bounds successful decision attempts. Engine availability failures
use the recovery policy below; invalid output and other errors still stop visibly.
The runner never substitutes a heuristic move for a failed model call. No wagering, async dealing, observer play or timed play is supported.

## Multiple bot seats in one game

```sh
node apps/runner/scripts/configure.js multi
# Edit peer, dataDir and agent; set the executable in agents.json.
# Host a four-player Settlers game: three bots, one open seat for you.
npm run runner -- multi-host ./apps/runner/config/multi.json
# Alternatively, put those three bots into an existing four-player invite:
npm run runner -- multi-join ./apps/runner/config/multi.json INVITE_ID
# After stopping, a provider error, or a restart:
npm run runner -- multi-resume ./apps/runner/config/multi.json
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
be followed by a new `multi-host`/`multi-join` using the same wallets. Workers wait for the assigned game before reporting
completion; retry cleanup is scoped to the invitation’s game ID.

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
# Edit peer, dataDir and agent; configure connections in agents.json.
npm run runner -- daemon ./apps/runner/config/daemon.json
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
reported as `engine-unavailable` and retried. connection `maxAttempts`
defaults to **3** (including the initial attempt); connection `retryDelayMs`
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

When `chatAgent` selects an LLM connection, the runner answers new signed direct
messages from opponents. It uses that connection's executable/model independently
of the game decision agent. Currently `codex` is the supported LLM type; selecting
a heuristic connection for open chat is rejected. Without `chatAgent`, the runner
sends no open-ended replies. Fixed greetings, invitation consent, and inactivity
messages remain code-driven and do not require an LLM.

Replies are short (at most 500 characters), with the game name and up to eight
recent messages from that opponent. The runner does not send the wallet, private
cards, game state or other opponents' conversations to the chat prompt.

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
  config-src/           Tracked example JSON configurations
  config/               Private machine settings and agent connections (ignored)
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
`apps/runner/config-src/` are inputs to that script; machine-specific configurations
remain in `node/apps/runner/config/`, and wallets remain in their configured data directories.
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
browser. Conquest offers single-round attacks with each legal dice count, blitz
with optional automatic occupation, and minimum/midpoint/maximum deployment,
occupation and adjacent fortification amounts.
Settlers supports initial placement, building/upgrading, bank trades, development
cards, discards, robber movement and theft. Discards select one resource at a
time from the remaining hand (at most five options), until half the original
hand is selected. Each choice is saved locally for restart; the complete discard
is sent together as one move. Observations include the remaining hand, selected
resources, and number still required. Each selection counts toward `maxDecisions`.
Settlers does not propose or accept trades between players.
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
# Set the selected connection executable in agents.json to your installed Codex binary.
npm run runner -- multi-host ./apps/runner/config/paths.json
npm run runner -- multi-resume ./apps/runner/config/paths.json
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

## Conquest strategic context

Conquest sends a compact rules briefing, own-card symbols, public reinforcement
income, continent control/completion, border threats and elimination targets.
Reinforcement candidates also preview adjacent blitz capture probabilities after
placement; occupation and fortification preview onward attacks from the destination.
Movement also reports origin/destination defense against the strongest current
adjacent enemy stack, excluding neutrals and a successfully captured target.
These do not predict future reinforcements or an entire multi-territory campaign.
Each candidate includes its immediate consequences: costs/gains, resulting troop
distribution, capture-card eligibility, continent bonuses denied/completed and
potential elimination or victory. Attack candidates include capture probability,
expected casualties and expected movable survivors conditional on capture.
These are fair-dice calculations, not forecasts of the game's RNG. Exact blitz
calculations are capped at 40,000 dynamic-programming states; larger battles are
explicitly marked unavailable, while single-round estimates remain available.
Neutral forces are excluded from attacking border threats.

At reinforcement the model selects a concrete continent, income-denial,
elimination or defense campaign. Each choice identifies a staging territory,
a connected route of at most six hostile captures, an origin reserve and an
army estimate. It prefers an affordable prefix; otherwise it shows the cost to
reach the first target and the funding deficit. Routes cannot march through
friendly territory. The estimate uses `ceil(1.25 * defenders) + 1` per capture,
plus two mobile armies and the origin reserve. This is conservative arithmetic,
not a predicted success probability. Income-bearing origins reserve enough to
match the largest unengaged adjacent enemy stack; other origins retain one.

Plan status and candidate effects connect reinforcement, attacks, occupation and
fortification to that campaign. Friendly-path distances identify staging toward
the target front; they do not authorize connected-path fortification. Plans
record armies, income, losses and exposed continent borders at selection.
Before the next optional action, the model must reconsider after completing an
objective or bounded route, losing its staging/route, exceeding its loss budget,
newly exposing continent income, losing income, or falling below 55% capture
odds for the next attack (or unavailable bounded odds). Mandatory trades and occupation take precedence.
A review acknowledges the current revision so it cannot repeatedly interrupt
an unchanged position. Legacy objectives are upgraded on the next eligible
review. Selecting a plan remains local and does not alter network state or RNG.

The tactical policy withholds attacks below 50% full-battle capture probability
unless they offer immediate victory, elimination, continent completion, enemy
income denial, a first capture card without an available 65% alternative, or
desperate survival (at most three territories and outnumbered two to one).
Single-round attacks use full-battle odds for this check, not their often-zero
single-roll capture probability. Unknown odds remain explicitly unknown and are
not blocked as if an exact probability existed. End-attack is always available.
This is a strategic policy restriction, not a change to Conquest's legal rules.

Plans, review anchors, menu paths and six recent actions persist in
`runnerConquestPlan`, `runnerConquestSelection` and `runnerConquestHistory`.
Nested menu checks include back-navigation. Paths and decisions bind to the
exact observation/revision and expire when it changes. Planning and menu calls
count toward `maxDecisions`; event-triggered reviews can increase model calls.

Only the filtered observation goes to the provider. The NFT `returnContext()`
full-game snapshot is not used. This enrichment applies to both Jev and Codex;
heuristic scores remain a separate smoke-test policy.

Compare the frozen pre-strategy adapter with the current adapter using paired
local-engine games, with the enhanced seat swapped for each seed:

```sh
# Offline harness validation (does not measure Jev playing strength):
node tests/apps/runner/conquest-benchmark.cjs --heuristic --pairs 1
# Real Jev calls using the existing private runner connection:
node tests/apps/runner/conquest-benchmark.cjs --config apps/runner/config/conquest-jev-ksaito.json --pairs 2 --seed 417 --max-decisions 300 --output /tmp/conquest-comparison.json
```

Use your own config path. Each game stops at `--max-decisions` (default 1000),
including planning/menu calls. At most `2 * pairs * maxDecisions` provider calls
are made. The harness creates no wallets, joins no network games and changes no
production saves. Reports contain completion/winner, casualties, low-probability
blitz counts (capture probability below 25%, a risk indicator rather than proof
of a mistake), preparation/request latency and request bytes. Incomplete games
are reported without declaring a winner. Paired seeds match initial placement;
subsequent dice use diverges with the chosen moves. This comparison measures the
combined context, planning and expanded-action change, not their individual
contributions. Use multiple seeds before drawing conclusions about strength;
this harness complements the native signed-transaction/restart test below.

### Campaign comparison against the frozen six-game player

`tests/apps/runner/fixtures/conquest-v1/` freezes the adapter and strategic context
from the six live games, with SHA-256 checks. Both arms use the same rules engine
and provider. Compare one incremental behavior at a time:

```sh
node tests/apps/runner/conquest-campaign-benchmark.cjs --config apps/runner/config/conquest-jev-saito.json --variant route --pairs 2 --seed 1401 --max-decisions 2000 --output /tmp/conquest-route.json
# Repeat with --variant replan, then --variant full, using separate output files.
# Use --heuristic instead of --config for offline harness validation only.
```

`route` adds concrete campaigns; `replan` also adds event-triggered review;
`full` adds the tactical risk restriction. The adapter's constructor switches
exist for these ablations; normal runner play enables all three. Each seed is
played with the candidate in each seat. The report records initial-position
hashes, source hashes, actual completion/winner, low-odds attacks without a
policy payoff, failed-blitz losses, interior spare armies, and closeout time
following a defined material/income advantage. These last metrics are proxies,
not proofs of wasted moves or forced wins. Incomplete games do not count as wins.
The decision cap includes planning/menu calls; subsequent RNG use diverges with
moves. Small paired samples remain exploratory. Follow with native live games
to verify signed transactions, restart behavior and encrypted-card transport.

## Settlers strategic context

Settlers supplies the implemented rules, per-player resource production and
resource diversity, current scoring/award targets, legal expansion sites, build
costs and shortages, port-aware bank-trade affordability, and discard exposure.
Production estimates use fair dice and the engine's early-seven rerolls and
Robin Hood protection. They describe the current board, not future dice or
opponent resource identities. Expansion routes identify settlement sites within
three new roads. Road candidates calculate continuous paths, stopping at enemy
buildings, and identify Longest Road awards. The read-only search caps at 30,000
visits; capped results are marked as lower bounds and do not claim an award.

Candidate consequences explain production and ports gained by placement,
resources remaining after a trade/discard/purchase, which builds become
affordable, and production blocked/restored by moving the robber. Monopoly
shows an upper bound from public hand counts, never an opponent's hidden
resource composition. Building/buying closes bank trading for the turn, so
Jev can finish exchanges before spending its reserved resources.
Each build includes an ingredient-preserving bank-trade sequence when immediately
fundable, missing resources with no production, and a production-rate funding
projection capped at 72 rolls. This projection is not an expected waiting time:
it ignores variance, future spending and board changes. Trades explicitly compare
the target shortage before/after and identify reserved ingredients sacrificed.

Opening choices evaluate settlement pairs, their ports and starting resources,
and projected funding for a city or a settlement plus road. First-placement
partners are provisional: an opponent can claim them before the second placement.
Specialization is evaluated using exchange rates rather than requiring all five
resources. Local evaluation values are heuristics, not calibrated win probabilities.

The model chooses a concrete city, settlement destination and road route, road
award, or development-card objective. `runnerSettlersPlan` persists across turns
until completed, blocked or explicitly reconsidered. Voluntary reconsideration
is limited to once per turn to prevent planning loops. Reserves include all
remaining roads plus the destination's cost; progress records points, shortages
and production. Legacy category plans remain usable until their next renewal.

During build actions the model compares fully funded sequences with retaining
resources, playable cards and changing its objective. Bank trades preserve the
entire sequence cost and precede spending. Sequences use at most three new roads
and 16 actions, and include two-build finishes near the target score. Public
opponent scoring sites and award thresholds inform urgency and blocking value;
hidden hand identities and card outcomes remain unknown. `runnerSettlersSequence`
is saved with the normal move journal. Every continuation must still appear in
the current legal menu and remain in the selected turn; an unavailable move or
blocked destination returns control to the model. Unknown draws and theft are
not forecast. Individual legal trades/builds remain accessible through a separate
menu. Planning/menu selections do not send moves but count toward `maxDecisions`.
Large menus split by action/card or numbered groups, with backtracking and a
48,000-byte request ceiling. Stale and unknown choices are still rejected.

The shared runner loop executes single-choice decisions without calling the
provider, including legal continuations of a previously chosen sequence. It
reports `forced` instead of `thinking`; normal legality, cancellation, persistence
and decision limits still apply.

The existing complete building, bank-trading and resource-card menus remain
available. Player-to-player trading is still unsupported. No other LLM is
consulted: the runner computes the facts and the configured provider chooses.

```sh
node --test tests/apps/runner/settlers.test.cjs tests/apps/runner/settlers-strategy.test.cjs tests/apps/runner/settlers-planner.test.cjs
node tests/apps/runner/match.cjs Settlers --restart
# Compare original/enriched Jev on identical tactical positions:
node tests/apps/runner/settlers-benchmark.cjs apps/runner/config/conquest-jev-ksaito.json /tmp/settlers-comparison.json
# Full 10-point game, with Jev choosing for both seats:
node tests/apps/runner/settlers-match.cjs apps/runner/config/settlers-jev-saito.json /tmp/settlers-jev-game
node tests/apps/runner/settlers-review.cjs /tmp/settlers-jev-game/decisions.jsonl
# Replay observed trade mistakes against the frozen player from the live match:
node tests/apps/runner/settlers-planner-benchmark.cjs apps/runner/config/settlers-jev-saito.json /tmp/settlers-trade-replay.json
# Compare the frozen player in seat 1, then repeat with seat 2 and a new output:
SETTLERS_PREVIOUS_SEAT=1 SETTLERS_BOARD=tests/apps/runner/fixtures/settlers-boards/board-1.json node tests/apps/runner/settlers-match.cjs apps/runner/config/settlers-jev-saito.json /tmp/settlers-paired-1
```

The comparison accepts any existing runner config selecting Jev; only its
provider connection is used. It makes 16 calls across four synthetic positions,
each tested twice with each adapter. The cases check trade-before-build timing,
Year of Plenty resources, preserving a winning city through discard, and
revealing a winning VP card. It writes decisions, correctness, latency and
request size without creating wallets or network invites. These tactical cases
are not a full-match win-rate benchmark; the native match command separately
checks signed moves, restart recovery, board agreement and completion using
the heuristic policy.

`settlers-match.cjs` uses native wallets, encrypted decks and signed moves over
local IPC, without publishing an invite. Both seats use the supplied Jev config;
there is no heuristic or second-model fallback. It checks final board, resources,
scores and RNG agreement and saves source snapshots, filtered decision traces and
results. Output contains private wallets and is created with restrictive
permissions. A failed run retains checkpoints; supply its game ID as the third
argument to resume in the same directory. Review counts flag decisions for
inspection: spending away from a plan or deferring a build can be justified, and
negative robber income changes can be unavoidable when movement is forced.

For comparisons, `SETTLERS_PREVIOUS_SEAT=1` or `2` loads the frozen live-match
player in that in-game seat; the other seat uses the current adapter. Both skip
model calls for forced moves. `SETTLERS_BOARD` names a JSON file containing
`hexes` and `ports` in the native public-state format. Only the offline worker
overrides the generated board; normal encrypted setup and signed moves still run.
Two reproducible public maps are provided in `fixtures/settlers-boards/` under
`tests/apps/runner/`. Use the identical board file with the opposite previous-player seat for each
pair. Dice and development decks are not matched across games, so small samples
are exploratory. Reports include board/source hashes and per-decision versions.
The recorded-trade replay distinguishes a funded sequence or waiting from merely
changing which resource a still-unfunded trade acquires.

The [recorded planner comparison](reports/settlers-planner-comparison.json)
contains four completed games on two boards with seats swapped: the planner won
three and lost one. It chose a funded sequence or waiting in five of six recorded
trade replays, versus zero of six for the frozen player. These small samples are
exploratory; the report includes source hashes, recovery checks and limitations.

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
Codex and Jev implement that interface using the same request format and answer
validator, without changing networking or game rules. Additional games need a module-specific adapter; raw
moves alone do not describe the legal choices or hidden information for all games.

The Codex integration follows the CLI's [non-interactive mode](https://developers.openai.com/codex/noninteractive)
interface; authentication and model availability are managed by the local Codex installation.
