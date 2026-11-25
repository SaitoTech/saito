const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Transaction = require('../../lib/saito/transaction').default;
const AddAppOverlay = require('./lib/overlay/add-app');
const GenerateAppOverlay = require('./lib/overlay/generate-app');
const DevToolsAdmin = require('./lib/admin/devtools-admin');
const {
  COMPILATION_DISABLED_MESSAGE,
  COMPILATION_UNAVAILABLE_MESSAGE,
  isCompilationEnabled,
  isAllowedModuleSlug,
  compilationDisabledHtml
} = require('./lib/compilation');

class DevTools extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;

    this.name = 'DevTools';
    this.appname = 'DevTools';
    this.slug = 'devtools';
    this.description =
      'Application manages installing, indexing, compiling and serving Saito modules.';
    this.categories = 'Utilities Dev';
    this.featured_apps = [];
    this.header = null;
    this.icon = 'fas fa-window-restore';

    this.bundling_timer = null;
    this.renderMode = 'none';
    this.search_options = {};

    this.styles = ['/saito/saito.css', '/devtools/style.css'];

    this.addAppOverlay = null;
    this.zip_file = null;
    this.title = null;
    this.description = null;
    this.status = 'prod';
    this.class = 'utility';
    this.app_slug = null;
    this.version = null;
    this.publisher = null;
    this.category = null;
    this.img = null;
    this.generate_app = null;
  }

  async initialize(app) {
    await super.initialize(app);
    this.addAppOverlay = new AddAppOverlay(this.app, this);
    this.generateAppOverlay = new GenerateAppOverlay(this.app, this);
  }

  async render() {
    //
    // browsers only!
    //
    if (!this.app.BROWSER) {
      return;
    }

    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);

    this.addComponent(this.header);

    await super.render();
    const drop = document.getElementById('appstore-zip-upload');
    if (drop) {
      drop.setAttribute('data-devtools-compile-slot', '');
      drop.textContent = 'Checking whether this server can compile applications…';
    }
    this.attachInstallEvents(document);
    await this.syncCompilationInterface(document);
  }

  async initializeHTML(app) {
    await super.initializeHTML(app);

    if (this.header == null) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
    }
    await this.header.render(app, this);
    this.header.attachEvents(app, this);
  }

  respondTo(type) {
    if (type === 'saito-header') {
      // Browser installation is offered from other modules. Compilation is not
      // implied by that entry point.
    }

    if (type === 'admin-config') {
      if (this.app.BROWSER) {
        return null;
      }
      return {
        id: this.returnSlug(),
        name: this.name,
        getConfig: async () => this.compilationConfig(),
        updateConfig: async (data = {}) => this.updateCompilationConfig(data)
      };
    }

    if (type === 'admin-sidebar') {
      if (!this.app.BROWSER) {
        return null;
      }
      return {
        id: this.returnSlug(),
        name: this.name,
        render: () => {
          if (!this.admin_ui) {
            this.admin_ui = new DevToolsAdmin(this.app, this);
          }
          this.admin_ui.render();
        }
      };
    }

    return null;
  }

  serverCompilationEnabled() {
    return isCompilationEnabled(this.app?.options);
  }

  compilationConfig() {
    return { compilation_enabled: this.serverCompilationEnabled() };
  }

  updateCompilationConfig(data = {}) {
    if (this.app.BROWSER) {
      throw new Error('Server compilation settings cannot be changed from the browser.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('compilation_enabled must be a boolean.');
    }
    const keys = Object.keys(data);
    if (
      keys.length !== 1 ||
      keys[0] !== 'compilation_enabled' ||
      typeof data.compilation_enabled !== 'boolean'
    ) {
      throw new Error('compilation_enabled must be a boolean.');
    }

    if (!this.app.options || typeof this.app.options !== 'object') {
      this.app.options = {};
    }
    if (
      !this.app.options.devtools ||
      typeof this.app.options.devtools !== 'object' ||
      Array.isArray(this.app.options.devtools)
    ) {
      this.app.options.devtools = {};
    }
    this.app.options.devtools.compilation_enabled = data.compilation_enabled;
    if (this.app.storage?.saveOptions) {
      this.app.storage.saveOptions();
    }
    return this.compilationConfig();
  }

  compilationRefusal() {
    if (!this.serverCompilationEnabled()) {
      return COMPILATION_DISABLED_MESSAGE;
    }
    return null;
  }

  answerPeer(mycallback, payload) {
    try {
      if (typeof mycallback === 'function') {
        mycallback(payload);
      }
    } catch (err) {
      console.error('DevTools peer callback failed:', err);
    }
    return 1;
  }

  async sendSubmitModuleTransaction(zip, slug, callback) {
    let peers = await this.app.network.getPeers();
    if (peers.length == 0) {
      console.warn('No peers');
      return;
    }

    let msg = {
      module: 'AppStore',
      request: 'submit module',
      module_zip: zip,
      slug: slug
    };

    console.log('zip_file trans', zip);

    this.app.network.sendRequestAsTransaction(
      'submit module',
      msg,
      (res) => {
        console.log('appstore callback: ' + res);
        return callback(res);
      },
      peers[0].publicKey
    );
  }

  async sendModuleDetailsTransaction(zip, callback) {
    let peers = await this.app.network.getPeers();
    if (peers.length == 0) {
      console.warn('No peers');
      return;
    }

    let msg = {
      module: 'AppStore',
      request: 'get module details',
      module_zip: zip
    };

    this.app.network.sendRequestAsTransaction(
      'get module details',
      msg,
      (res) => {
        console.log('appstore callback: ' + res);
        return callback(res);
      },
      peers[0].publicKey
    );
  }

  async requestCompilationStatus() {
    const peers = await this.app.network.getPeers();
    if (!peers || peers.length === 0) {
      throw new Error('No peers');
    }

    return new Promise((resolve, reject) => {
      this.app.network.sendRequestAsTransaction(
        'compilation status',
        { module: 'DevTools', request: 'compilation status' },
        (res) => {
          if (!res || res.err || res.error || typeof res.compilation_enabled !== 'boolean') {
            reject(new Error(res?.err || res?.error || COMPILATION_UNAVAILABLE_MESSAGE));
            return;
          }
          resolve({
            compilation_enabled: res.compilation_enabled === true
          });
        },
        peers[0].publicKey
      );
    });
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }

    let txmsg;
    try {
      txmsg = tx.returnMessage();
    } catch (err) {
      return 0;
    }

    if (!txmsg?.request) {
      return 0;
    }

    const compilationRequest =
      txmsg.request === 'compilation status' ||
      txmsg.request === 'submit module' ||
      txmsg.request === 'get module details';

    if (!compilationRequest) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    if (this.app.BROWSER) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    if (txmsg.request === 'compilation status') {
      return this.answerPeer(mycallback, {
        compilation_enabled: this.serverCompilationEnabled()
      });
    }

    const refusal = this.compilationRefusal();
    if (refusal) {
      return this.answerPeer(mycallback, { error: refusal });
    }

    const data = txmsg.data || {};
    try {
      if (txmsg.request === 'submit module') {
        await this.createAppBinary(data.module_zip, data.slug, mycallback);
      } else {
        await this.getNameAndDescriptionFromZip(data.module_zip, mycallback);
      }
    } catch (err) {
      console.error('DevTools compilation failed:', err);
    }
    return 1;
  }

  clear() {
    this.zip_file = null;
    this.title = null;
    this.description = null;
    this.app_slug = null;
    this.version = null;
    this.publisher = null;
    this.category = null;
    this.img = null;
  }

  attachInstallEvents(root = document) {
    if (!this.app.BROWSER || !root?.querySelector) {
      return;
    }
    const install = root.querySelector('[data-devtools-install], #install');
    if (!install || install.dataset.devtoolsInstallBound === '1') {
      return;
    }
    install.dataset.devtoolsInstallBound = '1';
    install.onclick = () => {
      this.app.connection.emit('saito-app-app-render-request');
    };
  }

  attachCompilationEvents(root = document) {
    if (!this.app.BROWSER || !root?.querySelector) {
      return;
    }
    const drop = root.querySelector('[data-devtools-compile-slot]');
    if (!drop || drop.dataset.devtoolsCompileBound === '1' || !drop.id) {
      return;
    }
    if (!this.app.browser?.addDragAndDropFileUploadToElement) {
      return;
    }

    drop.dataset.devtoolsCompileBound = '1';
    const this_self = this;
    try {
      this.app.browser.addDragAndDropFileUploadToElement(
        drop.id,
        async (filesrc) => {
          if (drop.dataset.devtoolsCompileBound !== '1' || !drop.isConnected) {
            return;
          }
          this_self.clear();

          let startPoint = String(filesrc || '').indexOf('base64');
          if (startPoint < 0) {
            salert('File not base64 zipped');
            return;
          }
          this_self.zip_file = filesrc.substring(startPoint + 7);

          await this_self.sendModuleDetailsTransaction(this_self.zip_file, async function (res) {
            if (res?.error || res?.err) {
              salert(res.error || res.err);
              return;
            }
            if (!res || res.slug == '') {
              salert('Error: Application missing slug');
              return;
            }

            this_self.generateAppOverlay.mod_details = res;
            this_self.generateAppOverlay.mod_details.publisher = this_self.publicKey;
            this_self.generateAppOverlay.zip_file = this_self.zip_file;
            this_self.generateAppOverlay.render();
          });
        },
        true,
        false,
        false
      );
    } catch (err) {
      drop.dataset.devtoolsCompileBound = '';
      console.error('Error: ', err);
      salert('An error occurred while compiling application. Check console for details.');
    }
  }

  replaceCompilationSlot(drop, messageHtml) {
    if (!drop?.parentNode) {
      return;
    }
    const note = document.createElement('div');
    note.className = 'devtools-compilation-notice';
    note.innerHTML = messageHtml;
    drop.replaceWith(note);
  }

  setCompilationGuide(root, visible) {
    if (!root?.querySelectorAll) {
      return;
    }
    root.querySelectorAll('.how-to').forEach((guide) => {
      guide.hidden = !visible;
      guide.style.display = visible ? '' : 'none';
    });
  }

  async syncCompilationInterface(root = document) {
    if (!this.app.BROWSER || !root?.querySelector) {
      return;
    }
    const drop = root.querySelector('[data-devtools-compile-slot]');
    if (!drop) {
      return;
    }

    let status = null;
    try {
      status = await this.requestCompilationStatus();
    } catch (err) {
      status = null;
    }

    if (!drop.isConnected) {
      return;
    }
    const supported = status?.compilation_enabled === true;
    this.setCompilationGuide(root, supported);
    if (!status || typeof status.compilation_enabled !== 'boolean') {
      this.replaceCompilationSlot(drop, COMPILATION_UNAVAILABLE_MESSAGE);
      return;
    }
    if (status.compilation_enabled !== true) {
      this.replaceCompilationSlot(drop, compilationDisabledHtml());
      return;
    }

    drop.textContent = 'drag-and-drop module zip file';
    this.attachCompilationEvents(root);
  }

  async createAppBinary(zip_bin, slug, mycallback) {
    if (!this.serverCompilationEnabled()) {
      if (mycallback) mycallback({ error: COMPILATION_DISABLED_MESSAGE });
      return;
    }
    if (!isAllowedModuleSlug(slug)) {
      if (mycallback) mycallback({ error: 'Invalid application slug.' });
      return;
    }

    const path = require('path');
    const { execSync } = require('child_process');
    const projectRoot = path.join(__dirname, '../..');
    const zipDir = path.join(projectRoot, 'dist', 'mods', 'zip');
    const saitoDir = path.join(projectRoot, 'dist', 'mods', 'saito');
    try {
      const fs = this.app.storage.returnFileSystem();
      if (!fs.existsSync(zipDir)) {
        fs.mkdirSync(zipDir, { recursive: true });
      }
      const tempZipPath = path.join(zipDir, `.tmp_${slug}.zip`);
      const zipBin2 = Buffer.from(zip_bin, 'base64').toString('binary');
      fs.writeFileSync(tempZipPath, zipBin2, { encoding: 'binary' });
      try {
        const output = execSync(`node scripts/dynmods/compile.js --zip "${tempZipPath}" --slug "${slug}"`, {
          cwd: projectRoot,
          encoding: 'utf8',
          stdio: 'pipe',
          maxBuffer: 10 * 1024 * 1024
        });
        const reported = String(output || '').match(/OK -> (.+\.saito)\s*$/m);
        let saitoPath = path.join(saitoDir, `${slug}.saito`);
        if (reported) {
          const written = reported[1].trim();
          saitoPath = path.isAbsolute(written) ? written : path.join(projectRoot, written);
        }
        if (!fs.existsSync(saitoPath)) {
          const message = `Compiled module was not written to ${saitoPath}`;
          console.log('Error in Appstore createAppBinary:', message);
          if (mycallback) mycallback({ error: message });
          return;
        }
        const content = fs.readFileSync(saitoPath, 'utf8');
        const webObj = JSON.parse(content);
        const msgStr = Buffer.from(webObj.m, 'base64').toString('utf8');
        const msgObj = JSON.parse(msgStr);
        const DYN_MOD_WEB = msgObj.bin;
        if (mycallback) return mycallback({ DYN_MOD_WEB });
      } finally {
        try {
          fs.unlinkSync(tempZipPath);
        } catch (e) {}
      }
    } catch (err) {
      const message = err?.stderr ? String(err.stderr) : (err?.message || String(err));
      console.log('Error in Appstore createAppBinary:', message.trim());
      if (mycallback) mycallback({ error: message.trim() });
    }
  }

  async getAppPath(directory, slug) {
    //console.log("getAppPath ////", directory, slug);
    try {
      let app_path = `${slug}.js`;
      let promises = directory.files.map(async (file) => {
        let file_path = file.path;
        if (file_path == `${slug}/${slug}/`) {
          app_path = `${slug}/${slug}/${slug}.js`;
          return;
        } else if (file_path == `${slug}/`) {
          app_path = `${slug}/${slug}.js`;
          return;
        }
      });

      await Promise.all(promises);

      return app_path;
    } catch (err) {
      console.log('ERROR getAppPath: ' + err);
    }
  }

  async getNameAndDescriptionFromZip(zip_bin, mycallback) {
    if (!this.serverCompilationEnabled()) {
      if (mycallback) mycallback({ error: COMPILATION_DISABLED_MESSAGE });
      return;
    }

    try {
      const fs = this.app.storage.returnFileSystem();
      const path = require('path');
      const unzipper = require('unzipper');
      let zip_path = `app.zip`;

      // console.log('zip_bin:',zip_bin);
      console.log('zip_path:', zip_path);
      // return;
      //
      // convert base64 to vinary
      //
      let zip_bin2 = Buffer.from(zip_bin, 'base64').toString('binary');

      fs.writeFileSync(path.resolve(__dirname, zip_path), zip_bin2, {
        encoding: 'binary'
      });

      let name = 'Unknown Module';
      let image = '';
      let description = 'unknown';
      let categories = 'unknown';
      let slug = '';
      let version = '1.0.0';

      try {
        const directory = await unzipper.Open.file(path.resolve(__dirname, zip_path));
        let promises = directory.files.map(async (file) => {
          console.log('file: ', file);
          // return;

          if (file.path === 'web/img/arcade/arcade.jpg') {
            let content = await file.buffer();
            image = 'data:image/jpeg;base64,' + content.toString('base64');
          }
          if (file.path === 'web/img/saito_icon.jpg') {
            let content = await file.buffer();
            image = 'data:image/jpeg;base64,' + content.toString('base64');
          }

          if (file.path.substr(0, 3) == 'lib') {
            return;
          }
          if (file.path.substr(-2) !== 'js') {
            return;
          }
          //if (file.path.substr(2).indexOf("/") > -1) { return; }
          if (file.path.indexOf('web/') > -1) {
            return;
          }
          if (file.path.indexOf('src/') > -1) {
            return;
          }
          if (file.path.indexOf('www/') > -1) {
            return;
          }
          if (file.path.indexOf('lib/') > -1) {
            return;
          }
          if (file.path.indexOf('license/') > -1) {
            return;
          }
          if (file.path.indexOf('docs/') > -1) {
            return;
          }
          if (file.path.indexOf('sql/') > -1) {
            return;
          }

          let content = await file.buffer();
          let zip_text = content.toString('utf-8');
          let zip_lines = zip_text.split('\n');

          let found_name = 0;
          let found_description = 0;
          let found_categories = 0;
          let found_slug = 0;

          for (
            let i = 0;
            i < zip_lines.length &&
            i < 100 &&
            (found_name == 0 || found_description == 0 || found_categories == 0);
            i++
          ) {
            //
            // get name
            //
            if (/this.name/.test(zip_lines[i]) && found_name == 0) {
              found_name = 1;
              if (zip_lines[i].indexOf('=') > 0) {
                name = zip_lines[i].substring(zip_lines[i].indexOf('='));
                name = cleanString(name);
                name = name.replace(/^\s+|\s+$/gm, '');
                if (name.length > 50) {
                  name = 'Unknown';
                  found_name = 0;
                }
                if (name === 'name') {
                  name = 'Unknown';
                  found_name = 0;
                }
              }
            }

            //
            // get description
            //
            if (/this.description/.test(zip_lines[i]) && found_description == 0) {
              found_description = 1;
              if (zip_lines[i].indexOf('=') > 0) {
                description = zip_lines[i].substring(zip_lines[i].indexOf('='));
                description = cleanString(description);
                description = description.replace(/^\s+|\s+$/gm, '');
              }
            }

            //
            // get categories
            //
            if (/this.categories/.test(zip_lines[i]) && found_categories == 0) {
              found_categories = 1;
              if (zip_lines[i].indexOf('=') > 0) {
                categories = zip_lines[i].substring(zip_lines[i].indexOf('='));
                categories = cleanString(categories);
                categories = categories.replace(/^\s+|\s+$/gm, '');
              }
            }

            //
            // get slug
            //
            if (/this.slug/.test(zip_lines[i]) && found_slug == 0) {
              found_slug = 1;
              if (zip_lines[i].indexOf('=') > 0) {
                slug = zip_lines[i].substring(zip_lines[i].indexOf('='));
                slug = cleanString(slug);
                slug = slug.replace(/^\s+|\s+$/gm, '');
              }
            }
          }

          function cleanString(str) {
            str = str.replace(/^\s+|\s+$/gm, '');
            str = str.substring(1, str.length - 1);
            return [...str]
              .map((char) => {
                if (char == ' ') {
                  return ' ';
                }
                if (char == '.') {
                  return '.';
                }
                if (char == ',') {
                  return ',';
                }
                if (char == '!') {
                  return '!';
                }
                if (char == '`') {
                  return '';
                }
                if (char == '\\' || char == "'" || char == '"' || char == ';') {
                  return '';
                }
                if (!/[a-zA-Z0-9_-]/.test(char)) {
                  return '';
                }
                return char;
              })
              .join('');
          }
        });
        await Promise.all(promises);
      } catch (err) {
        console.log('ERROR UNZIPPING: ' + err);
      }

      //
      // delete unziped module
      try {
        await fs.unlink(path.resolve(__dirname, zip_path));
      } catch (error) {
        console.error(error);
      }

      if (mycallback) {
        return mycallback({ name, image, description, categories, slug, version });
      }
    } catch (err) {
      console.log('Error in Appstore getNameAndDescriptionFromZip:', err);
    }
  }

  download(content, fileName, contentType, callback) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();

    if (callback) {
      return callback();
    }
  }
}

module.exports = DevTools;
