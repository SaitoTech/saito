const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Card = require('./lib/card');
const Main = require('./lib/ui/main');
const HomePage = require('./index');

class TSCardGen extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'TSCardGen';
    this.slug = 'tscardgen';
    this.description = 'Create custom Twilight Struggle event cards in the browser.';
    this.categories = 'Games Utilities';
    this.class = 'utility';
    this.status = 'beta';
    this.icon = 'fa-solid fa-clone';

    this.styles = ['/saito/saito.css', '/tscardgen/style.css'];

    this.card = new Card(app, this);
    this.header = null;
    this.main = null;
  }

  async initialize(app) {
    await super.initialize(app);

    if (this.browser_active) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
    }
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
    }

    if (!this.main) {
      this.main = new Main(this.app, this);
    }

    this.addComponent(this.header);
    await super.render();
    this.main.render();
  }

  webServer(app, expressapp, express) {
    const webdir = `${__dirname}/web`;
    const slug = encodeURI(this.returnSlug());
    const mod_self = this;

    expressapp.get(['/' + slug, '/' + slug + '/'], function (req, res) {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(HomePage(app, mod_self, app.build_number));
    });

    expressapp.use('/' + slug, express.static(webdir));
  }
}

module.exports = TSCardGen;
