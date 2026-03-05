# Migration Plan: Eliminate Short IDs, Use Full `tx.signature` as `game_id`

## Principles

- **Canonical identifier**: There is exactly one canonical identifier used internally: `game_id === tx.signature`. All internal logic uses the variable name `game_id`.
- **URL parameter name**: The URL parameter may remain `gid` (e.g. `#gid=` in existing URLs). As soon as the value is read from the URL it must be assigned to `game_id`.
- **Canonical lookup rule**: `this.games` is keyed by `tx.signature`. All lookups use direct access `this.games[game_id]`. Scan-based ID resolution (e.g. `Object.values(this.games).filter(...)`) is prohibited.
- **Observer links**: Support `/arcade/?game=...&game_id=<full_sig>` even when the game is not in `arcade.games` (fallback to `app.options.games` + pseudo-tx via `createPseudoTransaction` and `addGame`).

---

## Variable and Naming Rules

**Do not introduce or use these variables in the implementation:**

- `gidEncoded`
- `gid_from_url`
- `short_game_id`
- `game_id_short`
- `record`
- `id`

**Standard:** All internal logic uses `game_id` for the canonical identifier. Do not introduce alias variables (e.g. `gid`, `id`) unless absolutely required.

---

## URL Handling Rule

**When writing URLs:**

```javascript
#gid=${encodeURIComponent(game_id)}
```

**When reading URLs (at the input boundary only):**

```javascript
game_id = decodeURIComponent(vars_in_url.gid)
```

Decode exactly once at the input boundary. After that point the code must only use `game_id`.

---

## URL Decoding: Single Boundary Rule

**Decoding happens exactly once at the input boundary.**

After the value is read and assigned to `game_id`, the system assumes `game_id` is the decoded raw signature. Internal logic must never:

- Check `includes('%')` to decide whether to decode.
- Conditionally decode values in the middle of a flow.
- Use a different variable name for the decoded value; use `game_id`.

**Correct boundaries for decoding:**

1. **Arcade web server** — when parsing query parameters from the incoming request; assign to `game_id`.
2. **loadGameInviteById** — when receiving the parameter from the caller that obtained it from the URL; decode and assign to `game_id`.
3. **GameTemplate.loadGame** — when reading from the parsed hash (`vars_in_url.gid`); decode and assign to `game_id`.
4. **GameTemplate.gameBrowserActive** — when reading from the parsed hash; decode and assign to `game_id` (if this is the first consumer of that value in the flow).

**Safe pattern at the boundary only:**

```javascript
game_id = decodeURIComponent(game_id);
// or, if the raw value comes from a different key (e.g. hash):
game_id = decodeURIComponent(vars_in_url.gid);
```

Use try/catch if desired: `try { game_id = decodeURIComponent(vars_in_url.gid); } catch {}`. After that, use only `game_id`.

---

## Canonical Lookup Rule

**`this.games` is keyed by `tx.signature`.**

Therefore:

- All resolution of a game by ID must use **direct access**: `this.games[game_id]`.
- **Scan-based lookups are prohibited.** Patterns such as `Object.values(this.games).filter(...)` for the purpose of resolving a game by ID must not appear anywhere in the architecture.
- No `hash(signature).slice(-6)` and no matching by short id.

---

## 1. `node/mods/arcade/arcade.js`

### 1.1 `loadGameInviteById` — signature and lookup

**Goal:** Parameter is full `game_id` (may be encoded when received from URL). Decode once at entry and assign to `game_id`; resolve by direct lookup; if missing, fallback from `app.options.games` by signature only; keep pseudo-tx flow. Use only `game_id` internally; do not use `record` or `id`.

**Current:**

```javascript
loadGameInviteById(game_id_short, gameName, is_invite = false) {
    let record = Object.values(this.games).filter(
        (r) => this.app.crypto.hash(r.tx.signature).slice(-6) == game_id_short
    )[0];
    let game = record ? record.tx : null;
    // ... rest unchanged
}
```

**Proposed:**

- **Input boundary:** Decode once at the start and assign to `game_id`. Then use `this.games[game_id]` only; no `record`, no `id`.

```javascript
loadGameInviteById(game_id, gameName, is_invite = false) {
    try { game_id = decodeURIComponent(game_id); } catch {}

    let game = this.games[game_id]?.tx ?? null;

    if (!game && this.app.options?.games?.length) {
        const opt = this.app.options.games.find(g => g.id === game_id);
        if (opt) {
            const pseudoTx = await this.createPseudoTransaction(opt);
            if (pseudoTx) {
                this.addGame(pseudoTx);
                game = pseudoTx;
            }
        }
    }

    if (!game || game.msg?.request === 'cancel' || game.msg?.request === 'closed') {
        // ... existing alert/league-overlay-render-request logic
        return;
    }
    // ... rest unchanged (isAvailableGame, Invite, render lounge_overlay)
}
```

- **Lookup:** Direct access `this.games[game_id]` only; no filter, no hash/slice, no `record`.
- **Fallback:** Resolve by signature only: `find(g => g.id === game_id)`. No module or gameName match required.
- **Pseudo-transaction fallback:** Unchanged: `createPseudoTransaction(opt)` and `addGame(pseudoTx)`.
- Make `loadGameInviteById` `async` and have callers `await` it (or use `.then()`).

---

### 1.2 `showShareLink` — put full signature in share data

**Current:**

```javascript
data.game_id = this.app.crypto.hash(game_sig).slice(-6);
```

**Proposed:**

```javascript
data.game_id = game_sig;
```

- Encoding for the query string happens when the URL is built (e.g. in `saito-link` `buildLink` via `encodeURIComponent`).

---

### 1.3 `webServer` GET handler — resolve `game_id` by full signature

**Input boundary:** Decode query parameter once and assign to `game_id`. Use direct lookup only; no scan, no `id`.

**Current:**

```javascript
let id = query_params?.game_id;
game_data =
    Object.values(arcade_self.games).filter(
        (r) => r.tx.game == game && arcade_self.app.crypto.hash(r.tx.signature).slice(-6) === id
    )[0]?.tx ?? null;
```

**Proposed:**

```javascript
let game_id = query_params?.game_id;
if (game_id != null) {
    try { game_id = decodeURIComponent(game_id); } catch {}
}
game_data =
    (game_id && arcade_self.games[game_id] && arcade_self.games[game_id].tx.game == game)
        ? arcade_self.games[game_id].tx
        : null;
```

- No `Object.values(...).filter(...)`.

---

### 1.4 Call sites of `loadGameInviteById`

- **respondTo('saito-link')** (e.g. ~411–416): Pass `urlParams.get('game_id')` and `urlParams.get('game')`. `loadGameInviteById` decodes at its boundary and uses `game_id` internally. If async, use `await this.loadGameInviteById(...)` or `.then(...)`.
- **onPeerServiceUp callback** (e.g. ~523–528): Pass `returnURLParameter('game_id')` and `returnURLParameter('game')`. Same.

---

## 2. `node/mods/arcade/lib/ui/overlays/lounge.js`

### 2.1 "Continue" / "View game" — use full `game_id` in hash

**Current:**

```javascript
navigateWindow(`/${slug}/#gid=${this.app.crypto.hash(gameId).slice(-6)}`);
```

**Proposed:**

- The value is the full signature (from `this.invite.game_id` or `this.game_id`). Use `game_id` in the example; in the actual component the property may still be named `gameId` or `this.game_id`, but the value written to the URL is the canonical identifier. Write:

```javascript
navigateWindow(`/${slug}/#gid=${encodeURIComponent(game_id)}`);
```

- So: use the canonical identifier variable `game_id` (which the component has from `this.invite.game_id` or `this.game_id`). No `gid` variable.

---

## 3. `node/lib/templates/gametemplate.js`

### 3.1 `initializeHTML` — hash uses full game id

**Current:**

```javascript
let short_game_id = this.app.crypto.hash(this.game.id).slice(-6);
// ...
window.location.hash = app.browser.initializeHash(
    `#gid=${short_game_id}&step=${this.game.step.game}`,
    oldHash,
    {}
);
```

**Proposed:**

- Write full `this.game.id` into the hash. Use `game_id` for the value and the URL pattern; no `gidEncoded` or `short_game_id`.

```javascript
game_id = this.game.id;
window.location.hash = app.browser.initializeHash(
    `#gid=${encodeURIComponent(game_id)}&step=${this.game.step.game}`,
    oldHash,
    {}
);
```

- Or inline without a local variable: `#gid=${encodeURIComponent(this.game.id)}&step=...`. Remove any reference to `short_game_id`.

---

### 3.2 `gameBrowserActive` — match only by full id

**Input boundary:** When this is the first consumer of the hash in the flow, decode once and assign to `game_id`. Then compare to the current game (e.g. `this.game.id`). No `gid_from_url`, no `short_game_id`.

**Current:**

```javascript
const gid_from_url = vars_in_url?.gid;
let short_game_id = this.app.crypto.hash(game_id).slice(-6);
const result = gid_from_url === short_game_id || gid_from_url === game_id;
```

**Proposed:**

```javascript
if (vars_in_url?.gid == null) return false;
game_id = vars_in_url.gid;
try { game_id = decodeURIComponent(vars_in_url.gid); } catch {}
return game_id === this.game.id;
```

- After the boundary, only `game_id` is used. Comparison is to `this.game.id` (the current game’s canonical id).

---

## 4. `node/lib/templates/gametemplate-src/gametemplate-game.js`

### 4.1 `loadGame` — resolve from hash by full id only

**Input boundary:** Decode once and assign to `game_id`. Match in `app.options.games` by `game_id` only. No `gid`, no hash/slice.

**Current:**

```javascript
if (game_id == null) {
    let vars_in_url = this.app.browser.parseHash(window.location.hash);
    if (vars_in_url?.gid) {
        if (this.app.options?.games?.length > 0) {
            for (let i = 0; i < this.app.options.games.length; i++) {
                if (this.name == this.app.options.games[i].module) {
                    if (
                        this.app.crypto.hash(this.app.options.games[i].id).slice(-6) == vars_in_url.gid ||
                        this.app.options.games[i].id === vars_in_url.gid
                    ) {
                        game_id = this.app.options.games[i].id;
                        break;
                    }
                }
            }
        }
    }
}
```

**Proposed:**

```javascript
if (game_id == null) {
    let vars_in_url = this.app.browser.parseHash(window.location.hash);
    if (vars_in_url?.gid) {
        game_id = vars_in_url.gid;
        try { game_id = decodeURIComponent(vars_in_url.gid); } catch {}
        if (this.app.options?.games?.length > 0) {
            for (let i = 0; i < this.app.options.games.length; i++) {
                if (this.name == this.app.options.games[i].module && this.app.options.games[i].id === game_id) {
                    game_id = this.app.options.games[i].id;
                    break;
                }
            }
        }
    }
}
```

- Internal logic uses only `game_id`.

---

### 4.2 `sendGameOverTransaction` — gameover link uses full id

**Current:**

```javascript
let link =
    window.location.origin +
    `/arcade/?game=${this.name}&game_id=${this.app.crypto.hash(this.game.id).slice(-6)}`;
```

**Proposed:**

- Use full `this.game.id`; write with `encodeURIComponent(game_id)`. No extra variable required:

```javascript
game_id = this.game.id;
let link =
    window.location.origin +
    `/arcade/?game=${this.name}&game_id=${encodeURIComponent(game_id)}`;
```

- Or inline: `game_id=${encodeURIComponent(this.game.id)}`.

---

## 5. `node/lib/saito/ui/game-observer/game-observer.js`

### 5.1 `initialize` — resolve local game by full id only

**Current:**

```javascript
if (g.id === full_game_id || this.app.crypto.hash(g.id).slice(-6) === full_game_id) {
    localId = g.id;
    break;
}
```

**Proposed:**

- `full_game_id` is already the full signature (decoded earlier). Match only by full id. No hash/slice.

```javascript
if (g.id === full_game_id) {
    localId = g.id;
    break;
}
```

---

## 6. `node/lib/saito/ui/game-menu/game-menu.js`

### 6.1 "Join" and "Observer Link" — pass full game id in `data`

**Current (Join):**

```javascript
let data = {
    game: game_mod.name,
    game_id: app.crypto.hash(game_mod.game.id).slice(-6),
    path: '/arcade/',
    name: 'Join'
};
```

**Proposed:**

```javascript
let data = {
    game: game_mod.name,
    game_id: game_mod.game.id,
    path: '/arcade/',
    name: 'Join'
};
```

**Current (Observer Link):**

```javascript
let data = {
    game: game_mod.name,
    game_id: app.crypto.hash(game_mod.game.id).slice(-6),
    step: game_mod.game.step.game,
    path: '/arcade/',
    name: 'Observer'
};
```

**Proposed:**

```javascript
let data = {
    game: game_mod.name,
    game_id: game_mod.game.id,
    step: game_mod.game.step.game,
    path: '/arcade/',
    name: 'Observer'
};
```

- Encoding happens when the link is built (e.g. in `saito-link` `buildLink`).

---

## 7. `node/mods/wordblocks/wordblocks.js`

### 7.1 Notification "Play" URL — use full game id in hash

**Current:**

```javascript
url += `#gid=${this.app.crypto.hash(tx.msg.game_id).slice(-6)}`;
```

**Proposed:**

- Use full `tx.msg.game_id`; write with `encodeURIComponent(game_id)`:

```javascript
game_id = tx.msg.game_id;
url += `#gid=${encodeURIComponent(game_id)}`;
```

- Or inline: `#gid=${encodeURIComponent(tx.msg.game_id)}`.

---

## 8. `node/lib/saito/ui/modals/saito-link/saito-link.js`

### 8.1 `buildLink` — safe query string for `game_id`

**Current:**

- Iterates `this.data` and appends `&key=value`; no encoding of values.

**Proposed:**

- Encode values so full signatures are safe. The key `game_id` carries the full signature; decoding happens at the boundary when the URL is consumed.

```javascript
for (let key in this.data) {
    if (key !== 'path' && key !== 'name') {
        const val = this.data[key];
        this.invite_link += '&' + key + '=' + encodeURIComponent(val != null ? val : '');
    }
}
```

---

## 9. Observer link when game not in `arcade.games`

**Goal:** `/arcade/?game=Twilight&game_id=<full_sig>` still opens the lounge (or observer flow) when the game is not in the peer's `arcade.games`.

**Approach:**

1. **In `loadGameInviteById`** (arcade.js):
   - Decode once at the input boundary and assign to `game_id`.
   - Resolve by direct lookup: `this.games[game_id]`; no scan.
   - If `!game` and `this.app.options?.games` exists, find by signature only: `this.app.options.games.find(g => g.id === game_id)`.
   - If found, call `createPseudoTransaction(opt)`, then `addGame(pseudoTx)`, set `game = pseudoTx`, and continue to the existing "isAvailableGame / Invite / render lounge" path.

2. **Pseudo-transaction fallback:** The use of `createPseudoTransaction(opt)` and `addGame(pseudoTx)` is correct and must remain. Do not remove or weaken this logic.

3. **Optional later:** A "fetch game by id" from network or storage can be added when the game is not in `this.games` and not in `app.options.games`.

4. **Server-side** (`webServer`): Direct lookup `arcade_self.games[game_id]` only. Observer links not in the server's list get `game_data === null` on SSR; client-side `loadGameInviteById` with the fallback handles the observer case after hydration.

---

## 10. URL encoding / decoding summary

- **When writing to URL** (query or hash): `#gid=${encodeURIComponent(game_id)}` or `game_id=${encodeURIComponent(game_id)}`.
- **When reading from URL** (input boundary only): `game_id = decodeURIComponent(vars_in_url.gid)` (or the corresponding query key), with try/catch if desired. After that, use only `game_id`.
- **Boundaries:** Arcade web server (query), loadGameInviteById (parameter), GameTemplate loadGame (hash), GameTemplate gameBrowserActive (hash). No decode heuristics; no extra variables for the decoded value.

---

## 11. Step-by-step migration order (by file)

| Step | File | Action |
|------|------|--------|
| 1 | `node/lib/saito/ui/modals/saito-link/saito-link.js` | Encode query values in `buildLink` so full `game_id` is safe. |
| 2 | `node/mods/arcade/arcade.js` | In `showShareLink`, set `data.game_id = game_sig`. In `webServer`, decode once and assign to `game_id`; resolve with `this.games[game_id]` only; remove filter/hash/slice. |
| 3 | `node/mods/arcade/arcade.js` | In `loadGameInviteById`, decode once at entry and assign to `game_id`; resolve with `this.games[game_id]`; add fallback `find(g => g.id === game_id)` + `createPseudoTransaction` + `addGame`; make async; remove filter/hash/slice; do not use `record` or `id`. |
| 4 | `node/mods/arcade/arcade.js` | Update callers of `loadGameInviteById` to pass full id and to await the async call if needed. |
| 5 | `node/mods/arcade/lib/ui/overlays/lounge.js` | Use `#gid=${encodeURIComponent(game_id)}` in navigate URL; no `gid` variable. |
| 6 | `node/lib/templates/gametemplate.js` | In `initializeHTML`, set hash to `#gid=${encodeURIComponent(game_id)}&step=...` (or `this.game.id`); remove `short_game_id`. In `gameBrowserActive`, decode once and assign to `game_id`; return `game_id === this.game.id`; remove `gid_from_url`, `short_game_id`. |
| 7 | `node/lib/templates/gametemplate-src/gametemplate-game.js` | In `loadGame`, decode once and assign to `game_id`; resolve from hash by full id only; remove hash/slice. In `sendGameOverTransaction`, use `encodeURIComponent(game_id)` (or `this.game.id`) for `game_id` in link; no `gameIdEnc`. |
| 8 | `node/lib/saito/ui/game-observer/game-observer.js` | In `initialize`, match by `g.id === full_game_id` only; remove hash/slice. |
| 9 | `node/lib/saito/ui/game-menu/game-menu.js` | In both Join and Observer Link callbacks, set `game_id: game_mod.game.id`. |
| 10 | `node/mods/wordblocks/wordblocks.js` | Set notification URL to `#gid=${encodeURIComponent(game_id)}` (or `tx.msg.game_id`). |

---

## 12. Logic that can be removed or simplified

- **arcade.js**: All `hash(...).slice(-6)` and any `Object.values(this.games).filter(...)`. All lookups use `this.games[game_id]` only. No variables `record`, `id`, `game_id_short`.
- **gametemplate.js**: Variables `short_game_id`, `gid_from_url`; decode at boundary once and assign to `game_id`; single comparison `game_id === this.game.id`.
- **gametemplate-src/gametemplate-game.js**: Any condition using `hash(...).slice(-6)` in `loadGame`; decode at boundary once and assign to `game_id`; match only `this.app.options.games[i].id === game_id`. No `gidEncoded` or `gameIdEnc`.
- **game-observer.js**: Condition `this.app.crypto.hash(g.id).slice(-6) === full_game_id`; keep only `g.id === full_game_id`.
- **game-menu.js**: `app.crypto.hash(game_mod.game.id).slice(-6)` → `game_mod.game.id`.
- **lounge.js**: `this.app.crypto.hash(gameId).slice(-6)` → `encodeURIComponent(game_id)`; no `gid`.
- **wordblocks.js**: `this.app.crypto.hash(tx.msg.game_id).slice(-6)` → `encodeURIComponent(game_id)` (or `tx.msg.game_id`).

After these changes: one canonical identifier `game_id`; no short-id generation; no scan-based ID resolution; no prohibited variable names; decode only at the defined input boundaries with assignment to `game_id`; canonical lookup via `this.games[game_id]` only; pseudo-transaction fallback unchanged; observer links work with full signature and, when the game is not in `arcade.games`, via the `app.options.games` + pseudo-tx fallback in `loadGameInviteById`.
