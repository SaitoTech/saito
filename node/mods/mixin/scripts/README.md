# Legacy Mixin database migration

This copies Mixin account credentials and deposit addresses from the legacy Mixin and BuySaito databases, plus the server options file, into a new Mixin database. It does not import purchases, payouts, or migration history.

From the repository root:

```sh
node node/mods/mixin/scripts/migrate-legacy-databases.js
```

Put these files in `node/mods/mixin/scripts/old/` before running:

| File | Source on the server |
|---|---|
| `options` | `node/config/options` |
| `mixin.sq3` | `node/data/mixin.sq3` |
| `buysaito.sq3` | `node/data/buysaito.sq3` |
| `migration.sq3` | `node/data/migration.sq3` |

The script writes `node/mods/mixin/scripts/mixin.sq3`. It does not modify the files in `old/`. If the output file already exists, the script stops until you pass `--overwrite`.

If `options.wallet.privateKey` is encrypted, set `SAITO_PASS` to the password used to encrypt it:

```sh
SAITO_PASS='…' node node/mods/mixin/scripts/migrate-legacy-databases.js
```

Optional paths:

```sh
node node/mods/mixin/scripts/migrate-legacy-databases.js \
  --input /path/to/backups \
  --output /path/to/mixin.sq3 \
  --overwrite
```

Install the result as `node/data/mixin.sq3` only after the script prints `Validation: passed`. Keep the existing `config/options` file. The application key and the primary Mixin user in that file are not rewritten.

The Migration database is opened to confirm it does not hide a credential table. Its payment rows are not copied. BuySaito purchase rows are read only to recover a deposit address and the Mixin user that owns it. Purchase status and payout bytes are not copied.
