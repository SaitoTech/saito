const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const AdminMain = require('./lib/ui/main');
const AdminHome = require('./index');
const jsonTree = require('json-tree-viewer');

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

    if (!need_to_set_key) {
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
  }

  /**
   * Admin communicates to the node through off-chain transactions
   */
  async handlePeerTransaction(app, tx = null, peer, mycallback) {

    if (this.app.BROWSER) {
      return 0;
    }

    if (!tx.isTo(this.publicKey)) {
      return 0;
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

    let txmsg = tx.returnMessage();

    const accepted_requests = [
      'list-databases',
      'list-database-tables',
      'list-peers',
      'run-sql-query',
      'set-admin-key',
      'validate-admin-key',
      'update-options'
    ];

    if (accepted_requests.includes(txmsg.request)) {
      if (!validated) {
        console.error('Unauthorized access!');
        if (mycallback) {
          mycallback({ err: 'Unauthorized access' });
        }
        return 0;
      }
    }

    if (txmsg.request == 'list-databases') {
      console.log('=== MODULE DEBUG START ===');
      for (let m of this.app.modules.mods || []) {
        console.log('Module:', m.name);
        console.log('Properties:', Object.keys(m));
      }
      console.log('=== MODULE DEBUG END ===');
      const arr = [];
      for (const m of this.app.modules.mods || []) {
        if (m.db_tables && m.db_tables.length > 0) {
          const dbname = m.dbname ? m.dbname : m.returnSlug();
          arr.push(dbname);
        }
      }
      const databasesArray = [...new Set(arr)];
      if (mycallback) mycallback({ result: databasesArray });
      return 1;
    }

    if (txmsg.request == 'list-database-tables') {
      const db = txmsg.data?.db;
      if (!db) {
        if (mycallback) mycallback({ err: 'No database specified' });
        return 1;
      }
      try {
        const rows = await this.app.storage.queryDatabase(
          "SELECT name FROM sqlite_master WHERE type='table'",
          [],
          db
        );
        if (mycallback) mycallback({ result: rows });
      } catch (err) {
        if (mycallback) mycallback({ err: err.message });
      }
      return 1;
    }

    if (txmsg.request == 'run-sql-query') {
      const db = txmsg.data?.db;
      const query = txmsg.data?.query;
      const params = txmsg.data?.params || [];
      try {
        const result = await this.app.storage.queryDatabase(query, params, db);
        if (mycallback) mycallback({ result });
      } catch (err) {
        if (mycallback) mycallback({ err: err.message });
      }
      return 1;
    }

    if (txmsg.request === 'list-peers') {
      try {
        console.log("################################################");
        console.log("################################################");
        console.log("################################################");
        console.log("################################################");
        console.log("################################################");
        console.log("################################################");
        console.log(JSON.stringify(app.core.network.peers.get()));
        const peers = await this.app.network.getPeers();
        console.log(JSON.stringify(peers));
        const snapshot = peers.map((p) => {
          const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(p));
          const peer = this.serializePeerForAdmin(p);
          return {
            publicKey: peer.publicKey || peer.public_key || null,
            host: peer.host || null,
            port: peer.port || null,
            services: peer.services || null,
            rawKeys: keys,
            peer
          };
        });
        if (mycallback) mycallback({ result: snapshot });
      } catch (err) {
        if (mycallback) mycallback({ err: err.message });
      }
      return 1;
    }

    if (txmsg.request == 'set-admin-key') {
      if (!this.app.options.admin) {
        this.app.options.admin = [];
      }

      this.app.options.admin.push(txmsg.key);
      this.app.storage.saveOptions();

      this.writeOptions({ admin: this.app.options.admin }, true);

      if (mycallback) {
        mycallback(1);
      }
      return 1;
    }

    if (txmsg.request == 'validate-admin-key') {
      console.info('ADMIN validate-admin-key');
      mycallback(this.getOptions());
      return 1;
    }

    if (txmsg.request == 'update-modules-config') {
      console.info('ADMIN update-modules-config');
      this.writeModuleConfig(txmsg.config);
      return 1;
    }

    if (txmsg.request == 'update-options') {
      console.info('ADMIN update-options');
      this.updateOptions(txmsg.data);
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  serializePeerForAdmin(peer) {
    const serializePrototypeGetters = (value, output, depth, seen) => {
      let proto = Object.getPrototypeOf(value);

      while (proto && proto !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) {
          const descriptor = Object.getOwnPropertyDescriptor(proto, key);
          if (!descriptor?.get || key === 'constructor' || output[key] !== undefined) {
            continue;
          }

          try {
            const serialized = serializeValue(value[key], depth + 1, seen);
            if (serialized !== undefined) {
              output[key] = serialized;
            }
          } catch (err) {
            output[key] = `[unavailable: ${err.message}]`;
          }
        }
        proto = Object.getPrototypeOf(proto);
      }

      return output;
    };

    const serializeValue = (value, depth = 0, seen = new WeakSet()) => {
      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value === 'bigint') {
        return value.toString();
      }

      if (typeof value === 'function') {
        return undefined;
      }

      if (typeof value !== 'object') {
        return value;
      }

      if (seen.has(value)) {
        return '[Circular]';
      }

      if (depth >= 4) {
        return '[MaxDepth]';
      }

      seen.add(value);

      if (Array.isArray(value)) {
        const output = value.map((item) => serializeValue(item, depth + 1, seen));
        seen.delete(value);
        return output;
      }

      if (typeof value.toJSON === 'function') {
        try {
          const output = serializeValue(value.toJSON(), depth + 1, seen);
          seen.delete(value);
          return output;
        } catch (err) {
          seen.delete(value);
          return `[toJSON unavailable: ${err.message}]`;
        }
      }

      const output = {};
      for (const key of Object.getOwnPropertyNames(value)) {
        try {
          const serialized = serializeValue(value[key], depth + 1, seen);
          if (serialized !== undefined) {
            output[key] = serialized;
          }
        } catch (err) {
          output[key] = `[unavailable: ${err.message}]`;
        }
      }
      serializePrototypeGetters(value, output, depth, seen);
      seen.delete(value);
      return output;
    };

    return serializeValue(peer) || {};
  }

  /**
   * Read config/options files from node directory and return summary to administrator
   */
  getOptions() {
    const path = this.app.storage.returnPath();
    const fs = this.app.storage.returnFileSystem();
    const node_info = {};

    if (fs && path) {
      const config_dir = path.normalize(`${__dirname}/../../config`);
      const modules_dir = path.normalize(`${__dirname}/../../mods`);

      if (fs.existsSync(modules_dir)) {
        node_info.available_modules = fs.readdirSync(modules_dir);
      } else {
        console.warn('Cannot find: ', modules_dir);
      }

      if (fs.existsSync(config_dir)) {
        let mcf;
        try {
          mcf = fs.readFileSync(`${config_dir}/modules.config.js`, { encoding: 'UTF-8' });
          // remove white space
          mcf = mcf.replace(/\s*\/\/.*/g, '');
          // remove comments
          mcf = mcf.replace(/\s/g, '').replace(/'/g, `"`);
          // change quotation marks
          mcf = mcf.replace('core', `"core"`).replace('lite', `"lite"`);
          // extract from the variable definition
          mcf = mcf.match(/=.*;/)[0];
          //cut out the wrapping
          mcf = mcf.substring(1, mcf.length - 1);

          this.module_config = JSON.parse(mcf);
        } catch (err) {
          console.error(err);
          console.log(mcf);
        }
      }
    } else {
      console.warn('no path or filesystem available');
    }

    node_info.module_config = this.module_config;
    node_info.options = this.app.options;

    node_info.databases = [];
    for (let m of this.app.modules.mods) {
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

  writeModuleConfig(config_str) {
    const path = this.app.storage.returnPath();
    const fs = this.app.storage.returnFileSystem();
    if (fs && path) {
      const filename = path.normalize(`${__dirname}/../../config/modules.config.js`);
      let formattedConfig = config_str;

      try {
        const parsedConfig = JSON.parse(config_str);
        formattedConfig = JSON.stringify(parsedConfig, Object.keys(parsedConfig).sort(), 2)
          .replace(`"core"`, 'core')
          .replace(`"lite"`, 'lite');
      } catch (err) {
        console.warn('Failed to parse module config string, writing as-is', err);
      }

      fs.writeFileSync(filename, `module.exports = ${formattedConfig};\n`);
      console.log('Sucessfully wrote new modules.config.js!!!');
    }
  }

  async toggleBlockProduction(setValue) {
    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.server_publickey);
    tx.msg = {
      module: 'Admin',
      request: 'update-options',
      data: {
        consensus: {
          disable_block_production: setValue
        }
      }
    };
    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          salert(res.err);
        } else {
          siteMessage('Node updated');
        }
      },
      this.server_publickey
    );
  }

  updateOptions(options) {
    for (let a in options) {
      if (this.app.options[a]) {
        if (typeof options[a] === 'object') {
          for (let b in options[a]) {
            this.app.options[a][b] = options[a][b];
          }
        } else {
          this.app.options[a] = options[a];
        }
      } else {
        this.app.options[a] = options[a];
      }
    }
    this.app.storage.saveOptions();
    this.writeOptions(options);
  }

  writeOptions(options = {}, insert = false) {
    const path = this.app.storage.returnPath();
    const fs = this.app.storage.returnFileSystem();
    if (fs && path) {
      const config_dir = path.normalize(`${__dirname}/../../config`);
      if (fs.existsSync(config_dir)) {
        let optFile = fs.readFileSync(`${config_dir}/options`, { encoding: 'UTF-8' });

        // Process the file into parsable json
        optFile = optFile.replace(/\s/g, '').replace(/'/g, `"`);
        optFile = JSON.parse(optFile);

        for (let a in options) {
          if (optFile[a] && typeof optFile[a] == 'object') {
            Object.assign(optFile[a], options[a]);
          } else if (insert) {
            optFile[a] = options[a];
          }
        }

        fs.writeFileSync(`${config_dir}/options`, JSON.stringify(optFile, null, 2));
      }
    }
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const webdir = `${__dirname}/web`;
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const admin_self = this;

    const serverFn = async (req, res) => {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
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
