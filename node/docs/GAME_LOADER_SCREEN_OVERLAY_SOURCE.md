# Full-Screen "Loading game..." Overlay – Source Trace

## Summary

The full-screen translucent overlay (map background, "loading game..." top-left, red Saito hex spinner center) is **not** injected by a client-side JS function. It is part of the **initial HTML document** sent by the server when the game URL is requested. The GameTemplate engine removes it either by replacing the whole body in `injectGameHTML()` or by an explicit `remove()` in `attachEvents()`.

---

## 1. Search Results

| Search term | Location |
|------------|----------|
| `"loading game"` | `lib/templates/gametemplate-src/index.js` line 151: `let msg = 'loading game...';` |
| `game-loader-screen` | `lib/templates/gametemplate-src/index.js` (definition), `lib/templates/gametemplate.js` (remove) |
| `saito-loader` | `.saito-loader` in CSS; `#saito-loader-container` in template; red hex from `url(/saito/img/saito-loader.svg)` in `web/saito/css-imports/saito-loader.css` |
| Full-screen overlay | `#game-loader-screen` + `.game-loader-backdrop` + `#saito-loader-container` in `gametemplate-src/index.js` |

---

## 2. Identified Sources

### A) File that defines the overlay HTML

**File:** `lib/templates/gametemplate-src/index.js`

- **Export:** Default export is a function `(app, mod, build_number, og_card, include_loader = true)` used as **HomePage**.
- **Overlay structure (lines 148–167):**
  - Root: `<div id="game-loader-screen">` (inline style for this id at lines 76–84: `position: fixed; width: 100vw; height: 100vh; background: black; z-index: 16; top: 0; left: 0`).
  - When `include_loader` is true:
    - `.game-loader-backdrop` with `style="background-image: url(/${mod.returnSlug()}/img/arcade/arcade.jpg);"` (map/arcade background).
    - `#saito-loader-container.saito-loader-container` with `<h1>loading game...</h1>` (or "Loading" if `returnWelcome()` is set).
  - The red hex spinner is the `.saito-loader` styling: `saito-loader.css` uses `background-image: url(/saito/img/saito-loader.svg)` on `.saito-loader::after`.

So the overlay’s **HTML and inline styles** are defined in this template; the **red hex** comes from the shared `.saito-loader` rules in `web/saito/css-imports/saito-loader.css`.

---

### B) File that “injects” it into the DOM

**No client-side injection.** The overlay is in the initial document.

- **Server:** When the game route is hit (e.g. `GET /chess/`), `GameTemplate.webServer()` in `lib/templates/gametemplate.js` calls `HomePage(app, mod_self, app.build_number, mod_self.social)` (line 1725) and sends that HTML in the HTTP response.
- **Browser:** The first paint is already the full document, which includes `<body>… <div id="game-loader-screen">…</div> …</body>`. So the overlay is in the DOM from initial parse; nothing later “injects” it.

---

### C) Function that produces that HTML (server-side)

**Function:** The default export of `lib/templates/gametemplate-src/index.js` (used as **HomePage**).

**Call site:** `lib/templates/gametemplate.js` inside `webServer()`:

```js
// lib/templates/gametemplate.js, ~line 1719
expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
  // ...
  let html = HomePage(app, mod_self, app.build_number, mod_self.social);
  // ...
  return res.send(html);
});
```

So the overlay is “injected” only in the sense that it is part of the HTML returned by this route.

---

### D) Lifecycle timing (when it appears and when it goes away)

1. **Appears:** When the user loads the game URL and the server sends the HomePage HTML. The overlay is in the initial body (no separate “init” or “initializeHTML” step that adds it).
2. **Removed in two ways:**
   - **Path 1 – Entering a game:** When the game module calls `injectGameHTML(template)`, `document.body.innerHTML = template` (line 1704) **replaces the entire body**. That removes `#game-loader-screen` (and everything else from HomePage) without an explicit `remove()` call.
   - **Path 2 – Staying on splash (no game loaded):** When `GameTemplate.attachEvents(app)` runs with **no** `this.game?.id`, it checks for `#game-loader-screen`, then after `header.render()` runs a **setTimeout(1500 ms)** and then calls `document.getElementById('game-loader-screen').remove()`.

So the overlay is present from initial load until either body replacement in `injectGameHTML()` or the explicit remove in `attachEvents()` after 1.5 s.

---

## 3. Answers to Specific Questions

- **Is this overlay injected inside `GameTemplate.initializeHTML()`?**  
  **No.** `initializeHTML()` does not create or inject the overlay. The overlay is in the initial HTML from HomePage.

- **Is it part of `injectGameHTML()`?**  
  **No.** `injectGameHTML()` does not add the overlay; it **replaces** `document.body`, which removes the overlay (and the rest of the initial page).

- **Is it coming from the Arcade module?**  
  **No.** Arcade has no references to `game-loader-screen` or this overlay. It comes from the **GameTemplate** HomePage (gametemplate-src/index.js).

- **Is it part of a generic Saito loader component?**  
  **Partially.** The **red hex** is the generic `.saito-loader` (and `saito-loader.svg`) from `web/saito/css-imports/saito-loader.css`. The **full-screen wrapper** (`#game-loader-screen`, “loading game...” text, map background) is specific to the game template and is defined only in `lib/templates/gametemplate-src/index.js`.

---

## 4. DOM identifiers

| Element | Type | Purpose |
|--------|------|--------|
| `#game-loader-screen` | id | Full-screen wrapper (fixed, full viewport, z-index 16, black background). |
| `.game-loader-backdrop` | class | Map/arcade background image. |
| `#saito-loader-container` | id | Container for the “loading game...” text (and, in this template, the spinner). |
| `.saito-loader` | class | Red hex spinner (uses `saito-loader.svg` in CSS). |

---

## 5. GameObserverLoader vs engine overlay

- **GameObserverLoader** (`#observer-sync-overlay`) is added by **GameObserver** when `this.observerControls.render()` is called (e.g. at the end of `injectGameHTML()` when `this.game?.player === 0`). So it is appended to the **current** body **after** `document.body.innerHTML = template` has run.
- So in the **normal “load into game” flow:**  
  1. `injectGameHTML(template)` runs → `document.body.innerHTML = template` → **engine overlay `#game-loader-screen` is removed** (body replaced).  
  2. Then `this.observerControls.render()` runs → **GameObserverLoader is appended** to the new body.  
  So the engine overlay is **gone** before the observer overlay is added; they are not both in the DOM at the same time in this path.

- **GameObserverLoader is not “under” the engine overlay** in that flow, because the engine overlay no longer exists.

- **Both can be in the DOM only** if:  
  - The page is still showing the **initial** HomePage body (with `#game-loader-screen`), and  
  - Some code path calls `observerControls.render()` **before** `injectGameHTML()` runs (e.g. observer logic running on the splash page).  
  Then the engine overlay (`#game-loader-screen`, z-index 16) can still be present when the observer overlay is added; stacking would depend on the observer overlay’s z-index.

- **Removal is independent:**  
  - Engine overlay: removed by **body replace** in `injectGameHTML()` or by **explicit** `document.getElementById('game-loader-screen').remove()` in `attachEvents()` after 1.5 s.  
  - Observer overlay: removed by GameObserver logic (loader/hud components).  
  So they are not removed by the same call, but in the usual “load game” path the engine overlay is removed (by body replace) **before** the observer overlay is created.

---

## 6. Exact references (quick copy-paste)

| What | Where |
|------|--------|
| **HTML definition** | `lib/templates/gametemplate-src/index.js` lines 76–84 (styles), 148–167 (markup). |
| **“Injection”** | Server sends HTML from `HomePage()` in `lib/templates/gametemplate.js` `webServer()` at line 1725 (`let html = HomePage(...)`; `res.send(html)`). |
| **Explicit remove()** | `lib/templates/gametemplate.js` line 585: `document.getElementById('game-loader-screen').remove()` inside `attachEvents()`, inside a `setTimeout(..., 1500)`. |
| **Implicit removal** | `lib/templates/gametemplate.js` line 1704: `document.body.innerHTML = template` in `injectGameHTML()` (replaces body, so #game-loader-screen is removed). |
| **Lifecycle vs observer** | `injectGameHTML()` runs first (body replace → engine overlay gone), then `this.observerControls.render()` (line 1708) runs, so observer overlay is added after the engine overlay is already removed. |

---

## 7. Red hex spinner

- **Visual:** `web/saito/css-imports/saito-loader.css` (`.saito-loader`, `.saito-loader::after`).
- **Asset:** `url(/saito/img/saito-loader.svg)` (referenced in that CSS and in `web/saito/lib/pace/center-atom.css`).
