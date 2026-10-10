# gm badge — a Saito module

Say **gm** in Red Square once a day. Earn a badge NFT that grows with your streak.
Nobody can buy it. Anyone can verify it.

## What it does

- **Indexes** every Red Square post on-chain and records one gm per public key per UTC day.
- **Mints** a `gm` NFT (quantity 1, 1 SAITO deposit so ATR keeps it alive) to a holder on their first gm. Serial numbers are sequential, so early is low.
- **Computes** streaks: Sprout (1), Green Check (7), Gold Ring (30), Diamond (100), Flame (365). Miss a day and the badge cracks for 24h, then restarts. Lifetime gms never reset.
- **Decorates** every `.saito-user` username across Red Square, Chat, Arcade, and profiles with the holder's live badge.
- **Serves** streak state to browsers over the `gmbadge` peer service and as JSON/SVG over HTTP.

## Layout

```
gmbadge.js                 module main (indexer, issuer, peer + HTTP API, browser glue)
lib/streaks.js             pure streak rules (tested)
lib/badge-svg.js           pure SVG renderer (tested)
lib/ui/badge-decorator.js  MutationObserver that draws badges next to usernames
lib/ui/gmbadge-main.js     the /gmbadge page
sql/*.sql                  gms, streaks, milestones tables (SQLite on the node)
web/                       index.html + css (compiled into /gmbadge/style.css)
../tests/gmbadge/streaks.test.js   node --test (kept outside the module so webpack never sees it)
```

## Install into a Saito node

```bash
# from saito/node
# link or copy this folder to mods/gmbadge, then register it:
#   config/modules.config.js -> add 'gmbadge/gmbadge.js' to both core and lite
bash scripts/compile nuke      # or: npm run nuke
npm run dev
# open http://localhost:12101/gmbadge
```

The node's wallet is the badge issuer. Fund it with SAITO (1 SAITO per badge plus fees).
Settings live in `config/options.conf` under `"gmbadge": { "mint": true, "deposit_saito": 1 }`.

## HTTP API

- `GET /gmbadge/api/streak/:publickey` returns `{ today, state, view }`
- `GET /gmbadge/api/leaderboard?limit=100`
- `GET /gmbadge/api/badge/:publickey.svg?size=256`

## Peer API (handlePeerTransaction)

- `gmbadge: streak` with `{ publickey }`
- `gmbadge: states` (top 2000, used by the decorator)
- `gmbadge: leaderboard` with `{ limit }`

## Rules of the game

- A post counts if, after stripping leading emoji/punctuation, it starts with `gm` as a word. `GM`, `gm fam`, `gm ☀️` count. `gmgm`, `good morning` do not.
- Days are UTC. One gm per day.
- Blocks are processed in order; a gm that arrives for an older day than the last recorded one is ignored.
