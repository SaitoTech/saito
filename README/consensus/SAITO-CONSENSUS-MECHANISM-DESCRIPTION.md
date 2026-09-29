# Saito consensus specification

This document states the rules implemented by the Saito node at commit `79ecd3d4ecac532ab341e07623adf8c57c9349c9`. A candidate block or chain is valid or preferred exactly when the procedures below say so. Appendix B maps each rule to source.

**Arithmetic.** `Currency`, `Timestamp`, and `BlockId` are `u64`. `difficulty` is `u64`. Timestamps are milliseconds. Amounts are integer nolan (`1` SAITO = `100_000_000` nolan). Unsigned `+`, `-`, and `*` use Rust operators: a debug build aborts on overflow; a release build wraps modulo `2^64`. Unsigned division truncates toward zero. Signed division (`i128`) truncates toward zero. A divisor of zero aborts the process. Casting a finite `f64` to `u64` truncates toward zero; `NaN` becomes `0`; a value outside the `u64` range saturates at `0` or `u64::MAX`. `f64::round` rounds halfway cases away from zero. `f64` arithmetic is IEEE-754 binary64. Integers above `2^53` are not all exactly representable as `f64`.

**Hash.** `hash(bytes)` is BLAKE3-256, a 32-byte digest. With the `with-rayon` feature and an input longer than `128_000` bytes, the implementation calls BLAKE3's parallel update; the digest is the BLAKE3 digest of the same bytes either way. The `saito-rust` default feature set enables `with-rayon`.

**Signatures.** `sign(message, private_key)` computes `digest = hash(message)` and returns a 64-byte compact secp256k1 ECDSA signature on that digest. `verify(message, signature, public_key)` accepts when `verify_signature(hash(message), signature, public_key)` accepts. `verify_signature` accepts when the 33-byte key parses as a compressed secp256k1 public key, the 64 bytes parse as a compact ECDSA signature, and secp256k1 verification of that digest succeeds. Otherwise it returns false. `sign` aborts if `private_key` is not a valid 32-byte secp256k1 secret.

**Configuration that changes these rules.** `genesis_period`, `heartbeat_interval`, and `default_social_stake` / `default_social_stake_period` are node configuration, not header fields. Two nodes with different values compute different burn fees, required work, moving averages, ATR payouts, staking requirements, and reorganization windows. Defaults are in Appendix A. The rest of this document writes `G` for the running node's `genesis_period` and `H` for its `heartbeat_interval`.

---

## 1. Types

| Name | Definition |
|---|---|
| Public key | 33 bytes. Key generation repeats until the base58 form has length 44. Validation does not check that length. |
| Signature | 64 bytes. |
| Hash | 32 bytes. |
| UTXO key | 59 bytes, defined in §3. |
| Slip type | `u8`: Normal `0`, ATR `1`, VipInput `2`, VipOutput `3`, MinerInput `4`, MinerOutput `5`, RouterInput `6`, RouterOutput `7`, BlockStake `8`, Bound `9`, P2SH `10`. Any other byte makes the slip fail to parse. |
| Transaction type | `u8`: Normal `0`, Fee `1`, GoldenTicket `2`, ATR `3`, Vip `4`, SPV `5`, Issuance `6`, BlockStake `7`, Bound `8`. Any other byte makes the transaction fail to parse. |

A slip that fails to parse, or a transaction that fails to parse, makes the enclosing block fail to parse. A block shorter than `389` bytes fails to parse.

---

## 2. Block header

The on-wire header is `389` bytes, big-endian. Offsets are from the start of the block bytes. The 4-byte transaction count is part of this header.

| Offset | Width | Field | Rule that fixes the value |
|---|---|---|---|
| 0 | 4 | transaction count `u32` | Number of transactions that follow. `0` is allowed only as described in §8. |
| 4 | 8 | `id` | If the parent is in the node's block map, `id` must equal `parent.id + 1` (`u64` addition; `parent.id == u64::MAX` rejects the child). Block creation with a missing parent uses `id = 1`. |
| 12 | 8 | `timestamp` | Milliseconds chosen by the producer. No validity rule compares it with the local clock. §4 states every timestamp rule that does exist. |
| 20 | 32 | `previous_block_hash` | Hash of the parent, or 32 zero bytes for a parentless block. |
| 52 | 33 | `creator` | Public key that must satisfy the block signature. Production sets this to the node's wallet public key. |
| 85 | 32 | `merkle_root` | §2.3. |
| 117 | 64 | `signature` | §2.2. |
| 181 | 8 | `graveyard` | §10. |
| 189 | 8 | `treasury` | §10. |
| 197 | 8 | `burnfee` | §5. |
| 205 | 8 | `difficulty` | §7. |
| 213 | 8 | unused `avg_total_fees` copy | Parsed and discarded. Not an input to the signature preimage and not compared with the recomputed average. |
| 221 | 8 | `avg_fee_per_byte` | §11. |
| 229 | 8 | `avg_nolan_rebroadcast_per_block` | §11. |
| 237 | 8 | `previous_block_unpaid` | §9. |
| 245 | 8 | `avg_total_fees` | The copy that is kept. §11. |
| 253 | 8 | `avg_total_fees_new` | §11. |
| 261 | 8 | `avg_total_fees_atr` | §11. |
| 269 | 8 | `avg_payout_routing` | §11. |
| 277 | 8 | `avg_payout_mining` | §11. |
| 285 | 8 | `avg_payout_treasury` | §11. The previous-block input to this average is the constant `0`. |
| 293 | 8 | `avg_payout_graveyard` | §11. The previous-block input is the constant `0`. |
| 301 | 8 | `avg_payout_atr` | §11. The previous-block input is the constant `0`. |
| 309 | 8 | `total_payout_routing` | §9. |
| 317 | 8 | `total_payout_mining` | §9. |
| 325 | 8 | `total_payout_treasury` | §9. |
| 333 | 8 | `total_payout_graveyard` | §9. |
| 341 | 8 | `total_payout_atr` | §12. |
| 349 | 8 | `total_fees` | §8. |
| 357 | 8 | `total_fees_new` | §8. |
| 365 | 8 | `total_fees_atr` | §12. |
| 373 | 8 | `fee_per_byte` | §8. |
| 381 | 8 | `total_fees_cumulative` | §8 and §12. |

Transactions follow at offset `389`, each encoded as in §3.

Fields that are not in the header and are recomputed from the body before validation: `hash`, `pre_hash`, `total_work`, `has_golden_ticket`, `has_fee_transaction`, `has_issuance_transaction`, `has_staking_transaction`, the corresponding indexes, `total_rebroadcast_slips`, `rebroadcast_hash`, and each transaction's `total_in`, `total_out`, `total_fees`, `total_work_for_me`, `cumulative_fees`, and `hash_for_signature`.

`has_checkpoint` is not in the header. §14 states when it is set.

### 2.1 Block hash

`pre_hash = hash(signature_preimage)` where the preimage is the concatenation, big-endian, of:

`id`, `timestamp`, `previous_block_hash`, `creator`, `merkle_root`, `graveyard`, `treasury`, `burnfee`, `difficulty`, `avg_fee_per_byte`, `avg_nolan_rebroadcast_per_block`, `previous_block_unpaid`, `avg_total_fees`, `avg_total_fees_new`, `avg_total_fees_atr`, `avg_payout_routing`, `avg_payout_mining`.

The unused 8 bytes at offset 213 are not in this preimage. Neither are the signature, the transaction bodies, `fee_per_byte`, any `total_fees*`, any `total_payout*`, or `avg_payout_treasury`, `avg_payout_graveyard`, `avg_payout_atr`.

`block.hash = hash(previous_block_hash || pre_hash)`.

### 2.2 Block signature

`signature = sign(signature_preimage, creator_private_key)`.

Validation accepts the signature when `verify_signature(pre_hash, signature, creator)` accepts. Validation recomputes `pre_hash` from the header fields during `generate` before this check, so the signed bytes are the preimage above, not a hash of the raw header.

### 2.3 Merkle root

If the transaction vector is empty and the node is in browser or SPV mode, the root is the header value unchanged.

Otherwise, if the transaction vector is empty, the root is 32 zero bytes.

Otherwise build a binary tree of leaves in transaction order:

- If `txs_replacements <= 1`, one leaf whose hash is `hash_for_signature` if that field is set, and 32 zero bytes if it is not.
- If `txs_replacements > 1`, that many identical leaves, each with `hash_for_signature` or 32 zero bytes if unset.

Pair leaves from the left. A pair's hash is `hash(left_hash || right_hash)`. A node with no right sibling keeps the left hash unchanged. Repeat until one node remains. That node's hash is the merkle root. `hash_for_signature` for a non-SPV transaction is `hash(tx_signature_preimage)` from §3.2. For `TransactionType::SPV` it is the first 32 bytes of `signature`.

---

## 3. Transactions and slips

### 3.1 Slip

On-wire size `59` bytes: public key `33`, amount `u64`, `block_id` `u64`, `tx_ordinal` `u64`, `slip_index` `u8`, type `u8`.

UTXO key, 59 bytes, concatenation of: public key `33`, `block_id` as 8 big-endian bytes, `tx_ordinal` as 8 big-endian bytes, `slip_index` as 1 byte, `amount` as 8 big-endian bytes, type as 1 byte.

`Slip::validate(utxoset)`: if `amount == 0`, the result is true. If `amount > 0`, the result is true only when the UTXO map contains this slip's UTXO key and the stored bool is `true`.

Signature bytes of an input or an output, used inside the transaction preimage, are: public key, amount, `slip_index`, type. `block_id` and `tx_ordinal` are not signed.

While computing fees, every output is rewritten, for every slip type, to `block_id = current block id`, `tx_ordinal = index of this transaction in the block` (see §3.4), and `slip_index = position of the output in `to`, as `u8``. The condition in the source is `slip_type != ATR || slip_type != Bound`, which is true for every slip. A transaction with more than 255 outputs cannot set `slip_index` past `u8`; `add_to_slip` refuses a 256th output, and parsing rejects an output count above 255.

### 3.2 Transaction encoding and signature

On-wire layout: `from` count `u32`, `to` count `u32`, data length `u32`, path length `u32`, signature `64`, timestamp `u64`, `txs_replacements` `u32`, type `u8`, then `from` slips, `to` slips, data bytes, hops. A count of inputs or outputs above 255 fails parsing. The fixed prefix is `93` bytes. Each hop is `130` bytes: `from` 33, `to` 33, signature 64.

`txs_replacements` defaults to `1`. It changes the merkle leaf count and, for `SPV` only, how the per-transaction ordinal advances (§3.4). It is not otherwise checked.

Signature preimage: `timestamp` as 8 bytes, then each input's signature bytes, then each output's signature bytes, then `txs_replacements` as 4 bytes, then the type as a `u32` (not a `u8`), then `data`.

`hash_for_signature = hash(preimage)`, except for type `SPV`, where it is `signature[0..32]`.

`sign` sets each output's `slip_index` to its position, then sets `signature = sign(preimage, private_key)`.

### 3.3 Fee

For a transaction, after the location rewrite in §3.1:

```
total_in  = sum of amount over inputs whose type is not Bound
total_out = sum of amount over outputs whose type is not Bound
total_fees = total_in - total_out    if total_in > total_out
           = 0                        otherwise
```

Bound amounts are omitted from both sums. There is no minimum fee. A transaction with `total_out > total_in` has `total_fees = 0` at this step; user-originated types are then rejected by the check in §3.5.

`cumulative_fees` for the transaction at position `i` is the sum of `total_fees` of transactions `0..=i`, in vector order.

### 3.4 Ordinals

`generate` walks transactions in vector order. The ordinal passed into fee generation starts at `0`. After a non-SPV transaction it increases by `1`. After an SPV transaction it increases by `txs_replacements` (`u32` converted to `u64`). That ordinal is written into every output as `tx_ordinal`.

### 3.5 Validity, by type

Parsing limits: more than 255 inputs or 255 outputs rejects the transaction. These limits are also enforced by the parser.

The duplicate-input test in `Transaction::validate` builds a vector of the inputs' UTXO keys and compares its length with `from.len()`. Those lengths are equal for every transaction, so this test never rejects. Duplicate spends are handled by the block-level map in §8.

**Authorizer.** Walk inputs. Type `ATR` skips the rest of this walk. Type `Bound` is skipped. A public key whose first byte is `0x00` records that input index as a P2SH index and is not an authorizer. Types `Normal`, `ATR`, `MinerOutput`, `RouterOutput`, and `BlockStake` must all share one public key; a second distinct key rejects the transaction. That key is the authorizer. Type `P2SH` with `amount != 0` rejects the transaction. Other types do not set the authorizer.

**P2SH scripts.** For each recorded P2SH index, in order: `data` must be UTF-8 JSON; the JSON object must contain an array `access_scripts` whose length equals the number of P2SH indexes; the entry for this index must be a non-empty JSON text of a JSON value. The script hash is `hash(canonical_json(script_without_witness_keys))` as lowercase hex. Canonical JSON sorts object keys, preserves array order, and encodes scalars with the usual JSON forms (`true`, `false`, `null`, decimal numbers, quoted strings). Every object key named `witness` is removed at every depth before hashing. The input's public key must be `0x00 || those 32 hash bytes`. The script evaluator is then called with the spending transaction, no block, the blockchain, and this P2SH index. It must return `1`.

The evaluator reads `op` from the root JSON object, uppercased. Missing or empty `op` returns `0`.

- `AND`: evaluate `args` in order. Return `0` on the first child that returns `0`. If every child returns non-zero, or `args` is missing, return `1`.
- `OR`: return `1` on the first child that returns `1`. If none do, or `args` is missing, return `0`.
- `NOT`: if `args` is empty or missing, return `1`. Otherwise return `1` when the first child returns `0`, and `0` when it returns non-zero.
- Any other `op` is one of: `CHECKHASH`, `CHECKSIG`, `CHECKMULTISIG`, `IMPORTFIELD`, `IMPORTARRAY`, `SUMFIELDS`, `SCRIPTHASH`, `SETFIELD`, `SETARRAY`, `SETARRAYFIELD`, `ARRAYIFY`, `CHECKFIELD`, `CHECKKEY`, `CHECKOWN`, `CHECKOWNNFT`, `CHECKOWNNFTWHERE`, `CHECKSENDER`, `CHECKRECIPIENT`, `CHECKPATH`, `CHECKPATHHOP`, `CHECKTIME`. An unknown name returns `0`.

Because the block argument is `None`, `CHECKTIME` returns `0` on this path. The evaluator also sets a context field `NOW` to the local wall clock in milliseconds (on `wasm32`, `Date.now()`). Opcodes that resolve a reference to `NOW` therefore read that clock. `CHECKTIME` does not read `NOW`; it returns `0` before any comparison.

`CHECKSIG` returns `1` only when `script.publickey` is non-empty base58 of a 33-byte key, `script.msg` resolves to a non-empty message string, `witness.signature` is non-empty hex of 64 bytes, a P2SH authorization hash is available, and `verify` accepts the message `"{message}|{p2sh_auth_hash}"` under that key.

`CHECKHASH` returns `1` only when `script.hash` and `witness.input` are non-empty and `hash(input_utf8) ` as hex equals `script.hash`.

`CHECKSENDER` returns `1` when some input public key's base58, compared case-insensitively, equals `script.publickey`. `CHECKRECIPIENT` is the same test against outputs.

`CHECKFIELD` compares a resolved field with a resolved value. Operators `==` and `equals`, `!=`, `<`, `<=`, `>`, `>=` apply to two `u64` numbers, or two strings (byte order), or `==` / `!=` on two bools. `IN` returns `1` when the left value equals some element of a right-hand array under those same typed equalities. `NOT` returns `1` when it equals none of them. Null, a non-`u64` number, or a type mismatch returns `0`.

`CHECKKEY` tests key presence on a resolved object: `==` present, `!=` absent, `IN` every object key is in the supplied list, `NOT` no object key is in the supplied list.

`CHECKOWN` returns `1` only when `script.utxokey` parses as a 59-byte key, `is_slip_unlocked` is true for it (§3.6), the transaction has an input, `hash_for_signature` is not 32 zero bytes, and `verify_signature` accepts that hash under `from[0].public_key`.

`CHECKPATH` returns `1` when `witness.hops` is a non-empty array and each hop in order has string fields `to`, `value`, and `sig`, the first signer is `script.publickey`, and `verify` accepts `hash(utf8("{to}|{value}|{script.hash}"))` under the current signer, after which the signer becomes `to`.

`SCRIPTHASH` returns `1` after storing `Script::hash()` of a resolved JSON object under `context.__opcodes.scripthash.<into>`, where `into` is a non-empty ASCII identifier of letters, digits, and underscore. It returns `0` if the resolved value is not an object.

The remaining dispatched opcodes (`CHECKMULTISIG`, `IMPORTFIELD`, `IMPORTARRAY`, `SUMFIELDS`, `SETFIELD`, `SETARRAY`, `SETARRAYFIELD`, `ARRAYIFY`, `CHECKOWNNFT`, `CHECKOWNNFTWHERE`, `CHECKPATHHOP`) return `0` or `1` from their own validators and may write `context` fields that later opcodes read. Their source files are listed in Appendix B. A script whose root returns anything other than `1` rejects the transaction.

**Fee.** After the checks above, type `Fee` returns true. Inputs are not checked against the UTXO set. The signature is not checked here. The block-level hash comparison in §8 is the fee-transaction check. A fee transaction with no outputs still returns true.

**Issuance.** If the type is `Issuance` and `blockchain.get_latest_block_id() >= 1`, the transaction is rejected. `get_latest_block_id` is the longest-chain tip id, which is still `0` when block `1` is validated before it is marked as the tip. Issuance does not pass through the user-originated signature or value checks below. It still requires at least one output.

**SPV.** If type is `SPV`: reject if `from` or `to` is non-empty, or `total_fees > 0`, or `total_in > 0`, or `total_out > 0`, or `path` is non-empty. Otherwise accept. SPV transactions are not rejected by block validation solely for having this type.

**BlockStake.** Every output must be `BlockStake` or `Normal`. The sum of `BlockStake` output amounts must be `>= social_stake_requirement` (a node configuration value; default in Appendix A). If UTXO checking is enabled, every input must pass `is_slip_unlocked` (§3.6); failure rejects the transaction.

**User-originated types.** This group is every type other than `ATR`, `Issuance`, and `Fee`. It includes `Normal`, `GoldenTicket`, `Vip`, `SPV` (already returned), `BlockStake`, and `Bound`.

- `from` must be non-empty, except that type `BlockStake` with `social_stake_requirement == 0` may have an empty `from`.
- If an authorizer was set, `hash_for_signature` must be present and `verify_signature(hash_for_signature, signature, authorizer)` must accept.
- If there is no authorizer and no P2SH index, reject, with the same `BlockStake` and zero-requirement exception.
- `validate_routing_path` must accept (§6).
- If `total_out > total_in`, reject. The source repeats an exclusion of type `Fee`, which is not in this group.

**Bound, in addition.** Inputs and outputs are scanned for tuples `(Bound, Normal or ATR, Bound)` occupying three consecutive slips. A `Bound` slip that is not the start of such a tuple rejects the transaction. Inside a tuple, the first amount must be non-zero, the third amount must be `0`, every first-slip public key must be the same creator, every third-slip public key must be the same 33-byte UUID, and every middle-slip public key on the input side must be the same sender.

If there are zero input tuples and at least one output tuple, this is a create: `from` must be non-empty, `from[0]` must not be `Bound`, `to[0].amount` must be non-zero, the sum of output tuple first-slip amounts must be non-zero, the creator must equal `from[0].public_key`, and the UUID must equal the 33 bytes formed by `from[0].block_id` as 8 big-endian bytes, `from[0].tx_ordinal` as 8 big-endian bytes, `from[0].slip_index` as 1 byte, and bytes 17..33 copied from the UUID that was parsed from the output. Bytes are indexed from 0; byte 16 is `slip_index`; bytes 17 through 32 are the remaining 16 bytes.

If there is at least one input tuple and zero output tuples, the NFT amounts need not match. If both sides have tuples, the sum of input first-slip amounts must equal the sum of output first-slip amounts. Zero input tuples and zero output tuples rejects the transaction.

On the output side, if the creator differs from the creator established by earlier tuples, the transaction is rejected when that established creator also differs from the middle slip's public key. When the established creator equals the middle slip's public key, the mismatch is not a rejection.

**Other types and Bound slips.** If the type is not `Bound` and not `ATR`, any `Bound` slip in `from` or `to` rejects the transaction.

**Outputs.** Except for types that already returned (`Fee`, `SPV`), `to` must be non-empty.

**UTXO set.** If UTXO checking is enabled: types `Fee` and `ATR` skip it. Every other type requires `Slip::validate` on every input.

`Vip` has no rule beyond the user-originated rules. `MinerInput` and `VipInput` do not qualify as authorizer slip types.

### 3.6 Stake unlock

`is_slip_unlocked(key)` is false if the key does not parse, is absent from the UTXO map, or is stored as `false`. If the slip type is `BlockStake` and `slip.block_id > latest_unlocked_stake_block_id`, it is false. Otherwise it is true.

```
latest_unlocked_stake_block_id =
    latest_block_id + 1 - social_stake_period    if latest_block_id > social_stake_period
    0                                             otherwise
```

`social_stake_period` is node configuration. Default `100`.

### 3.7 Transaction timestamp

`timestamp` is an `u64` in the signature preimage. `Transaction::validate` does not compare it with the local clock, with the block timestamp, or with any other timestamp.

---

## 4. Time

Checked functions: `Block::validate`, `Block::create`, `Mempool::bundle_block`, `Mempool::can_bundle_block`, `BurnFee::calculate_burnfee_for_block`, `BurnFee::return_routing_work_needed_to_produce_block_in_nolan`, `Blockchain::add_block`, `Transaction::validate`, network send/receive paths in `network.rs` and `routing_thread.rs`, and `Script::validate` / `CheckTime::validate`.

| Layer | Rule |
|---|---|
| Block validation | No comparison with the local clock. No maximum future offset. No minimum gap other than the burn-fee consequences below. |
| Burn fee and required work | If `previous.timestamp >= this.timestamp`, both the next burn fee and the required routing work are `10_000_000_000_000_000_000`. A header that does not carry that burn fee is rejected. A header that does carry it is rejected unless `total_work` is at least that same number. |
| Block production | `bundle_block` produces nothing when `current_timestamp <= parent.timestamp`. |
| Block production delay | `can_bundle_block` produces nothing when `current_timestamp < parent.timestamp + d`, where `d = low_128_bits(U256(hash(creator_public_key \|\| parent.hash))) mod 5000`. `5000` is `Duration::from_secs(5)` in milliseconds. `d` is in `0..=4999`. This delay is not applied during validation. |
| Mempool and network | No other rejection or delay based on a block or transaction timestamp versus the local clock. |
| P2SH | `CHECKTIME` is not evaluated against a block on the transaction-validation path, so it returns `0`. `NOW` inside the script context is the local wall clock, as stated in §3.5. |

`lowest_acceptable_timestamp` is recorded when the first longest-chain block is applied and is persisted. No validation function reads it to accept or reject a block.

---

## 5. Burn fee and required work

Constants: `BURNFEE_MULTIPLIER = 100_000_000.0` (`f64`). Sentinel `S = 10_000_000_000_000_000_000`.

Let `prev_bf` be the parent's `burnfee` (`u64`), `t` this block's timestamp, `p` the parent's timestamp, `H` the configured heartbeat in milliseconds.

**Required routing work** `W(prev_bf, t, p, H)`:

- If `p >= t`, return `S`.
- Let `elapsed = max(t - p, 1)`. The `max` with `1` is not reached when `p >= t`, because that case already returned.
- If `elapsed >= 2 * H` (`u64` multiplication; debug builds abort if `2 * H` overflows), return `0`.
- Otherwise return `(round((prev_bf as f64 / 100_000_000.0) / (elapsed as f64) * 100_000_000.0))` cast to `u64` by the cast rule in the introduction.

At elapsed `0` the function does not divide: it returns `S` because `p >= t`. At elapsed `>= 2H` it returns `0` for every `prev_bf`, including a very large `prev_bf`. There is no further clamp.

**Next burn fee** `B(prev_bf, t, p, H)`:

- If `p >= t`, return `S`.
- If `prev_bf == 0`, return `50_000_000`.
- Let `elapsed = max(1, t - p)`.
- Let `scaled = prev_bf as f64 / 100_000_000.0`.
- Let `raw = round(scaled * sqrt(H as f64 / elapsed as f64) * 100_000_000.0)` cast to `u64`.
- The caller then sets `burnfee = 1` when `raw == 0`. Otherwise `burnfee = raw`.

If the parent is absent from the block map, the recomputed burn fee is the block's own `burnfee` field and the zero-clamp is not applied. A newly constructed block starts at `burnfee = 0`, so a parentless block created by `Block::create` gets `burnfee = 0` and `difficulty = 0`.

Validation rejects the block when `header.burnfee != recomputed burnfee`.

Validation rejects the block when a parent exists and `total_work < W(parent.burnfee, timestamp, parent.timestamp, H)`. `total_work` is defined in §6. The comparison uses the parent's burn fee, not this block's burn fee.

A block whose parent has `burnfee = 0` has required work `0` whenever `timestamp > parent.timestamp`, because the float quotient is `0`. Its own burn fee is `50_000_000`.

---

## 6. Routing paths and work

### 6.1 Building a path

`Hop::generate` sets `from` to the signing key, `to` to the next public key, and `sig = sign(tx.signature || to, from_private_key)`. `add_hop` appends that hop. It debug-asserts `from != to` and does not itself reject a block.

On propagation, for each connected peer whose public key is not already `from[0].public_key` and not any hop's `from`, the node sends a copy with one new hop from the local wallet key to that peer. That is a relay rule. Validation accepts any path that passes §6.2, including a path built by other means.

### 6.2 Hop validity

`validate_routing_path` accepts an empty path. For each hop `i`:

- `verify(tx.signature || hop.to, hop.sig, hop.from)` must accept.
- `hop.from != hop.to`.
- If `i > 0`, `hop.from` must equal `path[i-1].to`.

There is no minimum hop count other than zero, and no maximum other than what fits in the parsed byte length (`path_len` is a `u32`). The first hop's `from` is not required to equal the sender.

### 6.3 Work credited to the block creator

`generate_total_work(creator)` sets `total_work_for_me`:

- Empty path: `0`.
- If `path[last].to != creator`: `0`.
- Otherwise start from `w = total_fees`. For each index `i` from `1` inclusive to `path.len()` exclusive: if `path[i].from != path[i-1].to`, set `0` and stop; else `w = w - floor(w / 2)`. The result is `w`.

A path of length 1 whose `to` is the creator credits `total_fees` and performs no halving. Each later hop replaces `w` with `ceil(w / 2)` using integer arithmetic (`w - floor(w / 2)`), including leaving `w` unchanged when `w` is `0` or `1`.

The block's `total_work` is the sum, in transaction order, of `total_work_for_me`.

**Same key.** The formulas do not read the sender except through `total_fees` and the path. If the sender, the first hop's `to`, and the creator are the same key, a one-hop path ending at that key credits `total_fees`, provided the hop's `from` is a different key. A hop with `from == to` fails §6.2, so that key cannot be both ends of the hop. If that key is only `path[0].from` and the path's last `to` is someone else, the credit is `0`. No branch adds or removes credit because the sender equals the creator.

### 6.4 Routing-payout selection

This is `Block::find_winning_router(random_number)` on the block being paid, then `Transaction::get_winning_routing_node` on the selected transaction. `random_number` is a 32-byte hash supplied by the payout procedure (§9).

1. Let `x = U256` from the 32-byte `random_number` interpreted big-endian. Let `y = block.total_fees`.
2. If `y == 0`, the result is the 33-byte zero key.
3. Let `r = (x mod U256(y))` as `u64`, using the remainder of `U256` division. `y` is encoded as 8 big-endian bytes. Let `winning_nolan = max(r, 1)`.
4. Scan `transactions` in order. The winner is the first transaction with `cumulative_fees >= winning_nolan`. If none exists, the result is the zero key.
5. If that transaction's type is `ATR`, replace it with `Transaction::deserialize_from_net(transaction.data)`. The network encoding does not contain `total_fees`, `total_in`, `total_out`, or `cumulative_fees`, so the deserialized transaction has `total_fees = 0` and `cumulative_fees = 0`. Its `path`, `from`, `to`, `signature`, and `data` are those of the embedded original. If `data` is not a valid transaction encoding, this step aborts the process (`expect`). If the winner is not `ATR` and its `cumulative_fees` is `0`, this step aborts the process (`assert`). With `winning_nolan >= 1`, the scan in step 4 does not select a transaction whose `cumulative_fees` is `0`.
6. Let `h = hash(random_number)`. Return `get_winning_routing_node(h)` on the transaction from step 4 or 5.

`get_winning_routing_node(random_hash)`:

- Empty path: if `from` is non-empty, return `from[0].public_key`; otherwise return the zero key. This branch runs before the fee check, so an ATR inner transaction with an empty path and a non-empty `from` returns `from[0].public_key` even though its `total_fees` is `0`.
- If `total_fees == 0`, return the zero key. An ATR inner transaction with a non-empty path hits this branch and returns the zero key.
- Otherwise let `f = total_fees`. Hop 0's weight is `f` and its cumulative boundary is `f`. For each later hop, the weight is `floor(previous_weight / 2)` and the boundary is the previous boundary plus that weight. Let `A` be the final boundary.
- Let `win = (U256(random_hash) mod U256(A))` as `u64`. There is no `max(win, 1)` here. `win == 0` is possible.
- Return `path[i].to` for the smallest `i` with `win <= boundary[i]`. If none matches, return the zero key. With `win < A` and the last boundary equal to `A`, a hop matches.

Eligible keys are `path[i].to` under those weights, or `from[0].public_key` when the path is empty and `from` is non-empty, or the zero key in the cases above. The sender is not given a separate weight. The block creator is not given a separate weight. A key may appear more than once and is eligible once per hop that names it as `to`.

The payout weights (`floor` of half, summed) are not the same integers as the creator credit in §6.3 (`w - floor(w/2)` at each later hop).

---

## 7. Who produces a block

Validation does not restrict `creator` to a set of keys. Any public key that produces a signature accepted by §2.2 may be the creator. A valid block may contain only transactions whose slips use that key. It may also contain a golden ticket, a fee transaction, ATR transactions, and a staking transaction.

The node produces a block only on the following path.

- Genesis: if the node is not a browser, the peer list is empty, and no block files are on disk, `generate_genesis_block` is set. The next timer then builds issuance transactions from the on-disk issuance slips (§13), signs them with the wallet, and calls `bundle_genesis_block`. That function does not apply the work test. The parent hash is 32 zero bytes. The creator is the wallet public key. No golden ticket is attached.
- Later blocks: a 1-second timer calls `bundle_block` unless chain sync is in progress (`some connected peer has is_syncing and not is_synced`). Production is skipped when `disable_block_production` is true (the default), or when the node is a browser or in SPV mode, or when the block map is empty. `produce_without_limits` bypasses the browser/SPV check and the sync check; the timer passes `false`.
- `can_bundle_block` returns no block when the block map is empty, when the inbound block queue is non-empty, when the mempool transaction map is empty or `new_tx_added` is false, when the golden-ticket density rule fails for the current tip plus whether a ticket for that tip is in hand (§8, §7.1), or when `current_timestamp <= parent.timestamp`, or when the delay in §4 applies, or when mempool routing work `< W(...)`.
- Mempool routing work is the sum of `total_work_for_me` of transactions accepted into the mempool, computed against the wallet public key at insertion. A golden ticket is not part of that sum; `add_transaction` refuses type `GoldenTicket`.
- If `social_stake_requirement > 0`, the node then builds a `BlockStake` transaction from wallet slips and adds it if `Transaction::validate` accepts it. Failure to build it (insufficient slips) aborts production.
- The golden ticket attached, if any, is the mempool entry whose target equals the current tip hash. At most one ticket is stored per target; a later ticket for the same target is ignored. The ticket is not required to have been mined by this node.
- `Block::create` drains the mempool map. Drain order is hash-map order. The resulting transaction order is whatever order the block commits to; validation uses that order.

The mining thread, disabled in SPV mode, on each timer iteration while active draws up to `mining_iterations` candidates. Each candidate uses `random = hash(32 RNG bytes)` and `public_key = wallet public key`, with `target` equal to the latest longest-chain block hash and `difficulty` equal to that block's `difficulty`. A candidate that passes §7.1 is wrapped by `create_golden_ticket_transaction`: type `GoldenTicket`, `data` the 97-byte ticket, one input and one output of amount `0` to the wallet key, signed by the wallet. It is stored in the mempool under its `target`.

### 7.1 Golden-ticket puzzle

A ticket is 97 bytes: `target` 32, `random` 32, `public_key` 33.

The mining search may set `random` to any 32-byte value and `public_key` to any 33-byte value. The mining thread in this repository fixes `public_key` to the wallet key and varies `random`. Validation does not require `public_key` to equal `creator`.

Acceptance does not use the `target` stored in the transaction. Validation builds a new ticket with `target = parent.hash`, the transaction's `random`, and the transaction's `public_key`, and accepts when

```
leading_zeros(U256_be(hash(target || random || public_key))) >= (difficulty as u32)
```

`U256_be` is the 32-byte digest as a big-endian integer. `leading_zeros` is in `0..=256`. `difficulty as u32` keeps the low 32 bits.

If the BLAKE3 output is uniform on 256 bits, the probability that one `(random, public_key)` pair is accepted at difficulty `d` is:

- `1` when `(d mod 2^32) = 0`;
- `2^(-(d mod 2^32))` when `1 <= (d mod 2^32) <= 256`;
- `0` when `(d mod 2^32) > 256`.

`difficulty = 0` accepts every hash. `difficulty = 256` accepts only the all-zero digest. The stored `target` bytes can be anything; changing them does not change the checked hash.

A block may contain any number of `GoldenTicket` transactions. Nothing rejects `gt_num > 1`. `gt_num` is a `u8` and wraps in a release build past 255. The payout and the puzzle check use the last golden-ticket index in the vector (`gt_index`). Difficulty uses only whether `gt_num > 0`. Every golden ticket, and every `Normal` and `Bound` transaction, adds `get_serialized_size()` to `total_bytes_new` and `total_fees` to `total_fees_new`. `get_serialized_size` is `93 + 59 * (inputs + outputs) + 130 * hops + data.len()`.

If the ticket bytes are not 97 bytes, validation rejects the block when a parent exists. The consensus-value function, if it cannot parse the ticket, returns before payouts are filled (§9).

---

## 8. Block validation order

`Blockchain::add_block` applies these steps in order. Failure at a step rejects the block (`FailedNotValid`) unless another result is named.

1. `generate()`. This recomputes per-transaction fees, work, hashes, cumulative fees, `total_work`, golden-ticket / fee / issuance / staking flags, and `rebroadcast_hash` / `total_rebroadcast_slips` from ATR outputs of type `ATR`. It also builds the spent-slip map if it is not already built: for every non-fee transaction, each input with `amount > 0` and type other than `Bound` increments a counter keyed by UTXO key. A counter above `1` makes `generate` fail and the block is rejected.
2. If `id < genesis_block_id`, reject. `genesis_block_id` starts at `0` and is updated to `max(latest_block_id - G, 1)` when a longest-chain block is applied.
3. If the hash is already stored, the result is `BlockAlreadyExists`.
4. If the hash equals `last_bad_fork_hash`, reject.
5. If the ring is non-empty and the parent is not stored: a parent of 32 zero bytes is not fetched. If the node is loaded or `checkpoint_found` is set, a parent that is the current `last_bad_fork_hash` rejects this block and sets `last_bad_fork_hash` to this block. Otherwise if the parent is already in the mempool queue, the result is retry without a network request. Otherwise if `id - 1 >= max(max(1, latest_id - G), sync_fetch_floor_block_id)`, the result is retry with a network request. Otherwise reject.
6. If the parent is stored and `parent.id + 1 != id`, reject.
7. Insert the block into the ring and the map.
8. If the ring was non-empty and `id < latest_block_id`, the block stays stored and is not a reorganization candidate. The function returns success with `in_longest_chain = false`.
9. Build the new chain and the old chain (§14). Apply the longest-chain test (§14). If it passes, run the golden-ticket density rule once (§15) on the new tip, then wind the chain. Each wound block runs `Block::validate`.
10. After a successful longest-chain add, if `id % 100 == 0`, run the supply check (§13). Failure aborts the process.

`Block::validate` then applies these steps. `validate_against_utxo` is `has_total_supply_loaded` (§13). Several steps run only when that flag is true.

1. If `is_valid` is already true, accept.
2. If `id == 1754546` and `hash` is `f7b293c131384fbfc60f8b4954a23050e8a1df5fd4e66cc51984839b8b35c98b`, accept. If `id == 1754560` and `hash` is `c8323bd736a5e69df1c4a13397a1d3dc7c2c5b432debc48d8099ae37af17d6ee`, accept.
3. If `id == 0`, abort the process (`assert`).
4. In SPV mode, call `generate_consensus_values` and accept. If the node is loaded, set `is_valid`.
5. If `block_type` is `Ghost`, accept.
6. If `transactions` is empty and `id != 1` and the block map is non-empty, reject. A parsed block with a transaction count of `0` has type `Header` unless `id == 1` and `previous_block_hash` is 32 zero bytes.
7. If the block signature check in §2.2 fails, reject.
8. Recompute consensus values (§8.1, §9, §11, §12).
9. If UTXO checking is on, reject on any mismatch of: `total_fees`, `total_fees_new`, `total_fees_atr`, `total_fees_cumulative`, `avg_total_fees`, `avg_total_fees_new`, `avg_total_fees_atr`, `total_payout_routing`, `total_payout_mining`, `total_payout_treasury`, `total_payout_graveyard`, `total_payout_atr`, `avg_payout_routing`, `avg_payout_mining`, `avg_payout_treasury`, `avg_payout_graveyard`, `avg_payout_atr`, `avg_fee_per_byte`, `fee_per_byte`, `avg_nolan_rebroadcast_per_block`.
10. Reject if `burnfee` mismatches §5.
11. Reject if `difficulty` mismatches §7's update rule as computed in §8.1.
12. Reject if `it_num > 0` and `id > 1`.
13. If `social_stake_requirement != 0` and `id > 1` and `st_num != 1`, reject. `st_num` counts `BlockStake` transactions. The requirement is the node configuration value, not a header field.
14. If the parent is stored and its `block_type` is `Ghost`: if the node is loaded, set `is_valid`, and accept. The remaining checks in this function are skipped.
15. If the parent is stored and UTXO checking is on: `treasury` must equal `parent.treasury + total_payout_treasury - total_payout_atr`, and `graveyard` must equal `parent.graveyard + total_payout_graveyard`. Subtraction uses the `u64` rule in the introduction.
16. If the parent is stored: required work (§5), then the golden ticket (§7.1 and §9).
17. If UTXO checking is on: `total_rebroadcast_slips` must equal the recomputed count, and `rebroadcast_hash` must equal the recomputed hash (§12). `total_rebroadcast_nolan` is not compared.
18. `merkle_root` must equal §2.3.
19. If `ft_num > 0`: reject if `gt_index` is absent. If both the fee-transaction index and a recomputed fee transaction exist, and UTXO checking is on, reject unless `hash(serialize_for_signature)` of the recomputed fee transaction equals the same hash of the transaction at `ft_index`. The recomputed fee transaction is not required to be present when `gt_index` was set but payouts were skipped (§9). A block with `ft_num > 0` and no recomputed fee transaction is not rejected by this step. A block with `gt_index` set and `ft_num == 0` is not rejected by this step; nothing in `Block::validate` requires a fee transaction to be present when a golden ticket is present.
20. If the node is loaded: every transaction must pass §3.5 with the same UTXO-checking flag. Then, in order, every non-fee input with `amount > 0` and type other than `Bound` must have a UTXO key not already seen in this pass. A repeat rejects the block.
21. If the node is loaded, set `is_valid` and accept.

### 8.1 Values counted from the body

Walking transactions in order:

- Each `Fee` sets `ft_num += 1` and `ft_index` to that index. Non-fee transactions increment `total_number_of_non_fee_transactions`.
- Each `GoldenTicket`, `Normal`, or `Bound` transaction that is not type `ATR` adds its serialized size to `total_bytes_new` and its `total_fees` to `total_fees_new`.
- Each `GoldenTicket` sets `gt_num` and `gt_index` as above.
- Each `BlockStake` sets `st_num` and `st_index` to the last such index.
- Each `Issuance` sets `it_num` and `it_index` to the last such index.

`total_fees_cumulative` starts as `total_fees_new` and is replaced after ATR by the formula in §12.

```
total_fees = total_fees_new + total_fees_atr
fee_per_byte = total_fees_new / total_bytes_new    if total_bytes_new > 0
             = 0                                   otherwise
```

`fee_per_byte` uses `u64` division. `total_bytes_new` is a `u64` byte count.

Burn fee and difficulty are then set from the parent as in §5 and §7:

```
difficulty starts as parent.difficulty
if parent.has_golden_ticket and gt_num > 0: difficulty = parent.difficulty + 1
else if parent.has_golden_ticket is false and gt_num == 0 and difficulty > 0:
    difficulty = difficulty - 1
else: difficulty is unchanged
```

There is no ceiling. `has_golden_ticket` on the parent is the flag `generate` set from the presence of a `GoldenTicket` transaction, not `gt_num` of the child. If the parent is absent, `difficulty` stays the header value.

---

## 9. Payouts

Payouts are computed inside `generate_consensus_values` after ATR and after the fee averages of §11, and before the payout averages.

If `gt_index` is set and the ticket bytes do not parse, the function returns immediately. Payout fields stay `0`. The payout averages stay `0` because they have not been updated yet. Fee averages have already been updated. If a parent exists, `Block::validate` then rejects the block because the ticket does not parse.

If `gt_index` is set and the ticket parses, let `R0 = hash(ticket.random)`.

**Parent missing.** Miner and router amounts stay `0`. An empty fee transaction is still attached (`timestamp = this.timestamp`, type `Fee`, no slips). `total_payout_mining` and `total_payout_routing` stay `0`. `total_payout_treasury` and `total_payout_graveyard` stay `0`.

**Parent present.** Let `F = parent.total_fees`, `A = parent.avg_total_fees`.

```
cap = (A as f64 * 1.5) as u64
```

`1.5` is the `f64` value one and a half. The cast truncates toward zero. The same `cap`, from the parent's `avg_total_fees`, is used for every component below. It is not recomputed from the grandparent.

```
expected_miner = floor(F / 2)
if expected_miner > cap:
    graveyard += expected_miner - cap
    miner_payout = cap
else:
    miner_payout = expected_miner
miner_key = ticket.public_key

expected_router = F - expected_miner
if expected_router > cap:
    graveyard += expected_router - cap
    router1_payout = cap
else:
    router1_payout = expected_router
router1_key = parent.find_winning_router(R0)

R1 = hash(hash(R0))
```

`F - floor(F / 2)` is `ceil(F / 2)`. If `F` is `0`, both expected amounts are `0`, both payouts are `0`, and `cap` is not consulted. `graveyard` does not increase.

If `parent.has_golden_ticket` is true, there is no second payout.

If it is false and the grandparent is not stored, there is no second payout.

If it is false and the grandparent is stored, let `F2 = grandparent.total_fees`. The cap is still `(parent.avg_total_fees as f64 * 1.5) as u64`, not the grandparent's average.

```
expected_treasury = floor(F2 / 2)
if expected_treasury > cap:
    treasury += cap
    graveyard += expected_treasury - cap
else:
    treasury += expected_treasury

expected_router2 = F2 - expected_treasury
if expected_router2 > cap:
    graveyard += expected_router2 - cap
    router2_payout = cap
else:
    router2_payout = expected_router2
router2_key = grandparent.find_winning_router(R1)
```

The second hash advance is not performed. There is no further recursion. Depth is two blocks: the parent (miner and router) and, only when the parent has no golden ticket, the grandparent (treasury and router).

**Fee transaction outputs**, in this order, only when the corresponding test passes. `tx_ordinal` on these slips is set to `total_number_of_non_fee_transactions + 1` at construction. `generate` later overwrites every output's `tx_ordinal` and `slip_index` as in §3.1 and §3.4. The fee-transaction hash check uses the signature preimage, which includes `slip_index` and amount and type and key, and does not include `tx_ordinal` or `block_id`.

- If `miner_key != 0` and `miner_payout > 0`: a `MinerOutput` of `miner_payout` to `miner_key`. If `miner_key` is the zero key or `miner_payout` is `0`, no slip is added and `miner_payout` is not added to `graveyard`. `total_payout_mining` is still `miner_payout`.
- If `router1_payout > 0` and `router1_key != 0`: a `RouterOutput` of `router1_payout` to `router1_key`. If `router1_payout > 0` and the key is zero, add `router1_payout` to `graveyard` and add no slip.
- The same for `router2_payout` / `router2_key`.

```
total_payout_mining  = miner_payout
total_payout_routing = router1_payout + router2_payout
```

`router2_payout` is `0` when the second payout does not run. A zero key that causes the amount to move to `graveyard` does not reduce `total_payout_routing`; the header routing total still includes that amount, and the graveyard total includes it as well.

**No golden ticket.** If the parent is missing, graveyard contribution stays `0`. If the parent has a golden ticket, contribution stays `0`. If the parent has no golden ticket and the grandparent is stored, `graveyard += parent.previous_block_unpaid`. If the grandparent is not stored, contribution stays `0`. No fee transaction is created. `total_payout_mining` and `total_payout_routing` stay `0`. `total_payout_treasury` stays `0`.

`previous_block_unpaid` on a created block is `0` when a golden ticket was supplied to `Block::create`, and `parent.total_fees` otherwise (or `0` if the parent was missing). Validation, when a parent exists: if `gt_index` is set, `previous_block_unpaid` must be `0` and the puzzle in §7.1 must accept against `parent.difficulty` and `parent.hash`. If `gt_index` is unset, `previous_block_unpaid` must equal `parent.total_fees`.

Header update at creation, and the check in §8 step 15:

```
treasury  = parent.treasury + total_payout_treasury - total_payout_atr
graveyard = parent.graveyard + total_payout_graveyard
```

With a missing parent, creation uses `0` for both parent fields.

**Where each nolan of a paid block's `total_fees` goes**, when a later block carries a golden ticket and the parent is stored. `F` is that block's `total_fees`.

| Situation | Miner key | Router keys | Treasury | Graveyard |
|---|---|---|---|---|
| This block is the parent, and it itself contained a golden ticket | `min(floor(F/2), cap)` to `ticket.public_key`, or nowhere if that key is zero or the amount is `0` | `min(F - floor(F/2), cap)` to the router selected on this block, or graveyard if that key is zero | `0` from this `F` | `max(0, floor(F/2) - cap) + max(0, ceil(F/2) - cap)`, plus a router amount whose key is zero |
| This block is the parent, and it contained no golden ticket | same as the row above | same | `0` from this `F`; the grandparent is paid separately | same |
| This block is the grandparent, the parent contained no golden ticket, and the current block contains one | `0` | `min(F - floor(F/2), cap)` to the router selected on this block | `min(floor(F/2), cap)` added to `total_payout_treasury` | the two trimmed amounts, plus router amount if the key is zero |
| No golden ticket in the next block and none in the block after that, and the block after that has the grandparent stored | `0` | `0` | `0` | the entire `previous_block_unpaid` of the parent, which validation required to equal this block's `total_fees` |

`cap` in the grandparent row is computed from the parent's `avg_total_fees`, not from this block's average. If `cap` is `0` and `F > 0`, the entire expected miner, router, and treasury amounts are added to `graveyard` and the paid slips are `0` except a router slip is omitted when its payout is `0`. If `F` is `0`, every component is `0` and `graveyard` does not increase from these formulas.

The treasury contribution is not paid to a key. It is added into the next header's `treasury`. ATR then subtracts `total_payout_atr` from that running treasury (§12).

---

## 10. Treasury, graveyard, and unpaid fees

The header fields move only by the formulas in §9 and §12, plus the checkpoint mutation in §14.

`previous_block_unpaid` is the parent's `total_fees` on a block with no golden ticket, and `0` on a block with one. It is not itself a balance that is spent. The supply sum in §13 adds the latest block's `previous_block_unpaid` once, and adds the latest block's `total_fees` once. When a block has no golden ticket those two header fields are equal, so the same fee total is added twice in that sum until a later block either pays it or moves `previous_block_unpaid` into `graveyard`.

`total_payout_graveyard` sources:

1. Each cap truncation in §9.
2. A positive router payout whose selected key is the zero key.
3. On a block with no golden ticket, `parent.previous_block_unpaid` when the parent has no golden ticket and the grandparent is stored.

A miner payout to the zero key is not one of these sources.

`total_payout_treasury` has one source: the grandparent treasury contribution in §9.

---

## 11. Moving averages

For a quantity `x` and a previous average `p`, with genesis period `G`:

```
adjustment = (p as i128 - x as i128) / (G as i128)
average    = (p as i128 - adjustment) as u64
```

`as u64` from `i128` keeps the low 64 bits. For non-negative `p` and `x` the intermediate value of this particular formula stays in range of a non-negative `i128` that fits the mathematical result `p - trunc_toward_zero((p - x) / G)`. When `|p - x| < G`, `adjustment` is `0` and the average stays `p`. `G == 0` aborts on division by zero.

If the parent is absent, every previous average used below is `0`, except that three of them are `0` even when the parent is present.

| Average | `x` | Previous `p` |
|---|---|---|
| `avg_fee_per_byte` | `fee_per_byte` | parent `avg_fee_per_byte`, or `0` |
| `avg_total_fees` | `total_fees` | parent `avg_total_fees`, or `0` |
| `avg_total_fees_new` | `total_fees_new` | parent `avg_total_fees_new`, or `0` |
| `avg_total_fees_atr` | `total_fees_atr` | parent `avg_total_fees_atr`, or `0` |
| `avg_nolan_rebroadcast_per_block` | `total_rebroadcast_nolan` | parent `avg_nolan_rebroadcast_per_block`, or `0` |
| `avg_payout_routing` | `total_payout_routing` | parent `avg_payout_routing`, or `0` |
| `avg_payout_mining` | `total_payout_mining` | parent `avg_payout_mining`, or `0` |
| `avg_payout_treasury` | `total_payout_treasury` | constant `0` |
| `avg_payout_graveyard` | `total_payout_graveyard` | constant `0` |
| `avg_payout_atr` | `total_payout_atr` | constant `0` |

Readers:

- `avg_total_fees` of the parent is the payout cap (§9).
- `avg_fee_per_byte` of the parent is the ATR fee factor (§12).
- `avg_nolan_rebroadcast_per_block` of the parent is the ATR staking denominator (§12).
- The other averages are stored and checked against the header. No other rule reads them.

Initial value: a parentless block uses `p = 0` for every average. `ConsensusValues::new` sets `total_fees` to `5000` and `burnfee` and `difficulty` to `1` before the function overwrites `total_fees`. The early return in §9 happens after `total_fees` is overwritten.

---

## 12. ATR

ATR runs only when `id > G + 1`. It reads the longest-chain block hash at height `id - (G + 1)`. If that hash is missing, or the block is not in the map, ATR adds nothing.

If the node is a browser or in SPV mode, ATR adds nothing even when the block is present.

Otherwise the block is loaded from disk by its file path and `generate` is run on that copy. The loaded `block_type` must be `Full` and `transactions` must be non-empty; otherwise the process aborts. If the file cannot be read, ATR adds nothing and the function continues. A full node that does not have that file therefore computes an empty ATR set.

At the moment ATR runs, the values it reads from the parent are the ones captured at the start of `generate_consensus_values` from the stored parent: `treasury`, `avg_nolan_rebroadcast_per_block`, and `avg_fee_per_byte`. They are the parent's header values, not this block's. The 5% test below reads `self.treasury`, which is this block's header field.

```
staked = G * parent.avg_nolan_rebroadcast_per_block
expected_atr_payout = floor(parent.treasury / staked)    if staked > 0 else 0
multiplier = 1 + expected_atr_payout
```

For each transaction in the lookback block, scan its outputs:

- A `Bound` slip with two slips after it is tested as a group `(slip1, slip2, slip3)`. If `slip2`'s UTXO key is in `slips_spent_this_block`, skip three slips. If `slip2` is `Normal` or `ATR` and `slip3` is `Bound`, and all three `Slip::validate` against the current UTXO set, keep the group and skip three. Otherwise skip one slip. A `Bound` slip without two following slips is not a group.
- Any other slip that `Slip::validate` accepts and whose UTXO key is not in `slips_spent_this_block` is a regular slip.

`slips_spent_this_block` during validation is the map `generate` built from this block's non-fee inputs (§8). During `Block::create` it is built from the golden ticket and mempool transactions before ATR transactions exist.

**NFT groups of one lookback transaction** are merged into one ATR transaction. `tx_size` is that lookback transaction's serialized size. `atr_fee = tx_size * parent.avg_fee_per_byte`. Sum the first-slip amounts and the middle-slip amounts across groups. Clone the first group's three slips and overwrite amounts with those sums; the third amount is `0`.

```
atr_payout = middle_amount * multiplier
```

If `atr_payout > atr_fee`:

- Add `middle_amount` to `total_rebroadcast_nolan` and `1` to `total_rebroadcast_slips`.
- Input group: middle amount becomes `atr_payout`. Output group: middle type becomes `ATR`, middle amount becomes `atr_payout - atr_fee`.
- `total_payout_atr += atr_payout - middle_amount`. `total_fees_atr += atr_fee`.
- Append `hash(previous_rebroadcast_hash || rebroadcast_tx.serialize_for_signature())` into `rebroadcast_hash`, starting from 32 zero bytes.
- The ATR transaction's type is `ATR`. Its `data` is the lookback transaction's `data` if that transaction is already `ATR`, otherwise the lookback transaction's full network encoding. Its signature bytes are copied from the lookback transaction. Its timestamp stays `0`. `generate_total_fees(0, 0)` is called at construction.

If `atr_payout <= atr_fee`: do not create a transaction. Add `middle_amount` to `total_rebroadcast_nolan`, to `total_fees_atr`, and to `total_fees_paid_by_nonrebroadcast_atr_transactions`.

**Regular slips** use the same `atr_fee` (the lookback transaction's size times the parent's `avg_fee_per_byte`, computed again). For each slip, `atr_payout = amount * multiplier`. If `atr_payout > atr_fee`, one ATR transaction is created whose single input amount is `atr_payout` and whose single output is type `ATR` with amount `atr_payout - atr_fee`. Accounting matches the NFT branch with `middle_amount = slip.amount`. If `atr_payout <= atr_fee`, the same non-rebroadcast accounting is applied to `slip.amount` and no transaction is created.

Subtraction `atr_payout - atr_fee` is safe against underflow only when the comparison `atr_payout > atr_fee` is true. Multiplication can wrap in a release build before that comparison.

After the lookback loop:

```
total_fees_cumulative = total_fees_new + total_fees_atr
                        - total_fees_paid_by_nonrebroadcast_atr_transactions
```

**5% branch.** Let `threshold = (self.treasury as f64 * 0.05) as u64`. The literal `0.05` is the `f64` nearest to `5/100`. If `total_payout_atr > threshold`:

- `max_payout = threshold`.
- `adjusted = floor(max_payout / total_rebroadcast_nolan)`. A zero `total_rebroadcast_nolan` aborts. A positive `total_payout_atr` is produced only from a positive slip amount in the branches above, which also add that amount into `total_rebroadcast_nolan`, unless a wrapping multiply produced a non-zero payout from a zero amount.
- `out_mult = 1 + adjusted`.
- For each already built rebroadcast transaction: if it has 3 inputs and 3 outputs and the input types are `Bound`, not `Bound`, `Bound`, then `input_amount = from[1].amount` and `to[1].amount = input_amount * out_mult`, and `total_payout_atr` (reset to `0` first) gains `to[1].amount - input_amount`. Otherwise `input_amount = from[0].amount`, `to[0].amount = input_amount * out_mult`, and the same gain. The `from` amount on these transactions was set to `atr_payout` (the gross payout), not the original slip amount.
- Then `total_fees_atr = 0`.
- `rebroadcast_hash` is not recomputed after these amount changes.

`from[1].amount` on an NFT ATR transaction is the gross `atr_payout` of the summed middle slips. The surplus added into `total_payout_atr` on this branch is `input_amount * out_mult - input_amount`, which is `0` when `out_mult` is `1`.

**Which treasury the 5% test sees.**

- During `Block::create`, `generate_consensus_values` runs before `treasury` is assigned. A new block's `treasury` is `0`. The test is `total_payout_atr > 0`. Any positive ATR surplus enters the branch, `max_payout` is `0`, `out_mult` is `1`, output amounts become the gross input amounts, `total_payout_atr` becomes `0`, and `total_fees_atr` becomes `0`. The header treasury is then `parent.treasury + total_payout_treasury - 0`.
- During `Block::validate`, `self.treasury` is the value in the header being validated. The test uses that value, not `parent.treasury`.

Validity compares the hash and the slip count produced by this function with the hash and slip count `generate` computed from the ATR transactions actually in the block. `generate`'s hash is the chain of `hash(previous || serialize_for_signature)` over ATR transactions in block order, after `generate` has rewritten output `slip_index`. The consensus-value hash is the chain built at construction time, before the 5% amount rewrite and before that `slip_index` rewrite. Both use `serialize_for_signature`, which includes `slip_index` and amount.

`generate` counts `total_rebroadcast_slips` as the number of outputs of type `ATR` on ATR transactions. The consensus-value counter adds one per rebroadcast NFT batch and one per rebroadcast regular slip, and does not add for the non-rebroadcast branch.

---

## 13. Currency creation, sinks, and supply

**Creation.**

- `Issuance` transactions in block `1`. `produce_genesis_block` reads issuance slips from disk, creates one `Issuance` transaction per slip with a single `Normal` output of that amount and key, and sets `initial_token_supply` to the sum of those amounts. There is no rule in block validation that this sum equal `MAX_TOKEN_SUPPLY`. `MAX_TOKEN_SUPPLY` is `7_000_000_000 * 100_000_000` and is not read by `Block::validate` or `validate_total_supply`.
- ATR surplus: `total_payout_atr` is the sum of `(atr_payout - original_amount)` over rebroadcast slips, or the rewritten surplus on the 5% branch. It is subtracted from `treasury`. The new output amount is the original amount plus that surplus minus the ATR fee, except on the 5% branch, where the fee is cleared and the output amount is rewritten as in §12. The ATR input is not a previous UTXO of that inflated amount; the UTXO set removes the original output when the lookback block is no longer the spendable source and inserts the new output when this block is wound. The net nolan added to outputs, relative to the spent original, is `total_payout_atr - fees_retained`. Fees retained on a normal rebroadcast are `atr_fee`, added to `total_fees_atr` and therefore to `total_fees`. On the 5% branch `total_fees_atr` is set to `0` after the rewrite.

**Sinks.**

- `graveyard` increases by `total_payout_graveyard` and, when a checkpoint file is applied, by the amounts of the removed UTXOs (§14). Graveyard is not an output slip.
- A miner payout to the zero key is not placed in a slip and is not added to `graveyard` (§9).
- Non-rebroadcast ATR adds the original slip amount to `total_fees_atr` and does not create a replacement output. That amount leaves the UTXO set when the original slip is no longer spendable and is not reissued. It is included in `total_fees`.
- Checkpoint deletion removes UTXO entries and adds their amounts onto the in-memory `graveyard` of that block (§14).

**Supply check.** `has_total_supply_loaded(G)` is true when the longest chain has a block at id `1`, or when `latest_block_id > G` and the longest chain has a block at `latest_block_id - G`. When it is false, `validate_against_utxo` is false and the header comparisons in §8 step 9 and step 15 are skipped, as are the ATR hash comparisons and the fee-transaction hash comparison. Transaction validation then also skips UTXO membership.

When the check runs (full node, not browser, not SPV, and the flag is true):

```
sum = sum of amount over UTXO keys stored as true,
      excluding type Bound,
      excluding slips with block_id < latest_block_id - G
sum += latest.graveyard + latest.treasury + latest.previous_block_unpaid + latest.total_fees
```

If `initial_token_supply` is `0`, it is set to `sum` and the check passes. Otherwise the check passes only when `sum == initial_token_supply`. It runs after a successful longest-chain insertion when `block.id % 100 == 0`. Failure aborts the process. Browser and SPV modes skip it and return true.

`calculate_current_supply` is a different sum: every spendable UTXO amount including `Bound` and including every `block_id`, plus the same four header fields. It is not the check above.

Winding a block inserts each output with `amount > 0` into the UTXO map as `true` and removes each input with `amount > 0`. Unwinding does the reverse. Amount `0` does not change the map.

---

## 14. Fork choice and reorganization

**New chain.** From the new block, walk `previous_block_hash` toward genesis. Push each block that is not `in_longest_chain`. Stop when a stored block has `in_longest_chain`, or when the hash is missing, or when the hash is 32 zero bytes. The vector is tip-first and does not include the shared ancestor. `shared_ancestor_found` is true only when the walk stopped on `in_longest_chain`.

**Old chain.** From the previous tip, walk toward genesis until the shared ancestor, not including it. If any block on that walk has `has_checkpoint`, the old chain is empty and the walk stops. The same checkpoint cut applies to the fallback walk used when no shared ancestor is found: that walk takes at most `new_chain.len()` blocks and returns empty if it hits a checkpoint.

**Checkpoint flag.** After a block is added from the mempool queue, the node looks for a file named `{id}-{hash_hex}.chk` in the checkpoint directory. If the file exists and is valid UTF-8, each non-empty line that parses as 59 hex bytes is a UTXO key. The block's `has_checkpoint` is set, `checkpoint_found` is set, those keys are removed from the UTXO map, and each parsed slip's `amount` is added to the in-memory `graveyard` of that block. The header bytes already stored are not rewritten by this addition. A later child computes expected `graveyard` from this mutated parent value.

**Longest-chain test** `is_new_chain_the_longest_chain(new, old)`:

- If the ring is empty, true.
- If `new` is empty, false.
- If `old.len() > new.len()`, false.
- If the ring's latest id is `>=` the id of `new[0]`, false. `new[0]` is the new tip.
- If any hash in `new` is not stored, false.
- Let `old_bf` be the sum of `burnfee` over `old`, and `new_bf` the sum over `new`.
- Return true only when `old.len() < new.len()` and `old_bf <= new_bf`.

Equal length does not switch. Equal burn-fee sums do switch when the new chain is strictly longer. The sums include only the diverging segments. A missing block in `old` is not handled; the sum uses `unwrap` and aborts if an old-chain hash is absent.

The candidate is wound only when that test is true and `block_id > latest_block_id - G` (`saturating_sub`). A shared ancestor with an empty old chain whose ancestor is not the current tip does not enter this test; the block is stored off the longest chain. The log text for that case is the checkpoint message.

A block with `id` equal to the current tip fails the test because `latest >= new_tip`.

**Wind and unwind.** Chains are tip-first. Unwind walks the old chain from index `0` upward. Wind walks the new chain from the last index down to `0`. Each unwound block is upgraded to `Full` if possible, removed from the UTXO set, and unmarked in the ring. If the block has `has_checkpoint`, unwind returns failure. Each wound block is validated (§8). If it has `has_checkpoint`, wind returns failure.

If a wound block fails validation on the first block of the new chain and the old chain is non-empty, the machine winds the old chain back with a failure flag and does not treat that as adopting the new chain. If the old chain is empty, the result is an unsuccessful wind and the new chain is not adopted. If validation fails after some new blocks were already wound, those wound blocks (not including the failing one) are unwound and then the old chain is wound back with the failure flag. If that restoration itself fails, or a block is missing, or a checkpoint blocks the wind or unwind, the result is `FinishWithFailure` and the process aborts. An unsuccessful wind that restores a consistent chain rejects the new block, sets `last_bad_fork_hash` to it, clears `in_longest_chain` on it, and leaves it stored.

`in_longest_chain` on the new tip is set true before validation and set false again if validation fails.

Blocks at an id below the current tip never enter this comparison (§8 step 8).

---

## 15. Golden-ticket density

Constants: `MIN_GOLDEN_TICKETS_NUMERATOR = 2`, `MIN_GOLDEN_TICKETS_DENOMINATOR = 6`.

`is_golden_ticket_count_valid(previous_hash, tip_has_golden_ticket, browser, spv)`:

1. Set `found = 0`, `depth = 0`, `cursor = previous_hash`.
2. Repeat up to `5` times (`DENOMINATOR - 1`). If `cursor` is stored, increment `depth`, and if that block's `has_golden_ticket` is true increment `found`, then set `cursor` to its `previous_block_hash`. If `cursor` is not stored, stop the walk.
3. `required = NUMERATOR.saturating_sub(DENOMINATOR.saturating_sub(depth + 1))`, with those constants equal to `2` and `6`. For the reachable depths `0..=5` this is `0, 0, 0, 0, 1, 2`.
4. If `tip_has_golden_ticket`, increment `found`.
5. If `depth < 4` (`DENOMINATOR - NUMERATOR`), return true.
6. If `found < required` and `browser || spv` is false, return false.
7. Otherwise return true.

The walk examines the parent and older blocks, at most five of them. The tip is not in the walk; it contributes through the boolean. `depth` is how many of those ancestors were stored, not including the tip.

Call sites:

- `Blockchain::validate`, once, before any unwind or wind, on the new chain's tip. The parent hash and `has_golden_ticket` are taken from `new_chain[0]`. A false result rejects the chain. No per-block repeat during the wind, and no repeat for blocks that are unwound.
- `Mempool::can_bundle_block`, on the current tip hash, with the boolean equal to whether a golden-ticket transaction was passed in. Browser or SPV sets the bypass flag. A false result means this node does not produce a block.

The bypass flag is `is_browser || is_spv` at both call sites. When it is set, step 6 does not return false.

---

## 16. Difficulty

Initial value on a parentless created block: `0` (§5).

Update rule: §8.1. Floor: the decrement runs only when `difficulty > 0`. No ceiling is applied in the update. The puzzle comparison uses `difficulty as u32` (§7.1).

The ticket in block `N` is checked against block `N-1`'s `difficulty`, not block `N`'s.

---

## 17. Node behavior on the consensus path

**Aborts on peer-derived data or on state reached while applying it.**

- `Block::validate` asserts `id > 0`.
- ATR lookback asserts the disk block is `Full` and non-empty.
- `find_winning_router` aborts if an ATR winner's `data` is not a transaction, and asserts a non-ATR winner's `cumulative_fees` is non-zero.
- `Slip::serialize_for_net` asserts the buffer length is 59.
- `validate_total_supply` failure after a longest-chain block whose id is divisible by 100 aborts.
- `FinishWithFailure` during wind or unwind aborts.
- Unsigned overflow aborts in a debug build.
- Division by zero (`G`, or ATR `total_rebroadcast_nolan` in the 5% branch) aborts.
- `sign` aborts on an invalid private key. That path is local signing, not peer data.
- A missing block in the old-chain burn-fee sum uses `unwrap` and aborts.

A golden ticket that fails to parse rejects the block when a parent exists. It does not abort in `Block::validate`.

**Skipped in browser or SPV mode.**

- SPV: `Block::validate` accepts after computing consensus values.
- Browser and SPV: ATR is not generated; density failure does not reject; mining is disabled in SPV; block production is skipped unless `produce_without_limits`; supply check returns true; blocks are not written to disk; an empty transaction list keeps the existing merkle root; `collect_discarded_txs` is told the node is lite.
- `Ghost` blocks are accepted without the remaining checks. A `Ghost` parent causes the child to be accepted once the signature and the steps before the parent section have passed.

**Historical blocks.**

- The parent must be stored for burn fee, difficulty, work, treasury, graveyard, golden ticket, and `previous_block_unpaid` to be checked against it. A missing parent is the fetch/reject path in §8, not a successful validation of those fields.
- ATR requires the full body of the longest-chain block at `id - (G + 1)` on disk. If it is absent, the ATR set is empty.
- Density walks at most five ancestors. A missing ancestor ends the walk. `depth < 4` accepts.
- `update_genesis_period` sets `genesis_block_id = max(latest - G, 1)`. When `latest >= 2G + 1`, it deletes blocks at height `latest - 2G`, and deletes non-longest-chain blocks at the next height, from the ring, the wallet, and the UTXO set. Deleted blocks are not available for later ATR or density walks.
- The reorganization window requires the new tip id to be greater than `latest - G`.

---

## Appendix A. Constants

| Constant | Value | Where set |
|---|---|---|
| `NOLAN_PER_SAITO` | `100_000_000` | `defs.rs` |
| `MAX_TOKEN_SUPPLY` | `7_000_000_000 * 100_000_000` | `defs.rs`. Not read by block validation or the supply check. |
| `MIN_GOLDEN_TICKETS_NUMERATOR` | `2` | `defs.rs` |
| `MIN_GOLDEN_TICKETS_DENOMINATOR` | `6` | `defs.rs` |
| `BURNFEE_MULTIPLIER` | `100_000_000.0` | `burnfee.rs` |
| Misordered-time sentinel | `10_000_000_000_000_000_000` | `burnfee.rs` |
| Burn fee when previous burn fee is `0` | `50_000_000` | `burnfee.rs` |
| Burn-fee floor after a zero result | `1` | `block.rs`, only when a parent exists |
| Work zero when elapsed `>= 2 * H` | `0` | `burnfee.rs` |
| Payout cap factor | `1.5` as `f64` | `block.rs` |
| ATR treasury fraction | `0.05` as `f64` | `block.rs` |
| `BLOCK_HEADER_SIZE` | `389` | `block.rs` |
| `TRANSACTION_SIZE` | `93` | `transaction.rs` |
| `SLIP_SIZE` | `59` | `slip.rs` |
| `HOP_SIZE` | `130` | `hop.rs` |
| `UTXO_KEY_LENGTH` | `59` | `defs.rs` |
| Golden-ticket data length | `97` | `golden_ticket.rs` |
| `MAX_CONFIRMATIONS` | `6` | `block.rs` |
| `ALERT_ON_NEWER_CHAIN_LENGTH` | `50` | `blockchain.rs`. Used only to set a flag, not to accept or reject. |
| `ALERT_ON_NEWER_CHAIN_GAP` | `20` | `blockchain.rs`. Same. |
| Production delay modulus | `5000` ms | `mempool.rs` |
| Block-production timer | `1000` ms | `consensus_thread.rs` |
| Supply check period | every id divisible by `100` | `blockchain.rs` |
| Parallel hash threshold | `128_000` bytes | `crypto.rs` |
| `G` default, non-test build | `80640` | `configuration.rs` `get_default_genesis_period` |
| `G` default, test build | `10` | same function, `cfg(test)` |
| `H` default | `30000` ms | `get_default_heartbeat_period_ms` |
| `default_social_stake` | `100_000_000_000_000` | `configuration.rs` |
| `default_social_stake_period` | `100` | `configuration.rs` |
| `prune_after_blocks` default | `99` | `configuration.rs`. Stored on the blockchain; deletion uses `2 * G`, not this field. |
| `max_staker_recursions` default | `3` | `configuration.rs`. Not read by the payout loop. The payout depth is fixed at two. |
| `disable_block_production` default | `true` | `configuration.rs` |
| `recollect_discarded_txs_mode` default | `2` (`RECOLLECT_EVERY_TX`) | `configuration.rs` |
| `block_confirmation_limit` default | `1` | `configuration.rs` |
| Issuance file interval default | `10` blocks | `configuration.rs` |
| UTXO-file interval default | `100` blocks | `configuration.rs` |
| `PROJECT_PUBLIC_KEY` | base58 `q6TTBeSStCLXEPoS5TUVAxNiGGnRDZQenpvAXXAfTmtA` | `defs.rs`. Not read by the validation functions in this document. |

The node copies `default_social_stake` and `default_social_stake_period` into `Blockchain.social_stake_requirement` and `social_stake_period` at startup.

---

## Appendix B. Source map

Commit reviewed: `79ecd3d4ecac532ab341e07623adf8c57c9349c9`.

| Rule | Location |
|---|---|
| Types, `MAX_TOKEN_SUPPLY`, golden-ticket ratio | `rust/saito-core/src/core/defs.rs:5-44` |
| Configuration defaults | `rust/saito-core/src/core/util/configuration.rs:111-248` |
| BLAKE3, `sign`, `verify` | `rust/saito-core/src/core/util/crypto.rs:106-154` |
| Burn fee and required work | `rust/saito-core/src/core/consensus/burnfee.rs:7-113` |
| Golden-ticket bytes and leading-zero test | `rust/saito-core/src/core/consensus/golden_ticket.rs:11-73` |
| Hop construction and bytes | `rust/saito-core/src/core/consensus/hop.rs:10-93` |
| Slip types, UTXO key, `Slip::validate` | `rust/saito-core/src/core/consensus/slip.rs:13-259` |
| Transaction types, fees, work, routing lottery, validation, path check | `rust/saito-core/src/core/consensus/transaction.rs:27-1729` |
| Header layout, signature preimage, merkle call | `rust/saito-core/src/core/consensus/block.rs:29`, `935-1210`, `2494-2627` |
| `Block::create`, including treasury assigned after consensus values | `block.rs:578-886` |
| `find_winning_router` | `block.rs:1242-1306` |
| `Block::generate` | `block.rs:1323-1458` |
| Merkle pairing | `rust/saito-core/src/core/consensus/merkle.rs:66-149`, `181-193` |
| Consensus values, ATR, payouts, averages | `block.rs:1492-2477` |
| `Block::validate` | `block.rs:2850-3485` |
| `add_block`, chain walks, longest-chain test | `rust/saito-core/src/core/consensus/blockchain.rs:233-650`, `1379-1438` |
| Chain validate, density, wind, unwind | `blockchain.rs:1453-1904`, `2101-2198`, `3182-3263` |
| Checkpoint file and flag | `blockchain.rs:2534-2559`; `rust/saito-core/src/core/storage/storage.rs:336-369` |
| Genesis-period deletion | `blockchain.rs:2293-2346` |
| Stake unlock id | `blockchain.rs:1348-1356`, `2948-2978` |
| Supply | `blockchain.rs:2066-2084`, `2990-3137` |
| Mempool production tests and delay | `rust/saito-core/src/core/consensus/mempool.rs:83-369` |
| Production timer, genesis, staking gate | `rust/saito-core/src/core/consensus_thread.rs:30`, `107-207`, `289-320`, `349-362` |
| Miner search | `rust/saito-core/src/core/mining_thread.rs:48-105` |
| Golden-ticket transaction body | `rust/saito-core/src/core/consensus/wallet.rs:2175-2206` |
| Staking transaction body | `wallet.rs:2294-2459` |
| Hop appended on relay | `rust/saito-core/src/core/network/network.rs:110-135` |
| Script evaluator, canonical JSON | `rust/saito-core/src/core/consensus/scripting/script.rs:23-50`, `179-419`, `427-448` |
| `CHECKTIME` | `scripting/opcodes/checktime.rs:13-54` |
| `CHECKSIG` | `scripting/opcodes/checksig.rs:39-75` |
| `CHECKHASH` | `scripting/opcodes/checkhash.rs:15-29` |
| `CHECKSENDER`, `CHECKRECIPIENT` | `checksender.rs:14-33`, `checkrecipient.rs:14-33` |
| `CHECKFIELD`, `CHECKKEY`, `CHECKOWN`, `CHECKPATH`, `SCRIPTHASH` | `checkfield.rs`, `checkkey.rs`, `checkown.rs`, `checkpath.rs`, `scripthash.rs` |
| Other script opcodes | `scripting/opcodes/checkmultisig.rs`, `importfield.rs`, `importarray.rs`, `sumfields.rs`, `setfield.rs`, `setarray.rs`, `setarrayfield.rs`, `arrayify.rs`, `checkownnft.rs`, `checkownnftwhere.rs`, `checkpathhop.rs` |
| Social stake copied from config | `rust/saito-rust/src/main.rs:470-566` |

