# Terminators (Run Sarah Run)

A one-player Saito Arcade game inspired by [GNOME Robots](https://help.gnome.org/gnome-robots/index.html) and its UNIX predecessor, [BSD robots](https://manpages.debian.org/testing/bsdgames/robots.6.en.html). The sources describe eight-direction evasion, pursuing robots, collisions, persistent junk heaps and teleportation. BSD awards 10 points per destroyed robot. This implementation uses that baseline with the scoring changes below; it does not reproduce GNOME's fast robots or BSD's automatic wait bonus.

## Play and scoring

You control Sarah Connor on a 25 × 19 board. Each accepted turn moves every Terminator one square toward Sarah, including diagonally. Two or more Terminators arriving at the same square become one fire. Fires remain for the wave and destroy incoming Terminators.

- Each step, including a diagonal, costs **1 point**. Teleports also cost 1.
- Holding position advances one turn and costs **nothing**.
- Each destroyed Terminator earns **10 points**. Scores can be negative.
- Clear a wave while surviving with **3 fires: +10**, **2 fires: +20**, **1 fire: +50**. Other fire counts earn no bonus. Award exactly one bonus, once per wave.
- A Terminator reaching Sarah kills her, even if another Terminator collides there simultaneously. No survival bonus is awarded on death.
- Walking off the board or into an existing fire or Terminator is rejected without spending points or advancing the turn. Otherwise unsafe moves are allowed.
- Start with 10 Terminators, adding 5 each wave to a maximum of 100. Sarah starts clear of nearby Terminators. Fires reset between waves.
- Each safe teleport costs **1 native SAITO plus the wallet network fee**, paid to **i767FqhGcKPzqi7KcWNA8TQoTZeBd8QbWd2mTKNnkfmk**. There is no free allowance, including in older saved games. Unlimited risky teleports have no SAITO charge and can result in immediate death. Both teleports still cost one score point.

Use **QWE / ASD / ZXC**, the numeric keypad, or the onscreen nine-button pad. Arrow keys move in four directions; Home/Page Up/End/Page Down provide diagonals. **S / Space / period / numpad 5** holds; **F** purchases a safe teleport; **T / 0 / numpad 0** risks a teleport (numpad 0 also works with Num Lock off). Click an adjacent board square to step there. Each press or tap advances at most one turn: keyboard auto-repeat is ignored. There is no automatic wait-until-death command.

Use **Next Wave**, **Enter**, or **Space** after a clear, **Try Again** after capture, and **New Run** to abandon a run with confirmation. After any fatal turn, the final board stays visible for two seconds after rendering before the termination overlay appears. Board state, dice, score and wave save through Saito's game persistence. The gameplay high score is saved locally. Leaderboard points use a separate wave-clear total, described below.

## Leaderboard

Defeating wave 1 earns **1 leaderboard point**, wave 2 earns **2**, wave 3 earns **4**, then **8**, and so on. These accumulate within each run: **1, 3, 7, 15…**. The public leaderboard uses Saito's **HSC** ranking, keeping the best single-run total. Gameplay score, movement penalties, and burn bonuses remain separate. Dying, holding, teleporting, or pressing Next Wave do not by themselves earn leaderboard points.

The status panel shows the current run, the locally saved best, and the rank from the available League player list. VIEW LEADERBOARD opens the standard Saito League overlay. Remote ranking updates after result transactions confirm and League refreshes its data.

Each surviving wave clear signs and broadcasts a standard `Robots` / `roundover` result transaction with the cumulative numeric score and a level checkpoint, using the wallet's default network fee. `lib/level-saves.js` retains the result for retry instead of queuing a second `ROUNDOVER` transaction. A wave cannot award twice, and loading an old saved game infers its cleared-wave total without replaying historical results. The League number format uses JavaScript numbers, so totals saturate at `Number.MAX_SAFE_INTEGER` after 53 cleared waves.

**Server requirement:** installing a `.saito` NFT installs Robots in the browser only. The League service must also have a Robots league registered on its server to process `Robots` result transactions. A browser-only install cannot create or migrate that server league. Deploying Robots in the server module list and restarting registers its default league; verify that its game is `Robots`, its ID is the hash of `Terminator`, and its ranking algorithm is `HSC`. Payments and result transactions can reach the chain even when no server leaderboard processes them. Monitor transaction messages by module `Robots` (the displayed game name is Terminator), with requests `safe-teleport` and `roundover`.

On module initialization, an existing default Terminator league is migrated from EXP to HSC while preserving player records. The code lives entirely in this module; because League's public metadata API cannot persist algorithm changes, the module performs one narrowly scoped update to its default league row through Saito storage on the server. Restart the server after deploying this version so existing league metadata is migrated. Private leagues are untouched. Scores remain client-reported, as with other local one-player games; this is not anti-cheat verification.

## Level checkpoints and resume

Every surviving level completion records the cleared board, wave, score, leaderboard points, session statistics and game dice seed in the result transaction's `checkpoint` field (version 1). The checkpoint is captured before advancing to the next wave. Ordinary turns still save locally through the game framework. No payment receipt is published or restored with a checkpoint, so restoring cannot resurrect a previously spent safe jump.

Open **Game → Resume Saved Level** to resume from the latest available checkpoint, then select **Next Wave**. Restoring requires confirmation before replacing the current board and retains the active Arcade game ID and any currently unused paid jump. Loading a checkpoint neither republishes its result nor earns its level points again. Existing local saves continue to resume normally; an arriving remote checkpoint never overwrites active play automatically.

Results are saved in wallet preferences before submission and retained until block confirmation. **Game → Retry Level Sync**, application startup, and Archive reconnection retry pending results. Once signed, retries use the identical transaction, including after reload. Creation or submission failure reports that the save is local and keeps the checkpoint for retry. Submission alone is not confirmation.

Signed checkpoints are archived locally and sent to discovered Archive services using `app.storage`. The same wallet can recover an archived checkpoint after losing its local game save; retrieval checks both the wallet signature and checkpoint structure. Cross-device recovery needs the same wallet key and an Archive peer retaining the transaction. On-chain inclusion alone does not guarantee permanent Archive availability. Checkpoint state is public transaction data.

## Paid teleports and chain activity

The board scales down with viewport height to roughly 300 pixels tall (400 pixels wide), or the available width on narrower phones. Below that size the page scrolls instead of shrinking the cells further.

Normal turns are local. Standard Arcade launch publishes an acceptance transaction; exiting uses the game framework's game-over transaction. Each cleared wave also publishes a leaderboard result. Each purchased safe teleport adds a native SAITO payment transaction with a `Robots` / `safe-teleport` message and the game ID. No ERC-20 or other selected wallet currency is used.

Before payment, the game checks for a safe landing and sufficient native SAITO for the price plus network fee. If funds are insufficient, it opens the standard **Get SAITO** overlay through `saito-purchase-launch`; returning to the game and pressing F tries again. No payment is created by opening that flow.

The payment message shows the amount, fee, and recipient. **Don't show this again** is saved only when the player confirms payment, using the game preference `Robots_skip_teleport_prompt`. Future F presses still check funds, but pay without reopening that message.

The signed transaction is saved with the game before submission. As soon as submission returns successfully, the game consumes the receipt and performs exactly one safe jump, without waiting for block confirmation. Later confirmations cannot cause another jump. A zero-value output to the player ensures they receive the SPV confirmation even when there is no change.

If submission fails or its result is uncertain, F retries the same signed transaction without another charge, and ordinary turns remain available. Reloading preserves any unused receipt. A later confirmation can make that receipt redeemable with F, but does not unexpectedly move Sarah. New runs retain unused receipts. If no safe landing exists when redeeming one, the receipt stays available. Canceling the message or having no safe landing sends no payment.

This is a local single-player game, not a server-enforced paid service or verified score system. Its payment gate can be bypassed by modifying client code or saved state. A jump is accepted on submission even if the transaction is never included in a block; the game does not undo jumps on rejection or chain reorganization. Validation uses fake wallets/confirmations; no live funds are spent by tests.

## Install and test

From `node/`:

```sh
npm run .saito -- robots
```

This produces **`dist/mods/saito/robots.saito`**. Import that file with Saito's application installer, then open the Arcade and select **Terminator**. The unsigned package can be built noninteractively; the compiler also supports entering a signing key at its interactive prompt. Publication is a separate operation.

For inclusion in a normal node/browser distribution, add `'robots/robots.js'` to the appropriate `core` and `lite` lists in your local `config/modules.config.js`, then run `npm run compile -- dev` and start/restart the development server. Launch a game from the Arcade before visiting `/robots`. This module does not change your local module selection or wallet/chain configuration.

```sh
npm test -- --runInBand --runTestsByPath tests/mods/robots/robots-game.spec.js tests/mods/robots/metadata.spec.js tests/mods/robots/teleport-payments.spec.js tests/mods/robots/leaderboard.spec.js tests/mods/robots/level-saves.spec.js
node --test tests/mods/robots/level-saves-transaction.cjs
node tests/mods/robots/browser-smoke.cjs
```

The browser smoke test requires Playwright with Chromium, and a freshly compiled `.saito` package. `PLAYWRIGHT_MODULE` can point to an existing Playwright installation. It executes the packaged game with the real Saito queue, save functions, HUD and player box in an isolated browser host. Wallet/network services and page bootstrapping are test fixtures. This is not a test of the live Arcade invitation flow or application installer. Screenshots are written to `/tmp/robots-desktop.png` and `/tmp/robots-mobile.png`.

The full application build scans module directories beyond the files explicitly imported by `robots.js`. Keep standalone SVG exports and font-building tools under `docs/`; raw SVG/Python at the module root or under `build/` will be parsed as JavaScript and break that build. Module-entry-only compilation does not detect this.

## Saito integration

- `robots.js`: `OnePlayerGameTemplate`, metadata, game initialization, queue commands, HTML shell and Arcade image hooks.
- `lib/level-saves.js`: signed level-result checkpoints, retry, Archive retrieval, signature validation and explicit restore.
- `lib/robots-game.js`: simultaneous pursuit/collisions and scoring; JSON-compatible state at `game.state.run`; randomness injected from `rollDice`.
- `lib/ui/main.js` and `.template.js`: board rendering and input. Reuses `GameHUD2`, `GamePlayerbox`, `GameMenu` and `SaitoOverlay`.
- `lib/ui/styles.js`: scoped CSS bundled as JavaScript to support server-independent installation.
- `lib/art.js`: original SVG sprites, 5×7 lettering, cover, background and icon.
- `lib/pixel-font.js`: embedded WOFF2 made from the same original glyphs.

The inherited single-player `endTurn()` runs moves locally; every action is a `robots` queue command above the persistent `robots-play` input marker. Level checkpoints extend the standard `roundover` message; no new peer service, database or server asset route is needed.

## Artwork and asset delivery

All artwork is SVG. `returnImage()` and `returnBanner()` return SVG data URLs, and the game renders inline SVG. CSS and the original pixel font are embedded in the client bundle. No Robots-specific images, fonts, stylesheets or sounds are fetched from the node. The surrounding Saito runtime still loads its normal shared assets.

The standard game HTML shell is reused with its `/robots/style.css` link removed and conventional cover paths replaced by data URLs. External social-card crawlers may not display data-URL artwork; the embedded images are intended for Arcade and the application installer.

The `.saito` metadata reader has a small extension to accept `arcade.svg` or `saito_icon.svg`, preferring SVG when JPEG is also present. Robots keeps `arcade.svg` under `docs/art/`: the full browser build excludes `docs/`, while the ZIP builder preserves it for metadata extraction. The generated `docs/art/background.svg` and `docs/art/icon.svg` are also available as standalone artwork. They are not required or fetched at runtime.

Rebuild the SVG exports after editing `lib/art.js`:

```sh
node mods/robots/docs/build/art.js
```

To rebuild the font after changing the glyphs, use a Python environment with `fonttools` and `brotli`, then run:

```sh
python mods/robots/docs/build/font.py
```

Runtime compilation needs neither Python nor external font/image services. The artwork is an original pixel interpretation, not extracted movie or game assets. This is an unofficial fan game.
