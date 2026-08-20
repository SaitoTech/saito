# About Nettest Log Analysis and Report Production

This is a reusable workflow for analysing Saito nettest logs and browser console exports, then producing reports that are useful for colleagues and GitHub issues.

Use this note when asked to explain what happened in a nettest run, restart/fork reconciliation, browser SPV sync, peer negotiation, lite-block fetch sequence, or callback/peer anomaly.

## Inputs to collect first

Confirm the source log path and the test context before writing conclusions.

Common server-side sources:

```text
/opt/saito/node/scripts/nettest/nodes/<n>/node/saito.log
/root/.pm2/logs/node<n>-out.log
/root/.pm2/logs/node<n>-error.log
/opt/saito/node/scripts/nettest/nettest.log
```

Common browser sources:

```text
/root/*.log
/root/*.loggy
/root/console.log
```

For each report, capture:

- source filename(s);
- file size and line count;
- scenario name, branch, and command sequence if known;
- node count and topology if visible;
- start/end time window if timestamps are available;
- final observed node/block state.

Avoid reading huge logs directly into the chat. Use bounded windows and regex extraction.

## Server-side nettest event patterns

Extract these from PM2/node logs:

```text
startup/restart:
  > saito@
  initializing saito-js
  initializing saito-wasm
  Network Shutdown

peer setup:
  [SAITO PEERS]
  connect_to_peer
  create_network_peer
  ws://.../wsopen
  wss://.../wsopen
  handshake complete

sync negotiation:
  SEND BLOCKCHAIN REQUEST
  BLOCKCHAIN REQUEST
  BLOCKCHAIN RESPONSE
  fetching block from peer
  block data fetched
  serving block : <height>-<hash>

chain state:
  blockchain.add_block "<hash>" with id <height>
  blockchain.add_block_success -- <height>-<hash>
  block : on chain reorg
  previous block ... not found
  onAddBlockSuccess

golden tickets / live extension:
  golden ticket found
  sending mined gt
  onConfirmation

errors/noise:
  callback not found
  cannot find peer from peer_id
  panic
  Traceback
  ERROR
```

## Browser / lite-client event patterns

Extract these from Chrome/Firefox console exports:

```text
startup/config:
  [SAITO OPTIONS]
  [SAITO LITE]
  initializing saito-js
  initializing saito lib
  is spv mode
  last callback block id

peer setup:
  [SAITO CONNECT]
  [SAITO PEERS]
  connectToPeer
  create_network_peer
  handshake complete

lite-block fetch path:
  received block reference for block_id=<n>
  js_fetch_dispatch peer_id=<id> block_id=<n> expected_hash=<hash>
  fetch_block_http_get
  fetch_block_http_response ... status=200 ok=true
  fetch_block_http_bytes ... parsed_header=txs=<n> block_id=<n> ts=<ms>
  js_fetch_completed
  wasm_process_fetched_block

chain state:
  blockchain.add_block
  blockchain.add_block_success
  onAddBlockSuccess
  onConfirmation
  previous block ... not found
  block : on chain reorg

errors/noise:
  callback not found
  cannot find peer from peer_id
  preload warnings
  Chrome [Violation] warnings
  module dependency warnings
```

## Extraction workflow

Use scripts to build structured summaries rather than manually scanning everything.

1. Confirm file metadata:

```bash
stat --printf='%n\nsize=%s bytes\nmodified=%y\n' <log>
wc -l <log>
```

2. Count important patterns.
3. Extract event tables:
   - peer id to URL/public key mappings;
   - block id to hash mappings;
   - fetch responses and byte counts;
   - add/confirmation success lines;
   - errors and surrounding context.
4. For fork/reconciliation tests, build a per-height accepted-hash table for each node.
5. For browser sync tests, compare `expected_hash`, fetched byte header `parsed_header_block_id`, `add_block_success`, and `onConfirmation`.
6. Include raw log lines only when they prove a claim or are needed for a GitHub issue.

Useful Python extraction skeleton:

```python
from pathlib import Path
import re, datetime

p = Path('/path/to/log')
lines = p.read_text(errors='replace').splitlines()

patterns = {
    'handshake': r'handshake complete',
    'fetch_dispatch': r'js_fetch_dispatch',
    'fetch_response_200': r'fetch_block_http_response.*status=200 ok=true',
    'add_block_success': r'blockchain.add_block_success',
    'on_confirmation': r'onConfirmation : block',
    'callback_not_found': r'callback not found',
    'cannot_find_peer': r'cannot find peer from peer_id',
}
counts = {k: sum(1 for line in lines if re.search(rx, line)) for k, rx in patterns.items()}

blocks = []
for i, line in enumerate(lines, 1):
    m = re.search(r'js_fetch_dispatch peer_id=(\d+) block_id=(\d+) expected_hash=([0-9a-f]+).*url=(\S+)', line)
    if m:
        blocks.append({'line': i, 'peer_id': m.group(1), 'height': int(m.group(2)), 'hash': m.group(3), 'url': m.group(4)})
```

## Interpretation rules

- `blockchain.add_block` is an attempt. `blockchain.add_block_success` is stronger evidence of local acceptance.
- `onConfirmation` indicates application-level confirmation/replay after block acceptance.
- HTTP `status=200 ok=true`, parsed header block id, `wasm_process_fetched_block`, `add_block_success`, and `onConfirmation` together are strong evidence of a successful browser SPV/lite-block path.
- `previous block ... not found` followed by validation, reorg, `add_block_success`, and confirmation is reconciliation, not automatically a failure.
- Multiple accepted hashes at the same height indicate competing fork candidates. Identify the winning branch by later common heights and final tips.
- `serving block` proves which node served a block, but not always who requested it; correlate with another node's fetch URL or trace line.
- `callback not found` can be late/unmatched module/API callbacks. Treat it as concerning if repeated or followed by sync failure, but not by itself proof of failed chain sync.
- `cannot find peer from peer_id` after a successful block add is peer-bookkeeping evidence. If the next fetch still uses the same `peer_id`, report this as a routing/peer lookup inconsistency rather than a total sync failure.
- Browser preload and `[Violation]` warnings are usually frontend/performance noise unless they correlate with failed fetches or halted startup.

## Report types

### General report

Use for internal sharing and broad understanding.

Recommended structure:

1. Source file and metadata.
2. Executive summary.
3. Test/environment context.
4. Startup and peer connection summary.
5. Block sync / fork / reconciliation timeline.
6. Warnings and anomalies.
7. Final observed state.
8. Conclusion and follow-up items.

Keep this readable. Include tables for block heights, hashes, bytes, tx counts, and final tips. Avoid huge raw log dumps.

### GitHub issue report

Use when the report should support a specific bug or regression.

Recommended structure:

1. Short title suggestion.
2. Test description and expected behaviour.
3. Actual behaviour.
4. Why it looks wrong / impact.
5. Relevant log excerpts with line numbers and a few surrounding lines.
6. Successful path evidence, if important to narrow the bug.
7. Interpretation and suspected area.
8. Reproduction notes or exact command sequence, if known.

For GitHub, include enough surrounding log lines to show sequence, but keep each excerpt focused. Do not include entire files.

## Example GitHub framing for peer issues

Title:

```text
Browser SPV sync: OnAddBlockSuccess cannot resolve peer_id after successful lite-block fetch
```

Body pattern:

```text
Chrome on staging creates peer_id=1, handshakes with <peer>, and fetches/accepts lite blocks using peer_id=1. After each successful add_block_success, RoutingEvent::OnAddBlockSuccess logs "cannot find peer from peer_id", even though the next lite-block fetch still dispatches with peer_id=1. The block sync path works in this sample, but peer lookup in the advance-chain-sync/routing path appears inconsistent.
```

Then include excerpts for:

- peer config / peer_id assignment;
- handshake;
- block fetch using peer_id;
- add_block_success;
- `cannot find peer from peer_id`;
- next fetch still using peer_id.

## Evidence checklist before finalizing

- [ ] Source filename, size, and line count stated.
- [ ] Test scenario / branch / command sequence stated when known.
- [ ] Peer endpoints, peer ids, and public keys extracted when relevant.
- [ ] Fetch/serve/add/confirm events correlated by height and hash.
- [ ] Errors separated from non-fatal warnings/noise.
- [ ] Final observed tip or final known state stated.
- [ ] Any uncertainty or log truncation called out.
- [ ] For GitHub reports, relevant line-numbered excerpts included.
