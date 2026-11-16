# How the runner plays games

The runner is a headless Saito player. [runtime.js](lib/runtime.js) loads the
actual module from `node/mods/`, constructs it with `new Game(app)`, and passes
that instance to a game-specific adapter. The module and shared GameTemplate
process incoming moves and maintain the board, wallet transactions, and saves.
The AI receives a fresh board description for each decision.

The runner adapts that module instance in memory:

- [presentation.js](lib/presentation.js) replaces common menu, overlay, and clock
  methods with empty functions. Status and log methods store data without drawing.
- Conquest's rendering guards skip browser work. Its adapter reads state and
  calls the module's existing `submitAction()` method.
- [Settlers' adapter](lib/games/settlers/index.js) replaces input methods such as
  `playerBuildTown()` with functions that record a pending decision. It translates
  selections into game commands and calls `endTurn()`.
- Twilight and Paths use JSDOM and local jQuery to retain existing interface
  callbacks containing game logic. Their adapters capture menus and invoke those
  callbacks for selected actions.

Conquest's `viewState()` is defined on the **Conquest module**, in
[`node/mods/conquest/conquest.js`](../../mods/conquest/conquest.js). It copies
`game.state`, supplies this player's cards, and clears opponents' card identities.
The [Conquest adapter](lib/games/conquest/index.js) calls it, selects board fields,
and adds rules, strategic analysis, a saved plan, and recent actions. It does not
use the framework's broader NFT/script `returnContext()` snapshot.

The adapter also prepares candidate actions with IDs and calculated consequences.
The model chooses an ID from that curated menu. A single choice runs automatically.

A turn proceeds through repeated decision cycles:

1. The engine processes incoming moves until this player has a decision.
2. The adapter prepares the current observation and action menu.
3. The model selects an action; the runner rejects invalid or stale answers.
4. The adapter submits the selection through the module's move machinery.
5. The wallet signs the move transaction, and Saito transports it to players.
6. The engine advances, saves progress, and the cycle repeats or waits.

One board-game turn can require many decisions. Planning and menu selections
may only update local state; they need not send a move.

See the [README](README.md) for setup, supported games, and operational details.
