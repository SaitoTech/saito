const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AdminMain = require('./lib/ui/main');
const AdminHome = require('./index');

class Admin extends ModTemplate {
  constructor(app) {
    super(app);
    this.name = 'Admin';
    this.slug = 'admin';
    this.description = 'Admin module for Saito application management';
    this.categories = 'Admin utilities';

    this.server_publickey = '';
    this.server_info = null;
  }

  async initialize(app) {
    await super.initialize(app);
    this.main = new AdminMain(app, this);
  }

  async render() {
    this.server_publickey = server_publickey;
    this.main.render();
  }

  async onPeerHandshakeComplete(app, peer) {
    if (!this.browser_active) {
      return;
    }

    if (need_to_set_key) {
      return;
    }

    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(server_publickey);
    tx.msg = {
      module: 'Admin',
      request: 'validate-admin-key',
      key: this.publicKey
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          alert(res.err);
        } else {
          this.server_info = res;
          this.main.render();
        }
      },
      peer.publicKey
    );
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (this.app.BROWSER) {
      return 0;
    }

    if (!tx.isTo(this.publicKey)) {
      return 0;
    }

    let txmsg = tx.returnMessage();
    if (!txmsg?.request) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    const accepted_requests = [
      'list-databases',
      'list-database-tables',
      'list-peers',
      'run-sql-query',
      'set-admin-key',
      'validate-admin-key',
      'update-options',
      'update-modules-config',
      'update-peers',
      'list-blockchain-state',
      'list-mempool',
      'list-faucet',
      'get-admin-config',
      'update-admin-config'
    ];

    if (!accepted_requests.includes(txmsg.request)) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    let validated = true;
    if (app.options.admin?.length) {
      validated = false;
      for (let a of app.options.admin) {
        if (tx.isFrom(a)) {
          validated = true;
        }
      }
    }

    if (!validated) {
      console.error('Unauthorized access!');
      if (mycallback) {
        mycallback({ err: 'Unauthorized access' });
      }
      return 0;
    }

    if (txmsg.request == 'list-databases') {
      try {
        if (mycallback) mycallback({ result: this.listSqliteDatabases() });
      } catch (err) {
        if (mycallback) mycallback({ err: this.sqliteError('', err) });
      }
      return 1;
    }

    if (txmsg.request == 'list-database-tables') {
      const db = txmsg.data?.db;
      if (!db) {
        if (mycallback) mycallback({ err: 'No database specified' });
        return 1;
      }
      try {
        const result = await this.executeAdminSql(
          db,
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        if (mycallback) mycallback({ result: result.rows || [] });
      } catch (err) {
        if (mycallback) mycallback({ err: this.sqliteError(db, err) });
      }
      return 1;
    }

    if (txmsg.request == 'run-sql-query') {
      const db = txmsg.data?.db;
      const query = txmsg.data?.query;
      if (!db) {
        if (mycallback) mycallback({ err: 'No database specified' });
        return 1;
      }
      if (!query || !String(query).trim()) {
        if (mycallback) mycallback({ err: 'No SQL provided' });
        return 1;
      }
      try {
        const result = await this.executeAdminSql(db, query);
        if (mycallback) mycallback({ result });
      } catch (err) {
        if (mycallback) mycallback({ err: this.sqliteError(db, err) });
      }
      return 1;
    }

    if (txmsg.request === 'list-peers') {
      try {
        const peers = await this.app.core.network.getPeers();
        const snapshot = (peers || []).map((p) => ({
          publicKey: p.publicKey || null,
          host: p.host || '',
          port: p.port || 0,
          protocol: p.protocol || '',
          synctype: p.synctype || '',
          status: p.status || ''
        }));
        if (mycallback) mycallback({ result: snapshot });
      } catch (err) {
        if (mycallback) mycallback({ err: err.message });
      }
      return 1;
    }

    if (txmsg.request == 'list-blockchain-state') {
      try {
        if (mycallback) mycallback({ result: await this.snapshotBlockchain() });
      } catch (err) {
        if (mycallback) mycallback({ err: err.message || String(err) });
      }
      return 1;
    }

    if (txmsg.request == 'list-mempool') {
      try {
        if (mycallback) mycallback({ result: await this.snapshotMempool() });
      } catch (err) {
        if (mycallback) mycallback({ err: err.message || String(err) });
      }
      return 1;
    }

    if (txmsg.request == 'list-faucet') {
      try {
        const faucet = this.app.modules.returnModule('Faucet');
        if (!faucet) {
          if (mycallback) mycallback({ err: 'Faucet is not installed on this server.' });
        } else {
          if (mycallback) {
            mycallback({ result: await faucet.adminSnapshot(txmsg.filter || 'recent') });
          }
        }
      } catch (err) {
        if (mycallback) mycallback({ err: err.message || String(err) });
      }
      return 1;
    }

    if (txmsg.request === 'get-admin-config') {
      try {
        const config = this.returnAdminConfig(txmsg.module_id);
        if (!config || typeof config.getConfig !== 'function') {
          throw new Error(`No admin configuration is available for "${txmsg.module_id || ''}".`);
        }
        if (mycallback) {
          mycallback({ result: await config.getConfig() });
        }
      } catch (err) {
        if (mycallback) mycallback({ err: err.message || String(err) });
      }
      return 1;
    }

    if (txmsg.request === 'update-admin-config') {
      try {
        const config = this.returnAdminConfig(txmsg.module_id);
        if (!config || typeof config.updateConfig !== 'function') {
          throw new Error(
            `No editable admin configuration is available for "${txmsg.module_id || ''}".`
          );
        }
        if (mycallback) {
          mycallback({ result: await config.updateConfig(txmsg.data || {}) });
        }
      } catch (err) {
        if (mycallback) mycallback({ err: err.message || String(err) });
      }
      return 1;
    }

    if (txmsg.request == 'set-admin-key') {
      if (!this.app.options.admin) {
        this.app.options.admin = [];
      }

      this.app.options.admin.push(txmsg.key);
      this.app.storage.saveOptions();

      const err = this.writeOptions({ admin: this.app.options.admin });
      if (mycallback) {
        mycallback(err ? { err } : { result: 1 });
      }
      return 1;
    }

    if (txmsg.request == 'validate-admin-key') {
      if (mycallback) mycallback(this.getOptions());
      return 1;
    }

    if (txmsg.request == 'update-modules-config') {
      const err = this.writeModuleConfig(txmsg.config);
      if (mycallback) {
        mycallback(err ? { err } : { result: 1 });
      }
      return 1;
    }

    if (txmsg.request == 'update-peers') {
      const previous = Array.isArray(this.app.options.peers) ? this.app.options.peers.slice() : [];
      const peers = this.normalizePeerList(txmsg.peers);
      const err = this.updateOptions({ peers });
      let connecting = false;
      if (!err) {
        connecting = this.connectNewPeers(previous, peers);
      }
      if (mycallback) {
        mycallback(err ? { err } : { result: 1, connecting });
      }
      return 1;
    }

    if (txmsg.request == 'update-options') {
      const err = this.updateOptions(txmsg.data);
      if (mycallback) {
        mycallback(err ? { err } : { result: 1 });
      }
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  /**
   * Modules expose server-owned settings through respondTo('admin-config').
   * The returned functions stay in-process; only their sanitized results are
   * sent over Admin's authenticated request channel.
   */
  returnAdminConfig(module_id = '') {
    const id = String(module_id || '')
      .trim()
      .toLowerCase();
    if (!id) {
      return null;
    }

    const modules = this.app.modules.returnModulesRespondingTo('admin-config') || [];
    for (const mod of modules) {
      const config = mod.respondTo('admin-config');
      if (String(config?.id || '').toLowerCase() === id) {
        return config;
      }
    }
    return null;
  }

  getOptions() {
    const path = this.app.storage.returnPath();
    const fs = this.app.storage.returnFileSystem();
    const node_info = {};

    if (fs && path) {
      const config_dir = path.normalize(`${__dirname}/../../config`);
      const modules_dir = path.normalize(`${__dirname}/../../mods`);

      node_info.available_modules = this.listAvailableModules(fs, path, modules_dir);

      const modules_config = path.normalize(`${config_dir}/modules.config.js`);
      this.module_config = { core: [], lite: [] };
      if (fs.existsSync(modules_config)) {
        try {
          this.module_config = this.readModuleConfig(fs, modules_config);
        } catch (err) {
          console.error(err);
        }
      }
    }

    node_info.module_config = this.module_config || { core: [], lite: [] };
    node_info.options = this.app.options;
    node_info.databases = [];

    for (let m of this.app.modules.mods || []) {
      if (m.db_tables && m.db_tables.length > 0) {
        node_info.databases.push({
          module: m.name,
          dbname: m.dbname ? m.dbname : m.returnSlug(),
          tables: m.db_tables
        });
      }
    }

    return node_info;
  }

  listAvailableModules(fs, path, modules_dir) {
    if (!fs.existsSync(modules_dir)) {
      return [];
    }

    const names = [];
    for (const name of fs.readdirSync(modules_dir)) {
      if (!name || name.startsWith('.')) {
        continue;
      }
      const dir = path.join(modules_dir, name);
      const entry = path.join(dir, `${name}.js`);
      try {
        if (fs.statSync(dir).isDirectory() && fs.existsSync(entry)) {
          names.push(name);
        }
      } catch (err) {
        continue;
      }
    }
    names.sort();
    return names;
  }

  readModuleConfig(fs, filename) {
    const src = fs.readFileSync(filename, { encoding: 'UTF-8' });
    const core = [];
    const lite = [];
    let section = '';

    for (let line of src.split('\n')) {
      const trimmed = line.replace(/^\s*\/\/.*$/, '').trim();
      if (/^core\s*:/.test(trimmed)) {
        section = 'core';
      }
      if (/^lite\s*:/.test(trimmed)) {
        section = 'lite';
      }
      if (section !== 'core' && section !== 'lite') {
        continue;
      }
      for (const match of trimmed.matchAll(/['"]([^'"]+)['"]/g)) {
        if (section === 'core') {
          core.push(match[1]);
        } else {
          lite.push(match[1]);
        }
      }
    }

    return { core, lite };
  }

  writeModuleConfig(config_str) {
    const path = this.app.storage.returnPath();
    const fs = this.app.storage.returnFileSystem();
    if (!fs || !path) {
      return 'Filesystem is not available on this server.';
    }

    const filename = path.normalize(`${__dirname}/../../config/modules.config.js`);
    let core = [];
    let lite = [];

    try {
      const parsedConfig = JSON.parse(config_str);
      core = Array.isArray(parsedConfig.core) ? parsedConfig.core : [];
      lite = Array.isArray(parsedConfig.lite) ? parsedConfig.lite : [];
    } catch (err) {
      return 'Module configuration was not valid JSON.';
    }

    if (!core.includes('admin/admin.js')) {
      core.unshift('admin/admin.js');
    }

    const formatList = (arr) => {
      return arr
        .filter((item) => typeof item === 'string' && item.includes('/'))
        .map((item) => `    '${item}',`)
        .join('\n');
    };

    const output = `export default {
  core: [
${formatList(core)}
  ],
  lite: [
${formatList(lite)}
  ]
};
`;

    try {
      fs.writeFileSync(filename, output);
    } catch (err) {
      return this.returnWriteError(filename, err);
    }

    return null;
  }

  peerKey(peer) {
    return `${String(peer?.host || '').toLowerCase()}|${String(peer?.port || '')}`;
  }

  normalizePeerList(list) {
    const peers = [];
    const seen = new Set();
    for (const item of Array.isArray(list) ? list : []) {
      const host = String(item?.host || '').trim();
      const protocol = String(item?.protocol || '').trim();
      const port = Number(item?.port);
      if (!host || !port || (protocol !== 'http' && protocol !== 'https')) {
        continue;
      }
      const peer = {
        host,
        port,
        protocol,
        synctype: item?.synctype === 'lite' ? 'lite' : 'full'
      };
      const key = this.peerKey(peer);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      peers.push(peer);
    }
    return peers;
  }

  connectNewPeers(previous, next) {
    let connecting = false;
    const had = new Set((previous || []).map((p) => this.peerKey(p)));
    for (const peer of next || []) {
      if (had.has(this.peerKey(peer))) {
        continue;
      }
      if (this.connectPeer(peer)) {
        connecting = true;
      }
    }
    return connecting;
  }

  connectPeer(peer) {
    const ws_protocol = peer.protocol === 'https' ? 'wss' : 'ws';
    const url = `${ws_protocol}://${peer.host}:${peer.port}/wsopen`;
    try {
      if (globalThis.shared_methods?.connect_to_peer) {
        globalThis.shared_methods.connect_to_peer(url);
        return true;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  }

  listSqliteDatabases() {
    const fs = this.app.storage.returnFileSystem();
    const path = this.app.storage.returnPath();
    const data_dir = this.app.storage.data_dir;
    if (!fs || !path || !data_dir) {
      return [];
    }
    if (!fs.existsSync(data_dir)) {
      return [];
    }

    const names = [];
    for (const file of fs.readdirSync(data_dir)) {
      if (!file.endsWith('.sq3')) {
        continue;
      }
      const full = path.join(data_dir, file);
      try {
        if (fs.statSync(full).isFile()) {
          names.push(file.slice(0, -4));
        }
      } catch (err) {
        continue;
      }
    }
    names.sort();
    return names;
  }

  sqliteFile(dbname) {
    const path = this.app.storage.returnPath();
    const data_dir = this.app.storage.data_dir || '';
    if (!path) {
      return `${dbname}.sq3`;
    }
    return path.join(data_dir, `${dbname}.sq3`);
  }

  async openSqlite(dbname) {
    if (!this.listSqliteDatabases().includes(dbname)) {
      throw new Error(
        `Database "${dbname}" was not found in ${this.app.storage.data_dir || 'the data directory'}.`
      );
    }
    const db = await this.app.storage.returnDatabaseByName(dbname);
    if (!db) {
      throw new Error(`Could not open ${this.sqliteFile(dbname)}.`);
    }
    return db;
  }

  async executeAdminSql(dbname, sql) {
    const db = await this.openSqlite(dbname);
    try {
      const rows = await db.all(sql);
      return { rows: rows || [] };
    } catch (err) {
      const msg = String(err?.message || err);
      if (!/does not return data|Use run\(\)|not a SELECT/i.test(msg)) {
        throw err;
      }
      const res = await db.run(sql);
      return {
        changes: typeof res?.changes === 'number' ? res.changes : 0,
        lastID: res?.lastID
      };
    }
  }

  sqliteError(dbname, err) {
    const filename = dbname ? this.sqliteFile(dbname) : this.app.storage.data_dir || 'the data directory';
    if (err?.code === 'EACCES' || err?.code === 'EPERM' || err?.code === 'SQLITE_READONLY') {
      return `We couldn't update ${filename} because this file is not writable by the Saito server. The user account that runs Saito needs write permission for that file. Give that account write access, then try again.`;
    }
    if (err?.code === 'SQLITE_CANTOPEN' || err?.code === 'ENOENT') {
      return `We couldn't open ${filename}: ${err.message || err}`;
    }
    if (dbname) {
      return `Database "${dbname}": ${err?.message || err}`;
    }
    return err?.message || String(err);
  }

  async snapshotMempool() {
    const Saito = require('saito-js/saito').default;
    const txs = (await Saito.getInstance().getMempoolTxs()) || [];
    const limit = 200;
    const types = [
      'Normal',
      'Fee',
      'Golden Ticket',
      'ATR',
      'VIP',
      'SPV',
      'Issuance',
      'Block Stake',
      'Bound'
    ];

    const text = (value) => {
      if (value === null || value === undefined || value === '') {
        return '';
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return String(value);
    };

    const keys = (slips) => {
      const out = [];
      for (const slip of slips || []) {
        const key = slip?.publicKey;
        if (key && !out.includes(key)) {
          out.push(key);
        }
      }
      return out;
    };

    const sorted = txs.slice().sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

    return {
      count: txs.length,
      limit,
      transactions: sorted.slice(0, limit).map((tx) => {
        const type_num = Number(tx.type);
        let size = 0;
        if (tx.buffer) {
          size = Buffer.from(tx.buffer, 'base64').length;
        }
        return {
          signature: text(tx.signature),
          timestamp: text(tx.timestamp),
          type: types[type_num] || String(type_num),
          fees: text(tx.total_fees),
          size,
          replacements: Number(tx.txs_replacements || 0),
          hops: Array.isArray(tx.routing_path) ? tx.routing_path.length : 0,
          from: keys(tx.from),
          to: keys(tx.to)
        };
      })
    };
  }

  async snapshotBlockchain() {
    const bc = this.app.core?.blockchain;
    if (!bc) {
      throw new Error('The Saito core blockchain is not available.');
    }

    const text = (value) => {
      if (value === null || value === undefined || value === '') {
        return '';
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return String(value);
    };

    const zero_hash = '0000000000000000000000000000000000000000000000000000000000000000';
    // saito-js decorates this instance with a get() wrapper that calls the
    // same instance method again. Use the WASM prototype implementation to
    // avoid that recursive wrapper while retaining the live chain state.
    const get_blockchain_state = Object.getPrototypeOf(bc)?.get;
    const live =
      (typeof get_blockchain_state === 'function' && (await get_blockchain_state.call(bc))) || {};
    const consensus = this.app.options?.consensus || {};
    const wasm_blocks = (await bc.getBlocks(10, false)) || [];

    const recent = wasm_blocks.map((block) => ({
      id: text(block.id),
      hash: text(block.hash),
      previous_hash: text(block.previousBlockHash || block.previous_block_hash),
      timestamp: text(block.timestamp),
      creator: text(block.creator || block.instance?.creator),
      fees: text(block.totalFees ?? block.total_fees),
      burnfee: text(block.burnFee ?? block.burnfee),
      difficulty: text(block.difficulty),
      treasury: text(block.treasury),
      graveyard: text(block.graveyard),
      golden_ticket: !!(block.hasGoldenTicket ?? block.has_golden_ticket)
    }));

    return {
      latest_block_id: text(await bc.get_latest_block_id()),
      last_block_id: text(await bc.get_last_block_id()),
      last_block_hash: text(await bc.get_last_block_hash()),
      last_timestamp: text(await bc.get_last_timestamp()),
      last_burnfee: text(await bc.get_last_burnfee()),
      genesis_block_id: text(await bc.get_genesis_block_id()),
      genesis_timestamp: text(await bc.get_genesis_timestamp()),
      genesis_period: text(live.genesis_period || consensus.genesis_period),
      fork_id: text(await bc.get_fork_id()),
      lowest_acceptable_block_id: text(await bc.get_lowest_acceptable_block_id()),
      lowest_acceptable_block_hash: text(await bc.get_lowest_acceptable_block_hash()),
      prune_after_blocks: text(await bc.get_prune_after_blocks()),
      block_confirmation_limit: text(await bc.get_block_confirmation_limit()),
      social_stake_period: text(live.social_stake_period || consensus.default_social_stake_period),
      is_loading: !!live.is_loading,
      is_loaded: !!live.is_loaded,
      heartbeat_interval: text(consensus.heartbeat_interval),
      disable_block_production: !!consensus.disable_block_production,
      zero_hash,
      recent
    };
  }

  updateOptions(options) {
    for (let a in options) {
      const current = this.app.options[a];
      const incoming = options[a];
      const both_objects =
        current &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        incoming &&
        typeof incoming === 'object' &&
        !Array.isArray(incoming);

      if (both_objects) {
        for (let b in incoming) {
          this.app.options[a][b] = incoming[b];
        }
      } else {
        this.app.options[a] = incoming;
      }
    }
    this.app.storage.saveOptions();
    return this.writeOptions(options);
  }

  writeOptions(options = {}) {
    const path = this.app.storage.returnPath();
    const fs = this.app.storage.returnFileSystem();
    if (!fs || !path) {
      return 'Filesystem is not available on this server.';
    }

    const filename = path.normalize(`${__dirname}/../../config/options`);

    try {
      if (!fs.existsSync(filename)) {
        return `Admin cannot find ${filename}.`;
      }

      let optFile = fs.readFileSync(filename, { encoding: 'UTF-8' });
      optFile = optFile.replace(/\s/g, '').replace(/'/g, `"`);
      optFile = JSON.parse(optFile);

      for (let a in options) {
        if (
          optFile[a] &&
          typeof optFile[a] === 'object' &&
          !Array.isArray(optFile[a]) &&
          typeof options[a] === 'object' &&
          !Array.isArray(options[a])
        ) {
          Object.assign(optFile[a], options[a]);
        } else {
          optFile[a] = options[a];
        }
      }

      fs.writeFileSync(filename, JSON.stringify(optFile, null, 2));
    } catch (err) {
      return this.returnWriteError(filename, err);
    }

    return null;
  }

  returnWriteError(filename, err) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      return `We couldn't update ${filename} because this file is not writable by the Saito server. The user account that runs Saito needs write permission for that file. Give that account write access, then try again.`;
    }
    return err?.message || String(err);
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const webdir = `${__dirname}/web`;
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const admin_self = this;

    const serverFn = async (req, res) => {
      let html = await AdminHome(app, admin_self, app.build_number, this.publicKey);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    };

    expressapp.get(uri, serverFn);
    expressapp.use(uri, express.static(webdir));
  }

  returnDefaultModules() {
    return [
      'admin',
      'arcade',
      'archive',
      'blog',
      'chat',
      'chess',
      'crypto',
      'devtools',
      'encrypt',
      'disburse'
    ];
  }
}

module.exports = Admin;
