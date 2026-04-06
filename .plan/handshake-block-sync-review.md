# Handshake And Block Sync Review

## Scope

This review covers the current Rust protocol path that both the native node and the wasm/js adapter rely on:

- `rust/saito-core/src/core/routing/peers/network_peer.rs`
- `rust/saito-core/src/core/routing/peers/peer.rs`
- `rust/saito-core/src/core/routing/blockchain_sync_state.rs`
- `rust/saito-core/src/core/routing_thread.rs`
- `rust/saito-rust/src/network_controller.rs`
- `rust/saito-js/lib/custom/shared_methods.web.ts`

The Rust core is the source of truth for handshake state, peer finalization, header advertisement, and block download scheduling. The wasm/js layer mainly adapts transport and HTTP fetch into the same core flow.

## Findings

### 1. High: handshake trusts peer-advertised block fetch URLs without validation

Current behavior:

- `NetworkPeer::process_handshake_response(...)` explicitly carries a `TODO : validate block fetch URL`.
- `Peer::handle_new_peer(...)` copies `response.block_fetch_url` into `peer.block_fetch_url`.
- `process_incoming_block_hash_(...)` later uses that stored value to build the fetch URL.
- `NetworkController::fetch_block(...)` performs a direct HTTP GET against that URL.

Why this matters:

- A peer can advertise an arbitrary HTTP endpoint during handshake.
- The node then treats that endpoint as authoritative for block downloads.
- That creates an SSRF-style egress risk and also lets a peer separate websocket identity from the HTTP source of blocks.

Recommended improvement:

- Parse and validate `block_fetch_url` during handshake finalization.
- Restrict it to the websocket peer host, a configured allowlist, or a signed/derived endpoint.
- Reject or downgrade peers that advertise malformed, cross-origin, or non-http(s) URLs.

### 2. High: incompatible handshake versions warn but do not explicitly terminate the pending connection

Current behavior:

- In `NetworkPeer::process_incoming_buffer(...)`, an incompatible `core_version` triggers `NetworkEvent::NewVersionDetected`.
- That branch does not send `PeerConnectionResult`, does not mark the peer connected, and does not actively disconnect the socket.
- The function returns an empty buffer and leaves cleanup to later stale-peer logic.

Why this matters:

- Version-incompatible peers remain half-open until the transport eventually closes or stale-peer cleanup runs.
- This wastes socket, task, and congestion-control capacity.
- The behavior is ambiguous: the connection is neither accepted nor decisively rejected.

Recommended improvement:

- Treat incompatible core versions as a terminal handshake failure.
- Emit `NewVersionDetected`, then explicitly close the connection and record a reason.
- Make the outcome symmetric for native and wasm/web transports.

### 3. High: duplicate public-key connections can desynchronize peer state from socket ownership

Current behavior:

- `NetworkController::receive_message_from_peer(...)` stores a completed connection in `network_peers` only if that public key is not already present.
- `RoutingThread::handle_new_peer(...)` always inserts the finalized `Peer` into `peers.peers`, replacing any existing entry for the same key.
- That means a second completed connection can replace routing metadata while the old socket remains the one registered for outbound sends.

Why this matters:

- Incoming traffic may now be processed on one socket while outgoing traffic still uses a different socket.
- The routing layer and transport layer can disagree about which connection actually owns a peer.
- The repository still contains older duplicate-handshake logic in `handle_handshake_response(...)`, which suggests this ownership problem was known but not completed in the newer flow.

Recommended improvement:

- Decide on one policy and enforce it atomically:
  - reject the second socket before peer insertion, or
  - replace the existing socket and peer record together.
- Keep the routing peer map and the transport socket map under the same duplicate-resolution decision.

### 4. High: ghost-chain sync currently ignores watched key-list addresses beyond the sender key

Current behavior:

- `generate_ghost_chain(...)` builds `peer_key_list` from the peer public key plus watched keys.
- It then intentionally narrows that list to `sender_only_key_list` with a comment describing this as a temporary debugging restriction.
- `ghost.txs` is computed from `sender_only_key_list`, not the full watched key list.

Why this matters:

- Lite clients can subscribe to more than one address.
- The current ghost-chain filter marks a block as interesting only if it affects the peer's own key, not the full watched set.
- That can cause the lite client to skip fetching blocks that contain transactions relevant to watched addresses.

Recommended improvement:

- Restore `ghost.txs` to use the full `peer_key_list`, or gate the current reduced behavior behind an explicit config flag.
- If the reduced mode is kept for operational reasons, document it as a correctness tradeoff rather than leaving it as temporary debug code.

### 5. Medium: sync slot refill is timer-driven, which adds avoidable latency after failed or completed fetches

Current behavior:

- `fetch_next_blocks()` runs on the one-second `RECONNECTION_PERIOD` timer and after `RoutingEvent::BlockchainUpdated`.
- `NetworkEvent::BlockFetched` marks the block fetched but does not immediately refill the freed slot.
- `NetworkEvent::BlockFetchFailed` marks the block failed but does not immediately try another candidate.

Why this matters:

- A fetch failure waits for the next scheduler pass before another candidate is issued.
- A successful fetch also waits for either verification/add completion or the next timer tick before refilling capacity.
- This is not a correctness break, but it slows catch-up under latency or failure.

Recommended improvement:

- Refill fetch slots immediately after `BlockFetchFailed`.
- Consider refilling after `BlockFetched` once the queue credit is known to be available, even if verification is still pending.
- Keep the batch-size ceiling, but make slot reuse event-driven instead of mostly timer-driven.

## Suggested Implementation Order

1. Validate and constrain `block_fetch_url` during handshake finalization.
2. Make version-incompatible handshakes fail fast and disconnect explicitly.
3. Unify duplicate-peer handling so socket ownership and peer ownership stay aligned.
4. Remove or config-gate the `sender_only_key_list` ghost-chain restriction.
5. Improve sync refill behavior to reduce one-second retry stalls.

## Notes

- No code changes were made in this pass.
- The issues above are grounded in the current implementation and should be treated as a focused follow-up set, not as a request for a larger networking rewrite.