# WASM / Core Network Structure Report

Scope:
- `rust/saito-wasm/src/`
- `rust/saito-core/src/`
- JS entry/bridge path where needed for flow tracing

Goal:
- Map current network-related responsibilities to support a unified `WasmNetwork` interface design.

---

## Part 1 — Network-Related WASM Functions

All items below are exported from `rust/saito-wasm/src/saitowasm.rs` via `#[wasm_bindgen]` and are network-facing or network-adjacent.

### Peer lifecycle / peer queries

1. `process_new_peer(peer: WasmNetworkPeer)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: accepts a network peer object from JS and emits `NetworkEvent::PeerConnectionResult`.
- Core module called: `routing_thread.process_network_event(...)`.

2. `process_stun_peer(public_key: JsString) -> Result<(), JsValue>`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: parses key and emits `NetworkEvent::AddStunPeer`.
- Core module called: `routing_thread.process_network_event(...)`.

3. `remove_stun_peer(public_key: JsString)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: parses key and emits `NetworkEvent::RemoveStunPeer`.
- Core module called: `routing_thread.process_network_event(...)`.

4. `process_peer_disconnection(key: JsString)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: parses key and emits `NetworkEvent::PeerDisconnected` with external disconnect type.
- Core module called: `routing_thread.process_network_event(...)`.

5. `get_peers() -> Array`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: reads current peer collection and returns connected peers as `WasmPeer[]`.
- Core module called: reads `routing_thread.network.peer_lock`.

6. `get_peer(key: JsString) -> Option<WasmPeer>`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: resolves one peer by public key.
- Core module called: reads `routing_thread.network.peer_lock`.

### Message processing / network events

7. `process_msg_buffer_from_peer(buffer, peer) -> Uint8Array`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: main ingress for bytes from a peer; delegates parsing/protocol handling.
- Core module called:
  - `network_peer.process_incoming_buffer(...)` in core
  - callback feeds generated events into `routing_thread.process_network_event(...)`.

8. `process_fetched_block(buffer, hash, block_id, key)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: reports successful block fetch from peer.
- Core module called: emits `NetworkEvent::BlockFetched` into `routing_thread`.

9. `process_failed_block_fetch(hash, block_id, key)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: reports block fetch failure for sync/congestion tracking.
- Core module called: emits `NetworkEvent::BlockFetchFailed` into `routing_thread`.

### API messaging over network

10. `send_api_call(buffer, msg_index, key)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: wraps payload as `Message::ApplicationMessage(ApiMessage)` and sends to one peer or broadcast.
- Core module called: `routing_thread.network.io_interface.send_message(...)` / `send_message_to_all(...)`.

11. `send_api_success(buffer, msg_index, key)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: wraps payload as `Message::Result(ApiMessage)` and sends to peer.
- Core module called: `routing_thread.network.io_interface.send_message(...)`.

12. `send_api_error(buffer, msg_index, key)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: wraps payload as `Message::Error(ApiMessage)` and sends to peer.
- Core module called: `routing_thread.network.io_interface.send_message(...)`.

### Transaction propagation

13. `propagate_transaction(tx: &WasmTransaction)`
- File: `rust/saito-wasm/src/saitowasm.rs`
- What it does: clones/signature-contextualizes tx, then emits consensus event.
- Core module called: `consensus_thread.process_event(ConsensusEvent::NewTransaction { ... })`.

Note:
- It does **not** directly call `routing_thread.network.propagate_transaction(...)` (that path is present but commented out in this function).

---

## Part 2 — Trace Into Core and State Impact

### `process_msg_buffer_from_peer`
- Core handlers:
  - `core/routing/peers/network_peer.rs` (`process_incoming_buffer`)
  - downstream `routing_thread.process_network_event`
- State impact:
  - **Peer collection:** yes (handshake/peer events, status updates via emitted network events)
  - **Mempool:** indirect via incoming transaction messages eventually routed to consensus events
  - **Blockchain:** indirect via sync/block request/response events
  - **Wallet:** indirect (e.g., handshake/key-list/version interactions)

### `process_stun_peer` / `remove_stun_peer`
- Core handlers:
  - `routing_thread.process_network_event`
  - `peer_collection.handle_new_stun_peer` / `peer_collection.remove_stun_peer`
- State impact:
  - **Peer collection:** yes (insert/remove STUN peer records)
  - **Mempool:** no direct modification
  - **Blockchain:** no direct modification
  - **Wallet:** no direct modification

### `process_peer_disconnection`
- Core handlers:
  - `routing_thread.handle_peer_disconnect(...)` via network event
- State impact:
  - **Peer collection:** yes (status/disconnect lifecycle)
  - **Mempool / blockchain / wallet:** no direct write in this entrypoint

### `process_fetched_block` / `process_failed_block_fetch`
- Core handlers:
  - `routing_thread` event handling (`BlockFetched` / `BlockFetchFailed`)
  - routed to verification/sync state paths
- State impact:
  - **Peer collection:** yes (congestion updates on failures)
  - **Mempool:** indirect (fetched blocks can be queued/validated through consensus path)
  - **Blockchain:** yes, via downstream sync/verification/consensus processing
  - **Wallet:** indirect via chain progression

### `send_api_call` / `send_api_success` / `send_api_error`
- Core handlers:
  - message serialization in `core/msg/message.rs`
  - transport dispatch through `routing_thread.network.io_interface`
- State impact:
  - **Peer collection:** no direct mutation
  - **Mempool:** no direct mutation
  - **Blockchain:** no direct mutation
  - **Wallet:** no direct mutation
- Role: transport/messaging egress.

### `propagate_transaction`
- Core handlers:
  - enters consensus via `ConsensusEvent::NewTransaction`
  - consensus thread enqueues tx into mempool path (`txs_for_mempool` / GT mempool logic)
- State impact:
  - **Peer collection:** indirect congestion counters for routed peers in consensus path
  - **Mempool:** yes (primary immediate effect)
  - **Blockchain:** indirect (bundling/add-blocks happens later)
  - **Wallet:** can affect pending/derived wallet state indirectly after processing

---

## Part 3 — Peer Management (`wasm_peer.rs`, `wasm_peer_service.rs`, `wasm_network_pure.rs`)

### Located files
- `wasm_peer.rs`: present
- `wasm_peer_service.rs`: present
- `wasm_network_pure.rs`: **not present in `rust/saito-wasm/src/`**

### What is a "peer" in WASM?
- `WasmPeer` (`wasm_peer.rs`) is a JS-facing wrapper around core `Peer`.
- `WasmNetworkPeer` (`wasm_network_peer.rs`) wraps core `NetworkPeer` for handshake/message ingress flow.
- These are adapters, not authoritative stores.

### Where is canonical peer list stored?
- In core: `PeerCollection` (`core/routing/peers/peer_collection.rs`), keyed by `SaitoPublicKey`.
- Accessed via `routing_thread.network.peer_lock`.

### Which module owns peer lifecycle?
- `routing_thread` owns lifecycle orchestration via `process_network_event`.
- `peer_collection` owns concrete peer add/remove/update operations.

### Is `routing_thread` the authority over peers?
- Yes, functionally:
  - It is the event authority and dispatcher for peer lifecycle.
  - It delegates concrete mutations to `peer_collection`, which is its managed state.

---

## Part 4 — Transaction Propagation Flow (JS → WASM → Core)

### Flow
1. JS calls into WASM `propagate_transaction(...)` (from Saito JS network layer).
2. WASM function in `saitowasm.rs` prepares tx and sends:
   - `consensus_thread.process_event(ConsensusEvent::NewTransaction { transaction })`.
3. Consensus thread handles `NewTransaction`:
   - updates stats/congestion metadata
   - pushes to mempool pipeline (`txs_for_mempool` / GT path)
4. Later consensus/routing/block production propagate effects outward.

### Answers
- Responsible WASM function: `propagate_transaction`.
- Does it go through `routing_thread` first? No, it enters `consensus_thread` directly.
- Interact with mempool before broadcast? Yes; mempool intake is the immediate path.

---

## Part 5 — STUN / IO Layer (`wasm_io_handler.rs`)

### Where STUN connects into WASM
- STUN peer lifecycle entrypoints are exported in `saitowasm.rs`:
  - `process_stun_peer`, `remove_stun_peer`
- JS STUN data channel layer triggers these exports.

### `wasm_io_handler.rs` role
- Implements core `InterfaceIO` for WASM environment.
- Bridges core IO requests to JS `MsgHandler` (`/js/msg_handler.js`) for:
  - connect/disconnect peer
  - send_message/send_message_to_all
  - fetch_block_from_peer
  - process_api_call/success/error callbacks
  - interface events

### Does STUN directly create peers or emit events?
- In WASM/core path, STUN functions emit events (`AddStunPeer`/`RemoveStunPeer`) rather than constructing full peer lifecycles directly.
- Actual peer insertion/removal happens in core `peer_collection` via routing thread event handling.

---

## Part 6 — Current Structure Summary (Function Map)

## NETWORK FUNCTION MAP

### Message Processing
- wasm: `process_msg_buffer_from_peer`
- core: `network_peer.process_incoming_buffer` + `routing_thread.process_network_event`
- owner: routing + peer protocol pipeline

### Peer Lifecycle
- wasm: `process_new_peer`, `process_stun_peer`, `remove_stun_peer`, `process_peer_disconnection`, `get_peers`, `get_peer`
- core: `routing_thread` + `peer_collection`
- owner: network routing / peer subsystem

### Block Sync Events
- wasm: `process_fetched_block`, `process_failed_block_fetch`
- core: `routing_thread` (sync state, verification routing, congestion tracking)
- owner: routing sync subsystem (with consensus/verification downstream)

### Transaction Propagation
- wasm: `propagate_transaction`
- core: `consensus_thread` (`NewTransaction` event), mempool intake
- owner: consensus+mempool ingestion path (network dissemination follows later)

### API Messaging
- wasm: `send_api_call`, `send_api_success`, `send_api_error`
- core: `Message::{ApplicationMessage, Result, Error}` + `network.io_interface.send_*`
- owner: transport/messaging layer

### IO/Transport Bridge
- wasm: `WasmIoHandler` (`wasm_io_handler.rs`)
- core: consumed as `InterfaceIO` by routing/network/storage/wallet contexts
- owner: adapter between core and host JS runtime

---

## Part 7 — Design Insight

1. Is network conceptually unified in core but split across modules?
- Yes.
- Core already has a coherent network domain, but responsibilities are distributed across:
  - routing thread (event authority/orchestration),
  - peer collection (peer state),
  - network peer protocol parser,
  - network IO adapter,
  - consensus handoff points.

2. Would a single `WasmNetwork` interface reduce duplication and simplify JS integration?
- Conceptually yes.
- Current WASM exports are already network-shaped but spread across top-level functions; grouping them under a unified surface would align with how core is mentally modeled.

3. Candidate function groups for a unified `WasmNetwork` surface
- Peers:
  - `get_peers`, `get_peer`
  - peer lifecycle events (`process_new_peer`, `process_peer_disconnection`)
  - STUN events (`process_stun_peer`, `remove_stun_peer`)
- Messaging / ingress:
  - `process_msg_buffer_from_peer`
  - API transport (`send_api_call`, `send_api_success`, `send_api_error`)
- Sync events:
  - `process_fetched_block`, `process_failed_block_fetch`
- Propagation:
  - `propagate_transaction`

Likely internal submodules (conceptual):
- peers (peer lifecycle/state)
- transport/io (wire send/receive + host bridge)
- protocol (message parsing/dispatch)
- sync (block fetch events/status)
- propagation (transaction/block dissemination hooks)

---

## Notes / Gaps
- Requested file `wasm_network_pure.rs` is not present in the current tree.
- `Network::propagate_transaction(...)` exists in core network module, but current WASM `propagate_transaction` enters via consensus event path, not direct network-propagate call in this function.
