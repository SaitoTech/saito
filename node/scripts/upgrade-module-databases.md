# Core module database upgrade

Run from `node/` on the `saitocore_peer_refactor` checkout (or a deployment containing
its SQL definitions):

```sh
npm run upgrade-module-databases -- --dry-run
# Stop the Saito node before applying:
npm run upgrade-module-databases
```

To select a deployment's configuration and database directory:

```sh
node scripts/upgrade-module-databases.js --config config/modules.config.js --data-dir /path/to/data
```

The script reads the active entries in **core** from the supplied config, resolves
each module's `dbname`/slug, and loads its SQL files in installation order. Modules
with `shortlinks_enabled` also receive the shared shortlinks schema. No module is
instantiated and no server is started. It uses the existing `sqlite`/`sqlite3`
Node dependencies; SQLite needs a driver to conditionally append missing columns.
Git is only needed for the historical-schema tests, not for running the upgrade.

Missing databases, tables and indexes are created. Missing columns are appended
by name, regardless of their original position. Extra columns/tables/indexes are
retained. Column positions and stored CREATE TABLE formatting do not cause repeat
upgrades. An already upgraded database is left untouched, without another backup.

Existing databases that need changes receive a `.sq3.backup-<timestamp>-<uuid>`
SQLite snapshot beside the original, including committed WAL data. Each database
upgrade runs in a transaction and validates the resulting schema, foreign keys
and SQLite quick check before committing. A failed upgrade rolls back that
database and exits nonzero; other module databases may have upgraded successfully.
Keep the node stopped until failures have been resolved. To restore a snapshot,
stop all users of that database and restore it as the corresponding `.sq3` file,
with no stale WAL/SHM sidecars from the replaced database.

`--dry-run` opens existing databases read-only and prints proposed changes. It
does not create missing directories, databases or backups. It checks schema
compatibility; data-dependent failures (such as duplicate values preventing a
unique index) are detected during application and rolled back. Unexpected column
types, CHECK constraints and other incompatible definitions are reported for
manual migration; the script does not invent values for missing required fields.

## Branch comparison

Reviewed all SQL files between local `staging` at `81d327fe1f67` and
`saitocore_peer_refactor` at `d41164543d49`. Target definitions are read from the
checkout at execution time. The current config selects 18 databases:

| Database                                                               | Upgrade from staging                                                                                                                                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| buysaito                                                               | Append `issuance_tx`, `issuance_at`, `issuance_block_id`, `issuance_block_hash` to `purchases`.                                                                                              |
| migration                                                              | Append `issuance_tx`, `issuance_at`, `announcement_hash`; expand `auto_migration.status` CHECK to allow `awaiting_mixin`.                                                                    |
| bugs                                                                   | Create `bugs`, `bug_events` and their indexes.                                                                                                                                               |
| explorer                                                               | Create `addresses`, `blocks` and their indexes; append missing columns on existing tables.                                                                                                   |
| faucet                                                                 | Create `registrations`, `activity` and their indexes.                                                                                                                                        |
| store                                                                  | Create `listings`, `orders`, `summary` and their indexes. Include runtime `in_flight` and `reserved_order_id` fields; preserve legacy crypto/chain values when appending their replacements. |
| arcade, redsquare, stack, videocall                                    | Create shared `shortlinks` table and indexes in each database.                                                                                                                               |
| archive, graffiti, league, library, memento, mixin, recovery, registry | Definitions unchanged; repair missing tables, appendable columns and indexes if needed.                                                                                                      |

The Migration CHECK change requires rebuilding `auto_migration`. The script
changes only the recognized staging CHECK in the existing table definition,
copies values within SQLite without JavaScript numeric conversion, and preserves
extra columns, indexes, triggers, views and the autoincrement high-water mark.
All of this happens in the same transaction as its missing-column additions.

Removed `assetstore` and `diddy` SQL definitions, and inactive `warehouse` and
`warehousex`, are outside this config's scope. Existing databases for those modules
are retained. This script does not convert AssetStore listings to Store records or
remove legacy Faucet tables. Store's transient legacy `payment_*` columns are not
created on fresh databases; the current canonical crypto column names are used.

## Verification

```sh
node --test scripts/tests/upgrade-module-databases.test.js
```

Tests build historical databases from the local `staging` Git ref in temporary
directories, upgrade every active core schema, and verify a second run makes no
changes. Additional cases cover partial/out-of-order upgrades, data and large
integer preservation, Migration dependent objects and sequence preservation,
legacy Store fields, rollback on unique-index failure, config filtering and
read-only dry runs. They do not write to the deployment's `data/` directory.
