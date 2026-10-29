# Conquest · A Field Atlas of World Conquest

Classic world conquest for **2–6 players**, implemented from scratch as a Saito `GameTemplate` module. A shared, deterministic rules engine powers online multiplayer and a standalone local hotseat game. Game files live in `mods/conquest`; tests and preview tooling live in `tests/mods/conquest`.

## Play locally

```sh
node tests/mods/conquest/serve.js
```

Open **http://127.0.0.1:4173/conquest/demo**. Choose the player count and game type. Random placement is the default in both Saito Arcade and the local preview; it assigns territories and deploys every starting army automatically. Classic placement remains available. No Saito build, external CDN, account, or package installation is needed for this preview. It runs in memory; refreshing starts a new campaign. The pass-screen curtain provides courtesy privacy for hotseat hands.

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

Automation choices: defense always rolls the maximum legal dice; a single synchronized random draw chooses the starting player; a matching card-territory bonus defaults to the first eligible territory. Attackers choose their dice count. Optional blitz repeats attacks until conquest or only one attacking army remains. Steamroll automatically advances all surviving attackers except the required one-army garrison after conquest, and can be enabled with or without blitz. Optional quick setup assigns territories and places all opening armies. These conveniences are explicit departures from manual tabletop procedures. There are no missions, AI opponents, or house-rule connected-path fortifications.

## Structure and restyling

- `conquest.js`: GameTemplate adapter, signed queue actions, persistence, encrypted deck integration and battle randomness.
- `lib/engine.js`: pure state transitions, legal moves, combat, cards, setup and victory. Supports an injected random source.
- `lib/map.js`: editable SVG geometry, shared country edges, continent outlines and label positions. Preserve IDs and adjacency when changing artwork.
- `web/js/ui.js`: phase-aware SVG interface using an injected controller.
- `web/js/statistics.template.js`: public dice histograms and campaign casualty summaries.
- `web/js/scene.js`: Three.js dice, with reduced-motion and WebGL-failure fallback.
- `web/style.css`: theme tokens for paper, ink, typography, all six armies, continent colors (`--conquest-continent-*`) and country gaps (`--conquest-country-gap`). Reskin here without changing the rules or transport.
- `DESIGN.md`: visual direction and interaction rationale.

Three.js **r159 / 0.159.0** is vendored for offline use under `web/js/vendor`; its MIT license is included. Map and cover artwork are locally authored SVGs. No external fonts or image assets are required.

The board scales to the available viewport; narrow or short screens can scroll vertically to keep the enlarged controls readable. The Conquest wordmark is centered in the existing Saito menu row in the muted header grey, Field guide lives in the Game menu, The bottom bar is reserved for the player panels. The command panel sits to the right of the desktop map at 250px, and 220px below 1200px; at 760px and below it stacks beneath the board; the redundant reinforcement/attack/fortification strip is omitted. Player panels are equal compact rows in the bottom bar: a faction-colored accent, identicon and name, then icon counts for territories, armies, next-turn reinforcement income (territories plus continent bonuses, excluding card trades), and cards. The active player's name region is filled with that player's own color. Your card count opens the private hand. The panel does not show a YOU badge, a TURN label, or the next trade bonus. Two-player games keep the neutral force on the map and do not add a neutral player panel; the bar shows only the players in the game state. Dispatches open in the standard game log sidebar (the standalone preview has its own slide-out journal); clicking outside closes either log. Buttons, sliders and selection highlights follow the active player’s colour. Moving armies or choosing Skip movement immediately advances to the next player, with no separate End turn control. Turn details use all available sidebar space above content-sized notices and action buttons, scrolling only when needed. Empty notices and unused action rows take no space; on narrow screens the command panel expands with its content. Sending a move preserves the controls and scroll position while disabling input. The themed board sizer beside the hamburger menu scales the board from its fitted size (100%) up to 300%; its center button restores the fitted view. Enlarged maps can be dragged with a mouse or touch inside their viewport without selecting a territory. The field guide lists continent bonuses and control progress. Cards reuse the board's territory silhouettes with infantry, cavalry or artillery icons. Board text uses its original sizing, including a 12px screen minimum for scaled labels. Elsewhere, the enlarged text is reduced by 33%, with a 12px minimum. The turn status is one compact line naming whose turn it is and the current phase, such as “Your turn · Attack” or “Waiting · Opponent reinforcing.” Player panels share one height in the bottom bar and divide its width equally, so the map keeps the space above them. The redundant identity header is removed. Country names and ocean names are hidden until Show labels is turned on. The compass stays visible. Army counts stay visible. Deployment sliders start at the maximum legal army count. Fortification uses a map overlay that starts at the current distribution, with no armies transferred. After a conquest, the occupation card sits on the map between the source and the conquered territory. It shows the armies that would remain and the armies that would arrive, starting at the maximum legal advance; when only one distribution is legal, those armies advance automatically. For reinforcements, choose a count first and click a country to deploy; the count persists and is capped by the armies remaining. Attack and fortification phases highlight legal origins and reveal destinations when an origin is selected. Attack and Blitz buttons sit together on a cream angled backplate beside the selected target and use the sidebar dice and Steamroll settings. Attack fights one round; Blitz repeats until the territory falls or the attacker must stop. It follows map panning and disappears while a move is pending or the target is offscreen. Blitz and Steamroll stay selected independently for that player during the game until switched off. The card hand displays larger territory illustrations, unit symbols and names. Click cards to select or deselect them; selecting a valid set of three trades it automatically. The card holder shows the next shared set bonus. When a valid set can be played during your reinforcement phase, sidebar text offers to open the hand.

When no sector with more than one army borders an opponent or neutral force, attacking ends automatically. When no legal adjacent friendly move exists (including when all sectors have only one army), movement is skipped automatically. Each unavailable phase shows the reason to every viewer for two seconds before the active player sends the normal phase-ending action. Battle playback, mandatory trades and pending card draws or transfers finish before either pause begins.

The bar-chart button on the right of the turn-status badge (also available through the **Stats** menu) opens a public battle record with a six-bin dice histogram for every player (and neutral forces where relevant), plus armies lost and defeated, battles won and lost, armies earned, and territories won and lost. One attack order, including a full Blitz, counts as one battle: a capture wins for the attacker; holding the territory wins for the defender. Earned armies include turn reinforcements, card trades and the owned-card territory bonus, but exclude initial armies. Territory totals count captures, not starting placement. Choose all campaigns or any recorded campaign number from the header; this number identifies a turn, not a separate saved match. All attack and defense dice count, including unmatched dice and every blitz roll. Casualties count for both sides. Each attack adds a battle dispatch followed by a separate losses/defeated line. Aggregates persist independently of the rolling dispatch log. Old saves preserve existing dice and casualty history; newly added totals begin collecting from the update, with a notice identifying incomplete history. The status shortcut stays available while waiting, resolving moves or observing, supports keyboard activation, and regains focus when the dialog closes.

## Multiplayer implementation notes

Public actions include signatures bound to game ID, player and state revision. Battles use an attacker commitment, fresh signed defender entropy, and an attacker reveal before advancing the shared dice seed. One exchange resolves an entire blitz. The public state retains each roll and its starting army counts with a monotonically increasing battle sequence. All clients, including the attacker, defenders, other players and observers, replay those rolls in the open Pacific water below Alaska and west of Chile: both dice groups finish preparing and get a paint opportunity before the rolls start; dice spin, losses are subtracted, then an 800 ms pause precedes the next roll. Input and queue advancement wait for local playback; automatic occupation and the victory screen appear after the final losses. The final dice stay visible until the next attack is started. Dice colour distinguishes the two sides; the groups have no Attack or Defense captions and no casualty line beneath them. Selecting countries, occupation and turn changes preserve these results without blocking play. Dice stay in that same map pocket for every roll. They overlay unused water, do not cover playable territories, and do not change the map’s size or position. Attack and Blitz stay stacked beside the selected territories. Dice use the participating players’ palette colours, including neutral grey, and scale to fit the pocket. Their panels have no background or shadow. Attack submission waits for renderer readiness, textures are reused, and animation time starts on the first frame so initialization delays cannot consume the roll. Animation uses temporary UI snapshots and does not generate random numbers or mutate the synchronized result. Reduced motion and unavailable WebGL preserve the same roll/loss sequence. Secrets are persisted before sending so the originating device can resume after reload. As with other turn-based peer protocols, a disconnected participant can stall the exchange; there is no automatic timeout adjudication.

Cards use GameTemplate's `DECKANDENCRYPT` and `SAFEDEAL` stack commands. Private hands remain in the local encrypted-deck state, outside the public engine state. Eliminated players reveal their captured hand in a signed transfer because GameTemplate has no private hand-transfer primitive; those captured cards are consequently public knowledge. Original participants must remain available for encrypted dealing and reshuffling, including after elimination. The framework does not expose a cryptographic ownership proof for card trades: counts, set validity, discards, local ownership and publicly known captured cards are checked, but a hostile modified client can still lie about an otherwise unknown card. This is not a hardened wagering implementation.

## Verification

```sh
node --test tests/mods/conquest/*.test.js
```

Tests exercise setup, the map, combat, card trading, elimination, fortification, automatic phase pauses and skips, dice/casualty statistics, victory, and the adapter's signed queue protocol. Complete automated campaigns additionally cover all supported player counts. Browser smoke tests cover desktop/mobile rendering and real UI actions with Three.js enabled. A live multi-wallet Saito session is still required before declaring network deployment verified; isolated adapter tests do not run the framework's complete encrypted-deck transport.

Test scripts live in the repository’s `tests/mods/conquest` directory, outside Saito’s module copy and dynamic browser imports. This keeps Node tests and Playwright out of the client build.

Optional browser tooling and screenshots belong under the locally ignored `.tools`, `.cache`, `.tmp` and `artifacts` directories inside `tests/mods/conquest`.

To reproduce the browser smoke test with the preview server running:

```sh
mkdir -p tests/mods/conquest/.tmp
npm install --prefix tests/mods/conquest/.tools --cache tests/mods/conquest/.cache --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/.tools/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/browser-smoke.js
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/battle-browser-smoke.js
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/phase-browser-smoke.js
PLAYWRIGHT_BROWSERS_PATH="$PWD/tests/mods/conquest/.tools/browsers" TMPDIR="$PWD/tests/mods/conquest/.tmp" node tests/mods/conquest/statistics-browser-smoke.js
```

To reclaim disk space after browser testing, remove generated tooling:

```sh
rm -rf tests/mods/conquest/.tools tests/mods/conquest/.cache tests/mods/conquest/.tmp
```

## Automated player

The optional [Node.js runner](../../apps/runner/README.md) can host or join an
unstaked two-player campaign using local Codex or a heuristic policy. It executes
this module's signed action and encrypted-deck protocols without a browser; it
is separate from the local hotseat interface.
