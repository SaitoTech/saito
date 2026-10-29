/** Listing identity: one row per block inclusion of a list-asset transaction. */
const LISTINGS_INCLUSION_INDEX = 'listings_signature_block_hash_uidx';
const LISTINGS_MIGRATION_TABLE = 'listings_inclusion_migration';
/** Order identity: one row per block inclusion of a purchase transaction. */
const ORDERS_INCLUSION_INDEX = 'orders_order_tx_sig_block_hash_uidx';
const ORDERS_PAYMENT_INCLUSION_INDEX = 'orders_payment_utxo_block_hash_uidx';
const { STORE_CATEGORIES } = require('./categories');
const { classifyWeb3Proceeds, web3SaleTicker } = require('./web3-amount');

// Shared across Database instances using the same SQLite connection.
const transactionTails = new WeakMap();

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

/** Quote only when needed, so a rebuilt table's stored DDL matches the definition. */
function columnIdentifier(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name)) ? String(name) : quoteIdentifier(name);
}

class Database {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  get dbname() {
    return this.mod.dbname;
  }

  async ensureSchema() {
    await this.ensureBaseTables();

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
      'ALTER TABLE listings ADD COLUMN settlement_pending INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN category TEXT DEFAULT "Other"',
      'ALTER TABLE listings ADD COLUMN note TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listings ADD COLUMN buyer TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listings ADD COLUMN quantity_sold INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN sold_at INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN approved INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listings ADD COLUMN risk TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listings ADD COLUMN web3_ticker TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listings ADD COLUMN web3_amount TEXT NOT NULL DEFAULT ""'
    ];
    const summary_columns = [
      'ALTER TABLE summary ADD COLUMN category TEXT DEFAULT "Other"',
      'ALTER TABLE summary ADD COLUMN web3_ticker TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE summary ADD COLUMN web3_amount TEXT NOT NULL DEFAULT ""'
    ];
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
      'ALTER TABLE orders ADD COLUMN longest_chain_received INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE orders ADD COLUMN note TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN settlement_tx TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN inbound_payment_uuid TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE orders ADD COLUMN transfer_uuid TEXT NOT NULL DEFAULT ""'
    ];

    for (const sql of [...listing_columns, ...summary_columns, ...order_columns]) {
      try {
        await this.app.storage.runDatabase(sql, {}, this.dbname);
      } catch (err) {
        // column already exists
      }
    }

    await this.migrateListingChainFields();
    await this.migrateListingInclusionUniqueness();
    await this.ensureListingSales();
    await this.ensureStoreWithdrawals();
    await this.ensureOrderRefunds();
    await this.migrateOrderChainFields();
    await this.migrateOrderCryptoFieldNames();
    await this.migrateOrderInclusionUniqueness();
  }

  async ensureOrderRefunds() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      return;
    }
    const statements = this.returnSchemaStatements('order_refunds.sql');
    for (const sql of statements) {
      await db.exec(sql);
    }
  }

  async ensureStoreWithdrawals() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      return;
    }
    const statements = this.returnSchemaStatements('withdrawals.sql');
    for (const sql of statements) {
      await db.exec(sql);
    }
  }

  async ensureBaseTables() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table'");
    const existing = new Set(tables.map((table) => table.name));
    const fs = this.app.storage.returnFileSystem();

    // Installation metadata can survive a missing or incomplete database.
    // Only create absent tables: existing tables need their column migrations
    // before the current schema's indexes can safely reference those columns.
    for (const table of ['listings', 'summary', 'orders']) {
      if (!existing.has(table)) {
        const sql = fs.readFileSync(`${__dirname}/../sql/${table}.sql`, 'utf8');
        await db.exec(sql);
      }
    }
  }

  /**
   * Sale inclusions: one row per (listing inclusion, fulfillment block).
   * Backfill from listing rows that still have a real sale hash. Rows whose
   * sale identity was wiped to empty are not guessed here. A later confirmation
   * or wind recovery rebuilds them by matching fulfillment inputs to slips.
   * block_id_sold = -1 was the local pending sentinel, not a block.
   */
  async ensureListingSales() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      return;
    }

    const statements = this.returnSchemaStatements('listing_sales.sql');
    for (const sql of statements) {
      await db.exec(sql);
    }

    const sale_columns = [
      'ALTER TABLE listing_sales ADD COLUMN seller TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN web3_ticker TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN web3_amount TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN web3_payment_withdrawal_processed INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listing_sales ADD COLUMN web3_payment_withdrawal_address TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN web3_payment_withdrawal_publickey TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN web3_payment_withdrawal_request TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN web3_payment_withdrawal_created_at INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE listing_sales ADD COLUMN web3_payment_withdrawal_mixin_uuid TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN inbound_payment_uuid TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE listing_sales ADD COLUMN transfer_uuid TEXT NOT NULL DEFAULT ""'
    ];
    for (const sql of sale_columns) {
      try {
        await db.exec(sql);
      } catch (err) {
        // column already exists
      }
    }

    await db.exec(
      `INSERT OR IGNORE INTO listing_sales (
				  signature, block_hash_listed,
				  block_id_sold, block_hash_sold, transaction_id_sold, longest_chain_sold,
				  buyer, note, quantity_sold, sold_at, created_at, updated_at
				)
				SELECT signature, block_hash_listed,
				       block_id_sold, block_hash_sold, transaction_id_sold, longest_chain_sold,
				       buyer, note, quantity_sold, sold_at, created_at, updated_at
				  FROM listings
				 WHERE block_id_sold > 0 AND block_hash_sold != ''`
    );

    // Sale rows created before the web3 snapshot existed still point at a listing.
    // Copy that listing's seller and, only when it has a web3 ticker, its price.
    await db.run(
      `UPDATE listing_sales
			 SET seller = CASE
			       WHEN listing_sales.seller = '' THEN IFNULL((
			         SELECT listings.seller FROM listings
			          WHERE listings.signature = listing_sales.signature
			            AND listings.block_hash_listed = listing_sales.block_hash_listed
			          LIMIT 1
			       ), '')
			       ELSE listing_sales.seller
			     END,
			     web3_ticker = CASE
			       WHEN listing_sales.web3_ticker = '' THEN IFNULL((
			         SELECT UPPER(TRIM(listings.web3_ticker)) FROM listings
			          WHERE listings.signature = listing_sales.signature
			            AND listings.block_hash_listed = listing_sales.block_hash_listed
			            AND TRIM(listings.web3_ticker) != ''
			            AND UPPER(TRIM(listings.web3_ticker)) != 'SAITO'
			          LIMIT 1
			       ), '')
			       ELSE listing_sales.web3_ticker
			     END,
			     web3_amount = CASE
			       WHEN listing_sales.web3_amount = '' THEN IFNULL((
			         SELECT TRIM(listings.web3_amount) FROM listings
			          WHERE listings.signature = listing_sales.signature
			            AND listings.block_hash_listed = listing_sales.block_hash_listed
			            AND TRIM(listings.web3_ticker) != ''
			            AND UPPER(TRIM(listings.web3_ticker)) != 'SAITO'
			          LIMIT 1
			       ), '')
			       ELSE listing_sales.web3_amount
			     END`
    );

    await db.run(
      `UPDATE listings
				  SET settlement_pending = 1,
				      block_id_sold = 0,
				      longest_chain_sold = 0,
				      updated_at = $updated_at
				WHERE block_id_sold = -1`,
      { $updated_at: Date.now() }
    );
  }

  returnSchemaStatements(filename) {
    const fs = this.app.storage.returnFileSystem();
    if (!fs?.readFileSync) {
      throw new Error('filesystem unavailable');
    }
    return fs
      .readFileSync(`${__dirname}/../sql/${filename}`, 'utf8')
      .split(';')
      .map((statement) => statement.replace(/^(?:\s*--[^\n]*)+/, '').trim())
      .filter(Boolean);
  }

  /**
   * Move live databases from order identity by signature alone to identity by
   * (order_tx_sig, block_hash_received). Both legacy constraints are standalone
   * indexes rather than inline column constraints, so they can be dropped in place
   * without rebuilding the table. Existing rows hold at most one inclusion per
   * signature, so the copy cannot violate either composite key.
   */
  async migrateOrderInclusionUniqueness() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      return;
    }

    try {
      const legacy = await this.returnLegacyOrderIndexes(db);

      await db.exec('BEGIN IMMEDIATE');
      try {
        for (const index of legacy) {
          await db.exec(`DROP INDEX ${quoteIdentifier(index.name)}`);
        }
        await db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(ORDERS_INCLUSION_INDEX)}
					 ON orders (order_tx_sig, block_hash_received)`
        );
        await db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(ORDERS_PAYMENT_INCLUSION_INDEX)}
					 ON orders (payment_tx_sig, payment_output_index, block_hash_received)`
        );
        await db.exec('COMMIT');
      } catch (err) {
        try {
          await db.exec('ROLLBACK');
        } catch (_) {
          // ignore rollback failure; original error is what matters
        }
        throw err;
      }
    } catch (err) {
      // Leaving the legacy constraints in place keeps the pre-inclusion behaviour
      // (a re-included purchase tx is ignored) rather than stopping the module.
      console.error('Store Database: orders inclusion migration failed', err?.message || err);
    }
  }

  /**
   * Unique order indexes that predate inclusion identity, matched on their columns so
   * a renamed index is still found. Anything already carrying block_hash_received is
   * left alone, which makes the migration idempotent.
   */
  async returnLegacyOrderIndexes(db) {
    const legacy_shapes = [['order_tx_sig'], ['payment_tx_sig', 'payment_output_index']];
    const indexes = await db.all(`PRAGMA index_list('orders')`);
    const found = [];

    for (const index of indexes || []) {
      if (!Number(index.unique)) {
        continue;
      }
      const columns = await db.all(`PRAGMA index_info(${quoteIdentifier(index.name)})`);
      const names = (columns || []).map((column) => column.name);
      const is_legacy = legacy_shapes.some(
        (shape) =>
          shape.length === names.length && shape.every((column, i) => column === names[i])
      );
      if (is_legacy) {
        found.push(index);
      }
    }

    return found;
  }

  /**
   * Move live databases from UNIQUE(signature) to UNIQUE(signature, block_hash_listed).
   * SQLite cannot drop an inline column constraint, so a legacy table is rebuilt in
   * place. Existing rows hold at most one inclusion per signature, so the copy cannot
   * violate the composite key.
   */
  async migrateListingInclusionUniqueness() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      return;
    }

    try {
      const legacy = await this.returnLegacySignatureIndex(db);
      if (legacy && legacy.origin === 'c') {
        await db.exec(`DROP INDEX ${quoteIdentifier(legacy.name)}`);
      } else if (legacy) {
        await this.rebuildListingsWithoutSignatureUnique(db);
      }
      await db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(LISTINGS_INCLUSION_INDEX)}
				 ON listings (signature, block_hash_listed)`
      );
    } catch (err) {
      // Leaving the legacy constraint in place keeps the pre-inclusion behaviour
      // (a re-included listing tx is ignored) rather than stopping the module.
      console.error('Store Database: listings inclusion migration failed', err?.message || err);
    }
  }

  /** The unique index enforcing signature-only listing identity, if one still exists. */
  async returnLegacySignatureIndex(db) {
    const indexes = await db.all(`PRAGMA index_list('listings')`);
    for (const index of indexes || []) {
      if (!Number(index.unique)) {
        continue;
      }
      const columns = await db.all(`PRAGMA index_info(${quoteIdentifier(index.name)})`);
      if (columns.length === 1 && columns[0].name === 'signature') {
        return index;
      }
    }
    return null;
  }

  /**
   * Recreate listings from sql/listings.sql, keeping the rows and any retired column
   * the live table still carries. The definition is replayed verbatim so a migrated
   * database is indistinguishable from a fresh install.
   */
  async rebuildListingsWithoutSignatureUnique(db) {
    const statements = this.returnListingsSchemaStatements();
    if (!statements.some((sql) => /^CREATE\s+TABLE\b/i.test(sql))) {
      throw new Error('sql/listings.sql does not define the listings table');
    }

    const existing = await db.all(`PRAGMA table_info('listings')`);
    if (!existing?.length) {
      throw new Error('listings table is missing');
    }
    const snapshot = quoteIdentifier(LISTINGS_MIGRATION_TABLE);

    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(`DROP TABLE IF EXISTS ${snapshot}`);
      await db.exec(`CREATE TABLE ${snapshot} AS SELECT * FROM listings`);
      await db.exec('DROP TABLE listings');
      for (const sql of statements) {
        await db.exec(sql);
      }

      const rebuilt = await db.all(`PRAGMA table_info('listings')`);
      const rebuilt_names = new Set((rebuilt || []).map((column) => column.name));
      for (const column of existing) {
        if (rebuilt_names.has(column.name)) {
          continue;
        }
        // Column this checkout no longer defines but the live table still carries:
        // re-add it exactly as it was so schema audits see no drift.
        const type = String(column.type || '').trim() || 'TEXT';
        const has_default = column.dflt_value !== null && column.dflt_value !== undefined;
        // ADD COLUMN can only assert NOT NULL when it has a default to backfill with.
        const not_null = Number(column.notnull) === 1 && has_default ? ' NOT NULL' : '';
        const fallback = has_default ? ` DEFAULT ${column.dflt_value}` : '';
        await db.exec(
          `ALTER TABLE listings
					 ADD COLUMN ${columnIdentifier(column.name)} ${type}${not_null}${fallback}`
        );
      }

      const copied = existing.map((column) => quoteIdentifier(column.name)).join(', ');
      await db.exec(`INSERT INTO listings (${copied}) SELECT ${copied} FROM ${snapshot}`);
      await db.exec(`DROP TABLE ${snapshot}`);
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

  returnListingsSchemaStatements() {
    return this.returnSchemaStatements('listings.sql');
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
    const risk =
      row.risk === 'Low' ||
      row.risk === 'Medium' ||
      row.risk === 'High' ||
      row.risk === 'Dangerous'
        ? row.risk
        : '';
    const sql = `INSERT INTO listings (
			  signature, nft_id, seller, category, quantity, price, web3_ticker, web3_amount,
			  access_hash, access_script, p2sh_address, slip_id,
			  block_id_listed, block_hash_listed, transaction_id_listed, longest_chain_listed,
			  block_id_sold, block_hash_sold, transaction_id_sold, longest_chain_sold,
			  settlement_pending, on_chain,
			  utxo_slip1, utxo_slip2, utxo_slip3,
			  created_at, updated_at, risk, approved
			) VALUES (
			  $signature, $nft_id, $seller, $category, $quantity, $price, $web3_ticker, $web3_amount,
			  $access_hash, $access_script, $p2sh_address, $slip_id,
			  $block_id_listed, $block_hash_listed, $transaction_id_listed, $longest_chain_listed,
			  $block_id_sold, $block_hash_sold, $transaction_id_sold, $longest_chain_sold,
			  $settlement_pending, $on_chain,
			  $utxo_slip1, $utxo_slip2, $utxo_slip3,
			  $created_at, $updated_at, $risk, $approved
			)`;
    const params = {
      $signature: row.signature,
      $nft_id: row.nft_id,
      $seller: row.seller || '',
      $category: row.category || STORE_CATEGORIES.OTHER,
      $quantity: Number(row.quantity ?? 1),
      $price: Number(row.price ?? 0),
      $web3_ticker: String(row.web3_ticker || '').trim().toUpperCase(),
      $web3_amount: String(row.web3_amount || '').trim(),
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
      $settlement_pending: Number(row.settlement_pending ?? 0) ? 1 : 0,
      $on_chain: row.on_chain ?? 1,
      $utxo_slip1: row.utxo_slip1 || '',
      $utxo_slip2: row.utxo_slip2 || '',
      $utxo_slip3: row.utxo_slip3 || '',
      $created_at: row.created_at,
      $updated_at: row.updated_at,
      $risk: risk,
      $approved: Number(row.approved ?? 0) || 0
    };

    // Bypass runDatabase so insert failures surface (runDatabase swallows errors).
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      throw new Error('Store database unavailable');
    }
    await db.run(sql, params);
  }

  /** One exact inclusion of a listing transaction. */
  async returnListingBySignatureAndBlockHash(signature, block_hash_listed) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM listings
			 WHERE signature = $signature AND block_hash_listed = $block_hash_listed
			 LIMIT 1`,
      {
        $signature: String(signature || ''),
        $block_hash_listed: String(block_hash_listed || '')
      },
      this.dbname
    );
    return res?.[0] || null;
  }

  /**
   * The inclusion a listing transaction currently has on the longest chain. Inventory
   * operations must use this row: its slips are the ones the chain can still spend.
   */
  async returnCanonicalListingBySignature(signature) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM listings
			 WHERE signature = $signature
			   AND on_chain = 1
			   AND longest_chain_listed = 1
			 ORDER BY block_id_listed DESC, id DESC
			 LIMIT 1`,
      { $signature: String(signature || '') },
      this.dbname
    );
    return res?.[0] || null;
  }

  /**
   * Newest moderation decision for this seller and NFT.
   * 1 = approved, 2 = pending review, -1 = rejected. 0 = none.
   * A partial sale relists the remainder under a new signature; callers use
   * this so that decision follows the NFT instead of the spent transaction.
   */
  async returnLatestNftModeration(nft_id, seller) {
    const id = String(nft_id || '').trim();
    const key = String(seller || '').trim();
    if (!id || !key) {
      return 0;
    }

    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT approved FROM listings
				 WHERE nft_id = $nft_id
				   AND seller = $seller
				   AND approved != 0
				 ORDER BY block_id_listed DESC, id DESC
				 LIMIT 1`,
        { $nft_id: id, $seller: key },
        this.dbname
      );
      const approved = Number(res?.[0]?.approved ?? 0);
      if (approved === 1 || approved === 2 || approved === -1) {
        return approved;
      }
    } catch (err) {
      return 0;
    }
    return 0;
  }

  /** Newest stored inclusion of a listing transaction, on the longest chain or not. */
  async returnLatestListingInclusion(signature) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM listings
			 WHERE signature = $signature
			 ORDER BY block_id_listed DESC, id DESC
			 LIMIT 1`,
      { $signature: String(signature || '') },
      this.dbname
    );
    return res?.[0] || null;
  }

  /**
   * WHERE clause selecting exactly one inclusion of $signature: the given block hash
   * when the caller knows which inclusion it spent, otherwise the canonical row.
   */
  listingInclusionWhere(block_hash_listed = null) {
    if (block_hash_listed === null || block_hash_listed === undefined) {
      return {
        sql: `id = (
					  SELECT id FROM listings
					   WHERE signature = $signature
					     AND on_chain = 1
					     AND longest_chain_listed = 1
					   ORDER BY block_id_listed DESC, id DESC
					   LIMIT 1
					)`,
        params: {}
      };
    }
    return {
      sql: 'signature = $signature AND block_hash_listed = $block_hash_listed',
      params: { $block_hash_listed: String(block_hash_listed) }
    };
  }

  /**
   * Listed on the longest chain, not reserved locally, and no sale inclusion
   * of this listing inclusion is currently canonical.
   */
  availableListingWhere() {
    return `on_chain = 1
				   AND longest_chain_listed = 1
				   AND settlement_pending = 0
				   AND NOT EXISTS (
				     SELECT 1 FROM listing_sales
				      WHERE listing_sales.signature = listings.signature
				        AND listing_sales.block_hash_listed = listings.block_hash_listed
				        AND listing_sales.longest_chain_sold = 1
				   )`;
  }

  /** A sale inclusion of this listing inclusion is on the longest chain. */
  canonicalSaleWhere() {
    return `EXISTS (
				     SELECT 1 FROM listing_sales
				      WHERE listing_sales.signature = listings.signature
				        AND listing_sales.block_hash_listed = listings.block_hash_listed
				        AND listing_sales.longest_chain_sold = 1
				   )`;
  }

  async returnSpendableListingsForBucket(nft_id, price, limit = 1) {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE nft_id = $nft_id AND price = $price
				   AND ${this.availableListingWhere()}
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
				   AND ${this.availableListingWhere()}
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
				 WHERE ${this.availableListingWhere()}
				 ORDER BY created_at ASC`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  /**
   * Inclusions that stored the three output slips. Not filtered by availability:
   * the fulfillment match is the outpoint, including an inclusion whose last
   * sale is currently off the longest chain.
   */
  async returnListingRowsForSpendMatch() {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT signature, block_hash_listed, quantity, nft_id, price,
				        utxo_slip1, utxo_slip2, utxo_slip3
				   FROM listings
				  WHERE utxo_slip1 != ''
				    AND utxo_slip2 != ''
				    AND utxo_slip3 != ''`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async countListingsInBlock(block_id, block_hash) {
    try {
      const rows = await this.app.storage.queryDatabase(
        `SELECT COUNT(*) AS n
				   FROM listings
				  WHERE block_id_listed = $block_id
				    AND block_hash_listed = $block_hash`,
        {
          $block_id: Number(block_id ?? 0),
          $block_hash: String(block_hash ?? '')
        },
        this.dbname
      );
      return Number(rows?.[0]?.n ?? 0);
    } catch (err) {
      return 0;
    }
  }

  async countListingSalesForBlock(block_id, block_hash) {
    try {
      const rows = await this.app.storage.queryDatabase(
        `SELECT COUNT(*) AS n
				   FROM listing_sales
				  WHERE block_id_sold = $block_id
				    AND block_hash_sold = $block_hash`,
        {
          $block_id: Number(block_id ?? 0),
          $block_hash: String(block_hash ?? '')
        },
        this.dbname
      );
      return Number(rows?.[0]?.n ?? 0);
    } catch (err) {
      return 0;
    }
  }

  async revealListingsInBlock(block_id, block_hash) {
    await this.app.storage.runDatabase(
      `UPDATE listings SET longest_chain_listed = 1
			  WHERE block_id_listed = $block_id AND block_hash_listed = $block_hash`,
      {
        $block_id: Number(block_id) || 0,
        $block_hash: String(block_hash || '')
      },
      this.dbname
    );
  }

  /**
   * Record one fulfillment block's sale of a single listing inclusion.
   * A different fulfillment block inserts its own listing_sales row.
   * block_hash_listed is the inclusion whose outpoints were spent. It is required.
   * The columns on listings are a snapshot of this canonical sale, not the reorg key.
   */
  async markListingSold(
    signature,
    {
      block_hash_listed = null,
      sold_block_id = 0,
      sold_block_hash = '',
      sold_transaction_id = 0,
      note = '',
      buyer = '',
      quantity_sold = 0,
      sold_at = 0,
      inbound_payment_uuid = '',
      transfer_uuid = ''
    } = {},
    now = Date.now()
  ) {
    const listed_hash =
      block_hash_listed === null || block_hash_listed === undefined
        ? ''
        : String(block_hash_listed);
    if (!listed_hash) {
      console.warn('Store: refusing to record a sale without the listing inclusion hash', signature);
      return;
    }
    const inclusion = await this.returnListingBySignatureAndBlockHash(signature, listed_hash);
    if (!inclusion) {
      return;
    }

    const sale_hash = String(sold_block_hash || '');
    if (!sale_hash) {
      return;
    }

    const sale_ticker = web3SaleTicker(inclusion.web3_ticker);
    const params = {
      $signature: String(signature || ''),
      $block_hash_listed: String(inclusion.block_hash_listed || ''),
      $block_id_sold: Number(sold_block_id ?? 0),
      $block_hash_sold: sale_hash,
      $transaction_id_sold: Number(sold_transaction_id ?? 0),
      $note: String(note || ''),
      $buyer: String(buyer || ''),
      $quantity_sold: Math.max(0, Number(quantity_sold ?? 0) || 0),
      $sold_at: Number(sold_at || now) || now,
      $created_at: now,
      $updated_at: now,
      $seller: String(inclusion.seller || ''),
      $web3_ticker: sale_ticker,
      $web3_amount: sale_ticker ? String(inclusion.web3_amount || '').trim() : '',
      $inbound_payment_uuid: String(inbound_payment_uuid || '').trim(),
      $transfer_uuid: String(transfer_uuid || '').trim()
    };

    // The confirmed sale is committed before the listing snapshot is updated.
    // A failure in that snapshot must not erase the sale record.
    await this.withImmediateTransaction(async (db) => {
      await db.run(
        `INSERT INTO listing_sales (
					  signature, block_hash_listed,
					  block_id_sold, block_hash_sold, transaction_id_sold, longest_chain_sold,
					  buyer, note, quantity_sold, sold_at, created_at, updated_at,
					  seller, web3_ticker, web3_amount, inbound_payment_uuid, transfer_uuid
					) VALUES (
					  $signature, $block_hash_listed,
					  $block_id_sold, $block_hash_sold, $transaction_id_sold, 1,
					  $buyer, $note, $quantity_sold, $sold_at, $created_at, $updated_at,
					  $seller, $web3_ticker, $web3_amount, $inbound_payment_uuid, $transfer_uuid
					)
					ON CONFLICT(signature, block_hash_listed, block_hash_sold) DO UPDATE SET
					  block_id_sold = excluded.block_id_sold,
					  transaction_id_sold = excluded.transaction_id_sold,
					  longest_chain_sold = 1,
					  buyer = excluded.buyer,
					  note = excluded.note,
					  quantity_sold = excluded.quantity_sold,
					  sold_at = excluded.sold_at,
					  updated_at = excluded.updated_at,
					  seller = excluded.seller,
					  web3_ticker = excluded.web3_ticker,
					  web3_amount = excluded.web3_amount,
					  inbound_payment_uuid = CASE
					    WHEN listing_sales.inbound_payment_uuid = '' THEN excluded.inbound_payment_uuid
					    ELSE listing_sales.inbound_payment_uuid
					  END,
					  transfer_uuid = CASE
					    WHEN listing_sales.transfer_uuid = '' THEN excluded.transfer_uuid
					    ELSE listing_sales.transfer_uuid
					  END`,
        params
      );
    });

    const listingParams = {
      $block_id_sold: params.$block_id_sold,
      $block_hash_sold: params.$block_hash_sold,
      $transaction_id_sold: params.$transaction_id_sold,
      $note: params.$note,
      $buyer: params.$buyer,
      $quantity_sold: params.$quantity_sold,
      $sold_at: params.$sold_at,
      $updated_at: params.$updated_at,
      $signature: params.$signature,
      $block_hash_listed: params.$block_hash_listed
    };
    try {
      const db = await this.app.storage.returnDatabaseByName(this.dbname);
      await db.run(
        `UPDATE listings
				 SET block_id_sold = $block_id_sold,
				     block_hash_sold = $block_hash_sold,
				     transaction_id_sold = $transaction_id_sold,
				     longest_chain_sold = 1,
				     settlement_pending = 0,
				     note = $note,
				     buyer = $buyer,
				     quantity_sold = $quantity_sold,
				     sold_at = $sold_at,
				     updated_at = $updated_at
				 WHERE signature = $signature AND block_hash_listed = $block_hash_listed`,
        listingParams
      );
    } catch (err) {
      console.error('Store: listing update failed after the sale was recorded', {
        signature: params.$signature,
        block_hash_listed: params.$block_hash_listed,
        block_hash_sold: params.$block_hash_sold,
        transaction_id_sold: params.$transaction_id_sold,
        error: err?.message || String(err)
      });
      return { sale_recorded: true, listing_updated: false, listing_error: err };
    }
    return { sale_recorded: true, listing_updated: true };
  }

  /**
   * Unprocessed web3 sales for one seller, split by the withdrawal wait.
   * Eligible sales are on the longest chain and at least waitBlocks after
   * block_id_sold. Every other unprocessed sale stays pending.
   */
  async returnWeb3WithdrawalBalances(seller = '', latestBlockId = null, waitBlocks = 0) {
    const key = String(seller || '').trim();
    if (!key) {
      return { pending: {}, eligible: {} };
    }
    let rows = [];
    try {
      rows = await this.app.storage.queryDatabase(
        `SELECT web3_ticker, web3_amount, quantity_sold, block_id_sold, longest_chain_sold
				 FROM listing_sales
				 WHERE seller = $seller
				   AND web3_payment_withdrawal_processed = 0
				   AND TRIM(web3_ticker) != ''
				   AND UPPER(TRIM(web3_ticker)) != 'SAITO'`,
        { $seller: key },
        this.dbname
      );
    } catch (err) {
      return { pending: {}, eligible: {} };
    }
    return classifyWeb3Proceeds(rows, latestBlockId, waitBlocks);
  }

  /**
   * Local reservation so the queue does not build a second fulfillment before
   * the first one is in a block. Does not write sale identity or chain flags.
   * Matches an inclusion that is listed and not canonically sold, including one
   * whose last sale block is currently off-chain.
   */
  async markListingSettlementPending(signature, block_hash_listed = null, now = Date.now()) {
    const inclusion = this.listingInclusionWhere(block_hash_listed);
    await this.app.storage.runDatabase(
      `UPDATE listings
			 SET settlement_pending = 1,
			     updated_at = $updated_at
			 WHERE ${inclusion.sql}
			   AND longest_chain_listed = 1
			   AND settlement_pending = 0
			   AND NOT EXISTS (
			     SELECT 1 FROM listing_sales
			      WHERE listing_sales.signature = listings.signature
			        AND listing_sales.block_hash_listed = listings.block_hash_listed
			        AND listing_sales.longest_chain_sold = 1
			   )`,
      {
        ...inclusion.params,
        $signature: signature,
        $updated_at: now
      },
      this.dbname
    );
  }

  /**
   * Drop the local reservation. block_hash_listed narrows it when the caller
   * knows the inclusion. Sale identity is left untouched.
   */
  async clearListingSettlementPending(signature, block_hash_listed = null, now = Date.now()) {
    const params = {
      $signature: signature,
      $updated_at: now
    };
    let inclusion_sql = '';
    if (block_hash_listed !== null && block_hash_listed !== undefined) {
      inclusion_sql = ' AND block_hash_listed = $block_hash_listed';
      params.$block_hash_listed = String(block_hash_listed);
    }
    await this.app.storage.runDatabase(
      `UPDATE listings
			 SET settlement_pending = 0,
			     updated_at = $updated_at
			 WHERE signature = $signature
			   AND settlement_pending = 1${inclusion_sql}`,
      params,
      this.dbname
    );
  }

  async sumListingQuantityForBucket(nft_id, price) {
    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT COALESCE(SUM(quantity), 0) AS total_quantity
				 FROM listings
				 WHERE nft_id = $nft_id AND price = $price
				   AND ${this.availableListingWhere()}`,
        { $nft_id: nft_id, $price: Number(price) },
        this.dbname
      );
      return Number(res?.[0]?.total_quantity ?? 0);
    } catch (err) {
      return 0;
    }
  }

  // Non-reentrant: transaction callbacks must use db directly, not this helper.
  async withImmediateTransaction(fn) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      throw new Error('Store database unavailable');
    }
    const previous = transactionTails.get(db) || Promise.resolve();
    const operation = previous.then(async () => {
      // If BEGIN fails, do not roll back another caller's transaction.
      await db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(db);
        await db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          await db.exec('ROLLBACK');
        } catch (rollbackError) {
          console.error('Store Database: rollback failed', rollbackError);
        }
        throw err;
      }
    });

    // Recover the queue after failure while preserving rejection for the caller.
    transactionTails.set(
      db,
      operation.then(
        () => undefined,
        () => undefined
      )
    );
    return operation;
  }

  /**
   * Reorg one block. Unwind hides remainder inclusions before the consumed
   * listing can become available. Wind marks the sale canonical before the
   * remainder inclusion becomes visible. Sale identity columns are not cleared.
   */
  async applyListingChainReorganization(block_id, block_hash, longest_chain, reveal_listings = true) {
    const on_lc = !!longest_chain;
    const id = Number(block_id) || 0;
    const hash = String(block_hash || '');
    const now = Date.now();
    const chain = { $block_id: id, $block_hash: hash };
    const params = { ...chain, $updated_at: now };

    await this.withImmediateTransaction(async (db) => {
      if (!on_lc) {
        await db.run(
          `UPDATE listings SET longest_chain_listed = 0
					 WHERE block_id_listed = $block_id AND block_hash_listed = $block_hash`,
          chain
        );
        await db.run(
          `UPDATE listing_sales
					 SET longest_chain_sold = 0, updated_at = $updated_at
					 WHERE block_id_sold = $block_id AND block_hash_sold = $block_hash`,
          params
        );
      } else {
        await db.run(
          `UPDATE listing_sales
					 SET longest_chain_sold = 1, updated_at = $updated_at
					 WHERE block_id_sold = $block_id AND block_hash_sold = $block_hash`,
          params
        );
      }
      await this.refreshSaleSnapshots(db, params);
      if (on_lc && reveal_listings) {
        await db.run(
          `UPDATE listings SET longest_chain_listed = 1
					 WHERE block_id_listed = $block_id AND block_hash_listed = $block_hash`,
          chain
        );
      }
    });
  }

  /**
   * Copy the canonical sale onto the listing snapshot when one exists.
   * When none does, keep the last sale identity, clear longest_chain_sold, and
   * set longest_chain_listed = -1 so the spent inclusion is not offered again.
   */
  async refreshSaleSnapshots(db, params) {
    await db.run(
      `UPDATE listings
			 SET block_id_sold = (
			       SELECT s.block_id_sold FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     block_hash_sold = (
			       SELECT s.block_hash_sold FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     transaction_id_sold = (
			       SELECT s.transaction_id_sold FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     longest_chain_sold = 1,
			     buyer = (
			       SELECT s.buyer FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     note = (
			       SELECT s.note FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     quantity_sold = (
			       SELECT s.quantity_sold FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     sold_at = (
			       SELECT s.sold_at FROM listing_sales s
			        WHERE s.signature = listings.signature
			          AND s.block_hash_listed = listings.block_hash_listed
			          AND s.longest_chain_sold = 1
			        ORDER BY s.block_id_sold DESC, s.id DESC
			        LIMIT 1
			     ),
			     updated_at = $updated_at
			 WHERE EXISTS (
			   SELECT 1 FROM listing_sales touched
			    WHERE touched.signature = listings.signature
			      AND touched.block_hash_listed = listings.block_hash_listed
			      AND touched.block_id_sold = $block_id
			      AND touched.block_hash_sold = $block_hash
			 )
			 AND EXISTS (
			   SELECT 1 FROM listing_sales canonical
			    WHERE canonical.signature = listings.signature
			      AND canonical.block_hash_listed = listings.block_hash_listed
			      AND canonical.longest_chain_sold = 1
			 )`,
      params
    );

    await db.run(
      `UPDATE listings
			 SET longest_chain_sold = 0,
			     longest_chain_listed = -1,
			     updated_at = $updated_at
			 WHERE EXISTS (
			   SELECT 1 FROM listing_sales touched
			    WHERE touched.signature = listings.signature
			      AND touched.block_hash_listed = listings.block_hash_listed
			      AND touched.block_id_sold = $block_id
			      AND touched.block_hash_sold = $block_hash
			 )
			 AND NOT EXISTS (
			   SELECT 1 FROM listing_sales canonical
			    WHERE canonical.signature = listings.signature
			      AND canonical.block_hash_listed = listings.block_hash_listed
			      AND canonical.longest_chain_sold = 1
			 )`,
      params
    );
  }

  async returnListingSalesForBlock(block_id, block_hash) {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listing_sales
				 WHERE block_id_sold = $block_id AND block_hash_sold = $block_hash`,
        {
          $block_id: Number(block_id) || 0,
          $block_hash: String(block_hash || '')
        },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnBucketsAffectedByBlock(block_id, block_hash) {
    try {
      return await this.app.storage.queryDatabase(
        `SELECT DISTINCT nft_id, price FROM listings
				 WHERE (block_id_listed = $block_id AND block_hash_listed = $block_hash)
				    OR EXISTS (
				      SELECT 1 FROM listing_sales s
				       WHERE s.signature = listings.signature
				         AND s.block_hash_listed = listings.block_hash_listed
				         AND s.block_id_sold = $block_id
				         AND s.block_hash_sold = $block_hash
				    )`,
        {
          $block_id: Number(block_id) || 0,
          $block_hash: String(block_hash || '')
        },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  // An NFT filter selects the cheapest available listing, oldest first on ties.
  async returnActiveListingsForSeller(seller = '', nft_id = '') {
    const key = String(seller || '').trim();
    if (!key) {
      return [];
    }
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE seller = $seller
				   AND ${this.availableListingWhere()}
				   ${nft_id ? 'AND nft_id = $nft_id AND quantity > 0' : ''}
				 ORDER BY ${nft_id ? 'price ASC, created_at ASC, id ASC LIMIT 1' : 'created_at DESC'}`,
        nft_id ? { $seller: key, $nft_id: nft_id } : { $seller: key },
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  sellerListingWhere(status = 'active') {
    if (status === 'sold') {
      // Exclude seller-initiated delists (buyer set to seller as a self-sale).
      // Buyer is the snapshot of the canonical sale, refreshed with that sale.
      return `on_chain = 1
				   AND longest_chain_listed = 1
				   AND ${this.canonicalSaleWhere()}
				   AND buyer != ''
				   AND buyer != seller`;
    }
    return this.availableListingWhere();
  }

  async countPendingModerationListings() {
    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT COUNT(*) AS total FROM listings
				 WHERE ${this.sellerListingWhere('active')}
				   AND approved = 2`,
        {},
        this.dbname
      );
      return Number(res?.[0]?.total ?? 0) || 0;
    } catch (err) {
      return 0;
    }
  }

  moderationSortClause(sort = 'created_at', direction = 'desc') {
    const columns = {
      seller: 'listings.seller',
      title: "COALESCE(summary.title, '')",
      price: 'listings.price',
      created_at: 'listings.created_at',
      listed: 'listings.created_at',
      risk: `CASE listings.risk
			  WHEN 'Dangerous' THEN 4
			  WHEN 'High' THEN 3
			  WHEN 'Medium' THEN 2
			  WHEN 'Low' THEN 1
			  ELSE 0
			END`
    };
    const column = columns[String(sort || '').trim()] || columns.created_at;
    const dir = String(direction || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    return `${column} ${dir}, listings.signature ASC`;
  }

  async returnPendingModerationPage({
    offset = 0,
    page_size = 24,
    sort = 'created_at',
    direction = 'desc'
  } = {}) {
    const params = {
      $limit: Math.max(1, Number(page_size) || 24),
      $offset: Math.max(0, Number(offset) || 0)
    };
    const order = this.moderationSortClause(sort, direction);
    try {
      return await this.app.storage.queryDatabase(
        `SELECT listings.* FROM listings
				 LEFT JOIN summary
				   ON summary.nft_id = listings.nft_id
				  AND summary.price = listings.price
				 WHERE ${this.sellerListingWhere('active')}
				   AND listings.approved = 2
				 ORDER BY ${order}
				 LIMIT $limit OFFSET $offset`,
        params,
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  /**
   * Moderator action: 2 → 1 (approve) or 2 → -1 (reject).
   * No-op / fail if the row is no longer pending.
   * Decided on the canonical inclusion but written to every inclusion of the same
   * transaction, so the decision survives a reorg back onto another inclusion.
   */
  async moderatePendingListing(signature, action = '') {
    const sig = String(signature || '').trim();
    const next = String(action || '').toLowerCase() === 'reject' ? -1 : 1;
    if (!sig) {
      return { ok: false, err: 'Listing signature required' };
    }

    const row = await this.returnCanonicalListingBySignature(sig);
    if (!row) {
      return { ok: false, err: 'Listing not found' };
    }
    if (Number(row.approved ?? 0) !== 2) {
      return {
        ok: false,
        err: 'No longer pending',
        approved: Number(row.approved ?? 0)
      };
    }

    await this.app.storage.runDatabase(
      `UPDATE listings SET approved = $approved
			 WHERE signature = $signature AND approved = 2`,
      { $signature: sig, $approved: next },
      this.dbname
    );

    const updated = await this.returnCanonicalListingBySignature(sig);
    const approved = Number(updated?.approved ?? 0);
    if (approved !== next) {
      return {
        ok: false,
        err: 'No longer pending',
        approved
      };
    }
    return { ok: true, approved };
  }

  /**
   * Main Store eligibility: active listing AND (seller IN whitelist OR approved = 1).
   * Empty whitelist is valid — approved listings still qualify.
   */
  marketplaceEligibilityClause(whitelist_sellers = []) {
    const keys = [
      ...new Set(
        (Array.isArray(whitelist_sellers) ? whitelist_sellers : [])
          .map((key) => String(key || '').trim())
          .filter(Boolean)
      )
    ];
    const params = {};
    if (!keys.length) {
      return { sql: 'approved = 1', params };
    }

    const placeholders = keys.map((key, i) => {
      const name = `$seller_${i}`;
      params[name] = key;
      return name;
    });
    return {
      sql: `(seller IN (${placeholders.join(', ')}) OR approved = 1)`,
      params
    };
  }

  async setListingApproved(signature, approved) {
    const sig = String(signature || '').trim();
    if (!sig) {
      return false;
    }
    const flag = approved ? 1 : 0;
    await this.app.storage.runDatabase(
      `UPDATE listings SET approved = $approved WHERE signature = $signature`,
      { $signature: sig, $approved: flag },
      this.dbname
    );
    const row = await this.returnCanonicalListingBySignature(sig);
    return Number(row?.approved ?? 0) === flag;
  }

  /**
   * Seller submission: 0 → 2, -1 → 2. Already pending/approved is a no-op.
   * Never writes 1 or -1.
   */
  async submitListingForMainStore(signature) {
    const sig = String(signature || '').trim();
    if (!sig) {
      return { ok: false, err: 'Listing signature required' };
    }

    const row = await this.returnCanonicalListingBySignature(sig);
    if (!row) {
      return { ok: false, err: 'Listing not found' };
    }

    const current = Number(row.approved ?? 0);
    if (current === 1 || current === 2) {
      return { ok: true, approved: current, unchanged: true };
    }
    if (current !== 0 && current !== -1) {
      return { ok: false, err: 'Unable to submit listing' };
    }

    await this.app.storage.runDatabase(
      `UPDATE listings SET approved = 2 WHERE signature = $signature AND approved IN (0, -1)`,
      { $signature: sig },
      this.dbname
    );

    const updated = await this.returnCanonicalListingBySignature(sig);
    const next = Number(updated?.approved ?? 0);
    if (next === 2) {
      return { ok: true, approved: 2 };
    }
    if (next === 1) {
      return { ok: true, approved: 1, unchanged: true };
    }
    return { ok: false, err: 'Unable to submit listing' };
  }

  async countMarketplaceListings({ whitelist_sellers = [], category = '' } = {}) {
    const filter = String(category || '').trim();
    const eligibility = this.marketplaceEligibilityClause(whitelist_sellers);
    const params = { ...eligibility.params };
    let category_sql = '';
    if (filter) {
      category_sql = ' AND category = $category';
      params.$category = filter;
    }
    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT COUNT(*) AS total FROM listings
				 WHERE ${this.sellerListingWhere('active')}
				   AND ${eligibility.sql}${category_sql}`,
        params,
        this.dbname
      );
      return Number(res?.[0]?.total ?? 0) || 0;
    } catch (err) {
      return 0;
    }
  }

  async returnMarketplaceListingsPage({
    whitelist_sellers = [],
    category = '',
    offset = 0,
    page_size = 24
  } = {}) {
    const filter = String(category || '').trim();
    const eligibility = this.marketplaceEligibilityClause(whitelist_sellers);
    const params = {
      ...eligibility.params,
      $limit: Math.max(1, Number(page_size) || 24),
      $offset: Math.max(0, Number(offset) || 0)
    };
    let category_sql = '';
    if (filter) {
      category_sql = ' AND category = $category';
      params.$category = filter;
    }
    try {
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE ${this.sellerListingWhere('active')}
				   AND ${eligibility.sql}${category_sql}
				 ORDER BY CASE WHEN updated_at > 0 THEN updated_at ELSE created_at END DESC, signature ASC
				 LIMIT $limit OFFSET $offset`,
        params,
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async countListingsForSeller({ seller = '', status = 'active', category = '' } = {}) {
    const key = String(seller || '').trim();
    if (!key) {
      return 0;
    }
    const filter = String(category || '').trim();
    const params = { $seller: key };
    let category_sql = '';
    if (filter) {
      category_sql = ' AND category = $category';
      params.$category = filter;
    }
    try {
      const res = await this.app.storage.queryDatabase(
        `SELECT COUNT(*) AS total FROM listings
				 WHERE seller = $seller
				   AND ${this.sellerListingWhere(status)}${category_sql}`,
        params,
        this.dbname
      );
      return Number(res?.[0]?.total ?? 0) || 0;
    } catch (err) {
      return 0;
    }
  }

  async returnListingsPageForSeller({
    seller = '',
    status = 'active',
    category = '',
    offset = 0,
    page_size = 24
  } = {}) {
    const key = String(seller || '').trim();
    if (!key) {
      return [];
    }
    const filter = String(category || '').trim();
    const params = {
      $seller: key,
      $limit: Math.max(1, Number(page_size) || 24),
      $offset: Math.max(0, Number(offset) || 0)
    };
    let category_sql = '';
    if (filter) {
      category_sql = ' AND category = $category';
      params.$category = filter;
    }
    try {
      const order_sql =
        status === 'sold'
          ? 'CASE WHEN sold_at > 0 THEN sold_at ELSE updated_at END DESC, block_id_sold DESC, signature ASC'
          : 'created_at DESC, signature ASC';
      return await this.app.storage.queryDatabase(
        `SELECT * FROM listings
				 WHERE seller = $seller
				   AND ${this.sellerListingWhere(status)}${category_sql}
				 ORDER BY ${order_sql}
				 LIMIT $limit OFFSET $offset`,
        params,
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
				   AND ${this.sellerListingWhere('sold')}
				 ORDER BY CASE WHEN sold_at > 0 THEN sold_at ELSE updated_at END DESC, block_id_sold DESC, signature ASC`,
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
				 WHERE ${this.availableListingWhere()}
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
			  nft_id, price, web3_ticker, web3_amount, category, title, description, image,
			  quantity_available, updated_at
			) VALUES (
			  $nft_id, $price, $web3_ticker, $web3_amount, $category, $title, $description, $image,
			  $quantity_available, $updated_at
			)`;
    const params = {
      $nft_id: summary.nft_id,
      $price: Number(summary.price ?? 0),
      $web3_ticker: String(summary.web3_ticker || '').trim().toUpperCase(),
      $web3_amount: String(summary.web3_amount || '').trim(),
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

  async updateSummaryWeb3(nft_id, price, { web3_ticker = '', web3_amount = '' } = {}) {
    await this.app.storage.runDatabase(
      `UPDATE summary
			    SET web3_ticker = $web3_ticker, web3_amount = $web3_amount
			  WHERE nft_id = $nft_id AND price = $price`,
      {
        $nft_id: nft_id,
        $price: Number(price ?? 0),
        $web3_ticker: String(web3_ticker || '').trim().toUpperCase(),
        $web3_amount: String(web3_amount || '').trim()
      },
      this.dbname
    );
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
    // OR IGNORE makes re-delivery of an inclusion already on record an intentional
    // no-op; both unique indexes are inclusion-scoped, so a conflict can only mean
    // this exact (order_tx_sig, block_hash_received) row already exists.
    const res = await this.app.storage.runDatabase(
      `INSERT OR IGNORE INTO orders (
			  order_tx_sig, buyer, nft_id, price, quantity, note,
			  payment_tx_sig, payment_output_index, payment_amount, utxo_slip,
			  inbound_payment_uuid, transfer_uuid,
			  access_hash, access_script, p2sh_address,
			  block_id_received, block_hash_received, transaction_id_received, longest_chain_received,
			  settlement_tx_sig,
			  block_id_fulfilled, block_hash_fulfilled, transaction_id_fulfilled, longest_chain_fulfilled,
			  attempts, status,
			  created_at, updated_at
			) VALUES (
			  $order_tx_sig, $buyer, $nft_id, $price, $quantity, $note,
			  $payment_tx_sig, $payment_output_index, $payment_amount, $utxo_slip,
			  $inbound_payment_uuid, $transfer_uuid,
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
    return Number(res?.changes ?? 0);
  }

  async updateOrder(order_id, fields = {}, now = Date.now()) {
    const allowed = [
      'settlement_tx_sig',
      'settlement_tx',
      'block_id_fulfilled',
      'block_hash_fulfilled',
      'transaction_id_fulfilled',
      'longest_chain_fulfilled',
      'longest_chain_received',
      'attempts',
      'status'
    ];
    const sets = [];
    const id = Number(order_id);
    const params = { $id: id, $updated_at: now };

    for (const key of allowed) {
      if (fields[key] === undefined) {
        continue;
      }
      sets.push(`${key} = $${key}`);
      params[`$${key}`] = fields[key];
    }

    if (!sets.length) {
      return { changes: 0 };
    }

    sets.push('updated_at = $updated_at');
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      throw new OrderUpdateError('Store database unavailable', { orderId: id, kind: 'driver' });
    }
    let result;
    try {
      result = await db.run(`UPDATE orders SET ${sets.join(', ')} WHERE id = $id`, params);
    } catch (err) {
      throw new OrderUpdateError(`Order ${id} update failed`, {
        orderId: id,
        kind: 'driver',
        cause: err
      });
    }
    const changes = Number(result?.changes ?? 0);
    if (changes !== 1) {
      throw new OrderUpdateError(`Order ${id} update affected ${changes} rows`, {
        orderId: id,
        kind: 'row_count',
        changes
      });
    }
    return { changes };
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

  /**
   * The canonical inclusion of a purchase transaction. Prefers the longest-chain row;
   * the block_id tiebreak only matters while a reorg notification is still in flight,
   * where the newest inclusion is the one the chain is converging on.
   */
  async returnOrderByTxSig(order_tx_sig) {
    const res = await this.app.storage.queryDatabase(
      `SELECT * FROM orders
			 WHERE order_tx_sig = $order_tx_sig
			 ORDER BY longest_chain_received DESC, block_id_received DESC, id DESC
			 LIMIT 1`,
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
				 WHERE settlement_pending = 1`,
        {},
        this.dbname
      );
    } catch (err) {
      return [];
    }
  }

  async returnSettlingOrders() {
    try {
      return await this.app.storage.queryDatabase(
        // An orphaned inclusion can be left in 'settling' with a settlement that can
        // never confirm. Excluding it stops it reserving its listing in
        // resetStaleSettlementPendingListings().
        `SELECT * FROM orders
				 WHERE status = 'settling'
				   AND settlement_tx_sig != ''
				   AND longest_chain_received = 1`,
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
        // id ASC keeps the queue first-come-first-served across distinct purchases.
        // The NOT EXISTS clause only bites if two inclusions of one purchase are both
        // flagged longest-chain, which a reorg notification landing before the
        // confirmation insert can cause; the newer inclusion is the correct one.
        `SELECT * FROM orders
				 WHERE status IN ('pending', 'settling')
				   AND longest_chain_received = 1
				   AND NOT EXISTS (
				     SELECT 1 FROM orders newer
				     WHERE newer.order_tx_sig = orders.order_tx_sig
				       AND newer.longest_chain_received = 1
				       AND (newer.block_id_received > orders.block_id_received
				            OR (newer.block_id_received = orders.block_id_received
				                AND newer.id > orders.id))
				   )
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

  async claimRefundIntent(intent = {}) {
    const now = Date.now();
    const paymentSig = String(intent.payment_tx_sig || '').trim();
    const blockHash = String(intent.block_hash_received || '');
    const output = Number(intent.payment_output_index ?? 0);
    if (!paymentSig) {
      throw new Error('Refund intent is missing its payment transaction');
    }
    const orderId = Number(intent.order_id) || 0;
    await this.withImmediateTransaction(async (db) => {
      if (orderId) {
        const existing = await db.all(`SELECT status FROM orders WHERE id = $id`, { $id: orderId });
        if (existing?.[0]?.status === 'fulfilled') {
          throw new Error(`Order ${orderId} is fulfilled and is not refunded automatically`);
        }
        await db.run(
          `UPDATE orders
           SET status = 'unfulfillable', updated_at = $updated_at
           WHERE id = $id AND status IN ('pending', 'settling', 'unfulfillable')`,
          { $id: orderId, $updated_at: now }
        );
      }
      await db.run(
        `INSERT OR IGNORE INTO order_refunds (
           payment_tx_sig, payment_output_index, block_hash_received, block_id_received,
           order_tx_sig, order_id, buyer, refund_publickey, reason,
           utxo_slip, access_script, payment_amount, created_at, updated_at
         ) VALUES (
           $payment_tx_sig, $payment_output_index, $block_hash_received, $block_id_received,
           $order_tx_sig, $order_id, $buyer, $refund_publickey, $reason,
           $utxo_slip, $access_script, $payment_amount, $created_at, $updated_at
         )`,
        {
          $payment_tx_sig: paymentSig,
          $payment_output_index: output,
          $block_hash_received: blockHash,
          $block_id_received: Number(intent.block_id_received) || 0,
          $order_tx_sig: String(intent.order_tx_sig || ''),
          $order_id: orderId || null,
          $buyer: String(intent.buyer || ''),
          $refund_publickey: String(intent.refund_publickey || ''),
          $reason: String(intent.reason || ''),
          $utxo_slip: String(intent.utxo_slip || ''),
          $access_script: String(intent.access_script || ''),
          $payment_amount: Number(intent.payment_amount) || 0,
          $created_at: now,
          $updated_at: now
        }
      );
    });
    return this.returnRefundByPayment(paymentSig, output, blockHash);
  }

  async returnRefundByPayment(paymentSig, outputIndex, blockHash) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    const rows = await db.all(
      `SELECT * FROM order_refunds
       WHERE payment_tx_sig = $payment_tx_sig
         AND payment_output_index = $payment_output_index
         AND block_hash_received = $block_hash_received
       LIMIT 1`,
      {
        $payment_tx_sig: paymentSig,
        $payment_output_index: Number(outputIndex) || 0,
        $block_hash_received: String(blockHash || '')
      }
    );
    return rows?.[0] || null;
  }

  async returnRefundBySignature(signature) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    const rows = await db.all(
      `SELECT * FROM order_refunds WHERE refund_tx_sig = $signature LIMIT 1`,
      { $signature: String(signature || '') }
    );
    return rows?.[0] || null;
  }

  async returnRefundsNeedingAttention() {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    return db.all(
      `SELECT * FROM order_refunds
       WHERE refund_status IN ('', 'prepared', 'submitted', 'uncertain')
          OR (refund_status = 'confirmed' AND longest_chain_refunded = 0)
       ORDER BY id ASC`,
      {}
    );
  }

  async saveRefundTransactionIfEmpty(id, { signature, serialized, preparedAt }) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    const result = await db.run(
      `UPDATE order_refunds
       SET refund_tx_sig = $signature,
           refund_tx = $serialized,
           refund_status = 'prepared',
           refund_prepared_at = $prepared_at,
           updated_at = $prepared_at
       WHERE id = $id AND refund_tx_sig = '' AND refund_status = ''`,
      {
        $id: Number(id),
        $signature: signature,
        $serialized: serialized,
        $prepared_at: preparedAt
      }
    );
    return Number(result?.changes || 0) === 1;
  }

  async markRefundStatus(id, status, { error = '', attempts = null } = {}) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    const sets = ['refund_status = $status', 'last_error = $error', 'updated_at = $updated_at'];
    const params = {
      $id: Number(id),
      $status: status,
      $error: String(error || ''),
      $updated_at: Date.now()
    };
    if (attempts != null) {
      sets.push('refund_broadcast_attempts = $attempts');
      params.$attempts = Number(attempts);
    }
    await db.run(`UPDATE order_refunds SET ${sets.join(', ')} WHERE id = $id`, params);
  }

  async recordRefundInclusion(signature, inclusion) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    const result = await db.run(
      `UPDATE order_refunds
       SET refund_status = 'confirmed',
           block_id_refunded = $block_id,
           block_hash_refunded = $block_hash,
           transaction_id_refunded = $transaction_id,
           longest_chain_refunded = 1,
           last_error = '',
           updated_at = $updated_at
       WHERE refund_tx_sig = $signature`,
      {
        $signature: signature,
        $block_id: Number(inclusion.block_id) || 0,
        $block_hash: String(inclusion.block_hash || ''),
        $transaction_id: Number(inclusion.transaction_id) || 0,
        $updated_at: Date.now()
      }
    );
    return Number(result?.changes || 0);
  }

  async updateRefundChainState(block_id, block_hash, longest_chain) {
    const db = await this.app.storage.returnDatabaseByName(this.dbname);
    if (!db) {
      return;
    }
    if (longest_chain) {
      await db.run(
        `UPDATE order_refunds
         SET longest_chain_refunded = 1, updated_at = $updated_at
         WHERE block_id_refunded = $block_id AND block_hash_refunded = $block_hash
           AND refund_tx_sig != ''`,
        {
          $block_id: Number(block_id) || 0,
          $block_hash: String(block_hash || ''),
          $updated_at: Date.now()
        }
      );
      return;
    }
    await db.run(
      `UPDATE order_refunds
       SET longest_chain_refunded = 0,
           refund_status = CASE WHEN refund_status = 'confirmed' THEN 'uncertain' ELSE refund_status END,
           updated_at = $updated_at
       WHERE block_id_refunded = $block_id AND block_hash_refunded = $block_hash
         AND refund_tx_sig != ''`,
      {
        $block_id: Number(block_id) || 0,
        $block_hash: String(block_hash || ''),
        $updated_at: Date.now()
      }
    );
  }
}

class OrderUpdateError extends Error {
  constructor(message, { orderId = 0, kind = 'driver', cause = null, changes = null } = {}) {
    super(message);
    this.name = 'OrderUpdateError';
    this.orderId = orderId;
    this.kind = kind;
    this.cause = cause;
    this.changes = changes;
  }
}

module.exports = Database;
module.exports.OrderUpdateError = OrderUpdateError;
