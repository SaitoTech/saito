# Bidirectional Static Peer Config Plan

## Goal

Support both ends of a peer relationship configuring the other side in their peer configs without creating unstable duplicate peers, losing reconnect URLs, or depending on which side initiated the live socket.

## Current State

- Peer config is effectively one-sided today.
- Startup reads configured peers and immediately dials them in `rust/saito-core/src/core/routing_thread.rs`.
- Inbound websocket connections are created with `NetworkPeer::new(None)` in `rust/saito-rust/src/network_controller.rs`, so inbound peers do not carry a reconnect URL.
- `connect_to_static_peers(...)` in `rust/saito-core/src/core/routing_thread.rs` only retries peers that already have a stored `url`.
- `Peer.url` is therefore acting like an outbound dial target, not a durable identity for a configured peer relationship.
- If both sides configure each other and connect at the same time, the system has no strong configured-peer identity model to merge those connections cleanly.

## Main Finding

The clean solution is not to teach inbound peers to guess their URL after the fact. The better design is to treat configured peers as persistent peer identities and then attach either inbound or outbound transport connections to those configured identities after handshake.

That means:

- config should create peer records, not just dial attempts
- reconnect behavior should belong to configured peer identity
- socket direction should be runtime state, not peer identity

## Recommended Approach

### 1. Make configured peers persistent identities

Today `PeerConfig` is used as a dial target. Change that model so configured peers are registered into peer state before any sockets are opened.

Recommended behavior:

- create a disconnected configured `Peer` record for each configured peer at startup
- store its reconnect target independently of whether the live connection is inbound or outbound
- let connection attempts attach to that record rather than creating a separate peer identity

Why:

- This removes the current asymmetry where only the initiating side has a durable URL.

### 2. Separate configured metadata from transport state

Refactor `Peer` so it has durable configuration metadata distinct from the current socket/connection state.

Recommended fields:

- `configured_url`
- `advertised_url`
- `is_configured_peer` or a stronger peer-origin enum
- optional `expected_public_key`

Keep the reconnect target as configured metadata instead of overloading `Peer.url` to mean “the URL associated with the currently active connection.”

Why:

- A peer can first connect inbound and later reconnect outbound.
- Direction of the current transport should not decide whether the peer is reconnectable.

### 3. Canonicalize endpoint-to-URL conversion in one place

`PeerConfig::get_url()` in `rust/saito-core/src/core/util/configuration.rs` already converts `{ protocol, host, port }` to `ws://.../wsopen` or `wss://.../wsopen`.

Introduce a shared canonical helper so both:

- configured peer URLs
- handshake-advertised endpoints

are normalized identically before matching.

Why:

- This avoids duplicated string-building logic.
- It makes inbound matching and config matching compare the same canonical representation.

### 4. Match inbound handshakes onto configured peer records

During handshake finalization in `rust/saito-core/src/core/routing_thread.rs`, do not always create a new peer record for an inbound connection.

Instead:

- inspect handshake data
- derive the peer’s advertised canonical URL from `response.endpoint`
- match that inbound connection to an existing configured peer if one exists

Recommended match priority:

1. expected public key if configured
2. canonical advertised URL from handshake endpoint

If a configured peer is found:

- attach the live connection to that existing peer record
- preserve its `configured_url`
- update transport and handshake fields on the existing peer

Why:

- This is the core step that makes “both ends configured” work without creating separate anonymous inbound peers.

### 5. Add optional public key to peer config

The current `PeerConfig` only contains host, port, protocol, and synctype.

Recommended change:

- add optional `public_key` to `PeerConfig`

Use it when available as the strongest configured-peer matcher after handshake.

Why:

- URL-only matching is workable but weaker under DNS changes, proxies, or shared endpoints.
- Public-key matching gives a durable identity contract while preserving backward compatibility for older configs.

### 6. Change startup from “dial only” to “register then dial”

Update static-peer initialization so startup does two things in order:

1. register configured peers into `PeerCollection` as disconnected configured peers
2. begin dialing them using their stored `configured_url`

Then `connect_to_static_peers(...)` should operate on these registered configured peers, not on ad hoc peer records created only after outbound connection succeeds.

Why:

- It preserves configured intent even if the first successful socket is inbound.

### 7. Add deterministic duplicate-connection resolution

If both ends configure each other, both may dial and both may receive inbound connections. The codebase already hints at this missing behavior in comments inside `rust/saito-core/src/core/routing/peers/peer_collection.rs`.

Recommended behavior:

- when a second live connection completes handshake for the same public key, do not create a second durable peer identity
- merge onto the existing configured peer record
- deterministically choose which live transport to keep
- close the loser

Recommended policy:

- prefer the connection already attached to the configured peer record
- if both are equivalent, use a stable tiebreaker derived from public keys and direction so both sides make the same decision

Why:

- This prevents oscillation and duplicate peers when bilateral config causes simultaneous dial.

### 8. Mirror the model in Node-side socket bookkeeping

`node/lib/saito/core/server.ts` currently creates `new NetworkPeer(undefined, url)` only for outbound connections.

Node-side bookkeeping should be updated so:

- configured peer metadata is not treated as outbound-only
- an inbound socket can be attached to a configured peer relationship
- duplicate sockets for the same peer public key are resolved consistently with the Rust-side decision

Why:

- Without this, Rust-side identity fixes can still be undermined by JS-side socket ownership assumptions.

## Suggested File Targets

- `rust/saito-core/src/core/util/configuration.rs`
  - extend `PeerConfig`
  - add canonical URL derivation helpers
- `rust/saito-core/src/core/routing_thread.rs`
  - change static peer initialization to register-then-dial
  - update handshake finalization to match inbound peers onto configured peers
- `rust/saito-core/src/core/routing/peers/peer.rs`
  - separate configured peer metadata from live transport state
- `rust/saito-core/src/core/routing/peers/network_peer.rs`
  - carry enough transient handshake information to support configured-peer matching
- `rust/saito-core/src/core/routing/peers/peer_collection.rs`
  - add duplicate-connection merge logic and configured-peer lookup helpers
- `rust/saito-rust/src/network_controller.rs`
  - inbound websocket flow currently creates peers with no URL; update this flow to support configured-peer attachment
- `node/lib/saito/core/server.ts`
  - align JS socket bookkeeping with the configured-peer identity model
- `node/docs/advanced-configuration.md`
  - document optional peer public key and bilateral static-peer behavior

## Verification Plan

### Unit tests

- canonical URL generation from both `PeerConfig` and handshake `Endpoint`
- configured-peer lookup by public key and by canonical URL
- configured peer first connected inbound still retains reconnect metadata
- duplicate connection for the same public key resolves to one durable peer record

### Integration tests

- one node configured, one node not configured still behaves as before
- both nodes configured and starting at the same time converge to one stable peer relationship
- after disconnect, reconnect logic still works even if the last active connection was inbound-first

### Manual validation

- configure node A with node B
- configure node B with node A
- start both simultaneously
- verify only one stable peer relationship survives
- restart one node and verify reconnection still works from the preserved configured metadata

## Recommendation

The best way to support both sides configuring each other is to stop modeling config as a one-way dial list.

Instead, model config as durable peer identity, keep reconnect URL as part of that identity, and match both inbound and outbound transports onto it after handshake. Adding an optional configured public key is the strongest improvement because it gives the system a reliable identity anchor beyond URL heuristics while remaining backward-compatible.