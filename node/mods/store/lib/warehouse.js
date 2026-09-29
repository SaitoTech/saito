const Summary = require('./summary');
const Listing = require('./listing');
const Database = require('./database');
const { syncSummaryCache, summaryBucketKey } = require('./ui/summary-cache');
const Order = require('./order');
const Slip = require('../../../lib/saito/slip').default;
const { SlipType } = require('saito-js/lib/slip');
const {
  ORDER_STATUS_PENDING,
  ORDER_STATUS_SETTLING,
  ORDER_STATUS_FULFILLED,
  ORDER_STATUS_UNFULFILLABLE
} = require('./order');
const {
  findInventoryTriple,
  serializeSlip,
  normalizeSlipJson,
  listingInputSlipJsonFromRecord,
  transactionIndexInBlock,
  returnListingSlipId,
  slipPublicKey
} = require('./helpers');
const { loadTransactionFromArchive } = require('./archive');
const { initializeImageCache } = require('./images');
const { checkSecurityLevel } = require('../../../lib/helpers/security');
const {
  executeListingScript,
  returnCreatedNftTuples,
  returnSpentNftTuples
} = require('./scripting');
const SaitoNFT = require('../../../lib/saito/ui/saito-nft/saito-nft');
const {
  mapNFTTypeToCategory,
  STORE_CATEGORIES,
  normalizePageSize,
  normalizeOffset,
  isStoreCategory
} = require('./categories');

class Warehouse {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.db = new Database(app, mod);
    this.listings = {};
    this.summaries = {};
    // Wind of a block that has no spend rows yet. Drained on the next canonical
    // tip, outside the reorg callback, so the block body can be loaded.
    this.pendingSpendRecovery = [];
    // Serializes summary table + this.summaries / mod.summaries mutations.
    this._summary_mutation_tail = Promise.resolve();
  }

  /**
   * Run fn exclusively against other summary mutations.
   * Non-reentrant: callers must not nest withSummaryMutation.
   */
  withSummaryMutation(fn) {
    const run = this._summary_mutation_tail.then(() => fn());
    this._summary_mutation_tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async initialize() {
    if (this.app.BROWSER) {
      return;
    }

    await this.db.ensureSchema();
    this.mod.summaries = {};
    await this.initializeSummaryCache();
    await initializeImageCache(this.mod);
  }

  async initializeSummaryCache() {
    return this.withSummaryMutation(async () => {
      const buckets = await this.db.scanListingsForSummaryRebuild();
      for (const bucket of buckets || []) {
        await this._syncSummaryForBucket(bucket.nft_id, bucket.price);
      }

      const rows = await this.db.loadAllSummaries();
      for (const row of rows || []) {
        const key = summaryBucketKey(row.nft_id, row.price);
        if (!this.summaries[key]) {
          await this._syncSummaryToCache(row.nft_id, row.price);
        }
      }

      this.mod.summaries = this.summaries;
    });
  }

  async onNewBlock(blk, lc) {
    if (!lc) {
      return;
    }
    await this.finishDeferredSpendRecovery();
    await this.processQueue();
  }

  async onChainReorganization(block_id, block_hash, longest_chain) {
    // A missing spend row must be rebuilt from the block before inclusions
    // created in that block become visible. The reorg callback has no block
    // body, so reveal waits until finishDeferredSpendRecovery.
    let reveal_listings = true;
    if (longest_chain) {
      const existing_sales = await this.db.countListingSalesForBlock(block_id, block_hash);
      const existing_listings = await this.db.countListingsInBlock(block_id, block_hash);
      // First inclusion has no rows yet; confirmation writes the spend and the
      // remainder. A returning block already has rows, and confirmation will
      // not run again. Rebuild a missing spend before those rows are shown.
      if (existing_sales === 0 && existing_listings > 0) {
        this.pendingSpendRecovery.push({
          block_id: Number(block_id) || 0,
          block_hash: String(block_hash || '')
        });
        reveal_listings = false;
      }
    }
    await this.db.applyListingChainReorganization(
      block_id,
      block_hash,
      longest_chain,
      reveal_listings
    );
    await this.db.updateOrdersReceivedChainState(block_id, block_hash, longest_chain);
    await this.db.updateOrdersFulfilledChainState(block_id, block_hash, longest_chain);

    for (const row of Object.values(this.listings)) {
      const listed =
        Number(row.block_id_listed ?? row.block_id) === Number(block_id) &&
        String((row.block_hash_listed ?? row.block_hash) || '') === String(block_hash || '');
      const sold =
        Number(row.block_id_sold) === Number(block_id) &&
        String(row.block_hash_sold || '') === String(block_hash || '');

      if (listed && (!longest_chain || reveal_listings)) {
        row.longest_chain_listed = longest_chain ? 1 : 0;
      }
      // Snapshot chain flag only. Sale identity stays so a later wind can match.
      if (sold) {
        row.longest_chain_sold = longest_chain ? 1 : 0;
      }
    }

    const sales = await this.db.returnListingSalesForBlock(block_id, block_hash);
    for (const sale of sales || []) {
      const key = this.listingCacheKey(sale.signature, sale.block_hash_listed);
      const cached = this.listings[key];
      if (!cached) {
        continue;
      }
      const fresh = await this.db.returnListingBySignatureAndBlockHash(
        sale.signature,
        sale.block_hash_listed
      );
      if (!fresh) {
        continue;
      }
      cached.block_id_sold = Number(fresh.block_id_sold ?? 0);
      cached.block_hash_sold = fresh.block_hash_sold || '';
      cached.transaction_id_sold = Number(fresh.transaction_id_sold ?? 0);
      cached.longest_chain_sold = Number(fresh.longest_chain_sold ?? 0);
      cached.settlement_pending = Number(fresh.settlement_pending ?? 0) ? 1 : 0;
      cached.buyer = fresh.buyer || '';
      cached.quantity_sold = Number(fresh.quantity_sold ?? 0);
    }

    // A brand-new block has no listing rows yet; confirmation writes those.
    // A block leaving or returning already has rows, and their buckets must
    // follow the flags just written. Full rebuild on every tip raced confirmation.
    const buckets = await this.db.returnBucketsAffectedByBlock(block_id, block_hash);
    for (const bucket of buckets || []) {
      await this.syncSummaryForBucket(bucket.nft_id, bucket.price);
    }
  }

  // --- listings ---

  /** Cache key for one block inclusion of a listing transaction. */
  listingCacheKey(signature, block_hash_listed = '') {
    return `${String(signature || '')}:${String(block_hash_listed || '')}`;
  }

  async addListing(nftOrRow, tx = null, txmsg = null, blk = null) {
    if (this.app.BROWSER) {
      return null;
    }

    if (tx && txmsg) {
      return this.addListingFromTransaction(nftOrRow, tx, txmsg, blk);
    }

    const row = nftOrRow;
    if (!row?.signature || (await this.listingExists(row.signature, row.block_hash_listed))) {
      return null;
    }

    const listing = new Listing(row);
    const key = this.listingCacheKey(listing.signature, listing.block_hash_listed);
    this.listings[key] = listing;

    try {
      await this.db.insertListingRow(listing);
    } catch (err) {
      delete this.listings[key];
      if (String(err?.message || err).includes('UNIQUE')) {
        return null;
      }
      throw err;
    }

    // Summary/image-cache updates belong to addListingFromTransaction, which already
    // has txmsg + nft. Do not create placeholder summaries or re-query here.
    return listing;
  }

  async removeListing(nftOrRows, tx = null, txmsg = null, blk = null) {
    if (this.app.BROWSER) {
      return [];
    }

    let spent_rows = [];

    if (tx) {
      spent_rows = await this.matchSpentListings(tx);
    } else if (Array.isArray(nftOrRows)) {
      spent_rows = nftOrRows;
    } else if (nftOrRows?.signature) {
      spent_rows = [nftOrRows];
    }

    if (!spent_rows.length) {
      return [];
    }

    const now = Date.now();
    const removed = [];

    for (const row of spent_rows) {
      const listing_row = new Listing(row);
      if (listing_row.isSoldOnChain()) {
        continue;
      }

      const sold_block_id = Number(blk?.id ?? 0);
      const sold_block_hash = String(blk?.hash ?? '');
      const sold_transaction_id = transactionIndexInBlock(blk, tx);
      await this.db.markListingSold(
        row.signature,
        {
          block_hash_listed: listing_row.block_hash_listed,
          sold_block_id,
          sold_block_hash,
          sold_transaction_id,
          quantity_sold: Math.max(0, Number(row.quantity ?? 0) || 0),
          sold_at: now
        },
        now
      );
      delete this.listings[this.listingCacheKey(row.signature, listing_row.block_hash_listed)];

      await this.syncSummaryForBucket(row.nft_id, row.price);

      removed.push(row);
    }

    return removed;
  }

  /**
   * Seller delist: reuse markListingSold with buyer=seller so Sales can exclude self-sales.
   * Preserves sold-chain anchors for existing reorg handling.
   */
  async consumeDelistedListing(row, tx = null, blk = null) {
    if (this.app.BROWSER || !row?.signature) {
      return null;
    }

    const listing_row = new Listing(row);
    if (listing_row.isSoldOnChain()) {
      return null;
    }

    const seller = String(row.seller || '').trim();
    const now = Date.now();
    const sold_block_id = Number(blk?.id ?? 0);
    const sold_block_hash = String(blk?.hash ?? '');
    const sold_transaction_id = transactionIndexInBlock(blk, tx);

    await this.db.markListingSold(
      row.signature,
      {
        block_hash_listed: listing_row.block_hash_listed,
        sold_block_id,
        sold_block_hash,
        sold_transaction_id,
        buyer: seller,
        note: '',
        quantity_sold: Math.max(0, Number(row.quantity ?? 0) || 0),
        sold_at: now
      },
      now
    );
    delete this.listings[this.listingCacheKey(row.signature, listing_row.block_hash_listed)];
    await this.syncSummaryForBucket(row.nft_id, row.price);
    return row;
  }

  // --- orders ---

  /** Returns false when this inclusion of the purchase is already on record. */
  async addOrder(order) {
    const params = order instanceof Order ? order.toInsertParams() : order;
    return (await this.db.insertOrder(params)) > 0;
  }

  async confirmSettlement(blk, tx) {
    if (this.app.BROWSER || !tx?.signature) {
      return;
    }

    const txmsg = tx.returnMessage?.() || {};
    const fulfill = txmsg.fulfill_sale;
    if (!fulfill?.sale_signature) {
      return;
    }

    const order_row =
      (await this.db.returnOrderBySettlementSig(tx.signature)) ||
      (await this.db.returnOrderByTxSig(fulfill.sale_signature));
    const order = order_row ? new Order(order_row) : null;

    await this.recordFulfillmentSpends(blk, tx, {
      buyer: order?.buyer || fulfill.buyer || '',
      note: order?.note || '',
      quantity: order ? Number(order.quantity) || 1 : null
    });

    if (!order) {
      return;
    }

    const fulfilled_block_id = Number(blk?.id ?? 0);
    const fulfilled_block_hash = String(blk?.hash ?? '');
    const fulfilled_transaction_id = transactionIndexInBlock(blk, tx);

    // Same canonical inclusion already recorded. A replay after reorg has a new
    // block hash and longest_chain_fulfilled = 0, so settlement runs again.
    if (
      order.isFulfilledOnChain() &&
      order.block_hash_fulfilled === fulfilled_block_hash &&
      order.settlement_tx_sig === tx.signature
    ) {
      return;
    }

    await this.db.updateOrder(order.id, {
      status: ORDER_STATUS_FULFILLED,
      block_id_fulfilled: fulfilled_block_id,
      block_hash_fulfilled: fulfilled_block_hash,
      transaction_id_fulfilled: fulfilled_transaction_id,
      longest_chain_fulfilled: 1
    });
  }

  /**
   * A fulfillment consumes the listing inclusion whose three stored slips match
   * the transaction inputs by block id, tx ordinal, and slip index. The listing
   * signature is not the match key: two inclusions of one transaction have
   * different outpoints, and only the spent one is recorded.
   */
  returnTransactionMessage(tx) {
    try {
      if (typeof tx?.returnMessage === 'function') {
        return tx.returnMessage() || {};
      }
      if (tx?.msg && typeof tx.msg === 'object') {
        return tx.msg;
      }
      if (tx?.data && tx.data.byteLength > 0) {
        return JSON.parse(Buffer.from(tx.data).toString('utf-8'));
      }
    } catch (err) {
      return {};
    }
    return {};
  }

  listingOutpointsSpentBy(row, tx) {
    const slip_json = listingInputSlipJsonFromRecord(row);
    if (!slip_json) {
      return false;
    }
    const anchored = slip_json.map((data) => new Slip(undefined, normalizeSlipJson(data)));
    return anchored.every((expected) =>
      (tx.from || []).some(
        (input) =>
          Number(input?.blockId ?? input?.block_id ?? 0) === Number(expected.blockId ?? 0) &&
          Number(input?.txOrdinal ?? input?.tx_ordinal ?? 0) === Number(expected.txOrdinal ?? 0) &&
          Number(input?.index ?? 0) === Number(expected.index ?? 0)
      )
    );
  }

  async recordFulfillmentSpends(blk, tx, sale = {}) {
    const rows = await this.db.returnListingRowsForSpendMatch();
    const matched = (rows || []).filter((row) => this.listingOutpointsSpentBy(row, tx));
    if (!matched.length) {
      console.warn('Store: fulfillment inputs did not match a stored listing inclusion', tx.signature);
      return [];
    }

    const sold_block_id = Number(blk?.id ?? 0);
    const sold_block_hash = String(blk?.hash ?? '');
    const sold_transaction_id = transactionIndexInBlock(blk, tx);
    const now = Date.now();
    let remaining = sale.quantity == null ? null : Math.max(0, Number(sale.quantity) || 0);
    const touched = [];

    for (const row of matched) {
      const row_qty = Math.max(1, Number(row.quantity ?? 1) || 1);
      const quantity_sold =
        remaining == null ? row_qty : Math.min(row_qty, Math.max(0, remaining));
      if (remaining != null) {
        remaining = Math.max(0, remaining - quantity_sold);
      }
      await this.db.markListingSold(
        row.signature,
        {
          block_hash_listed: row.block_hash_listed,
          sold_block_id,
          sold_block_hash,
          sold_transaction_id,
          note: sale.note || '',
          buyer: sale.buyer || '',
          quantity_sold,
          sold_at: now
        },
        now
      );
      delete this.listings[this.listingCacheKey(row.signature, row.block_hash_listed)];
      touched.push(row);
    }

    const buckets = new Set(touched.map((row) => `${row.nft_id}\0${row.price}`));
    for (const key of buckets) {
      const [nft_id, price] = key.split('\0');
      await this.syncSummaryForBucket(nft_id, price);
    }
    return touched;
  }

  /**
   * Blocks wound with no spend rows stay hidden until this runs. It loads each
   * block, writes sale inclusions from the outpoint match, then reveals listing
   * inclusions created in that block. Sale canonicality is written first.
   */
  async finishDeferredSpendRecovery() {
    if (this.app.BROWSER || !this.pendingSpendRecovery.length) {
      return;
    }
    const pending = this.pendingSpendRecovery.splice(0);
    const retry = [];
    for (const item of pending) {
      const recorded = await this.recoverMissingFulfillmentSpends(item.block_id, item.block_hash);
      if (!recorded) {
        retry.push(item);
        continue;
      }
      await this.db.revealListingsInBlock(item.block_id, item.block_hash);
      for (const row of Object.values(this.listings)) {
        const listed =
          Number(row.block_id_listed ?? row.block_id) === Number(item.block_id) &&
          String((row.block_hash_listed ?? row.block_hash) || '') === String(item.block_hash || '');
        if (listed) {
          row.longest_chain_listed = 1;
        }
      }
      const sales = await this.db.returnListingSalesForBlock(item.block_id, item.block_hash);
      for (const sale of sales || []) {
        const key = this.listingCacheKey(sale.signature, sale.block_hash_listed);
        const cached = this.listings[key];
        if (!cached) {
          continue;
        }
        const fresh = await this.db.returnListingBySignatureAndBlockHash(
          sale.signature,
          sale.block_hash_listed
        );
        if (!fresh) {
          continue;
        }
        cached.block_id_sold = Number(fresh.block_id_sold ?? 0);
        cached.block_hash_sold = fresh.block_hash_sold || '';
        cached.transaction_id_sold = Number(fresh.transaction_id_sold ?? 0);
        cached.longest_chain_sold = Number(fresh.longest_chain_sold ?? 0);
        cached.settlement_pending = Number(fresh.settlement_pending ?? 0) ? 1 : 0;
        cached.buyer = fresh.buyer || '';
        cached.quantity_sold = Number(fresh.quantity_sold ?? 0);
      }
      const buckets = await this.db.returnBucketsAffectedByBlock(item.block_id, item.block_hash);
      for (const bucket of buckets || []) {
        await this.syncSummaryForBucket(bucket.nft_id, bucket.price);
      }
    }
    if (retry.length) {
      this.pendingSpendRecovery.unshift(...retry);
    }
  }

  /**
   * A block is on the longest chain but this process never wrote its spend rows.
   * Replay the block's fulfillment transactions through the same outpoint match.
   * Returns false when the block could not be loaded, so the caller does not
   * reveal remainder inclusions before the spend exists.
   * Ordinary reorg of an existing spend only flips longest_chain_sold.
   */
  async recoverMissingFulfillmentSpends(block_id, block_hash) {
    if (this.app.BROWSER || !block_hash) {
      return false;
    }
    const existing = await this.db.countListingSalesForBlock(block_id, block_hash);
    if (existing > 0) {
      return true;
    }
    let block = null;
    try {
      block = await this.app.core?.blockchain?.getBlock(String(block_hash), true);
    } catch (err) {
      console.warn('Store: could not load block to recover fulfillment spends', block_hash, err);
      return false;
    }
    if (!block) {
      console.warn('Store: block missing while recovering fulfillment spends', block_hash);
      return false;
    }
    const transactions = block?.transactions || [];
    for (const tx of transactions) {
      const txmsg = this.returnTransactionMessage(tx);
      if (txmsg.module !== 'Store' || !txmsg.fulfill_sale) {
        continue;
      }
      await this.recordFulfillmentSpends(block, tx, {
        buyer: txmsg.fulfill_sale.buyer || '',
        note: '',
        quantity: Number(txmsg.fulfill_sale.quantity) || null
      });
    }
    return true;
  }

  async processQueue() {
    if (this.app.BROWSER) {
      return;
    }

    await this.resetStaleSettlementPendingListings();
    await this.resetOrphanedSettlements();
    await this.resetOrphanedFulfillments();

    const orders = await this.db.returnPendingOrders();
    if (!orders?.length) {
      return;
    }

    const retry_limit = Number(this.mod.order_retry_limit ?? 10);

    for (const order_row of orders) {
      const order = new Order(order_row);

      if (!order.isProcessable()) {
        if (order.isAwaitingSettlementConfirmation()) {
          continue;
        }
        continue;
      }

      const listing_rows = await this.getListingsForFulfillment(order_row);
      if (!listing_rows.length) {
        await this.deferOrder(order, retry_limit);
        continue;
      }

      if (await this.fulfillOrder(order_row, listing_rows)) {
        break;
      }
    }
  }

  async resetOrphanedSettlements() {
    const rows = await this.db.returnOrphanedSettlingOrders();
    const now = Date.now();

    for (const row of rows || []) {
      const order = new Order(row);
      await this.clearSettlementPendingForOrder(order);
      await this.db.updateOrder(order.id, {
        settlement_tx_sig: '',
        status: ORDER_STATUS_PENDING,
        block_id_fulfilled: 0,
        block_hash_fulfilled: '',
        transaction_id_fulfilled: 0,
        longest_chain_fulfilled: 0
      });
      await this.syncSummaryForBucket(order.nft_id, order.price);
    }
  }

  async resetStaleSettlementPendingListings() {
    const pending_rows = await this.db.returnListingsWithSettlementPending();
    if (!pending_rows?.length) {
      return;
    }

    const settling_orders = await this.db.returnSettlingOrders();
    const reserved = new Set();

    for (const order_row of settling_orders || []) {
      const signatures = await this.returnSettlementListingSignatures(order_row);
      for (const signature of signatures) {
        reserved.add(signature);
      }
    }

    const now = Date.now();
    for (const row of pending_rows) {
      if (reserved.has(row.signature)) {
        continue;
      }
      await this.db.clearListingSettlementPending(row.signature, row.block_hash_listed, now);
      await this.syncSummaryForBucket(row.nft_id, row.price);
    }
  }

  async returnSettlementListingSignatures(order_row) {
    if (!order_row?.settlement_tx_sig) {
      return [];
    }

    const settlement_tx = await loadTransactionFromArchive(this.app, order_row.settlement_tx_sig);
    const txmsg = settlement_tx?.returnMessage?.() || {};
    const fulfill = txmsg.fulfill_sale || {};
    const signatures = Array.isArray(fulfill.listing_signatures)
      ? fulfill.listing_signatures.filter(Boolean)
      : [];
    if (!signatures.length && fulfill.prior_inventory) {
      signatures.push(fulfill.prior_inventory);
    }
    return signatures;
  }

  async clearSettlementPendingForOrder(order) {
    const signatures = await this.returnSettlementListingSignatures(order);
    const now = Date.now();
    for (const signature of signatures) {
      // Only the reserved inclusion carries the pending marker, so clearing by
      // signature cannot release a different inclusion.
      await this.db.clearListingSettlementPending(signature, null, now);
      for (const listing of Object.values(this.listings)) {
        if (listing.signature === signature && listing.isSettlementPending()) {
          listing.settlement_pending = 0;
        }
      }
    }
  }

  async resetOrphanedFulfillments() {
    const rows = await this.db.returnOrphanedFulfilledOrders();

    for (const row of rows || []) {
      const order = new Order(row);
      await this.db.updateOrder(order.id, {
        settlement_tx_sig: '',
        status: ORDER_STATUS_PENDING,
        block_id_fulfilled: 0,
        block_hash_fulfilled: '',
        transaction_id_fulfilled: 0,
        longest_chain_fulfilled: 0
      });
    }
  }

  async deferOrder(order, retry_limit) {
    const attempts = await this.db.incrementOrderAttempts(order.id);
    if (attempts >= retry_limit) {
      await this.failOrder(order);
    }
  }

  async failOrder(order) {
    await this.db.updateOrder(order.id, { status: ORDER_STATUS_UNFULFILLABLE });

    try {
      await this.mod.propagateOrderRefund(order, {
        refund_public_key: order.buyer,
        reason: 'unable-to-fulfill'
      });
    } catch (err) {
      console.warn('Store: order refund failed', err?.message);
    }
  }

  /**
   * Single fulfillment planner: validates the order and selects listing rows, or returns [].
   */
  async getListingsForFulfillment(order_row) {
    const order = new Order(order_row);
    const quantity = Number(order.quantity) || 1;
    const max_price = Number(order.price ?? 0);
    const summary_row = await this.db.returnSummaryByBucket(order.nft_id, max_price);
    if (!summary_row) {
      return [];
    }

    if (Number(summary_row.quantity_available ?? 0) < quantity) {
      return [];
    }

    if (BigInt(order.price ?? 0) < BigInt(summary_row.price ?? 0)) {
      return [];
    }

    const required_payment = BigInt(order.price ?? 0) * BigInt(quantity);
    if (BigInt(order.payment_amount ?? 0) < required_payment) {
      return [];
    }

    const bucket_price = await this.db.returnLowestSatisfyingPriceForNft(
      order.nft_id,
      max_price,
      quantity
    );
    if (bucket_price === null) {
      return [];
    }

    const candidates = await this.db.returnSpendableListingsForBucket(
      order.nft_id,
      bucket_price,
      quantity
    );
    if (!candidates?.length) {
      return [];
    }

    let remaining = quantity;
    const listing_rows = [];

    for (const listing_row of candidates) {
      if (remaining <= 0) {
        break;
      }

      if (!listing_row.access_script || !listingInputSlipJsonFromRecord(listing_row)) {
        return [];
      }

      if (
        !(await executeListingScript(
          this.app,
          listing_row.access_script,
          this.mod.store_public_key
        ))
      ) {
        return [];
      }

      const row_qty = Number(listing_row.quantity) || 1;
      const take_qty = Math.min(row_qty, remaining);
      listing_rows.push({ ...listing_row, take_qty });
      remaining -= take_qty;
    }

    if (remaining > 0) {
      return [];
    }

    return listing_rows;
  }

  async fulfillOrder(order_row, listing_rows) {
    const order = new Order(order_row);

    let fulfillment_tx = null;
    let listing_tx = null;
    try {
      const primary_signature = listing_rows[0]?.signature;
      listing_tx = primary_signature
        ? await loadTransactionFromArchive(this.app, primary_signature)
        : null;
      if (!listing_tx) {
        throw new Error('listing transaction not available from archive');
      }

      fulfillment_tx = await this.mod.createFulfillmentTransaction(order, listing_rows, listing_tx);
    } catch (err) {
      console.warn('Store: fulfillOrder settlement build failed', err?.message);
      return false;
    }

    const now = Date.now();
    for (const listing_row of listing_rows) {
      await this.db.markListingSettlementPending(
        listing_row.signature,
        listing_row.block_hash_listed,
        now
      );
      const key = this.listingCacheKey(listing_row.signature, listing_row.block_hash_listed);
      if (this.listings[key]) {
        this.listings[key].settlement_pending = 1;
      }
    }
    await this.syncSummaryForBucket(order.nft_id, order.price);

    const primary_signature = listing_rows[0]?.signature;
    if (primary_signature && order.nft_id && !this.mod.image_cache[order.nft_id] && listing_tx) {
      const nft = new SaitoNFT(this.app, this.mod, listing_tx, null);
      const nft_image = nft.returnImage?.() || '';
      if (nft_image) {
        this.mod.image_cache[order.nft_id] = nft_image;
      }
    }

    await this.db.updateOrder(order.id, {
      settlement_tx_sig: fulfillment_tx.signature,
      status: ORDER_STATUS_SETTLING
    });

    console.log('Store: fulfillOrder propagating settlement', fulfillment_tx.signature);
    this.app.network.propagateTransaction(fulfillment_tx);
    return true;
  }

  // --- summaries ---

  /**
   * Full summary rebuild — only for chain rollback recovery
   * (onChainReorganization with longest_chain === false).
   */
  async rebuildSummaries() {
    return this.withSummaryMutation(() => this._rebuildSummaries());
  }

  async _rebuildSummaries() {
    const buckets = await this.db.scanListingsForSummaryRebuild();
    const existing = await this.db.loadAllSummaries();
    const existing_by_bucket = {};

    for (const row of existing || []) {
      existing_by_bucket[summaryBucketKey(row.nft_id, row.price)] = row;
    }

    const now = Date.now();
    const planned = [];

    for (const bucket of buckets || []) {
      const nft_id = bucket.nft_id;
      const price = Number(bucket.price ?? 0);
      const prev = existing_by_bucket[summaryBucketKey(nft_id, price)] || {};
      const active_listing = await this.db.returnActiveListingForBucket(nft_id, price);

      planned.push({
        nft_id,
        price,
        category: prev.category || active_listing?.category || STORE_CATEGORIES.OTHER,
        title: prev.title || '',
        description: prev.description || '',
        image: null,
        quantity_available: Number(bucket.total_quantity ?? 0),
        updated_at: now,
        active_listing
      });
    }

    await this.db.replaceAllSummaries(
      planned.map(({ active_listing, ...row }) => row)
    );

    this.summaries = {};
    for (const item of planned) {
      const row = await this.db.returnSummaryByBucket(item.nft_id, item.price);
      if (!row) {
        continue;
      }
      const summary = new Summary(this.app, this.mod, row);
      if (item.active_listing?.signature) {
        summary.listing_signature = item.active_listing.signature;
      }
      if (item.active_listing?.category) {
        summary.category = item.active_listing.category;
      }
      const key = summaryBucketKey(item.nft_id, item.price);
      this.summaries[key] = summary;
      syncSummaryCache(this.mod, summary);
    }

    this.mod.summaries = this.summaries;
  }

  returnActiveSummaries() {
    return Object.values(this.summaries).filter((summary) => summary.isActive());
  }

  /**
   * Seller Admin / public storefront inventory from warehouse listings.
   * Returns Summary-compatible objects ready for Teaser rendering.
   */
  async returnSellerInventory(seller = '') {
    const key = String(seller || '').trim();
    if (!key || this.app.BROWSER) {
      return { seller: key, active: [], sold: [] };
    }

    const active_rows = await this.db.returnActiveListingsForSeller(key);
    const sold_rows = await this.db.returnSoldListingsForSeller(key);

    const active = [];
    for (const row of active_rows || []) {
      const summary = await this.summaryFromListingRow(row, { sold: false });
      if (summary) {
        active.push(summary);
      }
    }

    const sold = [];
    for (const row of sold_rows || []) {
      const summary = await this.summaryFromListingRow(row, { sold: true });
      if (summary) {
        sold.push(summary);
      }
    }

    return { seller: key, active, sold };
  }

  async summaryFromListingRow(row, { sold = false } = {}) {
    if (!row?.nft_id) {
      return null;
    }

    const price = Number(row.price ?? 0);
    const qty = Math.max(0, Number(row.quantity ?? 0) || 0);
    const meta = (await this.db.returnSummaryByBucket(row.nft_id, price)) || {};
    const image = meta.image || (row.nft_id && this.mod.image_cache?.[row.nft_id]) || null;

    return new Summary(this.app, this.mod, {
      nft_id: row.nft_id,
      seller: row.seller || '',
      category: row.category || meta.category || STORE_CATEGORIES.OTHER,
      title: String(meta.title || '').trim(),
      description: String(meta.description ?? '').trim(),
      image,
      price,
      quantity_available: sold ? 0 : qty,
      quantity_total: qty,
      listing_signature: row.signature || '',
      approved: Number(row.approved ?? 0),
      risk:
        row.risk === 'Low' ||
        row.risk === 'Medium' ||
        row.risk === 'High' ||
        row.risk === 'Dangerous'
          ? row.risk
          : '',
      created_at: Number(row.created_at || 0),
      updated_at: Number(row.updated_at || row.created_at || meta.updated_at || 0),
      status: sold ? 0 : 1,
      note: sold ? String(row.note || '') : '',
      buyer: sold ? String(row.buyer || '') : '',
      quantity_sold: sold
        ? Math.max(
            0,
            Number(row.quantity_sold ?? 0) || Number(row.quantity ?? 0) || 0
          )
        : 0,
      // Prefer sold_at; for pre-migration sold rows, updated_at was set at settlement.
      sold_at: sold
        ? Number(row.sold_at || 0) || Number(row.updated_at || 0) || 0
        : 0
    });
  }

  /**
   * Listing rows filtered by seller set, category, and active/sold status, then paged.
   * sellers: public keys to include (single seller or ModTools whitelist). Empty → no results.
   * category '' / omitted = all categories.
   * status 'sold' → completed sales; anything else → active (marketplace default).
   * Single-seller queries use SQL COUNT/LIMIT/OFFSET. Whitelist (multi-seller) stays in-memory.
   */
  async returnActiveListingsPage({
    sellers = [],
    category = '',
    offset = 0,
    page_size = 24,
    status = 'active'
  } = {}) {
    const size = normalizePageSize(page_size);
    let start = normalizeOffset(offset);
    const filter = String(category || '').trim();
    const listing_status = String(status || '').toLowerCase() === 'sold' ? 'sold' : 'active';
    const seller_keys = (Array.isArray(sellers) ? sellers : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean);
    const sold = listing_status === 'sold';

    const empty = {
      listings: [],
      category: filter,
      pagination: {
        offset: 0,
        page: 1,
        page_size: size,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false
      }
    };

    if (filter && !isStoreCategory(filter)) {
      return empty;
    }

    let rows = [];
    let total = 0;

    if (seller_keys.length === 1) {
      total = await this.db.countListingsForSeller({
        seller: seller_keys[0],
        status: listing_status,
        category: filter
      });
      if (total > 0 && start >= total) {
        start = Math.floor((total - 1) / size) * size;
      }
      rows =
        total > 0
          ? (await this.db.returnListingsPageForSeller({
              seller: seller_keys[0],
              status: listing_status,
              category: filter,
              offset: start,
              page_size: size
            })) || []
          : [];
    } else if (listing_status === 'active' && seller_keys.length > 1) {
      const allowed = new Set(seller_keys);
      rows = ((await this.db.returnAllActiveListingRows()) || []).filter((row) =>
        allowed.has(String(row.seller || '').trim())
      );
      if (filter) {
        rows = rows.filter((row) => String(row.category || '') === filter);
      }
      // Marketplace whitelist path: keep existing newest-first sort.
      rows.sort((a, b) => {
        const td =
          Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0);
        if (td !== 0) {
          return td;
        }
        return String(a.signature || '').localeCompare(String(b.signature || ''));
      });
      total = rows.length;
      if (total > 0 && start >= total) {
        start = Math.floor((total - 1) / size) * size;
      }
      rows = rows.slice(start, start + size);
    }

    const listings = [];
    for (const row of rows) {
      const summary = await this.summaryFromListingRow(row, { sold });
      if (summary) {
        listings.push(summary);
      }
    }

    const page = size > 0 ? Math.floor(start / size) + 1 : 1;

    return {
      listings,
      category: filter,
      pagination: {
        offset: start,
        page,
        page_size: size,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / size),
        has_next: start + size < total,
        has_previous: start > 0 && total > 0
      }
    };
  }

  /**
   * Main Store catalog: active listings whose seller is ModTools-whitelisted
   * OR whose listings.approved flag is 1. Independent of seller-scoped pages.
   * Empty whitelist still returns independently approved listings.
   */
  async returnMarketplaceListingsPage({
    whitelist_sellers = [],
    category = '',
    offset = 0,
    page_size = 24
  } = {}) {
    const size = normalizePageSize(page_size);
    let start = normalizeOffset(offset);
    const filter = String(category || '').trim();

    const empty = {
      listings: [],
      category: filter,
      pagination: {
        offset: 0,
        page: 1,
        page_size: size,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false
      }
    };

    if (filter && !isStoreCategory(filter)) {
      return empty;
    }

    const keys = (Array.isArray(whitelist_sellers) ? whitelist_sellers : [])
      .map((key) => String(key || '').trim())
      .filter(Boolean);

    let total = await this.db.countMarketplaceListings({
      whitelist_sellers: keys,
      category: filter
    });
    if (total > 0 && start >= total) {
      start = Math.floor((total - 1) / size) * size;
    }

    const rows =
      total > 0
        ? (await this.db.returnMarketplaceListingsPage({
            whitelist_sellers: keys,
            category: filter,
            offset: start,
            page_size: size
          })) || []
        : [];

    const listings = [];
    for (const row of rows) {
      const summary = await this.summaryFromListingRow(row, { sold: false });
      if (summary) {
        listings.push(summary);
      }
    }

    const page = size > 0 ? Math.floor(start / size) + 1 : 1;

    return {
      listings,
      category: filter,
      pagination: {
        offset: start,
        page,
        page_size: size,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / size),
        has_next: start + size < total,
        has_previous: start > 0 && total > 0
      }
    };
  }

  async returnPendingModerationPage({
    offset = 0,
    page_size = 24,
    sort = 'created_at',
    direction = 'desc'
  } = {}) {
    const size = normalizePageSize(page_size);
    let start = normalizeOffset(offset);

    const empty = {
      listings: [],
      sort: String(sort || 'created_at'),
      direction: String(direction || '').toLowerCase() === 'asc' ? 'asc' : 'desc',
      pagination: {
        offset: 0,
        page: 1,
        page_size: size,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false
      }
    };

    if (this.app.BROWSER) {
      return empty;
    }

    let total = await this.db.countPendingModerationListings();
    if (total > 0 && start >= total) {
      start = Math.floor((total - 1) / size) * size;
    }

    const rows =
      total > 0
        ? (await this.db.returnPendingModerationPage({
            offset: start,
            page_size: size,
            sort,
            direction
          })) || []
        : [];

    const listings = [];
    for (const row of rows) {
      const summary = await this.summaryFromListingRow(row, { sold: false });
      if (summary) {
        listings.push(summary);
      }
    }

    const page = size > 0 ? Math.floor(start / size) + 1 : 1;

    return {
      listings,
      sort: String(sort || 'created_at'),
      direction: String(direction || '').toLowerCase() === 'asc' ? 'asc' : 'desc',
      pagination: {
        offset: start,
        page,
        page_size: size,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / size),
        has_next: start + size < total,
        has_previous: start > 0 && total > 0
      }
    };
  }

  async returnSummaryByBucket(nft_id, price) {
    const key = summaryBucketKey(nft_id, price);
    if (this.summaries[key]) {
      return this.summaries[key];
    }

    try {
      const row = await this.db.returnSummaryByBucket(nft_id, price);
      if (!row) {
        return null;
      }

      const summary = new Summary(this.app, this.mod, row);
      this.summaries[key] = summary;
      syncSummaryCache(this.mod, summary);
      return summary;
    } catch (err) {
      return null;
    }
  }

  // --- internal ---

  async addListingFromTransaction(nft, tx, txmsg, blk = null) {
    const signature = tx?.signature || '';

    if (!tx?.signature) {
      console.warn('Store: addListingFromTransaction: malformed transaction (missing signature)');
      return null;
    }

    // The block hash is half of a listing's identity: without it a second inclusion
    // of the same transaction could not be told apart from the first.
    const block_hash = String(blk?.hash || '');
    if (!block_hash) {
      console.warn(
        'Store: addListingFromTransaction: confirmation without a block hash',
        signature
      );
      return null;
    }

    if (await this.listingExists(tx.signature, block_hash)) {
      // Replay of a block whose reveal was deferred. The spend, if any, was
      // recorded by confirmSettlement before this call.
      await this.db.revealListingsInBlock(Number(blk?.id ?? 0), block_hash);
      return null;
    }

    const access_script = txmsg.access_script || '';
    if (!(await executeListingScript(this.app, access_script, this.mod.store_public_key))) {
      console.warn('Store: addListingFromTransaction: executeListingScript failed', signature);
      return null;
    }

    const observation = this.observeListingFromTransaction(nft, tx, txmsg, blk);
    if (!observation) {
      return null;
    }

    // Server classifies the listing payload. Seller/browser-supplied risk is ignored.
    let risk = '';
    try {
      risk = checkSecurityLevel(tx);
    } catch (err) {
      console.warn('Store: checkSecurityLevel failed', signature, err?.message || err);
      risk = '';
    }
    if (risk !== 'Low' && risk !== 'Medium' && risk !== 'High' && risk !== 'Dangerous') {
      risk = '';
    }
    observation.risk = risk;

    // A new inclusion is the same transaction in a different block: carry the
    // moderation decision over instead of sending it back through review.
    const prior_inclusion = await this.db.returnLatestListingInclusion(tx.signature);
    if (prior_inclusion) {
      observation.approved = Number(prior_inclusion.approved ?? 0) || 0;
    }

    const listing = await this.addListing(observation);
    if (!listing) {
      return null;
    }

    // Archive early so restart recovery can rebuild metadata/image from the listing tx.
    this.app.storage
      .saveTransaction(tx, { field1: 'Store', preserve: 1 }, 'localhost', blk)
      .catch((err) => {
        console.warn(
          'Store: failed to save listing transaction to Archive',
          tx.signature,
          err?.message || err
        );
      });

    // Persist/update the nft_id+price summary from listing + txmsg (no placeholder row).
    await this.applyListingToSummary(listing, txmsg);

    const image = nft.returnImage?.() || '';
    if (image && listing.nft_id) {
      this.mod.image_cache[listing.nft_id] = image;
    }

    return listing;
  }

  /**
   * Write/update the market summary for a newly inserted listing using in-memory
   * listing + txmsg. Quantity is the aggregate of all active listings in the bucket.
   */
  async applyListingToSummary(listing, txmsg = {}) {
    return this.withSummaryMutation(() => this._applyListingToSummary(listing, txmsg));
  }

  async _applyListingToSummary(listing, txmsg = {}) {
    if (!listing?.nft_id) {
      throw new Error('Store: applyListingToSummary requires listing.nft_id');
    }

    const nft_id = listing.nft_id;
    const price = Number(listing.price ?? 0);
    const available = await this.db.sumListingQuantityForBucket(nft_id, price);
    const { title, description } = this.extractListingMetadata(txmsg);
    const category = listing.category || STORE_CATEGORIES.OTHER;
    const now = Date.now();

    const existing = await this.db.returnSummaryByBucket(nft_id, price);
    if (!existing) {
      await this.db.insertSummary({
        nft_id,
        price,
        category,
        title,
        description,
        image: null,
        quantity_available: available,
        updated_at: now
      });
    } else {
      await this.db.updateSummaryAvailableByBucket(nft_id, price, available, now);
      if (title || description) {
        await this.db.updateSummaryMetadata(nft_id, price, { title, description });
      }
      if (category) {
        await this.db.updateSummaryCategory(nft_id, price, category);
      }
    }

    const summary = new Summary(this.app, this.mod, {
      nft_id,
      seller: listing.seller || existing?.seller || '',
      category,
      title: title || existing?.title || '',
      description: description !== '' ? description : existing?.description || '',
      image: null,
      price,
      quantity_available: available,
      quantity_total: available,
      listing_signature: listing.signature || '',
      updated_at: now,
      status: available > 0 ? 1 : 0
    });

    const key = summaryBucketKey(nft_id, price);
    this.summaries[key] = summary;
    this.mod.summaries = this.summaries;
    syncSummaryCache(this.mod, summary);
    return summary;
  }

  extractListingMetadata(txmsg = {}) {
    const listing = txmsg.listing || {};
    return {
      title: String(listing.title || txmsg.title || '').trim(),
      description: String(listing.description ?? txmsg.description ?? '').trim()
    };
  }

  async persistSummaryMetadata(nft_id, price, txmsg = {}) {
    return this.withSummaryMutation(async () => {
      const { title, description } = this.extractListingMetadata(txmsg);
      if (!title && !description) {
        return;
      }
      await this.db.updateSummaryMetadata(nft_id, price, { title, description });
      await this._syncSummaryToCache(nft_id, price);
    });
  }

  async persistSummaryCategory(listing) {
    return this.withSummaryMutation(async () => {
      if (!listing?.nft_id) {
        return;
      }
      const category = listing.category || STORE_CATEGORIES.OTHER;
      await this.db.updateSummaryCategory(listing.nft_id, listing.price, category);
      await this._syncSummaryToCache(listing.nft_id, listing.price);
    });
  }

  async syncSummaryToCache(nft_id, price) {
    return this.withSummaryMutation(() => this._syncSummaryToCache(nft_id, price));
  }

  async _syncSummaryToCache(nft_id, price) {
    const row = await this.db.returnSummaryByBucket(nft_id, price);
    if (!row) {
      return null;
    }

    const summary = new Summary(this.app, this.mod, row);
    const listing = await this.db.returnActiveListingForBucket(nft_id, price);
    if (listing?.signature) {
      summary.listing_signature = listing.signature;
    }
    if (listing?.category) {
      summary.category = listing.category;
    }
    const key = summaryBucketKey(nft_id, price);
    this.summaries[key] = summary;
    this.mod.summaries = this.summaries;
    syncSummaryCache(this.mod, summary);
    return summary;
  }

  observeListingFromTransaction(nft, tx, txmsg, blk = null) {
    const signature = tx?.signature || '';
    const created_tuples = returnCreatedNftTuples(tx);

    if (!created_tuples.length) {
      console.warn('Store: observeListingFromTransaction: no NFT tuple created', signature);
      return null;
    }

    const script_address = txmsg.p2sh_address || '';
    if (!script_address) {
      console.warn(
        'Store: observeListingFromTransaction: malformed transaction (missing p2sh_address)',
        signature
      );
      return null;
    }

    const slip_key = slipPublicKey(this.app, script_address);
    const listed_block_id = Number(blk?.id ?? 0);
    const listed_block_hash = String(blk?.hash ?? '');
    const listed_transaction_id = transactionIndexInBlock(blk, tx);
    const inventory_triple = findInventoryTriple(tx.to, slip_key);

    if (!inventory_triple) {
      console.warn('Store: observeListingFromTransaction: inventory triple missing', signature, {
        slip_key
      });
      return null;
    }

    const meta = txmsg.listing || {};
    const fulfill = txmsg.fulfill_sale || {};
    const price_nolan = Number(this.app.wallet.convertSaitoToNolan(meta.price ?? 0) ?? 0);
    const change_qty = inventory_triple[0]?.amount;

    // Bound from[0] is mint creator metadata; ownership is Normal/ATR from[1].
    const from0 = tx.from?.[0];
    const from1 = tx.from?.[1];
    let listing_seller = from0?.publicKey || '';
    if (from0?.type === SlipType.Bound && from1?.publicKey) {
      listing_seller = from1.publicKey;
    }

    const nft_type =
      (typeof nft?.returnType === 'function' ? nft.returnType() : null) || nft?.nft_type || '';
    const category = mapNFTTypeToCategory(nft_type);

    return {
      signature: tx.signature,
      nft_id: String(nft.id || nft.uuid || meta.nft_id || ''),
      seller: fulfill.seller || listing_seller || '',
      category,
      quantity: Number(change_qty ?? nft.amount ?? inventory_triple[0]?.amount ?? 1) || 1,
      price: price_nolan,
      access_hash: txmsg.access_hash || '',
      access_script: txmsg.access_script || '',
      p2sh_address: script_address,
      block_id_listed: listed_block_id,
      block_hash_listed: listed_block_hash,
      transaction_id_listed: listed_transaction_id,
      longest_chain_listed: 1,
      block_id_sold: 0,
      block_hash_sold: '',
      transaction_id_sold: 0,
      longest_chain_sold: 0,
      settlement_pending: 0,
      slip_id: returnListingSlipId(tx, slip_key),
      on_chain: 1,
      utxo_slip1: serializeSlip(inventory_triple[0]),
      utxo_slip2: serializeSlip(inventory_triple[1]),
      utxo_slip3: serializeSlip(inventory_triple[2]),
      created_at: Date.now(),
      updated_at: Date.now()
    };
  }

  async matchSpentListings(tx) {
    const spent_tuples = returnSpentNftTuples(tx);
    if (!spent_tuples.length) {
      return [];
    }

    const rows = await this.db.returnAllActiveListingRows();
    const spent = [];

    for (const row of rows || []) {
      const listing_row = new Listing(row);
      if (listing_row.isSoldOnChain()) {
        continue;
      }
      if (this.listingOutpointsSpentBy(row, tx)) {
        spent.push(row);
      }
    }

    return spent;
  }

  async returnAvailableQuantity(nft_id, price) {
    return this.db.sumListingQuantityForBucket(nft_id, price);
  }

  async syncSummaryForBucket(nft_id, price) {
    return this.withSummaryMutation(() => this._syncSummaryForBucket(nft_id, price));
  }

  async _syncSummaryForBucket(nft_id, price) {
    const available = await this.db.sumListingQuantityForBucket(nft_id, price);
    let row = await this.db.returnSummaryByBucket(nft_id, price);

    if (!row && available <= 0) {
      return null;
    }

    const now = Date.now();

    if (!row) {
      await this.db.insertSummary({
        nft_id,
        price: Number(price ?? 0),
        category: STORE_CATEGORIES.OTHER,
        title: '',
        description: '',
        image: null,
        quantity_available: available,
        updated_at: now
      });
      row = await this.db.returnSummaryByBucket(nft_id, price);
    } else {
      await this.db.updateSummaryAvailableByBucket(nft_id, price, available, now);
      if (available <= 0) {
        const refreshed = await this.db.returnSummaryByBucket(nft_id, price);
        const has_metadata = !!(refreshed?.title || refreshed?.description);
        if (!has_metadata) {
          await this.db.deleteSummaryByBucket(nft_id, price);
          const key = summaryBucketKey(nft_id, price);
          delete this.summaries[key];
          this.mod.summaries = this.summaries;
          return null;
        }
      }
    }

    return this._syncSummaryToCache(nft_id, price);
  }

  /** True when this exact block inclusion of the listing transaction is already stored. */
  async listingExists(signature, block_hash_listed = '') {
    if (!signature) {
      return false;
    }
    if (this.listings[this.listingCacheKey(signature, block_hash_listed)]) {
      return true;
    }
    return !!(await this.db.returnListingBySignatureAndBlockHash(signature, block_hash_listed));
  }
}

module.exports = Warehouse;
