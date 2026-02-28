# Lifecycle Analysis: #game-loader-screen and GameObserverLoader (#observer-sync-overlay)

Strictly factual code-path analysis. No proposed fixes.

---

## 1. #game-loader-screen

### 1.1 Where it is defined

- **File:** `lib/templates/gametemplate-src/index.js`
- **Function:** The module’s **default export** (the function used as `HomePage` in GameTemplate).
- **Markup:** Lines 148–167: root `<div id="game-loader-screen">` (with inline styles for that id at lines 76–84), containing `.game-loader-backdrop` and `#saito-loader-container` with the “loading game...” text when `include_loader` is true.

### 1.2 How it enters the DOM

- **Server-rendered HTML.** It is not injected by client-side JS.
- The overlay is part of the **initial HTTP response**: when the game URL is requested (e.g. `GET /chess/`), `GameTemplate.webServer()` in `lib/templates/gametemplate.js` (line 1725) calls `HomePage(app, mod_self, app.build_number, mod_self.social)` and sends that full HTML in the response.
- The browser parses that document; the first DOM already contains `#game-loader-screen` in `<body>`.

### 1.3 In observer mode, which code path causes it to disappear?

- In observer mode the user is loading **into a game** (`this.game` is set, `this.game.player === 0`).
- **Only one code path removes it:** replacement of the entire body in `injectGameHTML()`.
- **File:** `lib/templates/gametemplate.js`
- **Line:** 1704: `document.body.innerHTML = template;`
- The game module (e.g. chess) calls `injectGameHTML(htmlTemplate())` at the **start** of its `render(app)`. That assignment replaces `document.body` with the game template, so every node from the initial page (including `#game-loader-screen`) is removed from the DOM.

The **other** removal path (explicit `remove()` in `attachEvents()`) does **not** run in observer mode: it lives in the `else` branch of `if (this?.game?.id)` (line 571). In observer mode we have `this.game.id`, so `attachEvents()` takes the `if` branch and calls `initializeGameQueue(this.game.id)`; the `else` (with the setTimeout and `#game-loader-screen` remove) is never executed.

### 1.4 Every location that removes #game-loader-screen

| # | Location | How it removes | When it runs |
|---|----------|----------------|--------------|
| 1 | `lib/templates/gametemplate.js` line 1704 | `document.body.innerHTML = template` in `injectGameHTML(template)` | When the game module’s `render(app)` runs and calls `injectGameHTML(htmlTemplate())`. Replaces the whole body; `#game-loader-screen` is removed as a side effect. This is the path taken in observer mode. |
| 2 | `lib/templates/gametemplate.js` lines 582–585 | `if (document.getElementById('game-loader-screen')) { ... setTimeout(() => { document.getElementById('game-loader-screen').remove(); }, 1500); }` inside `attachEvents(app)` | Only when `attachEvents(app)` runs **and** `this?.game?.id` is falsy (splash / browser lobby, no game loaded). Then `header.render()` runs and after 1500 ms the overlay is explicitly removed. **Not used in observer mode** (we have `game.id`). |

### 1.5 When and why each removal runs

- **Removal 1 (body replace):** Runs when the user is viewing a game and the game module’s `render(app)` is invoked (e.g. after navigation to the game, when that module has `browser_active == 1`). The game (e.g. chess) calls `injectGameHTML(htmlTemplate())` first thing in `render(app)`. Replacing `document.body` clears the initial page (including the loader) and installs the game UI. In observer mode this is the only removal that applies.
- **Removal 2 (setTimeout remove):** Runs only when the game module’s `attachEvents(app)` is called **without** a loaded game (`!this?.game?.id`). That is the splash/lobby case. The overlay is then explicitly removed 1500 ms after `header.render()` so the splash content is visible. In observer mode we always have a game, so this branch is not taken.

---

## 2. GameObserverLoader (#observer-sync-overlay)

### 2.1 Where it is constructed

- **File:** `lib/saito/ui/game-observer/game-observer-loader.js`
- **Construction:** `GameObserver` (GameObserverControls) constructs it in its constructor: `this.loader = new GameObserverLoader(app, game_mod, '');`
- **File:** `lib/saito/ui/game-observer/game-observer.js` (and `lib/templates/gametemplate.js` line 190: `this.observerControls = new GameObserverControls(app, this);`). So the loader instance is created when the **GameTemplate** (game module) is constructed, i.e. when the game module (e.g. chess) is instantiated.

### 2.2 Where render() is first called

- **First call in observer mode:** `lib/templates/gametemplate.js` line 1708, inside `injectGameHTML(template)`:
  - After `document.body.innerHTML = template` (line 1704),
  - Guard: `if (this.game?.player === 0)` then `this.observerControls.render()`.
- So the **first** `observerControls.render()` is inside `injectGameHTML()`, after the body has been replaced.
- `GameObserver.render()` (game-observer.js) then calls `this.loader.render()` when `this.is_loading === true` (observer defaults to `is_loading: true`), so **GameObserverLoader’s first render** happens in that same sequence, from `injectGameHTML()`.

### 2.3 What condition causes it to be removed

- The **loader** (#observer-sync-overlay) is removed by `GameObserver.render()` when **not** loading: `if (!this.is_loading)` branch removes any existing `#observer-sync-overlay` and renders the HUD instead (game-observer.js lines 116–121).
- So the condition for the loader to be removed (and HUD shown) is: `this.is_loading === false`, which is set in `GameObserver.finishLoading()`.

### 2.4 Does its render() depend on injectGameHTML() having run?

- **Yes.** In observer mode the **first** call to `observerControls.render()` (and thus the first `loader.render()`) is at the end of `injectGameHTML()` (line 1708). There is no earlier call that runs before `injectGameHTML()` in the normal observer flow. So the first time the loader is rendered, `injectGameHTML()` has already run and replaced `document.body`.

### 2.5 Can it render while #game-loader-screen is still present?

- **No**, not in the current observer code path. The only place that first invokes `observerControls.render()` in observer mode is inside `injectGameHTML()`, and that happens **after** `document.body.innerHTML = template` (line 1704). So the engine overlay is already gone (body replaced) before the observer overlay is rendered. There is no code path in the traced flow that calls `observerControls.render()` before `injectGameHTML()` has run when opening a game as observer.

---

## 3. Chronological lifecycle (observer mode only)

1. **Initial HTTP request**  
   User requests the game URL (e.g. `/chess/?observer=1` or with hash).

2. **HomePage HTML**  
   Server runs `GameTemplate.webServer()` and sends the HTML from `HomePage(app, mod_self, ...)` (`lib/templates/gametemplate-src/index.js`). The response body includes `#game-loader-screen` (and its contents) in `<body>`.

3. **GameTemplate initialization**  
   When the game module (e.g. chess) is instantiated, `GameTemplate` constructor runs and creates `this.observerControls = new GameObserverControls(app, this)` (gametemplate.js line 190). That constructs `GameObserver`, which in turn constructs `this.loader = new GameObserverLoader(app, game_mod, '')` and `this.hud = new GameObserverHUD(...)`. No DOM for the observer yet; the DOM still has the initial page including `#game-loader-screen`.

4. **injectGameHTML()**  
   When the game is the active module and its `render(app)` is called, the game (e.g. chess) first calls `await this.injectGameHTML(htmlTemplate())` (e.g. chess.js line 56). Inside `injectGameHTML()`:
   - Line 1703: `while (document.body.hasChildNodes()) { document.body.firstChild.remove(); }`
   - Line 1704: `document.body.innerHTML = template;`  
   **At this moment `#game-loader-screen` is removed** (entire previous body replaced).
   - Line 1707–1708: If `this.game?.player === 0`, `this.observerControls.render()` is called.  
   **At this moment GameObserverLoader is first rendered** (#observer-sync-overlay is appended to the new `document.body`).

5. **initializeGameQueue()**  
   Later, `this.app.modules.attachEvents()` runs (e.g. after `modules.render()`). For the game module with `browser_active == 1`, `GameTemplate.attachEvents(app)` runs (gametemplate.js line 570). Because `this?.game?.id` is set, the `else` branch (loader-screen remove) is skipped and `await this.initializeGameQueue(this.game.id)` is called (line 572). Inside `initializeGameQueue()` (gametemplate-queue.js), when `this.game.player == 0` (observer), lines 140–142 set `this.observerControls.is_loading = true` and call `this.observerControls.render()` again (loader remains visible), then start `observerDownloadNextMoves(...)`.

6. **GameObserver construction**  
   Already done in step 3 when the game module was constructed.

7. **GameObserver.render()**  
   First run in step 4 (from `injectGameHTML()`); second run from `initializeGameQueue()` in step 5. Both times `is_loading` is true, so the loader is shown.

8. **GameObserver.finishLoading()**  
   Called when sync/loading completion is detected (e.g. from `checkSyncStability()` in game-observer.js). It sets `this.is_loading = false` and calls `this.render()`. That render removes #observer-sync-overlay and renders the HUD; it does not affect `#game-loader-screen` (already gone).

---

## 4. Exact moments and overlap (code execution order)

- **Exact moment #game-loader-screen is removed:** When `document.body.innerHTML = template` runs in `injectGameHTML()` at `lib/templates/gametemplate.js` line 1704. The entire previous body (including the loader screen) is replaced by the game template.

- **Exact moment GameObserverLoader is first rendered:** Immediately after that, in the same `injectGameHTML()` run, when `this.observerControls.render()` runs at line 1708 (under `this.game?.player === 0`). That triggers `GameObserver.render()` and thus `this.loader.render()`.

- **Period where both exist:** There is **no** period in this flow where both exist. The engine overlay is removed by the body replace at line 1704; the observer overlay is added at line 1708. So the engine overlay is always removed **before** the observer overlay is rendered.

- **Removal order:** The engine overlay is removed **before** the observer overlay is rendered. Order: (1) remove engine overlay (body replace), (2) render observer overlay.

---

## 5. Reference: key call sites

| What | File:line |
|------|-----------|
| #game-loader-screen HTML | gametemplate-src/index.js (default export), lines 76–84 (styles), 148–167 (markup) |
| HomePage sent to client | gametemplate.js webServer(), line 1725 |
| Body replace (removes #game-loader-screen) | gametemplate.js injectGameHTML(), line 1704 |
| Explicit remove (#game-loader-screen) | gametemplate.js attachEvents(), lines 582–585 (observer path does not use this) |
| observerControls first render (observer) | gametemplate.js injectGameHTML(), line 1708 |
| observerControls.render() from queue | gametemplate-queue.js initializeGameQueue(), lines 140–142 |
| GameObserver.finishLoading() | game-observer.js line 149; invoked from checkSyncStability() (e.g. line 536) |
