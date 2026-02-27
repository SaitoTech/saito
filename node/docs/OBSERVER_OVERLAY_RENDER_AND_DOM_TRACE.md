# Observer Overlay Render and DOM Replacement — Diagnostic Trace

**No engine flow changes. No queue changes. No reload changes. No speculation. Static tracing and minimal structural inspection only.**

**Scope:** Second instance only (post-reload). Why loading overlay is not visible given: observer branch runs, observerDownloadNextMoves() called, archive_connected === false, is_loading === true, initializeHTML() runs.

---

## SECTION 1 — Confirm Overlay Render Invocation

### 1. When observerControls.render() is called in GameTemplate.initializeHTML()

**File:** `lib/templates/gametemplate.js`

**Early returns before any observer render:**

- **Lines 468–470:** `if (this.browser_active == 0) { return; }` — if browser_active is 0, we return; no observerControls.render().
- **Lines 471–478:** `if (this.initialize_game_run == 1) { ... if (this.game?.observer_mode === true || this.game?.player == 0) { if (this.observerControls) this.observerControls.render(); } return 0; }` — when initialize_game_run is 1 we **do** call observerControls.render() (observer path), then return. So we do **not** skip the observer render in that branch; we call it then exit.

**Normal path (no early return):**

- Execution continues past the two checks above only when **browser_active != 0** and **initialize_game_run != 1**.
- **Lines 519–526:** `if (this.game.player == 0) { this.observerControls.render(); document.body.classList.add('observer-mode'); ... }`

So:

- When **this.initialize_game_run == 0** and **this.game.player == 0**, the normal path runs and **observerControls.render()** is called at line 520 (and is not preceded by any other return in that path).
- When **this.initialize_game_run == 1** and observer mode (observer_mode or player == 0), the early-return block at 472–478 still calls **observerControls.render()** before returning.

**Conclusion:** For the second instance, when initializeHTML() runs we have **initialize_game_run === 0** (attachEvents has not run yet). So we do **not** hit the early return at 471; we continue and hit **if (this.game.player == 0)** at 519, which is true, so **observerControls.render()** is invoked at line 520.

### 2. Additional early returns before observerControls.render()

- Between the start of initializeHTML() and the **if (this.game.player == 0)** block (lines 519–526), the only returns are:
  - **browser_active == 0** (line 469).
  - **initialize_game_run == 1** (line 478, after calling observerControls.render() in the observer branch).
- There are no other returns between line 479 and line 519. So once we pass the two guards, we reach the **game.player == 0** block and call **observerControls.render()** (unless we throw earlier in the try block or in the hash/clock logic; no return in those paths).

**Exact call order (second instance):**

1. **render(app)** — game mod (e.g. Twilight) render().
2. **initializeHTML(app)** — called from GameTemplate.render() at line 399, synchronously after super.render() and header.render().
3. **observerControls.render()** — called from initializeHTML() at line 520 when **this.game.player == 0**.

So: **render() → initializeHTML() → observerControls.render()**.

---

## SECTION 2 — Overlay Injection Target

**File:** `lib/saito/ui/game-observer/game-observer.js` (render(), lines 110–127).

### 1. DOM selector used for insertion

- **When overlay already in DOM:** `document.getElementById('observer-sync-overlay')` (line 114). Then **replaceElementById(html, 'observer-sync-overlay')**.
- **When overlay not in DOM:** no selector for insertion; **addElementToDom(html)** is used (line 118) with no second argument.

So the **first** time the loading overlay is shown (no existing #observer-sync-overlay), the code uses **addElementToDom(html)** only — no ID-based target.

### 2. Insertion method

- **replaceElementById(html, id):** (browser.ts:797–806) `let obj = document.getElementById(id); if (obj) obj.outerHTML = html;` — replaces the element’s outer HTML. Used when **syncOverlay** exists.
- **addElementToDom(html, elemWhere = null):** (browser.ts:764–772) when **elemWhere** is null, creates a div, **document.body.appendChild(el)**, then **el.outerHTML = html** (so the div is replaced by the parsed HTML). So the overlay markup is appended as a **direct child of document.body**.

So the overlay is either **replaced in place** by ID or **appended to body** via **addElementToDom**.

### 3. Container

- When **syncOverlay** does not exist (first paint): the overlay is appended to **document.body**.
- It does **not** depend on a pre-existing game container; **addElementToDom(html)** with null appends to body, which always exists.

**Summary:**

- **Selector:** None for first insert; **addElementToDom(html)** appends to **body**. For updates, **replaceElementById(html, 'observer-sync-overlay')**.
- **Replacement:** First time: no replacement; new content appended. Later: replace by ID when element exists.
- **Pre-existence:** No; first insertion does not require any container except **document.body**.

---

## SECTION 3 — DOM Wipe After Overlay Render

**Order of execution in the same render cycle (second instance):**

1. **modules.render()** runs the active (game) mod’s **render(app)**.
2. Game mod (e.g. Twilight) **render():**
   - Often **injectGameHTML(htmlTemplate())** first (e.g. Twilight 229–232): clears body and sets **document.body.innerHTML = template** (gametemplate.js:1687–1691). So body is replaced **before** super.render().
   - Then **await super.render(app)** → GameTemplate.render() → **super.render(app)** (ModTemplate), **header.render()**, **initializeHTML(app)**.
3. **initializeHTML()** runs and calls **observerControls.render()**, which does **addElementToDom(html)** and appends the overlay to **body** (after the game template is already in body).
4. **render()** then returns; no further code in GameTemplate.render() or in the game mod’s render() (in the traced path) replaces body or the overlay.

**Searches:**

- **super.render()** runs **before** initializeHTML() (gametemplate.js:392, 399). So it does not run after the overlay is added.
- **replaceElementById** / **addElementToDom** after initializeHTML(): none found in the remainder of initializeHTML() (lines 527–550: gameprefs, attachStyleSheets). No full container re-render or template re-injection after the observer block.
- **injectGameHTML:** Called only when **!this.game_template_injected** (gametemplate.js:1675). At the end it sets **this.game_template_injected = 1** (1694). So the body wipe and **body.innerHTML = template** happen at most once per instance. On the second instance, the first (and only) call to injectGameHTML happens **before** super.render() and thus **before** initializeHTML() and observerControls.render(). So the overlay is added **after** the game template has been set; injectGameHTML is not run again in that lifecycle to wipe it.

**Conclusion:** In the traced post-reload lifecycle, no code path **after** initializeHTML() / observerControls.render() was found that:

- Replaces the game container DOM,
- Replaces the observer container,
- Sets innerHTML on the game wrapper in a way that removes the overlay, or
- Triggers a MutationObserver that removes the injected overlay.

The only full body replacement is **injectGameHTML**, and it runs **before** the overlay is added.

---

## SECTION 4 — initializeHTML() Execution Count (Post-Reload)

**Who calls initializeHTML():**

- **GameTemplate.render()** calls **this.initializeHTML(app)** once at line 399 (synchronously, no await).
- **modules.render()** (modules.ts:541–548) runs **mod.render(app)** only for mods with **browser_active == 1**, and the game mod is rendered once per **modules.render()** invocation.
- **modules.render()** is invoked once after init (modules.ts:446) and possibly again on other events (e.g. browser.ts:677); for the **post-reload** sequence we only trace the single **modules.render()** that follows **modules.initialize()** and precedes **modules.attachEvents()**.

So in the **post-reload** path we traced:

- **initializeHTML()** is called **once** (from the single **render()** that runs for the active game mod).
- That single call is the one that runs the **game.player == 0** block and calls **observerControls.render()** (overlay rendered).
- No second call to initializeHTML() was identified in that lifecycle that would “replace” the overlay; the early-return path (initialize_game_run == 1) also calls observerControls.render() and then returns, so it does not remove the overlay.

---

## SECTION 5 — Final Determination

**From the trace:**

- **observerControls.render()** is invoked (Section 1) when **initialize_game_run == 0** and **game.player == 0** (normal path) or when **initialize_game_run == 1** and observer mode (early-return path).
- The loading overlay is injected via **addElementToDom(html)** into **document.body** when **#observer-sync-overlay** does not exist (Section 2); no dependency on a pre-existing game container.
- No DOM wipe or replacement **after** the overlay is added was found in the traced path (Section 3); **injectGameHTML** runs before the overlay and runs only once per instance.
- **initializeHTML()** runs once in the traced post-reload lifecycle and is the call that triggers the overlay (Section 4).

So:

- **A)** observerControls.render() is never invoked — **contradicted**: it is invoked in initializeHTML() when player == 0 (or in the early-return observer block).
- **B)** Invoked but container does not exist — **contradicted**: insertion is into **document.body**, which exists.
- **C)** Renders correctly but overwritten by a later DOM replacement — **not found**: no later replacement of body or the overlay was found in the traced order (injectGameHTML runs before the overlay).
- **D)** Renders but CSS prevents visibility — **not determined** by this trace (no CSS or computed style inspection). Possible but not shown by flow.
- **E)** Renders but immediately removed by render() re-entry — **not found**: no second render() in the traced path that would remove or replace the overlay; injectGameHTML is guarded by game_template_injected and does not run again after the overlay is added.
- **F)** Other — **applicable** when the structural trace does not show removal or missing invocation.

**Determination: F) Other — structural cause not in the traced path.**

- The trace shows that **observerControls.render()** is invoked, the overlay is appended to **body**, and no subsequent DOM replacement in the traced post-reload sequence removes it.
- So the reason the loading overlay is “not visible” is **not** explained by: (A) render never called, (B) missing container, or (C) a later DOM wipe in the path we traced.
- It **could** be explained by:
  - **CSS** (e.g. display, visibility, z-index, opacity) — not traced here.
  - **Game-specific render()** logic that returns before **super.render()** (e.g. **if (this.initialize_game_run) return;** in Twilight) in a scenario where **initialize_game_run** is already 1 when **render()** runs — in the **traced** order (render before attachEvents), **initialize_game_run** is 0, so this does not apply in the single render we traced.
  - A **different** call order or **additional** render/attachEvents sequence (e.g. from another event or module) not covered by this trace.
  - **replaceElementById** behavior: when **syncOverlay** exists, we set **obj.outerHTML = html**. The template returns a string that includes the root element with id **observer-sync-overlay**. So we replace that node’s outer HTML. We did not trace whether the game template already contains an element with id **observer-sync-overlay**; if it did, we would replace it instead of appending. That would not remove the overlay, only replace its content.

**Summary:** From code flow alone, the overlay **is** invoked and **is** inserted into the DOM with no identified later removal in the traced path. So the cause of it not being visible is **not** a missing call or a DOM wipe in that path; it lies elsewhere (e.g. CSS or a different/game-specific execution order).

---

**End of report. No fixes. No guesses. No logging. Deterministic render-order analysis only.**
