# Objective State Trace — Second Instance (Post-Reload)

**No engine changes. No removal of reload. No queue logic modifications. No speculation. Deterministic flow reconstruction only.**

---

## SECTION 1 — Confirm Instance Boundaries

### 1. Exact point where navigateWindow() triggers full reload

**File:** `lib/saito/browser.ts` (lines 2949–2951)

```javascript
} else {
  this.page_navigation_active = true;
  window.location.href = target;
}
```

**Arcade call:** `this.app.browser.navigateWindow(\`/${slug}/#gid=${gid}\`)` (arcade.js:2106).  
Assigning **window.location.href** causes the browser to load the new URL and **replace the current document**. The current JavaScript execution context is torn down; no in-memory state survives.

### 2. Where the new GameTemplate instance is constructed

After the reload, the app bootstrap runs again (e.g. entry script, then `app.init()` → `browser.initialize(app)` → `modules.initialize(app)`). Module instances are created when the modules layer builds its list of mods (e.g. `this.mods[i] = new Module(this)` or equivalent for each module in the config). The **game module** (GameTemplate subclass) is constructed at that moment.

**File:** GameTemplate constructor runs when that module is instantiated (e.g. in the same place other mods are created from `mods_list`). There it sets:

- `this.observerControls = new GameObserverControls(app, this)` (gametemplate.js:190)
- `this.initialize_game_run = 0` (gametemplate.js:249)
- `this.archive_connected = false` (gametemplate.js:211)
- `this.archive_exhausted = 0` (gametemplate.js:212)

So the **new GameTemplate instance** is created during **post-reload app init**, when the module list is built, **before** any of that instance’s `initialize()`, `render()`, or `attachEvents()` run.

### 3. State surviving across reload

- **Pre-reload instance:** Destroyed when the document is unloaded. No references to it remain; no in-memory state is carried over.
- **Persistence:** The only cross-reload persistence is what the app stores and reloads (e.g. wallet, options). **app.options** (and thus **app.options.games**) is loaded from storage (or set during init). So when we ran **saveGame(game_id)** in **initializeObserverMode()** before the reload, we wrote the game (with **observer_mode: true**, **player: 0**) into **app.options.games** and persisted it. After reload, when the app loads options from storage, **app.options.games** again contains that saved game.

**Confirmation:**

- **Pre-reload instance is fully destroyed:** Yes. Full page reload replaces the document and its JS context; the previous GameTemplate instance no longer exists.
- **Only app.options.games (and other persisted app state) persists across reload:** Yes. No other in-memory state from the first instance survives except what was saved (e.g. via saveGame → options → storage).

---

## SECTION 2 — Post-Reload initialize() State

**Second instance only.** Call order:

1. **initialize()** (gametemplate.js:826)  
   - Calls **loadGame()** with **no arguments**.

2. **loadGame()** (gametemplate-game.js:242)  
   - **game_id == null:** Tries to get game_id from **window.location.hash** (parseHash; hash.gid). After navigateWindow the URL is `/${slug}/#gid=${gid}`, so **hash.gid** is set.  
   - Loops **app.options.games** for this module; finds the entry whose `id` has hash slice matching **hash.gid** and sets **game_id** (or from “most recent” if no hash match).  
   - For the matching game: **this.game = JSON.parse(JSON.stringify(this.app.options.games[i]))** (line 293). That game was saved in **initializeObserverMode()** with **observer_mode: true** and **player: 0**.  
   - Then (lines 296–299): **if (this.game?.observer_mode === true) this.game.player = 0**.  
   - Returns; **this.game** is not replaced again in this path.

3. **URL param block** (gametemplate.js:885–890)  
   - **window.location.search** after navigateWindow is typically **""** (URL is path + hash, e.g. `/twilight#gid=xxx`).  
   - **params.get("observer")** is **null**. The block does **not** run.  
   - **this.game** is unchanged; it already has **observer_mode** and **player: 0** from the loaded options.

4. **render()** (gametemplate.js:390)  
   - **initializeHTML(app)** is called synchronously.

5. **initializeHTML(app)** (gametemplate.js:425)  
   - **this.initialize_game_run == 1** → **false** (still 0).  
   - Does not return early. Later, **this.game.player == 0** → **observerControls.render()** runs (and, with the patch, the early-return branch when **initialize_game_run == 1** would also call **observerControls.render()** for observer mode; here we are in the normal path).

6. **attachEvents(app)** (gametemplate.js:571)  
   - **this?.game?.id** is set → **await this.initializeGameQueue(this.game.id)**.

7. **initializeGameQueue(this.game.id)**  
   - Invoked from **attachEvents**; no prior call to **initializeGameQueue** on this instance.

**At the exact moment initializeGameQueue() is entered (post-reload):**

| Variable | Value | Reason |
|----------|--------|--------|
| **this.game.id** | The observed game’s id (same as passed to loadGame from options) | Set by loadGame() from app.options.games[i].id. |
| **this.game.observer_mode** | **true** | Restored from app.options.games (saved in initializeObserverMode); loadGame does not clear it. |
| **this.game.player** | **0** | Restored from saved game; loadGame() then enforces it when observer_mode === true (lines 297–299). |
| **this.initialize_game_run** | **0** | Set to 0 in constructor (gametemplate.js:249); not set in initialize() (we only set it to 1 when loadGame() returns falsy and we return early). |
| **this.browser_active** | **1** | Set by browser when this module is the active one for the current URL; game mod is active for /twilight. |
| **this.game.live** | **false** (or undefined) | Not set by loadGame or initialize(); live is set later (e.g. in finishLoading when observer_watch_live). |
| **this.halted** | **0** or **undefined** | **halted** is on the **module** (this.halted), not on this.game. Not set in GameTemplate constructor; set in queue code (e.g. restartQueue sets 0, startQueue guard sets 1). So at first entry to initializeGameQueue it has not been set yet. |

**Note:** **this.game.halted** does not exist in the code; the halt flag is **this.halted** on the GameTemplate/queue instance.

---

## SECTION 3 — Branch Evaluation

**Condition at post-reload initializeGameQueue() (gametemplate-queue.js:133):**

```javascript
if (this.game.observer_mode === true || this.game.player == 0)
```

- **this.game.observer_mode** is **true** (from loaded options).  
- **this.game.player** is **0** (from loaded options and loadGame() invariant).

So the condition is **TRUE**. The **observer branch** is taken: **observerDownloadNextMoves(() => this.startQueue())** is called (lines 137–139). **observerDownloadNextMoves()** therefore **must** execute on the second instance.

**If it had been FALSE:** The only way would be for **observer_mode** to be falsy and **player** to be non-zero. That would require either: (1) the saved game in **app.options.games** not having **observer_mode** or **player: 0**, or (2) **loadGame()** or the URL param block overwriting **this.game** or mutating **observer_mode** / **player** before **attachEvents** runs. From the code above, after **loadGame()** and the URL block, **observer_mode** and **player** are as stated, so we do **not** treat the branch as false.

---

## SECTION 4 — observerDownloadNextMoves() Flow

**Branch is TRUE**, so **observerDownloadNextMoves(mycallback)** runs with **mycallback = () => this.startQueue()**.

**File:** `lib/saito/ui/game-observer/game-observer.js` (from line 523).

**1. Early-return conditions**

- **Before loadTransactions:**  
  - **if (!mod.archive_connected)** (line 553): logs, **setTimeout(..., 3000)** to re-call **observerDownloadNextMoves(mycallback)**, **return null**. **mycallback() is not called.**  
  - **if (mod.archive_exhausted < 0)** (line 561): logs, **setTimeout(..., 10000)** to re-call **observerDownloadNextMoves(mycallback)**, **return null**. **mycallback() is not called.**

**2. Guard clauses**

- The only guards before the archive fetch and callback are **!mod.archive_connected** and **mod.archive_exhausted < 0**. There is no guard on **game.id**, **game.player**, or **observer_mode** inside **observerDownloadNextMoves**.

**3. When archive fetch is skipped**

- Archive fetch (**loadTransactions**) is skipped whenever we **return** before line 576. That happens when **!mod.archive_connected** or **mod.archive_exhausted < 0**. So if either is true, we skip the fetch.

**4. When callback is not invoked**

- **mycallback()** is only invoked inside the **loadTransactions** callback (game-observer.js:637–638 or 643–645). If we never reach **loadTransactions** (because we returned earlier), **mycallback()** is never called. So whenever we hit the **!mod.archive_connected** or **mod.archive_exhausted < 0** return, the callback is **not** invoked.

**5. When startQueue() is not called**

- **startQueue()** is only called via **mycallback()**. So **startQueue()** is not called whenever **mycallback()** is not invoked — i.e. whenever **observerDownloadNextMoves** returns early.

**Application to the second instance:**

- **mod** = **this.game_mod** = the second (post-reload) GameTemplate instance.  
- **mod.archive_connected** is set to **true** only in **onPeerServiceUp(app, peer, service)** when **service.service == 'archive'** (gametemplate.js:702–704).  
- On a **fresh reload**, no peer handshake or service notification has run yet, so **archive_connected** is still **false** (constructor set it to false; gametemplate.js:211).  
- So **!mod.archive_connected** is **true** → we hit the first guard → we **return null** without calling **loadTransactions** or **mycallback()** → **startQueue()** is **not** called.  
- **archive_exhausted** is 0 (constructor, gametemplate.js:212), so **archive_exhausted < 0** is false; that second guard does not trigger.  
- So on a freshly reloaded observer instance, **observerDownloadNextMoves()** **short-circuits** on **!mod.archive_connected** and never invokes the callback or **startQueue()** until a later retry (after 3s) when **archive_connected** may have become true.

---

## SECTION 5 — Overlay Activation Path

**observerControls.render()** (game-observer.js:96–127).

**1. Condition for loading overlay**

- **const html = GameObserverTemplate(this.game_mod, this.is_loading)** (line 110).  
- If **this.is_loading** is **true**, the template renders the **sync overlay** (loading).  
- If **this.is_loading** is **false**, the template renders the **HUD** and the sync overlay is removed (lines 120–121).

So the **loading overlay** is shown when **observerControls.render()** is called with **is_loading === true**.

**2. Flag controlling loading overlay**

- **is_loading** on the GameObserver instance (**this** inside GameObserver).

**3. Where is_loading is set to true**

- **Only in the GameObserver constructor** (game-observer.js:21): **this.is_loading = true**.  
- It is set to **false** only in **finishLoading()** (game-observer.js:248).

**4. Could is_loading be false when initializeHTML() runs (post-reload)?**

- **No.** The second instance’s **observerControls** is created when the second GameTemplate instance is constructed (gametemplate.js:190), so **is_loading** is set to **true** in the GameObserver constructor and is never set to **false** until **finishLoading()** runs.  
- **finishLoading()** is only called from **updateStep()** when **total > 0** (game-observer.js:375–377), or from **render()** when **this.is_loading && this.game_mod.archive_exhausted === 1** (game-observer.js:106–108).  
- **updateStep()** is only called from **addNextMove()** (gametemplate-moves.js:300), which runs when we process a move from the queue/future — i.e. after **startQueue()** and the queue/processFutureMoves/addNextMove path have run.  
- On the second instance we have just established that **startQueue()** is **not** called (observerDownloadNextMoves short-circuits), so **addNextMove()** and **updateStep()** do not run, and **finishLoading()** is not called from that path.  
- **archive_exhausted === 1** is set when the archive returns zero new moves (or when exhausted); that happens inside the **loadTransactions** callback, which we never reach because we returned early. So **finishLoading()** is not called from **render()** either before **initializeHTML()** has run.  
- So at the time **initializeHTML()** runs on the second instance, **is_loading** is still **true**. The loading overlay **should** be rendered when **observerControls.render()** is called from **initializeHTML()**.

---

## SECTION 6 — Objective Conclusion

**Determination: B) Branch taken but observerDownloadNextMoves short-circuits — explain why.**

- The **observer branch** in **initializeGameQueue()** is **taken** on the second instance: **this.game.observer_mode === true** and **this.game.player == 0** (from **loadGame()** restoring the game saved in **initializeObserverMode()** and from the **observer_mode** invariant in **loadGame()**).  
- **observerDownloadNextMoves()** is therefore invoked.  
- It **short-circuits** on the first guard: **!mod.archive_connected**. On the post-reload instance, **archive_connected** is still **false** (set in constructor; set to **true** only when **onPeerServiceUp(..., service.service == 'archive')** fires).  
- So the function **returns null** without calling **loadTransactions** or **mycallback()**, and **startQueue()** is never called.  
- The overlay **activation** path is satisfied: **is_loading** is **true** when **initializeHTML()** runs, so the loading overlay **should** be shown. The “not behaving as expected” part is that **startQueue()** (and thus queue processing and eventual **finishLoading()**) does not run until **archive_connected** becomes true and a later **observerDownloadNextMoves** call (e.g. after the 3s retry) passes the guard and runs the archive fetch and callback.

**No proposed fixes. No guesses. No logging. Only deterministic flow reconstruction.**

---

**End of report.**
