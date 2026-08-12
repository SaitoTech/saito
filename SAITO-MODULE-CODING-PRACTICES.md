# Saito Module Coding Practices

These rules apply to Saito application modules (Arcade, RedSquare, and similar).
They exist to keep module code readable and to prevent protocol layers or
middleware variables from growing between components that should interact
directly.

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

## Arcade reference

```
Arcade
  this.games[]          ← Game objects from addGame()
    └── Teasers
          └── Teaser(game)
                → game.onClick()
```

There is no `TeaserCard`. The tile is a **Teaser**.
