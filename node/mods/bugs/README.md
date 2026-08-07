# Bugs

Bugs is a node-curated workflow projection over RedSquare threads. RedSquare owns every report body, image, reply, thread relationship, and ordinary discussion notification. Bugs owns only signed tracker metadata and the SQL projection derived from accepted metadata transactions.

## Transactions

Create/track:

```json
{
  "module": "Bugs",
  "request": "create bug",
  "data": {
    "bug_id": "<root RedSquare signature>",
    "root_tx_sig": "<root RedSquare signature>",
    "source_tx_sig": "<selected RedSquare signature>",
    "title": "Broken submit button",
    "status": "open",
    "severity": "medium",
    "priority": "normal",
    "weight": 100,
    "reporter_publickey": "<public key or empty>",
    "assignee_publickey": "<public key or empty>",
    "note_tx_sig": "<optional RedSquare reply signature>",
    "previous_metadata_tx_sig": "<latest event when re-tracking an existing bug>"
  }
}
```

Update:

```json
{
  "module": "Bugs",
  "request": "update bug",
  "data": {
    "bug_id": "<root RedSquare signature>",
    "action": "set-status",
    "status": "in_progress",
    "previous_metadata_tx_sig": "<latest metadata signature observed by the signer>"
  }
}
```

Supported actions are `set-title`, `set-status`, `set-severity`, `set-priority`, `set-weight`, `set-assignee`, `untrack`, and `retrack`. Unassigning uses an empty assignee. Reopening uses `set-status: open`. Every mutation is created and signed before optimistic processing.

After a status mutation is delivered, Bugs publishes its display label, such as `status -> In Progress`, as a RedSquare reply in the bug thread.

Supported statuses are `open`, `in_progress`, `needs_information`, `ready_to_deploy`, and `completed`.

## Delivery and projection

The same signed transaction is processed optimistically, serialized inside a `bugs transaction` peer request for low-latency delivery, and propagated normally on-chain. The peer envelope is transport only. Its inner signature is verified before processing. `bug_events.tx_sig` makes local, peer, chain, and archive delivery idempotent.

`sql/bugs.sql` creates:

- `bugs`, containing workflow metadata and derived list fields only;
- `bug_events`, containing the accepted event ledger and confirmation/order fields.

No RedSquare text, image, or reply body is stored. Reply count and last activity are disposable projection data. Bugs events are also saved in the normal Archive module with `field1 = Bugs`; startup replay can rebuild the projection in bounded, paged batches.

## Authority policy

All checks flow through `lib/policy.js`. A node accepts creation from a configured maintainer, administrator, or allowed adder. Unless `require_maintainer_for_add` is true, open creation is allowed. Updates and re-tracking are accepted from the key that added the bug, a maintainer/administrator, or the verified RedSquare reporter. Reporter authority is granted only when RedSquare's capability resolves the source transaction and confirms its author.

Node-local options:

```json
{
  "bugs": {
    "enabled": true,
    "administrator_publickey": "<optional key>",
    "maintainers": [],
    "allowed_adders": [],
    "require_maintainer_for_add": false
  }
}
```

These are curation policy, not global consensus. The UI hides controls when its current view clearly lacks authority; the handler independently enforces the policy. On a service node, its module public key is the default administrator when no explicit administrator is configured. Browser wallets are never implicitly treated as node administrators.

## Conflict policy

Exact signatures are processed once. A later confirmed event is ordered by block ID, transaction ordinal, then signature. A signed provisional update can advance a confirmed or provisional state only when its `previous_metadata_tx_sig` names the current event. A chained provisional event whose predecessor has not arrived is held in a bounded 2,000-event queue and retried after accepted mutations; normal confirmed delivery still resolves it if the predecessor never arrives directly. Legacy provisional events without a predecessor use transaction time and signature only against other provisional events. Confirmation of the same event reconciles its block metadata without applying its mutation twice. Client timestamps are never the sole ordering authority for confirmed conflicts.

## Activation and retention

`/bugs` is always served. First render writes `app.options.bugs.enabled = true` with `saveOptions()`, after which the header and RedSquare extension responses become available. Completed rows remain queryable; `listPrunable()` marks metadata eligible after 183 days. Bugs does not delete RedSquare content or operate a separate archive.

## RedSquare boundary

All callable RedSquare behavior is obtained through `respondTo("redsquare-api")`. Bugs also responds to the existing `redsquare-create` hook and the proposed `redsquare-tweet-menu` hook. The upstream hooks still required by the current RedSquare implementation are specified in [docs/todo.md](docs/todo.md).

## Tests

Run the focused suite from the repository root:

```sh
npx jest --config mods/bugs/jest.config.cjs --runInBand
```
