/** Listing is reserved for an in-flight settlement until confirmed or reset. */
const LISTING_SETTLEMENT_PENDING_BLOCK_ID = -1;
const { STORE_CATEGORIES } = require('./categories');

class Database {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  get dbname() {
    return this.mod.dbname;
  }

  async ensureSchema() {
    const listing_columns = [
      'ALTER TABLE listings ADD COLUMN in_flight INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN reserved_order_id INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN block_id_listed INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN block_hash_listed TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listings ADD COLUMN transaction_id_listed INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN longest_chain_listed INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE listings ADD COLUMN block_id_sold INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN block_hash_sold TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listings ADD COLUMN transaction_id_sold INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN longest_chain_sold INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN category TEXT DEFAULT "Other"'
    ];
    const summary_columns = ['ALTER TABLE summary ADD COLUMN category TEXT DEFAULT "Other"'];
    const order_columns = [
      'ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE orders ADD COLUMN payment_utxo_slip TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN payment_access_hash TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN payment_access_script TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN payment_p2sh_address TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT "pending"',
      'ALTER TABLE orders ADD COLUMN block_id_received INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE orders ADD COLUMN block_hash_received TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN transaction_id_received INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE orders ADD COLUMN longest_chain_received INTEGER NOT NULL DEFAULT 1'
    ];

    for (const sql of [...listing_columns, ...summary_columns, ...order_columns]) {
      try {
        await this.app.storage.runDatabase(sql, {}, this.dbname);
      } catch (err) {
        // column already exists
      }
    }

    await this.migrateListingChainFields();
    await this.migrateOrderChainFields();
    await this.migrateOrderCryptoFieldNames();
  }

  async migrateListingChainFields() {
    const migrations = [
      `UPDATE listings
			 SET block_id_listed = block_id,
			     block_hash_listed = block_hash,
			     transaction_id_listed = transaction_id,
			     longest_chain_listed = longest_chain
			 WHERE block_id_listed = 0 AND block_id != 0`,
      `UPDATE listings
			 SET longest_chain_sold = 1
			 WHERE block_id_sold = 0 AND spent = 1 AND block_id != 0`,
      `UPDATE listings
			 SET block_id_sold = block_id,
			     block_hash_sold = block_hash,
			     transaction_id_sold = transaction_id,
			     longest_chain_sold = longest_chain
			 WHERE block_id_sold = 0 AND spent = 1 AND block_id != 0`
    ];

    for (const sql of migrations) {
      try {
        await this.app.storage.runDatabase(sql, {}, this.dbname);
      } catch (err) {
        // legacy columns may be absent on fresh installs
      }
    }
  }

  async migrateOrderChainFields() {
    const migrations = [
      `UPDATE orders
			 SET block_id_received = block_id_added,
			     block_hash_received = block_hash_added,
			     transaction_id_received = transaction_id_added,
			     longest_chain_received = longest_chain_added
			 WHERE block_id_received = 0 AND block_id_added != 0`,
      `UPDATE orders
			 SET block_id_fulfilled = block_id_confirmed,
			     block_hash_fulfilled = block_hash_confirmed,
			     transaction_id_fulfilled = transaction_id_confirmed,
			     longest_chain_fulfilled = longest_chain_confirmed
			 WHERE block_id_fulfilled = 0 AND block_id_confirmed != 0`
    ];

    for (const sql of migrations) {
      try {
        await this.app.storage.runDatabase(sql, {}, this.dbname);
      } catch (err) {
        // legacy columns may be absent on fresh installs
      }
    }
  }

  /** Rename legacy payment_* crypto columns on orders. */
  async migrateOrderCryptoFieldNames() {
    const renames = [
      ['payment_utxo_slip', 'utxo_slip'],
      ['payment_access_hash', 'access_hash'],
      ['payment_access_script', 'access_script'],
      ['payment_p2sh_address', 'p2sh_address']
    ];

    for (const [from, to] of renames) {
      try {
        await this.app.storage.runDatabase(
          `ALTER TABLE orders RENAME COLUMN ${from} TO ${to}`,
          {},
          this.dbname
        );
      } catch (err) {
        // already renamed or column absent on fresh installs
      }
    }
  }

  // --- listings (authoritative: one row per listing transaction) ---

  async insertListingRow(row) {
    const sql = `INSERT INTO listings (
			  signature, nft_id, seller, category, quantity, price,
			  access_hash, access_script, p2sh_address, slip_id,
			  block_id_listed, block_hash_listed, transaction_id_listed, longest_chain_listed,
			  block_id_sold, block_hash_sold, transaction_id_sold, longest_chain_sold,
			  on_chain,
			  utxo_slip1, utxo_slip2, utxo_slip3,
			  created_at, updated_at
			) VALUES (
			  $signature, $nft_id, $seller, $category, $quantity, $price,
			  $access_hash, $access_script, $p2sh_address, $slip_id,
			  $block_id_listed, $block_hash_listed, $transaction_id_listed, $longest_chain_listed,
			  $block_id_sold, $block_hash_sold, $transaction_id_sold, $longest_chain_sold,
			  $on_chain,
			  $utxo_slip1, $utxo_slip2, $utxo_slip3,
			  $created_at, $updated_at
			)`;
    const params = {
      $signature: row.signature,
      $nft_id: row.nft_id,
      $seller: row.seller || '',
      $category: row.category || STORE_CATEGORIES.OTHER,
      $quantity: Number(row.quantity ?? 1),
      $price: Number(row.price ?? 0),
      $access_hash: row.access_hash || '',
      $access_script: row.access_script || '',
      $p2sh_address: row.p2sh_address || '',
      $slip_id: row.slip_id ?? 0,
      $block_id_listed: row.block_id_listed ?? row.block_id ?? 0,
      $block_hash_listed: row.block_hash_listed || row.block_hash || '',
      $transaction_id_listed: row.transaction_id_listed ?? row.transaction_id ?? 0,
      $longest_chain_listed: row.longest_chain_listed ?? row.longest_chain ?? 1,
      $block_id_sold: row.block_id_sold ?? 0,
      $block_hash_sold: row.block_hash_sold || '',
      $transaction_id_sold: row.transaction_id_sold ?? 0,
      $longest_chain_sold: row.longest_chain_sold ?? 0,
      $on_chain: row.on_chain ?? 1,
      $utxo_slip1: row.utxo_slip1 || '',
      $utxo_slip2: row.utxo_slip2 || '',
      $utxo_slip3: row.utxo_slip3 || '',
      $created_at: row.created_at,
      $updated_at: row.updated_at
    };

    // Bypass runDatabase so insert failures surface (runDatabase swallows errors).
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      throw new Error('Store database unavailable');
    }
    await db.run(sql, params);
  }

  async returnListingBySignature(signature) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM listings WHERE signature = $signature LIMIT 1`,
      { $signature: signature },
      this.dbname
    );
    return res?.[0] || null;
  }

  async returnSpendableListingsForBucket(nft_id, price, limit = 1) {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE nft_id = $nft_id AND price = $price
				   AND on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold = 0
				   AND longest_chain_sold = 0
				 ORDER BY created_at ASC, id ASC
				 LIMIT $limit`,
        { $nft_id: nft_id, $price: Number(price), $limit: Number(limit) || 1 },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnLowestSatisfyingPriceForNft(nft_id, max_price, quantity) {
    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT price, SUM(quantity) AS total_quantity
				 FROM listings
				 WHERE nft_id = $nft_id AND price <= $max_price
				   AND on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold = 0
				   AND longest_chain_sold = 0
				 GROUP BY price
				 HAVING SUM(quantity) >= $quantity
				 ORDER BY price ASC
				 LIMIT 1`,
        {
          $nft_id: nft_id,
          $max_price: Number(max_price),
          $quantity: Number(quantity) || 1
        },
        this.dbname
      );
      if (!res?.[0]) {
        return null;
      }
      return Number(res[0].price);
    } catch (err) {
      return null;
    }
  }

  async returnActiveListingForBucket(nft_id, price) {
    const rows = await this.returnSpendableListingsForBucket(nft_id, price, 1);
    return rows?.[0] || null;
  }

  async returnAllActiveListingRows() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold = 0
				   AND longest_chain_sold = 0
				 ORDER BY created_at ASC`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async markListingSold(
    signature,
    { sold_block_id = 0, sold_block_hash = '', sold_transaction_id = 0 } = {},
    now = Date.now()
  ) {
    await this.app.storage.runDatabase(
      `UPDATE listings
			 SET block_id_sold = $block_id_sold,
			     block_hash_sold = $block_hash_sold,
			     transaction_id_sold = $transaction_id_sold,
			     longest_chain_sold = 1,
			     updated_at = $updated_at
			 WHERE signature = $signature`,
      {
        $signature: signature,
        $block_id_sold: Number(sold_block_id ?? 0),
        $block_hash_sold: String(sold_block_hash || ''),
        $transaction_id_sold: Number(sold_transaction_id ?? 0),
        $updated_at: now
      },
      this.dbname
    );
  }

  async markListingSettlementPending(signature, now = Date.now()) {
    await this.app.storage.runDatabase(
      `UPDATE listings
			 SET block_id_sold = $block_id_sold,
			     block_hash_sold = '',
			     transaction_id_sold = 0,
			     longest_chain_sold = 0,
			     updated_at = $updated_at
			 WHERE signature = $signature
			   AND longest_chain_listed = 1
			   AND block_id_sold = 0
			   AND longest_chain_sold = 0`,
      {
        $signature: signature,
        $block_id_sold: LISTING_SETTLEMENT_PENDING_BLOCK_ID,
        $updated_at: now
      },
      this.dbname
    );
  }

  async clearListingSettlementPending(signature, now = Date.now()) {
    await this.app.storage.runDatabase(
      `UPDATE listings
			 SET block_id_sold = 0,
			     block_hash_sold = '',
			     transaction_id_sold = 0,
			     longest_chain_sold = 0,
			     updated_at = $updated_at
			 WHERE signature = $signature
			   AND block_id_sold = $block_id_sold`,
      {
        $signature: signature,
        $block_id_sold: LISTING_SETTLEMENT_PENDING_BLOCK_ID,
        $updated_at: now
      },
      this.dbname
    );
  }

  async sumListingQuantityForBucket(nft_id, price) {
    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT COALESCE(SUM(quantity), 0) AS total_quantity
				 FROM listings
				 WHERE nft_id = $nft_id AND price = $price
				   AND on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold = 0
				   AND longest_chain_sold = 0`,
        { $nft_id: nft_id, $price: Number(price) },
        this.dbname
      );
      return Number(res?.[0]?.total_quantity ?? 0);
    } catch (err) {
      return 0;
    }
  }

  async updateListingsListedChainState(block_id, block_hash, longest_chain) {
    await this.app.storage.runDatabase(
      `UPDATE listings SET longest_chain_listed = $longest_chain
			 WHERE block_id_listed = $block_id AND block_hash_listed = $block_hash`,
      {
        $block_id: Number(block_id) || 0,
        $block_hash: String(block_hash || ''),
        $longest_chain: longest_chain ? 1 : 0
      },
      this.dbname
    );
  }

  async updateListingsSoldChainState(block_id, block_hash, longest_chain) {
    const on_lc = !!longest_chain;
    // When a sale leaves the longest chain, clear sold anchors so the row
    // becomes active again (active SQL requires block_id_sold = 0).
    if (!on_lc) {
      await this.app.storage.runDatabase(
        `UPDATE listings
				 SET block_id_sold = 0,
				     block_hash_sold = '',
				     transaction_id_sold = 0,
				     longest_chain_sold = 0,
				     updated_at = $updated_at
				 WHERE block_id_sold = $block_id AND block_hash_sold = $block_hash
				   AND block_id_sold > 0`,
        {
          $block_id: Number(block_id) || 0,
          $block_hash: String(block_hash || ''),
          $updated_at: Date.now()
        },
        this.dbname
      );
      return;
    }

    await this.app.storage.runDatabase(
      `UPDATE listings SET longest_chain_sold = 1
			 WHERE block_id_sold = $block_id AND block_hash_sold = $block_hash`,
      {
        $block_id: Number(block_id) || 0,
        $block_hash: String(block_hash || '')
      },
      this.dbname
    );
  }

  async returnActiveListingsForSeller(seller = '') {
    const key = String(seller || '').trim();
    if (!key) {
      return [];
    }
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE seller = $seller
				   AND on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold = 0
				   AND longest_chain_sold = 0
				 ORDER BY created_at DESC`,
        { $seller: key },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnSoldListingsForSeller(seller = '') {
    const key = String(seller || '').trim();
    if (!key) {
      return [];
    }
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE seller = $seller
				   AND on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold > 0
				   AND longest_chain_sold = 1
				 ORDER BY block_id_sold DESC, created_at DESC`,
        { $seller: key },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async scanListingsForSummaryRebuild() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT nft_id, price, SUM(quantity) AS total_quantity
				 FROM listings
				 WHERE on_chain = 1
				   AND longest_chain_listed = 1
				   AND block_id_sold = 0
				   AND longest_chain_sold = 0
				 GROUP BY nft_id, price`,
        {},
        this.dbname
      );
    } catch (err) {
      console.log('Store Database: scanListingsForSummaryRebuild failed', err?.message);
      return [];
    }
  }

  // --- summary (derived market aggregate) ---

  async insertSummary(summary) {
    const sql = `INSERT INTO summary (
			  nft_id, price, category, title, description, image,
			  quantity_available, updated_at
			) VALUES (
			  $nft_id, $price, $category, $title, $description, $image,
			  $quantity_available, $updated_at
			)`;
    const params = {
      $nft_id: summary.nft_id,
      $price: Number(summary.price ?? 0),
      $category: summary.category || STORE_CATEGORIES.OTHER,
      $title: summary.title || '',
      $description: summary.description || '',
      $image: summary.image ?? null,
      $quantity_available: Number(summary.quantity_available ?? 0),
      $updated_at: summary.updated_at ?? Date.now()
    };

    // Bypass runDatabase so insert failures surface (runDatabase swallows errors).
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      throw new Error('Store database unavailable');
    }
    await db.run(sql, params);
  }

  async returnSummary(summary_id) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM summary WHERE id = $id LIMIT 1`,
      { $id: Number(summary_id) },
      this.dbname
    );
    return res?.[0] || null;
  }

  async returnSummaryByBucket(nft_id, price) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM summary WHERE nft_id = $nft_id AND price = $price LIMIT 1`,
      { $nft_id: nft_id, $price: Number(price) },
      this.dbname
    );
    return res?.[0] || null;
  }

  async loadAllSummaries() {
    try {
      return await this.app.storage.queryDatabase(`SELECT * FROM summary`, {}, this.dbname);
    } catch (err) {
      return [];
    }
  }

  async clearSummaries() {
    await this.app.storage.runDatabase(`DELETE FROM summary`, {}, this.dbname);
  }

  /**
   * Atomically replace the entire summary table (DELETE + INSERTs).
   * Uses the shared SQLite connection's BEGIN/COMMIT so readers on this
   * connection never observe a half-rebuilt table if the rebuild fails.
   */
  async replaceAllSummaries(rows = []) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      throw new Error('Store database unavailable');
    }

    const insert_sql = `INSERT INTO summary (
			  nft_id, price, category, title, description, image,
			  quantity_available, updated_at
			) VALUES (
			  $nft_id, $price, $category, $title, $description, $image,
			  $quantity_available, $updated_at
			)`;

    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.run(`DELETE FROM summary`);
      for (const summary of rows || []) {
        await db.run(insert_sql, {
          $nft_id: summary.nft_id,
          $price: Number(summary.price ?? 0),
          $category: summary.category || STORE_CATEGORIES.OTHER,
          $title: summary.title || '',
          $description: summary.description || '',
          $image: summary.image ?? null,
          $quantity_available: Number(summary.quantity_available ?? 0),
          $updated_at: summary.updated_at ?? Date.now()
        });
      }
      await db.exec('COMMIT');
    } catch (err) {
      try {
        await db.exec('ROLLBACK');
      } catch (_) {
        // ignore rollback failure; original error is what matters
      }
      throw err;
    }
  }

  async deleteSummaryByBucket(nft_id, price) {
    await this.app.storage.runDatabase(
      `DELETE FROM summary WHERE nft_id = $nft_id AND price = $price`,
      { $nft_id: nft_id, $price: Number(price) },
      this.dbname
    );
  }

  async updateSummaryAvailableByBucket(nft_id, price, quantity_available, now = Date.now()) {
    await this.app.storage.runDatabase(
      `UPDATE summary
			 SET quantity_available = $quantity_available,
			     updated_at = $updated_at
			 WHERE nft_id = $nft_id AND price = $price`,
      {
        $nft_id: nft_id,
        $price: Number(price),
        $quantity_available: Number(quantity_available ?? 0),
        $updated_at: now
      },
      this.dbname
    );
  }

  async updateSummaryMetadata(nft_id, price, { title = '', description = '' } = {}) {
    await this.app.storage.runDatabase(
      `UPDATE summary
			 SET title = CASE WHEN length($title) > 0 THEN $title ELSE title END,
			     description = CASE WHEN length($description) > 0 THEN $description ELSE description END,
			     updated_at = $updated_at
			 WHERE nft_id = $nft_id AND price = $price`,
      {
        $nft_id: nft_id,
        $price: Number(price ?? 0),
        $title: String(title || ''),
        $description: String(description || ''),
        $updated_at: Date.now()
      },
      this.dbname
    );
  }

  async updateSummaryCategory(nft_id, price, category = STORE_CATEGORIES.OTHER) {
    await this.app.storage.runDatabase(
      `UPDATE summary
			 SET category = $category,
			     updated_at = $updated_at
			 WHERE nft_id = $nft_id AND price = $price`,
      {
        $nft_id: nft_id,
        $price: Number(price ?? 0),
        $category: String(category || STORE_CATEGORIES.OTHER),
        $updated_at: Date.now()
      },
      this.dbname
    );
  }

  // --- orders ---

  async insertOrder(order) {
    await this.app.storage.runDatabase(
      `INSERT INTO orders (
			  order_tx_sig, buyer, nft_id, price, quantity,
			  payment_tx_sig, payment_output_index, payment_amount, utxo_slip,
			  access_hash, access_script, p2sh_address,
			  block_id_received, block_hash_received, transaction_id_received, longest_chain_received,
			  settlement_tx_sig,
			  block_id_fulfilled, block_hash_fulfilled, transaction_id_fulfilled, longest_chain_fulfilled,
			  attempts, status,
			  created_at, updated_at
			) VALUES (
			  $order_tx_sig, $buyer, $nft_id, $price, $quantity,
			  $payment_tx_sig, $payment_output_index, $payment_amount, $utxo_slip,
			  $access_hash, $access_script, $p2sh_address,
			  $block_id_received, $block_hash_received, $transaction_id_received, $longest_chain_received,
			  $settlement_tx_sig,
			  $block_id_fulfilled, $block_hash_fulfilled, $transaction_id_fulfilled, $longest_chain_fulfilled,
			  $attempts, $status,
			  $created_at, $updated_at
			)`,
      order,
      this.dbname
    );
  }

  async updateOrder(order_id, fields = {}, now = Date.now()) {
    const allowed = [
      'settlement_tx_sig',
      'block_id_fulfilled',
      'block_hash_fulfilled',
      'transaction_id_fulfilled',
      'longest_chain_fulfilled',
      'longest_chain_received',
      'attempts',
      'status'
    ];
    const sets = [];
    const params = { $id: Number(order_id), $updated_at: now };

    for (const key of allowed) {
      if (fields[key] === undefined) {
        continue;
      }
      sets.push(`${key} = $${key}`);
      params[`$${key}`] = fields[key];
    }

    if (!sets.length) {
      return;
    }

    sets.push('updated_at = $updated_at');
    await this.app.storage.runDatabase(
      `UPDATE orders SET ${sets.join(', ')} WHERE id = $id`,
      params,
      this.dbname
    );
  }

  async incrementOrderAttempts(order_id, now = Date.now()) {
    await this.app.storage.runDatabase(
      `UPDATE orders SET attempts = attempts + 1, updated_at = $updated_at WHERE id = $id`,
      { $id: Number(order_id), $updated_at: now },
      this.dbname
    );

    const res = await this.app.storage.queryDatabase(
      `SELECT attempts FROM orders WHERE id = $id LIMIT 1`,
      { $id: Number(order_id) },
      this.dbname
    );
    return Number(res?.[0]?.attempts ?? 0);
  }

  async returnOrderByTxSig(order_tx_sig) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM orders WHERE order_tx_sig = $order_tx_sig LIMIT 1`,
      { $order_tx_sig: order_tx_sig },
      this.dbname
    );
    return res?.[0] || null;
  }

  async returnOrderBySettlementSig(settlement_tx_sig) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM orders WHERE settlement_tx_sig = $settlement_tx_sig LIMIT 1`,
      { $settlement_tx_sig: settlement_tx_sig },
      this.dbname
    );
    return res?.[0] || null;
  }

  async returnListingsWithSettlementPending() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE block_id_sold = $block_id_sold
				   AND longest_chain_sold = 0`,
        { $block_id_sold: LISTING_SETTLEMENT_PENDING_BLOCK_ID },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnSettlingOrders() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM orders
				 WHERE status = 'settling'
				   AND settlement_tx_sig != ''`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnPendingOrders() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM orders
				 WHERE status IN ('pending', 'settling')
				   AND longest_chain_received = 1
				 ORDER BY id ASC`,
        {},
        this.dbname
      );
    } catch (err) {
      console.log('Store Database: returnPendingOrders failed', err?.message);
      return [];
    }
  }

  async returnOrphanedSettlingOrders() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM orders
				 WHERE status = 'settling'
				   AND longest_chain_received = 1
				   AND block_id_fulfilled > 0
				   AND longest_chain_fulfilled = 0`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnOrphanedFulfilledOrders() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM orders
				 WHERE status = 'fulfilled'
				   AND longest_chain_received = 1
				   AND block_id_fulfilled > 0
				   AND longest_chain_fulfilled = 0`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async updateOrdersReceivedChainState(block_id, block_hash, longest_chain) {
    await this.app.storage.runDatabase(
      `UPDATE orders SET longest_chain_received = $longest_chain, updated_at = $updated_at
			 WHERE block_id_received = $block_id AND block_hash_received = $block_hash`,
      {
        $block_id: Number(block_id) || 0,
        $block_hash: String(block_hash || ''),
        $longest_chain: longest_chain ? 1 : 0,
        $updated_at: Date.now()
      },
      this.dbname
    );
  }

  async updateOrdersFulfilledChainState(block_id, block_hash, longest_chain) {
    await this.app.storage.runDatabase(
      `UPDATE orders SET longest_chain_fulfilled = $longest_chain, updated_at = $updated_at
			 WHERE block_id_fulfilled = $block_id AND block_hash_fulfilled = $block_hash`,
      {
        $block_id: Number(block_id) || 0,
        $block_hash: String(block_hash || ''),
        $longest_chain: longest_chain ? 1 : 0,
        $updated_at: Date.now()
      },
      this.dbname
    );
  }
}

module.exports = Database;
module.exports.LISTING_SETTLEMENT_PENDING_BLOCK_ID = LISTING_SETTLEMENT_PENDING_BLOCK_ID;
