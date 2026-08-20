# Saito Game Development Guide — Audit

**Audited document:** `README/SAITO-GAME-PROGRAMMING-PRACTICES.md`  
(Referenced in the request as `docs/SAITO_GAME_DEVELOPMENT_GUIDE.md`; that path does not exist in the repo. This audit targets the practices guide that was written.)

**Method:** Static source inspection only. No server runs. No engine/game/guide edits.

**Scope:** Narrow authority check — save/load/queue ordering, state vs queue, mutation sites, move legality, card crypto, simultaneous recovery, `GameTableTemplate`, Poker reuse, card-object fit for a shedding game, implementation readiness.

---

## Executive verdict

**READY WITH SPECIFIC CAVEATS**

The guide is a usable baseline for a new 2–4 player card game with betting, **if** implementers treat several of its rules as aspirational design guidance rather than universal facts about the codebase, and if they use the corrected save/load/move lifecycle below as the primary recovery model.

Minimum additional work before coding President is listed in §13. A full rewrite of the guide is **not** required first.

---

## 1. SAVE / LOAD / QUEUE ordering (corrected)

### What `saveGame` actually persists

`GameGame.saveGame(game_id)` (`gametemplate-game.js`) deep-copies **the entire `this.game` object** into `app.options.games[]` and calls `app.storage.saveOptions()`.

That includes, among other fields:

- `game.state`
- `game.queue`
- `game.deck` / `game.pool` (including private `keys` / `hand` on the saving client)
- `game.confirms_needed`, `game.step`, `game.future`
- `game.turn`, `game.target`, `game.options`, stake/crypto fields
- game-local fields such as `spick_*` when present

It is **browser-only** (`if (!this.app.BROWSER) return`).

`saveFutureMoves` can update only the `future` array in options without rewriting the whole game object.

### Critical correction to the guide

The guide’s move pipeline sketches implied that the acting client often mutates state then saves then broadcasts. The engine’s normal path is different:

> **The acting client does not apply their own turn strings to the queue inside `endTurn`.**  
> They package `this.moves` into `game.turn`, create a signed transaction, add it to the wallet pending list, **`saveGame`**, then relay/propagate.  
> Queue mutation and rule application happen when that transaction (including the sender’s own) is accepted via `addNextMove` → push onto `queue` → `startQueue`.

So recovery is not “saved state after local apply.” It is:

1. Persistable snapshot of `this.game` (including unfinished queue wait instructions and confirms).
2. Pending outbound txs that can be resent after reload.
3. Buffered `future` txs for out-of-order / mid-run arrivals.
4. Deterministic re-processing of queue + received moves.

---

### A. Normal player action — actual ordering

Established from `poker-ui.js` / game `playerTurn`, `gametemplate-moves.js`, `gametemplate.js` receive paths:

```text
queue tip is a wait instruction (e.g. PLAY, Poker turn\tP)
  → runQueue returns 0 (or game handler returns 0 after calling playerTurn)
  → UI: playerTurn / click handlers
  → addMove(...)            // stages into this.moves ONLY — does not touch game.queue
  → endTurn()
       → game.turn = this.moves (+ endmoves)
       → game.target = 0
       → this.moves = []
       → sendGameMoveTransaction('game', extra)
            → build/sign tx (msg.turn = game.turn, step.game++)
            → wallet.addTransactionToPending(newtx)
            → saveGame(game.id)          // persists current game INCLUDING still-waiting queue tip
            → optional relay "game relay gamemove"
            → network.propagateTransaction(newtx)
  → (later) same client receives own tx via relay and/or onConfirmation
       → isUnprocessedMove? → addNextMove
            → update step.players / step.game
            → for each turn[i]: game.queue.push(turn[i])
            → saveFutureMoves; saveGame
            → startQueue → runQueue → apply opcodes / clear wait
```

**What is saved before the move is applied?**  
The wait instruction is still on the queue; shared state has **not** yet been updated by this turn’s opcodes. Private UI staging fields may already have been written (see §3).

**What is saved after receipt?**  
Queue includes the new opcodes; then processing mutates state as commands run. `addNextMove` saves **before** `startQueue`, so a crash mid-`runQueue` can leave “opcodes on queue, not fully applied” — recovery re-runs `runQueue` from that queue. Commands that self-splice must be written carefully so re-execution is safe (most Poker opcodes splice themselves at entry).

---

### B. Receiving another player's move — actual ordering

```text
relay handlePeerTransaction OR onConfirmation (request === 'game')
  → may loadGame(game_id) if switching contexts
  → cacheRecentMove
  → isFutureMove? → addFutureMove (+ saveFutureMoves)
     else isUnprocessedMove? → addNextMove
          → (if halted | gaming_active | not initialize_game_run) → future instead
          → else:
               step bookkeeping
               queue.push each turn string
               saveFutureMoves
               saveGame                 // state + queue with new instructions
               startQueue → runQueue    // mutate state by processing
          → when runQueue returns 0 → processFutureMoves
```

No separate “reload state from disk before apply” on the hot path when the correct game is already in memory. Disk is the crash/reload source of truth, not the per-move source.

---

### C. Browser / application reload — actual ordering

```text
module becomes browser-active
  → loadGame(game_id)           // restores full this.game from options
  → … HTML / render …
  → attachEvents → initializeGameQueue(game.id)
       → loadGame if id mismatch
       → guard: skip if already initialize_game_run on both module and game
       → initializeDice; copy crypto options if needed
       → initializeGame(game_id)   // games must NOT re-seed queue if queue already non-empty
       → maybe saveGame (early crypto-request inject when step.game < 2)
       → if pending.length > 0 && browser_active:
            do NOT startQueue; wait for pending resend
         else:
            startQueue → runQueue
```

**Why this is recoverable (when games follow the engine contract):**

- Persistent snapshot includes both **`state` and `queue`** (and confirms / decks / future).
- Wait instructions left on the queue (e.g. `PLAY`, `turn\tN`, `ACKNOWLEDGE`, Imperium `simultaneous_agenda`) re-enter the same pause on reload.
- Outbound moves live in wallet **pending** until confirmed; init refuses to race the queue ahead of pending.
- Inbound moves that arrived while busy live in **`game.future`** and are merged carefully by `saveGame` / `saveFutureMoves`.

**Game author hazard:** `initializeGame` must treat “queue already populated” as resume, not new game. The engine docs and Poker/Paths follow this; violating it is the classic unrecoverable bug.

---

### D. Queue pause (return 0 / halt)

Three different pause kinds:

| Kind | Mechanism | Saved? | On reload | On resume |
|------|-----------|--------|-----------|-----------|
| **Wait for player move** | Leave tip instruction; `playerTurn`; return `0` | Snapshot includes tip + confirms | Tip re-runs; UI re-opens for seats still pending | Player `endTurn` → later `addNextMove` pushes resolve + action |
| **UI halt** | `this.halted = 1` (ACKNOWLEDGE, SEND/RECEIVE, some animations) | ACKNOWLEDGE/`SEND` paths call `saveGame` then halt | Incoming moves → `future`; queue not advanced | Callback/`restartQueue` → `saveGame` then `startQueue` |
| **Crypto multi-step** | DEAL/REQUESTKEYS/etc. return `0` waiting for key txs | Same as move path | Queue tip is the waiting engine command | Peer key moves arrive via `addNextMove` |

`restartQueue` explicitly: clear `halted`, process deferred game-end if any, **`saveGame`**, then `startQueue`.

---

## 2. Game state vs queue state

Better model than “one big state machine”:

| Layer | Role |
|-------|------|
| **`this.game.state` (+ decks/pools/players)** | Durable facts about the board/game after commands have been applied |
| **`this.game.queue`** | Work remaining to execute (including waits that have not yet been cleared) |
| **`this.moves` / `game.turn`** | Outbound staging for the next transaction (not yet consensus) |
| **`confirms_needed` / Imperium confirms / `voted_on_agenda` / `spick_*`** | Progress within a multi-player wait (sometimes on `game`, sometimes on `state`) |
| **UI / module fields** | Overlays, themes, transient click context |

### Placement examples (from actual games)

| Concept | Typical placement |
|---------|-------------------|
| Whose turn | **Queue tip** (`PLAY`, `turn\tP`, `play\tfaction`) + sometimes `game.target` for clocks |
| Current phase / street | **`game.state`** (Poker `flipped`, Paths `turn`/`round`, HIS `impulse`) **and** queue structure |
| Cards on table | Public: **`game.pool` / state**; private: **`game.deck[].hand`** |
| Player hands | **`game.deck[].hand` or `fhand`** (local decrypt result) |
| Pending choice (UI open) | **Queue wait tip** + local UI; not usually a dedicated `state.pendingChoice` |
| Players who passed | Poker: **`state.passed[]`** (updated when `fold` opcode runs) |
| Simultaneous partial completion | GT: **`game.confirms_needed[]`**; SIMPICK: **queue commits + `spick_*`**; Imperium: **`voted_on_agenda` + confirms_players** |
| Pending payment | **Queue** `SEND`/`RECEIVE` (+ halt); debt ledger may sit in **`state.debt`** until settlement opcodes |
| Card event mid-resolution | **Queue** custom verbs after `event`; flags in **`state.events`** |

**Rule of thumb the code supports:** put durable outcomes in `state`/decks; put “what happens next / who must still act” primarily in the **queue** (plus confirms fields the engine or game defines). Do not rely on UI-only memory for recovery.

---

## 3. “Only queue processing mutates shared state” — not universally true

**Guide claim (C / overstated as A):** UI proposes; only queue processing mutates shared state.

**Code:** Queue handlers are the **canonical path for multiplayer-visible rule outcomes**, but mutations outside that path exist.

| Class | Examples |
|-------|----------|
| **Canonical** | Poker `fold`/`raise` in `handleGameLoop`; Paths `move`/`combat`; engine DEAL/RESOLVE |
| **Initialization** | `returnState` / `initializeGameStake` / Paths setup when queue empty |
| **Pre-broadcast staging** | HIS/Paths `active_card`; Twilight `headline_card`/`spick_*`; Imperium `active_player_moved` before `addMove` |
| **Networking / side path** | Poker `receiveStopGameTransaction` sets `passed` / fold stats **without** a `fold` queue opcode |
| **UI-local / questionable** | Poker `playerTurn` clamps `state.last_raise` locally; Paths NE flags / replacements staging; Twilight optimistic event flags |

**Amendment:** State that must be identical for all players after a decision should be written by a **queue-applied opcode** (or engine command). Local staging for crypto commits and UI is common; anything peers need must also appear in the broadcast turn or already be deterministic from prior queue history.

---

## 4. Move validation — reframed

Do not explain the architecture as a client-trust security model. Distinguish:

| Kind | What the code does |
|------|---------------------|
| **UI convenience validation** | Hide/disable illegal controls; confirm dialogs; amount clamps before `addMove` |
| **Game-rule validation on receive** | Largely **absent** for Poker fold/call/raise; HIS pass/event; Paths move/ops largely **apply** |
| **Cryptographic validation** | Deck key protocols; `SIMULTANEOUS_PICK` signature + hash chain; SEND/RECEIVE hashes |
| **Transaction validation** | Wallet/network acceptance, step ordering (`isUnprocessedMove` / future), player≠0 |

**Concrete Poker:** `raise` handler applies `parseInt(mv[2])` to credits/pots with no check against `last_raise`, stack, or whose `turn` it was. Legality was enforced when the acting UI built the move.

**What a new developer should do:**

1. Filter illegal options in UI so normal play works.
2. Put enough data in the move for every peer to apply the same transition.
3. Use engine crypto where privacy/fairness of dealing or blind picks matters.
4. If a game needs receive-side rule checks, **add them explicitly in queue handlers** — the engine does not provide a general referee.

---

## 5. Mental poker / card lifecycle — tightened claims

### Secure path (Poker `SIMPLEDEAL`, Paths explicit DECKXOR/ENCRYPT)

```text
DECK → DECKXOR (each) → DECKENCRYPT (each) → DEAL
  → REQUESTKEYS / ISSUEKEYS (non-recipients send keys)
  → RESOLVEDEAL (recipient finishes decrypt into local hand)
```

Community cards: `POOLDEAL` → `FLIPCARD` (all contribute keys) → `RESOLVEFLIP`.

### What the implementation establishes

| Question | Answer from code |
|----------|------------------|
| Can one player learn another’s hole cards from deal traffic alone? | **Not on the secure path**, if the recipient keeps their final key layer private. |
| Is ownership a shared cryptographic proof later? | **No.** Ownership after deal is local `hand[]` of card keys. |
| Poker `reveal` — proves cards were dealt to that player? | **No.** Opcode trusts `reveal\tP\tc1\tc2` and looks up `returnCardFromDeck`. |
| Can a player invent cards at showdown? | **The reveal handler does not prevent it.** |
| `async_dealing` | Skips XOR/encrypt; plaintext-style crypt; **not private.** |

**Amendment to guide:** Dealing privacy ≠ showdown integrity. Poker betting privacy uses the deal protocol; showdown is a **protocol convention** (broadcast claimed indices), not a proof of hand membership.

---

## 6. What “broadcast moves only” actually means

Peers do **not** reconstruct the game from move arguments alone.

For a received turn, Bob uses:

1. **Move strings** in `tx.msg.turn`
2. **Bob’s already-processed `game.state` / decks / queue history**
3. **Cryptographic material** already in Bob’s `game.deck` (and new keys if the turn includes ISSUEKEYS/CARDS/SIMPICK commits)
4. **Deterministic code** in shared handlers

| Game | Example move | What Bob needs beyond the string |
|------|--------------|----------------------------------|
| Poker | `raise\t3\t10` | Current pots/credits/blinds in `state` |
| Poker | `reveal\t2\t7\t19` | Card catalog; does **not** need Alice’s private hand array |
| Paths | `move\t…` | Board spaces/units already in local game |
| HIS | `event\tfaction\tcard` | Card object methods in code catalog + state |
| Twilight | `SIMULTANEOUS_PICK\t…` | Local `spick_*` for unlock; queue commits |
| Imperium | `vote\t…` | Agenda state arrays |

**Amendment:** Broadcast **action records**, not full state dumps. Application still depends on **shared prior state + identical code**. Card games often broadcast **identifiers**, not private hand arrays, until intentional reveal.

---

## 7. Simultaneous moves — persistence / recovery

### GT `PLAY` / `RESOLVE` + array `confirms_needed`

1. Before: `resetConfirmsNeeded` when entering `PLAY` if no outstanding 1s.  
2. Pending: `confirms_needed[i]` + `PLAY` left on queue.  
3. One arrival: that seat → 0; `PLAY` remains.  
4. Reload: restored array + `PLAY`; only seats still `1` get `playerTurn`.  
5. Who responded: seats with `0`.  
6–7. Order: any; not significant for clearing.  
8. Duplicate `RESOLVE\tpkey`: effectively idempotent.  
9. Ends when no `confirms_needed[i] >= 1`; splices RESOLVE+PLAY.  
10. After: next queue instruction.

### `SIMULTANEOUS_PICK`

1. Local `spick_card` / `spick_hash` / `spick_done`; queue holds signed commits.  
2. Pending = incomplete commit stack on queue.  
3. Partial: wait until all first commits, then unlock round.  
4. Reload: can re-prompt (Twilight) or re-broadcast unlock from saved `spick_*`.  
5. Who responded: verified queue rows.  
6–7. Cross-player order free; per-player commit order matters for hash chain.  
8. Duplicates: **no strong dedupe** — risk.  
9. Ends when each player has valid unlock chain → `state.sp[]`.  
10. After: game reads `state.sp`.

### Imperium scalar confirms + `simultaneous_agenda`

1. `resetconfirmsneeded` + agenda queue cmds; `voted_on_agenda` cleared in resetagenda path.  
2. Pending: scalar confirms + `voted_on_agenda` / `how_voted_on_agenda`.  
3. Votes apply **as they arrive** (public).  
4. Reload: if already voted, waiting UI; else vote UI again; resolve path comments address re-entry.  
5. `confirms_players` + vote flags.  
6–7. Any order; running tallies order-dependent only as display.  
8. Duplicate resolve pubkey skipped; duplicate vote can overwrite.  
9. Ends when all voted / confirms met → splice.  
10. Full vote vectors in state; then `resolve_agenda`.

**For a future simultaneous card exchange:** prefer GT `SIMULTANEOUS_PICK` (secret) or array `PLAY`/`RESOLVE` (public multi-ack). Do not copy Imperium’s scalar override.

---

## 8. `GameTableTemplate` — recommendation for fixed-seat games

### What it adds (from `table-gametemplate.js`)

- `opengame = true`, `can_bet = 1`, join/leave queues (`toJoin`/`toLeave`)
- Mid-game **JOIN** protocol: state commitments, snapshots with deck stripped, multi-player sigs
- Exit / cash-out / settle-on-leave flows
- Overrides `queueGameStakeSettlement` for table-style debt
- `PLAYERS` / seating helpers, `statistical_unit = 'hand'`, `resetCommand = 'newround'`

### What Poker uses vs inherits

| Needed for Poker’s product behavior | Inherited / optional |
|-------------------------------------|----------------------|
| Open table + late join | Full join commitment protocol |
| Leave without ending table | Exit overlays / settle on exit |
| Per-hand debt settlement hooks | `settle_every_hand` flag (Poker default **false**) |
| Chip buy-in / blinds | Mostly in Poker mixins, not table base |

### Recommendation for a fixed 2–4 player game (e.g. President)

**Prefer `GameTemplate`.**

Use `GameTableTemplate` **only if** mid-game join/leave or open tables are real requirements. Those protocols are large, subtle, and easy to get wrong; they are not required for fixed-seat deal → play → settle.

Betting/settlement for fixed seats is available via **`GameWeb3`** on `GameTemplate` without the table join stack.

**Classification:** Guide’s “prefer GameTableTemplate if open tables matter” is **C (OK)**; implying it is the modern default for card/betting games is **too strong**.

---

## 9. Poker as reference — reuse map

| Poker mechanism | Generic engine | Poker-specific | Useful for a shedding + betting game? |
|-----------------|----------------|----------------|----------------------------------------|
| Table join/leave | TableTemplate | Yes | **Only if open tables** |
| Fixed seats | GameTemplate players | — | **Yes** |
| Buy-in options | Arcade options + Web3 | Chip count mapping | **Yes (pattern)** |
| Integer chips + crypto scale | — | Poker stake model | **Yes (pattern)** |
| Street betting / blinds | — | Hold’em rules | **No** (different wager rules) |
| `debt[]` + `settleDebt` | SEND/RECEIVE | Poker ledger | **Yes (pattern)** |
| Deal via SIMPLEDEAL | Engine DECK* | — | **Yes** |
| `reveal` showdown | — | Hold’em | **Only if showdown needed**; add checks if required |
| Mixin split (state/queue/ui/stake/cards) | Same as GT composition | Poker files | **Yes** |
| Queue opcodes for actions | handleGameLoop | Poker vocabulary | **Yes (pattern)** |
| HUD controls in `playerTurn` | HUD | Poker markup | **Conceptually yes**; Texas UI split optional |
| Hand elimination / `winner` | `triggerGameOver` | Poker | **Yes (pattern)** |
| Animations / pot overlay | Animation helpers | Poker UI | Optional |
| `GameTableTemplate` settlement override | Table | Table | Only with tables |

---

## 10. Card objects for a shedding game?

| Style | Why it exists |
|-------|----------------|
| **Poker** | Card = deck index + ranking metadata; scoring functions; no per-card events |
| **HIS/Paths** | Cards are rules payloads: `canEvent` / `onEvent` / optional `handleGameLoop`, combat responses |
| **Twilight** | Effectively giant `playEvent` switch (compiled snippets) |

**A shedding game (play sets, pass, rank roles) does not need HIS/Paths event objects** unless cards have heterogeneous text effects. Ordinary card data (rank/suit/id) + **game-level rules in `handleGameLoop` / helpers** matches Poker more closely and avoids unused complexity.

Guide recommendation to prefer HIS/Paths card objects for “a new card game” is **C over-applied**. Prefer:

- Engine deal crypto (if hidden hands matter)
- Poker-like card data + scoring/comparison helpers
- HIS/Paths hooks **only** when cards carry unique scripted events

---

## 11. Engine-shaped lifecycle example (not President design)

Illustrative fixed-seat multiplayer card game:

| Transition | Queue | State | Input | Tx | Save point | Mutation | UI |
|------------|-------|-------|-------|----|------------|----------|-----|
| Waiting / create | empty → init pushes | options from Arcade | accept | accept tx | after accept init | seats, options | Arcade |
| Initialize | `READY`, deal cmds | `returnState()` | — | deal key txs | after init seed; after each deal move apply | decks | loader → board |
| Deal complete | tip → `play\t1` or similar | hands filled locally | — | — | after deal RESOLVEDEAL applies | `hand` | show hand |
| Player decision | wait tip returns 0 | unchanged until apply | UI | — | save at send (pre-apply) | staging only | controls |
| Move processing | push action+resolve | apply in handlers | — | game move | save in `addNextMove` then process | state/deck | refresh |
| Next player | next wait tip | phase counters | — | — | as above | as coded | waiting / controls |
| Round end | `newround`-like | reset pots/trick state | maybe ACK | — | ACK save+halt | state | banner |
| Next round | deal again | round++ | — | deal txs | | | |
| Game end | `SETTLE`…`GAMEOVER` | winner | wallet auth on SEND | payments | SEND/RECEIVE halt saves | balances | game over |
| Settlement | SEND/RECEIVE | debt cleared | confirm | crypto txs | halt/restart saves | crypto | overlays |

---

## 12. Claims requiring qualification

Class key: **A** code-established · **B** strong multi-game inference · **C** recommendation · **D** uncertain

### High-impact corrections

| Guide statement | Class | What code establishes | Amend? |
|-----------------|-------|----------------------|--------|
| UI proposes; **only queue processing mutates shared state** | C presented as A | Canonical for synced outcomes, but many exceptions (§3) | **Yes** — qualify |
| “Honest clients” / Byzantine referee framing | C + wrong framing | Receive-side rule checks are mostly absent; crypto covers specific protocols | **Yes** — reframe per §4 |
| Save/load vaguely “persists and resumes” | A incomplete | Full `game` saved; send saves **pre-apply**; apply on receive including self | **Yes** — use §1 sequences |
| Prefer GameTableTemplate for betting card games | C too broad | Table = join/leave; betting works on GameTemplate+Web3 | **Yes** — §8 |
| Prefer HIS/Paths `canEvent`/`onEvent` for new card games | C too broad | Needed for scripted events; not for shedding | **Yes** — §10 |
| Poker `reveal` / deal as full mental-poker integrity | A overstated | Deal privacy yes; reveal membership **not** checked | **Yes** — §5 |
| Broadcast moves only → peers sync | A incomplete | Moves + prior state + code + crypto material | **Yes** — §6 |
| Imperium simultaneous as reusable pattern | B/C | Works, but custom scalar confirms conflict with GT | Keep warning; emphasize GT APIs |

### Authoritative enough to keep (with minor wording)

| Topic | Class |
|-------|-------|
| LIFO queue of tab-separated strings | A |
| `addMove` / `endTurn` / tx / `addNextMove` / `runQueue` core loop | A |
| UPPERCASE engine vs lowercase `handleGameLoop` | A |
| Three simultaneous mechanisms identified | A |
| Poker chip ledger + SEND/RECEIVE settlement path | A |
| Paths/HIS card event invocation path | A |
| Arcade `returnAdvancedOptions` → `game.options` | A |

### Still uncertain (D) — material for implementation

1. Exact Arcade abandon/timeout → gameover coupling (not fully re-traced here).  
2. Crash **during** `runQueue` after `addNextMove`’s pre-process `saveGame` — practical frequency and whether all opcodes are idempotent on re-entry.  
3. Poker advanced-options UI vs what Arcade actually persists (known drift).  
4. Whether pending-tx + future-move races under dual relay/chain delivery need special handling beyond existing step checks (needs runtime).  
5. Product choice for a new game: crypto stake every hand vs end only; open table or not.

---

## 13. Implementation-readiness assessment

### Verdict: **READY WITH SPECIFIC CAVEATS**

The guide plus **this audit** are sufficient to start a fixed-seat multiplayer card game with optional betting, provided the implementer:

1. Uses the **§1 send/receive/reload sequences** as gospel for recovery.  
2. Puts consensus mutations in **queue-applied opcodes**, treating other mutations as staging/init only.  
3. Extends **`GameTemplate`** unless open tables are required.  
4. Uses **Poker-like card data + deal crypto**, not HIS event objects, for a shedding game.  
5. Uses **Poker stake/debt/Web3 patterns** for money without copying Hold’em streets/blinds.  
6. Uses **GT `PLAY`/`RESOLVE` or `SIMULTANEOUS_PICK`** for any simultaneous exchange.  
7. Does **not** assume receive-side rule enforcement or cryptographically proven reveals unless they implement them.

### Minimum additional investigation (narrow, not another omnibus doc)

Only if the first vertical slice needs them:

1. **Runtime:** one two-browser Poker hand — confirm self-tx apply via relay, reload mid-`turn`, pending resend.  
2. **Read once:** `GameWeb3` SEND/RECEIVE halt UI path while implementing stake.  
3. **Product:** fixed seats vs table; when crypto settles.

No need to re-document all five strategy games before coding.

---

## 14. Documents

| File | Status |
|------|--------|
| `README/SAITO-GAME-PROGRAMMING-PRACTICES.md` | **Unchanged** (per instructions) |
| `docs/SAITO_GAME_DEVELOPMENT_GUIDE_AUDIT.md` | **This audit** |

When the practices guide is later edited, fold §1, §3–§6, §8, and §10 into it as corrections; keep the rest as still-valid reference.
