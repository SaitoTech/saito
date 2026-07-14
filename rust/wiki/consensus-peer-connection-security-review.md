# Consensus and Peer-Connection Security Review

## Executive Summary

This review identified nine major issues in the Rust consensus and peer-connection
implementation: two Critical, five High, and two Medium. The most serious findings
permit invalid consensus state, leave the Merkle commitment unenforced, allow a
malicious peer to fabricate SPV wallet state, and expose native nodes to remote
process termination.

The review covers `saitocore_peer_refactor` at commit `4198bb24`, compared with
`develop` at `34181603` and merge base `a1011abe`. None of the findings is unique
to the reviewed branch tip relative to current `develop`. Several are historical
peer-refactor regressions that are already present in `develop`; the remaining
issues predate the refactor or were introduced by unrelated shared changes.

I performed a static, source-to-sink review of the vulnerable revision and its
history. I did not execute attack triggers, create proof-of-concept programs, or
run tests as part of this report. Existing baseline evidence available during the
review showed 16 network tests passing and `cargo check -p saito-rust` succeeding.
Those checks do not exercise the adversarial paths described below.

F-01 has since been remediated in the current uncommitted working tree for every
block whose parent is available. The counts below describe the audited revision.
An empty live node still intentionally treats the first peer-provided block as
its local synchronization anchor, because this network does not require genesis
history or an authenticated checkpoint for bootstrap.

| ID | Severity | Finding | Runtime | Provenance |
| --- | --- | --- | --- | --- |
| F-01 | Critical | Block height is not bound to parent height | Full node/core | Pre-existing; remediated locally |
| F-02 | Critical | Merkle commitment is effectively unenforced | Full node and SPV | Pre-existing; present in `develop` |
| F-03 | High | A malicious peer can fabricate SPV chain and wallet state | WASM/browser and native SPV | Refactor-era; present in `develop` |
| F-04 | High | A malformed fetched block can terminate a native node | Native; WASM trap possible | Pre-existing; present in `develop` |
| F-05 | High (liveness) | Native public-key sends are never routable after handshake | Native | Peer-refactor regression; present in `develop` |
| F-06 | Medium | Non-handshake messages are dispatched before handshake verification | Shared core, native, and WASM | Peer-refactor regression; present in `develop` |
| F-07 | High | Resource limits and global locking permit OOM or global transport blocking | Native | Mostly pre-existing; still unmitigated |
| F-08 | High | Invalid old and side-fork blocks execute success side effects | Full node/core | Pre-existing; present in `develop` |
| F-09 | Medium | Configured-peer retries and reconnect identity lifecycle are broken | Native | Mixed pre-existing/refactor regression |

## Background

The native node accepts WebSocket messages and HTTP block responses in
`saito-rust`, then forwards them into the shared `saito-core` routing,
verification, consensus, mempool, blockchain, wallet, and storage components.
The WASM runtime reuses the same core and supplies network buffers and fetched
blocks through JavaScript callbacks.

The important security boundaries are:

- untrusted WebSocket and HTTP bytes entering native routing and verification;
- JavaScript/WASM callbacks supplying peer messages and fetched block bytes;
- an unauthenticated socket becoming a verified peer identity;
- peer-provided sync summaries becoming ghost blocks or longest-chain state;
- routing and verification output becoming mempool, UTXO, wallet, and disk state;
- candidate forks becoming canonical state through winding and unwinding; and
- asynchronous queues and locks mediating global network and consensus progress.

The key invariants are that every accepted child has exactly its parent's height
plus one, every block body matches its signed Merkle commitment, invalid forks
have no persistent side effects, SPV state is anchored to authenticated chain
commitments, privileged peer messages require completed authentication, and all
untrusted work is bounded before allocation or queueing.

## Vulnerability Details

### F-01: Block Height Is Not Bound to Parent Height

- **Severity:** Critical
- **Confidence:** High
- **Affected runtime:** Full nodes and shared consensus code
- **Required capability:** Produce an otherwise consensus-valid block
- **Status:** Remediated in the current uncommitted working tree for known-parent blocks

In the audited revision, [`Blockchain::add_block`](../saito-core/src/core/consensus/blockchain.rs#L220-L320)
checked that a parent hash existed but never required `block.id` to equal the
parent ID plus one. [`Block::validate`](../saito-core/src/core/consensus/block.rs#L2835-L2863)
only asserted that the ID was nonzero. Fork selection followed parent hashes,
counted actual entries, and separately required only that the candidate tip ID
exceed the current ID in
[`is_new_chain_the_longest_chain`](../saito-core/src/core/consensus/blockchain.rs#L1222-L1280).

We can therefore construct an otherwise valid direct child of the current tip
while assigning and signing a far-future ID. The candidate is still a one-block
extension over its parent and can beat an empty old-chain suffix. Winding then
indexes the attacker-selected height and updates the block ring, wallet, UTXO
set, genesis window, and pruning state in
[`wind_chain`](../saito-core/src/core/consensus/blockchain.rs#L1558-L1627).

The later total-supply check does not reliably contain the impact. It runs after
the candidate chain has been wound
([`add_block`](../saito-core/src/core/consensus/blockchain.rs#L444-L481)), while
[`add_block_failure`](../saito-core/src/core/consensus/blockchain.rs#L902-L950)
removes the candidate without rolling back those post-wind mutations. A gap can
therefore be accepted when the supply check is skipped or remains equal, or it
can leave corrupted state even when that final check rejects the candidate.
The final acceptance of an arbitrary far-future gap is therefore not guaranteed
on a mature full node, but the missing invariant and post-wind failure effects
remain independently dangerous.

Parent existence, signatures, burn-fee, golden-ticket, transaction, UTXO, and
supply checks are meaningful controls, but none enforces height adjacency.
Existing tests replay normally produced contiguous blocks and do not exercise a
height gap or a post-wind supply failure.

**Implemented remediation:** `Blockchain::add_block` now uses checked arithmetic
to reject a block unless its ID is exactly its available parent ID plus one. The
guard runs before block-ring, block-map, wallet, UTXO, pruning, or persistence
mutation. A regression test constructs and signs a `2 -> 4` child, confirms
rejection, and verifies that the tip, block map, block ring, wallet, UTXO set,
and genesis boundary remain unchanged. Normal `1 -> 2` admission is exercised
through the same test. A companion regression preserves the decentralized
bootstrap behavior by confirming that an empty node may accept a parentless
retained-floor block as its first synchronization anchor.

The invariant is intentionally conditional on the parent being available. An
empty live node may start from a peer's retained floor and treats that first
block as its local anchor; subsequent known-parent blocks must be contiguous.
Consequently, an eclipsing bootstrap peer can influence an empty node's initial
height view, but cannot make an established node accept a height-jumping child.
This is part of the current decentralized bootstrap trust model rather than a
remaining bypass of the established-chain admission rule.

The independent post-wind total-supply rollback weakness remains unresolved and
should be tracked separately. Reorganization and total-supply verification
should ultimately be transactional, with a complete rollback for every state
mutation performed during winding.

### F-02: Merkle Commitment Is Effectively Unenforced

- **Severity:** Critical
- **Confidence:** High
- **Affected runtime:** Full nodes and SPV clients
- **Required capability:** Relay or serve a valid block body before the original arrives

[`Block::generate`](../saito-core/src/core/consensus/block.rs#L1323-L1350)
preserves every nonzero peer-supplied Merkle root, then computes the signed
pre-hash and block hash around that value. Validation rejects a mismatch only
when the supplied root is zero:

```rust
if self.merkle_root == [0; 32]
    && self.merkle_root
        != self.generate_merkle_root(configs.is_browser(), configs.is_spv_mode())
{
    return false;
}
```

The vulnerable condition is in
[`Block::validate`](../saito-core/src/core/consensus/block.rs#L3320-L3328).
Every nonzero incorrect root passes.

From here, a block-serving peer can take an already valid signed block, reorder
two suitable ordinary transactions, and retain the original declared root,
header signature, and block hash. Merkle leaves normally commit to the ordered
`Transaction::hash_for_signature` values, which are hashes of transaction
signing preimages rather than transaction signatures
([`merkle.rs`](../saito-core/src/core/consensus/merkle.rs#L66-L92)), while output
coordinates are regenerated from body order
([`transaction.rs`](../saito-core/src/core/consensus/transaction.rs#L532-L556))
and become part of UTXO keys
([`slip.rs`](../saito-core/src/core/consensus/slip.rs#L132-L161)). Two nodes can
therefore accept the same block hash yet derive different UTXO keys and state.
The same defect removes the cryptographic basis for SPV membership proofs.

Block signatures, fetched-hash comparisons, and individual transaction checks
bind the declared root and validate each received body independently. They do
not prove that the declared root commits to that body. Existing Merkle tests
cover correct root generation but do not reject a nonzero mismatch.

**Remediation direction:** Require unconditional equality between the declared
and recomputed Merkle root for every full block before signature acceptance,
fork comparison, persistence, or state mutation. Add negative tests using both
a random nonzero root and a reordered transaction body.

### F-03: A Malicious Peer Can Fabricate SPV Chain and Wallet State

- **Severity:** High
- **Confidence:** High
- **Affected runtime:** WASM/browser and native SPV configurations
- **Required capability:** Control a connected peer and its block-fetch endpoint

[`BlockReference`](../saito-core/src/core/network/msg/block.rs#L16-L22) carries
an ID, hash, timestamp, transaction hint, and golden-ticket flag, but no parent
hash, authenticated header, signature, or accumulated-work proof. During
[`process_blockchain_message`](../saito-core/src/core/network/sync.rs#L591-L719),
the client checks sequential IDs but trusts peer-supplied hashes. In SPV mode it
directly installs intermediate references as longest-chain ghost blocks through
[`add_ghost_block_without_transactions`](../saito-core/src/core/consensus/blockchain.rs#L2648-L2677).

Only the final or transaction-relevant reference is fetched. Verification checks
that block against the ID and hash advertised by the same peer, so the attacker
controls both the expectation and the response. In SPV mode,
[`Block::validate`](../saito-core/src/core/consensus/block.rs#L2855-L2862) returns
success before verifying the block signature, Merkle commitment, transaction
signatures, UTXO transition, burn fee, or consensus values. Wallet winding can
then credit attacker-created outputs, remove real slips, and emit confirmation
events through
[`Wallet::on_chain_reorganization`](../saito-core/src/core/consensus/wallet.rs#L258-L354).

The 128-reference response cap, sequential-ID check, final-block fetch, and
expected ID/hash comparison bound or detect some malformed responses, but none
provides an independent chain commitment. Existing tests cover message round
trips and normal lite-block construction, not malicious summaries, unanchored
ghost ancestry, or wallet corruption.

**Remediation direction:** Require completed peer authentication and an explicit
SPV trust policy. Treat summaries only as fetch hints, authenticate a
parent-linked header chain through checkpoints, trusted peers, or multi-peer
agreement, and validate header signatures, commitments, and inclusion proofs
before changing longest-chain or wallet state.

### F-04: A Malformed Fetched Block Can Terminate a Native Node

- **Severity:** High
- **Confidence:** High for native process termination; medium-high for WASM host impact
- **Affected runtime:** Native and WASM
- **Required capability:** Trigger a block fetch and serve its response

The fetched-block verifier calls
[`block.generate().unwrap()`](../saito-core/src/core/verification_thread.rs#L62-L105)
before checking the expected ID and hash. Structural deserialization accepts a
transaction containing duplicate nonzero input slips, but
[`Block::generate`](../saito-core/src/core/consensus/block.rs#L1391-L1410)
detects that semantic error and returns `Err`. The verifier unwraps the
attacker-triggered error before the advertised-hash control can run.

The native runtime installs a global panic hook that exits the process with
status 99
([`main.rs`](../saito-rust/src/main.rs#L448-L463)), and release builds use
aborting panics ([`Cargo.toml`](../Cargo.toml#L10-L12)). WASM reaches the same
panic path and can trap the invocation, but whether the application recovers,
recreates the module, or terminates is host-dependent.

Malformed structural buffers are returned safely, and HTTP fetches have a
timeout, but neither control handles a semantically malformed block whose
generation fails. There is no verifier test for this path.

**Remediation direction:** Handle every `generate()` failure as invalid peer
data, return without panicking, and record the failure against the peer. Add
native and WASM tests for duplicate inputs and every other reachable generation
error.

### F-05: Native Public-Key Sends Are Never Routable After Handshake

- **Severity:** High for network functionality and liveness; Medium under a security-only rubric
- **Confidence:** High
- **Affected runtime:** Native only
- **Required capability:** None; normal successful handshakes trigger the defect

Handshake processing verifies the challenge, stores the peer public key, and
emits `OnPeerHandshakeComplete` in
[`routing_thread.rs`](../saito-core/src/core/routing_thread.rs#L504-L537).
The native implementation of
[`send_interface_event`](../saito-rust/src/rust_io_handler.rs#L331-L333) is
empty. Although `NetworkController` defines
[`register_public_key_mapping`](../saito-rust/src/network_controller.rs#L101-L109),
the repository contains no caller.

Every native public-key send therefore reaches
[`RustIOHandler::send_message`](../saito-rust/src/rust_io_handler.rs#L72-L86)
with an empty mapping and returns `NotFound`. Transaction propagation selects
verified peers by public key and ignores these failures in
[`Network::propagate_transaction`](../saito-core/src/core/network/network.rs#L86-L153).
Ping and other public-key sends fail for the same reason. Peer-ID handshake,
sync, service traffic, and broadcasts continue to work, which masks the defect.

This is a historical peer-refactor regression already present in current
`develop`. No integration test covers handshake completion, native identity
registration, and transaction propagation.

No malicious actor is required to trigger this defect, and peer-ID control
traffic and block broadcasts continue to function. Its High rating reflects the
loss of native transaction and golden-ticket relay rather than a direct security
boundary bypass.

**Remediation direction:** Register and remove the public-key-to-peer-ID mapping
atomically on handshake, identity replacement, and disconnect. Test duplicate
identity replacement and surface propagation errors instead of discarding them.

### F-06: Non-Handshake Messages Are Dispatched Before Handshake Verification

- **Severity:** Medium
- **Confidence:** High for the behavior; Medium for security impact
- **Affected runtime:** Shared core, native, and WASM
- **Required capability:** Open an unauthenticated peer connection

New peers begin with `is_verified = false`
([`peer.rs`](../saito-core/src/core/network/peer.rs#L103-L169)), but
[`RoutingThread::process_peer_buffer`](../saito-core/src/core/routing_thread.rs#L332-L347)
deserializes and dispatches every recognized message without consulting that
state. The match processes transactions, blockchain requests and responses,
block references, services, endpoints, key lists, pings, and genesis references
before identity verification
([`routing_thread.rs`](../saito-core/src/core/routing_thread.rs#L111-L347)).
Outbound peers also start service and sync work before handshake completion
([`routing_thread.rs`](../saito-core/src/core/routing_thread.rs#L673-L739)).

Gatekeeper permission getters exist
([`gatekeeper.rs`](../saito-core/src/core/network/gatekeeper.rs#L75-L94)) but are
not used as a general authorization boundary. Only narrow request accounting is
enforced. An unauthenticated client can therefore initiate transaction
verification, manipulate sync and fetch metadata, and set endpoints before the
protocol records a verified key.

This is a real state-machine regression, but the handshake proves possession of
an arbitrary self-generated key rather than membership in an ACL or a trusted
identity set. A malicious peer can complete it cheaply, Gatekeeper accounting is
keyed by ephemeral peer ID, and the SPV and fetched-block issues remain reachable
after successful verification. The gap should therefore be treated as protocol
hardening and defense in depth, not as a necessary step in those higher-impact
attack paths. Full-node transaction and block signatures also mitigate direct
forged consensus state.

The existing malformed-message test checks only that an unknown message type
does not panic. It does not test which message classes are permitted before and
after verification.

**Remediation direction:** Enforce a connection state machine at the routing
boundary. Before challenge verification, accept only the minimum handshake and
disconnect control messages; reject or disconnect on all other message classes.

### F-07: Resource Limits and Global Locking Permit OOM or Global Transport Blocking

- **Severity:** High
- **Confidence:** High
- **Affected runtime:** Native
- **Required capability:** Open an unauthenticated connection, stop reading from a
socket, or control a block-fetch HTTP endpoint

The native WebSocket route permits 10,000,000,000-byte messages and frames
([`network_controller.rs`](../saito-rust/src/network_controller.rs#L725-L747)).
Binary frames are materialized before routing controls run. HTTP block fetching
uses `response.bytes().await` without a content-length or streamed-body cap
([`network_controller.rs`](../saito-rust/src/network_controller.rs#L233-L302)).

Inbound readers acquire the global `NetworkController` write lock and hold it
while awaiting the core channel
([`network_controller.rs`](../saito-rust/src/network_controller.rs#L443-L519)).
Native send and broadcast paths hold the same lock across socket-write awaits
([`rust_io_handler.rs`](../saito-rust/src/rust_io_handler.rs#L72-L118)). A full
core queue or slow socket can therefore block unrelated sends, disconnects, and
registrations while the awaited operation remains stalled. Verification channels
are bounded but can retain up to one million owned requests
([`main.rs`](../saito-rust/src/main.rs#L326-L341)); Tokio allocates queue storage
lazily, but this configured retention bound remains OOM-scale. Reader EOF is
handled with `continue` instead of `break`, permitting a CPU hot loop and
preventing normal cleanup.

The HTTP timeout, duplicate-fetch suppression, concurrency limit, 128-reference
response cap, and finite channels reduce some exposure. None bounds bytes before
allocation or prevents global head-of-line blocking. No existing test exercises
oversized frames, capped HTTP bodies, full queues, slow readers, or EOF cleanup.

**Remediation direction:** Set practical frame and message limits, stream HTTP
bodies into capped buffers, enforce per-peer work and queue budgets, release
controller locks before every await, and terminate reader tasks on EOF.

### F-08: Invalid Old and Side-Fork Blocks Execute Success Side Effects

- **Severity:** High
- **Confidence:** High
- **Affected runtime:** Full nodes and shared blockchain code
- **Required capability:** Advertise and serve a syntactically generatable block
with an existing parent

`Blockchain::add_block` inserts a candidate into the block ring and block map
before full validation
([`blockchain.rs`](../saito-core/src/core/consensus/blockchain.rs#L298-L324)). Any
block below the current tip immediately takes the success path without calling
`Block::validate`
([`blockchain.rs`](../saito-core/src/core/consensus/blockchain.rs#L327-L337)). A
candidate that does not win fork choice does the same
([`blockchain.rs`](../saito-core/src/core/consensus/blockchain.rs#L444-L492)).

[`add_block_success`](../saito-core/src/core/consensus/blockchain.rs#L581-L660)
writes full blocks to disk, updates fork and pruning metadata, removes included
transaction signatures from the mempool, and performs pruning. The candidate
does not need a valid block signature or valid consensus fields.

We can use unique invalid side blocks containing copied pending transactions to
suppress those transactions locally while growing disk and index state. If the
fork later becomes competitive, the wind path validates it before making it
canonical. That limits direct invalid-chain finalization but does not undo the
earlier persistence, resource, or mempool effects. Failure handling only adds
transactions back for locally created blocks
([`blockchain.rs`](../saito-core/src/core/consensus/blockchain.rs#L923-L950)).
Eventual deletion beyond the two-genesis-period retention window limits how long
each candidate remains live, but it does not bound the number of unique variants
within that window or prevent immediate mempool suppression.

Existing old-block tests replay valid blocks and do not assert invalid-signature
rejection, disk behavior, or mempool preservation.

**Remediation direction:** Perform stateless, signature, and structural consensus
validation before indexing or persistence. Defer mempool cleanup, confirmation,
and pruning effects to validated longest-chain transitions.

### F-09: Configured-Peer Retries and Reconnect Identity Lifecycle Are Broken

- **Severity:** Medium, with High operational impact in single-bootstrap deployments
- **Confidence:** High
- **Affected runtime:** Native
- **Required capability:** None; an unavailable or unstable configured peer is sufficient

[`Network::initialize`](../saito-core/src/core/network/network.rs#L238-L268)
only queues each configured URL. The native asynchronous dial path logs failure
but creates no peer record or failure event
([`network_controller.rs`](../saito-rust/src/network_controller.rs#L129-L188)).
The peer monitor therefore has nothing to retry after an initial failure.

After a connected static peer disconnects, the old record can remain
`is_connecting = true` when an asynchronous reconnect fails
([`network.rs`](../saito-core/src/core/network/network.rs#L320-L415)). A successful
reconnect creates a fresh random peer ID, while cleanup skips static records
([`peers.rs`](../saito-core/src/core/network/peers.rs#L202-L227)).
`remove_duplicate_peers` exists but has no caller. Repeated cycles can therefore
leave stale peer records, while one failed cycle can permanently remove the
configured route until restart.

Initial-connect retry omission predates the refactor. The peer-ID replacement,
stuck `is_connecting`, and stale-record lifecycle are refactor regressions. No
test covers initial dial failure, retry backoff, duplicate identity, or repeated
reconnect cycles.

**Remediation direction:** Maintain URL- or identity-keyed dial state independent
of live socket records. Emit explicit asynchronous success and failure events,
clear `is_connecting` on every completion path, use bounded backoff, replace or
reuse records on reconnect, and actively deduplicate stale identities.

## Exploitability Analysis

The strongest attack paths combine several findings rather than relying on one
primitive in isolation.

### Malicious-Peer Native Node Termination

A malicious connected peer sets or supplies a fetch endpoint and advertises a
block reference. The native node fetches the peer's HTTP response, after which
F-04 converts a duplicate input detected by `Block::generate` into a process-wide
panic. The expected block-hash check does not constrain the response because it
executes after the unwrap. F-06 permits this sequence before handshake completion,
but it remains reachable after a valid handshake and requires neither a valid
transaction nor block-production rights.

### SPV Wallet Forgery

F-03 lets a malicious sync peer provide an unanchored sequence of block
references, install ghost blocks as the longest chain, and supply a final
self-consistent block. SPV validation then skips every authenticity and
state-transition check needed to protect the wallet. The result is counterfeit
received funds, attacker-selected confirmation depth, or deletion of real local
slips. F-06 reduces the sequencing needed before this path can start, but
authentication is not a chain proof and does not remove F-03.

### Consensus Divergence

F-01 requires block-production capability: a height-jumping child can move
height-indexed state without adding the implied number of blocks. F-02 does not;
a peer that serves or relays an otherwise valid block first can reorder suitable
ordinary transactions while retaining the signed header and block hash. Nodes
can then derive different UTXO keys without a cryptographic hash collision. These
are consensus-invariant failures rather than ordinary peer-level denial of
service.

### Resource and Censorship Pressure

F-07 permits unauthenticated allocation and global network head-of-line blocking.
F-08 offers a lower-bandwidth persistent route: repeated invalid side blocks can
consume disk and block-index state while deleting copied pending transactions
from the local mempool. F-09 can then make recovery and peer replacement less
reliable, especially when a deployment depends on one configured bootstrap peer.

## Proof of Concept

No executable proof of concept was created or run. This was intentional: the
review was scoped to static validation and existing tests, and several triggers
can terminate a node, corrupt wallet or UTXO state, prune data, or persist
attacker-controlled blocks.

The narrowest safe regression demonstrations should be implemented as isolated
tests with disposable storage and runtime state:

1. add a signed child whose parent is height `n` and whose ID is `n + 2`;
2. validate a full block whose declared nonzero Merkle root differs from the
   recomputed root, including two reordered independent transactions;
3. process an attacker-supplied SPV summary and final block that credits the
   wallet without valid signatures;
4. pass a deserializable fetched block with duplicate nonzero inputs to the
   verifier and assert an error rather than a panic;
5. complete a native handshake and assert that public-key transaction sending
   resolves the correct live peer ID;
6. send every non-handshake message class before peer verification and assert
   rejection without state mutation;
7. exercise frame, HTTP-body, queue, slow-reader, and EOF limits;
8. submit an invalid side-fork block containing a mempool transaction and assert
   no disk write or mempool deletion; and
9. simulate initial dial failure followed by repeated failed and successful
   reconnect cycles, asserting bounded peer state and continued retries.

## Remediation

The recommended order is based on consensus impact, remote reachability, and the
degree to which one issue enables another:

1. Enforce parent-height adjacency and unconditional Merkle-root equality.
2. Remove the fetched-block panic and define an authenticated SPV header and
   proof trust model.
3. Bound WebSocket, HTTP, channel, and per-peer work; remove global locks across
   awaits.
4. Validate side-fork blocks before persistence or mempool mutation.
5. Restore native public-key-to-peer-ID registration and cleanup.
6. Enforce the intended pre-handshake message state machine.
7. Repair configured-peer retry, deduplication, and reconnect lifecycle.

Every fix should add a negative test at the earliest boundary where the invalid
input can be rejected. Consensus fixes should also test that failure leaves the
block ring, UTXO set, wallet, mempool, genesis window, pruning state, and disk
unchanged.

## Important Areas Without an Additional Major Finding

The review did not identify a separate major issue in the following controls:

- the handshake challenge is nonce-bound and correctly verifies key ownership;
- normal full-chain validation checks block and transaction signatures, UTXO
  spends, duplicate inputs, burn fee, golden tickets, and consensus values;
- message decoders generally perform structural length checks, including the
  128-reference blockchain-response cap and 255-entry transaction vectors;
- no concrete cyclic multi-lock inversion was confirmed; the lock finding is
  holding a global lock across awaits and I/O; and
- the reorganization state machine has explicit unwind and rewind behavior, with
  no separate major rollback defect confirmed beyond the post-wind total-supply
  path described in F-01.

These observations are scoped negative results, not a claim that the surrounding
code is free of lower-severity defects.

## Summary

The reviewed implementation contains two direct consensus-invariant failures,
three peer-authentication or identity-lifecycle regressions, and several
availability and state-side-effect paths reachable from untrusted network input.
The highest priority is to reject invalid height and Merkle commitments before
any indexing or state transition. The next priority is to make the network and
SPV boundaries fail closed: authenticate before dispatch, validate rather than
panic, anchor SPV state to real chain commitments, and bound all untrusted work.

The findings are not unique to `saitocore_peer_refactor` compared with current
`develop`. Fixes should therefore be coordinated as shared consensus and runtime
hardening rather than treated only as cleanup of the reviewed branch.
