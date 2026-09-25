# SettlersX — The Saitoa Expedition

A separate Settlers module with an original illustrated expedition interface and a fully rotatable Three.js island. The gameplay comes from the existing Settlers implementation: its setup, prices, development deck, special two-player rules, turn queue, trade restrictions, robber, scoring and victory conditions are retained.

Everything for this edition lives in `mods/settlersx`; the original Settlers module remains available. [PLAN.md](PLAN.md) records the parallel implementation plan and acceptance criteria. [ART.md](ART.md) describes the original ligne claire artwork.

## Run the local preview

From the repository root:

```sh
node mods/settlersx/tools/serve.cjs
```

Open **http://127.0.0.1:4174/settlersx/preview.html**. Set `PORT` to use another port.

Choose two, three or four explorers. **Begin an expedition** runs the normal opening placement sequence with legal placements and the original rules. This is shared-screen local hotseat; optional pass-screen privacy hides supplies between players. **Explore the workshop sample** places opening villages and roads through the legal setup flow and seeds each hand with extra supplies so construction and trade can be explored immediately. That seeded sample is not a normal starting position. **New expedition** returns to the launch menu.

The preview serves the actual module and copied rule code through a lightweight local framework adapter. It substitutes local deck handling and turn transport for the Saito network lifecycle. It requires no CDN and does not connect separate wallets.

During a player's action phase, use **View / trade as** in the bottom preview bar to inspect another explorer's local hand and answer the active explorer's trade offer. The normal turn sequence resumes with the active explorer after an accepted trade. Pass-screen privacy is a courtesy curtain for people sharing a browser, not separate authenticated accounts.

## Controls

- Drag the island to rotate freely around all axes. Scroll or use the `+` / `−` map buttons to zoom.
- On touch screens, drag to rotate, pinch to zoom, and twist two fingers to roll the view.
- Focus the map for keyboard controls: arrow keys rotate, `Q` / `E` roll, `+` / `−` zoom, and `Home` restores the initial view.
- The target button restores the perspective view; the adjacent view button switches to an overhead chart.
- Choose a highlighted legal space when prompted to place a village, road, city or robber. Confirmations follow the game's preferences.
- The sidebar provides the current action, building, trade, harbour exchange, development cards, statistics and private supplies. Field guide, Logbook and settings remain available above the board.

Roads extend into place, villages and cities rise during construction, the robber moves across the island, and resource transfers animate on the board. Reduced-motion preferences shorten motion. An SVG chart preserves legal move selection when WebGL is unavailable.

## Architecture

| Location | Responsibility |
| --- | --- |
| `settlersx.js` | Independent module identity, original options, decks and rule composition; new artwork references. |
| `lib/src/` | Copied Settlers rule, queue, state and player-action modules. |
| `lib/settlersx-integration.js` | Presentation adapter connecting the original legal selectors and events to the new interface and map. |
| `web/js/geometry.js` | Canonical 19 hexes, 54 junctions and 72 edges matching `GameHexGrid` IDs. |
| `web/js/scene.js` | Three.js terrain, ports, pieces, legal targets, camera controls, effects and SVG fallback. |
| `web/js/ui.js` | Responsive expedition layout, roster, hand, action controls and logbook. |
| `lib/ui/overlays/`, `web/overlay.css` | Original overlay interactions with new SVG cards, layout and styling. |
| `web/img/` | 45 original SVG illustrations, manifest and reproducible Python source generator. |
| `web/js/vendor/` | Locally vendored Three.js r159 and jQuery; Three.js license included. |
| `web/js/preview*.js`, `tools/serve.cjs` | Local hotseat framework, transport and development server. |

The renderer displays state and forwards canonical selections; the copied game logic decides legality and changes state. Three.js geometry supplies actual depth and animation; SVG supplies illustrated resources, cards, portraits, icons, cover artwork and decorative elements. The interface uses local system fonts.

Development scripts use `.cjs`, and `package.json` explicitly maps each to `false` for browser builds. Saito discovers modules through an extensionless dynamic `require`, so the browser mappings are necessary even with the `.cjs` extension. Add a mapping when adding a Node-only script under this folder.

Artwork experiments and their prompts live in `tests/mods/settlersx/art-tests`, outside the module directory so browser discovery cannot include them in the client bundle.

## Verification

Run rule parity and geometry checks from the repository root:

```sh
node mods/settlersx/tests/parity.cjs
node mods/settlersx/tests/geometry.cjs
node mods/settlersx/tests/build.cjs
```

The parity checks compare the actual Settlers and SettlersX modules, including two-player initialization, resource distributions, prices, trading, production, robber protection, awards, scoring and representative queue commands. Geometry checks compare canonical board IDs and adjacency against the existing `GameHexGrid`.

The isolated build check captures the repository's production webpack configuration and compiles this module with the same loaders, aliases, externals and dynamic directory discovery. It resolves source TypeScript directly, disables minification and writes its bundle and diagnostics only to a temporary directory. It parses the emitted JavaScript and verifies every Node-only script is ignored by browser discovery. The check passes with a shared `asn1.js` dependency warning about an unavailable optional `vm` module; it does not register or rebuild the full deployed application.

Browser checks use Playwright with Chromium. They automatically detect this repository's existing `tests/mods/conquest/.tools` installation. An external installation can instead be selected using `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_BROWSERS_PATH`.

```sh
node mods/settlersx/tests/scene-browser.cjs
# Start tools/serve.cjs in another terminal before this integration check:
node mods/settlersx/tests/browser.cjs
node mods/settlersx/tests/flows.cjs
```

`SETTLERSX_URL` overrides the default preview URL. The scene check covers WebGL rendering, real raycast selection, rotation, construction, robber/resource animation, resizing, disposal and the SVG fallback. The integration checks cover setup, turns, rolls, legal construction, confirmations, accepted player trades, bank exchanges, development cards, discards, the robber, overlays, mobile layout and two-player setup. Set `SETTLERSX_SCREENSHOTS=1` to save optional integration screenshots to `/tmp/settlersx-*.png`.

SVG XML can be checked without dependencies:

```sh
python3 -c "import pathlib,xml.etree.ElementTree as E; files=list(pathlib.Path('mods/settlersx/web/img').rglob('*.svg')); [E.parse(p) for p in files]; print(len(files), 'valid SVGs')"
```

## Register in Saito

Add `settlersx/settlersx.js` to the deployment's usual module configuration, then rebuild and restart using that deployment's normal Saito workflow. The module is named **SettlersX** and uses the `/settlersx` asset route. Registering this edition does not require replacing Settlers. The preview server is only a development harness.

**A real multi-wallet network session has not yet been verified.** Local parity and browser checks do not exercise encrypted deck distribution, network synchronization, reconnects or saved multiplayer game recovery. Those need a full Saito session before treating the edition as production-validated.
