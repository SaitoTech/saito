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

To deploy existing packages using `scripts/dynmods/deploy.sh`:

```bash
npm run .saito -- --deploy
```

The `--` separator is required so npm forwards `--deploy` to the script;
`npm run .saito --deploy` is rejected by npm 12 as an unknown npm flag.
Deployment uploads `dist/mods/saito/` to `mods.saito.io` and refreshes the remote
module metadata. It skips compilation and signing. The existing
`npm run .saito -- deploy` form also works.

The application message in each `.saito` JSON includes `name`, `gamename`, `slug`,
`description`, `categories`, `publisher_message`, `status`, and `class`, extracted
from literal assignments in the module constructor. Multiline strings and HTML
are preserved. Missing optional fields are empty strings. `version` uses the
module's explicit `this.version` string when nonempty, otherwise it falls back to
the `saito-js` dependency value from the node project's `package.json` (including
any version range prefix, for example `^0.3.3`).

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
