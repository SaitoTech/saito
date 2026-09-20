# Conquest · A Field Atlas of World Conquest

Classic world conquest for **2–6 players**, implemented from scratch as a Saito `GameTemplate` module. A shared, deterministic rules engine powers online multiplayer and a standalone local hotseat game. Game files live in `mods/conquest`; tests and preview tooling live in `tests/mods/conquest`.

## Play locally

```sh
node tests/mods/conquest/serve.js
```

Open **http://127.0.0.1:4173/conquest/demo**. Choose the player count and classic or automatic opening deployment. No Saito build, external CDN, account, or package installation is needed for this preview. It runs in memory; refreshing starts a new campaign. The pass-screen curtain provides courtesy privacy for hotseat hands.

For Saito Arcade, register `conquest/conquest.js` using this checkout's usual module configuration and rebuild the client. Module configuration and compiled bundles are managed by the application build. The module serves `/conquest` through GameTemplate and `/conquest/demo` as its local preview.

## Rules research and edition

The baseline is Hasbro's [classic 2–6 player rulebook](https://www.hasbro.com/common/instruct/risk.pdf), also available as an [official archived PDF](https://www.hasbro.com/common/documents/dad2886d1c4311ddbd0b0800200c9a66/61364C2119B9F369106F6DE955E8C10A.pdf). The [later 2–5 player edition](https://www.hasbro.com/common/documents/DAD2886D1C4311DDBD0B0800200C9A66/F56A63AE8FA145D9B82A5FA3919CA3A5.pdf) was checked to distinguish edition differences. This implementation uses:

- 42 territories, 83 borders, six continents and their classic bonuses.
- Initial armies: 40 in two-player games, then 35/30/25/20 for 3/4/5/6 players. Two players also receive a 40-army neutral force, with 14 territories per force and alternating two-own/one-neutral placement.
- Territory claiming and one-army-at-a-time setup for three or more players.
- Territory and continent reinforcements; escalating sets worth 4, 6, 8, 10, 12, 15, then five more per set. One matching owned-territory bonus per turn.
- One to three attacking dice, up to two defending dice, ties to defense, mandatory conquest movement and one card per conquering turn.
- Mandatory trades at five cards at the start of a turn; after elimination, six or more cards trigger trades down to four or fewer, followed by immediate deployment.
- One **adjacent-territory** fortification. Two-player victory requires defeating the human opponent; neutral territory need not be conquered.

Automation choices: defense always rolls the maximum legal dice; a single synchronized random draw chooses the starting player; a matching card-territory bonus defaults to the first eligible territory. Attackers choose their dice count. Optional blitz repeats attacks until conquest or only one attacking army remains. Optional quick setup assigns territories and places all opening armies. These conveniences are explicit departures from manual tabletop procedures. There are no missions, AI opponents, or house-rule connected-path fortifications.

## Structure and restyling

- `conquest.js`: GameTemplate adapter, signed queue actions, persistence, encrypted deck integration and battle randomness.
- `lib/engine.js`: pure state transitions, legal moves, combat, cards, setup and victory. Supports an injected random source.
- `lib/map.js`: editable SVG geometry, shared country edges, continent outlines and label positions. Preserve IDs and adjacency when changing artwork.
- `web/js/ui.js`: phase-aware SVG interface using an injected controller.
- `web/js/scene.js`: Three.js dice, with reduced-motion and WebGL-failure fallback.
- `web/style.css`: theme tokens for paper, ink, typography, all six armies, continent colors (`--conquest-continent-*`) and country gaps (`--conquest-country-gap`). Reskin here without changing the rules or transport.
- `DESIGN.md`: visual direction and interaction rationale.

Three.js **r159 / 0.159.0** is vendored for offline use under `web/js/vendor`; its MIT license is included. Map and cover artwork are locally authored SVGs. No external fonts or image assets are required.

The board scales to the available viewport, reserving a bottom row for every player. The command panel scrolls independently, and the enlarged map supports dragging with a mouse or touch. The field guide lists continent bonuses and control progress. Cards reuse the board's territory silhouettes with infantry, cavalry or artillery icons. Deployment, occupation and fortification sliders start at the maximum legal army count.

## Multiplayer implementation notes

Public actions include signatures bound to game ID, player and state revision. Battles use an attacker commitment, fresh signed defender entropy, and an attacker reveal before advancing the shared dice seed. One exchange resolves an entire blitz. Secrets are persisted before sending so the originating device can resume after reload. As with other turn-based peer protocols, a disconnected participant can stall the exchange; there is no automatic timeout adjudication.

Cards use GameTemplate's `DECKANDENCRYPT` and `SAFEDEAL` stack commands. Private hands remain in the local encrypted-deck state, outside the public engine state. Eliminated players reveal their captured hand in a signed transfer because GameTemplate has no private hand-transfer primitive; those captured cards are consequently public knowledge. Original participants must remain available for encrypted dealing and reshuffling, including after elimination. The framework does not expose a cryptographic ownership proof for card trades: counts, set validity, discards, local ownership and publicly known captured cards are checked, but a hostile modified client can still lie about an otherwise unknown card. This is not a hardened wagering implementation.

## Verification

```sh
node --test tests/mods/conquest/*.test.js
```

Tests exercise setup, the map, combat, card trading, elimination, fortification, victory, and the adapter's signed queue protocol. Complete automated campaigns additionally cover all supported player counts. Browser smoke tests cover desktop/mobile rendering and real UI actions with Three.js enabled. A live multi-wallet Saito session is still required before declaring network deployment verified; isolated adapter tests do not run the framework's complete encrypted-deck transport.

Test scripts live in the repository’s `tests/mods/conquest` directory, outside Saito’s module copy and dynamic browser imports. This keeps Node tests and Playwright out of the client build.

Optional browser tooling and screenshots belong under the locally ignored `.tools`, `.cache`, `.tmp` and `artifacts` directories inside `tests/mods/conquest`.

To reproduce the browser smoke test with the preview server running:

```sh
mkdir -p tests/mods/conquest/.tmp
npm install --prefix tests/mods/conquest/.tools --cache tests/mods/conquest/.cache --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/.tools/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/browser-smoke.js
```

To reclaim disk space after browser testing, remove generated tooling:

```sh
rm -rf tests/mods/conquest/.tools tests/mods/conquest/.cache tests/mods/conquest/.tmp
```
