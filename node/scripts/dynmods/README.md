DYNAMIC MODULE COMPILATION:

1.

node compile.js

This generates .zip files for each module and places them in /dist/mods/zip

It then compiles the modules into /dist/mods/saito/*.saito dynamic mods

To zip and compile only one directory under `mods/`, run from the node project:

```bash
npm run .saito -- limbo
```

This compiles only `mods/limbo/`, even if other ZIPs already exist in
`dist/mods/zip/`. The output is `dist/mods/saito/<slug>.saito`, using the module's
metadata slug. With no argument, `npm run .saito` compiles all modules as before.

---

## zipmods.sh

This zips the modules and copies them into /dist/mods/zip. It is run by compile.js
Pass a directory name to zip only that module: `bash scripts/dynmods/zipmods.sh limbo`.
ZIP creation uses the project's `archiver` npm dependency; no system `zip` command is required.

## dyn-mod-compile.sh

**dyn-mod-compile.sh** lives in this directory and performs the low-level steps: run webpack for a single entry point, then base64 the bundle into `dist/dyn_mod.js`. It uses `SCRIPT_DIR`/`PROJECT_DIR` so it works from any working directory. The main **compile.js** pipeline does the equivalent in Node (webpack + base64) and does not invoke this script; the script is available for standalone or scripted use. Expects the module to be extracted at `dist/` (so entry lives at `dist/<slug>/<entry>.js`) and takes the entry path as argument (e.g. `bash scripts/dynmods/dyn-mod-compile.sh arcade/arcade.js`).

## Optional npm script

You can add to `package.json` scripts:

```json
"dynmod-compile": "node scripts/dynmods/compile.js"
```

Then run: `npm run dynmod-compile`.
