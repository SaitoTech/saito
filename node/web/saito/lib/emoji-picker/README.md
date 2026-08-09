# emoji-picker-element (vendored, Saito fork)

This directory vendors [emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element) for use as a static ES module via Saito `postScripts`, with a Saito-native visual redesign.

## Upstream

- Package: `emoji-picker-element`
- Version: **1.29.1** (API / database behavior preserved)
- License: Apache License 2.0 (see `LICENSE`)
- Copyright: Copyright 2020 Nolan Lawson

Emoji JSON is loaded at runtime from the package default data source
(`emoji-picker-element-data` on jsDelivr; Apache-2.0), which is derived from
emojibase-data (MIT).

## Saito files

| File | Upstream equivalent |
|------|---------------------|
| `emoji-picker.js` | `index.js` (entry; registers `<emoji-picker>`) |
| `picker.js` | `picker.js` (Saito UI fork) |
| `database.js` | `database.js` |
| `LICENSE` | `LICENSE` |

## Saito UI fork (picker.js)

Visible UI is intentionally simplified:

- Quiet search field (or hidden when Chat owns search via `data-saito-shell-search`)
- One continuous, scrollable emoji grid for default browse (all groups)
- No category icon navigation, indicator, or favorites strip
- **No skin-tone UI** — always emits the default yellow presentation (`skinTone: 0`)

Chat’s selection box provides a unified header:

`[ Search ] [Emoji] [Image] [GIF]`

and sets `data-saito-shell-search` on the picker so the grid fills the content area.

### Theming

`:host` maps picker variables onto canonical Saito tokens from
`node/web/saito/css-imports/saito-variables.css`.

`--input-background` and `--emoji-vertical-offset` remain supported for host CSS.
