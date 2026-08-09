# emoji-picker-element (vendored)

This directory vendors [emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element) for use as a static ES module via Saito `postScripts`.

## Upstream

- Package: `emoji-picker-element`
- Version: **1.29.1**
- License: Apache License 2.0 (see `LICENSE`)
- Copyright: Copyright 2020 Nolan Lawson

Emoji JSON is loaded at runtime from the package default data source
(`emoji-picker-element-data` on jsDelivr; Apache-2.0), which is derived from
emojibase-data (MIT).

## Saito files

| File | Upstream equivalent |
|------|---------------------|
| `emoji-picker.js` | `index.js` (entry; registers `<emoji-picker>`) |
| `picker.js` | `picker.js` |
| `database.js` | `database.js` |
| `LICENSE` | `LICENSE` |

## Saito modifications

`picker.js` appends a small Shadow DOM stylesheet so existing host CSS variables
continue to work:

- `--input-background` (search field background; used by RedSquare Compose)
- `--emoji-vertical-offset` (optical emoji alignment; used by RedSquare Compose)

These are not part of upstream. Do not drop them without updating Compose CSS.
