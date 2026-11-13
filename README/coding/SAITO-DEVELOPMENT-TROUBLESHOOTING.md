# Saito Development — Troubleshooting

## Lite-client build cannot resolve a framework import

Webpack reports that a relative framework import cannot be resolved, from a path that contains the module name twice:

```text
Can't resolve '../../../../../lib/saito/ui/saito-overlay/saito-overlay'
in 'node/dist/bundler/default/mods/redemption/redemption/lib/ui/overlays'
```

The lookup then ends under `dist/bundler/default/mods/lib/...`, which is not where the framework lives.

The import is already the one used by other modules. From `mods/<module>/lib/ui/overlays/`, five `../` segments reach the directory that contains both `mods/` and `lib/`. In the source tree that directory is `node/`. In the lite-client bundle it is `dist/bundler/default/`, where `scripts/compile` has copied `node/lib`. Vault, Store, and Saito Sign use this same import:

```javascript
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
```

Do not add another `../` to compensate. That would break the copy that sits at the normal depth, `mods/<module>/lib/ui/overlays/`.

The extra directory is created by the lite-module copy. `scripts/compile` reads every entry in the `lite` list of `node/config/modules.config.js` and runs:

```bash
cp -rf mods/<module> dist/bundler/default/mods/<module>
```

The first copy creates `dist/bundler/default/mods/<module>/`. If that module name appears again in the `lite` list, the destination already exists, and `cp` places a second copy inside it:

```text
dist/bundler/default/mods/<module>/<module>/lib/ui/overlays/
```

Webpack builds that nested copy. Five `../` segments now stop at `mods/` instead of `dist/bundler/default/`, so `lib/saito/...` does not resolve.

Keep one `lite` entry per module, in the same way as the other modules. A repeated `core` entry does not create this nested copy, because only the `lite` list is copied into the bundler, but it should not be repeated either. The next `npm run compile` clears `dist/bundler` before copying, so removing the duplicate entry is sufficient. The nested directory does not need to be deleted by hand.
