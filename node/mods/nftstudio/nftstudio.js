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
    this.description = 'Create, preview, and publish JavaScript and CSS NFTs on Saito with NFT Studio, your browser-based code editor.';
    this.categories = 'Utilities Development NFT';
    this.status = 'beta';
    this.class = 'utility';
    this.icon = 'fa-solid fa-code';
    this.styles = ['/nftstudio/style.css'];
    this.social = this.buildSocial({
      twitter: '@SaitoOfficial',
      title: 'NFT Studio | Saito',
      description: this.description,
      url: '/nftstudio/',
      image: '/nftstudio/img/nftstudio-og.png',
      image_alt: 'Saito NFT Studio — create, preview, and publish JavaScript and CSS NFTs, illustrated with code panels and orange generative artwork.'
    });

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
      const origin = mod.returnServerOrigin() || `${req.protocol}://${req.get('host')}`;
      const social = {
        ...mod.social,
        url: new URL(`${slug}/`, origin).href,
        image: new URL(mod.social.image, origin).href
      };
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(index(app, mod, app.build_number, social));
    });
  }
}

module.exports = NFTStudio;
