# Observer Overlay Structural Fix — Report

## 1. Exact diff

### lib/templates/gametemplate.js

```diff
       document.body.innerHTML = template;
       this.calculateBoardRatio();
+      if (this.observerControls && this.game?.player === 0) {
+        this.observerControls.render();
+      }
     }
     this.game_template_injected = 1;
   }
```

### lib/saito/ui/game-observer/game-observer.js

**Added:** `_getGameContainer()`, `_insertIntoContainer()`, `renderLoader()`, `renderHUD()` (no direct body writes; all insert into container).

**Replaced `render()` with idempotent, container-based logic:**

```diff
-  render() {
-    const html = GameObserverTemplate(this.game_mod, this.is_loading);
-    if (this.is_loading) {
-      const syncOverlay = document.getElementById('observer-sync-overlay');
-      if (syncOverlay) {
-        this.app.browser.replaceElementById(html, 'observer-sync-overlay');
-      } else {
-        this.app.browser.addElementToDom(html);
-      }
-    } else {
-      const prevSync = document.getElementById('observer-sync-overlay');
-      if (prevSync) prevSync.remove();
-      if (!document.getElementById('game-observer-hud')) {
-        this.app.browser.addElementToDom(html);
-      } else {
-        this.app.browser.replaceElementById(html, 'game-observer-hud');
-      }
-    }
-    console.log('Observer DOM Audit:', ...);
-    this.attachEvents();
-    this.updateUIState();
-  }
+  render() {
+    const container = this._getGameContainer();
+    if (!container) return;
+    if (this.is_loading) {
+      const hud = container.querySelector('#game-observer-hud');
+      if (hud) hud.remove();
+      this.renderLoader(container);
+    } else {
+      const loader = container.querySelector('#observer-sync-overlay');
+      if (loader) loader.remove();
+      this.renderHUD(container);
+    }
+    this.attachEvents();
+    this.updateUIState();
+  }
```

**Removed from `finishLoading()`:** Timing logs, MutationObserver, `requestAnimationFrame`; now calls `this.render()` directly. Removed engine mutations: `this.game_mod.halted = 0`, `this.game_mod.game.live = true`, `this.game_mod.expecting_state = true`.

**Removed from `replayToIndex()`:** `this.game_mod.halted = 0`, `this.game_mod.game.player = 0`.

**Removed from `pause()`:** `this.game_mod.halted = 1`.

**Removed from `resume()`:** `this.game_mod.halted = 0`.

**Removed:** `_timingSnapshot()` and constructor timing fields (`_timing_overlay_removed`, `_timing_hud_inserted`, `_timing_raf_fired`). Removed timing/alert/MutationObserver/rAF instrumentation from `render()` and `finishLoading()`.

---

## 2. Confirmations

### No direct document.body writes remain

- **game-observer.js:** No `document.body.appendChild`, no `addElementToDom(html)` (no second arg appends to body), no `replaceElementById` used for observer nodes. All observer UI is inserted via `_insertIntoContainer(container, html, elementId)`, which uses `container.appendChild(node)` or `existing.replaceWith(node)` where `container` is `_getGameContainer()` (`#main`, `.main`, or `body.firstElementChild`). The only use of `document.body` is read-only: `document.body.firstElementChild` as fallback for the container.

### No engine state mutation remains (except allowed replay)

- **Removed:** All assignments to `this.game_mod.halted`, `this.game_mod.game.live`, `this.game_mod.expecting_state`, `this.game_mod.game.player` (outside replay). Removed `mod.archive_exhausted` in observer download callback.
- **Allowed and kept:** `this.game_mod.game = JSON.parse(JSON.stringify(this.baseline_state))` (and related) in `replayToIndex()` for backwards replay only. `observerDownloadNextMoves` still mutates `g.future` / `g.futurePlus` to feed the queue (queue logic unchanged per constraint).

### Loader and HUD are separate rendering paths

- **GameObserverLoader:** `renderLoader(container)` — builds sync-overlay HTML from template with `is_loading === true`, inserts/replaces `#observer-sync-overlay` inside the game container.
- **GameObserverHUD:** `renderHUD(container)` — builds controls HTML from template with `is_loading === false`, inserts/replaces `#game-observer-hud` inside the same container.
- **render()** chooses one path from `this.is_loading`: if loading, remove HUD then `renderLoader(container)`; else remove loader then `renderHUD(container)`.

### GameObserver.render() is idempotent

- **Container:** If `_getGameContainer()` is null, `render()` returns without changing DOM.
- **Loading:** If `this.is_loading === true`, any existing HUD is removed and the loader is inserted or replaced (by id) in the container. Calling `render()` again with `is_loading` still true replaces the loader in place; no duplicate nodes.
- **Ready:** If `this.is_loading === false`, any existing loader is removed and the HUD is inserted or replaced (by id). Calling `render()` again replaces the HUD in place; no duplicate nodes.
- **attachEvents()** and **updateUIState()** run after the loader/HUD update; they bind to existing elements and do not create new observer DOM nodes.

---

## 3. Summary

- **gametemplate.js:** After `injectGameHTML()` wipes and rebuilds `document.body`, observer UI is restored by calling `this.observerControls.render()` when `this.observerControls` exists and `this.game?.player === 0`.
- **game-observer.js:** Observer UI is split into loader (sync overlay) and HUD (controls). Both render only inside the game container (`#main` or `.main` or `body.firstElementChild`). No writes to `document.body`. No engine state mutation except the allowed replay replacement of `game_mod.game`. `render()` is idempotent and decides loader vs HUD from `is_loading` only.
