# Short GID Assumptions, Dual-ID Logic, and hash → vars_in_url Rename

**Scope:** Game engine and Arcade; no edits applied. Report only.

---

## PART 1 — Identify the exact short-ID assumptions

### 1. GameTemplate.initialize()

**File:** `lib/templates/gametemplate.js`  
**Location:** Inside `async initialize(app)`, in the “Option B: observer stub bootstrap” block when `!this.loadGame()`.

**Current implementation (quoted):**

```javascript
if (!observerStubGameId && typeof window !== 'undefined' && window.location?.hash) {
  const hash = this.app.browser.parseHash(window.location.hash);
  if (hash?.gid && this.app.options?.games?.length > 0) {
    for (let i = 0; i < this.app.options.games.length; i++) {
      if (this.name === this.app.options.games[i].module &&
          this.app.crypto.hash(this.app.options.games[i].id).slice(-6) === hash.gid) {
        observerStubGameId = this.app.options.games[i].id;
        break;
      }
    }
  }
}
```

- **Comparison logic:**  
  `this.app.crypto.hash(this.app.options.games[i].id).slice(-6) === hash.gid`
- **Assumption:**  
  **hash.gid is the short id.**  
  The code compares the 6-character suffix of the stored game’s id to `hash.gid`. It does not treat `hash.gid` as a full game id.
- **How short_id is derived:**  
  `short_id = this.app.crypto.hash(this.app.options.games[i].id).slice(-6)` (per candidate game in `app.options.games`).  
  The URL is assumed to hold the same kind of value (short id), so the match is short-vs-short.

---

### 2. GameTemplate.loadGame()

**File:** `lib/templates/gametemplate-src/gametemplate-game.js`  
**Location:** Start of `loadGame(game_id = null)`, when `game_id == null`.

**Current implementation (quoted):**

```javascript
if (game_id == null) {
  let hash = this.app.browser.parseHash(window.location.hash);
  if (hash?.gid) {
    if (this.app.options?.games?.length > 0) {
      for (let i = 0; i < this.app.options.games.length; i++) {
        if (this.name == this.app.options.games[i].module) {
          if (this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == hash.gid) {
            game_id = this.app.options.games[i].id;
            break;
          }
        }
      }
    }
  }
}
```

- **Comparison logic:**  
  `this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == hash.gid`
- **Assumption:**  
  **hash.gid is the short id.**  
  Same as in `initialize()`: match is between the 6-char suffix of each stored game id and `hash.gid`. No full-id comparison.
- **How short_id is derived:**  
  `short_id = this.app.crypto.hash(this.app.options.games[i].id).slice(-6)` for each candidate in `app.options.games`.

---

### 3. GameTemplate.gameBrowserActive()

**File:** `lib/templates/gametemplate.js`  
**Location:** Method `gameBrowserActive(game_id = null)`.

**Current implementation (quoted):**

```javascript
gameBrowserActive(game_id = null) {
  if (this.browser_active) {
    if (!game_id) {
      game_id = this.game.id;
    }
    try {
      let short_game_id = this.app.crypto.hash(game_id).slice(-6);
      let gid = window.location.hash.split('&')[0].substring(5);
      const result = gid === short_game_id;
      // ... logging ...
      if (result) {
        return true;
      }
    } catch (err) {
      // ...
    }
  }
  return false;
}
```

- **Comparison logic:**  
  `gid === short_game_id`, where:
  - `gid` = value after `#gid=` in the URL (first segment, from index 5 of the first `&`-split part).
  - `short_game_id = this.app.crypto.hash(game_id).slice(-6)`.
- **Assumption:**  
  **The URL’s #gid value is the short id.**  
  The code does not use a parsed “hash” variable; it derives `gid` directly from `window.location.hash` and compares it to the 6-char suffix of the current (or passed) game id. So the assumption is that the in-URL gid is the same format as `short_game_id` (short).
- **How short_id is derived:**  
  `short_game_id = this.app.crypto.hash(game_id).slice(-6)` (from the game id in memory).  
  The other side of the comparison is “whatever is in the URL” (`gid`), which is currently assumed to be that short form.

---

## PART 2 — Proposed dual-ID logic (no implementation)

Goal: treat the URL parameter as matching if it equals **either** the short id **or** the full game id. No removal of short-ID support; no change to archive or routing logic.

---

### 1. GameTemplate.initialize()

- **Current:**  
  `this.app.crypto.hash(this.app.options.games[i].id).slice(-6) === hash.gid`  
  and only when `hash?.gid` and matching module.
- **Proposed:**  
  Resolve `vars_in_url` from URL (same source as current `hash`). Then accept a game when its id matches by **short or full**:

  - **Exact comparison expression for the match (dual-ID):**  
    `(this.app.crypto.hash(this.app.options.games[i].id).slice(-6) === vars_in_url.gid || this.app.options.games[i].id === vars_in_url.gid)`

  So the condition inside the loop becomes: same module check **and** this dual-ID match. No other logic changed (e.g. `observerStubGameId` assignment, loop break).

---

### 2. GameTemplate.loadGame()

- **Current:**  
  `this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == hash.gid`  
  when `hash?.gid` and same module.
- **Proposed:**  
  Use a variable holding parsed URL params (e.g. `vars_in_url`) and allow match by short or full id:

  - **Exact comparison expression for the match (dual-ID):**  
    `(this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == vars_in_url.gid || this.app.options.games[i].id === vars_in_url.gid)`

  Same scope: only the condition that sets `game_id` from `this.app.options.games[i].id`; no other branches or archive/routing logic changed.

---

### 3. GameTemplate.gameBrowserActive()

- **Current:**  
  `gid === short_game_id` where `gid` is taken from `window.location.hash` and `short_game_id = this.app.crypto.hash(game_id).slice(-6)`.
- **Proposed:**  
  Keep deriving the value from the URL (can be named `gid_from_url` or `vars_in_url.gid` if we parse). Then consider the browser “active” for this game when the URL gid is either the short or the full id:

  - **Exact comparison expression for the result (dual-ID):**  
    `(gid_from_url === short_game_id || gid_from_url === game_id)`  
  where:
  - `short_game_id = this.app.crypto.hash(game_id).slice(-6)`
  - `game_id` is the full game id (already in scope: argument or `this.game.id`).
  - `gid_from_url` = current URL’s gid (e.g. `window.location.hash.split('&')[0].substring(5)` or the `gid` property of the object from `parseHash(window.location.hash)`).

  So:  
  `const result = (gid_from_url === short_game_id || gid_from_url === game_id);`  
  and return `true` when `result` is true. No change to other logic.

---

## PART 3 — Audit for other short-ID canonical assumptions

Areas searched: `gametemplate-*.js`, `arcade.js`, routing/navigation that writes or reads `#gid`, and uses of `app.crypto.hash(...).slice(-6)`.

Classification:

- **Purely presentational** — safe to leave as-is (e.g. labels, display).
- **URL generation only** — producing links or query/hash strings; safe to leave unless we later want to emit full id.
- **Identity comparison** — treating short id as the canonical way to identify a game (match/lookup); should be flagged for possible dual-ID support.

Only **identity comparison** is flagged as “must support dual-ID logic” in the table below.

| File | Function / location | Use of short GID | Classification |
|------|----------------------|------------------|----------------|
| **lib/templates/gametemplate.js** | `initialize()` | Parse URL hash; match `hash.gid` to `app.crypto.hash(game.id).slice(-6)` to resolve observer stub game | **Identity comparison** (already in Part 1) |
| **lib/templates/gametemplate.js** | `initializeHTML()` | `short_game_id = this.app.crypto.hash(this.game.id).slice(-6)`; set `window.location.hash` to `#gid=${short_game_id}&step=...` | URL generation only (writes #gid) |
| **lib/templates/gametemplate.js** | `gameBrowserActive()` | Compare URL gid to `this.app.crypto.hash(game_id).slice(-6)` | **Identity comparison** (already in Part 1) |
| **lib/templates/gametemplate-src/gametemplate-game.js** | `loadGame(game_id = null)` | When `game_id == null`, parse hash and match `hash.gid` to `app.crypto.hash(games[i].id).slice(-6)` | **Identity comparison** (already in Part 1) |
| **lib/templates/gametemplate-src/gametemplate-game.js** | `sendGameoverTransaction()` | Build link: `game_id=${this.app.crypto.hash(this.game.id).slice(-6)}` in `link` URL | URL generation only |
| **lib/templates/gametemplate-src/gametemplate-moves.js** | `addNextMove()` | `this.app.browser.modifyHash(window.location.hash, { step: ... })` — updates step in existing hash | URL generation only (modify hash string) |
| **mods/arcade/arcade.js** | `loadGameInviteById(game_id_short, ...)` | Filter: `this.app.crypto.hash(r.tx.signature).slice(-6) == game_id_short` to find invite by id | **Identity comparison** |
| **mods/arcade/arcade.js** | `webServer()` (route handler) | `query_params?.game_id` as `id`; filter games with `arcade_self.app.crypto.hash(r.tx.signature).slice(-6) === id` | **Identity comparison** |
| **mods/arcade/arcade.js** | `showShareLink(game_sig, ...)` | `data.game_id = this.app.crypto.hash(game_sig).slice(-6)` for share/invite payload | URL / presentational (share link data) |
| **mods/arcade/arcade.js** | `observeGame()` | `navigateWindow(\`/${slug}?observer=1#gid=${game_id}\`)` — already uses full `game_id` in hash | URL generation only |
| **mods/arcade/lib/ui/overlays/lounge.js** | (button handler) | `navigateWindow(\`/${slug}/#gid=${this.app.crypto.hash(gameId).slice(-6)}\`)` for “continue game” | URL generation only |
| **mods/wordblocks/wordblocks.js** | (notification URL) | `url += \`#gid=${this.app.crypto.hash(tx.msg.game_id).slice(-6)}\`` | URL generation only |
| **lib/saito/ui/game-menu/game-menu.js** | Game menu “Join” / “Observer” callbacks | `game_id: app.crypto.hash(game_mod.game.id).slice(-6)` in `data` for InviteLink | URL / presentational (invite link data) |

Summary of **identity comparisons** (canonical short GID):

1. **GameTemplate.initialize()** — observer stub resolution (Part 1).
2. **GameTemplate.loadGame()** — resolve which game to load from URL (Part 1).
3. **GameTemplate.gameBrowserActive()** — is current URL for this game? (Part 1).
4. **Arcade.loadGameInviteById()** — find invite by id (short); could later accept full id for compatibility.
5. **Arcade.webServer()** — match `query_params.game_id` to game by short id for server-rendered page; could later accept full id if clients send it.

Parts 1 and 2 of this report address only the three GameTemplate functions; the two Arcade identity comparisons are noted here for a later decision.

---

## PART 4 — Renaming hash → vars_in_url

### 1. Where the variable named `hash` is constructed from the URL

The **object** that holds URL hash parameters (parsed key/value pairs) comes from:

- **`this.app.browser.parseHash(window.location.hash)`**  
  Defined in `lib/saito/browser.ts`: takes the hash string (e.g. `"#gid=abc123&step=5"`), returns an object (e.g. `{ gid: "abc123", step: "5" }`).

In the codebase, the **variable** that stores this object and is named `hash` appears in exactly two places:

1. **lib/templates/gametemplate.js** — `initialize()`:  
   `const hash = this.app.browser.parseHash(window.location.hash);`
2. **lib/templates/gametemplate-src/gametemplate-game.js** — `loadGame(game_id = null)`:  
   `let hash = this.app.browser.parseHash(window.location.hash);`

So the “hash” that we are renaming is the **parsed URL parameters object** held by these two local variables. It is not the string `window.location.hash` and not the parameter names inside `browser.ts` (e.g. `parseHash(hash)` there is the string argument).

---

### 2. All references to hash.gid

- **gametemplate.js, initialize():**
  - `if (hash?.gid && this.app.options?.games?.length > 0)`
  - `this.app.crypto.hash(...).slice(-6) === hash.gid`
- **gametemplate-src/gametemplate-game.js, loadGame():**
  - `if (hash?.gid)`
  - `this.app.crypto.hash(...).slice(-6) == hash.gid`

There are no other references to a variable named `hash` used for this parsed URL object in the game template or in the Arcade code paths under review.  
**gameBrowserActive()** does not use a variable named `hash`; it derives `gid` from `window.location.hash` with `window.location.hash.split('&')[0].substring(5)`.

---

### 3. Does renaming to vars_in_url require changes outside the three target functions?

- **No.**  
  The name `hash` here is **local** to:
  - `GameTemplate.initialize()` (gametemplate.js)
  - `GameTemplate.loadGame()` (gametemplate-game.js)

  Renaming to `vars_in_url` (or similar) in those two functions and updating the two `hash?.gid` and two `hash.gid` references does not require changes in:

  - **browser.ts** — The method is `parseHash(...)`; callers only use the return value. The parameter name in `parseHash` is the hash **string**; we are renaming the **caller’s** variable that holds the parsed object.
  - **Other modules** — No other file assigns `parseHash(...)` to a variable named `hash` for URL parameters, and no one passes this object under the name `hash` across boundaries.

  So the renaming is **local** to those two functions.

---

### 4. Scope of renaming

| Scope | Applies? | Notes |
|-------|----------|--------|
| **Local rename inside function** | **Yes** | Only in `initialize()` and `loadGame()`. Replace `hash` with `vars_in_url` (or chosen name) and use `vars_in_url?.gid` / `vars_in_url.gid` where appropriate. |
| **Shared utility rename** | **No** | `parseHash` in browser is a general URL-hash parser; its parameter is the hash string. Renaming the **object** in the game template does not require changing the browser API or its parameter names. |
| **Global impact** | **No** | No global or shared variable holds this object; no other files reference this “hash” variable. |

**Optional consistency:** In `gameBrowserActive()` we could introduce a parsed object (e.g. `vars_in_url = this.app.browser.parseHash(window.location.hash)` and use `vars_in_url.gid`) so that all three functions use the same naming and the same dual-ID check on `vars_in_url.gid`. That would be a small, local addition in `gameBrowserActive()` only; no global or utility change required.

---

## POST-IMPLEMENTATION REPORT (dual-ID patch applied)

### 1. Exact modified lines by file

**lib/templates/gametemplate.js**

- **initialize() (observer stub bootstrap):**
  - `const hash` → `const vars_in_url` (parseHash result).
  - `hash?.gid` → `vars_in_url?.gid` (guard).
  - Comparison replaced with: `(this.app.crypto.hash(this.app.options.games[i].id).slice(-6) === vars_in_url.gid || this.app.options.games[i].id === vars_in_url.gid)` (module name check unchanged).

- **gameBrowserActive():**
  - Added: `const vars_in_url = this.app.browser.parseHash(window.location.hash);` and `const gid_from_url = vars_in_url?.gid;`
  - Removed manual: `let gid = window.location.hash.split('&')[0].substring(5);`
  - Replaced: `const result = gid === short_game_id` with `const result = (gid_from_url === short_game_id || gid_from_url === game_id);`
  - Logging: `gid?.length` → `gid_from_url?.length` (all other log fields unchanged).

**lib/templates/gametemplate-src/gametemplate-game.js**

- **loadGame(game_id = null)** (when `game_id == null`):
  - `let hash` → `let vars_in_url`.
  - `hash?.gid` → `vars_in_url?.gid`.
  - Comparison replaced with: `(this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == vars_in_url.gid || this.app.options.games[i].id === vars_in_url.gid)` (same loop and assignment logic).

### 2. No other files changed

Only the two files above were modified. Arcade, share links, lounge, archive, and all other call sites were not touched.

### 3. Short-ID support still works

- All three functions still compare against `short_id` (e.g. `this.app.crypto.hash(...).slice(-6) === vars_in_url.gid` or `gid_from_url === short_game_id`). URLs with a 6-character `#gid=` continue to match as before.

### 4. Full game id in `#gid` now works

- **initialize():** A full `game.id` in the URL now matches via `this.app.options.games[i].id === vars_in_url.gid` when the stored game id equals the URL gid.
- **loadGame():** Same: `this.app.options.games[i].id === vars_in_url.gid` allows loading by full id from the hash.
- **gameBrowserActive():** `gid_from_url === game_id` returns true when the URL contains the full game id, so the browser is considered “active” for that game.

### 5. No archive or routing logic modified

- No changes to `observerDownloadNextMoves`, archive queries, `loadGameInviteById`, `webServer`, share link generation, lounge links, or `game_id` query parameters. This is a dual-ID tolerance patch only; behavior is unchanged except that full `game_id` in `#gid` is now accepted.
