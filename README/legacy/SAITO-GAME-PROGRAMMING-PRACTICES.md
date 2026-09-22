# Saito Game Programming Practices

**Forensic reconstruction of the Saito Game Engine and five reference games.**  
Investigation date: 2026-08-20. Static source inspection only — no server runs, no game code modified.

This document is an implementation guide for building future multiplayer games (including card games with betting). It reconstructs how the engine and existing games actually work in this repository.

**Primary sources examined**

| Area | Paths |
|------|--------|
| Engine | `node/lib/templates/gametemplate.js`, `node/lib/templates/gametemplate-src/*`, `table-gametemplate.js`, `oneplayer-gametemplate.js` |
| Docs (partially stale) | `node/docs/gaming/saito-game-engine/{readme.md,api.md}` |
| Poker (modern table + betting) | `node/mods/poker/` (+ brief `node/mods/texas/` UI evolution) |
| Here I Stand (modern card/event) | `node/mods/his/` |
| Paths of Glory (latest complex strategy) | `node/mods/paths/` |
| Red Imperium (simultaneous moves, legacy) | `node/mods/imperium/` |
| Twilight Struggle (legacy strategy + GT blind pick) | `node/mods/twilight/` |
| Existing President stub | `node/mods/president/president.js` (scaffold only) |

Related repo docs (module/CSS practices, not game-specific): `README/SAITO-MODULE-CODING-PRACTICES.md`, `README/SAITO-MODULE-CSS-PRACTICES.md`.

---

## Table of contents

1. [Game module anatomy](#1-game-module-anatomy)
2. [Game state](#2-game-state)
3. [The game queue](#3-the-game-queue)
4. [Player actions](#4-player-actions)
5. [Turns and turn ownership](#5-turns-and-turn-ownership)
6. [Simultaneous moves](#6-simultaneous-moves)
7. [Cards and card objects](#7-cards-and-card-objects)
8. [Hidden information](#8-hidden-information)
9. [Synchronization between players](#9-synchronization-between-players)
10. [UI architecture](#10-ui-architecture)
11. [Betting, staking, and money](#11-betting-staking-and-money)
12. [Game completion and settlement](#12-game-completion-and-settlement)
13. [Error handling and invalid actions](#13-error-handling-and-invalid-actions)
14. [Multiplayer lifecycle](#14-multiplayer-lifecycle)
15. [Configuration / advanced settings](#15-configuration--advanced-settings)
16. [Compare the five games](#16-compare-the-five-games)
17. [Conceptual model](#17-conceptual-model)
18. [Practical developer guide](#18-practical-developer-guide)
19. [Questions / uncertainties](#19-questions--uncertainties-requiring-further-investigation)

---

## 1. Game module anatomy

### What constitutes a Saito game module

A game is a Saito **module** that extends `GameTemplate` (or `GameTableTemplate` / `OnePlayerGameTemplate`). It lives under `node/mods/<slug>/` and is loaded by the module system like any other mod.

**Typical directory layout**

```
node/mods/<slug>/
  <slug>.js                 # primary class (or compiled monolith)
  lib/                      # UI, domain mixins, templates (NOT always compiled in)
  src/                      # (HIS/Paths/Imperium/Twilight) source fragments concatenated at build
  web/
    style.css               # often auto-generated from web/css/*
    css/                    # component stylesheets
    img/
  compile                   # optional shell script to concatenate src/ → <slug>.js
  README.md
```

**Two structural styles in the wild**

| Style | Games | Pattern |
|-------|-------|---------|
| **Mixin modules** | Poker, Texas | Thin shell + `Class.importFunctions(State, Queue, UI, …)` |
| **Compile-cat monoliths** | HIS, Paths, Imperium, Twilight | `src/*.js` concatenated into one class file; `lib/` holds overlays/templates |

Both extend the same engine. Mixins match how `GameTemplate` itself is built.

### Primary game class and engine composition

`GameTemplate` extends `ModTemplate` and mixes in engines via `GameTemplate.importFunctions(...)`:

| Mixin | File | Responsibility |
|-------|------|----------------|
| `GameQueue` | `gametemplate-src/gametemplate-queue.js` | Queue processor + UPPERCASE engine commands |
| `GameMoves` | `gametemplate-src/gametemplate-moves.js` | `addMove` / `endTurn` / send / receive / ordering |
| `GameGame` | `gametemplate-src/gametemplate-game.js` | `newGame` / save / load / accept / game-over |
| `GameCards` | `gametemplate-src/gametemplate-cards.js` | Dice, decks, card helpers |
| `GamePlayers` | `gametemplate-src/gametemplate-players.js` | Seats, default `playerTurn` |
| `GameWeb3` | `gametemplate-src/gametemplate-web3.js` | Stake / SEND-RECEIVE settlement |
| `GameUI` | `gametemplate-src/gametemplate-ui.js` | Status, HUD lock, clocks |
| `GameArcade` | `gametemplate-src/gametemplate-arcade.js` | Arcade options HTML |
| `GameAcknowledge` | `gametemplate-src/gametemplate-acknowledge.js` | ACK + array `confirms_needed` |
| `GameAnimation` | `gametemplate-src/gametemplate-animation.js` | Animations (can halt queue) |

**Specializations**

- `GameTableTemplate` (`table-gametemplate.js`) — open tables, mid-game join/leave, hand-boundary commitments, round settlement. **Poker extends this.**
- `OnePlayerGameTemplate` — solo / league-oriented wrapper.

### Initialization / rendering / lifecycle hooks

| Hook | When | Game responsibility |
|------|------|---------------------|
| Constructor | Module load | Name, slug, min/max players, UI component instances, flags (`opengame`, `can_bet`, …) |
| `initializeGame(game_id)` | New or reload | If new: `game.state = returnState()`, seed queue; if reload: state already restored |
| `initializeGameQueue` (engine) | After accept / load | Calls `initializeGame`, may request cryptos, `startQueue` |
| `render` / HTML init | Browser UI active | Attach HUD, log, menu, board, overlays |
| `handleGameLoop()` | Queue hits unknown (lowercase) command | Game-specific opcodes |
| `playerTurn()` | Engine or game wants local input | Build UI; `addMove` + `endTurn` |
| `triggerGameOver` / settle | End | Winners, payments, `GAMEOVER` |

**Poker example** (`poker.js`):

```javascript
class Poker extends GameTableTemplate { /* shell */ }
Poker.importFunctions(PokerState, PokerStake, PokerQueue, PokerUI, PokerCards);
```

- State: `lib/poker-state.js` → `returnState`
- Queue: `lib/poker-queue.js` → `handleGameLoop`
- UI actions: `lib/poker-ui.js` → `playerTurn`
- Money: `lib/poker-stake.js`
- Cards/scoring: `lib/poker-cards.js`

### Responsibilities: game class vs UI vs engine

| Belongs in | Examples |
|------------|----------|
| **Engine** | Queue loop, move txs, deck crypto, PLAY/RESOLVE, SEND/RECEIVE, save/load |
| **Game class / mixins** | Rules, state shape, lowercase opcodes, win conditions, stake math |
| **UI components** | DOM, overlays, click handlers that call `addMove`/`endTurn`, rendering from state |
| **Arcade hooks** | `returnOptions`, `returnAdvancedOptions`, rules HTML |

**Rule of thumb:** UI proposes moves; **only queue processing mutates shared state**. Local-only UI prefs (theme, felt color) may use `saveGamePreference` without queueing.

### Interaction with broader Saito modules

- **Arcade** — invites, accept txs, options wizard, launching the game URL.
- **League** — optional; some games `respondTo('default-league')` to opt out (President stub does).
- **Crypto / wallet** — via `GameWeb3` SEND/RECEIVE queue commands.
- **Relay** — off-chain `game relay gamemove` for faster delivery; still also propagates on-chain.

---

## 2. Game state

### Authoritative location

Authoritative shared state lives on **`this.game`**, created by `newGame()` in `gametemplate-game.js` and persisted in `app.options.games[]` via `saveGame` / `loadGame`.

Consensus among peers is not “whoever has the latest JSON blob.” It is:

> **Same initial state + same ordered queue of move strings, processed identically on every client.**

`this.game.state` is the game-defined persistent rules state. The queue is the log of pending/executing instructions.

### Core `this.game` fields (engine)

| Field | Role |
|-------|------|
| `id` | Game id |
| `player` | My seat (1…N); **0 = observer** |
| `players[]` | Public keys in seat order |
| `accepted[]` | Tx recipients |
| `target` | Whose turn UI/clock expects |
| `queue[]` | LIFO instruction stack |
| `turn[]` | Outgoing move batch being sent |
| `future[]` | Buffered txs (halted / out of order / busy) |
| `step.game` | Master move counter |
| `step.players{pkey→step}` | Per-player step (enables simultaneous arrivals) |
| `deck[]` / `pool[]` | Card structures |
| `dice` | Hash seed for `rollDice` |
| `state` | **Game-defined** persistent state |
| `options` | Arcade options (crypto, stake, clock, scenario, …) |
| `confirms_needed[]` | Who must still `RESOLVE` (GT array form) |
| `crypto`, `stake` | Active stake |
| `over`, `winner`, `reason` | End-of-game |
| `initializing` | Until `READY` |

### Distinctions that matter

| Concept | What it is | Where |
|---------|------------|--------|
| **Authoritative game state** | Shared, durable rules data | `this.game.state` (+ decks/pools/players) |
| **Local / UI state** | Themes, overlay open, animation mid-flight | Preferences, component fields, DOM |
| **Pending player action** | Local player choosing; queue paused | Often top of queue is `PLAY` / `turn` / game-specific wait; UI live |
| **Queued action** | String on `this.game.queue` not yet finished | Engine + game opcodes |
| **Resolved action** | Instruction removed; state already mutated | After handler returns and splices |
| **Outbound staging** | Moves not yet broadcast | `this.moves` / `this.endmoves` until `endTurn` |

### Players

- Seats are 1-indexed; `this.game.players[i]` is the public key for seat `i+1`.
- `this.game.player` is **my** seat number.
- Strategy games often add `this.game.state.players_info[]` (faction, tokens, etc.) — HIS, Paths, Imperium.

### Cards / decks / boards

**Runtime deck** (`GameCards` / queue DECK\* commands):

```
deck.cards{}     // catalog: key → card data
deck.crypt[]     // encrypted ordering
deck.keys[]      // decryption keys (private where appropriate)
deck.hand[]      // my card keys
deck.discards{} / removed{}
```

**Code-side catalog** (HIS/Paths): `this.deck` or `returnDeck()` — rich objects with `onEvent` / `canEvent`, separate from encrypted `this.game.deck[n]`.

**Board spaces:** HIS uses `this.game.spaces` with `units[faction]`; Paths uses spaces with flat `units[]` and `control`.

### Poker state example

From constructor comments + `PokerState.returnState` / `PokerStake.initializeGameStake`:

- Chip ledger: `player_credit[]`, `player_pot[]`, `debt[]`, `passed[]`
- Betting: `required_pot`, `last_raise`, `big_blind`, `small_blind`, `plays_since_last_raise`
- Street: `flipped` (0/3/4/5), `round`
- Crypto layer: `game.crypto`, `game.stake`, `game.chips` (default 100)

Invariant: **all pot math is integer chips**; crypto is scaled for display and SEND/RECEIVE.

### Serialization / restore

- `saveGame` serializes `this.game` into options storage.
- Reload → `loadGame` → `initializeGameQueue` → continue processing remaining queue + future moves.
- Mid-game table joins use **state commitments** (`GameTableTemplate.returnStateCommitment`) at hand boundaries — not full secret decks in the snapshot (`buildBoundarySnapshot` strips deck/pool).

### How a player “knows” current state

1. Local `this.game` after processing the same moves as peers.
2. UI re-renders from that state (`board.render()`, status, HUD).
3. There is no separate authoritative server state.

---

## 3. The game queue

### What the queue is

`this.game.queue` is a **LIFO stack of strings**. Each entry:

```
COMMAND\targ1\targ2\t...
```

Processing always looks at **`queue[queue.length - 1]`**, splits on `\t`, and dispatches.

Evidence: `runQueue()` in `gametemplate-queue.js`.

### UPPERCASE vs lowercase

| Kind | Who handles | Examples |
|------|-------------|----------|
| **UPPERCASE** | Engine `this.commands[]` | `READY`, `PLAY`, `RESOLVE`, `DEAL`, `SIMPLEDEAL`, `SETTLE`, `SEND`, `RECEIVE`, `SIMULTANEOUS_PICK`, `ACKNOWLEDGE`, `GAMEOVER` |
| **lowercase / game** | Module `handleGameLoop()` | Poker: `turn`, `fold`, `raise`, `settle`; Paths: `play`, `combat`, `event`; HIS: `round`, `play`, `event` |

### Creation sources

1. **Init** — all clients push the same seed instructions in `initializeGame` / setup (safe because identical parallel init).
2. **Player moves** — `addMove` → `this.moves` → `endTurn` packs into tx `msg.turn` → peers `queue.push` each string.
3. **Engine macros** — e.g. `SIMPLEDEAL` expands into DECK/XOR/ENCRYPT/DEAL subcommands.
4. **Handlers** — a queue command may `queue.push` more commands (e.g. Poker `ante` pushes `round` + `announce`).

### Outbound staging (critical)

```javascript
// gametemplate-moves.js
addMove(mv) { this.moves.push(mv); }
async endTurn(nextTarget = 0) {
  this.game.turn = this.moves;
  // … append endmoves …
  this.moves = [];
  this.sendGameMoveTransaction('game', extra);
}
```

Because received turns are **pushed onto the end** of a LIFO stack, **the last `addMove` executes first**.

Canonical pattern:

```javascript
this.addMove('RESOLVE\t' + this.publicKey); // runs last (clears PLAY)
this.addMove('place\t...');                 // runs first
this.endTurn();
```

Poker uses a game-specific analog: `resolve\tturn` before `fold\tN` so resolve clears the waiting `turn` after the fold is applied depending on push order — follow existing poker ordering when editing.

### Broadcast and receive

**Send** (`sendGameMoveTransaction`):

1. Build message: `{ request:'game', turn, module, game_id, player, step:{game:++}, extra }`
2. Address to `this.game.accepted`
3. Wallet pending + `saveGame`
4. Optional relay: `game relay gamemove`
5. `network.propagateTransaction`

**Receive:**

- On-chain: `GameTemplate.onConfirmation` → `request === 'game'`
- Off-chain: `handlePeerTransaction` for relay

**Ordering:**

- `isUnprocessedMove` — next expected step for that player / master step
- `isFutureMove` — too far ahead → `game.future[]`
- `addNextMove` — if `halted` / `gaming_active` / not initialized → future; else push turn onto queue, `startQueue`
- `processFutureMoves` — drain when ready

### Processing loop

```
initializeGameQueue(game_id)
  → initializeGame(game_id)
  → startQueue()
       → runQueue()
            for each this.commands[i](self, gmv):
              if returns 0 → stop
            if instruction untouched → handleGameLoop()
       → if runQueue returned 0 → processFutureMoves()
```

**Return values**

- `1` — continue
- `0` — pause (need UI, crypto step, or player move)
- Endless-loop guard: same instruction ≥100 times → abort

**Flags**

- `gaming_active` — mid-run; incoming moves go to future
- `halted` — UI pause (ACK, animation); resume with `restartQueue()`

### How the queue knows an action completed

Typical patterns:

1. **Self-clearing opcode** — handler `splice`s itself and returns `1`.
2. **Sticky wait + resolve** — leave `PLAY` / `turn` on stack; player broadcasts `RESOLVE` / `resolve\tturn`; resolve handler removes the wait.
3. **Confirms** — `confirms_needed` bits cleared by `RESOLVE\tpkey` until none remain.

### Survival across reloads

Queue + state saved in `saveGame`. On reload, unfinished instructions resume. Future moves buffered. Deck keys in state enable re-deriving private hands.

### Concrete Poker lifecycle (fold)

1. Queue top: `turn\t3` → `PokerQueue.handleGameLoop` → `PokerUI.playerTurn()`
2. Click fold → `addMove('resolve\tturn')` (if missing) + `addMove('fold\t3')` → `Poker.endTurn()` → `sendGameMoveTransaction`
3. Peers: `addNextMove` pushes both strings → `startQueue`
4. `resolve\tturn` removes waiting `turn\t3`
5. `fold` sets `passed[2]=1`, updates stats/UI
6. Next `turn` runs or hand ends → `settle` → `newround`

### Concrete Paths lifecycle (ops → combat)

1. Queue: `play\tcentral` → `playerTurn` → card select → `playerPlayOps`
2. Moves: `activate_for_movement`, `activate_for_combat`, later `combat\t…`
3. Gameloop pipeline: combat → flank → combat cards → outcome → hits → cleanup
4. `endTurn` between interactive segments as needed

### Paths init queue (modern crypto deal reference)

From `paths-setup.js` (LIFO — last push runs first):

```
DECK central/allies → DECKXOR/ENCRYPT → DEAL → init → READY → turn
```

---

## 4. Player actions

### General pipeline

```
UI click
  → component / playerTurn determines intent
  → (optional local validation)
  → addMove("opcode\t...")
  → endTurn()
  → signed tx (relay + chain)
  → peers addNextMove → queue.push → runQueue / handleGameLoop
  → mutate this.game.state
  → saveGame
  → UI refresh from state (render/status/board)
```

### Validation reality

Most games validate **in the active player's UI** (don't offer illegal buttons). Peers usually **apply** received opcodes trustingly. There is typically **no authoritative reject** of a forged peer move beyond cryptographic deck/simultaneous-pick checks.

**Developer implication:** treat clients as honest for rules enforcement; use crypto protocols for hidden cards and blind commits. Do not assume the engine will reject an illegal `raise`.

### Action kinds (with evidence)

| Kind | Example | Mechanism |
|------|---------|-----------|
| **Simple** | Poker check | `addMove('check\t'+player)`; `endTurn` |
| **Selected card** | Paths play card | UI pick → `playerPlayCard` → `discard` + `event` or ops moves |
| **Multiple selections** | Paths activate spaces | Multiple `activate_for_*` moves then `endTurn` |
| **Requires input** | Poker raise amount | Nested controls; then `raise\tP\tamt` |
| **Changes turn** | Clearing `turn` / `PLAY` | `resolve` / `RESOLVE` then next queue instruction |
| **Triggers event** | HIS/Paths `event` | Gameloop calls `card.onEvent(game, faction)` |
| **Multiple players** | Imperium agenda; GT `PLAY\tall` | Confirms / simultaneous patterns (§6) |
| **Payment** | Poker settleDebt | `addPaymentToQueue` → `SEND`/`RECEIVE` |

### Poker raise (UI → state)

`PokerUI.playerTurn` builds HUD options; raise path computes `match_required`, caps by stacks, then:

```javascript
addMove('raise\t' + player + '\t' + total);
endTurn();
```

Peers' `handleGameLoop` `raise` branch: `animateBet`, decrement `player_credit`, increment `player_pot`, update `last_raise` / `required_pot`, reset `plays_since_last_raise = 1`.

---

## 5. Turns and turn ownership

### How “whose turn” is represented

| Signal | Meaning |
|--------|---------|
| Top queue command | e.g. `PLAY\t2`, Poker `turn\t3`, Paths `play\tcentral` |
| `this.game.player` | My seat |
| `this.game.target` | Set for clocks / notifications (`setPlayerActive`) |
| `confirms_needed` | Simultaneous / multi-ack |
| Observer | `player == 0` — no outbound moves |

Games also encode **phases** in state + queue:

- **Poker:** streets via `state.flipped`; hand via `newround` / `ante` / `round`
- **Paths:** `turn` (game turn) vs `round` (action round); MO → action → attrition → …
- **HIS:** `round` (year) + `impulse` (faction play within action phase)
- **Twilight:** `round` pushes headline then alternating `play\t1` / `play\t2`
- **Imperium:** `newround` → strategy select → token alloc → initiative `play`s

### UI knowing it may act

- Engine `PLAY` calls `playerTurn()` only if local seat is in `players_to_go` and `confirms_needed[seat-1]==1`
- Poker `turn\tP` calls `playerTurn` only when `P == this.game.player`
- Otherwise `nonPlayerTurn` / status “waiting…”

### Preventing out-of-turn actions

1. **UI:** controls only shown on your turn.
2. **Queue:** inactive clients never receive a wait instruction that invites them to move.
3. **Steps:** `step.players` / `isUnprocessedMove` order arrivals; do not freely insert arbitrary state mutations.
4. **Not a full server referee:** a malicious client could craft txs; design assumes honest game clients + crypto where cheating must be detectable (cards, picks).

---

## 6. Simultaneous moves

There are **three distinct mechanisms** in this codebase. Do not conflate them.

### A. GameTemplate array confirms + `RESOLVE` (preferred generic)

**Files:** `gametemplate-acknowledge.js`, `gametemplate-queue.js` (`PLAY`, `RESOLVE`, `RESETCONFIRMSNEEDED`)

1. Queue: `PLAY\tall` or `PLAY\t1` / JSON list of seats  
2. `resetConfirmsNeeded(players_to_go)` → `confirms_needed[i]=1` for required seats  
3. Each required seat runs `playerTurn()`  
4. Each broadcasts `RESOLVE\t<publicKey>`  
5. When all confirms clear, engine removes `PLAY` (and RESOLVE entries)

Per-player `step.players` allows concurrent txs without forcing a single global step lock.

**Limitation (docs + code comments):** nested simultaneous windows are fragile; do not assume arrival order among concurrent movers.

### B. GameTemplate `SIMULTANEOUS_PICK` (blind commit–reveal)

**File:** `gametemplate-queue.js` (~line 1635+)

Used by **Twilight Struggle headlines** (normal path):

1. Both players pick a card locally; set `spick_card` / hashes  
2. `addMove('SIMULTANEOUS_PICK\t'+player+'\t'+hash+'\t'+sig)` + `endTurn`  
3. Engine waits for all first commits → second unlock round → verify hashes → fill `game.state.sp[]`  
4. Game reads `state.sp` and continues (`headline4` / `headline6`…)

**Hidden until resolution:** yes (hashes first).  
**Man in Earth Orbit** forces a **sequential** peek path instead — not simultaneous.

This is the best **generic** reference for secret simultaneous choices (e.g. blind bids, secret role picks).

### C. Imperium custom scalar confirms (legacy / game-specific)

**Files:** `imperium/src/imperium-helpers.js` (`resetConfirmsNeeded`), `imperium-gameloop.js` (`resolve`, `simultaneous_agenda`)

Imperium **overrides** `resetConfirmsNeeded(num)` so `confirms_needed` is a **number**, plus `confirms_received` and `confirms_players[]`. Lowercase `resolve\tcmd\t1\tpkey` aggregates until count met.

**Agenda voting end-to-end:**

1. Politics strategy queues `resetconfirmsneeded` + `simultaneous_agenda\t{agenda}\t{idx}`  
2. Each player UI votes → `addMove('resolve\tagenda\t1\t'+pkey)` + `addMove('vote\t…')` + `endTurn`  
3. `resolve` increments `confirms_received`; waits until `confirms_needed <= confirms_received`  
4. `vote` mutates shared tallies **as each vote arrives** (not sealed)  
5. When all `voted_on_agenda[*][idx]==1`, splice `simultaneous_agenda`  
6. `resolve_agenda` tallies / speaker tiebreak / apply law  

**Also used for:** strategy card secondaries/tertiaries, token allocation, action-card response menus.

**Verdict for new games:** reuse the **idea** (wait for N players) via **GT array `RESOLVE`/`PLAY`** or **`SIMULTANEOUS_PICK`**. Do **not** copy Imperium’s scalar override — it conflicts with the engine’s array model.

### Simultaneous vs sequential after resolution

After all confirms / picks resolve, the queue continues with whatever was underneath (next phase, `resolve_agenda`, second headline event, etc.). No special engine mode — just the next LIFO instructions.

---

## 7. Cards and card objects

### Engine-level cards

- Catalog keys in `deck.cards`
- Cryptographic shuffle/deal via UPPERCASE queue commands
- Public flips via `POOL` / `POOLDEAL` / `FLIPCARD` / `RESOLVEFLIP`

### HIS pattern (richest card/event model)

**Catalog:** `his-cards.js` builds plain objects, then:

```javascript
deck[key] = this.addEvents(deck[key]);
```

**`addEvents`** (`his-events.js`) defaults:

- `onCommit`, `onEvent`, `canEvent`, `handleGameLoop`
- `removeFromDeck`, `menuOption` / `menuOptionTriggers` / `menuOptionActivated`

**`returnEventObjects()`** collects:

- Faction objects in play  
- All strategy + diplomatic cards  
- Active debaters  

`handleGameLoop` falls through to each event object’s `handleGameLoop` after core handlers — cards can inject custom queue verbs.

**Play path:**

1. `playerPlayCard` → ops vs event (if `canEvent`)  
2. Event: `addMove('event\t'+faction+'\t'+card)` (+ discard / ACK / counter patterns)  
3. Gameloop `event` → `deck[card].onEvent(this, faction)`  
4. Complex events push custom opcodes handled by card or core loop  

**Hands:** multi-faction browsers use `game.deck[0].fhand[faction_idx]` after `hand_to_fhand`.

### Paths pattern (cleaner successor)

- Decks partitioned: mobilization / limited / total war (`returnMobilizationDeck`, etc.)
- Dual encrypted runtime decks: Central = deck[0], Allies = deck[1]
- Thinner `addEvents` (mostly `handleGameLoop` + menus)
- `event\tcard\tfaction` argument order **differs from HIS** (`event\tfaction\tcard`)
- Combat cards call `onEvent` during combat pipeline

### Twilight pattern (legacy)

- Card snippets under `src/cards/**` compiled into giant `playEvent` if-ladder
- Queue `event\tus|ussr\tcard` → `playEvent`
- Still useful for options/removal UI; not preferred structure for new games

### Poker cards

- Standard French deck via engine deal; scoring in `poker-cards.js` (`scoreHand` / `pickWinner`)
- No `onEvent` objects — poker “events” are betting opcodes

### Reusable recommendation for a new card game

Prefer **HIS/Paths card objects** (`canEvent` / `onEvent` / optional `handleGameLoop`) + engine DECK/DEAL crypto. Prefer **Paths** clarity for 2-player; borrow **HIS** hooks for response menus and multi-faction hands if needed.

---

## 8. Hidden information

### What is sent vs kept local

| Data | Typical treatment |
|------|-------------------|
| Queue move strings | Broadcast to all players |
| Public state mutations | Applied identically everywhere |
| Hole cards / private hands | Keys not shared; only recipient finishes decrypt (`RESOLVEDEAL`) |
| Community cards | `POOL` path reveals to all |
| Blind picks | Hashes first (`SIMULTANEOUS_PICK`) |
| Imperium votes | Public as submitted (not hidden) |
| UI theme prefs | Local only |

### Different views of the same game

Every client has the same `queue` and public `state`, but:

- `deck.hand` / `fhand` contents differ  
- UI hides opponents’ hole cards until `reveal` (Poker) or event  
- Observers (`player==0`) may see less or (legacy Twilight) insecure observer updates — do not copy insecure observer leaks  

### Poker hole cards

1. `SIMPLEDEAL\t2\t…` deals privately  
2. `GameCardfan` shows only own hand  
3. Showdown: sequential `reveal\tP\tc1\tc2` broadcasts holes into `state.player_cards`

### Async dealing caveat

`async_dealing` / option skips XOR encrypt — **not cryptographically private**. Used for offline-friendly modes; unsuitable for serious money card games.

---

## 9. Synchronization between players

### Conceptual answers

**If Alice moves, how does Bob know?**

1. Alice’s UI → `addMove` → `endTurn` → `sendGameMoveTransaction`  
2. Tx delivered via relay and/or chain to Bob  
3. Bob’s `onConfirmation` / `handlePeerTransaction` → `isUnprocessedMove` → `addNextMove`  
4. Alice’s `turn[]` strings appended to Bob’s `game.queue`  
5. Bob’s `startQueue`/`runQueue` runs the same handlers → same state mutations  

**What prevents divergent state?**

- Deterministic handlers (no unreplicated randomness — use `rollDice` / SECUREROLL / deck crypto)  
- Same move order (step counters + future buffer)  
- No unilateral mutation of shared state outside queue processing  
- Save/reload restores queue + state together  

Conflicts: last consistent design assumes one legal actor; simultaneous movers must not depend on each other’s ordering inside one window.

### Catch-up / reconnect

- Reload from saved `this.game`  
- Process remaining queue  
- Apply `future` moves when steps align  
- Table games: join at hand boundary with signed state commitment  

### What is broadcast

**Actions (move strings), not full state dumps**, on every turn. Full state is local and reconstructed. Exceptions: table join snapshots (deck-stripped), game-over metadata, stake proposals.

---

## 10. UI architecture

### Engine-provided UI building blocks

Constructed on `GameTemplate` / used widely:

- `GameHud`, `GameLog`, `GameMenu`, `GameClock`
- `GamePlayerbox`, `GameCardfan`, `GameCardbox`, `GameCardstack`
- `GameAcknowledgeOverlay`, `GameBoardSizer`, `GameObserver` (observer currently disabled in template flags)
- `SaitoOverlay` for modal flows

### Poker UI (reference for modern card/betting UI)

| Piece | Path |
|-------|------|
| Shell | `poker.js` `render()` |
| Board | `lib/ui/game-board/` |
| Pot | `lib/ui/pot/` |
| Controls | `PokerUI.playerTurn` → `updateControls` / HUD |
| Settings | `lib/poker-settings.js` |
| Stats | `lib/stats.js` |

**Texas** (`node/mods/texas/`) keeps the same poker mixins but componentizes UI (`Main`/`Table`/`Controls`/`Sidebar`) and sets `settle_every_hand = true`. Treat Texas as UI evolution over the same rules engine.

### Strategy game UI

- Board positioned by space `top`/`left`; large `boardWidth` (often 5100)
- Many `lib/ui/overlays/*.js` + `*.template.js` pairs (HIS richest)
- Card hover via `cardbox`; action menus via HUD or menu overlays

### CSS architecture

| Layer | Role |
|-------|------|
| **Saito-wide** | Design system: typography, colors, buttons, overlays, CSS variables (`saito.css` etc.) |
| **Game `web/style.css`** | Often **autogenerated** from `web/css/*` (Poker header comment) |
| **Game component CSS** | e.g. `poker-base.css`, `poker-hud.css`, `poker-playerbox.css` scoped under `.game.poker` |
| **Tokens** | Prefer Saito variables; game CSS should mostly **layout/position** (see `README/SAITO-MODULE-CSS-PRACTICES.md`) |

Modules attach stylesheets via `ModTemplate.attachStyleSheets()` when browser-active.

---

## 11. Betting, staking, and money

### Layers (Poker)

| Layer | Representation |
|-------|----------------|
| **Game state (chips)** | Integer `player_credit`, `player_pot`, blinds, raises |
| **Stake / buy-in** | `game.stake` (crypto string or chips), `game.chips` (units per buy-in, default 100), `game.crypto` ticker or `"CHIPS"` |
| **Debt** | `state.debt[i]` accumulates obligations between settlements |
| **Transaction** | Queue `SEND` / `RECEIVE` via `GameWeb3.addPaymentToQueue` |
| **Settlement** | `settleDebt` / `queueGameStakeSettlement` / `SETTLE` |

### Buy-in

`PokerStake.initializeGameStake`:

- Reads `options.num_chips`, `options.crypto`, `options.stake`, `options.blind_mode`
- Sets each `player_credit[i] = chips`
- Seeds queue `['newround']`

Conversion: `convertChipsToCrypto(numChips) = numChips * stake / chips`.

### Betting actions

Represented as queue opcodes (`fold` / `check` / `call` / `raise` / `allin`) mutating chip fields. Crypto is **not** moved on every bet — only chip ledger + optional debt.

### When money moves

1. Hand resolves → winners/losers update `debt` when crypto mode  
2. `needToSettleDebt()` — true if crypto options and (`settle_every_hand` \| `settleNow` \| join/leave \| bust)  
3. `settleDebt` nets and calls `addPaymentToQueue(sender, receiver, amount)`  
4. Engine runs `SEND` (payer UI/auth) then `RECEIVE` (confirm)  

`GameWeb3.queueGameStakeSettlement` at true game end splits stake among winners; **skips** if `crypto == 'CHIPS'`.

### Distinctions for President

- Implement **chip/point ledger in `game.state`** for trick/hand scoring if needed.  
- Map **buy-in stake** through `game.options` + `initializeGameStake`-style setup.  
- Use **debt + SEND/RECEIVE** for real crypto; keep CHIPS path for free play.  
- Prefer `GameTableTemplate` if open tables / mid-game join matter; else `GameTemplate` is enough for fixed 4 seats.

---

## 12. Game completion and settlement

### Poker

- **Elimination:** `checkplayers` removes `player_credit <= 0`; if one left → `winner\tidx` → `settleDebt` + `triggerGameOver(..., 'elimination')`
- **Hand over ≠ game over** — `newround` continues
- Resign: `receiveStopGameTransaction` folds player, may stash deck

### Engine game-over path

1. `triggerGameOver(winner, reason)` or stopgame / gameover tx  
2. `enqueueTerminalQueueProtocol` — queue becomes SETTLE → payments → `GAMEOVER` (LIFO order)  
3. `SETTLE` → `queueGameStakeSettlement`  
4. `GAMEOVER` sets `over=1`

### Abandoned / disconnect

- Soft: future moves / halt; clocks  
- Resign/stopgame transactions  
- Table leave flows in `GameTableTemplate`  
Exact Arcade timeout/abandon policy should be verified at runtime (see §19).

### Multiple winners

`queueGameStakeSettlement` supports `winner` as array; splits stake. Poker showdown can split pots in chip math before crypto debt.

---

## 13. Error handling and invalid actions

| Layer | Behavior |
|-------|----------|
| **UI** | Disable illegal options; confirm fold-when-check; raise range `sconfirm` |
| **Game handlers** | Logs / clamps (Poker negative match → 0); occasional auto-fold if cannot call |
| **Queue** | Endless-loop detection; `halted`/`future` buffering; duplicate Imperium resolve hacks |
| **Crypto / picks** | `SIMULTANEOUS_PICK` sig/hash verify; deck key mismatches warn |
| **Transactions** | Wallet auth failures halt SEND until resolved |

**There is generally no Byzantine rules referee.** Design for honest clients + cryptographic fairness for hidden randomization.

---

## 14. Multiplayer lifecycle

```
Arcade create invite (options HTML)
  → players accept (sigs)
  → initializeGameFromAcceptTransaction
       newGame/loadGame, set options, seat sort by hash(pkey+game_id)
       game.player = my seat
       initializeGameQueue → initializeGame → startQueue
  → … crypto deal / READY …
  → normal play (queue + moves)
  → round/hand transitions (game opcodes)
  → win / resign / elimination
  → SETTLE / SEND-RECEIVE / GAMEOVER
```

| Topic | Notes |
|-------|-------|
| Seats | `minPlayers`/`maxPlayers`; open table via `opengame` + Arcade “open-table” |
| Ready | Engine `READY` clears `initializing` |
| Spectators | `player==0`; limited |
| Reconnect | save/load + future moves |
| Replacement | Table template join protocol; not universal |
| President stub | Fixed 2–4, extends `GameTemplate`, incomplete |

---

## 15. Configuration / advanced settings

### Arcade API (`gametemplate-arcade.js`)

| Method | Purpose |
|--------|---------|
| `returnOptions()` | Player count select (+ open-table) |
| `returnSingularGameOption()` | Extra single option when fixed player count |
| `returnAdvancedOptions()` | HTML for Advanced overlay |
| `attachAdvancedOptionsEventListeners()` | Dynamic show/hide (e.g. stake when crypto selected) |
| `returnDefaultGameOptions()` | Scrapes form into options object |
| `returnShortGameOptionsArray(options)` | Invite summary labels |
| `returnGameRulesHTML()` | Rules overlay |

Options land on **`this.game.options`** from the accept transaction and persist with the game.

### Patterns by game

- **Poker:** advanced template currently exposes blind mode; crypto/chip fields exist partly as commented/orphaned listener code — evidence that options UI and stake init can drift  
- **HIS/Paths:** scenario selects, play-as, testing decks  
- **Twilight:** very large advanced template (remove cards, editions)  
- **Imperium:** VP length + faction picks  

### Optional rules without hard-coding

1. Emit checkbox/select HTML in `returnAdvancedOptions` with stable `name` attributes.  
2. Read `this.game.options.<name>` in `initializeGame` / `returnState` / handlers.  
3. Branch rules on those flags in queue handlers — not on DOM.  
4. Summarize in `returnShortGameOptionsArray` for invites.

---

## 16. Compare the five games

| Concern | Poker | HIS | Paths | Imperium | Twilight |
|---------|-------|-----|-------|----------|----------|
| **Base class** | `GameTableTemplate` | `GameTemplate` | `GameTemplate` | `GameTemplate` | `GameTemplate` |
| **Structure** | Mixins | Compile-cat | Compile-cat | Compile-cat | Compile-cat |
| **State** | Chip/table `state` | Huge faction/diplomacy | Cleaner war tracks | Board+players_info | Cold War tracks |
| **Queue style** | Sticky `turn` + bet opcodes | `round`/`play` + events | `turn`→phases + combat pipeline | Huge custom vocabulary | `round`/`headline`/`play` |
| **Turns** | Seat turns / streets | Impulse order | AR Central/Allies | Initiative plays | Alternating AR |
| **Simultaneous** | Rare (all-in race via turns) | ACK/counter multi | Mostly sequential | **Custom scalar confirms** | **`SIMULTANEOUS_PICK` headlines** |
| **Cards** | French deck + score | Rich `addEvents` objects | Rich, thinner hooks | Import packs | Compiled `playEvent` |
| **Hidden info** | Hole crypto + reveal | fhand + faster_play leak tradeoff | Dual decks | Hands; votes public | Hands + blind headline |
| **Sync** | Moves + table commitments | Moves + HALTED/faster_play | Moves + SAVE | Moves + custom resolve | Moves + SIMPICK |
| **UI** | Board/pot/HUD; Texas more componentized | Many overlays | Fewer overlays | HUD + many overlays | Board + overlays |
| **Config** | Blind mode (+ stake legacy) | Scenarios | Scenarios | VP/factions | Editions/removals |
| **Betting** | **Full chip+crypto** | No | No | No (game resources) | No |
| **Settlement** | Debt + SEND/RECEIVE | N/A | N/A | N/A | N/A |
| **Era signal** | Modern table/betting | Modern card hooks | **Latest strategy template** | Legacy simultaneous | Legacy + good SIMPICK example |

### Modern / preferred patterns

- Queue-first consensus; never mutate shared state only locally  
- `addMove` / `endTurn` as the multiplayer write path  
- Mixin split (Poker) or clean Paths-style src modules  
- Card objects with `canEvent`/`onEvent` (HIS/Paths)  
- Engine DECKXOR/ENCRYPT/DEAL for money-relevant hidden cards  
- GT `PLAY`/`RESOLVE` or `SIMULTANEOUS_PICK` for multi-player waits  
- `returnAdvancedOptions` → `game.options` for rules flags  
- Poker/Texas for betting UI + `GameWeb3` settlement  
- `GameTableTemplate` when open tables needed  

### Legacy patterns

- Imperium scalar `confirms_needed` override  
- Twilight / Imperium mega-monolith `playEvent` / giant gameloop without card `onEvent` objects  
- Insecure observer hand updates  
- HIS `faster_play` intentional info leak  
- Copy-paste debt (Paths still referencing HIS strings/prefs in places)  

### Still worth reusing from older games

- Twilight **`SIMULTANEOUS_PICK`** headline flow  
- Imperium **content-as-imported-objects** (strategy/agenda packs)  
- Imperium/Twilight experience with multi-ack UX (but reimplement on GT APIs)  
- Twilight advanced options breadth as a UX reference  

### Avoid

- Mutating `game.state` without a queue move  
- Forgetting `RESOLVE` / `resolve` (stuck forever)  
- LIFO move order mistakes  
- Nesting simultaneous windows  
- Copying Imperium `resetConfirmsNeeded`  
- `async_dealing` for real-money hidden cards  
- Assuming peer move validation  

---

## 17. Conceptual model

### Master pipeline

```
Module (GameTemplate subclass)
  └─ this.game { state, queue, players, deck, options, … }
        │
        │  initialize → seed queue
        ▼
   runQueue / handleGameLoop  ←──────────────┐
        │                                    │
        │  needs input                       │
        ▼                                    │
   playerTurn / UI                           │
        │                                    │
        │  addMove × N                       │
        ▼                                    │
   endTurn → turn[] → Transaction            │
        │                                    │
        ▼                                    │
   Relay / blockchain                        │
        │                                    │
        ▼                                    │
   Peers: addNextMove → queue.push ──────────┘
        │
        ▼
   State transition (deterministic)
        │
        ▼
   saveGame + UI render
```

### Sequential action

```
PLAY/turn (wait)
  → one player addMove(effect) + addMove(RESOLVE/resolve)
  → all process effect then clear wait
  → next queue instruction
```

### Simultaneous action (GT confirms)

```
PLAY\tall + confirms_needed[]
  → each player RESOLVE\tpkey (+ optional payload moves)
  → when all clear → continue
```

### Blind simultaneous (SIMPICK)

```
commit hash → all commit → reveal unlock → state.sp[] → game continues
```

### Card event (HIS/Paths)

```
play card → queue event → card.onEvent → maybe more queue verbs → state/UI
```

### Hidden deal

```
DECK → XOR/ENCRYPT per player → DEAL/REQUESTKEYS → private hand
```

### Betting (Poker)

```
chip moves on queue → debt on hand end → SEND/RECEIVE when settling → game crypto balances change
```

### Settlement

```
triggerGameOver → SETTLE → payments → GAMEOVER
```

---

## 18. Practical developer guide

### Before coding

1. Read this document + `node/docs/gaming/saito-game-engine/readme.md` (concepts; verify API names against code).  
2. Skim `gametemplate-queue.js` (`runQueue`, `PLAY`, `RESOLVE`, deal commands) and `gametemplate-moves.js` (`addMove`, `endTurn`, `addNextMove`).  
3. For card+betting: study **Poker** mixins + **Paths** card/queue clarity.  
4. For simultaneous secret picks: **Twilight** headline + engine `SIMULTANEOUS_PICK`.  
5. Note existing stub: `node/mods/president/president.js`.

### Create the game

1. Add `node/mods/<slug>/` with class extending `GameTemplate` or `GameTableTemplate`.  
2. Prefer Poker-style mixins (`state`, `queue`, `ui`, `cards`, `stake`) for maintainability.  
3. Implement `initializeGame`, `returnState`, `handleGameLoop`, `playerTurn`, `render`.  
4. Implement Arcade: `returnOptions` / `returnAdvancedOptions` / rules HTML.  
5. Add `web/css` + `web/style.css` build convention used by sibling games.

### Define state

Put in `game.state` everything peers must share: scores, phase, public board, chip stacks, discards counts, etc.  
Keep private card keys in `game.deck`.  
Keep theme prefs out of queue.

### Define actions

One lowercase opcode per consensus event. Args tab-separated, parse-safe. Include enough data for **all** peers to apply (don’t rely on “look at my local hand” unless revealing).

### Implement queue processing

```javascript
async handleGameLoop() {
  if (!this.game.queue.length) return 1;
  let qe = this.game.queue.length - 1;
  let mv = this.game.queue[qe].split('\t');
  if (mv[0] === 'newround') { /* push next; splice or sticky */; return 1; }
  if (mv[0] === 'play') { /* maybe return 0 after showing UI */; return 0; }
  // …
  return 1;
}
```

Remember LIFO and resolve patterns.

### Connect UI

Render from `this.game`. On click: validate locally → `addMove` → `endTurn`. Re-render in handlers after state changes (or central `displayBoard`).

### Synchronize players

Broadcast **moves only**. Use engine step/future. No ad-hoc peer state patches.

### Add cards

- Catalog with `canEvent`/`onEvent`  
- Deal via `DECK*` / `DEAL` / `SIMPLEDEAL`  
- Reveal via explicit moves  

### Add simultaneous moves

- Public multi-ack: `PLAY` + `RESOLVE\tpkey`  
- Secret: `SIMULTANEOUS_PICK`  
- Avoid Imperium scalar confirms  

### Add betting

Reuse Poker’s chip ledger + `GameWeb3.addPaymentToQueue`. Keep integer chips; scale crypto at boundaries.

### Add settlement

Define winners → `triggerGameOver` → ensure stake fields set → engine SETTLE path; for multi-hand debt, follow Poker `settleDebt`.

### Test

**Static / unit-friendly:** opcode handlers given a fake `game` object; scoring functions; option parsing.  
**Needs runtime:** deal crypto, SEND/RECEIVE wallet flows, relay vs chain ordering, reconnect, Arcade invite, simultaneous races, mobile UI.  
Do not skip multi-browser tests for money games.

---

## 19. Questions / uncertainties requiring further investigation

1. **Arcade abandon / timeout / disconnect policy** — exact conditions that force gameover vs pause were not fully traced through Arcade + clock code in this pass.  
2. **Poker advanced options drift** — crypto/num_chips UI appears partially commented while listeners remain; confirm which options Arcade actually persists today.  
3. **`PLAY` array parsing** — `gmv[1].isArray()` in engine looks incorrect vs `Array.isArray`; behavior for array-valued PLAY should be verified before relying on it.  
4. **President stub completeness** — `president.js` exists but is incomplete; unclear which of Poker vs Hearts/Thirteen patterns was intended historically.  
5. **Observer security** — Twilight comments note insecure observer card updates; confirm current observer flag (`enable_observer`) and safe patterns for spectating card games.  
6. **Imperium vote index edge cases** — possible off-by-index between `voting_on_agenda` and `voted_on_agenda` lengths noted during review; treat Imperium vote code as reference for flow, not copy-paste correctness.  
7. **Runtime relay vs chain race** — `addNextMove`/`future` logic is intricate; edge cases under high latency need live testing.  
8. **Table join commitment field set** — Poker `returnExtraCommitmentFields` should be re-read when implementing any open-table card game.  
9. **Whether President should extend `GameTableTemplate`** — product decision (fixed 4 seats vs open table) not dictated by code.  
10. **CSS build pipeline** — confirm current recommended command to regenerate `web/style.css` from `web/css/` for new games (Poker file is autogenerated).

---

## Quick reference — critical engine functions

| Function | File |
|----------|------|
| `startQueue` / `runQueue` / `restartQueue` / `handleGameLoop` | `gametemplate-queue.js` |
| `addMove` / `endTurn` / `sendGameMoveTransaction` / `addNextMove` | `gametemplate-moves.js` |
| `newGame` / `saveGame` / `loadGame` / `initializeGameFromAcceptTransaction` / `triggerGameOver` | `gametemplate-game.js` |
| `playerTurn` / `setPlayerActive` | `gametemplate-players.js` |
| `resetConfirmsNeeded` (array) | `gametemplate-acknowledge.js` |
| `queueGameStakeSettlement` / `addPaymentToQueue` | `gametemplate-web3.js` |
| `returnOptions` / `returnAdvancedOptions` | `gametemplate-arcade.js` |
| Open table commitments | `table-gametemplate.js` |

---

*End of guide. For module/CSS non-game practices, see sibling files in `README/`.*
