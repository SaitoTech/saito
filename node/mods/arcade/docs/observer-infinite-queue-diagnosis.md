# GameObserver Infinite Queue Loop — Diagnosis

## 1. Why `init` Repeats

The queue never advances because of a **guard in `addNextMove()`** combined with **observer feeding moves before the game is marked initialized**.

**Exact mechanism:**

1. **Observer pushes archive moves directly to `game.future`** (bypassing `addFutureMove()`):
   - In `game-observer.js` download callback when `playback_status === "init"`:
     ```javascript
     for (let tx of this.txs) {
       this.game_mod.game.future.push(tx.serialize_to_web ? tx.serialize_to_web(this.app) : tx);
     }
     ```
   - Same pattern in the constructor’s playback loop: `this.game_mod.game.future.push(...)`.

2. **Observer then runs the engine with a tight loop:**

   ```javascript
   while (true) {
     if (this.game_mod.processFutureMoves()) {
       this.game_mod.runQueue();
       continue;
     }
     break;
   }
   ```

3. **`processFutureMoves()`** finds the next move in `future`, splices it out, and calls **`addNextMove(ftx)`**.

4. **`addNextMove()` (gametemplate-moves.js:253)** uses this guard:

   ```javascript
   const guard = this.halted == 1 || this.gaming_active == 1 || this.game.initialize_game_run == 0;
   if (guard) {
     await this.addFutureMove(gametx); // move goes BACK to future
     return;
   }
   ```

   When the observer’s game was loaded from storage (or is a stub), **`game.initialize_game_run` is 0 or undefined**. So the guard is true.

5. So **the first (and every) archive move is never applied**: it is sent back to `future` via `addFutureMove()`. The queue never gets that move’s `turn[]` and **`initializeGameQueue()` is never called** (it is only reached after the guard, when `!this.browser_active`). So **`initialize_game_run` stays 0**.

6. **`processFutureMoves()` returns 1** (it “processed” a move by calling `addNextMove`, even though `addNextMove` deferred). The observer then calls **`runQueue()`**.

7. The **queue still contains the initial commands** (e.g. `"DECKBACKUP\t1"`, `"init"`) from the loaded game or from a previous run. **`runQueue()`** runs the last command (e.g. `"init"`). The game’s `"init"` handler (or `handleGameLoop`) **returns 0** (pause) and typically **does not remove** the command. So the queue length is unchanged.

8. **`runQueue()` returns 0**. The observer loop runs again: **`processFutureMoves()`** finds the **same** move again (it was re-inserted into `future` by `addFutureMove()`), **`addNextMove()`** hits the guard again, and the cycle repeats. So you see:
   - `runQueue(): set gaming_active = 1`
   - `MOVE (0): init`
   - `processFutureMoves(): set gaming_active = 0`
   - `Check 0 moves for next one` (or “Check N moves” with the move still in future)
   - `QUEUE: [..., "init"]` (unchanged)

So **`init` repeats** because:

- No move is ever accepted (guard keeps sending it back to `future`).
- The game never reaches “initialized” (`initialize_game_run` stays 0).
- The queue is never extended or consumed; the same `init` (or last command) is executed every time.

---

## 2. Minimal Code Path Responsible

| Step | Location                                         | What happens                                                                                                                                                                      |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **GameObserver** `download()` callback           | Push all `this.txs` into `game_mod.game.future` (direct push, no `addFutureMove()`).                                                                                              |
| 2    | Same callback                                    | `while (true) { if (processFutureMoves()) runQueue(); else break; }`                                                                                                              |
| 3    | **gametemplate-moves.js** `processFutureMoves()` | Finds next move in `future`, splices it, calls `addNextMove(ftx)`.                                                                                                                |
| 4    | **gametemplate-moves.js** `addNextMove()`        | Guard `this.game.initialize_game_run == 0` is true → `addFutureMove(gametx)` → move back in `future`, return. Queue and step are unchanged; `initializeGameQueue()` is never run. |
| 5    | **processFutureMoves()**                         | Returns `1`.                                                                                                                                                                      |
| 6    | **GameObserver** loop                            | Calls `runQueue()`.                                                                                                                                                               |
| 7    | **gametemplate-queue.js** `runQueue()`           | Processes last queue entry (e.g. `"init"`). Command returns `0`; queue length unchanged. Returns `0`.                                                                             |
| 8    | Loop                                             | Back to step 2; same move is still in `future`, so same cycle.                                                                                                                    |

The minimal responsible path is: **Observer direct push to `game.future`** → **processFutureMoves** → **addNextMove** (guard) → **addFutureMove** (move back to future) → **runQueue** (runs `init`, returns 0) → repeat.

---

## 3. Bypass of `addFutureMove()` / `addNextMove()`

Yes. The observer **does** bypass the normal path:

- **Normal path:** A move arrives → engine calls **`addFutureMove(tx)`** (or similar). Later **`processFutureMoves()`** moves it to the queue via **`addNextMove(ftx)`**. **`addNextMove()`** updates step, optionally calls **`initializeGameQueue()`**, pushes `turn[]` onto the queue, and runs the queue.
- **Observer path:** Observer does **`game_mod.game.future.push(serialized_tx)`** in:
  - The **download** callback (initial sync): `this.game_mod.game.future.push(tx.serialize_to_web(...))`.
  - The **playback** timer (live): `this.game_mod.game.future.push(tx.serialize_to_web ? ...)`.

So moves are **inserted into `future` without going through `addFutureMove()`**. That is fine for **filling `future`**. The failure is not the push itself but **when** the observer runs the engine: it runs **processFutureMoves + runQueue** before the game has been initialized. So the **first** time **`addNextMove()`** is called (from **processFutureMoves**), **`initialize_game_run` is still 0**, the guard fires, and the move is put back into `future`. No move is ever applied, so **step counters never update**, **player step tracking never runs**, and **queue commands are never consumed** (same last command, e.g. `init`, runs again and again).

---

## 4. Recommended Fix (Observer Only)

Do **not** change the engine. Change only **GameObserver** so that the game is **initialized** before any archive moves are pushed into `future` and before the **processFutureMoves + runQueue** loop runs.

**In `game-observer.js`**, in the download callback branch where `playback_status === "init"`:

1. **Before** pushing any transaction into `game.future` and **before** the `while (true) { processFutureMoves(); runQueue(); }` loop:
   - Call **`this.game_mod.initializeGameQueue(this.game_mod.game.id)`** (and await it if the method is async).
   - This sets **`game.initialize_game_run = 1`** and builds the initial queue (READY, init, etc.) so that the first **`addNextMove()`** from **processFutureMoves** will **not** hit the guard.

2. **Then** push archive moves into `game.future` and run the existing loop as today.

So the order becomes:

- Load game (already done).
- **Run initialization once:** `await this.game_mod.initializeGameQueue(this.game_mod.game.id)`.
- Then: push all `this.txs` into `game.future`, set `halted = 0`, and run the `while (true) { if (processFutureMoves()) runQueue(); else break; }` loop.

No change to **gametemplate-moves.js** or **gametemplate-queue.js**; only the observer’s initial-sync sequence is adjusted.

---

## 5. Instrumentation Patch (Console Logs)

Add these **temporarily** in the indicated files to confirm the diagnosis at runtime. Remove after verification.

### In `gametemplate-moves.js` — inside `addNextMove()`, right after the guard block:

```javascript
// DIAG: observer init loop
if (guard && this.game.player === 0) {
  console.log(
    '[OBS_DIAG] addNextMove DEFERRED (guard): initialize_game_run=',
    this.game.initialize_game_run,
    'move step=',
    gametxmsg?.step?.game
  );
}
```

### In `game-observer.js` — in the download callback, immediately before the `if (this.playback_status === "init")` block:

```javascript
// DIAG: observer init loop
console.log(
  '[OBS_DIAG] download callback: playback_status=',
  this.playback_status,
  'txs.length=',
  this.txs?.length,
  'game.initialize_game_run=',
  this.game_mod?.game?.initialize_game_run
);
```

### In `game-observer.js` — at the very start of the `if (this.playback_status === "init")` block, before the `for (let tx of this.txs)` loop:

```javascript
// DIAG: observer init loop
console.log(
  '[OBS_DIAG] initial sync: about to push',
  this.txs.length,
  'txs to future; game.initialize_game_run=',
  this.game_mod?.game?.initialize_game_run
);
```

**What to look for when reproducing:**

- **`game.initialize_game_run`** is **0** or **undefined** when the observer pushes to `future` and when **addNextMove** runs.
- **`[OBS_DIAG] addNextMove DEFERRED (guard)`** appears every time a move is “processed” from `future`, with the same move step.
- Queue log still shows **`"init"`** (or the same last command) after each **runQueue()**.

That confirms: guard blocks every **addNextMove**, so no move is applied, **init** never advances, and the loop is infinite. Applying the fix (call **initializeGameQueue** before pushing to **future** and before the loop) should remove the repetition.
