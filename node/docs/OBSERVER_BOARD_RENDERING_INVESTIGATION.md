# Board Rendering During Observer Sync — Investigation

Investigation only. No code was modified.

---

## 1. Does startQueue() / queue execution mutate the DOM or only game state?

**Both.** The engine’s `startQueue()` → `runQueue()` does not touch the DOM itself. It only:

- Mutates `game_mod.game` (e.g. queue pop, state updates inside commands and `handleGameLoop`)
- Calls game-module functions: `game_self.commands[i](game_self, gmv)` and `await this.handleGameLoop()` (gametemplate-queue.js 316, 334).

**Board and UI updates happen inside the game module’s `handleGameLoop()` (and related helpers).** Those do mutate the DOM.

Example (chess, chess.js):

- `handleGameLoop()` (250–342): pops the move, updates `this.game.position`, then calls `this.updateBoard(data.position)` (342), `this.updateLog()`, `this.updatePlayers()`, etc.
- `updateBoard(position)` (463–469): `this.engine.load(position)` (state) and `this.board.position(position, true)` (DOM — chessboard library updates `#board`).
- So each move is processed by mutating `game_mod.game` and then updating the board (and log, playerbox, etc.) in the same synchronous run.

**Conclusion:** Queue execution does not draw the board itself; the game’s `handleGameLoop()` (and helpers like `updateBoard`) both update state and update the DOM. So effectively, **queue execution drives DOM updates** via the game module.

---

## 2. During archive sync in observer mode: real-time board updates or silent until later?

**Real time.** For each move, the flow is:

1. `processFutureMoves()` finds the next move, splices it from `game.future`, calls `addNextMove(ftx)` (gametemplate-moves.js 432–435).
2. `addNextMove()` pushes the move’s turn commands onto `game.queue` and calls `await this.startQueue()` (329).
3. `startQueue()` → `runQueue()` runs the queue; for each queue entry it calls the game’s `handleGameLoop()`.
4. The game’s `handleGameLoop()` updates `game_mod.game` and then calls its own render/update (e.g. chess `updateBoard()`), which updates the board DOM immediately in that same call stack.

So **as each move is processed, the board is updated in the same synchronous run.** There is no separate “apply state now, render later” step; the game module does both in `handleGameLoop()`.

---

## 3. Where does board rendering happen, and is it inside queue execution?

- **Engine:** Does not implement “board rendering.” It only runs the queue and calls the game’s `handleGameLoop()` and commands.
- **Game module:** Owns board rendering. For chess, that’s:
  - **updateBoard(position)** (chess.js 463–469): `this.board.position(position, true)` → updates the board DOM (chessboard library).
  - **setBoard(position)** (472–502): (re)creates the board (e.g. after load).
  - **lockBoard(position)** (504–524): same idea for observer/lock mode.

Those are **called from inside queue execution**: `handleGameLoop()` is invoked from `runQueue()` (gametemplate-queue.js 334), and `handleGameLoop()` calls `updateBoard()` (and similar) in the same tick.

So **board drawing/updating is done by the game module, and it is triggered during queue execution**, not from a separate `render()` / `initializeHTML()` pass that runs after the queue.

`render()` / `initializeHTML()` in the game (and GameTemplate) set up the initial layout, menu, log, playerbox, etc., and the game’s first `setBoard`/position may be called from there or from the first queue run. Ongoing **per-move** board updates happen in `handleGameLoop()` → `updateBoard()` while the queue is running.

---

## 4. In observer mode: do future moves trigger immediate visual updates, or only after the queue halts on WAIT?

**Immediate.** Processing a future move is:

- `processFutureMoves()` → `addNextMove(ftx)` → `startQueue()` → `runQueue()` → for each queue entry, `handleGameLoop()` → game updates state and DOM (e.g. `updateBoard()`).

So **each processed future move causes a board (and UI) update in that same execution.** The queue does not “batch” moves and render once at the end; it processes one move (or one batch of commands from one move), updates the board, then either continues with the next queue entry or exits and later `processFutureMoves()` may add the next move and call `startQueue()` again. There is no WAIT between moves during observer sync that would delay these updates; the only “halt” is when the queue is empty and the next move is not yet in `future`.

---

## 5. Asynchronous DOM rendering (setTimeout, requestAnimationFrame, animations)?

- **Engine queue path:** The only `setTimeout` in the queue code is in the **ACKNOWLEDGE** command (gametemplate-queue.js 590): `setTimeout(..., 0)` to defer `restartQueue()` so status/HUD can update. That does not delay board rendering for normal move processing.
- **Game modules** may use:
  - **Animations:** e.g. chess `setBoard` uses `moveSpeed: 400`; `board.position(position, true)` may animate the move. So the **final** position might be reached after a short animation (e.g. 400 ms). The DOM is still updated in the same call as `handleGameLoop()`; only the visual transition can be time-based.
  - **runAnimationQueue** (gametemplate-animation.js): uses `this.timeout(ms)` (setTimeout) and can set `this.halted = 1`. Games that use this can pause queue execution and run animations with delays. That is game-specific.
- **Template/UI:** gametemplate-ui.js and gametemplate-players.js use `setTimeout` for reminders, beeping, shot clock, etc. They are not the primary board update path.

So: **queue execution and the game’s handleGameLoop/updateBoard are synchronous from the engine’s point of view.** Any delay to “visible” completion can come from game-level animation (e.g. piece move animation) or from game-specific animation queues, not from the engine deferring board updates.

---

## Summary

- **Board rendering vs queue execution:** Board updates are **synchronous with queue execution**. The engine does not render the board; the game module’s `handleGameLoop()` (and helpers like `updateBoard`) run during `runQueue()` and update both `game_mod.game` and the DOM (e.g. `#board`) in the same run.
- **Queue “stability” (empty queue + empty future):** When the queue and future are empty, no more `handleGameLoop()` runs, so no more engine-triggered board updates. So **stability means no further move processing**; the last move’s `handleGameLoop()` has already run and updated the board. If the game uses no animations, that implies visual completion. If the game uses move animation (e.g. chess `board.position(..., true)` with moveSpeed), the final frame may appear a short time (e.g. hundreds of ms) after the last `handleGameLoop()`.
- **Extra rendering passes:** There is no separate “board render pass” after the queue runs. The only “extra” updates are (1) game-specific animations that may complete after the queue is stable, and (2) normal UI (HUD, observer overlay, etc.) which is driven by GameTemplate/GameObserver, not by the queue.
