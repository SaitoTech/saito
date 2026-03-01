# GameObserver Loading and Live-Update Flow — Investigation Report

**Purpose:** Trace the full observer load lifecycle and identify where logic deviates from expectations.  
**Scope:** Instrumentation added; no fixes applied. Filter console by `[OBS_TRACE]` to see traces.

---

## Instrumentation Added

| Location | What is logged |
|----------|----------------|
| **Arcade.observeGame()** | Entry with `game_id` (prefix), `watch_live` |
| **GameTemplate.initializeObserverMode()** | Entry with `game_id` (prefix), `use_state` |
| **GameTemplate.initializeHTML()** | First run: `game_player`, `game_id`, `browser_active`; hash setup: `oldHash`, `short_game_id` |
| **GameTemplate.attachEvents()** | When calling `initializeGameQueue` with `game_id`, `game_player` |
| **initializeGameQueue() (observer branch)** | Before/after overlay render: `gaming_active`, `game.initialize_game_run`, overlay DOM existence, `observerControls.is_loading` |
| **GameObserver.render()** | `is_loading`, overlay existence; early return when overlay already exists; when calling `loader.render()` and setting `_observer_overlay_start_time` |
| **GameObserverLoader.render()** | When overlay is inserted; overlay in DOM after insert |
| **GameObserverLoader.remove()** | When overlay is removed (only if something calls `remove()` on loader; overlay is actually removed in `finishLoading` via `overlayEl.remove()`) |
| **GameObserver.finishLoading()** | Skip when already scheduled; `MIN_VISIBLE_MS`, `elapsed`, `delayMs`; in setTimeout: overlay existence before removal |
| **checkSyncStability()** | When stability ≥ 1000 ms and `finishLoading()` is invoked; `qLen`, `fLen`, `stableSince`, elapsed |
| **observerDownloadNextMoves()** | Callback branch: "invoking callback (startQueue)" vs "NOT invoking callback; setting mod.gaming_active = 0" with `new_moves`, `observerAndActive`, `gaming_active_after`, `halted`, `step_game`, `future_length` |
| **startQueue()** | `halted`, `gaming_active`, `is_loading` |
| **runQueue()** | When `gaming_active = 1` is set |
| **processFutureMoves()** | When `gaming_active = 0` is set; `futureLength`, `halted` |
| **addNextMove()** | On entry: `step`, `gaming_active`, `halted`, `initialize_game_run`, `guardTriggered`; when accepted: "calling startQueue()" |
| **addFutureMove()** | When observer path taken: `is_paused`, `halted`, `gaming_active` |
| **onConfirmation(game move)** | `step`, `game_player`, `asFuture`, `asNext`, `gaming_active`, `halted` |
| **handlePeerTransaction(game relay gamemove)** | (Observer only) `step`, `asFuture`, `asNext`, `gaming_active`, `halted` |
| **gameBrowserActive()** | (Observer only) `hash`, `gidLength`, `short_game_id`, `result` |

---

## 1. Overlay / Loader Visibility

### Expected flow (Watch Game click)

1. **Arcade.observeGame(game_id, watch_live)**  
   - Navigates to `/${slug}?observer=1#gid=${game_id}` (full `game_id` after recent change).

2. **GameTemplate.initialize()**  
   - If observer stub path: `initializeObserverMode(game_tx, false)` → loads game, sets `game.player = 0`, then later page injects game HTML and runs `initializeHTML` / `attachEvents`.

3. **initializeHTML()**  
   - Runs when `browser_active && initialize_game_run !== 1`.  
   - **Important:** It sets `window.location.hash` to `#gid=${short_game_id}&step=...` (short id). So if the URL arrived with full `game_id`, the hash is **overwritten** to short id here. That keeps `gameBrowserActive()` working only if comparison is short-vs-short.

4. **attachEvents()**  
   - Calls `initializeGameQueue(this.game.id)`.

5. **initializeGameQueue() (observer, player == 0)**  
   - Sets `gaming_active = 1`.  
   - Sets `observerControls.is_loading = true` and `observerControls.render()`.  
   - Then `observerDownloadNextMoves(() => this.startQueue())`.

6. **GameObserver.render()**  
   - With `is_loading === true`: if `#observer-sync-overlay` already exists → **early return** (no second overlay; also no second set of `_observer_overlay_start_time`).  
   - Otherwise: set `_observer_overlay_start_time = Date.now()`, then `this.loader.render()`.

7. **GameObserverLoader.render()**  
   - Inserts `#observer-sync-overlay` into `this.container` (default `document.body`).

8. **finishLoading()**  
   - Only called from **checkSyncStability()** when `sync_in_progress === false` and queue/future lengths stable for ≥ 1000 ms.  
   - Uses `MIN_VISIBLE_MS = 2000`.  
   - `elapsed = Date.now() - _observer_overlay_start_time`.  
   - `delayMs = max(0, 2000 - elapsed)`.  
   - Overlay is removed in `setTimeout(..., delayMs)`.

### Answers from traces

- **A. Is GameObserverLoader.render() ever called?**  
  Yes, from `GameObserver.render()` when `is_loading` is true and overlay does not exist. That is triggered from `initializeGameQueue()` (observer branch) after setting `observerControls.is_loading = true`.

- **B. Is it immediately removed?**  
  No. Removal happens only in `finishLoading()` inside a `setTimeout(..., delayMs)` with `delayMs ≥ 0` (minimum 2 s from `_observer_overlay_start_time`).  
  **Caveat:** If `finishLoading()` runs very soon (e.g. stability reached in &lt; 1 s after overlay shown), overlay still stays for `delayMs` (e.g. ~1 s more), so at least ~1–2 s visible. If `_observer_overlay_start_time` was never set (e.g. render always hit the “overlay already exists” early return), then `elapsed` is NaN and `delayMs = 2000`, so removal is 2 s later.

- **C. Is finishLoading() triggered before the 1.5 second minimum?**  
  The **minimum visibility** is enforced only in `finishLoading()`: overlay is removed after `delayMs = max(0, 2000 - elapsed)`. So the **earliest** removal is 2 s after `_observer_overlay_start_time`. If `finishLoading()` is invoked before the overlay is ever rendered (e.g. stability fires before first `GameObserver.render()`), then `_observer_overlay_start_time` may be null, `elapsed` becomes 2000 (from the ternary), `delayMs = 0`, and overlay is removed on next tick — and if the overlay was never inserted, the “removal” is a no-op. So the critical question is **ordering**: does `checkSyncStability()` ever call `finishLoading()` before the first `observerControls.render()` (and thus before overlay exists and before `_observer_overlay_start_time` is set)?

- **D. Is there a timing guard enforcing minimum visibility?**  
  Yes: `MIN_VISIBLE_MS = 2000` and `delayMs = max(0, MIN_VISIBLE_MS - elapsed)`. The guard only applies when `finishLoading()` runs; it does not prevent `finishLoading()` from being called early.

### Hypothesis (overlay not visible)

- **Race:** `checkSyncStability()` runs every 100 ms. If the queue drains and future is empty (or stable) very quickly, stability can be reached **before** the first `GameObserver.render()` runs (e.g. if `initializeGameQueue` → `observerDownloadNextMoves` is async and the stability interval fires before the first paint/render). Then `finishLoading()` runs with `_observer_overlay_start_time == null`, so `elapsed = 2000`, `delayMs = 0`, and the setTimeout runs immediately. The overlay might not be in the DOM yet, or it might be removed as soon as it appears.  
- **Container / timing:** Overlay is appended to `document.body`. If the game template replaces or clears a part of the DOM that the user is looking at, or if render runs after a route change that replaces body content, the overlay could be removed or not visible.  
- **Double render / early return:** If something calls `observerControls.render()` twice quickly and the first call already inserted the overlay, the second hit the “overlay already exists” early return and never set `_observer_overlay_start_time` again. If the **first** call never set it (e.g. first call was with `is_loading === false`), then when the second call runs with `is_loading === true` and creates the overlay, `_observer_overlay_start_time` is set. So the ordering of `is_loading` and the very first `render()` matters.

**What to check in logs:**  
Order of: `initializeGameQueue (observer)`, `GameObserver.render()` with `is_loading: true`, `Loader.render()`, first `checkSyncStability(): stable >= 1000ms`, `finishLoading()` with `elapsed` and `delayMs`, and `finishLoading() setTimeout: removing overlay`. If `finishLoading()` and the stability log appear **before** any `Loader.render()`, that supports the race hypothesis.

---

## 2. Replay Phase State Machine

### Flow during archive replay

- **observerDownloadNextMoves** loads moves into `game.future`, then either:  
  - invokes callback → **startQueue()** → **runQueue()** (sets `gaming_active = 1`) → processes queue → **processFutureMoves()** (sets `gaming_active = 0`, finds next future move, adds to queue, calls **startQueue()** again), or  
  - if `new_moves === 0` and observer and `gameBrowserActive()`: does **not** invoke callback and sets `mod.gaming_active = 0`.
- **addNextMove** (for each move pulled from future): guard is `halted === 1 || gaming_active === 1 || initialize_game_run === 0`. If guard passes, move is applied and **startQueue()** is called again.
- When the archive has no more new moves: callback is not invoked, `gaming_active = 0` is set in `observerDownloadNextMoves`. So after replay, **gaming_active** should be **0**.

### What to confirm in logs

- Every **addNextMove**: `gaming_active` before guard; whether guard triggers.  
- Every **startQueue** and **runQueue(): set gaming_active = 1**.  
- Every **processFutureMoves(): set gaming_active = 0** with `futureLength`, `halted`.  
- At **end of replay**: log block in `observerDownloadNextMoves` when not invoking callback: `gaming_active_after: 0`, `halted`, `step_game`, `future_length`.  
- If **finishLoading()** runs, it’s from **checkSyncStability()** after queue/future stable ≥ 1000 ms; after that, `is_loading = false` and overlay is removed after `delayMs`.

**Expectation:** After last batch of archive moves is processed, one more **processFutureMoves()** runs with no next future move, then **observerDownloadNextMoves** is called again from `processFutureMoves` (observer branch). Archive returns 0 new moves → we set `gaming_active = 0` and do not call `startQueue()`. So at end of replay: `gaming_active === 0`, and we rely on **checkSyncStability()** to call **finishLoading()**.

---

## 3. Live Move Reception

### Paths for a new move

1. **onConfirmation(blk, tx, conf)** — on-chain confirmation: if `request === 'game'` and step present, branch by `treat_all_moves_as_future` / `isFutureMove` → **addFutureMove**, or **isUnprocessedMove** → **addNextMove**.  
2. **handlePeerTransaction** — relay: `request === 'game relay gamemove'` → same idea: **addFutureMove** or **addNextMove**.

For observer to “follow” live:

- **addNextMove** must not be short-circuited by the guard (`gaming_active === 1`, `halted === 1`, `initialize_game_run === 0`).  
- So after replay we need **gaming_active === 0** and **halted === 0** (unless we want “paused” behavior).  
- If the move is taken as “future” (`asFuture`), it goes to **addFutureMove**; then if observer and `!gaming_active`, **processFutureMoves()** is called, which can pull the move into the queue and trigger **startQueue()**. So live can also be processed via **addFutureMove** + **processFutureMoves**.

### What to log

- **onConfirmation(game move)** and **handlePeerTransaction(game relay gamemove)**: `asFuture`, `asNext`, `gaming_active`, `halted`.  
- **addNextMove**: same plus `guardTriggered`; and “accepted; calling startQueue()” when guard fails.  
- **addFutureMove**: observer path with `gaming_active`; and when “game seems stuck” and **processFutureMoves()** is called.

### Possible failures

1. **Live move not received** — module never gets onConfirmation or handlePeerTransaction for this game (e.g. wrong game_id, relay not subscribed).  
2. **Guard blocks addNextMove** — `gaming_active === 1` or `halted === 1` or `initialize_game_run === 0` so move goes to **addFutureMove** only; then **addFutureMove** observer path must call **processFutureMoves()** when `!gaming_active` to process it.  
3. **Move processed but UI not updated** — **updateStep()** or HUD update is gated by **gameBrowserActive()**.  
4. **gameBrowserActive() false** — hash vs short id mismatch. After **observeGame()** we navigate with full `game_id` in `#gid=`. **initializeHTML()** then overwrites hash to `#gid=${short_game_id}&step=...`. So after first initializeHTML, hash has short id and **gameBrowserActive()** (which compares `gid === short_game_id`) can be true. If there is any path where hash stays full (e.g. initializeHTML not run for observer, or run with different game id), then `gid` (full) !== `short_game_id` (6 chars) → **gameBrowserActive()** is false and observer HUD/updateStep won’t run.

**What to check in logs:** When a live move is made: do you see **onConfirmation** or **handlePeerTransaction** with the step? Then **addNextMove** or **addFutureMove** with `gaming_active`/`halted`; then **gameBrowserActive()** result. If **gameBrowserActive()** is false, that explains missing UI updates and possibly which code paths run.

---

## 4. gameBrowserActive()

- **Implementation:** `gid = window.location.hash.split('&')[0].substring(5)` (i.e. after `#gid=`), `short_game_id = this.app.crypto.hash(game_id).slice(-6)`, return `gid === short_game_id`.  
- **observeGame()** now sets hash to full `game_id`. So on first load, **before** **initializeHTML()** runs, `gid` is the full id and `short_game_id` is 6 chars → **gameBrowserActive()** is **false**.  
- **initializeHTML()** (when `initialize_game_run !== 1`) sets hash to `#gid=${short_game_id}&step=...`, so after that, `gid` is short and **gameBrowserActive()** can be true.  
- So observer flow **depends** on **initializeHTML()** running and overwriting the hash to short id; otherwise observer-specific UI (updateStep, HUD, etc.) will not run because **gameBrowserActive()** stays false.

**What to log:** In observer, **gameBrowserActive()** is traced (when `game.player === 0`): `hash`, `gidLength`, `short_game_id`, `result`. Check during initial replay, after replay, and when a live move arrives. If you see `result: false` with a long `gidLength`, hash was never converted to short id.

---

## 5. Root Cause Hypotheses (Ranked)

1. **gameBrowserActive() false due to full game_id in hash**  
   - **observeGame()** sets `#gid=${game_id}` (full). If **initializeHTML()** does not run, or runs with a different game id, hash stays full. Then **gameBrowserActive()** is false → observer HUD/updateStep and possibly other observer paths (e.g. in **addFutureMove**) don’t run.  
   - **Evidence to collect:** Log **gameBrowserActive()** when live move arrives; if false and `gidLength > 6`, this is likely.

2. **Overlay race: finishLoading() before first render**  
   - **checkSyncStability()** fires every 100 ms and can call **finishLoading()** before **GameObserver.render()** (or **Loader.render()**) runs. Then `_observer_overlay_start_time` may be null, `delayMs = 0`, and overlay is removed immediately or never visibly shown.  
   - **Evidence to collect:** Order of first `checkSyncStability(): stable >= 1000ms` and first `Loader.render()` / `GameObserver.render() is_loading: true`.

3. **gaming_active or halted stuck after replay**  
   - If **gaming_active** stays 1 or **halted** stays 1 after replay (e.g. one path doesn’t set them correctly), **addNextMove** will always guard and only **addFutureMove** runs; then **addFutureMove**’s “game seems stuck” path must call **processFutureMoves()** for live moves to be processed.  
   - **Evidence to collect:** After replay, log **addNextMove** and **addFutureMove** when a live move arrives; check `gaming_active` and `halted`.

4. **Live move never delivered to this module**  
   - Game id mismatch, or relay/onConfirmation not firing for observer’s game.  
   - **Evidence to collect:** Any **onConfirmation** or **handlePeerTransaction** for the new step; if none, problem is upstream.

---

## 6. Minimal Fix Recommendations (No Broad Refactors)

- **If hypothesis 1 (gameBrowserActive + full gid):**  
  - Either ensure **initializeHTML()** always runs for observer and sets hash to short id (already does `#gid=${short_game_id}&step=...`), or  
  - Make **gameBrowserActive()** accept both: treat `gid` as “match” if `gid === short_game_id` **or** if `gid === game_id` (full), so observer works with full `#gid=` from **observeGame()** without relying on hash overwrite.

- **If hypothesis 2 (overlay race):**  
  - Ensure overlay is rendered and `_observer_overlay_start_time` is set **before** starting the stability interval, or  
  - Start the stability interval only after the first **observerControls.render()** (e.g. from **initializeGameQueue** after **render()** returns), or  
  - In **finishLoading()**, if `_observer_overlay_start_time == null`, set it to `Date.now()` so `delayMs` is at least 2000 from “now” and overlay has time to appear.

- **If hypothesis 3 (gaming_active/halted):**  
  - Verify the branch in **observerDownloadNextMoves** that sets `mod.gaming_active = 0` when `new_moves === 0` and observer is active; ensure no other path leaves **gaming_active** or **halted** set after replay.  
  - Add a single log at “replay complete” (when archive returns 0) to confirm `gaming_active === 0` and `halted === 0`.

- **If hypothesis 4 (move not received):**  
  - Confirm game_id and module routing for onConfirmation and relay; ensure observer’s game is the one receiving the move.

Run with the instrumentation, capture a full “Watch Game” → replay → live move sequence, and compare log order and values to the expectations above to confirm which hypothesis applies.
