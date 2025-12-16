const ModTemplate = require('../../lib/templates/modtemplate');
const saito = require('../../lib/saito/saito');
const JsStore = require('jsstore');
const JSON = require('json-bigint');
const Transaction = require('../../lib/saito/transaction').default;
const PeerService = require('saito-js/lib/peer_service').default;
const ArchiveTemplate = require('./lib/archive.template');
const ArchiveSummary = require('./lib/archive-summary.template');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');
const jsonTree = require('json-tree-viewer');

//
// HOW THE ARCHIVE SAVES TXS
//
// modules call ---> app.storage.saveTransaction()
//    ---> saveTransaction() sends TX to peers via "archive" request="save" transaction
//    ---> peers receive by handlePeerTransaction();
//    ---> peers save to DB
//
// HOW THE ARCHIVE LOADS TXS
//
// modules call ---> app.storage.loadTransactions()
//    ---> loadTransactions() sends TX to peers via "archive" request="save" transaction
//    ---> peers receive by handlePeerTransaction();
//    ---> peers fetch from DB, return via callback or return TX
//

class Archive extends ModTemplate {
	constructor(app) {
		super(app);

		this.name = 'Archive';
		this.slug = 'archive';
		this.description = 'Supports the saving and serving of network transactions';
		this.categories = 'Utilities Core';
		this.class = 'utility';
		this.localDB = null;
		this.opt_out = ['Chat', 'RedSquare', 'Blog']; // Modules that handle their own automated storage

		//
		// if this is set to 1, this archive node will respect ownership
		// specifications provided in the form of access_hash scripts. an
		// example of an application that needs this is the Vault, which
		// manually sets it on init.
		//
		// any read / write / delete requests must pass the access hash
		//
		// if access_hash is 0, the archive node will return all content
		// on request like a normal archive node, not respect ownership
		// limitations like a private archive node that wants to limit
		// usage of privately-uploaded data.
		//
		this.access_hash = 0;
		//this.access_hash = 1; // don't serve txs with access_hash restrictions

		this.schema = [
			'id',
			'user_id',
			'publickey',
			'owner',
			'sig',
			'field1',
			'field2',
			'field3',
			'field4',
			'field5',
			'block_id',
			'block_hash',
			'created_at',
			'updated_at',
			'tx',
			'tx_size',
			'flagged',
			'preserve'
		];
		//
		//
		//
		this.prune_public_ts = 600000000; // about 1 week
		this.prune_private_ts = 450000000; // about 5 days

		//
		// settings saved and loaded from app.options
		//
		this.archive = {
			index_blockchain: 0,
			last_prune: 0
		};

		if (this.app.BROWSER == 0) {
			this.archive.index_blockchain = 1;
		} else {
			this.localDB = new JsStore.Connection(new Worker('/saito/lib/jsstore/jsstore.worker.js'));
		}
	}

	async initialize(app) {
		await super.initialize(app);
		this.load();

		if (app.BROWSER) {
			await this.initInBrowserDatabase();

			//
			// dedicated logic for purges
			//
			// if version is below 5.555, then reset in-browser DB
			//
			if (this.archive?.wallet_version) {
				let wv = this.archive.wallet_version;
				try {
					wv = parseFloat(wv);
				} catch (err) {
					console.error(err);
					wv = 0;
				}
				if (wv <= 5.555) {
					console.warn('PURGING LOCAL DB ', wv);
					await this.localDB.dropDb();
					await this.initInBrowserDatabase();
				}
			}
		} else {
			const path = this.app.storage.returnPath();
			const fs = this.app.storage.returnFileSystem();
			if (fs && path) {
				let data_dir = `${__dirname}/../../data/archive`;
				if (!fs.existsSync(path.normalize(data_dir))) {
					fs.mkdirSync(data_dir);
					console.info('Created directory for archive to store large transactions');
				}
			}
		}

		let now = new Date().getTime();
		//
		// Don't prune more than once a day, but otherwise on connection/spin up
		//
		if (!this.archive?.last_prune || this.archive.last_prune + 24 * 60 * 60 * 1000 < now) {
			this.pruneArchive();
		}

		setInterval(
			() => {
				this.pruneArchive();
			},
			24 * 60 * 60 * 1000 + 5000
		);
	}

	async initInBrowserDatabase() {
		if (!this.app.BROWSER) {
			return;
		}

		//
		// Create Local DB schema
		//
		let archives = {
			name: 'archives',
			columns: {
				id: { primaryKey: true, autoIncrement: true },
				user_id: { dataType: 'number', default: 0 },
				publicKey: { dataType: 'string', default: '' },
				owner: { dataType: 'string', default: '' },
				sig: { dataType: 'string', default: '' },
				field1: { dataType: 'string', default: '' },
				field2: { dataType: 'string', default: '' },
				field3: { dataType: 'string', default: '' },
				field4: { dataType: 'string', default: '' },
				field5: { dataType: 'string', default: '' },
				block_id: { dataType: 'number', default: 0 },
				block_hash: { dataType: 'string', default: '' },
				created_at: { dataType: 'number', default: 0 },
				updated_at: { dataType: 'number', default: 0 },
				tx: { dataType: 'string', default: '' },
				tx_size: { dataType: 'number', default: '' },
				flagged: { dataType: 'number', default: 0 },
				preserve: { dataType: 'number', default: 0 }
			}
		};

		/*
			Ideally one, of the 5 arbitrary fields should be number with an ability to search above/below...
			without changing the db schemas, we will designate field5 as a string coded number 
			(since no apps are using it yet) and pending further flexibility treat its inclusion as a >= search tag
		*/

		let db = {
			name: 'archive_db',
			tables: [archives]
		};

		var isDbCreated = await this.localDB.initDb(db);

		/*if (isDbCreated) {
			console.log('ARCHIVE: Db Created & connection is opened');
		} else {
			console.log('ARCHIVE: Connection is opened');
		}*/
	}

	async render() {
		let ct = 0;
		let mem = 0;
		let ts = Date.now();

		this.app.browser.prependElementToDom(ArchiveSummary(this.app));

		this.app.browser.replaceElementBySelector(`<div class="local-archive-table"></div>`, '.main');
		this.app.browser.addElementToSelector(ArchiveTemplate(this.app, null), '.local-archive-table');

		const cHook = document.getElementById('tx-ct');
		const sHook = document.getElementById('db-size');

		let cont = true;
		while (cont) {
			let rows = await this.loadTransactions({ updated_earlier_than: ts });

			/*let rows = await this.localDB.select({
				from: 'archives',
				order: { by: 'id', type: 'desc' }
			});*/

			for (let row of rows) {
				this.app.browser.addElementToSelector(
					ArchiveTemplate(this.app, row),
					'.local-archive-table'
				);
				mem += row.tx_size;
				ts = Math.min(ts, row.updated_at);
			}

			ct += rows.length;

			cHook.innerHTML = ct;
			sHook.innerHTML = mem;

			//0 rows returned ==> done!
			cont = rows.length;
		}

		siteMessage('Achive fully loaded!');
		this.attachEvents();
	}

	attachEvents() {
		document.querySelectorAll('.archive-button').forEach((tx_handle) => {
			tx_handle.onclick = (e) => {
				let tx_json = e.currentTarget.dataset.tx;

				let tx = new Transaction();
				tx.deserialize_from_web(this.app, tx_json);

				let overlay = new SaitoOverlay(this.app, this);
				overlay.show(`<div class="tx_overlay"></div>`);

				let txmsg = tx.returnMessage();

				//debug info
				let el = document.querySelector('.tx_overlay');

				var tree = jsonTree.create(txmsg, el);
				tree.expand(function (node) {
					return node.label !== 'images';
				});

				if (tx?.optional) {
					let tree2 = jsonTree.create(tx.optional, el);
					tree2.expand();
				}
			};
		});

		document.querySelectorAll('.delete-me').forEach((btn) => {
			btn.onclick = async (e) => {
				let sig = e.currentTarget.dataset.id;

				let row = e.currentTarget.parentElement;

				e.currentTarget.onclick = null;

				let res = await this.deleteTransaction(sig);

				if (res) {
					row.remove();
				}
			};
		});
	}

	returnServices() {
		let services = [];
		if (this.app.BROWSER == 0) {
			services.push(new PeerService(null, 'archive'));
		}
		return services;
	}

	//
	// by default we just save everything that is an application
	//
	async onConfirmation(blk, tx, conf) {
		if (this.app.BROWSER && !tx.isTo(this.publicKey)) {
			return;
		}

		//
		// save all on-chain transactions -- but only the service node...
		//
		if (Number(conf) == 0 && this.archive.index_blockchain == 1) {
			let block_id = Number(blk.id || 0);
			let block_hash = blk?.hash || '';

			// Use the storage function for standard formatting
			let txmsg = tx.returnMessage();

			if (txmsg?.module == 'spam') {
				return;
			}

			setTimeout(async () => {
				let txs = await this.loadTransactions({
					signature: tx.signature
				});
				if (txs?.length > 0) {
					this.updateTransaction(tx, { block_id, block_hash });
				} else {
					this.app.storage.saveTransaction(tx, { block_id, block_hash }, 'localhost');
				}
			}, 10000);
		}
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {
		if (tx == null) {
			return 0;
		}

		let req = tx.returnMessage();

		if (!req?.request || !req?.data) {
			return 0;
		}

		//
		// saves TX containing archive insert instruction
		//
		if (req.request === 'archive') {
			if (req.data.request === 'load') {
				let ts1 = Date.now();

				//
				//Duplicates loadTransactionsWithCallback, but that's fine
				//
				let txs = await this.loadTransactions(req.data);

				if (mycallback) {
					mycallback(txs);
					return 1;
				}
			}

			let newtx = new Transaction();
			newtx.deserialize_from_web(app, req.data.serial_transaction);

			if (req.data.request === 'delete') {
				await this.deleteTransaction(newtx, req.data);
			}
			if (req.data.request === 'multidelete') {
				await this.deleteTransactions(req.data);
			}
			if (req.data.request === 'save') {
				await this.saveTransaction(newtx, req.data);
			}
			if (req.data.request === 'update') {
				await this.updateTransaction(newtx, req.data);
			}

			// archive returns 0 if callback not sent !
			return 0;
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	//////////
	// save //
	//////////
	async saveTransaction(tx, obj = {}) {
		let newObj = {};

		//
		// User_id should be the ID of the User table... for library ownership???
		//
		newObj.user_id = obj?.user_id || 0; //What is this supposed to be

		newObj.publicKey = obj?.publicKey || tx.from[0].publicKey;
		newObj.owner = obj?.owner || '';
		newObj.sig = obj?.signature || tx.signature || obj?.sig;
		//Field1-3 are set by default in app.storage
		newObj.field1 = obj?.field1 || '';
		newObj.field2 = obj?.field2 || '';
		newObj.field3 = obj?.field3 || '';
		newObj.field4 = obj?.field4 || '';
		newObj.field5 = obj?.field5 || '';
		newObj.block_id = obj?.block_id || 0;
		newObj.block_hash = obj?.block_hash || '';
		newObj.flagged = 0;
		newObj.preserve = obj?.preserve || 0;
		newObj.created_at = obj?.created_at || tx.timestamp;
		newObj.updated_at = obj?.updated_at || tx.timestamp;

		// For consistency, also need to store this on saveTransaction
		if (!tx.optional) {
			tx.optional = {};
		}
		tx.optional.updated_at = newObj.updated_at;

		newObj.tx = tx.serialize_to_web(this.app);
		newObj.tx_size = newObj.tx.length;

		if (this.app.BROWSER) {
			let numRows = await this.localDB.insert({
				into: 'archives',
				values: [newObj]
			});

			if (numRows) {
				console.log(
					'Local Archive index successfully inserted: ',
					JSON.parse(JSON.stringify(newObj))
				);
			} else {
				console.log('Local Archive index not inserted...');
			}
		} else {
			//
			// insert index record
			//
			let sql = `INSERT
                  OR IGNORE INTO archives (
                    publickey, 
                    owner, 
                    sig, 
                    field1, 
                    field2, 
                    field3, 
                    field4, 
                    field5, 
                    block_id, 
                    block_hash, 
                    created_at, 
                    updated_at, 
                    tx,
                    tx_size,
                    flagged,
                    preserve
                  ) VALUES (
                  $publickey,
                  $owner,
                  $sig,
                  $field1,
                  $field2,
                  $field3,
                  $field4,
                  $field5,
                  $block_id,
                  $block_hash,
                  $created_at,
                  $updated_at,
                  $tx,
                  $tx_size,
                  $flagged,
                  $preserve
                  )`;
			let params = {
				$publickey: newObj.publicKey,
				$owner: newObj.owner,
				$sig: newObj.sig,
				$field1: newObj.field1,
				$field2: newObj.field2,
				$field3: newObj.field3,
				$field4: newObj.field4,
				$field5: newObj.field5,
				$block_id: newObj.block_id,
				$block_hash: newObj.block_hash,
				$created_at: newObj.created_at,
				$updated_at: newObj.updated_at,
				$tx: newObj.tx,
				$tx_size: newObj.tx_size,
				$flagged: newObj.flagged,
				$preserve: newObj.preserve
			};

			if (newObj.tx_size > 50000) {
				console.log('Save large tx: ', tx.length);
				const fs = this.app?.storage?.returnFileSystem();
				if (fs) {
					let filename = `${__dirname}/../../data/archive/${newObj.sig}`;
					console.log(filename);
					fs.writeFileSync(filename, newObj.tx);
					params['$tx'] = '';
				}
			}

			await this.app.storage.runDatabase(sql, params, 'archive');
		}
	}

	/////////////////////////////////////////////////////
	// update  -- we can update any arbitrary set of the fields (though we usually just update the tx itself)
	/////////////////////////////////////////////////////
	async updateTransaction(tx, obj = {}) {
		//
		// update records
		//
		let newObj = {};

		//
		// signature is the search criteria for the update, but we allow some flexibility
		// (though maybe we shouldn't)
		//
		let tx_to_update = obj?.signature || obj?.sig || tx?.signature || '';

		// fallback in case we didn't provide a timestamp (though should be handled by storage.ts)
		if (!obj.updated_at) {
			obj.updated_at = new Date().getTime();
		}

		// Store the updated_at in the tx.optional
		if (!tx.optional) {
			tx.optional = {};
		}
		tx.optional.updated_at = obj.updated_at;

		newObj.tx = tx.serialize_to_web(this.app);
		newObj.tx_size = newObj.tx.length;

		if (!tx_to_update) {
			console.error('No tx signature for archive update:', tx);
			return 0;
		}

		//
		// update index
		//
		let sql = `UPDATE archives SET tx = $tx, tx_size = $tx_size`;

		let params = {
			$tx: newObj.tx,
			$tx_size: newObj.tx_size,
			$sig: tx_to_update
		};

		//
		// Will set updated_at and any other search meta data fields...
		//
		for (let key in obj) {
			if (key != 'tx') {
				if (this.schema.includes(key)) {
					// Server DB -- SQL
					sql += `, ${key} = $${key}`;
					params[`$${key}`] = obj[key];
					// Browser DB -- JsStore
					newObj[key] = obj[key];
				}
			}
		}

		sql += ` WHERE sig = $sig`;

		if (this.app.BROWSER) {
			let results = await this.localDB.update({
				in: 'archives',
				set: newObj,
				where: {
					sig: tx_to_update
				}
			});
		} else {
			//console.log(sql, params, tx.optional);

			if (newObj.tx_size > 50000) {
				const fs = this.app?.storage?.returnFileSystem();
				if (fs) {
					const filename = `${__dirname}/../../data/archive/${tx_to_update}`;
					fs.writeFileSync(filename, newObj.tx);
					params['$tx'] = '';
				}
			}

			await this.app.storage.runDatabase(sql, params, 'archive');
		}

		return 1;
	}

	//////////
	// load //
	//////////
	async loadTransactionsWithCallback(obj = {}, callback = null) {
		let txs = await this.loadTransactions(obj);
		if (callback) {
			return callback(txs);
		} else {
			return txs;
		}
	}

	async loadTransactions(obj = {}) {
		let limit = 10;
		let timestamp_limiting_clause = '';

		let order_clause = ' ORDER BY archives.id';
		let sort = 'DESC';
		let request_tx = obj.request_tx || null;

		//For JS-Store
		let order_obj = { by: 'id', type: 'desc' };
		let where_obj = {};

		if (obj.created_later_than || obj.hasOwnProperty('created_later_than')) {
			timestamp_limiting_clause += ' AND created_at > ' + parseInt(obj.created_later_than);
			where_obj = {
				created_at: { '>': parseInt(obj.created_later_than) }
			};
			order_clause = ' ORDER BY archives.created_at';
			order_obj.by = 'created_at';
		}
		if (obj.created_earlier_than || obj.hasOwnProperty('created_earlier_than')) {
			timestamp_limiting_clause += ' AND created_at < ' + parseInt(obj.created_earlier_than);
			where_obj = {
				created_at: { '<': parseInt(obj.created_earlier_than) }
			};
			order_clause = ' ORDER BY archives.created_at';
			order_obj.by = 'created_at';
		}
		if (obj.tx_size_greater_than) {
			timestamp_limiting_clause += ' AND tx_size > ' + parseInt(obj.tx_size_greater_than);
			where_obj = {
				tx_size: { '>': parseInt(obj.tx_size_greater_than) }
			};
		}
		if (obj.tx_size_less_than) {
			timestamp_limiting_clause += ' AND tx_size < ' + parseInt(obj.tx_size_less_than);
			where_obj = { tx_size: { '<': parseInt(obj.tx_size_less_than) } };
		}
		if (obj.updated_later_than || obj.hasOwnProperty('updated_later_than')) {
			timestamp_limiting_clause += ' AND updated_at > ' + parseInt(obj.updated_later_than);
			where_obj = {
				updated_at: { '>': parseInt(obj.updated_later_than) }
			};
			order_clause = ' ORDER BY archives.updated_at';
			order_obj.by = 'updated_at';
		}
		if (obj.updated_earlier_than || obj.hasOwnProperty('updated_earlier_than')) {
			timestamp_limiting_clause += ' AND updated_at < ' + parseInt(obj.updated_earlier_than);
			where_obj = {
				updated_at: { '<': parseInt(obj.updated_earlier_than) }
			};
			order_clause = ' ORDER BY archives.updated_at';
			order_obj.by = 'updated_at';
		}
		if (obj.flagged) {
			timestamp_limiting_clause += ' AND flagged = ' + parseInt(obj.flagged);
			where_obj = { flagged: { '=': parseInt(obj.flagged) } };
		}

		if (obj.ascending || obj.hasOwnProperty('ascending')) {
			sort = 'ASC';
			order_obj.type = 'asc';
		}

		//
		// ACCEPT REASONABLE LIMITS -- [10, 100]
		//
		if (obj.limit) {
			limit = Math.max(limit, obj.limit);
			limit = Math.min(limit, 100);
			delete obj.limit;
		}

		if (obj.signature) {
			obj.sig = obj.signature;
			delete obj.signature;
		}

		let param_count = 0;

		let params = { $limit: limit };

		///////////////////////////////////////////////////////////////////
		// Try getting everything for convenience, but monitor performance
		// Orig: tx, sig, updated_at, owner
		//////////////////////////////////////////////
		let sql = `SELECT * FROM archives WHERE`;

		//
		// Hardcode field5 as a flexible search term --
		// arcade would prefer a general numeric field that is sortable
		// but Redsquare doesn't
		//
		if (obj.field5 || obj.hasOwnProperty('field5')) {
			if (obj.field5_sort) {
				where_obj['field5'] = { '>=': obj.field5 };
				sql += ' archives.field5 >= $field5 AND';
				params['$field5'] = obj.field5;
				order_clause = ' ORDER BY archives.field5';
				order_obj.by = 'field5';
				delete obj.field5;
				delete obj.field5_sort;
			}
		}

		for (let key in obj) {
			if (this.schema.includes(key)) {
				sql += ` archives.${key} = $${key} AND`;
				params[`$${key}`] = obj[key];
				where_obj[key] = obj[key];
			}
		}

		sql = sql.substring(0, sql.length - 4);

		//
		// should we be ordering by timestamp instead of id?
		//
		sql += timestamp_limiting_clause + order_clause + ` ${sort} LIMIT $limit`;

		//
		// SEARCH BASED ON CRITERIA PROVIDED
		// Run SQL queries for full nodes, with JS-Store fallback for browsers
		//
		let ts = Date.now();
		let rows = await this.app.storage.queryDatabase(sql, params, 'archive');

		if (this.app.BROWSER && !rows?.length) {
			//console.log('archive checkpoint');
			rows = await this.localDB.select({
				from: 'archives',
				where: where_obj,
				order: order_obj,
				limit
			});
		} else {
			const fs = this.app?.storage?.returnFileSystem();
			if (!fs) {
				console.warn('!!!!!!!! NO FILESYSTEM !!!!!!!!!');
			} else {
				for (let r of rows) {
					if (!r.tx) {
						//console.log('Read tx from disk: ', r.sig);
						let filename = `${__dirname}/../../data/archive/${r.sig}`;
						if (fs.existsSync(filename)) {
							r.tx = fs.readFileSync(filename, { encoding: 'UTF-8' });
						}
					}
				}
			}

			let time_elapsed = Date.now() - ts;
			if (time_elapsed > 0) {
				if (!obj?.sig) {
					console.debug(
						`==> Archive SQL query time: ${time_elapsed}ms -- `,
						sql,
						params,
						rows.length
					);
				}
			}
		}

		//
		// before we return the content, we potential parse any content that
		// is protected by an access_hash that is not solved by an affixed
		// access_script and access_witness.
		//
		if (this.access_hash == 1) {
			console.log('*****************');
			console.log('ACCESS HASH CHECK');
			console.log('*****************');
			let altered_rows = [];

			for (let r of rows) {
				//
				// there is some sort of cryptographically-enforced access limitation
				// placed on this record, such as a request that requires ownership of
				// a specific network item in order to access.
				//
				if (r.owner) {
					//
					//
					//
					if (!obj.access_script || !obj.access_witness) {
						//
						// no script / witness remove row
						//
					} else {
						//
						// otherwise evaluate...
						//
						if (obj.access_hash === r.owner) {
							//let peers = await this.app.network.getPeers();
							//for (let peer of peers) {
							//	console.log('PEER: ' + JSON.stringify(peer));
							//}

							let include_row = false;
							let scripting_mod = this.app.modules.returnModule('Scripting');
							if (scripting_mod) {
								if (
									scripting_mod.evaluate(
										obj.access_hash,
										obj.access_script,
										obj.access_witness,
										{},
										request_tx,
										null
									)
								) {
									include_row = true;
								}
							}
							if (include_row) {
								altered_rows.push(r);
							}
						}
					}
				}
			}

			rows = altered_rows;
			console.log('ROWS RETURNING: ' + JSON.stringify(rows));
		}

		return rows;
	}

	////////////
	// delete //
	////////////
	//
	// Our Requests:
	//
	// - users can delete any transactions they OWN
	// - server operator can delete any transactions anytime
	// - server operator respectfully avoid deleting transactions with preserve=1
	//
	async deleteTransaction(tx, obj = {}) {
		let sql = '';
		let params = {};
		let rows = [];
		let timestamp_limiting_clause = '';
		let where_obj = {};

		let sig;
		if (tx?.signature) {
			sig = tx.signature;
		} else if (typeof tx === 'string') {
			sig = tx;
		} else {
			console.error('Not a valid tx/signature');
			return false;
		}

		//
		// FIRST: SELECT the transaction to check its owner field
		//
		let select_sql = `SELECT sig, owner FROM archives WHERE archives.sig = $sig`;
		let select_params = { $sig: sig };
		let existing_rows = await this.app.storage.queryDatabase(select_sql, select_params, 'archive');

		// Also check browser localDB if needed
		if (this.app.BROWSER && (!existing_rows || existing_rows.length === 0)) {
			existing_rows = await this.localDB.select({
				from: 'archives',
				where: { sig: sig },
				limit: 1
			});
		}

		// Check if transaction exists
		if (!existing_rows || existing_rows.length === 0) {
			console.log('Transaction not found in archive, cannot delete');
			return false;
		}

		let existing_row = existing_rows[0];

		//
		// SECOND: Check if owner is specified and verify ownership
		//
		if (existing_row.owner && existing_row.owner !== '') {
			//
			// Owner is specified, need to verify access
			//
			console.log('*****************');
			console.log('DELETE ACCESS HASH CHECK');
			console.log('*****************');
			console.log('Transaction owner:', existing_row.owner);

			// Check if access credentials are provided
			if (!obj.access_script || !obj.access_witness) {
				console.log('DELETE DENIED: No access_script or access_witness provided');
				return false;
			}

			// Check if access_hash matches the owner
			if (!obj.access_hash || obj.access_hash !== existing_row.owner) {
				console.log('DELETE DENIED: access_hash does not match owner');
				return false;
			}

			// Evaluate the script using the Scripting module
			let can_delete = false;
			let scripting_mod = this.app.modules.returnModule('Scripting');
			if (scripting_mod) {
				let request_tx = obj.request_tx || tx || null;
				let eval_result = await scripting_mod.evaluate(
					obj.access_hash,
					obj.access_script,
					obj.access_witness,
					{},
					request_tx,
					null
				);

				if (eval_result) {
					can_delete = true;
					console.log('DELETE ACCESS GRANTED: Script evaluation passed');
				} else {
					console.log('DELETE DENIED: Script evaluation failed');
				}
			} else {
				console.log('DELETE DENIED: Scripting module not available');
			}

			if (!can_delete) {
				return false;
			}
		} else {
			//
			// No owner specified, proceed with deletion (existing behavior)
			//
			console.log('No owner specified for transaction, proceeding with deletion');
		}

		//
		// THIRD: Proceed with deletion if ownership verified or no owner
		//
		sql = `DELETE FROM archives WHERE archives.sig = $sig`;
		params = { $sig: sig };
		await this.app.storage.runDatabase(sql, params, 'archive');

		//
		// browsers handle with localDB search
		//
		where_obj['sig'] = sig;
		if (this.app.BROWSER) {
			rows = await this.localDB.remove({
				from: 'archives',
				where: where_obj
			});
			if (rows) {
				console.log('DELETED FROM localDB! ');
			} else {
				console.log('Record not found in localDB to delete');
			}
		} else {
			const fs = this.app.storage.returnFileSystem();
			const path = this.app.storage.returnPath();
			if (fs && path) {
				const filepath = path.normalize(`${__dirname}/../../data/archive/${sig}`);
				if (fs.existsSync(filepath)) {
					fs.unlink(filepath, (err) => {
						if (err) {
							console.error(err);
						} else {
							console.info(`Deleted ${filepath}`);
						}
					});
				}
			}
		}

		return true;
	}

	////////////
	// delete //
	////////////
	//
	// Our Rules:
	//
	// - users can delete any transactions they OWN
	// - server operator can delete any transactions anytime
	// - server operator respectfully avoid deleting transactions with preserve=1
	//
	async deleteTransactions(obj = {}) {
		let rows = [];

		let timestamp_limiting_clause = ' archives.preserve = 0';
		let where_obj1 = {};

		if (obj.created_later_than) {
			timestamp_limiting_clause += ' AND archives.created_at > ' + parseInt(obj.created_later_than);
			where_obj1 = {
				created_at: { '>': parseInt(obj.created_later_than) }
			};
		}
		if (obj.created_earlier_than) {
			timestamp_limiting_clause +=
				' AND archives.created_at < ' + parseInt(obj.created_earlier_than);
			where_obj1 = {
				created_at: { '<': parseInt(obj.created_earlier_than) }
			};
		}
		if (obj.updated_later_than) {
			timestamp_limiting_clause += ' AND archives.updated_at > ' + parseInt(obj.updated_later_than);
			where_obj1 = {
				updated_at: { '>': parseInt(obj.updated_later_than) }
			};
		}
		if (obj.updated_earlier_than) {
			timestamp_limiting_clause +=
				' AND archives.updated_at < ' + parseInt(obj.updated_earlier_than);
			where_obj1 = {
				updated_at: { '<': parseInt(obj.updated_earlier_than) }
			};
		}

		where_obj1['preserve'] = 0;

		//
		// SEARCH BASED ON CRITERIA PROVIDED
		//
		let sql = `DELETE FROM archives WHERE `;
		let sql_substring = '';
		let params = {};
		let where_obj2 = {};
		let param_ct = 0;

		for (let key in obj) {
			if (this.schema.includes(key)) {
				sql_substring += `archives.${key} = $${key} OR `;
				params[`$${key}`] = obj[key];
				if (param_ct++ > 0) {
					if (where_obj2['or']) {
						where_obj2.or[key] = obj[key];
					} else {
						where_obj2['or'] = {};
						where_obj2.or[key] = obj[key];
					}
				} else {
					where_obj2[key] = obj[key];
				}
			}
		}

		sql_substring = sql_substring.substring(0, sql_substring.length - 4);

		if (param_ct > 1) {
			sql += `(${sql_substring})`;
		} else {
			sql += sql_substring;
		}

		let where_obj;
		if (param_ct > 1) {
			where_obj = [where_obj1, where_obj2];
			sql += ' AND' + timestamp_limiting_clause;
		} else if (param_ct == 1) {
			where_obj = Object.assign(where_obj1, where_obj2);
		} else {
			where_obj = where_obj1;
			sql += timestamp_limiting_clause;
		}

		rows = await this.app.storage.runDatabase(sql, params, 'archive');

		//
		// browsers handle with localDB search
		//
		if (this.app.BROWSER) {
			rows = await this.localDB.remove({
				from: 'archives',
				where: where_obj
			});
		}

		return;
	}

	//
	// Pruning
	//
	// the Archive module stores two types of transactions:
	//
	// - blockchain transactions (no owner)
	// - saved user transactions (owner)
	//
	// we want to keep a copy of all blockchain transactions for about a month and then
	// prune them automatically since they can be restored by parsing the chain as needed
	// but should not be needed.
	//
	// users will submit requests to save-and-update copies of the transactions that affect
	// them, and this has the potential to place a greater load on the server. for this
	// reason, we have a harder limit for these transactions, and will delete them after
	// 2,000 transactions or once they are older than 3 weeks.
	//
	// modules that save data can decide which transactions to keep and which ones to
	// delete based on internal transaction logic. we will respectfully avoid deleting any
	// transactions that users have marked as prune = false, although this may change in
	// the future if it is abused.
	//
	async pruneArchive() {
		console.log('$');
		console.log('$');
		console.log('$ PURGING ARCHIVE');
		console.log('$');
		console.log('$');

		// SQL
		let now = new Date().getTime();

		let ts = now - this.prune_public_ts;

		//
		// localDB
		//
		// in order to avoid data simply building-up for eternity, and especially for content
		// saved such as likes, our pruning is turned off explicitly for anything where the
		// preserve flag is set to 0.
		//
		if (this.app.BROWSER) {
			where_obj = { updated_at: { '<': ts } };
			where_obj['preserve'] = 0;
			rows = await this.localDB.remove({
				from: 'archives',
				where: where_obj
			});
			console.log(rows, 'automatically pruned from local archive');
		} else {
			//
			// Servers clean up SQL / file storage
			//

			//
			// delete public blockchain transactions
			//
			let pruned_ct = 0;
			let sql = `DELETE FROM archives WHERE owner = "" AND updated_at < $ts AND preserve = 0 AND tx != ''`;
			let params = { $ts: now - this.prune_public_ts };
			let results = await this.app.storage.runDatabase(sql, params, 'archive');
			if (results?.changes) {
				pruned_ct += results?.changes;
			}

			//
			// delete private transactions
			//
			sql = `DELETE FROM archives WHERE owner != "" AND updated_at < $ts AND preserve = 0 AND tx != ''`;
			params = { $ts: now - this.prune_private_ts };
			results = await this.app.storage.runDatabase(sql, params, 'archive');
			if (results?.changes) {
				pruned_ct += results?.changes;
			}

			//
			// delete invalid antiquated transactions 1 year ago
			//
			sql = `DELETE FROM archives WHERE ( tx_size = 0 or field1 = 'RedSquare') and updated_at < $ts`;
			params = { $ts: now - 50 * this.prune_public_ts };
			results = await this.app.storage.runDatabase(sql, params, 'archive');
			if (results?.changes) {
				pruned_ct += results?.changes;
			}

			console.log(`Deleted ${pruned_ct} txs from archive`);

			//
			// Need to add something to delete the super big transactions as well...
			//
			params = { $ts: now - this.prune_public_ts };
			sql = `SELECT sig FROM archives WHERE updated_at < $ts AND preserve = 0 AND tx = ''`;
			let rows = await this.app.storage.queryDatabase(sql, params, 'archive');
			for (let r of rows) {
				await this.deleteTransaction(r.sig);
			}

			sql = 'SELECT COUNT(*) FROM archives';
			rows = await this.app.storage.queryDatabase(sql, {}, 'archive');
			console.log(rows);
		}

		this.archive.last_prune = now;
		this.save();
	}

	//////////////////////////
	// listen to everything //
	//////////////////////////
	shouldAffixCallbackToModule(modname) {
		if (this.opt_out.includes(modname)) {
			return 0;
		}

		return 1;
	}

	///////////////
	// save/load //
	///////////////
	load() {
		if (this.app.options.archive) {
			this.archive = this.app.options.archive;
		} else {
			this.archive = {};
			this.archive.index_blockchain = 0;
			if (this.app.BROWSER == 0) {
				this.archive.index_blockchain = 1;
			}
			this.save();
		}
	}

	save() {
		this.archive.wallet_version = this.app.options.wallet.version;
		this.app.options.archive = this.archive;
		this.app.storage.saveOptions();
	}

	async onUpgrade(type, privatekey, walletfile) {
		if (type == 'nuke' && this.localDB) {
			await this.localDB.dropDb();
			await this.initInBrowserDatabase();
			//await this.localDB.clear("archives");
		}
		return 1;
	}
}

module.exports = Archive;
