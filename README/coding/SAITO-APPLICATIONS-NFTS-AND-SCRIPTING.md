# Saito Applications — NFTs

This chapter is for an AI coding agent helping a developer build a Saito application that creates, holds, transfers, displays, or uses NFTs.

An NFT in Saito is a transferable on-chain ownership record. It is a specific arrangement of transaction slips, not a JSON object and not an ERC-721 token. Application content, access rules, and product meaning sit beside that record. They are not the same thing.

Pay-to-script-hash, witnesses, and script evaluation are documented in `SAITO-APPLICATIONS-PAY-TO-SCRIPT-HASH.md`. This chapter explains when an NFT is the right primitive and how applications attach content, transfers, and access conditions to one.

The question to ask is:

> Does this requirement involve a transferable on-chain ownership or entitlement that another user or application needs to recognize?

If it does, use the NFT tuple, the wallet NFT list, and `SaitoNFT`. If it does not, do not invent an NFT.

## What an NFT Is

Consensus recognizes an NFT as three consecutive slips in a transaction whose type is `TransactionType::Bound`:

| Slip | Type | Amount | Public key |
| --- | --- | --- | --- |
| slip1 | `Bound` | quantity, must be greater than 0 | creator |
| slip2 | `Normal` or `ATR` | deposit in nolans, may be 0 | current owner |
| slip3 | `Bound` | must be 0 | NFT id |

`Transaction::is_nft` and `nft::from_slips` in `rust/saito-core/src/core/consensus/nft.rs` accept only that pattern. Bound slips that are not part of this triple are not an NFT.

The three slips do not work like an ordinary payment output.

- slip1's amount is a quantity of this NFT, not a SAITO balance. It is bound, so it is not spent as a normal fee-paying input by itself.
- slip2 is the spendable custody slip. Moving the NFT means spending slip2 together with the two bound slips. Its amount is the SAITO deposit that travels with the NFT and is what automatic transaction rebroadcast (ATR) treats as the payload.
- slip3 carries the id. Its amount is always 0. Its 33-byte public key is not a user key.

`Wallet::create_nft_uuid` builds that id from the UTXO spent at mint time:

- bytes 0..8: input slip `block_id`, big-endian
- bytes 8..16: input slip `tx_ordinal`, big-endian
- byte 16: input slip `slip_index`
- bytes 17..33: `nft_type` as UTF-8, padded with zeros or truncated to 16 bytes

`get_id` is the lowercase hex of slip3's public key. `get_type` decodes bytes 17..33 and strips trailing zeros. `get_creator` is slip1's public key as base58. `get_owner` is slip2's public key as base58. `get_amount` is slip1's amount. `get_deposit` is slip2's amount.

The JavaScript wallet mirrors the type decode in `Wallet.extractNFTType(hex)`. It expects a 33-byte hex string (66 hex characters) and reads the same trailing 16 bytes. `Wallet.computeNFTIdFromTx(tx)` reads output slip index 2, or input slip index 2 if there is no output, and returns that public key as hex. That is how an application names an NFT it does not hold.

A mint transaction's message is separate from the tuple. `create_bound_transaction` stores `tx_msg` in `transaction.data`. Title, image, file id, access script, and path hops live there. The UTXO set keeps the slips. It does not keep the message. After the transaction is confirmed, a wallet that owns slip2 can see the tuple. It still needs the transaction, usually from the local Archive, to read the message.

So:

```
NFT tuple          on-chain ownership: id, type, quantity, creator, owner, deposit
transaction.data   application payload that traveled with a mint or transfer
wallet.nfts        this user's unspent tuples
SaitoNFT           application object that joins a tuple to a fetched transaction
```

## NFT-Associated Data

`SaitoNFT.extractNFTData` reads `tx.returnMessage()` into `this.txmsg` and `this.data`. It copies:

- `data.image`, `data.css`, `data.js`, `data.text`, `data.saito`
- `txmsg.title` and `txmsg.description` when the object does not already have them
- `data.expires_at`, or `expires_at` inside a hop on `data.path` whose decoded `delegated` is `0`

Anything else in `data` may be summarized into `this.json`. Possession of the three slips does not populate these fields. `SaitoNFT.fetchTransaction` loads them.

Lookup order:

1. If the object already has a transaction and content, stop.
2. Load from the local Archive by `{ sig: tx_sig }` when a signature is known, otherwise `{ field4: id }`.
3. If a signature search misses, try `{ field4: id }` locally.
4. Unless `localhost_only` is set, ask the first connected peer and, on success, `saveTransaction` locally with `{ field4: id, preserve: 1 }`.

`Wallet.loadNFTs` also writes confirmed NFT transactions into the local Archive under `field4` equal to the NFT id, so a later `SaitoNFT` can find the mint or latest saved transfer without embedding the payload in the wallet list.

The wallet list entry is the slips, id, `tx_sig`, and optional ticker. It is not the image, the file, or the module binary. An application renders an NFT by constructing `SaitoNFT` from the list entry and calling `fetchTransaction` before it reads `image`, `text`, `js`, `saito`, or `txmsg`.

Large content does not belong in the tuple. It may be inline in `data` when it is small enough to justify the transaction, or it may be a reference. Vault stores the file in Archive and puts `file_id` on the NFT message. Stack stores the post in Archive and uses the NFT only as the credential. Prefer a reference when the payload is a file, a ROM, or a module the user will fetch again.

## SaitoNFT and the NFT UI

`SaitoNFT` is `node/lib/saito/ui/saito-nft/saito-nft.js`.

```javascript
const SaitoNFT = require('./path/to/lib/saito/ui/saito-nft/saito-nft');
const nft = new SaitoNFT(app, mod, tx, walletEntry);
```

Pass a transaction when you have the mint or transfer. Pass a wallet entry (`app.options.wallet.nfts[i]`) when you only have slips. The constructor reads `id` or `nft_id`, `slip1`, `slip2`, `slip3`, and `tx_sig` / `nfttx_sig`. If `tx` is present it calls `buildNFTData`. Otherwise it calls `parseSlips`, which sets `amount` from slip1, `creator` from slip1's public key, `uuid` from slip3's public key, `deposit` from slip2, and `nft_type` from `returnType()`.

Methods applications actually call:

| Method | Behavior |
| --- | --- |
| `fetchTransaction(callback, localhost_only)` | Load the transaction and payload, as above. |
| `returnType()` | Type string from slip3, or `saito-app` when `data.saito` is set, or `image` / `text` / `json` / `js` / `css` from which payload field is present. |
| `returnCreator()` | Creator public key. |
| `returnMediaDisplay()` / `returnImage()` | Card rendering data. Does not fetch. |
| `modifyBeforeSend(tx, receiver, data)` | Asks modules that respond to `saito-nft-transfer` for this type to mutate the outbound transaction. A handler that throws blocks the send and the method returns `null`. |
| `setDeposit` / `getDeposit` | Convert between SAITO and the nolan deposit on the object. This does not rewrite a confirmed slip. |
| `getSlipCount` / `getTotalAmount` / `returnAllSlips` | Quantity across wallet entries that share this id, when slip2 is this module's key. |
| `remainingExpiresLabel()` | Countdown from `expires_at`. Display only. |

`returnType()` prefers a type already parsed from slip3. Content-based types (`image`, `saito-app`, and so on) are a fallback when slip3 does not yield a type. Minting should set `nft_type` through `createMintNFTTransaction` so the chain, not the payload shape, is what other users read.

Generic UI, all under `node/lib/saito/ui/saito-nft/`:

| Object | Role |
| --- | --- |
| `SaitoNFTCard` | One card. Click installs or enables executable NFTs. |
| `NFTOverlay` | Detail, transfer, and capabilities. Uses `SaitoOverlay` and `SaitoContacts`. |
| `NFTAtomize` | Split a quantity into multiple tuples, with its own per-transaction limits. |
| `SelectNFTOverlay` | Pick from the wallet list. Refreshes with `updateNFTList` before render. |
| `create-overlay.js` | Mint UI. Types come from modules that `respondTo('saito-create-nft')`, plus built-in types such as `text`, `token`, `saito-app`, `json`, `css`, `js`. |
| `NFTSecurityOverlay` | Warning before enabling JavaScript or a `.saito` payload. |
| `saito-nft.css` | Shared card and overlay layout, imported as `/saito/css-imports/ui/saito-nft.css`. |

Application-specific UI should wrap these. Store has its own listing picker (`node/mods/store/lib/ui/overlays/nft-picker.js`) because a listing is not a generic transfer. Vault has `load-nfts.js` because it is choosing an access key. Those screens still read `app.options.wallet.nfts` and `extractNFTType`. They do not keep a second ownership list.

`SaitoNFTCard` enables an NFT by recording `nft.tx_sig` in `app.options.permissions.nfts` and emitting `saito-enable-nft`. Disabling emits `saito-disable-nft`. `Wallet.loadNFTs` runs `data.js` and injects `data.css` only for signatures in that permission list. Enabling is a local decision. It is not a transfer and it is not consensus.

## The Wallet

The user's NFT holdings are `app.options.wallet.nfts`, refreshed from the Rust wallet.

| API | Where | What it does |
| --- | --- | --- |
| `wallet.getNFTList()` | core wallet | On-chain tuples this key can spend, as JSON. |
| `wallet.updateNFTList()` | `node/lib/saito/wallet.ts` | Replaces `app.options.wallet.nfts` from `getNFTList`. Returns `{ updated, rebroadcast, persisted }`. |
| `wallet.addNft(slip1, slip2, slip3, id, txSig, ticker)` | wallet | Inserts one tuple into the Rust wallet. `addNFTList` replays the saved list on startup. |
| `wallet.saveNFTList(nfts)` | wallet | Persists the list. |
| `wallet.loadNFTs()` | wallet | Calls `updateNFTList`, then loads enabled NFT transactions from the local Archive. Skipped when the URL contains `nonfts`. |
| `wallet.extractNFTType(hex)` | wallet | Type string from a slip3 UTXO key or public-key hex. |
| `wallet.computeNFTIdFromTx(tx)` | wallet | Id hex from slip 2 of the transaction. |
| `wallet.createMintNFTTransaction(num, deposit, tx_msg, fee, recipient, nft_type)` | wallet | Mint. Calls `createBoundTransaction`. |
| `wallet.createNFTTransaction(nft, recipient, amount, fee, deposit, tx_msg)` | wallet | Send `amount` of `nft.id`. The wallet selects input shards. |
| `wallet.createNFTShardTransaction(nft, recipient)` | wallet | Send the specific triple in `nft.slip1/2/3`. Comment in the source marks this as the legacy bound path. |
| `wallet.createSplitNFTTransaction(nft, leftCount, rightCount)` | wallet | Split one triple into two quantities. |
| `wallet.createMergeNFTTransaction(nft)` | wallet | Merge wallet triples that share `nft.id`. |
| `wallet.createAtomizeNFTTransaction(nft)` | wallet | Break quantity into separate triples. |
| `wallet.createRemoveNFTTransaction(nft)` | wallet | Spend the triple out. |

`updateNFTList` groups by id. A change that only replaces slips is classified as `rebroadcast` (ATR moving the same NFT). A change in count or payload is `updated`. Merge bookkeeping uses `app.options.wallet.nft_merges[id]`, a timestamp with a two-minute window, so a user-initiated merge is not reported as a network rebroadcast.

Do not create an application table of owners. Read `app.options.wallet.nfts` after `updateNFTList`. Cache a rendering index if a screen needs one. The spendable set remains the wallet's copy of the UTXO tuples.

Each list entry has `id`, `slip1`, `slip2`, `slip3`, `tx_sig`, and optionally `ticker`. Slip objects use `utxo_key`, `amount`, `public_key`. Stack selects a subscription by `extractNFTType(slip3.utxo_key) === 'stack'` and `slip1.public_key === author`.

`slip2` must be unlocked in the UTXO set before a spend or before `CHECKOWNNFT` succeeds. ATR may later rewrite the triple into a new transaction. `tx_sig` on the list entry then points at the rebroadcast, which is why `fetchTransaction` searches by id as well as signature.

## Minting

`Wallet::create_bound_transaction` is the mint. The JavaScript call is:

```javascript
const tx = await app.wallet.createMintNFTTransaction(
  BigInt(quantity),          // slip1.amount
  depositNolan,              // slip2.amount
  txmsg,                     // transaction.data JSON
  feeNolan,
  recipientPublicKey,        // slip2 public key, the first owner
  nftType                    // up to 16 bytes on slip3
);
```

The Rust function selects SAITO inputs that cover the deposit, builds the three outputs, and sets `transaction_type` to `Bound`. slip1's public key is the wallet's key. That key remains the creator when the NFT is later sent, because transfers copy the creator onto the new slip1 and put the recipient on slip2. The id is derived from one of those input slips, so two mints cannot share an id unless they spend the same UTXO coordinates.

`txmsg` is the application payload. Vault's mint sets:

```javascript
{
  module: 'Vault',
  request: 'mint-vault-key',
  data: { link, filename, file_id: '' }
}
```

It then writes `file_id` and `file_access_script` onto `nft_tx.msg` before `sign()`, because `sign` / `packData` persist `msg` into `data`. Build the message before signing.

After `sign()`, `app.network.propagateTransaction(tx)` broadcasts it. The NFT is not in `getNFTList` until the transaction is confirmed and slip2 is spendable by this wallet. Call `updateNFTList` from `onConfirmation` or from the screen that must show the new NFT. Vault does this after the access-key confirmation. A mint that is only propagated is not yet a holding.

`SaitoNFT` can be constructed on the unsigned mint transaction to read `computeNFTIdFromTx` before broadcast. Vault does that so the file transaction can store the id it will be bound to.

Modules add mint types by returning an object from `respondTo('saito-create-nft')` with `title`, `class` (the type string passed as `nft_type`), `text`, and optional `createData`. Stack's entry uses `class: ['stack']` and `createData` returns `{ module: 'Stack', duration }`. The create overlay lists those responses. An application that only mints from its own screen can call `createMintNFTTransaction` directly and skip the overlay.

## Holding and Ownership

The owner is the base58 public key on slip2. The creator is the base58 public key on slip1. They match at mint when the recipient is the minter. They diverge after a transfer.

An application checks local ownership by scanning `app.options.wallet.nfts` after `updateNFTList`. A tuple is in that list because the Rust wallet found a spendable triple for this key. Filtering by `extractNFTType` and creator is how Stack decides that a subscription NFT applies to an author.

Checking someone else's ownership is different. The wallet list is local. `CHECKOWNNFT` and `CHECKOWNNFTWHERE` take the three UTXO keys in a witness and check that the tuple is unlocked and that the request transaction is signed by slip2's key. That is the on-chain ownership test other nodes can run. It is specified in the P2SH chapter. The NFT-specific fact is that the witness is the three `utxo_key` values from the wallet entry, and the signer must be the owner on slip2.

Quantity for one id may be split across several triples. `getTotalAmount` sums slip1 amounts for entries with the same id. Spend functions select by id and amount (`createNFTTransaction`) or by a specific triple (`createNFTShardTransaction`).

A local index of NFT ids for a screen is fine. A table that is the authority for who owns an NFT is not. ATR and transfers change the slips underneath a stable id.

## Transfer

The default send is `createNFTTransaction`:

```javascript
await nft.fetchTransaction();
let tx = await app.wallet.createNFTTransaction(
  nft,
  recipientPublicKey,
  amount,
  fee,
  saitoDeposit,
  txmsg
);
tx = await nft.modifyBeforeSend(tx, recipientPublicKey, transferData);
if (!tx) {
  return; // a saito-nft-transfer handler blocked it
}
await tx.sign();
await app.network.propagateTransaction(tx);
```

`create_nft_transaction` in `wallet.rs` spends existing triples for `nft.id`. It does not mint. It errors when the wallet has no matching id or the requested amount exceeds the selected inputs. Outputs are new Bound / Normal / Bound triples: creator preserved, recipient on slip2, the same slip3 id, quantity split across recipients, deposit split in proportion to quantity. The JavaScript wrapper fetches the NFT transaction first, then `Object.assign(tx_msg, nft.txmsg)`. Keys already on the previous message overwrite the new `tx_msg`. Set fields that must change after that assign, or pass them in a way that survives it. Store's listing code assigns `module`, `request`, and listing fields again after `modifyBeforeSend` for this reason.

`createNFTShardTransaction` spends the three UTXO keys on that object through `createSendBoundTransaction`. Use it when the transfer must be that triple and not "any shards of this id that cover the amount."

`NFTCryptoModule.sendPayment` in `node/lib/templates/nftcryptomodule.js` is the token-style wrapper: `createNFTTransaction` for a numeric amount, `modifyBeforeSend`, `sign`, `propagateTransaction`. It is how an NFT type behaves as a balance. It is not a second ledger.

`modifyBeforeSend` is the extension point. It collects `respondTo('saito-nft-transfer')` handlers whose `class` array contains `returnType()`, and calls `onTransfer(nft, tx, receiver, data)`. Store and Stack use this to append a hop. They do not create a second transaction.

The transfer is visible to the sender as a spent triple and to the recipient after confirmation, when their `updateNFTList` shows a triple with their key on slip2 and the same id.

## Quantity, Splitting, and Merging

Quantity is slip1's amount. It is an integer on the slip. It is not required to be 1. Vault mints `BigInt(1)`. A token-style NFT mints or transfers a larger `num`. Deposit on slip2 is independent: it is SAITO locked to the triple, and ATR pays on that deposit rather than on the quantity.

Wallet operations:

- `createSplitNFTTransaction(nft, leftCount, rightCount)` spends one triple and creates two quantities that sum to it.
- `createMergeNFTTransaction(nft)` combines triples of the same id held by the wallet.
- `createAtomizeNFTTransaction(nft)` breaks one quantity into many triples. `NFTAtomize` caps the UI at 20 outputs per transaction, 100 total, and 5 transactions per block. Those caps are in the overlay, not in consensus.
- `createNFTTransaction` already splits quantity across recipients and returns change triples when the selected inputs exceed the amount sent.

The id and creator stay on the resulting triples. The owner is whoever holds each new slip2. Merging is same-id only, because the id is the identity of the asset.

Do not encode quantity only in `tx.msg`. Consensus moves slip1's amount. A message field that disagrees with slip1 will be ignored by the wallet list.

## Routing Signatures and Access

Saito transactions also have a consensus routing path, `tx.path`, used for fee routing. NFT application hops are not that field.

Store, Stack, and Vault put hops on `tx.msg.data.path`. Each hop is:

```javascript
{ to: receiverPublicKey, value: base64Json, sig: hexSignature }
```

The signed string is `to|value|binding_hash`. The signer is the current holder, using `app.crypto.signMessage` on `app.crypto.hash` of that string. `CHECKPATH` and `CHECKPATHHOP` verify the same string. See the P2SH chapter for the opcode. What matters here is who writes the hop and what the JSON means.

Stack (`stack.js`, `respondTo('saito-nft-transfer')`, class `stack`):

- On the first hop, if the sender is the creator and `data.duration` is set, it signs `` `${duration}|${nft.id}` `` into `data.duration_sig`. Subscription scripts are written to import that value. The current `IMPORTFIELD` opcode expects different field names; the P2SH chapter records that mismatch.
- Each transfer appends a hop whose JSON is `{ timestamp, delegate: false }`, or `delegate: true` when `data.delegate` is true.
- The binding hash is `nft.id`.
- Before appending, the sender truncates `data.path` to the last hop whose `to` is their own key, so a marketplace does not carry every previous customer's hops forward.

Store (`store.js`, class `store-nft-rental`):

- Requires `expires_at` or `duration_ms`, and a `file_id`.
- Appends `{ timestamp, file_id, expires_at, delegated }` with `delegated` 1 only when the caller passes `{ delegated: true }`.
- Binding hash is the empty string, matching Vault's rental script.
- Listing a rental passes `{ delegated: true }` into `modifyBeforeSend`. A normal send does not.

Those hops are how a later access check knows the NFT moved, who received it, and whether the transfer was a delegation. `CHECKOWNNFTWHERE` proves current custody. `CHECKPATHHOP` proves a selected hop on `data.path`. An application that only checks the wallet list is checking local custody. An application that must accept another user's request uses the witness UTXO keys plus these hops.

`SaitoNFT.applyExpiresAtFromData` displays the expiry from a hop with `delegated === 0`. That label is local UI. Vault's loan script compares `NOW` with `expires_at` inside the evaluator.

## Access Data, Scripts, and Witnesses

Four separate objects show up around NFT-gated applications:

| Object | NFT role |
| --- | --- |
| NFT tuple | The credential: id, type, creator, owner, quantity. |
| Locking script | The condition, often `CHECKOWNNFT` or `CHECKOWNNFTWHERE`, stored witness-free and hashed. |
| Access data | What the application associates with the credential: Vault's `file_id`, Stack's post, a path of hops, a duration. It lives in the NFT or file transaction message, or in Archive. |
| Witness | The proof for one evaluation: the three UTXO keys, and when the script asks for them, hops and a signed duration. |

Stack publishes the locking script on the post and stores `hash(script)` as Archive `owner`. On read, `resolveStackAccessData` picks a wallet NFT of type `stack` whose slip1 key is the author, then builds a witness array `{ utxokey1, utxokey2, utxokey3 }`, optional `{ hops }` from `data.path`, and optional `{ duration, signature }` from `data.duration` and `data.duration_sig`. Archive merges that witness into the post's script. The NFT chapter's job ends at producing those UTXO keys and hops. Script structure and evaluation are in the P2SH chapter.

Vault's default key is `CHECKOWNNFT` with those three witness keys. The file is an Archive row whose `owner` is the script hash. The NFT message holds `file_id` and `file_access_script`. The NFT is not the file.

Use a script when the condition must be checked by consensus on a spend, or when another node must evaluate the same predicate before releasing data. Use a wallet-list filter when the decision is only "does this browser hold the NFT?"

## Vault: Access-Key NFT

Vault is the pattern:

```
NFT the user holds
    +
script that requires that NFT
    +
file stored in Archive
```

Mint (`file-upload.js`, `mintNFT`):

1. `createMintNFTTransaction(BigInt(1), oneSaitoDeposit, txmsg, 0, ownKey, nft_type)`.
2. Default `nft_type` is `vault-nft-key`. Rentals use `vault-nft-rental`.
3. `createVaultAddFileTransaction` builds the file transaction and its access script. The file transaction's signature becomes `data.file_id` on the NFT message.
4. The NFT is signed and propagated. The file is saved to Archive with `owner` set to the script hash.

`respondTo` advertises classes `vault-nft-key`, `vault-nft-rental`, and `vault` so cards and transfer hooks recognize them. The jade-key image is Vault UI, not part of the tuple.

A download is a peer request `vault access file` carrying the witnessed script. Vault evaluates it, then loads Archive by `owner` and `file_id`. The reusable idea is the three-step pattern. The Vault-specific parts are the file transaction, the jade-key overlay, and the `vault-nft-*` type strings.

N-WASM uses the same pattern for a game ROM: `respondTo('nwasm-library-actions')` uploads the game JSON through the Vault file overlay and returns `nft_id`, `file_id`, and the mint transaction to the library. The ROM is Archive content. The NFT is the key.

## Stack: Subscription NFT

A Stack NFT is type `stack`, minted through `saito-create-nft` with `createData` supplying `module: 'Stack'` and a `duration`. It is an entitlement the author issues, not a collectible picture.

A private post's access script requires `CHECKOWNNFTWHERE` with `type == "stack"` and `creator == author`. Any quantity-bearing triple of that type from that author satisfies the type and creator check, once the reader supplies its three UTXO keys and a transaction signed by slip2. Non-transferable and subscription scripts add hop and duration checks. Those scripts, and the `IMPORTFIELD` mismatch, are in the P2SH chapter.

The application side is:

1. Author mints or already holds a `stack` NFT (they are the creator on slip1).
2. Transfer to a subscriber runs Stack's `onTransfer`, which extends `data.path` and may sign `duration`.
3. The subscriber's wallet lists the triple after confirmation.
4. Opening a post calls `resolveStackAccessData(author)`. No matching NFT means no witness.
5. Archive evaluates the post's script. Success returns the post. Failure hides the row.

Copy the pattern: one NFT type per product, creator fixed at mint, holder proved from the wallet, service gated by that proof. Do not copy Stack's post schema or its five-minute sample duration.

## Rentals

There is no single rental protocol in consensus. Two application mechanisms exist.

**Store / Vault file rental.** Type `store-nft-rental` or `vault-nft-rental`. Transfer hops carry `expires_at`, `file_id`, and `delegated`. Vault's rental script and loan script turn a non-delegated hop into a temporary Archive `owner`. After `expires_at`, the creator's branch of the loan script is what evaluates successfully. `NOW` is the evaluating node's clock. `SaitoNFT.remainingExpiresLabel` is a local countdown and does not revoke anything.

**N-WASM play session.** `nwasm.js` marks a library entry `rental: true` from metadata and starts `rental_timer` until `expires_at`. On fire it saves the game and the next launch alerts that the rental has expired. That timer is the module's UI. It does not spend the NFT and it does not change Archive `owner` by itself.

A new rental product should say which of these it is. If access must remain enforceable on another node, use the hop plus the script, and read the P2SH chapter. If the limit is only local play time, a timer is an application choice and other nodes will not honor it unless they share that code.

## Distributing an Application

A `.saito` module is a compiled bundle. `node/scripts/dynmods/compile.js` produces those files. That pipeline is not an NFT API.

The NFT path is payload plus a local install:

1. The NFT transaction's `data.saito` holds the payload. `returnType()` reports `saito-app` when that field is set, which can override a slip3 type only when slip3 did not already yield one. Minting with type `saito-app` keeps the two aligned.
2. `SaitoNFTCard` decodes a data-URI or base64 body, `deserialize_from_web`s it, and requires `msg.bin` and `msg.name` or `msg.slug`.
3. `app.storage.installLocalApplication(mod, msg.bin, nft.id, nft.tx_sig)` inserts `{ mod, binary, nft_id, nft_tx_sig }` into the browser IndexedDB table `dyn_mods`.
4. The card then adds `tx_sig` to `app.options.permissions.nfts` and emits `saito-enable-nft`. `uninstallLocalApplication(null, nft_tx_sig)` deletes by that signature when the user disables the card.

Ownership of the NFT, the bytes inside `data.saito`, the `dyn_mods` row, and the permission flag are four different states. Transferring the NFT does not uninstall the previous holder's copy. Disabling the card does not transfer the NFT. There is no consensus "install module" transaction.

If the bundle is large, do not put it in `data.saito` by default. The card path shows the current mechanism for a payload that is already on the NFT transaction. A reference plus a fetch is the same pattern Vault uses for files, and it is the better default for a large bundle.

## Games

The game engine's stake is not an NFT lock. Blackjack's `initializeGameStake(crypto, stake)` stores a numeric stake on `game.options` and deals credits from it. Searching the game UI layer does not turn up an NFT escrow API.

The NFT patterns that do exist for games are the ones above: a Vault key around an N-WASM ROM, and a rental flag with a local expiry timer. An application can also require a wallet NFT before it lets a player sit down, using `updateNFTList` and `extractNFTType`, without moving the NFT. That is an entitlement check. Staking, in the sense of locking the NFT in the game until the hand ends, would be a transfer into a script or into the game's key and a transfer back. The repository does not provide a shared helper for that. Build it with `createNFTTransaction` or with a script lock, and do not describe `game.stake` as that lock.

## Display

Render with `SaitoNFT` and `SaitoNFTCard` unless the screen is really a different object, such as a store listing.

```javascript
const nft = new SaitoNFT(app, mod, null, walletEntry);
await nft.fetchTransaction();
const card = new SaitoNFTCard(app, mod, nft);
```

`returnMediaDisplay` chooses an image, a text dump, the application icon, a broken-heart failure state, or a loading state. Call it after `fetchTransaction`. A card that only has slips will look empty or loading.

Generic UI shows id, type, quantity, creator, and the media fields above. Application UI, such as Vault's jade key or Stack's subscription art, belongs in the module that owns that type. `respondTo` handlers already attach per-type behavior to transfer and create. Use that before cloning `SaitoNFT`.

`SelectNFTOverlay` limits some lists to `image`, `css`, `js`, `saito-app`, and `vault-nft-key`. A new type will not appear there until that set or the overlay's filter includes it. The wallet list itself is unfiltered.

## Type and Application Meaning

The type is the 16-byte label on slip3. It is the interoperable name. Current labels that applications branch on include:

| Type | Meaning in this repository |
| --- | --- |
| `stack` | Stack subscription / access NFT |
| `vault-nft-key` | Vault file access key |
| `vault-nft-rental` | Vault rental key |
| `store-nft-rental` | Store listing of a rental |
| `saito-app` | Payload that the card can install into `dyn_mods` |
| `image`, `text`, `json`, `js`, `css`, `token` | Create-overlay and card behavior for those payloads |

`returnType()` may also invent `image` or `saito-app` from the payload when slip3 has no type. Other users will call `extractNFTType` on slip3. Set the type at mint so both agree.

The type does not grant the product by itself. `stack` does not know which author, which post, or which duration. The creator key, the message, and the access script do that. Pick a short type string, document it, and keep it identical in the mint call, `respondTo` class arrays, and any `extractNFTType` filter.

## Where Data Lives

Ask, in order:

1. What must other nodes agree is owned? That is the tuple: id, type, quantity, creator, owner, deposit.
2. What must a script be able to hash or read during evaluation? Put that in the transaction message or in the evaluation context. Hops, duration, and file id are in this category when an access script names them.
3. What is bulk content? Put it in Archive or another store the application already uses, and put the identifier on the NFT message.
4. How does a holder who was offline during mint obtain the content? `fetchTransaction` local-then-peer, or an explicit request such as Vault's access call. The triple alone will not contain it.

A confirmed NFT with no Archive copy of its transaction will show in the wallet and fail to render. Handle `load_failed` on `SaitoNFT`. Do not treat a missing image as a missing NFT.

## Worked Examples

### A. Create and display

```
createMintNFTTransaction(quantity, deposit, txmsg, fee, recipient, type)
    ↓ sign, propagateTransaction
    ↓ confirmation
recipient updateNFTList → app.options.wallet.nfts
    ↓ new SaitoNFT(app, mod, null, entry); fetchTransaction()
SaitoNFTCard / NFTOverlay
```

The mint message is what `fetchTransaction` later displays. The list entry is only the triple and `tx_sig`.

### B. Subscription

```
author mints type "stack" (creator = author)
    ↓ onTransfer appends data.path and may sign duration
subscriber wallet lists the triple
    ↓ resolveStackAccessData(author) → utxo keys and hops
Archive evaluates the post script
    ↓ 1: show the post
```

The NFT is the entitlement. The post is Archive content. The script is the condition.

### C. Access key

```
mint vault-nft-key
    ↓ file transaction in Archive, owner = script hash, file_id on the NFT
holder requests "vault access file" with CHECKOWNNFT witness
    ↓ Vault evaluates, Archive returns the file transaction
```

The protected bytes are not on the NFT slips.

### D. Marketplace

```
seller createListingScript (1-of-2 CHECKMULTISIG)
    ↓ createNFTTransaction to the script address
    ↓ modifyBeforeSend for store-nft-rental hops when the type needs them
buyer fulfillment spends the script-locked triple to the buyer
    ↓ buyer updateNFTList shows the same id, new slip2
```

The listing lock is P2SH. This chapter's part is the triple going to the script address and coming back. Store's `executeListingScript` helper is not the consensus check.

### E. Application distribution

```
NFT data.saito = serialized module transaction with msg.bin
    ↓ SaitoNFTCard decodes it
storage.installLocalApplication(slug, bin, nft.id, tx_sig)
    ↓ permissions.nfts includes tx_sig
saito-enable-nft
```

The module runs locally after the next load of enabled NFT payloads. The NFT can move to someone else without removing the installed copy.

### F. Game entitlement

```
updateNFTList
    ↓ extractNFTType === the game's type, or a Vault key the library already recorded
game allows play
```

N-WASM's library stores `nft_id` and `file_id` from the Vault upload and, for rentals, runs a local timer. There is no engine call that escrows an NFT for a hand. A real stake is a transfer or a script lock written for that game.

## What This Chapter Does Not Own

The P2SH chapter is the source for opcode behavior, `app.core.scripting`, script hashes, `access_scripts` on a consensus spend, and the difference between consensus enforcement and an application decision.

This chapter owns the tuple, the wallet list, `SaitoNFT`, mint and transfer transactions, quantity, `data.path` hops written by NFT modules, and the way Vault, Stack, Store, and N-WASM use a tuple as a credential or a good.

## Practices for an AI Agent

- Represent an NFT as the three-slip tuple. Do not add an ERC-721 contract, token id counter, or metadata URI standard.
- Mint with `createMintNFTTransaction`. Send with `createNFTTransaction` unless a specific triple is required.
- Read holdings from `app.options.wallet.nfts` after `updateNFTList`. Do not invent an ownership table.
- Construct `SaitoNFT` and call `fetchTransaction` before rendering content.
- Reuse `SaitoNFTCard`, `NFTOverlay`, and `SelectNFTOverlay` for generic display and picking.
- Put the type in the mint call. Keep that string in `respondTo` classes and filters.
- Keep field names stable from `tx.msg` through Archive columns and the UI. Vault's `file_id` is the file transaction's signature. Do not rename it to `fileId` on one side only.
- Call `modifyBeforeSend` before `sign` on a transfer so type-specific hops exist.
- Treat `data.path` hops as application routing signatures. Do not confuse them with consensus `tx.path`.
- Put bulk content in Archive or an equivalent store. Put the identifier on the NFT message.
- Assume the wallet can list an NFT whose image, file, or module bytes are not local yet.
- Gate a service on a script when another node must verify the condition. A local `nfts.find` only answers what this wallet holds.
- Do not describe `initializeGameStake` as NFT staking.
- Do not install a module by transferring an NFT. Installation is `installLocalApplication` plus `permissions.nfts`.
- After `createNFTTransaction`, remember `Object.assign(tx_msg, nft.txmsg)` keeps the old message's keys. Re-apply fields that must change.
- `createNFTShardTransaction` is the older single-triple send. Prefer `createNFTTransaction` unless the call site must name the three UTXO keys.
- When a behavior depends on script evaluation, follow `SAITO-APPLICATIONS-PAY-TO-SCRIPT-HASH.md` instead of restating it.

## Reference

| Piece | Path |
| --- | --- |
| Tuple, id, type, creator, owner, amount, deposit | `rust/saito-core/src/core/consensus/nft.rs` |
| `Transaction::is_nft` | `rust/saito-core/src/core/consensus/transaction.rs` |
| Mint and send | `Wallet::create_bound_transaction`, `create_nft_transaction`, `create_nft_uuid` in `rust/saito-core/src/core/consensus/wallet.rs` |
| ATR handling of triples | `rust/saito-core/src/core/consensus/block.rs` |
| JS wallet NFT API | `node/lib/saito/wallet.ts` |
| Domain object | `node/lib/saito/ui/saito-nft/saito-nft.js` |
| Card, overlay, atomize, select, create | `node/lib/saito/ui/saito-nft/` |
| Token-style send | `node/lib/templates/nftcryptomodule.js` |
| Local module install | `Storage.installLocalApplication` in `node/lib/saito/storage.ts` |
| Vault mint and classes | `node/mods/vault/lib/ui/overlays/file-upload.js`, `node/mods/vault/vault.js` |
| Stack type, transfer hops, witness | `node/mods/stack/stack.js` |
| Store rental hops and listing | `node/mods/store/store.js`, `node/mods/store/lib/transactions.js` |
| N-WASM rental timer and Vault upload | `node/mods/nwasm/nwasm.js` |
| Script evaluation | `README/SAITO-APPLICATIONS-PAY-TO-SCRIPT-HASH.md` |

## Closing

An NFT is a way to put a stable id, a type, a quantity, a creator, and an owner on the chain, and to move that record to someone else. Applications decide what the type means: a file key, a subscription, a rental, a module, a token balance, a game entitlement. The content those products need is a transaction message plus whatever store the application already uses. The wallet is the local view of what this user can spend. Scripts and hops are how another party checks that claim. Start from the requirement that must be transferable and recognizable, and use the tuple only when that requirement is real.
