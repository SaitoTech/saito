# Short Game ID (gid) Usage

This document describes how **abbreviated** (short) game IDs are used across the codebase. The canonical game identifier is the full id (e.g. transaction signature, 64+ characters). In URLs, query parameters, and hash fragments, a **short gid** is often used: the last 6 characters of `app.crypto.hash(game.id)`.

---

## 1. How the short gid is produced

- **Formula:** `this.app.crypto.hash(game_id).slice(-6)`
- **Result:** A 6-character string (e.g. `5efc3f`) derived from the full game id.
- **Purpose:** Shorter URLs and links; human-readable in logs and UIs.

The **full game id** is stored in:
- `this.game.id` (game module)
- `app.options.games[i].id`
- Transaction messages (`tx.msg.game_id`, `tx.signature` for game tx)
- Archive storage (e.g. `field4` in transaction indexes)

---

## 2. URL hash: `#gid=XXXXXX&step=N`

### 2.1 Where the hash is set (full → short)

| File | Location | What is done |
|------|----------|----------------|
| **lib/templates/gametemplate.js** | `initializeHTML()` | `short_game_id = this.app.crypto.hash(this.game.id).slice(-6)`, then `window.location.hash = app.browser.initializeHash('#gid=${short_game_id}&step=${this.game.step.game}', ...)`. So the in-page game URL always uses a 6-char gid. |
| **mods/arcade/arcade.js** | `observeGame()` | Before navigating to the game: `gid = this.app.crypto.hash(game_id).slice(-6)`, then `navigateWindow(\`/${slug}?observer=1#gid=${gid}\`)`. Observer links in the arcade therefore use short gid in the hash. |
| **mods/arcade/lib/ui/overlays/lounge.js** | Continue-game handler | `navigateWindow(\`/${slug}/#gid=${this.app.crypto.hash(gameId).slice(-6)}\`)`. “Continue game” links use short gid in the hash. |
| **mods/wordblocks/wordblocks.js** | Notification action URL | `url += \`#gid=${this.app.crypto.hash(tx.msg.game_id).slice(-6)}\``. In-app notification “Play” links use short gid. |

So any time the app **writes** the game position into the hash (same game, observer link, continue game, notification link), it uses the **short** gid.

### 2.2 Where the hash is read (short → resolve to full id)

| File | Location | What is done |
|------|----------|----------------|
| **lib/templates/gametemplate.js** | `initialize()` (observer stub) | `hash = this.app.browser.parseHash(window.location.hash)`. If `hash.gid` is present, loop `app.options.games` and find the game whose **full** id hashes to that gid: `this.app.crypto.hash(this.app.options.games[i].id).slice(-6) === hash.gid` → use `this.app.options.games[i].id` as `observerStubGameId`. So the stub is always created with the **full** id from options; the URL only ever carries the short gid. |
| **lib/templates/gametemplate-src/gametemplate-game.js** | `loadGame(game_id = null)` | When `game_id == null`, read `hash = this.app.browser.parseHash(window.location.hash)`. If `hash.gid` exists, loop `app.options.games` and set `game_id = this.app.options.games[i].id` when `this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == hash.gid`. So loading “by URL” uses the short gid from the hash to look up the **full** id from options. |
| **lib/templates/gametemplate.js** | `gameBrowserActive(game_id)` | Read gid from hash: `gid = window.location.hash.split('&')[0].substring(5)`. Compare to `short_game_id = this.app.crypto.hash(game_id).slice(-6)`. Return true only if `gid === short_game_id`. So “is this game tab active?” is decided by comparing the short gid in the URL to the short form of the current `game_id`. |

So whenever the app **reads** the hash to decide “which game” or “is this game active?”, it either:
- Resolves short `hash.gid` to a full id by matching against `app.options.games`, or  
- Compares short `hash.gid` to `hash(current_game_id).slice(-6)`.

---

## 3. Query parameters: `?game=...&game_id=...`

### 3.1 Where `game_id` is set in links

| File | Location | What is done |
|------|----------|----------------|
| **lib/saito/ui/game-menu/game-menu.js** | Join link / Observer link | `game_id: app.crypto.hash(game_mod.game.id).slice(-6)` in the data passed to `InviteLink`. So menu “Join” and “Observer” links expose the **short** game_id in the generated URL (e.g. for copy/share). |
| **lib/templates/gametemplate-src/gametemplate-game.js** | Gameover link | `link = ... \`/arcade/?game=${this.name}&game_id=${this.app.crypto.hash(this.game.id).slice(-6)}\``. The gameover share link uses short `game_id` in the query string. |
| **mods/arcade/arcade.js** | Share invitation link data | `data.game_id = this.app.crypto.hash(game_sig).slice(-6)`. So when building the share/invite payload, the arcade sends the **short** game_id. |

So all **outgoing** links that include a game identifier in the path or query use the **short** form.

### 3.2 Where `game_id` from the URL is consumed

| File | Location | What is done |
|------|----------|----------------|
| **mods/arcade/arcade.js** | Link handler → `loadGameInviteById()` | When the user follows a link with `game_id` and `game` query params, arcade calls `loadGameInviteById(urlParams.get('game_id'), urlParams.get('game'), ...)`. So the first argument is the **short** game_id from the URL. |
| **mods/arcade/arcade.js** | `loadGameInviteById(game_id_short, ...)` | Looks up the game in `this.games` by matching `this.app.crypto.hash(r.tx.signature).slice(-6) == game_id_short`. So the short id from the link is used to find the **full** game record (by tx.signature). |

So when opening a game from a link, the **short** `game_id` from the query is the only id available until the arcade resolves it to a full game (e.g. tx.signature).

---

## 4. Observer and first-time load

- **Observer URL:** Arcade builds `?observer=1#gid=<short>`. So the observer always lands with a **short** gid in the hash.
- **Stub creation:** In `initialize()`, if there is no game yet and we have `hash.gid`, we **only** resolve it via `app.options.games` (match by `hash(full_id).slice(-6) === hash.gid`). So we need the game to already exist in options to get a full id for the stub.
- **If the observer link was shared with short gid and the game is not in `app.options.games`:** There is no path that turns “short gid only” into a full id. The stub would never get the correct full id; the only full id we could use would be if we **treated the short gid as the full id** (wrong), or if we had another source (e.g. a different link param) that carried the full id. Currently we do not have that.
- **Archive query:** In `GameObserver.observerDownloadNextMoves()`, the archive is queried with `field4: g.id`. Here `g` is `this.game_mod.game`, so `g.id` is whatever id the **engine** has for the current game. That is:
  - After a normal load from options: full id (from `loadGame()` / options).
  - For an observer stub created from hash only: we set `observerStubGameId` from options (full id), so `g.id` is full.
  - If in any code path the stub were created with only a short id (e.g. `observerStubGameId = hash.gid` when that is 6 chars), then `g.id` would be short and the archive query would use a **short** id. Archive storage typically uses the **full** game id (e.g. transaction field). So that would cause a mismatch and “no moves found” for first-time observer.

So short gid usage in the URL and in link params is consistent; the risk is any path where the **engine** game object (and thus `g.id` for the archive) is ever set to the short value instead of the full one.

---

## 5. Summary table

| Context | Uses short gid? | Notes |
|--------|------------------|--------|
| **URL hash `#gid=...`** | Yes (written and read as short) | Set in GameTemplate, arcade observer, lounge, wordblocks. Parsed in GameTemplate and gametemplate-game to resolve to full id from options. |
| **Query `?game_id=...`** | Yes | Set in game menu, gameover link, arcade share data. Read in arcade and resolved to full id in `loadGameInviteById`. |
| **gameBrowserActive()** | Yes | Compares short gid from hash to `hash(game_id).slice(-6)`. |
| **loadGame(null)** | Reads short from hash | Resolves to full id by matching options. |
| **Observer stub (initialize)** | Reads short from hash | Resolves to full id only from options (hash(full).slice(-6) === hash.gid). |
| **Archive query (field4)** | No (must be full) | `field4: g.id`; storage uses full game id. So `g.id` must be the full id for correct results. |
| **app.options.games[i].id** | No | Stored and compared as full id. |
| **Game module this.game.id** | No | Should always be full id; short is only in URLs and link data. |

---

## 6. Files that reference short gid or hash(gid).slice(-6)

- **lib/templates/gametemplate.js** — hash write, hash read (stub), `gameBrowserActive`
- **lib/templates/gametemplate-src/gametemplate-game.js** — `loadGame` hash read, gameover link
- **lib/saito/ui/game-menu/game-menu.js** — Join/Observer link `game_id`
- **lib/saito/ui/game-observer/game-observer.js** — uses `g.id` for archive (no shortening; must stay full)
- **mods/arcade/arcade.js** — observer URL, `loadGameInviteById`, share link `game_id`
- **mods/arcade/lib/ui/overlays/lounge.js** — continue-game URL hash
- **mods/wordblocks/wordblocks.js** — notification URL hash

This is the set of places that either generate short gids for URLs/links or interpret short gids from the URL to resolve to the full game id.
