# GameObserver.finishLoading() Not Firing — Root-Cause Analysis

## 1. Every code path that can call GameObserver.finishLoading()

| File | Function | Line (approx) | Context |
|------|----------|----------------|---------|
| **lib/saito/ui/game-observer/game-observer.js** | `checkSyncStability()` (inside setInterval callback) | ~600 | When `!self.sync_in_progress` and `qLen === lastQLen && fLen === lastFLen` and `(now - stableSince) >= STABLE_MS` (1000), then `self.finishLoading()` is called. |

**Conclusion:** The **only** call site of `finishLoading()` in the codebase is inside `checkSyncStability()`’s setInterval callback. There is no other path (no direct call from Arcade, gametemplate, or elsewhere). So if `finishLoading()` never runs, either:

- `checkSyncStability()` is never invoked, or
- It is invoked but the interval never reaches the condition that calls `finishLoading()`, or
- The interval is cleared before that condition is met, or
- `finishLoading()` is called but returns early due to its own guards.

---

## 2. checkSyncStability() step-by-step trace

### When is it first invoked?

- **Only from:** `observerDownloadNextMoves()` in **lib/saito/ui/game-observer/game-observer.js**, at the end of the `loadTransactions(...)` callback (after processing `txs`, updating `new_moves`, and optionally calling `mycallback()`). So it runs **once per archive response**, and only when that callback runs (i.e. after `this.sync_in_progress = false` at the start of the callback).

### Under what conditions does it early-return?

1. **At entry:**  
   `if (!this.is_loading || !this.game_mod?.game) return;`  
   - Exits if observer is not in “loading” or game/mod/game is missing.

2. **At entry:**  
   `if (this._sync_stability_interval != null) return;`  
   - Exits if a stability interval is already running (e.g. from a previous archive response). So only the **first** `checkSyncStability()` call after the interval is cleared will start a new interval.

### Under what conditions is _sync_stability_interval set?

- Set **once** when both entry checks pass:  
  `this._sync_stability_interval = setInterval(() => { ... }, CHECK_MS);`  
  with `CHECK_MS = 100`.

### Under what conditions is it cleared?

1. **Inside the interval callback:**  
   When `!self.is_loading || !self.game_mod?.game` → clear interval, set `_sync_stability_interval = null`, set `stability_monitor_active = false`, return. So if `is_loading` becomes false (or game is lost) before stability is reached, the monitor stops and never calls `finishLoading()`.

2. **Right before calling finishLoading():**  
   When `(now - stableSince) >= STABLE_MS` → clear interval, set to null, then call `finishLoading()`.

3. **Inside finishLoading():**  
   `finishLoading()` also clears the interval if it’s still set (after setting `is_loading = false`). So after a successful `finishLoading()`, the interval is cleared there as well.

### Under what conditions can it fail to ever start?

- **is_loading is false** when `checkSyncStability()` is invoked (e.g. something else already called `finishLoading()` or set `is_loading = false`).
- **game_mod or game_mod.game** is null/undefined when `checkSyncStability()` is invoked.
- **Interval already exists:** `_sync_stability_interval != null` (e.g. leftover from a prior run that never cleared, or a race where two archive responses both run and the second bails out).

---

## 3. Instrumentation added

Inside `checkSyncStability()` the following was added:

- **Entry:** Log when either early-return is taken (`[OBS_STABILITY] checkSyncStability() early return (entry)` with `is_loading`, `hasGame`; or `early return (interval already set)`).
- **After starting the interval:** Log `[OBS_STABILITY] checkSyncStability() interval started`.
- **Every interval tick (first 25 ticks ≈ 2.5 s):** Log `[OBS_STABILITY] tick` with:
  - `tick`, `is_loading`, `sync_in_progress`, `qLen`, `fLen`, `lastQLen`, `lastFLen`, `stableSince`, `intervalSet`, `lengthsMatch`, `stableElapsed`.
- **If the tick exits early** (because `!self.is_loading || !self.game_mod?.game`): Log `[OBS_STABILITY] tick early-exit` with `tick`, `is_loading`, `hasGame` for the first 25 ticks.

In `finishLoading()`:

- **On entry:** Log `[OBS_STABILITY] finishLoading() entered` with `is_loading`, `_overlay_removal_scheduled`.
- **When returning because !is_loading:** Log `[OBS_STABILITY] finishLoading() skipped: is_loading false`.

Filter console by `[OBS_STABILITY]` to inspect stability state and whether `finishLoading()` is reached or skipped.

---

## 4. What to verify from logs

Use the instrumentation to confirm:

| Question | How |
|----------|-----|
| Is `checkSyncStability()` called at all? | Look for `early return (entry)`, `early return (interval already set)`, or `interval started`. |
| Is `_sync_stability_interval` created? | Look for `interval started`; if you only see early returns, it is never created. |
| Is `sync_in_progress` stuck true? | In `tick` logs, if `sync_in_progress` stays true for many ticks, `stableSince` is reset every time and the stability condition is never met. |
| Are `qLen`/`fLen` actually changing? | Compare `qLen`, `fLen` to `lastQLen`, `lastFLen` over ticks; if they keep changing, `lengthsMatch` stays false and `stableSince` is repeatedly reset. |
| Is `stableSince` reset repeatedly? | If `stableSince` is often null or `stableElapsed` never reaches ≥ 1000, stability is never reached. |
| Is the finishLoading condition reached but not executed? | If you see the log `checkSyncStability(): stable >= 1000ms, calling finishLoading()` but no `finishLoading() entered`, then something threw before or inside the call. |
| Is `finishLoading()` executed but overlay removal fails? | If you see `finishLoading() entered` and the later `finishLoading() setTimeout: removing overlay`, check `overlayExists` and DOM; if you see `skipped: _overlay_removal_scheduled` then a second call was blocked. |

---

## 5. is_loading and stability monitor

- **Who sets is_loading = false?**  
  Only `finishLoading()` (around line 176). So under normal flow, `is_loading` stays true until `finishLoading()` runs.

- **If is_loading becomes false before stability:**  
  The interval callback hits `if (!self.is_loading || !self.game_mod?.game)`, clears the interval, and returns. So the monitor stops and **never** calls `finishLoading()`. So either:
  - Something else sets `is_loading = false` (no such code found in game-observer.js), or
  - The same `GameObserver` instance never had `finishLoading()` run (so it never set `is_loading = false`), and the only way the interval stops is the same condition (e.g. `game_mod.game` becoming null). So the critical question is: **does the interval run at all, and if so, does it see `is_loading === true` until stability is reached?**

Instrumentation will show this: if you see `tick early-exit` with `is_loading: false` before any “stable >= 1000ms” log, then **premature is_loading = false** (or a different observer instance) is stopping the monitor. If you never see `interval started` or any `tick` logs, the interval never runs or `checkSyncStability()` never passes its entry checks.

---

## 6. Multiple GameObserver instances

- **Where observer is created:**  
  In **lib/templates/gametemplate.js**: `this.observerControls = new GameObserverControls(app, this);` and `GameObserverControls` is required from `game-observer.js` (the GameObserver class). So there is **one** GameObserver per game module instance (e.g. one per game type / tab).

- **Relevance:**  
  If the same page had multiple game modules with observer mode, each would have its own `observerControls` and its own `_sync_stability_interval`. Only the observer that actually runs `checkSyncStability()` and whose interval reaches stability will call `finishLoading()`. So if the wrong instance is the one that received the archive callback, or if the interval is on a different instance than the one that rendered the overlay, behavior would be inconsistent. The instrumentation logs do not include an instance id; if needed, add a short id in the constructor and log it in every `[OBS_STABILITY]` line to confirm a single instance is involved.

---

## 7. finishLoading() blocked by guards

`finishLoading()` can exit without removing the overlay in two cases:

1. **if (!this.is_loading) return;**  
   So if `finishLoading()` is called when `is_loading` is already false (e.g. race, or wrong instance), it does nothing.

2. **if (this._overlay_removal_scheduled) return;**  
   So if `finishLoading()` was already run once (or something else set the flag), the second call is a no-op.

Other possibilities:

- **Interval cleared early:**  
  If the callback clears the interval because `!self.is_loading || !self.game_mod?.game` before the stability condition is met, `finishLoading()` is never called.

- **Exception:**  
  If an exception is thrown inside the interval callback before `finishLoading()` (e.g. when reading `game.queue` or `game.future`), the call never happens. Instrumentation will show whether the “stable >= 1000ms, calling finishLoading()” log appears; if it does and “finishLoading() entered” does not, the throw is between those two points.

- **_observer_overlay_start_time null:**  
  This does **not** block `finishLoading()` from running; it only affects the delay before overlay removal (`elapsed` / `delayMs`). So it does not explain “finishLoading() not firing.”

---

## 8. Findings (concise)

Use the bullet format you asked for after collecting a run with the new logs. Until then, the following are the **exact conditions and code paths** that can prevent `finishLoading()` from firing:

- **Only call path:**  
  `finishLoading()` is invoked **only** from **lib/saito/ui/game-observer/game-observer.js** inside `checkSyncStability()`’s setInterval callback, when `!self.sync_in_progress` and `qLen === lastQLen && fLen === lastFLen` and `(now - stableSince) >= 1000`.

- **Exact condition preventing finishLoading() (if it never runs):**  
  One or more of:
  1. `checkSyncStability()` is never called (archive callback never runs or doesn’t reach `this.checkSyncStability()`).
  2. `checkSyncStability()` early-returns: `!this.is_loading || !this.game_mod?.game` or `this._sync_stability_interval != null`.
  3. Interval is started but every tick either:  
     (a) hits `!self.is_loading || !self.game_mod?.game` and clears the interval, or  
     (b) has `self.sync_in_progress === true` so `stableSince` is always reset, or  
     (c) has `qLen !== lastQLen || fLen !== lastFLen` so `stableSince` is always reset and never reaches ≥ 1000 ms.
  4. An exception is thrown in the interval callback before `self.finishLoading()`.

- **Exact variable values to observe:**  
  From the new logs: `is_loading`, `sync_in_progress`, `qLen`, `fLen`, `lastQLen`, `lastFLen`, `stableSince`, `stableElapsed`, and whether `lengthsMatch` is true for 10+ consecutive ticks.

- **Exact code lines:**  
  - Entry early-return: **game-observer.js** ~551–552 (`!this.is_loading || !this.game_mod?.game`) and ~553–554 (`_sync_stability_interval != null`).  
  - Tick early-exit clearing interval: ~561–569 (`!self.is_loading || !self.game_mod?.game`).  
  - Stability reset: ~573–574 (`self.sync_in_progress`) and ~593–596 (else branch updating `stableSince`, `lastQLen`, `lastFLen`).  
  - Condition that calls finishLoading: ~576–591 (lengths match, stableSince set, elapsed ≥ STABLE_MS).

- **Classification (choose based on trace):**
  - **(A) sync_in_progress stuck:** Logs show `sync_in_progress: true` for many ticks and never false before the interval is cleared.
  - **(B) stability timer not starting:** Logs show only `early return (entry)` or `early return (interval already set)`, never `interval started`.
  - **(C) stability timer resetting:** Logs show `interval started` and ticks, but `stableSince` or `stableElapsed` never reaches ≥ 1000 (e.g. `lengthsMatch` false or `sync_in_progress` true).
  - **(D) finishLoading firing but overlay not removed:** Logs show `finishLoading() entered` and `overlayRemovalIn`; then check DOM/CSS or `overlayExists` in the setTimeout log.
  - **(E) incorrect is_loading state:** Logs show `tick early-exit` with `is_loading: false` before any “stable >= 1000ms” log.
  - **(F) something else:** e.g. exception (no “finishLoading() entered” after “calling finishLoading()”), or multiple instances (add instance id to logs and re-run).

Run a cold-start observer flow, capture console for `[OBS_STABILITY]` and `[OBS_TRACE]`, and map the sequence above to the log output to pick the exact cause (A–F) and the responsible line.
