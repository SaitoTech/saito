# Explorer chain and fork viewer

Open `/explorer/chain` for recent blocks, or `/explorer/chain/<hash-or-height>`
to center on a block. Block detail pages have a **View chain and forks** link.
An exact hash selects that fork, while a height prefers the known canonical block.

Heights increase left to right. Drag right to move into older history; drag
vertically to inspect additional fork lanes. Scroll or use the buttons to zoom.
The canvas supports arrow keys, and the expandable block list provides keyboard
selection and a fallback when WebGL is unavailable. Selecting a cube shows its
metadata, an Explorer link and a **Follow parent** action.

The compact circular two-line navigation button at the right of the search row
opens **Chain & forks**, **Token Supply**, and **Holders & UTXO Set**.

## Running without a backfill

Install dependencies and compile from `node/` using the normal deployment flow:

```sh
npm ci
npm run compile -- dev
```

Use the normal production compile mode for a production build. Deploy the
generated JavaScript chunks alongside `saito.js`: Three.js loads on demand.
Restart the server to load the updated Explorer module. No chain reset, wallet
reset, manual migration, or initial archive scan is required.

Explorer creates `explorer_chain_blocks` and `explorer_chain_files` in its existing
`explorer.sq3` database on initialization, including on existing installations.
It records new blocks and reorganization events independently of the financial
statistics and address indexes.

The `request chain` peer request reads at most 50 consecutive heights. It loads
known hashes from Core, reads missing metadata from full block files, and retains
the result. Each initial range request also advances a shared local disk scan by
at most 64 files or roughly 150 ms of work (individual I/O can take longer).
Requests for the same range share work; at most two distinct ranges run at once.
There is no automatic full startup scan. Discovery progresses while the viewer
is used, and file size/mtime checkpoints prevent unchanged files being parsed
again after restart. A completed scan can restart after 60 seconds to discover
files copied into the local block directory.

The viewer indicates incomplete discovery: a returned height can acquire more
forks as disk scanning advances. It refreshes every two seconds during discovery
and every fifteen seconds otherwise, without moving the user's position. Gaps
mean no blocks are currently known there, not proof that a block never existed.
All sizes are full serialized bytes, not JSON response sizes. Header-only files
retain unknown transaction counts and sizes rather than reporting misleading zeros.

Responses contain up to 500 block records, with an explicit `(after_height,
after_hash)` continuation. Clients must finish those continuations before
considering the requested range loaded. This includes every sibling at a height.
The API strips server file paths from metadata responses.

## Backfilling an archive

Build a standalone SQLite index without loading a wallet or starting a node:

```sh
node mods/explorer/scripts/index-blocks.js \
  --source /path/to/archive \
  --database /path/to/archive-chain.sq3 \
  --recursive
```

The source is read-only. The scanner streams directory entries, reads only the
389-byte header plus file metadata, and commits every 100 files. Re-run the same
command to resume; unchanged files are skipped. Symlinks are not followed.
Malformed or incompatible blocks are logged and skipped; exit code 2 indicates
such failures, while exit code 1 indicates a command or database failure.

Merge into the Explorer database on the serving node:

```sh
node mods/explorer/scripts/index-blocks.js \
  --merge /path/to/archive-chain.sq3 \
  --database data/explorer.sq3
```

Merge deduplicates by hash, preserves existing canonical status, and does not
touch financial statistics, addresses, chain files or wallet state. SQLite
serializes writes with the running server; a very large merge is best run during
a maintenance window. You can also scan directly into `data/explorer.sq3` using
`--source` and `--database` if the archive is already mounted on that server.

Archive records contain absolute file locations. For full historical transaction
retrieval, keep those locations accessible on the serving node, or re-run the
scanner there with the correct source path. The chain visualization remains
available when only metadata is retained. Block details fall back to retained
metadata when the full body has been removed.

## Meaning and limits of the index

- This is the serving node's observed block graph, not a census of every network
  fork. Files already deleted without an archive cannot be reconstructed.
- Archive files do not prove current canonical membership. Imported rows start
  with unknown status. Core observations and reorganization events supply
  authoritative local status; browsing backward propagates known canonical
  ancestry through connected indexed parents within the requested window.
- A side branch label does not assert that the block passed full consensus
  validation. The scanner checks the header-derived hash against the filename;
  it does not validate signatures or transaction bodies.
- The scanner supports the current 389-byte Saito block header in files named
  `<timestamp>-<hash>.sai` or `.blk`. Older binary formats need a separate decoder
  and are not silently guessed. Heights/timestamps must fit safe JS integers.
- File availability is last observed. A failed full-block load marks its body
  unavailable while retaining graph metadata. Core's normal pruning is unchanged.

## Styling

Explorer uses shared Saito theme variables directly for surfaces, text, controls,
borders, fonts and shadows. The header uses the shared Saito appearance.
Explorer retains its compact layout, blue links, JSON and financial data colors,
supply accounting highlights, and chain/fork colors.

Edit source styles in `web/css/`; `web/style.css` is generated by compilation.

## Verification

```sh
npm test -- --runInBand --runTestsByPath tests/mods/explorer/chain-index.spec.js
```

The suite uses temporary SQLite databases and block fixtures to cover cold disk
discovery, sibling pagination, bounded/resumable scanning, reorganization status,
missing bodies, malformed headers, and archive CLI import/merge.
