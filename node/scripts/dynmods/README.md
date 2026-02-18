# CLI Dynamic Module Compiler

Compiles zipped Saito modules into `.saito` files without using the browser or DevTools UI.

## Layout

- **Input:** When you run compile, it automatically runs **zipmods.sh** first (if `mods/` has at least one directory), which zips each module into `dist/mods/zip/`. You can also place your own `.zip` files there.
- **Output:** Compiled `${slug}.saito` files are written to `dist/mods/saito/`.

## zipmods.sh

The compile script runs **zipmods.sh** automatically before compiling whenever `mods/` has directories. That script builds one zip per module under `mods/`, writes them to `dist/mods/zip/`, and strips `license`, `build`, `web`, and `.DS_Store` before zipping. You can also run it yourself from the **node** directory (or from **scripts/dynmods** as `bash zipmods.sh`):

```bash
bash scripts/dynmods/zipmods.sh
```

## dyn-mod-compile.sh

**dyn-mod-compile.sh** lives in this directory and performs the low-level steps: run webpack for a single entry point, then base64 the bundle into `dist/dyn_mod.js`. It uses `SCRIPT_DIR`/`PROJECT_DIR` so it works from any working directory. The main **compile.js** pipeline does the equivalent in Node (webpack + base64) and does not invoke this script; the script is available for standalone or scripted use. Expects the module to be extracted at `config/tmp_mod/` and takes the entry path as argument (e.g. `bash scripts/dynmods/dyn-mod-compile.sh arcade/arcade.js`).

## How to run

The script resolves the project root from its own location, so you can run it from **any directory** (e.g. from the **node** repo root or from inside **scripts/dynmods**):

From the **node** directory (project root):

```bash
node scripts/dynmods/compile.js
```

From the **scripts/dynmods** directory:

```bash
node compile.js
```

Paths (`dist/mods/zip/`, `dist/mods/saito/`, webpack config, etc.) are always relative to the **node** repo root, not your current working directory.

Ensure the project is built first so `dist/ts` exists (e.g. `npm run compile` or `npm run nuke`). The script uses the compiled Transaction from `dist/ts/lib/saito/transaction.js` to build the .saito payload.

## Behavior

- Reads each `.zip` in `dist/mods/zip/`.
- Extracts to a temporary folder, runs webpack (same config as DevTools), builds the base64 bundle, then builds the .saito JSON (same format as the browser download).
- On success: writes `${slug}.saito` to `dist/mods/saito/` and prints the path.
- On failure: prints the error and continues to the next zip.
- Cleans up temp and intermediate files after each module.
- At the end prints: `SUCCESS: X` and `FAILED: Y`.

## Optional npm script

You can add to `package.json` scripts:

```json
"dynmod-compile": "node scripts/dynmods/compile.js"
```

Then run: `npm run dynmod-compile`.
