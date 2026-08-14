const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const index = require('./index');
const NFTStudioMain = require('./lib/main');

class NFTStudio extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'NFTStudio';
    this.appname = 'NFT Studio';
    this.slug = 'nftstudio';
    this.description = 'Create, preview, and publish JavaScript and CSS NFTs';
    this.categories = 'Utilities Development NFT';
    this.icon = 'fa-solid fa-code';
    this.styles = ['/nftstudio/style.css'];

    this.header = null;
    this.main = null;
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
      this.main = new NFTStudioMain(this.app, this);
    }

    await this.header.render();
    this.main.render();
  }

  respondTo(type = '', obj = null) {
    if (type === 'saito-nft-create-footer' && ['js', 'css'].includes(obj?.type)) {
      return {
        text: this.appname,
        callback: () => navigateWindow(`/${this.returnSlug()}`)
      };
    }
    return null;
  }

  webServer(app, expressapp, express) {
    const webdir = `${__dirname}/web`;
    const slug = `/${encodeURI(this.returnSlug())}`;
    const mod = this;

    expressapp.use(slug, express.static(webdir));
    expressapp.get(slug, (req, res) => {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(index(app, mod, app.build_number));
    });
  }
}

module.exports = NFTStudio;
