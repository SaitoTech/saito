# GameObserver.render() Call Sites and Three-Render Behavior

Precise, code-based explanation. No speculation.

---

## 1. Every call site of observerControls.render() / GameObserver.render() in observer mode

| # | File:line | Calling function | Condition | is_loading at that moment |
|---|-----------|------------------|-----------|---------------------------|
| 1 | gametemplate.js:1708 | `injectGameHTML(template)` | `this.game?.player === 0` | **true** (constructor default) |
| 2 | gametemplate.js:526 | `initializeHTML(app)` | `this.game.player === 0` | **true** |
| 3 | gametemplate.js:475 | `initializeHTML(app)` | `this.initialize_game_run === 1` and `this.game?.player === 0` | **true** (only on later initializeHTML runs, not first load) |
| 4 | gametemplate-queue.js:142 | `initializeGameQueue(game_id)` | `this.game.player === 0` | **true** (set immediately before at 141) |
| 5 | game-observer.js:187 | `finishLoading()` | (none; always at end of finishLoading) | **false** (set to false at 170 just before) |

**Observer first-load sequence uses only 1, 2, 4, then 5.**  
Site 3 does not run on first load: when `initializeHTML` first runs, `initialize_game_run` is still 0 (it is set to 1 later in `initializeGameQueue`, which is invoked from `attachEvents` after the first `render()`/`initializeHTML` pass).

---

## 2. Why render() runs three times before finishLoading()

Execution order on first load (observer, game already selected):

**First render**  
`injectGameHTML()` (after `document.body.innerHTML = template`) → `this.observerControls.render()` (gametemplate.js:1708).  
Chain: game `render(app)` → `injectGameHTML(htmlTemplate())` → body replace → `observerControls.render()`.

**Second render**  
`super.render(app)` → `initializeHTML(app)` → `this.observerControls.render()` (gametemplate.js:526).  
Chain: game `render(app)` → `super.render(app)` → `initializeHTML(app)` → `if (this.game.player === 0) { this.observerControls.render(); }`.  
(`initialize_game_run` is still 0, so the block at 470–478 that would call render at 475 is skipped.)

**Third render**  
`attachEvents(app)` → `initializeGameQueue(this.game.id)` → set `observerControls.is_loading = true` → `this.observerControls.render()` (gametemplate-queue.js:140–142).  
Chain: `app.modules.attachEvents()` → game `attachEvents(app)` → `initializeGameQueue(this.game.id)` → `if (this.game.player == 0) { ... observerControls.render(); }`.

So the three loader renders are: (1) from `injectGameHTML`, (2) from `initializeHTML`, (3) from `initializeGameQueue`. All three occur before `finishLoading()` and with `is_loading === true` (for 3 it is explicitly set true just before the render).

---

## 3. What triggers finishLoading()

- **Called from:** `checkSyncStability()` (game-observer.js:536), inside the 100 ms `setInterval` callback.
- **Condition:** All of:
  - `is_loading` and `game_mod?.game` are truthy (guards at 504 and 510),
  - `sync_in_progress` is false (517),
  - `_syncStabilitySnapshot()` returns a snapshot (518–519),
  - The current snapshot has been unchanged for **≥ 1000 ms** (521–528): same `queueLen`, `lastTwoEntriesFingerprint`, and `futureLen` as the previous tick.

So it is **time-based stability** of the queue/future snapshot, not a specific count of `updateStep` or queue changes. When the snapshot stops changing for 1 second and no sync is in progress, the interval calls `finishLoading()` and clears itself.

`checkSyncStability()` is started only from one place: the callback passed to `observerDownloadNextMoves()` (game-observer.js:478), which runs after each batch of `loadTransactions` completes (in the observer flow, that’s from `initializeGameQueue` → `observerDownloadNextMoves(callback)`).

---

## 4. Is GameObserver.render() called after finishLoading()?

**Yes, once.**  
`finishLoading()` sets `this.is_loading = false` (line 170) and then calls `this.render()` (line 187). So one more `GameObserver.render()` runs **from inside finishLoading()**. At that call `is_loading` is false, so that render shows the HUD (and removes the loader overlay), not the loader.

After that, no other code path in the observer flow calls `observerControls.render()`: the other call sites (injectGameHTML, initializeHTML, initializeGameQueue) run only during initial load. So **loader** never runs again; **GameObserver.render()** runs exactly four times total (three loader + one HUD from finishLoading).

---

## 5. Minimal chronological sequence (observer mode)

1. **injectGameHTML**  
   Body replaced with game template; then `if (this.game?.player === 0) this.observerControls.render()`.

2. **First render**  
   From injectGameHTML (above). Loader shown (`is_loading === true`).

3. **Second render**  
   From `super.render(app)` → `initializeHTML(app)` → `if (this.game.player === 0) this.observerControls.render()` (line 526). Loader shown.

4. **Third render**  
   From `attachEvents(app)` → `initializeGameQueue(this.game.id)` → `observerControls.is_loading = true; observerControls.render()` (queue 140–142). Loader shown.

5. **finishLoading**  
   Called by `checkSyncStability()` when snapshot has been stable for ≥ 1000 ms and `!sync_in_progress`. Sets `is_loading = false`, then `this.render()`.

6. **Final render**  
   From inside `finishLoading()` (line 187). `is_loading` is false → loader removed, HUD rendered. No further `observerControls.render()` in this flow.

---

**Summary:** The loader is rendered three times (injectGameHTML, initializeHTML, initializeGameQueue) before `finishLoading()`. After `finishLoading()`, `render()` runs once more to show the HUD; nothing calls `observerControls.render()` again in the observer path, so the loader never runs again.
