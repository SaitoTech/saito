# Render-Order Risks Before Patching — Forcing observerControls.render() in GameTemplate.render()

**No code changes. No console logs. No patches. Static call-order tracing only.**

**Goal:** Determine whether forcing `observerControls.render()` inside `GameTemplate.render()` introduces double-render, DOM wipe after observer render, early body replacement, event duplication, or incorrect render phase ordering.

---

## SECTION 1 — Exact Render Order

### 1. Does the game module call injectGameHTML() BEFORE super.render()?

**Yes.** Traced for Twilight (and all other game modules that use injectGameHTML):

- **Twilight** (twilight.js:221–234): `if (this.initialize_game_run) return;` → `if (this.game_html_injected != 1) { await this.injectGameHTML(htmlTemplate()); ... }` → `await super.render(app);`
- **Chess** (chess.js:52–63): guard → `await this.injectGameHTML(htmlTemplate());` → `await super.render(app);`
- **Imperium** (imperium.js:12043–12051): guard → `await this.injectGameHTML(htmlTemplate());` → `await super.render(app);`
- **Paths** (paths.js:92–99): guard → `injectGameHTML` (when not yet injected) → `await super.render(app);`
- **Poker** (poker.js:181–232): guard → `await this.injectGameHTML(htmlTemplate());` → menu setup → `await super.render(app);`
- **Quake3, Wuziqi, Wordblocks, Steamed, Settlers, Spider, Solitrio, Shogun, Realms, Mahjong, Pandemic, Blackjack, Beleaguered, Bazaar, His** — same pattern: injectGameHTML (or equivalent) then `super.render(app)`.

So in every traced game, **injectGameHTML() is called BEFORE super.render().**

### 2. Does any game call injectGameHTML() AFTER super.render()?

**No.** No game module in the traced set calls `injectGameHTML()` after `super.render()`. **Midnight** (midnight.js:42–61) does not call `super.render(app)` in the usual place; it calls `super.initializeHTML(app)` after `injectGameHTML()`. So midnight has a different flow (no GameTemplate.render() in the normal sense) but still does not call injectGameHTML after super.render.

### 3. Does any code path replace document.body.innerHTML AFTER GameTemplate.initializeHTML()?

**No, in the typical observer reload lifecycle.**

- **document.body.innerHTML = template** appears in:
  - **gametemplate.js:1691** — inside `injectGameHTML()`. `injectGameHTML()` is only invoked from game modules **before** `super.render()` (hence before `GameTemplate.render()` and before `initializeHTML()`). So this replacement runs **before** `initializeHTML()`.
  - **tutorial02** (lib/main.js:10) — unrelated to game observer lifecycle.
- No other code in the traced path runs after `initializeHTML()` in the same render cycle and sets `document.body.innerHTML` or wipes the game container.

So **no code path replaces document.body.innerHTML after GameTemplate.initializeHTML()** in the typical observer reload flow.

### Exact order (e.g. Twilight)

```
game.render()
  → if (this.initialize_game_run) return;   // if 1, we never reach below
  → injectGameHTML()                       // body cleared, body.innerHTML = template
  → super.render(app)                      // GameTemplate.render()
       → super.render(app)                 // ModTemplate
       → header.render()
       → initializeHTML()
            → (when game.player == 0) observerControls.render()
  → [render returns]
attachEvents()                             // modules.attachEvents() after modules.render()
```

So:

**game.render() → injectGameHTML() → super.render() → initializeHTML() → observerControls.render() (when player == 0). attachEvents() runs after the full render(), at modules level.**

---

## SECTION 2 — Early Return Guards

### 1. Game modules that implement `if (this.initialize_game_run) { return; }` (or equivalent)

- **twilight.js:225–227** — `if (this.initialize_game_run) { return; }`
- **twilight-start.js:225** — same
- **quake3.js:391** — `if (this.initialize_game_run) { ... }`
- **paths.js:92** — `if (this.browser_active == 0 || this.initialize_game_run) { return; }`
- **paths-init.js:92** — same
- **wuziqi.js:47** — `if (this.initialize_game_run) { ... }`
- **wordblocks.js:56** — same
- **steamed.js:46** — same
- **shogun.js:108** — `if (this.browser_active == 0 || this.initialize_game_run) { return; }`
- **settlers.js:312** — `if (this.initialize_game_run) { ... }`
- **poker.js:181** — `if (this.initialize_game_run) { return; }`
- **midnight.js:46** — `if (this.initialize_game_run) { return; }`
- **imperium-initialize.js:8** — `if (!this.browser_active || this.initialize_game_run) { return; }`
- **imperium.js:12043** — same
- **his.js (his-start.js:6, his.js:3287)** — `if (this.initialize_game_run) { ... }`
- **chess.js:52** — `if (this.initialize_game_run) { return; }`
- **blackjack.js / blackjack-init.js:42** — same
- **bazaar.js:43** — same

### 2. Guard executes BEFORE or AFTER super.render()?

**Before.** In every listed module the guard is at the top of `render()`, before any `injectGameHTML()` and before `super.render()`. So the guard **always** runs before `super.render()`.

### 3. Does the guard prevent initializeHTML() from running?

**Yes.** When the guard returns, the game module exits `render()` without calling `super.render()`. So `GameTemplate.render()` is never entered and **initializeHTML() is never run** on that cycle.

---

## SECTION 3 — Possible Double Observer Render

### 1. Every call site for observerControls.render()

- **lib/templates/gametemplate.js:476** — inside `initializeHTML()`, in the early-return block when `this.initialize_game_run == 1` and observer mode: `if (this.observerControls) this.observerControls.render();`
- **lib/templates/gametemplate.js:527** — inside `initializeHTML()`, in the normal path when `this.game.player == 0`: `this.observerControls.render();`
- **mods/poker/lib/poker-ui.js:58** — inside `refreshPlayerboxes()` when `this.game.player == 0`: `this.observerControls.render();` (and `observerControls.remove()` when player != 0).

No other call sites found in the codebase (excluding docs and bundle).

### 2. Can any lifecycle call observerControls.render() twice in one render cycle?

**Yes.**

- **Poker:** After `super.render(app)` (which runs `GameTemplate.render()` → `initializeHTML()` → `observerControls.render()` when player == 0), poker.js:237 calls `this.refreshPlayerboxes()`, which calls `this.observerControls.render()` again (poker-ui.js:58). So in a single game render cycle for Poker with player == 0, **observerControls.render() is already invoked twice** (once in initializeHTML(), once in refreshPlayerboxes()).
- **If we add observerControls.render() in GameTemplate.render():** Then in the same cycle we would have: (1) new call at start of `GameTemplate.render()`, (2) existing call in `initializeHTML()` when player == 0. So **two calls** from GameTemplate alone. For Poker, a third call from `refreshPlayerboxes()` would follow. So **double (or triple for Poker) render in one cycle** would occur.

### 3. Does GameTemplate.initializeHTML() already guarantee observer render when player == 0?

**Yes.** When `this.game.player == 0`, the block at gametemplate.js:525–532 runs and calls `this.observerControls.render()`. The early-return path (initialize_game_run == 1) at 472–478 also calls `observerControls.render()` when in observer mode. So **initializeHTML() already guarantees** that when the observer path is active, observerControls.render() is invoked (once per initializeHTML() run).

---

## SECTION 4 — DOM Replacement After Observer Render

Searched for:

- **document.body.innerHTML =** — Only in injectGameHTML (before super.render) and tutorial02; none after initializeHTML() in observer lifecycle.
- **replaceElementBySelector / replaceElementById / addElementToSelectorOrDom** — Used in many modules (arcade, chat, header, game-observer itself, etc.). None of these are invoked from **GameTemplate.render()** after line 399 (after `initializeHTML()`). The code after `initializeHTML(app)` in GameTemplate.render() (lines 400–411) only: sets game_move_notification, optionally insertCryptoLogo, optionally fetchRecentMoves. No DOM replacement there.

So **no** invocation of body replacement or replaceElementBySelector/replaceElementById/addElementToSelectorOrDom was found that runs **after** initializeHTML() in the **same** typical observer reload lifecycle. The only full body replacement is in injectGameHTML(), which runs **before** super.render() and thus before the overlay is rendered.

---

## SECTION 5 — Event Binding Duplication Risk

### 1. GameObserver.render() and attachEvents()

- **game-observer.js:131** — At the end of `render()`, `this.attachEvents()` is called synchronously.
- **attachEvents()** (lines 170–221) assigns **onclick** and uses **addEventListener** on elements by id: `observer-back`, `observer-play`, `observer-forward`, `game-observer-state-slider`, and calls `makeDraggable('game-observer-hud')` once (guarded by `_draggable_initialized`).

### 2. Does attachEvents() rebind without removing old handlers?

**It rebinds without explicitly removing old handlers.** It sets `element.onclick = ...` and `element.addEventListener('input', ...)`. It does not remove previous listeners or clear onclick before reassigning.

### 3. Does DOM replacement guarantee previous nodes are destroyed?

**When the overlay is updated by replaceElementById, yes.** The second call to `observerControls.render()` (e.g. from initializeHTML()) does `replaceElementById(html, 'observer-sync-overlay')`, which sets `obj.outerHTML = html`. That **replaces** the node; the old node is removed from the DOM, so any handlers attached to it are no longer reachable. So **after a replace, there are no old nodes**, and the next attachEvents() binds only to the new nodes. So we do **not** get duplicate handlers from the same logical overlay element when it is replaced.

### 4. Could forcing render earlier create duplicate event handlers?

**Not from the overlay element itself**, because the second render (from initializeHTML()) replaces the overlay node by id, so the first set of handlers is discarded with the old node. **The only duplication risk** would be if we **appended** a second overlay (e.g. two elements with the same id, or two overlays) and bound to both. With the current logic, the second render uses replaceElementById when the element exists, so we end up with one overlay and one set of bindings. So **forcing render earlier (before initializeHTML) would not, by structure, create duplicate handlers on the same overlay**, but it would cause **two calls to render() and two calls to attachEvents()** in one cycle (redundant work; no structural duplication of handlers on the same DOM node).

---

## SECTION 6 — Conclusion

**B) It risks double render.**

**Proof:**

1. **Double render:** `observerControls.render()` is already guaranteed by `initializeHTML()` when `game.player == 0` (and in the early-return observer branch). Adding a call in `GameTemplate.render()` would cause **at least two** invocations of `observerControls.render()` in one render cycle (one in render(), one in initializeHTML()). For Poker, `refreshPlayerboxes()` already calls `observerControls.render()` after `super.render()`, so Poker already has two calls per cycle; adding one in GameTemplate.render() would make three for Poker.
2. **DOM wipe after injection:** Not introduced. No DOM replacement runs after initializeHTML() in the traced lifecycle.
3. **Early body replacement:** Not introduced. injectGameHTML() runs before super.render(); adding observer render in GameTemplate.render() would run after injectGameHTML().
4. **Event duplication:** Not introduced. The second render replaces the overlay by id, so old nodes (and their handlers) are removed; attachEvents() then binds only to the new node.
5. **Lifecycle inversion:** Adding observer render at the start of GameTemplate.render() would run it before header.render() and before initializeHTML(). The overlay would still be present after initializeHTML() (no wipe). So no structural inversion that removes the overlay; only a change in **ordering** (observer UI rendered earlier in the same cycle).

**Summary:** Forcing `observerControls.render()` inside `GameTemplate.render()` is **not** safe with respect to double render: it would cause observerControls.render() to run twice in one cycle (and three times for Poker if the existing refreshPlayerboxes() call remains). Other risks (DOM wipe after observer render, early body replacement, event duplication) are not introduced by this change. The only structural risk identified is **double (or more) render**.

---

**End of report. No recommendations. No patches. Static structural confirmation only.**
