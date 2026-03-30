# Peer Protocol Versioning Plan

## Goal

Introduce explicit versioning for peer-to-peer messages, including handshake, so mixed software versions can be identified and handled intentionally instead of failing as generic decode errors or crashing nodes.

Recommended direction:

- Separate transport protocol compatibility from software semver.
- Advertise protocol compatibility during handshake.
- Persist negotiated protocol information on each peer.
- Make message encoding and decoding choose the correct wire format from that stored peer protocol.

## Current State

- The handshake already carries `core_version` and `wallet_version` in `rust/saito-core/src/core/msg/handshake.rs`.
- Those fields are currently software version signals, not a true wire-protocol contract.
- The handshake response has a brittle fixed header with exact byte offsets before the variable-length sections.
- Normal peer messages are framed by a one-byte type in `rust/saito-core/src/core/msg/message.rs` and then decoded strictly by message type.
- Inbound post-handshake messages are currently deserialized before peer metadata is consulted, so version data learned during handshake cannot influence decoding yet.
- Unknown post-handshake message types are logged and dropped in `rust/saito-core/src/core/routing_thread.rs`, but this is not the same as negotiated compatibility.

## Main Risks

### 1. Handshake layout is fragile

`HandshakeResponse` in `rust/saito-core/src/core/msg/handshake.rs` uses a fixed 152-byte header before variable-length fields.

Implication:

- Adding a new fixed field directly into that header will break mixed-version peers by shifting offsets for public key, signature, lengths, and endpoint data.

### 2. Stored peer version is not yet usable for decoding

`Peer` already stores remote `wallet_version` and `core_version` in `rust/saito-core/src/core/routing/peers/peer.rs`, but `RoutingThread::process_network_event` currently calls `Message::deserialize(buffer)` before consulting peer state.

Implication:

- Reading protocol info from handshake and storing it on the peer is the right idea, but it is not sufficient by itself. The inbound decode path must be refactored so peer protocol state is consulted before full deserialization.

### 3. Software version and protocol version should not be conflated

The existing `Version` type in `rust/saito-core/src/core/process/version.rs` is useful as a reference, but `wallet_version` and `core_version` currently represent software/update information rather than message-wire compatibility.

Implication:

- A separate transport protocol version should be introduced even if it reuses similar major/minor/patch structure.

## Recommended Compatibility Policy

Based on the requirement:

- A node should support the current protocol minor plus the previous two minor versions.
- Protocol major versions must match.
- Patch differences should not change wire compatibility.

Recommended compatibility rule:

- Compatible if `major` matches and remote `minor` is in `[current_minor - 2, current_minor]`.
- Incompatible if major differs.
- Incompatible if minor is older than the supported floor or newer than the current implementation knows how to handle.

## Plan

### 1. Define an explicit protocol version model

Add a transport protocol model, for example `ProtocolVersion`, with helpers such as:

- `is_compatible_with(...)`
- `min_supported_minor(...)`
- `negotiate(...)`
- `is_legacy(...)`

Keep this distinct from existing `core_version` and `wallet_version`.

Why:

- This makes the compatibility contract explicit and prevents wire compatibility logic from drifting with application release versioning.

### 2. Advertise protocol capability during handshake without changing the fixed header

Do not add new fixed fields to `HandshakeResponse` as the first rollout.

Recommended first step:

- Use the existing handshake `services` blob as a backward-compatible extension surface.
- Add a reserved service entry that advertises transport protocol data.

Example shape:

- `service = saito-protocol`
- `domain = core`
- `name = 1.7-5`

Where:

- `1` is protocol major
- `7` is current supported minor
- `5` is minimum supported minor

Why:

- The `services` section is already variable-length and optional.
- Older nodes that do not understand the reserved service can ignore it.
- This avoids breaking the current fixed handshake layout.

### 3. Parse and persist negotiated protocol on peers

Update handshake processing so the reserved protocol advertisement is parsed and stored in:

- `NetworkPeer` during handshake processing
- `Peer` after handshake finalization

Suggested data to persist per peer:

- advertised protocol major
- advertised current minor
- advertised minimum supported minor
- negotiated protocol minor actually selected for communication
- a legacy/fallback marker when the peer does not advertise protocol metadata

Behavior:

- If the peer advertises a compatible version window, negotiate the highest common supported minor.
- If the peer does not advertise protocol capability, classify it as legacy and map it to one explicit legacy decoder family.
- If the peer is outside the supported window, reject or disconnect intentionally with a protocol-specific reason.

### 4. Make inbound decoding peer-version-aware before full deserialization

Refactor the inbound receive path in `rust/saito-core/src/core/routing_thread.rs`.

Current problem:

- It immediately calls `Message::deserialize(buffer)`.

Required refactor:

- First read the shallow frame information, at minimum the message type byte.
- Look up the sender peer in `PeerCollection`.
- Read the peer’s negotiated protocol metadata.
- Dispatch to a protocol-aware decode path such as `Message::deserialize_for_protocol(...)`.

Handshake-stage peers are the exception:

- Before negotiation completes, continue using the existing handshake decode path.

Why:

- This is the key change that makes handshake-advertised protocol information actually useful.

### 5. Make outbound serialization peer-version-aware

Add outbound serializer selection based on the target peer’s negotiated protocol.

Suggested pattern:

- `Message::serialize_for_protocol(...)`

Behavior:

- When sending to a single peer, serialize using that peer’s negotiated protocol minor.
- When broadcasting, either down-level per peer or skip messages that have no safe representation for older peers.

Why:

- Version-aware decoding without version-aware encoding only solves half the compatibility problem.

### 6. Add explicit incompatibility handling and observability

Introduce clear protocol-mismatch handling distinct from generic `InvalidData` parsing failures.

Recommended behavior:

- Major mismatch: disconnect.
- Minor outside supported window: disconnect.
- Unsupported optional message shape within supported window: log and drop the message without crashing or disconnecting unless repeated behavior suggests abuse.
- Legacy peer with no protocol advertisement: keep on the explicit legacy path only if that path is still within the support window.

Recommended additions:

- a protocol incompatibility network or interface event
- structured logs with local version, remote version, negotiated version, and reason
- counters or metrics for dropped incompatible messages

### 7. Treat handshake evolution as a staged rollout

Stage one:

- advertise protocol metadata through the existing handshake services blob
- store negotiated protocol state on peers
- refactor message encoders and decoders to use negotiated protocol

Stage two, optional later:

- introduce a cleaner handshake v2 or a TLV-based handshake extension once the network has substantially upgraded

Why:

- This avoids a flag day on the current fixed-offset handshake format.

## Suggested File Targets

- `rust/saito-core/src/core/msg/handshake.rs`
  - parse and surface the reserved handshake protocol capability without breaking the fixed header
- `rust/saito-core/src/core/msg/message.rs`
  - add protocol-aware serialize and deserialize entry points
- `rust/saito-core/src/core/process/version.rs`
  - reference only if shared comparison helpers are useful; preferably add a separate protocol type instead of overloading the existing software version type
- `rust/saito-core/src/core/routing/peers/network_peer.rs`
  - negotiate and store remote protocol during handshake
- `rust/saito-core/src/core/routing/peers/peer.rs`
  - persist negotiated protocol data on connected peers
- `rust/saito-core/src/core/routing/peers/peer_collection.rs`
  - expose peer protocol data to the inbound router cheaply
- `rust/saito-core/src/core/routing_thread.rs`
  - refactor inbound processing so decoder selection happens after peer lookup and before full message decode
- `rust/saito-core/src/core/routing/io/network_event.rs`
  - add protocol-incompatibility events if needed
- `rust/saito-core/src/core/routing/peers/peer_service.rs`
  - extend the service model or reserved service parsing for the protocol advertisement
- `node/lib/saito/network.ts`
  - inject the reserved protocol advertisement into the Node-side service list used during handshake
- `node/lib/saito/core/server.ts`
  - minor plumbing only if new protocol incompatibility events need to surface to Node
- `rust/saito-wasm/src/saitowasm.rs`
  - confirm wasm bridge remains byte-transparent and extend event plumbing only if protocol incompatibility state must cross the boundary
- `rust/saito-js/saito.ts`
  - same as wasm bridge: mostly transparent, but relevant if new protocol-related APIs or events are added

## Testing Plan

### Unit tests

- protocol version parsing and compatibility-window math
- negotiation chooses the highest mutually supported minor
- malformed reserved protocol service is rejected cleanly
- handshake with no protocol capability is mapped to legacy behavior deterministically
- handshake with out-of-window protocol metadata is rejected intentionally

### Message codec tests

- decode the same message type under multiple negotiated protocol minors
- verify unsupported newer message layouts are dropped intentionally, not surfaced as generic crashes
- verify outbound serialization chooses the correct layout for each peer protocol

### Integration tests

- peer handshake stores negotiated protocol state in `Peer`
- `RoutingThread` consults peer protocol state before final decode dispatch
- two mixed-version peers within the previous-two-minor window remain connected and exchange supported messages
- a peer outside the supported window is rejected with an explicit incompatibility reason

## Recommended Rollout Order

1. Introduce the protocol model and compatibility helpers.
2. Add handshake protocol advertisement via reserved service metadata.
3. Store negotiated protocol state on peers.
4. Refactor inbound decoder selection to consult peer protocol before full deserialization.
5. Refactor outbound serialization to target the peer protocol.
6. Add explicit incompatibility handling and logs.
7. Add tests for negotiation, compatibility, and mixed-version behavior.

## Key Recommendation

Reading protocol version from the handshake and keeping it on peer data is the right architectural direction.

However, it only becomes effective if the receive path is refactored so peer protocol state is consulted before full message deserialization. Without that refactor, handshake version metadata remains informational and cannot prevent decode failures from newer or older wire formats.