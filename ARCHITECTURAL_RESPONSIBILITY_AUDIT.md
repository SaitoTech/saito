# Saito JS/WASM Responsibility Audit

Scope: `rust/saito-js` + `rust/saito-wasm` (+ core ownership in `rust/saito-core`)  
Mode: analysis only (no code changes)

## Part 1: STUN / Peer Management

### Located Components
- JS STUN manager:
  - `rust/saito-js/saito.ts` (`stunManager` field, initialized in constructor)
  - `rust/saito-js/lib/stun_peer.ts` (`StunManager` class)
- WASM STUN/peer functions:
  - `process_stun_peer(...)` in `rust/saito-wasm/src/saitowasm.rs`
  - `remove_stun_peer(...)` in `rust/saito-wasm/src/saitowasm.rs`
  - `process_peer_disconnection(...)` in `rust/saito-wasm/src/saitowasm.rs`
- Core network event handling:
  - `NetworkEvent::AddStunPeer` / `RemoveStunPeer` / `PeerDisconnected` in `rust/saito-core/src/core/routing_thread.rs`

### What `stunManager` actually does
- `rust/saito-js/lib/stun_peer.ts` is browser transport glue around WebRTC DataChannel:
  - Creates data channel for an `RTCPeerConnection`
  - Tracks STUN peers in a local JS map (`stunPeers`)
  - On channel open/close, notifies WASM (`process_stun_peer`, `remove_stun_peer`)
  - On incoming DataChannel messages, forwards bytes to Saito message processing (`processMsgBufferFromPeer`)
- In web shared methods (`rust/saito-js/lib/custom/shared_methods.web.ts`), outbound message path prefers STUN channel when peer is marked STUN (`stunManager.isStunPeer`).

### Does WASM have peer management?
- Yes. WASM exports bridge into core network events; core routing thread owns peer lifecycle decisions.
- `process_stun_peer/remove_stun_peer/process_peer_disconnection` all enqueue network events handled in routing thread.
- The actual peer collection and network state updates occur in core (`routing_thread`, peer collection, network io).

### Is STUN separate from peer management or part of it?
- STUN is a transport subtype integrated into peer management.
- Separation by layer:
  - JS: WebRTC/DataChannel lifecycle and browser primitives
  - WASM/Core: canonical peer state and network events
- So STUN is not a separate top-level ledger; it is a peer transport path within network subsystem.

### Where "adding a peer" logically belongs
- Logical ownership: `core.network` (routing/peer management), not wallet and not generic app layer.
- JS STUN manager should remain transport adapter only; authority for "peer added/removed/connected/disconnected" belongs in core network/routing.

## Part 2: Message Processing (`process_msg_buffer_from_peer`)

### Located Function
- WASM entrypoint: `process_msg_buffer_from_peer(...)` in `rust/saito-wasm/src/saitowasm.rs`.

### Rust module/function that handles it
- Entrypoint is in `saitowasm.rs`, but core processing is delegated to peer logic:
  - Calls `network_peer.process_incoming_buffer(...)`
  - `process_incoming_buffer` lives in `rust/saito-core/src/core/routing/peers/network_peer.rs`
  - Emits `NetworkEvent` back to routing thread via callback closure

### Networking vs protocol logic
- It is both transport-to-protocol decoding and network event emission:
  - Network transport ingress point
  - Handshake/protocol message handling and dispatch
- In architecture terms this belongs to core networking/protocol pipeline (routing + peer modules), not wallet subsystem.

### Recommended location
- `core.network` / routing-peer protocol boundary.
- Current ownership already matches this: JS forwards bytes, WASM/core owns interpretation and event processing.

## Part 3: Wallet State (`update_from_balance_snapshot`)

### Located Function
- WASM function: `update_from_balance_snapshot(...)` in `rust/saito-wasm/src/saitowasm.rs`.
- Core wallet owner method:
  - `Wallet::update_from_balance_snapshot(...)` in `rust/saito-core/src/core/consensus/wallet.rs`.

### Ownership and mutation
- In WASM, function grabs wallet lock (`routing_thread.wallet_lock.write()`), then calls wallet method.
- Core wallet method mutates wallet state:
  - clears/rebuilds slips
  - resets/recomputes available balance
  - updates unspent sets
  - emits wallet update interface event

### Should this be part of wallet?
- Yes. By behavior and data mutation scope, this is wallet-state logic.
- Current implementation already places true responsibility in wallet; WASM method is just bridge/entrypoint.

## Part 4: Wallet Version (`set_wallet_version`)

### Located Function
- WASM function: `set_wallet_version(...)` in `rust/saito-wasm/src/saitowasm.rs`.
- It writes directly to wallet struct field: `wallet.wallet_version`.
- Wallet field exists in core wallet struct:
  - `wallet_version: Version` in `rust/saito-core/src/core/consensus/wallet.rs`
- Used in handshake/version negotiation:
  - `HandshakeResponse.wallet_version` in `rust/saito-core/src/core/msg/handshake.rs`
  - Compared in peer/routing logic (e.g., new version detection in peer/routing flow).

### What wallet version represents
- Runtime/app wallet/client version metadata propagated in handshakes to peers.
- Used to detect peer version mismatch and trigger version-related interface events.
- Not a balance/slip primitive; it is compatibility metadata carried with wallet identity.

### Why currently not on wallet API surface
- In JS it is currently exposed as top-level bridge (`S.getInstance().setWalletVersion(...)`) then used from app init.
- In WASM it still mutates wallet directly, but the export is not namespaced under wallet in JS API surface.

### Should it be exposed as `core.wallet.setVersion(...)`?
- Responsibility-wise: yes, it conceptually belongs under wallet namespace because it mutates wallet-owned metadata.
- Current placement is functional but semantically flatter than the underlying ownership.

## Part 5: Current JS Structure (Managers in `saito-js`)

Primary stateful managers/containers in `rust/saito-js/saito.ts` and related files:

1. `stunManager` (`StunPeer` / `StunManager`)
- Responsibility:
  - Browser WebRTC DataChannel transport integration
  - Local STUN peer map and channel lifecycle
- Equivalent in WASM/core:
  - Core has STUN peer events and peer collection updates, but not browser DataChannel primitives
- Responsibility split:
  - JS transport adapter + core peer authority

2. `peers: Map<string, NetworkPeer>`
- Responsibility:
  - JS-side socket/peer objects (mainly web/node socket references and lookup)
- Equivalent in WASM/core:
  - Yes, core also maintains canonical peer collection and routing state
- Note:
  - JS map is transport/session object cache, not sole source of truth for protocol state

3. `promises: Map<number, {resolve,reject}>` + `callbackIndex`
- Responsibility:
  - JS-side API call correlation for request/response handling (`network.api.call`)
- Equivalent in WASM/core:
  - Core handles network messages; this specific Promise correlation map is JS orchestration glue

4. `wallet` / `blockchain` cached wrappers
- Responsibility:
  - JS wrapper instances around WASM objects (lazy initialization/caching)
- Equivalent in WASM/core:
  - Yes, underlying ownership is in core; JS holds wrappers only

5. `factory`
- Responsibility:
  - Construct JS wrapper objects (`Transaction`, `Block`, `Peer`, etc.) from WASM instances
- Equivalent in WASM/core:
  - No direct equivalent; this is JS object adaptation layer.

## Subsystem Mapping Summary

### STUN + peer lifecycle
- Current location:
  - JS: STUN transport manager + socket/datachannel glue
  - WASM/core: peer lifecycle events and canonical peer state transitions
- Actual responsibility:
  - Transport adaptation in JS; peer authority in core network/routing
- Recommended location:
  - Network subsystem (with STUN as transport facet), not wallet and not generic utility bucket

### Message buffer processing
- Current location:
  - JS forwards bytes to WASM
  - WASM/core decodes/processes via `network_peer.process_incoming_buffer`
- Actual responsibility:
  - Network/protocol ingress and event dispatch
- Recommended location:
  - `core.network` (routing/peer protocol path)

### Balance snapshot application
- Current location:
  - WASM entrypoint invokes wallet write-lock and wallet method
  - Core wallet owns actual mutation
- Actual responsibility:
  - Wallet state mutation
- Recommended location:
  - Wallet subsystem

### Wallet version
- Current location:
  - Exposed as top-level JS bridge call, but mutates wallet field in core
  - Consumed by handshake/peer version logic
- Actual responsibility:
  - Wallet-owned metadata with network handshake implications
- Recommended location:
  - Wallet namespace ownership (`wallet` responsibility), even if consumed by network handshake

## Bottom Line
- Core ownership is already strongest in network/routing and wallet mutation paths.
- `saito-js` mostly acts as transport adapter + wrapper/orchestration layer.
- Responsibility boundaries implied by current code:
  - Network/routing owns peer lifecycle and message protocol
  - Wallet owns balance snapshot application and wallet metadata (`wallet_version`)
  - JS STUN manager should remain transport adapter, not peer authority.
