const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const ConfigTemplate = require('./lib/config.template.js');
const AdminHome = require('./index');
const jsonTree = require('json-tree-viewer');

class Admin extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Admin';
    this.slug = 'admin';
    this.description = 'Admin module for Saito application management';
    this.categories = 'Admin utilities';
  }

  async initialize(app) {
    await super.initialize(app);
    console.log('initializing admin in saito.js');
  }

  async render() {
    if (!document.querySelector('body')) {
      console.error('No body');
      return;
    }

    console.log('Admin module rendering');

    let error = true;
    if (window.location.protocol == 'https:') {
      error = false;
    }
    if (window.location.host.includes('localhost')) {
      error = false;
    }

    if (error) {
      document.getElementById('page-header').innerHTML = 'Warning!';
      document.querySelector('.more-info').innerHTML =
        'You need to enable SSL in order for the whole Javascript stack to work, though in the meantime you can do local development work.';
      return;
    }

    this.peerKey = document.getElementById('node-publickey').dataset['publickey'];

    if (window.need_to_set_key) {
      this.setAdminKey();
    }
  }

  /**
   *  GUI for setting the administrator key on initial set up of node
   */
  setAdminKey() {
    this.app.browser.addElementToDom(`
      <hr>
      <h2>Set Trusted Admin Key</h2>
      <p>The node does not have an admin. Please enter the public key you will use to act as admin. Every browser that connects to the node will automatically generate one.</p>
      <input type="text" id="admin-public-key" value="${this.publicKey}"/>
      <button id="submit-button" type="submit">Submit and Download Backup</button>`);

    document.getElementById('submit-button').onclick = async (e) => {
      let publicKey = document.getElementById('admin-public-key')?.value;

      console.log(publicKey);
      if (!this.app.crypto.isValidPublicKey(publicKey)) {
        salert('Not a valid Saito public key!');
        return;
      }

      e.currentTarget.onclick = null;

      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.peerKey);
      tx.msg = {
        module: 'Admin',
        request: 'set-admin-key',
        key: publicKey
      };
      await tx.sign();

      this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
        let res = res_tx.returnMessage();
        if (res?.err) {
          salert(res.err);
        } else {
          this.app.wallet.backupWallet();
          siteMessage('admin key successfully set, downloaded copy! reloading page...');
          reloadWindow(3000);
        }
      });
    };
  }

  /**
   * Wait until connected to network to check admin credentials (to return the node info)
   */
  async onPeerHandshakeComplete(app, peer) {
    //
    // we don't care about this if we aren't looking at the admin module
    //
    if (!this.browser_active) {
      return;
    }

    if (app.BROWSER && !window.need_to_set_key) {
      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.peerKey);
      tx.msg = {
        module: 'Admin',
        request: 'validate-admin-key',
        key: this.publicKey
      };
      await tx.sign();

      this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
        let res = res_tx.returnMessage();
        console.log(res);
        if (res?.err) {
          salert(res.err);
        } else {
          document.getElementById('page-header').innerHTML = 'Welcome Back, Saito Admin!';
          this.renderConfig(res);
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
      return;
    }

    if (app.options.admin?.length) {
      let validated = false;
      for (let a of app.options.admin) {
        if (tx.isFrom(a)) {
          validated = true;
        }
      }

      if (!validated) {
        console.error('Unauthorized access!');
        if (mycallback) {
          mycallback({ err: 'Unauthorized access' });
        }

        return;
      }
    }

    let txmsg = tx.returnMessage();

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
    }

    if (txmsg.request == 'validate-admin-key') {
      console.info('ADMIN validate-admin-key');
      mycallback(this.getOptions());
    }

    if (txmsg.request == 'update-modules-config') {
      console.info('ADMIN update-modules-config');
      this.writeModuleConfig(txmsg.config);
    }

    if (txmsg.request == 'update-options') {
      console.info('ADMIN update-options');
      this.updateOptions(txmsg.data);
    }
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
        let mcf = fs.readFileSync(`${config_dir}/modules.config.js`, { encoding: 'UTF-8' });

        // Process the file into parsable json
        mcf = mcf.replace(/\s/g, '').replace(/'/g, `"`);
        mcf = mcf.replace('core', `"core"`).replace('lite', `"lite"`);
        mcf = mcf.match(/=.*;/)[0];
        mcf = mcf.substring(1, mcf.length - 1);

        node_info.module_config = JSON.parse(mcf);
      }
    } else {
      console.warn('no path or filesystem available');
    }

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

  renderConfig(config_obj) {
    if (!document.getElementById('node-config')) {
      this.app.browser.addElementToDom(ConfigTemplate(config_obj));
    } else {
      this.app.browser.replaceElementById(ConfigTemplate(config_obj), 'node-config');
    }

    if (config_obj?.options) {
      try {
        let el = document.getElementById('node-options');
        let optjson = JSON.parse(
          JSON.stringify(
            config_obj.options,
            (key, value) => (typeof value === 'bigint' ? value.toString() : value) // return everything else unchanged
          )
        );
        var tree = jsonTree.create(optjson, el);
      } catch (err) {
        console.log('error creating jsonTree: ' + err);
      }

      // Inject button to toggle block production
      let p_html = '';
      if (config_obj.options.consensus.disable_block_production) {
        p_html = `<button class="block-toggle" id="produce-blocks">Enable block production</button>`;
      } else {
        p_html = `<button class="block-toggle" id="stop-blocks">Disable block production</button>`;
      }

      if (document.querySelector('.block-toggle')) {
        this.app.browser.replaceElementBySelector(p_html, '.block-toggle');
      } else {
        this.app.browser.addElementToSelector(p_html, '.node-info');
      }

      if (document.getElementById('produce-blocks')) {
        document.getElementById('produce-blocks').onclick = (e) => {
          e.currentTarget.remove();
          this.toggleBlockProduction(false);
        };
      }

      if (document.getElementById('stop-blocks')) {
        document.getElementById('stop-blocks').onclick = (e) => {
          e.currentTarget.remove();
          this.toggleBlockProduction(true);
        };
      }
    }

    // Attach events

    if (document.getElementById('modconfig-button')) {
      Array.from(document.querySelectorAll('.mod-config-table input')).forEach((input) => {
        input.onchange = (e) => {
          document.getElementById('modconfig-button').removeAttribute('disabled');
        };
      });

      document.getElementById('modconfig-button').onclick = async (e) => {
        const inputs = document.querySelectorAll('.mod-config-table input');
        let new_mod_config = { lite: [], core: [] };

        Array.from(inputs).forEach((element) => {
          if (element.checked) {
            new_mod_config.lite.push(`${element.name}/${element.name}.js`);
            new_mod_config.core.push(`${element.name}/${element.name}.js`);
          }
        });

        console.log('New config: ');
        console.log(new_mod_config);

        let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.peerKey);
        tx.msg = {
          module: 'Admin',
          request: 'update-modules-config',
          config: JSON.stringify(new_mod_config)
        };
        await tx.sign();

        this.app.network.sendTransactionWithCallback(tx, (res_tx) => {
          let res = res_tx.returnMessage();
          if (res?.err) {
            salert(res.err);
          } else {
            siteMessage('Modules updated');
          }
        });
      };
    }

    if (document.getElementById('show-modules')) {
      document.getElementById('show-modules').onclick = (e) => {
        e.currentTarget.classList.toggle('toggled');
        document.querySelector('.mod-config-table').classList.toggle('minimize');
      };
    }

    if (document.getElementById('show-options')) {
      document.getElementById('show-options').onclick = (e) => {
        e.currentTarget.classList.toggle('toggled');
        document.querySelector('.node-options').classList.toggle('minimize');
      };
    }
  }

  async toggleBlockProduction(setValue) {
    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.peerKey);
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
        let optFile = fs.readFileSync(`${config_dir}/options.conf`, { encoding: 'UTF-8' });

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

        fs.writeFileSync(`${config_dir}/options.conf`, JSON.stringify(optFile, null, 2));
      }
    }
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const webdir = `${__dirname}/web`;
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const admin_self = this;

    const serverFn = async (req, res) => {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
      let html = await AdminHome(app, admin_self, app.build_number);
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
}

module.exports = Admin;
