# Saito Module Coding Practices

These rules apply to Saito application modules (Arcade, RedSquare, Vault, Store,
NWASM, and similar). They exist to keep module code readable and to prevent
protocol layers, middleware variables, and hard optional-module couplings from
growing between components that should interact directly or through capabilities.

They incorporate lessons from Arcade UI refactors and from Vault ↔ Store ↔ NWASM
integration mistakes (metadata caches, pass-through wrappers, and
`returnModule('Vault')` hard dependencies).

## Domain objects belong in `lib/`

When a module contains a meaningful domain object, that object should normally
be represented by its own class in `lib/`.

Examples:

- RedSquare → `lib/tweet.js`
- Arcade → `lib/game.js`
- Arcade → `lib/invite.js`

The module owns a collection of those objects and provides a semantic `addX()`
function to construct and store them.

For example:

```javascript
addGame(game_data) {
  let game = new Game(this.app, this, game_data);
  this.games.push(game);
}
```

Do not leave domain objects as anonymous metadata bags that the UI re-derives
on every render. Construct them once, store them on the module, and pass them
into the UI.

UI presentation components (tiles, lists, overlays) belong under `lib/ui/`.
Domain objects belong under `lib/`.

Transaction create/receive implementations for a module belong under
`lib/transactions/` when they are real transaction construction or peer receive
logic. Call those functions **directly** from the appropriate code path
(overlay, `handlePeerTransaction`, etc.). Do not accumulate three-line
pass-through methods on the module class whose only job is to forward into
`lib/transactions/`.

## Domain-object constructor pattern

Domain objects use this constructor shape:

```javascript
constructor(app, mod, game_data = {}) {
  this.app = app;
  this.mod = mod;
  this.game_data = game_data;
  this.game_mod = game_data.game_mod || null;

  this.name = ...
  this.slug = ...
  // only Arcade-facing fields that other components actually read
}
```

Meaning of the major objects:

- `app` — Saito application
- `mod` — owning module (for Arcade Games: the Arcade module)
- `game_data` — source data supplied when the module creates the object
- `game_mod` — underlying Saito game module, when applicable

Do not rename `mod` to `arcade` (or similar) on the domain object. The owning
module is `this.mod`. Call into it as `this.mod.makeGameInvite(...)`, not via a
proxy property.

## Separate Arcade-facing properties from source state

In the constructor, group properties clearly:

1. Major objects: `app`, `mod`, `game_data`, and any necessary source handle
   such as `game_mod`.
2. Blank line.
3. Arcade-facing fields that other Arcade/UI components actually read
   (`name`, `slug`, `title`, `image`, `link`, `league_id`, …).
4. Blank line.
5. Only then any remaining internal/source state that must live on the instance.

Do **not** promote every key from `game_data` onto the object.

Before adding or retaining a property, ask:

> Is this property actually referenced elsewhere in the module?

If a value is only needed for sorting, filtering, or a one-off check, read it
from `game_mod` / `game_data` at the use site instead of caching a parallel
field (for example do not keep `is_installable` or `sort_priority` on Game when
`game_mod.teaser` / `game_mod.sort_priority` already answer the question).

## Prefer direct relationships

If component A naturally needs behavior from component B, call B.

Do not insert a resolver, dispatcher, registry, or generic action object unless
a concrete requirement cannot be expressed otherwise.

Prefer:

```
Teaser → Game.onClick()
Module → respondTo('arcade-games') → Arcade.addGame() → Game → Teaser
```

over:

```
Teaser → InteractionResolver → Action → Dispatcher → Game
```

Before adding any variable, function, or object, ask:

> Does this represent a real thing in the module's domain?

If the answer is no, do not create it. Do not invent middleware whose only job
is to ferry data between two components that can already call each other.

## No thin wrappers or pass-through middleware

Do **not** introduce functions whose only purpose is to call another function
elsewhere.

Unacceptable:

```javascript
async createRentalAccessTransaction(opts) {
  return rentalAccess.createRentalAccessTransaction(this.app, this, opts);
}

respondTo('saito-nft-transfer') {
  return {
    onTransfer: (...) => this.createRentalAccessTransaction(...)
  };
}
```

If the logic belongs in a `respondTo` handler, implement it **inline** in that
handler (see Stack’s `saito-nft-transfer`).

If the logic is real transaction construction, put it in `lib/transactions/` and
call it directly from the caller (overlay / peer handler). Do not keep a
same-named method on the module class solely to preserve an old call shape.

The goal is not “more abstraction.” The goal is:

- clear module ownership
- optional-module independence
- `respondTo()` capability interfaces where modules must integrate
- minimal indirection
- no gratuitous wrappers

Ask for permission before introducing a new middleware/helper/wrapper layer.

## Optional modules: depend on capabilities, not on modules

Modules **must not** hard-depend on another optional module via
`returnModule('X')` merely because X happens to expose a convenient method.

Unacceptable:

```javascript
this.app.modules.returnModule('Vault').returnNftFileMetadata(...)
this.app.modules.returnModule('Vault').getCachedNftFileMetadata(...)
app.options.vault.files[...]
```

A module must remain correct when the other optional module is not installed.

When one optional module needs behavior that another *may* provide, use
`respondTo` / `getRespondTos` and depend on a **capability**, not on a class
name.

Conceptual pattern:

```
consumer → getRespondTos('some-capability', query)
provider → respondTo('some-capability') → { ...methods... }
```

Good existing examples:

- `nwasm-library-actions` (Vault offers “Upload to Vault”; NWASM lists actions)
- `saito-nft-transfer` / `saito-nft-media` / `saito-nft-download`
- `saito-create-nft`, `saito-return-key`, `saito-header`

Before introducing a new cross-module dependency, stop and identify:

1. Which module is the consumer?
2. Which module provides the capability?
3. Is the provider guaranteed to exist?
4. If not, why isn’t this going through `respondTo()`?
5. What capability should the consumer request instead of depending on the
   provider’s class/API?

“The other module is installed in this app” is **not** permission to create a
direct dependency. Architecture must remain valid when optional modules are
absent.

Core Saito infrastructure (wallet, network, storage APIs that are always
present) is a different category from optional application modules.

## NFT data: mint transaction is the source of truth

Fields attached to an NFT at mint time (for example Vault `file_id`, `filename`,
`file_access_script` on `tx.msg.data`) live on the **NFT mint transaction**.

Generic retrieval already exists:

- wallet NFT entries (`id`, slips, `tx_sig`)
- `SaitoNFT.fetchTransaction()` / `storage.loadTransactions({ sig })`
- `buildNFTData` / `tx.returnMessage().data`

Do **not**:

- invent a cross-module metadata cache (for example `app.options.vault.files`)
  so Store or NWASM can avoid loading the mint tx
- ask a storage module to classify another module’s domain content
  (Vault must not tell NWASM “this NFT is an N64 ROM”)
- expose cache getters (`returnNftFileMetadata`, `getCachedNftFileMetadata`) as
  public APIs for other modules

Consumers that need NFT-attached data should:

1. Use the `SaitoNFT` (or wallet entry) they already have
2. Use the attached tx if present
3. Otherwise fetch the mint tx through the normal SaitoNFT / storage mechanism
4. On failure: clear user-facing error or skip — **never** fall back into
   another module’s private options bag

If a consumer needs its own classification index (for example NWASM remembering
which Vault NFTs are N64 ROMs), that index belongs to the **consumer**
(`app.options.nwasm.…`), not to the provider’s options.

Separate concerns:

```
NFT / mint tx  →  identity + attached data (file_id, filename, …)
Consumer       →  domain classification (is this a ROM? a rental source?)
Provider       →  optional capability for actual file access / download
```

File **bytes** may still require a Vault peer capability. File **metadata that
already sits on the mint tx** must not.

## `saito-nft-transfer` mutates the existing transfer

`saito-nft-transfer` is a hook invoked while an NFT transfer transaction
**already exists** (A → B). Modules may inspect and modify that transaction
(for example append a routing hop on `tx.msg.data.path`) before the caller
signs and propagates it.

It is **not** a factory for a second “access transaction.”

Follow Stack: implement hop construction **inline** in `onTransfer`, append to
the existing path, return the same `tx`. Do not invent
`createRentalAccessTransaction`-style wrappers that only rename the same
mutation.

Default transfer intent should remain non-delegating unless the caller
explicitly passes transfer options through `modifyBeforeSend(tx, receiver, data)`.

## Components own their behavior — one `onClick`

Domain objects expose ordinary methods with obvious names.

Arcade selection is exactly one function on Game:

```javascript
async onClick() {
  if (typeof this.game_data.onClick === 'function') {
    return await this.game_data.onClick(this);
  }

  // normal / default Arcade behavior...
}
```

There is no second method such as `defaultOnClick`.

There is no selection protocol, interaction object, handler abstraction,
resolver, dispatcher, `selection_mode`, or `module_select`.

If another module (for example a future NWASM entry) needs different behavior,
it supplies `onClick` in the data passed to `addGame()`. Arcade calls
`game.onClick()` and does not need to know who provided the function.

Do **not** introduce:

- resolve/dispatch protocol layers
- soft APIs such as `launchImmediately`, `arcadeInteraction`, `selection_mode`,
  `module_select`
- generic `actions[]` / `handler` / `event` / `payload` / enum buses
- paired `onClick` + `defaultOnClick` indirection

unless a concrete requirement cannot be expressed as a direct method on the
domain object.

## Extending another module

Prefer existing module interfaces (`respondTo`, direct functions on objects the
module already owns) over introducing a generic callback/dispatch framework
inside a consumer module.

Example: another module contributes an Arcade title through
`respondTo('arcade-games')`. Arcade turns that into a `Game` with `addGame()`.
Modules do not inject Teasers or arbitrary UI objects into Arcade.

## Naming

- Instance variables use **snake_case** (`league_id`, `game_mod`, `game_data`).
- Method and API names use camelCase (`addGame`, `render`, `onClick`).
- Prefer: `game`, `games`, `addGame`, `teaser`, `tweet`, `invite`, `mod`.
- Avoid architectural filler: `dispatcher`, `resolver`, `handler`, `payload`,
  `manager`, `registry`, `middleware`.

For Arcade game selection, the deliberate API name is exactly **`onClick`**.
Do not invent variants such as `on_click`, `click_handler`, or
`selection_callback`.

## Scope of changes

Keep module work inside that module's directory (for example
`node/mods/arcade/`) unless a change outside that tree is explicitly approved.

Do not push module-specific APIs into shared framework classes (for example
GameTemplate) merely to make one module's implementation easier.

Do not create “compatibility” wrappers so old hard dependencies keep working
after an architectural fix. Fix the callers.

## Arcade reference

```
Arcade
  this.games[]          ← Game objects from addGame()
    └── Teasers
          └── Teaser(game)
                → game.onClick()
```

There is no `TeaserCard`. The tile is a **Teaser**.

## Quick checklist

- [ ] Domain objects in `lib/`; UI under `lib/ui/`; real txs under `lib/transactions/`
- [ ] No three-line pass-through methods on the module class
- [ ] No new middleware without permission
- [ ] Optional modules integrate via `respondTo` / capabilities, not `returnModule`
- [ ] NFT-attached data comes from the mint transaction / SaitoNFT, not another
      module’s options cache
- [ ] Consumers own their classification indexes
- [ ] `saito-nft-transfer` mutates the existing transfer inline (Stack style)
- [ ] Concrete domain names; no dispatcher/resolver filler
