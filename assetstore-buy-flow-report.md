# AssetStore “Buy Asset” Flow — Reference Report

This document describes how the legacy **AssetStore** module (`node/mods/assetstore/`) handled NFT purchases priced in **SAITO**, including the alternate-crypto path used when the browser wallet did not hold enough SAITO. It is intended as a reference for emulating the same process in the newer **Store** module.

---

## 1. High-level architecture

AssetStore acted as a **custodial listing and settlement server**:

1. Sellers listed NFTs by sending them to the AssetStore node (wrapped in a `list asset` transaction).
2. The server held NFT shards in its wallet and tracked listings in memory + SQLite (`listings` table).
3. Buyers paid **SAITO** (price + optional fee) **to the AssetStore public key**.
4. On `conf=0`, the server validated payment, transferred the NFT shard to the buyer, marked the listing sold, and paid the seller.

Listings exposed a **reserve price in SAITO** (`reserve_price`). The optional module-level `this.fee` (default `0`) could add a service fee on top of the listing price at purchase time.

Alternate cryptocurrencies (ETH, BTC, etc.) were **not handled inside AssetStore**. When the buyer lacked SAITO, AssetStore delegated funding to the separate **BuySaito** module via a shared event bus (`saito-purchase-launch`). BuySaito used **Mixin**-backed crypto modules to accept external deposits, then issued native SAITO from the service node wallet to complete the on-chain purchase.

---

## 2. UI entry points

### 2.1 Listing grid — `AssetStoreMain` + `AssetStoreNFTCard`

**Files:** `lib/main/main.js`, `lib/overlays/assetstore-nft-card.js`, `lib/overlays/assetstore-nft-card.template.js`

- Listings are fetched from the AssetStore peer via `sendRequestAsTransaction('request listings', …)` and stored in `this.mod.listings`.
- `renderListings()` builds one `AssetStoreNFTCard` per active listing.
- Each card wraps an `AssetStoreNFT` (extends `SaitoNFT`) with:
  - `setPrice(record.reserve_price)` — listing price in SAITO
  - `setSeller(record.seller)`
  - `metadata = record` (DB listing row, including `active`, `nfttx_sig`, etc.)
- Cards call `nft.fetchTransaction()` to hydrate image/title from Archive before render.
- **Clicking a card** invokes a callback:
  - If viewer is the seller → `DelistNFTOverlay`
  - Otherwise → **`BuyNFTOverlay.render(nft)`**

The card template shows price as `formatDecimals(price) SAITO` and a **“Buy Now”** overlay button; the whole card is clickable (events attached on the card root in `SaitoNFTCard.attachEvents()`).

### 2.2 Buy overlay — `BuyNFTOverlay`

**Files:** `lib/overlays/buy-nft.js` (extends `lib/saito/ui/saito-nft/overlays/nft-overlay.js`)

- Reuses the standard **NFT details overlay** (image, title, description, footer buttons).
- Hides default footer buttons, then re-labels `.saito-nft-footer-btn.enable-nft` as **“Buy”**.
- Only attaches buy logic if `nft.metadata.active === 1` (listing is live).
- Computes:
  - `priceRaw = BigInt(nft.getBuyPriceSaito())` — listing price in whole SAITO units
  - `fee = BigInt(this.mod.fee || 0)`
  - `total_price = convertSaitoToNolan(priceRaw + fee)` — Nolan amount to send

On **Buy** click:

1. Overlay closes; button is disabled (one-shot).
2. Wallet balance is read: `await this.app.wallet.getBalance()` (Nolan).
3. **Two branches** (see §3 and §4).

`AssetStoreNFT` (`lib/overlays/assetstore-nft.js`) supplies price helpers:

- `getBuyPriceNolan()` / `getBuyPriceSaito()` — from `setPrice()` or NFT deposit fallback
- Used only for display and purchase math in the buy overlay

---

## 3. Path A — buyer has sufficient SAITO

**Files:** `lib/overlays/buy-nft.js`, `assetstore.js` (`createPurchaseAssetTransaction`, `receivePurchaseAssetTransaction`)

### 3.1 Browser creates and propagates purchase tx

```javascript
let newtx = await this.mod.createPurchaseAssetTransaction(
  this.nft,
  { price: priceRaw, fee },
  total_price   // nolan_to_send = full payment
);
await this.app.network.propagateTransaction(newtx);
siteMessage('Purchase submitted, waiting for confirmation...');
```

### 3.2 `createPurchaseAssetTransaction(nft, price_breakdown, nolan_to_send)`

Builds a standard Saito payment transaction:

- **To:** `this.assetStore.publicKey` (the Store server)
- **Amount:** `nolan_to_send` (price + fee in Nolan)
- **txmsg:**
  ```javascript
  {
    module: 'AssetStore',
    request: 'purchase asset',
    from: buyerPublicKey,
    to: assetStorePublicKey,
    nft_sig: nft.tx_sig,      // listing NFT shard signature
    refund: buyerPublicKey,
    price: String(price),     // SAITO units (not Nolan)
    fee: String(fee)
  }
  ```
- Transaction is signed by the buyer before return/propagation.

### 3.3 Server settlement — `receivePurchaseAssetTransaction` at `conf=0`

Triggered from `onConfirmation` when `txmsg.request === 'purchase asset'`.

**Validation chain:**

| Step | Check | On failure |
|------|--------|------------|
| 1 | `buyer`, `nft_sig`, `price > 0` | return |
| 2 | Sum of outputs to server `===` price + fee | `refundBuyer(…, 'underpaid')` |
| 3 | Listing exists and `active == 1` | `refundBuyer(…, 'listing-not-active')` |
| 4 | Paid price ≥ listing `reserve_price` | `refundBuyer(…, 'below-reserve')` |
| 5 | Server wallet still holds NFT shard (`nft_id` + `nfttx_sig`) | `refundBuyer(…, 'nft-not-held')` |

**Fulfillment (all checks pass):**

1. `createNFTShardTransaction(nft, buyer)` — transfer NFT to buyer
2. If `nft_tx.msg` is null → refund (`fulfillment-not-possible`)
3. Sign and `propagateTransaction(nft_tx)`
4. Mark listing `active = 2` (sold), `updateListingStatus`, `broadcastUpdate` to browsers
5. Record inbound payment + outbound NFT tx in `transactions` table
6. **Seller payout:** `createUnsignedTransaction(seller, price, 0)` with `request: 'seller_payout'`, propagate
7. Optional email to seller via `mailrelay-send-email`
8. `restoreListingsFromDB()` to refresh inventory

**Refunds** (`refundBuyer`): unsigned tx back to buyer with `request: 'purchase_refund'`, reason, and `nft_sig`; recorded as transaction type `5`.

---

## 4. Path B — buyer lacks SAITO (alternate crypto via BuySaito)

**Files:** `lib/overlays/buy-nft.js`, `node/mods/buysaito/buysaito.js`, `node/mods/buysaito/lib/saito-purchase.js` (+ templates)

AssetStore does **not** implement ETH/BTC handling. It emits a global event consumed by **BuySaito**, which is initialized in every browser session that loads the module.

### 4.1 AssetStore triggers funding flow

When `wallet_balance < total_price`:

```javascript
let newtx = await this.mod.createPurchaseAssetTransaction(
  this.nft,
  { price: priceRaw, fee },
  0n   // zero Nolan — payment deferred
);

this.app.connection.emit(
  'saito-purchase-launch',
  convertNolanToSaito(total_price),     // SAITO amount needed
  this.mod.assetStore.publicKey,        // recipient_pubkey for issuance tx
  newtx.serialize_to_web(this.app),     // pre-built purchase tx (signed, 0 payment)
  `Purchase ${…} Saito NFT`             // description
);
```

The pre-built purchase tx carries the full `purchase asset` txmsg but sends **0 Nolan** until BuySaito completes funding.

### 4.2 `SaitoPurchaseOverlay` — multi-step crypto UI

**File:** `node/mods/buysaito/lib/saito-purchase.js`

Listens for `saito-purchase-launch(amount, recipient, tx, description)` and drives a wizard:

| Step | UI template | Action |
|------|-------------|--------|
| 0 | Loader | Fetch `buysaito available currencies` via Relay |
| 1 | `saito-purchase-select-crypto.template.js` | User picks ticker (ETH, BTC, …) |
| 2 | `saito-purchase-amount.template.js` | (If amount not preset) user enters crypto amount |
| 3 | Loader | `buysaito reserve address` via Relay |
| 4 | `saito-purchase.template.js` | Show deposit address, QR code, countdown timer |
| 5 | Loader | User confirms deposit; server polls Mixin |
| 6 | Success | `saito-purchase-saito-issued` → salert with tx sig |

**Key UI behaviors:**

- **Crypto list:** built from `mod.available_currencies` (Mixin-supported tickers from `loadAvailableCryptos()`).
- **Internal multiwallet balance:** if `crypto_selected.available_balance >= expected_deposit`, offers in-wallet `sendPayment` via the ticker’s `CryptoModule` (`handleInternalTransfer`) instead of external deposit.
- **Deposit address:** reserved per user/ticker with 25-minute timeout (`time_limit`).
- **Cancel:** `buysaito release address` releases the Mixin deposit slot.

**Supporting crypto UI elsewhere:**

- `node/lib/saito/ui/saito-crypto/overlays/details.js` — “Get SAITO” button also emits `saito-purchase-launch` (generic top-up, no bundled purchase tx).
- Crypto logos via `app.modules.getRespondTos('crypto-logo', { ticker })`.
- Individual chain modules (ETH, BTC, etc.) live under `node/mods/` as **CryptoModule** subclasses wired through **Mixin**.

### 4.3 BuySaito server — Relay messages (off-chain)

Browser ↔ authorized BuySaito node communicate through **Relay** (`relay-send-message`), not blockchain:

| Request | Purpose |
|---------|---------|
| `buysaito available currencies` | Return list of supported tickers + USD prices |
| `buysaito reserve address` | Allocate Mixin deposit address; store pending payment in DB |
| `buysaito release address` | Cancel reservation |
| `buysaito saito issued` | Notify browser purchase complete |
| `buysaito report error` | Hot wallet empty / issuance failure |

`reserve address` payload includes:

```javascript
{
  initiator_pubkey,   // buyer
  recipient_pubkey,   // AssetStore server key (from AssetStore buy flow)
  ticker,
  issue_amount,       // SAITO to issue
  tx                  // serialized purchase asset tx (optional)
}
```

### 4.4 Deposit detection and SAITO issuance

**File:** `buysaito.js` — `processPendingPayments()` (runs on new blocks)

1. Poll Mixin (`consolidatedLookUp`) for deposits matching `expected_deposit`.
2. Status progression: `new` → `pending` → `confirmed`.
3. When confirmed and hot wallet has balance, call **`createSaitoIssuanceTransaction(payment_data)`**:
   - Creates tx **to `recipient_pubkey`** (AssetStore server) for `issue_amount` SAITO.
   - If `payment_data.tx` is set (AssetStore buy case), **copies txmsg from the user’s signed purchase tx** onto the issuance tx.
   - Signs with BuySaito node wallet and propagates.
4. `finishPayment` → Relay `buysaito saito issued` to browser.

**Net effect for AssetStore buys:** BuySaito’s hot wallet sends SAITO **to the AssetStore server** with the buyer’s `purchase asset` txmsg attached. The AssetStore node then processes that inbound payment at `conf=0` exactly like Path A (§3.3), fulfills the NFT transfer, and pays the seller.

The buyer never manually re-submits the purchase tx after funding; issuance + propagation completes the loop.

---

## 5. End-to-end sequence diagrams

### 5.1 Sufficient SAITO

```
Buyer clicks card
  → BuyNFTOverlay.render(AssetStoreNFT)
  → Click "Buy"
  → createPurchaseAssetTransaction(nft, {price, fee}, totalNolan)
  → propagateTransaction (buyer-signed, pays store)
  → [conf=0] AssetStore.receivePurchaseAssetTransaction
      → validate payment & listing
      → createNFTShardTransaction → buyer
      → seller_payout tx
      → listing active=2
```

### 5.2 Insufficient SAITO (ETH / other crypto)

```
Buyer clicks "Buy"
  → createPurchaseAssetTransaction(..., 0n)  // signed, 0 payment
  → emit saito-purchase-launch(amount, storePubKey, serializedTx)
  → SaitoPurchaseOverlay: pick crypto → reserve address → deposit
  → BuySaito server detects Mixin deposit
  → createSaitoIssuanceTransaction: SAITO → storePubKey, msg = purchase asset
  → propagateTransaction (BuySaito node-signed)
  → [conf=0] AssetStore.receivePurchaseAssetTransaction (same as Path A)
  → emit saito-purchase-saito-issued → browser salert
```

---

## 6. Data model touchpoints

| Field / object | Role in buy flow |
|----------------|------------------|
| `listing.reserve_price` | Minimum SAITO price (seller-set at list time) |
| `listing.nfttx_sig` | NFT shard id used as `nft_sig` in purchase tx |
| `listing.nft_id` | Server wallet lookup for held shard |
| `listing.active` | `1` = buyable, `2` = sold |
| `listing.seller` | Payout recipient |
| `nft.tx_sig` | Same as `nfttx_sig` on the listing card’s NFT object |
| `this.assetStore.publicKey` | Payment destination; learned via `onPeerServiceUp` |
| `this.mod.fee` | Optional extra SAITO fee added at purchase |

---

## 7. Components to mirror in the new Store module

To emulate AssetStore buy behavior in `node/mods/store/`:

### Required (core SAITO path)

1. **Buy UI entry** — product/purchase overlay with price, quantity, and Buy action (Store already has `ProductOverlay`; AssetStore used `BuyNFTOverlay`).
2. **`createPurchaseAssetTransaction`** equivalent — payment tx to `store_public_key` with structured txmsg (`module: 'Store'`, `request: 'purchase-asset'` or similar), `nft_sig` / listing id, price, fee, refund address.
3. **`receivePurchaseAssetTransaction` at conf=0** — validate amount, listing status, custody (Store can spend listing script), transfer NFT shard to buyer, mark sold, pay seller.
4. **Refund path** — return Nolan on validation failure with auditable reason.
5. **Listing sync** — browsers refresh after sale (`broadcastUpdate` / `assetstore-render-listings` pattern).

### Optional (alternate crypto — unchanged architecture)

AssetStore relied on **BuySaito + SaitoPurchaseOverlay + Relay + Mixin**; Store should reuse the same event if supporting non-SAITO funding:

```javascript
this.app.connection.emit(
  'saito-purchase-launch',
  saitoAmount,
  this.store_public_key,
  serializedPurchaseTx,
  description
);
```

No Store-specific ETH UI is needed if BuySaito remains loaded; only the bundled `tx` and `recipient` must point at the new Store server key.

### Intentional differences in the new Store (already implemented)

The new Store module uses **P2SH listing scripts** (`access_script` / `storeCanSpendListingScript`) rather than AssetStore’s custodial “NFT sent to store pubkey” list flow, and separates **NFT txmsg** from **listing metadata** (`txmsg.listing`). Purchase settlement should still follow the same *economic* pattern: buyer pays server → server validates → server releases NFT → server pays seller.

---

## 8. Key file index

| Area | Path |
|------|------|
| Module core | `node/mods/assetstore/assetstore.js` |
| Main UI / listing grid | `node/mods/assetstore/lib/main/main.js` |
| NFT card | `node/mods/assetstore/lib/overlays/assetstore-nft-card.js` |
| NFT price wrapper | `node/mods/assetstore/lib/overlays/assetstore-nft.js` |
| Buy overlay | `node/mods/assetstore/lib/overlays/buy-nft.js` |
| NFT overlay base | `node/lib/saito/ui/saito-nft/overlays/nft-overlay.js` |
| BuySaito module | `node/mods/buysaito/buysaito.js` |
| Crypto purchase UI | `node/mods/buysaito/lib/saito-purchase.js` |
| Crypto picker template | `node/mods/buysaito/lib/saito-purchase-select-crypto.template.js` |
| Deposit screen template | `node/mods/buysaito/lib/saito-purchase.template.js` |
| Generic “Get SAITO” entry | `node/lib/saito/ui/saito-crypto/overlays/details.js` |

---

*Generated for Store module parity work. Describes behavior observed in the codebase as of this report.*
