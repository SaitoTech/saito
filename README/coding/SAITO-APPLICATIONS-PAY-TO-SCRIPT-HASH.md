# Saito Pay-to-Script Hash and Application Scripting

This document describes the scripting system that is actually implemented in this repository. It is written for an application developer, including an AI agent, who needs to construct scripts, witnesses, and evaluation contexts without inferring the behavior from Bitcoin or Ethereum.

The implementation lives in three layers:

- Consensus evaluation: `rust/saito-core/src/core/consensus/scripting/` and the P2SH branch of `Transaction::validate` in `rust/saito-core/src/core/consensus/transaction.rs`.
- JavaScript entry points: `app.core.scripting` in `rust/saito-js/saito.ts`, which calls the WASM exports in `rust/saito-wasm/src/saitowasm.rs`.
- Applications that build scripts and decide what a successful evaluation means: Store, Archive, Vault, Stack, and the Rustscript module.

## Why Saito P2SH Is Different

A Saito script is a JSON object. The object is a tree of named operations. Evaluation walks that tree and returns `1` or `0`. There is no Bitcoin-style opcode bytecode, no operand stack, and no separate redeem-script push on the wire.

The same evaluator is used in two places, and those places do not have the same authority:

- When a transaction spends an output whose public key begins with the byte `0x00`, consensus runs the script. A result other than `1` makes the transaction invalid.
- When an application calls `app.core.scripting.evaluate` or `evaluateWithTransaction`, the same engine returns `1` or `0` to that application. The application then grants or denies something. That decision is not a consensus rule.

A script hash is Blake3 of a canonical JSON form of the script after every `"witness"` key has been removed. The hash can be turned into an address and placed on a slip. The same hash can also be stored as an application field, such as Archive's `owner` column. The hash does not, by itself, say which of those two uses is in effect.

## Mental Model

Keep these objects separate. They are not interchangeable names for one string.

| Object | What it is in this codebase |
| --- | --- |
| Script definition | A JSON tree. Leaf nodes have an `"op"`. `AND`, `OR`, and `NOT` have an `"args"` array. |
| Locking script | The same tree with `"witness"` keys absent. This is what gets hashed. |
| Script hash | Hex Blake3 of the canonical locking script. `Script::hash` / `app.core.scripting.hash`. |
| Script address | 33-byte value: `0x00` followed by the 32-byte hash. Hex form is `00` plus the hash. `Script::address_hex` / `app.core.scripting.address`. |
| Locked asset | A slip whose public key is that address. Consensus treats any non-bound input whose public key starts with `0x00` as a P2SH input. |
| Witness | JSON placed on leaf nodes under `"witness"`, or supplied as an array that `Script::merge_witness` walks into those nodes. |
| Spending transaction | The transaction whose inputs include the P2SH slip and whose `data` JSON contains `access_scripts`. |
| Evaluation context | A JSON object the engine builds before walking the tree, plus optional caller-supplied fields. |
| Evaluation result | The integer `1` (success) or `0` (failure). |

Consensus spending:

```
locking script
    + witness, embedded in access_scripts[i]
    + spending transaction
    + blockchain (UTXO spendability)
        ↓
Transaction::validate
        ↓
transaction valid or invalid
```

Application authorization:

```
locking script
    + witness
    + a transaction the application chose, if any
    + extra JSON the application chose, if any
        ↓
app.core.scripting.evaluateWithTransaction
        ↓
application grants or denies
```

## The Saito Script Architecture

### Representation

`Script` in `rust/saito-core/src/core/consensus/scripting/script.rs` holds one `serde_json::Value`. `Script::from_json` and `Script::parse` parse a JSON string into that value. `Script::create` and `Script::print` are `todo!()` and are not usable.

A leaf looks like this:

```json
{
  "op": "CHECKSIG",
  "publickey": "<base58>",
  "msg": "tx.from.p2sh.utxoset_key",
  "witness": { "signature": "<hex>" }
}
```

A compound script looks like this:

```json
{
  "op": "AND",
  "args": [
    { "op": "CHECKSENDER", "publickey": "<base58>" },
    { "op": "CHECKFIELD", "field": "NOW", "operator": "<", "value": 1700000000000 }
  ]
}
```

`op` is matched after conversion to uppercase. An empty `op` returns `0`. An unknown `op` returns `0`.

There is no locking-script type distinct from a spending-script type. The locking script is the tree without `witness` keys. The spending script is that same tree with `witness` keys filled in. Consensus receives the filled-in tree as a string inside `tx.msg.access_scripts`.

### Serialization and the script hash

`Script::hash` clones the tree, deletes every object key named `witness` at every depth, encodes the remainder with `canonical_json`, and returns `crypto::hash(...).to_hex()`. `crypto::hash` is Blake3 (`rust/saito-core/src/core/util/crypto.rs`).

`canonical_json` sorts object keys, preserves array order, and encodes strings, numbers, booleans, and null with the same escaping as JSON. JavaScript `JSON.stringify` key order does not matter: `app.core.scripting.hash` sends the string to Rust, Rust parses it into a JSON value, and the hash function re-encodes canonically.

Because `witness` is stripped, a script with witness data hashes to the same value as the witness-free locking script. Archive relies on that: it stores the hash of the locking script and later hashes the script the requester submitted, witnesses included.

Only the key name `witness` is removed. A `reference` field is part of the hash. If `reference` is a JSON object, the evaluator also copies it into the current witness, but it still affects identity.

`Script::address` builds a 33-byte public key: byte 0 is `0x00`, bytes 1..33 are the raw hash. `address_hex()` is the string `00` concatenated with the hex hash (66 hex characters). Store and Rustscript call `app.core.scripting.address` and put that value on a slip as `publicKey`.

### How a pay-to-script-hash output is represented

A P2SH output is an ordinary slip. Its public key is the script address above. The slip type used by Store listings is a normal NFT custody slip whose recipient public key is that address, created through `wallet.createNFTTransaction`.

Consensus discovers P2SH inputs in `Transaction::validate` by this test, not by `SlipType::P2SH`:

- Bound slips are skipped.
- If `public_key[0] == 0x00`, the input index is recorded in `p2sh_idxs`.
- Other spendable slip types contribute to a single authorizer public key. Two different authorizers in one transaction fail validation.

`SlipType::P2SH` exists (`slip.rs`, discriminant 10). The validator rejects a `SlipType::P2SH` slip whose amount is greater than zero, and the comment says set-P2SH markers should not appear standalone. Current identification of a script-locked output is the leading `0x00` byte. Store's `isP2shPublicKey` in `node/mods/store/lib/helpers.js` checks that the base58 public key decodes to hex starting with `00`. Rustscript defines `SLIP_TYPE_P2SH = 10` because the JavaScript `SlipType` enum does not export `P2SH` yet.

### How a witness is attached for consensus spending

For each input in `p2sh_idxs`, consensus reads `tx.data` as UTF-8 JSON and requires `access_scripts` to be an array whose length equals the number of those inputs. `access_scripts[i]` must be a JSON string. That string is parsed, hashed, and compared with bytes 1..33 of the input's public key. Then `script.validate(Some(tx), None, Some(blockchain), Some(i))` must return `1`.

`i` here is the position in `access_scripts` / `p2sh_idxs`, not the raw index in `tx.from`. The engine stores it as `context["__current_p2sh_idx"]`. `tx.from.p2sh.<field>` resolves the `i`th non-bound input whose public key starts with `0x00`.

The block argument is `None` on this path. Opcodes that require a block do not succeed during consensus spending. See CHECKTIME below.

ATR transactions skip this entire script pass.

If there is no authorizer and no P2SH input, validation fails (with a narrow BlockStake exception). A transaction that only spends P2SH inputs does not need an authorizer signature. A transaction that also spends a normal user slip still needs that user's signature.

### Where evaluation sits in consensus

`Transaction::validate` runs during transaction validation against the UTXO set and blockchain. Script success is one predicate inside that function. It does not replace slip existence checks, fee checks, signature checks for normal inputs, or routing-path checks.

The WASM helpers do not go through `Transaction::validate`. They only run `Script::validate_with_context`. Calling them from JavaScript does not make a transaction valid.

## Scripts, Script Hashes, Witnesses, and Context

### Witness

A witness is the data a leaf opcode reads from `context["witness"]` while that leaf is executing. The evaluator rebuilds `context["script"]` and `context["witness"]` at every leaf:

- If the leaf's `reference` is an object, that object becomes the witness.
- Keys on the leaf's `witness` object are then merged in.
- Every other field on the leaf, except `op` and object-form `reference`, is copied into `context["script"]`.

`Script::merge_witness` walks the tree. It recurses through `AND`, `OR`, and `NOT`. On any other node that does not already have a non-empty `witness` object, it consumes the next element of a witness array and inserts it as `witness`. Non-object array elements are skipped. Extra array elements are ignored. This is what Archive calls via `app.core.scripting.mergeWitness(lockingScript, access_witness)`.

Stack's `embedWitnessInScript` is a different helper. It copies witness objects by opcode name (`CHECKOWNNFTWHERE`, `CHECKPATHHOP`, `IMPORTFIELD`) rather than by tree position.

What a witness may contain is defined per opcode. Current opcodes read:

- signatures (`CHECKSIG`, `CHECKMULTISIG`, `IMPORTFIELD`, `IMPORTARRAY`)
- a preimage string (`CHECKHASH`)
- NFT UTXO keys (`CHECKOWNNFT`, `CHECKOWNNFTWHERE`)
- routing hops (`CHECKPATH`, `CHECKPATHHOP`)
- a signed scalar (`IMPORTFIELD`) or signed array (`IMPORTARRAY`)

A witness is not a free-form bag that every opcode can see. A leaf sees only the witness object installed for that leaf. Later leaves can read values that earlier opcodes wrote into `context["__opcodes"]` or into caller context, which is how composition works.

The same locking script can be evaluated with different witnesses and different contexts. Consensus supplies the spending transaction and no caller context. An application supplies whatever transaction and JSON it chooses. That is why one language covers asset locking and application authorization.

### Context the engine always installs

`Script::validate_with_context` starts from the caller-supplied JSON object when that value is an object. Otherwise it starts from `{}`. It then:

- sets `script`, `witness`, and `variables` to empty objects
- deletes any caller keys named `tx`, `blk`, or `blockchain` (those are real parameters, not JSON)
- sets `__current_p2sh_idx` when the caller passed one, and deletes it otherwise
- sets `NOW` to the block timestamp when a block is provided, otherwise the evaluating process's wall clock in milliseconds
- sets `REQUESTER` to the base58 public key of `tx.from[0]` when the transaction has an input, and deletes `REQUESTER` otherwise

`NOW` is deliberately not the transaction timestamp. The comment in `validate_with_context` says Archive evaluates with a request transaction and no block, and using `tx.timestamp` would let a requester backdate past an expiry. Application-level time checks therefore follow the clock of the node performing the evaluation.

`variables` is cleared at the start. No current opcode writes it. `CHECKMULTISIG` can read `context["variables"]["message"]` when the script has no `msg`, but nothing in the current evaluator populates that field during a run.

### References

`resolve_ref` interprets a string parameter as a path. A non-string JSON value is a literal. Recognized prefixes:

| Prefix | Resolution |
| --- | --- |
| `script.` | Current leaf fields. |
| `witness.` | Current leaf witness. |
| `vars.` | `context["vars"]` (not `variables`). |
| `__opcodes.` | Values written by earlier opcodes in this run. |
| `tx.` | The transaction, with the P2SH special cases below. Absent transaction yields null. |
| `blk.` | Serde JSON of the block. Absent block yields null. |
| `context.` | Stripped, then looked up on the context object. |
| `NOW`, `REQUESTER` | Those context keys. |

`tx.from.p2sh.utxoset_key` and `tx.from.p2sh.public_key` use `__current_p2sh_idx` as the P2SH ordinal (default 0). `tx.to.p2sh.utxoset_key` and `tx.to.p2sh.public_key` always use ordinal 0. Other `tx.*` paths walk `serde_json::to_value` of the `Transaction`. A string that does not resolve as a path is returned unchanged, so a public key or a literal message can be written directly into the script.

`SETFIELD`, `SETARRAY`, `SETARRAYFIELD`, and `ARRAYIFY` may write only under `context.*`. Writes whose path is `script`, `witness`, `tx`, or `blk` fail.

## Consensus Script Evaluation

Success for consensus is `script.validate(...) == 1` after the hash of the submitted script matches the input public key. Any other return value fails the transaction. The function returns `u8`. Leaf opcodes return `0` or `1`.

Logical operators, implemented in the `eval` closure in `script.rs`:

- `AND`: every child must return non-zero. The operator itself returns `1`. An empty `args` array returns `1`. Evaluation stops at the first `0`.
- `OR`: returns `1` at the first child that returns exactly `1`. If none do, returns `0`. An empty `args` array returns `0`.
- `NOT`: returns `1` when the first child returns `0`, and `0` when the first child returns `1`. An empty `args` array returns `1`.

There is no `RETURN`, `VERIFY`, or explicit halt opcode. The root node's result is the script result.

Failure is the integer `0`. The engine does not return an error string to consensus. JavaScript sees the same integer. Rustscript treats `result === 1` as success.

The security boundary: consensus will not accept a spend unless this function returns `1` inside `Transaction::validate` for the script whose hash is committed on the input. An application that calls the WASM evaluator and then treats the result as success cannot change another node's view of the chain. Conversely, a script that returns `1` inside an application does not move a slip unless a valid transaction carrying that spend is also accepted by consensus.

## The Saito Script Language

There is no operand stack. Opcodes read the current leaf and the context, and some of them write named results under `context["__opcodes"]` for later leaves to reference. Composition is "run this check, store a value, let the next check read it," expressed with `AND`.

### Opcodes

#### CHECKHASH

Hashes `witness.input` as raw bytes with Blake3 and compares the hex digest to `script.hash`. Both must be non-empty. This is a preimage check. It does not look at the transaction. `TEST_SCRIPT` in `script.rs` is a CHECKHASH of the string `hello`.

#### CHECKSIG

Reads `script.publickey` (base58), resolves `script.msg` through `resolve_ref`, and reads `witness.signature` (hex). It then requires a transaction, because it appends the P2SH authorization hash:

```
signed_string = "{resolved message}|{p2sh_auth_hash}"
```

`get_p2sh_auth_hash` is Blake3 over the concatenation of `serialize_output_for_signature()` for every output slip: public key, amount as big-endian u64, slip index byte, slip type byte. The hash is cached on the context for the rest of the run. `crypto::verify` Blake3-hashes `signed_string` and checks secp256k1 ECDSA.

Store's 1-of-2 listing script uses CHECKMULTISIG, not CHECKSIG, but the signed string is built the same way. Rustscript's signature field signs `message|p2sh_auth_hash` with `app.wallet.signMessage` or `app.crypto.signMessage`.

CHECKSIG returns `0` when there is no transaction, because the authorization hash cannot be computed. `app.core.scripting.evaluate` passes no transaction.

#### CHECKMULTISIG

Reads `script.publickeys` (non-empty array of base58 keys), `witness.signatures` (non-empty array of hex signatures), and `script.m`. If `m` is missing or not a positive number, the threshold is the number of public keys. The message is the resolved `script.msg`, or `context["variables"]["message"]` when `msg` is absent. The same `message|p2sh_auth_hash` string is verified. Each signature may satisfy at most one key. Success is `valid >= m`.

This is the Store listing and purchase script: `m: 1` and two keys, so either the seller (or buyer) or the store public key can unlock. The message is the string `tx.from.p2sh.utxoset_key`, which resolves to the UTXO key of the P2SH input being spent. The signature therefore covers both that input and the exact output set.

#### CHECKFIELD

Compares a resolved `field` to a resolved `value`.

- `==` and `equals`, `!=`, `<`, `<=`, `>`, `>=` compare u64 numbers, strings, or booleans. Numeric comparison requires both sides to be u64. Booleans only support `==` and `!=`. A null left side returns `0`.
- `IN`: the resolved value must be an array, and the left side must equal one element.
- `NOT`: the resolved value must be an array, and the left side must equal none of the elements. This is list exclusion, not logical NOT.

Vault and the rental constitution use CHECKFIELD to compare `NOW` with an expiry and to compare `db.type` / `db.owner` with values the script just computed. Stack's subscription templates use it to compare a computed expiry with `NOW`.

#### CHECKKEY

Tests keys of a resolved object.

- `==`: the named key is present.
- `!=`: the named key is absent.
- `IN`: every key present on the object is in the supplied list. This is an allowlist of the object's keys, not a test that one key is contained in the list.
- `NOT`: none of the listed keys are present.

A missing object returns `0`. Vault's rental update uses `IN` so an Archive update object may contain only `type`, `owner`, and `updated_at`, and `==` to require that `owner` is one of those keys.

#### CHECKSENDER and CHECKRECIPIENT

`CHECKSENDER` returns `1` when some input slip's base58 public key equals `script.publickey`, case-insensitive. `CHECKRECIPIENT` does the same for outputs. Both require a transaction. They do not check signatures by themselves. In consensus, a normal input is still signature-checked separately when it establishes the authorizer. In application evaluation, the application must supply a transaction whose input or output keys are the keys the script names.

Vault's rental script uses `CHECKSENDER` for the creator. The loan script uses `CHECKSENDER` for the renter before expiry and for the creator after expiry.

#### CHECKOWN

Reads `script.utxokey` (a hex UTXO key on the script, not the witness). Returns `1` only when both of these are true:

- a blockchain was supplied and `blockchain.is_slip_unlocked` is true for that key
- a transaction was supplied, its signature verifies against `tx.from[0].public_key`, and the signature hash is not all zeros

It does not compare the UTXO key's embedded public key with the signer. The opcode returns `0` if either the blockchain or the transaction is missing.

#### CHECKOWNNFT

Reads `witness.utxokey1`, `utxokey2`, and `utxokey3`. Those hex keys must parse as an NFT tuple: Bound, then Normal or ATR, then Bound, with slip1 amount non-zero and slip3 amount zero (`nft.rs`, `from_slips`). Slip1 must be unlocked. Slip2 must be unlocked when its amount is greater than zero. The transaction signature must verify under slip2's public key (`verify_owner_tx_signature`). The script field `nftid` on Vault's default template is not read by this opcode.

Vault's default access script is this opcode. The protected object is a file stored in Archive. The NFT is the caller's Vault access key, proven by naming its three UTXO keys and signing the request transaction with the custody key.

#### CHECKOWNNFTWHERE

Does everything CHECKOWNNFT does, then applies `script.where`. Each clause has `field`, `operator`, and `value`. The only fields are `creator` (base58 of slip1's public key) and `type` (UTF-8 in slip3's public key bytes 17..33, trailing zeros stripped). Operators are `==` and `!=` on strings. On success it writes:

```json
{ "nft_id": "<slip3 public key as lowercase hex>" }
```

to `context.__opcodes.checkownnftwhere`.

Stack's private and subscription scripts use this so any NFT with `type == "stack"` and `creator == <author>` qualifies. The check is on NFT properties, not on one NFT id. `get_id` is the full slip3 public-key hex, which Stack then uses as the CHECKPATHHOP binding hash.

#### CHECKPATH

Reads `script.publickey` (the first signer), `script.hash` (a binding string, which may be empty), and `witness.hops`. Each hop is `{ "to", "value", "sig" }`. The signed payload is the string `to|value|binding_hash`. The opcode hashes that string, hex-encodes the digest, and `verify`s the hop signature over those hex characters. The next hop must be signed by the previous hop's `to`. This matches the comment that points at the JavaScript `verifyRoutingPath` message format.

#### CHECKPATHHOP

Verifies the same hop chain, then filters hops. `script.publickey` and `script.hash` are resolved, so they may be references such as `__opcodes.checkownnftwhere.nft_id`.

`value` on each hop is base64 of a UTF-8 JSON document. After the signatures verify, the opcode decodes that JSON. `where` keeps hops for which every clause is true. `selector` is `FIRST`, `LAST`, `ONLY`, or `ANY`. `assert` is a further list of clauses applied to the selected hop (`ANY` succeeds on the first filtered hop that passes every assert). Clause fields are `from`, `to`, `sig`, or `value` plus a dotted path into the decoded JSON. Optional `type` of `number`, `string`, or `boolean` coerces both sides before comparison.

On success the selected hop is stored at `context.__opcodes.checkpathhop.hop` as `{ from, to, sig, value }`.

Vault's rental script selects the first hop whose decoded `value.delegated` equals `0`, then later opcodes read `hop.to` and `hop.value.expires_at`. Stack's non-transferable scripts select a hop with `value.delegate == false` and assert `to == REQUESTER`.

#### CHECKTIME

Compares `script.timestamp` with `blk.timestamp` using `==`, `!=`, `<`, `<=`, `>`, `>=`. If no block was passed, it returns `0`.

Current callers pass no block:

- `Transaction::validate` calls `script.validate`, which passes `blk = None`
- `evaluate_script` and `evaluate_script_with_transaction` also pass `blk = None`

CHECKTIME therefore cannot succeed through the consensus spend path or through `app.core.scripting` as currently exported. Time windows that applications actually use are CHECKFIELD against `NOW`, which is the evaluator's wall clock when no block is present.

#### IMPORTFIELD

Requires `script.key` (non-empty name), a resolved non-empty `script.publickey`, a resolved non-empty `script.hash`, `witness.value` (string or number), and `witness.signature`. The canonical string is `value_as_decimal_or_text|binding_hash`. The opcode Blake3-hashes that string, hex-encodes it, and verifies the signature over the hex characters. On success it stores the value at `context.__opcodes.importfield.<key>`.

The Rustscript opcode descriptor (`node/mods/rustscript/lib/opcodes/importfield.js`) matches this shape: `key`, `witness.value`, `witness.signature`.

Stack's subscription templates in `node/mods/stack/lib/access/access-scripts.js` do not match it. They set `field: "duration"` rather than `key`, and `buildUnlockAccessScript` attaches `{ duration, signature }` rather than `{ value, signature }`. Against the current Rust opcode, that leaf returns `0` because `key` is missing and `witness.value` is missing. Do not treat the Stack subscription template as a working IMPORTFIELD until those names match the opcode.

#### IMPORTARRAY

Same signature pattern as IMPORTFIELD, but `witness.value` must be an array. The signed text is `canonical_json(array)|binding_hash`, then the hex digest is what gets verified. The array is stored at `context.__opcodes.importarray.<key>`.

#### SUMFIELDS

Resolves `a` and `b` as u64, adds them, and stores the sum at `context.__opcodes.sumfields.<into>`. `into` must be ASCII alphanumeric or underscore. Stack's subscription template adds a hop timestamp to an imported duration and names the sum `expiry`.

#### SCRIPTHASH

Resolves `source` to a JSON object, constructs a `Script`, calls `Script::hash`, and stores the hex at `context.__opcodes.scripthash.<into>`. Non-objects fail, so an unresolved path is not hashed as text. `into` has the same character restriction as SUMFIELDS.

Vault's rental update uses this to hash the loan script it just wrote into `context.loan_script`, then CHECKFIELD requires `db.owner` to equal that hash. The opcode hashes with the real `Script::hash`, including witness stripping and canonical JSON.

#### SETFIELD

`reference` must be a string starting with `context.`. `value` is resolved and written to that path. Bracket indexes such as `context.loan_script.args[0].args[0].publickey` are accepted. The destination array index must already exist. Vault uses a sequence of SETFIELD operations to copy the rental hop's recipient and expiry onto a loan-script template that was embedded as a JSON literal.

#### SETARRAY

Copies a resolved array into a `context.*` destination. If the source string is `tx.from`, `tx.to`, `tx.path`, `tx.from.p2sh`, or `tx.to.p2sh` and ordinary resolution does not yield the collection, the opcode loads that transaction collection. `.p2sh` variants keep non-bound slips whose public key starts with `0x00`.

#### SETARRAYFIELD

For a destination array of objects, sets `destination[i][field]` from a parallel source list. If the source is shorter than the destination, the last source value is reused. A scalar source is broadcast. An empty source array fails.

#### ARRAYIFY

Replaces a `context.*` value with an array of deep clones of that value. `dimension` is a count: a number, the length of a resolved array, the key count of a resolved object, or one of the special collection names above.

### Signatures and keys

Public keys in scripts are base58 Saito public keys. Signatures are hex. CHECKSIG and CHECKMULTISIG sign `message|p2sh_auth_hash` and go through `crypto::verify`, which hashes the UTF-8 string before ECDSA. CHECKPATH, CHECKPATHHOP, IMPORTFIELD, and IMPORTARRAY verify a signature over the hex encoding of a Blake3 digest, again through `crypto::verify`, so the bytes under ECDSA are the hex characters.

CHECKOWN and CHECKOWNNFT do not use that P2SH authorization hash. They verify the transaction signature itself against a public key: `tx.from[0]` for CHECKOWN, and the NFT custody slip (slip2) for the NFT opcodes.

### Hashes

| Hash | Input | Used for |
| --- | --- | --- |
| Script hash | Canonical JSON of the tree with `witness` keys removed | Address, Archive `owner`, equality checks |
| P2SH auth hash | Concatenated output-slip signature bytes | CHECKSIG / CHECKMULTISIG binding to the output set |
| CHECKHASH | Raw witness preimage | Equality with `script.hash` |
| Hop / import digest | A formatted string, then hex, then `verify` hashes that hex | Authorizing a hop payload or an imported value |

`app.crypto.hash` is the same Blake3 export (`wasm.hash`). Store builds the P2SH auth hash in JavaScript by concatenating the same slip bytes and calling `app.crypto.hash`, then signs `utxoKey|authHash`.

### Conditions

Conditions are CHECKFIELD, CHECKKEY, CHECKTIME, the `where` / `assert` lists on CHECKPATHHOP and CHECKOWNNFTWHERE, and the logical nodes AND / OR / NOT. There is no bitwise opcode and no general arithmetic besides SUMFIELDS.

### Script composition

Scripts compose by nesting JSON and by writing `context.__opcodes`.

Two different constraints show up in the current applications:

- "This asset can be spent only if these keys sign this output set." Store's CHECKMULTISIG locks the listing output. The condition is on the spending transaction's outputs, because the signature covers `p2sh_auth_hash`.
- "This update is legal only if `db.owner` equals the hash of a script the parent script just instantiated." Vault's rental script embeds a loan-script template, fills it from the hop, hashes it with SCRIPTHASH, and compares. The parent script is constraining the hash of another script. That other script is not installed on a slip by the opcode. Archive later uses the hash as `owner`, and a later read evaluates the instantiated loan script as an application access script.

SCRIPTHASH plus CHECKFIELD is the primitive that compares a script to a hash inside another script. Nothing in the opcode set inspects an arbitrary destination slip's script unless that script's JSON or hash has been placed in context or in the transaction where `resolve_ref` can read it. SETARRAY can copy `tx.to.p2sh` into context, so a script can look at the public keys of P2SH outputs in the spending transaction. Those public keys are script addresses. The script does not receive the destination script's source unless the transaction or the caller context contains it.

## Constructing Scripts

Application code builds ordinary JavaScript objects and passes them to `app.core.scripting`.

```javascript
const script = {
  op: 'CHECKMULTISIG',
  m: 1,
  publickeys: [seller_publickey, store_publickey],
  msg: 'tx.from.p2sh.utxoset_key'
};

const access_hash = app.core.scripting.hash(script);
const p2sh_address = app.core.scripting.address(script);
const access_script = JSON.stringify(script);
```

That is `buildBuyerOrStoreScript` / `createListingScript` in `node/mods/store/lib/scripting.js`. `hash` and `address` stringify objects themselves, so either an object or a JSON string is accepted.

`app.core.scripting` (`rust/saito-js/saito.ts`):

| Method | Arguments | Returns |
| --- | --- | --- |
| `hash(script)` | object or JSON string | hex script hash |
| `address(script)` | object or JSON string | `00` + hash |
| `mergeWitness(script, witness)` | script object or string, witness array or string | parsed object with witnesses inserted |
| `evaluate(script)` | object or JSON string | `Promise` of `0` or `1`. No transaction and no caller context. |
| `evaluateWithTransaction(script, tx?, context?)` | script, optional Saito transaction, optional JSON object or string | `Promise` of `0` or `1`. |

`evaluate` calls WASM `evaluate_script`. `evaluateWithTransaction` calls `tx.packData()` and then `evaluate_script_with_transaction` when a transaction is present, otherwise `evaluate_script` with the context string. Both WASM functions return `0` if the script or context is not valid JSON. Both pass the live blockchain, so CHECKOWN / CHECKOWNNFT can see the evaluating node's UTXO set. Both pass `current_p2sh_idx = None`, so application evaluation does not set `__current_p2sh_idx` unless the application is somehow inside consensus. A reference to `tx.from.p2sh.*` during an application call therefore uses ordinal 0.

Do not hash scripts with `node/lib/saito/ui/saito-scripting/saito-scripting.js`. Nothing in `node/` imports it, and it is not `Script::hash`.

## Constructing Witnesses

For consensus, the witness is inside the JSON string stored at `tx.msg.access_scripts[i]`, in the same order as P2SH inputs. Store's `signAccessScriptWitness` copies the locking script, sets `witness: { signatures: [signature] }`, and stringifies it. `createFulfillmentTransaction` and `createDelistTransaction` in `node/mods/store/lib/transactions.js` build the signed message as:

```
`${utxoset_key_of_that_p2sh_input}|${p2sh_auth_hash}`
```

and refuse to continue if `access_scripts.length` does not equal `listRustP2shInputIndexes(...).length`.

For Archive and Stack, the witness often travels separately and is merged at evaluation time. Stack's `resolveStackAccessData` reads the wallet's `stack` NFT and produces an array:

1. `{ utxokey1, utxokey2, utxokey3 }`
2. `{ hops }` when the NFT transaction message has `data.path`
3. `{ duration, signature }` when that message has `data.duration`

`mergeWitness` assigns those objects to leaf nodes in tree order. A script with a single CHECKOWNNFTWHERE leaf receives the UTXO keys. A longer script receives later objects on later leaves. Leftover objects are ignored, which is why a witness array built for a stricter script can still satisfy a shorter script whose first leaves expect the same objects in the same order.

`embedWitnessInScript` is stricter about names and looser about order: it attaches a witness only when the leaf's `op` is a key in the map. Extra keys are ignored. That is the mechanism behind graduated authorization in Stack's helper, independent of merge order.

A user produces NFT witnesses by holding the NFT and letting the application read slip UTXO keys from the wallet. A user produces CHECKSIG / CHECKMULTISIG witnesses by signing the authorization string with the wallet. A user produces hop witnesses by carrying hops whose signatures were produced when the path was created; CHECKPATHHOP rejects a hop whose base64 JSON was changed after signing.

The script cannot assume a witness field exists. Missing fields make the opcode return `0`. The script also cannot assume that a witness proves something the opcode does not check. CHECKOWNNFT proves the three keys form an unlocked tuple and that the request transaction is signed by the custody key. It does not, by itself, prove `type` or `creator`; CHECKOWNNFTWHERE does.

## Supplying Evaluation Context

### Consensus spending

The spending transaction is the context. The script can resolve `tx.*`, including `tx.from.p2sh.utxoset_key` for the input whose `access_scripts` slot is being checked, and the output set through the P2SH auth hash inside CHECKSIG / CHECKMULTISIG. `NOW` is wall-clock time because consensus passes no block. `REQUESTER` is `tx.from[0]`'s public key, which may be a bound slip or a P2SH address depending on input order. Caller-supplied JSON context is not used: `validate` calls `validate_with_context` with `supplied_context = None`.

### Application authorization

`evaluateWithTransaction(script, tx, context)` installs the transaction as `tx` / `REQUESTER` and merges `context` as the starting JSON object, subject to the deletions and overwrites listed above.

Archive's `updateTransaction` builds:

```javascript
context.db = { type: 'UPDATE', ...schema fields being written };
```

and passes that object. Vault's rental script then requires `db.type == "UPDATE"`, requires the key set to be exactly the allowed keys, and requires `db.owner` to equal the hash of the instantiated loan script.

Archive's `loadTransactions` and `deleteTransaction` call `evaluateWithTransaction(access_script, request_tx)` without an extra context object. A script that reads `db.*` will not see a database row on those paths unless the caller adds one.

Vault's `vault access file` and `vault access rental` handlers evaluate the submitted script against the peer request transaction and no extra context. The request transaction's first input becomes `REQUESTER`. The file bytes are not placed in the script context. The script gates whether Vault will ask Archive for the row.

An application can put other JSON into the context argument: a document, a row, metadata. The engine will expose it to `resolve_ref` and CHECKFIELD / CHECKKEY. It will not automatically load Archive rows, NFT metadata, or wallet state. If the opcode needs the blockchain, the WASM path already passes the local blockchain. If the opcode needs a field, the application must put that field in the transaction or in the context object.

## Testing and Debugging Scripts

The Rustscript module (`node/mods/rustscript/`) is the developer UI. It is a Saito module named Rustscript, described as "Symbolic P2SH contract scripting." It provides a create workflow and an unlock workflow, an editor, opcode field overlays, publish overlays that display the P2SH address, and `autoValidateTestScript` in `node/mods/rustscript/lib/ui/main.js`.

That validator calls the real engine:

- In the unlock workflow, if `unlock_transaction_final` exists, it calls `evaluateWithTransaction(scriptJson, unlock_transaction_final)`.
- Otherwise it calls `evaluate(scriptJson)`, which has no transaction.

Rustscript also contains JavaScript opcode files under `node/mods/rustscript/lib/opcodes/` used by the editor. Consensus does not execute those files. A script is not proven until `app.core.scripting.evaluate` or `evaluateWithTransaction` returns `1`, or until a transaction passes `Transaction::validate`.

`script.rs` contains Rust unit tests, including Vault rental and loan-update cases and CHECKPATHHOP selector cases. Those tests call `Script::validate` / `validate_with_context` directly.

There is no separate consensus debugger that traces opcode results back to JavaScript. The integer result is the public result. Archive and Vault log hash comparisons and the boolean outcome; they do not return an execution trace.

## P2SH Category 1: Consensus Asset Locking

An asset is locked when a spendable slip's public key is a script address. The locking script is not stored in the UTXO set. The spender must reveal a script that hashes to that address and that returns `1` against the spending transaction.

Who enforces the result: `Transaction::validate` in every validating node. A failed script makes the transaction invalid. The asset does not move.

```
slip.public_key = 0x00 || script hash
    +
tx.msg.access_scripts[i] = script JSON including witness
    +
spending transaction outputs (bound into CHECKSIG / CHECKMULTISIG)
        ↓
consensus
```

## Saito Store Example

Store is the concrete consensus example. The script is a 1-of-2 CHECKMULTISIG.

Listing (`createListAssetTransaction` in `node/mods/store/lib/transactions.js`):

1. `createListingScript` builds CHECKMULTISIG with `m: 1`, keys `[seller, store]`, message `tx.from.p2sh.utxoset_key`.
2. The listing transaction message records `access_script` (witness-free JSON string), `access_hash`, and `p2sh_address`.
3. `wallet.createNFTTransaction` sends the NFT to `p2sh_address`. For a `store-nft-rental` NFT, `modifyBeforeSend` adds transfer data `{ delegated: true }` toward the store public key. Other NFT types do not set that flag.
4. The seller signs and broadcasts. Consensus accepts this transaction as a normal NFT spend into the script address. The script is not evaluated on the locking transaction. It is evaluated when that P2SH output is spent.

Purchase fulfillment (`createFulfillmentTransaction`):

1. Inputs include the buyer's payment slip and the listing's P2SH-held NFT slips.
2. Outputs pay the buyer the purchased NFT tuple (and a relisted remainder back to a listing script when quantity remains) and pay the seller.
3. Output indexes are assigned, the P2SH auth hash is computed over every output, and each P2SH input gets a CHECKMULTISIG witness signed over `utxoKey|authHash`.
4. `tx.msg.access_scripts` is the array of those witnessed script strings.
5. The transaction is signed and broadcast.

Delist (`createDelistTransaction`) spends the same listing script back to the seller, with the seller's signature in the witness. The store key could also produce a valid witness, because `m` is 1.

What consensus does on the spend:

- Counts `0x00` inputs.
- Checks `access_scripts.length`.
- Checks each script hash against the input public key.
- Runs the script. CHECKMULTISIG resolves the message to that input's UTXO key and checks the signature against the output-set hash.

Success moves the slips. Failure rejects the transaction. Store's `executeListingScript` is not this check. If the script message starts with `tx.`, that helper returns `true` without calling the evaluator. It is a local precheck used by the module, not the consensus decision.

Payment into a purchase script follows the same pattern in `createPurchaseScript`: the keys are `[buyer, store]` instead of `[seller, store]`.

## P2SH Category 2: Application-Level Authorization

An application may store data off-chain, or in Archive, and store only the script hash beside it. A requester submits the script, a witness, and a transaction. The application hashes the script, compares it to the stored hash, and evaluates. The result selects an application behavior: return a row, refuse an update, release a file.

```
script result
    ↓
application decision
```

That decision is not blockchain validity. A node that skips the check can reveal data it holds. Other nodes do not learn a new consensus state from the check. The cryptographic content of the check is still real: the opcodes verify signatures, NFT custody, and hashes. What is application-defined is the consequence.

## Archive Example

Archive stores transactions in the `archives` table. The `owner` column is a string. When it is non-empty, Archive treats it as a script hash.

Current constructor sets `enforce_access_hash = 1`, so `loadTransactions` filters rows. For each row with `owner`:

- If the query includes `access_witness` and the stored transaction message contains `access_script`, Archive `mergeWitness`es that locking script with the witness array.
- Otherwise it uses `obj.access_script`.
- It hashes the result. The hash must equal `row.owner`.
- It calls `evaluateWithTransaction(access_script, request_tx)` with no extra context.
- A result of `1` includes the row. Anything else drops the row.

`updateTransaction` and `deleteTransaction` enforce `owner` even as a separate gate from the load filter. Update builds `context.db` from the columns being written and passes it as the third argument. Delete does not pass that context.

Empty `owner` means the row is returned and updated without a script. Archive does not interpret the script's meaning beyond `1` or `0`. Vault and Stack decide what hash to store and what script to submit.

Vault assigns `archive_mod.access_hash = 1` before some queries. Archive does not read a field named `access_hash`. The flag Archive reads is `enforce_access_hash`, which the Archive constructor already sets to `1`.

## Vault Example

Vault protects file payloads that live in Archive, not slips locked by the file's access script.

Add file (`node/mods/vault/lib/transactions/add-file.js`):

- The default access script is CHECKOWNNFT (`lib/contracts/default.js`). `build()` can fill `nftid` and the three witness UTXO keys. The opcode ignores `nftid` and reads the witness keys.
- `app.core.scripting.hash(access_script)` becomes `access_hash`.
- On `vault add file`, the peer saves the file transaction to Archive with `owner` set to that hash.

Read (`vault access file` in `vault.js`):

- The requester's transaction carries `access_script` and `access_hash`.
- Vault hashes the script and evaluates it with `evaluateWithTransaction(access_script, tx)`.
- On `1`, Vault loads Archive with `owner` = that hash and `sig` = `file_id`, and returns the transactions to the requester.
- On `0` or a hash mismatch, Vault returns `access_denied_script_failed` and does not query Archive.

The witness proves the requester can sign a transaction as the custody key of an unlocked NFT tuple. The file is not on-chain. A Vault operator who ignores the script can still read the Archive row on that machine. Other operators, and consensus, are not bound by this Vault's decision.

Rental is a second Vault script, not a second consensus system. `lib/contracts/rental.js` builds:

```
OR(
  CHECKSENDER(creator),
  AND(
    CHECKPATHHOP(FIRST hop with value.delegated == 0, signed from creator),
    DB_UPDATE_LOGIC
  )
)
```

`DB_UPDATE_LOGIC` copies a loan-script template into `context.loan_script`, overwrites the renter public key and both expiry fields from the selected hop, SCRIPTHASHes that object, and requires the Archive update context to be an UPDATE whose `owner` equals that hash and whose keys are only `type`, `owner`, and `updated_at`. The loan script itself (`lib/contracts/loan.js`) is:

```
OR(
  AND(CHECKSENDER(renter), NOW < expires_at),
  AND(CHECKSENDER(creator), NOW > expires_at)
)
```

`vault access rental` evaluates the submitted loan script against the request transaction. `rental-checkout.js` writes the loan hash into Archive `owner`. After that, reads succeed only when the loan script returns `1`: the renter before `expires_at`, or the creator after `expires_at`, judged by the evaluating node's clock.

The tests in `checkpathhop.rs` (`vault_loan_update_correct_owner_hash_passes` and the surrounding cases) show that a caller-supplied `context.loan_script` is overwritten by SETFIELD, and that a wrong renter or a wrong expiry produces a different hash and fails.

## Saito Stack Access Scripts and Subscriptions

Stack stores the witness-free access script and its hash on the post transaction (`newtx.msg.access_script`, `newtx.msg.access_hash`). On confirmation, if `access_hash` is present, Stack saves the post to Archive with `owner` set to that hash (`stack.js`, the confirmation archive write). Public posts have no access script and no hash, so Archive `owner` stays empty and the post loads without a witness.

`getAccessScriptForIntent` in `node/mods/stack/lib/access/access-scripts.js`:

| Intent | Script |
| --- | --- |
| `visibility: "public"` | `null` |
| `private` + transferable (default) | CHECKOWNNFTWHERE `type == "stack"` and `creator == author` |
| `private` + non-transferable | AND of that CHECKOWNNFTWHERE and a CHECKPATHHOP that requires `value.delegate == false` and `to == REQUESTER`, bound to the NFT id |
| `subscription` + transferable | AND of CHECKOWNNFTWHERE, CHECKPATHHOP (`delegate == false`), IMPORTFIELD, SUMFIELDS, and CHECKFIELD `expiry > NOW` |
| `subscription` + non-transferable | The same, plus CHECKFIELD `hop.to == REQUESTER` |

`resolveStackAccessData` selects a wallet NFT whose slip3 type is `stack` and, when an author is provided, whose slip1 public key equals that author. The witness array is the three UTXO keys, plus hops and duration taken from the NFT transaction message when those fields exist.

Loading a post passes `access_witness` into Archive. Archive merges it into the locking script stored on the post and evaluates against `request_tx`. Success is an application decision by Archive on that node.

The subscription IMPORTFIELD leaf does not match the Rust opcode, as described above. The private transferable script does match CHECKOWNNFTWHERE and is the script to treat as the working Stack example. The non-transferable and subscription trees are the intended stricter compositions; verify them with `evaluateWithTransaction` before depending on them, and fix the IMPORTFIELD field names before expecting subscription scripts to return `1`.

## Graduated / Increasingly Specific Authorization

Current implementation:

- Private transferable Stack access is one CHECKOWNNFTWHERE on type and creator.
- Non-transferable and subscription scripts are that check plus further leaves under `AND`.
- `embedWitnessInScript` attaches witnesses by opcode name. A map that contains CHECKOWNNFTWHERE, CHECKPATHHOP, and IMPORTFIELD can be applied to a script that only contains CHECKOWNNFTWHERE. The unused entries are not attached.
- `mergeWitness` assigns a witness array from the left. If the shorter script's first leaf is the same CHECKOWNNFTWHERE, the first array element still fills it, and extra elements are ignored.

So a witness built from a Stack NFT can satisfy the private transferable script. The same NFT's extra path and duration are needed only by scripts that contain those later opcodes. Holding the NFT does not automatically satisfy a script. The application must put the UTXO keys into the witness and must evaluate a transaction signed by the custody key. A script that adds CHECKPATHHOP or IMPORTFIELD fails closed when those witness fields are absent or when the opcode arguments do not match Rust.

Architectural pattern this supports: a stricter script can be a weaker script plus additional leaves, and a witness for the stricter script can contain the weaker script's witness as a subset. Applications can publish several hashes for several levels. This repository's Stack module publishes one script per post, chosen by `getAccessScriptForIntent`. It does not install a ladder of on-chain credentials by itself.

What is not implemented: consensus does not know about "tiers." A more specific witness does not partially satisfy a script. `AND` fails the whole script when any leaf returns `0`.

## Constitutional Contracts

"Constitutional contract" is not a consensus type, a slip type, or an opcode. In this codebase the pattern appears in Vault's rental script: a script that will not authorize an Archive metadata update unless `db.owner` equals the hash of a specific child script (the loan script) instantiated from the rental hop.

That is different from Store. Store's script says which keys may spend the locked NFT, and the signature binds the output set. The NFT does not contain a rule, enforced by consensus, of the form "this NFT may only be sent to a script that matches this schema." `modifyBeforeSend` on a rental listing can refuse to build a transaction in application code. That refusal is the module declining to sign or broadcast. It is not `Transaction::validate` inspecting the destination script.

The reusable primitive that does exist is SCRIPTHASH together with CHECKFIELD, evaluated in a context the application supplies. A parent script can require some contextual field to equal the hash of a script the parent itself assembled. When that field is Archive's next `owner`, the parent is choosing the only access script that will pass later application checks. Consensus still does not interpret `owner`.

Potential use, not a current consensus feature: an asset whose spend script uses SETARRAY on `tx.to.p2sh` and CHECKFIELD on those public keys can require that an output pay a specific script address. That constrains the destination address, which is a script hash, not the destination script's source text. No Store or Vault path does this today.

## Consensus Enforcement vs Application Enforcement

| Question | Consensus spend | Application authorization |
| --- | --- | --- |
| Who calls the evaluator | `Transaction::validate` | The module: Archive, Vault, Rustscript, or the module's own helper |
| Script identity | Hash must equal the input public key | Hash must equal the value the application stored or the requester claimed, if the application checks |
| Transaction | The spending transaction | Whatever object the application passes, or none |
| Extra context | None | Whatever object the application passes |
| Block | Not passed | Not passed by the WASM API |
| On `1` | The transaction may continue through the rest of validation | The application continues its own action |
| On `0` | The transaction is invalid | The application denies the action |
| Can a malicious application flip the outcome for the network | No | It can lie about its own decision. It cannot mark a consensus transaction valid. |

Store fulfillment is category 1 even though Store also keeps `access_script` in its database. The spend is valid only if consensus recomputes the hash and the CHECKMULTISIG result.

Vault file release and Stack post loading are category 2 even though they use CHECKOWNNFT and the chain's UTXO set. The NFT ownership check is cryptographic. The decision to return bytes is the application's.

## Security Considerations

- Hash equality is part of authorization. Evaluating a script that does not hash to the committed address or Archive `owner` must fail closed. Consensus does this. Archive and Vault do this before treating the result as success. An application that evaluates an arbitrary script and ignores the hash is authorizing a different rule than the one that was published.
- Witnesses are not secret proofs of application intent. They are inputs to specific opcodes. Extra witness data does not widen a script that does not read it.
- `NOW` is the evaluating clock when no block is supplied. Two Vault nodes can disagree around an expiry. A requester cannot choose `NOW` by setting `tx.timestamp`.
- CHECKOWNNFT trusts the blockchain view of the node running the evaluator. An application-level check on a node with a stale or dishonest UTXO set returns whatever that view supports. Consensus checks use each validating node's view inside block validation.
- Application context is chosen by the application. A script that allows an update when `db.owner` matches a hash is only as strong as the application's refusal to write `owner` when the script returns `0`. Archive's update path does refuse. A different module that writes `owner` without evaluating is not protected by the existence of the script engine.
- CHECKSIG without a transaction cannot succeed. Do not use `evaluate()` to test Store scripts. Use `evaluateWithTransaction` with a transaction whose outputs match the outputs that will be signed.
- The P2SH auth hash covers every output. Adding a fee output after signing the witness invalidates CHECKSIG / CHECKMULTISIG. Rustscript funds the fee transaction before the first signature for this reason (`unlock_transaction_final`).
- ATR transactions do not run scripts.
- `Script::parse` panics on invalid JSON in native Rust. The WASM entry points catch invalid JSON and return `0` before `parse`.

## Developer Workflow

1. What am I protecting? A slip, or data this application stores?
2. If it is a slip, the rule is consensus. Put `app.core.scripting.address(script)` on the output public key. On the spend, put the witnessed script JSON in `tx.msg.access_scripts` in P2SH-input order.
3. If it is data, the rule is the application. Store `app.core.scripting.hash(script)` where the gate will look (Archive `owner`, or a field you compare yourself). On the request, hash the submitted script and call `evaluateWithTransaction`.
4. What must the witness prove? Pick opcodes that check that fact. CHECKMULTISIG proves keys authorized this output set. CHECKOWNNFTWHERE proves custody of an NFT with a given creator and type. CHECKPATHHOP proves a signed hop chain. CHECKFIELD proves a relationship in the context you supply.
5. What context will exist? For a consensus spend, only the spending transaction, `NOW`, and `REQUESTER`. For an application, the transaction you pass plus the object you pass. Do not reference `db.owner` unless the caller puts `db` on the context, the way Archive update does.
6. Build the witness-free object. Hash and address it with `app.core.scripting`. Embed witnesses with `mergeWitness` or by setting `witness` on the leaves. Keep witness-free copies for publication; the hash is stable either way because `witness` is stripped.
7. Evaluate with the same transaction shape you will use in production, including output indexes, before asking users to sign.
8. Decide who acts on `1`. If the answer is "the network," the call site must be `Transaction::validate`, which means the script must be on a `0x00` input. If the answer is "this module," write the branch explicitly next to the `evaluateWithTransaction` call.
9. Test in Rustscript's unlock flow when the script needs a transaction, or with a direct `evaluateWithTransaction` call. `evaluate` alone is the right test only for opcodes that ignore the transaction, such as CHECKHASH.

## Common AI Mistakes

- Assuming Saito P2SH is Bitcoin script bytecode with `OP_HASH160` and a redeem script stack. It is a JSON tree evaluated by `Script::validate_with_context`.
- Treating the script as an opaque string. The hash is defined on the JSON value after `witness` removal and canonical encoding.
- Forgetting the witness. A locking script hash can match while evaluation still returns `0`.
- Forgetting context. CHECKFIELD on `db.type` does nothing useful if the caller did not pass `db`.
- Assuming every `evaluateWithTransaction` result is a consensus rule.
- Assuming an application check is safe against a dishonest operator of that application. The operator holds the data and chooses whether to call the evaluator.
- Inventing a new authorization service when `hash`, `address`, `mergeWitness`, and `evaluateWithTransaction` are already on `app.core.scripting`.
- Copying the transaction into a parallel JSON structure and evaluating the copy. Pass the transaction as the `tx` argument so `tx.*` and `REQUESTER` refer to the real object.
- Wrapping the evaluator in a generic middleware layer. Store, Archive, Vault, and Stack call the scripting methods directly.
- Treating Archive access control as a consensus rule. Archive drops rows in its own process.
- Assuming any NFT in the wallet satisfies CHECKOWNNFT. The witness must contain that NFT's three UTXO keys, the tuple must be unlocked, and the transaction must be signed by slip2's key. CHECKOWNNFTWHERE also checks creator and type.
- Assuming a richer witness satisfies a weaker script without looking at merge order or opcode names. `mergeWitness` is positional. `embedWitnessInScript` is by `op` name. A mismatched first element fills the wrong leaf.
- Assuming a script can read application memory. It can read the transaction, the blockchain view used by the NFT and CHECKOWN opcodes, `NOW`, `REQUESTER`, and the JSON object the caller passed.
- Assuming an NFT can constrain the next script it is spent into as a consensus rule. That pattern exists only as Vault's application-level SCRIPTHASH check, plus whatever spend script the current holder actually locked the slip with.
- Copying Stack's subscription IMPORTFIELD literally. The Rust opcode expects `key` and `witness.value`, not `field` and `witness.duration`.
- Using CHECKTIME and expecting it to run. Current consensus and WASM paths pass no block.
- Using `SlipType.P2SH` from `saito-js`. The JavaScript enum does not export it. Consensus detects P2SH by the `0x00` public-key prefix.
- Calling the unwired helper at `node/lib/saito/ui/saito-scripting/saito-scripting.js`.

## Complete Examples

### Example 1: Consensus-controlled asset

```
NFT or SAITO slip
    ↓ public key = app.core.scripting.address(script)
CHECKMULTISIG or CHECKSIG script
    ↓ witness.signature(s) over resolved_message|p2sh_auth_hash
spending transaction, especially its outputs
    ↓ Transaction::validate
1 or 0
    ↓ consensus accepts or rejects the spend
```

Store's listing script is the working form. The message reference `tx.from.p2sh.utxoset_key` binds the signature to the input being spent. The auth hash binds it to the outputs.

### Example 2: Store list, sell, delist

```
seller NFT
    ↓ createListingScript([seller, store])
list-asset transaction pays the NFT to the script address
    ↓ later, fulfillment or delist spends that address
witness: 1-of-2 signatures
context: the spending transaction
    ↓ consensus CHECKMULTISIG
success moves the NFT to the buyer, or back to the seller on delist
failure leaves the listing output unspent
```

Enforcer: consensus. Store's database rows are how the module finds the listing. They are not the lock.

### Example 3: Archive record

```
archived transaction
    ↓ archives.owner = script hash
requester supplies access_script and optional access_witness
    ↓ mergeWitness when the stored tx carries the locking script
request_tx, and on update also context.db
    ↓ Archive calls evaluateWithTransaction
1 returns or updates the row; 0 hides or refuses it
```

Enforcer: the Archive module. `enforce_access_hash` gates loads. Update and delete check `owner` whenever it is non-empty.

### Example 4: Vault file

```
file transaction in Archive, owner = hash(CHECKOWNNFT script)
    ↓ requester sends vault access file with witnessed script
Vault evaluateWithTransaction(script, request tx)
    ↓ 1: Archive load by owner and file_id
    ↓ 0: access_denied_script_failed
```

Enforcer: Vault, then Archive's owner check on the subsequent load. The file bytes are off-chain from the script's point of view.

### Example 5: Stack post

```
post transaction
    ↓ msg.access_script = CHECKOWNNFTWHERE(type stack, creator author)
    ↓ msg.access_hash = hash(that script)
Archive owner = access_hash on confirm
    ↓ reader wallet supplies utxokey1..3 in access_witness
Archive mergeWitness + evaluateWithTransaction(request_tx)
    ↓ 1: post is returned; 0: row dropped
```

Enforcer: Archive, using the hash Stack stored. Public posts skip this because they have no hash and no owner.

### Example 6: Stricter authorization on the same NFT witness

```
private transferable script
    CHECKOWNNFTWHERE(type, creator)
        accepts witness { utxokey1, utxokey2, utxokey3 }

non-transferable script
    AND(
      that same CHECKOWNNFTWHERE,
      CHECKPATHHOP bound to __opcodes.checkownnftwhere.nft_id
    )
        needs the same UTXO witness plus hops

subscription script (as written)
    AND( those, IMPORTFIELD, SUMFIELDS, CHECKFIELD )
        needs a further signed duration
        and the current template's IMPORTFIELD shape does not match Rust
```

A witness map that includes the UTXO keys can be embedded into the shorter script. The shorter script does not become the longer script. Each post stores one hash.

Enforcer: still Archive, per post. There is no consensus tier.

### Example 7: Vault loan constitution

```
rental hop (creator → renter, expires_at, delegated == 0)
    ↓ FILE script SETFIELD onto the loan template
    ↓ SCRIPTHASH
Archive update context.db.owner must equal that hash
    ↓ later read evaluates the loan script
OR(
  renter AND NOW < expires_at,
  creator AND NOW > expires_at
)
    ↓ Vault grants or denies the file read
```

Enforcer: Vault and Archive. The child script is chosen by hash during an application update. Consensus does not store or enforce the loan script.

## Reference: Important APIs and Opcodes

### Rust

| Name | Location | Role |
| --- | --- | --- |
| `Script::hash` | `scripting/script.rs` | Locking-script hash |
| `Script::address` / `address_hex` | same | `0x00` \|\| hash |
| `Script::merge_witness` | same | Positional witness merge |
| `Script::validate` | same | Evaluate with no caller context |
| `Script::validate_with_context` | same | Evaluate with optional caller JSON |
| `canonical_json` | same | Hash encoding |
| `resolve_ref` | same | Path resolution |
| `get_p2sh_auth_hash` | same | Output-set binding for signatures |
| `Transaction::validate` P2SH loop | `consensus/transaction.rs` | Consensus enforcement |
| Opcode `validate` / `execute` | `scripting/opcodes/*.rs` | Leaf behavior |

### WASM and JavaScript

| Name | Location | Role |
| --- | --- | --- |
| `evaluate_script` | `saitowasm.rs` | No transaction; optional context JSON |
| `evaluate_script_with_transaction` | same | Transaction plus optional context |
| `get_script_hash` / `get_script_address` | same | Hash and address |
| `merge_witness` | same | Witness merge, returns a JSON string |
| `app.core.scripting.*` | `rust/saito-js/saito.ts` | Methods modules call |

### Application constructors

| Name | Location | Role |
| --- | --- | --- |
| `createListingScript` / `createPurchaseScript` / `signAccessScriptWitness` | `node/mods/store/lib/scripting.js` | Store CHECKMULTISIG |
| `listRustP2shInputIndexes` | `node/mods/store/lib/helpers.js` | Mirrors consensus P2SH input discovery |
| `getAccessScriptForIntent` / `embedWitnessInScript` | `node/mods/stack/lib/access/access-scripts.js` | Stack templates and named witness embed |
| `buildDefaultAccessScript` | `node/mods/vault/lib/contracts/default.js` | CHECKOWNNFT |
| `buildRentalAccessScript` | `node/mods/vault/lib/contracts/rental.js` | Rental master script |
| `buildLoanScript` / `instantiateLoanScript` | `node/mods/vault/lib/contracts/loan.js` | Loan script template |
| Rustscript `autoValidateTestScript` | `node/mods/rustscript/lib/ui/main.js` | Editor evaluation against the Rust engine |

### Opcode index

| Op | Success condition | Writes |
| --- | --- | --- |
| `AND` / `OR` / `NOT` | Logical combination of children | Nothing |
| `CHECKHASH` | Blake3(witness.input) hex equals script.hash | Nothing |
| `CHECKSIG` | Signature over `msg\|p2sh_auth_hash` | Nothing |
| `CHECKMULTISIG` | At least `m` distinct keys verify | Nothing |
| `CHECKFIELD` | Comparison or IN / NOT-list | Nothing |
| `CHECKKEY` | Key presence or key-set allow/deny | Nothing |
| `CHECKSENDER` | An input public key matches | Nothing |
| `CHECKRECIPIENT` | An output public key matches | Nothing |
| `CHECKOWN` | Named UTXO unlocked and tx signed by from[0] | Nothing |
| `CHECKOWNNFT` | Witness tuple unlocked and tx signed by custody key | Nothing |
| `CHECKOWNNFTWHERE` | CHECKOWNNFT plus creator/type clauses | `__opcodes.checkownnftwhere.nft_id` |
| `CHECKPATH` | Hop signatures verify | Nothing |
| `CHECKPATHHOP` | Hop signatures verify and selector/where/assert pass | `__opcodes.checkpathhop.hop` |
| `CHECKTIME` | Block timestamp comparison; no block means failure | Nothing |
| `IMPORTFIELD` | Signed scalar; requires `key` and `witness.value` | `__opcodes.importfield.<key>` |
| `IMPORTARRAY` | Signed array | `__opcodes.importarray.<key>` |
| `SUMFIELDS` | u64 sum | `__opcodes.sumfields.<into>` |
| `SCRIPTHASH` | Source is an object | `__opcodes.scripthash.<into>` |
| `SETFIELD` | Write resolved value to `context.*` | Caller context |
| `SETARRAY` | Copy an array into `context.*` | Caller context |
| `SETARRAYFIELD` | Write a field across a context array | Caller context |
| `ARRAYIFY` | Repeat a context value into an array | Caller context |
