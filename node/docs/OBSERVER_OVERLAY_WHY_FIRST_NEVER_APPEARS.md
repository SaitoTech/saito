# Analysis: Why the First Overlay Never Appears When Clicking "Watch Game"

**No code changes.** Trace from actual code paths.

---

## 1. URL that "Watch Game" triggers

**Click flow (from code):**

- **mods/arcade/lib/ui/overlays/lounge.js** (lines 343–348): The "watch game" button calls `this.mod.observeGame(this.invite.game_id, true)` then the overlay is removed.
- **mods/arcade/arcade.js** (lines 2070–2107): `observeGame(game_id, watch_live)`:
  - Resolves game and game module (e.g. Twilight).
  - Sets `game_mod.observer_watch_live = watch_live`.
  - If game not in wallet: `await game_mod.initializeObserverMode(game_tx, false)` (creates/saves game, then `initializeGameQueue`).
  - If game exists: `game_mod.loadGame(game_id)` and `game_mod.game.player = 0`.
  - Then:  
    **`this.app.browser.navigateWindow(\`/${slug}/#gid=${gid}\`);`**  
    with `slug = game_mod.returnSlug()` (e.g. `'twilight'`) and `gid = this.app.crypto.hash(game_id).slice(-6)` (e.g. `'24f248'`).

So the URL the app navigates to is:

- **`/twilight/#gid=24f248`**  
  (no query string; `&step=0` can appear later when the game updates the hash).

So **yes**: `http://localhost:12101/twilight/#gid=24f248&step=0` is the kind of URL you get when watching a game. The hash is correct; the important point is that **there is no `?observer=1` (or any query)** in what `observeGame` builds.

---

## 2. Why the overlay never appears (root cause)

The overlay is only added when the game module actually runs the observer UI path. That path can be skipped in two ways: (1) the game module never renders, or (2) the game module renders but `initializeHTML` never runs or never reaches `observerControls.render()`.

### 2.1 What has to happen for the overlay to show

1. **GameTemplate.initialize()** must not set `initialize_game_run = 1` and return (so we have a valid `this.game` and continue).
2. **Twilight.render()** must not return early (so it must not see `this.initialize_game_run` truthy).
3. **injectGameHTML** runs (body replaced with game template).
4. **GameTemplate.render()** → **initializeHTML()** runs and, for observer, calls **observerControls.render()** (overlay added).

So if `initialize_game_run === 1` at the start of Twilight.render(), the template and overlay are never rendered.

### 2.2 What happens on a full reload at `/twilight/#gid=24f248`

`navigateWindow` does **`window.location.href = target`** (browser.ts 2951), so the page **fully reloads**. All in-memory state (including the game you just set up in `observeGame`) is lost. The only thing that persists is whatever was saved (e.g. `saveGame` in `initializeObserverMode`) and what the new page loads from storage (e.g. `app.options.games`).

On the new load:

1. **modules.initialize()** runs; **GameTemplate.initialize()** runs (e.g. for Twilight).
2. **loadGame()** is called with no arguments.

**loadGame(null)** (gametemplate-game.js 242–261):

- Parses hash: `parseHash(window.location.hash)` → e.g. `{ gid: '24f248', step: '0' }`.
- If `hash.gid` and `this.app.options.games.length > 0`, it looks for a game in `app.options.games` for this module whose `id` hashes (last 6 chars) to `hash.gid`.
- If found → loads that game (including `observer_mode` / `player = 0` if set) and returns it.
- If not found, it can later use “most recent game” or create a new game; if still no `game_id`, it returns **null**.

So:

- **If** the game was saved before navigation and the new page loads `app.options.games` from storage and that list contains the Twilight game whose id hashes to `24f248`, then **loadGame() succeeds** and we have a game with `observer_mode` and `player = 0`. Then we do **not** hit the stub bootstrap, we do **not** set `initialize_game_run = 1`, and the rest of the flow (render → initializeHTML → observerControls.render()) can run and the overlay can appear.
- **If** the game is **not** in `app.options.games` on this reload (e.g. first time watching, or save didn’t persist in time, or options not yet loaded), then **loadGame() returns null**. Then we go to the **stub bootstrap** in GameTemplate.initialize().

### 2.3 Stub bootstrap path (when loadGame() returns null)

**GameTemplate.initialize()** (gametemplate.js 878–904):

- `observerStubGameId`:
  - First from query: `this.app.browser.returnURLParameter('load')`.  
    With URL `/twilight/#gid=24f248` there is **no query string**, so **no `load`** parameter → `observerStubGameId` is not set from here.
  - Then from hash: if `hash.gid` and `this.app.options.games.length > 0`, it tries to match a game in `app.options.games` by module and `hash.gid`.  
    If **`app.options.games` is empty** (or doesn’t contain this game), we never set `observerStubGameId`.
- `observerParam = params.get("observer") === "1"`.  
  The URL has **no query string**, so **no `?observer=1`** → **`observerParam` is false**.

Then:

- **If** `observerParam && observerStubGameId`: we create the stub game and continue (no `initialize_game_run = 1`).
- **Else**: we hit **`console.error('GT [initialize] No valid game.... stop!!!!!'); this.initialize_game_run = 1; return;`**.

So whenever:

- loadGame() returned null (game not in `app.options.games` on this load), and  
- we don’t have `?observer=1` (so observerParam is false), or we can’t resolve a stub game id (no `load=`, and no match from hash because `options.games` is empty),

we set **`initialize_game_run = 1`** and **return**. Then:

- **Twilight.render()** (twilight.js 225–227): **`if (this.initialize_game_run) return;`** → we **return without** calling `injectGameHTML` or `super.render()`.
- So we never call **initializeHTML()**, and **observerControls.render()** is never called → **the overlay is never added**.

So: the first overlay never appears when the reloaded page hits this “no game + no observer param” path, because the game module bails out before any game HTML or observer UI is rendered.

---

## 3. Is the URL “correct”?

- The URL **is** what the current “Watch Game” flow is designed to produce: **`/twilight/#gid=24f248`** (plus optional `&step=0` in the hash).
- So for the **intended** flow it is “correct” in the sense that it matches the code.
- But the URL is **incomplete** for robust observer loading:
  - It has **no `?observer=1`**, so after a full reload the stub bootstrap path (when loadGame fails) will not run and we set `initialize_game_run = 1` instead.
  - It has **no `?load=<game_id>`**, so we can’t resolve the stub game id from the query when `app.options.games` is empty.

So the overlay often doesn’t appear because the URL doesn’t carry the observer context needed after a full reload.

---

## 4. Summary

| Question | Answer |
|----------|--------|
| Why does the first overlay never appear? | When the page reloads at `/twilight/#gid=24f248` with no query string, (1) if the game isn’t in `app.options.games`, loadGame() returns null; (2) stub bootstrap then requires `?observer=1` (and a way to get the game id); (3) without it we set `initialize_game_run = 1` and return; (4) Twilight.render() then returns immediately and never runs initializeHTML() or observerControls.render(), so the overlay is never added. |
| Is `http://localhost:12101/twilight/#gid=24f248&step=0` the URL Watch Game triggers? | Yes. The code navigates to `/${slug}/#gid=${gid}` (e.g. `/twilight/#gid=24f248`). `&step=0` can be added later by the game. The important gap is the **missing query string** (no `?observer=1`, no `?load=...`). |

**Root cause:** The observer loading overlay never appears when, after a full reload, the game is not in `app.options.games` and the URL has no `?observer=1` (and no `?load=...`), so the stub bootstrap is not used and `initialize_game_run` is set to 1, which prevents the game (and thus the overlay) from ever rendering.

**Relevant code (no edits):**

- **mods/arcade/arcade.js** 2107: `navigateWindow(\`/${slug}/#gid=${gid}\`)` — no query params.
- **lib/templates/gametemplate.js** 880–904: stub bootstrap requires `observerParam && observerStubGameId`; else `initialize_game_run = 1`.
- **lib/templates/gametemplate.js** 881–882: `observerParam = params.get("observer") === "1"`; `observerStubGameId = returnURLParameter('load') || ...` (hash match only if `options.games.length > 0`).
- **mods/twilight/twilight.js** 225–227: `if (this.initialize_game_run) return;` — no injectGameHTML, no super.render(), so no overlay.
