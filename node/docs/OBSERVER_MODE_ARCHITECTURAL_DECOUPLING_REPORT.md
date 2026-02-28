# observer_mode Architectural Decoupling — Report

**Goal:** Remove `observer_mode` from the engine and all game objects. Observer state lives only in `game-observer.js`. Engine uses `game.player == 0` for observer branching.

---

## 1. Exact diff of removed observer_mode references

### gametemplate.js

```diff
--- a/node/lib/templates/gametemplate.js
+++ b/node/lib/templates/gametemplate.js
@@ -470,7 +470,7 @@ class GameTemplate extends ModTemplate {
     if (this.initialize_game_run == 1) {
       // Ensure observer overlay still renders
-      if (this.game?.observer_mode === true || this.game?.player == 0) {
+      if (this.game?.player == 0) {
         if (this.observerControls) {
           this.observerControls.render();
         }
@@ -756,7 +756,6 @@ class GameTemplate extends ModTemplate {
     this.loadGame(game_id);
 
-    this.game.observer_mode = true;
     this.game.player = 0;
     this.saveGame(game_id);
 
@@ -894,7 +893,6 @@ class GameTemplate extends ModTemplate {
       if (observerParam && observerStubGameId) {
         this.game = this.newGame(observerStubGameId);
-        this.game.observer_mode = true;
         this.game.player = 0;
         this._observer_stub_bootstrap = true; // do not save stub to options.games
       } else {
@@ -907,7 +905,6 @@ class GameTemplate extends ModTemplate {
     const params = new URLSearchParams(window.location.search);
     if (params.get("observer") === "1") {
       this.game = this.game || {};
-      this.game.observer_mode = true;
       this.game.player = 0;
       if (this.game.id && !this._observer_stub_bootstrap) this.saveGame(this.game.id);
     }
```

### gametemplate-queue.js

```diff
--- a/node/lib/templates/gametemplate-src/gametemplate-queue.js
+++ b/node/lib/templates/gametemplate-src/gametemplate-queue.js
@@ -130,7 +130,7 @@ class GameQueue {
     } else {
-      if (this.game.observer_mode === true || this.game.player == 0) {
+      if (this.game.player == 0) {
         console.info(
           'GT [initializeGameQueue]: Observer.... check for additional moves..., set active while loading...'
         );
```

### gametemplate-game.js (loadGame)

```diff
--- a/node/lib/templates/gametemplate-src/gametemplate-game.js
+++ b/node/lib/templates/gametemplate-src/gametemplate-game.js
@@ -293,11 +293,6 @@ class GameGame {
           this.game = JSON.parse(JSON.stringify(this.app.options.games[i]));
           console.info('GT loading game: ' + game_id);
 
-          // Enforce observer invariant after reload
-          if (this.game?.observer_mode === true) {
-            this.game.player = 0;
-          }
-
           return this.game;
         }
       }
@@ -311,11 +306,6 @@ class GameGame {
       console.debug('GT [loadGame]: ', JSON.parse(JSON.stringify(this.app.options.games)));
 
-      // Enforce observer invariant for newly created games that were marked observer_mode earlier
-      if (this.game?.observer_mode === true) {
-        this.game.player = 0;
-      }
-
       return this.game;
     }
```

### game-observer.js (observer view state only — no observer_mode removed; added isObserverView)

```diff
--- a/node/lib/saito/ui/game-observer/game-observer.js
+++ b/node/lib/saito/ui/game-observer/game-observer.js
   constructor(app, game_mod) {
     this.app = app;
     this.game_mod = game_mod;
     this.arcade_mod = null;
 
+    this.isObserverView = false;
+    if (typeof window !== 'undefined' && window.location?.search) {
+      const params = new URLSearchParams(window.location.search);
+      if (params.get('observer') === '1') {
+        this.isObserverView = true;
+      }
+    }
+
     this.step_speed = 2000;
```

---

## 2. Confirmation: no engine file references observer_mode

- **lib/templates/gametemplate.js** — All `observer_mode` assignments and conditionals removed. Branching uses only `this.game?.player == 0`.
- **lib/templates/gametemplate-src/gametemplate-queue.js** — Condition replaced with `this.game.player == 0`.
- **lib/templates/gametemplate-src/gametemplate-game.js** — Both “Enforce observer invariant” blocks that read `this.game?.observer_mode` and set `player = 0` removed. loadGame no longer reads or writes observer_mode.
- **lib/templates/gametemplate-src/gametemplate-moves.js** — No observer_mode references (unchanged).
- **lib/saito/ui/game-observer/game-observer.js** — Never referenced `game.observer_mode`; observer view is now encoded in `this.isObserverView` (URL only).

**Remaining references outside engine:**

- **mods/twilight/twilight.js** (and src copy) — Comment only: `//if (mv[1] == this.game.observer_mode_player)` — no assignment or runtime use.
- **mods/chess/lib/chess-game-options.template.js** — Commented-out HTML: `<label for="observer_mode">` — form label, not the game property.
- **docs/** — Documentation only.
- **web/saito/saito.js** — Bundled output; may contain string from bundled code; will reflect source once rebuilt.

No engine or game-object logic uses `observer_mode` anymore.

---

## 3. Confirmation: no saved game object contains observer_mode (from current code)

- **Assignments removed:** No code path sets `this.game.observer_mode` or `game.observer_mode`. So nothing in the current codebase writes observer_mode onto the game object.
- **saveGame:** Persists `this.game` (or the game passed in). With observer_mode never set, new saves do not include observer_mode.
- **loadGame:** Uses `JSON.parse(JSON.stringify(this.app.options.games[i]))` — it loads whatever is in storage. We no longer read or use `observer_mode` after load; the two blocks that did “if observer_mode then player = 0” were removed. So we do not depend on observer_mode in stored objects.
- **Serialization:** No code adds or expects `observer_mode` on the game object. Any existing saved games that still have an `observer_mode` key from before will still load; the key is simply ignored.

So: no new persisted game is written with observer_mode, and the engine no longer relies on it in stored data.

---

## 4. Confirmation: only game-observer.js contains observer view logic

- **GameObserver** now owns the only explicit “observer view” flag: **`this.isObserverView`**, set in the constructor from `?observer=1` in the URL. It is not written to `this.game`, not saved, not serialized, and not referenced outside game-observer.js.
- **Engine** uses only **`this.game.player == 0`** to decide observer-related behavior (overlay render, initializeGameQueue observer path, etc.). It does not reference observer_mode or isObserverView.
- **Stub bootstrap and URL param** in GameTemplate.initialize() still set **`this.game.player = 0`** when `?observer=1` or when creating the observer stub; that is the engine’s existing “viewing as observer” invariant (player slot 0). No observer_mode is set.

Observer mode is therefore implemented only as:
- **Engine:** `game.player == 0` (game state only).
- **UI:** GameObserver’s `isObserverView` and existing observer UI (overlay, HUD, etc.) in game-observer.js.

---

## 5. How observer mode is now determined and isolated

- **Engine:** Treats “observer” purely as **`this.game.player == 0`**. No observer_mode flag. Observer branching (overlay, queue path, etc.) uses only this condition. No new engine flags were added.
- **Persistence:** `game.player` can still be 0 in saved games; observer_mode is not persisted. The engine no longer enforces or restores “observer” from a stored observer_mode; it only uses player from the loaded game.
- **Observer view (UI):** GameObserver sets **`this.isObserverView`** once in the constructor from the URL (`?observer=1`). This is used only inside game-observer.js for observer-specific UI behavior and is not written to the game object or persisted.
- **Entry:** When the user opens a “Watch Game” link with `?observer=1`, the template sets `this.game.player = 0` (and optionally creates the stub game). GameObserver sets `isObserverView = true` from the URL. The engine never sees observer_mode; it only sees `player == 0` and runs the observer path. Observer state is thus isolated in GameObserver; the engine stays a pure state machine on `game`.

---

## Constraints

- No new engine flags were introduced.
- Queue and halt semantics were not changed.
- Persistence format is unchanged except that observer_mode is no longer written (and is ignored when present in old saves).
- Observer logic was not moved into engine files; it remains in game-observer.js, with the engine using only `game.player == 0`.
