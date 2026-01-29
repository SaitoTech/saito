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

    this.server_publickey = null;
    this.server_info = null;

  }

  async initialize(app) {

    await super.initialize(app);

    this.main = new AdminMain(app, this);

  }

  async render() {

/****
    console.log('Admin module rendering');

    let error = true;
    if (window.location.protocol == 'https:') {
      error = false;
    }
    if (window.location.host.includes('localhost')) {
      error = false;
    }

    if (error) {
      this.main.render();
      this.main.updateHeader('Warning!');
      this.main.updateInfo('You need to enable SSL in order for the whole Javascript stack to work, though in the meantime you can do local development work.');
      return;
    }
****/

    this.server_publickey = server_publickey;
    this.main.render();


  }



  async onPeerHandshakeComplete(app, peer) {

    if (!this.browser_active) {
      return;
    }

    if (app.BROWSER && !need_to_set_key) {

      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.server_publickey);
      tx.msg = {
        module: 'Admin',
        request: 'validate-admin-key',
        key: this.publicKey
      };
      await tx.sign();

      await this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
        let res = res_tx.returnMessage();
        if (this.res?.err) {
          salert(res.err);
        } else {
	  this.server_info = res;
console.log("SERVER INFO: " + JSON.stringify(this.server_info));
	  this.main.render();
        }
      });
    }
  }

  /**
   * Admin communicates to the node through off-chain transactions
   */
  async handlePeerTransaction(app, tx = null, peer, mycallback) {

    if (this.app.BROWSER) {
      return;
    }

    if (!tx.isTo(this.publicKey)) {
console.log("ADMIN: received tx but not to us");
console.log(JSON.stringify(tx.returnMessage()));
      return;
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

    const accepted_requests = ['set-admin-key', 'validate-admin-key', 'update-options'];

    if (accepted_requests.includes(txmsg.request)) {
      if (!validated) {
        console.error('Unauthorized access!');
        if (mycallback) {
          mycallback({ err: 'Unauthorized access' });
        }
        return;
      }
    }

    if (txmsg.request == 'set-admin-key') {

console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^ setting admin key!");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");
console.log("^^^^");

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
        try {
          let mcf = fs.readFileSync(`${config_dir}/modules.config.js`, { encoding: 'UTF-8' });

          ///////
          // Process the file into parsable json
          //
          // remove white space
          // remove comments
          mcf = mcf.replace(/\s*\/\/.*/g, '');
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

    this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
      let res = res_tx.returnMessage();
      if (res?.err) {
        salert(res.err);
      } else {
        siteMessage('Node updated');
      }
    });
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
        console.error(`${a} does not exist in options`);
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
      "admin",
      "arcade",
      "archive",
      "blog",
      "chat",
      "chess",
      "crypto",
      "devtools",
      "encrypt",
      "disburse"
    ];
  }

}

module.exports = Admin;
