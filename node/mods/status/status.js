const ModTemplate = require('../../lib/templates/modtemplate');
const statusIndex = require('./index');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const NodeCardManager = require('./lib/node-card-manager');
const StatusHeader = require('./lib/status-header');

class Status extends ModTemplate {
  constructor(app) {
    super(app);
    this.name = 'status';
    this.slug = 'status';
    this.description = 'Node + Peer Status Dashboard';
    this.categories = 'Utilities Dev';

    this.styles = ['/settings/style.css', '/saito/lib/jsonTree/jsonTree.css'];

    this.cardManager = new NodeCardManager(app, this, '#status-container');
    this.statusHeader = new StatusHeader(app, this, '.status-header');
  }

  async initialize(app) {
    await super.initialize(app);
  }

  async render() {
    if (!this.app.BROWSER) {
      return;
    }

    this.addComponent(this.statusHeader);
    await super.render();
    this.attachEvents();
  }

  attachEvents() {
    if (!this.browser_active) {
      return;
    }
  }

  async onPeerHandshakeComplete(app, peer) {
    if (app.BROWSER == 1 && this.browser_active == 1) {
      console.log('onPeerHandshakeComplete peer:', peer);
      await this.cardManager.render();
    }
  }

  webServer(app, expressApp, express) {
    const slug = this.returnSlug();
    const webDir = `${__dirname}/web`;

    expressApp.get(`/${encodeURI(slug)}`, async (req, res) => {
      res.type('html').charset = 'UTF-8';
      res.send(statusIndex(app, this));
    });

    expressApp.use(`/${encodeURI(slug)}`, express.static(webDir));
  }
}

module.exports = Status;
